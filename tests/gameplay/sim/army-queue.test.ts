/**
 * The army's life cycle end to end: train, wait for room, finish with Jade,
 * cancel, refill, save, reload. Each block here guards a bug a player hit.
 */
import { describe, expect, it } from 'vitest';
import { armyHousing, armyReadyAt, fillCount, housingCapacity, queueFit, retimeQueue } from '../../../src/gameplay/sim/army';
import { armyView, researchRow, trainRow } from '../../../src/gameplay/sim/armyView';
import { computeOfflineProgress } from '../../../src/gameplay/sim/offline';
import { upcomingReminders } from '../../../src/gameplay/sim/reminders';
import { deserialize, migrate, serialize, validateVillage } from '../../../src/gameplay/sim/save';
import type { TrainingItem } from '../../../src/gameplay/sim/types';
import { advance, applyCommand, trainingSkipQuote } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from './helpers';

const SHINOBI = 'hedgehog_roller'; // housing 1, 20 s
const ADEPT = 'frog_lobber';

/** A Dojo at `dojo`, one level 1 Courtyard (20 space) and plenty to spend. */
function armyVillage(dojo = 1) {
  const g = newGame({ acorns: 1500, dew: 1500, moonstones: 5000 });
  let s = must(g.state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, g.clock.now());
  s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, g.clock.now());
  g.clock.advanceSeconds(22);
  s = advance(s, g.clock.now(), data).state;
  s = { ...s, resources: { ...s.resources, dew: 100_000 }, buildings: s.buildings.map((b) => (b.type === 'burrow_barracks' ? { ...b, level: dojo } : b)) };
  expect(housingCapacity(s, data)).toBe(20);
  return { ...g, state: s };
}

/** Save and load exactly as the game does, through JSON. */
function reload(state: Parameters<typeof serialize>[0], now: number) {
  return deserialize(JSON.parse(JSON.stringify(serialize(state, now))), data);
}

describe('Finish training with more queued than the camps hold', () => {
  it('never writes a save that wipes the village on the next load', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    let s = must(state, { type: 'train', troop: SHINOBI, count: 40 }, t0);
    expect(s.training).toHaveLength(40);
    s = must(s, { type: 'skipTraining' }, t0 + 1000);
    expect(validateVillage(s, data)).toEqual([]);
    const loaded = reload(s, t0 + 1000);
    expect(loaded.army[SHINOBI]).toBe(20);
    expect(loaded.training).toHaveLength(20);
    for (const q of loaded.training) expect(q.endsAt).toBeGreaterThanOrEqual(q.startedAt);
  });

  it('charges for the warriors who fit, and the rest carry on training from now', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    const queued = must(state, { type: 'train', troop: SHINOBI, count: 25 }, t0);
    const quote = trainingSkipQuote(queued, t0, data)!;
    expect(quote.seconds).toBe(20 * 20); // the twentieth warrior, not the twenty-fifth
    const s = must(queued, { type: 'skipTraining' }, t0);
    expect(s.resources.moonstones).toBe(queued.resources.moonstones - quote.moonstones);
    expect(s.army[SHINOBI]).toBe(20);
    expect(s.training.map((q) => [q.startedAt - t0, q.endsAt - t0])).toEqual([[0, 20_000], [20_000, 40_000], [40_000, 60_000], [60_000, 80_000], [80_000, 100_000]]);
  });

  it('offers nothing when no queued warrior would fit', () => {
    const { state, clock } = armyVillage();
    const s = { ...state, army: { [SHINOBI]: 20 } };
    const queued = must(s, { type: 'train', troop: SHINOBI, count: 3 }, clock.now());
    expect(trainingSkipQuote(queued, clock.now(), data)).toBeNull();
    const r = applyCommand(queued, { type: 'skipTraining' }, clock.now(), data);
    expect(r.ok).toBe(false);
  });
});

