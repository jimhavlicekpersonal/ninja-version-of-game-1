/**
 * Calibrate Tempering on the real implementation. node docs/audit/balance-2026-11-08/scripts/run.mjs docs/audit/balance-2026-11-08/scripts/design/temper_calibration.ts <keep> '<json patch of battle.temper.types/baseWide>' [label]
 * Panel of army styles (round-2 panel + the raid bots' mix) vs 10 generated bases per profile (uniform tempers).
 */
import { createBattle, runBattle } from '../../../../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../../../../src/gameplay/sim/battle/basegen';
import type { BattleSetup } from '../../../../../src/gameplay/sim/battle/types';
import { defaultData } from '../../../../../src/gameplay/sim/data';
import { botDeployments } from '../../../../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../../../../src/gameplay/sim/heroes';
import { botArmy } from '../../../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../../../src/gameplay/sim/research';
import { createRng } from '../../../../../src/gameplay/sim/rng';
import { temperBase } from '../../../../../src/gameplay/sim/battle/temper';
import type { GameData } from '../../../../../src/gameplay/sim/types';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

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

function merge(a: any, b: any): any {
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return b;
  const out = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
  return out;
}

export default function main(keepArg = '12', patch = '{}', label = '', only = '') {
  const K = Number(keepArg);
  const d = structuredClone(defaultData) as GameData;
  d.battle.temper = merge(d.battle.temper, JSON.parse(patch));
  if (process.env.TROOPS) d.troops = JSON.parse(require('node:fs').readFileSync(process.env.TROOPS, 'utf8'));
  const panel: Record<string, Army> = { ...(PANEL[K] ?? {}), bots: botArmy(K, 1, d) };
  const PROFILES: Record<string, any> = {
    none: null,
    reach: { acorn_cannon: { reach: 10 }, wasp_nest: { reach: 10 } },
    blast: { acorn_cannon: { blast: 10 }, wasp_nest: { reach: 5, watch: 5 } },
    watch: { acorn_cannon: { watch: 10 }, wasp_nest: { watch: 10 } },
    mixed: { acorn_cannon: { reach: 3, blast: 4, watch: 3 }, wasp_nest: { reach: 5, watch: 5 } },
  };
  if (only) for (const k of Object.keys(PROFILES)) if (!only.split(',').includes(k)) delete PROFILES[k];
  const hero = heroAtKeep(K, d);
  const res: Record<string, Record<string, number>> = {};
  for (const [pn, tp] of Object.entries(PROFILES)) {
    const bases = LAYOUTS.flatMap((Lay) => [0, 1].map((s) => { const b = generateOpponent(95000 + K * 10 + s, K, d, { levelBias: 0.5, layout: Lay }); temperBase(b, tp, d); return b; }));
    res[pn] = {};
    for (const [an, army] of Object.entries(panel)) {
      const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, d, t)]));
      let dest = 0, n = 0;
      bases.forEach((base, i) => { for (const es of [1, 2]) {
        const setup: BattleSetup = { seed: 400 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
        const probe = createBattle(setup, d);
        const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(es * 59 + i), d, levels, probe.entry);
        dest += runBattle(setup, plan, d).result.destruction; n++;
      } });
      res[pn][an] = dest / n;
    }
  }
  const pns = Object.keys(PROFILES);
  const L: string[] = [];
  L.push(`== K${K} ${label} patch=${patch}`);
  L.push(['army'.padEnd(16), ...pns.map((p) => p.padStart(8))].join(' '));
  for (const an of Object.keys(panel)) L.push([an.padEnd(16), ...pns.map((p) => res[p][an].toFixed(1).padStart(8))].join(' '));
  const mean = (p: string) => Object.values(res[p]).reduce((s, v) => s + v, 0) / Object.keys(res[p]).length;
  L.push(['MEAN'.padEnd(16), ...pns.map((p) => mean(p).toFixed(1).padStart(8))].join(' '));
  L.push(['best'.padEnd(16), ...pns.map((p) => Object.entries(res[p]).sort((a, b) => b[1] - a[1])[0][0].slice(0, 8).padStart(8))].join(' '));
  L.push(['best-2nd'.padEnd(16), ...pns.map((p) => { const r = Object.values(res[p]).sort((a, b) => b - a); return (r[0] - r[1]).toFixed(1).padStart(8); })].join(' '));
  console.log(L.join('\n'));
}
