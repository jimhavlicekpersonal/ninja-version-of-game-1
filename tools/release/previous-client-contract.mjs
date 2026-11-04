// Contract tests with the previous release's client (roadmap step 77): a server
// must keep serving the game version players still have. Checks out the latest
// release tag (v*) before this commit into a worktree, installs it, and runs its
// own contract tests against CONTRACT_URL. Skips when there is no earlier release.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

if (!process.env.CONTRACT_URL) {
  console.error('Set CONTRACT_URL to the server to test.');
  process.exit(1);
}
let tag = '';
try {
  tag = out('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD^']);
} catch {
  console.log('No earlier release tag (v*): nothing to compare with yet.');
  process.exit(0);
}
const dir = join(mkdtempSync(join(tmpdir(), 'prev-client-')), 'app');
run('git', ['worktree', 'add', '--detach', dir, tag]);
try {
  if (!existsSync(join(dir, 'tests/backend/contract'))) {
    console.log(`${tag} has no contract tests.`);
    process.exit(0);
  }
  run('npm', ['ci', '--ignore-scripts'], { cwd: dir });
  console.log(`Contract tests of ${tag} against ${process.env.CONTRACT_URL}`);
  run('npx', ['vitest', 'run', 'tests/backend/contract'], { cwd: dir, env: process.env });
} finally {
  run('git', ['worktree', 'remove', '--force', dir]);
}
