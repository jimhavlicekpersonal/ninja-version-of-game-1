/**
 * Release safety (roadmap steps 74 and 78): the server-first check that guards
 * every game release, and the game-versions dashboard.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
