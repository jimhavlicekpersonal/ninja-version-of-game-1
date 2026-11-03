/** The 50 warrior classes: each ability is unique and every class is playable with its own troop. */
import { describe, expect, it } from 'vitest';
import { WARRIORS } from '../../../src/gameplay/sim/progression';
import { defaultData } from '../../../src/gameplay/sim/data';

describe('50 warrior classes, 50 unique abilities', () => {
  it('every ability id and name is unique', () => {
    expect(WARRIORS).toHaveLength(50);
    expect(new Set(WARRIORS.map((w) => w.ability.id)).size).toBe(50);
    expect(new Set(WARRIORS.map((w) => w.ability.name)).size).toBe(50);
  });

  it('every class maps to its own troop', () => {
    const troops = WARRIORS.map((w) => w.liveTroop);
    for (const t of troops) expect(t && defaultData.troops[t], String(t)).toBeTruthy();
    expect(new Set(troops).size).toBe(50);
  });
});
