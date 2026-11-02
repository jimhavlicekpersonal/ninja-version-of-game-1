import { TILE_H, TILE_W } from '../render/iso';
import {
  acorn,
  blob,
  cylinder,
  darken,
  drop,
  dropPath,
  ellipsePath,
  face,
  gloss,
  lighten,
  occlude,
  rgba,
  rim,
  roundRectPath,
  shade,
  shadeRound,
  softDiamondPath,
  softShadow,
  type Ctx,
} from './toolkit';

export type Painter = (ctx: Ctx, size: number) => void;
export interface PainterDef {
  /** Pixels of art above the footprint diamond. */
  extra: number;
  paint: Painter;
}

/** Rounded footprint plate under a building. */
export function plate(ctx: Ctx, size: number, color: string, inset = 4): void {
  const hw = (size * TILE_W) / 2 - inset;
  const hh = (size * TILE_H) / 2 - inset / 2;
  ctx.beginPath();
  softDiamondPath(ctx, hw, hh);
  shade(ctx, { x: -hw, y: -hh, w: hw * 2, h: hh * 2 }, color, 0.22, 0.14);
  rim(ctx, color, 1.4);
  ctx.beginPath();
  softDiamondPath(ctx, hw - 7, hh - 3.5);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.stroke();
}

const WOOD = '#c98450';

// ---------------------------------------------------------------- Elder Toadstool
export function elderToadstoolSkin(capColor: string, spotColor: string): PainterDef {
  return { extra: 145, paint: (ctx, size) => paintElder(ctx, size, capColor, spotColor) };
}

const elderToadstool: PainterDef = elderToadstoolSkin('#ff5a4f', '#fffaf2');

