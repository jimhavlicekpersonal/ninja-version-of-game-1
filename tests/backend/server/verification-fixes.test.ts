/**
 * Third verification fixes 2026-11-14 (docs/store/WORLDWIDE_AUDIT.md): referral payments under parallel claims
 * and after recruit deletion, adults-only referrals and stable installation ids, push tokens and under-13 bands,
 * the `offline` under-13 mode's matchmaking and memberships, shared-replay limits, fields and defender privacy,
 * the statistics lag window, and the village-parts read under a row lock (Postgres).
 */
import { describe, expect, it } from 'vitest';
import { REFERRAL_JADE, REFERRAL_MONTHLY_CAP, SHARED_REPLAYS_PER_DAY } from '../../../src/backend/net/growth';
import { ComplianceRoutes } from '../../../src/backend/net/compliance';
import { defaultData, hallType } from '../../../src/gameplay/sim/data';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { runBattle, SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import type { ApiError } from '../../../server/core';
import { LAG_MS } from '../../../server/core/statsLocal';
import { ServerPush, type PushMessage, type PushTransport } from '../../../server/push/push';
import type { Repo } from '../../../server/repo';
import { checkEventSchedule } from '../../../src/backend/net/eventSchedule';
import { PLAYER_COMMANDS } from '../../../src/gameplay/sim/serverEconomy';
import { emulator } from './economyHarness';
import { baseAt, HOUR, world } from './harness';
import { freshPgRepo, hasPg, repoFactories } from './pg';

const DAY = 24 * HOUR;

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as ApiError).parts?.[0]?.key ?? String(e);
  }
  return 'ok';
}

async function setKeep(repo: Repo, playerId: string, keep: number) {
  const row = (await repo.getVillage(playerId))!;
  const s = deserialize(row.file, defaultData);
  s.buildings.find((b) => b.type === hallType(defaultData))!.level = keep;
  expect(await repo.saveVillage({ ...row, file: serialize(s, row.at), revision: row.revision + 1 }, row.revision, [], [])).toBe(true);
}

async function invites(repo: Repo) {
  const w = world({ repo });
  const ann = await w.player('Ann');
  await ann.stateAge({ band: 'adult' });
  w.advance(2 * DAY);
  const code = (await ann.friends()).code;
  const recruit = async (name: string, band: 'adult' | '13to17' | 'under13' | null = 'adult') => {
    const c = await w.player(name);
    if (band) await c.stateAge({ band });
    return { c, me: async () => (await w.repo.getPlayer(c.id))! };
  };
  /** A linked recruit whose server-held village is at the Keep. */
  const ready = async (name: string) => {
    const r = await recruit(name);
    await w.core.growth.linkReferral(await r.me(), { code });
    await r.c.startVillage();
    await setKeep(w.repo, r.c.id, 3);
    return r;
  };
  await ann.startVillage();
  return { w, ann, code, recruit, ready, annMe: async () => (await w.repo.getPlayer(ann.id))! };
}

