/**
 * Pseudo-locales (localization CSS step of the GUI batch 2026-11-13): a right-to-left one written in Hebrew letters
 * and a stretched one 40% longer than English. They check what can be checked without a browser: every interface
 * message still formats (placeholders, plurals) when its words are replaced, a right-to-left language turns the page
 * direction, and the CSS keeps the overflow guards that long translations need. The pages themselves were looked at
 * in Chromium with both pseudo-locales (docs/store/WORLDWIDE_AUDIT.md, 2026-11-13 GUI batch).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGLISH, translate, type Catalog } from '../../../locales/runtime';
import { isRtl, language, useLanguage } from '../../../src/presentation/ui/i18n';
import kindsFile from '../../../locales/message-parameters.json';

/** Parameters the runtime rewrites itself (dates, costs, nested sentences): their text legitimately changes. */
const kinds = kindsFile as Record<string, Record<string, string>>;

const css = readFileSync(join(__dirname, '../../../src/presentation/ui/styles.css'), 'utf8');
afterEach(() => useLanguage('en'));

/**
 * Rewrite only the words of a message: placeholders, ICU heads, branch selectors and `#` stay exactly as they are.
 * A small recursive reader of the ICU subset the catalogs use ({x}, {n, plural, one {…} other {…}}, select).
 */
function pseudo(msg: string, word: (text: string) => string): string {
  const read = (start: number, inBranch: boolean): [string, number] => {
    let i = start;
    let out = '';
    let text = '';
    const flush = () => {
      out += word(text);
      text = '';
    };
    while (i < msg.length) {
      const c = msg[i];
      if (c === '}' && inBranch) break;
      if (c === '#' && inBranch) {
        flush();
        out += c;
        i++;
        continue;
      }
      const head = c === '{' ? /^\{([A-Za-z0-9_]+)(\}|\s*,\s*(plural|select)\s*,)/.exec(msg.slice(i)) : null;
      if (!head) {
        text += c;
        i++;
        continue;
      }
      flush();
      out += head[0];
      i += head[0].length;
      if (head[2] === '}') continue;
      // Branches, `selector {words}`, up to the brace that closes the ICU message.
      while (i < msg.length && msg[i] !== '}') {
        const sel = /^\s*(=?[A-Za-z0-9_]+)\s*\{/.exec(msg.slice(i));
        if (!sel) throw new Error(`unreadable ICU in ${msg}`);
        out += sel[0];
        i += sel[0].length;
        const [inner, j] = read(i, true);
        out += `${inner}}`;
        i = j + 1;
        const ws = /^\s*/.exec(msg.slice(i))![0];
        out += ws;
        i += ws.length;
      }
      out += '}';
      i++;
    }
    flush();
    return [out, i];
  };
  return read(0, false)[0];
}
const HEBREW = 'אבגדהוזחטיכלמנסעפצקרשתאבגדהו';
const rtlWord = (s: string) => s.replace(/[A-Za-z]/g, (c) => HEBREW[(c.toLowerCase().charCodeAt(0) - 97) % HEBREW.length]);
const stretchWord = (s: string) => s.replace(/[A-Za-z]{2,}/g, (w) => w + 'ẍ'.repeat(Math.ceil(w.length * 0.4)));

function params(msg: string): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const m of msg.matchAll(/\{([A-Za-z0-9_]+)(\}|\s*,\s*(plural|select))/g)) p[m[1]] = m[3] === 'plural' ? 3 : m[3] === 'select' ? 'other' : `<${m[1]}>`;
  return p;
}

const keys = Object.keys(ENGLISH).filter((k) => !k.startsWith('data.') && !k.startsWith('pages.'));

describe('right-to-left pseudo-locale', () => {
  const pack: Catalog = Object.fromEntries(keys.map((k) => [k, pseudo(ENGLISH[k], rtlWord)]));
  it('every interface message still formats, with every placeholder value in it', () => {
    let checked = 0;
    for (const k of keys) {
      const p = params(ENGLISH[k]);
      const text = translate(k, p, 'he', pack);
      for (const [name, v] of Object.entries(p)) if (typeof v === 'string' && v.startsWith('<') && !kinds[k]?.[name]) expect(text, `${k} lost {${name}}`).toContain(v);
      expect(text, k).not.toMatch(/\{[a-z]+, (plural|select)/);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it('turns the interface right to left', async () => {
    await useLanguage('he');
    expect(language().dir).toBe('rtl');
    expect(isRtl()).toBe(true);
    await useLanguage('ar');
    expect(isRtl()).toBe(true);
  });
  it('the stylesheet mirrors the rail, cards, chips, toasts and the tutorial bubble side', () => {
    for (const rule of ['html[dir="rtl"] .side-rail', 'html[dir="rtl"] .b-left', 'html[dir="rtl"] .b-right', 'html[dir="rtl"] .hud-head > .toasts', 'html[dir="rtl"] .rail-pill', 'html[dir="rtl"] .entry-chevron'])
      expect(css, rule).toContain(rule);
  });
});

describe('stretched pseudo-locale (+40%)', () => {
  const pack: Catalog = Object.fromEntries(keys.map((k) => [k, pseudo(ENGLISH[k], stretchWord)]));
  it('every interface message still formats and is longer', () => {
    for (const k of keys) {
      const text = translate(k, params(ENGLISH[k]), 'en-XA', pack);
      expect(text.length, k).toBeGreaterThanOrEqual(translate(k, params(ENGLISH[k]), 'en', ENGLISH).length);
    }
  });
  it('the narrow controls truncate or wrap instead of pushing their neighbours off screen', () => {
    // Attack/Build wrap onto two lines inside the button; chips and the objective line truncate.
    expect(css).toMatch(/\.hud-bottom \.round-btn\.big span:last-child \{[^}]*-webkit-line-clamp: 2/);
    expect(css).toMatch(/\.unlock-chip \.unlocks \{[^}]*min-width: 0/);
    expect(css).toMatch(/\.objective-chip span \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
    expect(css).toMatch(/\.objective-chip \{ flex: 1 1 auto; min-width: 0;/);
    expect(css).toMatch(/#battle-hud\[data-mode='scout'\] \.b-bottom \.btn \{ min-width: 0;/);
    expect(css).toMatch(/\.army-active-name b \{ min-width: 0; overflow: hidden; text-overflow: ellipsis;/);
  });
});