describe('a save already broken by the old Finish training', () => {
  const broken = () => {
    const { state, clock } = armyVillage();
    const t = clock.now();
    // Exactly what the old code left behind: timers ending before they began.
    const training: TrainingItem[] = Array.from({ length: 6 }, (_, i) => ({ troop: SHINOBI, startedAt: t + (i + 1) * 20_000, endsAt: t - 1000, cost: { dew: 20 } }));
    const village = { ...state, army: { [SHINOBI]: 20 }, trophies: 777, training };
    return { file: { version: 12, savedAt: t, village: JSON.parse(JSON.stringify(village)) }, t };
  };

  it('loads with every warrior and all progress kept', () => {
    const { file } = broken();
    expect(validateVillage(file.village, data)).not.toEqual([]);
    const v = deserialize(file, data);
    expect(v.trophies).toBe(777);
    expect(v.army[SHINOBI]).toBe(20);
    expect(v.training).toHaveLength(6);
  });

  it('those warriors count as finished: they walk in as soon as there is room', () => {
    const { file, t } = broken();
    const v = deserialize(file, data);
    const s = must(v, { type: 'dismiss', troop: SHINOBI, count: 4 }, t);
    expect(s.army[SHINOBI]).toBe(20);
    expect(s.training).toHaveLength(2);
  });

  it('migration leaves a healthy queue alone', () => {
    const { state, clock } = armyVillage();
    const s = must(state, { type: 'train', troop: SHINOBI, count: 3 }, clock.now());
    const before = s.training.map((q) => [q.startedAt, q.endsAt]);
    const out = migrate({ ...serialize(s, clock.now()), version: 12 });
    expect(out.village.training.map((q) => [q.startedAt, q.endsAt])).toEqual(before);
  });
});

describe('cancelling from the queue', () => {
  /** Full camps, then finished warriors waiting, then one training, then one to come. */
  const backedUp = () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    let s = must(state, { type: 'train', troop: SHINOBI, count: 24 }, t0);
    clock.advanceSeconds(23 * 20 + 5);
    s = advance(s, clock.now(), data).state;
    expect(s.army[SHINOBI]).toBe(20);
    expect(s.training).toHaveLength(4);
    return { s, now: clock.now() };
  };

  it('leaves warriors who finished finished', () => {
    const { s, now } = backedUp();
    const before = s.training.map((q) => q.endsAt);
    const after = must(s, { type: 'cancelTraining', index: 0 }, now);
    expect(after.training.map((q) => q.endsAt)).toEqual(before.slice(1));
    expect(after.training.filter((q) => q.endsAt <= now)).toHaveLength(2);
  });

  it('does not restart the warrior in training', () => {
    const { s, now } = backedUp();
    const active = s.training.find((q) => q.startedAt <= now && q.endsAt > now)!;
    const after = must(s, { type: 'cancelTraining', index: 0 }, now);
    expect(after.training.find((q) => q.startedAt <= now && q.endsAt > now)).toEqual(active);
  });

  it('cancelling the warrior in training starts the next one now', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    let s = must(state, { type: 'train', troop: SHINOBI, count: 3 }, t0);
    s = must(s, { type: 'cancelTraining', index: 0 }, t0 + 5000);
    expect(s.training.map((q) => [q.startedAt - t0, q.endsAt - t0])).toEqual([[5000, 25_000], [25_000, 45_000]]);
  });

  it('retiming never moves a timer backwards past what already happened', () => {
    const q: TrainingItem[] = [
      { troop: SHINOBI, startedAt: 0, endsAt: 100, cost: {} },
      { troop: SHINOBI, startedAt: 500, endsAt: 900, cost: {} },
      { troop: SHINOBI, startedAt: 900, endsAt: 1000, cost: {} },
    ];
    retimeQueue(q, 300);
    expect(q.map((x) => [x.startedAt, x.endsAt])).toEqual([[0, 100], [300, 700], [700, 800]]);
  });

  it('never cancels the wrong warrior when the queue moved since the panel drew it', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    let s = must(state, { type: 'train', troop: SHINOBI, count: 2 }, t0);
    s = { ...s, training: [...s.training, { troop: ADEPT, startedAt: t0 + 40_000, endsAt: t0 + 65_000, cost: { dew: 50 } }] };
    // The panel drew the Adept at index 2; the first Shinobi finishes before the tap lands.
    const after = must(s, { type: 'cancelTraining', index: 2, troop: ADEPT }, t0 + 21_000);
    expect(after.training.map((q) => q.troop)).toEqual([SHINOBI]);
  });

  it('cancels a whole stack in one go with the full refund', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    const before = { ...state, resources: { ...state.resources, dew: 400 } };
    const s = must(before, { type: 'train', troop: SHINOBI, count: 10 }, t0);
    expect(s.resources.dew).toBe(200);
    const after = must(s, { type: 'cancelTraining', index: 9, troop: SHINOBI, count: 10 }, t0);
    expect(after.training).toHaveLength(0);
    expect(after.resources.dew).toBe(400);
  });
});

