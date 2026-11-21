/** Beast Mode 2026-11-21 SEC-15: registrations were limited per IPv6 /64 only, so one /48 held 65,536 buckets. */
import { describe, expect, it } from 'vitest';
import { ipKey48 } from '../../../server/rateLimit';
import { Routes } from '../../../src/backend/net/protocol';
import { setup } from './httpHarness';

describe('SEC-15: registrations per IPv6 /48', () => {
  it('registrations from many /64s inside one /48 hit the wide rule', async () => {
    const s = setup({ rateLimits: { registerWide: { limit: 40, windowMs: 3_600_000 }, ip: { limit: 1_000_000, windowMs: 60_000 } } });
    const statuses: number[] = [];
    for (let i = 0; i < 50; i++) statuses.push((await s.call('POST', Routes.players, undefined, { name: `Wide ${i}` }, { ip: `2001:db8:1:${i.toString(16)}::1` })).status);
    expect(statuses.filter((x) => x === 201)).toHaveLength(40);
    expect(statuses.filter((x) => x === 429)).toHaveLength(10);
    // Another /48 is not affected.
    expect((await s.call('POST', Routes.players, undefined, { name: 'Other site' }, { ip: '2001:db8:2::1' })).status).toBe(201);
    // IPv4 keeps only the per-address rule.
    expect((await s.call('POST', Routes.players, undefined, { name: 'Four' }, { ip: '203.0.113.9' })).status).toBe(201);
  });

  it('ipKey48 keeps the first three groups', () => {
    expect(ipKey48('2001:db8:1:ff::1')).toBe('2001:db8:1::/48');
    expect(ipKey48('203.0.113.9')).toBe('203.0.113.9');
  });
});
