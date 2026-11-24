// @vitest-environment happy-dom
/**
 * F4 (2026-11-24): the cached language pack (~200-275 KB) is kept once. Packs cached under older deploys'
 * hashes (and other languages) are removed before a new one is written, so they never fill the storage quota.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import availability from '../../../locales/availability.json';
import { ENGLISH } from '../../../locales/runtime';
import { useLanguage } from '../../../src/presentation/ui/i18n';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('cached language packs', () => {
  it('leaves exactly one tk.lang.pack key after a language loads', async () => {
    const meta = availability.de;
    // A complete pack (every English key), as the server would send it; its words do not matter here.
    const pack = JSON.stringify(Object.fromEntries(Object.keys(ENGLISH).map((k) => [k, ENGLISH[k]])));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(pack, { status: 200, headers: { 'content-type': 'application/json' } })));
    localStorage.setItem('tk.lang.pack:de:0000000000000000', '{"stale":"x"}');
    localStorage.setItem('tk.lang.pack:fr:1111111111111111', '{"stale":"y"}');
    localStorage.setItem('tk.lang', 'de');
    await useLanguage('de');
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('tk.lang.pack:'));
    expect(keys).toEqual([`tk.lang.pack:de:${meta.hash}`]);
    expect(localStorage.getItem('tk.lang')).toBe('de'); // other settings stay
    await useLanguage('en');
  });
});
