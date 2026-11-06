/**
 * Rendering quality (audit R03, recommendation 5): a lighter profile for inexpensive phones.
 *
 * - `high` is the original look: canvas at the screen's density up to 3x, 60 FPS, the
 *   high-performance GPU, buildings drawn at 2.5x, warriors and badges at 3x, the island at 1.5x.
 * - `low` caps the canvas at 2x, runs at 30 FPS on the default GPU, draws buildings at 1.5x,
 *   warriors and badges at 2x and the island at 1x, generates building tier art only when a
 *   building at that tier is shown, and uses fewer decorative particles and cloud wisps.
 *
 * The profile is picked once at start-up (textures are generated from it), from, in order:
 * `?quality=low|high` in the address, the player's stored choice (`tk.quality`), then cheap
 * device signals (`autoProfile`). A new choice takes effect on the next start.
 *
 * The automatic rule (client re-audit item 4):
 * - Browsers that report memory (Chrome, Android WebView): low at 3 GB or less, and at 4 GB on a
 *   touch device (a 4 GB, 8-core, 2.6x Android phone is mid-range: a 3x canvas plus 2.5x/3x
 *   textures is too much for it). Desktops with 4 GB stay high.
 * - Safari and Firefox report no memory, and iOS reports 4 cores on every iPhone, so cores say
 *   nothing there. On iOS: home-button iPhones (a 320/375/414 x 568/667/736 screen: SE, 6s-8 Plus,
 *   2-3 GB) are low; every other iPhone and iPad is high unless the canvas benchmark is slow.
 *   Elsewhere without memory: a touch device with 4 cores or fewer is low.
 * - A short canvas benchmark (`measureFillMs`, ~2 ms on a recent phone) sends a device to low when
 *   drawing is several times slower than a mid-range phone (`SLOW_FILL_MS`), whatever the other
 *   signals say. It never raises a device to high. Report section 5 step 3 (device F2): it runs
 *   on every browser now; it used to be skipped wherever memory is reported (all of Android), so a
 *   6-8 GB phone with a weak GPU was judged by its memory alone.
 * - Canvas pixels (report section 5 step 3): on high, an Android or other non-iOS touch device
 *   with less than 8 GB (or that hides its memory) draws at most `CANVAS_PIXEL_BUDGET` canvas
 *   pixels, so a cheap 1080x2400 phone at DPR 2.6-3 no longer fills a 3x canvas every frame.
 * - Measured frames: while a battle runs on an automatic `high`, the frame rate is sampled once a
 *   second (`noteBattleFps`); if the median of `FPS_SAMPLES` stays under `FPS_DOWNGRADE`, the next
 *   start uses `low` (`tk.quality.measured`) and the player is told. The player's own choice in
 *   Settings always wins.
 *
 * Browser emulation and texture sums (`npm run perf:lowend -- --quality`) are estimates, not a
 * physical cheap-phone measurement.
 */

export type QualityProfile = 'high' | 'low';
/** What the player picked in Settings: `auto` follows the device signals. */
export type QualityChoice = 'auto' | QualityProfile;

/** localStorage key holding the player's choice. */
export const QUALITY_STORAGE_KEY = 'tk.quality';

export interface QualitySettings {
  profile: QualityProfile;
  /** Why this profile was picked, in words (for Settings and perf logs). */
  reason: string;
  /** The canvas never draws at more than this many pixels per CSS pixel. */
  maxRenderScale: number;
  /** Frames per second the game aims for (low also limits the loop to it). */
  fps: number;
  powerPreference: 'high-performance' | 'default';
  /** Resolution of generated building, construction and rubble art. */
  buildingScale: number;
  /** Resolution of generated warriors and warrior badges (`HD_SCALE`). */
  hdScale: number;
  /** Resolution of the generated island (lowered further if the GPU can't hold it). */
  groundScale: number;
  /** Generate building tier art on first use instead of all tiers at start. */
  lazyTiers: boolean;
  /** Multiplier for decorative particle counts (confetti, resource bursts, debris). */
  particleScale: number;
  /** Cloud wisps drifting around the plateau. */
  wispCount: number;
  /**
   * Megabytes of code-painted building art kept (one copy's pixels; `render/textureBudget.ts`).
   * Art the current scenes show is always kept; beyond this, the least recently used is removed
   * and painted again if needed (report section 5 step 3).
   */
  paintedBudgetMB: number;
}

/** Cheap signals about the device, read once. Each is optional: browsers expose different ones. */
export interface QualitySignals {
  /** `navigator.deviceMemory` in GB (Chrome-based browsers only; rounded to a power of two). */
  deviceMemory?: number;
  /** `navigator.hardwareConcurrency` (logical cores). */
  hardwareConcurrency?: number;
  devicePixelRatio?: number;
  /** Shorter screen side in CSS pixels. */
  screenShort?: number;
  /** Touch is the main input (`pointer: coarse`). */
  coarsePointer?: boolean;
  /** `prefers-reduced-motion: reduce`: lowers effects only, never the profile. */
  reducedMotion?: boolean;
  /** iPhone, iPad or iPod (WebKit on iOS reports 4 cores everywhere and no memory). */
  ios?: boolean;
  /** Longer screen side in CSS pixels. */
  screenLong?: number;
  /** `measureFillMs()`: the canvas benchmark, best of three, in ms. */
  fillMs?: number;
  /** An earlier session measured slow battles on high (`noteBattleFps`). */
  measuredSlow?: boolean;
}

