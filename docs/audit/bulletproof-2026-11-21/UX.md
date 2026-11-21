# UX lane: input, audio/visual polish, UI/UX, accessibility, localization

Audited commit `560ce7a` (HEAD), 2026-11-21. Read-only. Browser checks used Playwright Chromium against `npx vite --port 5199` in the testing sandbox (`?sandbox&debug`) with touch emulation (`isMobile`, `hasTouch`, DPR 2) at 320×568, 360×640, 568×320, 640×360 and 844×390, in en, de, fi, ta and ar. These are emulation runs, not device tests. The dev server was stopped afterwards. Probe scripts are in `docs/audit/bulletproof-2026-11-21/evidence/ux-probes/` (probe1–6.cjs) and screenshots in `docs/audit/bulletproof-2026-11-21/evidence/shots/`.

**About the earlier labels.** The repository has no record of "I-1…I-4", "N-A", "N-B", "A-1…A-4" or "D-3": they do not appear in `docs/`, the checklist `content.py`, or the audit files. Only the last page of the earlier audit survives. Each label below is mapped from the hint in the brief to the closest finding in current code. Labels marked "(inferred)" are guesses about what the earlier audit meant. The findings themselves were all confirmed against current code or in the browser.

## 1. Verdict table

| Item | Verdict | One-line evidence |
|---|---|---|
| I-1 Paid-action double-tap / in-flight protection | **FAIL** | Two taps on a Store price button before the confirm renders open two "Confirm purchase" dialogs, stacked in the same place. Confirming both made two purchases (probe2b: `purchases 0 → 2`, Jade 500 → 590). No busy guard exists in `economyUi.ts:133-138,179-224` or `controller.ts:329`. Screenshot `360x640-buy-doubletap-two-confirms-sync.jpg` |
| I-1b Jade spends confirmed | PASS | Every Jade spend goes through `EconomyUi.spendMoonstones` (`economyUi.ts:234-244`) and its confirm. The confirm opens synchronously, so a second tap lands on the backdrop and cancels. `confirm()` resolves once (`hud.ts:2607-2609` `closed` flag) |
| I-2 Drag that triggers taps; multitouch, pinch vs pan | PASS | 10 CSS px tap slop (`render/cameraControl.ts:4,147`). A pinch cancels the drag and no tap fires afterwards (`:129-135,169-172`). Stale touch pointers are released (`render/touchInput.ts`). A third finger re-pinches with the first two |
| I-3 PWA / browser back, Android gesture back | **FAIL** (web/PWA); PASS in code (Capacitor Android, NEEDS-DEVICE) | `main.ts:964-978` handles Back only when `isNative() && platform()==='android'`. The web app has no `pushState`/`popstate`. In the browser, `page.goBack()` with the Army dialog open left the game for `about:blank` (probe1 `BACK`). The installed PWA is `display: standalone` (`public/manifest.webmanifest`) |
| I-4 Input in short landscape during battle (inferred) | **FAIL** | At 640×360 and 568×320, once "Speed" appears, the "End battle" button (x 125–237) covers the Smoke Bomb card (x 164–218). A hit test at the card's centre returns `btn danger` (probe6). Cause: `styles.css:817-818`. Screenshot `battle-640-360-640-360.jpg` |
| N-A Screen shake / flash setting, reduced motion | **FAIL** | Camera shakes in `BattleScene.ts:1126,1263` and `fx.ts:320` do not check `prefers-reduced-motion`: 4 shakes were counted with `reducedMotion:'reduce'` emulated (probe4). Settings has no shake, flash or reduce-motion switch (`settingsUi.ts:72-84`; `prefs.ts:2` keys) |
| N-B Audio interruption resume (inferred) | PARTIAL / NEEDS-DEVICE | `sound.ts:95` resumes on a tap only when `state === 'suspended'`. iOS WebKit's `'interrupted'` state (after a call or Siri) is never resumed by a tap. Music and SFX are on/off only, with no volume sliders (`settingsUi.ts:72-84`) |
| A-1 Text scaling / dynamic type | PARTIAL / NEEDS-DEVICE | Type is rem-based (2026-11-13 batch), but there is no in-game text-size control and no `-apple-system-body`/Dynamic Type hook (grep: none). Canvas labels are fixed px (`BattleScene.ts:629,964`). OS text size not tested on phones |
| A-2 Touch targets ≥ 44 px | PARTIAL | Measured: the Builders pill is 72×30 and the Honor pill 53×30 (320/360 px wide), 85×36 / 66×36 at 844×390, with no `::after` hit area. The Keep-unlock chip is 51×32. Battle point chips are 42–43 px wide (probe3). `styles.css:734` gives a hit area only to `.res[role='button']` and news |
| A-3 Colour-blind signals | PASS | Battle role rings (`fx.ts:173-203`) come with a role silhouette per warrior (`art/warriorIcons.ts` `ROLE_STYLE`). Points show a letter and space left. Coin and provisions icons differ in shape and colour (screenshot `360x640-first-launch.jpg`) |
| A-4 Screen-reader labels on menus and purchase flow | **FAIL** (partial) | Store buy buttons are named by price only: `"$0.99 (test)"`…`"$99.99 (test)"` (probe4). The Jade pill, the entry to the Store, is `div role=button` with no `tabindex` and no `aria-label`, so its name is "500+" (`hud.ts:331`). Dialogs are labelled and focus-trapped (`hud.ts:2603-2669`) |
| Zoom disabled in index.html | PASS | `index.html:5` has no `user-scalable=no`, and `touch-action` rules keep pinch for the page. Android WebView pinch-zoom is off by default (inferred, NEEDS-DEVICE) |
| D-3 One-tap destructive actions without confirm/undo (inferred) | PARTIAL | Delete saved army (`armyUi.ts:439-443`) is one tap with no confirm or undo. Everything else destructive has a confirm: dismiss, cancel upgrade/research/training, leave Alliance/Gang, delete account, start over, remove/block friend (grep `confirm(` list) |
| Review prompt (win only) | PASS (LOW gap) | `reviewPrompt.ts:34-40`: needs a win, the tutorial done, ≥ 5 wins and a 120-day gap. It is counted only from "Return home" (`battleHud.ts:883-889`), so wins left through a next-action button are not counted |
| Notifications asked after value, with a pre-prompt | PASS | `hud.ts:481-500`: after the tutorial, once, never over a dialog, with an in-game question before the OS prompt |
| First launch: no pop-up wall; tutorial skippable and replayable | PASS | The first frame is tutorial step 1 with "Skip tutorial", which asks once (`tutorial.ts:185-190`). Settings has "Replay the tutorial" (`settingsUi.ts:117`). Screenshot `360x640-first-launch.jpg` |
| Destructive and paid confirms in general | PASS | See D-3 and I-1 |
| Hard-coded English / Toadstool / TODO in player text | PASS | `text-leaks.test.ts` and `pseudo-locale.test.ts` exist. "toadstool" appears only in internal ids in `locales/*/data.json`. No lorem or TODO in `locales/en/ui.json`. Generated rival names stay Latin by design (checklist 8) |
| Long languages (de, fi, ta) at 320–360 px; RTL (ar) | PASS (emulated) | Village, Store, Army, Settings and battle showed no horizontal overflow and no cut buttons (probe3) |
| Fonts for every script | NEEDS-DEVICE / OWNER | Only Latin subsets ship (`ui/fonts/`). Other scripts use system stacks (`render/fonts.ts`, `styles.css` data-script rules). Coverage of Ethiopic, Odia, Gurmukhi and similar scripts on cheap Android phones needs devices |
| Intl numbers, dates and currency | PASS | `formatNumber`/`fmtDecimal`/`dateText`. Real store prices come from the store. The spending summary uses `Intl.NumberFormat(…, USD)` and is labelled as list prices (`economyUi.ts:28,646-647`) |
| Safe areas, rotation mid-battle | PASS (emulated) / NEEDS-DEVICE | `--safe-*` variables are used throughout `styles.css:61-64`. Battle refits on resize (`BattleScene.ts:260`). Rotating 360×640 → 844×390 mid-battle left nothing off screen (probe5) |
| Interruptions: hidden page | PASS | `battleSession.ts:77` caps the frame delta at 250 ms. Sound is suspended while hidden (`main.ts:905-907`). A raid closed mid-way is resolved from its deployments (`controller.ts:552-595`) |
| Interruptions: iOS Control Center / notification shade | NEEDS-DEVICE | No `blur` handling. The battle clock keeps running while the shade is down (inferred) |
| Mute switch | PASS (native) / NEEDS-DEVICE (Safari) | `ios/App/App/AppDelegate.swift:13` sets `.ambient` with `.mixWithOthers` |
| Music synthesised while muted | PASS | `sound.ts:432-445` runs the scheduler only while music can be heard |
| Settings persist | PASS | Sound `tk.audio`, prefs `tk.pref.*`, quality `tk.quality` and language are kept in localStorage |
| Keyboard / controller | PARTIAL | Battle keys (1-9, S, Esc), modal Tab trap, `:focus-visible` styles. No gamepad (not a target). The Jade pill cannot be reached by keyboard (A-4) |
| Store listing localization | OWNER | Draft listings exist in `docs/store/<code>/` for every language. Native review is an owner step |

