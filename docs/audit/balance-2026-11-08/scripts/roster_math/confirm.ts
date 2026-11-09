// Confirmation with more seeds for the large tier-swap effects. Run: node scratch/run.mjs scratch/roster_math/confirm.ts
import { defaultData as data } from '../../src/gameplay/sim/data';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { fight, levelsAtCaps, LAYOUT_IDS, summarize } from './lib';

export default function main(seedsArg = '5') {
  const f1 = (x: number) => x.toFixed(1);
  const seeds = Number(seedsArg);
  const cases: [number, string, string, number][] = [
    // keep, slot, replacement, housing ratio (replacement count = slot count * ratio)
    [15, 'storm_sovereign', 'storm_sovereign', 1], [15, 'storm_sovereign', 'eclipse_ninja', 0.5], [15, 'storm_sovereign', 'hedgehog_roller', 1], [15, 'storm_sovereign', 'moonblade_master', 1],
    [15, 'oni_breaker', 'mountain_shield', 1], [15, 'oni_breaker', 'beetle_brute', 1],
    [15, 'ghost_engineer', 'gearbreaker', 1], [15, 'ghost_engineer', 'saboteur', 1], [15, 'ghost_engineer', 'fuse_master', 1],
    [15, 'thousand_needle', 'chain_sickle_reaper', 1], [15, 'thousand_needle', 'shuriken_storm', 1],
    [13, 'storm_sovereign', 'storm_sovereign', 1], [13, 'oni_breaker', 'mountain_shield', 1], [13, 'ghost_engineer', 'gearbreaker', 1], [13, 'thousand_needle', 'chain_sickle_reaper', 1],
    [10, 'moonblade_master', 'moonblade_master', 1], [10, 'fuse_master', 'gearbreaker', 1], [10, 'fuse_master', 'saboteur', 1], [10, 'mountain_shield', 'beetle_brute', 1],
    [7, 'wind_step_assassin', 'wind_step_assassin', 1], [7, 'wind_step_assassin', 'hedgehog_roller', 1], [7, 'gearbreaker', 'saboteur', 1],
  ];
  console.log(`## Confirmation: ${LAYOUT_IDS.length} layouts x ${seeds} seeds, bases bias 0.5 and 1.0`);
  console.log('| Keep | slot -> troop | bias 0.5 destr / 1* / 3* | bias 1.0 destr / 1* / 3* |\n|---|---|---|---|');
  for (const [keep, slot, rep, ratio] of cases) {
    const army = botArmy(keep, 1, data); const n = army[slot]; delete army[slot]; army[rep] = (army[rep] ?? 0) + Math.floor(n * ratio);
    const lv = levelsAtCaps(keep, army);
    const out: string[] = [];
    for (const bias of [0.5, 1]) {
      const rs = []; for (const L of LAYOUT_IDS) for (let s = 10; s < 10 + seeds; s++) rs.push(fight(data, keep, army, lv, L, s, bias));
      const sm = summarize(rs); out.push(`${f1(sm.d)} / ${f1(sm.one)} / ${f1(sm.three)}`);
    }
    console.log(`| ${keep} | ${slot} -> ${rep}${rep === slot ? ' (mix)' : ''} x${army[rep]} | ${out[0]} | ${out[1]} |`);
  }
}
