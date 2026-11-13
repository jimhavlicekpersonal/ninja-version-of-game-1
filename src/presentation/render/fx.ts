import Phaser from 'phaser';
import { BUILDING_SCALE, HD_SCALE, Keys, TEX_SCALE, paintArtTexture } from './assets';
import { quality } from './quality';
import { DISPLAY_FONT } from './fonts';
import { TILE_H, TILE_W, depthFor, footprintCenter, mapBounds, worldToTile } from './iso';
import { paintBird, paintRuins, paintStreamer, paintVillager, type RuinFamily } from '../art/ninja';
import { paintFogBand, paintRidge, paintSun } from '../art/ground';
import { ROLE_RING, roleOfTroop } from '../art/warriorIcons';

const CONFETTI = 'fx.confetti';
const DOT = 'fx.dot';
const COIN = 'fx.coin';
const GRAIN = 'fx.grain';

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
    // A square-holed gold coin (2x, so it stays crisp).
    g.clear();
    g.fillStyle(0x7a5418, 1);
    g.fillCircle(14, 14, 14);
    g.fillStyle(0xe9b44c, 1);
    g.fillCircle(14, 14, 12);
    g.fillStyle(0xffe08a, 1);
    g.fillCircle(12, 11, 7);
    g.fillStyle(0xe9b44c, 1);
    g.fillCircle(14, 14, 7);
    g.fillStyle(0x7a5418, 1);
    g.fillRect(10.5, 10.5, 7, 7);
    g.generateTexture(COIN, 28, 28);
    // A rice grain.
    g.clear();
    g.fillStyle(0x8a7140, 1);
    g.fillEllipse(8, 12, 14, 22);
    g.fillStyle(0xfff6e0, 1);
    g.fillEllipse(8, 12, 11, 19);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(6, 8, 4, 8);
    g.generateTexture(GRAIN, 16, 24);
    g.destroy();
  }
}

