/**
 * Design re-audit (November 2026): monetization, tasks, events, defense and
 * new-player fixes. Combat and campaign gates are in tests/gameplay/balance/.
 */
import { describe, expect, it } from 'vitest';
import { attackerFor } from '../../../src/gameplay/sim/matchmaking';
import { botDeployments, raidVillage } from '../../../src/gameplay/sim/defense';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { topUpOne, topUpScale } from '../../../src/gameplay/sim/economy';
import { activeGoalEvent, bountyBase, goalEventView } from '../../../src/gameplay/sim/goalEvents';
import { canPurchase, productGrantsFor, productInfo, storeProductId } from '../../../src/gameplay/sim/monetization';
import { currentTasks, passPremiumValue, passSaleOpen, passSeasonEndsAt, recentRaidRates, taskTarget } from '../../../src/gameplay/sim/pass';
import { rematchBase, rematchable, rematchReward } from '../../../src/gameplay/sim/rematch';
import { capacity } from '../../../src/gameplay/sim/resources';
import { createRng } from '../../../src/gameplay/sim/rng';
import { migrate, SAVE_VERSION, serialize } from '../../../src/gameplay/sim/save';
import { stipendStatus } from '../../../src/gameplay/sim/stipend';
import type { BattleRecord } from '../../../src/gameplay/sim/battle/types';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, battleLoadout, canHireArtisan, hallLevel } from '../../../src/gameplay/sim/village';
import { data, must, newGame } from './helpers';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function atHall(state: VillageState, hall: number): VillageState {
  return { ...state, buildings: state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: hall } : b)) };
}

function withStorage(state: VillageState, level: number): VillageState {
  const s = structuredClone(state);
  s.buildings.push({ id: 'silo', type: 'acorn_silo', level, x: 2, y: 2, upgrade: null, collector: null });
  s.buildings.push({ id: 'cist', type: 'dew_cistern', level, x: 6, y: 2, upgrade: null, collector: null });
  return s;
}

describe('offers scale with the Keep and never stockpile (item 3)', () => {
  const rebuild = data.offers.rules.find((r) => r.id === 'rebuild_pack')!;

  it('Coins/Provisions follow the top-up scale, Jade does not, and what does not fit comes as the Jade a top-up of it costs', () => {
    const { state } = newGame({ acorns: 0, dew: 0 });
    const g = productGrantsFor(state, rebuild.productId, data)!;
    const scale = topUpScale(1, data);
    expect(g.scaled.acorns).toBe(Math.round(rebuild.contents.acorns! * scale));
    const cap = capacity(state, data);
    // Nothing above storage.
    expect(g.grants.acorns ?? 0).toBeLessThanOrEqual(cap.acorns);
    expect(g.grants.dew ?? 0).toBeLessThanOrEqual(cap.dew);
    // The rest arrives as Jade at the Keep's own top-up price.
    const expectJade = (g.converted.acorns ? topUpOne(g.converted.acorns, data, 1) : 0) + (g.converted.dew ? topUpOne(g.converted.dew, data, 1) : 0);
    expect(g.convertedJade).toBe(expectJade);
    expect(g.grants.moonstones).toBe(rebuild.contents.moonstones! + expectJade);
  });

  it('at a high Keep with room the offer delivers its scaled resources in full (no longer trivial)', () => {
    const { state } = newGame({ acorns: 0, dew: 0 });
    const s = withStorage(atHall(state, 12), 12);
    const g = productGrantsFor(s, rebuild.productId, data)!;
    expect(g.grants.acorns).toBe(Math.round(rebuild.contents.acorns! * topUpScale(12, data)));
    expect(g.converted).toEqual({});
    expect(g.grants.moonstones).toBe(rebuild.contents.moonstones);
  });

  it('an offer is worth about the same Jade at every Keep (its resources priced as top-ups)', () => {
    const jadeValue = (keep: number) => {
      const amt = Math.round(rebuild.contents.acorns! * topUpScale(keep, data));
      return topUpOne(amt, data, keep);
    };
    const v = [1, 5, 10, 15].map(jadeValue);
    expect(Math.max(...v) / Math.min(...v)).toBeLessThan(1.1);
  });

  it('grantPurchase delivers exactly productGrantsFor, records it, and a refund takes back what was delivered', () => {
    const { state, clock } = newGame({ acorns: 0, dew: 0 });
    const g = productGrantsFor(state, rebuild.productId, data)!;
    const before = state.resources.moonstones;
    const s = must(state, { type: 'grantPurchase', productId: rebuild.productId, transactionId: 't1', verified: true }, clock.now());
    expect(s.resources.moonstones - before).toBe(g.grants.moonstones);
    expect(s.resources.acorns).toBe(g.grants.acorns ?? 0);
    expect(s.purchases[0].grants).toEqual(g.grants);
    const r = must(s, { type: 'revokePurchase', transactionId: 't1' }, clock.now());
    expect(r.resources.moonstones).toBe(before);
    expect(r.resources.acorns).toBe(0);
  });

  it('packs are never scaled', () => {
    const { state } = newGame();
    for (const p of data.store.packs) expect(productGrantsFor(atHall(state, 9), p.id, data)!.grants).toEqual({ moonstones: p.moonstones });
  });
});

