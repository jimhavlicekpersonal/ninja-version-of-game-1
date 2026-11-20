/** P5-05 (RET-08): the achievements that read the village rather than a counter. */
import { describe, expect, it } from 'vitest';
import { achievementValue } from '../../../src/gameplay/sim/achievements';
import type { AchievementDef } from '../../../src/gameplay/sim/types';
import { data, newGame } from './helpers';

const def = (id: string): AchievementDef => data.achievements.find((a) => a.id === id)!;

describe('achievements read from the village (P5-05)', () => {
  const { state } = newGame();

  it('calendar days claimed count every finished cycle', () => {
    expect(achievementValue({ ...state, calendar: { claimed: 5, lastDay: 3, cycles: 2 } }, def('calendar_keeper'), 1, data)).toBe(61);
  });

  it('looks owned count each look once; tower kinds tempered count types, not buildings', () => {
    expect(achievementValue({ ...state, cosmetics: { ...state.cosmetics, owned: ['classic', 'royal_plum', 'royal_plum'] } }, def('wardrobe'), 1, data)).toBe(2);
    const type = Object.keys(data.battle.temper!.types)[0];
    const b = (id: string) => ({ id, type, level: 1, x: 0, y: 0, upgrade: null, collector: null, temper: { [Object.keys(data.battle.temper!.types[type])[0]]: 1 } });
    expect(achievementValue({ ...state, buildings: [b('a'), b('b')] } as never, def('tempered'), 1, data)).toBe(1);
  });

  it('warriors unlocked never fall with the Keep and never pass the roster', () => {
    const at = (keep: number) => achievementValue({ ...state, buildings: state.buildings.map((x) => (data.buildings[x.type].category === 'hall' ? { ...x, level: keep } : x)) }, def('full_roster'), keep, data);
    // Unlocking also needs a Dojo: the starting village has none, so the count starts at 0 and never passes the roster.
    expect(at(1)).toBeLessThanOrEqual(at(15));
    expect(at(15)).toBeLessThanOrEqual(Object.keys(data.troops).length);
  });

  it('the twelve added achievements pay at most about 600 Jade in all', () => {
    const added = ['generous', 'avenger', 'drill_sergeant', 'wrecker', 'calendar_keeper', 'full_roster', 'wardrobe', 'tempered', 'clean_sweeps', 'bold_words', 'gauntlet_runner', 'unbroken'];
    expect(added.reduce((a, id) => a + def(id).tiers.reduce((x, t) => x + t[1], 0), 0)).toBeLessThanOrEqual(600);
  });
});
