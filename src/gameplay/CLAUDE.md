# GAME THEORY compartment (Section 2): rules, numbers and commands

You are the **GAME THEORY AI**. You own `src/gameplay/` (`sim/`, `data/`, `control/`), `docs/game-theory/` and `tools/progression/`. Read `docs/game-theory/PROGRESSION_MODEL.md` first.

## Architecture rules (unchanged from the original spec)

1. `sim/` is pure and deterministic: no Phaser, DOM, `Date.now()` or `Math.random()` (enforced by `tests/gameplay/sim/purity.test.ts`). It imports nothing outside `gameplay/` (boundary test).
2. Every balance number is in `data/*.json`. No magic numbers in code.
3. Time comes from the injected `Clock`. Timers store `startedAt`/`endsAt`.
4. Offline progress is computed on load from elapsed time.
5. Battles: fixed 10 ticks/s, seeded RNG, replayed exactly from `seed + deployments`. Only use + − × ÷ and √. Abilities (Smoke Bomb) are deployments whose `troop` is an ability id. The server re-simulates every attack with this same code.

## Key systems

- `sim/battle/battle.ts`: combat, Smoke Bomb (range × 0.4, never below 2 tiles, 8 s, no stacking, charges from army housing), Sabotage (6 s jam, then 10 s immunity after recovery, one jam per Saboteur).
- `sim/battle/basegen.ts`: generated bases, five layout archetypes. `scout.ts`: what scouting reveals (never hidden traps).
- `sim/trials.ts` + `data/trials.json`: Shadow Trials, the endless ladder, rewarded once per tier through the `trialEnd` command.
- `sim/progression.ts` + `data/progression.json` + `data/roster.json`: the power-budget model, the 50 warriors, 4 heroes and 34 buildings.
- `sim/world/` (Shadow Clans, `docs/game-theory/SHADOW_CLANS.md`): `clans.ts` (persistent AI clans, event-driven steps, bands, revenge), `villagegen.ts` (constrained clan villages: archetype, budget, reachability, difficulty, regenerate; the first-raid outpost; clan armies), `opponents.ts` (the rivals board), `power.ts` (Clan Power, combat rating, matchups), `territory.ts` (world map, conquest, tribute, reclaim), `factions.ts` (missions, support, wars), `competition.ts` (PvP gates, population transition, eligibility, Shadow Rank, war formats, catch-up, leadership), `tournament.ts`, `treasury.ts` (clan treasuries). Data: `clans.json`, `world.json`, `competition.json`. Online-only state (`heldBy` on settlements, `warTarget` on the faction) arrives through idempotent commands (`syncRegionClaims`, `claimSettlement`, `setFactionWarTarget`). Generated rivals (`opponentForRank`) are clan villages; simulated raiders belong to clans.
- `control/controller.ts`: command dispatch, saving. `control/battleSession.ts`: real-time battle stepping.

## Invariants with tests (keep them green)

- The 20-item balance pass (see root `CLAUDE.md`) and `tests/gameplay/balance/*`. Rerun the model player after changing costs, times, loot or combat numbers.
- `progression-model.test.ts`: the live roster matches the model, no dominance inside a tier, every Keep level unlocks warriors, costs outgrow power.
- `tactics.test.ts`: smoke and sabotage limits and exact replays. `trials.test.ts`: ladder growth, no tier skipping, rewards paid once, forged bases ignored.
- `tests/gameplay/world/*`: every rivals card inside the matchmaking window at every Keep, treasuries, 50 layouts per clan, terrain, signature warriors, shared-territory commands, clan villages legal and reachable, first raid beatable, clan steps independent of cadence and inside bands, revenge raids, conquest without Honor, forged settlements ignored, population table and capacity formula, eligibility, Shadow Rank only from real players, factions, tournaments, catch-up.
- **Save format:** bump `SAVE_VERSION` (`sim/save.ts`, now 12) and add a migration step for every state change. Never drop player progress.
- **Ids are stable** (`docs/rebuild/ID_MAP.md`). Change display names in data only.
- If a rule change affects online battles, tell BACKEND (`docs/backend/REQUESTS.md`): the server must run the same version, and `PROTOCOL_VERSION` may need a bump.

## After changing numbers

`npm test`, then `npm run docs:progression` to regenerate `docs/game-theory/ROSTER.md` and the icon manifest.
