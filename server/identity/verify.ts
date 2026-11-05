/**
 * Checking a sign-in from Apple, Google, Game Center or Play Games (roadmap
 * step 24), with node:crypto only. Each gives a stable `subject` (the
 * provider's id for that person) that is linked to a player; nothing else
 * (no email, no name) is kept.
 *
 * - Apple and Google: an ID token (JWT, RS256/ES256) checked against the
 *   provider's published keys (JWKS), issuer, audience (our app ids) and expiry.
 * - Game Center: the identity-verification signature over teamPlayerID,
 *   bundle id, timestamp and salt, with Apple's certificate from the
 *   publicKeyURL (only https://static.gc.apple.com/public-key/….cer, at most
 *   16 KB within 5 s, a small LRU cache: re-audit, the route needs no token).
 * - Key sets are cached; an unknown `kid` reloads them at most once per 5
 *   minutes per JWKS URL (re-audit: no refetch storm from forged tokens).
 * - Play Games: a server auth code exchanged with Google for the player id.
 *
 * Configuration (server env): APPLE_CLIENT_IDS (the bundle id, plus the web
 * Services ID), GOOGLE_CLIENT_IDS (web/Android client ids), GAMECENTER_BUNDLE_IDS,
 * PLAYGAMES_CLIENT_ID + PLAYGAMES_CLIENT_SECRET. A provider without its
 * setting is refused.
 */
import { createPublicKey, verify as cryptoVerify, X509Certificate, type JsonWebKey, type KeyObject } from 'node:crypto';

export type Provider = 'apple' | 'google' | 'gamecenter' | 'playgames';
export const PROVIDERS: readonly Provider[] = ['apple', 'google', 'gamecenter', 'playgames'];

export class IdentityError extends Error {}

export interface VerifiedIdentity {
  provider: Provider;
  subject: string;
  /** Apple/Google: the client id the ID token was issued to (Sign in with Apple token exchange uses it). */
  audience?: string;
}

