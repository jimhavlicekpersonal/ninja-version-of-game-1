/**
 * Third verification fixes 2026-11-14, the game's side: the stable installation id (sent with a friend code, a
 * claim and purchase intents; never the statistics id), the adults-only invite panel, the shared-replay privacy
 * switch, the preview gate, crash reports for under-13 bands, and the deploy workflow's build flags.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crashReportsAllowed } from '../../src/backend/analytics/crashReports';
import { INSTALL_KEY, installIdIn } from '../../src/backend/net/connection';
import { GrowthClient } from '../../src/backend/net/growthClient';
import { GrowthRoutes, type ReferralView } from '../../src/backend/net/growth';
import { previewAllowed } from '../../src/backend/payments/select';
import { replayPrivacyBlock } from '../../src/presentation/ui/complianceUi';
import { inviteSection } from '../../src/presentation/ui/growthUi';
import type { UiKit } from '../../src/presentation/ui/uiKit';
import en from '../../locales/en/ui.json';

const root = join(__dirname, '../..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');

const kv = () => {
  const map = new Map<string, string>();
  return { map, get: (k: string) => map.get(k) ?? null, set: (k: string, v: string | null) => void (v === null ? map.delete(k) : map.set(k, v)), trySet: (k: string, v: string | null) => (v === null ? map.delete(k) : map.set(k, v), true) };
};

class El {
  children: (El | { text: string })[] = [];
  attrs: Record<string, string> = {};
  className = '';
  checked = false;
  disabled = false;
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
    if (k === 'disabled') this.disabled = true;
  }
  addEventListener(t: string, f: (e: unknown) => void) {
    (this.listeners[t] ??= []).push(f);
  }
  append(...c: (El | { text: string })[]) {
    this.children.push(...c);
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  removeChild(c: El | { text: string }) {
    this.children = this.children.filter((x) => x !== c);
  }
  replaceChildren() {
    this.children = [];
  }
  get text(): string {
    return this.children.map((c) => ('tag' in c ? c.text : c.text)).join(' ');
  }
  find(pred: (e: El) => boolean): El | null {
    if (pred(this)) return this;
    for (const c of this.children) if ('tag' in c) {
      const f = c.find(pred);
      if (f) return f;
    }
    return null;
  }
}
const saved = (globalThis as { document?: unknown }).document;
beforeAll(() => {
  (globalThis as { document?: unknown }).document = { createElement: (t: string) => new El(t), createTextNode: (text: string) => ({ text }) };
});
afterAll(() => {
  (globalThis as { document?: unknown }).document = saved;
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('stable installation id', () => {
  it('is made once, kept in device storage, and is not the statistics id', () => {
    const store = kv();
    const a = installIdIn(store);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(installIdIn(store)).toBe(a);
    expect(store.map.get(INSTALL_KEY)).toBe(a);
    expect(INSTALL_KEY).not.toBe('tk.stats.install');
    // Storage that keeps nothing: no id at all (never a new one per start).
    expect(installIdIn({ get: () => null, set: () => undefined, trySet: () => false })).toBeNull();
  });

  it('the growth client sends it with a friend code and a claim; the purchase verifier with an intent', async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const port = { call: async (method: string, path: string, body?: unknown) => (calls.push({ method, path, body }), {}) };
    const g = new GrowthClient({ online: true, server: { features: ['referrals'] }, port, village: { device: 'queue-0001' }, installId: 'install-0001' });
    await g.enterCode('KAGE-AAAAAA');
    await g.claim();
    expect(calls).toEqual([
      { method: 'POST', path: GrowthRoutes.referrals, body: { code: 'KAGE-AAAAAA', device: 'queue-0001', install: 'install-0001' } },
      { method: 'POST', path: GrowthRoutes.referralClaim, body: { install: 'install-0001' } },
    ]);
    const conn = read('src/backend/net/connection.ts');
    expect(conn).toMatch(/purchaseIntent\(\{ store: s, productId, under18, [^\n]*install/);
    expect(conn).toMatch(/get installId\(\): string \| null \{\s*return installIdIn\(this\.kv\);/);
  });
});

describe('friend invites are for adults only (game side)', () => {
  const kit = { toast: () => undefined } as unknown as UiKit;
  const view = (over: Partial<ReferralView>): ReferralView => ({ invitedBy: null, canEnterCode: false, recruits: { waiting: 0, qualified: 0, rewarded: 0 }, claimable: 0, needsServerVillage: false, rewardJade: 20, keep: 3, monthlyCap: 5, rewardedThisMonth: 0, windowDays: 7, ...over });
  const deps = (v: ReferralView) => ({ canRefer: true, canShareReplays: false, referrals: async () => v, enterCode: async () => v, claim: async () => v, share: async () => ({ code: '', expiresAt: 0 }), replayLink: () => null });

  it('shows the kind line instead of the reward, Collect and the code field', async () => {
    const box = inviteSection(kit, deps(view({ adultsOnly: true }))) as unknown as El;
    await flush();
    expect(box.text).toContain(en['growth.invite.adultsOnly']);
    expect(box.find((e) => e.tag === 'button')).toBeNull();
    expect(box.find((e) => e.tag === 'input')).toBeNull();
  });

  it('an adult still sees the reward and the code field', async () => {
    const box = inviteSection(kit, deps(view({ canEnterCode: true }))) as unknown as El;
    await flush();
    expect(box.text).not.toContain(en['growth.invite.adultsOnly']);
    expect(box.find((e) => e.tag === 'input')).not.toBeNull();
  });
});

describe('"Allow my base in other players\' shared replays"', () => {
  it('only for adults the server offers it to; reads and sets the server value', async () => {
    expect(replayPrivacyBlock({ canReplayPrivacy: false, replayPrivacy: async () => ({ baseInReplays: true }), setReplayPrivacy: async () => ({ baseInReplays: true }) }, () => undefined)).toBeNull();
    const sets: boolean[] = [];
    const el = replayPrivacyBlock({ canReplayPrivacy: true, replayPrivacy: async () => ({ baseInReplays: true }), setReplayPrivacy: async (v) => (sets.push(v), { baseInReplays: v }) }, () => undefined) as unknown as El;
    await flush();
    const box = el.find((e) => e.attrs['data-id'] === 'replay-privacy')!;
    expect(box.checked).toBe(true);
    box.checked = false;
    box.listeners.change[0]({});
    await flush();
    expect(sets).toEqual([false]);
    expect(el.text).toContain(en['replays.allowBase.label']);
    expect(read('src/presentation/ui/hud.ts')).toMatch(/replayPrivacyBlock\(conn,/);
  });
});

describe('build gates (8f, 8g)', () => {
  it('the content preview only in a dev build, or ?debug&preview with VITE_ALLOW_PREVIEW', () => {
    const off = { dev: false, allowPreview: false };
    expect(previewAllowed('?sandbox&preview', off)).toBe(false);
    expect(previewAllowed('?debug&preview', off)).toBe(false);
    expect(previewAllowed('?sandbox&preview', { dev: false, allowPreview: true })).toBe(false);
    expect(previewAllowed('?debug&preview', { dev: false, allowPreview: true })).toBe(true);
    expect(previewAllowed('?sandbox&preview', { dev: true, allowPreview: false })).toBe(true);
    // Never outside the sandbox, and never without ?preview.
    expect(previewAllowed('?preview', { dev: true, allowPreview: true })).toBe(false);
    expect(previewAllowed('?debug', { dev: true, allowPreview: true })).toBe(false);
    const main = read('src/main.ts');
    expect(main).toMatch(/const gameData = previewAllowed\(location\.search, \{ dev: import\.meta\.env\.DEV, allowPreview: import\.meta\.env\.VITE_ALLOW_PREVIEW === '1' \}\) \? withPreview\(defaultData\) : defaultData;/);
    expect(main.match(/withPreview\(/g)).toHaveLength(1);
    // The public web build never sets the flag.
    expect(read('.github/workflows/deploy.yml')).not.toMatch(/VITE_ALLOW_PREVIEW/);
  });

  it('crash reports never for an under-13 band, and only when switched on', () => {
    expect(crashReportsAllowed(true, 'adult')).toBe(true);
    expect(crashReportsAllowed(true, null)).toBe(true);
    expect(crashReportsAllowed(true, '13to17')).toBe(true);
    expect(crashReportsAllowed(true, 'under13')).toBe(false);
    expect(crashReportsAllowed(false, 'adult')).toBe(false);
    const main = read('src/main.ts');
    expect(main).toMatch(/enabled: \(\) => crashReportsAllowed\(prefs\.get\('crashReports'\), crashBand\(\)\)/);
    // The band it reads is the village's.
    expect(main).toMatch(/crashBand = \(\) =>/);
  });
});

describe('P7-12 (BNL-14): the content preview build is manual and off by default', () => {
  it('runs only by hand, its input defaults to off, it never deploys or goes online', () => {
    const y = readFileSync(new URL('../../.github/workflows/content-preview.yml', import.meta.url), 'utf8');
    const on = y.slice(y.indexOf('\non:'), y.indexOf('\npermissions:'));
    expect(on).toContain('workflow_dispatch');
    expect(on).not.toMatch(/\bpush\b|pull_request|schedule/);
    expect(y).toMatch(/default: false/);
    expect(y).toMatch(/if: \$\{\{ inputs\.build \}\}/);
    expect(y).not.toMatch(/deploy-pages|upload-pages-artifact|pages: write/);
    expect(y).toMatch(/VITE_SERVER_URL: ''/);
  });
});
