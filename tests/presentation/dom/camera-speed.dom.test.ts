// @vitest-environment happy-dom
/** Settings → Graphics: map drag speed and zoom speed, per device, used by the village and battle cameras. */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { panSpeed, pinchFactor, resetCameraSpeedCache, setPanSpeed, setZoomSpeed, zoomSpeed, zoomStep } from '../../../src/presentation/render/cameraSpeed';
import { buildHud } from './harness';

afterEach(() => {
  localStorage.removeItem('tk.panSpeed');
  localStorage.removeItem('tk.zoomSpeed');
  resetCameraSpeedCache();
});

describe('camera speed', () => {
  it('defaults to 100 %, persists offered values and rejects others', () => {
    expect(panSpeed()).toBe(1);
    expect(zoomSpeed()).toBe(1);
    setPanSpeed(1.5);
    setZoomSpeed(2);
    expect(localStorage.getItem('tk.panSpeed')).toBe('1.5');
    resetCameraSpeedCache();
    expect(panSpeed()).toBe(1.5);
    expect(zoomSpeed()).toBe(2);
    expect(zoomStep(1.18)).toBeCloseTo(1.18 * 1.18);
    expect(pinchFactor(2)).toBeCloseTo(4);
    setPanSpeed(7);
    expect(panSpeed()).toBe(1);
    localStorage.setItem('tk.zoomSpeed', 'junk');
    resetCameraSpeedCache();
    expect(zoomSpeed()).toBe(1);
  });

  it('both cameras use it for drags, the wheel and pinches', () => {
    for (const f of ['src/presentation/render/cameraControl.ts', 'src/presentation/render/VillageScene.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('panSpeed()');
      expect(src, f).toContain('zoomStep(');
      expect(src, f).toContain('pinchFactor(');
    }
  });

  it('Settings offers 50–200 % for both and stores the choice', async () => {
    const { hud } = await buildHud();
    (hud as unknown as { openSettings(): void }).openSettings();
    const find = async (id: string) => {
      let sel: HTMLSelectElement | null = null;
      for (let i = 0; i < 50 && !(sel = document.querySelector<HTMLSelectElement>(`[data-id="${id}"]`)); i++) await new Promise((r) => setTimeout(r, 10));
      return sel!;
    };
    const pan = await find('pan-speed');
    const zoom = await find('zoom-speed');
    expect([...pan.options].map((o) => o.value)).toEqual(['0.5', '0.75', '1', '1.5', '2']);
    expect(pan.value).toBe('1');
    pan.value = '2';
    pan.dispatchEvent(new Event('change'));
    zoom.value = '0.5';
    zoom.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('tk.panSpeed')).toBe('2');
    expect(localStorage.getItem('tk.zoomSpeed')).toBe('0.5');
    expect(panSpeed()).toBe(2);
  });
});
