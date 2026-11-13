/**
 * Backend batch 2026-11-13: sign-in nonces and token times (A15), Game Center certificate checks (A15),
 * signing out this device and rotating its token (A16).
 */
import { createHash, createSign, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combineVerifiers, GameCenterVerifier, IdentityError, JwtVerifier } from '../../../server/identity/verify';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { MemoryRepo } from '../../../server/repo';
import { Routes } from '../../../src/backend/net/protocol';
import { world } from './harness';
import { setup } from './httpHarness';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function appleProvider(now: () => number) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const token = (claims: Record<string, unknown>) => {
    const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
    const p = b64u(JSON.stringify({ iss: 'https://appleid.apple.com', aud: 'com.example.game', exp: now() / 1000 + 600, iat: now() / 1000, ...claims }));
    return `${h}.${p}.${b64u(cryptoSign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey))}`;
  };
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ keys: [jwk] }), arrayBuffer: async () => new ArrayBuffer(0) });
  return { verifier: new JwtVerifier({ jwksUrl: 'https://keys.example/jwks', issuers: ['https://appleid.apple.com'], audiences: ['com.example.game'], fetch, now }), token };
}

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string; message?: string }) => e.code ?? e.message ?? 'error');

describe('A15: sign-ins bound to a server nonce', () => {
  it('a token carrying the issued nonce signs in once; a replay, a wrong nonce or an unknown one is refused', async () => {
    let w = world();
    const apple = appleProvider(() => w.now());
    w = world({ shared: { identity: combineVerifiers({ apple: apple.verifier }) } });
    const ann = await w.player('Ann');
    await ann.link('apple', { idToken: apple.token({ sub: 'apple-ann' }) });

    // Native Sign in with Apple carries the SHA-256 of the raw nonce; the game sends the raw one.
    const { nonce } = await w.core.authNonce();
    const hashed = createHash('sha256').update(nonce).digest('hex');
    const idToken = apple.token({ sub: 'apple-ann', nonce: hashed });
    const phone = new InProcessServerAdapter(w.core);
    expect((await phone.signIn('apple', { idToken, nonce })).playerId).toBe(ann.id);
    // The same token and nonce again (a copied token): the nonce is used up.
    expect(await code(new InProcessServerAdapter(w.core).signIn('apple', { idToken, nonce }))).toBe('bad_request');
    // A nonce the token does not carry.
    const other = await w.core.authNonce();
    expect(await code(new InProcessServerAdapter(w.core).signIn('apple', { idToken, nonce: other.nonce }))).toBe('bad_request');
    // A nonce the server never issued, even if the token carries it.
    expect(await code(new InProcessServerAdapter(w.core).signIn('apple', { idToken: apple.token({ sub: 'apple-ann', nonce: 'made-up' }), nonce: 'made-up' }))).toBe('bad_request');
    // An expired nonce.
    const late = await w.core.authNonce();
    w.advance(11 * 60_000);
    expect(await code(new InProcessServerAdapter(w.core).signIn('apple', { idToken: apple.token({ sub: 'apple-ann', nonce: late.nonce }), nonce: late.nonce }))).toBe('bad_request');
    // Web (raw nonce in the token) works too.
    const web = await w.core.authNonce();
    expect((await new InProcessServerAdapter(w.core).signIn('apple', { idToken: apple.token({ sub: 'apple-ann', nonce: web.nonce }), nonce: web.nonce })).playerId).toBe(ann.id);
  });

  it('older games without a nonce still sign in, unless SIGNIN_NONCE_REQUIRED', async () => {
    const t = Date.UTC(2026, 10, 13);
    const apple = appleProvider(() => t);
    const loose = world({ start: t, shared: { identity: combineVerifiers({ apple: apple.verifier }) } });
    const ann = await loose.player('Ann');
    await ann.link('apple', { idToken: apple.token({ sub: 'apple-ann' }) });
    expect((await new InProcessServerAdapter(loose.core).signIn('apple', { idToken: apple.token({ sub: 'apple-ann' }) })).playerId).toBe(ann.id);
    const strict = world({ start: t, shared: { identity: combineVerifiers({ apple: apple.verifier }), policy: { signInNonceRequired: true } } });
    const ben = await strict.player('Ben');
    expect(await code(ben.link('apple', { idToken: apple.token({ sub: 'apple-ben' }) }))).toBe('bad_request');
  });

  it('refuses a token issued in the future', async () => {
    const now = Date.UTC(2026, 10, 13);
    const apple = appleProvider(() => now);
    await expect(apple.verifier.verify(apple.token({ sub: 'x', iat: now / 1000 + 3600 }))).rejects.toBeInstanceOf(IdentityError);
    expect(await apple.verifier.verify(apple.token({ sub: 'x', iat: now / 1000 + 60 }))).toMatchObject({ sub: 'x' });
  });

  it('POST /v1/auth/nonce issues nonces, limited per address', async () => {
    const s = setup({ rateLimits: { nonce: { limit: 2, windowMs: 3_600_000 } } });
    const a = await s.call('POST', Routes.authNonce);
    expect(a.status).toBe(200);
    expect(typeof a.body.nonce).toBe('string');
    expect(a.body.expiresAt).toBeGreaterThan(s.now());
    expect(s.repo.nonceRows.size).toBe(1);
    await s.call('POST', Routes.authNonce);
    expect((await s.call('POST', Routes.authNonce)).status).toBe(429);
    const hello = await s.call('GET', Routes.hello);
    expect(hello.body.features).toEqual(expect.arrayContaining(['signin-nonce', 'session-control']));
  });
});

