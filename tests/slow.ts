/**
 * Tests left out of the default `npm test` (quality 24): the model-player campaigns fight hundreds of
 * real battles (about 50 s of CPU together) and the battle performance check times the simulation on the
 * wall clock. `npm run test:slow` runs exactly these; CI runs both suites. Rerun them after changing costs,
 * times, loot or combat numbers (root CLAUDE.md, Checks).
 */
export const SLOW_TESTS = [
  'tests/gameplay/balance/policies.test.ts',
  'tests/gameplay/balance/progression.test.ts',
  'tests/gameplay/balance/gang-war.test.ts',
  'tests/gameplay/battle/perf.test.ts',
];
