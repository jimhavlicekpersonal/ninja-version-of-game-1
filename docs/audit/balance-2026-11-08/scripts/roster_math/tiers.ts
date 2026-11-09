// Tier choice inside the bot mix: swap each role slot for every tier of that role (and the blade slot for shadows).
// Run: node scratch/run.mjs scratch/roster_math/tiers.ts
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { WARRIORS } from '../../src/gameplay/sim/progression';
import { troopKeep } from '../../tools/balance/armyLab';
import { fight, levelsAtCaps, LAYOUT_IDS, summarize } from './lib';

const roleOf: Record<string, string> = {}; const tierOf: Record<string, number> = {};
for (const w of WARRIORS) if (w.liveTroop) { roleOf[w.liveTroop] = w.role; tierOf[w.liveTroop] = w.tier; }

function trainCost(keep: number, army: Record<string, number>): number {
  const lv = levelsAtCaps(keep, army);
  return Object.entries(army).reduce((s, [t, n]) => s + (data.troops[t].levels[lv[t] - 1].cost.dew ?? 0) * n, 0);
}
export default function main(keepsArg = '7,10,13,15', seedsArg = '2') {
  const f1 = (x: number) => x.toFixed(1);
  const seeds = Number(seedsArg);
  const t0 = Date.now();
  console.log(`## Bot mix with one role slot swapped for another tier of the same role (bases bias 0.5, ${LAYOUT_IDS.length} layouts x ${seeds} seeds)`);
  console.log('| Keep | slot role | troop (tier) | lvl | destruction | 1-star % | 3-star % | vs mix | army train dew | dew per destruction pt |\n|---|---|---|---|---|---|---|---|---|---|');
  for (const keep of keepsArg.split(',').map(Number)) {
    const mix = botArmy(keep, 1, data);
    const base = (() => { const rs = []; for (const L of LAYOUT_IDS) for (let s = 0; s < seeds; s++) rs.push(fight(data, keep, mix, levelsAtCaps(keep, mix), L, s)); return summarize(rs); })();
    for (const slot of Object.keys(mix)) {
      const role = roleOf[slot];
      const candidates = Object.keys(data.troops).filter((t) => roleOf[t] === role && troopKeep(t) <= keep).sort((a, b) => tierOf[a] - tierOf[b]);
      for (const t of candidates) {
        const army = { ...mix }; const n = army[slot]; delete army[slot]; army[t] = (army[t] ?? 0) + n;
        const lv = levelsAtCaps(keep, army);
        const rs = []; for (const L of LAYOUT_IDS) for (let s = 0; s < seeds; s++) rs.push(fight(data, keep, army, lv, L, s));
        const sm = summarize(rs); const cost = trainCost(keep, army);
        console.log(`| ${keep} | ${role} | ${t} (T${tierOf[t]})${t === slot ? ' = mix' : ''} | ${lv[t]} | ${f1(sm.d)} | ${f1(sm.one)} | ${f1(sm.three)} | ${sm.d - base.d >= 0 ? '+' : ''}${f1(sm.d - base.d)} | ${(cost / 1000).toFixed(0)}k | ${(cost / 1000 / sm.d).toFixed(1)}k |`);
      }
    }
    // blade slot -> shadow of each tier (2 housing: half the count)
    const slot = Object.keys(mix).find((t) => roleOf[t] === 'blade')!;
    for (const t of Object.keys(data.troops).filter((t) => roleOf[t] === 'shadow' && troopKeep(t) <= keep).sort((a, b) => tierOf[a] - tierOf[b])) {
      const army = { ...mix }; const n = army[slot]; delete army[slot]; army[t] = Math.floor(n / 2);
      const lv = levelsAtCaps(keep, army);
      const rs = []; for (const L of LAYOUT_IDS) for (let s = 0; s < seeds; s++) rs.push(fight(data, keep, army, lv, L, s));
      const sm = summarize(rs); const cost = trainCost(keep, army);
      console.log(`| ${keep} | blade->shadow | ${t} (T${tierOf[t]}) | ${lv[t]} | ${f1(sm.d)} | ${f1(sm.one)} | ${f1(sm.three)} | ${sm.d - base.d >= 0 ? '+' : ''}${f1(sm.d - base.d)} | ${(cost / 1000).toFixed(0)}k | ${(cost / 1000 / sm.d).toFixed(1)}k |`);
    }
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
