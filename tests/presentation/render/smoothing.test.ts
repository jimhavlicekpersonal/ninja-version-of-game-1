import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Phaser needs a browser: only the names smoothing.ts reads.
class CanvasTexture {}
class DynamicTexture {}
vi.mock('phaser', () => ({
  default: {
    WEBGL: 2,
    Textures: { CanvasTexture, DynamicTexture, Events: { ADD: 'addtexture' } },
    Core: { Events: { READY: 'ready' } },
    Renderer: { Events: { RESTORE_WEBGL: 'restorewebgl' } },
  },
}));

class FakeGL2 {
  TEXTURE0 = 1;
  TEXTURE_2D = 2;
  TEXTURE_BINDING_2D = 3;
  TEXTURE_MIN_FILTER = 4;
  LINEAR_MIPMAP_LINEAR = 5;
  calls: string[] = [];
  bound: unknown = 'previous';
  lost = false;
  isContextLost() {
    return this.lost;
  }
  activeTexture() {}
  getParameter() {
    return this.bound;
  }
  bindTexture(_t: number, tex: unknown) {
    this.bound = tex;
  }
  generateMipmap() {
    this.calls.push(`mip:${String(this.bound)}`);
  }
  texParameteri(_t: number, p: number, v: number) {
    this.calls.push(`param:${p}=${v}`);
  }
}
class FakeImage {}
class FakeCanvas {}

vi.stubGlobal('WebGL2RenderingContext', FakeGL2);
vi.stubGlobal('HTMLImageElement', FakeImage);
vi.stubGlobal('HTMLCanvasElement', FakeCanvas);
const { gpuBytes, mipFactor, smoothArtTextures } = await import('../../../src/presentation/render/smoothing');

function emitter() {
  const handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  return {
    on(e: string, fn: (...a: unknown[]) => void) {
      handlers.set(e, [...(handlers.get(e) ?? []), fn]);
    },
    once(e: string, fn: (...a: unknown[]) => void) {
      this.on(e, fn);
    },
    emit(e: string, ...a: unknown[]) {
      for (const fn of handlers.get(e) ?? []) fn(...a);
    },
  };
}

function source(name: string, image: unknown, w = 64, h = 32) {
  return { width: w, height: h, image, isRenderTexture: false, glTexture: { webGLTexture: name } };
}

function fakeGame(context: unknown) {
  const gl = new FakeGL2();
  const textures = Object.assign(emitter(), { list: {} as Record<string, unknown> });
  const events = emitter();
  const renderer = Object.assign(emitter(), { type: 2, gl });
  return { gl, textures, events, renderer, game: { config: { context }, textures, events, renderer } as never };
}

afterEach(() => vi.useRealTimers());

describe('smoothArtTextures (art polish: mipmaps on WebGL2)', () => {
  it('changes nothing without a WebGL2 context (WebGL1, ?gl=1)', () => {
    const f = fakeGame(null);
    smoothArtTextures(f.game);
    f.textures.emit('addtexture', 'building.x', { key: 'building.x', source: [source('t', new FakeCanvas())] });
    expect(f.gl.calls).toEqual([]);
    expect(mipFactor()).toBe(1);
  });

  it('mipmaps painted and loaded images, restores the binding, and counts the extra third', () => {
    const f = fakeGame(new FakeGL2());
    smoothArtTextures(f.game);
    const painted = source('painted', new FakeCanvas(), 300, 150);
    f.textures.emit('addtexture', 'building.keep.lv1', { key: 'building.keep.lv1', source: [painted] });
    f.textures.emit('addtexture', 'troop.ninja', { key: 'troop.ninja', source: [source('loaded', new FakeImage())] });
    expect(f.gl.calls).toEqual(['mip:painted', 'param:4=5', 'mip:loaded', 'param:4=5']);
    expect(f.gl.bound).toBe('previous');
    expect(mipFactor()).toBeCloseTo(4 / 3);
    expect(gpuBytes(painted as never)).toBe(Math.round(300 * 150 * 4 * (4 / 3)));
  });

  it('leaves re-uploaded textures alone: canvas, dynamic, render textures, internal keys, 1 px', () => {
    const f = fakeGame(new FakeGL2());
    smoothArtTextures(f.game);
    f.textures.emit('addtexture', 'c', Object.assign(new CanvasTexture(), { key: 'c', source: [source('c', new FakeCanvas())] }));
    f.textures.emit('addtexture', 'd', Object.assign(new DynamicTexture(), { key: 'd', source: [source('d', new FakeCanvas())] }));
    f.textures.emit('addtexture', 'r', { key: 'r', source: [{ ...source('r', new FakeCanvas()), isRenderTexture: true }] });
    f.textures.emit('addtexture', '__WHITE', { key: '__WHITE', source: [source('w', new FakeImage())] });
    f.textures.emit('addtexture', 'dot', { key: 'dot', source: [source('dot', new FakeImage(), 1, 1)] });
    const plain = source('p', new FakeImage());
    f.textures.emit('addtexture', 'p', { key: 'p', source: [plain] });
    expect(f.gl.calls).toEqual(['mip:p', 'param:4=5']);
    expect(gpuBytes({ width: 10, height: 10 } as never)).toBe(400);
  });

  it('builds the mipmaps again after a restored context, once the other restore handlers ran', () => {
    vi.useFakeTimers();
    const f = fakeGame(new FakeGL2());
    f.textures.list = { ground: { key: 'ground', source: [source('ground', new FakeCanvas())] } };
    smoothArtTextures(f.game);
    f.events.emit('ready');
    expect(f.gl.calls).toEqual(['mip:ground', 'param:4=5']);
    f.gl.calls = [];
    f.renderer.emit('restorewebgl');
    expect(f.gl.calls).toEqual([]);
    vi.runAllTimers();
    expect(f.gl.calls).toEqual(['mip:ground', 'param:4=5']);
  });

  it('does nothing while the context is lost', () => {
    const f = fakeGame(new FakeGL2());
    smoothArtTextures(f.game);
    f.gl.lost = true;
    f.textures.emit('addtexture', 'p', { key: 'p', source: [source('p', new FakeImage())] });
    expect(f.gl.calls).toEqual([]);
  });

  it('the low quality profile never mipmaps: mipFactor() stays 1 (STB-N3)', async () => {
    const { resolveQuality } = await import('../../../src/presentation/render/quality');
    const low = resolveQuality('?quality=low', 'auto', {});
    const high = resolveQuality('?quality=high', 'auto', {});
    expect(low.mipmaps).toBe(false);
    expect(high.mipmaps).toBe(true);
    // A WebGL2 game first (mipmaps on), then a low-profile start in the same module.
    smoothArtTextures(fakeGame(new FakeGL2()).game, high.mipmaps);
    expect(mipFactor()).toBeCloseTo(4 / 3);
    const f = fakeGame(new FakeGL2());
    smoothArtTextures(f.game, low.mipmaps);
    expect(mipFactor()).toBe(1);
    const painted = source('painted', new FakeCanvas(), 300, 150);
    f.textures.emit('addtexture', 'building.keep.lv1', { key: 'building.keep.lv1', source: [painted] });
    f.events.emit('ready');
    expect(f.gl.calls).toEqual([]);
    expect(gpuBytes(painted as never)).toBe(300 * 150 * 4);
  });

  it('by default follows this session\'s quality profile', () => {
    const src = readFileSync('src/presentation/render/smoothing.ts', 'utf8');
    expect(src).toMatch(/mipmaps = quality\(\)\.mipmaps/);
  });
});
