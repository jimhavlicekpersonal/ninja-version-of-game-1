/**
 * Asynchronous PvP, following the game's matchmaking design
 * (src/sim/matchmaking.ts): opponents within one Elder Toadstool level of the
 * attacker, near their trophies; the loot penalty for hitting lower halls;
 * storage loot caps; shield tiers. Every attack is re-simulated here.
 */
import { maxHousingAtHall, troopEarliestKeep } from '../../src/gameplay/sim/army';
import { runBattle, SIM_RULES } from '../../src/gameplay/sim/battle/battle';
import type { BaseLayout } from '../../src/gameplay/sim/battle/types';
import { buildingDef, levelDef } from '../../src/gameplay/sim/data';
import { shieldHoursFor, storageLootCap } from '../../src/gameplay/sim/defense';
import { applyLootPenalty, hallWindow, opponentForRank } from '../../src/gameplay/sim/matchmaking';
import { lossTrophies, winTrophies } from '../../src/gameplay/sim/ranks';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import type { GameData, ResourceKind } from '../../src/gameplay/sim/types';
import type { AttackResponse, BattleSubmission, DefensesResponse, LeaderboardResponse, MatchResponse, UploadBaseRequest } from '../../src/backend/net/protocol';
import type { Player, Ticket } from '../repo';
import { ApiError, HOUR, MIN, type ServerContext } from './context';

/** How long a matched base stays reserved for its attacker. */
export const TICKET_LOCK_MS = 5 * MIN;
/** How long the attacker has to report the battle (3 minutes of play plus slack for bad connections). */
export const TICKET_TTL_MS = HOUR;

/** Fields an uploaded base may carry. Trial-only multipliers and labels are never accepted from a player. */
const BASE_FIELDS = new Set(['name', 'hallLevel', 'buildings', 'trophies']);
const BUILDING_FIELDS = new Set(['id', 'type', 'level', 'x', 'y', 'loot', 'upgrading']);

/**
 * Reject bases that could not exist in the game: unknown or overlapping
 * buildings, off-map tiles, duplicate ids, more buildings of a type or higher
 * levels than the Keep allows, and any Shadow Trial multiplier (power,
 * wallPower) or label. Loot on buildings that cannot hold it is removed by
 * `capBaseLoot`.
 */
export function validateBase(base: BaseLayout, data: GameData): string | null {
  if (!base || typeof base !== 'object' || !Array.isArray(base.buildings) || base.buildings.length === 0 || base.buildings.length > 400) return 'bad base';
  for (const k of Object.keys(base)) if (!BASE_FIELDS.has(k)) return `field not allowed: ${k}`;
  const map = data.economy.mapSize;
  const occ = new Uint8Array(map * map);
  const ids = new Set<string>();
  const counts: Record<string, number> = {};
  let hall: number | null = null;
  for (const b of base.buildings) {
    if (!b || typeof b !== 'object') return 'bad building';
    for (const k of Object.keys(b)) if (!BUILDING_FIELDS.has(k)) return `field not allowed: ${k}`;
    const def = data.buildings[b.type];
    if (!def || def.category === 'obstacle' || def.category === 'decor') return `unknown building ${b.type}`;
    if (typeof b.id !== 'string' || !b.id || ids.has(b.id)) return 'duplicate building id';
    ids.add(b.id);
    if (!Number.isInteger(b.level) || b.level < 1 || b.level > def.levels.length) return `bad level on ${b.type}`;
    if (def.category === 'hall') {
      if (hall !== null) return 'base needs exactly one Clan Keep';
      hall = b.level;
    }
    counts[b.type] = (counts[b.type] ?? 0) + 1;
    for (let y = b.y; y < b.y + def.size; y++) {
      for (let x = b.x; x < b.x + def.size; x++) {
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map || y >= map) return 'building off the map';
        if (occ[y * map + x]) return 'overlapping buildings';
        occ[y * map + x] = 1;
      }
    }
    // Loot on a building that cannot hold it is dropped by capBaseLoot (it never reaches a battle).
    for (const v of Object.values(b.loot ?? {})) if (typeof v !== 'number' || v < 0 || !Number.isFinite(v)) return 'bad loot';
  }
  if (hall === null) return 'base needs exactly one Clan Keep';
  if (base.hallLevel !== undefined && base.hallLevel !== hall) return 'Keep level does not match';
  // Counts and levels the Keep allows (the Keep itself is capped by its own table).
  const limits = data.hall.levels[Math.min(data.hall.levels.length, hall) - 1]?.limits ?? {};
  for (const b of base.buildings) {
    const def = data.buildings[b.type];
    if (def.category === 'hall') {
      if (b.level > data.hall.levels.length) return 'Keep level too high';
      continue;
    }
    const lim = limits[b.type];
    if (!lim || counts[b.type] > lim.count) return `too many ${b.type} for Keep ${hall}`;
    if (b.level > lim.maxLevel) return `${b.type} level too high for Keep ${hall}`;
  }
  return null;
}

