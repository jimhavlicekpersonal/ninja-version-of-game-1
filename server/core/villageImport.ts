/**
 * Moving a village from a device to the server (roadmap step 25), once, with
 * sanity limits for its Keep. The server cannot know how the village was
 * built (it lived on the device), so it refuses what no real village at that
 * Keep could hold: buildings the Keep does not allow, more resources than the
 * storages hold, an army or Lodge bigger than the Keep's, warriors or research
 * the Keep cannot have, timers that end absurdly late, and more Jade than
 * IMPORT_MAX_JADE. What passes becomes the server's village; from then on
 * every change is checked.
 *
 * Provenance (worldwide audit GLOBAL-002): legality is not proof. A village
 * made in the testing sandbox is refused. Paid value is accepted only where
 * this server checked the store purchase for this player: a premium Season
 * Scroll needs a credited Scroll purchase this season, and Jade above what a
 * player at that Keep could have earned for free (`freeJadeAllowance`, set
 * well above the model player's measured balances) needs credited Jade
 * purchases to cover it. What cannot be confirmed is held back (`import_holds`,
 * reported to the game as `importHeld`), never thrown away: the device keeps
 * its old village as a backup and staff can return what support confirms.
 * Progress the device earned (buildings, research, resources within storage)
 * still moves as it is: the server cannot tell an edited save from real
 * offline play there, beyond the legality checks.
 */
import { maxHousingAtHall, troopEarliestKeep } from '../../src/gameplay/sim/army';
import { localDayIndex } from '../../src/gameplay/sim/calendar';
import { buildingDef, levelDef, troopLevel } from '../../src/gameplay/sim/data';
import { villageToBase } from '../../src/gameplay/sim/defense';
import { topUpOne, topUpScale } from '../../src/gameplay/sim/economy';
import { leavesEntryRoom } from '../../src/gameplay/sim/entryRoom';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { capacity } from '../../src/gameplay/sim/resources';
import { deserialize, serialize } from '../../src/gameplay/sim/save';
import { economyHash } from '../../src/gameplay/sim/serverEconomy';
import { reinforcementHousing } from '../../src/gameplay/sim/social/grove';
import type { Cost, GameData, PurchaseRecord, VillageState } from '../../src/gameplay/sim/types';
import { bindPlayer } from '../../src/gameplay/sim/net';
import { hallLevel, limitFor } from '../../src/gameplay/sim/village';
import { productInfo } from '../../src/gameplay/sim/monetization';
import { dayIndex, passSeason, unlockedTier } from '../../src/gameplay/sim/pass';
import { seasonOf } from '../../src/gameplay/sim/ranks';
import { achievementValue } from '../../src/gameplay/sim/achievements';
import type { VillageResponse } from '../../src/backend/net/protocol';
import type { ImportHold, Player, PurchaseRow, VillageRow } from '../repo';
import { HOUR, type ServerContext } from './context';
import { maxReinforcementAt, normalizeBase } from './pvp';
import { getVillage } from './village';
import { fail } from './errors';

/** No village holds more Jade than this, earned or bought: refused outright. Below it, unconfirmed Jade is held back (`checkProvenance`). */
export const IMPORT_MAX_JADE = 200_000;
/**
 * Free Jade a village at Keep k may bring without a checked purchase: the
 * starting 500 plus room for tasks, chests, leagues, the free pass track,
 * achievements and obstacles. Measured with the model players (tools/balance,
 * 2026-11-05): the regular player holds about 500 Jade at Keep 4, 850 at Keep
 * 10 and 2,600 at Keep 15 (day 200); the casual one about 790 at Keep 5, 1,750
 * at Keep 10 and 3,700 at Keep 15 (day 420), roughly 7.6 a day. This allows
 * 2,000 at Keep 1 up to 16,000 at Keep 15 (4-8x those balances), so real
 * players are not cut while a forged new village cannot bring thousands. A
 * player who hoarded beyond it is held for support, not refused.
 */
export function freeJadeAllowance(keep: number): number {
  return 2_000 + 1_000 * (Math.max(1, keep) - 1);
}

