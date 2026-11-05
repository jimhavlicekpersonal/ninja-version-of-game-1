/**
 * Google Play purchases (roadmap step 36), with node:crypto only.
 *
 * The game sends the purchase token Play Billing gave it. The server asks the
 * Google Play Developer API (androidpublisher v3) about it with a service
 * account (an OAuth token from a signed JWT), checks it is purchased and for
 * our package, then consumes it (every product is a consumable; the game
 * keeps track of the season pass itself). Refunds and chargebacks arrive two
 * ways: Real-time Developer Notifications (Pub/Sub push, checked with its
 * OIDC token) and the Voided Purchases API, read hourly as a safety net.
 *
 * Configuration (server env): GOOGLE_PLAY_PACKAGE (the app id),
 * GOOGLE_SERVICE_ACCOUNT_JSON (the key file's JSON, linked in the Play Console),
 * GOOGLE_RTDN_AUDIENCE + GOOGLE_RTDN_SERVICE_ACCOUNT (the Pub/Sub push
 * subscription's OIDC audience and service account).
 */
import { createHash, createSign } from 'node:crypto';
import { JwtVerifier } from '../identity/verify';
import { PurchaseError } from './apple';

export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const enc = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** OAuth access tokens for a service account (JWT bearer grant), cached until a minute before they expire. */
export class ServiceAccountAuth {
  private cached: { token: string; until: number } | null = null;
  constructor(
    private readonly account: ServiceAccount,
    private readonly scope: string,
    private readonly fetch: Fetch,
    private readonly now: () => number,
  ) {}

  async token(): Promise<string> {
    if (this.cached && this.cached.until > this.now()) return this.cached.token;
    const aud = this.account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const iat = Math.floor(this.now() / 1000);
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: this.account.client_email, scope: this.scope, aud, iat, exp: iat + 3600 })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.account.private_key).toString('base64url');
    const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }).toString();
    const res = await this.fetch(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new Error(`Google refused the service account (${res.status}).`);
    const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in?: number };
    this.cached = { token: access_token, until: this.now() + Math.max(60, (expires_in ?? 3600) - 60) * 1000 };
    return access_token;
  }
}

export interface GooglePurchase {
  /** The order id (GPA.…), or a hash of the token for purchases without one. */
  transactionId: string;
  purchaseToken: string;
  productId: string;
  purchaseTime: number;
  /** 'Production', or 'Test' for license testers. */
  environment: string;
  /** What the game passed as `obfuscatedAccountId`: our purchase intent. */
  accountToken: string | null;
  consumed: boolean;
  /** Billing country (ISO 3166-1 alpha-2) when Google sends it. */
  regionCode: string | null;
}

