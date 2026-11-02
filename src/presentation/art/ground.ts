import { TILE_H, TILE_W } from '../render/iso';
import { artRng, darken, lighten, type Ctx } from './toolkit';

/** Extra pixels around the map diamond for the shallow-water glow. */
export const GROUND_PAD = 80;
/** Height of the dirt cliff under the island's front edges. */
export const CLIFF = 54;

const GRASS = '#86b864';
const GRASS_EDGE = '#6b9c52';

/** Paints the island: shallow-water glow, dirt cliff, soft grass with flowers. Returns the canvas size. */
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

  // Shallow water glow around the island.
  ctx.save();
  ctx.shadowColor = 'rgba(200, 212, 228, 0.9)';
  ctx.shadowBlur = 60;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y - 10);
  ctx.lineTo(right.x + 20, right.y);
  ctx.lineTo(bottom.x, bottom.y + CLIFF + 20);
  ctx.lineTo(left.x - 20, left.y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(120, 136, 158, 0.75)';
  ctx.fill();
  ctx.restore();

  // Foam line where the cliff meets the water.
  ctx.beginPath();
  ctx.moveTo(left.x - 6, left.y + CLIFF - 4);
  ctx.lineTo(bottom.x, bottom.y + CLIFF + 6);
  ctx.lineTo(right.x + 6, right.y + CLIFF - 4);
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

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
  face(left, bottom, '#9aa0aa', '#6f7580');
  face(bottom, right, '#7d838e', '#585d67');
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
}

/** A small curved wave highlight for the water around the island. */
export function paintWave(ctx: Ctx): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.quadraticCurveTo(-7, -4, 0, 1);
  ctx.quadraticCurveTo(7, 6, 14, 0);
  ctx.stroke();
}