/** What the server confirms about the village's paid value, and what it holds back. */
export interface Provenance {
  /** The village with unconfirmed paid value held back. */
  state: VillageState;
  held: { jade: number; premium: boolean; purchases: string[] } | null;
}

/**
 * The most Jade a purchase of this product can have delivered at this Keep: its own Jade, plus, for an offer,
 * every resource in it delivered as Jade (what an offer does with the part that does not fit in storage).
 */
function mostJade(productId: string, keep: number, data: GameData): number {
  const info = productInfo(data, productId);
  if (!info) return 0;
  let jade = info.grants.moonstones ?? 0;
  if (info.kind === 'offer') {
    const scale = topUpScale(keep, data);
    for (const [k, v] of Object.entries(info.grants)) if (k !== 'moonstones' && (v ?? 0) > 0) jade += topUpOne(Math.round((v ?? 0) * scale), data, keep);
  }
  return jade;
}

const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * A timer's recorded price, held to what that work costs in the catalog (review R3-01: a cancel refunds from this
 * record, and a forged one paid 3,000,000 Jade in three cancels). Each resource is at most its catalog amount;
 * a Coin price may have been paid in Provisions, one for one (walls and traps); Jade only where the catalog
 * price is in Jade.
 */
function heldToCatalog(cost: unknown, catalog: Cost): Cost {
  const c = (cost && typeof cost === 'object' ? cost : {}) as Record<string, unknown>;
  const out: Cost = {};
  const coins = Math.min(whole(c.acorns), catalog.acorns ?? 0);
  const provisions = Math.min(whole(c.dew), (catalog.dew ?? 0) + (catalog.acorns ?? 0) - coins);
  const sap = Math.min(whole(c.nightsap), catalog.nightsap ?? 0);
  const jade = Math.min(whole(c.moonstones), catalog.moonstones ?? 0);
  if (coins > 0) out.acorns = coins;
  if (provisions > 0) out.dew = provisions;
  if (sap > 0) out.nightsap = sap;
  if (jade > 0) out.moonstones = jade;
  return out;
}

/** What the work behind a building's timer costs in the catalog. */
function buildingWorkCost(type: string, toLevel: number, data: GameData): Cost {
  const def = data.buildings[type];
  if (!def) return {};
  if (def.category === 'obstacle') return toLevel === 0 ? def.clear?.cost ?? {} : {};
  if (def.category === 'builder') return { moonstones: Math.max(0, ...data.economy.builderHutCosts) };
  return levelDef(data, type, toLevel)?.cost ?? {};
}

/**
 * Hold back what this server cannot confirm (GLOBAL-002), and take nothing from the file that a later command
 * turns into currency. `credited`: this player's purchases the server checked (any store), still credited.
 *
 * Review 2026-11-17 (R3-01 to R3-12): the file is the device's word. Everything in it that a command pays out
 * from is either rebuilt from what this server knows (purchases), held to the catalog (timer prices), marked as
 * already taken (Scroll tiers, today's tasks, chest and calendar day), or dropped (a raider to settle the score
 * with, the offline Alliance's war, lists longer than the game keeps). A real player loses only rewards not yet
 * collected before the move, and the refund of a timer that was running during it stays at the catalog price.
 */
