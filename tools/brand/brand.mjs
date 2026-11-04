/**
 * Kagemura brand art: the app icon and splash screens, drawn as SVG and rendered to every size the
 * PWA, iOS and Android builds use. The mark is the Clan Keep silhouetted against a vermilion sun,
 * rising out of the cloud sea between two mountains (original artwork, palette from docs/art).
 *
 *   npm run brand            write every PNG
 *   npm run brand -- --svg   also write the master SVGs to docs/art/brand/
 *   npm run brand -- --only=icon-512 --out=/tmp/preview   render matching targets into another folder
 *
 * Rendering uses Playwright's Chromium (a dev tool, not a game dependency). If it is missing:
 * `npx playwright install chromium`, or point NODE_PATH at a global install.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INK = '#26303d';

/** Hip roof with upturned tips; eave at y, apex `rise` above. Returns an SVG path. */
function roof(cx, y, half, rise, top) {
  const L = cx - half;
  const R = cx + half;
  return `M${L},${y - 10} Q${L + half * 0.25},${y - rise * 0.15} ${cx - top},${y - rise} L${cx + top},${y - rise} Q${R - half * 0.25},${y - rise * 0.15} ${R},${y - 10} Q${cx},${y + 6} ${L},${y - 10} Z`;
}

/** Three kunai in a ring: the clan crest. */
function crest(cx, cy, r, color) {
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${r * 0.2}"/>`;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const p = (ang, k) => `${(cx + Math.cos(ang) * r * k).toFixed(1)},${(cy + Math.sin(ang) * r * k).toFixed(1)}`;
    s += `<path d="M${p(a, 0.15)} L${p(a + 0.25, 0.75)} L${p(a, 0.95)} L${p(a - 0.25, 0.75)} Z" fill="${color}"/>`;
  }
  return s;
}

/** Soft cloud bank: overlapping lobes along a line. */
function clouds(y, seed, opacity = 1) {
  let s = '';
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let x = -60; x < 1100; x += 70 + rnd() * 40) {
    const rx = 80 + rnd() * 60;
    const ry = 34 + rnd() * 22;
    const yy = y + (rnd() - 0.5) * 24;
    s += `<ellipse cx="${x.toFixed(0)}" cy="${yy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}" fill="url(#cloud)" opacity="${opacity}"/>`;
  }
  return s;
}

const DEFS = `
  <radialGradient id="sky" cx="0.5" cy="0.38" r="0.75">
    <stop offset="0" stop-color="#5b6a86"/><stop offset="0.5" stop-color="#36425b"/><stop offset="1" stop-color="#1d2537"/>
  </radialGradient>
  <radialGradient id="sun" cx="0.42" cy="0.36" r="0.7">
    <stop offset="0" stop-color="#f5906f"/><stop offset="0.55" stop-color="#d4503a"/><stop offset="1" stop-color="#a82f20"/>
  </radialGradient>
  <radialGradient id="sunglow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0.6" stop-color="#e9b44c" stop-opacity="0.35"/><stop offset="1" stop-color="#e9b44c" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="mtn" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a5874"/><stop offset="1" stop-color="#2a3448"/>
  </linearGradient>
  <linearGradient id="roofg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a5870"/><stop offset="1" stop-color="#26303d"/>
  </linearGradient>
  <linearGradient id="wall" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ddd2bd"/>
  </linearGradient>
  <linearGradient id="stone" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#b4b9c1"/><stop offset="1" stop-color="#7d838e"/>
  </linearGradient>
  <radialGradient id="cloud" cx="0.4" cy="0.3" r="0.7">
    <stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e6ebf6"/><stop offset="1" stop-color="#c3cce0"/>
  </radialGradient>`;

/** The cloud sea along the bottom; `top` is where the keep's base meets it. */
function cloudSea(top = 880) {
  return clouds(top, 7, 0.92) + clouds(top + 70, 23) + `<rect x="-40" y="${top + 80}" width="1104" height="${1100 - top}" fill="#e6ebf6"/>`;
}

