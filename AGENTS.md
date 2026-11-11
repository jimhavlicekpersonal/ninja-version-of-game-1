# Running one AI session per compartment

## Required context: complete translation scope

For localization, player-visible text, language selection or Unicode-name display work, read
[`docs/localization/README.md`](docs/localization/README.md). It is the AI-readable surface inventory,
ordered implementation plan and completion criteria; `docs/localization/INVENTORY.json` supplies
source units and locations. The 659 data + 99 UI keys on its newer-main baseline are only an extracted
subset, not the entire game. The census is a pinned historical baseline. Spanish implementation, actual shipping bytes,
and validation are recorded in `docs/localization/SPANISH_IMPLEMENTATION.json`,
`SPANISH.md` and `SPANISH_SIZE.json`; Hindi in `HINDI.md`; Brazilian Portuguese in `PORTUGUESE.md`; German in `GERMAN.md`; French and Italian in `FRENCH.md` and `ITALIAN.md`; Simplified Chinese in `CHINESE.md`; Romanian and Catalan in `ROMANIAN.md` and `CATALAN.md`; Japanese in `JAPANESE.md`; Dutch and Swedish in `DUTCH.md` and `SWEDISH.md`; Danish and Norwegian Bokmål in `DANISH.md` and `NORWEGIAN.md`; Korean and Thai in `KOREAN.md` and `THAI.md`; Traditional Chinese and Vietnamese in `TRADITIONAL_CHINESE.md` and `VIETNAMESE.md`. Only English, Spanish, Hindi, Portuguese, German, French, Italian, Simplified Chinese, Japanese, Romanian, Catalan, Dutch, Swedish, Danish, Norwegian Bokmål, Korean, Thai, Traditional Chinese and Vietnamese are ready. Preserve
canonical game/save data and authored names/chat; do not infer worldwide release readiness
from translation coverage or unit tests.

## Required context: worldwide release audit

Read [`docs/store/WORLDWIDE_AUDIT.md`](docs/store/WORLDWIDE_AUDIT.md) at the start of every session, including sessions that load only a compartment brief. The owner's goal is worldwide reach, commercial viability, and reliable download, installation and play on inexpensive phones and poor internet connections through the Apple App Store and Google Play.

The audit records unresolved findings against commit `40bb2459f2b2bee7d380577c8211ec7058461d03` on 2026-11-05. Earlier statements that an audit or roadmap phase is "fixed" or "done" do not resolve these newer findings. Revalidate against current code; distinguish reproduced failures, source-confirmed defects, risks and unverified native/store behavior. Follow its closure evidence and priority order within the user's authorized task and existing compartment boundaries. Passing unit tests, a small web bundle, a debug APK or a completed roadmap do not establish worldwide release readiness or profitability.

A fix pass on 2026-11-05 (commit `db9b88e`) closed 14 findings and the self-removal defect in GLOBAL-006, and left GLOBAL-001, 007, 008, 015 and 017, the market assessment in 006 and all 10 risks open on owner, store, device or market evidence; its closure record (end of the audit) lists what each fix verified and what it did not. Keep gameplay, economy, runtime, deployment and store-account changes outside a documentation-only task. For later authorized fixes, update the finding with the fixing commit, verification and remaining limitations; do not silently remove findings or mark recommendations implemented.

Kagemura is split so that each part can be upgraded by a **new, separate Claude session** that knows only its own folder. The folders and rules are in `compartments.json`; the import-boundary test (`tests/architecture/boundaries.test.ts`) fails if a session reaches outside its lane.

## The sessions

