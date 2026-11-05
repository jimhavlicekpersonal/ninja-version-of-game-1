/**
 * Kagemura art, drawn in code: Japanese mountain-village architecture and
 * chibi ninja warriors. Owned by the ART compartment (see ./CLAUDE.md).
 *
 * Conventions (shared with real art, docs/art/ASSET_KEYS.md):
 * - Buildings: the canvas origin is the centre of the footprint diamond;
 *   the diamond is size*64 wide and size*32 tall; y grows downwards.
 * - Every painter takes a visual tier (1..3) so upgrades read at a glance:
 *   tier 2 adds trim, banners and an extra storey; tier 3 adds gold and lanterns.
 * - Troops face right; the scene mirrors them. Feet sit at y = 0.
 * - Outlines are sumi ink (#26303d). Palette: washi, vermilion, indigo, bamboo, gold.
 */
import { TILE_H, TILE_W } from '../render/iso';
import { artRng, darken, lighten, mix, rgba, softShadow, type Ctx } from './toolkit';

/** Visual tier. Most buildings use 1-3 (thirds of their levels); the Keep uses 1-6 and defenses 1-5 (`tierFor`). */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;
/** Where a level sits: its tier, and its step inside that tier (every level shows a small change). */
export interface LevelInfo {
  level: number;
  maxLevel: number;
  tier: Tier;
  /** Number of tiers this building type has. */
  tiers: number;
  /** 0-based position of this level inside its tier, and how many levels that tier spans. */
  step: number;
  steps: number;
}
export type Painter = (ctx: Ctx, size: number, tier: Tier, lv?: LevelInfo) => void;
export interface PainterDef {
  /** Pixels of art above the footprint diamond. */
  extra: number;
  paint: Painter;
}

export const INK = '#26303d';
const WASHI = '#f4ead6';
const PLASTER = '#f1ebdf';
const VERMILION = '#c8402f';
const ROOF = '#3d4a5c';
const WOOD = '#8c5a34';
const WOOD_DARK = '#5e3a22';
const STONE = '#9aa0aa';
const GOLD = '#e9b44c';
const BAMBOO = '#7fae5a';
const RICE = '#e6cf95';

interface Pt {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function poly(ctx: Ctx, pts: Pt[], fill: string | CanvasGradient, line = 1.4, stroke = INK): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient, line = 1.2, stroke = INK): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function line(ctx: Ctx, pts: Pt[], color: string, width: number): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Footprint plate: packed earth or gravel, lighter in the middle, with a raised kerb and loose grit. */
function plate(ctx: Ctx, size: number, color: string, inset = 4): void {
  const hw = (size * TILE_W) / 2 - inset;
  const hh = (size * TILE_H) / 2 - inset / 2;
  const pts = [{ x: 0, y: -hh }, { x: hw, y: 0 }, { x: 0, y: hh }, { x: -hw, y: 0 }];
  // Kerb: a sliver of the plate's front edges, a shade darker, so the plate sits on the grass.
  poly(ctx, [{ x: -hw, y: 0 }, { x: 0, y: hh }, { x: hw, y: 0 }, { x: hw, y: 2 }, { x: 0, y: hh + 2 }, { x: -hw, y: 2 }], darken(color, 0.3), 0);
  const g = ctx.createRadialGradient(-hw * 0.15, -hh * 0.2, hh * 0.1, 0, 0, hw * 1.05);
  g.addColorStop(0, lighten(color, 0.12));
  g.addColorStop(0.6, color);
  g.addColorStop(1, darken(color, 0.14));
  poly(ctx, pts, g, 1.2, darken(color, 0.38));
  const r = artRng(size * 31 + color.length);
  for (let i = 0; i < size * 16; i++) {
    const u = r() * 2 - 1;
    const v = (r() * 2 - 1) * (1 - Math.abs(u));
    const light = r() < 0.35;
    ctx.fillStyle = light ? rgba(lighten(color, 0.4), 0.55) : rgba(darken(color, 0.32), 0.38);
    ctx.beginPath();
    ctx.ellipse(u * hw * 0.85, v * hh * 0.85, 1 + r() * 0.8, 0.6 + r() * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Vertical gradient for a wall face: lit at the top, a touch of ambient occlusion at the foot. */
function faceFill(ctx: Ctx, color: string, top: number, bottom: number, light: number, dark: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, light >= 0 ? lighten(color, light) : darken(color, -light));
  g.addColorStop(1, darken(color, dark));
  return g;
}

/**
 * An isometric block on a diamond footprint (half sizes hw, hh) whose
 * base centre sits `base` px below the origin, `height` px tall.
 * Returns the y of its top face centre.
 */
function block(ctx: Ctx, hw: number, hh: number, base: number, height: number, front: string, opts: { top?: string; lw?: number } = {}): number {
  const y0 = base;
  const y1 = base - height;
  const lw = opts.lw ?? 1.4;
  poly(ctx, [{ x: -hw, y: y0 }, { x: 0, y: y0 + hh }, { x: 0, y: y1 + hh }, { x: -hw, y: y1 }], faceFill(ctx, front, y1, y0 + hh, 0.1, 0.06), lw);
  poly(ctx, [{ x: 0, y: y0 + hh }, { x: hw, y: y0 }, { x: hw, y: y1 }, { x: 0, y: y1 + hh }], faceFill(ctx, front, y1, y0 + hh, -0.1, 0.24), lw);
  const topColor = opts.top ?? lighten(front, 0.2);
  const tg = ctx.createLinearGradient(-hw * 0.5, y1 - hh, hw * 0.5, y1 + hh);
  tg.addColorStop(0, lighten(topColor, 0.1));
  tg.addColorStop(1, darken(topColor, 0.05));
  poly(ctx, [{ x: 0, y: y1 - hh }, { x: hw, y: y1 }, { x: 0, y: y1 + hh }, { x: -hw, y: y1 }], tg, lw);
  // Rim light on the two front top edges and the near corner.
  if (height > 3 && hw > 6) {
    line(ctx, [{ x: -hw + 1.2, y: y1 + 0.6 }, { x: 0, y: y1 + hh - 0.6 }], rgba('#ffffff', 0.35), 0.9);
    line(ctx, [{ x: 0, y: y1 + hh + 1 }, { x: 0, y: y0 + hh - 1 }], rgba('#ffffff', 0.16), 0.9);
  }
  return y1;
}

/** Stone plinth (ishigaki-style) with staggered block joints. */
function stoneBase(ctx: Ctx, hw: number, hh: number, base: number, height: number, color = STONE): number {
  // Each level inside a tier raises the plinth a little (a visible change even between tier looks).
  if (LV && hw > 12) height += Math.min(3, LV.step) * 2.5;
  const top = block(ctx, hw, hh, base, height, color, { top: lighten(color, 0.15) });
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 0.9;
  const rows = Math.max(1, Math.round(height / 7));
  // Each dressed stone a slightly different tone, so the plinth reads as masonry, not a grey box.
  const tone = artRng(Math.round(hw * 7 + height * 13));
  const rh = height / rows;
  for (let i = 0; i < rows; i++) {
    const yb = base - rh * i;
    const off = i % 2 ? 0.5 : 0;
    for (let k = -1; k < 4; k++) {
      const f0 = Math.max(0, (k + off) / 4);
      const f1 = Math.min(1, (k + 1 + off) / 4);
      if (f1 <= f0) continue;
      const t = tone();
      const fill = t < 0.5 ? rgba('#ffffff', 0.05 + t * 0.12) : rgba(INK, (t - 0.5) * 0.16);
      for (const side of [0, 1]) {
        const at = (f: number, up: number) => (side === 0 ? { x: -hw + hw * f, y: yb + hh * f - up } : { x: hw * f, y: yb + hh * (1 - f) - up });
        poly(ctx, [at(f0, 0), at(f1, 0), at(f1, rh), at(f0, rh)], fill, 0);
      }
    }
  }
  for (let i = 1; i < rows; i++) {
    const y = base - (height * i) / rows;
    line(ctx, [{ x: -hw, y }, { x: 0, y: y + hh }, { x: hw, y }], rgba(INK, 0.3), 0.9);
    for (let k = 0; k < 4; k++) {
      const f = (k + (i % 2 ? 0.5 : 0)) / 4;
      if (f <= 0 || f >= 1) continue;
      const xl = -hw + hw * f;
      const yl = y + hh * f;
      line(ctx, [{ x: xl, y: yl }, { x: xl, y: yl + height / rows }], rgba(INK, 0.25), 0.8);
      line(ctx, [{ x: hw * f, y: y + hh * (1 - f) }, { x: hw * f, y: y + hh * (1 - f) + height / rows }], rgba(INK, 0.25), 0.8);
    }
  }
  return top;
}

/**
 * Japanese hip roof with upturned corners and tile rows.
 * Eave diamond half sizes (hw, hh) at y = eave; apex `rise` above.
 */
/**
 * Roof materials tell building families apart (item 11 of the art re-audit): `tile` kawara rows
 * (storehouses, military), `thatch` straw (producers and huts: shaggy, no flare), `shingle` cedar
 * bark (young defenses), `copper` verdigris standing seams (late defenses, the Keep's upper tiers).
 */
export type RoofMaterial = 'tile' | 'thatch' | 'shingle' | 'copper';
export const ROOF_COLOURS: Record<RoofMaterial, string> = { tile: ROOF, thatch: '#c9a65e', shingle: '#7a5236', copper: '#4f9a86' };

function roof(ctx: Ctx, hw: number, hh: number, eave: number, rise: number, color = ROOF, opts: { flare?: number; ridge?: string; finial?: string; tips?: string; material?: RoofMaterial } = {}): number {
  const material = opts.material ?? 'tile';
  const flare = opts.flare ?? (material === 'thatch' ? 2 : Math.min(10, hw * 0.16));
  const apex = { x: 0, y: eave - rise };
  const L = { x: -hw, y: eave - flare };
  const R = { x: hw, y: eave - flare };
  const B = { x: 0, y: eave + hh };
  const T = { x: 0, y: eave - hh };
  // Back slopes (silhouette only).
  poly(ctx, [L, T, apex], darken(color, 0.25), 1.4);
  poly(ctx, [T, R, apex], darken(color, 0.32), 1.4);
  // Front slopes with a slight concave sag toward the eaves.
  const face = (a: Pt, b: Pt, fill: string | CanvasGradient) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 3, b.x, b.y);
    ctx.quadraticCurveTo((b.x + apex.x) / 2 + (b.x === 0 ? 0 : -b.x * 0.06), (b.y + apex.y) / 2 + 4, apex.x, apex.y);
    ctx.quadraticCurveTo((a.x + apex.x) / 2 - a.x * 0.06, (a.y + apex.y) / 2 + 4, a.x, a.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const slope = (a: Pt, b: Pt, light: number, dark: number) => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const g = ctx.createLinearGradient(apex.x, apex.y, mid.x, mid.y);
    g.addColorStop(0, light >= 0 ? lighten(color, light) : darken(color, -light));
    g.addColorStop(1, darken(color, dark));
    return g;
  };
  face(L, B, slope(L, B, 0.2, -0.04));
  face(B, R, slope(B, R, -0.02, 0.2));
  ctx.save();
  if (material === 'thatch') {
    // Straw: many short strokes down the slope, and a thick trimmed eave.
    const r = artRng(Math.round(hw * 3 + rise));
    for (const [a, b] of [[L, B], [B, R]] as const) {
      const n = Math.max(14, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 2.2));
      for (let i = 0; i < n; i++) {
        const f = (i + r() * 0.8) / n;
        const t = 0.25 + r() * 0.7;
        const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f + 2 };
        const q = { x: apex.x + (p.x - apex.x) * t, y: apex.y + (p.y - apex.y) * t };
        const len = 0.18 + r() * 0.12;
        line(ctx, [q, { x: q.x + (p.x - apex.x) * len, y: q.y + (p.y - apex.y) * len }], r() < 0.5 ? rgba(darken(color, 0.4), 0.45) : rgba(lighten(color, 0.4), 0.5), 0.8);
      }
    }
    line(ctx, [{ x: L.x, y: L.y + 1.5 }, { x: B.x, y: B.y + 1.5 }, { x: R.x, y: R.y + 1.5 }], darken(color, 0.35), 3.2);
    line(ctx, [{ x: L.x, y: L.y + 0.4 }, { x: B.x, y: B.y + 0.4 }, { x: R.x, y: R.y + 0.4 }], lighten(color, 0.25), 1);
    ctx.restore();
    // Ridge bundle tied with cord.
    line(ctx, [B, apex], darken(color, 0.5), 3.4);
    for (const f of [0.3, 0.6]) circle(ctx, B.x + (apex.x - B.x) * f, B.y + (apex.y - B.y) * f, 1.6, darken(color, 0.6), 0);
    return apex.y;
  }
  if (material === 'copper' || material === 'shingle') {
    // Copper: standing seams from ridge to eave with a bright edge. Shingle: fine courses of cedar bark.
    const seams = material === 'copper';
    for (const [a, b, alpha] of [[L, B, 0.3], [B, R, 0.18]] as const) {
      const runs = Math.max(6, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / (seams ? 6 : 9)));
      for (let i = 1; i < runs; i++) {
        const f = i / runs;
        const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f + 2 };
        if (seams) {
          line(ctx, [p, { x: apex.x + (p.x - apex.x) * 0.12, y: apex.y + (p.y - apex.y) * 0.12 }], rgba(darken(color, 0.45), 0.55), 0.9);
          line(ctx, [{ x: p.x - 0.8, y: p.y }, { x: apex.x + (p.x - apex.x) * 0.12 - 0.8, y: apex.y + (p.y - apex.y) * 0.12 }], rgba('#e6fff4', alpha), 0.6);
        }
      }
      const courses = seams ? [0.5] : [0.2, 0.35, 0.5, 0.65, 0.8];
      for (const t of courses) {
        const p = { x: apex.x + (a.x - apex.x) * t, y: apex.y + (a.y - apex.y) * t + 3 * t };
        const q = { x: apex.x + (b.x - apex.x) * t, y: apex.y + (b.y - apex.y) * t + 3 * t };
        line(ctx, [p, q], rgba(seams ? darken(color, 0.4) : INK, seams ? 0.3 : 0.22), seams ? 0.7 : 0.8);
      }
    }
    if (seams) {
      // Patina streaks.
      const r = artRng(Math.round(hw * 5));
      for (let i = 0; i < 6; i++) {
        const f = r();
        const a = i % 2 ? L : R;
        const p = { x: a.x + (B.x - a.x) * f, y: a.y + (B.y - a.y) * f };
        line(ctx, [{ x: apex.x + (p.x - apex.x) * 0.4, y: apex.y + (p.y - apex.y) * 0.4 }, { x: apex.x + (p.x - apex.x) * 0.8, y: apex.y + (p.y - apex.y) * 0.8 }], rgba('#9fe0c8', 0.28), 1.6);
      }
    }
  }
  // Tile rows: runs from eave to ridge, and courses parallel to the eave.
  for (const [a, b, alpha] of material === 'tile' ? ([[L, B, 0.16], [B, R, 0.09]] as const) : []) {
    const runs = Math.max(5, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 7));
    for (let i = 1; i < runs; i++) {
      const f = i / runs;
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f + 2 };
      line(ctx, [p, { x: apex.x + (p.x - apex.x) * 0.22, y: apex.y + (p.y - apex.y) * 0.22 }], rgba('#ffffff', alpha), 0.9);
    }
    for (const t of [0.3, 0.55, 0.78]) {
      const p = { x: apex.x + (a.x - apex.x) * t, y: apex.y + (a.y - apex.y) * t + 3 * t };
      const q = { x: apex.x + (b.x - apex.x) * t, y: apex.y + (b.y - apex.y) * t + 3 * t };
      line(ctx, [p, q], rgba(INK, 0.16), 0.9);
    }
  }
  ctx.restore();
  // Eave fascia, a soft highlight along the lower edge, and the ridge cap.
  line(ctx, [L, { x: B.x, y: B.y }, R], rgba(lighten(color, 0.55), 0.7), 1.4);
  line(ctx, [{ x: L.x + 2, y: L.y + 2.2 }, { x: B.x, y: B.y + 2.2 }, { x: R.x - 2, y: R.y + 2.2 }], rgba(INK, 0.22), 1);
  line(ctx, [B, apex], opts.ridge ?? darken(color, 0.45), 2.6);
  line(ctx, [{ x: B.x - 0.8, y: B.y - 2 }, { x: apex.x - 0.8, y: apex.y + 2 }], rgba('#ffffff', 0.22), 0.8);
  if (opts.tips) {
    // Metal caps on the upturned eave corners.
    for (const c of [L, R]) {
      circle(ctx, c.x, c.y - 1, 2, opts.tips, 0.8);
      circle(ctx, c.x - 0.6, c.y - 1.6, 0.7, rgba('#ffffff', 0.7), 0);
    }
  }
  if (opts.finial) {
    circle(ctx, apex.x, apex.y - 3, 3.2, opts.finial, 1);
    line(ctx, [{ x: apex.x, y: apex.y - 6 }, { x: apex.x, y: apex.y - 11 }], opts.finial, 1.6);
  }
  return apex.y;
}

