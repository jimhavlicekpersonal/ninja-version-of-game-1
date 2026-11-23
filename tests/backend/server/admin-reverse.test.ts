/** Beast Mode SEC-07: staff give back the honor a cheater's recorded raids took from their defenders, once. */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import type { AttackRecord } from '../../../server/stores/types';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt } from './harness';

const ADMIN = 'staff-secret-0123456789abcdef';
const T = Date.UTC(2026, 3, 6, 12);

describe('SEC-07: reversing a cheater\'s raids', () => {
  it('defenders get back what the raids took, the cheater loses what they gained, and a second run gives nothing twice', async () => {
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
    const [cheat, a, b] = [await reg('Cheater'), await reg('Ann'), await reg('Bob')];
    await repo.updatePlayer(cheat, { trophies: 900 });
    await repo.updatePlayer(a, { trophies: 480 });
    await repo.updatePlayer(b, { trophies: 300 });
    let n = 0;
    const raid = (to: string, gained: number, lost: number) =>
      repo.addAttack({ id: `x${++n}`, at: T - n * 3_600_000, attackerId: cheat, attackerName: 'Cheater', defenderId: to, seed: 1, army: {}, base: baseAt(2), deployments: [], result: { stars: 3, destruction: 100, hallDestroyed: true, loot: {}, used: {}, ticks: 10, endReason: 'destroyed', hash: 'h' }, attackerTrophies: gained, defenderTrophies: -lost } as unknown as AttackRecord);
    await raid(a, 30, 20);
    await raid(a, 25, 15);
    await raid(b, 20, 10);
    expect((await call('POST', `/admin/v1/players/${cheat}/reverse-raids`, ADMIN, { days: 3 })).status).toBe(400); // a note is required
    const r = await call('POST', `/admin/v1/players/${cheat}/reverse-raids`, ADMIN, { days: 3, note: 'modified client, ticket 7' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ raids: 3, returned: 45, taken: 75 });
    expect((await repo.getPlayer(a))!.trophies).toBe(515);
    expect((await repo.getPlayer(b))!.trophies).toBe(310);
    expect((await repo.getPlayer(cheat))!.trophies).toBe(825);
    const again = await call('POST', `/admin/v1/players/${cheat}/reverse-raids`, ADMIN, { days: 3, note: 'again' });
    expect(again.body).toMatchObject({ raids: 0, returned: 0, taken: 0 });
    expect((await repo.getPlayer(a))!.trophies).toBe(515);
  });
});
