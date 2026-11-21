// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 UX-08: an in-game text size, applied before the first paint and to canvas labels. */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { scaledPx, setTextScale, textScale } from '../../../src/presentation/render/textScale';
import { buildHud } from './harness';

afterEach(() => {
  localStorage.removeItem('tk.textScale');
  document.documentElement.style.fontSize = '';
});

describe('text size', () => {
  it('persists, sets the root font size (the HUD is rem) and scales canvas label sizes', () => {
    expect(textScale()).toBe(1);
    setTextScale(1.3);
    expect(localStorage.getItem('tk.textScale')).toBe('1.3');
    expect(document.documentElement.style.fontSize).toBe('130%');
    expect(scaledPx(15)).toBe('20px');
    setTextScale(2); // not offered: back to 100 %
    expect(textScale()).toBe(1);
    expect(document.documentElement.style.fontSize).toBe('');
  });

  it('the boot guard applies it before the game module runs (the splash follows too)', () => {
    const boot = readFileSync('src/backend/pwa/boot.js', 'utf8');
    const at = boot.indexOf("w.localStorage.getItem('tk.textScale')");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(boot.indexOf('function tr('));
    expect(boot).toMatch(/textScale === 1\.15 \|\| textScale === 1\.3/);
  });

  it('canvas labels use scaledPx', () => {
    for (const f of ['src/presentation/render/BattleScene.ts', 'src/presentation/render/VillageScene.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('scaledPx(');
      expect(src, f).not.toMatch(/fontSize: '\d+px'/);
    }
  });

  it('Settings offers 100, 115 and 130 % and stores the choice', async () => {
    const { hud } = await buildHud();
    (hud as unknown as { openSettings(): void }).openSettings();
    let sel: HTMLSelectElement | null = null;
    for (let i = 0; i < 50 && !(sel = document.querySelector<HTMLSelectElement>('[data-id="text-size"]')); i++) await new Promise((r) => setTimeout(r, 10));
    expect([...sel!.options].map((o) => o.value)).toEqual(['1', '1.15', '1.3']);
    sel!.value = '1.15';
    sel!.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('tk.textScale')).toBe('1.15');
    expect(document.documentElement.style.fontSize).toBe('115%');
  });
});
