/**
 * Beast Mode 2026-11-21 GT-11 step 2 (slow, `npm run test:slow`): a searched attacker (every Infiltration Point ×
 * formation × wave order × two seeds, `tools/balance/search.ts`) with a same-Keep capped army does not wipe a
 * same-Keep base at its caps. If it did, a competent player would farm three stars wherever the raid bots do not.
 */
import { describe, expect, it } from 'vitest';
import { cappedArmy, cappedBase, searchAttack } from '../../../tools/balance/search';

const BASES = 2;

describe('searched attacker against capped same-Keep bases', () => {
  for (const keep of [8, 12, 15]) {
    it(`Keep ${keep}: the best searched attack stays at or under 95% destruction`, () => {
      const { army, levels } = cappedArmy(keep);
      for (let b = 0; b < BASES; b++) {
        const r = searchAttack({ seed: 7000 + keep * 13 + b, base: cappedBase(keep, b), army, levels, infiltration: true });
        expect(r.tried).toBeGreaterThan(18);
        expect(r.destruction, `Keep ${keep} base ${b}: ${r.order}/${r.formation} at point ${r.point}`).toBeLessThanOrEqual(95);
      }
    }, 600_000);
  }
});
