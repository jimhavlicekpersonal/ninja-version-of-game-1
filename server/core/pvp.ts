/**
 * Asynchronous PvP, following the game's matchmaking design
 * (src/sim/matchmaking.ts): opponents within one Elder Toadstool level of the
 * attacker, near their trophies; the loot penalty for hitting lower halls;
 * storage loot caps; shield tiers. Every attack is re-simulated here.
 */
import { createHash } from 'node:crypto';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { rivalFor, rivalOutpostName } from '../../src/gameplay/sim/rivals';
import { maxHousingAtHall, troopEarliestKeep } from '../../src/gameplay/sim/army';
import type { runBattle } from '../../src/gameplay/sim/battle/battle';
import type { BaseLayout } from '../../src/gameplay/sim/battle/types';
import { buildingDef, levelDef } from '../../src/gameplay/sim/data';
import { exhaustionFactor, scaleBaseLoot, shieldHoursFor, storageLootCap } from '../../src/gameplay/sim/defense';
import { applyLootPenalty, hallWindow, powerSlackAt, recentRaidArmies } from '../../src/gameplay/sim/matchmaking';
import { defenseHonorLoss, lossTrophies, winTrophies } from '../../src/gameplay/sim/ranks';
import { stakeMet, validStake } from '../../src/gameplay/sim/carry';
import { deserialize } from '../../src/gameplay/sim/save';
import { advance, foughtWithWarriors } from '../../src/gameplay/sim/village';
import { layoutChangedShare, newRating, orderByRating, powerRating, rateBattle, type Rating } from '../../src/gameplay/sim/rating';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { sanitizeName } from '../../src/gameplay/sim/social/names';
import type { GameData, ResourceKind, Temper } from '../../src/gameplay/sim/types';
import { normalizeTemper, sameTemper, validTemper } from '../../src/gameplay/sim/battle/temper';
import type { AttackResponse, AttackStartResponse, BattleSubmission, DefensesResponse, LeaderboardResponse, MatchResponse, PowerLeaderboardResponse, UploadBaseRequest } from '../../src/backend/net/protocol';
import type { Player, Repo, Ticket } from '../repo';
import type { ClientInfo, RulesEngine } from '../rules/registry';
import { ResimBusyError, ResimTimeoutError, type ResimOutcome } from '../resim/resim';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { applyServerResult, hasServerVillage, refreshBaseFromVillage } from './village';

/** How long a matched base stays reserved for its attacker. */
export const TICKET_LOCK_MS = 5 * MIN;
/** How long the attacker has to report the battle (3 minutes of play plus slack for bad connections). */
export const TICKET_TTL_MS = HOUR;
/**
 * A finished raid (pvp ticket) may still be reported this long after its
 * ticket expired (worldwide audit R02): a phone that lost its connection
 * after the battle keeps its loot and honor through an outage of up to three
 * days. The re-audit showed that holding several tickets on one defender let
 * them all pay out after the first raid shielded it, so: an attacker holds one
 * open raid at a time (a new match voids an unstarted one), never two on the
 * same defender, and a report whose defender was raided by someone else after
 * the ticket was issued settles as practice (`defender_protected`).
 */
export const LATE_REPORT_MS = 72 * HOUR;
/** A ticket whose reports were refused this many times after a re-simulation is burned (re-audit: re-sim DoS). */
export const MAX_TICKET_FAILURES = 3;
/**
 * Ledger audit A1: a started raid whose report has not arrived this long after
 * Attack (a 3-minute battle plus room for a slow connection) is settled as a
 * loss as soon as its attacker looks for the next opponent, instead of 73 hours
 * later. The game sends its waiting reports before it asks for a match.
 */
export const REPORT_GRACE_MS = 8 * MIN;
/**
 * Ledger audit A1: the first protocol whose game asks for the battle seed when
 * Attack is pressed (`POST /v1/attacks/start`). `match` no longer sends it, so
 * a battle cannot be played to its end, privately, before it counts. Older
 * games are told to update before they scout (they would play with a seed of
 * their own and be refused afterwards).
 */
export const SEED_AT_START_PROTOCOL = 10;

