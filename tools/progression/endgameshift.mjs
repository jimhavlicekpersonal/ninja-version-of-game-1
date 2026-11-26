// SIM_RULES 10 (GT-04, 2026-11-25): the endgame shift. Scale one live warrior's HP and damage only on the research levels
// past its Keep 12 cap (the levels a player reaches at Keeps 13-15), and record the factor as its roster `lateScale`
// so the progression model keeps reproducing the roster (progression.ts `warriorStats`). Below 1 an older tier
// plateaus; above 1 a newer tier comes into its own. Keeps 1-12, and every warrior's level there, are unchanged.
// Usage: node tools/progression/endgameshift.mjs <liveTroopId> <factor> [<liveTroopId> <factor> ...]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (!args.length || args.length % 2) throw new Error('usage: endgameshift.mjs <liveTroopId> <factor> [...]');
const troops = JSON.parse(readFileSync('src/gameplay/data/troops.json', 'utf8'));
const hall = JSON.parse(readFileSync('src/gameplay/data/hall.json', 'utf8'));
const roster = JSON.parse(readFileSync('src/gameplay/data/roster.json', 'utf8'));
const KEEP = 12;
for (let i = 0; i < args.length; i += 2) {
  const id = args[i];
  const f = Number(args[i + 1]);
  const t = troops[id];
  if (!t || !(f > 0)) throw new Error(`bad pair ${id} ${args[i + 1]}`);
  const from = Math.max(1, hall.levels[KEEP - 1].troopLevelCap - (t.levelCapOffset ?? 0));
  for (const lv of t.levels) {
    if (lv.level <= from) continue;
    lv.hp = Math.round(lv.hp * f);
    lv.damage = Math.round(lv.damage * f * 10) / 10;
  }
  const w = roster.warriors.find((x) => x.liveTroop === id);
  if (!w) throw new Error(`${id} is not in roster.json`);
  w.lateScale = Math.round((w.lateScale ?? 1) * f * 1000) / 1000;
  console.log(`${id} (${w.id}): levels ${from + 1}-${t.levels.length} x${f}; lateScale ${w.lateScale}`);
}
writeFileSync('src/gameplay/data/troops.json', JSON.stringify(troops, null, 2) + '\n');
writeFileSync('src/gameplay/data/roster.json', JSON.stringify(roster, null, 2) + '\n');
