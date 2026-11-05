/**
 * Sign in with Apple token revocation (re-audit; App Review 5.1.1(v): an app
 * offering Sign in with Apple revokes the user's tokens when they delete
 * their account). At link time the game also sends the one-time
 * `authorizationCode`; the server exchanges it for a refresh token at
 * https://appleid.apple.com/auth/token and keeps it (identity_links,
 * migration 0025). Deleting the account or unlinking Apple calls
 * https://appleid.apple.com/auth/revoke with it.
 *
 * The client secret is an ES256 JWT signed with the team's Sign in with Apple
 * key: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 PEM; "\n" may be
 * written as a literal backslash-n). The client id is the audience the ID token
 * was issued to (the bundle id from the app, the Services ID from the web),
 * one of APPLE_CLIENT_IDS. Without these settings nothing is exchanged or
 * revoked, and the server logs that.
 *
 * Every call is best effort: a 5 s timeout, never thrown at the caller (a
 * deletion never waits on Apple or fails because of it).
 */
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

export type TokenFetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface AppleTokenClient {
  /** The refresh token for this authorization code, or null (refused, unreachable). */
  exchange(code: string, clientId: string): Promise<string | null>;
  /** True when Apple accepted the revocation. */
  revoke(refreshToken: string, clientId: string): Promise<boolean>;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const TIMEOUT_MS = 5_000;

export class AppleSignInTokens implements AppleTokenClient {
  private readonly key: KeyObject;
  constructor(
    private readonly o: {
      teamId: string;
      keyId: string;
      privateKey: string;
      clientIds: string[];
      fetch: TokenFetch;
      now: () => number;
      log?: (level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void;
    },
  ) {
    this.key = createPrivateKey(o.privateKey.replace(/\\n/g, '\n'));
  }

  /** The client secret: an ES256 JWT for `clientId`, valid for 5 minutes (Apple allows up to 6 months). */
  clientSecret(clientId: string): string {
    const iat = Math.floor(this.o.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'ES256', kid: this.o.keyId }));
    const body = b64url(JSON.stringify({ iss: this.o.teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: clientId }));
    const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: this.key, dsaEncoding: 'ieee-p1363' });
    return `${head}.${body}.${b64url(sig)}`;
  }

  private async post(url: string, form: Record<string, string>): Promise<{ ok: boolean; status: number; json(): Promise<unknown> } | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await this.o.fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString(), signal: ctrl.signal });
    } catch (e) {
      this.o.log?.('warn', 'Sign in with Apple: request failed', { url, error: (e as Error)?.message ?? String(e) });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async exchange(code: string, clientId: string): Promise<string | null> {
    if (!code || !this.o.clientIds.includes(clientId)) return null;
    const res = await this.post('https://appleid.apple.com/auth/token', { client_id: clientId, client_secret: this.clientSecret(clientId), code, grant_type: 'authorization_code' });
    if (!res) return null;
    if (!res.ok) {
      this.o.log?.('warn', 'Sign in with Apple: code exchange refused', { status: res.status });
      return null;
    }
    const json = (await res.json().catch(() => ({}))) as { refresh_token?: unknown };
    return typeof json.refresh_token === 'string' && json.refresh_token ? json.refresh_token : null;
  }

  async revoke(refreshToken: string, clientId: string): Promise<boolean> {
    if (!refreshToken || !this.o.clientIds.includes(clientId)) return false;
    const res = await this.post('https://appleid.apple.com/auth/revoke', { client_id: clientId, client_secret: this.clientSecret(clientId), token: refreshToken, token_type_hint: 'refresh_token' });
    if (!res) return false;
    if (!res.ok) this.o.log?.('warn', 'Sign in with Apple: revoke refused', { status: res.status });
    return res.ok;
  }
}

/** Account settings from the environment: SUPPORT_CONTACT and the Sign in with Apple key. */
export interface AccountSettings {
  /** Where players appeal a moderation decision (an email address or URL), named in notices. */
  supportContact?: string;
  /** Null: Sign in with Apple tokens are not exchanged or revoked (logged). */
  appleTokens?: AppleTokenClient | null;
}

export function accountFromEnv(env: Record<string, string | undefined>, fetch: TokenFetch = globalThis.fetch as unknown as TokenFetch, now: () => number = Date.now, log?: (level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void): AccountSettings {
  const clientIds = (env.APPLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let appleTokens: AppleTokenClient | null = null;
  if (env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY && clientIds.length) {
    try {
      appleTokens = new AppleSignInTokens({ teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_KEY_ID, privateKey: env.APPLE_PRIVATE_KEY, clientIds, fetch, now, log });
    } catch (e) {
      log?.('error', 'Sign in with Apple: APPLE_PRIVATE_KEY could not be read; tokens will not be revoked', { error: (e as Error).message });
    }
  }
  return { supportContact: env.SUPPORT_CONTACT?.trim() || undefined, appleTokens };
}