/** Fields an uploaded base may carry. Trial-only multipliers and labels are never accepted from a player. */
const BASE_FIELDS = new Set(['name', 'hallLevel', 'buildings', 'trophies']);
const BUILDING_FIELDS = new Set(['id', 'type', 'level', 'x', 'y', 'loot', 'upgrading', 'temper']);

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
  const tempers: Record<string, Temper | null> = {};
  let hall: number | null = null;
  for (const b of base.buildings) {
    if (!b || typeof b !== 'object') return 'bad building';
    for (const k of Object.keys(b)) if (!BUILDING_FIELDS.has(k)) return `field not allowed: ${k}`;
    const def = data.buildings[b.type];
    if (!def || def.category === 'obstacle' || def.category === 'decor') return `unknown building ${b.type}`;
    if (typeof b.id !== 'string' || !b.id || ids.has(b.id)) return 'duplicate building id';
    ids.add(b.id);
    if (!Number.isInteger(b.level) || b.level < 1 || b.level > def.levels.length) return `bad level on ${def.name}`;
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
    // Tempering (SIM_RULES 6): a valid temper for its type, one per type (the game tempers every building of a type).
    if (b.temper !== undefined && !validTemper(b.type, b.temper, data)) return `bad temper on ${def.name}`;
    const t = normalizeTemper(b.temper);
    if (b.type in tempers && !sameTemper(tempers[b.type], t)) return `mixed tempers on ${def.name}`;
    tempers[b.type] = t;
  }
  if (hall === null) return 'base needs exactly one Clan Keep';
  if (Object.values(tempers).some(Boolean) && hall < (data.battle.temper?.unlockKeep ?? Infinity)) return `Tempering needs Keep ${data.battle.temper?.unlockKeep}`;
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
    // Display names: these reach the player when a village cannot move to the server (remnant audit 2026-11-06).
    if (!lim || counts[b.type] > lim.count) return `too many of ${def.name} for Keep ${hall}`;
    if (b.level > lim.maxLevel) return `${def.name} level too high for Keep ${hall}`;
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
    name: sanitizeName(r.name),
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
      ...(b?.temper !== undefined ? { temper: (b.temper && typeof b.temper === 'object' ? { ...b.temper } : b.temper) as Temper } : {}),
    })),
  };
  if ((r as unknown as Record<string, unknown>).power !== undefined || (r as unknown as Record<string, unknown>).wallPower !== undefined) return { error: 'field not allowed: power' };
  const err = validateBase(base, data);
  if (err) return { error: err };
  // Stored with zero axes left out, and no `temper` at all when nothing is set.
  for (const b of base.buildings) {
    const t = normalizeTemper(b.temper);
    if (t) b.temper = t;
    else delete b.temper;
  }
  return { base };
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
export function checkArmy(sub: BattleSubmission, me: Player, data: GameData): { army: Record<string, number>; levels: Record<string, number>; reinforcements: Record<string, { count: number; level: number }>; hero?: { id: string; level: number } } {
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
  // Report section 5 step 8 (SIM_RULES 5): the hero must be the one the attacker's Keep brings, at that level.
  let hero: { id: string; level: number } | undefined;
  if (sub.hero !== undefined && sub.hero !== null) {
    // One Keep of slack: the base the server holds can trail a Keep upgrade that just finished on the device.
    const most = heroAtKeep(me.hallLevel + 1, data);
    const level = Number(sub.hero?.level);
    if (!most || typeof sub.hero !== 'object' || sub.hero.id !== most.id || !Number.isInteger(level) || level < 1 || level > most.level) throw new ApiError(400, 'bad_request', 'bad hero');
    hero = { id: most.id, level };
  }
  return { army, levels, reinforcements, ...(hero ? { hero } : {}) };
}

export async function uploadBase(ctx: ServerContext, me: Player, req: UploadBaseRequest, client?: ClientInfo): Promise<void> {
  // A village the server holds is the base (its real layout and loot); the upload is ignored.
  if (await hasServerVillage(ctx.repo, me.id)) {
    await refreshBaseFromVillage(ctx, me);
    await ctx.board.set(me.id, me.trophies, me.createdAt);
    return;
  }
  // Checked against the rules of the game that sent it (an older app's Keep limits, step 73).
  const rulesData = engineForClient(ctx, client).data;
  const n = normalizeBase(structuredClone(req?.base), rulesData);
  if ('error' in n) throw new ApiError(400, 'bad_request', n.error);
  const base = n.base;
  capBaseLoot(base, rulesData);
  base.name = me.name;
  await ctx.repo.updatePlayer(me.id, { base, hallLevel: base.hallLevel, updatedAt: ctx.now(), ...layoutReset(ctx, me, base) });
  // A player is ranked once they have a base.
  await ctx.board.set(me.id, me.trophies, me.createdAt);
}

