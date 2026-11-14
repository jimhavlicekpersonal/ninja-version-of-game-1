/**
 * Chinese, Japanese, Korean and Thai canvas text names its own fonts (Chinese fonts for Chinese, Japanese for Japanese) before the system font (as styles.css does for the HUD): Han code
 * points are shared with Japanese, and a Japanese-first fallback draws Japanese glyph forms. The start-up script
 * sets <html data-script> before any module runs, and changing the language reloads the page.
 */
const HAN_FONTS: Record<string, string> = {
  Hans: '"M PLUS 1 Han", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", ',
  Hant: '"M PLUS 1 Han", "PingFang TC", "PingFang HK", "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans CJK TC", "Noto Sans TC", ',
  // Japanese: without a named Japanese font, canvas kana and kanji fell to whatever system font the browser picked
  // (on Windows sometimes a Chinese one).
  Jpan: '"M PLUS 1 Han", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", Meiryo, ',
  // Korean: Korean system fonts before the shared fallback, whose Japanese fonts draw any Hangul they have in Japanese metrics.
  Kore: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", "Source Han Sans KR", ',
  // Thai: Thai system fonts first, so vowel and tone marks stack in a font designed for them.
  Thai: '"Thonburi", "Sukhumvit Set", "Leelawadee UI", "Leelawadee", "Noto Sans Thai", "Noto Sans Thai UI", ',
};
const han = HAN_FONTS[typeof document === 'undefined' ? '' : document.documentElement.getAttribute('data-script') ?? ''];
/**
 * Latin-script languages with letters the bundled subsets lack (Romanian ă ș ț, Vietnamese ă ơ ư đ and stacked tone marks): their canvas text uses the system font
 * throughout, so a word never mixes two typefaces (styles.css has the same list for the HUD).
 */
export const SYSTEM_FONT_LANGS: readonly string[] = ['ro', 'vi', 'tr', 'pl', 'ha'];
const systemOnly = typeof document !== 'undefined' && SYSTEM_FONT_LANGS.includes(document.documentElement.lang);
/** Font stacks for canvas text, matching the HUD (src/presentation/ui/styles.css, fonts in ui/fonts). */
export const BODY_FONT = han ? `${han}"Segoe UI", system-ui, -apple-system, Roboto, sans-serif` : systemOnly ? '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif' : '"M PLUS 1", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
/** Titles and big labels. Dela Gothic One has one weight: draw it at normal weight, never bold. */
export const DISPLAY_FONT = han ? `"Dela Gothic One", ${han}"Segoe UI", system-ui, sans-serif` : systemOnly ? '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif' : '"Dela Gothic One", "M PLUS 1", "Segoe UI", system-ui, sans-serif';

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
