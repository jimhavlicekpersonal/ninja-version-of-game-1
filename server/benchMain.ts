/** `npm run server:bench`: time battle re-simulation on this machine (roadmap step 18). Prints a table, then JSON. */
import { cpus } from 'node:os';
import { defaultData } from '../src/gameplay/sim/data';
import { benchmarkBattles } from './bench';

const battles = Number(process.argv.find((a) => a.startsWith('--battles='))?.slice(10)) || 40;
const rows = benchmarkBattles(defaultData, { battles });
const cpu = cpus()[0]?.model ?? 'unknown CPU';
console.log(`runBattle on ${cpu} (${cpus().length} cores), Node ${process.version}, ${battles} battles per Keep`);
console.log('Keep | median ms | p95 ms | max ms | ticks | buildings | troops');
for (const r of rows) console.log(`${String(r.keep).padStart(4)} | ${String(r.medianMs).padStart(9)} | ${String(r.p95Ms).padStart(6)} | ${String(r.maxMs).padStart(6)} | ${String(r.meanTicks).padStart(5)} | ${String(r.buildings).padStart(9)} | ${String(r.troops).padStart(6)}`);
const worst = Math.max(...rows.map((r) => r.p95Ms));
console.log(`One core re-simulates about ${Math.floor(1000 / worst)} battles a second at the slowest Keep's p95 (${Math.floor((86_400_000 / worst) / 1000)}k a day).`);
console.log(JSON.stringify({ cpu, cores: cpus().length, node: process.version, rows }));
