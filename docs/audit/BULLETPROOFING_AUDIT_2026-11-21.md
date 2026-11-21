# Release bulletproofing audit (2026-11-21)

Audit of `jimhavlicekpersonal/ninja-version-of-game-1` at commit `560ce7acb2268fd0755adb799ed310db240ebe2e` (branch `claude/awesome-goodall-tglafs`), against the owner's **Game Release Bulletproofing Checklist** (17 sections, ~190 items: stability, saves, economy, onboarding, input, performance, networking, security, design, polish, UI, localization, store compliance, pipeline, analytics, real-world testing, launch day, and game theory 17a–17h).

A typeset PDF of this report is [`bulletproofing/BULLETPROOFING_AUDIT_2026-11-21.pdf`](bulletproofing/BULLETPROOFING_AUDIT_2026-11-21.pdf), rebuilt from this file by `python3 docs/audit/bulletproofing/make_report.py`.

This is a report, not a fix pass. Nothing in the game, server or data was changed. Every new finding below is **OPEN**. Prior audits' "fixed" claims were re-checked against current code where they touch a checklist item; where they hold, this report says so; where they don't, it says that too.

**How each item was judged.** PASS = verified in current code or by running it. PARTIAL = there, with a gap. FAIL = missing or defective. N/A = the game has no such feature (reason given). DEVICE/OWNER = cannot be settled from the repository (a phone, a store console, a live server, real players or a legal decision is needed); the code's support for it is still described. "Inferred" marks a conclusion reasoned from code but not reproduced.

---

## 1. Verdict

**The code is unusually well defended for an indie game; the release is not.** On the items code can settle, Kagemura passes most of the checklist: atomic versioned saves with migrations, server-checked receipts, a server that re-simulates every battle, idempotent commands, honest monetization with nothing random for sale, a sensible permission flow, deterministic replays and a procedurally safe content generator (4,050 generated bases swept, none impossible).

What stops a launch today falls into four groups:

1. **Never exercised end to end** (checklist §13, §15, §16). No signed Android or iOS build has ever been produced, the iOS TestFlight workflow has never run, no server has ever been deployed, no load test has run against real infrastructure, no real device or real player has touched the game, and several CI jobs show green while doing nothing. Every number about performance, memory and battery is emulation.
2. **Owner and legal blockers** (§12, §16). Publisher facts, support email, deletion URL and terms date are empty on the live legal pages; the bundle id is still `com.toadstoolkingdoms.app`; no store screenshots, no community channel, no on-call, no known-issues list.
3. **Defects found by this audit** (section 3): the most important are a **double-charge path on real-money Buy**, **cancelled touches deploying warriors**, **a player-settable server address in store builds**, **device-held villages bypassing the server economy in PvP with no server switch to require a move**, **raids solvable offline by a modified client**, and **unreadable crash reports (no source maps) plus no handling of the Android WebView renderer dying**.
4. **Blind at launch** (§1, §14). Crash reports are opt-in with no session data, so the crash-free rate cannot be computed; analytics are adults-only opt-in, so D1 and funnel numbers will read high; there are no per-level fail or quit rates.

The checklist's own closing list ("what the pros obsess over most") scores like this:

| Pro priority | State |
|---|---|
| Save integrity | **Strong** in code (atomic IndexedDB writes, revisions, migrations, damaged-save backups, newer-save stop). One hole: a failed backup write lets a damaged save be overwritten (S-3). Never kill-tested on a device. |
| Crash-free rate | **Cannot be measured** today: opt-in reports, no session envelopes, minified traces, Android renderer deaths uncounted. |
| First 5 minutes | **Designed well** (nine-step tutorial, skippable with confirm, no offers on day 1, notifications asked after the first long timer). Never watched with a real player. |
| Release builds on old hardware | **Not done.** No signed build exists. |
| Fast hotfix path | **Weak.** No `v*` tags, every build reports version `0.1.0` so `MIN_CLIENT_BUILD` cannot target a hotfix, no web rollback procedure, kill switches only by redeploy. |
| Incentives beat intentions | **Mixed.** No pay-to-win, good comeback mechanics. But building defense is never the fastest strategy, late raiding is ~5% of income, one army is best at Keeps 12 and 15, Air is dominated, and the Power Ranking is mostly a Keep ranking that Jade can buy. |

## 2. Verification baseline (this pass)

| Check | Result |
|---|---|
| `npm ci` | Clean install, 0 vulnerabilities (`npm audit --omit=dev`) |
| `npm test` | **262 files passed, 1 skipped; 2,348 tests passed, 19 skipped** (Postgres/Redis tests need `TEST_DATABASE_URL`/`TEST_REDIS_URL`), 124 s |
| `npm run lint` | Pass |
| `npm run build` | Pass. Main chunk 561.6 kB (183.8 kB gzip), Phaser 660.6 kB (175.5 kB gzip), largest shared chunk 355 kB (115 kB gzip). `dist/` is 23 MB, of which 16 MB is on-demand language packs (`dist/lang/`) and 2.2 MB is `assets/` |
| `npm run typecheck:server`, `npm run server:build` | Pass |
| Targeted runs by the section auditors | ~20 further test files re-run individually, all pass; scratch probes reproduced the touch-input defects (I-1, I-2) against the real `CameraControl`; scratch simulations of generated bases, seed luck and reward per hour using the real simulator |
| GitHub Actions (latest `main` runs, `gh run view`) | Android `aab` job "✓ in 4 s" with no AAB built (no signing secrets); Server staging "✓" with "built but not deployed"; iOS TestFlight: no runs ever; main CI failed on 11-16, 11-17 and 11-20 |
| Live web build | Game and all legal pages return 200; `legal-config.js` fields empty |
| Not done | Physical devices, signed builds, store consoles, deployed server, Postgres/Redis tests, Playwright screenshots (Playwright is not a devDependency and was not available to the auditors), real players |

## 3. New defects found by this audit

Ordered by priority for a release. None of these is recorded as open in `docs/store/WORLDWIDE_AUDIT.md` or `docs/audit/` (checked by search); each was spot-checked in code by the coordinator unless marked *inferred*.

