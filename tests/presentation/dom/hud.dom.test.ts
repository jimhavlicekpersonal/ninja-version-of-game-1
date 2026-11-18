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

describe('skipping the tutorial asks first (P6-09)', () => {
  it('a declined skip keeps the tutorial; a confirmed one ends it', async () => {
    const { controller, analytics } = await buildHud();
    const answers: boolean[] = [false, true];
    const asked: string[] = [];
    const tut = new Tutorial(controller, analytics, document.body, async (title) => {
      asked.push(title);
      return answers.shift()!;
    });
    controller.dispatch({ type: 'tutorial', step: 2, done: false });
    tut.start();
    const skip = () => (document.querySelector('[data-id="tutorial-skip"]') as HTMLButtonElement).click();
    skip();
    await settle();
    expect(asked).toHaveLength(1);
    expect(controller.state.tutorial.done).toBe(false);
    skip();
    await settle();
    expect(controller.state.tutorial.done).toBe(true);
  });
});

describe('the Build panel follows the state (P6-09)', () => {
  it('redraws its cards when the builders free up', async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    controller.state.resources.acorns = 1e7;
    controller.state.resources.dew = 1e7;
    // Keep every builder busy: the Keep's upgrade and obstacle clearing.
    const started: { id: string; kind: 'upgrade' | 'clear' }[] = [];
    for (const b of controller.state.buildings) {
      const kind = controller.data.buildings[b.type].category === 'obstacle' ? 'clear' : 'upgrade';
      const r = controller.dispatch({ type: kind, id: b.id });
      if (r.ok) started.push({ id: b.id, kind });
      if (!r.ok && r.code === 'NO_FREE_BUILDER') break;
    }
    (hud as unknown as { openShop(): void }).openShop();
    const busy = () => [...document.querySelectorAll('.shop-card.disabled')].length;
    const before = busy();
    expect(before).toBeGreaterThan(0);
    expect(document.querySelector('.shop-card.disabled .shop-why')?.textContent).toBeTruthy();
    // A cancel's refund must fit in storage (CU-3): empty it first.
    controller.state.resources.acorns = 0;
    controller.state.resources.dew = 0;
    for (const x of started) if (x.kind === 'upgrade') expect(controller.dispatch({ type: 'cancel', id: x.id }).ok).toBe(true);
    expect(busy()).toBeLessThan(before);
  });
});

