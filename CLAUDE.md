# Kagemura: Ninja Clans (project instructions)

An original ninja-clan base-building and raiding game. You lead a clan, build a hidden mountain village, train specialised warriors, scout rivals, raid with smoke and sabotage, and climb the endless Shadow Trials. It was rebuilt in place from **Toadstool Kingdoms**: every working system was kept, internal ids stayed stable, and saves migrate (v9 to v10).

**Start here:** `AGENTS.md` (one AI session per compartment), `docs/rebuild/HANDOFF.md` (state of the build), `docs/rebuild/01-REBUILD-ANALYSIS.md` (pitfalls), `docs/rebuild/02-ARCHITECTURE.md` (structure and research).

## Compartments (each has its own CLAUDE.md)

| Section | Folder | Brief |
|---|---|---|
| 1. Art, GUI, animation | `src/presentation/art`, `audio` / `render`, `ui` | `src/presentation/art/CLAUDE.md`, `src/presentation/CLAUDE.md` |
| 2. Game theory, mechanics, user commands | `src/gameplay/` (`sim`, `data`, `control`) | `src/gameplay/CLAUDE.md` |
| 3. Backend: multiplayer, monetization, store compliance | `src/backend/`, `server/` | `src/backend/CLAUDE.md` |
| Composition root | `src/main.ts`, `src/app.ts`, `compartments.json` | `AGENTS.md` (INTEGRATION only) |

`tests/architecture/boundaries.test.ts` enforces the import rules in `compartments.json`. Keep it green.

## Device targets

- Windows 11 laptop (mouse, keyboard, trackpad), Google Pixel 7 (Chrome), iPhone (Safari).
- Installable PWA (`base: './'`, service worker `src/backend/pwa/sw.template.js`), deployed by `.github/workflows/deploy.yml` to GitHub Pages on pushes to `main`. Capacitor 8 wraps iOS and Android.
- `npm run dev` / `npm run dev:lan` for local and phone testing. Touch first, with mouse and keyboard as well; safe areas; portrait and landscape.
- Saves are per device (IndexedDB); Settings → Copy save code / Load from code moves them. Settings has FPS, time-skip and analytics tools. `?debug` exposes `window.tk` for scripted checks.
- Keep npm scripts cross-platform (Windows): no bash-only syntax in `package.json`.

## Decisions