/** Find someone to attack: a real player if one fits the rules, otherwise a generated base of matched strength. */
export async function match(ctx: ServerContext, me: Player, client?: ClientInfo): Promise<MatchResponse> {
  const t = ctx.now();
  const { data, repo } = ctx;
  const engine = engineForClient(ctx, client);
  // An older game only meets bases that are legal under its own rules (step 73).
  const legalFor = (p: Player) => engine.data === data || !p.base || validateBase(p.base, engine.data) === null;
  const win = hallWindow(me.hallLevel, data);
  const recent = await repo.recentTargets(me.id, t - HOUR);
  const mates = me.groveId ? (await repo.members(me.groveId)).map((m) => m.playerId) : [];
  if (client?.protocol !== undefined && client.protocol < SEED_AT_START_PROTOCOL) {
    ctx.metrics.count('tk_refused_total', { reason: 'protocol_too_old', rules: String(client.rules ?? '?') });
    throw new ApiError(426, 'version_mismatch', UPDATE_MESSAGE);
  }
  // Ledger audit A1/E15: for a village the server keeps, a new opponent needs a new scout in that village
  // (the first look after a raid is free; Next costs coins, replayed from the game's own command). The
  // same scout gets its open ticket back: the seed hides little (a guessed seed predicts a raid's win or
  // loss about 98% of the time), so free rerolls were the way to pick only raids a simulation says win.
  const kept = await repo.getVillage(me.id);
  const scoutSeed = kept ? deserialize(kept.file, data).scout?.seed : undefined;
  if (kept && scoutSeed === undefined) throw new ApiError(409, 'conflict', 'Look for an opponent from the Attack button first.');
  if (scoutSeed !== undefined) {
    const same = (await repo.openTickets(me.id, 'pvp')).find((o) => o.startedAt === undefined && o.scoutSeed === scoutSeed && t < o.expiresAt);
    if (same) return matchAnswer(same);
  }
  // Re-audit: one open raid at a time. An unstarted ticket is voided (Next, or a scout left behind);
  // a started one still waiting for its report keeps its defender out of this match, and once it is
  // past REPORT_GRACE_MS it counts as a loss now (ledger audit A1: hiding a lost raid gained 73 hours).
  const held: string[] = [];
  let forfeited = false;
  for (const open of await repo.openTickets(me.id, 'pvp')) {
    if (open.startedAt === undefined) {
      if (await repo.useTicket(open.id, { voided: true })) if (open.defenderId) await ctx.locks.release(open.defenderId, me.id);
    } else if (t > open.startedAt + REPORT_GRACE_MS) {
      forfeited = (await forfeitTicket(ctx, open)) || forfeited;
    } else if (open.defenderId) held.push(open.defenderId);
  }
  // The honor (and Attack Rating) a forfeit just took is what this match uses.
  if (forfeited) me = (await repo.getPlayer(me.id)) ?? me;
  const exclude = [me.id, ...recent, ...mates, ...held];
  let found: Player | null = null;
  const locks = ctx.locks;
  for (const range of [data.ranks.matchTrophyRange, 200, 400, 1_000_000]) {
    // With external locks (Redis) the query skips its ticket scan; the lock is taken atomically below.
    // Backend A19: the search walks out from a pivot near the player's honor, moved a little per search.
    const pivot = me.trophies + Math.round((pivotJitter(me.id, t, range) * 2 - 1) * Math.min(range, data.ranks.matchTrophyRange));
    const list = await repo.findOpponents({ excludeIds: exclude, minHall: win.min, maxHall: win.max, minTrophies: me.trophies - range, maxTrophies: me.trophies + range, now: t, lockedSince: locks.external ? null : t - TICKET_LOCK_MS, limit: 20, pivot });
    const busy = await locks.lockedAmong(list.map((p) => p.id));
    const free = list.filter((p) => !busy.has(p.id) && legalFor(p));
    // Step 29: after the Keep window and power floor, the base whose expected score is nearest the target
    // (ties from a random start); the first one whose lock we get is ours (two attackers can't both get one).
    const start = free.length ? Math.floor(ctx.random() * free.length) : 0;
    const rotated = [...free.slice(start), ...free.slice(0, start)];
    const rated = orderByRating(ratingsOf(me, t, ctx).attack, me.hallLevel, rotated.map((p) => ({ item: p, base: ratingsOf(p, t, ctx).base, power: p.hallLevel })), t, data.ranks.rating);
    const order = await byExposure(ctx, rated, t);
    for (const p of order) {
      if (await locks.acquire(p.id, me.id, TICKET_LOCK_MS)) {
        found = p;
        break;
      }
    }
    if (found) break;
  }
  let ticket: Ticket;
  if (found?.base) {
    // Exhausted stores (balance audit 2026-11-08): each raid this village lost in the last day leaves less to take.
    const lost = await recentDefenses(ctx, found.id, t, data.raids.exhaustion?.windowHours ?? 0);
    const base = scaleBaseLoot(applyLootPenalty(capBaseLoot({ ...structuredClone(found.base), name: found.name, trophies: found.trophies }, data), me.hallLevel, data), exhaustionFactor(lost, t, data));
    ticket = { id: ctx.uuid(), kind: 'pvp', attackerId: me.id, defenderId: found.id, defenderName: found.name, base, defenderTrophies: found.trophies, createdAt: t, expiresAt: t + TICKET_TTL_MS, used: false, seed: ctx.newSeed(), rules: ctx.rules.ticketRules(engine, client), dataVersion: engine.dataVersion, ...(scoutSeed !== undefined ? { scoutSeed } : {}) };
  } else {
    // Nobody fits: a generated base with the same matchmaking math the game uses offline.
    const seed = Math.floor(ctx.random() * 4294967296) >>> 0;
    // The server does not know the player's research, so it assumes half-way through their Keep (same rule as offline).
    // Tempering: a rival outpost may answer the armies of this player's recent raids (known for a village the server keeps).
    const recent = kept ? recentRaidArmies(deserialize(kept.file, data), engine.data) : [];
    const base = engine.opponentForRank(seed, me.trophies, me.hallLevel, engine.data, me.hallLevel - 0.5 - powerSlackAt(me.hallLevel, engine.data), recent);
    const names = data.names;
    // Report section 5 step 8: a named computer rival clan's outpost (still `kind: 'bot'`, labelled by the game).
    const clan = rivalFor(seed, data);
    if (clan) {
      base.rival = clan.id;
      base.name = rivalOutpostName(clan, seed, data);
    } else base.name = `${names.placeFirst[seed % names.placeFirst.length]} ${names.placeSecond[(seed >>> 8) % names.placeSecond.length]}`;
    ticket = { id: ctx.uuid(), kind: 'pvp', attackerId: me.id, defenderId: null, defenderName: base.name, base, defenderTrophies: base.trophies ?? me.trophies, createdAt: t, expiresAt: t + TICKET_TTL_MS, used: false, seed: ctx.newSeed(), rules: ctx.rules.ticketRules(engine, client), dataVersion: engine.dataVersion, ...(scoutSeed !== undefined ? { scoutSeed } : {}) };
  }
  await repo.createTicket(ticket);
  return matchAnswer(ticket);
}

/** Raids against a player in the last `hours` (newest last), as `exhaustionFactor` reads them. */
async function recentDefenses(ctx: ServerContext, id: string, t: number, hours: number): Promise<{ at: number; result: { stars: number } }[]> {
  if (!(hours > 0)) return [];
  return (await ctx.repo.defensesFor(id, t - hours * HOUR, 50)).map((a) => ({ at: a.at, result: { stars: a.result.stars } }));
}

/**
 * Exposure targeting (balance audit 2026-11-08): villages not raided within `matchmaking.exposureHours` keep their
 * rating order and come first; the others follow, the one raided longest ago first. The richest or weakest village
 * is no longer offered to every attacker in turn.
 */
