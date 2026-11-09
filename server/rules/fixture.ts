/**
 * Recorded battles, one per released rules version (roadmap step 73):
 * `tests/backend/fixtures/rules/v<N>.json`. Each holds a whole battle (base,
 * army, deployments) and the result hash it gave when it was recorded. The
 * test replays every fixture with the engine the server would pick for it, so
 * an archived engine that drifted (or a snapshot that was edited) fails.
 *
 * Recorded with the live code by `npm run rules:fixture` (and by
 * `npm run rules:snapshot`); never edited by hand.
 */
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import type { BattleSetup, Deployment } from '../../src/gameplay/sim/battle/types';
import type { RulesEngine } from './registry';

/** HP lost per building (the same as battleDamage in battle.ts; written out so archived engines need not export it). */
function battleDamageOf(sim: { buildings: { id: string; destroyed: boolean; hp: number; maxHp: number }[] }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of sim.buildings) {
    const lost = b.destroyed ? b.maxHp : b.maxHp - b.hp;
    if (lost > 0) out[b.id] = lost;
  }
  return out;
}

export interface RulesFixture {
  rules: number;
  dataVersion: string;
  setup: BattleSetup;
  deployments: Deployment[];
  endTick?: number;
  /** What the battle gave when recorded. */
  hash: string;
  stars: number;
  destruction: number;
}

/** A mixed attack on a generated Keep 5 base, from three sides, with a Smoke Bomb. */
export function recordFixture(engine: RulesEngine): RulesFixture {
  const base = generateOpponent(20261105, 5, engine.data);
  // From rules 6 (Tempering): the towers carry a mixed temper, so the fixture plays the reshaped defences too.
  if (engine.rules >= 6) {
    for (const b of base.buildings) {
      if (b.type === 'acorn_cannon') b.temper = { reach: 6, watch: 3 };
      else if (b.type === 'wasp_nest') b.temper = { reach: 5 };
    }
  }
  const army: Record<string, number> = { hedgehog_roller: 20, frog_lobber: 12, beetle_brute: 4 };
  const size = engine.data.economy.mapSize;
  const deployments: Deployment[] = [];
  let tick = 0;
  const edge = (i: number): [number, number] => {
    const side = i % 3;
    const along = 6 + ((i * 7) % (size - 12));
    return side === 0 ? [1, along] : side === 1 ? [size - 2, along] : [along, size - 2];
  };
  let i = 0;
  for (const [troop, n] of Object.entries(army)) {
    for (let k = 0; k < n; k++, i++) {
      const [x, y] = edge(i);
      deployments.push({ tick: tick++, troop, x, y });
    }
  }
  deployments.push({ tick: 60, troop: 'smoke_bomb', x: Math.floor(size / 2), y: Math.floor(size / 2) });
  const setup: BattleSetup = { seed: 424242, base, army };
  // From rules 3 (relay assaults, step 64): the recorded battle is the second strike of a relay.
  if (engine.rules >= 3) {
    const first = engine.runBattle({ seed: 31337, base, army }, deployments.filter((_, i) => i % 2 === 0), engine.data);
    setup.startDamage = battleDamageOf(first.sim);
  }
  const { result } = engine.runBattle(setup, deployments, engine.data);
  return { rules: engine.rules, dataVersion: engine.dataVersion, setup, deployments, hash: result.hash, stars: result.stars, destruction: result.destruction };
}
