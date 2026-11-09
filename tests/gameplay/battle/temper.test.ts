/**
 * Tempering (SIM_RULES 6, save v21; docs/game-theory/DESIGN_TEMPERING_2026-11-08.md): per-type defence shape,
 * base-wide effects of the base's profile, the temper command, save repair, scouting and rival outposts.
 */
import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { createBattle, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { scoutReport } from '../../../src/gameplay/sim/battle/scout';
import { baseProfile, dominantFamily, normalizeTemper, temperAxes, validTemper } from '../../../src/gameplay/sim/battle/temper';
import type { BaseLayout, BattleSetup } from '../../../src/gameplay/sim/battle/types';
import { levelDef } from '../../../src/gameplay/sim/data';
import { opponentForRank, rivalTempers } from '../../../src/gameplay/sim/matchmaking';
import { migrate, serialize } from '../../../src/gameplay/sim/save';
import { economyHash } from '../../../src/gameplay/sim/serverEconomy';
import type { Temper, VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, temperQuote } from '../../../src/gameplay/sim/village';
import { data, newGame } from '../sim/helpers';

const def = data.battle.temper!;

function base(hall = 9, seed = 41): BaseLayout {
  return generateOpponent(seed, hall, data, { levelBias: 0.5 });
}

function withTemper(b: BaseLayout, tempers: Record<string, Temper>): BaseLayout {
  return { ...b, buildings: b.buildings.map((x) => (tempers[x.type] ? { ...x, temper: { ...tempers[x.type] } } : { ...x })) };
}

function sim(b: BaseLayout) {
  const setup: BattleSetup = { seed: 3, base: b, army: {}, levels: {} };
  return createBattle(setup, data);
}

function atHall(state: VillageState, hall: number): VillageState {
  return { ...state, buildings: state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: hall } : b)) };
}

describe('tempering data', () => {
  it('opens at a Keep, with whole steps and only the listed defences', () => {
    expect(def.unlockKeep).toBeGreaterThan(1);
    expect(def.steps).toBe(10);
    expect(Object.keys(def.types).sort()).toEqual(['acorn_cannon', 'wasp_nest']);
    expect(temperAxes('acorn_cannon', data)).toEqual(['reach', 'blast', 'watch']);
    expect(temperAxes('wasp_nest', data)).toEqual(['reach', 'watch']);
    for (const r of Object.values(def.rivals)) for (const [t, x] of Object.entries(r.tempers)) expect(validTemper(t, x, data)).toBe(true);
    for (const c of Object.values(def.offers.counters)) for (const [t, x] of Object.entries(c)) expect(validTemper(t, x, data)).toBe(true);
  });

  it('validTemper rejects other axes, other types, fractions, negatives and more than the steps', () => {
    expect(validTemper('acorn_cannon', { reach: 4, blast: 3, watch: 3 }, data)).toBe(true);
    expect(validTemper('acorn_cannon', {}, data)).toBe(true);
    expect(validTemper('acorn_cannon', { reach: 6, blast: 5 }, data)).toBe(false);
    expect(validTemper('acorn_cannon', { reach: 1.5 }, data)).toBe(false);
    expect(validTemper('acorn_cannon', { reach: -1 }, data)).toBe(false);
    expect(validTemper('acorn_cannon', { speed: 1 }, data)).toBe(false);
    expect(validTemper('wasp_nest', { blast: 1 }, data)).toBe(false);
    expect(validTemper('pinecone_catapult', { reach: 1 }, data)).toBe(false);
    expect(validTemper('acorn_cannon', [1], data)).toBe(false);
    expect(normalizeTemper({ reach: 0, watch: 3 })).toEqual({ watch: 3 });
    expect(normalizeTemper({ reach: 0 })).toBeNull();
  });
});

