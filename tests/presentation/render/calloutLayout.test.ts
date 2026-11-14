import { describe, expect, it } from 'vitest';
import { MAX_LIVE, placeCallout, type CalloutBox } from '../../../src/presentation/render/calloutLayout';

const box = (text: string, x: number, y: number, w = 70, h = 18): CalloutBox => ({ text, x, y, w, h });
const overlap = (a: CalloutBox, b: CalloutBox) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y - a.h < b.y && b.y - b.h < a.y;

describe('battle callout layout (art audit F8)', () => {
  it('places a lone callout where it was asked', () => {
    expect(placeCallout([], box('Moon Cut', 100, 200))).toEqual({ kind: 'place', y: 200 });
  });

  it('merges the same text close by instead of printing it twice', () => {
    expect(placeCallout([box('Moon Cut', 100, 200)], box('Moon Cut', 130, 210))).toEqual({ kind: 'merge', index: 0 });
    // Far away it is a separate callout.
    expect(placeCallout([box('Moon Cut', 100, 200)], box('Moon Cut', 300, 200)).kind).toBe('place');
  });

  it('stacks different texts so no two overlap', () => {
    const live: CalloutBox[] = [];
    const texts = ['Moon Cut', 'Lit up!', 'Grounded!', 'Repaired!'];
    for (const [i, t] of texts.entries()) {
      const want = box(t, 100 + i * 6, 300);
      const at = placeCallout(live, want);
      expect(at.kind).toBe('place');
      if (at.kind !== 'place') continue;
      const placed = { ...want, y: at.y };
      for (const other of live) expect(overlap(placed, other)).toBe(false);
      live.push(placed);
    }
    // Each one went above the last.
    expect(live.map((b) => b.y)).toEqual([...live.map((b) => b.y)].sort((a, b) => b - a));
  });

  it('stacks past a chain of labels, not only the first one it hits', () => {
    const live = [box('A', 100, 300), box('B', 100, 280), box('C', 100, 260)];
    const at = placeCallout(live, box('D', 100, 300));
    expect(at).toEqual({ kind: 'place', y: 240 });
  });

  it(`caps the labels on screen at ${MAX_LIVE} and drops what would leave the top`, () => {
    const live = Array.from({ length: MAX_LIVE }, (_, i) => box(`T${i}`, i * 200, 300));
    expect(placeCallout(live, box('new', 1000, 300)).kind).toBe('drop');
    expect(placeCallout([box('A', 100, 40)], box('B', 100, 40), 30).kind).toBe('drop');
  });
});
