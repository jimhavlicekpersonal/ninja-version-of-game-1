/** Beast Mode 2026-11-21 STB-01: hello says which push platforms the server reaches; the game asks only for those. */
import { describe, expect, it, vi } from 'vitest';
import { ServerPush } from '../../../server/push/push';
import { MemoryRepo } from '../../../server/repo';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { Connection, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import { defaultData } from '../../../src/gameplay/sim/data';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import { world } from './harness';

const apnsOnly = (repo: MemoryRepo) => new ServerPush({ repo, data: defaultData, transport: { platforms: ['ios'], send: async () => 'sent' } as never, now: () => Date.now() });

function memoryKv(): KeyValue {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void (v === null ? map.delete(k) : map.set(k, v)) };
}

describe('STB-01: push platforms', () => {
  it('a server with APNs only lists push and push-apns, not push-fcm', async () => {
    const repo = new MemoryRepo();
    const w = world({ repo, shared: { push: apnsOnly(repo) } as never });
    const p = await w.player('Ann');
    const hello = await p.hello();
    expect(hello.features).toEqual(expect.arrayContaining(['push', 'push-apns']));
    expect(hello.features).not.toContain('push-fcm');
  });

  it('an Android game never starts a push registration against an APNs-only server', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)' });
    try {
      const repo = new MemoryRepo();
      const w = world({ repo, shared: { push: apnsOnly(repo) } as never });
      const g: { data: typeof w.data; state: ReturnType<typeof createNewVillage>; now: () => number; dispatch(cmd: Command): ReturnType<typeof applyCommand> } = {
        data: w.data,
        state: createNewVillage(w.now(), w.data),
        now: () => w.now(),
        dispatch(cmd: Command) {
          const r = applyCommand(g.state, cmd, g.now(), w.data);
          if (r.ok) g.state = r.state;
          return r;
        },
      };
      const conn = new Connection({ game: g as unknown as GameLink, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => new InProcessServerAdapter(w.core), log: () => undefined } as never);
      await conn.sync();
      const device = vi.fn(async () => ({ token: 't', platform: 'android' as const }));
      await conn.syncPush(['raided'], 0, device);
      expect(device).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
