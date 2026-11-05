/** Moving a device village to the server with sanity limits for its Keep (roadmap step 25). */
import { describe, expect, it } from 'vitest';
import { checkProvenance, freeJadeAllowance, importProblem, IMPORT_MAX_JADE } from '../../../server/core/villageImport';
import { signJws, TEST_BUNDLE, testAppleVerifier } from '../fixtures/appstore/sign';
import { storeProductId } from '../../../src/gameplay/sim/monetization';
import { ServerError } from '../../../src/backend/net/ports';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { economyHash } from '../../../src/gameplay/sim/serverEconomy';
import { capacity } from '../../../src/gameplay/sim/resources';
import { createNewVillage } from '../../../src/gameplay/sim/village';
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
    expect(importProblem(rich, now, data)).toMatch(/More acorns than the storages hold/);
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
    expect(importProblem(crowd, now, data)).toMatch(/Buildings: too many army_camp/);
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
});
