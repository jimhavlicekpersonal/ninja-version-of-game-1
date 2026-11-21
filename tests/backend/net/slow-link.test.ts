/** Beast Mode 2026-11-21 SAV-06: one 15 s timeout for every body, and battle commands batched with everything else. */
import { describe, expect, it } from 'vitest';
import { deadlineFor } from '../../../src/backend/net/httpAdapter';
import { nextBatch } from '../../../src/backend/net/villageSync';

describe('SAV-06: slow links', () => {
  it('a 300 KB body gets time for an 8 KB/s uplink; a read keeps 15 s; nothing waits past 120 s', () => {
    expect(deadlineFor(15_000, undefined)).toBe(15_000);
    expect(deadlineFor(15_000, { a: 1 })).toBeLessThan(16_000);
    const big = { file: 'x'.repeat(300_000) };
    expect(deadlineFor(15_000, big)).toBeGreaterThanOrEqual(15_000 + 300_000 / 10);
    expect(deadlineFor(15_000, { file: 'x'.repeat(5_000_000) })).toBe(120_000);
  });

  it('a queue with one trialEnd among 50 collects goes out as three requests: before, the battle, after', () => {
    const q = [...Array.from({ length: 20 }, () => ({ command: { type: 'collect' } })), { command: { type: 'trialEnd' } }, ...Array.from({ length: 30 }, () => ({ command: { type: 'collect' } }))];
    const first = nextBatch(q);
    expect(first).toHaveLength(20);
    const second = nextBatch(q.slice(20));
    expect(second.map((x) => x.command.type)).toEqual(['trialEnd']);
    expect(nextBatch(q.slice(21))).toHaveLength(30);
  });
});
