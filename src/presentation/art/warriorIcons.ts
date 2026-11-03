/**
 * Warrior icons: one distinct, code-drawn badge for each of the 50 warriors in
 * src/gameplay/data/roster.json (asset key `icon.warrior.<id>`). Owned by the
 * ART compartment (see ./CLAUDE.md). Real art in public/art/manifest.json
 * under the same key wins.
 *
 * Every badge = role-coloured disc + tier ring + the warrior's chibi ninja +
 * a signature prop that shows its ability at 48 px. The ring is iron, bronze,
 * silver, gold or violet by tier; the "ridiculous" Veterans (tier 3) get a
 * dashed pink ring and a sparkle. No two warriors share a prop.
 *
 * Painters work in the ninja's local space (facing right, feet at y = 0,
 * head centre at y = -31, hand near (8, -17)).
 */
import { crest, INK, ninja, type NinjaLook } from './ninja';
import { darken, lighten, rgba, type Ctx } from './toolkit';

interface Pt {
  x: number;
  y: number;
}
type Paint = (ctx: Ctx) => void;

export interface WarriorIconDef {
  role: string;
  tier: number;
  ridiculous?: boolean;
  look: NinjaLook;
  /** One-line description of the signature prop (also used to check props are unique). */
  prop: string;
  /** Drawn behind the ninja (mounts, wings, auras). */
  back?: Paint;
  /** Drawn over the ninja (held items, hats). */
  front?: Paint;
  /** Opacity of the ninja itself (shadow warriors). */
  alpha?: number;
}

export interface WarriorIconArt {
  w: number;
  h: number;
  paint: (ctx: Ctx) => void;
}

// ------------------------------------------------------------------ helpers

const WASHI = '#f4ead6';
const VERMILION = '#c8402f';
const WOOD = '#8c5a34';
const WOOD_DARK = '#5e3a22';
const STEEL = '#d9dee6';
const IRON = '#8a8f99';
const GOLD = '#e9b44c';
const LEAF = '#5f9e4a';
const SKIN = '#f1c9a0';

