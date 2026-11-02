import { describe, expect, it } from 'vitest';
import { hallUnlocks, troopCapUnlock } from '../../../src/gameplay/sim/preview';
import { data } from './helpers';

describe('Elder Toadstool unlock preview', () => {
  it('lists what the next hall level unlocks', () => {
    const items = hallUnlocks(1, data);
    expect(items).toContainEqual({ type: 'acorn_orchard', kind: 'more', from: 1, to: 2 });
    expect(items).toContainEqual({ type: 'acorn_orchard', kind: 'levelCap', from: 2, to: 4 });
    expect(items).toContainEqual({ type: 'acorn_silo', kind: 'levelCap', from: 1, to: 3 });
  });

  it('includes the higher troop research cap', () => {
    expect(troopCapUnlock(1, data)).toEqual({ from: 1, to: 2 });
    expect(troopCapUnlock(data.hall.levels.length, data)).toBeNull();
  });

  it('is empty at the top hall level', () => {
    expect(hallUnlocks(data.hall.levels.length, data)).toEqual([]);
  });
});
