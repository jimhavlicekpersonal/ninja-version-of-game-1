/**
 * Alliance polling (worldwide audit R04): the same rate as before while the
 * screen is visible and the server answers, no requests while hidden, and an
 * exponential backoff on failures and slow answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteGroveSource } from '../../../src/backend/social/groveSource';
import type { GameController } from '../../../src/gameplay/control/controller';
import type { Connection } from '../../../src/backend/net/connection';

type Listener = () => void;

/** A document whose visibility the test flips. */
function fakeDocument() {
  const listeners = new Map<string, Set<Listener>>();
  const doc = {
    visibilityState: 'visible' as 'visible' | 'hidden',
    get hidden() {
      return doc.visibilityState === 'hidden';
    },
    addEventListener(t: string, f: Listener) {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(f);
    },
    removeEventListener(t: string, f: Listener) {
      listeners.get(t)?.delete(f);
    },
    set(state: 'visible' | 'hidden') {
      doc.visibilityState = state;
      for (const f of listeners.get('visibilitychange') ?? []) f();
    },
    count: (t: string) => listeners.get(t)?.size ?? 0,
  };
  return doc;
}

interface Plan {
  /** Answer time of each refresh (ms). */
  latency?: number;
  /** Fail this refresh. */
  fail?: boolean;
}

/** A RemoteGroveSource whose refresh is scripted: records when and how it was called. */
function source(plan: (i: number) => Plan = () => ({})) {
  const src = new RemoteGroveSource({} as GameController, {} as Connection);
  const calls: { at: number; full: boolean }[] = [];
  (src as unknown as { refresh: (full?: boolean) => Promise<void> }).refresh = async (full = true) => {
    const p = plan(calls.length);
    calls.push({ at: Date.now(), full });
    if (p.latency) await new Promise((r) => setTimeout(r, p.latency));
    (src as unknown as { error: string | null }).error = p.fail ? 'Cannot reach the server right now.' : null;
  };
  return { src, calls };
}

let doc: ReturnType<typeof fakeDocument>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  doc = fakeDocument();
  vi.stubGlobal('document', doc);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('RemoteGroveSource.watch polling', () => {
  it('visible and healthy: a poll every 4 s, every 5th one full, as before', async () => {
    const { src, calls } = source();
    const stop = src.watch();
    await vi.advanceTimersByTimeAsync(40_000);
    stop();
    expect(calls.map((c) => c.at)).toEqual([0, 4000, 8000, 12000, 16000, 20000, 24000, 28000, 32000, 36000, 40000]);
    expect(calls.filter((c) => c.full).map((c) => c.at)).toEqual([0, 20000, 40000]);
    // Stopping clears the timer and the listeners.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(11);
    expect(doc.count('visibilitychange')).toBe(0);
  });

  it('hidden: no requests at all; a full refresh as soon as the screen is visible again', async () => {
    const { src, calls } = source();
    const stop = src.watch();
    await vi.advanceTimersByTimeAsync(8000); // polls at 0, 4000, 8000
    doc.set('hidden');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls).toHaveLength(3);
    doc.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(4);
    expect(calls[3]).toEqual({ at: 8000 + 10 * 60_000, full: true });
    // Then the normal rate again.
    await vi.advanceTimersByTimeAsync(8000);
    expect(calls.slice(4).map((c) => c.at - calls[3].at)).toEqual([4000, 8000]);
    stop();
  });

  it('a page hidden while a poll is in flight schedules nothing more', async () => {
    const { src, calls } = source(() => ({ latency: 1000 }));
    const stop = src.watch();
    await vi.advanceTimersByTimeAsync(500);
    doc.set('hidden');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(calls).toHaveLength(1);
    doc.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].full).toBe(true);
    stop();
  });

  it('failures back off exponentially up to 60 s, and the first success returns to 4 s', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // no jitter
    const failing = new Set([0, 1, 2, 3, 4, 5, 6]);
    const { src, calls } = source((i) => ({ fail: failing.has(i) }));
    const stop = src.watch();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    stop();
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
    expect(gaps.slice(0, 9)).toEqual([8000, 16000, 32000, 60000, 60000, 60000, 60000, 4000, 4000]);
  });

  it('backoff waits carry jitter so clients do not retry in step', async () => {
    const { src, calls } = source(() => ({ fail: true }));
    const stop = src.watch();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    stop();
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
    for (const g of gaps.slice(4)) {
      expect(g).toBeGreaterThanOrEqual(0.85 * 60_000 - 1);
      expect(g).toBeLessThanOrEqual(1.15 * 60_000 + 1);
    }
    // At the cap a dead server sees about one poll a minute (not 15).
    expect(calls.length).toBeLessThan(35);
  });

  it('slow answers never overlap, and stretch the next wait to twice the answer time', async () => {
    const { src, calls } = source(() => ({ latency: 3000 }));
    const stop = src.watch();
    await vi.advanceTimersByTimeAsync(60_000);
    stop();
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
    // 3 s answer + 6 s wait.
    expect(new Set(gaps)).toEqual(new Set([9000]));
  });

  it('a quick answer keeps a 4 s start-to-start rhythm', async () => {
    const { src, calls } = source(() => ({ latency: 800 }));
    const stop = src.watch();
    await vi.advanceTimersByTimeAsync(20_000);
    stop();
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
    expect(new Set(gaps)).toEqual(new Set([4000]));
  });

  it('coming back online after failures polls at once', async () => {
    const online = new Set<Listener>();
    vi.stubGlobal('addEventListener', (t: string, f: Listener) => t === 'online' && online.add(f));
    vi.stubGlobal('removeEventListener', (t: string, f: Listener) => t === 'online' && online.delete(f));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { src, calls } = source((i) => ({ fail: i < 4 }));
    const stop = src.watch();
    await vi.advanceTimersByTimeAsync(8000 + 16000 + 32000); // polls at 0, 8 s, 24 s, 56 s; next wait 60 s
    expect(calls).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(5000);
    for (const f of online) f();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(5);
    expect(calls[4]).toEqual({ at: 61_000, full: true });
    stop();
    expect(online.size).toBe(0);
  });
});
