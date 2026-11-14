/**
 * Second verification 2026-11-14: the touch that skips the battle's opening shot must not also deploy. Before,
 * CameraControl read the same touch as a tap (a warrior landed where the player had not aimed) or, held, as
 * repeated deploys after 350 ms. BattleScene now hands that pointer to `CameraControl.swallow`.
 */
import { describe, expect, it, vi } from 'vitest';

// Phaser needs a browser: CameraControl only uses these few helpers.
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

type Ptr = { id: number; x: number; y: number; isDown: boolean };

function fakeScene() {
  const handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  const pointers: Ptr[] = [];
  const scene = {
    input: {
      on: (ev: string, fn: (...a: unknown[]) => void) => handlers.set(ev, [...(handlers.get(ev) ?? []), fn]),
      manager: { pointers },
    },
    scale: { width: 400, height: 800, on: () => {}, off: () => {} },
    events: { once: () => {} },
    time: { now: 0 },
    cameras: { main: { width: 400, height: 800, originX: 0.5, originY: 0.5, zoom: 1, scrollX: 0, scrollY: 0, setZoom: () => {}, getBounds: () => ({ width: 4000, height: 4000 }) } },
  };
  const emit = (ev: string, p: Ptr) => {
    for (const fn of handlers.get(ev) ?? []) fn(p);
  };
  return { scene, pointers, emit };
}

function setup() {
  const { scene, pointers, emit } = fakeScene();
  const taps: number[] = [];
  const holds: number[] = [];
  const cam = new CameraControl(scene as never, { renderScale: 1, onTap: (x) => taps.push(x), onHold: (x) => holds.push(x) });
  const p: Ptr = { id: 1, x: 100, y: 200, isDown: false };
  pointers.push(p);
  return { cam, p, emit, taps, holds };
}

describe('the touch that skips the opening shot', () => {
  it('a plain tap still deploys (control case)', () => {
    const { p, emit, taps } = setup();
    p.isDown = true;
    emit('pointerdown', p);
    p.isDown = false;
    emit('pointerup', p);
    expect(taps).toHaveLength(1);
  });

  it('swallowed after CameraControl saw the press: no tap, no held repeat', () => {
    const { cam, p, emit, taps, holds } = setup();
    p.isDown = true;
    emit('pointerdown', p);
    cam.swallow(p.id); // BattleScene's opening listener runs after the camera's
    cam.update(1000);
    expect(holds).toHaveLength(0);
    p.isDown = false;
    emit('pointerup', p);
    expect(taps).toHaveLength(0);
    // The next touch is an ordinary tap again.
    p.isDown = true;
    emit('pointerdown', p);
    p.isDown = false;
    emit('pointerup', p);
    expect(taps).toHaveLength(1);
  });

  it('swallowed before CameraControl saw the press: also ignored until it lifts', () => {
    const { cam, p, emit, taps, holds } = setup();
    p.isDown = true;
    cam.swallow(p.id);
    emit('pointerdown', p);
    cam.update(1000);
    p.isDown = false;
    emit('pointerup', p);
    expect(taps).toHaveLength(0);
    expect(holds).toHaveLength(0);
  });
});
