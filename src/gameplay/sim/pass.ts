/** Lantern Pass seasons, daily tasks and weekly challenges. */
import { scaleReward, topUpOne } from './economy';
import { createRng, mixSeed, next } from './rng';
import type { Cost, GameData, ResourceKind, Stats, TaskTemplate, VillageState } from './types';

const DAY = 86_400_000;

export function passSeason(t: number, data: GameData): number {
  return Math.floor((t - data.pass.epoch) / (data.pass.seasonDays * DAY));
}

export function passSeasonEndsAt(t: number, data: GameData): number {
  return data.pass.epoch + (passSeason(t, data) + 1) * data.pass.seasonDays * DAY;
}

export function dayIndex(t: number, data: GameData): number {
  return Math.floor((t - data.pass.epoch) / DAY);
}

export function premiumActive(state: VillageState, t: number, data: GameData): boolean {
  return state.pass.premium && state.pass.season === passSeason(t, data);
}

/** Build-time multiplier (premium pass = 20% faster). */
export function buildTimeFactor(state: VillageState, t: number, data: GameData): number {
  return premiumActive(state, t, data) ? 1 - data.pass.premiumBuildSpeedBonus : 1;
}

export function unlockedTier(state: VillageState, data: GameData): number {
  return Math.min(data.pass.tiers.length, Math.floor(state.pass.points / data.pass.pointsPerTier));
}

/** Pass points a player earns in a day by finishing every daily task and an average day's share of the weekly ones. */
export function passPointsPerDay(data: GameData): number {
  return 3 * data.pass.dailyTaskPoints + (data.pass.weeklyCount * data.pass.weeklyChallengePoints) / 7;
}

/**
 * Whether the premium Scroll is on sale now (re-audit: one global season, the same price
 * on day 29). It is not sold in the last `noSaleLastDays` days of a season, when too few
 * tiers are left to earn, unless the player has already unlocked `noSaleUnlessTiers`
 * tiers (premium rewards of unlocked tiers are claimed at once, so they get them).
 */
export function passSaleOpen(now: number, data: GameData, state?: VillageState): { open: boolean; daysLeft: number; reopensAt: number } {
  const end = passSeasonEndsAt(now, data);
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY));
  const window = data.pass.noSaleLastDays ?? 0;
  const enough = state !== undefined && state.pass.season === passSeason(now, data) && unlockedTier(state, data) >= (data.pass.noSaleUnlessTiers ?? Infinity);
  return { open: daysLeft > window || enough, daysLeft, reopensAt: end };
}

export interface PassValue {
  /** Premium tiers the player has unlocked or can still unlock this season at the full daily pace. */
  tiers: number;
  tiersTotal: number;
  daysLeft: number;
  /** Jade on those premium tiers. */
  jade: number;
  /** What the premium tiers' Coins and Provisions (at this Keep) would cost as top-ups. */
  resourceJade: number;
  /** jade + resourceJade: the "≈ N Jade" estimate. The 20% faster building is not included. */
  total: number;
  skins: string[];
  /** Jade the cheapest pack of about the same price gives, for comparison. */
  packJade: number;
}

/**
 * An honest value estimate of buying the premium Scroll now: only the premium tiers this
 * player has unlocked or can still reach before the season ends (all daily tasks and the
 * weekly challenges, `passPointsPerDay`), their Jade, and their Coins and Provisions priced
 * as Keep-scaled top-ups. The Store shows "≈ N Jade value" next to the price.
 */
export function passPremiumValue(state: VillageState, now: number, data: GameData): PassValue {
  const p = data.pass;
  const season = passSeason(now, data);
  const points = state.pass.season === season ? state.pass.points : 0;
  const daysLeft = Math.max(0, (passSeasonEndsAt(now, data) - now) / DAY);
  const reach = Math.min(p.tiers.length, Math.floor((points + daysLeft * passPointsPerDay(data)) / p.pointsPerTier));
  const keep = hallOf(state, data);
  let jade = 0;
  let resourceJade = 0;
  const skins: string[] = [];
  for (const t of p.tiers) {
    if (t.tier > reach) continue;
    const { skin, ...res } = t.premium;
    if (skin) skins.push(skin);
    const scaled = scaleReward(res as Cost, keep, data);
    for (const [k, v] of Object.entries(scaled) as [ResourceKind, number][]) {
      if (!(v > 0)) continue;
      if (k === 'moonstones') jade += v;
      else resourceJade += topUpOne(v, data, keep);
    }
  }
  const pack = [...data.store.packs].sort((a, b) => Math.abs(a.usd - p.usd) - Math.abs(b.usd - p.usd))[0];
  return { tiers: reach, tiersTotal: p.tiers.length, daysLeft: Math.ceil(daysLeft), jade, resourceJade, total: jade + resourceJade, skins, packJade: pack?.moonstones ?? 0 };
}

/**
 * Recent raid results (the last `adaptiveTasks.recentRaids` settled raids in the battle
 * log; Trials, war, bounty and rematch attacks don't count): stars and wins per raid.
 * Null with fewer than `minRecent` raids.
 */
