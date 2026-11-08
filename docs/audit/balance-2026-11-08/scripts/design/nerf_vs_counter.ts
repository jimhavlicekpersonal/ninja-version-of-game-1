/**
 * Two simple fixes compared on a panel of ten army styles (real sim, patched scratch copy in scratch/gp with a
 * data-driven building-versus-class damage bonus):
 *   V1 nerf:     weaken the over-performing kits (Iron Monk aura, Mountain Shield splash cover, Eclipse crit,
 *                Dragon Kite splash targets, Chain-Sickle shred, Shuriken Storm splash).
 *   V2 counter:  certain buildings hit the over-performing tactics harder (Shuriken Tower vs ranged, Mortar vs tanks
 *                and stealth, Sky Bow vs air), on every tower of the type.
 *   V2p portion: the same bonuses on ONE tower of each type per base.
 *   V3 blend:    half the nerfs plus the one-tower counters.
 * node scratch/run.mjs scratch/design/nerf_vs_counter.ts <keep>
 */
import { createBattle, runBattle } from '../gp/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../gp/sim/battle/basegen';
import type { BattleSetup } from '../gp/sim/battle/types';
import { defaultData } from '../gp/sim/data';
import { botDeployments } from '../gp/sim/defense';
import { heroAtKeep } from '../gp/sim/heroes';
import { troopLevelCapAt } from '../gp/sim/research';
import { createRng } from '../gp/sim/rng';
import type { GameData } from '../gp/sim/types';
import { writeFileSync } from 'node:fs';

type Army = Record<string, number>;
const PANEL: Record<number, Record<string, Army>> = {
  8: {
    best_found: { wind_step_assassin: 102, blowgun_hunter: 40, bell_warden: 13, gearbreaker: 13, iron_monk: 5, wall_climber: 6 },
    suggested: { wind_step_assassin: 97, blowgun_hunter: 67, bell_warden: 16, gearbreaker: 13 },
    throwers_monks: { shuriken_storm: 180, iron_monk: 18 },
    throwers_warden: { blowgun_hunter: 190, bell_warden: 16 },
    blade_rush: { wind_step_assassin: 220, iron_monk: 10 },
    shadow: { mirage_twin: 100, shadow_stalker: 35 },
    air: { lantern_balloon: 67 },
    siege_blades: { fire_monk: 40, ram_crew: 20, wind_step_assassin: 90 },
    beasts: { hawk_tamer: 50, hound_handler: 40 },
    healed_blades: { wind_step_assassin: 150, iron_monk: 12, drum_monk: 20 },
  },
  12: {
    best_found: { chain_sickle_reaper: 67, moonblade_master: 54, blowgun_hunter: 30, mountain_shield: 18, iron_monk: 6, gearbreaker: 7, spirit_caller: 5, herbalist: 5 },
    suggested: { moonblade_master: 117, chain_sickle_reaper: 78, mountain_shield: 18, fuse_master: 15 },
    throwers_shield: { chain_sickle_reaper: 160, mountain_shield: 31 },
    mixed_no_aura: { moonblade_master: 130, chain_sickle_reaper: 90, bell_warden: 15, gearbreaker: 10 },
    blade_rush: { moonblade_master: 255, iron_monk: 12 },
    shadow: { void_walker: 157 },
    air: { thunder_kite: 78 },
    siege_blades: { bomb_carrier: 35, siege_bombardier: 20, moonblade_master: 150 },
    beasts: { bear_warrior: 70, boar_rider: 35 },
    healed_blades: { moonblade_master: 180, mountain_shield: 15, spirit_caller: 20 },
  },
  15: {
    best_found: { thousand_needle: 132, storm_sovereign: 56, chain_sickle_reaper: 36, oni_breaker: 13, gearbreaker: 18, iron_monk: 7 },
    suggested: { storm_sovereign: 129, thousand_needle: 90, oni_breaker: 21, ghost_engineer: 18 },
    throwers_oni: { thousand_needle: 180, oni_breaker: 36 },
    mixed_no_aura: { storm_sovereign: 150, thousand_needle: 100, oni_breaker: 16, ghost_engineer: 15 },
    blade_rush: { storm_sovereign: 300, iron_monk: 12 },
    eclipse: { eclipse_ninja: 180 },
    air: { dragon_kite_armada: 90 },
    siege_blades: { volcano_cannoneer: 40, bomb_carrier: 20, storm_sovereign: 180 },
    beasts: { tiger_lord: 80, bear_warrior: 40 },
    healed_blades: { storm_sovereign: 210, mountain_shield: 15, sage_of_clouds: 25 },
  },
};

