/**
 * Re-audit: accounts, minors, moderation notices and native store compliance on
 * the server. Age bands (only stricter; under-13 chat and discovery; 13-17
 * private defaults), moderation notices with reasons and appeal routes, device
 * sessions (unlink signs out that provider's devices, "sign out other
 * devices", pruning), Sign in with Apple refresh tokens (exchange at link
 * time, revoke on deletion/unlink, server-to-server notifications), Game
 * Center key URLs and JWKS refetch throttling. Every adapter.
 */
import { createSign, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppleSignInTokens, type AppleTokenClient } from '../../../server/identity/appleTokens';
import { combineVerifiers, GameCenterVerifier, gameCenterKeyUrl, IdentityError, JwtVerifier } from '../../../server/identity/verify';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { ServerError } from '../../../src/backend/net/ports';
import { PRESET_CHAT, PRESET_CHAT_RETIRED } from '../../../src/backend/net/protocol';
import { world } from './harness';
import { repoFactories } from './pg';

const NOW = Date.UTC(2026, 3, 6, 12);
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError) return e.code;
    if (e instanceof IdentityError) return `identity: ${e.message}`;
    throw e;
  }
  return 'ok';
}

/** An Apple-like provider: an RSA key as a JWKS, ID tokens and notification JWTs. */
function appleProvider(aud = 'com.example.game') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const jwt = (claims: Record<string, unknown>, key: KeyObject = privateKey) => {
    const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
    const p = b64u(JSON.stringify({ iss: 'https://appleid.apple.com', aud, iat: NOW / 1000, ...claims }));
    return `${h}.${p}.${b64u(cryptoSign('RSA-SHA256', Buffer.from(`${h}.${p}`), key))}`;
  };
  let fetches = 0;
  const fetch = async () => {
    fetches++;
    return { ok: true, status: 200, json: async () => ({ keys: [jwk] }), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const verifier = new JwtVerifier({ jwksUrl: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'], audiences: [aud], fetch, now: () => NOW });
  return { verifier, idToken: (sub: string) => jwt({ sub, exp: NOW / 1000 + 600 }), notification: (type: string, sub: string) => jwt({ jti: 'j1', events: JSON.stringify({ type, sub, event_time: NOW }) }), forged: (type: string, sub: string) => jwt({ events: JSON.stringify({ type, sub }) }, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), fetches: () => fetches };
}

/** A fake Apple token endpoint: records exchanges and revocations. */
function fakeAppleTokens(): AppleTokenClient & { exchanged: string[]; revoked: string[]; failRevoke?: boolean } {
  const t = {
    exchanged: [] as string[],
    revoked: [] as string[],
    failRevoke: false,
    async exchange(code: string, clientId: string) {
      t.exchanged.push(`${clientId}:${code}`);
      return `refresh-${code}`;
    },
    async revoke(token: string, clientId: string) {
      if (t.failRevoke) throw new Error('Apple is down');
      t.revoked.push(`${clientId}:${token}`);
      return true;
    },
  };
  return t;
}

describe('Sign in with Apple token client', () => {
  it('signs an ES256 client secret, exchanges a code and revokes a refresh token with a timeout-bounded fetch', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const calls: { url: string; body: URLSearchParams }[] = [];
    const fetch = async (url: string, init: { body: string }) => {
      calls.push({ url, body: new URLSearchParams(init.body) });
      return { ok: true, status: 200, json: async () => (url.endsWith('/token') ? { refresh_token: 'r-1', access_token: 'a' } : {}) };
    };
    const pem = (privateKey.export({ format: 'pem', type: 'pkcs8' }) as string).replace(/\n/g, '\\n');
    const c = new AppleSignInTokens({ teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem, clientIds: ['com.example.game'], fetch, now: () => NOW });
    expect(await c.exchange('code-1', 'com.example.game')).toBe('r-1');
    expect(await c.exchange('code-1', 'com.other.app')).toBeNull(); // not one of our client ids
    expect(await c.revoke('r-1', 'com.example.game')).toBe(true);
    expect(calls.map((x) => x.url)).toEqual(['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke']);
    expect(calls[0].body.get('grant_type')).toBe('authorization_code');
    expect(calls[1].body.get('token_type_hint')).toBe('refresh_token');
    const secret = calls[0].body.get('client_secret')!;
    const [h, p, s] = secret.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toMatchObject({ iss: 'TEAM123456', sub: 'com.example.game', aud: 'https://appleid.apple.com' });
    expect(cryptoVerify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
    // A failing network never throws.
    const down = new AppleSignInTokens({ teamId: 'T', keyId: 'K', privateKey: pem, clientIds: ['com.example.game'], fetch: async () => Promise.reject(new Error('offline')), now: () => NOW });
    expect(await down.revoke('r-1', 'com.example.game')).toBe(false);
  });
});

describe('Game Center keys and JWKS refetching', () => {
  it('accepts only https://static.gc.apple.com/public-key/….cer', () => {
    expect(gameCenterKeyUrl('https://static.gc.apple.com/public-key/gc-prod-10.cer')).toBe('https://static.gc.apple.com/public-key/gc-prod-10.cer');
    for (const bad of ['https://evil.apple.com/public-key/gc.cer', 'http://static.gc.apple.com/public-key/gc.cer', 'https://static.gc.apple.com/other/gc.cer', 'https://static.gc.apple.com/public-key/gc.cer?x=1', 'https://static.gc.apple.com:8443/public-key/gc.cer', 'https://user@static.gc.apple.com/public-key/gc.cer', 'https://static.gc.apple.com/public-key/../x.cer', 'not a url', 42]) {
      expect(gameCenterKeyUrl(bad), String(bad)).toBeNull();
    }
  });

  it('caps the key download at 16 KB, gives up after 5 s, keeps a small cache and answers 400 for a malformed URL', async () => {
    const key = readFileSync(new URL('../fixtures/gamecenter-test.key', import.meta.url), 'utf8');
    const cer = readFileSync(new URL('../fixtures/gamecenter-test.cer', import.meta.url));
    let fetches = 0;
    let mode: 'ok' | 'big' | 'stall' = 'ok';
    const fetch = async (_url: string, init?: { signal?: AbortSignal }) => {
      fetches++;
      if (mode === 'stall') return new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      const bytes = mode === 'big' ? Buffer.alloc(20_000, 1) : cer;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < bytes.length; i += 4096) c.enqueue(new Uint8Array(bytes.subarray(i, i + 4096)));
          c.close();
        },
      });
      return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null }, body };
    };
    const gc = new GameCenterVerifier({ bundleIds: ['com.example.game'], fetch, now: () => NOW });
    const salt = Buffer.from('saltsalt');
    const ts = Buffer.alloc(8);
    ts.writeBigUInt64BE(BigInt(NOW));
    const signature = createSign('RSA-SHA256').update(Buffer.concat([Buffer.from('T:1'), Buffer.from('com.example.game'), ts, salt])).sign(key).toString('base64');
    const cred = (n: number) => ({ teamPlayerId: 'T:1', bundleId: 'com.example.game', timestamp: NOW, salt: salt.toString('base64'), signature, publicKeyUrl: `https://static.gc.apple.com/public-key/gc-${n}.cer` });
    expect(await gc.verify(cred(1))).toBe('T:1');
    expect(await gc.verify(cred(1))).toBe('T:1');
    expect(fetches).toBe(1); // cached
    for (let i = 2; i <= 20; i++) await gc.verify(cred(i));
    expect(fetches).toBe(20);
    await gc.verify(cred(20)); // still cached (most recent)
    await gc.verify(cred(1)); // evicted (16 entries): fetched again
    expect(fetches).toBe(21);
    mode = 'big';
    expect(await code(gc.verify(cred(99)))).toMatch(/too large/);
    mode = 'stall';
    const started = Date.now();
    const stalled = code(gc.verify(cred(98)));
    expect(await stalled).toMatch(/too long/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_900);
    expect(await code(gc.verify({ ...cred(1), publicKeyUrl: '::nonsense::' }))).toMatch(/Untrusted/);
  }, 10_000);

  it('reloads the key set for an unknown kid at most once per 5 minutes', async () => {
    let t = NOW;
    let fetches = 0;
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' };
    const v = new JwtVerifier({ jwksUrl: 'https://x/jwks', issuers: ['i'], audiences: ['a'], fetch: async () => (fetches++, { ok: true, status: 200, json: async () => ({ keys: [jwk] }), arrayBuffer: async () => new ArrayBuffer(0) }), now: () => t });
    const forged = (kid: string) => `${b64u(JSON.stringify({ alg: 'RS256', kid }))}.${b64u('{}')}.${b64u('sig')}`;
    for (let i = 0; i < 20; i++) expect(await code(v.verify(forged(`kid-${i}`)))).toMatch(/Unknown sign-in key/);
    expect(fetches).toBe(1);
    t += 5 * 60_000;
    await code(v.verify(forged('kid-new')));
    expect(fetches).toBe(2);
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`account protections on ${label} storage`, () => {
    it('keeps the strictest age band, applies private defaults once, and enforces under-13 limits', async () => {
      const w = world({ repo: await makeRepo() });
      const teen = await w.player('Teen Ninja');
      const kid = await w.player('Small Ninja');
      const adult = await w.player('Grown Ninja');
      expect(await teen.stateAge({ band: null })).toEqual({ band: null });
      expect(await teen.stateAge({ band: '13to17' })).toEqual({ band: '13to17' });
      let f = await teen.friends();
      expect([f.findable, f.showOnline]).toEqual(['friends_of_friends', false]);
      // A later explicit choice is kept; an adult answer never loosens the band.
      f = await teen.setPrivacy({ findable: 'everyone', showOnline: true });
      expect(await teen.stateAge({ band: 'adult' })).toEqual({ band: '13to17' });
      expect(await teen.stateAge({ band: '13to17' })).toEqual({ band: '13to17' });
      f = await teen.friends();
      expect([f.findable, f.showOnline]).toEqual(['everyone', true]);
      expect(await code(teen.stateAge({ band: 'toddler' as never }))).toBe('bad_request');
      // Under 13: found by friend code only, a generated name, chat from the fixed phrases.
      expect(await kid.stateAge({ band: 'under13' })).toEqual({ band: 'under13' });
      expect((await kid.friends()).findable).toBe('nobody');
      expect(await code(kid.setPrivacy({ findable: 'everyone' }))).toBe('age_restricted');
      expect(await code(adult.lookupPlayer('Small Ninja'))).toBe('not_found');
      expect((await adult.playerByCode((await kid.friends()).code)).name).toBe('Small Ninja');
      expect(await code(kid.rename('My Real Name'))).toBe('age_restricted');
      const g = await adult.createGrove('Hidden Leaf');
      await kid.joinGrove(g.id);
      expect(await code(kid.postChat('my address is 1 Main St'))).toBe('age_restricted');
      expect((await kid.postChat(PRESET_CHAT[1])).text).toBe(PRESET_CHAT[1]);
      // A phrase an older game still offers ("troops" before the remnant audit) is accepted too.
      expect((await kid.postChat(PRESET_CHAT_RETIRED[0])).text).toBe(PRESET_CHAT_RETIRED[0]);
      expect(PRESET_CHAT.some((p) => /troop/i.test(p))).toBe(false);
      expect((await adult.postChat('free text is fine for adults')).text).toContain('free text');
      // Staff reset (after a support check) clears the band.
      await w.core.admin.resetAge('staff', kid.id, { note: 'parent confirmed the date of birth' });
      expect(await kid.stateAge({ band: null })).toEqual({ band: null });
    });

    it('tells reporters the outcome and the affected player the reason and how to appeal', async () => {
      const w = world({ repo: await makeRepo(), shared: { account: { supportContact: 'help@kagemura.example' } } });
      const [ann, ben, cat] = [await w.player('Ann'), await w.player('Ben'), await w.player('Cat')];
      const g = await ann.createGrove('Toad Hall');
      await ben.joinGrove(g.id);
      await cat.joinGrove(g.id);
      const msg = await ann.postChat('you are all losers');
      await ben.report({ kind: 'chat', messageId: msg.id, reason: 'harassment' });
      await cat.report({ kind: 'chat', messageId: msg.id, reason: 'harassment' });
      const queue = (await w.core.admin.reportQueue('open')).reports;
      await w.core.admin.resolveReport(queue[0].id, { action: 'mute', hours: 24, note: 'insults' });
      const annNotices = (await ann.notices()).notices;
      expect(annNotices).toHaveLength(1);
      expect(annNotices[0]).toMatchObject({ kind: 'moderation_action', read: false });
      expect(annNotices[0].text).toMatch(/paused your chat until .*Reason: harassment or bullying \(insults\)\..*help@kagemura\.example/);
      for (const r of [ben, cat]) {
        const n = (await r.notices()).notices;
        expect(n).toHaveLength(1);
        expect(n[0].text).toMatch(/^Thanks, we reviewed your report about a chat message by .*Ann.*: the player's chat was paused and the message removed\.$/);
      }
      // A muted send says why, until when, and how to appeal.
      const e = await ann.postChat('sorry').catch((x: ServerError) => x);
      expect(e).toMatchObject({ code: 'muted' });
      expect((e as ServerError).message).toMatch(/until .*Reason: harassment or bullying \(insults\).*help@kagemura\.example/);
      await ann.markNoticesRead([annNotices[0].id, 'someone-elses']);
      expect((await ann.notices()).notices[0].read).toBe(true);
      // A dismissed report tells the reporter nothing was removed; the reported player hears nothing.
      const m2 = await ben.postChat('good game');
      await cat.report({ kind: 'player', playerId: ben.id, reason: 'spam' });
      w.advance(1000);
      const q2 = (await w.core.admin.reportQueue('open')).reports;
      await w.core.admin.resolveReport(q2[0].id, { action: 'dismiss' });
      expect((await cat.notices()).notices[0].text).toMatch(/we did not find a rule broken/);
      expect((await ben.notices()).notices).toHaveLength(1); // only the outcome of his own report
      expect(m2.id).toBeTruthy();
      // Deleting an account clears its notices.
      await ann.deleteAccount();
      expect(await w.repo.noticesOf(ann.id, 10)).toEqual([]);
    });

    it('unlinking signs out the devices that provider signed in, "sign out other devices" keeps only this one, old tokens are pruned', async () => {
      const apple = appleProvider();
      const tokens = fakeAppleTokens();
      const w = world({ repo: await makeRepo(), shared: { identity: combineVerifiers({ apple: apple.verifier }), account: { appleTokens: tokens } } });
      const ann = await w.player('Ann');
      await ann.link('apple', { idToken: apple.idToken('apple-ann'), authorizationCode: 'c1' });
      expect(tokens.exchanged).toEqual(['com.example.game:c1']);
      const phone = new InProcessServerAdapter(w.core);
      await phone.signIn('apple', { idToken: apple.idToken('apple-ann') }, 'phone');
      const tablet = new InProcessServerAdapter(w.core);
      await tablet.signIn('apple', { idToken: apple.idToken('apple-ann') }, 'tablet');
      // Unlinking from the phone: the tablet (signed in with Apple) is signed out, the phone itself and the first device stay.
      await phone.unlink('apple');
      expect(tokens.revoked).toEqual(['com.example.game:refresh-c1']);
      expect(await code(tablet.me())).toBe('unauthorized');
      expect((await phone.me()).id).toBe(ann.id);
      expect((await ann.me()).id).toBe(ann.id);
      // Sign out other devices from the phone: the first device goes, the phone becomes the main one.
      expect(await phone.revokeOtherSessions()).toEqual({ revoked: 1 });
      expect(await code(ann.me())).toBe('unauthorized');
      expect((await phone.me()).id).toBe(ann.id);
      expect(await phone.revokeOtherSessions()).toEqual({ revoked: 0 });
      // Pruning: an extra device token unused for 400 days goes.
      await phone.link('apple', { idToken: apple.idToken('apple-ann') });
      const laptop = new InProcessServerAdapter(w.core);
      await laptop.signIn('apple', { idToken: apple.idToken('apple-ann') }, 'laptop');
      w.advance(401 * 24 * 3_600_000);
      expect(await w.core.pruneTokens()).toBe(1);
      expect(await code(laptop.me())).toBe('unauthorized');
      expect((await phone.me()).id).toBe(ann.id); // the main token is the account
    });

    it('revokes the Apple refresh token on deletion (never blocking it) and handles Apple notifications', async () => {
      const apple = appleProvider();
      const tokens = fakeAppleTokens();
      const w = world({ repo: await makeRepo(), shared: { identity: combineVerifiers({ apple: apple.verifier }), account: { appleTokens: tokens } } });
      const ann = await w.player('Ann');
      await ann.link('apple', { idToken: apple.idToken('apple-ann'), authorizationCode: 'c-ann' });
      tokens.failRevoke = true;
      await ann.deleteAccount(); // Apple failing does not stop the deletion
      expect(await w.repo.getPlayer(ann.id)).toBeNull();
      tokens.failRevoke = false;
      const ben = await w.player('Ben');
      await ben.link('apple', { idToken: apple.idToken('apple-ben'), authorizationCode: 'c-ben' });
      await ben.deleteAccount();
      expect(tokens.revoked).toEqual(['com.example.game:refresh-c-ben']);
      // consent-revoked: the link goes (and its devices); account-delete: the game account goes.
      const cat = await w.player('Cat');
      await cat.link('apple', { idToken: apple.idToken('apple-cat') });
      const catPhone = new InProcessServerAdapter(w.core);
      await catPhone.signIn('apple', { idToken: apple.idToken('apple-cat') });
      await w.core.appleSignInNotification({ payload: apple.notification('consent-revoked', 'apple-cat') });
      expect((await cat.links()).links).toEqual([]);
      expect(await code(catPhone.me())).toBe('unauthorized');
      expect((await cat.me()).id).toBe(cat.id);
      await cat.link('apple', { idToken: apple.idToken('apple-cat') });
      await expect(w.core.appleSignInNotification({ payload: apple.forged('account-delete', 'apple-cat') })).rejects.toMatchObject({ code: 'bad_request' });
      expect(await w.repo.getPlayer(cat.id)).not.toBeNull();
      await w.core.appleSignInNotification({ payload: apple.notification('account-delete', 'apple-cat') });
      expect(await w.repo.getPlayer(cat.id)).toBeNull();
      await w.core.appleSignInNotification({ payload: apple.notification('email-disabled', 'apple-nobody') }); // ignored
    });

    it('without the Apple key settings, links still work and nothing is exchanged', async () => {
      const apple = appleProvider();
      const w = world({ repo: await makeRepo(), shared: { identity: combineVerifiers({ apple: apple.verifier }) } });
      const ann = await w.player('Ann');
      expect((await ann.link('apple', { idToken: apple.idToken('apple-ann'), authorizationCode: 'c1' })).links).toHaveLength(1);
      expect(await w.repo.linkTokensOf(ann.id)).toEqual([]);
      await ann.deleteAccount();
      expect(await w.repo.getPlayer(ann.id)).toBeNull();
      // A server without Sign in with Apple has no notification endpoint.
      const bare = world({ repo: await makeRepo() });
      await expect(bare.core.appleSignInNotification({ payload: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    });
  });
}
