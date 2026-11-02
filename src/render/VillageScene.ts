import Phaser from 'phaser';
import type { GameController } from '../game/controller';
import { buildingDef } from '../sim/data';
import { canPlace, findFreeSpot } from '../sim/grid';
import { collectorAmount, collectorCapacity, effectiveLevel } from '../sim/resources';
import type { Building } from '../sim/types';
import type { UiBus } from '../ui/bus';
import { formatDuration, formatNumber } from '../ui/format';
import { Keys, TEX_SCALE, buildingOrigin, buildingScale, buildingTexture, generatePlaceholders } from './assets';
import { depthFor, footprintCenter, footprintCorners, mapBounds, worldToTile } from './iso';

export interface VillageSceneInit {
  controller: GameController;
  bus: UiBus;
  /** Device pixels per CSS pixel the canvas renders at (capped for performance). */
  renderScale: number;
}

interface TimerView {
  box: Phaser.GameObjects.Container;
  fill: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  lastText: string;
}

interface BuildingView {
  image: Phaser.GameObjects.Image;
  key: string;
  bubble: Phaser.GameObjects.Image | null;
  timer: TimerView | null;
}

interface Placement {
  kind: 'new' | 'move';
  type: string;
  id?: string;
  x: number;
  y: number;
  size: number;
  ghost: Phaser.GameObjects.Image;
  outline: Phaser.GameObjects.Graphics;
  valid: boolean;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  moved: boolean;
  mode: 'pan' | 'ghost';
  grabDx: number;
  grabDy: number;
}

const TIMER_W = 76;
const TIMER_H = 10;
const MIN_ZOOM = 0.3;
const BOUNDS_MARGIN_X = 400;
const BOUNDS_MARGIN_Y = 400;
const MAX_ZOOM = 2;
const TAP_SLOP_CSS_PX = 10;
const OVERLAY_DEPTH = 1_000_000;

export class VillageScene extends Phaser.Scene {
  private controller!: GameController;
  private bus!: UiBus;
  private renderScale = 1;
  private userZoom = 0.6;
  private views = new Map<string, BuildingView>();
  private selectedId: string | null = null;
  private selection!: Phaser.GameObjects.Graphics;
  private placement: Placement | null = null;
  private drag: DragState | null = null;
  private pinch: { startDist: number; startZoom: number } | null = null;
  private lastTickAt = 0;
  private unsubs: (() => void)[] = [];

  constructor() {
    super('village');
  }

  init(data: VillageSceneInit): void {
    this.controller = data.controller;
    this.bus = data.bus;
    this.renderScale = data.renderScale;
  }

  create(): void {
    const gd = this.controller.data;
    const mapSize = gd.economy.mapSize;
    generatePlaceholders(
      this,
      Object.entries(gd.buildings).map(([type, d]) => ({ type, size: d.size })),
      mapSize,
    );
    const mb = mapBounds(mapSize);
    this.add.image(mb.x, mb.y, Keys.ground).setOrigin(0, 0).setDepth(-10);

    this.selection = this.add.graphics().setDepth(OVERLAY_DEPTH - 1);
    const cam = this.cameras.main;
    cam.setBounds(mb.x - BOUNDS_MARGIN_X, mb.y - BOUNDS_MARGIN_Y, mb.width + BOUNDS_MARGIN_X * 2, mb.height + BOUNDS_MARGIN_Y * 2);
    const cssWidth = this.scale.width / this.renderScale;
    // Start close enough that the Elder Toadstool fills about a third of a phone screen.
    this.userZoom = Phaser.Math.Clamp(cssWidth / (12 * 64), Math.max(0.45, this.minZoom()), 1.1);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.zoomAt(this.scale.width / 2, this.scale.height / 2, this.userZoom));
    const hall = this.controller.state.buildings.find((b) => buildingDef(gd, b.type).category === 'hall');
    if (hall) {
      const c = footprintCenter(hall.x, hall.y, buildingDef(gd, hall.type).size);
      cam.centerOn(c.x, c.y - 40);
    }

    this.sync();

    this.unsubs.push(
      this.controller.subscribe((finished) => {
        this.sync();
        for (const f of finished) this.floatText(f.id, `Level ${f.level}!`, '#fff4b0');
      }),
      this.bus.on('placement:start', (p) => (p.kind === 'new' ? this.startPlacement('new', p.buildingType) : this.startPlacement('move', undefined, p.id))),
      this.bus.on('placement:confirm', () => this.confirmPlacement()),
      this.bus.on('placement:cancel', () => this.endPlacement()),
      this.bus.on('select', (id) => {
        if (id !== this.selectedId) {
          this.selectedId = id;
          this.drawSelection();
        }
      }),
      this.bus.on('camera:focus', ({ id }) => this.focusOn(id)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubs.forEach((u) => u()));

    this.setupInput();
  }

