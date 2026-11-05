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

### GLOBAL-001 — Critical: deprecated Play Billing library — OPEN

[`android/app/build.gradle`](../../android/app/build.gradle) uses Billing **7.1.1**. Google's Billing 8+ deadline was August 31, 2026, with extensions ending November 1, 2026; the audit is November 5. This blocks compliant new submissions/updates using that dependency.

Closure: upgrade to a currently supported version, adapt the bridge and verify the signed release dependency graph, pending/cancelled purchases, repeat consumption, restoration and Play submission checks. [Official deadline](https://developer.android.com/google/play/billing/deprecation-faq).

### GLOBAL-002 — Critical: unverified imported currency and premium — OPEN

Reproduced: [`server/core/villageImport.ts`](../../server/core/villageImport.ts) accepted **20,000 Jade, premium pass enabled and zero purchase records**. Plausible-inventory limits do not establish provenance. Exported local state cannot prove paid value or legitimate competitive progression.

Closure: establish a migration policy that protects legitimate offline progress while preventing invented currency/progression/premium from entering the competitive economy. Validate paid entitlements against trusted records; verify forged saves, sandbox-origin exports, repeated imports and legitimate purchased balances. Do not simply confiscate valid progress.

### GLOBAL-003 — High: receipt finished after failed save — OPEN

Reproduced with "Quota exceeded": [`controller.ts`](../../src/gameplay/control/controller.ts) returned purchase success and finished the receipt despite failed saving. `save()` catches errors and resolves, so awaiting it does not establish durability. A local-delivery player can lose a paid grant after restarting. Server-held villages have additional recovery but do not make the local path safe.

Closure: durable grant/outbox state before finishing, or a demonstrably trusted recovery path. Verify storage failure and termination at every delivery boundary with exactly-once grants and clear pending status.

### GLOBAL-004 — High: concurrent intents exceed minor cap — OPEN

Reproduced: two simultaneous $49.99 intents both succeeded, reserving **$99.98 against a $50 cap**. [`purchases.ts`](../../server/core/purchases.ts) checks spend and inserts the intent separately; [`pgRepo.ts`](../../server/pgRepo.ts) likewise has separate operations.

Closure: atomic cap check/reservation across devices and instances. Verify concurrent requests on real Postgres, retries, refunds and UTC-month boundaries.

### GLOBAL-005 — High: cancelled purchases retain cap reservations — OPEN

`INTENT_HOLD_MS` in [`purchases.ts`](../../server/core/purchases.ts) is 30 minutes; cancellation in [`controller.ts`](../../src/gameplay/control/controller.ts) does not release it. Repeated cancellations can block allowed purchases. Delayed approvals need a policy beyond this window.

Closure: securely resolve failed/cancelled intents without incorrectly releasing genuinely pending purchases. Verify abandonment, delayed approval, expiry and cross-device recovery.

### GLOBAL-006 — High: age restriction is self-removable — OPEN

[`economyUi.ts`](../../src/presentation/ui/economyUi.ts) offers an editable age choice; [`village.ts`](../../src/gameplay/sim/village.ts) accepts `setProfile` directly. Players can remove the restriction. The cap is voluntary despite stronger store claims.

Closure: define truthful, appropriate spending protections and age-change behavior for intended markets; verify server enforcement. An under-18 $50 preference is not evidence of legal compliance.

### GLOBAL-007 — High: fixed USD displayed instead of store prices — OPEN

[`economyUi.ts`](../../src/presentation/ui/economyUi.ts) formats catalog dollar prices in cards/confirmation. Native plugins expose localized prices but the shop does not use them. Prices can disagree with store sheets, regional pricing, taxes or promotions. Confirmation also exposes internal resource IDs in grant text.

Closure: use store-returned product availability/formatted prices and localized player-facing contents throughout real-money purchase flows. Verify multiple storefronts/currencies, unavailable products and price changes.

### GLOBAL-008 — High: native Android recovery sign-in missing — OPEN

[`platform/auth.ts`](../../src/backend/platform/auth.ts) returns no native Android sign-in providers; Google/Play Games bridges are not implemented. A village save code does not authenticate ownership of the online account. Reinstall/device loss can strand account/purchase history.

Closure: supported Android account recovery, verified after reinstall and on another device. Do not equate copied village state with authentication.

### GLOBAL-009 — High: cross-device command sequence collision — OPEN

[`villageSync.ts`](../../src/backend/net/villageSync.ts) numbers actions independently per device. [`server/core/village.ts`](../../server/core/village.ts) skips `seq <= server seq`; the client removes entries through `ackSeq`. Reproduced: two different commands numbered 1; the first applied, the second received ack 1 with an empty result list and did not apply.

Closure: collision-safe action identities and explicit conflict/rebase behavior, or clearly enforced single-writer sessions. Verify concurrent devices, offline actions, reconnection and retries without silent loss/duplication.

### GLOBAL-010 — High: offline queue storage errors suppressed — OPEN

The localStorage wrapper in [`connection.ts`](../../src/backend/net/connection.ts) suppresses write errors; [`villageSync.ts`](../../src/backend/net/villageSync.ts) relies on it. Actions can look safely queued while stored only in memory.

Closure: durable queue persistence, surfaced failures and recovery. Verify quota/write failure, process termination, replay and save/queue consistency.

### GLOBAL-011 — High: optional art request blocks boot — OPEN

[`main.ts`](../../src/main.ts) awaits [`loadArtManifest`](../../src/presentation/render/artManifest.ts), whose fetch has no deadline. In a fresh browser context with service workers blocked, a stalled manifest prevented startup; aborting it allowed startup.

Closure: bounded waiting and a working optional-art fallback. Verify first visit, stalled/missing manifest, offline reload and packaged native assets.

### GLOBAL-012 — High: HTTP timeout excludes response body — OPEN

[`httpAdapter.ts`](../../src/backend/net/httpAdapter.ts) clears the abort timer after headers and before `res.text()`. A reproduced stalled body remained pending beyond the deadline, potentially blocking sync/queues.

Closure: deadline/cancellation through complete response consumption/parsing. Verify slow headers, stalled bodies, truncated JSON and retry/idempotency behavior.

### GLOBAL-013 — High: recovery only on first reconnect per boot — OPEN

[`main.ts`](../../src/main.ts) sets `deliveredOnline` once. If automatic unfinished-receipt recovery meets another outage, subsequent reconnects do not repeat it; restart/manual restore may be required.

Closure: retry after reconnection with bounded backoff and exactly-once grants. Verify repeated outages in one session and background pending approvals.

### GLOBAL-014 — High: Build button outside narrow viewport — OPEN

Measured after skipping tutorial: Build spans **x=298..376** at 320px and 360px viewport widths, leaving 56px or 16px outside. Tested 390px and landscape did not show this overflow. Source: [`styles.css`](../../src/presentation/ui/styles.css), bottom toolbar.

Closure: primary actions visible/tappable at 320/360px with safe areas, longer translations and larger text. Verify bounding boxes and actual taps.

### GLOBAL-015 — High: in-app privacy/support links missing — OPEN

[`hud.ts` Settings](../../src/presentation/ui/hud.ts) lacks a general privacy-policy link/direct support contact. [`LISTING.md`](LISTING.md) and [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) retain draft/placeholder publication steps. Apple requires an accessible in-app privacy-policy link.

Closure: publish accurate policy/support/deletion/community-rules pages; connect in-app/store surfaces; verify live URLs in the submitted build. [Apple privacy guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy).

### GLOBAL-016 — High: contract database not migrated in deployment — OPEN

[Audited failed run](https://github.com/jimhavlicekpersonal/ninja-version-of-game-1/actions/runs/41957291313): pending migrations caused server exit and contract connection failures; deployment was skipped. [`deploy.yml`](../../.github/workflows/deploy.yml) starts the contract server without migrating its database first.

Closure: migrate the intended disposable contract database and fail clearly on missing readiness. Verify clean-database CI, built-server contracts and deployment prerequisites.

### GLOBAL-017 — High: Android workflow not a commercial release — OPEN

[`android.yml`](../../.github/workflows/android.yml) builds a debug APK, omits `VITE_PLAY_BILLING=1`, and has no signed AAB release step. [`build.gradle`](../../android/app/build.gradle) fixes `versionCode` at 1, preventing successive Play uploads without manual changes.

Closure: reproducible signed release, explicit commercial configuration and increasing build identifiers. Verify store-delivered install/update and billing; retain a useful separate debug path.

### GLOBAL-018 — Medium: service worker caches error homepage — OPEN

[`sw.template.js`](../../src/backend/pwa/sw.template.js) caches navigation responses without `res.ok`, allowing a temporary error to replace a working offline homepage. Network-first navigation has no deadline before cached fallback. Precache installation is all-or-nothing and also needs interrupted-download coverage.

Closure: retain a known-good offline shell and bound waiting. Verify 5xx, missing assets, interrupted first downloads, updates and cache consistency.

### GLOBAL-019 — Medium: privacy declarations/defaults disagree — OPEN

[`PRIVACY.md`](PRIVACY.md) / [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) say email is not collected, but [`accountPage.ts`](../../server/accountPage.ts) accepts optional email contact, stored by the server. Reporting is described as player-enabled, while [`prefs.ts`](../../src/backend/platform/prefs.ts) defaults crash reporting on when a DSN exists.

Closure: reconcile collection/defaults, applicable consent, retention and declarations. Reassess linked/unlinked diagnostic claims and error-content scrubbing; do not promise arbitrary error messages can never contain player data without verification.

### GLOBAL-020 — Medium: listing overstates free earnability — OPEN

[`LISTING.md`](LISTING.md) says everything can be earned by playing; premium access and `passOnly` in [`cosmetics.json`](../../src/gameplay/data/cosmetics.json) contradict the blanket claim.

Closure: distinguish free gameplay, earnable currency and purchase-only access. Verify every listing claim/screenshot against the commercial build.

## Product limitations, risks and unverified areas

These are **OPEN assessment items**, not all reproduced defects or automatic policy violations.

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
