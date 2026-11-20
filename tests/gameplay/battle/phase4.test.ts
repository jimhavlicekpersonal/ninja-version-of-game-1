/** Phase 4 of the 2026-11-16 replayability pass (SIM_RULES 8): one test per combat hook. */
import { describe, expect, it } from 'vitest';
import { createBattle, deploymentsByTick, result, step } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { opponentForRank } from '../../../src/gameplay/sim/matchmaking';
import { rivalFor } from '../../../src/gameplay/sim/rivals';
import { createRng } from '../../../src/gameplay/sim/rng';
import { chargeRod } from '../../../src/gameplay/sim/battle/previewCounters';
import type { GameData } from '../../../src/gameplay/sim/types';

function fight(data: GameData, army: Record<string, number>, keep = 4, seed = 11) {
  const base = generateOpponent(4100 + seed, keep, data, { levelBias: 0.5 });
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, 3]));
  const sim = createBattle({ seed, base, army, levels, infiltration: true }, data);
  const plan = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(seed), data, levels, sim.entry));
  while (!sim.ended) step(sim, plan.get(sim.tick));
  return { r: result(sim) };
}

describe('P4-01 (CMB-01): support warriors in position strike', () => {
  it('absent or 0 plays exactly as before; the shipped share makes a support-heavy army do more', () => {
    const army = { herbalist: 12, drum_monk: 12, hedgehog_roller: 12 };
    const off = structuredClone(defaultData);
    delete off.battle.warriorRules.supportStrike;
    const zero = structuredClone(defaultData);
    zero.battle.warriorRules.supportStrike = 0;
    expect(fight(off, army).r.hash).toBe(fight(zero, army).r.hash);
    expect(defaultData.battle.warriorRules.supportStrike).toBe(1);
    let on = 0;
    let without = 0;
    for (let seed = 11; seed <= 18; seed++) {
      on += fight(defaultData, army, 4, seed).r.destruction;
      without += fight(off, army, 4, seed).r.destruction;
    }
    expect(on).toBeGreaterThan(without);
  });
});

describe('P4-07 (CMB-08): raid bases use the rival clans\' home layouts', () => {
  it('from layouts.fromKeep every rival outpost uses one of its clan\'s home layouts; below it, the ring generator', () => {
    const lay = defaultData.ranks.matchmaking.layouts!;
    const names = Object.fromEntries(LAYOUTS.map((l) => [l.name, l.id]));
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const seed = 9000 + i;
      const high = opponentForRank(seed, 12 * defaultData.ranks.matchmaking.trophiesPerHall, 12, defaultData, 11.5, []);
      const clan = rivalFor(seed, defaultData)!;
      const id = names[high.practice ?? ''];
      expect(lay.clanHome[clan.id]).toContain(id);
      seen.add(id);
      const low = opponentForRank(seed, 0, 3, defaultData, 0, []);
      expect(low.practice).toBeUndefined();
    }
    expect(seen.size).toBe(5);
  });
});

describe('P4-10 (BNL): the Lightning Rod raises at most one "absorbed" callout a second', () => {
  it('ten hits in one tick give one event; a second later, another', () => {
    const rod = { effect: { kind: 'lightning_rod', capacity: 100, returnPct: 1 }, maxHp: 1000, charge: 0 };
    const sim = { buildings: [rod], events: [] as { what?: string }[], tick: 0, data: defaultData } as unknown as Parameters<typeof chargeRod>[0];
    const troop = { id: 0, dead: false } as unknown as Parameters<typeof chargeRod>[3];
    for (let i = 0; i < 10; i++) chargeRod(sim, 0, 1, troop, () => {});
    expect(sim.events.filter((e) => (e as { what?: string }).what === 'absorbed')).toHaveLength(1);
    (sim as { tick: number }).tick = defaultData.battle.ticksPerSecond;
    chargeRod(sim, 0, 1, troop, () => {});
    expect(sim.events.filter((e) => (e as { what?: string }).what === 'absorbed')).toHaveLength(2);
  });
});
