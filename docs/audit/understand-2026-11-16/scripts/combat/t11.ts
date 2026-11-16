import { defaultData as data, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, planFrom, run, triples, mean } from './common.ts';
const mode = process.argv[2];
function score(keep: number, army: Record<string, number>, d: any, withHero = true, layouts = LAYOUTS, seeds = 2) {
  const levels = levelsFor(army, keep, d); const hero = withHero ? heroAtKeep(keep, d) : null; const ds: number[] = []; const st: number[] = [];
  for (const layout of layouts) for (let i = 0; i < seeds; i++) {
    const base = generateOpponent(9300 + i * 7919 + keep * 131, keep, d, { levelBias: 0.5, layout });
    const setup = { seed: 700 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = B.createBattle(setup, d); const tr = triples(probe);
    for (const pts of [tr[0], tr[3 % tr.length]]) { const r = run(setup, planFrom(probe, army, levels, pts, d, hero?.id), d).r; ds.push(r.destruction); st.push(r.stars); }
  }
  return `${mean(ds).toFixed(1)}% ${mean(st).toFixed(2)}*`;
}
if (mode === 'rally') {
  const variants: Record<string, (k: any) => void> = {
    rally0: (k) => { k.strength = 0; },
    live: () => {},
    r99_s30: (k) => { k.radius = 99; },
    r6_s50: (k) => { k.radius = 6; k.strength = 0.5; },
    once_r99_s50_15s: (k) => { k.oncePerBattle = true; k.radius = 99; k.strength = 0.5; k.durationTicks = 150; },
    once_r99_s100_10s: (k) => { k.oncePerBattle = true; k.radius = 99; k.strength = 1; k.durationTicks = 100; },
  };
  for (const keep of [7, 10, 15]) {
    const army = botArmy(keep, 1, data);
    console.log(`Keep ${keep} n=20: ` + Object.entries(variants).map(([n, f]) => { const d = structuredClone(data); f(d.battle.heroes.shadow_captain.kit); return `${n} ${score(keep, army, d)}`; }).join(' | '));
  }
}
if (mode === 'layout') {
  for (const keep of [8, 12, 15]) {
    const army = botArmy(keep, 1, data);
    console.log(`Keep ${keep} bot mix by layout (3 seeds x 2 sides): ` + LAYOUTS.map((l: any) => `${l.id} ${score(keep, army, data, true, [l], 3)}`).join(' | '));
  }
}
if (mode === 'sab') {
  for (const [keep, sab, filler] of [[6, 'saboteur', 'hedgehog_roller'], [8, 'gearbreaker', 'wind_step_assassin'], [15, 'ghost_engineer', 'storm_sovereign']] as [number, string, string][]) {
    const mix = botArmy(keep, 1, data); const base0 = { ...mix }; const had = base0[sab] ?? 0; if (had) { base0[filler] = (base0[filler] ?? 0) + had * data.troops[sab].housing / data.troops[filler].housing; delete base0[sab]; }
    const out: string[] = [];
    for (const n of [0, 3, 6, 12, 24]) {
      const a = { ...base0 }; a[filler] -= n * data.troops[sab].housing / data.troops[filler].housing; if (n) a[sab] = n;
      const d2 = structuredClone(data); delete d2.troops[sab].kit; d2.troops[sab].ability = 'none';
      out.push(`${n}: ${score(keep, a, data)}${n ? ` (kit off ${score(keep, a, d2)})` : ''}`);
    }
    console.log(`Keep ${keep} bot mix with N ${sab} replacing ${filler}: ` + out.join(' | '));
  }
}
