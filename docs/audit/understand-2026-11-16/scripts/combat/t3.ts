import { defaultData as data, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, planFrom, triples, mean, armyFrom } from './common.ts';
// Smoke Bomb value: the same plan with no smoke vs a competent online policy (throw a cloud on the densest
// group of living warriors that is being shot at, as soon as no cloud covers it; up to the army's charges).
function fight(setup: any, plan: any[], smoke: boolean) {
  const sim = B.createBattle(setup, data); const byTick = B.deploymentsByTick(plan);
  let thrown = 0; let lastFire = -999;
  while (!sim.ended) {
    const extra: any[] = [];
    if (smoke && sim.charges.smoke_bomb > 0 && sim.tick - lastFire <= 5) {
      // warriors currently targeted by a defence
      const targeted = new Set<number>(); for (const b of sim.buildings) if (!b.destroyed && b.kind === 'defense' && b.targetTroop >= 0) targeted.add(b.targetTroop);
      const live = sim.troops.filter((t: any) => !t.dead);
      let best: any = null; let bestN = 0;
      for (const id of targeted) { const t = sim.troops[id]; if (!t || t.dead || B.inSmoke(sim, t.x, t.y)) continue; const n = live.filter((o: any) => Math.hypot(o.x - t.x, o.y - t.y) <= 3).length; if (n > bestN) { bestN = n; best = t; } }
      if (best && bestN >= Math.min(6, Math.ceil(live.length / 4))) { extra.push({ tick: sim.tick, troop: 'smoke_bomb', x: best.x, y: best.y }); thrown++; }
    }
    B.step(sim, [...(byTick.get(sim.tick) ?? []), ...extra]);
    if (sim.events.some((e: any) => e.k === 'fire')) lastFire = sim.tick;
  }
  return { r: B.result(sim), thrown };
}
const sets: [number, string, Record<string, number>][] = [
  [6, 'botmix', botArmy(6, 1, data)], [10, 'botmix', botArmy(10, 1, data)], [15, 'botmix', botArmy(15, 1, data)],
  [10, 'night_blade x150', { night_blade: 150 }], [10, 'blade+nightblade', armyFrom({ night_blade: 0.5, moonblade_master: 0.5 }, 10)],
];
for (const [keep, name, army] of sets) {
  const levels = levelsFor(army, keep); const hero = heroAtKeep(keep, data);
  const a: number[] = [], b: number[] = [], sa: number[] = [], sb: number[] = [], th: number[] = [];
  for (const layout of LAYOUTS) for (let i = 0; i < 2; i++) {
    const base = generateOpponent(9700 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout });
    const setup = { seed: 900 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = B.createBattle(setup, data); const tr = triples(probe);
    for (const pts of [tr[0], tr[3 % tr.length]]) {
      const plan = planFrom(probe, army, levels, pts, data, hero?.id);
      const x = fight(setup, plan, false); const y = fight(setup, plan, true);
      a.push(x.r.destruction); b.push(y.r.destruction); sa.push(x.r.stars); sb.push(y.r.stars); th.push(y.thrown);
    }
  }
  console.log(`Keep ${keep} ${name}: charges ${B.smokeCharges(army, data)}; no smoke ${mean(a).toFixed(1)}% (${mean(sa).toFixed(2)}*) -> smoke policy ${mean(b).toFixed(1)}% (${mean(sb).toFixed(2)}*), delta ${(mean(b) - mean(a)).toFixed(1)} pts, thrown ${mean(th).toFixed(1)}; battles where smoke helped/hurt: ${b.filter((v, i) => v > a[i]).length}/${b.filter((v, i) => v < a[i]).length} of ${a.length}`);
}
