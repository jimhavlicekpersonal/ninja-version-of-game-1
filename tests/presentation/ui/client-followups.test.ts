/**
 * 2026-11-14 client follow-ups, GUI side: refused cross-device actions named in News with plain-language reasons
 * (GLOBAL-009), CU-7 refusal amounts in the toast, Settings → Account → "Sign out this device" (A16) and the
 * per-level building art wired in main.ts (art F26).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { refusedAction, refusedReason } from '../../../src/presentation/ui/newsUi';
import { refusalText } from '../../../src/presentation/ui/refusalText';
import en from '../../../locales/en/ui.json';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('GLOBAL-009: refused actions in News', () => {
  it('names the action and its subject, and says why in plain words', () => {
    expect(refusedAction({ type: 'upgrade', name: 'Kunai Tower' })).toBe('Upgrade Kunai Tower');
    expect(refusedAction({ type: 'place', name: 'Coin Mint' })).toBe('Build Coin Mint');
    expect(refusedAction({ type: 'trainArmy', name: '' })).toBe('Train an army');
    // Unknown subject or an action News does not name: a neutral line, never a raw command type.
    expect(refusedAction({ type: 'upgrade', name: '' })).toBe(en['news.refused.other']);
    expect(refusedAction({ type: 'claimTask', name: '' })).toBe(en['news.refused.other']);
    expect(refusedReason('NO_FREE_BUILDER')).toBe(en['news.reason.builder']);
    expect(refusedReason('HALL_LEVEL_TOO_LOW')).toBe(en['news.reason.locked']);
    expect(refusedReason('TOO_MANY_BATTLES')).toBe(en['news.reason.changed']);
  });

  it('the HUD passes the connection list to News', () => {
    expect(read('src/presentation/ui/hud.ts')).toMatch(/refusedList: conn\.refusedActions\.map/);
  });
});

describe('CU-7: a cancel refused for full storage names the amounts', () => {
  it('shows what would be lost and the whole refund', () => {
    const text = refusalText({ ok: false, code: 'STORAGE_FULL', message: 'Storage is too full', params: { refund: { acorns: 1200, dew: 300 }, lost: { acorns: 400 } } });
    expect(text).toMatch(/400/);
    expect(text).toMatch(/1,200/);
    expect(text).toMatch(/300/);
    expect(text).not.toBe('Storage is too full');
  });

  it('other refusals keep the simulation message', () => {
    expect(refusalText({ ok: false, code: 'STORAGE_FULL', message: 'Storage is too full', params: { resource: 'acorns' } })).toBe('Storage is too full');
  });

  it('the cancel paths use it', () => {
    expect(read('src/presentation/ui/hud.ts')).toMatch(/type: 'cancel', id: b\.id \}\);\n\s+if \(!r\.ok\) this\.toast\(refusalText\(r\)/);
    const army = read('src/presentation/ui/armyUi.ts');
    expect(army.match(/refusalText\(r\)/g)?.length).toBe(2);
  });
});

describe('A16: Sign out this device', () => {
  it('is in Settings → Account with a confirm step and explains a refused last key', () => {
    const hud = read('src/presentation/ui/hud.ts');
    expect(hud).toMatch(/conn\.canSignOutDevice \?/);
    expect(hud).toMatch(/this\.confirm\(t\('account\.signOutDevice\.title'\)/);
    expect(hud).toMatch(/status === 409/);
    expect(hud).toMatch(/t\('account\.signOutDevice\.lastKey'\)/);
  });
});

describe('art F26: per-level building art', () => {
  it('main.ts passes levelThumbnail to the HUD', () => {
    expect(read('src/main.ts')).toMatch(/levelThumbnail: \(type, level\) =>/);
  });
});
