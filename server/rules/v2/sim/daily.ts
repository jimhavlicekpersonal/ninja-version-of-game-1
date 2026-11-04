/**
 * The free daily chest and the visit streak.
 *
 * Chest: one per UTC day, free, and never sold (no Moonstone or real-money
 * path opens it or rerolls it). The contents are drawn from the weighted
 * table in daily.json, and the odds are shown in full before opening. The
 * draw comes from the village seed and the day, so reloading cannot reroll it.
 *
 * Streak: each day you open the chest moves you one step up a short ladder
 * (bigger chests). A missed day never wipes the streak: a free weekly skip
 * covers it, and otherwise you move back one step per missed day. Skips
 * cannot be bought.
 */
import { dayIndex } from './pass';
import { scaleReward } from './economy';
import { createRng, mixSeed, next } from './rng';
import type { Cost, DailyState, GameData, ResourceKind } from './types';

export function emptyDaily(data: GameData): DailyState {
  return { lastDay: -1, step: 0, skipsLeft: data.daily.streak.skipsPerWeek, skipWeek: -1, history: [] };
}

export interface ChestOdds {
  id: string;
  label: string;
  /** Chance in percent (all outcomes add up to 100). */
  percent: number;
  reward: Cost;
}

/** Every possible outcome with its exact chance, for showing before the chest is opened. */
export function chestOdds(data: GameData): ChestOdds[] {
  const list = data.daily.chest.outcomes;
  const total = list.reduce((s, o) => s + o.weight, 0);
  return list.map((o) => ({ id: o.id, label: o.label, percent: (o.weight * 100) / total, reward: { ...o.reward } }));
}

export function chestReady(state: { daily: DailyState }, now: number, data: GameData): boolean {
  return state.daily.lastDay < dayIndex(now, data);
}

/** When the next chest can be opened (start of the next UTC day). */
export function nextChestAt(now: number, data: GameData): number {
  return data.pass.epoch + (dayIndex(now, data) + 1) * 86_400_000;
}

export interface StreakAfterClaim {
  step: number;
  skipsLeft: number;
  skipWeek: number;
  /** Missed days covered by a free skip, and ones that cost a step. */
  skipped: number;
  steppedBack: number;
}

/** What the streak becomes if the chest is opened on `day` (pure). */
export function streakAfterClaim(d: DailyState, day: number, data: GameData): StreakAfterClaim {
  const cfg = data.daily.streak;
  const week = Math.floor(day / 7);
  let skipsLeft = d.skipsLeft;
  let skipWeek = d.skipWeek;
  if (week !== skipWeek) {
    skipsLeft = cfg.skipsPerWeek;
    skipWeek = week;
  }
  const missed = d.lastDay < 0 ? 0 : Math.max(0, day - d.lastDay - 1);
  const skipped = Math.min(missed, skipsLeft);
  skipsLeft -= skipped;
  const steppedBack = Math.min(d.step, (missed - skipped) * cfg.stepsLostPerMissedDay);
  const step = Math.min(cfg.steps.length, d.step - steppedBack + 1);
  return { step, skipsLeft, skipWeek, skipped, steppedBack };
}

/** The outcome the chest holds on `day` for this village (fixed by the seed). */
export function chestOutcome(seed: number, day: number, data: GameData): string {
  const list = data.daily.chest.outcomes;
  const total = list.reduce((s, o) => s + o.weight, 0);
  let roll = next(createRng(mixSeed(seed ^ 0xc4e57, day))) * total;
  for (const o of list) {
    roll -= o.weight;
    if (roll < 0) return o.id;
  }
  return list[list.length - 1].id;
}

/** Contents of an outcome at a hall level and streak step (resources scale; Moonstones don't, except the streak's own bonus). */
export function chestContents(outcomeId: string, hall: number, step: number, data: GameData): Cost {
  const o = data.daily.chest.outcomes.find((x) => x.id === outcomeId);
  if (!o) return {};
  const steps = data.daily.streak.steps;
  const s = steps[Math.max(1, Math.min(steps.length, step)) - 1];
  const scaled = scaleReward(o.reward, hall, data);
  const out: Cost = {};
  for (const [k, v] of Object.entries(scaled) as [ResourceKind, number][]) out[k] = k === 'moonstones' ? v : Math.round(v * s.bonus);
  if (s.moonstones) out.moonstones = (out.moonstones ?? 0) + s.moonstones;
  return out;
}
