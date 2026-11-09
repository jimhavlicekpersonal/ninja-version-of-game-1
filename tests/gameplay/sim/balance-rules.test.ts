/**
 * Balance audit 2026-11-08 rule fixes (docs/audit/BALANCE_AUDIT_2026-11-08.md):
 * LD-1 matchmaking strength is weighted by the army that fights (the training queue no longer dilutes it);
 * DZ-3 a battle where no warrior was deployed (only the free clan hero) is practice.
 */
import { describe, expect, it } from 'vitest';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { heroAtKeep } from '../../../src/gameplay/sim/heroes';
import { attackerStrength } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, foughtWithWarriors } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

function atHall(state: VillageState, hall: number): VillageState {
  return { ...state, buildings: state.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: hall } : b)) };
}

describe('matchmaking strength counts the army that fights (LD-1)', () => {
  const v = atHall(newGame().state, 12);
  const army = { moonblade_master: 117, chain_sickle_reaper: 78, mountain_shield: 18, fuse_master: 15 };
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(12, data, t)]));
  const honest: VillageState = { ...v, army, research: { levels, active: [] } };
  const old = Object.keys(data.troops).filter((t) => (data.troops[t].unlockKeep ?? 1) <= 12 && !(t in army));

  it('queuing one level-1 copy of every old warrior does not lower strength', () => {
    const queued: VillageState = { ...honest, training: old.map((t, i) => ({ troop: t, startedAt: 0, endsAt: 1000 + i, cost: {} })) };
    expect(attackerStrength(honest, data)).toBeCloseTo(12, 5);
    expect(attackerStrength(queued, data)).toBeCloseTo(12, 5);
  });

  it('one weak unit of each old type in the camps moves strength by little, not a Keep', () => {
    const diluted: VillageState = { ...honest, army: { ...army, ...Object.fromEntries(old.slice(0, 10).map((t) => [t, 1])) } };
    expect(attackerStrength(diluted, data)).toBeGreaterThan(11.6);
  });

  it('with no army ready, the training queue still sets it, and with nothing at all the unlocked roster does', () => {
    const queueOnly: VillageState = { ...honest, army: {}, training: [{ troop: 'moonblade_master', startedAt: 0, endsAt: 1000, cost: {} }] };
    expect(attackerStrength(queueOnly, data)).toBeCloseTo(12, 5);
    expect(Number.isFinite(attackerStrength({ ...honest, army: {}, training: [] }, data))).toBe(true);
  });
});

describe('a battle with only the hero is practice (DZ-3)', () => {
  it('banks nothing, moves no honor and keeps the shield', () => {
    const { state, clock } = newGame();
    const s: VillageState = { ...atHall(state, 9), trophies: 500, shieldUntil: clock.now() + 3_600_000, army: { wind_step_assassin: 5 } };
    const hero = heroAtKeep(9, data)!;
    const base = generateOpponent(77, 9, data, { levelBias: 0.5 });
    const setup = { seed: 5, base, army: s.army, levels: {}, infiltration: true, hero };
    const r = applyCommand(s, { type: 'battleEnd', record: { at: clock.now(), opponentName: 'x', setup, deployments: [{ tick: 0, troop: hero.id, x: 0, y: 0 }] } }, clock.now(), data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = r.state.battleLog[r.state.battleLog.length - 1];
    expect(rec.rejected).toBe('no_warriors');
    expect(rec.banked).toEqual({});
    expect(r.state.trophies).toBe(500);
    expect(r.state.resources.acorns).toBe(s.resources.acorns);
    expect(r.state.shieldUntil).toBe(s.shieldUntil);
    expect(r.state.army).toEqual(s.army);
  });

  it('foughtWithWarriors ignores the hero only', () => {
    expect(foughtWithWarriors({ used: { shadow_captain: 1 } }, { hero: { id: 'shadow_captain', level: 1 } })).toBe(false);
    expect(foughtWithWarriors({ used: { shadow_captain: 1, hedgehog_roller: 1 } }, { hero: { id: 'shadow_captain', level: 1 } })).toBe(true);
    expect(foughtWithWarriors({ used: {} }, {})).toBe(false);
  });
});