describe('A15: Game Center key certificates', () => {
  const key = readFileSync(new URL('../fixtures/gamecenter-test.key', import.meta.url), 'utf8');
  const cer = readFileSync(new URL('../fixtures/gamecenter-test.cer', import.meta.url));
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => cer.buffer.slice(cer.byteOffset, cer.byteOffset + cer.byteLength) });
  const cred = (now: number) => {
    const salt = Buffer.from('saltsalt');
    const ts = Buffer.alloc(8);
    ts.writeBigUInt64BE(BigInt(now));
    const signature = createSign('RSA-SHA256').update(Buffer.concat([Buffer.from('T:123'), Buffer.from('com.example.game'), ts, salt])).sign(key).toString('base64');
    return { teamPlayerId: 'T:123', bundleId: 'com.example.game', timestamp: now, salt: salt.toString('base64'), signature, publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-9.cer' };
  };

  it('refuses an expired certificate, a stale timestamp and a certificate its CA did not sign', async () => {
    const ok = Date.UTC(2026, 10, 13);
    expect(await new GameCenterVerifier({ bundleIds: ['com.example.game'], fetch, now: () => ok }).verify(cred(ok))).toBe('T:123');
    // The fixture is valid 2020–2120.
    const after = Date.UTC(2121, 0, 1);
    await expect(new GameCenterVerifier({ bundleIds: ['com.example.game'], fetch, now: () => after }).verify(cred(after))).rejects.toThrow(/expired/);
    await expect(new GameCenterVerifier({ bundleIds: ['com.example.game'], fetch, now: () => ok }).verify(cred(ok - 20 * 60_000))).rejects.toThrow(/too old/);
    // With a CA configured, the self-signed fixture is not "signed by Apple's CA" unless it is the CA.
    const otherCa = readFileSync(new URL('../fixtures/appstore/root.pem', import.meta.url), 'utf8');
    await expect(new GameCenterVerifier({ bundleIds: ['com.example.game'], fetch, now: () => ok, caPem: otherCa }).verify(cred(ok))).rejects.toThrow(/certificate authority/);
    const selfCa = `-----BEGIN CERTIFICATE-----\n${cer.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`;
    expect(await new GameCenterVerifier({ bundleIds: ['com.example.game'], fetch, now: () => ok, caPem: selfCa }).verify(cred(ok))).toBe('T:123');
  });
});

describe('A16: signing out this device and rotating its token', () => {
  it('rotation gives a new token and the old one stops working', async () => {
    const s = setup();
    const a = await s.register('Ann');
    const r = await s.call('POST', Routes.sessionsRotate, a.token);
    expect(r.status).toBe(200);
    expect(r.body.playerId).toBe(a.playerId);
    expect((await s.call('GET', Routes.me, a.token)).status).toBe(401);
    expect((await s.call('GET', Routes.me, r.body.token)).status).toBe(200);
  });

  it('a device token signs out; the only key of an anonymous account does not', async () => {
    const s = setup();
    const a = await s.register('Ann');
    const refused = await s.call('DELETE', Routes.sessionsCurrent, a.token);
    expect(refused.status).toBe(409);
    expect((await s.call('GET', Routes.me, a.token)).status).toBe(200);
    // Another device signed in through a linked account.
    const repo = s.repo as MemoryRepo;
    await repo.addLink({ provider: 'apple', subject: 'apple-ann', playerId: a.playerId, linkedAt: s.now() });
    const second = 'second-device-token-abcdefghijkl';
    await repo.addToken(a.playerId, await s.app.core.ctx.hash(second), s.now(), 'phone', 'apple');
    await repo.putIdempotent((await s.app.core.ctx.hash(second)).slice(0, 32), 'k', 200, {}, s.now());
    expect((await s.call('DELETE', Routes.sessionsCurrent, second)).status).toBe(204);
    expect((await s.call('GET', Routes.me, second)).status).toBe(401);
    expect(repo.idempotencyRows.size).toBe(0);
    // With a link, the first device may sign out too (it can sign back in with Apple).
    expect((await s.call('DELETE', Routes.sessionsCurrent, a.token)).status).toBe(204);
    expect((await s.call('GET', Routes.me, a.token)).status).toBe(401);
  });

  it('extra device tokens expire after SESSION_IDLE_DAYS without use', async () => {
    const w = world({ shared: { policy: { sessionIdleDays: 30 } } });
    const ann = await w.player('Ann');
    await w.repo.addToken(ann.id, 'h-old', w.now(), 'tablet', 'apple');
    w.advance(31 * 24 * 3_600_000);
    await w.core.prune();
    expect((w.repo as MemoryRepo).tokenRows).toEqual([]);
  });
});