  // ------------------------------------------------------------------ views

  private sync(): void {
    const gd = this.controller.data;
    const seen = new Set<string>();
    for (const b of this.controller.state.buildings) {
      seen.add(b.id);
      const size = buildingDef(gd, b.type).size;
      const key = buildingTexture(this.textures, b.type, b.level, size);
      let view = this.views.get(b.id);
      if (!view) {
        view = { image: this.add.image(0, 0, key), key: '', bubble: null, timer: null };
        this.views.set(b.id, view);
      }
      if (view.key !== key) {
        const tex = this.textures.get(key);
        const o = buildingOrigin(tex, size);
        view.image.setTexture(key).setOrigin(o.x, o.y).setScale(buildingScale(tex, size));
        view.key = key;
      }
      const c = footprintCenter(b.x, b.y, size);
      view.image.setPosition(c.x, c.y).setDepth(depthFor(b.x, b.y, size));
      view.image.setAlpha(this.placement?.id === b.id ? 0.25 : 1);
      this.syncTimer(b, view);
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.image.destroy();
      view.bubble?.destroy();
      view.timer?.box.destroy();
      this.views.delete(id);
    }
    if (this.selectedId && !seen.has(this.selectedId)) {
      this.selectedId = null;
      this.bus.emit('select', null);
    }
    this.drawSelection();
    this.updateBubbles(this.controller.now());
  }

  private syncTimer(b: Building, view: BuildingView): void {
    if (!b.upgrade) {
      view.timer?.box.destroy();
      view.timer = null;
      return;
    }
    if (!view.timer) {
      const bg = this.add.rectangle(0, 0, TIMER_W, TIMER_H, 0x2b1d12, 0.85).setStrokeStyle(2, 0x2b1d12);
      const fill = this.add.rectangle(-TIMER_W / 2 + 1, 0, TIMER_W - 2, TIMER_H - 4, 0x8be04e).setOrigin(0, 0.5);
      const label = this.add
        .text(0, -13, '', {
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#2b1d12',
          strokeThickness: 4,
          resolution: Math.max(2, this.renderScale),
        })
        .setOrigin(0.5, 0.5);
      const box = this.add.container(0, 0, [bg, fill, label]).setDepth(OVERLAY_DEPTH);
      view.timer = { box, fill, label, lastText: '' };
    }
    const top = view.image.y - view.image.displayHeight * view.image.originY;
    view.timer.box.setPosition(view.image.x, top - 6 / this.userZoom);
    view.timer.box.setScale(1 / this.userZoom);
  }

  private updateTimers(now: number): void {
    for (const b of this.controller.state.buildings) {
      const view = this.views.get(b.id);
      if (!view?.timer || !b.upgrade) continue;
      const { startedAt, endsAt } = b.upgrade;
      const t = Phaser.Math.Clamp((now - startedAt) / Math.max(1, endsAt - startedAt), 0, 1);
      view.timer.fill.width = (TIMER_W - 2) * t;
      const text = formatDuration(endsAt - now);
      if (text !== view.timer.lastText) {
        view.timer.label.setText(text);
        view.timer.lastText = text;
      }
    }
  }