export interface IdentityVerifier {
  /** Which providers this server can check (the game only offers these). */
  readonly providers: Provider[];
  verify(provider: Provider, credential: unknown): Promise<VerifiedIdentity>;
  /**
   * A Sign in with Apple server-to-server notification JWT, checked against
   * Apple's keys like an ID token (issuer, audience, signature); its `events`
   * claim parsed. Absent when Sign in with Apple is not set up.
   */
  appleNotification?(jwt: unknown): Promise<{ type: string; sub: string }>;
}

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** A JWT checked against a JWKS: signature, issuer, audience, expiry. */
export class JwtVerifier {
  private keys: { at: number; byKid: Map<string, KeyObject> } | null = null;
  /** When the key set was last asked for (success or not). */
  private lastFetch = -Infinity;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly o: { jwksUrl: string; issuers: string[]; audiences: string[]; fetch: Fetch; now: () => number; cacheMs?: number; refetchMs?: number },
  ) {}

  /** One load at a time; concurrent sign-ins share it. */
  private load(): Promise<void> {
    if (!this.inflight) {
      this.lastFetch = this.o.now();
      this.inflight = (async () => {
        const res = await this.o.fetch(this.o.jwksUrl);
        if (!res.ok) throw new IdentityError(`Could not load sign-in keys (${res.status}).`);
        const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
        this.keys = { at: this.o.now(), byKid: new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])) };
      })().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async key(kid: string): Promise<KeyObject> {
    const now = this.o.now();
    const stale = !this.keys || now - this.keys.at >= (this.o.cacheMs ?? 3_600_000);
    const unknown = !this.keys?.byKid.has(kid);
    // A stale set reloads (failures retried after 10 s); an unknown kid (key rotation, or a forged token)
    // reloads at most once per refetchMs, so forged kids cannot make us hammer the provider.
    const since = now - this.lastFetch;
    if ((stale && since >= 10_000) || (unknown && since >= (this.o.refetchMs ?? 300_000))) {
      try {
        await this.load();
      } catch (e) {
        if (!this.keys) throw e instanceof IdentityError ? e : new IdentityError('Could not load sign-in keys.');
      }
    }
    if (!this.keys) throw new IdentityError('Could not load sign-in keys. Try again in a moment.');
    const k = this.keys.byKid.get(kid);
    if (!k) throw new IdentityError('Unknown sign-in key.');
    return k;
  }

  /**
   * A Sign in with Apple server-to-server notification: the same signature,
   * issuer and audience checks; no `sub`/`exp` needed (the subject is in
   * `events`), but `iat` must not be in the future.
   */
  async verifyNotification(token: unknown): Promise<Record<string, unknown>> {
    return this.check(token, true);
  }

  async verify(token: unknown): Promise<Record<string, unknown>> {
    return this.check(token, false);
  }

  private async check(token: unknown, notification: boolean): Promise<Record<string, unknown>> {
    if (typeof token !== 'string' || token.split('.').length !== 3) throw new IdentityError('Not a sign-in token.');
    const [h, p, sig] = token.split('.');
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(b64url(h).toString('utf8'));
      claims = JSON.parse(b64url(p).toString('utf8'));
    } catch {
      throw new IdentityError('Not a sign-in token.');
    }
    if (!header.kid || (header.alg !== 'RS256' && header.alg !== 'ES256')) throw new IdentityError('Unsupported sign-in token.');
    const key = await this.key(header.kid);
    const data = Buffer.from(`${h}.${p}`);
    const ok = header.alg === 'RS256' ? cryptoVerify('RSA-SHA256', data, key, b64url(sig)) : cryptoVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, b64url(sig));
    if (!ok) throw new IdentityError('The sign-in token is not genuine.');
    const now = this.o.now() / 1000;
    if (!this.o.issuers.includes(String(claims.iss))) throw new IdentityError('The sign-in token is from someone else.');
    const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
    if (!aud.some((a) => this.o.audiences.includes(a))) throw new IdentityError('The sign-in token is for another app.');
    if (notification) {
      if (typeof claims.iat !== 'number' || claims.iat > now + 300) throw new IdentityError('The notification has no valid time.');
      if (claims.exp !== undefined && (typeof claims.exp !== 'number' || claims.exp < now - 60)) throw new IdentityError('The notification has expired.');
      return claims;
    }
    if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new IdentityError('The sign-in has expired. Try again.');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new IdentityError('The sign-in token has no account id.');
    return claims;
  }
}

/** Apple's Game Center key certificates live here, and nowhere else is fetched. */
export const GAMECENTER_KEY_HOST = 'static.gc.apple.com';
const GC_MAX_BYTES = 16 * 1024;
const GC_TIMEOUT_MS = 5_000;
const GC_CACHE_SIZE = 16;

/** The key URL if it is one of Apple's Game Center key certificates, else null. */
export function gameCenterKeyUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 300) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== GAMECENTER_KEY_HOST || url.port || url.username || url.password || url.search || url.hash) return null;
  if (!/^\/public-key\/[A-Za-z0-9._-]+\.cer$/.test(url.pathname)) return null;
  return url.href;
}

type GcResponse = { ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; headers?: { get(name: string): string | null }; body?: ReadableStream<Uint8Array> | null };
type GcFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<GcResponse>;

/** Read at most `max` bytes (the stream is cancelled past it). */
async function readCapped(res: GcResponse, max: number): Promise<Buffer> {
  const declared = Number(res.headers?.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > max) throw new IdentityError('The Game Center key is too large.');
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > max) {
        await reader.cancel().catch(() => undefined);
        throw new IdentityError('The Game Center key is too large.');
      }
      parts.push(value);
    }
    return Buffer.concat(parts);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > max) throw new IdentityError('The Game Center key is too large.');
  return buf;
}

