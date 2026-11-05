import Phaser from 'phaser';
import { CLIFF, GROUND_PAD, paintBackdrop, paintGround, paintWave } from '../art/ground';
import {
  buildingPainters,
  keepSkin,
  paintBubble,
  paintConstruction,
  paintGeneric,
  paintJam,
  paintPuff,
  paintRubble,
  paintShadowDisc,
  paintSmokeLobe,
  paintStar,
  projectileArt,
  tierFor,
  troopArt,
  registerWarriorArt,
  type Tier,
} from '../art/ninja';
import { ICON_SIZE, warriorIconArt } from '../art/warriorIcons';
import { TILE_H, TILE_W, mapBounds, worldToTile } from './iso';
import { WARRIORS } from '../../gameplay/sim/progression';
import { quality } from './quality';

registerWarriorArt(WARRIORS.map((w) => ({ ...w, id: w.liveTroop ?? w.id })));

export { GROUND_PAD };

/**
 * Placeholder art, drawn in code so the game runs with zero external assets.
 * Every sprite lives behind an asset key (docs/art/ASSET_KEYS.md); real art
 * loaded under the same key wins, and the generator skips it.
 *
 * Art convention (also for real art): the building's footprint diamond spans
 * the full image width and touches the bottom edge of the image.
 */

/** Small effect textures (puffs, stars, bubbles, projectiles) are drawn at 2x; scenes divide by this. */
export const TEX_SCALE = 2;

/**
 * High quality (`render/quality.ts`): buildings are drawn at 2.5x and warriors and badges at 3x
 * (2.5x on low-density screens), so edges stay smooth on high-density phones (iPhone 3x, Pixel 7
 * 2.6x) and when zoomed in. Buildings stop at 2.5x to keep texture memory inside iOS Safari's
 * canvas budget. Low quality draws buildings at 1.5x and warriors and badges at 2x. Scenes size
 * these from the image itself (`buildingScale`, `troopSize`), so the values can change per device.
 */
export const BUILDING_SCALE = quality().buildingScale;
export const HD_SCALE = Math.min(quality().hdScale, typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 2 ? 3 : 2.5);

/** The island is big: drawn at 1.5x (1x in low quality), or less if the GPU can't hold a texture that wide. */
const GROUND_SCALE = quality().groundScale;

export const Keys = {
  ground: 'ground',
  /** Real art for one exact level (optional; wins over the tier art). */
  building: (type: string, level: number) => `building.${type}.${level}`,
  /** Generated art for a visual tier (1..3): levels are split into thirds. */
  buildingTier: (type: string, tier: number) => `building.${type}.t${tier}`,
  buildingBase: (type: string) => `building.${type}`,
  construction: (size: number) => `construction.${size}`,
  bubble: (resource: string) => `bubble.${resource}`,
  /** A drifting wisp of the cloud sea around the plateau (the key predates the clouds). */
  wave: 'water.wave',
  /** Dusk gradient behind everything. */
  backdrop: 'backdrop',
  rubble: (size: number) => `rubble.${size}`,
  troop: (type: string) => `troop.${type}`,
  /** Badge icon for a roster warrior (src/gameplay/data/roster.json id). */
  warriorIcon: (id: string) => `icon.warrior.${id}`,
  projectile: (kind: string) => `projectile.${kind}`,
  puff: 'fx.puff',
  smoke: 'fx.smoke',
  jam: 'fx.jam',
  star: 'fx.star',
  starGrey: 'fx.star.grey',
  shadow: 'fx.shadow',
  hallSkin: (skin: string, tier = 1) => `building.elder_toadstool.skin.${skin}.t${tier}`,
};

/** Max level per building type, filled in when textures are generated. */
const maxLevels = new Map<string, number>();

function tierOf(type: string, level: number): Tier {
  return tierFor(level, maxLevels.get(type) ?? 1);
}

/** Logical (1x) size of a troop texture, so scenes can scale real art the same way. */
export function troopSize(type: string): { w: number; h: number } {
  const a = troopArt[type];
  return a ? { w: a.w, h: a.h } : { w: 40, h: 40 };
}

/** Pick the most specific texture that exists: per-level art, then per-type art. */
export function buildingTexture(textures: Phaser.Textures.TextureManager, type: string, level: number, size: number): string {
  if (level < 1) return Keys.construction(size);
  const specific = Keys.building(type, level);
  if (textures.exists(specific)) return specific;
  const tier = Keys.buildingTier(type, tierOf(type, level));
  if (!textures.exists(tier)) paintPending(textures, tier);
  return textures.exists(tier) ? tier : Keys.buildingBase(type);
}

