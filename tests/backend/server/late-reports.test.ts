/**
 * Beast Mode 2026-11-21 SEC-04 (earlier G-1): nothing measured report latency, and a raid reported up to 73 hours
 * after Attack settled normally, time enough to search deployment plans with the shipped simulator. Now every
 * report's latency is observed, staff see late counts, and behind LATE_REPORT_RULE a raid held while online is a
 * forfeit. A phone offline for days still keeps its raid (R02).
 */
import { describe, expect, it } from 'vitest';
import { REPORT_GRACE_MS } from '../../../server/core/pvp';
import { PromMetrics } from '../../../server/observability';
import { baseAt, HOUR, rush, startSeed, world } from './harness';

const T = Date.UTC(2026, 3, 6, 12);
const MIN = 60_000;

async function raid(rule: boolean) {
  const metrics = new PromMetrics();
  const w = world({ start: T, shared: { policy: { lateReportRule: rule }, metrics } as never });
  const a = await w.player('Ann', baseAt(1));
  await w.player('Dot', baseAt(1, 77, 3000));
  w.pastShields();
  const m = (await a.match())!;
  const seed = await startSeed(a, m.ticket);
  return { w, a, metrics, submit: () => a.submitAttack({ ticket: m.ticket, seed, ...rush(20) }) };
}

describe('SEC-04: late battle reports', () => {
  it('a report 9 min after Attack, online all along, is a forfeit when the rule is on', async () => {
    const { w, a, submit } = await raid(true);
    for (let i = 0; i < 3; i++) {
      w.advance(3 * MIN);
      await a.me();
    }
    await expect(submit()).rejects.toMatchObject({ code: 'expired' });
    expect((await w.repo.getPlayer(a.id))!.lateReports).toBe(1);
  });

  it('the same report settles with the rule off (counted late)', async () => {
    const { w, a, submit } = await raid(false);
    for (let i = 0; i < 3; i++) {
      w.advance(3 * MIN);
      await a.me();
    }
    await expect(submit()).resolves.toMatchObject({ attackId: expect.any(String) });
    expect((await w.repo.getPlayer(a.id))!.lateReports).toBe(1);
  });

  it('a report 3 days after Attack with no request in between still settles (poor connection), rule on', async () => {
    const { w, a, submit } = await raid(true);
    w.advance(3 * 24 * HOUR);
    await expect(submit()).resolves.toMatchObject({ attackId: expect.any(String) });
    expect(a).toBeDefined();
  });

  it('a report within the grace is not late, and every report\'s latency is observed', async () => {
    const { w, a, metrics, submit } = await raid(true);
    w.advance(REPORT_GRACE_MS - MIN);
    await submit();
    expect((await w.repo.getPlayer(a.id))!.lateReports ?? 0).toBe(0);
    expect(metrics.render()).toMatch(/tk_report_latency_seconds_count\{kind="pvp"\} 1/);
    expect(metrics.value('tk_late_reports_total', { kind: 'pvp' })).toBe(0);
  });
});

describe('SAV-05: one started raid at a time', () => {
  it('a match while a started raid awaits its report (inside the grace) is refused with report_pending; after the report it is not', async () => {
    const { w, a, submit } = await raid(false);
    await w.player('Eve', baseAt(1, 91, 3000));
    w.advance(MIN);
    await expect(a.match()).rejects.toMatchObject({ code: 'conflict', parts: [expect.objectContaining({ key: 'pvp.report_pending' })] });
    await submit();
    await expect(a.match()).resolves.toBeTruthy();
  });

  it('past the grace the started raid is forfeited at the next match, as before', async () => {
    const { w, a } = await raid(false);
    w.advance(REPORT_GRACE_MS + MIN);
    await expect(a.match()).resolves.toBeTruthy();
  });
});
