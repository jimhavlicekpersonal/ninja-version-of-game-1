/**
 * Beast Mode 2026-11-21 OPS-05: one-command rollback. The workflows cannot run here, so these read them
 * (a regression guard, not proof a rollback works: the owner rehearsal OWN-31 is that), and unit-test the
 * comparison that refuses a rollback across save or battle-rules versions.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rulesAtCommit, serverRollbackProblem, webRollbackProblem } from '../../tools/release/rollback-check.mjs';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('web rollback', () => {
  it('keeps the Pages artifact at least 14 days so an earlier build can go back live', () => {
    const days = Number(/upload-pages-artifact@[\s\S]*?retention-days: (\d+)/.exec(read('.github/workflows/deploy.yml'))?.[1]);
    expect(days).toBeGreaterThanOrEqual(14);
  });

  it('the build writes version.json with its save and battle-rules versions', () => {
    const vite = read('vite.config.ts');
    expect(vite).toContain("fileName: 'version.json'");
    expect(vite).toMatch(/save: num\('src\/gameplay\/sim\/save\.ts'/);
    expect(vite).toMatch(/rules: num\('src\/gameplay\/sim\/battle\/battle\.ts'/);
  });

  it('refuses a build that writes a different save version, or has no version.json', () => {
    expect(webRollbackProblem({ save: 25, rules: 8 }, { save: 24, rules: 8 })).toMatch(/saves never go backwards/);
    expect(webRollbackProblem({ save: 24, rules: 8 }, null)).toMatch(/no version\.json/);
    expect(webRollbackProblem({ save: 24, rules: 8 }, { save: 24, rules: 8 })).toBeNull();
    // A live site from before version.json existed: only the target's own file is required.
    expect(webRollbackProblem(null, { save: 24, rules: 8 })).toBeNull();
  });

  it('refuses a build on other battle rules (the server must be checked first)', () => {
    expect(webRollbackProblem({ save: 24, rules: 9 }, { save: 24, rules: 8 })).toMatch(/battle rules/);
  });

  it('the rollback workflow checks before it deploys, then verifies the published game', () => {
    const wf = read('.github/workflows/rollback-web.yml');
    expect(wf).toMatch(/workflow_dispatch:[\s\S]*run_id:/);
    const check = wf.indexOf('rollback-check.mjs web');
    const deploy = wf.indexOf('actions/deploy-pages@');
    expect(check).toBeGreaterThan(0);
    expect(deploy).toBeGreaterThan(check);
    expect(wf.indexOf('check-published-game.mjs')).toBeGreaterThan(deploy);
  });
});

describe('server rollback', () => {
  it('refuses an image that does not check every battle-rules version the live server does', () => {
    expect(serverRollbackProblem([7, 8], [5, 7])).toMatch(/battle rules 8/);
    expect(serverRollbackProblem([8], [5, 7, 8])).toBeNull();
    expect(serverRollbackProblem(undefined, [8])).toBeNull();
  });

  it('reads the rules a commit serves from git (SIM_RULES and the archived rules folders)', () => {
    const rules = rulesAtCommit('HEAD');
    const live = Number(/export const SIM_RULES = (\d+);/.exec(read('src/gameplay/sim/battle/battle.ts'))?.[1]);
    expect(rules).toContain(live);
    expect(rules.length).toBeGreaterThan(1);
  });

  it('server.yml deploys an existing image tag without testing or building again', () => {
    const wf = read('.github/workflows/server.yml');
    expect(wf).toMatch(/workflow_dispatch:[\s\S]*image_tag:/);
    for (const job of ['test', 'image']) {
      const body = new RegExp(`\\n  ${job}:\\n([\\s\\S]*?)\\n  [a-z]`).exec(wf)?.[1] ?? '';
      expect(body, job).toMatch(/if: github\.event\.inputs\.image_tag == ''/);
    }
    expect(wf.match(/TAG: \$\{\{ github\.event\.inputs\.image_tag \|\| needs\.image\.outputs\.tag \}\}/g)).toHaveLength(2);
    expect(wf.match(/needs\.image\.result == 'skipped' && github\.event\.inputs\.image_tag != ''/g)).toHaveLength(2);
    expect(wf.match(/rollback-check\.mjs server/g)).toHaveLength(2);
  });
});

describe('Beast Mode OPS-13: launch-day and sunset documents', () => {
  it('exist, cover their parts and are linked from RELEASE.md', () => {
    const launch = read('docs/ops/LAUNCH_DAY.md');
    for (const part of ['Day 0 timeline', 'Known issues', 'Support reply templates', 'Hotfix path', 'MIN_CLIENT_BUILD', 'expedited review']) expect(launch, part).toContain(part);
    const sunset = read('docs/ops/SUNSET.md');
    for (const part of ['PRODUCTS_OFF', 'jp-unused-balance', '30 days', 'Offline mode', 'Delete player data']) expect(sunset, part).toContain(part);
    const release = read('docs/store/RELEASE.md');
    expect(release).toContain('docs/ops/LAUNCH_DAY.md');
    expect(release).toContain('docs/ops/SUNSET.md');
  });
});
