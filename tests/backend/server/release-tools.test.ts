/**
 * Release safety (roadmap steps 74 and 78): the server-first check that guards
 * every game release, and the game-versions dashboard.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { METRIC_HELP } from '../../../server/observability';
import { SIM_RULES } from '../../../src/gameplay/sim/battle/battle';

function fakeServer(hello: unknown): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/v1/hello') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(hello));
      } else res.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }));
  });
}

function check(serverUrl: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, ['tools/release/check-server-rules.mjs'], { env: { ...process.env, SERVER_URL: serverUrl } }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` });
    });
  });
}

describe('server first (step 74)', () => {
  it('lets a build ship only when the server already checks its battle rules', async () => {
    const ready = await fakeServer({ supportedRules: [SIM_RULES, SIM_RULES - 1] });
    const behind = await fakeServer({ supportedRules: [SIM_RULES - 1] });
    const old = await fakeServer({ protocol: 7 });
    try {
      expect((await check(ready.url)).code).toBe(0);
      const no = await check(behind.url);
      expect(no.code).not.toBe(0);
      expect(no.out).toMatch(/Deploy the server with these rules first/);
      expect((await check(old.url)).code).toBe(0);
      expect((await check('')).code).toBe(0);
      expect((await check('http://127.0.0.1:9')).code).not.toBe(0);
    } finally {
      ready.server.close();
      behind.server.close();
      old.server.close();
    }
  });
});

describe('game-versions dashboard (step 78)', () => {
  it('only charts metrics the server records', () => {
    const dash = JSON.parse(readFileSync('ops/grafana/game-versions.json', 'utf8')) as { panels: { targets: { expr: string }[] }[] };
    const names = new Set(dash.panels.flatMap((p) => p.targets.flatMap((t) => [...t.expr.matchAll(/\b(tk_[a-z_]+?)(?:_bucket|_sum|_count)?\b/g)].map((m) => m[1]))));
    expect(names.size).toBeGreaterThan(3);
    for (const n of names) expect(Object.keys(METRIC_HELP), n).toContain(n);
  });
});

describe('report section 5 step 2: a release that did nothing says so', () => {
  const deploy = (env: Record<string, string>) =>
    new Promise<{ code: number; stdout: string; summary: string }>((resolve) => {
      const summary = join(mkdtempSync(join(tmpdir(), 'tk-ci-')), 'summary.md');
      writeFileSync(summary, '');
      const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['DEPLOY_HOOK', 'SERVER_URL', 'TARGET', 'GITHUB_STEP_SUMMARY'].includes(k)));
      execFile(process.execPath, ['tools/release/deploy.mjs'], { env: { ...clean, IMAGE: 'ghcr.io/x/y', TAG: 'abc', GITHUB_STEP_SUMMARY: summary, ...env } }, (err, stdout) => {
        resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, summary: readFileSync(summary, 'utf8') });
      });
    });

  it('staging without a deploy hook passes with a warning on the run and in the summary', async () => {
    const r = await deploy({ TARGET: 'staging' });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^::warning title=Server not deployed::/m);
    expect(r.summary).toMatch(/Server not deployed/);
  });

  it('a production deploy without a hook fails', async () => {
    const r = await deploy({ TARGET: 'production' });
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^::error title=Production not deployed::/m);
  });

  it('the workflows warn when a release job or contract tests are skipped', () => {
    const server = readFileSync('.github/workflows/server.yml', 'utf8');
    expect(server).toMatch(/TARGET: staging/);
    expect(server).toMatch(/TARGET: production/);
    expect(server).toMatch(/::warning title=No staging contract tests::/);
    expect(readFileSync('.github/workflows/android.yml', 'utf8')).toMatch(/GITHUB_STEP_SUMMARY/);
  });
});

describe('PUB-01: the deploy check reads lang and dir separately', () => {
  it('accepts every ready language page, right-to-left ones included', async () => {
    const { pageLanguageProblem } = await import('../../../tools/release/page-language.mjs');
    const { readdirSync } = await import('node:fs');
    // Every language with published pages (readiness can drop inside a phase that added English text).
    const languages = JSON.parse(readFileSync('locales/languages.json', 'utf8')).languages as { code: string }[];
    const ready = languages.map((l) => l.code).filter((code) => code !== 'en' && existsSync(`public/${code}`));
    expect(ready.length).toBeGreaterThan(40);
    let rtlPages = 0;
    for (const code of ready) {
      for (const page of readdirSync(`public/${code}`).filter((f) => f.endsWith('.html'))) {
        const html = readFileSync(`public/${code}/${page}`, 'utf8');
        expect(pageLanguageProblem(html, code), `${code}/${page}`).toBeNull();
        // The old check, the exact text `<html lang="code">`, rejected every right-to-left page.
        if (!html.includes(`<html lang="${code}">`)) rtlPages++;
      }
    }
    expect(rtlPages).toBeGreaterThan(0);
    expect(pageLanguageProblem('<html lang="ar">', 'ar')).toMatch(/right-to-left/);
    expect(pageLanguageProblem('<html lang="de" dir="rtl">', 'de')).toMatch(/left-to-right/);
    expect(pageLanguageProblem('<html lang="es">', 'de')).toMatch(/expected/);
  });
});

describe('PUB-02 / XPL-07: CI, the server image and the test runs share one exact Node', () => {
  it('every workflow reads .node-version and the Dockerfile pins the same version', async () => {
    const { readdirSync } = await import('node:fs');
    const version = readFileSync('.node-version', 'utf8').trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(readFileSync('Dockerfile', 'utf8')).toContain(`node:${version}-slim@sha256:`);
    for (const f of readdirSync('.github/workflows')) {
      const yml = readFileSync(`.github/workflows/${f}`, 'utf8');
      expect(yml, f).not.toMatch(/node-version:\s/);
      if (yml.includes('setup-node')) expect(yml, f).toContain('node-version-file: .node-version');
    }
  });
});

describe('PUB-04 (P7-01): the store-readiness preflight', () => {
  const run = (args: string[], env: Record<string, string>) =>
    new Promise<{ code: number; out: string }>((resolve) => {
      const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['APP_ID', 'ALLOW_LEGACY_APP_ID', 'GITHUB_STEP_SUMMARY', 'VITE_SERVER_URL', 'VITE_PUBLIC_URL', 'VITE_GOOGLE_CLIENT_ID', 'VITE_SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'VITE_APP_STORE_URL', 'VITE_PLAY_STORE_URL'].includes(k)));
      execFile(process.execPath, ['tools/release/check-store-ready.mjs', ...args], { env: { ...clean, ...env } }, (err, stdout) => resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, out: stdout }));
    });

  it('lists what is missing as a notice, and fails a store build on the blocking items', async () => {
    const notice = await run([], {});
    expect(notice.code).toBe(0);
    expect(notice.out).toMatch(/legal-config\.js operator: empty/);
    expect(notice.out).toMatch(/Terms of service: draft/);
    expect(notice.out).toMatch(/App id: APP_ID is not set/);
    const store = await run(['--store'], { APP_ID: 'com.example.kagemura' });
    expect(store.code).toBe(1);
    expect(store.out).toMatch(/::error title=Not ready for a store build::/);
    expect(store.out).not.toMatch(/✗ App id/);
  });

  it('Beast Mode OPS-12: lists the launch variables; missing VITE_PUBLIC_URL is blocking with --store', async () => {
    const notice = await run([], {});
    expect(notice.code).toBe(0);
    for (const row of ['Public game URL', 'Google sign-in', 'Crash reports', 'Store links']) expect(notice.out).toContain(row);
    const store = await run(['--store', '--platform=android'], { APP_ID: 'com.example.kagemura' });
    expect(store.out).toMatch(/✗ Public game URL/);
    expect(store.out).toMatch(/✗ Google sign-in/);
    expect(store.out).toMatch(/::error title=Not ready for a store build::.*Public game URL/);
    // Google sign-in blocks only the Android store build.
    const ios = await run(['--store', '--platform=ios'], { APP_ID: 'com.example.kagemura', VITE_PUBLIC_URL: 'https://example.com/game/' });
    expect(ios.out).not.toMatch(/✗ Public game URL/);
    expect(ios.out).toMatch(/· Google sign-in/);
    expect(ios.out).not.toMatch(/iPhone privacy manifest/);
    // With a DSN, the source-map token is asked for.
    expect((await run([], { VITE_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1' })).out).toMatch(/· Source maps: SENTRY_AUTH_TOKEN/);
  });
});
