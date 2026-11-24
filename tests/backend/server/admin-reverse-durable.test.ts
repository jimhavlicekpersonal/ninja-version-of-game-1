/**
 * Security fixes 2026-11-24, SECR-02: reversing a cheater's raids gives each raid back once, whatever the staff log
 * holds since, and reaches every raid in the window. Reversed raids used to be found only in the last 200 staff
 * actions about the player (staff views are logged too), only the newest 500 raids were read, and the check ran
 * outside the transaction, so a second run (or two at once) could credit defenders twice.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import type { AttackRecord } from '../../../server/stores/types';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt } from './harness';
import { repoFactories } from './pg';

const ADMIN = 'staff-secret-0123456789abcdef';
const T = Date.UTC(2026, 3, 6, 12);

for (const [label, makeRepo] of repoFactories) {
  describe(`SECR-02 reversing raids on ${label} storage`, () => {
    const scene = async () => {
      const repo = await makeRepo();
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
      await repo.updatePlayer(cheat, { trophies: 100_000 });
      await repo.updatePlayer(a, { trophies: 500 });
      await repo.updatePlayer(b, { trophies: 500 });
      let n = 0;
      const raid = (to: string, gained: number, lost: number) =>
        repo.addAttack({ id: `x${++n}`, at: T - n * 60_000, attackerId: cheat, attackerName: 'Cheater', defenderId: to, seed: 1, army: {}, base: baseAt(2), deployments: [], result: { stars: 3, destruction: 100, hallDestroyed: true, loot: {}, used: {}, ticks: 10, endReason: 'destroyed', hash: 'h' }, attackerTrophies: gained, defenderTrophies: -lost } as unknown as AttackRecord);
      const reverse = (note = 'modified client') => call('POST', `/admin/v1/players/${cheat}/reverse-raids`, ADMIN, { days: 3, note });
      const honor = async (id: string) => (await repo.getPlayer(id))!.trophies;
      return { repo, app, call, cheat, a, b, raid, reverse, honor };
    };

    it('a raid is reversed once even after 200 more staff actions about the player', { timeout: 60_000 }, async () => {
      const { repo, cheat, a, raid, reverse, honor, app } = await scene();
      await raid(a, 30, 20);
      expect((await reverse()).body).toMatchObject({ raids: 1, returned: 20, taken: 30 });
      expect(await honor(a)).toBe(520);
      for (let i = 0; i < 200; i++) await repo.addStaffAction({ id: `s${i}`, at: T + i, actor: 'Sam', action: 'view-player', playerId: cheat, detail: {} });
      expect((await reverse('again')).body).toMatchObject({ raids: 0, returned: 0, taken: 0 });
      expect(await honor(a)).toBe(520);
      await app.close();
    });

    it('reaches every raid in the window, not only the newest 500', { timeout: 120_000 }, async () => {
      const { cheat, a, b, raid, reverse, honor, app } = await scene();
      for (let i = 0; i < 600; i++) await raid(i % 2 ? a : b, 2, 1);
      expect((await reverse()).body).toMatchObject({ raids: 600, returned: 600, taken: 1200 });
      expect(await honor(a)).toBe(800);
      expect(await honor(b)).toBe(800);
      expect(await honor(cheat)).toBe(100_000 - 1200);
      expect((await reverse('again')).body).toMatchObject({ raids: 0 });
      await app.close();
    });

    it('two reversals at once apply once', { timeout: 60_000 }, async () => {
      const { cheat, a, b, raid, reverse, honor, app } = await scene();
      for (let i = 0; i < 20; i++) await raid(i % 2 ? a : b, 5, 3);
      const [r1, r2] = await Promise.all([reverse('one'), reverse('two')]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r1.body.raids + r2.body.raids).toBe(20);
      expect(await honor(a)).toBe(530);
      expect(await honor(b)).toBe(530);
      expect(await honor(cheat)).toBe(100_000 - 100);
      await app.close();
    });
  });
}
