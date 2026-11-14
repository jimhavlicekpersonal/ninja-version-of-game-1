/**
 * Linked sign-ins = cloud save (roadmap step 24). A player links Apple,
 * Google, Game Center or Play Games to their account; on another device,
 * signing in with it gives that device its own token for the same player
 * (and, with a village kept on the server, the same village).
 */
import { createHash } from 'node:crypto';
import type { AuthNonceResponse, LinkProvider, LinksResponse, RegisterResponse, RevokeOthersResponse } from '../../src/backend/net/protocol';
import { IdentityError, PROVIDERS, type Provider } from '../identity/verify';
import { REVOKED_TOKEN_PREFIX, type Player } from '../repo';
import { ApiError, type ServerContext } from './context';
import { notify } from './moderation';

async function check(ctx: ServerContext, provider: unknown, credential: unknown): Promise<{ provider: Provider; subject: string; audience?: string }> {
  if (!PROVIDERS.includes(provider as Provider)) throw new ApiError(400, 'bad_request', 'Unknown sign-in provider.');
  let id;
  try {
    id = await ctx.identity.verify(provider as Provider, credential);
  } catch (e) {
    if (e instanceof IdentityError) throw new ApiError(400, 'bad_request', e.message);
    throw e;
  }
  await checkNonce(ctx, id, credential);
  return id;
}

/** How long a sign-in nonce can be used (the provider's own sheet, a slow network). */
export const NONCE_TTL_MS = 10 * 60_000;

/** POST /v1/auth/nonce (backend A15): a random one-time value for the provider to put in its ID token. */
export async function issueNonce(ctx: ServerContext): Promise<AuthNonceResponse> {
  const nonce = ctx.newToken();
  const expiresAt = ctx.now() + NONCE_TTL_MS;
  await ctx.repo.addNonce(nonce, expiresAt);
  return { nonce, expiresAt };
}

/**
 * Backend A15: an Apple or Google ID token is bound to a nonce the server issued, and the nonce is used up,
 * so a token copied from a log, an SDK or a proxy cannot mint a device token again within its lifetime.
 * The game sends the raw nonce next to the token; the token carries it as it is (Google, Apple on the web)
 * or as its SHA-256 hex (Sign in with Apple native). Games from before this send none: accepted unless
 * SIGNIN_NONCE_REQUIRED=1 (owner decision once every supported build sends one).
 */
async function checkNonce(ctx: ServerContext, id: { provider: Provider; nonce?: string }, credential: unknown): Promise<void> {
  if (id.provider !== 'apple' && id.provider !== 'google') return;
  const raw = (credential as { nonce?: unknown } | null)?.nonce;
  if (raw === undefined || raw === null || raw === '') {
    if (ctx.policy.signInNonceRequired) {
      ctx.metrics.count('tk_signin_nonce_total', { result: 'missing' });
      throw new ApiError(400, 'bad_request', 'This sign-in needs a newer version of Kagemura. Update the game and try again.');
    }
    ctx.metrics.count('tk_signin_nonce_total', { result: 'legacy' });
    return;
  }
  const hashed = typeof raw === 'string' ? createHash('sha256').update(raw).digest('hex') : '';
  if (typeof raw !== 'string' || !id.nonce || (id.nonce !== raw && id.nonce.toLowerCase() !== hashed)) {
    ctx.metrics.count('tk_signin_nonce_total', { result: 'mismatch' });
    throw new ApiError(400, 'bad_request', 'The sign-in does not match this request. Try again.');
  }
  if (!(await ctx.repo.useNonce(raw, ctx.now()))) {
    ctx.metrics.count('tk_signin_nonce_total', { result: 'used' });
    throw new ApiError(400, 'bad_request', 'This sign-in was already used or has expired. Try again.');
  }
  ctx.metrics.count('tk_signin_nonce_total', { result: 'ok' });
}

export async function links(ctx: ServerContext, me: Player): Promise<LinksResponse> {
  return { providers: ctx.identity.providers, links: (await ctx.repo.linksOf(me.id)).map((l) => ({ provider: l.provider as LinkProvider, linkedAt: l.linkedAt })) };
}

