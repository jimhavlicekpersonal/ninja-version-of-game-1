import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { MAX_BACKUPS, MemorySaveStore, SaveConflictError, backupsToDrop, type MemorySlot } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { NewerSaveError, SAVE_VERSION, serialize } from '../../../src/gameplay/sim/save';
import { hallLevel } from '../../../src/gameplay/sim/village';

const start = (clock: FakeClock, store: MemorySaveStore) => GameController.start({ clock, store, data, analytics: new Analytics(new MemoryEventStore(), clock, 'test') });
const stored = (slot: MemorySlot) => JSON.parse(slot.data!) as { version: number; rev: number; village: { trophies: number; resources: { dew: number } } };

/** A real village file with a marker to recognise it by. */
function fileWith(clock: FakeClock, trophies: number, patch: Record<string, unknown> = {}) {
  return async () => {
    const { controller } = await start(clock, new MemorySaveStore());
    return { ...serialize({ ...controller.state, trophies, ...patch }, clock.now()) };
  };
}

describe('two tabs on one village', () => {
  it('an old tab left open cannot write over newer progress', async () => {
    const clock = new FakeClock();
    const slot: MemorySlot = { data: null };
    const old = (await start(clock, new MemorySaveStore(slot))).controller;
    const fresh = (await start(clock, new MemorySaveStore(slot))).controller;
    fresh.state = { ...fresh.state, trophies: 500 };
    await fresh.save();
    const errors: Error[] = [];
    old.onSaveError((e) => errors.push(e));
    await old.save(); // the 15-second autosave in the forgotten tab
    expect(stored(slot).village.trophies).toBe(500);
    expect(errors[0]).toBeInstanceOf(SaveConflictError);
  });

  it('the tab that lost the village stops saving', async () => {
    const clock = new FakeClock();
    const slot: MemorySlot = { data: null };
    const old = (await start(clock, new MemorySaveStore(slot))).controller;
    await start(clock, new MemorySaveStore(slot));
    let errors = 0;
    old.onSaveError(() => errors++);
    await old.save();
    await old.save();
    await old.save();
    expect(errors).toBe(1);
  });

  it('whichever tab loads last owns the village, and can hand it back by reloading', async () => {
    const clock = new FakeClock();
    const slot: MemorySlot = { data: null };
    const a = new MemorySaveStore(slot);
    const b = new MemorySaveStore(slot);
    await a.load();
    await a.save(await fileWith(clock, 1)());
    await b.load();
    await b.save(await fileWith(clock, 2)());
    await expect(a.save(await fileWith(clock, 3)())).rejects.toBeInstanceOf(SaveConflictError);
    await a.load();
    await a.save(await fileWith(clock, 4)());
    expect(stored(slot).village.trophies).toBe(4);
    await expect(b.save(await fileWith(clock, 5)())).rejects.toBeInstanceOf(SaveConflictError);
  });

  it('a single tab saves as often as it likes', async () => {
    const clock = new FakeClock();
    const slot: MemorySlot = { data: null };
    const { controller } = await start(clock, new MemorySaveStore(slot));
    const errors: Error[] = [];
    controller.onSaveError((e) => errors.push(e));
    for (let i = 0; i < 5; i++) await controller.save();
    expect(errors).toEqual([]);
  });
});

describe('a save that cannot be read', () => {
  it('from a newer game is left alone, not replaced by a new village', async () => {
    const clock = new FakeClock();
    const slot: MemorySlot = { data: JSON.stringify({ ...(await fileWith(clock, 900)()), version: SAVE_VERSION + 1, rev: 7 }) };
    const store = new MemorySaveStore(slot);
    await expect(start(clock, store)).rejects.toBeInstanceOf(NewerSaveError);
    expect(stored(slot).village.trophies).toBe(900);
    expect(store.backups).toHaveLength(0);
  });

  it('that is damaged is kept, and can be swapped back in', async () => {
    const clock = new FakeClock();
    const file = await fileWith(clock, 650, { buildings: undefined })();
    const good = await fileWith(clock, 650)();
    // Still unreadable: kept, but not offered.
    const slot: MemorySlot = { data: JSON.stringify(file) };
    const store = new MemorySaveStore(slot);
    const r = await start(clock, store);
    expect(r.isNew).toBe(true);
    expect(store.backups).toHaveLength(1);
    expect(await r.controller.backups()).toEqual([]);
    // A later version can read it: now it is offered and restores.
    store.backups.push(good);
    const list = await r.controller.backups();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ honor: 650, keep: 1 });
    expect(await r.controller.restoreBackup(list[0].key)).toBe(true);
    expect(r.controller.state.trophies).toBe(650);
    expect(stored(slot).village.trophies).toBe(650);
  });

  it('restoring keeps the village it replaces, so a wrong choice can be undone', async () => {
    const clock = new FakeClock();
    const store = new MemorySaveStore();
    const { controller } = await start(clock, store);
    controller.state = { ...controller.state, trophies: 11 };
    store.backups.push(await fileWith(clock, 650)());
    await controller.restoreBackup((await controller.backups())[0].key);
    expect(controller.state.trophies).toBe(650);
    await controller.restoreBackup((await controller.backups())[0].key);
    expect(controller.state.trophies).toBe(11);
  });

  it('the save broken by the old Finish training comes back whole', async () => {
    const clock = new FakeClock();
    const t = clock.now();
    const training = Array.from({ length: 3 }, (_, i) => ({ troop: 'hedgehog_roller', startedAt: t + (i + 1) * 20_000, endsAt: t - 1000, cost: { dew: 20 } }));
    const wiped = { ...(await fileWith(clock, 650, { training, army: { hedgehog_roller: 20 } })()), version: 12 };
    const slot: MemorySlot = { data: null };
    const store = new MemorySaveStore(slot);
    const { controller } = await start(clock, store);
    store.backups.push(wiped);
    const [backup] = await controller.backups();
    expect(backup).toMatchObject({ honor: 650, warriors: 23 });
    await controller.restoreBackup(backup.key);
    expect(controller.state.army.hedgehog_roller).toBe(20);
    expect(controller.state.training).toHaveLength(3);
    expect(hallLevel(controller.state, data)).toBe(1);
    expect(stored(slot).version).toBe(SAVE_VERSION);
  });
});

describe('damaged-save backups are capped (device F15)', () => {
  it('keeps only the newest MAX_BACKUPS', async () => {
    const store = new MemorySaveStore();
    for (let i = 0; i < MAX_BACKUPS + 4; i++) await store.backupDamaged({ n: i });
    const kept = await store.listBackups();
    expect(kept).toHaveLength(MAX_BACKUPS);
    expect(kept.map((b) => (b.raw as { n: number }).n)).toEqual([8, 7, 6, 5, 4]);
  });

  it('picks the oldest IndexedDB keys to delete by their time stamp', () => {
    const keys = ['tk-save-damaged-1700000000005', 'tk-save-damaged-1700000000001', 'tk-save-damaged-1700000000009', 'tk-save-damaged-1700000000003'];
    expect(backupsToDrop(keys, 2)).toEqual(['tk-save-damaged-1700000000003', 'tk-save-damaged-1700000000001']);
    expect(backupsToDrop(keys.slice(0, 2), 5)).toEqual([]);
  });
});
