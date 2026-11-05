/** The HTTP adapter (server/app.ts): routes, status codes, error bodies, auth and CORS. Game rules are in core.test.ts. */
import { describe, expect, it } from 'vitest';
import { buildServer, validateBase, type ServerOptions } from '../../../server/app';
import { capBaseLoot } from '../../../server/core/pvp';
import { BODY_LIMITS, MemoryRateLimiter } from '../../../server/rateLimit';
import { MemoryRepo } from '../../../server/repo';
import { PROTOCOL_VERSION, Routes } from '../../../src/backend/net/protocol';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { storageLootCap, villageToBase } from '../../../src/gameplay/sim/defense';
import { createNewVillage } from '../../../src/gameplay/sim/village';
import { baseAt, rush } from './harness';

function setup(opts: Partial<ServerOptions> = {}) {
  let t = Date.UTC(2026, 2, 1);
  const repo = new MemoryRepo();
  const app = buildServer({ repo, data, now: () => t, ...opts });
  const advance = (ms: number) => (t += ms);
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS', url: string, token?: string, payload?: unknown, extra: { ip?: string; headers?: Record<string, string> } = {}) => {
    const r = await app.inject({ method, url, payload: payload as object, remoteAddress: extra.ip, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra.headers } });
    return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, headers: r.headers };
  };
  const register = async (name: string) => (await call('POST', Routes.players, undefined, { name })).body as { playerId: string; token: string };
  return { app, repo, call, register, advance, now: () => t };
}

