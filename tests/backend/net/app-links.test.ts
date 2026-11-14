/**
 * Audit R09 (code side): links that open the app route like the web. `parseGameLink` reads only `?friend=` and
 * `?open=` (checked); `listenForAppLinks` hears `appUrlOpen` and the cold-start launch URL of `@capacitor/app`.
 */
import { describe, expect, it, vi } from 'vitest';

const listeners: ((e: { url: string }) => void)[] = [];
let launchUrl: string | undefined;
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_name: string, fn: (e: { url: string }) => void) => {
      listeners.push(fn);
      return { remove: vi.fn() };
    }),
    getLaunchUrl: vi.fn(async () => (launchUrl ? { url: launchUrl } : undefined)),
  },
}));

import { listenForAppLinks, parseGameLink } from '../../../src/backend/platform/links';

describe('parseGameLink', () => {
  it('reads friend codes and panel names from full links and plain queries', () => {
    expect(parseGameLink('https://kagemura.example/?friend=KAGE-AB12CD')).toEqual({ friend: 'KAGE-AB12CD' });
    expect(parseGameLink('https://kagemura.example/play/?open=store')).toEqual({ open: 'store' });
    expect(parseGameLink('?friend=KAGE-AB12CD&open=news')).toEqual({ friend: 'KAGE-AB12CD', open: 'news' });
    expect(parseGameLink('capacitor://localhost/index.html?open=daily')).toEqual({ open: 'daily' });
  });
  it('ignores anything else: unknown panels, odd friend values, other parameters, unreadable links', () => {
    expect(parseGameLink('https://x.example/?open=settings&server=https://evil.example')).toEqual({});
    expect(parseGameLink('https://x.example/?friend=<script>')).toEqual({});
    expect(parseGameLink(`https://x.example/?friend=${'a'.repeat(80)}`)).toEqual({});
    expect(parseGameLink('https://')).toEqual({});
  });
});

describe('listenForAppLinks', () => {
  it('passes the launch link first, then each link the app is opened with; links asking nothing are dropped', async () => {
    launchUrl = 'https://kagemura.example/?friend=KAGE-COLD01';
    const got: unknown[] = [];
    await listenForAppLinks((l) => got.push(l));
    expect(got).toEqual([{ friend: 'KAGE-COLD01' }]);
    listeners[0]({ url: 'https://kagemura.example/?open=army' });
    listeners[0]({ url: 'https://kagemura.example/?utm=1' });
    expect(got).toEqual([{ friend: 'KAGE-COLD01' }, { open: 'army' }]);
  });
});
