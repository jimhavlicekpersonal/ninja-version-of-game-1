/**
 * Server-sent push (roadmap step 40) and deployment settings (step 42).
 * Pushes go only to devices that switched the type on, never in their quiet
 * hours, at most `maxPerDay` a local day; invalid tokens are dropped.
 */
import { describe, expect, it } from 'vitest';
import { checkConfig, deployEnv } from '../../../server/config';
import { ServerPush, type PushMessage, type PushTransport } from '../../../server/push/push';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { inQuietHours } from '../../../src/gameplay/sim/reminders';
import { baseAt, HOUR, rush, world } from './harness';
import { freshPgRepo, repoFactories } from './pg';

function fakeTransport() {
  const sent: { platform: string; token: string; m: PushMessage }[] = [];
  const invalid = new Set<string>();
  const t: PushTransport = {
    platforms: ['ios', 'android'],
    async send(platform, token, m) {
      if (invalid.has(token)) return 'invalid';
      sent.push({ platform, token, m });
      return 'sent';
    },
  };
  return { t, sent, invalid };
}

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);

for (const [label, makeRepo] of repoFactories) {
  describe(`server push on ${label} storage`, () => {
    async function setup(start = Date.UTC(2026, 3, 6, 12)) {
      const f = fakeTransport();
      const repo = await makeRepo();
      let push: ServerPush;
      const w = world({ repo, start, shared: { push: { enabled: true, notify: (id, m) => push.notify(id, m) } } });
      push = new ServerPush({ repo, data, transport: f.t, now: () => w.now() });
      const settle = async () => {
        while (push.pending.size) await Promise.all([...push.pending]);
      };
      return { w, f, push: () => push, settle };
    }

    it('tells a raided player, on each device that wants it', async () => {
      const { w, f, settle } = await setup();
      const dot = await w.player('Dot', baseAt(1, 77));
      const ann = await w.player('Ann', baseAt(1));
      await dot.putPushToken({ token: TOKEN_A, platform: 'ios', types: ['raided'], tzOffsetMinutes: 0 });
      await dot.putPushToken({ token: TOKEN_B, platform: 'android', types: ['builds'], tzOffsetMinutes: 0 });
      w.pastShields();
      await w.repo.updatePlayer(dot.id, { shieldUntil: 0 });
      w.setTime(Date.UTC(2026, 3, 8, 12)); // midday UTC: outside quiet hours
      await w.repo.updatePlayer(dot.id, { shieldUntil: 0 });
      await w.repo.updatePlayer(ann.id, { shieldUntil: 0 });
      const m = (await ann.match())!;
      expect(m.opponent.name).toBe('Dot');
      await ann.submitAttack({ ticket: m.ticket, seed: m.seed, ...rush(20) });
      await settle();
      expect(f.sent).toEqual([expect.objectContaining({ platform: 'ios', token: TOKEN_A, m: expect.objectContaining({ type: 'raided', title: 'Ann raided your village' }) })]);
      expect(w.core.hello().features).toContain('push');
    });

    it('keeps quiet hours and the daily limit, and forgets invalid tokens', async () => {
      // 23:00 UTC is quiet for a device on UTC (22-8) …
      const { w, f, push } = await setup(Date.UTC(2026, 3, 6, 23));
      const dot = await w.player('Dot');
      await dot.putPushToken({ token: TOKEN_A, platform: 'ios', types: ['donations'], tzOffsetMinutes: 0 });
      const msg = { type: 'donations', title: 'Warriors arrived', body: 'x' };
      expect(await push().deliver(dot.id, msg)).toEqual(['quiet']);
      // … but 15:00 on a device 8 hours behind UTC (UTC-8: getTimezoneOffset 480).
      await dot.putPushToken({ token: TOKEN_A, platform: 'ios', types: ['donations'], tzOffsetMinutes: 480 });
      expect(inQuietHours(w.now(), 480, data)).toBe(false);
      const results = [];
      for (let i = 0; i < data.notifications.maxPerDay + 2; i++) results.push(...(await push().deliver(dot.id, msg)));
      expect(results.filter((r) => r === 'sent')).toHaveLength(data.notifications.maxPerDay);
      expect(results.slice(-2)).toEqual(['limit', 'limit']);
      expect(f.sent).toHaveLength(data.notifications.maxPerDay);
      // The next local day starts over.
      w.advance(24 * HOUR);
      expect(await push().deliver(dot.id, msg)).toEqual(['sent']);
      // A token the push service calls invalid is removed.
      f.invalid.add(TOKEN_A);
      expect(await push().deliver(dot.id, msg)).toEqual(['invalid']);
      expect(await w.repo.pushTokensOf(dot.id)).toEqual([]);
    });

    it('checks what a device registers, and a token moves with its device', async () => {
      const { w } = await setup();
      const ann = await w.player('Ann');
      const ben = await w.player('Ben');
      await expect(ann.putPushToken({ token: 'short', platform: 'ios', types: [], tzOffsetMinutes: 0 })).rejects.toMatchObject({ code: 'bad_request' });
      await expect(ann.putPushToken({ token: TOKEN_A, platform: 'web' as never, types: [], tzOffsetMinutes: 0 })).rejects.toMatchObject({ code: 'bad_request' });
      await ann.putPushToken({ token: TOKEN_A, platform: 'ios', types: ['raided', 'nonsense'], tzOffsetMinutes: -60 });
      expect((await w.repo.pushTokensOf(ann.id))[0]).toMatchObject({ types: ['raided'], tzOffsetMinutes: -60 });
      // Ben signs in on Ann's old phone: the token is his now.
      await ben.putPushToken({ token: TOKEN_A, platform: 'ios', types: ['raided'], tzOffsetMinutes: 0 });
      expect(await w.repo.pushTokensOf(ann.id)).toEqual([]);
      // Ann cannot remove Ben's device; Ben can.
      await ann.deletePushToken(TOKEN_A);
      expect(await w.repo.pushTokensOf(ben.id)).toHaveLength(1);
      await ben.deletePushToken(TOKEN_A);
      expect(await w.repo.pushTokensOf(ben.id)).toEqual([]);
      // Account deletion removes the player's devices.
      await ben.putPushToken({ token: TOKEN_B, platform: 'android', types: [], tzOffsetMinutes: 0 });
      await ben.deleteAccount();
      expect(await w.repo.pushTokensOf(ben.id)).toEqual([]);
    });
  });
}