| ID | Sev. | Area | Defect | Evidence | Fix |
|---|---|---|---|---|---|
| E-1 | **High** | Money (§3, §4) | **No in-flight guard on real-money Buy; a double tap can start two purchases.** `buyButton` → `buy()` awaits `ensureAge()`/`storefront()` before the confirm, with no busy flag; `controller.purchase` has no lock; confirms stack. Every product is consumable and `TkStorePlugin.purchase` has no concurrency guard. For `season_scroll`/`clan_stipend` two concurrent server intents both pass `canPurchase`, and the second verified grant skips it: the player can pay twice for one pass. *Inferred end to end; the missing guards are verified.* | `src/presentation/ui/economyUi.ts:133-138,179-222`; `src/gameplay/control/controller.ts:331`; `server/core/purchases.ts:155-164`; `village.ts:1223` | `purchasing` flag in `EconomyUi.buy` that disables every Buy button; re-entrancy check in `controller.purchase`; server refuses a pass/stipend intent while another unused one exists. |
| S-1 | **High** | Anti-cheat (§6, §7, §17e) | **Device-held villages bypass every server economy check in PvP, and the server cannot require the move.** The auto-move is decided on the client and skipped forever once localStorage `tk.net.villageMoveRefused:<url>` holds any value (settable in devtools on the web build), or after any import refusal (including the account-age cooldown). Such a player uploads a Keep-15-legal base and attacks with a fresh max-legal army each time (`checkArmy` checks legality, not ownership), climbing Honor/Power boards and wars by volume. | `src/backend/net/connection.ts:229-247`; `server/core/pvp.ts:210-247,283` | Server policy `REQUIRE_SERVER_VILLAGE=1`: refuse `match`, `/attacks/start`, `uploadBase`, donations and war attacks without a server village. |
| R-1 | **High** | Pipeline / security (§12, §13) | **A player-settable server address ships in store builds.** Settings → Advanced always shows `serverAddressBlock()`, and `resolveServerUrl` prefers the stored choice over the built-in URL. A social-engineered player ("enter this server for free Jade") sends their identity flow, ID tokens and purchase tokens to an attacker's server. *Token relay inferred.* | `src/presentation/ui/settingsUi.ts:184`; `src/backend/net/connection.ts:122-126` | Show the field only in dev/sandbox/staging builds (e.g. `VITE_ALLOW_SERVER_CHOICE`) or allow only official hosts. |
| I-1 | **Medium** | Input (§4) | **A cancelled touch counts as a tap; in battle it deploys a warrior.** Phaser emits `POINTER_UP` on `touchcancel` with only `wasCanceled = true`; `CameraControl.up` never checks it and calls `onTap` → `tryDeployAt`. `VillageScene.onUp` has the same flaw. Scenario: finger resting on the map, an incoming-call banner or system gesture cancels the touch, a warrior lands there and the server-simulated battle cannot undo it. Reproduced by probe. | `src/presentation/render/cameraControl.ts:163-183`; `BattleScene.ts:228`; `VillageScene.ts:627-640` | `if (p.wasCanceled) { this.drag = null; return; }` in both handlers. |
| I-2 | **Medium** | Input (§4) | **Fingers resting on the HUD corrupt map input.** Phaser registers touches that start on DOM elements as down pointers; `CameraControl.down` counts all of them, so a map tap with a thumb on a troop card becomes a pinch (no deploy, unwanted zoom); `up()` clears `drag` before checking the pointer id, so lifting the HUD finger cancels the map finger's hold-to-deploy. Reproduced by probe. | `cameraControl.ts:126-133,166-168` | Count only pointers whose `downElement` is the canvas; check the id before clearing `drag`. |
| O-1 | **High** | Observability (§1) | **No source maps: every Sentry stack trace is minified.** `vite.config.ts` sets no `build.sourcemap` and no workflow uploads maps. | `vite.config.ts:161-172`; `.github/workflows/deploy.yml`, `android.yml`, `ios-testflight.yml` | `sourcemap: 'hidden'`, upload to Sentry under `kagemura@<version>`, never deploy `.map` files. |
| O-2 | **High** | Stability (§1) | **Android has no handler for the WebView renderer dying.** `MainActivity` registers no `WebViewListener`, so Capacitor's `onRenderProcessGone` returns false and Android kills the whole app when the renderer is killed for memory: a Play Vitals crash that never reaches Sentry. iOS reloads in the same situation. | `android/app/src/main/java/**/MainActivity.java` (no listener; grep); `node_modules/@capacitor/android/.../BridgeWebViewClient.java:92-103` | `bridge.addWebViewListener` with `onRenderProcessGone` that reloads or recreates the activity and returns true. |
| G-1 | **Medium/High** | Competitive integrity (§7, §17b-c) | **Raids can be solved offline by a modified client.** The full base (traps included) is in the match answer, the seed arrives at `startAttack`, the report may come up to the 1 h ticket TTL + 72 h later, and the sim is deterministic (~0.1 s per battle). A search over 6 points × a few orders lifts a raid from ~80% to 98–100% and makes declared 3★ stakes riskless. | `server/core/pvp.ts:41,52,437-444,520-532` | Treat a report later than battle length + slack after start as unreported unless the game was backgrounded (flag it); add statistical detection (best-point hit rate, stake success rate); hide traps from the match payload where the sim allows; record the accepted limit in `docs/PROTOCOL.md` "Trust". |
| R-2 | **Medium** | Pipeline (§13, §16) | **Nothing forces a version bump.** `package.json` `0.1.0` feeds iOS `MARKETING_VERSION`, Android `versionName`, `X-Client-Build`, the Sentry release and `MIN_CLIENT_BUILD`. App Store Connect refuses a reused marketing version once released, and a day-0 hotfix cannot be forced because old and new builds both report `0.1.0`. | `package.json:4`; `src/main.ts:288`; `.github/workflows/android.yml` "Version" | Signed jobs fail unless the version is above the latest `v*` tag (or bump automatically); include the build number in `X-Client-Build`. |
| R-3 | **Medium** | Pipeline (§13) | **Web rollback is undocumented and unsafe across save versions.** Reverting a release that bumped `SAVE_VERSION` stops boot ("save from a newer build") for every player who already opened it. | `docs/store/RELEASE.md` (no web step); `src/gameplay/sim/save.ts:38` | Document a web rollback (redeploy a previous artifact) and forbid rollback across a save bump (fix forward). |
| S-2 | **Medium** | Server availability (§6, §7) | **Unbounded Prometheus label cardinality from client headers.** `x-client-build` (40 chars) and `simRules` (8 chars) become labels on every request in an `onRequest` hook; `PromMetrics` keeps every series. One address at the 3,000/min IP limit adds millions of series a day until the instance runs out of memory. | `server/app.ts:262-267`; `server/observability.ts:75-87` | Label only builds matching `^\d+\.\d+\.\d+\+(web|ios|android)$` and known rules numbers, else `other`; cap series per metric. |
| E-2 | **Medium** | Money (§3) | **A purchase made while the game server is unreachable bypasses the server entirely** (extends known E21). `purchaseVerifier()` is null until `hello` succeeds for a device-held village, so the receipt is trusted on the device and finished; the server never sees it: no server under-18 cap, no refund pause, no revenue record, later refunds cannot be revoked. Reproduce: block the server host, buy on iOS. | `src/backend/net/connection.ts:265-268`; `controller.ts:353-374` | When a server is configured, refuse to buy until the verifier is available ("Connect to buy"). |
| E-3 | **Medium** | Analytics (§14, §3b) | **Retention and funnel numbers are selection-biased and partly wrong.** Only online adults who say yes are counted (on offline builds the question comes after the tutorial), so early churners never appear and D1/tutorial completion read high. A tutorial skip logs the same event as completing it. Local-delivery and restored purchases log no `purchase` event. | `src/backend/net/stats.ts:22-32`; `tutorial.ts:163`; `controller.ts:408-416` | Add a skip flag; log `purchase` on every delivery path; state the bias on the growth page; use store-console D1 as the KPI gate. |
| I-3 | **Medium** | UI (§10) | **No browser/PWA back handling.** No `popstate`/`pushState` anywhere in `src/`. On the Pixel 7 Chrome PWA (a named device target) the back gesture leaves the game from any dialog or mid-battle with no confirm; the raid is abandoned. | grep `popstate` in `src/`: none; native path `main.ts:964-978` | Push a history entry while a modal, sheet or battle is open; route `popstate` to `closeTop`/battle back. |
| I-4 | **Medium** | Input (§4, §10) | **No busy state on Attack / paid Next.** `scout(true)` charges the scout fee synchronously, then waits up to 8 s+ on the network while the old HUD's Next stays live; a double tap charges twice and opens two sessions. Online Attack also shows no loading indicator during that wait. | `src/app.ts:84-107`; `controller.ts:527`; `battleHud.ts:550`; `connection.ts:1375` | In-flight flag disabling the button plus a spinner. |
| D-1 | **Medium** | Design (§17a) | **Building defense is never the fastest strategy, and the gate stops at Keep 12.** Day Keep 15 is reached: rusher 100.2, regular 103.6, defender 108, fortress 129.6 (1.29×, ungated). Online, bot raids on villages do not run yet (P2-12), so defense matters even less there. | `docs/game-theory/CAMPAIGN.md`; `tests/gameplay/balance/campaign-gates.test.ts:157` | Add a Keep 15 gate; make a held defense against a real player pay something not tradeable between accounts. |
| D-2 | **Medium** | Design (§17f) | **The casual raiding economy is net negative or break-even.** Stolen ÷ looted: casual explorer 1.60, casual with a third artisan 1.06, plain casual 0.96. At Keep 15 raid profit per hour of training is ~5% of collector income. The test admits "E26 open". | `campaign-gates.test.ts:124`; scratch `net.ts` | Rebalance raid loss vs loot for casual policies; give late raiding a reason beyond resources. |
| N-A | **Medium** | Accessibility (§9, §11) | **Camera shake and the Keep flash ignore reduced motion; no in-game motion/shake/flash setting.** Poses, counters and ceremonies respect `prefers-reduced-motion`; the shakes and the full-screen additive flash do not. | `BattleScene.ts:1126,1263`; `fx.ts:311-320`; `settingsUi.ts` | Gate on `reducedMotion()`; add "Reduce motion / screen shake" in Settings. |
| A-1 | **Medium** | Audio (§9) | **Low plucked notes end abruptly and click.** Pluck buffers (koto 1.6 s, shamisen 0.7 s) have no fade; a node copy of the synthesis shows the last 10 ms still at −12 to −23 dB for low notes used by the village melody and the `error`/`jam` effects. | `src/presentation/audio/sound.ts` `stringBuffer` | Fade the last 20–30 ms to zero. |
| S-3 | **Low/Med** | Saves (§2) | **A damaged save can be lost when the backup write fails.** `backupDamaged(raw).catch(() => undefined)` then `controller.save()` writes a new village over it; the likely cause of both is a full disk. Breaks the "a damaged save is kept" invariant. | `src/gameplay/control/controller.ts:129-134` | If the backup fails, don't save; run on memory with the storage banner. |
| O-3 | **Low/Med** | Stability (§1, §5) | **No thermal or late-session downgrade.** The frame-rate verdict is made once per session from the first battle's first 20 samples and only for automatic `high`; `low` has no step below. | `src/presentation/render/quality.ts:270-289` | Keep sampling; allow one more downgrade per session (lower render scale or 24 FPS). |
| I-5 | **Low/Med** | Input (§4) | **Army "Dismiss ×" is unstyled with a ~20 px tap target.** All `.qx` CSS is scoped to `.queue-item`, which no element uses; the test asserting the 44 px `::after` checks the dead selector, so audit R10's "fixed" overstates it. | `armyUi.ts:390-392`; `styles.css:446-448,1079-1080`; `village-hud-batch.test.ts:123` | Retarget to `.army-chip .qx`; fix the test. |
| A-2 | **Low** | Audio (§9) | **Switching one sound channel off silences the other** until the next tap (`afterSwitch(false)` suspends the context even if the other channel is on). | `sound.ts:131-134` | Suspend only when both are off. |
| A-3 | **Low** | Audio (§9) | **iOS `'interrupted'` AudioContext state not handled** (`unlock` resumes only `'suspended'`); after a call or Siri with the page still visible, sound may stay dead. *Inferred; needs device.* | `sound.ts:91` | `if (state !== 'running') resume()`; add `onstatechange`. |
| A-4 | **Low** | Audio (§9) | **No limiter on the master bus**; the Keep collapse plus star slam can sum above 1.0. *Inferred.* | `sound.ts` | `DynamicsCompressorNode` before the destination. |
| N-B | **Low** | Onboarding (§3b) | **The play-statistics banner can appear during the tutorial** on store builds (deferred only during battles). | `src/main.ts:381-411` | Wrap in `afterTutorial()`. |
| D-3 | **Low** | Data (§17d) | **Gang War `chestMinAttacks` is in the wrong block.** The key (with its Gang-War comment) is duplicated inside `groveRaid`; `gangWar` has none, so `gangWars.ts` falls back to `?? 1`. A data or balance-bundle change meant for Gang Wars silently does nothing. | `src/gameplay/data/social.json:278-281`; `server/core/gangWars.ts:419` | Move it into `gangWar`; remove the duplicate key. |
| D-4 | **Low** | Design (§17e) | **The Power Ranking is mostly a Keep ranking** (`rating + 150 × (Keep − 1)`), and the Keep can be rushed with Jade top-ups. | `src/gameplay/sim/rating.ts:68` | Lower `powerWeight` or rank attack rating within Keep bands. |
| D-5 | **Low** | Design (§17d) | **A one-warrior attack earns the Alliance War chest** and spends a team attack slot. | `social.json` `chestMinAttacks: 1`; `server/core/groveRaid.ts` | Scale the chest by own stars or a minimum share of housing deployed. |
| D-6 | **Low** | Tests (§8) | **`TRIAL_CAP = 58` is a constant measured once**; a combat change can silently make the top Trial achievement unreachable. | `tests/gameplay/balance/achievements-reachable.test.ts:15` | Re-measure in the slow suite. |
| R-4 | **Low/Med** | Pipeline (§13) | **A production "promotion" rebuilds the server image** under the same tag instead of promoting the contract-tested staging image. | `.github/workflows/server.yml` (`image` job has no `if:`) | Skip the build when the tag exists; deploy by digest. |
| R-5 | **Low** | Store (§12) | **"Village on the server (beta)"** is a player-visible heading (App Review 2.2 risk). | `src/presentation/ui/hud.ts:1065`; `locales/en/messages.json:1577` | Drop "beta" or gate the feature. |
| R-6 | **Low** | Store (§12) | **`licenses.html` omits the Android natives** (Play Billing, Credential Manager / Google ID, Play Age Signals, Play in-app review); the licence test covers npm deps only. | `public/licenses.html`; `android/app/build.gradle:53-58` | Add them and extend the test. |
| S-4 | **Low** | Networking (§6) | Sync retry has **no jitter** (15 s ×2 to 5 min), so clients reconnect in waves after an outage. | `src/backend/net/connection.ts:1165-1171` | ±30 % jitter. |
| S-5 | **Low** | Saves (§2) | Command queue (localStorage) and village (IndexedDB) can diverge after a kill and roll `seq` back; later commands are silently skipped. *Inferred.* | `src/backend/net/villageSync.ts:143-162` | Persist `seq` before sending, or have the server return `ackSeq`. |
| I-6 | **Low** | L10n (§11) | Phaser canvas text sets no RTL base direction (mixed Arabic + numbers); `tools/i18n/smoke.mjs` cannot run (Playwright not a dependency, not in CI); some literals leak (e.g. `ad?.name ?? 'research'`). | `BattleScene.ts:629,964`; `armyUi.ts:550` | `rtl: isRtl()` or isolates; add Playwright and a rendered pseudo-locale sweep to CI. |
| O-4 | **Low** | Leak (§1) | `VillageScene` resize handler never removed and `unsubs` never emptied (harmless while the scene is created once). | `VillageScene.ts:141,177` | Remove on shutdown. |

