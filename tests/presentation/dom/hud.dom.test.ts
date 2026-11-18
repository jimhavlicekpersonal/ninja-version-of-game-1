// @vitest-environment happy-dom
/** P6-15 (UIS-09): the HUD and the tutorial built for real on a GameController (happy-dom). */
import { describe, expect, it } from 'vitest';
import { Tutorial } from '../../../src/presentation/ui/tutorial';
import { buildHud } from './harness';

const settle = () => new Promise((r) => setTimeout(r, 0));
const dialogs = () => [...document.querySelectorAll('.modal-backdrop')].filter((d) => !d.classList.contains('out'));

describe('the HUD on a real controller (P6-15)', () => {
  it('builds its skeleton: resource pills, the bottom bar and the rail', async () => {
    const { hud } = await buildHud();
    expect(hud).toBeTruthy();
    expect(document.querySelector('.hud-top')).toBeTruthy();
    expect(document.querySelector('.hud-bottom')).toBeTruthy();
  });

  it('opens every panel as a dialog without throwing', async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    const h = hud as unknown as Record<string, (...a: unknown[]) => unknown> & { econ: { openStore(): void }; daily: { openDaily(): void } };
    const open: [string, () => unknown][] = [
      ['shop', () => h.openShop()],
      ['army', () => h.openTraining()],
      ['league', () => h.openLeague()],
      ['log', () => h.openLog()],
      ['trials', () => h.openTrials()],
      ['news', () => h.openNews()],
      ['store', () => h.econ.openStore()],
      ['daily', () => h.daily.openDaily()],
    ];
    for (const [name, fn] of open) {
      (hud as unknown as { closeAllModals(): void }).closeAllModals();
      await settle();
      expect(() => fn(), name).not.toThrow();
      await settle();
      expect(dialogs().length, name).toBeGreaterThan(0);
    }
  });
});

describe('the tutorial on a real controller (P6-15)', () => {
  it('shows each of its nine steps', async () => {
    const { controller, analytics } = await buildHud();
    const tut = new Tutorial(controller, analytics, document.body);
    for (let step = 0; step < 9; step++) {
      controller.dispatch({ type: 'tutorial', step, done: false });
      tut.start();
      const bubble = document.querySelector('.tut-bubble') as HTMLElement;
      expect(bubble.hidden, `step ${step}`).toBe(false);
      expect(bubble.querySelector('.tut-step')?.textContent, `step ${step}`).toContain(String(step + 1));
    }
  });
});