## 2. Work items

### UX-01 — Purchase flow has no in-flight guard: double tap = two confirms = two purchases (earlier I-1)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: presentation/ui
- Checklist refs: Checklist 9 (in-app purchase flow); CLAUDE.md "Money and minors" ("a clear confirm on every purchase", "no buy button sits where a stray tap lands"); src/presentation/CLAUDE.md UX rules
- Evidence: `src/presentation/ui/economyUi.ts:133-138` (`buyButton`: a click calls `this.buy()` each time, with no disabled or busy state); `:179-224` (`buy()` awaits `ensureAge()` and `await this.storefront()` at `:210` before the confirm, then awaits `c.purchase()` with no lock and no progress state); `src/gameplay/control/controller.ts:329-359` (`purchase()` has no in-flight check; `verifier.intent()` is a network round trip that reserves the under-18 cap). Browser: probe2b sent two `click()`s on "$0.99 (test)" before the dialog rendered. The result was `["Store","Confirm purchase","Confirm purchase"]`, and confirming both gave `purchases 0 → 2`, Jade 500 → 590. Screenshot `360x640-buy-doubletap-two-confirms-sync.jpg`. A real double tap (probe1) before the age was set opened two "Your age" dialogs. The two confirm dialogs sit at the same position, so a double tap on "Buy for …" confirms both. While the native store or server verification runs (seconds), the Store stays tappable with nothing shown.
- Fix:
  1. In `EconomyUi`, add `private purchasing: string | null = null`. At the top of `buy(productId)`: `if (this.purchasing) return; this.purchasing = productId;`, and clear it in a `finally` around the whole body (age step, confirms and `c.purchase`).
  2. In `buyButton`, set `b.disabled = true` and `aria-busy="true"` on click. Re-enable on the store redraw or in the `finally`. While `purchasing` is set, every `.shop-card .btn` in the open Store shows disabled.
  3. While `c.purchase()` runs, show a non-dismissable in-Store status line, for example a new `t('store.purchasing')` "Completing your purchase…", after 300 ms, in an `aria-live="polite"` region.
  4. In `GameController.purchase` add a defensive `private purchaseInFlight` that returns `{ ok:false, code:'BUSY' }` for a second call. Map `BUSY` to a toast through the existing refusal text (`ui/refusalText.ts`). This touches gameplay/control, so file a request in `docs/game-theory/REQUESTS.md` if the GUI session may not edit it.
  5. In `Hud.confirm`/`modal` (`hud.ts:2593-2670`), ignore footer button clicks in the first ~250 ms after the dialog opens (`openedAt = performance.now()`). This stops a ghost or double tap from confirming. Keep Escape and backdrop-cancel working at once.
