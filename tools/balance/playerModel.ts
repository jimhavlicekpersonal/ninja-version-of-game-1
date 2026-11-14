/**
 * A simple model player used to tune progression. It plays through the real
 * game rules (applyCommand, matchmaking, real battles, offline raids) with a
 * fake clock. Nothing about loot is assumed: every raid is a real battle.
 *
 * Assumptions (documented so the balance targets mean something):
 * - Each session it collects everything, opens the daily chest (its streak
 *   never breaks), raids if its army is at least 80%
 *   full, refills the army, researches, then spends on a priority list (Elder
 *   Toadstool > storage it needs > army buildings > collectors > other
 *   storage > defenses and traps), saving half the next Keep's cost
 *   before buying extras and keeping a builder free when the Keep
 *   is nearly affordable.
 * - Raids: it scouts the matched opponent, presses Next (paying the fee) up to
 *   `maxNext` times while the loot on offer is below average for its hall,
 *   then attacks with its whole army using the simple bot plan (everything
 *   from one side, toughest troops first). A human usually does better.
 * - The army follows the bot army mix for its hall, using unlocked troops.
 * - Limited-time events (events.json) apply as they would for a player.
 * - Between sessions, real offline bot raids run against the real layout.
 *
 * Policies (`policy`), so pacing claims stay tied to a strategy actually played:
 * - 'raider' (default): the above.
 * - 'defender': also builds and upgrades the five live counters, and ranks
 *   defenses above collectors.
 * - 'explorer': trains the newest unlocked warrior of each family (melee,
 *   ranged, support, siege, shadow, air) instead of the raid bots' mix, and
 *   researches them.
 * - 'rusher' (balance audit 2026-11-08 PS-1, Change-12): never builds or upgrades defenses or traps.
 * - 'sandbagger' (PS): like the raider, but never starts a research that would lift its earned
 *   strength (`attackerStrength`) above Keep - `sandbagMargin` (1.4), to meet weaker bases.
 * `engaged` adds the other long-term goals: a Shadow Trial attempt when the
 * army is full after raiding, and claiming finished tasks and pass tiers.
 */
import { armyHousing, barracksLevel, housingCapacity, queueHousing, troopUnlock } from '../../src/gameplay/sim/army';
import { newestInFamily, type Family } from './armyLab';
import { currentTasks, unlockedTier } from '../../src/gameplay/sim/pass';
import { nextTrialTier, trialBase, trialVariant } from '../../src/gameplay/sim/trials';
import { createBattle } from '../../src/gameplay/sim/battle/battle';
import { totalLoot } from '../../src/gameplay/sim/battle/basegen';
import { FakeClock } from '../../src/gameplay/sim/clock';
import { buildingDef, levelDef } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { findFreeSpot } from '../../src/gameplay/sim/grid';
import { attackerStrength, opponentFor } from '../../src/gameplay/sim/matchmaking';
import { computeOfflineProgress } from '../../src/gameplay/sim/offline';
import { researchLanes, troopLevels } from '../../src/gameplay/sim/research';
import { capacity, collectorAmount } from '../../src/gameplay/sim/resources';
import { createRng, mixSeed } from '../../src/gameplay/sim/rng';
import type { GameData, VillageState } from '../../src/gameplay/sim/types';
import { advance, applyCommand, battleArmy, builderStatus, countOfType, createNewVillage, hallLevel, limitFor, researchStartQuote, scoutFee, type Command } from '../../src/gameplay/sim/village';

export interface ModelOptions {
  /** Max raids per session (armies permitting). */
  raidsPerSession: number;
  /** Max paid "Next" presses per raid. */
  maxNext?: number;
  policy?: 'raider' | 'defender' | 'explorer' | 'rusher' | 'sandbagger';
  /** 'sandbagger': never research past attackerStrength = Keep - this (balance audit PS, default 1.4). */
  sandbagMargin?: number;
  /** Also play Shadow Trials and claim tasks and pass tiers. */
  engaged?: boolean;
}

