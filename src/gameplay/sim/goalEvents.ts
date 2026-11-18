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
 *
 * `gauntlet` (P5-02): the weekly Gauntlet. One fortress per occurrence and Keep, seeded by the occurrence key and the
 * Keep only (never the village), so every player at the same Keep attacks the identical base that week. It carries
 * Trial-style modifiers (`power`, `wallPower`) and one rival clan's tempers, and pays its star ladder once.
 *
 * P5-01: several goal events can run at once (the Gauntlet beside a Bounty Hunt or a festival), so progress is kept
 * per occurrence key (`VillageState.goalEvents`); alternating between two never resets either ladder.
 */
import { LAYOUTS, generateOpponent } from './battle/basegen';
import type { BaseLayout } from './battle/types';
import { scaleReward } from './economy';
import { temperBase } from './battle/temper';
import { activeEvents, eventDef, type EventWindow } from './events';
import { createRng, mixSeed, pick } from './rng';
import type { Cost, GameData, GoalDef, GoalEventState, GoalLadderStep, VillageState } from './types';

export interface GoalEventWindow extends EventWindow {
  goal: GoalDef;
}

/** How many occurrences' progress a village keeps (newest last). Far more than can ever run at once. */
const GOAL_PROGRESS_KEPT = 8;

function withGoal(w: EventWindow, data: GameData): GoalEventWindow | null {
  const def = eventDef(w.id, data);
  return def?.goal ? { ...w, goal: def.goal } : null;
}

/** Every goal event running at `t` (earliest-started first). */
export function activeGoalEvents(t: number, data: GameData): GoalEventWindow[] {
  const out: GoalEventWindow[] = [];
  for (const w of activeEvents(t, data)) {
    const g = withGoal(w, data);
    if (g) out.push(g);
  }
  return out;
}

/** The goal event running at `t` with this occurrence key, if any. */
export function runningGoalEvent(key: string, t: number, data: GameData): GoalEventWindow | null {
  return activeGoalEvents(t, data).find((g) => g.key === key) ?? null;
}

/** The village's progress in an occurrence (fresh when none is stored for it). */
export function goalProgress(state: VillageState, key: string): GoalEventState {
  return state.goalEvents.find((g) => g.key === key) ?? { key, best: 0, bestDestruction: 0, claimed: [] };
}

function keepOf(state: VillageState, data: GameData): number {
  return Math.max(1, state.buildings.find((b) => data.buildings[b.type]?.category === 'hall')?.level ?? 1);
}

/**
 * This village's bounty fortress for an occurrence, at Keep `keep` (the Keep it had
 * when the attack began; the battle record carries it). Deterministic, no loot.
 */
export function bountyBase(seed: number, key: string, keep: number, goal: GoalDef, data: GameData): BaseLayout {
  const s = mixSeed(seed ^ 0xb0b7, keyHash(key));
  const rng = createRng(s);
  const layout = pick(rng, LAYOUTS);
  const base = generateOpponent(s, keep, data, { levelBias: 0.75, layout });
  for (const b of base.buildings) delete b.loot;
  base.name = `Bounty: ${pick(rng, data.names.playerFirst)} ${pick(rng, data.names.playerSecond)}'s fortress`;
  base.practice = `Bounty fortress (${layout.name})`;
  if (goal.power !== 1) base.power = goal.power;
  return base;
}

function keyHash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * P5-02: the Gauntlet fortress of an occurrence at a Keep. Seeded by the occurrence key and the Keep only, so two
 * villages at one Keep get the identical base, and the next occurrence a different one. Deterministic, no loot.
 */
export function gauntletBase(key: string, keep: number, goal: GoalDef, data: GameData): BaseLayout {
  const s = mixSeed(keyHash(key) ^ 0x6a417e, keep);
  const rng = createRng(s);
  const layout = pick(rng, LAYOUTS);
  const rival = goal.rivals?.length ? pick(rng, goal.rivals) : undefined;
  const base = generateOpponent(s, keep, data, { levelBias: 0.75, layout });
  for (const b of base.buildings) delete b.loot;
  base.name = `Gauntlet: ${pick(rng, data.names.playerFirst)} ${pick(rng, data.names.playerSecond)}'s fortress`;
  base.practice = `Gauntlet fortress (${layout.name})`;
  if (goal.power !== 1) base.power = goal.power;
  if (goal.wallPower !== undefined && goal.wallPower !== 1) base.wallPower = goal.wallPower;
  const temper = data.battle.temper;
  if (rival && temper && keep >= temper.unlockKeep) temperBase(base, temper.rivals[rival]?.tempers, data);
  return base;
}

/** The fortress of a goal event occurrence for this village at Keep `keep` (Bounty: the village's own; Gauntlet: the Keep's). */
export function goalBase(seed: number, key: string, keep: number, goal: GoalDef, data: GameData): BaseLayout {
  return goal.kind === 'gauntlet' ? gauntletBase(key, keep, goal, data) : bountyBase(seed, key, keep, goal, data);
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

/** Everything the event panel shows, one entry per running goal event (empty when none runs). */
export function goalEventViews(state: VillageState, now: number, data: GameData): GoalEventView[] {
  const keep = keepOf(state, data);
  return activeGoalEvents(now, data).map((ev) => {
    const progress = goalProgress(state, ev.key);
    return {
      event: ev,
      progress,
      ladder: ev.goal.ladder.map((step, i) => ({ step, reward: ladderReward(step, keep, data), paid: progress.claimed.includes(i) })),
      base: goalBase(state.seed, ev.key, keep, ev.goal, data),
    };
  });
}

/**
 * Record a goal event result: best result and the ladder steps it newly reaches (each paid once per occurrence).
 * Mutates `state.goalEvents` (this occurrence moves to the end; the oldest drop past `GOAL_PROGRESS_KEPT`);
 * returns the indexes of the newly reached steps.
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
  state.goalEvents = [...state.goalEvents.filter((x) => x.key !== key), next].slice(-GOAL_PROGRESS_KEPT);
  return fresh;
}
