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
import { villageToBase } from '../../src/gameplay/sim/defense';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { capacity } from '../../src/gameplay/sim/resources';
import { deserialize, serialize } from '../../src/gameplay/sim/save';
import { economyHash } from '../../src/gameplay/sim/serverEconomy';
import { reinforcementHousing } from '../../src/gameplay/sim/social/grove';
import type { GameData, VillageState } from '../../src/gameplay/sim/types';
import { bindPlayer } from '../../src/gameplay/sim/net';
import { hallLevel } from '../../src/gameplay/sim/village';
import { productInfo } from '../../src/gameplay/sim/monetization';
import { passSeason, unlockedTier } from '../../src/gameplay/sim/pass';
import { achievementValue } from '../../src/gameplay/sim/achievements';
import type { VillageResponse } from '../../src/backend/net/protocol';
import type { ImportHold, Player, PurchaseRow, VillageRow } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';
import { maxReinforcementAt, normalizeBase } from './pvp';
import { getVillage } from './village';

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
 * Hold back what this server cannot confirm (GLOBAL-002). `credited`: this
 * player's purchases the server checked (any store), still credited.
 */
export function checkProvenance(s: VillageState, now: number, data: GameData, credited: PurchaseRow[]): Provenance {
  const state = structuredClone(s);
  const ok = new Set(credited.filter((p) => p.status === 'credited').map((p) => `${p.store}:${p.transactionId}`));
  const confirmed = state.purchases.filter((p) => ok.has(p.id));
  const unconfirmed = state.purchases.filter((p) => !ok.has(p.id)).map((p) => p.id);
  // What each purchase really delivered (offers may convert to Jade; the record keeps it), else the catalog.
  const paidJade = confirmed.reduce((sum, p) => sum + ((p.grants ?? productInfo(data, p.productId)?.grants)?.moonstones ?? 0), 0);
  const allowed = freeJadeAllowance(hallLevel(state, data)) + paidJade;
  const jade = Math.max(0, Math.round(state.resources.moonstones - allowed));
  state.resources.moonstones -= jade;
  const season = passSeason(now, data);
  const paidPass = confirmed.some((p) => productInfo(data, p.productId)?.kind === 'pass' && passSeason(p.at, data) === season);
  const premium = state.pass.premium && !paidPass;
  if (premium) state.pass.premium = false;
  // Re-audit: counters and claims are not proof either. Whatever the imported counters already
  // reached counts as claimed, so forged stats, pass points or task progress pay out nothing more
  // (real players lose only rewards they had not collected yet before the move).
  for (const def of data.achievements) {
    const value = achievementValue(state, def, hallLevel(state, data));
    const reached = def.tiers.filter((tier) => value >= tier[0]).length;
    state.achievements[def.id] = Math.max(state.achievements[def.id] ?? 0, reached);
  }
  const tiers = Array.from({ length: unlockedTier(state, data) }, (_, i) => i);
  state.pass.claimedFree = [...new Set([...state.pass.claimedFree, ...tiers])];
  state.pass.claimedPremium = [...new Set([...state.pass.claimedPremium, ...tiers])];
  state.tasks = { ...state.tasks, dayBaseline: { ...state.stats }, weekBaseline: { ...state.stats } };
  // A Season Scroll look nobody paid for (this server never credited a Scroll purchase) does not move.
  const anyPass = confirmed.some((p) => productInfo(data, p.productId)?.kind === 'pass');
  const passOnly = new Set(data.cosmetics.hallSkins.filter((k) => k.passOnly).map((k) => k.id));
  if (!anyPass && state.cosmetics.owned.some((id) => passOnly.has(id))) {
    state.cosmetics.owned = state.cosmetics.owned.filter((id) => !passOnly.has(id));
    if (passOnly.has(state.cosmetics.hallSkin)) state.cosmetics.hallSkin = state.cosmetics.owned[0] ?? 'classic';
  }
  return { state, held: jade || premium || unconfirmed.length ? { jade, premium, purchases: unconfirmed } : null };
}

/** No timer may end later than this after the move (the longest Keep upgrade is about a week). */
export const IMPORT_MAX_TIMER_MS = 30 * 24 * HOUR;

/** Why this village could not exist at its Keep, or null when it passes. */
export function importProblem(s: VillageState, now: number, data: GameData): string | null {
  const keep = hallLevel(s, data);
  const base = normalizeBase(villageToBase(s, now, data), data);
  if ('error' in base) return `Buildings: ${base.error}.`;
  const cap = capacity(s, data);
  for (const k of ['acorns', 'dew', 'nightsap'] as const) if ((s.resources[k] ?? 0) > (cap[k] ?? 0)) return `More ${k} than the storages hold.`;
  if ((s.resources.moonstones ?? 0) > IMPORT_MAX_JADE) return 'More Jade than a village can have earned.';
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
  const timers = [...s.buildings.map((b) => b.upgrade?.endsAt ?? 0), ...s.training.map((t) => t.endsAt), ...s.research.active.map((r) => r.endsAt)];
  if (timers.some((t) => t > now + IMPORT_MAX_TIMER_MS)) return 'A timer that ends impossibly late.';
  return null;
}

/** POST /v1/village/import: the device's village becomes the server's (once). */
export async function importVillage(ctx: ServerContext, me: Player, body: { file?: unknown } | undefined): Promise<VillageResponse> {
  if (await ctx.repo.getVillage(me.id)) throw new ApiError(409, 'conflict', 'Your village is already kept on the server.');
  let state: VillageState;
  try {
    state = deserialize(body?.file, ctx.data);
  } catch (e) {
    throw new ApiError(400, 'bad_request', `That village could not be read: ${(e as Error).message}`);
  }
  const t = ctx.now();
  if (state.flags.sandbox) {
    ctx.log('warn', 'village import refused', { player: me.id, problem: 'sandbox' });
    throw new ApiError(400, 'bad_request', 'This village cannot move to the server: it was played in the testing sandbox (time skips and test purchases).');
  }
  const problem = importProblem(state, t, ctx.data);
  if (problem) {
    ctx.log('warn', 'village import refused', { player: me.id, problem });
    throw new ApiError(400, 'bad_request', `This village cannot move to the server: ${problem}`);
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
    if (!(await tx.createVillage(row))) throw new ApiError(409, 'conflict', 'Your village is already kept on the server.');
    const opening = (Object.entries(state.resources) as [string, number][]).filter(([, v]) => v).map(([k, v]) => ({ playerId: me.id, at: t, resource: k, delta: Math.round(v), balance: Math.round(v), reason: 'import', ref: null }));
    await tx.saveVillage({ ...row, revision: 2 }, 1, opening, []);
    if (held) await tx.addImportHold(held);
  });
  const out = await getVillage(ctx, me);
  return held ? { ...out, importHeld: { jade: held.jade, premium: held.premium, purchases: held.purchases.length } } : out;
}
