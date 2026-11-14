/**
 * Growth batch 2026-11-14 (retention audit G10, G13, G14, growth 1/3): the server-delivered event
 * schedule, friend-invite rewards, shared replays and the incremental, local-day statistics rollup,
 * on every storage adapter.
 */
import { describe, expect, it } from 'vitest';
import { applyEventSchedule, checkEventSchedule, type EventSchedule } from '../../../src/backend/net/eventSchedule';
import { EventScheduleLoader } from '../../../src/backend/net/eventScheduleLoader';
import { parseShareCode, REFERRAL_JADE, REFERRAL_MONTHLY_CAP, shareLink } from '../../../src/backend/net/growth';
import { dataVersionOf } from '../../../src/backend/net/dataVersion';
import { activeEvents, upcomingEvents } from '../../../src/gameplay/sim/events';
import { defaultData } from '../../../src/gameplay/sim/data';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { hallType } from '../../../src/gameplay/sim/data';
import { SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import type { ApiError } from '../../../server/core';
import { funnelOf, summarize } from '../../../server/core/statsLocal';
import type { Repo } from '../../../server/repo';
import { HOUR, world } from './harness';
import { repoFactories } from './pg';

const DAY = 24 * HOUR;
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as ApiError).parts?.[0]?.key ?? String(e);
  }
  return 'ok';
}

/** Raise the Keep of a village the server holds (a test shortcut for many upgrades). */
async function setKeep(repo: Repo, playerId: string, keep: number) {
  const row = (await repo.getVillage(playerId))!;
  const s = deserialize(row.file, defaultData);
  s.buildings.find((b) => b.type === hallType(defaultData))!.level = keep;
  expect(await repo.saveVillage({ ...row, file: serialize(s, row.at), revision: row.revision + 1 }, row.revision, [], [])).toBe(true);
}

const schedule = (over: Partial<EventSchedule> = {}): EventSchedule => ({
  format: 1,
  id: 'test-winter',
  epoch: Date.UTC(2026, 10, 1),
  periodDays: 7,
  entries: [
    { id: 'raiders_moon', startHour: 0, durationHours: 24 },
    { id: 'harvest_moon', startHour: 48, durationHours: 48 },
  ],
  ...over,
});

