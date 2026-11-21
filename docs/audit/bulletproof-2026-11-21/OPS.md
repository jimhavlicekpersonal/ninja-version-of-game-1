# OPS lane: platform/store compliance, release pipeline, observability, testing plan, launch day, live ops

Audited commit `560ce7a` (HEAD of `claude/dreamy-gauss-r3quc0`, equal to `origin/main`), 2026-11-21. Read-only audit: no repository file was changed.

How this was verified: files read at the line numbers given; `node tools/release/check-store-ready.mjs` run locally (22 items open, 6 blocking); the live GitHub Pages site fetched with `curl`; the latest CI runs read with `gh run list/view`. Things inferred rather than seen are marked "(inferred)". Owner, store-console and device evidence cannot come from this container. None of it is claimed.

CI state observed: on `main` at `560ce7a`, "Test, build and deploy", "Server release" and "Android app" are all green. But the Android `aab` job skipped 16 steps because no upload key is set (run 44852452737), and the server `production` job was skipped. **No signed store build and no production deploy has ever run.**

---

## 1. Verdict table

| Item | Verdict | One-line evidence |
|---|---|---|
| O-1 Production source maps, private upload to Sentry | **FAIL** | `vite.config.ts:160-172` has no `build.sourcemap`, so Vite's default is no maps. Live `assets/index-BXdR6JcV.js.map` returns 404 and the bundle has no `sourceMappingURL`. No sentry-cli or upload step in any workflow. Stacks arrive as minified `index-*.js:1:NNNNN`. |
| O-1 Release tagged in envelopes | **PARTIAL** | Client `release: kagemura@${__APP_VERSION__}` (`src/main.ts:237`) is always `kagemura@0.1.0` because `package.json:4` never changes. `environment` is the platform (`main.ts:238`), not staging or production. The server is tagged with the commit SHA (`Dockerfile:36-37`, `server.yml:108`), which is sound. |
| O-2 Android WebView renderer crash (`onRenderProcessGone`) | **FAIL** | `MainActivity.java` registers no `WebViewListener`. Capacitor's `BridgeWebViewClient.java:92-104` returns `false` unless a listener handles it, so Android kills the whole app process (a crash in Android vitals). Nothing is reported. iOS reloads (`WebViewDelegationHandler.swift:164-168`) but also reports nothing. |
| Session tracking / crash-free-session rate | **PARTIAL** | `sentryEnvelope.ts:102-118` builds only `event` items, with no `session` items. `RELEASE.md:34` claims "Crash-free sessions (Sentry, …)", which Sentry cannot show. The store consoles are documented as primary (`RELEASE.md:20-29`). The web/PWA has no crash-free source at all. |
| E-3 endReason / Trial tier / quit in statistics | **FAIL** | Shared `STATS_EVENTS.raid_end` = `{kind, stars, destruction}` only (`src/backend/net/stats.ts:25`). The local log has `endReason` (`controller.ts:185`), but `cleanStatsEvent` strips it. `trial_end` (`village.ts:227,2331`) is never logged, not even locally. Quitting (`endReason:'surrender'`) is invisible to the server. |
| R-2 Version bump guard (build/version, PROTOCOL_VERSION, SIM_RULES) | **FAIL** | No guard exists. `package.json` `"version": "0.1.0"` is unchanged through save v24, SIM_RULES 8 and protocol 11. This leaves `MIN_CLIENT_BUILD` unable to tell builds apart (`versionCheck.ts:23`, `compareBuilds` `dataVersion.ts:84`). What's new is keyed to the version (`newsUi.ts:90-95`). There are 0 git tags (`git tag` is empty), so `previous-client-contract.mjs:19-22` always skips. versionCode and CFBundleVersion do increase (run number). |
| R-3 Web and server rollback doc | **FAIL** (web) / **PARTIAL** (server) | No web rollback anywhere (grep of docs). Server: `RELEASE.md:43` says "redeploy the previous image by hand (the release workflow with that commit)". But `server.yml` has no input for an existing image tag: it always rebuilds and re-runs the whole test job, and a commit can only be picked by branch or tag (and no tags exist). |
| R-4 Runbook annotations on alerts | **FAIL** | `ops/prometheus/alerts.yml` has 13 alerts, 0 `runbook_url`, no owner or team labels and no Alertmanager routing. There is no runbook document (grep "runbook" in `docs/`, `ops/`). |
| iOS privacy nutrition label (documented) | PASS (docs) / OWNER (submit) | `docs/store/PRIVACY.md:58-68` |
| iOS `PrivacyInfo.xcprivacy` (app level) | **FAIL** | `find ios -name '*.xcprivacy'` finds nothing. Only Capacitor core ships its own. `OWNER_CHECKLIST.md` §3 lists it as an Xcode step. |
| ATT not needed | PASS | No tracking, no `NSUserTrackingUsageDescription` in `ios/App/App/Info.plist`. `REVIEW_NOTES.md` states no ATT. |
| Sign in with Apple when other logins exist | PASS (code) / NEEDS-DEVICE | Only Apple and Game Center on iPhone (`REVIEW_NOTES.md`). Entitlement in `App.entitlements`. Never compiled or run here. |
| Restore Purchases button | PASS (code) / NEEDS-DEVICE | `src/presentation/ui/economyUi.ts:289-292` |
| In-app account deletion | PASS (code) / NEEDS-DEVICE | `src/presentation/ui/hud.ts:1368-1396` (`conn.deleteAccount()`) |
| Android targetSdk | PASS | `android/variables.gradle` `targetSdkVersion = 36` |
| 64-bit / 16 KB page size | PASS (CI check) / NEEDS-DEVICE | No native code of our own. `android.yml:184-195` lists any `.so` in the AAB. It has never run (aab job skipped). |
| Data Safety draft | PASS (docs) / OWNER (submit) | `docs/store/PRIVACY.md:70-92` |
| Play Billing library (GLOBAL-001) | PASS (code) / OWNER + NEEDS-DEVICE | `variables.gradle` `playBillingVersion = '9.1.0'`. CI fails below 8 (`android.yml:160-171`), but that step never ran. |
| Age signals | PARTIAL / NEEDS-DEVICE | `age-signals` 0.0.4 beta (`variables.gradle`), `TkAgePlugin.java`. Not compiled or run here. |
| Age-rating questionnaires | OWNER | Prepared answers in `PRIVACY.md:94-120`. Not submitted. |
| Privacy policy and terms URLs live | **FAIL → OWNER** (GLOBAL-015) | Live pages return 200 (`/privacy.html`, `/terms.html`, `/support.html`, `/licenses.html`, `/community.html`). Live `legal-config.js` has `operator:''`, `supportEmail:''` and `termsEffective:''`, so the pages say "not published yet" and the terms show a draft banner. |
| No placeholder/beta/test text in build or metadata | PARTIAL | App name "Kagemura" in `strings.xml`, `Info.plist` and the manifest. But the legacy `package_name`/`custom_url_scheme` `com.toadstoolkingdoms.app` remain (`strings.xml`). Store screenshots are made in the sandbox, which shows a sandbox note and "(test)" prices (`LISTING.md:107`). |
| Screenshots match the game | OWNER / NEEDS-DEVICE | Only the 2 PWA screenshots exist (`public/screenshots/`). No store screenshot set is committed. The tool exists (`npm run store:screenshots`). |
| Third-party licences | PASS | `public/licenses.html` (generated by `tools/release/licenses.mjs`, tested by `tests/backend/licenses.test.ts`). It includes `@capacitor-community/in-app-review` and `unicode-segmenter`. |
| Loot-box / odds disclosure | PASS (code) | Only the free daily chest is random, with odds shown (`dailyUi.ts`). Nothing random is sold (`REVIEW_NOTES.md`, CLAUDE.md invariant). |
| COPPA / GDPR (under-13, consent) | PARTIAL (code) / OWNER + LEGAL | Age bands, `UNDER13_MODE` (default `limited`), crash reports never for under-13 (`crashReports.ts:27-29`), statistics adults-only opt-in (`stats.ts:8`). The legal position is the owner's (GLOBAL-006 markets). |
| Trademark "Kagemura"; entity and tax | OWNER | `OWNER_CHECKLIST.md` §1 |
| Release build tested end-to-end | **FAIL → OWNER** | The aab job never ran (16 skipped steps, run 44852452737). The TestFlight workflow "has never run" (`ios-testflight.yml:13`). |
| Reproducible builds from a clean checkout | PASS | `package-lock.json` + `npm ci`, `.node-version` 24.22.3, actions pinned by SHA, Docker base pinned by digest (`Dockerfile:10`), Gradle wrapper 8.14.3 (no `distributionSha256Sum`: low). |
| versionCode / CFBundleVersion increments | PASS | `android.yml:150-159` (run number + offset), `release.gradle:27-32`, `ios-testflight.yml:88` (`CURRENT_PROJECT_VERSION=run_number`). The marketing version does not increase (see R-2). |
| Debug menus, cheats, logging gated | PASS | `isSandbox` = `?sandbox`/`?debug` (`select.ts:13-16`). `window.tk` only with `?debug` (`main.ts:735-737`). The sandbox never goes online, has no DSN and keeps a separate save (`main.ts:231-288`). Native WebViews load without a query string and no deep link reaches the WebView URL (custom-scheme and App Links filters are absent or commented out in `AndroidManifest.xml`, `Info.plist`) (inferred unreachable). `webContentsDebuggingEnabled` defaults to debug builds only (Capacitor `CapConfig.java:286`). `CAPACITOR_DEBUG` is only in `ios/debug.xcconfig`. |
| Staging vs production separated | PARTIAL | Server: `DEPLOY_ENV` + `server_meta` lock + separate GitHub environments (`SHIPPING.md:211-218`, `server.yml:115,152`). Client: `android.yml` and `ios-testflight.yml` declare no `environment:` (only `backup.yml`, `deploy.yml` and `server.yml` do), so a TestFlight or internal build cannot use the staging `VITE_SERVER_URL` that `TESTING.md:7` and `SHIPPING.md:218` describe. |
| Remote config / kill switches / flags | PARTIAL | Present: `SERVER_NOTICE`, `MIN_CLIENT_BUILD` (inert, see R-2), `RETIRED_RULES`, signed balance bundles (numbers only, `balanceBundle.ts:1-20`), `EVENT_SCHEDULE_FILE`, compliance switches. Absent: any way to stop selling one product or to switch off chat, referrals or shared replays without a deploy of code (grep of `server/config.ts` env names). There is no ad SDK to disable. |
| Rollback plan | FAIL (web) / PARTIAL (server) | See R-3 |
| Hotfix rehearsal | **FAIL** (docs) / OWNER | No hotfix procedure or rehearsal record in `docs/`. |
| Signing key backup | OWNER | `SHIPPING.md:20-23` ("keep the file and passwords safe") |
| Funnel events (install, tutorial, first battle, first purchase, D1/D7) | PASS (code) / PARTIAL (sample) | `stats.ts:22-32`, `server/core/statsLocal.ts:18-55,125-157` (D1/D7/D30, tutorial steps, first raid and first purchase within 7 days), `/admin/stats`. Only adults who opted in, so it is a biased sample. |
| Per-level fail/quit | **FAIL** | See E-3 |
| Economy telemetry | PARTIAL | Shared: `upgrade_start`, `research_start`, `skip_used`, `purchase`, `offer_shown`. Local only: `collect`, `reward`, `moonstone_spend`, `donation`. |
| Performance telemetry | **FAIL** | No boot time, FPS, memory warning, renderer or quality-profile field in `STATS_EVENTS` (`stats.ts:22-32`) |
| Error telemetry | PARTIAL | Sentry opt-in (`prefs.ts:10` `crashReports:false`, `crashReports.ts:46-58`), but unreadable without source maps. Live web build has no DSN (bundle contains no Sentry host). |
| Consent-gated analytics | PASS | `stats.ts:1-14`, `analytics/share.ts` (adults only, off until yes, random id, delete on no) |
| Events verified in a release build | NEEDS-DEVICE / OWNER | Never done (no release build exists) |
| Event schema versioned | PARTIAL | `StatsBatch.build` exists (`stats.ts:44-45`), but it is always `0.1.0+<platform>` (`main.ts:288`). No schema field. |
| Dashboards and alerts with owners | PARTIAL | `/admin/stats` page, `ops/grafana/game-versions.json`, 13 alerts, but no owners, routing or runbooks |
| Targets and baselines defined in advance | PARTIAL | Crash 1.09% and ANR 0.47% halt rules (`RELEASE.md:24-27`). D1/D7/tutorial KPIs and kill criteria exist only as audit recommendations (`docs/audit/areas/09-retention-and-marketing.md:129-131`), not an adopted plan. |
| Device matrix documented | PARTIAL | Device classes listed (`OWNER_CHECKLIST.md` §5, `TESTING.md` "Native checks"), but no fixed matrix, protocol (repeat counts, durations) or results template |
| Closed beta plan | PASS (docs) / OWNER | `docs/store/TESTING.md` (TestFlight, Play 12 testers × 14 days) |
| Silent playtest | OWNER | Not documented as a protocol. Only "real-player playtests" (`OWNER_CHECKLIST.md` §5). |
| Soft-launch plan with kill criteria | **FAIL** (docs) / OWNER | Only in audit text (areas/09:129-131, `STATE_OF_THE_GAME.md:320-322`) |
| Support channel, known-issues list, on-call | OWNER / FAIL (docs) | `support.html` exists but `supportEmail` is empty. No known-issues page or template. No runbook. |
| Day-0 patch readiness | PARTIAL | `MIN_CLIENT_BUILD` and the "Update Kagemura" path exist but are inert (R-2). There are expedited-review notes nowhere. |
| Review prompt logic (after a win, never after loss) | PASS (code) / NEEDS-DEVICE | `reviewPrompt.ts:34-39` (win, tutorial done, ≥5 wins, 120-day gap, ≤3 asks). Called only on "Return home" after a real raid (`battleHud.ts:886-887`). Plugin `@capacitor-community/in-app-review` 8 (`package.json`, `native.ts:50-54`). The header comment at `reviewPrompt.ts:6` ("No native review plugin is installed") is stale. There is no check against a purchase problem or crash in the same session (low). |
| Server pre-scaling | OWNER | `server/load.ts`, `SHIPPING.md` 3h "Load test" (about 3 battles/s per instance) |
| Event safety tests with time travel | PASS | `tests/gameplay/sim/events-loop.test.ts:24-172` (365-day loop, per-occurrence payouts), `clocks.test.ts`, `return-hooks.test.ts` (local midnight, missed days) |
| Patch notes | PASS | `docs/store/RELEASE_NOTES.md` = in-game What's new (`tests/presentation/ui/whats-new.test.ts:12-17`). Keyed to a version that never changes (R-2). |
| Sunset plan | **FAIL** (docs) | `terms.html` only says "We can change or end the game or online play". No operational plan (notice period, unused-Jade handling, offline mode). |

