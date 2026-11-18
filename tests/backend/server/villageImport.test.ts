/** Moving a device village to the server with sanity limits for its Keep (roadmap step 25). */
import { describe, expect, it } from 'vitest';
import { checkProvenance, freeJadeAllowance, importProblem, importSizeProblem, IMPORT_MAX_JADE, IMPORT_MAX_LIST } from '../../../server/core/villageImport';
import { signJws, TEST_BUNDLE, testAppleVerifier } from '../fixtures/appstore/sign';
import { storeProductId } from '../../../src/gameplay/sim/monetization';
import { ServerError } from '../../../src/backend/net/ports';
import { deserialize, serialize, validateVillage } from '../../../src/gameplay/sim/save';
import { economyHash } from '../../../src/gameplay/sim/serverEconomy';
import { capacity } from '../../../src/gameplay/sim/resources';
import { applyCommand, createNewVillage } from '../../../src/gameplay/sim/village';
import { dayIndex, passSeason } from '../../../src/gameplay/sim/pass';
import type { BattleRecord } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { emulator, placeCollector, placeType } from './economyHarness';
import { HOUR, world } from './harness';
import { repoFactories } from './pg';

const T = Date.UTC(2026, 3, 6, 12);

/** A village a player could really have: a few buildings, some troops in training. */
function played() {
  const game = emulator(serialize(createNewVillage(T, data), T), data);
  placeType(game, data, 'burrow_barracks', T);
  placeType(game, data, 'army_camp', T);
  placeCollector(game, data, T + 60_000, 'acorns'); // once a builder is free
  game.do({ type: 'train', troop: 'hedgehog_roller', count: 5 }, T + 60_000);
  return game.state;
}

