/**
 * Linked sign-ins = cloud save (roadmap step 24). A player links Apple,
 * Google, Game Center or Play Games to their account; on another device,
 * signing in with it gives that device its own token for the same player
 * (and, with a village kept on the server, the same village).
 */
import type { LinkProvider, LinksResponse, RegisterResponse } from '../../src/backend/net/protocol';
import { IdentityError, PROVIDERS, type Provider } from '../identity/verify';
import type { Player } from '../repo';
import { ApiError, type ServerContext } from './context';

async function check(ctx: ServerContext, provider: unknown, credential: unknown): Promise<{ provider: Provider; subject: string }> {
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
  return links(ctx, me);
}

export async function unlink(ctx: ServerContext, me: Player, provider: string): Promise<LinksResponse> {
  await ctx.repo.removeLink(me.id, provider);
  return links(ctx, me);
}

/** Sign in on this device with a linked account: a new token for that player (the other devices keep theirs). */
export async function signIn(ctx: ServerContext, body: { provider?: unknown; credential?: unknown; device?: unknown } | undefined): Promise<RegisterResponse> {
  const id = await check(ctx, body?.provider, body?.credential);
  const playerId = await ctx.repo.playerByIdentity(id.provider, id.subject);
  if (!playerId) throw new ApiError(404, 'not_found', 'No player is linked to that account yet. Link it from the device you play on first.');
  const token = ctx.newToken();
  await ctx.repo.addToken(playerId, await ctx.hash(token), ctx.now(), String(body?.device ?? '').slice(0, 40));
  return { playerId, token };
}