function paintElder(ctx: Ctx, size: number, capColor: string, spotColor: string): void {
  {
    plate(ctx, size, '#f3d9a4');
    softShadow(ctx, 112, 50, 10, 0.32);
    // Stem
    const stem = () => {
      ctx.moveTo(-50, 22);
      ctx.bezierCurveTo(-48, -24, -46, -80, -40, -112);
      ctx.lineTo(40, -112);
      ctx.bezierCurveTo(46, -80, 48, -24, 50, 22);
      ctx.ellipse(0, 22, 50, 16, 0, 0, Math.PI);
      ctx.closePath();
    };
    ctx.beginPath();
    stem();
    shadeRound(ctx, -50, 50, '#fff0d4');
    rim(ctx, '#f0d5a6', 1.8);
    occlude(ctx, stem, -20, 40, 0.2);
    // Door with a round window
    blob(ctx, { x: -16, y: -12, w: 32, h: 44 }, '#c0703d', () => {
      ctx.moveTo(-16, 32);
      ctx.lineTo(-16, 6);
      ctx.arc(0, 6, 16, Math.PI, 0);
      ctx.lineTo(16, 32);
      ctx.quadraticCurveTo(0, 36, -16, 32);
      ctx.closePath();
    });
    ctx.beginPath();
    ellipsePath(ctx, 0, 6, 5.5, 5.5);
    ctx.fillStyle = '#ffe58a';
    ctx.fill();
    rim(ctx, '#c0703d', 1.2);
    ctx.beginPath();
    ellipsePath(ctx, 9, 20, 2.2, 2.2);
    ctx.fillStyle = '#ffd34d';
    ctx.fill();
    // Glowing windows
    for (const wx of [-29, 29]) {
      ctx.beginPath();
      ellipsePath(ctx, wx, -30, 8.5, 9);
      const wg = ctx.createRadialGradient(wx - 2, -32, 1, wx, -30, 10);
      wg.addColorStop(0, '#fffbe0');
      wg.addColorStop(1, '#ffc34a');
      ctx.fillStyle = wg;
      ctx.fill();
      rim(ctx, '#e0a050', 2);
    }
    face(ctx, 0, -72, 1.75);
    // Fluffy moustache
    for (const dir of [-1, 1]) {
      blob(ctx, { x: dir < 0 ? -26 : 0, y: -66, w: 26, h: 14 }, '#ffffff', () => {
        ctx.moveTo(0, -61);
        ctx.bezierCurveTo(dir * 10, -68, dir * 24, -64, dir * 26, -55);
        ctx.bezierCurveTo(dir * 19, -57, dir * 9, -55, 0, -57);
        ctx.closePath();
      }, { line: 1.2, dark: 0.1 });
    }
    // Cap underside with gills
    ctx.beginPath();
    ellipsePath(ctx, 0, -108, 124, 27);
    shade(ctx, { x: -124, y: -135, w: 248, h: 54 }, '#ffe0bb', 0.2, 0.18);
    rim(ctx, '#f0c08a', 1.6);
    ctx.strokeStyle = rgba('#d89a62', 0.45);
    ctx.lineWidth = 1.2;
    for (let i = -10; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 0.48;
      ctx.beginPath();
      ctx.moveTo(Math.sin(a) * 30, -101);
      ctx.lineTo(Math.sin(a) * 118, -101 + Math.cos(a) * 18);
      ctx.stroke();
    }
    // Cap dome
    const cap = () => {
      ctx.moveTo(-128, -110);
      ctx.bezierCurveTo(-134, -212, 134, -212, 128, -110);
      ctx.bezierCurveTo(90, -96, -90, -96, -128, -110);
      ctx.closePath();
    };
    blob(ctx, { x: -128, y: -190, w: 256, h: 96 }, capColor, cap, { light: 0.35, dark: 0.3, line: 2.2 });
    // Spots follow the dome curve
    for (const [x, y, r] of [[-64, -150, 16], [6, -175, 14], [62, -148, 18], [-16, -130, 10], [100, -124, 8], [-104, -126, 8.5], [34, -122, 7]] as const) {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.78, x * 0.003, 0, Math.PI * 2);
      shade(ctx, { x: x - r, y: y - r, w: r * 2, h: r * 2 }, spotColor, 0.2, 0.1);
    }
    gloss(ctx, -58, -176, 38, 14, -0.35, 0.55);
    // Sprout on top
    ctx.beginPath();
    ctx.moveTo(0, -182);
    ctx.quadraticCurveTo(2, -194, -1, -203);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#4fa63a';
    ctx.stroke();
    blob(ctx, { x: 0, y: -210, w: 20, h: 12 }, '#7fd85a', () => ctx.ellipse(9, -203, 10, 5.5, -0.5, 0, Math.PI * 2), { line: 1.3 });
    blob(ctx, { x: -16, y: -206, w: 14, h: 9 }, '#7fd85a', () => ctx.ellipse(-8, -200, 7, 4, 0.5, 0, Math.PI * 2), { line: 1.3 });
  }
}

