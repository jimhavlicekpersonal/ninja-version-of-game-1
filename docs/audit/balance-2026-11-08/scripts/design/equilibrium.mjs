// Zero-sum game analysis of an army x profile destruction matrix: pure saddle point? mixed equilibrium supports via fictitious play.
// node scratch/design/equilibrium.mjs scratch/design/temper_K12.out
import { readFileSync } from 'node:fs';
const file = process.argv[2];
const lines = readFileSync(file, 'utf8').split('\n');
const hdr = lines.findIndex((l) => l.startsWith('army '));
const profiles = lines[hdr].trim().split(/\s+/).slice(1);
const armies = [], M = [];
for (let i = hdr + 1; i < lines.length && lines[i].trim(); i++) {
  const parts = lines[i].trim().split(/\s+/);
  armies.push(parts[0]);
  M.push(parts.slice(1).map(Number));
}
const nA = armies.length, nP = profiles.length;
// pure: attacker picks army maximizing min over profiles; defender picks profile minimizing max over armies
const maximin = Math.max(...M.map((r) => Math.min(...r)));
const minimax = Math.min(...profiles.map((_, j) => Math.max(...M.map((r) => r[j]))));
console.log(`matrix ${nA} armies x ${nP} profiles (${file})`);
console.log(`pure saddle point: ${maximin === minimax ? 'YES (one answer)' : 'no'}; maximin ${maximin.toFixed(1)}, minimax ${minimax.toFixed(1)}`);
// fictitious play
const cA = new Array(nA).fill(0), cP = new Array(nP).fill(0);
let a = 0, p = 0;
const T = 200000;
for (let t = 0; t < T; t++) {
  cA[a]++; cP[p]++;
  // attacker best response to defender empirical mix
  let bestA = 0, bestAv = -Infinity;
  for (let i = 0; i < nA; i++) { let v = 0; for (let j = 0; j < nP; j++) v += M[i][j] * cP[j]; if (v > bestAv) { bestAv = v; bestA = i; } }
  let bestP = 0, bestPv = Infinity;
  for (let j = 0; j < nP; j++) { let v = 0; for (let i = 0; i < nA; i++) v += M[i][j] * cA[i]; if (v < bestPv) { bestPv = v; bestP = j; } }
  a = bestA; p = bestP;
}
const mixA = cA.map((c) => c / T), mixP = cP.map((c) => c / T);
let value = 0; for (let i = 0; i < nA; i++) for (let j = 0; j < nP; j++) value += mixA[i] * mixP[j] * M[i][j];
const fmt = (names, mix) => names.map((n, i) => [n, mix[i]]).filter(([, w]) => w > 0.02).sort((x, y) => y[1] - x[1]).map(([n, w]) => `${n} ${(w * 100).toFixed(0)}%`).join(', ');
console.log(`mixed equilibrium value ${value.toFixed(1)} destruction`);
console.log(`attacker mix (support ${mixA.filter((w) => w > 0.02).length}): ${fmt(armies, mixA)}`);
console.log(`defender mix (support ${mixP.filter((w) => w > 0.02).length}): ${fmt(profiles, mixP)}`);
// Today-only column for comparison
const j0 = profiles.indexOf('today');
if (j0 >= 0) { const col = M.map((r) => r[j0]); const best = Math.max(...col); console.log(`today only: best army ${armies[col.indexOf(best)]} ${best.toFixed(1)}; armies within 5: ${col.filter((v) => v >= best - 5).length}`); }
