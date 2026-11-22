// @vitest-environment happy-dom
/** Beast Mode OPS-09: a product the server paused (PRODUCTS_OFF) shows as unavailable and cannot be bought. */
import { describe, expect, it } from 'vitest';
import { buildHud } from './harness';

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('paused store products (OPS-09)', () => {
  it('a paused pack is disabled and says Not available; the others stay buyable', async () => {
    const { hud, controller, connection } = await buildHud();
    (controller.payments as unknown as { prices: (ids: string[]) => Promise<Record<string, unknown>> }).prices = async (ids) =>
      Object.fromEntries(ids.map((id) => [id, { formatted: '$1.00', currency: 'USD', micros: 1_000_000 }]));
    (connection as unknown as { server: { pausedProducts: string[] } }).server = { pausedProducts: ['moonstones_1'] } as never;
    const econ = (hud as unknown as { econ: { openStore(): void } }).econ;
    econ.openStore();
    await settle();
    const paused = document.querySelector<HTMLButtonElement>('button[data-product="moonstones_1"]')!;
    const other = document.querySelector<HTMLButtonElement>('button[data-product="moonstones_0"]')!;
    expect(paused.disabled).toBe(true);
    expect(paused.textContent).toBe('Not available');
    expect(other.disabled).toBe(false);
    expect(other.textContent).toBe('$1.00');
  });
});
