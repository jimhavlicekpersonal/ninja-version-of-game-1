/**
 * Tempering prototype: continuous, power-neutral re-shaping of the existing towers along four axes
 * (Reach, Volley, Blast, Sight), applied to every ground tower of a base. Profiles are blends of the axes
 * (weights 0..1). Ten army styles per Keep. Question: does the best army change with the profile, is the
 * matrix cyclic, and do blends sit between the pure profiles (continuity)?
 * node scratch/run.mjs scratch/design/temper.ts <keep>
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
  12: {
    best_found: { chain_sickle_reaper: 67, moonblade_master: 54, blowgun_hunter: 30, mountain_shield: 18, iron_monk: 6, gearbreaker: 7, spirit_caller: 5, herbalist: 5 },
    suggested: { moonblade_master: 117, chain_sickle_reaper: 78, mountain_shield: 18, fuse_master: 15 },
    throwers_shield: { chain_sickle_reaper: 160, mountain_shield: 31 },
    blade_rush: { moonblade_master: 255, iron_monk: 12 },
    blade_swarm: { twin_fang_dancer: 290, iron_monk: 5 },
    shadow: { void_walker: 157 },
    air: { thunder_kite: 78 },
    tanks_heal: { mountain_shield: 40, bell_warden: 10, spirit_caller: 20 },
    beasts: { bear_warrior: 70, boar_rider: 35 },
    siege_blades: { bomb_carrier: 35, siege_bombardier: 20, moonblade_master: 150 },
  },
  15: {
    best_found: { thousand_needle: 132, storm_sovereign: 56, chain_sickle_reaper: 36, oni_breaker: 13, gearbreaker: 18, iron_monk: 7 },
    suggested: { storm_sovereign: 129, thousand_needle: 90, oni_breaker: 21, ghost_engineer: 18 },
    throwers_oni: { thousand_needle: 180, oni_breaker: 36 },
    blade_rush: { storm_sovereign: 300, iron_monk: 12 },
    blade_swarm: { twin_fang_dancer: 330, iron_monk: 6 },
    eclipse: { eclipse_ninja: 180 },
    air: { dragon_kite_armada: 90 },
    tanks_heal: { oni_breaker: 40, mountain_shield: 15, sage_of_clouds: 25 },
    beasts: { tiger_lord: 80, bear_warrior: 40 },
    siege_blades: { volcano_cannoneer: 40, bomb_carrier: 20, storm_sovereign: 180 },
  },
};

const TOWERS = ['acorn_cannon', 'wasp_nest'];
/** Round 2 (calibrated): weights 0..1 per axis; strengths chosen so each pure profile's panel mean is near today's. */
function temper(d: GameData, w: { reach?: number; volley?: number; blast?: number; sight?: number }) {
  const b = d.buildings as any;
  const r = w.reach ?? 0, v = w.volley ?? 0, bl = w.blast ?? 0, s = w.sight ?? 0;
  for (const t of TOWERS) {
    const c = b[t].combat;
    // Reach: +2 range, -20% damage; prefer far attackers at half weight or more.
    c.range += 2 * r;
    if (r >= 0.5) b[t].effect = { kind: 'counter_artillery', prefersBeyond: 3.5 };
    // Volley: twice the shots at half the damage (kill rate vs small units), towers 20% more fragile, no range loss.
    c.fireIntervalTicks = Math.max(2, Math.round(c.fireIntervalTicks * (1 - 0.5 * v)));
    // Blast: Kunai gains a small splash (arc) and fires slower.
    if (t === 'acorn_cannon' && bl > 0) { c.splashRadius = 0.5 * bl; c.fireIntervalTicks = Math.round(c.fireIntervalTicks * (1 + 0.8 * bl)); }
    for (const lv of b[t].levels) {
      lv.damage *= (1 - 0.2 * r) * (1 - 0.5 * v) * (1 - 0.2 * bl) * (1 - 0.1 * s);
      lv.hp *= (1 - 0.2 * v);
    }
  }
  if (bl > 0) for (const lv of b.pinecone_catapult.levels) lv.damage *= 1 + 0.15 * bl;
  // Round 3: air made viable at every Keep (+25% HP and damage), the Blast counter the cycle needs.
  for (const id of ['owl_bomber', 'crane_glider', 'lantern_balloon', 'thunder_kite', 'dragon_kite_armada']) for (const lv of (d.troops as any)[id].levels) { lv.hp *= 1.25; lv.damage *= 1.25; }
  if (s > 0) {
    b.bitter_incense_burner.effect = { kind: 'anti_heal', radius: 3 + 2 * s, healCutPct: 0.3 + 0.5 * s, auraCutPct: 0.3 + 0.5 * s };
    for (const lv of b.bitter_incense_burner.levels) lv.effect = { healCutPct: 0.3 + 0.5 * s, auraCutPct: 0.3 + 0.5 * s };
    for (const lv of b.firefly_tower.levels) lv.damage *= 1 + 0.3 * s;
    b.firefly_tower.combat.fireIntervalTicks = Math.max(3, Math.round(b.firefly_tower.combat.fireIntervalTicks * (1 - 0.4 * s)));
    for (const lv of b.thorn_snare.levels) lv.damage *= 1 + 1.0 * s;
  }
}
const PROFILES: Record<string, Parameters<typeof temper>[1]> = {
  today: {},
  reach: { reach: 1 },
  blast: { blast: 1 },
  sight: { sight: 1 },
  reach_blast: { reach: 0.5, blast: 0.5 },
  blast_sight: { blast: 0.5, sight: 0.5 },
  reach_sight: { reach: 0.5, sight: 0.5 },
};