- **Identity:** display names come from `src/gameplay/data/*.json`. Internal ids are unchanged (`docs/rebuild/ID_MAP.md`). The app display name is "Kagemura". The bundle id and product ids are still the old ones until new store listings exist (owner step).
- **Art:** all art is still generated in code (`src/presentation/art/ninja.ts`), with three visual tiers per building. Real images override any asset key through `public/art/manifest.json`. `npm run art` shows a gallery. ART AI brief: `docs/art/ART_AI_BRIEF.md`.
- **Save format** is versioned (`src/gameplay/sim/save.ts`, now **v11**: all 50 warriors and Keep 1–15), with a migration step per version. Bump `SAVE_VERSION` for every state change.
- **Protocol** is v5 (expanded roster, combat and five live defensive counters). Servers require v5 clients.
- **Ninja tactics:** Smoke Bomb (defense range × 0.4 inside the cloud, never below 2 tiles, 8 s, 1 + 1 per 40 housing charges, max 3, no stacking). Sabotage (Saboteur jams a defense 6 s; it is then immune for 10 s after recovering; one jam each). All numbers are in `battle.json` and `troops.json`.
- **Live defensive counters** (`src/gameplay/sim/battle/fortifications.ts`, `effect` in `buildings.json`): Paper Lantern Line (Keep 5, lights stealth/veiled warriors), Clockwork Repair Crane and Bitter Incense Burner (Keep 6, shorten jams / cut healing and auras), Kite-Cutter Ballista (Keep 8, grounds flyers 3 s, then 3 s immunity), Longbow Yagura (Keep 12, range 13, prefers attackers with range ≥ 4, blind inside 2 tiles). Soft: no stacking, short disables. Tests: `tests/gameplay/battle/counters.test.ts`.
- **Late-Keep curve:** every building level first unlocked after Keep 6 has HP and damage × 1.56 × 1.15^(Keep − 6), because armies outgrew bases (every army scored 100% from Keep 9). Measure with `npm run balance:armies` → `docs/game-theory/ARMY_BALANCE.md`; guard test `tests/gameplay/balance/army-lab.test.ts`.
- **Endless difficulty:** Shadow Trials (`src/gameplay/sim/trials.ts`, `trials.json`), paid once per tier and never farmable.
- **Progression model:** `docs/game-theory/PROGRESSION_MODEL.md`. All 50 warriors are live through Keep 15. Four heroes and non-live catalog buildings remain planned. Ability mechanics and balance limits are in `docs/game-theory/PLAYABLE_ROSTER.md`. Each warrior has its own code-drawn badge icon (`src/presentation/art/warriorIcons.ts`, Army → Warrior Codex). "Unlocked" in the Codex and Army list means trainable now: Keep gate and Dojo level both met (`troopUnlock` in `sim/army.ts`). 54 buildings in `progression.json`: 20 planned ones are designed against the roster (`effect`, `counters`, `counteredBy` in `buildingCatalog`; 5 of them are live in combat; matchup table in `docs/game-theory/ROSTER.md`) under rock-paper-scissors rules tested in `tests/gameplay/balance/building-matchups.test.ts`.
- **Honesty:** generated opponents and simulated raids are always labelled as such.
- Progression pacing is checked by a model-player test (`tests/gameplay/balance/`) that fights every raid as a real battle. Rerun it after changing costs, times, loot or combat numbers.
- Offers have `minAccountHours`. Real prices appear only in the Store and its confirm step.
- Owner-only steps (store accounts, products, secrets, server hosting, creating the new repo) are in `docs/SHIPPING.md` and `docs/rebuild/HANDOFF.md`.

## Balance pass (20 fixes)

A review against how this genre is usually balanced found 20 game-theory holes and curve problems. Each fix has a test:

| # | Problem | Fix | Test |
|---|---|---|---|
| 1 | Home + Attack rerolled opponents for free | The scouted opponent is kept (`state.scout`) until it is attacked or Next is paid | `tests/gameplay/sim/matchmaking.test.ts` |
| 2 | Next fee shrank to <1% of loot | `scoutFeeByHall` is ~3% of a hall's average loot | same |
| 3 | Trophies didn't affect opponents | `src/gameplay/sim/matchmaking.ts`: strength = trophies / `trophiesPerHall`; it sets the opponent's hall, building levels and loot, kept within 1 hall below / 1 above | same |
| 4 | Trophies only went up | Opponents' trophies follow their strength, so running ahead of your hall makes wins pay less and losses cost more; win 24 / loss 20 at parity | same |
| 5 | Attacks ~100% / 3★ at every hall | Defense damage ×4.5, defense HP ×3, other buildings and hedges ×1.5; full army at matched strength now does ~55-75% | `tests/gameplay/balance/combat.test.ts` |
| 6 | Balance test assumed 55% loot | Model player fights real battles | `tests/gameplay/balance/progression.test.ts` |
| 7 | Shinobi (`hedgehog_roller`) best at everything | Re-tuned troop stats; no troop dominates another; mixed armies beat Shinobi (`hedgehog_roller`)-only | `combat.test.ts`, `curves.test.ts` |
| 8 | Bot raiders got weaker as you grew | Raiders are matched by your trophies and bring a full army at their hall's research cap (`attackerFor`) | `tests/gameplay/sim/raids.test.ts` |
| 9 | Checking in every 29 min avoided all raids | Raids sit at fixed per-hour slots on the clock (`raidTimes`); only time with the game open (plus a 2 min grace) or shielded is safe | same |
| 10 | Tasks counted started work (train/upgrade then cancel) | `troopsTrained` and new `upgradesDone` count finished work | `tests/gameplay/sim/research.test.ts` |
| 11 | Donating swapped cheap troops for expensive ones | Donating gives XP only; gifts are only troops your Dojo has unlocked | `tests/gameplay/social/social.test.ts` |
| 12 | Raid profit per Dew grew 1.3x → 9.6x | Troop training cost rises with level; ratio stays ~2-4.5x | `curves.test.ts` |
| 13 | Troops had no levels | Troop research in the Training Dojo (`burrow_barracks`) (`src/gameplay/sim/research.ts`), capped by `troopLevelCap` in hall.json | `research.test.ts` |
| 14 | Hall timer jumped 36x at hall 4 | Hall times grow ~2.7x per level (hall 10 would be ~7 days) | `curves.test.ts` |
| 15 | Hall cost multipliers shrank | 1k → 4k → 20k → 130k → 850k (x4, 5, 6.5, 6.5); the hall stores little | same |
| 16 | Collector payback went up and down | Paybacks rise every level and stay under a week | same |
| 17 | No cap on loot from storage; no penalty for hitting lower halls | `storageLootCapByHall`; `lootPenaltyByHallDiff` (client, bots and server) | `raids.test.ts`, `matchmaking.test.ts` |
| 18 | Shield always 12 h | 12/14/16 h at 30/60/90% (`shieldTiers`) | `raids.test.ts` |
| 19 | Alliance/league rewards flat across halls | Resources scaled by `rewardScaleByHall` (Jade (`moonstones`) not scaled) | `curves.test.ts` |
| 20 | Buying a hall level was cheap | Steeper skip and top-up curves; rushing hall 5→6 costs >3x the starting Jade (`moonstones`) | `curves.test.ts`, `economy.test.ts` |

