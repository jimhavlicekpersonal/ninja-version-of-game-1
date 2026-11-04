# Running one AI session per compartment

Kagemura is split so that each part can be upgraded by a **new, separate Claude session** that knows only its own folder. The folders and rules are in `compartments.json`; the import-boundary test (`tests/architecture/boundaries.test.ts`) fails if a session reaches outside its lane.

## The sessions

| Session | Section | Owns (may edit) | Must not edit | First prompt to paste |
|---|---|---|---|---|
| **ART AI** | 1 | `src/presentation/art/`, `src/presentation/audio/`, `public/art/`, `docs/art/` | game numbers, UI code, server | "Read `src/presentation/art/CLAUDE.md` and `docs/art/ART_AI_BRIEF.md`. Produce the live icons in `docs/art/ICON_MANIFEST.json` and register them in `public/art/manifest.json`." |
| **GUI & INTERACTION AI** | 1 | `src/presentation/render/`, `src/presentation/ui/` | `src/gameplay/**` rules and data, `server/` | "Read `src/presentation/CLAUDE.md`. Task: …" |
| **GAME THEORY AI** | 2 | `src/gameplay/` (sim, data, control), `docs/game-theory/`, `tools/progression/` | art, UI layout, server code | "Read `src/gameplay/CLAUDE.md` and `docs/game-theory/PROGRESSION_MODEL.md`. Task: …" |
| **BACKEND AI** | 3 | `src/backend/`, `server/`, `docs/PROTOCOL.md`, `docs/SHIPPING.md`, `ios/`, `android/`, `.github/` | game rules (it calls them, never forks them), art, UI | "Read `src/backend/CLAUDE.md`. Task: …" |
| **INTEGRATION** | all | `src/main.ts`, `src/app.ts`, `compartments.json`, contract files, root docs | — | "Read `AGENTS.md`. Merge branches X, Y; resolve contract changes; run all checks." |

## Workflow

1. **One branch per session:** `art/<topic>`, `gui/<topic>`, `theory/<topic>`, `backend/<topic>`. Locally, use a git worktree per session so they can run at the same time.
2. **Start every session** by reading its `CLAUDE.md` brief (Claude Code loads the nearest one automatically when it works in that folder).
3. **Stay in your lane.** If you need something from another compartment (a new asset key, a new command, a protocol field), write it down instead of editing their files:
   - ART → GUI: `docs/art/REQUESTS.md`
   - GUI → GAME THEORY: `docs/game-theory/REQUESTS.md`
   - anyone → BACKEND: `docs/backend/REQUESTS.md`
4. **Before you finish:** `npm test` (includes the boundary test) and `npm run build`, plus `npm run typecheck:server` and `npm run server:build` for backend work. With Postgres and Redis at hand, set `TEST_DATABASE_URL` and `TEST_REDIS_URL` so their adapter tests run too (they are skipped otherwise). A database change is a new numbered file in `server/migrations/` (listed in its `index.ts`), never an edit to an applied one. Update your compartment's `CLAUDE.md` if you changed how things work.
5. **Integration session** merges the branches into `main`, applies requested contract changes (edit the contract file, then update every caller), bumps `SAVE_VERSION` / `PROTOCOL_VERSION` if needed, and runs every check.
6. **Shared between GAME THEORY and BACKEND:** `src/gameplay/sim/serverEconomy.ts` decides what a server-held village checks (`Economy`, `economyHash`) and which commands a player may send (`PLAYER_COMMANDS`). Changing either changes what the server accepts: tell BACKEND (`docs/backend/REQUESTS.md`).

## Contract files (changing these needs INTEGRATION)

Listed per compartment in `compartments.json` → `contracts`. In short: `art/ninja.ts` exports (painter registries), `render/iso.ts`, `gameplay/control/controller.ts` + `battleSession.ts` (the command surface, including `onCommand`/`adoptEconomy`/`adoptVillage` for a server-held village), everything in `gameplay/sim` is readable by others (but only GAME THEORY edits it), and the backend ports: `analytics/events.ts`, `persist/saveStore.ts`, `payments/provider.ts`, `net/connection.ts`, `net/protocol.ts`, `net/villageSync.ts`, `social/groveSource.ts`.
