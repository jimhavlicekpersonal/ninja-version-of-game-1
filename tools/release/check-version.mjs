// Beast Mode 2026-11-21 OPS-01 / SAV-08: the version-bump guard. Fails when SAVE_VERSION, SIM_RULES, PROTOCOL_VERSION
// or the newest database migration differ from tools/release/last-release.json while package.json's version is not
// greater than the last release's (a build players could not tell apart: MIN_CLIENT_BUILD, "What's new" and crash
// releases all read the version), and when the tag v<version> already names another commit. Plain Node, no shell.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const num = (text, re, what) => {
  const m = re.exec(text);
  if (!m) throw new Error(`could not read ${what}`);
  return Number(m[1]);
};

/** The versions in this checkout. */
export function currentVersions(root = '.') {
  const read = (f) => readFileSync(`${root}/${f}`, 'utf8');
  return {
    version: JSON.parse(read('package.json')).version,
    save: num(read('src/gameplay/sim/save.ts'), /export const SAVE_VERSION = (\d+)/, 'SAVE_VERSION'),
    rules: num(read('src/gameplay/sim/battle/battle.ts'), /export const SIM_RULES = (\d+)/, 'SIM_RULES'),
    protocol: num(read('src/backend/net/protocol.ts'), /export const PROTOCOL_VERSION = (\d+)/, 'PROTOCOL_VERSION'),
    migrations: Math.max(0, ...readdirSync(`${root}/server/migrations`).map((f) => Number(/^(\d{4})_/.exec(f)?.[1] ?? 0))),
  };
}

/** semver a > b (major.minor.patch, numbers only). */
export function semverGreater(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** Problems with this checkout's versions against the last release (empty: fine). */
export function versionProblems(now, last) {
  const changed = ['save', 'rules', 'protocol', 'migrations'].filter((k) => now[k] !== last[k]);
  const problems = [];
  if (changed.length && !semverGreater(now.version, last.version)) {
    problems.push(`${changed.map((k) => `${k} ${last[k]} → ${now[k]}`).join(', ')} changed since the last release (${last.version}), but package.json is still ${now.version}: bump the version (and update WHATS_NEW and the store marketing version)`);
  }
  for (const k of ['save', 'rules', 'protocol', 'migrations']) if (now[k] < last[k]) problems.push(`${k} went down (${last[k]} → ${now[k]})`);
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const last = JSON.parse(readFileSync('tools/release/last-release.json', 'utf8'));
  const now = currentVersions();
  const problems = versionProblems(now, last);
  try {
    const tagged = execFileSync('git', ['rev-parse', '-q', '--verify', `refs/tags/v${now.version}^{commit}`], { encoding: 'utf8' }).trim();
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (tagged && tagged !== head && !process.env.ALLOW_RETAG) problems.push(`tag v${now.version} already names ${tagged.slice(0, 12)}, not this commit: bump the version`);
  } catch {
    /* no such tag (or no git): fine */
  }
  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }
  console.log(`Versions ok: ${now.version} (save ${now.save}, rules ${now.rules}, protocol ${now.protocol}, migrations ${now.migrations})`);
}
