import Phaser from 'phaser';

/** Touch pointers the game needs: two for pinch zoom, one spare. */
const TOUCH_POINTERS = 3;

const repaired = new WeakSet<Phaser.Game>();

/**
 * Sets up a scene for multi-touch, and (once per game) heals touch pointers Phaser has lost track of.
 *
 * Phaser also tracks touches that start on the page's DOM (the HUD), and releases them only when
 * `touchend` bubbles up to `window`. When that element is removed before the finger lifts (the HUD
 * rebuilds parts of itself several times a second), the `touchend` never arrives and the pointer
 * stays "down" for good. Every later one-finger drag then counts as a second finger, so the map
 * pinches instead of panning. Before each new touch is handled, any pointer whose finger is no
 * longer on the screen (`TouchEvent.touches` is the browser's own list) is cancelled.
 */
export function setupTouchInput(scene: Phaser.Scene): void {
  const manager = scene.input.manager;
  // Pointers belong to the whole game: adding them per scene grew the list on every battle.
  const touches = manager.pointers.length - 1;
  if (touches < TOUCH_POINTERS) scene.input.addPointer(TOUCH_POINTERS - touches);
  const game = scene.game;
  if (repaired.has(game)) return;
  repaired.add(game);
  const onTouchStart = (e: TouchEvent) => releaseStaleTouches(manager, e);
  // Capture phase: runs before Phaser's own listeners count the new finger.
  window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  game.events.once(Phaser.Core.Events.DESTROY, () => window.removeEventListener('touchstart', onTouchStart, { capture: true }));
}

/** Cancels every active touch pointer whose finger is not on the screen. Exported for tests. */
export function releaseStaleTouches(manager: Phaser.Input.InputManager, e: TouchEvent): number {
  const onScreen = new Set<number>();
  for (let i = 0; i < e.touches.length; i++) onScreen.add(e.touches[i].identifier);
  const stale: Touch[] = [];
  for (let i = 1; i < manager.pointers.length; i++) {
    const p = manager.pointers[i];
    if (!p.active || onScreen.has(p.identifier)) continue;
    // Where the finger was last seen, in page coordinates, so the release lands where it was.
    const last = p.event && 'changedTouches' in p.event ? findTouch(p.event.changedTouches, p.identifier) : null;
    stale.push({ identifier: p.identifier, pageX: last?.pageX ?? 0, pageY: last?.pageY ?? 0, clientX: last?.clientX ?? 0, clientY: last?.clientY ?? 0, target: last?.target ?? manager.canvas } as Touch);
  }
  // Scenes get a pointerup for each, so a pinch or drag waiting on it ends too.
  // onTouchCancel is public in Phaser's source but missing from its type definitions.
  const cancel = (manager as unknown as { onTouchCancel(ev: TouchEvent): void }).onTouchCancel.bind(manager);
  if (stale.length) cancel({ changedTouches: stale, timeStamp: e.timeStamp } as unknown as TouchEvent);
  return stale.length;
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
  return null;
}
