# New findings, 2026-11-27 (audited commit `4b79711`)

Machine-readable form of Part A of `BLUEPRINT.pdf`. None of these appears in the earlier audits. 
Revalidate each against the current code before fixing it; close it with the fixing commit and a test.

| ID | Sev | Lane | Finding | Where | Checked |
|---|---|---|---|---|---|
| X-1 | HIGH | X | Three unmerged lines of work have left `main`; two of them conflict in 53 files | `claude/gifted-darwin-xt5n6e` (20 commits, 325 files, +44,592 lines: battle rules 10, three buildings, two heroes and hero choice go live, plurals rewritten in 50 languages), `claude/relaxed-cori-mhvk90` (4 commits, 118 files: Jade batch buying, eight army strategies, 18 tutorial lessons), `claude/busy-hamilton-dfgic0` (1 commit: a new music engine). All branch from `main` 4b79711. | Reproduced |
| FUZ-1 | HIGH | FUZ | One crafted `abandonBattle` command switches off the army size limit for the rest of the batch: an army of two, then four, times the camps on a server-held village | `src/gameplay/sim/village.ts:2467-2475` (`deployedTroops` tests `data.troops[d.troop]`, which is truthy for inherited names such as `hasOwnProperty`); `src/gameplay/sim/army.ts:219-236` (stores `NaN` as an army count), `:14-18`, `:40-56`. | Re-checked |
| FUZ-2 | HIGH | FUZ | Walls placed against a building protect nothing from melee warriors, and make each of them run a failed whole-map path search every tick | `src/gameplay/sim/battle/pathfind.ts:96-151` (a goal tile must be standable); `src/gameplay/sim/battle/battle.ts:540-548` ("Fully walled in: walk straight at it", with the failed search repeated next tick). | Re-checked |
| RUN-1 | HIGH | RUN | On a 360x640 phone the "End the battle?" dialog cannot be answered: the squad-order strip is drawn over both of its buttons | `src/presentation/ui/styles.css:1208-1209` (`.squad-row` has `z-index: 1`); `:303` (`.modal-backdrop` has none), both inside `#battle-hud`. | Re-checked |
| NAT-1 | HIGH | NAT | The iOS privacy manifest declares no required-reason API, but the app's own Swift uses `UserDefaults`: the first TestFlight upload is refused | `ios/App/App/TkNativePlugin.swift:24,30`; `ios/App/App/PrivacyInfo.xcprivacy:5` (comment "No required-reason API is used") and `:112-113` (empty `NSPrivacyAccessedAPITypes`). | Re-checked |
| DB-1 | HIGH | DB | Deleting an account gets slower with all-time history and will start failing outright | `server/stores/pg/players.ts:187-306` (`deletePlayer`). The only indexes on `tickets.attacker_id` and `defender_id` are partial ("where not used"); `raid_pairings` and `squad_wars` are searched by roster contents with no index and are never pruned; chat is scanned by text. | Re-checked |
| API-1 | HIGH | API | Joining and leaving an Alliance has no cooldown or rate rule: one free account can flood any Alliance's chat, and nobody can stop it | `server/routes/social.ts:18,20` (join and leave carry no rate rule); `server/core/groves.ts:89-123` (no cooldown, every Alliance is open, one system chat line per join and per leave), `:138-149` (chat returns at most the newest 100 rows). | Re-checked |
| REPO-1 | HIGH | REPO | `main` is unprotected and was red 43 % of the time while work and closure records kept landing on it | GitHub: branch `main` `protected: false`, no rulesets; 70 "Test, build and deploy" runs on `main`: 41 green, 23 red, 6 cancelled. | Re-checked |
| REPO-2 | HIGH | REPO | The repository is public: the exploit catalogues, open security items, anti-cheat code and CI artifacts are readable by anyone | GitHub: `visibility: public`, no licence. `docs/audit/understand-2026-11-16/exploits.md`, the ledger (the open BLOCKER, the collusion paths), both Beast Mode prompts, all of `server/`. Artifacts: `android.yml:279-283` (signed release bundle, 30 days), `content-preview.yml:36-40` (unreleased content), `backup.yml:63-68` (the encrypted database dump, 35 days). | Re-checked |
| X-2 | MEDIUM | X | A tutorial timer that is never stopped turns CI red at random | `src/presentation/ui/tutorial.ts:151-152` (a 400 ms `setInterval`, cleared only when the tutorial finishes); `tests/presentation/dom/hud.dom.test.ts:42-55` leaves it running. | Reproduced |
| X-3 | MEDIUM | X | The evidence the Beast Mode prompt calls canonical is not in the repository | `docs/prompts/BEAST_MODE_2026-11-21.md` cites `docs/audit/bulletproof-2026-11-21/{ECO,SAV,SEC,STB,OPS,UX,GT}.md` and an `evidence/` folder; the folder holds only `PROGRESS.md`, on `main` and on every branch. | Reproduced |
| X-4 | MEDIUM | X | Every sentence lives in 50 files, so any two branches that touch text collide | `locales/*/ui.json` (50 files), rewritten by every commit that adds or changes a string. | Reproduced |
| SOAK-1 | MEDIUM | SOAK | Every opening of the Store stays in memory for the rest of the session | `src/presentation/ui/economyUi.ts:145` (`liveBuyButtons`), `:179` (every buy button is added), `:153-156` (the only removal, which runs only when a purchase starts). | Re-checked |
| FUZ-3 | MEDIUM | FUZ | A save whose tasks, Season Scroll or calendar has the wrong shape passes validation, and the game then throws instead of offering the damaged save back | `src/gameplay/sim/save.ts:478` (these objects are checked only for being present; `calendar` and `stipend` not at all). | Reproduced |
| RUN-2 | MEDIUM | RUN | Tutorial step 6 rings a button that does not respond for up to 22 seconds, under a message that contradicts the screen | Army panel during the tutorial (`src/presentation/ui/tutorial.ts`, `armyUi.ts`), seen at 360x640. | Re-checked |
| DATA-1 | MEDIUM | TIME | A Trial catch-up clear counts as one tier, so late starters can never finish the Trial Walker achievement | `src/gameplay/sim/village.ts:2320` (`trialsCleared++` after a clear that skipped tiers); `src/gameplay/data/achievements.json` `trial_walker` (steps at 5, 25, 40 and 53 tiers). | Re-checked |
| DATA-2 | MEDIUM | TIME | The last step of the Master Artisan achievement (1,000 upgrades, 100 Jade) cannot be reached | `src/gameplay/data/achievements.json` `busy_beaver`; `src/gameplay/sim/village.ts:377,677`; `tests/gameplay/balance/achievements-reachable.test.ts:35-36`. | Read |
| TIME-1 | MEDIUM | TIME | One session with the phone's date set ahead freezes a device-held village for as long as the error, once the date is corrected | `src/gameplay/sim/resources.ts:41` and `src/gameplay/sim/offline.ts:38-39` (elapsed time is clamped at zero; nothing compares the save's stamps with the clock on load); the daily chest, calendar, stipend, tasks and season roll all key on the stored day. | Reproduced |
| NAT-2 | MEDIUM | NAT | The gate that should tell players with an old Android System WebView to update does not work | `capacitor.config.ts:26-27` (`minWebViewVersion: 80` with no `server.errorPath`); `src/backend/pwa/boot.js:135-138` (the syntax probe uses `new Function`); `tools/release/csp.mjs:28` (no `unsafe-eval`). | Re-checked |
| NAT-3 | MEDIUM | NAT | A dead WebView renderer rebuilds the Android activity at once, every time, with no limit: a renderer that crashes at start loops forever | `android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java:27-39` (`recreate()`); `TkBillingPlugin.java:61-67` (no `endConnection`). | Read |
| NAT-4 | MEDIUM | NAT | `getBridge()` is used without a null check: when Android cannot create a WebView the app crashes at launch instead of showing Capacitor's notice | `MainActivity.java:27`. | Re-checked |
| DB-2 | MEDIUM | DB | After a Redis outage, two server instances rebuilding the leaderboard overwrite each other and leave most players off it | `server/shared.ts:112-130` (`heal`: every instance fills the same temporary key, then renames it over the live board). | Re-checked |
| DB-3 | MEDIUM | DB | A job lease can be re-taken by its own holder: the "daily" dormant-account job runs every hour, and slow jobs overlap themselves | `server/stores/pg/index.ts:108-117` (`... or job_leases.holder = excluded.holder`); `server/main.ts:343-364`; `server/core/retention.ts:22-23` (batch of 200, "the job runs daily"). | Re-checked |
| DB-4 | MEDIUM | DB | Migrations wait for table locks with no timeout: one long reader plus one `ALTER TABLE` stalls every query on that table | `server/migrate.ts:199-203` (no `lock_timeout`; migrations run with the statement timeout off). | Re-checked |
| DB-5 | MEDIUM | DB | Three alerts cannot fire in the situations they exist for | `ops/prometheus/alerts.yml` (`RetentionStalled`, `PurchasesStalled`, `RedisDown`); `server/observability.ts:101-106` (a counter exists only after its first increment). | Read |
| API-2 | MEDIUM | API | Chat keeps text-direction overrides and invisible characters, so a link or contact typed backwards passes the filter and displays forwards | `src/gameplay/sim/social/grove.ts:80-83` (nothing strips format characters from what is stored); `src/gameplay/sim/social/contactFilter.ts:62,103` (the filter strips them only from its own copy); `server/core/groves.ts:159-172`. | Reproduced |
| API-3 | MEDIUM | API | Three throwaway accounts can hide any chat message in any Alliance, from its author too | `server/core/moderation.ts:25` (`HIDE_AFTER_REPORTS = 3`), `:39-59` (a reporter only has to be a member at the moment of reporting). | Re-checked |
| API-4 | MEDIUM | API | Alliance browse and search only look at the 200 oldest Alliances, and war pairing only at the oldest 1,000 | `server/core/groves.ts:65-74`; `server/stores/pg/alliances.ts:22-25` (`order by g.created_at limit 200`, filtered afterwards). | Re-checked |
| API-5 | MEDIUM | API | The server sets no request timeout: half-sent requests are held open indefinitely | `server/app.ts:201-219` (Fastify options set no `requestTimeout` or `connectionTimeout`; Fastify's default of 0 replaces Node's own 300 s). | Re-checked |
| API-6 | MEDIUM | API | Staff queues show only the oldest 200 items and have no bulk action, so junk reports bury genuine ones | `server/core/moderation.ts:154-156`; `server/core/account.ts:98-100`; `server/core/complaints.ts:29-31`; `server/app.ts:366-372` (the no-sign-in forms count per IPv6 /64 only). | Reproduced |
| A11Y-1 | MEDIUM | LOC | White labels on the green and blue buttons, including the Store's price buttons, fall below the contrast minimum | `src/presentation/ui/styles.css:286` (`.btn.primary`), `:289` (`.btn.sky`), `:475` (`.badge`), `:679`, `:135`, `:250`. | Reproduced |
| A11Y-2 | MEDIUM | LOC | Keyboard-only play stops at the map, although the canvas tells screen-reader users that every action has a button | `src/presentation/ui/battleHud.ts:1091-1099`; the map canvas has `role="img"`, no `tabindex` and no key handler. | Reproduced |
| LOC-1 | MEDIUM | LOC | Labels drawn on the game canvas cut off the tops and bottoms of tall scripts | `src/presentation/render/BattleScene.ts:633,968`; `src/presentation/render/VillageScene.ts:240-250,405-412`; `src/presentation/render/fx.ts:332`. None sets padding or a script-aware test string. | Reproduced |
| LOC-2 | MEDIUM | LOC | 36 Arabic strings lost the trailing space of a fragment the code glues to a value | `locales/ar/messages.json` (34, for example `ui.done_in_29027c7d03`, `ui.your_collectors_gathered_55d534315d`) and `locales/ar/pages.json` (2); the checker at `tools/i18n/lib.mjs:292` fails an added edge space but never a lost one. | Re-checked |
| LOC-3 | MEDIUM | LOC | Bangla mixes two sets of digits in the same sentence | `locales/runtime.ts:23` (every formatted number is forced to Western digits); `locales/bn/*.json` writes Bengali digits in 175 strings; `docs/localization/BANGLA.md:23` assumes the opposite. | Reproduced |
| LOC-6 | MEDIUM | LOC | The under-18 spending-limit refusal shows a bare "$" in every language | `src/gameplay/sim/monetization.ts:160` (builds the amount as a dollar sign plus two decimals); `locales/en/messages.json` `srv.purchase.minor_cap`, `srv.purchase.over_cap_held`. | Re-checked |
| REPO-3 | MEDIUM | REPO | A push to `main` now takes 46 minutes to publish, and the documented hotfix path cannot publish the web game | `deploy.yml:86,169` (publishes only from `refs/heads/main`); `docs/ops/LAUNCH_DAY.md:55-60` (hotfix from the release tag); `npm run test:slow` now 36.5 minutes in CI (`tests/slow.ts:3` still says "about 50 s"). | Read |
| REPO-4 | MEDIUM | REPO | The nightly "backup and restore drill" has passed 22 times without making a backup | `backup.yml:61` (prints a line and exits 0 when `BACKUP_DATABASE_URL` is empty), `:31` (`environment: production`); `docs/SHIPPING.md:226` (asks for required reviewers on `production`). | Read |
| REPO-5 | MEDIUM | REPO | The store-build workflows hand the signing keystore and its passwords to every step | `android.yml:104-110` (four keystore secrets in the job environment), no `permissions:` block in `android.yml` or `ios-testflight.yml`; `server.yml:49-51` (`packages: write` for every job). | Read |
| REPO-6 | MEDIUM | REPO | CI never runs the built game, which uses a different Phaser than the tests; five tool scripts need an undeclared Playwright | `vite.config.ts:216` (the trimmed `render/phaserBuild.js` only in `vite build`); `tools/ui/surfaces.mjs:16`, `tools/perf/lowend.mjs:14`, `tools/perf/profile.mjs:7`, `tools/i18n/smoke.mjs:13`, `tools/store/screenshots.mjs:37`. | Read |
| REPO-7 | MEDIUM | REPO | `.gitignore` does not cover the secret files the project's own tools and guides create | Not ignored: `.env`, `.env.production.local`, `AuthKey_*.p8`, `android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist`, `backups/*.dump.enc`, a root-level `*.jks`. `tools/ops/backup.mjs:18` writes to `backups/` and leaves the plain dump there if a step throws. | Reproduced |
| REPO-8 | MEDIUM | REPO | There is no single list of what is open; required reading for every session has grown to about 55,000 words | `CLAUDE.md:5` orders every session to read `docs/store/WORLDWIDE_AUDIT.md` (52,857 words; it was 7,263 when the same problem was recorded and closed as fixed at line 526). Open items sit in four ledgers under 40 finding-ID schemes. | Read |
| SOAK-2 | LOW | SOAK | The service worker answers any address that does not exist with the game page, which then blames the connection; two Retry taps delete the offline copy | `src/backend/pwa/sw.template.js:177-179,208-237`; `src/backend/pwa/boot.js:327-358`. | Reproduced |
| SOAK-3 | LOW | SOAK | "A new version is ready" is shown inside the hidden village HUD when the update arrives during a battle | `src/backend/pwa/register.ts:6-8`; `src/main.ts:1009`; `src/app.ts:566`. | Reproduced |
| FUZ-4 | LOW | FUZ | The drill army is sorted with the device's language rules, so Czech, Slovak, Hausa and Igbo devices can build a different drill army than the server | `src/gameplay/sim/drill.ts:45` (`localeCompare` with no locale). | Read |
| FUZ-5 | LOW | FUZ | Battle commands store the client's record fields as sent | `src/gameplay/sim/village.ts` (the stored record in `trialEnd`, `bountyEnd`, `rematchEnd`, `drillEnd`). | Reproduced |
| FUZ-6 | LOW | FUZ | Several commands throw on malformed input instead of refusing it | `src/gameplay/sim/village.ts:660` and the `train`, `research`, `dismiss`, `topUp`, `saveArmyPreset` handlers. | Reproduced |
| RUN-3 | LOW | RUN | A new player whose browser cannot save is told only after the tutorial | `src/main.ts:979-981` (the "can't save your village" banner waits for the end of the tutorial unless storage failed for a returning player). | Read |
| RUN-4 | LOW | RUN | Tapping "Skip tutorial" three times opens three stacked confirmation dialogs | The Skip link in the tutorial bubble. | Reproduced |
| DATA-3 | LOW | TIME | "Day 28 gives a Keep look" stays on screen after the looks have run out | `src/presentation/ui/dailyUi.ts:82`; `locales/en/ui.json` `calendar.about`. | Read |
| TIME-2 | LOW | TIME | A loop sized by the saved best Trial tier has no upper bound | `src/gameplay/sim/pass.ts` `taskEligible` (one loop step per tier beyond the ceiling); `src/gameplay/sim/save.ts:431` (`trials.best` only has to be a non-negative whole number). | Reproduced |
| NAT-5 | LOW | NAT | WebView 80 to 87 passes every gate, but the bundle needs 85 for JavaScript and 87 to 88 for CSS | `src/presentation/ui/groveUi.ts:209` (`replaceAll`); `src/presentation/ui/styles.css:973-1016` (`:is()`), `:127,145` (`padding-inline`); `boot.js:186` (`inset`). | Read |
| NAT-6 | LOW | NAT | The Android memory warning waits for signals that Android 14 and later no longer send | `MainActivity.java:48-54` (`onTrimMemory`). | Read |
| NAT-7 | LOW | NAT | The iOS sign-in token survives deleting the app: a reinstall is silently signed in to the old account | `ios/App/App/TkSecureStorePlugin.swift:59-63`; `src/backend/platform/secureTokens.ts:26-37`. | Read |
| NAT-8 | LOW | NAT | Android reminders show the system "(i)" icon instead of the game's mark | `capacitor.config.ts:30-32` (no `smallIcon`); no notification drawable under `android/app/src/main/res`. | Read |
| DB-6 | LOW | DB | Redis errors on a live connection never trip the fallback: with Redis full, every attacker is granted the same defender | `server/redis.ts:156-175`; `server/shared.ts:232-259`; `server/core/pvp.ts:413`. | Reproduced |
| DB-7 | LOW | DB | After a database restore the statistics rollup silently reads nothing | `server/core/statsLocal.ts:78-113`; `server/migrations/0042_stats_commit_order.sql:12-13`; `tools/ops/restore.mjs:26`. | Reproduced |
| DB-8 | LOW | DB | Raid settlement and the defender's own command batch take two locks in opposite order | `server/core/pvp.ts:908-915`; `server/core/village.ts:301-353`. | Read |
| DB-9 | LOW | DB | A dozen tables are never pruned and are missing from the retention table in the privacy notes | `server/core/retention.ts`; `docs/store/PRIVACY.md`. Among them `raid_pairings`, `squad_wars` (both with full rosters and bases), their attack and claim tables, `name_holds`, `refund_notices`, empty Alliances and their chat. | Read |
| DB-10 | LOW | DB | Gang War reminders read only the 500 wars ending soonest, with a full-table scan each run | `server/core/gangWars.ts:387`; `server/stores/pg/gangs.ts:79-81` (no index on `ends_at`). | Read |
| API-7 | LOW | API | Alliance names skip the reserved-word check that player and Gang names get | `server/core/groves.ts:79`, `server/core/identity.ts:34-40`. | Reproduced |
| API-8 | LOW | API | Answers to repeat-safe writes are stored for 24 hours with no size or count limit | `server/app.ts:297-314`; `server/stores/pg/index.ts:129-131`; `server/migrations/0008_idempotency.sql`. | Read |
| API-9 | LOW | API | The limit on looking up shared replays follows a header the caller chooses | `server/routes/growth.ts:32`; `server/app.ts:350,366`. | Reproduced |
| API-10 | LOW | API | Cancelling and re-sending a friend request, or repeating a Gang invite, pushes a notification every time | `server/core/friends.ts:241-247,271-274`; `server/core/squads.ts:124-125`. | Reproduced |
| API-11 | LOW | API | No `nosniff` or `no-store` headers on account data; friend and share codes reach Sentry in the request path | `server/app.ts:474`; `src/backend/analytics/sentryEnvelope.ts:48-50`. | Read |
| A11Y-3 | LOW | LOC | Nothing handles Windows contrast themes: progress bars, button outlines and panels vanish | `src/presentation/ui/styles.css` has no `forced-colors` or `prefers-contrast` rule. | Reproduced |
| LOC-4 | LOW | LOC | Dates in Marathi and Bangla use native digits while every other number is Western | `src/presentation/ui/i18n.ts:126-128`; `locales/runtime.ts` `utcText`. | Reproduced |
| LOC-5 | LOW | LOC | Four Urdu strings keep a left-to-right arrow, so "level 3 to 4" points backwards | `locales/ur/messages.json`: `ui.lv_99eff11c93`, `ui.level_ab12f81e7d`, `ui.hp_damage_f5da8dfe3f`, `ui.ago_e411ba9ec3`. | Reproduced |
| LOC-7 | LOW | LOC | Portuguese uses a different word for "village" and "device" in the terms gate, the Apple consent and the under-13 notice than everywhere else | `locales/pt/ui.json` `terms.body`, `consent.apple.detail`; `locales/pt/messages.json` `service.online_play_not_available_under13`, `srv.age.under13_offline`. | Reproduced |
| REPO-9 | LOW | REPO | No dependency update process; the CI audit skips dev packages and cannot fail | `deploy.yml:33-35` (`--omit=dev`, `continue-on-error: true`); no Dependabot or Renovate configuration. | Reproduced |
| REPO-10 | LOW | REPO | `docs/STATUS.md` embeds the test-file count, so two branches that each add a test break `main` when merged | `tests/architecture/status.test.ts:11`; `docs/STATUS.md` is the most-changed file in the history (142 commits). | Reproduced |
| REPO-11 | LOW | REPO | A test App Store signing key is committed and the server accepts an override of Apple's root certificate with no production guard | `tests/backend/fixtures/appstore/leaf.key`; `server/config.ts:258` (`APPLE_ROOT_CA_SHA256`). | Read |
| REPO-12 | LOW | REPO | No licence or copyright statement on a public repository; Google Play library notices missing from the licences page | No `LICENSE`; `tools/release/licenses.mjs:16-20` omits Play Billing, Credentials, Google ID, Age Signals and Play Review, which `android/app/build.gradle` compiles in. | Read |