Previously recorded items that this pass re-confirmed as **still open**: X1 (12 h backdated claims), F2 (no Content-Security-Policy; sign-in token in localStorage), E06 (Keep rushing with Jade), E11/E21 (device clock and device-trusted purchases for device-held villages), E26 (casual raid losses), P2-12 (no bot raids on villages online), GLOBAL-001/007/008/015/017 and R01–R10 device and store evidence.

## 4. Section-by-section results

Counts are per row of the tables below (a few checklist bullets are split or merged); an item marked "PASS (code) / DEVICE" counts as a pass for what code can show. "Dev/Own" = needs a device, a store console, a live server, players, or the owner.

| § | Section | Pass | Partial | Fail | N/A | Dev/Own |
|---|---|---|---|---|---|---|
| 1 | Crashes and stability | 3 | 3 | 3 | 0 | 1 |
| 2 | Save data and progression | 5 | 3 | 0 | 0 | 0 |
| 3 | Economy and monetization | 4 | 3 | 0 | 1 | 0 |
| 3b | Onboarding and retention | 4 | 2 | 0 | 0 | 0 |
| 4 | Input and controls | 2 | 5 | 0 | 1 | 0 |
| 5 | Performance | 2 | 5 | 0 | 0 | 1 |
| 6 | Networking | 3 | 4 | 1 | 0 | 3 |
| 7 | Security and cheating | 3 | 4 | 1 | 0 | 0 |
| 8 | Content and game design | 6 | 3 | 0 | 0 | 0 |
| 9 | Audio, visuals and polish | 3 | 3 | 2 | 0 | 2 |
| 10 | UI and UX | 4 | 3 | 0 | 0 | 1 |
| 11 | Localization and accessibility | 2 | 4 | 0 | 1 | 1 |
| 12 | Platform and store compliance | 9 | 6 | 2 | 1 | 0 |
| 13 | Build and release pipeline | 3 | 4 | 2 | 0 | 1 |
| 14 | Analytics and observability | 1 | 3 | 1 | 0 | 1 |
| 15 | Real-world testing | 0 | 1 | 2 | 0 | 3 |
| 16 | Launch-day readiness | 1 | 2 | 4 | 0 | 1 |
| 17 | Game theory (a–h) | see 4.17 | | | | |

