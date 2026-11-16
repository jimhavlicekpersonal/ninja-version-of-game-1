# publish: what stands between today's repository and "publishable worldwide" (code side)

Investigator key `publish`, problem prefix `PUB-`. Read-only pass on 2026-11-16 at `9bf76af` (branch `claude/gracious-meitner-4k0h0d`, same commit as `main`). Nothing in the repository was changed. Scratch files: `docs/audit/understand-2026-11-16/scripts/publish/` (`det.ts`, `det-node22.txt`, `det-node24.txt`, `det-bun.txt`).

Local baseline (from the orchestrator's logs, Node 22.23.4): `npm test` 205 files passed, 1 skipped (1,934 tests passed, 19 skipped); lint clean; build passes.

## 1. CI on `main` is red, for three separate reasons

Latest run of "Test, build and deploy" on `main`: run 43817743888 (`9bf76af`), conclusion failure. Jobs: `build` failed at `npm test`; `server` failed at `npx vitest run tests/backend/server tests/backend/net tests/backend/contract`; `deploy` skipped. The Android workflow on the same commit is green.

### 1a. The deploy check has rejected every right-to-left language since `4dbd3c7` (fixable here, S)

- `tools/release/check-published-game.mjs:40` asserts the page contains the exact text `<html lang="${code}">`.
- `tools/i18n/pages.mjs:119` writes `<html lang="${code}" dir="rtl">` for right-to-left languages. `public/ar/community.html:2` is `<html lang="ar" dir="rtl">`; the same holds for `he` and `ur`.
- `4dbd3c7` made all 50 languages ready (`locales/availability.json`: 50 of 50 ready), so the check now walks ar, he and ur and fails with `ar/community.html: wrong language` (runs 43672412208, 43786329852, 43789242271 per `docs/backend/REQUESTS.md`).
- No test covers `check-published-game.mjs` (only `deploy.yml` and two docs reference it).
- The check runs after `actions/deploy-pages`, so a run whose `build` and `server` jobs pass does publish and then reports failure. Whether the live site is current was not fetched here; `docs/backend/REQUESTS.md` says it has not been updated since `148d49a` (174 commits behind HEAD).
- Fix: match `new RegExp('<html lang="' + code + '"[ >]')`, or check `lang` and `dir` separately against `locales/languages.json`; add a unit test that runs the checker's page assertion over `public/<code>/*.html` for every ready language.

### 1b. The Postgres suites time out at Vitest's default 5 s (fixable here, S)

- `tests/backend/server/pg.ts:19-33`: every Postgres-backed test makes a new schema and runs all 42 migrations (`repo.migrate()`), with test files in parallel against one database.
- `vite.config.ts:161-163` sets no `testTimeout` or `hookTimeout`.
- Run 43817743888: the `server` job's Vitest step failed (step 7). On the same commit the `theory/rules10` branch run 43817738958 passed that step, so it is load-dependent. `docs/backend/REQUESTS.md` (2026-11-15) names three different tests timing out on three runs; `WORLDWIDE_AUDIT.md` line 791 already recorded "in parallel against one shared database some unrelated Postgres tests time out at 5 s".
- A failed `server` job skips `deploy`.
- Fix now: `testTimeout` and `hookTimeout` of 30 s when `TEST_DATABASE_URL` is set (in `vite.config.ts`), and `--maxWorkers=2` for the Postgres step in `deploy.yml` and `server.yml`. Later: migrate one template schema or database per worker and clone it per test.

### 1c. `tests/gameplay/balance/matched.test.ts` fails on CI and passes everywhere else I could run it (cause not found, M)

- CI, `9bf76af`, both runs (main 43817743888 and theory/rules10 43817738958): `AssertionError: Keep 8: expected 2.75 to be less than or equal to 2.2` at `matched.test.ts:27`. That is 33 stars over 12 raids.
- CI ten minutes earlier on `9bb9a44` (run 43816597555): `npm test` passed. `git diff --stat 9bb9a44 9bf76af` is one file, `docs/backend/REQUESTS.md`.
- Here, same tree: Node 22.23.4 passes (06:49 full suite, 07:59 single file); Node 24.22.1 (`/opt/node24`) passes.
- My script `publish/det.ts` replays the 48 lag-0 raids of the test and prints a hash of each generated base, each bot deployment list, stars, destruction and end tick. Output is byte-identical on Node 22.23.4 (V8 12.4.254.21), Node 24.22.1 (V8 13.6.233.17) and Bun 1.4.4 (JavaScriptCore): Keep 5 1.250, Keep 8 2.167, Keep 12 1.833, Keep 15 1.833.
- So Keep 8 sits 0.033 under the 2.2 gate locally (26 stars over 12 raids; one more star fails it), and CI measured 7 stars more.
- What I ruled out by reading: wall clock (`src/gameplay` uses `Date.now()` only in `clock.ts:12`; `tools/balance/matched.ts:95` uses a fixed date), `Math.random`, `process.env`, CPU count, tests that write data files, uncommitted or ignored files that feed the simulator.
- What I could not test: the Node patch version the CI runners used. `Dockerfile:10` pins `node:24.22.3-slim`; the workflows ask for `node-version: 24`. Node's release index lists 24.22.3 (2026-11-10, security release). I was not permitted to download that binary here.
- In the same failing CI run the combat fingerprint and the 18 pinned aura battles passed, so the battle engine reproduced its pinned battles on that runner. The difference is therefore in something those pins do not cover (base generation, matchmaking, bot deployment, or these particular battles).
- Why it matters beyond a red badge: the server re-simulates every battle. If one Node patch version changes results, honest battles would be rejected in production. This is unproven; it needs one run of `det.ts` on Node 24.22.3 and a diff against `publish/det-node22.txt`.
- Fix proposal: (1) reproduce on 24.22.3 first; (2) pin CI's Node to the exact version the Dockerfile uses, in one place (`.node-version` read by `setup-node`'s `node-version-file`); (3) add a small cross-engine fixture to CI (the same `det`-style hash under Node and Bun); (4) only then decide whether the 2.2 ceiling at Keep 8 needs more seeds or a wider band (that is a balance-gate decision, not mine).

