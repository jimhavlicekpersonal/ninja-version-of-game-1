/**
 * Beast Mode 2026-11-21 SAV-02 / SAV-03: a damaged save was written over even when its backup failed, there were no
 * rolling copies, and one bad field replaced the whole village.
 */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { GENERATION_EVERY_MS, MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { defaultData as data, maxDefinedLevel } from '../../../src/gameplay/sim/data';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { createNewVillage, hallLevel } from '../../../src/gameplay/sim/village';

const T = Date.UTC(2026, 10, 21, 9);
const start = (store: MemorySaveStore, now = T) => {
  const clock = { now: () => now };
  return GameController.start({ clock, store, data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });
};

describe('SAV-02: a damaged save is never written over before it is copied', () => {
  it('a damaged save whose backup fails is not overwritten; the session runs unsaved', async () => {
    const slot = { data: JSON.stringify({ version: 999_999_999 - 999_999_990, savedAt: T, village: { broken: true } }) };
    const store = new MemorySaveStore(slot);
    store.backupDamaged = async () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    const before = slot.data;
    const r = await start(store);
    expect(r.loadError).toBeTruthy();
    expect(r.kept).toBe(false);
    expect(slot.data).toBe(before);
    r.controller.dispatch({ type: 'openDailyChest' });
    await r.controller.save();
    expect(slot.data).toBe(before);
  });

  it('a damaged save that was copied is replaced as before', async () => {
    const slot = { data: JSON.stringify({ version: 9, savedAt: T, village: { broken: true } }) };
    const store = new MemorySaveStore(slot);
    const r = await start(store);
    expect(r.kept).toBeUndefined();
    expect(store.backups).toHaveLength(1);
    expect(JSON.parse(slot.data!).village.broken).toBeUndefined();
  });
});

describe('SAV-03: rolling copies and load-time repairs', () => {
  it('keeps the previous file as a generation, at most every 10 minutes', async () => {
    let now = T;
    const store = new MemorySaveStore({ data: null }, () => now);
    const v = createNewVillage(T, data);
    await store.save(serialize(v, now));
    await store.save(serialize({ ...v, trophies: 1 }, now));
    expect(store.generations).toHaveLength(1);
    now += 60_000;
    await store.save(serialize({ ...v, trophies: 2 }, now));
    expect(store.generations).toHaveLength(1);
    now += GENERATION_EVERY_MS;
    await store.save(serialize({ ...v, trophies: 3 }, now));
    expect(store.generations).toHaveLength(2);
    expect((await store.previous()).map((g) => (g as { village: { trophies: number } }).village.trophies)).toEqual([2, 0]);
  });

  it('a corrupted primary falls back to the newest readable generation automatically', async () => {
    let now = T;
    const slot = { data: null as string | null };
    const store = new MemorySaveStore(slot, () => now);
    const v = createNewVillage(T, data);
    const keep = v.buildings.find((b) => data.buildings[b.type].category === 'hall')!;
    keep.level = 3;
    await store.save(serialize(v, now));
    now += GENERATION_EVERY_MS;
    await store.save(serialize(v, now));
    // The latest is structurally damaged (no buildings list).
    slot.data = JSON.stringify({ ...JSON.parse(slot.data!), village: { ...JSON.parse(slot.data!).village, buildings: 'oops' } });
    const r = await start(new MemorySaveStore(slot, () => now), now);
    expect(r.isNew).toBe(false);
    expect(r.restoredFrom).toBeDefined();
    expect(hallLevel(r.controller.state, data)).toBe(3);
  });

  it('a save with one invalid number loads with that number at 0, and a level above the cap is lowered', () => {
    const v = createNewVillage(T, data);
    const file = JSON.parse(JSON.stringify(serialize(v, T)));
    file.village.resources.acorns = null;
    file.village.resources.dew = 'NaN';
    const wall = file.village.buildings.find((b: { type: string }) => data.buildings[b.type].category === 'hall');
    wall.level = 999;
    file.village.buildings.push({ id: 'b-gone', type: 'retired_building_type', level: 1, x: 0, y: 0 });
    file.village.army = { not_a_warrior: 3 };
    const s = deserialize(file, data);
    expect(s.resources.acorns).toBe(0);
    expect(s.resources.dew).toBe(0);
    expect(s.buildings.find((b) => b.id === 'b-gone')).toBeUndefined();
    expect(hallLevel(s, data)).toBe(data.hall.levels.length);
    expect(s.army).toEqual({});
  });
});

describe('F7 (2026-11-24): more load-time repairs instead of a new village', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const load = (edit: (v: Record<string, any>) => void) => {
    const file = structuredClone(serialize(createNewVillage(T, data), T)) as unknown as { village: Record<string, never> };
    edit(file.village);
    return deserialize(file, data);
  };
  const troop = Object.keys(data.troops)[0];

  it('an upgrade to a level above the cap is dropped; the building keeps its level', () => {
    let id = '';
    const out = load((x) => {
      const b = x.buildings.find((b: { type: string }) => !['hall', 'obstacle'].includes(data.buildings[b.type].category));
      const max = maxDefinedLevel(data, b.type);
      id = b.id;
      b.level = max;
      b.upgrade = { toLevel: max + 1, startedAt: T, endsAt: T + 1000 };
    });
    const b = out.buildings.find((b) => b.id === id)!;
    expect(b.level).toBe(maxDefinedLevel(data, b.type));
    expect(b.upgrade ?? null).toBeNull();
  });

  it("a research level above the warrior's levels is lowered to the top one; others stay", () => {
    const [a, b] = Object.keys(data.troops);
    const out = load((x) => {
      x.research.levels[a] = data.troops[a].levels.length + 3;
      x.research.levels[b] = 2;
    });
    expect(out.research.levels[a]).toBe(data.troops[a].levels.length);
    expect(out.research.levels[b]).toBe(2);
  });

  it('unknown warriors leave presets, training, research timers and the Lodge; known ones stay', () => {
    const out = load((x) => {
      x.armyPresets = [{ name: 'p', army: { gone_troop: 3, [troop]: 2 } }];
      x.training = [{ troop: 'gone_troop', startedAt: T, endsAt: T + 5, cost: {} }, { troop, startedAt: T, endsAt: T + 5, cost: {} }];
      x.research.active = [{ troop: 'gone_troop', toLevel: 2, startedAt: T, endsAt: T + 5, cost: {} }];
      x.grove.reinforcements = { gone_troop: 2, [troop]: 1 };
      x.grove.reinforcementLevels = { gone_troop: 2, [troop]: 1 };
    });
    expect(out.armyPresets).toEqual([{ name: 'p', army: { [troop]: 2 } }]);
    expect(out.training.map((q) => q.troop)).toEqual([troop]);
    expect(out.research.active).toEqual([]);
    expect(out.grove.reinforcements).toEqual({ [troop]: 1 });
    expect(out.grove.reinforcementLevels).toEqual({ [troop]: 1 });
  });
});
