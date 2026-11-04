import { armyHousing, armyReadyAt, fillCount, housingCapacity, queueFit, trainingQueueLimit } from './army';
import type { GameData, TrainingItem, VillageState } from './types';
import { advance, researchStartQuoteOn, trainingSkipQuote, trainQuoteOn, type QuoteResult } from './village';

/**
 * Where a queued warrior stands:
 * - `training`: on the way into the camps;
 * - `next`: still training, but the camps will be full, so it joins the next army;
 * - `waiting`: finished, and only needs camp room.
 */
export type QueueStatus = 'training' | 'next' | 'waiting';

/** A run of one warrior type in one state, so a long queue reads as a few lines instead of hundreds of tiles. */
export interface QueueStack {
  troop: string;
  status: QueueStatus;
  count: number;
  housing: number;
  /** Queue position of the stack's last warrior: cancelling works back from there, so the one in training is touched last. */
  lastIndex: number;
  /** When the last warrior of the stack finishes. */
  endsAt: number;
}

export type BuildState = 'ready' | 'building' | 'missing';

export interface ArmyView {
  /** The village settled up to `now`; everything below was read from it. */
  state: VillageState;
  capacity: number;
  /** Housing of warriors ready to attack. */
  readyHousing: number;
  /** Housing on its way into the camps. */
  trainingHousing: number;
  /** Housing still training that the camps won't have room for. */
  nextHousing: number;
  /** Finished warriors the camps have no room for. */
  waiting: number;
  waitingHousing: number;
  /** Most housing that can be ready and queued together. */
  queueLimit: number;
  /** The warrior in training right now. */
  active: TrainingItem | null;
  /** When the warriors who fit in the camps have all finished. */
  armyDoneAt: number | null;
  stacks: QueueStack[];
  skip: { seconds: number; moonstones: number } | null;
  /** What training needs: a finished Training Dojo and a finished Squad Courtyard. */
  dojo: BuildState;
  camp: BuildState;
}

function buildState(s: VillageState, type: string): BuildState {
  const all = s.buildings.filter((b) => b.type === type);
  if (all.some((b) => b.level >= 1)) return 'ready';
  return all.length ? 'building' : 'missing';
}

function statusAt(item: TrainingItem, index: number, fit: number, now: number): QueueStatus {
  if (index < fit) return 'training';
  return item.endsAt <= now ? 'waiting' : 'next';
}

/** Everything the Army panel shows, from one settled copy of the village: the panel redraws often and must stay cheap. */
export function armyView(village: VillageState, now: number, data: GameData): ArmyView {
  const s = advance(village, now, data).state;
  const fit = queueFit(s, data);
  const stacks: QueueStack[] = [];
  let trainingHousing = 0;
  let nextHousing = 0;
  let waiting = 0;
  let waitingHousing = 0;
  s.training.forEach((item, i) => {
    const status = statusAt(item, i, fit, now);
    const size = data.troops[item.troop]?.housing ?? 0;
    if (status === 'training') trainingHousing += size;
    else if (status === 'next') nextHousing += size;
    else {
      waiting++;
      waitingHousing += size;
    }
    const top = stacks[stacks.length - 1];
    if (top && top.troop === item.troop && top.status === status) {
      top.count++;
      top.housing += size;
      top.lastIndex = i;
      top.endsAt = item.endsAt;
    } else stacks.push({ troop: item.troop, status, count: 1, housing: size, lastIndex: i, endsAt: item.endsAt });
  });
  return {
    state: s,
    capacity: housingCapacity(s, data),
    readyHousing: armyHousing(s.army, data),
    trainingHousing,
    nextHousing,
    waiting,
    waitingHousing,
    queueLimit: trainingQueueLimit(s, data),
    active: s.training.find((q) => q.startedAt <= now && q.endsAt > now) ?? null,
    armyDoneAt: armyReadyAt(s, data),
    stacks,
    skip: trainingSkipQuote(s, now, data),
    dojo: buildState(s, 'burrow_barracks'),
    camp: buildState(s, 'army_camp'),
  };
}

export interface TrainRow {
  quote: QuoteResult;
  /** What "Fill" would really queue: camp room (`fillCount`), limited to what can be paid for. */
  fill: number;
  /** True when the camps are spoken for, so "Fill" trains ahead for the next army. */
  ahead: boolean;
}

/** The train list's quote for one warrior, on a view's settled village. */
export function trainRow(view: ArmyView, troop: string, now: number, data: GameData): TrainRow {
  const quote = trainQuoteOn(view.state, troop, now, data);
  let fill = fillCount(view.state, troop, data);
  for (const [k, v] of Object.entries(quote.quote?.cost ?? {}) as [keyof VillageState['resources'], number][]) {
    if (v > 0) fill = Math.min(fill, Math.floor(view.state.resources[k] / v));
  }
  const committed = view.readyHousing + view.trainingHousing + view.nextHousing + view.waitingHousing;
  return { quote, fill, ahead: committed + (data.troops[troop]?.housing ?? 0) > view.capacity };
}

/** The research list's quote for one warrior, on a view's settled village. */
export function researchRow(view: ArmyView, troop: string, now: number, data: GameData): QuoteResult {
  return researchStartQuoteOn(view.state, troop, now, data);
}
