import { armyHousing, barracksLevel, finishTraining, housingCapacity, queueEndsAt, queueHousing, retimeQueue } from './army';
import { runBattle } from './battle/battle';
import type { BattleRecord, BattleSetup, Deployment } from './battle/types';
import { MS_PER_SECOND } from './clock';
import { buildingDef, hallType, levelDef, maxDefinedLevel, troopDef } from './data';
import { mixSeed } from './rng';
import { canPlace } from './grid';
import { addCapped, canAfford, capacity, collectorAmount, effectiveLevel, subtractCost } from './resources';
import type { Building, BuildingLimit, BuildingType, Cost, GameData, ResourceKind, VillageState } from './types';
import { RESOURCE_KINDS } from './types';

// ---------- Commands ----------

export type Command =
  | { type: 'place'; buildingType: BuildingType; x: number; y: number }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'upgrade'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'collect'; id: string }
  | { type: 'train'; troop: string }
  | { type: 'cancelTraining'; index: number }
  | { type: 'scout'; paid: boolean }
  | { type: 'battleEnd'; record: Omit<BattleRecord, 'result' | 'id' | 'kind'> };

export type ErrorCode =
  | 'NOT_FOUND'
  | 'NOT_AVAILABLE'
  | 'INVALID_PLACEMENT'
  | 'LIMIT_REACHED'
  | 'HALL_LEVEL_TOO_LOW'
  | 'MAX_LEVEL'
  | 'BUSY'
  | 'NOT_UPGRADING'
  | 'NOT_ENOUGH_RESOURCES'
  | 'NO_FREE_BUILDER'
  | 'NOTHING_TO_COLLECT'
  | 'STORAGE_FULL'
  | 'LOCKED'
  | 'ARMY_FULL'
  | 'INVALID_BATTLE';

export type SimEvent =
  | { kind: 'upgrade_start'; buildingType: BuildingType; id: string; toLevel: number; seconds: number; cost: Cost }
  | { kind: 'upgrade_cancel'; buildingType: BuildingType; id: string; toLevel: number; refund: Cost }
  | { kind: 'collect'; buildingType: BuildingType; id: string; resource: ResourceKind; amount: number }
  | { kind: 'move'; buildingType: BuildingType; id: string }
  | { kind: 'train_start'; troop: string; seconds: number; cost: Cost }
  | { kind: 'train_cancel'; troop: string }
  | { kind: 'scout'; seed: number; fee: number }
  | { kind: 'raid_end'; record: BattleRecord };

export type CommandResult =
  | { ok: true; state: VillageState; events: SimEvent[] }
  | { ok: false; code: ErrorCode; message: string };

export interface Quote {
  toLevel: number;
  cost: Cost;
  seconds: number;
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; code: ErrorCode; message: string; quote?: Quote };

export interface FinishedUpgrade {
  id: string;
  type: BuildingType;
  level: number;
  at: number;
}

function fail(code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code, message };
}

// ---------- Village setup and queries ----------

export function createNewVillage(now: number, data: GameData): VillageState {
  const state: VillageState = {
    createdAt: now,
    lastSeenAt: now,
    resources: { ...data.economy.startingResources },
    buildings: [],
    nextId: 1,
    army: {},
    training: [],
    battleLog: [],
    seed: mixSeed(now >>> 0, Math.floor(now / 4294967296)),
    nextSeed: 1,
  };
  for (const sb of data.economy.startingLayout) {
    const def = buildingDef(data, sb.type);
    state.buildings.push({
      id: `b${state.nextId++}`,
      type: sb.type,
      level: sb.level,
      x: sb.x,
      y: sb.y,
      upgrade: null,
      collector: def.produces ? { stored: 0, accrueFrom: now } : null,
    });
  }
  return state;
}

