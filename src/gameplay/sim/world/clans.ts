/**
 * Persistent AI clans, simulated event by event instead of continuously.
 *
 * Each clan stores a small state (strength, status, timers). Nothing runs in
 * the background: when the player interacts, `advanceClans` replays the fixed
 * steps (every `stepHours`, counted from the Unix epoch) that passed since the
 * last interaction. Every step's dice come from the world seed and the step
 * number, so the outcome does not depend on how often the player looks.
 *
 * Progression bands keep the world fair: a clan lives inside its own Keep
 * range and never rises above the player's Keep + `bands.above`, so it can't
 * become unbeatable because the player stopped playing.
 */
import { createRng, hashId, int, mixSeed, next, type Rng } from '../rng';
import type { ClanDef, ClanState, GameData, WorldNews, WorldState } from '../types';
import { clanDef } from './villagegen';
import { refillTreasury, startTreasury } from './treasury';

const HOUR = 3_600_000;

export function stepMs(data: GameData): number {
  return data.clans.sim.stepHours * HOUR;
}

/** Strength range a clan lives in: [lowest Keep - 1, highest Keep). */
export function clanRange(def: ClanDef): { lo: number; hi: number } {
  return { lo: def.halls[0] - 1, hi: def.halls[1] - 1e-6 };
}

/** Highest strength a clan may reach while the player is at `playerHall`. */
export function clanCap(def: ClanDef, playerHall: number, data: GameData): number {
  const { lo, hi } = clanRange(def);
  return Math.max(lo, Math.min(hi, playerHall + data.clans.bands.above - 1e-6));
}

export function newClanState(def: ClanDef, seed: number, now: number, playerHall: number, data: GameData): ClanState {
  const rng = createRng(mixSeed(seed, hashId(def.id)));
  const { lo } = clanRange(def);
  const strength = Math.min(clanCap(def, playerHall, data), lo + next(rng) * data.clans.sim.startSpread);
  return {
    id: def.id,
    strength,
    status: 'stable',
    simulatedAt: Math.floor(now / stepMs(data)) * stepMs(data),
    rebuildUntil: 0,
    resources: startTreasury(strength, data),
    retaliateAt: 0,
    defeats: 0,
    victories: 0,
  };
}

export { hashId };

export function pushNews(world: WorldState, news: WorldNews, data: GameData): void {
  world.news.push(news);
  world.news.sort((a, b) => a.at - b.at);
  while (world.news.length > data.clans.sim.maxNews) world.news.shift();
}

/** Called for every clan step so the world map can react (expansion, reclaiming). */
export type StepHook = (clan: ClanState, def: ClanDef, at: number, rng: Rng) => void;

/**
 * Replay every clan step between the last interaction and `now`. Mutates.
 * At most `maxStepsPerCatchUp` steps are replayed; older ones are skipped
 * (the clans simply held still while nobody looked).
 */
export function advanceClans(world: WorldState, now: number, playerHall: number, data: GameData, hook?: StepHook): void {
  const ms = stepMs(data);
  const cfg = data.clans.sim;
  const defs = data.clans.clans;
  let from = Number.POSITIVE_INFINITY;
  for (const def of defs) from = Math.min(from, world.clans[def.id]?.simulatedAt ?? now);
  const lastStep = Math.floor(now / ms);
  let firstStep = Math.floor(from / ms) + 1;
  if (lastStep - firstStep + 1 > cfg.maxStepsPerCatchUp) firstStep = lastStep - cfg.maxStepsPerCatchUp + 1;
  for (let k = firstStep; k <= lastStep; k++) {
    const at = k * ms;
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      const clan = world.clans[def.id];
      if (!clan || clan.simulatedAt >= at) continue;
      const rng = createRng(mixSeed(mixSeed(world.seed, hashId(def.id)), k));
      stepClan(world, clan, def, at, playerHall, rng, data);
      hook?.(clan, def, at, rng);
      clan.simulatedAt = at;
    }
  }
  for (const def of defs) {
    const clan = world.clans[def.id];
    if (clan) clan.simulatedAt = Math.max(clan.simulatedAt, lastStep * ms);
  }
}

