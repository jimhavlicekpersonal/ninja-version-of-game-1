import { defaultData, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, planFrom, triples, mean, armyFrom } from './common.ts';
// Smoke variants: same online policy, different cloud numbers.
function fight(setup: any, plan: any[], smoke: boolean, data: any) {
  const sim = B.createBattle(setup, data); const byTick = B.deploymentsByTick(plan); let lastFire = -999;
  while (!sim.ended) {
    const extra: any[] = [];
    if (smoke && sim.charges.smoke_bomb > 0 && sim.tick - lastFire <= 5) {
      const targeted = new Set<number>(); for (const b of sim.buildings) if (!b.destroyed && b.kind === 'defense' && b.targetTroop >= 0) targeted.add(b.targetTroop);
      const live = sim.troops.filter((t: any) => !t.dead); let best: any = null; let bestN = 0;
      for (const id of targeted) { const t = sim.troops[id]; if (!t || t.dead || B.inSmoke(sim, t.x, t.y)) continue; const n = live.filter((o: any) => Math.hypot(o.x - t.x, o.y - t.y) <= data.battle.abilities.smoke_bomb.radius).length; if (n > bestN) { bestN = n; best = t; } }
      if (best && bestN >= Math.min(6, Math.ceil(live.length / 4))) extra.push({ tick: sim.tick, troop: 'smoke_bomb', x: best.x, y: best.y });
    }
    B.step(sim, [...(byTick.get(sim.tick) ?? []), ...extra]);
    if (sim.events.some((e: any) => e.k === 'fire')) lastFire = sim.tick;
  }
  return B.result(sim);
}
const variants: Record<string, (s: any) => void> = {
  live: () => {},
  r4: (s) => { s.radius = 4; },
  r4_12s: (s) => { s.radius = 4; s.durationTicks = 120; },
  r4_12s_f25_min1: (s) => { s.radius = 4; s.durationTicks = 120; s.rangeFactor = 0.25; s.minTargetRange = 1; },
  r5_15s_f25_min1: (s) => { s.radius = 5; s.durationTicks = 150; s.rangeFactor = 0.25; s.minTargetRange = 1; },
};
for (const [keep, name, army] of [[10, 'botmix', botArmy(10, 1, defaultData)], [15, 'botmix', botArmy(15, 1, defaultData)], [10, 'blade+nightblade', armyFrom({ night_blade: 0.5, moonblade_master: 0.5 }, 10)]] as [number, string, Record<string, number>][]) {
  const levels = levelsFor(army, keep); const hero = heroAtKeep(keep, defaultData); const out: string[] = [];
  let none = 0;
  for (const [vn, f] of Object.entries(variants)) {
    const data = structuredClone(defaultData); f(data.battle.abilities.smoke_bomb);
    const a: number[] = [], b: number[] = [];
    for (const layout of LAYOUTS) for (let i = 0; i < 2; i++) {
      const base = generateOpponent(9700 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout });
      const setup = { seed: 900 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const probe = B.createBattle(setup, data); const tr = triples(probe);
      for (const pts of [tr[0], tr[3 % tr.length]]) { const plan = planFrom(probe, army, levels, pts, data, hero?.id); if (vn === 'live') a.push(fight(setup, plan, false, data).destruction); b.push(fight(setup, plan, true, data).destruction); }
    }
    if (vn === 'live') none = mean(a);
    out.push(`${vn} +${(mean(b) - none).toFixed(1)}`);
  }
  console.log(`Keep ${keep} ${name}: no smoke ${none.toFixed(1)}%; smoke policy gain by cloud numbers: ${out.join(' | ')}`);
}