/** Game Center identity verification (fetchItems(forIdentityVerificationSignature:)). */
export class GameCenterVerifier {
  /** A small LRU cache of certificates by URL (Map keeps insertion order). */
  private certs = new Map<string, X509Certificate>();
  constructor(private readonly o: { bundleIds: string[]; fetch: Fetch | GcFetch; now: () => number; maxAgeMs?: number }) {}

  private async cert(url: string): Promise<X509Certificate> {
    const hit = this.certs.get(url);
    if (hit) {
      this.certs.delete(url);
      this.certs.set(url, hit);
      return hit;
    }
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new IdentityError('The Game Center key took too long to load.'));
      }, GC_TIMEOUT_MS);
    });
    let cert: X509Certificate;
    try {
      cert = await Promise.race([
        (async () => {
          const res = (await (this.o.fetch as GcFetch)(url, { signal: ctrl.signal })) as GcResponse;
          if (!res.ok) throw new IdentityError('Could not load the Game Center key.');
          const bytes = await readCapped(res, GC_MAX_BYTES);
          try {
            return new X509Certificate(bytes);
          } catch {
            throw new IdentityError('The Game Center key could not be read.');
          }
        })(),
        deadline,
      ]);
    } catch (e) {
      if (e instanceof IdentityError) throw e;
      throw new IdentityError('Could not load the Game Center key.');
    } finally {
      clearTimeout(timer);
    }
    this.certs.set(url, cert);
    while (this.certs.size > GC_CACHE_SIZE) this.certs.delete(this.certs.keys().next().value as string);
    return cert;
  }

  async verify(c: unknown): Promise<string> {
    const v = (c ?? {}) as { teamPlayerId?: string; bundleId?: string; timestamp?: number; salt?: string; signature?: string; publicKeyUrl?: string };
    if (!v.teamPlayerId || !v.bundleId || !Number.isFinite(v.timestamp) || !v.salt || !v.signature || !v.publicKeyUrl) throw new IdentityError('Incomplete Game Center sign-in.');
    if (typeof v.teamPlayerId !== 'string' || typeof v.bundleId !== 'string' || typeof v.salt !== 'string' || typeof v.signature !== 'string') throw new IdentityError('Incomplete Game Center sign-in.');
    if (!this.o.bundleIds.includes(v.bundleId)) throw new IdentityError('The Game Center sign-in is for another app.');
    const keyUrl = gameCenterKeyUrl(v.publicKeyUrl);
    if (!keyUrl) throw new IdentityError('Untrusted Game Center key.');
    if (Math.abs(this.o.now() - Number(v.timestamp)) > (this.o.maxAgeMs ?? 10 * 60_000)) throw new IdentityError('The Game Center sign-in is too old. Try again.');
    const cert = await this.cert(keyUrl);
    const ts = Buffer.alloc(8);
    ts.writeBigUInt64BE(BigInt(Math.floor(Number(v.timestamp))));
    const payload = Buffer.concat([Buffer.from(v.teamPlayerId, 'utf8'), Buffer.from(v.bundleId, 'utf8'), ts, Buffer.from(v.salt, 'base64')]);
    if (!cryptoVerify('RSA-SHA256', payload, cert.publicKey, Buffer.from(v.signature, 'base64'))) throw new IdentityError('The Game Center sign-in is not genuine.');
    return v.teamPlayerId;
  }
}

/** Play Games: exchange the server auth code, then ask who the player is. */
export class PlayGamesVerifier {
  constructor(private readonly o: { clientId: string; clientSecret: string; fetch: Fetch }) {}

