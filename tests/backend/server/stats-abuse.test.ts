/**
 * Security fixes 2026-11-24, SECR-01: anonymous play statistics must not freeze the hourly rollup or
 * crash the staff Battles panel. One statistics id with 150,000 stored events used to take minutes to
 * summarize (a quadratic copy per event) and threw a RangeError in `battleOutcomes` (a spread past the
 * argument limit); and nothing bounded how many events one id could send in a day.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { createCore } from '../../../server/core';
import { summarizeNew } from '../../../server/core/statsLocal';
import { nodeContext } from '../../../server/nodeContext';
import { STATS_DAILY_CAP, STATS_MAX_BATCH, type StatsEvent } from '../../../src/backend/net/stats';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { repoFactories } from './pg';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const T0 = Date.UTC(2026, 10, 20, 12);
const DAY = 86_400_000;
const STAFF = 'a-very-long-staff-token-0123456789';

for (const [label, factory] of repoFactories) {
  describe(`SECR-01 statistics abuse on ${label} storage`, () => {
    it('one id with 150,000 events summarizes quickly and the Battles panel answers', async () => {
      const repo = await factory();
      const now = T0;
      const ctx = nodeContext(repo, data, () => now);
      // Stored straight through the repo (the per-id daily cap would refuse this many through postStats).
      const total = 150_000;
      const chunk = 5_000;
      for (let i = 0; i < total; i += chunk) {
        const events: StatsEvent[] = Array.from({ length: chunk }, (_, k) => {
          const n = i + k;
          return n % 3 === 0
            ? { name: 'trial_end', at: T0 - 20 * DAY + n * 1000, props: { tier: n % 7, cleared: n % 2 === 0 } }
            : n % 3 === 1
              ? { name: 'raid_end', at: T0 - 20 * DAY + n * 1000, props: { keep: (n % 5) + 1, endReason: n % 4 === 0 ? 'surrender' : 'time' } }
              : { name: 'session_start', at: T0 - 20 * DAY + n * 1000, props: {} };
        });
        await repo.addStatsEvents(ID, 't', '', events, now);
      }
      await repo.addStatsEvents(ID2, 't', '', [{ name: 'trial_end', at: T0, props: { tier: 1, cleared: true } }], now);
      const started = Date.now();
      expect(await summarizeNew(ctx)).toMatchObject({ installs: 2 });
      expect(Date.now() - started).toBeLessThan(2_000);

      const app = buildServer({ repo, data, now: () => now, adminTokens: { ops: STAFF } });
      const r = await app.inject({ method: 'GET', url: '/admin/v1/stats/battles?days=30', headers: { authorization: `Bearer ${STAFF}` } });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.installs).toBe(2);
      const attempts = body.tiers.reduce((s: number, t: { attempts: number }) => s + t.attempts, 0);
      expect(attempts).toBe(total / 3 + 1);
      const raids = body.keeps.reduce((s: number, k: { raids: number }) => s + k.raids, 0);
      expect(raids).toBe(total / 3);
      // Same numbers as the pure function over the same events (tier 1 has the extra clear from ID2).
      const tier1 = body.tiers.find((t: { tier: number }) => t.tier === 1);
      let a1 = 1;
      let c1 = 1;
      for (let n = 0; n < total; n += 3)
        if (n % 7 === 1) {
          a1++;
          if (n % 2 === 0) c1++;
        }
      expect(tier1).toMatchObject({ attempts: a1, clears: c1 });
      await app.close();
    }, 120_000);

    it(`keeps at most STATS_DAILY_CAP events per statistics id per UTC day`, async () => {
      const repo = await factory();
      let now = T0;
      const core = createCore(nodeContext(repo, data, () => now));
      const batch = (n: number) => ({ install: ID, build: 't', events: Array.from({ length: n }, () => ({ name: 'session_start', at: now, props: {} })) });
      let accepted = 0;
      for (let sent = 0; sent < STATS_DAILY_CAP; sent += STATS_MAX_BATCH) accepted += (await core.postStats(batch(Math.min(STATS_MAX_BATCH, STATS_DAILY_CAP - sent)))).accepted;
      expect(accepted).toBe(STATS_DAILY_CAP);
      // Over the cap: answered (so the game drops them), nothing more is stored.
      expect((await core.postStats(batch(STATS_MAX_BATCH))).accepted).toBe(0);
      // Another id is not affected.
      expect((await core.postStats({ ...batch(5), install: ID2 })).accepted).toBe(5);
      // The next UTC day the id may send again.
      now = T0 + DAY;
      expect((await core.postStats(batch(10))).accepted).toBe(10);
      // A batch that crosses the cap keeps only the part under it.
      for (let sent = 10; sent < STATS_DAILY_CAP - 50; sent += STATS_MAX_BATCH) await core.postStats(batch(Math.min(STATS_MAX_BATCH, STATS_DAILY_CAP - 50 - sent)));
      expect((await core.postStats(batch(STATS_MAX_BATCH))).accepted).toBe(50);
      const stored = (await repo.statsEventsOf([ID])).length;
      expect(stored).toBe(2 * STATS_DAILY_CAP);
      // Forgetting the id forgets its quota rows too (nothing kept per id after the player said no).
      await core.deleteStats(ID);
      expect((await core.postStats(batch(10))).accepted).toBe(10);
    }, 60_000);
  });
}
