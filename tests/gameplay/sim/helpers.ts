import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData } from '../../../src/gameplay/sim/data';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { canDeploy, createBattle, deploy } from '../../../src/gameplay/sim/battle/battle';
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
 * Deployments that land on the base's Infiltration Points (every battle the village sets up uses them,
 * exploit audit 2026-11-20 #5): each warrior goes on the first tile `canDeploy` accepts, one per tick.
 */
export function entryDeployments(setup: BattleSetup, wanted: [troop: string, count: number][]): Deployment[] {
  const sim = createBattle({ ...setup, infiltration: true }, data);
  const n = sim.grid.size;
  const out: Deployment[] = [];
  for (const [troop, count] of wanted) {
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let y = 0; y < n && !placed; y++) {
        for (let x = 0; x < n && !placed; x++) {
          if (!canDeploy(sim, troop, x, y)) continue;
          const d = { tick: out.length, troop, x, y };
          placed = deploy(sim, d);
          if (placed) out.push(d);
        }
      }
    }
  }
  return out;
}
