/**
 * Re-audit (2026-11-05) economy and battle-integrity fixes, server side:
 * refunds before redeem, held tickets and shields, unreported battles,
 * war attacks counted at issue, re-simulation abuse, abandoned battles,
 * import dating and claims, Sandbox purchases on production, refund abuse.
 */
import { describe, expect, it } from 'vitest';
import { forfeitExpired, LATE_REPORT_MS, MAX_TICKET_FAILURES, TICKET_TTL_MS } from '../../../server/core/pvp';
import { checkProvenance } from '../../../server/core/villageImport';
import { InlineResimulator } from '../../../server/resim/resim';
import { maxHousingAtHall } from '../../../src/gameplay/sim/army';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { applyCommand, createNewVillage, hallLevel } from '../../../src/gameplay/sim/village';
import { achievementValue } from '../../../src/gameplay/sim/achievements';
import { signJws, TEST_BUNDLE, testAppleVerifier } from '../fixtures/appstore/sign';
import { baseAt, HOUR, world, startSeed } from './harness';

const T = Date.UTC(2026, 3, 6, 12);
const appleTxn = (productId: string, id: string, token: string | null, extra: Record<string, unknown> = {}) =>
  signJws({ transactionId: id, originalTransactionId: id, bundleId: TEST_BUNDLE, productId, purchaseDate: T, environment: 'Production', type: 'Consumable', ...(token ? { appAccountToken: token } : {}), ...extra });
const notify = (type: string, inner: string) => ({ signedPayload: signJws({ notificationType: type, notificationUUID: `${type}-${inner.length}`, data: { bundleId: TEST_BUNDLE, environment: 'Production', signedTransactionInfo: inner } }) });

/** The strongest single-point rush for a known base and seed (what a modified client can search offline). */
function best(m: { seed: number; base: Parameters<typeof runBattle>[0]['base'] }, n: number) {
  let top: { stars: number; army: Record<string, number>; deployments: { tick: number; troop: string; x: number; y: number }[] } | null = null;
  for (let x = 0; x < 44; x += 4) for (let y = 0; y < 44; y += 4) {
    const army = { hedgehog_roller: n };
    const deployments = Array.from({ length: n }, (_, i) => ({ tick: i * 2, troop: 'hedgehog_roller', x, y }));
    const r = runBattle({ seed: m.seed, base: m.base, army, infiltration: true }, deployments, data).result;
    if (!top || r.stars > top.stars) top = { stars: r.stars, army, deployments };
  }
  return top!;
}

describe('refunds (re-audit)', () => {
  it('refuses a receipt the store refunded before it was redeemed', async () => {
    const w = world({ start: T, shared: { payments: { apple: testAppleVerifier() } } });
    const ann = await w.player('Ann');
    const intent = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false });
    const kept = appleTxn('jade_bag', '777', intent.accountToken);
    await w.core.appleNotification(notify('REFUND', appleTxn('jade_bag', '777', intent.accountToken, { revocationDate: w.now() })));
    await expect(ann.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: kept })).rejects.toMatchObject({ code: 'bad_request', message: expect.stringMatching(/refunded/) });
    expect((await ann.purchaseHistory()).purchases).toEqual([]);
  });

  it('turns spent refunded Jade into a debt, gives it back if the refund is reversed, and pauses repeat refunders', async () => {
    const w = world({ start: T, shared: { payments: { apple: testAppleVerifier() } } });
    const ann = await w.player('Ann');
    await ann.startVillage();
    await ann.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'setProfile', under18: false } }] });
    const jade = async () => deserialize((await ann.getVillage())!.file, data).resources.moonstones;
    const start = await jade();
    for (let i = 0; i < 3; i++) {
      const intent = await ann.purchaseIntent({ store: 'apple', productId: 'moonstones_2', under18: false });
      const id = String(900 + i);
      await ann.redeem({ store: 'apple', storeProductId: 'jade_bag', receipt: appleTxn('jade_bag', id, intent.accountToken) });
      // Spend everything before refunding the first one.
      if (i === 0) {
        const v = deserialize((await ann.getVillage())!.file, data);
        v.resources.moonstones = 0;
        await w.repo.saveVillage({ ...(await w.repo.getVillage(ann.id))!, file: serialize(v, w.now()), revision: (await w.repo.getVillage(ann.id))!.revision + 1 }, (await w.repo.getVillage(ann.id))!.revision, [], []);
      }
      await w.core.appleNotification(notify('REFUND', appleTxn('jade_bag', id, null, { revocationDate: w.now() })));
      if (i === 0) {
        expect(await jade()).toBe(-280);
        await w.core.appleNotification(notify('REFUND_REVERSED', appleTxn('jade_bag', id, null)));
        expect(await jade()).toBe(0);
        await w.core.appleNotification(notify('REFUND', appleTxn('jade_bag', id, null, { revocationDate: w.now() + 1 })));
      }
    }
    expect(start).toBeGreaterThanOrEqual(0);
    await expect(ann.purchaseIntent({ store: 'apple', productId: 'moonstones_1', under18: false })).rejects.toMatchObject({ code: 'purchase_refused', message: expect.stringMatching(/paused/) });
  });

  it('caps Sandbox purchases on production', async () => {
    const w = world({ start: T, shared: { payments: { apple: testAppleVerifier(), testCreditCapUsd: 10 } } });
    const t = await w.player('Tester');
    const buy = async (id: string, product = 'moonstones_2', store = 'jade_bag') => {
      const intent = await t.purchaseIntent({ store: 'apple', productId: product, under18: false });
      return t.redeem({ store: 'apple', storeProductId: store, receipt: appleTxn(store, id, intent.accountToken, { environment: 'Sandbox' }) });
    };
    await buy('s1');
    await buy('s2'); // $9.98 in all
    await expect(buy('s3')).rejects.toMatchObject({ code: 'purchase_refused', message: expect.stringMatching(/Test purchases/) });
  });
});