async function byExposure(ctx: ServerContext, players: Player[], t: number): Promise<Player[]> {
  const hours = ctx.data.ranks.matchmaking.exposureHours ?? 0;
  if (!(hours > 0) || players.length < 2) return players;
  const last = new Map<string, number>();
  for (const p of players) {
    const d = await ctx.repo.defensesFor(p.id, t - hours * HOUR, 1);
    if (d.length) last.set(p.id, Math.max(...d.map((a) => a.at)));
  }
  const fresh = players.filter((p) => !last.has(p.id));
  const raided = players.filter((p) => last.has(p.id)).sort((a, b) => last.get(a.id)! - last.get(b.id)!);
  return [...fresh, ...raided];
}

/** What `match` sends. Ledger audit A1: no seed; it comes with POST /v1/attacks/start, when the raid starts to count. */
function matchAnswer(ticket: Ticket): MatchResponse {
  return {
    ticket: ticket.id,
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
    // Re-audit: a ticket the server closed without a battle (voided, lapsed, forfeited, burned) has no answer to repeat.
    const closed = ticket.response as { voided?: boolean; lapsed?: boolean; forfeit?: boolean } | undefined;
    if (closed?.voided || closed?.lapsed) throw new ApiError(409, 'conflict', 'This battle was cancelled before it started.');
    if (closed?.forfeit) throw new ApiError(410, 'expired', 'This battle took too long to report and counted as a loss.');
    if (ticket.response !== undefined) return { ticket, answered: ticket.response };
    throw new ApiError(409, 'conflict', 'This battle was already reported.');
  }
  const deadline = ticket.kind === 'pvp' ? ticket.expiresAt + LATE_REPORT_MS : ticket.expiresAt;
  if (ctx.now() > deadline) throw new ApiError(410, 'expired', 'This battle took too long to report.');
  return { ticket };
}

export { takeTicket };

/**
 * Refuse, before re-simulating, a report whose warriors a server-held village does not have
 * (re-audit: the same ticket could be re-simulated forever). Device villages are checked by checkArmy.
 */
export async function requireArmyOnServer(ctx: ServerContext, me: Player, army: Record<string, number>): Promise<void> {
  const row = await ctx.repo.getVillage(me.id);
  if (!row) return;
  // Settled to now first: warriors whose training ended are in the army (applyServerResult does the same).
  const have = advance(deserialize(row.file, ctx.data), Math.max(row.at, ctx.now()), ctx.data).state.army;
  const short = Object.entries(army).find(([t, n]) => n > 0 && (have[t] ?? 0) < n);
  if (short) throw new ApiError(400, 'bad_request', `Your village on the server has fewer ${ctx.data.troops[short[0]]?.name ?? short[0]} than this battle used.`);
}

/** Count a refused report; after MAX_TICKET_FAILURES the ticket is used up (no more re-simulations). */
/** Backend A32: a re-simulation that ran past the worker timeout (503 busy for the game; counts against the ticket). */
export class ResimTimedOut extends ApiError {
  constructor(message: string) {
    super(503, 'busy', message);
  }
}

export async function burnAfterFailures(ctx: ServerContext, ticket: Ticket, e: unknown): Promise<void> {
  // A busy queue or a server fault is not the player's failure: only refusals count, and (backend A32) a
  // battle that ran past the worker timeout, so one that never finishes cannot be resubmitted for ever.
  if (!(e instanceof ApiError) || ((e.status >= 500 || e.status === 429) && !(e instanceof ResimTimedOut))) return;
  if ((await ctx.repo.bumpTicketFailures(ticket.id)) >= MAX_TICKET_FAILURES) {
    await ctx.repo.useTicket(ticket.id, undefined);
    if (ticket.defenderId) await ctx.locks.release(ticket.defenderId, ticket.attackerId);
  }
}

/**
 * POST /v1/attacks/start (re-audit): the player tapped Attack. From now on the battle counts: it can no
 * longer be voided, and if it is never reported it settles as a 0-star loss (`forfeitTicket`). Ledger
 * audit A1: the answer carries the battle seed, which `match` no longer sends, so a raid cannot be played
 * out privately and then only reported if it was won. Asking again for a started ticket gives the same
 * seed (a retry after a lost answer).
 */
export async function startAttack(ctx: ServerContext, me: Player, body: { ticket?: unknown; stake?: unknown } | undefined): Promise<AttackStartResponse> {
  const ticket = typeof body?.ticket === 'string' ? await ctx.repo.getTicket(body.ticket) : null;
  if (!ticket || ticket.attackerId !== me.id || ticket.kind !== 'pvp') throw new ApiError(404, 'not_found', 'Unknown ticket.');
  if (ticket.used) throw new ApiError(409, 'conflict', 'This opponent is no longer available. Find a new one.');
  if (ticket.startedAt === undefined && ctx.now() > ticket.expiresAt) throw new ApiError(410, 'expired', 'This scout has expired. Find a new opponent.');
  // Declared stakes (protocol 11): fixed now, before the seed is sent, and only with the first start.
  const stake = ticket.startedAt === undefined && validStake(body?.stake, ctx.data) ? body!.stake as number : undefined;
  if (!(await ctx.repo.startTicket(ticket.id, ctx.now(), stake))) throw new ApiError(409, 'conflict', 'This opponent is no longer available. Find a new one.');
  const held = ticket.startedAt === undefined ? stake : ticket.stake;
  return { started: true, ...(ticket.seed !== undefined ? { seed: ticket.seed } : {}), ...(held !== undefined ? { stake: held } : {}) };
}