### X-1 — Three unmerged lines of work have left `main`; two of them conflict in 53 files

- **Severity:** HIGH
- **Lane:** X
- **Where:** `claude/gifted-darwin-xt5n6e` (20 commits, 325 files, +44,592 lines: battle rules 10, three buildings, two heroes and hero choice go live, plurals rewritten in 50 languages), `claude/relaxed-cori-mhvk90` (4 commits, 118 files: Jade batch buying, eight army strategies, 18 tutorial lessons), `claude/busy-hamilton-dfgic0` (1 commit: a new music engine). All branch from `main` 4b79711.
- **What happens:** Every audit you supplied, and this one, describes `main`. The game being built is three other trees. A trial merge of the first two stops on 53 files (all 50 `locales/*/ui.json`, `docs/STATUS.md`, two more). The music branch says in its own commit message that a test "was already failing before this change". Fixes made on `main` now have to be carried to each branch, and the rules-10 branch changes what the server must accept ("deploy the server before the game").
- **Fix:** Phase 0, step 0.1: one integration session lands them in a fixed order (rules 10 first, then rebase the two small branches and resolve the translation conflicts once), or the owner parks them in writing. Until then no new branch.
- **How checked:** `git merge-tree --write-tree` on each pair (53 conflicted files for the first pair, 0 for the others); `git diff --shortstat origin/main...<branch>`; GitHub Actions runs 543 to 563.

