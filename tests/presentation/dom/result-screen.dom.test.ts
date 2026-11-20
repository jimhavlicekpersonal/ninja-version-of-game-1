// @vitest-environment happy-dom
/**
 * P6-07 (UIS-01, PLY-13): the result screen shows what the raid moved and a next step, and never contradicts itself:
 * no carry line when nothing was carried; a missed stake's league bonus is labelled as such, never "Loot".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { BattleResult } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { BattleHud } from '../../../src/presentation/ui/battleHud';
import type { ProgressLine } from '../../../src/presentation/ui/resultProgress';

let hud: BattleHud | null = null;
afterEach(() => {
  hud?.destroy();
  hud = null;
});

function build(out: ReturnType<ConstructorParameters<typeof BattleHud>[0]['onFinished']>, next: { label: string; primary?: boolean }[] = []) {
  document.body.innerHTML = '<div id="battle-hud"></div>';
  const session = new BattleSession({ seed: 3, base: generateOpponent(77, 5, data), army: { beetle_brute: 5 }, levels: { beetle_brute: 1 }, infiltration: true }, data, 'live');
  let clicked = '';
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
    onFinished: () => out,
    stakes: true,
    nextActions: () => next.map((n) => ({ ...n, onClick: () => void (clicked = n.label) })),
  });
  session.surrender();
  (hud as unknown as { tick(): void }).tick();
  return { modal: () => document.querySelector('.modal-backdrop:last-child')!, clicked: () => clicked };
}

const res = (stars: number): BattleResult => ({ stars, destruction: stars ? 60 : 20, loot: { acorns: 5000 }, used: { beetle_brute: 5 }, hash: 'h', hallDestroyed: stars > 1, ticks: 900, endReason: 'time' }) as unknown as BattleResult;

describe('the result screen (P6-07)', () => {
  it('a missed stake: the league bonus is labelled as the league bonus, and no share line', () => {
    const { modal } = build({ result: res(1), banked: { acorns: 300 }, bonus: { acorns: 300 }, trophies: 5, stake: 2, diversity: 0.85 });
    const text = modal().textContent ?? '';
    expect(text).toContain('League bonus:');
    expect(text).not.toContain('Loot:');
    expect(text).toMatch(/Stake missed/);
  });

  it('a defeat that carried nothing has no "carried N% of the loot" line', () => {
    const { modal } = build({ result: res(0), banked: {}, trophies: -8, diversity: 0.85 });
    expect(modal().textContent ?? '').not.toMatch(/carried/);
  });

  it('shows the progress block and the next actions, the first primary one replacing Return home as primary', () => {
    const progress: ProgressLine[] = [
      { kind: 'task', id: data.pass.dailyTasks[0].id, taskKind: 'daily', from: 1, to: 2, target: 3 },
      { kind: 'honor', left: 120, league: data.ranks.leagues[1].name },
    ];
    const { modal, clicked } = build({ result: res(2), banked: { acorns: 4000 }, trophies: 12, progress }, [{ label: 'Refill in one tap' }, { label: 'Next', primary: true }]);
    const block = modal().querySelector('[data-id="result-progress"]');
    expect(block).not.toBeNull();
    expect(block!.textContent).toContain('2/3');
    expect(block!.textContent).toContain('120');
    const buttons = [...modal().querySelectorAll('.modal-foot button')];
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Refill in one tap', 'Next']));
    const primary = buttons.filter((b) => b.classList.contains('primary')).map((b) => b.textContent);
    expect(primary).toEqual(['Next']);
    (buttons.find((b) => b.textContent === 'Next') as HTMLButtonElement).click();
    expect(clicked()).toBe('Next');
  });
});

describe('the post-raid review (P6-02)', () => {
  it('is offered after a raid, runs one point on demand, and shows a real battle result', async () => {
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
    (document.querySelector('[data-id="what-if"]') as HTMLButtonElement).click();
    const btn = document.querySelector('[data-id="what-if-1"]') as HTMLButtonElement;
    expect(document.querySelector('.modal-backdrop:last-child')?.textContent).toMatch(/Simulated/);
    btn.click();
    for (let i = 0; i < 400 && btn.disabled; i++) await new Promise((r) => setTimeout(r, 0));
    const out = btn.parentElement!.querySelector('.what-if-out')!.textContent!;
    const { WhatIfRun } = await import('../../../src/gameplay/control/whatIf');
    const run = new WhatIfRun(setup, session.deployments, 1, data, session.endTick);
    while (!run.advance(100));
    const r = run.outcome().result;
    expect(out).toContain(`${r.stars}★`);
    expect(out).toContain(String(r.destruction));
  });
});
