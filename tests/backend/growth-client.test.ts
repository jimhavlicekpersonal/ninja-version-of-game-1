/**
 * Growth batch 2026-11-14, the game's side: platform achievements (G31), the growth client over the HTTP
 * adapter (G13, G14), the cosmetic Alliance banner (G16) and the statistics UTC offset (growth 1/3).
 */
import { describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import achievements from '../../src/gameplay/data/achievements.json';
import { ACHIEVEMENT_IDS, AchievementReporter, nativeAchievementPort, platformIdsFor } from '../../src/backend/platform/achievements';
import { nativeReviewRequest } from '../../src/backend/platform/native';
import { fetchSharedReplay, GrowthClient } from '../../src/backend/net/growthClient';
import { HttpServerAdapter, memoryTokenStore } from '../../src/backend/net/httpAdapter';
import { ServerError } from '../../src/backend/net/ports';
import { cleanStatsBatch, cleanTz } from '../../src/backend/net/stats';
import { StatsSharing, type StatsTransport } from '../../src/backend/analytics/share';
import { COMMUNITY_RULES_VERSION } from '../../src/backend/net/protocol';
import { bannerTier } from '../../src/presentation/ui/growthUi';
import { buildServer } from '../../server/app';
import { MemoryRepo } from '../../server/repo';
import { defaultData } from '../../src/gameplay/sim/data';
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { SIM_RULES } from '../../src/gameplay/sim/battle/battle';

const kv = () => {
  const map = new Map<string, string>();
  return { map, get: (k: string) => map.get(k) ?? null, set: (k: string, v: string | null) => void (v === null ? map.delete(k) : map.set(k, v)) };
};

describe('platform achievements (G31)', () => {
  it('maps every tier of every in-game achievement, with Game Center ids and empty Play Games ids until the owner makes them', () => {
    for (const a of achievements) {
      expect(ACHIEVEMENT_IDS.gameCenter[a.id], a.id).toHaveLength(a.tiers.length);
      expect(ACHIEVEMENT_IDS.playGames[a.id], a.id).toHaveLength(a.tiers.length);
      for (const id of ACHIEVEMENT_IDS.gameCenter[a.id]) expect(id).toMatch(/^kagemura\.[a-z_]+\.\d+$/);
    }
    expect(new Set(Object.values(ACHIEVEMENT_IDS.gameCenter).flat()).size).toBe(achievements.reduce((n, a) => n + a.tiers.length, 0));
    expect(platformIdsFor({ raider: 2 }, 'gameCenter')).toEqual(['kagemura.raider.1', 'kagemura.raider.2']);
    expect(platformIdsFor({ raider: 2 }, 'playGames')).toEqual([]); // empty ids are never reported
  });

  it('reports each claimed tier once per device, retries a failure, and is a no-op without a platform', async () => {
    const store = kv();
    const sent: string[] = [];
    let fail = true;
    const port = { platform: 'gameCenter' as const, report: async (id: string) => { if (fail && id.endsWith('.2')) throw new Error('not signed in'); sent.push(id); } };
    const r = new AchievementReporter(port, store);
    expect(await r.sync({ raider: 2 })).toEqual(['kagemura.raider.1']);
    fail = false;
    expect(await new AchievementReporter(port, store).sync({ raider: 2 })).toEqual(['kagemura.raider.2']);
    expect(await new AchievementReporter(port, store).sync({ raider: 2 })).toEqual([]);
    expect(sent).toEqual(['kagemura.raider.1', 'kagemura.raider.2']);
    // Outside the apps (and in apps without the TkAchievements plugin) nothing is reported, nor is a review asked.
    expect(nativeAchievementPort().platform).toBeNull();
    expect(nativeReviewRequest()).toBeNull();
  });
});

describe('Alliance banners (G16) are cosmetic tiers by level', () => {
  it('steps at levels 3, 6 and 10', () => {
    expect(bannerTier(1)).toEqual({ tier: 'plain', next: 3 });
    expect(bannerTier(5)).toEqual({ tier: 'bronze', next: 6 });
    expect(bannerTier(9)).toEqual({ tier: 'silver', next: 10 });
    expect(bannerTier(14)).toEqual({ tier: 'gold', next: null });
  });
});

describe('statistics UTC offset (growth 1/3)', () => {
  it('is rounded to 15 minutes, bounded, and only sent by builds that turn it on', async () => {
    expect([cleanTz(330), cleanTz(-299), cleanTz(9999), cleanTz('60'), cleanTz(-0)]).toEqual([330, -300, undefined, undefined, 0]);
    expect(cleanStatsBatch({ install: '0f8fad5b-d9cb-469f-a165-70867728950e', tz: 541, events: [{ name: 'session_start', at: 1 }] })).toMatchObject({ tz: 540 });
    const run = async (sendTz: boolean) => {
      const sent: unknown[] = [];
      const transport: StatsTransport = { send: async (b) => void sent.push(b), forget: async () => undefined };
      const s = new StatsSharing({ kv: kv(), transport, build: 't', ageBand: () => 'adult', serverReady: () => true, sendTz, tzOffset: () => 120, newId: () => '0f8fad5b-d9cb-469f-a165-70867728950e' });
      await s.set(true);
      s.hear({ name: 'session_start', at: 5, props: {} } as never);
      await s.flush();
      return sent.at(-1) as { tz?: number };
    };
    expect((await run(true)).tz).toBe(120);
    expect((await run(false)).tz).toBeUndefined();
  });
});

describe('growth client over HTTP (G13, G14)', () => {
  it('enters a code, collects nothing yet, shares a replay and opens it by code without a token', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data: defaultData });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    try {
      const mk = async (name: string) => {
        const c = new HttpServerAdapter(url, { tokens: memoryTokenStore(), retryDelayMs: 10 });
        await c.register(name);
        await c.acceptRules({ version: COMMUNITY_RULES_VERSION });
        return c;
      };
      const ann = await mk('Growth Ann');
      const ben = await mk('Growth Ben');
      const hello = await ben.hello();
      const g = new GrowthClient({ online: true, server: hello, port: ben, village: { device: 'dev-ben' } });
      expect(g.canRefer && g.canShareReplays).toBe(true);
      expect(new GrowthClient({ online: false, server: hello, port: ben }).canRefer).toBe(false);
      // Ann's account is minutes old: inviters must be a day old.
      const code = (await ann.friends()).code;
      const refused = await g.enterCode(code).catch((e) => e);
      expect(refused).toBeInstanceOf(ServerError);
      expect((refused as ServerError).parts?.[0]?.key).toBe('referral.not_allowed');
      expect(await g.referrals()).toMatchObject({ canEnterCode: true, rewardJade: 20, needsServerVillage: true });
      expect((await g.claim()).granted).toBe(0);
      const base = generateOpponent(3, 1, defaultData);
      const shared = await g.share({ setup: { seed: 9, base, army: { hedgehog_roller: 3 }, infiltration: true }, deployments: [], rules: SIM_RULES, opponent: 'generated' });
      const v = await fetchSharedReplay(url, shared.code);
      expect(v).toMatchObject({ code: shared.code, opponent: 'generated', sharerName: null, result: { stars: 0 } });
      const missing = await fetchSharedReplay(url, 'ZZZZZZZZZZ').catch((e) => e);
      expect((missing as ServerError).status).toBe(404);
      expect((missing as ServerError).parts?.[0]?.key).toBe('replay.not_found');
    } finally {
      await app.close();
    }
  });
});
