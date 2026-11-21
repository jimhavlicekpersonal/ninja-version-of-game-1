# STB — Crashes, stability, memory, lifecycle and client performance

Audited commit `560ce7a` (HEAD), 2026-11-21. Read-only audit: no repository file was edited. I ran `npm ci --ignore-scripts`, `npm run build` (passed, chunk sizes below) and `npx vitest run tests/presentation/render tests/presentation/audio` (15 files, 66 tests passed). `node_modules/` and `dist/` are gitignored, and `git status` is still clean. Not run: any browser or Playwright run (Playwright is not installed, so `npm run perf:lowend` and `perf:profile` were not run), any device, any native build, Sentry ingestion. Line numbers are from this checkout. Anything marked "(inferred)" is reasoning I did not reproduce.

## 1. Verdict table

| # | Checklist item | Verdict | One-line evidence |
|---|---|---|---|
| 1 | Crash-free rate can be measured | FAIL | The reporter only sends error events (`src/backend/analytics/crashReports.ts:46-56`). It sends no session or release-health envelope, so there is no denominator. It is opt-in and off by default (`src/backend/platform/prefs.ts:10`), and nothing detects an unclean exit. |
| 2 | Crash reporting wired in release and native builds | PASS (opt-in) | `VITE_SENTRY_DSN` is set in `.github/workflows/deploy.yml:55`, `android.yml:57,138` and `ios-testflight.yml:56`. It is installed first thing in `boot()` (`src/main.ts:235-242`). Never in the sandbox, never for under-13 (`crashReports.ts:27-29`). |
| 3 | Source maps / symbols uploaded (O-1) | FAIL | `vite.config.ts:162-175` has no `build.sourcemap`. My build made 0 `.map` files (`find dist -name '*.map'` gives 0). No workflow uploads anything (grep `sourcemap` in `.github/` gives no hits). Every build reports `release: kagemura@0.1.0` (`main.ts:237`, `package.json:4`). |
| 4 | Android WebView renderer crash path (O-2) | FAIL | `MainActivity.java` registers no `WebViewListener`. Capacitor's `BridgeWebViewClient.onRenderProcessGone` returns `false` unless a listener says otherwise (`node_modules/@capacitor/android/.../BridgeWebViewClient.java:92-104`), so Android kills the app. iOS reloads silently (`.../WebViewDelegationHandler.swift:164-168`). Neither is recorded anywhere. |
| 5 | Global error handlers with context | PARTIAL | `error` and `unhandledrejection` listeners exist only when a DSN is built in (`crashReports.ts:61-68`). Tags are only `side`, `device` (OS family) and `kind` (`main.ts:240`). There is no build id, scene, battle flag, quality profile, renderer type or last command. An exception inside the Phaser frame kills the render loop for good with no recovery (STB-03). |
| 6 | Cold start | NEEDS-DEVICE | Boot guard, sliced texture painting and the splash are in place (`main.ts:461-488`). The 2026-11-13 record measured about 29 s to the village on emulated 2G. Every first visit also parses a 193 KB inline head script (STB-08). |
| 7 | Warm start / resume; pause stops timers, audio, rendering, polling | PARTIAL | Phaser pauses and resumes its loop (`phaser/src/core/Game.js:590-633`). Audio suspends on hide (`main.ts:907`, `sound.ts:151-160`). Alliance polling skips while hidden (`groveSource.ts:366-417`). A resume syncs after at most 5 s (`connection.ts:1016-1021`). But `Connection`'s 60 s, 120 s and 15 s intervals keep running while hidden (`connection.ts:1005-1008`). Capacitor `pause` neither suspends audio nor schedules reminders (`main.ts:927-931`), and nothing listens for `appStateChange` (STB-09). |
| 8 | Force-quit mid-save | PASS | The revision check and the write share one IndexedDB transaction (`saveStore.ts:112-133`). Damaged saves are kept, newest 5 (`saveStore.ts:138-148`). |
| 9 | Force-quit mid-purchase | PASS (code) / NEEDS-DEVICE | `recoverPurchases` runs on becoming visible and on reconnect (`main.ts:413-424`). A store transaction is finished only after the save landed (backend brief, `awaitingSave`). No store sandbox was run. |
| 10 | Force-quit mid-battle | PASS | The pending battle is tracked from the first deployment, throttled to 1.5 s (`app.ts:542-575`). `flushBattle` runs on hide, `pagehide` and `pause` (`main.ts:888-890`). |
| 11 | Autosave on pagehide / visibilitychange / app pause | PASS | `goingAway` runs on `visibilitychange` hidden, `pagehide` and Capacitor `pause` (`main.ts:888-931`). The 15 s dirty-check autosave is at `main.ts:868-877`. |
| 12 | Low-memory kills | PARTIAL | Android `onTrimMemory` (`MainActivity.java:24-30`) and iOS `didReceiveMemoryWarning` (`TkViewController.swift:14-17`) send `tkmemorywarning`, which trims unheld art and thumbnails (`main.ts:897-904`). The kill itself is unhandled (row 4), and no device has measured it. |
| 13 | WebGL context loss / restore | PARTIAL | Phaser's defaults call `preventDefault` on loss and rebuild the GL wrappers on restore (`WebGLRenderer.js:1021-1111`). Released canvases are repainted on `RESTORE_WEBGL` (`assets.ts:186-199`). The game itself handles nothing: grep for `LOSE_WEBGL` / `contextlost` in `src` gives 0 hits. There is no message, no timeout or reload when the context never comes back, and nothing is reported (STB-06). |
| 14 | Texture LRU / eviction (F1) | PASS | `render/textureBudget.ts` (LRU with holders). The battle holds and releases its textures (`BattleScene.ts:242-246`). Budgets are 64 MB on high and 24 MB on low (`quality.ts:138,152`). Known limit: warrior and badge textures are not budgeted (2026-11-13 record). |
| 15 | Listeners, timers and tweens outliving scenes; DOM HUD listeners | PASS | Cleanup on scene shutdown: `VillageScene.ts:177`, `BattleScene.ts:243-261`, `cameraControl.ts:45`, `touchInput.ts:29`. HUD timers and the key handler are cleared when their modal closes (`armyUi.ts:245-249`, `groveUi.ts:128-133`, `battleHud.ts:276-277`, `hud.ts:2613`, `hud.ts:965-971`). `VillageScene.ts:141` never removes its RESIZE listener, but the village only sleeps and wakes (`app.ts:351,537`) and is never restarted, so it is harmless today. |
| 16 | Thermal / battery: FPS caps, low profile, run-time downgrade | PASS (code) / NEEDS-DEVICE | FPS caps at `main.ts:445-447` and `frameRate.ts:83-87`. The village idles at about 20 FPS and draws at about 10 under a dialog (`main.ts:983-1020`). A slow battle drops to 30 FPS (`frameRate.ts:104-107`, `quality.ts:270-288`). Low has no further step down, and nothing was measured on a phone. |
| 17 | Music synthesised while muted (F9) | PASS | The scheduler runs only while music is audible (`sound.ts:438-446`). There is no `AudioContext` while all sound is off (`sound.ts:71-72`). |
| 18 | Background throttling | PARTIAL | Render, audio and Alliance polling stop when hidden. `Connection` sync, base upload and flush keep firing (row 7, STB-09). |
| 19 | Null states, divide-by-zero, empty arrays | PASS | Divisors are guarded: `hud.ts:570,1448,1457,1716`, `armyUi.ts:229,258`, `battleHud.ts:743,954`. The few unguarded widths (`economyUi.ts:553`, `groveUi.ts:273,281`) are cosmetic only: CSS ignores `NaN%` and `Infinity%`, so nothing throws. I spot-checked empty-list screens, not all of them. |
| 20 | Worst-device target (low profile) | NEEDS-DEVICE | `quality.ts:141-153` (low profile) and `autoProfile` at `quality.ts:160-180`. No cheap-phone run exists (R03 is open). |
| 21 | Frame pacing | PASS (code) | Limits are set from the measured refresh rate (`frameRate.ts:57-87`). Battle steps are capped at 250 ms per frame (`battleSession.ts:77`). |
| 22 | Load time to playable | NEEDS-DEVICE | Only the emulated figure exists (about 29 s on 2G, 2026-11-13 record). Not re-measured here (no browser). |
| 23 | Bundle and install size | PARTIAL | Measured: about 723 KB gzip on the critical path. Parts: entry 183.8 KB, `phaser` 175.5 KB, `defineProperty` 114.9 KB, `communityRules` 51.2 KB, `keep` 47.4 KB, `index.html` 53 KB gzip (199 KB raw, 193 KB of it one inline script with 50 languages × 29 strings), CSS 17 KB and fonts. `dist/` is 23 MB, of which `dist/lang` is 16 MB, all of it bundled into native installs. No size-budget test exists (STB-08, STB-10). |
| 24 | GC spikes (per-frame allocations) | PASS (minor) | A few small allocations per frame: `new Set` per frame (`BattleScene.ts:724`, and in the troop sync around line 1192), and a `map().join()` signature in `drawEntry` (`BattleScene.ts:622`). These are small. No hot-loop cloning: `controller.tick` does cheap checks before `advance` (`controller.ts:492-504`). |
| 25 | Shader / first-use stutter | PARTIAL | Every building level a base needs is painted synchronously in `BattleScene.create` (`BattleScene.ts:589-590` → `assets.ts` `buildingTexture`/`paintLevel`). Ruins are painted on the first destruction in the middle of a battle (`BattleScene.ts:1108` → `fx.ts:301-305`). Thumbnails are encoded as synchronous PNG (`assets.ts:323-340`). Sound buffers are prewarmed (`sound.ts:104-119`) (STB-07). |
| 26 | Asset streaming | PASS | The web fetches only the chosen language pack (`vite.config.ts:58-63`, boot script). Art comes from the manifest. Alliance, Friends, Settings and Codex load lazily (`ui/lazyPanel.ts`). |
| 27 | Profile in release | NEEDS-DEVICE | `tools/perf/lowend.mjs` and `profile.mjs` exist but were not run (no Playwright, no device). |
| 28 | Storage full | PASS | A failed save is shown at most once a minute with advice to free storage (`main.ts:938-960`, `locales/en/messages.json:1669`). A queue the device could not store is told once (`main.ts:368-373`). If IndexedDB does not open in 5 s, the game runs on memory with a banner (backend brief, `persist/idb.ts`). |
| 29 | Permissions denied | PASS (with STB-01 caveat) | Web reminders check the permission (`reminders.ts:22-31`). `pushDevice` returns null when push is refused (`push.ts:25-26`). The game never depends on notifications. |
| 30 | Third-party SDK crashes / kill switches | FAIL | Android push without Firebase config crashes the app natively (STB-01). The only kill switch is the server's `push` feature, which is turned on by APNs alone (`server/core/identity.ts:25`, `server/push/*.ts:199-203`). Sign-in scripts load only on tap (`auth.ts:173,183`). The review prompt is guarded by `isPluginAvailable`. |

