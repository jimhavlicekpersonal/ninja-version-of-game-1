/**
 * A memory budget for code-painted building art (report section 5 step 3, device F1).
 *
 * Every building type × level is painted on first use, and each texture used to stay for the
 * whole session: the GPU copy plus the canvas it was painted on. Scouting bases at other Keeps,
 * replays, Shadow Trials and the Build menu's thumbnails kept adding to it (about 200 MB of
 * building art alone on the high profile after enough scouting), which is what kills the game on
 * a 2 GB phone or leaves blank canvases on iOS Safari.
 *
 * Painted textures are counted here (pixel bytes of one copy) in least-recently-used order. A
 * scene says which keys it shows (`hold`), and those are never removed; once the total passes the
 * profile's budget, the least recently used unheld ones are removed. A removed look is painted
 * again the next time it is needed (a few milliseconds). Pure: tested without Phaser.
 */
export class TextureBudget {
  /** key → bytes, in least-recently-used order (a Map keeps insertion order). */
  private readonly painted = new Map<string, number>();
  private readonly holders = new Map<string, Set<string>>();
  private total = 0;

  constructor(
    private readonly budgetBytes: number,
    /** Removes a texture (Phaser's `textures.remove`, plus its canvas). */
    private readonly remove: (key: string) => void,
  ) {}

  /**
   * A texture was just painted. Nothing is removed here: a scene may be in the middle of making
   * images from textures it has not declared yet. Removal happens at `hold` and `release`, when
   * the scene has said everything it shows.
   */
  added(key: string, bytes: number): void {
    const old = this.painted.get(key);
    if (old !== undefined) this.total -= old;
    this.painted.delete(key);
    this.painted.set(key, bytes);
    this.total += bytes;
  }

  /** A painted texture was used again: it becomes the most recently used. */
  touch(key: string): void {
    const b = this.painted.get(key);
    if (b === undefined) return;
    this.painted.delete(key);
    this.painted.set(key, b);
  }

  /** `owner` (a scene) shows these keys now; the previous set of that owner is replaced. */
  hold(owner: string, keys: Iterable<string>): void {
    const set = new Set(keys);
    for (const k of set) this.touch(k);
    this.holders.set(owner, set);
    this.evict();
  }

  /** `owner` shows nothing any more (its scene shut down). */
  release(owner: string): void {
    this.holders.delete(owner);
    this.evict();
  }

  /**
   * Low memory (device F19): remove every painted texture no holder shows now, whatever the
   * budget. They are painted again when needed.
   */
  trim(): void {
    this.evict(0);
  }

  /** Bytes of painted textures currently kept. */
  get bytes(): number {
    return this.total;
  }

  /** Keys currently kept, least recently used first (tests, perf logs). */
  keys(): string[] {
    return [...this.painted.keys()];
  }

  private held(key: string): boolean {
    for (const set of this.holders.values()) if (set.has(key)) return true;
    return false;
  }

  private evict(limit = this.budgetBytes): void {
    if (this.total <= limit) return;
    for (const [key, bytes] of [...this.painted]) {
      if (this.total <= limit) break;
      if (this.held(key)) continue;
      this.painted.delete(key);
      this.total -= bytes;
      this.remove(key);
    }
  }
}
