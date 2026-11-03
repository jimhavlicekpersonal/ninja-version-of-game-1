/** Joinable AI factions and normalized tournaments (sim/world/factions.ts, tournament.ts). */
import { describe, expect, it } from 'vitest';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { dayIndex } from '../../../src/gameplay/sim/pass';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand } from '../../../src/gameplay/sim/village';
import { currentWar, factionMissions, factionRank, warEndsAt, warWeek } from '../../../src/gameplay/sim/world/factions';
import { draftProblem, tournamentAt, tournamentBases, tournamentLevels, tournamentScore } from '../../../src/gameplay/sim/world/tournament';
import { data, must, newGame } from '../sim/helpers';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('AI factions', () => {
  it('join, leave, and wait before pledging to another', () => {
    const g = newGame({}, { starter: true });
    let s = must(g.state, { type: 'joinFaction', clan: 'crimson_fang' }, g.clock.now());
    expect(s.world.faction.id).toBe('crimson_fang');
    expect(applyCommand(s, { type: 'joinFaction', clan: 'bamboo' }, g.clock.now(), data).ok).toBe(false);
    s = must(s, { type: 'leaveFaction' }, g.clock.now());
    expect(applyCommand(s, { type: 'joinFaction', clan: 'bamboo' }, g.clock.now() + HOUR, data).ok).toBe(false);
    expect(applyCommand(s, { type: 'joinFaction', clan: 'bamboo' }, g.clock.now() + data.world.factions.switchCooldownHours * HOUR, data).ok).toBe(true);
  });

  it('gives three missions a day that count work done after they appear, paid once', () => {
    const g = newGame({ acorns: 10_000 }, { starter: true });
    let s = must(g.state, { type: 'joinFaction', clan: 'iron_serpent' }, g.clock.now());
    const today = factionMissions(s, 1, data);
    expect(today).toHaveLength(data.world.factions.missionsPerDay);
    expect(factionMissions(s, 1, data).map((m) => m.def.id)).toEqual(today.map((m) => m.def.id));
    expect(today.every((m) => m.progress === 0 && !m.done)).toBe(true);
    // Fake progress on every counter, then claim.
    for (const k of Object.keys(s.stats) as (keyof VillageState['stats'])[]) s.stats[k] += 100_000;
    s.world.counters.conquests += 10;
    s.world.counters.rivalConquests += 10;
    const m = factionMissions(s, 1, data)[0];
    expect(m.done).toBe(true);
    s = must(s, { type: 'claimFactionMission', id: m.def.id }, g.clock.now());
    expect(s.world.faction.reputation).toBe(m.def.reputation);
    expect(applyCommand(s, { type: 'claimFactionMission', id: m.def.id }, g.clock.now(), data).ok).toBe(false);
    // A new day brings new missions with fresh baselines.
    const next = must(s, { type: 'setPvpOptIn', on: false }, g.clock.now() + DAY);
    expect(next.world.faction.day).toBe(dayIndex(g.clock.now() + DAY, data));
    expect(factionMissions(next, 1, data).every((x) => x.progress === 0 && !x.claimed)).toBe(true);
  });

  it('sends a daily support squad of warriors the Dojo has unlocked, once a day, from rank Genin', () => {
    const g = newGame({}, { starter: true });
    let s = must(g.state, { type: 'joinFaction', clan: 'black_dragon' }, g.clock.now());
    expect(applyCommand(s, { type: 'claimSupport' }, g.clock.now(), data).ok).toBe(false);
    s.world.faction.reputation = data.world.factions.ranks[2].reputation;
    expect(factionRank(s.world.faction.reputation, data).name).toBe('Chunin');
    const r = applyCommand(s, { type: 'claimSupport' }, g.clock.now(), data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const got = r.state.grove.reinforcements;
    expect(Object.keys(got).length).toBeGreaterThan(0);
    // No Dojo yet: only Shinobi (Dojo level 1 warriors).
    for (const t of Object.keys(got)) expect(data.troops[t].barracksLevel).toBeLessThanOrEqual(1);
    const evt = r.events.find((e) => e.kind === 'reinforcements');
    expect(evt && evt.kind === 'reinforcements' && evt.troops[0].fromName).toContain('(AI)');
    expect(applyCommand(r.state, { type: 'claimSupport' }, g.clock.now() + HOUR, data).ok).toBe(false);
  });

  it('the weekly war against the rival can be tipped by the player, and pays once', () => {
    const g = newGame({}, { starter: true });
    const t0 = data.world.factions.war.epoch + 10 * 7 * DAY + HOUR;
    let s = must(g.state, { type: 'joinFaction', clan: 'thunder_lotus' }, t0);
    const w0 = currentWar(s, t0, data)!;
    expect(w0.rival).toBe('black_dragon');
    s.world.faction.war.rivalConquests = 5;
    const w1 = currentWar(s, t0, data)!;
    expect(w1.ours).toBe(w0.ours + 5 * data.world.factions.war.perRivalConquest);
    // The week ends: a claimable record appears.
    const after = warEndsAt(warWeek(t0, data), data) + HOUR;
    s = must(s, { type: 'setPvpOptIn', on: false }, after);
    const rec = s.world.faction.warHistory[0];
    expect(rec.week).toBe(warWeek(t0, data));
    expect(rec.outcome).toBe(rec.ours > rec.theirs ? 'win' : rec.ours === rec.theirs ? 'draw' : 'loss');
    s = must(s, { type: 'claimFactionWar', week: rec.week }, after);
    expect(applyCommand(s, { type: 'claimFactionWar', week: rec.week }, after, data).ok).toBe(false);
    expect(s.world.faction.reputation).toBe(data.world.factions.war.rewards[rec.outcome].reputation);
  });

  it('a week without any contribution gives no reward', () => {
    const g = newGame({}, { starter: true });
    const t0 = data.world.factions.war.epoch + 3 * 7 * DAY + HOUR;
    let s = must(g.state, { type: 'joinFaction', clan: 'bamboo' }, t0);
    s = must(s, { type: 'setPvpOptIn', on: false }, t0 + 8 * DAY);
    expect(s.world.faction.warHistory).toHaveLength(0);
  });
});

describe('normalized tournaments', () => {
  const live = (() => {
    const t = data.competition.tournament;
    return t.epoch + 5 * t.periodDays * DAY + HOUR;
  })();

  it('runs on a fixed schedule with the same fortresses for everyone', () => {
    const w = tournamentAt(live, data);
    expect(w.live).toBe(true);
    expect(tournamentAt(w.endsAt + 1, data).live).toBe(false);
    const a = tournamentBases(w.id, data);
    expect(a).toHaveLength(data.competition.tournament.bases);
    expect(tournamentBases(w.id, data)).toEqual(a);
    for (const b of a) {
      expect(b.hallLevel).toBe(data.competition.tournament.hall);
      expect(b.buildings.every((x) => !x.loot)).toBe(true);
    }
    expect(draftProblem({ beetle_brute: 100 }, data)).toMatch(/housing/);
    expect(draftProblem({}, data)).toBeTruthy();
    expect(tournamentScore(3, 100)).toBe(400);
  });

  it('uses standard levels whatever the client sends, spends no warriors, keeps the best score and pays thresholds once', () => {
    const g = newGame({}, { starter: true });
    let s = g.state;
    s.world.firstRaidDone = true;
    const armyBefore = { ...s.army };
    const w = tournamentAt(live, data);
    const base = tournamentBases(w.id, data)[0];
    const army = { beetle_brute: 6, hedgehog_roller: 40, frog_lobber: 30, saboteur: 10 };
    expect(draftProblem(army, data)).toBeNull();
    const setup = { seed: 3, base, army, levels: { beetle_brute: 5, hedgehog_roller: 5 } };
    const probe = createBattle({ ...setup, levels: tournamentLevels(data) }, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(4), data, tournamentLevels(data));
    const r = applyCommand(s, { type: 'tournamentEnd', index: 0, record: { at: live, opponentName: base.name, setup, deployments } }, live, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    const rec = s.battleLog[s.battleLog.length - 1];
    expect(rec.setup.levels).toEqual(tournamentLevels(data));
    expect(s.army).toEqual(armyBefore);
    const e = r.events.find((x) => x.kind === 'tournament_end');
    expect(e && e.kind === 'tournament_end' && e.score).toBe(tournamentScore(rec.result.stars, rec.result.destruction));
    const best = s.world.tournament.best[0];
    // A worse attempt (no deployments) keeps the best score.
    const r2 = applyCommand(s, { type: 'tournamentEnd', index: 0, record: { at: live, opponentName: base.name, setup, deployments: [] } }, live, data);
    expect(r2.ok && r2.state.world.tournament.best[0]).toBe(best);
    // Thresholds already paid stay paid.
    if (r2.ok) expect(r2.state.world.tournament.claimed).toEqual(s.world.tournament.claimed);
    // Outside the tournament window nothing counts.
    expect(applyCommand(s, { type: 'tournamentEnd', index: 0, record: { at: w.endsAt + DAY, opponentName: base.name, setup, deployments } }, w.endsAt + DAY, data).ok).toBe(false);
  });
});

describe('tournament draft helpers', () => {
  it('suggests a full, legal draft', async () => {
    const { suggestedDraft } = await import('../../../src/gameplay/sim/world/tournament');
    const d = suggestedDraft(data);
    expect(draftProblem(d, data)).toBeNull();
    const housing = Object.entries(d).reduce((a, [k, n]) => a + data.troops[k].housing * n, 0);
    expect(housing).toBeGreaterThan(data.competition.tournament.housing * 0.9);
  });
});
