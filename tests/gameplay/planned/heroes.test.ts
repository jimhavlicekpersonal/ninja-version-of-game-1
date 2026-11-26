/**
 * Content batch 2026-11-14: the three non-live heroes (Iron Matriarch, Sky Admiral, Grand Sensei) and the
 * Rally "once per battle" flag (balance audit RM-3 design question).
 */
import { describe, expect, it } from 'vitest';
import { createBattle, deploy, step, type BattleSim } from '../../../src/gameplay/sim/battle/battle';
import { attackDamage, auraStrength } from '../../../src/gameplay/sim/battle/warriors';
import { defaultData } from '../../../src/gameplay/sim/data';
import { PREVIEW, previewHeroDef, previewHeroIds, withPreview } from '../../../src/gameplay/sim/plannedContent';
import { HEROES } from '../../../src/gameplay/sim/progression';
import type { BaseBuilding, BaseLayout } from '../../../src/gameplay/sim/battle/types';
import type { GameData } from '../../../src/gameplay/sim/types';

const P = withPreview(defaultData);
const b = (id: string, type: string, x: number, y: number, level = 1): BaseBuilding => ({ id, type, level, x, y });

function sim(hero: string, buildings: BaseBuilding[], army: Record<string, number>, data: GameData = P): BattleSim {
  const base: BaseLayout = { name: 'Hero arena', hallLevel: 15, buildings: [b('h', 'elder_toadstool', 40, 40), ...buildings] };
  return createBattle({ seed: 3, base, army, levels: {}, hero: { id: hero, level: 1 } }, data);
}
function place(s: BattleSim, troop: string, x: number, y: number): number {
  const before = s.troops.length;
  expect(deploy(s, { troop, x: 1, y: 1, tick: s.tick })).toBe(true);
  for (const t of s.troops.slice(before)) { t.x = t.px = x; t.y = t.py = y; }
  return before;
}
const shot = (s: BattleSim, ti: number, fromX: number, fromY: number, damage = 10) =>
  s.projectiles.push({ id: 5000 + s.projectiles.length + s.tick, kind: 'acorn', fromX, fromY, toX: s.troops[ti].x, toY: s.troops[ti].y, total: 1, left: 1, damage, splash: 0, targetTroop: ti, targetBuilding: -1, hitsAir: true, hitsGround: true, arc: false, sourceBuilding: 1 });

describe('the heroes (SIM_RULES 10: the Iron Matriarch and the Sky Admiral are live, the Grand Sensei planned)', () => {
  it('the live two are in the shipped data; the Grand Sensei is added only by withPreview', () => {
    for (const id of ['iron_matriarch', 'sky_admiral']) expect(defaultData.battle.heroes?.[id]).toBeDefined();
    expect(defaultData.battle.heroes?.grand_sensei).toBeUndefined();
    expect(P.battle.heroes?.grand_sensei).toBeDefined();
    expect(previewHeroIds()).toEqual(['grand_sensei']);
  });

  it('the live two keep the derivation, with their tuned factors (Bell Warden x12 HP; Lantern Balloon x40 HP, x7 damage)', () => {
    const live: Record<string, { ref: string; hpPerHousing: number; damagePerHousing: number }> = {
      iron_matriarch: { ref: 'bell_warden', hpPerHousing: 12, damagePerHousing: 3 },
      sky_admiral: { ref: 'lantern_balloon', hpPerHousing: 40, damagePerHousing: 7 },
    };
    for (const [id, spec] of Object.entries(live)) {
      PREVIEW.heroes[id] = { ...spec, kit: {} };
      try {
        const derived = previewHeroDef(id, defaultData).levels.map((l) => [l.hp, l.damage]);
        expect(derived, id).toEqual(defaultData.battle.heroes![id].levels.map((l) => [l.hp, l.damage]));
      } finally {
        delete PREVIEW.heroes[id];
      }
    }
  });

  it('follow the Shadow Captain\'s derivation (tier-3 warrior of the role at the Keep\'s cap, per housing, HP x10, damage x3)', () => {
    // The rule reproduces the live Shadow Captain exactly from the Wind-Step Assassin.
    const spec = { ref: 'wind_step_assassin', hpPerHousing: 10, damagePerHousing: 3, kit: {} };
    const was = PREVIEW.heroes.shadow_captain;
    PREVIEW.heroes.shadow_captain = spec;
    try {
      const derived = previewHeroDef('shadow_captain', defaultData).levels.map((l) => [l.hp, l.damage]);
      expect(derived).toEqual(defaultData.battle.heroes!.shadow_captain.levels.map((l) => [l.hp, l.damage]));
    } finally {
      if (was) PREVIEW.heroes.shadow_captain = was;
      else delete PREVIEW.heroes.shadow_captain;
    }
    for (const h of HEROES.filter((x) => PREVIEW.heroes[x.id])) {
      const def = P.battle.heroes![h.id];
      expect(def.unlockKeep).toBe(h.unlockKeep);
      expect(def.levels).toHaveLength(P.hall.levels.length - h.unlockKeep + 1);
      expect(def.housing).toBe(0);
      expect(def.name).toBe(h.name);
    }
  });
});

