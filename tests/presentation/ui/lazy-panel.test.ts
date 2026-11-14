/**
 * Lazily loaded panels (ui/lazyPanel.ts): a failed load is forgotten and reported, so the next tap
 * tries again, and a stale chunk after an update is told apart from a lost connection.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lazyPanel, staleChunkError } from '../../../src/presentation/ui/lazyPanel';

describe('lazyPanel', () => {
  it('loads once while it succeeds', async () => {
    let loads = 0;
    const get = lazyPanel(async () => ({ id: ++loads }), () => undefined);
    const [a, b] = await Promise.all([get(), get()]);
    expect(a).toBe(b);
    expect(await get()).toBe(a);
    expect(loads).toBe(1);
  });

  it('forgets a failed load, reports it, and loads again on the next call', async () => {
    let loads = 0;
    const errors: unknown[] = [];
    const get = lazyPanel(async () => {
      loads++;
      if (loads === 1) throw new TypeError('Failed to fetch dynamically imported module: https://x/assets/groveUi-abc.js');
      return 'panel';
    }, (e) => errors.push(e));
    expect(await get()).toBeNull();
    expect(errors).toHaveLength(1);
    expect(await get()).toBe('panel');
    expect(await get()).toBe('panel');
    expect(loads).toBe(2);
    expect(errors).toHaveLength(1);
  });

  it('tells a stale chunk (online) from a lost connection', () => {
    expect(staleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'), true)).toBe(true);
    expect(staleChunkError(new TypeError('Importing a module script failed.'), true)).toBe(true);
    expect(staleChunkError(new TypeError('error loading dynamically imported module'), true)).toBe(true);
    expect(staleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'), false)).toBe(false);
    expect(staleChunkError(new Error('something else'), true)).toBe(false);
  });

  it('the HUD loads every lazy panel through it, with a translated message on failure', () => {
    const hud = readFileSync(join(__dirname, '../../../src/presentation/ui/hud.ts'), 'utf8');
    expect(hud).not.toMatch(/Loading \?\?=/);
    for (const m of ['groveUi', 'friendsUi', 'settingsUi', 'codexUi']) expect(hud).toMatch(new RegExp(`lazyPanel\\(\\(\\) => (?:Promise\\.all\\(\\[)?import\\('\\./${m}'\\)`));
    expect(hud).toContain("t('panel.loadFailed')");
    expect(hud).toContain("t('panel.staleChunk')");
    const en = JSON.parse(readFileSync(join(__dirname, '../../../locales/en/ui.json'), 'utf8')) as Record<string, string>;
    expect(en['panel.loadFailed']).toBeTruthy();
    expect(en['panel.staleChunk']).toBeTruthy();
  });
});
