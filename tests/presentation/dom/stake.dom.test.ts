// @vitest-environment happy-dom
/**
 * P6-13 (UIS-05, UIS-07): a stake is never declared blind. Choosing one puts its downside right under the chips and
 * opens the drawer the first time on a device; the staked star is marked during the fight; a raid army under the
 * full share says so at scouting.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { BattleHud } from '../../../src/presentation/ui/battleHud';

let hud: BattleHud | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => {
  hud?.destroy();
  hud = null;
});

function scout(carryShare?: number) {
  document.body.innerHTML = '<div id="battle-hud"></div>';
  const session = new BattleSession({ seed: 3, base: generateOpponent(77, 5, data), army: { beetle_brute: 5 }, levels: { beetle_brute: 1 }, infiltration: true }, data, 'scout');
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
    onFinished: () => null,
    stakes: true,
    carryShare,
  });
  (hud as unknown as { renderScout(): void }).renderScout();
  return session;
}

describe('stakes are read before they are declared (P6-13)', () => {
  it('choosing a stake shows its downside under the chips and opens the drawer once per device', () => {
    scout();
    expect(document.querySelector('[data-id="stake-help"]')).toBeNull();
    (document.querySelector('[data-id="stake-2"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-id="stake-help"]')?.textContent).toMatch(/miss it and carry none/);
    expect((document.getElementById('scout-more') as HTMLElement).hidden).toBe(false);
    // A second raid on the same device: the line still shows, the drawer stays as the player left it.
    scout();
    (document.querySelector('[data-id="stake-2"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-id="stake-help"]')).not.toBeNull();
    expect((document.getElementById('scout-more') as HTMLElement).hidden).toBe(true);
  });

  it('the staked star is marked in the fight', () => {
    const session = scout();
    (document.querySelector('[data-id="stake-2"]') as HTMLButtonElement).click();
    session.start();
    (hud as unknown as { tick(): void }).tick();
    const stars = [...document.querySelectorAll('.b-stars .star')];
    expect(stars.map((s) => s.classList.contains('staked'))).toEqual([false, true, false]);
  });

  it('the carry share shows at scouting when under 100%, and not at 100%', () => {
    scout(0.85);
    expect(document.querySelector('[data-id="carry-preview"]')?.textContent).toContain('85');
    scout(1);
    expect(document.querySelector('[data-id="carry-preview"]')).toBeNull();
  });
});