/** Finish every timer whose end time has passed. Returns a new state; the input is untouched. */
export function advance(state: VillageState, now: number, _data: GameData): { state: VillageState; finished: FinishedUpgrade[] } {
  const next = structuredClone(state);
  const finished: FinishedUpgrade[] = [];
  for (const b of next.buildings) {
    if (b.upgrade && b.upgrade.endsAt <= now) {
      finished.push({ id: b.id, type: b.type, level: b.upgrade.toLevel, at: b.upgrade.endsAt });
      b.level = b.upgrade.toLevel;
      b.upgrade = null;
    }
  }
  finished.sort((a, b) => a.at - b.at);
  finishTraining(next, now);
  return { state: next, finished };
}

export function hallLevel(state: VillageState, data: GameData): number {
  const type = hallType(data);
  const hall = state.buildings.find((b) => b.type === type);
  return Math.max(1, hall?.level ?? 1);
}

export function countOfType(state: VillageState, type: BuildingType): number {
  return state.buildings.filter((b) => b.type === type).length;
}

/** How many of a building the current Elder Toadstool level allows, and the highest level. */
export function limitFor(state: VillageState, data: GameData, type: BuildingType, atHallLevel?: number): BuildingLimit {
  if (buildingDef(data, type).category === 'hall') {
    return { count: 1, maxLevel: Math.min(data.hall.levels.length, maxDefinedLevel(data, type)) };
  }
  const level = atHallLevel ?? hallLevel(state, data);
  return data.hall.levels[level - 1]?.limits[type] ?? { count: 0, maxLevel: 0 };
}

/** The lowest Elder Toadstool level that allows the condition, or null if none does. */
export function hallLevelRequiredFor(data: GameData, type: BuildingType, test: (l: BuildingLimit) => boolean): number | null {
  for (const hl of data.hall.levels) {
    const lim = hl.limits[type];
    if (lim && test(lim)) return hl.level;
  }
  return null;
}

export function builderStatus(state: VillageState, data: GameData, now: number): { total: number; busy: number; free: number } {
  let total = 0;
  let busy = 0;
  for (const b of state.buildings) {
    if (buildingDef(data, b.type).category === 'builder' && effectiveLevel(b, now) >= 1) total++;
    if (b.upgrade && b.upgrade.endsAt > now) busy++;
  }
  return { total, busy, free: Math.max(0, total - busy) };
}

function costText(cost: Cost): string {
  return RESOURCE_KINDS.filter((k) => cost[k])
    .map((k) => `${cost[k]} ${k}`)
    .join(', ');
}

/** Can a new building of this type be bought right now (ignoring where it goes)? */
export function placeQuote(state: VillageState, data: GameData, type: BuildingType, now: number): QuoteResult {
  const s = advance(state, now, data).state;
  const def = data.buildings[type];
  if (!def || !def.inShop) return fail('NOT_AVAILABLE', 'That building is not available.');
  const first = def.levels[0];
  const quote: Quote = { toLevel: 1, cost: first.cost, seconds: first.buildSeconds };
  const have = countOfType(s, type);
  const lim = limitFor(s, data, type);
  if (have >= lim.count) {
    const need = hallLevelRequiredFor(data, type, (l) => l.count > have);
    return need
      ? { ...fail('HALL_LEVEL_TOO_LOW', `Upgrade your Elder Toadstool to level ${need} to build another ${def.name}.`), quote }
      : { ...fail('LIMIT_REACHED', `You have the most ${def.name}s allowed.`), quote };
  }
  if (!canAfford(s.resources, first.cost)) return { ...fail('NOT_ENOUGH_RESOURCES', `Not enough resources (needs ${costText(first.cost)}).`), quote };
  if (first.buildSeconds > 0 && builderStatus(s, data, now).free < 1) {
    return { ...fail('NO_FREE_BUILDER', 'All your Beaver Builders are busy.'), quote };
  }
  return { ok: true, quote };
}

