import Phaser from 'phaser';
import { BODY_FONT } from './fonts';
import { queueArt } from './artManifest';
import { drainEvents, type BattleSession } from '../../gameplay/control/battleSession';
import { buildingDef } from '../../gameplay/sim/data';
import { airborne, deployBlock, isAbility, type SimBuilding, type SmokeCloud } from '../../gameplay/sim/battle/battle';
import { coverLeft, pointAt } from '../../gameplay/sim/battle/infiltration';
import { WARRIORS } from '../../gameplay/sim/progression';
import { isHidden } from '../../gameplay/sim/battle/warriors';
import { GROUND_PAD, Keys, TEX_SCALE, addSurroundings, groundScale, buildingOrigin, buildingScale, buildingTexture, ensureTextures, troopSize } from './assets';
import { CameraControl } from './cameraControl';
import { TILE_H, TILE_W, depthFor, footprintCenter, mapBounds, tileToWorld, worldToTile } from './iso';
import { debris } from './fx';
import { sound } from '../audio/sound';
import { hpLabel, type InspectTarget } from '../ui/battleInfo';

/** Something on the map the popup can point at. */
type MapTarget = Extract<InspectTarget, { index: number }>;

/** Where an info popup points, in CSS pixels of the page. `touch` popups close by themselves. */
export interface InspectAt {
  x: number;
  y: number;
  touch?: boolean;
}

export interface BattleHooks {
  selectedTroop(): string | null;
  deployFailed(reason: 'zone' | 'full' | 'none' | 'empty'): void;
  deployed(): void;
  /** The building under the mouse (or tapped while not deploying), or null to close the popup. */
  inspect(target: InspectTarget | null, at?: InspectAt): void;
}

export interface BattleSceneInit {
  session: BattleSession;
  hooks: BattleHooks;
  renderScale: number;
}

interface BView {
  image: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  /** Hit points left, beside the health bar; made on the first hit. */
  hpText: Phaser.GameObjects.Text | null;
  destroyed: boolean;
  lastHp: number;
  /** Sabotage marker and recovery ring, created on first jam. */
  jam: Phaser.GameObjects.Image | null;
  ring: Phaser.GameObjects.Graphics | null;
}

interface SView {
  lobes: Phaser.GameObjects.Image[];
  edge: Phaser.GameObjects.Graphics;
}

interface TView {
  image: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  dead: boolean;
  baseScale: number;
  lastHp: number;
}

const OVER = 1_000_000;
/** Ability names by live troop id, for the floating callouts. */
const ABILITY_NAME = new Map(WARRIORS.filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.ability.name]));
const COUNTER_LABEL: Record<string, string> = { lit: 'Lit up!', repair: 'Repaired!', grounded: 'Grounded!' };
/** Milliseconds between callouts over the same troop or building, so a fight stays readable. */
const CALLOUT_GAP_MS = 1400;
const AIR_HEIGHT = 46;
/** Health bar size in CSS pixels (scaled by 1 / zoom so it reads the same at every zoom). */
const BAR_W = 34;
const BAR_H = 6;
/** Alpha (0-255) a building sprite's pixel needs under the mouse to count as that building. */
const HIT_ALPHA = 40;

export class BattleScene extends Phaser.Scene {
  private session!: BattleSession;
  private hooks!: BattleHooks;
  private renderScale = 1;
  private cam!: CameraControl;
  private bviews: BView[] = [];
  private tviews: TView[] = [];
  private lastCallout = new Map<string, number>();
  private pviews = new Map<number, Phaser.GameObjects.Image>();
  private sviews = new Map<number, SView>();
  private zone!: Phaser.GameObjects.Graphics;
  /** Infiltration Points: circles on the ground and a label (letter + space left) over each. */
  private entryGfx: Phaser.GameObjects.Graphics | null = null;
  private entryLabels: Phaser.GameObjects.Text[] = [];
  private entrySig = '';
  private zoneFade: Phaser.Tweens.Tween | null = null;
  /** The mouse over the map: game-canvas position (for picking) and page position (for the popup). */
  private mouse: { sx: number; sy: number; cx: number; cy: number } | null = null;
  /** Building under the mouse, kept until the mouse or the camera moves (buildings never move). */
  private hoverBuilding = { wx: NaN, wy: NaN, index: -1, at: 0 };
  /** What the popup shows now, so the HUD hears only about changes. */
  private inspectKey = '';
  /** Per texture: the first drawn row, as a share of its height (sprites leave headroom above short roofs). */
  private drawnTop = new Map<string, number>();

  constructor() {
    super('battle');
  }