export function checkProvenance(s: VillageState, now: number, data: GameData, credited: PurchaseRow[]): Provenance {
  const state = structuredClone(s);
  const keep = hallLevel(state, data);
  // Purchases. A record counts as paid only when its id is a purchase this server credited, and then only the
  // server's row says what was bought: the file's product, grants, stipend, premium and refund fields are not
  // kept (one real $0.99 purchase whose record named the Scroll, 150,000 Jade and a 5,000,000 Jade stipend
  // covered all of it, R3-03; a forged `refund` made a purchase refund-proof, R3-09). A refund then takes the
  // catalog contents, as it does for records from before those fields existed.
  const rows = new Map(credited.filter((p) => p.status === 'credited').map((p) => [`${p.store}:${p.transactionId}`, p]));
  const confirmed: PurchaseRow[] = [];
  const unconfirmed: string[] = [];
  const seen = new Set<string>();
  const purchases: PurchaseRecord[] = [];
  for (const p of Array.isArray(state.purchases) ? state.purchases : []) {
    const id = typeof p?.id === 'string' ? p.id : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row = rows.get(id);
    if (row) {
      confirmed.push(row);
      purchases.push({ id, productId: row.productId, usd: row.cents / 100, at: row.at });
    } else {
      unconfirmed.push(id);
      purchases.push({ id, productId: typeof p.productId === 'string' ? p.productId : '', usd: Number.isFinite(p.usd) ? p.usd : 0, at: Number.isFinite(p.at) ? Math.min(p.at, now) : now });
    }
  }
  state.purchases = purchases;
  const paidJade = confirmed.reduce((sum, row) => sum + mostJade(row.productId, keep, data), 0);
  const allowed = freeJadeAllowance(keep) + paidJade;
  let jade = Math.max(0, Math.round(state.resources.moonstones - allowed));
  state.resources.moonstones -= jade;
  // Exploit audit 2026-11-16 (XPL-03): the Jade a Clan Stipend still owes is paid value too. Only what the
  // credited stipend purchases can have added may move, at the rate it was sold (a stipend with one payment
  // left paid everything at once); the rest is held back like other unconfirmed Jade, never thrown away.
  const stipendDef = data.store.stipend;
  const bought = stipendDef ? confirmed.filter((r) => r.productId === stipendDef.id).length : 0;
  const paidStipend = stipendDef ? { payments: bought * stipendDef.payments, jade: bought * stipendDef.payments * stipendDef.jadePerPayment } : { payments: 0, jade: 0 };
  const owed = whole(state.stipend?.jade);
  const stipendJade = Math.min(owed, paidStipend.jade);
  jade += owed - stipendJade;
  const left = stipendJade > 0 && stipendDef ? Math.min(paidStipend.payments, Math.max(whole(state.stipend.left), Math.ceil(stipendJade / stipendDef.jadePerPayment))) : 0;
  state.stipend = { ...state.stipend, left, jade: stipendJade };
  // Timers: the Jade share of a top-up is a claim on Jade (a cancel refunds it), and so is the recorded price.
  for (const b of state.buildings) {
    if (!b.upgrade) continue;
    delete b.upgrade.topUp;
    b.upgrade.cost = heldToCatalog(b.upgrade.cost, buildingWorkCost(b.type, b.upgrade.toLevel, data));
  }
  for (const q of state.training) {
    delete q.topUp;
    q.cost = heldToCatalog(q.cost, data.troops[q.troop] ? troopLevel(data, q.troop, Math.max(1, state.research.levels[q.troop] ?? 1)).cost : {});
  }
  for (const r of state.research.active) {
    delete r.topUp;
    r.cost = heldToCatalog(r.cost, data.troops[r.troop] ? troopLevel(data, r.troop, r.toLevel).research?.cost ?? {} : {});
  }
  // League seasons the device says it is behind on are not proof either: they count as settled, so an old or
  // forged season number pays no chests here.
  if (state.season < seasonOf(now)) state.season = seasonOf(now);
  // The Season Scroll. A Scroll of another season than now's is not carried (the game rolls it the moment a
  // season ends, so a file that is behind was edited or is stale; settling it here paid a premium tier with no
  // purchase to take it back from, review SCR-03).
  const season = passSeason(now, data);
  const paidPass = confirmed.some((p) => productInfo(data, p.productId)?.kind === 'pass' && passSeason(p.at, data) === season);
  const premium = state.pass.premium && !paidPass;
  if (state.pass.season !== season) state.pass = { season, points: 0, premium: state.pass.premium && paidPass, claimedFree: [], claimedPremium: [] };
  else if (premium) state.pass.premium = false;
  // Re-audit: counters and claims are not proof either. Whatever the imported counters already
  // reached counts as claimed, so forged stats, pass points or task progress pay out nothing more
  // (real players lose only rewards they had not collected yet before the move).
  for (const def of data.achievements) {
    const value = achievementValue(state, def, keep);
    const reached = def.tiers.filter((tier) => value >= tier[0]).length;
    state.achievements[def.id] = Math.max(state.achievements[def.id] ?? 0, reached);
  }
  // Tiers are numbered from 1 (this marked 0 to n - 1, so the highest unlocked tier still paid: R3-11).
  const tiers = Array.from({ length: unlockedTier(state, data) }, (_, i) => i + 1);
  state.pass.claimedFree = [...new Set([...state.pass.claimedFree.filter(Number.isInteger), ...tiers])];
  state.pass.claimedPremium = [...new Set([...state.pass.claimedPremium.filter(Number.isInteger), ...tiers])];
  // Today's and this week's tasks count as done, whichever the file lists and at whatever targets (a file named
  // every task with target 0: R3-11). The next day and week are chosen by the game's own rule.
  const { dayIds: _dayIds, weekIds: _weekIds, dayTargets: _dayTargets, weekTargets: _weekTargets, ...tasks } = state.tasks;
  state.tasks = { ...tasks, dayBaseline: { ...state.stats }, weekBaseline: { ...state.stats }, dayClaimed: data.pass.dailyTasks.map((t) => t.id), weekClaimed: data.pass.weeklyChallenges.map((t) => t.id) };
  // Today's chest and calendar day count as taken (a file set to the last calendar day and the top streak step
  // was paid both on the first command: R3-12).
  state.daily = { ...state.daily, lastDay: Math.max(Number.isFinite(state.daily.lastDay) ? state.daily.lastDay : -1, dayIndex(now, data)) };
  state.calendar = { ...state.calendar, lastDay: Math.max(Number.isFinite(state.calendar.lastDay) ? state.calendar.lastDay : -1, localDayIndex(state, now, data)) };
  // The offline Alliance and its war stay on the device (the game leaves it when it goes online: the same
  // fields as `leaveLocalGrove`). A forged war record was paid as a draw on the first command (R3-12).
  state.grove = { ...state.grove, joined: false, requests: [], myRequest: null, raid: null };
  // Logs: no longer than the game keeps them, and no raider to settle the score with. A defense record names the
  // raider's own base, and a rematch pays by it: twelve forged records paid 17 million Coins and Provisions
  // (R3-04). Raids the server sends from now on carry their own.
  state.defenseLog = state.defenseLog.slice(-data.raids.maxDefenseLog).map((r) => {
    const { raider: _raider, ...rest } = r;
    return rest;
  });
  state.battleLog = state.battleLog.slice(-data.battle.maxReplays);
  state.seasonLog = state.seasonLog.slice(-IMPORT_KEPT_LOG);
  state.daily.history = state.daily.history.slice(-IMPORT_KEPT_LOG);
  state.grove.raidHistory = (Array.isArray(state.grove.raidHistory) ? state.grove.raidHistory : []).slice(-8);
  state.grove.chat = state.grove.chat.slice(-IMPORT_KEPT_CHAT);
  // A Season Scroll look nobody paid for (this server never credited a Scroll purchase) does not move.
  const anyPass = confirmed.some((p) => productInfo(data, p.productId)?.kind === 'pass');
  const passOnly = new Set(data.cosmetics.hallSkins.filter((k) => k.passOnly).map((k) => k.id));
  if (!anyPass && state.cosmetics.owned.some((id) => passOnly.has(id))) {
    state.cosmetics.owned = state.cosmetics.owned.filter((id) => !passOnly.has(id));
    if (passOnly.has(state.cosmetics.hallSkin)) state.cosmetics.hallSkin = state.cosmetics.owned[0] ?? 'classic';
  }
  return { state, held: jade || premium || unconfirmed.length ? { jade, premium, purchases: unconfirmed } : null };
}

