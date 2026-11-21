// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 UX-06: buy buttons name their product; the Jade pill is a reachable, named button. */
import { describe, expect, it } from 'vitest';
import { productInfo } from '../../../src/gameplay/sim/monetization';
import { buildHud } from './harness';

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('accessible names in the Store (UX-06)', () => {
  it('every enabled buy button is named "Buy <product> for <price shown>"', async () => {
    const { hud, controller } = await buildHud();
    (hud as unknown as { econ: { openStore(): void } }).econ.openStore();
    await settle();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-product]')].filter((b) => !b.disabled);
    expect(buttons.length).toBeGreaterThan(3);
    for (const b of buttons) {
      const name = productInfo(controller.data, b.dataset.product!)!.name;
      const label = b.getAttribute('aria-label') ?? '';
      expect(label, b.dataset.product).toContain(name);
      // WCAG 2.5.3: the accessible name contains the visible price.
      expect(label, b.dataset.product).toContain(b.textContent!.trim());
      expect(label.startsWith('Buy ')).toBe(true);
    }
  });

  it('the Jade pill is a button in the tab order with its amount and what it opens', async () => {
    const { hud } = await buildHud();
    (hud as unknown as { refresh(): void }).refresh?.();
    const pill = document.querySelector<HTMLElement>('.res-moonstones')!;
    expect(pill.tagName).toBe('BUTTON');
    expect(pill.tabIndex).toBe(0);
    expect(pill.getAttribute('aria-label')).toMatch(/^Jade: .+\. Open the Store$/);
  });
});