describe('Iron Matriarch: Bulwark (live, SIM_RULES 10)', () => {
  it('on her first hit, every warrior on the field takes 60% less defense fire for 20 s, from any side, once per battle', () => {
    const s = sim('iron_matriarch', [b('k', 'acorn_cannon', 20, 10)], { iron_matriarch: 1, beetle_brute: 1 }, defaultData);
    expect(defaultData.battle.heroes!.iron_matriarch.kit).toMatchObject({ radius: 99, strength: 0.6, durationTicks: 200, coneCos: -1 });
    s.buildings[1].combat = null;
    const m = place(s, 'iron_matriarch', 18.5, 11.5);
    const ally = place(s, 'beetle_brute', 18, 12);
    const raised = s.tick;
    attackDamage(s, s.troops[m], s.buildings[1]);
    expect(s.troops[m].bulwarkUntil).toBe(raised + 200);
    const t = s.troops[ally];
    let hp = t.hp;
    shot(s, ally, 21.5, 11.5); // from in front (the tower's side)
    step(s);
    expect(hp - t.hp).toBeCloseTo(10 * (1 - 0.6), 6);
    hp = t.hp;
    shot(s, ally, 10, 12); // from behind: the field-wide wall covers every side now
    step(s);
    expect(hp - t.hp).toBeCloseTo(10 * (1 - 0.6), 6);
    // Once per battle: a second first hit does not start another.
    const until = s.troops[m].bulwarkUntil;
    s.troops[m].firstHit = true;
    attackDamage(s, s.troops[m], s.buildings[1]);
    expect(s.troops[m].bulwarkUntil).toBe(until);
  });
});

describe('Sky Admiral: Squall (live, SIM_RULES 10)', () => {
  // The cut is the kit's strength (0.85) for flyers and strength x groundShare (0.4) for ground warriors, 30 s.
  it('pushes every flyer toward its target, cuts defense damage to flyers by the strength and to ground warriors by its ground share', () => {
    const s = sim('sky_admiral', [b('k', 'firefly_tower', 20, 10)], { sky_admiral: 1, owl_bomber: 1, beetle_brute: 1 }, defaultData);
    const kit = defaultData.battle.heroes!.sky_admiral.kit!;
    expect(kit).toMatchObject({ strength: 0.85, durationTicks: 300, pushTiles: 3, groundShare: 0.4 });
    s.buildings[1].combat = null;
    const admiral = place(s, 'sky_admiral', 19, 11);
    const kite = place(s, 'owl_bomber', 10, 11);
    const ground = place(s, 'beetle_brute', 18, 12);
    s.troops[kite].target = 1;
    attackDamage(s, s.troops[admiral], s.buildings[1]);
    expect(s.troops[kite].x).toBeCloseTo(13, 6);
    // Ground warriors are sheltered too (no push).
    expect(s.troops[ground].squallUntil).toBeGreaterThan(s.tick);
    expect(s.troops[ground].x).toBeCloseTo(18, 6);
    const t = s.troops[kite];
    t.stunnedUntil = 1e9;
    const hp = t.hp;
    shot(s, kite, 21, 11);
    step(s);
    expect(hp - t.hp).toBeCloseTo(10 * (1 - kit.strength!), 6);
    const g = s.troops[ground];
    const hg = g.hp;
    shot(s, ground, 21, 11);
    step(s);
    expect(hg - g.hp).toBeCloseTo(10 * (1 - kit.strength! * kit.groundShare!), 6);
  });
});

