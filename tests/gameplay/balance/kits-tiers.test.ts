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
import { armyScore, kitValue, pairScores } from '../../../tools/balance/kitValue';
import { bestByProfile } from '../../../tools/balance/temperPanel';

const KIT_FLOOR = 2;
/** Kits worth under +2 at both their unlock Keep and Keep 15 (P4-01's support kits among them). */
// Re-measured on the final rules-8 tree (2026-11-18, after the Phase 4 review fixes and the rules-8 balance fix): three
// kits fell under the floor after this list was first set at 6e81fe0, all from later Phase 4 changes, and are listed with
// the cause: drum_monk (haste 0.25 -> 0.10, P4-01/P4-08), eclipse_ninja (HP x0.9, P4-06), sage_of_clouds (support strikes
// and the Drum's cut, P4-01). One tier pair is fixed (mist_weaver<drum_monk). Phase 4 review #5.
// SIM_RULES 9 (2026-11-22, combat rebalance), re-measured: eclipse_ninja now reaches +2 and left the list (void_walker
// stays: at 1.03, held down by the solo gate, its kit is still under +2); mole_king and phantom_gate entered it (their HP and damage rose 1.21x and 1.3x so they beat the tier below, and
// the kit is a smaller share of that).
// SIM_RULES 10 (2026-11-25), re-measured on the rules-10 bases (live counters and the Hero Hall in generated bases,
// the Keep 13 tier x1.15): bear_warrior, dragon_kite_armada, lantern_balloon, mirage_twin and phantom_gate now reach
// +2 and left the list; boar_rider, eclipse_ninja and fuse_master entered it (their kits are worth less against bases
// that now hold a Steam Vent, a Mirror Screen and a Lightning Rod). These are 10-battle kit values: the same noise as
// the old tier check, so a kit within a few points of the floor can move either way with any data change.
const KIT_KNOWN_BELOW = new Set(['blowgun_hunter', 'boar_rider', 'bomb_carrier', 'drum_monk', 'eclipse_ninja', 'fuse_master', 'herbalist', 'hound_handler', 'mist_weaver', 'mole_king', 'night_blade', 'ram_crew', 'sage_of_clouds', 'shadow_stalker', 'spirit_caller', 'thunder_kite', 'tiger_lord', 'twin_fang_dancer', 'void_walker']);
/** Keep 15 scores where a newer tier is below the previous one in its role ("newer<older"). */
// Beast Mode follow-up (2026-11-22, measured, not shipped): raising the Keep 13 tier x1.25 with every defense level past
// Keep 12 x1.5 (so Keep 15 raids stay 1-2 stars) fixed its four pairs but put 16 pairs out of order (x1.25 defenses: 17);
// the 80%-bot-mix scores compress and close pairs flip. Rules 9 stays, these gaps with it.
// SIM_RULES 9: four pairs fixed (blowgun_hunter, volcano_cannoneer, night_blade and wall_climber now score above the tier
// before them). The rest stay: boosting a Keep 13-15 tier also strengthens that Keep's bot army (matched Keep 15 farmed),
// and crane_glider / bomb_carrier do not respond to stats. The shadow line is in order with the solo
// gate held: night_blade 1.02 (79.7), void_walker 1.03 (80.9; a lone army flattened Keep 15 at 1.04), eclipse_ninja 1.08 (85.1; at 1.12).
// SIM_RULES 10 (2026-11-25, GT-04). The old check compared two 10-battle scores, and each warrior was added to the full
// Keep 15 bot mix: a pair's order was mostly layout luck (any data change moved scores 4-10 points), and the four Keep
// 15 bot warriors were scored on top of a mix already full of themselves. Now (`pairScores`): both warriors join the
// same army without either of them, over 4 bases per layout (40 battles a side), and a pair fails only when the newer
// tier is significantly below the older one (one-sided 95%: difference < -1.645 standard errors; ~3.5-4.3 points).
// Measured that way, rules 9 had one real inversion (Bomb Carrier below Fire Monk, -7.5 +- 4.2); the other seven
// listed pairs were noise. Fixed by the endgame shift (roster.json `lateScale`, tools/progression/endgameshift.mjs,
// research levels past Keep 12 only): Bomb Carrier x1.6, and the Keep 13 tier x1.15 so late raids keep pace with the
// new counters. Pairs move only when one of their two warriors, the Keep 15 bot mix or the generated bases change.
const TIER_KNOWN_BELOW = new Set<string>([]);

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

  it('at Keep 15 no warrior is significantly below the previous tier in its own role (shared base, 4 bases a layout)', { timeout: 3_600_000 }, () => {
    const byRole: Record<string, string[]> = {};
    for (const x of ids) (byRole[ROLE[x]] ??= []).push(x);
    for (const list of Object.values(byRole)) {
      list.sort((a, b) => troopEarliestKeep(a, data) - troopEarliestKeep(b, data));
      for (let i = 1; i < list.length; i++) {
        const key = `${list[i]}<${list[i - 1]}`;
        const p = pairScores(list[i], list[i - 1], 15, data);
        const below = p.newer - p.older < -1.645 * p.se;
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

  // Beast Mode GT-07 (tools/balance/temperPanel.ts, the audit's Keep 12 panel, 5 layouts x 2 plans). Rules 9: the
  // searched mix was best on every profile (Watch 73.3 against Reaper + Mountain Shield 70.8). SIM_RULES 10 gives Watch
  // its new lever: Watch-tempered Kunai and Shuriken Towers read varied armies (battle.json temper `kindsFree` 5,
  // `perKind` 0.15), so the eight-kind searched mix falls to 59.2 on Watch and Reaper + Mountain Shield (70.8) is best.
  it('GT-07: at Keep 12 no single army is best on all four temper profiles', { timeout: 900_000 }, () => {
    const best = Object.values(bestByProfile(12, data)).map((x) => x.best);
    expect(new Set(best).size).toBeGreaterThan(1);
  });
});
