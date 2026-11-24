// @vitest-environment happy-dom
/**
 * STB-N4: a "What if…" simulation stops when its dialog closes, whichever way: the footer Close, the X, Escape, or the
 * battle HUD going away. It used to stop only on the footer Close, so the other ways left it running in the background
 * (and opening the dialog again could start a second run).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { WhatIfRun } from '../../../src/gameplay/control/whatIf';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { BattleHud } from '../../../src/presentation/ui/battleHud';

let hud: BattleHud | null = null;
afterEach(() => {
  hud?.destroy();
  hud = null;
  vi.restoreAllMocks();
});

function raid(): BattleHud {
  document.body.innerHTML = '<div id="battle-hud"></div>';
  const setup = { seed: 3, base: generateOpponent(77, 5, data), army: { beetle_brute: 5, hedgehog_roller: 8 }, levels: { beetle_brute: 1, hedgehog_roller: 1 }, infiltration: true };
  const session = new BattleSession(structuredClone(setup), data, 'live');
  session.orderSquad({ point: 0, formation: 'file', order: 'rush' });
  for (let i = 0; i < 6000 && !session.sim.ended; i++) session.update(100);
  hud = new BattleHud({
    root: document.getElementById('battle-hud')!,
    session,
    myTrophies: 400,
    troopThumb: () => null,
    scoutFee: 0,
    canPayFee: () => true,
    onHome: () => undefined,
    onNext: () => undefined,
    onAttack: () => true,
    onReplay: () => undefined,
    onFinished: () => ({ result: session.result(), banked: {}, trophies: 0 }),
  });
  (hud as unknown as { tick(): void }).tick();
  return hud;
}

const macrotasks = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

/** The run never ends here (advance always says "not yet"), so it lasts until something stops it. */
async function start(): Promise<() => number> {
  let calls = 0;
  vi.spyOn(WhatIfRun.prototype, 'advance').mockImplementation(() => {
    calls++;
    return false;
  });
  (document.querySelector('[data-id="what-if"]') as HTMLButtonElement).click();
  (document.querySelector('[data-id="what-if-1"]') as HTMLButtonElement).click();
  await macrotasks(3);
  expect(calls).toBeGreaterThan(0);
  return () => calls;
}

const reviewDialog = () => [...document.querySelectorAll<HTMLElement>('.modal-backdrop:not(.out)')].find((b) => b.querySelector('[data-id="what-if-1"]'));

async function expectStopped(calls: () => number): Promise<void> {
  await macrotasks(2); // a slice already running may finish
  const after = calls();
  await macrotasks(10);
  expect(calls()).toBe(after);
}

describe('"What if…" stops with its dialog (STB-N4)', () => {
  it('closed with the X', async () => {
    raid();
    const calls = await start();
    reviewDialog()!.querySelector<HTMLButtonElement>('.modal-head .icon-btn')!.click();
    await expectStopped(calls);
  });

  it('closed with Escape', async () => {
    raid();
    const calls = await start();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expectStopped(calls);
  });

  it('when the battle HUD is destroyed', async () => {
    const h = raid();
    const calls = await start();
    h.destroy();
    hud = null;
    await expectStopped(calls);
  });

  it('closed with the footer Close (as before)', async () => {
    raid();
    const calls = await start();
    [...reviewDialog()!.querySelectorAll<HTMLButtonElement>('.modal-foot button')].pop()!.click();
    await expectStopped(calls);
  });
});
