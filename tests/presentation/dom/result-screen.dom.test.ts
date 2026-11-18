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
