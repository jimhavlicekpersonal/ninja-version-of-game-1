/**
 * P1-06 (retention audit RET-06): every achievement tier the game shows can be reached, by construction.
 * Counters that repeat play grows without end (raids, stars, resources collected) are always reachable; the
 * bounded ones are checked against what the data allows.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import type { StatKey } from '../../../src/gameplay/sim/types';

/**
 * The highest Trial tier the raid bots' mix (fully researched Keep 15, bot plan, Shadow Captain) clears with two
 * stars in at least half of eight fortress/seed combinations, measured on 2026-11-18 (PROGRESS.md, P1-06). Re-measure
 * when trials, combat or the bot plan change.
 */
const TRIAL_CAP = 58;
const TRIAL_MARGIN = 5;

/** Counters that only repeat play moves, with no ceiling in the data. */
const UNBOUNDED = new Set<string>(['collectedAcorns', 'collectedDew', 'raidsWon', 'starsEarned', 'troopsTrained', 'donations', 'moonstonesSpent', 'rematchesWon', 'raidDestruction', 'defensesFaced', 'upgradesStarted', 'raidsThreeStar', 'stakesWon', 'gauntletLadders', 'defensesWon', 'calendarDays']);

function ceiling(stat: string): number {
  // P5-05: values read from the village.
  if (stat === 'warriorsUnlocked') return Object.keys(data.troops).length;
  if (stat === 'looksOwned') return data.cosmetics.hallSkins.length;
  if (stat === 'towerTypesTempered') return Object.keys(data.battle.temper?.types ?? {}).length;
  const top = data.hall.levels[data.hall.levels.length - 1].limits as Record<string, { count: number; maxLevel?: number }>;
  switch (stat as StatKey | 'hallLevel') {
    case 'hallLevel':
      return data.hall.levels.length;
    case 'obstaclesCleared':
      return data.economy.obstacles.count;
    case 'researchDone':
      return Object.values(data.troops).reduce((n, t) => n + t.levels.length - 1, 0);
    case 'upgradesDone':
    case 'timedUpgradesDone':
      return Object.entries(top).reduce((n, [type, l]) => (data.buildings[type] && data.buildings[type].category !== 'obstacle' ? n + l.count * (l.maxLevel ?? 1) : n), 0);
    case 'trialsCleared':
      return TRIAL_CAP - TRIAL_MARGIN;
    default:
      return UNBOUNDED.has(stat) ? Infinity : -1;
  }
}

describe('every achievement tier is reachable', () => {
  for (const a of data.achievements) {
    it(a.id, () => {
      const most = ceiling(a.stat);
      expect(most, `${a.stat}: add its ceiling to this test`).toBeGreaterThan(0);
      for (const [target] of a.tiers) expect(target, `${a.id} tier ${target} > ${most}`).toBeLessThanOrEqual(most);
    });
  }
});
