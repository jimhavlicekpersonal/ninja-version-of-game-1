import Phaser from 'phaser';
import { CLIFF, GROUND_PAD, paintBackdrop, paintGround, paintWave } from '../art/ground';
import {
  buildingPainters,
  keepSkin,
  paintBubble,
  paintConstruction,
  paintJam,
  paintPuff,
  paintRubble,
  paintShadowDisc,
  paintSmokeLobe,
  paintStar,
  paintBuildingLevel,
  projectileArt,
  thirdOf,
  troopArt,
  registerWarriorArt,
  type PainterDef,
} from '../art/ninja';
import { ICON_SIZE, warriorIconArt } from '../art/warriorIcons';
import { TILE_H, TILE_W, mapBounds, worldToTile } from './iso';
import { HEROES, WARRIORS } from '../../gameplay/sim/progression';
import { quality, renderScaleFor } from './quality';
import { TextureBudget } from './textureBudget';

registerWarriorArt([...WARRIORS.map((w) => ({ ...w, id: w.liveTroop ?? w.id })), ...HEROES.map((h) => ({ id: h.id, role: h.heroOf, tier: 5, look: h.look as unknown as Record<string, string>, hero: true }))]);

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
/**
 * Art resolution follows the canvas density (2026-11-13 runtime batch): the camera magnifies the
 * map at most 2x past its fit and usually far less, so art drawn at more than 1.5x the canvas
 * pixels per CSS pixel is rarely seen. A DPR 1 laptop or a DPR 1.5 phone no longer paints and
 * uploads 2.5x buildings (2.8x the pixels of 1.5x).
 */
const ART_CAP = Math.max(1, 1.5 * renderScaleFor());
export const BUILDING_SCALE = Math.min(quality().buildingScale, ART_CAP);
export const HD_SCALE = Math.min(quality().hdScale, typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 2 ? 3 : 2.5, ART_CAP);

/** The island is big: drawn at 1.5x (1x in low quality), or less if the GPU can't hold a texture that wide. */
const GROUND_SCALE = Math.min(quality().groundScale, ART_CAP);
/** The island is painted in this many horizontal strips, one per start-up slice (it was one ~4 s task at CPU x6). */
const GROUND_STRIPS = 8;

export const Keys = {
  ground: 'ground',
  /** Real art for one exact level (optional; wins over the tier art). */
  building: (type: string, level: number) => `building.${type}.${level}`,
  /** Real art for a visual tier (1..3): levels are split into thirds. Code art no longer uses these keys. */
  buildingTier: (type: string, tier: number) => `building.${type}.t${tier}`,
  /** Generated (code) art for one exact level, painted on first use: every level shows a change. */
  buildingLevel: (type: string, level: number) => `building.${type}.lv${level}`,
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
  /** Real art for a Keep skin at a tier (1..3). */
  hallSkin: (skin: string, tier = 1) => `building.elder_toadstool.skin.${skin}.t${tier}`,
  /** Generated art for a Keep skin at one exact level. */
  hallSkinLevel: (skin: string, level: number) => `building.elder_toadstool.skin.${skin}.lv${level}`,
};

/** The budget for per-level building art (report section 5 step 3, device F1), made on first use. */
let paintedBudget: TextureBudget | null = null;
function budget(textures: Phaser.Textures.TextureManager): TextureBudget {
  if (!paintedBudget) {
    paintedBudget = new TextureBudget(quality().paintedBudgetMB * 1024 * 1024, (key) => {
      // Removes the GPU copy and drops the painting canvas with it (the texture was its only holder).
      if (textures.exists(key)) textures.remove(key);
    });
  }
  return paintedBudget;
}

/**
 * The building art a scene shows now: never removed while held. Call after a scene has made (or
 * re-made) its building images, with every key they use; anything else beyond the budget goes.
 */
export function holdBuildingTextures(textures: Phaser.Textures.TextureManager, owner: string, keys: Iterable<string>): void {
  budget(textures).hold(owner, keys);
}

