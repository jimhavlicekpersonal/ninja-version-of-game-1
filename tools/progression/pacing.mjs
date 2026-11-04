// Applies the pacing model in progression.json to the live data files:
//   - research cost and time for every warrior level (troops.json), one smooth
//     curve for all 50 warriors (the original six used to switch curves at level 6),
//   - training time for warriors past tier 1 (tier 1 keeps its hand-set times).
// Training speed per Dojo level (buildings.json) and research lanes per Keep
// (hall.json) are data in those files. Run: node tools/progression/pacing.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(`src/gameplay/data/${f}.json`, 'utf8'));
const write = (f, o) => writeFileSync(`src/gameplay/data/${f}.json`, JSON.stringify(o, null, 2) + '\n');

const progression = read('progression');
const roster = read('roster');
const troops = read('troops');
const r = progression.research;
const t = progression.training;

const researchCost = (tier, level) => Math.round(r.costBase * Math.pow(r.tierCostMult, tier - 1) * Math.pow(r.costGrowth, level - 2));
const researchSeconds = (level) => Math.min(r.maxSeconds, Math.round(r.secondsBase * Math.pow(r.timeGrowth, level - 2)));
const trainingSeconds = (housing, tier) => Math.round(t.secondsPerHousing * housing * Math.pow(t.tierTimeMult, tier - 1));

let changed = 0;
for (const w of roster.warriors) {
  const def = w.liveTroop && troops[w.liveTroop];
  if (!def) continue;
  for (const lv of def.levels) {
    if (lv.level < 2) continue;
    const next = { cost: { dew: researchCost(w.tier, lv.level) }, seconds: researchSeconds(lv.level) };
    if (JSON.stringify(lv.research) !== JSON.stringify(next)) changed++;
    lv.research = next;
  }
  if (w.tier > 1) def.trainSeconds = trainingSeconds(def.housing, w.tier);
}
write('troops', troops);
console.log(`research levels updated: ${changed}`);
