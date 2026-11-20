// @vitest-environment happy-dom
/**
 * P6-01 (CMB-09, UIS-03): squad orders on screen. A full raid in three taps (Attack, a formation, a ring); Hold with
 * the waiting count while a squad goes in; the choice is remembered on the device; the hero and Smoke stay by hand.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { BattleHud } from '../../../src/presentation/ui/battleHud';

let hud: BattleHud | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => {
  hud?.destroy();
  hud = null;
});

const army = { beetle_brute: 6, hedgehog_roller: 10, owl_bomber: 2 };

function battle() {
  document.body.innerHTML = '<div id="battle-hud"></div>';
  const session = new BattleSession({ seed: 5, base: generateOpponent(321, 6, data), army, levels: { beetle_brute: 2, hedgehog_roller: 2, owl_bomber: 2 }, infiltration: true }, data, 'scout');
  hud = new BattleHud({
    root: document.getElementById('battle-hud')!,
    session,
    myTrophies: 400,
    troopThumb: () => null,
    scoutFee: 0,
    canPayFee: () => true,
    onHome: () => undefined,
    onNext: () => undefined,
    // As app.ts does: the battle starts when Attack goes through.
    onAttack: () => {
      session.start();
      return true;
    },
    onReplay: () => undefined,
    onFinished: () => null,
  });
  const hooks = hud.hooks();
  const tick = () => (hud as unknown as { tick(): void }).tick();
  return { session, hooks, tick };
}

const click = (id: string) => (document.querySelector(`[data-id="${id}"]`) as HTMLButtonElement).click();

describe('squad orders on screen (P6-01)', () => {
  it('a full raid in three taps, recorded so it replays to the same result', async () => {
    const { session, hooks, tick } = battle();
    // Tap 1: Attack.
    (document.querySelector('.big-attack') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(session.mode).toBe('live');
    tick();
    // Tap 2: a formation.
    click('squad-together');
    // Tap 3: a ring.
    expect(hooks.squadTap!(0)).toBeGreaterThan(0);
    for (let i = 0; i < 6000 && !session.sim.ended; i++) session.update(100);
    const sent = session.deployments.length;
    expect(sent).toBeGreaterThan(0);
    expect(runBattle(structuredClone(session.setup), session.deployments, data).result.hash).toBe(session.result().hash);
  });

  it('shows Hold with the waiting count while the squad goes in, and Hold stops the rest', () => {
    const { session, hooks, tick } = battle();
    session.start();
    tick();
    click('squad-file');
    hooks.squadTap!(1);
    tick();
    const hold = document.querySelector('[data-id="squad-hold"]');
    expect(hold?.textContent).toMatch(/waiting/);
    expect(hold?.textContent).toContain(String(session.squadWaiting));
    click('squad-hold');
    expect(session.squadWaiting).toBe(0);
    tick();
    expect(document.querySelector('[data-id="squad-hold"]')).toBeNull();
  });

  it('a disarmed formation leaves ring taps to hand placement; the choice is remembered on the device', () => {
    const { session, hooks, tick } = battle();
    session.start();
    tick();
    expect(hooks.squadTap!(0)).toBe(0);
    click('squad-pincer');
    click('squad-order');
    expect(JSON.parse(localStorage.getItem('tk.squad')!)).toEqual({ formation: 'pincer', order: 'rush' });
    hud!.destroy();
    const again = battle();
    again.session.start();
    again.tick();
    expect(document.querySelector('[data-id="squad-pincer"]')?.getAttribute('aria-pressed')).toBe('true');
    // A second tap disarms it.
    click('squad-pincer');
    expect(again.hooks.squadTap!(0)).toBe(0);
  });
});
