# Handoff: Kagemura rebuild (2026-11-02, Shadow Clans 2026-11-03)

## Repos

- **Home:** `jimhavlicekpersonal/ninja-version-of-game-1`, branch `main`. It holds the full history: the original Toadstool Kingdoms commits, the rebuild commits, and the repo's initial README commit merged in.
- **Origin:** `jimhavlicekpersonal/toadstool-kingdoms`. Branch `ninja-rebuild` has the same rebuild; its `main` is untouched. Do new work in the ninja repo.
- **Pages:** in the ninja repo, Settings → Pages → Source: **GitHub Actions**. Then every push to `main` publishes https://jimhavlicekpersonal.github.io/ninja-version-of-game-1/

## What works (verified)

| Area | Status | How it was verified |
|---|---|---|
| Three compartments + boundary rules | Done | `tests/architecture/boundaries.test.ts` |
| Ninja identity: names, descriptions, chat, tutorial, menus, icons, palette, music | Done | Full UI walk-through at 390×844 |
| Procedural art: Japanese buildings with 3 visual tiers each, chibi ninja troops, kunai/shuriken/firework projectiles | Done | Art gallery (`npm run art`) and in-game screenshots |
| Village: build (through the Build menu), upgrade, skip, collect, move | Kept, working | Browser playthrough |
| Train → scout (with scout report) → raid → results → loot banked → troops spent | Working | Browser playthrough, 0 console errors |
| **Smoke Bomb**: marked area with time left; range ×0.4, never below 2 tiles; 8 s; 1–3 charges from army size; no stacking | Working | `tactics.test.ts` (7 tests) + live taps in the browser |
| **Sabotage**: Saboteur jams a defense 6 s (dimmed, jam marker, recovery ring), then 10 s immunity; one jam each; can't keep a defense silent | Working | `tactics.test.ts` + browser (`jammed now 1`) |
| Early sabotage then main attack through the normal troop bar | Working | Saboteur card is first; tactic hint shown |
| Five opponent layout archetypes (Kunai Ring, Walled Keep, Mortar Core, Twin Gates, Open Courtyard) | Working | Used by Shadow Trials; scout tips differ per layout |
| **Shadow Trials** (endless difficulty): 24 tiers through every Keep level, then +6% per tier forever, modifiers every 5/10 tiers, reward once per tier | Working | `trials.test.ts` (11 tests) + browser |
| Rewards: no duplicates (trial tier paid once; battle banked once; rapid taps can't double-throw smoke) | Working | tests above + `interrupted.test.ts` |
| **Interrupted raids** play out on next launch, banked once | Working | `interrupted.test.ts` + browser reload mid-raid |
| Save v9 → v10 migration; save and reload | Working | `trials.test.ts`, `migration-full.test.ts`, browser reload |
| Multiplayer server and protocol v3 (abilities) | Kept, working in tests | 52 backend tests locally; GitHub CI `server` job (Postgres + contract test) green on this branch |
| Practice opponents clearly labelled | Done | "Practice target · Generated rival (offline)", "(simulated raider)", "Shadow Trial" |
| Progression model + 50 warriors + 4 heroes + 34 buildings | Design complete, 6 warriors live | `progression-model.test.ts`: the model reproduces the live troops within 3% |
| Icon manifest (504 images) + ART AI brief + real-art loader | Done | `npm run docs:progression`; `public/art/manifest.json` loads in game |
| Mobile sizes | Checked | 390×844, 360×640, 844×390 screenshots |

| **Shadow Clans** (`docs/game-theory/SHADOW_CLANS.md`): 7 persistent AI clans, rivals board (AI and real players, labelled), world map with conquest and tribute, AI factions (missions, support squad, weekly war), Shadow Rank (real players only), normalized tournaments, catch-up, war formats, health view | Working offline; server parts in tests | `tests/gameplay/world/*` (46), `tests/backend/server/shadow.test.ts` (14, memory and Postgres), connection and health tests; browser walk-through at 390×844, 360×640 and 844×390 (first raid, rivals board, every World tab, a tournament battle, a settlement conquest), 0 console errors |
| Save v10 → v11 (world state) → v12 (clan treasuries) and protocol 4 (additions; v2/v3 clients still work) | Working | `migration-full.test.ts`, `shadow.test.ts`, contract tests |
| Shadow Clans completion pass: rivals board inside the matchmaking window, clan treasuries, 50 layouts per clan, terrain, signature warriors, data-driven constants; online shared territory, leaders' war targets, war formats in Alliance War pairing, Alliance board, install keys, measured demand, stored combat rating, army snapshots, fairness and participation metrics; pacing (Keep 6 in ~4.2 days, was ~14) | Working | `tests/gameplay/world/*`, `tests/backend/server/shadow.test.ts` (memory and Postgres), `tests/backend/contract/` (protocol 4), `progression.test.ts` |

**Checks:** `npm test`: 51 files, 379 tests, all passing (the backend suites also pass against Postgres 16 with `TEST_DATABASE_URL`). `npm run build`, `npm run typecheck:server` and `npm run server:build` all pass. Model-player pacing: Keep 3 at about 1 hour, Keep 4 within the first day, Keep 5 at about 2.2 days, Keep 6 at about 4.2 days.

## Not verified here (needs your devices or accounts)

- Real phones (Pixel 7, iPhone) and 60 fps on a mid-range device: only headless Chromium at phone sizes was used.
- Sound and music by ear (synthesized; checked only that it compiles and plays without errors).
- iOS / Android native builds, TestFlight, StoreKit sandbox purchase.
- GitHub Pages deploy: it depends on the Pages setting above.

## Unfinished (prioritised)

0. **Shadow Clans still open** (`docs/game-theory/SHADOW_CLANS.md`): a server-authoritative village economy (today tickets carry an army snapshot and battles are re-simulated, but resources and research live on the device), Keep levels 7-10, cross-player retention analytics on a hosted server.

1. **Make more warriors live.** 44 of 50 are design-only. Each needs `troops.json` stats from `warriorStats()`, Dojo/Keep gating, and its ability in the battle sim with a test. Suggested next five: Herbalist (heal), Ram Crew (wall bonus), Shadow Stalker (stealth), Hound Handler (summons), Twin-Fang Dancer (cleave).
2. **Keep levels 7–15**, Shadow Ink, the new buildings (Scroll Library first) and heroes (**Shadow Captain**). There is no hero system yet. Each needs a save migration.
3. **Mastery EXP** is in the model and docs but not yet tracked in the live game.
4. **Scroll-theft mission**: the first alternative objective, now that standard raids work.
5. **Real art:** hand `docs/art/ART_AI_BRIEF.md` + `ICON_MANIFEST.json` to an ART session. Live items first.
6. Owner steps: turn on Pages (above); trademark search for "Kagemura"; new bundle id and store listings when ready (`docs/SHIPPING.md`); host the server; Google Play Billing decision.

## Online features: honest status

Real PvP, real Alliances, Alliance Wars, Shadow Rank, regions, faction membership and tournament boards work **only with a hosted server** (`VITE_SERVER_URL` or Settings → Online play). Without one, everything social is bot-driven and labelled as practice. Smoke Bombs work online (protocol v3), but the server must be deployed from this branch: a v2 server would score smoke battles differently, so v3 clients refuse it.

## Next sessions

Use `AGENTS.md`: start a new Claude session per compartment with the prompt in its row. Each session works on its own branch, and an INTEGRATION session merges them.
