# Native shells and store binaries: new findings

Lens: `android/`, `ios/`, `capacitor.config.ts`, the custom Java and Swift plugins, the JS bridges in
`src/backend/platform` and `src/backend/payments`, and `android.yml` / `ios-testflight.yml` as far as they shape
the binary. Repository at commit `4b79711`.

**Method and limits.** Static review only ("source only" throughout): no Xcode, Gradle, emulator or device was
available, and nothing was compiled or run on a phone. Capacitor behaviour was read from the installed sources
(`node_modules/@capacitor/*` 8.6.0 and the plugins); the built web bundle in `dist/` was scanned with grep. Each
finding was checked against the known lists (the five owner documents, `docs/store/WORLDWIDE_AUDIT.md`,
`docs/audit/**`, both Beast Mode prompts, `docs/history/AUDIT_TABLES.md`, `docs/DECISIONS.md`, `docs/SHIPPING.md`,
`docs/store/*.md`) by symbol, file name and keyword. No tracked file was changed; `git status` is clean.

The review was cut short by a usage limit. What was not reached is listed at the end of section 3.

## 1. Ranked table

| ID | Severity | Confidence | Title |
|---|---|---|---|
| NAT-1 | HIGH | high | iOS privacy manifest declares no required-reason API, but the app's own Swift uses `UserDefaults` |
| NAT-2 | MEDIUM | high | The old-WebView gate (device F12, recorded fixed) does not work: `minWebViewVersion` is a no-op here, and the boot guard's syntax probe is blocked by the build's own CSP |
| NAT-3 | MEDIUM | medium | A dead WebView renderer rebuilds the activity at once, every time, with no limit, back-off or foreground check; each rebuild leaks a `BillingClient` |
| NAT-4 | MEDIUM | high | `MainActivity.onCreate` uses `getBridge()` without a null check: Capacitor's "no WebView" screen becomes a crash on launch |
| NAT-5 | LOW | medium | WebView 80 to 87 passes every gate, but the bundle needs 85 (JS) and 87 to 88 (CSS) |
| NAT-6 | LOW | medium | `onTrimMemory` waits for levels Android 14 and later no longer send, so the F19 memory signal never fires in the foreground on new phones |
| NAT-7 | LOW | high | The iOS Keychain token survives deleting the app: a reinstall is silently signed in to the old account |
| NAT-8 | LOW | high | Android reminders show the system "(i)" icon: no `smallIcon` is configured and `res/` has no notification drawable |

## 2. Findings

### NAT-1 (HIGH, confidence high): privacy manifest does not declare `UserDefaults`

- **Where:** `ios/App/App/TkNativePlugin.swift:24` and `:30` (`UserDefaults.standard` in
  `noteContentProcessExit` and `lastRendererExit`); `ios/App/App/PrivacyInfo.xcprivacy:5` (comment: "No
  required-reason API is used by the app's own Swift today") and `:112-113` (`NSPrivacyAccessedAPITypes` is an
  empty array).
- **Status in the known lists: closed but still broken.** Beast Mode OPS-03 and OPS-10 state the condition
  themselves ("If UserDefaults is used, declare reason CA92.1 in the PrivacyInfo of OPS-10",
  `docs/prompts/BEAST_MODE_2026-11-21.md:2558`, `:2807`). OPS-03's iOS half then added `UserDefaults`, and
  OPS-10 is recorded as code done with only the Xcode privacy report left to the owner
  (`docs/store/WORLDWIDE_AUDIT.md:1442`, `docs/audit/bulletproof-2026-11-21/PROGRESS.md:60`). The manifest was
  never updated.
- **Failure:** `UserDefaults` is one of Apple's required-reason APIs. The first TestFlight upload is flagged
  ITMS-91053 (missing API declaration) for `NSPrivacyAccessedAPICategoryUserDefaults`; Apple has said since
  May 2024 that such uploads are not accepted. The owner sees this on the very first run of
  `ios-testflight.yml`, which has never run.
- **How checked:** read both files; grep of `ios/App/App/*.swift` for required-reason APIs (only these two
  hits); grep of the five npm plugins' Swift (none); `tests/backend/release-config.test.ts:377-417` checks
  collected data types only, never accessed APIs.
- **Fix:** add `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1` to the manifest and correct the
  comment. Add a test that greps the app's Swift for required-reason APIs and requires a matching entry.
- **Not verified:** how App Store Connect treats the upload today (rejection or warning mail); no Xcode
  privacy report was generated.

### NAT-2 (MEDIUM, confidence high): the old-WebView gate is ineffective

