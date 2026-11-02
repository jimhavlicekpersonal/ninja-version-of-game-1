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
- `control/controller.ts`: command dispatch, saving. `control/battleSession.ts`: real-time battle stepping.

## Invariants with tests (keep them green)

- The 20-item balance pass (see root `CLAUDE.md`) and `tests/gameplay/balance/*`. Rerun the model player after changing costs, times, loot or combat numbers.
- `progression-model.test.ts`: the live roster matches the model, no dominance inside a tier, every Keep level unlocks warriors, costs outgrow power.
- `tactics.test.ts`: smoke and sabotage limits and exact replays. `trials.test.ts`: ladder growth, no tier skipping, rewards paid once, forged bases ignored.
- **Save format:** bump `SAVE_VERSION` (`sim/save.ts`, now 10) and add a migration step for every state change. Never drop player progress.
- **Ids are stable** (`docs/rebuild/ID_MAP.md`). Change display names in data only.
- If a rule change affects online battles, tell BACKEND (`docs/backend/REQUESTS.md`): the server must run the same version, and `PROTOCOL_VERSION` may need a bump.

## After changing numbers

`npm test`, then `npm run docs:progression` to regenerate `docs/game-theory/ROSTER.md` and the icon manifest.