### FUZ-1 — One crafted `abandonBattle` command switches off the army size limit for the rest of the batch: an army of two, then four, times the camps on a server-held village

- **Severity:** HIGH
- **Lane:** FUZ
- **Where:** `src/gameplay/sim/village.ts:2467-2475` (`deployedTroops` tests `data.troops[d.troop]`, which is truthy for inherited names such as `hasOwnProperty`); `src/gameplay/sim/army.ts:219-236` (stores `NaN` as an army count), `:14-18`, `:40-56`.
- **What happens:** A deployment naming the warrior `hasOwnProperty` writes `NaN` into the army. Every later comparison with the army's size is then false, so finished warriors move into full camps and the training queue is never "full". Replayed through the server's own code: without the first command three training orders are refused "army full"; with it all are accepted, and after a reload the village holds 120 Shinobi in camps of 60, then 240 on the next batch, with no bound. Shadow Trials, Bounty Hunts and rematches only check "no more than you have", so their ladders (which pay Jade) can be fought with a multiple of the intended army. The same class of bug was fixed at one site on 2026-11-20 and the gameplay brief then says to check every such lookup; this site was missed.
- **Fix:** `Object.hasOwn(data.troops, ...)` here and in `cleanArmy`; `takeFromArmy` refuses a key that is not its own or a count that is not a whole number; and the command entry point refuses any result that fails `validateVillage`, which would have turned this into a refusal.
- **How checked:** Found by the fuzzer 381 times in 300,000 commands; minimised to a four-command batch through `replayVillage`; the reproducer re-run by the lead (passes: army above housing). Not sent over HTTP.

### FUZ-2 — Walls placed against a building protect nothing from melee warriors, and make each of them run a failed whole-map path search every tick

- **Severity:** HIGH
- **Lane:** FUZ
- **Where:** `src/gameplay/sim/battle/pathfind.ts:96-151` (a goal tile must be standable); `src/gameplay/sim/battle/battle.ts:540-548` ("Fully walled in: walk straight at it", with the failed search repeated next tick).
- **What happens:** Twenty Shinobi against a Keep: no walls, destroyed at tick 337. A ring of 20 max-level walls touching the Keep: destroyed at tick 323 with no wall damaged. The same walls one tile out: the Keep is never destroyed. Keep 1 allows exactly 20 walls, the number of tiles around the Keep, so the most natural first layout is the one that does not work. The cost: a battle with the touching ring took 27 times the CPU on an idle machine, and with a full Keep 15 camp of melee warriors about 870 times (154 s for a 122-tick battle). The server stops any re-simulation at 15 s and answers 503, so an honest raid of this shape cannot be settled, and a cheap phone falls below real time.
- **Fix:** Let the path goal accept a wall tile within reach (the warrior then breaks it), and remember a failed search until the map changes. This changes battle results: it needs a rules bump with the snapshot taken first.
- **How checked:** The auditor's deterministic test re-run by the lead on an idle machine (tick 337 / 323 / never; 18 ms against 493 ms). Not measured on a phone. Whether any generated layout or Trial fortress places walls against a building was not checked.

### RUN-1 — On a 360x640 phone the "End the battle?" dialog cannot be answered: the squad-order strip is drawn over both of its buttons

- **Severity:** HIGH
- **Lane:** RUN
- **Where:** `src/presentation/ui/styles.css:1208-1209` (`.squad-row` has `z-index: 1`); `:303` (`.modal-backdrop` has none), both inside `#battle-hud`.
- **What happens:** In a battle the strip with "Together", "Pincer", "Single file" sits above the dialog. "Keep fighting" is almost wholly covered and "End battle" half covered; a real tap at the centre of either lands on the strip and nothing happens. Only the X works, so the player cannot end a raid early. It happens on short screens: 360x640 and smaller, which is the cheap Android phone the game is aimed at, and it happens in the first raid of the tutorial.
- **Fix:** Give battle dialogs a stacking level above the strip (or hide the strip while a dialog is open), and add this dialog to the screen-surface check at 360x640.
- **How checked:** Hit test and real tap in Chromium by the auditor (two runs); the screenshot and the two style rules checked by the lead.

### NAT-1 — The iOS privacy manifest declares no required-reason API, but the app's own Swift uses `UserDefaults`: the first TestFlight upload is refused

- **Severity:** HIGH
- **Lane:** NAT
- **Where:** `ios/App/App/TkNativePlugin.swift:24,30`; `ios/App/App/PrivacyInfo.xcprivacy:5` (comment "No required-reason API is used") and `:112-113` (empty `NSPrivacyAccessedAPITypes`).
- **What happens:** Closed in the ledger (OPS-10), still broken: the renderer-exit fix (OPS-03) added `UserDefaults` after the manifest was written, although both work items carry the warning themselves. `UserDefaults` is on Apple's required-reason list; an upload without the declaration is flagged ITMS-91053. The owner would meet this on the very first run of a workflow that has never run.
- **Fix:** Add `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1`; add a test that greps the app's Swift for required-reason APIs and demands a matching entry.
- **How checked:** Both files read by the auditor and again by the lead. Not verified: how App Store Connect treats the upload today.

### DB-1 — Deleting an account gets slower with all-time history and will start failing outright

- **Severity:** HIGH
- **Lane:** DB
- **Where:** `server/stores/pg/players.ts:187-306` (`deletePlayer`). The only indexes on `tickets.attacker_id` and `defender_id` are partial ("where not used"); `raid_pairings` and `squad_wars` are searched by roster contents with no index and are never pruned; chat is scanned by text.
- **What happens:** On a seeded database (50,000 players, 2 million tickets, 20,000 Alliance War pairings, 20,000 Gang Wars) one deletion took about 65 s cold and 30 s warm. The pairing statement alone took 13.3 s and grows linearly; it crosses the 30 s statement timeout at about 45,000 rows, which is 1,000 Alliances after 45 weekly wars. From then on every player-requested deletion, every staff deletion and every dormant-account deletion fails and rolls back. Working account deletion is an App Store and Google Play requirement and a legal right in the EU.
- **Fix:** Plain indexes on the ticket columns and the other player-id columns the deletion touches; keep roster player ids in side tables (or a GIN index); prune finished wars and pairings after 30 to 90 days; a deletion-duration metric with an alert.
- **How checked:** Reproduced through the real code on Postgres 16 with per-statement timings; the index definitions re-read by the lead. Production row sizes unknown.

### API-1 — Joining and leaving an Alliance has no cooldown or rate rule: one free account can flood any Alliance's chat, and nobody can stop it

- **Severity:** HIGH
- **Lane:** API
- **Where:** `server/routes/social.ts:18,20` (join and leave carry no rate rule); `server/core/groves.ts:89-123` (no cooldown, every Alliance is open, one system chat line per join and per leave), `:138-149` (chat returns at most the newest 100 rows).
- **What happens:** 100 join-and-leave cycles took 255 ms and were all accepted. The leader, who had blocked the attacker, then received 100 chat rows, all of them system lines; a member's real message sent just before was gone from the answer. System lines cannot be reported, blocks do not hide them, there is no remove-member action, and a muted account can do it too. Each join also returns every member's id, name, honor, Keep and last-seen time, so the same loop reads the member list of every Alliance. Alliance War coordination and donation requests run through this chat.
- **Fix:** A per-player join cooldown (Gangs already have 24 hours) and a rate rule on join, leave and create; no system line for a member who stayed under a few minutes; blocks hide system lines naming a blocked player; a remove-member action for the leader; page chat by cursor without dropping rows.
- **How checked:** Reproduced with a probe script against a local server; the routes and the 100-row query re-read by the lead. Postgres path read, not run.

### REPO-1 — `main` is unprotected and was red 43 % of the time while work and closure records kept landing on it

- **Severity:** HIGH
- **Lane:** REPO
- **Where:** GitHub: branch `main` `protected: false`, no rulesets; 70 "Test, build and deploy" runs on `main`: 41 green, 23 red, 6 cancelled.
- **What happens:** `main` was red for 229 of 533 hours, including nine runs in a row from 11-15 to 11-20 and seven from 11-21 to 11-25. 393 commits dated 11-15 or later landed in a period when `main` was green for about 25 hours in total. A red trunk hides new failures (one defect sat behind another for three days), and "fixed" records written in those windows describe code that had not passed CI as merged.
- **Fix:** One ruleset on `main`: the `build` and `server` checks must pass, merges go through pull requests, merged branches are deleted. With one owner that is one click per merge.
- **How checked:** GitHub API (`protected: false`, rulesets `[]`), confirmed by the lead; run history of all 196 workflow runs on `main`.

### REPO-2 — The repository is public: the exploit catalogues, open security items, anti-cheat code and CI artifacts are readable by anyone

- **Severity:** HIGH
- **Lane:** REPO
- **Where:** GitHub: `visibility: public`, no licence. `docs/audit/understand-2026-11-16/exploits.md`, the ledger (the open BLOCKER, the collusion paths), both Beast Mode prompts, all of `server/`. Artifacts: `android.yml:279-283` (signed release bundle, 30 days), `content-preview.yml:36-40` (unreleased content), `backup.yml:63-68` (the encrypted database dump, 35 days).
- **What happens:** At launch a cheater gets a maintained list of what is not yet closed, plus the server's validation rules. Signed store builds and unreleased content can be downloaded by any signed-in GitHub user. If the backup key ever leaks, every dump of the previous 35 days is already in strangers' hands. No document records this as a decision.
- **Fix:** Decide before the first store build: make the repository private (GitHub Pages then needs a paid plan or another static host), or move audits, prompts and exploit notes to a private repository and take backups and release builds off Actions artifacts. Record it in `docs/DECISIONS.md`.
- **How checked:** GitHub API, confirmed by the lead; the three workflow files.

