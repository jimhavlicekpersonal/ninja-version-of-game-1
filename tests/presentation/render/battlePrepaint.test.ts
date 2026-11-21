/** Beast Mode 2026-11-21 STB-07: the key planner behind painting a battle's textures before it opens. */
import { describe, expect, it } from 'vitest';
import { battleTextureKeys, levelKey, ruinFamily, ruinKey } from '../../../src/presentation/render/battleKeys';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';

describe('battleTextureKeys', () => {
  it('lists every building level and every ruin a generated base can produce, once each', () => {
    const sim = createBattle({ seed: 7, base: generateOpponent(42, 9, data), army: {}, levels: {}, infiltration: true }, data);
    const plan = battleTextureKeys(sim.buildings);
    const levels = new Set(plan.levels.map((l) => l.key));
    const ruins = new Set(plan.ruins.map((r) => r.key));
    expect(levels.size).toBe(plan.levels.length);
    expect(ruins.size).toBe(plan.ruins.length);
    for (const b of sim.buildings) {
      if (b.level >= 1) expect(levels.has(levelKey(b.type, b.level)), `${b.type} ${b.level}`).toBe(true);
      // BattleScene's destruction: walls take the generic rubble, traps vanish, everything else its family ruin.
      if (b.kind !== 'hedge' && b.kind !== 'trap') expect(ruins.has(ruinKey(b.size, ruinFamily(b.kind, b.type))), b.type).toBe(true);
    }
    expect(plan.ruins.some((r) => r.family === 'keep')).toBe(true);
    expect(plan.ruins.some((r) => r.family === 'tower')).toBe(true);
  });

  it('skips construction (level 0), wall ruins and trap ruins', () => {
    const plan = battleTextureKeys([
      { type: 'stone_wall', level: 3, size: 1, kind: 'hedge' },
      { type: 'spike_trap', level: 1, size: 1, kind: 'trap' },
      { type: 'kunai_tower', level: 0, size: 3, kind: 'defense' },
    ]);
    expect(plan.levels.map((l) => l.key)).toEqual([levelKey('stone_wall', 3), levelKey('spike_trap', 1)]);
    expect(plan.ruins.map((r) => r.key)).toEqual([ruinKey(3, 'tower')]);
  });

  it('uses the same key formats as the scenes (Keys.buildingLevel, fx ruinTexture)', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/presentation/render/assets.ts', 'utf8'));
    expect(src).toContain('buildingLevel: (type: string, level: number) => `building.${type}.lv${level}`');
    expect(levelKey('a', 2)).toBe('building.a.lv2');
    expect(ruinKey(2, 'house')).toBe('rubble.2.house');
  });

  it('battle open and the first destruction paint nothing new once prepainted (app.ts runs the jobs in slices)', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync('src/app.ts', 'utf8');
    expect(app).toMatch(/battlePaintJobs\(this\.d\.game\.textures, session\.sim\.buildings\)/);
    expect(app).toMatch(/runSliced\(jobs, 8,/);
  });
});
