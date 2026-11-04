// Mid-Keep defense bump: defense levels first unlocked at a Keep get HP and
// damage x factor, because tier-2/3/4 armies outgrew those bases (good mixed
// armies scored 86-94% at Keeps 6-10 in the gameplay audit's measurements).
// An optional second argument limits the bump to some defenses.
// Each level stays stronger than the one before (checked).
//
// Applied in November 2026 (gameplay audit), in four runs, each once:
//   node tools/balance/midkeep.mjs '{"7":1.2,"8":1.2,"9":1.16,"10":1.12,"11":1.08,"12":1.04}'
//   node tools/balance/midkeep.mjs '{"5":1.08,"6":1.15}'
//   node tools/balance/midkeep.mjs '{"13":1.06,"14":1.06,"15":1.06}'
//   node tools/balance/midkeep.mjs '{"6":1.5}' acorn_cannon,wasp_nest
// The last one smooths the step into the late-Keep curve: the Kunai Tower's
// level 7 -> 8 and the Shuriken Pagoda's 6 -> 7 were x2.17, and Keep 7 bases
// (which mostly field the Keep 6 levels) fell to every Keep 7 army.
// Running it again multiplies again: only run it for a new, measured change.
import { readFileSync, writeFileSync } from 'node:fs';

if (!process.argv[2]) throw new Error('usage: midkeep.mjs \'{"<keep>": factor, ...}\' [building,building]');
const FACTOR = JSON.parse(process.argv[2]);
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const buildings = JSON.parse(readFileSync('src/gameplay/data/buildings.json', 'utf8'));
const hall = JSON.parse(readFileSync('src/gameplay/data/hall.json', 'utf8'));
for (const [id, def] of Object.entries(buildings)) {
  if (def.category !== 'defense') continue;
  if (ONLY && !ONLY.includes(id)) continue;
  let prevHp = 0;
  for (const lv of def.levels) {
    const keep = hall.levels.findIndex((h) => (h.limits[id]?.maxLevel ?? 0) >= lv.level) + 1;
    const f = FACTOR[keep] ?? 1;
    lv.hp = Math.round(lv.hp * f);
    if (lv.damage !== undefined) lv.damage = Math.round(lv.damage * f * 100) / 100;
    if (lv.hp <= prevHp) throw new Error(`${id} level ${lv.level} is no longer stronger than the one before`);
    prevHp = lv.hp;
  }
}
writeFileSync('src/gameplay/data/buildings.json', JSON.stringify(buildings, null, 2) + '\n');
console.log('mid-Keep defense bump applied');