for (const [label, makeRepo] of repoFactories) {
  describe(`friend invites on ${label} storage (third verification)`, () => {
    it('parallel claims pay each side once and never pass the monthly cap', async () => {
      const { w, ready, annMe } = await invites(await makeRepo());
      const g = w.core.growth;
      const ben = await ready('Ben');
      const benMe = await ben.me();
      const paid = await Promise.all(Array.from({ length: 6 }, () => g.claimReferrals(benMe)));
      expect(paid.reduce((n, v) => n + (v.granted ?? 0), 0)).toBe(REFERRAL_JADE);
      expect((await ben.c.ledger(20)).entries.filter((l) => l.reason === 'referral:recruit')).toHaveLength(1);
      // Six more qualified recruits (seven in all); six parallel inviter claims pay the cap exactly.
      for (let i = 0; i < 6; i++) {
        const r = await ready(`Rec${i}`);
        await g.claimReferrals(await r.me());
      }
      const ann = await annMe();
      const inviter = await Promise.all(Array.from({ length: 6 }, () => g.claimReferrals(ann)));
      expect(inviter.reduce((n, v) => n + (v.granted ?? 0), 0)).toBe(REFERRAL_JADE * REFERRAL_MONTHLY_CAP);
      expect(await w.repo.inviterRewardsSince(ann.id, 0)).toBe(REFERRAL_MONTHLY_CAP);
    });

    it("deleting rewarded recruits does not reopen the inviter's monthly cap, and keeps nothing about them", async () => {
      const { w, ready, annMe } = await invites(await makeRepo());
      const g = w.core.growth;
      const recruits = [];
      for (let i = 0; i < REFERRAL_MONTHLY_CAP; i++) {
        const r = await ready(`Rec${i}`);
        await g.claimReferrals(await r.me());
        recruits.push(r);
      }
      expect((await g.claimReferrals(await annMe())).granted).toBe(REFERRAL_JADE * REFERRAL_MONTHLY_CAP);
      for (const r of recruits) await w.core.deleteAccount(await r.me());
      expect(await w.repo.referralsBy((await annMe()).id)).toEqual([]);
      const extra = await ready('Late');
      await g.claimReferrals(await extra.me());
      expect((await g.claimReferrals(await annMe())).granted).toBe(0);
      expect(await g.referrals(await annMe())).toMatchObject({ rewardedThisMonth: REFERRAL_MONTHLY_CAP, claimable: 0 });
      // The inviter's own deletion takes their ledger; the recruit keeps their own row (so no second code).
      const extraId = extra.c.id;
      await w.core.deleteAccount(await annMe());
      expect(await w.repo.inviterRewardsSince((await annMe())?.id ?? '', 0)).toBe(0);
      expect(await w.repo.referralOf(extraId)).toMatchObject({ inviterId: 'deleted' });
      expect(await refusal(g.linkReferral(await extra.me(), { code: 'KAGE-ZZZZZZ' }))).toBe('referral.no_code');
    });

    it('adults only: a minor or unstated recruit enters nothing, a minor inviter earns nothing', async () => {
      const { w, ann, code, recruit, annMe } = await invites(await makeRepo());
      const g = w.core.growth;
      for (const band of ['13to17', 'under13', null] as const) {
        const kid = await recruit(`Kid${band ?? 'x'}`, band);
        expect(await g.referrals(await kid.me())).toMatchObject({ adultsOnly: true, canEnterCode: false, claimable: 0 });
        expect(await refusal(g.linkReferral(await kid.me(), { code }))).toBe('referral.adults_only');
        expect(await w.repo.referralOf(kid.c.id)).toBeNull();
      }
      expect((await g.referrals(await annMe())).adultsOnly).toBeUndefined();
      // A 13–17 inviter's code earns nothing (refused like any other, no age revealed).
      const teen = await recruit('Teen', '13to17');
      w.advance(2 * DAY);
      const teenCode = (await teen.c.friends()).code;
      const adult = await recruit('Ada');
      expect(await refusal(g.linkReferral(await adult.me(), { code: teenCode }))).toBe('referral.not_allowed');
      // An adult pair where the inviter later states 13–17: neither side is paid.
      const bob = await recruit('Bob');
      await g.linkReferral(await bob.me(), { code });
      await bob.c.startVillage();
      await setKeep(w.repo, bob.c.id, 3);
      await ann.stateAge({ band: '13to17' });
      expect((await g.claimReferrals(await bob.me())).granted).toBe(0);
      expect((await g.claimReferrals(await annMe())).granted).toBe(0);
    });

    it("the inviter's account age: at least a day old and older than the recruit", async () => {
      const repo = await makeRepo();
      const w = world({ repo });
      const g = w.core.growth;
      const fresh = await w.player('Fresh');
      await fresh.stateAge({ band: 'adult' });
      const code = (await fresh.friends()).code;
      w.advance(HOUR);
      const r = await w.player('Rob');
      await r.stateAge({ band: 'adult' });
      // Inviter only an hour old.
      expect(await refusal(g.linkReferral((await w.repo.getPlayer(r.id))!, { code }))).toBe('referral.not_allowed');
      // A recruit older than the inviter.
      w.advance(2 * DAY);
      const younger = await w.player('Young');
      await younger.stateAge({ band: 'adult' });
      w.advance(2 * DAY);
      const youngCode = (await younger.friends()).code;
      const old = await w.player('Olden');
      await old.stateAge({ band: 'adult' });
      expect(await refusal(g.linkReferral((await w.repo.getPlayer(old.id))!, { code: youngCode }))).toBe('ok');
      expect(await refusal(g.linkReferral((await w.repo.getPlayer(r.id))!, { code: youngCode }))).toBe('referral.not_allowed');
    });

    it('a stable installation id the inviter claimed from blocks the pair, at entry and at claim', async () => {
      const { w, code, recruit, annMe } = await invites(await makeRepo());
      const g = w.core.growth;
      await g.claimReferrals(await annMe(), { install: 'install-shared-1' });
      const sam = await recruit('Sam');
      // A different per-village queue id, the same installation: refused.
      expect(await refusal(g.linkReferral(await sam.me(), { code, device: 'queue-new-0001', install: 'install-shared-1' }))).toBe('referral.not_allowed');
      // Linked from another installation, then claimed from the inviter's: never qualifies.
      const tom = await recruit('Tom');
      await g.linkReferral(await tom.me(), { code, install: 'install-tom-0001' });
      await tom.c.startVillage();
      await setKeep(w.repo, tom.c.id, 3);
      expect((await g.claimReferrals(await tom.me(), { install: 'install-shared-1' })).granted).toBe(0);
      expect((await g.referrals(await tom.me())).invitedBy).toMatchObject({ qualified: false });
      expect(await w.repo.installsOf(tom.c.id)).toEqual(expect.arrayContaining(['install-tom-0001', 'install-shared-1']));
      await w.core.deleteAccount(await tom.me());
      expect(await w.repo.installsOf(tom.c.id)).toEqual([]);
    });
  });

  describe(`push and under-13 on ${label} storage (third verification)`, () => {
    const TOKEN = 'c'.repeat(64);
    it('a token from before an under-13 statement is deleted, and delivery refuses an under-13 band in every mode', async () => {
      for (const mode of ['limited', 'offline'] as const) {
        const repo = await makeRepo();
        const sent: string[] = [];
        const t: PushTransport = { platforms: ['ios', 'android'], send: async (_p, token) => (sent.push(token), 'sent') };
        const w = world({ repo, shared: { policy: { under13Mode: mode } } });
        const push = new ServerPush({ repo, data: defaultData, transport: t, now: () => w.now() });
        const kid = await w.player('Kid');
        await kid.putPushToken({ token: TOKEN, platform: 'ios', types: ['raided'], tzOffsetMinutes: 0 });
        expect(await repo.pushTokensOf(kid.id)).toHaveLength(1);
        await kid.stateAge({ band: 'under13' }).catch(() => undefined);
        expect(await repo.pushTokensOf(kid.id)).toEqual([]);
        // A token written behind the core's back (an older server build) is refused and removed at delivery.
        await repo.putPushToken({ token: TOKEN, playerId: kid.id, platform: 'ios', types: ['raided'], tzOffsetMinutes: 0, updatedAt: w.now() });
        const m: PushMessage = { type: 'raided', title: 'x', body: 'y' };
        expect(await push.deliver(kid.id, m)).toEqual(['age']);
        expect(sent).toEqual([]);
        expect(await repo.pushTokensOf(kid.id)).toEqual([]);
      }
    });

    it('offline mode: an under-13 statement leaves the Alliance and Gang and takes the base out of matchmaking', async () => {
      const w = world({ repo: await makeRepo(), shared: { policy: { under13Mode: 'offline' } } });
      const kid = await w.player('Kid', baseAt(1, 77));
      const mate = await w.player('Mate');
      const grove = await kid.createGrove('Hidden Pines');
      await mate.joinGrove(grove.id);
      await kid.createSquad('Leaf Gang');
      w.pastShields();
      const ann = await w.player('Ann', baseAt(1));
      expect((await ann.match()).opponent.kind).toBe('player');
      expect(await refusal(kid.stateAge({ band: 'under13' }))).toBe('age.under13_offline');
      expect(await w.repo.getMembership(kid.id)).toBeNull();
      expect(await w.repo.squadOf(kid.id)).toBeNull();
      // The Alliance keeps going under the remaining member, and the notice names nobody.
      expect((await w.repo.members(grove.id)).map((m) => m.playerId)).toEqual([mate.id]);
      w.advance(2 * HOUR);
      const again = await w.player('Bea', baseAt(1));
      expect((await again.match()).opponent.kind).toBe('bot');
    });
  });

  describe(`shared replays on ${label} storage (third verification)`, () => {
    const battle = () => {
      const base = generateOpponent(7, 2, defaultData);
      const army = { hedgehog_roller: 10 };
      const deployments = Array.from({ length: 10 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + i }));
      const setup = { seed: 1234, base, army, infiltration: true };
      return { setup, deployments, result: runBattle(setup, deployments, defaultData).result };
    };
    const req = (b: ReturnType<typeof battle>, over: Record<string, unknown> = {}) => ({ setup: b.setup, deployments: b.deployments, rules: SIM_RULES, opponent: 'generated' as const, ...over });

    it('the daily limit counts shares made, so deleting them gives none back', async () => {
      const w = world({ repo: await makeRepo() });
      const a = await w.player('Ayla');
      const me = (await w.repo.getPlayer(a.id))!;
      const b = battle();
      for (let i = 0; i < SHARED_REPLAYS_PER_DAY; i++) {
        const { code } = await w.core.growth.shareReplay(me, req(b));
        expect(await w.core.growth.deleteSharedReplay(me, code)).toEqual({ deleted: true });
      }
      expect(await refusal(w.core.growth.shareReplay(me, req(b)))).toBe('replay.too_many');
      w.advance(DAY + HOUR);
      expect(await refusal(w.core.growth.shareReplay(me, req(b)))).toBe('ok');
    });

    it('stores and serves only the battle fields, whatever else the request carries', async () => {
      const w = world({ repo: await makeRepo() });
      const me = (await w.repo.getPlayer((await w.player('Ayla')).id))!;
      const b = battle();
      const base = { ...b.setup.base, secret: 'x', buildings: b.setup.base.buildings.map((x) => ({ ...x, note: 'call me' })) };
      const setup = { ...b.setup, base, contact: 'mail me', army: b.setup.army };
      const deployments = b.deployments.map((d) => ({ ...d, extra: 'hi' }));
      const { code } = await w.core.growth.shareReplay(me, { setup, deployments, rules: SIM_RULES, opponent: 'generated', extra: 'nope' } as never);
      const v = await w.core.growth.sharedReplay(code);
      const text = JSON.stringify(v);
      for (const word of ['secret', 'call me', 'mail me', 'contact', 'extra', 'nope']) expect(text).not.toContain(word);
      expect(v.result).toEqual({ stars: b.result.stars, destruction: b.result.destruction });
      expect(Object.keys(v.setup).sort()).toEqual(['army', 'base', 'infiltration', 'seed']);
    });

    it("labels a raid the server recorded as a real player's, and keeps minors' and opted-out bases out", async () => {
      const w = world({ repo: await makeRepo() });
      const a = await w.player('Ayla');
      await a.stateAge({ band: 'adult' });
      const me = (await w.repo.getPlayer(a.id))!;
      const raid = async (defender: string, seed: number) => {
        const b = battle();
        b.setup.seed = seed;
        await w.repo.addAttack({ id: `atk-${seed}`, at: w.now(), attackerId: me.id, attackerName: me.name, defenderId: defender, seed, army: b.setup.army, base: b.setup.base, deployments: b.deployments, result: b.result, attackerTrophies: 0, defenderTrophies: 0 });
        return b;
      };
      const adult = await w.player('Dan');
      await adult.stateAge({ band: 'adult' });
      const teen = await w.player('Tess');
      await teen.stateAge({ band: '13to17' });
      const unknown = await w.player('Uno');
      // A recorded raid on an adult: labelled 'player' even though the request says 'generated'.
      const onAdult = await raid(adult.id, 501);
      const { code } = await w.core.growth.shareReplay(me, req(onAdult));
      expect((await w.core.growth.sharedReplay(code)).opponent).toBe('player');
      // Marked bases stay labelled by their markers whatever the request says.
      const practice = battle();
      const marked = await w.core.growth.shareReplay(me, req(practice, { setup: { ...practice.setup, seed: 77, base: { ...practice.setup.base, practice: 'ring' } }, opponent: 'player' }));
      expect((await w.core.growth.sharedReplay(marked.code)).opponent).toBe('practice');
      // A minor's base, or one whose band is not stated, is never shared.
      expect(await refusal(w.core.growth.shareReplay(me, req(await raid(teen.id, 502))))).toBe('replay.base_private');
      expect(await refusal(w.core.growth.shareReplay(me, req(await raid(unknown.id, 503))))).toBe('replay.base_private');
      // The adult opts out: refused from now on, and the share already made is gone.
      const adultMe = (await w.repo.getPlayer(adult.id))!;
      expect(await w.core.compliance.replayPrivacy(adultMe)).toEqual({ baseInReplays: true });
      expect(await w.core.compliance.setReplayPrivacy(adultMe, { allowBase: false })).toMatchObject({ baseInReplays: false });
      expect(await refusal(w.core.growth.sharedReplay(code))).toBe('replay.not_found');
      expect(await refusal(w.core.growth.shareReplay(me, req(onAdult)))).toBe('replay.base_private');
      await w.core.compliance.setReplayPrivacy(adultMe, { allowBase: true });
      const again = await w.core.growth.shareReplay(me, req(onAdult));
      // Becoming a minor later (stricter band) or deleting the account removes it too.
      await adult.stateAge({ band: '13to17' });
      expect(await refusal(w.core.growth.sharedReplay(again.code))).toBe('replay.not_found');
      expect(await refusal(w.core.compliance.setReplayPrivacy((await w.repo.getPlayer(adult.id))!, { allowBase: true }))).toBe('consent.not_adult');
      const eve = await w.player('Eve');
      await eve.stateAge({ band: 'adult' });
      const third = await w.core.growth.shareReplay(me, req(await raid(eve.id, 504)));
      await w.core.deleteAccount((await w.repo.getPlayer(eve.id))!);
      expect(await refusal(w.core.growth.sharedReplay(third.code))).toBe('replay.not_found');
    });
  });

  describe(`statistics rollup on ${label} storage (third verification)`, () => {
    it('rolls only events older than the lag window, so a late-committed batch is not skipped', async () => {
      const T0 = Date.UTC(2026, 10, 1, 10);
      const w = world({ repo: await makeRepo(), start: T0 });
      const ID_A = '0f8fad5b-d9cb-469f-a165-70867728950e';
      const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
      const ID_C = '16fd2706-8baf-433b-82eb-8c7fada847da';
      const ev = (at: number) => ({ name: 'session_start', at, props: {} });
      await w.core.postStats({ install: ID_A, build: 't', events: [ev(T0)] });
      w.advance(10 * 60_000);
      await w.core.postStats({ install: ID_B, build: 't', events: [ev(w.now())] });
      await w.core.rollupStats();
      // A batch whose receipt time was taken 90 s ago, committed only now (a slow insert, another instance's clock).
      await w.repo.addStatsEvents(ID_C, 't', '', [ev(w.now() - 90_000)], w.now() - 90_000);
      w.advance(HOUR);
      await w.core.rollupStats();
      const all = await w.repo.installSummaries('utc', 0, 100_000);
      expect(all.map((s) => s.install).sort()).toEqual([ID_A, ID_B, ID_C].sort());
      expect(LAG_MS).toBeGreaterThan(90_000);
    });
  });
}

