// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 ECO-08: the Keep's Jade finish confirm warns when the army is more than a Keep behind. */
import { describe, expect, it } from 'vitest';
import { armyBehindKeep } from '../../../src/gameplay/sim/objective';
import { buildHud } from './harness';

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('rushing the Keep with Jade (ECO-08)', () => {
  it('the spend confirm carries the warning when the army is behind, and not otherwise', async () => {
    const { hud, controller } = await buildHud();
    type Host = { keepRushNote(c: string): string | undefined; econ: { spendMoonstones(t: string, w: string, j: number, run: () => boolean, note?: string): Promise<void> } };
    const host = hud as unknown as Host;
    expect(armyBehindKeep(controller.state, controller.data)).toBe(false);
    expect(host.keepRushNote('hall')).toBeUndefined();
    const keep = controller.state.buildings.find((b) => controller.data.buildings[b.type]?.category === 'hall')!;
    // Level 1 Shinobi at a Keep 6: research reads 1.5 Keeps behind (as in return-hooks.test.ts P3-09).
    controller.state.army = { hedgehog_roller: 20 };
    keep.level = 6;
    expect(armyBehindKeep(controller.state, controller.data)).toBe(true);
    const note = host.keepRushNote('hall');
    expect(note).toMatch(/more than a Keep behind/);
    expect(host.keepRushNote('defense')).toBeUndefined();
    controller.state.resources.moonstones = 500;
    void host.econ.spendMoonstones('Finish now', 'Finish the Keep now', 10, () => true, note);
    await settle();
    expect(document.querySelector('.modal-backdrop:not(.out) .keep-rush')?.textContent).toMatch(/more than a Keep behind/);
  });
});