describe("the Artisan's Bundle is offered only while an Artisan can be hired (item 4)", () => {
  it('canHireArtisan is false once every hut the Keep allows is built', () => {
    const { state } = newGame();
    expect(canHireArtisan(state, data)).toBe(true);
    const full = structuredClone(state);
    for (let i = 0; i < 3; i++) full.buildings.push({ id: `h${i}`, type: 'beaver_lodge', level: 1, x: 2 + i * 3, y: 30, upgrade: null, collector: null });
    expect(canHireArtisan(full, data)).toBe(false);
    const r = applyCommand({ ...full, createdAt: full.createdAt - 100 * DAY }, { type: 'triggerOffer', trigger: 'all_builders_busy' }, full.createdAt + 1000, data);
    expect(r.ok).toBe(false);
  });
});

describe('Season Scroll value and fair late purchases (item 5)', () => {
  it('the premium track pays Jade at tier 1 and is worth more than the pack of the same price when bought early', () => {
    const premium1 = data.pass.tiers.find((t) => t.tier === 1)!.premium;
    expect(premium1.moonstones ?? 0).toBeGreaterThan(0);
    const totalJade = data.pass.tiers.reduce((a, t) => a + (t.premium.moonstones ?? 0), 0);
    const pack = data.store.packs.find((p) => p.usd === data.pass.usd)!;
    expect(totalJade).toBeGreaterThan(pack.moonstones);
    const { state } = newGame();
    const start = data.pass.epoch + DAY / 2;
    const v = passPremiumValue({ ...state, pass: { ...state.pass, season: 0 } }, start, data);
    expect(v.tiers).toBe(data.pass.tiers.length);
    expect(v.total).toBeGreaterThan(v.packJade);
  });

  it('the estimate only counts the tiers still reachable', () => {
    const { state } = newGame();
    const end = passSeasonEndsAt(data.pass.epoch, data);
    const late = passPremiumValue({ ...state, pass: { ...state.pass, season: 0, points: 0 } }, end - 2 * DAY, data);
    expect(late.tiers).toBeLessThan(data.pass.tiers.length);
  });

  it('the premium Scroll is not sold in the last days unless the player already unlocked enough tiers', () => {
    const { state } = newGame();
    const end = passSeasonEndsAt(data.pass.epoch, data);
    const t = end - DAY;
    const s: VillageState = { ...state, profile: { ...state.profile, under18: false }, pass: { ...state.pass, season: 0, points: 0 } };
    expect(passSaleOpen(t, data, s).open).toBe(false);
    const check = canPurchase(s, data.pass.productId, t, data);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.code).toBe('SEASON_ENDING');
    const earned = { ...s, pass: { ...s.pass, points: data.pass.pointsPerTier * (data.pass.noSaleUnlessTiers ?? 0) } };
    expect(canPurchase(earned, data.pass.productId, t, data).ok).toBe(true);
    expect(canPurchase(s, data.pass.productId, data.pass.epoch + 3 * DAY, data).ok).toBe(true);
  });
});

function raidRecord(stars: number, i: number): BattleRecord {
  return { id: `r${i}`, at: i, kind: 'attack', opponentName: 'x', setup: { seed: 1, base: { name: 'x', hallLevel: 1, buildings: [] }, army: {} }, deployments: [], result: { stars, destruction: stars * 30, hallDestroyed: stars >= 2, loot: {}, used: {}, ticks: 1, endReason: 'time', hash: '' }, trophies: 0 };
}