- Tests: DOM (happy-dom, `tests/presentation/dom/`): build `EconomyUi` with a mock payments provider whose `purchase` resolves on demand. Click the price button twice synchronously and expect exactly one `.modal` titled "Confirm purchase". Confirm it, click the price button again before `purchase` resolves, and expect no new dialog and `payments.purchase` called once. Unit: `controller.purchase` called twice concurrently returns `BUSY` for the second. Playwright: double `touchscreen.tap` on a price button at 360×640 leaves one confirm.
- Done when: in the sandbox at 360×640, two taps or two `click()`s on any price button within 300 ms give one confirm and at most one purchase, and the Store shows a busy state until the result toast.
- Don't break: real prices only in the Store and its confirm; the under-18 second confirm (`economyUi.ts:215-218`); the cap release on cancel (`controller.ts:345-347`); new text via `t()` with English in `locales/en/ui.json`, then `npm run i18n:extract && npm run i18n:sync`.

### UX-02 — Short landscape: "End battle" covers the Smoke Bomb card once Speed appears (earlier I-4, inferred)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: presentation/ui
- Checklist refs: src/presentation/CLAUDE.md "Measure with Playwright at … 844×390"; Checklist 9 (tap targets); device targets "portrait and landscape"
- Evidence: `src/presentation/ui/styles.css:817-818` (inside `@media (max-height: 480px)`, from `:805`) places `.b-troops` at a fixed `left: calc(158px + var(--safe-l))`. `.b-bottom` holds Speed (103 px) and End battle (112 px), which needs ~237 px. Probe6, practice raid after the squad was sent: at 640×360, `Speed x=12 w=103`, `End battle x=125 w=112`, `Smoke Bomb card x=164 w=54 hitOk=false hitIs="btn danger"`. 568×320 gives the same result. At 360×640 the card is reachable. At 844×390 the Speed button had not yet appeared and the card was reachable; the same overlap is expected once it shows (inferred). Screenshot `battle-640-360-640-360.jpg` (a white card behind End battle). Effect: once every warrior is in, the Smoke Bomb ability, a core raid action, cannot be tapped on landscape phones, and a tap there opens the End battle confirm.
- Fix:
  1. In the `max-height: 480px` block, stop hard-coding `158px`. Either make `.b-bottom` and `.b-troops` one flex row (a wrapper with `display:flex; gap:8px; align-items:flex-end`), or have `battleHud.ts` measure `.b-bottom` with a `ResizeObserver` and set `--b-bottom-w` on `#battle-hud`. Then use `left: calc(var(--b-bottom-w, 150px) + 16px + var(--safe-l))` and `max-width: calc(100% - var(--b-bottom-w) - 16px - 158px - safe…)`.
  2. Or, in short landscape, stack Speed above End battle (`.b-bottom { flex-direction: column; }`) so `.b-bottom` stays ≤ 120 px wide.
  3. Keep `BattleHooks.safeArea` in step: the HUD measures the free area, so re-measure after the Speed button appears (`speedButton()` in `battleHud.ts:586`).
