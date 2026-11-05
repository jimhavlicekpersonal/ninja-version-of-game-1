/**
 * Ledger audit (docs/audit/STATE_OF_THE_GAME.md, section 5 step 1), server side.
 * A1: a raid cannot be played out before it counts (seed only on start) and
 * a hidden loss counts at the next match. A6: two reports on one defender,
 * or a report and a forfeit, are serialised.
 */
import { describe, expect, it } from 'vitest';
import { REPORT_GRACE_MS, SEED_AT_START_PROTOCOL, TICKET_TTL_MS } from '../../../server/core/pvp';
import { IMPORT_FREE_KEEP, importMinAccountDays, importProblem } from '../../../server/core/villageImport';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { createNewVillage, hallLevel } from '../../../src/gameplay/sim/village';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { signJws, TEST_BUNDLE, testAppleVerifier } from '../fixtures/appstore/sign';
import { baseAt, HOUR, rush, startSeed, world } from './harness';

const T = Date.UTC(2026, 3, 6, 12);
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? 'error');

describe('A1: a raid counts before its seed is known, and a hidden loss counts at the next match', () => {
  it('sends the seed only when the raid starts; an expired scout cannot start', async () => {
    const w = world({ start: T });
    const a = await w.player('Ann', baseAt(1));
    const m = (await a.match())!;
    expect(m.seed).toBeUndefined();
    w.advance(TICKET_TTL_MS + 1);
    expect(await code(a.startAttack(m.ticket))).toBe('expired');
  });

  it('refuses a match from a game older than the seed-at-start protocol', async () => {
    const w = world({ start: T });
    const a = await w.player('Ann', baseAt(1));
    const me = (await w.repo.getPlayer(a.id))!;
    await expect(w.core.match(me, { protocol: SEED_AT_START_PROTOCOL - 1 })).rejects.toMatchObject({ status: 426, code: 'version_mismatch' });
    await expect(w.core.match(me, { protocol: SEED_AT_START_PROTOCOL })).resolves.toMatchObject({ ticket: expect.any(String) });
  });

  it('a started raid with no report is a loss (honor and Attack Rating) at the next match after the grace', async () => {
    const w = world({ start: T });
    const a = await w.player('Ann', baseAt(2, 5));
    await w.player('Dot', baseAt(2, 77, 3000));
    w.pastShields();
    await w.repo.updatePlayer(a.id, { trophies: 400 });
    const m = (await a.match())!;
    expect(m.opponent.name).toBe('Dot');
    await startSeed(a, m.ticket);
    // Within the grace the raid is still being played or reported: nothing happens, Dot stays held.
    w.advance(REPORT_GRACE_MS - 60_000);
    const inGrace = (await a.match())!;
    expect(inGrace.opponent.name).not.toBe('Dot');
    expect((await a.me()).trophies).toBe(400);
    // After it: the hidden raid counts as a loss now, not 73 hours later.
    w.advance(2 * 60_000);
    await a.match();
    expect((await a.me()).trophies).toBeLessThan(400);
    const ratings = (await w.repo.getPlayer(a.id))!.ratings!;
    expect(ratings.attack.battles).toBe(1);
    expect(ratings.attack.rating).toBeLessThan(data.ranks.rating.initial);
    // Its report is refused for good and pays nothing.
    expect(await code(a.submitAttack({ ticket: m.ticket, seed: 1, ...rush(20) }))).toBe('expired');
  });

  it('a report that arrives within the grace settles normally', async () => {
    const w = world({ start: T });
    const a = await w.player('Ann', baseAt(1));
    await w.player('Dot', baseAt(1, 77, 3000));
    w.pastShields();
    const m = (await a.match())!;
    const seed = await startSeed(a, m.ticket);
    w.advance(3 * 60_000);
    const r = await a.submitAttack({ ticket: m.ticket, seed, ...rush(20) });
    w.advance(REPORT_GRACE_MS);
    const before = (await a.me()).trophies;
    expect(before).toBe(r.playerTrophies);
    await a.match();
    expect((await a.me()).trophies).toBe(before);
  });
});

