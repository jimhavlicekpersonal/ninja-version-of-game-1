/**
 * Goal events (events.json entries with a `goal`): limited-time events the
 * player plays, not passive buffs. Same fixed schedule as every event (sim/events.ts):
 * nothing moves or extends a window, so every countdown is real.
 *
 * `bounty`: a Bounty Hunt. While it runs, the village has one bounty fortress, a
 * generated base at its Keep (seeded by the village and the occurrence, so every
 * attempt meets the same fortress; no loot inside). Attack it as often as you like
 * with your own army: troops are spent as in any battle, no honor moves. Each step of
 * the reward ladder (a destruction mark or a star count) pays once per occurrence,
 * the first time a result reaches it; a better result later pays the steps it newly
 * reaches. Rewards: Coins and Provisions scaled by the Keep (`rewardScaleByHall`),
 * Jade as written. Never sold, never rerolled.
 */
import { LAYOUTS, generateOpponent } from './battle/basegen';
import type { BaseLayout } from './battle/types';
import { scaleReward } from './economy';
import { activeEvents, eventsBetween, type EventWindow } from './events';
import { createRng, mixSeed, pick } from './rng';
import type { Cost, GameData, GoalDef, GoalEventState, GoalLadderStep, VillageState } from './types';

export interface GoalEventWindow extends EventWindow {
  goal: GoalDef;
}

function withGoal(w: EventWindow, data: GameData): GoalEventWindow | null {
  const def = data.events.schedule.find((e) => e.id === w.id);
  return def?.goal ? { ...w, goal: def.goal } : null;
}

/** The goal event running at `t`, if any (the earliest-started one). */
export function activeGoalEvent(t: number, data: GameData): GoalEventWindow | null {
  for (const w of activeEvents(t, data)) {
    const g = withGoal(w, data);
    if (g) return g;
  }
  return null;
}

/** The goal event occurrence with this key, wherever it is on the schedule (searches a year around `near`). */
export function goalEventByKey(key: string, near: number, data: GameData): GoalEventWindow | null {
  const span = 366 * 86_400_000;
  for (const w of eventsBetween(near - span, near + span, data)) if (w.key === key) return withGoal(w, data);
  return null;
}

/** The village's progress in an occurrence (fresh when the stored one is another occurrence). */
export function goalProgress(state: VillageState, key: string): GoalEventState {
  const g = state.goalEvent;
  return g && g.key === key ? g : { key, best: 0, bestDestruction: 0, claimed: [] };
}

function keepOf(state: VillageState, data: GameData): number {
  return Math.max(1, state.buildings.find((b) => data.buildings[b.type]?.category === 'hall')?.level ?? 1);
}

/**
 * This village's bounty fortress for an occurrence, at Keep `keep` (the Keep it had
 * when the attack began; the battle record carries it). Deterministic, no loot.
 */
export function bountyBase(seed: number, key: string, keep: number, goal: GoalDef, data: GameData): BaseLayout {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const s = mixSeed(seed ^ 0xb0b7, h);
  const rng = createRng(s);
  const layout = pick(rng, LAYOUTS);
  const base = generateOpponent(s, keep, data, { levelBias: 0.75, layout });
  for (const b of base.buildings) delete b.loot;
  base.name = `Bounty: ${pick(rng, data.names.playerFirst)} ${pick(rng, data.names.playerSecond)}'s fortress`;
  base.practice = `Bounty fortress (${layout.name})`;
  if (goal.power !== 1) base.power = goal.power;
  return base;
}

/** Whether a result reaches a ladder step. */
export function reachesStep(step: GoalLadderStep, stars: number, destruction: number): boolean {
  return (step.at > 0 && stars >= step.at) || (step.destruction !== undefined && destruction >= step.destruction);
}

/** A ladder step's reward at a Keep. */
export function ladderReward(step: GoalLadderStep, keep: number, data: GameData): Cost {
  return scaleReward(step.reward, keep, data);
}

export interface GoalEventView {
  event: GoalEventWindow;
  progress: GoalEventState;
  /** Each ladder step with its reward at the player's Keep and whether it was paid. */
  ladder: { step: GoalLadderStep; reward: Cost; paid: boolean }[];
  base: BaseLayout;
}

/** Everything the event panel shows (null when no goal event runs). */
export function goalEventView(state: VillageState, now: number, data: GameData): GoalEventView | null {
  const ev = activeGoalEvent(now, data);
  if (!ev) return null;
  const keep = keepOf(state, data);
  const progress = goalProgress(state, ev.key);
  return {
    event: ev,
    progress,
    ladder: ev.goal.ladder.map((step, i) => ({ step, reward: ladderReward(step, keep, data), paid: progress.claimed.includes(i) })),
    base: bountyBase(state.seed, ev.key, keep, ev.goal, data),
  };
}

/**
 * Record a bounty result: best result and the ladder steps it newly reaches (each paid once).
 * Mutates `state.goalEvent`; returns the indexes of the newly reached steps.
 */
export function recordBountyResult(state: VillageState, key: string, goal: GoalDef, stars: number, destruction: number): number[] {
  const g = goalProgress(state, key);
  const next: GoalEventState = { key, best: Math.max(g.best, stars), bestDestruction: Math.max(g.bestDestruction, destruction), claimed: [...g.claimed] };
  const fresh: number[] = [];
  goal.ladder.forEach((step, i) => {
    if (!next.claimed.includes(i) && reachesStep(step, stars, destruction)) {
      next.claimed.push(i);
      fresh.push(i);
    }
  });
  state.goalEvent = next;
  return fresh;
}