describe('held tickets, shields and unreported battles (re-audit)', () => {
  it('a new match voids the unstarted ticket; a raid after someone else shielded the defender counts as practice', async () => {
    const w = world({ start: T });
    // Only Dot has a base, so every match finds Dot (the reviewer's held-ticket reproduction).
    const a = await w.player('Ann');
    const b = await w.player('Ben');
    const d = await w.player('Dot', baseAt(1, 77, 3000));
    w.pastShields();
    const n = Math.floor(maxHousingAtHall(1, data) / data.troops.hedgehog_roller.housing);
    const first = (await a.match())!;
    w.advance(6 * 60_000);
    const held = (await a.match())!;
    expect(held.opponent.name).toBe('Dot');
    // The voided ticket can neither start nor be reported.
    await expect(a.startAttack(first.ticket)).rejects.toMatchObject({ code: 'conflict' });
    await expect(a.submitAttack({ ticket: first.ticket, seed: 1, army: {}, deployments: [] })).rejects.toMatchObject({ code: 'conflict' });
    const heldSeed = await startSeed(a, held.ticket);
    // Ben raids Dot once Ann's 5-minute lock is over, and shields it.
    w.advance(6 * 60_000);
    const mb = (await b.match())!;
    expect(mb.opponent.name).toBe('Dot');
    const bSeed = await startSeed(b, mb.ticket);
    const shot = best({ seed: bSeed, base: mb.base }, n);
    await b.submitAttack({ ticket: mb.ticket, seed: bSeed, army: shot.army, deployments: shot.deployments });
    expect((await d.me()).shieldUntil).toBeGreaterThan(w.now());
    // Ann's held ticket, reported a day later, pays nothing (it paid the same loot again before the fix).
    w.advance(24 * HOUR);
    const r = best({ seed: heldSeed, base: held.base }, n);
    await expect(a.submitAttack({ ticket: held.ticket, seed: heldSeed, army: r.army, deployments: r.deployments })).rejects.toMatchObject({ code: 'defender_protected' });
    expect((await d.defenses(0)).defenses).toHaveLength(1);
  });

  it('a started raid that is never reported settles as a loss; one never started just lapses', async () => {
    const w = world({ start: T });
    const a = await w.player('Ann', baseAt(2, 5));
    await w.player('Dot', baseAt(1, 77, 3000));
    await w.player('Eve', baseAt(1, 78, 3000));
    w.pastShields();
    await w.repo.updatePlayer(a.id, { trophies: 400 });
    const m = (await a.match())!;
    expect(await a.startAttack(m.ticket)).toEqual({ started: true, seed: expect.any(Number) });
    await expect(a.voidAttack(m.ticket)).rejects.toMatchObject({ code: 'conflict' });
    w.advance(TICKET_TTL_MS + LATE_REPORT_MS + 1);
    expect(await forfeitExpired(w.core.ctx)).toBe(1);
    expect((await a.me()).trophies).toBeLessThan(400);
    const honor = (await a.me()).trophies;
    // Looked, never started: no penalty.
    (await a.match())!;
    w.advance(TICKET_TTL_MS + LATE_REPORT_MS + 1);
    expect(await forfeitExpired(w.core.ctx)).toBe(0);
    expect((await a.me()).trophies).toBe(honor);
  });

  it('burns a ticket after repeated refused reports and checks server-held troops before re-simulating', async () => {
    let runs = 0;
    const inner = new InlineResimulator();
    const counting = { run: async (...args: Parameters<InlineResimulator['run']>) => { runs++; return inner.run(...args); } };
    const w = world({ start: T, shared: { resim: counting as never } });
    const a = await w.player('Ann');
    await a.startVillage(); // a server-held village with no warriors
    await w.player('Dot', baseAt(1, 77, 3000));
    w.pastShields();
    await a.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'scout', paid: false } }] });
    const m = (await a.match())!;
    const sa = await startSeed(a, m.ticket);
    for (let i = 0; i < 10; i++) await a.submitAttack({ ticket: m.ticket, seed: sa, army: { hedgehog_roller: 20 }, deployments: [] }).catch(() => undefined);
    expect(runs).toBe(0);
    // A device village with a report the server refuses after re-simulating: at most MAX_TICKET_FAILURES runs.
    const b = await w.player('Ben', baseAt(2, 9));
    const mb = (await b.match())!;
    const sb = await startSeed(b, mb.ticket);
    for (let i = 0; i < 10; i++) await b.submitAttack({ ticket: mb.ticket, seed: sb, army: { hedgehog_roller: 1 }, deployments: [], clientHash: 'x', endTick: -5 } as never).catch(() => undefined);
    expect(runs).toBeLessThanOrEqual(MAX_TICKET_FAILURES + 1);
  });
});