const COUNTER_BUILDINGS = ['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'kite_cutter_ballista', 'longbow_yagura'];
/** Explorer army: housing share per family (each family's newest unlocked warrior). */
const EXPLORER_SHARES: [Family, number][] = [['melee', 0.35], ['artillery', 0.25], ['support', 0.1], ['siege', 0.1], ['shadow', 0.1], ['air', 0.1]];

export interface RaidLog {
  hall: number;
  opponentHall: number;
  stars: number;
  destruction: number;
  loot: number;
  trophies: number;
  /** The attacker's earned strength (Keep units) and the opponent's level bias, when it was scouted. */
  strength?: number;
  bias?: number;
}

export class ModelPlayer {
  clock = new FakeClock(Date.UTC(2026, 0, 5, 8, 0, 0));
  state: VillageState;
  hallReachedAt: Record<number, number> = {};
  raids = 0;
  raidLog: RaidLog[] = [];
  /** Every warrior type that fought in a raid. */
  fielded = new Set<string>();
  trialsTried = 0;
  private sessions = 0;
  tasksClaimed = 0;
  /** Raids against the village: stars, destruction, Coins + Provisions stolen, the honor change and a held raid's reward. */
  defenseLog: { hall: number; stars: number; destruction: number; lost: number; trophies: number; reward: number }[] = [];
  private readonly t0: number;

  constructor(private readonly data: GameData, private readonly opts: ModelOptions) {
    this.state = createNewVillage(this.clock.now(), data);
    this.t0 = this.clock.now();
    this.hallReachedAt[1] = 0;
  }

  elapsedHours(): number {
    return (this.clock.now() - this.t0) / 3_600_000;
  }

  private run(cmd: Command): boolean {
    const r = applyCommand(this.state, cmd, this.clock.now(), this.data);
    if (r.ok) this.state = r.state;
    return r.ok;
  }

  private noteHall(): void {
    const hl = hallLevel(this.state, this.data);
    for (let l = 1; l <= hl; l++) if (this.hallReachedAt[l] === undefined) this.hallReachedAt[l] = this.elapsedHours();
  }

  /** Let time pass with the game closed (offline raids apply). */
  away(ms: number): void {
    this.clock.advance(ms);
    const r = computeOfflineProgress(this.state, this.clock.now(), this.data);
    this.state = r.state;
    for (const d of r.summary.raids) this.defenseLog.push({ hall: hallLevel(this.state, this.data), stars: d.result.stars, destruction: d.result.destruction, lost: (d.result.loot.acorns ?? 0) + (d.result.loot.dew ?? 0), trophies: d.trophies ?? 0, reward: (d.banked?.acorns ?? 0) + (d.banked?.dew ?? 0) });
    this.state.defenseLog = [];
    this.noteHall();
  }

  /** Let time pass with the game open (no raids against us). */
  wait(ms: number): void {
    this.clock.advance(ms);
    this.state = advance(this.state, this.clock.now(), this.data).state;
    this.state.lastSeenAt = this.clock.now();
    this.state.raidCheckAt = this.clock.now();
    this.noteHall();
  }

  session(): void {
    const d = this.data;
    this.state = advance(this.state, this.clock.now(), d).state;
    this.noteHall();
    for (const b of this.state.buildings) if (d.buildings[b.type].produces) this.run({ type: 'collect', id: b.id });
    // The free daily chest (fails harmlessly once today's is open).
    this.run({ type: 'openDailyChest' });
    // Engaged players spend one full army a day on the next Shadow Trial tier.
    if (this.opts.engaged && this.sessions % 8 === 0) this.trial();
    this.sessions++;
    this.raid();
    if (this.opts.engaged) this.claimRewards();
    this.train();
    this.research();
    this.spend();
    this.train();
    this.state.lastSeenAt = this.clock.now();
  }

  private hallCost(): Record<string, number> {
    const hl = hallLevel(this.state, this.data);
    const next = levelDef(this.data, 'elder_toadstool', hl + 1);
    return (next?.cost ?? {}) as Record<string, number>;
  }

  private spend(): void {
    const d = this.data;
    for (let guard = 0; guard < 40; guard++) {
      const now = this.clock.now();
      if (builderStatus(this.state, d, now).free < 1) return;
      const hall = this.state.buildings.find((b) => b.type === 'elder_toadstool')!;
      if (!hall.upgrade && this.run({ type: 'upgrade', id: hall.id })) continue;
      const need = this.hallCost();
      const cap = capacity(this.state, d);
      const res = this.state.resources as Record<string, number>;
      const capR = cap as Record<string, number>;
      const hallSoon = Object.keys(need).length > 0 && Object.entries(need).every(([k, v]) => res[k] >= v * 0.6 && capR[k] >= v);
      // Keep the last free builder for the Keep when it is nearly affordable.
      if (hallSoon && builderStatus(this.state, d, now).free <= 1) return;
      const costOf = (cmd: Command): Record<string, number> => {
        if (cmd.type === 'place') return (d.buildings[cmd.buildingType].levels[0].cost ?? {}) as Record<string, number>;
        if (cmd.type === 'upgrade') {
          const b = this.state.buildings.find((x) => x.id === cmd.id)!;
          return (levelDef(d, b.type, b.level + 1)?.cost ?? {}) as Record<string, number>;
        }
        return {};
      };
      const options: { cmd: Command; prio: number }[] = [];
      const consider = (type: string, prio: number) => {
        const def = buildingDef(d, type);
        const lim = limitFor(this.state, d, type);
        for (const b of this.state.buildings) {
          if (b.type !== type || b.upgrade || b.level >= lim.maxLevel) continue;
          options.push({ cmd: { type: 'upgrade', id: b.id }, prio: prio + b.level * 0.01 });
        }
        if (countOfType(this.state, type) < lim.count && def.inShop) {
          const spot = findFreeSpot(this.state, d, type, 20, 20);
          if (spot) options.push({ cmd: { type: 'place', buildingType: type, x: spot.x, y: spot.y }, prio: prio - 0.5 });
        }
      };
      const storageShort = Object.entries(need).some(([k, v]) => v > (cap as Record<string, number>)[k]);
      for (const t of ['acorn_silo', 'dew_cistern']) consider(t, storageShort ? 0 : 3);
      for (const t of ['army_camp', 'burrow_barracks']) consider(t, 1);
      for (const t of ['acorn_orchard', 'dewdrop_well']) consider(t, 2);
      const defender = this.opts.policy === 'defender';
      if (this.opts.policy !== 'rusher') for (const t of ['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'thorn_snare', 'sap_puddle']) consider(t, defender ? 2.6 : 4);
      if (defender) for (const t of COUNTER_BUILDINGS) consider(t, 2.5);
      options.sort((a, b) => a.prio - b.prio);
      let did = false;
      for (const o of options) {
        // Extras (army, defenses) only if they leave enough saved for the next Keep.
        if (o.prio >= 3) {
          const c = costOf(o.cmd);
          if (Object.entries(c).some(([k, v]) => res[k] - v < (need[k] ?? 0) * 0.5)) continue;
        }
        if (!this.run(o.cmd)) continue;
        did = true;
        break;
      }
      if (!did) return;
    }
  }

  /** Housing shares to train toward: the bot mix for this hall, using unlocked troops. */
  private mix(): [string, number][] {
    const d = this.data;
    if (this.opts.policy === 'explorer') {
      const hl = hallLevel(this.state, d);
      const out: [string, number][] = [];
      for (const [family, share] of EXPLORER_SHARES) {
        const t = newestInFamily(family, hl, 6, d).find((x) => troopUnlock(this.state, x, d).unlocked);
        if (t) out.push([t, share]);
      }
      const sum = out.reduce((a, [, v]) => a + v, 0);
      if (out.length) return out.map(([t, v]) => [t, v / sum]);
    }
    const bl = barracksLevel(this.state, d);
    const mixes = d.raids.botArmyMix;
    const want = mixes[Math.min(mixes.length, hallLevel(this.state, d)) - 1];
    const ok = Object.entries(want).filter(([t]) => d.troops[t].barracksLevel <= bl);
    const sum = ok.reduce((a, [, v]) => a + v, 0);
    return ok.map(([t, v]) => [t, v / sum]);
  }

  private train(): void {
    const d = this.data;
    const mix = this.mix();
    if (!mix.length) return;
    for (let i = 0; i < 400; i++) {
      const cap = housingCapacity(this.state, d);
      const used = armyHousing(this.state.army, d) + queueHousing(this.state.training, d);
      if (used >= cap) return;
      // Train the troop furthest below its share; fall back to the cheapest.
      const have: Record<string, number> = { ...this.state.army };
      for (const q of this.state.training) have[q.troop] = (have[q.troop] ?? 0) + 1;
      const order = mix
        .map(([t, share]) => ({ t, gap: share * cap - (have[t] ?? 0) * d.troops[t].housing }))
        .sort((a, b) => b.gap - a.gap);
      let trained = false;
      for (const o of order) {
        if (o.gap < d.troops[o.t].housing && o !== order[order.length - 1]) continue;
        if (this.run({ type: 'train', troop: o.t })) {
          trained = true;
          break;
        }
      }
      if (!trained && !this.run({ type: 'train', troop: 'hedgehog_roller' })) return;
    }
  }

  /** Research the most used unlocked troop that can go up a level, if it leaves 30% of Dew storage for the rest. */
  private research(): void {
    if (this.state.research.active.length >= researchLanes(hallLevel(this.state, this.data), this.data)) return;
    const d = this.data;
    const reserve = capacity(this.state, d).dew * 0.3;
    for (const [t] of this.mix().sort((a, b) => b[1] - a[1])) {
      const q = researchStartQuote(this.state, t, this.clock.now(), d);
      if (!q.ok || this.state.resources.dew - (q.quote.cost.dew ?? 0) < reserve) continue;
      if (this.opts.policy === 'sandbagger') {
        // Would this research lift the earned strength above Keep - margin? Then it stays undone.
        const lvl = Math.max(1, this.state.research.levels[t] ?? 1);
        const probe: VillageState = { ...this.state, research: { ...this.state.research, levels: { ...this.state.research.levels, [t]: lvl + 1 } } };
        if (attackerStrength(probe, d) > hallLevel(this.state, d) - (this.opts.sandbagMargin ?? 1.4)) continue;
      }
      if (this.run({ type: 'research', troop: t })) return;
    }
  }

  private raid(): void {
    const d = this.data;
    for (let r = 0; r < this.opts.raidsPerSession; r++) {
      const cap = housingCapacity(this.state, d);
      const have = armyHousing(this.state.army, d);
      if (!cap || have < cap * 0.8) return;
      const hl = hallLevel(this.state, d);
      const range = d.battle.generatedLootByHall[hl - 1];
      const avg = (range.min + range.max) / 2;
      let seed = this.scout(false);
      if (seed === null) return;
      let base = opponentFor(seed, this.state, d);
      for (let n = 0; n < (this.opts.maxNext ?? 2); n++) {
        const offer = totalLoot(base);
        if ((offer.acorns ?? 0) + (offer.dew ?? 0) >= avg * 2 || this.state.resources.acorns < scoutFee(this.state, d) * 3) break;
        const next = this.scout(true);
        if (next === null) break;
        seed = next;
        base = opponentFor(seed, this.state, d);
      }
      const strength = attackerStrength(this.state, d);
      const army = battleArmy(this.state);
      for (const t of Object.keys(army)) this.fielded.add(t);
      const levels = troopLevels(this.state, d);
      const setup = { seed: mixSeed(seed, 0xba771e), base, army, levels, infiltration: true };
      const probe = createBattle(setup, d);
      const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(seed), d, levels, probe.entry);
      const before = this.state.resources.acorns + this.state.resources.dew;
      const res = applyCommand(this.state, { type: 'battleEnd', record: { at: this.clock.now(), opponentName: base.name, setup, deployments } }, this.clock.now(), d);
      if (!res.ok) throw new Error(`battleEnd failed: ${res.message}`);
      this.state = res.state;
      const rec = this.state.battleLog[this.state.battleLog.length - 1];
      this.raidLog.push({ hall: hl, opponentHall: base.hallLevel, stars: rec.result.stars, destruction: rec.result.destruction, loot: this.state.resources.acorns + this.state.resources.dew - before, trophies: this.state.trophies, strength });
      // Replays are not needed here, and cloning them on every command is slow.
      this.state.battleLog = [];
      this.raids++;
    }
  }

  /** One attempt at the next Shadow Trial tier with the whole army, when it is full. */
  private trial(): void {
    const d = this.data;
    const cap = housingCapacity(this.state, d);
    if (!cap || armyHousing(this.state.army, d) < cap * 0.9) return;
    const tier = nextTrialTier(this.state.trials.best);
    const base = trialBase(tier, d, trialVariant(this.state.trials, tier));
    const army = battleArmy(this.state);
    const levels = troopLevels(this.state, d);
    const setup = { seed: mixSeed(this.state.seed, tier), base, army, levels, infiltration: true };
    const probe = createBattle(setup, d);
    const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(tier), d, levels, probe.entry);
    if (this.run({ type: 'trialEnd', tier, record: { at: this.clock.now(), opponentName: base.name, setup, deployments } })) this.trialsTried++;
    // Stuck? Take an alternate fortress next time.
    this.run({ type: 'trialAlternate' });
    this.state.battleLog = [];
  }

  /** Claim finished tasks and unlocked Season Scroll tiers (free track). */
  private claimRewards(): void {
    const d = this.data;
    for (const t of currentTasks(this.state, hallLevel(this.state, d), d)) {
      if (!t.claimed && t.progress >= t.target && this.run({ type: 'claimTask', id: t.id, kind: t.kind })) this.tasksClaimed++;
    }
    for (let tier = 1; tier <= unlockedTier(this.state, d); tier++) {
      if (!this.state.pass.claimedFree.includes(tier)) this.run({ type: 'claimTier', tier, track: 'free' });
    }
  }

  private scout(paid: boolean): number | null {
    const r = applyCommand(this.state, { type: 'scout', paid }, this.clock.now(), this.data);
    if (!r.ok) return null;
    this.state = r.state;
    const e = r.events.find((x) => x.kind === 'scout');
    return e && e.kind === 'scout' ? e.seed : null;
  }

  /** Total resources waiting in collectors (for debugging). */
  waiting(): number {
    return this.state.buildings.reduce((s, b) => s + collectorAmount(b, this.clock.now(), this.data), 0);
  }
}

/** First hour: continuous play, a session every `stepMin` minutes. */
export function activeHour(p: ModelPlayer, minutes = 60, stepMin = 2): void {
  for (let m = 0; m < minutes; m += stepMin) {
    p.session();
    p.wait(stepMin * 60_000);
  }
}

/** Normal play: 4 sessions a day (8:00, 12:30, 18:00, 22:00 UTC here), the game closed in between. */
export function normalDays(p: ModelPlayer, days: number, onDay?: (day: number) => void): void {
  const sessionsAt = [8 * 60, 12.5 * 60, 18 * 60, 22 * 60];
  const dayStart = (t: number) => Math.floor(t / 86_400_000) * 86_400_000;
  for (let day = 0; day < days; day++) {
    const base = dayStart(p.clock.now()) + (day === 0 ? 0 : 0);
    for (const m of sessionsAt) {
      const t = base + m * 60_000;
      if (t <= p.clock.now()) continue;
      p.away(t - p.clock.now());
      // A session lasts ~10 minutes: play, then a second round after training.
      p.session();
      p.wait(10 * 60_000);
      p.session();
    }
    // Sleep until the next morning.
    const next = dayStart(p.clock.now()) + 86_400_000;
    p.away(next - p.clock.now());
    onDay?.(day + 1);
  }
}

/** Casual play: one ~10-minute visit a day (18:00 UTC here), with a second round after training. */
export function casualDays(p: ModelPlayer, days: number, onDay?: (day: number) => void): void {
  const dayStart = (t: number) => Math.floor(t / 86_400_000) * 86_400_000;
  for (let day = 0; day < days; day++) {
    const t = dayStart(p.clock.now()) + 18 * 3_600_000;
    if (t > p.clock.now()) p.away(t - p.clock.now());
    p.session();
    p.wait(10 * 60_000);
    p.session();
    p.away(dayStart(p.clock.now()) + 86_400_000 - p.clock.now());
    onDay?.(day + 1);
  }
}