/**
 * POST /v1/attacks/void: leave a scouted base without attacking (Home, Next, the app closed on the
 * scout screen). Refused once the battle has started.
 */
export async function voidAttack(ctx: ServerContext, me: Player, body: { ticket?: unknown } | undefined): Promise<{ voided: boolean }> {
  const ticket = typeof body?.ticket === 'string' ? await ctx.repo.getTicket(body.ticket) : null;
  if (!ticket || ticket.attackerId !== me.id || ticket.kind !== 'pvp') throw new ApiError(404, 'not_found', 'Unknown ticket.');
  if (ticket.used) return { voided: Boolean((ticket.response as { voided?: boolean } | undefined)?.voided) };
  if (ticket.startedAt !== undefined) throw new ApiError(409, 'conflict', 'This battle has started: it can only be reported.');
  const voided = await ctx.repo.useTicket(ticket.id, { voided: true });
  if (voided && ticket.defenderId) await ctx.locks.release(ticket.defenderId, me.id);
  return { voided };
}

/**
 * Lock players for the rest of a transaction, in one global order (ascending id) so two
 * transactions locking the same pair never wait on each other. Nulls (generated bases) are skipped.
 */
export async function lockPlayers(tx: Repo, ids: (string | null | undefined)[]): Promise<void> {
  for (const id of [...new Set(ids.filter((x): x is string => typeof x === 'string'))].sort()) await tx.lockPlayer(id);
}

/**
 * Settle a started raid that was never reported as a 0-star loss for its attacker: honor and, against
 * a real player's base, the Attack Rating (ledger audit A1: forfeits used to leave the rating untouched,
 * so hidden losses never reached matchmaking). The defender is untouched. Idempotent with the ticket.
 */
export async function forfeitTicket(ctx: ServerContext, ticket: Ticket): Promise<boolean> {
  const t = ctx.now();
  const out = await ctx.repo.transaction(async (tx) => {
    await lockPlayers(tx, [ticket.attackerId, ticket.defenderId]);
    const me = await tx.getPlayer(ticket.attackerId);
    if (!me) return (await tx.useTicket(ticket.id, { forfeit: true, trophies: 0 })) ? null : false;
    const delta = -lossTrophies(me.trophies, ticket.defenderTrophies, ctx.data);
    if (!(await tx.useTicket(ticket.id, { forfeit: true, trophies: delta }))) return false;
    const trophies = Math.max(0, me.trophies + delta);
    const patch: { trophies: number; ratings?: { attack: Rating; base: Rating } } = { trophies };
    const defender = ticket.defenderId ? await tx.getPlayer(ticket.defenderId) : null;
    if (defender) {
      const rated = rateBattle(ratingsOf(me, t, ctx).attack, ratingsOf(defender, t, ctx).base, me.hallLevel, ticket.base.hallLevel ?? defender.hallLevel, 0, 0, t, ctx.data.ranks.rating);
      patch.ratings = { attack: rated.attack, base: ratingsOf(me, t, ctx).base };
    }
    await tx.updatePlayer(me.id, patch);
    return { me, trophies };
  });
  if (out === false) return false;
  if (ticket.defenderId) await ctx.locks.release(ticket.defenderId, ticket.attackerId);
  if (out) {
    if (out.me.base) await ctx.board.set(out.me.id, out.trophies, out.me.createdAt);
    ctx.metrics.count('tk_forfeits_total', {});
  }
  return true;
}

/**
 * Raids never reported (re-audit: a lost battle could be hidden by not reporting it). Once a started
 * pvp ticket is past its report deadline and unused, it settles as a loss (`forfeitTicket`). Run hourly
 * with retention; `match` does the same sooner (REPORT_GRACE_MS). A ticket never started lapses: the
 * player only looked, and its seed was never sent (ledger audit A1).
 */
export async function forfeitExpired(ctx: ServerContext, limit = 500): Promise<number> {
  const t = ctx.now();
  let n = 0;
  for (const ticket of await ctx.repo.expiredOpenTickets('pvp', t - LATE_REPORT_MS, limit)) {
    if (ticket.startedAt === undefined) {
      await ctx.repo.useTicket(ticket.id, { lapsed: true });
      continue;
    }
    if (await forfeitTicket(ctx, ticket)) n++;
  }
  return n;
}

const UPDATE_MESSAGE = 'This version of Kagemura is too old for online battles. Update the game to keep playing online.';

/** The rules engine for the game that sent this request, or 426 if the server no longer has its rules (step 73). */
export function engineForClient(ctx: ServerContext, client: ClientInfo | undefined): RulesEngine {
  const e = ctx.rules.forClient(client);
  if (!e) {
    ctx.metrics.count('tk_refused_total', { reason: 'rules_unsupported', rules: String(client?.rules ?? '?') });
    throw new ApiError(426, 'version_mismatch', UPDATE_MESSAGE);
  }
  return e;
}

/**
 * The engine a ticket's battle is checked with: the one it was issued under.
 * A report that names other rules was played by a different game build than
 * the one that asked for the ticket (it updated mid-battle): refused, as is a
 * ticket whose rules the server has since retired.
 */
export function engineForTicket(ctx: ServerContext, ticket: Ticket, sub: BattleSubmission): RulesEngine {
  if (ticket.rules !== undefined && sub.rules !== undefined && sub.rules !== null && Number(sub.rules) !== ticket.rules) {
    ctx.metrics.count('tk_refused_total', { reason: 'rules_changed', rules: String(sub.rules) });
    throw new ApiError(400, 'bad_request', 'This battle was played with different rules than the ticket was issued for. Find a new opponent.');
  }
  const e = ctx.rules.forTicket(ticket.rules, ticket.dataVersion);
  if (!e) {
    ctx.metrics.count('tk_refused_total', { reason: 'rules_retired', rules: String(ticket.rules ?? '?') });
    throw new ApiError(426, 'version_mismatch', UPDATE_MESSAGE);
  }
  return e;
}