  async verify(c: unknown): Promise<string> {
    const code = (c as { serverAuthCode?: string } | null)?.serverAuthCode;
    if (typeof code !== 'string' || !code) throw new IdentityError('Missing Play Games sign-in.');
    const body = new URLSearchParams({ code, client_id: this.o.clientId, client_secret: this.o.clientSecret, grant_type: 'authorization_code', redirect_uri: '' }).toString();
    const tok = await this.o.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!tok.ok) throw new IdentityError('Play Games did not accept the sign-in.');
    const { access_token } = (await tok.json()) as { access_token?: string };
    const me = await this.o.fetch('https://games.googleapis.com/games/v1/players/me', { headers: { authorization: `Bearer ${access_token}` } });
    if (!me.ok) throw new IdentityError('Play Games did not say who you are.');
    const { playerId } = (await me.json()) as { playerId?: string };
    if (!playerId) throw new IdentityError('Play Games did not say who you are.');
    return playerId;
  }
}

/** The configured providers, from environment settings. */
export function verifierFromEnv(env: Record<string, string | undefined>, fetch: Fetch = globalThis.fetch as unknown as Fetch, now: () => number = Date.now): IdentityVerifier {
  const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const apple = list(env.APPLE_CLIENT_IDS).length ? new JwtVerifier({ jwksUrl: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'], audiences: list(env.APPLE_CLIENT_IDS), fetch, now }) : null;
  const google = list(env.GOOGLE_CLIENT_IDS).length ? new JwtVerifier({ jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'], audiences: list(env.GOOGLE_CLIENT_IDS), fetch, now }) : null;
  const gc = list(env.GAMECENTER_BUNDLE_IDS).length ? new GameCenterVerifier({ bundleIds: list(env.GAMECENTER_BUNDLE_IDS), fetch, now }) : null;
  const pg = env.PLAYGAMES_CLIENT_ID && env.PLAYGAMES_CLIENT_SECRET ? new PlayGamesVerifier({ clientId: env.PLAYGAMES_CLIENT_ID, clientSecret: env.PLAYGAMES_CLIENT_SECRET, fetch }) : null;
  return combineVerifiers({ apple, google, gamecenter: gc, playgames: pg });
}

export function combineVerifiers(v: { apple?: JwtVerifier | null; google?: JwtVerifier | null; gamecenter?: GameCenterVerifier | null; playgames?: PlayGamesVerifier | null }): IdentityVerifier {
  const apple = v.apple;
  return {
    providers: PROVIDERS.filter((p) => v[p]),
    ...(apple
      ? {
          async appleNotification(jwt: unknown) {
            const claims = await apple.verifyNotification(jwt);
            let events: { type?: unknown; sub?: unknown } = {};
            try {
              events = typeof claims.events === 'string' ? JSON.parse(claims.events) : ((claims.events ?? {}) as typeof events);
            } catch {
              throw new IdentityError('The notification has no readable events.');
            }
            if (typeof events.type !== 'string' || typeof events.sub !== 'string' || !events.sub) throw new IdentityError('The notification has no event.');
            return { type: events.type, sub: events.sub };
          },
        }
      : {}),
    async verify(provider, credential) {
      switch (provider) {
        case 'apple':
        case 'google': {
          const j = v[provider];
          if (!j) throw new IdentityError(`${provider === 'apple' ? 'Sign in with Apple' : 'Google sign-in'} is not set up on this server.`);
          const claims = await j.verify((credential as { idToken?: unknown } | null)?.idToken);
          const aud = Array.isArray(claims.aud) ? String(claims.aud[0]) : String(claims.aud);
          // Apple: the client id the code was issued to (token exchange/revocation, appleTokens.ts).
          return { provider, subject: String(claims.sub), ...(provider === 'apple' ? { audience: aud } : {}) };
        }
        case 'gamecenter':
          if (!v.gamecenter) throw new IdentityError('Game Center is not set up on this server.');
          return { provider, subject: await v.gamecenter.verify(credential) };
        case 'playgames':
          if (!v.playgames) throw new IdentityError('Play Games is not set up on this server.');
          return { provider, subject: await v.playgames.verify(credential) };
        default:
          throw new IdentityError('Unknown sign-in provider.');
      }
    },
  };
}

/** A server with no sign-in providers configured (the default, and tests that don't need it). */
export const noIdentity: IdentityVerifier = combineVerifiers({});
