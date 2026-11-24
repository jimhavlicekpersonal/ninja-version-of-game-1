/**
 * UX-N1: English labels that the HUD shows through `labelText` (`i18nLabel`) must each have a catalog key, or every
 * language shows the English. "Offensive name" (a report reason) had none. This scans the source for every literal
 * `i18nLabel('…')` and every label table read as `i18nLabel(TABLE[…])`, and checks that each English value resolves.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { labelText } from '../../../locales/runtime';
import { REASON_LABELS } from '../../../src/presentation/ui/groveUi';

const ROOT = join(__dirname, '../../..');
const UI = join(ROOT, 'src/presentation/ui');
const files = readdirSync(UI)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ file: `src/presentation/ui/${f}`, text: readFileSync(join(UI, f), 'utf8') }));

/** A pack that answers every key: a value that resolves to a key comes back as the marker. */
const MARK = '\u0000resolved';
const every = new Proxy({}, { get: () => MARK, has: () => true }) as Record<string, string>;
const resolves = (english: string) => labelText(english, 'de', every) === MARK;

/** The string values of `const NAME … = { … };` (or `static readonly NAME …`) in a source file. */
function tableValues(text: string, name: string): string[] | null {
  const m = new RegExp(`(?:const|readonly)\\s+${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\};`).exec(text);
  if (!m) return null;
  return [...m[1].matchAll(/:\s*'((?:[^'\\]|\\.)*)'/g)].map((v) => v[1].replace(/\\'/g, "'"));
}

describe('label tables resolve to catalog keys (UX-N1)', () => {
  it('every report reason has a key', () => {
    for (const [reason, english] of Object.entries(REASON_LABELS)) expect(resolves(english), `${reason}: ${english}`).toBe(true);
  });

  it('every literal and every table read through i18nLabel has a key', () => {
    const missing: string[] = [];
    let tables = 0;
    for (const { file, text } of files) {
      for (const m of text.matchAll(/i18nLabel\('((?:[^'\\]|\\.)*)'\)/g)) if (!resolves(m[1])) missing.push(`${file}: '${m[1]}'`);
      for (const m of new Set([...text.matchAll(/i18nLabel\((?:[A-Za-z]+\.)?([A-Z][A-Z_]+)\[/g)].map((x) => x[1]))) {
        const owner = files.find((f) => tableValues(f.text, m));
        expect(owner, `${file}: table ${m} not found`).toBeDefined();
        tables++;
        for (const v of tableValues(owner!.text, m)!) if (!resolves(v)) missing.push(`${owner!.file}: ${m} '${v}'`);
      }
    }
    expect(tables).toBeGreaterThan(3);
    expect([...new Set(missing)]).toEqual([]);
  });
});
