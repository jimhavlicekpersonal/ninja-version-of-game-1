// @vitest-environment happy-dom
/**
 * Beast Mode 2026-11-21 UX-04: "Reduce screen shake and flashes" in Settings, honoured with the OS reduced-motion
 * flag or the switch. Phaser cannot run here, so the battle effects are checked by reading their guards.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calmEffects, reduceEffectsChoice, setReduceEffects } from '../../../src/presentation/render/motion';
import { buildHud } from './harness';

afterEach(() => {
  localStorage.removeItem('tk.reduceEffects');
  document.documentElement.classList.remove('calm');
  vi.unstubAllGlobals();
});

describe('calm effects', () => {
  it('follow the OS reduced-motion flag or the switch, and the switch survives a reload (localStorage)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(calmEffects()).toBe(false);
    setReduceEffects(true);
    expect(localStorage.getItem('tk.reduceEffects')).toBe('1');
    expect(reduceEffectsChoice()).toBe(true);
    expect(calmEffects()).toBe(true);
    expect(document.documentElement.classList.contains('calm')).toBe(true);
    setReduceEffects(false);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(calmEffects()).toBe(true);
  });

  it('every screen shake, the slow-motion moment and the additive flashes are behind calmEffects()', () => {
    for (const f of ['src/presentation/render/BattleScene.ts', 'src/presentation/render/fx.ts']) {
      const src = readFileSync(f, 'utf8');
      for (const line of src.split('\n').filter((l) => l.includes('cameras.main.shake('))) expect(line, f).toMatch(/!calm(Effects\(\))?\)/);
    }
    expect(readFileSync('src/presentation/render/BattleScene.ts', 'utf8')).toMatch(/if \(!calmEffects\(\)\) this\.slowUntil = /);
    const fx = readFileSync('src/presentation/render/fx.ts', 'utf8');
    const collapse = fx.slice(fx.indexOf('export function keepCollapse'), fx.indexOf('export function', fx.indexOf('export function keepCollapse') + 10));
    expect(collapse).toMatch(/if \(calm\) flash\.setAlpha\(0\.5\);\s*else flash\.setBlendMode\(Phaser\.BlendModes\.ADD\)/);
    const slam = fx.slice(fx.indexOf('export function starSlam'), fx.indexOf('// ----', fx.indexOf('export function starSlam')));
    expect(slam).toMatch(/if \(!calmEffects\(\)\) \{\s*const ring/);
  });

  it('Settings has the switch and it persists', async () => {
    const { hud } = await buildHud();
    (hud as unknown as { openSettings(): void }).openSettings();
    let box: HTMLInputElement | null = null;
    for (let i = 0; i < 50 && !(box = document.querySelector<HTMLInputElement>('[data-id="reduce-effects"]')); i++) await new Promise((r) => setTimeout(r, 10));
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(false);
    expect(box!.closest('label')!.textContent).toContain('Reduce screen shake and flashes');
    box!.checked = true;
    box!.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('tk.reduceEffects')).toBe('1');
  });
});