// ---------------------------------------------------------------- Acorn Orchard
const acornOrchard: PainterDef = {
  extra: 130,
  paint(ctx, size) {
    plate(ctx, size, '#a9e57a');
    ctx.beginPath();
    ellipsePath(ctx, 0, 6, 42, 19);
    shade(ctx, { x: -42, y: -13, w: 84, h: 38 }, '#d7a873', 0.2, 0.15);
    softShadow(ctx, 76, 32, 8, 0.3);
    // Trunk
    const trunk = () => {
      ctx.moveTo(-17, 12);
      ctx.bezierCurveTo(-12, -10, -13, -42, -10, -66);
      ctx.lineTo(10, -66);
      ctx.bezierCurveTo(13, -42, 12, -10, 17, 12);
      ctx.quadraticCurveTo(24, 18, 0, 17);
      ctx.quadraticCurveTo(-24, 18, -17, 12);
      ctx.closePath();
    };
    ctx.beginPath();
    trunk();
    shadeRound(ctx, -17, 17, '#b0703f');
    rim(ctx, '#b0703f', 1.8);
    // Canopy puffs
    const puffs: [number, number, number][] = [[-40, -86, 34], [40, -86, 34], [0, -120, 42], [-22, -108, 32], [22, -108, 32], [0, -80, 38]];
    for (const [x, y, r] of puffs) {
      blob(ctx, { x: x - r, y: y - r, w: r * 2, h: r * 2 }, '#5fc84a', () => ellipsePath(ctx, x, y, r, r * 0.95), { light: 0.38, dark: 0.22, line: 1.8 });
    }
    for (const [x, y, r] of [[-46, -98, 12], [-8, -142, 15], [28, -122, 11], [52, -98, 8]] as const) gloss(ctx, x, y, r, r * 0.6, -0.4, 0.45);
    face(ctx, 0, -94, 1.35);
    for (const [x, y] of [[-58, -72], [55, -66], [-26, -140], [36, -134], [64, -100], [-66, -104]]) acorn(ctx, x, y, 0.85);
    // Basket of acorns
    blob(ctx, { x: 30, y: 8, w: 32, h: 20 }, '#e2b06d', () => {
      ctx.moveTo(28, 10);
      ctx.lineTo(62, 10);
      ctx.quadraticCurveTo(60, 28, 45, 28);
      ctx.quadraticCurveTo(30, 28, 28, 10);
      ctx.closePath();
    }, { line: 1.4 });
    acorn(ctx, 39, 4, 0.55);
    acorn(ctx, 51, 3, 0.55);
  },
};

