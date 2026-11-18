/**
 * P6-10 (UIS-12): text that leaked past the catalog stays fixed. Source checks, like the plural-suffix guard.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('text leaks (P6-10)', () => {
  it('the net pill adds only a number; its sentence is the keyed plural', () => {
    expect(src('src/presentation/ui/hud.ts')).not.toMatch(/to send`/);
  });
  it('no raw "Alliance War" fallback inside a translated title', () => {
    expect(src('src/presentation/ui/battleHud.ts')).not.toMatch(/\?\? 'Alliance War'/);
  });
  it('no lower-casing of a translated string by replace', () => {
    expect(src('src/presentation/ui/codexUi.ts')).not.toMatch(/\.replace\('Needs '/);
  });
  it('no dead plural-suffix arguments', () => {
    expect(src('src/app.ts')).not.toMatch(/=== 1 \? '' : 's'/);
  });
  it('main.ts finds the Settings dialog and the battle buttons by id, never by translated text', () => {
    const main = src('src/main.ts');
    expect(main).not.toMatch(/i18nLabel\('Settings'\)/);
    expect(main).not.toMatch(/pick\('End battle'\)/);
    expect(src('src/presentation/ui/settingsUi.ts')).toMatch(/'data-id': 'settings'/);
    for (const id of ['battle-end', 'exit-replay', 'battle-home']) expect(src('src/presentation/ui/battleHud.ts')).toContain(`'data-id': '${id}'`);
  });
});