describe('tempering in battle', () => {
  it('an untempered base builds exactly the same battle as one whose tempers are all empty', () => {
    const b = base();
    const plain = sim(b);
    const empty = sim(withTemper(b, { acorn_cannon: {}, wasp_nest: {} }));
    expect(empty.buildings).toEqual(plain.buildings);
    expect(baseProfile(b, data)).toEqual({ reach: 0, blast: 0, watch: 0 });
    // Untempered combat numbers are the data's own.
    const kunai = plain.buildings.find((x) => x.type === 'acorn_cannon')!;
    expect(kunai.combat!.range).toBe(data.buildings.acorn_cannon.combat!.range);
    expect(kunai.combat!.damage).toBe(levelDef(data, 'acorn_cannon', kunai.level)!.damage);
  });

  it('Reach: more range and softer hits, and from half it prefers far attackers', () => {
    const b = base();
    const plain = sim(b).buildings.find((x) => x.type === 'acorn_cannon')!;
    const reach = def.types.acorn_cannon.reach!;
    const four = sim(withTemper(b, { acorn_cannon: { reach: 4 } })).buildings.find((x) => x.type === 'acorn_cannon')!;
    expect(four.combat!.range).toBeCloseTo(plain.combat!.range + reach.range! * 0.4, 9);
    expect(four.combat!.damage).toBeCloseTo(plain.combat!.damage * (1 - reach.damageCost! * 0.4), 9);
    expect(four.effect).toBeNull();
    const ten = sim(withTemper(b, { acorn_cannon: { reach: 10 } })).buildings.find((x) => x.type === 'acorn_cannon')!;
    expect(ten.effect).toEqual({ kind: 'counter_artillery', prefersBeyond: reach.prefersBeyond });
  });

  it('Blast: splash and slower fire', () => {
    const b = base();
    const plain = sim(b).buildings.find((x) => x.type === 'acorn_cannon')!;
    const blast = def.types.acorn_cannon.blast!;
    const t = sim(withTemper(b, { acorn_cannon: { blast: 10 } })).buildings.find((x) => x.type === 'acorn_cannon')!;
    expect(t.combat!.splashRadius).toBeCloseTo(blast.splashRadius!, 9);
    expect(t.combat!.fireIntervalTicks).toBe(Math.round(plain.combat!.fireIntervalTicks * (1 + blast.fireSlow!)));
    expect(t.combat!.damage).toBeCloseTo(plain.combat!.damage * (1 - blast.damageCost!), 9);
  });

  it('Watch: the base-wide effects scale with the mean temper of the base', () => {
    const b = base(12, 7);
    const plain = sim(b);
    const t = sim(withTemper(b, { acorn_cannon: { watch: 10 }, wasp_nest: { watch: 10 } }));
    const w = def.baseWide.watch!;
    const sky = (s: typeof plain) => s.buildings.find((x) => x.type === 'firefly_tower');
    if (sky(plain)?.combat) {
      expect(sky(t)!.combat!.damage).toBeCloseTo(sky(plain)!.combat!.damage * (1 + w.firefly_tower.damage!), 9);
      expect(sky(t)!.combat!.fireIntervalTicks).toBe(Math.max(1, Math.round(sky(plain)!.combat!.fireIntervalTicks * (1 - w.firefly_tower.fireFaster!))));
    }
    const half = sim(withTemper(b, { acorn_cannon: { watch: 10 } }));
    const p = baseProfile(withTemper(b, { acorn_cannon: { watch: 10 } }), data);
    expect(p.watch).toBeGreaterThan(0);
    expect(p.watch).toBeLessThan(1);
    if (sky(plain)?.combat) expect(sky(half)!.combat!.damage).toBeCloseTo(sky(plain)!.combat!.damage * (1 + w.firefly_tower.damage! * p.watch), 9);
  });

  it('a tempered battle replays to the same result', () => {
    const b = withTemper(base(10, 5), { acorn_cannon: { reach: 5, watch: 5 }, wasp_nest: { reach: 10 } });
    const setup: BattleSetup = { seed: 11, base: b, army: { wind_step_assassin: 20 }, levels: {} };
    const deps = Array.from({ length: 20 }, (_, i) => ({ tick: i, troop: 'wind_step_assassin', x: 1, y: 1 + i }));
    const a = runBattle(setup, deps, data).result;
    const c = runBattle(structuredClone(setup), deps, data).result;
    expect(c).toEqual(a);
  });
});

