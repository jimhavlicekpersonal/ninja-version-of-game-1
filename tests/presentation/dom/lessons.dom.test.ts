// @vitest-environment happy-dom
/** Sensei's lessons (2026-11-25): the tutorial's second chapter, after the nine guided steps, kept on the device. */
import { beforeEach, describe, expect, it } from 'vitest';
import { LESSON_IDS, Tutorial } from '../../../src/presentation/ui/tutorial';
import { buildHud } from './harness';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};
const bubble = () => document.querySelector('.tut-bubble') as HTMLElement;
const stepLabel = () => bubble().querySelector('.tut-step')?.textContent ?? '';
const press = () => (bubble().querySelector('.tut-actions .btn.primary') as HTMLButtonElement).click();
const stored = () => JSON.parse(localStorage.getItem('tk.lessons') ?? 'null') as { step: number; done: boolean } | null;

beforeEach(() => localStorage.clear());

describe("Sensei's lessons", () => {
  it('follow the last guided step, run through every lesson with a button, and end', async () => {
    const { controller, analytics } = await buildHud();
    const tut = new Tutorial(controller, analytics, document.body);
    controller.dispatch({ type: 'tutorial', step: 8, done: false });
    tut.start();
    expect(stepLabel()).toContain('9');
    press();
    // The first chapter is done in the save; the lessons start on the device.
    expect(controller.state.tutorial).toEqual({ step: 9, done: true });
    expect(stored()).toEqual({ step: 0, done: false });
    expect(LESSON_IDS.length).toBeGreaterThanOrEqual(15);
    for (let i = 0; i < LESSON_IDS.length; i++) {
      expect(bubble().hidden, LESSON_IDS[i]).toBe(false);
      expect(stepLabel(), LESSON_IDS[i]).toBe(`Lesson ${i + 1} of ${LESSON_IDS.length}`);
      expect(bubble().querySelector('.tut-body p:not(.tut-step)')?.textContent?.length, LESSON_IDS[i]).toBeGreaterThan(10);
      press();
    }
    expect(stored()).toEqual({ step: LESSON_IDS.length, done: true });
    expect(bubble().hidden).toBe(true);
    // The first chapter's progress was never touched by the lessons.
    expect(controller.state.tutorial).toEqual({ step: 9, done: true });
  });

  it('a lesson whose task is already done moves on by itself', async () => {
    const { controller, analytics } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    const troop = Object.keys(controller.data.troops)[0];
    controller.dispatch({ type: 'saveArmyPreset', name: 'Raid A', army: { [troop]: 3 } });
    const at = LESSON_IDS.indexOf('saveArmy');
    localStorage.setItem('tk.lessons', JSON.stringify({ step: at, done: false }));
    const tut = new Tutorial(controller, analytics, document.body);
    tut.start();
    expect(stepLabel()).toBe(`Lesson ${at + 1} of ${LESSON_IDS.length}`);
    await new Promise((r) => setTimeout(r, 450));
    expect(stored()?.step).toBe(at + 1);
  });

  it('skipping asks, and skipping the first chapter skips the lessons too', async () => {
    const { controller, analytics } = await buildHud();
    const tut = new Tutorial(controller, analytics, document.body, async () => true);
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    tut.start();
    expect(stepLabel()).toContain('Lesson 1');
    (document.querySelector('[data-id="lessons-skip"]') as HTMLButtonElement).click();
    await settle();
    expect(stored()?.done).toBe(true);
    expect(bubble().hidden).toBe(true);

    localStorage.clear();
    controller.dispatch({ type: 'tutorial', step: 3, done: false });
    tut.start();
    (document.querySelector('[data-id="tutorial-skip"]') as HTMLButtonElement).click();
    await settle();
    expect(controller.state.tutorial.done).toBe(true);
    expect(stored()?.done).toBe(true);
    expect(bubble().hidden).toBe(true);
  });

  it('start by themselves only for a young village, and replay from Settings for any village', async () => {
    const { controller, analytics } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    controller.state.buildings.find((b) => b.type === 'elder_toadstool')!.level = 6;
    const tut = new Tutorial(controller, analytics, document.body);
    tut.start();
    expect(bubble().hidden).toBe(true);
    expect(stored()).toBeNull();
    tut.restartLessons();
    expect(bubble().hidden).toBe(false);
    expect(stepLabel()).toContain('Lesson 1');
  });
});