/**
 * Re-run a reported battle, timing it and comparing it with the client's own
 * result hash: a difference is a desync (counted and logged, never trusted).
 */
export async function resimulate(ctx: ServerContext, kind: 'pvp' | 'raid' | 'duel' | 'war', setup: Parameters<typeof runBattle>[0], deployments: BattleSubmission['deployments'], sub: BattleSubmission, engine: RulesEngine = ctx.rules.live): Promise<ResimOutcome> {
  let out: ResimOutcome;
  try {
    // Step 57: in a worker thread in production, so a long battle never stalls other requests.
    out = await ctx.resim.run(engine, setup, deployments, sub.endTick);
  } catch (e) {
    if (e instanceof ResimBusyError) {
      ctx.metrics.count('tk_resim_busy_total', { kind });
      throw e instanceof ResimTimeoutError ? new ResimTimedOut(e.message) : new ApiError(503, 'busy', e.message);
    }
    throw e;
  }
  const rules = String(engine.rules);
  ctx.metrics.observe('tk_resim_ms', out.ms, { kind });
  ctx.metrics.observe('tk_resim_wait_ms', out.waitMs, { kind });
  ctx.metrics.count('tk_battles_total', { kind, rules });
  if (typeof sub.clientHash === 'string' && sub.clientHash !== out.result.hash) {
    ctx.metrics.count('tk_desyncs_total', { kind, rules });
    ctx.log('warn', 'battle desync', { kind, ticket: sub.ticket, rules: engine.rules, dataVersion: engine.dataVersion, client: sub.clientHash, server: out.result.hash });
  }
  return out;
}

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

/**
 * Settle a reported attack. Everything it changes lands in one transaction
 * (roadmap step 22): the ticket and its stored answer, both players' honor and
 * shields, the defense record, and, for villages the server keeps, the
 * attacker's spent troops and banked loot and the defender's losses, each
 * with ledger lines. An attacker whose server-held village lacks the troops is
 * refused (nothing changes and the ticket stays unused).
 */
