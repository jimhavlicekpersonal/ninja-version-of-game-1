# Agent prompt: lean downloads and instant language pick

Paste everything below the line into a new agentic AI session (INTEGRATION role, see `AGENTS.md`). It plans first, stops for approval, then builds.

---

You are working on **Kagemura: Ninja Clans**, a TypeScript + Phaser 3.90 base-building game shipped as a PWA (GitHub Pages) and as iOS and Android apps (Capacitor 8). You own two linked systems:

- **System A, lean downloads:** players download the app, and its updates, as rarely and as small as possible, without losing features or breaking store rules.
- **System B, instant language:** from the first frame after launch, the game is already in the player's language, picked automatically with no question asked, so a new player can tap straight through to the village. The player can change it any time.

Both systems share one fact: text and fonts for many languages are the largest new download this game will ever add. Design them together.

## The rule behind every decision: tap to play, even on one bar

Players hate waiting, and many play on poor mobile connections. Every choice follows from three rules:

1. **Nothing between the tap and play waits on the network.** Everything needed to start, including the player's language, is already on the phone.
2. **Every download is small, happens in the background, survives a dropped connection, and is never needed to keep playing.**
3. **A byte ships only if a player on a slow connection would want it.**

The owner has already made the decisions in section 6 under this rule. Do not ask them again. Raise one only if a measurement shows it breaks the rule.

## 0. Rules for this session

1. **Phase 1 is design only.** Measure, research and write the plan in `docs/backend/DOWNLOAD_AND_LANGUAGE_PLAN.md`. Do not change game code in Phase 1. When the plan is written, stop and ask the owner to approve it. The decisions in section 6 are already made.
2. Read first: `CLAUDE.md`, `AGENTS.md`, `compartments.json`, `locales/CLAUDE.md`, `locales/languages.json`, `src/gameplay/sim/social/names.ts`, `src/backend/CLAUDE.md`, `src/presentation/CLAUDE.md`, `src/gameplay/CLAUDE.md`, `docs/backend/PVP_ROADMAP.md` (step 76: server-delivered data), `docs/SHIPPING.md`, `vite.config.ts`, `src/backend/pwa/sw.template.js`, `src/backend/pwa/register.ts`, `index.html`, `src/main.ts`, `src/presentation/render/fonts.ts`, `src/backend/platform/prefs.ts`, `capacitor.config.ts`, `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml`.
3. Respect the compartments. The work spans BACKEND (service worker, native projects, data bundles, CI), GUI (text layer, fonts, language picker), GAME THEORY (sim events must carry ids and numbers, not English sentences) and INTEGRATION (`index.html`, `main.ts`, contracts). The plan must say which compartment owns each step and which contract files change.
4. Every claim about store rules, OS behaviour or platform sizes must be checked against current official docs (Apple, Google, WebKit, Android, MDN) and cited with a link and the date read. Mark anything you could not verify as "unverified". Several facts below are estimates from an earlier review and must be re-measured.
5. Keep npm scripts cross-platform (Windows). No new runtime dependencies unless the plan justifies each one by size and need.
6. Never trade correctness for size. A save must never be lost, a battle never replayed under the wrong rules, and the game must always start offline.

## 1. What is already known (re-measure all of it)

Build output today (`vite build`):

| File | Raw | Gzip |
|---|---|---|
| One JS bundle (Phaser + game in one file) | 1.78 MB | 491 KB |
| CSS | 36 KB | 9 KB |
| Fonts (M PLUS 1, Dela Gothic One; Latin subset only) | 48 KB | 48 KB |
| Icons precached by the service worker | 340 KB | ~340 KB |

