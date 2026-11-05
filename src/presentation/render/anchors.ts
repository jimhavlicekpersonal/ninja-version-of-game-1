/**
 * Where things on the map are on screen, for DOM overlays that point at them (the tutorial ring). A scene registers a
 * locator while it runs; the HUD asks by building type. Rects are CSS px in viewport coordinates.
 */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Locator = (buildingType: string) => ScreenRect | null;

let locator: Locator | null = null;

/** Called by the village scene; returns the function that removes it again. */
export function provideBuildingLocator(fn: Locator): () => void {
  locator = fn;
  return () => {
    if (locator === fn) locator = null;
  };
}

/** The first building of this type on screen, or null (no scene, none built, or off screen). */
export function buildingOnScreen(buildingType: string): ScreenRect | null {
  try {
    return locator?.(buildingType) ?? null;
  } catch {
    return null;
  }
}
