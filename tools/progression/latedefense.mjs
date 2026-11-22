// Beast Mode GT-04/GT-05 (rules 10): scale the HP and damage of every defense level a base can only build after Keep 12
// (levels above the building's Keep 12 limit in hall.json), so the newest warrior tiers can be stronger than the ones
// before them without Keep 15 raids turning into three-star farms. Run once per factor change; it is not idempotent.
// Usage: node tools/progression/latedefense.mjs <factor>
import { readFileSync, writeFileSync } from 'node:fs';

const f = Number(process.argv[2]);
if (!(f > 0)) throw new Error('usage: latedefense.mjs <factor>');
const buildings = JSON.parse(readFileSync('src/gameplay/data/buildings.json', 'utf8'));
const hall = JSON.parse(readFileSync('src/gameplay/data/hall.json', 'utf8'));
const keep12 = hall.levels[11].limits;
for (const [id, b] of Object.entries(buildings)) {
  if (!b || typeof b !== 'object' || !Array.isArray(b.levels) || !b.levels.some((l) => l.damage)) continue;
  const limit = keep12[id]?.maxLevel ?? 0;
  const changed = [];
  for (const l of b.levels) {
    if (l.level <= limit) continue;
    l.hp = Math.round(l.hp * f);
    if (l.damage) l.damage = Math.round(l.damage * f * 100) / 100;
    changed.push(l.level);
  }
  if (changed.length) console.log(`${id}: levels ${changed.join(', ')} x${f}`);
}
writeFileSync('src/gameplay/data/buildings.json', JSON.stringify(buildings, null, 2) + '\n');