export default function main(keepArg = '12') {
  const K = Number(keepArg);
  const panel: Record<string, Army> = { ...PANEL[K] };
  panel.best_found_spread = PANEL[K].best_found;
  panel.blades_spread = PANEL[K].blade_rush;
  const res: Record<string, Record<string, number>> = {};
  for (const [pn, w] of Object.entries(PROFILES)) {
    const d = structuredClone(defaultData) as GameData;
    temper(d, w);
    const bases = LAYOUTS.flatMap((Lay) => [0, 1].map((s) => generateOpponent(95000 + K * 10 + s, K, d, { levelBias: 0.5, layout: Lay })));
    const hero = heroAtKeep(K, d);
    res[pn] = {};
    for (const [an, army] of Object.entries(panel)) {
      const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, d, t)]));
      let dest = 0, n = 0;
      bases.forEach((base, i) => { for (const es of [1, 2]) {
        const setup: BattleSetup = { seed: 400 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
        const probe = createBattle(setup, d);
        let plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(es * 59 + i), d, levels, probe.entry);
        if (an.endsWith('_spread')) {
          const e = probe.entry!; const used = e.points.map(() => 0); let k = 0; plan = [];
          for (const [t, cnt] of Object.entries(army)) for (let q = 0; q < cnt; q++) {
            const h = d.troops[t].housing; let tries = 0, idx = k % e.points.length;
            while (used[idx] + h > e.cover && tries < e.points.length) { k++; idx = k % e.points.length; tries++; }
            used[idx] += h; plan.push({ tick: Math.floor(q / 2), troop: t, x: Math.floor(e.points[idx].x), y: Math.floor(e.points[idx].y) }); k++;
          }
        }
        dest += runBattle(setup, plan, d).result.destruction; n++;
      } });
      res[pn][an] = dest / n;
    }
  }
  const pns = Object.keys(PROFILES);
  const L: string[] = [];
  L.push(`== Keep ${K}: mean destruction %, 10 bases (5 layouts x 2, bias 0.5) x 2 entry seeds, bot plan, hero; profiles are power-neutral re-shapes of Kunai + Shuriken Towers`);
  L.push(['army'.padEnd(16), ...pns.map((p) => p.padStart(13))].join(' '));
  for (const an of Object.keys(panel)) L.push([an.padEnd(16), ...pns.map((p) => res[p][an].toFixed(1).padStart(13))].join(' '));
  L.push('');
  L.push('profile | best army | 2nd | 3rd | best - 2nd | armies within 5 of best | mean of panel');
  for (const p of pns) {
    const rows = Object.entries(res[p]).sort((a, b) => b[1] - a[1]);
    const within = rows.filter(([, v]) => v >= rows[0][1] - 5).map(([a]) => a);
    L.push(`${p} | ${rows[0][0]} ${rows[0][1].toFixed(1)} | ${rows[1][0]} ${rows[1][1].toFixed(1)} | ${rows[2][0]} ${rows[2][1].toFixed(1)} | ${(rows[0][1] - rows[1][1]).toFixed(1)} | ${within.length}: ${within.join(', ')} | ${(rows.reduce((s, [, v]) => s + v, 0) / rows.length).toFixed(1)}`);
  }
  L.push('');
  L.push('army | best profile against it (lowest destruction) | worst profile (highest) | swing');
  for (const an of Object.keys(panel)) {
    const cols = pns.map((p) => [p, res[p][an]] as [string, number]).sort((a, b) => a[1] - b[1]);
    L.push(`${an} | ${cols[0][0]} ${cols[0][1].toFixed(1)} | ${cols[cols.length - 1][0]} ${cols[cols.length - 1][1].toFixed(1)} | ${(cols[cols.length - 1][1] - cols[0][1]).toFixed(1)}`);
  }
  // Continuity: blends between pure profiles
  const mid = (a: string, b: string, m: string, an: string): string => `${an}: ${a} ${res[a][an].toFixed(1)}, ${b} ${res[b][an].toFixed(1)}, blend ${res[m][an].toFixed(1)}`;
  L.push('');
  L.push('continuity (pure A, pure B, 50/50 blend):');
  for (const an of Object.keys(panel)) L.push('  ' + mid('reach', 'blast', 'reach_blast', an) + ' | ' + mid('blast', 'sight', 'blast_sight', an));
  const out = L.join('\n');
  console.log(out);
  writeFileSync(`scratch/design/temper3_K${K}.out`, out + '\n');
}
