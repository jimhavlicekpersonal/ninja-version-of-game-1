/**
 * The battle info popup: deploy-bar cards show their warrior's stats, enemy
 * buildings show their name only (never level or hidden stats), and hidden
 * traps say nothing. Warriors already on the field have no popup.
 */
import { describe, expect, it } from 'vitest';
import { createBattle, deploy, type BattleSim } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data, troopLevel } from '../../../src/gameplay/sim/data';
import type { BaseBuilding } from '../../../src/gameplay/sim/battle/types';
import { buildingInfo, cardInfo, hpLabel, inspectInfo } from '../../../src/presentation/ui/battleInfo';

const base: BaseBuilding[] = [
  { id: 'h', type: 'elder_toadstool', level: 3, x: 30, y: 30 },
  { id: 'c', type: 'acorn_cannon', level: 4, x: 20, y: 20 },
  { id: 't', type: 'thorn_snare', level: 2, x: 24, y: 24 },
];

function battle(army: Record<string, number>, extra: Partial<Parameters<typeof createBattle>[0]> = {}): BattleSim {
  return createBattle({ seed: 3, base: { name: 'Info arena', hallLevel: 6, buildings: base }, army, levels: { hedgehog_roller: 3 }, ...extra }, data);
}

describe('battle info popup', () => {
  it('an enemy building shows its name and nothing else', () => {
    const sim = battle({ hedgehog_roller: 5 });
    const info = buildingInfo(sim, 1);
    expect(info).toEqual({ kind: 'building', name: data.buildings.acorn_cannon.name });
    // No level, hit points or damage anywhere in what the popup gets.
    expect(JSON.stringify(info)).not.toMatch(/level|hp|damage|range/i);
  });

  it('a hidden trap and rubble say nothing', () => {
    const sim = battle({ hedgehog_roller: 5 });
    expect(sim.buildings[2].hidden).toBe(true);
    expect(buildingInfo(sim, 2)).toBeNull();
    sim.buildings[1].destroyed = true;
    expect(buildingInfo(sim, 1)).toBeNull();
    expect(buildingInfo(sim, 99)).toBeNull();
  });

  it('a deploy-bar card shows the warrior at the level it will fight at', () => {
    const sim = battle({ hedgehog_roller: 5 });
    const info = cardInfo(sim, 'hedgehog_roller');
    const def = data.troops.hedgehog_roller;
    const lvl = troopLevel(data, 'hedgehog_roller', 3);
    expect(info).toMatchObject({ kind: 'warrior', name: def.name, level: 3, hp: lvl.hp, left: 5, description: def.description, flies: false });
    expect(inspectInfo(sim, { kind: 'card', type: 'hedgehog_roller' })).toEqual(info);
    if (info?.kind !== 'warrior') throw new Error('expected a warrior');
    expect(info.dps).toBeCloseTo((lvl.damage * data.battle.ticksPerSecond) / def.attackIntervalTicks, 0);
    expect(info.role).toMatch(/tier \d/);
    expect(info.ability?.name).toBeTruthy();
  });

  it('donated warriors come out first, so the card shows their level until they are sent', () => {
    const sim = battle({ hedgehog_roller: 5 }, { reinforcements: { hedgehog_roller: { count: 1, level: 5 } } });
    const first = cardInfo(sim, 'hedgehog_roller');
    expect(first).toMatchObject({ level: 5, donated: { count: 1, level: 5 } });
    expect(deploy(sim, { tick: 0, troop: 'hedgehog_roller', x: 1, y: 1 })).toBe(true);
    expect(cardInfo(sim, 'hedgehog_roller')).toMatchObject({ level: 3, left: 4 });
    expect((cardInfo(sim, 'hedgehog_roller') as { donated?: unknown }).donated).toBeUndefined();
  });

  it('Smoke Bomb shows its rule and charges left', () => {
    const sim = battle({ hedgehog_roller: 40 });
    const info = cardInfo(sim, 'smoke_bomb');
    expect(info).toEqual({ kind: 'tactic', name: data.battle.abilities.smoke_bomb.name, description: data.battle.abilities.smoke_bomb.description, left: sim.charges.smoke_bomb });
  });

  it('the health bar number is the hit points left, never 0 on a standing building', () => {
    expect(hpLabel(0.3)).toBe('1');
    expect(hpLabel(1234.2)).toBe('1,235');
    expect(hpLabel(-4)).toBe('0');
  });
});
