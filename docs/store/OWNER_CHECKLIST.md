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
| Native-speaker review of the 49 machine-translated languages, of the chat word lists (P7-07) and of any festival names (Phase 5) | quality and cultural fit in each market | Reviews recorded in each `locales/<code>/REVIEW.json` |
| Re-read Apple's age-rating definitions in App Store Connect before answering (prepared answers: `docs/store/PRIVACY.md`, rechecked 2026-11-18 only from a page summary) | App Store | Questionnaire submitted |

## 3. Store accounts, products and forms

| Task | Blocks | Done when |
|---|---|---|
| Apple Developer Program (agreements, bank, tax, Small Business Program); App ID with Sign in with Apple, Game Center, Push, Declared Age Range; keys (Sign in with Apple, App Store Server API, APNs); server notification URLs; DSA trader declaration; privacy label | iOS | App Store Connect shows the app ready for TestFlight |
| Google Play Console (identity, payments, package, Play App Signing, upload key secrets in GitHub, Data safety, deletion URL, target audience, IARC, Age Signals access, service account and RTDN, license testers, 12 testers × 14 days closed testing) | Android | The `aab` job builds and uploads **(preflight: signing secrets)** |
| Create the 13 in-app products with the store ids in `store.json` (`docs/SHIPPING.md` 3b), regional price templates | purchases | Both consoles list them; `npm run store:storekit` matches |
| Firebase/FCM, OAuth web client for Sign in with Google | push, Android sign-in | Build variables set |
| Build variables: `VITE_SERVER_URL`, `VITE_PUBLIC_URL`, `VITE_APP_STORE_URL`, `VITE_PLAY_STORE_URL`, `VITE_SUPPORT_EMAIL`, legal page URLs | online play, links, "Update Kagemura" | **(preflight: server URL)** |
| Territories (exclude where licensing is missing: mainland China, Vietnam, Indonesia until PSE, sanctioned markets) | listing | Store consoles configured |
| First run of the iPhone release workflow on the `macos-26` image (P7-06; it has never run and stops below iOS SDK 26) | TestFlight | A TestFlight build exists |
| Xcode-only steps this pass could not compile (P7-15): add an app-level `PrivacyInfo.xcprivacy` to the App target, check the ambient audio session on a device, build a Game Center / Play Games achievements plugin if wanted | App Review, device sound | Archive validates in Xcode; device check recorded |
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

| Task | Blocks | Done when |
|---|---|---|
| Measure on real phones (2 GB Android Go, 3-4 GB Android, 2019-class iPhone, current flagships): cold start, memory over 30 minutes, battle FPS, battery, offline, 3G, low storage, kill/resume, Canvas fallback | "works on cheap phones" | Quality thresholds set from the numbers |
| Signed-build store testing: purchases (pending, cancel, restore, refund, reversal), sign-in recovery, push and quiet hours, Android Back, app links, age signals | both stores | Test log kept |
| Whether a preview URL for built-not-live content may exist, and who tests it (P7-12 prepares a manual workflow, off by default) | playtesting unfinished content | Decision recorded |
| Real-player playtests of every number the 2026-11-16 pass changed (Scroll bonus, task targets, Trial growth, defense rewards and later phases) | knowing the changes are right | Playtest notes; model players are not players |
| Mixed-army check of the remaining 13 counter pairs before the Codex may name them (P6-18; `tools/balance/run-counter-check.mjs`) | Codex accuracy | `src/gameplay/data/codex.json` lists every confirmed pair |
| An artist and music (seasonal looks are two colours and a name today) | presentation | Art delivered |
