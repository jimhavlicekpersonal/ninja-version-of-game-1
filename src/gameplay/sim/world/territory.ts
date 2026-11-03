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
import { applyLootPenalty, scaleLoot } from '../matchmaking';
import { createRng, mixSeed, next, pick, type Rng } from '../rng';
import type { ClanDef, ClanState, Cost, GameData, SettlementState, VillageState, WorldState, WorldTarget } from '../types';
import { hashId, pushNews } from './clans';
import { warRival, warWeek } from './factions';
import { clanDef, clanVillage } from './villagegen';
import { treasuryLootFactor } from './treasury';

const HOUR = 3_600_000;

export function initialSettlements(seed: number, now: number, data: GameData): SettlementState[] {
  const rng = createRng(mixSeed(seed, 0x7e221));
  const used = new Set<string>();
  const out: SettlementState[] = [];
  for (const p of data.world.provinces) {
    for (const k of data.world.settlementKinds) {
      for (let i = 0; i < k.count; i++) {
        // Shrines and Fortresses are named as such; villages take any other place word.
        const seconds = data.names.placeSecond.filter((w) => w !== 'Fortress' && w !== 'Shrine');
        let name = '';
        for (let tries = 0; tries < data.world.nameTries; tries++) {
          name = `${pick(rng, data.names.placeFirst)} ${k.id === 'shrine' ? 'Shrine' : k.id === 'fortress' ? 'Fortress' : pick(rng, seconds)}`;
          if (!used.has(name)) break;
        }
        used.add(name);
        out.push({ id: `${p.id}:${k.id}${i + 1}`, province: p.id, kind: k.id, name, owner: p.clan, since: now, variant: 0 });
      }
    }
  }
  return out;
}

/** True for a settlement id the world map can contain (`province:kindN`), the same in every region. */
export function isSettlementId(id: string, data: GameData): boolean {
  const m = /^([a-z_]+):([a-z]+)(\d+)$/.exec(String(id));
  if (!m) return false;
  const k = data.world.settlementKinds.find((x) => x.id === m[2]);
  return Boolean(k && data.world.provinces.some((p) => p.id === m[1]) && Number(m[3]) >= 1 && Number(m[3]) <= k.count);
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
  const clan = world.clans[s.owner];
  return { settlement: s.id, owner: s.owner, strength: settlementStrength(s, world, playerHall, data), variant: s.variant, playerHall, lootFactor: clan ? treasuryLootFactor(clan, data) : 1 };
}

/** The battle base for a frozen settlement target (loot already scaled for the attacker's Keep). */
export function settlementBase(t: WorldTarget, world: WorldState, data: GameData): BaseLayout {
  const s = world.settlements.find((x) => x.id === t.settlement);
  const province = data.world.provinces.find((p) => p.id === s?.province);
  const base = clanVillage(t.owner, mixSeed(mixSeed(world.seed, hashId(t.settlement)), t.variant), t.strength, data, { ringScale: province?.ringScale });
  // The clan's treasury decides how much loot it keeps here (frozen with the target).
  scaleLoot(base, t.lootFactor ?? 1);
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
  s.heldBy = null;
  world.counters.conquests++;
  if (world.faction.id && warRival(world.faction, warWeek(now, data), data) === from) world.counters.rivalConquests++;
  pushNews(world, { at: now, kind: 'conquest', text: `You took ${s.name} from ${clanDef(data, from).name}.` }, data);
  return from;
}

/**
 * Shared territory (online): settlements other real players in the region
 * hold. A settlement another player holds is shown as theirs; if this world
 * thought it was ours, the server's record wins and it returns to its clan
 * here. Mutates.
 */
export function applyRegionClaims(world: WorldState, claims: { settlement: string; playerId: string; name: string }[], meId: string, now: number, data: GameData): void {
  for (const s of world.settlements) {
    const other = claims.find((c) => c.settlement === s.id && c.playerId !== meId);
    s.heldBy = other ? { id: other.playerId, name: other.name } : null;
    if (other && s.owner === 'player') {
      s.owner = provinceOf(data, s.province).clan;
      s.since = now;
      s.variant++;
      pushNews(world, { at: now, kind: 'conquest', text: `${other.name} (player) holds ${s.name}.` }, data);
    }
  }
}

/** A settlement taken from another real player, confirmed by the server. Safe to apply twice. Mutates. */
export function conquerFromPlayer(world: WorldState, id: string, now: number, data: GameData): boolean {
  const s = world.settlements.find((x) => x.id === id);
  if (!s || (s.owner === 'player' && !s.heldBy)) return false;
  const from = s.heldBy?.name ?? 'a rival player';
  s.owner = 'player';
  s.since = now;
  s.variant++;
  s.heldBy = null;
  world.counters.conquests++;
  pushNews(world, { at: now, kind: 'conquest', text: `You took ${s.name} from ${from} (player).` }, data);
  return true;
}

/** Clan step hook: an expanding clan retakes its land from the player, or takes land from its rival. Mutates. */
export function expandStep(world: WorldState, clan: ClanState, def: ClanDef, at: number, rng: Rng, data: GameData): void {
  if (clan.status !== 'expanding') return;
  const cfg = data.clans.sim;
  const home = data.world.provinces.find((p) => p.clan === def.id)?.id;
  const mine = world.settlements.filter((s) => s.owner === 'player' && !s.heldBy && s.province === home && at - s.since >= cfg.reclaimMinHeldHours * HOUR);
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
