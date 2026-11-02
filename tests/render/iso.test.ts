import { describe, expect, it } from 'vitest';
import { footprintCenter, tileToWorld, worldToTile } from '../../src/render/iso';

describe('isometric projection', () => {
  it('worldToTile inverts tileToWorld', () => {
    for (const [tx, ty] of [[0, 0], [5, 3], [39, 39], [12.5, 7.25]]) {
      const w = tileToWorld(tx, ty);
      const t = worldToTile(w.x, w.y);
      expect(t.tx).toBeCloseTo(tx);
      expect(t.ty).toBeCloseTo(ty);
    }
  });

  it('a tile centre maps back inside that tile', () => {
    const c = footprintCenter(10, 20, 1);
    const t = worldToTile(c.x, c.y);
    expect(Math.floor(t.tx)).toBe(10);
    expect(Math.floor(t.ty)).toBe(20);
  });
});