/** Plaster wall storey with timber posts and an optional lit window. */
function storey(ctx: Ctx, hw: number, hh: number, base: number, height: number, wall = PLASTER, opts: { window?: boolean; door?: boolean; trim?: string } = {}): number {
  const top = block(ctx, hw, hh, base, height, wall);
  // Shadow cast by the eaves onto the top of the walls.
  for (const side of [0, 1]) {
    const g = ctx.createLinearGradient(0, base - height, 0, base - height + Math.min(10, height * 0.45));
    g.addColorStop(0, rgba(INK, 0.22));
    g.addColorStop(1, rgba(INK, 0));
    const pts = side === 0
      ? [{ x: -hw, y: base - height }, { x: 0, y: base - height + hh }, { x: 0, y: base + hh }, { x: -hw, y: base }]
      : [{ x: 0, y: base - height + hh }, { x: hw, y: base - height }, { x: hw, y: base }, { x: 0, y: base + hh }];
    poly(ctx, pts, g, 0);
  }
  const posts = [0.33, 0.66];
  for (const f of posts) {
    line(ctx, [{ x: -hw + hw * f, y: base + hh * f }, { x: -hw + hw * f, y: base - height + hh * f }], rgba(WOOD_DARK, 0.75), 1.6);
    line(ctx, [{ x: hw * f, y: base + hh * (1 - f) }, { x: hw * f, y: base - height + hh * (1 - f) }], rgba(WOOD_DARK, 0.75), 1.6);
  }
  if (opts.trim) {
    line(ctx, [{ x: -hw, y: base - height + 2 }, { x: 0, y: base - height + hh + 2 }, { x: hw, y: base - height + 2 }], opts.trim, 2.2);
  }
  if (opts.window) {
    const wx = -hw * 0.5;
    const wy = base - height * 0.55 + hh * 0.5;
    glow(ctx, wx, wy + 1, 9);
    const wg = ctx.createLinearGradient(0, wy - 6, 0, wy + 7);
    wg.addColorStop(0, '#fff0b8');
    wg.addColorStop(1, '#f2b04e');
    poly(ctx, [{ x: wx - 5, y: wy - 6 }, { x: wx + 5, y: wy - 1 }, { x: wx + 5, y: wy + 7 }, { x: wx - 5, y: wy + 2 }], wg, 1.1);
    line(ctx, [{ x: wx, y: wy - 3.5 }, { x: wx, y: wy + 4.5 }], rgba(WOOD_DARK, 0.8), 0.9);
    line(ctx, [{ x: wx - 5, y: wy - 2 + 2.5 }, { x: wx + 5, y: wy + 3 + 2.5 }], rgba(WOOD_DARK, 0.55), 0.7);
  }
  if (opts.door) {
    const dx = hw * 0.45;
    const dy = base + hh * 0.55;
    poly(ctx, [{ x: dx - 6, y: dy + 3 }, { x: dx + 6, y: dy - 3 }, { x: dx + 6, y: dy - 3 - height * 0.6 }, { x: dx - 6, y: dy + 3 - height * 0.6 }], WOOD_DARK, 1.2);
  }
  return top;
}

/** A tall clan banner (nobori) with an original crest. */
function banner(ctx: Ctx, x: number, y: number, h: number, color = VERMILION): void {
  line(ctx, [{ x, y }, { x, y: y - h }], WOOD_DARK, 2);
  line(ctx, [{ x: x - 1, y: y - h + 2 }, { x: x + 9, y: y - h + 2 }], WOOD_DARK, 1.6);
  poly(ctx, [{ x: x + 1, y: y - h + 3 }, { x: x + 9, y: y - h + 3 }, { x: x + 9, y: y - h * 0.38 }, { x: x + 1, y: y - h * 0.38 + 2 }], color, 1.1);
  crest(ctx, x + 5, y - h * 0.68, 2.6, WASHI);
}

/** Original clan crest: three kunai blades in a ring. */
export function crest(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  circle(ctx, 0, 0, r, 'rgba(0,0,0,0)', Math.max(0.6, r * 0.22), color);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    poly(ctx, [{ x: Math.cos(a) * r * 0.15, y: Math.sin(a) * r * 0.15 }, { x: Math.cos(a + 0.25) * r * 0.75, y: Math.sin(a + 0.25) * r * 0.75 }, { x: Math.cos(a) * r * 0.95, y: Math.sin(a) * r * 0.95 }, { x: Math.cos(a - 0.25) * r * 0.75, y: Math.sin(a - 0.25) * r * 0.75 }], color, 0);
  }
  ctx.restore();
}

