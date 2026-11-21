/** Beast Mode 2026-11-21 STB-03: one throw in a scene update froze the map for good. */
import { describe, expect, it, vi } from 'vitest';
import { guardLoop, type GuardableLoop } from '../../../src/presentation/render/frameGuard';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('STB-03: the frame guard', () => {
  it('catches a throwing step, reports it and restarts the loop, three times; the fourth within 10 s is fatal', async () => {
    let t = 1000;
    const loop: GuardableLoop = { callback: () => { throw new Error('scene update broke'); }, sleep: vi.fn(), wake: vi.fn() };
    const onError = vi.fn();
    const onFatal = vi.fn();
    guardLoop(loop, { onError, onFatal, now: () => t });
    for (let i = 0; i < 3; i++) {
      loop.callback(0, 16);
      await tick();
      t += 1000;
    }
    expect(onError).toHaveBeenCalledTimes(3);
    expect(loop.wake).toHaveBeenCalledTimes(3);
    expect(onFatal).not.toHaveBeenCalled();
    loop.callback(0, 16);
    await tick();
    expect(onFatal).toHaveBeenCalledOnce();
    expect(loop.wake).toHaveBeenCalledTimes(3);
    // Stopped: later frames do nothing.
    loop.callback(0, 16);
    expect(onError).toHaveBeenCalledTimes(4);
  });

  it('errors spread over more than 10 s never add up to fatal; a healthy step runs as before', async () => {
    let t = 0;
    let calls = 0;
    let fail = true;
    const loop: GuardableLoop = { callback: () => { calls++; if (fail) throw new Error('x'); }, sleep: vi.fn(), wake: vi.fn() };
    const onFatal = vi.fn();
    guardLoop(loop, { onError: () => undefined, onFatal, now: () => t });
    for (let i = 0; i < 6; i++) {
      loop.callback(0, 16);
      await tick();
      t += 11_000;
    }
    expect(onFatal).not.toHaveBeenCalled();
    fail = false;
    loop.callback(0, 16);
    expect(calls).toBe(7);
  });
});
