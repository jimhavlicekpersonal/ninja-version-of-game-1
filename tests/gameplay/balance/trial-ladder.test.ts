/**
 * Beast Mode 2026-11-21 GT-09 (slow): the Shadow Trials ladder against the raid bots' capped army at each tier's Keep
 * (with that Keep's hero), four battle seeds a tier (`tools/balance/trialLadder.ts`). The bot plan is weak (a player
 * does better), so "cleared once in four" is a floor, not a promise.
 */
import { describe, expect, it } from 'vitest';
import { measureLadder } from '../../../tools/balance/trialLadder';

describe('Shadow Trials ladder (GT-09)', () => {
  const rows = measureLadder(Array.from({ length: 60 }, (_, i) => i + 1));

  it('every tier 1-60 is cleared at least once in four bot-plan battles', () => {
    for (const r of rows) expect(r.clears, `tier ${r.tier} (Keep ${r.keep}): ${r.destruction.toFixed(0)}%`).toBeGreaterThanOrEqual(1);
  });

  // KNOWN FAILING (GT-09 target): destruction should never jump more than 15 points from one tier to the next.
  // Measured 2026-11-21 after levelBiasRange [0.25, 0.75] and the Ironclad shift: the largest rise is 50 points
  // (tier 48 -> 49), from layouts and modifiers more than from the Keep step (it was 68 at 32 -> 33).
  it.fails('destruction never rises more than 15 points from a tier to the next', () => {
    for (let i = 1; i < rows.length; i++) expect(rows[i].destruction - rows[i - 1].destruction, `tier ${rows[i].tier}`).toBeLessThanOrEqual(15);
  });
}, 600_000);