---

## 2. Work items (CODE / DOCS), ordered by severity

### OPS-01 — Version identity is frozen at 0.1.0; add a version-bump guard and per-build release ids (earlier R-2)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: integration (with ops (.github/android/ios) and backend/analytics)
- Checklist refs: Checklist §3 item "Set every production secret … MIN_CLIENT_BUILD"; §17 "Release tag and a green run"; Masterclass: Build hygiene / release management
- Evidence:
  - `package.json:4` `"version": "0.1.0"`. The visible history (shallow clone) has never changed it, through save v24 (`SHIPPING.md:301`), `SIM_RULES = 8` (`src/gameplay/sim/battle/battle.ts:55`) and `PROTOCOL_VERSION = 11` (`src/backend/net/protocol.ts:42`).
  - Everything keyed to the version is therefore inert or conflated:
    - (a) `MIN_CLIENT_BUILD`: `versionCheck.ts:23` and `registry.ts:103-104` compare `compareBuilds(build, min)`. Every build reports `0.1.0+<platform>` (`main.ts:288`), so `SHIPPING.md:230,301`'s "set `MIN_CLIENT_BUILD` to the first build of this release" cannot separate old from new builds. Any value above 0.1.0 locks out every build.
    - (b) What's new: `newsUi.ts:90-95` stores `tk.whatsNewSeen = '0.1.0'`, so a later release's notes never show to returning players.
    - (c) The Sentry release `kagemura@0.1.0` (`main.ts:237`) and stats `build` (`stats.ts:44-45`) cannot tell releases apart.
    - (d) `tk_client_requests_total` by build (`observability.ts:43`) is one series.
  - `git tag` is empty, so `previous-client-contract.mjs:19-22` prints "No earlier release tag" and the backward-compatibility contract (step 77) has never run.
  - No test or CI step compares the version with the last release (grep of `tests/`, `tools/release/`).
