/**
 * A mid-game village for store screenshots (art re-audit item 12): a brand-new village shows a
 * lawn and three huts, which undersells the game. This builds a legal Keep N village from the
 * same base generator the game uses for opponents, with a full army and the tutorial done, marked
 * as a testing-sandbox village (`flags.sandbox`, never online). Loaded by tools/store/screenshots.mjs
 * through Vite's SSR loader; it reads game data and never changes it.
 */
import { defaultData as data, buildingDef } from '../../src/gameplay/sim/data';
import { createNewVillage } from '../../src/gameplay/sim/village';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { botArmy } from '../../src/gameplay/sim/matchmaking';

export function showcaseVillage(keep: number, seed: number, now: number): unknown {
  const s = createNewVillage(now, data) as unknown as Record<string, unknown> & { flags: Record<string, unknown> };
  const base = generateOpponent(seed, keep, data, { levelBias: 1 });
  s.buildings = base.buildings.map((b, i) => ({
    id: `b${i + 1}`,
    type: b.type,
    level: b.level,
    x: b.x,
    y: b.y,
    upgrade: null,
    collector: buildingDef(data, b.type).category === 'collector' ? { stored: 0, accrueFrom: now - 3 * 3600_000 } : null,
  }));
  s.nextId = base.buildings.length + 10;
  s.army = botArmy(keep, 1, data);
  s.resources = { acorns: 40_000 * keep, dew: 40_000 * keep, nightsap: 4_000 * keep, moonstones: 500 };
  s.tutorial = { step: 99, done: true };
  s.trophies = 200 * keep;
  s.flags = { ...s.flags, longWaitSeen: true, sandbox: true };
  return s;
}
