import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoProfile, CANVAS_PIXEL_BUDGET, FPS_DOWNGRADE, FPS_SAMPLES, getQualityChoice, quality, QUALITY_STORAGE_KEY, renderScaleFor, resolveQuality, setQualityChoice, SLOW_FILL_MS, slowBattles } from '../../../src/presentation/render/quality';

const phone = { devicePixelRatio: 3, screenShort: 360, coarsePointer: true };

describe('rendering quality (audit R03)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('high is the original look', () => {
    const q = resolveQuality('', 'high', {});
    expect(q).toMatchObject({ profile: 'high', maxRenderScale: 3, fps: 60, powerPreference: 'high-performance', buildingScale: 2.5, hdScale: 3, groundScale: 1.5, sceneryLayers: 3, calmLife: false, particleScale: 1, wispCount: 60 });
    expect(renderScaleFor(q, 3.5)).toBe(3);
    expect(renderScaleFor(q, 2.625)).toBe(2.625);
  });

  it('low caps density, frame rate and texture resolution', () => {
    const q = resolveQuality('', 'low', {});
    expect(q).toMatchObject({ profile: 'low', maxRenderScale: 2, fps: 30, powerPreference: 'default', buildingScale: 1.5, hdScale: 2, groundScale: 1, sceneryLayers: 1, calmLife: true });
    expect(renderScaleFor(q, 3)).toBe(2);
    expect(renderScaleFor(q, 1)).toBe(1);
  });

  it('the address wins over the stored choice, which wins over device signals', () => {
    expect(resolveQuality('?debug&quality=low', 'high', { deviceMemory: 8 }).profile).toBe('low');
    expect(resolveQuality('?quality=high', 'low', { deviceMemory: 1 }).profile).toBe('high');
    expect(resolveQuality('?quality=nonsense', 'low', { deviceMemory: 8 }).profile).toBe('low');
    expect(resolveQuality('', 'high', { deviceMemory: 1 }).profile).toBe('high');
    expect(resolveQuality('', 'auto', { deviceMemory: 1 }).profile).toBe('low');
  });

  it('picks low from cheap device signals', () => {
    expect(autoProfile({ ...phone, deviceMemory: 2, hardwareConcurrency: 8 }).profile).toBe('low');
    expect(autoProfile({ ...phone, deviceMemory: 0.5 }).profile).toBe('low');
    expect(autoProfile({ ...phone, hardwareConcurrency: 4 }).profile).toBe('low'); // Safari: no deviceMemory
    expect(autoProfile({ ...phone, deviceMemory: 4, hardwareConcurrency: 8 }).profile).toBe('low'); // 4 GB phone, 3x screen
    // Client re-audit item 4: a mid-range 4 GB, 8-core, 2.6x Android phone was sent to high.
    expect(autoProfile({ devicePixelRatio: 2.625, screenShort: 412, coarsePointer: true, deviceMemory: 4, hardwareConcurrency: 8 }).profile).toBe('low');
    // Home-button iPhones (SE, 6s-8 Plus: 2-3 GB), whatever the core count WebKit reports.
    const iphone = { ios: true, coarsePointer: true, hardwareConcurrency: 4 };
    expect(autoProfile({ ...iphone, devicePixelRatio: 2, screenShort: 375, screenLong: 667, fillMs: 3 }).profile).toBe('low');
    expect(autoProfile({ ...iphone, devicePixelRatio: 2, screenShort: 320, screenLong: 568 }).profile).toBe('low');
    expect(autoProfile({ ...iphone, devicePixelRatio: 3, screenShort: 414, screenLong: 736 }).profile).toBe('low');
    // A slow canvas benchmark demotes any browser that hides its memory.
    expect(autoProfile({ ...iphone, devicePixelRatio: 3, screenShort: 390, screenLong: 844, fillMs: SLOW_FILL_MS + 5 }).profile).toBe('low');
    expect(autoProfile({ devicePixelRatio: 1, screenShort: 800, coarsePointer: false, fillMs: 40 }).profile).toBe('low');
  });

  it('never sends a current iPhone or iPad to low on its reported cores (WebKit says 4 everywhere)', () => {
    const iphone = { ios: true, coarsePointer: true, hardwareConcurrency: 4, devicePixelRatio: 3 };
    expect(autoProfile({ ...iphone, screenShort: 390, screenLong: 844, fillMs: 2 }).profile).toBe('high'); // iPhone 12-14
    expect(autoProfile({ ...iphone, screenShort: 430, screenLong: 932, fillMs: 1.5 }).profile).toBe('high'); // Pro Max
    expect(autoProfile({ ...iphone, screenShort: 375, screenLong: 812 }).profile).toBe('high'); // X / mini
    expect(autoProfile({ ...iphone, devicePixelRatio: 2, screenShort: 820, screenLong: 1180, fillMs: 2 }).profile).toBe('high'); // iPad
    // A 4 GB desktop (no touch) stays high: Chrome on a laptop.
    expect(autoProfile({ deviceMemory: 4, hardwareConcurrency: 4, coarsePointer: false, devicePixelRatio: 1.25 }).profile).toBe('high');
  });

  it('keeps high on capable phones and desktops', () => {
    expect(autoProfile({ ...phone, deviceMemory: 8, hardwareConcurrency: 8 }).profile).toBe('high'); // Pixel 7
    expect(autoProfile({ ...phone, hardwareConcurrency: 6 }).profile).toBe('high'); // recent iPhone
    expect(autoProfile({ devicePixelRatio: 1.5, screenShort: 900, coarsePointer: false, hardwareConcurrency: 4 }).profile).toBe('high'); // desktop Safari/Firefox
    expect(autoProfile({}).profile).toBe('high');
  });

  it('reduced motion trims effects only', () => {
    const q = resolveQuality('', 'high', { reducedMotion: true });
    expect(q).toMatchObject({ profile: 'high', maxRenderScale: 3, buildingScale: 2.5, hdScale: 3, particleScale: 0.5, wispCount: 24 });
  });

  it('stores the choice and survives blocked storage', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
    expect(getQualityChoice()).toBe('auto');
    setQualityChoice('low');
    expect(data.get(QUALITY_STORAGE_KEY)).toBe('low');
    expect(getQualityChoice()).toBe('low');
    setQualityChoice('auto');
    expect(data.has(QUALITY_STORAGE_KEY)).toBe(false);
    data.set(QUALITY_STORAGE_KEY, 'ultra');
    expect(getQualityChoice()).toBe('auto');

    const boom = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(getQualityChoice()).toBe('auto');
    expect(() => setQualityChoice('high')).not.toThrow();
  });

  it('is high without a browser (tests, tools)', () => {
    expect(quality().profile).toBe('high');
  });
});