  private updateBubbles(now: number): void {
    const gd = this.controller.data;
    for (const b of this.controller.state.buildings) {
      const view = this.views.get(b.id);
      const def = buildingDef(gd, b.type);
      if (!view || !def.produces) continue;
      const level = effectiveLevel(b, now);
      const cap = collectorCapacity(b, level, gd);
      const amount = collectorAmount(b, now, gd);
      const show = cap > 0 && amount >= Math.max(gd.economy.minCollectAmount, cap * gd.economy.collectBubbleMinFraction) && this.placement?.id !== b.id;
      if (show && !view.bubble) {
        view.bubble = this.add.image(0, 0, Keys.bubble(def.produces)).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH - 2);
      }
      if (!show && view.bubble) {
        view.bubble.destroy();
        view.bubble = null;
      }
      if (view.bubble) {
        const full = amount >= cap - 0.5;
        view.bubble.setScale((full ? 1.15 : 1) / TEX_SCALE / this.userZoom);
        view.bubble.setTint(full ? 0xfff2c0 : 0xffffff);
      }
    }
  }

  private positionBubbles(time: number): void {
    for (const view of this.views.values()) {
      if (!view.bubble) continue;
      const top = view.image.y - view.image.displayHeight * view.image.originY;
      const bob = Math.sin(time / 300 + view.image.x) * 3 / this.userZoom;
      view.bubble.setPosition(view.image.x, top + 6 + bob);
    }
  }

  private drawSelection(): void {
    const g = this.selection;
    g.clear();
    const b = this.controller.state.buildings.find((v) => v.id === this.selectedId);
    if (!b || this.placement) return;
    const size = buildingDef(this.controller.data, b.type).size;
    const pts = footprintCorners(b.x, b.y, size);
    g.lineStyle(3 / this.userZoom, 0xffffff, 0.95);
    g.strokePoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
    g.setDepth(depthFor(b.x, b.y, size) - 1);
  }

  private floatText(id: string, text: string, color: string): void {
    const view = this.views.get(id);
    if (!view) return;
    const top = view.image.y - view.image.displayHeight * view.image.originY;
    const t = this.add
      .text(view.image.x, top, text, {
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color,
        stroke: '#2b1d12',
        strokeThickness: 5,
        resolution: Math.max(2, this.renderScale),
      })
      .setOrigin(0.5, 1)
      .setDepth(OVERLAY_DEPTH + 1)
      .setScale(1 / this.userZoom);
    this.tweens.add({
      targets: t,
      y: top - 50 / this.userZoom,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // ------------------------------------------------------------------ frame

  update(time: number): void {
    const now = this.controller.now();
    if (time - this.lastTickAt > 250) {
      this.lastTickAt = time;
      this.controller.tick();
      this.updateBubbles(now);
    }
    this.updateTimers(now);
    this.positionBubbles(time);
    this.updatePinch();
  }

  // ------------------------------------------------------------------ camera

  private applyZoom(): void {
    this.cameras.main.setZoom(this.userZoom * this.renderScale);
    for (const view of this.views.values()) view.timer?.box.setScale(1 / this.userZoom);
    this.updateBubbles(this.controller.now());
    this.drawSelection();
    if (this.placement) this.drawPlacement();
  }

  /** Zoom so the world point under (sx, sy) stays under the finger/cursor. */
  private zoomAt(sx: number, sy: number, newUserZoom: number): void {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(newUserZoom, this.minZoom(), MAX_ZOOM);
    const ox = cam.width * cam.originX;
    const oy = cam.height * cam.originY;
    const wx = (sx - ox) / cam.zoom + ox + cam.scrollX;
    const wy = (sy - oy) / cam.zoom + oy + cam.scrollY;
    this.userZoom = z;
    this.applyZoom();
    cam.scrollX = wx - ox - (sx - ox) / cam.zoom;
    cam.scrollY = wy - oy - (sy - oy) / cam.zoom;
  }

  /** Never zoom out so far that the view is bigger than the map area (keeps the map centred and filling the screen). */
  private minZoom(): number {
    const b = this.cameras.main.getBounds();
    const cssW = this.scale.width / this.renderScale;
    const cssH = this.scale.height / this.renderScale;
    return Math.max(MIN_ZOOM, cssW / b.width, cssH / b.height);
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const ox = cam.width * cam.originX;
    const oy = cam.height * cam.originY;
    return { x: (sx - ox) / cam.zoom + ox + cam.scrollX, y: (sy - oy) / cam.zoom + oy + cam.scrollY };
  }

  private focusOn(id: string): void {
    const b = this.controller.state.buildings.find((v) => v.id === id);
    if (!b) return;
    const c = footprintCenter(b.x, b.y, buildingDef(this.controller.data, b.type).size);
    this.cameras.main.pan(c.x, c.y, 300, 'Sine.easeInOut');
  }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    this.input.addPointer(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('wheel', (p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      this.zoomAt(p.x, p.y, this.userZoom * (dy > 0 ? 0.88 : 1.12));
    });
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-ESC', () => {
        if (this.placement) this.bus.emit('placement:cancel');
        else this.bus.emit('select', null);
      });
      kb.on('keydown-ENTER', () => {
        if (this.placement) this.bus.emit('placement:confirm');
      });
      kb.on('keydown-PLUS', () => this.zoomAt(this.scale.width / 2, this.scale.height / 2, this.userZoom * 1.15));
      kb.on('keydown-MINUS', () => this.zoomAt(this.scale.width / 2, this.scale.height / 2, this.userZoom / 1.15));
    }
  }

  private activePointers(): Phaser.Input.Pointer[] {
    return this.input.manager.pointers.filter((p) => p.isDown);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const down = this.activePointers();
    if (down.length >= 2) {
      const [a, b] = down;
      this.pinch = { startDist: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), startZoom: this.userZoom };
      this.drag = null;
      return;
    }
    let mode: DragState['mode'] = 'pan';
    let grabDx = 0;
    let grabDy = 0;
    if (this.placement) {
      const w = this.screenToWorld(p.x, p.y);
      const t = worldToTile(w.x, w.y);
      const pl = this.placement;
      const onGhost =
        (t.tx >= pl.x - 0.5 && t.tx < pl.x + pl.size + 0.5 && t.ty >= pl.y - 0.5 && t.ty < pl.y + pl.size + 0.5) ||
        pl.ghost.getBounds().contains(w.x, w.y);
      if (onGhost) {
        mode = 'ghost';
        grabDx = Math.floor(t.tx) - pl.x;
        grabDy = Math.floor(t.ty) - pl.y;
      }
    }
    this.drag = { pointerId: p.id, startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, startTime: this.time.now, moved: false, mode, grabDx, grabDy };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d || d.pointerId !== p.id || !p.isDown || this.pinch) return;
    const slop = TAP_SLOP_CSS_PX * this.renderScale;
    if (!d.moved && Phaser.Math.Distance.Between(p.x, p.y, d.startX, d.startY) > slop) d.moved = true;
    if (!d.moved) return;
    if (d.mode === 'ghost' && this.placement) {
      const w = this.screenToWorld(p.x, p.y);
      const t = worldToTile(w.x, w.y);
      this.moveGhost(Math.floor(t.tx) - d.grabDx, Math.floor(t.ty) - d.grabDy);
    } else {
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - d.lastX) / cam.zoom;
      cam.scrollY -= (p.y - d.lastY) / cam.zoom;
    }
    d.lastX = p.x;
    d.lastY = p.y;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (this.activePointers().length < 2) this.pinch = null;
      this.drag = null;
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d || d.pointerId !== p.id || d.moved) return;
    const w = this.screenToWorld(p.x, p.y);
    this.onTap(w.x, w.y);
  }

  private updatePinch(): void {
    if (!this.pinch) return;
    const down = this.activePointers();
    if (down.length < 2) return;
    const [a, b] = down;
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    if (this.pinch.startDist < 10) return;
    const target = this.pinch.startZoom * (dist / this.pinch.startDist);
    if (Math.abs(target - this.userZoom) > 0.001) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target);
  }

  private onTap(wx: number, wy: number): void {
    const gd = this.controller.data;
    if (this.placement) {
      // Tap elsewhere to move the building there.
      const t = worldToTile(wx, wy);
      const half = Math.floor(this.placement.size / 2);
      this.moveGhost(Math.floor(t.tx) - half, Math.floor(t.ty) - half);
      return;
    }
    // 1. Collect bubbles.
    for (const [id, view] of this.views) {
      if (view.bubble && view.bubble.getBounds().contains(wx, wy)) {
        this.collect(id);
        return;
      }
    }
    // 2. Buildings: pixel-accurate hit on the art, front-most first; then the footprint.
    const hit = this.buildingAt(wx, wy);
    if (hit) {
      const def = buildingDef(gd, hit.type);
      if (def.produces && this.views.get(hit.id)?.bubble) this.collect(hit.id);
      this.selectedId = hit.id;
      this.drawSelection();
      this.bus.emit('select', hit.id);
      return;
    }
    this.selectedId = null;
    this.drawSelection();
    this.bus.emit('select', null);
  }

  private buildingAt(wx: number, wy: number): Building | null {
    const gd = this.controller.data;
    const byDepth = [...this.controller.state.buildings].sort((a, b) => {
      const sa = buildingDef(gd, a.type).size;
      const sb = buildingDef(gd, b.type).size;
      return depthFor(b.x, b.y, sb) - depthFor(a.x, a.y, sa);
    });
    for (const b of byDepth) {
      const view = this.views.get(b.id);
      if (!view) continue;
      const img = view.image;
      if (!img.getBounds().contains(wx, wy)) continue;
      const lx = (wx - img.x) / img.scaleX + img.originX * img.width;
      const ly = (wy - img.y) / img.scaleY + img.originY * img.height;
      if (this.textures.getPixelAlpha(Math.floor(lx), Math.floor(ly), view.key) > 40) return b;
    }
    const t = worldToTile(wx, wy);
    const tx = Math.floor(t.tx);
    const ty = Math.floor(t.ty);
    return (
      this.controller.state.buildings.find((b) => {
        const s = buildingDef(gd, b.type).size;
        return tx >= b.x && tx < b.x + s && ty >= b.y && ty < b.y + s;
      }) ?? null
    );
  }

  private collect(id: string): void {
    const r = this.controller.dispatch({ type: 'collect', id });
    if (r.ok) {
      for (const e of r.events) {
        if (e.kind !== 'collect') continue;
        this.floatText(id, `+${formatNumber(e.amount)}`, e.resource === 'dew' ? '#bfeaff' : '#ffd98a');
        this.bus.emit('collected', { id, resource: e.resource, amount: e.amount });
      }
    } else if (r.code !== 'NOTHING_TO_COLLECT') {
      this.bus.emit('toast', { text: r.message, kind: 'error' });
    }
  }

  // ------------------------------------------------------------------ placement

  private startPlacement(kind: 'new' | 'move', type?: string, id?: string): void {
    this.endPlacement();
    const gd = this.controller.data;
    const state = this.controller.state;
    let x: number;
    let y: number;
    if (kind === 'move') {
      const b = state.buildings.find((v) => v.id === id);
      if (!b) return;
      type = b.type;
      x = b.x;
      y = b.y;
    } else {
      if (!type) return;
      const size = buildingDef(gd, type).size;
      const cam = this.cameras.main;
      const center = worldToTile(cam.midPoint.x, cam.midPoint.y);
      const spot = findFreeSpot(state, gd, type, center.tx - size / 2, center.ty - size / 2);
      if (!spot) {
        this.bus.emit('toast', { text: 'There is no free space for that building.', kind: 'error' });
        return;
      }
      x = spot.x;
      y = spot.y;
    }
    const size = buildingDef(gd, type!).size;
    const key = buildingTexture(this.textures, type!, 1, size);
    const tex = this.textures.get(key);
    const o = buildingOrigin(tex, size);
    const ghost = this.add.image(0, 0, key).setOrigin(o.x, o.y).setScale(buildingScale(tex, size)).setAlpha(0.85).setDepth(OVERLAY_DEPTH - 5);
    const outline = this.add.graphics().setDepth(OVERLAY_DEPTH - 6);
    this.placement = { kind, type: type!, id, x, y, size, ghost, outline, valid: false };
    this.selectedId = null;
    this.bus.emit('select', null);
    this.sync();
    this.moveGhost(x, y);
  }

  private moveGhost(x: number, y: number): void {
    const pl = this.placement;
    if (!pl) return;
    const map = this.controller.data.economy.mapSize;
    pl.x = Phaser.Math.Clamp(x, 0, map - pl.size);
    pl.y = Phaser.Math.Clamp(y, 0, map - pl.size);
    pl.valid = canPlace(this.controller.state, this.controller.data, pl.type, pl.x, pl.y, pl.id).ok;
    this.drawPlacement();
    this.bus.emit('placement:changed', { active: true, valid: pl.valid });
  }

  private drawPlacement(): void {
    const pl = this.placement;
    if (!pl) return;
    const c = footprintCenter(pl.x, pl.y, pl.size);
    pl.ghost.setPosition(c.x, c.y);
    pl.ghost.setTint(pl.valid ? 0xffffff : 0xff9090);
    const g = pl.outline;
    g.clear();
    const pts = footprintCorners(pl.x, pl.y, pl.size).map((p) => new Phaser.Math.Vector2(p.x, p.y));
    g.fillStyle(pl.valid ? 0x7cff6b : 0xff5a4a, 0.35);
    g.fillPoints(pts, true);
    g.lineStyle(3 / this.userZoom, pl.valid ? 0xeaffd8 : 0xffd0c8, 1);
    g.strokePoints(pts, true);
  }

  private confirmPlacement(): void {
    const pl = this.placement;
    if (!pl) return;
    if (!pl.valid) {
      this.bus.emit('toast', { text: "That spot isn't free.", kind: 'error' });
      return;
    }
    const r =
      pl.kind === 'new'
        ? this.controller.dispatch({ type: 'place', buildingType: pl.type, x: pl.x, y: pl.y })
        : this.controller.dispatch({ type: 'move', id: pl.id!, x: pl.x, y: pl.y });
    if (!r.ok) {
      this.bus.emit('toast', { text: r.message, kind: 'error' });
      return;
    }
    const id = pl.kind === 'new' ? r.state.buildings[r.state.buildings.length - 1].id : pl.id!;
    this.endPlacement();
    this.selectedId = id;
    this.drawSelection();
    this.bus.emit('select', id);
  }

  private endPlacement(): void {
    if (!this.placement) return;
    this.placement.ghost.destroy();
    this.placement.outline.destroy();
    this.placement = null;
    this.bus.emit('placement:changed', { active: false, valid: false });
    this.sync();
  }
}
