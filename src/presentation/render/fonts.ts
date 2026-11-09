/**
 * Chinese canvas text names Chinese fonts before the system font (as styles.css does for the HUD): Han code
 * points are shared with Japanese, and a Japanese-first fallback draws Japanese glyph forms. The start-up script
 * sets <html data-script> before any module runs, and changing the language reloads the page.
 */
const HAN_FONTS: Record<string, string> = {
  Hans: '"M PLUS 1 Han", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", ',
  Hant: '"M PLUS 1 Han", "PingFang TC", "PingFang HK", "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans CJK TC", "Noto Sans TC", ',
};
const han = HAN_FONTS[typeof document === 'undefined' ? '' : document.documentElement.getAttribute('data-script') ?? ''];
/** Font stacks for canvas text, matching the HUD (src/presentation/ui/styles.css, fonts in ui/fonts). */
export const BODY_FONT = han ? `${han}"Segoe UI", system-ui, -apple-system, Roboto, sans-serif` : '"M PLUS 1", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
/** Titles and big labels. Dela Gothic One has one weight: draw it at normal weight, never bold. */
export const DISPLAY_FONT = han ? `"Dela Gothic One", ${han}"Segoe UI", system-ui, sans-serif` : '"Dela Gothic One", "M PLUS 1", "Segoe UI", system-ui, sans-serif';

/**
 * Wait (briefly) for the interface fonts, so canvas labels drawn at start-up use them:
 * canvas text, unlike DOM text, is not redrawn when a font arrives later.
 */
export async function loadInterfaceFonts(timeoutMs = 1500): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const all = Promise.all([
    document.fonts.load(`700 15px ${BODY_FONT}`),
    document.fonts.load(`800 15px ${BODY_FONT}`),
    document.fonts.load(`400 20px ${DISPLAY_FONT}`),
  ]).then(() => undefined, () => undefined);
  await Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
