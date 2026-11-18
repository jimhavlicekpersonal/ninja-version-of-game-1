// @vitest-environment happy-dom
/**
 * P6-17 (playthrough opportunity 1): with the camps empty, Attack offers what needs no standing army (the daily drill, a
 * "Try" battle) and, while warriors are training, the next Trial tier beside the retrain countdown. With an army it
 * scouts at once as before.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildHud } from './harness';

async function village(opts: { army?: boolean; training?: boolean } = {}) {
  const env = await buildHud();
  const { controller } = env;
  controller.dispatch({ type: 'tutorial', step: 9, done: true });
  const at = controller.state.buildings[0];
  controller.state.buildings.push(
    { id: 'dojo-t', type: 'burrow_barracks', level: 2, x: at.x + 6, y: at.y + 6, upgrade: null, collector: null } as never,
    { id: 'camp-t', type: 'army_camp', level: 2, x: at.x + 10, y: at.y + 6, upgrade: null, collector: null } as never,
  );
  if (opts.army) controller.state.army = { beetle_brute: 3 };
  if (opts.training) controller.state.training.push({ troop: 'beetle_brute', startedAt: controller.now(), endsAt: controller.now() + 120_000 } as never);
  const onAttack = vi.fn();
  (env.hud as unknown as { deps: { onAttack(): void; onDrill?(): void } }).deps.onAttack = onAttack;
  return { ...env, onAttack };
}

const attack = () => (document.querySelector('[data-id="attack"]') as HTMLButtonElement).click();
const labels = () => [...document.querySelectorAll('.modal-backdrop:last-child .modal-foot button')].map((b) => b.textContent);

describe('empty camps (P6-17)', () => {
  it('with an army, Attack scouts at once', async () => {
    const { onAttack } = await village({ army: true });
    attack();
    expect(onAttack).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.empty-camp')).toBeNull();
  });

  it('with empty camps, Attack offers Try and Scout anyway; Scout anyway still scouts', async () => {
    const { onAttack } = await village();
    attack();
    expect(onAttack).not.toHaveBeenCalled();
    expect(labels()).toEqual(expect.arrayContaining(['Try', 'Scout anyway']));
    ([...document.querySelectorAll('.modal-backdrop:last-child .modal-foot button')].find((b) => b.textContent === 'Scout anyway') as HTMLButtonElement).click();
    expect(onAttack).toHaveBeenCalledTimes(1);
  });

  it('while warriors train, the next Trial tier is offered beside the countdown', async () => {
    await village({ training: true });
    attack();
    expect(labels().some((l) => /^Scout tier \d+$/.test(l ?? ''))).toBe(true);
    expect(document.querySelector('.empty-camp .chip')?.textContent).toMatch(/\d/);
  });
});
