// Hero (Shadow Captain): stats vs the bot-mix army, and measured value of hero / Rally.
// Run: node scratch/run.mjs scratch/roster_math/hero.ts
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { cloneData, fight, levelsAtCaps, LAYOUT_IDS, summarize, mean } from './lib';

export default function main() {
  const f1 = (x: number) => x.toFixed(1);
  console.log('## Shadow Captain vs the bot-mix army at the Keep caps (data)');
  console.log('| Keep | hero lvl | hero HP | hero DPS | hero P | army HP | army DPS | army P (sum sqrt) | hero HP share | hero DPS share | hero P share | hero = N housing of newest blade |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (let keep = 7; keep <= 15; keep++) {
    const h = heroAtKeep(keep, data)!;
    const hd = data.battle.heroes![h.id];
    const hl = hd.levels[h.level - 1];
    const hdps = (hl.damage * 10) / hd.attackIntervalTicks;
    const hp = Math.sqrt(hl.hp * hdps);
    const army = botArmy(keep, 1, data);
    const levels = levelsAtCaps(keep, army);
    let aHp = 0, aDps = 0, aP = 0;
    for (const [t, n] of Object.entries(army)) {
      const lv = data.troops[t].levels[levels[t] - 1];
      const dps = (lv.damage * 10) / data.troops[t].attackIntervalTicks;
      aHp += lv.hp * n; aDps += dps * n; aP += Math.sqrt(lv.hp * dps) * n;
    }
    const blade = Object.keys(army).find((t) => data.troops[t].housing === 1)!;
    const bl = data.troops[blade].levels[levels[blade] - 1];
    const bP = Math.sqrt(bl.hp * (bl.damage * 10) / data.troops[blade].attackIntervalTicks);
    console.log(`| ${keep} | ${h.level} | ${hl.hp} | ${f1(hdps)} | ${f1(hp)} | ${f1(aHp)} | ${f1(aDps)} | ${f1(aP)} | ${f1((hl.hp / (aHp + hl.hp)) * 100)}% | ${f1((hdps / (aDps + hdps)) * 100)}% | ${f1((hp / (aP + hp)) * 100)}% | ${f1(hp / bP)} |`);
  }
  console.log('\n## Measured: bot mix at caps vs generated bases (bias 0.5), 6 layouts x 3 seeds');
  const noRally = cloneData();
  noRally.battle.heroes!.shadow_captain.kit!.strength = 0;
  console.log('| Keep | variant | destruction | 1-star % | 3-star % | rally events/battle | warriors lost/battle |\n|---|---|---|---|---|---|---|');
  for (const keep of [7, 10, 15]) {
    const army = botArmy(keep, 1, data);
    const levels = levelsAtCaps(keep, army);
    const hero = heroAtKeep(keep, data)!;
    const variants: [string, typeof data, { id: string; level: number } | undefined][] = [['no hero', data, undefined], ['hero, rally 0%', noRally, hero], ['hero + rally 30%', data, hero]];
    for (const [name, d, h] of variants) {
      const rs = [];
      for (const layout of LAYOUT_IDS) for (let s = 0; s < 3; s++) rs.push(fight(d, keep, army, levels, layout, s, 0.5, h, ['ability:rally']));
      const sm = summarize(rs);
      console.log(`| ${keep} | ${name} | ${f1(sm.d)} | ${f1(sm.one)} | ${f1(sm.three)} | ${f1(mean(rs.map((r) => r.events['ability:rally'] ?? 0)))} | ${f1(mean(rs.map((r) => r.troopsLost)))} |`);
    }
  }
}