/** What the next upgrade of a building costs, and whether it can start now. */
export function upgradeQuote(state: VillageState, id: string, data: GameData, now: number): QuoteResult {
  const s = advance(state, now, data).state;
  const b = s.buildings.find((x) => x.id === id);
  if (!b) return fail('NOT_FOUND', 'Building not found.');
  const def = buildingDef(data, b.type);
  if (b.upgrade) return fail('BUSY', `${def.name} is already being worked on.`);
  const next = levelDef(data, b.type, b.level + 1);
  const lim = limitFor(s, data, b.type);
  if (!next || b.level >= maxDefinedLevel(data, b.type) || (def.category === 'hall' && b.level >= lim.maxLevel)) {
    return fail('MAX_LEVEL', `${def.name} is at its highest level.`);
  }
  const quote: Quote = { toLevel: next.level, cost: next.cost, seconds: next.buildSeconds };
  if (next.level > lim.maxLevel) {
    const need = hallLevelRequiredFor(data, b.type, (l) => l.maxLevel >= next.level);
    return need
      ? { ...fail('HALL_LEVEL_TOO_LOW', `Upgrade your Elder Toadstool to level ${need} first.`), quote }
      : { ...fail('MAX_LEVEL', `${def.name} is at its highest level.`), quote };
  }
  if (!canAfford(s.resources, next.cost)) return { ...fail('NOT_ENOUGH_RESOURCES', `Not enough resources (needs ${costText(next.cost)}).`), quote };
  if (next.buildSeconds > 0 && builderStatus(s, data, now).free < 1) {
    return { ...fail('NO_FREE_BUILDER', 'All your Beaver Builders are busy.'), quote };
  }
  return { ok: true, quote };
}

// ---------- Applying commands ----------

/**
 * Apply one player command at time `now`. Pure: returns a new state and never
 * mutates the input. Timers that ended before `now` are finished first.
 */
export function applyCommand(state: VillageState, cmd: Command, now: number, data: GameData): CommandResult {
  const s = advance(state, now, data).state;
  switch (cmd.type) {
    case 'place':
      return place(s, cmd.buildingType, cmd.x, cmd.y, now, data);
    case 'move':
      return move(s, cmd.id, cmd.x, cmd.y, data);
    case 'upgrade':
      return upgrade(s, cmd.id, now, data);
    case 'cancel':
      return cancel(s, cmd.id, now, data);
    case 'collect':
      return collect(s, cmd.id, now, data);
    case 'train':
      return train(s, cmd.troop, now, data);
    case 'cancelTraining':
      return cancelTraining(s, cmd.index, now, data);
    case 'scout':
      return scout(s, cmd.paid, data);
    case 'battleEnd':
      return battleEnd(s, cmd.record, now, data);
  }
}

// ---------- Army and raids ----------

export function trainQuote(state: VillageState, troop: string, now: number, data: GameData): QuoteResult {
  const s = advance(state, now, data).state;
  const def = data.troops[troop];
  if (!def) return fail('NOT_FOUND', 'Unknown troop.');
  const quote: Quote = { toLevel: 1, cost: def.cost, seconds: def.trainSeconds };
  if (barracksLevel(s, data) < def.barracksLevel) {
    return { ...fail('LOCKED', `Needs a level ${def.barracksLevel} Burrow Barracks.`), quote };
  }
  const cap = housingCapacity(s, data);
  if (armyHousing(s.army, data) + queueHousing(s.training, data) + def.housing > cap) {
    return { ...fail('ARMY_FULL', cap ? 'Your Army Camps are full.' : 'Build an Army Camp to house troops.'), quote };
  }
  if (!canAfford(s.resources, def.cost)) return { ...fail('NOT_ENOUGH_RESOURCES', `Not enough resources (needs ${costText(def.cost)}).`), quote };
  return { ok: true, quote };
}