/** League seasons and daily chests kept in an imported village's history. */
const IMPORT_KEPT_LOG = 30;
/** Offline Alliance chat lines kept in an imported village. */
const IMPORT_KEPT_CHAT = 100;

/**
 * Ledger audit A2 / E11: the server cannot tell real offline play from a save
 * edited, or played with the phone's clock moved forward, so the device's own
 * dates prove nothing. What the server does know is how long this account has
 * existed. A village above IMPORT_FREE_KEEP moves only once the account is at
 * least IMPORT_AGE_SHARE of the days the regular model player (4 sessions a
 * day, no Jade spent: docs/game-theory/CAMPAIGN.md, 2026-11-05) needed to reach
 * its Keep. An honest offline player keeps playing on the device and moves
 * later; a forged Keep-15 village needs a 60-day-old account instead of a
 * minute, and deleting the account and registering again starts the wait over.
 * Limitation: accounts registered early and left to age still pass.
 */
export const MODEL_DAYS_TO_KEEP = [0, 0, 0, 0.7, 4.2, 10.4, 16.6, 23.4, 28, 32.6, 42.2, 52, 65.6, 93, 121.2];
export const IMPORT_FREE_KEEP = 5;
export const IMPORT_AGE_SHARE = 0.5;
const DAY_MS = 24 * HOUR;

