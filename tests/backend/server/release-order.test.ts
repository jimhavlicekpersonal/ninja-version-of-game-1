/**
 * Release order, server first (roadmap step 74): tools/release/check-rules.mjs
 * passes only when the production server keeps this build's battle rules and
 * protocol, and passes with a note when there is no server yet.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { defaultData as data } from '../../../src/gameplay/sim/data';

const SCRIPT = resolve(__dirname, '../../../tools/release/check-rules.mjs');

function check(url?: string): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    const p = spawn(process.execPath, [SCRIPT, ...(url ? [url] : [])], { env: { ...process.env, PRODUCTION_SERVER_URL: '' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => done({ code: code ?? -1, out }));
  });
}

async function fake(hello: object): Promise<{ url: string; close: () => void }> {
  const srv = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(hello));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() };
}

describe('release order check (roadmap step 74)', () => {
  it('passes against a server that keeps this build\'s rules', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data });
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const r = await check(`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`);
      expect(r.out).toMatch(/^OK/);
      expect(r.code).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('fails against an older server, and passes with a note when there is none', async () => {
    const old = await fake({ name: 'toadstool-kingdoms', protocol: 7, minProtocol: 7, features: [] });
    const newer = await fake({ name: 'toadstool-kingdoms', protocol: 99, minProtocol: 7, features: [], supportedRules: [98, 99] });
    try {
      const a = await check(old.url);
      expect(a.code).toBe(1);
      expect(a.out).toMatch(/deploy the server first/);
      const b = await check(newer.url);
      expect(b.code).toBe(1);
      expect(b.out).toMatch(/keeps only 98, 99/);
    } finally {
      old.close();
      newer.close();
    }
    const none = await check();
    expect(none.code).toBe(0);
    expect(none.out).toMatch(/skipping/);
  });
});
