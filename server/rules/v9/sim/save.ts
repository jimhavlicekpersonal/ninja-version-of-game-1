import { buildingDef, levelDef, maxDefinedLevel } from './data';
import { footprint } from './grid';
import type { GameData, VillageState } from './types';
import { RESOURCE_KINDS, STAT_KEYS } from './types';
import { mixSeed } from './rng';
import { scatterObstacles } from './obstacles';
import { normalizeTemper, validTemper } from './battle/temper';
import { emptyGrove } from './social/grove';
import { seasonOf } from './ranks';
import { emptyStats } from './types';
import { emptyResearch } from './research';
import { emptyNet } from './net';
import { emptyDaily } from './daily';
import type { GameData as GD } from './types';

export const SAVE_VERSION = 24;
const EXPORT_PREFIX = 'TK1';

// Values the save migrations fill in (quality Q20). They describe what each old format meant and never change.
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
/** 2^32: a 64-bit creation time split into the two 32-bit halves of the village seed (v1 -> v2). */
const UINT32_RANGE = 4294967296;
/** The new-player shield a village from before honor (v2 -> v3) starts with, in hours. */
const FIRST_SHIELD_HOURS = 24;
/** A tutorial step past the last one: villages from before the tutorial (v5 -> v6) count as done. */
const TUTORIAL_DONE_STEP = 99;
/** Jade every stipend payment bought before v18 was sold with. */
const LEGACY_STIPEND_JADE = 20;

export interface SaveFile {
  version: number;
  savedAt: number;
  village: VillageState;
}

/** The save was written by a newer build than this one. It is fine; this build just can't read it, so it must not be replaced. */
export class NewerSaveError extends Error {
  constructor() {
    super('This save is from a newer version of the game. Update the game first.');
    this.name = 'NewerSaveError';
  }
}

export function serialize(state: VillageState, now: number): SaveFile {
  return { version: SAVE_VERSION, savedAt: now, village: { ...structuredClone(state), lastSeenAt: now } };
}