/** A canvas benchmark slower than this (best of three) means a slow phone: ~5x a 2024 laptop core, ~2x a mid-range phone. */
export const SLOW_FILL_MS = 12;
/** Canvas pixels a mid-range non-iOS touch device draws at most on high (about 1080x2220). */
export const CANVAS_PIXEL_BUDGET = 2_400_000;
/** Frame-rate samples (one a second, in battle) before a verdict. */
export const FPS_SAMPLES = 20;
/** A battle median under this on high means the phone cannot keep up: low from the next start. */
export const FPS_DOWNGRADE = 40;
/** localStorage key: a session measured slow battles on high. */
export const MEASURED_STORAGE_KEY = 'tk.quality.measured';

/** Home-button iPhones (SE 1st-3rd gen, 6s-8 and Plus): 2-3 GB of memory, the oldest iOS 15 devices. */
function homeButtonIphone(s: QualitySignals): boolean {
  const short = s.screenShort ?? 0;
  const long = s.screenLong ?? 0;
  return Boolean(s.ios) && short > 0 && short <= 414 && long > 0 && long <= 736;
}

const HIGH: Omit<QualitySettings, 'profile' | 'reason'> = {
  maxRenderScale: 3,
  fps: 60,
  powerPreference: 'high-performance',
  buildingScale: 2.5,
  hdScale: 3,
  groundScale: 1.5,
  lazyTiers: false,
  particleScale: 1,
  wispCount: 60,
  paintedBudgetMB: 64,
};

const LOW: Omit<QualitySettings, 'profile' | 'reason'> = {
  maxRenderScale: 2,
  fps: 30,
  powerPreference: 'default',
  buildingScale: 1.5,
  hdScale: 2,
  groundScale: 1,
  lazyTiers: true,
  particleScale: 0.5,
  wispCount: 24,
  paintedBudgetMB: 24,
};

function isProfile(v: unknown): v is QualityProfile {
  return v === 'high' || v === 'low';
}

/** Pick a profile from device signals alone (the rule is in the header comment). */
export function autoProfile(s: QualitySignals): { profile: QualityProfile; reason: string } {
  // The benchmark speaks first, on every browser (report section 5 step 3, device F2).
  if (s.fillMs !== undefined && s.fillMs > SLOW_FILL_MS) return { profile: 'low', reason: `slow drawing (${s.fillMs.toFixed(1)} ms test)` };
  if (s.deviceMemory !== undefined) {
    if (s.deviceMemory <= 3) return { profile: 'low', reason: `device memory ${s.deviceMemory} GB` };
    if (s.deviceMemory <= 4 && s.coarsePointer) return { profile: 'low', reason: `${s.deviceMemory} GB phone or tablet` };
    return { profile: 'high', reason: `device memory ${s.deviceMemory} GB` };
  }
  if (s.ios) {
    if (homeButtonIphone(s)) return { profile: 'low', reason: 'older iPhone (home-button screen)' };
    return { profile: 'high', reason: 'iPhone or iPad' };
  }
  // Core count alone is weak evidence on a desktop (Safari/Firefox hide memory), so it only counts on phones and tablets.
  if (s.coarsePointer && s.hardwareConcurrency !== undefined && s.hardwareConcurrency <= 4) {
    return { profile: 'low', reason: `${s.hardwareConcurrency} CPU cores` };
  }
  return { profile: 'high', reason: 'device signals' };
}

/**
 * A ~2 ms canvas test (best of three): gradient-filled curves on a small canvas, then a one-pixel
 * read so the drawing really happens. The game's start-up cost is this kind of drawing (textures
 * are painted in code), so it is the signal that matters when the browser hides its memory.
 */
export function measureFillMs(): number | undefined {
  try {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx || typeof performance === 'undefined') return undefined;
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      for (let i = 0; i < 16; i++) {
        const g = ctx.createLinearGradient(0, 0, 128, 128);
        g.addColorStop(0, `hsl(${i * 7 + run},60%,50%)`);
        g.addColorStop(1, '#223');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(10 + i, 20);
        ctx.bezierCurveTo(120, 10 + i, 10, 120, 110 - i, 110);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.getImageData(0, 0, 1, 1);
      best = Math.min(best, performance.now() - t0);
    }
    return Number.isFinite(best) ? best : undefined;
  } catch {
    return undefined;
  }
}