describe('report section 5 step 3 (device F2)', () => {
  const android = { coarsePointer: true, devicePixelRatio: 2.75, screenShort: 393, screenLong: 873, hardwareConcurrency: 8 };

  it('a slow canvas test sends a device to low even when it reports plenty of memory', () => {
    expect(autoProfile({ ...android, deviceMemory: 8, fillMs: SLOW_FILL_MS + 1 }).profile).toBe('low');
    expect(autoProfile({ ...android, deviceMemory: 8, fillMs: 2 }).profile).toBe('high');
  });

  it('caps the canvas pixels of a mid-range Android on high, not of an 8 GB phone, an iPhone or a desktop', () => {
    const mid = resolveQuality('', 'auto', { ...android, deviceMemory: 6, fillMs: 2 });
    expect(mid.profile).toBe('high');
    const css = android.screenShort * android.screenLong;
    expect(css * mid.maxRenderScale ** 2).toBeLessThanOrEqual(CANVAS_PIXEL_BUDGET + 1);
    expect(mid.maxRenderScale).toBeGreaterThanOrEqual(2);
    expect(resolveQuality('', 'auto', { ...android, deviceMemory: 8, fillMs: 2 }).maxRenderScale).toBe(3);
    expect(resolveQuality('', 'auto', { ...android, ios: true, fillMs: 2 }).maxRenderScale).toBe(3);
    expect(resolveQuality('', 'auto', { devicePixelRatio: 2, screenShort: 1440, screenLong: 2560, deviceMemory: 4, fillMs: 2 }).maxRenderScale).toBe(3);
  });

  it('slow battles measured earlier mean low on an automatic choice, never over the player\'s own', () => {
    expect(resolveQuality('', 'auto', { ...android, deviceMemory: 8, fillMs: 2, measuredSlow: true })).toMatchObject({ profile: 'low', reason: expect.stringMatching(/slow battles/) });
    expect(resolveQuality('', 'high', { ...android, deviceMemory: 8, fillMs: 2, measuredSlow: true }).profile).toBe('high');
    expect(resolveQuality('?quality=high', 'auto', { ...android, measuredSlow: true }).profile).toBe('high');
  });

  it('decides on the median of a battle\'s samples', () => {
    expect(slowBattles(Array(FPS_SAMPLES - 1).fill(10))).toBeNull();
    expect(slowBattles(Array(FPS_SAMPLES).fill(FPS_DOWNGRADE - 5))).toBe(true);
    // A few slow frames (a big explosion) do not count against a phone that is otherwise smooth.
    expect(slowBattles([...Array(FPS_SAMPLES - 5).fill(58), ...Array(5).fill(12)])).toBe(false);
  });
});
