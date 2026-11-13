import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { buildLanguageAssets, languageBootScript, measureLanguageBuild } from './tools/i18n/build.mjs';

buildLanguageAssets();

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/**
 * Public files the service worker never precaches (device F5, M4): the 512 px icons and the Apple
 * touch icon are read by the operating system when the game is installed, never by the page, and
 * were ~315 KB of every update on a slow link.
 */
const NOT_PRECACHED = new Set(['icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']);

/** Emits sw.js with the list of built files to precache (no plugin dependency needed). */
function serviceWorker(): Plugin {
  return {
    name: 'tk-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const allPublic = listFiles('public').map((p) => relative('public', p).split('\\').join('/'));
      const languageMeta = JSON.parse(readFileSync('locales/availability.json', 'utf8')) as Record<string, { ready: boolean; path?: string }>;
      const codes = new Set(Object.keys(languageMeta));
      // A browser caches its own text/pages; native packaging still includes all completed packs.
      const publicFiles = allPublic.filter(p => !p.startsWith('lang/') && !codes.has(p.split('/')[0]) && !NOT_PRECACHED.has(p));
      // Content hashes of the public files: an unchanged file is copied from the previous build's cache (device F5).
      const hashes = Object.fromEntries(allPublic.map((p) => [p, createHash('sha256').update(readFileSync(join('public', p))).digest('hex').slice(0, 16)]));
      const languageFiles = Object.fromEntries(Object.entries(languageMeta).filter(([, m]) => m.ready).map(([code, m]) => [code, [...(m.path ? [`./${m.path}`] : []), ...allPublic.filter(p => p.startsWith(code + '/')).map(p => `./${p}`)]]));
      const files = ['./', ...[...built, ...publicFiles].map((f) => `./${f}`)];
      const source = readFileSync('src/backend/pwa/sw.template.js', 'utf8')
        .replace('__BUILD_ID__', Date.now().toString(36))
        .replace('__PRECACHE__', JSON.stringify(files))
        .replace('/*__LANGUAGE_FILES__*/ {}', JSON.stringify(languageFiles))
        .replace('/*__HASHES__*/ {}', JSON.stringify(hashes));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/**
 * The start-up guard (src/backend/pwa/boot.js: polyfills, feature check, "Couldn't load" with
 * Retry) runs inline before anything else, so it works even when the game's script never arrives.
 */
function bootGuard(): Plugin {
  return {
    name: 'tk-boot-guard',
    transformIndexHtml() {
      const source = languageBootScript() + '\n' + readFileSync('src/backend/pwa/boot.js', 'utf8');
      return [{ tag: 'script', children: source, injectTo: 'head-prepend' }];
    },
  };
}

/**
 * The game's stylesheet does not block the first paint (device F7): on a 2G link the page stayed
 * blank until the 13 KB (gzip) stylesheet arrived, although the splash needs only the few rules
 * inlined in index.html. It is loaded as `media="print"` and switched to `all` when it arrives (no
 * render block, works back to iOS 15); `main.ts` waits for it before the splash fades. The game's
 * module is already preloaded (Vite's `modulepreload` for the Phaser chunk, the entry is a module
 * script in the head).
 */
function nonBlockingStyles(): Plugin {
  return {
    name: 'tk-non-blocking-styles',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/<link rel="stylesheet"([^>]*?)href="(\.\/assets\/[^"]+\.css)"([^>]*)>/g, (_m, a: string, href: string, b: string) => `<link rel="stylesheet"${a}href="${href}"${b.replace(/\s*\/?$/, '')} media="print" onload="this.media='all'">`);
      },
    },
  };
}

/**
 * Phaser's sources carry webpack-style feature flags (`if (typeof WEBGL_RENDERER)`). The custom
 * build (`src/presentation/render/phaserBuild.js`) compiles them with the values Phaser's own
 * dist build uses, minus sound: both renderers, no WebGL debug (it would pull in spector.js),
 * no Camera3D / Facebook plugins.
 */
const PHASER_FLAGS: Record<string, boolean> = {
  CANVAS_RENDERER: true,
  WEBGL_RENDERER: true,
  WEBGL_DEBUG: false,
  EXPERIMENTAL: false,
  PLUGIN_3D: false,
  PLUGIN_CAMERA3D: false,
  PLUGIN_FBINSTANT: false,
  FEATURE_SOUND: false,
};

function phaserFlags(): Plugin {
  const pattern = new RegExp(`typeof (${Object.keys(PHASER_FLAGS).join('|')})\\b`, 'g');
  return {
    name: 'tk-phaser-flags',
    apply: 'build',
    transform(code, id) {
      if (!/[\\/]node_modules[\\/]phaser[\\/]src[\\/]/.test(id) || !code.includes('typeof ')) return null;
      const out = code.replace(pattern, (_m, flag: string) => String(PHASER_FLAGS[flag]));
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig(({ command }) => ({
  // Relative paths so the same build works on GitHub Pages, any static host, and later inside Capacitor.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2020',
    // Phaser changes only on a dependency update, so it sits in its own chunk that stays cached
    // across game releases (state-of-the-game quality 17); the game code is the small, changing part.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser[\\/]|render[\\/]phaserBuild\.js$/, priority: 10 }],
        },
      },
    },
  },
  // Production ships a smaller Phaser (no physics, sound, tilemaps: phaserBuild.js); dev and tests use the full package.
  resolve: command === 'build' && !process.env.VITEST ? { alias: [{ find: /^phaser$/, replacement: fileURLToPath(new URL('./src/presentation/render/phaserBuild.js', import.meta.url)) }] } : {},
  plugins: [bootGuard(), nonBlockingStyles(), serviceWorker(), phaserFlags(), { name: 'tk-language-sizes', apply: 'build', closeBundle() { measureLanguageBuild(); } }],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