- Tests: Playwright, extending `tools/ui/surfaces.mjs --battle` or a new `tests/e2e`-style script: at 568×320, 640×360 and 844×390, send every warrior (squad order), wait for `[data-id="battle-speed"]`, then for each `.troop-card` assert that `elementFromPoint(center)` is inside the card and that no `.b-bottom button` box intersects a `.troop-card` box. Source test in `store-compliance.test.ts`: no fixed `left: calc(158px` for `.b-troops`.
- Done when: in all three landscape sizes and the two portrait sizes, every troop/ability card passes the hit test before and after the Speed button appears, in en and de (longest "End battle" label).
- Don't break: the bottom bar fits at 320 px; the scout-mode grid (`styles.css:799-801,819-820`); safe areas; toasts and coach line kept free by the fit.

### UX-03 — Web/PWA Back leaves the game instead of closing the top dialog (earlier I-3, "PWA back")
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: integration (main.ts) + presentation/ui
- Checklist refs: Device targets (Pixel 7 Chrome, installable PWA); src/presentation/CLAUDE.md "`Hud.closeTop()` … (Android Back)"
- Evidence: `src/main.ts:963-978` registers `backButton` only for `isNative() && platform() === 'android'`. The web app never calls `history.pushState` and has no `popstate` listener; the only history call is `replaceState` for shortcuts (`hud.ts:257`). Probe1 at 360×640: with the Army dialog open, `page.goBack()` went to `about:blank` (the game unloaded; `history.length` was 2). In an installed `display: standalone` PWA on Android, Back or an edge swipe on the first entry closes the app. An edge swipe while panning the map from the screen edge does the same. Mid-raid the app closes, and `resolvePendingBattle` (`controller.ts:552-595`) plays out only the warriors already deployed; the rest "go home" and are not sent. iOS Safari's swipe-back has the same effect in a tab (NEEDS-DEVICE).
- Fix:
  1. In `main.ts`, when `!isNative()`, add `installWebBack(hud, currentApp, battleBack)`. At start, `history.pushState({ tk: 'guard' }, '')` once. On `popstate`: if `currentApp()?.inBattle`, call `battleBack()`; else if `hud.closeTop()`, nothing more; else show the existing "Leave Kagemura?" confirm (`ui.leave_kagemura_0b798fad93`). Then `history.pushState` the guard again, so the next Back is caught too. If the player confirms leaving, call `history.back()` after `controller.save()`.
  2. Keep the `?open=` `replaceState` (`hud.ts:252-258`) before the guard is pushed.
  3. Do not push a history entry per dialog (that clutters history). One guard entry, re-armed after each Back, is enough.
- Tests: Playwright: open the sandbox, open Army, then `page.goBack()` → the page is still the game (`window.tk` defined) and no `.modal-backdrop:not(.out)` remains. A second `goBack()` → the "Leave Kagemura?" dialog shows. In battle, `goBack()` → the End battle confirm shows. Unit (happy-dom): dispatching `popstate` calls `hud.closeTop()`.
- Done when: Back in a Chrome tab or installed PWA never unloads the game while a dialog, sheet or battle is open, and leaving needs the same confirm as the Android app.
- Don't break: the Capacitor Android path (`main.ts:964-978`); the manifest shortcuts' `?open=`; no reload loops with `pwa/register.ts` `updateWebApp`.

