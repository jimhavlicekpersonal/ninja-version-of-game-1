// node scratch/policy_sim/aggregate.mjs : policy x metric tables from the *_<cadence>.json files.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = 'scratch/policy_sim';
const files = readdirSync(dir).filter((f) => /^[a-z_]+_(regular|casual)\.json$/.test(f));
const runs = files.map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const order = ['raider', 'defender', 'rusher', 'turtle', 'sandbagger', 'hoarder', 'raid_max', 'no_research', 'explorer'];
const byCad = (c) => runs.filter((r) => r.cadence === c).sort((a, b) => order.indexOf(a.policy) - order.indexOf(b.policy));
const L = [];
const f0 = (x) => (x === undefined || x === null || Number.isNaN(x) ? '-' : Math.round(x).toLocaleString('en-US'));
const f2 = (x) => (x === undefined || Number.isNaN(x) ? '-' : x.toFixed(2));
const pct = (x) => (x === undefined || Number.isNaN(x) ? '-' : Math.round(x * 100) + '%');
for (const cad of ['regular', 'casual']) {
  const rs = byCad(cad);
  if (!rs.length) continue;
  L.push(`## ${cad} cadence (${cad === 'regular' ? '4 visits a day, 2 sessions each' : '1 visit a day, 2 sessions'}), days played / stop`, '');
  L.push('| policy | days | stop | ' + [4, 5, 6, 7, 8, 9, 10, 11, 12].map((k) => `K${k} day`).join(' | ') + ' |');
  L.push('|---|---|---|' + [4, 5, 6, 7, 8, 9, 10, 11, 12].map(() => '---').join('|') + '|');
  for (const r of rs) L.push(`| ${r.policy} | ${r.days} | ${r.stopped.replace('stopped: ', '')} | ` + [4, 5, 6, 7, 8, 9, 10, 11, 12].map((k) => (r.reached[k] === undefined ? '-' : r.reached[k])).join(' | ') + ' |');
  L.push('');
  L.push('| policy | raids | avg stars | 3-star | won | loot/raid | looted total | Next presses | raided | held | stolen/raid | stolen total | stolen/looted | held rewards | final honor | sessions | storage full (either) | Coins full | Prov full | research started / skipped |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const rl = r.raidLog;
    const dl = r.defenseLog;
    const mean = (xs, f) => (xs.length ? xs.reduce((a, x) => a + f(x), 0) / xs.length : NaN);
    L.push(`| ${r.policy} | ${rl.length} | ${f2(mean(rl, (x) => x.stars))} | ${pct(mean(rl, (x) => (x.stars === 3 ? 1 : 0)))} | ${pct(mean(rl, (x) => (x.stars >= 1 ? 1 : 0)))} | ${f0(mean(rl, (x) => x.loot))} | ${f0(r.totals.looted)} | ${r.totals.nextPresses} | ${dl.length} | ${pct(mean(dl, (x) => (x.stars === 0 ? 1 : 0)))} | ${f0(mean(dl, (x) => x.lost))} | ${f0(r.totals.stolen)} | ${r.totals.looted ? pct(r.totals.stolen / r.totals.looted) : '-'} | ${f0(r.totals.rewards)} | ${r.totals.finalHonor} | ${r.totals.sessions} | ${pct(r.totals.fullStorage / r.totals.sessions)} | ${pct(r.totals.fullAcorns / r.totals.sessions)} | ${pct(r.totals.fullDew / r.totals.sessions)} | ${r.totals.researchStarted} / ${r.totals.researchSkipped} |`);
  }
  L.push('');
  // Per-Keep comparison: stars, loot, opponent Keep/bias, strength, held, stolen.
  for (const metric of [['stars', 'avg stars', f2], ['loot', 'loot per raid', f0], ['opponentKeep', 'opponent Keep', f2], ['opponentBias', 'opponent bias', f2], ['strength', 'own strength', f2], ['honor', 'honor while raiding', f0], ['held', 'held share', pct], ['stolen', 'stolen per raid against the village', f0], ['defenses', 'raids against the village', f0], ['daysAt', 'days spent at the Keep', (x) => (x === undefined ? '-' : x.toFixed(1))]]) {
    const [key, label, fmt] = metric;
    L.push(`### ${cad}: ${label} by Keep`, '');
    L.push('| policy | ' + [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((k) => `K${k}`).join(' | ') + ' |');
    L.push('|---|' + [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(() => '---').join('|') + '|');
    for (const r of rs) {
      L.push(`| ${r.policy} | ` + [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((k) => {
        const row = r.rows.find((x) => x.keep === k);
        if (!row) return '-';
        if ((key === 'stars' || key === 'loot' || key === 'opponentKeep' || key === 'opponentBias' || key === 'strength' || key === 'honor') && !row.raids) return '-';
        if ((key === 'held' || key === 'stolen') && !row.defenses) return '-';
        return fmt(row[key]);
      }).join(' | ') + ' |');
    }
    L.push('');
  }
}
const out = L.join('\n') + '\n';
writeFileSync(`${dir}/tables.md`, out);
console.log(out);
