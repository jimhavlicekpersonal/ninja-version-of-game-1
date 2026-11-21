/**
 * Beast Mode 2026-11-21 SEC-14: deletion left the player's name in the bases of open tickets on them (and in
 * tickets.defender_name) and their id in Gang War strike and relay rows. Memory here; Postgres with TEST_DATABASE_URL.
 */
import { describe, expect, it } from 'vitest';
import { DELETED_PLAYER } from '../../../server/repo';
import { baseAt, world } from './harness';
import { repoFactories } from './pg';

for (const [label, makeRepo] of repoFactories) {
  describe(`SEC-14: deletion clears shared rows (${label})`, () => {
    it('an open ticket on a deleted defender keeps the base under the deleted name; Gang War rows lose the id', async () => {
      const w = world({ repo: await makeRepo() });
      const a = await w.player('Attacker Ann', baseAt(1));
      const d = await w.player('Defender Dee', baseAt(1, 77, 3000));
      const deeName = (await w.repo.getPlayer(d.id))!.name;
      w.pastShields();
      const m = (await a.match())!;
      await w.repo.addWarAttack({ id: 'wa1', warId: 'war1', side: 'a', attackerId: d.id, target: 0, relay: true, stars: 1, destruction: 40, at: w.now() });
      await w.repo.putRelay({ warId: 'war1', side: 'b', target: 0, damage: {}, stars: 1, destruction: 40, strikes: 1, lastBy: d.id, holder: d.id, holdUntil: w.now() + 1000 });
      expect((await w.repo.getTicket(m.ticket))!.defenderId).toBe(d.id);
      await w.repo.deletePlayer(d.id, deeName, w.now());
      const t = (await w.repo.getTicket(m.ticket))!;
      expect(t.defenderId).toBeNull();
      expect(t.defenderName).toBe(DELETED_PLAYER.name);
      expect(JSON.stringify(t.base)).not.toContain(deeName);
      expect(t.base.buildings.length).toBeGreaterThan(0);
      expect((await w.repo.warAttacks('war1')).map((x) => x.attackerId)).toEqual([DELETED_PLAYER.id]);
      const relay = (await w.repo.getRelay('war1', 'b', 0))!;
      expect([relay.lastBy, relay.holder]).toEqual([DELETED_PLAYER.id, null]);
    });
  });
}