### X-2 — A tutorial timer that is never stopped turns CI red at random

- **Severity:** MEDIUM
- **Lane:** X
- **Where:** `src/presentation/ui/tutorial.ts:151-152` (a 400 ms `setInterval`, cleared only when the tutorial finishes); `tests/presentation/dom/hud.dom.test.ts:42-55` leaves it running.
- **What happens:** When the timer fires after the test's page has been torn down, Vitest reports "ReferenceError: document is not defined" and exits 1 with every test file passing. That is how run 561 on the rules-10 branch failed (334 of 334 files passed); the next push went green without the cause being touched. `main` has identical code and the same exposure. In the game the same timer queries the page every 400 ms for as long as the tutorial is unfinished.
- **Fix:** Give `Tutorial` a `stop()` that clears the interval; call it from the test's `afterEach` and wherever the HUD is disposed; make `tick()` return early when there is no document.
- **How checked:** CI job log of run 45794462712 (all files passed, one unhandled error with this stack); `git diff origin/main <branch>` shows both files unchanged; the three tests that timed out in a loaded local run pass on an idle machine.

### X-3 — The evidence the Beast Mode prompt calls canonical is not in the repository

- **Severity:** MEDIUM
- **Lane:** X
- **Where:** `docs/prompts/BEAST_MODE_2026-11-21.md` cites `docs/audit/bulletproof-2026-11-21/{ECO,SAV,SEC,STB,OPS,UX,GT}.md` and an `evidence/` folder; the folder holds only `PROGRESS.md`, on `main` and on every branch.
- **What happens:** Rule 0.1 of that prompt tells sessions to read the lane report first and "do not fix what is listed as sound". Those lists of things verified sound, the probe scripts and the measurements exist nowhere, so each new pass re-derives them or re-opens settled ground. The same is true of the repro tests of the 2026-11-20 exploit audit ("kept in the session scratchpad").
- **Fix:** Recover the files from the session that wrote them if it still exists; otherwise delete the references and make it a rule that evidence a document cites is committed with it.
- **How checked:** `git ls-tree` of that folder on `main` and on the newest branch; `git log --all` for `ECO.md` finds nothing.

### X-4 — Every sentence lives in 50 files, so any two branches that touch text collide

- **Severity:** MEDIUM
- **Lane:** X
- **Where:** `locales/*/ui.json` (50 files), rewritten by every commit that adds or changes a string.
- **What happens:** The rule "new strings are translated into all 49 other languages in the same commit" makes parallel work impossible to merge cleanly (X-1 is the first instance) and puts 49 unreviewed machine translations of every experimental sentence into the tree before anyone knows whether the sentence will survive a playtest.
- **Fix:** Until Gate 1, change English only. A language is offered only while its pack is 100 % complete (`ready` in `locales/availability.json`), so the other 49 drop out of test builds until the next batch, which is the honest state of an unreviewed machine translation; or add a per-key English fallback. Translate in one batch per release candidate, on one branch.
- **How checked:** The 53-file conflict in X-1; the ledger's own note that new strings are "machine-written by the coding session, not native-reviewed".

### SOAK-1 — Every opening of the Store stays in memory for the rest of the session

- **Severity:** MEDIUM
- **Lane:** SOAK
- **Where:** `src/presentation/ui/economyUi.ts:145` (`liveBuyButtons`), `:179` (every buy button is added), `:153-156` (the only removal, which runs only when a purchase starts).
- **What happens:** Each buy button kept in the set holds its whole closed Store window. Thirty opens grew live page elements from 1,753 to 16,323 and listeners from 147 to 596: 486 elements and 15 listeners per open, more with tab switches, and on the phone builds each open adds two sets. Emptying the set released everything. A player who never buys never triggers the clean-up, and the Jade pill that opens the Store is always on screen. The cost per open is small; it is unbounded.
- **Fix:** Drop disconnected buttons whenever one is added, or clear the set when the Store closes, or query the open Store for its buy buttons instead of keeping a set.
- **How checked:** Bisected in Chromium action by action (27 actions, counters after forced garbage collection); the set and its single pruning site re-read by the lead. An earlier headline from this run (195,230 elements, 734 MB) was mostly the test harness holding references and is withdrawn.

### FUZ-3 — A save whose tasks, Season Scroll or calendar has the wrong shape passes validation, and the game then throws instead of offering the damaged save back

- **Severity:** MEDIUM
- **Lane:** FUZ
- **Where:** `src/gameplay/sim/save.ts:478` (these objects are checked only for being present; `calendar` and `stipend` not at all).
- **What happens:** With `tasks` broken, every tick and every command of that village throws. The project's rule is that a damaged save is kept and offered back; these are accepted, so that path never runs. A village imported to the server in this state has every command refused for good. 13 of 1,800 mutated saves behaved this way.
- **Fix:** Check the shape of each sub-object in `validateVillage`, or repair them to empty on load as is already done for other fields.
- **How checked:** Reproduced with three fixtures, one field changed in each.

### RUN-2 — Tutorial step 6 rings a button that does not respond for up to 22 seconds, under a message that contradicts the screen

- **Severity:** MEDIUM
- **Lane:** RUN
- **Where:** Army panel during the tutorial (`src/presentation/ui/tutorial.ts`, `armyUi.ts`), seen at 360x640.
- **What happens:** The ring pulses on a disabled "+1" while the Squad Courtyard is still being built. The red line under it says "Build a Squad Courtyard to house warriors" although the card above says "Squad Courtyard: Being built". The Sensei bubble also sits over the panel's title and its close button. This is minute two of a new player's first session.
- **Fix:** While the Courtyard is building, ring its timer and say "ready in N seconds"; move the bubble off the panel header.
- **How checked:** Seen in the auditor's run; the screenshot checked by the lead. Seen in one run only.

### DATA-1 — A Trial catch-up clear counts as one tier, so late starters can never finish the Trial Walker achievement

- **Severity:** MEDIUM
- **Lane:** TIME
- **Where:** `src/gameplay/sim/village.ts:2320` (`trialsCleared++` after a clear that skipped tiers); `src/gameplay/data/achievements.json` `trial_walker` (steps at 5, 25, 40 and 53 tiers).
- **What happens:** Recorded as done (P3-06), still broken: the work item required a catch-up clear to add every skipped tier, and the existing test never clears the tier. The app always offers the catch-up tier, so the player cannot choose a lower one. A Keep 10 player starting Trials can reach at most 30 on the counter (losing the 40 and 53 steps: 175 Jade); at Keep 15, at most 10. The Trials panel says "tiers 1 to 29 cleared" beside an achievement at 1 of 5.
- **Fix:** Add the number of tiers passed instead of 1, add the test the work item names, and repair saves on load (`trialsCleared` at least `trials.best`). Decide whether a catch-up clear should also finish the "clear 2 new Trial tiers" task.
- **How checked:** Reproduced through the real command at Keeps 5, 10 and 15; the line re-read by the lead.

### DATA-2 — The last step of the Master Artisan achievement (1,000 upgrades, 100 Jade) cannot be reached

- **Severity:** MEDIUM
- **Lane:** TIME
- **Where:** `src/gameplay/data/achievements.json` `busy_beaver`; `src/gameplay/sim/village.ts:377,677`; `tests/gameplay/balance/achievements-reachable.test.ts:35-36`.
- **What happens:** Since the exploit fix of 2026-11-20, wall, decoration and obstacle upgrades no longer count. What still counts in a fully built Keep 15 village is 775 upgrades, and nothing can be sold or rebuilt. The reachability test still counts walls (its ceiling is 2,424), so it passes. Villages that counted walls before that date keep them, so two identical villages show different progress.
- **Fix:** Lower the last step to about 700, or count walls for this achievement through a separate counter; make the test use the same exclusion as the game.
- **How checked:** Computed from the building tables and the two code paths; not played through.

### TIME-1 — One session with the phone's date set ahead freezes a device-held village for as long as the error, once the date is corrected

