/**
 * Equal-housing army compositions across Keeps (tools/balance/armyLab.ts).
 * The full matrix is in docs/game-theory/ARMY_BALANCE.md (`npm run balance:armies`);
 * this is a small, fast slice of it that guards the big regressions:
 *
 * - Keep 7-15 bases used to fall to every army at 100% / 3 stars, because
 *   building levels past Keep 6 grew ~1.17x per Keep while armies grew ~1.4x.
 * - The live counters must cost the armies they are built against something.
 * - Air used to win ~100% at every Keep (flyers skip walls and ground defenses
 *   but had a full power budget); the Sky role now pays for that.
 */
import { describe, expect, it } from 'vitest';
import { COMPOSITIONS, buildArmy, familyOf, runLab, troopKeep } from '../../../tools/balance/armyLab';
import { maxHousingAtHall } from '../../../src/gameplay/sim/army';
import { defaultData as data } from '../../../src/gameplay/sim/data';

describe('army lab setup', () => {
  it('every army fills (almost) the same housing at a Keep, so compositions compare fairly', () => {
    for (const keep of [6, 12, 15]) {
      const cap = maxHousingAtHall(keep, data);
      for (const c of COMPOSITIONS) {
        const army = buildArmy(c, keep, data);
        if (!army) continue;
        const used = Object.entries(army).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
        expect(used, `${c.id} @ Keep ${keep}`).toBeLessThanOrEqual(cap);
        expect(used, `${c.id} @ Keep ${keep}`).toBeGreaterThanOrEqual(cap * 0.85);
        for (const t of Object.keys(army)) expect(troopKeep(t, data)).toBeLessThanOrEqual(keep);
      }
    }
  });

  it('every family has troops by Keep 6', () => {
    for (const f of ['melee', 'artillery', 'support', 'air', 'shadow', 'siege'] as const) {
      expect(Object.keys(data.troops).some((t) => familyOf(data.troops[t]) === f && troopKeep(t, data) <= 6), f).toBe(true);
    }
  });
});

describe('late-Keep bases hold up and counters matter', () => {
  const rows = runLab({ keeps: [12, 15], layouts: ['random', 'walled_keep', 'open_court'], seeds: 2, compareCounters: true });
  const at = (comp: string, keep: number) => {
    const r = rows.filter((x) => x.comp === comp && x.keep === keep);
    return {
      destruction: r.reduce((s, x) => s + x.destruction, 0) / r.length,
      noCounters: r.reduce((s, x) => s + (x.destructionNoCounters ?? 0), 0) / r.length,
    };
  };

  it('at Keep 12 and 15, most compositions no longer flatten a same-Keep base', { timeout: 120_000 }, () => {
    for (const keep of [12, 15]) {
      const below = COMPOSITIONS.filter((c) => at(c.id, keep).destruction < 90).length;
      expect(below, `Keep ${keep}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('the counters cost the armies they answer (artillery, support, shadow) destruction at Keep 12', () => {
    // Per-army numbers are noisy with a handful of fights; the combined cost is not.
    // (Each counter's own effect is pinned exactly in tests/gameplay/battle/counters.test.ts.)
    const cost = ['artillery', 'support', 'shadow'].reduce((s, comp) => s + at(comp, 12).noCounters - at(comp, 12).destruction, 0);
    expect(cost).toBeGreaterThan(0);
  });

  it('air no longer wins everything: it stays below 95% at Keep 12 and 15', () => {
    for (const keep of [12, 15]) expect(at('air', keep).destruction, `Keep ${keep}`).toBeLessThan(95);
  });
});