function burst(scene: Phaser.Scene, x: number, y: number, texture: string, count: number, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number): void {
  const lifespan = typeof config.lifespan === 'number' ? config.lifespan : 900;
  const em = scene.add.particles(x, y, texture, { ...config, emitting: false });
  em.setDepth(depth);
  // Decoration only: low quality and reduced motion emit fewer particles (render/quality.ts).
  em.explode(Math.max(1, Math.round(count * quality().particleScale)));
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
    // Clan colours: vermilion, gold leaf, washi, indigo, bamboo and a little sakura.
    tint: [0xc8402f, 0xe9b44c, 0xf4ead6, 0x3f6fa0, 0x7fae5a, 0xf4b6c8],
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
  ensureFxTextures(scene);
  const key = resource === 'dew' ? GRAIN : COIN;
  burst(scene, x, y, key, 8, {
    speed: { min: 80 / zoom, max: 170 / zoom },
    angle: { min: 230, max: 310 },
    gravityY: 300 / zoom,
    rotate: resource === 'dew' ? { min: -60, max: 60 } : 0,
    scale: { start: 0.55 / zoom, end: 0.3 / zoom },
    alpha: { start: 1, end: 0 },
    lifespan: 800,
  }, depth);
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

// ---------------------------------------------------------------------------------------------
// Art re-audit effects (ART AI): battle readability and feel, village life, scenery.
// Everything here uses the scene's tweens and timers, so it pauses with the scene (idle throttle),
// and decorative counts follow `quality().particleScale`.
// ---------------------------------------------------------------------------------------------

const RING = 'fx.ring';
const TRACER = 'fx.tracer';
const FLASH = 'fx.flash';

/**
 * Paint a code-art texture once (art painters are resolution-independent; `scale` px per unit).
 * Device F8: through `paintArtTexture` (an image texture), no longer `createCanvas`, whose
 * `CanvasTexture` kept a full `ImageData` copy of every ridge, fog band, ruin and sprite.
 */
function artTexture(scene: Phaser.Scene, key: string, w: number, h: number, originY: number, paint: (ctx: CanvasRenderingContext2D) => void, scale = TEX_SCALE): string {
  // Scenery is only drawn, never read back: its painting canvas goes once WebGL has it.
  return paintArtTexture(scene.textures, key, w, h, originY, paint, scale, key.startsWith('scenery.'));
}

function ensureBattleFx(scene: Phaser.Scene): void {
  if (scene.textures.exists(RING)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Ground ring under a warrior: a soft fill and a bright rim (tinted by role).
  g.fillStyle(0xffffff, 0.22);
  g.fillEllipse(32, 16, 60, 28);
  g.lineStyle(4, 0xffffff, 1);
  g.strokeEllipse(32, 16, 56, 25);
  g.generateTexture(RING, 64, 32);
  g.clear();
  // Muzzle flash / impact light.
  for (let r = 16; r > 0; r -= 2) {
    g.fillStyle(0xffffff, 0.08 + (16 - r) * 0.012);
    g.fillCircle(16, 16, r);
  }
  g.generateTexture(FLASH, 32, 32);
  g.destroy();
  artTexture(scene, TRACER, 64, 8, 4, (ctx) => {
    // A streak that fades toward its tail (origin at the head, on the right).
    const grad = ctx.createLinearGradient(-32, 0, 32, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-32, 0);
    ctx.lineTo(30, -2.6);
    ctx.quadraticCurveTo(33, 0, 30, 2.6);
    ctx.closePath();
    ctx.fill();
  });
}

/** Role colour (0xRRGGBB) of a troop texture id, for its ground ring. */
export function roleTint(troopType: string): number {
  const role = roleOfTroop(troopType);
  return parseInt((role ? ROLE_RING[role] : '#e9e2cf').slice(1), 16);
}

/**
 * The ring texture painted in one role colour (report section 5 step 3, device F13). Tinting a
 * white ring only works in WebGL: Phaser's Canvas renderer, used when a phone has no WebGL, ignores
 * tint, so every ring was white and roles could not be told apart in battle. One small texture per
 * role colour (about ten) looks the same in both renderers.
 */
export function ringTexture(scene: Phaser.Scene, color: number): string {
  const key = `${RING}.${color.toString(16).padStart(6, '0')}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 0.22);
  g.fillEllipse(32, 16, 60, 28);
  g.lineStyle(4, color, 1);
  g.strokeEllipse(32, 16, 56, 25);
  g.generateTexture(key, 64, 32);
  g.destroy();
  return key;
}

/** A role-coloured ring on the ground under a warrior (one image per warrior: cheap). */
export function troopRing(scene: Phaser.Scene, troopType: string, air: boolean): Phaser.GameObjects.Image {
  ensureBattleFx(scene);
  return scene.add.image(0, 0, ringTexture(scene, roleTint(troopType))).setScale(air ? 0.48 : 0.62).setAlpha(air ? 0.5 : 0.95).setDepth(-3);
}

/** Phaser drew with Canvas (no WebGL): tints are ignored there, so effects that rely on them need another cue. */
export function canvasRenderer(scene: Phaser.Scene): boolean {
  return scene.sys.game.renderer.type === Phaser.CANVAS;
}

/**
 * A tinted copy of a texture for Phaser's Canvas renderer, which ignores `setTint` (device F13):
 * multiplied by `color` (as `setTint` does), or filled with it (`setTintFill`), keeping the
 * original's alpha. Made once per key and colour; the caller removes it when done
 * (`textures.remove`). Under WebGL use the real tint instead.
 */
export function tintedTexture(scene: Phaser.Scene, key: string, color: number, fill = false): string {
  const hex = color.toString(16).padStart(6, '0');
  const out = `${key}#${fill ? 'fill' : 'tint'}${hex}`;
  if (scene.textures.exists(out) || !scene.textures.exists(key)) return scene.textures.exists(out) ? out : key;
  const frame = scene.textures.getFrame(key);
  const src = frame.source.image as CanvasImageSource;
  const c = document.createElement('canvas');
  c.width = Math.max(1, frame.cutWidth);
  c.height = Math.max(1, frame.cutHeight);
  const ctx = c.getContext('2d');
  if (!ctx) return key;
  ctx.drawImage(src, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = fill ? 'source-in' : 'multiply';
  ctx.fillStyle = `#${hex}`;
  ctx.fillRect(0, 0, c.width, c.height);
  if (!fill) {
    // Multiply also coloured the transparent pixels: keep only the original's shape.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(src, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, c.width, c.height);
  }
  scene.textures.addImage(out, c as unknown as HTMLImageElement);
  return out;
}

/** Tracer colours by projectile kind. */
const TRACER_TINT: Record<string, number> = { acorn: 0xf4f7ff, pebble: 0xf4f7ff, pinecone: 0xffa040, sting: 0xbfe9ff, spark: 0xffe08a, seedbomb: 0xff8a3c, arrow: 0xfff6d8, bolas: 0xcfd6e0, sap: 0xb4b9c1, thorns: 0xb7e08a };

/** A streak behind a projectile; `updateTracer` stretches it from the last position to the new one. */
export function makeTracer(scene: Phaser.Scene, kind: string, depth: number): Phaser.GameObjects.Image {
  ensureBattleFx(scene);
  return scene.add.image(0, 0, TRACER).setOrigin(1, 0.5).setTint(TRACER_TINT[kind] ?? 0xffffff).setDepth(depth).setAlpha(0);
}

export function updateTracer(tr: Phaser.GameObjects.Image, fromX: number, fromY: number, x: number, y: number, zoom: number): void {
  const dx = x - fromX;
  const dy = y - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  // At least ~14 screen px long and ~3 px thick, so a shot is visible on a phone at any zoom.
  const shown = Math.max(len * 2.2, 14 / zoom);
  tr.setPosition(x, y).setRotation(Math.atan2(dy, dx)).setScale(shown / 64, Math.max(0.5, 1.2 / zoom) / TEX_SCALE).setAlpha(0.9);
}

/** A short white-gold flash where a tower fires. */
export function muzzleFlash(scene: Phaser.Scene, x: number, y: number, zoom: number, depth: number): void {
  ensureBattleFx(scene);
  const f = scene.add.image(x, y, FLASH).setTint(0xfff0b0).setScale(0.5 / zoom).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: f, scale: 1.1 / zoom, alpha: 0, duration: 140, ease: 'Cubic.easeOut', onComplete: () => f.destroy() });
}

/** A brief line from a tower to the warrior it has just locked on to. */
export function targetLine(scene: Phaser.Scene, x0: number, y0: number, x1: number, y1: number, zoom: number, depth: number): void {
  const g = scene.add.graphics().setDepth(depth);
  g.lineStyle(2 / zoom, 0xff5a40, 0.9);
  const steps = 10;
  for (let i = 0; i < steps; i += 2) {
    g.beginPath();
    g.moveTo(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    g.lineTo(x0 + ((x1 - x0) * (i + 1)) / steps, y0 + ((y1 - y0) * (i + 1)) / steps);
    g.strokePath();
  }
  g.lineStyle(2 / zoom, 0xff5a40, 1);
  g.strokeCircle(x1, y1, 9 / zoom);
  scene.tweens.add({ targets: g, alpha: 0, delay: 160, duration: 260, onComplete: () => g.destroy() });
}

/** Ninja smoke poof where a warrior falls: a grey burst with small puffs flying out. */
export function deathPuff(scene: Phaser.Scene, x: number, y: number, depth: number): void {
  const n = Math.max(3, Math.round(6 * quality().particleScale));
  const core = scene.add.image(x, y, Keys.puff).setScale(0.3 / TEX_SCALE).setTint(0xb8bec8).setDepth(depth).setAlpha(0.95);
  scene.tweens.add({ targets: core, scale: 0.9 / TEX_SCALE, alpha: 0, y: y - 10, duration: 420, ease: 'Cubic.easeOut', onComplete: () => core.destroy() });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = scene.add.image(x, y, Keys.puff).setScale(0.16 / TEX_SCALE).setTint(0x8a909c).setDepth(depth).setAlpha(0.85);
    scene.tweens.add({ targets: p, x: x + Math.cos(a) * 16, y: y + Math.sin(a) * 8 - 6, scale: 0.05 / TEX_SCALE, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
  }
}

/** Ruin family by building type (`art/ninja.ts` `paintRuins`). */
export function ruinFamily(kind: string, type: string): RuinFamily {
  if (kind === 'hall') return 'keep';
  if (kind === 'defense') return 'tower';
  if (type === 'acorn_silo' || type === 'dew_cistern') return 'store';
  return 'house';
}

/** Texture key for a family's ruins at a footprint size, painted on first use. */
export function ruinTexture(scene: Phaser.Scene, size: number, family: RuinFamily): string {
  const key = `rubble.${size}.${family}`;
  const w = size * TILE_W;
  const h = size * TILE_H + 40;
  return artTexture(scene, key, w, h, h - (size * TILE_H) / 2, (ctx) => paintRuins(ctx, size, family), BUILDING_SCALE);
}

/** The Keep comes down: a ring of dust, a flash, heavy debris and a long shake. */
export function keepCollapse(scene: Phaser.Scene, x: number, y: number, size: number, depth: number): void {
  ensureBattleFx(scene);
  const flash = scene.add.image(x, y - 40, FLASH).setTint(0xffd27a).setScale(2).setDepth(depth + 2).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: flash, scale: 6, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
  const n = Math.max(6, Math.round(12 * quality().particleScale));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = scene.add.image(x, y - 10, Keys.puff).setScale(0.5 / TEX_SCALE).setTint(0xd8d0c4).setDepth(depth + 1).setAlpha(0.9);
    scene.tweens.add({ targets: p, x: x + Math.cos(a) * size * 34, y: y - 10 + Math.sin(a) * size * 17, scale: 1.6 / TEX_SCALE, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
  }
  debris(scene, x, y - 30, size + 2, depth + 1);
  scene.cameras.main.shake(520, 0.009);
}

/** Text labels fixed to the camera (big stamps), sized for the screen and the render scale. */
function stamp(scene: Phaser.Scene, text: string, color: string, sizePx: number, yFrac: number): Phaser.GameObjects.Text {
  const cam = scene.cameras.main;
  const t = scene.add
    .text(cam.width / 2, cam.height * yFrac, text, { fontFamily: DISPLAY_FONT, fontSize: `${Math.round(sizePx)}px`, color, stroke: '#26303d', strokeThickness: Math.round(sizePx / 7) })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(2_000_000);
  // Undo the camera zoom: the label keeps its size on screen.
  t.setScale(1 / cam.zoom);
  t.setPosition(cam.width / 2 + (t.x - cam.width / 2), t.y);
  return t;
}

/** "100%" banner across the battlefield: a vermilion sash and a gold stamp that slams in. */
export function perfectBanner(scene: Phaser.Scene, renderScale: number): void {
  const cam = scene.cameras.main;
  const z = cam.zoom;
  // The sash is drawn around its own origin so it can unroll vertically.
  const sh = 70 * renderScale;
  const sw = cam.width * 1.2;
  const sash = scene.add.graphics({ x: cam.width / 2, y: cam.height * 0.38 }).setScrollFactor(0).setDepth(1_999_999).setScale(1 / z, 0);
  sash.fillStyle(0xc8402f, 0.92);
  sash.fillRect(-sw / 2, -sh / 2, sw, sh);
  sash.lineStyle(4 * renderScale, 0xe9b44c, 1);
  sash.lineBetween(-sw / 2, -sh / 2, sw / 2, -sh / 2);
  sash.lineBetween(-sw / 2, sh / 2, sw / 2, sh / 2);
  const label = stamp(scene, '100%', '#ffe08a', 64 * renderScale, 0.38);
  const s = label.scale;
  label.setScale(s * 2.6).setAlpha(0);
  scene.tweens.add({ targets: sash, scaleY: 1 / z, duration: 180, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: label, scale: s, alpha: 1, duration: 260, delay: 80, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: [sash, label], alpha: 0, delay: 1700, duration: 400, onComplete: () => { sash.destroy(); label.destroy(); } });
}

/** A star won: a big gold star stamps down at the top of the field, then flies toward the HUD's star box (top right). */
export function starSlam(scene: Phaser.Scene, index: number, renderScale: number): void {
  const cam = scene.cameras.main;
  const z = cam.zoom;
  const x = cam.width / 2 + (index - 1) * 70 * renderScale;
  const y = cam.height * 0.22;
  const star = scene.add.image(x, y, Keys.star).setScrollFactor(0).setDepth(2_000_000).setScale((5 * renderScale) / TEX_SCALE / z).setAlpha(0);
  scene.tweens.add({ targets: star, scale: (2.4 * renderScale) / TEX_SCALE / z, alpha: 1, angle: 360, duration: 280, ease: 'Back.easeIn' });
  ensureBattleFx(scene);
  const ring = scene.add.image(x, y, FLASH).setScrollFactor(0).setDepth(1_999_999).setTint(0xffe08a).setScale(0).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: ring, scale: (4 * renderScale) / z, alpha: 0, delay: 260, duration: 420, onComplete: () => ring.destroy() });
  scene.tweens.add({ targets: star, x: cam.width - 60 * renderScale, y: 60 * renderScale, scale: (0.8 * renderScale) / TEX_SCALE / z, alpha: 0, delay: 900, duration: 420, ease: 'Cubic.easeIn', onComplete: () => star.destroy() });
}

// ---------------------------------------------------------------- scenery (item 10)

/**
 * Mountains behind the plateau: three ridge bands at different scroll factors (parallax) with fog
 * bands drifting between them (low: the far band and its fog only, `quality().sceneryLayers`).
 * Textures are drawn small and displayed large (soft shapes survive scaling): about 5.9 MB at
 * high quality, 0.5 MB at low.
 */
export function addScenery(scene: Phaser.Scene, mapSize: number): void {
  const mb = mapBounds(mapSize);
  const cam = scene.cameras.main;
  // Ridge bands are magnified a few times on screen: 1 px per unit at high quality, half at low.
  const res = quality().profile === 'low' ? 0.5 : 1;
  const W = 1600;
  const H = 300;
  // Place each band so it sits behind the plateau's top corner when the camera is centred on the map.
  const cx = mb.x + mb.width / 2;
  const cy = mb.y + mb.height / 2;
  const sx0 = cx - cam.width / 2;
  const sy0 = cy - cam.height / 2;
  const all: [0 | 1 | 2, number, number, number][] = [
    [0, 0.35, -560, 2.6],
    [1, 0.55, -380, 2.3],
    [2, 0.78, -230, 2.0],
  ];
  // Device F10: every band is a full-width alpha layer drawn each frame (with its fog band). Low
  // keeps the far band (with the sun) and its fog: 2 layers instead of 6.
  const layers = all.slice(0, Math.max(1, Math.min(all.length, quality().sceneryLayers)));
  for (const [layer, sf, dy, scale] of layers) {
    const key = artTexture(scene, `scenery.ridge.${layer}`, W, H, 0, (ctx) => { ctx.translate(-W / 2, 0); paintRidge(ctx, W, H, layer); }, res);
    // Seen position = x + scroll * (1 - scrollFactor): offset so the band sits right when the camera is centred.
    const wx = cx - sx0 * (1 - sf);
    const wy = mb.y + dy - sy0 * (1 - sf);
    // Report section 5 step 4 (art F3): three copies edge to edge (the band tiles), so a wide screen
    // never sees where it ends; its foot fades out in the painter.
    for (const k of [-1, 0, 1]) scene.add.image(wx + k * W * scale, wy, key).setOrigin(0.5, 0).setScrollFactor(sf).setScale(scale / res).setDepth(-28 + layer);
    if (layer === 0) {
      // The low sun, once, where it used to sit in the far band (0.68 across, 0.42 down).
      const sun = artTexture(scene, 'scenery.sun', H, H, 0, (ctx) => { ctx.translate(-H / 2, 0); paintSun(ctx, H); }, res);
      scene.add.image(wx + (0.68 - 0.5) * W * scale, wy + 0.42 * H * scale, sun).setOrigin(0.5, 0.5).setScrollFactor(sf).setScale(scale / res).setDepth(-28.5);
    }
    if (layer < 2) {
      const fsf = Math.min(1, sf + 0.1);
      const fx0 = cx - sx0 * (1 - fsf);
      const fy = mb.y + dy - sy0 * (1 - fsf) + H * scale * 0.72;
      const fog = artTexture(scene, 'scenery.fog', 512, 64, 0, (ctx) => { ctx.translate(-256, 0); paintFogBand(ctx, 512, 64); }, 0.5);
      const f = scene.add.image(fx0 - 300, fy, fog).setOrigin(0.5, 0).setScrollFactor(fsf).setScale(7, 2.4 + layer).setAlpha(0.7).setDepth(-27.5 + layer);
      scene.tweens.add({ targets: f, x: fx0 + 300, duration: 26000 + layer * 9000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
}

// ---------------------------------------------------------------- village life (item 3)

export interface LifeBuilding {
  id: string;
  type: string;
  level: number;
  /** Top-left tile and footprint size. */
  x: number;
  y: number;
  size: number;
}

/**
 * A village that moves: chimney smoke and campfire smoke, glints on the paddies, streamers on the
 * Keep and the Dojo, two ninja sparring at the Dojo, villagers walking between buildings and
 * swallows crossing the sky. Cheap sprites and tweens; counts follow `quality().particleScale`.
 * `sync` rebuilds only when the set of buildings changes.
 *
 * Device F20: smoke puffs and birds come from a pool (they used to be a new image, destroyed
 * again, every second or two per chimney: steady garbage at the idle frame rate), and a calm
 * village (`quality().calmLife`: low, reduced motion) has no walkers, petals or cloud shadows.
 */
export class VillageLife {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private sig = '';
  private birdTimer: Phaser.Time.TimerEvent | null = null;
  /** Idle pooled images by texture key (puffs, birds), reused instead of made and destroyed. */
  private spare = new Map<string, Phaser.GameObjects.Image[]>();
  private pooled: Phaser.GameObjects.Image[] = [];
  private readonly calm = quality().calmLife;
  /** Pooled images made so far (tests, perf checks). */
  get pooledCount(): number {
    return this.pooled.length;
  }

  /** A pooled image, reset and shown at (x, y). */
  private take(key: string, x: number, y: number): Phaser.GameObjects.Image {
    const free = this.spare.get(key)?.pop();
    if (free) return free.setPosition(x, y).setActive(true).setVisible(true).setAngle(0).setFlipX(false);
    const im = this.scene.add.image(x, y, key);
    this.pooled.push(im);
    return im;
  }

  /** Back to the pool (hidden; no tween left on it). */
  private give(im: Phaser.GameObjects.Image): void {
    if (!im.scene) return; // destroyed with the scene
    this.scene.tweens.killTweensOf(im);
    im.setActive(false).setVisible(false);
    const list = this.spare.get(im.texture.key) ?? [];
    list.push(im);
    this.spare.set(im.texture.key, list);
  }

  constructor(private scene: Phaser.Scene, private mapSize: number, private overlayDepth: number) {
    ensureFxTextures(scene);
    artTexture(scene, 'fx.bird', 20, 12, 6, paintBird, HD_SCALE);
    artTexture(scene, 'fx.streamer', 40, 14, 7, (ctx) => { ctx.translate(-18, 0); paintStreamer(ctx); }, HD_SCALE);
    for (let v = 0; v < 4; v++) artTexture(scene, `fx.villager.${v}`, 28, 30, 26, (ctx) => paintVillager(ctx, v), HD_SCALE);
    this.scheduleBird();
    if (!this.calm) {
      this.cloudShadows();
      this.petals();
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  sync(list: LifeBuilding[]): void {
    const sig = list.map((b) => `${b.id}:${b.type}:${b.x},${b.y}:${Math.min(1, b.level)}`).sort().join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    this.clear();
    const ps = quality().particleScale;
    const built = list.filter((b) => b.level >= 1);
    for (const b of built) {
      const c = footprintCenter(b.x, b.y, b.size);
      const hw = (b.size * TILE_W) / 2;
      const hh = (b.size * TILE_H) / 2;
      const depth = depthFor(b.x, b.y, b.size);
      if (b.type === 'acorn_orchard') this.smoke(c.x - hw * 0.3, c.y - 70, depth + 1, 1100 / ps);
      if (b.type === 'army_camp') this.smoke(c.x + 1, c.y - 16, depth + 1, 1500 / ps);
      if (b.type === 'bitter_incense_burner') this.smoke(c.x, c.y - 50, depth + 1, 1300 / ps, 0x9bb07a);
      if (b.type === 'dewdrop_well') this.glints(c.x, c.y - 6, hw * 0.6, hh * 0.6, depth + 1, Math.max(2, Math.round(4 * ps)));
      if (b.type === 'elder_toadstool') this.streamer(c.x - hw * 0.62, c.y + hh * 0.1 - 70, depth + 2);
      if (b.type === 'burrow_barracks') {
        this.streamer(c.x + hw * 0.62, c.y + hh * 0.25 - 54, depth + 2);
        this.sparring(c.x - hw * 0.1, c.y + hh * 0.86, depth + 2);
      }
    }
    const walkers = built.filter((b) => b.size >= 2);
    if (!this.calm && walkers.length >= 2) for (let i = 0; i < Math.max(1, Math.round(4 * ps)); i++) this.walker(i, walkers);
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private smoke(x: number, y: number, depth: number, every: number, tint = 0xeef0f4): void {
    const s = this.scene;
    const puff = () => {
      const p = this.take(Keys.puff, x, y).setScale(0.18 / TEX_SCALE).setTint(tint).setAlpha(0.6).setDepth(depth);
      s.tweens.add({ targets: p, y: y - 34, x: x + 6 + Math.random() * 8, scale: 0.55 / TEX_SCALE, alpha: 0, duration: 2600, ease: 'Sine.easeOut', onComplete: () => this.give(p) });
    };
    puff();
    this.timers.push(s.time.addEvent({ delay: every, loop: true, callback: puff }));
  }

  private glints(x: number, y: number, rx: number, ry: number, depth: number, n: number): void {
    const s = this.scene;
    for (let i = 0; i < n; i++) {
      const g = this.track(s.add.image(x, y, DOT).setScale(0.32).setAlpha(0).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD));
      const place = () => {
        const u = Math.random() * 2 - 1;
        const v = (Math.random() * 2 - 1) * (1 - Math.abs(u));
        g.setPosition(x + u * rx, y + v * ry);
      };
      place();
      s.tweens.add({ targets: g, alpha: { from: 0, to: 0.85 }, scaleX: { from: 0.2, to: 0.5 }, duration: 520, yoyo: true, repeat: -1, repeatDelay: 600 + Math.random() * 1600, delay: Math.random() * 2000, onRepeat: place });
    }
  }

  private streamer(x: number, y: number, depth: number): void {
    const s = this.scene;
    const f = this.track(s.add.image(x, y, 'fx.streamer').setOrigin(0.05, 0.5).setScale(1 / HD_SCALE).setDepth(depth));
    const base = 1 / HD_SCALE;
    s.tweens.add({ targets: f, scaleY: { from: base * 0.7, to: base * 1.1 }, angle: { from: -3, to: 7 }, duration: 620 + Math.random() * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private sparring(x: number, y: number, depth: number): void {
    const s = this.scene;
    const pair: [string, number, boolean][] = [['troop.hedgehog_roller', -9, false], ['troop.twin_fang_dancer', 9, true]];
    pair.forEach(([key, dx, flip], i) => {
      if (!s.textures.exists(key)) return;
      const src = s.textures.get(key).getSourceImage() as { width: number };
      const scale = (64 / src.width) * 0.5;
      const n = this.track(s.add.image(x + dx, y, key).setOrigin(0.5, 0.9).setScale(scale).setFlipX(flip).setDepth(depth));
      s.tweens.add({ targets: n, x: x + dx * 0.35, duration: 260, yoyo: true, repeat: -1, repeatDelay: 700, delay: i * 480, ease: 'Cubic.easeOut' });
      s.tweens.add({ targets: n, y: y - 4, duration: 180, yoyo: true, repeat: -1, repeatDelay: 1500, delay: 900 + i * 300 });
    });
  }

  private walker(i: number, list: LifeBuilding[]): void {
    const s = this.scene;
    const v = s.add.image(0, 0, `fx.villager.${i % 4}`).setOrigin(0.5, 26 / 30).setScale(0.9 / HD_SCALE);
    this.track(v);
    const front = (b: LifeBuilding) => {
      const c = footprintCenter(b.x, b.y, b.size);
      return { x: c.x + ((b.size * TILE_W) / 2) * 0.25 * (Math.random() - 0.5), y: c.y + ((b.size * TILE_H) / 2) * 0.95 };
    };
    let at = front(list[(i * 3) % list.length]);
    v.setPosition(at.x, at.y);
    const step = () => {
      if (!v.active) return;
      const to = front(list[Math.floor(Math.random() * list.length)]);
      const dist = Math.hypot(to.x - at.x, to.y - at.y);
      v.setFlipX(to.x < at.x);
      s.tweens.add({
        targets: v, x: to.x, y: to.y, duration: Math.max(1500, (dist / 22) * 1000), delay: 800 + Math.random() * 2500,
        onUpdate: () => {
          const t = worldToTile(v.x, v.y);
          v.setDepth(depthFor(t.tx - 0.5, t.ty - 0.5, 1) + 1);
        },
        onComplete: () => { at = to; step(); },
      });
    };
    s.tweens.add({ targets: v, scaleY: { from: 0.9 / HD_SCALE, to: 0.84 / HD_SCALE }, duration: 180, yoyo: true, repeat: -1 });
    step();
  }

  private scheduleBird(): void {
    const s = this.scene;
    const n = Math.max(1, Math.round(3 * quality().particleScale));
    this.birdTimer = s.time.addEvent({
      delay: 7000 / n, loop: true, startAt: 5000 / n,
      callback: () => {
        const mb = mapBounds(this.mapSize);
        const ltr = Math.random() < 0.5;
        const y0 = mb.y + mb.height * (0.1 + Math.random() * 0.6);
        const x0 = ltr ? mb.x - 200 : mb.x + mb.width + 200;
        const x1 = ltr ? mb.x + mb.width + 200 : mb.x - 200;
        const b = this.take('fx.bird', x0, y0).setScale(1.2 / HD_SCALE).setFlipX(!ltr).setDepth(this.overlayDepth - 20).setAlpha(0.85);
        s.tweens.add({ targets: b, scaleY: 0.4 / HD_SCALE, duration: 130, yoyo: true, repeat: -1 });
        s.tweens.add({ targets: b, x: x1, y: y0 - 120 + Math.random() * 80, duration: 9000 + Math.random() * 4000, onComplete: () => this.give(b) });
      },
    });
  }

  /** Soft cloud shadows sliding over the plateau (ground only: below every building). */
  private cloudShadows(): void {
    const s = this.scene;
    artTexture(s, 'fx.cloudshadow', 128, 64, 32, (ctx) => {
      for (const [x, y, r] of [[-26, 4, 26], [8, -4, 30], [34, 6, 22]] as const) {
        const g = ctx.createRadialGradient(x, y, 2, x, y, r);
        g.addColorStop(0, 'rgba(20,30,50,0.9)');
        g.addColorStop(1, 'rgba(20,30,50,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.3, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 1);
    const mb = mapBounds(this.mapSize);
    const n = Math.max(1, Math.round(2 * quality().particleScale));
    for (let i = 0; i < n; i++) {
      const y = mb.y + mb.height * (0.3 + i * 0.35);
      const c = s.add.image(mb.x - 400, y, 'fx.cloudshadow').setScale(7, 5).setAlpha(0.14).setDepth(-9);
      s.tweens.add({ targets: c, x: mb.x + mb.width + 400, y: y + 160, duration: 70000, delay: i * 30000, repeat: -1 });
    }
  }

  /** A few sakura petals drifting down over the village. */
  private petals(): void {
    const s = this.scene;
    artTexture(s, 'fx.petal', 8, 6, 3, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 2, 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#f7c6d4';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-0.8, -0.5, 1.4, 0.7, 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff0f4';
      ctx.fill();
    }, HD_SCALE);
    const mb = mapBounds(this.mapSize);
    const n = Math.max(2, Math.round(8 * quality().particleScale));
    for (let i = 0; i < n; i++) {
      const p = s.add.image(0, 0, 'fx.petal').setScale(1.4 / HD_SCALE).setDepth(this.overlayDepth - 30).setAlpha(0.9);
      const fly = () => {
        const x = mb.x + Math.random() * mb.width;
        const y = mb.y + Math.random() * mb.height * 0.6;
        p.setPosition(x, y);
        s.tweens.add({ targets: p, x: x + 160 + Math.random() * 120, y: y + 220 + Math.random() * 120, angle: 360 * (Math.random() < 0.5 ? 1 : -1), duration: 7000 + Math.random() * 5000, delay: Math.random() * 3000, onComplete: fly });
      };
      fly();
    }
  }

  private clear(): void {
    for (const t of this.timers) t.remove(false);
    this.timers = [];
    for (const o of this.objs) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objs = [];
  }

  destroy(): void {
    this.clear();
    this.birdTimer?.remove(false);
    this.birdTimer = null;
    for (const im of this.pooled) if (im.scene) {
      this.scene.tweens.killTweensOf(im);
      im.destroy();
    }
    this.pooled = [];
    this.spare.clear();
  }
}
