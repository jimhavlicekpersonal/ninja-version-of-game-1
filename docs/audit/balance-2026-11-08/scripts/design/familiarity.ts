/**
 * "The base remembers": a rival's towers gain against warrior types that raided it recently. Prototype by scaling the
 * HP of each type by 1 / (1 + STRENGTH x familiarity), where familiarity = that type's housing share over the last 10
 * raids the player made (capped at CAP). Compare a player who fields the same best army every raid with one who rotates
 * three armies, over 30 consecutive raids at Keep 12 and 15 against bias-0.5 bases (bot plan, hero).
 * node scratch/run.mjs scratch/design/familiarity.ts
 */
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { generateOpponent, LAYOUTS } from '../../src/gameplay/sim/battle/basegen';
import type { BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import type { GameData } from '../../src/gameplay/sim/types';
type Army = Record<string, number>;
const STRENGTH = 0.6, CAP = 0.5, WINDOW = 10;
const SETS: Record<number, Army[]> = {
  12: [
    { chain_sickle_reaper: 67, moonblade_master: 54, blowgun_hunter: 30, mountain_shield: 18, iron_monk: 6, gearbreaker: 7, spirit_caller: 5, herbalist: 5 },
    { void_walker: 120, mountain_shield: 15 },
    { thunder_kite: 60, moonblade_master: 75 },
  ],
  15: [
    { thousand_needle: 132, storm_sovereign: 56, chain_sickle_reaper: 36, oni_breaker: 13, gearbreaker: 18, iron_monk: 7 },
    { eclipse_ninja: 180 },
    { dragon_kite_armada: 90 },
  ],
};
const housing = (a: Army, d: GameData) => Object.entries(a).reduce((s, [t, n]) => s + d.troops[t].housing * n, 0);
function run(K: number, pick: (i: number) => Army, label: string, learn: boolean) {
  const history: Army[] = [];
  let dest = 0, stars = 0, three = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    const army = pick(i);
    const d = structuredClone(defaultData) as GameData;
    if (learn && history.length) {
      const recent = history.slice(-WINDOW);
      const share: Record<string, number> = {};
      let total = 0;
      for (const a of recent) for (const [t, n] of Object.entries(a)) { share[t] = (share[t] ?? 0) + d.troops[t].housing * n; total += d.troops[t].housing * n; }
      for (const [t, h] of Object.entries(share)) {
        const fam = Math.min(CAP, h / total);
        for (const lv of (d.troops as any)[t].levels) lv.hp = lv.hp / (1 + STRENGTH * fam);
      }
    }
    const L = LAYOUTS[i % LAYOUTS.length];
    const base = generateOpponent(97000 + K * 100 + i, K, d, { levelBias: 0.5, layout: L });
    const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(K, d, t)]));
    const hero = heroAtKeep(K, d);
    const setup: BattleSetup = { seed: 500 + i, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = createBattle(setup, d);
    const plan = botDeployments(probe.deployable, probe.grid.size, army, createRng(77 + i), d, levels, probe.entry);
    const { result } = runBattle(setup, plan, d);
    dest += result.destruction; stars += result.stars; three += result.stars === 3 ? 1 : 0;
    history.push(army);
  }
  console.log(`K${K} ${label.padEnd(34)} learn=${learn ? 'on ' : 'off'}: destruction ${(dest / N).toFixed(1)}, stars ${(stars / N).toFixed(2)}, 3-star ${((three / N) * 100).toFixed(0)}%`);
}
export default function main() {
  console.log(`familiarity: towers effectively +${STRENGTH * 100}% x (housing share over the last ${WINDOW} raids, cap ${CAP}); 30 raids, bias 0.5`);
  for (const K of [12, 15]) {
    const sets = SETS[K];
    for (const learn of [false, true]) {
      run(K, () => sets[0], 'fixed: the best thrower line', learn);
      run(K, () => sets[1], 'fixed: the stealth army', learn);
      run(K, (i) => sets[i % 3], 'rotation of three armies', learn);
    }
  }
}
