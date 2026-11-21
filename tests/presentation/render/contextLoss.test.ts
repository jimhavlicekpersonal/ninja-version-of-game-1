/** Beast Mode 2026-11-21 STB-06: a WebGL context that never comes back shows a reload card instead of a black canvas. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOSE_EVENT, RESTORE_EVENT, watchContext } from '../../../src/presentation/render/contextLoss';

function emitter() {
  const handlers = new Map<string, (() => void)[]>();
  return { on: (e: string, fn: () => void) => void handlers.set(e, [...(handlers.get(e) ?? []), fn]), emit: (e: string) => handlers.get(e)?.forEach((f) => f()) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('STB-06: context loss', () => {
  it('lost, then 8 s visible: stuck', () => {
    const r = emitter();
    const hooks = { onLost: vi.fn(), onRestored: vi.fn(), onStuck: vi.fn() };
    watchContext(r, hooks, { visible: () => true });
    r.emit(LOSE_EVENT);
    expect(hooks.onLost).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(8000);
    expect(hooks.onStuck).toHaveBeenCalledOnce();
  });

  it('lost, restored at 3 s: never stuck', () => {
    const r = emitter();
    const hooks = { onLost: vi.fn(), onRestored: vi.fn(), onStuck: vi.fn() };
    watchContext(r, hooks, { visible: () => true });
    r.emit(LOSE_EVENT);
    vi.advanceTimersByTime(3000);
    r.emit(RESTORE_EVENT);
    vi.advanceTimersByTime(20_000);
    expect(hooks.onRestored).toHaveBeenCalledOnce();
    expect(hooks.onStuck).not.toHaveBeenCalled();
  });

  it('lost while hidden for 60 s, then visible for 7 s: not yet stuck', () => {
    const r = emitter();
    let visible = false;
    const hooks = { onLost: vi.fn(), onRestored: vi.fn(), onStuck: vi.fn() };
    watchContext(r, hooks, { visible: () => visible });
    r.emit(LOSE_EVENT);
    vi.advanceTimersByTime(60_000);
    visible = true;
    vi.advanceTimersByTime(7000);
    expect(hooks.onStuck).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(hooks.onStuck).toHaveBeenCalledOnce();
  });
});
