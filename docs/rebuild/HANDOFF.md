# Handoff: Kagemura rebuild (2026-11-02)

## Repos

- **Source:** `jimhavlicekpersonal/toadstool-kingdoms`. All work is on branch **`ninja-rebuild`** (commits on top of `main` @ `2970bf0`; CI green). `main` is untouched.
- **Target:** `jimhavlicekpersonal/ninja-version-of-game-1`. **Not created yet.** The cloud session that did this work can't create GitHub repositories. To finish:
  1. On GitHub, create an **empty** repository `ninja-version-of-game-1` (no README).
  2. Push the branch as its `main`:

     ```bash
     git clone --branch ninja-rebuild https://github.com/jimhavlicekpersonal/toadstool-kingdoms.git ninja-version-of-game-1
     ```

     ```bash
     cd ninja-version-of-game-1
     ```

     ```bash
     git remote set-url origin https://github.com/jimhavlicekpersonal/ninja-version-of-game-1.git
     ```

     ```bash
     git push -u origin ninja-rebuild:main
     ```

  3. In the new repo: Settings → Pages → Source: **GitHub Actions**. The deploy workflow then publishes the game on every push to `main`.

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

**Checks:** `npm test`: 42 files, 286 tests, all passing. `npm run build`, `npm run typecheck:server` and `npm run server:build` all pass.

## Not verified here (needs your devices or accounts)

- Real phones (Pixel 7, iPhone) and 60 fps on a mid-range device: only headless Chromium at phone sizes was used.
- Sound and music by ear (synthesized; checked only that it compiles and plays without errors).
- iOS / Android native builds, TestFlight, StoreKit sandbox purchase.
- GitHub Pages deploy of the new repo (it doesn't exist yet).

## Unfinished (prioritised)

1. **Make more warriors live.** 44 of 50 are design-only. Each needs `troops.json` stats from `warriorStats()`, Dojo/Keep gating, and its ability in the battle sim with a test. Suggested next five: Herbalist (heal), Ram Crew (wall bonus), Shadow Stalker (stealth), Hound Handler (summons), Twin-Fang Dancer (cleave).
2. **Keep levels 7–15**, Shadow Ink, the new buildings (Scroll Library first) and heroes (**Shadow Captain**). There is no hero system yet. Each needs a save migration.
3. **Mastery EXP** is in the model and docs but not yet tracked in the live game.
4. **Scroll-theft mission**: the first alternative objective, now that standard raids work.
5. **Real art:** hand `docs/art/ART_AI_BRIEF.md` + `ICON_MANIFEST.json` to an ART session. Live items first.
6. Owner steps: create the repo (above); trademark search for "Kagemura"; new bundle id and store listings when ready (`docs/SHIPPING.md`); host the server; Google Play Billing decision.

## Online features: honest status

Real PvP, real Alliances and Alliance Wars work **only with a hosted server** (`VITE_SERVER_URL` or Settings → Online play). Without one, everything social is bot-driven and labelled as practice. Smoke Bombs work online (protocol v3), but the server must be deployed from this branch: a v2 server would score smoke battles differently, so v3 clients refuse it.

## Next sessions

Use `AGENTS.md`: start a new Claude session per compartment with the prompt in its row. Each session works on its own branch, and an INTEGRATION session merges them.
