/** Report section 5 step 3 (device F1): painted building art is bounded, and art on screen is never removed. */
import { describe, expect, it } from 'vitest';
import { TextureBudget } from '../../../src/presentation/render/textureBudget';

const MB = 1024 * 1024;

describe('TextureBudget', () => {
  it('keeps everything a scene holds, removes the least recently used beyond the budget', () => {
    const removed: string[] = [];
    const b = new TextureBudget(3 * MB, (k) => void removed.push(k));
    for (const k of ['a', 'b', 'c', 'd', 'e']) b.added(k, MB);
    // Painting alone never removes anything (a scene may be mid-way through making images).
    expect(removed).toEqual([]);
    expect(b.bytes).toBe(5 * MB);
    b.touch('a'); // used again: now the most recent
    b.hold('village', ['d']);
    expect(removed).toEqual(['b', 'c']);
    expect(b.keys()).toEqual(['e', 'a', 'd']);
    expect(b.bytes).toBe(3 * MB);
  });

  it('a scene that shuts down lets its art go; held art survives even over the budget', () => {
    const removed: string[] = [];
    const b = new TextureBudget(1 * MB, (k) => void removed.push(k));
    b.added('base1.keep', MB);
    b.added('base1.tower', MB);
    b.hold('battle', ['base1.keep', 'base1.tower']);
    b.added('home.keep', MB);
    b.hold('village', ['home.keep']);
    expect(removed).toEqual([]); // all three on screen: over budget, nothing removed
    b.release('battle');
    expect(removed).toEqual(['base1.keep', 'base1.tower']);
    expect(b.keys()).toEqual(['home.keep']);
  });

  it('a new set from the same owner replaces the old one', () => {
    const removed: string[] = [];
    const b = new TextureBudget(1 * MB, (k) => void removed.push(k));
    b.added('lv1', MB);
    b.hold('village', ['lv1']);
    b.added('lv2', MB); // upgraded
    b.hold('village', ['lv2']);
    expect(removed).toEqual(['lv1']);
  });
});
