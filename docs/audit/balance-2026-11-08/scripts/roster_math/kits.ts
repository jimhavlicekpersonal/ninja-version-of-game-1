// Kit on/off for every warrior inside a realistic mix (bot mix of the Keep; the warrior takes its role's slot,
// or 30% of the housing when its role is not in the mix). Run: node scratch/run.mjs scratch/roster_math/kits.ts early|late
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { WARRIORS } from '../../src/gameplay/sim/progression';
import { troopKeep } from '../../tools/balance/armyLab';
import type { GameData } from '../../src/gameplay/sim/types';
import { cloneData, fight, levelsAtCaps, LAYOUT_IDS, summarize } from './lib';

const roleOf: Record<string, string> = {}; const tierOf: Record<string, number> = {}; const scaleOf: Record<string, number> = {};
for (const w of WARRIORS) if (w.liveTroop) { roleOf[w.liveTroop] = w.role; tierOf[w.liveTroop] = w.tier; scaleOf[w.liveTroop] = w.dpsScale ?? 1; }

function armyWith(keep: number, troop: string): Record<string, number> {
  const mix = botArmy(keep, 1, data);
  const slot = Object.keys(mix).find((t) => roleOf[t] === roleOf[troop]);
  if (slot) { const army = { ...mix }; const n = army[slot]; delete army[slot]; army[troop] = (army[troop] ?? 0) + n; return army; }
  const H = Object.entries(mix).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
  const army: Record<string, number> = {};
  for (const [t, n] of Object.entries(mix)) { const m = Math.floor(n * 0.7); if (m > 0) army[t] = m; }
  army[troop] = Math.max(1, Math.floor((0.3 * H) / data.troops[troop].housing));
  return army;
}
function stripped(troop: string): GameData {
  const d = cloneData();
  const def = d.troops[troop] as { kit?: unknown; ability?: string; abilityCharges?: number };
  def.kit = {}; delete def.ability; def.abilityCharges = 0;
  return d;
}
function untaxed(troop: string): GameData {
  const d = cloneData();
  for (const lv of d.troops[troop].levels) lv.damage = lv.damage / scaleOf[troop];
  return d;
}
export default function main(which = 'early', seedsArg = '2') {
  const f1 = (x: number) => x.toFixed(1);
  const seeds = Number(seedsArg);
  const t0 = Date.now();
  console.log(`## Kit on vs off, ${which} Keep (${which === 'early' ? 'unlock Keep + 1, min 4' : 'Keep 15'}), bases bias 0.5, ${LAYOUT_IDS.length} layouts x ${seeds} seeds`);
  console.log('| troop | role T | Keep | lvl | count | kit on: destr / 3* | kit off: destr / 3* | kit value (pts) | untaxed destr (taxed troops) |\n|---|---|---|---|---|---|---|---|---|');
  for (const troop of Object.keys(data.troops)) {
    const keep = which === 'early' ? Math.min(15, Math.max(4, troopKeep(troop) + 1)) : 15;
    const army = armyWith(keep, troop);
    const lv = levelsAtCaps(keep, army);
    const run = (d: GameData) => { const rs = []; for (const L of LAYOUT_IDS) for (let s = 0; s < seeds; s++) rs.push(fight(d, keep, army, lv, L, s)); return summarize(rs); };
    const on = run(data); const off = run(stripped(troop));
    const ut = scaleOf[troop] !== 1 ? run(untaxed(troop)) : null;
    console.log(`| ${troop} | ${roleOf[troop]} T${tierOf[troop]} | ${keep} | ${lv[troop]} | ${army[troop]} | ${f1(on.d)} / ${f1(on.three)} | ${f1(off.d)} / ${f1(off.three)} | ${on.d - off.d >= 0 ? '+' : ''}${f1(on.d - off.d)} | ${ut ? f1(ut.d) + ' (' + (ut.d - on.d >= 0 ? '+' : '') + f1(ut.d - on.d) + ')' : '-'} |`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
