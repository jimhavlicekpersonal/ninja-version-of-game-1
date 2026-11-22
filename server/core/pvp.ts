/**
 * Asynchronous PvP, following the game's matchmaking design
 * (src/sim/matchmaking.ts): opponents within one Keep level of the
 * attacker, near their trophies; the loot penalty for hitting lower halls;
 * storage loot caps; shield tiers. Every attack is re-simulated here.
 */
import { createHash } from 'node:crypto';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { rivalFor, rivalOutpostName } from '../../src/gameplay/sim/rivals';
import { maxHousingAtHall, troopEarliestKeep } from '../../src/gameplay/sim/army';
import type { runBattle } from '../../src/gameplay/sim/battle/battle';
import type { BaseLayout, BattleResult } from '../../src/gameplay/sim/battle/types';
import { buildingDef } from '../../src/gameplay/sim/data';
import { exhaustionFactor, scaleBaseLoot, shieldHoursFor } from '../../src/gameplay/sim/defense';
import { shieldAfterAttack } from '../../src/gameplay/sim/shield';
import { applyLootPenalty, attackerStrength, hallWindow, powerSlackAt, recentRaidArmies } from '../../src/gameplay/sim/matchmaking';
import { defenseHonorLoss, lossTrophies, winTrophies } from '../../src/gameplay/sim/ranks';
import { stakeMet, validStake } from '../../src/gameplay/sim/carry';
import { deserialize } from '../../src/gameplay/sim/save';
import { advance, battleArmy, foughtWithWarriors } from '../../src/gameplay/sim/village';
import { leavesEntryRoom } from '../../src/gameplay/sim/entryRoom';
import { defensePower, newRating, orderByRating, powerRating, rateBattle, type Rating } from '../../src/gameplay/sim/rating';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { sanitizeName } from '../../src/gameplay/sim/social/names';
import type { Cost, GameData, ResourceKind, Temper } from '../../src/gameplay/sim/types';
import { normalizeTemper, sameTemper, validTemper } from '../../src/gameplay/sim/battle/temper';
import type { AttackResponse, AttackStartResponse, BattleSubmission, DefensesResponse, LeaderboardResponse, MatchResponse, PowerLeaderboardResponse, UploadBaseRequest } from '../../src/backend/net/protocol';
import type { BoardFilter, Player, Repo, Ticket } from '../repo';
import type { ClientInfo, RulesEngine } from '../rules/registry';
import { ResimBusyError, ResimTimeoutError, type ResimOutcome } from '../resim/resim';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { applyServerResult, hasServerVillage, limiterOf, refreshBaseFromVillage, requireHeldVillage } from './village';
import { capBaseLoot, layoutReset } from './baseRules';
import { fail, detailError, busyCode, english, msg } from './errors';
import { importMinAccountDays } from './accountAge';
import { rulesLabel } from '../observability';

export { capBaseLoot, layoutReset } from './baseRules';

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
 * A battle report as the HTTP adapter passes it on: its JSON types are checked (server/routes/battles.ts),
 * but only the ticket is required; everything else is checked here and by the re-simulation.
 */
export type BattleReport = Pick<BattleSubmission, 'ticket'> & Partial<BattleSubmission>;

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
export function checkArmy(sub: BattleReport, me: Player, data: GameData): { army: Record<string, number>; levels: Record<string, number>; reinforcements: Record<string, { count: number; level: number }>; hero?: { id: string; level: number } } {
  const army = sub.army ?? {};
  if (typeof army !== 'object') throw fail(400, 'bad_request', 'army.bad');
  const reinforcements: Record<string, { count: number; level: number }> = {};
  const lodge = sub.reinforcements ?? {};
  if (typeof lodge !== 'object') throw fail(400, 'bad_request', 'army.bad_reinforcements');
  const topKeep = data.hall.levels.length;
  let lodgeHousing = 0;
  for (const [k, r] of Object.entries(lodge)) {
    const def = data.troops[k];
    const count = Number(r?.count);
    const level = Number(r?.level);
    if (!def || !Number.isInteger(count) || count < 0 || count > (army[k] ?? 0)) throw fail(400, 'bad_request', 'army.bad_reinforcements');
    if (!Number.isInteger(level) || level < 1 || level > Math.min(troopLevelCapAt(topKeep, data, k), def.levels.length)) throw fail(400, 'bad_request', 'army.bad_levels');
    if (count > 0) reinforcements[k] = { count, level };
    lodgeHousing += def.housing * count;
  }
  let ownHousing = 0;
  for (const [k, n] of Object.entries(army)) {
    const def = data.troops[k];
    if (!def || !Number.isInteger(n) || n < 0) throw fail(400, 'bad_request', 'army.bad');
    const own = n - (reinforcements[k]?.count ?? 0);
    if (own > 0 && me.hallLevel < troopEarliestKeep(k, data)) throw fail(400, 'bad_request', 'army.troop_locked');
    ownHousing += def.housing * own;
  }
  if (ownHousing > maxHousingAtHall(me.hallLevel, data) || lodgeHousing > maxReinforcementAt(me.hallLevel, data)) throw fail(400, 'bad_request', 'army.too_big');
  const levels = validLevels(sub.levels, me.hallLevel, data);
  if (!levels) throw fail(400, 'bad_request', 'army.bad_levels');
  // Report section 5 step 8 (SIM_RULES 5): the hero must be the one the attacker's Keep brings, at that level.
  let hero: { id: string; level: number } | undefined;
  if (sub.hero !== undefined && sub.hero !== null) {
    // One Keep of slack: the base the server holds can trail a Keep upgrade that just finished on the device.
    const most = heroAtKeep(me.hallLevel + 1, data);
    const level = Number(sub.hero?.level);
    if (!most || typeof sub.hero !== 'object' || sub.hero.id !== most.id || !Number.isInteger(level) || level < 1 || level > most.level) throw fail(400, 'bad_request', 'army.bad_hero');
    hero = { id: most.id, level };
  }
  return { army, levels, reinforcements, ...(hero ? { hero } : {}) };
}