## 2. Work items

### STB-01 — Android app crashes (and can crash-loop) when push is enabled without Firebase config
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: backend (`src/backend/platform/push.ts`, `src/backend/net/connection.ts`), ops (`.github/workflows/android.yml`, `tools/release/check-store-ready.mjs`), server (hello features)
- Checklist refs: Checklist "Third-party SDK crashes / kill switches", "Permissions denied"; Masterclass 1 crash discipline
- Evidence (read):
  - `pushDevice()` calls `PushNotifications.register()` on Android once permission is granted (`src/backend/platform/push.ts:25-31`).
  - The plugin's `register` calls `FirebaseMessaging.getInstance()` at once (`node_modules/@capacitor/push-notifications/android/.../PushNotificationsPlugin.java:113-115`). Without `google-services.json` no default `FirebaseApp` exists, and `getInstance()` throws `IllegalStateException` (Firebase behaviour, inferred from the SDK contract).
  - Capacitor rethrows any plugin exception as a `RuntimeException` on its handler thread (`node_modules/@capacitor/android/.../Bridge.java:852-856`, "Serious error executing plugin"). That is an uncaught native exception, which crashes the process.
  - `android/app/build.gradle:67-74` applies google-services only when the file exists. `.github/workflows/android.yml` never writes it (grep `google-services` gives no hits).
  - The server lists `push` whenever any push transport is configured, APNs alone included (`server/core/identity.ts:25` `ctx.push.enabled`; `server/main.ts:239-240`; transport from `APNS_*` or `FCM_*` env).
  - `main.ts:415-418` calls `syncPush` on every reconnect, and `connection.ts:313` calls `device()` whenever reminders are on.
  - Result (inferred, not run on a device): an Android player who turned reminders on crashes every time the game comes online, from the first server where the owner configured APNs (or FCM) and the Android build has no `google-services.json`.