const sampleBase = () => {
  const v = createNewVillage(Date.UTC(2026, 0, 1), data);
  return villageToBase({ ...v, buildings: v.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle') }, Date.UTC(2026, 0, 1), data);
};

describe('server HTTP adapter', () => {
  it('rejects impossible bases and clamps loot to the rules', () => {
    expect(validateBase(sampleBase(), data)).toBeNull();
    const overlap = sampleBase();
    overlap.buildings[1] = { ...overlap.buildings[1], x: overlap.buildings[0].x, y: overlap.buildings[0].y };
    expect(validateBase(overlap, data)).toMatch(/overlap/);
    expect(validateBase({ name: 'x', hallLevel: 1, buildings: [] }, data)).toBeTruthy();
    const greedy = baseAt(2);
    const store = greedy.buildings.find((b) => data.buildings[b.type].category === 'storage')!;
    store.loot = { acorns: 99_999_999 };
    expect(validateBase(greedy, data)).toBeNull();
    capBaseLoot(greedy, data);
    expect(store.loot.acorns).toBeLessThanOrEqual(storageLootCap(2, data));
  });

  it('says hello with its protocol version and features', async () => {
    const s = setup();
    const r = await s.call('GET', Routes.hello);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: 'toadstool-kingdoms', protocol: PROTOCOL_VERSION, serverTime: s.now() });
    expect(r.body.features).toEqual(expect.arrayContaining(['pvp', 'groves', 'grove-raid']));
  });

  it('answers CORS preflights', async () => {
    const s = setup();
    const r = await s.call('OPTIONS', Routes.match);
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('*');
    expect(String(r.headers['access-control-allow-headers'])).toMatch(/authorization/);
  });

  it('allows only listed origins when CORS_ORIGIN is a list (web game and native apps)', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data, corsOrigin: 'https://jimhavlicekpersonal.github.io, capacitor://localhost,https://localhost' });
    const pre = (origin: string) => app.inject({ method: 'OPTIONS', url: Routes.match, headers: { origin } });
    expect((await pre('capacitor://localhost')).headers['access-control-allow-origin']).toBe('capacitor://localhost');
    expect((await pre('https://jimhavlicekpersonal.github.io')).headers['access-control-allow-origin']).toBe('https://jimhavlicekpersonal.github.io');
    expect((await pre('https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });

  it('registers players, needs a token, renames and stores bases', async () => {
    const s = setup();
    const a = await s.register('Pip');
    expect(a.token).toBeTruthy();
    const anon = await s.call('GET', Routes.me);
    expect(anon.status).toBe(401);
    expect(anon.body).toMatchObject({ error: 'unauthorized' });
    expect((await s.call('GET', Routes.me, 'nope')).status).toBe(401);
    expect((await s.call('GET', Routes.me, a.token)).body).toMatchObject({ name: 'Pip', groveId: null });
    expect((await s.call('PUT', Routes.me, a.token, { name: 'Pip the Bold' })).body.name).toBe('Pip the Bold');
    // Native-script names are kept; look-alike mixes are refused with a reason and change nothing.
    s.advance(29 * 24 * 3_600_000);
    expect((await s.call('PUT', Routes.me, a.token, { name: '影村の風' })).body.name).toBe('影村の風');
    s.advance(29 * 24 * 3_600_000);
    expect((await s.call('PUT', Routes.me, a.token, { name: '‮محمد' })).body.name).toBe('محمد');
    const spoof = await s.call('PUT', Routes.me, a.token, { name: 'pаypal' });
    expect(spoof.status).toBe(400);
    expect(spoof.body).toMatchObject({ error: 'bad_request' });
    expect((await s.call('GET', Routes.me, a.token)).body.name).toBe('محمد');
    s.advance(29 * 24 * 3_600_000);
    expect((await s.call('PUT', Routes.me, a.token, { name: 'Pip the Bold' })).body.name).toBe('Pip the Bold');
    expect((await s.call('PUT', Routes.base, a.token, { base: sampleBase() })).status).toBe(204);
    const bad = await s.call('PUT', Routes.base, a.token, { base: { buildings: [] } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('bad_request');
  });

  it('matches, re-simulates an attack and reports it to the defender over HTTP', async () => {
    const s = setup();
    const attacker = await s.register('Attacker');
    const defender = await s.register('Defender');
    await s.call('PUT', Routes.base, attacker.token, { base: baseAt(1, 3) });
    await s.call('PUT', Routes.base, defender.token, { base: baseAt(1, 77) });
    s.advance(25 * 3_600_000);
    const m = await s.call('GET', Routes.match, attacker.token);
    expect(m.status).toBe(200);
    expect(m.body.opponent).toMatchObject({ name: 'Defender', kind: 'player' });
    const { army, deployments } = rush(20);
    expect(Number.isInteger(m.body.seed) && m.body.seed >= 0 && m.body.seed < 2 ** 32).toBe(true);
    const atk = await s.call('POST', Routes.attacks, attacker.token, { ticket: m.body.ticket, seed: m.body.seed, army, deployments });
    expect(atk.status).toBe(200);
    expect(atk.body.result.hash).toBe(runBattle({ seed: m.body.seed, base: m.body.base, army, infiltration: true }, deployments, data).result.hash);
    const again = await s.call('POST', Routes.attacks, attacker.token, { ticket: m.body.ticket, seed: m.body.seed, army, deployments });
    // Idempotent: a retried report returns the first answer instead of applying it twice.
    expect(again.status).toBe(200);
    expect(again.body).toEqual(atk.body);
    const defs = await s.call('GET', `${Routes.defenses}?since=0`, defender.token);
    expect(defs.body.defenses).toHaveLength(1);
    expect(defs.body.defenses[0].attackerName).toBe('Attacker');
  });

  it('serves Groves: no Grove before joining, 201 on create, chat and requests', async () => {
    const s = setup();
    const a = await s.register('Ann');
    const b = await s.register('Ben');
    const none = await s.call('GET', Routes.grove, a.token);
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ grove: null });
    const chatOutside = await s.call('GET', Routes.groveChat, a.token);
    expect(chatOutside.status).toBe(404);
    expect(chatOutside.body.error).toBe('not_in_grove');
    const g = await s.call('POST', Routes.groves, a.token, { name: 'Mossy Hollow' });
    expect(g.status).toBe(201);
    expect((await s.call('GET', `${Routes.groves}?q=moss`, b.token)).body.groves).toHaveLength(1);
    expect((await s.call('POST', Routes.groveJoin(g.body.id), b.token, {})).status).toBe(200);
    const msg = await s.call('POST', Routes.groveChat, b.token, { text: 'hello friends' });
    expect(msg.status).toBe(201);
    const chat = await s.call('GET', Routes.groveChat, a.token);
    expect(chat.body.messages.map((m: { text: string }) => m.text)).toContain('hello friends');
    expect((await s.call('GET', `${Routes.groveChat}?after=${chat.body.cursor}`, a.token)).body.messages).toHaveLength(0);
    expect((await s.call('GET', Routes.groveRaid, a.token)).body.phase).toBeTruthy();
    expect((await s.call('POST', Routes.groveLeave, b.token)).status).toBe(204);
  });

  it('refuses invisible-only names and keeps native-script names intact end to end', async () => {
    const s = setup();
    const a = await s.register('\u1160\u1160');
    expect((await s.call('GET', Routes.me, a.token)).body.name).not.toMatch(/[\u1160]|Ruler/);
    expect((await s.call('PUT', Routes.me, a.token, { name: '\u0301a' })).status).toBe(400);
    expect((await s.call('POST', Routes.groves, a.token, { name: '\u1160\u1160' })).status).toBe(400);
    // 24 visible clusters, over 160 code points. Chat's limit must not truncate names.
    const name = ('क्'.repeat(4) + 'क').repeat(24);
    expect((await s.call('PUT', Routes.me, a.token, { name })).body.name).toBe(name);
    const g = await s.call('POST', Routes.groves, a.token, { name: 'قرية الظل' });
    expect(g.status).toBe(201);
    expect(g.body.name).toBe('قرية الظل');
    const chat = await s.call('GET', Routes.groveChat, a.token);
    expect(chat.body.messages[0].text).toContain('⁨قرية الظل⁩');
  });

  describe('rate and size limits (roadmap step 13)', () => {
    const MIN = 60_000;

    it('limits each player by token, answers 429 rate_limited with Retry-After, and opens again after the window', async () => {
      const s = setup({ rateLimits: { player: { limit: 3, windowMs: MIN } } });
      const a = await s.register('Ann');
      const b = await s.register('Ben');
      for (let i = 0; i < 3; i++) expect((await s.call('GET', Routes.me, a.token)).status).toBe(200);
      const no = await s.call('GET', Routes.me, a.token);
      expect(no.status).toBe(429);
      expect(no.body).toMatchObject({ error: 'rate_limited' });
      expect(no.body.message).toMatch(/Try again in 60 seconds/);
      expect(no.headers['retry-after']).toBe('60');
      expect((await s.call('GET', Routes.me, b.token)).status).toBe(200); // other players are not affected
      s.advance(MIN);
      expect((await s.call('GET', Routes.me, a.token)).status).toBe(200);
    });

    it('limits new players and all requests per IP address, and never limits health checks or preflights', async () => {
      const s = setup({ rateLimits: { register: { limit: 2, windowMs: 3_600_000 }, ip: { limit: 6, windowMs: MIN } } });
      const reg = (ip: string) => s.call('POST', Routes.players, undefined, { name: 'Pip' }, { ip });
      expect((await reg('10.0.0.1')).status).toBe(201);
      expect((await reg('10.0.0.1')).status).toBe(201);
      expect((await reg('10.0.0.1')).status).toBe(429);
      expect((await reg('10.0.0.2')).status).toBe(201);
      for (let i = 0; i < 3; i++) await s.call('GET', Routes.hello, undefined, undefined, { ip: '10.0.0.1' });
      expect((await s.call('GET', Routes.hello, undefined, undefined, { ip: '10.0.0.1' })).status).toBe(429);
      expect((await s.call('GET', '/healthz', undefined, undefined, { ip: '10.0.0.1' })).status).toBe(200);
      expect((await s.call('OPTIONS', Routes.match, undefined, undefined, { ip: '10.0.0.1' })).status).toBe(204);
    });

    it('limits battle reports on their own (each one is re-simulated)', async () => {
      const s = setup({ rateLimits: { battle: { limit: 2, windowMs: MIN } } });
      const a = await s.register('Ann');
      await s.call('PUT', Routes.base, a.token, { base: baseAt(1, 3) });
      const report = () => s.call('POST', Routes.attacks, a.token, { ticket: 'nope', seed: 1, army: {}, deployments: [] });
      expect((await report()).status).toBe(404);
      expect((await report()).status).toBe(404);
      const no = await report();
      expect(no.status).toBe(429);
      expect(no.body.message).toMatch(/battle reports/);
      expect((await s.call('GET', Routes.match, a.token)).status).toBe(200); // other routes still work
    });

    it('takes the IP address from X-Forwarded-For only when told it is behind a proxy', async () => {
      const limits = { register: { limit: 1, windowMs: 3_600_000 } };
      const via = (s: ReturnType<typeof setup>, client: string) => s.call('POST', Routes.players, undefined, { name: 'Pip' }, { ip: '10.9.9.9', headers: { 'x-forwarded-for': client } });
      const proxied = setup({ rateLimits: limits, trustProxy: true });
      expect((await via(proxied, '203.0.113.1')).status).toBe(201);
      expect((await via(proxied, '203.0.113.2')).status).toBe(201); // a different player behind the same proxy
      const direct = setup({ rateLimits: limits });
      expect((await via(direct, '203.0.113.1')).status).toBe(201);
      expect((await via(direct, '203.0.113.2')).status).toBe(429); // a forged header changes nothing
    });

    it('refuses bodies over the route size limit with 413', async () => {
      const s = setup();
      const a = await s.register('Ann');
      const big = (bytes: number) => 'x'.repeat(bytes);
      const rename = await s.call('PUT', Routes.me, a.token, { name: big(BODY_LIMITS.default) });
      expect(rename.status).toBe(413);
      expect(rename.body.error).toBe('bad_request');
      const base = baseAt(15, 1);
      expect((await s.call('PUT', Routes.base, a.token, { base })).status).toBe(204); // a real Keep 15 base fits
      expect((await s.call('PUT', Routes.base, a.token, { base, pad: big(BODY_LIMITS.base) })).status).toBe(413);
      const deployments = Array.from({ length: 2000 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 }));
      expect((await s.call('POST', Routes.attacks, a.token, { ticket: 'nope', seed: 1, army: { hedgehog_roller: 20 }, deployments })).status).toBe(404); // the largest real report fits
      expect((await s.call('POST', Routes.attacks, a.token, { ticket: 'nope', seed: 1, army: {}, deployments: [], pad: big(BODY_LIMITS.battle) })).status).toBe(413);
      expect((await s.call('POST', Routes.groveChat, a.token, { text: big(500) })).status).toBe(404); // not in an Alliance: the size is fine
    });

    it('forgets finished windows, so memory follows active callers', async () => {
      const lim = new MemoryRateLimiter();
      for (let i = 0; i < 50; i++) await lim.hit('player', `p${i}`, 0);
      expect(lim.size).toBe(50);
      await lim.hit('player', 'late', 2 * MIN);
      expect(lim.size).toBe(1);
    });
  });

  describe('account deletion over HTTP (roadmap step 14)', () => {
    const ADMIN = 'staff-secret-0123456789abcdef';

    it('DELETE /v1/me deletes the account; its token stops working', async () => {
      const s = setup();
      const a = await s.register('Ann');
      expect((await s.call('DELETE', Routes.me, a.token)).status).toBe(204);
      expect((await s.call('GET', Routes.me, a.token)).status).toBe(401);
      expect((await s.call('DELETE', Routes.me, a.token)).status).toBe(401);
      expect(s.repo.players.size).toBe(0);
    });

    it('serves the web deletion page and takes requests from it, a few per address', async () => {
      const s = setup({ rateLimits: { deletionRequest: { limit: 2, windowMs: 3_600_000 } } });
      const page = await s.app.inject({ method: 'GET', url: Routes.deletionPage });
      expect(page.statusCode).toBe(200);
      expect(page.headers['content-type']).toMatch(/text\/html/);
      expect(page.headers['content-security-policy']).toMatch(/default-src 'none'/);
      expect(page.body).toMatch(/Settings → Online play → Delete online account/);
      expect(page.body).toMatch(/v1\/account\/deletion-requests/);
      const ok = await s.call('POST', Routes.deletionRequests, undefined, { playerId: 'p-1', contact: 'me@example.com' });
      expect(ok.status).toBe(202);
      expect(ok.body.id).toBeTruthy();
      expect((await s.call('POST', Routes.deletionRequests, undefined, {})).status).toBe(400);
      expect((await s.call('POST', Routes.deletionRequests, undefined, { name: 'Ann' })).status).toBe(429);
    });

    it('has a staff API only with a strong ADMIN_TOKEN', async () => {
      expect(() => buildServer({ repo: new MemoryRepo(), data, adminToken: 'short' })).toThrow(/24 characters/);
      const none = setup();
      expect((await none.call('GET', '/admin/v1/deletion-requests', ADMIN)).status).toBe(404);
      const s = setup({ adminToken: ADMIN });
      const a = await s.register('Ann');
      const me = (await s.call('GET', Routes.me, a.token)).body;
      await s.call('POST', Routes.deletionRequests, undefined, { playerId: me.id });
      expect((await s.call('GET', '/admin/v1/deletion-requests')).status).toBe(401);
      expect((await s.call('GET', '/admin/v1/deletion-requests', a.token)).status).toBe(401);
      const queue = await s.call('GET', '/admin/v1/deletion-requests', ADMIN);
      expect(queue.status).toBe(200);
      expect(queue.body.requests).toEqual([expect.objectContaining({ playerId: me.id, status: 'open', player: expect.objectContaining({ name: 'Ann' }) })]);
      const done = await s.call('POST', `/admin/v1/deletion-requests/${queue.body.requests[0].id}`, ADMIN, { action: 'delete' });
      expect(done.body).toMatchObject({ status: 'done' });
      expect((await s.call('GET', Routes.me, a.token)).status).toBe(401);
    });
  });

  describe('reports, blocks and the moderation queue over HTTP (roadmap step 15)', () => {
    const ADMIN = 'staff-secret-0123456789abcdef';

    it('reports and blocks with the right status codes, and staff work the queue', async () => {
      const s = setup({ adminToken: ADMIN });
      const a = await s.register('Ann');
      const b = await s.register('Ben');
      const annId = (await s.call('GET', Routes.me, a.token)).body.id;
      const g = await s.call('POST', Routes.groves, a.token, { name: 'Moss' });
      await s.call('POST', Routes.groveJoin(g.body.id), b.token, {});
      const msg = (await s.call('POST', Routes.groveChat, a.token, { text: 'nasty' })).body;
      const rep = await s.call('POST', Routes.reports, b.token, { kind: 'chat', messageId: msg.id, reason: 'harassment' });
      expect(rep.status).toBe(201);
      expect(rep.body).toMatchObject({ alreadyReported: false, blocked: false });
      expect((await s.call('POST', Routes.reports, b.token, { kind: 'chat', messageId: msg.id, reason: 'what' })).status).toBe(400);
      expect((await s.call('POST', Routes.blocks, b.token, { playerId: annId })).status).toBe(204);
      expect((await s.call('GET', Routes.blocks, b.token)).body.blocked.map((x: { name: string }) => x.name)).toEqual(['Ann']);
      expect((await s.call('DELETE', Routes.block(annId), b.token)).status).toBe(204);
      expect((await s.call('GET', Routes.blocks, b.token)).body.blocked).toEqual([]);
      expect((await s.call('GET', '/admin/v1/reports', b.token)).status).toBe(401);
      const queue = await s.call('GET', '/admin/v1/reports', ADMIN);
      expect(queue.body.reports).toEqual([expect.objectContaining({ text: 'nasty', targetName: 'Ann' })]);
      const done = await s.call('POST', `/admin/v1/reports/${queue.body.reports[0].id}`, ADMIN, { action: 'mute', hours: 1 });
      expect(done.body).toMatchObject({ status: 'actioned' });
      const muted = await s.call('POST', Routes.groveChat, a.token, { text: 'hello?' });
      expect(muted.status).toBe(403);
      expect(muted.body).toMatchObject({ error: 'muted' });
      expect(muted.body.message).toMatch(/1 more hour/);
    });

    it('limits how many reports and blocks one player sends', async () => {
      const s = setup({ rateLimits: { moderation: { limit: 2, windowMs: 3_600_000 } } });
      const a = await s.register('Ann');
      const block = () => s.call('POST', Routes.blocks, a.token, { playerId: 'nobody' });
      expect((await block()).status).toBe(404);
      expect((await block()).status).toBe(404);
      expect((await block()).status).toBe(429);
    });
  });

  describe('protocol 7 (roadmap step 26)', () => {
    it('tells a game older than minProtocol to update, but still says hello', async () => {
      const s = setup();
      const a = await s.register('Ann');
      expect((await s.call('GET', Routes.hello)).body).toMatchObject({ protocol: PROTOCOL_VERSION, minProtocol: 7 });
      const old = await s.call('GET', Routes.me, a.token, undefined, { headers: { 'x-protocol': '6' } });
      expect(old.status).toBe(426);
      expect(old.body).toMatchObject({ error: 'version_mismatch' });
      expect((await s.call('GET', Routes.hello, undefined, undefined, { headers: { 'x-protocol': '6' } })).status).toBe(200);
      expect((await s.call('GET', Routes.me, a.token, undefined, { headers: { 'x-protocol': '7' } })).status).toBe(200);
      expect((await s.call('GET', Routes.me, a.token)).status).toBe(200); // no header: tools and webhooks
    });

    it('answers a repeated Idempotency-Key with the first answer, per caller', async () => {
      const s = setup();
      const a = await s.register('Ann');
      const b = await s.register('Ben');
      const first = await s.call('PUT', Routes.me, a.token, { name: 'Ann Prime' }, { headers: { 'idempotency-key': 'k-1' } });
      const again = await s.call('PUT', Routes.me, a.token, { name: 'Ann Other' }, { headers: { 'idempotency-key': 'k-1' } });
      expect(again.body).toEqual(first.body);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect((await s.call('GET', Routes.me, a.token)).body.name).toBe('Ann Prime'); // the second write never ran
      // Another player's same key is their own.
      expect((await s.call('PUT', Routes.me, b.token, { name: 'Ben Prime' }, { headers: { 'idempotency-key': 'k-1' } })).body.name).toBe('Ben Prime');
      // Refusals are not remembered: fixing the request and resending works.
      const bad = await s.call('PUT', Routes.base, a.token, { base: { buildings: [] } }, { headers: { 'idempotency-key': 'k-2' } });
      expect(bad.status).toBe(400);
      expect((await s.call('PUT', Routes.base, a.token, { base: sampleBase() }, { headers: { 'idempotency-key': 'k-2' } })).status).toBe(204);
    });
  });
});
