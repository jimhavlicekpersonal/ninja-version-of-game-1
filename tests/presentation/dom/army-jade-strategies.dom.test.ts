// @vitest-environment happy-dom
/** Army panel (2026-11-25): Jade buys +1, +5, +10 as well as a full Fill, and prebuilt strategies train in one tap. */
import { describe, expect, it } from 'vitest';
import { buildHud } from './harness';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

async function armyVillage(dew: number) {
  const env = await buildHud();
  const { controller } = env;
  controller.dispatch({ type: 'tutorial', step: 9, done: true });
  const at = controller.state.buildings[0];
  controller.state.buildings.push(
    { id: 'dojo-t', type: 'burrow_barracks', level: 6, x: at.x + 6, y: at.y + 6, upgrade: null, collector: null } as never,
    { id: 'camp-t', type: 'army_camp', level: 2, x: at.x + 10, y: at.y + 6, upgrade: null, collector: null } as never,
  );
  controller.state.resources.dew = dew;
  (env.hud as unknown as { openTraining(): void }).openTraining();
  await settle();
  return env;
}

describe('Army panel Jade batches', () => {
  it('shows +1, +5 and Fill buy buttons when Provisions run short, each asking before it spends', async () => {
    const { controller } = await armyVillage(0);
    const card = document.querySelector('.army-card') as HTMLElement;
    const buys = [...card.querySelectorAll<HTMLButtonElement>('.army-buys .btn.buy')];
    const ids = buys.map((b) => b.dataset.id);
    expect(ids).toContain('buy-train-1');
    expect(ids).toContain('buy-train-5');
    expect(buys.at(-1)!.textContent).toMatch(/^Buy all/);
    const jade = controller.state.resources.moonstones;
    card.querySelector<HTMLButtonElement>('[data-id="buy-train-1"]')!.click();
    await settle();
    // A confirm step, nothing spent yet.
    expect(document.querySelectorAll('.modal-backdrop:not(.out)').length).toBeGreaterThan(1);
    expect(controller.state.resources.moonstones).toBe(jade);
  });

  it('shows no buy button while Provisions cover the warriors', async () => {
    await armyVillage(1e6);
    expect(document.querySelectorAll('.army-buys .btn.buy').length).toBe(0);
  });
});

describe('Army panel prebuilt strategies', () => {
  it('lists named strategies under the suggested army; Train queues one', async () => {
    const { controller } = await armyVillage(1e6);
    const box = document.querySelector('[data-id="strategies"]') as HTMLDetailsElement;
    expect(box).toBeTruthy();
    const rows = [...box.querySelectorAll<HTMLElement>('.stack-row.refill')];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.querySelector('.strategy-note')?.textContent?.length).toBeGreaterThan(10);
    rows[0].querySelector<HTMLButtonElement>('.btn.sky')!.click();
    await settle();
    expect(controller.state.training.length).toBeGreaterThan(0);
  });
});