export function recentRaidRates(state: VillageState, data: GameData): { stars: number; wins: number; raids: number } | null {
  const cfg = data.pass.adaptiveTasks;
  if (!cfg) return null;
  const raids = (state.battleLog ?? [])
    .filter((r) => r.kind === 'attack' && !r.war && r.trial === undefined && !r.goalEvent && !r.rematch && r.settlement !== 'pending' && r.settlement !== 'rejected')
    .slice(-cfg.recentRaids);
  if (raids.length < cfg.minRecent) return null;
  const stars = raids.reduce((a, r) => a + r.result.stars, 0) / raids.length;
  const wins = raids.filter((r) => r.result.stars >= 1).length / raids.length;
  return { stars, wins, raids: raids.length };
}

export interface Task {
  id: string;
  text: string;
  stat: TaskTemplate['stat'];
  target: number;
  progress: number;
  claimed: boolean;
  points: number;
  kind: 'daily' | 'weekly';
}

function pickTemplates(list: TaskTemplate[], n: number, seed: number): TaskTemplate[] {
  const rng = createRng(seed);
  const pool = [...list];
  const out: TaskTemplate[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(next(rng) * pool.length), 1)[0]);
  return out;
}

const DAY_SECONDS = 86_400;

function hallOf(state: VillageState, data: GameData): number {
  return Math.max(1, state.buildings.find((b) => data.buildings[b.type]?.category === 'hall')?.level ?? 1);
}

/**
 * Whether a task can still be done in its period with what the village has:
 * enough obstacles left to clear, enough buildings with an upgrade that fits
 * in the period (walls don't count: they finish instantly and would make the
 * task a chore), enough research that fits. Raids, stars, collecting and the
 * endless Shadow Trials are always possible.
 */
export function taskEligible(tpl: TaskTemplate, target: number, state: VillageState, data: GameData, periodDays: number): boolean {
  const hall = hallOf(state, data);
  const limits = data.hall.levels[Math.min(data.hall.levels.length, hall) - 1]?.limits ?? {};
  const period = periodDays * DAY_SECONDS;
  switch (tpl.stat) {
    case 'obstaclesCleared':
      return state.buildings.filter((b) => data.buildings[b.type]?.category === 'obstacle').length >= target;
    case 'upgradesDone': {
      let n = 0;
      for (const b of state.buildings) {
        const def = data.buildings[b.type];
        if (!def || ['obstacle', 'decor', 'hedge'].includes(def.category)) continue;
        const max = def.category === 'hall' ? Math.min(data.hall.levels.length, def.levels.length) : limits[b.type]?.maxLevel ?? 0;
        const nextLevel = def.levels[b.level];
        if (b.level < max && nextLevel && nextLevel.buildSeconds <= period) n++;
      }
      return n >= target;
    }
    case 'researchDone': {
      const lanes = data.hall.levels[Math.min(data.hall.levels.length, hall) - 1]?.researchLanes ?? 1;
      const cap = data.hall.levels[Math.min(data.hall.levels.length, hall) - 1]?.troopLevelCap ?? 1;
      const times: number[] = [];
      for (const [t, def] of Object.entries(data.troops)) {
        if ((def.unlockKeep ?? 1) > hall) continue;
        const lvl = Math.max(1, state.research?.levels[t] ?? 1);
        const next = def.levels[lvl];
        if (!next?.research || lvl + 1 > cap - (def.levelCapOffset ?? 0)) continue;
        times.push(next.research.seconds);
      }
      if (times.length < target) return false;
      times.sort((a, b) => a - b);
      // The quickest `target` researches, run `lanes` at a time, must fit in the period.
      let total = 0;
      for (let i = 0; i < target; i++) total += times[i];
      return total / lanes <= period;
    }
    case 'troopsTrained':
      return state.buildings.some((b) => b.level >= 1 && (data.buildings[b.type]?.levels[b.level - 1]?.housing ?? 0) > 0);
    default:
      return true;
  }
}

function fixedTarget(tpl: TaskTemplate, hall: number): number {
  return tpl.base + tpl.perHall * (hall - 1);
}

/**
 * A task's target for this village as a period begins. Star and win tasks (`adaptive`)
 * follow the recent star or win rate: the stars (wins) `adaptive` raids would bring at
 * that rate, between 1 and the template's own target. Null when even that is out of reach
 * (expected under `minExpected`): the task is then not offered (re-audit: "Earn 3 stars"
 * needed ~100 raids at Keep 12 for a casual player).
 */
export function taskTarget(tpl: TaskTemplate, state: VillageState, data: GameData): number | null {
  const base = fixedTarget(tpl, hallOf(state, data));
  if (!tpl.adaptive || (tpl.stat !== 'starsEarned' && tpl.stat !== 'raidsWon')) return base;
  const rates = recentRaidRates(state, data);
  if (!rates) return base;
  const expected = tpl.adaptive * (tpl.stat === 'starsEarned' ? rates.stars : rates.wins);
  if (expected < (data.pass.adaptiveTasks?.minExpected ?? 1)) return null;
  return Math.max(1, Math.min(base, Math.floor(expected)));
}

