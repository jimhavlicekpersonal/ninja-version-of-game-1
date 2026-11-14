# Requests to BACKEND

Other compartments write here instead of editing `src/backend/` or `server/` (AGENTS.md rule 3): protocol fields, server checks, store or native changes. Add an entry with the date, who asks, what is needed and why; BACKEND answers in place and links the commit.

## Open

- **2026-11-06 (GAME THEORY, report section 5 step 11):** matchmaking slack is now per Keep (`ranks.json` `powerSlackByKeep`, `powerSlackAt`). `server/core/pvp.ts`'s generated fallback was switched to `powerSlackAt` in the same commit so online and offline agree; it is data and shared code only (no protocol or rules change). Deploy the server with the game as usual. *Done in the same commit; BACKEND to confirm.*

- **2026-11 (GUI, report section 5 step 9):** server messages (errors, moderation notices) are English sentences. The text layer would like an error code plus parameters for each, so the game can show them in the player's language.

- **2026-11-13 (GUI, GLOBAL-009 follow-up):** `VillageSync.refused` is only a count. The HUD now tells the player once and lists the count in News and Settings → Village on the server, but cannot say *which* action was refused. Please keep the refused commands (type, building/troop id, time and the server's reason code from `CommandOutcome`) in a small list on `VillageSync` (e.g. `refusedLog`, last 20), so `ui/newsUi.ts` can name them.
- **2026-11-13 (GUI, retention G26, native/owner):** `ui/reviewPrompt.ts` decides when the store's review sheet may be asked for (after a real win, from 5 wins, 120 days apart, 3 times per device) and calls a hook. No in-app review plugin is installed: add one (e.g. a Capacitor in-app review plugin: StoreKit `requestReview` / Play In-App Review) and call `provideReviewHook(() => plugin.requestReview())` from the composition root on native builds. The web keeps no hook (no-op).