- Fix:
  1. In `src/backend/platform/push.ts` `pushDevice()`, return `null` on Android unless the build says Firebase is configured: `import.meta.env.VITE_ANDROID_PUSH === '1'`. On iOS keep today's path.
  2. Server: list `push-apns` and `push-fcm` separately (`server/core/identity.ts`, from the transports built in `pushTransportFromEnv`), keeping `push` for old games. In `Connection.syncPush` (`connection.ts:300-319`) require `push-fcm` on Android and `push-apns` on iOS when the server lists either. Record the additive hello features in `docs/PROTOCOL.md`.
  3. `.github/workflows/android.yml`: when a secret `GOOGLE_SERVICES_JSON` is set, write it to `android/app/google-services.json` before `npx cap sync android` and set `VITE_ANDROID_PUSH=1` for `npm run build`. Otherwise leave it unset.
  4. `tools/release/check-store-ready.mjs`: add a blocking row when `VITE_ANDROID_PUSH=1` is set but `android/app/google-services.json` is missing.
  5. Wrap the native call in `pushDevice` with an explicit `try/catch` (it already ends in `.catch`) and log once. This guards the JS side only; the native crash is what step 1 prevents.
- Tests: `tests/backend/platform/push.test.ts` (new). Mock `@capacitor/core` `getPlatform()` to `'android'` with `VITE_ANDROID_PUSH` unset. Assert that `pushDevice()` resolves `null` and that `PushNotifications.register` is never called. Extend `tests/backend/release-config.test.ts` to check that the Android workflow sets `VITE_ANDROID_PUSH` only in the step that writes `google-services.json`. Add a server test that hello lists `push-apns` but not `push-fcm` when only `APNS_*` is set.
- Done when: an Android debug APK built without `google-services.json`, with reminders on, against a server with APNs configured, stays up through 10 launches (device check), and the unit test above passes.
- Don't break: notifications off until the player says yes; no push token for under-13 (`connection.ts:306`); protocol changes in `docs/PROTOCOL.md` with contract tests; compartment boundaries (backend owns `platform/`).

### STB-02 — No source maps and one release id for every build, so crash stack traces cannot be read (O-1)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: integration (`vite.config.ts`, `src/main.ts`), ops (`.github/workflows/deploy.yml`, `android.yml`, `ios-testflight.yml`), backend (`src/backend/analytics/sentryEnvelope.ts`)
- Checklist refs: Checklist "source maps uploaded (O-1)", "crash-free rate"; Masterclass 1 crash discipline
- Evidence:
  - (ran) `npm run build` produced no `.map` files, because `vite.config.ts:162-175` sets no `build.sourcemap`.
  - (read) The service-worker plugin already skips `.map` (`vite.config.ts:51`).
  - (read) `main.ts:237` sends `release: kagemura@${__APP_VERSION__}`, and `package.json:4` is `0.1.0`. Every Pages deploy and every native build share that one release, so Sentry cannot match artifacts or separate regressions per build.
  - (grep) No workflow uploads maps.
  - (read) Frames carry minified `filename:line:col` only (`sentryEnvelope.ts:58-66`).
