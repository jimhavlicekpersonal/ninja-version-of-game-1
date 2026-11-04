import { filterText } from '../../src/gameplay/sim/social/grove';
import { PROTOCOL_VERSION, type HelloResponse, type PlayerView, type RegisterResponse } from '../../src/backend/net/protocol';
import type { Player } from '../repo';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { changeName, claimableName, newFriendCode, withNameClash } from './friends';
import { purchaseFeatures } from './purchases';

/** The oldest game this server serves (protocol 7: villages kept on the server, client headers, idempotent writes). */
export const MIN_PROTOCOL = 7;

export const FEATURES = ['pvp', 'leaderboard', 'groves', 'grove-chat', 'donations', 'grove-raid'];

export function hello(ctx: ServerContext): HelloResponse {
  return { name: 'toadstool-kingdoms', protocol: PROTOCOL_VERSION, minProtocol: MIN_PROTOCOL, serverTime: ctx.now(), features: [...FEATURES, 'warriors-50', 'defense-counters', 'server-seed', 'account-deletion', 'reports', 'blocks', 'server-economy', 'village-import', 'links', 'power-ranking', 'season-archive', 'friends', 'gangs', 'duels', ...purchaseFeatures(ctx), ...(ctx.push.enabled ? ['push'] : [])] };
}

export function cleanName(raw: unknown, ctx: ServerContext): string {
  const s = filterText(String(raw ?? '').replace(/\s+/g, ' ').trim(), ctx.data).slice(0, 24);
  return s.length >= 2 ? s : 'Ruler';
}

export async function register(ctx: ServerContext, rawName: unknown): Promise<RegisterResponse> {
  // One unique name (step 59): refused with a reason and suggestions, never silently changed.
  const { name, key } = await claimableName(ctx, rawName, null);
  const token = ctx.newToken();
  const t = ctx.now();
  const player: Player = {
    id: ctx.uuid(),
    name,
    nameKey: key,
    friendCode: newFriendCode(ctx),
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
  await withNameClash(ctx, name, () => ctx.repo.createPlayer(player));
  return { playerId: player.id, token };
}

/** Find the player behind a bearer token, and note that they were seen. */
export async function authenticate(ctx: ServerContext, token: string | undefined): Promise<Player> {
  const p = token ? await ctx.repo.playerByTokenHash(await ctx.hash(token)) : null;
  if (!p) throw new ApiError(401, 'unauthorized', 'Unknown or missing player token.');
  const t = ctx.now();
  if (p.bannedUntil) {
    if (p.bannedUntil > t) throw new ApiError(403, 'banned', `This account is suspended from online play until ${new Date(p.bannedUntil).toUTCString()}${p.banReason ? `: ${p.banReason}` : ''}. Your village on this device is not affected.`);
    // The suspension is over: back on the ladders.
    await ctx.repo.updatePlayer(p.id, { bannedUntil: 0, banReason: null });
    if (p.base) await ctx.board.set(p.id, p.trophies, p.createdAt);
    p.bannedUntil = 0;
  }
  if (t - p.lastSeenAt > MIN) {
    await ctx.repo.updatePlayer(p.id, { lastSeenAt: t });
    p.lastSeenAt = t;
  }
  return p;
}

export function playerView(p: Player, ctx?: ServerContext): PlayerView {
  const changeAt = p.nameChangeFree || !ctx ? 0 : Math.max(0, (p.nameChangedAt ?? 0) + ctx.data.names.playerNameRules.changeEveryDays * 24 * HOUR);
  return { id: p.id, name: p.name, trophies: p.trophies, hallLevel: p.hallLevel, shieldUntil: p.shieldUntil, groveId: p.groveId, ...(p.friendCode ? { friendCode: p.friendCode } : {}), nameChangeAt: p.nameChangedAt ? changeAt : 0, ...(p.staff ? { staff: true } : {}) };
}

export async function rename(ctx: ServerContext, me: Player, name: unknown): Promise<PlayerView> {
  return playerView(await changeName(ctx, me, name), ctx);
}