export async function attack(ctx: ServerContext, me: Player, sub: BattleSubmission): Promise<AttackResponse> {
  const { data, repo } = ctx;
  const { ticket, answered } = await takeTicket(ctx, me, sub?.ticket, 'pvp');
  if (answered) return answered as AttackResponse;
  const engine = engineForTicket(ctx, ticket, sub);
  const seed = battleSeed(ticket, sub);
  const { army, levels, reinforcements, hero } = checkArmy(sub, me, engine.data);
  const deployments = Array.isArray(sub.deployments) ? sub.deployments.slice(0, 2000) : [];
  // Re-audit: someone else's raid shielded this defender after the ticket was issued. Paying again
  // would bypass the shield (held tickets paid the same loot three times): the battle counts as practice.
  // Checked here to skip the re-simulation, and again under the lock before anything is written.
  const protectedNow = async () => {
    await repo.useTicket(ticket.id, undefined);
    if (ticket.defenderId) await ctx.locks.release(ticket.defenderId, me.id);
    return new ApiError(409, 'defender_protected', 'Another raid reached this village first and it is shielded now, so this battle counts as practice.');
  };
  if (ticket.defenderId && (await repo.defensesFor(ticket.defenderId, ticket.createdAt, 1)).length > 0) throw await protectedNow();
  // Re-audit: a server-held village that lacks these warriors is refused before the costly re-simulation.
  await requireArmyOnServer(ctx, me, army);
  const setup = { seed, base: ticket.base, army, levels, infiltration: true, ...(Object.keys(reinforcements).length ? { reinforcements } : {}), ...(hero ? { hero } : {}) };
  const { result, fallen } = await resimulate(ctx, 'pvp', setup, deployments, sub, engine).catch(async (e) => {
    await burnAfterFailures(ctx, ticket, e);
    throw e;
  });
  // Balance audit 2026-11-08 (DZ-3): the free clan hero alone wins nothing; with no warrior deployed the
  // battle is practice (the game records it so too, `foughtWithWarriors`).
  if (!foughtWithWarriors(result, setup)) {
    await repo.useTicket(ticket.id, undefined);
    if (ticket.defenderId) await ctx.locks.release(ticket.defenderId, me.id);
    throw new ApiError(409, 'no_warriors', 'No warriors fought, so this battle counts as practice.');
  }
  const t = ctx.now();
  const attackId = ctx.uuid();
  const rdef = data.ranks.rating;
  // Declared stakes: the one fixed when the raid started. Missed, the attacker carries nothing and the defender keeps it all.
  const stake = validStake(ticket.stake, data) ? ticket.stake : undefined;
  const kept = !stakeMet(stake, result.stars, data);
  const day = Math.floor(t / 86_400_000);
  const settled = await repo.transaction(async (tx) => {
    // Ledger audit A6: both players are locked and read again here. Two late reports on one defender
    // (or a report racing the attacker's forfeit) used to pass the shield check together and write
    // honor computed from stale reads; now the second waits, sees the first raid, and is practice.
    await lockPlayers(tx, [me.id, ticket.defenderId]);
    if (ticket.defenderId && (await tx.defensesFor(ticket.defenderId, ticket.createdAt, 1)).length > 0) return 'protected' as const;
    const attacker = (await tx.getPlayer(me.id)) ?? me;
    const defender = ticket.defenderId ? await tx.getPlayer(ticket.defenderId) : null;
    const defTrophies = defender?.trophies ?? ticket.defenderTrophies;
    const delta = result.stars >= 1 ? winTrophies(attacker.trophies, defTrophies, data) : -lossTrophies(attacker.trophies, defTrophies, data);
    const playerTrophies = Math.max(0, attacker.trophies + delta);
    const response: AttackResponse = { attackId, result, trophies: delta, playerTrophies, ...(stake !== undefined ? { stake } : {}) };
    // Staked honor (balance audit 2026-11-08): a lost defence costs `defenseHonorLossShare` of the raider's gain
    // (none by default); step 30's daily cap still applies. A held raid pays the defender as before.
    const lostToday = defender?.honorLoss?.day === day ? defender.honorLoss.lost : 0;
    const defLoss = delta > 0 ? Math.max(0, Math.min(defenseHonorLoss(delta, data), rdef.defenderDailyHonorLossCap - lostToday)) : delta;
    const defPatch: { trophies: number; shieldUntil?: number; honorLoss?: { day: number; lost: number }; ratings?: { attack: Rating; base: Rating } } = { trophies: Math.max(0, (defender?.trophies ?? 0) - defLoss) };
    const mePatch: { trophies: number; shieldUntil: number; ratings?: { attack: Rating; base: Rating } } = { trophies: playerTrophies, shieldUntil: Math.min(attacker.shieldUntil, t) };
    if (defender) {
      defPatch.honorLoss = { day, lost: lostToday + Math.max(0, defLoss) };
      // Step 28: the attacker's Attack Rating and the defender's Base Rating move; bots never move a rating.
      const rated = rateBattle(ratingsOf(attacker, t, ctx).attack, ratingsOf(defender, t, ctx).base, attacker.hallLevel, ticket.base.hallLevel ?? defender.hallLevel, result.stars, result.destruction, t, rdef);
      mePatch.ratings = { attack: rated.attack, base: ratingsOf(attacker, t, ctx).base };
      defPatch.ratings = { attack: ratingsOf(defender, t, ctx).attack, base: rated.base };
    }
    const shield = shieldHoursFor(result.destruction, data);
    if (defender && shield > 0) defPatch.shieldUntil = Math.max(defender.shieldUntil, t + shield * HOUR);
    // Marking the ticket used and storing the answer comes first: only the first report applies anything.
    if (!(await tx.useTicket(ticket.id, response))) return 'used' as const;
    // A village the server keeps: the troops must be there, they are spent, and the loot is banked.
    const lootFrom = !defender ? 'generated-base' : (await hasServerVillage(tx, defender.id)) ? 'server-village' : 'uploaded-base';
    const mine = await applyServerResult(tx, ctx, attacker, [
      { cmd: { type: 'battleEnd', record: { at: t, opponentName: ticket.defenderName, setup, deployments, endTick: sub.endTick, ticket: ticket.id, ...(stake !== undefined ? { stake } : {}) }, known: result }, reason: 'attack:troops' },
      { cmd: { type: 'settleOnlineAttack', ticket: ticket.id, result, trophies: delta, playerTrophies, ...(stake !== undefined ? { stake } : {}) }, reason: lootFrom === 'server-village' ? 'attack:loot' : `attack:loot:${lootFrom}` },
    ], attackId);
    if (mine && !mine.ok) throw new ApiError(400, 'bad_request', `Your village on the server says: ${mine.message}`);
    await tx.updatePlayer(attacker.id, mePatch);
    if (defender) {
      await tx.updatePlayer(defender.id, defPatch);
      // The defender's village on the server loses what was taken, from the buildings that fell (no second simulation).
      // A missed stake: the defender keeps everything, so its record (and a game that holds its own village) shows no loss.
      const defResult = kept ? { ...result, loot: {} } : result;
      const record = { id: attackId, at: t, kind: 'defense' as const, opponentName: attacker.name, setup: { seed, base: ticket.base, army, levels, infiltration: true }, deployments, endTick: sub.endTick, result: defResult, trophies: -defLoss };
      await applyServerResult(tx, ctx, defender, [{ cmd: { type: 'applyDefense', record, lost: defResult.loot, trophies: defPatch.trophies, shieldUntil: defPatch.shieldUntil ?? defender.shieldUntil, fallen }, reason: 'defense:loss' }], attackId);
      await tx.addAttack({ id: attackId, at: t, attackerId: attacker.id, attackerName: attacker.name, defenderId: defender.id, seed, army, levels, ...(setup.reinforcements ? { reinforcements } : {}), ...(hero ? { hero } : {}), base: ticket.base, deployments, endTick: sub.endTick, result: defResult, infiltration: true, rules: ticket.rules ?? engine.rules, attackerTrophies: delta, defenderTrophies: -defLoss });
    }
    return { response, attacker, defender, defTrophies: defPatch.trophies };
  });
  if (settled === 'protected') throw await protectedNow();
  if (settled === 'used') {
    const again = await repo.getTicket(ticket.id);
    if (again?.response !== undefined) return again.response as AttackResponse;
    throw new ApiError(409, 'conflict', 'This battle was already reported.');
  }
  const { response, attacker, defender } = settled;
  if (attacker.base) await ctx.board.set(attacker.id, response.playerTrophies, attacker.createdAt);
  if (defender) {
    if (defender.base) await ctx.board.set(defender.id, settled.defTrophies, defender.createdAt);
    await ctx.locks.release(defender.id, me.id);
    ctx.push.notify(defender.id, { type: 'raided', title: `${attacker.name} raided your village`, body: `${result.stars} star${result.stars === 1 ? '' : 's'}, ${Math.round(result.destruction)}% destroyed. See the replay in your defense log.` });
  }
  return response;
}

