/**
 * Equal-housing army compositions across Keeps (tools/balance/armyLab.ts).
 * The full matrix is in docs/game-theory/ARMY_BALANCE.md (`npm run balance:armies`);
 * this is a small, fast slice of it that guards the big regressions:
 *
 * - Keep 7-15 bases used to fall to every army at 100% / 3 stars, because
 *   building levels past Keep 6 grew ~1.17x per Keep while armies grew ~1.4x.
 * - Air used to win ~100% at every Keep (flyers skip walls and ground defenses
 *   but had a full power budget); the Sky role now pays for that.
 * - Outcome gates (audit F37): formula checks pass by construction, so these
 *   check real battles. Ranged-heavy armies used to three-star 69-100% of
 *   same-Keep bases while melee, air and shadow managed 0-4%.
 * - Counters are measured honestly (audit F35): the same bases, deployments and
 *   Infiltration Points, with only the counter effects switched off.
 * - Keep 7 used to be a hole: Keep 7 bases fielded Keep 6 defense levels while
 *   Keep 7 armies gained two research levels and a new tier. Keep 7 now unlocks
 *   the Kunai Tower's level 9, the Pagoda's level 8 and the Mortar's level 6,
 *   and the step into the late-Keep curve is smoothed (tools/balance/midkeep.mjs).
 */
import { describe, expect, it } from 'vitest';
import { COMPOSITIONS, buildArmy, familyOf, runLab, troopKeep, withoutCounterEffects } from '../../../tools/balance/armyLab';
import { maxHousingAtHall } from '../../../src/gameplay/sim/army';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';

describe('army lab setup', () => {
  it('every army fills the same housing at a Keep (at least 97%), so compositions compare fairly', () => {
    for (const keep of [6, 12, 15]) {
      const cap = maxHousingAtHall(keep, data);
      for (const c of COMPOSITIONS) {
        const army = buildArmy(c, keep, data);
        if (!army) continue;
        const used = Object.entries(army).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
        expect(used, `${c.id} @ Keep ${keep}`).toBeLessThanOrEqual(cap);
        expect(used, `${c.id} @ Keep ${keep}`).toBeGreaterThanOrEqual(c.id === 'mixed' ? cap * 0.85 : cap * 0.97);
        for (const t of Object.keys(army)) expect(troopKeep(t, data)).toBeLessThanOrEqual(keep);
      }
    }
  });

  it('every family has troops by Keep 6', () => {
    for (const f of ['melee', 'artillery', 'support', 'air', 'shadow', 'siege'] as const) {
      expect(Object.keys(data.troops).some((t) => familyOf(data.troops[t]) === f && troopKeep(t, data) <= 6), f).toBe(true);
    }
  });

  it('switching counter effects off keeps the base, its objectives and its Infiltration Points identical', () => {
    const plain = withoutCounterEffects(data);
    for (const keep of [12, 15]) {
      const base = generateOpponent(5000 + keep * 131, keep, data, { levelBias: 0.5 });
      const setup = { seed: 77, base, army: { hedgehog_roller: 10 }, infiltration: true };
      const on = createBattle(setup, data);
      const off = createBattle(setup, plain);
      expect(off.entry).toEqual(on.entry);
      expect(off.countable).toBe(on.countable);
      expect(off.buildings.map((b) => [b.id, b.hp])).toEqual(on.buildings.map((b) => [b.id, b.hp]));
      expect(on.buildings.some((b) => b.effect)).toBe(true);
      expect(off.buildings.some((b) => b.effect)).toBe(false);
    }
  });
});

describe('late-Keep bases hold up and counters are in play', () => {
  const rows = runLab({ keeps: [12, 15], layouts: ['random', 'walled_keep', 'open_court'], seeds: 2, compareCounters: true });
  const at = (comp: string, keep: number) => {
    const r = rows.filter((x) => x.comp === comp && x.keep === keep);
    const events: Record<string, number> = {};
    for (const x of r) for (const [k, v] of Object.entries(x.counterEvents)) events[k] = (events[k] ?? 0) + v / r.length;
    return {
      destruction: r.reduce((s, x) => s + x.destruction, 0) / r.length,
      noCounters: r.reduce((s, x) => s + (x.destructionNoCounters ?? 0), 0) / r.length,
      events,
    };
  };

  it('at Keep 12 and 15, most compositions no longer flatten a same-Keep base', { timeout: 120_000 }, () => {
    for (const keep of [12, 15]) {
      const below = COMPOSITIONS.filter((c) => at(c.id, keep).destruction < 90).length;
      expect(below, `Keep ${keep}`).toBeGreaterThanOrEqual(COMPOSITIONS.length - 1);
    }
  });

  it('each counter acts in its matchup: the Ballista grounds flyers, the Lantern lights veiled warriors', () => {
    for (const keep of [12, 15]) {
      expect(at('air', keep).events.grounded ?? 0, `grounded @ ${keep}`).toBeGreaterThan(0);
      expect(at('support', keep).events.lit ?? 0, `lit @ ${keep}`).toBeGreaterThan(0);
    }
  });

  it('the counter effects never help the armies they answer (same bases, effects on vs off)', () => {
    // The effects alone are worth a few points at most (the buildings themselves matter more);
    // what must not happen is an effect that makes the defense worse.
    const cost = ['artillery', 'support', 'air', 'support_light'].reduce((s, comp) => s + at(comp, 12).noCounters - at(comp, 12).destruction + at(comp, 15).noCounters - at(comp, 15).destruction, 0);
    expect(cost).toBeGreaterThanOrEqual(-4);
  });

  it('air no longer wins everything: it stays below 95% at Keep 12 and 15', () => {
    for (const keep of [12, 15]) expect(at('air', keep).destruction, `Keep ${keep}`).toBeLessThan(95);
  });
});

describe('outcome gates: no composition dominates (audit F22, F23, F37)', () => {
  // Keep 7 is where armies gain two research levels and a new tier while its
  // bases used to field only Keep 6 levels (every army scored ~100% there).
  const keeps = [7, 8, 15];
  const rows = runLab({ keeps, layouts: ['random', 'kunai_ring', 'mortar_core'], seeds: 2 });
  const cell = (comp: string, keep: number) => {
    const r = rows.filter((x) => x.comp === comp && x.keep === keep);
    return { destruction: r.reduce((s, x) => s + x.destruction, 0) / r.length, threeStar: r.reduce((s, x) => s + x.threeStar, 0) / r.length };
  };

  it('no army flattens same-Keep bases: under 92% destruction and at most 60% three-star raids', { timeout: 120_000 }, () => {
    for (const keep of keeps) {
      for (const c of COMPOSITIONS) {
        const v = cell(c.id, keep);
        expect(v.destruction, `${c.id} @ Keep ${keep}`).toBeLessThan(92);
        expect(v.threeStar, `${c.id} @ Keep ${keep}`).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('a ranged-heavy army does not beat a balanced melee + ranged + support mix by more than 20 points', () => {
    for (const keep of keeps) expect(cell('artillery', keep).destruction - cell('support_light', keep).destruction, `Keep ${keep}`).toBeLessThan(20);
  });

  it('realistic mixes stay within 35 points of each other', () => {
    for (const keep of keeps) {
      const v = ['mixed', 'artillery', 'support_light', 'breach'].map((c) => cell(c, keep).destruction);
      expect(Math.max(...v) - Math.min(...v), `Keep ${keep}`).toBeLessThan(35);
    }
  });
});
