/**
 * Art re-audit checks: every building level looks different from the one before it, the Keep and
 * defenses have 5+ tiers, every roster warrior has a role-silhouette battle sprite that matches its
 * badge, and the HUD art (chest, portrait) is well-formed. Drawing calls are recorded with a fake
 * 2D context (no browser in `npm test`).
 */
import { describe, expect, it } from 'vitest';
import roster from '../../../src/gameplay/data/roster.json';
import buildings from '../../../src/gameplay/data/buildings.json';
import { KAMON, buildingPainters, kamon, levelInfo, paintBuildingLevel, tierFor, troopArt } from '../../../src/presentation/art/ninja';
import { ROLE_RING, roleOfTroop, warriorSpriteArt } from '../../../src/presentation/art/warriorIcons';
import { chestSvg } from '../../../src/presentation/art/chest';
import { SENSEI_EXPRESSIONS, senseiPortrait } from '../../../src/presentation/art/portraits';

function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const gradient = { addColorStop: (o: number, c: string) => log.push(`stop ${o} ${c}`) };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return (...a: number[]) => (log.push(`${prop} ${a.map((n) => n.toFixed(2)).join(',')}`), gradient);
      return (...a: unknown[]) => log.push(`${prop} ${a.map((n) => (typeof n === 'number' ? n.toFixed(2) : String(n))).join(',')}`);
    },
    set(_t, prop: string, v) {
      target[prop] = v;
      log.push(`${prop}=${typeof v === 'object' ? 'gradient' : String(v)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

const defs = buildings as unknown as Record<string, { size: number; levels: unknown[] }>;
const DEFENSES = ['acorn_cannon', 'pinecone_catapult', 'wasp_nest', 'firefly_tower', 'kite_cutter_ballista', 'longbow_yagura'];

describe('building levels', () => {
  it('the Keep has six looks and every defense five', () => {
    const keepMax = defs.elder_toadstool.levels.length;
    expect(levelInfo('elder_toadstool', keepMax, keepMax).tiers).toBe(6);
    expect(tierFor(1, keepMax, 'elder_toadstool')).toBe(1);
    // The old thirds kept Keep levels 1-5 identical; now level 3 is already a new look.
    expect(tierFor(3, keepMax, 'elder_toadstool')).toBe(2);
    for (const d of DEFENSES) {
      const max = defs[d].levels.length;
      expect(levelInfo(d, max, max).tiers, d).toBe(5);
    }
    // Without a type, tierFor keeps the legacy thirds (real art keys .t1-.t3).
    expect(tierFor(keepMax, keepMax)).toBe(3);
  });

  it('every level of every painted building draws a different picture from the level below', () => {
    for (const [type, def] of Object.entries(defs)) {
      if (!buildingPainters[type] || def.levels.length < 2) continue;
      let prev = '';
      for (let lvl = 1; lvl <= def.levels.length; lvl++) {
        const { ctx, log } = recorder();
        paintBuildingLevel(ctx, type, def.size, lvl, def.levels.length);
        const sig = log.join('\n');
        expect(sig === prev, `${type} level ${lvl} looks like level ${lvl - 1}`).toBe(false);
        prev = sig;
      }
    }
  });

  it('the kamon set draws seven different crests', () => {
    const sigs = KAMON.map((k) => {
      const { ctx, log } = recorder();
      kamon(ctx, k, 0, 0, 10, '#26303d');
      return log.join('\n');
    });
    expect(new Set(sigs).size).toBe(KAMON.length);
  });
});

describe('warrior battle sprites', () => {
  const LIVE: Record<string, string> = { shinobi: 'hedgehog_roller', kunai_adept: 'frog_lobber', armored_guardian: 'beetle_brute', tunnel_runner: 'mole_digger', kite_raider: 'owl_bomber' };

  it('every roster warrior has a sprite under its live troop id, with its role', () => {
    for (const w of roster.warriors) {
      const id = (w as { liveTroop?: string }).liveTroop ?? w.id;
      expect(LIVE[w.id] ?? w.id, w.id).toBe(id);
      expect(warriorSpriteArt[id], id).toBeDefined();
      expect(troopArt[id], id).toBe(warriorSpriteArt[id]);
      expect(roleOfTroop(id), id).toBe(w.role);
      expect(ROLE_RING[w.role], w.role).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(roleOfTroop('hound_handler.companion')).toBe('beast');
  });

  it('strong warriors are drawn larger and all 50 sprites differ', () => {
    const seen = new Set<string>();
    for (const w of roster.warriors) {
      const id = (w as { liveTroop?: string }).liveTroop ?? w.id;
      const art = warriorSpriteArt[id];
      if (w.tier >= 4 && w.role !== 'guardian') expect(art.w, id).toBeGreaterThan(64);
      const { ctx, log } = recorder();
      art.paint(ctx);
      seen.add(log.join('\n'));
    }
    expect(seen.size).toBe(roster.warriors.length);
  });

  it('role colours are all different', () => {
    const colours = Object.values(ROLE_RING);
    expect(new Set(colours).size).toBe(colours.length);
  });
});

describe('HUD art', () => {
  it('chest and portraits are SVGs with ids unique per copy', () => {
    for (const svg of [chestSvg('closed'), chestSvg('open'), ...SENSEI_EXPRESSIONS.map((e) => senseiPortrait(e))]) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
    }
    const ids = (s: string) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const a = ids(chestSvg('closed'));
    const b = ids(chestSvg('closed'));
    expect(a.length).toBeGreaterThan(0);
    expect(a.some((x) => b.includes(x))).toBe(false);
    expect(new Set(SENSEI_EXPRESSIONS.map((e) => senseiPortrait(e).replace(/kgs\d+/g, ''))).size).toBe(SENSEI_EXPRESSIONS.length);
  });
});
