import { defaultData as data, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, planFrom, run, triples, mean } from './common.ts';
// Rally: hero with aura 0.3 (live), 0 (off), once-per-battle, 1.0 (huge), radius 8; and no hero at all.
const variants: Record<string, (d: any) => void> = {
  live: () => {},
  rally0: (d) => { d.battle.heroes.shadow_captain.kit.strength = 0; },
  once: (d) => { d.battle.heroes.shadow_captain.kit.oncePerBattle = true; },
  rally100: (d) => { d.battle.heroes.shadow_captain.kit.strength = 1.0; },
  r8_d200: (d) => { d.battle.heroes.shadow_captain.kit.radius = 8; d.battle.heroes.shadow_captain.kit.durationTicks = 200; },
};
for (const keep of [7, 10, 15]) {
  const army = botArmy(keep, 1, data); const levels = levelsFor(army, keep); const hero = heroAtKeep(keep, data);
  const out: string[] = [];
  const cases: [string, any, boolean][] = [['nohero', data, false], ...Object.entries(variants).map(([n, f]) => { const d = structuredClone(data); f(d); return [n, d, true] as [string, any, boolean]; })];
  let rallyTicksShare = 0; let nb = 0;
  for (const [name, d, withHero] of cases) {
    const ds: number[] = []; const st: number[] = [];
    for (const layout of LAYOUTS) for (let i = 0; i < 2; i++) {
      const base = generateOpponent(9300 + i * 7919 + keep * 131, keep, d, { levelBias: 0.5, layout });
      const setup = { seed: 700 + i, base, army, levels, infiltration: true, ...(withHero ? { hero } : {}) };
      const probe = B.createBattle(setup, d);
      const tr = triples(probe);
      for (const pts of [tr[0], tr[3 % tr.length]]) {
        const plan = planFrom(probe, army, levels, pts, d, withHero ? hero!.id : undefined);
        if (name === 'live') {
          // how much of the hero's life is spent rallying, and how many warriors stand in the aura
          const sim = B.createBattle(setup, d); const byTick = B.deploymentsByTick(plan);
          let on = 0, alive = 0, inAura = 0, others = 0;
          while (!sim.ended) { B.step(sim, byTick.get(sim.tick)); const h = sim.troops.find((t: any) => t.type === hero!.id); if (h && !h.dead) { alive++; if ((h.rallyUntil ?? 0) > sim.tick) { on++; for (const t of sim.troops) if (!t.dead && t !== h) { others++; if (Math.hypot(t.x - h.x, t.y - h.y) <= 4) inAura++; } } } }
          rallyTicksShare += alive ? on / alive : 0; nb++;
          (globalThis as any).aura = ((globalThis as any).aura ?? 0) + (others ? inAura / others : 0);
          const r = B.result(sim); ds.push(r.destruction); st.push(r.stars);
        } else { const r = run(setup, plan, d).r; ds.push(r.destruction); st.push(r.stars); }
      }
    }
    out.push(`${name} ${mean(ds).toFixed(1)}% (${mean(st).toFixed(2)}*)`);
  }
  console.log(`Keep ${keep} n=20: ${out.join(' | ')} || live: rally active ${(100 * rallyTicksShare / nb).toFixed(0)}% of hero's life, ${(100 * (globalThis as any).aura / nb).toFixed(0)}% of living warriors inside the aura while active`);
  (globalThis as any).aura = 0;
}
