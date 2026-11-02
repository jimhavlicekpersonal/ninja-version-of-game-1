import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../src/analytics/events';
import { GameController } from '../../src/game/controller';
import { MemorySaveStore } from '../../src/persist/saveStore';
import { FakeClock } from '../../src/sim/clock';
import { defaultData as data } from '../../src/sim/data';
import { collectorAmount } from '../../src/sim/resources';

function deps(clock: FakeClock, store: MemorySaveStore, events: MemoryEventStore) {
  return { clock, store, data, analytics: new Analytics(events, clock, 'test') };
}

describe('GameController (save, reload, offline)', () => {
  it('a fresh start creates and saves a new village', async () => {
    const clock = new FakeClock();
    const store = new MemorySaveStore();
    const r = await GameController.start(deps(clock, store, new MemoryEventStore()));
    expect(r.isNew).toBe(true);
    expect(await store.load()).not.toBeNull();
  });

  it('timers and collectors survive a reload and an 8-hour absence', async () => {
    const clock = new FakeClock();
    const store = new MemorySaveStore();
    const events = new MemoryEventStore();
    const first = await GameController.start(deps(clock, store, events));
    const c1 = first.controller;
    expect(c1.dispatch({ type: 'place', buildingType: 'acorn_orchard', x: 2, y: 2 }).ok).toBe(true);
    clock.advanceSeconds(10);
    c1.tick();
    const hall = c1.state.buildings.find((b) => b.type === 'elder_toadstool')!;
    expect(c1.dispatch({ type: 'upgrade', id: hall.id }).ok).toBe(true);
    await c1.save();

    // The player closes the game for 8 hours, then opens it again.
    clock.advanceHours(8);
    const second = await GameController.start(deps(clock, store, events));
    expect(second.isNew).toBe(false);
    expect(second.offline).not.toBeNull();
    expect(second.offline!.finished.map((f) => f.type)).toEqual(['elder_toadstool']);
    expect(second.offline!.collectorGains.acorns).toBe(1600);
    const c2 = second.controller;
    expect(c2.state.buildings.find((b) => b.type === 'elder_toadstool')!.level).toBe(2);
    const orchard = c2.state.buildings.find((b) => b.type === 'acorn_orchard')!;
    expect(collectorAmount(orchard, clock.now(), data)).toBe(1600);
    // And collecting works after the reload. Hall 2 stores 3000; we hold 0 acorns after paying 1000.
    const res = c2.dispatch({ type: 'collect', id: orchard.id });
    expect(res.ok).toBe(true);
    expect(c2.state.resources.acorns).toBe(1600);
  });

  it('logs upgrade_start analytics events', async () => {
    const clock = new FakeClock();
    const events = new MemoryEventStore();
    const { controller } = await GameController.start(deps(clock, new MemorySaveStore(), events));
    controller.dispatch({ type: 'place', buildingType: 'dewdrop_well', x: 2, y: 2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(events.events.map((e) => e.name)).toContain('upgrade_start');
    expect(events.events[0].props).toMatchObject({ building: 'dewdrop_well', toLevel: 1, seconds: 10 });
  });

  it('starts fresh (without crashing) when the save is damaged', async () => {
    const clock = new FakeClock();
    const store = new MemorySaveStore();
    await store.save({ version: 1, savedAt: 0, village: { nonsense: true } } as never);
    const r = await GameController.start(deps(clock, store, new MemoryEventStore()));
    expect(r.isNew).toBe(true);
    expect(r.loadError).toBeTruthy();
    expect(store.backups).toHaveLength(1);
  });

  it('a short absence does not show the welcome-back summary', async () => {
    const clock = new FakeClock();
    const store = new MemorySaveStore();
    const events = new MemoryEventStore();
    await GameController.start(deps(clock, store, events));
    clock.advanceSeconds(5);
    const r = await GameController.start(deps(clock, store, events));
    expect(r.offline).toBeNull();
  });
});