describe('replay privacy over HTTP routes', () => {
  it('the route exists, takes a boolean and is listed in hello', async () => {
    const w = world();
    const p = await w.player('Ada');
    await p.stateAge({ band: 'adult' });
    expect(w.core.hello().features).toContain('replay-privacy');
    expect(await p.call('GET', ComplianceRoutes.replayPrivacy)).toEqual({ baseInReplays: true });
    expect(await p.call('PUT', ComplianceRoutes.replayPrivacy, { allowBase: false })).toEqual({ baseInReplays: false });
    // The terms/consent record is unchanged (older games compare it whole).
    expect(await p.call('GET', ComplianceRoutes.compliance)).toEqual({ termsVersion: null, consumptionConsent: false });
    await expect(p.call('PUT', ComplianceRoutes.replayPrivacy, { allowBase: 'no' })).rejects.toMatchObject({ code: 'bad_request' });
  });
});

describe.skipIf(!hasPg)('village parts under a row lock (Postgres, VILLAGE_PARTS=1)', () => {
  it('a reader that waited for the lock sees the parts the writer committed (no stale buildings)', async () => {
    const repo = await freshPgRepo();
    const w = world({ repo });
    const ann = await w.player('Ann');
    await ann.startVillage();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const holding = new Promise<void>((r) => (locked = r));
    const writer = repo.transaction(async (tx) => {
      const row = (await tx.getVillage(ann.id, { forUpdate: true }))!;
      locked();
      await gate;
      const s = deserialize(row.file, defaultData);
      s.buildings.find((b) => b.type === hallType(defaultData))!.level = 4;
      expect(await tx.saveVillage({ ...row, file: serialize(s, row.at), revision: row.revision + 1 }, row.revision, [], [])).toBe(true);
    });
    await holding;
    const reader = repo.transaction(async (tx) => (await tx.getVillage(ann.id, { forUpdate: true }))!);
    // Let the reader start its statement and wait on the lock, then commit the writer.
    await new Promise((r) => setTimeout(r, 300));
    release();
    await writer;
    const row = await reader;
    const keep = deserialize(row.file, defaultData).buildings.find((b) => b.type === hallType(defaultData))!.level;
    expect(keep).toBe(4);
  });
});