/** The mark in a 1024 x 1024 box (without the cloud sea when `sea` is false). */
function mark(sea = true) {
  const cx = 512;
  let s = '';
  s += `<circle cx="${cx}" cy="455" r="350" fill="url(#sunglow)"/>`;
  s += `<circle cx="${cx}" cy="455" r="292" fill="url(#sun)" stroke="#7a1f16" stroke-width="6"/>`;
  // Two mountains behind the keep.
  s += `<path d="M-20,860 L200,560 Q215,545 232,560 L470,860 Z" fill="url(#mtn)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
  s += `<path d="M560,860 L800,585 Q815,570 830,585 L1044,860 Z" fill="url(#mtn)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
  s += `<path d="M200,560 L168,604 L190,596 L208,612 L230,594 L268,606 L232,560 Q216,546 200,560 Z" fill="#e9eef6"/>`;
  s += `<path d="M800,585 L763,628 L786,620 L804,636 L826,618 L863,628 L830,585 Q815,571 800,585 Z" fill="#e9eef6"/>`;
  // The Keep: stone base, three storeys, three roofs.
  s += `<path d="M352,770 L672,770 L700,862 L324,862 Z" fill="url(#stone)" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
  s += `<path d="M340,800 L684,800 M332,832 L692,832" stroke="${INK}" stroke-opacity="0.35" stroke-width="4"/>`;
  s += `<rect x="388" y="676" width="248" height="96" fill="url(#wall)" stroke="${INK}" stroke-width="7"/>`;
  s += crest(cx, 724, 30, '#c8402f');
  s += `<rect x="420" y="708" width="26" height="30" fill="#ffcf70" stroke="${INK}" stroke-width="4"/><rect x="578" y="708" width="26" height="30" fill="#ffcf70" stroke="${INK}" stroke-width="4"/>`;
  s += `<path d="${roof(cx, 690, 212, 66, 96)}" fill="url(#roofg)" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
  s += `<rect x="428" y="586" width="168" height="48" fill="url(#wall)" stroke="${INK}" stroke-width="7"/>`;
  s += `<rect x="498" y="598" width="28" height="26" fill="#ffcf70" stroke="${INK}" stroke-width="4"/>`;
  s += `<path d="${roof(cx, 598, 158, 54, 62)}" fill="url(#roofg)" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
  s += `<rect x="462" y="500" width="100" height="46" fill="url(#wall)" stroke="${INK}" stroke-width="7"/>`;
  s += `<path d="${roof(cx, 512, 118, 92, 4)}" fill="url(#roofg)" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
  s += `<path d="M${cx},420 L${cx},384" stroke="#e9b44c" stroke-width="9" stroke-linecap="round"/><circle cx="${cx}" cy="378" r="11" fill="#e9b44c" stroke="${INK}" stroke-width="4"/>`;
  // Gold caps on the eave tips.
  for (const [x, y] of [[300, 680], [724, 680], [354, 588], [670, 588], [394, 502], [630, 502]]) s += `<circle cx="${x}" cy="${y}" r="8" fill="#e9b44c" stroke="${INK}" stroke-width="3"/>`;
  if (sea) s += cloudSea();
  return s;
}