/** Days an account must have existed before it may bring a village at this Keep. */
export function importMinAccountDays(keep: number): number {
  if (keep <= IMPORT_FREE_KEEP) return 0;
  return IMPORT_AGE_SHARE * MODEL_DAYS_TO_KEEP[Math.min(keep, MODEL_DAYS_TO_KEEP.length) - 1];
}

/** No timer may end later than this after the move (the longest Keep upgrade is about a week). */
export const IMPORT_MAX_TIMER_MS = 30 * 24 * HOUR;

/** Why this village could not exist at its Keep, or null when it passes. */
export function importProblem(s: VillageState, now: number, data: GameData): string | null {
  const keep = hallLevel(s, data);
  const base = normalizeBase(villageToBase(s, now, data), data);
  if ('error' in base) return `Buildings: ${base.error}.`;
  // Review R3-06: the base above leaves out buildings under construction, decorations and obstacles, and a timer
  // dated in the past finishes on the first command. So every building counts, at the level its timer leads to
  // (40 Coin stores under construction at Keep 1 passed, and their capacity then sized every capped reward).
  const counts: Record<string, number> = {};
  let obstacles = 0;
  for (const b of s.buildings) {
    const def = buildingDef(data, b.type);
    if (def.category === 'obstacle') {
      obstacles++;
      continue;
    }
    counts[b.type] = (counts[b.type] ?? 0) + 1;
    const lim = limitFor(s, data, b.type);
    const target = b.upgrade ? Math.max(b.level, b.upgrade.toLevel) : b.level;
    // The Keep's own upgrade may be running: its target is one above the Keep the limits are read at.
    if (def.category !== 'hall' && (counts[b.type] > lim.count || target > lim.maxLevel)) return `Buildings: more or higher ${def.name} than this Keep allows.`;
    if (def.category === 'hall' && target > keep + 1) return 'Buildings: a Keep upgrade that skips a level.';
  }
  // Attackers must be able to get in (sim/entryRoom.ts): a layout that closes the map to them is not a village.
  if (!leavesEntryRoom(s.buildings, data)) return 'Buildings: the layout leaves attackers no way in.';
  // A village starts with its obstacles and never gains one (each cleared one pays a little Jade).
  if (obstacles > data.economy.obstacles.count) return 'Buildings: more obstacles than a village starts with.';
  const cap = capacity(s, data);
  for (const k of ['acorns', 'dew', 'nightsap'] as const) if ((s.resources[k] ?? 0) > (cap[k] ?? 0)) return `More ${data.economy.resourceNames?.[k] ?? k} than the storages hold.`;
  // The Jade a Clan Stipend still owes counts with the Jade on hand.
  if ((s.resources.moonstones ?? 0) + Math.max(0, Number.isFinite(s.stipend?.jade) ? s.stipend.jade : 0) > IMPORT_MAX_JADE) return 'More Jade than a village can have earned.';
  let housing = 0;
  const queued = s.training.map((t) => t.troop);
  for (const [t, n] of [...Object.entries(s.army), ...queued.map((q) => [q, 1] as [string, number])]) {
    const def = data.troops[t];
    if (!def || !(n >= 0)) return 'Unknown warriors.';
    if (n > 0 && troopEarliestKeep(t, data) > keep) return `Warriors this Keep cannot train (${def.name}).`;
    housing += def.housing * n;
  }
  // Ready warriors and the queue together fit the camps plus one more army (the next-army queue).
  if (housing > 2 * maxHousingAtHall(keep, data)) return 'A bigger army than this Keep can house.';
  if (reinforcementHousing(s, data) > maxReinforcementAt(keep, data)) return 'More donated warriors than this Keep’s Lodge holds.';
  for (const [t, lvl] of Object.entries(s.research.levels)) {
    if (!data.troops[t] || lvl > Math.min(troopLevelCapAt(keep, data, t), data.troops[t].levels.length)) return 'Research beyond what this Keep allows.';
  }
  // Research in progress leads to a level too (six timers to level 20 passed at Keep 1: R3-06).
  const lanes = data.hall.levels[keep - 1]?.researchLanes ?? 1;
  if (s.research.active.length > lanes || new Set(s.research.active.map((r) => r.troop)).size !== s.research.active.length) return 'More research at once than this Keep allows.';
  for (const r of s.research.active) {
    if (!data.troops[r.troop] || !Number.isInteger(r.toLevel) || r.toLevel !== (s.research.levels[r.troop] ?? 1) + 1) return 'Research beyond what this Keep allows.';
    if (r.toLevel > Math.min(troopLevelCapAt(keep, data, r.troop), data.troops[r.troop].levels.length)) return 'Research beyond what this Keep allows.';
  }
  const timers = [...s.buildings.map((b) => b.upgrade?.endsAt ?? 0), ...s.training.map((t) => t.endsAt), ...s.research.active.map((r) => r.endsAt)];
  if (timers.some((t) => t > now + IMPORT_MAX_TIMER_MS)) return 'A timer that ends impossibly late.';
  return null;
}