## 2. Is the CI honest?

Mostly yes, by design:

- `tools/release/ci-note.mjs` is used by `deploy.mjs` and `check-server-rules.mjs`: a web build without a server gets a notice; staging without `DEPLOY_HOOK` or `SERVER_URL` gets a warning and a job-summary line (`server.yml:128-132`); production without a hook fails; the Android `aab` job without the four signing secrets warns and builds nothing (`android.yml:82-89`).
- Weak spots: `npm audit` is `continue-on-error` (`deploy.yml:31-33`, by choice); the iOS workflow is manual only and has never been required; there is no `v*` tag, so `previous-client-contract.mjs` has no previous release to test; `android.yml` is green on a commit whose tests fail, because it is a separate workflow that runs no tests.
- The red `main` is real, not noise: see section 1.

## 3. The "cheap wins" named in the brief: all but two are already done

Revalidated in today's code:

| Item | State today | Evidence |
|---|---|---|
| Client sends sign-in nonces | done | `src/backend/net/connection.ts` `signInNonce`; `src/backend/platform/auth.ts` |
| Client rotates tokens and signs out | done | `connection.ts:908-927` (rotation), `protocol.ts:255` |
| HUD shows refusal parameters | done | `src/presentation/ui/refusalText.ts`, used in `armyUi.ts:454,542` |
| Age question "Not now" asked again | done | `ui/askAgain.ts`, `hud.ts:58,431-435` |
| Complaint form in the page language | done | `server/complaintPage.ts` |
| StoreKit configuration matches the catalog | done | `ios/App/Products.storekit`, `npm run store:storekit`, `release-config.test.ts` |
| Minimum WebView version | done | `capacitor.config.ts:24` (`minWebViewVersion: 80`) |
| In-app review after a win | policy and hook done; native project lists stale | `main.ts:300`, `native.ts:50`; see PUB-05 |
| Open Graph tags | present, image path relative, no `og:url` | `index.html:14-26` |
| Manifest screenshots | not done | `public/manifest.webmanifest` has no `screenshots` |

## 4. Every still-open item