function poly(ctx: Ctx, pts: Pt[], fill: string, lw = 1.1, stroke = INK): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string, lw = 1, stroke = INK): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, lw = 1, stroke = INK): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function line(ctx: Ctx, pts: Pt[], color: string, width: number): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function arc(ctx: Ctx, x: number, y: number, r: number, a0: number, a1: number, color: string, width: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function star(ctx: Ctx, x: number, y: number, r: number, points: number, fill: string, inner = 0.4): void {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  poly(ctx, pts, fill, 0.8);
}

function bolt(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  poly(ctx, [{ x, y }, { x: x - 3 * s, y: y + 6 * s }, { x: x, y: y + 6 * s }, { x: x - 2 * s, y: y + 12 * s }, { x: x + 4 * s, y: y + 4 * s }, { x: x + 1 * s, y: y + 4 * s }, { x: x + 3 * s, y }], color, 0.8);
}

function note(ctx: Ctx, x: number, y: number, color: string): void {
  ellipse(ctx, x, y, 2, 1.5, color, 0);
  line(ctx, [{ x: x + 1.8, y }, { x: x + 1.8, y: y - 6 }, { x: x + 4.5, y: y - 4.5 }], color, 1);
}

function speedLines(ctx: Ctx, x: number, y: number, color: string): void {
  for (const [dy, len] of [[0, 9], [5, 12], [10, 8]] as const) line(ctx, [{ x, y: y + dy }, { x: x - len, y: y + dy }], color, 1.4);
}

function hand(ctx: Ctx, x = 8, y = -17, color = SKIN): void {
  circle(ctx, x, y, 2, color, 0.8);
}

/** Wings, kites and other big shapes share this outline. */
function kite(ctx: Ctx, color: string, y = -48): void {
  poly(ctx, [{ x: -24, y: y + 10 }, { x: 0, y }, { x: 24, y: y + 10 }, { x: 0, y: y + 18 }], color, 1.1);
  line(ctx, [{ x: -24, y: y + 10 }, { x: 24, y: y + 10 }], WOOD_DARK, 1);
}

// ------------------------------------------------------------------ catalog

/** Keyed by roster id. Order follows roster.json (role by role, tiers 1-5). */
export const warriorIconDefs: Record<string, WarriorIconDef> = {
  // ---------------------------------------------------------------- blade
  shinobi: {
    role: 'blade', tier: 1, prop: 'katana with speed lines',
    look: { gi: '#2f3a4f', band: VERMILION, weapon: 'katana' },
    back: (ctx) => speedLines(ctx, -12, -24, rgba(WASHI, 0.8)),
  },
  twin_fang_dancer: {
    role: 'blade', tier: 2, prop: 'two crossed short swords',
    look: { gi: '#3a2f4f', band: GOLD, weapon: 'none' },
    front(ctx) {
      line(ctx, [{ x: 2, y: -12 }, { x: 22, y: -30 }], STEEL, 2);
      line(ctx, [{ x: 2, y: -30 }, { x: 22, y: -12 }], STEEL, 2);
      for (const p of [{ x: 4, y: -14 }, { x: 4, y: -28 }]) circle(ctx, p.x, p.y, 2, GOLD, 0.8);
    },
  },
  sushi_chef_assassin: {
    role: 'blade', tier: 3, ridiculous: true, prop: 'chef hat, sushi knife and a nigiri',
    look: { gi: WASHI, band: VERMILION, mask: WASHI, weapon: 'none' },
    front(ctx) {
      // Toque
      poly(ctx, [{ x: -8, y: -39 }, { x: 8, y: -39 }, { x: 8, y: -44 }, { x: -8, y: -44 }], '#ffffff', 1);
      for (const x of [-6, 0, 6]) circle(ctx, x, -48, 5, '#ffffff', 1);
      // Yanagiba knife
      line(ctx, [{ x: 8, y: -17 }, { x: 25, y: -27 }], STEEL, 2.6);
      line(ctx, [{ x: 5, y: -15 }, { x: 9, y: -18 }], WOOD, 3);
      // Nigiri in the other hand
      ellipse(ctx, -14, -15, 6, 3, '#ffffff', 0.9);
      ellipse(ctx, -14, -18, 6.5, 2.4, '#ff8a5c', 0.9);
      line(ctx, [{ x: -18, y: -18.5 }, { x: -11, y: -18 }], '#ffd0b8', 0.8);
    },
  },
  moonblade_master: {
    role: 'blade', tier: 4, prop: 'long blade under a crescent moon',
    look: { gi: '#1f2433', band: STEEL, weapon: 'none' },
    back(ctx) {
      circle(ctx, -14, -44, 7, '#f4f0d8', 0);
      circle(ctx, -11, -46, 6, '#3d4a6a', 0);
    },
    front(ctx) {
      ctx.beginPath();
      ctx.moveTo(6, -18);
      ctx.quadraticCurveTo(18, -24, 26, -40);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = STEEL;
      ctx.stroke();
      arc(ctx, 7, -19, 3, 0, Math.PI * 2, GOLD, 1.2);
    },
  },
  storm_sovereign: {
    role: 'blade', tier: 5, prop: 'katana crackling with a lightning bolt',
    look: { gi: '#141a22', band: '#7fd3ff', weapon: 'katana', armor: '#2b3340' },
    front: (ctx) => {
      bolt(ctx, 22, -44, 1.1, '#7fd3ff');
      bolt(ctx, -16, -30, 0.8, '#bfe9ff');
    },
  },
  // ---------------------------------------------------------------- thrower
  kunai_adept: {
    role: 'thrower', tier: 1, prop: 'pair of kunai and a satchel',
    look: { gi: '#5d6672', band: GOLD, weapon: 'kunai', pack: 'satchel' },
  },
  shuriken_storm: {
    role: 'thrower', tier: 2, prop: 'fan of three shuriken',
    look: { gi: '#4a5560', band: VERMILION, weapon: 'none' },
    front(ctx) {
      hand(ctx);
      star(ctx, 16, -30, 5, 4, STEEL);
      star(ctx, 21, -20, 5, 4, STEEL);
      star(ctx, 15, -10, 5, 4, STEEL);
    },
  },
  rubber_duck_sniper: {
    role: 'thrower', tier: 3, ridiculous: true, prop: 'bamboo tube firing a rubber duck',
    look: { gi: '#3f5a3a', band: '#ffd23c', weapon: 'none' },
    front(ctx) {
      line(ctx, [{ x: -2, y: -22 }, { x: 18, y: -26 }], '#9cc46a', 4);
      line(ctx, [{ x: 6, y: -24.5 }, { x: 6.4, y: -22 }], darken('#9cc46a', 0.4), 1);
      // Duck in flight
      ellipse(ctx, 26, -30, 5, 3.6, '#ffd23c', 0.9);
      circle(ctx, 29, -35, 2.8, '#ffd23c', 0.9);
      poly(ctx, [{ x: 31.5, y: -35.5 }, { x: 35, y: -34.5 }, { x: 31.5, y: -33.5 }], '#ff8a2c', 0.6);
      circle(ctx, 29.6, -35.8, 0.6, INK, 0);
      for (const a of [-0.5, 0, 0.5]) line(ctx, [{ x: 30 + Math.cos(a - 1.2) * 7, y: -37 + Math.sin(a - 1.2) * 7 }, { x: 30 + Math.cos(a - 1.2) * 10, y: -37 + Math.sin(a - 1.2) * 10 }], '#fff4b0', 1);
    },
  },
  chain_sickle_reaper: {
    role: 'thrower', tier: 4, prop: 'sickle swinging on a chain',
    look: { gi: '#3a2a2a', band: '#c9ced6', weapon: 'none' },
    front(ctx) {
      hand(ctx);
      for (let i = 0; i < 6; i++) circle(ctx, 9 + i * 2.4, -19 - i * 2.6, 1.1, 'rgba(0,0,0,0)', 0.9, IRON);
      ctx.beginPath();
      ctx.moveTo(23, -34);
      ctx.quadraticCurveTo(30, -40, 24, -46);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = STEEL;
      ctx.stroke();
    },
  },
  thousand_needle: {
    role: 'thrower', tier: 5, prop: 'quiver bristling with needles and a launcher',
    look: { gi: '#2b2f3a', band: WASHI, weapon: 'none' },
    back(ctx) {
      poly(ctx, [{ x: -14, y: -26 }, { x: -8, y: -28 }, { x: -6, y: -10 }, { x: -12, y: -8 }], WOOD, 1);
      for (let i = 0; i < 6; i++) line(ctx, [{ x: -13 + i, y: -27 - (i % 2) }, { x: -15 + i * 1.6, y: -38 - (i % 3) * 2 }], STEEL, 0.8);
    },
    front(ctx) {
      poly(ctx, [{ x: 2, y: -20 }, { x: 24, y: -26 }, { x: 25, y: -22 }, { x: 3, y: -16 }], '#4a5560', 1);
      for (const d of [0, 3, 6]) line(ctx, [{ x: 28 + d, y: -25 - d * 0.3 }, { x: 33 + d, y: -26.5 - d * 0.3 }], STEEL, 0.9);
    },
  },
  // ---------------------------------------------------------------- guardian
  armored_guardian: {
    role: 'guardian', tier: 1, prop: 'red lacquer armour, helm and club',
    look: { gi: '#3a2f2a', band: VERMILION, armor: '#7a2e26', hat: 'helm', weapon: 'club', scale: 1.1 },
  },
  iron_monk: {
    role: 'guardian', tier: 2, prop: 'iron-capped staff and a protective ring',
    look: { gi: '#5a4a3a', band: GOLD, armor: '#a8743a', weapon: 'none', mask: SKIN },
    back: (ctx) => arc(ctx, 0, -20, 22, Math.PI * 0.9, Math.PI * 2.1, rgba(GOLD, 0.7), 1.6),
    front(ctx) {
      line(ctx, [{ x: 12, y: 2 }, { x: 12, y: -44 }], WOOD, 2.6);
      for (const y of [-44, 2]) line(ctx, [{ x: 12, y }, { x: 12, y: y + (y < 0 ? 4 : -4) }], IRON, 3);
      hand(ctx, 11, -18);
    },
  },
  sumo_boulder: {
    role: 'guardian', tier: 3, ridiculous: true, prop: 'enormous belly bouncing an arrow back',
    look: { gi: '#e9c9a0', band: '#3d4a5c', mask: '#e9c9a0', skin: '#e9c9a0', weapon: 'none', scale: 1.1 },
    front(ctx) {
      circle(ctx, 0, -46, 3.4, INK, 0); // topknot
      ellipse(ctx, 1, -15, 11, 9, '#f0d0a8', 1);
      arc(ctx, 1, -13, 2, 0, Math.PI * 2, darken('#f0d0a8', 0.3), 0.8);
      poly(ctx, [{ x: -10, y: -10 }, { x: 12, y: -10 }, { x: 11, y: -6 }, { x: -9, y: -6 }], '#3d4a5c', 1);
      // Arrow pinging off
      line(ctx, [{ x: 14, y: -16 }, { x: 26, y: -26 }], WOOD, 1.4);
      poly(ctx, [{ x: 26, y: -26 }, { x: 22, y: -26 }, { x: 25, y: -22 }], IRON, 0.6);
      for (const a of [-0.8, 0, 0.8]) line(ctx, [{ x: 13 + Math.cos(a) * 3, y: -15 + Math.sin(a) * 3 }, { x: 13 + Math.cos(a) * 6, y: -15 + Math.sin(a) * 6 }], '#fff4b0', 1.1);
    },
  },
  mountain_shield: {
    role: 'guardian', tier: 4, prop: 'stone-grey tower shield',
    look: { gi: '#3d4a5c', band: '#9aa0aa', armor: '#7a808a', hat: 'helm', weapon: 'none' },
    front(ctx) {
      poly(ctx, [{ x: 6, y: -34 }, { x: 22, y: -34 }, { x: 22, y: -4 }, { x: 14, y: 2 }, { x: 6, y: -4 }], '#8a909a', 1.3);
      poly(ctx, [{ x: 9, y: -31 }, { x: 19, y: -31 }, { x: 19, y: -6 }, { x: 14, y: -2 }, { x: 9, y: -6 }], '#a8aeb8', 0);
      crest(ctx, 14, -18, 4, '#5d636e');
    },
  },
  oni_breaker: {
    role: 'guardian', tier: 5, prop: 'horned helm and giant spiked club cracking the ground',
    look: { gi: '#2a1a1a', band: VERMILION, armor: '#1a1414', hat: 'helm', weapon: 'none', scale: 1.1 },
    front(ctx) {
      for (const s of [-1, 1]) poly(ctx, [{ x: s * 8, y: -40 }, { x: s * 15, y: -50 }, { x: s * 11, y: -39 }], WASHI, 0.9);
      line(ctx, [{ x: 4, y: -14 }, { x: 22, y: -36 }], '#3a2a2a', 6);
      for (let i = 0; i < 4; i++) poly(ctx, [{ x: 13 + i * 2.6, y: -24 - i * 3 }, { x: 17 + i * 2.6, y: -24 - i * 3 }, { x: 16 + i * 2.6, y: -21 - i * 3 }], STEEL, 0.5);
      line(ctx, [{ x: 18, y: 2 }, { x: 14, y: 6 }, { x: 19, y: 9 }], INK, 1.2);
      line(ctx, [{ x: 18, y: 2 }, { x: 24, y: 5 }], INK, 1.2);
    },
  },
  // ---------------------------------------------------------------- saboteur
  saboteur: {
    role: 'saboteur', tier: 1, prop: 'grappling hook and satchel',
    look: { gi: '#2f4a3a', band: GOLD, weapon: 'grapple', pack: 'satchel' },
  },
  trap_breaker: {
    role: 'saboteur', tier: 2, prop: 'probe pole poking a disarmed spike trap',
    look: { gi: '#4a4a2f', band: STEEL, weapon: 'none' },
    front(ctx) {
      line(ctx, [{ x: 6, y: -18 }, { x: 22, y: -2 }], WOOD, 1.8);
      hand(ctx, 7, -17);
      poly(ctx, [{ x: 18, y: 4 }, { x: 30, y: 4 }, { x: 28, y: 1 }, { x: 20, y: 1 }], '#6b5a40', 0.8);
      for (const x of [21, 24, 27]) poly(ctx, [{ x: x - 1.4, y: 1 }, { x, y: -3 }, { x: x + 1.4, y: 1 }], IRON, 0.5);
      line(ctx, [{ x: 19, y: -6 }, { x: 29, y: 4 }], '#5fd36a', 1.8);
      line(ctx, [{ x: 29, y: -6 }, { x: 19, y: 4 }], '#5fd36a', 1.8);
    },
  },
  karaoke_saboteur: {
    role: 'saboteur', tier: 3, ridiculous: true, prop: 'microphone, cable and flying music notes',
    look: { gi: '#5a2f6a', band: '#ff6bd5', weapon: 'none' },
    front(ctx) {
      ctx.beginPath();
      ctx.moveTo(10, -22);
      ctx.bezierCurveTo(16, -6, 0, -4, -10, 2);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      line(ctx, [{ x: 9, y: -20 }, { x: 13, y: -28 }], '#26303d', 3);
      circle(ctx, 14, -31, 3.6, '#c9ced6', 1);
      hand(ctx, 9, -21);
      // Mouth wide open, mid-ballad
      ellipse(ctx, 8, -29.5, 1.6, 1.2, '#7a2e26', 0);
      note(ctx, 22, -38, '#ff6bd5');
      note(ctx, 28, -28, '#ffd23c');
      note(ctx, -16, -42, '#ff6bd5');
    },
  },
  fuse_master: {
    role: 'saboteur', tier: 4, prop: 'satchel charge with a lit fuse and timer',
    look: { gi: '#3a2f2f', band: '#ff9a3c', weapon: 'none' },
    front(ctx) {
      poly(ctx, [{ x: 8, y: -24 }, { x: 22, y: -24 }, { x: 22, y: -12 }, { x: 8, y: -12 }], '#b8763a', 1);
      line(ctx, [{ x: 8, y: -18 }, { x: 22, y: -18 }], '#6b4a2a', 1);
      circle(ctx, 15, -18, 3.4, WASHI, 0.8);
      line(ctx, [{ x: 15, y: -18 }, { x: 15, y: -20.5 }, { x: 16.8, y: -18 }], INK, 0.8);
      ctx.beginPath();
      ctx.moveTo(22, -24);
      ctx.quadraticCurveTo(26, -30, 24, -34);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#b8a888';
      ctx.stroke();
      star(ctx, 24, -35, 3.4, 5, '#ffcf3c');
    },
  },
  ghost_engineer: {
    role: 'saboteur', tier: 5, prop: 'lantern of silence with ghostly glow',
    look: { gi: '#1f2a2a', band: '#8ad0ff', weapon: 'none' },
    alpha: 0.85,
    back(ctx) {
      const g = ctx.createRadialGradient(18, -24, 1, 18, -24, 14);
      g.addColorStop(0, 'rgba(160,220,255,0.9)');
      g.addColorStop(1, 'rgba(160,220,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(18, -24, 14, 0, Math.PI * 2);
      ctx.fill();
    },
    front(ctx) {
      line(ctx, [{ x: 8, y: -17 }, { x: 18, y: -32 }], WOOD_DARK, 1.4);
      line(ctx, [{ x: 18, y: -32 }, { x: 18, y: -29 }], INK, 0.8);
      ellipse(ctx, 18, -24, 4.5, 6, '#d8f2ff', 1);
      for (const y of [-27, -21]) line(ctx, [{ x: 14, y }, { x: 22, y }], '#5f8aa0', 0.7);
      line(ctx, [{ x: 13, y: -28 }, { x: 23, y: -18 }], '#5f8aa0', 1.4); // "silence" slash
    },
  },
  // ---------------------------------------------------------------- infiltrator
  tunnel_runner: {
    role: 'infiltrator', tier: 1, prop: 'spade and straw hat',
    look: { gi: '#6b4a2e', band: IRON, weapon: 'shovel', hat: 'kasa' },
  },
  wall_climber: {
    role: 'infiltrator', tier: 2, prop: 'climbing claws scaling a brick wall',
    look: { gi: '#4a3a2a', band: '#b8a888', weapon: 'none' },
    back(ctx) {
      poly(ctx, [{ x: 12, y: -40 }, { x: 28, y: -40 }, { x: 28, y: 4 }, { x: 12, y: 4 }], '#9aa0aa', 1);
      for (let r = 0; r < 6; r++) {
        const y = -40 + r * 7.3;
        line(ctx, [{ x: 12, y }, { x: 28, y }], darken('#9aa0aa', 0.35), 0.7);
        line(ctx, [{ x: r % 2 ? 17 : 22, y }, { x: r % 2 ? 17 : 22, y: y + 7.3 }], darken('#9aa0aa', 0.35), 0.7);
      }
    },
    front(ctx) {
      hand(ctx, 10, -22);
      for (const d of [-2, 0, 2]) line(ctx, [{ x: 11, y: -22 + d }, { x: 15, y: -24 + d * 1.4 }], STEEL, 1);
    },
  },
  potted_plant_ninja: {
    role: 'infiltrator', tier: 3, ridiculous: true, prop: 'terracotta pot trousers and a bonsai hat',
    look: { gi: '#4f7a46', band: '#b5653a', weapon: 'none' },
    front(ctx) {
      // The pot, worn as trousers.
      poly(ctx, [{ x: -12, y: -16 }, { x: 12, y: -16 }, { x: 9, y: 0 }, { x: -9, y: 0 }], '#c87a4a', 1.2);
      poly(ctx, [{ x: -13, y: -18 }, { x: 13, y: -18 }, { x: 13, y: -14 }, { x: -13, y: -14 }], '#b5653a', 1.1);
      // Bonsai on the head.
      line(ctx, [{ x: 0, y: -40 }, { x: -2, y: -46 }, { x: 3, y: -50 }], WOOD_DARK, 2);
      for (const [x, y, r] of [[-6, -49, 4.5], [3, -53, 5], [9, -48, 4]] as const) circle(ctx, x, y, r, LEAF, 0.9);
      // Pruning shears
      line(ctx, [{ x: 13, y: -22 }, { x: 22, y: -28 }], STEEL, 1.6);
      line(ctx, [{ x: 13, y: -26 }, { x: 22, y: -24 }], STEEL, 1.6);
      circle(ctx, 12, -22, 1.8, VERMILION, 0.6);
      circle(ctx, 12, -26, 1.8, VERMILION, 0.6);
    },
  },
  mole_king: {
    role: 'infiltrator', tier: 4, prop: 'miner helm lamp, iron claws and a dirt mound',
    look: { gi: '#5a3a1e', band: GOLD, weapon: 'none' },
    back: (ctx) => ellipse(ctx, 16, 2, 12, 5, '#7a5a3a', 1),
    front(ctx) {
      poly(ctx, [{ x: -10, y: -36 }, { x: -7, y: -44 }, { x: 7, y: -44 }, { x: 10, y: -36 }], GOLD, 1);
      circle(ctx, 9, -40, 2.4, '#fff4b0', 0.8);
      poly(ctx, [{ x: 11, y: -41 }, { x: 24, y: -46 }, { x: 24, y: -36 }], 'rgba(255,244,176,0.45)', 0);
      for (const d of [-3, 0, 3]) line(ctx, [{ x: 8, y: -17 }, { x: 15, y: -15 + d }], IRON, 1.8);
      crest(ctx, 0, -40, 2, '#7a5418');
    },
  },
  phantom_gate: {
    role: 'infiltrator', tier: 5, prop: 'key-shaped staff in a violet gateway',
    look: { gi: '#2a2a3a', band: '#b48cff', weapon: 'none' },
    back(ctx) {
      poly(ctx, [{ x: -20, y: 2 }, { x: -20, y: -44 }, { x: 20, y: -44 }, { x: 20, y: 2 }, { x: 15, y: 2 }, { x: 15, y: -39 }, { x: -15, y: -39 }, { x: -15, y: 2 }], rgba('#b48cff', 0.55), 0);
      line(ctx, [{ x: -23, y: -44 }, { x: 23, y: -44 }], '#b48cff', 2);
    },
    front(ctx) {
      line(ctx, [{ x: 12, y: 2 }, { x: 12, y: -36 }], '#d9c8ff', 2);
      circle(ctx, 12, -39, 3.4, 'rgba(0,0,0,0)', 1.6, GOLD);
      for (const y of [-6, -1]) line(ctx, [{ x: 12, y }, { x: 16, y }], GOLD, 1.6);
      hand(ctx, 11, -18);
    },
  },
  // ---------------------------------------------------------------- sky
  kite_raider: {
    role: 'sky', tier: 1, prop: 'red war kite and bombs',
    look: { gi: '#3a3f6a', band: GOLD, weapon: 'none', pack: 'bombs' },
    back: (ctx) => {
      kite(ctx, VERMILION);
      crest(ctx, 0, -40, 4, WASHI);
    },
  },
  crane_glider: {
    role: 'sky', tier: 2, prop: 'white crane-wing glider',
    look: { gi: WASHI, band: '#2f3a4f', weapon: 'none' },
    back(ctx) {
      for (const s of [-1, 1]) {
        poly(ctx, [{ x: 0, y: -24 }, { x: s * 26, y: -40 }, { x: s * 22, y: -32 }, { x: s * 28, y: -30 }, { x: s * 10, y: -18 }], '#ffffff', 1);
        line(ctx, [{ x: s * 22, y: -32 }, { x: s * 28, y: -30 }], INK, 1.6);
      }
      circle(ctx, 0, -46, 2.6, VERMILION, 0); // crane crown
    },
  },
  cannonball_grandma: {
    role: 'sky', tier: 3, ridiculous: true, prop: 'flying rocking chair, hair bun and knitting',
    look: { gi: '#8a4a6a', band: '#f4ead6', mask: '#c9ced6', weapon: 'none' },
    back(ctx) {
      // Rocking chair
      line(ctx, [{ x: -12, y: -30 }, { x: -12, y: -6 }, { x: 10, y: -6 }, { x: 10, y: 2 }], WOOD, 2.4);
      line(ctx, [{ x: -12, y: -6 }, { x: -12, y: 2 }], WOOD, 2.4);
      arc(ctx, -1, -18, 22, Math.PI * 0.3, Math.PI * 0.7, WOOD_DARK, 2.4);
      speedLines(ctx, -16, -36, rgba(WASHI, 0.85));
    },
    front(ctx) {
      circle(ctx, -2, -42, 4.4, '#d9dee6', 1); // bun
      line(ctx, [{ x: -6, y: -44 }, { x: 2, y: -40 }], WOOD_DARK, 0.9);
      circle(ctx, 7, -31.5, 2.2, 'rgba(0,0,0,0)', 0.8); // spectacles
      // Knitting needles and yarn
      line(ctx, [{ x: 6, y: -16 }, { x: 18, y: -28 }], STEEL, 1.2);
      line(ctx, [{ x: 10, y: -14 }, { x: 22, y: -24 }], STEEL, 1.2);
      circle(ctx, 20, -12, 4, VERMILION, 0.9);
      arc(ctx, 20, -12, 2.4, 0.4, 2.8, darken(VERMILION, 0.4), 0.7);
    },
  },
  thunder_kite: {
    role: 'sky', tier: 4, prop: 'storm-blue kite and lightning rod',
    look: { gi: '#1f2433', band: '#7fd3ff', weapon: 'none' },
    back: (ctx) => kite(ctx, '#3a6aa0'),
    front(ctx) {
      line(ctx, [{ x: 8, y: -17 }, { x: 16, y: -38 }], IRON, 1.6);
      bolt(ctx, 18, -48, 0.9, '#ffe14c');
    },
  },
  dragon_kite_armada: {
    role: 'sky', tier: 5, prop: 'long red-and-gold dragon kite with bomb racks',
    look: { gi: '#2a1a1a', band: GOLD, weapon: 'none', pack: 'bombs' },
    back(ctx) {
      for (let i = 0; i < 5; i++) circle(ctx, -22 + i * 9, -42 + Math.sin(i * 1.3) * 3, 5, i % 2 ? GOLD : VERMILION, 0.9);
      poly(ctx, [{ x: 18, y: -48 }, { x: 28, y: -44 }, { x: 18, y: -38 }], VERMILION, 0.9);
      circle(ctx, 21, -44, 1, INK, 0);
      for (const s of [-1, 1]) line(ctx, [{ x: 24, y: -47 }, { x: 28, y: -47 + s * 4 }], GOLD, 1);
    },
  },
  // ---------------------------------------------------------------- mystic
  herbalist: {
    role: 'mystic', tier: 1, prop: 'herb sprig and healing cross',
    look: { gi: '#4f7a46', band: WASHI, weapon: 'none', pack: 'satchel' },
    front(ctx) {
      line(ctx, [{ x: 8, y: -17 }, { x: 16, y: -30 }], '#3f6a2a', 1.2);
      for (const [x, y] of [[12, -24], [15, -28], [10, -21]] as const) ellipse(ctx, x + 2, y, 3, 1.6, LEAF, 0.6);
      poly(ctx, [{ x: 18, y: -42 }, { x: 22, y: -42 }, { x: 22, y: -38 }, { x: 26, y: -38 }, { x: 26, y: -34 }, { x: 22, y: -34 }, { x: 22, y: -30 }, { x: 18, y: -30 }, { x: 18, y: -34 }, { x: 14, y: -34 }, { x: 14, y: -38 }, { x: 18, y: -38 }], '#7fdc6a', 0.9);
    },
  },
  drum_monk: {
    role: 'mystic', tier: 2, prop: 'taiko drum and sticks',
    look: { gi: '#7a3f2a', band: GOLD, weapon: 'none' },
    front(ctx) {
      ellipse(ctx, 14, -14, 8, 9, '#a0522d', 1.1);
      ellipse(ctx, 10, -14, 4, 8, '#f4e6c8', 0.9);
      for (const y of [-21, -7]) line(ctx, [{ x: 10, y }, { x: 18, y }], GOLD, 1);
      line(ctx, [{ x: 4, y: -26 }, { x: 10, y: -18 }], WOOD, 1.8);
      line(ctx, [{ x: 0, y: -22 }, { x: 8, y: -12 }], WOOD, 1.8);
    },
  },
  bubble_tea_alchemist: {
    role: 'mystic', tier: 3, ridiculous: true, prop: 'giant bubble tea with boba and a fat straw',
    look: { gi: '#c98da8', band: '#5a3a2a', weapon: 'none' },
    front(ctx) {
      poly(ctx, [{ x: 8, y: -32 }, { x: 24, y: -32 }, { x: 22, y: -6 }, { x: 10, y: -6 }], 'rgba(240,210,180,0.92)', 1.1);
      ellipse(ctx, 16, -32, 8, 2, '#ffe9d6', 1);
      for (const [x, y] of [[12, -9], [15, -10], [18, -9], [21, -10], [13.5, -12.5], [17, -13], [20, -12.5]] as const) circle(ctx, x, y, 1.4, '#3a2420', 0);
      line(ctx, [{ x: 18, y: -18 }, { x: 22, y: -42 }], '#ff6bd5', 2.6);
      hand(ctx, 9, -18);
    },
  },
  spirit_caller: {
    role: 'mystic', tier: 4, prop: 'spirit bell and a wisp',
    look: { gi: '#2f2a4a', band: '#b48cff', weapon: 'none' },
    front(ctx) {
      line(ctx, [{ x: 8, y: -17 }, { x: 12, y: -24 }], '#b48cff', 1);
      poly(ctx, [{ x: 9, y: -24 }, { x: 15, y: -24 }, { x: 17, y: -16 }, { x: 7, y: -16 }], GOLD, 1);
      circle(ctx, 12, -15, 1.2, INK, 0);
      // Wisp
      ctx.beginPath();
      ctx.moveTo(22, -26);
      ctx.quadraticCurveTo(30, -34, 24, -44);
      ctx.quadraticCurveTo(20, -36, 22, -26);
      ctx.fillStyle = 'rgba(200,170,255,0.85)';
      ctx.fill();
      circle(ctx, 23, -33, 0.8, INK, 0);
      circle(ctx, 25, -33, 0.8, INK, 0);
    },
  },
  sage_of_clouds: {
    role: 'mystic', tier: 5, prop: 'cloud staff topped with a puff of cloud',
    look: { gi: WASHI, band: '#7fd3ff', weapon: 'none', armor: '#d9e8f2' },
    front(ctx) {
      line(ctx, [{ x: 12, y: 2 }, { x: 14, y: -38 }], WOOD, 2);
      for (const [x, y, r] of [[10, -42, 5], [16, -45, 6], [21, -41, 4.5], [15, -39, 4.5]] as const) circle(ctx, x, y, r, '#ffffff', 0.8, '#7fa8c8');
      hand(ctx, 12.5, -18);
    },
  },
  // ---------------------------------------------------------------- siege
  ram_crew: {
    role: 'siege', tier: 1, prop: 'iron-capped log ram',
    look: { gi: '#5e3a22', band: IRON, weapon: 'none', hat: 'kasa' },
    front(ctx) {
      poly(ctx, [{ x: -10, y: -20 }, { x: 22, y: -20 }, { x: 22, y: -12 }, { x: -10, y: -12 }], WOOD, 1.1);
      for (const x of [-4, 4, 12]) line(ctx, [{ x, y: -19 }, { x: x + 2, y: -13 }], WOOD_DARK, 0.8);
      poly(ctx, [{ x: 22, y: -21 }, { x: 28, y: -19 }, { x: 28, y: -13 }, { x: 22, y: -11 }], IRON, 1);
    },
  },
  fire_monk: {
    role: 'siege', tier: 2, prop: 'fire gourd and a cone of flame',
    look: { gi: '#7a2e26', band: '#ff9a3c', weapon: 'none', mask: SKIN },
    front(ctx) {
      poly(ctx, [{ x: 10, y: -31 }, { x: 30, y: -40 }, { x: 33, y: -30 }, { x: 30, y: -22 }], '#ff9a3c', 0);
      poly(ctx, [{ x: 10, y: -31 }, { x: 24, y: -36 }, { x: 27, y: -31 }, { x: 24, y: -26 }], '#ffd23c', 0);
      circle(ctx, -10, -14, 4, '#d9a84c', 0.9);
      circle(ctx, -10, -20, 2.6, '#d9a84c', 0.9);
    },
  },
  mochi_mortar: {
    role: 'siege', tier: 3, ridiculous: true, prop: 'giant mochi mallet and a sticky rice cake',
    look: { gi: '#f1ebdf', band: '#e98aa0', weapon: 'none' },
    front(ctx) {
      line(ctx, [{ x: 4, y: -12 }, { x: 14, y: -34 }], WOOD, 2.2);
      poly(ctx, [{ x: 6, y: -38 }, { x: 22, y: -40 }, { x: 23, y: -32 }, { x: 7, y: -30 }], '#b07a4a', 1.1);
      // The mochi, with a little face.
      ellipse(ctx, 22, -8, 8, 6, '#ffffff', 1);
      ellipse(ctx, 22, -11, 4, 1.6, '#ffd0dc', 0);
      circle(ctx, 20, -8, 0.7, INK, 0);
      circle(ctx, 24, -8, 0.7, INK, 0);
      arc(ctx, 22, -7, 1.4, 0.3, 2.8, INK, 0.6);
      for (const x of [16, 28]) line(ctx, [{ x, y: -4 }, { x, y: 1 }], 'rgba(255,255,255,0.9)', 1.2); // sticky strands
    },
  },
  siege_bombardier: {
    role: 'siege', tier: 4, prop: 'bronze hand-mortar firing a long shot',
    look: { gi: '#3a3f48', band: GOLD, weapon: 'none' },
    front(ctx) {
      poly(ctx, [{ x: 2, y: -14 }, { x: 18, y: -32 }, { x: 23, y: -28 }, { x: 8, y: -10 }], '#b8863a', 1.1);
      ellipse(ctx, 20.5, -30, 3, 2, '#3a2a1e', 0.8);
      for (const [x, y, r] of [[26, -36, 3], [30, -40, 2.4], [33, -44, 1.8]] as const) circle(ctx, x, y, r, 'rgba(230,234,240,0.9)', 0);
      line(ctx, [{ x: 30, y: -16 }, { x: 34, y: -12 }], INK, 1);
      circle(ctx, 30, -20, 3, INK, 0);
    },
  },
  volcano_cannoneer: {
    role: 'siege', tier: 5, prop: 'volcano-shaped cannon spilling lava',
    look: { gi: '#2a1a1a', band: '#ff4a2a', weapon: 'none' },
    front(ctx) {
      poly(ctx, [{ x: 4, y: 2 }, { x: 13, y: -22 }, { x: 19, y: -22 }, { x: 28, y: 2 }], '#4a3030', 1.2);
      poly(ctx, [{ x: 13, y: -22 }, { x: 19, y: -22 }, { x: 18, y: -14 }, { x: 16, y: -18 }, { x: 14, y: -12 }], '#ff4a2a', 0);
      for (const [x, y, r] of [[16, -28, 3], [12, -33, 2], [21, -35, 2.4]] as const) circle(ctx, x, y, r, '#ff9a3c', 0.6, '#a02a1a');
    },
  },
  // ---------------------------------------------------------------- beast
  hound_handler: {
    role: 'beast', tier: 1, prop: 'hunting hound on a leash',
    look: { gi: '#5a4a3a', band: VERMILION, weapon: 'none' },
    front(ctx) {
      ellipse(ctx, 18, -6, 7, 4.5, '#d98a3a', 1);
      circle(ctx, 25, -11, 4, '#d98a3a', 1);
      poly(ctx, [{ x: 23, y: -14 }, { x: 24, y: -18 }, { x: 26, y: -14.5 }], '#d98a3a', 0.8);
      ellipse(ctx, 27, -10, 2, 1.4, WASHI, 0);
      circle(ctx, 26, -12, 0.7, INK, 0);
      arc(ctx, 10, -10, 3, Math.PI, Math.PI * 2, '#d98a3a', 2);
      for (const x of [14, 22]) line(ctx, [{ x, y: -3 }, { x, y: 1 }], '#b8702a', 1.6);
      line(ctx, [{ x: 8, y: -17 }, { x: 22, y: -10 }], VERMILION, 0.9);
    },
  },
  hawk_tamer: {
    role: 'beast', tier: 2, prop: 'hawk perched on a falconry glove',
    look: { gi: '#4a3a2a', band: GOLD, weapon: 'none' },
    front(ctx) {
      poly(ctx, [{ x: 6, y: -18 }, { x: 14, y: -26 }, { x: 17, y: -23 }, { x: 9, y: -15 }], '#a0703a', 1);
      ellipse(ctx, 17, -33, 4.6, 6.4, '#7a5232', 1);
      circle(ctx, 18, -40, 3.4, '#7a5232', 1);
      poly(ctx, [{ x: 21, y: -41 }, { x: 24, y: -39 }, { x: 21, y: -38 }], GOLD, 0.6);
      circle(ctx, 19, -41, 0.7, INK, 0);
      poly(ctx, [{ x: 13, y: -36 }, { x: 4, y: -44 }, { x: 14, y: -30 }], '#5e3a22', 0.9);
    },
  },
  goose_wrangler: {
    role: 'beast', tier: 3, ridiculous: true, prop: 'honking war goose and a loaf of bread',
    look: { gi: '#4a3a2a', band: '#ff9a3c', weapon: 'none' },
    front(ctx) {
      // Bread, held high as a peace offering that did not work.
      ellipse(ctx, -12, -24, 5, 3, '#d9a05c', 0.9);
      for (const x of [-14, -11]) line(ctx, [{ x, y: -26 }, { x: x + 1.5, y: -22.5 }], '#a0703a', 0.7);
      // The goose
      ellipse(ctx, 18, -6, 9, 6, '#ffffff', 1.1);
      ctx.beginPath();
      ctx.moveTo(23, -9);
      ctx.quadraticCurveTo(28, -18, 24, -28);
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      circle(ctx, 24, -29, 3.2, '#ffffff', 1);
      poly(ctx, [{ x: 26.5, y: -30.5 }, { x: 32, y: -31 }, { x: 26.5, y: -27.5 }], '#ff9a3c', 0.7);
      poly(ctx, [{ x: 26.5, y: -29 }, { x: 31, y: -27 }, { x: 26.5, y: -27.5 }], '#ff9a3c', 0.5);
      line(ctx, [{ x: 23, y: -31 }, { x: 25.5, y: -30 }], INK, 1); // angry brow
      for (const a of [-0.6, 0, 0.6]) line(ctx, [{ x: 33 + Math.cos(a) * 1, y: -29 + Math.sin(a) * 3 }, { x: 36 + Math.cos(a) * 1, y: -29 + Math.sin(a) * 6 }], '#ffd23c', 1.2);
      for (const x of [15, 20]) line(ctx, [{ x, y: 0 }, { x, y: 3 }], '#ff9a3c', 1.4);
    },
  },
  bear_warrior: {
    role: 'beast', tier: 4, prop: 'bear-head fur mantle and claw gauntlet',
    look: { gi: '#3a2a1e', band: VERMILION, weapon: 'none', armor: '#6b4a2e' },
    front(ctx) {
      circle(ctx, -7, -41, 3.4, '#6b4a2e', 1);
      circle(ctx, 7, -41, 3.4, '#6b4a2e', 1);
      arc(ctx, 0, -31, 11, Math.PI * 1.05, Math.PI * 1.95, '#6b4a2e', 3);
      circle(ctx, 10, -16, 3.4, '#6b4a2e', 1);
      for (const d of [-3, 0, 3]) poly(ctx, [{ x: 12, y: -18 + d }, { x: 19, y: -19 + d * 1.4 }, { x: 12.5, y: -16.5 + d }], WASHI, 0.6);
    },
  },
  tiger_lord: {
    role: 'beast', tier: 5, prop: 'roaring white war tiger and a glaive',
    look: { gi: '#2a2a2a', band: GOLD, weapon: 'none', armor: '#5a4a2a' },
    back(ctx) {
      circle(ctx, -14, -18, 11, '#f4f0e8', 1);
      for (const [x, y] of [[-20, -24], [-14, -28], [-8, -24]] as const) line(ctx, [{ x, y }, { x: x + 1, y: y + 4 }], INK, 1.4);
      for (const s of [-1, 1]) circle(ctx, -14 + s * 8, -27, 3, '#f4f0e8', 1);
      ellipse(ctx, -18, -13, 4, 3, '#b0283a', 0.8); // roar
      circle(ctx, -18, -20, 1, '#5fb0ff', 0);
    },
    front(ctx) {
      line(ctx, [{ x: 12, y: 2 }, { x: 14, y: -34 }], WOOD_DARK, 1.8);
      ctx.beginPath();
      ctx.moveTo(14, -34);
      ctx.quadraticCurveTo(22, -40, 18, -48);
      ctx.quadraticCurveTo(14, -40, 13, -34);
      ctx.fillStyle = STEEL;
      ctx.fill();
      hand(ctx, 13, -18);
    },
  },
  // ---------------------------------------------------------------- shadow
  shadow_stalker: {
    role: 'shadow', tier: 1, prop: 'half-vanished outline with a tanto',
    look: { gi: '#141a22', band: '#5f6b78', weapon: 'none' },
    alpha: 0.45,
    front(ctx) {
      ctx.save();
      ctx.setLineDash([2, 2]);
      arc(ctx, 0, -31, 11.5, 0, Math.PI * 2, '#9aa6b4', 1);
      ctx.restore();
      line(ctx, [{ x: 7, y: -17 }, { x: 16, y: -24 }], STEEL, 1.8);
      line(ctx, [{ x: 5, y: -15.5 }, { x: 8, y: -18 }], INK, 2.6);
    },
  },
  mirage_twin: {
    role: 'shadow', tier: 2, prop: 'ghostly double and a mirror blade',
    look: { gi: '#2a2a3a', band: '#b48cff', weapon: 'none' },
    back(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.translate(-12, -2);
      ninja(ctx, { gi: '#b48cff', band: '#ffffff', weapon: 'none' });
      ctx.restore();
    },
    front(ctx) {
      line(ctx, [{ x: 6, y: -18 }, { x: 20, y: -30 }], '#e8e0ff', 3);
      line(ctx, [{ x: 9, y: -20 }, { x: 17, y: -27 }], '#ffffff', 1);
    },
  },
  mime_ninja: {
    role: 'shadow', tier: 3, ridiculous: true, prop: 'white face paint, stripes and gloves on an invisible wall',
    look: { gi: WASHI, band: '#141a22', mask: '#141a22', skin: '#ffffff', weapon: 'none' },
    back(ctx) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      line(ctx, [{ x: 16, y: -44 }, { x: 16, y: 4 }], rgba('#bfe9ff', 0.9), 1.4);
      ctx.restore();
    },
    front(ctx) {
      for (const y of [-20, -17, -14, -10]) line(ctx, [{ x: -8.5, y }, { x: 8.5, y }], '#141a22', 1.3);
      for (const y of [-26, -16]) {
        circle(ctx, 13, y, 3, '#ffffff', 1);
        for (const d of [-1.6, 0, 1.6]) line(ctx, [{ x: 15, y: y + d }, { x: 16, y: y + d }], '#ffffff', 1);
      }
      ellipse(ctx, 5.5, -29.5, 1.6, 0.8, '#c8402f', 0); // tiny red mime smile
      line(ctx, [{ x: 3, y: -33.5 }, { x: 3, y: -30.5 }], '#141a22', 0.6);
      line(ctx, [{ x: 7.8, y: -33.5 }, { x: 7.8, y: -30.5 }], '#141a22', 0.6);
    },
  },
  void_walker: {
    role: 'shadow', tier: 4, prop: 'twin kama over a violet portal',
    look: { gi: '#0f1218', band: '#7a4aff', weapon: 'none' },
    back: (ctx) => {
      ellipse(ctx, 0, 1, 18, 5, '#3a1a7a', 1.2, '#7a4aff');
      ellipse(ctx, 0, 1, 12, 3, '#120a24', 0);
    },
    front(ctx) {
      for (const [x, y] of [[12, -22], [16, -12]] as const) {
        line(ctx, [{ x: x - 6, y: y + 4 }, { x, y: y - 4 }], WOOD_DARK, 1.6);
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.quadraticCurveTo(x + 7, y - 6, x + 7, y + 1);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#c9b8ff';
        ctx.stroke();
      }
    },
  },
  eclipse_ninja: {
    role: 'shadow', tier: 5, prop: 'black sun with a golden corona behind the head',
    look: { gi: '#0a0c10', band: GOLD, weapon: 'none' },
    back(ctx) {
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        line(ctx, [{ x: Math.cos(a) * 14, y: -31 + Math.sin(a) * 14 }, { x: Math.cos(a) * 19, y: -31 + Math.sin(a) * 19 }], GOLD, 1.6);
      }
      circle(ctx, 0, -31, 14, '#000000', 1.4, GOLD);
    },
    front(ctx) {
      arc(ctx, 15, -20, 6, 0, Math.PI * 2, GOLD, 1.6);
      arc(ctx, 15, -20, 3.4, 0, Math.PI * 2, '#6a5022', 0.8);
      hand(ctx, 9, -18);
    },
  },
};