### 4.1 Crashes and stability

| Item | Status | Evidence / gap |
|---|---|---|
| Crash-free rate > 99.5 % | **FAIL (unmeasurable)** | `analytics/crashReports.ts` sends error events only, no Sentry session/release-health envelopes; reports default off (`platform/prefs.ts:10`) and boot crashes are dropped unless opted in (`main.ts:1051`); native and renderer crashes not captured. Use Play Console / App Store Organizer crash rates as the gate. |
| Cold/warm start, resume × 50 | DEVICE | `installLifecycle` (`main.ts:889-932`) saves and flushes on hide/pagehide/`pause`; recovers purchases on return. No automated repeated-resume test. |
| Force-quit mid-save | PASS (code) | One IndexedDB transaction per save with the revision checked in it (`persist/saveStore.ts:111-140`); damaged saves kept; iOS IDB reconnect (`main.ts:934-958`). |
| Force-quit mid-purchase | PARTIAL | Transactions finished only after a save lands; `recoverPurchases` on visible/online/backoff (`main.ts:345-425`). No kill test. |
| Force-quit mid-battle | PASS (code) | Deployments saved ≤ 1.5 s, `flushBattle` on hide, `pendingBattle` settles a killed battle (`sim/village.ts:754-979`), 250 ms catch-up cap. |
| Low-memory kills | PARTIAL | iOS memory warning trims textures; Capacitor iOS reloads a dead WebView. **Android renderer death unhandled (O-2).** No game handling of WebGL `contextlost` (left to Phaser). |
| Memory leaks over 2 h | PARTIAL | Scenes release held textures and listeners; LRU budget on painted art (`render/textureBudget.ts`). No soak test or heap trace (O-4 minor). |
| Thermal throttling | FAIL | One-time verdict (O-3). |
| Crash reporting with symbolicated traces | **FAIL** | Wired (`main.ts:235-242`, DSN in workflows) but no source maps (O-1); DSN unset is an owner item. |
| Null / divide-by-zero / empty arrays | PASS (spot check) | Divisions and `[0]` in `src/gameplay/sim` guarded (`pass.ts:164-177`, `temper.ts:88`, `basegen.ts:272`, `warriors.ts:263`, `heroAbilities.ts:41`, `motion.ts`). Not exhaustive. |

### 4.2 Save data and progression

| Item | Status | Evidence / gap |
|---|---|---|
| Kill during a write | PASS (code) / DEVICE | Single IDB `put` in a `readwrite` transaction; autosave on hide and every 15 s if changed. |
| Atomic saves | PARTIAL | Atomic per write, up to 5 damaged backups (`saveStore.ts:52,142-153`). Gaps: S-3, S-5. |
| Versioning and migration | PASS | `SAVE_VERSION = 24`, stepwise `migrate` (`sim/save.ts:16,51-263`); newer save stops boot with Update / Copy save code (`main.ts:1076-1110`). |
| Cloud save conflicts | PASS (code + tests) / DEVICE | Per-device `deviceSeqs`, batch replay, `refusedLog`, rebase on the server's answer (`server/core/village.ts:299-332`, `villageSync.ts:263-319`). |
| Reinstall and restore | PARTIAL | Only through a linked sign-in (Apple/Game Center/Google); guest token in localStorage (excluded from Android backup), no transfer code; save code exists. |
| Clock manipulation | PARTIAL | Server-held: command times clamped (+2 min / −12 h), chest entropy server-side. Open: X1, E11 (device-held trusts `Date.now()`); client ignores `hello.serverTime`. |
| Integer overflow | PASS (practical) | Money columns `bigint`; resources capped by storage; Trial rewards grow by log2 + linear. |
| Tutorial skip / quit / replay | PASS | Step index saved; skip confirms; replay in Settings; the tutorial grants nothing farmable. |