describe('deployments (step 42)', () => {
  it('requires the production essentials and refuses test-only settings there', () => {
    expect(deployEnv({})).toBe('development');
    expect(() => deployEnv({ DEPLOY_ENV: 'prod' })).toThrow();
    expect(checkConfig({}).errors).toEqual([]);
    const bare = checkConfig({ DEPLOY_ENV: 'production' }).errors.join('\n');
    expect(bare).toMatch(/DATABASE_URL/);
    expect(bare).toMatch(/ADMIN_TOKEN/);
    expect(bare).toMatch(/CORS_ORIGIN/);
    const prod = { DEPLOY_ENV: 'production', DATABASE_URL: 'postgres://x', ADMIN_TOKEN: 'x'.repeat(32), CORS_ORIGIN: 'https://game.example,capacitor://localhost' };
    expect(checkConfig(prod).errors).toEqual([]);
    expect(checkConfig({ ...prod, APNS_SANDBOX: '1' }).errors).toHaveLength(1);
    expect(checkConfig({ ...prod, CORS_ORIGIN: '*' }).errors).toHaveLength(1);
    expect(checkConfig({ ...prod, APPLE_ENVIRONMENTS: 'Production,Xcode' }).errors).toHaveLength(1);
    expect(checkConfig({ DEPLOY_ENV: 'staging', APNS_SANDBOX: '1' }).errors).toEqual([]);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('a database belongs to one deployment (step 42)', () => {
  it('remembers the first deployment that used it', async () => {
    const repo = await freshPgRepo();
    expect(await repo.claimEnvironment('staging')).toBe('staging');
    // A production server pointed at it is told whose it is (and main.ts refuses to start).
    expect(await repo.claimEnvironment('production')).toBe('staging');
  });
});

