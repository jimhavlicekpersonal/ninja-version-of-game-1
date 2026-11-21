/** Beast Mode 2026-11-21 SEC-07: staff can see and kill every session, reset honor, find top gainers; every look is logged. */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import type { Repo } from '../../../server/repo';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt } from './harness';
import { repoFactories } from './pg';

const ADMIN = 'staff-secret-0123456789abcdef';

async function setup(repo: Repo) {
  const t = Date.UTC(2026, 3, 6, 12);
  const app = buildServer({ repo, data, now: () => t, adminToken: ADMIN });
  const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown) => {
    const r = await app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-staff-name': 'Sam' } });
    return { status: r.statusCode, body: r.body && r.headers['content-type']?.toString().includes('json') ? JSON.parse(r.body) : r.body };
  };
  const reg = (await call('POST', Routes.players, undefined, { name: 'Taken Over' })).body as { playerId: string; token: string };
  await call('PUT', Routes.base, reg.token, { base: baseAt(1, 3) });
  return { call, reg, repo };
}

for (const [label, makeRepo] of repoFactories) {
  describe(`SEC-07 staff tools (${label})`, () => {
    it('revoke-sessions makes the old token 401 and writes a staff action; sessions never show a hash', async () => {
      const { call, reg } = await setup(await makeRepo());
      expect((await call('GET', Routes.me, reg.token)).status).toBe(200);
      const sess = await call('GET', `/admin/v1/players/${reg.playerId}/sessions`, ADMIN);
      expect(sess.status).toBe(200);
      expect(JSON.stringify(sess.body)).not.toMatch(/[0-9a-f]{40,}/);
      expect((await call('POST', `/admin/v1/players/${reg.playerId}/revoke-sessions`, ADMIN, {})).status).toBe(400);
      expect((await call('POST', `/admin/v1/players/${reg.playerId}/revoke-sessions`, ADMIN, { note: 'account taken over, ticket 42' })).status).toBe(200);
      expect((await call('GET', Routes.me, reg.token)).status).toBe(401);
      const actions = (await call('GET', '/admin/v1/actions', ADMIN)).body.actions as { action: string }[];
      expect(actions.map((a) => a.action)).toContain('revoke-sessions');
    });

    it('reset-honor moves the board, only downwards; a view and the suspects view are logged', async () => {
      const { call, reg, repo } = await setup(await makeRepo());
      await repo.updatePlayer(reg.playerId, { trophies: 900 });
      expect((await call('POST', `/admin/v1/players/${reg.playerId}/reset-honor`, ADMIN, { to: 1000, note: 'x' })).status).toBe(400);
      expect((await call('POST', `/admin/v1/players/${reg.playerId}/reset-honor`, ADMIN, { to: 100, note: 'win trading' })).body).toEqual({ honor: 100 });
      const board = (await call('GET', `${Routes.leaderboard}?limit=10`, reg.token)).body;
      expect(board.players[0].trophies).toBe(100);
      await call('GET', `/admin/v1/players/${reg.playerId}`, ADMIN);
      await call('GET', `/admin/v1/players/${reg.playerId}`, ADMIN);
      expect((await call('GET', '/admin/v1/suspects?days=3', ADMIN)).status).toBe(200);
      const actions = (await call('GET', '/admin/v1/actions', ADMIN)).body.actions as { action: string }[];
      expect(actions.filter((a) => a.action === 'view')).toHaveLength(1);
      expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['reset-honor', 'view-suspects']));
    });
  });
}
