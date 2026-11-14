/** Close-call notes are read from the real battle and only shown when true. */
import { describe, expect, it } from 'vitest';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { closeCalls } from '../../../src/gameplay/sim/battle/closecall';
import { defaultData as data } from '../../../src/gameplay/sim/data';

const hallOnly = { name: 'Hall', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18 }] };

describe('close calls', () => {
  it('nothing to report for a wipe-out or a battle that was not close', () => {
    const deps = Array.from({ length: 10 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 25, y: 19 }));
    const win = runBattle({ seed: 1, base: hallOnly, army: { hedgehog_roller: 10 } }, deps, data).sim;
    expect(win.hallDestroyed).toBe(true);
    expect(closeCalls(win, data)).toEqual([]);
    const none = runBattle({ seed: 1, base: hallOnly, army: { hedgehog_roller: 1 } }, [], data, 5).sim;
    expect(closeCalls(none, data)).toEqual([]);
  });

  it('reports a nearly destroyed Keep with its true remaining health', () => {
    const deps = Array.from({ length: 10 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 25, y: 19 }));
    const full = runBattle({ seed: 1, base: hallOnly, army: { hedgehog_roller: 10 } }, deps, data);
    // Stop the same battle a few ticks before the hall falls.
    let stop = full.result.ticks;
    let sim = full.sim;
    for (; stop > 0; stop--) {
      sim = runBattle({ seed: 1, base: hallOnly, army: { hedgehog_roller: 10 } }, deps, data, stop).sim;
      const hall = sim.buildings[0];
      if (!hall.destroyed && hall.hp / hall.maxHp <= data.battle.closeCall.hallHpFraction) break;
    }
    const hall = sim.buildings[0];
    const notes = closeCalls(sim, data);
    expect(notes.map((n) => n.kind)).toContain('hall');
    expect(notes.find((n) => n.kind === 'hall')!.text).toContain(`${Math.max(1, Math.round((hall.hp / hall.maxHp) * 100))}%`);
    // GUI request (step 9): the number travels beside the English, for the interface to word.
    expect(notes.find((n) => n.kind === 'hall')!.params).toEqual({ hpPercent: Math.max(1, Math.round((hall.hp / hall.maxHp) * 100)) });
    // And the note never changes the result.
    expect(sim.hallDestroyed).toBe(false);
  });

  it('reports being just short of the 50% star, using the real destruction', () => {
    const sim = runBattle({ seed: 1, base: hallOnly, army: { hedgehog_roller: 1 } }, [], data, 5).sim;
    // Pretend 22 of 47 countable buildings fell (46%): 4% short.
    sim.countable = 47;
    sim.destroyedCount = 22;
    const notes = closeCalls(sim, data);
    expect(notes.find((n) => n.kind === 'star')?.text).toBe('Just 4% short of the 50% star.');
    sim.destroyedCount = 20; // 42%: not close enough
    expect(closeCalls(sim, data).some((n) => n.kind === 'star')).toBe(false);
  });

  it('reports the last buildings only after a strong attack', () => {
    const sim = runBattle({ seed: 1, base: hallOnly, army: { hedgehog_roller: 1 } }, [], data, 5).sim;
    sim.countable = 20;
    sim.destroyedCount = 18; // 90%, 2 left
    expect(closeCalls(sim, data).find((n) => n.kind === 'perfect')?.text).toBe('Only 2 buildings stood between you and 3 stars.');
    sim.countable = 4;
    sim.destroyedCount = 2; // 50%, 2 left: not a near-perfect attack
    expect(closeCalls(sim, data).some((n) => n.kind === 'perfect')).toBe(false);
  });
});
