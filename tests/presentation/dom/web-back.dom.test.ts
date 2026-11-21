// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 UX-03: Back in the web build closes the top dialog, leaves a battle by its confirm, else asks. */
import { describe, expect, it, vi } from 'vitest';
import { installWebBack } from '../../../src/presentation/ui/webBack';

function fakeWindow() {
  const listeners: ((e: PopStateEvent) => void)[] = [];
  const stack: unknown[] = [null];
  const history = {
    get state() {
      return stack[stack.length - 1];
    },
    pushState: vi.fn((s: unknown) => void stack.push(s)),
    go: vi.fn(),
  };
  const back = () => {
    stack.pop();
    for (const l of listeners) l({ state: history.state } as PopStateEvent);
  };
  return { win: { history, addEventListener: (_: string, l: EventListener) => void listeners.push(l as never), removeEventListener: () => undefined } as never, history, stack, back };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('web Back (UX-03)', () => {
  it('closes the top dialog and re-arms the guard', () => {
    const f = fakeWindow();
    const closeTop = vi.fn(() => true);
    installWebBack(f.win, { inBattle: () => false, battleBack: vi.fn(), closeTop, confirmLeave: vi.fn(async () => false), save: async () => undefined });
    expect(f.stack).toHaveLength(2);
    f.back();
    expect(closeTop).toHaveBeenCalledOnce();
    expect(f.stack).toHaveLength(2);
  });

  it('in battle, Back is the battle\'s own End battle path', () => {
    const f = fakeWindow();
    const battleBack = vi.fn();
    const closeTop = vi.fn(() => true);
    installWebBack(f.win, { inBattle: () => true, battleBack, closeTop, confirmLeave: vi.fn(async () => false), save: async () => undefined });
    f.back();
    expect(battleBack).toHaveBeenCalledOnce();
    expect(closeTop).not.toHaveBeenCalled();
  });

  it('with nothing open, asks before leaving; Stay keeps the game, Leave saves then goes back', async () => {
    const f = fakeWindow();
    let answer = false;
    const save = vi.fn(async () => undefined);
    installWebBack(f.win, { inBattle: () => false, battleBack: vi.fn(), closeTop: () => false, confirmLeave: vi.fn(async () => answer), save });
    f.back();
    await tick();
    expect(f.history.go).not.toHaveBeenCalled();
    expect(f.stack).toHaveLength(2);
    answer = true;
    f.back();
    await tick();
    await tick();
    expect(save).toHaveBeenCalledOnce();
    expect(f.history.go).toHaveBeenCalledWith(-2);
  });
});