/**
 * Exploit audit 2026-11-20 #7: what a raid on an uploaded (device-held) base pays: its loot, but per resource no
 * more than the destruction share of the smallest loot a generated base of that Keep holds. The battle itself is
 * unchanged; only the loot is capped.
 */
export function uploadedBaseResult(result: BattleResult, hallLevel: number, data: GameData): BattleResult {
  const table = data.battle.generatedLootByHall;
  const range = table[Math.max(1, Math.min(table.length, Math.floor(hallLevel) || 1)) - 1];
  const most = Math.floor((range.min * Math.max(0, Math.min(100, result.destruction))) / 100);
  const loot: Cost = {};
  for (const [k, v] of Object.entries(result.loot) as [ResourceKind, number][]) {
    const n = Math.min(v ?? 0, most);
    if (n > 0) loot[k] = n;
  }
  return { ...result, loot };
}

/**
 * Beast Mode 2026-11-21 GT-17: what one attacker may still take from one defender today. `taken` is what earlier raids
 * of this pair took since the UTC day began; `cap` the most per resource.
 */
export function pairCapped(result: BattleResult, taken: Cost, cap: number): BattleResult {
  const loot: Cost = {};
  for (const [k, v] of Object.entries(result.loot) as [ResourceKind, number][]) {
    const n = Math.min(v ?? 0, Math.max(0, cap - (taken[k] ?? 0)));
    if (n > 0) loot[k] = n;
  }
  return { ...result, loot };
}

/**
 * Beast Mode 2026-11-21 GT-12: the attacker's power in the rating's expected score. A village the server holds says
 * what its army's research is worth (`attackerStrength`, Keep units, capped at its Keep), so a Keep rushed with Jade
 * and level-1 research is not rated as a full-power attacker; a device village falls back to its Keep.
 */
export async function attackPower(repo: Pick<Repo, 'getVillage'>, p: Player, data: GameData): Promise<number> {
  const row = await repo.getVillage(p.id);
  if (!row) return p.hallLevel;
  try {
    return Math.max(1, Math.min(p.hallLevel, attackerStrength(deserialize(row.file, data), data)));
  } catch {
    return p.hallLevel;
  }
}

export async function uploadBase(ctx: ServerContext, me: Player, req: UploadBaseRequest, client?: ClientInfo): Promise<void> {
  await requireHeldVillage(ctx, me.id); // Beast Mode SEC-01
  // A village the server holds is the base (its real layout and loot); the upload is ignored.
  if (await hasServerVillage(ctx.repo, me.id)) {
    await refreshBaseFromVillage(ctx, me);
    await ctx.board.set(me.id, me.trophies, me.createdAt);
    return;
  }
  // Checked against the rules of the game that sent it (an older app's Keep limits, step 73).
  const rulesData = engineForClient(ctx, client).data;
  const n = normalizeBase(structuredClone(req?.base), rulesData);
  if ('error' in n) throw detailError(400, 'bad_request', n.error);
  const base = n.base;
  // Beast Mode SEC-01 (interim, with the policy off too): an uploaded base is the device's word, so it follows the
  // import's account-age rule (a day-old account uploaded a maxed Keep 15 base and was ranked and matched there),
  // and after the first upload its Keep rises by at most one level per upload.
  const ageDays = (ctx.now() - me.createdAt) / (24 * HOUR);
  const needDays = importMinAccountDays(base.hallLevel);
  if (ctx.policy.uploadAccountAge && ageDays < needDays) {
    ctx.metrics.count('tk_refused_total', { reason: 'upload_account_too_new' });
    throw fail(403, 'cooldown', 'pvp.base_too_new', { keep: base.hallLevel, days: Math.ceil(needDays), wait: Math.max(1, Math.ceil(needDays - ageDays)) });
  }
  if (me.base && base.hallLevel > me.hallLevel + 1) {
    ctx.metrics.count('tk_refused_total', { reason: 'upload_keep_jump' });
    throw detailError(400, 'bad_request', 'the Keep can rise by one level per base upload');
  }
  // A base others are sent to raid must let them in (sim/entryRoom.ts; an older game's rules have no such rule).
  if (!leavesEntryRoom(base.buildings, rulesData)) throw detailError(400, 'bad_request', 'the layout leaves attackers no way in');
  capBaseLoot(base, rulesData);
  base.name = me.name;
  await ctx.repo.updatePlayer(me.id, { base, hallLevel: base.hallLevel, updatedAt: ctx.now(), ...layoutReset(ctx, me, base) });
  // A player is ranked once they have a base.
  await ctx.board.set(me.id, me.trophies, me.createdAt);
}