- Fix:
  1. Add `tools/release/last-release.json`, written at each store release: `{ "version": "0.1.0", "save": <SAVE_VERSION>, "rules": <SIM_RULES>, "protocol": <PROTOCOL_VERSION>, "migrations": <highest migration number> }`.
  2. Add `tools/release/check-version.mjs` (plain Node, cross-platform). It fails when `SAVE_VERSION`, `SIM_RULES`, `PROTOCOL_VERSION` or the newest migration differ from `last-release.json` while `package.json` `version` is not semver-greater than `last-release.version`. It also fails if the tag `v<version>` already exists on a different commit.
  3. Run it in `deploy.yml` (build job, after `npm ci`), in the `aab` job and in `ios-testflight.yml` before the build. Add the same rule as a vitest case so `npm test` catches it locally.
  4. Make the client build id unique per build. Define `__BUILD_ID__` = `${version}+${GITHUB_SHA.slice(0,12) || 'local'}` in `vite.config.ts`. Send it as the Sentry `release` (`kagemura@<version>+<sha>`) and add a `dist` of the platform. Keep the protocol `build` header as `<version>+<platform>`: `compareBuilds` strips everything after `+`, so `MIN_CLIENT_BUILD` keeps working on the semver part.
  5. Bump `package.json` to `0.2.0` (or the first store version), update `WHATS_NEW`, `RELEASE_NOTES.md` and `MARKETING_VERSION` (`project.pbxproj:432,455`), and record `last-release.json`.
  6. Document in `docs/store/RELEASE.md` "Before submitting": bump the version, tag `v<version>`, update `last-release.json` after the stores accept the build.
- Tests: `tests/backend/release-config.test.ts`: (a) "a SAVE_VERSION/SIM_RULES/PROTOCOL_VERSION/migration change since last-release.json requires a greater package version", written first against the current tree with a fixture `last-release.json` whose `save` is 23 (it must fail). (b) "WHATS_NEW.version equals package.json version" (exists, keep). (c) "main.ts passes a release that contains the commit id".
- Done when: `node tools/release/check-version.mjs` fails on a branch that bumps `SAVE_VERSION` without bumping the version and passes after the bump. Two consecutive `main` builds report different Sentry `release` values. `MIN_CLIENT_BUILD=<new version>` answers `426` to a build of the previous version and not to the new one (contract test).
- Don't break: deploy the server before the game; npm scripts cross-platform (no bash in `package.json`); never send the statistics id with the player token; `compareBuilds` semantics for existing servers.

### OPS-02 — Hidden source maps, uploaded privately to Sentry, never shipped (earlier O-1)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: ops (.github/android/ios) and integration (`vite.config.ts`), backend/analytics (`sentryEnvelope.ts`)
- Checklist refs: Checklist §3 "Sentry"; §17 release gates; Masterclass: Observability / crash triage
- Evidence:
  - `vite.config.ts:160-172` `build` has no `sourcemap`, so Vite emits no maps.
  - Live check: `curl https://jimhavlicekpersonal.github.io/ninja-version-of-game-1/assets/index-BXdR6JcV.js.map` returns 404, and the bundle has no `sourceMappingURL`.
  - No workflow runs `sentry-cli` or any upload (`.github/workflows/*.yml` read in full).
  - `parseStack` (`sentryEnvelope.ts:55-67`) sends minified `filename:line:col` with no `abs_path`.
  - The service worker already skips `.map` files (`vite.config.ts:52`), which is good.
  - Result: every crash report from launch would be an unreadable `index-*.js:1:NNNNN`.
