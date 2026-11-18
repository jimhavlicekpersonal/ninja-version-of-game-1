// @vitest-environment happy-dom
/** P7-14 (review M4): "What's new" shows once in News, and never to a player new in this version. */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildHud } from './harness';

beforeEach(() => localStorage.clear());

describe("What's new once (P7-14)", () => {
  it('a new player never sees it', async () => {
    const { hud } = await buildHud();
    (hud as unknown as { openNews(): void }).openNews();
    expect(document.querySelector('[data-id="whats-new"]')).toBeNull();
  });
  it('a returning player sees it the first time News opens, not the second', async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    localStorage.removeItem('tk.whatsNewSeen');
    const inner = hud as unknown as { openNews(): void; closeAllModals(): void };
    inner.openNews();
    expect(document.querySelector('[data-id="whats-new"]')).not.toBeNull();
    inner.closeAllModals();
    await new Promise((r) => setTimeout(r, 300));
    inner.openNews();
    expect(document.querySelector('.modal-backdrop:not(.out) [data-id="whats-new"]')).toBeNull();
  });
});