/** A collector holds what it produces; a storage (or the Keep) holds what it stores. Jade is never loot. */
function canHoldLoot(type: string, level: number, k: ResourceKind, data: GameData): boolean {
  if (k === 'moonstones') return false;
  const def = buildingDef(data, type);
  if (def.produces === k) return true;
  return (levelDef(data, type, level)?.storage?.[k] ?? 0) > 0;
}

/** An uploaded base reduced to the allowed shape (unknown fields dropped), or an error. */
export function normalizeBase(raw: unknown, data: GameData): { base: BaseLayout } | { error: string } {
  const r = raw as BaseLayout | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.buildings)) return { error: 'bad base' };
  const base: BaseLayout = {
    name: String(r.name ?? ''),
    hallLevel: Number(r.hallLevel),
    trophies: Number(r.trophies) || 0,
    buildings: r.buildings.map((b) => ({
      id: String(b?.id ?? ''),
      type: String(b?.type ?? ''),
      level: Number(b?.level),
      x: Number(b?.x),
      y: Number(b?.y),
      ...(b?.loot ? { loot: { ...b.loot } } : {}),
      ...(b?.upgrading ? { upgrading: true } : {}),
    })),
  };
  if ((r as unknown as Record<string, unknown>).power !== undefined || (r as unknown as Record<string, unknown>).wallPower !== undefined) return { error: 'field not allowed: power' };
  const err = validateBase(base, data);
  return err ? { error: err } : { base };
}

/**
 * Clamp loot to what the rules allow: storages give at most the hall level's
 * storage loot cap, collectors at most their raidable share of a full
 * collector. Mutates and returns the base.
 */
export function capBaseLoot(base: BaseLayout, data: GameData): BaseLayout {
  const hall = base.buildings.find((b) => data.buildings[b.type]?.category === 'hall');
  const hl = hall?.level ?? 1;
  base.hallLevel = hl;
  const storeCap = storageLootCap(hl, data);
  const fromStores: Record<string, number> = {};
  for (const b of base.buildings) {
    const def = buildingDef(data, b.type);
    const loot = b.loot ?? {};
    for (const k of Object.keys(loot) as ResourceKind[]) {
      if (!canHoldLoot(b.type, b.level, k, data)) {
        delete loot[k];
        continue;
      }
      if (def.produces === k) {
        const ld = levelDef(data, b.type, b.level);
        const max = Math.floor((ld?.ratePerHour ?? 0) * data.economy.collectorHoursCap * data.economy.raidableUncollectedFraction);
        loot[k] = Math.min(loot[k] ?? 0, max);
      } else {
        fromStores[k] = (fromStores[k] ?? 0) + (loot[k] ?? 0);
      }
    }
  }
  for (const [k, total] of Object.entries(fromStores)) {
    if (total <= storeCap) continue;
    const scale = storeCap / total;
    for (const b of base.buildings) {
      const def = buildingDef(data, b.type);
      const loot = b.loot as Record<string, number> | undefined;
      if (!loot || def.produces === k || !loot[k]) continue;
      loot[k] = Math.floor(loot[k] * scale);
    }
  }
  return base;
}

/** Most donated troops (housing) the largest Grove Lodge allowed at this hall level holds. */
export function maxReinforcementAt(hall: number, data: GameData): number {
  const lim = data.hall.levels[Math.max(1, Math.min(data.hall.levels.length, hall)) - 1]?.limits.grove_lodge;
  if (!lim) return 0;
  return buildingDef(data, 'grove_lodge').levels[lim.maxLevel - 1]?.reinforcement ?? 0;
}