function iconSvg(size, { inset = 1, background = true } = {}) {
  const k = inset;
  const off = (1024 * (1 - k)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024"><defs>${DEFS}</defs>` +
    (background ? `<rect width="1024" height="1024" fill="url(#sky)"/>` : '') +
    `<g transform="translate(${off} ${off}) scale(${k})">${mark(k === 1)}</g>` +
    // Inset marks (maskable, Android adaptive) still get a cloud sea that runs to the edges.
    (k === 1 ? '' : cloudSea(off + 880 * k)) +
    `</svg>`;
}

function splashSvg(w, h) {
  const fontFile = (f) => readFileSync(join(ROOT, 'src/presentation/ui/fonts', f)).toString('base64');
  const body = fontFile('mplus1-latin-var.woff2');
  const display = fontFile('dela-gothic-one-latin-400.woff2');
  const m = Math.min(w, h);
  const markSize = m * 0.42;
  const mx = (w - markSize) / 2;
  const my = h / 2 - markSize * 0.68;
  const title = m * 0.085;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>${DEFS}
<radialGradient id="bg" cx="0.5" cy="0.42" r="0.8"><stop offset="0" stop-color="#3b4862"/><stop offset="1" stop-color="#151b28"/></radialGradient>
<clipPath id="disc"><circle cx="512" cy="512" r="500"/></clipPath>
<style>@font-face{font-family:'M PLUS 1';src:url(data:font/woff2;base64,${body}) format('woff2');font-weight:100 900;}@font-face{font-family:'Dela Gothic One';src:url(data:font/woff2;base64,${display}) format('woff2');font-weight:400;}</style>
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
<g transform="translate(${mx} ${my}) scale(${markSize / 1024})"><g clip-path="url(#disc)"><rect width="1024" height="1024" fill="url(#sky)"/>${mark()}</g>
<circle cx="512" cy="512" r="500" fill="none" stroke="#e9b44c" stroke-width="14"/></g>
<text x="${w / 2}" y="${my + markSize + title * 1.35}" text-anchor="middle" font-family="'Dela Gothic One', sans-serif" font-weight="400" font-size="${title * 0.92}" fill="#f7f0e1" letter-spacing="${title * 0.02}">Kagemura</text>
<text x="${w / 2}" y="${my + markSize + title * 2.05}" text-anchor="middle" font-family="'M PLUS 1', sans-serif" font-weight="800" font-size="${title * 0.36}" fill="#e9b44c" letter-spacing="${title * 0.12}">NINJA CLANS</text>
</svg>`;
}

const targets = [
  // PWA
  ['public/icons/icon-192.png', 192, 192, () => iconSvg(192)],
  ['public/icons/icon-512.png', 512, 512, () => iconSvg(512)],
  ['public/icons/icon-maskable-512.png', 512, 512, () => iconSvg(512, { inset: 0.8 })],
  ['public/icons/apple-touch-icon.png', 180, 180, () => iconSvg(180)],
  // iOS
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024, () => iconSvg(1024)],
  ...['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((f) => [`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, 2732, 2732, () => splashSvg(2732, 2732)]),
  // Android launcher icons (legacy square and round) and the adaptive foreground (art inside the safe zone).
  ...[['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]].flatMap(([d, s]) => [
    [`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, s, s, () => iconSvg(s)],
    [`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, s, s, () => iconSvg(s), true],
    [`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, s * 2.25, s * 2.25, () => iconSvg(s * 2.25, { inset: 0.62 })],
  ]),
  // Android splash screens.
  ['android/app/src/main/res/drawable/splash.png', 480, 320, () => splashSvg(480, 320)],
  ...[['mdpi', 480, 320], ['hdpi', 800, 480], ['xhdpi', 1280, 720], ['xxhdpi', 1600, 960], ['xxxhdpi', 1920, 1280]].flatMap(([d, a, b]) => [
    [`android/app/src/main/res/drawable-land-${d}/splash.png`, a, b, () => splashSvg(a, b)],
    [`android/app/src/main/res/drawable-port-${d}/splash.png`, b, a, () => splashSvg(b, a)],
  ]),
];

async function main() {
  if (process.argv.includes('--svg')) {
    mkdirSync(join(ROOT, 'docs/art/brand'), { recursive: true });
    writeFileSync(join(ROOT, 'docs/art/brand/icon.svg'), iconSvg(1024));
    writeFileSync(join(ROOT, 'docs/art/brand/splash.svg'), splashSvg(2732, 2732));
  }
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    // ESM import ignores NODE_PATH; CommonJS require honours it (a global install).
    try {
      ({ chromium } = createRequire(import.meta.url)('playwright'));
    } catch {
      chromium = null;
    }
  }
  if (!chromium) {
    console.error('Playwright is needed to render PNGs: npx playwright install chromium (or set NODE_PATH to a global install).');
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
  for (const [file, w, h, build, round] of targets) {
    if (only && !file.includes(only)) continue;
    await page.setViewportSize({ width: Math.round(w), height: Math.round(h) });
    const body = round ? `<div style="width:${w}px;height:${h}px;border-radius:50%;overflow:hidden">${build()}</div>` : build();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${body}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: Math.round(w), height: Math.round(h) } });
    const dest = out ? join(out, file.replace(/\//g, '_')) : join(ROOT, file);
    writeFileSync(dest, png);
    console.log('wrote', file, `${Math.round(w)}x${Math.round(h)}`);
  }
  await browser.close();
}

main();
