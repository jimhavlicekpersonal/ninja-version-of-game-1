/**
 * Smooth art when the camera shrinks it (2026-11-24 art polish).
 *
 * Code art is painted at 1.5-3x (`render/assets.ts`) and the camera shows it far smaller: the
 * village zooms out to ~0.45 and battles to 0.14, so a building texture is often drawn at a third
 * of its size or less. Plain bilinear filtering then reads only 4 of the 9-50 texels behind each
 * screen pixel: outlines step and break up, thin marks flicker while panning. Mipmaps (pre-shrunk
 * copies the GPU blends between) fix that.
 *
 * WebGL1 mipmaps only power-of-two textures and Phaser 3 only asks for them there, so none of the
 * art had any. WebGL2 mipmaps any size: `webgl2Context` makes the game's context WebGL2 where the
 * browser offers it (Phaser 3 runs on it unchanged, its GLSL 1.00 shaders included), and
 * `smoothArtTextures` builds mipmaps for every image texture as it is added. Without WebGL2, or
 * with `?gl=1`, nothing changes (the old look).
 *
 * Only image textures (painted art, the island, real art from the manifest) are mipmapped: they
 * are uploaded once. Canvas, dynamic and render textures and text are re-uploaded at level 0 only,
 * which would leave stale levels, so they keep plain bilinear filtering. After a lost context
 * Phaser re-creates every texture with its stored (non-mipmap) filter, so a texture can never be
 * left incomplete (black); the mipmaps are built again once every restore handler has run.
 *
 * Memory: a full mipmap chain is a third more GPU memory per texture. `mipFactor` lets the texture
 * sums and the building budget (`render/textureBudget.ts`) count it, so building art stays within
 * the same budget and the island costs a third more. The low quality profile has no mipmaps
 * (`quality().mipmaps`, STB-N3): cheap phones keep the old memory use.
 */

import Phaser from 'phaser';
import { quality } from './quality';

/** GPU bytes of a mipmapped texture per byte of its full-size level (1 + 1/4 + 1/16 + ... = 4/3). */
const MIP_OVERHEAD = 4 / 3;

let active = false;
const mipmapped = new WeakSet<Phaser.Textures.TextureSource>();

/** How much GPU memory a newly added image texture takes per byte of its pixels (4/3 with mipmaps, else 1). */
export function mipFactor(): number {
  return active ? MIP_OVERHEAD : 1;
}

/** Bytes this texture source takes on the GPU, mipmaps included. */
export function gpuBytes(src: Phaser.Textures.TextureSource): number {
  const px = src.width * src.height * 4;
  return mipmapped.has(src) ? Math.round(px * MIP_OVERHEAD) : px;
}

/** Smoothing is on unless the address says `?gl=1` (the WebGL1 look, for comparison and diagnosis). */
function wanted(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('gl') !== '1';
}

/**
 * A WebGL2 context on `canvas` with the attributes Phaser would ask for (`WebGLRenderer`), or null
 * (no WebGL2, `?gl=1`, or the browser refused): then Phaser makes its own WebGL1 context as before.
 */
export function webgl2Context(canvas: HTMLCanvasElement, o: { antialias: boolean; powerPreference: WebGLPowerPreference }): WebGL2RenderingContext | null {
  if (!wanted() || typeof WebGL2RenderingContext === 'undefined') return null;
  try {
    return canvas.getContext('webgl2', {
      alpha: false,
      desynchronized: false,
      depth: true,
      antialias: o.antialias,
      premultipliedAlpha: true,
      stencil: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: o.powerPreference,
      preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }
}

function isWebGL2(gl: unknown): gl is WebGL2RenderingContext {
  return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
}

/** Image textures only: uploaded once, never re-uploaded at level 0 (see the module note). */
function eligible(texture: Phaser.Textures.Texture): boolean {
  if (texture.key.startsWith('__')) return false;
  if (texture instanceof Phaser.Textures.CanvasTexture || texture instanceof Phaser.Textures.DynamicTexture) return false;
  return true;
}

function mipmap(gl: WebGL2RenderingContext, texture: Phaser.Textures.Texture): void {
  if (!eligible(texture)) return;
  for (const src of texture.source) {
    const wrapper = src.glTexture;
    const image = src.image as unknown;
    if (!wrapper?.webGLTexture || src.isRenderTexture || src.width < 2 || src.height < 2) continue;
    if (!(image instanceof HTMLImageElement || image instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap))) continue;
    // As Phaser's own uploads do: unit 0, then the previous binding back.
    gl.activeTexture(gl.TEXTURE0);
    const previous = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    gl.bindTexture(gl.TEXTURE_2D, wrapper.webGLTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
    // Trilinear: blends the two nearest sizes, so zooming never pops between them. The wrapper's
    // stored filter stays LINEAR, which is what a re-created (restored) texture gets.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, previous);
    mipmapped.add(src);
  }
}

/**
 * Mipmap every image texture added from now on (and those already there) when the game runs on
 * WebGL2 and the quality profile asks for it (never on low). Call right after `new Phaser.Game`,
 * before any art is painted or loaded.
 */
export function smoothArtTextures(game: Phaser.Game, mipmaps = quality().mipmaps): void {
  const gl = () => {
    const r = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer | undefined;
    return r && r.type === Phaser.WEBGL && isWebGL2(r.gl) && !r.gl.isContextLost() ? r.gl : null;
  };
  active = false;
  if (!mipmaps || !game.config.context || !isWebGL2(game.config.context)) return;
  active = true;
  game.textures.on(Phaser.Textures.Events.ADD, (_key: string, texture: Phaser.Textures.Texture) => {
    const g = gl();
    if (g) mipmap(g, texture);
  });
  const all = () => {
    const g = gl();
    if (!g) return;
    for (const texture of Object.values(game.textures.list)) mipmap(g, texture);
  };
  game.events.once(Phaser.Core.Events.READY, () => {
    all();
    // Restored context: Phaser re-created every texture with LINEAR filtering; other restore
    // handlers (`releaseCpuCopy`) re-upload repainted art, so build the mipmaps after them all.
    game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => setTimeout(all, 0));
  });
}
