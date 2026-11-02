/**
 * A simple model player used to tune progression. It plays through the real
 * game rules (applyCommand, offline raids) with a fake clock.
 *
 * Assumptions (documented so the balance targets mean something):
 * - Each session it collects everything, raids if its army is at least half
 *   full, refills the army, then spends on a priority list (Elder Toadstool >
 *   storage it needs > army buildings > collectors > other storage >
 *   defenses), saving half the next Elder Toadstool's cost before buying
 *   extras and keeping a builder free when the Elder Toadstool is nearly
 *   affordable.
 * - Each full army raids one generated opponent and wins `lootEfficiency` of
 *   the average loot on offer for its hall level (a typical 1-2 star raid).
 * - Between sessions, real offline bot raids run against the real layout.
 */
import { armyHousing, housingCapacity, queueHousing } from '../../src/sim/army';
import { FakeClock } from '../../src/sim/clock';
import { buildingDef, levelDef } from '../../src/sim/data';
import { findFreeSpot } from '../../src/sim/grid';
import { computeOfflineProgress } from '../../src/sim/offline';
import { addCapped, capacity, collectorAmount } from '../../src/sim/resources';
import type { GameData, VillageState } from '../../src/sim/types';
import { advance, applyCommand, builderStatus, countOfType, createNewVillage, hallLevel, limitFor, type Command } from '../../src/sim/village';

export interface ModelOptions {
  lootEfficiency: number;
  /** Max raids per session (armies permitting). */
  raidsPerSession: number;
}

export class ModelPlayer {
  clock = new FakeClock(Date.UTC(2026, 0, 5, 8, 0, 0));
  state: VillageState;
  hallReachedAt: Record<number, number> = {};
  raids = 0;
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
    this.state = computeOfflineProgress(this.state, this.clock.now(), this.data).state;
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
    this.raid();
    this.train();
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
      // Keep the last free builder for the Elder Toadstool when it is nearly affordable.
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
      for (const t of ['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower']) consider(t, 4);
      options.sort((a, b) => a.prio - b.prio);
      let did = false;
      for (const o of options) {
        // Extras (army, defenses) only if they leave enough saved for the next Elder Toadstool.
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

  private train(): void {
    const d = this.data;
    for (let i = 0; i < 200; i++) {
      const cap = housingCapacity(this.state, d);
      if (armyHousing(this.state.army, d) + queueHousing(this.state.training, d) >= cap) return;
      if (!this.run({ type: 'train', troop: 'hedgehog_roller' })) return;
    }
  }

  private raid(): void {
    const d = this.data;
    for (let r = 0; r < this.opts.raidsPerSession; r++) {
      const cap = housingCapacity(this.state, d);
      const have = armyHousing(this.state.army, d);
      if (!cap || have < cap * 0.5) return;
      const hl = hallLevel(this.state, d);
      const range = d.battle.generatedLootByHall[hl - 1];
      const avg = (range.min + range.max) / 2;
      const loot = Math.floor(avg * this.opts.lootEfficiency * Math.min(1, have / cap));
      addCapped(this.state.resources, { acorns: loot, dew: loot }, capacity(this.state, d));
      this.state.army = {};
      this.state.shieldUntil = Math.min(this.state.shieldUntil, this.clock.now());
      this.raids++;
    }
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