/** No list in a village file is longer than this (the longest the game writes is the training queue). */
export const IMPORT_MAX_LIST = 2_000;
/** No village file holds more objects and lists than this (a full Keep 15 village with its replays has under 40,000). */
export const IMPORT_MAX_NODES = 200_000;

/**
 * Why the file is too large to look at, or null. Review R3-07 / R3-08: lists in the file sized the work of
 * reading it (a 271 KB file took 1.4 s and 447 MB) and of the first commands after it (9.5 s for one ordinary
 * command), so sizes are checked first, on the raw body, before anything else walks it.
 */
export function importSizeProblem(file: unknown, data: GameData): string | null {
  const village = (file as { village?: unknown } | null)?.village;
  if (!village || typeof village !== 'object') return null;
  const buildings = (village as { buildings?: unknown }).buildings;
  if (Array.isArray(buildings) && buildings.length > data.economy.mapSize * data.economy.mapSize) return 'More buildings than the map has tiles.';
  let nodes = 0;
  const todo: unknown[] = [village];
  while (todo.length) {
    const x = todo.pop();
    if (++nodes > IMPORT_MAX_NODES) return 'A file larger than any village.';
    if (Array.isArray(x)) {
      if (x.length > IMPORT_MAX_LIST) return 'A list longer than any village keeps.';
      for (const y of x) if (y && typeof y === 'object') todo.push(y);
    } else for (const y of Object.values(x as object)) if (y && typeof y === 'object') todo.push(y);
  }
  return null;
}

/**
 * GLOBAL-002: does the village carry the testing sandbox's marks? The flag, or a purchase recorded by the
 * sandbox's instant store (`MockPaymentProvider`: ids `mock:…` / `…:mock-…`).
 */
