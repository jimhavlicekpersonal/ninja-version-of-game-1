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
 *   publicKeyURL (only https on *.apple.com).
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
}

export interface IdentityVerifier {
  /** Which providers this server can check (the game only offers these). */
  readonly providers: Provider[];
  verify(provider: Provider, credential: unknown): Promise<VerifiedIdentity>;
}

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** A JWT checked against a JWKS: signature, issuer, audience, expiry. */
export class JwtVerifier {
  private keys: { at: number; byKid: Map<string, KeyObject> } | null = null;

  constructor(
    private readonly o: { jwksUrl: string; issuers: string[]; audiences: string[]; fetch: Fetch; now: () => number; cacheMs?: number },
  ) {}

  private async key(kid: string): Promise<KeyObject> {
    const fresh = this.keys && this.o.now() - this.keys.at < (this.o.cacheMs ?? 3_600_000);
    if (!fresh || !this.keys!.byKid.has(kid)) {
      const res = await this.o.fetch(this.o.jwksUrl);
      if (!res.ok) throw new IdentityError(`Could not load sign-in keys (${res.status}).`);
      const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
      this.keys = { at: this.o.now(), byKid: new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])) };
    }
    const k = this.keys!.byKid.get(kid);
    if (!k) throw new IdentityError('Unknown sign-in key.');
    return k;
  }

  async verify(token: unknown): Promise<Record<string, unknown>> {
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
    if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new IdentityError('The sign-in has expired. Try again.');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new IdentityError('The sign-in token has no account id.');
    return claims;
  }
}

/** Game Center identity verification (fetchItems(forIdentityVerificationSignature:)). */
export class GameCenterVerifier {
  private certs = new Map<string, X509Certificate>();
  constructor(private readonly o: { bundleIds: string[]; fetch: Fetch; now: () => number; maxAgeMs?: number }) {}

  async verify(c: unknown): Promise<string> {
    const v = (c ?? {}) as { teamPlayerId?: string; bundleId?: string; timestamp?: number; salt?: string; signature?: string; publicKeyUrl?: string };
    if (!v.teamPlayerId || !v.bundleId || !Number.isFinite(v.timestamp) || !v.salt || !v.signature || !v.publicKeyUrl) throw new IdentityError('Incomplete Game Center sign-in.');
    if (!this.o.bundleIds.includes(v.bundleId)) throw new IdentityError('The Game Center sign-in is for another app.');
    const url = new URL(v.publicKeyUrl);
    if (url.protocol !== 'https:' || !(url.hostname === 'apple.com' || url.hostname.endsWith('.apple.com'))) throw new IdentityError('Untrusted Game Center key.');
    if (Math.abs(this.o.now() - Number(v.timestamp)) > (this.o.maxAgeMs ?? 10 * 60_000)) throw new IdentityError('The Game Center sign-in is too old. Try again.');
    let cert = this.certs.get(v.publicKeyUrl);
    if (!cert) {
      const res = await this.o.fetch(v.publicKeyUrl);
      if (!res.ok) throw new IdentityError('Could not load the Game Center key.');
      cert = new X509Certificate(Buffer.from(await res.arrayBuffer()));
      this.certs.set(v.publicKeyUrl, cert);
    }
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
  return {
    providers: PROVIDERS.filter((p) => v[p]),
    async verify(provider, credential) {
      switch (provider) {
        case 'apple':
        case 'google': {
          const j = v[provider];
          if (!j) throw new IdentityError(`${provider === 'apple' ? 'Sign in with Apple' : 'Google sign-in'} is not set up on this server.`);
          return { provider, subject: String((await j.verify((credential as { idToken?: unknown } | null)?.idToken)).sub) };
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
