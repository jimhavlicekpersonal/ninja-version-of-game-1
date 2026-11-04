# Kagemura: Ninja Clans (project instructions)

An original ninja-clan base-building and raiding game. You lead a clan, build a hidden mountain village, train specialised warriors, scout rivals, raid with smoke and sabotage, and climb the endless Shadow Trials. It was rebuilt in place from **Toadstool Kingdoms**: every working system was kept, internal ids stayed stable, and saves migrate (v9 to v10).

**Start here:** `AGENTS.md` (one AI session per compartment), `docs/rebuild/HANDOFF.md` (state of the build), `docs/rebuild/01-REBUILD-ANALYSIS.md` (pitfalls), `docs/rebuild/02-ARCHITECTURE.md` (structure and research). Online PvP plan (ranking, hosting, client data, app stores, Friends and Gangs of up to 4, step list): `docs/backend/PVP_ROADMAP.md`.

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
- Saves are per device (IndexedDB); Settings → Copy save code / Load from code moves them (a village kept on the server is the exception: the server holds it). Settings has FPS, on-device analytics, and a crash-report switch when the build has a Sentry DSN. Time-skip tools and the instant test store exist only in the **testing sandbox** (`?sandbox` or `?debug`): a separate save that never goes online. The public web build has no store (`UnavailablePaymentProvider`) and runs on real time. `?debug` also exposes `window.tk` for scripted checks.
- Keep npm scripts cross-platform (Windows): no bash-only syntax in `package.json`.

## Decisions

