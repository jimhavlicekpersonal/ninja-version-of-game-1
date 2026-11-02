import Phaser from 'phaser';
import { TILE_H, TILE_W } from './iso';

/**
 * Placeholder art, drawn in code so the game runs with zero external assets.
 * Every sprite lives behind an asset key; to swap in real art, load an image
 * under the same key in a preload step and the generator will skip it.
 *
 * Art convention (also for real art): the building's footprint diamond spans
 * the full image width and touches the bottom edge of the image.
 */

/** Textures are drawn at 2x so they stay sharp on high-DPI phones and when zoomed in. */
export const TEX_SCALE = 2;

export const Keys = {
  ground: 'ground',
  building: (type: string, level: number) => `building.${type}.${level}`,
  buildingBase: (type: string) => `building.${type}`,
  construction: (size: number) => `construction.${size}`,
  bubble: (resource: string) => `bubble.${resource}`,
};

/** Pick the most specific texture that exists: per-level art, then per-type art. */
export function buildingTexture(textures: Phaser.Textures.TextureManager, type: string, level: number, size: number): string {
  if (level < 1) return Keys.construction(size);
  const specific = Keys.building(type, level);
  return textures.exists(specific) ? specific : Keys.buildingBase(type);
}

/** Origin that puts the footprint centre of a building image on its world position. */
export function buildingOrigin(texture: Phaser.Textures.Texture, size: number): { x: number; y: number } {
  const src = texture.getSourceImage() as { width: number; height: number };
  const scale = src.width / (size * TILE_W); // works for any art resolution
  const h = src.height / scale;
  return { x: 0.5, y: (h - (size * TILE_H) / 2) / h };
}

/** Display scale for a building image so its footprint matches the tile grid. */
export function buildingScale(texture: Phaser.Textures.Texture, size: number): number {
  const src = texture.getSourceImage() as { width: number };
  return (size * TILE_W) / src.width;
}

// ---------------------------------------------------------------------------
// Drawing helpers (logical units; (0,0) is the footprint centre)
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;
const INK = '#3b2a1c';

