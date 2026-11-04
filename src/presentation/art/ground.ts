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