/** Largest army housing possible at a hall level: full Army Camps plus a full Grove Lodge. */
export function maxHousing(hallLevel: number, data: GameData): number {
  return maxHousingAtHall(hallLevel, data) + maxReinforcementAt(hallLevel, data);
}

/** Troop levels must be ones the attacker's hall level allows. */
export function validLevels(levels: unknown, hallLevel: number, data: GameData): Record<string, number> | null {
  if (levels === undefined || levels === null) return {};
  if (typeof levels !== 'object') return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(levels as Record<string, unknown>)) {
    const def = data.troops[k];
    if (!def || typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > Math.min(troopLevelCapAt(hallLevel, data, k), def.levels.length)) return null;
    out[k] = v;
  }
  return out;
}

/**
 * Check a battle submission against the attacker's Keep. Own troops must be
 * trainable at that Keep (its gate and the Dojo level the Keep allows: no Kite
 * Raider at Keep 1) and fit full Army Camps; donated troops (`reinforcements`)
 * must fit the largest Lodge the Keep allows and be at a level some donor could
 * have researched. Levels must be ones the Keep's research cap allows.
 *
 * This is a legality check, not an inventory ledger: the server does not yet
 * track what each player trained or researched (docs/PROTOCOL.md, "Trust model").
 */
export function checkArmy(sub: BattleSubmission, me: Player, data: GameData): { army: Record<string, number>; levels: Record<string, number>; reinforcements: Record<string, { count: number; level: number }> } {
  const army = sub.army ?? {};
  if (typeof army !== 'object') throw new ApiError(400, 'bad_request', 'bad army');
  const reinforcements: Record<string, { count: number; level: number }> = {};
  const lodge = sub.reinforcements ?? {};
  if (typeof lodge !== 'object') throw new ApiError(400, 'bad_request', 'bad reinforcements');
  const topKeep = data.hall.levels.length;
  let lodgeHousing = 0;
  for (const [k, r] of Object.entries(lodge)) {
    const def = data.troops[k];
    const count = Number(r?.count);
    const level = Number(r?.level);
    if (!def || !Number.isInteger(count) || count < 0 || count > (army[k] ?? 0)) throw new ApiError(400, 'bad_request', 'bad reinforcements');
    if (!Number.isInteger(level) || level < 1 || level > Math.min(troopLevelCapAt(topKeep, data, k), def.levels.length)) throw new ApiError(400, 'bad_request', 'bad troop levels');
    if (count > 0) reinforcements[k] = { count, level };
    lodgeHousing += def.housing * count;
  }
  let ownHousing = 0;
  for (const [k, n] of Object.entries(army)) {
    const def = data.troops[k];
    if (!def || !Number.isInteger(n) || n < 0) throw new ApiError(400, 'bad_request', 'bad army');
    const own = n - (reinforcements[k]?.count ?? 0);
    if (own > 0 && me.hallLevel < troopEarliestKeep(k, data)) throw new ApiError(400, 'bad_request', 'troop not unlocked');
    ownHousing += def.housing * own;
  }
  if (ownHousing > maxHousingAtHall(me.hallLevel, data) || lodgeHousing > maxReinforcementAt(me.hallLevel, data)) throw new ApiError(400, 'bad_request', 'army too big');
  const levels = validLevels(sub.levels, me.hallLevel, data);
  if (!levels) throw new ApiError(400, 'bad_request', 'bad troop levels');
  return { army, levels, reinforcements };
}

export async function uploadBase(ctx: ServerContext, me: Player, req: UploadBaseRequest): Promise<void> {
  const n = normalizeBase(structuredClone(req?.base), ctx.data);
  if ('error' in n) throw new ApiError(400, 'bad_request', n.error);
  const base = n.base;
  capBaseLoot(base, ctx.data);
  base.name = me.name;
  await ctx.repo.updatePlayer(me.id, { base, hallLevel: base.hallLevel, updatedAt: ctx.now() });
}

