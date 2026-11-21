import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import { createBattle, deploymentsByTick, result, step } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import { trialBase, trialInfo } from '../../src/gameplay/sim/trials';

function fight(base: any, army: Record<string, number>, keep: number, battleSeed: number, planSeed: number) {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const hero = heroAtKeep(keep, data);
  const setup = { seed: battleSeed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
  const sim = createBattle(setup as any, data);
  const plan = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(planSeed), data, levels, sim.entry));
  while (!sim.ended) step(sim, plan.get(sim.tick));
  return result(sim);
}
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

export function trials(maxTier = 64) {
  const out: string[] = [];
  for (let t = 1; t <= maxTier; t++) {
    const info = trialInfo(t, data);
    const keep = info.hall;
    const army = botArmy(keep, 1, data);
    const ds: number[] = []; const st: number[] = [];
    for (let v = 0; v < 2; v++) for (const side of [0, 1]) { const r = fight(trialBase(t, data, v), army, keep, 1000 + t * 7 + side, 31 + side); ds.push(r.destruction); st.push(r.stars); }
    out.push(`${t}\tK${keep}\t${info.modifiers.map((m) => m.id).join("+")} p${info.power.toFixed(2)} ${info.layout}\tdestr ${mean(ds).toFixed(1)}\tstars ${mean(st).toFixed(2)}\tclears(>=2★) ${st.filter((s) => s >= 2).length}/4`);
  }
  return out.join('\n');
}

export function luck(keeps = [6, 10, 15], seeds = 12) {
  const out: string[] = [];
  for (const keep of keeps) {
    const army = botArmy(keep, 1, data);
    const seedSds: number[] = []; const flips: number[] = []; const planSds: number[] = []; const ranges: number[] = [];
    for (let b = 0; b < 5; b++) {
      const base = generateOpponent(7700 + keep * 31 + b, keep, data, { levelBias: 0.5, layout: LAYOUTS[b % LAYOUTS.length] });
      for (const plan of [31, 32, 33, 34]) {
        const rs = Array.from({ length: seeds }, (_, i) => fight(base, army, keep, 5000 + i * 97, plan));
        const d = rs.map((r) => r.destruction); const s = rs.map((r) => r.stars);
        const modal = [0, 1, 2, 3].map((k) => s.filter((x) => x === k).length); const m = modal.indexOf(Math.max(...modal));
        seedSds.push(sd(d)); flips.push(s.filter((x) => x !== m).length / s.length);
        const three = s.filter((x) => x === 3).length;
        out.push(`  K${keep} base${b} plan${plan}: destr mean ${mean(d).toFixed(1)} sd ${sd(d).toFixed(1)} min ${Math.min(...d)} max ${Math.max(...d)} stars ${JSON.stringify(modal)} 3★ ${three}/${seeds}`);
      }
      // entry-point spread: plan seeds vary, battle seed fixed
      const ps = Array.from({ length: 12 }, (_, i) => fight(base, army, keep, 5000, 100 + i).destruction);
      planSds.push(sd(ps)); ranges.push(Math.max(...ps) - Math.min(...ps));
    }
    out.push(`K${keep}: seed-only SD ${mean(seedSds).toFixed(1)}, star result differs from modal ${(mean(flips) * 100).toFixed(0)}%, plan SD ${mean(planSds).toFixed(1)}, plan range ${mean(ranges).toFixed(0)}`);
  }
  return out.join('\n');
}
