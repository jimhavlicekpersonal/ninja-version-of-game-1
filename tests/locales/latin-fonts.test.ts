import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import availability from '../../locales/availability.json';
import { languages } from '../../tools/i18n/lib.mjs';
import { SYSTEM_FONT_LANGS } from '../../src/presentation/render/fonts';

// The bundled fonts are Latin subsets and fonts are never downloaded (owner decision). A ready Latin-script
// language whose letters fall outside the subsets would draw those letters in a system font inside an otherwise
// bundled-font word, so it must be listed in SYSTEM_FONT_LANGS (canvas) and styles.css (HUD) to use the phone's fonts.
const css = readFileSync(join(__dirname, '../../src/presentation/ui/styles.css'), 'utf8');
const face = /@font-face\s*\{[^}]*font-family:\s*'M PLUS 1';[^}]*unicode-range:\s*([^;]+);/.exec(css)![1];
const ranges = face.split(',').map(r => r.trim().replace(/^U\+/i, '').split('-').map(h => parseInt(h, 16))).map(([a, b]) => [a, b ?? a]);
const covered = (cp: number) => ranges.some(([a, b]) => cp >= a && cp <= b);
// Letters English already shows (proper names such as Gorō) are not the language's own; only its additions count.
const english = new Set(Object.values(JSON.parse(readFileSync(join(__dirname, '../../locales/compiled/en.json'), 'utf8')) as Record<string, string>).join(''));

describe('Latin-script languages and the bundled font subsets', () => {
  const ready = languages().languages.filter(l => l.script === 'Latn' && l.code !== 'en' && (availability as Record<string, { ready: boolean }>)[l.code]?.ready);
  it.each(ready.map(l => l.code))('%s: every letter is in the subsets, or the language uses system fonts throughout', code => {
    const pack = JSON.parse(readFileSync(join(__dirname, `../../locales/compiled/${code}.json`), 'utf8')) as Record<string, string>;
    const missing = [...new Set(Object.values(pack).join(''))].filter(ch => /\p{Script=Latin}/u.test(ch) && !covered(ch.codePointAt(0)!) && !english.has(ch));
    if (missing.length) {
      expect(SYSTEM_FONT_LANGS, `${code} uses ${missing.join(' ')}`).toContain(code);
      expect(css).toContain(`[lang="${code}"]`);
    } else expect(SYSTEM_FONT_LANGS).not.toContain(code);
  });
});