describe('event schedule from the server (G10)', () => {
  it('accepts only known events timed inside one period', () => {
    expect(checkEventSchedule(schedule(), defaultData.events)).toEqual(schedule());
    expect(checkEventSchedule(schedule({ entries: [{ id: 'mystery', startHour: 0, durationHours: 5 }] }), defaultData.events)).toEqual({ error: 'unknown event mystery' });
    expect(checkEventSchedule(schedule({ entries: [{ id: 'harvest_moon', startHour: 0, durationHours: 5 }, { id: 'harvest_moon', startHour: 10, durationHours: 5 }] }), defaultData.events)).toHaveProperty('error');
    expect(checkEventSchedule(schedule({ entries: [{ id: 'harvest_moon', startHour: 160, durationHours: 24 }] }), defaultData.events)).toHaveProperty('error');
    expect(checkEventSchedule(schedule({ periodDays: 3 }), defaultData.events)).toHaveProperty('error');
    expect(checkEventSchedule({ ...schedule(), format: 2 }, defaultData.events)).toHaveProperty('error');
  });

  it('keeps the built-in names, effects and goals and changes only the timing', () => {
    const ev = applyEventSchedule(defaultData.events, schedule());
    const data = { ...defaultData, events: ev };
    const raid = activeEvents(Date.UTC(2026, 10, 8, 3), data);
    expect(raid.map((e) => e.id)).toEqual(['raiders_moon']);
    expect(raid[0].effect).toEqual(defaultData.events.schedule.find((e) => e.id === 'raiders_moon')!.effect);
    expect(upcomingEvents(Date.UTC(2026, 10, 8, 3), 2, data).map((e) => e.id)).toEqual(['harvest_moon', 'raiders_moon']);
  });

  it('the game applies it at hello, keeps it for an offline start and clears it when the server sends none', () => {
    const map = new Map<string, string>();
    const kv = { get: (k: string) => map.get(k) ?? null, set: (k: string, v: string | null) => void (v === null ? map.delete(k) : map.set(k, v)) };
    const data = structuredClone(defaultData);
    const builtInVersion = dataVersionOf(data);
    const l = new EventScheduleLoader(kv, data);
    expect(l.offer({ ...schedule(), entries: [{ id: 'nope', startHour: 0, durationHours: 1 }] })).toBe('refused');
    expect(l.source).toBe('built-in');
    expect(l.offer(schedule())).toBe('applied');
    expect(data.events.periodDays).toBe(7);
    expect(dataVersionOf(data)).not.toBe(builtInVersion);
    // The server plays the same schedule: same data, same data version.
    expect(dataVersionOf(data)).toBe(dataVersionOf({ ...defaultData, events: applyEventSchedule(defaultData.events, schedule()) }));
    expect(l.offer(schedule())).toBe('same');
    // Next start, offline: the kept schedule.
    const data2 = structuredClone(defaultData);
    expect(new EventScheduleLoader(kv, data2).applyCached()?.id).toBe('test-winter');
    expect(data2.events.periodDays).toBe(7);
    // A server with no schedule: back to the built-in one.
    expect(l.offer(undefined)).toBe('cleared');
    expect(dataVersionOf(data)).toBe(builtInVersion);
    expect(new EventScheduleLoader(kv, structuredClone(defaultData)).applyCached()).toBeNull();
  });

  it('hello sends the schedule the server plays, and lists the growth features', async () => {
    const s = schedule();
    const data = { ...defaultData, events: applyEventSchedule(defaultData.events, s) };
    const w = world({ data, shared: { eventSchedule: s } });
    const h = w.core.hello();
    expect(h.events).toEqual(s);
    expect(h.dataVersion).toBe(dataVersionOf(data));
    expect(h.features).toEqual(expect.arrayContaining(['event-schedule', 'referrals', 'shared-replays']));
    expect(world().core.hello().events).toBeUndefined();
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`friend invites on ${label} storage (G13)`, () => {
    const setup = async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann');
      w.advance(2 * DAY);
      const code = (await ann.friends()).code;
      const recruit = async (name: string) => {
        const c = await w.player(name);
        return { c, me: (await w.repo.getPlayer(c.id))! };
      };
      return { w, ann, code, recruit, annMe: async () => (await w.repo.getPlayer(ann.id))! };
    };

    it('pays both sides a fixed amount once, only when the server holds the recruit at Keep 3', async () => {
      const { w, ann, code, recruit, annMe } = await setup();
      const ben = await recruit('Ben');
      const g = w.core.growth;
      expect(await refusal(g.linkReferral(ben.me, { code: 'KAGE-ZZZZZZ' }))).toBe('referral.no_code');
      expect(await refusal(g.linkReferral(await annMe(), { code }))).toBe('referral.self');
      const linked = await g.linkReferral(ben.me, { code });
      expect(linked).toMatchObject({ invitedBy: { qualified: false, rewarded: false }, canEnterCode: false });
      expect(await refusal(g.linkReferral(ben.me, { code }))).toBe('referral.already');
      // Nothing yet: device villages, then Keep 1.
      expect(await g.claimReferrals(ben.me)).toMatchObject({ granted: 0, needsServerVillage: true });
      await ben.c.startVillage();
      await ann.startVillage();
      expect(await g.claimReferrals(ben.me)).toMatchObject({ granted: 0, invitedBy: { qualified: false } });
      await setKeep(w.repo, ben.c.id, 3);
      const paid = await g.claimReferrals(ben.me);
      expect(paid).toMatchObject({ granted: REFERRAL_JADE, invitedBy: { qualified: true, rewarded: true } });
      expect((await g.claimReferrals(ben.me)).granted).toBe(0); // once
      expect((await ben.c.ledger(10)).entries.find((l) => l.reason === 'referral:recruit')).toMatchObject({ resource: 'moonstones', delta: REFERRAL_JADE });
      expect(await g.referrals(await annMe())).toMatchObject({ claimable: 1, recruits: { qualified: 1, waiting: 0 } });
      expect((await g.claimReferrals(await annMe())).granted).toBe(REFERRAL_JADE);
      expect(await g.referrals(await annMe())).toMatchObject({ claimable: 0, recruits: { rewarded: 1 }, rewardedThisMonth: 1 });
    });

    it('refuses late codes, shared devices and held-back imports, and caps the inviter per month', async () => {
      const { w, ann, code, recruit, annMe } = await setup();
      const g = w.core.growth;
      await ann.startVillage();
      // A device the inviter plays on.
      const annRow = (await w.repo.getVillage(ann.id))!;
      await w.repo.saveVillage({ ...annRow, revision: annRow.revision + 1, deviceSeqs: { 'dev-ann': 3 } }, annRow.revision, [], []);
      const same = await recruit('Sam');
      expect(await refusal(g.linkReferral(same.me, { code, device: 'dev-ann' }))).toBe('referral.not_allowed');
      // Too late.
      const old = await recruit('Olga');
      w.advance(8 * DAY);
      expect(await refusal(g.linkReferral(old.me, { code }))).toBe('referral.too_late');
      // Six recruits at Keep 3; the inviter collects five this month, the sixth next month.
      const held = await recruit('Hal');
      await g.linkReferral(held.me, { code });
      await held.c.startVillage();
      await setKeep(w.repo, held.c.id, 3);
      await w.repo.addImportHold({ id: 'h1', playerId: held.c.id, at: w.now(), jade: 900, premium: false, purchases: [], status: 'held' });
      expect((await g.claimReferrals(held.me)).granted).toBe(0); // imported Jade still held back
      for (let i = 0; i < REFERRAL_MONTHLY_CAP + 1; i++) {
        const r = await recruit(`Rec${i}`);
        await g.linkReferral(r.me, { code });
        await r.c.startVillage();
        await setKeep(w.repo, r.c.id, 4);
        expect((await g.claimReferrals(r.me)).granted).toBe(REFERRAL_JADE);
      }
      expect((await g.claimReferrals(await annMe())).granted).toBe(REFERRAL_JADE * REFERRAL_MONTHLY_CAP);
      expect(await g.referrals(await annMe())).toMatchObject({ claimable: 0, recruits: { qualified: 1 } });
      w.setTime(Date.UTC(new Date(w.now()).getUTCFullYear(), new Date(w.now()).getUTCMonth() + 1, 2));
      expect((await g.claimReferrals(await annMe())).granted).toBe(REFERRAL_JADE);
    });

    it('account deletion removes the pairs either way', async () => {
      const { w, code, recruit, annMe } = await setup();
      const ben = await recruit('Ben');
      await w.core.growth.linkReferral(ben.me, { code });
      await w.core.deleteAccount(ben.me);
      expect(await w.repo.referralsBy((await annMe()).id)).toEqual([]);
    });
  });

  describe(`shared replays on ${label} storage (G14)`, () => {
    const battle = () => {
      const base = generateOpponent(7, 2, defaultData);
      const army = { hedgehog_roller: 10 };
      const deployments = Array.from({ length: 10 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + i }));
      const setup = { seed: 1234, base, army, infiltration: true };
      return { setup, deployments, result: runBattle(setup, deployments, defaultData).result };
    };

    it('re-simulates, strips names, and opens by code without an account', async () => {
      const w = world({ repo: await makeRepo() });
      const a = await w.player('Ayla');
      const me = (await w.repo.getPlayer(a.id))!;
      const b = battle();
      const { code, expiresAt } = await w.core.growth.shareReplay(me, { setup: { ...b.setup, base: { ...b.setup.base, name: 'Secret Village' } }, deployments: b.deployments, rules: SIM_RULES, opponent: 'generated', showName: true });
      expect(parseShareCode(code)).toBe(code);
      expect(parseShareCode(shareLink('https://example.com/play/?x=1', code))).toBe(code);
      expect(expiresAt).toBe(w.now() + 90 * DAY);
      const v = await w.core.growth.sharedReplay(code.toLowerCase());
      expect(v.result).toEqual({ stars: b.result.stars, destruction: b.result.destruction });
      expect(v.setup.base.name).toBe('');
      expect(v.opponent).toBe('generated');
      // Age unknown is not adult: no name even though it was asked for.
      expect(v.sharerName).toBeNull();
      expect(v.views).toBe(1);
      expect((await w.core.growth.myReplays(me)).shares.map((s) => s.code)).toEqual([code]);
      expect(await w.core.growth.deleteSharedReplay(me, code)).toEqual({ deleted: true });
      expect(await refusal(w.core.growth.sharedReplay(code))).toBe('replay.not_found');
    });

    it('names an adult who asks, refuses under-13 sharers and unknown rules, and forgets on deletion', async () => {
      const w = world({ repo: await makeRepo() });
      const adult = await w.player('Ada');
      await adult.stateAge!({ band: 'adult' });
      const kid = await w.player('Kit');
      await kid.stateAge!({ band: 'under13' });
      const b = battle();
      const req = { setup: b.setup, deployments: b.deployments, rules: SIM_RULES, opponent: 'player' as const, showName: true };
      const adultMe = (await w.repo.getPlayer(adult.id))!;
      const { code } = await w.core.growth.shareReplay(adultMe, req);
      expect((await w.core.growth.sharedReplay(code)).sharerName).toBe('Ada');
      expect(await refusal(w.core.growth.shareReplay((await w.repo.getPlayer(kid.id))!, req))).toBe('replay.not_for_age');
      expect(await refusal(w.core.growth.shareReplay(adultMe, { ...req, rules: 1 }))).toBe('replay.rules');
      expect(await refusal(w.core.growth.shareReplay(adultMe, { ...req, deployments: [{ tick: 'x' } as never] }))).toBe('replay.bad');
      await w.core.deleteAccount(adultMe);
      expect(await refusal(w.core.growth.sharedReplay(code))).toBe('replay.not_found');
    });
  });

  describe(`statistics rollup on ${label} storage (growth 1/3)`, () => {
    it('is incremental, counts local days by the reported offset, and forgets an id with its events', async () => {
      const T0 = Date.UTC(2026, 10, 1, 23, 30); // 23:30 UTC = 08:30 next day at UTC+9
      const w = world({ repo: await makeRepo(), start: T0 });
      const ev = (at: number, name = 'session_start', props: Record<string, unknown> = {}) => ({ name, at, props });
      await w.core.postStats({ install: ID, build: 't', tz: 540, events: [ev(T0), ev(T0, 'tutorial_step', { step: 3 })] });
      await w.core.postStats({ install: ID2, build: 't', events: [ev(T0)] });
      expect(await w.core.rollupStats()).toMatchObject({ installs: 2 });
      // Nothing new: the next run reads only what landed around the previous one, then nothing.
      w.advance(2 * HOUR);
      expect((await w.core.rollupStats()).installs).toBe(2);
      w.advance(HOUR);
      expect((await w.core.rollupStats()).installs).toBe(0);
      // Next local day for ID (Tokyo), still the same UTC day+1 for both.
      w.setTime(T0 + 20 * HOUR);
      await w.core.postStats({ install: ID, build: 't', tz: 540, events: [ev(w.now())] });
      expect((await w.core.rollupStats()).installs).toBe(1);
      const local = await w.core.growth.statsLocalReport(30, 'local');
      const utc = await w.core.growth.statsLocalReport(30, 'utc');
      expect(local.rows.map((r) => [r.date, r.installs, r.d1])).toEqual([
        ['2026-11-02', 1, 1],
        ['2026-11-01', 1, 0],
      ]);
      expect(utc.rows.map((r) => [r.date, r.installs, r.d1])).toEqual([['2026-11-01', 2, 1]]);
      const funnel = await w.core.growth.statsFunnel(30, 'utc');
      expect(funnel.installs).toBe(2);
      expect(funnel.tutorialReached.find((s) => s.step === 3)?.installs).toBe(1);
      // The UTC daily table the old staff view reads is rebuilt from the summaries.
      expect((await w.core.statsReport(30)).rows.map((r) => r.installs)).toEqual([2]);
      await w.core.deleteStats(ID);
      expect((await w.core.growth.statsFunnel(30, 'utc')).installs).toBe(1);
    });
  });
}

describe('statistics summaries are pure', () => {
  it('counts days on both bases and the funnel from them', () => {
    const s = summarize(ID, [{ install: ID, name: 'session_start', at: Date.UTC(2026, 0, 1, 20), props: {}, arm: '' }], -300, 0);
    expect(s.firstDayLocal).toBe(s.firstDayUtc); // 15:00 local, same day
    const t = summarize(ID, [{ install: ID, name: 'session_start', at: Date.UTC(2026, 0, 1, 20), props: {}, arm: '' }], 300, 0);
    expect(t.firstDayLocal).toBe(t.firstDayUtc + 1);
    expect(funnelOf([s], 'utc', s.firstDayUtc + 2, 30)).toMatchObject({ installs: 1, d1: { returned: 0, of: 1 }, d7: { of: 0 } });
  });
});
