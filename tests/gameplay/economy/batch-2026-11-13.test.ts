/**
 * Game-theory batch 2026-11-13 (save v22): balance audit CU-3, CU-6, CU-7 and economy E18.
 * - CU-3: top-up then cancel no longer turns Jade into resources; the Jade share comes back as Jade.
 * - CU-7: a cancel whose refund would not fit is refused with the amounts (it used to drop them silently);
 *   dismissing refunds the price paid, not today's research level's price; a dismiss overflow is reported.
 * - CU-6: a Season Scroll tier's resources scale by the Keep it unlocked at, not the Keep at claim time.
 * - E18: future daily chests cannot be read from the village seed (each claim rolls a salt from fresh entropy).
 */
import { describe, expect, it } from 'vitest';
import { scaleReward } from '../../../src/gameplay/sim/economy';
import { currentTasks, unlockedTier } from '../../../src/gameplay/sim/pass';
import { capacity } from '../../../src/gameplay/sim/resources';
import { migrate, serialize, SAVE_VERSION } from '../../../src/gameplay/sim/save';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { advance, applyCommand, dismissPreview, hallLevel, passTierKeep, passTierReward, topUpQuote } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from '../sim/helpers';

const SHINOBI = 'hedgehog_roller';

function armyVillage(dew: number) {
  const g = newGame({ acorns: 1500, dew: 1500, moonstones: 5000 });
  let s = must(g.state, { type: 'place', buildingType: 'burrow_barracks', x: 2, y: 2 }, g.clock.now());
  s = must(s, { type: 'place', buildingType: 'army_camp', x: 6, y: 2 }, g.clock.now());
  g.clock.advanceSeconds(3600);
  s = advance(s, g.clock.now(), data).state;
  s = { ...s, resources: { ...s.resources, dew } };
  return { ...g, state: s };
}

const setKeep = (s: VillageState, level: number): VillageState => ({ ...s, buildings: s.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level } : b)) });

describe('CU-3: top-up then cancel', () => {
  it('gives the Jade back as Jade and only what storage paid as Provisions', () => {
    const { state, clock } = armyVillage(50);
    const action = { type: 'train', troop: SHINOBI, count: 10 } as const;
    const q = topUpQuote(state, action, clock.now(), data)!;
    expect(q.missing.dew).toBeGreaterThan(0);
    const s = must(state, { type: 'topUp', then: action }, clock.now());
    expect(s.resources.dew).toBe(0);
    const bought = s.training.reduce((a, t) => a + (t.topUp?.cost.dew ?? 0), 0);
    const jade = s.training.reduce((a, t) => a + (t.topUp?.jade ?? 0), 0);
    expect(bought).toBe(q.missing.dew);
    expect(jade).toBe(q.moonstones);
    const after = must(s, { type: 'cancelTraining', index: s.training.length - 1, troop: SHINOBI, count: s.training.length }, clock.now());
    // Before the fix: 10 warriors' full cost in Provisions (Jade exchanged for Provisions at 100 %).
    expect(after.resources.dew).toBe(50);
    expect(after.resources.moonstones).toBe(state.resources.moonstones);
    expect(after.stats.moonstonesSpent).toBe(state.stats.moonstonesSpent);
  });

  it('a partly cancelled stack gives back its own share; finished warriors keep only what storage paid', () => {
    const { state, clock } = armyVillage(50);
    const s = must(state, { type: 'topUp', then: { type: 'train', troop: SHINOBI, count: 10 } }, clock.now());
    const one = must(s, { type: 'cancelTraining', index: s.training.length - 1, troop: SHINOBI }, clock.now());
    const last = s.training[s.training.length - 1];
    expect(one.resources.moonstones - s.resources.moonstones).toBe(last.topUp!.jade);
    expect(one.resources.dew).toBe((last.cost.dew ?? 0) - (last.topUp!.cost.dew ?? 0));
    // Train them all out: the army remembers only what storage paid (dismissing never pays out Jade's share).
    const done = advance(s, clock.now() + 3_600_000, data).state;
    expect(done.army[SHINOBI]).toBe(10);
    expect(done.armyPaid![SHINOBI]).toEqual({ n: 10, cost: { dew: 50 } });
  });

  it('a topped-up research cancel gives back half the Jade and half of what storage paid', () => {
    const g = armyVillage(0);
    const state = setKeep(g.state, 2);
    const action = { type: 'research', troop: SHINOBI } as const;
    const q = topUpQuote(state, action, g.clock.now(), data)!;
    const s = must(state, { type: 'topUp', then: action }, g.clock.now());
    const after = must(s, { type: 'cancelResearch', troop: SHINOBI }, g.clock.now());
    expect(after.resources.dew).toBe(0);
    expect(after.resources.moonstones - s.resources.moonstones).toBe(Math.floor(q.moonstones * data.economy.cancelRefundFraction));
  });
});