/** Warm lamplight halo. */
function glow(ctx: Ctx, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, rgba('#ffcf70', 0.55));
  g.addColorStop(1, rgba('#ffcf70', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Paper lantern with its glow. */
function lantern(ctx: Ctx, x: number, y: number, s = 1, color = VERMILION): void {
  glow(ctx, x, y, 12 * s);
  ctx.beginPath();
  ctx.ellipse(x, y, 4.2 * s, 5.4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  line(ctx, [{ x: x - 3 * s, y: y - 5.4 * s }, { x: x + 3 * s, y: y - 5.4 * s }], INK, 1.4);
  line(ctx, [{ x: x - 3 * s, y: y + 5.4 * s }, { x: x + 3 * s, y: y + 5.4 * s }], INK, 1.4);
}

function bambooStalk(ctx: Ctx, x: number, y: number, h: number, lean = 0): void {
  const top = { x: x + lean, y: y - h };
  line(ctx, [{ x, y }, top], darken(BAMBOO, 0.35), 4);
  line(ctx, [{ x, y }, top], BAMBOO, 2.6);
  for (let i = 1; i < 4; i++) {
    const f = i / 4;
    line(ctx, [{ x: x + lean * f - 2, y: y - h * f }, { x: x + lean * f + 2, y: y - h * f }], darken(BAMBOO, 0.4), 1.2);
  }
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(top.x + d * 5, top.y + 3, 6, 1.8, d * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = lighten(BAMBOO, 0.1);
    ctx.fill();
  }
}

function riceBale(ctx: Ctx, x: number, y: number, s = 1): void {
  ctx.beginPath();
  ctx.ellipse(x, y, 7 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = RICE;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = darken(RICE, 0.5);
  ctx.stroke();
  for (const d of [-3, 3]) line(ctx, [{ x: x + d * s, y: y - 4.6 * s }, { x: x + d * s, y: y + 4.6 * s }], darken(RICE, 0.35), 1.1);
}

function coinStack(ctx: Ctx, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y - i * 2.2, 5, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = i === n - 1 ? lighten(GOLD, 0.15) : GOLD;
    ctx.fill();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = darken(GOLD, 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = darken(GOLD, 0.5);
  ctx.fillRect(x - 1, y - (n - 1) * 2.2 - 1, 2, 2);
}

// ---------------------------------------------------------------------------
// Function cues: small, consistent signs of what a building does.
// Resource is told by colour and pictogram (gold coin = coins, straw sheaf = rice);
// producers look busy (smoke, glow, water), stores look shut (lattice walls, locks, stacks).
// ---------------------------------------------------------------------------

export type Mark = 'coin' | 'rice' | 'blades' | 'hammer' | 'crest';

/** A point on a block's front-left face: f = 0 at the left corner, 1 at the front corner; `up` px above the base. */
function onLeft(hw: number, hh: number, base: number, f: number, up: number): Pt {
  return { x: -hw + hw * f, y: base + hh * f - up };
}

/** A point on a block's front-right face: f = 0 at the front corner, 1 at the right corner. */
function onRight(hw: number, hh: number, base: number, f: number, up: number): Pt {
  return { x: hw * f, y: base + hh * (1 - f) - up };
}

/** A pictogram that names a building's job, drawn upright in about 2r x 2r. */
function mark(ctx: Ctx, kind: Mark, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'coin') {
    circle(ctx, 0, 0, r, color, Math.max(0.7, r * 0.14), darken(color, 0.5));
    circle(ctx, 0, 0, r * 0.68, 'rgba(0,0,0,0)', Math.max(0.5, r * 0.08), rgba(darken(color, 0.45), 0.6));
    ctx.fillStyle = darken(color, 0.55);
    ctx.fillRect(-r * 0.24, -r * 0.24, r * 0.48, r * 0.48);
  } else if (kind === 'rice') {
    // A tied sheaf: three stalks, drooping grain heads.
    const w = Math.max(0.8, r * 0.16);
    for (const d of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * r * 0.18, r);
      ctx.quadraticCurveTo(d * r * 0.1, -r * 0.2, d * r * 0.55, -r * 0.75);
      ctx.lineWidth = w;
      ctx.strokeStyle = color;
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(d * r * (0.3 + k * 0.09) + (d === 0 ? r * 0.12 * k : 0), -r * (0.25 + k * 0.22), r * 0.13, r * 0.21, d * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    line(ctx, [{ x: -r * 0.38, y: r * 0.35 }, { x: r * 0.38, y: r * 0.35 }], color, w * 1.3);
  } else if (kind === 'blades') {
    const w = Math.max(1, r * 0.2);
    for (const d of [-1, 1]) {
      line(ctx, [{ x: -d * r * 0.85, y: r * 0.85 }, { x: d * r * 0.8, y: -r * 0.8 }], color, w);
      line(ctx, [{ x: -d * r * 0.62 - r * 0.2, y: r * 0.62 - d * r * 0.2 }, { x: -d * r * 0.62 + r * 0.2, y: r * 0.62 + d * r * 0.2 }], color, w);
    }
  } else if (kind === 'hammer') {
    ctx.rotate(-0.6);
    line(ctx, [{ x: 0, y: r * 0.95 }, { x: 0, y: -r * 0.3 }], color, Math.max(1, r * 0.22));
    poly(ctx, [{ x: -r * 0.6, y: -r * 0.85 }, { x: r * 0.6, y: -r * 0.85 }, { x: r * 0.6, y: -r * 0.3 }, { x: -r * 0.6, y: -r * 0.3 }], color, 0);
  } else {
    crest(ctx, 0, 0, r, color);
  }
  ctx.restore();
}

/** Split shop curtain (noren) over a doorway on the front-right face, with the building's mark. */
function noren(ctx: Ctx, hw: number, hh: number, base: number, f: number, top: number, color: string, kind: Mark, markColor = WASHI, len = 10): void {
  const half = Math.max(6, hw * 0.17) / hw;
  const a = onRight(hw, hh, base, f - half, top);
  const b = onRight(hw, hh, base, f + half, top);
  const c = { x: b.x, y: b.y + len };
  const d = { x: a.x, y: a.y + len };
  ctx.save();
  ctx.shadowColor = 'rgba(20,16,30,0.25)';
  ctx.shadowOffsetY = 1.5;
  poly(ctx, [a, b, c, d], color, 1.1);
  ctx.restore();
  poly(ctx, [a, b, { x: b.x, y: b.y + 2.4 }, { x: a.x, y: a.y + 2.4 }], darken(color, 0.3), 0.9);
  // Slits between the panels.
  for (const s of [1 / 3, 2 / 3]) {
    const p = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
    line(ctx, [{ x: p.x, y: p.y + len * 0.42 }, { x: p.x, y: p.y + len }], darken(color, 0.45), 1);
  }
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + len * 0.55 };
  mark(ctx, kind, m.x, m.y, len * 0.32, markColor);
}

/** Painted round crest on a wall face (a white disc with the building's mark). */
function wallMon(ctx: Ctx, x: number, y: number, r: number, kind: Mark, color: string, disc = WASHI): void {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 1.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(INK, 0.7);
  ctx.stroke();
  mark(ctx, kind, x, y, r * 0.66, color);
}

/** Hanging wooden signboard (kanban) on a post, with a mark. */
function signboard(ctx: Ctx, x: number, y: number, h: number, kind: Mark, markColor: string, board = '#6b4a2e'): void {
  line(ctx, [{ x, y }, { x, y: y - h }], WOOD_DARK, 2.2);
  line(ctx, [{ x: x - 1, y: y - h }, { x: x + 9, y: y - h - 3 }], WOOD_DARK, 1.8);
  const bx = x + 7;
  const by = y - h + 6;
  line(ctx, [{ x: bx - 3, y: by - 7 }, { x: bx - 3, y: by - 3 }], INK, 0.8);
  line(ctx, [{ x: bx + 3, y: by - 8.5 }, { x: bx + 3, y: by - 4.5 }], INK, 0.8);
  poly(ctx, [{ x: bx - 6.5, y: by - 2 }, { x: bx + 6.5, y: by - 5 }, { x: bx + 6.5, y: by + 9 }, { x: bx - 6.5, y: by + 12 }], board, 1.1);
  line(ctx, [{ x: bx - 5.5, y: by - 0.8 }, { x: bx + 5.5, y: by - 3.4 }], rgba('#ffffff', 0.25), 1);
  mark(ctx, kind, bx, by + 3.6, 4.6, markColor);
}

/** Thin rising smoke or steam: soft overlapping puffs. */
function wisp(ctx: Ctx, x: number, y: number, n: number, color = '#ffffff', a = 0.5): void {
  for (let i = 0; i < n; i++) {
    const r = 3 + i * 1.4;
    const px = x + Math.sin(i * 1.3) * (2 + i);
    const py = y - i * 6.5;
    const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
    g.addColorStop(0, rgba(color, a * (1 - i / (n + 1))));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Namako lattice: white diagonal grid on dark tiles, the mark of a fire-proof storehouse. */
function namako(ctx: Ctx, quad: Pt[], spacing = 5.5): void {
  ctx.save();
  ctx.beginPath();
  quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.min(...xs) - 30;
  const x1 = Math.max(...xs) + 30;
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const span = y1 - y0 + 40;
  ctx.strokeStyle = rgba('#f4f0e6', 0.88);
  ctx.lineWidth = 1.3;
  for (let x = x0; x < x1; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, y0 - 20);
    ctx.lineTo(x + span * 0.8, y0 - 20 + span);
    ctx.moveTo(x, y0 - 20);
    ctx.lineTo(x - span * 0.8, y0 - 20 + span);
    ctx.stroke();
  }
  ctx.restore();
}

/** A stack of rice bales, bottom row first (2..4 rows by count). */
function balePile(ctx: Ctx, x: number, y: number, count: number, s = 1): void {
  let row = 0;
  let left = count;
  let width = Math.min(3, count);
  while (left > 0 && width > 0) {
    const n = Math.min(width, left);
    for (let i = 0; i < n; i++) riceBale(ctx, x + (i - (n - 1) / 2) * 12 * s, y - row * 7.5 * s, s);
    left -= n;
    row++;
    width--;
  }
}

/** A banded strongbox. */
function chest(ctx: Ctx, x: number, y: number, s = 1): void {
  ctx.save();
  ctx.translate(x, y);
  block(ctx, 7 * s, 3.5 * s, 0, 7 * s, '#7a4a2a', { top: '#9a6238', lw: 1 });
  for (const bx of [-3.5 * s, 3.5 * s]) line(ctx, [{ x: bx, y: -5.25 * s }, { x: bx, y: 1.75 * s }], GOLD, 1.1);
  circle(ctx, -1.6 * s, -2.2 * s, 1.2 * s, GOLD, 0.5);
  ctx.restore();
}

const half = (size: number) => ({ hw: (size * TILE_W) / 2, hh: (size * TILE_H) / 2 });

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/** Clan Keep: castle tower on a stone plinth; one storey per tier. Skins recolour roof and trim. */
export function keepSkin(roofColor: string, trimColor: string): PainterDef {
  return {
    extra: 190,
    paint(ctx, size, tier) {
      const { hw, hh } = half(size);
      plate(ctx, size, '#b9a98c');
      softShadow(ctx, hw * 0.82, hh * 0.82, 6, 0.32);
      const pw = hw * 0.78;
      const ph = hh * 0.78;
      let y = stoneBase(ctx, pw, ph, 6, 26);
      // Stone steps up the plinth to the gate on the front-right face.
      for (let i = 0; i < 4; i++) {
        const f0 = 0.38;
        const f1 = 0.62;
        const up = i * 6.5;
        const out = (4 - i) * 3;
        const a = onRight(pw, ph, 6, f0, up);
        const b = onRight(pw, ph, 6, f1, up);
        const o = { x: out, y: out * 0.5 };
        poly(ctx, [a, b, { x: b.x + o.x, y: b.y + o.y }, { x: a.x + o.x, y: a.y + o.y }], lighten(STONE, 0.18), 1);
        poly(ctx, [{ x: a.x + o.x, y: a.y + o.y }, { x: b.x + o.x, y: b.y + o.y }, { x: b.x + o.x, y: b.y + o.y + 3 }, { x: a.x + o.x, y: a.y + o.y + 3 }], darken(STONE, 0.12), 1);
      }
      const storeys = tier + 1;
      let w = hw * 0.62;
      for (let i = 0; i < storeys; i++) {
        const h = i === 0 ? 30 : 24;
        const top = storey(ctx, w, w / 2, y, h, PLASTER, { window: true, door: i === 0, trim: trimColor });
        const last = i === storeys - 1;
        const rw = w + 14;
        const apex = roof(ctx, rw, rw / 2, top + 4, last ? 40 : 22, roofColor, { finial: last ? (tier === 3 ? GOLD : trimColor) : undefined, tips: tier >= 2 ? GOLD : undefined });
        y = last ? apex : top - 6;
        w *= 0.74;
      }
      if (tier >= 2) {
        banner(ctx, -hw * 0.62, hh * 0.1, 70, trimColor);
        banner(ctx, hw * 0.55, hh * 0.05, 70, trimColor);
      }
      if (tier >= 3) {
        lantern(ctx, -hw * 0.3, hh * 0.35, 1.1);
        lantern(ctx, hw * 0.3, hh * 0.35, 1.1);
      }
      // The clan crest on a white gable plate.
      ctx.beginPath();
      ctx.ellipse(-hw * 0.18, -48, 9, 9.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fbf7ee';
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = rgba(INK, 0.7);
      ctx.stroke();
      crest(ctx, -hw * 0.18, -48, 7, trimColor);
    },
  };
}

/** Coin Mint (produces coins): a working foundry. Furnace glow, a smoking chimney, a gold noren. */
const coinMint: PainterDef = {
  extra: 92,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#b8a07a');
    softShadow(ctx, hw * 0.62, hh * 0.62, 2, 0.22);
    const sw = hw * 0.55;
    const sh = hh * 0.55;
    const top = storey(ctx, sw, sh, -4, 26, '#e8dcc6', { door: true, window: tier >= 2 });
    // Furnace mouth on the left wall: the warm glow says "something is being made here".
    const fm = onLeft(sw, sh, -4, 0.42, 4);
    glow(ctx, fm.x, fm.y - 6, 16);
    ctx.beginPath();
    ctx.moveTo(fm.x - 6, fm.y - 3);
    ctx.lineTo(fm.x - 6, fm.y - 9);
    ctx.quadraticCurveTo(fm.x, fm.y - 17, fm.x + 6, fm.y - 3);
    ctx.lineTo(fm.x + 6, fm.y + 3);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, fm.y - 14, 0, fm.y + 3);
    fg.addColorStop(0, '#ffe08a');
    fg.addColorStop(1, '#e8662e');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#4a3a30';
    ctx.stroke();
    // Chimney behind the roof, with a wisp of smoke.
    ctx.save();
    ctx.translate(-hw * 0.3, 0);
    const ct = block(ctx, 4.5, 2.25, top - 2, 32, '#7d838e', { top: '#3a3f48', lw: 1.1 });
    ctx.restore();
    roof(ctx, hw * 0.75, hh * 0.75, top + 2, 26, tier >= 3 ? '#6b3f2a' : ROOF, { finial: tier >= 2 ? GOLD : undefined });
    wisp(ctx, -hw * 0.3, ct - 6, 3 + tier, '#eef0f4', 0.6);
    noren(ctx, sw, sh, -4, 0.45, 15, '#c99a2e', 'coin', '#fff4d6');
    coinStack(ctx, -hw * 0.55, hh * 0.35, 3 + tier);
    coinStack(ctx, -hw * 0.38, hh * 0.55, 2 + tier);
    if (tier >= 2) coinStack(ctx, -hw * 0.68, hh * 0.55, 1 + tier);
    // Hanging sign with a square-holed coin.
    line(ctx, [{ x: hw * 0.62, y: hh * 0.2 }, { x: hw * 0.62, y: -30 }], WOOD_DARK, 2);
    mark(ctx, 'coin', hw * 0.62, -36, 7, GOLD);
  },
};

/** Rice Paddy (produces rice): terraced water with rows of sprouts, a bamboo spout keeping it filled. */
const ricePaddy: PainterDef = {
  extra: 60,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#8a7a5a');
    for (const [s, dy] of [[0.86, 2], [0.56, -6]] as const) {
      const w = hw * s;
      const h = hh * s;
      const top = block(ctx, w, h, dy, 5, '#7a6646', { top: '#7fb4c8' });
      // Water: sky reflected light-to-deep, with a few glints.
      const g = ctx.createLinearGradient(-w, top - h, w, top + h);
      g.addColorStop(0, '#b6dbe6');
      g.addColorStop(0.5, '#7fb4c8');
      g.addColorStop(1, '#5f97ad');
      poly(ctx, [{ x: 0, y: top - h + 2 }, { x: w - 4, y: top }, { x: 0, y: top + h - 2 }, { x: -w + 4, y: top }], g, 0);
      for (const [gx, gy] of [[-0.35, -0.15], [0.2, 0.2], [0.05, -0.4]] as const) line(ctx, [{ x: gx * w - 5, y: top + gy * h }, { x: gx * w + 5, y: top + gy * h - 2.5 }], rgba('#ffffff', 0.55), 1);
      const r = artRng(Math.round(w));
      for (let i = 0; i < 18 + tier * 6; i++) {
        const u = r() * 1.6 - 0.8;
        const v = (r() * 1.6 - 0.8) * (1 - Math.abs(u));
        const x = u * w;
        const y = dy - 5 + v * h;
        line(ctx, [{ x, y: y + 1 }, { x: x + 3, y: y + 1 }], rgba('#2f5d6e', 0.25), 1);
        line(ctx, [{ x, y }, { x: x - 1, y: y - 5 }], '#4f8f3c', 1.4);
        line(ctx, [{ x, y }, { x: x + 2, y: y - 4 }], '#7cc25c', 1.2);
      }
    }
    // Bamboo spout pouring into the upper terrace.
    const sx = -hw * 0.42;
    const sy = -hh * 0.28;
    line(ctx, [{ x: sx - 4, y: sy + 2 }, { x: sx - 4, y: sy - 14 }], darken(BAMBOO, 0.35), 2.2);
    line(ctx, [{ x: sx - 8, y: sy - 15 }, { x: sx + 6, y: sy - 9 }], darken(BAMBOO, 0.35), 4.2);
    line(ctx, [{ x: sx - 8, y: sy - 15 }, { x: sx + 6, y: sy - 9 }], BAMBOO, 2.8);
    line(ctx, [{ x: sx + 6, y: sy - 8 }, { x: sx + 7, y: sy - 1 }], rgba('#d9f1f7', 0.85), 1.6);
    ctx.beginPath();
    ctx.ellipse(sx + 7, sy, 3.5, 1.4, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba('#ffffff', 0.6);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Scarecrow-post with a straw hat; tier 3 adds a lantern.
    line(ctx, [{ x: hw * 0.45, y: -2 }, { x: hw * 0.45, y: -38 }], WOOD_DARK, 2.4);
    line(ctx, [{ x: hw * 0.45 - 10, y: -28 }, { x: hw * 0.45 + 10, y: -28 }], WOOD_DARK, 2);
    poly(ctx, [{ x: hw * 0.45 - 11, y: -38 }, { x: hw * 0.45, y: -46 }, { x: hw * 0.45 + 11, y: -38 }], RICE, 1.1);
    line(ctx, [{ x: hw * 0.45 - 9, y: -38.5 }, { x: hw * 0.45 + 9, y: -38.5 }], darken(RICE, 0.3), 0.8);
    riceBale(ctx, -hw * 0.5, hh * 0.45, 1);
    if (tier >= 2) riceBale(ctx, -hw * 0.3, hh * 0.6, 1);
    if (tier >= 3) lantern(ctx, hw * 0.45 + 10, -22, 0.8);
  },
};

/** Treasury (stores coins): a fire-proof kura. Namako lattice walls, a banded door with a gold lock, strongboxes. */
const treasury: PainterDef = {
  extra: 84,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a99a80');
    softShadow(ctx, hw * 0.7, hh * 0.7, 2, 0.22);
    const y = stoneBase(ctx, hw * 0.68, hh * 0.68, 2, 8);
    const kw = hw * 0.6;
    const kh = hh * 0.6;
    block(ctx, kw, kh, y, 14, '#3a3f48');
    namako(ctx, [onLeft(kw, kh, y, 0, 0), onLeft(kw, kh, y, 1, 0), onLeft(kw, kh, y, 1, 14), onLeft(kw, kh, y, 0, 14)]);
    namako(ctx, [onRight(kw, kh, y, 0, 0), onRight(kw, kh, y, 1, 0), onRight(kw, kh, y, 1, 14), onRight(kw, kh, y, 0, 14)]);
    const top = storey(ctx, kw, kh, y - 14, 22, '#f6f1e6', { trim: tier >= 2 ? GOLD : undefined });
    // Small barred window high on the left wall.
    const w = onLeft(kw, kh, y - 14, 0.5, 13);
    poly(ctx, [{ x: w.x - 4, y: w.y - 2 }, { x: w.x + 4, y: w.y + 2 }, { x: w.x + 4, y: w.y + 8 }, { x: w.x - 4, y: w.y + 4 }], '#2c2f36', 1);
    for (const dx of [-1.5, 1.5]) line(ctx, [{ x: w.x + dx, y: w.y + dx * 0.5 - 1 }, { x: w.x + dx, y: w.y + dx * 0.5 + 6 }], '#9aa0aa', 1);
    // Heavy door across both storeys, iron-banded, with a gold lock plate.
    const d0 = onRight(kw, kh, y, 0.42, 0);
    const d1 = onRight(kw, kh, y, 0.74, 0);
    const dh = 30;
    poly(ctx, [d0, d1, { x: d1.x, y: d1.y - dh }, { x: d0.x, y: d0.y - dh }], '#4d3a2a', 1.3);
    for (const f of [0.25, 0.6]) line(ctx, [{ x: d0.x, y: d0.y - dh * f }, { x: d1.x, y: d1.y - dh * f }], '#2a2c33', 2);
    const lk = { x: (d0.x + d1.x) / 2, y: (d0.y + d1.y) / 2 - dh * 0.42 };
    poly(ctx, [{ x: lk.x - 3, y: lk.y - 3 }, { x: lk.x + 3, y: lk.y - 4.5 }, { x: lk.x + 3, y: lk.y + 3 }, { x: lk.x - 3, y: lk.y + 4.5 }], GOLD, 0.8, darken(GOLD, 0.5));
    circle(ctx, lk.x, lk.y, 0.9, INK, 0);
    roof(ctx, hw * 0.78, hh * 0.78, top + 2, 24, ROOF, { finial: tier >= 2 ? GOLD : undefined });
    // Coin crest on the plaster: this kura holds coins.
    const mc = onLeft(kw, kh, y - 14, 0.18, 12);
    wallMon(ctx, mc.x + 3, mc.y, 5, 'coin', GOLD, '#fbf7ee');
    chest(ctx, -hw * 0.52, hh * 0.5, 1);
    if (tier >= 2) chest(ctx, -hw * 0.3, hh * 0.66, 0.9);
    coinStack(ctx, -hw * 0.72, hh * 0.62, 2 + tier);
    if (tier >= 3) coinStack(ctx, -hw * 0.6, hh * 0.78, 4);
  },
};

/** Provision Storehouse (stores rice): a raised granary with bales stacked high and a rice crest. */
const provisionStorehouse: PainterDef = {
  extra: 92,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a8946c');
    softShadow(ctx, hw * 0.6, hh * 0.6, 2, 0.2);
    // Raised granary on posts, thatched roof.
    for (const [x, y] of [[-hw * 0.45, 0], [hw * 0.45, 0], [0, hh * 0.45], [0, -hh * 0.45]] as const) line(ctx, [{ x, y }, { x, y: y - 16 }], WOOD_DARK, 3);
    const gw = hw * 0.5;
    const gh = hh * 0.5;
    const top = block(ctx, gw, gh, -16, 24, '#b98a58');
    for (let i = 1; i < 4; i++) line(ctx, [{ x: -gw, y: -16 - i * 6 }, { x: 0, y: -16 - i * 6 + gh }, { x: gw, y: -16 - i * 6 }], rgba(WOOD_DARK, 0.5), 1);
    roof(ctx, hw * 0.74, hh * 0.74, top + 2, 30, '#c9a65e', { flare: 3 });
    // Rice crest under the eave of the thatch: this granary holds rice.
    const mc = onRight(gw, gh, -16, 0.42, 6);
    wallMon(ctx, mc.x, mc.y, 6, 'rice', '#a87a22', '#f4ead6');
    // A pyramid of bales in front grows with the tier: a full store.
    balePile(ctx, -hw * 0.5, hh * 0.5, 2 + tier, 1);
    if (tier >= 2) balePile(ctx, hw * 0.45, hh * 0.55, tier, 0.9);
  },
};

/** Artisan's Hut (builders): a carpenter's workshop with stacked timber, a mallet and a hammer sign. */
const artisanHut: PainterDef = {
  extra: 64,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#b29d7c');
    softShadow(ctx, hw * 0.55, hh * 0.55, 0, 0.2);
    const top = storey(ctx, hw * 0.5, hh * 0.5, -2, 20, '#d9c9a8', { door: true });
    roof(ctx, hw * 0.72, hh * 0.72, top + 2, 26, '#b89150', { flare: 3 });
    // Timber stack: logs seen end-on, planks across the top.
    const lx = -hw * 0.5;
    const ly = hh * 0.42;
    for (const [dx, dy] of [[-5, 0], [1, 3], [-2, -5]] as const) {
      circle(ctx, lx + dx, ly + dy, 3.4, '#c9a07a', 1);
      circle(ctx, lx + dx, ly + dy, 1.4, 'rgba(0,0,0,0)', 0.6, '#8a6440');
    }
    line(ctx, [{ x: lx - 9, y: ly - 9 }, { x: lx + 9, y: ly - 1 }], '#d8b07c', 2.6);
    line(ctx, [{ x: lx - 9, y: ly - 9 }, { x: lx + 9, y: ly - 1 }], rgba(INK, 0.5), 0.6);
    // Sawhorse with a big mallet resting on it.
    line(ctx, [{ x: -hw * 0.15, y: hh * 0.62 }, { x: hw * 0.15, y: hh * 0.74 }], WOOD, 3);
    line(ctx, [{ x: -hw * 0.1, y: hh * 0.65 }, { x: -hw * 0.13, y: hh * 0.88 }], WOOD_DARK, 1.6);
    line(ctx, [{ x: hw * 0.1, y: hh * 0.72 }, { x: hw * 0.13, y: hh * 0.95 }], WOOD_DARK, 1.6);
    line(ctx, [{ x: -2, y: hh * 0.64 }, { x: 8, y: hh * 0.5 }], WOOD_DARK, 1.6);
    poly(ctx, [{ x: 5, y: hh * 0.42 }, { x: 13, y: hh * 0.46 }, { x: 11, y: hh * 0.58 }, { x: 3, y: hh * 0.54 }], '#a0703f', 1);
    signboard(ctx, hw * 0.55, hh * 0.2, 30, 'hammer', '#f4ead6');
    if (tier >= 2) lantern(ctx, hw * 0.55, -10, 0.8);
  },
};

/** Training Dojo (trains warriors): vermilion noren with crossed blades, a straw target and a sword rack. */
const trainingDojo: PainterDef = {
  extra: 100,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#c2b08e');
    softShadow(ctx, hw * 0.72, hh * 0.72, 2, 0.22);
    const y = stoneBase(ctx, hw * 0.7, hh * 0.7, 2, 8);
    const dw = hw * 0.62;
    const dh = hh * 0.62;
    const top = storey(ctx, dw, dh, y, 26, '#efe5d2', { door: true, window: true, trim: VERMILION });
    // Sword rack on the left wall: three practice blades.
    const r0 = onLeft(dw, dh, y, 0.14, 7);
    const r1 = onLeft(dw, dh, y, 0.38, 7);
    line(ctx, [r0, r1], WOOD_DARK, 2);
    line(ctx, [{ x: r0.x, y: r0.y - 12 }, { x: r1.x, y: r1.y - 12 }], WOOD_DARK, 2);
    for (let i = 0; i < 3; i++) {
      const f = 0.2 + i * 0.3;
      const p = { x: r0.x + (r1.x - r0.x) * f, y: r0.y + (r1.y - r0.y) * f };
      line(ctx, [{ x: p.x, y: p.y + 2 }, { x: p.x + 1, y: p.y - 16 }], '#d9dde3', 1.5);
      line(ctx, [{ x: p.x - 1.5, y: p.y - 1 }, { x: p.x + 1.5, y: p.y - 1 }], INK, 1.2);
    }
    const apex = roof(ctx, hw * 0.86, hh * 0.86, top + 3, tier >= 2 ? 34 : 28, ROOF, { finial: tier >= 3 ? GOLD : VERMILION });
    if (tier >= 2) roof(ctx, hw * 0.36, hh * 0.36, apex + 12, 16, ROOF);
    noren(ctx, dw, dh, y, 0.45, 15, VERMILION, 'blades');
    // Straw practice target (makiwara) and banners.
    const tx = -hw * 0.66;
    const ty = hh * 0.45;
    line(ctx, [{ x: tx, y: ty }, { x: tx, y: ty - 24 }], WOOD, 3);
    ctx.beginPath();
    ctx.ellipse(tx, ty - 26, 5.5, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = RICE;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = darken(RICE, 0.5);
    ctx.stroke();
    circle(ctx, tx, ty - 26, 3, 'rgba(0,0,0,0)', 1.2, VERMILION);
    circle(ctx, tx, ty - 26, 1, VERMILION, 0);
    banner(ctx, hw * 0.62, hh * 0.25, 54);
    if (tier >= 3) banner(ctx, hw * 0.4, hh * 0.5, 54, '#3f6fa0');
  },
};

/** Squad Courtyard (houses the army): a camp walled by jinmaku curtains, with a campfire, weapon rack and banners. */
const squadCourtyard: PainterDef = {
  extra: 54,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#cdbf9f', 2);
    // Raked sand rings around the fire.
    for (const r of [0.28, 0.44]) {
      ctx.beginPath();
      ctx.ellipse(0, 2, hw * r, hh * r, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(darken('#cdbf9f', 0.3), 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const corners = [{ x: 0, y: -hh + 6 }, { x: hw - 10, y: 0 }, { x: 0, y: hh - 6 }, { x: -hw + 10, y: 0 }];
    // Back edges: camp curtains (jinmaku) on posts, white with an indigo band and the clan crest.
    for (const [ai, bi] of [[3, 0], [0, 1]] as const) {
      const a = corners[ai];
      const b = corners[bi];
      const H = 16;
      const cloth = [a, b, { x: b.x, y: b.y - H }, { x: a.x, y: a.y - H }];
      poly(ctx, cloth, faceFill(ctx, '#f4efe4', a.y - H, a.y, 0.04, 0.12), 1.1);
      const band = (t0: number, t1: number) => [
        { x: a.x, y: a.y - H * t0 }, { x: b.x, y: b.y - H * t0 }, { x: b.x, y: b.y - H * t1 }, { x: a.x, y: a.y - H * t1 },
      ];
      poly(ctx, band(0.62, 0.8), '#3f6fa0', 0);
      poly(ctx, band(0.12, 0.26), '#3f6fa0', 0);
      // Folds.
      for (let k = 1; k < 6; k++) {
        const x = a.x + ((b.x - a.x) * k) / 6;
        const yy = a.y + ((b.y - a.y) * k) / 6;
        line(ctx, [{ x, y: yy - H + 1 }, { x, y: yy - 1 }], rgba(INK, 0.12), 0.8);
      }
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - H * 0.44 };
      crest(ctx, m.x, m.y, 4, '#3f6fa0');
      for (const p of [a, b]) line(ctx, [{ x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - H - 4 }], WOOD_DARK, 2);
    }
    // Front edges: low bamboo fence with a gate gap.
    for (const [ai, bi] of [[1, 2], [2, 3]] as const) {
      const a = corners[ai];
      const b = corners[bi];
      for (let k = 0; k <= 8; k++) {
        const x = a.x + ((b.x - a.x) * k) / 8;
        const yy = a.y + ((b.y - a.y) * k) / 8;
        if (ai === 2 && k < 3) continue; // gate gap
        line(ctx, [{ x, y: yy }, { x, y: yy - 9 }], darken(BAMBOO, 0.25), 2.6);
        line(ctx, [{ x: x - 0.4, y: yy - 0.5 }, { x: x - 0.4, y: yy - 8.5 }], lighten(BAMBOO, 0.15), 1);
      }
      line(ctx, [{ x: a.x, y: a.y - 6 }, { x: b.x, y: b.y - 6 }], darken(BAMBOO, 0.3), 1.4);
    }
    // Campfire on a stone ring.
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      circle(ctx, Math.cos(ang) * 7, 2 + Math.sin(ang) * 3.5, 1.8, '#8a8f99', 0.6);
    }
    glow(ctx, 0, -2, 16);
    poly(ctx, [{ x: -4, y: 2 }, { x: 0, y: -10 }, { x: 4, y: 2 }], '#f2933a', 0.8);
    poly(ctx, [{ x: -2, y: 2 }, { x: 0, y: -5 }, { x: 2, y: 2 }], '#ffe08a', 0);
    wisp(ctx, 1, -14, 3, '#eef0f4', 0.35);
    // Spear rack and banners per tier.
    for (let i = 0; i < 3; i++) line(ctx, [{ x: -hw * 0.45 + i * 6, y: -hh * 0.2 + i * 3 }, { x: -hw * 0.45 + i * 6 + 3, y: -hh * 0.2 + i * 3 - 22 }], '#c9ced6', 1.6);
    line(ctx, [{ x: -hw * 0.48, y: -hh * 0.2 - 12 }, { x: -hw * 0.45 + 16, y: -hh * 0.2 - 6 }], WOOD_DARK, 1.6);
    for (let i = 0; i < tier; i++) banner(ctx, hw * 0.3 + i * 10, -hh * 0.25 + i * 5, 40, i === 1 ? '#3f6fa0' : VERMILION);
  },
};

/** An upright kunai: leaf blade, wrapped grip and ring pommel. */
function kunaiFinial(ctx: Ctx, x: number, y: number, tier: Tier): void {
  const steel = tier >= 3 ? GOLD : '#d4d9e0';
  circle(ctx, x, y - 1, 3.2, 'rgba(0,0,0,0)', 1.6, WOOD_DARK);
  poly(ctx, [{ x: x - 1.6, y: y - 4 }, { x: x + 1.6, y: y - 4 }, { x: x + 1.6, y: y - 12 }, { x: x - 1.6, y: y - 12 }], '#3a2a1e', 0.8);
  line(ctx, [{ x: x - 2.4, y: y - 12.5 }, { x: x + 2.4, y: y - 12.5 }], INK, 1.6);
  poly(ctx, [{ x: x - 4.2, y: y - 15 }, { x, y: y - 32 }, { x: x + 4.2, y: y - 15 }, { x, y: y - 12.5 }], steel, 1.1);
  line(ctx, [{ x, y: y - 14 }, { x, y: y - 29 }], rgba('#ffffff', 0.7), 0.9);
}

const kunaiTower: PainterDef = {
  extra: 140,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a9a08c');
    const y = stoneBase(ctx, hw * 0.55, hh * 0.55, 2, tier >= 2 ? 22 : 14);
    // Timber legs with cross braces up to a lookout.
    const lh = 34;
    const lw = hw * 0.36;
    for (const [x, yy] of [[-lw, y], [lw, y], [0, y + lw / 2], [0, y - lw / 2]] as const) line(ctx, [{ x, y: yy }, { x, y: yy - lh }], WOOD_DARK, 3);
    line(ctx, [{ x: -lw, y }, { x: 0, y: y + lw / 2 - lh }], WOOD, 1.6);
    line(ctx, [{ x: 0, y: y + lw / 2 }, { x: lw, y: y - lh }], WOOD, 1.6);
    const deck = block(ctx, lw + 6, (lw + 6) / 2, y - lh, 8, WOOD);
    const roofTop = roof(ctx, lw + 14, (lw + 14) / 2, deck - 12, 20, tier >= 3 ? '#6b3f2a' : ROOF);
    // Kunai bundle on the rail.
    for (let i = 0; i < 3; i++) poly(ctx, [{ x: 4 + i * 4, y: deck - 2 }, { x: 6 + i * 4, y: deck - 12 }, { x: 8 + i * 4, y: deck - 2 }], '#c9ced6', 0.8);
    // A great kunai crowns the roof (as the shuriken crowns the Pagoda): this tower throws blades.
    kunaiFinial(ctx, 0, roofTop - 2, tier);
    if (tier >= 2) banner(ctx, -hw * 0.6, hh * 0.3, 44);
  },
};