describe('import sanity limits', () => {
  it('passes a real village and names what no village at its Keep could hold', () => {
    const now = T + HOUR;
    expect(importProblem(played(), now, data)).toBeNull();
    const rich = played();
    rich.resources.acorns = capacity(rich, data).acorns + 1;
    expect(importProblem(rich, now, data)).toMatch(/More Coins than the storages hold/);
    const jade = played();
    jade.resources.moonstones = IMPORT_MAX_JADE + 1;
    expect(importProblem(jade, now, data)).toMatch(/Jade/);
    const horde = played();
    horde.army = { hedgehog_roller: 999 };
    expect(importProblem(horde, now, data)).toMatch(/bigger army/);
    const sage = played();
    sage.research.levels = { hedgehog_roller: 9 };
    expect(importProblem(sage, now, data)).toMatch(/Research beyond/);
    const crowd = played();
    const camp = crowd.buildings.find((b) => b.type === 'army_camp')!;
    crowd.buildings.push({ ...camp, id: 'b999', x: camp.x + 6 });
    expect(importProblem(crowd, now, data)).toMatch(/Buildings: too many of Squad Courtyard/);
    const slow = played();
    slow.buildings.find((b) => b.type === 'army_camp')!.upgrade = { startedAt: T, endsAt: T + 400 * 24 * HOUR, toLevel: 1 } as never;
    expect(importProblem(slow, now, data)).toMatch(/impossibly late/);
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`moving a village to the server on ${label} storage`, () => {
    it('keeps the village as it is (same economy), once, with an opening ledger; refuses an impossible one', async () => {
      const w = world({ repo: await makeRepo(), start: T + HOUR });
      const ann = await w.player('Ann');
      const village = played();
      const v = await ann.importVillage(serialize(village, w.now()));
      expect(v.stateHash).toBe(economyHash(village));
      expect((await ann.ledger(20)).entries.every((l) => l.reason === 'import')).toBe(true);
      await expect(ann.importVillage(serialize(village, w.now()))).rejects.toMatchObject({ code: 'conflict' });
      const ben = await w.player('Ben');
      const cheat = played();
      cheat.resources.moonstones = 999_999;
      const e = await ben.importVillage(serialize(cheat, w.now())).catch((x: ServerError) => x);
      expect(e).toMatchObject({ code: 'bad_request' });
      expect((e as ServerError).message).toMatch(/cannot move to the server: More Jade/);
      expect(await ben.getVillage()).toBeNull();
      await expect(ben.importVillage({ nonsense: true })).rejects.toMatchObject({ code: 'bad_request' });
    });
  });
}

describe('worldwide audit GLOBAL-002: import provenance', () => {
  const T2 = Date.UTC(2026, 3, 6, 13);
  const appleTxn = (productId: string, id: string, token: string | null) =>
    signJws({ transactionId: id, originalTransactionId: id, bundleId: TEST_BUNDLE, productId, purchaseDate: T2, environment: 'Sandbox', type: 'Consumable', ...(token ? { appAccountToken: token } : {}) });

  for (const [label, makeRepo] of repoFactories) {
    it(`holds back invented Jade and an unpaid premium Scroll, keeps checked purchases (${label})`, async () => {
      const w = world({ repo: await makeRepo(), start: T2, shared: { payments: { apple: testAppleVerifier() } } });
      // The audit's reproduction: 20,000 Jade, premium on, no purchase records.
      const forger = await w.player('Forger');
      const forged = played();
      forged.resources.moonstones = 20_000;
      forged.pass.premium = true;
      const v = await forger.importVillage(serialize(forged, w.now()));
      const kept = deserialize(v.file, data);
      expect(kept.resources.moonstones).toBe(freeJadeAllowance(1));
      expect(kept.pass.premium).toBe(false);
      expect(v.importHeld).toEqual({ jade: 20_000 - freeJadeAllowance(1), premium: true, purchases: 0 });
      expect(await w.repo.importHoldsOf(forger.id)).toMatchObject([{ jade: 20_000 - freeJadeAllowance(1), premium: true, status: 'held' }]);

      // A real buyer: a Jade purchase and this season's Scroll, checked by this server while the village was on the device.
      const buyer = await w.player('Buyer');
      const i1 = await buyer.purchaseIntent({ store: 'apple', productId: 'moonstones_4', under18: false });
      const r1 = await buyer.redeem({ store: 'apple', storeProductId: 'jade_chest', receipt: appleTxn('jade_chest', '9001', i1.accountToken) });
      const i2 = await buyer.purchaseIntent({ store: 'apple', productId: data.pass.productId, under18: false });
      const r2 = await buyer.redeem({ store: 'apple', storeProductId: storeProductId(data, data.pass.productId), receipt: appleTxn(storeProductId(data, data.pass.productId), '9002', i2.accountToken) });
      expect(r1.heldOnServer).toBe(false);
      const real = played();
      real.purchases.push({ id: r1.transactionId, productId: 'moonstones_4', usd: r1.usd, at: T2 }, { id: r2.transactionId, productId: data.pass.productId, usd: r2.usd, at: T2 });
      real.resources.moonstones = freeJadeAllowance(1) + 1300;
      real.pass.premium = true;
      const bv = await buyer.importVillage(serialize(real, w.now()));
      expect(bv.importHeld).toBeUndefined();
      expect(deserialize(bv.file, data).resources.moonstones).toBe(freeJadeAllowance(1) + 1300);
      expect(deserialize(bv.file, data).pass.premium).toBe(true);

      // The same exported village on another account: its purchases were not this player's, so their value is held.
      const copy = await w.player('Copy');
      const cv = await copy.importVillage(serialize(real, w.now()));
      expect(cv.importHeld).toEqual({ jade: 1300, premium: true, purchases: 2 });
    });
  }

  it('refuses a village played in the testing sandbox', async () => {
    const w = world({ start: T2 });
    const p = await w.player('Tester');
    const sandboxed = played();
    sandboxed.flags.sandbox = true;
    await expect(p.importVillage(serialize(sandboxed, w.now()))).rejects.toMatchObject({ code: 'bad_request', message: expect.stringMatching(/testing sandbox/) });
    expect(await p.getVillage()).toBeNull();
  });

  it('allows a checked buyer more than the free allowance, and never refuses legitimate progress outright below the ceiling', () => {
    const s = played();
    s.resources.moonstones = freeJadeAllowance(1) + 50;
    const r = checkProvenance(s, T2, data, []);
    expect(r.state.resources.moonstones).toBe(freeJadeAllowance(1));
    expect(r.held).toEqual({ jade: 50, premium: false, purchases: [] });
    expect(importProblem(s, T2, data)).toBeNull();
    expect(freeJadeAllowance(15)).toBeGreaterThan(2617 * 3); // the regular model player's Keep 15 balance, with room
  });

  describe('exploit audit 2026-11-16 (XPL-03): liabilities the import never looked at', () => {
    it('holds back the Jade of a stipend no checked purchase covers, and pays none of it', () => {
      const s = played();
      s.stipend = { left: 1, lastDay: -1, jade: 150_000 };
      const r = checkProvenance(s, T2, data, []);
      expect(r.state.stipend.left).toBe(0);
      expect(r.state.stipend.jade).toBe(0);
      expect(r.held?.jade).toBe(150_000);
      expect(importProblem(r.state, T2, data)).toBeNull();
    });

    it('keeps a stipend this server credited, up to what that purchase added', () => {
      const s = played();
      s.purchases = [{ id: 'apple:tx-stipend', productId: data.store.stipend!.id, at: T2 - HOUR, usd: data.store.stipend!.usd, stipend: { payments: 30, jade: 360 } }];
      s.stipend = { left: 30, lastDay: -1, jade: 360 };
      // The server's own row says which product it was; the file's record is not asked.
      const credited = [{ store: 'apple', transactionId: 'tx-stipend', status: 'credited', productId: data.store.stipend!.id, cents: 299, at: T2 - HOUR }] as never;
      const kept = checkProvenance(s, T2, data, credited);
      expect(kept.state.stipend).toMatchObject({ left: 30, jade: 360 });
      expect(kept.held).toBeNull();
      // The same purchase with a forged balance: only what the purchase added moves.
      s.stipend = { left: 30, lastDay: -1, jade: 90_000 };
      const forged = checkProvenance(s, T2, data, credited);
      expect(forged.state.stipend).toMatchObject({ left: 30, jade: 360 });
      expect(forged.held?.jade).toBe(90_000 - 360);
    });

    it('drops a timer\'s top-up record, so a cancel after the move refunds no Jade', () => {
      const s = played();
      const keep = s.buildings.find((b) => data.buildings[b.type].category === 'hall')!;
      keep.upgrade = { startedAt: T2 - 1000, endsAt: T2 + HOUR, toLevel: keep.level + 1, cost: { acorns: 100 }, topUp: { cost: { acorns: 100 }, jade: 200_000 } } as never;
      s.training = [{ troop: 'hedgehog_roller', startedAt: T2 - 1000, endsAt: T2 + 20_000, cost: { dew: 20 }, topUp: { cost: { dew: 20 }, jade: 200_000 } }] as never;
      const out = checkProvenance(s, T2, data, []).state;
      expect(out.buildings.find((b) => b.id === keep.id)!.upgrade!.topUp).toBeUndefined();
      expect(out.training[0].topUp).toBeUndefined();
      expect(out.training[0].cost).toEqual({ dew: 20 });
    });

    it('counts league seasons the device is behind on as settled', async () => {
      const { seasonOf } = await import('../../../src/gameplay/sim/ranks');
      const s = played();
      s.season = seasonOf(T2) - 3000;
      expect(checkProvenance(s, T2, data, []).state.season).toBe(seasonOf(T2));
    });
  });
});

/**
 * Review of the exploit fixes, 2026-11-17: an independent reviewer imported forged village files through the real
 * route and turned what the import still took on trust into currency. Each case is one of those reproductions.
 */
describe('review 2026-11-17: what an imported file can still claim', () => {
  const NOW = Date.UTC(2026, 10, 17, 12);
  const row = (id: string, productId: string) => ({ store: 'apple', transactionId: id, status: 'credited', productId, cents: 99, at: NOW - HOUR, playerId: 'p', environment: 'Production', refundedAt: null, ref: id });

  it('R3-01: a timer\'s recorded price is held to the catalog, so a cancel refunds no forged Jade', () => {
    const s = played();
    const keep = s.buildings.find((b) => data.buildings[b.type].category === 'hall')!;
    keep.upgrade = { startedAt: NOW - 1000, endsAt: NOW + HOUR, toLevel: keep.level + 1, cost: { moonstones: 2_000_000 } };
    s.training = [{ troop: 'hedgehog_roller', startedAt: NOW - 1000, endsAt: NOW + 20_000, cost: { moonstones: 1_000_000, dew: 9_999_999 } }];
    s.research.active = [{ troop: 'hedgehog_roller', toLevel: 2, startedAt: NOW - 1000, endsAt: NOW + HOUR, cost: { moonstones: 2_000_000 } }];
    const out = checkProvenance(s, NOW, data, []).state;
    const timers = [out.buildings.find((b) => b.id === keep.id)!.upgrade!.cost, out.training[0].cost, out.research.active[0].cost];
    for (const cost of timers) expect(cost.moonstones ?? 0).toBe(0);
    // Never more than the warrior costs.
    expect(out.training[0].cost.dew ?? 0).toBeLessThanOrEqual(data.troops.hedgehog_roller.levels[0].cost.dew ?? 0);
    // The three cancels the reviewer ran: no Jade comes back.
    let v = out;
    const jade = v.resources.moonstones;
    for (const cmd of [{ type: 'cancelTraining', index: 0, troop: 'hedgehog_roller' }, { type: 'cancel', id: keep.id }, { type: 'cancelResearch', troop: 'hedgehog_roller' }] as const) {
      const r = applyCommand(v, cmd as never, NOW + 1000, data);
      if (r.ok) v = r.state;
    }
    expect(v.resources.moonstones).toBe(jade);
  });

  it('R3-01: an honest timer keeps its price, including a Coin price paid in Provisions', () => {
    const s = played();
    const wall = data.buildings.bramble_hedge.levels[0].cost;
    const t = s.buildings.find((b) => b.type === 'army_camp')!;
    const price = data.buildings.army_camp.levels[t.level]?.cost ?? {};
    t.upgrade = { startedAt: NOW - 1000, endsAt: NOW + HOUR, toLevel: t.level + 1, cost: { ...price } };
    s.buildings.push({ id: 'w1', type: 'bramble_hedge', level: 0, x: 1, y: 1, upgrade: { startedAt: NOW - 1000, endsAt: NOW + 1000, toLevel: 1, cost: { dew: wall.acorns ?? 0 } }, collector: null });
    const out = checkProvenance(s, NOW, data, []).state;
    expect(out.buildings.find((b) => b.id === t.id)!.upgrade!.cost).toEqual(price);
    expect(out.buildings.find((b) => b.id === 'w1')!.upgrade!.cost).toEqual((wall.acorns ?? 0) > 0 ? { dew: wall.acorns } : {});
  });

  it('R3-03 / R3-09: a credited purchase is what the server\'s row says, never what the file\'s record says', () => {
    const s = played();
    // One real $0.99 Jade purchase; the file's record for it names the Scroll, 150,000 Jade and a 5,000,000 Jade stipend.
    const pack = data.store.packs[0];
    s.purchases = [{ id: 'apple:tx1', productId: data.pass.productId, at: NOW - HOUR, usd: 0.99, grants: { moonstones: 150_000 }, stipend: { payments: 1, jade: 5_000_000 }, refund: { took: {}, skins: [], premium: false, claimedPremium: [] } } as never];
    s.resources.moonstones = 152_000;
    s.stipend = { left: 1, lastDay: -1, jade: 5_000_000 };
    s.pass.premium = true;
    const r = checkProvenance(s, NOW, data, [row('tx1', pack.id)] as never);
    expect(r.state.purchases).toEqual([{ id: 'apple:tx1', productId: pack.id, usd: 0.99, at: NOW - HOUR }]);
    expect(r.state.resources.moonstones).toBe(freeJadeAllowance(1) + pack.moonstones);
    expect(r.state.pass.premium).toBe(false);
    expect(r.state.stipend).toMatchObject({ left: 0, jade: 0 });
    expect(r.held).toMatchObject({ premium: true, jade: 152_000 - freeJadeAllowance(1) - pack.moonstones + 5_000_000 });
  });

  it('R3-03: the same purchase listed fifty times is counted once', () => {
    const s = played();
    const pack = data.store.packs[0];
    s.purchases = Array.from({ length: 50 }, () => ({ id: 'apple:tx1', productId: pack.id, at: NOW - HOUR, usd: 0.99 }));
    s.resources.moonstones = 10_000;
    const r = checkProvenance(s, NOW, data, [row('tx1', pack.id)] as never);
    expect(r.state.purchases).toHaveLength(1);
    expect(r.state.resources.moonstones).toBe(freeJadeAllowance(1) + pack.moonstones);
  });

  it('a bought stipend moves at the rate it was sold: never everything in one payment', () => {
    const s = played();
    const st = data.store.stipend!;
    s.purchases = [{ id: 'apple:tx2', productId: st.id, at: NOW - HOUR, usd: st.usd }];
    s.stipend = { left: 1, lastDay: -1, jade: st.payments * st.jadePerPayment };
    const out = checkProvenance(s, NOW, data, [row('tx2', st.id)] as never);
    expect(out.held).toBeNull();
    expect(out.state.stipend).toMatchObject({ left: st.payments, jade: st.payments * st.jadePerPayment });
    // And its Jade counts toward the most a village may bring.
    s.stipend = { left: 30, lastDay: -1, jade: IMPORT_MAX_JADE };
    expect(importProblem(s, NOW, data)).toMatch(/Jade/);
  });

  it('R3-04: imported defense records name no raider to settle the score with, and the log is no longer than the game keeps', () => {
    const s = played();
    const forged = (i: number) => ({ id: `d${i}`, at: NOW + 10 * 365 * 24 * HOUR, kind: 'defense', opponentName: 'x', simulated: true, raider: { seed: i, hall: 1, bias: 0 }, setup: { seed: 1, base: { hallLevel: 1, buildings: [] }, army: {} }, deployments: [], result: { stars: 3, destruction: 100, loot: {}, used: {}, ticks: 1, hash: 'x' } }) as unknown as BattleRecord;
    s.defenseLog = Array.from({ length: 40 }, (_, i) => forged(i));
    const out = checkProvenance(s, NOW, data, []).state;
    expect(out.defenseLog.length).toBeLessThanOrEqual(data.raids.maxDefenseLog);
    expect(out.defenseLog.every((r) => r.raider === undefined)).toBe(true);
    const r = applyCommand({ ...out, army: { hedgehog_roller: 5 } }, { type: 'rematchEnd', defenseId: out.defenseLog[0].id, record: { at: NOW, opponentName: 'x', setup: { seed: 1, base: { hallLevel: 1, buildings: [] }, army: { hedgehog_roller: 1 } }, deployments: [] } } as never, NOW, data);
    expect(r.ok).toBe(false);
  });

  it('R3-06: buildings under construction, obstacles and research in progress count against the Keep', () => {
    const stores = played();
    for (let i = 0; i < 40; i++) stores.buildings.push({ id: `s${i}`, type: 'acorn_silo', level: 0, x: 0, y: 0, upgrade: { startedAt: NOW - 2 * HOUR, endsAt: NOW - HOUR, toLevel: 1, cost: {} }, collector: null });
    expect(importProblem(stores, NOW, data)).toMatch(/Buildings/);
    const rocks = played();
    for (let i = 0; i < 243; i++) rocks.buildings.push({ id: `o${i}`, type: 'obstacle_rock', level: 1, x: 0, y: 0, upgrade: { startedAt: NOW - 2 * HOUR, endsAt: NOW - HOUR, toLevel: 0, cost: {} }, collector: null });
    expect(importProblem(rocks, NOW, data)).toMatch(/obstacles/);
    const sage = played();
    sage.research.active = [{ troop: 'hedgehog_roller', toLevel: 20, startedAt: NOW - 2 * HOUR, endsAt: NOW - HOUR, cost: {} }];
    expect(importProblem(sage, NOW, data)).toMatch(/Research/);
    const lanes = played();
    lanes.research.active = ['hedgehog_roller', 'frog_lobber', 'beetle_brute'].map((troop) => ({ troop, toLevel: 2, startedAt: NOW - 1000, endsAt: NOW + HOUR, cost: {} }));
    expect(importProblem(lanes, NOW, data)).toMatch(/research at once/);
    // An honest village in the middle of its work still passes.
    const honest = played();
    expect(honest.buildings.some((b) => b.upgrade) || honest.training.length > 0).toBe(true);
    expect(importProblem(honest, NOW, data)).toBeNull();
  });

  it('R3-07 / R3-08: sizes are refused before anything walks the file', () => {
    const s = played();
    const file = serialize(s, NOW) as unknown as { village: Record<string, unknown> };
    expect(importSizeProblem(file, data)).toBeNull();
    expect(importSizeProblem({ ...file, village: { ...file.village, battleLog: Array.from({ length: IMPORT_MAX_LIST + 1 }, () => ({})) } }, data)).toMatch(/list/);
    expect(importSizeProblem({ ...file, village: { ...file.village, grove: { raidHistory: Array.from({ length: 300_000 }, () => 0) } } }, data)).toMatch(/list/);
    const bed = { id: 'f', type: 'flower_bed', level: 1, x: 3, y: 3, upgrade: null, collector: null };
    expect(importSizeProblem({ ...file, village: { ...file.village, buildings: Array.from({ length: 3000 }, () => bed) } }, data)).toMatch(/buildings/);
    // The save check itself no longer compares every pair: 1,500 buildings on one tile are judged at once.
    const many = { ...s, buildings: [...s.buildings, ...Array.from({ length: 1500 }, (_, i) => ({ ...bed, id: `f${i}` }))] };
    const began = performance.now();
    const problems = validateVillage(many, data);
    expect(performance.now() - began).toBeLessThan(500);
    expect(problems.filter((p) => p.includes('overlaps')).length).toBeGreaterThan(0);
    expect(problems.length).toBeLessThan(60);
  });

  it('R3-11: unlocked Scroll tiers are marked from 1, and the file\'s task list earns nothing', () => {
    const s = played();
    s.pass.season = passSeason(NOW, data);
    s.pass.points = 17 * data.pass.pointsPerTier;
    s.tasks = { ...s.tasks, dayIds: data.pass.dailyTasks.map((t) => t.id), weekIds: data.pass.weeklyChallenges.map((t) => t.id), dayTargets: Object.fromEntries(data.pass.dailyTasks.map((t) => [t.id, 0])), weekTargets: Object.fromEntries(data.pass.weeklyChallenges.map((t) => [t.id, 0])), dayClaimed: [], weekClaimed: [] };
    const out = checkProvenance(s, NOW, data, []).state;
    for (let tier = 1; tier <= 17; tier++) expect(out.pass.claimedFree).toContain(tier);
    expect(applyCommand(out, { type: 'claimTier', tier: 17, track: 'free' }, NOW + 1000, data).ok).toBe(false);
    expect(out.tasks.dayIds).toBeUndefined();
    expect(out.tasks.dayTargets).toBeUndefined();
    for (const t of [...data.pass.dailyTasks, ...data.pass.weeklyChallenges]) {
      expect(applyCommand(out, { type: 'claimTask', id: t.id } as never, NOW + 1000, data).ok, t.id).toBe(false);
    }
  });

  it('SCR-03: a Scroll of another season is not carried, so nothing is settled without a purchase to hold it', () => {
    const s = played();
    s.pass = { season: passSeason(NOW, data) - 1, points: 9000, premium: true, claimedFree: [], claimedPremium: [] };
    const scroll = { ...row('scroll-1', data.pass.productId), at: NOW - HOUR };
    s.purchases = [{ id: 'apple:scroll-1', productId: data.pass.productId, at: NOW - HOUR, usd: 4.99 }];
    const out = checkProvenance(s, NOW, data, [scroll] as never).state;
    expect(out.pass).toMatchObject({ season: passSeason(NOW, data), points: 0, premium: true, claimedFree: [], claimedPremium: [] });
    const jade = out.resources.moonstones;
    const r = applyCommand(out, { type: 'setLocalTime', offsetMinutes: 0 } as never, NOW + 1000, data);
    if (r.ok) expect(r.state.resources.moonstones).toBe(jade);
  });

  it('R3-12: the offline Alliance stays on the device, and today\'s chest and calendar day count as taken', () => {
    const s = played();
    s.grove.joined = true;
    s.grove.raid = { week: 1 } as never;
    s.daily = { ...s.daily, lastDay: -1, step: 6 };
    s.calendar = { ...s.calendar, claimed: 27, lastDay: -1 };
    const out = checkProvenance(s, NOW, data, []).state;
    expect(out.grove.joined).toBe(false);
    expect(out.grove.raid).toBeNull();
    expect(out.daily.lastDay).toBe(dayIndex(NOW, data));
    expect(applyCommand(out, { type: 'openDailyChest', entropy: 1 } as never, NOW + 1000, data).ok).toBe(false);
    expect(applyCommand(out, { type: 'claimCalendar' } as never, NOW + 1000, data).ok).toBe(false);
  });
});
