/**
 * `npm run server:load -- --url https://staging… [--bps 14] [--seconds 120] [--players 60] [--mix [--cps 20]]`
 * (roadmap step 46; see server/load.ts). Prints a table per call and exits 1
 * if fewer than 90% of the target battles went through or anything failed.
 * Beast Mode SEC-08: `--mix` adds held-village sessions (hello → commands → notices, `--cps` a second) and the
 * 10x pass criteria of docs/SHIPPING.md 3h (p95 under 1 s for commands, under 3 s for attacks).
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
const mix = process.argv.includes('--mix');
const cps = mix ? Number(arg('cps', '20')) : 0;
const report = await runLoad({ url, data: defaultData, battlesPerSecond: bps, seconds: Number(arg('seconds', '120')), players: Number(arg('players', String(Math.max(10, Math.ceil(bps * 4))))), commandsPerSecond: cps, ...(mix ? { holders: Number(arg('holders', String(Math.max(10, Math.ceil(cps * 3))))) } : {}), log: (l) => console.log(l) });
console.log(`\nBattles: ${report.battles} (${report.achievedBps}/s, target ${report.targetBps}/s)`);
console.log('call       count  errors   p50   p95   p99   max (ms)');
for (const [name, c] of Object.entries(report.calls)) console.log(`${name.padEnd(10)} ${String(c.count).padStart(5)} ${String(c.errors).padStart(7)} ${String(c.p50).padStart(5)} ${String(c.p95).padStart(5)} ${String(c.p99).padStart(5)} ${String(c.max).padStart(5)}`);
if (Object.keys(report.errors).length) console.log('Errors:', report.errors);
let pass = report.achievedBps >= 0.9 * report.targetBps && !Object.keys(report.errors).length;
if (mix) {
  console.log(`Command sessions: ${report.sessions ?? 0} (target ${cps}/s), refused commands: ${report.refusedCommands ?? 0}`);
  const slow = [['commands', 1000], ['attack', 3000]].filter(([name, ms]) => (report.calls[name as string]?.p95 ?? 0) >= (ms as number));
  if (slow.length) console.log(`Too slow at p95: ${slow.map(([n, ms]) => `${n} (limit ${ms} ms)`).join(', ')}`);
  pass &&= !slow.length && (report.sessions ?? 0) >= 0.9 * cps * Number(arg('seconds', '120'));
  console.log('Also check on the server: no 5xx in tk_http_requests_total and tk_resim_busy_total unchanged.');
}
process.exit(pass ? 0 : 1);