/** Firework Mortar: a banded bronze tube angled skyward, a smouldering fuse and a crate of shells. */
const fireworkMortar: PainterDef = {
  extra: 78,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a69c88');
    softShadow(ctx, hw * 0.65, hh * 0.65, 2, 0.22);
    const y = stoneBase(ctx, hw * 0.62, hh * 0.62, 2, 12);
    // Timber cradle under the tube.
    line(ctx, [{ x: -14, y: y - 2 }, { x: 0, y: y - 16 }], WOOD_DARK, 3.4);
    line(ctx, [{ x: 10, y: y + 2 }, { x: 4, y: y - 14 }], WOOD_DARK, 3.4);
    const metal = tier >= 3 ? '#b88a3e' : '#7a6a52';
    ctx.save();
    ctx.translate(2, y - 8);
    ctx.rotate(-0.55);
    const g = ctx.createLinearGradient(0, -14, 0, 14);
    g.addColorStop(0, lighten(metal, 0.35));
    g.addColorStop(0.35, metal);
    g.addColorStop(1, darken(metal, 0.35));
    poly(ctx, [{ x: -10, y: -13 }, { x: 34, y: -14 }, { x: 34, y: 14 }, { x: -10, y: 13 }], g, 1.6);
    ctx.beginPath();
    ctx.ellipse(-10, 0, 4, 13, 0, Math.PI / 2, Math.PI * 1.5);
    ctx.fillStyle = darken(metal, 0.2);
    ctx.fill();
    ctx.stroke();
    for (const x of [0, 14, 28]) {
      line(ctx, [{ x, y: -14 }, { x, y: 14 }], tier >= 2 ? GOLD : '#4a3f30', 2.6);
      line(ctx, [{ x: x - 0.8, y: -12 }, { x: x - 0.8, y: -5 }], rgba('#ffffff', 0.4), 0.7);
    }
    ctx.beginPath();
    ctx.ellipse(34, 0, 5, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = lighten(metal, 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(34.5, 0, 3.2, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1e1a18';
    ctx.fill();
    // Fuse leading to a spark at the breech.
    line(ctx, [{ x: -4, y: -13 }, { x: -8, y: -20 }], '#3a2a1e', 1.2);
    ctx.restore();
    const spark = { x: -4, y: y - 30 };
    glow(ctx, spark.x, spark.y, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      line(ctx, [spark, { x: spark.x + Math.cos(a) * 3.5, y: spark.y + Math.sin(a) * 3.5 }], '#ffd27a', 1);
    }
    wisp(ctx, 28, y - 52, 2 + tier, '#d9dde3', 0.4);
    // Crate of red shells with fuses.
    ctx.save();
    ctx.translate(-hw * 0.48, hh * 0.42);
    const ct = block(ctx, 9, 4.5, 0, 6, WOOD, { lw: 1 });
    for (let i = 0; i < 2 + tier; i++) {
      const x = -5 + (i % 3) * 5;
      const yy = ct - 1 - Math.floor(i / 3) * 4 + (i % 3) * 0.8;
      circle(ctx, x, yy, 3.2, VERMILION, 0.9);
      circle(ctx, x - 1, yy - 1, 1, rgba('#ffffff', 0.5), 0);
      line(ctx, [{ x, y: yy - 3 }, { x: x + 1.5, y: yy - 5.5 }], '#3a2a1e', 0.9);
    }
    ctx.restore();
  },
};

const shurikenPagoda: PainterDef = {
  extra: 110,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a9a08c');
    let y = stoneBase(ctx, hw * 0.6, hh * 0.6, 2, 8);
    let w = hw * 0.45;
    for (let i = 0; i < 1 + tier; i++) {
      const top = storey(ctx, w, w / 2, y, 14, '#efe5d2', { trim: VERMILION });
      y = roof(ctx, w + 10, (w + 10) / 2, top + 2, 12, '#7a2e26') + 6;
      w *= 0.78;
    }
    // A big shuriken on the spire.
    ctx.save();
    ctx.translate(0, y - 16);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      poly(ctx, [{ x: 0, y: -2.5 }, { x: 12, y: 0 }, { x: 0, y: 2.5 }], tier >= 3 ? GOLD : '#c9ced6', 1);
    }
    circle(ctx, 0, 0, 2.4, INK, 0);
    ctx.restore();
    line(ctx, [{ x: 0, y: y - 6 }, { x: 0, y: y + 2 }], WOOD_DARK, 2);
  },
};

const skyBowTower: PainterDef = {
  extra: 150,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a9a08c');
    const y = stoneBase(ctx, hw * 0.5, hh * 0.5, 2, 12);
    const top = block(ctx, hw * 0.3, hh * 0.3, y, 54 + tier * 8, '#d8cdb8');
    const deck = block(ctx, hw * 0.5, hh * 0.5, top, 6, WOOD);
    roof(ctx, hw * 0.62, hh * 0.62, deck - 16, 18, ROOF, { finial: tier >= 3 ? GOLD : undefined });
    // A great bow drawn skyward.
    ctx.beginPath();
    ctx.moveTo(-8, deck - 2);
    ctx.quadraticCurveTo(-20, deck - 26, -4, deck - 48);
    ctx.lineWidth = 3;
    ctx.strokeStyle = WOOD_DARK;
    ctx.stroke();
    line(ctx, [{ x: -8, y: deck - 2 }, { x: -4, y: deck - 48 }], '#e8e0cc', 1);
    line(ctx, [{ x: -12, y: deck - 24 }, { x: 10, y: deck - 40 }], '#c9ced6', 1.6);
    if (tier >= 2) banner(ctx, hw * 0.45, hh * 0.2, 46, '#3f6fa0');
  },
};

/** Stone Wall: dressed stone, a white plaster band and a tiled coping; reinforced walls get iron bands. */
const stoneWall: PainterDef = {
  extra: 28,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    const color = tier === 1 ? '#a3a7ad' : tier === 2 ? '#8a909a' : '#6d7380';
    softShadow(ctx, hw * 0.95, hh * 0.95, 4, 0.25);
    const stoneTop = stoneBase(ctx, hw * 0.9, hh * 0.9, 2, 13, color);
    const top = block(ctx, hw * 0.9, hh * 0.9, stoneTop, 6, '#f1ebdf');
    // Tiled coping with an overhang.
    const cap = block(ctx, hw * 0.98, hh * 0.98, top, 3.5, ROOF, { top: lighten(ROOF, 0.18), lw: 1.1 });
    line(ctx, [{ x: -hw * 0.98 + 2, y: cap + 0.5 }, { x: 0, y: cap + hh * 0.98 - 0.5 }], rgba('#ffffff', 0.3), 0.8);
    if (tier >= 2) {
      line(ctx, [{ x: -hw * 0.9, y: stoneTop + 7 }, { x: 0, y: stoneTop + 7 + hh * 0.9 }, { x: hw * 0.9, y: stoneTop + 7 }], '#3a3f48', 2.2);
    }
    if (tier >= 3) {
      circle(ctx, -hw * 0.45, stoneTop + 7 + hh * 0.45, 1.6, GOLD, 0.6);
      circle(ctx, hw * 0.45, stoneTop + 7 + hh * 0.45, 1.6, GOLD, 0.6);
    }
  },
};

