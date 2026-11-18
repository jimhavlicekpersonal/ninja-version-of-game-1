/**
 * P4-10 step 3 (BNL-03, BNL-04): the gate a planned building or hero must pass before it may be marked live. Slow (the
 * preview at 30 bases a cell: six layouts x five seeds): in SLOW_TESTS (tests/slow.ts), not in `npm test`.
 *
 * - A counter may go live only if its effect (with it minus with its body only) is -3 points or better against the
 *   armies it is meant to beat, at two of the three Keeps measured.
 * - A hero may go live only if, with its own family's army, it beats the Shadow Captain by 5 points or more at each
 *   of its three Keeps (sent first or last, whichever is better), and with the raid mix it is no more than 3 points
 *   below him.
 *
 * Today's failures are listed the KNOWN_BELOW way (2026-11-18, SIM_RULES 8): each listed item must still fail, so the
 * test fails when one passes (then it leaves the list and may be considered for going live), and nothing else may.
 */
import { describe, expect, it } from 'vitest';
import { runBuildingPreview, runHeroPreview } from '../../../tools/balance/preview';

const OPTS = { layouts: ['random', 'kunai_ring', 'walled_keep', 'mortar_core', 'twin_gates', 'open_court'], seeds: 5 };
const COUNTER_KNOWN_BELOW = new Set<string>([
  // Every planned counter but the Lightning Rod Tower (effect -5.8 / -3.8 / -3.0 at its three Keeps: it passes).
  'whirling_blade_tower', 'rain_barrel_tower', 'listening_jars', 'living_bamboo_wall', 'straw_scarecrow', 'mirror_screen', 'sand_bucket_post',
  'discipline_banner', 'spotter_perch', 'steam_vent', 'sleep_dart_tower', 'rolling_log_chute', 'moonlit_gravel', 'ink_seal_post',
]);
const HERO_KNOWN_BELOW = new Set<string>([
  // Rally B (P4-02) raised the bar: with their own family each is 0.6 to 10.5 points below the Shadow Captain somewhere.
  'iron_matriarch', 'sky_admiral', 'grand_sensei',
]);

describe('the go-live gate for planned content (none of it is live)', () => {
  it('counters: effect -3 or better against the armies they beat, at two of three Keeps', { timeout: 3_600_000 }, () => {
    const rows = runBuildingPreview(OPTS).filter((r) => r.army === 'it beats');
    const ids = [...new Set(rows.map((r) => r.id))];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const passing = rows.filter((r) => r.id === id && r.withIt - r.bodyOnly <= -3).length;
      const ok = passing >= 2;
      if (COUNTER_KNOWN_BELOW.has(id)) expect(ok, `${id} now passes the gate: remove it from COUNTER_KNOWN_BELOW`).toBe(false);
      else expect(ok, id).toBe(true);
    }
  });

  it('heroes: own family +5 over the Shadow Captain at each Keep, raid mix no more than 3 below', { timeout: 3_600_000 }, () => {
    const rows = runHeroPreview(OPTS);
    for (const id of [...new Set(rows.map((r) => r.id))]) {
      const mine = rows.filter((r) => r.id === id);
      const family = mine.filter((r) => r.army !== 'raid mix');
      const mix = mine.filter((r) => r.army === 'raid mix');
      const ok = family.every((r) => Math.max(r.hero, r.heroLast) - r.captain >= 5) && mix.every((r) => Math.max(r.hero, r.heroLast) - r.captain >= -3);
      if (HERO_KNOWN_BELOW.has(id)) expect(ok, `${id} now passes the gate: remove it from HERO_KNOWN_BELOW`).toBe(false);
      else expect(ok, id).toBe(true);
    }
  });
});