/**
 * Low quality generates building tier art on first use (`QualitySettings.lazyTiers`): a village
 * shows few of the ~3 tiers × building types at once. Each entry paints its texture once.
 */
const pending = new Map<string, (textures: Phaser.Textures.TextureManager) => void>();

function paintPending(textures: Phaser.Textures.TextureManager, key: string): void {
  const paint = pending.get(key);
  if (!paint) return;
  pending.delete(key);
  paint(textures);
}

/** Paint now, or (lazy tiers) when `key` is first asked for. */
function paintOrDefer(textures: Phaser.Textures.TextureManager, key: string, paint: (textures: Phaser.Textures.TextureManager) => void, lazy: boolean): void {
  if (textures.exists(key)) return;
  if (lazy) pending.set(key, paint);
  else paint(textures);
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

/** Logical (world-pixel) size of the island image. */
export function groundSize(mapSize: number): { w: number; h: number } {
  return { w: mapSize * TILE_W + GROUND_PAD * 2, h: mapSize * TILE_H + CLIFF + GROUND_PAD * 2 };
}

/** Display scale for the island image, whatever resolution it was drawn (or supplied) at. */
export function groundScale(textures: Phaser.Textures.TextureManager, mapSize: number): number {
  const src = textures.get(Keys.ground).getSourceImage() as { width: number };
  return groundSize(mapSize).w / Math.max(1, src.width);
}

/**
 * The world around the plateau: a dusk backdrop and slow wisps of the cloud sea.
 * Shared by the village and battle scenes.
 */
export function addSurroundings(scene: Phaser.Scene, mapSize: number, count = quality().wispCount): void {
  const mb = mapBounds(mapSize);
  const cx = mb.x + mb.width / 2;
  const cy = mb.y + mb.height / 2;
  const bd = scene.add.image(cx, cy, Keys.backdrop).setDepth(-30);
  bd.setDisplaySize(mb.width + 4000, mb.height + 4000);
  let seed = 4242;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0, placed = 0; i < 500 && placed < count; i++) {
    const x = mb.x - 420 + rand() * (mb.width + 840);
    const y = mb.y - 360 + rand() * (mb.height + 760);
    const t = worldToTile(x, y);
    if (t.tx > -2 && t.ty > -2 && t.tx < mapSize + 3 && t.ty < mapSize + 3) continue; // on or near the plateau
    placed++;
    const scale = 0.7 + rand() * 0.9;
    const w = scene.add.image(x, y, Keys.wave).setScale(scale / TEX_SCALE).setAlpha(0).setDepth(-20);
    scene.tweens.add({
      targets: w,
      alpha: { from: 0, to: 0.55 + rand() * 0.35 },
      x: x + 40 + rand() * 40,
      duration: 6000 + rand() * 6000,
      delay: rand() * 4000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

/** Thumbnail key for the HUD: real art for the plain key wins, else the tier 1 drawing. */
export function buildingThumbKey(textures: Phaser.Textures.TextureManager, type: string): string {
  const base = Keys.buildingBase(type);
  if (textures.exists(base)) return base;
  const tier = Keys.buildingTier(type, 1);
  if (!textures.exists(tier)) paintPending(textures, tier);
  return tier;
}

function maxTextureSize(scene: Phaser.Scene): number {
  const r = scene.renderer as { getMaxTextureSize?: () => number };
  return typeof r.getMaxTextureSize === 'function' ? r.getMaxTextureSize() : 4096;
}

// ---------------------------------------------------------------------------
// Texture generation
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function canvasFor(target: Phaser.Scene | Phaser.Textures.TextureManager, key: string, w: number, h: number, originY: number, scale = TEX_SCALE): { ctx: Ctx; done: () => void } | null {
  const textures = target instanceof Phaser.Textures.TextureManager ? target : target.textures;
  if (textures.exists(key)) return null; // real art (or an earlier run) already provided it
  const tex = textures.createCanvas(key, Math.ceil(w * scale), Math.ceil(h * scale));
  if (!tex) return null;
  const ctx = tex.getContext();
  ctx.scale(scale, scale);
  ctx.translate(w / 2, originY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { ctx, done: () => tex.refresh() };
}

/** One slice of texture work; start-up runs these spread across frames (`prepareTextures`). */
type Job = () => void;

type BuildingType = { type: string; size: number; maxLevel: number };
type TextureData = { buildings: Record<string, { size: number; levels?: unknown[] }>; economy: { mapSize: number }; cosmetics?: { hallSkins: { id: string; cap: string; spots: string }[] } };

/** Every placeholder texture as a list of jobs, in the order `generatePlaceholders` paints them (fx shadow last). */
function placeholderJobs(textures: Phaser.Textures.TextureManager, maxSize: number, buildingTypes: BuildingType[], mapSize: number, lazyTiers: boolean): Job[] {
  const jobs: Job[] = [];
  const paint = (key: string, w: number, h: number, originY: number, scale: number | undefined, art: (ctx: Ctx) => void) =>
    jobs.push(() => {
      const c = canvasFor(textures, key, w, h, originY, scale);
      if (c) {
        art(c.ctx);
        c.done();
      }
    });
  jobs.push(() => {
    if (textures.exists(Keys.ground)) return;
    const { w, h } = groundSize(mapSize);
    const s = Math.max(1, Math.min(GROUND_SCALE, maxSize / w, maxSize / h));
    const tex = textures.createCanvas(Keys.ground, Math.floor(w * s), Math.floor(h * s));
    if (tex) {
      const ctx = tex.getContext();
      ctx.scale(s, s);
      paintGround(ctx, mapSize);
      tex.refresh();
    }
  });
  for (const { type, size, maxLevel } of buildingTypes) {
    maxLevels.set(type, maxLevel);
    const p = buildingPainters[type] ?? { extra: size * 20, paint: (ctx: Ctx, s: number) => paintGeneric(ctx, s) };
    const w = size * TILE_W;
    const h = size * TILE_H + p.extra;
    const tiers: Tier[] = maxLevel > 1 ? [1, 2, 3] : [1];
    for (const tier of tiers) {
      const key = Keys.buildingTier(type, tier);
      jobs.push(() =>
        paintOrDefer(textures, key, (t) => {
          const c = canvasFor(t, key, w, h, h - (size * TILE_H) / 2, BUILDING_SCALE);
          if (c) {
            p.paint(c.ctx, size, tier);
            c.done();
          }
        }, lazyTiers),
      );
    }
    // The plain key (`building.<type>`) is only for real art now: code art never draws tier 1 twice.
  }
  for (const size of [1, 2, 3, 4]) {
    const extra = 24 + size * 8;
    const w = size * TILE_W;
    const h = size * TILE_H + extra;
    paint(Keys.construction(size), w, h, h - (size * TILE_H) / 2, BUILDING_SCALE, (ctx) => paintConstruction(ctx, size));
  }
  for (const r of ['acorns', 'dew']) paint(Keys.bubble(r), 44, 54, 22, undefined, (ctx) => paintBubble(ctx, r));
  paint(Keys.wave, 130, 44, 22, undefined, paintWave);
  paint(Keys.backdrop, 128, 128, 0, 1, (ctx) => {
    ctx.translate(-64, 0);
    paintBackdrop(ctx, 128, 128);
  });
  for (const size of [1, 2, 3, 4]) {
    const w = size * TILE_W;
    const h = size * TILE_H + 10;
    paint(Keys.rubble(size), w, h, h - (size * TILE_H) / 2, BUILDING_SCALE, (ctx) => paintRubble(ctx, size));
  }
  for (const [type, art] of Object.entries(troopArt)) paint(Keys.troop(type), art.w, art.h, art.h - 6, HD_SCALE, (ctx) => art.paint(ctx));
  for (const [id, art] of Object.entries(warriorIconArt)) paint(Keys.warriorIcon(id), art.w, art.h, ICON_SIZE / 2, HD_SCALE, (ctx) => art.paint(ctx));
  for (const [kind, art] of Object.entries(projectileArt)) paint(Keys.projectile(kind), art.w, art.h, art.h / 2, undefined, (ctx) => art.paint(ctx));
  const fx: [string, number, number, (ctx: Ctx) => void][] = [
    [Keys.puff, 40, 34, paintPuff],
    [Keys.smoke, 64, 64, paintSmokeLobe],
    [Keys.jam, 28, 28, paintJam],
    [Keys.star, 24, 24, (ctx) => paintStar(ctx)],
    [Keys.starGrey, 24, 24, (ctx) => paintStar(ctx, '#8a8f99')],
    // Keys.shadow is painted last: `ensureTextures` takes it as "every placeholder exists".
    [Keys.shadow, 36, 16, paintShadowDisc],
  ];
  for (const [key, w, h, art] of fx) paint(key, w, h, h / 2, undefined, art);
  return jobs;
}

/** Create every placeholder texture that real art has not already provided. */
export function generatePlaceholders(scene: Phaser.Scene, buildingTypes: BuildingType[], mapSize: number, lazyTiers = quality().lazyTiers): void {
  for (const job of placeholderJobs(scene.textures, maxTextureSize(scene), buildingTypes, mapSize, lazyTiers)) job();
}

function buildingTypesOf(data: TextureData): BuildingType[] {
  return Object.entries(data.buildings).map(([type, d]) => ({ type, size: d.size, maxLevel: d.levels?.length ?? 1 }));
}

function hallSkinJobs(textures: Phaser.Textures.TextureManager, data: TextureData): Job[] {
  const hallSize = data.buildings.elder_toadstool?.size ?? 4;
  const jobs: Job[] = [];
  for (const skin of data.cosmetics?.hallSkins ?? []) {
    if (skin.id === 'classic') continue;
    const p = keepSkin(skin.cap, skin.spots);
    const w = hallSize * TILE_W;
    const h = hallSize * TILE_H + p.extra;
    for (const tier of [1, 2, 3] as Tier[]) {
      const key = Keys.hallSkin(skin.id, tier);
      jobs.push(() =>
        paintOrDefer(textures, key, (t) => {
          const c = canvasFor(t, key, w, h, h - (hallSize * TILE_H) / 2, BUILDING_SCALE);
          if (c) {
            p.paint(c.ctx, hallSize, tier);
            c.done();
          }
        }, quality().lazyTiers),
      );
    }
  }
  return jobs;
}

/** Generate everything once per game (both scenes share the texture manager). */
export function ensureTextures(scene: Phaser.Scene, data: TextureData): void {
  if (!scene.textures.exists(Keys.shadow)) generatePlaceholders(scene, buildingTypesOf(data), data.economy.mapSize);
  for (const job of hallSkinJobs(scene.textures, data)) job();
}

/**
 * Start-up (client re-audit item 3): the same work as `ensureTextures`, plus the tier art of the
 * buildings the village shows first (deferred on the low profile), spread over many short tasks
 * so the page stays responsive and the splash can show progress. Each slice runs jobs for about
 * `sliceMs` (40 ms: shorter slices cost more in yields than they win on a slow phone), then yields
 * to the event loop. The island is one job (`paintGround`), the longest one left (high: ~4.3 s
 * under CPU ×6 emulation, ~0.7 s unthrottled; low: ~1.9 s / ~0.3 s). `ensureTextures` in the
 * scenes then finds everything.
 */
export async function prepareTextures(
  scene: Phaser.Scene,
  data: TextureData,
  shown: { type: string; level: number }[],
  hallSkin: string,
  onProgress?: (fraction: number) => void,
  sliceMs = 40,
): Promise<void> {
  const textures = scene.textures;
  const jobs: Job[] = textures.exists(Keys.shadow) ? [] : placeholderJobs(textures, maxTextureSize(scene), buildingTypesOf(data), data.economy.mapSize, quality().lazyTiers);
  jobs.push(...hallSkinJobs(textures, data));
  for (const b of shown) {
    const size = data.buildings[b.type]?.size;
    if (size) jobs.push(() => void villageTexture(textures, b.type, b.level, size, hallSkin));
  }
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let i = 0;
  while (i < jobs.length) {
    const start = now();
    do jobs[i++]();
    while (i < jobs.length && now() - start < sliceMs);
    onProgress?.(i / jobs.length);
    if (i < jobs.length) await new Promise<void>((r) => setTimeout(r, 0));
  }
}

/** Texture for a building, honouring the equipped Clan Keep skin. */
export function villageTexture(textures: Phaser.Textures.TextureManager, type: string, level: number, size: number, hallSkin: string): string {
  if (type === 'elder_toadstool' && level >= 1 && hallSkin !== 'classic') {
    const key = Keys.hallSkin(hallSkin, tierOf(type, level));
    if (!textures.exists(key)) paintPending(textures, key);
    if (textures.exists(key)) return key;
  }
  return buildingTexture(textures, type, level, size);
}
