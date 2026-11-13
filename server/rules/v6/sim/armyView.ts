import { armyHousing, armyReadyAt, fillCount, housingCapacity, queueFits, trainingQueueLimit } from './army';
import type { Cost, GameData, TrainingItem, VillageState } from './types';
import { advance, researchStartQuoteOn, topUpQuoteOn, trainingSkipQuote, trainQuoteOn, type QuoteResult } from './village';

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
  /** Camp space nobody is in yet. */
  freeHousing: number;
  /** Warriors, and their housing, on their way into the camps. */
  training: number;
  trainingHousing: number;
  /** Warriors, and their housing, still training that the camps won't have room for. */
  next: number;
  nextHousing: number;
  /** Finished warriors, and their housing, too big for the space left. */
  waiting: number;
  waitingHousing: number;
  /** The space the smallest waiting warrior needs (0 when nobody waits). */
  waitingNeeds: number;
  /** Most housing that can be ready and queued together. */
  queueLimit: number;
  /** The warrior in training right now. */
  active: TrainingItem | null;
  /** Where that warrior is headed: into the camps, or the next army. */
  activeStatus: QueueStatus | null;
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

function statusOf(item: TrainingItem, fits: boolean, now: number): QueueStatus {
  if (fits) return 'training';
  return item.endsAt <= now ? 'waiting' : 'next';
}

/** Everything the Army panel shows, from one settled copy of the village: the panel redraws often and must stay cheap. */
export function armyView(village: VillageState, now: number, data: GameData): ArmyView {
  const s = advance(village, now, data).state;
  const fits = queueFits(s, data);
  const stacks: QueueStack[] = [];
  const count: Record<QueueStatus, number> = { training: 0, next: 0, waiting: 0 };
  const housing: Record<QueueStatus, number> = { training: 0, next: 0, waiting: 0 };
  let waitingNeeds = 0;
  s.training.forEach((item, i) => {
    const status = statusOf(item, fits[i], now);
    const size = data.troops[item.troop]?.housing ?? 0;
    count[status]++;
    housing[status] += size;
    if (status === 'waiting') waitingNeeds = waitingNeeds ? Math.min(waitingNeeds, size) : size;
    const top = stacks[stacks.length - 1];
    if (top && top.troop === item.troop && top.status === status) {
      top.count++;
      top.housing += size;
      top.lastIndex = i;
      top.endsAt = item.endsAt;
    } else stacks.push({ troop: item.troop, status, count: 1, housing: size, lastIndex: i, endsAt: item.endsAt });
  });
  const capacity = housingCapacity(s, data);
  const readyHousing = armyHousing(s.army, data);
  const activeAt = s.training.findIndex((q) => q.startedAt <= now && q.endsAt > now);
  return {
    state: s,
    capacity,
    readyHousing,
    freeHousing: Math.max(0, capacity - readyHousing),
    training: count.training,
    trainingHousing: housing.training,
    next: count.next,
    nextHousing: housing.next,
    waiting: count.waiting,
    waitingHousing: housing.waiting,
    waitingNeeds,
    queueLimit: trainingQueueLimit(s, data),
    active: activeAt >= 0 ? s.training[activeAt] : null,
    activeStatus: activeAt >= 0 ? statusOf(s.training[activeAt], fits[activeAt], now) : null,
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
  /** Jade to buy the Provisions missing for a full Fill (`count` warriors) and queue them; null when resources aren't what stops it. */
  topUp: { count: number; missing: Cost; moonstones: number } | null;
}

/** The train list's quote for one warrior, on a view's settled village. */
export function trainRow(view: ArmyView, troop: string, now: number, data: GameData): TrainRow {
  const quote = trainQuoteOn(view.state, troop, now, data);
  let fill = fillCount(view.state, troop, data);
  for (const [k, v] of Object.entries(quote.quote?.cost ?? {}) as [keyof VillageState['resources'], number][]) {
    if (v > 0) fill = Math.min(fill, Math.floor(view.state.resources[k] / v));
  }
  const committed = view.readyHousing + view.trainingHousing + view.nextHousing + view.waitingHousing;
  const room = fillCount(view.state, troop, data);
  const tq = room > fill && quote.quote && (quote.ok || quote.code === 'NOT_ENOUGH_RESOURCES') ? topUpQuoteOn(view.state, { type: 'train', troop, count: room }, now, data) : null;
  return { quote, fill, ahead: committed + (data.troops[troop]?.housing ?? 0) > view.capacity, topUp: tq ? { count: room, ...tq } : null };
}

/** The research list's quote for one warrior, on a view's settled village. */
export function researchRow(view: ArmyView, troop: string, now: number, data: GameData): QuoteResult {
  return researchStartQuoteOn(view.state, troop, now, data);
}

/** Jade to buy what a research is missing and start it (null when resources aren't what stops it). */
export function researchTopUp(view: ArmyView, troop: string, now: number, data: GameData): { missing: Cost; moonstones: number } | null {
  return topUpQuoteOn(view.state, { type: 'research', troop }, now, data);
}
