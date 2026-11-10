# Worldwide profitability, runability and store audit

Audit date: **2026-11-05**. Repository: `jimhavlicekpersonal/ninja-version-of-game-1`.
Audited commit: [`40bb2459f2b2bee7d380577c8211ec7058461d03`](https://github.com/jimhavlicekpersonal/ninja-version-of-game-1/tree/40bb2459f2b2bee7d380577c8211ec7058461d03).

## Owner objective and instructions for future AI sessions

Spread Kagemura worldwide and reach as many viable markets as possible, with a commercially sustainable game that is easy to download, install and operate on inexpensive phones and poor internet connections. Assess both the Apple App Store and Google Play. The original audit was read-only; the subsequent instruction authorized saving it in repository AI context. This document and its instruction links implement no game fixes.

- Read this alongside root `AGENTS.md` and the relevant compartment brief. Preserve existing compartment and contract rules.
- All findings start **OPEN**. They describe the audited snapshot, not necessarily a later checkout. Reproduce/revalidate before fixing; earlier "fixed"/"done" roadmap summaries do not close these newer findings.
- Prioritize economy/purchase integrity and submission blockers, then save/recovery/network correctness, low-end usability, internationalization/compliance, and measured commercial expansion, within the user's authorized scope.
- Distinguish reproduced failures, source-confirmed defects, product limitations, recommendations and unverified device/store behavior. Unit tests alone do not establish worldwide readiness, legal compliance, device performance or profit.
- Close findings only with the fixing/reassessment commit, verification, date and remaining limitations recorded here. Preserve original evidence, explicitly supersede disproved findings, and never label a recommendation implemented without evidence.
- Recheck official policies and country requirements before submission. Territory checkboxes do not establish market access. Scope a documentation-only task to documentation; this audit does not independently authorize deployments, purchases or product changes.

## Decision, strengths and verification baseline

The foundation is viable, but this snapshot is **not ready for worldwide commercial launch or broad paid acquisition**. Continue with fixes and controlled testing. Major obstacles: economy exploits, payment reliability, incomplete Android release/recovery, partial offline operation and limited internationalization.

Strengths: a recognizable strategy loop, substantial progression, fifty warriors, practice battles, social features, native billing foundations, no paid random rewards, compact web assets and no mandatory initial login.

| Check | Observed result |
|---|---|
| Existing test suite | 795 passed; 13 skipped |
| Production web build | Passed |
| Server type checking and build | Passed |
| Mobile-browser startup | Successful at 360 x 640 |
| Web build files | Approximately 2.3 MB before transfer compression |
| Main JavaScript bundle | 1.87 MB; approximately 516 KB gzipped |
| Textures at 3x screen density | 218 textures; approximately 121 MB raw RGBA pixels |
| Physical cheap Android/iPhone testing | Not performed |
| Signed App Store / Play installation testing | Not performed |
| Actual revenue, retention and acquisition costs | Unavailable |

Runtime checks used Chromium mobile-browser emulation. Texture bytes sum source width x height x 4; they are not total process/GPU memory or an observed device crash rate. Web build size is not APK/AAB/IPA, installed size or per-device store download size. Skipped tests and untested services are not passes. The isolated test run with network permission passed; an earlier restricted run encountered sandbox socket permissions, not counted as game defects.

## Confirmed findings and closure criteria

Severity: **Critical** = release/economy blocker; **High** = material purchase, progress, usability or retention risk; **Medium** = correctness/trust issue. Paths describe the audited commit. `GLOBAL-*` IDs are distinct from the older F01-style gameplay audit.

### GLOBAL-001 — Critical: deprecated Play Billing library — OPEN (code fixed in db9b88e; signed build and Play submission checks pending)

[`android/app/build.gradle`](../../android/app/build.gradle) uses Billing **7.1.1**. Google's Billing 8+ deadline was August 31, 2026, with extensions ending November 1, 2026; the audit is November 5. This blocks compliant new submissions/updates using that dependency.

Closure: upgrade to a currently supported version, adapt the bridge and verify the signed release dependency graph, pending/cancelled purchases, repeat consumption, restoration and Play submission checks. [Official deadline](https://developer.android.com/google/play/billing/deprecation-faq).

### GLOBAL-002 — Critical: unverified imported currency and premium — FIXED (db9b88e)

Reproduced: [`server/core/villageImport.ts`](../../server/core/villageImport.ts) accepted **20,000 Jade, premium pass enabled and zero purchase records**. Plausible-inventory limits do not establish provenance. Exported local state cannot prove paid value or legitimate competitive progression.

Closure: establish a migration policy that protects legitimate offline progress while preventing invented currency/progression/premium from entering the competitive economy. Validate paid entitlements against trusted records; verify forged saves, sandbox-origin exports, repeated imports and legitimate purchased balances. Do not simply confiscate valid progress.

### GLOBAL-003 — High: receipt finished after failed save — FIXED (db9b88e)

Reproduced with "Quota exceeded": [`controller.ts`](../../src/gameplay/control/controller.ts) returned purchase success and finished the receipt despite failed saving. `save()` catches errors and resolves, so awaiting it does not establish durability. A local-delivery player can lose a paid grant after restarting. Server-held villages have additional recovery but do not make the local path safe.

Closure: durable grant/outbox state before finishing, or a demonstrably trusted recovery path. Verify storage failure and termination at every delivery boundary with exactly-once grants and clear pending status.

### GLOBAL-004 — High: concurrent intents exceed minor cap — FIXED (db9b88e)

Reproduced: two simultaneous $49.99 intents both succeeded, reserving **$99.98 against a $50 cap**. [`purchases.ts`](../../server/core/purchases.ts) checks spend and inserts the intent separately; [`pgRepo.ts`](../../server/pgRepo.ts) likewise has separate operations.

Closure: atomic cap check/reservation across devices and instances. Verify concurrent requests on real Postgres, retries, refunds and UTC-month boundaries.

### GLOBAL-005 — High: cancelled purchases retain cap reservations — FIXED (db9b88e)

`INTENT_HOLD_MS` in [`purchases.ts`](../../server/core/purchases.ts) is 30 minutes; cancellation in [`controller.ts`](../../src/gameplay/control/controller.ts) does not release it. Repeated cancellations can block allowed purchases. Delayed approvals need a policy beyond this window.

Closure: securely resolve failed/cancelled intents without incorrectly releasing genuinely pending purchases. Verify abandonment, delayed approval, expiry and cross-device recovery.

### GLOBAL-006 — High: age restriction is self-removable — FIXED for self-removal (db9b88e); market/legal assessment OPEN

[`economyUi.ts`](../../src/presentation/ui/economyUi.ts) offers an editable age choice; [`village.ts`](../../src/gameplay/sim/village.ts) accepts `setProfile` directly. Players can remove the restriction. The cap is voluntary despite stronger store claims.

Closure: define truthful, appropriate spending protections and age-change behavior for intended markets; verify server enforcement. An under-18 $50 preference is not evidence of legal compliance.

### GLOBAL-007 — High: fixed USD displayed instead of store prices — OPEN (code fixed in db9b88e; real storefronts pending)

[`economyUi.ts`](../../src/presentation/ui/economyUi.ts) formats catalog dollar prices in cards/confirmation. Native plugins expose localized prices but the shop does not use them. Prices can disagree with store sheets, regional pricing, taxes or promotions. Confirmation also exposes internal resource IDs in grant text.

Closure: use store-returned product availability/formatted prices and localized player-facing contents throughout real-money purchase flows. Verify multiple storefronts/currencies, unavailable products and price changes.

### GLOBAL-008 — High: native Android recovery sign-in missing — OPEN (code fixed in db9b88e; OAuth setup and device recovery pending)

[`platform/auth.ts`](../../src/backend/platform/auth.ts) returns no native Android sign-in providers; Google/Play Games bridges are not implemented. A village save code does not authenticate ownership of the online account. Reinstall/device loss can strand account/purchase history.

Closure: supported Android account recovery, verified after reinstall and on another device. Do not equate copied village state with authentication.

### GLOBAL-009 — High: cross-device command sequence collision — FIXED (db9b88e)

[`villageSync.ts`](../../src/backend/net/villageSync.ts) numbers actions independently per device. [`server/core/village.ts`](../../server/core/village.ts) skips `seq <= server seq`; the client removes entries through `ackSeq`. Reproduced: two different commands numbered 1; the first applied, the second received ack 1 with an empty result list and did not apply.

Closure: collision-safe action identities and explicit conflict/rebase behavior, or clearly enforced single-writer sessions. Verify concurrent devices, offline actions, reconnection and retries without silent loss/duplication.

### GLOBAL-010 — High: offline queue storage errors suppressed — FIXED (db9b88e)

The localStorage wrapper in [`connection.ts`](../../src/backend/net/connection.ts) suppresses write errors; [`villageSync.ts`](../../src/backend/net/villageSync.ts) relies on it. Actions can look safely queued while stored only in memory.

Closure: durable queue persistence, surfaced failures and recovery. Verify quota/write failure, process termination, replay and save/queue consistency.

### GLOBAL-011 — High: optional art request blocks boot — FIXED (db9b88e)

[`main.ts`](../../src/main.ts) awaits [`loadArtManifest`](../../src/presentation/render/artManifest.ts), whose fetch has no deadline. In a fresh browser context with service workers blocked, a stalled manifest prevented startup; aborting it allowed startup.

Closure: bounded waiting and a working optional-art fallback. Verify first visit, stalled/missing manifest, offline reload and packaged native assets.

### GLOBAL-012 — High: HTTP timeout excludes response body — FIXED (db9b88e)

[`httpAdapter.ts`](../../src/backend/net/httpAdapter.ts) clears the abort timer after headers and before `res.text()`. A reproduced stalled body remained pending beyond the deadline, potentially blocking sync/queues.

Closure: deadline/cancellation through complete response consumption/parsing. Verify slow headers, stalled bodies, truncated JSON and retry/idempotency behavior.

### GLOBAL-013 — High: recovery only on first reconnect per boot — FIXED (db9b88e)

[`main.ts`](../../src/main.ts) sets `deliveredOnline` once. If automatic unfinished-receipt recovery meets another outage, subsequent reconnects do not repeat it; restart/manual restore may be required.

Closure: retry after reconnection with bounded backoff and exactly-once grants. Verify repeated outages in one session and background pending approvals.

### GLOBAL-014 — High: Build button outside narrow viewport — FIXED (db9b88e)

Measured after skipping tutorial: Build spans **x=298..376** at 320px and 360px viewport widths, leaving 56px or 16px outside. Tested 390px and landscape did not show this overflow. Source: [`styles.css`](../../src/presentation/ui/styles.css), bottom toolbar.

Closure: primary actions visible/tappable at 320/360px with safe areas, longer translations and larger text. Verify bounding boxes and actual taps.

### GLOBAL-015 — High: in-app privacy/support links missing — OPEN (code fixed in db9b88e; publication of live pages pending)

[`hud.ts` Settings](../../src/presentation/ui/hud.ts) lacks a general privacy-policy link/direct support contact. [`LISTING.md`](LISTING.md) and [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) retain draft/placeholder publication steps. Apple requires an accessible in-app privacy-policy link.

Closure: publish accurate policy/support/deletion/community-rules pages; connect in-app/store surfaces; verify live URLs in the submitted build. [Apple privacy guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy).

### GLOBAL-016 — High: contract database not migrated in deployment — FIXED (db9b88e); first CI run pending

[Audited failed run](https://github.com/jimhavlicekpersonal/ninja-version-of-game-1/actions/runs/41957291313): pending migrations caused server exit and contract connection failures; deployment was skipped. [`deploy.yml`](../../.github/workflows/deploy.yml) starts the contract server without migrating its database first.

Closure: migrate the intended disposable contract database and fail clearly on missing readiness. Verify clean-database CI, built-server contracts and deployment prerequisites.

### GLOBAL-017 — High: Android workflow not a commercial release — OPEN (code fixed in db9b88e; signing secrets and Play upload pending)

[`android.yml`](../../.github/workflows/android.yml) builds a debug APK, omits `VITE_PLAY_BILLING=1`, and has no signed AAB release step. [`build.gradle`](../../android/app/build.gradle) fixes `versionCode` at 1, preventing successive Play uploads without manual changes.

Closure: reproducible signed release, explicit commercial configuration and increasing build identifiers. Verify store-delivered install/update and billing; retain a useful separate debug path.

### GLOBAL-018 — Medium: service worker caches error homepage — FIXED (db9b88e)

[`sw.template.js`](../../src/backend/pwa/sw.template.js) caches navigation responses without `res.ok`, allowing a temporary error to replace a working offline homepage. Network-first navigation has no deadline before cached fallback. Precache installation is all-or-nothing and also needs interrupted-download coverage.

Closure: retain a known-good offline shell and bound waiting. Verify 5xx, missing assets, interrupted first downloads, updates and cache consistency.

### GLOBAL-019 — Medium: privacy declarations/defaults disagree — FIXED (db9b88e); owner Sentry setting and legal review pending

[`PRIVACY.md`](PRIVACY.md) / [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) say email is not collected, but [`accountPage.ts`](../../server/accountPage.ts) accepts optional email contact, stored by the server. Reporting is described as player-enabled, while [`prefs.ts`](../../src/backend/platform/prefs.ts) defaults crash reporting on when a DSN exists.

Closure: reconcile collection/defaults, applicable consent, retention and declarations. Reassess linked/unlinked diagnostic claims and error-content scrubbing; do not promise arbitrary error messages can never contain player data without verification.

### GLOBAL-020 — Medium: listing overstates free earnability — FIXED (db9b88e)

[`LISTING.md`](LISTING.md) says everything can be earned by playing; premium access and `passOnly` in [`cosmetics.json`](../../src/gameplay/data/cosmetics.json) contradict the blanket claim.

Closure: distinguish free gameplay, earnable currency and purchase-only access. Verify every listing claim/screenshot against the commercial build.

## Product limitations, risks and unverified areas

These are **OPEN assessment items**, not all reproduced defects or automatic policy violations. Code-actionable parts were addressed in `db9b88e` (see the closure record); every item below stays open until its device, market or staffing evidence exists.

| ID | Risk / limitation | Evidence and required assessment |
|---|---|---|
| R01 | Automatic online migration reduces offline functionality | `main.ts` enables migration; `connection.ts` moves eligible villages; `app.ts` then requires internet for ordinary raids. Queued building actions are partial offline play. Define the promise and test long outages after first connection. |
| R02 | Long outages remove completed raid rewards | `server/core/pvp.ts` tickets expire after one hour; `connection.ts` turns permanently refused reports into practice with no loot/honor. Outbox persistence alone does not guarantee settlement. Assess secure recovery and messaging. |
| R03 | High rendering cost | `main.ts`: high-performance rendering, up to 3x density, 60 FPS; `render/assets.ts`: high-resolution textures. Approximately 121 MB raw pixels is not a cheap-phone safety guarantee. Measure physical-device memory/FPS/battery/context loss. |
| R04 | Frequent Alliance polling | `social/groveSource.ts`: chat/requests every 4s, fuller state every 20s. Measure payload/request volume, high latency, background behavior and cost; assess adaptive polling, deltas and compression. |
| R05 | English-centric UI/names | Embedded strings; `net/names.ts` accepts ASCII letters, excluding many native scripts/accents. Plan Unicode-safe identity, translations, fonts and RTL while preserving uniqueness/safety. |
| R06 | Worldwide moderation unproven | Reporting/blocking/staff tools exist; a short word list cannot establish "no profanity" across languages, obfuscation or harassment. No user-facing terms acceptance flow found. Assess localized rules, moderation staffing and response capacity. |
| R07 | Child protections start at purchase | `EconomyUi.ensureAge` asks under-18/adult only before buying, after account/social access, and does not distinguish younger children. Define appropriate age-related data/social protections for target markets; a spending cap is insufficient evidence. |
| R08 | Native submission behavior unverified | Test Apple sign-in/provisioning, push, sandbox purchase/refund, reinstall, IPv6-only, privacy declarations, current Xcode/SDK, Android WebView compatibility and applicable 16 KB page-size support. Target API 36 is configured; iOS target 15 / Android minimum SDK 24. Do not lower requirements without evidence. |
| R09 | Native acquisition links incomplete | `main.ts` needs `VITE_PUBLIC_URL` for native friend links; native workflows omit it. Universal/app-link setup is incomplete. Verify sharing -> store/install -> intended friend/account. |
| R10 | Accessibility limits reach | `index.html` disables zoom; several controls are small; reduced-motion support is limited. Assess larger text, safe touch targets, reduced effects, screen-reader menus and essential canvas alternatives. |

## Profitability assessment

Profit is **unproven**. Economy exploits undermine paid value; delivery/recovery failures undermine trust. Address them before buying installs.

[`analytics/events.ts`](../../src/backend/analytics/events.ts) retains gameplay events on-device. Purchase accounting uses nominal catalog USD rather than actual localized proceeds. This does not establish country-level acquisition, retention, conversion or contribution margin.

Generated [`CAMPAIGN.md`](../game-theory/CAMPAIGN.md) shows low casual-model raid success at several later Keeps and approximately **390 days to Keep 15**. This is a model result, not measured player retention/revenue. Test frustration/comprehension with users before retuning.

Illustration, not forecast: 100,000 monthly active players x 1% monthly payer conversion x $8 monthly spend/payer = **$8,000 gross monthly revenue**. A 15-30% store commission leaves about **$5,600-$6,800** before other applicable deductions, hosting, moderation, support, development and acquisition. Actual commissions/proceeds depend on eligibility, storefront and arrangements. Downloads alone do not prove profit.

Measure tutorial completion, first successful raid, D1/D7/D30 retention, payer conversion, localized net proceeds, refunds, support burden and backend cost by country/cohort. Compare lifetime contribution with acquisition cost. Collect necessary data only and declare it accurately; adding tracking/ads SDKs is a separate product decision, not an automatic recommendation.

## Recommendation order

1. Repair import provenance/trusted entitlements, durable purchase delivery, atomic cap reservations, cancellation handling and reconnect recovery.
2. Complete supported Billing, signed AAB, explicit billing configuration, increasing build IDs, migrated contract DB and both stores' purchase/refund checks.
3. Deliver Android account recovery and collision-safe multi-device synchronization.
4. Define meaningful offline play, durable queues, secure long-outage settlement and clear connection/reward status.
5. Add a measured low-end mode: assess 30 FPS, reduced density/texture resolution/effects, and lazy unused-tier generation; benchmark memory/startup/download/visual-clarity tradeoffs.
6. Establish physical-device/network gates: 2 GB Android Go-class hardware, common 3-4 GB phones, older supported iPhones, low storage, older WebViews, suspension/termination, airplane mode, repeated outages, 400-800 ms latency and interrupted slow downloads. Measure cold start, peak memory, sustained FPS, battery and MB/hour. Set budgets from evidence, not untested claims.
7. Fix 320/360px layouts, safe areas, larger text, touch targets, reduced motion and accessible menu navigation.
8. Internationalize before translating: strings, Unicode-safe names, store-localized prices, fonts/RTL, help/moderation. Choose languages from market evidence.
9. Publish accurate privacy/support/deletion/community pages, reconcile declarations/defaults, complete current ratings and establish appropriate age-related social protections.
10. Keep a country-by-country access matrix. Complete EU trader declarations. Mainland China needs a separate publishing/licensing/distribution plan; Google Play does not provide broad mainland access. Review applicable requirements in markets such as Vietnam and South Korea. Record current evidence and owner dependencies; territory selection alone does not establish availability.
11. Instrument country/cohort economics conservatively and validate casual progression with real players.
12. Soft-launch in higher-spend markets and markets representative of cheap phones/poor networks. Expand when recovery, stability, retention, moderation capacity and country economics support it.

## Official references to recheck before submission

- [Google Billing deadlines](https://developer.android.com/google/play/billing/deprecation-faq)
- [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Android 16 KB guidance](https://developer.android.com/guide/practices/page-sizes)
- [Apple App Review guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple upcoming submission requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Apple age rating definitions](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/)
- [Apple EU DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)

## Closure record

No implementation findings are closed by this context update. Append later resolutions with: ID; status (`fixed`, `superseded`, `disproved`); fixing/reassessment commit; relevant reproduction/test/device/store evidence; date; remaining limitations. Preserve open owner/account-dependent steps.

### 2026-11-05 — fix pass, commit `db9b88e`

Verification for the whole pass, on the fixing commit: `npm test` with `TEST_DATABASE_URL` (Postgres 16) and `TEST_REDIS_URL` (Redis) set — 104 files, 1,022 passed, 1 skipped; `npm run build`, `npm run typecheck:server`, `npm run server:build`; `npm run server:migrate` on an empty database (20 migrations) and `npm run test:contract` against the built server (17/17); a Playwright smoke run of the built game (`?debug` and the public build) at 360×640 and 320×568 with no page errors. **Not done anywhere in this pass:** physical phones, signed App Store / Play builds, real storefronts, store review, live URLs, legal review. Chromium emulation and unit tests are not device or store evidence.

| ID | Status | What changed | Evidence | Remaining limitations / owner steps |
|---|---|---|---|---|
| GLOBAL-001 | open, code fixed | Play Billing 7.1.1 → **9.1.0** (`android/variables.gradle`); `TkBillingPlugin.java` ported (`enableAutoServiceReconnection`, `QueryProductDetailsResult`, pending/cancelled/already-owned codes, consume after delivery, sticky late-purchase events); CI fails if the resolved Billing is below 8. | The three Java files compile with `javac` against the real Billing 9.1.0 / Credentials 1.6.0 / Google ID 1.2.1 classes (Android/Capacitor types stubbed); the old plugin fails 3 ways against 9.1.0. No Android SDK in the container, so no `./gradlew`. | Full Gradle dependency graph on a runner, pending/cancelled/repeat/restore on a Play-installed build, Play Console submission checks (`docs/store/TESTING.md`). |
| GLOBAL-002 | fixed | `server/core/villageImport.ts` `checkProvenance`: sandbox villages refused (save v14 `flags.sandbox`, set by `GameController` in the sandbox); Jade above `freeJadeAllowance(keep)` (2,000 + 1,000/Keep) plus Jade of purchases this server credited to this player, a premium Scroll without a credited Scroll purchase this season, and unknown purchase records are held (`import_holds`, migration 0020) and reported (`importHeld`); the device adopts the server village and keeps its own as a backup; the 20,000 refusal became a 200,000 ceiling. | `tests/backend/server/villageImport.test.ts` (memory and Postgres): the audit's reproduction (20,000 Jade, premium, no purchases) now keeps 2,000 and drops premium, with a hold row; a checked buyer keeps purchased Jade and the Scroll; the same export on another account (repeated import) has its paid value held; sandbox refused. Allowance measured against model players: regular 2,617 Jade at Keep 15 (day 200), casual 3,694 (day 420). | Legal, legality-checked but edited progression (buildings, research, resources within storage) cannot be told from real offline play; `flags.sandbox` can be removed by editing a save code. Holds are returned by staff through give/take (no dedicated release button). Server must be deployed before games writing save v14. |
| GLOBAL-003 | fixed | `GameController.persist()` reports whether a save landed; device-delivered store transactions are finished only after one did (`awaitingSave`, retried after the next successful save); `PurchaseOutcome.unsaved` warns the player; every path records `<store>:<storeTransactionId>` (the local Play path used a truncated token before). | `tests/backend/net/audit-delivery.test.ts`: "Quota exceeded" on save → purchase reported unsaved, transaction stays open, restart delivers it exactly once and finishes it; freeing space finishes it; crash after save but before finish → recognised, not doubled. | Unit tests with a fake store; not run on a device or with a real StoreKit/Play kill. |
| GLOBAL-004 | fixed | `purchaseIntent` checks and reserves inside `Repo.transaction` after `lockPurchases` (`pg_advisory_xact_lock` per player, shared by every instance). | `tests/backend/server/purchases.test.ts` on memory **and Postgres**: three simultaneous $49.99 intents → exactly one succeeds; month rollover still resets the cap. | Not load-tested across real separate server processes (the lock is database-wide by design). |
| GLOBAL-005 | fixed | Intents carry `hold_until` (migration 0018); `POST /v1/purchases/intent/release`: `cancelled` ends the hold, `pending` holds 7 days; the game calls it on the store's cancelled/pending answers. A purchase arriving for a released intent is still credited and counted. | Server test: cancel frees the cap, pending holds past 3 days, another player's or a used intent cannot be released, the approved purchase counts; game test: cancelled and pending release calls. | A modified client could release a hold and then pay (the store's own parental controls still apply). |
| GLOBAL-006 | fixed (self-removal); open (markets) | Sim `setProfile` refuses under-18 → adult; server keeps the stated group (`player_age`), ignores a later "adult" from any device or village, refuses the command for a server-held village; staff `reset-age` (admin tool, audited) after a support check; shop/Settings text says so. | Server test (memory and Postgres) and existing economy tests. | Still self-declared, not age verification; a village reset on a device without a server can ask again. Whether this is appropriate for each market (and Apple/Google age-range APIs) is an owner/legal decision. |
| GLOBAL-007 | open, code fixed | `PaymentProvider.prices` (StoreKit `displayPrice` + currency; Play `formattedPrice`/currency/micros); shop buttons and confirm use only store prices, "Not sold here" when a store does not return a product, "Price unavailable" when it cannot be asked; grant text uses player-facing names; sandbox shows catalog prices marked "(test)"; Settings says spend totals are USD list prices. | `tests/backend/android-native.test.ts` (Play mapping); Playwright: sandbox store shows "(test)" prices. | Not checked against real storefronts/currencies, price changes or unavailable products on devices. The under-18 cap and analytics still count catalog USD, not local proceeds. |
| GLOBAL-008 | open, code fixed | `TkAuthPlugin.java` (Credential Manager, `GetSignInWithGoogleOption` with the build's `VITE_GOOGLE_CLIENT_ID`), registered in `MainActivity`; `platformSignIn` offers Google on Android. Server needs no change (token `aud` = web client id). | `tests/backend/android-native.test.ts` (10 tests including server acceptance of `aud`=web id, `azp`=Android id). | Owner: Google Cloud OAuth clients (web + Android with Play signing SHA-1). Reinstall and second-device recovery not tested. Play Games not implemented. |
| GLOBAL-009 | fixed | Each queue has a random `device` id; `CommandBatch.device`; server keeps the last number per device (`villages.device_seqs`, migration 0019, 16 devices) and numbers its log itself; `VillageSync.refused` counts refused commands. | `tests/backend/net/villageSync.test.ts`: two devices' "command 1" both applied (fails on the old client), a resent batch changes nothing, the second device rebases by correction. | A genuinely conflicting action (both devices build on the same tile) is refused and counted, not merged; the HUD does not list refused actions yet. Older games keep the old counter. |
| GLOBAL-010 | fixed | `KeyValue.trySet`; queue and outbox writes report failure (`storageProblem`); main.ts tells the player once; the queue is sent immediately. | `villageSync.test.ts`: a failing store sets the flag and the queue still reaches the server. | localStorage writes are synchronous, but termination right after a failed write still loses what was not yet sent. |
| GLOBAL-011 | fixed | `loadArtManifest` always settles within 2.5 s (headers, body, parse), falls back to the last good copy or code art; a late answer is cached for next launch; 20 s per real-art image. | `tests/presentation/render/artManifest.test.ts` (6 tests: never-answering fetch, stalled body, late answer, offline/503/truncated, 404). | Not checked in a real first visit, offline reload or packaged native build. |
| GLOBAL-012 | fixed | `httpAdapter` keeps one deadline over fetch, body read and JSON parse; stalled body → retryable timeout; truncated JSON → retryable network error. | `tests/backend/net/httpAdapter.test.ts` (12 tests; 8 fail on the old file). | A write with an unknown outcome still relies on tickets/outbox/idempotency for safety. |
| GLOBAL-013 | fixed | main.ts retries undelivered receipts on every reconnection and app resume, with backoff 15 s → 15 min while any are left (`deliverUnfinishedReport`); also delivers on start without a server. | `audit-delivery.test.ts`: two outages in one session, then delivery once on the next reconnection. | The main.ts wiring is not unit-tested (no DOM in `npm test`). |
| GLOBAL-014 | fixed | Bottom bar sizes step down at 389/345 px (never below 44 px), Attack/Build share a grid; landscape rail no longer overlaps. | Playwright: Build x=250..312 at 320 px and 280..348 at 360 px (was 298..376), taps open Build; 390 px unchanged; longer labels and ×1.3 text stay on screen; `tests/presentation/store-compliance.test.ts`. | Real safe-area insets and phones not tested; long translated words break mid-word until the text layer exists. |
| GLOBAL-015 | open, code fixed | Settings → Privacy and help: privacy policy, support, community rules, optional support email, account deletion; pages shipped in `public/` (`privacy.html`, `support.html`, `community.html`), overridable with `VITE_PRIVACY_URL` / `VITE_SUPPORT_URL` / `VITE_COMMUNITY_URL` / `VITE_SUPPORT_EMAIL`. | Playwright: links present and open; pages return 200; compliance tests check for placeholders. | Owner: fill `public/legal-config.js` (operator, contact), legal review, deploy, confirm live URLs in the submitted build. Native in-app frame behaviour untested on devices. |
| GLOBAL-016 | fixed | `deploy.yml` migrates the disposable contract database after `server:build`, waits for `/readyz` (60 s, prints the log on failure). | Locally: unmigrated DB fails clearly; migrated DB → ready, `test:contract` 17/17 (repeated on `db9b88e`). | The next GitHub Actions run is the first CI evidence. |
| GLOBAL-017 | open, code fixed | `android/app/release.gradle` (versionCode/versionName from properties or env, upload-key signing from env or ignored `keystore.properties`); `android.yml` keeps the debug APK and adds a signed `bundleRelease` job with `VITE_PLAY_BILLING=1`, versionCode = run number + offset, signature and native-library checks. | Gradle 8.14.3 scratch-project checks of every configuration path; `tests/backend/release-config.test.ts`. | Owner: keystore and secrets, Play App Signing, first upload, store install/update and billing on a device. |
| GLOBAL-018 | fixed | Service worker: versioned cache, only 200 same-origin non-redirected responses cached, shell written last, failed install leaves the old cache serving, navigation network-first with a 3.5 s fallback, error pages never cached. | `tests/backend/pwa/serviceWorker.test.ts` (12 tests in a fake SW environment); built `sw.js` passes `node --check`. | Not tested in real Chrome/Safari/WebView or with real interrupted downloads/quota. |
| GLOBAL-019 | fixed | Crash reports default **off** (opt-in; devices that never chose stop sending); deletion page no longer asks for or stores email (server ignores `contact`); `sentryEnvelope` scrubs query strings and email-shaped text; PRIVACY.md and the policy declare support email, web deletion, friends/Gangs/duels, server error reports, host IP logs. | `store-compliance.test.ts`, `core.test.ts` (an email sent by an old page is not kept). | Owner: enable Sentry "Prevent Storing of IP Addresses"; legal review of declarations; error messages may still contain player text (stated as such). |
| GLOBAL-020 | fixed | `LISTING.md` separates free gameplay, earnable Jade and purchase-only items (premium Scroll, its `passOnly` look, offers) and records the basis of each claim; offline play, languages and age protections are not claimed. | `store-compliance.test.ts` (no "everything can be earned"). | Recheck screenshots and listing text against the commercial build before submission. |

| Risk | Status | What changed in `db9b88e` | Still needed |
|---|---|---|---|
| R01 | open | The offline message for a server-held village names what still works (build, train, research, collect, Shadow Trials, practice battles, all queued). | A written offline promise in the listing/help and long-outage testing on devices. |
| R02 | open (mitigated) | Raid (`pvp`) reports are accepted up to 72 h after the ticket expires (`LATE_REPORT_MS`; retention keeps those tickets); tests in `core.test.ts` and `online-authority.test.ts` (a 48 h outage settles with loot). | Reports later than 72 h still become practice; messaging for that case. |
| R03 | open (mitigated) | Low-end profile (`render/quality.ts`: auto from device memory/cores, `?quality=`, Settings → Display → Graphics): canvas ≤2x, 30 FPS, default GPU, smaller textures, lazy building tiers, fewer particles. Emulated 360×640 DPR 3, CPU ×4: textures 115.3 → 23.5 MB, cold start 8.4 → 4.7 s, JS heap ~137 → ~44 MB (`npm run perf:lowend -- --quality`). | Physical 2 GB / 3–4 GB Android and older iPhone measurements (memory, sustained FPS, battery, context loss); HUD FPS readout over-reports at 30 FPS. |
| R04 | open (mitigated) | Alliance polling pauses while hidden, never overlaps, backs off on errors (to 60 s) and slow answers; unchanged when visible and healthy (`groveSourcePolling.test.ts`). | Payload sizes, deltas/compression, server cost, native background behaviour. |
| R05 | open | Unicode-safe names landed before this pass (`60862da`). | The game still shows English only; text layer, fonts/RTL, localized help. |
| R06 | open | `public/community.html` (checked against staff tools), linked in Settings; a one-time acknowledgement before the first chat message to real players or opening Friends (`ui/communityRules.ts`). | Localized rules, moderation staffing and response targets, broader filters. |
| R07 | open | Only the spending side changed (GLOBAL-006). | Age-appropriate data and social protections per market, younger-child handling. |
| R08 | open | Android target/compile 36, min 24, no native libraries in the added AARs (16 KB safe); CI lists native libraries; iOS workflow prints Xcode/SDK and warns below iOS SDK 26; RELEASE.md checklist. | All native submission behaviour on devices and in store review. |
| R09 | open | `VITE_PUBLIC_URL` added to the Android and iOS workflows, so shared links open the web game. | `@capacitor/app` + `appUrlOpen`, a domain serving `assetlinks.json` / `apple-app-site-association`, then App Links / Associated Domains (`docs/SHIPPING.md` 1b). |
| R10 | open (mitigated) | Page zoom allowed (canvas keeps pinch via `touch-action`), close/toggle targets ≥44 px, invisible 44 px hit areas on small pills, a global reduced-motion block. | Real pinch-zoom check on devices, screen-reader menus, larger-text support in px-sized HUD, canvas alternatives. |

## Re-audit (2026-11-05, second pass) and fix record

A deeper re-audit the same day, at HEAD `f378ce2`, used five independent read-only reviews: server/payments (adversarial, including the first fix pass), client runtime (Chromium with CDP CPU/network throttling), store compliance and legal congruency (official policy pages rechecked where reachable), game design/psychology, and art/game feel (screenshots of the running game). The owner then asked for every finding to be fixed. Fixes landed in the commits up to `b93e8f4` (work-in-progress snapshots `6493237` … `e18a800`, integrated in `b93e8f4`).

**Verification on `b93e8f4`:** `npm test` with Postgres 16 and Redis (117 files, 1,147 passed, 1 skipped); `npm run build`; `npm run typecheck:server` (0 errors); `npm run server:build`; `npm run server:migrate` on an empty database (24 migrations); `npm run test:contract` against the built server (17/17); Playwright smoke of the built public and sandbox game at 360×640, 390×844 and 844×390 (no page errors). The reviewers' reproduction scripts were rerun after each fix where named below. **Still not done anywhere:** physical phones, signed store builds, real storefronts, App Review / Play review, live URLs, legal review, real players.

Status words: **fixed** (code + automated evidence), **partly** (improved, target not fully met), **owner** (needs owner, legal, store or device action; code or drafts prepared).

### Server, payments and battle integrity

| Finding (re-audit) | Status | Fix and evidence |
|---|---|---|
| Refund before redeem was dropped; the kept receipt then credited for good (reproduced: Jade 500 → 780) | fixed | `refund_notices` (migration 0021); `redeem` refuses a refunded/voided transaction; `reaudit-integrity.test.ts` |
| Unreported battles cost nothing (offline replay of a known seed, report only wins; war tickets unlimited) | partly | Raids: `POST /v1/attacks/start` on Attack; a started raid never reported settles as a 0-star loss (`forfeitExpired`, hourly); one open raid ticket per attacker (a new match voids an unstarted one). Wars: an issued ticket uses the attack. **Limit:** a modified client can skip the start call and void unstarted tickets; only server-timed input or attestation closes that. |
| Held tickets bypassed the defender's shield (reproduced: three 3-star payouts after a 16 h shield); the R02 late window made it practical | fixed | Settlement after someone else's raid is practice (`409 defender_protected`); one open raid per attacker; reproduction now refused (`reaudit-integrity.test.ts`) |
| Backdated commands ("time travel": import dated a year back, a Keep upgrade already finished) | fixed | Import dated by the server clock; command time clamped to `now − MAX_BACKDATE_MS` (12 h); `reaudit-hardening.test.ts` |
| Battles on the request thread with a client base (`abandonBattle` 0.8–1.2 s for a forged base) | fixed | `abandonBattle` no longer simulates (spends the deployed warriors); battle commands capped per minute (6, shared limiter) |
| One ticket re-simulated forever | fixed | Server-held troops checked before re-simulating; ticket burned after 3 refused reports |
| IP rate limits spoofable (`TRUST_PROXY=true`) or global (unset) | fixed | Production requires a hop count/CIDR/`false`; IPv6 keyed by /64; CGNAT-sized limits; restore drill sets `TRUST_PROXY=false` |
| Game Center fetched any `*.apple.com` URL, unbounded | fixed | Only `static.gc.apple.com/public-key/*.cer`, 16 KB cap, 5 s timeout, LRU |
| Refused commands filled the DB (10.6 GB/day/token) | fixed | Refused commands logged by type only, size cap, no village rewrite when nothing applied (repro: 0.0 MB) |
| Idempotency lookup before auth/limits | fixed | Moved after the limiter and auth |
| GLOBAL-002 import gaps (forged stats/achievements/pass points/pass-only look) | fixed | Reached counters count as claimed; unpaid pass looks dropped; recorded purchase grants used |
| Sandbox purchases credited on production | fixed | `SANDBOX_CREDIT_CAP_USD` (default $10/player) on production |
| Spend-then-refund kept the value; reversals not re-granted; repeat refunders unchecked | fixed | Refunded spent Jade becomes a debt (negative balance); `REFUND_REVERSED` re-grants; 3 refunds in 90 days pause purchases. Apple `CONSUMPTION_REQUEST` is not answered (needs customer consent the game does not collect: documented choice). |
| Postgres pool defaults, unverified TLS (and `sslmode` overriding `ssl`) | fixed | Pool/timeouts env; TLS verified unless explicitly allowed; production refuses unverified |
| Redis outage stalled every request 5 s | fixed | 500 ms timeout, fail-open limiter, DB leaderboard fallback, `RedisDown` alert |
| Match-lock griefing | fixed | One open raid per attacker; voided tickets release locks |
| Purchases shared the moderation rate bucket | fixed | Own `purchase` rule |
| Legacy batch silently dropped after device numbering | fixed | `426 version_mismatch` |
| Tokens never revoked; JWKS refetched per unknown `kid` | fixed | Provider-scoped tokens revoked on unlink, "sign out other devices", 400-day prune; JWKS refetch throttled |
| One shared admin secret | fixed | `ADMIN_TOKENS` per staff member, `ADMIN_ALLOW_IPS` |
| No response compression | fixed | gzip/br for JSON ≥ 1 KB |
| Backups to GitHub artifacts won't scale | owner | `docs/SHIPPING.md` §3h (PITR/WAL to an owned bucket) |

### Client runtime (Chromium emulation; not device results)

| Finding | Status | Fix and evidence |
|---|---|---|
| Permanent splash if the main script fails | fixed | Inline ES5 boot guard with Retry (`src/backend/pwa/boot.js`); `boot.test.ts`; reviewer t2 |
| `structuredClone`/`.at()` missing on iOS 15.0–15.3 / old WebViews | fixed | Polyfills + "needs a newer browser" check; t11 boots |
| 4–14 s main-thread freeze after the splash; start-up toasts lost | fixed | Texture painting in slices, splash until first frame, queued toasts, persistent banners. Longest block at CPU×6: high 13.8 → 4.5 s, low 4.9 → 2.4 s. The island painter (~4 s at CPU×6) is still one task. |
| Auto quality picked high for 4 GB Android, low for every iPhone | fixed | New rule + 2 ms canvas fill test; threshold not calibrated on devices |
| ~600 KB first load, full Phaser | partly | Custom Phaser build: 526 → 389 KB gz on the same snapshot (current tree 422 KB with the new features). Lazy-loading Friends/Gang panels (~20 KB) not done (needs a HUD restructure). |
| Android Back unhandled | fixed | `@capacitor/app`, Back closes the top dialog / leaves battle / confirms exit (not run on a device) |
| Safari 7-day eviction silently erases web villages | fixed | `persisted()` check, weekly "Keep it safe" banner (Home Screen, sign-in, save code) |
| iOS zoom on inputs < 16 px | fixed | Inputs `max(16px, 1em)` |
| IndexedDB hang / lost connection | fixed | 5 s open timeout → memory with banner; reconnect on close/errors; `idb.test.ts` |
| SW downloaded everything twice | fixed | Hashed assets from the HTTP cache (t1: 2× → 1×) |
| Update loop; newer-save dead end | fixed | Save → `registration.update()` → wait → reload; boot error with Update/Copy save code |
| Store prices cached forever / no timeout | fixed | 10 s timeout, empty/partial = retry |
| Connection ignored online/offline/resume | fixed | Event-driven sync; `connectionNetwork.test.ts` |
| Real memory ≈ 2× texture figures | fixed / corrected | Third copy (blank ImageData) removed. Measured process growth at 360×640@3x: high ≈480 → ≈345 MB, low ≈180 → ≈160 MB (R03 figures above counted textures only). |
| iPhone flagships may get 30 FPS | partly | Core count no longer decides on iOS; device check needed |
| Dialog a11y, UTF-16 maxlength, idle battery | fixed | Focus trap/labels; code-point limits; village idles at 20 FPS (CPU 102% → 37% in emulation) |

### Compliance and legal (drafts are not legal advice)

| Finding | Status | Fix |
|---|---|---|
| No store age signals (Texas SB 2420 since 2026-06-04, Play Age Signals) | partly / owner | iOS Declared Age Range (iOS 26+) and Play Age Signals 0.0.4 plugins + neutral age screen (bands under 13 / 13–17 / adult, one-way stricter). Native code unverified on devices; PermissionKit significant-change flow not built. |
| iOS entitlements missing (Apple sign-in, Game Center, push) | fixed / owner | `App.entitlements` + `CODE_SIGN_ENTITLEMENTS`; owner enables capabilities on the App ID |
| Minors online unprotected; public discovery defaults | fixed / owner | Under 13: preset chat phrases only, generated name, not findable; 13–17: private defaults; no offers for under 18. COPPA decision for under-13 accounts is the owner's. |
| UK Online Safety Act duties | owner | `docs/legal/ONLINE_SAFETY_UK.md` (risk assessments, measures, gaps, complaints); links/emails/phone numbers stripped from chat |
| Web deletion: name-only requests unusable; anyone could request another's deletion | fixed | One-time deletion code from Settings; staff act on verified requests only |
| Sign in with Apple tokens not revoked | fixed / owner | Code exchange, revoke on delete/unlink, server notifications endpoint; owner sets Apple keys and registers the URL |
| Data safety / age rating / GDPR Art. 13 / terms / Japan / other markets | owner | `PRIVACY.md` re-walked (chat = Messages, name = Personal info), age rating 13+ guidance, rewritten `privacy.html`, draft `terms.html`, `tokushoho.html`, `shikin-kessai.html`, `docs/legal/JAPAN.md`, `docs/legal/MARKETS.md`. Publisher facts in `public/legal-config.js` stay empty until filled. |
| Offers' pressure (first-session pop-ups, post-loss offer after simulated raids, under-18) | fixed | All offers ≥ 24 h account age, the post-loss trigger retired, no offers for under-18/unknown age, "back again later" wording |
| DSA statement of reasons for moderation | fixed | Notices to reporters and affected players with reason and appeal route |
| Japan paid-balance tracking | partly / owner | Storefront, currency and price recorded per purchase (migration 0023); the staff report for the ¥10M threshold is specified in `docs/legal/JAPAN.md`, not built |
| Season Scroll product type ambiguous; season end not shown | fixed / owner | Consumable in both stores (documented); "season ends in N days" on card and confirm; sale closes in the last 4 days unless 15 tiers are unlocked |
| Android exact-alarm permission; backup copied tokens | fixed | Permission removed; backup rules exclude WebView localStorage (paths not verified on a device) |
| Export compliance key missing | fixed | `ITSAppUsesNonExemptEncryption=false` |

### Game design and psychology (model-player numbers, not players)

| Finding | Status | Fix and evidence |
|---|---|---|
| Day-2 return: unwinnable bot 3-star then a $2.99 pop-up | fixed | First 3 bot raids capped (held 12/12 test raids with the tutorial's Kunai Tower), post-loss offer retired, "settle the score" rematch, held defenses pay 5% loot |
| First raid: points off-screen on portrait/landscape | fixed | Camera fits all open points, edge chevrons, first-raid coach; real taps deployed on all 6 points at 360/390/844 widths |
| Offline Alliance presented bots as people | fixed | "Training Alliance (computer clan)" on every surface |
| Late-game failure loop | partly | Strength = Keep the research matches: regular Keep 15 avg stars 0.50 → 1.40; casual with the new suggested army 1.1–2.2 at Keeps 9–15 and Keep 15 on day 266 (was 390). The pure "explorer" casual policy stays under 1 star. |
| Shadow/Air/Support armies non-viable | partly | Shadow ×1.5 budget + stealth: Keep 15 destruction 44 → 66%, 11% three-star; Air and Support reach 15% three-stars only on their home layouts |
| "Free" Artisan's Hut took Jade | fixed | Price shown, Jade confirm |
| No sub-$2 entry, no monthly product | fixed / owner | $0.99 Pinch of Jade, $2.99 Clan Stipend (30 daily claims); owner creates the store products |
| Offers unscaled; false Artisan's Bundle copy | fixed | `productGrantsFor` (Keep-scaled, storage-capped, excess as Jade); trigger guarded |
| Pass looked worse than a pack; day-29 sales | fixed | 340 premium Jade, "≈ N Jade value", late-season sale rule |
| Impossible star tasks | fixed | Adaptive targets from the recent star rate, destruction tasks |
| Keep 5→6 wall, flat 168 h builds | partly | Keep 6 cost 850k → 500k, Keeps 10–15 4–6.5 days; casual 5→6 still ~26–28 days |
| Events were passive buffs | partly | Bounty Hunt goal event implemented; Trial tower and Gang shared goal specified only |
| Too many concepts early; collecting/defending untaught | fixed | Progressive rail, filters hidden until 5 warriors, tutorial steps for Collect and a Kunai Tower, waiting taught before Jade |
| Leftover/pastiche names; religious objects as weapons | fixed / owner | Renames (Ember League, Shuriken Tower, Stone Sentinel Statue, Bitter Smoke Brazier, Alarm Bell Tower, "Hollow" raid targets, Japanese bot surnames); keeping "Jade" and a native cultural review are owner decisions |
| No story, cast, differentiation, empty world at launch | owner | Sensei Hoshi portrait and moods added; story chapters, heroes, regional launch and NPC rival clans are product decisions |

### Art and game feel (emulation screenshots; not judged on devices)

| Finding | Status | Fix |
|---|---|---|
| 37 of 50 warriors looked identical | fixed | Role silhouettes, matching badges, role rings, larger tier 4–5 |
| Upgrades invisible for many levels | fixed | Keep 6 tiers, defenses 5, a visible change at every level (tested) |
| Village barely moved; flat first impression | fixed | Smoke, shimmer, banners, sparring, villagers, birds, mountains/fog/sun, tighter camera (the pixel-change measure moved little: 1.95% → ~2%) |
| Flat destruction/victory; unreadable fights | fixed | Ruins by family, Keep collapse with slow motion, star slams, 100% banner, loot count-up, readable projectiles, tracers, hit flashes, death puffs |
| No haptics; chiptune sound | fixed | `@capacitor/haptics` (Settings switch), koto/shamisen/taiko sound (not listened to by a person) |
| Chest, mentor, Codex stacking, crowded HUD, Settings order, disabled buttons, fonts | fixed | Chest reveal, Sensei portrait, isolated dialogs, top stack 21.8% → 11.4% at 390×844, Advanced section, locked tags, name font stack (no extra font files: size) |
| Generic motifs | fixed | Roof materials by family, original kamon set |

**Remaining for the owner (no code can close these):** physical-device and store testing on both platforms; App Store / Play product setup (new `jade_pinch`, `clan_stipend`); Apple/Google keys and capabilities; publisher facts and legal review of the drafts; UK OSA responsible person; Japan seller facts and the unused-balance report; the COPPA position; market selection (`docs/legal/MARKETS.md`); deploy the server before the game (save v16, SIM_RULES 4, migrations 0018–0024); a native-speaker cultural review; real-player playtests of the casual curve.

## Third pass (2026-11-05, state-of-the-game report)

A third, read-only audit at `2a4b222` across ten areas (hardware, art, economy, game theory, store compliance, backend, languages, code quality, retention and marketing, missed items) is recorded in [`docs/audit/STATE_OF_THE_GAME.md`](../audit/STATE_OF_THE_GAME.md), with seven detailed area reports under `docs/audit/areas/` and screenshots under `docs/audit/screenshots/`. It re-checked a sample of the fix claims above (its section 4 lists the ones that do not hold in current code, e.g. attack-commit, texture memory bounds, the auto-quality fill test, the Play Age Signals plugin) and lists the owner tasks needed to publish (its section 6). No findings above are closed by it; nothing in the game was changed.

### 2026-11-05 — ledger fixes (state-of-the-game report, section 5 step 1), commit `1f559ef`

Verification on `1f559ef`: `npm test` without Postgres or Redis (118 files, 1,047 passed, 14 skipped: the Postgres and Redis adapter tests, so migration 0025 and `PgRepo.lockPlayer` ran in no test here); `npm run build`; `npm run typecheck:server`; `npm run server:build`; a Playwright run of an offline raid through the new asynchronous Attack button at 360×640 (no page errors). New tests: `tests/backend/server/ledger-audit.test.ts` (12), `tests/gameplay/sim/ledger-audit.test.ts` (4), plus cases in `social.test.ts`, `gang-abuse.test.ts`, `connection.test.ts` and `villageSync.test.ts`. The defender-race test and the war-chest tests were run against the code before the fix and fail there. **Not done:** Postgres/Redis runs, the contract tests against a deployed server, devices, real players.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| A1 loss hiding (free voids, hidden losses) | fixed, partly closes the wider problem | `match` sends no seed; `POST /v1/attacks/start` returns it (protocol 10, feature `seed-at-start`; `match` from older games gets 426). A started raid with no report `REPORT_GRACE_MS` (8 min) after Attack is forfeited at the next match (honor and, against a player, the Attack Rating, which forfeits never moved before). The game sends waiting reports first (`sendReportsBeforeMatch`) and does not start a battle without the server's seed. | `ledger-audit.test.ts` (seed only on start, grace, forfeit with rating, report within grace); core and contract tests updated. | Measured: the seed only scatters spawns and projectiles. Over 24 bot plans × 40 seeds the stars were identical in 21 plans and a guessed seed predicted win/loss 98% of the time. So a modified game can still simulate offline and start only raids it expects to win; what it can no longer do is play a raid and hide the loss. For server-held villages the next row makes that cherry-picking cost Next; device villages in PvP stay client-trusted (owner decision, roadmap step 1). A second device or a long offline gap after a started raid can turn an honest late report into a forfeit (the game sends reports before matching, which covers the usual case). |
| E15 free rerolls | fixed for server-held villages | A server-held village gets its open unstarted ticket back until it scouts again (the free first look after a raid, or a paid Next replayed from the game's `scout` command); no scout at all → 409. Ticket field `scoutSeed`, migration 0025. | `ledger-audit.test.ts` (same scout → same ticket; paid Next charges the fee on the server and gives a new one). | Device villages pay Next only on the device. Migration 0025 not yet run on Postgres here. |
| A6 two reports on one defender | fixed | `attack()` takes `Repo.lockPlayer` on both players in id order (`lockPlayers`: Postgres advisory transaction lock), then re-checks the shield and re-reads both players inside the transaction; `forfeitTicket` locks the same way. | `ledger-audit.test.ts`: two simultaneous reports pay once, the other is `defender_protected` (fails without the in-lock check); a report after a forfeit writes honor from the post-forfeit value. | Only the in-memory repo ran here; the Postgres lock path is untested in this container. |
| A4 under-18 cap bypass at redeem | fixed | Redeem locks the player's purchases; a receipt with no open intent of this player (no token, an already used token, a pruned one) is credited only if this month leaves room under the cap (`holdOverCap`); otherwise `403 purchase_refused`, nothing credited, and the store transaction stays unfinished (the game offers it again at each start; Google refunds unacknowledged purchases after 3 days). | `ledger-audit.test.ts` (no intent within/over cap and next month; reused token; adults unchanged). | Apple purchases held this way need the player or parent to ask Apple for a refund, or wait for the next month. Legal review of the wording is an owner step. |
| A5 refunds leave spent resources | fixed (debt), counting per store identity not done | `revokePurchase` takes back every resource; what was spent becomes a negative balance (save v17: no field change, an older build stops at the save instead of calling it damaged). Raids never take from or wipe a debt; `staffAdjust` grants repay debts first and never create one (a reversed refund used to wipe a debt through the zero floor). | `tests/gameplay/sim/ledger-audit.test.ts`. | Refund pauses still count per player id; the stores give no account identity to count by (Apple `appAccountToken` is per intent). Apple `CONSUMPTION_REQUEST` is still unanswered (owner decision). The HUD shows a negative balance as a plain negative number. |
| A2 / E11 forged or clock-skipped imports | partly fixed | Above Keep 5, an import needs an account at least `IMPORT_AGE_SHARE` (0.5) of the regular model player's days to that Keep (Keep 6: 5.2 days … Keep 15: 60.6), else `403 cooldown` with the wait; the game retries a day later instead of giving up for good. New per-IP rule `villageImport` (60/h). | `ledger-audit.test.ts` (Keep 15 refused on a new account, accepted once old enough; Keep 5 at once); `villageSync.test.ts` (automatic retry after the wait). | Accounts registered early and left to age still pass; the server still cannot tell offline play from an edited save. Closing that needs the owner's decision to create every online village on the server at first contact. A paying player who rushed offline also waits. |
| E12 offline war chest paid without playing, for every missed week | fixed | `social.json` `groveRaid.chestMinAttacks` (1) and `settleWeeksMax` (2). | `social.test.ts` (skipped war pays nothing; a year away settles 2 wars, no Jade). | Online Alliance War chests still pay members who did not attack (E14, not in step 1). |
| E13 bot Gang War Jade faucet | fixed | `gangWar.generatedOpponentJade: false`; the claim answers `generated` and the game applies the same command. | `gang-abuse.test.ts`. | Bot Gang War resource chests are unchanged. |

### 2026-11-05 — deployability (state-of-the-game report, section 5 step 2), commit `fb81097`

Verification on `fb81097`: `npm test` without Postgres or Redis (119 files, 1,060 passed, 14 skipped); `npm run build`; `npm run typecheck:server`; `npm run server:build`. The built server (`node dist-server/main.js`, memory storage, one worker) was started and sent SIGTERM: `/readyz` 200 before, 503 with `draining: down: shutting down` during the drain, then "shut down" and exit. `tools/release/deploy.mjs` and `check-server-rules.mjs` were run without secrets (warning, error with exit 1 for production, notice). Every workflow file still parses as YAML. **Not done:** a real host's SIGTERM and load balancer, a real Redis outage, real Google or FCM endpoints stalling, a GitHub Actions run of the changed workflows (the next push is the first).

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| A9 no graceful shutdown | fixed | `server/shutdown.ts`: on SIGTERM/SIGINT `/readyz` answers 503 for `SHUTDOWN_DRAIN_MS` (5 s), timers stop, then HTTP (in-flight requests finish), re-simulation workers, Redis and the Postgres pool close; `SHUTDOWN_DEADLINE_MS` (25 s) later the process exits 1 regardless. The Docker image runs Node as PID 1 with the handler. | `deployable.test.ts` (order, failing step, deadline, second signal, `/readyz` 503 while draining); the built-server run above. | The drain only helps if the host's load balancer polls `/readyz` and its kill timeout exceeds the deadline (owner settings, `docs/SHIPPING.md` 3g). A battle report cut by a hard kill is retried by the game's outbox as before. |
| A10 outbound calls without timeouts | fixed | `server/outbound.ts` `timedFetch` (`OUTBOUND_TIMEOUT_MS`, 10 s, headers and body, a caller's own signal kept) wraps the fetch given to Google Play, FCM, Apple/Google key sets, Game Center and Play Games. APNs already had a 10 s HTTP/2 timeout; Sign in with Apple token calls and Sentry already had their own. | `deployable.test.ts` (stalled headers, stalled body, bodiless statuses, caller abort). | Not tried against the real endpoints. |
| A8 rate limits fully open while Redis is down | fixed | `RedisRateLimiter` falls back to a per-instance `MemoryRateLimiter` on any Redis error. | `reaudit-hardening.test.ts` (a down Redis still refuses the third registration of a key). | During an outage each instance counts separately, so N instances allow N times a limit. |
| A21 periodic jobs on every instance | fixed | Retention (with the raid forfeit sweep), voided-purchase polling and Gang War reminders run only while the instance holds the job's lease (`Repo.claimJob`, migration 0026 `job_leases`; a lease is a little shorter than the job's interval and another instance takes over when it lapses). | `deployable.test.ts` (two holders, renewal, takeover; the lease test also runs on Postgres in CI with `TEST_DATABASE_URL`). | A job that outlives its lease could overlap with a takeover; the hourly jobs take seconds today. |
| CI green-washing (report section 3.10) | fixed | `tools/release/ci-note.mjs`: annotations plus job-summary lines when staging has no `DEPLOY_HOOK`, no `SERVER_URL` (deploy unconfirmed, no contract tests, no production smoke check), no Android upload key, or no server for the web build; a production deploy without `DEPLOY_HOOK` fails. | `release-tools.test.ts` (runs `deploy.mjs` for staging and production without a hook; the workflow steps exist). | The runs stay green for staging and Android, by choice: failing every push until the owner sets the secrets would hide real failures. |

### 2026-11-06 — cheap phones (state-of-the-game report, section 5 step 3), commit `2b202b5`

Verification on `2b202b5`: `npm test` without Postgres or Redis (121 files, 1,069 passed, 14 skipped); `npm run build`; `npm run typecheck:server`; `npm run server:build`. In Chromium (SwiftShader WebGL, 360×640, emulation only): a Keep 10 village scouting 25 bases plateaus at 36 MB of painted building art on high and 13 MB on low; swapping the village through Keeps 2 to 15 on low holds at the 24 MB budget (98 level textures kept of the ones painted) with no image left on a missing texture; with WebGL disabled the game runs on Phaser's Canvas renderer and a battle shows five role-ring colours; the production build boots with the new boot-guard API. **Not done:** any physical phone (2 GB Android, older iPhone), iOS WebKit, real GPU memory, battery, a real 2G network, listening to the audio.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Device F1 unbounded texture memory | fixed | `render/textureBudget.ts`: painted building art (per-level and Keep-skin looks) counted per profile (`paintedBudgetMB` 64 high, 24 low, one copy's pixels). Scenes declare what they show (`holdBuildingTextures` after `VillageScene.sync` and `BattleScene.create`, `releaseBuildingTextures` on battle shutdown); the least recently used rest is removed with its canvas at those points only, and repainted when needed. | `textureBudget.test.ts`; the browser runs above. | The island, scenery, warriors and badges are not budgeted (fixed size). Repainting an evicted look costs a few ms on the main thread. The budgets are not calibrated on devices. The dead `lazyTiers` flag (device F16) is untouched. |
| Device F2 quality picked by memory only, never adapts | fixed | The canvas test runs on every browser and decides before memory; on high, non-iOS touch devices under 8 GB draw at most `CANVAS_PIXEL_BUDGET` (2.4 Mpx) of canvas; battles sample the frame rate each second and an automatic high whose median of 20 samples is under 40 FPS uses low from the next start (`tk.quality.measured`, with a message; cleared when the player chooses in Settings). | `quality.test.ts` (four new cases). | Thresholds are guesses until measured on phones. The switch applies at the next start, not mid-session. A 120 Hz phone is judged by the same 40 FPS line. |
| Device F3 slow-boot card and Retry loop | fixed | Each start-up step (`bootStatus`) calls `__tkBoot.progress`, which restarts the 25 s clock; the card is added under the splash (the status line keeps updating) and removed when progress resumes. | `boot.test.ts` (steps every 20 s never trip it; the card comes and goes; done clears it); the production build boots. | Retry still reloads when pressed; it is now offered only after 25 s with no progress at all. |
| Device F6 iOS Home Screen advice loses the village | fixed | The advice says to copy a save code first, then add to the Home Screen and load it there (separate storage). A Home Screen start with a fresh village explains how to load a code, once (`tk.homeScreenHint`). | Code review; type check. | Not seen on an iPhone. |
| Device F9 music synthesised while muted | fixed | `audio/sound.ts` runs the scheduler only while music is on and the page is visible; on return the beat clock restarts from now. | `music.test.ts` (fake audio context). | The audio context itself is still created on the first tap even with all sound off (device F18, iOS audio session, not in this step). |
| Device F13 Canvas renderer drops role colours | fixed | Role rings are one texture per colour (`ringTexture`), never a tinted white ring; jammed defenses also dim with alpha under Canvas (`canvasRenderer`). | Browser run with WebGL disabled: five ring textures in use, no errors. | Other tints (lit stealth warriors, hit flashes, smoke shades) stay cosmetic-only under Canvas. |

### 2026-11-06 — what a reviewer sees first (state-of-the-game report, section 5 step 4), commit `ec29e1e`

Verification on `ec29e1e`: `npm test` without Postgres or Redis (122 files, 1,071 passed, 14 skipped); `npm run build`; `npm run typecheck:server`. In Chromium (SwiftShader WebGL, emulation only): an unaffordable upgrade says "Not enough resources (needs 5,448,274 Coins)."; Store → Looks shows five Keep previews painted at the player's Keep; the Army filters fit at 320 px; the mountain bands fill a 844 px-wide screen with no seam or bottom edge; battle start at 360×640 and 320×568 measured below. **Not done:** physical phones, iOS WebKit, other languages (the text layer, step 9).

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Art F1 internal resource ids and raw numbers in messages | fixed | `economy.json` `resourceNames` (Coins, Provisions, Shadow Ink, Jade); `costText` in `sim/village.ts` writes "5,448,274 Coins and 1,200 Provisions". | `ledger-audit.test.ts` (upgrade message names Coins/Provisions with separators); browser run. | The separator is a fixed comma until the text layer localises numbers (compliance L03, step 9). |
| Art F2 Store looks previewed with the old game's mushroom cap | fixed | `HudDeps.skinThumbnail` paints the Clan Keep at the player's level in each look (`villageTexture` with the skin); a roof-shaped swatch in the look's colours stands in until it is painted. | Browser run (five thumbnails, no errors). | Painting a look the first time costs a few ms; the swatch is a placeholder, not art. |
| Art F3 ridge bands end and show a straight foot on wide screens | fixed | `paintRidge` ends both sides at one height (copies join without a seam), skips spikes at the edges and fades its foot out; `paintSun` is its own image placed once; three copies per layer (`render/fx.ts`). | Browser screenshots at 844×390 and 360×640. | Not checked at 21:9 tablets or desktop ultra-wide beyond three copies. |
| Art F4 battle start too zoomed out behind a tall opponent card | partly fixed | The card keeps the honest label and puts loot and honor on one row: 120 → 101 px at 360×640 (start zoom 0.14 → 0.163, every Infiltration Point on screen), 166 → 130 px at 320×568. `FIT_FLOOR` stays 0.14: 0.18 put six points off-screen at 360 px. | Playwright measurements (`fit.mjs` in the session; numbers in the commit message). | The floor itself is unchanged; a smaller map frame or a collapsible card would be the next step. |
| Art F9 Provisions icon reads as a second coin | fixed | `ui/icons.ts` `dew`: an indigo rice bowl instead of a tan bale. | Browser screenshot of the top bar. | Not tested for colour-blind contrast. |
| Art F18 "Treasurys" | fixed | The limit message no longer pluralises a name: "Your Keep allows no more of these (Treasury: 3 of 3)." | Type check; browser run of a limit. | Other appended-"s" strings remain until the text layer has plural rules (step 9). |
| Art F19 Army filter labels clipped at 360/320 px | fixed | Up to 400 px the scope dropdown takes its own row (`styles.css`). | Browser screenshot at 320 px. | — |
| Economy E08 two store products missing from the shipping table | fixed | `docs/SHIPPING.md` 3b lists `jade_pinch` and `clan_stipend`; a test checks that every `storeProductIds` entry is in the table. | `release-config.test.ts`. | Prices still need creating in both stores (owner). |

### 2026-11-06 — measuring (state-of-the-game report, section 5 step 5), commit `2317ef1`

Verification on `2317ef1`: `npm test` without Postgres or Redis (123 files, 1,086 passed, 14 skipped; the Postgres variant of the rollup test is skipped here); `npm run build`; `npm run typecheck:server`; `npm run server:build`; the bundle tool made a main bundle and an arm, and refused an arm that changed a main-bundle number. In Chromium against a local server (memory storage): after the age screen (adult), the one-time question appears 20 s after going online, nothing is sent before the answer, and "Share" sends a batch to `POST /v1/stats` with no Authorization header under a random UUID. **Not done:** a real host's load-balancer logs (the Server release workflow has since run the suite, the stats rollup's Postgres variant and migration 0027 included, on Postgres 16), legal review of the consent text, App Store Connect / Play Console declarations entered.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Growth 1 no shared numbers (retention, funnel, conversion) | fixed in code | `net/stats.ts` allowlist (`STATS_EVENTS`: numbers, booleans and short ids; no names, chat, transaction ids or free text); `analytics/share.ts` `StatsSharing` (adults only, off until yes, never under 18 or unknown age; random statistics id; the device's earlier events go with the yes; batches every 5 min and on hide; turning it off deletes the id's rows, retried; a stricter age band switches it off); `POST/DELETE /v1/stats` with no token, no request log line, no IP column, per-IP rate rule; migration 0027; hourly leased `rollupStats` (D1/D7/D30, tutorial done, first raid and payer within 7 days, per install day and experiment arm); `GET /admin/v1/stats`; 400-day retention; Settings switch and the one-time question; privacy policy, store declarations, `PROTOCOL.md`. | `tests/backend/server/stats.test.ts` (allowlist, no token/IP stored, clock clamp, rate limit, retention, rollup and staff report, sharing client under every age band, offline, opt-out deletion); browser run. | Only adults who opt in are counted, so the numbers are a biased sample (state it when reading them). The rollup groups every recent event hourly; past ~10 million events it needs incremental rollups. "Day" is the UTC day, not the player's. Revenue is catalog USD, not proceeds. The staff view is JSON (no chart in `/admin`). Legal review of the consent (backlog sent with the yes, ePrivacy 5(3)). |
| Growth 2 store crash tools not in the rollout plan | fixed (docs) | `docs/store/RELEASE.md`: Play Android vitals (crash 1.09%, ANR 0.47%, low-memory kills), Xcode Organizer crashes/hangs/terminations, the pre-launch report, then Sentry, with halt rules; statistics D1 and tutorial rate beside a rollout. | Document. | Owner: dashboards exist only once the apps are in the stores. |
| Growth 3 no cohort on balance bundles | fixed in code | `BalanceBundle.cohort` (experiment, arm, buckets); `checkCohort`: an arm repeats the main bundle's changes and may add only offer timing (the server replays held villages with one set of numbers); `pickCohort` by `cohortBucket(experiment, statistics id)` in `BalanceLoader`; an arm kept from an earlier session is dropped once the device has no statistics id; `BALANCE_BUNDLE_FILE` may be a list; `/v1/balance` `cohorts`; `tools/balance/bundle.mjs` `BALANCE_COHORT`/`BALANCE_MAIN`. | `tests/backend/net/balance.test.ts` (arm rules, picking, refusing a greedy arm, server serving arms); bundle tool run. | Only players who share are ever in an arm. Price, reward and economy experiments are not possible this way (by design). No significance tooling: read arms by hand. |

### 2026-11-06 — funnel and faucets (state-of-the-game report, section 5 step 6), commit `1bde1fc`

Verification on `1bde1fc`: `npm test` without Postgres or Redis (124 files, 1,102 passed, 14 skipped); `npm run build`; `npm run typecheck:server`; `npm run server:build`; model-player pacing tests unchanged and green (the model never spends Jade). In Chromium (sandbox, 360×640): a village past the tutorial with no age gets the neutral age question; the Offers tab explains it waits for the age; Looks shows three locked looks with their Keep. **Not done:** any spending or retention data (step 5's statistics are needed to judge these numbers), store products for `offer_keep` (owner).

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Economy E01 Starter Pack lost to a refused first try, and to the Bundle | fixed | `flags.longWaitSeen` is set only when the offer shows; villages that lost it before get it back; `afterOffer` keeps the Artisan's Bundle (and the new Keep Celebration) behind the Starter Pack while it can still appear. | `funnel-faucets.test.ts` (age unknown then adult; lost flag; Bundle waits); `events.test.ts`. | Still one offer per session (`maxPerSession`). |
| Economy E02 offers only for players who had said "adult" | fixed | The age is asked once when the tutorial ends (or at the next start for a village past it), store signal first; the Offers tab says why it is empty for unknown ages and under 18. | Browser run; type check. | A player who taps "Not now" is not asked again on that device (by design); the question is not tested in the DOM test suite. |
| Economy E03 Clan Stipend undercut every pack | fixed | 12 Jade a payment (360 for $2.99, 120 Jade/$; the $9.99 Box gives 600); a stipend bought earlier keeps 20 (save v18 `stipend.jade`). | `funnel-faucets.test.ts` (ladder, migration pays 60 for 3 old payments). | Still better Jade/$ than any pack (it is the entry product); not login-gated, by the existing consumer-friendly choice. |
| Economy E05 skips priced ~2× the genre with ~540 free Jade a month | fixed | `skipCurve` −40% (1 h 15, 1 day 180, 1 week 720) for buildings and research; `trainingSkipCurve` keeps army finishing at the old prices (skip-and-raid stays ≤ 10× a top-up); the streak's top-step Jade once a week (`jadeEveryDays`). | `economy.test.ts`, `topup.test.ts`, `funnel-faucets.test.ts` (28 days of chests pay the streak Jade 3–4 times). | Achievements and other one-time Jade unchanged; the monthly free-Jade estimate is not re-measured. |
| Economy E19 thin Jade sinks | partly fixed | Three Keep looks at Keeps 5, 8 and 11 (450/650/900 Jade, `minKeep`); a per-Keep real-money bundle (Keep Celebration, `offer_keep`, Keep-scaled supplies + 300 Jade, after the Starter Pack, 72 h cooldown). | `funnel-faucets.test.ts` (locked below the Keep; offered after a Keep level). | No shield purchase or extra research lane; the looks reuse the Keep painter with new colours, not new art; `offer_keep` must be created in both stores (owner, SHIPPING 3b). |

### 2026-11-06 — store age APIs and compliance code (state-of-the-game report, section 5 step 7), commit `1bde1fc`

Verification as for step 6, plus: `TkAgePlugin.java` compiled with javac against the published `age-signals-0.0.4` AAR (Capacitor and Play services types stubbed; API names read with javap); `npm run store:storekit` regenerates `ios/App/Products.storekit` from `store.json`. The Server release workflow then ran the whole suite against Postgres 16 and Redis 7 (migrations 0027 and 0028 applied by `migrate.test.ts`; the multi-instance test needed the rules acceptance added, fixed in the follow-up commit). **Not done:** a Play-installed build, any iPhone build, Apple's `RESCIND_CONSENT` payload (not readable here), legal review.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Compliance C01 Play Age Signals skipped the access step | fixed in code | `requestAgeSignalsAccess` with the activity, then `checkAgeSignals` only after SHARED; `VERIFICATION_REQUIRED` becomes its own status and the HUD tells the player to verify in the Play Store instead of asking its own question (`storeAgeSignal`, `Hud.askAge`, also for purchases); significant-change status and install id are passed through. | javac against the real AAR; type check; tests unchanged. | Untested on a Play-installed build; Play Console API access is an owner step (SHIPPING 1b). |
| Compliance C02 iOS regulatory features, significant updates, consent revocation | partly fixed | The server handles App Store `RESCIND_CONSENT`: the account found through the transaction or its appAccountToken intent loses online play until staff lift it, stays under 18, gets a notice and a staff log line (`tk_consent_rescinded_total`). | `purchases.test.ts` (consent withdrawn → `403 banned`, age kept, staff line). | `requiredRegulatoryFeatures` and the significant-update acknowledgement are not written (no 26.5 SDK or readable declaration here: owner step, SHIPPING 1b); Apple's payload may not carry a transaction, in which case only a log line and a metric record it. |
| Compliance C08 StoreKit configuration disagreed with the catalog | fixed | `ios/App/Products.storekit` lists exactly the store ids of `store.json` (14, all Consumable, catalog prices), generated by `npm run store:storekit`. | `release-config.test.ts`. | Not opened in Xcode here. |
| Compliance C14 no per-account acceptance before UGC | fixed in code | Migration 0028 (`players.rules_version`, `rules_accepted_at`), `PUT /v1/me/rules`, feature `rules-acceptance`; chat, Alliance and Gang creation and renames answer `403 rules_required` until the current `COMMUNITY_RULES_VERSION` is accepted; the game sends it when the player agrees and catches up on the next sync. | `compliance.test.ts`; test harnesses accept for their players. | Games older than this build cannot chat on a new server until updated; the terms of service themselves are still a draft (owner, `termsEffective`). |
| Compliance C25 obfuscated handles in chat, contacts in names | fixed | `HANDLE_RE` (discord, telegram, whatsapp, snapchat, insta/instagram, wechat, kik with look-alike letters and separators) in chat; `hasContact` refuses links, addresses, phone numbers, 6+ digit runs and handles in player, Alliance and Gang names. | `compliance.test.ts`, `chat-contacts.test.ts`. | Other apps and languages' spellings are not covered; a determined player can still spell a handle out in words. |
| Backend A12 deletion left idempotent answers and freed the name at once | fixed | `deletePlayer` drops `idempotency_keys` for every token hash of the player; name holds stay under `DELETED_PLAYER`, and the current name is held `NAME_HOLD_DAYS` (35). | `compliance.test.ts` (answers gone after `DELETE /v1/me`), `friends.test.ts` (name free only after the hold). | Village routes still store their answers for a day while the account lives (they are needed for retries). |
| Backend A14 friend requests by id bypassed findability | fixed | A request by `playerId` needs `findableBy` (privacy, under 13, suspended, blocks) or a tie: the other asked first, or the same Alliance or Gang (never under 13 or suspended). | `compliance.test.ts`, `friends.test.ts`. | Duel partners are not counted as a tie. |

### 2026-11-06 — return hooks and a face (state-of-the-game report, section 5 step 8), commits `2e60834`, `06d343e`

Verification on `6b7b1eb` (which includes both): `npm test` without Postgres or Redis (126 files, 1,122 passed, 14 skipped); `npm run build`; `npm run typecheck:server`; `npm run rules:snapshot` archived rules 4 before the bump and `npm run rules:fixture` recorded rules 5. In Chromium (sandbox, 360×640): a new village opens with lanterns, planters and a rock garden around the Keep; a Keep 8 village shows the objective chip; its raid shows the Shadow Captain's card, the opponent as "Moon Veil outpost (computer rival, offline)" and the clan leader's bio in the scout drawer. **Not done:** any player data on whether these bring players back (step 5's statistics), a painted hero or faces (human artist, report section 6), a server-seeded bank of rival bases, a closer start camera.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Growth 7 no next objective | fixed | `sim/objective.ts` `nextObjective`: free rewards, a full army, an affordable upgrade (the Keep first), what is missing for the cheapest, when the next Artisan is free; a chip under the top bar that opens the thing. | `return-hooks.test.ts`; browser run. | Not research or army goals; one line only. |
| Growth 8 notifications never asked at the moment of value | fixed | Asked once (per device) right after the first long timer the player starts after the tutorial; the master switch stays off until yes; the daily-chest reminder is on by default after opt-in. | `notifications.test.ts`; type check. | The real system permission prompt on devices is untested here. |
| Growth 9 all resets at UTC midnight | fixed (tasks) | Task days and weeks roll at the player's midnight (`localTime.offsetMinutes` from the device, `setLocalTime` at most weekly, replayed by the server); the chest, stipend and seasons keep UTC (the chest's draw needs a fixed day). | `return-hooks.test.ts` (New York's midnight, weekly limit). | A first change of offset can start a new task day early once. |
| Growth 19 no login calendar | fixed | A fixed 28-day calendar in the Daily panel: one claim per local day, never random or sold, a missed day loses nothing, 45 Jade in the cycle, the Moonlit Shrine Keep look on day 28 (40 Jade once owned). Save v19. | `return-hooks.test.ts`. | Rewards are not measured against the E05 faucet budget beyond that 45 Jade. |
| Growth 12 "it's all bots" | partly fixed | Generated opponents are outposts of three named computer rival clans with leaders and bios, on the device and the server (`base.rival`), still labelled computer. | Browser run; type check. | No seeded bank of real-looking rival bases per Keep on the server; launch geography (owner). |
| Growth 5 no hero, no cast | partly fixed | The Shadow Captain joins attacks from Keep 7 (free, no housing, once per battle, level by Keep; Rally +30% damage near him for 8 s after his first hit). Battle rules 5; hero-less battles equal rules 4 (archived), so rules-4 replays stay watchable; the server checks the hero. Measured +2 to +6 destruction at Keeps 7–13. Rival clan leaders named. | `hero.test.ts` (unlock, once per battle, rules-4 equality against the archived engine, effect size, server check); `relay.test.ts`, `rules-version.test.ts`; browser run. | Code-drawn art, no portraits or icon character (human artist, report section 6); the other three heroes remain designs; no hero upgrades or Hero Hall; army-lab gates do not include the hero. |
| Art F13 empty first frame | partly fixed | A new village starts with two stone lanterns, four planters and a rock garden around the Keep (movable decor). | Browser screenshot. | The camera and the Sensei bubble still cover the Keep at first. |
| Art F23 icon is a building | open (owner) | — | — | Needs a human artist (report section 6). |

### 2026-11-06 — text layer (state-of-the-game report, section 5 step 9), commit `6b7b1eb`

Verification on `6b7b1eb`: as above, plus `npm run i18n:check` (all languages pass), the build emits one interface chunk per language (~2.6 KB gzip each), and in Chromium a phone set to `ar-EG` with a temporary pseudo-translation (reverted) lays the HUD out right-to-left with `lang="ar" dir="rtl"`, while `en-US` is unchanged. **Not done:** most interface strings, the boot card, real translations (translation sessions come next), device checks of per-app languages.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Compliance L01 UI not translatable | partly fixed | `ui/i18n.ts` text layer over `locales/en/ui.json` (99 keys: numbers, durations, tutorial, bottom bar and rail, objective chip, battle HUD and results, Daily panel, every plural); `i18n:sync` gives all 49 languages a `ui.json` worksheet; one chunk per language; a language is used once 80% translated; Settings → Language. | `tests/presentation/i18n.test.ts` (matcher table, keys exist, worksheets complete). | About 400 interface strings, server messages, notices, legal pages and the boot card are still English literals; `data.json` (game data names) is not read yet. |
| Compliance L02 plurals and concatenation | fixed for plurals | ICU-lite plurals with `Intl.PluralRules` (Russian one/few/many tested); every hand-built `? 's' : ''` in the UI is gone and a test keeps it at zero; the worksheet checker compares placeholders as sets so languages can add branches. | `i18n.test.ts`. | Sentences still built by concatenation in unconverted strings; server messages interpolate English. |
| Compliance L03 numbers always en-US | fixed | `formatNumber`/`formatCompact` use the language's grouping and short forms with Western digits; durations are keyed. | `i18n.test.ts` (de, hi, ar, en). | Dates elsewhere still use the device locale directly. |
| Compliance L04, art F15 Latin-only fonts, no RTL | fixed in code, by the owner's rule | Fonts are never downloaded (owner decision): non-Latin scripts use the phone's fonts with bolder titles (`data-script`); `dir="rtl"` mirrors the rail and battle cards; flex rows follow `dir`. | Browser screenshot (pseudo-Arabic). | No native typographic review; canvas text and some absolute positions are not mirrored. |
| Art F16 Latin letters on Infiltration Points | fixed | `pointLabel`: letters stay ids; outside the Latin script the canvas label, chips and chevrons show 1–8. | `i18n.test.ts`. | "AA"/"splash" scout chip text is only keyed in the aria label so far. |

### 2026-11-06 — complete Spanish implementation and measured language packaging

Fixing reference: Spanish implementation commit `1daab27`, based on `9d0eaa7`;
integration also preserves upstream `12d5996`. Publication evidence belongs to
the subsequent GitHub Pages workflow run. Current surface-by-surface status, source hashes and release
steps are recorded in [`../localization/SPANISH_IMPLEMENTATION.json`](../localization/SPANISH_IMPLEMENTATION.json);
the original census remains a pinned historical snapshot. This entry supersedes
the English-only implementation limitations of the text-layer entry above for
Spanish. It does not close worldwide linguistic, moderation or device risks.

| Finding | Current change and evidence | Remaining limitations |
|---|---|---|
| Compliance L01, R05 text coverage | Spanish completes 2,962 keys across boot, UI, data, messages and public/account pages; 2,648 compact runtime strings. All namespaces must reach 100% before activation. Display adapters preserve canonical simulation/save data and authored Unicode names/chat. Store listing and native resources are supplied. See the implementation inventory and `locales/es/REVIEW.json`. | English, Spanish and (2026-11-08) Hindi, the first non-Latin script, Brazilian Portuguese and (2026-11-09, `468b139`) German, then French and Italian (`0ea2e52`) and Simplified Chinese, the first Han script (`d82a88f`), then (2026-11-10) Romanian and Catalan (`cc64cdf`) and Japanese (`949b0da`, instructions `4c6b0d0`), and Dutch and Swedish (`642deab`, instructions `9a4ede4`), and Danish and Norwegian Bokmål (DANISH_NORWEGIAN_COMMIT, instructions `6b08fcd`): see `docs/localization/HINDI.md`, `PORTUGUESE.md`, `GERMAN.md`, `FRENCH.md`, `ITALIAN.md`, `CHINESE.md`, `ROMANIAN.md`, `CATALAN.md`, `JAPANESE.md`, `DUTCH.md`, `SWEDISH.md`, `DANISH.md`, `NORWEGIAN.md` and each `locales/<code>/REVIEW.json`; 35 target languages remain untranslated. Native linguistic review (Hindi, Portuguese, German, French, Italian, Chinese, Romanian, Catalan, Japanese, Dutch, Swedish, Danish and Norwegian included), the German Impressum and German-law review of the terms, the China mainland storefront (game publication licence, real-name and minor play-time rules, PIPL), other-script typography/RTL beyond Devanagari and Han in Chromium, localized moderation/support and physical-device testing remain open. |
| Compliance L02, L03 formatting | Owned message parameters, plural/select branches, costs, dates, numbers and lists use locale-aware presentation. Historical/server messages are translated at explicit owned boundaries; validated chat presets carry metadata so authored chat stays literal. Catalog/parameter and no-mutation tests pass. | Human grammar/context review and every live provider/server state on devices remain release checks. Unknown provider diagnostics use a localized game fallback. |
| Poor-network language availability | Native installs include completed packs. Web caches only the selected pack/pages. The complete Spanish standalone client asset set is 268,679 raw bytes / 92,317 ZIP bytes; projected 50-language text is 13.43–26.87 MB raw / 4.62–9.23 MB ZIP. See `../localization/SPANISH_SIZE.json` for exclusions and estimate basis. | Signed IPA/AAB size is unmeasured; future font/art/audio packages require separate budgeting. Other languages' sizes are projections. |
| Verification and release integration | Full suite: 1,132 passed, 13 skipped. Client/server builds and server typecheck pass. Built Chromium client: 12 panels, five viewport sizes, Build taps, offline reload, safe failed language switch and preserved building identity. Evidence: `../localization/evidence/validation.json` and `browser-es.json`. | No physical iOS/Android, store upload or external database migration. Apply migration 0029 with the updated server; validate PostgreSQL/Redis, store products/prices, OS sheets and notification delivery. Publisher/legal facts remain pending where originally pending. |

### 2026-11-06 — structural debt (state-of-the-game report, section 5 step 10), commits `5611f85`, `179c93a`

Verification on `0cb7176`: `npm test` without Postgres or Redis (132 files, 1,139 passed, 14 skipped), `npm run build`, `npm run typecheck:server`, `npm run server:build`. Battle hashes before and after the per-tick cache are identical (Keep 8, 12 and 15 sample battles); the same battles ran in 112/100/157 ms instead of 180/171/272 ms. In Chromium the production build loads `index` and `phaser` at start and fetches `friendsUi` and `gangWarUi` only when the Friends button is pressed, with no console errors. **Not done:** the Docker image was not built here (no Docker in the session); the Postgres repository tests ran only in CI before this change.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Quality 1 package named Toadstool Kingdoms | fixed | `package.json`/lock name `kagemura` and description; Android APK artifact `kagemura-android-apk`. | Build; `release-config.test.ts`. | The bundle id stays the old one until new store listings exist (owner). |
| Quality 2 committed Redis dump | fixed | `dump.rdb` removed; `*.rdb` and `appendonly*` ignored. | `git ls-files`. | It stays in git history. |
| Quality 3 empty locale worksheets (3.4 MB) | kept on purpose | The game now reads the `ui.json` worksheets (step 9), so they are the translation sessions' input, not dead weight. | `i18n.test.ts` (every language has every key). | Still 3.4 MB in the repo until translated. |
| Quality 4 frozen rules copy edited after freezing | fixed | `server/rules/manifest.json` records a sha256 of every archived rules folder; `npm run rules:snapshot` writes it; a test fails if an archive changes. | `rules-archive.test.ts`. | An intentional fix to an archive must update the digest by hand (and should be rare). |
| Quality 8 briefs state wrong versions | fixed | Version numbers removed from the briefs and `docs/PROTOCOL.md`; they point at the generated `docs/STATUS.md`. | `status.test.ts`. | Prose elsewhere can still go stale; only the status table is generated. |
| Quality 9 HANDOFF frozen at 2 November | fixed | Moved to `docs/history/HANDOFF-2026-11-02.md` with a historical header; references updated. | Grep for the old path. | — |
| Quality 10 REQUESTS files missing | fixed | `docs/game-theory/REQUESTS.md` and `docs/backend/REQUESTS.md` created (art already had one). | Files exist; step 11 used the backend one. | — |
| Quality 11 root brief 5,200 words of change log | fixed | Root `CLAUDE.md` is ~940 words of invariants and pointers; decisions moved verbatim to `docs/DECISIONS.md`, fix tables to `docs/history/AUDIT_TABLES.md`. | Word count. | Compartment briefs are still long. |
| Quality 16 `Repo` god interface | partly fixed | `Repo` is `PlayerStore & PurchaseStore & OpsStore & BattleStore & SocialStore & VillageStore` plus the cross-cutting transaction, job, idempotency and lock members, so a route can depend on the slice it uses. | `npm run typecheck:server`. | Interface split only: `MemoryRepo` and `PgRepo` are still two large classes with every method; Postgres is tested only in CI. |
| Quality 17 `hud.ts` and `main.ts` god files | partly fixed | Friends, Gangs and Gang War load on first open (own chunks). | `code-split.test.ts`; browser run. | `hud.ts` is still ~2,100 lines and `main.ts boot()` was not broken up. |
| Quality 28 battle tick recomputes per pair | partly fixed | `defenseView`: each troop's hidden, flying and shrouded state is computed once per tick for the defense loop. | Identical hashes; timings above; battle, balance and rules tests. | Aura and support lookups are still per pair. |
| Quality 31 one 1.5 MB chunk, warning silenced | fixed | Phaser is its own long-cached chunk (660 kB, 175 kB gzip); the game chunk is 833 kB (254 kB gzip); the warning limit dropped from 2,000 to 1,200 kB. | Build output; `code-split.test.ts`. | The game chunk is still large for cheap phones on slow networks. |
| Quality 32 server image installs Phaser and Capacitor | fixed | The runtime stage removes the client-only packages after `npm ci --omit=dev`. | `release-config.test.ts` (every runtime dependency is a server dependency or removed). | Image not built in this session. |

### 2026-11-06 — balance gates with real numbers (state-of-the-game report, section 5 step 11), commit `0cb7176`

Verification on `0cb7176`: as above, plus `npm run balance:campaign` (four campaigns in parallel, 2.6 minutes) and every test in `tests/gameplay/balance/` (80 passed). The campaigns are deterministic, so the gates are not flaky; any change to the played data, battle rules, model player, matchmaking, base generation or offline raids changes the fingerprint and fails the gates until the campaigns are rerun. **Not done:** real-player playtests (owner, report section 6). Model-player outcomes are not players: the bot attack plan is simple and a human usually does better.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| Economy E24 Keep 3 cliff | fixed for the model | `ranks.json` `powerSlackByKeep`: Keeps 1–4 meet bases up to 0.75 below their earned strength (was 0.25); the server's generated fallback uses `powerSlackAt` too. Regular Keep 3: 0.88 → 1.50 stars, 83% won; Keeps 4–5 1.62 and 2.28. | `campaign-gates.test.ts` (Keep 3 ≥ 1.2), `progression.test.ts` (Keeps 3–5 ≥ 1.2 live). | Casual Keep 3 is 1.00 stars over 5 raids and the explorer 0.60: the Keep 3 army has just arrived (small camps), which slack cannot fully fix. |
| Economy E25 late-game failure loop | fixed for raid-mix armies, open for the explorer | Slack 0.5 at the measured dips (Keeps 8 and 12). Regular: at least 1.26 stars and 65% wins at every Keep 3–15 (Keep 8 1.72, Keep 12 1.26, was 0.56–1.17 and 0.84); casual suggested army at least 1.00 and 60%; three-star rate at most 40% (no farming). A lower gate now exists. | `campaign-gates.test.ts`: ≥ 0.9 stars and ≥ 55% wins per Keep for regular, defender and casual; regular ≥ 1.2 from Keep 8; ≤ 50% three-stars; Keep 15 in 100–140 days. | The casual explorer (newest warrior of each family) still averages 0.14–0.55 stars at Keeps 8–14 at the same army strength as the regular player: the mixed army with the simple attack plan, not matchmaking. It is gated only against getting worse. |
| Economy E26 is defense worth building? | measured: no | Campaign columns for raids against the village (held share, stolen per raid, honor lost) and a regular defender campaign. Result: in about 270 raids against each regular village none was held; the defender (all five counters, defenses before collectors) loses 0–10% less per raid and reaches Keep 15 on the same day; raids take 64–66% of what a regular player loots and 163% (casual) and 314% (explorer) of what casual players loot. | `CAMPAIGN.md` ("Is defense worth building?"); `campaign-gates.test.ts` (columns present, regular stolen < 80% of loot). | Open design problem: bot raiders bring a full army for their Keep at its research, so defense never holds; casual villages lose more to raids than they earn. Fixing it (raider strength from the defender's layout, a shield or loss share tied to defense, a larger held reward) is a game-theory decision for the next pass. |

### 2026-11-06 — remnant and money audit (Toadstool Kingdoms leftovers, refunds, iOS plugins), commits `94c09b1`, `4b6276e`, `8f7a4e5`

A read-only sweep for what Toadstool Kingdoms left behind (the old repository `jimhavlicekpersonal/toadstool-kingdoms` and this repository's history before `cfb6ed8` were compared), every real-money path, and every string a player sees (the running game was harvested in Chromium at 390 × 844: 842 visible strings, titles, labels and placeholders across the rail panels, Store, Pass, Goals, Army, Build, Settings, building sheets, offers and the attack screen). The owner then authorized fixing the findings in three batches.

Verification on `8f7a4e5`: `npm test` without Postgres or Redis (136 files: 135 passed, 1 skipped; 1,161 tests passed, 14 skipped), `npm run build`, `npm run typecheck:server`, `npm run server:build`, `npm run balance:campaign` (only `basegen.ts`'s scout tip text changed: same results, new fingerprint). Each new test was run against the code before its fix and failed there. Browser checks (Chromium, `?debug` sandbox): the storage-full toast, the Store's Looks, offers, Goals, the Attack button, the Keep chip, the stipend's confirm step and the under-18 refusal order. No device, Xcode, Play Console or App Store Connect check was possible.

| Finding | Status | What changed | Evidence | Remaining limitations |
|---|---|---|---|---|
| iPhone: the game's native plugins were never registered (no purchases, prices, Sign in with Apple, Game Center or age signal) | fixed in code (`94c09b1`) | `SceneDelegate.swift` made a plain `CAPBridgeViewController` its root, so `TkViewController.capacitorDidLoad` (the only place TkStore, TkAuth and TkAge are registered) never ran; Capacitor 8 registers only npm plugins by itself. Inherited unchanged from Toadstool Kingdoms. The root is now `TkViewController`. | `release-config.test.ts` (both platforms' registrations and plugin names). | Not built or run in Xcode: a TestFlight build must show App Store prices and complete a sandbox purchase. |
| SHIPPING.md section 2 named the wrong App Store product ids | fixed (`94c09b1`) | It listed `moonstones_1…6`, `lantern_pass`, `offer_rebuild` (game ids) and missed three products; App Store Connect never reuses a product id. It now points at the store-id table in 3b. | `release-config.test.ts` (no table row starts with a game-only id). | — |
| Clan Stipend refund kept claimed Jade and left the owed Jade for the next stipend | fixed (`4b6276e`) | Reproduced: buy, refund, buy paid 720 Jade for one paid stipend; claim 29 days then refund kept 358. Purchase records keep `stipend`; a refund takes the waiting payments and their Jade and the claimed rest as a debt. Save v20 clears owed Jade on an empty stipend. | `tests/gameplay/economy/refunds.test.ts`. | Stipends bought before v20 are taken back at today's 12 Jade a payment. |
| Season Scroll refund kept claimed premium rewards and the Scroll-only look | fixed (`4b6276e`) | Reproduced: 340 Jade, 55,220 Coins, 55,220 Provisions and the look kept. Claims under a Scroll are kept on its purchase (`premium`); a refund takes them back (debt) and the look, and clears this season's premium claims. | `refunds.test.ts`. | Scrolls bought before v20 have no claim record: their refund only ends the track, as before. |
| Refund reversals gave nothing back for the stipend or the Scroll | fixed (`4b6276e`) | `reinstatePurchase` gives back exactly what the refund took (`refund` on the record); server `reinstate()` uses it. | `refunds.test.ts`; `purchases.test.ts` (Apple REFUND then REFUND_REVERSED on a stipend). | — |
| Google Play: a purchase for a village on the device was consumed before the device saved it | fixed in code (`4b6276e`) | A lost answer, failed save or killed app lost the purchase although the game said it would be delivered again. The server now consumes only when its own village holds the purchase and acknowledges otherwise; a credited purchase sent again after the village moved to the server is delivered there; a receipt the server knows was refunded is refused. | `purchases.test.ts`. | Against the real Play Developer API: not run. |
| Refunds never reached a village kept on the device | fixed (`4b6276e`) | `GameController.settleRefunds` applies the server's refund records at start and on reconnection (`economy: false` on a server-held village: only stipend, Scroll and looks). | `refunds.test.ts`. | Needs the server online; a modified game can ignore it (a device village stays trusted-local). |
| "Your acorns storage is full" (and "dew"): the internal id in a core-loop toast, copied from the old game | fixed (`8f7a4e5`) | "No room for more Coins. Upgrade your Treasury or build another." | `remnant-text.test.ts`; browser. | — |
| Old-game words in player text: Starter Pack "for new rulers", Goals "forest obstacles", Siege Bombardier "a Cannon's reach", "troops" beside "warriors" (~25 strings, preset chat included) | fixed (`8f7a4e5`) | Reworded; the server still accepts the two old preset chat phrases from older games (`PRESET_CHAT_RETIRED`). | `remnant-text.test.ts` scans every data and interface string; `accounts-minors.test.ts`. | Text built in code outside `locales/en` is not scanned by that test (most interface text is not keyed yet). |
| Internal ids in rare messages: import refusal ("More acorns…", "too many army_camp…"), the staff page's resource list and purchase table, the player's ledger ("purchase:apple", "refund:google", staff notes) | fixed (`8f7a4e5`) | Display names everywhere; the ledger maps every server reason to words (`ui/ledgerReason.ts`), staff notes stay with staff. | `villageImport.test.ts`, `online-authority.test.ts`, `admin-page.test.ts`, `ledger-reason.test.ts`. | — |
| Store: a calendar-only look offered for 0 Jade (always failed) | fixed (`8f7a4e5`) | Shows "28-day calendar reward". | Browser. | No DOM test. |
| Store text: "delivered at once" on the stipend; "20%" typed in four places; "+N% value" from US dollar ratios; an under-18 player confirmed twice before the limit refused; raw store developer messages and raw raid refusal codes | fixed (`8f7a4e5`) | Stipend says delivery starts at once; the bonus reads `pass.premiumBuildSpeedBonus`; pack bonuses come from the storefront's own prices (hidden without them); the purchase check runs before any confirm; plugin sentences kept, appended developer text logged; refusal reasons in words. | `android-native.test.ts`; browser. | — |
| Smaller text: "Sage of Cloudss" plurals, "Three Jade" label beside 8 Jade, Kite Raider text missing the Kite-Cutter Ballista, "Armour Shred" | fixed (`8f7a4e5`) | `N × name`; "Handful of Jade"; ballista named; US spelling. | Data and server text. | — |
| Docs: SHIPPING.md title, testers sent to the old Toadstool site, "Elder Toadstool level, leaf rank", Groves; REVIEW_NOTES "staff review reports daily" and the "generated" label; privacy page and LISTING describing a name field the deletion form does not have; README "red zone" and protocol v7; LISTING's stale Lantern Elder and worksheet notes | fixed (`8f7a4e5`) | Corrected to what the code does. | Reading against the code. | Moderation staffing and its response time are still open (R06). |
| iOS marketing version fixed at 1.0 | fixed in the workflow (`8f7a4e5`) | TestFlight takes `MARKETING_VERSION` from `package.json`. | `release-config.test.ts`. | Not run on a macOS runner in this session. |
| Dead Toadstool code | removed (`8f7a4e5`) | `cleanName` (with its `'Ruler'` fallback) and the unused cartoon face, acorn and dew-drop painters. | Type checks. | — |
| The old Toadstool Kingdoms site is still live on the same origin | **open (owner)** | `jimhavlicekpersonal.github.io/toadstool-kingdoms/` shares the origin with Kagemura: the same IndexedDB (`toadstool-kingdoms`), localStorage keys and `tk-` caches, and each game's service worker deletes the other's caches. Turn off GitHub Pages on the old repository (or replace it with a redirect). | `curl` (HTTP 200, title "Toadstool Kingdoms"). | Not changed from here: another repository. |
| Not changed (judgement or owner) | open | The Season Scroll's "≈ N Jade value" assumes every task every day and prices Coins/Provisions at the top-up rate (a value claim next to a real-money button: legal review); "Burrow Ambusher" keeps a burrow word; an iOS transaction StoreKit cannot verify locally is never delivered (rare; changing it needs Xcode); all 49 non-English worksheets have no translations. | — | — |

Merged with the Spanish release (`origin/main` at `e495e02`) before going to `main`: the text fixes were carried into the keyed catalogs (English and Spanish for every changed or new string, the legacy patterns for the new storage, warrior and donation wording, with the old patterns kept for chat older servers wrote), the public pages and the account form say "warrior requests", retired preset chat is stored as the phrase it became (`presetChatId`), and Spanish stays complete (2,987 of 2,987, `availability.json` ready). `tests/locales/remnant-es.test.ts` checks the Spanish; `remnant-text.test.ts` now scans every English namespace (archived-history and technical refusal entries are listed as kept). Verified: `npm test` (139 files: 138 passed, 1 skipped; 1,174 tests passed, 14 skipped), `npm run build`, `npm run typecheck:server`, `npm run server:build`, and Chromium in English (841 strings, no leftovers) and Spanish (the storage toast, the Store's Looks and Season Scroll).
