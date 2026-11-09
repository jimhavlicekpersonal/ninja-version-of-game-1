import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../src/gameplay/sim/battle/basegen';
import type { BaseLayout, BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import type { GameData } from '../../src/gameplay/sim/types';
type Army = Record<string, number>;
const ARMIES: Record<number, Record<string, Army>> = {
  12: {
    best_AS: { chain_sickle_reaper: 67, moonblade_master: 54, blowgun_hunter: 30, mountain_shield: 18, iron_monk: 6, gearbreaker: 7, spirit_caller: 5, herbalist: 5 },
    throw_guard: { chain_sickle_reaper: 160, mountain_shield: 31 },
    blade_rush: { moonblade_master: 255, iron_monk: 12 },
    shadow: { void_walker: 157 },
    air: { thunder_kite: 78 },
  },
  15: {
    best_AS: { thousand_needle: 132, storm_sovereign: 56, chain_sickle_reaper: 36, oni_breaker: 13, gearbreaker: 18, iron_monk: 7 },
    throw_guard: { thousand_needle: 180, oni_breaker: 36 },
    blade_rush: { storm_sovereign: 300, iron_monk: 12 },
    shadow: { eclipse_ninja: 180 },
    air: { dragon_kite_armada: 90 },
  },
};
function withDoctrine(name: string): GameData {
  const d = structuredClone(defaultData) as GameData;
  const b = d.buildings as any;
  if (name === 'wind2') { for (const t of ['acorn_cannon', 'wasp_nest']) { b[t].effect = { kind: 'counter_artillery', prefersBeyond: 3.5 }; b[t].combat.range += 2; } }
  if (name === 'wind3') { for (const t of ['acorn_cannon', 'wasp_nest']) { b[t].combat.range += 3; for (const lv of b[t].levels) lv.damage *= 1.3; } }
  if (name === 'thicket2') { b.paper_lantern_line.effect = { kind: 'reveal_line', radius: 5, seconds: 8, vulnerablePct: 0.3 }; for (const lv of b.paper_lantern_line.levels) lv.effect = { seconds: 8, vulnerablePct: 0.3 }; for (const h of d.hall.levels as any[]) if (h.limits.paper_lantern_line) h.limits.paper_lantern_line.count = 6; }
  if (name === 'mountain') { for (const t of ['thorn_snare']) for (const lv of b[t].levels) lv.damage *= 3; for (const lv of b.pinecone_catapult.levels) lv.damage *= 1.6; }
  return d;
}
function evalArmy(K: number, army: Army, d: GameData, bases: BaseLayout[]) {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, d, t)]));
  const hero = heroAtKeep(K, d);
  let dest = 0, three = 0, n = 0;
  bases.forEach((base, i) => { for (const es of [1, 2]) {
    const setup: BattleSetup = { seed: 100 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = createBattle(setup, d);
    const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(es * 31 + i), d, levels, probe.entry);
    const { result } = runBattle(setup, plan, d);
    dest += result.destruction; three += result.stars === 3 ? 1 : 0; n++;
  } });
  return { dest: dest / n, three: three / n };
}
export default function main() {
  const doctrines = ['none', 'wind2', 'wind3', 'thicket2', 'mountain'];
  for (const K of [12, 15]) {
    console.log(`\n== Keep ${K}: destruction % (3-star %), 5 layouts x 2 seeds x 2 entry seeds, bias 0.5`);
    console.log(['army'.padEnd(12), ...doctrines.map((x) => x.padStart(14))].join(' '));
    const best: Record<string, [string, number]> = {};
    for (const [name, army] of Object.entries(ARMIES[K])) {
      const row = [name.padEnd(12)];
      for (const doc of doctrines) {
        const d = withDoctrine(doc);
        const bases = LAYOUTS.flatMap((L) => [0, 1].map((s) => generateOpponent(91000 + K * 10 + s, K, d, { levelBias: 0.5, layout: L })));
        const r = evalArmy(K, army, d, bases);
        row.push(`${r.dest.toFixed(1)} (${(r.three * 100).toFixed(0)}%)`.padStart(14));
        if (!best[doc] || r.dest > best[doc][1]) best[doc] = [name, r.dest];
      }
      console.log(row.join(' '));
    }
    console.log('best per doctrine: ' + doctrines.map((doc) => `${doc}=${best[doc][0]} ${best[doc][1].toFixed(1)}`).join(' | '));
  }
}