- Fix:
  1. `vite.config.ts`: set `build.sourcemap: 'hidden'`. Maps are written, but the bundles get no `//# sourceMappingURL` comment.
  2. Define a build id in `vite.config.ts`, `__BUILD_ID__ = process.env.GITHUB_SHA?.slice(0, 12) ?? 'local'`. In `main.ts` use `release: kagemura@${__APP_VERSION__}+${__BUILD_ID__}` and add `dist: <platform>` (`web`, `ios`, `android`). This needs a `dist` field in `SentryEventInput` and `buildEnvelope` (`sentryEnvelope.ts:69-118`).
  3. In each of `deploy.yml`, `android.yml` and `ios-testflight.yml`, after `npm run build`: if `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are set, run `npx --yes @sentry/cli@<pinned> sourcemaps upload --release kagemura@<version>+<sha> --dist <platform> --url-prefix '~/assets' dist/assets`. Then always run `find dist -name '*.map' -delete` before the Pages upload and before `npx cap sync`, so maps never ship.
  4. Optionally switch to debug ids: run `sentry-cli sourcemaps inject` and add `debug_meta.images` from `globalThis._sentryDebugIds` in `buildEnvelope`.
  5. Document the owner secrets in `docs/SHIPPING.md`.
- Tests:
  - `tests/backend/analytics/sentryEnvelope.test.ts`: assert that the envelope carries `release` with a `+` build part and `dist`.
  - `tests/backend/release-config.test.ts`: assert that each of the three workflows deletes `*.map` from `dist` before deploy or `cap sync`, and that `vite.config.ts` sets `sourcemap: 'hidden'` (static parse).
  - Device / owner check: throw from `?debug` (`window.tk`) in a deployed build and confirm Sentry shows the original `src/...ts` file and line.
- Done when: a test exception from a deployed web build and from a TestFlight / APK build shows symbolicated TypeScript frames in Sentry, and `dist/` as deployed contains 0 `.map` files.
- Don't break: crash reports stay opt-in and never for under-13 (`crashReportsAllowed`); `sentryEnvelope.ts` adds no player data; npm scripts stay cross-platform (the delete step lives in the workflow, or uses a node script, not bash in `package.json`).

### STB-03 — An uncaught exception in any scene update or render stops the game loop for good (frozen map, no recovery)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: integration (`src/main.ts`), presentation/render
- Checklist refs: Checklist "Global error handlers with context", "Null states"; Masterclass 1 crash discipline
- Evidence (read):
  - Phaser's frame callback runs the game step and only then asks for the next frame (`node_modules/phaser/src/dom/RequestAnimationFrame.js:89-97`). A throw inside `_this.callback(time)` means `requestAnimationFrame` is never called again.
  - `TimeStep.pause` and `resume` do not restart it (`phaser/src/core/TimeStep.js:468-485`). Only `wake()` does (`TimeStep.js:792-811`).
  - Nothing in `src` wraps `game.loop.callback`. `main.ts` has a fatal card only for `boot()` failures (`main.ts:1048-1070`).
  - Result: the DOM HUD stays alive, but the map or battle freezes until a reload. Nothing is told to the player, and nothing is reported unless the player opted in.
- Fix:
  1. In `main.ts`, right after `new Phaser.Game(...)` (`main.ts:435`), wrap the loop. Save `const step = game.loop.callback`, then set `game.loop.callback = (t, d) => { try { step(t, d); } catch (e) { onFrameError(e); } }`.
  2. In `onFrameError`: call `crashReporter?.report(e, { kind: 'frame', scene: activeSceneKey(), battle: String(currentApp()?.inBattle ?? false) })`. Count errors in a 10 s window. Allow up to 3 before acting (the next frame was not scheduled, so call `game.loop.sleep(); game.loop.wake();` to restart the frame callback). On the 4th within 10 s, stop the loop, `await controller.save()`, and show a localized card ("Something went wrong drawing the village", Reload). Reuse the boot error card style and add the strings to `locales/en/ui.json`.
  3. Inside a battle, on the fatal path call `currentApp()?.flushBattle()` before saving, so the pending battle settles as today.
- Tests: `tests/presentation/render/frameGuard.test.ts`. Extract the wrapper as a pure `guardLoop(loop, onError, now)` into `src/presentation/render/frameGuard.ts`. Assert that a throwing callback is caught, `onError` is called, and the loop is restarted (sleep and wake called) for the first 3 errors and stopped on the 4th within 10 s. Device check: in `?debug`, `window.tk` makes the village's `update` throw once, and the map keeps animating.
- Done when: a one-off throw in `VillageScene.update` or `BattleScene.update` leaves the game drawing, and repeated throws show the reload card instead of a frozen canvas.
- Don't break: battle determinism (the guard is presentation only; never re-run sim ticks); `t()` for the new text; crash reports opt-in; boundaries (`render` may not import backend; keep the reporter call in `main.ts`).

### STB-04 — WebView renderer death is unhandled on Android (the app dies) and unrecorded on both platforms (O-2); no unclean-exit signal
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: ops (`android/`, `ios/`), integration (`src/main.ts`), backend (`src/backend/analytics/`)
- Checklist refs: Checklist "Android native or WebView renderer crash path (O-2)", "Low-memory kills", "Crash-free rate"
- Evidence (read):
  - `android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java` registers no `WebViewListener`.
  - Capacitor's `BridgeWebViewClient.onRenderProcessGone` returns `false` unless a listener returns `true` (`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java:92-104`). Android then crashes or kills the whole app (Android API contract for `false`).
  - On iOS, `WebViewDelegationHandler.webViewWebContentProcessDidTerminate` calls `bridge.reset()` and `reload()` (`node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:164-168`). The player sees a restart, and nothing records it.
  - Neither side leaves a marker for the next launch, and the JS side keeps no record of whether the last session ended cleanly (grep `unclean`/`heartbeat` gives no hits).
- Fix:
  1. Android: in `MainActivity.onCreate`, after `super.onCreate`, call `getBridge().addWebViewListener(new WebViewListener() { @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) { ... } })`. In it, write `tk_renderer_gone` = `{ crashed: d.didCrash(), priority: d.rendererPriorityAtExit(), at: now }` to `SharedPreferences`, call `recreate()`, and return `true`.
  2. iOS: in `TkViewController` there is no clean override point for `webViewWebContentProcessDidTerminate`, because it belongs to Capacitor's delegation handler. So write `UserDefaults` `tk_webcontent_gone` from `capacitorDidLoad` by observing a reload, or rely on the JS marker below.
  3. JS (works everywhere): add a small `src/backend/analytics/sessionMarker.ts`. On boot read `tk.session` (`{ visibleBeat, cleanHide }`). While visible, write `visibleBeat = Date.now()` every 10 s. On hide, `pagehide` or `pause`, write `cleanHide = true`. At boot: last `visibleBeat` under 30 s before the last unload and no `cleanHide` means an unclean foreground exit.
  4. Report an unclean exit (and the native markers, read through a tiny `TkDiagnostics` plugin or a `triggerWindowJSEvent` from `MainActivity` after load) as `crashReporter.report(new Error('unclean_exit'), { kind: 'unclean_exit', ... })`. Add an `unclean_exit` stats event to `STATS_EVENTS` (adults who opted in only).
  5. Wrap the localStorage writes in try/catch as everywhere else.
- Tests:
  - `tests/backend/analytics/sessionMarker.test.ts`: a boot with `{ visibleBeat: now - 5_000, cleanHide: false }` reports unclean; a boot with `cleanHide: true` or a beat 10 minutes old does not.
  - `tests/backend/android-native.test.ts`: assert that `MainActivity.java` contains `onRenderProcessGone` returning `true` and `addWebViewListener`.
  - Device: on Android, `adb shell am crash`, or open `chrome://crash` inside the WebView via `webContentsDebuggingEnabled` in a debug build. Expect the app to recreate the activity, not die, and the next boot to report one `unclean_exit`.
