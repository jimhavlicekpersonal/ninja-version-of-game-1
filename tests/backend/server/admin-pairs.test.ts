/** Beast Mode GT-17: staff see pairs of players who keep raiding each other (alternate-account feeding). */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import type { AttackRecord } from '../../../server/stores/types';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt } from './harness';

const ADMIN = 'staff-secret-0123456789abcdef';
const T = Date.UTC(2026, 3, 6, 12);

describe('GT-17: the staff pair report', () => {
  it('lists a pair raiding both ways with their raids, loot moved and honor, and logs the view', async () => {
    const repo = new MemoryRepo();
    const app = buildServer({ repo, data, now: () => T, adminToken: ADMIN });
    const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown) => {
      const r = await app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-staff-name': 'Sam' } });
      return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : r.body };
    };
    const reg = async (name: string) => {
      const r = (await call('POST', Routes.players, undefined, { name })).body as { playerId: string; token: string };
      await call('PUT', Routes.base, r.token, { base: baseAt(2, name.length) });
      return r.playerId;
    };
    const [a, b, c] = [await reg('Ann'), await reg('Bob'), await reg('Cat')];
    let n = 0;
    const raid = (from: string, to: string, loot: number) =>
      repo.addAttack({ id: `x${++n}`, at: T - n * 3_600_000, attackerId: from, attackerName: from, defenderId: to, seed: 1, army: {}, base: baseAt(2), deployments: [], result: { stars: 3, destruction: 100, hallDestroyed: true, loot: { acorns: loot, dew: loot }, used: {}, ticks: 10, endReason: 'destroyed', hash: 'h' }, attackerTrophies: 20 } as AttackRecord);
    for (let i = 0; i < 3; i++) await raid(a, b, 1000);
    for (let i = 0; i < 2; i++) await raid(b, a, 500);
    await raid(c, a, 10);
    const r = await call('GET', '/admin/v1/pairs?days=3', ADMIN);
    expect(r.status).toBe(200);
    expect(r.body.pairs[0]).toMatchObject({ raids: 5, oneWay: 3, otherWay: 2, loot: 8000, honor: 100 });
    expect([r.body.pairs[0].a.id, r.body.pairs[0].b.id].sort()).toEqual([a, b].sort());
    expect(r.body.pairs.some((p: { raids: number }) => p.raids === 1)).toBe(false);
    const actions = (await call('GET', '/admin/v1/actions', ADMIN)).body.actions as { action: string }[];
    expect(actions.map((x) => x.action)).toContain('view-pairs');
  });
});