describe('Grand Sensei: Inner Calm', () => {
  it('heals every warrior 40% and lets each ignore its next splash hit or trap', () => {
    const s = sim('grand_sensei', [b('k', 'acorn_cannon', 20, 10), b('trap', 'thorn_snare', 30, 30)], { grand_sensei: 1, beetle_brute: 2 });
    s.buildings[1].combat = null;
    const sensei = place(s, 'grand_sensei', 18, 11);
    const a = place(s, 'beetle_brute', 18, 12);
    const c = place(s, 'beetle_brute', 30.5, 30.5);
    const ta = s.troops[a];
    ta.hp = ta.maxHp / 2;
    attackDamage(s, s.troops[sensei], s.buildings[1]);
    expect(ta.hp).toBeCloseTo(ta.maxHp * 0.9, 6);
    expect(ta.calm).toBe(true);
    // The Spike Pit under the other one goes off and does nothing to it.
    const hc = s.troops[c].hp;
    s.troops[c].stunnedUntil = 1e9;
    ta.stunnedUntil = 1e9;
    step(s);
    expect(s.buildings[2].destroyed).toBe(true);
    expect(s.troops[c].hp).toBe(hc);
    expect(s.troops[c].calm).toBe(false);
  });
});

describe('Rally: once per battle or on every target (RM-3 flag)', () => {
  const rallies = (data: GameData) => {
    const s = createBattle({ seed: 3, base: { name: 'r', hallLevel: 15, buildings: [b('h', 'elder_toadstool', 40, 40), b('k', 'acorn_cannon', 20, 10), b('k2', 'acorn_cannon', 25, 10)] }, army: {}, levels: {}, hero: { id: 'shadow_captain', level: 1 } }, data);
    const cap = place(s, 'shadow_captain', 19, 11);
    const t = s.troops[cap];
    attackDamage(s, t, s.buildings[1]);
    const first = t.rallyUntil;
    s.tick += 200;
    t.firstHit = true; // a new target, as stepTroop does
    attackDamage(s, t, s.buildings[2]);
    return { first, second: t.rallyUntil };
  };
  // P4-02 (CMB-05, SIM_RULES 8, restated): the shipped Rally is once per battle; without the flag it re-arms.
  it('re-arms on every new target without the flag', () => {
    const data = structuredClone(defaultData);
    delete data.battle.heroes!.shadow_captain.kit!.oncePerBattle;
    const r = rallies(data);
    expect(r.second).toBeGreaterThan(r.first!);
  });
  it('fires only once with kit.oncePerBattle', () => {
    const data = structuredClone(defaultData);
    data.battle.heroes!.shadow_captain.kit!.oncePerBattle = true;
    const r = rallies(data);
    expect(r.second).toBe(r.first);
  });
  it('a Rally lasts its 15 seconds even if the Captain falls (Phase 4 review #10, as the card says)', () => {
    const s = createBattle({ seed: 3, base: { name: 'r', hallLevel: 15, buildings: [b('h', 'elder_toadstool', 40, 40), b('k', 'acorn_cannon', 20, 10)] }, army: { beetle_brute: 1 }, levels: {}, hero: { id: 'shadow_captain', level: 1 } }, defaultData);
    const cap = place(s, 'shadow_captain', 19, 11);
    const ally = place(s, 'beetle_brute', 18, 12);
    attackDamage(s, s.troops[cap], s.buildings[1]);
    const strength = defaultData.battle.heroes!.shadow_captain.kit!.strength!;
    expect(auraStrength(s, s.troops[ally], 'rally')).toBe(strength);
    s.troops[cap].dead = true;
    s.troops[cap].hp = 0;
    expect(auraStrength(s, s.troops[ally], 'rally')).toBe(strength);
    s.tick = s.troops[cap].rallyUntil!;
    expect(auraStrength(s, s.troops[ally], 'rally')).toBe(0);
  });
  it('the shipped data sets the flag (P4-02): once per battle, as the text says', () => {
    expect(defaultData.battle.heroes!.shadow_captain.kit!.oncePerBattle).toBe(true);
    expect(rallies(defaultData).second).toBe(rallies(defaultData).first);
  });
});