describe('CU-7: refunds at full storage, and the dismiss price', () => {
  it('a cancel whose refund would not fit is refused with the amounts, and nothing changes', () => {
    const { state, clock } = armyVillage(1000);
    const s = must(state, { type: 'train', troop: SHINOBI, count: 5 }, clock.now());
    const full = { ...s, resources: { ...s.resources, dew: capacity(s, data).dew } };
    const r = applyCommand(full, { type: 'cancelTraining', index: 4, troop: SHINOBI, count: 5 }, clock.now(), data);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('STORAGE_FULL');
    expect(r.params).toEqual({ refund: { dew: 5 * data.troops[SHINOBI].levels[0].cost.dew! }, lost: { dew: 5 * data.troops[SHINOBI].levels[0].cost.dew! } });
    // With room it goes through and pays in full.
    const ok = must(s, { type: 'cancelTraining', index: 4, troop: SHINOBI, count: 5 }, clock.now());
    expect(ok.resources.dew).toBe(state.resources.dew);
  });

  it('dismissing refunds the price paid, not the researched level\'s price', () => {
    const { state, clock } = armyVillage(1000);
    let s = must(state, { type: 'train', troop: SHINOBI, count: 4 }, clock.now());
    s = advance(s, clock.now() + 3_600_000, data).state;
    const paid = 4 * data.troops[SHINOBI].levels[0].cost.dew!;
    // Research to level 3 (its price is higher): the warriors trained at level 1 are still worth what they cost.
    s = { ...s, research: { ...s.research, levels: { ...s.research.levels, [SHINOBI]: 3 } }, resources: { ...s.resources, dew: 0 } };
    expect(data.troops[SHINOBI].levels[2].cost.dew!).toBeGreaterThan(data.troops[SHINOBI].levels[0].cost.dew!);
    expect(dismissPreview(s, SHINOBI, 4, data).refund.dew).toBe(Math.floor(paid * data.economy.dismissRefundFraction));
    const out = must(s, { type: 'dismiss', troop: SHINOBI, count: 2 }, clock.now());
    expect(out.resources.dew).toBe(Math.floor((paid / 2) * data.economy.dismissRefundFraction));
    expect(out.armyPaid![SHINOBI]).toEqual({ n: 2, cost: { dew: paid / 2 } });
  });

  it('warriors from before save v22 (untracked) refund at today\'s price, as before', () => {
    const { state, clock } = armyVillage(0);
    const s = { ...state, army: { [SHINOBI]: 4 } };
    const each = data.troops[SHINOBI].levels[0].cost.dew!;
    expect(dismissPreview(s, SHINOBI, 4, data).refund.dew).toBe(Math.floor(4 * each * data.economy.dismissRefundFraction));
    void clock;
  });

  it('a dismiss at full storage still frees the space and reports what did not fit', () => {
    const { state, clock } = armyVillage(0);
    const s = { ...state, army: { [SHINOBI]: 4 }, resources: { ...state.resources, dew: capacity(state, data).dew } };
    const r = applyCommand(s, { type: 'dismiss', troop: SHINOBI, count: 4 }, clock.now(), data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = r.events.find((x) => x.kind === 'dismiss')!;
    expect(e.kind === 'dismiss' && e.overflow?.dew).toBe(Math.floor(4 * data.troops[SHINOBI].levels[0].cost.dew! * data.economy.dismissRefundFraction));
  });
});

describe('CU-6: Season Scroll tiers scale by the Keep they unlocked at', () => {
  it('claiming after a Keep upgrade no longer multiplies the reward', () => {
    const { state, clock } = newGame();
    let s = setKeep(state, 3);
    // One task short of tier 2, then the task that unlocks it.
    s = { ...s, pass: { ...s.pass, points: data.pass.pointsPerTier * 2 - 1 } };
    const task = currentTasks(s, hallLevel(s, data), data).find((t) => t.kind === 'daily')!;
    s = { ...s, stats: { ...s.stats, [task.stat]: (s.stats[task.stat] ?? 0) + task.target } };
    s = must(s, { type: 'claimTask', id: task.id, kind: task.kind }, clock.now());
    expect(unlockedTier(s, data)).toBeGreaterThanOrEqual(2);
    expect(s.pass.tierKeep![1]).toBe(3);
    // The Keep goes up to 8 before the claim.
    s = setKeep(s, 8);
    expect(passTierKeep(s, 2, data)).toBe(3);
    const free = data.pass.tiers[1].free;
    const { skin: _skin, ...res } = free as typeof free & { skin?: string };
    expect(passTierReward(s, 2, 'free', data)).toEqual(scaleReward(res, 3, data));
    expect(scaleReward(res, 8, data)).not.toEqual(scaleReward(res, 3, data));
    // A tier not unlocked yet shows the reward at today's Keep.
    expect(passTierKeep(s, 30, data)).toBe(8);
  });

  it('never pays above today\'s Keep (a Keep cannot drop, but an edited record must not inflate a reward)', () => {
    const { state } = newGame();
    const s = { ...setKeep(state, 2), pass: { ...state.pass, points: data.pass.pointsPerTier * 3, tierKeep: [15, 15, 15] } };
    expect(passTierKeep(s, 1, data)).toBe(2);
  });

  it('a v21 save records today\'s Keep for the tiers it already unlocked', () => {
    const { state, clock } = newGame();
    const s = { ...setKeep(state, 5), pass: { ...state.pass, points: data.pass.pointsPerTier * 4 + 10 } };
    const file = { ...serialize(s, clock.now()), version: 21 };
    const out = migrate(file, data);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.village.pass.tierKeep).toEqual([5, 5, 5, 5]);
  });
});

