/** The HTTP adapter (server/app.ts): routes, status codes, error bodies, auth and CORS. Game rules are in core.test.ts. */
import { describe, expect, it } from 'vitest';
import { buildServer, validateBase } from '../../../server/app';
import { capBaseLoot } from '../../../server/core/pvp';
import { MemoryRepo } from '../../../server/repo';
import { PROTOCOL_VERSION, Routes } from '../../../src/backend/net/protocol';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { storageLootCap, villageToBase } from '../../../src/gameplay/sim/defense';
import { createNewVillage } from '../../../src/gameplay/sim/village';
import { baseAt, rush } from './harness';

function setup() {
  let t = Date.UTC(2026, 2, 1);
  const repo = new MemoryRepo();
  const app = buildServer({ repo, data, now: () => t });
  const advance = (ms: number) => (t += ms);
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'OPTIONS', url: string, token?: string, payload?: unknown) => {
    const r = await app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
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
    expect((await s.call('PUT', Routes.me, a.token, { name: '影村の風' })).body.name).toBe('影村の風');
    expect((await s.call('PUT', Routes.me, a.token, { name: '‮محمد' })).body.name).toBe('محمد');
    const spoof = await s.call('PUT', Routes.me, a.token, { name: 'pаypal' });
    expect(spoof.status).toBe(400);
    expect(spoof.body).toMatchObject({ error: 'bad_request' });
    expect((await s.call('GET', Routes.me, a.token)).body.name).toBe('محمد');
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
    const atk = await s.call('POST', Routes.attacks, attacker.token, { ticket: m.body.ticket, seed: 5, army, deployments });
    expect(atk.status).toBe(200);
    expect(atk.body.result.hash).toBe(runBattle({ seed: 5, base: m.body.base, army, infiltration: true }, deployments, data).result.hash);
    const again = await s.call('POST', Routes.attacks, attacker.token, { ticket: m.body.ticket, seed: 5, army, deployments });
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
    expect((await s.call('GET', Routes.me, a.token)).body.name).toBe('Ruler');
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
});