/** Candidates whose stated band is not under 13 (only asked in `offline` mode: one query for at most 20). */
async function withoutUnder13(repo: Repo, list: Player[]): Promise<Player[]> {
  const young = await repo.under13Among(list.map((p) => p.id));
  return list.filter((p) => !young.has(p.id));
}

/**
 * Last gaps 2026-11-14: who the leaderboards leave out. In `UNDER13_MODE=offline` an under-13 player is not
 * online at all, so neither the honor nor the Power Ranking lists them (database and memory queries filter by
 * `player_age.band`; the Redis set is emptied of them at the statement and checked again on every read).
 * `limited`/`families` keep them listed under their generated name (no id is served, so a board row is no way
 * to find or contact them; friends.ts refuses them by name in every mode).
 */
export function boardFilter(ctx: ServerContext): BoardFilter {
  const f: BoardFilter = ctx.policy.under13Mode === 'offline' ? { hideUnder13: true } : {};
  if (ctx.policy.requireServerVillage) f.heldOnly = true;
  return f;
}

/** Find someone to attack: a real player if one fits the rules, otherwise a generated base of matched strength. */
export async function match(ctx: ServerContext, me: Player, client?: ClientInfo): Promise<MatchResponse> {
  await requireHeldVillage(ctx, me.id); // Beast Mode SEC-01
  const t = ctx.now();
  const { data, repo } = ctx;
  const engine = engineForClient(ctx, client);
  // An older game only meets bases that are legal under its own rules (step 73).
  const legalFor = (p: Player) => engine.data === data || !p.base || validateBase(p.base, engine.data) === null;
  const win = hallWindow(me.hallLevel, data);
  const recent = await repo.recentTargets(me.id, t - HOUR);
  const mates = me.groveId ? (await repo.members(me.groveId)).map((m) => m.playerId) : [];
  if (client?.protocol !== undefined && client.protocol < SEED_AT_START_PROTOCOL) {
    ctx.metrics.count('tk_refused_total', { reason: 'protocol_too_old', rules: rulesLabel(client.rules, ctx.rules.supportedRules()) });
    throw fail(426, 'version_mismatch', 'version.battle_update');
  }
  // Ledger audit A1/E15: for a village the server keeps, a new opponent needs a new scout in that village
  // (the first look after a raid is free; Next costs coins, replayed from the game's own command). The
  // same scout gets its open ticket back: the seed hides little (a guessed seed predicts a raid's win or
  // loss about 98% of the time), so free rerolls were the way to pick only raids a simulation says win.
  const kept = await repo.getVillage(me.id);
  const scoutSeed = kept ? deserialize(kept.file, data).scout?.seed : undefined;
  if (kept && scoutSeed === undefined) throw fail(409, 'conflict', 'pvp.scout_first');
  if (scoutSeed !== undefined) {
    const same = (await repo.openTickets(me.id, 'pvp')).find((o) => o.startedAt === undefined && o.scoutSeed === scoutSeed && t < o.expiresAt);
    if (same) return matchAnswer(same);
  }
  // Beast Mode SEC-01 (interim, policy off): a village on the device has no scout to tie the ticket to, so its new
  // opponents are budgeted instead (`deviceRerolls`).
  if (!kept && !(await limiterOf(ctx).hit('deviceRerolls', me.id, t)).ok) {
    ctx.metrics.count('tk_refused_total', { reason: 'device_rerolls' });
    throw fail(429, 'rate_limited', 'pvp.rerolls');
  }
  // Re-audit: one open raid at a time. An unstarted ticket is voided (Next, or a scout left behind);
  // a started one still waiting for its report keeps its defender out of this match, and once it is
  // past REPORT_GRACE_MS it counts as a loss now (ledger audit A1: hiding a lost raid gained 73 hours).
  const held: string[] = [];
  let forfeited = false;
  const openNow = await repo.openTickets(me.id, 'pvp');
  // Beast Mode SAV-05: a raid started inside REPORT_GRACE_MS is still awaiting its report (the game sends it before
  // matching), so no second raid runs beside it; past the grace it is forfeited below, as before.
  const waiting = openNow.find((o) => o.startedAt !== undefined && t <= o.startedAt + REPORT_GRACE_MS);
  if (waiting) {
    ctx.metrics.count('tk_refused_total', { reason: 'report_pending' });
    throw fail(409, 'conflict', 'pvp.report_pending', { minutes: Math.max(1, Math.ceil((waiting.startedAt! + REPORT_GRACE_MS - t) / MIN)) });
  }
  for (const open of openNow) {
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
    const list = await repo.findOpponents({ excludeIds: exclude, minHall: win.min, maxHall: win.max, minTrophies: me.trophies - range, maxTrophies: me.trophies + range, now: t, lockedSince: locks.external ? null : t - TICKET_LOCK_MS, limit: 20, pivot, ...(ctx.policy.requireServerVillage ? { heldOnly: true } : {}) });
    const busy = await locks.lockedAmong(list.map((p) => p.id));
    let free = list.filter((p) => !busy.has(p.id) && legalFor(p));
    // Third verification fixes 2026-11-14 (UNDER13_MODE=offline): an under-13 player is not online, so nobody raids them.
    if (ctx.policy.under13Mode === 'offline') free = await withoutUnder13(repo, free);
    // Step 29: after the Keep window and power floor, the base whose expected score is nearest the target
    // (ties from a random start); the first one whose lock we get is ours (two attackers can't both get one).
    const start = free.length ? Math.floor(ctx.random() * free.length) : 0;
    const rotated = [...free.slice(start), ...free.slice(0, start)];
    // Beast Mode GT-12: a candidate's power is its defense strength (rating.ts defensePower), not its Keep alone.
    const rated = orderByRating(ratingsOf(me, t, ctx).attack, kept ? Math.max(1, Math.min(me.hallLevel, attackerStrength(deserialize(kept.file, data), data))) : me.hallLevel, rotated.map((p) => ({ item: p, base: ratingsOf(p, t, ctx).base, power: p.base ? defensePower(p.base, data) : p.hallLevel })), t, data.ranks.rating);
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
  // Exploit audit 2026-11-20 #12: parallel match calls for one scout each found an opponent (keep the weakest,
  // void the rest). Under the player's lock, the first ticket for this scout wins and is what every call returns;
  // any other unstarted ticket a parallel call left is voided (one open raid at a time).
  const releases: string[] = [];
  const winner = await repo.transaction(async (tx) => {
    await lockPlayers(tx, [me.id]);
    for (const open of await tx.openTickets(me.id, 'pvp')) {
      if (open.startedAt !== undefined || !(t < open.expiresAt)) continue;
      if (scoutSeed !== undefined && open.scoutSeed === scoutSeed) return open;
      if ((await tx.useTicket(open.id, { voided: true })) && open.defenderId) releases.push(open.defenderId);
    }
    await tx.createTicket(ticket);
    return ticket;
  });
  if (winner !== ticket && ticket.defenderId) releases.push(ticket.defenderId);
  // The same defender may hold the winner's lock too (the lock is per attacker): that one stays.
  for (const id of releases) if (id !== winner.defenderId) await ctx.locks.release(id, me.id);
  return matchAnswer(winner);
}

/** Raids against a player in the last `hours` (newest last), as `exhaustionFactor` reads them. */
async function recentDefenses(ctx: ServerContext, id: string, t: number, hours: number): Promise<{ at: number; result: { stars: number } }[]> {
  if (!(hours > 0)) return [];
  // XPL-12 (P1-20): a raid that took nothing (a missed stake) does not exhaust the stores.
  return (await ctx.repo.defensesFor(id, t - hours * HOUR, 50)).map((a) => ({ at: a.at, result: { stars: Object.values(a.result.loot ?? {}).some((v) => (v ?? 0) > 0) ? a.result.stars : 0 } }));
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
  if (!ticket || ticket.attackerId !== me.id || ticket.kind !== kind) throw fail(404, 'not_found', 'pvp.unknown_ticket');
  if (ticket.used) {
    // Re-audit: a ticket the server closed without a battle (voided, lapsed, forfeited, burned) has no answer to repeat.
    const closed = ticket.response as { voided?: boolean; lapsed?: boolean; forfeit?: boolean; burned?: boolean } | undefined;
    if (closed?.voided || closed?.lapsed) throw fail(409, 'conflict', 'pvp.cancelled');
    if (closed?.burned) throw fail(409, 'conflict', 'battle.already_reported');
    if (closed?.forfeit) throw fail(410, 'expired', 'pvp.forfeit');
    if (ticket.response !== undefined) return { ticket, answered: ticket.response };
    throw fail(409, 'conflict', 'battle.already_reported');
  }
  // S1: a ticket whose reports were refused MAX_TICKET_FAILURES times takes no more (and runs no more re-simulations).
  if ((ticket.failures ?? 0) >= MAX_TICKET_FAILURES) throw fail(409, 'conflict', 'battle.already_reported');
  const deadline = ticket.kind === 'pvp' ? ticket.expiresAt + LATE_REPORT_MS : ticket.expiresAt;
  if (ctx.now() > deadline) throw fail(410, 'expired', 'pvp.too_late');
  await noteReportLatency(ctx, me, ticket);
  return { ticket };
}

/**
 * Beast Mode SEC-04: every report's latency (from Attack, or from the ticket for kinds whose seed comes with it), a
 * per-player count of late ones for staff, and, behind LATE_REPORT_RULE, the rule: a raid reported after the grace
 * by a player who made another request after the grace (online, holding the report: time to search deployment
 * plans with the shipped simulator) is a forfeit. A phone offline for days (R02) makes no request meanwhile, so
 * its report still settles.
 */
async function noteReportLatency(ctx: ServerContext, me: Player, ticket: Ticket): Promise<void> {
  const t = ctx.now();
  const from = ticket.startedAt ?? ticket.createdAt;
  const latency = Math.max(0, t - from);
  ctx.metrics.observe('tk_report_latency_seconds', latency / 1000, { kind: ticket.kind });
  ctx.metrics.count('tk_reports_total', { kind: ticket.kind });
  if (latency <= REPORT_GRACE_MS) return;
  ctx.metrics.count('tk_late_reports_total', { kind: ticket.kind });
  await ctx.repo.updatePlayer(me.id, { lateReports: (me.lateReports ?? 0) + 1, lateReportAt: t });
  // Online the whole time since before the grace ended (requests no more than ONLINE_GAP_MS apart): an honest game
  // sends its report within seconds of Attack, or at once after coming back, which starts a new session.
  const heldWhileOnline = ticket.kind === 'pvp' && ticket.startedAt !== undefined && (me.onlineSince ?? Infinity) <= ticket.startedAt + REPORT_GRACE_MS;
  if (ctx.policy.lateReportRule && heldWhileOnline) {
    ctx.metrics.count('tk_refused_total', { reason: 'late_report_held' });
    await forfeitTicket(ctx, ticket);
    if (ticket.defenderId) await ctx.locks.release(ticket.defenderId, me.id);
    throw fail(410, 'expired', 'pvp.forfeit');
  }
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
  // The reported army is the village's own plus the warriors its Alliance donated (`battleLoadout`), so it is
  // compared with both (review R3-10: compared with the own army alone, every honest raid that brought Lodge
  // warriors was refused). The exact split is checked when the battle is applied (`checkBattleSetup`).
  const have = battleArmy(advance(deserialize(row.file, ctx.data), Math.max(row.at, ctx.now()), ctx.data).state);
  const short = Object.entries(army).find(([t, n]) => n > 0 && (have[t] ?? 0) < n);
  if (short) throw fail(400, 'bad_request', 'pvp.fewer_troops', { warrior: ctx.data.troops[short[0]]?.name ?? short[0] });
}

/** Count a refused report; after MAX_TICKET_FAILURES the ticket is used up (no more re-simulations). */
/** Backend A32: a re-simulation that ran past the worker timeout (503 busy for the game; counts against the ticket). */
export class ResimTimedOut extends ApiError {
  constructor(message: string) {
    const parts = [msg(busyCode(message))];
    super(503, 'busy', english(parts), undefined, parts);
  }
}

export async function burnAfterFailures(ctx: ServerContext, ticket: Ticket, e: unknown): Promise<void> {
  // A busy queue or a server fault is not the player's failure: only refusals count, and (backend A32) a
  // battle that ran past the worker timeout, so one that never finishes cannot be resubmitted for ever.
  // Exploit audit 2026-11-20 (low): a report that makes the simulation itself throw (a plain error from the worker,
  // not an ApiError) used to skip the count, so it could be re-simulated for ever; it counts like a refusal now.
  if (e instanceof ApiError && (e.status >= 500 || e.status === 429) && !(e instanceof ResimTimedOut)) return;
  if ((await ctx.repo.bumpTicketFailures(ticket.id)) >= MAX_TICKET_FAILURES) {
    // Security audit 2026-11-20 (S1): burning a ticket gave its attack back. A war or Alliance raid ticket now stays
    // open, so it counts as the unreported attack it is until the war ends (`takeTicket` refuses further reports);
    // a started raid is a lost raid, as one never reported is (burning it used to dodge the forfeit).
    if (ticket.kind === 'war' || ticket.kind === 'raid') return;
    if (ticket.kind === 'pvp' && ticket.startedAt !== undefined && (await forfeitTicket(ctx, ticket))) return;
    await ctx.repo.useTicket(ticket.id, { burned: true });
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
  await requireHeldVillage(ctx, me.id); // Beast Mode SEC-01
  const ticket = typeof body?.ticket === 'string' ? await ctx.repo.getTicket(body.ticket) : null;
  if (!ticket || ticket.attackerId !== me.id || ticket.kind !== 'pvp') throw fail(404, 'not_found', 'pvp.unknown_ticket');
  if (ticket.used) throw fail(409, 'conflict', 'pvp.opponent_gone');
  if (ticket.startedAt === undefined && ctx.now() > ticket.expiresAt) throw fail(410, 'expired', 'pvp.scout_expired');
  // Declared stakes (protocol 11): fixed now, before the seed is sent, and only with the first start.
  const stake = ticket.startedAt === undefined && validStake(body?.stake, ctx.data) ? body!.stake as number : undefined;
  if (!(await ctx.repo.startTicket(ticket.id, ctx.now(), stake))) throw fail(409, 'conflict', 'pvp.opponent_gone');
  const held = ticket.startedAt === undefined ? stake : ticket.stake;
  return { started: true, ...(ticket.seed !== undefined ? { seed: ticket.seed } : {}), ...(held !== undefined ? { stake: held } : {}) };
}

/**
 * POST /v1/attacks/void: leave a scouted base without attacking (Home, Next, the app closed on the
 * scout screen). Refused once the battle has started.
 */
export async function voidAttack(ctx: ServerContext, me: Player, body: { ticket?: unknown } | undefined): Promise<{ voided: boolean }> {
  const ticket = typeof body?.ticket === 'string' ? await ctx.repo.getTicket(body.ticket) : null;
  if (!ticket || ticket.attackerId !== me.id || ticket.kind !== 'pvp') throw fail(404, 'not_found', 'pvp.unknown_ticket');
  if (ticket.used) return { voided: Boolean((ticket.response as { voided?: boolean } | undefined)?.voided) };
  if (ticket.startedAt !== undefined) throw fail(409, 'conflict', 'pvp.started');
  // Security audit 2026-11-20 (S2): a server-held village's scout ticket is not voided here, only its defender let go.
  // Voided, `match` drew a new opponent for the same free scout (six from one scout): the same scout gives the same
  // base until a new, paid scout (ledger audit A1/E15). The game itself never calls this route.
  if (ticket.scoutSeed !== undefined) {
    if (ticket.defenderId) await ctx.locks.release(ticket.defenderId, me.id);
    return { voided: false };
  }
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
      const rated = rateBattle(ratingsOf(me, t, ctx).attack, ratingsOf(defender, t, ctx).base, await attackPower(tx, me, ctx.data), defensePower(ticket.base, ctx.data), 0, 0, t, ctx.data.ranks.rating);
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


/** The rules engine for the game that sent this request, or 426 if the server no longer has its rules (step 73). */
export function engineForClient(ctx: ServerContext, client: ClientInfo | undefined): RulesEngine {
  const e = ctx.rules.forClient(client);
  if (!e) {
    ctx.metrics.count('tk_refused_total', { reason: 'rules_unsupported', rules: rulesLabel(client?.rules, ctx.rules.supportedRules()) });
    throw fail(426, 'version_mismatch', 'version.battle_update');
  }
  return e;
}

/**
 * The engine a ticket's battle is checked with: the one it was issued under.
 * A report that names other rules was played by a different game build than
 * the one that asked for the ticket (it updated mid-battle): refused, as is a
 * ticket whose rules the server has since retired.
 */
export function engineForTicket(ctx: ServerContext, ticket: Ticket, sub: BattleReport): RulesEngine {
  if (ticket.rules !== undefined && sub.rules !== undefined && sub.rules !== null && Number(sub.rules) !== ticket.rules) {
    ctx.metrics.count('tk_refused_total', { reason: 'rules_changed', rules: rulesLabel(sub.rules, ctx.rules.supportedRules()) });
    throw fail(400, 'bad_request', 'pvp.rules_differ');
  }
  const e = ctx.rules.forTicket(ticket.rules, ticket.dataVersion);
  if (!e) {
    ctx.metrics.count('tk_refused_total', { reason: 'rules_retired', rules: rulesLabel(ticket.rules, ctx.rules.supportedRules()) });
    throw fail(426, 'version_mismatch', 'version.battle_update');
  }
  return e;
}

const wellFormed = (d: unknown): boolean => {
  const x = d as { tick?: unknown; troop?: unknown; x?: unknown; y?: unknown } | null;
  return !!x && typeof x === 'object' && typeof x.troop === 'string' && x.troop.length <= 40 && Number.isInteger(x.tick) && (x.tick as number) >= 0 && Number.isFinite(x.x) && Number.isFinite(x.y);
};

/**
 * Re-run a reported battle, timing it and comparing it with the client's own
 * result hash: a difference is a desync (counted and logged, never trusted).
 */
export async function resimulate(ctx: ServerContext, kind: 'pvp' | 'raid' | 'duel' | 'war', setup: Parameters<typeof runBattle>[0], deployments: BattleSubmission['deployments'], sub: BattleReport, engine: RulesEngine = ctx.rules.live): Promise<ResimOutcome> {
  // Security audit 2026-11-20 (D4): every report kind passes here; a deployment that is not one (null, a missing
  // tick) made the battle throw, a 500 and a server error report for each request. Refused as a bad report.
  if (!Array.isArray(deployments) || !deployments.every(wellFormed)) throw fail(400, 'bad_request', 'army.bad');
  let out: ResimOutcome;
  try {
    // Step 57: in a worker thread in production, so a long battle never stalls other requests.
    out = await ctx.resim.run(engine, setup, deployments, sub.endTick);
  } catch (e) {
    if (e instanceof ResimBusyError) {
      ctx.metrics.count('tk_resim_busy_total', { kind });
      throw e instanceof ResimTimeoutError ? new ResimTimedOut(e.message) : fail(503, 'busy', busyCode(e.message));
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
export function battleSeed(ticket: Ticket, sub: BattleReport): number {
  if (ticket.seed === undefined) return Number(sub.seed) >>> 0;
  if (sub.seed !== undefined && sub.seed !== null && Number(sub.seed) >>> 0 !== ticket.seed) {
    throw fail(400, 'bad_request', 'pvp.wrong_seed');
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
/** XPL-12 (P1-20): the most honor one attacker's lost attacks give one defender in a UTC day. */
export const MAX_HONOR_FROM_ONE_ATTACKER = 40;

export async function attack(ctx: ServerContext, me: Player, sub: BattleReport): Promise<AttackResponse> {
  await requireHeldVillage(ctx, me.id); // Beast Mode SEC-01
  const { data, repo } = ctx;
  const { ticket, answered } = await takeTicket(ctx, me, sub?.ticket, 'pvp');
  if (answered) return answered as AttackResponse;
  // Security audit 2026-11-20 (S2, ledger audit A1 regressed): a ticket with a server seed counts only once started.
  // Unstarted, a raid played privately with a guessed seed was reported when it won and voided for free when lost.
  if (ticket.seed !== undefined && ticket.startedAt === undefined) throw fail(409, 'conflict', 'pvp.opponent_gone');
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
    return fail(409, 'defender_protected', 'pvp.defender_shielded');
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
    // Once Attack was pressed, a refused no-warrior report cannot erase the
    // commitment. Settle it as a loss so it cannot be retried or hidden.
    await forfeitTicket(ctx, ticket);
    if (ticket.defenderId) await ctx.locks.release(ticket.defenderId, me.id);
    throw fail(409, 'no_warriors', 'pvp.no_warriors');
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
    let delta = result.stars >= 1 ? winTrophies(attacker.trophies, defTrophies, data) : -lossTrophies(attacker.trophies, defTrophies, data);
    // Beast Mode SEC-01 (interim): a village kept on the device gains at most DEVICE_HONOR_PER_DAY honor a UTC day.
    const gainCap = ctx.policy.deviceHonorPerDay;
    const gainedToday = attacker.honorGain?.day === day ? attacker.honorGain.gained : 0;
    const capped = delta > 0 && gainCap > 0 && !(await hasServerVillage(tx, me.id));
    if (capped) delta = Math.min(delta, Math.max(0, gainCap - gainedToday));
    const playerTrophies = Math.max(0, attacker.trophies + delta);
    // P5-03 (review M1): the daily contract is the one of the ticket's start (the server's clock), sent back so the
    // game settles with the same contract; the device's own clock never picks it.
    const contractAt = ticket.startedAt ?? ticket.createdAt;
    const response: AttackResponse = { attackId, result, trophies: delta, playerTrophies, ...(stake !== undefined ? { stake } : {}), contractAt };
    // Staked honor (balance audit 2026-11-08): a lost defence costs `defenseHonorLossShare` of the raider's gain
    // (none by default); step 30's daily cap still applies. A held raid pays the defender as before.
    const lostToday = defender?.honorLoss?.day === day ? defender.honorLoss.lost : 0;
    // XPL-12 (P1-20): a lost attack pays the defender honor, but one attacker gives one defender at most
    // MAX_HONOR_FROM_ONE_ATTACKER a day (an alternate account feeding a main with 0-star raids had no limit).
    const todayFromMe = defender ? (await tx.defensesFor(defender.id, day * 86_400_000, 200)).filter((a) => a.attackerId === me.id) : [];
    const fromThisAttacker = delta < 0 ? todayFromMe.reduce((n, a) => n + Math.max(0, a.defenderTrophies ?? 0), 0) : 0;
    const defLoss = delta > 0 ? Math.max(0, Math.min(defenseHonorLoss(delta, data), rdef.defenderDailyHonorLossCap - lostToday)) : -Math.min(-delta, Math.max(0, MAX_HONOR_FROM_ONE_ATTACKER - fromThisAttacker));
    const defPatch: { trophies: number; shieldUntil?: number; honorLoss?: { day: number; lost: number }; ratings?: { attack: Rating; base: Rating } } = { trophies: Math.max(0, (defender?.trophies ?? 0) - defLoss) };
    // P3-12: one rule with the game (sim/shield.ts): the player's first attack keeps its shield.
    // Independent review 2026-11-18: any earlier used pvp ticket (generated opponents too: they write no attack row),
    // or any honor (a shielded newcomer cannot be raided, so honor means raids).
    const attackedBefore = (attacker.trophies ?? 0) > 0 || (await tx.attackedBefore(me.id, ticket.id));
    const mePatch: { trophies: number; shieldUntil: number; ratings?: { attack: Rating; base: Rating }; honorGain?: { day: number; gained: number } } = { trophies: playerTrophies, shieldUntil: shieldAfterAttack(attacker.shieldUntil, t, attackedBefore, data) };
    if (capped) mePatch.honorGain = { day, gained: gainedToday + delta };
    if (defender) {
      defPatch.honorLoss = { day, lost: lostToday + Math.max(0, defLoss) };
      // Step 28: the attacker's Attack Rating and the defender's Base Rating move; bots never move a rating.
      const rated = rateBattle(ratingsOf(attacker, t, ctx).attack, ratingsOf(defender, t, ctx).base, await attackPower(tx, attacker, data), defensePower(ticket.base, data), result.stars, result.destruction, t, rdef);
      mePatch.ratings = { attack: rated.attack, base: ratingsOf(attacker, t, ctx).base };
      defPatch.ratings = { attack: ratingsOf(defender, t, ctx).attack, base: rated.base };
    }
    // XPL-12 (P1-20): a raid that took nothing (a missed stake) gives no shield: an alternate account declaring
    // three stars and stopping at two used to shield a main for 14 to 16 hours at no cost.
    const shield = kept ? 0 : shieldHoursFor(result.destruction, data);
    if (defender && shield > 0) defPatch.shieldUntil = Math.max(defender.shieldUntil, t + shield * HOUR);
    const lootFrom = !defender ? 'generated-base' : (await hasServerVillage(tx, defender.id)) ? 'server-village' : 'uploaded-base';
    // Exploit audit 2026-11-20 #7: a base the device uploaded holds whatever loot it claims (within the storage cap),
    // so an alt could plant a full undefended base, be raided for real server resources, drop its shield and upload
    // again. Loot from an uploaded base pays at most what the poorest generated base of its Keep would.
    let paid = lootFrom === 'uploaded-base' ? uploadedBaseResult(result, ticket.base.hallLevel ?? defender?.hallLevel ?? 1, data) : result;
    // Beast Mode GT-17: one attacker takes at most a share of the defender's storage cap from it per UTC day.
    if (defender && lootFrom === 'server-village') {
      const caps = data.raids.storageLootCapByHall;
      const cap = Math.floor(ctx.policy.pairDailyLootShare * caps[Math.max(1, Math.min(caps.length, ticket.base.hallLevel ?? defender.hallLevel)) - 1]);
      const taken: Cost = {};
      for (const a of todayFromMe) for (const [k, v] of Object.entries(a.result.loot ?? {}) as [ResourceKind, number][]) taken[k] = (taken[k] ?? 0) + (v ?? 0);
      paid = pairCapped(paid, taken, cap);
    }
    response.result = paid;
    // Marking the ticket used and storing the answer comes first: only the first report applies anything.
    if (!(await tx.useTicket(ticket.id, response))) return 'used' as const;
    // A village the server keeps: the troops must be there, they are spent, and the loot is banked.
    const mine = await applyServerResult(tx, ctx, attacker, [
      { cmd: { type: 'battleEnd', record: { at: t, opponentName: ticket.defenderName, setup, deployments, endTick: sub.endTick, ticket: ticket.id, ...(stake !== undefined ? { stake } : {}) }, known: result }, reason: 'attack:troops' },
      { cmd: { type: 'settleOnlineAttack', ticket: ticket.id, result: paid, trophies: delta, playerTrophies, ...(stake !== undefined ? { stake } : {}), contractAt }, reason: lootFrom === 'server-village' ? 'attack:loot' : `attack:loot:${lootFrom}` },
    ], attackId);
    if (mine && !mine.ok) throw fail(400, 'bad_request', 'village.says', { detail: mine.message });
    await tx.updatePlayer(attacker.id, mePatch);
    if (defender) {
      await tx.updatePlayer(defender.id, defPatch);
      // The defender's village on the server loses what was taken, from the buildings that fell (no second simulation).
      // A missed stake: the defender keeps everything, so its record (and a game that holds its own village) shows no loss.
      const defResult = kept ? { ...paid, loot: {} } : paid;
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
    throw fail(409, 'conflict', 'battle.already_reported');
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
  const filter = boardFilter(ctx);
  const [top, values] = await Promise.all([ctx.repo.topByPower(100, def.powerBoardMinBattles, def.powerWeight, filter), ctx.repo.powerValues(def.powerBoardMinBattles, def.powerWeight, filter)]);
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
  const filter = boardFilter(ctx);
  let ids = (await ctx.board.top(n, filter)).map((e) => e.id);
  if (filter.hideUnder13) {
    // A Redis set filled before the mode changed may still hold an under-13 player: leave them out and drop them from the set.
    const young = await ctx.repo.under13Among(ids);
    for (const id of young) await ctx.board.remove(id);
    ids = ids.filter((id) => !young.has(id));
  }
  if (filter.heldOnly) {
    // Beast Mode SEC-01: a Redis set filled before the policy was on may hold device players: leave them out and drop them.
    const held = await Promise.all(ids.map((id) => hasServerVillage(ctx.repo, id)));
    for (const [i, id] of ids.entries()) if (!held[i]) await ctx.board.remove(id);
    ids = ids.filter((_, i) => held[i]);
  }
  const top = await ctx.repo.playersByIds(ids);
  const groveNames = new Map<string, string>();
  for (const p of top) {
    if (p.groveId && !groveNames.has(p.groveId)) groveNames.set(p.groveId, (await ctx.repo.getGrove(p.groveId))?.name ?? '');
  }
  return {
    players: top.map((p, i) => ({ rank: i + 1, name: p.name, trophies: p.trophies, hallLevel: p.hallLevel, grove: p.groveId ? groveNames.get(p.groveId) || null : null })),
    me: me.base ? { rank: await ctx.board.rankOf(me.trophies, filter), trophies: me.trophies } : null,
  };
}