### UX-04 — Screen shake and flashes ignore reduced motion; no in-game motion/shake setting (earlier N-A)
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: presentation/render (+ presentation/ui for the switch)
- Checklist refs: WORLDWIDE_AUDIT R10 ("reduced-motion support is limited"); Checklist 9 accessibility line (content.py:297)
- Evidence: `src/presentation/render/BattleScene.ts:1126` (shake per destroyed building, 140 ms), `:1263` (splash hits), `src/presentation/render/fx.ts:311-320` (`keepCollapse`: additive flash scaled ×6 and a 520 ms, 0.009 shake). None of these read `reducedMotion()` (`render/motion.ts:8`), which `BattleScene` already keeps in `this.reduced` (`:216`). Probe4 with `reducedMotion: 'reduce'`: `{"shakes":4,"reduced":true,"destroyed":4}`. `fx.ts` `perfectBanner`/`starSlam` have no reduced-motion branch either (grep). Settings has only Sound effects, Music and Vibration (`settingsUi.ts:72-84`); `prefs.ts:2` keys are `sessionReminder | reminders | crashReports`. Players who don't set the OS flag, or whose WebView doesn't pass it, have no way to turn shake off.
- Fix:
  1. Add a device preference `tk.pref.reduceEffects` (in `backend/platform/prefs.ts` `PrefKey`, default false; a cross-compartment ask in `docs/backend/REQUESTS.md`, or keep a presentation-local key like `tk.quality`).
  2. Add `export function calmEffects(): boolean { return reducedMotion() || pref }` in `render/motion.ts`. In `BattleScene.ts:1126,1263`, guard the shakes: `if (!calmEffects()) this.cameras.main.shake(...)`. In `fx.ts keepCollapse`, skip the shake and replace the ×6 additive flash with a short alpha fade (no `ADD` blend). Do the same in `perfectBanner`/`starSlam`, and skip `slowUntil` (`BattleScene.ts:1118`) when calm.
  3. In Settings (`settingsUi.ts` after the Vibration toggle), add a toggle `t('settings.reduceEffects')` "Reduce screen shake and flashes". Have `ui/feedback.ts reducedMotion()` honour it too (HUD animations).
- Tests: unit with a stubbed scene: `keepCollapse` and the building-destroyed path call `cameras.main.shake` 0 times when `matchMedia('(prefers-reduced-motion: reduce)')` matches or the pref is set. Playwright: run probe4's counting hook with reduced motion and expect 0 shakes. DOM test for the toggle persisting.
- Done when: with the OS flag or the new switch, a full practice raid records 0 `shake` calls and no full-screen additive flash, and the switch survives a reload.
- Don't break: battles replay exactly (presentation only; never touch `src/gameplay`); the low quality profile behaviour; new text via `t()` + `npm run i18n:extract && npm run i18n:sync`.

### UX-05 — Audio: an iOS "interrupted" AudioContext is never resumed by a tap; no volume levels (earlier N-B, inferred)
- Severity: MEDIUM
- Status: NEEDS-DEVICE
- Kind: CODE
- Compartment: presentation/audio
- Checklist refs: Masterclass audio items (interruption resume, independent volumes)
- Evidence: `src/presentation/audio/sound.ts:95`: `if (this.ctx.state === 'suspended') void this.ctx.resume();`. WebKit puts the context in `'interrupted'` after a phone call, Siri or an alarm. `unlock()` (called on every `pointerdown`, `main.ts:814`) skips that state, and `suspend(false)` (`:151-160`) resumes only on `visibilitychange`, which an in-app call banner may not fire. Expected result (inferred): silence until the app is backgrounded and foregrounded, or reloaded. Volume: only on/off checkboxes (`settingsUi.ts:72-84`; fixed gains `sound.ts:78-84`, master 0.8, SFX 0.55, music 0.14) and no limiter on `master` (inferred clipping risk when many `boom`/`hit` cues overlap; `lastPlayed` throttles per cue type only).
- Fix:
  1. `sound.ts unlock()`: change the check to `if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume();`. Add `this.ctx.onstatechange` to restart the music clock (`nextBeat = currentTime + 0.1`) when it returns to `running`.
  2. Add `musicVolume`/`sfxVolume` (0–1) to `Settings` in `loadSettings` (keep the booleans for old `tk.audio` values) and range inputs in `settingsUi.ts` under Sound with `aria-label` from `t()`.
  3. Insert a `DynamicsCompressorNode` (threshold −10 dB, ratio 4) between `master` and `destination`.