// ---------------------------------------------------------------- Dewdrop Well
const dewdropWell: PainterDef = {
  extra: 160,
  paint(ctx, size) {
    plate(ctx, size, '#d8dcef');
    softShadow(ctx, 70, 30, 8, 0.3);
    cylinder(ctx, 50, 22, 4, -26, '#c7c4dc', '#b8b4d0');
    // Stone bumps
    for (const [x, y] of [[-34, -10], [-2, -4], [30, -10], [-18, 4], [14, 4], [-44, 0], [44, 0]]) {
      ctx.beginPath();
      roundRectPath(ctx, x - 9, y - 5, 18, 10, 5);
      ctx.strokeStyle = rgba('#7a7598', 0.35);
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    ctx.beginPath();
    ellipsePath(ctx, 0, -26, 42, 17);
    const wg = ctx.createLinearGradient(0, -43, 0, -9);
    wg.addColorStop(0, '#9cecff');
    wg.addColorStop(1, '#3fb3ef');
    ctx.fillStyle = wg;
    ctx.fill();
    rim(ctx, '#3fb3ef', 1.4);
    gloss(ctx, -12, -30, 16, 4, 0, 0.8);
    // Posts and scalloped roof
    for (const px of [-46, 39]) {
      blob(ctx, { x: px, y: -94, w: 8, h: 72 }, WOOD, () => roundRectPath(ctx, px, -94, 8, 72, 3), { line: 1.4 });
    }
    const roof = () => {
      ctx.moveTo(-64, -84);
      ctx.quadraticCurveTo(-30, -112, 0, -124);
      ctx.quadraticCurveTo(30, -112, 64, -84);
      for (let i = 0; i <= 8; i++) {
        const x = 64 - i * 16;
        ctx.quadraticCurveTo(x - 8, -74, x - 16, -84);
      }
      ctx.closePath();
    };
    blob(ctx, { x: -64, y: -124, w: 128, h: 50 }, '#ff7d5c', roof, { line: 1.8 });
    gloss(ctx, -26, -104, 18, 5, -0.35, 0.5);
    // Rope and bucket
    ctx.beginPath();
    ctx.moveTo(0, -112);
    ctx.lineTo(0, -60);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#9b7348';
    ctx.stroke();
    blob(ctx, { x: -8, y: -60, w: 16, h: 13 }, '#d39a5e', () => {
      ctx.moveTo(-8, -60);
      ctx.lineTo(8, -60);
      ctx.lineTo(6, -47);
      ctx.lineTo(-6, -47);
      ctx.closePath();
    }, { line: 1.2 });
    // The dewdrop mascot
    drop(ctx, 0, -150, 26, '#43b6f3');
    face(ctx, 1, -150, 1.1);
  },
};

// ---------------------------------------------------------------- Acorn Silo
const acornSilo: PainterDef = {
  extra: 120,
  paint(ctx, size) {
    plate(ctx, size, '#f0d39d');
    softShadow(ctx, 66, 28, 10, 0.3);
    cylinder(ctx, 48, 20, 8, -94, '#eaa863', '#f3c17f');
    ctx.strokeStyle = rgba('#a8642e', 0.3);
    ctx.lineWidth = 1.3;
    for (const x of [-32, -16, 0, 16, 32]) {
      const dy = 20 * Math.sqrt(1 - (x / 48) ** 2);
      ctx.beginPath();
      ctx.moveTo(x, -94 + dy);
      ctx.lineTo(x, 8 + dy);
      ctx.stroke();
    }
    for (const by of [-14, -72]) {
      ctx.beginPath();
      ctx.ellipse(0, by, 48, 20, 0, 0, Math.PI);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#9a6238';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, by - 1.5, 48, 20, 0, 0.15 * Math.PI, 0.5 * Math.PI);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba('#ffffff', 0.4);
      ctx.stroke();
    }
    // Roof cone with a knob
    const roof = () => {
      ctx.moveTo(-58, -92);
      ctx.quadraticCurveTo(-20, -120, 0, -148);
      ctx.quadraticCurveTo(20, -120, 58, -92);
      ctx.ellipse(0, -92, 58, 19, 0, 0, Math.PI, false);
      ctx.closePath();
    };
    ctx.beginPath();
    roof();
    shadeRound(ctx, -58, 58, '#b9673a');
    rim(ctx, '#b9673a', 1.8);
    blob(ctx, { x: -7, y: -156, w: 14, h: 14 }, '#ffcf52', () => ellipsePath(ctx, 0, -150, 7, 7), { line: 1.3 });
    gloss(ctx, -2.5, -152, 2.5, 2, 0, 0.8);
    acorn(ctx, 0, -50, 2.3);
    face(ctx, 0, -32, 0.85, { blush: true });
  },
};

// ---------------------------------------------------------------- Dew Cistern
const dewCistern: PainterDef = {
  extra: 100,
  paint(ctx, size) {
    plate(ctx, size, '#d8dcef');
    softShadow(ctx, 62, 27, 10, 0.3);
    const jar = () => {
      ctx.moveTo(-46, 6);
      ctx.lineTo(-46, -66);
      ctx.bezierCurveTo(-46, -92, -24, -94, -24, -104);
      ctx.lineTo(-24, -112);
      ctx.lineTo(24, -112);
      ctx.lineTo(24, -104);
      ctx.bezierCurveTo(24, -94, 46, -92, 46, -66);
      ctx.lineTo(46, 6);
      ctx.ellipse(0, 6, 46, 18, 0, 0, Math.PI);
      ctx.closePath();
    };
    ctx.beginPath();
    jar();
    ctx.fillStyle = 'rgba(225, 245, 255, 0.92)';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    jar();
    ctx.clip();
    const water = ctx.createLinearGradient(0, -50, 0, 26);
    water.addColorStop(0, '#6fd6ff');
    water.addColorStop(1, '#2c8fe6');
    ctx.fillStyle = water;
    ctx.fillRect(-50, -50, 100, 80);
    ctx.beginPath();
    ellipsePath(ctx, 0, -50, 46, 14);
    ctx.fillStyle = '#a8ebff';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [x, y, r] of [[22, -22, 4], [30, -6, 2.5], [-26, 2, 3], [12, 6, 2]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    jar();
    rim(ctx, '#7fb6e0', 2.2);
    // Glass shine
    ctx.beginPath();
    ctx.moveTo(-35, -66);
    ctx.quadraticCurveTo(-40, -30, -35, -2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-26, -84);
    ctx.quadraticCurveTo(-22, -90, -16, -92);
    ctx.lineWidth = 3;
    ctx.stroke();
    // Cork
    blob(ctx, { x: -20, y: -130, w: 40, h: 20 }, '#e3b27a', () => roundRectPath(ctx, -20, -128, 40, 18, 5), { line: 1.6 });
    blob(ctx, { x: -20, y: -134, w: 40, h: 12 }, '#f0c690', () => ellipsePath(ctx, 0, -128, 20, 6), { line: 1.6 });
    face(ctx, 0, -24, 1.25);
  },
};

// ---------------------------------------------------------------- Beaver Lodge
const beaverLodge: PainterDef = {
  extra: 50,
  paint(ctx, size) {
    const hw = (size * TILE_W) / 2 - 5;
    const hh = (size * TILE_H) / 2 - 2.5;
    ctx.beginPath();
    softDiamondPath(ctx, hw, hh, 0, 0.3);
    const pg = ctx.createLinearGradient(0, -hh, 0, hh);
    pg.addColorStop(0, '#9be8ff');
    pg.addColorStop(1, '#4cc0ec');
    ctx.fillStyle = pg;
    ctx.fill();
    rim(ctx, '#4cc0ec', 1.4);
    gloss(ctx, -26, 6, 10, 3, 0, 0.8);
    gloss(ctx, 30, 14, 7, 2, 0, 0.7);
    // Lily pad
    blob(ctx, { x: 36, y: -6, w: 18, h: 10 }, '#6fd352', () => {
      ctx.moveTo(45, -1);
      ctx.ellipse(45, -1, 9, 5, 0, 0.3, Math.PI * 2 - 0.3);
      ctx.closePath();
    }, { line: 1 });
    softShadow(ctx, 50, 14, 8, 0.25);
    // Dome of sticks
    const dome = () => {
      ctx.moveTo(-50, 8);
      ctx.bezierCurveTo(-52, -74, 52, -74, 50, 8);
      ctx.bezierCurveTo(30, 16, -30, 16, -50, 8);
      ctx.closePath();
    };
    blob(ctx, { x: -50, y: -60, w: 100, h: 72 }, '#bd8550', dome, { light: 0.3, dark: 0.28, line: 1.8 });
    ctx.lineCap = 'round';
    for (const [x1, y1, x2, y2, c] of [
      [-40, -6, -8, -30, '#8f5a2e'], [-30, -36, 10, -52, '#e0a96c'], [4, -20, 40, -8, '#8f5a2e'], [16, -46, 44, -22, '#e0a96c'],
      [-44, 4, -14, -4, '#e0a96c'], [12, 2, 42, 2, '#8f5a2e'], [-22, -50, 20, -36, '#8f5a2e'],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = c;
      ctx.stroke();
    }
    gloss(ctx, -20, -42, 14, 6, -0.4, 0.35);
    // Doorway and beaver
    ctx.beginPath();
    ctx.moveTo(-17, 15);
    ctx.lineTo(-17, 0);
    ctx.arc(0, 0, 17, Math.PI, 0);
    ctx.lineTo(17, 15);
    ctx.closePath();
    ctx.fillStyle = '#4a2a1a';
    ctx.fill();
    for (const ex of [-9, 9]) blob(ctx, { x: ex - 4, y: -18, w: 8, h: 8 }, '#a8703a', () => ellipsePath(ctx, ex, -14, 4, 4), { line: 1.2 });
    blob(ctx, { x: -13, y: -15, w: 26, h: 26 }, '#c4874a', () => ellipsePath(ctx, 0, -2, 13, 12.5), { line: 1.4 });
    blob(ctx, { x: -8, y: -2, w: 16, h: 11 }, '#f3d6b0', () => ellipsePath(ctx, 0, 3.5, 8, 5.5), { line: 1 });
    face(ctx, 0, -5, 0.62, { blush: true });
    ctx.beginPath();
    ellipsePath(ctx, 0, 0.5, 2.6, 2);
    ctx.fillStyle = '#4a2a1a';
    ctx.fill();
    ctx.beginPath();
    roundRectPath(ctx, -3, 5, 6, 5, 1.2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#8a6a5a';
    ctx.stroke();
  },
};

// ---------------------------------------------------------------- Decorations
const flowerBed: PainterDef = {
  extra: 18,
  paint(ctx) {
    blob(ctx, { x: -24, y: -10, w: 48, h: 22 }, '#b98a5a', () => softDiamondPath(ctx, 26, 13, 0, 0.35), { line: 1.2 });
    const cols = ['#ff7aa8', '#ffd23f', '#b48cff', '#ffffff', '#ff9a5c'];
    for (let i = 0; i < 7; i++) {
      const x = -14 + (i % 4) * 9 + (i > 3 ? 4 : 0);
      const y = -6 + (i > 3 ? 6 : 0);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 2.6, y - 4 + Math.sin(a) * 2, 2.2, 1.6, a, 0, Math.PI * 2);
        ctx.fillStyle = cols[i % cols.length];
        ctx.fill();
      }
      ctx.beginPath();
      ellipsePath(ctx, x, y - 4, 1.3, 1.3);
      ctx.fillStyle = '#ffb100';
      ctx.fill();
    }
  },
};

const lanternPost: PainterDef = {
  extra: 60,
  paint(ctx) {
    softShadow(ctx, 14, 6, 2, 0.3);
    blob(ctx, { x: -3, y: -60, w: 6, h: 62 }, '#6f5a8f', () => roundRectPath(ctx, -3, -58, 6, 60, 3), { line: 1 });
    const glow = ctx.createRadialGradient(0, -62, 1, 0, -62, 22);
    glow.addColorStop(0, 'rgba(255,240,160,0.9)');
    glow.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -62, 22, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, { x: -9, y: -72, w: 18, h: 20 }, '#fff3b0', () => roundRectPath(ctx, -8, -72, 16, 18, 6), { light: 0.5, line: 1.2 });
    blob(ctx, { x: -11, y: -78, w: 22, h: 8 }, '#6f5a8f', () => {
      ctx.moveTo(-11, -72);
      ctx.quadraticCurveTo(0, -82, 11, -72);
      ctx.closePath();
    }, { line: 1 });
  },
};

const mushroomRing: PainterDef = {
  extra: 26,
  paint(ctx) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120, 200, 90, 0.35)';
    ctx.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const x = Math.cos(a) * 36;
      const y = Math.sin(a) * 17;
      blob(ctx, { x: x - 3, y: y - 10, w: 6, h: 10 }, '#fff3dc', () => roundRectPath(ctx, x - 2.5, y - 9, 5, 9, 2), { line: 0.8 });
      const capCol = i % 3 === 0 ? '#ff5a4f' : i % 3 === 1 ? '#ffc93d' : '#b48cff';
      blob(ctx, { x: x - 7, y: y - 16, w: 14, h: 8 }, capCol, () => {
        ctx.moveTo(x - 7, y - 9);
        ctx.bezierCurveTo(x - 7, y - 17, x + 7, y - 17, x + 7, y - 9);
        ctx.closePath();
      }, { line: 0.9 });
    }
  },
};

