/** Isometric (2:1) projection helpers. Pure math, no Phaser. */

export const TILE_W = 64;
export const TILE_H = 32;

/** World position of the top corner of tile (tx, ty). Fractional tiles are fine. */
export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

/** Fractional tile coordinates under a world position. */
export function worldToTile(x: number, y: number): { tx: number; ty: number } {
  const a = x / (TILE_W / 2);
  const b = y / (TILE_H / 2);
  return { tx: (a + b) / 2, ty: (b - a) / 2 };
}

/** World position of the centre of a size x size footprint whose top-left tile is (x, y). */
export function footprintCenter(x: number, y: number, size: number): { x: number; y: number } {
  return tileToWorld(x + size / 2, y + size / 2);
}

/** Draw order: things further down the screen are drawn on top. */
export function depthFor(x: number, y: number, size: number): number {
  return (x + y + size) * 10;
}

/** The four corners (top, right, bottom, left) of a footprint, in world space. */
export function footprintCorners(x: number, y: number, size: number): { x: number; y: number }[] {
  return [tileToWorld(x, y), tileToWorld(x + size, y), tileToWorld(x + size, y + size), tileToWorld(x, y + size)];
}

/** World rectangle covering the whole map. */
export function mapBounds(mapSize: number): { x: number; y: number; width: number; height: number } {
  return { x: -mapSize * (TILE_W / 2), y: 0, width: mapSize * TILE_W, height: mapSize * TILE_H };
}
