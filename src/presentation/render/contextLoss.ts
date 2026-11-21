/**
 * Beast Mode 2026-11-21 STB-06: a lost WebGL context that the browser never restores left a black canvas under the
 * HUD with no message and no way back. `watchContext` hears the renderer's lose and restore events and calls
 * `onStuck` once the context has stayed lost for `stuckMs` of visible time (time while the page is hidden does not
 * count: browsers restore contexts when the page returns). Presentation only; the reporter call stays in main.ts.
 */
export interface ContextEvents {
  on(event: string, fn: () => void): unknown;
}

export interface ContextWatch {
  onLost(): void;
  onRestored(): void;
  onStuck(): void;
}

export const LOSE_EVENT = 'losewebgl';
export const RESTORE_EVENT = 'restorewebgl';

export function watchContext(renderer: ContextEvents, hooks: ContextWatch, o: { stuckMs?: number; visible?: () => boolean; tickMs?: number } = {}): () => void {
  const stuckMs = o.stuckMs ?? 8000;
  const tickMs = o.tickMs ?? 500;
  const visible = o.visible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  let lostFor = -1; // visible ms since the loss, -1 while the context is fine
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  renderer.on(LOSE_EVENT, () => {
    hooks.onLost();
    lostFor = 0;
    stop();
    timer = setInterval(() => {
      if (lostFor < 0) return stop();
      if (!visible()) return;
      lostFor += tickMs;
      if (lostFor >= stuckMs) {
        stop();
        lostFor = -1;
        hooks.onStuck();
      }
    }, tickMs);
  });
  renderer.on(RESTORE_EVENT, () => {
    lostFor = -1;
    stop();
    hooks.onRestored();
  });
  return stop;
}
