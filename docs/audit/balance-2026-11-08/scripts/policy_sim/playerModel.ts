/**
 * scratch/policy_sim/playerModel.ts: a copy of tools/balance/playerModel.ts (commit 64eafb5) with
 * extra policies for the policy_sim audit dimension. Not part of the game. Differences from the
 * original are marked `// PS:`.
 *
 * Policies:
 * - 'raider' / 'defender' / 'explorer': unchanged.
 * - 'rusher': never builds or upgrades defences, traps, walls, counters or the Lodge. Coins go to
 *   the Keep first, then camps, Dojo, collectors and storage (the original order minus defences).
 * - 'turtle': defences, traps and the five counters at priority 0.5 (right after storage the Keep
 *   needs, before camps, collectors and extras; still behind the Keep itself, which is tried first
 *   every loop) and NOT subject to the "leave 50% of the Keep's cost" extras rule. Walls: after
 *   spend(), `walls()` places every allowed Bramble Hedge at the nearest free tile to the village
 *   centre (findFreeSpot from (20,20), so they fill the gaps of the core and form a shell around
 *   it) and then upgrades the lowest wall first, spending Coins down to 50% of the next Keep's
 *   Coin cost. Hedges are instant (no builder).
 * - 'sandbagger': like raider, but never starts a research that would lift attackerStrength(state)
 *   above hallLevel - sandbagMargin (1.4). Provisions it does not research with go where the
 *   raider's go anyway (training and buildings).
 * - 'hoarder': never raids and never trains (its Provisions go to buildings).
 * - 'raid_max': raider with raidsPerSession 6 (set by the runner).
 * - 'no_research': never researches (control).
 */
import { armyHousing, barracksLevel, housingCapacity, queueHousing, troopUnlock } from '../../src/gameplay/sim/army';
import { newestInFamily, type Family } from '../../tools/balance/armyLab';
import { currentTasks, unlockedTier } from '../../src/gameplay/sim/pass';
import { nextTrialTier, trialBase, trialVariant } from '../../src/gameplay/sim/trials';
import { createBattle } from '../../src/gameplay/sim/battle/battle';
import { totalLoot } from '../../src/gameplay/sim/battle/basegen';
import { FakeClock } from '../../src/gameplay/sim/clock';
import { buildingDef, levelDef } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { findFreeSpot } from '../../src/gameplay/sim/grid';
import { attackerStrength, matchStrength, opponentFor, powerSlackAt } from '../../src/gameplay/sim/matchmaking';
import { computeOfflineProgress } from '../../src/gameplay/sim/offline';
import { researchLanes, troopLevels } from '../../src/gameplay/sim/research';
import { capacity, collectorAmount } from '../../src/gameplay/sim/resources';
import { createRng, mixSeed } from '../../src/gameplay/sim/rng';
import type { GameData, VillageState } from '../../src/gameplay/sim/types';
import { advance, applyCommand, battleArmy, builderStatus, countOfType, createNewVillage, hallLevel, limitFor, researchStartQuote, scoutFee, type Command } from '../../src/gameplay/sim/village';

export type Policy = 'raider' | 'defender' | 'explorer' | 'rusher' | 'turtle' | 'sandbagger' | 'hoarder' | 'raid_max' | 'no_research';

export interface ModelOptions {
  /** Max raids per session (armies permitting). */
  raidsPerSession: number;
  /** Max paid "Next" presses per raid. */
  maxNext?: number;
  policy?: Policy;
  /** Also play Shadow Trials and claim tasks and pass tiers. */
  engaged?: boolean;
  /** PS: sandbagger: never let attackerStrength exceed Keep - this. */
  sandbagMargin?: number;
}

