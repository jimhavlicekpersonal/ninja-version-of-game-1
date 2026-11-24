/**
 * F1 (2026-11-24): battles played offline past the server's battle budget (6 a minute) are held back and sent
 * again after the window, never refused for good (a refused Trial was taken back by the server's correction).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { BATTLE_COMMANDS_PER_MINUTE } from '../../../server/rateLimit';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { Connection, type KeyValue } from '../../../src/backend/net/connection';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { trialBase } from '../../../src/gameplay/sim/trials';
import { trialBattleSeed } from '../../../src/gameplay/sim/village';
import { world } from '../server/harness';

const MIN = 60_000;

afterEach(() => vi.useRealTimers());

describe('F1: battle commands over the battle budget', () => {
  it('8 Trials played offline are all applied once the minute has passed, none refused', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const w = world();
    vi.setSystemTime(w.now());
    const map = new Map<string, string>();
    const kv: KeyValue = { get: (k) => map.get(k) ?? null, set: (k, v) => void (v === null ? map.delete(k) : map.set(k, v)) };
    const clock = { now: () => w.now() };
    const { controller } = await GameController.start({ clock, store: new MemorySaveStore(), data: w.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv, makePort: () => port, log: () => undefined });
    await conn.sync();
    const sync = conn.village!;
    await sync.enable();

    // Eight Trial attempts while offline (queued, not yet sent).
    const n = BATTLE_COMMANDS_PER_MINUTE + 2;
    for (let i = 0; i < n; i++) {
      const s = controller.state;
      const setup = { seed: trialBattleSeed(s.seed, s.nextSeed, 1), base: trialBase(1, w.data), army: { ...s.army } };
      controller.dispatch({ type: 'trialEnd', tier: 1, record: { at: w.now(), opponentName: 'x', setup, deployments: [] } });
    }
    expect(sync.pending).toBe(n);

    await sync.flush();
    expect(sync.refused).toBe(0);
    expect(sync.pending).toBe(n - BATTLE_COMMANDS_PER_MINUTE); // held back, still queued
    // Within the window nothing more is sent.
    await sync.flush();
    expect(sync.pending).toBe(n - BATTLE_COMMANDS_PER_MINUTE);

    w.advance(MIN + 1_000);
    vi.setSystemTime(Date.now() + MIN + 1_000);
    await sync.flush();
    expect(sync.pending).toBe(0);
    expect(sync.refused).toBe(0);
    const log = await w.repo.commandsOf(conn.player!.id, 0, 100);
    const trials = log.filter((l) => l.type === 'trialEnd');
    expect(trials).toHaveLength(n);
    expect(trials.every((l) => l.ok)).toBe(true);
    expect(controller.state.trials).toEqual(deserializeTrials(await port.getVillage()));
  });

  it('a game that does not ask to hold battles (older build) still gets them refused and acknowledged', async () => {
    const w = world();
    const ann = await w.player('Ann');
    await ann.startVillage();
    let seq = 0;
    const trial = () => ({ seq: ++seq, t: w.now(), command: { type: 'trialEnd', tier: 1, record: {} } as never });
    for (let i = 0; i < 2; i++) await ann.sendCommands({ device: 'device-old-01', stateHash: '', commands: [trial(), trial(), trial()] });
    const r = await ann.sendCommands({ device: 'device-old-01', stateHash: '', commands: [trial()] });
    expect(r.results.map((x) => x.error)).toEqual(['TOO_MANY_BATTLES']);
    expect(r.ackSeq).toBe(7);
    expect(r.held).toBeUndefined();
    // With the flag: held, not acknowledged, not in the results.
    const h = await ann.sendCommands({ device: 'device-old-01', stateHash: '', commands: [trial()], holdBattles: true });
    expect(h.results).toEqual([]);
    expect(h.ackSeq).toBe(7);
    expect(h.held).toMatchObject({ seq: 8, error: 'TOO_MANY_BATTLES' });
    expect(h.held!.retryAfterMs).toBeGreaterThan(0);
  });
});

function deserializeTrials(v: Awaited<ReturnType<InProcessServerAdapter['getVillage']>>): unknown {
  return (v!.file as { village: { trials: unknown } }).village.trials;
}