- Done when: a killed renderer on Android no longer terminates the app, and both platforms produce exactly one `unclean_exit` event (when opted in) on the next boot.
- Don't break: privacy (only for players who opted in to crash reports or statistics; no ids); saves (the marker lives in its own localStorage key, not in the save); boundaries (`main.ts` is the only place that wires native events).

### STB-05 — Crash reports lack context and a session denominator; crash-free rate cannot be computed
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: backend (`src/backend/analytics/crashReports.ts`, `sentryEnvelope.ts`), integration (`src/main.ts`)
- Checklist refs: Checklist "Crash-free rate", "Global error handlers with context (scene, last action, build, device)"
- Evidence (read):
  - `CrashReporter.report` sends only an `event` item (`crashReports.ts:46-56`, `sentryEnvelope.ts:102-118`). It sends no `session` items, so Sentry release health has no denominator.
  - Tags are only `side`, `device` (`main.ts:240`, OS family from `platformName`, `main.ts:153-159`) and `kind`.
  - The event has no `contexts`: no app build, renderer (`WEBGL`/`CANVAS`), quality profile, active scene, in-battle flag, or last command type.
  - The breadcrumb trail is empty.
- Fix:
  1. Add `contexts` and `tags` providers to `CrashReporterOptions` (`context?(): Record<string, string>`), read at report time. From `main.ts` pass: `scene` (the active Phaser scene key), `battle` (`currentApp()?.inBattle`), `quality` (`quality().profile`), `renderer` (`game.renderer.type === Phaser.CANVAS ? 'canvas' : 'webgl'`), `lastCommand` (the type of the last `controller.onCommand`; a type only, never params), `online` (`connection.status`).
  2. Add `startSession()` and `endSession(status)` to `CrashReporter`. Send a Sentry `session` envelope item (`{ sid, init, started, status, errors, attrs: { release, environment } }`) at boot and on hide, only while `enabled()`. Mark `crashed` when STB-03's fatal path or STB-04's unclean exit fires.
  3. Keep the scrubbing as it is. Never add names, ids or chat.
- Tests: `tests/backend/analytics/crashReports.test.ts`. With `post` captured, assert that `report()` includes the `context()` values as tags, that `startSession` posts a `session` item with the same release, and that nothing is posted while `enabled()` is false.
- Done when: a test error in a deployed build shows scene, battle, quality and renderer in Sentry, and Sentry's release health shows a crash-free sessions percentage for the opted-in population.
- Don't break: privacy (opt-in, never under-13, no player data: Settings' "Send crash reports" text promises this, `src/presentation/CLAUDE.md`); `STATS_EVENTS` stays free of free-text fields.

### STB-06 — WebGL context loss has no player-facing handling, timeout or report
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: presentation/render (`assets.ts` or a new `render/contextLoss.ts`), integration (`src/main.ts`)
- Checklist refs: Checklist "Low-memory kills and WebGL context loss"
- Evidence (read):
  - Phaser's default `dispatchContextLost` stops rendering and calls `preventDefault` (`node_modules/phaser/src/renderer/webgl/WebGLRenderer.js:1021-1033`). Restore rebuilds wrappers and pipelines (`:1044-1111`).
  - The game hooks only `RESTORE_WEBGL`, to repaint released canvases (`src/presentation/render/assets.ts:186-199`). grep `LOSE_WEBGL|contextlost` in `src` gives 0 hits.
  - If a mobile browser never restores the context (common under memory pressure, inferred), the canvas stays black with the HUD over it, no message, no report and no way back short of a manual reload.
- Fix:
  1. Add `src/presentation/render/contextLoss.ts` with `watchContext(game, { onLost, onRestored, onStuck })`. On `Phaser.Renderer.Events.LOSE_WEBGL` start an 8 s timer while `document.visibilityState === 'visible'`. Pause the timer while hidden. On `RESTORE_WEBGL` clear it.
  2. In `main.ts`, `onStuck`: save, then show a localized card ("The graphics stopped. Reload to continue", Reload calls `location.reload()`), with strings in `locales/en/ui.json`. `onLost`: call `crashReporter.report(new Error('webgl_context_lost'), { kind: 'webgl' })` and `trimTextureCaches`.
  3. Count restores and losses in the opt-in stats (`STATS_EVENTS` `webgl_lost`, no free text).
