/**
 * STB-N2: a trackpad swipe sends many small wheel events (deltaY ≈ 1–10 each). The cameras used only the sign of
 * deltaY, so every event zoomed a whole mouse notch and one swipe took the zoom from end to end. The zoom now
 * follows the wheel's distance: a mouse notch (deltaY 100) is the old step, small events are small steps.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
      Distance: { Between: (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) },
    },
    Scale: { Events: { RESIZE: 'resize' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));
vi.mock('../../../src/presentation/render/touchInput', () => ({ setupTouchInput: () => {} }));
const { CameraControl } = await import('../../../src/presentation/render/cameraControl');
const speed = await import('../../../src/presentation/render/cameraSpeed');

afterEach(() => speed.resetCameraSpeedCache());

function camera() {
  const handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  const scene = {
    input: { on: (ev: string, fn: (...a: unknown[]) => void) => handlers.set(ev, [...(handlers.get(ev) ?? []), fn]), manager: { pointers: [] } },
    scale: { width: 400, height: 800, on: () => {}, off: () => {} },
    events: { once: () => {} },
    time: { now: 0 },
    cameras: { main: { width: 400, height: 800, originX: 0.5, originY: 0.5, zoom: 1, scrollX: 0, scrollY: 0, setZoom: () => {}, getBounds: () => ({ width: 4000, height: 4000 }) } },
  };
  const cam = new CameraControl(scene as never, { renderScale: 1 });
  cam.userZoom = 0.909;
  const wheel = (dy: number, event: Partial<WheelEvent> = {}) => {
    for (const fn of handlers.get('wheel') ?? []) fn({ x: 200, y: 400, event: { deltaMode: 0, ctrlKey: false, ...event } }, [], 0, dy);
  };
  const target = () => (cam as unknown as { wheel: { zoom: number } | null }).wheel?.zoom ?? cam.userZoom;
  return { cam, wheel, target };
}

describe('wheel zoom follows the wheel distance (STB-N2)', () => {
  it('12 small trackpad events (deltaY 3) change the zoom by less than 15 %', () => {
    const { wheel, target } = camera();
    for (let i = 0; i < 12; i++) wheel(3);
    expect(target() / 0.909).toBeGreaterThan(0.85);
    const up = camera();
    for (let i = 0; i < 12; i++) up.wheel(-3);
    expect(up.target() / 0.909).toBeLessThan(1.15);
  });

  it('one mouse notch (deltaY ±100) is the old step', () => {
    const out = camera();
    out.wheel(100);
    expect(out.target()).toBeCloseTo(0.909 * 0.85, 5);
    const inn = camera();
    inn.wheel(-100);
    expect(inn.target()).toBeCloseTo(0.909 * 1.18, 5);
  });

  it('a huge single event is capped at one notch; line and page modes are normalised', () => {
    expect(speed.wheelZoomFactor(1000)).toBeCloseTo(0.85, 5);
    expect(speed.wheelZoomFactor(3, 1)).toBeCloseTo(0.85, 2); // Firefox: 3 lines per notch
    expect(speed.wheelZoomFactor(1, 2)).toBeCloseTo(0.85, 5); // one page
    expect(speed.wheelZoomFactor(0)).toBe(1);
  });

  it('a trackpad pinch (ctrlKey) is proportional too, a little stronger per pixel than a scroll', () => {
    const f = speed.wheelZoomFactor(10, 0, true);
    expect(f).toBeLessThan(speed.wheelZoomFactor(10));
    expect(f).toBeGreaterThan(0.85);
    expect(speed.wheelZoomFactor(100, 0, true)).toBeCloseTo(0.85, 5);
  });

  it('the zoom speed setting still scales it', () => {
    speed.setZoomSpeed(2);
    expect(speed.wheelZoomFactor(100)).toBeCloseTo(0.85 * 0.85, 5);
  });

  it('the village camera uses the same rule', () => {
    const src = readFileSync('src/presentation/render/VillageScene.ts', 'utf8');
    expect(src).toContain('wheelZoomFactor(');
    expect(src).not.toMatch(/dy > 0 \? 0\.85/);
  });
});