describe('E18: the daily chest cannot be read ahead from the village seed', () => {
  const DAY = 86_400_000;
  /** Outcomes of `days` claims on consecutive days with the given entropy per claim. */
  function outcomes(s0: VillageState, start: number, entropy: (i: number) => number, days = 12): string[] {
    let s = s0;
    const out: string[] = [];
    for (let i = 0; i < days; i++) {
      const r = applyCommand(s, { type: 'openDailyChest', entropy: entropy(i) }, start + i * DAY, data);
      if (!r.ok) throw new Error(r.message);
      s = r.state;
      out.push(s.daily.history[s.daily.history.length - 1].outcome);
    }
    return out;
  }

  it('the same village draws different futures with different entropy (only the first chest is fixed by the seed)', () => {
    const { state, clock } = newGame();
    const a = outcomes(state, clock.now(), (i) => 1000 + i);
    const b = outcomes(state, clock.now(), (i) => 777_777 + i * 31);
    expect(a[0]).toBe(b[0]);
    expect(a.slice(1)).not.toEqual(b.slice(1));
  });

  it('replays exactly with the same entropy (the server replays the command as sent)', () => {
    const { state, clock } = newGame();
    expect(outcomes(state, clock.now(), (i) => i * 7)).toEqual(outcomes(state, clock.now(), (i) => i * 7));
  });

  it('every claim rolls the salt', () => {
    const { state, clock } = newGame();
    const s1 = must(state, { type: 'openDailyChest', entropy: 5 }, clock.now());
    const s2 = must(s1, { type: 'openDailyChest', entropy: 5 }, clock.now() + DAY);
    expect(s1.daily.salt).toBeDefined();
    expect(s2.daily.salt).not.toBe(s1.daily.salt);
  });
});
