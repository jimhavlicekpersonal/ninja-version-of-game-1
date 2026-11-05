/**
 * A* on the tile grid. Integer costs (10 straight, 14 diagonal) keep it
 * deterministic. Hedge tiles are passable at a high cost: troops prefer to walk
 * around hedges and only break through when that is much shorter.
 */

export const BLOCKED = 255;
export const HEDGE = 254;

export interface PathGrid {
  size: number;
  /** 0 free, HEDGE standing hedge, BLOCKED standing building. */
  cells: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Distance from point (px, py) to the nearest point of a rectangle (tile units). */
export function distToRect(px: number, py: number, r: Rect): number {
  const dx = px < r.x ? r.x - px : px > r.x + r.w ? px - (r.x + r.w) : 0;
  const dy = py < r.y ? r.y - py : py > r.y + r.h ? py - (r.y + r.h) : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    const a = this.items;
    const k = this.keys;
    a.push(item);
    k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] < key || (k[p] === key && a[p] <= item)) break;
      a[i] = a[p];
      k[i] = k[p];
      i = p;
    }
    a[i] = item;
    k[i] = key;
  }
  pop(): number {
    const a = this.items;
    const k = this.keys;
    const top = a[0];
    const lastI = a.pop()!;
    const lastK = k.pop()!;
    if (a.length) {
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastK;
        let mi = lastI;
        if (l < n && (k[l] < mk || (k[l] === mk && a[l] < mi))) {
          m = l;
          mk = k[l];
          mi = a[l];
        }
        if (r < n && (k[r] < mk || (k[r] === mk && a[r] < mi))) {
          m = r;
        }
        if (m === i) break;
        a[i] = a[m];
        k[i] = k[m];
        i = m;
      }
      a[i] = lastI;
      k[i] = lastK;
    }
    return top;
  }
}

const DIRS: [number, number, number][] = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

/**
 * Path from the tile under (sx, sy) to any free tile within `range` of `target`.
 * Returns tile indices to walk through (excluding the start), or null if unreachable.
 */
export function findPath(grid: PathGrid, sx: number, sy: number, target: Rect, range: number, hedgeCost: number, ignoreHedges: boolean): number[] | null {
  const n = grid.size;
  const start = Math.floor(sy) * n + Math.floor(sx);
  const total = n * n;
  const g = new Int32Array(total).fill(-1);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const heap = new Heap();
  const goalDist = range + 0.25;
  const h = (i: number) => {
    const d = distToRect((i % n) + 0.5, Math.floor(i / n) + 0.5, target) - goalDist;
    return d > 0 ? Math.floor(d * 10) : 0;
  };
  g[start] = 0;
  heap.push(start, h(start));
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % n;
    const cy = (cur - cx) / n;
    const cell = grid.cells[cur];
    const standable = cell === 0 || (ignoreHedges && cell === HEDGE);
    if (standable && distToRect(cx + 0.5, cy + 0.5, target) <= goalDist) {
      const path: number[] = [];
      let p = cur;
      while (p !== start && p !== -1) {
        path.push(p);
        p = came[p];
      }
      return path.reverse();
    }
    if (++expanded > total * 2) break;
    for (const [dx, dy, step] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const ni = ny * n + nx;
      const c = grid.cells[ni];
      if (c === BLOCKED || closed[ni]) continue;
      if (dx !== 0 && dy !== 0) {
        // No cutting corners past buildings or hedges.
        if (grid.cells[cy * n + nx] !== 0 || grid.cells[ny * n + cx] !== 0) continue;
      }
      const extra = c === HEDGE && !ignoreHedges ? hedgeCost * 10 : 0;
      const ng = g[cur] + step + extra;
      if (g[ni] === -1 || ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + h(ni));
      }
    }
  }
  return null;
}
