import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { filterText, generateGrove, reinforcementCapacity } from '../../../src/gameplay/sim/social/grove';
import { attacksLeft, enemyGrove, raidPhase, raidScore, raidWindow } from '../../../src/gameplay/sim/social/groveRaid';
import { advance, applyCommand, battleArmy, hallLevel } from '../../../src/gameplay/sim/village';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { must, newGame } from '../sim/helpers';

const HOUR = 3_600_000;

function withLodge(): { state: VillageState; clock: FakeClock } {
  const g = newGame({ acorns: 5000, dew: 5000 });
  // Elder Toadstool 2 unlocks the Grove Lodge.
  let s: VillageState = { ...g.state, buildings: g.state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: 2 } : b)) };
  s = must(s, { type: 'place', buildingType: 'grove_lodge', x: 4, y: 4 }, g.clock.now());
  g.clock.advanceSeconds(data.buildings.grove_lodge.levels[0].buildSeconds);
  s = advance(s, g.clock.now(), data).state;
  return { state: s, clock: g.clock };
}

describe('Grove', () => {
  it('has 10 to 20 bot members with unique names and roles, from the seed', () => {
    for (const seed of [1, 2, 3, 99]) {
      const g = generateGrove(seed, data);
      expect(g.members.length).toBeGreaterThanOrEqual(10);
      expect(g.members.length).toBeLessThanOrEqual(20);
      expect(new Set(g.members.map((m) => m.name)).size).toBe(g.members.length);
      expect(g.members[0].role).toBe('Leader');
      expect(generateGrove(seed, data)).toEqual(g);
    }
  });

  it('chat comes alive over time, the same way every time', () => {
    const { state, clock } = newGame();
    const s0 = must(state, { type: 'joinGrove' }, clock.now());
    expect(s0.grove.chat.length).toBeGreaterThanOrEqual(2); // welcome messages
    const a = advance(s0, clock.now() + 12 * HOUR, data).state;
    const b = advance(s0, clock.now() + 12 * HOUR, data).state;
    expect(a.grove.chat).toEqual(b.grove.chat);
    expect(a.grove.chat.length).toBeGreaterThan(s0.grove.chat.length);
    expect(a.grove.chat.length).toBeLessThanOrEqual(data.social.maxChat);
  });

  it('chat is always filtered', () => {
    expect(filterText('you are so stupid', data)).not.toContain('stupid');
    expect(filterText('have a lovely day', data)).toBe('have a lovely day');
    const { state, clock } = newGame();
    let s = must(state, { type: 'joinGrove' }, clock.now());
    s = must(s, { type: 'chat', text: 'what the hell' }, clock.now());
    const mine = s.grove.chat.filter((c) => c.from === -1);
    expect(mine[mine.length - 1].text).not.toMatch(/hell/i);
  });

  it('donating costs the troops and gives XP only (no instant troop swap)', () => {
    const { state, clock } = withLodge();
    let s = must({ ...state, army: { hedgehog_roller: 20 } }, { type: 'joinGrove' }, clock.now());
    // Wait until a friend asks for troops.
    let t = clock.now();
    while (!s.grove.requests.length) {
      t += HOUR;
      s = advance(s, t, data).state;
    }
    const req = s.grove.requests[0];
    const s2 = must(s, { type: 'donate', requestId: req.id, troop: 'hedgehog_roller', count: 5 }, t);
    expect(s2.army.hedgehog_roller).toBe(15);
    expect(s2.grove.xp).toBe(5 * data.social.xpPerHousing);
    expect(s2.stats.donations).toBe(5);
    // Donating used to hand back the same housing as random troops, which let
    // players turn cheap Hedgehogs into Beetles. Reinforcements now only come
    // from your own requests.
    expect(s2.grove.reinforcements).toEqual(s.grove.reinforcements);
    expect(reinforcementCapacity(s2, data)).toBeGreaterThan(0);
  });

  it('asking for troops: friends fill the Grove Lodge over a few minutes, with a cooldown', () => {
    const { state, clock } = withLodge();
    let s = must(state, { type: 'joinGrove' }, clock.now());
    s = must(s, { type: 'requestTroops' }, clock.now());
    expect(applyCommand(s, { type: 'requestTroops' }, clock.now() + 60_000, data).ok).toBe(false);
    s = advance(s, clock.now() + 15 * 60_000, data).state;
    const housing = Object.entries(s.grove.reinforcements).reduce((sum, [k, n]) => sum + data.troops[k].housing * n, 0);
    expect(housing).toBeGreaterThan(0);
    expect(housing).toBeLessThanOrEqual(10);
    // Donated troops join your next battle and are used before your own.
    expect(Object.values(battleArmy(s)).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('needs a Grove Lodge to receive troops', () => {
    const { state, clock } = newGame();
    const s = must(state, { type: 'joinGrove' }, clock.now());
    const r = applyCommand(s, { type: 'requestTroops' }, clock.now(), data);
    expect(r.ok).toBe(false);
  });
});

describe('Grove Raid (a full week, fast-forwarded)', () => {
  it('runs for 2 days, allows 2 attacks each, and pays out exactly once', () => {
    const clock = new FakeClock(Date.UTC(2026, 1, 2, 12, 0, 0)); // a Monday, mid-week
    const g = newGame({ acorns: 0, dew: 0 });
    let s: VillageState = { ...g.state, createdAt: clock.now(), lastSeenAt: clock.now() };
    s = must(s, { type: 'joinGrove' }, clock.now());
    const now0 = raidPhase(clock.now(), data);
    expect(now0.phase).not.toBe('live');
    const phase = { week: now0.phase === 'upcoming' ? now0.week : now0.week + 1 };
    const { start, end } = raidWindow(phase.week, data);
    expect(start).toBe(now0.nextStart);
    expect(end - start).toBe(48 * HOUR);
    const hall = hallLevel(s, data);
    const enemy = enemyGrove(s.grove.seed, phase.week, hall, data);
    expect(enemy.bases.length).toBe(generateGrove(s.grove.seed, data).members.length + 1);

    // Attacking before the raid starts is refused.
    const army = { hedgehog_roller: 60 };
    const attack = (state: VillageState, target: number, at: number) => {
      const base = enemy.bases[target];
      const deployments = Array.from({ length: 60 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + (i % 38) }));
      return applyCommand({ ...state, army: { ...army } }, { type: 'groveBattleEnd', target, record: { at, opponentName: base.name, setup: { seed: target + 1, base, army }, deployments } }, at, data);
    };
    expect(attack(s, 0, clock.now()).ok).toBe(false);

    // During the raid: two attacks, then no more.
    clock.set(start + HOUR);
    s = advance(s, clock.now(), data).state;
    const r1 = attack(s, 0, clock.now());
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    s = r1.state;
    const r2 = attack(s, 1, clock.now() + 1000);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    s = r2.state;
    expect(attacksLeft(s, phase.week, data)).toBe(0);
    expect(attack(s, 2, clock.now() + 2000).ok).toBe(false);
    // The player's stars count toward the Grove score.
    const myStars = runBattle({ seed: 1, base: enemy.bases[0], army }, Array.from({ length: 60 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + (i % 38) })), data).result.stars;
    expect(s.grove.raid!.attacks[0].stars).toBe(myStars);

    // Fast-forward past the end: the chest is paid once.
    const before = { ...s.resources };
    const xpBefore = s.grove.xp;
    clock.set(end + HOUR);
    s = advance(s, clock.now(), data).state;
    const score = raidScore(s, phase.week, end, hall, data);
    const outcome = score.ours > score.theirs ? 'win' : score.ours < score.theirs ? 'loss' : 'draw';
    expect(s.grove.raidHistory).toHaveLength(1);
    expect(s.grove.raidHistory[0]).toMatchObject({ week: phase.week, ours: score.ours, theirs: score.theirs, outcome });
    const reward = data.social.groveRaid.rewards[outcome];
    expect(s.resources.moonstones).toBe(before.moonstones + reward.moonstones!);
    expect(s.grove.xp).toBe(xpBefore + reward.xp);
    expect(s.resources.acorns).toBeGreaterThan(before.acorns);
    // Advancing again does not pay twice.
    const again = advance(s, clock.now() + 24 * HOUR, data).state;
    expect(again.resources.moonstones).toBe(s.resources.moonstones);
    expect(again.grove.raidHistory).toHaveLength(1);
    // The next week's raid is settled once too; skipped, it pays nothing (ledger audit E12).
    const later = advance(s, raidWindow(phase.week + 1, data).end + HOUR, data).state;
    expect(later.grove.raidHistory).toHaveLength(2);
    expect(later.grove.raidHistory[1].reward).toEqual({});
    expect(later.resources.moonstones).toBe(s.resources.moonstones);
    expect(later.grove.xp).toBe(s.grove.xp);
  });

  it('pays a returning player for at most the last wars, and only those fought (ledger audit E12)', () => {
    const { clock, state } = newGame();
    let s = must(state, { type: 'joinGrove' }, clock.now());
    const xp = s.grove.xp;
    // A year away: 52 wars ended. Only the last settleWeeksMax are settled, none was fought, nothing is paid
    // (the same village outside the Alliance ends the year with the same Jade from its other sources).
    const back = advance(s, clock.now() + 365 * 24 * HOUR, data).state;
    const alone = advance(state, clock.now() + 365 * 24 * HOUR, data).state;
    expect(back.grove.raidHistory).toHaveLength(data.social.groveRaid.settleWeeksMax);
    expect(back.grove.raidHistory.every((h) => Object.keys(h.reward).length === 0)).toBe(true);
    expect(back.resources.moonstones).toBe(alone.resources.moonstones);
    expect(back.grove.xp).toBe(xp);
    // And nothing more is owed afterwards.
    s = advance(back, clock.now() + 365 * 24 * HOUR + HOUR, data).state;
    expect(s.grove.raidHistory).toHaveLength(data.social.groveRaid.settleWeeksMax);
  });

  it('raids before you joined are not paid', () => {
    const clock = new FakeClock(Date.UTC(2026, 1, 9, 12, 0, 0));
    const g = newGame();
    const s = must({ ...g.state }, { type: 'joinGrove' }, clock.now());
    const after = advance(s, clock.now() + HOUR, data).state;
    expect(after.grove.raidHistory).toHaveLength(0);
    void generateOpponent;
  });
});

describe('Grove gifts (#11)', () => {
  it('friends only send troops your Burrow Barracks has unlocked', () => {
    const { state, clock } = withLodge();
    // No barracks at all: only the first (basic) troop can arrive.
    let s = must(state, { type: 'joinGrove' }, clock.now());
    for (let i = 0; i < 4; i++) {
      s = { ...s, grove: { ...s.grove, reinforcements: {} } };
      const t = clock.now() + i * 2 * HOUR;
      s = must(s, { type: 'requestTroops' }, t);
      s = advance(s, t + HOUR, data).state;
      for (const troop of Object.keys(s.grove.reinforcements)) expect(data.troops[troop].barracksLevel).toBe(1);
    }
  });
});
