// @vitest-environment happy-dom
/**
 * P6-03: the battle log and the welcome-back screen say what holding saved: kept share, stars denied, the point the
 * raider used, and (on demand, replayed under the same rules) the first buildings to fall.
 */
import { describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import type { BattleRecord } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { buildHud } from './harness';

function record(at: number, rules?: number): BattleRecord {
  const setup = { seed: 9, base: generateOpponent(4242, 6, data), army: { beetle_brute: 8, hedgehog_roller: 20 }, levels: { beetle_brute: 3, hedgehog_roller: 3 }, infiltration: true };
  const s = new BattleSession(structuredClone(setup), data, 'live');
  s.orderSquad({ point: 2, formation: 'file', order: 'tanks' });
  for (let i = 0; i < 6000 && !s.sim.ended; i++) s.update(100);
  return { id: `d${at}`, kind: 'defense', at, opponentName: 'Raider', setup, deployments: s.deployments, result: s.result(), rules, simulated: true, banked: { acorns: 500 } };
}

describe('the defense report on screen (P6-03)', () => {
  it('the battle log: kept, denied, entry, and First to fall replayed on demand', async () => {
    const { hud, controller } = await buildHud();
    controller.state.defenseLog = [record(controller.now() - 60_000, SIM_RULES)];
    hud.openLog();
    const line = document.querySelector('[data-id="defense-report"]')!;
    expect(line.textContent).toMatch(/Kept \d+%/);
    expect(line.textContent).toContain('In through C');
    (line.querySelector('button') as HTMLButtonElement).click();
    expect(line.textContent).toMatch(/First to fall: /);
  });

  it('a record under older rules has no First to fall button', async () => {
    const { hud, controller } = await buildHud();
    controller.state.defenseLog = [record(controller.now() - 60_000, SIM_RULES - 1)];
    hud.openLog();
    expect(document.querySelector('[data-id="defense-report"] button')).toBeNull();
  });

  it('the welcome-back line leads with what holding saved and the reward', async () => {
    const { hud, controller } = await buildHud();
    const r = record(controller.now() - 60_000, SIM_RULES);
    hud.showWelcomeBack({ awayMs: 3_600_000, finished: [], trained: {}, collectorGains: {}, raids: [r], seasons: [] });
    const line = document.querySelector('.welcome [data-id="defense-report"]')!;
    expect(line.textContent).toMatch(/Kept \d+%/);
    expect(line.textContent).toContain('Held');
  });
});

describe('test my defenses on screen (P6-04)', () => {
  it('the battle log offers the test, and practice against the army of a lost defense', async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    let tested = 0;
    let against: BattleRecord | null = null;
    const deps = (hud as unknown as { deps: { onTestDefense?(): void; onPracticeAgainst?(r: BattleRecord): void } }).deps;
    deps.onTestDefense = () => void tested++;
    deps.onPracticeAgainst = (r) => void (against = r);
    const lost = record(controller.now() - 60_000, SIM_RULES);
    controller.state.defenseLog = [{ ...lost, result: { ...lost.result, stars: Math.max(1, lost.result.stars) } }];
    hud.openLog();
    (document.querySelector('[data-id="practice-against"]') as HTMLButtonElement).click();
    expect(against!.id).toBe(lost.id);
    hud.openLog();
    (document.querySelector('[data-id="test-defense"]') as HTMLButtonElement).click();
    expect(tested).toBe(1);
  });
});

describe('the test raid replay is labelled practice (review M3)', () => {
  it('its header never says loot was taken', async () => {
    const { BattleHud } = await import('../../../src/presentation/ui/battleHud');
    document.body.innerHTML = '<div id="battle-hud"></div>';
    const r = record(Date.now(), SIM_RULES);
    const session = new BattleSession(structuredClone(r.setup), data, 'replay', r);
    const bh = new BattleHud({ root: document.getElementById('battle-hud')!, session, myTrophies: 0, replayOf: { kind: 'defense', opponentName: 'Test raid', test: true }, troopThumb: () => null, scoutFee: 0, canPayFee: () => true, onHome: () => undefined, onNext: () => undefined, onAttack: () => true, onReplay: () => undefined, onFinished: () => null });
    const text = document.getElementById('battle-hud')!.textContent ?? '';
    expect(text).not.toMatch(/loot taken/i);
    expect(document.querySelector('[data-id="opponent-kind"]')?.textContent).toBe('Practice');
    bh.destroy();
  });
});
