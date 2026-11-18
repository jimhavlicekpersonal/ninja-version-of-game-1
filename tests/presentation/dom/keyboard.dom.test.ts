// @vitest-environment happy-dom
/**
 * P6-16 (UIS-10, UIS-13): no dead ends and a keyboard in battle. With no army, Attack leads to the Army panel; an
 * unaffordable Next says why; a long press explains a card; 1-9 and S pick cards; Esc closes a dialog or asks to end.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { BattleHud } from '../../../src/presentation/ui/battleHud';

let hud: BattleHud | null = null;
afterEach(() => {
  hud?.destroy();
  hud = null;
});

function make(army: Record<string, number>, opts: { fee?: boolean; onTrain?: () => void } = {}) {
  document.body.innerHTML = '<div id="battle-hud"></div>';
  const session = new BattleSession({ seed: 3, base: generateOpponent(77, 5, data), army, levels: { beetle_brute: 1, hedgehog_roller: 1 }, infiltration: true }, data, 'scout');
  hud = new BattleHud({
    root: document.getElementById('battle-hud')!,
    session,
    myTrophies: 400,
    troopThumb: () => null,
    scoutFee: 500,
    canPayFee: () => opts.fee ?? true,
    onHome: () => undefined,
    onNext: () => undefined,
    onTrain: opts.onTrain,
    onAttack: () => {
      session.start();
      return true;
    },
    onReplay: () => undefined,
    onFinished: () => null,
  });
  return session;
}
const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('dead ends and keyboards (P6-16)', () => {
  it('with no army, Attack leads to the Army panel; an unaffordable Next says why', () => {
    let trained = 0;
    make({}, { fee: false, onTrain: () => void trained++ });
    (document.querySelector('.big-attack') as HTMLButtonElement).click();
    expect(trained).toBe(1);
    const next = [...document.querySelectorAll('.b-bottom .btn.gold')][0] as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    next.click();
    expect(document.querySelector('#battle-hud .toast')?.textContent).toMatch(/Not enough resources/);
  });

  it('1-9 pick warrior cards, S the Smoke Bomb, Esc asks to end the battle and closes the dialog', async () => {
    const session = make({ beetle_brute: 3, hedgehog_roller: 5 });
    session.start();
    (hud as unknown as { renderTroops(): void; renderBottom(): void }).renderBottom();
    (hud as unknown as { renderTroops(): void }).renderTroops();
    key('2');
    expect(document.querySelector('.troop-card.on')?.getAttribute('data-type')).toBe(document.querySelectorAll('.troop-card:not(.ability)')[1].getAttribute('data-type'));
    if (document.querySelector('.troop-card.ability')) {
      key('s');
      expect(document.querySelector('.troop-card.on')?.getAttribute('data-type')).toBe('smoke_bomb');
    }
    key('Escape');
    expect(document.querySelector('#battle-hud .modal-backdrop')).not.toBeNull();
    expect(document.activeElement?.tagName).toBe('BUTTON');
    key('Escape');
    await new Promise((r) => setTimeout(r, 300));
    expect(document.querySelector('#battle-hud .modal-backdrop:not(.out)')).toBeNull();
    expect(session.sim.ended).toBe(false);
  });

  it('a long press on a card shows its name and line', async () => {
    const session = make({ beetle_brute: 3 });
    session.start();
    (hud as unknown as { renderTroops(): void }).renderTroops();
    const card = document.querySelector('.troop-card:not(.ability)') as HTMLElement;
    card.dispatchEvent(new PointerEvent('pointerdown'));
    await new Promise((r) => setTimeout(r, 650));
    expect(document.querySelector('#battle-hud .toast')?.textContent).toContain(data.troops.beetle_brute.name);
  });
});