/** Find someone to attack: a real player if one fits the rules, otherwise a generated base of matched strength. */
export async function match(ctx: ServerContext, me: Player): Promise<MatchResponse> {
  const t = ctx.now();
  const { data, repo } = ctx;
  const win = hallWindow(me.hallLevel, data);
  const recent = await repo.recentTargets(me.id, t - HOUR);
  const mates = me.groveId ? (await repo.members(me.groveId)).map((m) => m.playerId) : [];
  const exclude = [me.id, ...recent, ...mates];
  let found: Player | null = null;
  for (const range of [data.ranks.matchTrophyRange, 200, 400, 1_000_000]) {
    const list = await repo.findOpponents({ excludeIds: exclude, minHall: win.min, maxHall: win.max, minTrophies: me.trophies - range, maxTrophies: me.trophies + range, now: t, lockedSince: t - TICKET_LOCK_MS, limit: 20 });
    if (list.length) {
      found = list[Math.floor(ctx.random() * list.length)];
      break;
    }
  }
  let ticket: Ticket;
  if (found?.base) {
    const base = applyLootPenalty(capBaseLoot({ ...structuredClone(found.base), name: found.name, trophies: found.trophies }, data), me.hallLevel, data);
    ticket = { id: ctx.uuid(), kind: 'pvp', attackerId: me.id, defenderId: found.id, defenderName: found.name, base, defenderTrophies: found.trophies, createdAt: t, expiresAt: t + TICKET_TTL_MS, used: false, seed: ctx.newSeed() };
  } else {
    // Nobody fits: a generated base with the same matchmaking math the game uses offline.
    const seed = Math.floor(ctx.random() * 4294967296) >>> 0;
    // The server does not know the player's research, so it assumes half-way through their Keep (same rule as offline).
    const base = opponentForRank(seed, me.trophies, me.hallLevel, data, me.hallLevel - 0.5 - data.ranks.matchmaking.powerSlack);
    const names = data.names;
    base.name = `${names.placeFirst[seed % names.placeFirst.length]} ${names.placeSecond[(seed >>> 8) % names.placeSecond.length]}`;
    ticket = { id: ctx.uuid(), kind: 'pvp', attackerId: me.id, defenderId: null, defenderName: base.name, base, defenderTrophies: base.trophies ?? me.trophies, createdAt: t, expiresAt: t + TICKET_TTL_MS, used: false, seed: ctx.newSeed() };
  }
  await repo.createTicket(ticket);
  return {
    ticket: ticket.id,
    seed: ticket.seed!,
    base: ticket.base,
    opponent: { name: ticket.defenderName, trophies: ticket.defenderTrophies, hallLevel: ticket.base.hallLevel, kind: ticket.defenderId ? 'player' : 'bot' },
    expiresAt: ticket.expiresAt,
  };
}

/**
 * The attacker's own ticket. A ticket that was already used returns its stored
 * answer (`answered`), so a client retrying a report it never got the answer
 * to gets the same result instead of an error, and nothing is applied twice.
 */
async function takeTicket(ctx: ServerContext, me: Player, id: string | undefined, kind: Ticket['kind']): Promise<{ ticket: Ticket; answered?: unknown }> {
  const ticket = id ? await ctx.repo.getTicket(String(id)) : null;
  if (!ticket || ticket.attackerId !== me.id || ticket.kind !== kind) throw new ApiError(404, 'not_found', 'Unknown ticket.');
  if (ticket.used) {
    if (ticket.response !== undefined) return { ticket, answered: ticket.response };
    throw new ApiError(409, 'conflict', 'This battle was already reported.');
  }
  if (ctx.now() > ticket.expiresAt) throw new ApiError(410, 'expired', 'This battle took too long to report.');
  return { ticket };
}

export { takeTicket };

/**
 * The seed a battle is re-simulated with: the one the server issued with the
 * ticket, so a client cannot try seeds offline and report the luckiest. A
 * report with any other seed is refused (it was played as a different battle,
 * so its result would not match). Tickets issued before server seeds have none
 * and keep the client's.
 */
export function battleSeed(ticket: Ticket, sub: BattleSubmission): number {
  if (ticket.seed === undefined) return Number(sub.seed) >>> 0;
  if (sub.seed !== undefined && sub.seed !== null && Number(sub.seed) >>> 0 !== ticket.seed) {
    throw new ApiError(400, 'bad_request', 'This battle was played with a seed the server did not issue. Update Kagemura to keep playing online.');
  }
  return ticket.seed;
}

