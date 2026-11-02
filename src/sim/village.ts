import { armyHousing, barracksLevel, finishTraining, housingCapacity, queueEndsAt, queueHousing, retimeQueue } from './army';
import { runBattle } from './battle/battle';
import type { BattleRecord, BattleSetup, Deployment } from './battle/types';
import { MS_PER_SECOND } from './clock';
import { buildingDef, hallType, levelDef, maxDefinedLevel, troopDef } from './data';
import { mixSeed } from './rng';
import { lossTrophies, seasonOf, winTrophies } from './ranks';
import { achievementViews } from './achievements';
import { skipCost, topUpCost } from './economy';
import { canPurchase, productInfo } from './monetization';
import { scatterObstacles } from './obstacles';
import { triggerOffer } from './offers';
import { buildTimeFactor, currentTasks, dayIndex, passSeason, rollPeriods, unlockedTier } from './pass';
import { emptyStats, type OfferTrigger } from './types';
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
  | { type: 'battleEnd'; record: Omit<BattleRecord, 'result' | 'id' | 'kind'> }
  | { type: 'skip'; id: string }
  | { type: 'skipTraining' }
  | { type: 'topUp'; cost: Cost }
  | { type: 'grantPurchase'; productId: string; transactionId: string }
  | { type: 'setProfile'; under18: boolean }
  | { type: 'buySkin'; skin: string }
  | { type: 'equipSkin'; skin: string }
  | { type: 'claimTask'; id: string; kind: 'daily' | 'weekly' }
  | { type: 'claimTier'; tier: number; track: 'free' | 'premium' }
  | { type: 'claimAchievement'; id: string }
  | { type: 'clear'; id: string }
  | { type: 'triggerOffer'; trigger: OfferTrigger };

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
  | 'INVALID_BATTLE'
  | 'NOT_ENOUGH_MOONSTONES'
  | 'NOTHING_TO_SKIP'
  | 'PURCHASE_REFUSED'
  | 'NOT_OWNED'
  | 'NOT_READY'
  | 'ALREADY_CLAIMED'
  | 'NO_OFFER';

export type SimEvent =
  | { kind: 'upgrade_start'; buildingType: BuildingType; id: string; toLevel: number; seconds: number; cost: Cost }
  | { kind: 'upgrade_cancel'; buildingType: BuildingType; id: string; toLevel: number; refund: Cost }
  | { kind: 'collect'; buildingType: BuildingType; id: string; resource: ResourceKind; amount: number }
  | { kind: 'move'; buildingType: BuildingType; id: string }
  | { kind: 'train_start'; troop: string; seconds: number; cost: Cost }
  | { kind: 'train_cancel'; troop: string }
  | { kind: 'scout'; seed: number; fee: number }
  | { kind: 'raid_end'; record: BattleRecord }
  | { kind: 'skip_used'; what: string; seconds: number; moonstones: number }
  | { kind: 'moonstone_spend'; what: string; moonstones: number }
  | { kind: 'purchase_granted'; productId: string; usd: number; grants: Cost }
  | { kind: 'trigger'; trigger: OfferTrigger }
  | { kind: 'offer_shown'; offerId: string; expiresAt: number }
  | { kind: 'reward'; source: string; grants: Cost }
  | { kind: 'clear_start'; buildingType: BuildingType; id: string; seconds: number };

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
    trophies: data.ranks.startingTrophies,
    shieldUntil: now + data.raids.newPlayerShieldHours * 3_600_000,
    defenseLog: [],
    season: seasonOf(now),
    raidCheckAt: now,
    stats: emptyStats(),
    purchases: [],
    profile: { under18: null },
    offers: { active: [], lastShown: {}, bought: [] },
    pass: { season: passSeason(now, data), points: 0, premium: false, claimedFree: [], claimedPremium: [] },
    tasks: { day: dayIndex(now, data), dayBaseline: emptyStats(), dayClaimed: [], week: Math.floor(dayIndex(now, data) / 7), weekBaseline: emptyStats(), weekClaimed: [] },
    cosmetics: { owned: ['classic'], hallSkin: 'classic' },
    achievements: {},
    flags: { longWaitSeen: false },
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
  scatterObstacles(state, data);
  return state;
}

