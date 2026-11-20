// @vitest-environment happy-dom
/**
 * P6-06 (UIS-11): the Trials panel shows a ladder (cleared tiers, ten beyond the next with layout and modifiers, the
 * Jade-paying tiers marked) and a stepper replays any cleared tier, not only the best.
 */
import { describe, expect, it } from 'vitest';
import { trialReward } from '../../../src/gameplay/sim/trials';
import { buildHud } from './harness';

describe('the Trials ladder (P6-06)', () => {
  it('ten tiers ahead, Jade marked, and a stepper over cleared tiers', async () => {
    const { hud, controller } = await buildHud();
    controller.state.trials.best = 5;
    const tiers: number[] = [];
    (hud as unknown as { deps: { onTrial(t: number): void } }).deps.onTrial = (t) => void tiers.push(t);
    hud.openTrials();
    const ladder = document.querySelector('[data-id="trial-ladder"]')!;
    const steps = ladder.querySelectorAll('.trial-step');
    expect(steps.length).toBe(10);
    expect(ladder.textContent).toContain('Cleared: tiers 1 to 5');
    const jadeTiers = [...steps].filter((r) => r.querySelector('.chip.good')).length;
    let expected = 0;
    for (let t = 7; t <= 16; t++) if ((trialReward(t, controller.data).moonstones ?? 0) > 0) expected++;
    expect(jadeTiers).toBe(expected);
    (document.querySelector('[data-id="trial-down"]') as HTMLButtonElement).click();
    (document.querySelector('[data-id="trial-down"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-id="trial-replay"]')!.textContent).toContain('3');
    (document.querySelector('[data-id="trial-replay"]') as HTMLButtonElement).click();
    expect(tiers).toEqual([3]);
  });
});