/** Upgrade an older save file to the current format. Add a step here whenever SAVE_VERSION goes up. */
export function migrate(raw: unknown, data?: GD): SaveFile {
  if (!raw || typeof raw !== 'object') throw new Error('Save data is not an object');
  const file = raw as Partial<SaveFile>;
  if (typeof file.version !== 'number') throw new Error('Save data has no version');
  if (file.version > SAVE_VERSION) throw new NewerSaveError();
  const out = structuredClone(file) as SaveFile;
  const v = out.village as unknown as Record<string, unknown>;
  if (out.version < 2 && v && typeof v === 'object') {
    // v1 -> v2: army, training queue, battle log, seeds.
    v.army = v.army ?? {};
    v.training = v.training ?? [];
    v.battleLog = v.battleLog ?? [];
    const created = Number(v.createdAt) || 0;
    v.seed = v.seed ?? mixSeed(created >>> 0, Math.floor(created / UINT32_RANGE));
    v.nextSeed = v.nextSeed ?? 1;
  }
  if (out.version < 3 && v && typeof v === 'object') {
    // v2 -> v3: leaf rank, shields, defense log, seasons.
    const last = Number(v.lastSeenAt) || 0;
    v.trophies = v.trophies ?? 0;
    v.shieldUntil = v.shieldUntil ?? last + FIRST_SHIELD_HOURS * HOUR_MS;
    v.defenseLog = v.defenseLog ?? [];
    v.season = v.season ?? seasonOf(last);
    v.raidCheckAt = v.raidCheckAt ?? last;
  }
  if (out.version < 4 && v && typeof v === 'object') {
    // v3 -> v4: economy, pass, tasks, cosmetics, achievements, obstacles.
    const last = Number(v.lastSeenAt) || 0;
    v.stats = v.stats ?? emptyStats();
    v.purchases = v.purchases ?? [];
    v.profile = v.profile ?? { under18: null };
    v.offers = v.offers ?? { active: [], lastShown: {}, bought: [] };
    const day = data ? Math.floor((last - data.pass.epoch) / DAY_MS) : 0;
    v.pass = v.pass ?? { season: data ? Math.floor(day / data.pass.seasonDays) : 0, points: 0, premium: false, claimedFree: [], claimedPremium: [] };
    v.tasks = v.tasks ?? { day, dayBaseline: emptyStats(), dayClaimed: [], week: Math.floor(day / DAYS_PER_WEEK), weekBaseline: emptyStats(), weekClaimed: [] };
    v.cosmetics = v.cosmetics ?? { owned: ['classic'], hallSkin: 'classic' };
    v.achievements = v.achievements ?? {};
    v.flags = v.flags ?? { longWaitSeen: false };
    if (data) scatterObstacles(v as unknown as VillageState, data);
  }
  if (out.version < 5 && v && typeof v === 'object') {
    // v4 -> v5: Grove.
    v.grove = v.grove ?? emptyGrove();
  }
  if (out.version < 6 && v && typeof v === 'object') {
    // v5 -> v6: tutorial (existing players have already found their way around).
    v.tutorial = v.tutorial ?? { step: TUTORIAL_DONE_STEP, done: true };
  }
  if (out.version < 7 && v && typeof v === 'object') {
    // v6 -> v7: troop research, the kept scout opponent, and a counter of
    // finished upgrades (tasks now count finished work, not started work).
    v.research = v.research ?? emptyResearch();
    v.scout = v.scout ?? null;
    const tasks = v.tasks as { dayBaseline?: Record<string, number>; weekBaseline?: Record<string, number> } | undefined;
    for (const st of [v.stats, tasks?.dayBaseline, tasks?.weekBaseline] as (Record<string, number> | undefined)[]) {
      if (st && typeof st === 'object' && st.upgradesDone === undefined) st.upgradesDone = Number(st.upgradesStarted) || 0;
    }
    // Troop and defense numbers changed, so old replays would not play back
    // the same way any more: drop them rather than show wrong replays.
    v.battleLog = [];
    v.defenseLog = [];
  }
  if (out.version < 8 && v && typeof v === 'object') {
    // v7 -> v8: free daily chest and visit streak.
    v.daily = v.daily ?? (data ? emptyDaily(data) : { lastDay: -1, step: 0, skipsLeft: 1, skipWeek: -1, history: [] });
  }
  if (out.version < 9 && v && typeof v === 'object') {
    // v8 -> v9: online bookkeeping (real raids, donations and Grove Raid chests from a server).
    v.net = v.net ?? emptyNet();
    v.daily = v.daily ?? (data ? emptyDaily(data) : { lastDay: -1, step: 0, skipsLeft: 1, skipWeek: -1, history: [] });
  }
  if (out.version < 10 && v && typeof v === 'object') {
    // v9 -> v10 (ninja rebuild): Shadow Trials progress. Nothing else changed:
    // internal ids stayed the same, and old replays still play back exactly.
    v.trials = v.trials ?? { best: 0 };
    v.pendingBattle = v.pendingBattle ?? null;
  }
  if (out.version < 11 && v && typeof v === 'object') {
    // v10 -> v11: all 50 troop ids and Keep levels 7–15 are valid. Existing
    // inventory, research, queues, trials and six-unit replays remain intact.
    // New per-warrior battle effects are reconstructed from deployments.
    v.research = v.research ?? emptyResearch();
  }
  if (out.version < 12 && v && typeof v === 'object') {
    // v11 -> v12 (gameplay audit fixes):
    // - Lodge troops keep the level they were donated at. Troops already in the
    //   Lodge keep fighting at the level they would have used (your research).
    // - Settled league seasons are logged (they now settle while the game is open).
    // - Army presets for one-tap retraining.
    // - Battle records carry the rules version they were fought under; records
    //   from before have none, so their replays are marked unavailable instead of
    //   playing back a different fight. Their results stay in the log.
    const grove = v.grove as { reinforcements?: Record<string, number>; reinforcementLevels?: Record<string, number> } | undefined;
    const research = v.research as { levels?: Record<string, number> } | undefined;
    if (grove && typeof grove === 'object') {
      const levels: Record<string, number> = {};
      for (const [t, n] of Object.entries(grove.reinforcements ?? {})) if (n > 0) levels[t] = Math.max(1, research?.levels?.[t] ?? 1);
      grove.reinforcementLevels = grove.reinforcementLevels ?? levels;
    }
    v.seasonLog = v.seasonLog ?? [];
    v.armyPresets = v.armyPresets ?? [];
    // Research lanes: the single running research becomes the first lane.
    const r = v.research as { active?: unknown } | undefined;
    if (r && typeof r === 'object' && !Array.isArray(r.active)) r.active = r.active ? [r.active] : [];
    // New task counters start at zero (in the lifetime stats and both task baselines).
    const tasks = v.tasks as { dayBaseline?: Record<string, number>; weekBaseline?: Record<string, number> } | undefined;
    for (const st of [v.stats, tasks?.dayBaseline, tasks?.weekBaseline] as (Record<string, number> | undefined)[]) {
      if (st && typeof st === 'object') for (const k of ['researchDone', 'trialsCleared']) st[k] = st[k] ?? 0;
    }
  }
  if (out.version < 13 && v && typeof v === 'object') {
    // v12 -> v13: Gang War chests collected (roadmap step 65) start empty.
    const net = v.net as { gangWars?: string[] } | undefined;
    if (net && typeof net === 'object') net.gangWars = net.gangWars ?? [];
  }
  if (out.version < 14 && v && typeof v === 'object') {
    // v13 -> v14 (worldwide audit GLOBAL-002): `flags.sandbox` marks a village made in the testing
    // sandbox (time skips, a free test store). Older villages were not made there (the sandbox
    // never went online), so they start unmarked.
    const flags = v.flags as { sandbox?: boolean } | undefined;
    if (flags && typeof flags === 'object' && flags.sandbox !== true) delete flags.sandbox;
  }
  if (out.version < 15 && v && typeof v === 'object') {
    // v14 -> v15 (re-audit: minors online): `profile.ageBand` (sim/age.ts). "18 or older" becomes
    // adult; "under 18" stays unknown, so the age screen asks again (it can never answer adult).
    const profile = v.profile as { under18?: boolean | null; ageBand?: string | null } | undefined;
    if (profile && typeof profile === 'object' && profile.ageBand === undefined) profile.ageBand = profile.under18 === false ? 'adult' : null;
  }
  if (out.version < 16 && v && typeof v === 'object') {
    // v15 -> v16 (design re-audit): Clan Stipend payments, goal event progress, new counters
    // (raids faced and held, rematches won, raid destruction) in the lifetime stats and both task
    // baselines. Raids faced starts at the defenses still in the log, so a village that has not
    // been raided yet still gets the gentler first raids (raids.newPlayerRaids).
    v.stipend = v.stipend ?? { left: 0, lastDay: -1 };
    v.goalEvent = v.goalEvent ?? null; // v24 turns it into `goalEvents`
    const log = Array.isArray(v.defenseLog) ? (v.defenseLog as { result?: { stars?: number } }[]) : [];
    const tasks = v.tasks as { dayBaseline?: Record<string, number>; weekBaseline?: Record<string, number> } | undefined;
    const stats = v.stats as Record<string, number> | undefined;
    if (stats && typeof stats === 'object') {
      stats.defensesFaced = stats.defensesFaced ?? log.length;
      stats.defensesWon = stats.defensesWon ?? log.filter((d) => (d?.result?.stars ?? 1) === 0).length;
    }
    for (const st of [stats, tasks?.dayBaseline, tasks?.weekBaseline] as (Record<string, number> | undefined)[]) {
      if (!st || typeof st !== 'object') continue;
      for (const k of ['defensesFaced', 'defensesWon', 'rematchesWon', 'raidDestruction']) st[k] = st[k] ?? (st === stats ? 0 : stats?.[k] ?? 0);
    }
  }
  // v16 -> v17 (ledger audit A5): no field changes. A refund now takes back every resource it gave,
  // so any balance may be negative (a debt paid from income). The version moves so that an older
  // build stops at a newer save (NewerSaveError) instead of calling such a village damaged.
  if (out.version < 18 && v && typeof v === 'object') {
    // v17 -> v18 (report section 5 step 6): a stipend keeps the Jade it was sold with (`stipend.jade`):
    // every stipend bought before paid 20 Jade a payment. Daily chests note the streak's own Jade
    // (`history[].streakJade`), now paid once a week; older entries have none, so the next top-step
    // chest pays it.
    const st = v.stipend as { left?: number; jade?: number } | undefined;
    if (st && typeof st === 'object' && st.jade === undefined) st.jade = Math.max(0, Number(st.left) || 0) * LEGACY_STIPEND_JADE;
  }
  if (out.version < 19 && v && typeof v === 'object') {
    // v18 -> v19 (report section 5 step 8): the 28-day calendar, and the device's UTC offset for local task days
    // (none yet: task days keep UTC until the game sends the offset).
    v.calendar = v.calendar ?? { claimed: 0, lastDay: -1, cycles: 0 };
  }
  if (out.version < 20 && v && typeof v === 'object') {
    // v19 -> v20 (remnant audit 2026-11-06): purchases may carry `stipend` (what a Clan Stipend added),
    // `premium` (what a Season Scroll's premium claims gave) and `refund` (what a refund took); older
    // ones have none and fall back to the catalog. A stipend with no payments left owes nothing: a refund
    // used to leave its Jade here, and the next stipend paid it out on top of its own.
    const st = v.stipend as { left?: number; jade?: number } | undefined;
    if (st && typeof st === 'object' && !(Number(st.left) > 0) && Number(st.jade) > 0) st.jade = 0;
  }
  if (out.version < 21 && v && typeof v === 'object') {
    // v20 -> v21 (balance audit 2026-11-08): buildings may carry `temper` (Tempering) and attack records
    // `stake` (declared stakes). Older saves have neither: untempered, unstaked. Nothing to convert.
  }
  if (out.version < 22 && v && typeof v === 'object') {
    // v21 -> v22 (game-theory batch 2026-11-13): timers may carry `topUp` (the share a Jade top-up bought, CU-3),
    // the village `armyPaid` (what ready warriors cost, CU-7), `daily.salt` (E18) and `pass.tierKeep` (CU-6).
    // Older timers and warriors have no record and refund as before. Tiers already unlocked this season are
    // recorded at today's Keep, so waiting for a Keep upgrade no longer raises them from here on.
    const pass = v.pass as { points?: number; tierKeep?: number[] } | undefined;
    if (data && pass && typeof pass === 'object' && !Array.isArray(pass.tierKeep) && Array.isArray(v.buildings)) {
      const hall = (v.buildings as { type: string; level: number }[]).find((b) => data.buildings[b?.type]?.category === 'hall');
      const tiers = Math.min(data.pass.tiers.length, Math.floor((Number(pass.points) || 0) / data.pass.pointsPerTier));
      if (hall && Number.isInteger(hall.level) && hall.level >= 1 && tiers > 0) pass.tierKeep = Array.from({ length: tiers }, () => hall.level);
    }
  }
  if (out.version < 23 && v && typeof v === 'object') {
    // v22 -> v23 (content batch 2026-11-14): Warrior Mastery EXP and the Hero Hall's chosen hero. Both start
    // empty; the features that fill them are off in the shipped data, so nothing else changes.
    if (!v.mastery || typeof v.mastery !== 'object' || Array.isArray(v.mastery)) v.mastery = {};
    if (!v.hero || typeof v.hero !== 'object' || Array.isArray(v.hero)) v.hero = {};
  }
  if (out.version < 24 && v && typeof v === 'object') {
    // v23 -> v24 (the 2026-11-16 replayability pass, docs/audit/understand-2026-11-16/PROGRESS.md): the counter
    // of timed upgrades (P1-08), the Scroll rollover's record (`pass.lastSeason`, P1-01, written when a season
    // ends) and the time the Keep reached its level (`keepReachedAt`, P1-21, written at the next Keep upgrade); the
    // daily drill's last paid day (`drill`, P3-07, written by the first drill) and its stat (`drillsDone`, by repairStats).
    // Timed upgrades start at the finished upgrades already counted, so a running weekly task is not reset.
    const stats = v.stats as Record<string, number> | undefined;
    if (stats && typeof stats === 'object' && stats.timedUpgradesDone === undefined) stats.timedUpgradesDone = stats.upgradesDone ?? 0;
  }
  // P5-01: goal progress per occurrence (the one slot, reset on every key change, let two overlapping goal events pay
  // a ladder again on each switch). On every load (review M4: saves of this branch were already v24 before the list
  // existed): the stored occurrence carries over with its claimed steps.
  if (v && typeof v === 'object') {
    if (!Array.isArray(v.goalEvents)) v.goalEvents = v.goalEvent && typeof v.goalEvent === 'object' ? [v.goalEvent] : [];
    delete v.goalEvent;
  }
  repairStats(v);
  repairTrainingQueue(v);
  if (data) repairTempers(v, data);
  if (data) repairFields(v, data);
  out.version = SAVE_VERSION;
  return out;
}