describe('star and win tasks follow the recent star rate (item 6)', () => {
  const stars = data.pass.dailyTasks.find((t) => t.id === 'earn_stars')!;
  const wins = data.pass.weeklyChallenges.find((t) => t.id === 'w_win_raids')!;

  it('a player who rarely wins gets a reachable target, or none when even one is out of reach', () => {
    const { state } = newGame();
    const weak = { ...state, battleLog: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0].map(raidRecord) };
    expect(recentRaidRates(weak, data)!.stars).toBeCloseTo(0.2);
    // 4 raids x 0.2 stars = 0.8 < 1: the daily star task is not offered.
    expect(taskTarget(stars, weak, data)).toBeNull();
    // 20 raids x 20% wins = 4 wins this week.
    expect(taskTarget(wins, weak, data)).toBe(4);
    const strong = { ...state, battleLog: Array.from({ length: 10 }, (_, i) => raidRecord(2, i)) };
    expect(taskTarget(stars, strong, data)).toBe(stars.base);
    // Too few raids to judge: the template's own target.
    expect(taskTarget(stars, state, data)).toBe(stars.base);
  });

  it('the target is fixed when the day begins, and an unreachable star task is replaced', () => {
    const { state, clock } = newGame();
    const weak = { ...state, battleLog: Array.from({ length: 10 }, (_, i) => raidRecord(0, i)) };
    clock.advance(DAY);
    const s = must(weak, { type: 'tutorial', step: 0 }, clock.now());
    const ids = currentTasks(s, hallLevel(s, data), data).filter((t) => t.kind === 'daily').map((t) => t.id);
    expect(ids).not.toContain('earn_stars');
    expect(ids).not.toContain('win_raids');
    // Later wins do not move today's targets.
    const later = { ...s, battleLog: Array.from({ length: 10 }, (_, i) => raidRecord(3, i)) };
    expect(currentTasks(later, hallLevel(later, data), data).map((t) => [t.id, t.target])).toEqual(currentTasks(s, hallLevel(s, data), data).map((t) => [t.id, t.target]));
  });
});

describe('Bounty Hunt: a goal event (item 8)', () => {
  const def = data.events.schedule.find((e) => e.goal)!;
  const start = data.events.epoch + def.startHour * HOUR;

  it('runs only in its window, every period, with a fixed fortress per village and occurrence', () => {
    expect(activeGoalEvent(start - 1, data)).toBeNull();
    expect(activeGoalEvent(start, data)!.id).toBe(def.id);
    expect(activeGoalEvent(start + def.durationHours * HOUR, data)).toBeNull();
    expect(activeGoalEvent(start + data.events.periodDays * DAY + HOUR, data)!.key).not.toBe(activeGoalEvent(start, data)!.key);
    const key = activeGoalEvent(start, data)!.key;
    const a = bountyBase(42, key, 5, def.goal!, data);
    expect(bountyBase(42, key, 5, def.goal!, data)).toEqual(a);
    expect(a.buildings.every((b) => !b.loot)).toBe(true);
    expect(a.practice).toBeTruthy();
  });

  it('each ladder step pays once; the base is rebuilt, never taken from the client', () => {
    const { state } = newGame();
    let s: VillageState = { ...atHall(state, 4), army: { hedgehog_roller: 60, beetle_brute: 6 } };
    const view = goalEventView(s, start + HOUR, data)!;
    const key = view.event.key;
    const loadout = battleLoadout(s, data);
    const setup = { seed: 5, base: view.base, ...loadout, infiltration: true };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, loadout.army, createRng(3), data, loadout.levels, probe.entry);
    const r1 = applyCommand(s, { type: 'bountyEnd', eventKey: key, record: { at: start + HOUR, opponentName: 'x', setup, deployments } }, start + HOUR, data);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    s = r1.state;
    const e1 = r1.events.find((e) => e.kind === 'bounty_end')!;
    if (e1.kind !== 'bounty_end') return;
    expect(s.goalEvent!.key).toBe(key);
    expect(s.goalEvent!.claimed).toEqual(e1.steps);
    // The same result again pays nothing new.
    s = { ...s, army: { hedgehog_roller: 60, beetle_brute: 6 } };
    const r2 = applyCommand(s, { type: 'bountyEnd', eventKey: key, record: { at: start + 2 * HOUR, opponentName: 'x', setup: { ...setup, ...battleLoadout(s, data) }, deployments } }, start + 2 * HOUR, data);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const e2 = r2.events.find((e) => e.kind === 'bounty_end')!;
      if (e2.kind === 'bounty_end') expect(e2.steps.filter((i) => e1.steps.includes(i))).toEqual([]);
    }
    // A forged base changes nothing: the record carries the rebuilt one.
    const forged = { ...setup, base: { ...setup.base, buildings: setup.base.buildings.slice(0, 1) } };
    const r3 = applyCommand(s, { type: 'bountyEnd', eventKey: key, record: { at: start + 3 * HOUR, opponentName: 'x', setup: forged, deployments } }, start + 3 * HOUR, data);
    if (r3.ok) expect(r3.state.battleLog[r3.state.battleLog.length - 1].setup.base.buildings.length).toBe(view.base.buildings.length);
    // Outside the window: refused.
    expect(applyCommand(s, { type: 'bountyEnd', eventKey: key, record: { at: start - HOUR, opponentName: 'x', setup, deployments } }, start - HOUR, data).ok).toBe(false);
  });
});