- Tests: `tests/presentation/render/contextLoss.test.ts` with a fake renderer emitter and fake timers. LOSE then 8 s visible calls `onStuck`. LOSE then RESTORE at 3 s does not. LOSE while hidden for 60 s, then visible for 7 s, does not. Device / browser check: `game.renderer.gl.getExtension('WEBGL_lose_context').loseContext()` in `?debug` shows the card after 8 s if `restoreContext()` is not called.
- Done when: a lost context that never returns shows the reload card within 10 s of being visible, and a restored one keeps playing with the island and scenery repainted.
- Don't break: `t()` for the text; the boundary rule that `render/` imports no backend (the reporter call stays in `main.ts`); never read pixels from released canvases.

### STB-07 — First-use painting causes stutter at battle open and in the middle of a battle
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE (with a DEVICE measurement)
- Compartment: presentation/render (`BattleScene.ts`, `assets.ts`, `fx.ts`), integration (`src/app.ts` scout flow)
- Checklist refs: Checklist "Shader/first-use stutter", "GC spikes", "Performance worst-device target"
- Evidence (read):
  - `BattleScene.create` makes every building view synchronously (`BattleScene.ts:239`). Each one calls `buildingTexture` (`BattleScene.ts:590`), which paints any never-seen type × level on the spot (`assets.ts` `buildingTexture` → `paintLevel`: canvas paint plus GPU upload).
  - Scouting a base at another Keep can need dozens of new looks in one frame.
  - Ruins are painted the first time a building family and size is destroyed, inside `update()` (`BattleScene.ts:1108` → `fx.ts:301-305` `ruinTexture` → `paintArtTexture`).
  - Thumbnails are still a synchronous `toDataURL('image/png')` (`assets.ts:323-340`), already a known limit (2026-11-13 F11).
  - None of this has been measured on a phone.
- Fix:
  1. Add `prepareBattleTextures(scene, base, onSlice)` in `assets.ts`, reusing `prepareTextures`' slice pattern (`assets.ts:436-588`). It paints every `(type, level, size)` in the base plus each `ruinTexture(size, ruinFamily(kind, type))` the base can produce, in slices of about 8 ms.
  2. Run it while the scout drawer is open, from `BattleScene.create` before the opening glide, or via `app.ts` before `sm.start('battle', init)`. Keep the textures held (`holdBuildingTextures`) so the budget does not evict them before use.
  3. Paint ruins up front for the base's families, so `update()` never paints.
  4. (Optional) Encode thumbnails lazily for visible rows with `toBlob` (async) instead of `toDataURL`.
- Tests:
  - `tests/presentation/render/battlePrepaint.test.ts`: given a base, the list of keys `prepareBattleTextures` will paint includes every building level key and every ruin key the base can produce (pure key planner `battleTextureKeys(base)`).
  - Device check: `npm run perf:lowend -- --quality` (or Chrome tracing on a cheap Android). Scout a base two Keeps above the village. Before: record the longest task at battle open and the frame time at the first ruin. After: longest task under 100 ms and no frame over 50 ms at the first destruction.
- Done when: on the emulated low profile (CPU ×4) battle open has no long task over 100 ms and the first destruction drops no frame over 50 ms, confirmed once on a physical cheap Android.
- Don't break: texture budget invariants ("a new image built from a painted key must be in its scene's held set"); `phaserBuild.js` (no new Phaser namespaces without adding them); battle determinism (render only).

### STB-08 — First paint waits on a 193 KB inline boot script with every language's boot strings
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: integration (`vite.config.ts` `bootGuard`), localization tooling (`tools/i18n/build.mjs` `languageBootScript`), backend (`src/backend/pwa/boot.js`)
- Checklist refs: Checklist "Cold start", "Load time to playable", "Bundle and install size"
- Evidence:
  - (ran) `dist/index.html` is 199 KB raw and 53 KB gzip. Its first inline script is 192,839 bytes, and its `tables` object holds 50 languages × 29 keys = 124,673 bytes (measured with node on the built file).
  - (read) `tools/i18n/build.mjs:57-72` inlines boot strings for every ready language, plus every `main.ts` string after line 780 (`mainKeys` chosen by source line number: `s.line >= 780`, which breaks as soon as that file shifts).
  - (read) `vite.config.ts:85-93` injects it `head-prepend`, so it blocks first paint.
  - (inferred) 53 KB gzip is about 1.8 s at the 240 kbps profile the 2026-11-13 record used, before the splash can paint, on every first visit (later visits come from the service worker cache).
- Fix:
  1. In `languageBootScript()`, inline only `en` plus the 17 `boot.*` keys per language (the strings needed if the module never arrives). Move the `main.ts` error-card strings (`mainKeys`) out of the head script: once the module runs, the language pack (or English) is available through `t()`.
  2. Replace the line-number heuristic with an explicit list (for example a `boot: true` marker or a named set in `locales/`), so moving code in `main.ts` cannot silently drop or add strings.
  3. Optional: emit the per-language boot table as `lang/boot-<code>.json`, precached, and inline only the matcher plus English.
- Tests: `tests/locales/boot-script.test.ts`. Assert that `languageBootScript().length < 60_000`, that every ready language still has `boot.loading`, `boot.failureTitle` and `boot.retry`, and that no key outside the explicit list is inlined. Browser check: FCP on the 240 kbps / 840 ms RTT / CPU ×6 profile improves against the current build (`npm run perf:lowend`).
- Done when: `index.html` is under 25 KB gzip, the boot guard still shows translated "Couldn't load" text in every ready language with the module blocked, and the FCP regression test (or perf run) records the gain.
- Don't break: `boot.js` stays ES5; the boot guard must work when the module never downloads; `t()` and catalog rules (`npm run i18n:extract && npm run i18n:sync`); the localization compartment owns `tools/i18n/` (coordinate through `locales/CLAUDE.md`).