- First web visit is about 0.6 MB to play, about 0.9 MB once the offline cache fills. All art is drawn in code, so there are no image downloads, but textures take about 120 MB of RAM.
- **Every deploy re-downloads everything.** The service worker cache name includes a build id that changes on every build, and old caches are deleted, so unchanged files (Phaser, fonts, icons) are fetched again. Phaser and the game share one hashed file, so any game change also re-downloads Phaser.
- Native app size is estimated, not measured: about 4–8 MB on Android and 6–12 MB on iOS.
- GitHub Pages has a soft limit of 100 GB per month of bandwidth.
- **Translations live in `locales/`, a separate compartment (`locales/CLAUDE.md`).**
  - The 50 languages are in `locales/languages.json`: every language the App Store lists (44 distinct) plus Swahili, Hausa, Yoruba, Amharic, Zulu and Igbo. Each language has its script, direction, translation wave and notes.
  - The English for game data (637 strings, generated from `src/gameplay/data` by `npm run i18n:extract`) is in `locales/en/data.json`.
  - Each other language has a worksheet `locales/<code>/data.json` that a TRANSLATION AI fills one language at a time (`npm run i18n:status`, `i18n:next`, `i18n:check`; `tests/locales/` guards them).
  - The game does not read `locales/` yet. Interface English is still hard-coded in `src/presentation/ui/*.ts`, `src/app.ts`, `index.html` (boot card: "Lighting the lanterns…") and some sim text.
  - A rough count: 1,000–1,800 strings in all, about 40–70 KB of English. Expect 25–40 KB gzip per language, about 1.5–2 MB gzip for all 50.
- **Player and Alliance names already accept every script** (`src/gameplay/sim/social/names.ts`, on the client and the server). Names display through the system-font fallback in the CSS and canvas font stacks. Keep that fallback.
- Fonts dominate. Latin, Cyrillic, Greek and Vietnamese are 30–150 KB each. Arabic, Hebrew, Indic and Southeast Asian scripts are 50–250 KB per script. Chinese (Simplified and Traditional), Japanese and Korean are 1.5–5 MB per font. The current fonts' full versions cover Japanese.
- `Info.plist` declares only `CFBundleDevelopmentRegion = en`, with no `CFBundleLocalizations`. Android has `configChanges` including `locale` but no `localeConfig`.
- The game already works offline except online PvP and social. Online attacks wait in a saved outbox and the server keeps tickets for 1 hour.
- The roadmap plans signed, data-only bundles from the server (step 76): numbers only, never code, cached offline, falling back to the built-in data.
- Battle rules are versioned (`SIM_RULES`). Replays from other rules are shown as unavailable. The server requires protocol v6 clients.

## 2. System A: lean downloads

### Goal and metrics

Define each metric precisely, give a baseline (measured) and a target:

- Store download size, per platform (App Store "download size" for one common device, Play download size from the AAB).
- First-visit web bytes before the first tap is possible, and total until the game works fully offline.
- Bytes downloaded per active player per month (updates, data bundles, language packs).
- Store binary updates per year, and **forced** updates per year (target: as close to zero as possible).
- Time to first interaction on a throttled "Slow 3G" profile and on a good connection, on a mid-range Android phone.

Include a short, cited section on why size matters for installs (for example Google's published install-conversion figures, and Apple's cellular download limit and how it now works). Verify before quoting.

### Design questions the plan must answer

1. **Classify every kind of change** by how it reaches players, and make the cheapest path the default:
   - *Data bundle* (no store update): balance numbers, events schedule, offers metadata, translation fixes, new languages' text. Signed, versioned, content-hashed, cached for offline, with fallback to built-in data. Data only, never executable code (Apple guideline 2.5.2; Google Play device and network abuse policy). Check both.
   - *Web build* (PWA only): code changes for web players.
   - *Store binary*: native plugin, permission, Capacitor or code changes for app players.
   For each class, list what may go in it, and which tests guard it.
2. **Combat numbers in data bundles.** A bundle that changes combat data changes battle outcomes. Design how the bundle, `SIM_RULES`, battle records, the server re-sim and replays stay in agreement (for example a rules id that names the data bundle hash). This is a GAME THEORY + BACKEND contract; write it as a request, do not decide it alone.
3. **Fewer forced updates.** The server should accept the current and previous protocol for a stated window. The client needs a minimum-version check that never blocks offline play: an outdated app can still play its village and bot raids, with only online PvP paused and a clear "Update to play online" message. Android: the in-app updates API (flexible flow). iOS: a link to the App Store page. Propose the version window and the release cadence (for example one scheduled store release a month, hotfixes excepted).
4. **Smaller updates on the web:**
   - Split Phaser into its own long-lived chunk.
   - Lazy-load rarely used screens if it saves real bytes.
   - Give each language its own chunk.
   - Rewrite the service worker so unchanged hashed files survive deploys. Cache by file, not by build.
   - Download updates in the background and apply them on the next launch.
   - Never precache all 50 languages.