describe('Fill', () => {
  it('fills the camps once, and only a second tap trains the next army', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    expect(fillCount(state, SHINOBI, data)).toBe(20);
    const first = must(state, { type: 'train', troop: SHINOBI, count: fillCount(state, SHINOBI, data) }, t0);
    expect(first.training).toHaveLength(20);
    expect(fillCount(first, SHINOBI, data)).toBe(20);
    const second = must(first, { type: 'train', troop: SHINOBI, count: fillCount(first, SHINOBI, data) }, t0);
    expect(second.training).toHaveLength(40);
    expect(fillCount(second, SHINOBI, data)).toBe(0);
  });

  it('counts warriors already ready and larger warriors', () => {
    const { state } = armyVillage();
    expect(fillCount({ ...state, army: { [SHINOBI]: 5 } }, SHINOBI, data)).toBe(15);
    expect(fillCount({ ...state, army: { [SHINOBI]: 5 } }, 'beetle_brute', data)).toBe(3);
  });

  it('the panel shows what really gets queued: room, then what can be paid for', () => {
    const { state, clock } = armyVillage();
    const now = clock.now();
    const rich = armyView(state, now, data);
    expect(trainRow(rich, SHINOBI, now, data)).toMatchObject({ fill: 20, ahead: false });
    const poor = armyView({ ...state, resources: { ...state.resources, dew: 90 } }, now, data);
    expect(trainRow(poor, SHINOBI, now, data).fill).toBe(4);
    const full = armyView({ ...state, army: { [SHINOBI]: 20 } }, now, data);
    expect(trainRow(full, SHINOBI, now, data)).toMatchObject({ fill: 20, ahead: true });
  });
});

describe('the Army view', () => {
  it('says plainly who is training, who joins the next army and who is waiting for room', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    let s = must(state, { type: 'train', troop: SHINOBI, count: 21 }, t0);
    s = must(s, { type: 'train', troop: SHINOBI, count: 2 }, t0);
    const start = armyView(s, t0, data);
    expect(start.stacks.map((st) => [st.status, st.count])).toEqual([['training', 20], ['next', 3]]);
    expect(start.active?.troop).toBe(SHINOBI);
    expect(start.armyDoneAt).toBe(t0 + 400_000);
    const later = armyView(s, t0 + 21 * 20_000 + 1000, data);
    expect(later.readyHousing).toBe(20);
    expect(later.waiting).toBe(1);
    expect([later.nextHousing, later.waitingHousing]).toEqual([2, 1]); // a warrior is counted once
    expect(later.stacks.map((st) => [st.status, st.count])).toEqual([['waiting', 1], ['next', 2]]);
    expect(later.skip).toBeNull();
  });

  it('stacks long queues instead of listing every warrior', () => {
    const { state, clock } = armyVillage();
    const s = must(state, { type: 'train', troop: SHINOBI, count: 40 }, clock.now());
    expect(armyView(s, clock.now(), data).stacks).toHaveLength(2);
  });

  it('says what is missing before training is possible', () => {
    const { state, clock } = newGame();
    const v = armyView(state, clock.now(), data);
    expect([v.dojo, v.camp]).toEqual(['missing', 'missing']);
    const s = must(state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, clock.now());
    expect(armyView(s, clock.now(), data).dojo).toBe('building');
  });

  it('settles a late-game panel from one copy of the village, however many rows it draws', () => {
    const { state, clock } = armyVillage();
    const real = globalThis.structuredClone;
    let copies = 0;
    globalThis.structuredClone = ((v: unknown) => {
      copies++;
      return real(v);
    }) as typeof structuredClone;
    try {
      const v = armyView(state, clock.now(), data);
      for (const t of Object.keys(data.troops)) {
        trainRow(v, t, clock.now(), data);
        researchRow(v, t, clock.now(), data);
      }
    } finally {
      globalThis.structuredClone = real;
    }
    expect(copies).toBe(1);
  });

  it('queues a big batch without copying the village per warrior', () => {
    const { state, clock } = armyVillage();
    const real = globalThis.structuredClone;
    let copies = 0;
    globalThis.structuredClone = ((v: unknown) => {
      copies++;
      return real(v);
    }) as typeof structuredClone;
    try {
      const r = applyCommand(state, { type: 'train', troop: SHINOBI, count: 40 }, clock.now(), data);
      expect(r.ok).toBe(true);
    } finally {
      globalThis.structuredClone = real;
    }
    expect(copies).toBeLessThanOrEqual(2);
  });
});

