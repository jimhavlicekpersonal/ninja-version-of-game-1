import { totalLoot } from './battle/basegen';
import { createBattle, deploymentsByTick, end, isAbility, replayable, step } from './battle/battle';
import { pointAt } from './battle/infiltration';
import type { BattleRecord } from './battle/types';
import type { Cost, GameData, ResourceKind } from './types';

/**
 * P6-03 (defense opportunity 2): what a raid on the village did, from the record alone (no save field). What was
 * raidable is the loot the base held for the raider (`totalLoot(setup.base)`); what was kept is that minus what was
 * taken (`result.loot`); stars denied are the ones the raider did not earn; the reward is `banked` on the record.
 * The entry point comes from the raider's first warrior; the first buildings to fall need a replay, so only under the
 * rules the record was fought with.
 */
export interface DefenseKept {
  raidable: Cost;
  kept: Cost;
  /** Share of what was raidable that stayed (0..1); null when nothing was raidable. */
  share: number | null;
}

export function defenseKept(r: BattleRecord): DefenseKept {
  const raidable = totalLoot(r.setup.base);
  const kept: Cost = {};
  let all = 0;
  let left = 0;
  for (const [k, v] of Object.entries(raidable) as [ResourceKind, number][]) {
    const took = Math.min(v, r.result.loot[k] ?? 0);
    kept[k] = v - took;
    all += v;
    left += v - took;
  }
  return { raidable, kept, share: all > 0 ? left / all : null };
}

/** The Infiltration Point the raider's first warrior went in through (its letter), or null without points. */
export function raidEntry(r: BattleRecord, data: GameData): string | null {
  if (!r.setup.infiltration) return null;
  const first = r.deployments.find((d) => !isAbility(data, d.troop));
  if (!first) return null;
  const entry = createBattle(structuredClone(r.setup), data).entry;
  if (!entry) return null;
  const i = pointAt(entry, first.x, first.y);
  return i >= 0 ? entry.points[i].label : null;
}

/** The first `n` buildings (types, walls left out) the raid destroyed, by replaying it; null when it cannot be replayed. */
export function firstToFall(r: BattleRecord, data: GameData, n = 3): string[] | null {
  if (!replayable(r)) return null;
  const sim = createBattle(structuredClone(r.setup), data);
  const byTick = deploymentsByTick(r.deployments);
  const out: string[] = [];
  const down = new Set<number>();
  while (!sim.ended && out.length < n) {
    if (r.endTick !== undefined && sim.tick >= r.endTick) {
      end(sim, 'surrender');
      break;
    }
    step(sim, byTick.get(sim.tick));
    sim.buildings.forEach((b, i) => {
      if (b.destroyed && !down.has(i)) {
        down.add(i);
        if (b.kind !== 'hedge' && out.length < n) out.push(b.type);
      }
    });
  }
  return out;
}

/**
 * The side raiders break through (P6-03 → `nextObjective`): the entry point of the latest raid on the village that
 * earned a star, within `withinMs`. A free suggestion; never anything paid.
 */
export function breachSide(log: BattleRecord[], now: number, data: GameData, withinMs = 3 * 86_400_000): string | null {
  const last = [...log].filter((r) => r.kind === 'defense' && r.result.stars > 0 && now - r.at <= withinMs).sort((a, b) => b.at - a.at)[0];
  return last ? raidEntry(last, data) : null;
}
