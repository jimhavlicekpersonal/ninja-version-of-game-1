/** Beast Mode 2026-11-21 SAV-14: every command wrote the whole village, uncoalesced. */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { defaultData as data } from '../../../src/gameplay/sim/data';

describe('SAV-14: coalesced saves', () => {
  it('ten dispatches in one burst produce at most two writes, and the last write holds the last state', async () => {
    const store = new MemorySaveStore();
    const clock = { now: () => Date.UTC(2026, 10, 21, 9) };
    const { controller } = await GameController.start({ clock, store, data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });
    let writes = 0;
    const real = store.save.bind(store);
    store.save = async (f) => {
      writes++;
      return real(f);
    };
    controller.dispatch({ type: 'setProfile', under18: false });
    for (let i = 0; i < 9; i++) controller.dispatch({ type: 'saveArmyPreset', name: `Army ${i + 1}`, army: { hedgehog_roller: 1 } });
    await controller.save();
    expect(writes).toBeLessThanOrEqual(2);
    const saved = (await store.load()) as { village: { armyPresets: unknown[] } };
    expect(saved.village.armyPresets.length).toBe(controller.state.armyPresets.length);
  });
});