- **Identity:** display names come from `src/gameplay/data/*.json`. Internal ids are unchanged (`docs/rebuild/ID_MAP.md`). The app display name is "Kagemura". The bundle id is still the old one until new store listings exist (owner step); store product ids have their own names (`store.json` `storeProductIds`: `jade_pouch` … `season_scroll`), mapped from the game's unchanged ids.
- **Art:** all art is still generated in code (`src/presentation/art/ninja.ts`), with three visual tiers per building. Each building shows its job: resource by colour and pictogram (gold coin = coins, straw sheaf = rice), producers look busy (chimney smoke, furnace glow, water), stores look shut (namako lattice, locks, stacked bales), and noren curtains or signboards carry a mark (crossed blades = Dojo, hammer = Artisan's Hut, crest = Lodge). Resolution: the canvas follows the screen up to 3x, buildings are drawn at 2.5x, warriors and badges at 3x, the island at 1.5x (`render/assets.ts`; ~120 MB of textures, inside iOS Safari's canvas budget). Fonts: M PLUS 1 (body) and Shippori Mincho B1 (titles), self-hosted in `src/presentation/ui/fonts/` (OFL). The plateau floats on a sea of clouds (`ground.ts`, `addSurroundings` in `render/assets.ts`). HUD icons are gradient SVGs whose ids `icon()` makes unique per copy. App icon and splash screens come from `npm run brand` (`tools/brand/brand.mjs`; needs Playwright). Real images override any asset key through `public/art/manifest.json`. `npm run art` shows a gallery. ART AI brief: `docs/art/ART_AI_BRIEF.md`.
- **Save format** is versioned (`src/gameplay/sim/save.ts`, now **v12**: donated-troop levels, research lanes, army presets, settled-season log, tasks fixed per period), with a migration step per version. Bump `SAVE_VERSION` for every state change. `repairTrainingQueue` runs on every load: one bad timer must never cost a player their village.
- **One writer per village:** every stored save carries a revision and `saveStore.save` refuses to write over one it didn't read (`SaveConflictError`), so a tab left open can't erase newer progress. The tab opened last owns the village; the other shows "Open somewhere else". A save the game can't read is kept (`backupDamaged`) and offered back at start-up and in Settings (`controller.backups`, `restoreBackup`). A save from a newer build stops the boot instead of being replaced.
- **Battle rules** are versioned (`SIM_RULES` in `sim/battle/battle.ts`, now 2). Records carry the rules they were fought under; older replays are shown as unavailable, never replayed wrongly. `tests/gameplay/battle/rules-version.test.ts` fails when combat data changes without a bump.
- **Protocol** is v7 (the server owns the economy; every request carries `X-Protocol`, `X-Sim-Rules`, `X-Client-Build`, writes an `Idempotency-Key`; older games get `426 version_mismatch` and are told to update). v6 brought the audit fixes (donated levels, idempotent tickets, server-confirmed loot, legal bases and armies, equal war rosters).
- **Server (roadmap code steps 10–48 done; protocol 7 from step 26; `docs/backend/PVP_ROADMAP.md` marks each step, owner steps stay unticked with what was prepared):**
  - *Hardening (Phase 1):* the server issues each ticket's battle seed and refuses reports played with another; each base is stored once by content hash and replays are kept 30 days; database changes are numbered migrations run by `npm run server:migrate` as a release step (the server won't boot with pending ones); rate limits per IP, token and costly route (`429 rate_limited`, retryable for the client) and body limits; `DELETE /v1/me`, a web deletion page (`/account/delete`) and Settings → Account; reports, blocks, auto-hide after 3 reporters, chat mutes and a staff queue behind `ADMIN_TOKEN`.
  - *Scale and operations:* optional Redis (`REDIS_URL`) for the leaderboard sorted set, match locks (two attackers never get the same defender) and shared rate limits, through a small hand-written RESP client; JSON logs with request ids, Sentry envelopes without the SDK (server `SENTRY_DSN`, game `VITE_SENTRY_DSN` + Settings switch), `/healthz` and `/readyz`, Prometheus metrics behind `METRICS_TOKEN` (re-sim time, battles, desyncs from `BattleSubmission.clientHash`, errors by code). `npm run server:bench` measured re-simulation at 5 ms (Keep 1) to ~0.45 s p95 (Keeps 8–15) on a 2.1 GHz vCPU: a worker pool (roadmap step 57) is needed before real load.
  - *Server-owned village (Phase 2, steps 19–26):* the game moves its village to the server when it connects (`POST /v1/village/import`, refused if its Keep could not hold it; Settings says why), or starts a new one there. The game queues each economy command (`PLAYER_COMMANDS`, `sim/serverEconomy.ts`) with its time and `economyHash`; the server replays it with the same `applyCommand`, clamps times to its clock, and sends corrections when the hashes differ (the server wins). Attacks, war attacks, chests and gifts settle server-held villages in one transaction with the result, with an append-only ledger. Linked sign-ins (Apple, Google, Game Center, Play Games; `server/identity/verify.ts`) restore the account and its village on another device (cloud save). Purchases stay trusted from the device until Phase 4.
  - *Ranking (Phase 3, steps 27–32):* hidden Attack and Base Ratings (`sim/rating.ts`, `ranks.json` `rating`) pick the fairest base after the Keep window and power floor; bots never move a rating; a defender loses at most 150 honor a UTC day; a rebuilt layout restarts its Base Rating; a Power Ranking (skill plus Keep) beside the Honor leaderboard. Convergence is simulated in `tests/gameplay/balance/rating-convergence.test.ts`.
  - *Payments (Phase 4, steps 35–38):* the server checks every store receipt before delivery (`server/payments/apple.ts`: StoreKit 2 JWS against Apple's pinned root; `google.ts`: Play Developer API, consume, RTDN and Voided Purchases), credits each store transaction once, applies the under-18 cap across devices before the store is asked (purchase intents), and takes refunds back from a server-held village (`revokePurchase`). The game finishes a store transaction only after delivery; unfinished ones are delivered later; Store → Restore purchases. Android purchases only in builds made with `VITE_PLAY_BILLING=1`.
  - *Push and deployments (steps 40, 42, 43):* server push through APNs/FCM (raided, donations, Alliance War found; per-device types, quiet hours, `maxPerDay`); `DEPLOY_ENV` (production refuses to start without its essentials; a database belongs to one deployment); `.github/workflows/server.yml` (tests → Docker image → staging → contract tests, production by hand).
  - *Operations (steps 44–48):* encrypted daily backups with a weekly automated restore drill (`tools/ops/`, `.github/workflows/backup.yml`), two-instance test, IPv6 listening and HSTS (`tools/ops/check-domain.mjs`), `npm run server:load` (one instance holds ~3 full-army battles/s: re-simulation blocks the event loop, so the worker pool, step 57, comes before launch), alert rules (`ops/prometheus/alerts.yml`) and `SERVER_NOTICE`, the staff tool at `/admin` (lookup, give/take, suspend, rating reset, staff log).
  - *Store submission kit (owner steps 49–53):* `docs/store/` and `npm run store:screenshots`.
  - Details: `docs/PROTOCOL.md`, `docs/SHIPPING.md`, `docs/backend/PVP_ROADMAP.md`.
- **Infiltration Points** (`src/gameplay/sim/battle/infiltration.ts`, `infiltration` in `battle.json`): warriors enter only inside the base's 6 points (map corners and edge midpoints, an opposite pair closed by the layout), and each point hides a third of the army's housing (minimum 15), so a full army comes in as at least three squads. Smoke Bombs still go anywhere. Scouting shows the points and the defenses covering each path to the Keep. Battles without `setup.infiltration` (records from before the rule) keep free placement. With it, a planned attack (mixed squads, chosen approach) beats a lazy one by about 9–29 points (Keeps 4–8) and best vs worst approach differ by 15–40 (`tests/gameplay/balance/placement.test.ts`). Defense damage ×1.3 and HP ×1.15 at every level, so a planned attack lands at ~60–80% and brute force falls short.
- **Ninja tactics:** Smoke Bomb (warriors *inside* the cloud can only be shot from defense range × 0.4, never below 2 tiles; 8 s, 1 + 1 per 40 housing charges, max 3, no stacking). It is taught as "smoke your warriors as they walk into tower range", which is what the rule rewards. Sabotage (Saboteur jams a defense 6 s; it is then immune for 10 s after recovering; one jam each). All numbers are in `battle.json` and `troops.json`.
- **Live defensive counters** (`src/gameplay/sim/battle/fortifications.ts`, `effect` in `buildings.json`): Paper Lantern Line (Keep 5, lights stealth/veiled warriors), Clockwork Repair Crane and Bitter Incense Burner (Keep 6, shorten jams, stuns and Hawk Tamer slowing / cut healing and auras), Kite-Cutter Ballista (Keep 8, a control tower: its bolt grounds a flyer 3 s, then 3 s immunity, and ground defenses finish it), Longbow Yagura (Keep 12, range 13, prefers attackers with range ≥ 3.5, blind inside 2 tiles). Soft: no stacking, short disables. A building being upgraded neither fires nor runs its effect, and scouting doesn't count it. Generated bases put the Crane and Incense next to the defenses they cover. Tests: `tests/gameplay/battle/counters.test.ts`, `audit-ai.test.ts`.
- **Late-Keep curve:** every building level first unlocked after Keep 6 has HP and damage × 1.56 × 1.15^(Keep − 6), because armies outgrew bases (every army scored 100% from Keep 9). On top, defense levels get a measured mid-Keep bump (Keep 5 ×1.08, 6 ×1.15, 7–8 ×1.2 tapering to 12 ×1.04, 13–15 ×1.06; `tools/balance/midkeep.mjs`). Keep 7 was a hole (its bases fielded Keep 6 levels while armies gained two research levels and a new tier; every army scored ~100%): Keep 7 now unlocks Kunai Tower level 9, Shuriken Pagoda level 8 and Firework Mortar level 6, and the Tower's and Pagoda's Keep 6 levels are ×1.5 so the step into the late curve is no longer ×2.17. Measure with `npm run balance:armies` → `docs/game-theory/ARMY_BALANCE.md`; outcome gates at Keeps 7, 8 and 15 in `tests/gameplay/balance/army-lab.test.ts` (no army over 92% or 60% three-stars on same-Keep bases; ranged-heavy within 20 points of a balanced mix).
- **Air pays for flying:** the Sky role's power budget is lower (efficiency 0.494, HP/DPS 2.7: air troops have 0.45× the HP and 0.75× the damage of the old numbers), because flyers skip walls and every ground-only defense; air used to win ~100% at every Keep. Anti-air keeps up late: Sky Bow Tower goes to level 10 with a third tower from Keep 11, and Sky Bow and Ballista HP is ×1.6.
- **Range pays for safety:** Throwers deal 0.7× damage (efficiency 0.627, HP/DPS 3.43), because they fire from behind the front line and over walls (ranged mixes three-starred 69–100%). Warriors that still measured too strong carry a DPS tax (`dpsScale` in `roster.json`): Siege Bombardier 0.5 (and range 5, inside a Cannon's reach), Thousand Needle 0.6 (range 5), Hawk Tamer 0.6. See `docs/game-theory/PLAYABLE_ROSTER.md`.
- **Matchmaking follows earned power:** opponents are never weaker than the attacker's own strength (Keep and research progress on the Keep's level scale, where a newer tier's level 1 counts as 1 + `levelCapOffset`; `attackerStrength`) minus `powerSlack` 0.25, so a maxed Keep 15 army meets Keep 15 bases even while its honor lags (the audit measured 97% three-star raids at Keep 15). `npm run balance:campaign` → `docs/game-theory/CAMPAIGN.md`.
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

## Gameplay audit (November 2026, 37 findings)

An external audit (simulated campaigns, 4,435 battles) found settlement, timer and online-authority bugs, AI and generator flaws, pacing walls and balance holes. Every finding has a fix and a test:

| # | Problem | Fix | Test |
|---|---|---|---|
| F01–F02 | Time skip and a free mock store in the normal build | Testing sandbox only (`?sandbox`): separate save, offline; public web store unavailable | `payments-sandbox.test.ts` |
| F03–F04 | Server accepted illegal bases and armies | Keep counts/levels, field allowlist, loot holders; earliest-Keep troops, camps vs Lodge, donated levels | `online-authority.test.ts` |
| F05 | Online loot banked before the server agreed | Attack recorded as pending; loot from the server's answer; refused = practice; idempotent tickets | same |
| F06, F19 | War attacks escaped interruption; no war replay | War battles tracked and settled once; kept in the battle log | same |
| F07 | Online raids took collector loot from storage | Losses split by building (re-simulated) | `audit-settlement.test.ts` |
| F08, F16, F17 | Research, task days, seasons not settled while open; overnight work lost from tasks | `advance` finishes timers in time order and settles seasons; `tick` covers research, days, seasons | same |
| F09 | Donated troop levels discarded | Lodge keeps a level per type; `BattleSetup.reinforcements` | same |
| F10, F21 | Counters active while upgrading; scouting disagreed | `activeInBattle` everywhere | same |
| F14, F15 | Overflow warnings inverted; chests reported unreceived resources | `banked` / `overflow` on records and events; warning before one-time claims | same |
| F18 | Replays changed after balance patches | `SIM_RULES` per record | `rules-version.test.ts` |
| F11–F13 | Cranes far from defenses; siege shot peripheral walls; healers stalled | Placement by coverage; breach only the wall in the way; support fallback | `audit-ai.test.ts` |
| F20 | Tutorial taught a smoke placement that protected nobody | Teach smoke over your warriors as they reach a tower | same |
| F22–F24 | Late three-star farming; ranged dominance; Thunder > Dragon Kite | Power-floor matchmaking; Thrower cut, DPS taxes, mid-Keep defenses; kite kits | `army-lab.test.ts`, `matchmaking.test.ts` |
| F25–F29 | 13 h refills; 6.7-year research; no batch/presets/dismiss | Dojo training speed, next-army queue, research lanes and one curve, batch, presets, retrain, dismiss, practice battles | `audit-pacing.test.ts`, `progression-model.test.ts` |
| F30–F32 | Impossible tasks; flat pass rewards; milestones ended at Keep 6 | Eligible tasks fixed per period; Keep-scaled pass; leagues to 5,200 honor; achievements to Keep 15 | `audit-pacing.test.ts` |
| F33 | Trial difficulty spikes | Median-strength fortress, layout factors, alternate fortress after a failure | `trials.test.ts` |
| F34 | Unequal war rosters | Equal rosters, side attack cap, destruction tiebreak | `online-authority.test.ts` |
| F35–F37 | Lab confound; narrow model player; formula-only tests | Effect-only counter comparison; defender/explorer/engaged policies and campaigns; outcome gates | `army-lab.test.ts`, `policies.test.ts` |

Details and remaining owner decisions: `docs/rebuild/HANDOFF.md` ("Gameplay audit fixes").

## Army overhaul (November 2026)

The Army panel, training queue and saving were traced end to end in a browser. Queue and save fixes have tests (`tests/gameplay/sim/army-queue.test.ts`, `tests/backend/persist/saveStore.test.ts`). Panel behaviour (A11–A13, A16, A19, A21) has no DOM test: there is no browser in `npm test`, so check it by hand.

| # | Problem | Fix |
|---|---|---|
| A1 | Finish training with more queued than the camps hold left timers ending before they began; the next load called the save damaged and started a new village | `skipTraining` keeps `startedAt <= endsAt`; `repairTrainingQueue` heals old saves on load |
| A2 | The wiped village sat in a hidden backup with no way back | `backups`/`restoreBackup`, offered at start-up and in Settings |
| A3 | A forgotten tab's 15-second autosave erased newer progress | Save revisions (`SaveConflictError`), a "taken over" screen, a save on becoming visible |
| A4 | A save from a newer build was replaced by a new village | `NewerSaveError` stops the boot and leaves the save alone |
| A5 | Fill bought two armies | `fillCount`: fill the camps; only then the next army (the button reads `Fill 20` or `Next 20`) |
| A6 | Finished warriors with no room showed `0s` forever | `armyView`: training / next / waiting stacks, with the reason in words |
| A7 | Cancelling the first warrior restarted every finished warrior and the one in training | `retimeQueue` moves only warriors who haven't started |
| A8 | A stale index could cancel the wrong warrior | `cancelTraining` takes the `troop`, and `count` for a whole stack |
| A9 | Jade paid for warriors who could only wait | `trainingSkipQuote` covers the warriors who fit |
| A10 | One redraw copied the village about 100 times; Fill froze the game for about a second | `armyView` settles once; `trainQuoteOn` and `researchStartQuoteOn` take a settled village |
| A11 | The whole panel rebuilt on every change: scroll jumped, taps were lost, dropdowns closed | `armyUi.ts`: pinned strip plus tabs, per-card rebuilds, none mid-tap |
| A12 | A new player saw an empty panel | Setup card names what's missing and links to Build |
| A13 | A long queue was one tile per warrior | Stacks with −1 and All |
| A14 | Refill toast said done after a partial refill | `train_short` event: how many are missing, and why |
| A15 | A new saved army could overwrite another after a delete; contents were tooltip-only | `nextArmyName`; contents shown |
| A16 | Dismiss was all or nothing | Dismiss 1 or all |
| A17 | The tutorial could stall on Finish training | The step ends when nothing more can be finished |
| A18 | No army status on the village screen, none on coming back, donated warriors invisible | Army pill, `summary.trained`, Lodge row |
| A19 | A warrior thumbnail asked for too early stayed blank | `thumbOf` remembers only real images |
| A20 | A finished warrior too big for the space left blocked everyone behind it, so free space sat empty | `finishTraining` lets anyone who fits walk past; `queueFits` is the same rule for quotes and the panel |
| A21 | "Army" meant space in one place and warriors in another; one line mixed both; the waiting warriors were listed last; timers and the missing Finish button went unexplained | Bar counts `Space`, everything else counts warriors; queue order; "needs N space", "Done in", "No room to finish" |

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
- TypeScript 5.9. No other runtime dependencies (the server adds only Fastify and `pg`; its Redis client and Sentry envelopes are hand-written). The HUD is plain DOM + CSS (no UI framework).
- Server checks: `npm run typecheck:server`, `npm run server:build`; set `TEST_DATABASE_URL` (Postgres) and `TEST_REDIS_URL` (Redis) to run the adapter tests that are skipped without them.