export async function attack(ctx: ServerContext, me: Player, sub: BattleSubmission): Promise<AttackResponse> {
  const { data, repo } = ctx;
  const { ticket, answered } = await takeTicket(ctx, me, sub?.ticket, 'pvp');
  if (answered) return answered as AttackResponse;
  const seed = battleSeed(ticket, sub);
  const { army, levels, reinforcements } = checkArmy(sub, me, data);
  const deployments = Array.isArray(sub.deployments) ? sub.deployments.slice(0, 2000) : [];
  const t = ctx.now();
  const setup = { seed, base: ticket.base, army, levels, infiltration: true, ...(Object.keys(reinforcements).length ? { reinforcements } : {}) };
  const { result } = runBattle(setup, deployments, data, sub.endTick);
  const defender = ticket.defenderId ? await repo.getPlayer(ticket.defenderId) : null;
  const defTrophies = defender?.trophies ?? ticket.defenderTrophies;
  const delta = result.stars >= 1 ? winTrophies(me.trophies, defTrophies, data) : -lossTrophies(me.trophies, defTrophies, data);
  const playerTrophies = Math.max(0, me.trophies + delta);
  const attackId = ctx.uuid();
  const response: AttackResponse = { attackId, result, trophies: delta, playerTrophies };
  // Marking the ticket used and storing the answer is one step: only the first report applies anything.
  if (!(await repo.useTicket(ticket.id, response))) {
    const again = await repo.getTicket(ticket.id);
    if (again?.response !== undefined) return again.response as AttackResponse;
    throw new ApiError(409, 'conflict', 'This battle was already reported.');
  }
  await repo.updatePlayer(me.id, { trophies: playerTrophies, shieldUntil: Math.min(me.shieldUntil, t) });
  if (defender) {
    const patch: { trophies: number; shieldUntil?: number } = { trophies: Math.max(0, defender.trophies - delta) };
    const shield = shieldHoursFor(result.destruction, data);
    if (shield > 0) patch.shieldUntil = Math.max(defender.shieldUntil, t + shield * HOUR);
    await repo.updatePlayer(defender.id, patch);
  }
  if (defender) {
    await repo.addAttack({ id: attackId, at: t, attackerId: me.id, attackerName: me.name, defenderId: defender.id, seed, army, levels, ...(setup.reinforcements ? { reinforcements } : {}), base: ticket.base, deployments, endTick: sub.endTick, result, infiltration: true, rules: SIM_RULES, attackerTrophies: delta, defenderTrophies: -delta });
  }
  return response;
}

export async function defenses(ctx: ServerContext, me: Player, since: number): Promise<DefensesResponse> {
  const list = await ctx.repo.defensesFor(me.id, Number(since) || 0, 20);
  return {
    defenses: list.map((a) => ({ id: a.id, at: a.at, attackerName: a.attackerName, seed: a.seed, army: a.army, levels: a.levels ?? {}, ...(a.reinforcements ? { reinforcements: a.reinforcements } : {}), base: a.base, deployments: a.deployments, endTick: a.endTick, result: a.result, ...(a.infiltration ? { infiltration: true } : {}), ...(a.rules !== undefined ? { rules: a.rules } : {}), trophies: a.defenderTrophies })),
  };
}

export async function leaderboard(ctx: ServerContext, me: Player, limit: number): Promise<LeaderboardResponse> {
  const n = Math.max(1, Math.min(100, Number(limit) || 50));
  const top = await ctx.repo.topPlayers(n);
  const groveNames = new Map<string, string>();
  for (const p of top) {
    if (p.groveId && !groveNames.has(p.groveId)) groveNames.set(p.groveId, (await ctx.repo.getGrove(p.groveId))?.name ?? '');
  }
  return {
    players: top.map((p, i) => ({ rank: i + 1, name: p.name, trophies: p.trophies, hallLevel: p.hallLevel, grove: p.groveId ? groveNames.get(p.groveId) || null : null })),
    me: me.base ? { rank: await ctx.repo.rankOf(me.trophies), trophies: me.trophies } : null,
  };
}
