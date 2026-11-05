/**
 * `npm run server:load -- --url https://staging… [--bps 14] [--seconds 120] [--players 60]`
 * (roadmap step 46; see server/load.ts). Prints a table per call and exits 1
 * if fewer than 90% of the target battles went through or anything failed.
 */
import { defaultData } from '../src/gameplay/sim/data';
import { runLoad } from './load';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const url = arg('url', process.env.LOAD_URL ?? '');
if (!url) {
  console.error('Usage: npm run server:load -- --url <server> [--bps 14] [--seconds 120] [--players 60]');
  process.exit(1);
}
const bps = Number(arg('bps', '14'));
const report = await runLoad({ url, data: defaultData, battlesPerSecond: bps, seconds: Number(arg('seconds', '120')), players: Number(arg('players', String(Math.max(10, Math.ceil(bps * 4))))), log: (l) => console.log(l) });
console.log(`\nBattles: ${report.battles} (${report.achievedBps}/s, target ${report.targetBps}/s)`);
console.log('call       count  errors   p50   p95   p99   max (ms)');
for (const [name, c] of Object.entries(report.calls)) console.log(`${name.padEnd(10)} ${String(c.count).padStart(5)} ${String(c.errors).padStart(7)} ${String(c.p50).padStart(5)} ${String(c.p95).padStart(5)} ${String(c.p99).padStart(5)} ${String(c.max).padStart(5)}`);
if (Object.keys(report.errors).length) console.log('Errors:', report.errors);
process.exit(report.achievedBps >= 0.9 * report.targetBps && !Object.keys(report.errors).length ? 0 : 1);
