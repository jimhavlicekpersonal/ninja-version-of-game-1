/**
 * The late-game failure loop (design re-audit, Nov 2026): long campaigns measured casual
 * players at 0.00-0.11 average stars at Keeps 11-15 and regular players at 0.50 at Keep 15,
 * because an army two research levels behind its Keep's caps still read as ~0.9 of the Keep
 * and met bases near their caps. Strength now reads the Keep the research matches
 * (`attackerStrength`, `researchKeep`; at most `researchFloorKeeps` below the own Keep), so an unplanned attack (the bot plan) by a player
 * whose honor has fallen to the floor lands near 1-2 stars at every Keep, without three-star
 * farming. Long campaigns: docs/game-theory/CAMPAIGN.md (`npm run balance:campaign`).
 */
import { describe, expect, it } from 'vitest';
import { matchedRaids } from '../../../tools/balance/matched';
import { attackerStrength, researchKeep } from '../../../src/gameplay/sim/matchmaking';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { matchedVillage } from '../../../tools/balance/matched';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';

const KEEPS = [5, 8, 12, 15];

describe('matched raids average about one to two stars at every Keep (raid bots\' mix, bot plan)', () => {
  // 12 seeds (6 until Tempering): rival clans' outposts now differ in temper and closeness to the caps, and six
  // seeds swung a Keep-15 row between 0.67 and 1.29 stars with the same data (24 seeds: 1.21-1.54 at every Keep).
  const rows = KEEPS.flatMap((k) => [0, 2].map((lag) => matchedRaids(k, lag, 'bots', 12, data)));

  it('researched to the caps: 1-2 stars on average at every Keep band, never a three-star farm', { timeout: 180_000 }, () => {
    for (const r of rows.filter((x) => x.lag === 0)) {
      expect(r.stars, `Keep ${r.keep}`).toBeGreaterThanOrEqual(1);
      expect(r.stars, `Keep ${r.keep}`).toBeLessThanOrEqual(2.2);
      expect(r.threeStar, `Keep ${r.keep}`).toBeLessThanOrEqual(0.6);
      expect(r.opponentKeep, `Keep ${r.keep}`).toBe(r.keep);
    }
    const avg = rows.filter((x) => x.lag === 0).reduce((a, x) => a + x.stars, 0) / KEEPS.length;
    expect(avg).toBeGreaterThanOrEqual(1.2);
    expect(avg).toBeLessThanOrEqual(1.8);
  });

  it('two research levels behind (a casual pace): still at least one star on average, against bases of its research', () => {
    for (const r of rows.filter((x) => x.lag === 2)) {
      expect(r.stars, `Keep ${r.keep}`).toBeGreaterThanOrEqual(1);
      expect(r.opponentKeep, `Keep ${r.keep}`).toBeLessThanOrEqual(r.keep);
    }
  });

  it('strength is the Keep the research matches: two levels behind reads below the Keep', () => {
    for (const k of [8, 12, 15]) {
      const army = botArmy(k, 1, data);
      expect(attackerStrength(matchedVillage(k, army, 0, data), data)).toBeCloseTo(k, 5);
      expect(attackerStrength(matchedVillage(k, army, 2, data), data)).toBeLessThan(k - 0.5);
      expect(attackerStrength(matchedVillage(k, army, 2, data), data)).toBeGreaterThanOrEqual(k - data.ranks.matchmaking.researchFloorKeeps! - 1e-9);
    }
    expect(researchKeep(data.hall.levels[9].troopLevelCap!, data)).toBe(10);
  });
});