function kit(d: GameData, id: string, patch: Record<string, number>) {
  const t = (d.troops as any)[id];
  if (t) t.kit = { ...t.kit, ...patch };
}
function nerf(d: GameData, k: number) {
  // k = 1 full nerf, 0.5 half
  const lerp = (a: number, b: number) => a + (b - a) * k;
  kit(d, 'iron_monk', { strength: lerp(0.15, 0.07) });
  kit(d, 'mountain_shield', { strength: lerp(0.5, 0.25) });
  kit(d, 'eclipse_ninja', { critChance: lerp(0.25, 0.08) });
  kit(d, 'dragon_kite_armada', { secondaryDamage: lerp(0.35, 0.15) });
  kit(d, 'thunder_kite', { secondaryDamage: lerp(0.35, 0.2) });
  kit(d, 'chain_sickle_reaper', { shred: lerp(0.2, 0.1) });
  kit(d, 'shuriken_storm', { secondaryDamage: lerp(0.35, 0.2) });
}
function counters(d: GameData, only?: number) {
  (d.battle as any).counterBonus = {
    wasp_nest: { vs: { ranged: 0.8 }, ...(only ? { only } : {}) },
    pinecone_catapult: { vs: { tank: 0.6, stealth: 0.8 }, ...(only ? { only } : {}) },
    firefly_tower: { vs: { air: 0.6 }, ...(only ? { only } : {}) },
  };
}
function scale(d: GameData, ids: string[], hp: number, dmg: number) {
  for (const id of ids) for (const lv of (d.troops as any)[id].levels) { lv.hp *= hp; lv.damage *= dmg; }
}
function buffs(d: GameData) {
  scale(d, ['ram_crew', 'fire_monk', 'bomb_carrier', 'siege_bombardier', 'volcano_cannoneer'], 1.35, 1.35);
  scale(d, ['hound_handler', 'hawk_tamer', 'boar_rider', 'bear_warrior', 'tiger_lord'], 1.3, 1.3);
  scale(d, ['shadow_stalker', 'mirage_twin', 'night_blade', 'void_walker'], 1.25, 1.25);
  scale(d, ['herbalist', 'drum_monk', 'mist_weaver', 'spirit_caller', 'sage_of_clouds'], 1.2, 1.2);
}
const ALL_VARIANTS: Record<string, (d: GameData) => void> = {
  V4_nerf_buff_counter: (d) => { nerf(d, 1); buffs(d); counters(d, 1); },
  SKYx6: (d) => { (d.battle as any).counterBonus = { firefly_tower: { vs: { air: 5 } } }; },
  SKYoff: (d) => { for (const lv of (d.buildings as any).firefly_tower.levels) lv.damage = 0; },
};
const VARIANTS: Record<string, (d: GameData) => void> = {
  V0_today: () => {},
  V1_nerf: (d) => nerf(d, 1),
  V2_counter_all: (d) => counters(d),
  V2p_counter_one: (d) => counters(d, 1),
  V3_blend: (d) => { nerf(d, 0.5); counters(d, 1); },
};

export default function main(keepArg = '12', which = '', armiesArg = '') {
  const K = Number(keepArg);
  const panel = armiesArg ? Object.fromEntries(armiesArg.split(',').map((a) => [a, PANEL[K][a]])) : PANEL[K];
  if (which) { for (const k of Object.keys(VARIANTS)) delete VARIANTS[k]; for (const w of which.split(',')) VARIANTS[w] = ALL_VARIANTS[w] ?? ((): void => {}); }
  const L: string[] = [];
  const res: Record<string, Record<string, { dest: number; three: number }>> = {};
  for (const [vn, apply] of Object.entries(VARIANTS)) {
    const d = structuredClone(defaultData) as GameData;
    apply(d);
    const bases = LAYOUTS.flatMap((Lay) => [0, 1].map((s) => generateOpponent(93000 + K * 10 + s, K, d, { levelBias: 0.5, layout: Lay })));
    const hero = heroAtKeep(K, d);
    res[vn] = {};
    for (const [an, army] of Object.entries(panel)) {
      const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, d, t)]));
      let dest = 0, three = 0, n = 0;
      bases.forEach((base, i) => {
        for (const es of [1, 2]) {
          const setup: BattleSetup = { seed: 300 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
          const probe = createBattle(setup, d);
          const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(es * 53 + i), d, levels, probe.entry);
          const { result } = runBattle(setup, plan, d);
          dest += result.destruction; three += result.stars === 3 ? 1 : 0; n++;
        }
      });
      res[vn][an] = { dest: dest / n, three: three / n };
    }
  }
  const vns = Object.keys(VARIANTS);
  L.push(`== Keep ${K}: mean destruction % (three-star %), 10 bases (5 layouts x 2, bias 0.5) x 2 entry seeds, bot plan, hero`);
  L.push(['army'.padEnd(16), ...vns.map((v) => v.padStart(16))].join(' '));
  for (const an of Object.keys(panel)) L.push([an.padEnd(16), ...vns.map((v) => `${res[v][an].dest.toFixed(1)} (${(res[v][an].three * 100).toFixed(0)}%)`.padStart(16))].join(' '));
  L.push('');
  L.push('variant | best army (dest) | runner-up | best - suggested | armies within 5 pts of best | spread best - median | mean of all ten');
  for (const v of vns) {
    const rows = Object.entries(res[v]).sort((a, b) => b[1].dest - a[1].dest);
    const best = rows[0][1].dest;
    const med = rows[Math.floor(rows.length / 2)][1].dest;
    const within = rows.filter(([, r]) => r.dest >= best - 5).map(([a]) => a);
    const mean = rows.reduce((s, [, r]) => s + r.dest, 0) / rows.length;
    L.push(`${v} | ${rows[0][0]} ${best.toFixed(1)} | ${rows[1][0]} ${rows[1][1].dest.toFixed(1)} | ${(best - res[v].suggested.dest).toFixed(1)} | ${within.length}: ${within.join(', ')} | ${(best - med).toFixed(1)} | ${mean.toFixed(1)}`);
  }
  const out = L.join('\n');
  console.log(out);
  writeFileSync(`scratch/design/nerf_vs_counter_K${K}${which ? '_' + which.replace(/,/g, '+') : ''}.out`, out + '\n');
}
