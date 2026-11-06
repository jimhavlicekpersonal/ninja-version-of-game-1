/**
 * Soft, rounded, glossy drawing helpers for the code-generated art.
 * Style: bright colours, smooth gradients lit from the top-left, thin outlines
 * in a darker shade of the fill (never black), glossy highlights, cute faces.
 */

export type Ctx = CanvasRenderingContext2D;
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
/** Shadows lean toward a deep plum instead of grey, which keeps colours warm and lively. */
export const darken = (c: string, t: number) => mix(c, '#2a1638', t);

export function rgba(c: string, a: number): string {
  const [r, g, b] = toRgb(c);
  return `rgba(${r},${g},${b},${a})`;
}

/** Fill the current path with a soft radial light from the upper left. */
export function shade(ctx: Ctx, box: Box, base: string, light = 0.32, dark = 0.24): void {
  const cx = box.x + box.w * 0.32;
  const cy = box.y + box.h * 0.24;
  const r = Math.hypot(box.w, box.h) * 0.85;
  const g = ctx.createRadialGradient(cx, cy, r * 0.04, cx, cy, r);
  g.addColorStop(0, lighten(base, light));
  g.addColorStop(0.45, base);
  g.addColorStop(1, darken(base, dark));
  ctx.fillStyle = g;
  ctx.fill();
}

/** Fill the current path with round-object shading across x (highlight band left of centre). */
export function shadeRound(ctx: Ctx, x0: number, x1: number, base: string): void {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, darken(base, 0.12));
  g.addColorStop(0.28, lighten(base, 0.3));
  g.addColorStop(0.62, base);
  g.addColorStop(1, darken(base, 0.28));
  ctx.fillStyle = g;
  ctx.fill();
}

/** Thin outline in a darker version of the fill colour. */
export function rim(ctx: Ctx, base: string, width = 1.6): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = darken(base, 0.5);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Path + shading + outline in one call. */
export function blob(ctx: Ctx, box: Box, base: string, path: () => void, opts: { light?: number; dark?: number; line?: number } = {}): void {
  ctx.beginPath();
  path();
  shade(ctx, box, base, opts.light, opts.dark);
  rim(ctx, base, opts.line);
}

export function gloss(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = -0.5, a = 0.6): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.7, `rgba(255,255,255,${a * 0.5})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Soft contact shadow on the ground. */
export function softShadow(ctx: Ctx, rx: number, ry: number, y = 0, a = 0.3): void {
  ctx.save();
  ctx.translate(0, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  g.addColorStop(0, `rgba(38,30,70,${a})`);
  g.addColorStop(1, 'rgba(38,30,70,0)');
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Darken the bottom of a shape where it meets the ground. `path` must describe the shape. */
export function occlude(ctx: Ctx, path: () => void, top: number, bottom: number, a = 0.18): void {
  ctx.save();
  ctx.beginPath();
  path();
  ctx.clip();
  const g = ctx.createLinearGradient(0, bottom, 0, top);
  g.addColorStop(0, `rgba(42,22,56,${a})`);
  g.addColorStop(1, 'rgba(42,22,56,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-9999, top, 19998, bottom - top);
  ctx.restore();
}

export function ellipsePath(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ctx.moveTo(x + rx, y);
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Diamond with softly rounded corners (a building's footprint plate). */
export function softDiamondPath(ctx: Ctx, hw: number, hh: number, cy = 0, round = 0.18): void {
  const pts: [number, number][] = [[0, cy - hh], [hw, cy], [0, cy + hh], [-hw, cy]];
  for (let i = 0; i < 4; i++) {
    const [x, y] = pts[i];
    const [px, py] = pts[(i + 3) % 4];
    const [nx, ny] = pts[(i + 1) % 4];
    const ax = x + (px - x) * round;
    const ay = y + (py - y) * round;
    const bx = x + (nx - x) * round;
    const by = y + (ny - y) * round;
    if (i === 0) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(x, y, bx, by);
  }
  ctx.closePath();
}

/** Upright cylinder with round shading and a lighter top. */
export function cylinder(ctx: Ctx, rx: number, ry: number, bottom: number, top: number, base: string, topColor?: string): void {
  ctx.beginPath();
  ctx.moveTo(-rx, top);
  ctx.lineTo(-rx, bottom);
  ctx.ellipse(0, bottom, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(rx, top);
  ctx.closePath();
  shadeRound(ctx, -rx, rx, base);
  rim(ctx, base);
  ctx.beginPath();
  ellipsePath(ctx, 0, top, rx, ry);
  shade(ctx, { x: -rx, y: top - ry, w: rx * 2, h: ry * 2 }, topColor ?? lighten(base, 0.18), 0.25, 0.12);
  rim(ctx, base);
}

/** Deterministic pseudo-random numbers for art details. */
export function artRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
