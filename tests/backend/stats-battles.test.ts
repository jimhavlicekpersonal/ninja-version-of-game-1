/** Beast Mode 2026-11-21 OPS-06: statistics carry how battles end, Shadow Trials, and a schema version. */
import { describe, expect, it } from 'vitest';
import { battleOutcomesOf } from '../../server/core/statsLocal';
import { cleanStatsBatch, cleanStatsEvent, STATS_EVENTS } from '../../src/backend/net/stats';

describe('OPS-06: battle statistics', () => {
  it('raid_end keeps endReason, ticks and keep', () => {
    expect(cleanStatsEvent({ name: 'raid_end', at: 1, props: { kind: 'attack', stars: 2, destruction: 61, endReason: 'surrender', ticks: 900, keep: 7, loot: { acorns: 5 } } })).toEqual({ name: 'raid_end', at: 1, props: { kind: 'attack', stars: 2, destruction: 61, endReason: 'surrender', ticks: 900, keep: 7 } });
  });

  it('trial_end keeps tier and cleared and drops any other field', () => {
    expect(cleanStatsEvent({ name: 'trial_end', at: 1, props: { tier: 12, cleared: true, stars: 3, destruction: 100, endReason: 'destroyed', reward: { moonstones: 5 }, name: 'Ann' } })!.props).toEqual({ tier: 12, cleared: true, stars: 3, destruction: 100, endReason: 'destroyed' });
  });

  it('no field can hold free text: ids are short slugs', () => {
    expect(cleanStatsEvent({ name: 'raid_end', at: 1, props: { endReason: 'hello there, my name is Ann' } })!.props.endReason).toBeUndefined();
    for (const fields of Object.values(STATS_EVENTS)) for (const kind of Object.values(fields)) expect(['number', 'boolean', 'id']).toContain(kind);
  });

  it('a batch keeps its schema field out of the stored events, and old batches without one still pass', () => {
    const b = cleanStatsBatch({ install: '0b9a6f1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b', build: '0.1.0+web', schema: 2, events: [{ name: 'trial_end', at: 1, props: { tier: 1, cleared: false } }] });
    expect('error' in b).toBe(false);
    expect('error' in cleanStatsBatch({ install: '0b9a6f1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b', build: '0.1.0+web', events: [{ name: 'session_start', at: 1, props: {} }] })).toBe(false);
  });

  it('the staff report gives per-tier clear rates and per-Keep surrender shares', () => {
    const ev = (name: string, props: Record<string, number | boolean | string>) => ({ name, at: 1, props }) as never;
    const r = battleOutcomesOf([ev('trial_end', { tier: 3, cleared: true }), ev('trial_end', { tier: 3, cleared: false }), ev('raid_end', { keep: 5, endReason: 'surrender' }), ev('raid_end', { keep: 5, endReason: 'time' }), ev('raid_end', { keep: 5, endReason: 'destroyed' }), ev('raid_end', { keep: 5, endReason: 'time' })]);
    expect(r.tiers).toEqual([{ tier: 3, attempts: 2, clears: 1, clearRate: 0.5 }]);
    expect(r.keeps).toEqual([{ keep: 5, raids: 4, surrenders: 1, surrenderShare: 0.25, scoutLeaves: 0 }]);
  });

  it('the staff report counts scouted bases left unplayed per Keep and lost graphics', () => {
    const ev = (name: string, props: Record<string, number | boolean | string>) => ({ name, at: 1, props }) as never;
    const r = battleOutcomesOf([ev('scout_leave', { keep: 6, nexts: 2 }), ev('scout_leave', { keep: 6, nexts: 0 }), ev('raid_end', { keep: 6, endReason: 'time' }), ev('webgl_lost', { stuck: false }), ev('webgl_lost', { stuck: true })]);
    expect(r.keeps).toEqual([{ keep: 6, raids: 1, surrenders: 0, surrenderShare: 0, scoutLeaves: 2 }]);
    expect(r.graphicsLost).toEqual({ lost: 1, stuck: 1 });
  });
});
