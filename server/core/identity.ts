import { censorText } from '../../src/gameplay/sim/social/grove';
import { NAME_ERROR_TEXT, checkName } from '../../src/gameplay/sim/social/names';
import { PROTOCOL_VERSION, type BalanceResponse, type HelloResponse, type PlayerView, type RegisterResponse } from '../../src/backend/net/protocol';
import type { Player } from '../repo';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { purchaseFeatures } from './purchases';
import { changeName, nameChangeAt, nameForNewPlayer } from './names';
import { NameTakenError } from '../repo';

/**
 * The oldest game this server serves (protocol 7: villages kept on the server,
 * client headers, idempotent writes). Protocol 8 games are served too: they add
 * the data version and read `supportedRules` / `minClientBuild` from hello.
 */
export const MIN_PROTOCOL = 7;

export const FEATURES = ['pvp', 'leaderboard', 'groves', 'grove-chat', 'donations', 'grove-raid'];

export function hello(ctx: ServerContext): HelloResponse {
  return { name: 'toadstool-kingdoms', protocol: PROTOCOL_VERSION, minProtocol: MIN_PROTOCOL, serverTime: ctx.now(), features: [...FEATURES, 'warriors-50', 'defense-counters', 'server-seed', 'account-deletion', 'reports', 'blocks', 'server-economy', 'village-import', 'links', 'power-ranking', 'rules-versions', 'friends', 'unique-names', 'platform-friends', 'duels', 'gangs', 'gang-wars', ...(ctx.balance ? ['balance-bundles'] : []), ...purchaseFeatures(ctx), ...(ctx.push.enabled ? ['push'] : [])], supportedRules: ctx.rules.supportedRules(), dataVersion: ctx.rules.live.dataVersion, ...(ctx.rules.minClientBuild ? { minClientBuild: ctx.rules.minClientBuild } : {}) };
}

/** GET /v1/balance (step 76): the signed number changes in force, for games with the same battle rules. */
export function balance(ctx: ServerContext): BalanceResponse {
  return { bundle: ctx.balance };
}

/** Legacy lenient cleaning for callers that do not claim a unique player name. */
export function cleanName(raw: unknown, ctx: ServerContext): string {
  const c = checkName(raw);
  return c.error ? 'Ruler' : censorText(c.name, ctx.data);
}

/** A name the player chose: refused with a reason when it can't be used (src/gameplay/sim/social/names.ts). */
export function chosenName(raw: unknown, ctx: ServerContext): string {
  const c = checkName(raw);
  if (c.error) throw new ApiError(400, 'bad_request', NAME_ERROR_TEXT[c.error]);
  return censorText(c.name, ctx.data);
}

export async function register(ctx: ServerContext, name: unknown): Promise<RegisterResponse> {
  const token = ctx.newToken();
  const t = ctx.now();
  // The id first, before anything waits (ids stay in call order).
  const id = ctx.uuid();
  // Names are unique (step 59): a taken or refused name becomes the closest free one (the player can change it).
  const named = await nameForNewPlayer(ctx, name);
  const player: Player = {
    id,
    name: named.name,
    nameKey: named.nameKey,
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
  try {
    await ctx.repo.createPlayer(player);
  } catch (e) {
    if (!(e instanceof NameTakenError)) throw e;
    // Someone took it a moment ago: the next free one.
    const again = await nameForNewPlayer(ctx, `${named.name} `);
    await ctx.repo.createPlayer({ ...player, name: again.name, nameKey: again.nameKey });
  }
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

export function playerView(p: Player, now = Date.now()): PlayerView {
  return { id: p.id, name: p.name, trophies: p.trophies, hallLevel: p.hallLevel, shieldUntil: p.shieldUntil, groveId: p.groveId, nameChangeAt: nameChangeAt(p, now), ...(p.staff ? { staff: true } : {}) };
}

/** PUT /v1/me: change name (unique, one change per 28 days; refusals offer free names). */
export async function rename(ctx: ServerContext, me: Player, name: unknown): Promise<PlayerView> {
  return playerView(await changeName(ctx, me, name), ctx.now());
}