| Session | Section | Owns (may edit) | Must not edit | First prompt to paste |
|---|---|---|---|---|
| **ART AI** | 1 | `src/presentation/art/`, `src/presentation/audio/`, `public/art/`, `docs/art/` | game numbers, UI code, server | "Read `src/presentation/art/CLAUDE.md` and `docs/art/ART_AI_BRIEF.md`. Produce the live icons in `docs/art/ICON_MANIFEST.json` and register them in `public/art/manifest.json`." |
| **GUI & INTERACTION AI** | 1 | `src/presentation/render/`, `src/presentation/ui/` | `src/gameplay/**` rules and data, `server/` | "Read `src/presentation/CLAUDE.md`. Task: …" |
| **GAME THEORY AI** | 2 | `src/gameplay/` (sim, data, control), `docs/game-theory/`, `tools/progression/` | art, UI layout, server code | "Read `src/gameplay/CLAUDE.md` and `docs/game-theory/PROGRESSION_MODEL.md`. Task: …" |
| **BACKEND AI** | 3 | `src/backend/`, `server/`, `docs/PROTOCOL.md`, `docs/SHIPPING.md`, `ios/`, `android/`, `.github/` | game rules (it calls them, never forks them), art, UI | "Read `src/backend/CLAUDE.md`. Task: …" |
| **TRANSLATION AI** | Localization | `locales/<one language code>/` only | `locales/en/`, `languages.json`, game code, tools | "Read `locales/CLAUDE.md`. Run `npm run i18n:status` and translate the next language." Run several at once, one language each. |
| **INTEGRATION** | all | `src/main.ts`, `src/app.ts`, `compartments.json`, contract files, root docs | — | "Read `AGENTS.md`. Merge branches X, Y; resolve contract changes; run all checks." |

## Workflow

1. **One branch per session:** `art/<topic>`, `gui/<topic>`, `theory/<topic>`, `backend/<topic>`. Locally, use a git worktree per session so they can run at the same time.
2. **Start every session** by reading its `CLAUDE.md` brief (Claude Code loads the nearest one automatically when it works in that folder).
3. **Stay in your lane.** If you need something from another compartment (a new asset key, a new command, a protocol field), write it down instead of editing their files:
   - ART → GUI: `docs/art/REQUESTS.md`
   - GUI → GAME THEORY: `docs/game-theory/REQUESTS.md`
   - anyone → BACKEND: `docs/backend/REQUESTS.md`
   - TRANSLATION → anyone: list unclear English in your final message (never edit `locales/en/`)
4. **Before you finish:** `npm test` (includes the boundary test) and `npm run build`, plus `npm run typecheck:server` and `npm run server:build` for backend work. With Postgres and Redis at hand, set `TEST_DATABASE_URL` and `TEST_REDIS_URL` so their adapter tests run too (they are skipped otherwise). A database change is a new numbered file in `server/migrations/` (listed in its `index.ts`), never an edit to an applied one. Update your compartment's `CLAUDE.md` if you changed how things work.
5. **Integration session** merges the branches into `main`, applies requested contract changes (edit the contract file, then update every caller), bumps `SAVE_VERSION` / `PROTOCOL_VERSION` if needed, and runs every check.
6. **Shared between GAME THEORY and BACKEND:** `src/gameplay/sim/rating.ts` (matchmaking ratings) and `src/gameplay/sim/serverEconomy.ts`, which decides what a server-held village checks (`Economy`, `economyHash`) and which commands a player may send (`PLAYER_COMMANDS`). Changing either changes what the server accepts: tell BACKEND (`docs/backend/REQUESTS.md`).

## Contract files (changing these needs INTEGRATION)

Listed per compartment in `compartments.json` → `contracts`. In short: `art/ninja.ts` exports (painter registries), `render/iso.ts`, `gameplay/control/controller.ts` + `battleSession.ts` (the command surface, including `onCommand`/`adoptEconomy`/`adoptVillage` for a server-held village), everything in `gameplay/sim` is readable by others (but only GAME THEORY edits it), and the backend ports: `analytics/events.ts`, `persist/saveStore.ts`, `payments/provider.ts`, `net/connection.ts`, `net/protocol.ts`, `net/villageSync.ts`, `platform/auth.ts`, `social/groveSource.ts`. `payments/provider.ts` also has `PurchaseVerifier` and `StoreReceipt` (the controller's purchase flow).
