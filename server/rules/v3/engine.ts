/** Archived battle rules v3 (made by npm run rules:snapshot; never edit by hand). */
import { dataVersionOf } from '../../../src/backend/net/dataVersion';
import type { RulesEngine } from '../registry';
import { runBattle, SIM_RULES } from './sim/battle/battle';
import { defaultData } from './sim/data';
import { opponentForRank } from './sim/matchmaking';

export function engine(): RulesEngine {
  return { rules: SIM_RULES, dataVersion: dataVersionOf(defaultData), data: defaultData, runBattle, opponentForRank, live: false };
}
