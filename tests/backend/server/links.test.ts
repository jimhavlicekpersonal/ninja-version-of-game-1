/**
 * Linked sign-ins = cloud save (roadmap step 24): the provider checks (JWT
 * against a JWKS, Game Center signatures, Play Games code exchange) with
 * local keys, and linking / signing in on another device on every adapter.
 */
import { createSign, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combineVerifiers, GameCenterVerifier, IdentityError, JwtVerifier, PlayGamesVerifier } from '../../../server/identity/verify';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { ServerError } from '../../../src/backend/net/ports';
import { world } from './harness';
import { repoFactories } from './pg';

const NOW = Date.UTC(2026, 3, 6, 12);
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** A provider of our own: an RSA key published as a JWKS, and a token maker. */
function provider(iss = 'https://appleid.apple.com', aud = 'com.example.game') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const token = (claims: Record<string, unknown>, key: KeyObject = privateKey, kid = 'k1') => {
    const h = b64u(JSON.stringify({ alg: 'RS256', kid }));
    const p = b64u(JSON.stringify({ iss, aud, exp: NOW / 1000 + 600, iat: NOW / 1000, ...claims }));
    return `${h}.${p}.${b64u(cryptoSign('RSA-SHA256', Buffer.from(`${h}.${p}`), key))}`;
  };
  let fetches = 0;
  const fetch = async () => {
    fetches++;
    return { ok: true, status: 200, json: async () => ({ keys: [jwk] }), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const verifier = new JwtVerifier({ jwksUrl: 'https://keys.example/jwks', issuers: [iss], audiences: [aud], fetch, now: () => NOW });
  return { verifier, token, fetches: () => fetches };
}

async function err(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof IdentityError || e instanceof ServerError) return e.message;
    throw e;
  }
  return 'ok';
}

describe('sign-in checks', () => {
  it('accepts a genuine ID token for our app, and nothing else', async () => {
    const p = provider();
    expect((await p.verifier.verify(p.token({ sub: 'apple-123' }))).sub).toBe('apple-123');
    expect(await err(p.verifier.verify(p.token({ sub: 'x', aud: 'com.other.app' })))).toMatch(/another app/);
    expect(await err(p.verifier.verify(p.token({ sub: 'x', iss: 'https://evil.example' })))).toMatch(/someone else/);
    expect(await err(p.verifier.verify(p.token({ sub: 'x', exp: NOW / 1000 - 3600 })))).toMatch(/expired/);
    const forged = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(await err(p.verifier.verify(p.token({ sub: 'x' }, forged)))).toMatch(/not genuine/);
    expect(await err(p.verifier.verify(p.token({ sub: 'x' }, undefined, 'unknown-kid')))).toMatch(/Unknown sign-in key/);
    expect(await err(p.verifier.verify('nonsense'))).toMatch(/Not a sign-in token/);
    expect(p.fetches()).toBeLessThanOrEqual(3); // keys are cached (a miss on an unknown kid reloads once)
  });

  it('checks Game Center signatures with the key from an Apple URL only', async () => {
    const key = readFileSync(new URL('../fixtures/gamecenter-test.key', import.meta.url), 'utf8');
    const cer = readFileSync(new URL('../fixtures/gamecenter-test.cer', import.meta.url));
    const fetch = async () => ({ ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => cer.buffer.slice(cer.byteOffset, cer.byteOffset + cer.byteLength) });
    const gc = new GameCenterVerifier({ bundleIds: ['com.example.game'], fetch, now: () => NOW });
    const salt = Buffer.from('saltsalt');
    const ts = Buffer.alloc(8);
    ts.writeBigUInt64BE(BigInt(NOW));
    const signature = createSign('RSA-SHA256').update(Buffer.concat([Buffer.from('T:123'), Buffer.from('com.example.game'), ts, salt])).sign(key).toString('base64');
    const cred = { teamPlayerId: 'T:123', bundleId: 'com.example.game', timestamp: NOW, salt: salt.toString('base64'), signature, publicKeyUrl: 'https://static.gc.apple.com/public-key/gc-prod-9.cer' };
    expect(await gc.verify(cred)).toBe('T:123');
    expect(await err(gc.verify({ ...cred, teamPlayerId: 'T:999' }))).toMatch(/not genuine/);
    expect(await err(gc.verify({ ...cred, publicKeyUrl: 'https://evil.example/key.cer' }))).toMatch(/Untrusted/);
    expect(await err(gc.verify({ ...cred, bundleId: 'com.other' }))).toMatch(/another app/);
    expect(await err(gc.verify({ ...cred, timestamp: NOW - 3_600_000 }))).toMatch(/too old/);
  });

  it('exchanges a Play Games code for the player id', async () => {
    const calls: string[] = [];
    const fetch = async (url: string) => {
      calls.push(url);
      const body = url.includes('oauth2') ? { access_token: 'at' } : { playerId: 'g-77' };
      return { ok: true, status: 200, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    expect(await new PlayGamesVerifier({ clientId: 'c', clientSecret: 's', fetch }).verify({ serverAuthCode: 'code' })).toBe('g-77');
    expect(calls).toEqual(['https://oauth2.googleapis.com/token', 'https://games.googleapis.com/games/v1/players/me']);
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`linking and signing in on another device on ${label} storage`, () => {
    it('links a sign-in to one player only, signs in on a new device as that player, and unlinks', async () => {
      const p = provider();
      const w = world({ repo: await makeRepo(), shared: { identity: combineVerifiers({ apple: p.verifier }) } });
      const ann = await w.player('Ann');
      const ben = await w.player('Ben');
      const cred = { idToken: p.token({ sub: 'apple-ann' }) };
      expect((await ann.links()).providers).toEqual(['apple']);
      expect((await ann.link('apple', cred)).links.map((l) => l.provider)).toEqual(['apple']);
      expect(await ann.link('apple', cred)).toBeTruthy(); // linking again is fine
      expect(await err(ben.link('apple', cred))).toMatch(/another player/);
      expect(await err(ann.link('google', { idToken: 'x' }))).toMatch(/not set up/);
      // A new device: same player, its own token; the first device keeps working.
      const phone = new InProcessServerAdapter(w.core);
      const r = await phone.signIn('apple', { idToken: p.token({ sub: 'apple-ann' }) }, 'phone');
      expect(r.playerId).toBe(ann.id);
      expect((await phone.me()).name).toBe('Ann');
      expect((await ann.me()).id).toBe(ann.id);
      expect(await err(new InProcessServerAdapter(w.core).signIn('apple', { idToken: p.token({ sub: 'nobody' }) }))).toMatch(/No player is linked/);
      await ann.unlink('apple');
      expect((await ann.links()).links).toEqual([]);
      // Deleting the account ends every device's access.
      await ann.link('apple', cred);
      await ann.deleteAccount();
      await expect(phone.me()).rejects.toMatchObject({ code: 'unauthorized' });
    });
  });
}