export async function link(ctx: ServerContext, me: Player, body: { provider?: unknown; credential?: unknown } | undefined): Promise<LinksResponse> {
  const id = await check(ctx, body?.provider, body?.credential);
  const owner = await ctx.repo.playerByIdentity(id.provider, id.subject);
  if (owner && owner !== me.id) throw new ApiError(409, 'conflict', 'That sign-in already belongs to another player. Use "Sign in on this device" to switch to it.');
  if (!owner && !(await ctx.repo.addLink({ provider: id.provider, subject: id.subject, playerId: me.id, linkedAt: ctx.now() }))) {
    throw new ApiError(409, 'conflict', 'You already linked another account from that provider. Unlink it first.');
  }
  await keepAppleToken(ctx, id, body?.credential);
  return links(ctx, me);
}

/**
 * Unlink a provider: its stored Apple refresh token is revoked (best effort),
 * and the devices that signed in with it are signed out (all but this one).
 * Backend A16: the calling device's token always stays, so unlinking never removes the account's last
 * key by itself; signing that device out afterwards is what `signOutDevice` refuses when nothing else is left.
 */
export async function unlink(ctx: ServerContext, me: Player, provider: string): Promise<LinksResponse> {
  const tokens = (await ctx.repo.linkTokensOf(me.id)).filter((t) => t.provider === provider);
  await ctx.repo.removeLink(me.id, provider);
  const n = await ctx.repo.revokeTokens(me.id, provider, me.session);
  if (n) ctx.metrics.count('tk_sessions_revoked_total', { reason: 'unlink' }, n);
  await revokeAppleTokens(ctx, tokens, 'unlink');
  return links(ctx, me);
}

/** POST /v1/sessions/revoke-others: sign out every other device of this account. */
export async function revokeOthers(ctx: ServerContext, me: Player): Promise<RevokeOthersResponse> {
  if (!me.session) throw new ApiError(400, 'bad_request', 'Sign in on this device first.');
  const revoked = await ctx.repo.revokeOtherTokens(me.id, me.session);
  if (revoked) ctx.metrics.count('tk_sessions_revoked_total', { reason: 'others' }, revoked);
  return { revoked };
}

/**
 * Extra device tokens not used for this long are deleted (retention.ts). The first device's token is the account itself and stays.
 * Backend A16: SESSION_IDLE_DAYS (`ctx.policy.sessionIdleDays`) changes it; every use renews it (sliding expiry).
 */
export const TOKEN_UNUSED_DAYS = 400;

export async function pruneTokens(ctx: ServerContext): Promise<number> {
  const n = await ctx.repo.pruneTokens(ctx.now() - (ctx.policy.sessionIdleDays || TOKEN_UNUSED_DAYS) * 24 * 3_600_000);
  if (n) ctx.metrics.count('tk_sessions_revoked_total', { reason: 'prune' }, n);
  // Rotations nobody confirmed in time (the old token stayed): nothing to keep.
  await ctx.repo.pruneRotations(ctx.now() - ROTATE_CONFIRM_MS);
  return n;
}

const scopeOf = (hash: string) => hash.slice(0, 32);

/**
 * Backend A16 (2026-11-14 verification fix): how many ways back into the account would remain without the
 * token `dropToken`: working tokens (the first token unless signed out, other devices' tokens; pending
 * rotations do not count, they lapse) and linked sign-ins.
 */
async function keysLeft(ctx: ServerContext, me: Player, dropToken: string): Promise<number> {
  const keys = await ctx.repo.keysOf(me.id);
  const tokens = [...(keys.main ? [keys.main] : []), ...keys.devices.map((d) => d.hash)].filter((h) => h !== dropToken);
  return tokens.length + (await ctx.repo.linksOf(me.id)).length;
}

/**
 * DELETE /v1/sessions/current (backend A16): sign out this device. Its token stops working at once and the
 * answers remembered for it go. Refused when this token is the account's last way back in (no other
 * working token, no linked sign-in: 2026-11-14 verification fix, whichever token it is): link a sign-in
 * first, or delete the account.
 */