describe('missing tests the verifier listed (8g)', () => {
  it('an event schedule entry lasts 1 to 168 whole hours', () => {
    const s = (durationHours: number) => ({ format: 1, id: 'x', epoch: Date.UTC(2026, 10, 1), periodDays: 7, entries: [{ id: 'raiders_moon', startHour: 0, durationHours }] });
    expect(checkEventSchedule(s(1), defaultData.events)).not.toHaveProperty('error');
    expect(checkEventSchedule(s(168), defaultData.events)).not.toHaveProperty('error');
    for (const bad of [0, -1, 169, 1.5, Number.NaN]) expect(checkEventSchedule(s(bad), defaultData.events), String(bad)).toHaveProperty('error');
  });

  it('chooseHero is refused online even when the data turns the Hero Hall feature on', async () => {
    expect(PLAYER_COMMANDS.has('chooseHero')).toBe(false);
    const data = { ...defaultData, features: { ...(defaultData.features ?? {}), heroChoice: true } };
    const w = world({ data });
    const ann = await w.player('Ann');
    const game = emulator((await ann.startVillage()).file, w.data);
    game.raw({ type: 'chooseHero', hero: null }, w.now());
    const r = await ann.sendCommands(game.batch());
    expect(r.results.map((x) => x.error)).toEqual(['NOT_ALLOWED']);
  });
});