/**
 * Every counter in `STAT_KEYS`, in the lifetime stats and both task baselines, on every load (save v24). A counter
 * added later in the pass needs no new save step: a missing one starts at 0, and a missing baseline at the
 * lifetime value (so a running task does not count what happened before the counter existed). Mutates.
 */
function repairStats(v: Record<string, unknown>): void {
  const stats = v.stats as Record<string, number> | undefined;
  if (!stats || typeof stats !== 'object') return;
  const tasks = v.tasks as { dayBaseline?: Record<string, number>; weekBaseline?: Record<string, number> } | undefined;
  for (const k of STAT_KEYS) {
    if (!Number.isFinite(stats[k])) stats[k] = 0;
    for (const b of [tasks?.dayBaseline, tasks?.weekBaseline]) if (b && typeof b === 'object' && !Number.isFinite(b[k])) b[k] = stats[k];
  }
}

/**
 * A timer that ends before it began fails `validateVillage`, and a failed load
 * replaces the village. "Finish training" with more queued than the camps hold
 * used to write exactly that. Those warriors did finish, so they stay in the queue
 * as finished, waiting for room. Runs on every load (the format did not change):
 * one bad timer must never cost a player their village.
 */
function repairTrainingQueue(v: Record<string, unknown> | undefined): void {
  if (!v || !Array.isArray(v.training)) return;
  for (const q of v.training as { startedAt: number; endsAt: number }[]) {
    if (q && q.endsAt < q.startedAt) q.startedAt = q.endsAt;
  }
}

