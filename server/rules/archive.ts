/**
 * Archived battle-rule engines (roadmap step 73): read-only snapshots of
 * released versions, kept so old app builds still get correct results.
 *
 * Managed by `npm run rules:snapshot` (tools/release/rules-snapshot.mjs): run it
 * BEFORE bumping SIM_RULES; it copies today's src/gameplay/sim and
 * src/gameplay/data to server/rules/v<N>/ and adds a line below. Remove a line
 * (and its folder) only after that version is retired (docs/SHIPPING.md,
 * "Releasing a balance change"). Never edit a snapshot by hand.
 */
import type { RulesEngine } from './registry';

// rules-snapshot: imports (keep this marker)

export const ARCHIVED_ENGINES: (() => RulesEngine)[] = [
  // rules-snapshot: engines (keep this marker)
];