describe('one-tap refills and saved armies', () => {
  it('says how many could not be queued, and why', () => {
    const { state, clock } = armyVillage();
    const poor = { ...state, resources: { ...state.resources, dew: 100 } };
    const r = applyCommand(poor, { type: 'trainArmy', army: { [SHINOBI]: 10 } }, clock.now(), data);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.training).toHaveLength(5);
      const short = r.events.find((e) => e.kind === 'train_short');
      expect(short).toMatchObject({ kind: 'train_short', missing: 5 });
      expect(short && short.kind === 'train_short' && short.why).toContain('Not enough');
    }
  });

  it('reports nothing short when everything was queued', () => {
    const { state, clock } = armyVillage();
    const r = applyCommand(state, { type: 'trainArmy', army: { [SHINOBI]: 10 } }, clock.now(), data);
    expect(r.ok && r.events.some((e) => e.kind === 'train_short')).toBe(false);
  });

  it('a new saved army never overwrites another after a delete', () => {
    const { state, clock } = armyVillage();
    const now = clock.now();
    let s = must(state, { type: 'saveArmyPreset', name: '', army: { [SHINOBI]: 1 } }, now);
    s = must(s, { type: 'saveArmyPreset', name: '', army: { [SHINOBI]: 2 } }, now);
    s = must(s, { type: 'deleteArmyPreset', index: 0 }, now);
    s = must(s, { type: 'saveArmyPreset', name: '', army: { [SHINOBI]: 3 } }, now);
    expect(s.armyPresets.map((p) => [p.name, p.army[SHINOBI]])).toEqual([['Army 2', 2], ['Army 1', 3]]);
  });
});

describe('warriors over time', () => {
  it('survive a reload at every stage, with their timers intact', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    const s = must(state, { type: 'train', troop: SHINOBI, count: 5 }, t0);
    const mid = reload(s, t0 + 30_000);
    expect(mid.training.map((q) => q.endsAt)).toEqual(s.training.map((q) => q.endsAt));
    const done = advance(mid, t0 + 45_000, data).state;
    expect(done.army[SHINOBI]).toBe(2);
    expect(reload(done, t0 + 45_000).army[SHINOBI]).toBe(2);
  });

  it('finished warriors walk in after a raid empties the camps', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    let s = must({ ...state, army: { [SHINOBI]: 20 } }, { type: 'train', troop: SHINOBI, count: 5 }, t0);
    clock.advanceSeconds(101);
    s = advance(s, clock.now(), data).state;
    expect(s.training).toHaveLength(5);
    const base = { name: 'Dummy', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 }] };
    const deployments = Array.from({ length: 12 }, (_, i) => ({ tick: i, troop: SHINOBI, x: 25, y: 19 }));
    s = must(s, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'Dummy', setup: { seed: 4, base, army: s.army }, deployments } }, clock.now());
    expect(s.army[SHINOBI]).toBe(8);
    clock.advanceSeconds(1);
    s = advance(s, clock.now(), data).state;
    expect(s.army[SHINOBI]).toBe(13);
    expect(s.training).toHaveLength(0);
    expect(armyHousing(s.army, data)).toBeLessThanOrEqual(housingCapacity(s, data));
  });

  it('training carries on while the game is closed, and coming back says so', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    const s = must(state, { type: 'train', troop: SHINOBI, count: 25 }, t0);
    const { state: back, summary } = computeOfflineProgress(reload(s, t0), t0 + 2 * 3_600_000, data, { botRaids: false });
    expect(back.army[SHINOBI]).toBe(20);
    expect(back.training).toHaveLength(5);
    expect(summary.trained).toEqual({ [SHINOBI]: 20 });
  });

  it('the army-ready reminder fires when the camps are full, not when the next army is', () => {
    const { state, clock } = armyVillage();
    const t0 = clock.now();
    const s = must(state, { type: 'train', troop: SHINOBI, count: 30 }, t0);
    expect(queueFit(s, data)).toBe(20);
    expect(armyReadyAt(s, data)).toBe(t0 + 400_000);
    expect(upcomingReminders(s, t0, data).find((r) => r.id === 'training')?.at).toBe(t0 + 400_000);
  });
});
