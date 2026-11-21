# Owner checklist: what only the owner can do before a store release

One list (P7-16 of `docs/prompts/BEAST_MODE_2026-11-16.md`), built from `docs/audit/STATE_OF_THE_GAME.md` section 6,
`docs/audit/understand-2026-11-16/publish.md` section 4e and what the 2026-11-16 pass added. Each line says what it
blocks and how to tell it is done. Lines marked **(preflight)** are checked by `npm run release:preflight`
(`tools/release/check-store-ready.mjs`), which prints what is still missing and fails the signed Android and
TestFlight jobs on the blocking ones.

"Publishable" is true only when this list is empty. No code can empty it: every line needs a person, an account,
a contract, a device or a decision.

## 1. Identity and legal entity (blocks every listing)

| Task | Blocks | Done when |
|---|---|---|
| Choose the publisher (individual or company); bank account and tax details for both stores | every listing, payments | Store accounts accept the payee |
| Trademark and store-name search for "Kagemura" (USPTO, EUIPO, JPO; classes 9 and 41); pick a fallback name | every listing | Search report kept by the owner |
| Choose the final bundle id / Android package name (Play never lets it change) and set the repository variable `APP_ID` | Play upload, TestFlight | **(preflight)** `APP_ID` set and not `com.toadstoolkingdoms.app`; then `strings.xml` `package_name`/`custom_url_scheme`, Xcode's identifier and the server's `APPLE_BUNDLE_IDS`/`GOOGLE_PLAY_PACKAGE` (docs/SHIPPING.md section 6) |
| Register a domain; decide hosting and crash-report regions | legal pages, App Links | Domain resolves; regions written into the privacy policy |
| Fill every publisher fact in `public/legal-config.js` (operator, address, phone, responsible person, support email, deletion URL, EU/UK representatives, regions, governing law, retention periods, terms date) | every listing | **(preflight)** no empty fact; pages stop saying "not published yet" |
| Appoint the UK Online Safety Act responsible person; Brazil legal representative and DPO; India grievance officer | UK, Brazil, India | Named in the legal pages |

## 2. Legal decisions and reviews

