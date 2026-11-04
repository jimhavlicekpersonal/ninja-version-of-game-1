import { filterText } from '../../src/gameplay/sim/social/grove';
import { PROTOCOL_VERSION, type HelloResponse, type PlayerView, type RegisterResponse } from '../../src/backend/net/protocol';
import type { Player } from '../repo';
import { ApiError, HOUR, MIN, type ServerContext } from './context';

/** The oldest game this server serves (protocol 7: villages kept on the server, client headers, idempotent writes). */
export const MIN_PROTOCOL = 7;

export const FEATURES = ['pvp', 'leaderboard', 'groves', 'grove-chat', 'donations', 'grove-raid'];

export function hello(ctx: ServerContext): HelloResponse {
  return { name: 'toadstool-kingdoms', protocol: PROTOCOL_VERSION, minProtocol: MIN_PROTOCOL, serverTime: ctx.now(), features: [...FEATURES, 'warriors-50', 'defense-counters', 'server-seed', 'account-deletion', 'reports', 'blocks', 'server-economy', 'village-import', 'links', 'power-ranking'] };
}

export function cleanName(raw: unknown, ctx: ServerContext): string {
  const s = filterText(String(raw ?? '').replace(/\s+/g, ' ').trim(), ctx.data).slice(0, 24);
  return s.length >= 2 ? s : 'Ruler';
}

export async function register(ctx: ServerContext, name: unknown): Promise<RegisterResponse> {
  const token = ctx.newToken();
  const t = ctx.now();
  const player: Player = {
    id: ctx.uuid(),
    name: cleanName(name, ctx),
    tokenHash: await ctx.hash(token),
    trophies: ctx.data.ranks.startingTrophies,
    hallLevel: 1,
    shieldUntil: t + ctx.data.raids.newPlayerShieldHours * HOUR,
    base: null,
    groveId: null,
    createdAt: t,
    updatedAt: t,
    lastSeenAt: t,
    mutedUntil: 0,
  };
  await ctx.repo.createPlayer(player);
  return { playerId: player.id, token };
}

/** Find the player behind a bearer token, and note that they were seen. */
export async function authenticate(ctx: ServerContext, token: string | undefined): Promise<Player> {
  const p = token ? await ctx.repo.playerByTokenHash(await ctx.hash(token)) : null;
  if (!p) throw new ApiError(401, 'unauthorized', 'Unknown or missing player token.');
  const t = ctx.now();
  if (t - p.lastSeenAt > MIN) {
    await ctx.repo.updatePlayer(p.id, { lastSeenAt: t });
    p.lastSeenAt = t;
  }
  return p;
}

export function playerView(p: Player): PlayerView {
  return { id: p.id, name: p.name, trophies: p.trophies, hallLevel: p.hallLevel, shieldUntil: p.shieldUntil, groveId: p.groveId };
}

export async function rename(ctx: ServerContext, me: Player, name: unknown): Promise<PlayerView> {
  const clean = cleanName(name, ctx);
  await ctx.repo.updatePlayer(me.id, { name: clean, updatedAt: ctx.now() });
  return playerView({ ...me, name: clean });
}
