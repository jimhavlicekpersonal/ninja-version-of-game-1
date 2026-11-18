// @vitest-environment happy-dom
/**
 * P6-14 (UIS-08): side modes can be found. Trials has its own icon; the Honor pill is a labelled button; the
 * calendar sits above the odds table; a rail button that appears is introduced once per device.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { icons } from '../../../src/presentation/ui/icons';
import { buildHud } from './harness';

beforeEach(() => localStorage.clear());

describe('side modes can be found (P6-14)', () => {
  it('Trials has its own icon and the Honor pill is a labelled button', async () => {
    await buildHud();
    expect(icons.trials).not.toBe(icons.leaf);
    const honor = document.querySelector('[data-id="honor"]')!;
    expect(honor.tagName).toBe('BUTTON');
    expect(honor.getAttribute('aria-label')).toBeTruthy();
  });

  it('the calendar comes before the odds table in the Daily panel', async () => {
    const { hud, controller } = await buildHud();
    controller.dispatch({ type: 'tutorial', step: 9, done: true });
    hud.openShortcut('daily');
    const body = document.querySelector('.daily')!;
    const heads = [...body.querySelectorAll('h3')].map((x) => x.textContent ?? '');
    const odds = heads.findIndex((x) => /odds/i.test(x));
    const kids = [...body.children];
    const cal = kids.findIndex((e) => e.classList.contains('calendar'));
    expect(odds).toBeGreaterThan(-1);
    expect(cal).toBeGreaterThan(-1);
    expect(cal).toBeLessThan(kids.indexOf(body.querySelectorAll('h3')[odds]));
  });

  it('a rail button that appears is introduced once per device, not one the village already had', async () => {
    const { hud, controller } = await buildHud();
    // Trials appears after the first raid or Trial: before that it is hidden.
    expect((document.querySelector('[data-id="trials"]') as HTMLElement).hidden).toBe(true);
    controller.state.trials.best = 1;
    (hud as unknown as { refresh(): void }).refresh();
    expect(document.querySelector('[data-id="trials"] .rail-intro')?.textContent).toBe('Trials');
    expect(JSON.parse(localStorage.getItem('tk.railSeen')!)).toContain('Trials');
  });
});