- **Where:** `capacitor.config.ts:26-27`; `src/backend/pwa/boot.js:135-138` and `:419`;
  `tools/release/csp.mjs:28`; `vite.config.ts:138`.
- **Status in the known lists: closed but still broken.** Device F12 is "fixed (`52d2755`)":
  "`android.minWebViewVersion: 80`; in the app the guard names Android System WebView"
  (`docs/store/WORLDWIDE_AUDIT.md:592`). Both halves fail:
  1. `minWebViewVersion` does nothing in this project. Capacitor only shows a page when `server.errorPath` is
     configured; otherwise it logs "System WebView is not supported" and loads the app anyway
     (`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java:305-313`,
     `getErrorUrl` at `:553-566`). The config has no `server.errorPath`, so the comment at
     `capacitor.config.ts:26` ("Capacitor shows its own update page") is wrong.
  2. The boot guard detects `?.` and `??` with `new Function(...)` and counts only a `SyntaxError`
     (`boot.js:135-138`). Since SEC-10 the built page carries a CSP `<meta>` with no `'unsafe-eval'`, placed
     before the guard (in `dist/index.html` the policy is at offset 64, the guard at 18154). Under that policy
     `new Function` throws `EvalError`, which the guard deliberately ignores. The probe can no longer fire in
     any production build, web included.
- **Failure:** on an Android 7 to 9 phone whose WebView is 61 to 79, both gates pass. The module then fails to
  parse, and the guard shows the generic card "Couldn't load Kagemura. Check your connection and try again"
  with Retry (`boot.js:419`), which loops. The player is never told to update Android System WebView.
- **How checked:** read the Capacitor source, the guard, the CSP builder and the built `dist/index.html`.
  No test runs the guard under the policy (`tests/backend/csp.test.ts` checks hashes only).
- **Fix:** set `server.errorPath` to a small ES5 page that names Android System WebView, or probe without
  `eval` (for example treat a module `SyntaxError` before `__tkStarted` as "unsupported" in the app). Correct
  the config comment and the F12 record.
- **Not verified:** not run on an old WebView.

### NAT-3 (MEDIUM, confidence medium): unbounded, immediate activity rebuild on renderer death

- **Where:** `android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java:27-39` (`recreate()` at
  `:37`); `TkBillingPlugin.java:61-67` (client built in `load()`, no `handleOnDestroy`, no `endConnection`
  anywhere); `src/main.ts:344` (the game reads and clears the native counter at every start).
- **Known lists:** OPS-03 / STB-04 record the recreate as the fix; nothing mentions a loop, a back-off, the
  background case or the billing client.
- **Failure scenarios:**
  - *Renderer that crashes at start* (for example a GPU driver fault during WebGL set-up on one cheap chipset):
    `didCrash()` is true, the activity is rebuilt, the page loads and crashes again, without end. The player
    sees the splash restart forever and never an error; because the app process no longer dies, the store's
    crash statistics do not show it either. `rendererGoneCount` cannot stop it: nothing native reads it and
    the game clears it at each start.
  - *Renderer killed while the game is in the background* (the usual low-memory case on a 2 GB phone):
    `recreate()` runs at once, so the whole game loads again while hidden, taking back the memory the system
    just reclaimed.
  - Each rebuild loads a new `TkBillingPlugin` with a new `BillingClient`; the old one is never closed and
    keeps the old activity reachable through its listener.
- **How checked:** read `MainActivity.java`, `TkBillingPlugin.java`, Capacitor's
  `BridgeWebViewClient.java:92-104` and `Bridge.java:1397-1415`.
- **Fix:** when the activity is not started, destroy the WebView and rebuild on the next `onStart`. Count
  rebuilds natively (for example three within a minute) and then show a native "could not start" view with
  Retry, or let the process die. Add `handleOnDestroy() { client.endConnection(); }` to `TkBillingPlugin`.
- **Not verified:** how often either scenario happens, and the lifecycle of a relaunch in the background on a
  real device.

### NAT-4 (MEDIUM, confidence high on the code path): launch crash when the WebView cannot be created

- **Where:** `MainActivity.java:27` (`getBridge().addWebViewListener(...)`, no null check; `onTrimMemory` at
  `:53` does check).
- **Why:** `BridgeActivity.onCreate` catches a failed `setContentView`, shows its `no_webview` layout and
  returns before the bridge exists (`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java:27-32`).
  `getBridge()` is then null.