const spikePit: PainterDef = {
  extra: 16,
  paint(ctx, size) {
    const { hw, hh } = half(size);
    // A dug pit: dark earth shading into shadow, a rim of loose soil.
    const pts = [{ x: 0, y: -hh * 0.7 }, { x: hw * 0.7, y: 0 }, { x: 0, y: hh * 0.7 }, { x: -hw * 0.7, y: 0 }];
    const g = ctx.createLinearGradient(0, -hh * 0.7, 0, hh * 0.7);
    g.addColorStop(0, '#2a221a');
    g.addColorStop(1, '#5a4a38');
    poly(ctx, pts, g, 1.2, '#3a2f22');
    line(ctx, [pts[3], pts[0], pts[1]], rgba('#8a7458', 0.8), 1.6);
    const r = artRng(5);
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * hw;
      const y = (r() - 0.5) * hh * 0.6 + 2;
      poly(ctx, [{ x: x - 2.2, y }, { x, y: y - 12 }, { x: x + 2.2, y }], darken(BAMBOO, 0.15), 0.8);
      line(ctx, [{ x: x - 0.6, y: y - 1 }, { x: x - 0.2, y: y - 9 }], rgba('#ffffff', 0.45), 0.6);
    }
  },
};

const caltropField: PainterDef = {
  extra: 8,
  paint(ctx, size) {
    const { hw, hh } = half(size);
    const r = artRng(9);
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * hw * 1.2;
      const y = (r() - 0.5) * hh * 0.9;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 3.4, 1.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(INK, 0.18);
      ctx.fill();
      const a0 = r() * Math.PI;
      for (let k = 0; k < 4; k++) {
        const a = a0 + (k / 4) * Math.PI * 2;
        const tip = { x: x + Math.cos(a) * 3.8, y: y + Math.sin(a) * 2 - (k === 0 ? 3.5 : 0) };
        line(ctx, [{ x, y }, tip], '#4d535e', 1.6);
        line(ctx, [{ x: x - 0.3, y: y - 0.3 }, { x: (x + tip.x) / 2, y: (y + tip.y) / 2 - 0.3 }], rgba('#ffffff', 0.45), 0.6);
      }
    }
  },
};

const bonsai: PainterDef = {
  extra: 30,
  paint(ctx) {
    softShadow(ctx, 14, 6, 3, 0.25);
    block(ctx, 12, 6, 2, 7, '#7a3f2a');
    ctx.beginPath();
    ctx.ellipse(0, -5, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4a3a2c';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.quadraticCurveTo(-7, -12, 2, -18);
    ctx.lineWidth = 3;
    ctx.strokeStyle = WOOD_DARK;
    ctx.stroke();
    line(ctx, [{ x: -2, y: -11 }, { x: -7, y: -17 }], WOOD_DARK, 1.6);
    for (const [x, y, rx] of [[-7, -18, 8], [6, -22, 7], [0, -28, 6]] as const) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.55, 0, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(0, y - rx * 0.55, 0, y + rx * 0.55);
      g.addColorStop(0, '#5f9a5a');
      g.addColorStop(1, '#2f6238');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
      line(ctx, [{ x: x - rx * 0.5, y: y - rx * 0.2 }, { x: x + rx * 0.2, y: y - rx * 0.35 }], rgba('#ffffff', 0.3), 0.8);
    }
  },
};

const stoneLantern: PainterDef = {
  extra: 54,
  paint(ctx) {
    block(ctx, 10, 5, 2, 6, STONE);
    line(ctx, [{ x: 0, y: -4 }, { x: 0, y: -24 }], '#8a8f99', 6);
    block(ctx, 9, 4.5, -24, 10, '#a3a7ad', { top: '#c2c6cc' });
    poly(ctx, [{ x: -4, y: -30 }, { x: 4, y: -30 }, { x: 4, y: -24 }, { x: -4, y: -24 }], '#ffcf70', 0.8);
    roof(ctx, 14, 7, -35, 10, '#8a8f99', { flare: 3 });
    glow(ctx, 0, -27, 14);
  },
};

const zenGarden: PainterDef = {
  extra: 20,
  paint(ctx, size) {
    const { hw, hh } = half(size);
    // Raked gravel in a timber border, with three stones and their ripple rings.
    poly(ctx, [{ x: 0, y: -hh + 1 }, { x: hw - 2, y: 0 }, { x: 0, y: hh - 1 }, { x: -hw + 2, y: 0 }], WOOD, 1.1);
    const g = ctx.createRadialGradient(-hw * 0.2, -hh * 0.2, 2, 0, 0, hw);
    g.addColorStop(0, '#f4efe4');
    g.addColorStop(1, '#ddd5c4');
    poly(ctx, [{ x: 0, y: -hh + 4 }, { x: hw - 7, y: 0 }, { x: 0, y: hh - 4 }, { x: -hw + 7, y: 0 }], g, 0.8, '#b8b0a0');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -hh + 4);
    ctx.lineTo(hw - 7, 0);
    ctx.lineTo(0, hh - 4);
    ctx.lineTo(-hw + 7, 0);
    ctx.closePath();
    ctx.clip();
    for (let i = -6; i <= 6; i++) line(ctx, [{ x: -hw + i * 6, y: -hh }, { x: hw + i * 6, y: hh }], rgba('#b8ad98', 0.55), 0.8);
    ctx.restore();
    const stones = [[-6, -2, 4.5], [7, 3, 3.2], [2, -6, 2.4]] as const;
    for (const [x, y, r] of stones) {
      for (const k of [1.9, 1.45]) {
        ctx.beginPath();
        ctx.ellipse(x, y, r * k, r * k * 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#efe9dc';
        ctx.fill();
        ctx.strokeStyle = rgba('#b8ad98', 0.8);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    for (const [x, y, r] of stones) {
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.5, r, r * 0.8, 0, 0, Math.PI * 2);
      const sg = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      sg.addColorStop(0, '#9aa0aa');
      sg.addColorStop(1, '#5d636e');
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
      circle(ctx, x - r * 0.4, y - r * 0.9, r * 0.3, rgba('#6b9c52', 0.8), 0);
    }
  },
};

const foxStatue: PainterDef = {
  extra: 72,
  paint(ctx, size) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#b8b0a0', 10);
    softShadow(ctx, hw * 0.4, hh * 0.4, 2, 0.25);
    const top = stoneBase(ctx, 15, 7.5, 2, 14, STONE);
    // Seated fox guardian, stylised and original: stone body, red bib, a little moss.
    const s = 1.25;
    ctx.save();
    ctx.translate(0, top + 2);
    ctx.scale(s, s);
    const body = '#c4bfb2';
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.quadraticCurveTo(-9, -18, -4, -24);
    ctx.lineTo(4, -24);
    ctx.quadraticCurveTo(9, -18, 7, -2);
    ctx.closePath();
    ctx.fillStyle = faceFill(ctx, body, -24, -2, 0.12, 0.12);
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Tail curling up the back.
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.quadraticCurveTo(15, -10, 10, -20);
    ctx.quadraticCurveTo(8, -12, 4, -9);
    ctx.closePath();
    ctx.fillStyle = darken(body, 0.08);
    ctx.fill();
    ctx.stroke();
    circle(ctx, 0, -28, 6.5, lighten(body, 0.06), 1.1);
    poly(ctx, [{ x: -5.5, y: -31 }, { x: -4, y: -40 }, { x: -1, y: -33 }], body, 1);
    poly(ctx, [{ x: 5.5, y: -31 }, { x: 4, y: -40 }, { x: 1, y: -33 }], body, 1);
    poly(ctx, [{ x: 0, y: -28 }, { x: 8.5, y: -26 }, { x: 0, y: -24 }], body, 1);
    poly(ctx, [{ x: -6, y: -22 }, { x: 6, y: -22 }, { x: 0, y: -15 }], VERMILION, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(-3, -30, 1.4, 1.4);
    ctx.fillRect(2, -30, 1.4, 1.4);
    circle(ctx, -4, -6, 2, rgba('#6b9c52', 0.8), 0);
    circle(ctx, -2.5, -4.5, 1.4, rgba('#6b9c52', 0.8), 0);
    ctx.restore();
  },
};

const bambooThicket: PainterDef = {
  extra: 60,
  paint(ctx, size) {
    const { hw } = half(size);
    const r = artRng(size * 7);
    for (let i = 0; i < 7; i++) bambooStalk(ctx, (r() - 0.5) * hw * 1.2, (r() - 0.5) * 10 + 4, 40 + r() * 22, (r() - 0.5) * 8);
  },
};

const fallenCedar: PainterDef = {
  extra: 30,
  paint(ctx, size) {
    const { hw } = half(size);
    softShadow(ctx, hw * 0.75, hw * 0.22, 6, 0.28);
    ctx.save();
    ctx.rotate(0.45);
    const L = -hw * 0.7;
    const Rr = hw * 0.6;
    // Trunk with rounded bark shading, bark furrows and a branch stub.
    ctx.beginPath();
    ctx.moveTo(L, -6);
    ctx.lineTo(Rr, -6.5);
    ctx.lineTo(Rr, 6.5);
    ctx.lineTo(L, 6);
    ctx.quadraticCurveTo(L - 4, 0, L, -6);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -7, 0, 7);
    g.addColorStop(0, '#9a6c48');
    g.addColorStop(0.4, '#7a5236');
    g.addColorStop(1, '#4e3322');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    const r = artRng(17);
    for (let i = 0; i < 9; i++) {
      const x = L + 6 + r() * (Rr - L - 12);
      line(ctx, [{ x, y: -4 + r() * 2 }, { x: x + 8 + r() * 6, y: -3 + r() * 6 }], rgba('#3a2416', 0.55), 0.9);
    }
    line(ctx, [{ x: -hw * 0.1, y: -6 }, { x: -hw * 0.05, y: -13 }], '#6a4630', 3);
    // Cut end with growth rings.
    ctx.beginPath();
    ctx.ellipse(Rr, 0, 3.8, 6.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d8b48c';
    ctx.fill();
    ctx.stroke();
    for (const rr of [0.6, 0.3]) {
      ctx.beginPath();
      ctx.ellipse(Rr, 0, 3.8 * rr, 6.5 * rr, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rgba('#8a6440', 0.7);
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.restore();
    // Moss and a fern.
    for (const [x, y, rr] of [[-hw * 0.3, -9, 4.5], [-hw * 0.22, -7, 3], [hw * 0.15, 2, 3.2]] as const) circle(ctx, x, y, rr, '#5f8f4a', 0.8, darken('#5f8f4a', 0.4));
    for (const d of [-1, 1]) line(ctx, [{ x: -hw * 0.55, y: 6 }, { x: -hw * 0.55 + d * 6, y: -2 }], '#4f7a3c', 1.4);
  },
};

const boulder: PainterDef = {
  extra: 32,
  paint(ctx, size) {
    const { hw } = half(size);
    softShadow(ctx, hw * 0.7, hw * 0.24, 6, 0.3);
    const outline = [{ x: -hw * 0.6, y: 6 }, { x: -hw * 0.5, y: -12 }, { x: -hw * 0.1, y: -22 }, { x: hw * 0.4, y: -16 }, { x: hw * 0.6, y: 2 }, { x: hw * 0.2, y: 10 }];
    const g = ctx.createLinearGradient(-hw * 0.4, -22, hw * 0.4, 10);
    g.addColorStop(0, '#b4b9c1');
    g.addColorStop(1, '#6e737d');
    poly(ctx, outline, g, 1.5);
    // Facets: a lit top plane and a shaded right plane.
    poly(ctx, [{ x: -hw * 0.1, y: -22 }, { x: hw * 0.4, y: -16 }, { x: hw * 0.1, y: -8 }, { x: -hw * 0.3, y: -10 }], rgba('#ffffff', 0.28), 0);
    poly(ctx, [{ x: hw * 0.1, y: -8 }, { x: hw * 0.4, y: -16 }, { x: hw * 0.6, y: 2 }, { x: hw * 0.2, y: 10 }], rgba(INK, 0.16), 0);
    line(ctx, [{ x: -hw * 0.3, y: -10 }, { x: hw * 0.1, y: -8 }, { x: hw * 0.2, y: 10 }], rgba(INK, 0.35), 1);
    line(ctx, [{ x: -hw * 0.42, y: -4 }, { x: -hw * 0.25, y: 2 }], rgba(INK, 0.3), 0.9);
    // Moss on the shaded foot and pebbles around it.
    for (const [x, y, rr] of [[-hw * 0.48, 2, 3.4], [-hw * 0.38, 5, 2.4], [-hw * 0.3, -11, 2]] as const) circle(ctx, x, y, rr, '#6b9c52', 0.7, darken('#6b9c52', 0.4));
    for (const [x, y] of [[hw * 0.66, 8], [-hw * 0.68, 10], [hw * 0.35, 13]] as const) circle(ctx, x, y, 1.8, '#9aa0aa', 0.7);
  },
};

const allianceLodge: PainterDef = {
  extra: 110,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#c2b08e');
    const y = stoneBase(ctx, hw * 0.66, hh * 0.66, 2, 8);
    const top = storey(ctx, hw * 0.58, hh * 0.58, y, 24, '#efe5d2', { door: true, window: true, trim: '#3f6fa0' });
    roof(ctx, hw * 0.82, hh * 0.82, top + 3, 30, '#4a5a3a', { finial: tier >= 3 ? GOLD : '#3f6fa0' });
    noren(ctx, hw * 0.58, hh * 0.58, y, 0.45, 14, '#3f6fa0', 'crest');
    // Taiko drum and the two allied banners.
    circle(ctx, -hw * 0.55, hh * 0.35, 8, '#8a4a2a', 1.3);
    circle(ctx, -hw * 0.55, hh * 0.35, 5.5, '#efe5d2', 1);
    banner(ctx, hw * 0.55, hh * 0.25, 58, VERMILION);
    banner(ctx, hw * 0.35, hh * 0.45, 58, '#3f6fa0');
  },
};


// --- Defensive counters (Paper Lantern Line, Repair Crane, Incense Burner, Kite-Cutter Ballista, Longbow Yagura)

const paperLanternLine: PainterDef = {
  extra: 40,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#b3a688', 6);
    // Two bamboo posts with a sagging cord of paper lanterns.
    const a = { x: -hw * 0.55, y: 0 };
    const b = { x: hw * 0.55, y: 0 };
    line(ctx, [a, { x: a.x, y: a.y - 30 }], BAMBOO, 2.4);
    line(ctx, [b, { x: b.x, y: b.y - 30 }], BAMBOO, 2.4);
    line(ctx, [{ x: a.x, y: -28 }, { x: 0, y: -20 }, { x: b.x, y: -28 }], '#3a2a1e', 1);
    const n = 2 + tier;
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1);
      const x = a.x + (b.x - a.x) * f;
      const y = -28 + 8 * (1 - Math.abs(f - 0.5) * 2) + 4;
      lantern(ctx, x, y, 0.55, i % 2 ? '#e8a23a' : VERMILION);
    }
    void hh;
  },
};

