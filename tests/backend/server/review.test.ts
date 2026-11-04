/** The weekly review (roadmap step 54): numbers from the database, and what needs attention. */
import { describe, expect, it } from 'vitest';
import { weeklyReview } from '../../../server/core/review';
import type { ServerContext } from '../../../server/core';
import type { ReviewStats } from '../../../server/repo';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt, rush, world } from './harness';
import { repoFactories } from './pg';

for (const [label, makeRepo] of repoFactories) {
  describe(`weekly review on ${label} storage`, () => {
    it('counts players, PvP battles and desyncs, and the ledger by reason', async () => {
      const w = world({ repo: await makeRepo() });
      const dot = await w.player('Dot', baseAt(1, 77));
      const ann = await w.player('Ann', baseAt(1));
      await ann.startVillage();
      w.pastShields();
      await w.repo.updatePlayer(dot.id, { shieldUntil: 0 });
      const m = (await ann.match())!;
      expect(m.opponent.name).toBe('Dot');
      await ann.submitAttack({ ticket: m.ticket, seed: m.seed, clientHash: 'not-the-servers', ...rush(5) }).catch(() => undefined);
      const r = await w.core.admin.review(7);
      expect(r.players).toMatchObject({ total: 2, active: 2, new: 2, banned: 0 });
      expect(r.battles.total).toBeLessThanOrEqual(1);
      expect(r.battles.desyncs).toBe(r.battles.total);
      expect(r.ledger.length).toBeGreaterThan(0);
      expect(r.economy.map((e) => e.resource)).toEqual([...new Set(r.ledger.map((l) => l.resource))].sort());
      await expect(w.core.admin.review(0)).rejects.toMatchObject({ status: 400 });
    });
  });
}

describe('what needs attention', () => {
  const stats = (over: Partial<ReviewStats>): ReviewStats => ({
    players: { total: 1000, active: 600, new: 50, banned: 0 },
    battles: { total: 5000, desyncs: 10 },
    ledger: [
      { reason: 'purchase', resource: 'moonstones', delta: 10_000, lines: 40 },
      { reason: 'command:skip', resource: 'moonstones', delta: -8_000, lines: 300 },
    ],
    purchases: { count: 40, cents: 30_000, refunds: 1, refundedCents: 199 },
    ratings: { rated: 500, attackMean: 1500, attackSd: 180, medianRd: 90 },
    honor: { p50: 900, p90: 2100, p99: 3800, max: 4700 },
    ...over,
  });
  const ctx = (s: ReviewStats) => ({ now: () => Date.UTC(2026, 3, 6), data, repo: { reviewStats: async () => s } }) as unknown as ServerContext;

  it('is quiet for a healthy week', async () => {
    const r = await weeklyReview(ctx(stats({})), 7);
    expect(r.attention).toEqual([]);
    expect(r.rates).toEqual({ desync: 0.2, refund: 2.5 });
    expect(r.economy[0]).toMatchObject({ resource: 'moonstones', in: 10_000, out: 8_000, net: 2_000, biggestSource: 'purchase', biggestSink: 'command:skip' });
  });

  it('calls out desyncs, refunds, unsettled or bunched ratings and hoarded Jade', async () => {
    const r = await weeklyReview(
      ctx(
        stats({
          battles: { total: 1000, desyncs: 40 },
          purchases: { count: 40, cents: 30_000, refunds: 6, refundedCents: 1200 },
          ratings: { rated: 500, attackMean: 1500, attackSd: 30, medianRd: 300 },
          ledger: [
            { reason: 'purchase', resource: 'moonstones', delta: 10_000, lines: 40 },
            { reason: 'command:skip', resource: 'moonstones', delta: -1_000, lines: 30 },
          ],
        }),
      ),
      7,
    );
    expect(r.attention.join('\n')).toMatch(/Desync rate 4%/);
    expect(r.attention.join('\n')).toMatch(/Refund rate 15%/);
    expect(r.attention.join('\n')).toMatch(/not settling/);
    expect(r.attention.join('\n')).toMatch(/bunched/);
    expect(r.attention.join('\n')).toMatch(/Jade piles up/);
  });
});
