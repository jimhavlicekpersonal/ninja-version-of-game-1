/**
 * The next objective (state-of-the-game report, section 5 step 8, growth 7): one thing worth doing now,
 * shown as a chip on the village screen. Pure; the HUD turns it into words and a tap.
 *
 * In order: a free chest waiting, a full army (raid), a free builder with an upgrade the village can pay
 * for (the Keep first when it is affordable, else the cheapest), a free research lane with research the
 * village can pay for, camps with room and nothing training (train), the shortfall for the cheapest
 * upgrade when nothing is affordable, or when the next builder is free. Never an offer, never anything
 * paid. (Research and army goals: growth 7 follow-up, game-theory batch 2026-11-13.)
 */
import { armyHousing, housingCapacity, queueHousing } from './army';
import { chestReady } from './daily';
import { calendarView } from './calendar';
import { buildingDef, levelDef, maxDefinedLevel } from './data';
import { attackerStrength } from './matchmaking';
import { canAfford, capacity, missingFor } from './resources';
import type { Building, Cost, GameData, VillageState } from './types';
import { researchLanes } from './research';
import { breachSide } from './defenseReport';
import { achievementViews } from './achievements';
import { drillArmy, drillAvailable } from './drill';
import { goalEventViews } from './goalEvents';
import { currentTasks, unlockedTier } from './pass';
import { rematchable } from './rematch';
import { sealProgress } from './seals';
import { attemptTier, trialInfo } from './trials';
import { builderStatus, hallLevel, onGarrisonCrew, lastAttackArmy, limitFor, researchStartQuoteOn, trainQuoteOn } from './village';

export type Objective =
  | { kind: 'chest' }
  | { kind: 'raid' }
  | { kind: 'upgrade'; buildingId: string; type: string; toLevel: number; keep: boolean }
  | { kind: 'save'; buildingId: string; type: string; toLevel: number; missing: Cost }
  | { kind: 'research'; troop: string; toLevel: number; lanesFree: number }
  | { kind: 'train'; space: number; troop: string }
  | { kind: 'builders'; freeAt: number }
  /** P6-05: something already earned waits for a tap (a task or Scroll tier, an achievement, the Keep's seal). */
  | { kind: 'claim'; what: 'pass' | 'achievement' | 'seal' }
  /** P6-05: an open settle-the-score rematch, with a full army. */
  | { kind: 'rematch'; defenseId: string }
  /** P6-05: a running Bounty, Gauntlet or festival with an unpaid step, with a full army. */
  | { kind: 'goalEvent'; eventKey: string; goal: string }
  /** P6-05: the next Trial tier, when its fortress is at or below the Keep. */
  | { kind: 'trial'; tier: number }
  /** P6-05: the daily drill is open. */
  | { kind: 'drill' }
  /** P6-03: the side the latest raid that earned a star came in through (a free suggestion). */
  | { kind: 'defendSide'; point: string }
  | { kind: 'none' };

interface Candidate {
  b: Building;
  toLevel: number;
  cost: Cost;
  total: number;
}

/** Buildings whose next level the Keep allows now (not hedges (walls), obstacles or decor; not being worked on). */
function candidates(state: VillageState, data: GameData): Candidate[] {
  const out: Candidate[] = [];
  for (const b of state.buildings) {
    const def = buildingDef(data, b.type);
    if (!def || b.upgrade || def.category === 'obstacle' || def.category === 'decor' || def.category === 'hedge') continue;
    const next = levelDef(data, b.type, b.level + 1);
    if (!next || b.level >= maxDefinedLevel(data, b.type)) continue;
    if (next.level > limitFor(state, data, b.type).maxLevel) continue;
    const total = Object.entries(next.cost).reduce((sum, [k, v]) => sum + (k === 'moonstones' ? 1e12 : v ?? 0), 0);
    out.push({ b, toLevel: next.level, cost: next.cost, total });
  }
  return out.sort((a, c) => a.total - c.total || a.b.id.localeCompare(c.b.id));
}