### 4.3 Economy and monetization

| Item | Status | Evidence / gap |
|---|---|---|
| Every IAP: purchase, restore, refund, interrupted | PASS (code) / DEVICE | Intent → pay → redeem → grant → finish after save (`controller.ts:331-374`); restore (`:446-461`, `economyUi.ts:288-305`); refunds server + client debt (`purchases.ts:384-470`, `controller.ts:471-489`); iOS never finishes early (`TkStorePlugin.swift:69-108`). No device purchase ever run. |
| Offline purchase | PARTIAL | E-2. |
| Server-side receipt validation | PASS | Apple x5c chain pinned to Root CA G3 (`server/payments/apple.ts:126-176`); Google Play Developer API (`google.ts:129-142`); device-trusted only when no verifier (E-2/E21). |
| Double-spend / double-claim | PARTIAL | Claims idempotent in the sim; grants by transaction id; per-player server locks. **E-1** (Buy) and **I-4** (paid Next) unguarded. |
| Ad failures / rewarded ads | N/A | No ad SDK anywhere (grep across src, server, android, ios); listing and privacy docs say no ads. |
| Reward exactly once across a crash | PASS (code) | Claims mutate then save; a crash loses the claim, never duplicates it. |
| Sinks and faucets model | PARTIAL | Soft currencies: 119–400-day campaign model gated by `campaign-gates.test.ts`. **Jade has no tool-generated lifetime model** (only hand counts in `BALANCE_AUDIT_2026-11-08.md:212`). |
| Prices in local currency | PASS (code) / DEVICE | Store `displayPrice`/`formattedPrice` only; "Not sold here" when missing. |

### 4.3b Onboarding and retention

| Item | Status | Evidence / gap |
|---|---|---|
| First 60 seconds | PASS (design) / DEVICE | Nine-step tutorial (`ui/tutorial.ts:44-120`) plus the first-raid coach. Never playtested with a stranger. |
| Day-1 retention 35–40 % | PARTIAL | Target documented; cohort D1/D7/D30 computed server-side (`server/core/stats.ts:58-104`), but biased (E-3). No data. |
| Skippable, never forced to skip | PASS | Corner skip with confirm; restart available. |
| Fair fail states | PASS | Gentle first raids, shield after the first raid, no paid offer after a loss, no offers for 24 h or for unknown/under-18 ages. |
| No pop-up wall | PARTIAL | Spaced out; up to 3 modals at launch on store builds (age, terms, iOS Safari hint) and N-B. |
| Permission prompts | PASS | Notifications pre-prompt only after the tutorial and the first > 1 h upgrade; no ATT needed. |

### 4.4 Input and controls

| Item | Status | Evidence / gap |
|---|---|---|
| Third finger, palm, edge swipe | PARTIAL | Pinch re-anchor and `pointerupoutside` handled; **I-1, I-2**. Trackpad two-finger scroll zooms, cannot pan. |
| Interruptions | PARTIAL / DEVICE | Save/suspend on hide; no battle pause on `blur` (Control Center, call banner); I-1 lets a cancelled touch deploy. |
| Aspect ratios, notch, safe areas | PASS (code) / DEVICE | `viewport-fit=cover`, `env(safe-area-inset-*)` used 69 times; minor: toasts use `left: 8px` without `--safe-l` (`styles.css:161,781`). |
| Rotation | PASS (code) | Resize/orientation handling, battle refit, landscape rules. |
| Controller | N/A | Gamepad excluded from the Phaser build. Keyboard basics present. |
| Input buffering | PARTIAL | Opening-shot touch swallowed by design; I-2, I-4. |
| Hit areas ≥ 44 pt | PARTIAL | Bottom bar at 320 px tested; most controls 44 px or `::after`; **I-5**. |
| Accidental-tap protection | PARTIAL | Confirms on Jade, money (plus an under-18 second confirm), cancels, dismiss, deletion; **no re-entrancy (E-1, I-4)**. |

### 4.5 Performance

| Item | Status | Evidence / gap |
|---|---|---|
| Stable FPS on worst device | PARTIAL / DEVICE | Low profile (2× canvas, 30 FPS, smaller textures, calm village); live drop on a slow first battle; nothing below `low`, nothing later in a session. |
| Frame pacing | PASS (code) | 120 Hz capped to 60; idle ~20 FPS, ~10 FPS under dialogs; drawn-frame meter. |
| Load to playable < 3–5 s | PARTIAL / DEVICE | Gzip ~359 kB game + 175 kB Phaser; prior emulation 4.7 s at CPU×4 but ~29 s to the village on 240 kbps. No size budget test. |
| Battery per hour | PARTIAL / DEVICE | Music stops when muted/hidden, AudioContext suspended; idle village still draws ~20 FPS forever. |
| Download / install size | PARTIAL | Web: 2.2 MB assets + per-language packs. No AAB/IPA measured (none built). |
| Asset streaming / shader stutter | DEVICE | Sliced painting at boot; ruin textures painted on first use mid-battle (possible hitch); no shader warm-up. |
| GC spikes | PARTIAL | New `Set` per frame for projectiles, per-frame health-bar redraws, `querySelector` per pointermove; unmeasured. |
| Profile release builds | PASS (tooling) | `tools/perf/profile.mjs`, `lowend.mjs` on `dist/` (emulation only). |

### 4.6 Networking

| Item | Status | Evidence / gap |
|---|---|---|
| Airplane mode mid-session | PASS (code) / DEVICE | `online`/`offline`/`visibilitychange` listeners; server raids refused offline with an explanation; 72 h late reports. |
| Wi-Fi → cellular | DEVICE | 15 s request timeout; idempotent batches. |
| 500 ms+ latency, packet loss | DEVICE | Never measured. |
| Server down | PASS (code) | Boot needs no network; village keeps working. |
| Timeouts, retry, backoff | PARTIAL | Exponential to 5 min with **no jitter** (S-4); reads retry linearly; writes never retried by the adapter. |
| 10× load test | **FAIL** | Never run against a deployment; recorded runs are 5× in memory and 8 battles/s on one 4-core box (`docs/backend/PVP_ROADMAP.md:327,342`). |
| Auto-scaling, spend alerts | OWNER | Dockerfile health check; 13 Prometheus alerts; no autoscaling or billing alerts in repo. |
| Anti-cheat | PARTIAL | Every battle re-simulated, server-held commands replayed with `economyHash`; **S-1, G-1**. |
| Time sync | PARTIAL | Server clamps; client never uses `serverTime`. |
| API versioning | PASS | `PROTOCOL_VERSION 11`, `MIN_PROTOCOL 7`, 426 for too-old clients, archived rules per `SIM_RULES`. |
| Forced update screen | PARTIAL (by design) | "Update Kagemura" pauses online play only; blocked in practice by R-2. |

