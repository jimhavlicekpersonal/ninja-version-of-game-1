/** Dev-only preview of every painter in src/presentation/art/ninja.ts (ART compartment tool). */
import buildings from '../../src/gameplay/data/buildings.json';
import { KAMON, kamon, paintBird, paintRuins, paintStreamer, paintVillager, buildingPainters, levelInfo, paintBuildingLevel, paintConstruction, paintJam, paintPuff, paintRubble, paintSmokeLobe, projectileArt, troopArt, registerWarriorArt } from '../../src/presentation/art/ninja';
import { WARRIORS } from '../../src/gameplay/sim/progression';
import { ICON_SIZE, warriorIconArt } from '../../src/presentation/art/warriorIcons';
import { chestSvg } from '../../src/presentation/art/chest';
import { SENSEI_EXPRESSIONS, senseiPortrait } from '../../src/presentation/art/portraits';
import { TILE_H, TILE_W } from '../../src/presentation/render/iso';

type Ctx = CanvasRenderingContext2D;
registerWarriorArt(WARRIORS.map((w) => ({ ...w, id: w.liveTroop ?? w.id })));
const out = document.getElementById('out')!;
const S = 1.5;

function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  out.append(h, row);
  return row;
}

function figure(row: HTMLElement, label: string, w: number, h: number, originY: number, paint: (ctx: Ctx) => void): void {
  const c = document.createElement('canvas');
  c.width = w * S * 2;
  c.height = h * S * 2;
  c.style.width = `${w * S}px`;
  c.style.height = `${h * S}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(S * 2, S * 2);
  ctx.translate(w / 2, originY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paint(ctx);
  const f = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  f.append(c, cap);
  row.append(f);
}

const defs = buildings as unknown as Record<string, { name: string; size: number; levels: unknown[] }>;
for (const [type, def] of Object.entries(defs)) {
  const p = buildingPainters[type];
  if (!p) continue;
  const max = def.levels.length;
  const row = section(`${def.name} (${type}, ${def.size}x${def.size}, ${max} levels, ${levelInfo(type, max, max).tiers} tiers)`);
  const w = def.size * TILE_W;
  const h = def.size * TILE_H + p.extra;
  // Every level is drawn: code art is painted per level (building.<type>.lv<level>).
  for (let lvl = 1; lvl <= max; lvl++) figure(row, `L${lvl} · t${levelInfo(type, lvl, max).tier}`, w, h, h - (def.size * TILE_H) / 2, (ctx) => paintBuildingLevel(ctx, type, def.size, lvl, max));
}
const troops = section('Warriors (troop.<id>)');
for (const [type, art] of Object.entries(troopArt)) figure(troops, type, art.w, art.h, art.h - 6, art.paint);
const icons = section('Warrior icons (icon.warrior.<id>): all 50');
for (const w of WARRIORS) {
  const art = warriorIconArt[w.id];
  if (art) figure(icons, `${w.name} - ${w.ability.name}`, art.w, art.h, ICON_SIZE / 2, art.paint);
}
const proj = section('Projectiles (projectile.<kind>)');
for (const [kind, art] of Object.entries(projectileArt)) figure(proj, kind, art.w, art.h, art.h / 2, art.paint);
const fx = section('Effects');
figure(fx, 'fx.puff', 40, 34, 17, paintPuff);
figure(fx, 'fx.smoke', 64, 64, 32, paintSmokeLobe);
figure(fx, 'fx.jam', 28, 28, 14, paintJam);
for (const size of [1, 2, 3, 4]) figure(fx, `construction.${size}`, size * TILE_W, size * TILE_H + 24 + size * 8, size * TILE_H + 24 + size * 8 - (size * TILE_H) / 2, (ctx) => paintConstruction(ctx, size));
for (const size of [2, 3]) figure(fx, `rubble.${size}`, size * TILE_W, size * TILE_H + 10, size * TILE_H + 10 - (size * TILE_H) / 2, (ctx) => paintRubble(ctx, size));
for (const size of [2, 3, 4]) for (const fam of ['keep', 'tower', 'store', 'house'] as const) figure(fx, `rubble.${size}.${fam}`, size * TILE_W, size * TILE_H + 40, size * TILE_H + 40 - (size * TILE_H) / 2, (ctx) => paintRuins(ctx, size, fam));
const amb = section('Village life (fx.bird, fx.villager.<n>, fx.streamer)');
figure(amb, 'fx.bird', 20, 12, 6, paintBird);
for (let v = 0; v < 4; v++) figure(amb, `fx.villager.${v}`, 28, 30, 26, (ctx) => paintVillager(ctx, v));
figure(amb, 'fx.streamer', 40, 14, 7, (ctx) => { ctx.translate(-18, 0); paintStreamer(ctx); });
const mon = section('Kamon (clan crests)');
for (const k of KAMON) figure(mon, k, 24, 24, 12, (ctx) => kamon(ctx, k, 0, 0, 10, '#26303d'));
function svgRow(title: string, items: [string, string][]): void {
  const row = section(title);
  for (const [label, svg] of items) {
    const f = document.createElement('figure');
    const box = document.createElement('div');
    box.style.cssText = 'width:112px;height:112px';
    box.innerHTML = svg;
    const cap = document.createElement('figcaption');
    cap.textContent = label;
    f.append(box, cap);
    row.append(f);
  }
}
svgRow('Daily chest (art/chest.ts)', [['closed', chestSvg('closed')], ['open', chestSvg('open')]]);
svgRow('Sensei Hoshi (art/portraits.ts)', SENSEI_EXPRESSIONS.map((e) => [e, senseiPortrait(e)]));