- **Severity:** MEDIUM
- **Lane:** TIME
- **Where:** `src/gameplay/sim/resources.ts:41` and `src/gameplay/sim/offline.ts:38-39` (elapsed time is clamped at zero; nothing compares the save's stamps with the clock on load); the daily chest, calendar, stipend, tasks and season roll all key on the stored day.
- **What happens:** A date one year ahead for a five-minute session (typed wrong after a reset, or set ahead for another game), then corrected: for the next 365 days the daily chest, the 28-day calendar and a bought Clan Stipend all say "come back tomorrow", the same three tasks stay, collectors produce nothing, the upgrade started in that session keeps its builder busy for a year, and no season or league chest rolls over. A day ahead locks a day. The village looks alive and pays nothing; support sees a refund request with nothing in the save to explain it. Earlier audits recorded that the clock is not checked (and that a forward jump pays rewards); none recorded the lock-out or the paid product inside it. Server-held villages are not affected.
- **Fix:** On load, beside the existing queue repair: when stored stamps are later than now by more than a small slack, pull day and week indices back to today, collector and raid stamps to now, shift running timers by the same offset, and tell the player once that the device date changed.
- **How checked:** Reproduced by driving the simulation with a fake clock (a session behind was also run: nothing is wiped and the village recovers). Not run through the app.

### NAT-2 — The gate that should tell players with an old Android System WebView to update does not work

- **Severity:** MEDIUM
- **Lane:** NAT
- **Where:** `capacitor.config.ts:26-27` (`minWebViewVersion: 80` with no `server.errorPath`); `src/backend/pwa/boot.js:135-138` (the syntax probe uses `new Function`); `tools/release/csp.mjs:28` (no `unsafe-eval`).
- **What happens:** Recorded as fixed (device finding F12), both halves fail. Capacitor shows an update page only when `server.errorPath` is set; otherwise it logs and loads the app anyway. And since the content-security policy was added, `new Function` throws `EvalError`, which the probe deliberately ignores, so it can no longer detect anything in any production build. A phone on WebView 61 to 79 gets "Couldn't load Kagemura. Check your connection" with a Retry that loops forever.
- **Fix:** Set `server.errorPath` to a small old-syntax page that names Android System WebView, or probe without `eval`. Correct the config comment and the F12 record.
- **How checked:** Capacitor's `Bridge.java`, the guard and the built `dist/index.html` (policy without `unsafe-eval` ahead of the guard), confirmed by the lead. Not run on an old WebView.

### NAT-3 — A dead WebView renderer rebuilds the Android activity at once, every time, with no limit: a renderer that crashes at start loops forever

- **Severity:** MEDIUM
- **Lane:** NAT
- **Where:** `android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java:27-39` (`recreate()`); `TkBillingPlugin.java:61-67` (no `endConnection`).
- **What happens:** The fix for renderer death (OPS-03) has no back-off, no count and no foreground check. If the renderer crashes during start-up on some chipset, the player sees the splash restart without end and never an error; because the process no longer dies, Play's crash statistics do not show it either. A renderer killed in the background is rebuilt immediately, taking back the memory Android just reclaimed. Each rebuild leaks a billing client.
- **Fix:** When not in the foreground, rebuild on the next `onStart`. After three rebuilds in a minute show a native "could not start" view or let the process die. Close the billing client in `handleOnDestroy`.
- **How checked:** The Java sources and Capacitor's client code. Not run on a device.

### NAT-4 — `getBridge()` is used without a null check: when Android cannot create a WebView the app crashes at launch instead of showing Capacitor's notice

- **Severity:** MEDIUM
- **Lane:** NAT
- **Where:** `MainActivity.java:27`.
- **What happens:** When the WebView package is missing, disabled or being updated by Google Play (a well-known Android failure class), Capacitor shows a "no WebView" screen and leaves the bridge null. This line, added to reduce crashes, then throws a `NullPointerException` in `onCreate`: a launch crash in Play vitals.
- **Fix:** `if (getBridge() == null) return;` before adding the listener.
- **How checked:** `MainActivity.java` and Capacitor's `BridgeActivity.java:27-32`, confirmed by the lead.

### DB-2 — After a Redis outage, two server instances rebuilding the leaderboard overwrite each other and leave most players off it

- **Severity:** MEDIUM
- **Lane:** DB
- **Where:** `server/shared.ts:112-130` (`heal`: every instance fills the same temporary key, then renames it over the live board).
- **What happens:** In 12 of 12 trials with two instances and 20,000 ranked players the board ended with between 1,000 and 12,500 players, both instances reporting healthy and no error logged. Ranks are then wrong for everyone outside the fragment until each fights again.
- **Fix:** A per-instance temporary key plus a Redis lock so one instance rebuilds; or add into the live key and remove ids the database no longer ranks.
- **How checked:** Reproduced on a local Redis; the shared key re-read by the lead.

### DB-3 — A job lease can be re-taken by its own holder: the "daily" dormant-account job runs every hour, and slow jobs overlap themselves

- **Severity:** MEDIUM
- **Lane:** DB
- **Where:** `server/stores/pg/index.ts:108-117` (`... or job_leases.holder = excluded.holder`); `server/main.ts:343-364`; `server/core/retention.ts:22-23` (batch of 200, "the job runs daily").
- **What happens:** 24 hourly ticks ran the job 24 times on the holding instance, so up to 4,800 dormant accounts a day are deleted instead of 200. The daily batch is the only brake on a mistyped retention setting, and each deletion is the slow transaction of DB-1. A job whose run outlasts its interval is started again beside itself.
- **Fix:** Start a job only when its lease has lapsed; let the holder clause apply only to renewals; keep an in-process "running" flag per job.
- **How checked:** Reproduced on Postgres; the SQL re-read by the lead.

### DB-4 — Migrations wait for table locks with no timeout: one long reader plus one `ALTER TABLE` stalls every query on that table

- **Severity:** MEDIUM
- **Lane:** DB
- **Where:** `server/migrate.ts:199-203` (no `lock_timeout`; migrations run with the statement timeout off).
- **What happens:** With a reader holding `players`, a migration adding a column waited, and an ordinary point read from another connection was cancelled after 3 s. Three recent migrations add columns to `players`. If a release runs during the nightly dump or a leaderboard scan, every query on the table queues behind the waiting migration and the game is down for as long as the reader runs.
- **Fix:** `set local lock_timeout = '5s'` per migration file with a few retries; say in the shipping guide not to release during the backup window.
- **How checked:** Reproduced on Postgres; no `lock_timeout` anywhere in `server/` (lead).

### DB-5 — Three alerts cannot fire in the situations they exist for

- **Severity:** MEDIUM
- **Lane:** DB
- **Where:** `ops/prometheus/alerts.yml` (`RetentionStalled`, `PurchasesStalled`, `RedisDown`); `server/observability.ts:101-106` (a counter exists only after its first increment).
- **What happens:** "Purchases stalled" (a paging alert) and "retention stalled" compare a sum with zero, but when the thing has failed since the last restart there is no series at all, and an empty result never equals zero. "Redis down" needs a one-second flag to read zero at every evaluation for five minutes; with light traffic or a Redis that accepts connections and never answers it read "up" in 33 to 75 % of samples.
- **Fix:** `(sum(increase(...)) or vector(0)) == 0`; create the counters at zero at boot; alert on the Redis error rate.
- **How checked:** Rule logic read (no Prometheus in the sandbox); the Redis flag sampled in a test.

### API-2 — Chat keeps text-direction overrides and invisible characters, so a link or contact typed backwards passes the filter and displays forwards

- **Severity:** MEDIUM
- **Lane:** API
- **Where:** `src/gameplay/sim/social/grove.ts:80-83` (nothing strips format characters from what is stored); `src/gameplay/sim/social/contactFilter.ts:62,103` (the filter strips them only from its own copy); `server/core/groves.ts:159-172`.
- **What happens:** "visit example.com now", "add me on discord", "my telegram is ..." are all replaced when typed normally. Typed backwards after one pasted character (U+202E) they are stored unchanged and every reader's screen draws them forwards. The word filter is passed the same way, and one letter with 150 stacked marks is accepted and draws over neighbouring rows. This is the one place where strangers talk to 13 to 17 year olds, and the links-and-contacts rule there is a stated compliance measure.
- **Fix:** Before filtering and storing, remove U+202A to 202E, U+2066 to 2069, zero-width and tag characters (keep joiners only between letters of scripts that need them); cap combining marks per letter as names already do; also run the contact filter on the reversed text.
- **How checked:** Reproduced: the four plain messages were replaced, the same four reversed were stored with status 201. Rendering on a device not checked.

### API-3 — Three throwaway accounts can hide any chat message in any Alliance, from its author too

- **Severity:** MEDIUM
- **Lane:** API
- **Where:** `server/core/moderation.ts:25` (`HIDE_AFTER_REPORTS = 3`), `:39-59` (a reporter only has to be a member at the moment of reporting).
- **What happens:** Three accounts registered seconds earlier joined, each reported one fresh message, and left. The message disappeared for the leader and for its author. At 30 reports an hour per account, three accounts silence 30 messages an hour anywhere, and nothing counts against accounts whose reports staff dismiss.
- **Fix:** Count only reporters who were members before the message was sent and whose account has some age or play; discount reporters with dismissed reports; never hide a message from its author without telling them.
- **How checked:** Reproduced against a local server; threshold and membership check re-read by the lead.

### API-4 — Alliance browse and search only look at the 200 oldest Alliances, and war pairing only at the oldest 1,000

- **Severity:** MEDIUM
- **Lane:** API
- **Where:** `server/core/groves.ts:65-74`; `server/stores/pg/alliances.ts:22-25` (`order by g.created_at limit 200`, filtered afterwards).
- **What happens:** With no attacker at all: from the 201st Alliance on, a new Alliance cannot be found by browsing, and once the first 200 are full (4,000 players) the browse list is empty for everyone. With an attacker: 200 accounts registered on launch day (created in 1.6 s in the probe, under the registration limit of one address) own the list every new player sees. On Postgres with 5,000 Alliances, 0 were joinable while 4,800 had free places; an Alliance outside the oldest 1,000 is paired for war as if its honor were zero (`server/core/groveRaid.ts:63`).
- **Fix:** Filter (not full, recently active) and order (activity, honor distance) inside the query, before the limit; drop dormant Alliances from browse; a rate rule on creating one.
- **How checked:** Reproduced with 206 older Alliances; the SQL re-read by the lead.

### API-5 — The server sets no request timeout: half-sent requests are held open indefinitely

- **Severity:** MEDIUM
- **Lane:** API
- **Where:** `server/app.ts:201-219` (Fastify options set no `requestTimeout` or `connectionTimeout`; Fastify's default of 0 replaces Node's own 300 s).
- **What happens:** A request with complete headers and a few body bytes was still open after 150 seconds, when the probe gave up; 300 opened at once from one address were all held and the process had 327 open descriptors. An instance players reach directly (a documented production setup) can be starved of sockets by one machine.
- **Fix:** `requestTimeout` of about 30 s (longer only on the three large-upload routes), a `connectionTimeout`, and a per-address connection cap; state in `docs/SHIPPING.md` which proxy timeouts are assumed.
- **How checked:** Reproduced to 150 s; "indefinitely" is read from the Fastify source. Options block re-read by the lead (no timeout key anywhere in `server/`).

### API-6 — Staff queues show only the oldest 200 items and have no bulk action, so junk reports bury genuine ones

- **Severity:** MEDIUM
- **Lane:** API
- **Where:** `server/core/moderation.ts:154-156`; `server/core/account.ts:98-100`; `server/core/complaints.ts:29-31`; `server/app.ts:366-372` (the no-sign-in forms count per IPv6 /64 only).
- **What happens:** Seven new accounts filed 210 reports on players they had no tie to; a genuine report filed afterwards appeared in neither staff view. Twelve /64 networks of one IPv6 /48 got 60 deletion requests and 240 complaints accepted. Harassment reports, legal complaints and verified account-deletion requests (a 30-day promise) then wait behind junk that staff must close one at a time.
- **Fix:** Show verified deletion requests and reports with several distinct, older reporters first; bulk close by reporter, address window or age; cap open reports per reporter; count the open forms per /48 as registration already does; alert on queue length.
- **How checked:** Reproduced against a local server.

### A11Y-1 — White labels on the green and blue buttons, including the Store's price buttons, fall below the contrast minimum

- **Severity:** MEDIUM
- **Lane:** LOC
- **Where:** `src/presentation/ui/styles.css:286` (`.btn.primary`), `:289` (`.btn.sky`), `:475` (`.badge`), `:679`, `:135`, `:250`.
- **What happens:** Behind the label the green button measures 2.9 to 4.2 to 1 and the blue 3.3 to 4.3 to 1, against the 4.5 to 1 that 13 to 15 px text needs. Affected: every price button in the Store, "Claim", "Train", "+1". Four small HUD texts (badges, the full-army pill, storage caps, muted notes) measure 3.1 to 4.3 to 1. Earlier audits checked colour-blind signals but recorded no contrast ratio.
- **Fix:** Darken the label band of both gradients (about #2f7a3c and #2f6aa3 give 5.3 and 5.7 to 1) or use dark text; darken the soft ink and the badge red; add a contrast check to the screen-surface tool.
- **How checked:** Computed from rendered styles on eight screens in Chromium.

### A11Y-2 — Keyboard-only play stops at the map, although the canvas tells screen-reader users that every action has a button

- **Severity:** MEDIUM
- **Lane:** LOC
- **Where:** `src/presentation/ui/battleHud.ts:1091-1099`; the map canvas has `role="img"`, no `tabindex` and no key handler.
- **What happens:** On the Windows laptop target, Tab reaches all 23 HUD buttons and a building can be placed at the offered spot. But an existing building cannot be selected (so no Upgrade, Collect or Move), a placement tile cannot be chosen, focus is lost after picking a card, and in battle the number keys arm a warrior card but nothing deploys: a raid needs a pointer. The canvas label "Every action is also on the buttons around the map" is not true.
- **Fix:** A "Buildings" list or arrow-key cursor that opens any building's sheet; arrow keys for the placement ghost; in battle, a "send through point A, B or C" button for the armed card. Until then, correct the label.
- **How checked:** One keyboard-only run at 1280x800 in Chromium on the sandbox village.

### LOC-1 — Labels drawn on the game canvas cut off the tops and bottoms of tall scripts

- **Severity:** MEDIUM
- **Lane:** LOC
- **Where:** `src/presentation/render/BattleScene.ts:633,968`; `src/presentation/render/VillageScene.ts:240-250,405-412`; `src/presentation/render/fx.ts:332`. None sets padding or a script-aware test string.
- **What happens:** Phaser sizes a text label from the ink of a Latin sample. Measured against that box, 48 of 57 Arabic canvas strings overshoot (up to 5.9 px cut at the top), Malayalam 37 and Kannada 24 (4.2 px at the bottom), Odia 43, Tamil 51, Urdu 52, with smaller cuts in Bengali, Punjabi, Thai, Hindi, Marathi and Gujarati. Ability names, build timers and "Done!" lose part of their letters. Latin, Cyrillic, Greek, Hebrew, Chinese, Japanese and Korean are unaffected.
- **Fix:** One helper for the five call sites that adds a sample of the active script to the label's test string (or top and bottom padding for non-Latin scripts), and a test that compares each label's ink with its box in every ready language.
- **How checked:** Measured in Chromium with the game's font stack. The amount will differ with each phone's fonts; the cause will not.

### LOC-2 — 36 Arabic strings lost the trailing space of a fragment the code glues to a value

- **Severity:** MEDIUM
- **Lane:** LOC
- **Where:** `locales/ar/messages.json` (34, for example `ui.done_in_29027c7d03`, `ui.your_collectors_gathered_55d534315d`) and `locales/ar/pages.json` (2); the checker at `tools/i18n/lib.mjs:292` fails an added edge space but never a lost one.
- **What happens:** Seen in the browser: the training chip reads the Arabic for "Done in" run straight into "22s"; "Your collectors gathered" runs into the amount; two sentences touch; a web address and the account-deletion reference number follow their label with no gap.
- **Fix:** Restore the spaces; make the checker fail a missing edge space in languages written with spaces. Better: replace glued fragments with whole messages that carry a placeholder.
- **How checked:** Seen in Chromium by the auditor; the count re-derived by the lead from the two locale files.

### LOC-3 — Bangla mixes two sets of digits in the same sentence

- **Severity:** MEDIUM
- **Lane:** LOC
- **Where:** `locales/runtime.ts:23` (every formatted number is forced to Western digits); `locales/bn/*.json` writes Bengali digits in 175 strings; `docs/localization/BANGLA.md:23` assumes the opposite.
- **What happens:** "Cleared: tiers 1 to 12" shows a Bengali 1 and a Western 12; the "28-day calendar" title in Bengali digits sits over a grid of Western day numbers. The checker guards this for Arabic only.
- **Fix:** Choose per language: convert the 175 strings to Western digits (as Hindi, Marathi, Gujarati and Punjabi do), or stop forcing Western digits for Bangla everywhere including canvas text. Extend the checker's digit rule to every script with its own digits.
- **How checked:** Script over the locale files; examples seen rendered.

### LOC-6 — The under-18 spending-limit refusal shows a bare "$" in every language

- **Severity:** MEDIUM
- **Lane:** LOC
- **Where:** `src/gameplay/sim/monetization.ts:160` (builds the amount as a dollar sign plus two decimals); `locales/en/messages.json` `srv.purchase.minor_cap`, `srv.purchase.over_cap_held`.
- **What happens:** The limit is in US-dollar list prices, and Settings says so and formats it as US dollars. The refusal a minor actually sees does neither. In Mexico, Argentina, Chile and Colombia "$100" means pesos; in Canada, Australia, Taiwan and Hong Kong, local dollars. A child or parent reads the wrong limit in the one message that explains why a purchase did not go through.
- **Fix:** Send the limit as a number, format it on the device with the existing US-dollar formatter, and word it "(US-dollar list price)".
- **How checked:** Source line re-read by the lead; the message read in ten languages by the auditor.

### REPO-3 — A push to `main` now takes 46 minutes to publish, and the documented hotfix path cannot publish the web game

- **Severity:** MEDIUM
- **Lane:** REPO
- **Where:** `deploy.yml:86,169` (publishes only from `refs/heads/main`); `docs/ops/LAUNCH_DAY.md:55-60` (hotfix from the release tag); `npm run test:slow` now 36.5 minutes in CI (`tests/slow.ts:3` still says "about 50 s").
- **What happens:** Successful deploys took 1 to 9 minutes until 11-14 and 38 to 47 minutes since 11-20. A web hotfix cannot ship from a hotfix branch at all: it ships as the head of `main`, with everything merged since the release, no sooner than 46 minutes after the push, and only if nobody pushes again meanwhile (a new push cancels the run).
- **Fix:** Run the slow suite in its own job that does not gate the deploy, or only when `src/gameplay/data` or `sim` change. Let the deploy workflow publish a named release branch by hand, or rewrite the hotfix path to say web fixes go through `main`.
- **How checked:** CI run timings (run 45539292375) and the workflow file.

### REPO-4 — The nightly "backup and restore drill" has passed 22 times without making a backup

- **Severity:** MEDIUM
- **Lane:** REPO
- **Where:** `backup.yml:61` (prints a line and exits 0 when `BACKUP_DATABASE_URL` is empty), `:31` (`environment: production`); `docs/SHIPPING.md:226` (asks for required reviewers on `production`).
- **What happens:** A missing, renamed or expired secret looks exactly like a healthy backup: green, with the upload and the restore drill silently skipped. Once `production` has required reviewers, as the shipping guide asks, every nightly backup waits for a manual approval. GitHub also switches off scheduled workflows in a public repository after 60 days without activity. The Beast Mode document scored backups as a pass from the YAML alone.
- **Fix:** Fail, or at least warn in the summary, when the secret is missing and a production server exists; give backups their own environment without reviewers; alert from outside GitHub on "no backup in 36 hours".
- **How checked:** All 22 scheduled runs; in run 45819871767 the backup step took 0 s and both later steps were skipped. Found independently by two auditors. With the secret set the drill itself is sound, though the restore check loads each whole village file once per resource and the dump is read into memory whole (it fails above 2 GiB).

### REPO-5 — The store-build workflows hand the signing keystore and its passwords to every step

- **Severity:** MEDIUM
- **Lane:** REPO
- **Where:** `android.yml:104-110` (four keystore secrets in the job environment), no `permissions:` block in `android.yml` or `ios-testflight.yml`; `server.yml:49-51` (`packages: write` for every job).
- **What happens:** `npm ci` with lifecycle scripts on, `npm test`, an `npx` download of the Sentry tool outside the lockfile, and every Gradle plugin can read the Play upload key. Today only one optional package has an install script, so the exposure is one dependency update away rather than present.
- **Fix:** `permissions: contents: read` on both workflows; pass the keystore values only to the two steps that sign; `npm ci --ignore-scripts` everywhere; scope `packages: write` to the image job; pin the Sentry tool in `devDependencies`.
- **How checked:** The workflow files; the lockfile (one install script, `fsevents`).

### REPO-6 — CI never runs the built game, which uses a different Phaser than the tests; five tool scripts need an undeclared Playwright

- **Severity:** MEDIUM
- **Lane:** REPO
- **Where:** `vite.config.ts:216` (the trimmed `render/phaserBuild.js` only in `vite build`); `tools/ui/surfaces.mjs:16`, `tools/perf/lowend.mjs:14`, `tools/perf/profile.mjs:7`, `tools/i18n/smoke.mjs:13`, `tools/store/screenshots.mjs:37`.
- **What happens:** A break that exists only in the production Phaser subset would pass every check and be published; the post-deploy check only fetches pages. `npm run ui:surfaces`, `perf:lowend`, `perf:profile`, `i18n:smoke` and `store:screenshots` fail on a clean clone, so closure evidence that cites them cannot be reproduced from the repository.
- **Fix:** Declare Playwright as a dev dependency and add one CI step that serves `dist/` and waits for the first frame in headless Chromium.
- **How checked:** `package.json`, the tool scripts, the build config. A one-off comparison of the 35 Phaser names the game uses found no gap today.

### REPO-7 — `.gitignore` does not cover the secret files the project's own tools and guides create

- **Severity:** MEDIUM
- **Lane:** REPO
- **Where:** Not ignored: `.env`, `.env.production.local`, `AuthKey_*.p8`, `android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist`, `backups/*.dump.enc`, a root-level `*.jks`. `tools/ops/backup.mjs:18` writes to `backups/` and leaves the plain dump there if a step throws.
- **What happens:** In a public repository where coding sessions commit with broad adds, one `git add -A` publishes a server URL file, an Apple key or a database dump. A stray `dump.rdb` was committed once already.
- **Fix:** Add `.env*` (keep `!.env.example`), `*.p8`, `*.p12`, `*.jks`, `*.keystore`, the two Google service files, `backups/`, `*.dump*`; wrap the dump in `try/finally`.
- **How checked:** `git check-ignore` on each path.

### REPO-8 — There is no single list of what is open; required reading for every session has grown to about 55,000 words

- **Severity:** MEDIUM
- **Lane:** REPO
- **Where:** `CLAUDE.md:5` orders every session to read `docs/store/WORLDWIDE_AUDIT.md` (52,857 words; it was 7,263 when the same problem was recorded and closed as fixed at line 526). Open items sit in four ledgers under 40 finding-ID schemes.
- **What happens:** Nobody, including the owner, can answer "what is open?" without reading about 2,000 ledger lines, and a row can be overruled 46 lines further down (line 1256 cites a function and a test that never existed on `main`; line 1302 says so). Every session spends roughly 70,000 tokens before its task. In the week of 11-16 the project changed ten documentation lines for every source line.
- **Fix:** One generated `docs/OPEN.md` (ID, severity, who can close it, source ledger) with a test that it matches the ledgers; point `CLAUDE.md` at that; freeze closed passes under `docs/history/`.
- **How checked:** Word and line counts; `git log --numstat` over the full history (182,069 documentation lines changed against 104,902 in `src` and `server`).

### SOAK-2 — The service worker answers any address that does not exist with the game page, which then blames the connection; two Retry taps delete the offline copy

- **Severity:** LOW
- **Lane:** SOAK
- **Where:** `src/backend/pwa/sw.template.js:177-179,208-237`; `src/backend/pwa/boot.js:327-358`.
- **What happens:** A mistyped, stale or folder link shows "Couldn't load Kagemura. Check your connection" instead of a not-found page, and following its advice removes the offline copy of a working game (2.5 MB to fetch again; the save is untouched).
- **Fix:** Fall back to the game page only for the game's own address; do not clear the offline copy when the page is not at the scope root.
- **How checked:** Run against a local static server with the production build.

### SOAK-3 — "A new version is ready" is shown inside the hidden village HUD when the update arrives during a battle

- **Severity:** LOW
- **Lane:** SOAK
- **Where:** `src/backend/pwa/register.ts:6-8`; `src/main.ts:1009`; `src/app.ts:566`.
- **What happens:** The notice is gone six seconds later and is not shown again after the battle, so the player keeps an old page under a new worker with no hint to restart.
- **Fix:** Show it through the battle HUD, or raise it again on returning home.
- **How checked:** Run: a second build deployed while a practice battle was open.

### FUZ-4 — The drill army is sorted with the device's language rules, so Czech, Slovak, Hausa and Igbo devices can build a different drill army than the server

- **Severity:** LOW
- **Lane:** FUZ
- **Where:** `src/gameplay/sim/drill.ts:45` (`localeCompare` with no locale).
- **What happens:** The server rebuilds the drill army in its own locale, refuses the client's deployments of the differing warriors and stores a different result than the player watched. The same mistake was fixed in one other file earlier.
- **Fix:** The plain code-unit comparison already used in `heroes.ts:51`.
- **How checked:** The comparator shown to differ under those locales; a whole diverging drill was not produced.

### FUZ-5 — Battle commands store the client's record fields as sent

- **Severity:** LOW
- **Lane:** FUZ
- **Where:** `src/gameplay/sim/village.ts` (the stored record in `trialEnd`, `bountyEnd`, `rematchEnd`, `drillEnd`).
- **What happens:** An `endTick` of Infinity is stored, becomes `null` on disk and replays as a surrender at tick 0 while its result says otherwise; a client `ticket` and `settlement` survive into a Trial record.
- **Fix:** Build the stored record from a short list of checked fields.
- **How checked:** 36 distinct cases stored by the fuzzer; the replay effect read, not run.

### FUZ-6 — Several commands throw on malformed input instead of refusing it

- **Severity:** LOW
- **Lane:** FUZ
- **Where:** `src/gameplay/sim/village.ts:660` and the `train`, `research`, `dismiss`, `topUp`, `saveArmyPreset` handlers.
- **What happens:** About 6,400 type errors in 321,000 fuzzed commands, all from malformed shapes or inherited names. The server's replay catches them, so there is no server error; only a modified game sends such input.
- **Fix:** Validate command shape at the entry point (the 2026-11-20 exploit audit made the same recommendation).
- **How checked:** Fuzzer output.

### RUN-3 — A new player whose browser cannot save is told only after the tutorial

- **Severity:** LOW
- **Lane:** RUN
- **Where:** `src/main.ts:979-981` (the "can't save your village" banner waits for the end of the tutorial unless storage failed for a returning player).
- **What happens:** In a private window or a browser with no IndexedDB, a newcomer plays the whole tutorial with no warning; a reload during it returns to step 1 with everything gone.
- **Fix:** Say it once at the start, in one line, before the first build.
- **How checked:** A run with IndexedDB removed (progress lost on reload, no banner); the deferral read in source by the lead.

### RUN-4 — Tapping "Skip tutorial" three times opens three stacked confirmation dialogs

- **Severity:** LOW
- **Lane:** RUN
- **Where:** The Skip link in the tutorial bubble.
- **What happens:** Each must be answered or closed. Other confirmations (Finish now, daily chest) open once however fast they are tapped.
- **Fix:** The same in-flight guard the purchase buttons have.
- **How checked:** Chromium, three fast taps.

### DATA-3 — "Day 28 gives a Keep look" stays on screen after the looks have run out

- **Severity:** LOW
- **Lane:** TIME
- **Where:** `src/presentation/ui/dailyUi.ts:82`; `locales/en/ui.json` `calendar.about`.
- **What happens:** From the seventh 28-day cycle, day 28 pays 40 Jade instead of a look, while the calendar still promises a look. A small breach of the project's own rule that a reward screen only shows what it gives.
- **Fix:** Choose the sentence from what day 28 will actually pay.
- **How checked:** Read in source and data.

### TIME-2 — A loop sized by the saved best Trial tier has no upper bound

- **Severity:** LOW
- **Lane:** TIME
- **Where:** `src/gameplay/sim/pass.ts` `taskEligible` (one loop step per tier beyond the ceiling); `src/gameplay/sim/save.ts:431` (`trials.best` only has to be a non-negative whole number).
- **What happens:** A save with `trials.best` of 100 million passes validation and makes each task check take 295 ms, linear in the number; a larger number hangs the day roll. A damaged or edited device save can therefore freeze the game on load, and the same function runs where the server replays commands.
- **Fix:** Cap the loop the way `trialInfo` already does, and bound `trials.best` in `validateVillage`.
- **How checked:** Timed with a scratch test (48 ms at 10 million, 295 ms at 100 million). Whether an imported save can carry the value to the server was read, not run.

### NAT-5 — WebView 80 to 87 passes every gate, but the bundle needs 85 for JavaScript and 87 to 88 for CSS

- **Severity:** LOW
- **Lane:** NAT
- **Where:** `src/presentation/ui/groveUi.ts:209` (`replaceAll`); `src/presentation/ui/styles.css:973-1016` (`:is()`), `:127,145` (`padding-inline`); `boot.js:186` (`inset`).
- **What happens:** An earlier audit recorded the browser surface as "Chrome 80 safe"; these uses are later or were missed. On WebView 80 to 84 the offline Alliance panel throws; up to 87 chips lose padding, non-Latin line-height rules are dropped whole, and the guard's own error overlay does not cover the screen.
- **Fix:** Raise the floor to 88 together with NAT-2, or polyfill `replaceAll` and avoid `:is()` and the logical shorthands.
- **How checked:** grep of `src/` and of the built assets.

### NAT-6 — The Android memory warning waits for signals that Android 14 and later no longer send

- **Severity:** LOW
- **Lane:** NAT
- **Where:** `MainActivity.java:48-54` (`onTrimMemory`).
- **What happens:** Recorded as fixed (F19). On a new 2 to 3 GB phone, memory pressure during play sends no warning to the game; the renderer is killed instead, and then NAT-3 applies.
- **Fix:** Also override `onLowMemory()` and poll `ActivityManager.getMemoryInfo().lowMemory` on a slow timer while resumed.
- **How checked:** The Java source against the platform documentation as the auditor recalled it; not observed on a device.

### NAT-7 — The iOS sign-in token survives deleting the app: a reinstall is silently signed in to the old account

- **Severity:** LOW
- **Lane:** NAT
- **Where:** `ios/App/App/TkSecureStorePlugin.swift:59-63`; `src/backend/platform/secureTokens.ts:26-37`.
- **What happens:** iOS keeps Keychain items when an app is deleted. A player who deleted the game to start over, or the next user of a phone handed on without a reset, gets the previous account: name, friends, Gang, purchase history and the delete-account button. Android removes everything, and the planned device test (SAV-15) expects a fresh village.
- **Fix:** Keep a first-run flag in `UserDefaults` (removed with the app); when absent, clear the Keychain service before reading it. Or record the automatic restore as a decision and correct the test.
- **How checked:** The Swift plugin and its caller. Not run on a device.

### NAT-8 — Android reminders show the system "(i)" icon instead of the game's mark

- **Severity:** LOW
- **Lane:** NAT
- **Where:** `capacitor.config.ts:30-32` (no `smallIcon`); no notification drawable under `android/app/src/main/res`.
- **What happens:** Every reminder and server push appears in the status bar and shade with a generic glyph.
- **Fix:** Add a single-colour `ic_stat_kagemura` drawable, set `plugins.LocalNotifications.smallIcon` and the Firebase default icon.
- **How checked:** The plugin's fallback in `LocalNotificationManager.kt:490-498`.

### DB-6 — Redis errors on a live connection never trip the fallback: with Redis full, every attacker is granted the same defender

- **Severity:** LOW
- **Lane:** DB
- **Where:** `server/redis.ts:156-175`; `server/shared.ts:232-259`; `server/core/pvp.ts:413`.
- **What happens:** With Redis refusing writes (out of memory, a quota, a demoted replica) two attackers both acquired the same defender and the documented fallback to tickets did not start. After one failed sign-in to Redis the client needs a process restart.
- **Fix:** Treat out-of-memory, read-only, sign-in and quota answers as breaker trips; drop the socket on the last two.
- **How checked:** Reproduced with `maxmemory 1` and a wrong password on a local Redis.

### DB-7 — After a database restore the statistics rollup silently reads nothing

- **Severity:** LOW
- **Lane:** DB
- **Where:** `server/core/statsLocal.ts:78-113`; `server/migrations/0042_stats_commit_order.sql:12-13`; `tools/ops/restore.mjs:26`.
- **What happens:** The rollup remembers a transaction id of the old database. A restored database starts its ids near zero, so the hourly rollup finds nothing "newer" until the new database has used as many ids as the old. Day-1, day-7 and day-30 retention (the soft-launch gates) stop moving with no error.
- **Fix:** When the current horizon is at or below the stored mark, reset the mark (summaries are repeat-safe); check it in the restore check.
- **How checked:** Reproduced by setting the mark as a restore would leave it; an actual dump and restore was not run.

### DB-8 — Raid settlement and the defender's own command batch take two locks in opposite order

- **Severity:** LOW
- **Lane:** DB
- **Where:** `server/core/pvp.ts:908-915`; `server/core/village.ts:301-353`.
- **What happens:** A defender who is playing while a raid on them settles can deadlock with it; Postgres ends one side after a second with an error: a failed request and a retry for the attacker's report or the defender's batch.
- **Fix:** Take the player lock first in the batch transaction, or write the defender's village before the player row.
- **How checked:** Read in source; not reproduced.

### DB-9 — A dozen tables are never pruned and are missing from the retention table in the privacy notes

- **Severity:** LOW
- **Lane:** DB
- **Where:** `server/core/retention.ts`; `docs/store/PRIVACY.md`. Among them `raid_pairings`, `squad_wars` (both with full rosters and bases), their attack and claim tables, `name_holds`, `refund_notices`, empty Alliances and their chat.
- **What happens:** Unbounded growth (the driver of DB-1), and old-name holds that the privacy text says last 35 days stay for good.
- **Fix:** Prune wars, pairings and their rows after a fixed period; delete expired name holds; delete an Alliance with no members.
- **How checked:** Read in source.

### DB-10 — Gang War reminders read only the 500 wars ending soonest, with a full-table scan each run

- **Severity:** LOW
- **Lane:** DB
- **Where:** `server/core/gangWars.ts:387`; `server/stores/pg/gangs.ts:79-81` (no index on `ends_at`).
- **What happens:** With more than 500 wars running, "battle day begins" is pushed hours late.
- **Fix:** An index on `squad_wars(ends_at)`; select the wars whose reminder is due.
- **How checked:** Read in source.

### API-7 — Alliance names skip the reserved-word check that player and Gang names get

- **Severity:** LOW
- **Lane:** API
- **Where:** `server/core/groves.ts:79`, `server/core/identity.ts:34-40`.
- **What happens:** "Kagemura Support", "Moderator", "Admin Team" and "Kagemura Staff" were accepted as Alliance names and refused as player and Gang names. With API-4 such an Alliance can be the first thing new players see: a lever for phishing.
- **Fix:** Apply the reserved-name check (and the look-alike fold) to Alliance names; add a staff rename for Alliances.
- **How checked:** Reproduced.

### API-8 — Answers to repeat-safe writes are stored for 24 hours with no size or count limit

- **Severity:** LOW
- **Lane:** API
- **Where:** `server/app.ts:297-314`; `server/stores/pg/index.ts:129-131`; `server/migrations/0008_idempotency.sql`.
- **What happens:** Changing a privacy setting answers with the whole friends view (about 19 KB at the 100-friend cap) and each answer is stored. One account can add roughly 4.6 MB a minute to that table; a hundred cooperating accounts add hundreds of GB a day before the first clean-up, on the same disk as the game's data.
- **Fix:** Do not store answers above a few KB (store a "fetch again" marker, as is done for whole villages); cap rows per account; answer the privacy route with the two settings only.
- **How checked:** Answer sizes measured; database growth computed, not measured.

### API-9 — The limit on looking up shared replays follows a header the caller chooses

- **Severity:** LOW
- **Lane:** API
- **Where:** `server/routes/growth.ts:32`; `server/app.ts:350,366`.
- **What happens:** Without sign-in the 31st request in a minute is refused; with a different made-up bearer token on each request, 200 in a row were served. Codes cannot be guessed (8 x 10^14), so what remains is inflated view counts and large answers at a hundred times the intended rate.
- **Fix:** Key the rate rule of open routes by address whenever the token is not a real player's.
- **How checked:** Reproduced.

### API-10 — Cancelling and re-sending a friend request, or repeating a Gang invite, pushes a notification every time

- **Severity:** LOW
- **Lane:** API
- **Where:** `server/core/friends.ts:241-247,271-274`; `server/core/squads.ts:124-125`.
- **What happens:** Anyone who can find a player can use up that player's four notifications a day, so "your village was raided" is dropped, until the player blocks them.
- **Fix:** Remember a cancelled request for its 14 days; push a Gang invite only when it is created.
- **How checked:** Five request-and-cancel cycles all sent.

### API-11 — No `nosniff` or `no-store` headers on account data; friend and share codes reach Sentry in the request path

- **Severity:** LOW
- **Lane:** API
- **Where:** `server/app.ts:474`; `src/backend/analytics/sentryEnvelope.ts:48-50`.
- **What happens:** Hardening rather than a hole: bearer-token answers are not cached by shared caches. The request log already redacts the same paths; the crash report does not.
- **Fix:** Add the two headers globally; redact the path before it goes to Sentry.
- **How checked:** Response headers observed; the Sentry path read in source.

### A11Y-3 — Nothing handles Windows contrast themes: progress bars, button outlines and panels vanish

- **Severity:** LOW
- **Lane:** LOC
- **Where:** `src/presentation/ui/styles.css` has no `forced-colors` or `prefers-contrast` rule.
- **What happens:** With a contrast theme on, the building sheet loses its panel, the build progress bar is an empty track, "Finish now", "Cancel" and "Move" have no outline and the storage bars disappear.
- **Fix:** A short `forced-colors` block: system-colour borders on buttons, pills, sheets and dialogs; bar fills in the highlight colour.
- **How checked:** Chromium with forced colours emulated.

### LOC-4 — Dates in Marathi and Bangla use native digits while every other number is Western

- **Severity:** LOW
- **Lane:** LOC
- **Where:** `src/presentation/ui/i18n.ts:126-128`; `locales/runtime.ts` `utcText`.
- **What happens:** The date formatters do not pin a numbering system, so two languages fall back to their own digits; the Marathi notes state Western digits.
- **Fix:** Pass the same numbering choice as for numbers (see LOC-3).
- **How checked:** `Intl.DateTimeFormat` output for all 50 languages.

### LOC-5 — Four Urdu strings keep a left-to-right arrow, so "level 3 to 4" points backwards

- **Severity:** LOW
- **Lane:** LOC
- **Where:** `locales/ur/messages.json`: `ui.lv_99eff11c93`, `ui.level_ab12f81e7d`, `ui.hp_damage_f5da8dfe3f`, `ui.ago_e411ba9ec3`.
- **What happens:** Arabic and Hebrew flipped all 51 arrows; Urdu flipped 47.
- **Fix:** Flip the four; add arrow direction to the checker for right-to-left languages.
- **How checked:** Script over the locale files.

### LOC-7 — Portuguese uses a different word for "village" and "device" in the terms gate, the Apple consent and the under-13 notice than everywhere else

- **Severity:** LOW
- **Lane:** LOC
- **Where:** `locales/pt/ui.json` `terms.body`, `consent.apple.detail`; `locales/pt/messages.json` `service.online_play_not_available_under13`, `srv.age.under13_offline`.
- **What happens:** "aldeia" 4 times against "vila" 170 times; "dispositivo" 5 against "aparelho" 74. Meaning is intact; the legal texts read as if written by someone else.
- **Fix:** Use the established terms and add both pairs to the Portuguese term list.
- **How checked:** Term counts over the locale files.

### REPO-9 — No dependency update process; the CI audit skips dev packages and cannot fail

- **Severity:** LOW
- **Lane:** REPO
- **Where:** `deploy.yml:33-35` (`--omit=dev`, `continue-on-error: true`); no Dependabot or Renovate configuration.
- **What happens:** `npm audit` today: 0 runtime advisories, 11 in dev packages (1 high, in the exactly pinned `happy-dom`). Dev packages run in every CI job next to the secrets of REPO-5, and nothing will ever tell the owner about a runtime advisory either, because the step cannot fail.
- **Fix:** Dependabot for npm, Actions and Gradle; make the runtime audit blocking with a dated allowlist.
- **How checked:** `npm audit` run on 2026-11-27.

### REPO-10 — `docs/STATUS.md` embeds the test-file count, so two branches that each add a test break `main` when merged

- **Severity:** LOW
- **Lane:** REPO
- **Where:** `tests/architecture/status.test.ts:11`; `docs/STATUS.md` is the most-changed file in the history (142 commits).
- **What happens:** Whichever count survives a merge is wrong and `npm test` fails. It failed during this audit for exactly that reason (the auditors' scratch tests raised the count), and the music branch's commit message records the same failure.
- **Fix:** Take additive counts out of the generated file, or compare everything except counts.
- **How checked:** The baseline `npm test` of this audit: one failure, this test.

### REPO-11 — A test App Store signing key is committed and the server accepts an override of Apple's root certificate with no production guard

- **Severity:** LOW
- **Lane:** REPO
- **Where:** `tests/backend/fixtures/appstore/leaf.key`; `server/config.ts:258` (`APPLE_ROOT_CA_SHA256`).
- **What happens:** A staging or production server pointed at the test root, for instance to try purchases without Apple, accepts receipts that anyone can sign with the public test key.
- **Fix:** Refuse to start in production when the variable names anything but Apple's root; warn on staging.
- **How checked:** The config and the production checks (the variable is absent from them).

### REPO-12 — No licence or copyright statement on a public repository; Google Play library notices missing from the licences page

- **Severity:** LOW
- **Lane:** REPO
- **Where:** No `LICENSE`; `tools/release/licenses.mjs:16-20` omits Play Billing, Credentials, Google ID, Age Signals and Play Review, which `android/app/build.gradle` compiles in.
- **What happens:** The code is all-rights-reserved by default, but nothing says so to people who fork it. Google asks apps that use Play services libraries to show their notices.
- **Fix:** A short `LICENSE` ("All rights reserved", with the owner once the legal entity exists) and Android notices generated from the Gradle dependency graph.
- **How checked:** The tree and the licences generator.

## Checked and found sound

- Baseline on `main`: 333 test files and 2,638 tests pass (5 expected failures; 19 skipped for a missing Postgres, Redis or IPv6); lint, the server type-check, the translation check, the bundle budget and both builds pass.
- A 74-minute, 108-cycle session on a cheap-phone profile: battles, results, the replay viewer and 15 of 16 panels leave nothing behind; textures level off at about 250; no timer, listener or audio growth; per-frame work is the same in the last ten cycles as in the first; no console error, page error or unhandled rejection.
- The fuzzer applied about 321,000 commands and 145 battles: outside FUZ-1, no resource ever went negative, fractional or above storage, Jade rose only through grants, a refused command never changed the village, every save round-trip was exact, and every battle replayed to the same result. 1,800 corrupted saves: none hung and none silently became a new village.
- First run at 360x640: the splash clears in 2.5 to 4.2 s with no dialog before the first control; first build after 4 taps; no console or network error in eight boots. Fast repeated taps on Finish now, Spend, +5, Collect and the daily chest applied exactly once. A reload mid-raid plays the raid out and says so; a second tab gets a clear "open somewhere else" card; deleting the database mid-session loses nothing.
- The service worker: one cache after each of three deploys, offline reload in 1.9 s with the save, lazy panels open offline, and a missing `sw.js` leaves the game booting from its cache.
- No schedule is a finite list that runs out: seasons, events, festivals, wars, leagues and the 28-day calendar are all computed from an epoch or the UTC calendar.
- The daily-chest odds shown to players match the real draw (400,000 draws against the published 30/30/20/15/5).
- Every server time column is a 64-bit millisecond count; a device date set behind wipes nothing; about 50 numbers quoted in English text match the data; pack values and level tables are monotonic.
- Saves survive an app update: the WebView origin is Capacitor's default and does not depend on the bundle id. Android cloud backup and device transfer exclude the game's storage.
- The Play Billing and StoreKit plugins: pending purchases, reconnection, nothing finished before the game says so, revoked and unverified transactions skipped.
- With its secret set, the backup job dumps the real database and the drill restores that dump into a throwaway Postgres, checks it and starts the server on it. Rate limits fall back to memory when Redis is unreachable.
- Object-level authorisation held on every route probed: friend requests, Gang invites and leadership, duels, another Alliance's chat, push tokens, deletion codes, and every staff route without a token.
- Staff sign-in (constant-time token compare, failure limit, no cookie so no cross-site request forgery), the staff, deletion and complaint pages (text nodes only, strict content-security policy), account linking (an identity already linked is never moved), store webhooks (signature chain, replay and ordering) and compressed-body bombs.
- A fluent read of 340 high-stakes strings (age gate, consent, purchase confirmation, refund, withdrawal waiver, deletion, terms) in Spanish, French, German, Portuguese, Japanese, Chinese, Korean, Russian, Arabic and Hindi found no wrong meaning and the right legal terms in each. This is not a native review, but it is better news than "machine translated" suggests.
- Plural forms are complete for every language's grammar; no translator artefacts, no untranslated sentences, no sentences copied between related languages, no leftover vocabulary of the old game, and one translation per core game term in the ten languages read.
- Zoom is not disabled, the page language and direction follow the chosen language, every button has a name, focus is visible on all 25 stops, dialogs trap focus and close on Escape. The 50 store listings claim nothing that is not live.
- No live secret in any of the 49 remote branches (1,622 commits scanned for cloud, store and token patterns); the three private keys found are test fixtures.
- Every GitHub Action is pinned to a commit; no workflow interpolates inputs or secrets into a script; the lockfile carries an integrity hash for all 317 packages; `npm audit` reports 0 runtime advisories.
- The seven expected-fail tests are all recorded balance gaps, not hidden defects; no test is skipped except for a missing Postgres, Redis or IPv6.
- Fonts are two SIL OFL faces with their licence text shipped; art and audio are generated in code.