### STB-09 — Lifecycle gaps: network timers run while hidden, Capacitor `pause` path is incomplete, iOS "interrupted" audio is never resumed
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: backend (`src/backend/net/connection.ts`), integration (`src/main.ts`), presentation/audio (`src/presentation/audio/sound.ts`)
- Checklist refs: Checklist "Resume from background; pause stops timers, audio, rendering and network polling", "Background throttling", "Thermal/battery"
- Evidence (read):
  - `Connection.start` sets intervals for `sync` (60 s), `uploadBase` (120 s) and the village flush (15 s), with no visibility check (`connection.ts:1005-1008`). `sync()` and `uploadBase()` do not check it either (`connection.ts:1056-1064`, `1205-1213`). A desktop tab left in the background keeps calling the server.
  - In the apps, `goingAway` on Capacitor `pause` (`main.ts:927-931`) saves and flushes, but does not `sound.suspend(true)` and does not schedule device reminders. Those happen only on `visibilitychange` (`main.ts:905-921`), and the code itself says the WebView may stay "visible" while paused (`main.ts:927`).
  - Nothing listens for `appStateChange` or `resume`.
  - `sound.unlock()` resumes only when `state === 'suspended'` (`sound.ts:95`). Safari's `interrupted` state, after a call or Siri (inferred from WebKit behaviour), is not resumed on the next tap.
- Fix:
  1. `connection.ts`: in the three interval callbacks, return early when `typeof document !== 'undefined' && document.visibilityState === 'hidden'`, except the flush that `goingAway` triggers explicitly. The existing `syncSoon` on visible already catches up.
  2. `main.ts` `installLifecycle`: move the "hidden" branch (sound suspend, `uploadBase`, reminder planning) into a `wentToBackground()` function. Call it from `visibilitychange` hidden and from Capacitor `pause`, deduplicated by the existing `leftAt` window. Add `CapApp.addListener('resume', ...)` that mirrors the visible branch (cancel reminders, save, `sound.suspend(false)`).
  3. `sound.ts` `unlock()`: `if (this.ctx.state !== 'running') void this.ctx.resume();`.
- Tests:
  - `tests/backend/net/connection-hidden.test.ts`: with fake timers and `document.visibilityState = 'hidden'`, advancing 5 minutes makes no `hello`, `sync` or `uploadBase` calls on the port; switching visible triggers one sync.
  - `tests/presentation/audio/music.test.ts`: a context in state `'interrupted'` is resumed by `unlock()`.
- Done when: a hidden desktop tab makes no periodic server calls, and on iOS a paused app has its reminders scheduled and its audio suspended even when `visibilitychange` does not fire (device check).
- Don't break: GLOBAL-010 (the hide, pagehide and pause flush of waiting actions must stay); notifications off until the player says yes; one writer per village (the save on return still runs).

### STB-10 — No size budget gate for the shipped bundle
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: integration (tests, `vite.config.ts`)
- Checklist refs: Checklist "Bundle and install size", "Load time to playable"
- Evidence:
  - (ran) Critical path today is about 723 KB gzip. Entry chunk 561.6 KB raw / 183.8 KB gzip, `phaser` 175.5 KB, `defineProperty` 114.9 KB, `communityRules` 51.2 KB, `keep` 47.4 KB, `index.html` 53 KB, CSS 17 KB, plus fonts.
  - (read) `chunkSizeWarningLimit: 1200` (`vite.config.ts:166`) never fires at these sizes.
  - (grep) No test fails when the entry or preload set grows. `tests/architecture/code-split.test.ts` checks only what is lazy.
- Fix:
  1. Add `tools/perf/bundle-budget.mjs`. It reads `dist/index.html`, follows the entry script and `modulepreload` links, gzips each (level 9), and fails if the total is over a budget (start at 740 KB gzip) or if `index.html` is over 60 KB gzip (25 KB after STB-08).
  2. Run it in CI after `npm run build` (`deploy.yml`, `android.yml`). Use a node script, not bash.
  3. Record the measured numbers in `docs/STATUS.md` through `npm run status` if that generator takes them.
- Tests: the script itself is the gate. Add `tests/architecture/bundle-budget.test.ts`, which runs the planner on a fixture `index.html` and asserts that it follows `modulepreload` links and sums sizes.
- Done when: CI fails on a commit that adds 20 KB gzip to the critical path.
- Don't break: cross-platform npm scripts; the Phaser chunk split (`vite.config.ts:167-171`).

### STB-11 — Device evidence for stability and performance is still missing (R03, R08)
- Severity: HIGH
- Status: NEEDS-DEVICE
- Kind: DEVICE
- Compartment: ops (devices), presentation/render
- Checklist refs: Checklist "Cold start", "Worst-device target", "Thermal/battery", "Low-memory kills", "Profile in release", "Load time to playable"; Risks R03, R08
- Evidence: every number in the 2026-11-13 runtime record is Chromium headless with SwiftShader and CPU throttling, which is not a physical-device result (`docs/store/WORLDWIDE_AUDIT.md` lines 574-576). This audit ran no browser and no device.
- Fix (device protocol, release builds only, not `?debug`):
  1. Devices: a cheap Android (2-3 GB, Android 10-12, Go-class GPU), a Pixel 7, an iPhone SE 2/3 (iOS 15-17), a current iPhone.
  2. For each device: cold start to the village's first frame (Wi-Fi and 3G); time to playable; 30 minutes of mixed play (scout 10 bases at other Keeps, 5 battles, 3 replays, a Trial, the Build menu). Record GPU/JS memory (Android `dumpsys meminfo`, Xcode Instruments) every 5 minutes, the drawn FPS (HUD readout), battery drop and device temperature.
  3. Force-quit mid-battle, mid-purchase (sandbox) and mid-save, and record what survives.
  4. Background the app for 10 minutes and for 12 hours, then resume.
  5. Turn notifications off at the OS level.
  6. Fill storage to under 50 MB free.
  7. Run `adb shell am send-trim-memory <pkg> RUNNING_CRITICAL`, and trigger a WebView renderer kill (STB-04).
