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

/** Big glossy eyes, a small smile and rosy cheeks. */
export function face(ctx: Ctx, x: number, y: number, s: number, opts: { blush?: boolean; mood?: 'smile' | 'grin' | 'o' | 'determined' } = {}): void {
  const ink = '#2b1838';
  for (const dx of [-6.5 * s, 6.5 * s]) {
    ctx.beginPath();
    ctx.ellipse(x + dx, y, 2.5 * s, 3.7 * s, 0, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, y - 3.7 * s, 0, y + 3.7 * s);
    g.addColorStop(0, '#3a2350');
    g.addColorStop(1, ink);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + dx + 0.7 * s, y - 1.4 * s, 1.15 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + dx - 0.8 * s, y + 1.5 * s, 0.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.mood === 'determined') {
    ctx.lineWidth = 1.3 * s;
    ctx.strokeStyle = ink;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + d * 9 * s, y - 5.5 * s);
      ctx.lineTo(x + d * 4 * s, y - 4.2 * s);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1.4 * s;
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (opts.mood === 'o') {
    ctx.ellipse(x, y + 4.4 * s, 1.5 * s, 1.9 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7a2e45';
    ctx.fill();
  } else if (opts.mood === 'grin') {
    ctx.moveTo(x - 3.2 * s, y + 3 * s);
    ctx.quadraticCurveTo(x, y + 7.5 * s, x + 3.2 * s, y + 3 * s);
    ctx.closePath();
    ctx.fillStyle = '#7a2e45';
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.arc(x, y + 2.6 * s, 2.6 * s, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  if (opts.blush !== false) {
    for (const dx of [-10.5 * s, 10.5 * s]) {
      const g = ctx.createRadialGradient(x + dx, y + 3.4 * s, 0, x + dx, y + 3.4 * s, 3.4 * s);
      g.addColorStop(0, 'rgba(255,120,150,0.6)');
      g.addColorStop(1, 'rgba(255,120,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + dx, y + 3.4 * s, 3.4 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Glossy acorn icon/object. */
export function acorn(ctx: Ctx, x: number, y: number, s: number): void {
  const body = '#e9a35a';
  const cap = '#8f5b31';
  blob(ctx, { x: x - 6 * s, y: y - 4 * s, w: 12 * s, h: 15 * s }, body, () => {
    ctx.moveTo(x - 6 * s, y);
    ctx.bezierCurveTo(x - 6.5 * s, y + 7 * s, x - 2 * s, y + 10.5 * s, x, y + 11 * s);
    ctx.bezierCurveTo(x + 2 * s, y + 10.5 * s, x + 6.5 * s, y + 7 * s, x + 6 * s, y);
    ctx.closePath();
  }, { line: 1.2 * s });
  gloss(ctx, x - 2.2 * s, y + 3.5 * s, 1.6 * s, 3 * s, 0.2, 0.7);
  blob(ctx, { x: x - 7.5 * s, y: y - 5 * s, w: 15 * s, h: 7 * s }, cap, () => {
    ctx.moveTo(x - 7.5 * s, y + 0.5 * s);
    ctx.bezierCurveTo(x - 7.5 * s, y - 5.5 * s, x + 7.5 * s, y - 5.5 * s, x + 7.5 * s, y + 0.5 * s);
    ctx.quadraticCurveTo(x, y + 2.5 * s, x - 7.5 * s, y + 0.5 * s);
    ctx.closePath();
  }, { line: 1.2 * s });
  ctx.fillStyle = rgba('#ffffff', 0.25);
  for (const [dx, dy] of [[-3.5, -1.2], [0, -2.4], [3.5, -1.2], [-1.8, 0.4], [1.8, 0.4]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, 0.7 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x, y - 3.5 * s);
  ctx.quadraticCurveTo(x + 0.5 * s, y - 6 * s, x + 2 * s, y - 7 * s);
  ctx.lineWidth = 1.6 * s;
  ctx.strokeStyle = darken(cap, 0.2);
  ctx.stroke();
}

/** Glossy water drop shape (path only). */
export function dropPath(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.moveTo(x, y - r * 1.95);
  ctx.bezierCurveTo(x + r * 0.35, y - r * 1.35, x + r, y - r * 0.85, x + r, y);
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y - r * 0.85, x - r * 0.35, y - r * 1.35, x, y - r * 1.95);
  ctx.closePath();
}

export function drop(ctx: Ctx, x: number, y: number, r: number, base = '#47b9f5'): void {
  ctx.beginPath();
  dropPath(ctx, x, y, r);
  const g = ctx.createLinearGradient(x - r, y - r * 2, x + r, y + r);
  g.addColorStop(0, lighten(base, 0.6));
  g.addColorStop(0.55, base);
  g.addColorStop(1, darken(base, 0.25));
  ctx.fillStyle = g;
  ctx.fill();
  rim(ctx, base, Math.max(1, r * 0.12));
  gloss(ctx, x - r * 0.38, y - r * 0.55, r * 0.22, r * 0.45, 0.35, 0.85);
}

/** Deterministic pseudo-random numbers for art details. */
export function artRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