- Tests: unit with a fake `AudioContext` whose `state` is `'interrupted'`: `sound.unlock()` calls `resume()`. Setting persistence: `tk.audio` round-trips the volumes and old `{sfx,music}` JSON still loads.
- Done when: on an iPhone, after an incoming call during play, the next tap brings sound back (device check), and Settings offers separate music and effects volume that persists.
- Don't break: no `AudioContext` while both are off (device F9/F18); the music scheduler runs only while audible; `.ambient` session on iOS (`AppDelegate.swift:13`).

### UX-06 — Purchase flow and Jade entry have poor accessible names (earlier A-4)
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: presentation/ui
- Checklist refs: R10 "screen-reader menus"; Checklist line 44 (EAA: WCAG 2.1 AA purchase flow)
- Evidence: probe4 Store button names: `["Close","Jade","Offers","Season Scroll","Looks","$0.99 (test)","$1.99 (test)",…,"$99.99 (test)"]`. `buyButton` (`economyUi.ts:133-138`) labels the button with the price only, so screen-reader button navigation hears seven prices with no product. The Jade pill (`hud.ts:331`) is `div role="button"` with no `tabindex` and no `aria-label` (probe4: `tabindex:null, label:null, text:"500+", tabIndex:-1`): it cannot be reached by keyboard and is announced as "500 plus". The coin/provisions pills are clickable `div`s (`hud.ts:322-326`) without a role (only the debt explanation; low impact).
- Fix:
  1. `buyButton(productId, cls, after)`: set `aria-label` to `t('store.buyNamed', { name, price })` ("Buy {name} for {price}"), which contains the visible price (WCAG 2.5.3). Pass `p.name` from the callers at `economyUi.ts:336,352,388,437`.
  2. `hud.ts:331`: make the Jade pill a `<button type="button" class="res res-moonstones">` with `aria-label = t('res.jadeOpenStore', { n })` ("Jade: {n}. Open the Store"), updated in `refresh()`. Change the CSS selector at `styles.css:734` from `.res[role='button']::after` to `.res-moonstones::after`.
  3. Mark the purchase-confirm result toast region `aria-live="assertive"` for errors (the toasts are already `polite`, `hud.ts:395`).
- Tests: DOM: open the Store; every enabled `.shop-card .btn` has an accessible name containing the product name and the price label; `.res-moonstones` is a `BUTTON` with a non-empty `aria-label` and `tabIndex === 0`.
- Done when: a Chromium accessibility-tree snapshot of the Store lists "Buy … for …" for each pack, and Tab from the page reaches the Jade pill.
- Don't break: real prices only in the Store and its confirm (the label only repeats the Store's own price); the 320 px top bar fit; text via `t()` + i18n sync.

### UX-07 — Top-bar Builders/Honor pills and the unlock chip are under 44 px with no hit-area extension (earlier A-2)
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: presentation/ui
- Checklist refs: R10/M8/F21 (closure "44 px … hit areas"); Checklist content.py:297
- Evidence: probe1/probe3 measurements (CSS px): at 320×568 and 360×640 `res-builders` 72×30, `res-trophies` 53×30, `.unlocks` 51×32; at 844×390 85×36, 66×36, 198×36. The extension `styles.css:734` (`inset:-6px -3px`) covers only `.res[role='button']` (Jade) and `.res.res-news` (`:1052`), but Builders and Honor are `<button>`s without `role` (`hud.ts:338-341`). `styles.css:1093` sets `.res { min-height: 30px }` under 400 px, while the comment at `:1088` says "tap areas stay at least 44 px through the ::after rules above", which is untrue for these two. The battle point chips are 42–43 px wide (all languages, probe3).
- Fix:
  1. `styles.css:734`: change the selector to `.res-builders::after, .res-trophies::after, .res-moonstones::after, .event-chip::after` with `inset: -7px -3px` (30 + 14 = 44), and add `position: relative` to `.res` if it is missing.
  2. `.unlock-chip .unlocks` (`styles.css:878`): `min-height: 44px` or an `::after` with `inset:-6px 0`.
  3. `.point-chip`: `min-width: 44px`.
  4. Make sure the vertical gap between the wrapped top-bar rows (`gap: 4px`) does not let two extended hit areas overlap: shift the `::after` inset so rows meet at the midpoint.
- Tests: extend `village-hud-batch.test.ts` (source rule present for `.res-builders::after`). Playwright: at 320×568, 360×640 and 844×390, every visible `#hud button` has a box, or a box plus its `::after`, ≥ 44×44, and `elementFromPoint` at a point 6 px above or below each pill's box returns that pill.
- Done when: the probe3 `small` list is empty for the village top bar at all three sizes and in de, fi, ta and ar.
- Don't break: the top HUD height under 400 px (21 % at 320×568, closure record); the bottom bar fit; RTL.