/** The scene shows nothing any more (shut down). */
export function releaseBuildingTextures(textures: Phaser.Textures.TextureManager, owner: string): void {
  budget(textures).release(owner);
}

/** Bytes of painted building art kept now (perf checks, `window.tk`). */
export function paintedBuildingBytes(): number {
  return paintedBudget?.bytes ?? 0;
}

/**
 * Low memory (device F19: the app went to the background, Android `onTrimMemory`, an iOS memory
 * warning): remove every painted building look no scene shows now; they are painted again when
 * needed. Returns the bytes freed.
 */
export function trimTextureCaches(textures: Phaser.Textures.TextureManager): number {
  const before = paintedBuildingBytes();
  budget(textures).trim();
  return before - paintedBuildingBytes();
}

/**
 * Texture memory by kind, in bytes of one copy (perf logs, `window.tk.textureBytes`): `gpu` counts
 * every texture's pixels, `cpu` the painting canvases still kept beside them (released ones are
 * 1 px), `building` the budgeted building looks (device F1).
 */
export function textureBytes(textures: Phaser.Textures.TextureManager): { gpu: number; cpu: number; building: number; island: number; troops: number } {
  let gpu = 0;
  let cpu = 0;
  let island = 0;
  let troops = 0;
  for (const [key, tex] of Object.entries(textures.list)) {
    if (key.startsWith('__')) continue;
    for (const src of tex.source) {
      const px = src.width * src.height * 4;
      gpu += px;
      const img = src.image as { width?: number; height?: number; getContext?: unknown } | undefined;
      if (img && typeof img.getContext === 'function') cpu += (img.width ?? 0) * (img.height ?? 0) * 4;
      if (key === Keys.ground) island += px;
      if (key.startsWith('troop.') || key.startsWith('icon.warrior.')) troops += px;
    }
  }
  return { gpu, cpu, building: paintedBuildingBytes(), island, troops };
}

/**
 * Textures whose painting canvas was dropped after upload, with the painter that makes it again
 * after a lost WebGL context (rare: the GPU process restarted, a driver reset).
 */
const released = new Map<string, () => HTMLCanvasElement | null>();
let restoreHooked = false;

/**
 * Device F1/M1: drop a big texture's CPU canvas once WebGL holds it. The island's canvas (16 MB
 * on low, 37 MB on high) used to stay for the whole session for hit tests that never run on it.
 * Only under WebGL (the Canvas renderer draws from the canvas) and only for keys nothing reads
 * pixels from (no `getPixelAlpha`/`getBase64`). After a lost and restored context the texture is
 * painted again and re-uploaded, then released again.
 */
function releaseCpuCopy(textures: Phaser.Textures.TextureManager, key: string, repaint: () => HTMLCanvasElement | null): void {
  const game = textures.game;
  if (!game?.renderer || game.renderer.type === Phaser.CANVAS || !textures.exists(key)) return;
  const src = textures.get(key).source[0];
  const canvas = src?.image as HTMLCanvasElement | undefined;
  if (!src?.glTexture || !canvas || typeof canvas.getContext !== 'function') return;
  // The pixels are on the GPU (`addImage` uploads at once); the source keeps its own width/height.
  canvas.width = 1;
  canvas.height = 1;
  released.set(key, repaint);
  if (restoreHooked) return;
  restoreHooked = true;
  game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
    for (const [k, paint] of released) {
      if (!textures.exists(k)) continue;
      const s = textures.get(k).source[0];
      const t = s.glTexture;
      const fresh = paint();
      if (!t || !fresh) continue;
      s.image = fresh;
      t.update(fresh, s.width, s.height, t.flipY, t.wrapS, t.wrapT, t.minFilter, t.magFilter, t.format);
      fresh.width = 1;
      fresh.height = 1;
    }
  });
}

/** Size and level count per building type, filled in when textures are generated. */
const buildingInfo = new Map<string, { size: number; maxLevel: number }>();
/** Keep skins by id (painted per level on first use). */
const hallSkinPainters = new Map<string, PainterDef>();

