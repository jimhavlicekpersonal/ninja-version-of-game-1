import { readFileSync } from 'node:fs';
const REPO = '../../..';
const { defaultData: data } = await import(`${REPO}/src/gameplay/sim/data`);
const D = await import(`${REPO}/src/gameplay/sim/defense`);
const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const B = await import(`${REPO}/src/gameplay/sim/battle/battle`);
const M = await import(`${REPO}/src/gameplay/sim/matchmaking`);
const R = await import(`${REPO}/src/gameplay/sim/rng`);
const sum = (bs: any[]) => { const m: Record<string, number[]> = {}; for (const b of bs) (m[b.type] ??= []).push(b.level); return Object.entries(m).filter(([t]) => !t.startsWith('obstacle')).sort().map(([t, l]) => `${t}×${l.length}@${(l.reduce((a, x) => a + x, 0) / l.length).toFixed(1)}`).join(' '); };
const { now, state } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const base = D.villageToBase(state, now, data);
const keep = base.hallLevel;
const gen = G.generateOpponent(1234, keep, data, { levelBias: 0.5 });
console.log('GEN', sum(gen.buildings));
const run = (b: any, i: number, at: any) => { const setup = { seed: 77 + i, base: b, army: at.army, levels: at.levels, infiltration: true }; const probe = B.createBattle(setup, data); const dep = D.botDeployments(probe.deployable, probe.grid.size, at.army, R.createRng(5 + i), data, at.levels, probe.entry); return B.runBattle(setup, dep, data).result; };
// Variants: (a) village as is, (b) generated layout with the village's levels for defences, (c) generated base without walls, (d) village levels set to generated's
const lv: Record<string, number> = {}; for (const b of state.buildings) lv[b.type] = Math.max(lv[b.type] ?? 0, b.level);
const variants: [string, (i: number) => any][] = [
  ['village as built', () => base],
  ['generated base (bias 0.5)', (i) => G.generateOpponent(500 + i, keep, data, { levelBias: 0.5 })],
  ['generated, defences at village levels', (i) => { const g = G.generateOpponent(500 + i, keep, data, { levelBias: 0.5 }); for (const b of g.buildings) if (lv[b.type] && data.buildings[b.type].kind !== 'wall' && b.type !== 'wall') b.level = Math.min(b.level, lv[b.type]); return g; }],
  ['generated, no walls', (i) => { const g = G.generateOpponent(500 + i, keep, data, { levelBias: 0.5 }); g.buildings = g.buildings.filter((b: any) => !/wall|fence|palisade/.test(b.type)); return g; }],
];
for (const [name, mk] of variants) { let d = 0, s = 0; const n = 10; for (let i = 0; i < n; i++) { const at = M.attackerFor(R.createRng(1000 + i), state, data); const r = run(mk(i), i, at); d += r.destruction; s += r.stars; } console.log(name.padEnd(42), (d / n).toFixed(0) + '%', (s / n).toFixed(2) + '★'); }
