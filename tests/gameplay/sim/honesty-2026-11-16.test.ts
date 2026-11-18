/**
 * Phase 1 honesty defects of the 2026-11-16 pass (docs/audit/understand-2026-11-16/retention.md, economy.md):
 * each as a test that failed on the code it describes.
 */
import { describe, expect, it } from 'vitest';
import { passPremiumValue, passSeason, passSeasonEndsAt, unlockedTier } from '../../../src/gameplay/sim/pass';
import { advance, applyCommand, passTierReward } from '../../../src/gameplay/sim/village';
import { migrate, SAVE_VERSION, serialize, deserialize } from '../../../src/gameplay/sim/save';
import { data, newGame } from './helpers';

describe('RET-03 / ECO-02 (P1-01): a season that ends grants its unclaimed tiers', () => {
  function premiumVillage() {
    const { state, clock } = newGame({ acorns: 0, dew: 0, moonstones: 0 });
    state.pass.points = 20 * data.pass.pointsPerTier;
    state.pass.premium = true;
    const at = clock.now();
    state.purchases.push({ id: 'test:pass1', productId: data.pass.productId, usd: 4.99, at });
    return { state, at };
  }

  it('pays every unlocked tier, free and premium, and records it for the welcome back', () => {
    const { state, at } = premiumVillage();
    expect(unlockedTier(state, data)).toBe(20);
    const end = passSeasonEndsAt(at, data);
    const after = advance(state, end + 1000, data).state;
    expect(after.pass.season).toBe(passSeason(end + 1000, data));
    const last = after.pass.lastSeason!;
    expect(last.season).toBe(state.pass.season);
    const jade = (last.granted.moonstones ?? 0);
    expect(jade).toBeGreaterThan(0);
    expect(after.resources.moonstones).toBe(jade);
    // Premium grants are kept on the purchase, so a refund takes them back.
    expect(after.purchases[0].premium?.granted.moonstones ?? 0).toBeGreaterThan(0);
    // Whatever did not fit is reported, never dropped silently.
    const total = (k: 'acorns' | 'dew') => (last.granted[k] ?? 0) + (last.overflow[k] ?? 0);
    expect(total('acorns')).toBeGreaterThan(last.granted.acorns ?? 0);
  });

  it('never pays a tier twice, and pays nothing when every tier was claimed', () => {
    const { state, at } = premiumVillage();
    for (let t = 1; t <= 20; t++) {
      const f = applyCommand(state, { type: 'claimTier', tier: t, track: 'free' }, at, data);
      if (f.ok) Object.assign(state, f.state);
      const p = applyCommand(state, { type: 'claimTier', tier: t, track: 'premium' }, at, data);
      if (p.ok) Object.assign(state, p.state);
    }
    const jadeBefore = state.resources.moonstones;
    const after = advance(state, passSeasonEndsAt(at, data) + 1000, data).state;
    expect(after.pass.lastSeason).toBeUndefined();
    expect(after.resources.moonstones).toBe(jadeBefore);
  });

  it('a refund after the rollover takes the auto-claimed premium rewards back', () => {
    const { state, at } = premiumVillage();
    const after = advance(state, passSeasonEndsAt(at, data) + 1000, data).state;
    const r = applyCommand(after, { type: 'revokePurchase', transactionId: 'test:pass1' }, passSeasonEndsAt(at, data) + 2000, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const freeJade = (after.pass.lastSeason!.granted.moonstones ?? 0) - (after.purchases[0].premium?.granted.moonstones ?? 0);
    expect(r.state.resources.moonstones).toBe(freeJade);
  });
});

describe('save v24: the pass bump', () => {
  it('migrates a v23 village: timed upgrades start at the upgrades done, task baselines follow', () => {
    const { state, clock } = newGame();
    state.stats.upgradesDone = 7;
    const file = serialize(state, clock.now()) as unknown as { version: number; village: Record<string, unknown> };
    file.version = 23;
    const stats = file.village.stats as Record<string, number>;
    delete stats.timedUpgradesDone;
    const tasks = file.village.tasks as { dayBaseline: Record<string, number> };
    delete tasks.dayBaseline.timedUpgradesDone;
    const out = migrate(file, data);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(24);
    expect(out.village.stats.timedUpgradesDone).toBe(7);
    expect(out.village.tasks.dayBaseline.timedUpgradesDone).toBe(7);
  });

  it('a v24 file written without a later counter still loads with it filled', () => {
    const { state, clock } = newGame();
    const file = serialize(state, clock.now()) as unknown as { village: { stats: Record<string, number> } };
    delete file.village.stats.timedUpgradesDone;
    expect(deserialize(file, data).stats.timedUpgradesDone).toBe(0);
  });
});

describe('RET-04 (P1-02): the paid look changes each season, and an owned one pays Jade', () => {
  const lookTier = data.pass.tiers.find((t) => t.premium.skin)!.tier;
  it('twelve seasons give the list in order', () => {
    const list = data.pass.seasonSkins!;
    expect(list.length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < 12; i++) {
      const { state } = newGame();
      state.pass.season = 100 + i;
      expect(passTierReward(state, lookTier, 'premium', data)!.skin).toBe(list[(100 + i) % list.length]);
    }
    for (const id of list) expect(data.cosmetics.hallSkins.find((s) => s.id === id)?.passOnly).toBe(true);
  });

  it('an owner gets repeatJade, and the estimate never lists a look the player owns', () => {
    const { state, clock } = newGame();
    state.pass.season = passSeason(clock.now(), data);
    const look = passTierReward(state, lookTier, 'premium', data)!.skin!;
    state.cosmetics.owned.push(look);
    const r = passTierReward(state, lookTier, 'premium', data)!;
    expect(r.skin).toBeUndefined();
    expect(r.moonstones).toBe(data.pass.repeatJade);
    state.pass.points = data.pass.tiers.length * data.pass.pointsPerTier;
    expect(passPremiumValue(state, clock.now(), data).skins).not.toContain(look);
  });
});