function canvasFor(scene: Phaser.Scene, key: string, w: number, h: number, originY: number): { ctx: Ctx; done: () => void } | null {
  if (scene.textures.exists(key)) return null; // real art (or an earlier run) already provided it
  const tex = scene.textures.createCanvas(key, Math.ceil(w * TEX_SCALE), Math.ceil(h * TEX_SCALE));
  if (!tex) return null;
  const ctx = tex.getContext();
  ctx.scale(TEX_SCALE, TEX_SCALE);
  ctx.translate(w / 2, originY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { ctx, done: () => tex.refresh() };
}

function diamond(ctx: Ctx, hw: number, hh: number, cy = 0): void {
  ctx.beginPath();
  ctx.moveTo(0, cy - hh);
  ctx.lineTo(hw, cy);
  ctx.lineTo(0, cy + hh);
  ctx.lineTo(-hw, cy);
  ctx.closePath();
}

function pad(ctx: Ctx, size: number, fill: string, edge: string): void {
  const hw = (size * TILE_W) / 2 - 4;
  const hh = (size * TILE_H) / 2 - 2;
  diamond(ctx, hw, hh);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

function shadow(ctx: Ctx, rx: number, ry: number, y = 4): void {
  ctx.beginPath();
  ctx.ellipse(0, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30, 20, 10, 0.22)';
  ctx.fill();
}

function outline(ctx: Ctx, width = 2.2): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** A friendly cartoon face. */
function face(ctx: Ctx, x: number, y: number, s: number, opts: { blush?: boolean } = {}): void {
  for (const dx of [-7 * s, 7 * s]) {
    ctx.beginPath();
    ctx.ellipse(x + dx, y, 2.6 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#20150c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + dx + 0.9 * s, y - 1.2 * s, 1 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y + 3 * s, 4 * s, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 1.6 * s;
  ctx.strokeStyle = '#20150c';
  ctx.stroke();
  if (opts.blush !== false) {
    ctx.fillStyle = 'rgba(255, 120, 130, 0.45)';
    for (const dx of [-12 * s, 12 * s]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y + 4 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function acornShape(ctx: Ctx, x: number, y: number, s: number, body = '#c98d48'): void {
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, 6 * s, 7.5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  outline(ctx, 1.2 * s);
  ctx.beginPath();
  ctx.ellipse(x, y - 3 * s, 7 * s, 4 * s, 0, Math.PI, 0);
  ctx.lineTo(x + 7 * s, y - 2 * s);
  ctx.lineTo(x - 7 * s, y - 2 * s);
  ctx.closePath();
  ctx.fillStyle = '#6e4524';
  ctx.fill();
  outline(ctx, 1.2 * s);
  ctx.beginPath();
  ctx.moveTo(x, y - 7 * s);
  ctx.lineTo(x + 1.5 * s, y - 10 * s);
  ctx.lineWidth = 1.5 * s;
  ctx.strokeStyle = '#6e4524';
  ctx.stroke();
}

function dropShape(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.9);
  ctx.bezierCurveTo(x + r * 0.4, y - r * 1.3, x + r, y - r * 0.8, x + r, y);
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y - r * 0.8, x - r * 0.4, y - r * 1.3, x, y - r * 1.9);
  ctx.closePath();
}

/** Upright cylinder with elliptical top and bottom. */
function cylinder(ctx: Ctx, rx: number, ry: number, bottom: number, top: number, fill: string | CanvasGradient): void {
  ctx.beginPath();
  ctx.moveTo(-rx, top);
  ctx.lineTo(-rx, bottom);
  ctx.ellipse(0, bottom, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(rx, top);
  ctx.ellipse(0, top, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  outline(ctx);
}

function hGradient(ctx: Ctx, x0: number, x1: number, a: string, b: string): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

type Painter = (ctx: Ctx, size: number) => void;

const painters: Record<string, { extra: number; paint: Painter }> = {
  elder_toadstool: {
    extra: 140,
    paint(ctx, size) {
      pad(ctx, size, '#d8b47a', '#9a7442');
      shadow(ctx, 100, 42, 10);
      // Stem
      ctx.beginPath();
      ctx.moveTo(-50, 22);
      ctx.bezierCurveTo(-46, -30, -44, -80, -40, -112);
      ctx.lineTo(40, -112);
      ctx.bezierCurveTo(44, -80, 46, -30, 50, 22);
      ctx.ellipse(0, 22, 50, 16, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = hGradient(ctx, -50, 50, '#fff6df', '#e2c99a');
      ctx.fill();
      outline(ctx);
      // Door
      ctx.beginPath();
      ctx.moveTo(-15, 30);
      ctx.lineTo(-15, 6);
      ctx.arc(0, 6, 15, Math.PI, 0);
      ctx.lineTo(15, 30);
      ctx.closePath();
      ctx.fillStyle = '#7d4c2a';
      ctx.fill();
      outline(ctx, 2);
      ctx.beginPath();
      ctx.arc(8, 16, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#f2c14e';
      ctx.fill();
      // Windows
      for (const wx of [-28, 28]) {
        ctx.beginPath();
        ctx.arc(wx, -28, 8.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd56e';
        ctx.fill();
        outline(ctx, 2);
      }
      face(ctx, 0, -70, 1.7);
      // Elder's moustache
      ctx.fillStyle = '#ffffff';
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -60);
        ctx.bezierCurveTo(dir * 10, -66, dir * 22, -62, dir * 24, -54);
        ctx.bezierCurveTo(dir * 18, -56, dir * 8, -54, 0, -56);
        ctx.closePath();
        ctx.fill();
        outline(ctx, 1.4);
      }
      // Cap underside (gills)
      ctx.beginPath();
      ctx.ellipse(0, -108, 124, 26, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f0d3a8';
      ctx.fill();
      outline(ctx);
      // Cap dome
      ctx.beginPath();
      ctx.moveTo(-126, -110);
      ctx.bezierCurveTo(-130, -205, 130, -205, 126, -110);
      ctx.ellipse(0, -110, 126, 22, 0, 0, Math.PI, false);
      ctx.closePath();
      const cap = ctx.createRadialGradient(-30, -170, 10, 0, -140, 150);
      cap.addColorStop(0, '#f2665a');
      cap.addColorStop(1, '#b52f28');
      ctx.fillStyle = cap;
      ctx.fill();
      outline(ctx, 2.6);
      ctx.fillStyle = '#fff8ef';
      for (const [x, y, r] of [[-62, -150, 15], [8, -172, 13], [62, -146, 17], [-14, -132, 9], [98, -122, 8], [-100, -124, 8], [34, -124, 7]]) {
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Sprout on top
      ctx.beginPath();
      ctx.moveTo(0, -180);
      ctx.quadraticCurveTo(2, -192, 0, -200);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#3f8a35';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(8, -200, 9, 5, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#6cc04a';
      ctx.fill();
      outline(ctx, 1.5);
    },
  },

  acorn_orchard: {
    extra: 125,
    paint(ctx, size) {
      pad(ctx, size, '#8dc85e', '#5f9a3c');
      ctx.beginPath();
      ctx.ellipse(0, 6, 40, 18, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#b58a55';
      ctx.fill();
      shadow(ctx, 70, 28, 8);
      // Trunk
      ctx.beginPath();
      ctx.moveTo(-16, 12);
      ctx.bezierCurveTo(-12, -10, -12, -40, -10, -64);
      ctx.lineTo(10, -64);
      ctx.bezierCurveTo(12, -40, 12, -10, 16, 12);
      ctx.quadraticCurveTo(0, 18, -16, 12);
      ctx.closePath();
      ctx.fillStyle = hGradient(ctx, -16, 16, '#9a6735', '#6f4521');
      ctx.fill();
      outline(ctx);
      // Canopy
      const blobs: [number, number, number][] = [[-38, -86, 36], [38, -86, 36], [0, -118, 42], [0, -78, 40]];
      ctx.beginPath();
      for (const [x, y, r] of blobs) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#4f9e3d';
      ctx.fill();
      for (const [x, y, r] of blobs) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        outline(ctx);
      }
      ctx.beginPath();
      for (const [x, y, r] of blobs) {
        ctx.moveTo(x + r - 2, y);
        ctx.arc(x, y, r - 2, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#58ad44';
      ctx.fill();
      ctx.fillStyle = 'rgba(190, 240, 140, 0.55)';
      for (const [x, y, r] of [[-44, -100, 12], [-6, -138, 14], [30, -104, 10]]) {
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.7, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      face(ctx, 0, -92, 1.35);
      for (const [x, y] of [[-56, -70], [52, -64], [-24, -136], [34, -128], [62, -96], [-64, -102]]) acornShape(ctx, x, y, 0.9);
      // Basket of acorns
      ctx.beginPath();
      ctx.moveTo(30, 10);
      ctx.lineTo(60, 10);
      ctx.lineTo(56, 26);
      ctx.lineTo(34, 26);
      ctx.closePath();
      ctx.fillStyle = '#c99a5b';
      ctx.fill();
      outline(ctx, 1.6);
      acornShape(ctx, 39, 5, 0.6);
      acornShape(ctx, 51, 4, 0.6);
    },
  },

  dewdrop_well: {
    extra: 155,
    paint(ctx, size) {
      pad(ctx, size, '#b9c4b0', '#7f8c78');
      shadow(ctx, 66, 28, 8);
      // Stone ring
      cylinder(ctx, 50, 22, 4, -26, hGradient(ctx, -50, 50, '#c1c8cc', '#8b959b'));
      ctx.strokeStyle = 'rgba(59, 42, 28, 0.35)';
      ctx.lineWidth = 1.4;
      for (const [x, y] of [[-30, -14], [0, -8], [30, -14], [-15, 0], [15, 0], [-42, -2], [42, -2]]) {
        ctx.beginPath();
        ctx.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, -26, 42, 17, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4fb7ea';
      ctx.fill();
      outline(ctx, 1.6);
      ctx.beginPath();
      ctx.ellipse(-10, -29, 14, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      // Posts and roof
      for (const px of [-46, 40]) {
        ctx.beginPath();
        ctx.rect(px, -92, 7, 70);
        ctx.fillStyle = '#8a5a30';
        ctx.fill();
        outline(ctx, 1.8);
      }
      ctx.beginPath();
      ctx.moveTo(-62, -86);
      ctx.lineTo(0, -122);
      ctx.lineTo(62, -86);
      ctx.lineTo(54, -80);
      ctx.lineTo(0, -110);
      ctx.lineTo(-54, -80);
      ctx.closePath();
      ctx.fillStyle = '#c4553b';
      ctx.fill();
      outline(ctx);
      // Rope and bucket
      ctx.beginPath();
      ctx.moveTo(0, -110);
      ctx.lineTo(0, -58);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#6b4a2b';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, -58);
      ctx.lineTo(8, -58);
      ctx.lineTo(6, -46);
      ctx.lineTo(-6, -46);
      ctx.closePath();
      ctx.fillStyle = '#a77441';
      ctx.fill();
      outline(ctx, 1.4);
      // The dewdrop mascot
      dropShape(ctx, 0, -146, 26);
      const g = ctx.createLinearGradient(0, -196, 0, -120);
      g.addColorStop(0, '#d4f4ff');
      g.addColorStop(1, '#46aee6');
      ctx.fillStyle = g;
      ctx.fill();
      outline(ctx, 2.2);
      ctx.beginPath();
      ctx.ellipse(-11, -160, 5, 9, 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
      face(ctx, 1, -146, 1.1);
    },
  },

  acorn_silo: {
    extra: 115,
    paint(ctx, size) {
      pad(ctx, size, '#d2ae78', '#9a7442');
      shadow(ctx, 64, 26, 10);
      cylinder(ctx, 48, 20, 8, -94, hGradient(ctx, -48, 48, '#d39552', '#93592b'));
      ctx.strokeStyle = 'rgba(59, 42, 28, 0.35)';
      ctx.lineWidth = 1.4;
      for (const x of [-32, -16, 0, 16, 32]) {
        ctx.beginPath();
        ctx.moveTo(x, -94 + 20 * Math.sqrt(1 - (x / 48) ** 2));
        ctx.lineTo(x, 8 + 20 * Math.sqrt(1 - (x / 48) ** 2));
        ctx.stroke();
      }
      for (const by of [-12, -72]) {
        ctx.beginPath();
        ctx.ellipse(0, by, 48, 20, 0, 0, Math.PI);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#5b3a1e';
        ctx.stroke();
      }
      // Roof
      ctx.beginPath();
      ctx.moveTo(-56, -92);
      ctx.lineTo(0, -150);
      ctx.lineTo(56, -92);
      ctx.ellipse(0, -92, 56, 18, 0, 0, Math.PI, false);
      ctx.closePath();
      ctx.fillStyle = hGradient(ctx, -56, 56, '#8e5730', '#5f381b');
      ctx.fill();
      outline(ctx);
      // Acorn emblem with a face
      acornShape(ctx, 0, -42, 2.4, '#e2a965');
      face(ctx, 0, -36, 0.75, { blush: false });
    },
  },

  dew_cistern: {
    extra: 95,
    paint(ctx, size) {
      pad(ctx, size, '#b9c4b0', '#7f8c78');
      shadow(ctx, 60, 26, 10);
      const jar = () => {
        ctx.beginPath();
        ctx.moveTo(-46, 6);
        ctx.lineTo(-46, -70);
        ctx.bezierCurveTo(-46, -92, -24, -94, -24, -104);
        ctx.lineTo(-24, -112);
        ctx.lineTo(24, -112);
        ctx.lineTo(24, -104);
        ctx.bezierCurveTo(24, -94, 46, -92, 46, -70);
        ctx.lineTo(46, 6);
        ctx.ellipse(0, 6, 46, 18, 0, 0, Math.PI);
        ctx.closePath();
      };
      jar();
      ctx.fillStyle = 'rgba(214, 240, 255, 0.85)';
      ctx.fill();
      // Water inside
      ctx.save();
      jar();
      ctx.clip();
      ctx.beginPath();
      ctx.rect(-50, -48, 100, 80);
      ctx.fillStyle = '#4db2e6';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -48, 46, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7fd0f5';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const [x, y, r] of [[20, -20, 4], [28, -6, 2.5], [-24, 0, 3]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      jar();
      outline(ctx, 2.4);
      // Shine
      ctx.beginPath();
      ctx.moveTo(-36, -64);
      ctx.quadraticCurveTo(-40, -30, -36, -4);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.stroke();
      // Cork
      ctx.beginPath();
      ctx.rect(-20, -128, 40, 18);
      ctx.fillStyle = '#d8b07a';
      ctx.fill();
      outline(ctx, 2);
      ctx.beginPath();
      ctx.ellipse(0, -128, 20, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e8c690';
      ctx.fill();
      outline(ctx, 2);
      face(ctx, 0, -26, 1.2);
    },
  },

  beaver_lodge: {
    extra: 45,
    paint(ctx, size) {
      pad(ctx, size, '#78c4e2', '#4a93b3');
      ctx.beginPath();
      ctx.ellipse(-22, 10, 10, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(28, 16, 8, 2.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      // Dome of sticks
      ctx.beginPath();
      ctx.moveTo(-50, 8);
      ctx.bezierCurveTo(-52, -72, 52, -72, 50, 8);
      ctx.ellipse(0, 8, 50, 14, 0, 0, Math.PI, false);
      ctx.closePath();
      ctx.fillStyle = hGradient(ctx, -50, 50, '#9b6a3c', '#6c4421');
      ctx.fill();
      outline(ctx);
      ctx.strokeStyle = '#4d2f15';
      ctx.lineWidth = 2;
      for (const [x1, y1, x2, y2] of [[-40, -6, -8, -30], [-30, -34, 10, -50], [4, -20, 40, -8], [16, -44, 44, -22], [-44, 4, -14, -6], [10, 2, 42, 2], [-20, -50, 20, -34]]) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // Door and beaver
      ctx.beginPath();
      ctx.moveTo(-16, 16);
      ctx.lineTo(-16, 0);
      ctx.arc(0, 0, 16, Math.PI, 0);
      ctx.lineTo(16, 16);
      ctx.closePath();
      ctx.fillStyle = '#2b1a0e';
      ctx.fill();
      for (const ex of [-9, 9]) {
        ctx.beginPath();
        ctx.arc(ex, -13, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#8f5a28';
        ctx.fill();
        outline(ctx, 1.4);
      }
      ctx.beginPath();
      ctx.arc(0, -2, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#a8703a';
      ctx.fill();
      outline(ctx, 1.6);
      ctx.beginPath();
      ctx.ellipse(0, 3, 7, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#d9b48a';
      ctx.fill();
      for (const ex of [-4.5, 4.5]) {
        ctx.beginPath();
        ctx.arc(ex, -5, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = '#20150c';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#3a2213';
      ctx.fill();
      ctx.beginPath();
      ctx.rect(-3, 4, 6, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#20150c';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(0, 9);
      ctx.stroke();
    },
  },
};

function paintGeneric(ctx: Ctx, size: number): void {
  pad(ctx, size, '#d0c0a0', '#8a7a5a');
  cylinder(ctx, size * 14, size * 6, 0, -size * 20, '#c0a070');
  face(ctx, 0, -size * 10, 1);
}

function paintConstruction(ctx: Ctx, size: number): void {
  pad(ctx, size, '#c9a36b', '#8f6c3d');
  const hw = (size * TILE_W) / 2 - 14;
  const hh = (size * TILE_H) / 2 - 7;
  const postH = 18 + size * 8;
  const corners: [number, number][] = [[0, -hh], [hw, 0], [0, hh], [-hw, 0]];
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#a06d3b';
  // Back posts first, then beams, then front posts.
  for (const i of [0, 1, 3]) {
    const [x, y] = corners[i];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - postH);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const [x, y] = corners[i];
    const [nx, ny] = corners[(i + 1) % 4];
    ctx.moveTo(x, y - postH);
    ctx.lineTo(nx, ny - postH);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(corners[2][0], corners[2][1]);
  ctx.lineTo(corners[2][0], corners[2][1] - postH);
  ctx.stroke();
  // Planks pile
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.rect(-18 + i * 3, 4 - i * 5, 30, 5);
    ctx.fillStyle = i % 2 ? '#c88f52' : '#b57d42';
    ctx.fill();
    outline(ctx, 1.2);
  }
  // Sign with a hammer
  ctx.beginPath();
  ctx.rect(hw * 0.35, -10, 22, 16);
  ctx.fillStyle = '#f1d9a6';
  ctx.fill();
  outline(ctx, 1.5);
  ctx.beginPath();
  ctx.moveTo(hw * 0.35 + 6, 2);
  ctx.lineTo(hw * 0.35 + 15, -6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#7a4b2a';
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(hw * 0.35 + 12, -9, 7, 4);
  ctx.fillStyle = '#7d8a94';
  ctx.fill();
}

function paintBubble(ctx: Ctx, resource: string): void {
  ctx.beginPath();
  ctx.moveTo(-6, 14);
  ctx.lineTo(0, 24);
  ctx.lineTo(6, 14);
  ctx.closePath();
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  outline(ctx, 2);
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  outline(ctx, 2.4);
  if (resource === 'dew') {
    dropShape(ctx, 0, 4, 8);
    ctx.fillStyle = '#4cb2e8';
    ctx.fill();
    outline(ctx, 1.4);
  } else {
    acornShape(ctx, 0, 1, 1.25);
  }
}

function paintGround(scene: Phaser.Scene, mapSize: number): void {
  if (scene.textures.exists(Keys.ground)) return;
  const w = mapSize * TILE_W;
  const h = mapSize * TILE_H;
  const tex = scene.textures.createCanvas(Keys.ground, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.translate(w / 2, 0);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  for (let ty = 0; ty < mapSize; ty++) {
    for (let tx = 0; tx < mapSize; tx++) {
      const x = (tx - ty) * hw;
      const y = (tx + ty) * hh;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + hw, y + hh);
      ctx.lineTo(x, y + TILE_H);
      ctx.lineTo(x - hw, y + hh);
      ctx.closePath();
      ctx.fillStyle = (tx + ty) % 2 === 0 ? '#86c45a' : '#7dbb52';
      ctx.fill();
    }
  }
  // Deterministic flowers and grass tufts (no Math.random so it looks the same every time).
  let seed = 1234567;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const flowerColors = ['#ffffff', '#ffe066', '#ff9fb3', '#c7a6ff'];
  for (let i = 0; i < 420; i++) {
    const tx = rand() * mapSize;
    const ty = rand() * mapSize;
    const x = (tx - ty) * hw;
    const y = (tx + ty) * hh;
    if (rand() < 0.45) {
      ctx.fillStyle = flowerColors[Math.floor(rand() * flowerColors.length)];
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(60, 120, 40, 0.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x - 4, y - 5);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 6);
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 4, y - 5);
      ctx.stroke();
    }
  }
  // Map edge
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(0, h);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#4f8a34';
  ctx.stroke();
  tex.refresh();
}

/** Create every placeholder texture that real art has not already provided. */
export function generatePlaceholders(scene: Phaser.Scene, buildingTypes: { type: string; size: number }[], mapSize: number): void {
  paintGround(scene, mapSize);
  for (const { type, size } of buildingTypes) {
    const p = painters[type] ?? { extra: size * 20, paint: paintGeneric };
    const w = size * TILE_W;
    const h = size * TILE_H + p.extra;
    const c = canvasFor(scene, Keys.buildingBase(type), w, h, h - (size * TILE_H) / 2);
    if (c) {
      p.paint(c.ctx, size);
      c.done();
    }
  }
  for (const size of [2, 3, 4]) {
    const extra = 24 + size * 8;
    const w = size * TILE_W;
    const h = size * TILE_H + extra;
    const c = canvasFor(scene, Keys.construction(size), w, h, h - (size * TILE_H) / 2);
    if (c) {
      paintConstruction(c.ctx, size);
      c.done();
    }
  }
  for (const r of ['acorns', 'dew']) {
    const c = canvasFor(scene, Keys.bubble(r), 44, 52, 22);
    if (c) {
      paintBubble(c.ctx, r === 'acorns' ? 'acorn' : r);
      c.done();
    }
  }
}