/** Finish every timer whose end time has passed. Returns a new state; the input is untouched. */
export function advance(state: VillageState, now: number, data: GameData): { state: VillageState; finished: FinishedUpgrade[] } {
  const next = structuredClone(state);
  const finished: FinishedUpgrade[] = [];
  // Obstacles whose clearing finished disappear and give their Moonstones.
  next.buildings = next.buildings.filter((b) => {
    if (!b.upgrade || b.upgrade.toLevel !== 0 || b.upgrade.endsAt > now) return true;
    const reward = buildingDef(data, b.type).clear?.moonstones ?? 0;
    next.resources.moonstones += reward;
    next.stats.obstaclesCleared++;
    finished.push({ id: b.id, type: b.type, level: 0, at: b.upgrade.endsAt });
    return false;
  });
  for (const b of next.buildings) {
    if (b.upgrade && b.upgrade.endsAt <= now) {
      finished.push({ id: b.id, type: b.type, level: b.upgrade.toLevel, at: b.upgrade.endsAt });
      b.level = b.upgrade.toLevel;
      b.upgrade = null;
    }
  }
  finished.sort((a, b) => a.at - b.at);
  finishTraining(next, now);
  rollPeriods(next, now, data);
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
  const have = countOfType(s, type);
  let cost: Cost = first.cost;
  if (def.category === 'builder') {
    const i = have - 2;
    const price = data.economy.builderHutCosts[i];
    if (price === undefined || i < 0) return fail('LIMIT_REACHED', 'You have all the Beaver Builders you can hire.');
    cost = { moonstones: price };
  }
  const quote: Quote = { toLevel: 1, cost, seconds: Math.round(first.buildSeconds * buildTimeFactor(s, now, data)) };
  const lim = limitFor(s, data, type);
  if (have >= lim.count) {
    const need = hallLevelRequiredFor(data, type, (l) => l.count > have);
    return need
      ? { ...fail('HALL_LEVEL_TOO_LOW', `Upgrade your Elder Toadstool to level ${need} to build another ${def.name}.`), quote }
      : { ...fail('LIMIT_REACHED', `You have the most ${def.name}s allowed.`), quote };
  }
  if (!canAfford(s.resources, cost)) {
    return cost.moonstones && s.resources.moonstones < cost.moonstones
      ? { ...fail('NOT_ENOUGH_MOONSTONES', `Needs ${cost.moonstones} Moonstones.`), quote }
      : { ...fail('NOT_ENOUGH_RESOURCES', `Not enough resources (needs ${costText(cost)}).`), quote };
  }
  if (quote.seconds > 0 && builderStatus(s, data, now).free < 1) {
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
  if (def.category === 'obstacle' || def.category === 'decor') return fail('MAX_LEVEL', `${def.name} cannot be upgraded.`);
  const next = levelDef(data, b.type, b.level + 1);
  const lim = limitFor(s, data, b.type);
  if (!next || b.level >= maxDefinedLevel(data, b.type) || (def.category === 'hall' && b.level >= lim.maxLevel)) {
    return fail('MAX_LEVEL', `${def.name} is at its highest level.`);
  }
  const quote: Quote = { toLevel: next.level, cost: next.cost, seconds: Math.round(next.buildSeconds * buildTimeFactor(s, now, data)) };
  if (next.level > lim.maxLevel) {
    const need = hallLevelRequiredFor(data, b.type, (l) => l.maxLevel >= next.level);
    return need
      ? { ...fail('HALL_LEVEL_TOO_LOW', `Upgrade your Elder Toadstool to level ${need} first.`), quote }
      : { ...fail('MAX_LEVEL', `${def.name} is at its highest level.`), quote };
  }
  if (!canAfford(s.resources, next.cost)) return { ...fail('NOT_ENOUGH_RESOURCES', `Not enough resources (needs ${costText(next.cost)}).`), quote };
  if (quote.seconds > 0 && builderStatus(s, data, now).free < 1) {
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
  const moonBefore = s.resources.moonstones;
  const r = runCommand(s, cmd, now, data);
  if (!r.ok) return r;
  afterCommand(r.state, r.events, cmd, moonBefore, now, data);
  return r;
}

/** Update counters, note Moonstone spending and raise offer triggers. Mutates. */
function afterCommand(s: VillageState, events: SimEvent[], cmd: Command, moonBefore: number, now: number, data: GameData): void {
  for (const e of [...events]) {
    if (e.kind === 'collect') {
      if (e.resource === 'acorns') s.stats.collectedAcorns += e.amount;
      if (e.resource === 'dew') s.stats.collectedDew += e.amount;
    } else if (e.kind === 'upgrade_start') {
      s.stats.upgradesStarted++;
      if (e.seconds > 3600 && !s.flags.longWaitSeen) {
        s.flags.longWaitSeen = true;
        events.push({ kind: 'trigger', trigger: 'first_long_wait' });
      }
      if (e.seconds > 0 && builderStatus(s, data, now).free === 0) events.push({ kind: 'trigger', trigger: 'all_builders_busy' });
    } else if (e.kind === 'train_start') {
      s.stats.troopsTrained++;
    } else if (e.kind === 'raid_end' && e.record.kind === 'attack') {
      if (e.record.result.stars >= 1) s.stats.raidsWon++;
      s.stats.starsEarned += e.record.result.stars;
    }
  }
  const spent = moonBefore - s.resources.moonstones;
  if (spent > 0 && cmd.type !== 'grantPurchase') {
    s.stats.moonstonesSpent += spent;
    events.push({ kind: 'moonstone_spend', what: cmd.type === 'place' ? cmd.buildingType : cmd.type, moonstones: spent });
  }
}

function runCommand(s: VillageState, cmd: Command, now: number, data: GameData): CommandResult {
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
    case 'skip':
      return skip(s, cmd.id, now, data);
    case 'skipTraining':
      return skipTraining(s, now, data);
    case 'topUp':
      return topUp(s, cmd.cost, data);
    case 'grantPurchase':
      return grantPurchase(s, cmd.productId, cmd.transactionId, now, data);
    case 'setProfile':
      s.profile.under18 = cmd.under18;
      return { ok: true, state: s, events: [] };
    case 'buySkin':
      return buySkin(s, cmd.skin, data);
    case 'equipSkin':
      if (!s.cosmetics.owned.includes(cmd.skin)) return fail('NOT_OWNED', 'You do not own that look yet.');
      s.cosmetics.hallSkin = cmd.skin;
      return { ok: true, state: s, events: [] };
    case 'claimTask':
      return claimTask(s, cmd.id, cmd.kind, data);
    case 'claimTier':
      return claimTier(s, cmd.tier, cmd.track, data);
    case 'claimAchievement':
      return claimAchievement(s, cmd.id, data);
    case 'clear':
      return clearObstacle(s, cmd.id, now, data);
    case 'triggerOffer': {
      const rule = triggerOffer(s, cmd.trigger, now, data);
      if (!rule) return fail('NO_OFFER', 'No offer right now.');
      const active = s.offers.active.find((a) => a.id === rule.id)!;
      return { ok: true, state: s, events: [{ kind: 'offer_shown', offerId: rule.id, expiresAt: active.expiresAt }] };
    }
  }
}

// ---------- Moonstones, purchases and rewards ----------

/** Moonstones to finish a building's timer now. */
export function skipQuote(state: VillageState, id: string, now: number, data: GameData): { seconds: number; moonstones: number } | null {
  const b = state.buildings.find((v) => v.id === id);
  if (!b?.upgrade || b.upgrade.endsAt <= now) return null;
  const seconds = Math.ceil((b.upgrade.endsAt - now) / 1000);
  return { seconds, moonstones: skipCost(seconds, data) };
}

function skip(s: VillageState, id: string, now: number, data: GameData): CommandResult {
  const q = skipQuote(s, id, now, data);
  if (!q) return fail('NOTHING_TO_SKIP', 'Nothing to finish.');
  if (s.resources.moonstones < q.moonstones) return fail('NOT_ENOUGH_MOONSTONES', `Needs ${q.moonstones} Moonstones.`);
  s.resources.moonstones -= q.moonstones;
  const b = s.buildings.find((v) => v.id === id)!;
  const finishedAt = now;
  if (b.collector && b.upgrade) b.collector = { stored: b.collector.stored, accrueFrom: finishedAt };
  b.upgrade!.endsAt = finishedAt;
  const adv = advance(s, now, data).state;
  return { ok: true, state: adv, events: [{ kind: 'skip_used', what: b.type, seconds: q.seconds, moonstones: q.moonstones }] };
}

export function trainingSkipQuote(state: VillageState, now: number, data: GameData): { seconds: number; moonstones: number } | null {
  const last = state.training[state.training.length - 1];
  if (!last || last.endsAt <= now) return null;
  const seconds = Math.ceil((last.endsAt - now) / 1000);
  return { seconds, moonstones: skipCost(seconds, data) };
}

function skipTraining(s: VillageState, now: number, data: GameData): CommandResult {
  const q = trainingSkipQuote(s, now, data);
  if (!q) return fail('NOTHING_TO_SKIP', 'Nothing to finish.');
  if (s.resources.moonstones < q.moonstones) return fail('NOT_ENOUGH_MOONSTONES', `Needs ${q.moonstones} Moonstones.`);
  s.resources.moonstones -= q.moonstones;
  for (const item of s.training) item.endsAt = Math.min(item.endsAt, now);
  finishTraining(s, now);
  return { ok: true, state: s, events: [{ kind: 'skip_used', what: 'training', seconds: q.seconds, moonstones: q.moonstones }] };
}

/** Moonstones to buy exactly the resources missing for `cost` (null if nothing is missing or it would not fit). */
export function topUpQuote(state: VillageState, cost: Cost, data: GameData): { missing: Cost; moonstones: number } | null {
  const missing: Cost = {};
  const cap = capacity(state, data);
  for (const k of RESOURCE_KINDS) {
    if (k === 'moonstones') continue;
    const need = (cost[k] ?? 0) - state.resources[k];
    if (need > 0) {
      if ((cost[k] ?? 0) > cap[k]) return null;
      missing[k] = need;
    }
  }
  if (!Object.keys(missing).length) return null;
  return { missing, moonstones: topUpCost(missing, data) };
}

function topUp(s: VillageState, cost: Cost, data: GameData): CommandResult {
  const q = topUpQuote(s, cost, data);
  if (!q) return fail('NOTHING_TO_SKIP', 'Nothing missing, or it would not fit in your storage.');
  if (s.resources.moonstones < q.moonstones) return fail('NOT_ENOUGH_MOONSTONES', `Needs ${q.moonstones} Moonstones.`);
  s.resources.moonstones -= q.moonstones;
  for (const [k, v] of Object.entries(q.missing) as [ResourceKind, number][]) s.resources[k] += v;
  return { ok: true, state: s, events: [] };
}

function grantPurchase(s: VillageState, productId: string, transactionId: string, now: number, data: GameData): CommandResult {
  if (s.purchases.some((p) => p.id === transactionId)) return fail('ALREADY_CLAIMED', 'This purchase was already delivered.');
  const check = canPurchase(s, productId, now, data);
  if (!check.ok) return fail('PURCHASE_REFUSED', check.message);
  const product = productInfo(data, productId)!;
  s.purchases.push({ id: transactionId, productId, usd: product.usd, at: now });
  const grants = { ...product.grants };
  if (product.kind === 'pass') {
    s.pass.premium = true;
    s.pass.season = passSeason(now, data);
  }
  if (product.kind === 'offer') {
    const rule = data.offers.rules.find((o) => o.productId === productId)!;
    s.offers.bought.push(rule.id);
    s.offers.active = s.offers.active.filter((a) => a.id !== rule.id);
  }
  // Bought resources are always delivered in full, even beyond storage.
  for (const [k, v] of Object.entries(grants) as [ResourceKind, number][]) s.resources[k] += v;
  return { ok: true, state: s, events: [{ kind: 'purchase_granted', productId, usd: product.usd, grants }] };
}

function buySkin(s: VillageState, id: string, data: GameData): CommandResult {
  const skin = data.cosmetics.hallSkins.find((k) => k.id === id);
  if (!skin) return fail('NOT_FOUND', 'Unknown look.');
  if (s.cosmetics.owned.includes(id)) return fail('ALREADY_CLAIMED', 'You already own this look.');
  if (skin.passOnly) return fail('LOCKED', 'This look comes from the Lantern Pass.');
  if (s.resources.moonstones < skin.moonstones) return fail('NOT_ENOUGH_MOONSTONES', `Needs ${skin.moonstones} Moonstones.`);
  s.resources.moonstones -= skin.moonstones;
  s.cosmetics.owned.push(id);
  s.cosmetics.hallSkin = id;
  return { ok: true, state: s, events: [] };
}

/** Grant a reward bundle (resources capped by storage, Moonstones and skins in full). Mutates. */
function grantReward(s: VillageState, reward: Cost & { skin?: string }, data: GameData): Cost {
  const { skin, ...res } = reward;
  if (skin && !s.cosmetics.owned.includes(skin)) s.cosmetics.owned.push(skin);
  const soft: Cost = {};
  for (const [k, v] of Object.entries(res) as [ResourceKind, number][]) {
    if (k === 'moonstones') s.resources.moonstones += v;
    else soft[k] = v;
  }
  addCapped(s.resources, soft, capacity(s, data));
  return res;
}

function claimTask(s: VillageState, id: string, kind: 'daily' | 'weekly', data: GameData): CommandResult {
  const task = currentTasks(s, hallLevel(s, data), data).find((t) => t.id === id && t.kind === kind);
  if (!task) return fail('NOT_FOUND', 'No such task today.');
  if (task.claimed) return fail('ALREADY_CLAIMED', 'Already claimed.');
  if (task.progress < task.target) return fail('NOT_READY', 'Not finished yet.');
  (kind === 'daily' ? s.tasks.dayClaimed : s.tasks.weekClaimed).push(id);
  s.pass.points += task.points;
  return { ok: true, state: s, events: [{ kind: 'reward', source: `task:${id}`, grants: {} }] };
}

function claimTier(s: VillageState, tier: number, track: 'free' | 'premium', data: GameData): CommandResult {
  const def = data.pass.tiers.find((t) => t.tier === tier);
  if (!def) return fail('NOT_FOUND', 'No such tier.');
  if (tier > unlockedTier(s, data)) return fail('NOT_READY', 'Earn more pass points first.');
  if (track === 'premium' && !s.pass.premium) return fail('LOCKED', 'Premium rewards need the premium Lantern Pass.');
  const list = track === 'free' ? s.pass.claimedFree : s.pass.claimedPremium;
  if (list.includes(tier)) return fail('ALREADY_CLAIMED', 'Already claimed.');
  list.push(tier);
  const grants = grantReward(s, track === 'free' ? def.free : def.premium, data);
  return { ok: true, state: s, events: [{ kind: 'reward', source: `pass:${track}:${tier}`, grants }] };
}

function claimAchievement(s: VillageState, id: string, data: GameData): CommandResult {
  const view = achievementViews(s, hallLevel(s, data), data).find((v) => v.def.id === id);
  if (!view) return fail('NOT_FOUND', 'Unknown achievement.');
  if (!view.next) return fail('ALREADY_CLAIMED', 'All tiers claimed.');
  if (!view.claimable) return fail('NOT_READY', 'Not finished yet.');
  s.achievements[id] = view.claimed + 1;
  s.resources.moonstones += view.next.reward;
  return { ok: true, state: s, events: [{ kind: 'reward', source: `achievement:${id}`, grants: { moonstones: view.next.reward } }] };
}

function clearObstacle(s: VillageState, id: string, now: number, data: GameData): CommandResult {
  const b = s.buildings.find((v) => v.id === id);
  if (!b) return fail('NOT_FOUND', 'Not found.');
  const def = buildingDef(data, b.type);
  if (def.category !== 'obstacle' || !def.clear) return fail('NOT_AVAILABLE', 'That cannot be cleared.');
  if (b.upgrade) return fail('BUSY', 'Already being cleared.');
  if (!canAfford(s.resources, def.clear.cost)) return fail('NOT_ENOUGH_RESOURCES', `Not enough resources (needs ${costText(def.clear.cost)}).`);
  if (builderStatus(s, data, now).free < 1) return fail('NO_FREE_BUILDER', 'All your Beaver Builders are busy.');
  subtractCost(s.resources, def.clear.cost);
  b.upgrade = { toLevel: 0, startedAt: now, endsAt: now + def.clear.seconds * MS_PER_SECOND, cost: def.clear.cost };
  return { ok: true, state: s, events: [{ kind: 'clear_start', buildingType: b.type, id, seconds: def.clear.seconds }] };
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
  const opp = rec.setup.base.trophies ?? s.trophies;
  const trophies = result.stars >= 1 ? winTrophies(s.trophies, opp, data) : -lossTrophies(s.trophies, opp, data);
  s.trophies = Math.max(0, s.trophies + trophies);
  // Attacking ends your shield.
  s.shieldUntil = Math.min(s.shieldUntil, now);
  const record: BattleRecord = { ...rec, id: `r${s.nextSeed++}`, kind: 'attack', at: rec.at ?? now, result: { ...result, loot: { ...result.loot } }, trophies };
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
  if (toLevel === 0) {
    b.upgrade = null;
  } else if (b.level < 1) {
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
