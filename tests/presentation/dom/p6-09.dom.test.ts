// @vitest-environment happy-dom
/**
 * P6-09 (PLY-14): an edge chevron wider than the margin is moved back inside the screen.
 */
import { describe, expect, it } from 'vitest';
import { clampOnScreen } from '../../../src/presentation/ui/battleHud';

function placed(left: number, top: number, w: number, h: number): HTMLElement {
  const el = document.createElement('button');
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  // A centred box: the browser's layout, stood in for here.
  el.getBoundingClientRect = () => {
    const x = parseFloat(el.style.left) - w / 2;
    const y = parseFloat(el.style.top) - h / 2;
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) } as DOMRect;
  };
  return el;
}

describe('edge chevrons stay whole on screen (P6-09)', () => {
  it('pulls a wide chevron in from the left, right, top and bottom edges', () => {
    const left = placed(36, 200, 96, 44);
    clampOnScreen(left, 360, 640);
    expect(left.getBoundingClientRect().left).toBeGreaterThanOrEqual(6);
    const right = placed(324, 200, 96, 44);
    clampOnScreen(right, 360, 640);
    expect(right.getBoundingClientRect().right).toBeLessThanOrEqual(354);
    const corner = placed(10, 630, 64, 44);
    clampOnScreen(corner, 360, 640);
    const r = corner.getBoundingClientRect();
    expect(r.left).toBeGreaterThanOrEqual(6);
    expect(r.bottom).toBeLessThanOrEqual(634);
  });

  it('leaves a chevron that fits where it is', () => {
    const el = placed(180, 300, 64, 44);
    clampOnScreen(el, 360, 640);
    expect(el.style.left).toBe('180px');
    expect(el.style.top).toBe('300px');
  });
});
