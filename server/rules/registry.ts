/**
 * Which battle rules the server can check (roadmap step 73).
 *
 * Phone players stay on an old app for weeks, so the server keeps the last few
 * released versions of the battle rules loaded and re-simulates each battle
 * with the version its ticket was issued under. An engine is a version of the
 * rules (SIM_RULES) with the balance data it was released with:
 *
 * - the live engine: today's `src/gameplay/sim` and `src/gameplay/data`;
 * - archived engines: read-only snapshots made by `npm run rules:snapshot`
 *   before SIM_RULES is bumped (`server/rules/v<N>/`, listed in
 *   `server/rules/archive.ts`). Never edit a snapshot by hand.
 *
 * Choosing an engine for a game: same SIM_RULES, then the same data version
 * if the server has it, else the newest engine with those rules (a data
 * change without a SIM_RULES bump never changes a battle; the rules-version
 * test enforces that). No engine with the game's rules: the game must update
 * (`426 version_mismatch`).
 */
import { runBattle as liveRunBattle, SIM_RULES, SIM_RULES_COMPATIBLE } from '../../src/gameplay/sim/battle/battle';
import { opponentForRank as liveOpponentForRank } from '../../src/gameplay/sim/matchmaking';
import type { GameData } from '../../src/gameplay/sim/types';
import { compareBuilds, dataVersionOf } from '../../src/backend/net/dataVersion';

export interface RulesEngine {
  /** SIM_RULES of this engine. */
  rules: number;
  /** dataVersionOf(data). */
  dataVersion: string;
  data: GameData;
  runBattle: typeof liveRunBattle;
  /** Generated (bot) bases for matchmaking, with this engine's code. */
  opponentForRank: typeof liveOpponentForRank;
  /** The engine built from today's code (exactly one). */
  live: boolean;
  /** Older rules this engine plays out identically (`SIM_RULES_COMPATIBLE`), so it serves them too. */
  compatible?: readonly number[];
}

/** What a request says about the game that sent it (protocol headers). */
export interface ClientInfo {
  /** x-sim-rules. Absent: tools and tests, served with the live engine. */
  rules?: number;
  /** x-data-version (protocol 8). */
  dataVersion?: string;
  /** x-client-build, e.g. "1.4.2+ios". */
  build?: string;
}

export function liveEngine(data: GameData): RulesEngine {
  return { rules: SIM_RULES, dataVersion: dataVersionOf(data), data, runBattle: liveRunBattle, opponentForRank: liveOpponentForRank, live: true, compatible: SIM_RULES_COMPATIBLE };
}

export interface RegistryOptions {
  /** Archived engines (newest first is not required). */
  archived?: RulesEngine[];
  /** SIM_RULES versions retired by the operators (RETIRED_RULES): refused even if archived. Never the live one. */
  retired?: number[];
  /** Oldest game build still allowed online (MIN_CLIENT_BUILD), e.g. "1.2.0". */
  minClientBuild?: string;
}

export class RulesRegistry {
  readonly live: RulesEngine;
  private readonly engines: RulesEngine[];
  readonly minClientBuild: string | undefined;

  constructor(live: RulesEngine, opts: RegistryOptions = {}) {
    const retired = new Set((opts.retired ?? []).filter((r) => r !== live.rules));
    if (retired.size) live = { ...live, compatible: (live.compatible ?? []).filter((r) => !retired.has(r)) };
    this.live = live;
    // Newest rules first; within the same rules the live engine first.
    this.engines = [live, ...(opts.archived ?? []).filter((e) => !retired.has(e.rules) && !(e.rules === live.rules && e.dataVersion === live.dataVersion))].sort((a, b) => b.rules - a.rules || Number(b.live) - Number(a.live));
    this.minClientBuild = opts.minClientBuild?.trim() || undefined;
  }

  /** Every SIM_RULES version the server accepts, newest first (`/v1/hello` `supportedRules`). */
  supportedRules(): number[] {
    return [...new Set(this.engines.flatMap((e) => [e.rules, ...(e.compatible ?? [])]))].sort((a, b) => b - a);
  }

  /** The rules a ticket records for this game: its own when the engine serves them, so its records replay on it. */
  ticketRules(engine: RulesEngine, c: ClientInfo | undefined): number {
    return c?.rules !== undefined && c.rules !== engine.rules && engine.compatible?.includes(c.rules) ? c.rules : engine.rules;
  }

  /** The engine for this game, or null if it must update. */
  forClient(c: ClientInfo | undefined): RulesEngine | null {
    if (!c || c.rules === undefined || !Number.isFinite(c.rules)) return this.live;
    return this.find(c.rules, c.dataVersion);
  }

  /** The engine a ticket was issued under (tickets from before protocol 8 have none: the live engine). */
  forTicket(rules: number | undefined, dataVersion: string | undefined): RulesEngine | null {
    if (rules === undefined) return this.live;
    return this.find(rules, dataVersion);
  }

  /** Is this game build too old to play online? */
  buildTooOld(build: string | undefined): boolean {
    if (!this.minClientBuild || !build) return false;
    return compareBuilds(build, this.minClientBuild) < 0;
  }

  private find(rules: number, dataVersion: string | undefined): RulesEngine | null {
    let same = this.engines.filter((e) => e.rules === rules);
    if (!same.length) same = this.engines.filter((e) => e.compatible?.includes(rules));
    if (!same.length) return null;
    return (dataVersion && same.find((e) => e.dataVersion === dataVersion)) || same[0];
  }
}

/** Parse RETIRED_RULES ("1,2"). */
export function parseRetired(v: string | undefined): number[] {
  return (v ?? '')
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}