/** Decide the settings from the address, the stored choice and the device. Pure, for tests. */
export function resolveQuality(search: string, choice: QualityChoice, signals: QualitySignals): QualitySettings {
  let picked: { profile: QualityProfile; reason: string };
  const fromUrl = new URLSearchParams(search).get('quality');
  if (isProfile(fromUrl)) picked = { profile: fromUrl, reason: 'address (?quality)' };
  else if (isProfile(choice)) picked = { profile: choice, reason: 'player choice' };
  else if (signals.measuredSlow) picked = { profile: 'low', reason: 'slow battles measured on this device' };
  else picked = autoProfile(signals);
  const base = picked.profile === 'low' ? LOW : HIGH;
  const settings: QualitySettings = { ...base, ...picked };
  // Canvas pixels on mid-range non-iOS touch devices (report section 5 step 3, device F2).
  if (settings.profile === 'high' && signals.coarsePointer && !signals.ios && !((signals.deviceMemory ?? 0) >= 8)) {
    const css = (signals.screenShort ?? 0) * (signals.screenLong ?? 0);
    if (css > 0) settings.maxRenderScale = Math.max(2, Math.min(settings.maxRenderScale, Math.sqrt(CANVAS_PIXEL_BUDGET / css)));
  }
  // Reduced motion lightens decoration only; it never lowers resolution.
  if (signals.reducedMotion) {
    settings.particleScale = Math.min(settings.particleScale, 0.5);
    settings.wispCount = Math.min(settings.wispCount, 24);
  }
  return settings;
}

function storedFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * The verdict on battle frame rates (pure, for tests): null until `FPS_SAMPLES` samples, then
 * whether the median stayed under `FPS_DOWNGRADE`.
 */
export function slowBattles(samples: number[]): boolean | null {
  if (samples.length < FPS_SAMPLES) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] < FPS_DOWNGRADE;
}

const fpsSamples: number[] = [];
let fpsDecided = false;

/**
 * One frame-rate sample from a running battle (call about once a second). On an automatic `high`
 * whose battles stay slow, the next start uses `low`; returns the message to show, once.
 */
export function noteBattleFps(fps: number): string | null {
  if (fpsDecided || !Number.isFinite(fps) || fps <= 0) return null;
  const q = quality();
  // Only an automatic high: the player's own choice and ?quality are never second-guessed.
  if (q.profile !== 'high' || q.reason === 'player choice' || q.reason.startsWith('address')) {
    fpsDecided = true;
    return null;
  }
  fpsSamples.push(fps);
  const verdict = slowBattles(fpsSamples);
  if (verdict === null) return null;
  fpsDecided = true;
  if (!verdict) return null;
  try {
    globalThis.localStorage?.setItem(MEASURED_STORAGE_KEY, '1');
  } catch {
    return null;
  }
  return 'This phone drew battles slowly, so Kagemura will use lighter graphics from the next start. You can change it in Settings → Graphics.';
}

/** The player's stored choice (`auto` when none, or when storage is blocked). */
export function getQualityChoice(): QualityChoice {
  try {
    const v = globalThis.localStorage?.getItem(QUALITY_STORAGE_KEY);
    return isProfile(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Store the player's choice. Textures are generated once per start, so it applies after a
 * reload; returns true when the profile in use differs from what the new choice picks.
 */
export function setQualityChoice(choice: QualityChoice): boolean {
  try {
    if (choice === 'auto') globalThis.localStorage?.removeItem(QUALITY_STORAGE_KEY);
    else globalThis.localStorage?.setItem(QUALITY_STORAGE_KEY, choice);
    // A player who picks again starts from a clean measurement.
    globalThis.localStorage?.removeItem(MEASURED_STORAGE_KEY);
  } catch {
    /* storage blocked: the choice lasts until reload at most */
  }
  const next = typeof window === 'undefined' ? HIGH_DEFAULT.profile : resolveQuality(location.search, choice, readSignals()).profile;
  return next !== quality().profile;
}

/** Read the device signals (all optional; nothing here prompts or is slow). */
export function readSignals(): QualitySignals {
  if (typeof window === 'undefined') return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mq = (q: string): boolean => {
    try {
      return typeof matchMedia === 'function' && matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const sw = window.screen?.width || window.innerWidth || 0;
  const sh = window.screen?.height || window.innerHeight || 0;
  const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined;
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return {
    deviceMemory,
    ios,
    screenLong: sw && sh ? Math.max(sw, sh) : undefined,
    // Every browser (report section 5 step 3): memory alone does not tell a weak GPU apart.
    fillMs: measureFillMs(),
    measuredSlow: storedFlag(MEASURED_STORAGE_KEY),
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : undefined,
    devicePixelRatio: window.devicePixelRatio || 1,
    screenShort: sw && sh ? Math.min(sw, sh) : undefined,
    coarsePointer: mq('(pointer: coarse)'),
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
  };
}

const HIGH_DEFAULT: QualitySettings = { ...HIGH, profile: 'high', reason: 'no browser' };

let current: QualitySettings | null = null;

/** The settings for this session, decided on first call and then fixed until reload. */
export function quality(): QualitySettings {
  if (!current) current = typeof window === 'undefined' ? HIGH_DEFAULT : resolveQuality(location.search, getQualityChoice(), readSignals());
  return current;
}

/** Canvas pixels per CSS pixel for this session. */
export function renderScaleFor(q: QualitySettings = quality(), devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1): number {
  return Math.min(devicePixelRatio, q.maxRenderScale);
}
