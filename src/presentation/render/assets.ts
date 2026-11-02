import Phaser from 'phaser';
import { buildingPainters, elderToadstoolSkin, paintBubble, paintConstruction, paintGeneric } from '../art/buildings';
import { CLIFF, GROUND_PAD, paintGround, paintWave } from '../art/ground';
import { militaryPainters, paintPuff, paintRubble, paintShadowDisc, paintStar, projectileArt, troopArt } from '../art/military';
import { TILE_H, TILE_W } from './iso';

export { GROUND_PAD };

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
  wave: 'water.wave',
  rubble: (size: number) => `rubble.${size}`,
  troop: (type: string) => `troop.${type}`,
  projectile: (kind: string) => `projectile.${kind}`,
  puff: 'fx.puff',
  star: 'fx.star',
  starGrey: 'fx.star.grey',
  shadow: 'fx.shadow',
  hallSkin: (skin: string) => `building.elder_toadstool.skin.${skin}`,
};

/** Logical (1x) size of a troop texture, so scenes can scale real art the same way. */
export function troopSize(type: string): { w: number; h: number } {
  const a = troopArt[type];
  return a ? { w: a.w, h: a.h } : { w: 40, h: 40 };
}

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
// Texture generation
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function canvasFor(scene: Phaser.Scene, key: string, w: number, h: number, originY: number, scale = TEX_SCALE): { ctx: Ctx; done: () => void } | null {
  if (scene.textures.exists(key)) return null; // real art (or an earlier run) already provided it
  const tex = scene.textures.createCanvas(key, Math.ceil(w * scale), Math.ceil(h * scale));
  if (!tex) return null;
  const ctx = tex.getContext();
  ctx.scale(scale, scale);
  ctx.translate(w / 2, originY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { ctx, done: () => tex.refresh() };
}

/** Create every placeholder texture that real art has not already provided. */
export function generatePlaceholders(scene: Phaser.Scene, buildingTypes: { type: string; size: number }[], mapSize: number): void {
  if (!scene.textures.exists(Keys.ground)) {
    const w = mapSize * TILE_W + GROUND_PAD * 2;
    const h = mapSize * TILE_H + CLIFF + GROUND_PAD * 2;
    const tex = scene.textures.createCanvas(Keys.ground, w, h);
    if (tex) {
      paintGround(tex.getContext(), mapSize);
      tex.refresh();
    }
  }
  for (const { type, size } of buildingTypes) {
    const p = buildingPainters[type] ?? militaryPainters[type] ?? { extra: size * 20, paint: paintGeneric };
    const w = size * TILE_W;
    const h = size * TILE_H + p.extra;
    const c = canvasFor(scene, Keys.buildingBase(type), w, h, h - (size * TILE_H) / 2);
    if (c) {
      p.paint(c.ctx, size);
      c.done();
    }
  }
  for (const size of [1, 2, 3, 4]) {
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
    const c = canvasFor(scene, Keys.bubble(r), 44, 54, 22);
    if (c) {
      paintBubble(c.ctx, r === 'acorns' ? 'acorn' : r);
      c.done();
    }
  }
  const wave = canvasFor(scene, Keys.wave, 32, 12, 6);
  if (wave) {
    paintWave(wave.ctx);
    wave.done();
  }
  for (const size of [1, 2, 3, 4]) {
    const w = size * TILE_W;
    const h = size * TILE_H + 10;
    const c = canvasFor(scene, Keys.rubble(size), w, h, h - (size * TILE_H) / 2);
    if (c) {
      paintRubble(c.ctx, size);
      c.done();
    }
  }
  for (const [type, art] of Object.entries(troopArt)) {
    const c = canvasFor(scene, Keys.troop(type), art.w, art.h, art.h - 6);
    if (c) {
      art.paint(c.ctx);
      c.done();
    }
  }
  for (const [kind, art] of Object.entries(projectileArt)) {
    const c = canvasFor(scene, Keys.projectile(kind), art.w, art.h, art.h / 2);
    if (c) {
      art.paint(c.ctx);
      c.done();
    }
  }
  const fx: [string, number, number, (ctx: Ctx) => void][] = [
    [Keys.puff, 40, 34, paintPuff],
    [Keys.star, 24, 24, (ctx) => paintStar(ctx)],
    [Keys.starGrey, 24, 24, (ctx) => paintStar(ctx, '#d6cfe4')],
    [Keys.shadow, 36, 16, paintShadowDisc],
  ];
  for (const [key, w, h, paint] of fx) {
    const c = canvasFor(scene, key, w, h, h / 2);
    if (c) {
      paint(c.ctx);
      c.done();
    }
  }
}

/** Generate everything once per game (both scenes share the texture manager). */
export function ensureTextures(
  scene: Phaser.Scene,
  data: { buildings: Record<string, { size: number }>; economy: { mapSize: number }; cosmetics?: { hallSkins: { id: string; cap: string; spots: string }[] } },
): void {
  if (!scene.textures.exists(Keys.shadow)) {
    generatePlaceholders(scene, Object.entries(data.buildings).map(([type, d]) => ({ type, size: d.size })), data.economy.mapSize);
  }
  const hallSize = data.buildings.elder_toadstool?.size ?? 4;
  for (const skin of data.cosmetics?.hallSkins ?? []) {
    if (skin.id === 'classic') continue;
    const p = elderToadstoolSkin(skin.cap, skin.spots);
    const w = hallSize * TILE_W;
    const h = hallSize * TILE_H + p.extra;
    const c = canvasFor(scene, Keys.hallSkin(skin.id), w, h, h - (hallSize * TILE_H) / 2);
    if (c) {
      p.paint(c.ctx, hallSize);
      c.done();
    }
  }
}

/** Texture for a building, honouring the equipped Elder Toadstool skin. */
export function villageTexture(textures: Phaser.Textures.TextureManager, type: string, level: number, size: number, hallSkin: string): string {
  if (type === 'elder_toadstool' && level >= 1 && hallSkin !== 'classic' && textures.exists(Keys.hallSkin(hallSkin))) return Keys.hallSkin(hallSkin);
  return buildingTexture(textures, type, level, size);
}
