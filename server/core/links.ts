/**
 * Linked sign-ins = cloud save (roadmap step 24). A player links Apple,
 * Google, Game Center or Play Games to their account; on another device,
 * signing in with it gives that device its own token for the same player
 * (and, with a village kept on the server, the same village).
 */
import type { LinkProvider, LinksResponse, RegisterResponse, RevokeOthersResponse } from '../../src/backend/net/protocol';
import { IdentityError, PROVIDERS, type Provider } from '../identity/verify';
import type { Player } from '../repo';
import { ApiError, type ServerContext } from './context';

async function check(ctx: ServerContext, provider: unknown, credential: unknown): Promise<{ provider: Provider; subject: string; audience?: string }> {
  if (!PROVIDERS.includes(provider as Provider)) throw new ApiError(400, 'bad_request', 'Unknown sign-in provider.');
  try {
    return await ctx.identity.verify(provider as Provider, credential);
  } catch (e) {
    if (e instanceof IdentityError) throw new ApiError(400, 'bad_request', e.message);
    throw e;
  }
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

/** Extra device tokens not used for this long are deleted (retention.ts). The first device's token is the account itself and stays. */
export const TOKEN_UNUSED_DAYS = 400;

export async function pruneTokens(ctx: ServerContext): Promise<number> {
  const n = await ctx.repo.pruneTokens(ctx.now() - TOKEN_UNUSED_DAYS * 24 * 3_600_000);
  if (n) ctx.metrics.count('tk_sessions_revoked_total', { reason: 'prune' }, n);
  return n;
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
export async function appleSignInNotification(ctx: ServerContext, body: { payload?: unknown } | undefined, deleteAccount: (p: Player) => Promise<void>): Promise<void> {
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
    const p = await ctx.repo.getPlayer(playerId);
    if (p) await deleteAccount(p);
    ctx.log('info', 'Sign in with Apple: Apple account deleted, game account deleted', { playerId });
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
