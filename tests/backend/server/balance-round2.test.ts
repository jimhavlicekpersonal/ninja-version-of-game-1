/**
 * Balance audit 2026-11-08, round-2 rules on the server (docs/PROTOCOL.md version 11): staked honor,
 * declared stakes fixed at start, exhausted stores and exposure targeting.
 */
import { describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';
import { baseAt, HOUR, rush, sumLoot, world } from './harness';
import { MAX_HONOR_FROM_ONE_ATTACKER } from '../../../server/core/pvp';

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
    // Keep 1 and 2 players: stakes opened at Keep 1 here (they open from raids.stakes.minKeep, GT-10).
    const w = world({ data: { ...defaultData, raids: { ...defaultData.raids, stakes: { ...defaultData.raids.stakes!, minKeep: 1 } } } });
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
    // XPL-12 (P1-20): nothing was taken, so no shield for the defender (and no exhausted stores).
    expect((await dot.me()).shieldUntil).toBeLessThanOrEqual(w.now());
  });

  it("one attacker's lost raids give one defender at most MAX_HONOR_FROM_ONE_ATTACKER honor a day (P1-20)", async () => {
    const w = world();
    const dot = await w.player('Dot', baseAt(1, 21, 500));
    const ann = await w.player('Ann', baseAt(1, 5));
    w.pastShields();
    await w.repo.updatePlayer(dot.id, { trophies: 1000 });
    await w.repo.updatePlayer(ann.id, { trophies: 1000 });
    let gained = 0;
    let raids = 0;
    for (let i = 0; i < 6; i++) {
      await w.repo.updatePlayer(dot.id, { shieldUntil: 0 });
      const m = (await ann.match())!;
      if (m.opponent.name !== 'Dot') break;
      const before = (await dot.me()).trophies;
      const r = await ann.submitAttack({ ticket: m.ticket, seed: (await ann.startAttack!(m.ticket)).seed!, ...rush(1) });
      expect(r.result.stars).toBe(0);
      gained += (await dot.me()).trophies - before;
      raids++;
      // A target attacked in the last hour is not offered again.
      w.advance(HOUR + 60_000);
    }
    expect(raids).toBeGreaterThanOrEqual(3);
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThanOrEqual(MAX_HONOR_FROM_ONE_ATTACKER);
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