/**
 * Tempering (v21): a temper the rules do not allow (an edited save, or a type that stopped being temperable)
 * is dropped, never a reason to refuse the village. Runs on every load.
 */
/**
 * Beast Mode SAV-03: one bad field no longer replaces a whole village. At load, a resource that is not a finite
 * number reads 0, a building of a type this build does not know (a removed or renamed one) is dropped, a level
 * above the highest this build defines is lowered to it (a data change that lowered a cap), and an army entry for
 * an unknown warrior or with a bad count is dropped. Structural damage (no Keep, no buildings list) still fails
 * `validateVillage`. Load-time only: nothing about the save format changes. Each repair is logged once.
 */
function repairFields(v: Record<string, unknown> | undefined, data: GameData): void {
  if (!v || typeof v !== 'object') return;
  const fixed: string[] = [];
  const res = v.resources as Record<string, unknown> | undefined;
  if (res && typeof res === 'object') {
    for (const k of RESOURCE_KINDS) {
      if (!Number.isFinite(res[k])) {
        res[k] = 0;
        fixed.push(`resource ${k}`);
      }
    }
  }
  if (Array.isArray(v.buildings)) {
    const kept = (v.buildings as { type?: string; level?: number; upgrade?: { toLevel?: number } }[]).filter((b) => {
      if (b && typeof b.type === 'string' && data.buildings[b.type]) return true;
      fixed.push(`unknown building ${String(b?.type)}`);
      return false;
    });
    for (const b of kept) {
      const max = maxDefinedLevel(data, b.type!);
      if (Number.isInteger(b.level) && b.level! > max) {
        b.level = max;
        delete b.upgrade;
        fixed.push(`level of ${b.type}`);
      } else if (b.upgrade && Number.isInteger(b.level) && b.level! >= 1 && Number.isInteger(b.upgrade.toLevel) && b.upgrade.toLevel! > max) {
        // F7 (2026-11-24): an upgrade to a level this build does not define (a lowered cap): the building keeps
        // its level and the impossible timer goes (`null`, as a finished upgrade leaves it).
        (b as { upgrade?: unknown }).upgrade = null;
        fixed.push(`upgrade of ${b.type}`);
      }
    }
    if (kept.length !== v.buildings.length) v.buildings = kept;
  }
  const army = v.army as Record<string, unknown> | undefined;
  if (army && typeof army === 'object') {
    for (const [t, n] of Object.entries(army)) {
      if (!data.troops[t] || !Number.isInteger(n) || (n as number) < 0) {
        delete army[t];
        fixed.push(`army ${t}`);
      }
    }
  }
  // F7 (2026-11-24): warriors this build does not know (a removed or renamed one) are dropped from training, the
  // Lodge, army presets and research, and a research level above a warrior's defined levels is lowered to the top
  // one. Everything else in those lists is kept as it was.
  const known = (t: unknown): t is string => typeof t === 'string' && Object.hasOwn(data.troops, t);
  if (Array.isArray(v.training)) {
    const kept = (v.training as { troop?: unknown }[]).filter((q) => !q || typeof q !== 'object' || known(q.troop));
    if (kept.length !== v.training.length) {
      fixed.push(`training of unknown warriors (${v.training.length - kept.length})`);
      v.training = kept;
    }
  }
  if (Array.isArray(v.armyPresets)) {
    for (const p of v.armyPresets as { army?: Record<string, unknown> }[]) {
      if (!p || !p.army || typeof p.army !== 'object') continue;
      for (const [t, n] of Object.entries(p.army)) {
        if (!known(t) || !Number.isInteger(n) || (n as number) < 0) {
          delete p.army[t];
          fixed.push(`preset ${t}`);
        }
      }
    }
  }
  const research = v.research as { levels?: Record<string, unknown>; active?: { troop?: unknown }[] } | undefined;
  if (research && typeof research === 'object') {
    if (research.levels && typeof research.levels === 'object') {
      for (const [t, n] of Object.entries(research.levels)) {
        if (!known(t)) {
          delete research.levels[t];
          fixed.push(`research ${t}`);
        } else if (Number.isInteger(n) && (n as number) > data.troops[t].levels.length) {
          research.levels[t] = data.troops[t].levels.length;
          fixed.push(`research level ${t}`);
        }
      }
    }
    if (Array.isArray(research.active)) {
      const kept = research.active.filter((a) => !a || typeof a !== 'object' || known(a.troop));
      if (kept.length !== research.active.length) {
        fixed.push('research timer of an unknown warrior');
        research.active = kept;
      }
    }
  }
  const grove = v.grove as { reinforcements?: Record<string, unknown>; reinforcementLevels?: Record<string, unknown> } | undefined;
  if (grove && typeof grove === 'object') {
    for (const field of ['reinforcements', 'reinforcementLevels'] as const) {
      const lodge = grove[field];
      if (!lodge || typeof lodge !== 'object') continue;
      for (const t of Object.keys(lodge)) {
        if (!known(t)) {
          delete lodge[t];
          fixed.push(`lodge ${t}`);
        }
      }
    }
  }
  if (fixed.length) console.warn(`Save repaired at load: ${fixed.slice(0, 5).join(', ')}${fixed.length > 5 ? ' …' : ''}`);
}

