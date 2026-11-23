/**
 * Beast Mode 2026-11-21 GT-11 step 2 (slow, `npm run test:slow`): a searched attacker (every Infiltration Point ×
 * wave order × two seeds in the 'together' formation, `tools/balance/search.ts`; all three formations took over 25
 * minutes) with a same-Keep capped army does not wipe a
 * same-Keep base at its caps. If it did, a competent player would farm three stars wherever the raid bots do not.
 */
import { describe, expect, it } from 'vitest';
import { cappedArmy, cappedBase, searchAttack } from '../../../tools/balance/search';

const BASES = 1;
/** Beast Mode GT-11: `SEARCH_FORMATIONS=all` searches every formation (a release run, over 25 minutes); default 'together'. */
const FORMATIONS = process.env.SEARCH_FORMATIONS === 'all' ? undefined : (['together'] as const);

describe('searched attacker against capped same-Keep bases', () => {
  for (const keep of [8, 12, 15]) {
    it(`Keep ${keep}: the best searched attack stays at or under 95% destruction`, () => {
      const { army, levels } = cappedArmy(keep);
      for (let b = 0; b < BASES; b++) {
        const setup = { seed: 7000 + keep * 13 + b, base: cappedBase(keep, b), army, levels, infiltration: true };
        const r = searchAttack(setup, undefined, [setup.seed, setup.seed + 1], FORMATIONS ? [...FORMATIONS] : undefined);
        expect(r.tried).toBeGreaterThan(12);
        expect(r.destruction, `Keep ${keep} base ${b}: ${r.order}/${r.formation} at point ${r.point}`).toBeLessThanOrEqual(95);
      }
    }, process.env.SEARCH_FORMATIONS === 'all' ? 3_600_000 : 600_000);
  }
});
