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

function progressOf(stats: Stats, baseline: Stats, stat: TaskTemplate['stat']): number {
  return Math.max(0, (stats[stat] ?? 0) - (baseline[stat] ?? 0));
}

/** Today's 3 daily tasks and this week's challenges, with progress. */
export function currentTasks(state: VillageState, hall: number, data: GameData): Task[] {
  const t = state.tasks;
  const scale = (tpl: TaskTemplate) => tpl.base + tpl.perHall * (hall - 1);
  const label = (tpl: TaskTemplate, n: number) => tpl.text.replace('{n}', n.toLocaleString('en-US'));
  const daily = pickTemplates(data.pass.dailyTasks, 3, mixSeed(state.seed, t.day * 2 + 1)).map((tpl): Task => {
    const target = scale(tpl);
    return { id: tpl.id, text: label(tpl, target), stat: tpl.stat, target, progress: Math.min(target, progressOf(state.stats, t.dayBaseline, tpl.stat)), claimed: t.dayClaimed.includes(tpl.id), points: data.pass.dailyTaskPoints, kind: 'daily' };
  });
  const weekly = pickTemplates(data.pass.weeklyChallenges, data.pass.weeklyCount, mixSeed(state.seed, t.week * 2 + 2)).map((tpl): Task => {
    const target = scale(tpl);
    return { id: tpl.id, text: label(tpl, target), stat: tpl.stat, target, progress: Math.min(target, progressOf(state.stats, t.weekBaseline, tpl.stat)), claimed: t.weekClaimed.includes(tpl.id), points: data.pass.weeklyChallengePoints, kind: 'weekly' };
  });
  return [...daily, ...weekly];
}

/** Start a new day/week/season when the clock passes one. Mutates. */
export function rollPeriods(state: VillageState, now: number, data: GameData): void {
  const day = dayIndex(now, data);
  const week = Math.floor(day / 7);
  if (state.tasks.day !== day) {
    state.tasks.day = day;
    state.tasks.dayBaseline = { ...state.stats };
    state.tasks.dayClaimed = [];
  }
  if (state.tasks.week !== week) {
    state.tasks.week = week;
    state.tasks.weekBaseline = { ...state.stats };
    state.tasks.weekClaimed = [];
  }
  const season = passSeason(now, data);
  if (state.pass.season !== season) state.pass = { season, points: 0, premium: false, claimedFree: [], claimedPremium: [] };
}
