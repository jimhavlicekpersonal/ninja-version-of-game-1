// @vitest-environment happy-dom
/**
 * P6-12 (P2-14): the garrison crew is a second, named queue where the artisans are shown: the builders pill opens a
 * panel with both, the pill shows the crew's free places once it has worked, and its first build gets one line.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { crewStatus } from '../../../src/gameplay/sim/village';
import { buildHud } from './harness';

beforeEach(() => localStorage.clear());

describe('the garrison crew on screen (P6-12)', () => {
  it('the builders pill opens a panel with the artisans and the garrison crew', async () => {
    const { controller } = await buildHud();
    (document.querySelector('[data-id="builders"]') as HTMLButtonElement).click();
    const panel = document.querySelector('.builders-panel')!;
    const crew = crewStatus(controller.state, controller.data, controller.now());
    expect(crew.total).toBeGreaterThan(0);
    expect(panel.textContent).toContain(`Garrison crew ${crew.free}/${crew.total}`);
  });

  it('a crew build shows the badge and the one-time line; the panel lists it under the crew', async () => {
    const { hud, controller } = await buildHud();
    const at = controller.state.buildings[0];
    const tower = Object.keys(controller.data.buildings).find((k) => controller.data.buildings[k].category === 'defense')!;
    controller.state.buildings.push({ id: 'tw', type: tower, level: 1, x: at.x + 8, y: at.y + 8, upgrade: { startedAt: controller.now(), endsAt: controller.now() + 600_000, toLevel: 2 }, collector: null } as never);
    (hud as unknown as { refresh(): void }).refresh();
    const badge = document.querySelector('.crew-badge') as HTMLElement;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toMatch(/\d\/\d/);
    expect(document.querySelector('.toast')?.textContent).toMatch(/garrison crew/);
    expect(localStorage.getItem('tk.crewSeen')).toBe('1');
    (document.querySelector('[data-id="builders"]') as HTMLButtonElement).click();
    const panel = document.querySelector('.builders-panel')!;
    const name = controller.data.buildings[tower].name;
    const crewHead = [...panel.querySelectorAll('h3')][1];
    expect(crewHead.textContent).toMatch(/Garrison crew/);
    // The tower's row comes after the crew heading.
    const rows = [...panel.children];
    expect(rows.findIndex((e) => e.textContent?.includes(name))).toBeGreaterThan(rows.indexOf(crewHead));
  });
});
