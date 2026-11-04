/** Lantern Pass seasons, daily tasks and weekly challenges. */
import { createRng, mixSeed, next } from './rng';
import type { GameData, Stats, TaskTemplate, VillageState } from './types';

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

function targetFor(tpl: TaskTemplate, hall: number): number {
  return tpl.base + tpl.perHall * (hall - 1);
}

/** The tasks for a period, chosen from the ones the village can still do. */
function chooseTasks(list: TaskTemplate[], n: number, seed: number, state: VillageState, data: GameData, periodDays: number): string[] {
  const hall = hallOf(state, data);
  const ok = list.filter((tpl) => taskEligible(tpl, targetFor(tpl, hall), state, data, periodDays));
  return pickTemplates(ok.length >= n ? ok : list, n, seed).map((t) => t.id);
}

function progressOf(stats: Stats, baseline: Stats, stat: TaskTemplate['stat']): number {
  return Math.max(0, (stats[stat] ?? 0) - (baseline[stat] ?? 0));
}

/** Today's 3 daily tasks and this week's challenges, with progress. */
export function currentTasks(state: VillageState, hall: number, data: GameData): Task[] {
  const t = state.tasks;
  const scale = (tpl: TaskTemplate) => targetFor(tpl, hall);
  const label = (tpl: TaskTemplate, n: number) => tpl.text.replace('{n}', n.toLocaleString('en-US'));
  // The ids fixed when the period began (so tasks never change mid-day); older saves pick now.
  const byIds = (list: TaskTemplate[], ids: string[] | undefined, n: number, seed: number, days: number) =>
    (ids?.length ? ids : chooseTasks(list, n, seed, state, data, days)).map((id) => list.find((x) => x.id === id)).filter((x): x is TaskTemplate => Boolean(x));
  const daily = byIds(data.pass.dailyTasks, t.dayIds, 3, mixSeed(state.seed, t.day * 2 + 1), 1).map((tpl): Task => {
    const target = scale(tpl);
    return { id: tpl.id, text: label(tpl, target), stat: tpl.stat, target, progress: Math.min(target, progressOf(state.stats, t.dayBaseline, tpl.stat)), claimed: t.dayClaimed.includes(tpl.id), points: data.pass.dailyTaskPoints, kind: 'daily' };
  });
  const weekly = byIds(data.pass.weeklyChallenges, t.weekIds, data.pass.weeklyCount, mixSeed(state.seed, t.week * 2 + 2), 7).map((tpl): Task => {
    const target = scale(tpl);
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
  }
  if (week > state.tasks.week || !state.tasks.weekIds?.length) {
    if (week > state.tasks.week) {
      state.tasks.week = week;
      state.tasks.weekBaseline = { ...state.stats };
      state.tasks.weekClaimed = [];
    }
    state.tasks.weekIds = chooseTasks(data.pass.weeklyChallenges, data.pass.weeklyCount, mixSeed(state.seed, state.tasks.week * 2 + 2), state, data, 7);
  }
  const season = passSeason(now, data);
  if (season > state.pass.season) state.pass = { season, points: 0, premium: false, claimedFree: [], claimedPremium: [] };
}
