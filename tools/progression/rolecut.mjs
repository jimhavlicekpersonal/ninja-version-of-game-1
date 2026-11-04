// Scales one role's live troop stats at every level and records the matching
// role budget in progression.json, so the model keeps reproducing the roster.
// Usage: node tools/progression/rolecut.mjs <role> <hpFactor> <damageFactor>
import { readFileSync, writeFileSync } from 'node:fs';

const [role, hpArg, dmgArg] = process.argv.slice(2);
const hpF = Number(hpArg);
const dmgF = Number(dmgArg);
if (!role || !(hpF > 0) || !(dmgF > 0)) throw new Error('usage: rolecut.mjs <role> <hpFactor> <damageFactor>');
const read = (f) => readFileSync(`src/gameplay/data/${f}.json`, 'utf8');
const roster = JSON.parse(read('roster'));
const troops = JSON.parse(read('troops'));
const ids = roster.warriors.filter((w) => w.role === role && w.liveTroop).map((w) => w.liveTroop);
for (const id of ids) {
  for (const lv of troops[id].levels) {
    lv.hp = Math.round(lv.hp * hpF);
    lv.damage = Math.round(lv.damage * dmgF * 10) / 10;
  }
}
writeFileSync('src/gameplay/data/troops.json', JSON.stringify(troops, null, 2) + '\n');
// Model: hp = p*sqrt(k), dps = p/sqrt(k)  =>  efficiency *= sqrt(hpF*dmgF), k *= hpF/dmgF.
let prog = read('progression');
const p = JSON.parse(prog);
const r = p.roles[role];
const eff = Math.round(r.efficiency * Math.sqrt(hpF * dmgF) * 1000) / 1000;
const k = Math.round(r.hpPerDps * (hpF / dmgF) * 100) / 100;
const block = prog.indexOf(`"${role}": {`);
const end = prog.indexOf('}', block);
const before = prog.slice(block, end);
const after = before.replace(/"efficiency": [0-9.]+/, `"efficiency": ${eff}`).replace(/"hpPerDps": [0-9.]+/, `"hpPerDps": ${k}`);
prog = prog.slice(0, block) + after + prog.slice(end);
writeFileSync('src/gameplay/data/progression.json', prog);
console.log(`${role}: ${ids.join(', ')} scaled hp x${hpF}, damage x${dmgF}; efficiency ${r.efficiency} -> ${eff}, hpPerDps ${r.hpPerDps} -> ${k}`);
