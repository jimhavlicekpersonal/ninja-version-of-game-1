import { messageText as ownedText, labelText } from '../ui/i18n';
import { pointLabel, t } from '../ui/i18n';
import Phaser from 'phaser';
import { BODY_FONT } from './fonts';
import { queueArt } from './artManifest';
import { drainEvents, type BattleSession } from '../../gameplay/control/battleSession';
import { buildingDef } from '../../gameplay/sim/data';
import { airborne, deployBlock, destruction, isAbility, stars as starsOf, type SimBuilding, type SmokeCloud } from '../../gameplay/sim/battle/battle';
import { coverLeft, pointAt } from '../../gameplay/sim/battle/infiltration';
import { WARRIORS } from '../../gameplay/sim/progression';
import { isHidden } from '../../gameplay/sim/battle/warriors';
import { GROUND_PAD, Keys, TEX_SCALE, addSurroundings, groundScale, buildingOrigin, buildingScale, buildingTexture, ensureTextures, troopSize, holdBuildingTextures, releaseBuildingTextures } from './assets';
import { CameraControl } from './cameraControl';
import { TILE_H, TILE_W, depthFor, footprintCenter, mapBounds, tileToWorld, worldToTile } from './iso';
import { noteBattleFps } from './quality';
import { addScenery, canvasRenderer, debris, deathPuff, keepCollapse, makeTracer, muzzleFlash, perfectBanner, ruinFamily, ruinTexture, starSlam, targetLine, troopRing, updateTracer } from './fx';
import { haptic, sound } from '../audio/sound';

export interface BattleHooks {
  selectedTroop(): string | null;
  deployFailed(reason: 'zone' | 'full' | 'none' | 'empty'): void;
  deployed(): void;
  /**
   * The part of the screen the battle HUD leaves free, as insets from each edge in CSS px. The start camera fits
   * every open Infiltration Point inside it, and points outside it get an edge chevron (re-audit design item 1).
   */
  safeArea?(): ScreenInsets;
  /** The scene hands the HUD a view of the map: where each point is on screen, and how to show one. */
  attachView?(view: BattleView): void;
  /** A one-line message for the player (the battle HUD's toast). */
  notice?(text: string): void;
}

export interface ScreenInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** An Infiltration Point as the HUD sees it: CSS px from the viewport's top-left. */
export interface EntryOnScreen {
  index: number;
  label: string;
  /** Warrior space it still hides (0: full). */
  left: number;
  x: number;
  y: number;
  /** Inside the HUD-free area (with a small margin). */
  inside: boolean;
}

export interface BattleView {
  entries(): EntryOnScreen[];
  /** Pan (keeping the zoom) until this point sits inside the free area. */
  showPoint(index: number): void;
  /** Draw the path from this point to the Keep and ring the defenses covering it (null clears it). */
  highlightPath(index: number | null): void;
  /** Fit every open point in the free area again. */
  fit(): void;
}

export interface BattleSceneInit {
  session: BattleSession;
  hooks: BattleHooks;
  renderScale: number;
}

interface BView {
  /** Dimmed with alpha because the Canvas renderer ignores the jam tint. */
  dimmed?: boolean;
  image: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  destroyed: boolean;
  lastHp: number;
  /** Sabotage marker and recovery ring, created on first jam. */
  jam: Phaser.GameObjects.Image | null;
  ring: Phaser.GameObjects.Graphics | null;
  /** White hit flash ends at this scene time (0: none); `flashAt` throttles it under rapid hits. */
  flashUntil: number;
  flashAt: number;
  /** The warrior this defense last locked on to (a new lock draws a targeting line). */
  lockedOn: number;
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
  /** Role-coloured ground ring (art re-audit item 1). */
  ring: Phaser.GameObjects.Image;
  /** White hit flash ends at this scene time. */
  flashUntil: number;
}