export function sandboxEvidence(s: VillageState): boolean {
  if (s.flags.sandbox) return true;
  return s.purchases.some((p) => typeof p.id === 'string' && /(^mock[:-])|(:mock-)/i.test(p.id));
}

/** POST /v1/village/import: the device's village becomes the server's (once). */
export async function importVillage(ctx: ServerContext, me: Player, body: { file?: unknown } | undefined): Promise<VillageResponse> {
  if (await ctx.repo.getVillage(me.id)) throw fail(409, 'conflict', 'import.already');
  const tooBig = importSizeProblem(body?.file, ctx.data);
  if (tooBig) {
    ctx.log('warn', 'village import refused', { player: me.id, problem: tooBig });
    throw fail(400, 'bad_request', 'import.refused', { detail: tooBig });
  }
  let state: VillageState;
  try {
    state = deserialize(body?.file, ctx.data);
  } catch (e) {
    throw fail(400, 'bad_request', 'import.unreadable', { detail: (e as Error).message });
  }
  const t = ctx.now();
  // GLOBAL-002: `flags.sandbox` is the game's own mark and a save code can be edited to drop it, so the
  // server also looks for what the sandbox leaves behind (purchases of its instant test store). Removing
  // every trace still leaves the provenance holds below and the account-age rule (A2).
  if (sandboxEvidence(state)) {
    ctx.log('warn', 'village import refused', { player: me.id, problem: 'sandbox' });
    throw fail(400, 'bad_request', 'import.sandbox');
  }
  const problem = importProblem(state, t, ctx.data);
  if (problem) {
    ctx.log('warn', 'village import refused', { player: me.id, problem });
    throw fail(400, 'bad_request', 'import.refused', { detail: problem });
  }
  const keep = hallLevel(state, ctx.data);
  const needDays = importMinAccountDays(keep);
  const ageDays = (t - me.createdAt) / DAY_MS;
  if (ageDays < needDays) {
    ctx.metrics.count('tk_refused_total', { reason: 'import_account_too_new' });
    ctx.log('warn', 'village import refused', { player: me.id, problem: 'account_too_new', keep, ageDays: Math.floor(ageDays) });
    const wait = Math.max(1, Math.ceil(needDays - ageDays));
    throw fail(403, 'cooldown', 'import.too_new', { keep, days: Math.ceil(needDays), wait });
  }
  const checked = checkProvenance(state, t, ctx.data, await ctx.repo.purchasesOf(me.id, 1000));
  state = checked.state;
  const held: ImportHold | null = checked.held ? { id: ctx.uuid(), playerId: me.id, at: t, ...checked.held, status: 'held' } : null;
  if (held) ctx.log('warn', 'village import held back unconfirmed paid value', { player: me.id, jade: held.jade, premium: held.premium, purchases: held.purchases.length });
  // Exactly as sent (no settling: the economy must stay the game's), with the server's own facts:
  // the player, honor, shield, and raids already seen.
  bindPlayer(state, me.id);
  state.trophies = me.trophies;
  state.shieldUntil = me.shieldUntil;
  state.net.defensesSince = Math.max(state.net.defensesSince, t);
  // Re-audit: dated now, never by the device's clock. A save dated a year back let commands be dated
  // a year back too (a finished Keep upgrade, months of collector output in one batch).
  const at = t;
  const row: VillageRow = { playerId: me.id, file: serialize(state, at), revision: 1, seq: 0, at, stateHash: economyHash(state), createdAt: t, updatedAt: t };
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.createVillage(row))) throw fail(409, 'conflict', 'import.already');
    const opening = (Object.entries(state.resources) as [string, number][]).filter(([, v]) => v).map(([k, v]) => ({ playerId: me.id, at: t, resource: k, delta: Math.round(v), balance: Math.round(v), reason: 'import', ref: null }));
    await tx.saveVillage({ ...row, revision: 2 }, 1, opening, []);
    if (held) await tx.addImportHold(held);
  });
  const out = await getVillage(ctx, me);
  return held ? { ...out, importHeld: { jade: held.jade, premium: held.premium, purchases: held.purchases.length } } : out;
}