### UX-08 — No in-game text size; OS text size untested; canvas text fixed px (earlier A-1)
- Severity: MEDIUM
- Status: NEEDS-DEVICE
- Kind: CODE + DEVICE
- Compartment: presentation/ui (+ integration for native)
- Checklist refs: R10 "Assess larger text"; GUI batch remaining limitation "real OS text-size settings on phones not tested"
- Evidence: rem type exists (2026-11-13), but grep finds no `-apple-system-body`, `text-size-adjust`, `textZoom` or text-size setting in `src/`, `index.html`, `android/` or `ios/`. iOS WKWebView ignores Dynamic Type for plain CSS (inferred); Android WebView applies the system font scale through `textZoom` (inferred). Canvas labels are fixed px: `BattleScene.ts:629` (15px), `:964` (13px), `fx.ts stamp`. Round buttons and icons are fixed size (closure note).
- Fix:
  1. Add Settings → Display "Text size" (100 / 115 / 130 %) stored in `tk.textScale`, applied before first paint by setting `document.documentElement.style.fontSize` in the inline boot script (`index.html`) so the splash also follows.
  2. On iOS native, optionally read `UIFontMetrics` through a tiny plugin, or default the setting from `matchMedia` (owner/native decision).
  3. Scale canvas label sizes by the same factor (`BattleScene` text and `VillageScene.ts:239,403`).
  4. Device pass: Android font scale 1.3 / 2.0 and iOS Larger Text with the new setting, at 360×640.
- Tests: Playwright at 320×568 with `fontSize` 130 %: no horizontal overflow, the bottom bar fits, and every `#hud button` is still hit-testable (reuse probe3). Unit: the setting persists and is applied before `main.ts` runs.
- Done when: the 130 % setting passes probe3 with no overflow at 320×568 in de and ta, and a device run at Android 1.3 font scale is recorded.
- Don't break: the bottom bar fits 320 px (`--rb*` steps); inputs ≥ 16 px; no `user-scalable=no`.

### UX-09 — Delete saved army is one tap with no confirm or undo (earlier D-3, inferred)
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: presentation/ui
- Checklist refs: Masterclass "confirmation on destructive actions"
- Evidence: `src/presentation/ui/armyUi.ts:439-443`: the "×" button dispatches `deleteArmyPreset` at once and redraws. It sits in the refill row next to the refill action (`refillRow`), so a stray tap loses a composed preset. Other destructive actions confirm (dismiss `armyUi.ts:508-533`, cancel `:476,554`, leave Alliance `groveUi.ts:312`, delete account `hud.ts:1370`, start over `settingsUi.ts:358`).
- Fix: show an undo toast `t('army.presetDeleted')` with an "Undo" action that re-dispatches `saveArmyPreset` with the removed preset at its index (5 s). Alternatively use `kit.confirm(..., danger=true)`. Undo is better for a cheap action.
- Tests: DOM: click "×" on a preset, then the preset is gone and a toast with Undo exists; click Undo and the preset is back with the same name and army.
- Done when: a deleted preset can be restored within 5 s.
- Don't break: the Army panel's "never rebuild while a finger is on a button" rule; text via `t()`.

### UX-10 — Review prompt counts wins only when the player taps "Return home"
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: presentation/ui
- Checklist refs: G26 (review after a win)
- Evidence: `src/presentation/ui/battleHud.ts:880-889`: `noteBattleResult` runs only in the "Return home" `onClick`. The `next` actions (`...next.map(...)`, `:881`) and "Watch replay" skip it, so wins left that way are never counted and `REVIEW_MIN_WINS` (5) is reached late or never. The policy itself is sound (`reviewPrompt.ts:34-40`: win, tutorial done, gap, max 3).
- Fix: in `showResult`, count the result once when the result modal opens (`noteBattleResult(win, tutorialDone, now, { ask: false })`) and request the sheet only on close of the result through any button. Split `noteBattleResult` into `countBattleResult` and `maybeAskForReview`.
- Tests: unit: count on show plus ask on close; leaving through a next action still increments `wins` and may ask; practice, trial and replay never count.
- Done when: five wins left through any button can lead to one review request.
- Don't break: never after a loss, never in the tutorial, never over a dialog.