const repairCrane: PainterDef = {
  extra: 92,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a9a08c');
    softShadow(ctx, hw * 0.55, hh * 0.55, 2, 0.22);
    const y = stoneBase(ctx, hw * 0.45, hh * 0.45, 2, 10);
    // Workshop deck with a toolbox.
    const deck = block(ctx, hw * 0.4, hh * 0.4, y, 3, WOOD, { lw: 1 });
    // Mast and a long jib with a hook; brass gear drives the winch.
    line(ctx, [{ x: -6, y: deck }, { x: -6, y: deck - 58 }], darken(WOOD_DARK, 0.1), 5);
    line(ctx, [{ x: -7, y: deck }, { x: -7, y: deck - 58 }], rgba('#ffffff', 0.2), 1);
    line(ctx, [{ x: -10, y: deck - 54 }, { x: hw * 0.75, y: deck - 62 }], WOOD, 3.4);
    line(ctx, [{ x: -6, y: deck - 30 }, { x: hw * 0.4, y: deck - 59 }], WOOD, 1.4);
    line(ctx, [{ x: -6, y: deck - 56 }, { x: -hw * 0.3, y: deck - 40 }], '#5d636e', 0.9);
    line(ctx, [{ x: hw * 0.7, y: deck - 61 }, { x: hw * 0.7, y: deck - 30 }], '#5d636e', 1);
    ctx.beginPath();
    ctx.arc(hw * 0.7, deck - 27, 3, -Math.PI * 0.1, Math.PI * 1.1);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#4d535e';
    ctx.stroke();
    const gx = -hw * 0.35;
    const gy = deck - 18;
    const brass = tier >= 3 ? GOLD : '#b8862f';
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      circle(ctx, gx + Math.cos(ang) * 10, gy + Math.sin(ang) * 10, 2.6, brass, 0.8);
    }
    ctx.beginPath();
    ctx.arc(gx, gy, 9, 0, Math.PI * 2);
    const gg = ctx.createRadialGradient(gx - 3, gy - 3, 1, gx, gy, 9);
    gg.addColorStop(0, lighten(brass, 0.35));
    gg.addColorStop(1, darken(brass, 0.2));
    ctx.fillStyle = gg;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    circle(ctx, gx, gy, 3, INK, 0);
    ctx.save();
    ctx.translate(hw * 0.22, hh * 0.15);
    block(ctx, 6, 3, 0, 5, VERMILION, { lw: 1 });
    line(ctx, [{ x: -2, y: -6 }, { x: 2, y: -6 }], INK, 1);
    ctx.restore();
    if (tier >= 2) banner(ctx, hw * 0.45, hh * 0.35, 34, '#3f6fa0');
  },
};

const incenseBurner: PainterDef = {
  extra: 80,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a69c88');
    const y = stoneBase(ctx, hw * 0.5, hh * 0.5, 2, 8);
    // Bronze cauldron on three legs, a lid with a finial and a sickly green smoke plume.
    for (const x of [-12, 0, 12]) line(ctx, [{ x, y: y - 2 }, { x, y: y - 10 }], '#4a3f30', 2.4);
    ctx.beginPath();
    ctx.ellipse(0, y - 18, 18, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = tier >= 3 ? '#b88a3e' : '#7a6a52';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    poly(ctx, [{ x: -12, y: y - 26 }, { x: 0, y: y - 34 }, { x: 12, y: y - 26 }], tier >= 2 ? GOLD : '#5e5040', 1.2);
    circle(ctx, 0, y - 36, 2.5, tier >= 2 ? GOLD : '#5e5040', 0.8);
    for (let i = 0; i < 3 + tier; i++) circle(ctx, Math.sin(i * 1.7) * 6, y - 44 - i * 9, 5 + i, rgba('#9bb07a', 0.55 - i * 0.06), 0);
    void hh;
  },
};

const kiteCutterBallista: PainterDef = {
  extra: 74,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a9a08c');
    softShadow(ctx, hw * 0.6, hh * 0.6, 2, 0.22);
    const y = stoneBase(ctx, hw * 0.55, hh * 0.55, 2, 12);
    // Turntable deck with a brass ring, an upward-pointing bow and a bolas bolt loaded.
    const deck = block(ctx, hw * 0.4, hh * 0.4, y, 8, WOOD);
    ctx.beginPath();
    ctx.ellipse(0, deck, hw * 0.28, hh * 0.28, 0, 0, Math.PI * 2);
    ctx.strokeStyle = tier >= 3 ? GOLD : '#b8862f';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, deck - 8);
    ctx.rotate(-0.9);
    line(ctx, [{ x: -8, y: 0 }, { x: 32, y: 0 }], WOOD_DARK, 5);
    line(ctx, [{ x: -8, y: -1.2 }, { x: 32, y: -1.2 }], rgba('#ffffff', 0.2), 1);
    ctx.beginPath();
    ctx.arc(16, 0, 18, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9);
    ctx.strokeStyle = tier >= 3 ? GOLD : WOOD;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    const a = { x: 16 + Math.cos(-Math.PI / 2 - 0.9) * 18, y: Math.sin(-Math.PI / 2 - 0.9) * 18 };
    const b = { x: 16 + Math.cos(-Math.PI / 2 + 0.9) * 18, y: Math.sin(-Math.PI / 2 + 0.9) * 18 };
    line(ctx, [a, { x: 4, y: 0 }, b], '#e8e0cc', 0.9);
    line(ctx, [{ x: 4, y: 0 }, { x: 36, y: 0 }], '#d4d9e0', 1.6);
    poly(ctx, [{ x: 36, y: -2.5 }, { x: 42, y: 0 }, { x: 36, y: 2.5 }], '#d4d9e0', 0.8);
    ctx.restore();
    circle(ctx, -hw * 0.45, hh * 0.25, 3.5, '#5d636e', 1);
    circle(ctx, -hw * 0.3, hh * 0.4, 3.5, '#5d636e', 1);
    circle(ctx, -hw * 0.46, hh * 0.25 - 1, 1, rgba('#ffffff', 0.5), 0);
    circle(ctx, -hw * 0.31, hh * 0.4 - 1, 1, rgba('#ffffff', 0.5), 0);
    line(ctx, [{ x: -hw * 0.45, y: hh * 0.25 }, { x: -hw * 0.3, y: hh * 0.4 }], '#3a2a1e', 1);
    if (tier >= 2) banner(ctx, hw * 0.55, hh * 0.2, 40, '#3f6fa0');
  },
};

const longbowYagura: PainterDef = {
  extra: 150,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a9a08c');
    const y = stoneBase(ctx, hw * 0.6, hh * 0.6, 2, tier >= 2 ? 20 : 14);
    // A tall, narrow watchtower: four long legs, a covered loft and a strung longbow on the rail.
    const lh = 64;
    const lw = hw * 0.38;
    for (const [x, yy] of [[-lw, y], [lw, y], [0, y + lw / 2], [0, y - lw / 2]] as const) line(ctx, [{ x, y: yy }, { x: x * 0.8, y: yy - lh }], WOOD_DARK, 3);
    line(ctx, [{ x: -lw, y }, { x: lw * 0.8, y: y - lh * 0.6 }], WOOD, 1.4);
    line(ctx, [{ x: lw, y }, { x: -lw * 0.8, y: y - lh * 0.6 }], WOOD, 1.4);
    const top = storey(ctx, lw + 4, (lw + 4) / 2, y - lh, 14, PLASTER, { window: true });
    roof(ctx, lw + 14, (lw + 14) / 2, top + 2, 22, tier >= 3 ? '#6b3f2a' : ROOF, { finial: tier >= 3 ? GOLD : undefined });
    ctx.beginPath();
    ctx.arc(lw + 8, y - lh - 6, 14, -1.2, 1.2);
    ctx.strokeStyle = WOOD;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (tier >= 2) banner(ctx, -hw * 0.6, hh * 0.3, 50);
  },
};

/** Every building type, keyed by its stable internal id. */
export const buildingPainters: Record<string, PainterDef> = {
  elder_toadstool: keepSkin('#3d4a5c', VERMILION),
  acorn_orchard: coinMint,
  dewdrop_well: ricePaddy,
  acorn_silo: treasury,
  dew_cistern: provisionStorehouse,
  beaver_lodge: artisanHut,
  burrow_barracks: trainingDojo,
  army_camp: squadCourtyard,
  acorn_cannon: kunaiTower,
  pinecone_catapult: fireworkMortar,
  wasp_nest: shurikenPagoda,
  firefly_tower: skyBowTower,
  bramble_hedge: stoneWall,
  thorn_snare: spikePit,
  sap_puddle: caltropField,
  flower_bed: bonsai,
  lantern_post: stoneLantern,
  mushroom_ring: zenGarden,
  mossy_statue: foxStatue,
  obstacle_bush: bambooThicket,
  obstacle_stump: fallenCedar,
  obstacle_rock: boulder,
  grove_lodge: allianceLodge,
  paper_lantern_line: paperLanternLine,
  clockwork_repairer: repairCrane,
  bitter_incense_burner: incenseBurner,
  kite_cutter_ballista: kiteCutterBallista,
  longbow_yagura: longbowYagura,
};

/** Legacy visual tier (1-3, thirds of the level range): the tier keys real art uses (`building.<type>.t<1-3>`). */
export function thirdOf(level: number, maxLevel: number): 1 | 2 | 3 {
  if (maxLevel <= 1) return 1;
  const f = (level - 1) / (maxLevel - 1);
  return f < 0.34 ? 1 : f < 0.67 ? 2 : 3;
}

/**
 * Explicit level -> tier maps. The Keep has six looks and defenses five, so an upgrade never sits
 * unseen for long (the old thirds kept the Keep identical from level 1 to 5); every other level
 * inside a tier still adds a small change (`levelMarks`, plinth height, lanterns).
 */
const TIER_MAPS: Record<string, number[]> = {
  elder_toadstool: [1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6],
};
/** Defenses use five tiers spread evenly over their levels. */
const FIVE_TIERS = new Set(['acorn_cannon', 'pinecone_catapult', 'wasp_nest', 'firefly_tower', 'kite_cutter_ballista', 'longbow_yagura']);

function tierTable(type: string | undefined, maxLevel: number): number[] {
  const map = type ? TIER_MAPS[type] : undefined;
  if (map && map.length === maxLevel) return map;
  const n = type && (FIVE_TIERS.has(type) || TIER_MAPS[type]) ? Math.min(type in TIER_MAPS ? 6 : 5, maxLevel) : Math.min(3, maxLevel);
  return Array.from({ length: maxLevel }, (_, i) => (maxLevel <= 1 ? 1 : Math.min(n, 1 + Math.floor((i * n) / maxLevel))));
}

/** Visual tier for a level. Without a type: thirds (1-3), as before. */
export function tierFor(level: number, maxLevel: number, type?: string): Tier {
  if (maxLevel <= 1) return 1;
  if (!type) return thirdOf(level, maxLevel);
  const t = tierTable(type, maxLevel);
  return t[Math.max(0, Math.min(maxLevel, level) - 1)] as Tier;
}

export function levelInfo(type: string, level: number, maxLevel: number): LevelInfo {
  const max = Math.max(1, maxLevel);
  const lvl = Math.max(1, Math.min(max, level));
  const t = tierTable(type, max);
  const tier = t[lvl - 1] as Tier;
  const first = t.indexOf(tier);
  const steps = t.lastIndexOf(tier) - first + 1;
  return { level: lvl, maxLevel: max, tier, tiers: t[max - 1], step: lvl - 1 - first, steps };
}

/** The level being painted (read by the shared helpers: plinths grow a little with each level). */
let LV: LevelInfo | null = null;

/** Paint one building at one exact level: its tier art plus the per-level marks. */
export function paintBuildingLevel(ctx: Ctx, type: string, size: number, level: number, maxLevel: number, def: PainterDef | undefined = buildingPainters[type]): void {
  const info = levelInfo(type, level, maxLevel);
  LV = maxLevel > 1 ? info : null;
  try {
    if (def) def.paint(ctx, size, info.tier, LV ?? undefined);
    else paintGeneric(ctx, size);
    if (LV) levelMarks(ctx, type, size, info);
  } finally {
    LV = null;
  }
}

/**
 * Small marks that change at every level, on top of the tier art: one stone lantern per step on
 * the plate's front edge (left corner first), and a gold kerb at the top level. Walls (1x1) show
 * their level in the coping colour instead (`stoneWall`).
 */
function levelMarks(ctx: Ctx, type: string, size: number, lv: LevelInfo): void {
  const { hw, hh } = half(size);
  if (size >= 2 && type !== 'paper_lantern_line') {
    const spots = [0.12, 0.88, 0.5];
    for (let i = 0; i < Math.min(3, lv.step); i++) {
      const f = spots[i];
      const front = f <= 0.5;
      const x = front ? -hw + hw * (f / 0.5) * 0.5 + 6 : hw * ((f - 0.5) / 0.5) - 6;
      const y = front ? hh * (f / 0.5) * 0.5 - 1 : hh * (1 - (f - 0.5) / 0.5) - 1;
      toro(ctx, f === 0.5 ? 0 : x, f === 0.5 ? hh - 7 : y, 0.75 + size * 0.05);
    }
  }
  if (lv.level === lv.maxLevel && size >= 2) {
    const k = hw - 4;
    line(ctx, [{ x: -k, y: 1 }, { x: 0, y: hh - 1 }, { x: k, y: 1 }], rgba(GOLD, 0.9), 1.6);
  }
}

/** A small stone lantern (toro) with a warm light. */
function toro(ctx: Ctx, x: number, y: number, s = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  softShadow(ctx, 5, 2, 0, 0.25);
  line(ctx, [{ x: 0, y: 0 }, { x: 0, y: -8 }], '#8a8f99', 2.6);
  poly(ctx, [{ x: -3.6, y: -8 }, { x: 3.6, y: -8 }, { x: 3.2, y: -13 }, { x: -3.2, y: -13 }], '#b4b9c1', 0.9);
  glow(ctx, 0, -10.5, 7);
  poly(ctx, [{ x: -1.6, y: -9 }, { x: 1.6, y: -9 }, { x: 1.6, y: -12 }, { x: -1.6, y: -12 }], '#ffd27a', 0);
  poly(ctx, [{ x: -5, y: -13 }, { x: 0, y: -17 }, { x: 5, y: -13 }], '#8a8f99', 0.9);
  ctx.restore();
}

export function paintGeneric(ctx: Ctx, size: number): void {
  const { hw, hh } = half(size);
  plate(ctx, size, '#b8a888');
  const top = storey(ctx, hw * 0.55, hh * 0.55, 0, 20);
  roof(ctx, hw * 0.75, hh * 0.75, top + 2, 20);
}

/** Bamboo scaffolding with a tarp, a ladder and stacked materials: a building under construction. */
export function paintConstruction(ctx: Ctx, size: number): void {
  const { hw, hh } = half(size);
  plate(ctx, size, '#bba98a');
  const h = 18 + size * 8;
  const sw = hw * 0.55;
  const sh = hh * 0.55;
  // Back posts first, then the tarp, then front posts and ties.
  for (const [x, y] of [[-sw, 0], [0, -sh], [sw, 0]] as const) line(ctx, [{ x, y }, { x, y: y - h }], darken(BAMBOO, 0.2), 2.6);
  const tg = ctx.createLinearGradient(0, -h * 0.6, 0, hh * 0.5);
  tg.addColorStop(0, rgba('#4f7fb0', 0.92));
  tg.addColorStop(1, rgba('#2f5a85', 0.92));
  poly(ctx, [{ x: -hw * 0.5, y: 0 }, { x: 0, y: hh * 0.5 }, { x: 0, y: hh * 0.5 - h * 0.6 }, { x: -hw * 0.5, y: -h * 0.6 }], tg, 1.2);
  for (const f of [0.33, 0.66]) line(ctx, [{ x: -hw * 0.5 + hw * 0.5 * f, y: hh * 0.5 * f - h * 0.6 + 1 }, { x: -hw * 0.5 + hw * 0.5 * f, y: hh * 0.5 * f - 1 }], rgba('#1d3a57', 0.5), 0.8);
  crest(ctx, -hw * 0.25, hh * 0.25 - h * 0.32, Math.min(6, 2 + size * 1.3), rgba(WASHI, 0.85));
  line(ctx, [{ x: 0, y: sh }, { x: 0, y: sh - h }], BAMBOO, 2.8);
  for (const f of [0.4, 0.8]) {
    line(ctx, [{ x: -sw, y: -h * f }, { x: 0, y: sh - h * f }, { x: sw, y: -h * f }], darken(BAMBOO, 0.2), 2);
    for (const p of [{ x: -sw, y: -h * f }, { x: 0, y: sh - h * f }, { x: sw, y: -h * f }]) circle(ctx, p.x, p.y, 1.3, '#c9a65e', 0.5);
  }
  // Ladder leaning on the front-right side.
  const lx = sw * 0.55;
  line(ctx, [{ x: lx - 3, y: sh * 0.5 + 4 }, { x: lx - 1, y: sh * 0.5 + 4 - h * 0.7 }], WOOD, 1.4);
  line(ctx, [{ x: lx + 3, y: sh * 0.5 + 1 }, { x: lx + 5, y: sh * 0.5 + 1 - h * 0.7 }], WOOD, 1.4);
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    line(ctx, [{ x: lx - 3 + 2 * t, y: sh * 0.5 + 4 - h * 0.7 * t }, { x: lx + 3 + 2 * t, y: sh * 0.5 + 1 - h * 0.7 * t }], WOOD, 1);
  }
  // Materials: planks and a stack of roof tiles.
  ctx.save();
  ctx.translate(-hw * 0.5, hh * 0.45);
  for (let i = 0; i < 3; i++) line(ctx, [{ x: -8, y: -i * 2 }, { x: 8, y: 4 - i * 2 }], i % 2 ? '#c99a64' : '#d8b07c', 2.2);
  ctx.restore();
  ctx.save();
  ctx.translate(hw * 0.42, hh * 0.42);
  block(ctx, 5, 2.5, 0, 5, ROOF, { lw: 0.9 });
  ctx.restore();
  riceBale(ctx, hw * 0.1, hh * 0.62, 0.7);
}

