/**
 * Report section 5 step 5 (docs/audit/STATE_OF_THE_GAME.md), "Measure": a consented, pseudonymous
 * statistics export, the daily D1/D7/D30 and funnel table, and experiment arms on balance bundles.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { createCore } from '../../../server/core';
import { cohortRows, DAY_MS, rollupStats, STATS_RETENTION_DAYS } from '../../../server/core/stats';
import { nodeContext } from '../../../server/nodeContext';
import { MemoryRepo } from '../../../server/repo';
import { StatsSharing, type StatsTransport } from '../../../src/backend/analytics/share';
import { Analytics, MemoryEventStore, type AnalyticsEvent } from '../../../src/backend/analytics/events';
import type { KeyValue } from '../../../src/backend/net/connection';
import { Routes } from '../../../src/backend/net/protocol';
import { cleanStatsBatch, cleanStatsEvent, cohortBucket, STATS_EVENTS, type StatsBatch } from '../../../src/backend/net/stats';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { repoFactories } from './pg';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const T0 = Date.UTC(2026, 10, 1, 12);

const kv = (): KeyValue & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
};

describe('only the listed events and fields can be shared', () => {
  it('drops names, transaction ids, free text and unknown events', () => {
    const e = cleanStatsEvent({ name: 'purchase', at: T0, props: { productId: 'jade_pouch', usd: 4.99, kind: 'moonstones', transactionId: 'apple:2000000123', provider: 'storekit', name: 'Hanzo' } });
    expect(e).toEqual({ name: 'purchase', at: T0, props: { productId: 'jade_pouch', usd: 4.99, kind: 'moonstones' } });
    expect(cleanStatsEvent({ name: 'save_export', at: T0, props: { length: 9 } })).toBeNull();
    expect(cleanStatsEvent({ name: 'donation', at: T0, props: {} })).toBeNull();
    // An id field holding free text is dropped, not shortened.
    expect(cleanStatsEvent({ name: 'raid_end', at: T0, props: { kind: 'hello there, my name is Hanzo', stars: 2 } })?.props).toEqual({ stars: 2 });
    // No event lists a field that could hold a name or a message.
    for (const fields of Object.values(STATS_EVENTS)) for (const k of Object.keys(fields)) expect(k).not.toMatch(/name|text|chat|player|village|transaction|email/i);
  });

  it('refuses a batch without a random statistics id, or with too many events', () => {
    expect(cleanStatsBatch({ install: 'player-123', events: [{ name: 'session_start', at: T0 }] })).toEqual({ error: 'bad statistics id' });
    expect(cleanStatsBatch({ install: ID, events: [] })).toHaveProperty('error');
    expect(cleanStatsBatch({ install: ID, events: Array.from({ length: 201 }, () => ({ name: 'session_start', at: T0 })) })).toHaveProperty('error');
    expect(cleanStatsBatch({ install: ID.toUpperCase(), build: 'x'.repeat(99), arm: 'bad arm!', events: [{ name: 'session_start', at: T0, props: { isNew: true } }] })).toEqual({
      install: ID,
      build: 'x'.repeat(40),
      events: [{ name: 'session_start', at: T0, props: { isNew: true } }],
    });
  });

  it('buckets an id the same way everywhere, independently per experiment', () => {
    expect(cohortBucket('offer-timing-1', ID)).toBe(cohortBucket('offer-timing-1', ID));
    const ids = Array.from({ length: 2000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const low = ids.filter((id) => cohortBucket('e1', id) < 50).length;
    expect(low).toBeGreaterThan(900);
    expect(low).toBeLessThan(1100);
    const both = ids.filter((id) => cohortBucket('e1', id) < 50 && cohortBucket('e2', id) < 50).length;
    expect(both).toBeGreaterThan(400);
    expect(both).toBeLessThan(600);
  });
});

describe('the server keeps statistics without a token, an id or an IP address', () => {
  it('accepts a batch with no token, forgets an id, and lists stats in hello', async () => {
    const repo = new MemoryRepo();
    const app = buildServer({ repo, data, now: () => T0 });
    expect((await app.inject({ method: 'GET', url: Routes.hello })).json().features).toContain('stats');
    const batch: StatsBatch = { install: ID, build: '0.1.0+web', events: [{ name: 'session_start', at: T0, props: { isNew: true } }, { name: 'tutorial_step', at: T0 + 1, props: { step: 1, done: false } }] };
    const r = await app.inject({ method: 'POST', url: Routes.stats, payload: { ...batch, events: [...batch.events, { name: 'save_import', at: T0, props: {} }] } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ accepted: 2 });
    expect(repo.statsRows).toHaveLength(2);
    // Nothing about the caller is stored: no IP address, no player, no token.
    expect(JSON.stringify(repo.statsRows)).not.toMatch(/127\.0\.0\.1|ip|token|player/i);
    expect(Object.keys(repo.statsRows[0]).sort()).toEqual(['arm', 'at', 'build', 'day', 'install', 'name', 'props', 'receivedAt']);
    expect((await app.inject({ method: 'POST', url: Routes.stats, payload: { install: 'nope', events: batch.events } })).statusCode).toBe(400);
    const del = await app.inject({ method: 'DELETE', url: `${Routes.stats}?install=${ID}` });
    expect(del.json()).toEqual({ deleted: 2 });
    expect(repo.statsRows).toHaveLength(0);
  });

  it('puts events from a wrong phone clock at their arrival time, and rate-limits per IP address', async () => {
    const repo = new MemoryRepo();
    const app = buildServer({ repo, data, now: () => T0, rateLimits: { stats: { limit: 2, windowMs: 60_000 } } });
    const send = () => app.inject({ method: 'POST', url: Routes.stats, payload: { install: ID, events: [{ name: 'session_start', at: T0 - 5 * 365 * DAY_MS, props: {} }] } });
    expect((await send()).statusCode).toBe(200);
    expect(repo.statsRows[0].at).toBe(T0);
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(429);
  });

  it('prunes raw events after the retention period', async () => {
    const repo = new MemoryRepo();
    let now = T0;
    const core = createCore(nodeContext(repo, data, () => now));
    await core.postStats({ install: ID, events: [{ name: 'session_start', at: T0, props: {} }] });
    now = T0 + (STATS_RETENTION_DAYS - 1) * DAY_MS;
    expect((await core.prune()).stats).toBe(0);
    now = T0 + (STATS_RETENTION_DAYS + 1) * DAY_MS;
    expect((await core.prune()).stats).toBe(1);
  });
});

describe('the daily table: D1/D7/D30 and the funnel, per arm', () => {
  it('counts returns on day 1, 7 and 30, tutorial, first raid and first purchase within 7 days', () => {
    const day = Math.floor(T0 / DAY_MS);
    const rows = cohortRows(
      [
        { install: 'a', arm: '', firstDay: day, firstAt: T0, days: [day, day + 1, day + 7, day + 30], tutorialDone: true, firstRaidAt: T0 + DAY_MS, firstPurchaseAt: T0 + 2 * DAY_MS },
        { install: 'b', arm: '', firstDay: day, firstAt: T0, days: [day, day + 2], tutorialDone: false, firstRaidAt: T0 + 9 * DAY_MS, firstPurchaseAt: null },
        { install: 'c', arm: 'offer-timing-1:short', firstDay: day, firstAt: T0, days: [day, day + 1], tutorialDone: true, firstRaidAt: null, firstPurchaseAt: null },
      ],
      T0,
    );
    expect(rows).toEqual([
      { day, arm: '', installs: 2, d1: 1, d7: 1, d30: 1, tutorialDone: 1, raided7: 1, payers7: 1, computedAt: T0 },
      { day, arm: 'offer-timing-1:short', installs: 1, d1: 1, d7: 0, d30: 0, tutorialDone: 1, raided7: 0, payers7: 0, computedAt: T0 },
    ]);
  });

  for (const [name, factory] of repoFactories) {
    it(`builds the table from shared events and shows it to staff (${name})`, async () => {
      const repo = await factory();
      let now = T0;
      const ctx = nodeContext(repo, data, () => now);
      const core = createCore(ctx);
      const ev = (n: string, at: number, props: Record<string, unknown> = {}) => ({ name: n, at, props });
      // Two installs on day 0; one comes back on day 1 and day 7, finishes the tutorial, raids and pays.
      now = T0;
      await core.postStats({ install: ID, events: [ev('session_start', T0, { isNew: true }), ev('tutorial_step', T0 + 60_000, { step: 9, done: true })] });
      await core.postStats({ install: ID2, arm: 'offer-timing-1:short', events: [ev('session_start', T0, { isNew: true })] });
      now = T0 + DAY_MS;
      await core.postStats({ install: ID, events: [ev('session_start', now), ev('raid_end', now + 1, { kind: 'pvp', stars: 2, destruction: 64 }), ev('purchase', now + 2, { productId: 'jade_pouch', usd: 4.99, kind: 'moonstones' })] });
      now = T0 + 7 * DAY_MS;
      await core.postStats({ install: ID, events: [ev('session_start', now)] });
      now = T0 + 9 * DAY_MS;
      expect((await rollupStats(ctx)).rows).toBe(2);
      // Running it again changes nothing (rebuilt, not added to).
      await rollupStats(ctx);
      const app = buildServer({ repo, data, now: () => now, adminTokens: { ops: 'a-very-long-staff-token-0123456789' } });
      expect((await app.inject({ method: 'GET', url: '/admin/v1/stats' })).statusCode).toBe(401);
      const report = (await app.inject({ method: 'GET', url: '/admin/v1/stats?days=30', headers: { authorization: 'Bearer a-very-long-staff-token-0123456789' } })).json();
      expect(report.rows).toHaveLength(2);
      const main = report.rows.find((r: { arm: string }) => r.arm === '');
      expect(main).toMatchObject({ date: '2026-11-01', installs: 1, d1: 1, d7: 1, d30: 0, tutorialDone: 1, raided7: 1, payers7: 1, d1Rate: 1, d7Rate: 1, d30Rate: null });
      expect(report.rows.find((r: { arm: string }) => r.arm === 'offer-timing-1:short')).toMatchObject({ installs: 1, d1: 0, d1Rate: 0, tutorialRate: 0 });
      // Turning sharing off deletes the id's events; the next rollup no longer counts it.
      await core.deleteStats(ID);
      await rollupStats(ctx);
      const after = (await app.inject({ method: 'GET', url: '/admin/v1/stats?days=30', headers: { authorization: 'Bearer a-very-long-staff-token-0123456789' } })).json();
      expect(after.rows.map((r: { arm: string }) => r.arm)).toEqual(['offer-timing-1:short']);
    });
  }
});

describe('the game shares only after an adult says yes', () => {
  const setup = (band: string | null = 'adult') => {
    const store = new MemoryEventStore();
    let t = T0;
    const analytics = new Analytics(store, { now: () => t++ });
    const sent: StatsBatch[] = [];
    const forgot: string[] = [];
    let down = false;
    const transport: StatsTransport = {
      send: async (b) => {
        if (down) throw new Error('offline');
        sent.push(structuredClone(b));
      },
      forget: async (id) => {
        if (down) throw new Error('offline');
        forgot.push(id);
      },
    };
    const age = { band };
    const kvs = kv();
    let n = 0;
    const share = new StatsSharing({ kv: kvs, transport, build: '0.1.0+web', ageBand: () => age.band, arm: () => 'offer-timing-1:short', backlog: (l) => analytics.recent(l), newId: () => [ID, ID2][n++] });
    analytics.onLog((e: AnalyticsEvent) => share.hear(e));
    return { analytics, share, sent, forgot, kvs, age, setDown: (v: boolean) => (down = v) };
  };

  it('never asks or sends for under-18 or unknown age', async () => {
    for (const band of ['13to17', 'under13', null]) {
      const s = setup(band);
      expect(s.share.shouldAsk).toBe(false);
      await s.share.set(true);
      s.analytics.log('session_start', { isNew: true });
      await s.share.flush();
      expect(s.sent).toEqual([]);
      expect(s.share.choice).toBe('unasked');
    }
  });

  it('sends nothing before the yes, then the backlog and new events under a random id', async () => {
    const s = setup();
    expect(s.share.shouldAsk).toBe(true);
    s.analytics.log('session_start', { isNew: true, awayMs: 0, platform: 'web', standalone: false });
    s.analytics.log('tutorial_step', { step: 0, id: 'build_mint', done: false });
    s.analytics.log('save_export', { length: 400 });
    await s.share.flush();
    expect(s.sent).toEqual([]);
    await s.share.set(true);
    s.analytics.log('purchase', { productId: 'jade_pouch', usd: 4.99, kind: 'moonstones', transactionId: 'apple:1', provider: 'storekit' });
    await s.share.flush();
    const events = s.sent.flatMap((b) => b.events);
    expect(s.sent[0]).toMatchObject({ install: ID, build: '0.1.0+web', arm: 'offer-timing-1:short' });
    expect(events.map((e) => e.name)).toEqual(['session_start', 'tutorial_step', 'purchase']);
    expect(events[0].props).toEqual({ isNew: true, platform: 'web' });
    expect(JSON.stringify(s.sent)).not.toMatch(/apple:1|storekit|build_mint/);
    expect(StatsSharing.installIdIn(s.kvs)).toBe(ID);
  });

  it('keeps events while offline, and turning it off deletes what was sent (retried) and starts a new id next time', async () => {
    const s = setup();
    await s.share.set(true);
    s.setDown(true);
    s.analytics.log('session_start', {});
    await s.share.flush();
    expect(s.share.pending).toBe(1);
    await s.share.set(false);
    expect(s.forgot).toEqual([]);
    expect(StatsSharing.installIdIn(s.kvs)).toBeNull();
    s.setDown(false);
    s.analytics.log('session_start', {});
    await s.share.flush();
    expect(s.forgot).toEqual([ID]);
    expect(s.sent).toEqual([]);
    await s.share.set(true);
    expect(StatsSharing.installIdIn(s.kvs)).toBe(ID2);
  });

  it('stops and deletes when the village turns out to be under 18', async () => {
    const s = setup();
    await s.share.set(true);
    s.analytics.log('session_start', {});
    await s.share.flush();
    s.age.band = '13to17';
    s.analytics.log('session_start', {});
    await s.share.flush();
    expect(s.share.choice).toBe('off');
    expect(s.forgot).toEqual([ID]);
    expect(s.sent.flatMap((b) => b.events)).toHaveLength(1);
  });
});