function targetFor(tpl: TaskTemplate, hall: number, state?: VillageState, data?: GameData, fixed?: Record<string, number>): number {
  if (fixed?.[tpl.id] !== undefined) return fixed[tpl.id];
  if (state && data) return taskTarget(tpl, state, data) ?? fixedTarget(tpl, hall);
  return fixedTarget(tpl, hall);
}

/** The tasks for a period, chosen from the ones the village can still do. */
function chooseTasks(list: TaskTemplate[], n: number, seed: number, state: VillageState, data: GameData, periodDays: number): string[] {
  const ok = list.filter((tpl) => {
    const target = taskTarget(tpl, state, data);
    return target !== null && taskEligible(tpl, target, state, data, periodDays);
  });
  return pickTemplates(ok.length >= n ? ok : list, n, seed).map((t) => t.id);
}

/** The targets of chosen tasks, fixed when their period begins (adaptive ones would otherwise move mid-day). */
function chooseTargets(list: TaskTemplate[], ids: string[], state: VillageState, data: GameData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const tpl = list.find((t) => t.id === id);
    if (tpl) out[id] = taskTarget(tpl, state, data) ?? fixedTarget(tpl, hallOf(state, data));
  }
  return out;
}

function progressOf(stats: Stats, baseline: Stats, stat: TaskTemplate['stat']): number {
  return Math.max(0, (stats[stat] ?? 0) - (baseline[stat] ?? 0));
}

/** Today's 3 daily tasks and this week's challenges, with progress. */
export function currentTasks(state: VillageState, hall: number, data: GameData): Task[] {
  const t = state.tasks;
  const scale = (tpl: TaskTemplate, fixed?: Record<string, number>) => targetFor(tpl, hall, undefined, undefined, fixed);
  const label = (tpl: TaskTemplate, n: number) => tpl.text.replace('{n}', n.toLocaleString('en-US'));
  // The ids fixed when the period began (so tasks never change mid-day); older saves pick now.
  const byIds = (list: TaskTemplate[], ids: string[] | undefined, n: number, seed: number, days: number) =>
    (ids?.length ? ids : chooseTasks(list, n, seed, state, data, days)).map((id) => list.find((x) => x.id === id)).filter((x): x is TaskTemplate => Boolean(x));
  const daily = byIds(data.pass.dailyTasks, t.dayIds, 3, mixSeed(state.seed, t.day * 2 + 1), 1).map((tpl): Task => {
    const target = scale(tpl, t.dayTargets);
    return { id: tpl.id, text: label(tpl, target), stat: tpl.stat, target, progress: Math.min(target, progressOf(state.stats, t.dayBaseline, tpl.stat)), claimed: t.dayClaimed.includes(tpl.id), points: data.pass.dailyTaskPoints, kind: 'daily' };
  });
  const weekly = byIds(data.pass.weeklyChallenges, t.weekIds, data.pass.weeklyCount, mixSeed(state.seed, t.week * 2 + 2), 7).map((tpl): Task => {
    const target = scale(tpl, t.weekTargets);
    return { id: tpl.id, text: label(tpl, target), stat: tpl.stat, target, progress: Math.min(target, progressOf(state.stats, t.weekBaseline, tpl.stat)), claimed: t.weekClaimed.includes(tpl.id), points: data.pass.weeklyChallengePoints, kind: 'weekly' };
  });
  return [...daily, ...weekly];
}

/**
 * Start a new day/week/season when the clock passes one. Only ever moves
 * forward, so `advance` can call it at each finished timer's own time. Mutates.
 */
export function rollPeriods(state: VillageState, now: number, data: GameData): void {
  const day = dayIndex(now, data);
  const week = Math.floor(day / 7);
  if (day > state.tasks.day || !state.tasks.dayIds?.length) {
    if (day > state.tasks.day) {
      state.tasks.day = day;
      state.tasks.dayBaseline = { ...state.stats };
      state.tasks.dayClaimed = [];
    }
    // Chosen once, from what the village can do as the day begins.
    state.tasks.dayIds = chooseTasks(data.pass.dailyTasks, 3, mixSeed(state.seed, state.tasks.day * 2 + 1), state, data, 1);
    state.tasks.dayTargets = chooseTargets(data.pass.dailyTasks, state.tasks.dayIds, state, data);
  }
  if (week > state.tasks.week || !state.tasks.weekIds?.length) {
    if (week > state.tasks.week) {
      state.tasks.week = week;
      state.tasks.weekBaseline = { ...state.stats };
      state.tasks.weekClaimed = [];
    }
    state.tasks.weekIds = chooseTasks(data.pass.weeklyChallenges, data.pass.weeklyCount, mixSeed(state.seed, state.tasks.week * 2 + 2), state, data, 7);
    state.tasks.weekTargets = chooseTargets(data.pass.weeklyChallenges, state.tasks.weekIds, state, data);
  }
  const season = passSeason(now, data);
  if (season > state.pass.season) state.pass = { season, points: 0, premium: false, claimedFree: [], claimedPremium: [] };
}