describe('Clan Stipend and the $0.99 pack (item 9)', () => {
  it('has store ids and the cheapest pack is under a dollar', () => {
    expect(Math.min(...data.store.packs.map((p) => p.usd))).toBeLessThan(1);
    expect(storeProductId(data, 'moonstones_0')).toBe('jade_pinch');
    expect(storeProductId(data, data.store.stipend!.id)).toBe('clan_stipend');
    expect(productInfo(data, 'clan_stipend')!.kind).toBe('stipend');
  });

  it('one payment per day on claim, missed days are not lost, and it can be rebought only when used up', () => {
    const { state, clock } = newGame();
    const st = data.store.stipend!;
    let s = must(state, { type: 'grantPurchase', productId: st.id, transactionId: 's1', verified: true }, clock.now());
    expect(stipendStatus(s, clock.now(), data)).toMatchObject({ left: st.payments, claimable: true, canBuy: false });
    const jade = s.resources.moonstones;
    s = must(s, { type: 'claimStipend' }, clock.now());
    expect(s.resources.moonstones).toBe(jade + st.jadePerPayment);
    expect(applyCommand(s, { type: 'claimStipend' }, clock.now() + HOUR, data).ok).toBe(false);
    // Ten days away: still one payment per day, nothing lost.
    clock.advance(10 * DAY);
    s = must(s, { type: 'claimStipend' }, clock.now());
    expect(s.stipend.left).toBe(st.payments - 2);
    const s2 = { ...s, profile: { ...s.profile, under18: false } };
    const refused = canPurchase(s2, st.id, clock.now(), data);
    expect(refused.ok).toBe(false);
    const used = { ...s2, stipend: { left: 0, lastDay: s2.stipend.lastDay } };
    expect(canPurchase(used, st.id, clock.now(), data).ok).toBe(true);
  });

  it('counts toward the under-18 monthly cap like any purchase', () => {
    const { state, clock } = newGame();
    const minor: VillageState = { ...state, profile: { ...state.profile, under18: true }, purchases: [{ id: 'p', productId: 'moonstones_5', usd: data.store.minorMonthlyCapUsd - 1, at: clock.now() }] };
    const check = canPurchase(minor, data.store.stipend!.id, clock.now(), data);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.code).toBe('SPEND_CAP');
  });

  it('save v16 adds the stipend, goal progress and the new counters without touching progress', () => {
    const { state, clock } = newGame();
    const old = serialize(state, clock.now()) as unknown as { version: number; village: Record<string, unknown> };
    old.version = 15;
    delete old.village.stipend;
    delete old.village.goalEvent;
    const stats = old.village.stats as Record<string, number>;
    delete stats.defensesFaced;
    delete stats.raidDestruction;
    const out = migrate(old, data);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(16);
    expect(out.village.stipend).toEqual({ left: 0, lastDay: -1 });
    expect(out.village.goalEvent).toBeNull();
    expect(out.village.stats.defensesFaced).toBe(0);
    expect(out.village.stats.raidDestruction).toBe(0);
  });
});

