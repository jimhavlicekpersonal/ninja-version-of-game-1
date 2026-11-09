/**
 * CU opening: what the first hour and first day look like (model player with a command log) and the
 * data arithmetic of the Keep 1-3 catalogue against the 2500/2500/500 start.
 * Run: node scratch/run.mjs scratch/currencies/opening.ts
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { ModelPlayer, activeHour, normalDays } from '../../tools/balance/playerModel';
import { hallLevel } from '../../src/gameplay/sim/village';
import { capacity } from '../../src/gameplay/sim/resources';

const H = data.hall.levels; const B = data.buildings as any;
const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));

export default function main() {
  console.log('== catalogue cost at Keeps 1-4 (everything hall.json allows, buildings.json prices; decor costs Jade and is left out)');
  for (let k = 1; k <= 4; k++) {
    const lim = H[k - 1].limits as Record<string, { count: number; maxLevel: number }>;
    let c = 0, p = 0, walls = 0, secs = 0;
    const items: string[] = [];
    for (const [type, l] of Object.entries(lim)) {
      const def = B[type]; if (!def || ['decor', 'builder', 'obstacle'].includes(def.category)) continue;
      let cc = 0, pp = 0, ss = 0;
      for (let i = 0; i < l.count; i++) for (let L = 1; L <= l.maxLevel; L++) { const lv = def.levels[L - 1]; if (!lv) continue; cc += lv.cost.acorns ?? 0; pp += lv.cost.dew ?? 0; ss += lv.buildSeconds; }
      if (def.category === 'hedge') { walls += cc; continue; }
      c += cc; p += pp; secs += ss; items.push(`${type} x${l.count} L${l.maxLevel} ${fmt(cc)}C/${fmt(pp)}P`);
    }
    const keep = B.elder_toadstool.levels[k];
    console.log(`Keep ${k}: whole catalogue ${fmt(c)} Coins + ${fmt(p)} Prov (+ walls ${fmt(walls)} C), ${(secs / 60).toFixed(0)} builder-min; next Keep ${fmt(keep?.cost.acorns ?? 0)} C / ${((keep?.buildSeconds ?? 0) / 60).toFixed(0)} min; income at this Keep's max ${B.acorn_orchard.levels[lim.acorn_orchard.maxLevel - 1].ratePerHour * lim.acorn_orchard.count}/h each`);
    console.log('   ' + items.join(', '));
  }
  console.log(`start: ${JSON.stringify(data.economy.startingResources)}, 2 Artisans; 3rd/4th/5th cost ${data.economy.builderHutCosts.join('/')} Jade; obstacles give ~91 Jade; first 24 h shielded (newPlayerShieldHours ${data.raids.newPlayerShieldHours}).`);

  console.log('\n== model player (regular policy) command log, first 60 minutes then the rest of day 1');
  const p = new ModelPlayer(data, { raidsPerSession: 2 });
  const log: string[] = [];
  const orig = (p as any).run.bind(p);
  (p as any).run = (cmd: any) => {
    const ok = orig(cmd);
    if (!ok) return ok;
    const t = ((p.clock.now() - (p as any).t0) / 60000).toFixed(0);
    const r = p.state.resources;
    const note = cmd.type === 'place' ? `place ${cmd.buildingType}` : cmd.type === 'upgrade' ? `upgrade ${p.state.buildings.find((b) => b.id === cmd.id)?.type} -> L${p.state.buildings.find((b) => b.id === cmd.id)?.upgrade?.toLevel ?? p.state.buildings.find((b) => b.id === cmd.id)?.level}` : cmd.type === 'train' ? `train ${cmd.troop}` : cmd.type === 'battleEnd' ? `RAID (loot ${JSON.stringify(p.state.battleLog.at(-1)?.banked)})` : cmd.type === 'research' ? `research ${cmd.troop}` : cmd.type === 'collect' ? '' : cmd.type;
    if (note) log.push(`${t} min | Keep ${hallLevel(p.state, data)} | ${fmt(r.acorns)}C ${fmt(r.dew)}P ${r.moonstones}J | ${note}`);
    return ok;
  };
  activeHour(p, 60, 2);
  const trainLines = log.filter((l) => l.includes('train ')).length;
  for (const l of log.filter((l) => !l.includes('train '))) console.log(l);
  console.log(`(+ ${trainLines} train commands) after 60 min: Keep ${hallLevel(p.state, data)}, resources ${JSON.stringify(p.state.resources)}, capacity ${JSON.stringify(capacity(p.state, data))}, buildings: ${Object.entries(p.state.buildings.filter((b) => !['decor', 'obstacle'].includes(B[b.type].category)).reduce((a: any, b) => { a[`${b.type}`] = (a[b.type] ?? '') + (b.upgrade ? `[${b.level}>${b.upgrade.toLevel}]` : `[${b.level}]`); return a; }, {})).map(([k, v]) => `${k}${v}`).join(' ')}`);
  log.length = 0;
  normalDays(p, 1);
  for (const l of log.filter((l) => !l.includes('train '))) console.log(l);
  console.log(`end of day 1: Keep ${hallLevel(p.state, data)} (reached: ${JSON.stringify(Object.fromEntries(Object.entries(p.hallReachedAt).map(([k, v]) => [k, (v as number).toFixed(1) + ' h'])))}), resources ${JSON.stringify(p.state.resources)}, raids ${p.raids}, raided ${p.defenseLog.length}`);
  normalDays(p, 2);
  console.log(`end of day 3: Keep ${hallLevel(p.state, data)} (reached: ${JSON.stringify(Object.fromEntries(Object.entries(p.hallReachedAt).map(([k, v]) => [k, (v as number).toFixed(1) + ' h'])))}), raids ${p.raids}, raided ${p.defenseLog.length}, stolen total ${fmt(p.defenseLog.reduce((a, d) => a + d.lost, 0))}, looted total ${fmt(p.raidLog.reduce((a, r) => a + r.loot, 0))}`);
}
