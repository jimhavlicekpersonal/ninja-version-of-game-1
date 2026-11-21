// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 ECO-10: the Store asked for the retired offer's price, so prices were never complete. */
import { describe, expect, it } from 'vitest';
import { buildHud } from './harness';

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('store prices (ECO-10)', () => {
  it('asks the store once when it answers every live product', async () => {
    const { hud, controller } = await buildHud();
    const asked: string[][] = [];
    (controller.payments as unknown as { prices: (ids: string[]) => Promise<Record<string, unknown>> }).prices = async (ids) => {
      asked.push(ids);
      return Object.fromEntries(ids.map((id) => [id, { formatted: '$1.00', currency: 'USD', micros: 1_000_000 }]));
    };
    const econ = (hud as unknown as { econ: { openStore(): void } }).econ;
    econ.openStore();
    await settle();
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
    econ.openStore();
    await settle();
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toContain('offer_rebuild');
  });
});
