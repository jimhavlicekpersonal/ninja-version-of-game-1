/**
 * Balance audit 2026-11-08, round-2 rules on the server (docs/PROTOCOL.md version 11): staked honor,
 * declared stakes fixed at start, exhausted stores and exposure targeting.
 */
import { describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';
import { baseAt, HOUR, rush, sumLoot, world } from './harness';

/** A base with no defences (raids win) and loot on every building. */
function openBase(seed: number, loot = 0) {
  const b = baseAt(1, seed, loot);
  b.buildings = b.buildings.filter((x) => defaultData.buildings[x.type].category !== 'defense');
  return b;
}

describe('staked honor', () => {
  it('a lost defence costs the defender no honor; the attacker still gains', async () => {
    const w = world();
    const dot = await w.player('Dot', openBase(77));
    const ann = await w.player('Ann', baseAt(1));
    w.pastShields();
    await w.repo.updatePlayer(dot.id, { trophies: 500 });
    await w.repo.updatePlayer(ann.id, { trophies: 480 });
    const m = (await ann.match())!;
    expect(m.opponent.name).toBe('Dot');
    const seed = (await ann.startAttack!(m.ticket)).seed!;
    const r = await ann.submitAttack({ ticket: m.ticket, seed, ...rush(20) });
    expect(r.result.stars).toBeGreaterThanOrEqual(1);
    expect(r.trophies).toBeGreaterThan(0);
    expect((await dot.me()).trophies).toBe(500);
    expect(Math.abs((await dot.defenses(0)).defenses[0].trophies)).toBe(0);
  });
});

describe('declared stakes', () => {
  it('a missed stake carries nothing and the defender keeps its loot', async () => {
    const w = world();
    const dot = await w.player('Dot', baseAt(2, 21, 500));
    const ann = await w.player('Ann', baseAt(1));
    w.pastShields();
    const m = (await ann.match())!;
    expect(m.opponent.name).toBe('Dot');
    const started = await ann.startAttack!(m.ticket, 3);
    expect(started.stake).toBe(3);
    // A tiny rush against a Keep 2 base: no three stars.
    const r = await ann.submitAttack({ ticket: m.ticket, seed: started.seed!, ...rush(3) });
    expect(r.result.stars).toBeLessThan(3);
    expect(r.stake).toBe(3);
    const d = (await dot.defenses(0)).defenses[0];
    expect(d.result.loot).toEqual({});
  });
});

describe('exhausted stores and exposure targeting', () => {
  it('a village raided within exposureHours is offered after one that was not, and its loot is halved per lost raid', async () => {
    const w = world();
    const fresh = await w.player('Fresh', openBase(31, 400));
    const farmed = await w.player('Farmed', openBase(33, 400));
    const raiders = [await w.player('Ann', baseAt(1)), await w.player('Ben', baseAt(1, 5)), await w.player('Cy', baseAt(1, 6))];
    const g = await raiders[0].createGrove('Trio');
    for (const r of raiders.slice(1)) await r.joinGrove(g.id);
    w.pastShields();
    // Farmed is raided (and lost) once.
    await w.repo.updatePlayer(fresh.id, { shieldUntil: w.now() + 10 * HOUR });
    const m1 = (await raiders[0].match())!;
    expect(m1.opponent.name).toBe('Farmed');
    const full = sumLoot(m1.base);
    const r1 = await raiders[0].submitAttack({ ticket: m1.ticket, seed: (await raiders[0].startAttack!(m1.ticket)).seed!, ...rush(20) });
    expect(r1.result.stars).toBeGreaterThanOrEqual(1);
    // Both open again: the one not raided recently is offered first.
    await w.repo.updatePlayer(fresh.id, { shieldUntil: 0 });
    await w.repo.updatePlayer(farmed.id, { shieldUntil: 0 });
    w.advance(HOUR);
    const m2 = (await raiders[1].match())!;
    expect(m2.opponent.name).toBe('Fresh');
    // With Fresh shielded, Farmed comes back with its stores exhausted.
    await w.repo.updatePlayer(fresh.id, { shieldUntil: w.now() + 10 * HOUR });
    const m3 = (await raiders[2].match())!;
    expect(m3.opponent.name).toBe('Farmed');
    expect(sumLoot(m3.base)).toBeLessThanOrEqual(Math.floor(full * defaultData.raids.exhaustion!.factor) + m3.base.buildings.length);
  });
});
