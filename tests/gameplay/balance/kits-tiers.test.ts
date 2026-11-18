/**
 * P4-05 (CMB-04): two lab gates, measured with tools/balance/kitValue.ts (the audit's t7 method: the bot mix at 80% of
 * the housing plus 20% of one warrior, 5 layouts x 2 bot plans, the hero along). Slow (about 1,900 battles): in
 * SLOW_TESTS (tests/slow.ts), run by `npm run test:slow` and CI, not by `npm test`.
 *
 * Today's failures are listed the KNOWN_BELOW way (2026-11-18, SIM_RULES 8): each listed cell must still fail (so the
 * test fails when one is fixed, and then it leaves the list) and every other cell must pass, so the lists only shrink.
 * Ten-battle cells move 4+ points with any data change; a change that moves a cell either way fails here on purpose.
 */
import { describe, expect, it } from 'vitest';
import { maxHousingAtHall, troopEarliestKeep } from '../../../src/gameplay/sim/army';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import roster from '../../../src/gameplay/data/roster.json';
import { armyScore, kitValue } from '../../../tools/balance/kitValue';

const KIT_FLOOR = 2;
/** Kits worth under +2 at both their unlock Keep and Keep 15 (P4-01's support kits among them). */
const KIT_KNOWN_BELOW = new Set(['bear_warrior', 'dragon_kite_armada', 'hound_handler', 'mist_weaver', 'shadow_stalker', 'bomb_carrier', 'night_blade', 'ram_crew', 'twin_fang_dancer', 'lantern_balloon', 'thunder_kite', 'void_walker', 'blowgun_hunter', 'herbalist', 'mirage_twin', 'spirit_caller', 'tiger_lord']);
/** Keep 15 scores where a newer tier is below the previous one in its role ("newer<older"). */
const TIER_KNOWN_BELOW = new Set(['boar_rider<hawk_tamer', 'crane_glider<owl_bomber', 'blowgun_hunter<shuriken_storm', 'thousand_needle<chain_sickle_reaper', 'wall_climber<mole_digger', 'mist_weaver<drum_monk', 'oni_breaker<mountain_shield', 'night_blade<mirage_twin', 'wind_step_assassin<twin_fang_dancer', 'storm_sovereign<moonblade_master', 'ghost_engineer<fuse_master', 'bomb_carrier<fire_monk', 'volcano_cannoneer<siege_bombardier']);

const ROLE: Record<string, string> = Object.fromEntries((roster.warriors as { role: string; liveTroop?: string }[]).filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.role]));
const ids = Object.keys(data.troops).sort();
const at15 = new Map(ids.map((x) => [x, kitValue(x, 15, data)]));

describe('P4-05 lab gates (known gaps listed, not hidden)', () => {
  it(`every non-empty kit is worth at least +${KIT_FLOOR} points at its unlock Keep or at Keep 15`, { timeout: 1_800_000 }, () => {
    for (const x of ids) {
      const k15 = at15.get(x)!.kit;
      if (k15 === null) continue;
      const unlock = Math.max(2, troopEarliestKeep(x, data));
      const ok = k15 >= KIT_FLOOR || (unlock < 15 && (kitValue(x, unlock, data).kit ?? 0) >= KIT_FLOOR);
      if (KIT_KNOWN_BELOW.has(x)) expect(ok, `${x}'s kit now reaches +${KIT_FLOOR}: remove it from KIT_KNOWN_BELOW`).toBe(false);
      else expect(ok, `${x}'s kit`).toBe(true);
    }
  });

  it('at Keep 15 no warrior scores below the previous tier in its own role', { timeout: 600_000 }, () => {
    const byRole: Record<string, string[]> = {};
    for (const x of ids) (byRole[ROLE[x]] ??= []).push(x);
    for (const list of Object.values(byRole)) {
      list.sort((a, b) => troopEarliestKeep(a, data) - troopEarliestKeep(b, data));
      for (let i = 1; i < list.length; i++) {
        const key = `${list[i]}<${list[i - 1]}`;
        const below = at15.get(list[i])!.score < at15.get(list[i - 1])!.score;
        if (TIER_KNOWN_BELOW.has(key)) expect(below, `${key} is fixed: remove it from TIER_KNOWN_BELOW`).toBe(true);
        else expect(below, key).toBe(false);
      }
    }
  });
});

describe('P4-06 (CMB-03): no single-warrior army flattens Keep 15', () => {
  it('every one-warrior army stays under 85% on untempered Keep 15 bases', { timeout: 900_000 }, () => {
    for (const x of ids) {
      const n = Math.floor(maxHousingAtHall(15, data) / data.troops[x].housing);
      expect(armyScore({ [x]: n }, 15, data), x).toBeLessThan(85);
    }
  });

  // Listed so it stays visible until a later pass closes it (the audit: at Keep 12 one searched mix is the best answer
  // to every temper profile; no measurement in this pass changed that).
  it.todo('KNOWN GAP (P4-06): one army is best on all four temper profiles at Keep 12');
});