const mossyStatue: PainterDef = {
  extra: 90,
  paint(ctx, size) {
    plate(ctx, size, '#d8dcef');
    softShadow(ctx, 34, 14, 4, 0.3);
    cylinder(ctx, 26, 11, 2, -18, '#c7c4dc', '#dedbf0');
    // A frog statue, stone grey with moss
    blob(ctx, { x: -22, y: -70, w: 44, h: 50 }, '#b8b4cc', () => ctx.ellipse(0, -44, 22, 26, 0, 0, Math.PI * 2), { light: 0.35, line: 1.6 });
    for (const x of [-11, 11]) {
      blob(ctx, { x: x - 8, y: -84, w: 16, h: 16 }, '#b8b4cc', () => ellipsePath(ctx, x, -76, 8, 8), { line: 1.3 });
      ctx.beginPath();
      ellipsePath(ctx, x, -76, 4, 4);
      ctx.fillStyle = '#8a86a6';
      ctx.fill();
    }
    ctx.fillStyle = rgba('#6fcf52', 0.8);
    for (const [x, y, r] of [[-16, -30, 7], [10, -60, 6], [14, -28, 5], [-6, -52, 4]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, -40, 9, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#6f6a8a';
    ctx.stroke();
  },
};

// ---------------------------------------------------------------- Forest obstacles
const obstacleBush: PainterDef = {
  extra: 24,
  paint(ctx) {
    softShadow(ctx, 22, 9, 2, 0.28);
    for (const [x, y, r] of [[-10, -8, 11], [10, -8, 11], [0, -16, 12], [0, -2, 11]] as const) blob(ctx, { x: x - r, y: y - r, w: r * 2, h: r * 2 }, '#3fae5a', () => ellipsePath(ctx, x, y, r, r * 0.85), { light: 0.35, line: 1.2 });
    for (const [x, y] of [[-8, -12], [6, -6], [2, -20], [10, -14]]) blob(ctx, { x: x - 3, y: y - 3, w: 6, h: 6 }, '#5a7cff', () => ellipsePath(ctx, x, y, 2.6, 2.6), { line: 0.7 });
    gloss(ctx, -4, -18, 6, 3, -0.4, 0.4);
  },
};

const obstacleStump: PainterDef = {
  extra: 30,
  paint(ctx) {
    softShadow(ctx, 36, 15, 4, 0.28);
    cylinder(ctx, 26, 11, 4, -22, '#b0703f', '#e8c48c');
    ctx.strokeStyle = rgba('#a86d3e', 0.6);
    ctx.lineWidth = 1.2;
    for (const r of [6, 12, 18]) {
      ctx.beginPath();
      ctx.ellipse(0, -22, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    blob(ctx, { x: 14, y: -14, w: 16, h: 9 }, '#ffc93d', () => {
      ctx.moveTo(14, -6);
      ctx.bezierCurveTo(14, -15, 30, -15, 30, -6);
      ctx.closePath();
    }, { line: 0.9 });
    blob(ctx, { x: -28, y: -2, w: 18, h: 8 }, '#4fae45', () => ctx.ellipse(-20, 4, 9, 4, 0, 0, Math.PI * 2), { line: 0.9 });
  },
};

const obstacleRock: PainterDef = {
  extra: 34,
  paint(ctx) {
    softShadow(ctx, 38, 15, 4, 0.3);
    blob(ctx, { x: -34, y: -40, w: 68, h: 46 }, '#b6b2cc', () => {
      ctx.moveTo(-34, 2);
      ctx.bezierCurveTo(-38, -26, -16, -42, 4, -38);
      ctx.bezierCurveTo(28, -36, 40, -16, 32, 2);
      ctx.bezierCurveTo(16, 10, -18, 10, -34, 2);
      ctx.closePath();
    }, { light: 0.35, line: 1.6 });
    ctx.fillStyle = rgba('#6fcf52', 0.85);
    ctx.beginPath();
    ctx.moveTo(-26, -24);
    ctx.bezierCurveTo(-18, -38, 6, -40, 18, -32);
    ctx.bezierCurveTo(4, -30, -12, -26, -26, -24);
    ctx.fill();
    gloss(ctx, -10, -26, 10, 4, -0.3, 0.5);
  },
};

export const buildingPainters: Record<string, PainterDef> = {
  flower_bed: flowerBed,
  lantern_post: lanternPost,
  mushroom_ring: mushroomRing,
  mossy_statue: mossyStatue,
  obstacle_bush: obstacleBush,
  obstacle_stump: obstacleStump,
  obstacle_rock: obstacleRock,
  elder_toadstool: elderToadstool,
  acorn_orchard: acornOrchard,
  dewdrop_well: dewdropWell,
  acorn_silo: acornSilo,
  dew_cistern: dewCistern,
  beaver_lodge: beaverLodge,
};

export function paintGeneric(ctx: Ctx, size: number): void {
  plate(ctx, size, '#e8dcc0');
  cylinder(ctx, size * 14, size * 6, 0, -size * 20, '#d8b47a');
  face(ctx, 0, -size * 10, 1);
}

export function paintConstruction(ctx: Ctx, size: number): void {
  plate(ctx, size, '#e8c48c');
  const hw = (size * TILE_W) / 2 - 14;
  const hh = (size * TILE_H) / 2 - 7;
  const postH = 18 + size * 8;
  const corners: [number, number][] = [[0, -hh], [hw, 0], [0, hh], [-hw, 0]];
  const post = (x: number, y: number) => blob(ctx, { x: x - 3, y: y - postH, w: 6, h: postH }, WOOD, () => roundRectPath(ctx, x - 3, y - postH, 6, postH + 2, 3), { line: 1.2 });
  for (const i of [0, 1, 3]) post(corners[i][0], corners[i][1]);
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const [x, y] = corners[i];
    const [nx, ny] = corners[(i + 1) % 4];
    ctx.beginPath();
    ctx.moveTo(x, y - postH);
    ctx.lineTo(nx, ny - postH);
    ctx.lineWidth = 5;
    ctx.strokeStyle = darken(WOOD, 0.25);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = lighten(WOOD, 0.15);
    ctx.stroke();
  }
  post(corners[2][0], corners[2][1]);
  // Crates and planks
  blob(ctx, { x: -26, y: -16, w: 22, h: 20 }, '#e0a764', () => roundRectPath(ctx, -26, -16, 22, 20, 4), { line: 1.3 });
  for (let i = 0; i < 3; i++) blob(ctx, { x: -2 + i * 2, y: 2 - i * 6, w: 30, h: 6 }, i % 2 ? '#d99a58' : '#c8884a', () => roundRectPath(ctx, -2 + i * 2, 2 - i * 6, 30, 6, 3), { line: 1.1 });
  // Little flag
  ctx.beginPath();
  ctx.moveTo(0, -hh - postH);
  ctx.lineTo(0, -hh - postH - 18);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a5a30';
  ctx.stroke();
  blob(ctx, { x: 0, y: -hh - postH - 18, w: 14, h: 9 }, '#ffcf3f', () => {
    ctx.moveTo(0, -hh - postH - 18);
    ctx.quadraticCurveTo(8, -hh - postH - 16, 14, -hh - postH - 13);
    ctx.lineTo(0, -hh - postH - 9);
    ctx.closePath();
  }, { line: 1 });
}

export function paintBubble(ctx: Ctx, resource: string): void {
  softShadow(ctx, 14, 4, 26, 0.25);
  ctx.beginPath();
  ctx.moveTo(-6, 14);
  ctx.quadraticCurveTo(0, 20, 0, 24);
  ctx.quadraticCurveTo(0, 20, 6, 14);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ellipsePath(ctx, 0, 0, 18, 18);
  const g = ctx.createLinearGradient(0, -18, 0, 18);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#e6eefc');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = resource === 'dew' ? '#7cc7f0' : '#e2b06d';
  ctx.stroke();
  if (resource === 'dew') drop(ctx, 0, 4, 8.5);
  else acorn(ctx, 0, -2, 1.15);
  gloss(ctx, -7, -9, 6, 3, -0.6, 0.9);
}

export { dropPath };