const OVER = 1_000_000;
/** Ability names by live troop id, for the floating callouts. */
const ABILITY_NAME = new Map(WARRIORS.filter((w) => w.liveTroop).map((w) => [w.liveTroop!, w.ability.name]));
const COUNTER_LABEL: Record<string, string> = { lit: 'Lit up!', repair: 'Repaired!', grounded: 'Grounded!' };
/** Milliseconds between callouts over the same troop or building, so a fight stays readable. */
const CALLOUT_GAP_MS = 1400;
const AIR_HEIGHT = 46;
/**
 * Lowest start zoom (CSS px per world px) when fitting every open point: a whole 40-tile base is about 2,400 world px
 * wide, so a 390 px phone needs ~0.14. Below this a narrow phone gets edge chevrons instead (rings would be too small).
 */
const FIT_FLOOR = 0.14;
/** World margin around the map that the camera may show: the start fit looks past the island's edge, and on a tall phone
 * the bounds' height (not FIT_FLOOR) would otherwise cap how far it can zoom out. */
const BATTLE_BOUNDS_PAD = 2800;
/** A tap this close (CSS px) to an open point's ring still counts: the warriors go to the nearest free tile inside it. */
const SNAP_CSS_PX = 26;

export class BattleScene extends Phaser.Scene {
  private session!: BattleSession;
  private hooks!: BattleHooks;
  private renderScale = 1;
  private cam!: CameraControl;
  private bviews: BView[] = [];
  private tviews: TView[] = [];
  private lastCallout = new Map<string, number>();
  private pviews = new Map<number, Phaser.GameObjects.Image>();
  /** Tracer streaks behind projectiles, with the last drawn position. */
  private ptrails = new Map<number, { img: Phaser.GameObjects.Image; x: number; y: number }>();
  /** Stars already celebrated, the 100% banner, and the Keep-collapse slow motion (scene time it ends). */
  private starsShown = 0;
  private perfectShown = false;
  private slowUntil = 0;
  private sviews = new Map<number, SView>();
  private zone!: Phaser.GameObjects.Graphics;
  /** Infiltration Points: circles on the ground and a label (letter + space left) over each. */
  private entryGfx: Phaser.GameObjects.Graphics | null = null;
  private entryLabels: Phaser.GameObjects.Text[] = [];
  private entrySig = '';
  private zoneFade: Phaser.Tweens.Tween | null = null;

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
    this.ptrails = new Map();
    this.starsShown = 0;
    this.perfectShown = false;
    this.slowUntil = 0;
    this.sviews = new Map();
    this.entryGfx = null;
    this.entryLabels = [];
    this.entrySig = '';
    this.lastCallout = new Map();
  }

  preload(): void {
    queueArt(this);
  }

  /** Drawing with Canvas (no WebGL): tints are ignored, so some cues use alpha instead. */
  private canvasMode = false;

  create(): void {
    this.canvasMode = canvasRenderer(this);
    const gd = this.session.data;
    ensureTextures(this, gd);
    const mapSize = gd.economy.mapSize;
    const mb = mapBounds(mapSize);
    this.add.image(mb.x - GROUND_PAD, mb.y - GROUND_PAD, Keys.ground).setOrigin(0, 0).setScale(groundScale(this.textures, mapSize)).setDepth(-10);
    addSurroundings(this, mapSize);
    addScenery(this, mapSize);
    this.cam = new CameraControl(this, {
      renderScale: this.renderScale,
      onTap: (x, y) => this.tryDeployAt(x, y, true),
      onHold: (x, y) => this.tryDeployAt(x, y, false),
      onZoom: () => this.rescaleOverlays(),
      minZoom: FIT_FLOOR,
    });
    this.cam.setBounds(mb.x - BATTLE_BOUNDS_PAD, mb.y - BATTLE_BOUNDS_PAD, mb.width + BATTLE_BOUNDS_PAD * 2, mb.height + BATTLE_BOUNDS_PAD * 2);
    const cssW = this.scale.width / this.renderScale;
    this.cam.setZoom(Phaser.Math.Clamp(cssW / (18 * 64), 0.42, 1));
    const c = tileToWorld(mapSize / 2, mapSize / 2);
    this.cameras.main.centerOn(c.x, c.y);

    for (const b of this.session.sim.buildings) this.bviews.push(this.makeBuilding(b));
    // Report section 5 step 3 (device F1): this base's art stays while the battle shows it; the last
    // base's (scouting, Next, replays) can go once this scene shuts down.
    holdBuildingTextures(this.textures, 'battle', this.bviews.map((v) => v.image.texture.key));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => releaseBuildingTextures(this.textures, 'battle'));
    this.zone = this.add.graphics().setDepth(-4).setAlpha(0);
    this.drawZone();
    this.drawEntry();
    if (this.session.mode !== 'replay') this.flashZone(2500);
    // Open on every open point (re-audit design item 1); the HUD is laid out by now.
    this.pathGfx = this.add.graphics().setDepth(-2);
    this.fitEntry();
    const refit = () => {
      // Turning the phone before the first warrior goes in shows the whole base again.
      if (!this.session.deployments.length) this.time.delayedCall(60, () => this.fitEntry());
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, refit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, refit));
    this.hooks.attachView?.({
      entries: () => this.entriesOnScreen(),
      showPoint: (i) => this.showPoint(i),
      highlightPath: (i) => this.highlightPath(i),
      fit: () => this.fitEntry(),
    });
  }

  // ------------------------------------------------------------ start camera, chevrons, path highlight

  private pathGfx: Phaser.GameObjects.Graphics | null = null;
  private pathIndex: number | null = null;

  /** The free area in CSS px (viewport coordinates) and the canvas's CSS size and offset. */
  private freeArea(): { left: number; top: number; right: number; bottom: number; cssW: number; cssH: number; ox: number; oy: number } {
    const r = this.game.canvas.getBoundingClientRect();
    const cssW = r.width || this.scale.width / this.renderScale;
    const cssH = r.height || this.scale.height / this.renderScale;
    const a = this.hooks.safeArea?.() ?? { top: 0, right: 0, bottom: 0, left: 0 };
    return { left: a.left, top: a.top, right: cssW - a.right, bottom: cssH - a.bottom, cssW, cssH, ox: r.left, oy: r.top };
  }

  /** World point to CSS px inside the canvas. */
  private toCss(wx: number, wy: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const k = 1 / this.renderScale;
    return { x: (wx - cam.worldView.x) * cam.zoom * k, y: (wy - cam.worldView.y) * cam.zoom * k };
  }

  /** Open points (all of them once every point is full, so the camera still has something to frame). */
  private framedPoints(): { x: number; y: number }[] {
    const entry = this.session.sim.entry;
    if (!entry) return [];
    const open = entry.points.filter((_, i) => coverLeft(entry, i) > 0);
    return (open.length ? open : entry.points).map((p) => tileToWorld(p.x, p.y));
  }

  /** Zoom and pan so every open point's ring sits inside the free area (down to FIT_FLOOR). */
  private fitEntry(): void {
    const pts = this.framedPoints();
    if (!pts.length) return;
    const entry = this.session.sim.entry!;
    const fa = this.freeArea();
    // Ring half-sizes in world px; a 22 px label sits above each ring.
    const rx = (entry.radius * TILE_W) / Math.SQRT2;
    const ry = (entry.radius * TILE_H) / Math.SQRT2;
    const minX = Math.min(...pts.map((p) => p.x)) - rx;
    const maxX = Math.max(...pts.map((p) => p.x)) + rx;
    const minY = Math.min(...pts.map((p) => p.y)) - ry;
    const maxY = Math.max(...pts.map((p) => p.y)) + ry;
    const pad = 14;
    const labelPx = 24;
    const availW = Math.max(60, fa.right - fa.left - pad * 2);
    const availH = Math.max(60, fa.bottom - fa.top - pad * 2 - labelPx);
    const z = Phaser.Math.Clamp(Math.min(availW / (maxX - minX), availH / (maxY - minY)), FIT_FLOOR, 0.9);
    this.cam.stop();
    this.cam.setZoom(z);
    const zoom = this.cam.userZoom;
    // Put the middle of the points at the middle of the free area (the label band sits above it).
    const fx = (fa.left + fa.right) / 2 - fa.cssW / 2;
    const fy = (fa.top + labelPx + fa.bottom) / 2 - fa.cssH / 2;
    this.cameras.main.centerOn((minX + maxX) / 2 - fx / zoom, (minY + maxY) / 2 - fy / zoom);
    this.rescaleOverlays();
  }

  private entriesOnScreen(): EntryOnScreen[] {
    const entry = this.session.sim.entry;
    if (!entry) return [];
    const fa = this.freeArea();
    // Inside means at least half the ring shows in the free area: then a tap on it works (near misses snap in).
    const z = this.cam.userZoom;
    const hx = ((entry.radius * TILE_W) / Math.SQRT2) * z * 0.5;
    const hy = ((entry.radius * TILE_H) / Math.SQRT2) * z * 0.5;
    return entry.points.map((p, i) => {
      const w = tileToWorld(p.x, p.y);
      const c = this.toCss(w.x, w.y);
      const inside = c.x - hx > fa.left && c.x + hx < fa.right && c.y - 4 > fa.top && c.y + hy < fa.bottom;
      return { index: i, label: p.label, left: coverLeft(entry, i), x: c.x + fa.ox, y: c.y + fa.oy, inside };
    });
  }

  /** Glide the camera (same zoom) until the point is inside the free area, a little in from its edge. */
  private showPoint(index: number): void {
    const p = this.session.sim.entry?.points[index];
    if (!p) return;
    const fa = this.freeArea();
    const w = tileToWorld(p.x, p.y);
    const c = this.toCss(w.x, w.y);
    const inset = Math.min(90, (fa.right - fa.left) / 3, (fa.bottom - fa.top) / 3);
    const tx = Phaser.Math.Clamp(c.x, fa.left + inset, fa.right - inset);
    const ty = Phaser.Math.Clamp(c.y, fa.top + inset, fa.bottom - inset);
    const zoom = this.cam.userZoom;
    const cam = this.cameras.main;
    this.cam.stop();
    this.tweens.add({ targets: cam, scrollX: cam.scrollX + (c.x - tx) / zoom, scrollY: cam.scrollY + (c.y - ty) / zoom, duration: 280, ease: 'Cubic.easeOut' });
  }

  /**
   * Scout aid: the straight path from a point to the Keep, and a ring on each working defense whose range crosses it
   * (the same reach the scout report counts in `pointIntel`).
   */
  private highlightPath(index: number | null): void {
    this.pathIndex = index;
    this.drawPath();
  }

  private drawPath(): void {
    const g = this.pathGfx;
    if (!g) return;
    g.clear();
    const sim = this.session.sim;
    const p = this.pathIndex === null ? null : sim.entry?.points[this.pathIndex];
    if (!p) return;
    const hall = sim.buildings.find((b) => b.kind === 'hall');
    const hx = hall ? hall.x + hall.size / 2 : sim.grid.size / 2;
    const hy = hall ? hall.y + hall.size / 2 : sim.grid.size / 2;
    const z = this.cam.userZoom;
    const a = tileToWorld(p.x, p.y);
    const b = tileToWorld(hx, hy);
    g.lineStyle(9 / z, 0xfff6d8, 0.35);
    g.lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(4 / z, 0xe9b44c, 0.95);
    g.lineBetween(a.x, a.y, b.x, b.y);
    for (const d of sim.buildings) {
      if (d.kind !== 'defense' || !d.combat || d.destroyed || d.hidden) continue;
      const cx = d.x + d.size / 2;
      const cy = d.y + d.size / 2;
      if (distToSegment(cx, cy, p.x, p.y, hx, hy) > d.combat.range) continue;
      const w = tileToWorld(cx, cy);
      g.lineStyle(4 / z, 0xc8402f, 0.95);
      g.strokeEllipse(w.x, w.y, (d.size + 1) * TILE_W * 0.75, (d.size + 1) * TILE_H * 0.75);
    }
  }

  /**
   * A tap just outside a point's ring (rings are small on a phone at the start zoom): the nearest deployable tile
   * inside that point, or null. Only open points count; the game still checks the deployment itself.
   */
  private snapToPoint(wx: number, wy: number): { tx: number; ty: number } | null {
    const sim = this.session.sim;
    const entry = sim.entry;
    if (!entry) return null;
    const n = sim.grid.size;
    const reach = SNAP_CSS_PX / this.cam.userZoom;
    let best: { tx: number; ty: number } | null = null;
    let bestD = Infinity;
    entry.points.forEach((p, i) => {
      if (coverLeft(entry, i) <= 0) return;
      const r = Math.ceil(entry.radius);
      for (let ty = Math.floor(p.y) - r; ty <= Math.floor(p.y) + r; ty++) {
        for (let tx = Math.floor(p.x) - r; tx <= Math.floor(p.x) + r; tx++) {
          if (tx < 0 || ty < 0 || tx >= n || ty >= n || !sim.deployable[ty * n + tx] || pointAt(entry, tx, ty) !== i) continue;
          const c = tileToWorld(tx + 0.5, ty + 0.5);
          const d = Math.hypot(c.x - wx, c.y - wy);
          if (d < bestD) {
            bestD = d;
            best = { tx: tx + 0.5, ty: ty + 0.5 };
          }
        }
      }
    });
    return best && bestD <= reach + TILE_W / 2 ? best : null;
  }


  private makeBuilding(b: SimBuilding): BView {
    const key = buildingTexture(this.textures, b.type, b.level, b.size);
    const tex = this.textures.get(key);
    const o = buildingOrigin(tex, b.size);
    const c = footprintCenter(b.x, b.y, b.size);
    const image = this.add.image(c.x, c.y, key).setOrigin(o.x, o.y).setScale(buildingScale(tex, b.size)).setDepth(depthFor(b.x, b.y, b.size));
    if (b.hidden) image.setVisible(false);
    const bar = this.add.graphics().setDepth(OVER - 10);
    return { image, bar, destroyed: false, lastHp: b.hp, jam: null, ring: null, flashUntil: 0, flashAt: -1e9, lockedOn: -1 };
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
        .setText(`${pointLabel(p.label)} · ${open ? left : t('battle.pointFull')}`)
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
    let t = worldToTile(wx, wy);
    // Warriors only (smoke goes anywhere): a near miss of a small ring goes to the nearest free tile inside it.
    if (!ability && s.sim.entry && pointAt(s.sim.entry, t.tx, t.ty) < 0) t = this.snapToPoint(wx, wy) ?? t;
    if (!s.tryDeploy(troop, t.tx, t.ty)) {
      if (isTap) {
        const why = deployBlock(s.sim, troop, t.tx, t.ty) ?? 'zone';
        if (why === 'zone') this.flashZone(1200);
        this.hooks.deployFailed(why);
      }
      return;
    }
    this.hooks.deployed();
    haptic('light');
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
      // Canvas renderer (no WebGL) ignores tint: dim with alpha instead (report section 5 step 3).
      if (this.canvasMode && !v.dimmed) {
        v.image.setAlpha(v.image.alpha * 0.6);
        v.dimmed = true;
      }
      const sab = this.session.data.battle.sabotage;
      const done = 1 - (b.disabledUntil - sim.tick) / sab.disableTicks;
      g.lineStyle(3 / z, 0x8ad0ff, 1);
      g.beginPath();
      g.arc(v.image.x, top - 16 / z, 13 / z, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, done));
      g.strokePath();
    } else {
      v.image.clearTint();
      if (v.dimmed) {
        v.image.setAlpha(v.image.alpha / 0.6);
        v.dimmed = false;
      }
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
    const ring = troopRing(this, type, air);
    const bar = this.add.graphics().setDepth(OVER - 9);
    image.setScale(baseScale * 0.4);
    this.tweens.add({ targets: image, scale: baseScale, duration: 260, ease: 'Back.easeOut' });
    return { image, shadow, bar, dead: false, baseScale, lastHp: -1, ring, flashUntil: 0 };
  }

  /** Short floating label over a troop or building (ability names, counter effects). Throttled per key. */
  private callout(key: string, x: number, y: number, text: string, color: string): void {
    const now = this.time.now;
    if (now - (this.lastCallout.get(key) ?? -Infinity) < CALLOUT_GAP_MS) return;
    this.lastCallout.set(key, now);
    const zoom = this.cam.userZoom;
    const label = this.add
      .text(x, y, ownedText(text), { fontFamily: BODY_FONT, fontSize: '13px', fontStyle: 'bold', color, stroke: '#26303d', strokeThickness: 4, resolution: Math.max(2, this.renderScale) })
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
    this.drawPath();
  }

  private drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, frac: number, color: number): void {
    const z = this.cam.userZoom;
    const w = 34 / z;
    const h = 6 / z;
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

  /** When the next frame-rate sample is due (report section 5 step 3, device F2). */
  private nextFpsSample = 0;

  update(time: number, delta: number): void {
    this.cam.update(delta);
    // While the battle runs (never idle-throttled), sample the frame rate once a second.
    if (this.session.running && time >= this.nextFpsSample) {
      this.nextFpsSample = time + 1000;
      const msg = noteBattleFps(this.game.loop.actualFps);
      if (msg) this.hooks.notice?.(msg);
    }
    // The path highlight is a scouting aid: gone once the battle starts.
    if (this.pathIndex !== null && this.session.mode !== 'scout') this.highlightPath(null);
    const s = this.session;
    // The Keep's fall plays in slow motion for a moment (the battle clock is in ticks, so nothing is lost).
    s.update(this.time.now < this.slowUntil ? delta * 0.3 : delta);
    this.handleEvents();
    const sim = s.sim;
    const a = s.alpha();
    this.celebrate();
    this.drawEntry();

    this.syncSmoke();

    // Buildings: health bars, rubble and sabotage state.
    sim.buildings.forEach((b, i) => {
      const v = this.bviews[i];
      if (b.kind === 'defense') this.syncJam(b, v);
      if (b.destroyed && !v.destroyed) {
        v.destroyed = true;
        v.bar.clear();
        if (b.kind === 'trap') {
          v.image.setVisible(false);
          return;
        }
        const c = footprintCenter(b.x, b.y, b.size);
        // Ruins by building family (art re-audit item 4); walls keep the small generic rubble.
        const key = b.kind === 'hedge' ? Keys.rubble(b.size) : ruinTexture(this, b.size, ruinFamily(b.kind, b.type));
        const tex = this.textures.get(key);
        const o = buildingOrigin(tex, b.size);
        v.image.setTexture(key).setOrigin(o.x, o.y).setScale(buildingScale(tex, b.size)).setDepth(depthFor(b.x, b.y, b.size) - 5);
        this.puff(c.x, c.y - 10, b.size * 0.9);
        this.stars(c.x, c.y - 20, 5);
        v.image.clearTint();
        v.flashUntil = 0;
        if (b.kind === 'hall') {
          keepCollapse(this, c.x, c.y - 10, b.size, OVER - 18);
          this.slowUntil = this.time.now + 900;
          sound.play('collapse');
          haptic('heavy');
        } else if (b.kind !== 'hedge') {
          debris(this, c.x, c.y - 10, b.size, OVER - 18);
          sound.play('boom');
          haptic('medium');
        } else sound.play('hit');
        if (b.kind !== 'hedge' && b.kind !== 'hall') this.cameras.main.shake(140, 0.0035 * Math.min(2, b.size / 2));
      } else if (!b.destroyed && b.hp < b.maxHp && b.kind !== 'hedge') {
        const top = v.image.y - v.image.displayHeight * v.image.originY;
        this.drawBar(v.bar, v.image.x, top - 6 / this.cam.userZoom, b.hp / b.maxHp, 0x5aa85e);
      }
      // A 60 ms white flash on a hit, then back to normal (a jammed defense re-tints next frame).
      if (v.flashUntil && this.time.now >= v.flashUntil) {
        v.flashUntil = 0;
        if (!b.destroyed) v.image.clearTint();
      }
      v.lastHp = b.hp;
    });

    // Troops: create, interpolate, bob.
    while (this.tviews.length < sim.troops.length) {
      const t = sim.troops[this.tviews.length];
      this.tviews.push(this.makeTroop(t.summoned && !t.decoyUntil ? `${t.type}.companion` : t.type, t.air));
    }
    const now = this.time.now;
    sim.troops.forEach((t, i) => {
      let v = this.tviews[i];
      if (!t.dead && v.dead) {
        this.tweens.killTweensOf([v.image, v.shadow, v.ring]);
        v.image.destroy(); v.shadow.destroy(); v.bar.destroy(); v.ring.destroy();
        v = this.tviews[i] = this.makeTroop(t.type, t.air);
      }
      if (t.dead) {
        if (!v.dead) {
          v.dead = true;
          v.bar.clear();
          const ix = v.image.x;
          const iy = v.image.y;
          deathPuff(this, ix, iy - 8, OVER - 20);
          this.tweens.add({ targets: [v.image, v.shadow, v.ring], alpha: 0, duration: 300, onComplete: () => { v.image.destroy(); v.shadow.destroy(); v.bar.destroy(); v.ring.destroy(); } });
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
      if (now < v.flashUntil) v.image.setTintFill(0xffffff);
      else if (t.litUntil > sim.tick) v.image.setTint(0xfff0b0);
      else if (t.air && !flying) v.image.setTint(0xc8c8c8);
      else v.image.clearTint();
      if (t.attacking && !t.air) v.image.setScale(v.baseScale * (1 + Math.max(0, Math.sin(now / 60)) * 0.08), v.baseScale * (1 - Math.max(0, Math.sin(now / 60)) * 0.06));
      else if (v.image.scaleX !== v.baseScale && !this.tweens.isTweening(v.image)) v.image.setScale(v.baseScale);
      v.shadow.setPosition(w.x, w.y + 1);
      v.ring.setPosition(w.x, w.y + 1).setVisible(!isHidden(sim, t) || Boolean(t.decoyUntil));
      if (t.hp < t.maxHp) this.drawBar(v.bar, w.x, w.y - lift - 34, t.hp / t.maxHp, 0xe9b44c);
      else v.bar.clear();
      if (t.shieldUntil > sim.tick) {
        v.bar.lineStyle(2 / this.cam.userZoom, 0x8ad0ff, 0.8);
        v.bar.strokeCircle(w.x, w.y - lift - 18, 24);
      }
    });

    // Projectiles: drawn larger when zoomed out (never under ~18 CSS px long) with a tracer streak,
    // so a shot reads on a phone (art re-audit item 5).
    const alive = new Set<number>();
    const pz = this.cam.userZoom;
    const pScale = Math.max(1.3, 0.72 / pz) / TEX_SCALE;
    for (const p of sim.projectiles) {
      alive.add(p.id);
      let img = this.pviews.get(p.id);
      if (!img) {
        img = this.add.image(0, 0, Keys.projectile(p.kind)).setDepth(OVER - 15);
        this.pviews.set(p.id, img);
      }
      img.setScale(pScale);
      const prog = Math.min(1, (p.total - p.left + a) / p.total);
      const x = p.fromX + (p.toX - p.fromX) * prog;
      const y = p.fromY + (p.toY - p.fromY) * prog;
      const w = tileToWorld(x, y);
      const startH = p.targetBuilding >= 0 ? 10 : 40;
      const arc = p.arc ? 4 * 70 * prog * (1 - prog) : 0;
      const px = w.x;
      const py = w.y - startH * (1 - prog) - arc - 8;
      img.setPosition(px, py);
      let tr = this.ptrails.get(p.id);
      if (!tr) {
        tr = { img: makeTracer(this, p.kind, OVER - 16), x: px, y: py };
        this.ptrails.set(p.id, tr);
      }
      updateTracer(tr.img, tr.x, tr.y, px, py, pz);
      if (p.kind === 'pinecone' || p.kind === 'seedbomb') img.setAngle(prog * 360);
      else if (p.kind === 'bolas') img.setAngle(prog * 720);
      else if (Math.hypot(px - tr.x, py - tr.y) > 0.5) img.setRotation(Math.atan2(py - tr.y, px - tr.x));
      tr.x = px;
      tr.y = py;
    }
    for (const [id, img] of this.pviews) {
      if (alive.has(id)) continue;
      img.destroy();
      this.pviews.delete(id);
      const tr = this.ptrails.get(id);
      if (tr) {
        this.ptrails.delete(id);
        this.tweens.add({ targets: tr.img, alpha: 0, duration: 90, onComplete: () => tr.img.destroy() });
      }
    }
  }

  /** Stars and 100%: a slam for each new star, a banner at full destruction (art re-audit item 4). */
  private celebrate(): void {
    const sim = this.session.sim;
    if (this.session.mode === 'scout') return;
    const won = starsOf(sim);
    while (this.starsShown < won) {
      starSlam(this, this.starsShown, this.renderScale);
      sound.play('starSlam');
      haptic('success');
      this.starsShown++;
    }
    if (!this.perfectShown && destruction(sim) >= 100) {
      this.perfectShown = true;
      perfectBanner(this, this.renderScale);
      this.time.delayedCall(250, () => sound.play('perfect'));
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
      } else if (e.k === 'troopHit') {
        const tv = this.tviews[e.troop];
        if (tv) tv.flashUntil = this.time.now + 60;
      } else if (e.k === 'buildingHit') {
        const v = this.bviews[e.building];
        if (v && !v.destroyed && this.time.now - v.flashAt > 400) {
          // A 60 ms white flash: an additive white copy at partial strength, so the building lights
          // up without turning into a flat silhouette (its ground plate included).
          v.flashAt = this.time.now;
          const im = v.image;
          const glow = this.add.image(im.x, im.y, im.texture.key).setOrigin(im.originX, im.originY).setScale(im.scaleX, im.scaleY).setDepth(im.depth + 0.5).setTintFill(0xffffff).setAlpha(0.32).setBlendMode(Phaser.BlendModes.ADD);
          this.time.delayedCall(60, () => glow.destroy());
        }
        if (v && !v.destroyed && !this.tweens.isTweening(v.image)) {
          const sx = v.image.scaleX;
          const sy = v.image.scaleY;
          this.tweens.add({ targets: v.image, scaleX: sx * 1.03, scaleY: sy * 0.97, duration: 60, yoyo: true });
        }
      } else if (e.k === 'fire') {
        const v = this.bviews[e.building];
        const b = sim.buildings[e.building];
        if (v && b) {
          // Muzzle flash at the top of the tower, and a brief line when it locks on to a new warrior.
          const z = this.cam.userZoom;
          const mx = v.image.x;
          const my = v.image.y - v.image.displayHeight * v.image.originY * 0.75;
          muzzleFlash(this, mx, my, z, OVER - 14);
          const target = b.targetTroop >= 0 ? sim.troops[b.targetTroop] : undefined;
          if (target && b.targetTroop !== v.lockedOn) {
            const tw = tileToWorld(target.x, target.y);
            targetLine(this, mx, my, tw.x, tw.y - (target.air ? AIR_HEIGHT : 0) - 12, z, OVER - 16);
          }
          v.lockedOn = b.targetTroop;
        }
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
        const name = labelText(ABILITY_NAME.get(t.type) ?? '');
        if (name) {
          const w = tileToWorld(t.x, t.y);
          this.callout(`t${e.troop}`, w.x, w.y - (t.air ? AIR_HEIGHT : 0) - 44, name, '#ffe08a');
        }
      } else if (e.k === 'counter') {
        const label = labelText(COUNTER_LABEL[e.what] ?? '');
        if (e.what === 'lit') this.bviews[e.building]?.image.setVisible(true).setAlpha(1);
        if (label) {
          const at = e.troop >= 0 ? sim.troops[e.troop] : null;
          const b = sim.buildings[e.target >= 0 ? e.target : e.building];
          const w = at ? tileToWorld(at.x, at.y) : footprintCenter(b.x, b.y, b.size);
          this.callout(`c${e.building}:${e.troop}:${e.target}`, w.x, w.y - (at ? 44 : 60), `${labelText(buildingDef(this.session.data, sim.buildings[e.building].type).name)}: ${label}`, '#9fd8ff');
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

/** Distance (tiles) from (px, py) to the segment a-b. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Phaser.Math.Clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
