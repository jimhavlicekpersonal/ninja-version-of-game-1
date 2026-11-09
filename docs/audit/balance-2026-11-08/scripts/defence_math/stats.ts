/**
 * Paired standard errors and a per-Keep ranking for the marginal experiment's JSON.
 * Run: node scratch/run.mjs scratch/defence_math/stats.ts scratch/defence_math/marginal_6-9-12-15_b0.5.json
 */
import { readFileSync } from 'node:fs';

const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string | number, w: number) => String(s).padStart(w);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const se = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, xs.length - 1) / xs.length); };

export default function main(file: string) {
  const all = JSON.parse(readFileSync(file, 'utf8')) as any[];
  const ranking: Record<string, Record<number, number>> = {};
  for (const K of all) {
    const rows = K.rows as { layout: string; seed: number; variant: string; cost: number; changed: number; fights: { d: number; s: number; l: number; sh: number }[] }[];
    const baseRows = rows.filter((r) => r.variant === 'base');
    console.log(`\n== Keep ${K.keep} (bias ${K.bias}): paired differences baseline - variant (positive = helps the defender), ${baseRows.length} bases x ${baseRows[0].fights.length} entry seeds`);
    console.log(pad('var', 3), pad('name', 34), pad('cost', 11), pad('dDest', 6), pad('se', 5), pad('t', 5), pad('dHeld', 6), pad('d3st', 5), pad('pts/1M', 8), pad('se/1M', 7), pad('held%/1M', 8));
    const list: { id: string; name: string; perM: number; d: number; s: number }[] = [];
    for (const v of K.variants as any[]) {
      const vr = rows.filter((r) => r.variant === v.variant && r.changed > 0);
      const diffs: number[] = [];
      const dh: number[] = [];
      const d3: number[] = [];
      for (const r of vr) {
        const b = baseRows.find((x) => x.layout === r.layout && x.seed === r.seed)!;
        r.fights.forEach((fi, i) => {
          diffs.push(b.fights[i].d - fi.d);
          dh.push((fi.s === 0 ? 1 : 0) - (b.fights[i].s === 0 ? 1 : 0));
          d3.push((b.fights[i].s === 3 ? 1 : 0) - (fi.s === 3 ? 1 : 0));
        });
      }
      const m = mean(diffs);
      const s = se(diffs);
      const cost = mean(vr.map((r) => r.cost));
      const perM = m / (Math.abs(cost) / 1e6);
      console.log(pad(v.variant, 3), pad(v.name, 34), pad(Math.round(cost), 11), pad((m >= 0 ? '+' : '') + f(m), 6), pad(f(s), 5), pad(f(m / s), 5), pad((mean(dh) >= 0 ? '+' : '') + f(mean(dh) * 100, 0) + '%', 6), pad((mean(d3) >= 0 ? '+' : '') + f(mean(d3) * 100, 0) + '%', 5), pad(f(perM, 2), 8), pad(f(s / (Math.abs(cost) / 1e6), 2), 7), pad(f(mean(dh) * 100 / (Math.abs(cost) / 1e6), 2), 8));
      if (cost > 0) list.push({ id: v.variant, name: v.name, perM, d: m, s });
    }
    list.sort((a, b) => b.perM - a.perM);
    console.log('ranking of purchases by destruction points saved per 1M resources: ' + list.map((x, i) => `${i + 1}.${x.id} ${f(x.perM, 2)}`).join('  '));
    for (const x of list) (ranking[x.id] ??= {})[K.keep] = x.perM;
  }
  console.log('\n== Rank per Keep (1 = best purchase per 1M)');
  const keeps = all.map((k) => k.keep);
  const ids = Object.keys(ranking);
  console.log(pad('var', 3), ...keeps.map((k) => pad('K' + k, 7)));
  for (const id of ids) {
    const cells = keeps.map((k) => {
      const v = ranking[id][k];
      if (v === undefined) return pad('-', 7);
      const rank = Object.values(ranking).filter((r) => r[k] !== undefined && r[k] > v).length + 1;
      return pad(`${rank}(${f(v, 1)})`, 7);
    });
    console.log(pad(id, 3), ...cells);
  }
}