- Tests: the protocol above, written to `docs/audit/devices/<date>-<device>.md` with raw numbers.
- Done when: every device completes 30 minutes with no crash, reload or blank canvas; memory stays under the platform's kill line with margin; battle drawn FPS ≥ 25 on low; cold start on 3G under 30 s; results recorded.
- Don't break: none (measurement only). Do not lower quality or iOS/Android minimums without this evidence (R08).

### STB-12 — Crash-reporting operations are owner decisions: default opt-in, Sentry project, console vitals
- Severity: MEDIUM
- Status: OWNER
- Kind: OWNER
- Compartment: ops
- Checklist refs: Checklist "Crash-free rate measurement possible?", "Third-party SDK kill switches"
- Evidence (read):
  - Crash reports are off until the player switches them on (`prefs.ts:10`) and are never sent for under-13 players (`crashReports.ts:27-29`). So a crash on the very first launch (`main.ts:1051`) is never reported.
  - The DSN is a repository variable (`deploy.yml:55`). No Sentry auth token exists for map upload (STB-02).
  - The native crash data in Play Console Android vitals and App Store Connect is the only measurement that covers all users, and it needs live listings (owner).
- Fix (owner):
  1. Create the Sentry project; set `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`.
  2. With counsel, decide whether crash reports may default on for adults in each market (no personal data, legitimate interest) or stay opt-in, and update the Settings text and privacy policy to match.
  3. Watch Play Console's crash and ANR rate and App Store Connect crashes per release.
  4. Keep the DSN revocable as the remote kill switch for client reporting (revoking it in Sentry stops ingestion).
- Tests: none (owner). Verify one opted-in test crash per platform reaches Sentry.
- Done when: the owner has recorded the decision and secrets in `docs/SHIPPING.md`, and a crash-free percentage is visible per release in at least one console.
- Don't break: the privacy invariant (crash reports opt-in unless counsel decides otherwise; never for under-13).

## 3. Verified sound

- **Texture memory (F1):** an LRU budget with per-scene holders (`src/presentation/render/textureBudget.ts:15-95`). Battle hold and release (`BattleScene.ts:242-246`). Low-memory trim on hide, `pagehide`, `pause` and `tkmemorywarning` (`main.ts:893-904`). Under WebGL the island and scenery CPU canvases are released after upload, with a repaint on a restored context (`assets.ts:176-199`). Tint copies are removed on battle shutdown (`BattleScene.ts:245`).
- **Scene cleanup:** no `RenderTexture`/`DynamicTexture` anywhere in `src/presentation` (grep), so a context restore loses no drawn content. Scene input listeners, tweens and timers belong to the scene and are cleared by Phaser on shutdown. The global listeners on scale, window and game are removed (`BattleScene.ts:261`, `cameraControl.ts:45`, `touchInput.ts:29`).
- **HUD listeners:** every modal-scoped interval and subscription is cleared in its modal's `onClose` (`armyUi.ts:245-249`, `groveUi.ts:128-133`). The battle HUD removes its `keydown` and interval (`battleHud.ts:276-277`). The Settings server block disconnects its observer when detached (`hud.ts:965-971`).
- **Audio (F9/F18):** no `AudioContext` while all sound is off. The music scheduler runs only while audible and visible. The context is suspended on hide (`sound.ts:71-160`, `438-457`).
- **Frame pacing (F2):** drawn-frame meter, refresh measured at start, 120 Hz high limited to 60, idle 20 FPS, 10 FPS under a dialog, and a live 30 FPS downgrade after slow battles (`frameRate.ts`, `main.ts:983-1020`, `quality.ts:270-288`). The slow-battles message is now localized (`quality.ts:288`, `t('quality.slowBattles')`), which fixes the 2026-11-13 "Also noticed".
- **Battle timing:** real-time stepping caps each frame's delta at 250 ms (`battleSession.ts:77`), so a resume after a long pause cannot fast-forward a battle. The sim stays a fixed 10 ticks/s.
- **Persistence:** atomic IndexedDB save with a revision check (`saveStore.ts:112-133`). Damaged-save backups are capped at 5. Save failures are shown to the player (`main.ts:938-960`). The queue-storage problem is told once (`main.ts:368-373`).
- **Boot resilience:** `boot.js` catches script download failures and pre-start errors and rejections (`boot.js:380-419`). `boot()` failures show a card built with `textContent` and are reported (`main.ts:1048-1070`).
- **Polling:** Alliance chat polling pauses while hidden and catches up once visible (`groveSource.ts:339-425`).
- **Notifications denied:** web and native reminders and server push all degrade to "no notifications" without blocking play (`reminders.ts:22-31`, `native.ts:21-24`, `push.ts:25-26`). The only exception is the Android Firebase path in STB-01.
- **Division safety in the HUD:** progress widths divide by `Math.max(1, …)` or are guarded by a count check (`hud.ts:570,1448,1457,1716,1814`; `armyUi.ts:229,258`; `battleHud.ts:743,954`). The unguarded ones cannot throw.
- **Tests run here:** 15 render and audio test files, 66 tests, all pass, including `memoryPressure.test.ts`, `textureBudget.test.ts`, `frameRate.test.ts` and `music.test.ts`. `npm run build` passes.
