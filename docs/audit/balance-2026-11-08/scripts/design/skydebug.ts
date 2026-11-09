import { createBattle, step, result, deploymentsByTick } from '../gp/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../gp/sim/battle/basegen';
import { defaultData } from '../gp/sim/data';
import { botDeployments } from '../gp/sim/defense';
import { heroAtKeep } from '../gp/sim/heroes';
import { troopLevelCapAt } from '../gp/sim/research';
import { createRng } from '../gp/sim/rng';
export default function main() {
  for (const mult of [0, 1, 6]) {
    const d = structuredClone(defaultData) as any;
    if (mult === 0) for (const lv of d.buildings.firefly_tower.levels) lv.damage = 0;
    if (mult === 6) d.battle.counterBonus = { firefly_tower: { vs: { air: 5 } } };
    const K = 15, army = { dragon_kite_armada: 90 };
    const levels = { dragon_kite_armada: troopLevelCapAt(K, d, 'dragon_kite_armada') };
    const base = generateOpponent(93150, K, d, { levelBias: 0.5, layout: LAYOUTS[0] });
    const setup = { seed: 300, base, army, levels, infiltration: true, hero: heroAtKeep(K, d)! };
    const sim = createBattle(setup, d);
    const plan = botDeployments(sim.deployable, sim.grid.size, army, createRng(53), d, levels, sim.entry);
    const byTick = deploymentsByTick(plan);
    let fires = 0, died = 0, skyFires = 0;
    const sky = new Set(sim.buildings.map((b, i) => (b.type === 'firefly_tower' ? i : -1)).filter((i) => i >= 0));
    while (!sim.ended) {
      step(sim, byTick.get(sim.tick) ?? []);
      for (const e of sim.events as any[]) { if (e.k === 'fire') { fires++; if (sky.has(e.building)) skyFires++; } if (e.k === 'troopDied') died++; }
    }
    const r = result(sim);
    const skyLv = sim.buildings.filter((b) => b.type === 'firefly_tower').map((b: any) => `L${b.level ?? '?'} hp${Math.round(b.hp)} destroyed=${b.destroyed}`);
    console.log(`mult ${mult}: destruction ${r.destruction}, troops died ${died}, defence shots ${fires}, sky bow shots ${skyFires}, sky bows ${skyLv.join(' ; ')}, kite L${levels.dragon_kite_armada}`);
  }
}