"Code?" = can code or repository content close it. "Open today?" = what I found when I looked (R = read in code or data today, C = CI log, D = from the audit's own record, not re-read).

### 4a. GLOBAL findings

| ID | Code? | Open today? | Cost | Blocks |
|---|---|---|---|---|
| GLOBAL-001 Play Billing | no (code done) | R: `android/variables.gradle` 9.1.0; CI gate on Billing 8+ in `android.yml` | owner | Play upload: signed build, purchase tests |
| GLOBAL-002 import provenance | partly | D: edited-but-legal saves still pass within holds | L (create online villages on the server at first contact: owner decision) | competitive integrity |
| GLOBAL-003, 004, 005, 009–014, 016, 018, 019, 020 | closed | D; 014 and 016 partly R | — | device/store evidence only |
| GLOBAL-006 age markets | no | self-declared band; markets are legal decisions | owner/legal | BR, EU, UK child rules |
| GLOBAL-007 store prices | no (code done) | D | owner | storefront check; Google reports no price |
| GLOBAL-008 Android recovery | no (code done) | D | owner | OAuth clients, device recovery test |
| GLOBAL-015 live pages | partly | R: `public/legal-config.js` 16 empty fields; pages say "not published yet"; test asserts empty (PUB-04) | S code + owner facts | every listing |
| GLOBAL-017 signed AAB | no (code done) | R: `release.gradle`, `aab` job | owner | Play upload |

### 4b. Risks R01–R10

| ID | Code? | Open today? | Cost | Blocks |
|---|---|---|---|---|
| R01 offline promise | partly | R: `public/support.html:41` states it; listing must not claim offline play | S docs | honest listing |
| R02 late raid reports | partly | R: `server/core/pvp.ts:50` 72 h; later reports become practice | S (message) | trust after long outages |
| R03 rendering cost | no | thresholds uncalibrated | owner devices | cheap-phone claim |
| R04 Alliance polling | partly | D: backoff exists; payloads, deltas unmeasured | M | data cost in target markets |
| R05 languages | mostly closed | R: `npm run i18n:status` 50 of 50 complete, 3,394 entries each; the audit's R05 row still says "English only" (stale) | native review: owner | quality in each market |
| R06 moderation | partly | R: `social.json` `profanity` is 30 English words; staffing is owner | L code + owner | Play UGC, UK OSA |
| R07 child protections | no | mechanisms exist (`UNDER13_MODE`); policy open | owner/legal | under-13 position |
| R08 native behaviour | no | never built in Xcode or on a device | owner | both stores |
| R09 app links | partly | R: filter and entitlement commented behind `TODO(owner, audit R09)` | owner domain | share → install → friend |
| R10 accessibility | partly | R: zoom allowed (`index.html:5`); no accessibility statement in `public/` | owner/legal + M | EAA exposure (C21) |

### 4c. "Remaining limitations" that code can still close (from the closure records)

| Limitation | Code? | Open today? | Cost |
|---|---|---|---|
| Deploy check fails on RTL pages | yes | R, C (PUB-01) | S |
| Postgres tests time out | yes | C (PUB-03) | S |
| `matched.test.ts` on CI | yes | C (PUB-02) | M |
| Legal-config test asserts empty | yes | R (PUB-04) | S |
| `npx cap sync` not run: native lists lack haptics and in-app review | yes | R (PUB-05) | S |
| PRIVACY.md age-rating answers (C05) | yes (docs) | R: line 106 "contests: None", line 111 "age assurance: No" (PUB-06) | S |
| `policyUpdated` | yes | R: `2026-11-05`, page changed 2026-11-14 (PUB-07) | S |
| Third-party licence notices | yes | R: none in `public/`, 0 licence strings in the built Phaser chunk (PUB-08) | S–M |
| iOS workflow on `macos-15` (C07) | yes | R: `ios-testflight.yml:12` (PUB-09) | S |
| Absolute link-preview image, manifest screenshots | yes | R (PUB-10) | S–M |
| Word filter is English only (C23) | partly | R (PUB-11) | L |
| Bundle id in five places | partly | R (PUB-12) | S–M code, owner decision |
| Stale docs: REQUESTS "Open" lists answered asks; R05 row; LISTING languages row | yes | R (PUB-13) | S |
| `VITE_STATS_TZ` unset in every workflow | yes | R (PUB-14) | S |
| Server replaces `openDailyChest.entropy` (backend ask 2026-11-13) | yes | R: no `entropy` in `server/core` | S–M, SERVER |
| Squad orders not on screen (art request 2026-11-15) | yes | R: `orderSquad` only in `control/battleSession.ts` | M, UI + I18N |
| Mastery, hero choice, 16 buildings, 3 heroes "built, not live" (backend ask 2026-11-14) | yes | R: `docs/STATUS.md` | L–XL, SIM_RULES, SERVER, PLAYER_COMMANDS |
| `TkAchievements` native plugin (G31) | partly | R: no native file | M–L, uncompilable here |
| iOS `AVAudioSession` category (device F18) | partly | D | S, uncompilable here |
| App-level `PrivacyInfo.xcprivacy` | partly | R: none in `ios/App/App`; Capacitor ships its own two; the app's Swift uses no `UserDefaults` | S, unverifiable without Xcode |
| iOS `MARKETING_VERSION = 1.0` in the project vs `package.json` 0.1.0 | yes | R: `project.pbxproj:432,455`; the workflow overrides it | S |
| `keepalive` on the last send before a kill (GLOBAL-010) | yes | R: not used | S, low value |
| Store, Settings in the main chunk; `hud.ts` size | yes | D | M–L |
| Accessibility statement page (C21) | partly | R: none | M + I18N, owner decision |
| Refund counting per store identity, Apple `CONSUMPTION_REQUEST` | no | owner decision | — |
| Old Toadstool site on the same origin | no | another repository | owner |

### 4d. Open REQUESTS entries

`docs/backend/REQUESTS.md` "Open" holds eight entries. Really open: the 2026-11-15 CI entry (section 1), the `entropy` ask inside the 2026-11-13 entry, and the 2026-11-14 "when the designer makes them live" list. Answered but still under "Open": server error codes (done 2026-11-14), `refusedLog` (answered 2026-11-14), the review plugin (installed 2026-11-14; only `cap sync` is missing), per-Keep slack ("BACKEND to confirm").

`docs/art/REQUESTS.md`: the November re-audit table is wired (reference only). Open: squad orders (formation and wave pickers, Hold button, about 12 new strings).

### 4e. Owner-only (short)

Legal entity, bank and tax; trademark search for "Kagemura"; final bundle id and package name; domain; every field of `public/legal-config.js`; lawyer review of privacy, terms, Japan notices, UK OSA, under-13 position; Apple and Google accounts, capabilities, keys, products (14 store ids), age-rating and data-safety forms; hosting, Postgres, Redis, backups, staff; signing secrets; devices and store testing; native-speaker review of 49 AI-written languages; artist, music; turning off the old Toadstool Pages site.

## 5. Consistency checks

- `package.json`: name `kagemura`, version `0.1.0`, `private`. Android `versionName` and iOS `MARKETING_VERSION` come from it in CI. The Xcode project itself says 1.0.
- Display name "Kagemura" in `capacitor.config.ts:12`, `strings.xml:3-4`, `Info.plist`; listing name "Kagemura: Ninja Clans" (21 characters); server deletion page shows both (`server/accountPage.ts:84,117-118`).
- Bundle id `com.toadstoolkingdoms.app` in `capacitor.config.ts:11`, `android/app/build.gradle:6,9`, `strings.xml:5-6`, `project.pbxproj:434,456`, `ios-testflight.yml:16` (variable `IOS_BUNDLE_ID` exists for iOS only). A Play package name can never change after the first upload.
- Android: min SDK 24, compile and target 36, Billing 9.1.0, exact-alarm permission removed, backup rules present, `supportsRtl`, 51 locales in `locales_config.xml`. iOS: deployment target 15.0, entitlements for Apple sign-in, Game Center, push, declared age range; `ITSAppUsesNonExemptEncryption` present; 51 `.lproj` folders.
- Server image: `node:24.22.3-slim` pinned by digest; CI: `node-version: 24` (floating); `engines`: `>=20.19.0`; this container: 22.23.4.

## 6. Store listing and legal pages

- `docs/store/LISTING.md` claims checked against data today: 50 warriors (`troops.json` 50, roster 50 live), Keep 1–15 (`hall.json` 15 levels), under-18 cap (`store.json` `minorMonthlyCapUsd` 50), daily-chest odds shown before opening (`dailyUi.ts:150-161`), one Scroll-only look (`cosmetics.json:67`). No overclaim found. Keywords are 95 characters.
- Small points: the keyword list includes "samurai" and "castle", which the game does not contain (Apple 2.3.7 asks for relevant keywords: owner's call); the listing does not mention the Shadow Captain or the 28-day calendar; its "do not claim: Languages" row predates all 50 languages being complete.
- `docs/store/REVIEW_NOTES.md` is accurate to the code I checked and lists the right pre-send checks.
- What a reviewer sees on the shipped pages today: "not published yet" for the operator, address, support email, deletion URL, hosting, governing law and retention periods (`public/legal.js:11-25`); a "Draft for legal review" banner on `terms.html:17`, `tokushoho.html:17` and `shikin-kessai.html:17`; "last updated 2026-11-05" on a privacy page last changed on 2026-11-14. No invented placeholder and no `example.com` in any page (the honest design is deliberate).
- `docs/store/PRIVACY.md:106,111` still answers "contests: None" and "age assurance: No"; the compliance audit (C05) asked for "Frequent" and "Present", and the app now calls both stores' age APIs.

## 7. Things that are excellent and should not be changed

See the structured output (`geniusElements`). In short: the "not published yet" legal pages; the server-first release gate with archived, digested rules; the cross-engine deterministic simulator (measured identical on three engines here); honest CI notes; compliance switches with safest defaults; the listing's "claims checked / do not claim" table backed by tests; the Android release job's gates; the closure-record discipline with a "remaining limitations" column and a generated `docs/STATUS.md`.

## 8. First three changes

1. `tools/release/check-published-game.mjs:40`: accept `dir="rtl"`; add a test. Unblocks publishing the web game and the legal pages every store URL will point at.
2. Vitest timeouts for the Postgres suites, and pin CI's Node to the Dockerfile's version; run `publish/det.ts` on Node 24.22.3 to settle 1c.
3. Replace the "legal config must be empty" assertion with a store-readiness preflight (`tools/release/check-store-ready.mjs`) that commercial builds run; in the same pass commit `npx cap sync` output, correct `PRIVACY.md`'s two answers and `policyUpdated`.
