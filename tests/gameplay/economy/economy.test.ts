import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { GameController } from '../../../src/gameplay/control/controller';
import { MockPaymentProvider } from '../../../src/backend/payments/provider';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { skipCost, topUpOne } from '../../../src/gameplay/sim/economy';
import { spentThisMonth } from '../../../src/gameplay/sim/monetization';
import { currentTasks, unlockedTier } from '../../../src/gameplay/sim/pass';
import { migrate } from '../../../src/gameplay/sim/save';
import { advance, applyCommand, builderStatus, createNewVillage, upgradeQuote } from '../../../src/gameplay/sim/village';
import { find, must, newGame } from '../sim/helpers';

async function controller() {
  const clock = new FakeClock();
  const events = new MemoryEventStore();
  const payments = new MockPaymentProvider(() => clock.now());
  const { controller: c } = await GameController.start({ clock, store: new MemorySaveStore(), analytics: new Analytics(events, clock, 't'), data, payments });
  // Start from a clean village so tests can place buildings anywhere.
  await c.replace({ ...c.state, buildings: c.state.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle') });
  const names = async () => {
    await new Promise((r) => setTimeout(r, 0));
    return events.events.map((e) => e.name);
  };
  return { c, clock, events, payments, names };
}

describe('Moonstone prices', () => {
  it('skip cost follows the curve through 1 min=1, 1 h=25, 1 day=300, 1 week=1200', () => {
    expect(skipCost(60, data)).toBe(1);
    expect(skipCost(3600, data)).toBe(25);
    expect(skipCost(86400, data)).toBe(300);
    expect(skipCost(604800, data)).toBe(1200);
    expect(skipCost(10, data)).toBe(1);
    expect(skipCost(0, data)).toBe(0);
    const twoHours = skipCost(7200, data);
    expect(twoHours).toBeGreaterThan(25);
    expect(twoHours).toBeLessThan(45);
  });

  it('top-up cost follows the curve through 100=1, 1k=10, 10k=80, 100k=1400, 1M=6000', () => {
    // Large top-ups got steeper when Clan Keeps got cheaper (pacing), so rushing stays expensive (#20).
    expect([100, 1000, 10000, 100000, 1000000].map((n) => topUpOne(n, data))).toEqual([1, 10, 80, 1400, 6000]);
    expect(topUpOne(1, data)).toBe(1);
  });

  it('bigger packs give more Moonstones per dollar; prices match the spec', () => {
    const packs = data.store.packs;
    expect(packs.map((p) => p.usd)).toEqual([1.99, 4.99, 9.99, 19.99, 49.99, 99.99]);
    for (let i = 1; i < packs.length; i++) expect(packs[i].moonstones / packs[i].usd).toBeGreaterThan(packs[i - 1].moonstones / packs[i - 1].usd);
  });
});

describe('spending Moonstones', () => {
  it('new players get the 500 Moonstone tutorial grant', () => {
    expect(newGame().state.resources.moonstones).toBe(500);
  });

  it('skip finishes an upgrade now', () => {
    const { state, clock } = newGame();
    const hall = find(state, 'elder_toadstool')[0];
    let s = must(state, { type: 'upgrade', id: hall.id }, clock.now());
    s = must(s, { type: 'skip', id: hall.id }, clock.now());
    expect(find(s, 'elder_toadstool')[0].level).toBe(2);
    expect(s.resources.moonstones).toBe(500 - skipCost(data.buildings.elder_toadstool.levels[1].buildSeconds, data));
    expect(s.stats.moonstonesSpent).toBeGreaterThan(0);
  });

  it('top-up buys exactly the missing resources', () => {
    const cost = data.buildings.elder_toadstool.levels[1].cost.acorns!;
    const { state, clock } = newGame({ acorns: 400 });
    const hall = find(state, 'elder_toadstool')[0];
    expect(applyCommand(state, { type: 'upgrade', id: hall.id }, clock.now(), data).ok).toBe(false);
    const s = must(state, { type: 'topUp', cost: { acorns: cost } }, clock.now());
    expect(s.resources.acorns).toBe(cost);
    expect(s.resources.moonstones).toBe(500 - topUpOne(cost - 400, data));
    expect(applyCommand(s, { type: 'upgrade', id: hall.id }, clock.now(), data).ok).toBe(true);
  });

  it('Beaver Lodges 3, 4 and 5 cost 250, 500 and 1,000 Moonstones', () => {
    const { state, clock } = newGame({ moonstones: 2000 });
    let s = state;
    for (const [i, price] of [250, 500, 1000].entries()) {
      const before = s.resources.moonstones;
      s = must(s, { type: 'place', buildingType: 'beaver_lodge', x: 2 + i * 3, y: 2 }, clock.now());
      expect(before - s.resources.moonstones).toBe(price);
    }
    expect(builderStatus(s, data, clock.now()).total).toBe(5);
    const r = applyCommand(s, { type: 'place', buildingType: 'beaver_lodge', x: 20, y: 2 }, clock.now(), data);
    expect(r.ok).toBe(false);
  });

  it('hall skins can be bought and equipped; decorations cost Moonstones', () => {
    const { state, clock } = newGame();
    let s = must(state, { type: 'buySkin', skin: 'royal_plum' }, clock.now());
    expect(s.cosmetics.hallSkin).toBe('royal_plum');
    expect(s.resources.moonstones).toBe(300);
    s = must(s, { type: 'equipSkin', skin: 'classic' }, clock.now());
    expect(applyCommand(s, { type: 'buySkin', skin: 'lantern_elder' }, clock.now(), data).ok).toBe(false);
    s = must(s, { type: 'place', buildingType: 'lantern_post', x: 2, y: 2 }, clock.now());
    expect(s.resources.moonstones).toBe(280);
  });
});

describe('free Moonstones', () => {
  it('new villages have forest obstacles; clearing one gives Moonstones', () => {
    const clock = new FakeClock();
    const v = createNewVillage(clock.now(), data);
    const obstacles = v.buildings.filter((b) => data.buildings[b.type].category === 'obstacle');
    expect(obstacles.length).toBeGreaterThan(10);
    const o = obstacles[0];
    const def = data.buildings[o.type];
    let s = { ...v, resources: { ...v.resources, acorns: 5000, dew: 5000 } };
    s = must(s, { type: 'clear', id: o.id }, clock.now());
    clock.advanceSeconds(def.clear!.seconds);
    s = advance(s, clock.now(), data).state;
    expect(s.buildings.find((b) => b.id === o.id)).toBeUndefined();
    expect(s.resources.moonstones).toBe(500 + def.clear!.moonstones);
    expect(s.stats.obstaclesCleared).toBe(1);
  });

  it('achievements pay out Moonstones tier by tier', () => {
    const { state, clock } = newGame();
    const s0 = { ...state, stats: { ...state.stats, raidsWon: 6 } };
    const s1 = must(s0, { type: 'claimAchievement', id: 'raider' }, clock.now());
    expect(s1.resources.moonstones).toBe(510);
    expect(applyCommand(s1, { type: 'claimAchievement', id: 'raider' }, clock.now(), data).ok).toBe(false);
  });

  it('daily tasks give pass points; free-track tiers give rewards', () => {
    const { state, clock } = newGame();
    const tasks = currentTasks(state, 1, data);
    expect(tasks.filter((t) => t.kind === 'daily')).toHaveLength(3);
    expect(tasks.filter((t) => t.kind === 'weekly')).toHaveLength(data.pass.weeklyCount);
    const t = tasks[0];
    const done = { ...state, stats: { ...state.stats, [t.stat]: t.target } };
    let s = must(done, { type: 'claimTask', id: t.id, kind: 'daily' }, clock.now());
    expect(s.pass.points).toBe(data.pass.dailyTaskPoints);
    s = { ...s, pass: { ...s.pass, points: data.pass.pointsPerTier * 5 } };
    expect(unlockedTier(s, data)).toBe(5);
    s = must(s, { type: 'claimTier', tier: 5, track: 'free' }, clock.now());
    expect(s.resources.moonstones).toBe(510);
    expect(applyCommand(s, { type: 'claimTier', tier: 5, track: 'premium' }, clock.now(), data).ok).toBe(false);
  });
});

describe('purchases end to end with the mock provider (all logged in analytics)', () => {
  it('asks for an age group first, then buys a Moonstone pack', async () => {
    const { c, payments, names } = await controller();
    const r0 = await c.purchase('moonstones_2');
    expect(r0.ok).toBe(false);
    if (!r0.ok) expect(r0.code).toBe('AGE_UNKNOWN');
    c.dispatch({ type: 'setProfile', under18: false });
    const r = await c.purchase('moonstones_2');
    expect(r.ok).toBe(true);
    expect(c.state.resources.moonstones).toBe(500 + 280);
    expect(payments.sales).toHaveLength(1);
    expect(c.state.purchases).toHaveLength(1);
    expect(await names()).toContain('purchase');
  });

  it('premium Lantern Pass makes builds 20% faster', async () => {
    const { c, names } = await controller();
    c.dispatch({ type: 'setProfile', under18: false });
    const hall = c.state.buildings.find((b) => b.type === 'elder_toadstool')!;
    const before = upgradeQuote(c.state, hall.id, data, c.now());
    expect((await c.purchase('lantern_pass')).ok).toBe(true);
    const after = upgradeQuote(c.state, hall.id, data, c.now());
    expect(c.state.pass.premium).toBe(true);
    if (before.ok && after.ok) expect(after.quote.seconds).toBe(Math.round(before.quote.seconds * 0.8));
    expect((await c.purchase('lantern_pass')).ok).toBe(false);
    expect(await names()).toContain('purchase');
  });

  it('a long first wait shows the starter offer once per session; buying it grants the contents', async () => {
    const { c, names, clock } = await controller();
    c.dispatch({ type: 'setProfile', under18: false });
    const shown: string[] = [];
    c.onOffer((rule) => shown.push(rule.id));
    // Build up to an upgrade that takes over an hour.
    await c.replace({ ...c.state, resources: { ...c.state.resources, acorns: 200000, dew: 200000 }, buildings: c.state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 4 } : b)) });
    const hall = c.state.buildings.find((b) => b.type === 'elder_toadstool')!;
    expect(c.dispatch({ type: 'upgrade', id: hall.id }).ok).toBe(true);
    expect(shown).toEqual(['starter_pack']);
    expect(await names()).toContain('offer_shown');
    // Only one offer per session, even when another trigger fires.
    expect(c.triggerOffer('heavy_defense_loss')).toBeNull();
    const before = c.state.resources.moonstones;
    expect((await c.purchase('offer_starter')).ok).toBe(true);
    expect(c.state.resources.moonstones).toBe(before + 300);
    expect(c.state.offers.active).toHaveLength(0);
    // Expired or already-bought offers cannot be bought.
    expect((await c.purchase('offer_starter')).ok).toBe(false);
    clock.advanceHours(1);
  });

  it('players under 18 have a monthly spending cap', async () => {
    const { c } = await controller();
    c.dispatch({ type: 'setProfile', under18: true });
    expect((await c.purchase('moonstones_4')).ok).toBe(true); // $19.99
    expect((await c.purchase('moonstones_4')).ok).toBe(true); // $39.98
    const r = await c.purchase('moonstones_4'); // would be $59.97
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SPEND_CAP');
    expect(spentThisMonth(c.state, c.now())).toBeCloseTo(39.98);
  });

  it('Moonstone spends (skip, top-up, lodge, skin) are logged too', async () => {
    const { c, names } = await controller();
    const hall = c.state.buildings.find((b) => b.type === 'elder_toadstool')!;
    c.dispatch({ type: 'upgrade', id: hall.id });
    expect(c.dispatch({ type: 'skip', id: hall.id }).ok).toBe(true);
    expect(c.dispatch({ type: 'topUp', cost: { acorns: c.state.resources.acorns + 100 } }).ok).toBe(true);
    expect(c.dispatch({ type: 'place', buildingType: 'beaver_lodge', x: 2, y: 2 }).ok).toBe(true);
    const list = await names();
    expect(list).toContain('skip_used');
    expect(list.filter((n) => n === 'moonstone_spend').length).toBeGreaterThanOrEqual(3);
  });
});

describe('save migration v3 -> v4', () => {
  it('adds economy fields and obstacles', () => {
    const { state } = newGame();
    const v3 = { version: 3, savedAt: 1, village: { ...state } as Record<string, unknown> };
    for (const k of ['stats', 'purchases', 'profile', 'offers', 'pass', 'tasks', 'cosmetics', 'achievements', 'flags']) delete v3.village[k];
    const m = migrate(v3, data);
    expect(m.version).toBeGreaterThanOrEqual(4);
    expect(m.village.cosmetics.hallSkin).toBe('classic');
    expect(m.village.buildings.some((b) => data.buildings[b.type].category === 'obstacle')).toBe(true);
  });
});
