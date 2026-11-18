import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData } from '../../../src/gameplay/sim/data';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import type { BattleSetup, Deployment } from '../../../src/gameplay/sim/battle/types';

export const data = defaultData;

/** A fresh village without forest obstacles (tests place buildings at fixed spots). */
export function newGame(resources?: Partial<VillageState['resources']>, opts: { obstacles?: boolean } = {}) {
  const clock = new FakeClock();
  let state = createNewVillage(clock.now(), data);
  if (!opts.obstacles) state = { ...state, buildings: state.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle') };
  if (resources) state = { ...state, resources: { ...state.resources, ...resources } };
  return { clock, state };
}

/** Apply a command and fail the test if it was rejected. */
export function must(state: VillageState, cmd: Command, now: number): VillageState {
  const r = applyCommand(state, cmd, now, data);
  if (!r.ok) throw new Error(`Command ${cmd.type} failed: ${r.code} ${r.message}`);
  return r.state;
}

export function find(state: VillageState, type: string) {
  return state.buildings.filter((b) => b.type === type);
}

/**
 * `count` deployments of `troop` that the Infiltration Points rule accepts (every new battle command forces
 * `infiltration: true`, P1-11): dealt round the base's points, each up to its cover, one per tick from `tick`.
 */
export function pointDeploys(setup: Omit<BattleSetup, 'infiltration'>, troop: string, count: number, tick = 0): Deployment[] {
  const sim = createBattle({ ...setup, infiltration: true }, data);
  const plan = sim.entry!;
  const housing = data.troops[troop]?.housing ?? 1;
  const used = plan.points.map(() => 0);
  const out: Deployment[] = [];
  for (let i = 0, p = 0; out.length < count && i < count * plan.points.length * 2; i++, p = (p + 1) % plan.points.length) {
    if (used[p] + housing > plan.cover) continue;
    used[p] += housing;
    out.push({ tick: tick + out.length, troop, x: plan.points[p].x, y: plan.points[p].y });
  }
  return out;
}