// ------------------------------------------------------------------ badge

const ROLE_COLOURS: Record<string, string> = {
  blade: '#3d4a6a',
  thrower: '#3f6a5a',
  guardian: '#7a3a2e',
  saboteur: '#4f6030',
  infiltrator: '#7a5a32',
  sky: '#2e6a8a',
  mystic: '#5a3a7a',
  siege: '#8a4a22',
  beast: '#6a5a24',
  shadow: '#24223a',
};
const TIER_RINGS = ['#8a8f99', '#b87333', '#d9dee6', '#e9b44c', '#b48cff'];
export const ICON_SIZE = 56;
const R = ICON_SIZE / 2 - 2;

function badge(ctx: Ctx, def: WarriorIconDef): void {
  const base = ROLE_COLOURS[def.role] ?? '#3d4a5c';
  const g = ctx.createRadialGradient(-6, -8, 2, 0, 0, R);
  g.addColorStop(0, lighten(base, 0.35));
  g.addColorStop(1, darken(base, 0.25));
  circle(ctx, 0, 0, R, '#000000', 0);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx: Ctx, def: WarriorIconDef): void {
  const color = TIER_RINGS[def.tier - 1] ?? IRON;
  arc(ctx, 0, 0, R, 0, Math.PI * 2, darken(color, 0.45), 4);
  if (def.ridiculous) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    arc(ctx, 0, 0, R, 0, Math.PI * 2, '#ff6bd5', 2.6);
    ctx.restore();
    star(ctx, R - 5, -R + 5, 4.5, 4, '#fff4b0', 0.35);
  } else {
    arc(ctx, 0, 0, R, 0, Math.PI * 2, color, 2.4);
  }
  // Tier pips along the bottom.
  for (let i = 0; i < def.tier; i++) circle(ctx, (i - (def.tier - 1) / 2) * 5, R - 4, 1.6, color, 0.6, darken(color, 0.5));
}

/** Paint one warrior icon centred on the origin (ICON_SIZE x ICON_SIZE). */
export function paintWarriorIcon(ctx: Ctx, id: string): void {
  const def = warriorIconDefs[id];
  if (!def) return;
  ctx.save();
  badge(ctx, def);
  ctx.beginPath();
  ctx.arc(0, 0, R - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(-2, 18);
  ctx.scale(0.68, 0.68);
  def.back?.(ctx);
  ctx.save();
  if (def.alpha !== undefined) ctx.globalAlpha = def.alpha;
  ninja(ctx, def.look);
  ctx.restore();
  def.front?.(ctx);
  ctx.restore();
  ring(ctx, def);
}

/** Registry used by the texture generator and the art gallery. */
export const warriorIconArt: Record<string, WarriorIconArt> = Object.fromEntries(
  Object.keys(warriorIconDefs).map((id) => [id, { w: ICON_SIZE, h: ICON_SIZE, paint: (ctx: Ctx) => paintWarriorIcon(ctx, id) }]),
);