function train(s: VillageState, troop: string, now: number, data: GameData): CommandResult {
  const q = trainQuote(s, troop, now, data);
  if (!q.ok) return q;
  const def = troopDef(data, troop);
  subtractCost(s.resources, def.cost);
  const startedAt = queueEndsAt(s, now);
  s.training.push({ troop, startedAt, endsAt: startedAt + def.trainSeconds * MS_PER_SECOND, cost: def.cost });
  return { ok: true, state: s, events: [{ kind: 'train_start', troop, seconds: def.trainSeconds, cost: def.cost }] };
}

function cancelTraining(s: VillageState, index: number, now: number, data: GameData): CommandResult {
  const item = s.training[index];
  if (!item) return fail('NOT_FOUND', 'Nothing to cancel.');
  s.training.splice(index, 1);
  if (index === 0 && s.training.length) {
    // The next item starts now.
    const first = s.training[0];
    const dur = first.endsAt - first.startedAt;
    first.startedAt = now;
    first.endsAt = now + dur;
  }
  retimeQueue(s.training, now, data);
  addCapped(s.resources, item.cost, capacity(s, data));
  return { ok: true, state: s, events: [{ kind: 'train_cancel', troop: item.troop }] };
}

export function scoutFee(state: VillageState, data: GameData): number {
  const fees = data.battle.scoutFeeByHall;
  return fees[Math.min(fees.length, hallLevel(state, data)) - 1] ?? 0;
}

/** Pick the next opponent. The first look is free; each "Next" costs a small Acorn fee. */
function scout(s: VillageState, paid: boolean, data: GameData): CommandResult {
  const fee = paid ? scoutFee(s, data) : 0;
  if (s.resources.acorns < fee) return fail('NOT_ENOUGH_RESOURCES', `Next costs ${fee} acorns.`);
  s.resources.acorns -= fee;
  const seed = mixSeed(s.seed, s.nextSeed++);
  return { ok: true, state: s, events: [{ kind: 'scout', seed, fee }] };
}

/**
 * Apply the result of an attack. The battle is re-simulated from its seed and
 * deployments, so the loot always matches what really happened.
 */
function battleEnd(s: VillageState, rec: Omit<BattleRecord, 'result' | 'id' | 'kind'>, now: number, data: GameData): CommandResult {
  for (const [t, n] of Object.entries(rec.setup.army)) {
    if (!data.troops[t] || n < 0) return fail('INVALID_BATTLE', 'Unknown troops in battle.');
  }
  const { result } = runBattle(rec.setup, rec.deployments, data, rec.endTick);
  for (const [t, n] of Object.entries(result.used)) {
    s.army[t] = Math.max(0, (s.army[t] ?? 0) - n);
    if (s.army[t] === 0) delete s.army[t];
  }
  const added = addCapped(s.resources, result.loot, capacity(s, data));
  const record: BattleRecord = { ...rec, id: `r${s.nextSeed++}`, kind: 'attack', at: rec.at ?? now, result: { ...result, loot: { ...result.loot } } };
  record.result.loot = added;
  s.battleLog.push(record);
  while (s.battleLog.length > data.battle.maxReplays) s.battleLog.shift();
  return { ok: true, state: s, events: [{ kind: 'raid_end', record }] };
}

export type { BattleSetup, Deployment };

function place(s: VillageState, type: BuildingType, x: number, y: number, now: number, data: GameData): CommandResult {
  const q = placeQuote(s, data, type, now);
  if (!q.ok) return q;
  if (!canPlace(s, data, type, x, y).ok) return fail('INVALID_PLACEMENT', "That spot isn't free.");
  const def = buildingDef(data, type);
  const { cost, seconds } = q.quote;
  subtractCost(s.resources, cost);
  const endsAt = now + seconds * MS_PER_SECOND;
  const b: Building = {
    id: `b${s.nextId++}`,
    type,
    level: seconds > 0 ? 0 : 1,
    x,
    y,
    upgrade: seconds > 0 ? { toLevel: 1, startedAt: now, endsAt, cost } : null,
    collector: def.produces ? { stored: 0, accrueFrom: endsAt } : null,
  };
  s.buildings.push(b);
  return { ok: true, state: s, events: [{ kind: 'upgrade_start', buildingType: type, id: b.id, toLevel: 1, seconds, cost }] };
}

