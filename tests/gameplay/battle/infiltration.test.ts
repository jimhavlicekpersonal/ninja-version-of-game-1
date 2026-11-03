/**
 * Infiltration Points: warriors enter only through the base's points, and each
 * point hides about a third of the army, so a full army must split into squads.
 */
import { describe, expect, it } from 'vitest';
import { canDeploy, createBattle, deploy, deployBlock, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { coverFor, pointAt } from '../../../src/gameplay/sim/battle/infiltration';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { BattleSetup } from '../../../src/gameplay/sim/battle/types';

const cfg = data.battle.infiltration;
const base = generateOpponent(321, 6, data, { levelBias: 0.5 });
const army = { hedgehog_roller: 60, frog_lobber: 40, beetle_brute: 8 };
const setup: BattleSetup = { seed: 9, base, army, infiltration: true };

/** An open tile (deployable) outside every point. */
function offPointTile(sim: ReturnType<typeof createBattle>): { x: number; y: number } {
  const n = sim.grid.size;
  for (let i = 0; i < n * n; i++) if (sim.deployable[i] && pointAt(sim.entry!, i % n, Math.floor(i / n)) < 0) return { x: i % n, y: Math.floor(i / n) };
  throw new Error('no open tile');
}

describe('infiltration points', () => {
  it('a base has the configured number of points, lettered, each on open ground', () => {
    const sim = createBattle(setup, data);
    const e = sim.entry!;
    expect(e.points).toHaveLength(cfg.points);
    expect(e.points.map((p) => p.label).join('')).toBe('ABCDEF'.slice(0, cfg.points));
    for (const p of e.points) expect(sim.deployable[Math.floor(p.y) * sim.grid.size + Math.floor(p.x)]).toBe(1);
  });

  it('points come from the layout: the same base always gets the same points (server, replays and scouting agree)', () => {
    const a = createBattle(setup, data).entry!.points.map((p) => [p.x, p.y]);
    const b = createBattle({ ...setup, seed: 1234, army: { hedgehog_roller: 1 } }, data).entry!.points.map((p) => [p.x, p.y]);
    expect(a).toEqual(b);
  });

  it('points are spread out: no two share a circle', () => {
    const e = createBattle(setup, data).entry!;
    for (let i = 0; i < e.points.length; i++) for (let j = i + 1; j < e.points.length; j++) {
      const d = Math.hypot(e.points[i].x - e.points[j].x, e.points[i].y - e.points[j].y);
      expect(d).toBeGreaterThan(e.radius * 2);
    }
  });

  it('warriors can only enter inside a point; Smoke Bombs still go anywhere', () => {
    const sim = createBattle(setup, data);
    const off = offPointTile(sim);
    expect(canDeploy(sim, 'hedgehog_roller', off.x, off.y)).toBe(false);
    expect(deployBlock(sim, 'hedgehog_roller', off.x, off.y)).toBe('zone');
    const p = sim.entry!.points[0];
    expect(canDeploy(sim, 'hedgehog_roller', p.x, p.y)).toBe(true);
    expect(canDeploy(sim, 'smoke_bomb', off.x, off.y)).toBe(true);
  });

  it('each point hides a third of the army: dumping everything at one point lands only a third', () => {
    const sim = createBattle(setup, data);
    const p = sim.entry!.points[0];
    const total = Object.entries(army).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
    let placed = 0;
    for (const [t, n] of Object.entries(army)) for (let i = 0; i < n; i++) if (deploy(sim, { tick: 0, troop: t, x: p.x, y: p.y })) placed += data.troops[t].housing;
    expect(placed).toBeLessThanOrEqual(Math.ceil(total / cfg.minPoints));
    expect(placed).toBeGreaterThan(total / cfg.minPoints - 5);
    expect(deployBlock(sim, 'hedgehog_roller', p.x, p.y)).toBe('full');
    // Another point is still open.
    const q = sim.entry!.points[1];
    expect(canDeploy(sim, 'hedgehog_roller', q.x, q.y)).toBe(true);
  });

  it('a full army fits through the minimum number of points', () => {
    const sim = createBattle(setup, data);
    const deps = botDeployments(sim.deployable, sim.grid.size, army, createRng(4), data, {}, sim.entry);
    const { result } = runBattle(setup, deps, data);
    expect(result.used).toEqual(army);
  });

  it('cover never drops below the minimum, and the biggest warrior always fits', () => {
    expect(coverFor({ hedgehog_roller: 5 }, data)).toBe(cfg.minCover);
    const big = Object.entries(data.troops).sort((a, b) => b[1].housing - a[1].housing)[0][0];
    expect(coverFor({ [big]: 1 }, data)).toBeGreaterThanOrEqual(data.troops[big].housing);
  });

  it('the bot splits its army into squads, each with a share of every troop type', () => {
    const sim = createBattle(setup, data);
    const deps = botDeployments(sim.deployable, sim.grid.size, army, createRng(4), data, {}, sim.entry);
    const squads = new Map<number, Set<string>>();
    for (const d of deps) {
      const i = pointAt(sim.entry!, d.x, d.y);
      expect(i).toBeGreaterThanOrEqual(0);
      squads.set(i, (squads.get(i) ?? new Set()).add(d.troop));
    }
    expect(squads.size).toBeGreaterThanOrEqual(cfg.minPoints);
    for (const types of squads.values()) expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it('battles recorded before the rule (no flag) keep free placement, so old replays still play the same', () => {
    const legacy = createBattle({ ...setup, infiltration: undefined }, data);
    expect(legacy.entry).toBeNull();
    const ruled = createBattle(setup, data);
    const off = offPointTile(ruled);
    expect(canDeploy(legacy, 'hedgehog_roller', off.x, off.y)).toBe(true);
  });

  it('replays exactly', () => {
    const sim = createBattle(setup, data);
    const deps = botDeployments(sim.deployable, sim.grid.size, army, createRng(4), data, {}, sim.entry);
    expect(runBattle(setup, deps, data).result).toEqual(runBattle(setup, deps, data).result);
  });
});
