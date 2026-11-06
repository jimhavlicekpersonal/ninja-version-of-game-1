/**
 * The production build ships a smaller Phaser (src/presentation/render/phaserBuild.js, client
 * re-audit item 5): dev and tests use the full package, so a feature the custom build leaves out
 * would only break the shipped game. These checks keep the scenes inside what it includes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url).pathname;
const BUILD = readFileSync(join(ROOT, 'src/presentation/render/phaserBuild.js'), 'utf8');
const sources = ['src/presentation/render', 'src/presentation/ui', 'src']
  .flatMap((dir) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.ts')).map((f) => join(ROOT, dir, f)))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** `scene.add.<kind>` → the factory file that registers it. */
const FACTORY: Record<string, string> = {
  image: 'image/ImageFactory',
  graphics: 'graphics/GraphicsFactory',
  text: 'text/TextFactory',
  container: 'container/ContainerFactory',
  particles: 'particles/ParticleEmitterFactory',
  sprite: 'sprite/SpriteFactory',
  layer: 'layer/LayerFactory',
};

describe('custom Phaser build', () => {
  it('registers every game object the game adds', () => {
    const kinds = new Set([...sources.matchAll(/\.add\.([a-zA-Z]+)\(/g)].map((m) => m[1]).filter((k) => k !== 'existing'));
    expect(kinds.size).toBeGreaterThan(2);
    for (const kind of kinds) {
      expect(FACTORY[kind], `scene.add.${kind} is not in phaserBuild.js`).toBeDefined();
      expect(BUILD).toContain(`phaser/src/gameobjects/${FACTORY[kind]}`);
    }
  });

  it('the game uses no module the build leaves out', () => {
    expect(sources).not.toMatch(/\.physics\.|\.sound\.(add|play)|\.add\.(tilemap|bitmapText|video|rope|mesh|shader)\(|\.make\.tilemap/);
    // Only images are loaded through Phaser (real art from public/art/manifest.json).
    const loads = new Set([...sources.matchAll(/\.load\.([a-zA-Z]+)\(/g)].map((m) => m[1]));
    for (const l of loads) expect(['image', 'start', 'once', 'on'], `this.load.${l}`).toContain(l);
  });

  it('every Phaser namespace the game names is in the build', () => {
    const used = new Set([...sources.matchAll(/\bPhaser\.([A-Z][A-Za-z]*)/g)].map((m) => m[1]));
    used.delete('Types'); // types only
    used.delete('AUTO'); // constants merged from phaser/src/const
    used.delete('CANVAS');
    expect(readFileSync(join(ROOT, 'node_modules/phaser/src/const.js'), 'utf8')).toMatch(/\bCANVAS: 1\b/);
    for (const ns of used) expect(BUILD, `Phaser.${ns}`).toMatch(new RegExp(`\\b${ns}\\b`));
  });

  it('is used for production builds only', () => {
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/command === 'build' && !process\.env\.VITEST/);
    expect(config).toContain("WEBGL_DEBUG: false"); // keeps spector.js out
  });
});
