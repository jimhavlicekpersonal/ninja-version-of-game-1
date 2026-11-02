import { describe, expect, it } from 'vitest';
import { data } from './helpers';
import { RESOURCE_KINDS } from '../../src/sim/types';

describe('balance data', () => {
  it('includes the village, army and defense buildings', () => {
    for (const t of ['acorn_orchard', 'acorn_silo', 'beaver_lodge', 'dew_cistern', 'dewdrop_well', 'elder_toadstool',
      'burrow_barracks', 'army_camp', 'acorn_cannon', 'pinecone_catapult', 'wasp_nest', 'firefly_tower', 'bramble_hedge']) {
      expect(data.buildings[t], t).toBeDefined();
    }
  });

  it('building footprints are 2x2 to 4x4; hedges are 1x1', () => {
    for (const def of Object.values(data.buildings)) {
      if (def.category === 'hedge' || def.category === 'trap' || def.category === 'decor') {
        expect(def.size).toBeLessThanOrEqual(2);
        continue;
      }
      expect(def.size).toBeGreaterThanOrEqual(2);
      expect(def.size).toBeLessThanOrEqual(4);
    }
  });

  it('levels are numbered 1..n with costs in known resources', () => {
    for (const def of Object.values(data.buildings)) {
      def.levels.forEach((l, i) => {
        expect(l.level).toBe(i + 1);
        for (const k of Object.keys(l.cost)) expect(RESOURCE_KINDS).toContain(k);
      });
    }
  });

  it('collectors and storage start at 10 seconds', () => {
    for (const def of Object.values(data.buildings)) {
      if (def.category === 'collector' || def.category === 'storage') expect(def.levels[0].buildSeconds).toBe(10);
    }
  });

  it('timed buildings get ~2.2x longer each level', () => {
    for (const def of Object.values(data.buildings)) {
      if (!def.inShop || def.levels[0].buildSeconds === 0 || def.levels.length < 3) continue;
      const ratios: number[] = [];
      for (let i = 1; i < def.levels.length; i++) {
        const r = def.levels[i].buildSeconds / def.levels[i - 1].buildSeconds;
        expect(r).toBeGreaterThan(1.8);
        expect(r).toBeLessThan(2.7);
        ratios.push(r);
      }
      const geoMean = Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length);
      expect(geoMean).toBeGreaterThan(2.0);
      expect(geoMean).toBeLessThan(2.4);
    }
  });

  it('collectors produce more per level and storage holds more per level', () => {
    for (const def of Object.values(data.buildings)) {
      for (let i = 1; i < def.levels.length; i++) {
        if (def.category === 'collector') {
          expect(def.levels[i].ratePerHour!).toBeGreaterThan(def.levels[i - 1].ratePerHour!);
        }
        if (def.category === 'storage') {
          const prev = Object.values(def.levels[i - 1].storage!)[0]!;
          const cur = Object.values(def.levels[i].storage!)[0]!;
          expect(cur).toBeGreaterThan(prev);
        }
      }
    }
  });

  it('hall limits only reference real buildings and never exceed defined levels', () => {
    for (const hl of data.hall.levels) {
      for (const [type, lim] of Object.entries(hl.limits)) {
        const def = data.buildings[type];
        expect(def, type).toBeDefined();
        expect(lim.maxLevel).toBeLessThanOrEqual(def.levels.length);
      }
    }
    expect(data.hall.levels.length).toBe(data.buildings.elder_toadstool.levels.length);
  });

  it('every hall upgrade is affordable with the storage available at the level before', () => {
    // Max storage at hall level L must cover the cost of hall level L+1.
    const hall = data.buildings.elder_toadstool;
    for (let L = 1; L < hall.levels.length; L++) {
      const limits = data.hall.levels[L - 1].limits;
      let cap = hall.levels[L - 1].storage!.acorns!;
      const silo = data.buildings.acorn_silo;
      cap += limits.acorn_silo.count * silo.levels[limits.acorn_silo.maxLevel - 1].storage!.acorns!;
      expect(cap, `hall ${L}`).toBeGreaterThanOrEqual(hall.levels[L].cost.acorns!);
    }
  });

  it('starting layout fits on the map', () => {
    const { mapSize, startingLayout } = data.economy;
    for (const b of startingLayout) {
      const size = data.buildings[b.type].size;
      expect(b.x + size).toBeLessThanOrEqual(mapSize);
      expect(b.y + size).toBeLessThanOrEqual(mapSize);
    }
  });
});