describe('the temper command', () => {
  function village(hall: number): VillageState {
    const { state } = newGame({ acorns: 1_000_000 });
    const s = atHall(state, hall);
    const kunai = (id: string, x: number) => ({ id, type: 'acorn_cannon', level: 3, x, y: 30, upgrade: null, collector: null });
    return { ...s, buildings: [...s.buildings, kunai('k1', 2), kunai('k2', 6)] };
  }

  it('is locked below the Keep', () => {
    const r = applyCommand(village(def.unlockKeep - 1), { type: 'temper', buildingType: 'acorn_cannon', temper: { reach: 5 } }, 0, data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCKED');
  });

  it('tempers every building of the type for a share of their Coins, with no builder', () => {
    const s = village(def.unlockKeep);
    let coins = 0;
    for (let l = 1; l <= 3; l++) coins += levelDef(data, 'acorn_cannon', l)!.cost.acorns ?? 0;
    const q = temperQuote(s, 'acorn_cannon', { reach: 5 }, data);
    expect(q).toEqual({ ok: true, cost: { acorns: Math.ceil(coins * 2 * def.retemperCostShare) } });
    const r = applyCommand(s, { type: 'temper', buildingType: 'acorn_cannon', temper: { reach: 5, blast: 0 } }, 0, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.buildings.filter((b) => b.type === 'acorn_cannon').map((b) => b.temper)).toEqual([{ reach: 5 }, { reach: 5 }]);
    expect(r.state.resources.acorns).toBe(s.resources.acorns - (q.ok ? q.cost.acorns! : 0));
    // No builder and no timer: nothing starts upgrading.
    expect(r.state.buildings.filter((b) => b.upgrade).length).toBe(s.buildings.filter((b) => b.upgrade).length);
    // The same temper again is refused; back to nothing removes the field (an untempered village hashes as before).
    expect(applyCommand(r.state, { type: 'temper', buildingType: 'acorn_cannon', temper: { reach: 5 } }, 0, data).ok).toBe(false);
    const back = applyCommand(r.state, { type: 'temper', buildingType: 'acorn_cannon', temper: {} }, 0, data);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.state.buildings.some((b) => 'temper' in b)).toBe(false);
      expect(economyHash({ ...back.state, resources: s.resources })).toBe(economyHash(s));
    }
  });

  it('refuses tempers the type cannot take and types that are not temperable', () => {
    const s = village(def.unlockKeep);
    expect(applyCommand(s, { type: 'temper', buildingType: 'acorn_cannon', temper: { reach: 11 } }, 0, data).ok).toBe(false);
    expect(applyCommand(s, { type: 'temper', buildingType: 'pinecone_catapult', temper: { reach: 1 } }, 0, data).ok).toBe(false);
    expect(applyCommand(s, { type: 'temper', buildingType: 'wasp_nest', temper: { reach: 1 } }, 0, data).ok).toBe(false);
  });
});

describe('saves', () => {
  it('a v20 save loads untempered, and a temper the rules do not allow is dropped', () => {
    const { state, clock } = newGame();
    const file = serialize(state, clock.now()) as unknown as { version: number; village: { buildings: Record<string, unknown>[] } };
    file.version = 20;
    file.village.buildings.push({ id: 'k9', type: 'acorn_cannon', level: 1, x: 2, y: 2, temper: { reach: 30 } });
    file.village.buildings.push({ id: 'k8', type: 'acorn_cannon', level: 1, x: 5, y: 2, temper: { watch: 4, reach: 0 } });
    const out = migrate(file, data);
    expect(out.version).toBe(21);
    const bs = out.village.buildings;
    expect(bs.find((b) => b.id === 'k9')!.temper).toBeUndefined();
    expect(bs.find((b) => b.id === 'k8')!.temper).toEqual({ watch: 4 });
  });
});

describe('scouting shows the shape of the base', () => {
  it('profile is zero untempered and names the leaning when tempered', () => {
    const b = base(10, 9);
    expect(scoutReport(b, data).profile).toEqual({ reach: 0, blast: 0, watch: 0 });
    const r = scoutReport(withTemper(b, { acorn_cannon: { blast: 10 }, wasp_nest: { watch: 10 } }), data);
    expect(r.profile.blast).toBeGreaterThan(0.3);
    expect(r.tips.join(' ')).toMatch(/Blast/);
  });
});

describe('rival outposts differ', () => {
  it('below the unlock Keep nothing is tempered; above it, each clan has its own temper', () => {
    expect(rivalTempers(1, def.unlockKeep - 1, 'iron_tide', [], data)).toBeNull();
    expect(rivalTempers(1, def.unlockKeep, 'iron_tide', [], data)).toEqual(def.rivals.iron_tide.tempers);
  });

  it('with recent armies, about the counter share of outposts answer their family', () => {
    const ranged = [{ moon_archer: 20 }].filter(() => Object.keys(data.troops).includes('moon_archer'));
    const army = ranged.length ? ranged : [Object.fromEntries([[Object.keys(data.troops).find((t) => !data.troops[t].air && data.troops[t].range >= 3.5)!, 20]])];
    expect(dominantFamily(army, data)).toBe('ranged');
    let counters = 0;
    for (let seed = 1; seed <= 400; seed++) if (JSON.stringify(rivalTempers(seed, 9, 'moon_veil', army, data)) === JSON.stringify(def.offers.counters.ranged)) counters++;
    expect(counters / 400).toBeGreaterThan(def.offers.counterShare - 0.1);
    expect(counters / 400).toBeLessThan(def.offers.counterShare + 0.1);
  });

  it('opponentForRank is deterministic and carries the tempers on the generated base', () => {
    const a = opponentForRank(77, 1500, 9, data, 0, []);
    const b = opponentForRank(77, 1500, 9, data, 0, []);
    expect(b).toEqual(a);
    const low = opponentForRank(77, 0, 2, data, 0, []);
    expect(low.buildings.some((x) => x.temper)).toBe(false);
  });
});
