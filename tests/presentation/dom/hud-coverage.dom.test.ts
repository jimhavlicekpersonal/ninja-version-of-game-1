// @vitest-environment happy-dom
/**
 * P6-15 (UIS-09), the rest: the results dialog for each kind of battle, and the objective chip's action for every
 * objective kind, built on a real GameController with stub dependencies.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { BattleResult } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import * as objective from '../../../src/gameplay/sim/objective';
import { BattleHud } from '../../../src/presentation/ui/battleHud';
import { buildHud } from './harness';

let bh: BattleHud | null = null;
afterEach(() => {
  bh?.destroy();
  bh = null;
  vi.restoreAllMocks();
});

const res = (stars: number): BattleResult => ({ stars, destruction: 55, loot: { acorns: 900 }, used: { beetle_brute: 2 }, hash: 'h', hallDestroyed: false, ticks: 900, endReason: 'time' }) as unknown as BattleResult;

function results(kind: 'raid' | 'pending' | 'trial' | 'practice' | 'bounty' | 'rematch'): string {
  document.body.innerHTML = '<div id="battle-hud"></div>';
  const session = new BattleSession({ seed: 3, base: generateOpponent(77, 5, data), army: { beetle_brute: 2 }, levels: { beetle_brute: 1 }, infiltration: true }, data, 'live');
  const out =
    kind === 'pending' ? { result: res(2), banked: {}, trophies: 0, pending: true }
      : kind === 'practice' ? { result: res(2), banked: {}, trophies: 0, note: 'Practice battle: no warriors were spent and nothing was won.' }
        : kind === 'trial' ? { result: res(3), banked: { acorns: 4000 }, trophies: 0, note: 'Shadow Trial 3 cleared!' }
          : kind === 'bounty' || kind === 'rematch' ? { result: res(2), banked: { acorns: 1000 }, trophies: 0, note: kind === 'bounty' ? 'New bounty progress: each reward is paid once.' : 'Score settled!' }
            : { result: res(2), banked: { acorns: 900 }, trophies: 12 };
  bh = new BattleHud({
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
    practice: kind === 'practice',
    trial: kind === 'trial' ? { tier: 3, layout: 'x', modifiers: [], reward: { acorns: 4000 }, firstClear: true, starsToClear: 2 } : undefined,
    special: kind === 'bounty' || kind === 'rematch' ? { title: kind } : undefined,
  });
  session.surrender();
  (bh as unknown as { tick(): void }).tick();
  return document.querySelector('.modal-backdrop:last-child')?.textContent ?? '';
}

describe('the results dialog for every kind of battle (P6-15)', () => {
  it('a raid shows loot and honor', () => expect(results('raid')).toMatch(/Loot:.*Honor:/s));
  it('a pending raid says it is confirming with the server, and shows no honor', () => {
    const t = results('pending');
    expect(t).toMatch(/confirming with the server/i);
    expect(t).not.toMatch(/Honor:/);
  });
  it('a Trial shows its reward, no honor', () => {
    const t = results('trial');
    expect(t).toMatch(/Reward:/);
    expect(t).not.toMatch(/Honor:/);
  });
  it('a practice battle shows what it would have won and says nothing was spent', () => expect(results('practice')).toMatch(/nothing was won.*would have won/s));
  it('a Bounty and a rematch show their reward and note', () => {
    expect(results('bounty')).toMatch(/bounty.*Reward:/s);
    expect(results('rematch')).toMatch(/Score settled.*Reward:/s);
  });
});

describe("the objective chip's action for every kind (P6-15)", () => {
  const kinds: [objective.Objective, (calls: string[]) => void][] = [
    [{ kind: 'chest' }, (c) => expect(c).toContain('daily')],
    [{ kind: 'raid' }, (c) => expect(c).toContain('attack')],
    [{ kind: 'claim', what: 'pass' }, (c) => expect(c).toContain('pass')],
    [{ kind: 'claim', what: 'achievement' }, (c) => expect(c).toContain('goals')],
    [{ kind: 'rematch', defenseId: 'd' }, (c) => expect(c).toContain('log')],
    [{ kind: 'goalEvent', eventKey: 'e', goal: 'gauntlet' }, (c) => expect(c).toContain('events')],
    [{ kind: 'trial', tier: 4 }, (c) => expect(c).toContain('trials')],
    [{ kind: 'drill' }, (c) => expect(c).toContain('drill')],
    [{ kind: 'defendSide', point: 'C' }, (c) => expect(c).toContain('log')],
    [{ kind: 'research', troop: 'beetle_brute', toLevel: 2, lanesFree: 1 }, (c) => expect(c).toContain('army')],
    [{ kind: 'train', space: 10, troop: 'beetle_brute' }, (c) => expect(c).toContain('army')],
  ];
  for (const [o, check] of kinds) {
    it(`${o.kind}${'what' in o ? `/${o.what}` : ''}`, async () => {
      const { hud, controller } = await buildHud();
      controller.dispatch({ type: 'tutorial', step: 9, done: true });
      const calls: string[] = [];
      const inner = hud as unknown as Record<string, unknown> & { deps: Record<string, unknown>; econ: Record<string, unknown>; daily: Record<string, unknown>; renderObjective(force?: boolean): void };
      inner.deps.onAttack = () => calls.push('attack');
      inner.deps.onDrill = () => calls.push('drill');
      inner.econ.openPass = () => calls.push('pass');
      inner.econ.openGoals = () => calls.push('goals');
      inner.daily.openDaily = () => calls.push('daily');
      inner.daily.openEvents = () => calls.push('events');
      inner.openLog = () => calls.push('log');
      inner.openTrials = () => calls.push('trials');
      inner.openTraining = () => calls.push('army');
      vi.spyOn(objective, 'nextObjective').mockReturnValue(o);
      inner.renderObjective(true);
      (document.querySelector('.objective-chip') as HTMLButtonElement).click();
      check(calls);
    });
  }
});