5. **What goes inside the native binary (decided, section 6).**
   - All 50 languages' text and the small Latin font subsets go in the binary. Every other script uses system fonts.
   - Measure the real binary growth.
   - Data packs come from the self-hosted CDN on every platform. Do not use Play Asset Delivery or Apple On-Demand Resources or Background Assets: one mechanism for web, iOS and Android.
6. **Live code updates inside the native apps: decided no (section 6).** Keep the "data only, never code" rule. Write down the Apple and Google rules that make data packs allowed (Apple guideline 2.5.2; Google Play device and network abuse policy), with citations.
7. **Hosting: decided Cloudflare (section 6).** Plan the move from GitHub Pages: deploy workflow, cache headers, HTTP/3, and costs at 10k, 100k and 1M monthly players.
8. **A size budget enforced in CI.** A cross-platform script reports compressed sizes per chunk, per language pack and per font, and fails the build when a budget is exceeded. Propose the budgets, for example:
   - core JS ≤ 520 KB gzip
   - first-visit bytes ≤ 650 KB
   - one language's text ≤ 40 KB gzip
   - a store-binary growth alarm at +1 MB

## 3. System B: instant language pick

### Requirements

- **Zero waiting, zero questions.** No language dialog on first launch, and no network request to decide. The language is chosen synchronously before the first visible frame. The boot card, the tutorial and every screen appear in that language, with the right `lang` and `dir`.
- **No flash of English,** no layout jump from right to left, and text is never hidden while a font loads (system fallback first, custom font swapped in later; Phaser canvas text redrawn after the swap).
- **The player can always change it:**
  - A small, unobtrusive language chip on the boot card or first screen (never a blocking modal), plus a Settings row: "Language: Deutsch (automatic)".
  - The list shows each language in its own name and script ("Deutsch", "日本語", "العربية"), is searchable, and has "Automatic (device language)" at the top.
  - A change applies at once, without losing state.
- **Accuracy target:** fewer than 2% of players change away from the automatic pick in their first session (measured only with analytics opted in).

### Signals, in order (verify each on real devices)