Numbers in the spec below that these replaced (skip/top-up curve points, 0-3 raids per absence, 12-hour shield) are superseded by the data files.

## Engagement features (and their limits)

Built to bring players back for good reasons, within App Store rules, FTC guidance and loot-box laws. Keep these rules when changing them:

- **Daily chest** (`src/gameplay/sim/daily.ts`, `src/gameplay/data/daily.json`): free, one per UTC day, contents drawn from a weighted table whose exact odds are shown before opening. The draw comes from the village seed + day, so reloading can't reroll it. It is never sold: no Moonstone or real-money way to open, reopen or reroll it. If a paid random item is ever added, its odds must be shown before purchase (App Review Guideline 3.1.1) and the loot-box laws in each target market checked first.
- **Streak**: one step per day on a 7-step ladder of bigger chests. A missed day never wipes it: a free weekly skip covers one day, otherwise you move back one step per missed day. Skips and streak repairs are never sold.
- **Limited-time events** (`src/gameplay/sim/events.ts`, `src/gameplay/data/events.json`): a fixed schedule repeating every 14 days. Start and end times come only from the schedule; nothing resets or extends them, so every countdown is real. Offers keep their deadline too (tested).
- **Notifications** (`planNotifications` in `src/gameplay/sim/reminders.ts`, `src/gameplay/data/notifications.json`): off until the player turns them on; each type can be switched off; none in quiet hours (they wait until morning); at most `maxPerDay` per local day.
- **Close calls** (`src/gameplay/sim/battle/closecall.ts`): "so close" notes after an attack, read from the finished battle and shown only when true. No rigged or faked near-misses, and no "almost" animations on random rewards: a chest only shows what it gave.
- The model player opens the chest daily and plays through events, so pacing (`tests/gameplay/balance/progression.test.ts`) includes this income.

## Stack

- Phaser **3.90** (spec says Phaser 3; Phaser 4 exists but was not adopted).
- Vite **8** and Vitest **5** (Vite 7 + Vitest 4 hit an npm peer-dependency resolution bug).
- TypeScript 5.9. No other runtime dependencies. The HUD is plain DOM + CSS (no UI framework).