export async function signOutDevice(ctx: ServerContext, me: Player): Promise<void> {
  const hash = me.session;
  if (!hash) throw new ApiError(400, 'bad_request', 'Sign in on this device first.');
  if (!(await keysLeft(ctx, me, hash))) {
    throw new ApiError(409, 'conflict', 'This device holds the only key to this account. Link Apple, Google or Game Center first (then you can sign back in), or delete the account.');
  }
  // A hash no token can have: the device's token no longer finds the player.
  await ctx.repo.replaceToken(me.id, hash, `${REVOKED_TOKEN_PREFIX}${ctx.uuid()}`);
  await ctx.repo.dropRotations(hash);
  await ctx.repo.dropIdempotentScopes([scopeOf(hash)]);
  ctx.metrics.count('tk_sessions_revoked_total', { reason: 'current' });
}

/** Backend A16 (2026-11-14): how long a rotated token waits for its first use before the rotation lapses. */
export const ROTATE_CONFIRM_MS = 10 * 60_000;

/**
 * POST /v1/sessions/rotate (backend A16): a new token for this device in place of the one it sent. Games
 * that support it rotate now and then, so a token copied from the device (localStorage on the web) stops
 * being useful. 2026-11-14 verification fix: the swap happens on the new token's first use (within
 * ROTATE_CONFIRM_MS, `confirmRotation`); until then the old token keeps working, so an answer lost on the
 * network (the only key of an anonymous account) never locks the player out. A rotation nobody confirms
 * lapses and the old token stays.
 */
export async function rotateToken(ctx: ServerContext, me: Player): Promise<RegisterResponse> {
  const hash = me.session;
  if (!hash) throw new ApiError(400, 'bad_request', 'Sign in on this device first.');
  const token = ctx.newToken();
  await ctx.repo.addRotation({ newHash: await ctx.hash(token), oldHash: hash, playerId: me.id, at: ctx.now() });
  return { playerId: me.id, token };
}

/**
 * The first request with a rotated token (identity.ts `authenticate`): the old token stops working, the
 * answers remembered for it go, and other rotations of it lapse. Null when `hash` is no pending rotation,
 * it lapsed, or the old token was signed out or revoked meanwhile.
 */
export async function confirmRotation(ctx: ServerContext, hash: string): Promise<Player | null> {
  const r = await ctx.repo.rotationOf(hash);
  if (!r || ctx.now() - r.at > ROTATE_CONFIRM_MS) return null;
  const swapped = await ctx.repo.replaceToken(r.playerId, r.oldHash, hash);
  await ctx.repo.dropRotations(r.oldHash);
  if (swapped) {
    await ctx.repo.dropIdempotentScopes([scopeOf(r.oldHash)]);
    ctx.metrics.count('tk_sessions_revoked_total', { reason: 'rotate' });
  }
  // Not swapped: a request at the same moment did it (the token now finds the player), or the old token is gone.
  return ctx.repo.playerByTokenHash(hash);
}

/** Sign in with Apple: exchange the one-time authorization code for a refresh token to revoke later (5.1.1(v)). */
async function keepAppleToken(ctx: ServerContext, id: { provider: Provider; subject: string; audience?: string }, credential: unknown): Promise<void> {
  if (id.provider !== 'apple') return;
  const code = (credential as { authorizationCode?: unknown } | null)?.authorizationCode;
  if (typeof code !== 'string' || !code) return;
  const client = ctx.account?.appleTokens;
  if (!client) {
    ctx.log('info', 'Sign in with Apple: no APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY, the authorization code is not exchanged (nothing to revoke later)');
    return;
  }
  const clientId = id.audience ?? '';
  const refresh = await client.exchange(code, clientId).catch(() => null);
  if (refresh) await ctx.repo.setLinkToken('apple', id.subject, refresh, clientId);
}

/** Revoke stored Apple refresh tokens: best effort, logged, never thrown (a deletion never waits on Apple failing). */
export async function revokeAppleTokens(ctx: ServerContext, tokens: { provider: string; refreshToken: string; clientId: string | null }[], why: 'delete' | 'unlink' | 'notification'): Promise<void> {
  for (const t of tokens) {
    if (t.provider !== 'apple') continue;
    const client = ctx.account?.appleTokens;
    if (!client || !t.clientId) {
      ctx.log('warn', 'Sign in with Apple: a refresh token could not be revoked (not configured)', { why });
      ctx.metrics.count('tk_apple_revocations_total', { trigger: why, result: 'skipped' });
      continue;
    }
    const ok = await client.revoke(t.refreshToken, t.clientId).catch(() => false);
    if (!ok) ctx.log('warn', 'Sign in with Apple: revoking a refresh token failed', { why });
    ctx.metrics.count('tk_apple_revocations_total', { trigger: why, result: ok ? 'ok' : 'failed' });
  }
}