function stepClan(world: WorldState, clan: ClanState, def: ClanDef, at: number, playerHall: number, rng: Rng, data: GameData): void {
  const cfg = data.clans.sim;
  if (clan.status === 'rebuilding' && at >= clan.rebuildUntil) {
    clan.status = 'stable';
    pushNews(world, { at: clan.rebuildUntil, kind: 'rebuild', text: `${def.name} has rebuilt its defenses.` }, data);
  }
  // A planned retaliation that never found the village (game open or shielded) is called off.
  if (clan.retaliateAt && at > clan.retaliateAt + cfg.retaliationWindowHours * HOUR) clan.retaliateAt = 0;
  const cap = clanCap(def, playerHall, data);
  if (clan.status !== 'rebuilding' && clan.strength < cap) {
    const before = Math.floor(clan.strength);
    clan.strength = Math.min(cap, clan.strength + cfg.growthPerStep);
    if (Math.floor(clan.strength) > before) pushNews(world, { at, kind: 'grow', text: `${def.name} upgraded its Clan Keep to level ${Math.floor(clan.strength) + 1}.` }, data);
  }
  // Never above the band, even if the player's Keep was lower when it grew.
  if (clan.strength > cap) clan.strength = cap;
  refillTreasury(clan, data);
  clan.status = clan.status === 'rebuilding' ? 'rebuilding' : next(rng) < cfg.expandChance * def.aggression ? 'expanding' : 'stable';
}

/**
 * The player beat one of the clan's villages: it loses strength, rebuilds for
 * a while, and (depending on its aggression) plans a retaliation raid. Mutates.
 */
export function defeatClan(world: WorldState, clanId: string, now: number, data: GameData): { revenge: boolean } {
  const clan = world.clans[clanId];
  if (!clan) return { revenge: false };
  const def = clanDef(data, clanId);
  const cfg = data.clans.sim;
  const rng = createRng(mixSeed(mixSeed(world.seed, hashId(clanId)), Math.floor(now / 1000) ^ 0x7e7e));
  clan.defeats++;
  clan.strength = Math.max(clanRange(def).lo, clan.strength - cfg.defeatStrengthLoss);
  clan.status = 'rebuilding';
  clan.rebuildUntil = now + cfg.rebuildHours * HOUR;
  let revenge = false;
  if (!clan.retaliateAt && next(rng) < def.aggression) {
    const [a, b] = cfg.retaliationDelayHours;
    clan.retaliateAt = now + int(rng, a, b) * HOUR;
    revenge = true;
  }
  pushNews(world, { at: now, kind: 'retaliation', text: revenge ? `${def.name} is rebuilding, and swears revenge.` : `${def.name} is rebuilding.` }, data);
  return { revenge };
}

/** The clan whose retaliation window covers `t`, if any. */
export function retaliatingClan(world: WorldState, t: number, data: GameData): string | null {
  const w = data.clans.sim.retaliationWindowHours * HOUR;
  for (const def of data.clans.clans) {
    const c = world.clans[def.id];
    if (c?.retaliateAt && t >= c.retaliateAt && t < c.retaliateAt + w) return def.id;
  }
  return null;
}

/**
 * A clan for a strength when there is no world state (server, bot raids):
 * one of the clans whose Keep range covers it, picked by `pick` in [0, 1).
 */
export function clanForStrength(strength: number, data: GameData, pick: number): string {
  const top = data.hall.levels.length;
  const s = Math.max(0, Math.min(top - 1e-6, strength));
  const fits = data.clans.clans.filter((c) => s >= c.halls[0] - 1 && s < c.halls[1]);
  const list = fits.length ? fits : data.clans.clans;
  return list[Math.min(list.length - 1, Math.floor(pick * list.length))].id;
}

/** The clan in the world whose current strength is closest to `strength` (ties: first in data order). */
export function nearestClan(world: WorldState, strength: number, data: GameData, exclude: string[] = []): string | null {
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const def of data.clans.clans) {
    const c = world.clans[def.id];
    if (!c || exclude.includes(def.id)) continue;
    const d = Math.abs(c.strength - strength);
    if (d < bestD) {
      best = def.id;
      bestD = d;
    }
  }
  return best;
}
