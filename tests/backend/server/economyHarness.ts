/** The game's side of a server-owned village, for server tests (roadmap Phase 2). */
import { expect } from 'vitest';
import type { CommandBatch, VillageCommand } from '../../../src/backend/net/protocol';
import { canPlace } from '../../../src/gameplay/sim/grid';
import { deserialize, type SaveFile } from '../../../src/gameplay/sim/save';
import { economyHash } from '../../../src/gameplay/sim/serverEconomy';
import type { GameData, VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, type Command } from '../../../src/gameplay/sim/village';

/** The game's side: a local village, a numbered command queue, and its economy hash. */
export function emulator(file: SaveFile, data: GameData) {
  let state: VillageState = deserialize(file, data);
  let seq = 0;
  const queue: VillageCommand[] = [];
  return {
    get state() {
      return state;
    },
    set state(s: VillageState) {
      state = s;
    },
    /** Apply locally (like controller.dispatch) and queue it for the server. */
    do(command: Command, t: number) {
      const r = applyCommand(state, command, t, data);
      if (r.ok) state = r.state;
      queue.push({ seq: ++seq, t, command });
      return r;
    },
    /** Queue without applying (a command the game would never apply itself). */
    raw(command: Command, t: number) {
      queue.push({ seq: ++seq, t, command });
    },
    batch(): CommandBatch {
      return { stateHash: economyHash(state), commands: queue.splice(0) };
    },
  };
}

export const collectors = (s: VillageState, data: GameData) => s.buildings.filter((b) => data.buildings[b.type].produces);

/** Have the game place a collector of `res` that the Keep allows, on the first free spot. */
export function placeCollector(game: ReturnType<typeof emulator>, data: GameData, t: number, res: 'acorns' | 'dew' = 'acorns'): void {
  const limits = data.hall.levels[0].limits;
  const type = Object.keys(limits).find((k) => data.buildings[k]?.produces === res && limits[k].count > 0)!;
  for (let y = 0; y < data.economy.mapSize; y++) {
    for (let x = 0; x < data.economy.mapSize; x++) {
      if (canPlace(game.state, data, type, x, y).ok) {
        expect(game.do({ type: 'place', buildingType: type, x, y }, t).ok).toBe(true);
        return;
      }
    }
  }
  throw new Error('no room');
}


/** Have the game place a building of this type on the first free spot. */
export function placeType(game: ReturnType<typeof emulator>, data: GameData, type: string, t: number): void {
  for (let y = 0; y < data.economy.mapSize; y++) {
    for (let x = 0; x < data.economy.mapSize; x++) {
      if (canPlace(game.state, data, type, x, y).ok) {
        expect(game.do({ type: 'place', buildingType: type, x, y }, t)).toMatchObject({ ok: true });
        return;
      }
    }
  }
  throw new Error('no room');
}