const COUNTER_BUILDINGS = ['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'kite_cutter_ballista', 'longbow_yagura'];
const DEFENCE_BUILDINGS = ['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'thorn_snare', 'sap_puddle'];
/** Explorer army: housing share per family (each family's newest unlocked warrior). */
const EXPLORER_SHARES: [Family, number][] = [['melee', 0.35], ['artillery', 0.25], ['support', 0.1], ['siege', 0.1], ['shadow', 0.1], ['air', 0.1]];

export interface RaidLog {
  hall: number;
  opponentHall: number;
  /** PS: the matched opponent's level bias inside its Keep (0..1). */
  opponentBias: number;
  stars: number;
  destruction: number;
  loot: number;
  trophies: number;
  strength?: number;
  bias?: number;
  /** PS: paid Next presses used for this raid. */
  nexts: number;
  day: number;
}

export interface DayLog {
  day: number;
  keep: number;
  honor: number;
  strength: number;
  acorns: number;
  dew: number;
  capAcorns: number;
  capDew: number;
  housing: number;
  walls: number;
  wallLevel: number;
  defenceLevels: string;
}

export class ModelPlayer {
  clock = new FakeClock(Date.UTC(2026, 0, 5, 8, 0, 0));
  state: VillageState;
  hallReachedAt: Record<number, number> = {};
  raids = 0;
  raidLog: RaidLog[] = [];
  fielded = new Set<string>();
  trialsTried = 0;
  private sessions = 0;
  tasksClaimed = 0;
  defenseLog: { hall: number; stars: number; destruction: number; lost: number; trophies: number; reward: number; day: number }[] = [];
  // PS: extra counters.
  sessionsTotal = 0;
  fullStorageSessions = 0;
  fullAcornSessions = 0;
  fullDewSessions = 0;
  researchSkipped = 0;
  researchStarted = 0;
  wallsPlaced = 0;
  wallUpgrades = 0;
  wallCoins = 0;
  nextPresses = 0;
  dayLog: DayLog[] = [];
  private readonly t0: number;

  constructor(private readonly data: GameData, private readonly opts: ModelOptions) {
    this.state = createNewVillage(this.clock.now(), data);
    this.t0 = this.clock.now();
    this.hallReachedAt[1] = 0;
  }

  get policy(): Policy {
    return this.opts.policy ?? 'raider';
  }

  elapsedHours(): number {
    return (this.clock.now() - this.t0) / 3_600_000;
  }

  elapsedDays(): number {
    return this.elapsedHours() / 24;
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

  away(ms: number): void {
    this.clock.advance(ms);
    const r = computeOfflineProgress(this.state, this.clock.now(), this.data);
    this.state = r.state;
    for (const d of r.summary.raids) this.defenseLog.push({ hall: hallLevel(this.state, this.data), stars: d.result.stars, destruction: d.result.destruction, lost: (d.result.loot.acorns ?? 0) + (d.result.loot.dew ?? 0), trophies: d.trophies ?? 0, reward: (d.banked?.acorns ?? 0) + (d.banked?.dew ?? 0), day: this.elapsedDays() });
    this.state.defenseLog = [];
    this.noteHall();
  }

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
    // PS: storage fullness after collecting.
    {
      const cap = capacity(this.state, d);
      const fa = this.state.resources.acorns >= cap.acorns * 0.98;
      const fd = this.state.resources.dew >= cap.dew * 0.98;
      this.sessionsTotal++;
      if (fa) this.fullAcornSessions++;
      if (fd) this.fullDewSessions++;
      if (fa || fd) this.fullStorageSessions++;
    }
    this.run({ type: 'openDailyChest' });
    if (this.opts.engaged && this.sessions % 8 === 0) this.trial();
    this.sessions++;
    this.raid();
    if (this.opts.engaged) this.claimRewards();
    this.train();
    this.research();
    this.spend();
    if (this.policy === 'turtle') this.walls();
    this.train();
    this.state.lastSeenAt = this.clock.now();
  }

  /** PS: one row per day for the time series. */
  logDay(day: number): void {
    const d = this.data;
    const cap = capacity(this.state, d);
    const walls = this.state.buildings.filter((b) => b.type === 'bramble_hedge');
    const defs = DEFENCE_BUILDINGS.concat(COUNTER_BUILDINGS).map((t) => {
      const bs = this.state.buildings.filter((b) => b.type === t);
      if (!bs.length) return '';
      return `${t.split('_')[0]}:${bs.length}@${(bs.reduce((s, b) => s + b.level, 0) / bs.length).toFixed(1)}`;
    }).filter(Boolean).join(' ');
    this.dayLog.push({
      day,
      keep: hallLevel(this.state, d),
      honor: this.state.trophies,
      strength: attackerStrength(this.state, d),
      acorns: this.state.resources.acorns,
      dew: this.state.resources.dew,
      capAcorns: cap.acorns,
      capDew: cap.dew,
      housing: housingCapacity(this.state, d),
      walls: walls.length,
      wallLevel: walls.length ? walls.reduce((s, b) => s + b.level, 0) / walls.length : 0,
      defenceLevels: defs,
    });
  }

  private hallCost(): Record<string, number> {
    const hl = hallLevel(this.state, this.data);
    const next = levelDef(this.data, 'elder_toadstool', hl + 1);
    return (next?.cost ?? {}) as Record<string, number>;
  }

  private spend(): void {
    const d = this.data;
    const pol = this.policy;
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
      const defender = pol === 'defender';
      const turtle = pol === 'turtle';
      // PS: the rusher never touches defences; the turtle puts them right after needed storage.
      if (pol !== 'rusher') for (const t of DEFENCE_BUILDINGS) consider(t, turtle ? 0.5 : defender ? 2.6 : 4);
      if (defender) for (const t of COUNTER_BUILDINGS) consider(t, 2.5);
      if (turtle) for (const t of COUNTER_BUILDINGS) consider(t, 0.5);
      options.sort((a, b) => a.prio - b.prio);
      let did = false;
      for (const o of options) {
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

  /** PS (turtle): place every allowed hedge at the nearest free tile to the centre, then upgrade the lowest first. */
  private walls(): void {
    const d = this.data;
    const type = 'bramble_hedge';
    const lim = limitFor(this.state, d, type);
    if (!lim.count) return;
    const need = this.hallCost();
    const reserve = (need.acorns ?? 0) * 0.5;
    for (let i = 0; i < 400; i++) {
      const res = this.state.resources;
      const have = countOfType(this.state, type);
      if (have < lim.count) {
        const cost = (d.buildings[type].levels[0].cost?.acorns ?? 0) as number;
        if (res.acorns - cost < reserve) return;
        const spot = findFreeSpot(this.state, d, type, 20, 20);
        if (!spot || !this.run({ type: 'place', buildingType: type, x: spot.x, y: spot.y })) return;
        this.wallsPlaced++;
        this.wallCoins += cost;
        continue;
      }
      const walls = this.state.buildings.filter((b) => b.type === type && b.level < lim.maxLevel).sort((a, b) => a.level - b.level);
      if (!walls.length) return;
      const w = walls[0];
      const cost = (levelDef(d, type, w.level + 1)?.cost?.acorns ?? 0) as number;
      if (res.acorns - cost < reserve) return;
      if (!this.run({ type: 'upgrade', id: w.id })) return;
      this.wallUpgrades++;
      this.wallCoins += cost;
    }
  }

  private mix(): [string, number][] {
    const d = this.data;
    if (this.policy === 'explorer') {
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
    if (this.policy === 'hoarder') return; // PS: no army, no raids.
    const d = this.data;
    const mix = this.mix();
    if (!mix.length) return;
    for (let i = 0; i < 400; i++) {
      const cap = housingCapacity(this.state, d);
      const used = armyHousing(this.state.army, d) + queueHousing(this.state.training, d);
      if (used >= cap) return;
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

  private research(): void {
    if (this.policy === 'no_research' || this.policy === 'hoarder') return; // PS
    if (this.state.research.active.length >= researchLanes(hallLevel(this.state, this.data), this.data)) return;
    const d = this.data;
    const reserve = capacity(this.state, d).dew * 0.3;
    const hl = hallLevel(this.state, d);
    const margin = this.opts.sandbagMargin ?? 1.4;
    for (const [t] of this.mix().sort((a, b) => b[1] - a[1])) {
      const q = researchStartQuote(this.state, t, this.clock.now(), d);
      if (!q.ok || this.state.resources.dew - (q.quote.cost.dew ?? 0) < reserve) continue;
      if (this.policy === 'sandbagger') {
        // PS: would this research lift the earned strength above Keep - margin? Then do not start it.
        const lvl = Math.max(1, this.state.research.levels[t] ?? 1);
        const probe: VillageState = { ...this.state, research: { ...this.state.research, levels: { ...this.state.research.levels, [t]: lvl + 1 } } };
        if (attackerStrength(probe, d) > hl - margin) {
          this.researchSkipped++;
          continue;
        }
      }
      if (this.run({ type: 'research', troop: t })) {
        this.researchStarted++;
        return;
      }
    }
  }

  private raid(): void {
    if (this.policy === 'hoarder') return; // PS
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
      let nexts = 0;
      for (let n = 0; n < (this.opts.maxNext ?? 2); n++) {
        const offer = totalLoot(base);
        if ((offer.acorns ?? 0) + (offer.dew ?? 0) >= avg * 2 || this.state.resources.acorns < scoutFee(this.state, d) * 3) break;
        const next = this.scout(true);
        if (next === null) break;
        seed = next;
        base = opponentFor(seed, this.state, d);
        nexts++;
      }
      this.nextPresses += nexts;
      const strength = attackerStrength(this.state, d);
      // PS: the matched strength (same rng path as opponentForRank) for the bias column.
      const floor = strength - powerSlackAt(hl, d);
      const ms = matchStrength(createRng(mixSeed(seed, 0x5c0a7)), this.state.trophies, hl, d, false, floor);
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
      this.raidLog.push({ hall: hl, opponentHall: base.hallLevel, opponentBias: ms.bias, stars: rec.result.stars, destruction: rec.result.destruction, loot: this.state.resources.acorns + this.state.resources.dew - before, trophies: this.state.trophies, strength, nexts, day: this.elapsedDays() });
      this.state.battleLog = [];
      this.raids++;
    }
  }

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
    this.run({ type: 'trialAlternate' });
    this.state.battleLog = [];
  }

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

  waiting(): number {
    return this.state.buildings.reduce((s, b) => s + collectorAmount(b, this.clock.now(), this.data), 0);
  }
}

export function activeHour(p: ModelPlayer, minutes = 60, stepMin = 2): void {
  for (let m = 0; m < minutes; m += stepMin) {
    p.session();
    p.wait(stepMin * 60_000);
  }
}

export function normalDays(p: ModelPlayer, days: number, onDay?: (day: number) => void): void {
  const sessionsAt = [8 * 60, 12.5 * 60, 18 * 60, 22 * 60];
  const dayStart = (t: number) => Math.floor(t / 86_400_000) * 86_400_000;
  for (let day = 0; day < days; day++) {
    const base = dayStart(p.clock.now());
    for (const m of sessionsAt) {
      const t = base + m * 60_000;
      if (t <= p.clock.now()) continue;
      p.away(t - p.clock.now());
      p.session();
      p.wait(10 * 60_000);
      p.session();
    }
    const next = dayStart(p.clock.now()) + 86_400_000;
    p.away(next - p.clock.now());
    onDay?.(day + 1);
  }
}

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