export async function defenses(ctx: ServerContext, me: Player, since: number): Promise<DefensesResponse> {
  const list = await ctx.repo.defensesFor(me.id, Number(since) || 0, 20);
  return {
    defenses: list.map((a) => ({ id: a.id, at: a.at, attackerName: a.attackerName, seed: a.seed, army: a.army, levels: a.levels ?? {}, ...(a.reinforcements ? { reinforcements: a.reinforcements } : {}), ...(a.hero ? { hero: a.hero } : {}), base: a.base, deployments: a.deployments, endTick: a.endTick, result: a.result, ...(a.infiltration ? { infiltration: true } : {}), ...(a.rules !== undefined ? { rules: a.rules } : {}), trophies: a.defenderTrophies })),
  };
}

/** A player's ratings, new ones for a player never rated. */
export function ratingsOf(p: Player, now: number, ctx: ServerContext): { attack: Rating; base: Rating } {
  return p.ratings ?? { attack: newRating(now, ctx.data.ranks.rating), base: newRating(now, ctx.data.ranks.rating) };
}

/**
 * Step 30: a base whose layout changed by more than layoutResetShare starts
 * its Base Rating over (so a strong rating cannot hide a weak new layout).
 */
export function layoutReset(ctx: ServerContext, me: Player, next: BaseLayout): { ratings: { attack: Rating; base: Rating } } | Record<string, never> {
  if (!me.ratings || !me.base) return {};
  if (layoutChangedShare(me.base, next) <= ctx.data.ranks.rating.layoutResetShare) return {};
  return { ratings: { attack: me.ratings.attack, base: newRating(ctx.now(), ctx.data.ranks.rating) } };
}

/** Step 31: the Power Ranking, Attack Rating plus power (Keep), for players with enough rated attacks. */
/** Backend A19: a number in [0, 1) from the player, the time and the window (no draw from ctx.random). */
function pivotJitter(id: string, t: number, range: number): number {
  return createHash('sha256').update(`${id}:${t}:${range}`).digest().readUInt32BE(0) / 2 ** 32;
}

/** Backend A20: how long the Power Ranking (top 100 and every value, for ranks) is reused. */
export const POWER_BOARD_TTL_MS = 60_000;
const powerBoards = new WeakMap<ServerContext, { at: number; top: Player[]; values: number[] }>();

async function powerBoard(ctx: ServerContext): Promise<{ top: Player[]; values: number[] }> {
  const def = ctx.data.ranks.rating;
  const hit = powerBoards.get(ctx);
  const t = ctx.now();
  if (hit && t - hit.at < POWER_BOARD_TTL_MS && t >= hit.at) return hit;
  const [top, values] = await Promise.all([ctx.repo.topByPower(100, def.powerBoardMinBattles, def.powerWeight), ctx.repo.powerValues(def.powerBoardMinBattles, def.powerWeight)]);
  const board = { at: t, top, values: values.sort((a, b) => b - a) };
  powerBoards.set(ctx, board);
  return board;
}

/** 1 + values above `power` in a list sorted high to low. */
function rankIn(values: number[], power: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! > power) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

export async function powerLeaderboard(ctx: ServerContext, me: Player, limit: number): Promise<PowerLeaderboardResponse> {
  const def = ctx.data.ranks.rating;
  const n = Math.max(1, Math.min(100, Number(limit) || 50));
  // Backend A20: one scan a minute per instance instead of two per HUD open (the order is not indexable).
  const board = await powerBoard(ctx);
  const top = board.top.slice(0, n);
  const groveNames = new Map<string, string>();
  for (const p of top) if (p.groveId && !groveNames.has(p.groveId)) groveNames.set(p.groveId, (await ctx.repo.getGrove(p.groveId))?.name ?? '');
  const mine = me.ratings && me.ratings.attack.battles >= def.powerBoardMinBattles ? Math.round(powerRating(me.ratings.attack, me.hallLevel, def)) : null;
  return {
    players: top.map((p, i) => ({ rank: i + 1, name: p.name, power: Math.round(powerRating(ratingsOf(p, ctx.now(), ctx).attack, p.hallLevel, def)), hallLevel: p.hallLevel, grove: p.groveId ? groveNames.get(p.groveId) || null : null })),
    me: mine === null ? null : { rank: rankIn(board.values, mine), power: mine, battles: me.ratings!.attack.battles },
  };
}

export async function leaderboard(ctx: ServerContext, me: Player, limit: number): Promise<LeaderboardResponse> {
  const n = Math.max(1, Math.min(100, Number(limit) || 50));
  // The board gives the order (a Redis sorted set at scale); names and Keeps come from the players.
  const top = await ctx.repo.playersByIds((await ctx.board.top(n)).map((e) => e.id));
  const groveNames = new Map<string, string>();
  for (const p of top) {
    if (p.groveId && !groveNames.has(p.groveId)) groveNames.set(p.groveId, (await ctx.repo.getGrove(p.groveId))?.name ?? '');
  }
  return {
    players: top.map((p, i) => ({ rank: i + 1, name: p.name, trophies: p.trophies, hallLevel: p.hallLevel, grove: p.groveId ? groveNames.get(p.groveId) || null : null })),
    me: me.base ? { rank: await ctx.board.rankOf(me.trophies), trophies: me.trophies } : null,
  };
}
