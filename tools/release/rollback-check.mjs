// Beast Mode 2026-11-21 OPS-05: what may roll back. Saves never go backwards (a build older than the save players
// already have stops at "newer save"), and a server must keep every battle-rules version the live games play.
//
//   node tools/release/rollback-check.mjs web <target version.json> <GAME_URL>
//   node tools/release/rollback-check.mjs server <commit> <SERVER_URL>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Why the target web build may not replace the live one, or null. */
export function webRollbackProblem(live, target) {
  if (!target || typeof target.save !== 'number') return 'the target build has no version.json (built before rollbacks were possible)';
  if (live && typeof live.save === 'number' && target.save !== live.save) return `save version ${live.save} is live and the target build writes ${target.save}: saves never go backwards (forward-fix instead)`;
  if (live && typeof live.rules === 'number' && typeof target.rules === 'number' && target.rules !== live.rules) return `battle rules ${live.rules} are live and the target plays ${target.rules}: check the server still serves them (it keeps archived rules)`;
  return null;
}

/** Why the server at `targetRules` may not replace one that serves `liveRules`, or null. */
export function serverRollbackProblem(liveRules, targetRules) {
  const missing = (liveRules ?? []).filter((r) => !targetRules.includes(r));
  return missing.length ? `the live server checks battle rules ${missing.join(', ')} that the target image does not: games on those rules would be refused (forward-fix instead)` : null;
}

/** The battle rules a commit's server serves: its SIM_RULES and every archived rules folder. */
export function rulesAtCommit(commit) {
  const src = execFileSync('git', ['show', `${commit}:src/gameplay/sim/battle/battle.ts`], { encoding: 'utf8' });
  const live = Number(/export const SIM_RULES = (\d+);/.exec(src)?.[1]);
  const dirs = execFileSync('git', ['ls-tree', '--name-only', `${commit}:server/rules`], { encoding: 'utf8' }).split('\n').map((d) => /^v(\d+)$/.exec(d.trim())?.[1]).filter(Boolean).map(Number);
  return [...new Set([live, ...dirs])].filter((n) => Number.isFinite(n));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [kind, target, url] = process.argv.slice(2);
  const get = async (u) => {
    const res = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`);
    return res.json();
  };
  let problem = null;
  if (kind === 'web') {
    const live = url ? await get(new URL('version.json', url.endsWith('/') ? url : `${url}/`).href).catch(() => null) : null;
    problem = webRollbackProblem(live, JSON.parse(readFileSync(target, 'utf8')));
  } else if (kind === 'server') {
    const hello = url ? await get(`${url.replace(/\/+$/, '')}/v1/hello`).catch(() => null) : null;
    problem = serverRollbackProblem(hello?.supportedRules ?? [], rulesAtCommit(target));
  } else problem = 'usage: rollback-check.mjs web <version.json> <GAME_URL> | server <commit> <SERVER_URL>';
  if (problem) {
    console.error(`::error::Rollback refused: ${problem}`);
    process.exit(1);
  }
  console.log('Rollback allowed.');
}
