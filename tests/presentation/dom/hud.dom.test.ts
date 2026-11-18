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


describe('the rest of the playthrough fixes (P6-09)', () => {
  type Inner = { renderSheet(): void; selectedId: string | null; collect(b: unknown): void; recentToasts: unknown[] };

  it("the Dojo's sheet names the warriors its next level unlocks", async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    const at = controller.state.buildings[0];
    controller.state.buildings.push({ id: 'dojo-test', type: 'burrow_barracks', level: 1, x: at.x + 6, y: at.y + 6 } as never);
    const inner = hud as unknown as Inner;
    inner.selectedId = 'dojo-test';
    inner.renderSheet();
    const row = document.querySelector('[data-id="dojo-unlocks"]');
    const names = Object.values(controller.data.troops).filter((t) => t.barracksLevel === 2 && (t.unlockKeep ?? 1) <= 1).map((t) => t.name);
    if (names.length) {
      expect(row).not.toBeNull();
      for (const n of names) expect(row!.textContent).toContain(n);
    } else expect(row).toBeNull();
  });

  it('an empty collect is a toast only, never a News line', async () => {
    const { hud, controller } = await buildHud();
    const inner = hud as unknown as Inner;
    const at = controller.state.buildings[0];
    const type = Object.keys(controller.data.buildings).find((k) => controller.data.buildings[k].produces)!;
    controller.state.buildings.push({ id: 'mint-test', type, level: 1, x: at.x + 6, y: at.y + 6, upgrade: null, collector: { accrueFrom: controller.now(), stored: 0 } } as never);
    const mint = controller.state.buildings.find((b) => b.id === 'mint-test')!;
    const probe = controller.dispatch({ type: 'collect', id: mint.id });
    expect(probe.ok ? 'ok' : probe.code).toBe('NOTHING_TO_COLLECT');
    inner.collect(mint);
    inner.collect(mint);
    expect(document.querySelector('.toast')).not.toBeNull();
    expect(inner.recentToasts.length).toBe(0);
  });

  it('where nothing can be bought, the Store says so first and shows no Jade cards', async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    Object.defineProperty(controller, 'payments', { value: { name: 'web', available: () => false, prices: null, store: null } });
    hud.openShortcut('store');
    const body = document.querySelector('.modal-backdrop:last-child .modal-body')!;
    const first = body.querySelector('.store-unavailable');
    expect(first).not.toBeNull();
    // The reason sits above everything but the tabs, and no unbuyable pack cards follow it.
    expect(body.querySelectorAll('.shop-card.pack').length).toBe(0);
    expect(body.querySelectorAll('.store-note').length).toBe(1);
  });
});