describe('A6: reports on one defender are settled one at a time', () => {
  it('two raids reported at the same moment against one defender pay once; the other is practice', async () => {
    const w = world({ start: T });
    const a = await w.player('Ann');
    const b = await w.player('Ben');
    const d = await w.player('Dot', baseAt(1, 77, 3000));
    w.pastShields();
    const ma = (await a.match())!;
    expect(ma.opponent.name).toBe('Dot');
    const sa = await startSeed(a, ma.ticket);
    // Ann's 5-minute lock on Dot ends; Ben gets Dot too (Ann's raid is still in the air).
    w.advance(6 * 60_000);
    const mb = (await b.match())!;
    expect(mb.opponent.name).toBe('Dot');
    const sb = await startSeed(b, mb.ticket);
    const big = rush(20);
    const results = await Promise.allSettled([a.submitAttack({ ticket: ma.ticket, seed: sa, ...big }), b.submitAttack({ ticket: mb.ticket, seed: sb, ...big })]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    // Both destroyed enough to shield Dot, so only the first may pay.
    expect(ok).toHaveLength(1);
    expect(refused.map((r) => (r.reason as { code: string }).code)).toEqual(['defender_protected']);
    expect((await d.defenses(0)).defenses).toHaveLength(1);
  });

  it('honor written by a report is computed from the honor the forfeit left, never a stale read', async () => {
    const w = world({ start: T });
    const a = await w.player('Ann', baseAt(1));
    w.pastShields();
    await w.repo.updatePlayer(a.id, { trophies: 300 });
    const m1 = (await a.match())!;
    await startSeed(a, m1.ticket);
    w.advance(REPORT_GRACE_MS + 1);
    // The second match forfeits the first raid; then the second is reported.
    const m2 = (await a.match())!;
    const lost = 300 - (await a.me()).trophies;
    expect(lost).toBeGreaterThan(0);
    const r = await a.submitAttack({ ticket: m2.ticket, seed: await startSeed(a, m2.ticket), ...rush(20) });
    expect((await a.me()).trophies).toBe(Math.max(0, 300 - lost + r.trophies));
    expect(HOUR).toBeGreaterThan(0);
  });
});

describe('A4: the under-18 cap holds at redeem, not only at the intent', () => {
  const receipt = (productId: string, id: string, token: string | null, at = T) =>
    signJws({ transactionId: id, originalTransactionId: id, bundleId: TEST_BUNDLE, productId, purchaseDate: at, environment: 'Production', type: 'Consumable', ...(token ? { appAccountToken: token } : {}) });
  const setup = async () => {
    const w = world({ start: T, shared: { payments: { apple: testAppleVerifier() } } });
    const kid = await w.player('Kid');
    await w.repo.setAgeGroup(kid.id, true, w.now());
    return { w, kid };
  };

  it('credits a receipt without an intent only while the month leaves room; the rest waits for next month', async () => {
    const { w, kid } = await setup();
    // $49.99 with no intent (a modified game skips POST /v1/purchases/intent): within the $50 cap, credited.
    await kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: receipt('jade_vault', 'k1', null) });
    // A second one would make $99.98: nothing is credited and the store transaction stays unfinished.
    const second = receipt('jade_vault', 'k2', null);
    await expect(kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: second })).rejects.toMatchObject({ code: 'purchase_refused', message: expect.stringMatching(/monthly limit/) });
    expect((await kid.purchaseHistory()).purchases.map((p) => p.transactionId)).toEqual(['apple:k1']);
    // Next month the game offers it again (it was never finished) and it fits.
    w.setTime(Date.UTC(2026, 4, 1, 12));
    await kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: second });
    expect((await kid.purchaseHistory()).purchases).toHaveLength(2);
  });

  it('a token already used by one purchase reserves nothing for a second', async () => {
    const { kid } = await setup();
    const intent = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: true });
    await kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: receipt('jade_vault', 'r1', intent.accountToken) });
    await expect(kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: receipt('jade_vault', 'r2', intent.accountToken) })).rejects.toMatchObject({ code: 'purchase_refused' });
    expect((await kid.purchaseHistory()).purchases).toHaveLength(1);
  });

  it('adults and receipts with their own open intent are credited as before', async () => {
    const w = world({ start: T, shared: { payments: { apple: testAppleVerifier() } } });
    const adult = await w.player('Adult');
    await w.repo.setAgeGroup(adult.id, false, w.now());
    await adult.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: receipt('jade_vault', 'a1', null) });
    await adult.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: receipt('jade_vault', 'a2', null) });
    expect((await adult.purchaseHistory()).purchases).toHaveLength(2);
    const { kid } = await setup();
    const intent = await kid.purchaseIntent({ store: 'apple', productId: 'moonstones_5', under18: true });
    await kid.redeem({ store: 'apple', storeProductId: 'jade_vault', receipt: receipt('jade_vault', 'o1', intent.accountToken) });
    expect((await kid.purchaseHistory()).purchases).toHaveLength(1);
  });
});

