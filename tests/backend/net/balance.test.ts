/**
 * Balance bundles (roadmap step 76): signed, numbers-only, never combat,
 * checked by the game and the server, applied only at the next start.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { liveEngine, RulesRegistry } from '../../../server/rules/registry';
import { BalanceLoader } from '../../../src/backend/net/balance';
import { armOf, bundleMessage, checkCohort, patchedData, pickCohort, verifyBundle, type BalanceBundle, type BalanceChange, type BalanceCohort } from '../../../src/backend/net/balanceBundle';
import { cohortBucket } from '../../../src/backend/net/stats';
import type { KeyValue } from '../../../src/backend/net/connection';
import { dataVersionOf } from '../../../src/backend/net/dataVersion';
import { Routes } from '../../../src/backend/net/protocol';
import { SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { defaultData } from '../../../src/gameplay/sim/data';
import type { GameData } from '../../../src/gameplay/sim/types';

const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PUBLIC = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

function make(changes: BalanceChange[], opts: { id?: string; key?: typeof keys.privateKey; base?: object; rules?: number; cohort?: BalanceCohort } = {}): BalanceBundle {
  const base = opts.base ?? defaultData;
  const patched = structuredClone(base) as Record<string, unknown>;
  for (const c of changes) {
    let node = patched as Record<string | number, unknown>;
    for (const k of c.path.slice(0, -1)) node = node[k] as Record<string | number, unknown>;
    node[c.path[c.path.length - 1]] = c.value;
  }
  const draft = { format: 1 as const, id: opts.id ?? 'test', rules: opts.rules ?? SIM_RULES, base: dataVersionOf(base), changes, dataVersion: dataVersionOf(patched), ...(opts.cohort ? { cohort: opts.cohort } : {}) };
  return { ...draft, signature: sign('sha256', Buffer.from(bundleMessage(draft)), { key: opts.key ?? keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64') };
}

const memoryKv = (): KeyValue & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
};

const start = { path: ['ranks', 'startingTrophies'], value: defaultData.ranks.startingTrophies + 7 };

describe('balance bundles: the checks', () => {
  it('accepts signed changes to existing non-combat numbers', async () => {
    const b = make([start]);
    expect(await verifyBundle(b, PUBLIC)).toBe(true);
    const p = patchedData(defaultData, b, SIM_RULES);
    expect('data' in p && (p.data as GameData).ranks.startingTrophies).toBe(start.value);
    // The built-in data is never touched.
    expect(defaultData.ranks.startingTrophies).toBe(start.value - 7);
  });

  it('refuses a bad signature, combat numbers, text, new keys, other rules or another base', async () => {
    expect(await verifyBundle(make([start], { key: other.privateKey }), PUBLIC)).toBe(false);
    expect(await verifyBundle({ ...make([start]), id: 'tampered' }, PUBLIC)).toBe(false);
    const cannon = Object.keys(defaultData.buildings).find((k) => defaultData.buildings[k].category === 'defense')!;
    const combat = patchedData(defaultData, make([{ path: ['buildings', cannon, 'levels', 0, 'damage'], value: 1 }]), SIM_RULES);
    expect('error' in combat && combat.error).toMatch(/combat/);
    const text = make([start]);
    text.changes = [{ path: ['buildings', cannon, 'name'], value: 3 }];
    expect('error' in patchedData(defaultData, text, SIM_RULES)).toBe(true);
    const added = make([start]);
    added.changes = [{ path: ['ranks', 'brandNew'], value: 3 }];
    expect('error' in patchedData(defaultData, added, SIM_RULES)).toBe(true);
    expect('error' in patchedData(defaultData, make([start], { rules: SIM_RULES + 1 }), SIM_RULES)).toBe(true);
    const otherBase = structuredClone(defaultData) as GameData;
    (otherBase.ranks as { startingTrophies: number }).startingTrophies += 1;
    expect('error' in patchedData(defaultData, make([start], { base: otherBase }), SIM_RULES)).toBe(true);
  });
});

describe('balance bundles: the game', () => {
  it('keeps an offered bundle for the next start, applies it then, and clears it when the server drops it', async () => {
    const kv = memoryKv();
    const data = structuredClone(defaultData) as GameData;
    const builtInVersion = dataVersionOf(data);
    const session1 = new BalanceLoader(kv, data, SIM_RULES, PUBLIC);
    expect(await session1.applyCached()).toBeNull();
    const b = make([start], { id: 'cheap-start' });
    expect(await session1.offer(b)).toBe('next-start');
    // Nothing changes mid-session.
    expect(data.ranks.startingTrophies).toBe(defaultData.ranks.startingTrophies);
    expect(session1.dataVersion()).toBe(builtInVersion);

    const data2 = structuredClone(defaultData) as GameData;
    const session2 = new BalanceLoader(kv, data2, SIM_RULES, PUBLIC);
    expect((await session2.applyCached())?.id).toBe('cheap-start');
    expect(data2.ranks.startingTrophies).toBe(start.value);
    expect(session2.dataVersion()).toBe(b.dataVersion);
    expect(await session2.offer(b)).toBe('same');
    expect(await session2.offer(null)).toBe('cleared');
    expect(kv.map.size).toBe(0);
  });

  it('ignores a forged or broken bundle, and every bundle without the public key', async () => {
    const kv = memoryKv();
    const data = structuredClone(defaultData) as GameData;
    expect(await new BalanceLoader(kv, data, SIM_RULES, PUBLIC).offer(make([start], { key: other.privateKey }))).toBe('refused');
    kv.set('tk.balance.bundle', JSON.stringify({ ...make([start]), signature: 'AAAA' }));
    expect(await new BalanceLoader(kv, data, SIM_RULES, PUBLIC).applyCached()).toBeNull();
    expect(kv.map.size).toBe(0);
    kv.set('tk.balance.bundle', JSON.stringify(make([start])));
    expect(await new BalanceLoader(kv, data, SIM_RULES, '').applyCached()).toBeNull();
    expect(data.ranks.startingTrophies).toBe(defaultData.ranks.startingTrophies);
  });
});

describe('balance bundles: the server', () => {
  it('serves the bundle, plays with its numbers, and lists the feature', async () => {
    const b = make([start]);
    const p = patchedData(defaultData, b, SIM_RULES);
    if ('error' in p) throw new Error(p.error);
    const app = buildServer({ repo: new MemoryRepo(), data: p.data, shared: { balance: b, rules: new RulesRegistry(liveEngine(p.data)) } });
    const hello = (await app.inject({ method: 'GET', url: Routes.hello })).json();
    expect(hello.features).toContain('balance-bundles');
    expect(hello.dataVersion).toBe(b.dataVersion);
    expect((await app.inject({ method: 'GET', url: Routes.balance })).json()).toEqual({ bundle: b });
    const reg = (await app.inject({ method: 'POST', url: Routes.players, payload: { name: 'Bundled' } })).json();
    const me = (await app.inject({ method: 'GET', url: Routes.me, headers: { authorization: `Bearer ${reg.token}` } })).json();
    expect(me.trophies).toBe(start.value);
    const plain = buildServer({ repo: new MemoryRepo(), data: defaultData });
    expect((await plain.inject({ method: 'GET', url: Routes.balance })).json()).toEqual({ bundle: null });
    expect((await plain.inject({ method: 'GET', url: Routes.hello })).json().features).not.toContain('balance-bundles');
  });
});

describe('balance bundles: experiment arms (report section 5 step 5)', () => {
  const shortOffer = { path: ['offers', 'rules', 0, 'durationHours'], value: 48 };
  const cohort = (from: number, to: number, arm = 'short'): BalanceCohort => ({ experiment: 'offer-timing-1', arm, from, to });
  // A statistics id in the lower half of the experiment's buckets, and one in the upper half.
  const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const inArm = ids.find((id) => cohortBucket('offer-timing-1', id) < 50)!;
  const outArm = ids.find((id) => cohortBucket('offer-timing-1', id) >= 50)!;

  it('lets an arm change only offer timing, on top of the main bundle\'s exact changes', () => {
    const main = make([start], { id: 'main' });
    expect(checkCohort(make([start, shortOffer], { id: 'arm', cohort: cohort(0, 50) }), main)).toBeNull();
    expect(checkCohort(make([shortOffer], { id: 'arm', cohort: cohort(0, 50) }), null)).toBeNull();
    // Anything the server replays (costs, timers, loot, honor) must be the same for everyone.
    expect(checkCohort(make([start, shortOffer], { cohort: cohort(0, 50) }), null)).toMatch(/only offer timing/);
    expect(checkCohort(make([shortOffer], { cohort: cohort(0, 50) }), main)).toMatch(/leaves out/);
    expect(checkCohort(make([start]), null)).toMatch(/not an experiment arm/);
    // Prices and contents are not timing.
    expect(checkCohort(make([{ path: ['offers', 'rules', 0, 'usd'], value: 0.99 }], { cohort: cohort(0, 50) }), null)).toMatch(/only offer timing/);
    expect('error' in patchedData(defaultData, make([shortOffer], { cohort: cohort(60, 40) }), SIM_RULES)).toBe(true);
    expect(armOf(make([shortOffer], { cohort: cohort(0, 50) }))).toBe('offer-timing-1:short');
  });

  it('a game in the arm keeps the arm for its next start; one outside, or without an id, keeps the main bundle', async () => {
    const main = make([start], { id: 'main' });
    const arm = make([start, shortOffer], { id: 'arm', cohort: cohort(0, 50) });
    expect(pickCohort([arm], inArm)?.id).toBe('arm');
    expect(pickCohort([arm], outArm)).toBeNull();
    expect(pickCohort([arm], null)).toBeNull();
    for (const [id, want] of [[inArm, 'arm'], [outArm, 'main'], [null, 'main']] as const) {
      const kv = memoryKv();
      const loader = new BalanceLoader(kv, structuredClone(defaultData), SIM_RULES, PUBLIC, () => id);
      expect(await loader.offer(main, [arm])).toBe('next-start');
      const data = structuredClone(defaultData) as GameData;
      const next = new BalanceLoader(kv, data, SIM_RULES, PUBLIC, () => id);
      expect((await next.applyCached())?.id).toBe(want);
      expect(data.offers.rules[0].durationHours).toBe(want === 'arm' ? 48 : defaultData.offers.rules[0].durationHours);
      expect(data.ranks.startingTrophies).toBe(start.value);
    }
    // An arm that changes more than timing is refused by the game too: it plays the main bundle.
    const greedy = make([start, shortOffer, { path: ['battle', 'scoutFeeByHall', 1], value: 1 }], { id: 'greedy', cohort: cohort(0, 100) });
    const kv = memoryKv();
    await new BalanceLoader(kv, structuredClone(defaultData), SIM_RULES, PUBLIC, () => inArm).offer(main, [greedy]);
    expect((await new BalanceLoader(kv, structuredClone(defaultData), SIM_RULES, PUBLIC, () => inArm).applyCached())?.id).toBe('main');
    // A kept arm is dropped at start once the device has no statistics id (sharing switched off).
    const kept = memoryKv();
    await new BalanceLoader(kept, structuredClone(defaultData), SIM_RULES, PUBLIC, () => inArm).offer(main, [arm]);
    expect(await new BalanceLoader(kept, structuredClone(defaultData), SIM_RULES, PUBLIC, () => null).applyCached()).toBeNull();
  });

  it('the server serves the arms beside the main bundle', async () => {
    const main = make([start], { id: 'main' });
    const arm = make([start, shortOffer], { id: 'arm', cohort: cohort(0, 50) });
    const p = patchedData(defaultData, main, SIM_RULES);
    if ('error' in p) throw new Error(p.error);
    const app = buildServer({ repo: new MemoryRepo(), data: p.data, shared: { balance: main, balanceCohorts: [arm], rules: new RulesRegistry(liveEngine(p.data)) } });
    expect((await app.inject({ method: 'GET', url: Routes.balance })).json()).toEqual({ bundle: main, cohorts: [arm] });
  });
});
