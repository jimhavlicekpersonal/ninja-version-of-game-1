import { describe, expect, it } from 'vitest';
import { buildServer, validateBase } from '../../server/app';
import { MemoryRepo } from '../../server/repo';
import { runBattle } from '../../src/sim/battle/battle';
import { generateOpponent } from '../../src/sim/battle/basegen';
import { defaultData as data } from '../../src/sim/data';
import { villageToBase } from '../../src/sim/defense';
import { createNewVillage } from '../../src/sim/village';

function setup() {
  let t = Date.UTC(2026, 2, 1);
  const repo = new MemoryRepo();
  const app = buildServer({ repo, data, now: () => t });
  const advance = (ms: number) => (t += ms);
  const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown) => {
    const r = await app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: r.statusCode, body: r.body ? JSON.parse(r.body || 'null') : null };
  };
  const register = async (name: string) => (await call('POST', '/v1/players', undefined, { name })).body as { playerId: string; token: string };
  return { app, repo, call, register, advance, now: () => t };
}

const sampleBase = () => {
  const v = createNewVillage(Date.UTC(2026, 0, 1), data);
  return villageToBase({ ...v, buildings: v.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle') }, Date.UTC(2026, 0, 1), data);
};

describe('PvP server', () => {
  it('rejects impossible bases', () => {
    expect(validateBase(sampleBase(), data)).toBeNull();
    const overlap = sampleBase();
    overlap.buildings[1] = { ...overlap.buildings[1], x: overlap.buildings[0].x, y: overlap.buildings[0].y };
    expect(validateBase(overlap, data)).toMatch(/overlap/);
    const greedy = sampleBase();
    greedy.buildings[0].loot = { acorns: 99_999_999 };
    expect(validateBase(greedy, data)).toMatch(/loot/);
    expect(validateBase({ name: 'x', hallLevel: 1, buildings: [] }, data)).toBeTruthy();
  });

  it('registers players, stores bases and needs a token', async () => {
    const s = setup();
    const a = await s.register('Pip');
    expect(a.token).toBeTruthy();
    expect((await s.call('GET', '/v1/me')).status).toBe(401);
    expect((await s.call('GET', '/v1/me', a.token)).body.name).toBe('Pip');
    expect((await s.call('PUT', '/v1/base', a.token, { base: sampleBase() })).status).toBe(204);
  });

  it('matches against real players, re-simulates attacks and updates trophies and shields', async () => {
    const s = setup();
    const attacker = await s.register('Attacker');
    const defender = await s.register('Defender');
    const base = generateOpponent(77, 1, data);
    for (const b of base.buildings) b.loot = { acorns: 10 };
    await s.call('PUT', '/v1/base', defender.token, { base });
    // New players are shielded at first.
    expect((await s.call('GET', '/v1/match', attacker.token)).status).toBe(404);
    s.advance(25 * 3_600_000);
    const m = await s.call('GET', '/v1/match', attacker.token);
    expect(m.status).toBe(200);
    const army = { hedgehog_roller: 20 };
    const deployments = Array.from({ length: 20 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + i }));
    const atk = await s.call('POST', '/v1/attacks', attacker.token, { ticket: m.body.ticket, seed: 5, army, deployments });
    expect(atk.status).toBe(200);
    const local = runBattle({ seed: 5, base: m.body.base, army }, deployments, data).result;
    expect(atk.body.result.hash).toBe(local.hash);
    // A ticket can only be used once.
    expect((await s.call('POST', '/v1/attacks', attacker.token, { ticket: m.body.ticket, seed: 5, army, deployments })).status).toBe(409);
    const me = (await s.call('GET', '/v1/me', attacker.token)).body;
    expect(me.trophies).toBe(Math.max(0, atk.body.trophies));
    const defs = await s.call('GET', '/v1/defenses?since=0', defender.token);
    expect(defs.body.defenses).toHaveLength(1);
    expect(defs.body.defenses[0].attackerName).toBe('Attacker');
    const d = await s.repo.getPlayer(defender.playerId);
    if (local.destruction >= 30) expect(d!.shieldUntil).toBeGreaterThan(s.now());
  });

  it('refuses armies too big for the attacker', async () => {
    const s = setup();
    const a = await s.register('A');
    const b = await s.register('B');
    await s.call('PUT', '/v1/base', b.token, { base: generateOpponent(3, 1, data) });
    s.advance(25 * 3_600_000);
    const m = await s.call('GET', '/v1/match', a.token);
    const r = await s.call('POST', '/v1/attacks', a.token, { ticket: m.body.ticket, seed: 1, army: { beetle_brute: 500 }, deployments: [] });
    expect(r.status).toBe(400);
  });

  it('refuses troop levels above what the attacker’s hall allows', async () => {
    const s = setup();
    const a = await s.register('A');
    const b = await s.register('B');
    await s.call('PUT', '/v1/base', b.token, { base: generateOpponent(3, 1, data) });
    s.advance(25 * 3_600_000);
    const m = await s.call('GET', '/v1/match', a.token);
    // A new player is hall 1: troop level 2 is not possible yet.
    const bad = await s.call('POST', '/v1/attacks', a.token, { ticket: m.body.ticket, seed: 1, army: { hedgehog_roller: 10 }, levels: { hedgehog_roller: 2 }, deployments: [] });
    expect(bad.status).toBe(400);
    const ok = await s.call('POST', '/v1/attacks', a.token, { ticket: m.body.ticket, seed: 1, army: { hedgehog_roller: 10 }, levels: { hedgehog_roller: 1 }, deployments: [] });
    expect(ok.status).toBe(200);
  });
});
