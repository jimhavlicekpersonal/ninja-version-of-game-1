import Phaser from 'phaser';

const TAP_SLOP_CSS_PX = 10;
const MAX_ZOOM = 2;
const MIN_ZOOM = 0.3;

export interface CameraControlOptions {
  renderScale: number;
  onTap?: (worldX: number, worldY: number) => void;
  /** Called while a finger/mouse is held still (for repeated deploys). */
  onHold?: (worldX: number, worldY: number) => void;
  onZoom?: (userZoom: number) => void;
}

/** Pan (with glide), pinch, wheel zoom and tap detection for a scene's main camera. */
export class CameraControl {
  userZoom = 0.6;
  private drag: { id: number; sx: number; sy: number; lx: number; ly: number; lt: number; moved: boolean; t0: number } | null = null;
  private pinch: { d0: number; z0: number } | null = null;
  private glide = { vx: 0, vy: 0 };
  private wheel: { zoom: number; x: number; y: number } | null = null;
  private holdTimer = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: CameraControlOptions,
  ) {
    const input = scene.input;
    input.addPointer(2);
    input.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
    input.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    input.on('pointerup', (p: Phaser.Input.Pointer) => this.up(p));
    input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.up(p));
    input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const base = this.wheel?.zoom ?? this.userZoom;
      this.wheel = { zoom: Phaser.Math.Clamp(base * (dy > 0 ? 0.85 : 1.18), this.minZoom(), MAX_ZOOM), x: p.x, y: p.y };
    });
    const onResize = () => this.zoomAt(scene.scale.width / 2, scene.scale.height / 2, this.userZoom);
    scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }

  setBounds(x: number, y: number, w: number, h: number): void {
    this.scene.cameras.main.setBounds(x, y, w, h);
  }

  minZoom(): number {
    const b = this.scene.cameras.main.getBounds();
    const cssW = this.scene.scale.width / this.opts.renderScale;
    const cssH = this.scene.scale.height / this.opts.renderScale;
    return Math.max(MIN_ZOOM, cssW / b.width, cssH / b.height);
  }

  setZoom(z: number): void {
    this.userZoom = Phaser.Math.Clamp(z, this.minZoom(), MAX_ZOOM);
    this.scene.cameras.main.setZoom(this.userZoom * this.opts.renderScale);
    this.opts.onZoom?.(this.userZoom);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    const ox = cam.width * cam.originX;
    const oy = cam.height * cam.originY;
    return { x: (sx - ox) / cam.zoom + ox + cam.scrollX, y: (sy - oy) / cam.zoom + oy + cam.scrollY };
  }

  zoomAt(sx: number, sy: number, z: number): void {
    const cam = this.scene.cameras.main;
    const w = this.screenToWorld(sx, sy);
    this.setZoom(z);
    const ox = cam.width * cam.originX;
    const oy = cam.height * cam.originY;
    cam.scrollX = w.x - ox - (sx - ox) / cam.zoom;
    cam.scrollY = w.y - oy - (sy - oy) / cam.zoom;
  }

  update(delta: number): void {
    const cam = this.scene.cameras.main;
    const down = this.scene.input.manager.pointers.filter((p) => p.isDown);
    if (this.pinch && down.length >= 2) {
      const [a, b] = down;
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      if (this.pinch.d0 > 10) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, this.pinch.z0 * (d / this.pinch.d0));
    }
    if (!this.drag && !this.pinch && (Math.abs(this.glide.vx) > 0.005 || Math.abs(this.glide.vy) > 0.005)) {
      cam.scrollX -= this.glide.vx * delta;
      cam.scrollY -= this.glide.vy * delta;
      const k = Math.pow(0.9, delta / 16.7);
      this.glide.vx *= k;
      this.glide.vy *= k;
    }
    if (this.wheel) {
      const w = this.wheel;
      const nz = this.userZoom + (w.zoom - this.userZoom) * Math.min(1, delta / 70);
      this.zoomAt(w.x, w.y, Math.abs(w.zoom - nz) < 0.002 ? w.zoom : nz);
      if (Math.abs(this.userZoom - w.zoom) < 0.002) this.wheel = null;
    }
    if (this.drag && !this.drag.moved && this.opts.onHold) {
      this.holdTimer += delta;
      if (this.holdTimer > 350) {
        this.holdTimer = 230;
        const p = this.screenToWorld(this.drag.lx, this.drag.ly);
        this.opts.onHold(p.x, p.y);
      }
    }
  }

  private down(p: Phaser.Input.Pointer): void {
    const down = this.scene.input.manager.pointers.filter((q) => q.isDown);
    if (down.length >= 2) {
      const [a, b] = down;
      this.pinch = { d0: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z0: this.userZoom };
      this.drag = null;
      return;
    }
    this.glide = { vx: 0, vy: 0 };
    this.holdTimer = 0;
    const t = this.scene.time.now;
    this.drag = { id: p.id, sx: p.x, sy: p.y, lx: p.x, ly: p.y, lt: t, moved: false, t0: t };
  }

  private move(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d || d.id !== p.id || !p.isDown || this.pinch) return;
    if (!d.moved && Phaser.Math.Distance.Between(p.x, p.y, d.sx, d.sy) > TAP_SLOP_CSS_PX * this.opts.renderScale) d.moved = true;
    if (!d.moved) return;
    const cam = this.scene.cameras.main;
    const dx = (p.x - d.lx) / cam.zoom;
    const dy = (p.y - d.ly) / cam.zoom;
    cam.scrollX -= dx;
    cam.scrollY -= dy;
    const now = this.scene.time.now;
    const dt = Math.max(1, now - d.lt);
    this.glide.vx = this.glide.vx * 0.6 + (dx / dt) * 0.4;
    this.glide.vy = this.glide.vy * 0.6 + (dy / dt) * 0.4;
    d.lx = p.x;
    d.ly = p.y;
    d.lt = now;
  }

  private up(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (this.scene.input.manager.pointers.filter((q) => q.isDown).length < 2) this.pinch = null;
      this.drag = null;
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d || d.id !== p.id) return;
    if (d.moved) {
      if (this.scene.time.now - d.lt > 80) this.glide = { vx: 0, vy: 0 };
      return;
    }
    const w = this.screenToWorld(p.x, p.y);
    this.opts.onTap?.(w.x, w.y);
  }
}
