/**
 * The battle rules this server re-simulates (roadmap step 73). The live rules
 * are the game's own code (src/gameplay/sim, `SIM_RULES`); the one or two
 * before are generated snapshots in `server/rules/v<N>/`
 * (tools/release/snapshot-rules.mjs, never edited by hand). A ticket remembers
 * the rules it was issued under, and its battle is re-simulated, its army
 * checked and its loot capped with that version's code and data, so a game
 * that has not updated yet still gets the result it saw.
 *
 * Retiring a version (its traffic under ~2%, or after 4-6 weeks; docs/SHIPPING.md
 * "Release order"): remove it from SNAPSHOTS and delete its folder.
 */
import { endDamage, runBattle, SIM_RULES } from '../../src/gameplay/sim/battle/battle';
import type { BattleResult, BattleSetup, Deployment } from '../../src/gameplay/sim/battle/types';
import type { Cost, GameData } from '../../src/gameplay/sim/types';
import { dataVersion } from '../../src/gameplay/sim/version';
import * as v2 from './v2';

export interface RuleJob {
  setup: BattleSetup;
  deployments: Deployment[];
  endTick?: number;
}

export interface RuleSet {
  rules: number;
  /** This version's balance data (the server's own data for the live rules). */
  data: GameData;
  /** Its data version (`dataVersion`), what an up-to-date game of this version sends. */
  dataVersion: string;
  live: boolean;
  resim(job: RuleJob): { result: BattleResult; fallen: { id: string; loot: Cost }[]; damage: Record<string, number> };
}

/** Released rules still served, newest first. Keep one or two. */
const SNAPSHOTS: { RULES: number; data: unknown; resim(job: { setup: unknown; deployments: unknown[]; endTick?: number }): unknown }[] = [v2];

/** Every battle-rules version this server re-simulates: the live one first. */
export function supportedRules(): number[] {
  return [SIM_RULES, ...SNAPSHOTS.map((s) => s.RULES).filter((r) => r !== SIM_RULES)];
}

const snapshotSets = new Map<number, RuleSet>();

/**
 * The rules a ticket's battle is re-simulated with. `rules` undefined (a
 * ticket from before step 72) means the live rules. Null when this server no
 * longer keeps that version (the game must update).
 */
export function ruleSet(rules: number | undefined, live: GameData): RuleSet | null {
  if (rules === undefined || rules === SIM_RULES) {
    return {
      rules: SIM_RULES,
      data: live,
      dataVersion: dataVersion(live),
      live: true,
      resim: (job) => {
        const out = runBattle(job.setup, job.deployments, live, job.endTick);
        return { result: out.result, fallen: out.sim.buildings.filter((b) => b.destroyed).map((b) => ({ id: b.id, loot: { ...b.loot } })), damage: endDamage(out.sim) };
      },
    };
  }
  let set = snapshotSets.get(rules);
  if (!set) {
    const s = SNAPSHOTS.find((x) => x.RULES === rules);
    if (!s) return null;
    // A snapshot's data has the shape the game had then; the server reads only battle, army and loot rules from it.
    const data = s.data as GameData;
    set = { rules, data, dataVersion: dataVersion(data), live: false, resim: (job) => s.resim(job) as ReturnType<RuleSet['resim']> };
    snapshotSets.set(rules, set);
  }
  return set;
}
