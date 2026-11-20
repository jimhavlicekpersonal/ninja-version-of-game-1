import { defaultData as data, B, LAYOUTS, generateOpponent, temperBase, botArmy, heroAtKeep, levelsFor, planFrom, run, triples, mean, armyFrom, housingOf } from './common.ts';
// Army panel x temper profile: mean over sides and best side. argv: keep, part (0/1), nSides
const keep = Number(process.argv[2] ?? 15); const part = process.argv[3] ?? 'all'; const nSides = Number(process.argv[4] ?? 3);
const P: Record<number, Record<string, Record<string, number>>> = {
  15: {
    botmix: botArmy(15, 1, data),
    best_found: { thousand_needle: 132, storm_sovereign: 56, chain_sickle_reaper: 36, oni_breaker: 13, gearbreaker: 18, iron_monk: 7 },
    eclipse: { eclipse_ninja: 180 },
    kites: { dragon_kite_armada: 90 },
    needles_oni: armyFrom({ thousand_needle: 0.7, oni_breaker: 0.3 }, 15),
    tanks_heal: armyFrom({ oni_breaker: 0.5, sage_of_clouds: 0.25, spirit_caller: 0.25 }, 15),
    siege_blades: armyFrom({ volcano_cannoneer: 0.5, storm_sovereign: 0.5 }, 15),
    blades: { storm_sovereign: 360 },
    beasts: { tiger_lord: 120 },
    phantoms: { phantom_gate: 180 },
  },
  12: {
    botmix: botArmy(12, 1, data),
    best_found: { chain_sickle_reaper: 67, moonblade_master: 54, blowgun_hunter: 30, mountain_shield: 18, iron_monk: 6, gearbreaker: 7, spirit_caller: 5, herbalist: 5 },
    void: { void_walker: 157 },
    kites: { thunder_kite: 78 },
    reaper_shield: armyFrom({ chain_sickle_reaper: 0.5, mountain_shield: 0.5 }, 12),
    tanks_heal: armyFrom({ mountain_shield: 0.5, spirit_caller: 0.25, herbalist: 0.25 }, 12),
    siege_blades: armyFrom({ bomb_carrier: 0.25, fire_monk: 0.25, moonblade_master: 0.5 }, 12),
    blades: { moonblade_master: 315 },
    beasts: { bear_warrior: 105 },
    ambush: { mole_king: 157 },
  },
  8: {
    botmix: botArmy(8, 1, data),
    best_found: { wind_step_assassin: 102, blowgun_hunter: 40, bell_warden: 13, gearbreaker: 13, iron_monk: 5, wall_climber: 6 },
    mirage: { mirage_twin: 135 },
    kites: { lantern_balloon: 67 },
    storm_monk: armyFrom({ shuriken_storm: 0.6, iron_monk: 0.4 }, 8),
    tanks_heal: armyFrom({ bell_warden: 0.5, herbalist: 0.25, drum_monk: 0.25 }, 8),
    siege_blades: armyFrom({ fire_monk: 0.5, wind_step_assassin: 0.5 }, 8),
    blades: { wind_step_assassin: 270 },
    grapple: { grapple_raider: 135 },
  },
};
const profiles: Record<string, any> = {
  plain: null,
  reach: { acorn_cannon: { reach: 10 }, wasp_nest: { reach: 10 } },
  blast: { acorn_cannon: { blast: 10 }, wasp_nest: { reach: 5, watch: 5 } },
  watch: { acorn_cannon: { watch: 10 }, wasp_nest: { watch: 10 } },
};
const hero = heroAtKeep(keep, data);
const names = Object.keys(P[keep]).filter((_, i) => part === 'all' || (i % 2 === Number(part)));
console.log(`Keep ${keep}, hero=${hero?.id ?? 'none'}, ${LAYOUTS.length} layouts x 1 seed, ${nSides} sides; cells = mean side / best side destruction %`);
console.log(['army'.padEnd(13), ...Object.keys(profiles).map((p) => p.padEnd(13))].join(''));
for (const name of names) {
  const army = P[keep][name]; const levels = levelsFor(army, keep);
  const cells: string[] = [];
  for (const [pn, tempers] of Object.entries(profiles)) {
    const m: number[] = []; const b: number[] = [];
    for (const layout of LAYOUTS) {
      const base = generateOpponent(9100 + keep * 131, keep, data, { levelBias: 0.5, layout });
      if (tempers) temperBase(base, tempers, data);
      const setup = { seed: 600, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
      const probe = B.createBattle(setup, data);
      const tr = triples(probe); const step = Math.max(1, Math.floor(tr.length / nSides));
      const d = tr.filter((_, i) => i % step === 0).slice(0, nSides).map((pts) => run(setup, planFrom(probe, army, levels, pts, data, hero?.id)).r.destruction);
      m.push(mean(d)); b.push(Math.max(...d));
    }
    cells.push(`${mean(m).toFixed(0)} / ${mean(b).toFixed(0)}`.padEnd(13));
  }
  console.log(name.padEnd(13) + cells.join('') + `  h=${housingOf(army)}`);
}