- Fix:
  1. `vite.config.ts`: `build.sourcemap: 'hidden'` (maps emitted, no `sourceMappingURL` comment).
  2. In `sentryEnvelope.ts` `parseStack`, also set `abs_path` to the scrubbed URL (Sentry's JS symbolication matches on it; (inferred) needs a staging test event to confirm).
  3. Add a workflow step after `npm run build` in `deploy.yml`, the `aab` job and `ios-testflight.yml`. When `secrets.SENTRY_AUTH_TOKEN` and `vars.SENTRY_ORG`/`SENTRY_PROJECT` are set, run `npx --yes @sentry/cli@<pinned exact version> sourcemaps upload --release "$RELEASE" --url-prefix '~/assets' dist/assets`, using the per-build release from OPS-01.
  4. Then always run `find dist -name '*.map' -delete` before `upload-pages-artifact` and before `npx cap sync`, so maps never reach Pages, the APK/AAB or the IPA.
  5. Add a CI assertion step: `! find dist -name '*.map' | grep -q .`.
  6. Document the owner secret in `SHIPPING.md` §3 next to `VITE_SENTRY_DSN`.
- Tests: `release-config.test.ts`: "vite build uses hidden source maps", "every workflow that uploads dist or runs cap sync deletes *.map first", "parseStack sets abs_path without a query string" (unit test in `tests/backend/analytics/`).
- Done when: a forced error in a staging build (crash reports switched on) shows original TypeScript file and line in Sentry. `curl <pages>/assets/<entry>.js.map` returns 404. `unzip -l app-release.aab | grep '\.map$'` is empty.
- Don't break: crash reports opt-in (`prefs.ts:10` default off, never under 13, never in the sandbox); no player data in envelopes (`scrubText`/`scrubUrl`); npm scripts cross-platform (keep the upload in the workflow, not `package.json`); the SW precache list must stay free of `.map`.

### OPS-03 — Android renderer process death kills the app and is never reported (earlier O-2)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: ops (.github/android/ios)
- Checklist refs: Checklist §5 cheap-phone runtime; §6 device testing; Masterclass: Stability / crash-free rate
- Evidence:
  - `android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java` overrides only `onCreate` and `onTrimMemory`, with no `WebViewListener`.
  - Capacitor 8 `BridgeWebViewClient.java:92-104` returns `false` from `onRenderProcessGone` unless a listener returns `true`. Android then terminates the app process: on a 2 GB phone a renderer OOM kill becomes an app crash counted in Play vitals against the 1.09% threshold (`RELEASE.md:24`). Nothing is recorded for the next start.
  - iOS: Capacitor resets and reloads (`node_modules/@capacitor/ios/.../WebViewDelegationHandler.swift:164-168`), so the player recovers, but there is no count.
  - R03 (≈121 MB raw pixels) makes this the likely cheap-phone failure.
- Fix:
  1. In `MainActivity.onCreate` after `super.onCreate`, `getBridge().addWebViewListener(new WebViewListener() { onRenderProcessGone(view, detail) { … } })`. Store `{at, didCrash: detail.didCrash(), priority: detail.rendererPriorityAtExit()}` in `SharedPreferences("tk_native")`, then call `recreate()` (the activity rebuilds the bridge and WebView) and return `true`.
  2. iOS: in `TkViewController`, override `webViewWebContentProcessDidTerminate` through the bridge's delegation handler (or a small `WKNavigationDelegate` wrapper), record a count in `UserDefaults`, and keep Capacitor's reload. If `UserDefaults` is used, declare reason `CA92.1` in the PrivacyInfo of OPS-10.
  3. Add a tiny `TkNative.lastRendererExit()` plugin method on both platforms that returns and clears the record.
  4. In `main.ts`, on start, if a record exists: `crashReporter.report(new Error('renderer process gone'), {kind:'renderer', didCrash})`, only if crash reports are allowed. Optionally add `renderer_gone: {didCrash:boolean}` to `STATS_EVENTS` (adults opted in only).
  5. Device check: `adb shell am crash` is not enough. Use `chrome://inducebrowsercrashforrealz` in the WebView, or kill the renderer pid on a debug build, and confirm the game restarts to the village.
- Tests: `tests/backend/release-config.test.ts`: "MainActivity registers a WebViewListener whose onRenderProcessGone returns true" (source check like the existing plugin-registration checks). A unit test for the `main.ts` reporter path with a fake plugin.
- Done when: on a real Android phone, killing the WebView renderer returns the player to the village within 5 s without an app crash entry in Play's pre-launch report or vitals. With crash reports on, the next start sends one `kind:renderer` report.
- Don't break: crash reports opt-in and never under 13 (`crashReportsAllowed`); `tkmemorywarning` handling (`MainActivity.onTrimMemory`); Capacitor plugin registration order (register before `super.onCreate`).

### OPS-04 — Native test builds cannot target the staging server; client environment is not staging/production
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: ops (.github/android/ios)
- Checklist refs: Checklist §3 "staging and production GitHub environments"; §17 "TestFlight internal + external, Play closed track"
- Evidence:
  - `TESTING.md:7` says "Build with the staging `VITE_SERVER_URL` (GitHub Environment `staging`)" and `SHIPPING.md:218` says "Build games against each with GitHub Environments".
  - But `grep -n "environment:" .github/workflows/*.yml` finds environments only in `backup.yml:31`, `deploy.yml:150` and `server.yml:115,152`. `android.yml` (both jobs) and `ios-testflight.yml` read repository-level `vars.VITE_SERVER_URL`, the same value the public web deploy uses (`deploy.yml:47`).
  - So testers' TestFlight and closed-track builds talk to whatever the web build uses. Production then accepts their sandbox purchases (`REVIEW_NOTES.md`: `APPLE_ENVIRONMENTS` includes Sandbox).
  - Client crash reports carry `environment: web|ios|android` (`main.ts:238`), so staging crashes mix with production. `TESTING.md:39` "(Sentry, staging environment)" is not true for the client.
- Fix:
  1. Add `workflow_dispatch` input `target: [staging, production]` (default `staging`) to `android.yml` and `ios-testflight.yml`, and `environment: ${{ inputs.target || 'production' }}` on the `aab` and `testflight` jobs. Read `VITE_SERVER_URL`, `VITE_SENTRY_DSN` and similar from that environment.
  2. Add `VITE_DEPLOY_ENV` (staging|production) to every build and pass it as the crash reporter `environment`, keeping the platform as a tag.
  3. Name the AAB artifact `…-<target>-<versionCode>` and require `target=production` for anything uploaded to the production track (document in `RELEASE.md`).
  4. Update `TESTING.md:7,39` and `SHIPPING.md:218` to the real mechanism.
- Tests: `release-config.test.ts`: "aab and testflight jobs declare an environment from a target input"; "main.ts crash reporter environment comes from VITE_DEPLOY_ENV".
- Done when: a TestFlight build made with `target=staging` shows "This is a staging server" in Settings, and its test crash appears under Sentry environment `staging`.
- Don't break: deploy the server before the game; the public web build keeps the production server; the `ALLOW_LEGACY_APP_ID` and preflight guards stay in front of signing.

### OPS-05 — One-command rollback for the web build and the server, with forward-only limits (earlier R-3)
- Severity: MEDIUM
- Status: FAIL (web) / PARTIAL (server)
- Kind: CODE + DOCS
- Compartment: ops (.github/android/ios), docs
- Checklist refs: Checklist §3 "Pager … weekly review"; §17 release gates; Masterclass: Release management / rollback
- Evidence:
  - No web rollback in `docs/` (grep "roll back|rollback|revert").
  - Pages artifacts come from `upload-pages-artifact` with the default retention (1 day, (inferred) from the action's default) (`deploy.yml:65-68`), so an old artifact cannot be redeployed. Re-running an old run rebuilds and re-tests (including `test:slow`) with today's repository variables.
  - Server: `RELEASE.md:43` "redeploy the previous image by hand (the release workflow with that commit)". But `server.yml` `production` needs `image`, which needs `test` (full suite with Postgres and Redis), and there is no input to deploy an existing `ghcr.io/...:<sha>` tag. `workflow_dispatch` can only pick a branch or tag, and there are no tags.
  - Forward-only state that a rollback can break is not written down anywhere as a rollback rule:
    - save versions (`SHIPPING.md:230`: a newer save stops an older build),
    - `SIM_RULES` (a server without the client's rules refuses its battles),
    - `VILLAGE_PARTS` ("switch it off before rolling back below it", `src/backend/CLAUDE.md`),
    - migrations compatible only with the previous build.
- Fix:
  1. `deploy.yml`: `retention-days: 30` on `upload-pages-artifact`.
  2. New `.github/workflows/rollback-web.yml` (`workflow_dispatch`, input `run_id`): download that run's `github-pages` artifact, read its `sw.js`/bundle `SAVE_VERSION` marker (emit a `version.json` with `{version, sha, save, rules}` in the build), refuse if `save` differs from the live `version.json`, then `actions/deploy-pages` and `check-published-game.mjs`.
  3. `server.yml`: `workflow_dispatch` input `image_tag` (optional). When set, skip `test`/`image` and deploy that tag to the chosen target via `tools/release/deploy.mjs`, refusing if the live server's `/v1/hello` `supportedRules` contains rules the target image lacks (call `check-server-rules.mjs` logic).
  4. `docs/store/RELEASE.md` "If something is wrong": the two commands. A table of what may roll back (same save version, same or superset rules, migrations of the previous build, `VILLAGE_PARTS` off first). When to prefer forward-fix plus `SERVER_NOTICE`. Halting store rollouts (exists).
  5. Owner: one rehearsal on staging (OWN-33).
- Tests: `release-config.test.ts`: "deploy.yml keeps the Pages artifact ≥ 14 days", "rollback-web.yml refuses a different save version" (unit-test the comparison script), "server.yml production can deploy an existing image tag without rebuilding".
- Done when: on staging, the previous web build is live again within 10 minutes of one `gh workflow run rollback-web.yml -f run_id=<id>`, and the previous server image within 10 minutes of `gh workflow run server.yml -f target=staging -f image_tag=<sha>`, both recorded in `RELEASE.md`.
- Don't break: deploy the server before the game; saves never go backwards (never offer a rollback across a `SAVE_VERSION` bump); migrations are never edited or reverted by hand (restore into a new database instead).

### OPS-06 — Statistics lack battle end reason, Trial tier and quits (earlier E-3)
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: backend/analytics (`src/backend/net/stats.ts`), with gameplay/control (`controller.ts`) via the integration session
- Checklist refs: Checklist §15 "Analytics: adults-only opt-in sample …"; §16 "Track tutorial drop-off"; Masterclass: Analytics / level funnels
- Evidence:
  - `stats.ts:25` `raid_end: { kind, stars, destruction }`.
  - `controller.ts:185` logs `endReason` locally, but `cleanStatsEvent` (`stats.ts:67-79`) keeps only allowlisted fields, so `endReason` (`'time'|'destroyed'|'no_troops'|'surrender'`, `battle/types.ts:84`) never reaches the server.
  - `trial_end` (`village.ts:227`, emitted at `:2331`) has no `analytics.log` call (grep `controller.ts`), so Shadow Trials leave no trace at all.
  - Quitting a battle is `endReason:'surrender'` and is invisible.
  - No schema version in `StatsBatch` (`stats.ts:41-54`).
  - The funnel (`statsLocal.ts:41-55`) therefore cannot give per-Keep or per-tier fail and quit rates.
- Fix:
  1. `STATS_EVENTS.raid_end` gets `endReason: 'id'`, `ticks: 'number'` and `keep: 'number'` (the attacker's Keep level, from state).
  2. Add `trial_end: { tier:'number', cleared:'boolean', stars:'number', destruction:'number', endReason:'id' }` and log it in `controller.ts` beside `raid_end`.
  3. Add `scout_leave: { kind:'id', keep:'number' }` for leaving a scouted opponent without deploying (the pre-battle quit), logged where the HUD's Next/Home leaves a scout.
  4. Add `StatsBatch.schema = 2` (the server accepts a missing value as 1).
  5. `statsLocal.ts`: per-tier clear rate and surrender rate in `statsFunnel`, shown on `/admin/stats`.
  6. Update the `PRIVACY.md` statistics row (event list) and `public/privacy.html` if it lists events.
  7. Deploy the server first. Older servers drop unknown events (`cleanStatsEvent` returns null), which is safe.
- Tests: `tests/backend/net/stats.test.ts`: "raid_end keeps endReason", "trial_end keeps tier/cleared and drops any other field", "no new field can hold free text" (all `id` fields match `^[a-z0-9_:.-]{1,40}$`). Controller test: a Trial clear logs `trial_end`.
- Done when: `/admin/v1/stats/funnel` reports, per Trial tier, the clear rate and, per Keep, the surrender share for a seeded memory-repo dataset.
- Don't break: statistics only from adults who opt in, under a random id; never add a field that can hold a name, chat, transaction id or free text; never send the statistics id with the player token; deploy the server before the game.

### OPS-07 — Runbooks and alert routing for every alert (earlier R-4)
- Severity: MEDIUM
- Status: FAIL
- Kind: DOCS (+ small config)
- Compartment: ops (`ops/prometheus/`), docs
- Checklist refs: Checklist §3 "Pager for the alert rules, on-call rota, status page"; Masterclass: Live ops / incident response
- Evidence:
  - `ops/prometheus/alerts.yml:8-106`: 13 alerts, each with only `summary`. `grep -c runbook` returns 0. No `team`/`owner` label, no Alertmanager or Grafana contact-point config in `ops/`.
  - `tests/backend/server/observability.test.ts:196` checks only metric names.
  - There is also no alert for purchases stopping (`tk_purchases_total` flat while `tk_http_requests_total` is high) or for re-simulation saturation (`tk_resim_busy_total`), both launch-day failure modes (inferred).
- Fix:
  1. Write `docs/ops/RUNBOOK.md` with one section per alert: what it means, first three checks (logs, `/readyz`, Grafana panel), mitigations (`SERVER_NOTICE`, scale instances, `RESIM_WORKERS`, `MIN_CLIENT_BUILD`, roll back per OPS-05, halt store rollout), and who to escalate to.
  2. Give every rule `annotations.runbook_url: https://github.com/<owner>/<repo>/blob/main/docs/ops/RUNBOOK.md#<alert-lowercase>` and `labels.team: server`.
  3. Add `PurchasesStalled` and `ResimBusy` rules.
  4. Add `ops/alertmanager/alertmanager.example.yml` (`severity=page` to the pager receiver, `warn` to chat, `info` to email) with placeholders the owner fills (no secrets).
- Tests: extend `observability.test.ts`: "every alert has runbook_url pointing at an existing RUNBOOK.md heading and a severity label".
- Done when: the test passes and every alert name appears as a heading in `RUNBOOK.md`. The owner routes `page` to a real pager (OWN-18).
- Don't break: metric names must stay in `METRIC_HELP`; no secrets in the repository.

### OPS-08 — Crash-free-session measurement: correct the docs, optionally add opt-in Sentry sessions
- Severity: MEDIUM
- Status: PARTIAL
- Kind: DOCS + CODE
- Compartment: backend/analytics, docs
- Checklist refs: Checklist §16 "KPIs … crash-free sessions"; §17; Masterclass: Observability
- Evidence:
  - `sentryEnvelope.ts:102-118` sends only `{"type":"event"}` items, with no `session`/`sessions` items, so Sentry Release Health shows nothing.
  - `RELEASE.md:34` lists "Crash-free sessions (Sentry, the stores' vitals)".
  - Store consoles are primary (`RELEASE.md:20-29`), which is correct for native. The PWA has no crash-free source.
- Fix:
  1. DOCS (do now): `RELEASE.md:34` becomes "Crash-free users/sessions: Play vitals and Xcode Organizer only; Sentry counts errors from opted-in players, not sessions". State in the soft-launch plan (OPS-11) that crash-free gates read the store consoles.
  2. CODE (optional): `buildSessionEnvelope(dsn, {sid, init, status, started, duration, errors, release, environment})` with no `did` (no user id). Send it from `CrashReporter` at session start and on `pagehide`/`visibilitychange` hidden (`status:'exited'`, or `'crashed'` after an uncaught error), only when `crashReportsAllowed(...)`. Throttle as today.
- Tests: `tests/backend/analytics/sentryEnvelope.test.ts`: "session envelope has no did and carries release/environment"; "no session sent when crash reports are off or under 13".
- Done when: `RELEASE.md` no longer claims Sentry sessions. If the code part is done, a staging build with crash reports on shows a crash-free-session rate per release in Sentry.
- Don't break: crash reports opt-in; no user id or player data in envelopes; the under-13 rule.

### OPS-09 — Server-side kill switches for products and features
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: server, backend (`net/protocol.ts`, `payments`)
- Checklist refs: Checklist §12 economy; §15 live ops; Masterclass: Live ops / remote config
- Evidence:
  - Server env names (`server/config.ts`, `server/main.ts`, enumerated by grep) include `SERVER_NOTICE`, `MIN_CLIENT_BUILD`, `RETIRED_RULES`, `BALANCE_BUNDLE_FILE`, `EVENT_SCHEDULE_FILE` and the compliance switches, but no way to stop selling a product (a mis-priced offer, a broken Scroll delivery) or to switch off chat, referrals or shared replays during an incident.
  - Balance bundles change numbers only (`balanceBundle.ts:1-20`).
  - Features are a fixed list in `/v1/hello` (`server/core/identity.ts:25`).
- Fix:
  1. `ServerPolicy` gains `PRODUCTS_OFF` (comma list of game product ids) and `FEATURES_OFF` (subset of hello features: `chat`, `referrals`, `shared-replays`, `duels`, `gangs`).
  2. `purchaseIntent` refuses an off product with a new `srv.purchase.paused` message (English plus every ready language, `i18n:sync`).
  3. `identity.ts` removes off features from `features`. Their routes answer `503 feature_paused`.
  4. The client already gates on `hasFeature`. Check that the Store greys out a product the server reports paused (add `pausedProducts` to hello).
  5. Document in `SHIPPING.md` 3h and in `RUNBOOK.md`.
- Tests: server tests: "an intent for a product in PRODUCTS_OFF is refused before payment"; "hello omits a feature in FEATURES_OFF and its route answers 503"; client DOM test: a paused product shows as unavailable.
- Done when: setting `PRODUCTS_OFF=season_scroll` on staging makes the Store show it unavailable and the server refuse its intent, with no app update.
- Don't break: real prices only in the Store and its confirm step; a purchase already paid is still delivered (redeem path untouched); protocol changes go in `docs/PROTOCOL.md` with contract tests; deploy the server before the game.

### OPS-10 — App-level `PrivacyInfo.xcprivacy` for the iPhone app
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE (+ OWNER Xcode validation)
- Compartment: ops (.github/android/ios)
- Checklist refs: Checklist §2 store submission; §7 store-API compliance
- Evidence:
  - `find ios -name '*.xcprivacy'` finds nothing. Only `node_modules/@capacitor/ios/{Capacitor,CapacitorCordova}/PrivacyInfo.xcprivacy` exist.
  - `OWNER_CHECKLIST.md` §3 and the Phase 7 record (`WORLDWIDE_AUDIT.md` P7-15: "the app-level PrivacyInfo.xcprivacy (an Xcode target step, not made)").
  - The app's own Swift does not use required-reason APIs today (grep of `ios/App/App/*.swift` for `UserDefaults`/`systemUptime`/file dates finds nothing), and the bundled plugins neither use them nor ship manifests (grep of `node_modules/@capacitor/*/ios`, `@capacitor-community/in-app-review`). So this is the data-collection declaration Apple asks apps to carry, not a required-reason block (inferred). OPS-03 step 2 would add `UserDefaults`.
- Fix:
  1. Create `ios/App/App/PrivacyInfo.xcprivacy`: `NSPrivacyTracking` false, `NSPrivacyTrackingDomains` empty, `NSPrivacyCollectedDataTypes` matching `PRIVACY.md:58-68` (User ID, Device ID, Purchase History, Gameplay Content, Other User Content, Other Data Types linked for App Functionality; Crash Data and Product Interaction not linked), and `NSPrivacyAccessedAPITypes` (`CA92.1` UserDefaults once OPS-03 uses it).
  2. Add it to the App target's Resources build phase by editing `project.pbxproj` (PBXFileReference, PBXBuildFile, group and resources entries).
  3. Owner: archive in Xcode and check the generated privacy report (OWN-13).
- Tests: `release-config.test.ts`: "PrivacyInfo.xcprivacy exists, parses as a plist, is in the App target's resources, NSPrivacyTracking is false, and its collected types match the list in PRIVACY.md".
- Done when: the test passes and Xcode's "Generate Privacy Report" on the archive lists the app's own manifest (owner evidence).
- Don't break: declarations must match `PRIVACY.md` and `public/privacy.html` (a wrong declaration is a policy problem); no tracking.

### OPS-11 — Adopt a soft-launch plan with KPIs and kill criteria, and a device-test matrix with protocol
- Severity: MEDIUM
- Status: FAIL
- Kind: DOCS
- Compartment: docs (`docs/store/`)
- Checklist refs: Checklist §6 (device testing), §16 items "Soft-launch plan" and "KPIs and kill criteria"; Masterclass: Soft launch / real-world testing
- Evidence:
  - KPIs and kill criteria exist only as audit recommendations (`docs/audit/areas/09-retention-and-marketing.md:129-131`: D1 ≥ 35%, D7 ≥ 15%, tutorial ≥ 70%, kill if D1 < 25% …; `STATE_OF_THE_GAME.md:320-322`). `RELEASE.md` has crash and ANR halt rules but no retention gates.
  - Device classes are listed (`OWNER_CHECKLIST.md` §5, `TESTING.md` "Native checks") with no fixed matrix, repeat counts, durations, thresholds or results template.
  - No silent first-time playtest protocol.
- Fix:
  1. `docs/store/SOFT_LAUNCH.md`: markets for waves A and B, owner-chosen dates, cohort size, KPIs with targets and kill and pause lines, the data source for each (Play vitals and Xcode Organizer for crash-free and ANR; `/admin/v1/stats/funnel` for D1/D7/tutorial, noting the opt-in bias; store consoles for installs and conversion), the decision owner and the review cadence.
  2. `docs/store/DEVICE_MATRIX.md`: 10–20 devices (at least one 2 GB Android Go, 3–4 GB Androids, an iPhone on iOS 15–16, current flagships, one tablet). Protocol: cold start ×50 and warm start ×50 (median and p90 ms), 2-hour session memory (start, peak, end; `tkmemorywarning` count), 20-minute battle thermal (FPS p50/p5, skin temperature or throttling state), interruptions (call, notification, background 10 min, airplane mode mid-battle, low storage, kill and resume), battery % per hour, 3G/400–800 ms latency. Pass and fail thresholds to be set from the first measurements. A results table per build (date, build id from OPS-01, device, tester).
  3. `docs/store/PLAYTEST.md`: silent first-time protocol (5+ players new to the game, no help, screen and voice recording, note where they stall, questions only afterwards) and where notes go.
  4. Link all three from `RELEASE.md` "Before submitting" and `OWNER_CHECKLIST.md` §5.
- Tests: `tests/presentation/store-compliance.test.ts` (docs presence): "SOFT_LAUNCH.md names a kill line for D1 and crash-free rate"; "DEVICE_MATRIX.md lists a ≤2 GB Android device and the cold-start ×50 protocol".
- Done when: the three documents exist, are linked from `RELEASE.md`, and the owner has filled the target and threshold cells (OWN-21, OWN-24, OWN-25).
- Don't break: honesty, so model players are never reported as players; statistics are an adult opt-in sample and must be described as such.

### OPS-12 — Store preflight misses Sentry DSN, public URL and other launch variables
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: ops (`tools/release/check-store-ready.mjs`)
- Checklist refs: Checklist §17 "VITE_PUBLIC_URL, VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_IDS set"
- Evidence: the local run lists legal-config, terms, `APP_ID`, signing keys and `VITE_SERVER_URL` only (22 items). It never checks `VITE_SENTRY_DSN`, `VITE_PUBLIC_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_APP_STORE_URL`/`VITE_PLAY_STORE_URL`, the PrivacyInfo file (OPS-10) or `SENTRY_AUTH_TOKEN` (OPS-02). `RELEASE.md` "Before submitting" requires `VITE_PUBLIC_URL` and `VITE_GOOGLE_CLIENT_ID`.
- Fix: add these as non-blocking rows (blocking in `--store` mode for `VITE_PUBLIC_URL` and, on Android, `VITE_GOOGLE_CLIENT_ID`). Pass the variables to the preflight steps in `android.yml:96-103` and `ios-testflight.yml:31-37`.
- Tests: extend the preflight test (or add `tests/backend/release-preflight.test.ts`): "missing VITE_PUBLIC_URL is blocking with --store".
- Done when: `npm run release:preflight` lists the new rows, and a `--store` run without `VITE_PUBLIC_URL` fails.
- Don't break: the web deploy's preflight stays a notice that never fails (`deploy.yml:36`).

### OPS-13 — Launch-day and live-ops documents: known issues, support macros, hotfix path, sunset
- Severity: LOW
- Status: FAIL
- Kind: DOCS
- Compartment: docs
- Checklist refs: Checklist §3 "support mailbox; written refund, chargeback and cheat-ban policies"; §16 "Discord, subreddit…"; Masterclass: Launch day / live ops
- Evidence:
  - No known-issues page or template (grep "known issue" in `docs/`, `public/support.html`).
  - No hotfix procedure (expedited Apple review request, Play staged rollout of a patch, `MIN_CLIENT_BUILD` use).
  - No sunset plan beyond `terms.html` "We can change or end the game or online play".
  - `SERVER_NOTICE` exists for in-game notices (`SHIPPING.md:243`).
- Fix:
  1. `docs/ops/LAUNCH_DAY.md`: day-0 timeline (server deployed and pre-scaled, then web, then store release), who watches what (the `RELEASE.md` table), a known-issues page (a section in `public/support.html` driven by a small JSON, or a pinned community post) and its update rule, support reply templates (purchase not delivered: Player ID plus restore; age-band reset; deletion).
  2. Hotfix path: branch from the release tag, bump the patch version (OPS-01), run the same workflows, request expedited review, set `MIN_CLIENT_BUILD` only once the store builds are live.
  3. `docs/ops/SUNSET.md`: notice period (at least 30 days in-game through `SERVER_NOTICE` and push), stop sales first (`PRODUCTS_OFF`, OPS-09), unused-Jade handling per market (Japan 資金決済法 report `GET /admin/v1/reports/jp-unused-balance` already exists), offline mode for device villages, data deletion schedule.
- Tests: docs only (a presence check in `store-compliance.test.ts` is optional).
- Done when: the three documents exist and `RELEASE.md` links them.
- Don't break: event countdowns are real; honesty about generated opponents in any notice.

### OPS-14 — Review prompt: stale comment and no "recent problem" guard
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: integration (presentation/ui) via backend request
- Checklist refs: Checklist §15 growth; Masterclass: Store ratings
- Evidence:
  - `src/presentation/ui/reviewPrompt.ts:6` says "No native review plugin is installed", but `package.json` has `@capacitor-community/in-app-review` ^8.0.0 and `main.ts:304` provides it through `native.ts:50-54`.
  - `shouldAskForReview` (`reviewPrompt.ts:34-39`) checks win, tutorial, ≥5 wins, the 120-day gap and ≤3 asks, but not a failed or unsaved purchase (`PurchaseOutcome.unsaved`), a crash or boot error, or a server error in the same session.
  - A 1-star raid counts as a win (`battleHud.ts:887` `r.stars > 0`), which is acceptable.
- Fix:
  1. Correct the comment.
  2. Add a session flag `reviewBlocked`, set by the purchase flow on a failed or unsaved purchase, by `main.ts` on a boot-error report, and by `Connection` on a `suspended`/`incompatible` status. `noteBattleResult` returns false while it is set.
- Tests: `tests/presentation/ui/reviewPrompt.test.ts`: "no request after a purchase problem in the same session".
- Done when: the test passes.
- Don't break: never gate anything on the review; never ask "do you like it?" first; never after a loss.

---

## 3. Owner and device checklist

| ID | What to do | Where | Evidence that closes it | Closes |
|---|---|---|---|---|
| OWN-01 | Choose the publisher (person or company). Set up bank and tax in both stores; Apple Small Business Program; EU DSA trader declaration. | App Store Connect, Play Console | Payee accepted in both consoles | `OWNER_CHECKLIST` §1, §3 |
| OWN-02 | Trademark and store-name search for "Kagemura" (USPTO, EUIPO, JPO; classes 9 and 41); pick a fallback | Search provider or lawyer | Search report filed | `OWNER_CHECKLIST` §1 |
| OWN-03 | Choose the final bundle id. Set the repository variable `APP_ID`, then `strings.xml` `package_name`/`custom_url_scheme`, the Xcode identifier, server `APPLE_BUNDLE_IDS`/`GOOGLE_PLAY_PACKAGE`, `GAMECENTER_BUNDLE_IDS` | GitHub vars, `android/app/src/main/res/values/strings.xml`, server env | `npm run release:preflight` has no App id row | GLOBAL-017 |
| OWN-04 | Fill every fact in `public/legal-config.js` (operator, address, phone, responsible person, support email, deletion and complaint URLs, EU/UK representatives, hosting and Sentry regions, governing law, 4 retention periods). Date `termsEffective` after legal review. | `public/legal-config.js` | Live `/privacy.html`, `/terms.html` and `/support.html` show no "not published yet" and no draft banner; preflight has 0 legal rows | GLOBAL-015 |
| OWN-05 | Lawyer review of privacy and terms per market. Decide `UNDER13_MODE`, the COPPA position, `EU_JADE_VALUE`, `APPLE_CONSUMPTION_RESPONSE` and the EAA statement. | Server env, `docs/legal/` | Reviewed texts merged; decisions recorded in `docs/legal/MARKETS.md` | GLOBAL-006 (markets), R07, R10 |
| OWN-06 | Register a domain; decide hosting and Sentry data regions; `api.<domain>` A and AAAA, HSTS | DNS, host | `node tools/ops/check-domain.mjs https://api.<domain>` passes (IPv6 too) | R08 (IPv6) |
| OWN-07 | Apple: App ID capabilities (Sign in with Apple, Game Center, Push, Declared Age Range), keys (SIWA, App Store Server API, APNs), server notification URLs, privacy label from `PRIVACY.md:58-68` | App Store Connect, developer.apple.com | App privacy section submitted; TestFlight build processes | R08 |
| OWN-08 | Play: Data safety (`PRIVACY.md:70-92`), target audience 13+, IARC, Age Signals access, deletion URL, service account and RTDN, license testers | Play Console | Each Policy → App content form shows "Completed" | GLOBAL-001, R08 |
| OWN-09 | Answer both age-rating questionnaires (prepared answers `PRIVACY.md:94-120`, after re-reading Apple's definitions) | App Store Connect, Play IARC | Ratings shown in both consoles | `OWNER_CHECKLIST` §2 |
| OWN-10 | Create the 13 in-app products with the `store.json` ids and regional prices; check prices in 3+ storefronts on devices | Both consoles; phones | Screenshots of the store sheet vs the in-game confirm in USD, EUR, JPY/INR | GLOBAL-007 |
| OWN-11 | Create the upload keystore. Put the four `ANDROID_KEYSTORE_*` secrets in GitHub. Back up the `.jks` and passwords offline in two places. Turn on Play App Signing. | GitHub secrets, password manager, Play Console | aab job runs; upload certificate SHA-256 matches Play's | GLOBAL-017 |
| OWN-12 | Produce the first signed AAB and upload it to internal testing. Confirm Billing ≥8 in the log, `versionCode` increasing, no `.so` (or 16 KB OK in the bundle explorer), no Billing deprecation warning. | `android.yml` aab job, Play Console | Run log and Play Console screenshot kept | GLOBAL-001, GLOBAL-017, R08 |
| OWN-13 | Apple signing secrets (`APPLE_TEAM_ID`, `ASC_*`); first `ios-testflight.yml` run on `macos-26`; archive validates with the PrivacyInfo (OPS-10) | GitHub, App Store Connect | A TestFlight build exists with no SDK warning | R08 |
| OWN-14 | OAuth web and Android clients (with the Play signing SHA-1). Set `VITE_GOOGLE_CLIENT_ID` and server `GOOGLE_CLIENT_IDS`. Test reinstall and second-device recovery. | Google Cloud, GitHub vars, server env | Test log with date, build and phones | GLOBAL-008 |
| OWN-15 | Deploy staging and production servers: GitHub environments with `DEPLOY_HOOK`/`SERVER_URL`, production required reviewers, every production secret | GitHub environments, host | `server.yml` staging contract tests ran (no "No staging contract tests" warning); production `/readyz` green | `OWNER_CHECKLIST` §4 |
| OWN-16 | Run `npm run server:load` on staging at 10× the expected peak battles/s; size instances, `RESIM_WORKERS` and rate limits; pre-scale production for launch day | Staging host | Numbers recorded in `SHIPPING.md` 3h; p95 < 1 s; no `ResimBusy` | R04 |
| OWN-17 | Sentry: game and server projects, `VITE_SENTRY_DSN` and `SENTRY_DSN`, "Prevent Storing of IP Addresses" on, data region recorded, `SENTRY_AUTH_TOKEN` for source maps (OPS-02), issue alerts to the pager | Sentry, GitHub vars and secrets | A staging test crash shows source lines; IP storage off (screenshot) | GLOBAL-019 |
| OWN-18 | Scrape `/metrics` (`METRICS_TOKEN`), load `ops/prometheus/alerts.yml`, route `page` alerts to a pager (OPS-07 example), uptime check and public status page on `/readyz` | Grafana Cloud or Prometheus, Better Stack/UptimeRobot | A test alert reaches the on-call phone | `OWNER_CHECKLIST` §4 |
| OWN-19 | On-call rota, trained moderator(s), support mailbox, refund, chargeback and ban policies | Team docs | Rota published for launch week; mailbox answers | R06 |
| OWN-20 | Community channel (Discord or similar) staffed and moderated; publish the known-issues list (OPS-13) | Community platform, `support.html` | Link live in Settings → Privacy and help | R06 |
| OWN-21 | Run the 10–20 device matrix (OPS-11) including a 2 GB Android Go: cold and warm start ×50, 2-hour memory, 20-minute thermal, interruptions, battery per hour, 3G/high latency, renderer kill (OPS-03) | Real phones, store-installed builds | Filled `DEVICE_MATRIX.md` table per build | R03, R08, GLOBAL-001 (device part) |
| OWN-22 | Signed-build store tests: purchase, repeat consumable, cancel, slow card approve and decline, kill after paying, restore, refund and reversal, Ask to Buy, Sign in with Apple and Game Center, push and quiet hours, Android Back, updates over the previous build | TestFlight, Play internal track | `TESTING.md` "Native checks" log with date, build and phone | GLOBAL-001, GLOBAL-007, GLOBAL-008, R08 |
| OWN-23 | Closed testing: TestFlight external group; Play closed track ≥12 testers opted in for 14 consecutive days | Both consoles | Play shows 14 days ≥12; production access granted | GLOBAL-017 |
| OWN-24 | Silent first-time playtest (5+ new players, no help, recorded) | In person or remote | Notes in `PLAYTEST.md` with stall points | (playtest gap, `OWNER_CHECKLIST` §5) |
| OWN-25 | Soft-launch market plan with kill criteria (D1, D7, tutorial, crash-free and ANR read from the store consoles; funnel from `/admin/stats`); decision owner named | `SOFT_LAUNCH.md` (OPS-11), store territories | Plan signed off before any paid installs | GLOBAL-006 (markets) |
| OWN-26 | Native-speaker review of the 49 machine-translated languages, the chat word lists and the 49 store listings | Reviewers | Reviews recorded in `docs/localization/WORD_LISTS.md` and per-language notes | R05, R06 |
| OWN-27 | Store screenshots from a store-configured build (not the sandbox: no sandbox note, no "(test)" prices) at every required size; feature graphic | Devices or `npm run store:screenshots`, then retake the Store shot | Screenshots uploaded; each matches current UI | (listing accuracy, GLOBAL-020 follow-up) |
| OWN-28 | Select territories (exclude mainland China, Vietnam, Indonesia before PSE, sanctioned markets) | Both consoles | Territory list saved | GLOBAL-006 (markets) |
| OWN-29 | Set `VITE_PUBLIC_URL` and the App Links / Universal Links domain files; uncomment the manifest filter and entitlement | GitHub vars, domain, `AndroidManifest.xml`, `App.entitlements` | Friend link opens the app on both platforms | R09 |
| OWN-30 | Backups to an owned bucket (PITR or WAL) plus one real restore drill | Host, `tools/ops/restore.mjs` | Drill date and duration recorded | `OWNER_CHECKLIST` §4 |
| OWN-31 | Rehearse a hotfix and a rollback on staging (OPS-05, OPS-13): web rollback, server image rollback, an expedited-review patch path | Staging, both consoles | Times recorded in `RELEASE.md` | (rollback gap) |
| OWN-32 | Tag every store release `v<version>` and update `tools/release/last-release.json` (OPS-01) | git | `git tag` lists the release; the previous-client contract runs | (R-2 follow-up) |
| OWN-33 | Define the offline promise and test long outages after first connection (raid rewards past ticket expiry) | Design decision, devices | Decision in `docs/DECISIONS.md`; outage test log | R01, R02 |
| OWN-34 | Turn off the old Toadstool Kingdoms Pages site on the same origin | GitHub Pages | Old URL returns 404 | `OWNER_CHECKLIST` §4 |
| OWN-35 | Every year: check Play target API and Billing deadlines, Apple minimum SDK; rotate keys; renew Apple membership | Calendar | Calendar entries exist | GLOBAL-001 (ongoing) |

---

## 4. Verified sound

- **Debug and cheat gating:** the sandbox and debug tools need `?sandbox`/`?debug` (`src/backend/payments/select.ts:13-16`). `window.tk` is set only with `?debug` (`src/main.ts:735-737`). The sandbox has its own save, an in-memory event store, no server, no DSN and no balance or event loaders (`main.ts:171-180, 231-288`). Native WebViews load without a query string and no deep link reaches the WebView URL (inferred from `AndroidManifest.xml`, `Info.plist` and the commented-out link filters). WebView debugging defaults to debug builds only (Capacitor `CapConfig.java:286`). Content preview needs `VITE_ALLOW_PREVIEW=1`, which no workflow sets.
- **Increasing native build numbers:** Android `versionCode` = run number + `ANDROID_VERSION_CODE_OFFSET` with range checks (`android.yml:150-159`, `release.gradle:27-32`). iOS `CURRENT_PROJECT_VERSION=run_number` (`ios-testflight.yml:88`).
- **Commercial Android configuration:** the signed AAB sets `VITE_PLAY_BILLING=1`, fails if Billing < 8, verifies the signature and lists native libraries (`android.yml:127-195`). The legacy app id is refused unless explicitly allowed (`check-app-id.mjs`, `android.yml:104-109`). `targetSdkVersion 36`, `minSdk 24`, `minWebViewVersion 80` (`variables.gradle`, `capacitor.config.ts`). `SCHEDULE_EXACT_ALARM` is removed (`AndroidManifest.xml`).
- **Reproducible pipeline:** `npm ci` from `package-lock.json`, `.node-version` 24.22.3 in every workflow, actions pinned by commit SHA, Docker base pinned by digest (`Dockerfile:10`), `minifyEnabled false` (no R8 mapping file needed).
- **Server release identity and order:** the image is tagged with the commit and `RELEASE=kagemura-server@<sha>` (`server.yml:101-109`, `Dockerfile:36-37`). Production is manual and gated by an environment (`server.yml:148-174`). "Server first" checks run before every client build (`check-server-rules.mjs` in `deploy.yml:60-62`, `android.yml:43-46`, `ios-testflight.yml:42-45`). Migrations are a release step, and the built server is contract-tested on a freshly migrated Postgres (`deploy.yml:106-137`).
- **Staging vs production on the server:** `DEPLOY_ENV`, the `server_meta` claim that stops staging from touching production data, and production refusing unsafe config (`SHIPPING.md:211-218`).
- **Privacy-preserving analytics:** an allowlist with typed fields only, random statistics id, adults only, off until yes, deleted on no, no IP or player id stored (`src/backend/net/stats.ts:1-91`, `PRIVACY.md` statistics row). Funnel with D1/D7/D30, tutorial steps, first raid and first purchase (`server/core/statsLocal.ts:18-157`, `/admin/v1/stats/funnel`, `server/routes/growth.ts:39-40`).
- **Crash reports are consent-gated and scrubbed:** off by default (`prefs.ts:10`), never under 13 (`crashReports.ts:27-29`), never in the sandbox (`main.ts:236`), query strings and emails scrubbed (`sentryEnvelope.ts:46-99`), throttled to 10 a minute.
- **Store-required account features in code:** Restore purchases (`economyUi.ts:289-292`), in-app deletion (`hud.ts:1368-1396`) plus the web deletion form, Sign in with Apple as the only third-party login on iPhone, odds shown for the only random item (the free daily chest), no ATT needed (no tracking). `ITSAppUsesNonExemptEncryption=false` (`Info.plist`).
- **Licence notices:** `public/licenses.html`, generated and tested (`tools/release/licenses.mjs`, `tests/backend/licenses.test.ts`), covering every shipped npm package, native library families and fonts.
- **Store-readiness preflight:** `tools/release/check-store-ready.mjs` fails the signed jobs on 6 blocking owner items and lists 22 open (run locally at `560ce7a`).
- **Rollout watch plan:** `docs/store/RELEASE.md:20-37` (Play vitals 1.09% crash / 0.47% ANR halt lines, Xcode Organizer terminations, pre-launch report, desyncs by build, `RefundSpike`), plus pause instructions for both stores.
- **Review prompt policy:** only after a real raid win, after the tutorial, ≥5 wins, 120 days apart, ≤3 times ever, never gating anything (`reviewPrompt.ts:18-39`, `battleHud.ts:886-887`).
- **Event and time safety tests:** a 365-day event loop, per-occurrence payouts, local-midnight rolls, and missed days never wiping streaks or calendars (`tests/gameplay/sim/events-loop.test.ts`, `clocks.test.ts`, `return-hooks.test.ts`).
- **Patch notes:** in-game What's new equals `docs/store/RELEASE_NOTES.md` (`tests/presentation/ui/whats-new.test.ts`). It only needs a version that changes (OPS-01).
- **Live legal pages are reachable:** `privacy.html`, `terms.html`, `support.html`, `licenses.html` and `community.html` return HTTP 200 on GitHub Pages (curl, 2026-11-21). Their content is honestly marked unpublished until OWN-04.
- **Data Safety, privacy label and age-rating answers are drafted** from the code (`docs/store/PRIVACY.md:7-120`). Closed-testing plan in `docs/store/TESTING.md`.