describe('abandoned battles and imports (re-audit)', () => {
  it('spends the deployed warriors of an abandoned battle without simulating a forged base', () => {
    let s = createNewVillage(T, data);
    s.army = { hedgehog_roller: 10 };
    const k15 = baseAt(15);
    const giant = { ...k15, buildings: Array.from({ length: 2500 }, (_, i) => ({ ...k15.buildings[0], id: `x${i}` })) };
    const started = performance.now();
    const r = applyCommand(s, { type: 'abandonBattle', record: { at: T, opponentName: 'x', setup: { seed: 1, base: giant as never, army: { hedgehog_roller: 10 }, infiltration: true }, deployments: [0, 1, 2].map((i) => ({ tick: i, troop: 'hedgehog_roller', x: 0, y: 0 })) } }, T, data);
    expect(performance.now() - started).toBeLessThan(200);
    expect(r.ok).toBe(true);
    if (r.ok) s = r.state;
    expect(s.army.hedgehog_roller).toBe(7);
  });

  it('dates an import by the server clock and pays nothing more for forged counters or an unpaid pass look', async () => {
    const w = world({ start: T });
    const p = await w.player('Old');
    const v = createNewVillage(T - 365 * 24 * HOUR, data);
    v.lastSeenAt = T - 365 * 24 * HOUR;
    const imported = await p.importVillage(serialize(v, v.lastSeenAt));
    expect(imported.at).toBe(w.now());
    const forged = createNewVillage(T, data);
    forged.stats = Object.fromEntries(Object.keys(forged.stats).map((k) => [k, 1e9])) as typeof forged.stats;
    forged.achievements = {};
    forged.pass.points = 1e7;
    const look = data.cosmetics.hallSkins.find((k) => k.passOnly)!;
    forged.cosmetics = { owned: ['classic', look.id], hallSkin: look.id };
    const out = checkProvenance(forged, T, data, []).state;
    for (const def of data.achievements) {
      const value = achievementValue(out, def, hallLevel(out, data));
      expect(out.achievements[def.id]).toBe(def.tiers.filter((t) => value >= t[0]).length);
    }
    expect(out.cosmetics.owned).not.toContain(look.id);
    expect(out.cosmetics.hallSkin).toBe('classic');
    expect(out.pass.claimedFree.length).toBe(data.pass.tiers.length);
  });
});
