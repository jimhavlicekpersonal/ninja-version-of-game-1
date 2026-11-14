/**
 * Edge chevrons for Infiltration Points outside the free area (art audit F8): placed one by one at the ray exit, two
 * points in the same direction drew "F 100" over "E 100". Points closer than `MERGE_PX` share one chevron; the rest
 * are spread along their edge so no two overlap.
 */
interface ChevronIn<T> {
  item: T;
  x: number;
  y: number;
}
interface ChevronOut<T> {
  /** The points this chevron stands for (nearest first: a tap pans to `items[0]`). */
  items: T[];
  x: number;
  y: number;
}
interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Chevrons whose anchors are closer than this become one. */
const MERGE_PX = 40;
/** Centre-to-centre spacing along a left/right edge (chevrons are 44 px tall). */
export const GAP_Y = 50;
/** Spacing along a top/bottom edge (a chevron is about 64 px wide with its arrow, letter and count). */
export const GAP_X = 72;

type Edge = 'left' | 'right' | 'top' | 'bottom';

function edgeOf(x: number, y: number, b: Bounds): Edge {
  const d: [Edge, number][] = [
    ['left', Math.abs(x - b.left)],
    ['right', Math.abs(x - b.right)],
    ['top', Math.abs(y - b.top)],
    ['bottom', Math.abs(y - b.bottom)],
  ];
  return d.sort((a, z) => a[1] - z[1])[0][0];
}

/** Spread sorted positions so consecutive ones are at least `gap` apart, inside [lo, hi] when there is room. */
export function spread(values: number[], gap: number, lo: number, hi: number): number[] {
  const out = [...values];
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  if (out.length && out[out.length - 1] > hi) {
    out[out.length - 1] = hi;
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - gap);
  }
  // Too many for the edge: keep the gap and let the first ones start at the low end (still no overlap).
  if (out.length && out[0] < lo) {
    out[0] = lo;
    for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  }
  return out.map((v) => Math.round(v));
}

export function layoutChevrons<T>(input: ChevronIn<T>[], bounds: Bounds): ChevronOut<T>[] {
  // 1. Merge anchors that (nearly) coincide.
  const groups: ChevronOut<T>[] = [];
  for (const c of input) {
    const g = groups.find((o) => Math.hypot(o.x - c.x, o.y - c.y) < MERGE_PX);
    if (g) g.items.push(c.item);
    else groups.push({ items: [c.item], x: c.x, y: c.y });
  }
  // 2. Spread what remains along each edge.
  const byEdge = new Map<Edge, ChevronOut<T>[]>();
  for (const g of groups) {
    const e = edgeOf(g.x, g.y, bounds);
    byEdge.set(e, [...(byEdge.get(e) ?? []), g]);
  }
  for (const [edge, list] of byEdge) {
    const vertical = edge === 'left' || edge === 'right';
    list.sort((a, z) => (vertical ? a.y - z.y : a.x - z.x));
    const pos = spread(
      list.map((g) => (vertical ? g.y : g.x)),
      vertical ? GAP_Y : GAP_X,
      vertical ? bounds.top : bounds.left,
      vertical ? bounds.bottom : bounds.right,
    );
    list.forEach((g, i) => {
      if (vertical) g.y = pos[i];
      else g.x = pos[i];
    });
  }
  return groups;
}
