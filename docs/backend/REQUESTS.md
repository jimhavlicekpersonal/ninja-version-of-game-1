# Requests to BACKEND

Other compartments write here instead of editing `src/backend/` or `server/` (AGENTS.md rule 3): protocol fields, server checks, store or native changes. Add an entry with the date, who asks, what is needed and why; BACKEND answers in place and links the commit.

## Open

- **2026-11-06 (GAME THEORY, report section 5 step 11):** matchmaking slack is now per Keep (`ranks.json` `powerSlackByKeep`, `powerSlackAt`). `server/core/pvp.ts`'s generated fallback was switched to `powerSlackAt` in the same commit so online and offline agree; it is data and shared code only (no protocol or rules change). Deploy the server with the game as usual. *Done in the same commit; BACKEND to confirm.*

- **2026-11 (GUI, report section 5 step 9):** server messages (errors, moderation notices) are English sentences. The text layer would like an error code plus parameters for each, so the game can show them in the player's language.