  init(data: BattleSceneInit): void {
    this.session = data.session;
    this.hooks = data.hooks;
    this.renderScale = data.renderScale;
    this.bviews = [];
    this.tviews = [];
    this.pviews = new Map();
    this.sviews = new Map();
    this.entryGfx = null;
    this.entryLabels = [];
    this.entrySig = '';
    this.lastCallout = new Map();
    this.drawnTop = new Map();
    this.mouse = null;
    this.hoverBuilding = { wx: NaN, wy: NaN, index: -1, at: 0 };
    this.inspectKey = '';
  }

  preload(): void {
    queueArt(this);
  }

  create(): void {
    const gd = this.session.data;
    ensureTextures(this, gd);
    const mapSize = gd.economy.mapSize;
    const mb = mapBounds(mapSize);
    this.add.image(mb.x - GROUND_PAD, mb.y - GROUND_PAD, Keys.ground).setOrigin(0, 0).setScale(groundScale(this.textures, mapSize)).setDepth(-10);
    addSurroundings(this, mapSize);
    this.cam = new CameraControl(this, {
      renderScale: this.renderScale,
      onTap: (x, y) => this.onTap(x, y),
      onHold: (x, y) => this.tryDeployAt(x, y, false),
      onZoom: () => this.rescaleOverlays(),
    });
    // Building names on hover are for a mouse: a finger on the map deploys instead.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const e = p.event as MouseEvent | undefined;
      this.mouse = { sx: p.x, sy: p.y, cx: e?.clientX ?? p.x / this.renderScale, cy: e?.clientY ?? p.y / this.renderScale };
    });
    // Leaving the canvas (onto a HUD panel, or out of the window) closes the popup.
    this.input.on('gameout', () => {
      this.mouse = null;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hooks.inspect(null));
    this.cam.setBounds(mb.x - 400, mb.y - 400, mb.width + 800, mb.height + 800);
    const cssW = this.scale.width / this.renderScale;
    this.cam.setZoom(Phaser.Math.Clamp(cssW / (18 * 64), 0.42, 1));
    const c = tileToWorld(mapSize / 2, mapSize / 2);
    this.cameras.main.centerOn(c.x, c.y);

    for (const b of this.session.sim.buildings) this.bviews.push(this.makeBuilding(b));
    this.zone = this.add.graphics().setDepth(-4).setAlpha(0);
    this.drawZone();
    this.drawEntry();
    if (this.session.mode !== 'replay') this.flashZone(2500);
  }


  private makeBuilding(b: SimBuilding): BView {
    const key = buildingTexture(this.textures, b.type, b.level, b.size);
    const tex = this.textures.get(key);
    const o = buildingOrigin(tex, b.size);
    const c = footprintCenter(b.x, b.y, b.size);
    const image = this.add.image(c.x, c.y, key).setOrigin(o.x, o.y).setScale(buildingScale(tex, b.size)).setDepth(depthFor(b.x, b.y, b.size));
    if (b.hidden) image.setVisible(false);
    const bar = this.add.graphics().setDepth(OVER - 10);
    return { image, bar, hpText: null, destroyed: false, lastHp: b.hp, jam: null, ring: null };
  }

  /** A tap deploys while fighting; while scouting, watching a replay or after the end it shows what was tapped. */
  private onTap(wx: number, wy: number): void {
    const s = this.session;
    if (s.mode === 'live' && !s.sim.ended) {
      this.tryDeployAt(wx, wy, true);
      return;
    }
    const target = this.pickAt(wx, wy, true);
    const p = this.input.activePointer;
    const e = p.event as MouseEvent | TouchEvent | undefined;
    const touch = e && 'changedTouches' in e ? e.changedTouches[0] : null;
    const at = { x: touch?.clientX ?? (e as MouseEvent | undefined)?.clientX ?? p.x / this.renderScale, y: touch?.clientY ?? (e as MouseEvent | undefined)?.clientY ?? p.y / this.renderScale, touch: p.wasTouch };
    this.inspectKey = target ? `${target.kind}:${target.index}` : '';
    this.hooks.inspect(target, at);
  }

  /** The building whose drawn pixels are under a world point. Warriors on the field have no popup. */
  private pickAt(wx: number, wy: number, fresh = false): MapTarget | null {
    const b = this.buildingAt(wx, wy, fresh);
    return b >= 0 ? { kind: 'building', index: b } : null;
  }

  private buildingAt(wx: number, wy: number, fresh: boolean): number {
    const h = this.hoverBuilding;
    const now = this.time.now;
    if (!fresh && Math.abs(wx - h.wx) < 0.5 && Math.abs(wy - h.wy) < 0.5 && now - h.at < 300) return h.index;
    const sim = this.session.sim;
    let best = -1;
    let depth = -Infinity;
    this.bviews.forEach((v, i) => {
      const b = sim.buildings[i];
      const img = v.image;
      // Never a hidden trap or rubble: the popup must not give away what the map does not show.
      if (!b || b.destroyed || b.hidden || v.destroyed || !img.visible || img.alpha < 0.1) return;
      const left = img.x - img.displayWidth * img.originX;
      const top = img.y - img.displayHeight * img.originY;
      if (wx < left || wx >= left + img.displayWidth || wy < top || wy >= top + img.displayHeight || img.depth <= depth) return;
      // Only the drawn part of the sprite counts, so the empty corners of a tall tower don't hide its neighbours.
      const fx = (wx - left) / img.scaleX;
      const fy = (wy - top) / img.scaleY;
      let alpha: number | null = 255;
      try {
        alpha = this.textures.getPixelAlpha(Math.floor(fx), Math.floor(fy), img.texture.key, img.frame.name);
      } catch {
        // A texture with no readable source (GPU only) counts by its bounds.
      }
      if ((alpha ?? 0) < HIT_ALPHA) return;
      depth = img.depth;
      best = i;
    });
    this.hoverBuilding = { wx, wy, index: best, at: now };
    return best;
  }

  /** Keeps the hover popup on whatever is under the mouse; closed while a button is held (dragging or deploying). */
  private syncHover(): void {
    const m = this.mouse;
    const held = this.input.manager.pointers.some((p) => p.isDown);
    if (!m || held) {
      if (this.inspectKey.startsWith('hover|')) {
        this.inspectKey = '';
        this.hooks.inspect(null);
      }
      return;
    }
    const w = this.cam.screenToWorld(m.sx, m.sy);
    const target = this.pickAt(w.x, w.y);
    const key = target ? `hover|${target.kind}:${target.index}|${Math.round(m.cx)},${Math.round(m.cy)}` : '';
    if (key === this.inspectKey) return;
    // A tapped popup (scout, replay) stays until the mouse finds something else.
    if (!target && !this.inspectKey.startsWith('hover|')) return;
    this.inspectKey = key;
    this.hooks.inspect(target, { x: m.cx, y: m.cy });
  }

  private drawZone(): void {
    const sim = this.session.sim;
    const n = sim.grid.size;
    const g = this.zone;
    g.clear();
    g.fillStyle(0xc8402f, 0.24);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (sim.deployable[y * n + x] && (!sim.entry || pointAt(sim.entry, x, y) >= 0)) continue;
        const p = [tileToWorld(x, y), tileToWorld(x + 1, y), tileToWorld(x + 1, y + 1), tileToWorld(x, y + 1)];
        g.fillPoints(p.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true);
      }
    }
  }

  /**
   * Infiltration Points on the map: a glowing ring per point, its letter and the
   * warrior space it still hides. Spent points go grey. Redrawn when usage changes.
   */
  private drawEntry(): void {
    const entry = this.session.sim.entry;
    if (!entry) return;
    const sig = entry.points.map((p) => p.used).join(',');
    if (sig === this.entrySig && this.entryGfx) return;
    this.entrySig = sig;
    if (!this.entryGfx) {
      this.entryGfx = this.add.graphics().setDepth(-3);
      this.entryLabels = entry.points.map(() =>
        this.add
          .text(0, 0, '', { fontFamily: BODY_FONT, fontSize: '15px', fontStyle: 'bold', color: '#fff6c8', stroke: '#26303d', strokeThickness: 4, align: 'center', resolution: Math.max(2, this.renderScale) })
          .setShadow(0, 2, 'rgba(15,20,30,0.45)', 3, true, true)
          .setOrigin(0.5, 1)
          .setDepth(OVER - 50),
      );
    }
    const g = this.entryGfx;
    g.clear();
    // A circle of radius r on the tiles is an ellipse on screen (iso: x-y across, x+y down).
    const rx = (entry.radius * TILE_W) / Math.SQRT2;
    const ry = (entry.radius * TILE_H) / Math.SQRT2;
    entry.points.forEach((p, i) => {
      const left = coverLeft(entry, i);
      const open = left > 0;
      const c = tileToWorld(p.x, p.y);
      g.fillStyle(open ? 0xe9b44c : 0x9aa0aa, open ? 0.16 : 0.1);
      g.fillEllipse(c.x, c.y, rx * 2, ry * 2);
      g.lineStyle(8, open ? 0xe9b44c : 0x9aa0aa, open ? 0.22 : 0.12);
      g.strokeEllipse(c.x, c.y, rx * 2, ry * 2);
      g.lineStyle(3, open ? 0xe9b44c : 0x9aa0aa, open ? 0.95 : 0.5);
      g.strokeEllipse(c.x, c.y, rx * 2, ry * 2);
      g.lineStyle(1.2, 0xfff6d8, open ? 0.8 : 0.3);
      g.strokeEllipse(c.x, c.y, rx * 2 - 5, ry * 2 - 2.5);
      this.entryLabels[i]
        .setText(`${p.label} · ${open ? left : 'full'}`)
        .setPosition(c.x, c.y - ry - 4)
        .setScale(1 / this.cam.userZoom)
        .setAlpha(open ? 1 : 0.6);
    });
  }

  private flashZone(ms: number): void {
    this.zoneFade?.stop();
    this.zone.setAlpha(1);
    this.zoneFade = this.tweens.add({ targets: this.zone, alpha: 0, delay: ms, duration: 600 });
  }

  private tryDeployAt(wx: number, wy: number, isTap: boolean): void {
    const s = this.session;
    if (s.mode !== 'live' || s.sim.ended) return;
    const troop = this.hooks.selectedTroop();
    if (!troop) {
      if (isTap) this.hooks.deployFailed('none');
      return;
    }
    const ability = isAbility(s.data, troop);
    if ((ability ? s.sim.charges[troop] ?? 0 : s.sim.remaining[troop] ?? 0) <= 0) {
      if (isTap) this.hooks.deployFailed('empty');
      return;
    }
    // A held finger keeps deploying troops, but each ability needs its own tap.
    if (ability && !isTap) return;
    const t = worldToTile(wx, wy);
    if (!s.tryDeploy(troop, t.tx, t.ty)) {
      if (isTap) {
        const why = deployBlock(s.sim, troop, t.tx, t.ty) ?? 'zone';
        if (why === 'zone') this.flashZone(1200);
        this.hooks.deployFailed(why);
      }
      return;
    }
    this.hooks.deployed();
    const p = tileToWorld(Math.floor(t.tx) + 0.5, Math.floor(t.ty) + 0.5);
    if (ability) {
      sound.play('smoke');
      this.puff(p.x, p.y, 2.2);
      return;
    }
    sound.play('deploy');
    this.puff(p.x, p.y, 0.6);
  }

  /** Smoke clouds: soft lobes inside a dashed boundary that thins as the cloud runs out. */
  private syncSmoke(): void {
    const sim = this.session.sim;
    const live = new Set<number>();
    for (const c of sim.smokes) {
      live.add(c.id);
      let v = this.sviews.get(c.id);
      if (!v) {
        v = this.makeSmoke(c);
        this.sviews.set(c.id, v);
      }
      const left = Math.max(0, (c.endsTick - sim.tick - this.session.alpha()) / (c.endsTick - c.startTick));
      const fade = Math.min(1, left * 4);
      for (const [i, lobe] of v.lobes.entries()) {
        lobe.setAlpha(0.78 * fade);
        lobe.rotation += 0.002 * (i % 2 ? 1 : -1);
      }
      this.drawSmokeEdge(v.edge, c, left);
    }
    for (const [id, v] of this.sviews) {
      if (live.has(id)) continue;
      for (const lobe of v.lobes) this.tweens.add({ targets: lobe, alpha: 0, scale: lobe.scale * 1.2, duration: 500, onComplete: () => lobe.destroy() });
      v.edge.destroy();
      this.sviews.delete(id);
    }
  }

  private makeSmoke(c: SmokeCloud): SView {
    const lobes: Phaser.GameObjects.Image[] = [];
    const rx = (c.radius * TILE_W) / Math.SQRT2;
    const ry = (c.radius * TILE_H) / Math.SQRT2;
    const centre = tileToWorld(c.x, c.y);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.55;
      const x = centre.x + Math.cos(a) * rx * r;
      const y = centre.y + Math.sin(a) * ry * r;
      const img = this.add.image(x, y, Keys.smoke).setDepth(OVER - 40 + y / 1000).setScale(((rx / 30) * 0.9) / TEX_SCALE, ((ry / 30) * 1.2) / TEX_SCALE).setAlpha(0);
      img.rotation = a;
      this.tweens.add({ targets: img, alpha: 0.78, duration: 300 });
      lobes.push(img);
    }
    const edge = this.add.graphics().setDepth(OVER - 41);
    return { lobes, edge };
  }

  private drawSmokeEdge(g: Phaser.GameObjects.Graphics, c: SmokeCloud, left: number): void {
    const rx = (c.radius * TILE_W) / Math.SQRT2;
    const ry = (c.radius * TILE_H) / Math.SQRT2;
    const centre = tileToWorld(c.x, c.y);
    g.clear();
    // Dashed ring marks the exact area; the bright arc shows the time left.
    g.lineStyle(2 / this.cam.userZoom, 0xe9eef5, 0.55);
    const dashes = 28;
    for (let i = 0; i < dashes; i += 2) {
      const a0 = (i / dashes) * Math.PI * 2;
      const a1 = ((i + 1) / dashes) * Math.PI * 2;
      g.beginPath();
      g.moveTo(centre.x + Math.cos(a0) * rx, centre.y + Math.sin(a0) * ry);
      g.lineTo(centre.x + Math.cos(a1) * rx, centre.y + Math.sin(a1) * ry);
      g.strokePath();
    }
    g.lineStyle(3.5 / this.cam.userZoom, 0xe9b44c, 0.9);
    g.beginPath();
    const steps = Math.max(2, Math.ceil(48 * left));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (i / 48) * Math.PI * 2;
      const x = centre.x + Math.cos(a) * rx;
      const y = centre.y + Math.sin(a) * ry;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
  }

  /** Jammed defenses: dimmed, with a jam marker and a ring that fills toward recovery; immune ones show a thin blue ring. */
  private syncJam(b: SimBuilding, v: BView): void {
    const sim = this.session.sim;
    const jammed = !b.destroyed && sim.tick < b.disabledUntil;
    const immune = !b.destroyed && !jammed && sim.tick < b.immuneUntil;
    if (!jammed && !immune) {
      if (v.jam) {
        v.jam.destroy();
        v.ring?.destroy();
        v.jam = null;
        v.ring = null;
        v.image.clearTint();
      }
      return;
    }
    const top = v.image.y - v.image.displayHeight * v.image.originY;
    const z = this.cam.userZoom;
    if (!v.jam) {
      v.jam = this.add.image(v.image.x, top - 14 / z, Keys.jam).setDepth(OVER - 8);
      v.ring = this.add.graphics().setDepth(OVER - 9);
    }
    v.jam.setPosition(v.image.x, top - 16 / z).setScale(1 / TEX_SCALE / z).setVisible(jammed);
    const g = v.ring!;
    g.clear();
    if (jammed) {
      v.image.setTint(0x8a93a3);
      const sab = this.session.data.battle.sabotage;
      const done = 1 - (b.disabledUntil - sim.tick) / sab.disableTicks;
      g.lineStyle(3 / z, 0x8ad0ff, 1);
      g.beginPath();
      g.arc(v.image.x, top - 16 / z, 13 / z, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, done));
      g.strokePath();
    } else {
      v.image.clearTint();
      g.lineStyle(2 / z, 0x8ad0ff, 0.5);
      g.strokeCircle(v.image.x, top - 16 / z, 8 / z);
    }
  }

  private makeTroop(type: string, air: boolean): TView {
    const key = Keys.troop(type);
    const size = troopSize(type);
    const tex = this.textures.get(key);
    const src = tex.getSourceImage() as { width: number; height: number };
    const baseScale = (size.w / src.width) * 1.25;
    const image = this.add.image(0, 0, key).setOrigin(0.5, (size.h - 6) / size.h).setScale(baseScale);
    const shadow = this.add.image(0, 0, Keys.shadow).setScale((air ? 0.7 : 0.55) / TEX_SCALE).setDepth(-3).setAlpha(air ? 0.6 : 0.9);
    const bar = this.add.graphics().setDepth(OVER - 9);
    image.setScale(baseScale * 0.4);
    this.tweens.add({ targets: image, scale: baseScale, duration: 260, ease: 'Back.easeOut' });
    return { image, shadow, bar, dead: false, baseScale, lastHp: -1 };
  }

  /** Short floating label over a troop or building (ability names, counter effects). Throttled per key. */
  private callout(key: string, x: number, y: number, text: string, color: string): void {
    const now = this.time.now;
    if (now - (this.lastCallout.get(key) ?? -Infinity) < CALLOUT_GAP_MS) return;
    this.lastCallout.set(key, now);
    const zoom = this.cam.userZoom;
    const label = this.add
      .text(x, y, text, { fontFamily: BODY_FONT, fontSize: '13px', fontStyle: 'bold', color, stroke: '#26303d', strokeThickness: 4, resolution: Math.max(2, this.renderScale) })
      .setShadow(0, 2, 'rgba(15,20,30,0.45)', 3, true, true)
      .setOrigin(0.5, 1)
      .setScale(1 / zoom)
      .setDepth(OVER);
    this.tweens.add({ targets: label, y: y - 26 / zoom, alpha: { from: 1, to: 0 }, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => label.destroy() });
  }

  private puff(x: number, y: number, scale: number): void {
    const p = this.add.image(x, y, Keys.puff).setScale((scale * 0.5) / TEX_SCALE).setDepth(OVER - 20).setAlpha(0.95);
    this.tweens.add({ targets: p, scale: (scale * 1.3) / TEX_SCALE, alpha: 0, y: y - 14, duration: 450, ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
  }

  private stars(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const s = this.add.image(x, y, Keys.star).setScale(0.5 / TEX_SCALE).setDepth(OVER - 19);
      const a = (i / n) * Math.PI * 2 + Math.random();
      this.tweens.add({ targets: s, x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 14 - 12, alpha: 0, angle: 180, duration: 500, ease: 'Cubic.easeOut', onComplete: () => s.destroy() });
    }
  }

  private rescaleOverlays(): void {
    // Bars are redrawn every frame using the current zoom; point labels keep a constant size on screen.
    for (const l of this.entryLabels) l.setScale(1 / this.cam.userZoom);
  }

  private drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, frac: number, color: number): void {
    const z = this.cam.userZoom;
    const w = BAR_W / z;
    const h = BAR_H / z;
    g.clear();
    // Ink frame and a dark track; the fill gets a lighter top half so it reads as a glossy bar.
    g.fillStyle(0x26303d, 0.92);
    g.fillRoundedRect(x - w / 2 - 1.5 / z, y - h / 2 - 1.5 / z, w + 3 / z, h + 3 / z, (h + 3 / z) / 2);
    g.fillStyle(0x4a5262, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    const fw = Math.max(h, w * frac);
    const low = frac < 0.3;
    g.fillStyle(low ? 0xc8402f : color, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2, fw, h, h / 2);
    g.fillStyle(0xffffff, 0.35);
    g.fillRoundedRect(x - w / 2 + 1 / z, y - h / 2 + 0.8 / z, Math.max(0, fw - 2 / z), h * 0.38, h * 0.19);
  }

  /** Where a sprite's drawing starts, from the top, as a share of its height. Read once per texture. */
  private roofLine(img: Phaser.GameObjects.Image): number {
    const key = img.texture.key;
    const known = this.drawnTop.get(key);
    if (known !== undefined) return known;
    let share = 0;
    try {
      const src = img.texture.getSourceImage() as CanvasImageSource & { width: number; height: number };
      const w = Math.max(1, Math.floor(src.width));
      const hgt = Math.max(1, Math.floor(src.height));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = hgt;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(src, 0, 0);
        const data = ctx.getImageData(0, 0, w, hgt).data;
        let row = 0;
        scan: for (; row < hgt; row++) for (let x = 0; x < w; x += 2) if (data[(row * w + x) * 4 + 3] >= HIT_ALPHA) break scan;
        share = row < hgt ? row / hgt : 0;
      }
    } catch {
      // Unreadable texture: keep the sprite's own top.
    }
    this.drawnTop.set(key, share);
    return share;
  }

  /** The number beside a building's health bar. Its texture is redrawn only when the number changes. */
  private drawHp(v: BView, x: number, y: number, hp: number): void {
    if (!v.hpText) {
      v.hpText = this.add
        .text(0, 0, '', { fontFamily: BODY_FONT, fontSize: '11px', fontStyle: 'bold', color: '#ffffff', stroke: '#26303d', strokeThickness: 3, resolution: Math.max(2, this.renderScale) })
        .setOrigin(0, 0.5)
        .setDepth(OVER - 10);
    }
    const label = hpLabel(hp);
    if (v.hpText.text !== label) v.hpText.setText(label);
    v.hpText.setPosition(x, y).setScale(1 / this.cam.userZoom);
  }

  update(_time: number, delta: number): void {
    this.cam.update(delta);
    const s = this.session;
    s.update(delta);
    this.handleEvents();
    const sim = s.sim;
    const a = s.alpha();
    this.drawEntry();

    this.syncSmoke();

    // Buildings: health bars, rubble and sabotage state.
    sim.buildings.forEach((b, i) => {
      const v = this.bviews[i];
      if (b.kind === 'defense') this.syncJam(b, v);
      if (b.destroyed && !v.destroyed) {
        v.destroyed = true;
        v.bar.clear();
        v.hpText?.destroy();
        v.hpText = null;
        if (b.kind === 'trap') {
          v.image.setVisible(false);
          return;
        }
        const c = footprintCenter(b.x, b.y, b.size);
        const key = Keys.rubble(b.size);
        const tex = this.textures.get(key);
        const o = buildingOrigin(tex, b.size);
        v.image.setTexture(key).setOrigin(o.x, o.y).setScale(buildingScale(tex, b.size)).setDepth(depthFor(b.x, b.y, b.size) - 5);
        this.puff(c.x, c.y - 10, b.size * 0.9);
        this.stars(c.x, c.y - 20, 5);
        if (b.kind !== 'hedge') {
          debris(this, c.x, c.y - 10, b.size, OVER - 18);
          sound.play('boom');
        } else sound.play('hit');
        if (b.kind !== 'hedge') this.cameras.main.shake(140, 0.0035 * Math.min(2, b.size / 2));
      } else if (!b.destroyed && b.hp < b.maxHp && b.kind !== 'hedge') {
        // Once a building is hit: its health bar just above its roof, with the hit points left beside it.
        const z = this.cam.userZoom;
        const top = v.image.y - v.image.displayHeight * (v.image.originY - this.roofLine(v.image));
        const y = top - 6 / z;
        this.drawBar(v.bar, v.image.x, y, b.hp / b.maxHp, 0x5aa85e);
        this.drawHp(v, v.image.x + (BAR_W / 2 + 4) / z, y, b.hp);
      }
      v.lastHp = b.hp;
    });
    this.syncHover();

    // Troops: create, interpolate, bob.
    while (this.tviews.length < sim.troops.length) {
      const t = sim.troops[this.tviews.length];
      this.tviews.push(this.makeTroop(t.summoned && !t.decoyUntil ? `${t.type}.companion` : t.type, t.air));
    }
    const now = this.time.now;
    sim.troops.forEach((t, i) => {
      let v = this.tviews[i];
      if (!t.dead && v.dead) {
        this.tweens.killTweensOf([v.image, v.shadow]);
        v.image.destroy(); v.shadow.destroy(); v.bar.destroy();
        v = this.tviews[i] = this.makeTroop(t.type, t.air);
      }
      if (t.dead) {
        if (!v.dead) {
          v.dead = true;
          v.bar.clear();
          const ix = v.image.x;
          const iy = v.image.y;
          this.puff(ix, iy - 8, 0.5);
          this.tweens.add({ targets: [v.image, v.shadow], alpha: 0, duration: 300, onComplete: () => { v.image.destroy(); v.shadow.destroy(); v.bar.destroy(); } });
        }
        return;
      }
      const x = t.px + (t.x - t.px) * a;
      const y = t.py + (t.y - t.py) * a;
      const w = tileToWorld(x, y);
      const moving = t.x !== t.px || t.y !== t.py;
      const flying = airborne(sim, t);
      const bob = flying ? Math.sin(now / 220 + i) * 4 : moving ? -Math.abs(Math.sin(now / 90 + i)) * 3 : 0;
      // A grounded flyer (Kite-Cutter Ballista) drops most of the way down while it is tangled.
      const lift = flying ? AIR_HEIGHT : t.air ? AIR_HEIGHT * 0.25 : 0;
      v.image.setPosition(w.x, w.y - lift + bob).setDepth(t.air ? OVER - 30 + y : depthFor(x - 0.5, y - 0.5, 1) + 1);
      v.image.setFlipX(t.facing < 0);
      v.image.setAlpha(t.decoyUntil ? 0.45 : isHidden(sim, t) ? 0.6 : 1);
      if (t.litUntil > sim.tick) v.image.setTint(0xfff0b0);
      else if (t.air && !flying) v.image.setTint(0xc8c8c8);
      else v.image.clearTint();
      if (t.attacking && !t.air) v.image.setScale(v.baseScale * (1 + Math.max(0, Math.sin(now / 60)) * 0.08), v.baseScale * (1 - Math.max(0, Math.sin(now / 60)) * 0.06));
      else if (v.image.scaleX !== v.baseScale && !this.tweens.isTweening(v.image)) v.image.setScale(v.baseScale);
      v.shadow.setPosition(w.x, w.y + 1);
      if (t.hp < t.maxHp) this.drawBar(v.bar, w.x, w.y - lift - 34, t.hp / t.maxHp, 0xe9b44c);
      else v.bar.clear();
      if (t.shieldUntil > sim.tick) {
        v.bar.lineStyle(2 / this.cam.userZoom, 0x8ad0ff, 0.8);
        v.bar.strokeCircle(w.x, w.y - lift - 18, 24);
      }
    });

    // Projectiles.
    const alive = new Set<number>();
    for (const p of sim.projectiles) {
      alive.add(p.id);
      let img = this.pviews.get(p.id);
      if (!img) {
        img = this.add.image(0, 0, Keys.projectile(p.kind)).setScale(1 / TEX_SCALE).setDepth(OVER - 15);
        this.pviews.set(p.id, img);
      }
      const prog = Math.min(1, (p.total - p.left + a) / p.total);
      const x = p.fromX + (p.toX - p.fromX) * prog;
      const y = p.fromY + (p.toY - p.fromY) * prog;
      const w = tileToWorld(x, y);
      const startH = p.targetBuilding >= 0 ? 10 : 40;
      const arc = p.arc ? 4 * 70 * prog * (1 - prog) : 0;
      img.setPosition(w.x, w.y - startH * (1 - prog) - arc - 8);
      if (p.kind === 'pinecone' || p.kind === 'acorn' || p.kind === 'seedbomb') img.setAngle(prog * 360);
      if (p.kind === 'bolas') img.setAngle(prog * 720);
      if (p.kind === 'sting' || p.kind === 'arrow') {
        const to = tileToWorld(p.toX, p.toY);
        img.setRotation(Math.atan2(to.y - w.y, to.x - w.x));
      }
    }
    for (const [id, img] of this.pviews) {
      if (alive.has(id)) continue;
      img.destroy();
      this.pviews.delete(id);
    }
  }

  private handleEvents(): void {
    const sim = this.session.sim;
    for (const e of drainEvents(this.session)) {
      if (e.k === 'hit') {
        sound.play('hit');
        const w = tileToWorld(e.x, e.y);
        if (e.splash > 0) {
          this.puff(w.x, w.y, 1 + e.splash);
          this.stars(w.x, w.y - 6, 4);
          if (e.kind === 'pinecone') this.cameras.main.shake(100, 0.003);
        } else {
          this.stars(w.x, w.y - 16, 2);
        }
      } else if (e.k === 'buildingHit') {
        const v = this.bviews[e.building];
        if (v && !v.destroyed && !this.tweens.isTweening(v.image)) {
          const sx = v.image.scaleX;
          const sy = v.image.scaleY;
          this.tweens.add({ targets: v.image, scaleX: sx * 1.03, scaleY: sy * 0.97, duration: 60, yoyo: true });
        }
      } else if (e.k === 'fire') {
        const v = this.bviews[e.building];
        if (v && !this.tweens.isTweening(v.image)) {
          const sy = v.image.scaleY;
          this.tweens.add({ targets: v.image, scaleY: sy * 0.94, duration: 70, yoyo: true });
        }
      } else if (e.k === 'deploy' && this.session.mode === 'replay') {
        sound.play('deploy');
      } else if (e.k === 'sabotage') {
        sound.play('jam');
        const b = sim.buildings[e.building];
        const c = footprintCenter(b.x, b.y, b.size);
        this.stars(c.x, c.y - 30, 6);
        this.puff(c.x, c.y - 10, 1.2);
      } else if (e.k === 'recovered') {
        sound.play('recover');
      } else if (e.k === 'smoke' && this.session.mode === 'replay') {
        sound.play('smoke');
      } else if (e.k === 'ability') {
        const t = sim.troops[e.troop];
        const name = ABILITY_NAME.get(t.type);
        if (name) {
          const w = tileToWorld(t.x, t.y);
          this.callout(`t${e.troop}`, w.x, w.y - (t.air ? AIR_HEIGHT : 0) - 44, name, '#ffe08a');
        }
      } else if (e.k === 'counter') {
        const label = COUNTER_LABEL[e.what];
        if (e.what === 'lit') this.bviews[e.building]?.image.setVisible(true).setAlpha(1);
        if (label) {
          const at = e.troop >= 0 ? sim.troops[e.troop] : null;
          const b = sim.buildings[e.target >= 0 ? e.target : e.building];
          const w = at ? tileToWorld(at.x, at.y) : footprintCenter(b.x, b.y, b.size);
          this.callout(`c${e.building}:${e.troop}:${e.target}`, w.x, w.y - (at ? 44 : 60), `${buildingDef(this.session.data, sim.buildings[e.building].type).name}: ${label}`, '#9fd8ff');
        }
      } else if (e.k === 'trap') {
        sound.play('boom');
        const b = sim.buildings[e.building];
        const v = this.bviews[e.building];
        v.image.setVisible(true).setAlpha(1);
        const c = footprintCenter(b.x, b.y, b.size);
        this.puff(c.x, c.y, 1.6);
        this.tweens.add({ targets: v.image, alpha: 0, delay: 400, duration: 400 });
      }
    }
    void buildingDef;
  }
}