### UX-11 — Battle keeps running behind iOS Control Center / notification shade
- Severity: LOW
- Status: NEEDS-DEVICE
- Kind: DEVICE (then CODE if confirmed)
- Compartment: integration (main.ts) / presentation/render
- Checklist refs: Masterclass "interruptions (call, notification, Control Center)"
- Evidence: battles pause only through Phaser's hidden-page sleep plus the 250 ms delta cap (`battleSession.ts:77`). No `blur`/`pagehide` battle pause (grep in `main.ts`, `app.ts`, `BattleScene.ts`). Pulling down Control Center does not fire `visibilitychange` in iOS Safari or WKWebView (inferred), so the 3:00 battle clock keeps going while the player cannot act. A call does hide the page.
- Fix (after device confirmation): on `window.blur` during a live, offline-only battle (no ticket), show a "Paused" overlay and stop `session.update` until `focus`. Online ticket battles keep the server clock, so show a "battle continues" note only.
- Tests: Playwright: dispatch `blur` in a practice raid → `sim.tick` does not advance for 2 s; `focus` resumes.
- Done when: a device run records behaviour for Control Center, the notification shade and an incoming call.
- Don't break: replays from seed and deployments (presentation-side pause only); server-held ticket timing.

## 3. Verified sound

- Every Jade spend is confirmed (`economyUi.ts:234-244`; callers `armyUi.ts:292,357,549,590`, `hud.ts:1763,1792,2111,2119`, `economyUi.ts:474`). It shows no real-money figure and offers "Visit the store" when short.
- Store confirm step: price from the store, withdrawal notice, Japanese notices, second confirm for under-18 (`economyUi.ts:200-218`). A cancelled purchase releases the cap (`controller.ts:343-347`).
- Every other destructive action has a danger-styled confirm (see D-3). End battle is confirmed (`battleHud.ts:571,824`). Native Android Back closes the top dialog or sheet, then confirms leaving (`main.ts:964-978`, `hud.ts:2678-2690`).
- Dialogs: named by title (`aria-labelledby`), focus moves in, Tab is trapped, Escape closes only the top one, focus goes back (`hud.ts:2603-2669`). Closing dialogs take no taps (`.out`).
- Touch: 10 px tap slop, pinch cancels the tap, stale pointers released (`render/cameraControl.ts`, `render/touchInput.ts`). `touch-action` rules keep page zoom available (`index.html:5`, no `user-scalable=no`).
- HUD reduced motion: a global rule ends CSS animations and transitions (`styles.css:755-758`). HUD JS animations check `reducedMotion()` (`feedback.ts:33-51`, `unlockCeremony.ts:55,106`, `hud.ts:566`). The battle opening glide is skipped (`BattleScene.ts:363,427`).
- Localization: `text-leaks.test.ts` and `pseudo-locale.test.ts` (RTL Hebrew-letter and +40 %) exist. Emulated de/fi/ta at 320–360 px and ar at 360 px showed no overflow or cut buttons in village, Store, Army, Settings or battle (probe3; screenshots `de-320x568-*.png`, `ta-320x568-*.png`, `ar-360x640-*.png`). Names accept any script (`net/names.ts:37` `\p{L}`, `sim/social/names.ts`). Prices come from the store; numbers and dates through Intl helpers. No "toadstool", lorem or TODO in player-visible English (`locales/en/ui.json`).
- Onboarding: no pop-up wall on first launch (screenshot `360x640-first-launch.jpg`). Skip asks once (`tutorial.ts:185-190`). Replay in Settings (`settingsUi.ts:117`). The notifications pre-prompt comes after the tutorial, once (`hud.ts:481-500`). The age question returns at most 3 times (`askAgain.ts`).
- Audio: no `AudioContext` while sound is off. Music is scheduled only while audible (`sound.ts:425-445`). Sound is suspended while hidden (`main.ts:905-907`). The iOS session is `.ambient` + `.mixWithOthers` and respects the silent switch (`AppDelegate.swift:13`). Haptics have a switch.
- Review prompt policy (win only, ≥ 5 wins, 120 days, ≤ 3 times, never in the tutorial, not for practice/trial/replay) with a native plugin installed (`@capacitor-community/in-app-review`, `main.ts:304`).
- Rotation mid-battle (360×640 → 844×390) and a direct landscape start re-fit the battle with no off-screen buttons (probe5; screenshots `battle-360-640-844-390.jpg`, `battle-844-390-844-390.jpg`). Safe-area variables are used for every edge-anchored HUD block (`styles.css:61-64` and uses).
- Settings persist across reloads (`tk.audio`, `tk.pref.*`, `tk.quality`, `tk.lang`).

Limits: emulation only (Chromium touch emulation, no Safari/WebKit, no physical phone). Device behaviour of Back in Capacitor, the iOS audio interruption, OS text scaling, font coverage for non-Latin scripts on cheap Android phones, Control Center and safe areas on notched devices remain NEEDS-DEVICE.
