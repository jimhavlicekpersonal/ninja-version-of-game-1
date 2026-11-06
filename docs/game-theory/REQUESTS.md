# Requests to GAME THEORY

Other compartments write here instead of editing `src/gameplay/` (AGENTS.md rule 3). Add an entry with the date, who asks, what is needed and why; GAME THEORY answers in place and links the commit.

## Open

- **2026-11 (GUI):** give `scoutReport` (`sim/battle/scout.ts`) the attacker's army so the sim words the scout tips itself; today `battleHud.ts` drops tips that name a warrior the player didn't bring (`TODO(GAME THEORY, …)` in `battleHud.ts`).
- **2026-11 (GUI, report section 5 step 9):** sim events and messages that reach the player still carry English sentences (`fail(code, message)`, close-call notes). Text layer wants ids and numbers (the code plus parameters) so the UI can say them in the player's language.
