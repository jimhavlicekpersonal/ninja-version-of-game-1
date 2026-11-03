/** The 50 warrior classes: each ability is unique in name and in mechanic, with sane numbers. */
import { describe, expect, it } from 'vitest';
import { WARRIORS } from '../../../src/gameplay/sim/progression';

describe('50 warrior classes, 50 unique abilities', () => {
  it('every ability id, name and effect kind is unique', () => {
    expect(WARRIORS).toHaveLength(50);
    for (const key of [(w: (typeof WARRIORS)[number]) => w.ability.id, (w: (typeof WARRIORS)[number]) => w.ability.name, (w: (typeof WARRIORS)[number]) => w.ability.effect.kind]) {
      expect(new Set(WARRIORS.map(key)).size).toBe(WARRIORS.length);
    }
  });

  it('effect numbers are positive and percentages stay within 0-1', () => {
    for (const w of WARRIORS) {
      for (const [k, v] of Object.entries(w.ability.effect)) {
        if (typeof v !== 'number') continue;
        expect(v, `${w.id}.${k}`).toBeGreaterThan(0);
        if (/Pct$|^pct$/.test(k)) expect(v, `${w.id}.${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the middle tier is the ridiculous one: every tier-3 Veteran, nothing else', () => {
    for (const w of WARRIORS) expect(Boolean(w.ridiculous), w.id).toBe(w.tier === 3);
  });

  it('live warriors keep their original abilities', () => {
    const live = Object.fromEntries(WARRIORS.filter((w) => w.liveTroop).map((w) => [w.id, w.ability.id]));
    expect(live).toEqual({ shinobi: 'swift_strike', kunai_adept: 'kunai_volley', armored_guardian: 'stand_firm', saboteur: 'sabotage', tunnel_runner: 'tunnel', kite_raider: 'firebomb' });
  });
});
