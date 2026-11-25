import { createBattle, runBattle, SIM_RULES } from './battle/battle';
import type { BattleRecord } from './battle/types';
import { botDeployments, botName, villageToBase } from './defense';
import { attackerFor } from './matchmaking';
import { createRng, next } from './rng';
import type { GameData, VillageState } from './types';
/**
 * P6-04 (defense opportunity 1): "Test my defenses". The simulated raider (`attackerFor`, `botDeployments`) against the
 * village as it is now (`villageToBase`, full loot, no exhaustion), as a record to watch. Pure and device only:
 * nothing is taken, no honor or shield changes, and the record is never stored.
 */
export function testDefense(state: VillageState, t: number, seed: number, data: GameData): BattleRecord {
  const rng = createRng(seed >>> 0);
  const s = structuredClone(state);
  const attacker = attackerFor(rng, s, data);
  const base = villageToBase(s, t, data, 'Your village', 1);
  const setup = { seed: (next(rng) * 4294967296) >>> 0, base, army: attacker.army, levels: attacker.levels, infiltration: true };
  const probe = createBattle(setup, data);
  const deployments = botDeployments(probe.deployable, probe.grid.size, attacker.army, rng, data, attacker.levels, probe.entry);
  const { result } = runBattle(structuredClone(setup), deployments, data);
  return { id: `test-${seed >>> 0}`, kind: 'defense', at: t, opponentName: botName(rng, data), setup, deployments, result, rules: SIM_RULES, simulated: true };
}