/**
 * POST /v1/webhooks/apple-signin: Sign in with Apple server-to-server
 * notifications ({ payload: JWT } signed by Apple). `consent-revoked`: the
 * person stopped using Sign in with Apple with this app, so the link goes and
 * the devices it signed in are signed out. `account-delete`: their Apple
 * account is gone, so their game account is deleted. Email events are ignored
 * (no email is kept).
 */
export async function appleSignInNotification(ctx: ServerContext, body: { payload?: unknown } | undefined): Promise<void> {
  const verify = ctx.identity.appleNotification;
  if (!verify) throw new ApiError(404, 'not_found', 'Sign in with Apple is not set up on this server.');
  let ev: { type: string; sub: string };
  try {
    ev = await verify(body?.payload);
  } catch (e) {
    if (e instanceof IdentityError) throw new ApiError(400, 'bad_request', e.message);
    throw e;
  }
  const playerId = await ctx.repo.playerByIdentity('apple', ev.sub);
  if (!playerId) return;
  if (ev.type === 'consent-revoked') {
    // Apple already ended the grant: just forget the token, the link and its devices.
    await ctx.repo.removeLink(playerId, 'apple');
    const n = await ctx.repo.revokeTokens(playerId, 'apple');
    if (n) ctx.metrics.count('tk_sessions_revoked_total', { reason: 'unlink' }, n);
    ctx.log('info', 'Sign in with Apple: consent revoked, link removed', { playerId });
  } else if (ev.type === 'account-delete') {
    // Backend A29: the Apple ID is gone, but the game account may also be reached through Google, Game
    // Center or the first device's token. It is not deleted at once: the Apple link and its devices go now,
    // the player gets a notice, and a verified deletion request waits in the staff queue (the same path and
    // grace as a web request), so staff delete it unless the player answers that they still use it.
    const p = await ctx.repo.getPlayer(playerId);
    if (!p) return;
    await ctx.repo.removeLink(playerId, 'apple');
    const n = await ctx.repo.revokeTokens(playerId, 'apple');
    if (n) ctx.metrics.count('tk_sessions_revoked_total', { reason: 'unlink' }, n);
    const at = ctx.now();
    await ctx.repo.addDeletionRequest({ id: ctx.uuid(), at, playerId, name: p.name, contact: '', note: 'Sign in with Apple: the Apple account was deleted (server-to-server notification).', status: 'open', resolvedAt: null, resolution: null, verified: true });
    await notify(ctx, playerId, 'account', 'The Apple account linked to this game account was deleted, so Sign in with Apple was removed. This game account will be deleted after a short review. If you still play it, contact support from Settings → Privacy and help.');
    ctx.log('info', 'Sign in with Apple: Apple account deleted, deletion request queued for staff', { playerId });
  }
}

/** Sign in on this device with a linked account: a new token for that player (the other devices keep theirs). */
export async function signIn(ctx: ServerContext, body: { provider?: unknown; credential?: unknown; device?: unknown } | undefined): Promise<RegisterResponse> {
  const id = await check(ctx, body?.provider, body?.credential);
  const playerId = await ctx.repo.playerByIdentity(id.provider, id.subject);
  if (!playerId) throw new ApiError(404, 'not_found', 'No player is linked to that account yet. Link it from the device you play on first.');
  const token = ctx.newToken();
  // The token remembers which sign-in made it: unlinking that provider signs this device out.
  await ctx.repo.addToken(playerId, await ctx.hash(token), ctx.now(), String(body?.device ?? '').slice(0, 40), id.provider);
  // A fresh Apple code replaces the refresh token kept for revocation.
  await keepAppleToken(ctx, id, body?.credential);
  return { playerId, token };
}
