import { FakeClock } from '../../src/sim/clock';
import { defaultData } from '../../src/sim/data';
import { applyCommand, createNewVillage, type Command } from '../../src/sim/village';
import type { VillageState } from '../../src/sim/types';

export const data = defaultData;

export function newGame(resources?: Partial<VillageState['resources']>) {
  const clock = new FakeClock();
  let state = createNewVillage(clock.now(), data);
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
