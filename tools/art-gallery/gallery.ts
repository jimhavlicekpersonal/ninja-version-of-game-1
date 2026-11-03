/** Dev-only preview of every painter in src/presentation/art/ninja.ts (ART compartment tool). */
import buildings from '../../src/gameplay/data/buildings.json';
import { buildingPainters, paintConstruction, paintJam, paintPuff, paintRubble, paintSmokeLobe, projectileArt, troopArt, registerWarriorArt, type Tier } from '../../src/presentation/art/ninja';
import { WARRIORS } from '../../src/gameplay/sim/progression';
import { ICON_SIZE, warriorIconArt } from '../../src/presentation/art/warriorIcons';
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
  const row = section(`${def.name} (${type}, ${def.size}x${def.size}, ${def.levels.length} levels)`);
  const tiers: Tier[] = def.levels.length > 1 ? [1, 2, 3] : [1];
  const w = def.size * TILE_W;
  const h = def.size * TILE_H + p.extra;
  for (const t of tiers) figure(row, `tier ${t}`, w, h, h - (def.size * TILE_H) / 2, (ctx) => p.paint(ctx, def.size, t));
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
