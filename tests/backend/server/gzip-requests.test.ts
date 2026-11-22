/** Beast Mode SAV-06: large request bodies may come gzip-compressed (hello feature `gzip-requests`). */
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { HttpServerAdapter, memoryTokenStore } from '../../../src/backend/net/httpAdapter';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';

describe('SAV-06: gzip request bodies', () => {
  it('the server reads a gzip body like a plain one and lists the feature', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data, now: () => Date.UTC(2026, 3, 6, 12) });
    const hello = JSON.parse((await app.inject({ method: 'GET', url: Routes.hello })).body);
    expect(hello.features).toContain('gzip-requests');
    const r = await app.inject({ method: 'POST', url: Routes.players, payload: gzipSync(JSON.stringify({ name: 'Zipped Ann' })), headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } });
    expect(r.statusCode).toBe(201);
    expect(JSON.parse(r.body).playerId).toBeTruthy();
    const bad = await app.inject({ method: 'POST', url: Routes.players, payload: Buffer.from('not gzip'), headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } });
    expect(bad.statusCode).toBe(400);
  });

  it('the game gzips a large body only when the server says it can read it', async () => {
    const seen: { enc: string | null; body: string }[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      const raw = init.body instanceof Uint8Array ? Buffer.from(init.body) : Buffer.from(String(init.body ?? ''));
      seen.push({ enc: h['content-encoding'] ?? null, body: h['content-encoding'] === 'gzip' ? gunzipSync(raw).toString() : raw.toString() });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof globalThis.fetch;
    let can = false;
    const port = new HttpServerAdapter('https://x.test', { fetch, tokens: memoryTokenStore('t'), retries: 0, gzipRequests: () => can });
    const big = { base: { name: 'x'.repeat(40_000) } };
    await port.call('PUT', Routes.base, big);
    can = true;
    await port.call('PUT', Routes.base, big);
    await port.call('PUT', Routes.base, { base: { name: 'small' } });
    expect(seen.map((s) => s.enc)).toEqual([null, 'gzip', null]);
    expect(JSON.parse(seen[1].body)).toEqual(big);
  });
});