export interface VoidedPurchase {
  purchaseToken: string;
  orderId: string | null;
  voidedAt: number;
}

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** A stable transaction id for a purchase token when Google gave no order id. */
export const tokenId = (token: string) => `token-${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;

export class GoogleVerifier {
  private readonly auth: ServiceAccountAuth;
  private readonly rtdn: JwtVerifier | null;

  constructor(
    private readonly o: {
      packageName: string;
      account: ServiceAccount;
      fetch: Fetch;
      now: () => number;
      /** Accept license-tester purchases (staging; App Review does not apply on Play). */
      allowTest?: boolean;
      rtdn?: { audience: string; serviceAccount: string } | null;
    },
  ) {
    this.auth = new ServiceAccountAuth(o.account, 'https://www.googleapis.com/auth/androidpublisher', o.fetch, o.now);
    this.rtdn = o.rtdn ? new JwtVerifier({ jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'], audiences: [o.rtdn.audience], fetch: o.fetch as never, now: o.now }) : null;
  }

  private url(productId: string, token: string, action = ''): string {
    return `${API}/${encodeURIComponent(this.o.packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}${action}`;
  }

  private async call(url: string, method = 'GET'): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const res = await this.o.fetch(url, { method, headers: { authorization: `Bearer ${await this.auth.token()}` } });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }
    return { ok: res.ok, status: res.status, body };
  }

  /** Ask Google about a purchase token (throws PurchaseError when it is not a finished purchase of ours). */
  async purchase(productId: string, token: unknown): Promise<GooglePurchase> {
    if (typeof token !== 'string' || token.length < 10 || token.length > 4096) throw new PurchaseError('Not a Google Play purchase.');
    const r = await this.call(this.url(productId, token));
    if (r.status === 404 || r.status === 400 || r.status === 410) throw new PurchaseError('Google Play does not know this purchase.');
    if (!r.ok) throw new Error(`Google Play did not answer (${r.status}).`);
    const p = r.body;
    if (Number(p.purchaseState ?? 0) === 1) throw new PurchaseError('This purchase was cancelled.');
    if (Number(p.purchaseState ?? 0) === 2) throw new PurchaseError('This purchase is still waiting for payment.');
    const test = Number(p.purchaseType) === 0;
    if (test && !this.o.allowTest) throw new PurchaseError('Test purchases are not accepted here.');
    return {
      transactionId: typeof p.orderId === 'string' && p.orderId ? p.orderId : tokenId(token),
      purchaseToken: token,
      productId,
      purchaseTime: Number(p.purchaseTimeMillis) || 0,
      environment: test ? 'Test' : 'Production',
      accountToken: typeof p.obfuscatedExternalAccountId === 'string' && p.obfuscatedExternalAccountId ? p.obfuscatedExternalAccountId.toLowerCase() : null,
      consumed: Number(p.consumptionState ?? 0) === 1,
      regionCode: typeof p.regionCode === 'string' ? p.regionCode : null,
    };
  }

  /** Consume it once credited, so it can be bought again (and is not refunded after three days unacknowledged). */
  async consume(productId: string, token: string): Promise<void> {
    const r = await this.call(this.url(productId, token, ':consume'), 'POST');
    if (!r.ok && r.status !== 400) throw new Error(`Google Play did not consume the purchase (${r.status}).`);
  }

  /** Refunded, charged back or cancelled purchases since `since` (the Voided Purchases API). */
  async voided(since: number): Promise<VoidedPurchase[]> {
    const out: VoidedPurchase[] = [];
    let page: string | undefined;
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ startTime: String(Math.floor(since)), maxResults: '1000', type: '0' });
      if (page) q.set('token', page);
      const r = await this.call(`${API}/${encodeURIComponent(this.o.packageName)}/purchases/voidedpurchases?${q}`);
      if (!r.ok) throw new Error(`Google Play did not list voided purchases (${r.status}).`);
      for (const v of (r.body.voidedPurchases ?? []) as Record<string, unknown>[]) {
        out.push({ purchaseToken: String(v.purchaseToken), orderId: v.orderId ? String(v.orderId) : null, voidedAt: Number(v.voidedTimeMillis) || this.o.now() });
      }
      page = (r.body.tokenPagination as { nextPageToken?: string } | undefined)?.nextPageToken;
      if (!page) break;
    }
    return out;
  }

  /**
   * A Real-time Developer Notification pushed by Pub/Sub: check its OIDC token,
   * then read the message. Returns the voided purchase it reports, or null for
   * anything else (purchases are credited when the game sends them).
   */
  async notification(authorization: string | undefined, body: unknown): Promise<{ voided: VoidedPurchase | null; test: boolean }> {
    if (!this.rtdn || !this.o.rtdn) throw new PurchaseError('Google Play notifications are not set up on this server.');
    const token = (authorization ?? '').replace(/^Bearer\s+/i, '');
    let claims: Record<string, unknown>;
    try {
      claims = await this.rtdn.verify(token);
    } catch {
      throw new PurchaseError('The notification is not from Google.');
    }
    if (claims.email !== this.o.rtdn.serviceAccount || claims.email_verified !== true) throw new PurchaseError('The notification is not from our Pub/Sub subscription.');
    const data = (body as { message?: { data?: string } } | null)?.message?.data;
    if (typeof data !== 'string') throw new PurchaseError('Empty notification.');
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    } catch {
      throw new PurchaseError('Unreadable notification.');
    }
    if (msg.packageName !== this.o.packageName) throw new PurchaseError('The notification is for another app.');
    const v = msg.voidedPurchaseNotification as { purchaseToken?: string; orderId?: string } | undefined;
    return {
      voided: v?.purchaseToken ? { purchaseToken: v.purchaseToken, orderId: v.orderId ?? null, voidedAt: Number(msg.eventTimeMillis) || this.o.now() } : null,
      test: Boolean(msg.testNotification),
    };
  }
}
