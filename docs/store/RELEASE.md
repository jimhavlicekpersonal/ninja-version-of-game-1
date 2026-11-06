# Submission and staged rollout (step 53, checklist)

## Before submitting

- [ ] Server: production deployed by hand from the release workflow (`docs/SHIPPING.md` 3g), `/readyz` green, alerts on (`ops/prometheus/alerts.yml`), a backup made and the last Sunday drill passed (`.github/workflows/backup.yml`).
- [ ] The server is built from the same commit as the game (same `SIM_RULES` in `src/gameplay/sim/battle/battle.ts`); the release workflow's contract tests passed on staging.
- [ ] Products approved in both stores with the store ids (`docs/SHIPPING.md` 3b); App Store Server Notifications and Play RTDN point at production.
- [ ] Listing texts, screenshots, privacy URL, support URL, privacy label / Data safety, age rating, review notes (this folder).
- [ ] Tag the release `v<version>` (the release workflow tests the next server against this client).
- [ ] The "Test, build and deploy" run is green, including its `server` job: the built server on a freshly migrated Postgres passed the protocol contract (audit GLOBAL-016).
- [ ] **Android:** the `aab` job of the Android workflow ran (not skipped for missing secrets) and its log shows: Play Billing 8 or later in the release dependency graph (9.1.0 today), `jar verified` with the upload certificate Play Console expects, a `versionCode` above the last upload, and "No native libraries" (otherwise confirm 16 KB support in Play Console's App bundle explorer). Play Console shows no Billing Library deprecation warning for the upload. `targetSdkVersion` meets Play's current target-API rule (36 in `android/variables.gradle`; recheck the rule each year, never lower `minSdkVersion` 24 without evidence).
- [ ] **iPhone:** the TestFlight run's "Use the newest installed Xcode" step shows an iOS SDK App Store Connect currently accepts (no SDK warning). Sign in with Apple, Game Center, push and StoreKit capabilities enabled for the App ID.
- [ ] Both apps were built with `VITE_PUBLIC_URL` and `VITE_GOOGLE_CLIENT_ID` set (friend links open the web game; Android Sign in with Google), and the server's `GOOGLE_CLIENT_IDS` lists that client id.
- [ ] The device checks in `TESTING.md` ("Native checks before production") passed on real phones with the store-installed build.

## Rollout

- **App Store:** choose "Phased release for automatic updates" (1%, 2%, 5%, 10%, 20%, 50%, 100% over 7 days). New downloads get the version at once; the phase only paces updates.
- **Google Play:** staged rollout 5% → 20% → 50% → 100%, a day or more each.

## Watch during the rollout

The stores' own crash tools come first (report section 5 step 5, growth 2): they see every install, need no in-game consent (the platform asks for it) and catch native crashes, out-of-memory kills and freezes, which Sentry in the WebView cannot. Sentry only sees players who switched crash reports on.

| Where | What to read | Halt the rollout when |
|---|---|---|
| **Play Console → Quality → Android vitals** (Crashes and ANRs, filter by the new version code) | user-perceived crash rate, user-perceived ANR rate, the top clusters by device model and Android version; **Low memory killer** and excessive wakeups for cheap phones | crash rate above **1.09%** or ANR rate above **0.47%** (Play's bad-behaviour thresholds, overall and per phone model: above them Play lowers the game's visibility) or a new top cluster |
| **Xcode → Window → Organizer → Crashes / Hangs / Terminations** (and App Store Connect → TestFlight / App Analytics → Crashes) | crashes by build and device, hang rate, memory terminations (jetsam: the cheap-phone signal on iPhone) | a new top crash, or terminations clearly above the previous build |
| **Play Console → Pre-launch report** (each release track upload) | crashes and accessibility on Google's test devices | any crash before rollout |
| Sentry (opt-in players) | error messages and stacks from the game's own code | a new error with many users |

Also:

- Crash-free sessions (Sentry, the stores' vitals), `HighErrorRate`, `SlowResponses`, `EventLoopBlocked`, `DesyncsRising`, `RefundSpike`.
- Shared play statistics (`GET /admin/v1/stats`, staff token; only adults who chose to share): D1 and the tutorial rate of the release days against the week before. A drop beside a rollout is a release problem until shown otherwise.
- Desyncs by client build (`tk_desyncs_total`, `tk_client_requests_total`): a rise right after the release means the build and server disagree on rules.
- Store reviews and support mail for purchase problems.

## If something is wrong

- Pause: App Store Connect → Phased release → Pause (up to 30 days); Play Console → Halt rollout.
- Tell players: set `SERVER_NOTICE` on the server (shown in Settings → Online play) and redeploy.
- Server problems: redeploy the previous image by hand (the release workflow with that commit). Never roll the database back by hand: restore a backup into a new database (`tools/ops/restore.mjs`) and switch to it only after `restore-check`.
