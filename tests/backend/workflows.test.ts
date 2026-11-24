/**
 * Every GitHub workflow parsed with a real YAML parser (release-config.test.ts reads them as text, which let an
 * android.yml with a lost `concurrency:` key pass while GitHub refused every run of it, 2026-11-22 to 2026-11-24).
 * A regression guard for the release machinery; it does not prove a run succeeds.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { unreadableLive } from '../../tools/release/rollback-check.mjs';

const dir = new URL('../../.github/workflows/', import.meta.url);
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
const text = (f: string) => readFileSync(new URL(f, dir), 'utf8');
type Step = { run?: string; uses?: string; env?: Record<string, string>; if?: string; name?: string };
type Job = { 'runs-on'?: string; uses?: string; steps?: Step[]; concurrency?: { group: string; 'cancel-in-progress'?: boolean } | string };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job>; concurrency?: { group: string } };
const wf = (f: string) => parse(text(f)) as Workflow;

const TOP_LEVEL = new Set(['name', 'run-name', 'on', 'permissions', 'concurrency', 'env', 'defaults', 'jobs']);
const EVENTS = new Set(['push', 'pull_request', 'workflow_dispatch', 'workflow_run', 'workflow_call', 'schedule', 'release', 'repository_dispatch', 'merge_group']);

describe('GitHub workflows', () => {
  it('there are workflows to check', () => expect(files.length).toBeGreaterThan(3));

  it.each(files)('%s is valid YAML with only workflow keys and real events', (f) => {
    const w = wf(f);
    for (const k of Object.keys(w)) expect(TOP_LEVEL, `${f}: top-level key ${k}`).toContain(k);
    expect(Object.keys(w.on).length).toBeGreaterThan(0);
    for (const k of Object.keys(w.on)) expect(EVENTS, `${f}: on.${k} is not an event`).toContain(k);
    for (const [name, job] of Object.entries(w.jobs)) {
      expect(Boolean(job['runs-on'] ?? job.uses), `${f}: job ${name} has no runs-on`).toBe(true);
      for (const s of job.steps ?? []) expect(Boolean(s.run ?? s.uses), `${f}: a step of ${name} has neither run nor uses`).toBe(true);
    }
  });

  it.each(files)('%s never interpolates workflow inputs or secrets inside a run script', (f) => {
    for (const job of Object.values(wf(f).jobs))
      for (const s of job.steps ?? []) {
        expect(s.run ?? '', `${f}: ${s.name ?? s.run}`).not.toMatch(/\$\{\{\s*(github\.event\.inputs|inputs|secrets)\./);
      }
  });

  it('store builds run lint, tests and the bundle budget before building', () => {
    const order = (steps: Step[]) => steps.map((s) => s.run ?? '').join('\n');
    for (const [f, job] of [['android.yml', 'aab'], ['ios-testflight.yml', 'testflight']] as const) {
      const runs = order(wf(f).jobs[job].steps!);
      const build = runs.indexOf('npm run build');
      expect(runs.indexOf('npm run lint'), `${f} lint`).toBeGreaterThan(-1);
      expect(runs.indexOf('npm test'), `${f} test`).toBeGreaterThan(-1);
      expect(runs.indexOf('npm test')).toBeLessThan(build);
      expect(runs.indexOf('bundle-budget.mjs')).toBeGreaterThan(build);
    }
  });

  it('the Pages deploy and the web rollback share one queue that never cancels', () => {
    const deploy = wf('deploy.yml').jobs.deploy.concurrency;
    const rollback = wf('rollback-web.yml').concurrency;
    expect(deploy).toMatchObject({ group: 'pages', 'cancel-in-progress': false });
    expect(rollback).toMatchObject({ group: 'pages' });
  });

  it('a server rollback accepts only a 12-character commit as its image tag', () => {
    const steps = Object.values(wf('server.yml').jobs).flatMap((j) => j.steps ?? []).filter((s) => s.run?.includes('rollback-check.mjs server'));
    expect(steps.length).toBe(2);
    for (const s of steps) {
      expect(s.env?.IMAGE_TAG).toContain('github.event.inputs.image_tag');
      expect(s.run).toContain("grep -Eqx '[0-9a-f]{12}'");
    }
  });
});

describe('rollback check when the live side cannot be read', () => {
  it('refuses a web rollback unless the operator allows it', () => {
    expect(unreadableLive('web', false).problem).toMatch(/could not be read/);
    expect(unreadableLive('web', true).problem).toBeNull();
    expect(text('rollback-web.yml')).toMatch(/allow_unverified:/);
  });

  it('compares a server rollback with the rules of the workflow commit instead of passing it', () => {
    expect(unreadableLive('server', false, [7, 8, 9]).liveRules).toEqual([7, 8, 9]);
  });
});

describe('local native builds ship no source maps', () => {
  it('every cap:* script strips the maps between the build and the sync', async () => {
    const scripts = (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> }).scripts;
    const cap = Object.entries(scripts).filter(([k]) => k.startsWith('cap:'));
    expect(cap.length).toBeGreaterThan(2);
    for (const [k, v] of cap) expect(v, k).toMatch(/npm run build && node tools\/release\/strip-maps\.mjs && cap sync/);
  });

  it('strip-maps removes every .map file and nothing else', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readdirSync: ls } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { stripMaps } = await import('../../tools/release/strip-maps.mjs');
    const d = mkdtempSync(join(tmpdir(), 'maps-'));
    mkdirSync(join(d, 'assets'));
    for (const f of ['index.html', 'assets/a.js', 'assets/a.js.map', 'b.css.map']) writeFileSync(join(d, f), 'x');
    expect(stripMaps(d)).toBe(2);
    expect(ls(join(d, 'assets'))).toEqual(['a.js']);
    expect(ls(d).sort()).toEqual(['assets', 'index.html']);
  });
});
