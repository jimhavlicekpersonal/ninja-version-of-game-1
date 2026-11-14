/**
 * Start-up weight (state-of-the-game quality 17): Phaser sits in its own long-cached chunk and the
 * social panels (Friends, Gangs, Gang War) load the first time they are opened, not at start-up.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('code splitting', () => {
  it('the HUD imports the social panels only lazily', () => {
    const hud = read('src/presentation/ui/hud.ts');
    for (const m of ['friendsUi', 'gangWarUi', 'gangUi', 'groveUi', 'settingsUi', 'codexUi']) {
      expect(hud, m).not.toMatch(new RegExp(`^import \\{[^}]*\\} from '\\./${m}'`, 'm'));
    }
    expect(hud).toMatch(/import\('\.\/friendsUi'\)/);
    expect(hud).toMatch(/import\('\.\/gangWarUi'\)/);
    // 2026-11-13 runtime batch: the Alliance panel too.
    expect(hud).toMatch(/import\('\.\/groveUi'\)/);
    // 2026-11-14 code-quality batch: Settings and the Warrior Codex too.
    expect(hud).toMatch(/import\('\.\/settingsUi'\)/);
    expect(hud).toMatch(/import\('\.\/codexUi'\)/);
  });

  it('nothing else in the start-up graph imports them statically', () => {
    for (const p of ['src/main.ts', 'src/app.ts']) expect(read(p)).not.toMatch(/from '\.\/presentation\/ui\/(friendsUi|gangWarUi|gangUi|groveUi|settingsUi|codexUi)'/);
  });

  it('the production build puts Phaser in its own chunk', () => {
    expect(read('vite.config.ts')).toMatch(/name: 'phaser', test: \/node_modules/);
  });
});