/** Warriors the village fights with (ready, training, or the last attack), else every warrior it can train. */
function ownTroops(state: VillageState, data: GameData): string[] {
  const mine = new Set<string>([...Object.keys(state.army), ...state.training.map((q) => q.troop), ...Object.keys(lastAttackArmy(state) ?? {})]);
  return (mine.size ? [...mine] : Object.keys(data.troops)).filter((t) => data.troops[t]);
}

/** The cheapest research the village can start now among its own warriors (a free lane and enough resources). */
function researchGoal(state: VillageState, now: number, data: GameData): Objective | null {
  const free = researchLanes(hallLevel(state, data), data) - state.research.active.length;
  if (free <= 0) return null;
  let best: { troop: string; toLevel: number; total: number } | null = null;
  for (const troop of ownTroops(state, data)) {
    const q = researchStartQuoteOn(state, troop, now, data);
    if (!q.ok) continue;
    const total = Object.values(q.quote.cost).reduce((a, b) => a + (b ?? 0), 0);
    if (!best || total < best.total || (total === best.total && troop < best.troop)) best = { troop, toLevel: q.quote.toLevel, total };
  }
  return best ? { kind: 'research', troop: best.troop, toLevel: best.toLevel, lanesFree: free } : null;
}

/** Camps with room and nothing in training: train (a warrior the village fights with that it can pay for now). */
function trainGoal(state: VillageState, now: number, data: GameData): Objective | null {
  const cap = housingCapacity(state, data);
  const space = cap - armyHousing(state.army, data) - queueHousing(state.training, data);
  if (cap <= 0 || space <= 0 || state.training.length) return null;
  const troop = ownTroops(state, data).find((t) => trainQuoteOn(state, t, now, data).ok);
  return troop ? { kind: 'train', space, troop } : null;
}

/**
 * P3-09 (ECO-10, E06): the army's strength is more than one Keep behind the village (a rushed Keep meets stronger
 * bases and raiders). The objective then prefers research or training to the Keep, and the Keep's sheet says so.
 */
export function armyBehindKeep(state: VillageState, data: GameData): boolean {
  return attackerStrength(state, data) < hallLevel(state, data) - 1;
}

/** P3-11 (PLY-04): Coins or Provisions at 90% of storage or more. */
function storageNearlyFull(state: VillageState, data: GameData): boolean {
  const cap = capacity(state, data);
  return (['acorns', 'dew'] as const).some((k) => cap[k] > 0 && state.resources[k] >= 0.9 * cap[k]);
}