### 4.7 Security and cheating

| Item | Status | Evidence / gap |
|---|---|---|
| Memory editors / save editing | PARTIAL | Server-held villages authoritative; import checks legality, sandbox traces, provenance and account age; S-1. |
| Leaderboard spoofing | **FAIL** | S-1 (device-held attacker's Keep from its own upload; army legal-not-owned). |
| Replay / tamper on API calls | PASS | One-time sign-in nonces, per-device `seq` (C1 fix verified at `server/core/village.ts:189,213`), Idempotency-Key with fingerprint, server seeds, unique receipts. |
| No hardcoded keys | PASS | Only public ids in `VITE_*`; private keys only in test fixtures; Android signing from env or ignored file. |
| Client obfuscation | PARTIAL (acceptable) | Minified, no maps shipped; Android `minifyEnabled false`; `window.tk` only with `?debug` (offline sandbox). |
| Server authority for value | PARTIAL | Purchases, cap and server-held economies; not device-held PvP (S-1) nor the outcome search (G-1). |
| Rate limiting | PASS / PARTIAL | Per IP (/64 for IPv6), per player, per route; fails open per instance without Redis (documented); S-2 bypasses it. |
| Privacy minimisation | PASS (documented) | Ids declared in `docs/store/PRIVACY.md`; log retention is an owner decision. Open: F2 (no CSP). |

### 4.8 Content and game design

| Item | Status | Evidence / gap |
|---|---|---|
| Soft-locks | PASS | Worst case (spend everything on decor) is rescued by the day-1 calendar claim (8,000 Coins), the daily chest and the drill; no sell/demolish; raids take ≤ 20 % of storage; longest stall < 1 day. |
| Sequence breaking | PASS / PARTIAL | Tutorial steps are state checks; Keep rushing with Jade still allowed (E06). |
| Difficulty spikes | PARTIAL | **Keep 15 cliff**: regular 1.69 → 1.10 stars (3★ 3 %); casual explorer 0.54–0.71 stars late. Gates average two Keeps and use one seed, which hides single-Keep spikes. |
| Dead ends | PASS (inferred) | Endless Trials with task cap; catch-up two Keeps below. |
| Win and lose both trigger | PASS | `destroyed`, `time` (180 s), `no_troops`, `surrender` (`battle.ts:828-838,917-922`), with tests. |
| Every level beatable | PARTIAL | Generated content swept (below). Trials' reachable ceiling is a constant (D-6); campaign single-seed. |
| Edge-case inputs | PASS | `canDeploy` refuses after the end, off-map, prototype ids, off-zone, over cover; no-warrior battles rejected/forfeited. |
| RNG fairness, seed reproducibility | PASS | mulberry32, determinism tests (also with TurboFan/Maglev off), server seed issued after the stake. |
| Procedural content never impossible | **PASS (run)** | 3,600 generated bases (Keeps 1–15 × 5 layouts × bias) + 450 Trial bases: all have 6 infiltration points, a Keep, cover ≥ army housing, and something to destroy; player layouts held to `entryRoom` (6 of 8 approaches open). |

### 4.9 Audio, visuals and polish

| Item | Status | Evidence / gap |
|---|---|---|
| Ducking, mute switch | PASS (iOS code) / DEVICE | AVAudioSession `.ambient` + `.mixWithOthers` (`ios/App/App/AppDelegate.swift:13`). |
| Bluetooth connect/disconnect | DEVICE | No output-change handling. |
| Resume after interruptions | PARTIAL | visibility suspend/resume, unlock on tap; A-3. |
| Volume balance | PARTIAL | On/off switches only, fixed gains; no voice. |
| Clipping / popping | **FAIL** | A-1, A-4; instant gain switches. |
| Missing / placeholder / debug assets | PASS (text) | No Toadstool/mushroom/TODO/placeholder in `locales/en`; old names only in internal ids. Art not re-checked visually. |
| Z-fighting, pop-in, overlap | DEVICE | Prior screenshot fixes not re-verified. |
| Non-interruptible / desync animations | PASS (code) | Opening shot skippable; reduced motion skips ceremonies; slow motion is visual only. |
| Colorblind, contrast | PARTIAL | No colorblind mode or contrast test; building placement is green vs red only (`VillageScene.ts:785-803`). |
| Shake / flash options | **FAIL** | N-A. |

### 4.10 UI and UX

| Item | Status | Evidence / gap |
|---|---|---|
| Smallest and largest screens | DEVICE | Breakpoints at 345/389/400/430/600 px width and 480/600/700 px height; only the bottom-bar arithmetic is tested; no screenshots this pass. |
| Text overflow in every language | PARTIAL | `pseudo-locale.test.ts` (+40 % and RTL) checks formatting and CSS guards, renders nothing; the Spanish smoke tool cannot run (I-6). |
| Back / gestures | PARTIAL | Native Android back handled; **web/PWA none (I-3)**. |
| Loading indicators > 300 ms | PARTIAL | Panels show "Loading…"; online Attack shows nothing for up to 8 s+ (I-4). |
| Error messages | PASS | Localised codes, refusals with amounts, offline and save-failure guidance. |
| No dead-end menus | PASS | Every modal closes by Esc, Back or close. |
| Settings persist | PASS | All in try/catch-wrapped storage. |
| Destructive confirmations | PASS | Cancels, dismiss, deletion, start over; there is no demolish or sell. |

### 4.11 Localization and accessibility

| Item | Status | Evidence / gap |
|---|---|---|
| Fonts for all scripts | PASS (code) / DEVICE | Latin-only bundled fonts with per-script system stacks for every script in `languages.json`; cheap-Android coverage of Ethiopic/Odia needs a device. |
| Right-to-left | PARTIAL | `dir="rtl"` before modules run, logical properties, name isolation; canvas text not RTL (I-6). |
| Number/date/currency | PASS | `Intl` with `latn` digits; store price strings. |
| Pseudo-localization for hardcoded strings | PARTIAL | Display-time translation of legacy literals; `i18n:check` passes; no rendered sweep; 0 of 48 languages have a native human review (owner). |
| Dynamic type / text scaling | PARTIAL / DEVICE | rem sizes, page zoom allowed; no in-game text size; WebView `textZoom` / iOS Dynamic Type not wired (inferred: apps ignore OS large text). |
| Subtitles / captions | N/A | No voice; all sound synthesised. |
| One-handed play | DEVICE | Bottom bar in thumb zone; resources top; rail mid-right. |
| Reduced motion | PARTIAL | OS setting honoured widely; N-A; no in-game switch. |

### 4.12 Platform and store compliance

| Item | Status | Evidence / gap |
|---|---|---|
| iOS privacy nutrition label | PARTIAL | `docs/store/PRIVACY.md:58-68` drafted and consistent with code; not entered (owner). |
| iOS privacy manifest | FAIL (low impact) | No app-level `ios/App/App/PrivacyInfo.xcprivacy` (Capacitor ships its own; no `UserDefaults` in app Swift). |
| ATT | N/A | No IDFA, AdSupport or tracking SDK. |
| Sign in with Apple | PASS | iOS offers Apple and Game Center only (`platform/auth.ts:149`). |
| Restore purchases button | PASS (code) | `economyUi.ts:286-296`. |
| In-app account deletion | PASS (code) | `hud.ts:1137,1368,1396`; web `deletionUrl` empty (Play needs it). |
| Android target API | PASS | Target/compile 36, min 24 (`android/variables.gradle`). |
| 64-bit | PASS (inferred) | No native libraries; the CI check that lists `.so` files has never run. |
| Play Billing version | PASS (code) / OWNER | 9.1.0; the CI guard against < 8 has never run. |
| Play Data Safety | PARTIAL | Drafted (`PRIVACY.md:70-92`); depends on the empty deletion URL. |
| Age rating answers | PASS (draft) | `PRIVACY.md:94-120` honest and matches code. |
| Privacy policy / terms URLs live | **FAIL (owner)** | Pages return 200 but name no controller, contact or deletion URL; terms show a draft banner; `release:preflight` lists 22 open items, 6 blocking. |
| No placeholder / beta / test text | PARTIAL | Bundle id still `com.toadstoolkingdoms.app`; R-5; R-1's placeholder `https://your-server.example.com`. |
| Screenshots match the game | PARTIAL | PWA shots current but staged (showcase village); store screenshots never committed. |
| SDKs current and declared | PASS | Patch-level lag only (Capacitor 8.6.0 → 8.6.2, fastify 5.12.7 → 5.12.8); Phaser 3 deliberate; Play Age Signals 0.0.4 is beta. |
| Loot box / odds | PASS | Nothing random sold; daily chest odds shown. |
| COPPA / GDPR | PARTIAL / OWNER | Neutral age screen, adults-only statistics, no crash reports under 13; server default `UNDER13_MODE=limited` conflicts with a 13+ store audience (legal decision). |
| Licences documented | PARTIAL | npm deps and fonts listed; R-6. |

### 4.13 Build and release pipeline

| Item | Status | Evidence / gap |
|---|---|---|
| Release build tested end to end | **FAIL** | No signed AAB, no TestFlight run, no deployed server, offline-only web build. |
| Reproducible from clean checkout | PASS (mostly) | Lockfile v3, `npm ci` everywhere, `.node-version`, Docker base pinned by digest; output not byte-identical (build time stamps); `engines` allows Node 20.19+ while CI uses 24. |
| Version and build numbers | PARTIAL | Build numbers from run number; marketing version never bumped (R-2). |
| Debug / cheats / logging gated | PASS (caveat) | Sandbox and mock store only with `?sandbox`/`?debug` (separate save, never online); `window.tk` only with `?debug`; no `console.log` in the bundle. Caveat: R-1. |
| Staging vs production | PASS (code) / OWNER | `DEPLOY_ENV`, `server_meta` guard, production refuses unsafe config; neither exists yet. |
| Remote config / kill switches | PARTIAL | `SERVER_NOTICE`, `MIN_CLIENT_BUILD`, `RETIRED_RULES`, signed balance bundles, compliance switches, all via redeploy; no purchase kill switch; the offline web build has none. |
| Feature flags | PARTIAL | `withPreview` features and env policies; no live flag service. |
| Rollback plan | PARTIAL | Server/store rollback documented in `RELEASE.md`; R-3 (web); R-4 (image rebuilt on promotion). |
| Hotfix rehearsed | **FAIL** | No `v*` tags, no rehearsal; main CI red on three recent days. |
| Signing key backup | OWNER | No keys exist yet. |

### 4.14 Analytics and observability

| Item | Status | Evidence / gap |
|---|---|---|
| Funnel events | PARTIAL | `session_start`, `tutorial_step`, `raid_end`, `purchase`, D1/D7 server-derived; skip = complete and missing purchase paths (E-3). |
| Level fail / quit rates | **FAIL** | `raid_end` keeps only `{kind, stars, destruction}`; `endReason` and Trial tier dropped by the allowlist; abandoned battles log nothing. Add `endReason`, `tier` and an abandon event. |
| Crash / ANR dashboards | PARTIAL / OWNER | Opt-in client Sentry; no native ANR capture; one Grafana board (`ops/grafana/game-versions.json`). |
| Alerts | PARTIAL | 13 server alerts (5xx, latency, event loop, Redis, DB pool, refunds, desyncs…), **0 runbook annotations**, no Alertmanager routing, no client crash-spike alert. |
| Events fire in release build | DEVICE | Not gated on DEV; no production-bundle test. |
| Consent-gated analytics | PASS | Adults only, explicit yes, random id, "no" deletes (`analytics/share.ts:109-115`). |

### 4.15 Real-world testing

| Item | Status | Evidence / gap |
|---|---|---|
| 10–20 real devices | DEVICE | Plan only (`docs/store/OWNER_CHECKLIST.md` §5, `TESTING.md`). |
| Closed beta with strangers | OWNER | Plan for Play's 12 testers × 14 days; no build exists to distribute. |
| Silent first-time observation | **FAIL** | No plan or record. |
| Soft launch in a small market | **FAIL** | Only staged-percentage rollout in `RELEASE.md`; no market-limited plan with kill criteria. |
| Bad Wi-Fi / sunlight / one hand | DEVICE | One line in `TESTING.md`. |
| Fresh install / update / downgrade | PARTIAL (code) | Newer-save stop, complete service-worker install before activate, stale-chunk update offer; web downgrade unplanned (R-3). |

### 4.16 Launch-day readiness

| Item | Status | Evidence / gap |
|---|---|---|
| Support email / channel | **FAIL (owner)** | `supportEmail` empty; live support page says "not published yet". |
| Social / community channels | **FAIL** | None anywhere. |
| Known-issues list | **FAIL** | None. |
| Day-0 patch ready | PARTIAL | `MIN_CLIENT_BUILD` and store links exist (URLs unset); blocked by R-2. |
| Store listing incl. keywords | PARTIAL | `LISTING.md` checked against code; keyword choices flagged for the owner; 49 machine-translated listings unreviewed; URL placeholders. |
| Review-prompt logic | **PASS** | Only after a win (stars > 0), after the tutorial, ≥ 5 wins, ≥ 120 days apart, ≤ 3 times, from a real raid's "Return home" only (`ui/reviewPrompt.ts:34-39`, `battleHud.ts:885-888`). |
| Servers pre-scaled | OWNER | No host; ~3 battles/s per instance never measured on one. |
| On-call 72 h | **FAIL** | No rota, pager or runbooks. |

### 4.17 Game theory

**17a Dominant and degenerate strategies**

- *Dominant army:* **PARTIAL/FAIL.** The default raid mix is best at Keeps 7, 12 and 15 (74 / 67 / 84 %; next best at Keep 15 is 69), admitted by `it.todo('one army is best on all four temper profiles at Keep 12')` (`kits-tiers.test.ts:67`). The best opener is not the best closer (shadow and siege lead at Keep 4; siege is last at 15), which is healthy.
- *Dominated content:* **FAIL.** Air is weakest or near-weakest at Keeps 6–15 and the dearest to refill (7.9 M Provisions vs 4.0 M at Keep 15). 20 warriors' kits are worth < +2 destruction points (`KIT_KNOWN_BELOW`); 12 of 40 newer-vs-older pairs in a role score below the older warrior at Keep 15 (`TIER_KNOWN_BELOW`), so upgrading tiers is a sunk-cost trap.
- *Degenerate:* **FAIL** for "never build defense" (D-1). **PASS** for sandbagging (gated), safe-loop farming (Trials once per tier, drill once a day, rematch once per raid). Idle play is viable (17f).
- *Meaningful choices:* **PASS.** Entry point and army are real levers (destruction range across entry points 28–44 points).
- *Self-play / solved line:* **PARTIAL.** Bot plan ~80–82 %, best point/order 100 % on mid bases (prior measurement); deterministic and fully informed, hence G-1.

**17b Balance and counters**

- *Win-rate matrix:* PARTIAL (army lab, 4 seeds × layouts, per-family floor 30 % with listed exceptions). Tempering creates real counters at Keep 15 (Eclipse 90 → 56 under Blast; kites 89 → 41 under Watch); Keep 12 still has one best army.
- *Pick rate vs win rate:* **FAIL (missing).** Attack rows hold the army and result server-side; nothing aggregates them.
- *Every skill tier:* PARTIAL. Explorer and casual policies miss the 0.9-star target (admitted in `campaign-gates.test.ts:86-96`).
- *Power creep vs sales:* N/A (no paid warriors; the hero is never sold).
- *First-player advantage:* N/A (asynchronous).

**17c Equilibria and the metagame**

- *Information asymmetry:* PARTIAL. Traps are hidden only in the scout UI; the full base is in the match payload (G-1).
- *Commitment:* PASS. Declared stakes fixed before the seed (×1.3 / ×1.75).
- *Metagame speed / patch cadence:* PARTIAL. Economy patches by signed bundle; combat needs `SIM_RULES` + app release + server deploy; no telemetry loop to drive them.

**17d Multiplayer incentives**

- Free riders: PARTIAL (D-5). Kingmaking: N/A. Griefing: PASS (shields, exposure ordering, no target choice).
- Collusion / win-trading: PASS with limits. Honor fed to one defender capped at 40 per attacker per day; Jade not transferable; defense hold rewards paid only for simulated raids. Referral Sybil about 100 Jade a month for a modded client (low).
- Snowballing / comeback: PASS (losing-streak slack, exhaustion, shields 16/20/24 h, rematch, gentle new-player raids). Quit incentives: PASS (unreported or warrior-less raids are losses).

**17e Matchmaking and ranking**

- Rating: PASS (Elo-style with a deviation-scaled K, convergence-tested; `sim/rating.ts`). Cold start: generated bases labelled `bot`.
- Leaderboard incentives: PARTIAL. Honor never decreases on a lost defense (`defenseHonorLossShare: 0`); Power is mostly Keep (D-4). Smurfing / 3 AM queues: generated rivals fill gaps and are labelled; not measured with a real population.

**17f Economy as strategy** (scratch `rpm.ts`/`net.ts` on the real data)

| Keep | Collectors at cap | Raid loot banked | Full refill | Training | Raid net per training hour |
|---|---|---|---|---|---|
| 10 | 299 k/h | 701 k | 267 k | 4.1 h | ≈ 106 k/h (~35 % of collectors) |
| 15 | 3.56 M/h | 5.12 M | 4.0 M | 6.6 h | ≈ 170 k/h (**~5 %** of collectors) |

Late raiding barely matters economically and casual players lose about what they loot (D-2). Arbitrage loops: closed (top-up fixes XPL-04/09 verified, catch-up bounded). Pay-to-win: **PASS**, Jade buys time and top-ups only, but Keep rushing is unrestricted (E06). Variable rewards: free daily chest with odds; the loss-triggered offer is retired. **Jade lifetime supply/sink is not modelled** (4.3).

**17g Risk, reward, randomness and skill** (scratch `luck.ts`, 12 seeds per plan)

| Keep | Destruction SD from the seed alone | Star result differs from the usual | SD across entry points | Range across entry points |
|---|---|---|---|---|
| 6 | 2.6 | 10 % | 9.4 | 28 |
| 10 | 6.4 | 15 % | 12.4 | 36 |
| 15 | 7.8 | 17 % | 16.0 | 44 |

Skill dominates, but at Keep 15 seed noise is about half the skill spread, so a declared 3★ stake (miss pays nothing) is partly a lottery: shrink `deploySpread` or show the variance on the stake screen. Pity timers: N/A. Risk vs reward: PASS (stakes, upward loot penalty). Loss aversion: high for casual players (D-2). Flow: the Keep 15 cliff (4.8).

**17h Methods**

Present: army lab, nine single-seed campaign policies, kit and counter checks, rating convergence, `tests/slow.ts` gates. Missing: multi-seed campaigns with confidence intervals, an adversarial/searching attacker in CI (best-point searches exist only in audit scripts), online defense-loss measurement, telemetry against the model, any human or min-maxer playtest, a red-team session against the live server.

## 5. Recommended order of work

Code (each is small unless noted):

1. **Money and input safety:** E-1 (Buy guard + server intent rule), I-1, I-2, I-4, E-2.
2. **Integrity:** S-1 (`REQUIRE_SERVER_VILLAGE`), R-1 (remove the server field from store builds), S-2 (label allowlist), G-1 (late-report rule and detection; medium).
3. **See crashes:** O-1 (source maps), O-2 (Android renderer), session envelopes or reliance on store consoles; add `endReason`/tier/abandon to statistics (E-3).
4. **Release machinery:** R-2 (version bump guard), R-3 (web rollback doc), R-4, runbook annotations on alerts.
5. **Polish and accessibility:** N-A (shake/flash setting), A-1–A-4, I-3 (PWA back), I-5, S-3, S-4, N-B, D-3.
6. **Balance (game-theory session):** D-1, D-2, Air and the regressing tiers, Keep 15 cliff gate, multi-seed campaigns, a Jade lifetime model, D-4–D-6.

Owner and device work (cannot be done in code): fill `public/legal-config.js` and choose the bundle id; produce the first signed AAB and TestFlight build; deploy staging and run `server:load` at 10× expected traffic; run the 10–20 device matrix (including a 2 GB Android) for cold/warm start × 50, 2-hour memory, 20-minute thermal, interruptions, battery; Sentry DSN and alert routing; support email, community channel, known-issues list, on-call rota; a silent first-time playtest; a soft-launch market plan with kill criteria (D1, crash-free rate) read from the store consoles; native review of the machine translations.