/** The third (1..3) of the level range: the tier key real art uses. */
function thirdFor(type: string, level: number): 1 | 2 | 3 {
  return thirdOf(level, buildingInfo.get(type)?.maxLevel ?? 1);
}

/** Logical (1x) size of a troop texture, so scenes can scale real art the same way. */
export function troopSize(type: string): { w: number; h: number } {
  const a = troopArt[type];
  return a ? { w: a.w, h: a.h } : { w: 40, h: 40 };
}

/**
 * Pick the most specific texture: real art for the exact level, then real art for its tier, then
 * the code art for that exact level (painted on first use, in every quality profile: a village or
 * base shows a few of the ~400 type × level looks, so painting them all would waste memory).
 */
export function buildingTexture(textures: Phaser.Textures.TextureManager, type: string, level: number, size: number): string {
  if (level < 1) return Keys.construction(size);
  const specific = Keys.building(type, level);
  if (textures.exists(specific)) return specific;
  const realTier = Keys.buildingTier(type, thirdFor(type, level));
  if (textures.exists(realTier)) return realTier;
  const key = Keys.buildingLevel(type, level);
  paintLevel(textures, key, type, size, level);
  if (!textures.exists(key)) return Keys.buildingBase(type);
  budget(textures).touch(key);
  return key;
}

