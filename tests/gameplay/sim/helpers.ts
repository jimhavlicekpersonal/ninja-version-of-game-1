import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData } from '../../../src/gameplay/sim/data';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import type { VillageState } from '../../../src/gameplay/sim/types';

export const data = defaultData;

/**
 * A fresh village without forest obstacles (tests place buildings at fixed spots).
 * By default it is the classic start (Keep and two Artisan's Huts, no army), which
 * the building and raid tests were written for; pass `starter: true` for the
 * Shadow Clans start (plus a Coin Mint, a Kunai Tower and three Shinobi).
 */
export function newGame(resources?: Partial<VillageState['resources']>, opts: { obstacles?: boolean; starter?: boolean } = {}) {
  const clock = new FakeClock();
  let state = createNewVillage(clock.now(), data);
  if (!opts.starter) {
    const classic = new Set(['elder_toadstool', 'beaver_lodge']);
    state = { ...state, army: {}, buildings: state.buildings.filter((b) => classic.has(b.type) || data.buildings[b.type].category === 'obstacle') };
  }
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
