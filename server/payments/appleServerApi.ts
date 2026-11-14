/**
 * App Store Server API (compliance switches 2026-11-14, audit A5): only "Send Consumption Information"
 * (`PUT /inApps/v1/transactions/consumption/{transactionId}`), the answer to a CONSUMPTION_REQUEST
 * notification. Node crypto only; the request is signed with an App Store Connect in-app purchase key
 * (ES256 JWT: `iss` issuer id, `kid` key id, `aud` "appstoreconnect-v1", `bid` bundle id, at most 60 min).
 *
 * Field names and value ranges follow Apple's ConsumptionRequest (v1) documentation as known when this
 * was written; Apple also documents a newer v2 request. [recheck] against the current documentation before
 * switching APPLE_CONSUMPTION_RESPONSE on (docs/SHIPPING.md). Not tried against Apple's sandbox here.
 */
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import type { Fetch } from './google';

const APPLE_API_PRODUCTION = 'https://api.storekit.itunes.apple.com';
const APPLE_API_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

/** Apple's ConsumptionRequest (v1). Ranged fields are Apple's buckets (`tenureBucket`, `playTimeBucket`, `dollarsBucket`). */
export interface ConsumptionRequest {
  /** Must be true: Apple accepts the data only with the customer's consent. */
  customerConsented: true;
  /** 0 undeclared, 1 not consumed, 2 partially consumed, 3 fully consumed. */
  consumptionStatus: 0 | 1 | 2 | 3;
  /** 0 undeclared, 1 Apple platform, 2 non-Apple platform. */
  platform: 0 | 1 | 2;
  sampleContentProvided: boolean;
  /** 0 delivered and working; 1-5 delivery problems. */
  deliveryStatus: 0 | 1 | 2 | 3 | 4 | 5;
  /** The purchase's appAccountToken (our purchase intent), or an empty string. */
  appAccountToken: string;
  accountTenure: number;
  playTime: number;
  lifetimeDollarsRefunded: number;
  lifetimeDollarsPurchased: number;
  /** 0 undeclared, 1 active, 2 suspended, 3 terminated, 4 limited access. */
  userStatus: 0 | 1 | 2 | 3 | 4;
  /** 0 undeclared, 1 grant, 2 decline, 3 no preference. The game never asks Apple to decline. */
  refundPreference: 0 | 1 | 2 | 3;
}

/** Apple's account-tenure buckets: 0 undeclared, 1: 0-3 days, 2: 3-10, 3: 10-30, 4: 30-90, 5: 90-180, 6: 180-365, 7: over 365. */
export function tenureBucket(days: number): number {
  if (!Number.isFinite(days) || days < 0) return 0;
  const edges = [3, 10, 30, 90, 180, 365];
  const i = edges.findIndex((e) => days < e);
  return i === -1 ? 7 : i + 1;
}

/** Apple's play-time buckets: 0 undeclared, 1: 0-5 min, 2: 5-60 min, 3: 1-6 h, 4: 6-24 h, 5: 1-4 days, 6: 4-16 days, 7: over 16 days. */
export function playTimeBucket(minutes: number | null): number {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return 0;
  const edges = [5, 60, 360, 1440, 5760, 23040];
  const i = edges.findIndex((e) => minutes < e);
  return i === -1 ? 7 : i + 1;
}

/** Apple's lifetime-dollars buckets: 0 undeclared, 1: $0, 2: $0.01-49.99, 3: 50-99.99, 4: 100-499.99, 5: 500-999.99, 6: 1000-1999.99, 7: over 2000. */
export function dollarsBucket(cents: number): number {
  if (!Number.isFinite(cents) || cents < 0) return 0;
  if (cents === 0) return 1;
  const edges = [5000, 10000, 50000, 100000, 200000];
  const i = edges.findIndex((e) => cents < e);
  return i === -1 ? 7 : i + 2;
}

export interface AppleServerApiOptions {
  keyId: string;
  issuerId: string;
  /** The .p8 private key (PEM). */
  privateKey: string;
  bundleId: string;
  fetch: Fetch;
  now: () => number;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export class AppleServerApi {
  private readonly key: KeyObject;

  constructor(private readonly o: AppleServerApiOptions) {
    this.key = createPrivateKey(o.privateKey);
  }

  /** The bearer token: an ES256 JWT valid for 5 minutes. */
  token(): string {
    const iat = Math.floor(this.o.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'ES256', kid: this.o.keyId, typ: 'JWT' }));
    const body = b64url(JSON.stringify({ iss: this.o.issuerId, iat, exp: iat + 300, aud: 'appstoreconnect-v1', bid: this.o.bundleId }));
    const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: this.key, dsaEncoding: 'ieee-p1363' });
    return `${head}.${body}.${b64url(sig)}`;
  }

  /** Send Consumption Information; `environment` is the notification's ('Sandbox' goes to the sandbox host). Throws on a refusal. */
  async sendConsumption(transactionId: string, body: ConsumptionRequest, environment: string): Promise<void> {
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(transactionId)) throw new Error('Unreadable App Store transaction id.');
    const host = environment === 'Production' ? APPLE_API_PRODUCTION : APPLE_API_SANDBOX;
    const res = await this.o.fetch(`${host}/inApps/v1/transactions/consumption/${transactionId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${this.token()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Apple answers 202 Accepted.
    if (!res.ok) throw new Error(`App Store Server API refused the consumption information (${res.status}).`);
  }
}

/** From the environment: APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY and the first APPLE_BUNDLE_IDS entry; null when any is missing. */
export function appleServerApiFromEnv(env: Record<string, string | undefined>, fetch: Fetch, now: () => number): AppleServerApi | null {
  const bundle = (env.APPLE_BUNDLE_IDS ?? env.GAMECENTER_BUNDLE_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  if (!env.APPLE_IAP_KEY_ID || !env.APPLE_IAP_ISSUER_ID || !env.APPLE_IAP_PRIVATE_KEY || !bundle) return null;
  return new AppleServerApi({ keyId: env.APPLE_IAP_KEY_ID, issuerId: env.APPLE_IAP_ISSUER_ID, privateKey: env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g, '\n'), bundleId: bundle, fetch, now });
}