describe('defense: rematches and held raids (item 10), gentler first raids (item 11)', () => {
  function raided(trophies = 0) {
    const { state, clock } = newGame();
    const s = structuredClone({ ...state, trophies, shieldUntil: 0 });
    return { s, clock };
  }

  it('the first raids bring half an army two research levels lower; later ones a full army', () => {
    const { s } = raided(1400);
    const soft = attackerFor(createRng(1), s, data);
    expect(soft.softened).toBe(true);
    const later = attackerFor(createRng(1), { ...s, stats: { ...s.stats, defensesFaced: data.raids.newPlayerRaids!.count } }, data);
    expect(later.softened).toBeUndefined();
    const housing = (a: Record<string, number>) => Object.entries(a).reduce((x, [t, n]) => x + data.troops[t].housing * n, 0);
    expect(housing(soft.army)).toBeLessThanOrEqual(Math.ceil(housing(later.army) * data.raids.newPlayerRaids!.housingShare));
    for (const t of Object.keys(soft.army)) expect(soft.levels[t]).toBeLessThanOrEqual(Math.max(1, (later.levels[t] ?? 1) - 1));
  });

  it('a Keep 2 village with the tutorial Kunai Tower usually holds its first raids', () => {
    let held = 0;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const { state, clock } = newGame({ acorns: 2000, dew: 2000 });
      let s = atHall(state, 2);
      // The tutorial village: Keep 2, a Coin Mint, the Dojo, a Courtyard, and its first Kunai Tower.
      s = {
        ...s,
        buildings: [
          ...s.buildings,
          // The tower next to the Keep, where the tutorial tells the player to put it.
          { id: 'kt', type: 'acorn_cannon', level: 1, x: 18, y: 15, upgrade: null, collector: null },
          { id: 'cm', type: 'acorn_orchard', level: 1, x: 22, y: 15, upgrade: null, collector: { stored: 0, accrueFrom: clock.now() } },
          { id: 'dj', type: 'burrow_barracks', level: 1, x: 12, y: 23, upgrade: null, collector: null },
          { id: 'sc', type: 'army_camp', level: 1, x: 12, y: 12, upgrade: null, collector: null },
        ],
      };
      const out = raidVillage(s, clock.now(), createRng(100 + i), data);
      if (out.record.result.stars === 0) held++;
    }
    // A full raid wins about 6 in 10 of these; the gentler first raids almost never do.
    expect(held / n).toBeGreaterThanOrEqual(0.75);
  });

  it('a held raid counts and pays a little; every bot raid can be answered once by a rematch', () => {
    const { s, clock } = raided();
    const out = raidVillage(s, clock.now(), createRng(7), data);
    expect(s.stats.defensesFaced).toBe(1);
    expect(s.stats.defensesWon).toBe(out.record.result.stars === 0 ? 1 : 0);
    expect(out.record.raider).toBeTruthy();
    const base = rematchBase(out.record, data)!;
    expect(base.buildings.every((b) => !b.loot)).toBe(true);
    expect(base.name).toContain('simulated');
    expect(rematchable(s, clock.now(), data).map((d) => d.id)).toEqual([out.record.id]);
    let v: VillageState = { ...s, army: { hedgehog_roller: 20 } };
    const loadout = battleLoadout(v, data);
    const setup = { seed: 9, base, ...loadout, infiltration: true };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, loadout.army, createRng(4), data, loadout.levels, probe.entry);
    const r = applyCommand(v, { type: 'rematchEnd', defenseId: out.record.id, record: { at: clock.now(), opponentName: base.name, setup, deployments } }, clock.now(), data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    v = r.state;
    const e = r.events.find((x) => x.kind === 'rematch_end')!;
    if (e.kind === 'rematch_end' && e.won) expect(v.stats.rematchesWon).toBe(1);
    expect(v.trophies).toBe(s.trophies);
    // Once only.
    expect(rematchable(v, clock.now(), data)).toEqual([]);
    expect(applyCommand({ ...v, army: { hedgehog_roller: 20 } }, { type: 'rematchEnd', defenseId: out.record.id, record: { at: clock.now(), opponentName: base.name, setup, deployments } }, clock.now(), data).ok).toBe(false);
    // Too late: refused.
    const late = clock.now() + (data.raids.rematch!.windowHours + 1) * HOUR;
    expect(rematchable(s, late, data)).toEqual([]);
    expect(rematchReward(3, 5, data).acorns).toBeGreaterThan(rematchReward(1, 5, data).acorns!);
  });
});
