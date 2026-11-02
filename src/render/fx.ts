import Phaser from 'phaser';
import { Keys, TEX_SCALE } from './assets';

const CONFETTI = 'fx.confetti';
const DOT = 'fx.dot';

/** Small white shapes that particles tint at runtime. */
export function ensureFxTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(CONFETTI)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 10, 6, 2);
    g.generateTexture(CONFETTI, 10, 6);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 6);
    g.generateTexture(DOT, 12, 12);
    g.destroy();
  }
}

function burst(scene: Phaser.Scene, x: number, y: number, texture: string, count: number, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number): void {
  const lifespan = typeof config.lifespan === 'number' ? config.lifespan : 900;
  const em = scene.add.particles(x, y, texture, { ...config, emitting: false });
  em.setDepth(depth);
  em.explode(count);
  scene.time.delayedCall(lifespan + 200, () => em.destroy());
}

/** Celebration for a finished building or a placed one. */
export function confetti(scene: Phaser.Scene, x: number, y: number, zoom: number, depth: number): void {
  ensureFxTextures(scene);
  burst(scene, x, y, CONFETTI, 26, {
    speed: { min: 120 / zoom, max: 260 / zoom },
    angle: { min: 200, max: 340 },
    gravityY: 420 / zoom,
    rotate: { min: 0, max: 360 },
    scale: { start: 1 / zoom, end: 0.6 / zoom },
    alpha: { start: 1, end: 0 },
    lifespan: 1100,
    tint: [0xff6b5b, 0xffd23f, 0x5ccf4a, 0x47b9f5, 0xb48cff, 0xff9ad0],
  }, depth);
  burst(scene, x, y, Keys.star, 8, {
    speed: { min: 40 / zoom, max: 120 / zoom },
    angle: { min: 0, max: 360 },
    scale: { start: 0.6 / TEX_SCALE / zoom, end: 0 },
    lifespan: 700,
  }, depth + 1);
}

/** Resource icons popping out of a collector. */
export function resourceBurst(scene: Phaser.Scene, x: number, y: number, resource: string, zoom: number, depth: number): void {
  const key = resource === 'dew' ? Keys.bubble('dew') : Keys.projectile('acorn');
  burst(scene, x, y, key, 7, {
    speed: { min: 80 / zoom, max: 170 / zoom },
    angle: { min: 230, max: 310 },
    gravityY: 300 / zoom,
    scale: { start: (resource === 'dew' ? 0.5 : 0.9) / TEX_SCALE / zoom, end: 0.2 / TEX_SCALE / zoom },
    alpha: { start: 1, end: 0 },
    lifespan: 800,
  }, depth);
  ensureFxTextures(scene);
  burst(scene, x, y, DOT, 10, {
    speed: { min: 30 / zoom, max: 90 / zoom },
    angle: { min: 0, max: 360 },
    scale: { start: 0.5 / zoom, end: 0 },
    tint: resource === 'dew' ? [0xbfeaff, 0xffffff] : [0xffe08a, 0xffffff],
    lifespan: 600,
  }, depth);
}

/** Bits of rubble flying when a building is destroyed. */
export function debris(scene: Phaser.Scene, x: number, y: number, size: number, depth: number): void {
  ensureFxTextures(scene);
  burst(scene, x, y, CONFETTI, 10 + size * 4, {
    speed: { min: 60, max: 160 + size * 30 },
    angle: { min: 200, max: 340 },
    gravityY: 380,
    rotate: { min: 0, max: 360 },
    scale: { start: 0.9, end: 0.5 },
    alpha: { start: 1, end: 0 },
    lifespan: 800,
    tint: [0xc98a54, 0xb5a59a, 0x8f6c3d, 0xe0c090],
  }, depth);
}
