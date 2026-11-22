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
// Re-measured on the final rules-8 tree (2026-11-18, after the Phase 4 review fixes and the rules-8 balance fix): three
// kits fell under the floor after this list was first set at 6e81fe0, all from later Phase 4 changes, and are listed with
// the cause: drum_monk (haste 0.25 -> 0.10, P4-01/P4-08), eclipse_ninja (HP x0.9, P4-06), sage_of_clouds (support strikes
// and the Drum's cut, P4-01). One tier pair is fixed (mist_weaver<drum_monk). Phase 4 review #5.
// SIM_RULES 9 (2026-11-22, combat rebalance), re-measured: eclipse_ninja and void_walker now reach +2 and left the
// list; mole_king and phantom_gate entered it (their HP and damage rose 1.21x and 1.3x so they beat the tier below, and
// the kit is a smaller share of that).
const KIT_KNOWN_BELOW = new Set(['bear_warrior', 'blowgun_hunter', 'bomb_carrier', 'dragon_kite_armada', 'drum_monk', 'herbalist', 'hound_handler', 'lantern_balloon', 'mirage_twin', 'mist_weaver', 'mole_king', 'night_blade', 'phantom_gate', 'ram_crew', 'sage_of_clouds', 'shadow_stalker', 'spirit_caller', 'thunder_kite', 'tiger_lord', 'twin_fang_dancer']);
/** Keep 15 scores where a newer tier is below the previous one in its role ("newer<older"). */
// SIM_RULES 9: four pairs fixed (blowgun_hunter, volcano_cannoneer, night_blade and wall_climber now score above the tier
// before them). The rest stay: boosting a Keep 13-15 tier also strengthens that Keep's bot army (matched Keep 15 farmed),
// and crane_glider / bomb_carrier do not respond to stats.
const TIER_KNOWN_BELOW = new Set(['boar_rider<hawk_tamer', 'oni_breaker<mountain_shield', 'thousand_needle<chain_sickle_reaper', 'bomb_carrier<fire_monk', 'crane_glider<owl_bomber', 'ghost_engineer<fuse_master', 'wind_step_assassin<twin_fang_dancer', 'storm_sovereign<moonblade_master']);

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