- **Failure:** the WebView package is missing, disabled or being updated by Google Play when the player opens
  the game (a well-known Android failure class). Capacitor would show its "no WebView" screen; this app throws
  a `NullPointerException` in `onCreate` and closes. It appears as a launch crash in Play vitals. The line was
  added by OPS-03, whose aim was fewer crashes.
- **How checked:** read both files. Not in the known lists (grep for `no_webview`, `MissingWebViewPackage`,
  `getBridge()`).
- **Fix:** `if (getBridge() == null) return;` before adding the listener.
- **Not verified:** how often the WebView is unavailable at launch on the target phones.

### NAT-5 (LOW, confidence medium): the declared minimum WebView (80) is below what the bundle needs

- **Where:** `capacitor.config.ts:27`; `src/presentation/ui/groveUi.ts:209` (`String.prototype.replaceAll`,
  Chrome 85, not among the polyfills in `boot.js:36-125`); `src/presentation/ui/styles.css:973-1016` (`:is()`,
  Chrome 88; 14 rules in source, 31 uses in `dist`), `:127` and `:145` (`padding-inline` / `padding-block`
  shorthands, Chrome 87; 33 uses in `dist`); `src/backend/pwa/boot.js:186` (`inset:0`, Chrome 87, in the
  guard's own overlay).
- **Status in the known lists: recorded as sound, no longer true.** F22 says "the browser-API surface is
  genuinely iOS 15 / Chrome 80 safe" (`docs/audit/areas/01-hardware-and-runtime.md:72-73, 91`). These uses are
  later or were missed. `build.target: 'es2020'` lowers syntax only, not APIs or CSS.
- **Failure:** on WebView 80 to 84 the offline Alliance panel throws a `TypeError` when it renders a system
  line. On 80 to 86 or 87 the resource chips lose their padding, the non-Latin line-height and weight rules are
  dropped whole, and the guard's own error overlay does not cover the screen.
- **How checked:** grep of `src/` and of the built `dist/assets`.
- **Fix:** raise the floor to 88 together with the NAT-2 fix, or polyfill `replaceAll` and avoid `:is()` and
  the logical shorthands.
- **Not verified:** the share of target phones on WebView 80 to 87; not rendered on such a WebView.

### NAT-6 (LOW, confidence medium): the memory warning does not reach the game on Android 14+

- **Where:** `MainActivity.java:48-54`.
- **Status in the known lists: closed, partly ineffective.** F19 is "fixed in code" with "native code not
  compiled or run" (`docs/store/WORLDWIDE_AUDIT.md:596`).
- **Why:** the Android reference marks `TRIM_MEMORY_RUNNING_LOW`, `RUNNING_CRITICAL`, `RUNNING_MODERATE`,
  `MODERATE` and `COMPLETE` as no longer delivered since API 34. Only `UI_HIDDEN` and `BACKGROUND` remain, and
  the code ignores `UI_HIDDEN`. The game already trims its art on hide and pause, so on Android 14 and later
  the native hook adds nothing while the game is on screen.
- **Failure:** on a new 2 to 3 GB phone (Android 14 or 15 Go) memory pressure during play sends no
  `tkmemorywarning`; the renderer is killed instead (and then NAT-3 applies).
- **Fix:** also override `onLowMemory()`, and poll `ActivityManager.getMemoryInfo().lowMemory` on a slow timer
  while resumed.
- **Not verified:** stated from the platform documentation as I recall it; not observed on a device.

### NAT-7 (LOW, confidence high): the Keychain token outlives the app

- **Where:** `ios/App/App/TkSecureStorePlugin.swift:59-63` (item added under service `kagemura.tokens`);
  `src/backend/platform/secureTokens.ts:26-37` (read at every boot). Nothing clears the service on a first run.
- **Known lists:** SEC-11 covers backups to another iPhone only. SAV-15's device test expects "no link, delete
  and reinstall, expect a fresh village".
- **Failure:** iOS keeps Keychain items when an app is deleted. After a reinstall on the same iPhone the game
  is still signed in to the old online account and adopts its server-held village
  (`src/backend/net/villageSync.ts:302-312`). A player who deleted the game to start over, or the next user of
  a phone that was handed on without a reset, gets the previous account: name, friends, Gang, purchase history
  and the delete-account button. Android removes everything on uninstall, so the platforms differ, and the
  SAV-15 test would fail as written.
- **Fix:** keep a "first run" flag in `UserDefaults` (which is removed with the app); when it is absent, delete
  the Keychain service before reading it. If the automatic restore is wanted instead, record that decision and
  correct the SAV-15 expectation.
- **Not verified:** not run on a device.

### NAT-8 (LOW, confidence high): generic notification icon on Android

- **Where:** `capacitor.config.ts:30-32` (only `iconColor`); `src/backend/platform/native.ts:31-35` (no
  `smallIcon` per reminder); no notification drawable under `android/app/src/main/res` (only `splash.png` and
  the two unused template launcher vectors).
- **Why:** the plugin falls back to `android.R.drawable.ic_dialog_info`
  (`node_modules/@capacitor/local-notifications/android/src/main/kotlin/com/capacitorjs/plugins/localnotifications/LocalNotificationManager.kt:490-498`).
- **Failure:** every reminder appears in the status bar and shade with the system "(i)" glyph tinted red, not
  the game's mark. Server push on Android has no `default_notification_icon` either.
- **Fix:** add a white, single-colour `ic_stat_kagemura` drawable, set `plugins.LocalNotifications.smallIcon`,
  and add the Firebase `default_notification_icon` meta-data.
- **Not verified:** not seen on a device. Not in the known lists (grep for `smallIcon`, `ic_stat`,
  `ic_dialog_info`, "notification icon").

## 3. Checked and found sound (source only)

- **Save origin on update:** no `server.url`, `hostname`, `androidScheme`, `iosScheme`, cleartext or
  `allowNavigation`. The origins stay Capacitor's defaults and do not depend on `APP_ID`, so an update keeps
  IndexedDB and localStorage.
- **Android backup:** `backup_rules.xml` and `data_extraction_rules.xml` exclude localStorage, session storage
  and cookies for cloud backup and device transfer on both API ranges; tokens are only in localStorage there.
- **iOS token storage:** Keychain items are `AfterFirstUnlockThisDeviceOnly` and not synchronizable.
- **Play Billing plugin:** pending purchases enabled, automatic reconnection, the single purchase slot is
  claimed atomically, PENDING is reported and delivered later through a retained event, `unfinished` lists
  only PURCHASED, consume treats "not owned" as done, `obfuscatedAccountId` is the server's UUID.
- **StoreKit plugin:** nothing is finished before the game says so, `Transaction.updates` is listened to before
  delivery starts, revoked and unverified transactions are skipped, `.pending` is reported, `appAccountToken`
  is a UUID.
- **Manifest and Gradle:** only `MainActivity` is exported; `SCHEDULE_EXACT_ALARM` removal is safe (the plugin
  checks `canScheduleExactAlarms`); minSdk 24, target and compile 36; minify off, so no keep rules are needed;
  no native libraries from the listed dependencies (the workflow lists any); `gradlew` is executable.
- **iOS project:** all five plugin files are in the Sources phase and `PrivacyInfo.xcprivacy` in Resources;
  export-compliance key present; Game Center usage string present and localized; `SceneDelegate` matches the
  Capacitor 8.6 template; the Capacitor notification names used in `AppDelegate` exist.
- **Other:** icons and splash are the game's own on both platforms; the service worker is not registered in
  the apps (`src/main.ts:1009`); Android Back uses `OnBackPressedCallback` (safe with predictive back);
  edge-to-edge is handled by Capacitor's SystemBars and the page has `viewport-fit=cover`.

**Not reached before the cut-off:** `src/backend/platform/auth.ts`, `ageRegulatory.ts`, `achievements.ts` and
`prefs.ts`; `ios/App/Products.storekit`; `tools/release/check-store-ready.mjs` and `check-app-id.mjs`; a
line-by-line compile review of the Swift against the iOS 26 SDK beyond the API names noted above; status-bar
icon contrast on both platforms (left to the system theme; cosmetic, not confirmed).

## 4. Already known, skipped

- A backup restored to another phone registers a new account and imports the village: SAV-15, SEC-11
  (`docs/prompts/BEAST_MODE_2026-11-21.md`, `PROGRESS.md:91`).
- Play multi-quantity purchases: ECO-06 (`docs/SHIPPING.md:164`).
- `strings.xml` `package_name` / `custom_url_scheme` still the legacy id: Beast Mode 2026-11-16 and GLOBAL-017.
- App Links and Universal Links commented out: R09 (`docs/SHIPPING.md` 1c).
- iOS 26.2 age and PermissionKit calls never compiled: `docs/SHIPPING.md` 3l and the plugin's own comments.
- Android push without Firebase: STB-01. System font scale and text size: UX-08. Auto Backup 25 MB: F15.
- Legacy bundle id and owner store steps: PUB-05, `docs/store/OWNER_CHECKLIST.md`.
- `ios-testflight.yml` has never run; Swift not compiled: stated in the workflow and in every closure record.
