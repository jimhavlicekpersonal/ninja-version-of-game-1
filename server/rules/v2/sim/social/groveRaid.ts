/**
 * Weekly Grove Raid: a 2-day event against a bot Grove. Every member gets 2
 * attacks; the best stars on each enemy base add up, and the side with more
 * stars wins a shared reward chest (fixed contents).
 */
import { generateOpponent } from '../battle/basegen';
import type { BaseLayout } from '../battle/types';
import { scaleReward } from '../economy';
import { addCapped, capacity } from '../resources';
import { createRng, int, mixSeed, next, pick } from '../rng';
import type { Cost, GameData, GroveRaidState, ResourceKind, VillageState } from '../types';
import { generateGrove, type Grove } from './grove';

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

export function raidWeek(t: number, data: GameData): number {
  return Math.floor((t - data.social.groveRaid.epoch) / WEEK);
}

export function raidWindow(week: number, data: GameData): { start: number; end: number } {
  const start = data.social.groveRaid.epoch + week * WEEK;
  return { start, end: start + data.social.groveRaid.durationHours * HOUR };
}

export type RaidPhase = 'upcoming' | 'live' | 'ended';

export function raidPhase(t: number, data: GameData): { phase: RaidPhase; week: number; start: number; end: number; nextStart: number } {
  const week = raidWeek(t, data);
  const w = raidWindow(week, data);
  const nextStart = raidWindow(week + 1, data).start;
  if (t < w.start) return { phase: 'upcoming', week, ...w, nextStart: w.start };
  if (t < w.end) return { phase: 'live', week, ...w, nextStart };
  return { phase: 'ended', week, ...w, nextStart };
}

/** The Grove Raid chest for an outcome at the player's hall level (resources scale with the hall). */
export function groveRaidChest(outcome: 'win' | 'draw' | 'loss', hall: number, data: GameData): Cost & { xp: number } {
  const { xp, ...base } = data.social.groveRaid.rewards[outcome];
  return { ...scaleReward(base, hall, data), xp };
}

export interface EnemyGrove {
  name: string;
  members: string[];
  bases: BaseLayout[];
}

function sideSize(grove: Grove): number {
  return grove.members.length + 1; // bots + the player
}

/** The enemy Grove for a week, sized to match the player's Grove. */
export function enemyGrove(groveSeed: number, week: number, hall: number, data: GameData): EnemyGrove {
  const own = generateGrove(groveSeed, data);
  const rng = createRng(mixSeed(groveSeed, 0xe0e0 + week));
  const name = `${pick(rng, data.social.groveNames.first)} ${pick(rng, data.social.groveNames.second)}`;
  const n = sideSize(own);
  const members: string[] = [];
  const bases: BaseLayout[] = [];
  for (let i = 0; i < n; i++) {
    const memberName = `${pick(rng, data.names.playerFirst)} ${pick(rng, data.names.playerSecond)}`;
    const hl = Math.max(1, Math.min(data.hall.levels.length, hall + int(rng, -1, 1)));
    const base = generateOpponent(mixSeed(groveSeed, week * 100 + i), hl, data);
    base.name = memberName;
    for (const b of base.buildings) b.loot = {};
    members.push(memberName);
    bases.push(base);
  }
  return { name, members, bases };
}

interface BotAttack {
  at: number;
  side: 'ours' | 'theirs';
  attacker: number;
  target: number;
  stars: number;
}

function starsFor(rng: ReturnType<typeof createRng>, hallDiff: number, data: GameData): number {
  const o = data.social.groveRaid.starOdds;
  const p3 = Math.max(0.02, Math.min(0.9, o.base3 + hallDiff * o.perHallDiff));
  const p2 = o.base2;
  const p1 = o.base1;
  const r = next(rng);
  if (r < p3) return 3;
  if (r < p3 + p2) return 2;
  if (r < p3 + p2 + p1) return 1;
  return 0;
}

