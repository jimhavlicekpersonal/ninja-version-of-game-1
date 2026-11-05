/**
 * A test App Store signer: transactions signed by tests/backend/fixtures/appstore
 * (a made-up chain, "not Apple"), and a verifier that pins its root.
 */
import { createHash, sign as cryptoSign, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppleVerifier } from '../../../../server/payments/apple';

const pem = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
const der = (f: string) => new X509Certificate(pem(f)).raw.toString('base64');
export const TEST_CHAIN = [der('leaf.pem'), der('inter.pem'), der('root.pem')];
export const TEST_ROOT_SHA256 = createHash('sha256').update(new X509Certificate(pem('root.pem')).raw).digest('hex');
const leafKey = pem('leaf.key');
export const TEST_BUNDLE = 'com.toadstoolkingdoms.app';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

export function signJws(payload: Record<string, unknown>, x5c = TEST_CHAIN, key = leafKey): string {
  const head = `${b64({ alg: 'ES256', x5c })}.${b64(payload)}`;
  return `${head}.${cryptoSign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

/** Checked on the real clock: the test certificates last a century from when they were made. */
export function testAppleVerifier(): AppleVerifier {
  return new AppleVerifier({ bundleIds: [TEST_BUNDLE], rootFingerprints: [TEST_ROOT_SHA256], now: () => Date.now() });
}
