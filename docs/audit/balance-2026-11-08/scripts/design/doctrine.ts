/**
 * Prototype of a base "doctrine" using only data the current sim already reads: the Wind doctrine makes every
 * ground tower prefer attackers who fight from 3.5+ tiles (the Longbow Yagura's counter_artillery rule),
 * the Mountain doctrine is approximated by taunt-free towers with +25% damage against 5-housing warriors
 * (not expressible in data: skipped), the Thicket doctrine by walls at cap+2 and traps x2 (data).
 * Question: does the best army change with the doctrine? node scratch/run.mjs scratch/design/doctrine.ts
 */
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
  8: {
    best_AS: { wind_step_assassin: 102, blowgun_hunter: 40, bell_warden: 13, gearbreaker: 13, iron_monk: 5, wall_climber: 6 },
    suggested: { wind_step_assassin: 97, blowgun_hunter: 67, bell_warden: 16, gearbreaker: 13 },
    throw_guard: { blowgun_hunter: 190, bell_warden: 16 },
    blade_rush: { wind_step_assassin: 220, iron_monk: 10 },
    shadow: { mirage_twin: 100, shadow_stalker: 35 },
    air: { lantern_balloon: 67 },
    guard_heal_blade: { wind_step_assassin: 150, iron_monk: 12, drum_monk: 20 },
  },
  12: {
    best_AS: { chain_sickle_reaper: 67, moonblade_master: 54, blowgun_hunter: 30, mountain_shield: 18, iron_monk: 6, gearbreaker: 7, spirit_caller: 5, herbalist: 5 },
    suggested: { moonblade_master: 117, chain_sickle_reaper: 78, mountain_shield: 18, fuse_master: 15 },
    throw_guard: { chain_sickle_reaper: 160, mountain_shield: 31 },
    blade_rush: { moonblade_master: 255, iron_monk: 12 },
    shadow: { void_walker: 157 },
    air: { thunder_kite: 78 },
    guard_heal_blade: { moonblade_master: 180, mountain_shield: 15, spirit_caller: 20 },
  },
  15: {
    best_AS: { thousand_needle: 132, storm_sovereign: 56, chain_sickle_reaper: 36, oni_breaker: 13, gearbreaker: 18, iron_monk: 7 },
    suggested: { storm_sovereign: 129, thousand_needle: 90, oni_breaker: 21, ghost_engineer: 18 },
    throw_guard: { thousand_needle: 180, oni_breaker: 36 },
    blade_rush: { storm_sovereign: 300, iron_monk: 12 },
    shadow: { eclipse_ninja: 180 },
    air: { dragon_kite_armada: 90 },
    guard_heal_blade: { storm_sovereign: 210, mountain_shield: 15, sage_of_clouds: 25 },
  },
};

function withDoctrine(name: string): GameData {
  const d = structuredClone(defaultData) as GameData;
  const b = d.buildings as any;
  if (name === 'wind') {
    for (const t of ['acorn_cannon', 'wasp_nest']) b[t].effect = { kind: 'counter_artillery', prefersBeyond: 3.5 };
  }
  if (name === 'thicket') {
    for (const t of ['thorn_snare', 'sap_puddle']) for (const lv of b[t].levels) lv.damage *= 2;
    for (const lv of b.bramble_hedge.levels) lv.hp *= 3;
  }
  if (name === 'sky') {
    for (const t of ['acorn_cannon']) b[t].combat.targets = 'both';
  }
  return d;
}

function evalArmy(K: number, army: Army, d: GameData, doctrineBases: BaseLayout[]): { dest: number; stars: number; three: number } {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, d, t)]));
  const hero = heroAtKeep(K, d);
  let dest = 0, st = 0, three = 0, n = 0;
  doctrineBases.forEach((base, i) => {
    for (const es of [1, 2]) {
      const setup: BattleSetup = { seed: 100 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const probe = createBattle(setup, d);
      const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(es * 31 + i), d, levels, probe.entry);
      const { result } = runBattle(setup, plan, d);
      dest += result.destruction; st += result.stars; three += result.stars === 3 ? 1 : 0; n++;
    }
  });
  return { dest: dest / n, stars: st / n, three: three / n };
}

export default function main() {
  for (const K of [8, 12, 15]) {
    console.log(`\n== Keep ${K}: destruction % (3-star %) by army x doctrine; 5 layouts x 2 seeds x 2 entry seeds, bias 0.5`);
    const doctrines = ['none', 'wind', 'thicket', 'sky'];
    const header = ['army'.padEnd(18), ...doctrines.map((x) => x.padStart(14))].join(' ');
    console.log(header);
    const best: Record<string, [string, number]> = {};
    for (const [name, army] of Object.entries(ARMIES[K])) {
      const row = [name.padEnd(18)];
      for (const doc of doctrines) {
        const d = withDoctrine(doc);
        const bases = LAYOUTS.flatMap((L) => [0, 1].map((s) => generateOpponent(91000 + K * 10 + s, K, d, { levelBias: 0.5, layout: L })));
        const r = evalArmy(K, army, d, bases);
        row.push(`${r.dest.toFixed(1)} (${(r.three * 100).toFixed(0)}%)`.padStart(14));
        if (!best[doc] || r.dest > best[doc][1]) best[doc] = [name, r.dest];
      }
      console.log(row.join(' '));
    }
    console.log('best army per doctrine: ' + doctrines.map((doc) => `${doc}=${best[doc][0]} ${best[doc][1].toFixed(1)}`).join(' | '));
  }
}
