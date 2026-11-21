// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 UX-09: deleting a saved army asks first; Cancel keeps it. */
import { describe, expect, it } from 'vitest';
import { buildHud } from './harness';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

describe('saved army delete (UX-09)', () => {
  it('asks before deleting; Cancel keeps the preset, Remove deletes it', async () => {
    const { hud, controller } = await buildHud();
    const troop = Object.keys(controller.data.troops)[0];
    expect(controller.dispatch({ type: 'saveArmyPreset', name: 'Raid A', army: { [troop]: 3 } }).ok).toBe(true);
    (hud as unknown as { openTraining(): void }).openTraining();
    await settle();
    const armyTab = [...document.querySelectorAll<HTMLButtonElement>('.army-tabrow button')].find((b) => /Army/.test(b.textContent ?? ''));
    armyTab!.click();
    await settle();
    const del = () => [...document.querySelectorAll<HTMLButtonElement>('button[aria-label]')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Delete saved army'));
    del()!.click();
    await settle();
    expect(controller.state.armyPresets).toHaveLength(1);
    const dialogButton = (re: RegExp) => [...document.querySelectorAll<HTMLButtonElement>('.modal-backdrop:not(.out) button')].reverse().find((b) => re.test(b.textContent ?? ''));
    dialogButton(/^Cancel$/)!.click();
    await settle();
    expect(controller.state.armyPresets.map((p) => p.name)).toEqual(['Raid A']);
    del()!.click();
    await settle();
    dialogButton(/^Remove$/)!.click();
    await settle();
    expect(controller.state.armyPresets).toHaveLength(0);
  });
});