/** Every bot attack of the week (both sides), at fixed times during the event. */
export function botAttacks(groveSeed: number, week: number, hall: number, data: GameData): BotAttack[] {
  const own = generateGrove(groveSeed, data);
  const n = sideSize(own);
  const { start } = raidWindow(week, data);
  const dur = data.social.groveRaid.durationHours * HOUR;
  const rng = createRng(mixSeed(groveSeed, 0xa77ac + week));
  const out: BotAttack[] = [];
  const per = data.social.groveRaid.attacksPerMember;
  // Our bots are members 0..n-2 (the player is index n-1 and attacks for real).
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < per; k++) {
      out.push({ at: start + Math.floor(next(rng) * dur), side: 'ours', attacker: i, target: int(rng, 0, n - 1), stars: starsFor(rng, own.members[i].hallOffset - int(rng, -1, 1), data) });
    }
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < per; k++) {
      out.push({ at: start + Math.floor(next(rng) * dur), side: 'theirs', attacker: i, target: int(rng, 0, n - 1), stars: starsFor(rng, int(rng, -1, 1) - 0, data) });
    }
  }
  void hall;
  return out.sort((a, b) => a.at - b.at);
}

export interface RaidScore {
  ours: number;
  theirs: number;
  /** Best stars so far on each enemy base (ours) and on each of our bases (theirs). */
  enemyBaseStars: number[];
  ourBaseStars: number[];
}

/** Live score at time `t`, including the player's real attacks. */
export function raidScore(state: VillageState, week: number, t: number, hall: number, data: GameData): RaidScore {
  const own = generateGrove(state.grove.seed, data);
  const n = sideSize(own);
  const enemyBaseStars = new Array(n).fill(0);
  const ourBaseStars = new Array(n).fill(0);
  for (const a of botAttacks(state.grove.seed, week, hall, data)) {
    if (a.at > t) break;
    if (a.side === 'ours') enemyBaseStars[a.target] = Math.max(enemyBaseStars[a.target], a.stars);
    else ourBaseStars[a.target] = Math.max(ourBaseStars[a.target], a.stars);
  }
  const raid = state.grove.raid;
  if (raid && raid.week === week) for (const a of raid.attacks) if (a.at <= t) enemyBaseStars[a.target] = Math.max(enemyBaseStars[a.target], a.stars);
  const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  return { ours: sum(enemyBaseStars), theirs: sum(ourBaseStars), enemyBaseStars, ourBaseStars };
}

export function attacksLeft(state: VillageState, week: number, data: GameData): number {
  const raid = state.grove.raid;
  const used = raid && raid.week === week ? raid.attacks.length : 0;
  return Math.max(0, data.social.groveRaid.attacksPerMember - used);
}

/** Make sure there is a raid record for the current week (once the player is in a Grove). Mutates. */
export function ensureRaid(state: VillageState, t: number, data: GameData): GroveRaidState | null {
  if (!state.grove.joined) return null;
  const week = raidWeek(t, data);
  if (!state.grove.raid || state.grove.raid.week !== week) {
    state.grove.raid = { week, attacks: [], paidOut: false, result: null };
  }
  return state.grove.raid;
}

/**
 * Pay out any Grove Raid that has ended (exactly once). Mutates. Returns the
 * rewards paid, if any.
 */
export function settleRaids(state: VillageState, now: number, hall: number, data: GameData): { week: number; outcome: 'win' | 'draw' | 'loss'; reward: Cost }[] {
  const g = state.grove;
  const paid: { week: number; outcome: 'win' | 'draw' | 'loss'; reward: Cost }[] = [];
  if (!g.joined) return paid;
  for (let week = g.settledWeek + 1; raidWindow(week, data).end <= now; week++) {
    const { end } = raidWindow(week, data);
    const raid: GroveRaidState = g.raid && g.raid.week === week ? g.raid : { week, attacks: [], paidOut: false, result: null };
    const score = raidScore(state, week, end, hall, data);
    const outcome = score.ours > score.theirs ? 'win' : score.ours < score.theirs ? 'loss' : 'draw';
    const { xp, ...base } = data.social.groveRaid.rewards[outcome];
    const chest = scaleReward(base, hall, data);
    const soft: Cost = {};
    for (const [k, v] of Object.entries(chest) as [ResourceKind, number][]) {
      if (k === 'moonstones') state.resources.moonstones += v;
      else soft[k] = v;
    }
    addCapped(state.resources, soft, capacity(state, data));
    g.xp += xp;
    raid.paidOut = true;
    raid.result = { ours: score.ours, theirs: score.theirs, outcome };
    if (g.raid && g.raid.week === week) g.raid = raid;
    g.raidHistory.push({ week, ours: score.ours, theirs: score.theirs, outcome, reward: { ...chest } });
    while (g.raidHistory.length > 8) g.raidHistory.shift();
    g.settledWeek = week;
    paid.push({ week, outcome, reward: chest });
  }
  return paid;
}