function repairTempers(v: Record<string, unknown> | undefined, data: GameData): void {
  if (!v || !Array.isArray(v.buildings)) return;
  for (const b of v.buildings as { type: string; temper?: unknown }[]) {
    if (!b || b.temper === undefined) continue;
    const t = validTemper(b.type, b.temper, data) ? normalizeTemper(b.temper) : null;
    if (t) b.temper = t;
    else delete b.temper;
  }
}

/** Overlapping buildings named in a damaged save's report (the rest are counted, not listed). */
const OVERLAPS_REPORTED = 20;

export function validateVillage(v: VillageState, data: GameData): string[] {
  const problems: string[] = [];
  if (!v || typeof v !== 'object') return ['village missing'];
  if (!Number.isFinite(v.createdAt) || !Number.isFinite(v.lastSeenAt)) problems.push('bad timestamps');
  // Jade may be negative: a refunded purchase whose Jade was already spent (a debt, re-audit).
  // Save v17 (ledger audit A5): a refunded purchase leaves a debt (a negative balance) in any resource.
  // (The `else` once hung on the trials check, so a village without resources threw instead of failing.)
  if (!v.resources || typeof v.resources !== 'object') problems.push('resources missing');
  else for (const k of RESOURCE_KINDS) if (!Number.isFinite(v.resources[k])) problems.push(`bad ${k}`);
  if (!v.trials || !Number.isInteger(v.trials.best) || v.trials.best < 0) problems.push('bad trials');
  // Save v24 (P5-01): goal progress per occurrence.
  if (!Array.isArray(v.goalEvents) || !v.goalEvents.every((g) => g && typeof g.key === 'string' && Array.isArray(g.claimed) && g.claimed.every((i) => Number.isInteger(i)))) problems.push('bad goalEvents');
  // Save v24 (P5-08): the sealed Keeps.
  if (v.seals !== undefined && (!Array.isArray(v.seals) || !v.seals.every((k) => Number.isInteger(k) && k >= 1))) problems.push('bad seals');
  // Save v24 (P3-07): the daily drill's last paid local day.
  if (v.drill !== undefined && (!v.drill || typeof v.drill !== 'object' || !Number.isInteger(v.drill.day))) problems.push('bad drill');
  if (!Array.isArray(v.buildings)) return [...problems, 'buildings missing'];
  const map = data.economy.mapSize;
  // Review 2026-11-17 (R3-08): every building needs a tile of its own, so no village holds more buildings than
  // the map has tiles. A file that claims more is not checked building by building (that work was the attack).
  if (v.buildings.length > map * map) return [...problems, 'too many buildings'];
  const ids = new Set<string>();
  let halls = 0;
  for (const b of v.buildings) {
    if (!data.buildings[b.type]) {
      problems.push(`unknown building ${b.type}`);
      continue;
    }
    const def = buildingDef(data, b.type);
    if (def.category === 'hall') halls++;
    if (ids.has(b.id)) problems.push(`duplicate id ${b.id}`);
    ids.add(b.id);
    if (!Number.isInteger(b.level) || b.level < 0 || b.level > maxDefinedLevel(data, b.type)) problems.push(`bad level on ${b.id}`);
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.y < 0 || b.x + def.size > map || b.y + def.size > map) {
      problems.push(`${b.id} is off the map`);
    }
    if (b.upgrade) {
      const u = b.upgrade;
      const clearing = def.category === 'obstacle' && u.toLevel === 0;
      if (!clearing && (u.toLevel !== b.level + 1 || !levelDef(data, b.type, u.toLevel))) problems.push(`bad upgrade on ${b.id}`);
      if (!(u.endsAt >= u.startedAt)) problems.push(`bad timer on ${b.id}`);
    } else if (b.level < 1) problems.push(`${b.id} unfinished with no timer`);
    if (Boolean(def.produces) !== Boolean(b.collector)) problems.push(`collector mismatch on ${b.id}`);
  }
  if (halls !== 1) problems.push('village must have exactly one Clan Keep');
  if (!v.army || typeof v.army !== 'object') problems.push('army missing');
  else for (const [t, n] of Object.entries(v.army)) if (!data.troops[t] || !Number.isInteger(n) || n < 0) problems.push(`bad army entry ${t}`);
  if (!Array.isArray(v.training)) problems.push('training missing');
  else for (const q of v.training) if (!data.troops[q.troop] || !(q.endsAt >= q.startedAt)) problems.push('bad training item');
  if (!Array.isArray(v.battleLog)) problems.push('battle log missing');
  if (!Number.isFinite(v.seed) || !Number.isFinite(v.nextSeed)) problems.push('bad seed');
  if (!Number.isFinite(v.trophies) || v.trophies < 0) problems.push('bad trophies');
  if (!Number.isFinite(v.shieldUntil) || !Number.isInteger(v.season) || v.season < 0 || !Number.isFinite(v.raidCheckAt)) problems.push('bad rank fields');
  // XPL-03: the war week is a whole number (a forged one only ever pays the last `settleWeeksMax` wars).
  if (v.grove && v.grove.settledWeek !== undefined && !Number.isInteger(v.grove.settledWeek)) problems.push('bad alliance war week');
  if (!Array.isArray(v.defenseLog)) problems.push('defense log missing');
  if (!v.stats || !v.pass || !v.tasks || !v.cosmetics || !v.offers || !v.profile || !Array.isArray(v.purchases)) problems.push('economy fields missing');
  if (!v.grove || !Array.isArray(v.grove.chat)) problems.push('alliance missing');
  // Counters the settlement loops step from are whole numbers in every save the game writes (exploit audit XPL-03).
  else if (typeof v.grove.settledWeek === 'number' && !Number.isInteger(v.grove.settledWeek)) problems.push('bad alliance war week');
  if (!v.tutorial) problems.push('tutorial missing');
  if (!v.daily || !Number.isFinite(v.daily.lastDay) || !Number.isFinite(v.daily.step) || !Array.isArray(v.daily.history)) problems.push('daily chest missing');
  if (!Array.isArray(v.seasonLog)) problems.push('season log missing');
  if (!Array.isArray(v.armyPresets)) problems.push('army presets missing');
  else for (const p of v.armyPresets) if (!p || typeof p.army !== 'object' || Object.entries(p.army).some(([t, n]) => !data.troops[t] || !Number.isInteger(n) || n < 0)) problems.push('bad army preset');
  if (v.grove && (typeof v.grove.reinforcementLevels !== 'object' || !v.grove.reinforcementLevels)) problems.push('lodge levels missing');
  if (!v.research || typeof v.research.levels !== 'object') problems.push('research missing');
  else {
    for (const [t, n] of Object.entries(v.research.levels)) if (!data.troops[t] || !Number.isInteger(n) || n < 1 || n > data.troops[t].levels.length) problems.push(`bad research level ${t}`);
    if (!Array.isArray(v.research.active)) problems.push('bad research timer');
    else for (const a of v.research.active) if (!data.troops[a.troop] || !(a.endsAt >= a.startedAt)) problems.push('bad research timer');
  }
  // Overlaps, by marking each building's tiles on the map once (it compared every pair of buildings and kept a
  // sentence for each overlapping pair: 3,000 buildings on one tile took 1.4 s and 447 MB, review R3-08). The first
  // overlap of each building is reported, and no more than OVERLAPS_REPORTED in all.
  const owner = new Map<number, string>();
  let overlaps = 0;
  for (const b of v.buildings) {
    if (!data.buildings[b.type]) continue;
    const r = footprint(b, data);
    // Off the map is reported above; its tiles are not marked.
    if (!Number.isInteger(r.x) || !Number.isInteger(r.y) || r.x < 0 || r.y < 0 || r.x + r.w > map || r.y + r.h > map) continue;
    let hit: string | undefined;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const key = y * map + x;
        const other = owner.get(key);
        if (other !== undefined) hit ??= other;
        else owner.set(key, b.id);
      }
    }
    if (hit !== undefined && overlaps++ < OVERLAPS_REPORTED) problems.push(`${hit} overlaps ${b.id}`);
  }
  return problems;
}

export function deserialize(raw: unknown, data: GameData): VillageState {
  const file = migrate(raw, data);
  const problems = validateVillage(file.village, data);
  if (problems.length) throw new Error(`Save data is damaged: ${problems.slice(0, 3).join('; ')}`);
  return structuredClone(file.village);
}

// ---------- Export / import codes (move a village between devices) ----------

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encodeExportCode(file: SaveFile): string {
  // Replays are left out to keep the code short enough to copy and paste.
  const slim: SaveFile = { ...file, village: { ...file.village, battleLog: [], defenseLog: [] } };
  const payload = toBase64Url(JSON.stringify(slim));
  return `${EXPORT_PREFIX}.${payload}.${fnv1a(payload)}`;
}

/** Returns the raw save file inside an export code. Throws if the code is mistyped. */
export function decodeExportCode(code: string): unknown {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== EXPORT_PREFIX) throw new Error("That doesn't look like a Kagemura: Ninja Clans save code.");
  const [, payload, sum] = parts;
  if (fnv1a(payload) !== sum) throw new Error('The save code is incomplete or has a typo.');
  try {
    return JSON.parse(fromBase64Url(payload));
  } catch {
    throw new Error('The save code could not be read.');
  }
}
