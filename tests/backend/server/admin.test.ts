/**
 * The admin tool (roadmap step 48): find a player, give or take resources in
 * a server-held village (with a ledger line), suspend (refused online, not
 * matched, off the leaderboards) and lift it, reset ratings; every action is
 * in the staff log, and nothing works without the staff token.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo, type Repo } from '../../../server/repo';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { deserialize } from '../../../src/gameplay/sim/save';
import { baseAt } from './harness';
import { repoFactories } from './pg';

const ADMIN = 'staff-secret-0123456789abcdef';

async function setup(repo: Repo) {
  let t = Date.UTC(2026, 3, 6, 12);
  const app = buildServer({ repo, data, now: () => t, adminToken: ADMIN });
  const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown) => {
    const r = await app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-staff-name': 'Sam' } });
    return { status: r.statusCode, body: r.body && r.headers['content-type']?.toString().includes('json') ? JSON.parse(r.body) : r.body };
  };
  const register = async (name: string) => {
    const reg = (await call('POST', Routes.players, undefined, { name })).body as { playerId: string; token: string };
    await call('PUT', Routes.base, reg.token, { base: baseAt(1, name.length) });
    return reg;
  };
  return { app, call, register, advance: (ms: number) => (t += ms) };
}

for (const [label, makeRepo] of repoFactories) {
  describe(`admin tool on ${label} storage`, () => {
    it('finds players, adjusts a server-held village, and logs who did it', async () => {
      const s = await setup(await makeRepo());
      const ann = await s.register('Annabel');
      await s.register('Anders');
      await s.register('Bob');
      expect((await s.call('GET', '/admin/v1/players?q=an')).status).toBe(401);
      expect((await s.call('GET', '/admin/v1/players?q=an', ann.token)).status).toBe(401);
      const found = await s.call('GET', '/admin/v1/players?q=AN', ADMIN);
      expect(found.body.players.map((p: { name: string }) => p.name)).toEqual(['Anders', 'Annabel']);
      expect((await s.call('GET', `/admin/v1/players?q=${ann.playerId}`, ADMIN)).body.players).toHaveLength(1);
      // A device village cannot be changed from here.
      const refused = await s.call('POST', `/admin/v1/players/${ann.playerId}/adjust`, ADMIN, { resources: { moonstones: 50 }, note: 'Lost purchase' });
      expect(refused).toMatchObject({ status: 404, body: { error: 'no_village' } });
      await s.call('POST', Routes.village, ann.token);
      const before = (await s.call('GET', `/admin/v1/players/${ann.playerId}`, ADMIN)).body.village.resources.moonstones;
      expect((await s.call('POST', `/admin/v1/players/${ann.playerId}/adjust`, ADMIN, { resources: { moonstones: 50 } })).status).toBe(400); // a note is required
      const done = await s.call('POST', `/admin/v1/players/${ann.playerId}/adjust`, ADMIN, { resources: { moonstones: 50, acorns: -1_000_000_000 }, note: 'Lost purchase' });
      expect(done.status).toBe(400); // out of range
      const ok = await s.call('POST', `/admin/v1/players/${ann.playerId}/adjust`, ADMIN, { resources: { moonstones: 50 }, note: 'Lost purchase' });
      expect(ok.status).toBe(200);
      expect(ok.body.village.resources.moonstones).toBe(before + 50);
      expect(ok.body.ledger[0]).toMatchObject({ resource: 'moonstones', delta: 50, reason: 'staff:Lost purchase' });
      const village = (await s.call('GET', Routes.village, ann.token)).body;
      expect(deserialize(village.file, data).resources.moonstones).toBe(before + 50);
      expect(ok.body.staffActions[0]).toMatchObject({ actor: 'Sam', action: 'adjust', detail: { resources: { moonstones: 50 }, note: 'Lost purchase' } });
      expect((await s.call('GET', '/admin/v1/actions', ADMIN)).body.actions).toHaveLength(1);
    });

    it('suspends a player: refused online, off the leaderboard, not matched; lifted by staff or by time', async () => {
      const s = await setup(await makeRepo());
      const ann = await s.register('Ann');
      const bob = await s.register('Bob');
      s.advance(30 * 24 * 3_600_000); // past the new-player shields
      expect((await s.call('POST', `/admin/v1/players/${bob.playerId}/ban`, ADMIN, { hours: 24 })).status).toBe(400); // a reason is required
      const banned = await s.call('POST', `/admin/v1/players/${bob.playerId}/ban`, ADMIN, { hours: 24, reason: 'Cheating' });
      expect(banned.body.player.banned).toMatchObject({ reason: 'Cheating' });
      const me = await s.call('GET', Routes.me, bob.token);
      expect(me).toMatchObject({ status: 403, body: { error: 'banned' } });
      expect(me.body.message).toMatch(/Cheating/);
      const board = await s.call('GET', `${Routes.leaderboard}?limit=10`, ann.token);
      expect(board.body.players.map((p: { name: string }) => p.name)).toEqual(['Ann']);
      const m = await s.call('GET', Routes.match, ann.token);
      expect(m.body.opponent.kind).toBe('bot'); // Bob is the only other player
      // Lifted by staff …
      await s.call('POST', `/admin/v1/players/${bob.playerId}/ban`, ADMIN, { hours: 0 });
      expect((await s.call('GET', Routes.me, bob.token)).status).toBe(200);
      // … or by time.
      await s.call('POST', `/admin/v1/players/${bob.playerId}/ban`, ADMIN, { hours: 1, reason: 'Cool down' });
      expect((await s.call('GET', Routes.me, bob.token)).status).toBe(403);
      s.advance(2 * 3_600_000);
      expect((await s.call('GET', Routes.me, bob.token)).status).toBe(200);
      expect((await s.call('GET', `${Routes.leaderboard}?limit=10`, ann.token)).body.players).toHaveLength(2);
      const log = (await s.call('GET', '/admin/v1/actions', ADMIN)).body.actions.map((a: { action: string }) => a.action);
      expect(log).toEqual(['ban', 'unban', 'ban']);
    });

    it('resets ratings and serves the admin page with a strict policy', async () => {
      const s = await setup(await makeRepo());
      const ann = await s.register('Ann');
      const r = await s.call('POST', `/admin/v1/players/${ann.playerId}/reset-rating`, ADMIN, { which: 'attack' });
      expect(r.body.player.ratings.attack).toMatchObject({ rating: data.ranks.rating.initial, battles: 0 });
      const page = await s.app.inject({ method: 'GET', url: '/admin' });
      expect(page.statusCode).toBe(200);
      expect(page.headers['content-security-policy']).toMatch(/script-src 'self'/);
      expect(page.body).not.toMatch(/<script>/); // no inline script
      expect((await s.app.inject({ method: 'GET', url: '/admin/app.js' })).statusCode).toBe(200);
      const none = buildServer({ repo: new MemoryRepo(), data });
      expect((await none.inject({ method: 'GET', url: '/admin' })).statusCode).toBe(404);
    });
  });
}