/** Scorched ground, broken beams and roof tiles where a building stood. */
export function paintRubble(ctx: Ctx, size: number): void {
  const { hw, hh } = half(size);
  const r = artRng(size * 13);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, hw * 0.65);
  g.addColorStop(0, '#3e3833');
  g.addColorStop(0.7, '#5e554b');
  g.addColorStop(1, rgba('#6e6458', 0));
  ctx.save();
  ctx.scale(1, hh / hw);
  ctx.beginPath();
  ctx.arc(0, 0, hw * 0.65, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 6 + size * 4; i++) {
    const x = (r() - 0.5) * hw;
    const y = (r() - 0.5) * hh * 0.8;
    const k = r();
    if (k < 0.4) {
      const ex = x + (r() - 0.5) * 18;
      const ey = y - 4 - r() * 5;
      line(ctx, [{ x, y }, { x: ex, y: ey }], '#2e2018', 3.2);
      line(ctx, [{ x, y }, { x: ex, y: ey }], WOOD_DARK, 2);
      if (r() < 0.35) circle(ctx, ex, ey, 1, '#e8662e', 0);
    } else if (k < 0.8) {
      poly(ctx, [{ x, y }, { x: x + 5, y: y - 2 }, { x: x + 4, y: y + 2 }], r() < 0.5 ? ROOF : lighten(ROOF, 0.2), 0.6);
    } else {
      circle(ctx, x, y, 1.8 + r() * 1.2, '#8a8f99', 0.6);
    }
  }
  wisp(ctx, hw * 0.1, -6, 3, '#9aa0aa', 0.35);
}

/** Ready-to-collect bubble over a collector. */
export function paintBubble(ctx: Ctx, resource: string): void {
  softShadow(ctx, 10, 3, 24, 0.3);
  ctx.beginPath();
  ctx.moveTo(-15, -6);
  ctx.arc(0, -6, 15, Math.PI, 0);
  ctx.quadraticCurveTo(15, 10, 0, 22);
  ctx.quadraticCurveTo(-15, 10, -15, -6);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -21, 0, 22);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, '#eadfc8');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -6, 12.5, Math.PI * 1.1, Math.PI * 1.55);
  ctx.strokeStyle = rgba('#ffffff', 0.9);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (resource === 'acorn' || resource === 'acorns') {
    mark(ctx, 'coin', 0, -4, 8, GOLD);
  } else {
    riceBale(ctx, 0, -4, 1.15);
  }
}

// ---------------------------------------------------------------------------
// Troops
// ---------------------------------------------------------------------------

export interface TroopArt {
  w: number;
  h: number;
  paint: (ctx: Ctx) => void;
}

export interface NinjaLook {
  gi: string;
  band?: string;
  mask?: string;
  skin?: string;
  scale?: number;
  weapon?: 'katana' | 'kunai' | 'grapple' | 'shovel' | 'club' | 'none';
  armor?: string;
  /**
   * Head silhouette (the strongest role cue at battle size): `kasa` wide straw hat (throwers),
   * `helm` kabuto with a crescent crest and neck guard (guardians), `wrap` head cloth with a knot
   * on top (saboteurs), `hood` dark hood with long tails streaming back (shadows), `topknot` bare
   * head with a tied topknot (mystics).
   */
  hat?: 'kasa' | 'helm' | 'wrap' | 'hood' | 'topknot' | null;
  pack?: 'satchel' | 'bombs' | 'frame' | null;
  /** Long robe over the legs (mystics). */
  robe?: boolean;
  /** Big lacquered shoulder plates (guardians). */
  pauldrons?: boolean;
  /** Tool belt with pouches (saboteurs). */
  belt?: boolean;
  /** Glowing eye colour (shadows). */
  eyes?: string;
  /** Forward lean: x shifts by `lean` px per px of height (blades dash, infiltrators creep). */
  lean?: number;
  /** 0..1: squat lower and wider (saboteurs, infiltrators). */
  crouch?: number;
}

/** Chibi ninja, facing right, feet at y = 0. Shared by every warrior and their icons. */
export function ninja(ctx: Ctx, look: NinjaLook): void {
  const s = look.scale ?? 1;
  ctx.save();
  ctx.scale(s, s);
  softShadow(ctx, 11, 4, 0, 0.3);
  // Pose: a crouch squats about the feet; a lean shears the figure forward (x grows with height).
  if (look.crouch) ctx.scale(1 + look.crouch * 0.12, 1 - look.crouch * 0.2);
  if (look.lean) ctx.transform(1, 0, -look.lean, 1, 0, 0);
  const gi = look.gi;
  // Cloth lit from the upper left: a soft horizontal ramp across each part.
  const ramp = (x0: number, x1: number, c: string, light = 0.18, dark = 0.22) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, lighten(c, light));
    g.addColorStop(0.55, c);
    g.addColorStop(1, darken(c, dark));
    return g;
  };
  // Legs, with wrapped shins.
  poly(ctx, [{ x: -6, y: -9 }, { x: -2, y: -9 }, { x: -2, y: 0 }, { x: -7, y: 0 }], ramp(-7, -2, darken(gi, 0.12)), 1.1);
  poly(ctx, [{ x: 2, y: -9 }, { x: 6, y: -9 }, { x: 7, y: 0 }, { x: 2, y: 0 }], ramp(2, 7, darken(gi, 0.2)), 1.1);
  for (const [x0, x1] of [[-6.6, -2], [2, 6.6]] as const) line(ctx, [{ x: x0, y: -4 }, { x: x1, y: -5 }], rgba('#ffffff', 0.22), 0.8);
  // Body
  poly(ctx, [{ x: -8, y: -22 }, { x: 8, y: -22 }, { x: 9, y: -8 }, { x: -9, y: -8 }], ramp(-9, 9, gi), 1.3);
  line(ctx, [{ x: -3, y: -22 }, { x: 3, y: -15 }], rgba(INK, 0.35), 0.9); // crossed collar
  line(ctx, [{ x: -8.6, y: -12 }, { x: 8.6, y: -12 }], look.band ?? VERMILION, 2.4); // sash
  line(ctx, [{ x: -8.6, y: -12.8 }, { x: 8.6, y: -12.8 }], rgba('#ffffff', 0.3), 0.6);
  line(ctx, [{ x: -9, y: -12 }, { x: -12, y: -8 }], look.band ?? VERMILION, 1.6); // sash knot tail
  if (look.armor) {
    poly(ctx, [{ x: -9, y: -21 }, { x: 9, y: -21 }, { x: 10, y: -13 }, { x: -10, y: -13 }], ramp(-10, 10, look.armor, 0.25, 0.3), 1.2);
    for (const y of [-18, -15]) line(ctx, [{ x: -9, y }, { x: 9, y }], darken(look.armor, 0.35), 0.9);
    line(ctx, [{ x: -8, y: -20 }, { x: 0, y: -20 }], rgba('#ffffff', 0.35), 0.8);
  }
  if (look.robe) {
    // Long robe flaring to the ankles: a bell shape instead of two legs.
    ctx.beginPath();
    ctx.moveTo(-9, -13);
    ctx.lineTo(9, -13);
    ctx.quadraticCurveTo(11, -5, 13, 0);
    ctx.lineTo(-13, 0);
    ctx.quadraticCurveTo(-11, -5, -9, -13);
    ctx.closePath();
    ctx.fillStyle = ramp(-13, 13, darken(gi, 0.06), 0.2, 0.26);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    line(ctx, [{ x: -12.4, y: -1.6 }, { x: 12.4, y: -1.6 }], look.band ?? VERMILION, 1.6);
    for (const x of [-4, 3]) line(ctx, [{ x, y: -11 }, { x: x * 1.3, y: -2 }], rgba(INK, 0.22), 0.8);
  }
  if (look.belt) {
    // Tool belt: three pouches and a hanging coil of rope.
    for (const x of [-7, -1.5, 4]) poly(ctx, [{ x, y: -12 }, { x: x + 4.4, y: -12 }, { x: x + 4, y: -6.5 }, { x: x + 0.4, y: -6.5 }], '#6b4a2e', 0.8);
    ctx.beginPath();
    ctx.ellipse(-11, -9, 3.6, 4.6, 0.3, 0, Math.PI * 2);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#b8a888';
    ctx.stroke();
  }
  if (look.pauldrons) {
    // Lacquered shoulder plates (sode): the broad guardian outline.
    const plate = look.armor ?? '#5d636e';
    for (const s of [-1, 1]) {
      poly(ctx, [{ x: s * 6, y: -23 }, { x: s * 15, y: -22 }, { x: s * 16, y: -13 }, { x: s * 8, y: -14 }], vramp(ctx, -23, -13, plate), 1.2);
      for (const y of [-19.5, -16.5]) line(ctx, [{ x: s * 7.5, y: y + 0.4 }, { x: s * 15.5, y }], rgba(GOLD, 0.75), 0.8);
    }
  }
  if (look.pack === 'satchel') poly(ctx, [{ x: -12, y: -20 }, { x: -6, y: -20 }, { x: -6, y: -11 }, { x: -12, y: -11 }], WOOD, 1);
  if (look.pack === 'bombs') for (const y of [-19, -13]) circle(ctx, -10, y, 3, INK, 0.8, '#000');
  if (look.pack === 'frame') {
    // A boxy carrying frame (siege crews): the square back that makes them read as heavy.
    poly(ctx, [{ x: -16, y: -27 }, { x: -6, y: -27 }, { x: -6, y: -7 }, { x: -16, y: -7 }], vramp(ctx, -27, -7, WOOD), 1.2);
    for (const y of [-21, -14]) line(ctx, [{ x: -16, y }, { x: -6, y }], WOOD_DARK, 1.2);
  }
  if (look.hat === 'hood') {
    // Long hood tails streaming back: the shadow silhouette.
    for (const [dy, len, w] of [[0, 26, 4.2], [5, 21, 3.2]] as const) {
      ctx.beginPath();
      ctx.moveTo(-6, -36 + dy);
      ctx.bezierCurveTo(-14, -40 + dy, -20, -30 + dy, -6 - len, -31 + dy + len * 0.25);
      ctx.lineWidth = w + 1.6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = w;
      ctx.strokeStyle = lighten(look.mask ?? gi, 0.12);
      ctx.stroke();
    }
  }
  // Head with hood and mask (a mystic's topknot leaves the head bare, with dark hair at the back).
  const bare = look.hat === 'topknot';
  const hood = bare ? look.skin ?? '#f1c9a0' : look.mask ?? gi;
  const hg = ctx.createRadialGradient(-3.5, -35, 1, 0, -31, 11);
  hg.addColorStop(0, lighten(hood, 0.28));
  hg.addColorStop(0.6, hood);
  hg.addColorStop(1, darken(hood, 0.25));
  circle(ctx, 0, -31, 10, hg, 1.4);
  if (!bare) {
    poly(ctx, [{ x: -7, y: -34 }, { x: 10, y: -34 }, { x: 10, y: -28 }, { x: -7, y: -28 }], look.skin ?? '#f1c9a0', 0);
    line(ctx, [{ x: -7, y: -34 }, { x: 10, y: -34 }], INK, 0.8);
    line(ctx, [{ x: -7, y: -28 }, { x: 10, y: -28 }], INK, 0.8);
  } else {
    ctx.beginPath();
    ctx.arc(0, -31, 10, Math.PI * 0.62, Math.PI * 1.62);
    ctx.closePath();
    ctx.fillStyle = '#2b2b2b';
    ctx.fill();
  }
  // Determined eyes (glowing for shadows).
  const eye = look.eyes ?? INK;
  if (look.eyes) {
    glow(ctx, 5.5, -31.6, 7);
    ctx.shadowColor = look.eyes;
    ctx.shadowBlur = 3;
  }
  line(ctx, [{ x: 2, y: -32.2 }, { x: 5, y: -31.4 }], eye, 1.6);
  line(ctx, [{ x: 6.5, y: -31.6 }, { x: 9, y: -32.4 }], eye, 1.6);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  const hat = look.hat ?? null;
  if (hat !== 'topknot') {
    // Headband with flowing tails (hidden under a kasa brim's shadow, but its tails still fly).
    line(ctx, [{ x: -9, y: -37 }, { x: 9, y: -38 }], look.band ?? VERMILION, 2.4);
    ctx.beginPath();
    ctx.moveTo(-9, -37);
    ctx.quadraticCurveTo(-15, -38, -18, -33);
    ctx.moveTo(-9, -37);
    ctx.quadraticCurveTo(-14, -34, -16, -29);
    ctx.lineWidth = 2;
    ctx.strokeStyle = look.band ?? VERMILION;
    ctx.stroke();
  }
  if (hat === 'kasa') {
    // A wide, shallow straw cone: much wider than the head, so throwers read as a flat triangle.
    poly(ctx, [{ x: -18, y: -37 }, { x: 0, y: -49 }, { x: 18, y: -37 }, { x: 0, y: -35 }], ramp(-18, 18, RICE, 0.22, 0.24), 1.3);
    for (const f of [0.35, 0.68]) line(ctx, [{ x: -18 * f, y: -49 + 12 * f }, { x: 18 * f, y: -49 + 12 * f }], rgba(darken(RICE, 0.5), 0.5), 0.8);
    line(ctx, [{ x: -17, y: -36.6 }, { x: 0, y: -34.6 }, { x: 17, y: -36.6 }], rgba(INK, 0.35), 1);
    circle(ctx, 0, -49.5, 1.4, darken(RICE, 0.4), 0.6);
  }
  if (hat === 'helm') {
    // Kabuto: a riveted bowl, a flared neck guard and a gold crescent crest.
    const steel = look.armor ?? '#5d636e';
    poly(ctx, [{ x: -14, y: -32 }, { x: -10, y: -38 }, { x: 10, y: -38 }, { x: 14, y: -32 }, { x: 11, y: -30 }, { x: -11, y: -30 }], ramp(-14, 14, darken(steel, 0.08), 0.22, 0.3), 1.2);
    ctx.beginPath();
    ctx.moveTo(-11, -37);
    ctx.quadraticCurveTo(-11, -46, 0, -46.5);
    ctx.quadraticCurveTo(11, -46, 11, -37);
    ctx.closePath();
    ctx.fillStyle = ramp(-11, 11, steel, 0.3, 0.3);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    for (const x of [-5, 0, 5]) line(ctx, [{ x, y: -45.5 }, { x: x * 1.15, y: -38.5 }], rgba(INK, 0.3), 0.7);
    // Crescent maedate.
    ctx.beginPath();
    ctx.moveTo(-9, -52);
    ctx.quadraticCurveTo(0, -42, 9, -52);
    ctx.quadraticCurveTo(0, -46.5, -9, -52);
    ctx.closePath();
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = darken(GOLD, 0.5);
    ctx.stroke();
  }
  if (hat === 'wrap') {
    // Head cloth tied with a big knot on top: the saboteur's bunny-eared silhouette.
    const cloth = look.band ?? VERMILION;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 4, -45, 3, 5.2, s * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = cloth;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    circle(ctx, 0, -41.5, 2.4, darken(cloth, 0.2), 1);
  }
  if (hat === 'topknot') {
    circle(ctx, -1, -43, 3.6, '#2b2b2b', 1);
    line(ctx, [{ x: -4, y: -41 }, { x: 2, y: -41.5 }], look.band ?? VERMILION, 1.6);
  }
  // Arm and weapon
  const w = look.weapon ?? 'katana';
  if (w === 'katana') {
    // Blade with a bright edge, a gold guard and a wrapped grip.
    line(ctx, [{ x: 8, y: -19.5 }, { x: 23, y: -31 }], '#5d636e', 3);
    line(ctx, [{ x: 8, y: -19.5 }, { x: 23, y: -31 }], '#e4e8ee', 2);
    line(ctx, [{ x: 10, y: -21.6 }, { x: 22, y: -30.8 }], '#ffffff', 0.7);
    line(ctx, [{ x: 6.5, y: -20.5 }, { x: 9, y: -17.5 }], GOLD, 1.8);
    line(ctx, [{ x: 4, y: -16 }, { x: 8, y: -19 }], INK, 3);
  } else if (w === 'kunai') {
    for (const dy of [0, 4]) poly(ctx, [{ x: 10, y: -19 + dy }, { x: 20, y: -21 + dy }, { x: 10, y: -16 + dy }], '#c9ced6', 0.8);
  } else if (w === 'grapple') {
    line(ctx, [{ x: 6, y: -18 }, { x: 16, y: -26 }], '#b8a888', 1.2);
    for (const a of [-0.6, 0, 0.6]) line(ctx, [{ x: 16, y: -26 }, { x: 16 + Math.cos(a - 0.9) * 5, y: -26 + Math.sin(a - 0.9) * 5 }], '#8a8f99', 1.6);
  } else if (w === 'shovel') {
    line(ctx, [{ x: 4, y: -10 }, { x: 18, y: -26 }], WOOD, 2);
    poly(ctx, [{ x: 16, y: -24 }, { x: 22, y: -30 }, { x: 24, y: -26 }, { x: 19, y: -21 }], '#8a8f99', 1);
  } else if (w === 'club') {
    line(ctx, [{ x: 4, y: -14 }, { x: 18, y: -34 }], '#3a3f48', 4.5);
    line(ctx, [{ x: 5, y: -15.5 }, { x: 17, y: -32.5 }], rgba('#ffffff', 0.25), 1);
    for (let i = 0; i < 3; i++) circle(ctx, 13 + i * 2, -26 - i * 3, 1.2, '#c9ced6', 0);
  }
  ctx.restore();
}

