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

export type Tier = 1 | 2 | 3;
export type Painter = (ctx: Ctx, size: number, tier: Tier) => void;
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

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string, line = 1.2, stroke = INK): void {
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

/** Footprint plate: packed earth or gravel with a soft edge. */
function plate(ctx: Ctx, size: number, color: string, inset = 4): void {
  const hw = (size * TILE_W) / 2 - inset;
  const hh = (size * TILE_H) / 2 - inset / 2;
  poly(ctx, [{ x: 0, y: -hh }, { x: hw, y: 0 }, { x: 0, y: hh }, { x: -hw, y: 0 }], color, 1.2, darken(color, 0.35));
  const r = artRng(size * 31 + color.length);
  ctx.fillStyle = rgba(darken(color, 0.3), 0.35);
  for (let i = 0; i < size * 10; i++) {
    const u = r() * 2 - 1;
    const v = (r() * 2 - 1) * (1 - Math.abs(u));
    ctx.fillRect(u * hw * 0.85, v * hh * 0.85, 1.6, 1.2);
  }
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
  poly(ctx, [{ x: -hw, y: y0 }, { x: 0, y: y0 + hh }, { x: 0, y: y1 + hh }, { x: -hw, y: y1 }], lighten(front, 0.06), lw);
  poly(ctx, [{ x: 0, y: y0 + hh }, { x: hw, y: y0 }, { x: hw, y: y1 }, { x: 0, y: y1 + hh }], darken(front, 0.16), lw);
  poly(ctx, [{ x: 0, y: y1 - hh }, { x: hw, y: y1 }, { x: 0, y: y1 + hh }, { x: -hw, y: y1 }], opts.top ?? lighten(front, 0.2), lw);
  return y1;
}

/** Stone plinth (ishigaki-style) with staggered block joints. */
function stoneBase(ctx: Ctx, hw: number, hh: number, base: number, height: number, color = STONE): number {
  const top = block(ctx, hw, hh, base, height, color, { top: lighten(color, 0.15) });
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 0.9;
  const rows = Math.max(1, Math.round(height / 7));
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
function roof(ctx: Ctx, hw: number, hh: number, eave: number, rise: number, color = ROOF, opts: { flare?: number; ridge?: string; finial?: string } = {}): number {
  const flare = opts.flare ?? Math.min(10, hw * 0.16);
  const apex = { x: 0, y: eave - rise };
  const L = { x: -hw, y: eave - flare };
  const R = { x: hw, y: eave - flare };
  const B = { x: 0, y: eave + hh };
  const T = { x: 0, y: eave - hh };
  // Back slopes (silhouette only).
  poly(ctx, [L, T, apex], darken(color, 0.25), 1.4);
  poly(ctx, [T, R, apex], darken(color, 0.32), 1.4);
  // Front slopes with a slight concave sag toward the eaves.
  const face = (a: Pt, b: Pt, fill: string) => {
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
  face(L, B, lighten(color, 0.08));
  face(B, R, darken(color, 0.12));
  // Tile rows.
  ctx.save();
  for (const [a, b] of [[L, B], [B, R]] as const) {
    for (let i = 1; i < 6; i++) {
      const f = i / 6;
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f + 2 };
      line(ctx, [p, { x: apex.x + (p.x - apex.x) * 0.25, y: apex.y + (p.y - apex.y) * 0.25 }], rgba('#ffffff', 0.13), 1);
    }
  }
  ctx.restore();
  // Eave edge highlight and ridge.
  line(ctx, [L, { x: B.x, y: B.y }, R], rgba(lighten(color, 0.5), 0.6), 1.2);
  line(ctx, [B, apex], opts.ridge ?? darken(color, 0.45), 2.2);
  if (opts.finial) {
    circle(ctx, apex.x, apex.y - 3, 3.2, opts.finial, 1);
    line(ctx, [{ x: apex.x, y: apex.y - 6 }, { x: apex.x, y: apex.y - 11 }], opts.finial, 1.6);
  }
  return apex.y;
}

/** Plaster wall storey with timber posts and an optional lit window. */
function storey(ctx: Ctx, hw: number, hh: number, base: number, height: number, wall = PLASTER, opts: { window?: boolean; door?: boolean; trim?: string } = {}): number {
  const top = block(ctx, hw, hh, base, height, wall);
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
    poly(ctx, [{ x: wx - 5, y: wy - 6 }, { x: wx + 5, y: wy - 1 }, { x: wx + 5, y: wy + 7 }, { x: wx - 5, y: wy + 2 }], '#ffd27a', 1.1);
    line(ctx, [{ x: wx, y: wy - 3.5 }, { x: wx, y: wy + 4.5 }], rgba(WOOD_DARK, 0.8), 0.9);
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
      softShadow(ctx, hw * 0.8, hh * 0.8, 6, 0.3);
      let y = stoneBase(ctx, hw * 0.78, hh * 0.78, 6, 26);
      const storeys = tier + 1;
      let w = hw * 0.62;
      for (let i = 0; i < storeys; i++) {
        const h = i === 0 ? 30 : 24;
        const top = storey(ctx, w, w / 2, y, h, PLASTER, { window: true, door: i === 0, trim: trimColor });
        const last = i === storeys - 1;
        const rw = w + 14;
        const apex = roof(ctx, rw, rw / 2, top + 4, last ? 40 : 22, roofColor, { finial: last ? (tier === 3 ? GOLD : trimColor) : undefined, ridge: tier === 3 ? GOLD : undefined });
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

const ricePaddy: PainterDef = {
  extra: 60,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#8a7a5a');
    // Two terraces of water with rows of sprouts.
    for (const [s, dy] of [[0.86, 2], [0.56, -6]] as const) {
      const w = hw * s;
      const h = hh * s;
      block(ctx, w, h, dy, 5, '#7a6646', { top: '#7fb4c8' });
      const r = artRng(Math.round(w));
      ctx.strokeStyle = '#5c9e45';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 18 + tier * 6; i++) {
        const u = r() * 1.6 - 0.8;
        const v = (r() * 1.6 - 0.8) * (1 - Math.abs(u));
        const x = u * w;
        const y = dy - 5 + v * h;
        line(ctx, [{ x, y }, { x: x - 1, y: y - 5 }], '#5c9e45', 1.4);
        line(ctx, [{ x, y }, { x: x + 2, y: y - 4 }], '#79bd5a', 1.2);
      }
    }
    // Scarecrow-post with a straw hat; tier 3 adds a lantern.
    line(ctx, [{ x: hw * 0.45, y: -2 }, { x: hw * 0.45, y: -38 }], WOOD_DARK, 2.4);
    line(ctx, [{ x: hw * 0.45 - 10, y: -28 }, { x: hw * 0.45 + 10, y: -28 }], WOOD_DARK, 2);
    poly(ctx, [{ x: hw * 0.45 - 11, y: -38 }, { x: hw * 0.45, y: -46 }, { x: hw * 0.45 + 11, y: -38 }], RICE, 1.1);
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

const squadCourtyard: PainterDef = {
  extra: 50,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#cdbf9f', 2);
    // Low bamboo fence around the edge.
    const corners = [{ x: 0, y: -hh + 6 }, { x: hw - 10, y: 0 }, { x: 0, y: hh - 6 }, { x: -hw + 10, y: 0 }];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      for (let k = 0; k <= 8; k++) {
        const x = a.x + ((b.x - a.x) * k) / 8;
        const yy = a.y + ((b.y - a.y) * k) / 8;
        if (i === 2 && k > 3 && k < 6) continue; // gate gap
        line(ctx, [{ x, y: yy }, { x, y: yy - 9 }], BAMBOO, 2.2);
      }
      line(ctx, [{ x: a.x, y: a.y - 6 }, { x: b.x, y: b.y - 6 }], darken(BAMBOO, 0.3), 1.4);
    }
    // Campfire and weapon rack; banners per tier.
    circle(ctx, 0, 2, 6, '#5a4a3a', 1);
    poly(ctx, [{ x: -4, y: 2 }, { x: 0, y: -9 }, { x: 4, y: 2 }], '#f2933a', 0.8);
    poly(ctx, [{ x: -2, y: 2 }, { x: 0, y: -5 }, { x: 2, y: 2 }], '#ffe08a', 0);
    for (let i = 0; i < 3; i++) line(ctx, [{ x: -hw * 0.45 + i * 6, y: -hh * 0.2 + i * 3 }, { x: -hw * 0.45 + i * 6 + 3, y: -hh * 0.2 + i * 3 - 22 }], '#c9ced6', 1.6);
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

const fireworkMortar: PainterDef = {
  extra: 70,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a69c88');
    const y = stoneBase(ctx, hw * 0.62, hh * 0.62, 2, 12);
    // Wide bronze tube angled up.
    ctx.save();
    ctx.translate(2, y - 6);
    ctx.rotate(-0.55);
    poly(ctx, [{ x: -10, y: -14 }, { x: 34, y: -14 }, { x: 34, y: 14 }, { x: -10, y: 14 }], tier >= 3 ? '#b88a3e' : '#7a6a52', 1.6);
    for (const x of [0, 14, 28]) line(ctx, [{ x, y: -14 }, { x, y: 14 }], tier >= 2 ? GOLD : '#4a3f30', 2.2);
    ctx.beginPath();
    ctx.ellipse(34, 0, 5, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2420';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    // Stack of red shells with fuses.
    for (let i = 0; i < 2 + tier; i++) {
      const x = -hw * 0.5 + (i % 3) * 8;
      const yy = hh * 0.35 - Math.floor(i / 3) * 7;
      circle(ctx, x, yy, 4.2, VERMILION, 1);
      line(ctx, [{ x, y: yy - 4 }, { x: x + 2, y: yy - 7 }], '#3a2a1e', 1);
    }
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

const stoneWall: PainterDef = {
  extra: 26,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    const color = tier === 1 ? '#a3a7ad' : tier === 2 ? '#7d838e' : '#5d636e';
    const top = stoneBase(ctx, hw * 0.92, hh * 0.92, 2, 18, color);
    // Tiled coping; reinforced walls get iron bands and a gold stud.
    block(ctx, hw * 0.98, hh * 0.98, top, 4, ROOF, { top: lighten(ROOF, 0.15), lw: 1.1 });
    if (tier >= 2) {
      line(ctx, [{ x: -hw * 0.92, y: top + 10 }, { x: 0, y: top + 10 + hh * 0.92 }, { x: hw * 0.92, y: top + 10 }], '#3a3f48', 2.2);
    }
    if (tier >= 3) circle(ctx, -hw * 0.45, top + 13 + hh * 0.45, 1.6, GOLD, 0.6);
  },
};

const spikePit: PainterDef = {
  extra: 14,
  paint(ctx, size) {
    const { hw, hh } = half(size);
    poly(ctx, [{ x: 0, y: -hh * 0.7 }, { x: hw * 0.7, y: 0 }, { x: 0, y: hh * 0.7 }, { x: -hw * 0.7, y: 0 }], '#4a3f30', 1.2);
    const r = artRng(5);
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * hw;
      const y = (r() - 0.5) * hh * 0.6;
      poly(ctx, [{ x: x - 2, y }, { x, y: y - 11 }, { x: x + 2, y }], BAMBOO, 0.8);
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
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + r();
        line(ctx, [{ x, y }, { x: x + Math.cos(a) * 3.5, y: y + Math.sin(a) * 2 - (k === 0 ? 3 : 0) }], '#5d636e', 1.4);
      }
    }
  },
};

const bonsai: PainterDef = {
  extra: 26,
  paint(ctx) {
    block(ctx, 12, 6, 2, 7, '#7a3f2a');
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.quadraticCurveTo(-6, -12, 2, -18);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = WOOD_DARK;
    ctx.stroke();
    for (const [x, y, rx] of [[-6, -18, 8], [5, -22, 7], [0, -27, 6]] as const) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.55, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#3f7a46';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
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
  extra: 18,
  paint(ctx, size) {
    const { hw, hh } = half(size);
    poly(ctx, [{ x: 0, y: -hh + 2 }, { x: hw - 4, y: 0 }, { x: 0, y: hh - 2 }, { x: -hw + 4, y: 0 }], '#e8e2d4', 1.2, '#b8b0a0');
    for (let i = 1; i < 5; i++) {
      const f = i / 5;
      line(ctx, [{ x: -hw * (1 - f) * 0.9, y: -hh * f * 0.9 + hh * 0.45 }, { x: hw * f * 0.9 - hw * 0.45, y: -hh * 0.45 + hh * (1 - f) * 0.9 }], '#cfc6b4', 1);
    }
    for (const [x, y, r] of [[-6, -2, 4], [5, 2, 3], [2, -5, 2.4]] as const) circle(ctx, x, y - 2, r, '#7d838e', 1);
  },
};

const foxStatue: PainterDef = {
  extra: 60,
  paint(ctx) {
    block(ctx, 12, 6, 2, 12, STONE);
    // Seated fox guardian, stylised and original.
    poly(ctx, [{ x: -7, y: -10 }, { x: 7, y: -10 }, { x: 5, y: -30 }, { x: -5, y: -30 }], '#b9b4a8', 1.3);
    circle(ctx, 0, -35, 7, '#c4bfb2', 1.3);
    poly(ctx, [{ x: -6, y: -38 }, { x: -4, y: -48 }, { x: -1, y: -40 }], '#c4bfb2', 1.1);
    poly(ctx, [{ x: 6, y: -38 }, { x: 4, y: -48 }, { x: 1, y: -40 }], '#c4bfb2', 1.1);
    poly(ctx, [{ x: 0, y: -34 }, { x: 9, y: -32 }, { x: 0, y: -30 }], '#c4bfb2', 1);
    poly(ctx, [{ x: -6, y: -27 }, { x: 6, y: -27 }, { x: 0, y: -21 }], VERMILION, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(-3, -37, 1.6, 1.6);
    ctx.fillRect(2, -37, 1.6, 1.6);
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
  extra: 28,
  paint(ctx, size) {
    const { hw } = half(size);
    ctx.save();
    ctx.rotate(0.45);
    poly(ctx, [{ x: -hw * 0.7, y: -6 }, { x: hw * 0.6, y: -6 }, { x: hw * 0.6, y: 6 }, { x: -hw * 0.7, y: 6 }], '#7a5236', 1.4);
    ctx.beginPath();
    ctx.ellipse(hw * 0.6, 0, 3.5, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c9a07a';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    circle(ctx, -hw * 0.3, -8, 5, '#4f7a46', 1);
  },
};

const boulder: PainterDef = {
  extra: 30,
  paint(ctx, size) {
    const { hw } = half(size);
    poly(ctx, [{ x: -hw * 0.6, y: 6 }, { x: -hw * 0.5, y: -12 }, { x: -hw * 0.1, y: -22 }, { x: hw * 0.4, y: -16 }, { x: hw * 0.6, y: 2 }, { x: hw * 0.2, y: 10 }], '#8a8f99', 1.5);
    poly(ctx, [{ x: -hw * 0.1, y: -22 }, { x: hw * 0.4, y: -16 }, { x: hw * 0.1, y: -8 }, { x: -hw * 0.3, y: -10 }], '#a9aeb7', 0);
    circle(ctx, -hw * 0.3, -6, 3, '#6b9c52', 0);
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
  extra: 90,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a9a08c');
    const y = stoneBase(ctx, hw * 0.45, hh * 0.45, 2, 10);
    // Mast and a long jib with a hook and a big gear.
    line(ctx, [{ x: -6, y }, { x: -6, y: y - 58 }], WOOD_DARK, 4);
    line(ctx, [{ x: -10, y: y - 54 }, { x: hw * 0.75, y: y - 62 }], WOOD, 3);
    line(ctx, [{ x: -6, y: y - 30 }, { x: hw * 0.4, y: y - 59 }], WOOD, 1.4);
    line(ctx, [{ x: hw * 0.7, y: y - 61 }, { x: hw * 0.7, y: y - 30 }], '#5d636e', 1);
    line(ctx, [{ x: hw * 0.7 - 3, y: y - 30 }, { x: hw * 0.7, y: y - 26 }, { x: hw * 0.7 + 3, y: y - 30 }], '#5d636e', 1.6);
    const gx = -hw * 0.35;
    const gy = y - 18;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      circle(ctx, gx + Math.cos(ang) * 10, gy + Math.sin(ang) * 10, 2.6, tier >= 3 ? GOLD : '#b8862f', 0.8);
    }
    circle(ctx, gx, gy, 9, tier >= 3 ? GOLD : '#b8862f', 1.2);
    circle(ctx, gx, gy, 3, INK, 0);
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
  extra: 70,
  paint(ctx, size, tier) {
    const { hw, hh } = half(size);
    plate(ctx, size, '#a9a08c');
    const y = stoneBase(ctx, hw * 0.55, hh * 0.55, 2, 12);
    // Upward-pointing bow on a turntable, with a weighted bolas ready.
    const deck = block(ctx, hw * 0.4, hh * 0.4, y, 8, WOOD);
    ctx.save();
    ctx.translate(0, deck - 8);
    ctx.rotate(-0.9);
    line(ctx, [{ x: -6, y: 0 }, { x: 30, y: 0 }], WOOD_DARK, 4);
    ctx.beginPath();
    ctx.arc(16, 0, 18, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9);
    ctx.strokeStyle = tier >= 3 ? GOLD : WOOD;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    circle(ctx, -hw * 0.45, hh * 0.25, 3.5, '#5d636e', 1);
    circle(ctx, -hw * 0.3, hh * 0.4, 3.5, '#5d636e', 1);
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

/** Visual tier for a level: the level range is split into thirds. */
export function tierFor(level: number, maxLevel: number): Tier {
  if (maxLevel <= 1) return 1;
  const f = (level - 1) / (maxLevel - 1);
  return f < 0.34 ? 1 : f < 0.67 ? 2 : 3;
}

export function paintGeneric(ctx: Ctx, size: number): void {
  const { hw, hh } = half(size);
  plate(ctx, size, '#b8a888');
  const top = storey(ctx, hw * 0.55, hh * 0.55, 0, 20);
  roof(ctx, hw * 0.75, hh * 0.75, top + 2, 20);
}

/** Bamboo scaffolding with a tarp: a building under construction. */
export function paintConstruction(ctx: Ctx, size: number): void {
  const { hw, hh } = half(size);
  plate(ctx, size, '#bba98a');
  const h = 18 + size * 8;
  poly(ctx, [{ x: -hw * 0.5, y: 0 }, { x: 0, y: hh * 0.5 }, { x: 0, y: hh * 0.5 - h * 0.6 }, { x: -hw * 0.5, y: -h * 0.6 }], rgba('#3f6fa0', 0.85), 1.2);
  for (const [x, y] of [[-hw * 0.55, 0], [0, hh * 0.55], [hw * 0.55, 0], [0, -hh * 0.55]] as const) line(ctx, [{ x, y }, { x, y: y - h }], BAMBOO, 2.6);
  for (const f of [0.4, 0.8]) {
    line(ctx, [{ x: -hw * 0.55, y: -h * f }, { x: 0, y: hh * 0.55 - h * f }, { x: hw * 0.55, y: -h * f }], darken(BAMBOO, 0.2), 2);
  }
  riceBale(ctx, hw * 0.4, hh * 0.4, 0.8);
}

/** Broken tiles and beams where a building stood. */
export function paintRubble(ctx: Ctx, size: number): void {
  const { hw, hh } = half(size);
  const r = artRng(size * 13);
  poly(ctx, [{ x: 0, y: -hh * 0.6 }, { x: hw * 0.6, y: 0 }, { x: 0, y: hh * 0.6 }, { x: -hw * 0.6, y: 0 }], '#6e6458', 1, '#4a4238');
  for (let i = 0; i < 6 + size * 3; i++) {
    const x = (r() - 0.5) * hw;
    const y = (r() - 0.5) * hh * 0.8;
    if (r() < 0.5) line(ctx, [{ x, y }, { x: x + (r() - 0.5) * 16, y: y - 4 - r() * 4 }], WOOD_DARK, 2.4);
    else poly(ctx, [{ x, y }, { x: x + 5, y: y - 2 }, { x: x + 4, y: y + 2 }], ROOF, 0.6);
  }
}

/** Ready-to-collect bubble over a collector. */
export function paintBubble(ctx: Ctx, resource: string): void {
  ctx.beginPath();
  ctx.moveTo(-15, -6);
  ctx.arc(0, -6, 15, Math.PI, 0);
  ctx.quadraticCurveTo(15, 10, 0, 22);
  ctx.quadraticCurveTo(-15, 10, -15, -6);
  ctx.closePath();
  ctx.fillStyle = WASHI;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (resource === 'acorn' || resource === 'acorns') {
    circle(ctx, 0, -4, 8, GOLD, 1.2, darken(GOLD, 0.5));
    ctx.fillStyle = darken(GOLD, 0.5);
    ctx.fillRect(-2.2, -6.2, 4.4, 4.4);
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
  hat?: 'kasa' | 'helm' | null;
  pack?: 'satchel' | 'bombs' | null;
}

/** Chibi ninja, facing right, feet at y = 0. Shared by every warrior and their icons. */
export function ninja(ctx: Ctx, look: NinjaLook): void {
  const s = look.scale ?? 1;
  ctx.save();
  ctx.scale(s, s);
  softShadow(ctx, 11, 4, 0, 0.3);
  const gi = look.gi;
  // Legs
  poly(ctx, [{ x: -6, y: -9 }, { x: -2, y: -9 }, { x: -2, y: 0 }, { x: -7, y: 0 }], darken(gi, 0.15), 1.1);
  poly(ctx, [{ x: 2, y: -9 }, { x: 6, y: -9 }, { x: 7, y: 0 }, { x: 2, y: 0 }], darken(gi, 0.2), 1.1);
  // Body
  poly(ctx, [{ x: -8, y: -22 }, { x: 8, y: -22 }, { x: 9, y: -8 }, { x: -9, y: -8 }], gi, 1.3);
  line(ctx, [{ x: -9, y: -12 }, { x: 9, y: -12 }], look.band ?? VERMILION, 2.2); // sash
  if (look.armor) {
    poly(ctx, [{ x: -9, y: -21 }, { x: 9, y: -21 }, { x: 10, y: -13 }, { x: -10, y: -13 }], look.armor, 1.2);
    for (const y of [-18, -15]) line(ctx, [{ x: -9, y }, { x: 9, y }], darken(look.armor, 0.35), 0.9);
  }
  if (look.pack === 'satchel') poly(ctx, [{ x: -12, y: -20 }, { x: -6, y: -20 }, { x: -6, y: -11 }, { x: -12, y: -11 }], WOOD, 1);
  if (look.pack === 'bombs') for (const y of [-19, -13]) circle(ctx, -10, y, 3, INK, 0.8, '#000');
  // Head with hood and mask.
  circle(ctx, 0, -31, 10, look.mask ?? gi, 1.4);
  poly(ctx, [{ x: -7, y: -34 }, { x: 10, y: -34 }, { x: 10, y: -28 }, { x: -7, y: -28 }], look.skin ?? '#f1c9a0', 0);
  line(ctx, [{ x: -7, y: -34 }, { x: 10, y: -34 }], INK, 0.8);
  line(ctx, [{ x: -7, y: -28 }, { x: 10, y: -28 }], INK, 0.8);
  // Determined eyes
  line(ctx, [{ x: 2, y: -32.2 }, { x: 5, y: -31.4 }], INK, 1.6);
  line(ctx, [{ x: 6.5, y: -31.6 }, { x: 9, y: -32.4 }], INK, 1.6);
  // Headband with flowing tails.
  line(ctx, [{ x: -9, y: -37 }, { x: 9, y: -38 }], look.band ?? VERMILION, 2.4);
  ctx.beginPath();
  ctx.moveTo(-9, -37);
  ctx.quadraticCurveTo(-15, -38, -18, -33);
  ctx.moveTo(-9, -37);
  ctx.quadraticCurveTo(-14, -34, -16, -29);
  ctx.lineWidth = 2;
  ctx.strokeStyle = look.band ?? VERMILION;
  ctx.stroke();
  if (look.hat === 'kasa') poly(ctx, [{ x: -14, y: -38 }, { x: 0, y: -47 }, { x: 14, y: -38 }], RICE, 1.2);
  if (look.hat === 'helm') {
    poly(ctx, [{ x: -11, y: -35 }, { x: -8, y: -43 }, { x: 8, y: -43 }, { x: 11, y: -35 }], look.armor ?? '#5d636e', 1.2);
    poly(ctx, [{ x: -3, y: -43 }, { x: 0, y: -50 }, { x: 3, y: -43 }], GOLD, 0.9);
  }
  // Arm and weapon
  const w = look.weapon ?? 'katana';
  if (w === 'katana') {
    line(ctx, [{ x: 6, y: -18 }, { x: 22, y: -30 }], '#d9dee6', 2.2);
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

/** Register code-drawn catalog warriors. Rendering supplies metadata across the art contract. */
export function registerWarriorArt(warriors: { id: string; role: string; tier: number; look: Record<string, string> }[]): void {
  for (const w of warriors) {
    if (troopArt[w.id]) continue;
    const role = w.role;
    const large = role === 'guardian';
    const flying = role === 'sky';
    troopArt[w.id] = {
      w: flying ? 76 : large || role === 'beast' ? 66 : 54,
      h: flying ? 76 : large ? 68 : 58,
      paint(ctx) {
        const accent = w.look.accent;
        if (flying) {
          poly(ctx, [{ x: -34, y: -43 }, { x: 0, y: -68 }, { x: 34, y: -43 }, { x: 0, y: -29 }], accent, 1.4);
          line(ctx, [{ x: -34, y: -43 }, { x: 34, y: -43 }], WOOD_DARK, 1.4);
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
          circle(ctx, 17, -28, 5, accent, 1.2);
          line(ctx, [{ x: 17, y: -23 }, { x: 17, y: -4 }], WOOD, 2);
        }
        if (role === 'siege') {
          poly(ctx, [{ x: 6, y: -22 }, { x: 23, y: -28 }, { x: 26, y: -18 }, { x: 9, y: -12 }], '#5d636e', 1.4);
          circle(ctx, 13, -7, 5, WOOD_DARK, 1);
        }
        if (role === 'beast') {
          ctx.beginPath();
          ctx.ellipse(-19, -7, 10, 6, 0, 0, Math.PI * 2);
          ctx.fillStyle = accent; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
          circle(ctx, -24, -14, 5, accent, 1);
          poly(ctx, [{ x: -28, y: -17 }, { x: -27, y: -23 }, { x: -23, y: -18 }], accent, 1);
        }
        // Tier dots make similarly equipped warriors distinguishable at thumbnail size.
        for (let i = 0; i < w.tier; i++) circle(ctx, -8 + i * 4, -2, 1.3, accent, 0);
      },
    };
    if (role === 'beast') troopArt[`${w.id}.companion`] = {
      w: 40, h: 32,
      paint(ctx) {
        const fur = w.tier === 5 ? '#f4ead6' : '#b88750';
        ctx.beginPath(); ctx.ellipse(0, -10, 13, 7, 0, 0, Math.PI * 2);
        ctx.fillStyle = fur; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
        circle(ctx, 11, -18, 7, fur, 1.4);
        poly(ctx, [{ x: 7, y: -23 }, { x: 7, y: -29 }, { x: 12, y: -24 }], fur, 1);
        for (const x of [-9, -3, 5, 10]) line(ctx, [{ x, y: -8 }, { x: x + 1, y: -2 }], fur, 3);
        line(ctx, [{ x: -12, y: -11 }, { x: -18, y: -19 }], fur, 3);
        circle(ctx, 14, -19, 1, INK, 0);
        line(ctx, [{ x: 6, y: -14 }, { x: 13, y: -12 }], w.look.accent, 2.5);
      },
    };
  }
}

const kunai = (ctx: Ctx, s: number) => {
  poly(ctx, [{ x: -6 * s, y: 0 }, { x: 2 * s, y: -2.4 * s }, { x: 7 * s, y: 0 }, { x: 2 * s, y: 2.4 * s }], '#c9ced6', 0.9);
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
      circle(ctx, 0, 0, 7, VERMILION, 1.2);
      line(ctx, [{ x: -7, y: 0 }, { x: 7, y: 0 }], GOLD, 1.4);
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
      circle(ctx, 0, 1, 6, INK, 1, '#000');
      line(ctx, [{ x: 0, y: -5 }, { x: 3, y: -8 }], '#b8a888', 1.2);
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
    const g = ctx.createRadialGradient(x - 2, y - 3, 1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, 'rgba(214,220,228,0.85)');
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
  circle(ctx, 0, 0, 11, '#2b3340', 1.4, '#141a22');
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
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = mix(color, INK, 0.5);
  ctx.stroke();
}

export function paintShadowDisc(ctx: Ctx): void {
  softShadow(ctx, 16, 6, 0, 0.35);
}
