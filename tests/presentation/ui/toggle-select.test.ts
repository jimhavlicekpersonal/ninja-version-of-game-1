/**
 * UX-N3: Settings rows put a label and a select side by side in `.toggle` (a flex row). With a long one-word label
 * (German "Zoomgeschwindigkeit" at 130 % text on 320 px) the select, which could shrink and had no minimum width,
 * was squeezed to a bare chevron. There is no browser in `npm test`, so this holds the CSS rules that prevent it;
 * `node tools/ui/surfaces.mjs --only=settings --langs=de --text=1.3` measures it in Chromium ("cut select").
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/presentation/ui/styles.css', 'utf8');
const rule = (selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n|\\})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? null;
};

describe('a select in a Settings row keeps its value visible (UX-N3)', () => {
  it('the select never shrinks below its value and has a minimum width', () => {
    const r = rule('.toggle > select');
    expect(r).not.toBeNull();
    expect(r).toMatch(/flex:\s*1 0 auto/); // grows, never shrinks
    expect(r).toMatch(/min-width:\s*6\.5em/);
    expect(r).toMatch(/max-width:\s*100%/);
  });

  it('the row wraps the select under its label when both do not fit, and a long word may break', () => {
    expect(rule('.toggle:has(> select)')).toMatch(/flex-wrap:\s*wrap/);
    const all = [...css.matchAll(/(?:^|\n)\.toggle\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
    expect(all).toMatch(/overflow-wrap:\s*anywhere/);
    expect(all).toMatch(/hyphens:\s*auto/);
  });

  it('the browser surface check measures selects', () => {
    const tool = readFileSync('tools/ui/surfaces.mjs', 'utf8');
    expect(tool).toContain("id: 'settings'");
    expect(tool).toContain('cut select');
  });
});