describe('A2 / E11: a forged high-Keep village cannot arrive on a brand-new account', () => {
  /** A legal village at this Keep (the Keep alone upgraded; fewer buildings than allowed is fine). */
  const villageAt = (keep: number) => {
    const v = createNewVillage(T, data);
    v.buildings.find((b) => data.buildings[b.type].category === 'hall')!.level = keep;
    expect(hallLevel(v, data)).toBe(keep);
    expect(importProblem(v, T, data)).toBeNull();
    return v;
  };

  it('moves a village up to Keep 5 at once; above it, once the account is old enough', async () => {
    const w = world({ start: T });
    const low = await w.player('Low');
    await low.importVillage(serialize(villageAt(IMPORT_FREE_KEEP), w.now()));
    const forger = await w.player('Forger');
    const k15 = serialize(villageAt(15), w.now());
    await expect(forger.importVillage(k15)).rejects.toMatchObject({ code: 'cooldown', message: expect.stringMatching(/Keep 15 can move to the server once this online account is 61 days old/) });
    // Nothing moved: the account has no server village, and can still try later.
    expect(await w.repo.getVillage(forger.id)).toBeNull();
    w.advance(importMinAccountDays(15) * 24 * HOUR + 1);
    await expect(forger.importVillage(k15)).resolves.toMatchObject({ file: expect.anything() });
  });

  it('asks less of lower Keeps, following the regular model player', () => {
    expect(importMinAccountDays(5)).toBe(0);
    expect(importMinAccountDays(6)).toBeCloseTo(5.2);
    for (let k = 7; k <= 15; k++) expect(importMinAccountDays(k)).toBeGreaterThan(importMinAccountDays(k - 1));
  });
});

describe('A1 / E15: a server-held village rerolls opponents only by paying for Next', () => {
  it('the same scout gets the same opponent back; a paid Next gets a new one', async () => {
    const w = world({ start: T });
    const a = await w.player('Ann');
    await a.startVillage();
    await w.player('Dot', baseAt(1, 77, 3000));
    await w.player('Eve', baseAt(1, 78, 3000));
    w.pastShields();
    let seq = 0;
    const send = (command: { type: 'scout'; paid: boolean }) => a.sendCommands({ stateHash: '', commands: [{ seq: ++seq, t: w.now(), command }] });
    const coins = async () => deserialize((await a.getVillage())!.file, data).resources.acorns;
    // No scout in the village yet: no opponent.
    await expect(a.match()).rejects.toMatchObject({ code: 'conflict' });
    await send({ type: 'scout', paid: false });
    const first = (await a.match())!;
    // Asking again without a new scout (a modified game rerolling for free) returns the same raid.
    expect((await a.match())!.ticket).toBe(first.ticket);
    expect((await a.match())!.ticket).toBe(first.ticket);
    // Next: the village pays the fee (replayed from the game's command), and only then a new raid.
    const before = await coins();
    await send({ type: 'scout', paid: true });
    expect(await coins()).toBe(before - data.battle.scoutFeeByHall[0]);
    const next = (await a.match())!;
    expect(next.ticket).not.toBe(first.ticket);
    await expect(a.startAttack(first.ticket)).rejects.toMatchObject({ code: 'conflict' });
  });
});
