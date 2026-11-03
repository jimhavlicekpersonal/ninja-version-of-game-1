/**
 * The 20 planned buildings designed against the 50 warriors. Rock-paper-scissors
 * rules: every building beats some warriors and is beaten by others, every
 * warrior has a building it fears and a building it beats, counters are soft,
 * and nothing arrives without an answer.
 */
import { describe, expect, it } from 'vitest';
import { BUILDINGS, WARRIORS, warriorUnlockKeep } from '../../../src/gameplay/sim/progression';
import { defaultData } from '../../../src/gameplay/sim/data';

const data = defaultData;
const designed = BUILDINGS.filter((b) => b.counters);
const byId = new Map(WARRIORS.map((w) => [w.id, w]));
const unlock = (id: string) => warriorUnlockKeep(byId.get(id)!, data);

describe('buildings designed against the ninja roster', () => {
  it('20 of them, each with a unique effect kind', () => {
    expect(designed).toHaveLength(20);
    expect(new Set(designed.map((b) => b.effect!.kind)).size).toBe(20);
  });

  it('each beats 2-4 warriors from at least 2 roles and is beaten by 2-4 others', () => {
    for (const b of designed) {
      for (const list of [b.counters!, b.counteredBy!]) {
        expect(list.length, b.id).toBeGreaterThanOrEqual(2);
        expect(list.length, b.id).toBeLessThanOrEqual(4);
        for (const id of list) expect(byId.has(id), `${b.id}: ${id}`).toBe(true);
      }
      expect(new Set(b.counters!.map((id) => byId.get(id)!.role)).size, b.id).toBeGreaterThanOrEqual(2);
      expect(b.counters!.filter((id) => b.counteredBy!.includes(id)), b.id).toEqual([]);
    }
  });

  it('every warrior has a building it fears and a building it beats', () => {
    for (const w of WARRIORS) {
      expect(designed.some((b) => b.counters!.includes(w.id)), `${w.id} is never countered`).toBe(true);
      expect(designed.some((b) => b.counteredBy!.includes(w.id)), `${w.id} beats no building`).toBe(true);
    }
  });

  it('no warrior is hard-countered by a pile of buildings (at most 2)', () => {
    for (const w of WARRIORS) expect(designed.filter((b) => b.counters!.includes(w.id)).length, w.id).toBeLessThanOrEqual(2);
  });

  it('counters are soft: percentages at most 50%, disables at most 3 seconds', () => {
    for (const b of designed) {
      for (const [k, v] of Object.entries(b.effect!)) {
        if (typeof v !== 'number') continue;
        expect(v, `${b.id}.${k}`).toBeGreaterThan(0);
        if (/Pct$|^pct$|PctPerSecond$|Damp$/.test(k)) expect(v, `${b.id}.${k}`).toBeLessThanOrEqual(0.5);
        if (/^(stun)?[sS]econds$|stunSeconds/.test(k)) expect(v, `${b.id}.${k}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('a new building always has an answer already in the field when it unlocks', () => {
    for (const b of designed) expect(Math.min(...b.counteredBy!.map(unlock)), b.id).toBeLessThanOrEqual(b.unlockKeep);
  });

  it('new warrior classes (Keep 4+) get a counter within 3 Keep levels, so no ability runs unanswered', () => {
    for (const w of WARRIORS) {
      const k = unlock(w.id);
      if (k < 4) continue; // Keep 1-3 warriors are answered by the live defenses.
      const first = Math.min(...designed.filter((b) => b.counters!.includes(w.id)).map((b) => b.unlockKeep));
      expect(first - k, `${w.id} (Keep ${k}) first countered at Keep ${first}`).toBeLessThanOrEqual(3);
    }
  });
});