function move(s: VillageState, id: string, x: number, y: number, data: GameData): CommandResult {
  const b = s.buildings.find((v) => v.id === id);
  if (!b) return fail('NOT_FOUND', 'Building not found.');
  if (!canPlace(s, data, b.type, x, y, id).ok) return fail('INVALID_PLACEMENT', "That spot isn't free.");
  b.x = x;
  b.y = y;
  return { ok: true, state: s, events: [{ kind: 'move', buildingType: b.type, id }] };
}

function upgrade(s: VillageState, id: string, now: number, data: GameData): CommandResult {
  const q = upgradeQuote(s, id, data, now);
  if (!q.ok) return q;
  const b = s.buildings.find((v) => v.id === id)!;
  const { cost, seconds, toLevel } = q.quote;
  subtractCost(s.resources, cost);
  const endsAt = now + seconds * MS_PER_SECOND;
  if (seconds <= 0) {
    b.level = toLevel;
  } else {
    if (b.collector) {
      // Bank what it holds; production pauses until the upgrade ends.
      b.collector = { stored: collectorAmount(b, now, data), accrueFrom: endsAt };
    }
    b.upgrade = { toLevel, startedAt: now, endsAt, cost };
  }
  return { ok: true, state: s, events: [{ kind: 'upgrade_start', buildingType: b.type, id, toLevel, seconds, cost }] };
}

function cancel(s: VillageState, id: string, now: number, data: GameData): CommandResult {
  const b = s.buildings.find((v) => v.id === id);
  if (!b) return fail('NOT_FOUND', 'Building not found.');
  if (!b.upgrade) return fail('NOT_UPGRADING', 'Nothing to cancel.');
  const { toLevel, cost } = b.upgrade;
  if (b.level < 1) {
    s.buildings = s.buildings.filter((v) => v.id !== id);
  } else {
    b.upgrade = null;
    if (b.collector) b.collector = { stored: b.collector.stored, accrueFrom: now };
  }
  const refundWanted: Cost = {};
  for (const k of RESOURCE_KINDS) {
    const r = Math.floor((cost[k] ?? 0) * data.economy.cancelRefundFraction);
    if (r > 0) refundWanted[k] = r;
  }
  const refund = addCapped(s.resources, refundWanted, capacity(s, data));
  return { ok: true, state: s, events: [{ kind: 'upgrade_cancel', buildingType: b.type, id, toLevel, refund }] };
}

function collect(s: VillageState, id: string, now: number, data: GameData): CommandResult {
  const b = s.buildings.find((v) => v.id === id);
  if (!b) return fail('NOT_FOUND', 'Building not found.');
  const resource = buildingDef(data, b.type).produces;
  if (!b.collector || !resource) return fail('NOTHING_TO_COLLECT', 'This building does not produce anything.');
  const amount = collectorAmount(b, now, data);
  if (Math.floor(amount) < data.economy.minCollectAmount) return fail('NOTHING_TO_COLLECT', 'Nothing to collect yet.');
  const room = Math.max(0, capacity(s, data)[resource] - s.resources[resource]);
  if (room <= 0) return fail('STORAGE_FULL', `Your ${resource} storage is full. Build or upgrade storage.`);
  const take = Math.min(Math.floor(amount), room);
  s.resources[resource] += take;
  // While an upgrade runs, production stays paused until it ends.
  b.collector = { stored: amount - take, accrueFrom: b.upgrade ? b.upgrade.endsAt : now };
  return { ok: true, state: s, events: [{ kind: 'collect', buildingType: b.type, id, resource, amount: take }] };
}
