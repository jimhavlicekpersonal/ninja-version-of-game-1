import { readFileSync } from 'node:fs';
const REPO = '../../..';
const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
const D = await import(`${REPO}/src/gameplay/sim/defense`);
const R = await import(`${REPO}/src/gameplay/sim/rng`);
const n = Number(process.env.N ?? 10);
for (const f of process.argv.slice(2)) {
  const { now, state } = JSON.parse(readFileSync(f, 'utf8'));
  let line = f.replace('dump/', '').padEnd(22);
  for (const off of [-1.0, -0.5, 0.0, 0.5]) {
    const data = structuredClone(defaultData); (data.raids as any).labAutoLayout = true; (data.raids as any).raiderMatch = { lo: off, hi: off };
    let d = 0, s = 0, held = 0;
    for (let i = 0; i < n; i++) { const st = structuredClone(state); st.shieldUntil = 0; const r = D.raidVillage(st, now, R.createRng(900 + i), data).record.result; d += r.destruction; s += r.stars; held += r.stars === 0 ? 1 : 0; }
    line += ` | ${off >= 0 ? '+' : ''}${off.toFixed(1)}: ${(d / n).toFixed(0)}% ${(s / n).toFixed(1)}★ held ${(held / n * 100).toFixed(0)}%`;
  }
  console.log(line);
}
