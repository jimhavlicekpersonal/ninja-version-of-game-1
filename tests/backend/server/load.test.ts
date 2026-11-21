/** The load-test tool (roadmap step 46) against a local server: real battles go through and every call is timed. */
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { runLoad } from '../../../server/load';
import { MemoryRepo } from '../../../server/repo';
import { defaultData as data } from '../../../src/gameplay/sim/data';

describe('load test tool', () => {
  it('registers players, then matches and reports battles at a set rate', async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    const app = buildServer({ repo: new MemoryRepo(), data, rateLimits: { ip: big, player: big, register: big, match: big, battle: big } });
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
      const r = await runLoad({ url, data, players: 4, battlesPerSecond: 2, seconds: 2, keeps: [2, 3] });
      expect(r.battles).toBeGreaterThan(0);
      expect(r.calls.attack.count).toBe(r.battles);
      expect(r.calls.attack.errors).toBe(0);
      expect(r.calls.match.p95).toBeGreaterThanOrEqual(r.calls.match.p50);
      expect(Object.keys(r.errors).filter((k) => k !== 'skipped_all_busy')).toEqual([]);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('Beast Mode SEC-08: --mix adds held-village sessions (hello, commands, notices) with no errors', async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    const app = buildServer({ repo: new MemoryRepo(), data, rateLimits: { ip: big, player: big, register: big, match: big, battle: big, commands: big } });
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
      const r = await runLoad({ url, data, players: 3, battlesPerSecond: 1, seconds: 2, keeps: [2], commandsPerSecond: 4, holders: 3 });
      for (const route of ['register', 'match', 'attack', 'hello', 'commands', 'notices']) {
        expect(r.calls[route]?.count, route).toBeGreaterThan(0);
        expect(r.calls[route]?.errors, route).toBe(0);
      }
      expect(r.sessions).toBeGreaterThan(0);
      expect(r.calls.village?.count ?? 0).toBe(0); // the game's rules agree with the server's: no corrections
      expect(Object.keys(r.errors).filter((k) => !k.startsWith('skipped_'))).toEqual([]);
    } finally {
      await app.close();
    }
  }, 30_000);
});
