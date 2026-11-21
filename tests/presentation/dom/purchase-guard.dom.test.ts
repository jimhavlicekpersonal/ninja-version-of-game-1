// @vitest-environment happy-dom
/**
 * Beast Mode 2026-11-21 ECO-01 / UX-01: a double tap on a buy button (or a tap on another card while the first
 * purchase runs) started a second purchase. Now every buy button is disabled while one runs, and the controller
 * refuses a second concurrent purchase.
 */
import { describe, expect, it } from 'vitest';
import type { PurchaseOutcome } from '../../../src/gameplay/control/controller';
import { buildHud } from './harness';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('purchase in-flight guard (ECO-01, UX-01)', () => {
  it('two taps on a Jade pack buy once, and every buy button is disabled meanwhile', async () => {
    const { hud, controller } = await buildHud();
    let calls = 0;
    let finish: (o: PurchaseOutcome) => void = () => undefined;
    controller.purchase = () => {
      calls++;
      return new Promise<PurchaseOutcome>((r) => (finish = r));
    };
    (hud as unknown as { econ: { openStore(t: string): void } }).econ.openStore('moonstones');
    const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button[data-product]')];
    expect(buttons().length).toBeGreaterThan(1);
    const first = buttons()[0];
    first.click();
    first.click();
    for (let i = 0; i < 5; i++) await tick();
    // The confirm step: accept it.
    const ok = [...document.querySelectorAll<HTMLButtonElement>('.modal-backdrop:not(.out) button')].find((b) => /Buy for/.test(b.textContent ?? ''));
    expect(ok).toBeTruthy();
    ok!.click();
    for (let i = 0; i < 5; i++) await tick();
    expect(calls).toBe(1);
    expect(buttons().every((b) => b.disabled)).toBe(true);
    expect(buttons().find((b) => b.dataset.product === first.dataset.product)!.textContent).toBe('Purchase in progress…');
    buttons()[1].click();
    for (let i = 0; i < 5; i++) await tick();
    expect(calls).toBe(1);
    finish({ ok: true, grants: {} });
    for (let i = 0; i < 5; i++) await tick();
    expect(buttons().some((b) => !b.disabled)).toBe(true);
  });

  it('the controller refuses a second purchase while one runs', async () => {
    const { controller } = await buildHud();
    const pay = controller.payments as unknown as { purchase: (...a: unknown[]) => Promise<unknown> };
    const real = pay.purchase.bind(pay);
    let release: () => void = () => undefined;
    pay.purchase = (...a: unknown[]) => new Promise((r) => (release = () => r(real(...a))));
    const a = controller.purchase('moonstones_0');
    const b = await controller.purchase('moonstones_0');
    expect(b).toMatchObject({ ok: false, code: 'IN_PROGRESS' });
    release();
    expect(await a).toMatchObject({ ok: true });
    pay.purchase = real;
    expect(await controller.purchase('moonstones_0')).toMatchObject({ ok: true });
  });
});