export const troopArt: Record<string, TroopArt> = {
  hedgehog_roller: { w: 44, h: 50, paint: (ctx) => ninja(ctx, { gi: '#2f3a4f', band: VERMILION, weapon: 'katana' }) },
  frog_lobber: { w: 44, h: 50, paint: (ctx) => ninja(ctx, { gi: '#5d6672', band: '#e9b44c', weapon: 'kunai', pack: 'satchel' }) },
  beetle_brute: { w: 60, h: 66, paint: (ctx) => ninja(ctx, { gi: '#3a2f2a', band: VERMILION, armor: '#7a2e26', hat: 'helm', weapon: 'club', scale: 1.3 }) },
  owl_bomber: {
    w: 70,
    h: 64,
    paint(ctx) {
      // War kite with a rider.
      poly(ctx, [{ x: -30, y: -40 }, { x: 0, y: -58 }, { x: 30, y: -40 }, { x: 0, y: -30 }], VERMILION, 1.4);
      crest(ctx, 0, -44, 6, WASHI);
      line(ctx, [{ x: -30, y: -40 }, { x: 30, y: -40 }], WOOD_DARK, 1.2);
      ctx.save();
      ctx.translate(0, -18);
      ninja(ctx, { gi: '#3a3f6a', band: GOLD, weapon: 'none', pack: 'bombs', scale: 0.8 });
      ctx.restore();
    },
  },
  mole_digger: { w: 46, h: 48, paint: (ctx) => ninja(ctx, { gi: '#6b4a2e', band: '#8a8f99', weapon: 'shovel', hat: 'kasa' }) },
  saboteur: { w: 46, h: 52, paint: (ctx) => ninja(ctx, { gi: '#2f4a3a', band: GOLD, weapon: 'grapple', pack: 'satchel' }) },
};

// ---------------------------------------------------------------------------
// Projectiles and effects
// ---------------------------------------------------------------------------

/** Top-lit vertical ramp for small rounded parts (kites, fur, shields). */
function vramp(ctx: Ctx, y0: number, y1: number, c: string, light = 0.25, dark = 0.22): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, lighten(c, light));
  g.addColorStop(0.5, c);
  g.addColorStop(1, darken(c, dark));
  return g;
}

/** Register code-drawn catalog warriors. Rendering supplies metadata across the art contract. */
export function registerWarriorArt(warriors: { id: string; role: string; tier: number; look: Record<string, string> }[]): void {
  for (const w of warriors) {
    const role = w.role;
    if (role === 'beast' && !troopArt[`${w.id}.companion`]) troopArt[`${w.id}.companion`] = companionArt(w);
    // warriorIcons.ts registers a role-silhouette sprite for every roster warrior; this template is the fallback.
    if (troopArt[w.id]) continue;
    const large = role === 'guardian';
    const flying = role === 'sky';
    troopArt[w.id] = {
      w: flying ? 76 : large || role === 'beast' ? 66 : 54,
      h: flying ? 76 : large ? 68 : 58,
      paint(ctx) {
        const accent = w.look.accent;
        if (flying) {
          poly(ctx, [{ x: -34, y: -43 }, { x: 0, y: -68 }, { x: 34, y: -43 }, { x: 0, y: -29 }], vramp(ctx, -68, -29, accent, 0.3, 0.2), 1.4);
          poly(ctx, [{ x: 0, y: -68 }, { x: 34, y: -43 }, { x: 0, y: -29 }], rgba(INK, 0.12), 0);
          line(ctx, [{ x: -34, y: -43 }, { x: 34, y: -43 }], WOOD_DARK, 1.4);
          line(ctx, [{ x: 0, y: -68 }, { x: 0, y: -29 }], rgba(WOOD_DARK, 0.7), 1);
          crest(ctx, 0, -49, 7, WASHI);
        }
        ctx.save();
        if (flying) ctx.translate(0, -12);
        ninja(ctx, {
          gi: w.look.gi, band: accent, scale: large ? 1.25 : flying ? 0.85 : 1,
          weapon: role === 'thrower' ? 'kunai' : role === 'guardian' || role === 'mystic' ? 'club' : role === 'saboteur' ? 'grapple' : role === 'infiltrator' ? 'shovel' : role === 'siege' || flying ? 'none' : 'katana',
          armor: large ? accent : undefined, hat: large ? 'helm' : role === 'mystic' ? 'kasa' : null,
          pack: role === 'siege' || flying ? 'bombs' : role === 'thrower' || role === 'saboteur' ? 'satchel' : null,
        });
        ctx.restore();
        if (role === 'mystic') {
          const og = ctx.createRadialGradient(15.5, -29.5, 0.5, 17, -28, 5);
          og.addColorStop(0, '#ffffff');
          og.addColorStop(0.5, lighten(accent, 0.2));
          og.addColorStop(1, accent);
          circle(ctx, 17, -28, 9, rgba(accent, 0.18), 0);
          circle(ctx, 17, -28, 5, og, 1.2);
          line(ctx, [{ x: 17, y: -23 }, { x: 17, y: -4 }], WOOD, 2);
        }
        if (role === 'siege') {
          poly(ctx, [{ x: 6, y: -22 }, { x: 23, y: -28 }, { x: 26, y: -18 }, { x: 9, y: -12 }], vramp(ctx, -28, -12, '#5d636e', 0.3, 0.25), 1.4);
          line(ctx, [{ x: 8, y: -21 }, { x: 22, y: -26.5 }], rgba('#ffffff', 0.35), 0.8);
          circle(ctx, 13, -7, 5, WOOD_DARK, 1);
        }
        if (role === 'beast') {
          ctx.beginPath();
          ctx.ellipse(-19, -7, 10, 6, 0, 0, Math.PI * 2);
          ctx.fillStyle = vramp(ctx, -13, -1, accent); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
          circle(ctx, -24, -14, 5, vramp(ctx, -19, -9, accent), 1);
          poly(ctx, [{ x: -28, y: -17 }, { x: -27, y: -23 }, { x: -23, y: -18 }], accent, 1);
        }
        // Tier dots make similarly equipped warriors distinguishable at thumbnail size.
        for (let i = 0; i < w.tier; i++) circle(ctx, -8 + i * 4, -2, 1.3, accent, 0);
      },
    };
  }
}

/** A summoned beast companion (`troop.<id>.companion`). */
function companionArt(w: { tier: number; look: Record<string, string> }): TroopArt {
  return {
    w: 40, h: 32,
    paint(ctx) {
      const fur = w.tier === 5 ? '#f4ead6' : '#b88750';
      ctx.beginPath(); ctx.ellipse(0, -10, 13, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = vramp(ctx, -17, -3, fur); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
      circle(ctx, 11, -18, 7, vramp(ctx, -25, -11, fur), 1.4);
      poly(ctx, [{ x: 7, y: -23 }, { x: 7, y: -29 }, { x: 12, y: -24 }], fur, 1);
      for (const x of [-9, -3, 5, 10]) line(ctx, [{ x, y: -8 }, { x: x + 1, y: -2 }], fur, 3);
      line(ctx, [{ x: -12, y: -11 }, { x: -18, y: -19 }], fur, 3);
      circle(ctx, 14, -19, 1, INK, 0);
      line(ctx, [{ x: 6, y: -14 }, { x: 13, y: -12 }], w.look.accent, 2.5);
    },
  };
}

const kunai = (ctx: Ctx, s: number) => {
  // Motion streak behind the blade.
  const tg = ctx.createLinearGradient(-12 * s, 0, -2 * s, 0);
  tg.addColorStop(0, rgba('#ffffff', 0));
  tg.addColorStop(1, rgba('#ffffff', 0.5));
  ctx.fillStyle = tg;
  ctx.fillRect(-12 * s, -1.2 * s, 10 * s, 2.4 * s);
  poly(ctx, [{ x: -6 * s, y: 0 }, { x: 2 * s, y: -2.4 * s }, { x: 7 * s, y: 0 }, { x: 2 * s, y: 2.4 * s }], '#c9ced6', 0.9);
  line(ctx, [{ x: -4 * s, y: -0.4 * s }, { x: 6 * s, y: -0.2 * s }], '#ffffff', 0.7 * s);
  line(ctx, [{ x: -6 * s, y: 0 }, { x: -10 * s, y: 0 }], INK, 1.6 * s);
  circle(ctx, -11 * s, 0, 1.4 * s, 'rgba(0,0,0,0)', 0.9);
};

export const projectileArt: Record<string, { w: number; h: number; paint: (ctx: Ctx) => void }> = {
  acorn: { w: 26, h: 10, paint: (ctx) => kunai(ctx, 1) },
  pebble: { w: 20, h: 8, paint: (ctx) => kunai(ctx, 0.75) },
  pinecone: {
    w: 22,
    h: 22,
    paint(ctx) {
      const g = ctx.createRadialGradient(-2.5, -2.5, 0.5, 0, 0, 7);
      g.addColorStop(0, lighten(VERMILION, 0.45));
      g.addColorStop(1, darken(VERMILION, 0.2));
      circle(ctx, 0, 0, 7, g, 1.2);
      line(ctx, [{ x: -7, y: 0 }, { x: 7, y: 0 }], GOLD, 1.4);
      glow(ctx, 2.5, -10.5, 5);
      line(ctx, [{ x: 0, y: -7 }, { x: 2, y: -10 }], '#3a2a1e', 1.2);
      circle(ctx, 2.5, -10.5, 1.6, '#ffcf70', 0);
    },
  },
  sting: {
    w: 16,
    h: 16,
    paint(ctx) {
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        poly(ctx, [{ x: 0, y: -1.6 }, { x: 7, y: 0 }, { x: 0, y: 1.6 }], '#d9dee6', 0.7);
      }
      circle(ctx, 0, 0, 1.6, INK, 0);
    },
  },
  spark: {
    w: 26,
    h: 8,
    paint(ctx) {
      line(ctx, [{ x: -11, y: 0 }, { x: 8, y: 0 }], WOOD, 1.6);
      poly(ctx, [{ x: 8, y: -2.4 }, { x: 13, y: 0 }, { x: 8, y: 2.4 }], '#c9ced6', 0.7);
      poly(ctx, [{ x: -12, y: -3 }, { x: -8, y: 0 }, { x: -12, y: 3 }], WASHI, 0.7);
    },
  },
  seedbomb: {
    w: 18,
    h: 18,
    paint(ctx) {
      const g = ctx.createRadialGradient(-2, -1, 0.5, 0, 1, 6);
      g.addColorStop(0, '#5d6472');
      g.addColorStop(1, '#14181f');
      circle(ctx, 0, 1, 6, g, 1, '#000');
      line(ctx, [{ x: 0, y: -5 }, { x: 3, y: -8 }], '#b8a888', 1.2);
      glow(ctx, 3.5, -8.5, 5);
      circle(ctx, 3.5, -8.5, 1.8, '#ffb15c', 0);
    },
  },
  sap: { w: 10, h: 10, paint: (ctx) => circle(ctx, 0, 0, 3, '#5d636e', 0.8) },
  thorns: { w: 10, h: 10, paint: (ctx) => poly(ctx, [{ x: -3, y: 3 }, { x: 0, y: -4 }, { x: 3, y: 3 }], BAMBOO, 0.8) },
  /** Kite-Cutter Ballista: two weights joined by a cord. */
  bolas: {
    w: 20,
    h: 12,
    paint(ctx) {
      line(ctx, [{ x: -6, y: -2 }, { x: 0, y: 2 }, { x: 6, y: -2 }], '#3a2a1e', 1);
      circle(ctx, -6, -2, 3, '#5d636e', 0.8);
      circle(ctx, 6, -2, 3, '#5d636e', 0.8);
    },
  },
  /** Longbow Yagura: a long fletched arrow. */
  arrow: {
    w: 34,
    h: 8,
    paint(ctx) {
      line(ctx, [{ x: -15, y: 0 }, { x: 11, y: 0 }], WOOD, 1.4);
      poly(ctx, [{ x: 11, y: -2.2 }, { x: 16, y: 0 }, { x: 11, y: 2.2 }], '#c9ced6', 0.7);
      poly(ctx, [{ x: -16, y: -3 }, { x: -11, y: 0 }, { x: -16, y: 3 }], VERMILION, 0.6);
    },
  },
};

/** Grey-white smoke puff (deploys, hits, destruction). */
export function paintPuff(ctx: Ctx): void {
  for (const [x, y, r] of [[-8, 2, 9], [8, 2, 9], [0, -5, 11], [0, 5, 9]] as const) {
    const g = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, 'rgba(240,236,228,0.95)');
    g.addColorStop(1, 'rgba(196,190,186,0.8)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** One soft lobe of a Smoke Bomb cloud (the scene layers several). */
export function paintSmokeLobe(ctx: Ctx): void {
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
  g.addColorStop(0, 'rgba(236,240,245,0.95)');
  g.addColorStop(0.6, 'rgba(196,204,214,0.75)');
  g.addColorStop(1, 'rgba(160,170,184,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
}

/** Marker over a sabotaged (jammed) defense: a gold wrench crossing a broken gear. */
export function paintJam(ctx: Ctx): void {
  const dg = ctx.createRadialGradient(-3, -4, 1, 0, 0, 11);
  dg.addColorStop(0, '#46505f');
  dg.addColorStop(1, '#1d232c');
  circle(ctx, 0, 0, 12.5, 'rgba(233,180,76,0.35)', 0);
  circle(ctx, 0, 0, 11, dg, 1.4, '#141a22');
  ctx.save();
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.fillStyle = '#8a8f99';
    ctx.fillRect(-1.8, -9, 3.6, 3);
  }
  ctx.restore();
  circle(ctx, 0, 0, 5.5, '#8a8f99', 1, '#141a22');
  line(ctx, [{ x: -6, y: 6 }, { x: 6, y: -6 }], GOLD, 2.6);
  circle(ctx, 6.5, -6.5, 2.6, 'rgba(0,0,0,0)', 1.6, GOLD);
}

export function paintStar(ctx: Ctx, color = GOLD): void {
  if (color === GOLD) glow(ctx, 0, 0, 12);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.5 : 10;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, -10, 0, 10);
  sg.addColorStop(0, lighten(color, 0.45));
  sg.addColorStop(0.5, color);
  sg.addColorStop(1, darken(color, 0.15));
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = mix(color, INK, 0.5);
  ctx.stroke();
  line(ctx, [{ x: -2.5, y: -4 }, { x: 0, y: -8 }], rgba('#ffffff', 0.7), 1);
}

export function paintShadowDisc(ctx: Ctx): void {
  softShadow(ctx, 16, 6, 0, 0.35);
}