1. The player's explicit choice, stored as a device preference (`prefs`), not in the village save. Explain why, and what "Copy save code" should carry. If you put it in the save, bump `SAVE_VERSION` with a migration.
2. The OS per-app language: iOS Settings → Kagemura → Language, and Android 13+ per-app languages. These only work if the app declares its languages: `CFBundleLocalizations` (and `.lproj` folders if needed) in `Info.plist`, and `locales_config.xml` with `android:localeConfig`. Keep the in-game choice and the OS per-app setting in sync both ways (Android `LocaleManager` / AppCompat; iOS opens the app's Settings page).
3. The device's ordered preferred-language list (`navigator.languages`; native `Locale.preferredLanguages` / `LocaleList`). Walk the whole list and take the first supported entry, not just the first entry. For example `[gsw-CH, de-CH, en]` → German.
4. Region and script to choose a variant: `zh` → Hans or Hant (TW, HK, MO → Hant); `pt-BR` vs `pt-PT`; `es-419` vs `es-ES`; `fr-CA`; `sr-Latn` vs `sr-Cyrl`. The time zone is allowed only as a last tie-break for script, never as the main signal.
5. Fallback: English.

Not allowed at first frame: IP geolocation, the store storefront country (asynchronous), or any network call. Note them as possible later refinements only if they add measurable accuracy and respect privacy rules.

**WebView pitfall to test first:** inside a native app, the WebView's `navigator.language` may reflect only the localizations the app bundle declares, not the device list. With today's `Info.plist`, an iPhone set to Japanese may report English. Prove the real behaviour on iOS (WKWebView) and Android (System WebView) before designing around it. If the WebView value is unreliable, read the native preferred languages through a tiny synchronous bridge or pass them in at launch, so the decision is still made before the first frame.

### How it runs (design to validate)

- A tiny inline script in `index.html` (budget about 3 KB) runs before the main bundle. It reads the stored choice and the device list, runs the matcher, then:
  - sets `<html lang dir>`
  - localizes the boot card from a small inline table of boot-card strings for every language (budget about 5 KB)
  - starts fetching that language pack and its font in parallel with the main bundle (preload hints)
- On native, the packs are already in the app, so nothing is fetched.
- The matcher is a pure function with no dependencies, shared by the inline script and the game. Implement RFC 4647 lookup on normalized BCP 47 tags, plus a small likely-subtags table and legacy aliases (`iw`→`he`, `in`→`id`, `ji`→`yi`, `tl`→`fil`, `no`→`nb`, `zh-CN`→`zh-Hans`, `zh-TW`→`zh-Hant`).
- "Automatic" follows OS changes while the game runs (`languagechange` event; Android already declares `configChanges="locale"`).
- Local notifications (`planNotifications`) and, later, server push must use the chosen language. Add the language tag to the push registration in the protocol.

### Text layer (prerequisite, GUI + GAME THEORY)

- One translation layer keyed by stable ids:
  - display names keyed by the existing internal ids (`docs/rebuild/ID_MAP.md`)
  - ICU-style plurals
  - `Intl` for numbers, durations and dates (replace hand-built formats such as `formatDuration`)
- Sim events and close-call notes carry ids and numbers. The UI turns them into sentences.
- Right-to-left support for Arabic, Hebrew, Persian and Urdu. Room for 40% longer text.
- Tests:
  - a pseudo-locale (accented and lengthened) to catch truncation
  - a check that every key exists in English
  - a lint or test that fails on new hard-coded user-visible English
- The language list is fixed: `locales/languages.json` (50 languages, with waves and `alsoFor` aliases such as `gl`/`eu` → `es`, `jv`/`su` → `id`, `no`/`nn` → `nb`). A missing translation falls back to English.
- Build the text layer on `locales/`:
  - Move interface strings into `locales/en/ui.json`. `npm run i18n:sync` then adds them to every worksheet.
  - Pack each language's filled `text` values into one runtime file at build time.
  - Make sim events carry ids and parameters.
  - Add ICU plural support. When English becomes ICU messages, sync puts those entries back on the translators' to-do list automatically.
- Names inserted into sentences go through `isolateName` (names.ts) or `<bdi>`, so a right-to-left name cannot reorder the sentence.
- Localized App Store and Play listings (name, subtitle, keywords, screenshots) in the top languages, since these drive installs per country. This is an owner step; list it.

## 4. Verification the plan must include

- Unit tests for the matcher: a table of at least 200 real device language lists and the expected pick, including the tricky ones above.
- Playwright runs (pre-installed Chromium; do not reinstall Playwright) with emulated locales such as `ar-EG`, `zh-TW`, `zh-CN`, `pt-BR`, `de-CH`, `ja-JP`, `hi-IN` and `[gsw-CH, en]`. Screenshot the first frame and assert language and direction with no English flash. Repeat with "Slow 3G" throttling and offline.
- A service-worker test: deploy build N, then N+1 with only game code changed. Assert that Phaser, fonts and icons are not re-downloaded, and record the bytes.
- The CI size-budget script.
- Manual device checklist for the owner:
  - Pixel 7: Chrome, the installed app, and per-app language.
  - iPhone: Safari, the installed app, and per-app language.
  - Windows 11 Chrome and Edge.
- All existing checks stay green: `npm test` (including the boundary test), `npm run build`, `npm run typecheck:server`.

## 5. Phase 1 deliverable

Write `docs/backend/DOWNLOAD_AND_LANGUAGE_PLAN.md` with:

1. Measured baselines (with the commands used) and targets for every metric.
2. Decisions for each design question in sections 2 and 3, with the options weighed, the choice and the reason. Cite sources.
3. The size budget table (core, per language, per font, native binary per platform), and the total for all 50 languages under the decided approach.
4. A numbered step list. Each step names its compartment, the files it touches, the contract changes (and whether `SAVE_VERSION`, `SIM_RULES` or the protocol change), its tests, and a size or time estimate.
5. Risks and what would make you change the plan.
6. The owner decisions (section 6), each with a recommendation.

Then stop. Do not start Phase 2 until the owner approves.

## 6. Decisions (made by the owner under "tap to play, even on one bar")

| Question | Decision | Why |
|---|---|---|
| Live code updates inside the native apps | **No.** Code changes ship only in store releases. Balance numbers, events, offers and text ship as data packs. | Store updates already install in the background. A half-downloaded code bundle on a bad connection could stop the game from starting, and store-rule risk. |
| Languages | **The 50 in `locales/languages.json`**, translated in waves 1–4 (largest reach first). | The whole world at launch: every App Store language plus Africa's largest written languages. |
| Translation source | **AI translation, one language per session** (`locales/CLAUDE.md`, checked by `npm run i18n:check`). A native speaker reviews the store listing and tutorial for wave 1 before launch. | Every player gets their language on day one. Nobody waits for a later update. |
| Fonts | **Never download a font.** Keep only the small Latin subsets of the two display fonts (extend to Latin Extended for Vietnamese, Yoruba, Igbo and Hausa if that adds ≤ 30 KB). Every other script uses the phone's own fonts, including Japanese: no 2–5 MB M PLUS 1 set. | The phone's fonts are already installed and tuned for its screen. Zero bytes, zero waiting. |
| What the native app carries | **All 50 languages' text** (about 1.5–2 MB compressed), so the first launch never needs the network. | Text is small. Waiting for a language pack on one bar is not. |
| What the web build loads | **Only the detected language**, fetched alongside the main bundle and kept offline. Others are fetched only when the player switches. | Smallest first visit. |
| Store release cadence | **At most one store release a month.** Hotfixes only for crashes or lost progress. Data packs between releases. | Fewer store updates for players. |
| Old app versions | **The server accepts the current and previous protocol for at least 90 days.** An outdated app never loses offline play; only online PvP pauses with "Update to play online". | No forced update ever blocks the game. |
| Data packs | Signed, versioned, data only. Delta + brotli, about 20 KB typical. Downloaded when the app is idle, resumable, applied on the next launch, never mid-session. | Rule 2. |
| Language and "Copy save code" | **The language is not part of the save.** It is a device preference. A new phone picks its own language in the first frame. | The language belongs to the reader and the device, not the village. |
| Hosting for web, language and data packs | **Cloudflare (Pages + R2) before launch.** | Servers near the player, HTTP/3 (better on lossy mobile networks), free bandwidth. GitHub Pages has a soft limit of 100 GB a month. |
| Online play on a bad connection | Prefetch 3 opponents while the signal is good. Sync every 60 s or on events (not 15 s). Compress requests. Keep the saved outbox. | Rule 1 for raids. These are BACKEND steps; add them to `docs/backend/PVP_ROADMAP.md`. |
| Store listings | Localize the listing in all 44 App Store languages (owner step). Use Google Play's extra listing languages for the African six where Play supports them (verify which). Otherwise use the English or French listing. | Players install from listings in their own language. |
## 7. Phase 2 (after approval)

Build in this order, one compartment branch per step as `AGENTS.md` describes, each with its tests and the size report:

1. Size-budget script and CI gate.
2. Chunk split and a service worker that keeps unchanged files.
3. Text layer on `locales/`: interface strings into `locales/en/ui.json`, the runtime pack per language, the pseudo-locale.
4. Language matcher and inline boot script, with the native per-app language declarations for all 50 codes.
5. Language picker UI.
6. System-font stacks per script.
7. Data packs and the version window.
8. Translations: start TRANSLATION AI sessions, one per language, in wave order (`locales/CLAUDE.md`). They can start on `data.json` today, in parallel with steps 1–7.

After each step, report the measured bytes against the budget.
