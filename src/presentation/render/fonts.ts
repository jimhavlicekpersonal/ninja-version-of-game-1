/** Font stacks for canvas text, matching the HUD (src/presentation/ui/styles.css, fonts in ui/fonts). */
export const BODY_FONT = '"M PLUS 1", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
export const DISPLAY_FONT = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif';

/**
 * Wait (briefly) for the interface fonts, so canvas labels drawn at start-up use them:
 * canvas text, unlike DOM text, is not redrawn when a font arrives later.
 */
export async function loadInterfaceFonts(timeoutMs = 1500): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const all = Promise.all([
    document.fonts.load(`700 15px ${BODY_FONT}`),
    document.fonts.load(`800 15px ${BODY_FONT}`),
    document.fonts.load(`800 20px ${DISPLAY_FONT}`),
  ]).then(() => undefined, () => undefined);
  await Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
