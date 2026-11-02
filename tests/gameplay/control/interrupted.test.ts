/** Recovery for interrupted raids: closing the app mid-battle can't erase the raid. */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { Deployment } from '../../../src/gameplay/sim/battle/types';
import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { trialBase } from '../../../src/gameplay/sim/trials';

const deps = (clock: FakeClock, store: MemorySaveStore) => ({ clock, store, data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });

describe('interrupted raids', () => {
  it('a raid in progress when the app closes plays out on the next launch, once', async () => {
    const clock = new FakeClock();
    const store = new MemorySaveStore();
    const c1 = (await GameController.start(deps(clock, store))).controller;
    c1.state.army = { hedgehog_roller: 20 };
    const trophies = c1.state.trophies;
    const base = generateOpponent(77, 1, data);
    const setup = { seed: 5, base, army: { hedgehog_roller: 20 } };
    const deployments: Deployment[] = Array.from({ length: 8 }, (_, i) => ({ tick: i * 2, troop: 'hedgehog_roller', x: 1, y: 10 + i }));
    c1.trackBattle({ kind: 'raid', opponentName: base.name, setup, deployments, at: clock.now() });
    await c1.save();

    // The app is killed; the player comes back later.
    clock.advanceSeconds(120);
    const c2 = (await GameController.start(deps(clock, store))).controller;
    expect(c2.state.pendingBattle).not.toBeNull();
    const r = c2.resolvePendingBattle();
    expect(r).not.toBeNull();
    expect(c2.state.pendingBattle).toBeNull();
    expect(c2.state.battleLog).toHaveLength(1);
    expect(c2.state.army.hedgehog_roller).toBe(12); // 8 deployed and spent, 12 went home
    expect(r!.record.result.endReason).not.toBe('surrender'); // it played out
    if (r!.record.result.stars === 0) expect(c2.state.trophies).toBeLessThan(Math.max(1, trophies + 1));
    // Nothing left to resolve: no double rewards.
    expect(c2.resolvePendingBattle()).toBeNull();
    await c2.save();
    const c3 = (await GameController.start(deps(clock, store))).controller;
    expect(c3.state.pendingBattle).toBeNull();
    expect(c3.state.battleLog).toHaveLength(1);
  });

  it('finishing a raid normally clears the pending record', async () => {
    const clock = new FakeClock();
    const c = (await GameController.start(deps(clock, new MemorySaveStore()))).controller;
    c.state.army = { hedgehog_roller: 5 };
    const base = generateOpponent(3, 1, data);
    const setup = { seed: 1, base, army: { hedgehog_roller: 5 } };
    const deployments: Deployment[] = [{ tick: 0, troop: 'hedgehog_roller', x: 1, y: 12 }];
    c.trackBattle({ kind: 'raid', opponentName: base.name, setup, deployments, at: clock.now() });
    expect(c.finishBattle(setup, deployments, 50, base.name)).not.toBeNull();
    expect(c.state.pendingBattle).toBeNull();
    expect(c.resolvePendingBattle()).toBeNull();
  });

  it('an interrupted Shadow Trial resolves through the trial rules', async () => {
    const clock = new FakeClock();
    const c = (await GameController.start(deps(clock, new MemorySaveStore()))).controller;
    c.state.army = { hedgehog_roller: 3 };
    const setup = { seed: 2, base: trialBase(1, data), army: { hedgehog_roller: 3 } };
    c.trackBattle({ kind: 'trial', tier: 1, opponentName: 'Shadow Trial 1', setup, deployments: [{ tick: 0, troop: 'hedgehog_roller', x: 1, y: 12 }], at: clock.now() });
    const r = c.resolvePendingBattle();
    expect(r?.record.opponentName).toBe('Shadow Trial 1');
    expect(r?.record.trophies).toBe(0);
    expect(c.state.pendingBattle).toBeNull();
  });
});
