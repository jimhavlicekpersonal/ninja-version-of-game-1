/**
 * App Store purchases (roadmap step 35), with node:crypto only.
 *
 * StoreKit 2 gives the game each transaction as a JWS (`jwsRepresentation`),
 * and App Store Server Notifications v2 arrive as a signed payload. Both are
 * ES256 JWS whose header carries the certificate chain (x5c: leaf,
 * intermediate, root). A JWS is genuine when:
 * - the root is Apple's (pinned by SHA-256 fingerprint: Apple Root CA - G3,
 *   or `APPLE_ROOT_CA_SHA256` to check another or a test root),
 * - the intermediate is signed by the root and carries Apple's WWDR marker
 *   (OID 1.2.840.113635.100.6.2.1), the leaf is signed by the intermediate and
 *   carries the App Store receipt-signing marker (1.2.840.113635.100.6.11.1),
 *   and all three are within their validity dates,
 * - the JWS signature checks with the leaf's key.
 * Then the transaction must be for our bundle id, from an allowed environment.
 */
import { createHash, verify as cryptoVerify, X509Certificate } from 'node:crypto';

export class PurchaseError extends Error {}

/** Apple Root CA - G3 (https://www.apple.com/certificateauthority/), SHA-256 of the DER certificate. */
export const APPLE_ROOT_CA_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

const OID_LEAF = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01]);
const OID_INTERMEDIATE = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01]);

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** The fields of a JWSTransactionDecodedPayload the server uses. */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  environment: string;
  /** The UUID the game passed to `purchase(options: [.appAccountToken])`: our purchase intent. */
  appAccountToken: string | null;
  revocationDate: number | null;
  type: string;
  /** Storefront country (ISO 3166-1 alpha-3), currency (ISO 4217) and price in micros, when Apple sends them. */
  storefront: string | null;
  currency: string | null;
  priceMicros: number | null;
}

export interface AppleNotification {
  notificationType: string;
  subtype: string | null;
  notificationUUID: string;
  /** When Apple signed it (ms), for ordering (backend A29); null when absent. */
  signedDate: number | null;
  environment: string;
  bundleId: string;
  transaction: AppleTransaction | null;
}

export interface AppleVerifierOptions {
  bundleIds: string[];
  /** SHA-256 fingerprints (hex, any case, colons allowed) of the trusted roots. */
  rootFingerprints?: string[];
  /** 'Production', 'Sandbox' (App Review and TestFlight buy in the sandbox, so production accepts it too), 'Xcode'. */
  environments?: string[];
  now: () => number;
}

const fp = (s: string) => s.replace(/[^0-9a-f]/gi, '').toLowerCase();

export class AppleVerifier {
  private readonly roots: Set<string>;
  private readonly environments: string[];

  constructor(private readonly o: AppleVerifierOptions) {
    this.roots = new Set((o.rootFingerprints?.length ? o.rootFingerprints : [APPLE_ROOT_CA_G3_SHA256]).map(fp));
    this.environments = o.environments?.length ? o.environments : ['Production', 'Sandbox'];
  }

  /** Check a JWS and return its payload (throws PurchaseError when it is not Apple's). */
  decode(jws: unknown): Record<string, unknown> {
    if (typeof jws !== 'string' || jws.split('.').length !== 3) throw new PurchaseError('Not an App Store receipt.');
    const [h, p, sig] = jws.split('.');
    let header: { alg?: string; x5c?: string[] };
    let payload: Record<string, unknown>;
    try {
      header = JSON.parse(b64url(h).toString('utf8'));
      payload = JSON.parse(b64url(p).toString('utf8'));
    } catch {
      throw new PurchaseError('Not an App Store receipt.');
    }
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw new PurchaseError('Unsupported App Store receipt.');
    let leaf: X509Certificate, inter: X509Certificate, root: X509Certificate;
    try {
      [leaf, inter, root] = header.x5c.map((c) => new X509Certificate(Buffer.from(c, 'base64')));
    } catch {
      throw new PurchaseError('The App Store receipt has a broken certificate.');
    }
    const rootFp = createHash('sha256').update(root.raw).digest('hex');
    if (!this.roots.has(rootFp)) throw new PurchaseError('The App Store receipt is not signed by Apple.');
    const now = this.o.now();
    for (const c of [leaf, inter, root]) {
      if (Date.parse(c.validFrom) > now || Date.parse(c.validTo) < now) throw new PurchaseError('The App Store receipt certificate has expired.');
    }
    if (!root.verify(root.publicKey) || !inter.verify(root.publicKey) || !leaf.verify(inter.publicKey)) throw new PurchaseError('The App Store receipt is not signed by Apple.');
    if (!inter.ca || !inter.raw.includes(OID_INTERMEDIATE) || !leaf.raw.includes(OID_LEAF)) throw new PurchaseError('The App Store receipt is not signed by Apple.');
    if (!cryptoVerify('sha256', Buffer.from(`${h}.${p}`), { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, b64url(sig))) throw new PurchaseError('The App Store receipt is not genuine.');
    return payload;
  }

  private checkApp(bundleId: unknown, environment: unknown): void {
    if (!this.o.bundleIds.includes(String(bundleId))) throw new PurchaseError('The App Store receipt is for another app.');
    if (!this.environments.includes(String(environment))) throw new PurchaseError(`App Store ${String(environment)} purchases are not accepted here.`);
  }

  /** A transaction the game sends (`Transaction.jwsRepresentation`). */
  transaction(jws: unknown): AppleTransaction {
    const t = this.decode(jws);
    this.checkApp(t.bundleId, t.environment);
    return toTransaction(t);
  }

  /** An App Store Server Notification v2 (`{ signedPayload }`). */
  notification(signedPayload: unknown): AppleNotification {
    const n = this.decode(signedPayload);
    const data = (n.data ?? {}) as Record<string, unknown>;
    this.checkApp(data.bundleId, data.environment);
    const transaction = data.signedTransactionInfo ? toTransaction(this.decode(data.signedTransactionInfo)) : null;
    if (transaction && transaction.bundleId !== data.bundleId) throw new PurchaseError('The notification names another app.');
    return {
      notificationType: String(n.notificationType ?? ''),
      subtype: n.subtype ? String(n.subtype) : null,
      notificationUUID: String(n.notificationUUID ?? ''),
      signedDate: Number.isFinite(Number(n.signedDate)) && n.signedDate != null ? Number(n.signedDate) : null,
      environment: String(data.environment),
      bundleId: String(data.bundleId),
      transaction,
    };
  }
}

function toTransaction(t: Record<string, unknown>): AppleTransaction {
  if (!t.transactionId || !t.productId) throw new PurchaseError('The App Store receipt has no transaction.');
  return {
    transactionId: String(t.transactionId),
    originalTransactionId: String(t.originalTransactionId ?? t.transactionId),
    bundleId: String(t.bundleId),
    productId: String(t.productId),
    purchaseDate: Number(t.purchaseDate) || 0,
    environment: String(t.environment),
    appAccountToken: typeof t.appAccountToken === 'string' && t.appAccountToken ? t.appAccountToken.toLowerCase() : null,
    revocationDate: Number.isFinite(Number(t.revocationDate)) && t.revocationDate != null ? Number(t.revocationDate) : null,
    type: String(t.type ?? ''),
    storefront: typeof t.storefront === 'string' ? t.storefront : null,
    currency: typeof t.currency === 'string' ? t.currency : null,
    // Apple's `price` is in milli-units of the currency.
    priceMicros: Number.isFinite(Number(t.price)) && t.price != null ? Math.round(Number(t.price) * 1000) : null,
  };
}