/** Paint the code art for one building level once (`art/ninja.ts` `paintBuildingLevel`). */
function paintLevel(textures: Phaser.Textures.TextureManager, key: string, type: string, size: number, level: number, def: PainterDef | undefined = buildingPainters[type]): void {
  if (textures.exists(key)) return;
  const info = buildingInfo.get(type);
  const extra = def?.extra ?? size * 20;
  const w = size * TILE_W;
  const h = size * TILE_H + extra;
  const c = canvasFor(textures, key, w, h, h - (size * TILE_H) / 2, BUILDING_SCALE);
  if (!c) return;
  paintBuildingLevel(c.ctx, type, size, level, info?.maxLevel ?? 1, def);
  c.done();
  // Counted against the budget; removed at the next hold/release if unused (never mid-frame).
  budget(textures).added(key, c.bytes);
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
  // The texture source's size, not its image's: the painted canvas may have been released (`releaseCpuCopy`).
  const src = textures.get(Keys.ground).source[0];
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

/** Longest side of a HUD thumbnail in CSS pixels: the largest place one is shown (the Build menu's 96 px cards) plus a margin. */
const THUMB_CSS_PX = 112;

/**
 * A small PNG of a texture for the HUD (device F11, review M10). `getBase64` encoded the whole
 * texture (buildings at 2.5x: 100-300 KB data URLs, 5-20 ms of main-thread encoding each on a
 * slow phone, kept for the session); this draws it at the size the HUD shows (112 CSS px at the
 * screen's density, at most 2x) first, so the encode and the string are several times smaller.
 * Empty when the texture has no readable image.
 */
export function thumbnailDataUrl(textures: Phaser.Textures.TextureManager, key: string): string {
  if (!textures.exists(key)) return '';
  const frame = textures.getFrame(key);
  const img = frame?.source.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (!frame || !img || img.width <= 1) return '';
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const max = Math.round(THUMB_CSS_PX * dpr);
  const k = Math.min(1, max / Math.max(frame.cutWidth, frame.cutHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(frame.cutWidth * k));
  c.height = Math.max(1, Math.round(frame.cutHeight * k));
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, c.width, c.height);
  try {
    // PNG: WebP was 6x smaller but 5x slower to encode in Chromium (measured), and this runs on a tap.
    return c.toDataURL('image/png');
  } catch {
    return '';
  }
}

/** Thumbnail key for the HUD: real art for the plain key wins, else level 1 (real tier art, then code art). */
export function buildingThumbKey(textures: Phaser.Textures.TextureManager, type: string): string {
  const base = Keys.buildingBase(type);
  if (textures.exists(base)) return base;
  return buildingTexture(textures, type, 1, buildingInfo.get(type)?.size ?? 2);
}

function maxTextureSize(scene: Phaser.Scene): number {
  const r = scene.renderer as { getMaxTextureSize?: () => number };
  return typeof r.getMaxTextureSize === 'function' ? r.getMaxTextureSize() : 4096;
}

// ---------------------------------------------------------------------------
// Texture generation
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

/**
 * Paint one code-art texture once and add it as an image texture (never a `CanvasTexture`, which
 * keeps an `ImageData` copy: device F8). `scale` px per art unit; the art's origin is at
 * (`w`/2, `originY`). Real art or an earlier paint with the same key wins.
 */
export function paintArtTexture(textures: Phaser.Textures.TextureManager, key: string, w: number, h: number, originY: number, art: (ctx: Ctx) => void, scale = TEX_SCALE, release = false): string {
  const c = canvasFor(textures, key, w, h, originY, scale);
  if (c) {
    art(c.ctx);
    c.done();
    // Scenery nothing reads pixels from: WebGL keeps the only copy (device F1).
    if (release) {
      releaseCpuCopy(textures, key, () => {
        const again = paintingCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
        if (!again) return null;
        again.ctx.scale(scale, scale);
        again.ctx.translate(w / 2, originY);
        again.ctx.lineJoin = 'round';
        again.ctx.lineCap = 'round';
        art(again.ctx);
        return again.canvas;
      });
    }
  }
  return key;
}

function canvasFor(target: Phaser.Scene | Phaser.Textures.TextureManager, key: string, w: number, h: number, originY: number, scale = TEX_SCALE): { ctx: Ctx; done: () => void; bytes: number } | null {
  const textures = target instanceof Phaser.Textures.TextureManager ? target : target.textures;
  if (textures.exists(key)) return null; // real art (or an earlier run) already provided it
  const paper = paintingCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
  if (!paper) return null;
  const { canvas, ctx } = paper;
  ctx.scale(scale, scale);
  ctx.translate(w / 2, originY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { ctx, done: () => addPainted(textures, key, canvas), bytes: canvas.width * canvas.height * 4 };
}

/**
 * Code art is painted on a canvas of its own and then added as an image texture (client re-audit
 * item 14). A Phaser `CanvasTexture` reads its whole (blank) canvas into an `ImageData` when it is
 * created and keeps it for pixel helpers the game never calls: a third full copy of every texture,
 * next to the canvas and the GPU copy (the JS heap was the size of the texture total). The canvas
 * stays: thumbnails (`getBase64`), hit tests (`getPixelAlpha`) and the re-upload after a lost
 * WebGL context read it. Same 2D settings as Phaser's (`willReadFrequently`: a CPU canvas).
 */
function paintingCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return ctx ? { canvas, ctx } : null;
}

/** Paint the island's device-pixel rows `y0`..`y1` (the rest of the canvas is untouched). */
function paintGroundRows(ctx: Ctx, mapSize: number, scale: number, y0: number, y1: number, width: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(0, y0, width, y1 - y0);
  ctx.clip();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  paintGround(ctx, mapSize);
  ctx.restore();
}

function addPainted(textures: Phaser.Textures.TextureManager, key: string, canvas: HTMLCanvasElement): void {
  if (!textures.exists(key)) textures.addImage(key, canvas as unknown as HTMLImageElement);
}

/** One slice of texture work; start-up runs these spread across frames (`prepareTextures`). */
type Job = () => void;

type BuildingType = { type: string; size: number; maxLevel: number };
type TextureData = { buildings: Record<string, { size: number; levels?: unknown[] }>; economy: { mapSize: number }; cosmetics?: { hallSkins: { id: string; cap: string; spots: string }[] } };

/** Every placeholder texture as a list of jobs, in the order `generatePlaceholders` paints them (fx shadow last). */
function placeholderJobs(textures: Phaser.Textures.TextureManager, maxSize: number, buildingTypes: BuildingType[], mapSize: number): Job[] {
  const jobs: Job[] = [];
  const paint = (key: string, w: number, h: number, originY: number, scale: number | undefined, art: (ctx: Ctx) => void) =>
    jobs.push(() => {
      const c = canvasFor(textures, key, w, h, originY, scale);
      if (c) {
        art(c.ctx);
        c.done();
      }
    });
  // The island, in GROUND_STRIPS slices (2026-11-13 runtime batch: it was one task of ~4 s at CPU
  // x6 on high). Each strip paints the whole picture clipped to its rows (the painter is seeded, so
  // the strips join: Chromium found ~12 differing pixels of 6 million, single grains at the edges);
  // the strips cost ~20-30% more in total than one paint, but the longest is ~1/5 of it.
  if (!textures.exists(Keys.ground)) {
    const { w, h } = groundSize(mapSize);
    const s = Math.max(1, Math.min(GROUND_SCALE, maxSize / w, maxSize / h));
    const cw = Math.floor(w * s);
    const ch = Math.floor(h * s);
    let paper: ReturnType<typeof paintingCanvas> = null;
    for (let i = 0; i < GROUND_STRIPS; i++) {
      jobs.push(() => {
        if (textures.exists(Keys.ground)) return;
        if (i === 0) paper = paintingCanvas(cw, ch);
        if (!paper) return;
        paintGroundRows(paper.ctx, mapSize, s, Math.floor((ch * i) / GROUND_STRIPS), Math.floor((ch * (i + 1)) / GROUND_STRIPS), cw);
        if (i === GROUND_STRIPS - 1) {
          addPainted(textures, Keys.ground, paper.canvas);
          releaseCpuCopy(textures, Keys.ground, () => {
            const again = paintingCanvas(cw, ch);
            if (again) paintGroundRows(again.ctx, mapSize, s, 0, ch, cw);
            return again?.canvas ?? null;
          });
          paper = null;
        }
      });
    }
  }
  // Building art is painted per level on first use (`buildingTexture`), in every profile.
  for (const { type, size, maxLevel } of buildingTypes) buildingInfo.set(type, { size, maxLevel });
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
export function generatePlaceholders(scene: Phaser.Scene, buildingTypes: BuildingType[], mapSize: number): void {
  for (const job of placeholderJobs(scene.textures, maxTextureSize(scene), buildingTypes, mapSize)) job();
}

function buildingTypesOf(data: TextureData): BuildingType[] {
  return Object.entries(data.buildings).map(([type, d]) => ({ type, size: d.size, maxLevel: d.levels?.length ?? 1 }));
}

function hallSkinJobs(_textures: Phaser.Textures.TextureManager, data: TextureData): Job[] {
  // Keep skins are painted per level on first use (`villageTexture`); this only registers them.
  for (const skin of data.cosmetics?.hallSkins ?? []) {
    if (skin.id !== 'classic' && !hallSkinPainters.has(skin.id)) hallSkinPainters.set(skin.id, keepSkin(skin.cap, skin.spots));
  }
  return [];
}

/** Generate everything once per game (both scenes share the texture manager). */
export function ensureTextures(scene: Phaser.Scene, data: TextureData): void {
  if (!scene.textures.exists(Keys.shadow)) generatePlaceholders(scene, buildingTypesOf(data), data.economy.mapSize);
  for (const job of hallSkinJobs(scene.textures, data)) job();
}

/**
 * Start-up (client re-audit item 3): the same work as `ensureTextures`, plus the art of the
 * buildings the village shows first (painted per level on first use), spread over many short tasks
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
  const jobs: Job[] = textures.exists(Keys.shadow) ? [] : placeholderJobs(textures, maxTextureSize(scene), buildingTypesOf(data), data.economy.mapSize);
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
  const skin = hallSkinPainters.get(hallSkin);
  if (type === 'elder_toadstool' && level >= 1 && skin) {
    const real = Keys.hallSkin(hallSkin, thirdFor(type, level));
    if (textures.exists(real)) return real;
    const key = Keys.hallSkinLevel(hallSkin, level);
    paintLevel(textures, key, type, size, level, skin);
    if (textures.exists(key)) {
      budget(textures).touch(key);
      return key;
    }
  }
  return buildingTexture(textures, type, level, size);
}
