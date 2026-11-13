/** Archived battle rules v6 (made by npm run rules:snapshot; never edit by hand). */
import { dataVersionOf } from '../../../src/backend/net/dataVersion';
import type { RulesEngine } from '../registry';
import { runBattle, SIM_RULES } from './sim/battle/battle';
import { defaultData } from './sim/data';
import { opponentForRank } from './sim/matchmaking';

export function engine(): RulesEngine {
  // An archive's types are its own (they drift from the live ones by design); the registry only passes data through.
  return { rules: SIM_RULES, dataVersion: dataVersionOf(defaultData), data: defaultData as unknown as RulesEngine['data'], runBattle: runBattle as unknown as RulesEngine['runBattle'], opponentForRank: opponentForRank as unknown as RulesEngine['opponentForRank'], live: false };
}
