/**
 * Beast Mode 2026-11-21 SEC-13 (security audit 2026-11-20 L1): the Alliance size cap was counted outside the join's
 * transaction, so parallel joins could all pass it. Memory here; Postgres too with TEST_DATABASE_URL.
 */
import { describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';
import { world } from './harness';
import { repoFactories } from './pg';

for (const [label, makeRepo] of repoFactories) {
  describe(`SEC-13: size caps under a lock (${label})`, () => {
    it('ten parallel joins into an Alliance with one free seat: exactly one succeeds', async () => {
      const data = structuredClone(defaultData);
      data.social.membersMax = 3;
      const w = world({ data, repo: await makeRepo() });
      const lead = await w.player('Lead');
      const g = await lead.createGrove('Tight Clan');
      const second = await w.player('Second');
      await second.joinGrove(g.id);
      const joiners = await Promise.all(Array.from({ length: 10 }, (_, i) => w.player(`Joiner ${i}`)));
      const results = await Promise.allSettled(joiners.map((p) => p.joinGrove(g.id)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await w.repo.members(g.id)).length).toBe(3);
    });
  });
}