| Task | Blocks | Done when |
|---|---|---|
| Lawyer review of privacy policy and terms per market (GDPR, CCPA, German Impressum, UK Children's Code DPIA, Brazil ECA Digital, India IT Rules/DPDP, Japan 特定商取引法 and 資金決済法) | EU, UK, Japan, Brazil, Germany, India | Reviewed texts merged; `termsEffective` dated **(preflight)** |
| Under-13 position (`UNDER13_MODE`: offline, limited, families) | every market with children | Server variable set; privacy policy matches |
| Real-money equivalents for Jade in the EU (`EU_JADE_VALUE`) | EU | Variable set or left off on advice |
| European Accessibility Act position (exemption or statement + WCAG 2.1 AA purchase flow) | EU | Decision recorded (an accessibility statement page is not built: C21) |
| Apple `CONSUMPTION_REQUEST` policy; what counts as a "significant update" (iOS age range) | iOS | Server variables set |
| Native-speaker review of the 49 machine-translated languages, of the chat word lists (P7-07) and of any festival names (Phase 5) | quality and cultural fit in each market | Reviews recorded in each `docs/localization/WORD_LISTS.md` |
| Re-read Apple's age-rating definitions in App Store Connect before answering (prepared answers: `docs/store/PRIVACY.md`, rechecked 2026-11-18 only from a page summary) | App Store | Questionnaire submitted |

## 3. Store accounts, products and forms

| Task | Blocks | Done when |
|---|---|---|
| Apple Developer Program (agreements, bank, tax, Small Business Program); App ID with Sign in with Apple, Game Center, Push, Declared Age Range; keys (Sign in with Apple, App Store Server API, APNs); server notification URLs; DSA trader declaration; privacy label | iOS | App Store Connect shows the app ready for TestFlight |
| Apple signing in GitHub: `APPLE_TEAM_ID`, the App Store Connect API key (`ASC_KEY_ID`, issuer, key file) and the distribution certificate and profile secrets the TestFlight workflow reads | TestFlight uploads | `npm run release:preflight` lists none of them missing |
| Google Play Console (identity, payments, package, Play App Signing, upload key secrets in GitHub, Data safety, deletion URL, target audience, IARC, Age Signals access, service account and RTDN, license testers, 12 testers × 14 days closed testing) | Android | The `aab` job builds and uploads **(preflight: signing secrets)** |
| Create the 13 in-app products with the store ids in `store.json` (`docs/SHIPPING.md` 3b), regional price templates | purchases | Both consoles list them; `npm run store:storekit` matches |
| Firebase/FCM, OAuth web client for Sign in with Google | push, Android sign-in | Build variables set |
| Build variables: `VITE_SERVER_URL`, `VITE_PUBLIC_URL`, `VITE_APP_STORE_URL`, `VITE_PLAY_STORE_URL`, `VITE_SUPPORT_EMAIL`, legal page URLs | online play, links, "Update Kagemura" | **(preflight: server URL)** |
| Territories (exclude where licensing is missing: mainland China, Vietnam, Indonesia until PSE, sanctioned markets) | listing | Store consoles configured |
| First run of the iPhone release workflow on the `macos-26` image (P7-06; it has never run and stops below iOS SDK 26) | TestFlight | A TestFlight build exists |
| Xcode-only steps this pass could not compile (P7-15): archive in Xcode and check "Generate Privacy Report" lists the app-level `ios/App/App/PrivacyInfo.xcprivacy` (added to the App target by Beast Mode OPS-10; OWN-13), check the ambient audio session on a device, build a Game Center / Play Games achievements plugin if wanted | App Review, device sound | Archive validates in Xcode; device check recorded |
| Store copy: keywords that name things the game does not contain ("samurai", "castle") are the owner's call (`docs/store/LISTING.md`) | Apple 2.3.7 | Keywords decided |

## 4. Hosting and operations (blocks online play)

| Task | Blocks | Done when |
|---|---|---|
| Postgres with point-in-time recovery, Redis, two API instances, backup bucket, Sentry, metrics; every production secret | online play | `/readyz` green in production |
| `api.<domain>` (A and AAAA), HSTS, staging and production environments with deploy hooks | deploys | `tools/ops/check-domain.mjs` passes; the server workflow deploys |
| Backups to an owned bucket; one real restore | data safety | Restore drill recorded |
| `npm run server:bench` / `server:load` on the real host | sizing | Numbers recorded |
| Pager, on-call, moderators for reports and deletions, support mailbox, refund/chargeback/ban policies | DSA, UK OSA, store review | Staffed |
| Deploy the server before every game release (this pass changes what the server replays: `docs/backend/REQUESTS.md`) | every release | Release order followed |
| Decide when to switch on local-day retention statistics (`VITE_STATS_TZ`, P7-11) | statistics by local day | Repository variable set (default off) |
| Turn off the old Toadstool Kingdoms Pages site on the same origin | trust, storage collisions | Old site gone |

## 5. Devices, testing and players

Beast Mode OPS-11: the plan and protocols are `docs/store/SOFT_LAUNCH.md` (waves, KPIs, kill lines: OWN-25), `docs/store/DEVICE_MATRIX.md` (devices, cold start ×50, memory, thermal, interruptions: OWN-21) and `docs/store/PLAYTEST.md` (silent first-time playtest: OWN-24). Fill their owner cells and results tables.

| Task | Blocks | Done when |
|---|---|---|
| Measure on real phones (2 GB Android Go, 3-4 GB Android, 2019-class iPhone, current flagships): cold start, memory over 30 minutes, battle FPS, battery, offline, 3G, low storage, kill/resume, Canvas fallback | "works on cheap phones" | Quality thresholds set from the numbers |
| Signed-build store testing: purchases (pending, cancel, restore, refund, reversal), sign-in recovery, push and quiet hours, Android Back, app links, age signals | both stores | Test log kept |
| Whether a preview URL for built-not-live content may exist, and who tests it (P7-12 prepares a manual workflow, off by default) | playtesting unfinished content | Decision recorded |
| Real-player playtests of every number the 2026-11-16 pass changed (Scroll bonus, task targets, Trial growth, defense rewards and later phases) | knowing the changes are right | Playtest notes; model players are not players |
| Mixed-army check of the remaining 13 counter pairs before the Codex may name them (P6-18; `tools/balance/run-counter-check.mjs`) | Codex accuracy | `src/gameplay/data/codex.json` lists every confirmed pair |
| An artist and music (seasonal looks are two colours and a name today) | presentation | Art delivered |

## 6. Beast Mode 2026-11-21 hand-off (Part C of `docs/prompts/BEAST_MODE_2026-11-21.md`)

Code cannot close these. Each row says what the code side already prepared ("ready") and what evidence closes it.
Record the evidence here and in the ledger (`docs/audit/bulletproof-2026-11-21/PROGRESS.md`). Nothing below is done.

| ID | What to do | Code side | Evidence that closes it |
|---|---|---|---|
| OWN-01 | Choose the publisher; bank and tax in both stores; Apple Small Business Program; EU DSA trader declaration | — | Payee accepted in both consoles |
| OWN-02 | Trademark and store-name search for "Kagemura" (USPTO, EUIPO, JPO; classes 9 and 41); a fallback name | — | Search report filed |
| OWN-03 | Final bundle id: `APP_ID`, `strings.xml`, the Xcode identifier, server `APPLE_BUNDLE_IDS` / `GOOGLE_PLAY_PACKAGE` / `GAMECENTER_BUNDLE_IDS` | ready: preflight row, `ALLOW_LEGACY_APP_ID` guard | `npm run release:preflight` has no App id row |
| OWN-04 | Fill every fact in `public/legal-config.js`; date `termsEffective` after legal review | ready: pages say "not published yet", preflight blocks | Live pages show no draft text; preflight has no legal rows |
| OWN-05 | Lawyer review per market; decide `UNDER13_MODE`, COPPA, `EU_JADE_VALUE`, `APPLE_CONSUMPTION_RESPONSE`, the EAA statement | ready: every switch exists with a safe default | Decisions recorded in `docs/legal/MARKETS.md` |
| OWN-06 | Domain, hosting and Sentry regions; `api.<domain>` A and AAAA; HSTS | ready: `tools/ops/check-domain.mjs` | That check passes (IPv6 too) |
| OWN-07 | Apple: App ID capabilities, keys (SIWA, App Store Server API, APNs), notification URLs, privacy label | ready: `PrivacyInfo.xcprivacy` (OPS-10), PRIVACY.md label | Privacy section submitted; a TestFlight build processes |
| OWN-08 | Play: Data safety, target audience 13+, IARC, Age Signals access, deletion URL, service account and RTDN, license testers | ready: PRIVACY.md answers | Every App content form "Completed" |
| OWN-09 | Both age-rating questionnaires (prepared answers in PRIVACY.md) | ready | Ratings shown in both consoles |
| OWN-10 | The 13 in-app products with the `store.json` ids and regional prices; prices checked in 3+ storefronts on phones | ready: store prices only from the store | Screenshots: store sheet vs in-game confirm (USD, EUR, JPY or INR) |
| OWN-11 | Upload keystore; the four `ANDROID_KEYSTORE_*` secrets; offline backups; Play App Signing | ready: the `aab` job | Upload certificate SHA-256 matches Play |
| OWN-12 | First signed AAB to internal testing (Billing ≥ 8, versionCode up, 16 KB) | ready: `android.yml` `target` input (OPS-04) | Run log and Play Console screenshot |
| OWN-13 | Apple signing secrets; first `ios-testflight.yml` run; archive validates with the privacy manifest | ready: manifest in the App target (OPS-10) | TestFlight build, no SDK warning; Xcode privacy report lists the manifest |
| OWN-14 | OAuth web and Android clients; `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_IDS`; reinstall and second-device recovery | ready: preflight blocks the Android build without it (OPS-12) | Test log with date, build and phones |
| OWN-15 | Staging and production servers: GitHub environments with `DEPLOY_HOOK` / `SERVER_URL`, production reviewers, every secret | ready: `server.yml`, staging/production native builds (OPS-04) | Staging contract tests ran; production `/readyz` green |
| OWN-16 | `npm run server:load -- --mix` on staging at the 10× target; size instances, `RESIM_WORKERS`, rate limits; pre-scale for launch | ready: `--mix`, targets in SHIPPING.md 3h (SEC-08) | Run recorded in PVP_ROADMAP step 46; pass criteria met |
| OWN-17 | Sentry game and server projects; DSNs; "Prevent Storing of IP Addresses" on; region; `SENTRY_AUTH_TOKEN`; issue alerts to the pager | ready: source maps (OPS-02), `VITE_DEPLOY_ENV` environments (OPS-04) | A staging test crash shows TypeScript lines; IP storage off |
| OWN-18 | Scrape `/metrics`; load the alert rules; route pages to a pager; uptime check and status page on `/readyz` | ready: runbooks and the Alertmanager example (OPS-07) | A test alert reaches the pager |
| OWN-19 | On-call rota; moderators; support mailbox; refund, chargeback and ban policies | ready: support templates (OPS-13) | Rota published; mailbox answers |
| OWN-20 | Community channel staffed; the known-issues post (OPS-13) | ready: `docs/ops/LAUNCH_DAY.md` rule | Link live; known-issues post pinned |
| OWN-21 | Run the device matrix (`docs/store/DEVICE_MATRIX.md`), a 2 GB Android Go included, renderer kill (OPS-03) | ready: the protocol and results table (OPS-11) | Filled results table for a release build |
| OWN-22 | Signed-build store tests (purchases, refunds, Ask to Buy, sign-ins, push, Android Back, update over the previous build) | ready: `docs/store/TESTING.md` "Native checks" | Each line dated with build and phone |
| OWN-23 | Closed testing: TestFlight external group; Play closed track ≥ 12 testers for 14 days | — | Play shows the 14 days; production access granted |
| OWN-24 | Silent first-time playtest (`docs/store/PLAYTEST.md`) | ready: the protocol (OPS-11) | Notes table filled |
| OWN-25 | Soft-launch markets, dates, targets and kill lines (`docs/store/SOFT_LAUNCH.md`); decision owner named | ready: the plan with starting targets (OPS-11) | Plan signed off before any market opens |
| OWN-26 | Native-speaker review of the 49 machine-translated languages, word lists and store listings | — | Reviews recorded (`docs/localization/`) |
| OWN-27 | Store screenshots from a store-configured build at every size; feature graphic | ready: `npm run store:screenshots` | Screenshots uploaded |
| OWN-28 | Territories (exclude mainland China, Vietnam, Indonesia before PSE, sanctioned markets) | — | Territory list saved |
| OWN-29 | `VITE_PUBLIC_URL` and the App Links / Universal Links files; uncomment the manifest filter and entitlement | ready: preflight blocks a store build without the URL (OPS-12) | A friend link opens the app on both platforms |
| OWN-30 | Backups to an owned bucket (PITR or WAL) and one real restore drill | ready: `tools/ops/restore.mjs` | Drill date and duration recorded |
| OWN-31 | Rehearse a web rollback, a server image rollback and a hotfix on staging | ready: `rollback-web.yml`, `server.yml` `image_tag` (OPS-05), hotfix path (OPS-13) | Times recorded in `docs/store/RELEASE.md` |
| OWN-32 | Tag every store release `v<version>` and update `tools/release/last-release.json` | ready: the version guard (OPS-01) | The tag exists; the previous-client contract runs |
| OWN-33 | Define the offline promise; test long outages after first connection | — | Decision in `docs/DECISIONS.md`; outage test log |
| OWN-34 | Turn off the old Toadstool Kingdoms Pages site on the same origin | — | Old URL returns 404 |
| OWN-35 | Every year: Play target API and Billing deadlines, Apple minimum SDK; rotate keys; renew Apple membership | — | Calendar entries exist |

### Owner decisions this pass is waiting for

| # | Decision | Blocks | Default in code until decided |
|---|---|---|---|
| D1 | How far back a time-window claim may be dated while idle (keep 12 h, or per-device last-contact evidence) | SAV-12, SEC-05 | 12 h (unchanged) |
| D2 | Honor model: should a lost defense cost honor, should wins against generated bases earn honor | GT-01, GT-12 | unchanged (`defenseHonorLossShare` 0) |
| D3 | How much of their loot casual players may lose to raids | GT-06, ECO-04 | unchanged |
| D4 | A duplicate Season Scroll receipt: refund it, or credit it to the next season | ECO-01 | refused for support to refund (409 `purchase.already_owned`) |
| D5 | Certificate pinning: yes or no, and on which hosts | SEC-16 | no pinning (`docs/DECISIONS.md` transport) |
| D6 | Under-18 cap currency: local money from the store's price | ECO-06 | USD with `USD_RATES` |
| D7 | Crash reports: opt-in or ask at first launch; the Sentry project, region and alert routing | STB-12, OPS-02 | opt-in, off by default |
| D8 | `REQUIRE_SERVER_VILLAGE`: on at launch, or after a migration window | SEC-01 | off (`REQUIRE_SERVER_VILLAGE=0`), production warns |
