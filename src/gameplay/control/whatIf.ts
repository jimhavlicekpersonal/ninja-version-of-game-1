import { createBattle, deploymentsByTick, end, isAbility, result, step, type BattleSim } from '../sim/battle/battle';
import { pointAt } from '../sim/battle/infiltration';
import type { BattleResult, BattleSetup, Deployment } from '../sim/battle/types';
import type { GameData } from '../sim/types';

/**
 * P6-02 (CMB-02): the post-raid review. The same army and the same orders sent through another open Infiltration Point:
 * every warrior's placement moves by the offset from the point it went in through to `target` (abilities move with
 * the point most warriors used), on the same tick. What the battle refuses (the point's cover used up) is refused
 * exactly as in a real raid, so the review's numbers are a real battle fought with these deployments.
 *
 * It is a review, never advice: it runs only after the raid, one point at a time, on demand.
 */
export function whatIfDeployments(setup: BattleSetup, deployments: Deployment[], target: number, data: GameData): Deployment[] {
  const entry = createBattle(structuredClone(setup), data).entry;
  const to = entry?.points[target];
  if (!entry || !to) return [];
  const used = new Map<number, number>();
  for (const d of deployments) {
    if (isAbility(data, d.troop)) continue;
    const i = pointAt(entry, d.x, d.y);
    if (i >= 0) used.set(i, (used.get(i) ?? 0) + 1);
  }
  const primary = [...used.entries()].sort((a, z) => z[1] - a[1] || a[0] - z[0])[0]?.[0] ?? target;
  const from = entry.points[primary];
  return deployments.map((d) => {
    const i = isAbility(data, d.troop) ? -1 : pointAt(entry, d.x, d.y);
    const src = entry.points[i >= 0 ? i : primary] ?? from;
    return { tick: d.tick, troop: d.troop, x: Math.floor(d.x + to.x - src.x), y: Math.floor(d.y + to.y - src.y) };
  });
}

/** A review battle run in slices (a Keep 15 battle is ~0.2 s on a desktop, several times that on a cheap phone). */
export class WhatIfRun {
  readonly sim: BattleSim;
  readonly deployments: Deployment[];
  private readonly byTick: Map<number, Deployment[]>;

  constructor(
    setup: BattleSetup,
    original: Deployment[],
    readonly target: number,
    data: GameData,
    private readonly endTick?: number,
  ) {
    this.deployments = whatIfDeployments(setup, original, target, data);
    this.sim = createBattle(structuredClone(setup), data);
    this.byTick = deploymentsByTick(this.deployments);
  }

  /** Advance at most `ticks` ticks; true once the battle is over. */
  advance(ticks: number): boolean {
    for (let i = 0; i < ticks && !this.sim.ended; i++) {
      if (this.endTick !== undefined && this.sim.tick >= this.endTick) {
        end(this.sim, 'surrender');
        break;
      }
      step(this.sim, this.byTick.get(this.sim.tick));
    }
    return this.sim.ended;
  }

  /** The result, and how many of the army's warriors went in (a point hides only so much). */
  outcome(): { result: BattleResult; sent: number; total: number } {
    const total = Object.values(this.sim.setup.army).reduce((a, b) => a + b, 0);
    const left = Object.entries(this.sim.remaining).reduce((a, [t, n]) => a + (this.sim.data.troops[t] ? n : 0), 0);
    return { result: result(this.sim), sent: total - left, total };
  }
}
