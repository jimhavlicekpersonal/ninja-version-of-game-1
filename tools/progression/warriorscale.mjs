// Beast Mode 2026-11-21 GT-04: scale one live warrior's HP and damage at every level and record the same factor as
// its roster hpScale/dpsScale, so the progression model keeps reproducing the roster (progression-model.test.ts).
// Usage: node tools/progression/warriorscale.mjs <liveTroopId> <factor> [<liveTroopId> <factor> ...]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (!args.length || args.length % 2) throw new Error('usage: warriorscale.mjs <liveTroopId> <factor> [...]');
const troops = JSON.parse(readFileSync('src/gameplay/data/troops.json', 'utf8'));
const roster = readFileSync('src/gameplay/data/roster.json', 'utf8');
const parsed = JSON.parse(roster);
for (let i = 0; i < args.length; i += 2) {
  const id = args[i];
  const f = Number(args[i + 1]);
  if (!troops[id] || !(f > 0)) throw new Error(`bad pair ${id} ${args[i + 1]}`);
  for (const lv of troops[id].levels) {
    lv.hp = Math.round(lv.hp * f);
    lv.damage = Math.round(lv.damage * f * 10) / 10;
  }
  const w = parsed.warriors.find((x) => x.liveTroop === id);
  if (!w) throw new Error(`${id} is not in roster.json`);
  w.hpScale = Math.round((w.hpScale ?? 1) * f * 1000) / 1000;
  w.dpsScale = Math.round((w.dpsScale ?? 1) * f * 1000) / 1000;
  console.log(`${id} (${w.id}): x${f}; hpScale ${w.hpScale}, dpsScale ${w.dpsScale}`);
}
writeFileSync('src/gameplay/data/troops.json', JSON.stringify(troops, null, 2) + '\n');
writeFileSync('src/gameplay/data/roster.json', JSON.stringify(parsed, null, 2) + '\n');
