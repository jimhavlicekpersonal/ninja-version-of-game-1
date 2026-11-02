/**
 * The living world map: provinces of settlements, all AI-held at the start.
 *
 * Each province is the home of one clan and holds a Shrine (pays tribute
 * once a day while you hold it), Villages and a Fortress. A settlement is a
 * persistent AI village: win with `conquestStars` to take it. Clans that are
 * expanding take settlements from their rival, and retake their own
 * settlements from the player after a while. Settlement battles pay normal
 * loot but never Honor (trophies), so the map can't be used to farm rank.
 */
import type { BaseLayout } from '../battle/types';
import { applyLootPenalty } from '../matchmaking';
import { createRng, mixSeed, next, pick, type Rng } from '../rng';
import type { ClanDef, ClanState, Cost, GameData, SettlementState, VillageState, WorldState, WorldTarget } from '../types';
import { hashId, pushNews } from './clans';
import { clanDef, clanVillage } from './villagegen';

const HOUR = 3_600_000;

export function initialSettlements(seed: number, now: number, data: GameData): SettlementState[] {
  const rng = createRng(mixSeed(seed, 0x7e221));
  const used = new Set<string>();
  const out: SettlementState[] = [];
  for (const p of data.world.provinces) {
    for (const k of data.world.settlementKinds) {
      for (let i = 0; i < k.count; i++) {
        let name = '';
        for (let tries = 0; tries < 30; tries++) {
          name = `${pick(rng, data.names.placeFirst)} ${pick(rng, data.names.placeSecond)}`;
          if (!used.has(name)) break;
        }
        used.add(name);
        out.push({ id: `${p.id}:${k.id}${i + 1}`, province: p.id, kind: k.id, name, owner: p.clan, since: now, variant: 0 });
      }
    }
  }
  return out;
}

export function settlementKind(data: GameData, id: string) {
  const k = data.world.settlementKinds.find((x) => x.id === id);
  if (!k) throw new Error(`Unknown settlement kind: ${id}`);
  return k;
}

export function provinceOf(data: GameData, id: string) {
  const p = data.world.provinces.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown province: ${id}`);
  return p;
}

/** Strength of an AI settlement: its clan's strength plus the kind's offset, never above the player's band. */
export function settlementStrength(s: SettlementState, world: WorldState, playerHall: number, data: GameData): number {
  const clan = world.clans[s.owner];
  const top = data.hall.levels.length;
  const base = clan ? clan.strength : 0;
  const max = Math.min(top, playerHall + data.clans.bands.above) - 1e-6;
  return Math.max(0, Math.min(max, base + settlementKind(data, s.kind).strength));
}

/** Freeze a settlement for an attack, so the battle is rebuilt exactly as scouted. */
export function targetFor(s: SettlementState, world: WorldState, playerHall: number, data: GameData): WorldTarget {
  return { settlement: s.id, owner: s.owner, strength: settlementStrength(s, world, playerHall, data), variant: s.variant, playerHall };
}

/** The battle base for a frozen settlement target (loot already scaled for the attacker's Keep). */
export function settlementBase(t: WorldTarget, world: WorldState, data: GameData): BaseLayout {
  const s = world.settlements.find((x) => x.id === t.settlement);
  const base = clanVillage(t.owner, mixSeed(mixSeed(world.seed, hashId(t.settlement)), t.variant), t.strength, data);
  base.name = s?.name ?? base.name;
  base.settlement = t.settlement;
  base.trophies = 0;
  return applyLootPenalty(base, t.playerHall, data);
}

/** Take a settlement. Returns the clan that held it. Mutates. */
export function conquer(world: WorldState, id: string, now: number, data: GameData): string | null {
  const s = world.settlements.find((x) => x.id === id);
  if (!s || s.owner === 'player') return null;
  const from = s.owner;
  s.owner = 'player';
  s.since = now;
  s.variant++;
  world.counters.conquests++;
  if (world.faction.id && clanDef(data, world.faction.id).rival === from) world.counters.rivalConquests++;
  pushNews(world, { at: now, kind: 'conquest', text: `You took ${s.name} from ${clanDef(data, from).name}.` }, data);
  return from;
}

/** Clan step hook: an expanding clan retakes its land from the player, or takes land from its rival. Mutates. */
export function expandStep(world: WorldState, clan: ClanState, def: ClanDef, at: number, rng: Rng, data: GameData): void {
  if (clan.status !== 'expanding') return;
  const cfg = data.clans.sim;
  const home = data.world.provinces.find((p) => p.clan === def.id)?.id;
  const mine = world.settlements.filter((s) => s.owner === 'player' && s.province === home && at - s.since >= cfg.reclaimMinHeldHours * HOUR);
  if (mine.length && next(rng) < cfg.reclaimChance) {
    const s = mine[Math.floor(next(rng) * mine.length)];
    s.owner = def.id;
    s.since = at;
    s.variant++;
    world.counters.reclaimed++;
    pushNews(world, { at, kind: 'reclaim', text: `${def.name} took back ${s.name}.` }, data);
    return;
  }
  const rivalHome = data.world.provinces.find((p) => p.clan === def.rival)?.id;
  const targets = world.settlements.filter((s) => s.owner === def.rival && !(s.province === rivalHome && s.kind === 'fortress'));
  if (!targets.length) return;
  const s = targets[Math.floor(next(rng) * targets.length)];
  s.owner = def.id;
  s.since = at;
  s.variant++;
  pushNews(world, { at, kind: 'expand', text: `${def.name} took ${s.name} from ${clanDef(data, def.rival).name}.` }, data);
}

/** Tribute waiting today from held Shrines (0 if already claimed today). */
export function tributeQuote(state: VillageState, day: number, hall: number, data: GameData): { shrines: number; amount: Cost; ready: boolean } {
  const shrines = state.world.settlements.filter((s) => s.owner === 'player' && settlementKind(data, s.kind).tribute).length;
  const loot = data.battle.generatedLootByHall[Math.max(1, Math.min(data.battle.generatedLootByHall.length, hall)) - 1];
  const each = Math.floor(loot.min * data.world.tribute.shareOfRaidLoot);
  const amount: Cost = shrines ? { acorns: each * shrines, dew: each * shrines } : {};
  return { shrines, amount, ready: shrines > 0 && state.world.tributeDay !== day };
}

/** Settlements held per owner (the player counts as 'player'). */
export function territoryCounts(world: WorldState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of world.settlements) out[s.owner] = (out[s.owner] ?? 0) + 1;
  return out;
}
