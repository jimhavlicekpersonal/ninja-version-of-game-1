import type Phaser from 'phaser';
import { paintArtTexture } from './assets';

/**
 * Small code-drawn battle marks (render batch 2026-11-14): cracks for damaged buildings (art audit F7) and a barrel
 * that shows where a defense aims (F27). Each is one shared texture of a few KB, painted on first use.
 */

/**
 * Cracks over a damaged building: stage 1 (66 % health or less) a few hairline cracks, stage 2 (33 % or less) more
 * and wider ones over a scorch. 64 x 48 units, origin at the centre.
 */
export function crackTexture(scene: Phaser.Scene, stage: 1 | 2): string {
  return paintArtTexture(scene.textures, `fx.cracks.${stage}`, 64, 48, 24, (ctx) => {
    let seed = stage === 1 ? 7 : 19;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    if (stage === 2) {
      const g = ctx.createRadialGradient(0, 2, 2, 0, 2, 26);
      g.addColorStop(0, 'rgba(40,28,20,0.42)');
      g.addColorStop(1, 'rgba(40,28,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 2, 30, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const n = stage === 1 ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.8;
      const pts: [number, number][] = [[(rand() - 0.5) * 6, (rand() - 0.5) * 4]];
      const len = (stage === 1 ? 12 : 18) + rand() * 8;
      for (let s = 1; s <= 4; s++) {
        const r = (len * s) / 4;
        const j = (rand() - 0.5) * 0.7;
        pts.push([Math.cos(a + j) * r, Math.sin(a + j) * r * 0.75]);
      }
      // A light lip under a dark crack, so it reads on light walls and dark roofs alike.
      const strokes: [string, number, number][] = [['rgba(255,244,220,0.55)', 1, 0.9], ['rgba(34,24,18,0.9)', stage === 1 ? 1.6 : 2.3, 0]];
      for (const [color, width, dy] of strokes) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
        ctx.stroke();
      }
    }
  });
}

/** Pivot of the barrel texture (fraction of its width); rotate the image toward the target around it. */
export const BARREL_ORIGIN_X = 0.16;
/** Barrel length from the pivot to the muzzle, in texture units (the image is 32 units wide). */
export const BARREL_REACH = 32 * (1 - BARREL_ORIGIN_X) - 1;

/** A defense's barrel: an iron tube with a copper band, pointing right from its pivot. 32 x 10 units. */
export function barrelTexture(scene: Phaser.Scene): string {
  return paintArtTexture(scene.textures, 'fx.barrel', 32, 10, 5, (ctx) => {
    ctx.fillStyle = '#26303d';
    ctx.beginPath();
    ctx.arc(-11, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b4556';
    ctx.fillRect(-11, -3, 25, 6);
    ctx.fillStyle = '#c98a3e';
    ctx.fillRect(6, -3.4, 3, 6.8);
    ctx.fillStyle = '#26303d';
    ctx.fillRect(12, -3.8, 3.5, 7.6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-10, -2.6, 22, 1.2);
  });
}