/** The one thing to do next. `state` should be settled up to `now` (`advance`). */
export function nextObjective(state: VillageState, now: number, data: GameData): Objective {
  const list = candidates(state, data);
  const builders = builderStatus(state, data, now);
  // P3-11: storage nearly full, so an affordable Keep or storage upgrade comes before the chest (whose contents
  // would not fit) and before a raid (whose loot would not).
  const behind = armyBehindKeep(state, data);
  if (builders.free > 0 && storageNearlyFull(state, data)) {
    // (P3-09: not the Keep while the army is behind it: a storage then.)
    const room = list.filter((c) => canAfford(state.resources, c.cost) && (behind ? ['storage'] : ['hall', 'storage']).includes(buildingDef(data, c.b.type).category));
    const pick = room.find((c) => buildingDef(data, c.b.type).category === 'hall') ?? room[0];
    if (pick) return { kind: 'upgrade', buildingId: pick.b.id, type: pick.b.type, toLevel: pick.toLevel, keep: buildingDef(data, pick.b.type).category === 'hall' };
  }
  if (chestReady(state, now, data) || calendarView(state, now, 1, data)?.ready) return { kind: 'chest' };
  const claim = claimWaiting(state, data);
  if (claim) return claim;
  const cap = housingCapacity(state, data);
  if (cap > 0 && armyHousing(state.army, data) >= cap) {
    // P6-05: a full army also opens what pays without loot risk: a rematch, a goal event step.
    const rematch = rematchable(state, now, data)[0];
    if (rematch) return { kind: 'rematch', defenseId: rematch.id };
    const ev = goalEventViews(state, now, data).find((v) => v.ladder.some((l) => !l.paid));
    if (ev) return { kind: 'goalEvent', eventKey: ev.event.key, goal: ev.event.goal.kind };
    return { kind: 'raid' };
  }
  // P3-09: a Keep rushed ahead of its army: research or train first (the choice stays the player's).
  if (behind) {
    const army = researchGoal(state, now, data) ?? trainGoal(state, now, data);
    if (army) return army;
  }
  if (builders.free > 0) {
    // P3-09: while the army is behind, the chip does not suggest the Keep (the player still can).
    const affordable = list.filter((c) => canAfford(state.resources, c.cost) && !(behind && buildingDef(data, c.b.type).category === 'hall'));
    const keep = affordable.find((c) => buildingDef(data, c.b.type).category === 'hall');
    const pick = keep ?? affordable[0];
    if (pick) return { kind: 'upgrade', buildingId: pick.b.id, type: pick.b.type, toLevel: pick.toLevel, keep: Boolean(keep) };
    const army = researchGoal(state, now, data) ?? trainGoal(state, now, data);
    if (army) return army;
    const cheapest = list.find((c) => !c.cost.moonstones);
    if (cheapest) return { kind: 'save', buildingId: cheapest.b.id, type: cheapest.b.type, toLevel: cheapest.toLevel, missing: missingFor(state.resources, cheapest.cost) };
  } else {
    // P2-14: every artisan is busy, but the garrison crew may still take a defense, trap or support build.
    const crew = list.find((c) => onGarrisonCrew(c.b.type, data) && canAfford(state.resources, c.cost) && builderStatus(state, data, now, c.b.type).free > 0);
    if (crew) return { kind: 'upgrade', buildingId: crew.b.id, type: crew.b.type, toLevel: crew.toLevel, keep: false };
    const army = researchGoal(state, now, data) ?? trainGoal(state, now, data);
    if (army) return army;
    const free = freeToPlay(state, now, data);
    if (free) return free;
    const side = breachSide(state.defenseLog, now, data);
    if (side) return { kind: 'defendSide', point: side };
    const ends = state.buildings.map((b) => b.upgrade?.endsAt ?? Infinity).filter((t) => t > now);
    if (ends.length) return { kind: 'builders', freeAt: Math.min(...ends) };
  }
  const free = freeToPlay(state, now, data);
  if (free) return free;
  const side = breachSide(state.defenseLog, now, data);
  if (side) return { kind: 'defendSide', point: side };
  return { kind: 'none' };
}

/** P6-05: an earned reward waiting for a tap: a finished task or an unlocked Scroll tier, an achievement, the seal. */
function claimWaiting(state: VillageState, data: GameData): Objective | null {
  const keep = hallLevel(state, data);
  const task = currentTasks(state, keep, data).some((t) => !t.claimed && t.progress >= t.target);
  const tiers = unlockedTier(state, data);
  const tier = data.pass.tiers.some((t) => t.tier <= tiers && !state.pass.claimedFree.includes(t.tier));
  if (task || tier) return { kind: 'claim', what: 'pass' };
  if (achievementViews(state, keep, data).some((a) => a.claimable)) return { kind: 'claim', what: 'achievement' };
  if (sealProgress(state, data)?.ready) return { kind: 'claim', what: 'seal' };
  return null;
}

/** P6-05: what needs no standing army: the daily drill; the next Trial tier when its fortress is at or below the Keep. */
function freeToPlay(state: VillageState, now: number, data: GameData): Objective | null {
  if (data.daily.drill && Object.keys(drillArmy(state, data)).length && drillAvailable(state, now, data)) return { kind: 'drill' };
  const keep = hallLevel(state, data);
  const tier = attemptTier(state.trials, keep, data);
  if (housingCapacity(state, data) > 0 && trialInfo(tier, data).hall <= keep) return { kind: 'trial', tier };
  return null;
}
