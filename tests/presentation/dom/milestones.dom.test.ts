// @vitest-environment happy-dom
/**
 * P6-08 (UIS-06, BNL-08, PLY-12): moments that had no moment. A milestone card for a Keep level (with what it
 * unlocks, before any offer), a league change, the hero at his Keep and tempering; once each, by device; the first
 * look at a village is silent. The hero has a card in the Army panel and the Codex.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { milestonesDue, saveMarks } from '../../../src/presentation/ui/unlockCeremony';
import { buildHud } from './harness';

beforeEach(() => localStorage.clear());

describe('milestones (P6-08)', () => {
  it('milestonesDue: silent the first time; Keep, hero, tempering and league in order', () => {
    const now = { league: 'silver', keep: 7, hero: true, temper: true };
    expect(milestonesDue(null, now)).toEqual([]);
    expect(milestonesDue({ league: 'bronze', keep: 6, hero: false, temper: true }, now)).toEqual(['keep', 'hero', 'league']);
    expect(milestonesDue(now, now)).toEqual([]);
  });

  it('a Keep level shows its card, and an offer the same moment waits until the card is gone', async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    const hall = controller.state.buildings.find((b) => controller.data.buildings[b.type].category === 'hall')!;
    saveMarks({ league: 'unranked', keep: 1, hero: false, temper: false });
    hall.level = 2;
    let offered = 0;
    (hud as unknown as { afterMilestones(fn: () => void): void }).afterMilestones(() => void offered++);
    const card = document.querySelector('[data-id="milestone"]');
    expect(card?.textContent).toContain('Clan Keep Lv 2!');
    expect(offered).toBe(0);
    (card as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 400));
    // The league line may follow (the marks said "unranked"); close whatever is left.
    for (let i = 0; i < 3 && document.querySelector('[data-id="milestone"]'); i++) {
      (document.querySelector('[data-id="milestone"]') as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(offered).toBe(1);
  });

  it('the hero has a card in the Army panel from his Keep', async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    const hall = controller.state.buildings.find((b) => controller.data.buildings[b.type].category === 'hall')!;
    hall.level = controller.data.battle.heroes!.shadow_captain.unlockKeep;
    hud.openShortcut('army');
    (document.querySelector('.army-tabs button:nth-child(2)') as HTMLButtonElement)?.click();
    expect(document.querySelector('[data-id="hero-card"]')?.textContent).toContain('Rally');
  });
});
