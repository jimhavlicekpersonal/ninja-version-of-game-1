import { TILE_H, TILE_W } from '../render/iso';
import { artRng, darken, lighten, type Ctx } from './toolkit';

/** Extra pixels around the map diamond for the mist halo. */
export const GROUND_PAD = 80;
/** Height of the dirt cliff under the island's front edges. */
export const CLIFF = 54;

const GRASS = '#86b864';
const GRASS_EDGE = '#6b9c52';

/**
 * Paints the plateau: a mountain top rising out of a sea of clouds. Mist halo, rocky crags that
 * fade into cloud, a grass top with tonal patches, grain, flowers and a shrub line on the back rim.
 */
export function paintGround(ctx: Ctx, mapSize: number): void {
  const W = mapSize * TILE_W;
  const H = mapSize * TILE_H;
  ctx.translate(GROUND_PAD + W / 2, GROUND_PAD);
  const top = { x: 0, y: 0 };
  const right = { x: W / 2, y: H / 2 };
  const bottom = { x: 0, y: H };
  const left = { x: -W / 2, y: H / 2 };
  const diamond = () => {
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
  };

  // Mist halo: the plateau glows faintly above the cloud sea.
  ctx.save();
  ctx.shadowColor = 'rgba(214, 222, 240, 0.85)';
  ctx.shadowBlur = 70;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y - 10);
  ctx.lineTo(right.x + 20, right.y);
  ctx.lineTo(bottom.x, bottom.y + CLIFF + 20);
  ctx.lineTo(left.x - 20, left.y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(150, 162, 190, 0.55)';
  ctx.fill();
  ctx.restore();

  // Cliff faces: left face lit, right face in shade.
  const face = (a: { x: number; y: number }, b: { x: number; y: number }, c1: string, c2: string) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + CLIFF);
    ctx.lineTo(a.x, a.y + CLIFF);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, Math.min(a.y, b.y), 0, Math.max(a.y, b.y) + CLIFF);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fill();
  };
  face(left, bottom, '#a3a5a8', '#6b6f78');
  face(bottom, right, '#7f838c', '#50545e');
  // Soft strata stripes and pebbles.
  const rand = artRng(99);
  ctx.lineWidth = 3;
  for (const [a, b, col] of [[left, bottom, 'rgba(225,232,240,0.35)'], [bottom, right, 'rgba(210,220,232,0.2)']] as const) {
    for (const t of [0.38, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + CLIFF * t);
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f + CLIFF * t + Math.sin(f * 30 + t * 7) * 2);
      }
      ctx.strokeStyle = col;
      ctx.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const f = rand();
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f + 10 + rand() * (CLIFF - 18);
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + rand() * 4, 2 + rand() * 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = rand() < 0.5 ? 'rgba(235,240,245,0.35)' : 'rgba(40,46,56,0.3)';
      ctx.fill();
    }
  }

  // Crags: vertical fissures and lit ledges, so the cliff reads as mountain rock.
  for (const [a, b, lit] of [[left, bottom, true], [bottom, right, false]] as const) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(len / 9);
    for (let i = 1; i < n; i++) {
      const f = (i + rand() * 0.6 - 0.3) / n;
      const x = a.x + (b.x - a.x) * f;
      const y0 = a.y + (b.y - a.y) * f + 4;
      const depth = 14 + rand() * (CLIFF - 16);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + (rand() - 0.5) * 4, y0 + depth * 0.5);
      ctx.lineTo(x + (rand() - 0.5) * 5, y0 + depth);
      ctx.strokeStyle = lit ? 'rgba(52,56,66,0.32)' : 'rgba(28,30,38,0.38)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (rand() < 0.4) {
        ctx.beginPath();
        ctx.moveTo(x + 1.5, y0 + depth * 0.3);
        ctx.lineTo(x + 7, y0 + depth * 0.3 + (b.y - a.y) / len * 7);
        ctx.strokeStyle = lit ? 'rgba(240,244,250,0.35)' : 'rgba(200,210,225,0.18)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }
  // The foot of the cliff dissolves into the cloud sea.
  for (const [a, b] of [[left, bottom], [bottom, right]] as const) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + CLIFF * 0.45);
    ctx.lineTo(b.x, b.y + CLIFF * 0.45);
    ctx.lineTo(b.x, b.y + CLIFF + 1);
    ctx.lineTo(a.x, a.y + CLIFF + 1);
    ctx.closePath();
    const mg = ctx.createLinearGradient(0, Math.min(a.y, b.y) + CLIFF * 0.45, 0, Math.max(a.y, b.y) + CLIFF);
    mg.addColorStop(0, 'rgba(206,214,232,0)');
    mg.addColorStop(1, 'rgba(206,214,232,0.6)');
    ctx.fillStyle = mg;
    ctx.fill();
  }
  // Cloud banks hugging the cliff foot.
  for (const [a, b] of [[left, bottom], [bottom, right]] as const) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(len / 22);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = a.x + (b.x - a.x) * f + (rand() - 0.5) * 10;
      const y = a.y + (b.y - a.y) * f + CLIFF + 2 + rand() * 6;
      const r = 14 + rand() * 14;
      const cg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
      cg.addColorStop(0, 'rgba(250,251,255,0.95)');
      cg.addColorStop(0.6, 'rgba(226,232,246,0.75)');
      cg.addColorStop(1, 'rgba(206,214,236,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.4, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Grass top with a gentle radial light.
  diamond();
  const g = ctx.createRadialGradient(0, H * 0.42, 50, 0, H * 0.5, W * 0.55);
  g.addColorStop(0, lighten(GRASS, 0.18));
  g.addColorStop(0.6, GRASS);
  g.addColorStop(1, GRASS_EDGE);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  diamond();
  ctx.clip();
  // Soft light and dark patches.
  for (let i = 0; i < 70; i++) {
    const tx = rand() * mapSize;
    const ty = rand() * mapSize;
    const x = (tx - ty) * (TILE_W / 2);
    const y = (tx + ty) * (TILE_H / 2);
    const r = 40 + rand() * 110;
    const light = rand() < 0.55;
    const pg = ctx.createRadialGradient(x, y, 0, x, y, r);
    pg.addColorStop(0, light ? 'rgba(200,235,170,0.22)' : 'rgba(70,150,50,0.07)');
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.5);
    ctx.translate(-x, -y);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Fine grain, so the grass has texture at high zoom instead of flat colour.
  for (let i = 0; i < mapSize * mapSize * 5; i++) {
    const tx = rand() * mapSize;
    const ty = rand() * mapSize;
    const x = (tx - ty) * (TILE_W / 2);
    const y = (tx + ty) * (TILE_H / 2);
    ctx.fillStyle = rand() < 0.5 ? 'rgba(220,245,190,0.18)' : 'rgba(50,110,40,0.12)';
    ctx.fillRect(x, y, 1.6, 1);
  }
  // Very faint tile checker so the grid can be sensed without lines.
  ctx.fillStyle = 'rgba(40,90,20,0.035)';
  for (let ty = 0; ty < mapSize; ty++) {
    for (let tx = 0; tx < mapSize; tx++) {
      if ((tx + ty) % 2) continue;
      const x = (tx - ty) * (TILE_W / 2);
      const y = (tx + ty) * (TILE_H / 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2);
      ctx.lineTo(x, y + TILE_H);
      ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Little details: tufts, clover and flowers.
  const petals = ['#ffffff', '#f7c6d4', '#f4b6c8', '#fde7ef', '#f7c6d4'];
  for (let i = 0; i < 520; i++) {
    const tx = rand() * mapSize;
    const ty = rand() * mapSize;
    const x = (tx - ty) * (TILE_W / 2);
    const y = (tx + ty) * (TILE_H / 2);
    const kind = rand();
    if (kind < 0.3) {
      const col = petals[Math.floor(rand() * petals.length)];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 2.6, y + Math.sin(a) * 1.5, 2, 1.4, a, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#e9b44c';
      ctx.fill();
    } else if (kind < 0.55) {
      ctx.fillStyle = 'rgba(80,165,55,0.55)';
      for (const [dx, dy] of [[-2.2, 0], [2.2, 0], [0, -1.8]]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, 2.4, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = rand() < 0.5 ? 'rgba(200,255,150,0.65)' : 'rgba(70,150,45,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const dx of [-3, 0, 3]) {
        ctx.moveTo(x + dx, y);
        ctx.quadraticCurveTo(x + dx * 1.2, y - 3, x + dx * 1.5, y - 6);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // Worn paths and stepping stones from the front corner toward the centre, and flat stones of
  // varied grey: the plateau reads as lived on, not a lawn (art re-audit item 10).
  ctx.save();
  diamond();
  ctx.clip();
  const pathTo = (tx0: number, ty0: number, tx1: number, ty1: number) => {
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const wob = Math.sin(f * 7 + tx0) * 0.9;
      const tx = tx0 + (tx1 - tx0) * f + wob;
      const ty = ty0 + (ty1 - ty0) * f - wob;
      const x = (tx - ty) * (TILE_W / 2);
      const y = (tx + ty) * (TILE_H / 2);
      const pg = ctx.createRadialGradient(x, y, 2, x, y, 26);
      pg.addColorStop(0, 'rgba(196,170,120,0.42)');
      pg.addColorStop(1, 'rgba(196,170,120,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(x, y, 26, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      if (i % 3 === 1) {
        ctx.beginPath();
        ctx.ellipse(x + (rand() - 0.5) * 8, y + (rand() - 0.5) * 4, 7 + rand() * 3, 3.6 + rand(), 0, 0, Math.PI * 2);
        ctx.fillStyle = rand() < 0.5 ? '#b9b7b0' : '#a3a5a8';
        ctx.fill();
        ctx.strokeStyle = 'rgba(38,48,61,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  };
  pathTo(mapSize - 1, mapSize - 1, mapSize * 0.55, mapSize * 0.55);
  pathTo(mapSize * 0.5, mapSize * 0.98, mapSize * 0.48, mapSize * 0.6);
  for (let i = 0; i < 46; i++) {
    const tx = rand() * mapSize;
    const ty = rand() * mapSize;
    const x = (tx - ty) * (TILE_W / 2);
    const y = (tx + ty) * (TILE_H / 2);
    const r = 2.5 + rand() * 5;
    const tone = ['#9aa0aa', '#b4b9c1', '#8a8f99', '#a8a29a'][Math.floor(rand() * 4)];
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = tone;
    ctx.fill();
    ctx.strokeStyle = 'rgba(38,48,61,0.4)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.2, r * 0.45, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  ctx.restore();

  // A mountain stream: it runs along the back-left rim and falls over the front-left cliff.
  const fallAt = 0.3;
  const fx = left.x + (bottom.x - left.x) * fallAt;
  const fy = left.y + (bottom.y - left.y) * fallAt;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(fx - 9, fy - 2);
  ctx.lineTo(fx + 9, fy + 2);
  ctx.lineTo(fx + 12, fy + CLIFF + 6);
  ctx.lineTo(fx - 12, fy + CLIFF + 2);
  ctx.closePath();
  const wf = ctx.createLinearGradient(0, fy, 0, fy + CLIFF);
  wf.addColorStop(0, '#9fd3ea');
  wf.addColorStop(1, 'rgba(230,244,252,0.9)');
  ctx.fillStyle = wf;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.2;
  for (const dx of [-6, -1, 4, 8]) {
    ctx.beginPath();
    ctx.moveTo(fx + dx, fy + 2);
    ctx.lineTo(fx + dx * 1.2, fy + CLIFF);
    ctx.stroke();
  }
  ctx.restore();
  // The stream bed across the grass edge to the fall (a short reach, so it never sits under a building for long).
  ctx.save();
  ctx.beginPath();
  const sx0 = left.x + (top.x - left.x) * 0.18;
  const sy0 = left.y + (top.y - left.y) * 0.18;
  ctx.moveTo(sx0, sy0);
  ctx.bezierCurveTo(sx0 + 30, sy0 + 40, fx - 40, fy - 30, fx, fy);
  ctx.strokeStyle = '#5f8f4a';
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = '#6fb6d6';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 9]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Rounded grass lip overhanging the cliff on the two front edges.
  for (const [a, b] of [[left, bottom], [bottom, right]] as const) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(len / 15);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      ctx.beginPath();
      ctx.ellipse(x, y + 3, 10, 7, 0, 0, Math.PI);
      ctx.fillStyle = GRASS_EDGE;
      ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      ctx.moveTo(x + 10, y + 3);
      ctx.ellipse(x, y + 3, 10, 7, 0, 0, Math.PI);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = darken(GRASS_EDGE, 0.35);
    ctx.stroke();
  }
  // Light rim on the back edges.
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(230,255,200,0.7)';
  ctx.stroke();
  // Low shrubs and rocks along the back rim, where the plateau drops away.
  for (const [a, b] of [[left, top], [top, right]] as const) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(len / 26);
    for (let i = 1; i < n; i++) {
      if (rand() < 0.35) continue;
      const f = (i + (rand() - 0.5) * 0.6) / n;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f - 2;
      if (rand() < 0.25) {
        ctx.beginPath();
        ctx.ellipse(x, y, 7, 4.5, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = '#8f949d';
        ctx.fill();
        ctx.strokeStyle = 'rgba(38,48,61,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }
      for (const [dx, dy, r] of [[-5, 0, 6], [4, -1, 7], [0, -5, 6]]) {
        const sg = ctx.createRadialGradient(x + dx - 2, y + dy - 3, 1, x + dx, y + dy, r);
        sg.addColorStop(0, '#7fae5a');
        sg.addColorStop(1, '#3f7a3c');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, r, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Trees along the back rim: sakura, maple and pine, with warm lanterns at the front corner.
  const tree = (x: number, y: number, kind: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(38,48,61,0.22)';
    ctx.fill();
    ctx.strokeStyle = '#4a3222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(-2, -12, 1, -22);
    ctx.stroke();
    if (kind === 2) {
      for (const [dy, w] of [[-18, 18], [-30, 14], [-40, 9]] as const) {
        ctx.beginPath();
        ctx.moveTo(-w, dy + 6);
        ctx.lineTo(0, dy - 10);
        ctx.lineTo(w, dy + 6);
        ctx.closePath();
        const pg = ctx.createLinearGradient(0, dy - 10, 0, dy + 6);
        pg.addColorStop(0, '#4f8a4a');
        pg.addColorStop(1, '#2c5a34');
        ctx.fillStyle = pg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(38,48,61,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      const [c0, c1] = kind === 0 ? ['#ffd7e4', '#e98aa8'] : ['#ffb46a', '#c8402f'];
      for (const [dx, dy, r] of [[-9, -24, 11], [9, -26, 12], [0, -36, 12], [-2, -22, 9]] as const) {
        const cg = ctx.createRadialGradient(dx - r * 0.3, dy - r * 0.4, 1, dx, dy, r);
        cg.addColorStop(0, c0);
        cg.addColorStop(1, c1);
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(38,48,61,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, -30, 18, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
    }
    ctx.restore();
  };
  for (const [a, b] of [[left, top], [top, right]] as const) {
    for (const f of [0.12, 0.33, 0.52, 0.71, 0.9]) {
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f - 10;
      tree(x, y, Math.floor(rand() * 3));
    }
  }
  // Warm stone lanterns where the path meets the front edge.
  for (const dx of [-26, 26]) {
    const x = bottom.x + dx;
    const y = bottom.y - 14 - Math.abs(dx) * 0.5;
    const lg = ctx.createRadialGradient(x, y - 10, 1, x, y - 10, 34);
    lg.addColorStop(0, 'rgba(255,207,112,0.55)');
    lg.addColorStop(1, 'rgba(255,207,112,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a8f99';
    ctx.fillRect(x - 1.6, y - 10, 3.2, 10);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(x - 3, y - 15, 6, 5);
    ctx.strokeStyle = '#26303d';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 3, y - 15, 6, 5);
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 15);
    ctx.lineTo(x, y - 20);
    ctx.lineTo(x + 6, y - 15);
    ctx.closePath();
    ctx.fillStyle = '#9aa0aa';
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Backdrop behind the plateau: dusk light over the valley, darker toward the edges.
 * Drawn small and stretched (a smooth gradient survives scaling).
 */
export function paintBackdrop(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.5, Math.max(w, h) * 0.62);
  g.addColorStop(0, '#5b6a86');
  g.addColorStop(0.45, '#3b4862');
  g.addColorStop(1, '#1d2537');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * A drifting wisp of the cloud sea around the plateau (key `water.wave`, kept for compatibility).
 * Draw it in a box about 4 x 1.35 of `size`, centred on the origin.
 */
export function paintWave(ctx: Ctx, size = 30): void {
  const lobes: [number, number, number][] = [[-1.3, 0.12, 0.62], [-0.55, -0.12, 0.85], [0.35, -0.05, 0.95], [1.2, 0.15, 0.6]];
  for (const [dx, dy, r] of lobes) {
    const x = dx * size;
    const y = dy * size;
    const rr = r * size;
    const g = ctx.createRadialGradient(x - rr * 0.25, y - rr * 0.35, rr * 0.1, x, y, rr);
    g.addColorStop(0, 'rgba(250,251,255,0.9)');
    g.addColorStop(0.55, 'rgba(222,229,245,0.55)');
    g.addColorStop(1, 'rgba(200,210,235,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rr * 1.15, rr * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A band of mountain ridges for the parallax behind the plateau (art re-audit item 10). Drawn in
 * a w x h box (top-left origin); `layer` 0 is the far range (pale, snow caps, a low sun), 1 the
 * middle range, 2 the near forested ridge. The foot of each band dissolves into fog.
 */
export function paintRidge(ctx: Ctx, w: number, h: number, layer: 0 | 1 | 2): void {
  const rand = artRng(301 + layer * 17);
  const col = ['#8494b4', '#5d6c8c', '#3a4762'][layer];
  if (layer === 0) {
    const sun = ctx.createRadialGradient(w * 0.68, h * 0.42, 2, w * 0.68, h * 0.42, h * 0.5);
    sun.addColorStop(0, 'rgba(255,170,120,0.9)');
    sun.addColorStop(0.25, 'rgba(232,110,80,0.55)');
    sun.addColorStop(1, 'rgba(232,110,80,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.42, h * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = '#e8735a';
    ctx.fill();
  }
  const peaks: { x: number; y: number }[] = [];
  const n = [7, 9, 13][layer];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w + (rand() - 0.5) * (w / n) * 0.5;
    const top = [0.18, 0.34, 0.5][layer];
    peaks.push({ x, y: h * (top + rand() * 0.28) });
  }
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, peaks[0].y);
  for (let i = 1; i < peaks.length; i++) {
    const a = peaks[i - 1];
    const b = peaks[i];
    const valley = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + h * (0.1 + rand() * 0.12) };
    ctx.lineTo(valley.x, valley.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, h * 0.15, 0, h);
  g.addColorStop(0, lighten(col, 0.08));
  g.addColorStop(0.7, col);
  g.addColorStop(1, darken(col, 0.1));
  ctx.fillStyle = g;
  ctx.fill();
  // Lit left flanks of each peak.
  ctx.save();
  ctx.clip();
  for (const p of peaks) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - h * 0.5, p.y + h * 0.8);
    ctx.lineTo(p.x - h * 0.1, p.y + h * 0.8);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,230,210,0.1)';
    ctx.fill();
    if (layer === 0) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - h * 0.08, p.y + h * 0.1);
      ctx.lineTo(p.x - h * 0.02, p.y + h * 0.08);
      ctx.lineTo(p.x + h * 0.03, p.y + h * 0.11);
      ctx.lineTo(p.x + h * 0.09, p.y + h * 0.1);
      ctx.closePath();
      ctx.fillStyle = 'rgba(244,246,252,0.85)';
      ctx.fill();
    }
  }
  if (layer === 2) {
    // Cedar spikes along the near ridge.
    for (let i = 0; i < 70; i++) {
      const x = rand() * w;
      let y = h;
      for (let k = 1; k < peaks.length; k++) {
        if (x <= peaks[k].x) {
          const a = peaks[k - 1];
          const b = peaks[k];
          y = a.y + ((x - a.x) / Math.max(1, b.x - a.x)) * (b.y - a.y) + h * 0.12;
          break;
        }
      }
      const th = 8 + rand() * 10;
      ctx.beginPath();
      ctx.moveTo(x - th * 0.35, y + th * 0.4);
      ctx.lineTo(x, y - th);
      ctx.lineTo(x + th * 0.35, y + th * 0.4);
      ctx.closePath();
      ctx.fillStyle = darken(col, 0.18);
      ctx.fill();
    }
  }
  ctx.restore();
  // Fog at the foot.
  const fog = ctx.createLinearGradient(0, h * 0.55, 0, h);
  fog.addColorStop(0, 'rgba(206,214,236,0)');
  fog.addColorStop(1, 'rgba(206,214,236,0.85)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
}

/** A long soft fog band (w x h box), brightest along its middle; the scene drifts it between ridges. */
export function paintFogBand(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(226,232,246,0)');
  g.addColorStop(0.5, 'rgba(236,240,250,0.75)');
  g.addColorStop(1, 'rgba(226,232,246,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const side = ctx.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.15, 'rgba(0,0,0,0)');
  side.addColorStop(0.85, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}
