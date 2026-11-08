# Kagemura: full flaw audit and money plan (2026-11-08)

Repository `jimhavlicekpersonal/ninja-version-of-game-1`, branch `claude/optimistic-clarke-xds460`, commit `64eafb5` (the merge of the remnant-and-money fixes with the fresh-slate review docs). Read-only: no code, data, test or workflow was changed. This document and its interactive copy are the only deliverables.

## Verdict

Kagemura is an unusually well-built indie base builder that still cannot take a single payment from a real player. The engineering is ahead of the business: the simulation is deterministic and re-checked by the server, saves are versioned and guarded, receipts are verified against Apple's root and Google's API, and the ethical rules (no loot boxes, a real under-18 cap, honest countdowns) are kept. What blocks money is not a bug but a chain of unfinished edges, in this order:

1. **Nothing can be filed.** The publisher facts are empty, the bundle id is still the old game's, and the five worldwide-audit items that need a developer account, keys and a signed build are unchanged since 2026-11-05 (LAW-03, REL-02, REL-04). Until a human does these, every code fix below is theoretical.
2. **The staff tool's network fence does not hold.** A percent-encoded path walks past the admin IP allow-list; with a leaked token, give/take Jade and bans are reachable from anywhere (SEC-01). Readiness and metrics leak internals to anyone (SEC-02, SEC-03).
3. **The economy can still be imported.** Save codes are unsigned and the import allowance lets a hand-made Keep 5 village bring in several times the Jade an honest player holds (PAY-01, SEC-06).
4. **The catalog undersells itself.** The stipend and the two cheapest offers pay two to three times the Jade per dollar of the big packs, the pass is the worse deal for its own audience, cosmetics are invisible to other players, free Jade covers the mid packs, and the web build is a complete free game with no store (MON-01, MON-02, PROD-01, BAL-01, PROD-03). A rational payer never spends more than about $8 a week.
5. **A launch could not be read.** Telemetry has no country, device class, session length or store funnel, the event calendar repeats four effects forever, the chat filter is thirty English words, and only Spanish exists beyond English (PROD-02, SIM-02, LAW-01, L10N-01).

The earlier audits (5 and 6 November) were right about most of what they recorded; this pass confirms that their code fixes landed, finds the admin bypass and the metrics and readiness leaks that they did not, and shows that several "mitigated" items (rate limits per token, idempotency scope, matchmaking sort, battle commands on the request thread, refund pause per account) are still open in current code.

## How this audit was made

The plan was a multi-agent sweep: 30 parallel auditor lanes, an adversarial verifier per lane, a second sceptic on every Critical and High finding, a gap round, and a synthesis panel. Two full attempts on 8 November were stopped by the account's five-hour usage limit before any lane finished, so the author carried out the audit alone, lane by lane, against the current code: reading the server, payment, import, simulation, client, build and compliance code; re-running one auditor's in-process probe of the server; computing the Jade economy from the data files; and re-checking the open items of the three earlier audits. Every finding below was read in the current source by the author; "verified" means the code path was read end to end or reproduced, "suspected" means it is inferred from the code and still needs a test or a device.

Baseline on this commit, run by the author: `npm test` 138 files passed, 1 skipped, 1,174 tests passed, 14 skipped (79 s); `npm run build` passed (main chunk 1,104 kB raw, 344 kB gzip; Phaser chunk 661 kB raw, 175 kB gzip); `npm run typecheck:server` and `npm run server:build` passed. Not done: physical phones, signed store builds, real storefronts, a deployed server, legal review.

Severity scale: **Critical** blocks a store release, loses money or progress, or lets anyone break the economy or the competition. **High** is material harm to revenue, retention, trust or security, or a defect most players will hit. **Medium** is a clear defect with limited reach. **Low** is polish.

## Summary of what was found

46 flaws are recorded (2 Critical, 9 High, 24 Medium, 11 Low). 41 are verified (the author read the code path end to end or reproduced it), 5 are suspected. 29 were already recorded by an earlier audit and are still true in current code; 17 are new. No independent verifier ran on this pass (Part 5 explains why), so nothing was refuted by a second reader; treat the suspected entries as leads to confirm.

| Area | Critical | High | Medium | Low | Total |
|---|---:|---:|---:|---:|---:|
| Server: authentication, accounts, raids, data (SRV) | 0 | 0 | 6 | 2 | 8 |
| Payments, entitlements and economy integrity (PAY) | 0 | 1 | 2 | 1 | 4 |
| Security (SEC) | 0 | 1 | 3 | 3 | 7 |
| Operations, scaling and cost (OPS) | 0 | 0 | 3 | 1 | 4 |
| Client adapters, saves and persistence (CLI) | 0 | 0 | 1 | 1 | 2 |
| Gameplay simulation and battle (SIM) | 0 | 0 | 1 | 1 | 2 |
| Balance and economy data (BAL) | 0 | 0 | 1 | 0 | 1 |
| HUD, interaction and accessibility (UI) | 0 | 0 | 3 | 0 | 3 |
| Rendering, performance, art and audio (PERF) | 0 | 0 | 1 | 0 | 1 |
| Build, release, tests and documentation (REL) | 1 | 1 | 1 | 1 | 4 |
| Privacy, minors and store compliance (LAW) | 1 | 1 | 0 | 1 | 3 |
| Localization (L10N) | 0 | 1 | 1 | 0 | 2 |
| Product, retention and live-ops (PROD) | 0 | 3 | 0 | 0 | 3 |
| Monetization design (MON) | 0 | 1 | 1 | 0 | 2 |
| **All** | **2** | **9** | **24** | **11** | **46** |

How to read an entry: **Severity** uses the scale in the front matter. **Confidence** "verified" means the author read the code path end to end or reproduced it; "suspected" means it is inferred from the code and still plausible after review. **Angle** names the point of view that found it. **Known** gives the earlier audit's id when the flaw was already on record. **Where** gives file and line in the current code (branch `claude/optimistic-clarke-xds460`, commit `64eafb5`). Part 2 holds the fix for every id.

---

# Part 1. The flaws

## 1.1 Server: authentication, accounts, raids, data (SRV)

### SRV-01 · Medium · Idempotency replay ignores the route, method and body

- **Confidence:** verified · **Category:** bug · **Angle:** engineer · **Known:** areas/06 A13
- **Where:** `server/app.ts:167-186`
- **What:** The idempotency scope is sha256(bearer token) plus the Idempotency-Key header only. In-process reproduction on current code: PUT /v1/me with key k-1, then POST /v1/village with the same key, returned the rename's stored answer with Idempotent-Replay: true, and the village was never created.
- **Impact:** A client bug or key collision silently turns one action into another action's answer, and a modified client can replay a cheap route's answer for an expensive one. The earlier backend audit's A13 is still open.
- **Fix:** see SRV-01 in Part 2.

### SRV-02 · Medium · A rate rule without windowMs limits forever and answers Retry-After NaN

- **Confidence:** verified · **Category:** bug · **Angle:** engineer · **New**
- **Where:** `server/rateLimit.ts:103-130`, `server/config.ts (RATE_LIMITS parsing)`
- **What:** MemoryRateLimiter.hit uses r.windowMs without validation. With an override such as {"register":{"limit":1}} the window end is NaN: the first request passes and every later one is refused with "Try again in NaN seconds", including 48 hours later (reproduced in-process on current code).
- **Impact:** One typo in a production environment variable locks every player out of registration, matches or purchases until a restart, and the message exposes the bug to players.
- **Fix:** see SRV-02 in Part 2.

### SRV-03 · Medium · Per-player rate limits are per token, and a linked account can mint tokens without limit

- **Confidence:** verified · **Category:** exploit · **Angle:** cheater · **Known:** areas/06 A7
- **Where:** `server/app.ts:213-224`, `server/core/links.ts:130-140`
- **What:** The player rule keys on sha256(token). Every POST /v1/sessions for a linked Apple or Google identity issues another device token, and nothing caps the number of live tokens per account. Reproduced in-process: with a lookup limit of 2, six tokens allowed 12 lookups.
- **Impact:** Lookup, friend-request, match and purchase limits scale with the number of tokens a player mints, so player-list scraping and matchmaking abuse are not really limited. The earlier audit's A7 is still open.
- **Fix:** see SRV-03 in Part 2.

### SRV-04 · Medium · Matchmaking still sorts candidates with ORDER BY random()

- **Confidence:** verified · **Category:** performance · **Angle:** live-ops · **Known:** areas/06 A19
- **Where:** `server/pgRepo.ts:915-924`
- **What:** The candidate query for an opponent ends in "order by random() limit $8" over the Keep and trophy window. Postgres has to materialise and sort every matching row for each match request.
- **Impact:** At a few thousand active defenders each match request is a full sort of the window; at 5 matches a second during peak the database spends most of its time here. The earlier audit's A19 is still open.
- **Fix:** see SRV-04 in Part 2.

### SRV-05 · Medium · Battle commands still run a whole battle on the request thread inside the village transaction

- **Confidence:** verified · **Category:** performance · **Angle:** attacker · **Known:** areas/06 A3
- **Where:** `server/core/village.ts:44-54`, `server/rateLimit.ts:49-52 (battleCommands 6 a minute)`
- **What:** trialEnd, abandonBattle, bountyEnd and rematchEnd each re-simulate a battle (a Keep 15 base with up to 2,000 deployments, up to 192 KB) on the event loop while the village row is locked. The code comment says the sim has no hook to take a result computed in the worker pool, so the only protection is a cap of six such commands per player per minute.
- **Impact:** Six free anonymous accounts can keep one instance's event loop busy with battles; the row lock means the player's own other commands wait. The earlier audit's A3 is still open.
- **Fix:** see SRV-05 in Part 2.

### SRV-07 · Medium · No test proves account deletion covers every table that holds a player id

- **Confidence:** suspected · **Category:** test-gap · **Angle:** lawyer · **New**
- **Where:** `server/pgRepo.ts:1060-1180 (deleteAccount)`, `server/migrations/*.sql (46 tables, 9 with on delete cascade)`
- **What:** Deletion is a hand-maintained list of DELETE statements plus nine foreign keys with ON DELETE CASCADE. Tables such as friendships, blocks, duels, squad_members, squad_war_attacks, raid_attacks, tickets, attacks (replays), donations, troop_requests and idempotency_keys are neither in the cascade set nor visibly in the explicit list that was read, and no test walks the schema to check.
- **Impact:** A new table (the schema grew by 29 migrations in a week) can silently keep a deleted player's rows, which breaks the privacy policy's deletion promise and the stores' account-deletion rules.
- **Fix:** see SRV-07 in Part 2.

### SRV-06 · Low · Consent-rescinded suspension prints the year 275760 and a doubled full stop

- **Confidence:** verified · **Category:** ux · **Angle:** first-time player · **New**
- **Where:** `server/core/purchases.ts:357-376`, `server/shared.ts (banned message)`
- **What:** A parent's consent withdrawal sets bannedUntil to the sentinel 8,640,000,000,000,000 and the banned response reads "suspended from online play until Sat, 13 Sep 275760 00:00:00 GMT: A parent or guardian withdrew consent for this game (App Store).." (reproduced in-process).
- **Impact:** A family in a sensitive situation sees an absurd date and broken punctuation.
- **Fix:** see SRV-06 in Part 2.

### SRV-08 · Low · The server trusts a client-supplied x-request-id

- **Confidence:** verified · **Category:** security · **Angle:** attacker · **Known:** areas/06 A33
- **Where:** `server/app.ts:114-118`
- **What:** genReqId keeps any header value that matches /^[\w-]{8,64}$/ as the request id used in logs and answers.
- **Impact:** A caller can forge or collide log correlation ids and make incident analysis harder. Harmless otherwise; the earlier audit's A33.
- **Fix:** see SRV-08 in Part 2.

## 1.2 Payments, entitlements and economy integrity (PAY)

### PAY-01 · High · Import provenance lets a forged save bring thousands of Jade into the ranked economy

- **Confidence:** suspected · **Category:** exploit · **Angle:** cheater · **Known:** GLOBAL-002 (partial)
- **Where:** `server/core/villageImport.ts:43-60, 170-190 (checkProvenance, account-age gate)`, `src/gameplay/sim/save.ts:328-345 (export code)`
- **What:** A village import holds back only the Jade above the free allowance (2,000 plus 1,000 per Keep level, per the code comments and the GLOBAL-002 closure record), while the comment on line 49 says a regular player holds about 500 Jade at Keep 4 and 850 at Keep 5. The export code is unsigned base64 JSON with a checksum, so a Keep 5 save with 7,000 Jade, maxed storages and a full army is a text edit. The account-age gate applies only above Keep 5 and the sandbox flag is a plain boolean in the file.
- **Impact:** Roughly eight times the honest Jade at Keep 5, plus edited resources and army, enters the competitive ladder for free; paying players compete against it and the Jade sinks lose value.
- **Fix:** see PAY-01 in Part 2.

### PAY-02 · Medium · The under-18 monthly cap counts catalog US dollars, not what the store charged

- **Confidence:** verified · **Category:** compliance · **Angle:** lawyer · **Known:** FRESH H8
- **Where:** `server/core/purchases.ts:96-112, 159-175 (cents(product.usd))`, `src/gameplay/data/store.json (minorMonthlyCapUsd 50)`
- **What:** Both the intent reservation and the redeem check add cents(product.usd) from the catalog. The storefront currency and priceMicros are stored on the purchase row but never used for the cap.
- **Impact:** In a market where the store charges two or three times the US list price in local money, or a third of it, the "$50" cap is neither $50 nor the local equivalent, which weakens a protection the listing advertises.
- **Fix:** see PAY-02 in Part 2.

### PAY-03 · Medium · The refund-abuse pause is per account, and accounts are free

- **Confidence:** verified · **Category:** exploit · **Angle:** cheater · **Known:** areas/06 A5
- **Where:** `server/core/purchases.ts:36-38, 97-103 (REFUNDS_BEFORE_PAUSE per player)`
- **What:** After three refunds in 90 days a player's purchases pause. The count is per player id; a new anonymous account on the same device or store identity starts at zero.
- **Impact:** Buy, spend the resources, refund, re-register and repeat remains possible for device-held villages; the debt mechanism only bites while the village lives on the server. The earlier audit's A5 and A24 are only partly closed.
- **Fix:** see PAY-03 in Part 2.

### PAY-04 · Low · Apple CONSUMPTION_REQUEST is never answered, which favours refunds against the game

- **Confidence:** verified · **Category:** monetization · **Angle:** investor · **Known:** STATE_OF_THE_GAME 6.2
- **Where:** `server/core/purchases.ts:344-349`
- **What:** When Apple asks whether a disputed purchase was consumed, the server only counts a metric. The comment records this as a deliberate choice because the game does not collect the customer consent Apple requires.
- **Impact:** Apple decides refund disputes without the developer's side; for consumables that were spent, every dispute becomes a refund and a debt.
- **Fix:** see PAY-04 in Part 2.

## 1.3 Security (SEC)

### SEC-01 · High · The admin IP allow-list is bypassed by percent-encoding the path

- **Confidence:** verified · **Category:** security · **Angle:** attacker · **New**
- **Where:** `server/app.ts:228-235`
- **What:** The ADMIN_ALLOW_IPS hook compares the raw request URL with the string "/admin" (req.url === '/admin' || req.url.startsWith('/admin/')). Fastify routes on the decoded path, so /%61dmin/v1/actions reaches the staff API while the allow-list never fires. Reproduced in-process on current code: /admin/v1/actions from a non-allowed address answered 404, /%61dmin/v1/actions from the same address with a staff token answered 200.
- **Impact:** The network restriction that is meant to keep the staff tool (give/take Jade, bans, deletion handling, age resets) off the public internet is decorative; a leaked or guessed staff token works from anywhere.
- **Fix:** see SEC-01 in Part 2.

### SEC-02 · Medium · /readyz tells anyone the database user, host and error text

- **Confidence:** verified · **Category:** security · **Angle:** attacker · **New**
- **Where:** `server/app.ts:318-331`
- **What:** The unauthenticated readiness route returns "down: <error message>" for each dependency. A Postgres failure returned 'password authentication failed for user "kagemura" (db.internal:5432)' in an in-process reproduction.
- **Impact:** Internal host names, user names and library error text are published during every outage, exactly when attackers probe.
- **Fix:** see SEC-02 in Part 2.

### SEC-03 · Medium · Client-controlled headers become unbounded metric labels

- **Confidence:** verified · **Category:** security · **Angle:** attacker · **New**
- **Where:** `server/app.ts:163-165`, `server/observability.ts:58-80`
- **What:** tk_client_requests_total is labelled with the first 40 characters of X-Client-Build and 8 of X-Sim-Rules exactly as sent. Each distinct value is a new in-memory counter and a new Prometheus series (reproduced: 40 random builds, 40 series).
- **Impact:** Any unauthenticated caller grows server memory and Prometheus cardinality without limit; dashboards and alerts degrade during an attack.
- **Fix:** see SEC-03 in Part 2.

### SEC-06 · Medium · Save export codes are unsigned, so any village is a text edit away

- **Confidence:** verified · **Category:** exploit · **Angle:** cheater · **New**
- **Where:** `src/gameplay/sim/save.ts:328-345`
- **What:** encodeExportCode is base64url of the save JSON plus an FNV-1a checksum; decodeExportCode only checks the checksum. The sandbox flag, Jade, resources and army are plain fields.
- **Impact:** Hand-made villages reach the server import path (see PAY-01), and shared "save codes" on forums become the standard way to cheat the device economy.
- **Fix:** see SEC-06 in Part 2.

### SEC-04 · Low · GitHub Actions are pinned to major tags, not commit hashes

- **Confidence:** verified · **Category:** security · **Angle:** attacker · **New**
- **Where:** `.github/workflows/*.yml (actions/checkout@v7, setup-node@v7, setup-java@v6, upload-artifact@v5 and @v7, deploy-pages@v5, upload-pages-artifact@v5)`
- **What:** Every third-party action is referenced by a moving major tag. The release workflows handle the Android upload key, App Store Connect keys and the backup key.
- **Impact:** A compromised or hijacked action tag runs with access to signing and store secrets (the tj-actions incident of 2025 is the precedent).
- **Fix:** see SEC-04 in Part 2.

### SEC-05 · Low · Android backups include the WebView storage that holds the save and the session token

- **Confidence:** verified · **Category:** privacy · **Angle:** attacker · **New**
- **Where:** `android/app/src/main/AndroidManifest.xml:6 (android:allowBackup="true")`
- **What:** allowBackup is on with no backup rules, so the WebView's localStorage and IndexedDB (village, online token, debug offsets) travel with device backups and, on older Android, with adb backup.
- **Impact:** A copied backup restores a working session and village on another device, which also undercuts the one-writer-per-village model.
- **Fix:** see SEC-05 in Part 2.

### SEC-07 · Low · The online session token lives in localStorage

- **Confidence:** verified · **Category:** security · **Angle:** attacker · **Known:** areas/06 A16
- **Where:** `src/backend/net/connection.ts:45-70, 658-668 (tk.net.token:<server> keys)`
- **What:** The bearer token that owns the account and village is stored in localStorage and never expires or rotates. No HTML-injection path into the DOM was found in this review (the only innerHTML inputs are generated SVG), so the practical risk is a malicious browser extension or a shared computer.
- **Impact:** A copied token is a copied account for life; the "sign out other devices" route exists but tokens never age.
- **Fix:** see SEC-07 in Part 2.

## 1.4 Operations, scaling and cost (OPS)

### OPS-01 · Medium · Alliance polling costs about 15 requests a minute per open screen

- **Confidence:** verified · **Category:** ops · **Angle:** investor · **Known:** R04
- **Where:** `src/backend/social/groveSource.ts:260-262, 364-401 (POLL_MS 4000, full poll every 5th)`
- **What:** A visible Alliance screen polls chat every 4 seconds and the fuller state every fifth poll; backoff applies only on errors or slow answers. With 2,000 players on that screen at peak that is about 500 requests a second, each a token check, a rate-limit hit and a database read.
- **Impact:** Hosting cost and database load scale with chat viewers rather than with activity; a cheap-phone player on a metered connection pays for it too. The earlier risk R04 is only mitigated.
- **Fix:** see OPS-01 in Part 2.

### OPS-02 · Medium · Alert rules cover errors and desyncs but not money, webhooks, jobs or backups

- **Confidence:** verified · **Category:** ops · **Angle:** live-ops · **New**
- **Where:** `ops/prometheus/alerts.yml (ServerDown, HighErrorRate, SlowResponses, EventLoopBlocked, RedisDown, DatabasePoolSaturated, RefundSpike, DesyncsRising, DesyncsRisingForOneVersion, GamesRefusedForVersion, RateLimitStorm)`
- **What:** There is no alert on purchase refusals or failed receipt checks (tk_refused_total by reason), on webhook authentication failures, on a periodic job lease not renewed, on the backup workflow failing, or on test-purchase cap hits in production.
- **Impact:** A broken store configuration or a stuck voided-purchase poll goes unnoticed until players complain; revenue and refund handling are the least watched part of the system.
- **Fix:** see OPS-02 in Part 2.

### OPS-04 · Medium · Staging and production deploy jobs still succeed without deploying

- **Confidence:** verified · **Category:** process · **Angle:** investor · **Known:** STATE_OF_THE_GAME 3.10 (CI green-washing)
- **Where:** `.github/workflows/server.yml:109-167`
- **What:** Without the DEPLOY_HOOK secret and the SERVER_URL variable the deploy steps print warnings and the jobs end green; contract and smoke tests are skipped. No server has ever been deployed from this pipeline.
- **Impact:** A green "Server release" badge means only that an image was built; the first real deploy will be the first time migrations, readiness and contracts run against a live host.
- **Fix:** see OPS-04 in Part 2.

### OPS-03 · Low · The server image has no HEALTHCHECK

- **Confidence:** verified · **Category:** ops · **Angle:** live-ops · **Known:** areas/06 A26
- **Where:** `Dockerfile:17-31`
- **What:** The runtime stage sets USER node but declares no HEALTHCHECK, so container platforms that rely on it cannot restart a wedged process.
- **Impact:** A deadlocked instance keeps receiving traffic on platforms without external probes. The earlier audit's A26 is only partly closed.
- **Fix:** see OPS-03 in Part 2.

## 1.5 Client adapters, saves and persistence (CLI)

### CLI-01 · Medium · Commands the server refused are counted but never shown to the player

- **Confidence:** verified · **Category:** ux · **Angle:** first-time player · **Known:** GLOBAL-009 (limitation)
- **Where:** `src/backend/net/villageSync.ts:86-87, 251`, `src/presentation/ui/hud.ts (only villageMoveRefused is displayed, line 873-876)`
- **What:** VillageSync.refused counts commands the server rejected after a multi-device conflict or a correction, and the GLOBAL-009 closure record notes the HUD does not list them. Nothing in src/presentation reads that counter.
- **Impact:** A player who built on two devices sees a building vanish or resources jump with no explanation, which reads as a bug or theft and drives refunds and one-star reviews.
- **Fix:** see CLI-01 in Part 2.

### CLI-02 · Low · Only Latin subsets of the two interface fonts ship, so 48 planned languages render in system fonts

- **Confidence:** verified · **Category:** ux · **Angle:** localizer · **Known:** STATE_OF_THE_GAME area 7 (fonts Latin-only)
- **Where:** `src/presentation/ui/fonts/ (mplus1-latin-var.woff2 34 KB, dela-gothic-one-latin-400.woff2 14 KB)`, `src/presentation/render/fonts.ts`
- **What:** M PLUS 1 is a Japanese typeface, but only its Latin subset is bundled; the no-download rule means Japanese, Chinese, Korean, Arabic, Thai and Devanagari text falls back to whatever the OS has, in the HUD and in canvas labels.
- **Impact:** Mixed typography on every non-Latin market and a different look on cheap Android phones that ship few fonts; display titles in Dela Gothic One become plain system text.
- **Fix:** see CLI-02 in Part 2.

## 1.6 Gameplay simulation and battle (SIM)

### SIM-02 · Medium · The 14-day event calendar holds four distinct effects, one of them twice

- **Confidence:** verified · **Category:** design · **Angle:** live-ops · **Known:** areas/09 (events)
- **Where:** `src/gameplay/data/events.json (schedule: harvest_moon, raiders_moon, swift_paws, bounty_hunt, raiders_moon_2`, `periodDays 14)`
- **What:** The fixed schedule repeats every 14 days with a collect bonus, two raid-loot bonuses, a training discount and the Bounty Hunt. There is no seasonal or one-off event, no server-driven event, and the honesty rule that start and end come only from the schedule means live-ops cannot add one without a release.
- **Impact:** By week three a player has seen everything the calendar will ever do; return reasons flatten exactly when the Keep 5-6 wait begins. The earlier retention report's "four repeating events" is still true.
- **Fix:** see SIM-02 in Part 2.

### SIM-01 · Low · Offer triggering and age gating of offers are decided on the device only

- **Confidence:** verified · **Category:** design · **Angle:** cheater · **New**
- **Where:** `src/gameplay/sim/serverEconomy.ts:93-127 (PLAYER_COMMANDS excludes triggerOffer, markPrepOffer, tutorial, equipSkin, saveArmyPreset)`, `src/gameplay/sim/village.ts:769-790`, `src/gameplay/sim/offers.ts:15-17`
- **What:** triggerOffer is not a player command the server replays, so which offer a player sees, how often, and the offersAllowed check (adults only) run on the device. The server still prices and caps the purchase, so there is no economic exploit.
- **Impact:** A modified client can show itself any offer; more practically, live-ops cannot change offer rules or run offer experiments without a game release, and the under-18 "no offers" promise is enforced only by the client.
- **Fix:** see SIM-01 in Part 2.

## 1.7 Balance and economy data (BAL)

### BAL-01 · Medium · Free Jade for an active player is about 320 to 400 a month, the price of the $4.99 to $9.99 pack

- **Confidence:** verified · **Category:** balance · **Angle:** investor · **Known:** FRESH H2 / areas 03-04
- **Where:** `src/gameplay/data/daily.json (chest table: expected 0.95 Jade a day`, `streak 5 Jade a week`, `calendar 45 per 28 days)`, `events.json (35 Jade per 14 days)`, `pass.json (free track 150 per 30 days)`, `ranks.json (season chests, 835 Jade across the leagues)`
- **What:** Summing the data: chest about 28 a month, streak about 21, calendar about 48, events about 75, pass free track 150, plus a league chest. That is 320 to 400 Jade a month before any league chest, computed with a script over the JSON files.
- **Impact:** A daily player earns the value of the mid packs for free, so the only reasons to pay are impatience and the two paid builders; the pack ladder above $9.99 has little to sell to a player who is not in a hurry. The earlier estimate of 540 a month has been trimmed but the structure is unchanged.
- **Fix:** see BAL-01 in Part 2.

## 1.8 HUD, interaction and accessibility (UI)

### UI-01 · Medium · The Jade and Honor chips are divs with role=button but no keyboard access

- **Confidence:** verified · **Category:** accessibility · **Angle:** accessibility · **New**
- **Where:** `src/presentation/ui/hud.ts:297, 304`
- **What:** The resource chips that open the Store and the Honor view are div elements given role="button" and a click handler, without tabindex, a keydown handler or an accessible name beyond the title attribute.
- **Impact:** Keyboard players on the Windows target and screen-reader users cannot open the Store from the top bar, which is also the most important monetization entry point.
- **Fix:** see UI-01 in Part 2.

### UI-02 · Medium · Accessibility markup is thin outside the modal and the HUD shell

- **Confidence:** verified · **Category:** accessibility · **Angle:** accessibility · **Known:** R10
- **Where:** `src/presentation/ui/*.ts (aria attributes: hud 31, battleHud 12, armyUi 8, friendsUi 5, gangUi 5, economyUi 4, ageScreen 3, groveUi 3, dailyUi 2`, `tutorial, gangWarUi, communityRules, chips 0)`
- **What:** The modal implements a focus trap, Escape and focus return (hud.ts:2208-2250), which is good. Panels, tabs, lists and the tutorial carry almost no roles, names or live regions; toasts have no aria-live; the battle HUD's deploy buttons are icon-only.
- **Impact:** The game is not operable with a screen reader and only partly with a keyboard, which matters for the European Accessibility Act exposure the audit lists and for the Windows laptop target.
- **Fix:** see UI-02 in Part 2.

### UI-03 · Medium · Player-visible English remains hard-coded in the HUD

- **Confidence:** verified · **Category:** ux · **Angle:** localizer · **Known:** FRESH W2 (partial)
- **Where:** `src/presentation/ui/hud.ts:64 (statistics consent description), hud.ts:606 (NET_LABEL: Offline play, Connecting…, Online, No connection, Update needed, Suspended)`
- **What:** The Settings connection labels and the long consent sentence for shared play statistics are string literals outside t(), so they stay English in Spanish and in every future language.
- **Impact:** A consent text that a GDPR lawful-basis argument rests on is shown in the wrong language; the connection state label is one of the most-seen strings.
- **Fix:** see UI-03 in Part 2.

## 1.9 Rendering, performance, art and audio (PERF)

### PERF-01 · Medium · iPhones without a home button are always given the high profile

- **Confidence:** suspected · **Category:** performance · **Angle:** cheap-phone player · **Known:** R03
- **Where:** `src/presentation/render/quality.ts:146-160 (autoProfile)`
- **What:** Safari exposes neither deviceMemory nor a reliable core count, so the rule is: home-button iPhone → low, any other iPhone or iPad → high, unless the fill benchmark is slow. An iPhone XR or 11 (3 GB, 2018-2019) and an iPad mini 5 therefore render at up to 3x density with the full texture set.
- **Impact:** The cheapest current-generation iPhones in the target markets (second-hand XR/11) get the heaviest profile; memory pressure and Safari tab reloads are the likely result, and no device has been measured yet.
- **Fix:** see PERF-01 in Part 2.

## 1.10 Build, release, tests and documentation (REL)

### REL-02 · Critical · The app identity is still the old game's bundle id and package name

- **Confidence:** verified · **Category:** compliance · **Angle:** Apple reviewer · **Known:** STATE_OF_THE_GAME 6.1
- **Where:** `capacitor.config.ts:11 (appId com.toadstoolkingdoms.app)`, `android/app/build.gradle:9 (applicationId)`, `ios/App/App/Info.plist (CFBundleIdentifier)`, `server bundle lists`
- **What:** Both native shells and the server's accepted bundle ids still use com.toadstoolkingdoms.app. The code comments say this waits for the new store listings; a Play package name can never change after the first upload.
- **Impact:** Nothing can be submitted under the Kagemura name until the owner decides the identifiers; every workflow, receipt check and deep-link file depends on them. It is the first item on the critical path to any revenue.
- **Fix:** see REL-02 in Part 2.

### REL-04 · High · Five worldwide-audit items are code-complete but unproven until the owner acts

- **Confidence:** verified · **Category:** process · **Angle:** investor · **Known:** GLOBAL-001/007/008/015/017
- **Where:** `docs/store/WORLDWIDE_AUDIT.md (GLOBAL-001 Billing 9 on a signed build, GLOBAL-007 store prices on real storefronts, GLOBAL-008 Google sign-in OAuth clients and device recovery, GLOBAL-015 live legal pages, GLOBAL-017 signing secrets and Play upload)`, `.github/workflows/android.yml:71-76 (keystore secrets), ios-testflight.yml:12-16 (App Store Connect keys)`
- **What:** Each of these has shipped code and unit tests, and each still needs a human step: a Google Play Console account and upload key, OAuth clients, an Apple developer account and keys, a domain with the legal pages, and a signed build run through both stores' purchase flows. Their status has not changed since 2026-11-05.
- **Impact:** Nothing about purchases, sign-in recovery or store prices has ever been observed on a real device or storefront; the money path is untested end to end.
- **Fix:** see REL-04 in Part 2.

### REL-01 · Medium · npm test and npm run build rewrite a tracked file

- **Confidence:** verified · **Category:** process · **Angle:** engineer · **New**
- **Where:** `tools/i18n/build.mjs:126-131 (writes docs/localization/SPANISH_SIZE.json)`, `package.json (pretest, prebuild, pretypecheck hooks)`
- **What:** The language-pack build runs before every test, typecheck and build and unconditionally rewrites docs/localization/SPANISH_SIZE.json with the current dist hashes and sizes. The file changed during this audit's baseline run and had to be restored.
- **Impact:** Every contributor and CI job ends with a dirty working tree, commits pick up noise, and the measured sizes in the document drift with whatever dist happened to exist, so the "measured" numbers are not reproducible.
- **Fix:** see REL-01 in Part 2.

### REL-03 · Low · The test suite cannot prove Postgres or Redis behaviour without services

- **Confidence:** verified · **Category:** test-gap · **Angle:** engineer · **New**
- **Where:** `tests/backend/server/{migrate,repo,push,instances,redis,network}.test.ts (describe.skipIf on TEST_DATABASE_URL, TEST_REDIS_URL, IPv6)`
- **What:** Fourteen tests are skipped unless a database, Redis and IPv6 are present, so a local or default CI run validates the memory repository, whose behaviour differs from Postgres in exactly the places that matter (locks, random() ordering, cascades, statement timeouts).
- **Impact:** A green local run gives false comfort about money and deletion paths; only the Server release workflow runs the real adapters.
- **Fix:** see REL-03 in Part 2.

## 1.11 Privacy, minors and store compliance (LAW)

### LAW-03 · Critical · Every publisher fact the legal pages need is still empty

- **Confidence:** verified · **Category:** compliance · **Angle:** lawyer · **Known:** STATE_OF_THE_GAME 6.1 / GLOBAL-015
- **Where:** `public/legal-config.js (operator, operatorAddress, operatorPhone, responsiblePerson, supportEmail, deletionUrl, euRepresentative, ukRepresentative, hosting, crashReportRegion, governingLaw, four retention periods, termsEffective: all empty strings)`
- **What:** The privacy policy, terms, support, community and Japanese commerce pages read their facts from this file and say "not set yet" while a value is empty. Nothing in code can fill them; the test suite asserts they are empty.
- **Impact:** No store listing can be filed anywhere (Apple requires published contact information; the EU, UK, Germany, Japan and Brazil require an identified operator), so this is the first blocker on the path to revenue, ahead of every code fix.
- **Fix:** see LAW-03 in Part 2.

### LAW-01 · High · The chat and name filter is a 30-word English list

- **Confidence:** verified · **Category:** compliance · **Angle:** Google reviewer · **Known:** R06
- **Where:** `src/gameplay/data/social.json (profanity: 30 entries)`, `server/core/moderation.ts`
- **What:** Free-text Alliance and Gang chat for players 13 and over is filtered by thirty English words plus edge matching; Spanish ships with no list at all, and no list exists for slurs, grooming phrases or contact-sharing in any other language.
- **Impact:** Apple 1.2 and Play UGC policy require a method to filter objectionable content; a worldwide launch with real players and one moderator would face harassment and child-safety incidents the filter cannot catch. Risk R06 is still open.
- **Fix:** see LAW-01 in Part 2.

### LAW-02 · Low · No app-level privacy manifest in the iOS project

- **Confidence:** suspected · **Category:** compliance · **Angle:** Apple reviewer · **New**
- **Where:** `ios/App/App/ (no PrivacyInfo.xcprivacy)`, `ios/App/App/*.swift`
- **What:** The app target has no PrivacyInfo.xcprivacy. Capacitor pods carry their own, but the app's own plugins and any required-reason API they or the WebView bridge use must be declared by the app since 2024.
- **Impact:** App Store Connect rejects or warns on upload when a required-reason API is used without a declaration; the first TestFlight upload is the first time anyone will know.
- **Fix:** see LAW-02 in Part 2.

## 1.12 Localization (L10N)

### L10N-01 · High · Two of fifty languages are real; the other 48 are empty folders

- **Confidence:** verified · **Category:** compliance · **Angle:** localizer · **Known:** FRESH W1
- **Where:** `locales/ (50 folders), locales/availability.json (en, es ready), public/lang (one Spanish pack, 240 KB)`
- **What:** The language list, the status file and the folder structure advertise 50 languages, while availability.json and the shipped packs show English and Spanish only. The text layer and tooling are ready; the content is not.
- **Impact:** The worldwide goal has no non-English market beyond Spanish; store listings and screenshots exist in English and Spanish only. The earlier W1 and STATE area 7 findings are still true.
- **Fix:** see L10N-01 in Part 2.

### L10N-02 · Medium · Server refusal messages are English sentences

- **Confidence:** suspected · **Category:** ux · **Angle:** localizer · **New**
- **Where:** `server/core/purchases.ts:84, 101, 109, 170 and every ApiError message in server/core/*.ts`, `src/main.ts:124 (only raid refusal codes are translated)`
- **What:** ApiError carries a code and an English message. The client translates raid refusal codes, but purchase refusals ("Monthly spending limit of $50.00 reached…", "Purchases are paused on this account…") and most other refusals reach the player as the server wrote them.
- **Impact:** The most sensitive messages, about money and minors, are English in every market; the Spanish launch is incomplete at the point of payment.
- **Fix:** see L10N-02 in Part 2.

## 1.13 Product, retention and live-ops (PROD)

### PROD-01 · High · Keep looks are invisible to everyone but the owner

- **Confidence:** verified · **Category:** monetization · **Angle:** investor · **Known:** FRESH H6
- **Where:** `src/gameplay/data/cosmetics.json (hallSkins)`, `src/gameplay/sim/battle/types.ts and src/backend/net/protocol.ts (no skin field in BaseLayout or the base upload)`, `server/core/pvp.ts`
- **What:** The only cosmetics for sale are seven Keep looks, and the base layout the server stores and shows to attackers, friends and Alliance mates carries no skin field. A look is seen only in the owner's village.
- **Impact:** Cosmetics without an audience do not sell: the status motive that carries cosmetic revenue in this genre is absent, so Jade has little to buy once the builders are hired (see BAL-01).
- **Fix:** see PROD-01 in Part 2.

### PROD-02 · High · Telemetry cannot answer the questions a launch needs

- **Confidence:** verified · **Category:** design · **Angle:** investor · **Known:** areas/09 (measurement)
- **Where:** `src/backend/net/stats.ts:22-32 (STATS_EVENTS)`, `server/core/stats.ts (hourly rollup by day and arm)`
- **What:** Nine event types are shared: session start, tutorial step, raid end, offer shown, purchase, skip used, upgrade start, research start, reminder. There is no session end or length, no Keep reached, no Store opened, no purchase failed or cancelled, no device class, no country, no language, and the rollup groups only by day and experiment arm.
- **Impact:** D1/D7/D30 can be derived, but not by market, device tier or language; payer conversion by Keep, store funnel drop-off and cheap-phone crash rates cannot be measured, so the soft launch cannot be read.
- **Fix:** see PROD-02 in Part 2.

### PROD-03 · High · The web build is a complete free game with no store

- **Confidence:** verified · **Category:** monetization · **Angle:** investor · **Known:** STATE_OF_THE_GAME 6.8
- **Where:** `src/main.ts:210 (paymentPath: a store only in the sandbox or native builds)`, `.github/workflows/deploy.yml (GitHub Pages)`, `docs/SHIPPING.md`
- **What:** The public web build runs the whole game on real time with no purchases and no store, and it is the first thing a shared friend link opens. There is no hand-off to the apps (no account link that carries progress, no capped demo, no web payments).
- **Impact:** The best-converting channel in the genre, a friend's link, lands on a version that cannot take money and competes with the paid apps; the one-writer model also means a web village must be moved by code to continue in the app.
- **Fix:** see PROD-03 in Part 2.

## 1.14 Monetization design (MON)

### MON-01 · High · Cheap offers and the stipend give two to three times the Jade per dollar of the big packs

- **Confidence:** verified · **Category:** monetization · **Angle:** investor · **Known:** FRESH H2
- **Where:** `src/gameplay/data/store.json (packs: 45.5 to 75.0 Jade per dollar from $0.99 to $99.99`, `stipend 360 Jade for $2.99 = 120 per dollar)`, `src/gameplay/data/offers.json (Starter Pack 300 Jade plus resources for $1.99 = 151 per dollar`, `Artisan's Bundle 650 Jade for $4.99 = 130 per dollar, repeatable every 168 hours)`
- **What:** Computed from the data files. The pack ladder itself is coherent (more Jade per dollar as the price rises), but the stipend and the two cheapest offers sit above the ladder's top. The Artisan's Bundle can be bought again every week.
- **Impact:** A rational payer never buys a pack: a stipend plus a weekly bundle yields about 1,000 Jade for $7.98 a week, the same Jade the $19.99 pack sells. Average revenue per payer is capped near $8 to $10 a week regardless of appetite, and the $49.99 and $99.99 tiers exist only on paper.
- **Fix:** see MON-01 in Part 2.

### MON-02 · Medium · The Season Scroll is dominated by the stipend for anyone who wants Jade

- **Confidence:** verified · **Category:** monetization · **Angle:** investor · **New**
- **Where:** `src/gameplay/data/pass.json (usd 4.99, 30 tiers, premium track 340 Jade, free track 150 Jade, premiumBuildSpeedBonus, one Keep look)`, `store.json (stipend)`
- **What:** The premium track pays 340 Jade over 30 days for $4.99 (68 per dollar) plus a build-speed bonus and a look nobody else sees; the stipend pays 360 Jade for $2.99 with no tasks.
- **Impact:** The pass, the genre's best retention product, is the worse deal for its own audience; its tasks become chores for a reward the stipend gives for less.
- **Fix:** see MON-02 in Part 2.

---

# Part 2. How to fix them

The ids match Part 1. Effort: S = hours, M = days, L = a week or more for one engineer. Every fix must respect the project rules in `CLAUDE.md`: saves are versioned with a migration per change, combat changes bump `SIM_RULES` after `npm run rules:snapshot`, the server owns online truth, new text goes through `t()`, compartment boundaries hold, nothing random is sold, and minors' protections stay.

## 2.0 Order of work

Critical first, then High, cheapest first within each. Medium and Low follow in Part 2 by area.

| Order | Id | Severity | Effort | Title |
|---:|---|---|---|---|
| 1 | LAW-03 | Critical | S | Every publisher fact the legal pages need is still empty |
| 2 | REL-02 | Critical | M | The app identity is still the old game's bundle id and package name |
| 3 | SEC-01 | High | S | The admin IP allow-list is bypassed by percent-encoding the path |
| 4 | MON-01 | High | S | Cheap offers and the stipend give two to three times the Jade per dollar of the big packs |
| 5 | PAY-01 | High | M | Import provenance lets a forged save bring thousands of Jade into the ranked economy |
| 6 | LAW-01 | High | M | The chat and name filter is a 30-word English list |
| 7 | PROD-01 | High | M | Keep looks are invisible to everyone but the owner |
| 8 | PROD-02 | High | M | Telemetry cannot answer the questions a launch needs |
| 9 | REL-04 | High | L | Five worldwide-audit items are code-complete but unproven until the owner acts |
| 10 | L10N-01 | High | L | Two of fifty languages are real; the other 48 are empty folders |
| 11 | PROD-03 | High | L | The web build is a complete free game with no store |

## 2.1 Server: authentication, accounts, raids, data (SRV)

### SRV-01 · Idempotency replay ignores the route, method and body

- **Fix (S):** Store method, route pattern and a body hash with the key; answer 422 when the same key arrives with a different fingerprint (the Stripe convention). Add the fingerprint column in a new migration and write it from the onSend hook.
- **Verify:** A test that sends one key to two routes gets 422 on the second; the same request repeated still gets the replay.

### SRV-02 · A rate rule without windowMs limits forever and answers Retry-After NaN

- **Fix (S):** Validate every rule at startup (finite positive limit and windowMs; fall back to the default rule and log a warning) in the RATE_LIMITS parser and the limiter constructor; clamp retryAfterMs to a finite value.
- **Verify:** Unit test: a rule missing windowMs is rejected or defaulted at boot and never yields NaN.

### SRV-03 · Per-player rate limits are per token, and a linked account can mint tokens without limit

- **Fix (M):** Resolve the token to the player before the rate hook and key the player rule on the player id; cap live device tokens per account (for example 10, pruning the oldest) in createSession.
- **Verify:** Test: two tokens of one player share one lookup budget; an eleventh session prunes the oldest token.

### SRV-04 · Matchmaking still sorts candidates with ORDER BY random()

- **Fix (M):** Pick a random offset or a random starting rating and take the next N rows from an index (rating, keep), or sample with TABLESAMPLE SYSTEM_ROWS and filter; keep the shuffle in application code over at most 50 rows.
- **Verify:** EXPLAIN ANALYZE on a 100k-player fixture shows an index range scan, not a sort; the matchmaking tests still pass.

### SRV-05 · Battle commands still run a whole battle on the request thread inside the village transaction

- **Fix (M):** Run the battle in the re-simulation worker pool before the transaction and pass the finished BattleRecord into applyCommand (add an optional precomputed result to the command type), or move battle commands to their own route that uses the pool like raid reports do.
- **Verify:** A load test with 50 accounts sending trialEnd at the cap keeps p95 latency of ordinary village commands under 100 ms.

### SRV-07 · No test proves account deletion covers every table that holds a player id

- **Fix (S):** Add a Postgres test that lists every column named player_id, attacker_id, defender_id or owner and asserts zero rows for a deleted fixture player after deleteAccount; add ON DELETE CASCADE or explicit deletes where it fails.
- **Verify:** The schema walk test passes on Postgres in CI.

### SRV-06 · Consent-rescinded suspension prints the year 275760 and a doubled full stop

- **Fix (S):** When bannedUntil is the sentinel say "until support lifts it"; strip a trailing full stop from the reason before appending.
- **Verify:** Snapshot test of the banned message for the sentinel.

### SRV-08 · The server trusts a client-supplied x-request-id

- **Fix (S):** Always generate the id; log the client's value as a separate field.
- **Verify:** Two requests with the same header get different request ids.

## 2.2 Payments, entitlements and economy integrity (PAY)

### PAY-01 · Import provenance lets a forged save bring thousands of Jade into the ranked economy

- **Fix (M):** Lower the allowance to the model player's measured Jade plus a margin (about 1.5x), hold or refuse imports whose resources exceed what the Keep's storages can hold or whose army exceeds the Keep's housing, and sign export codes with a per-build HMAC so hand edits are detected (a stolen key only unlocks edits, which the allowance still caps). Record every held import for staff review.
- **Verify:** villageImport.test.ts: a Keep 5 export with 7,000 Jade keeps about 1,300; a tampered code is refused; a legitimate model-player export passes untouched.

### PAY-02 · The under-18 monthly cap counts catalog US dollars, not what the store charged

- **Fix (M):** Reserve with the catalog price, but count credited purchases with their stored priceMicros converted at a monthly rate table (or store the cap per storefront currency); state the cap in the player's currency in the Store.
- **Verify:** purchases.test.ts: a storefront purchase at 2x the USD price consumes 2x of the cap.

### PAY-03 · The refund-abuse pause is per account, and accounts are free

- **Fix (M):** Also count refunds per store identity (Apple originalTransactionId lineage or appAccountToken history, Google obfuscated account ids and device install id) and pause by that key; hold deliveries to brand-new accounts whose store identity has recent refunds.
- **Verify:** Test: a refund history on store identity X pauses a fresh account that redeems with the same identity.

### PAY-04 · Apple CONSUMPTION_REQUEST is never answered, which favours refunds against the game

- **Fix (M):** Collect the consent once at first purchase (a plain sentence in the confirm step) and store it; then answer with consumption data (delivered, consumed percentage, play time) through the App Store Server API.
- **Verify:** Contract test with a sample CONSUMPTION_REQUEST produces a valid ConsumptionRequest body.

## 2.3 Security (SEC)

### SEC-01 · The admin IP allow-list is bypassed by percent-encoding the path

- **Fix (S):** Decide admin access on the matched route, not the raw URL: register the admin routes in a Fastify plugin scope with its own onRequest hook, or check req.routeOptions.url.startsWith('/admin') in a preHandler, and reject paths that contain encoded slashes. Add tests for /%61dmin, //admin and /admin/../ variants.
- **Verify:** tests/backend/server/admin.test.ts: the encoded path from a disallowed IP answers 404 with a valid token; the allowed IP still reaches it.

### SEC-02 · /readyz tells anyone the database user, host and error text

- **Fix (S):** Return only ok or down per check; log the message server-side, or include it only when the metrics token is presented.
- **Verify:** Test: a failing ping yields {db:"down"} with no message text.

### SEC-03 · Client-controlled headers become unbounded metric labels

- **Fix (S):** Accept only builds that match the expected pattern (semver plus platform) and integer rules; map everything else to "other" and cap distinct label values per metric.
- **Verify:** Test: 1,000 random builds yield at most the cap plus "other".

### SEC-06 · Save export codes are unsigned, so any village is a text edit away

- **Fix (S):** Sign the payload with an HMAC over a per-build secret and refuse codes whose signature fails; keep the checksum for typo messages. Server import treats unsigned or old codes as untrusted.
- **Verify:** A code with one changed character is refused; a code from the same build round-trips.

### SEC-04 · GitHub Actions are pinned to major tags, not commit hashes

- **Fix (S):** Pin each action to a full commit SHA with a version comment and let Dependabot update them.
- **Verify:** A grep for "uses: .*@v" in .github finds nothing.

### SEC-05 · Android backups include the WebView storage that holds the save and the session token

- **Fix (S):** Set allowBackup to false, or add fullBackupContent / dataExtractionRules that exclude app_webview and databases.
- **Verify:** A debug build restored from backup starts with an empty village.

### SEC-07 · The online session token lives in localStorage

- **Fix (M):** Rotate device tokens on sign-in and every 30 days with the server (a refresh exchange), expire unused ones sooner than 400 days, and show active devices in Settings.
- **Verify:** A token older than the rotation window is refused with a clear re-sign-in prompt.

## 2.4 Operations, scaling and cost (OPS)

### OPS-01 · Alliance polling costs about 15 requests a minute per open screen

- **Fix (M):** Poll with a since-sequence parameter and ETag/304 answers, lengthen the interval when nothing changed (4 s, 8 s, 16 s up to 60 s), and move to server-sent events or long polling when a Redis pub/sub is available.
- **Verify:** Measured requests per idle Alliance viewer drop below 2 a minute.

### OPS-02 · Alert rules cover errors and desyncs but not money, webhooks, jobs or backups

- **Fix (S):** Add rules: purchase refusals above a rate, zero credited purchases for 24 h after launch, webhook 401s, job lease age above 2x its period, backup job failure (GitHub status to Prometheus or a dead-man switch), and a dashboard panel for revenue by store.
- **Verify:** promtool check rules passes; each alert fires in a staged scenario.

### OPS-04 · Staging and production deploy jobs still succeed without deploying

- **Fix (S):** Make the staging job fail (not warn) when DEPLOY_HOOK is unset on the default branch, and gate the Android and iOS release workflows on a successful staging contract run of the same commit.
- **Verify:** A push without the secret shows a red Server release job.

### OPS-03 · The server image has no HEALTHCHECK

- **Fix (S):** Add HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))".
- **Verify:** docker inspect shows a healthy status after start.

## 2.5 Client adapters, saves and persistence (CLI)

### CLI-01 · Commands the server refused are counted but never shown to the player

- **Fix (S):** Surface refused commands as a toast and a Settings → Online play entry ("3 actions from another device were undone: Kunai Tower upgrade…"), with the command type and time, and offer to re-apply where possible.
- **Verify:** villageSync.test.ts fixture with a refused command produces a HUD event; Playwright shows the toast.

### CLI-02 · Only Latin subsets of the two interface fonts ship, so 48 planned languages render in system fonts

- **Fix (M):** Ship per-script subsets as separate language-pack assets (M PLUS 1 has the glyphs; Noto Sans for the rest), loaded with the language file, and keep the size budget per pack measured by tools/i18n/build.mjs.
- **Verify:** A Japanese HUD screenshot shows M PLUS 1 glyphs; the pack size report lists the font bytes.

## 2.6 Gameplay simulation and battle (SIM)

### SIM-02 · The 14-day event calendar holds four distinct effects, one of them twice

- **Fix (M):** Add a signed, server-published event feed (like balance bundles) that may add events from a fixed catalog of effect types with real start and end times, plus two or three seasonal variants (festival names, themed looks) in the data.
- **Verify:** A bundle with an added event appears with its countdown; the honesty tests on countdowns still pass.

### SIM-01 · Offer triggering and age gating of offers are decided on the device only

- **Fix (M):** Have the server decide offer eligibility for server-held villages (an offers endpoint that returns the active offer and expiry from the same rules), and keep the device rule as the offline fallback.
- **Verify:** A server-held village with an under-18 age group gets no offer from the endpoint even when the client asks.

## 2.7 Balance and economy data (BAL)

### BAL-01 · Free Jade for an active player is about 320 to 400 a month, the price of the $4.99 to $9.99 pack

- **Fix (M):** Keep the faucets (they drive retention) but add Jade sinks worth wanting from Keep 6 on: warrior and hero skins, base decor sets, a second army-preset slot, replay sharing frames; and move part of the free Jade into resource rewards.
- **Verify:** Model-player test: free Jade per month at Keeps 4, 8 and 12 stays within a target band; sink inventory above 2,000 Jade of desirable items.

## 2.8 HUD, interaction and accessibility (UI)

### UI-01 · The Jade and Honor chips are divs with role=button but no keyboard access

- **Fix (S):** Use real button elements (or add tabindex="0", aria-label and Enter/Space handling) for every clickable div; audit with an axe pass in Playwright.
- **Verify:** Tab reaches the Jade chip and Enter opens the Store; axe reports no "interactive role without keyboard" violation.

### UI-02 · Accessibility markup is thin outside the modal and the HUD shell

- **Fix (M):** Add roles and names per panel (tablist/tab, list, dialog), aria-live="polite" on the toast region, text labels on icon buttons, and run axe in the Playwright smoke test as a CI gate.
- **Verify:** axe-core reports zero serious violations on village, Store, Army and Settings at 360 px.

### UI-03 · Player-visible English remains hard-coded in the HUD

- **Fix (S):** Move both to locales/en/ui.json keys, add the Spanish, and extend tests/gameplay/sim/remnant-text.test.ts (or a new lint) to flag quoted sentences in src/presentation outside i18n calls.
- **Verify:** The Spanish Settings screen shows no English; the lint passes.

## 2.9 Rendering, performance, art and audio (PERF)

### PERF-01 · iPhones without a home button are always given the high profile

- **Fix (S):** Use screen size and GPU renderer string (WEBGL_debug_renderer_info: Apple A12/A13) as extra signals, default notch iPhones older than A14 to low, and keep the run-time downgrade.
- **Verify:** On an iPhone XR the start-up log shows profile low with the reason; a 30-minute session stays under Safari's memory limit.

## 2.10 Build, release, tests and documentation (REL)

### REL-02 · The app identity is still the old game's bundle id and package name

- **Fix (M):** Owner decision first; then one change set: Capacitor config, both native projects (including the Java package folder and Sign in with Apple services id), the server's APPLE_BUNDLE_IDS and GOOGLE_PLAY_PACKAGE, the StoreKit configuration and the docs; a test that greps for the old id.
- **Verify:** grep for toadstoolkingdoms in android/, ios/, capacitor.config.ts and server/config.ts finds nothing; a debug build installs under the new id.

### REL-04 · Five worldwide-audit items are code-complete but unproven until the owner acts

- **Fix (L):** Treat the owner tasks in STATE_OF_THE_GAME section 6.3 as the release critical path: accounts and keys this week, then one signed TestFlight and one closed-track Play build, then the sandbox purchase, refund and restore checklist in docs/store/TESTING.md on two cheap phones.
- **Verify:** A TestFlight and a Play internal-track build complete a sandbox purchase, a refund and a restore; the audit's closure record gets the device evidence.

### REL-01 · npm test and npm run build rewrite a tracked file

- **Fix (S):** Write the report only on an explicit npm run i18n:size (or to dist/), and keep the committed copy as a dated snapshot updated on release.
- **Verify:** git status is clean after npm test and npm run build.

### REL-03 · The test suite cannot prove Postgres or Redis behaviour without services

- **Fix (S):** Run the Postgres and Redis services in the default test workflow too (docker services in the test job), and fail the job when any server test is skipped on the default branch.
- **Verify:** The test summary on main shows 0 skipped server tests.

## 2.11 Privacy, minors and store compliance (LAW)

### LAW-03 · Every publisher fact the legal pages need is still empty

- **Fix (S):** Owner decision: legal entity, address, support mailbox, hosting and crash-report regions, governing law, retention periods and a terms effective date; then fill the file, remove the "must be empty" assertion, and deploy the pages.
- **Verify:** public/privacy.html and terms.html render with no "not set yet" sentence on the live site; the compliance test is inverted to require values on release builds.

### LAW-01 · The chat and name filter is a 30-word English list

- **Fix (M):** Ship per-language lists for every active language (Spanish now), add pattern classes (phone numbers, handles, URLs, common obfuscations) and a server-side toggle to preset-only chat per Alliance or per market; budget a moderation vendor before soft launch.
- **Verify:** A corpus test of Spanish and English abuse samples is caught at the agreed rate; preset-only mode can be switched on without a deploy.

### LAW-02 · No app-level privacy manifest in the iOS project

- **Fix (S):** Add PrivacyInfo.xcprivacy declaring the data types the privacy label lists and any required-reason APIs (UserDefaults, file timestamps) after running Xcode's privacy report on an archive.
- **Verify:** The archive's privacy report shows no undeclared API and the upload has no ITMS-91053 warning.

## 2.12 Localization (L10N)

### L10N-01 · Two of fifty languages are real; the other 48 are empty folders

- **Fix (L):** Run the translation sessions for the wave-one languages the market plan names (Portuguese-Brazil, Indonesian, Japanese, Turkish, French, German), with native review and the per-language filter lists from LAW-01, and keep the language picker to ready languages only (it already does).
- **Verify:** availability.json marks each wave-one language ready at 100% with the smoke test passing.

### L10N-02 · Server refusal messages are English sentences

- **Fix (M):** Give every ApiError a stable code and parameters, translate by code on the client (as raid refusals already are) with the English message as fallback, and localise the server's own pages through server/localization.ts.
- **Verify:** A Spanish client receives the under-18 refusal in Spanish; a test lists every ApiError code with a key in locales/en/messages.json.

## 2.13 Product, retention and live-ops (PROD)

### PROD-01 · Keep looks are invisible to everyone but the owner

- **Fix (M):** Add the equipped look (and future warrior or hero skins) to the base upload and the scout view and replays, show the attacker's look on the result screen, and give Alliance rosters a Keep thumbnail; then widen the catalog.
- **Verify:** A friend scouting the village sees the owner's look; the protocol version bump is documented.

### PROD-02 · Telemetry cannot answer the questions a launch needs

- **Fix (M):** Add session_end (duration), keep_reached, store_open, purchase_failed (reason), battle_start, and a per-install profile event with country from the store/locale, language, quality profile, device memory bucket and platform; extend the rollup keys.
- **Verify:** The statistics report shows D7 and payer conversion split by country and quality profile.

### PROD-03 · The web build is a complete free game with no store

- **Fix (L):** Decide the web's job: either a demo capped at Keep 4 that offers the app and carries the village over through the linked account, or a full web client with web payments (Stripe or Paddle) behind the same server receipt path. Add Open Graph tags and store badges to index.html either way.
- **Verify:** A friend link on a phone shows the store badges; a web village continues in the app after sign-in.

## 2.14 Monetization design (MON)

### MON-01 · Cheap offers and the stipend give two to three times the Jade per dollar of the big packs

- **Fix (S):** Keep the stipend as the entry product but cap it at one active stipend; make the Artisan's Bundle once per account per Keep level (or price it at pack rate plus a builder discount); raise pack value at the top (for example 85 to 90 Jade per dollar at $49.99 and $99.99) so the ladder has a reason to exist; show "per Jade" value in the Store honestly.
- **Verify:** A script over store.json and offers.json shows no repeatable product above the top pack's Jade per dollar; purchase telemetry after launch shows spend spread across tiers.

### MON-02 · The Season Scroll is dominated by the stipend for anyone who wants Jade

- **Fix (M):** Make the pass about things only the pass can give: exclusive warrior or hero skins visible in battle (PROD-01), a profile frame, an extra army preset, and resources scaled by Keep; keep Jade on the pass small. Price the stipend as the plain Jade product it is.
- **Verify:** Pass attach rate and completion rate tracked after PROD-02 lands; the pass sells for its exclusives, not its Jade.

---

# Part 3. How this game can make money

## Where it stands

There is no revenue, no player and no deployed server. The native shells carry in-app purchases that have never been exercised on a real storefront, and the public web build is a complete free game with no store. The catalog exists (seven Jade packs from $0.99 to $99.99, a $2.99 Clan Stipend of 30 daily Jade payments, a $4.99 Season Scroll, five triggered offers, seven Keep looks), and the project's own rules forbid loot boxes, paid random items, pop-up offers to minors or unknown ages, and selling the daily chest, streak repairs, calendar or trial rewards. Those rules are an asset in the stores and with parents; they also mean the game must earn its money from impatience, convenience, status and belonging, not from gambling. Everything below stays inside them.

## The seven levers, ranked by expected value per effort

1. **Get to a storefront at all (owner work, weeks, no code).** Publisher facts, a legal entity, the new bundle id, developer accounts, keys, a signed TestFlight and a Play closed track (LAW-03, REL-02, REL-04). Expected value: every other lever is zero until this is done.
2. **Fix the ladder (S, days).** Today a stipend plus a weekly Artisan's Bundle buys about 1,000 Jade for $7.98, the same Jade as the $19.99 pack, so nobody rational buys above $4.99 (MON-01). Cap the stipend at one active, make the Bundle once per Keep level, raise the top packs to 85 to 90 Jade per dollar. Expected effect, by benchmark: average revenue per paying user in this genre is $20 to $40 a month for mid-core base builders (industry benchmark, vendor reports 2024-2025, not this game); the current cap is about $35 a month and only through weekly repurchases, so the fix mainly opens the $19.99 to $99.99 tiers to the few players who want them.
3. **Give Jade something to buy after the builders (M, weeks).** Free Jade is 320 to 400 a month (BAL-01) and the two paid builders cost 750 once. From Keep 6 on there is little to want. Add warrior and hero skins visible in battle and replays, base decor sets, a second army-preset slot, profile frames; make looks visible to attackers, friends and the Alliance (PROD-01). Expected effect: cosmetics are 20 to 40 percent of revenue in comparable titles once they are visible to others (benchmark); invisible cosmetics are near zero.
4. **Make the pass the retention product, not a Jade bundle (M).** Replace most of its 340 premium Jade with exclusives from lever 3 and Keep-scaled resources; keep the stipend as the plain Jade subscription-like product (MON-02). Expected effect: pass attach rates of 3 to 8 percent of monthly actives are common in the genre (benchmark) when the pass holds exclusives.
5. **Decide what the web is for (L).** Either a demo capped at Keep 4 that hands the village to the app through the linked account, with store badges and Open Graph tags on the page, or a full web client with web payments through the same server receipt path (Stripe or Paddle, 3 to 5 percent fees instead of 15 to 30) (PROD-03). A friend link is the cheapest install in the genre; today it lands on the version that cannot pay.
6. **Measure before buying installs (M).** Add session length, Keep reached, store opened, purchase failed, country, language, device tier and quality profile to the shared statistics and the rollup (PROD-02). Without them no soft launch can be read and no acquisition spend can be justified.
7. **Spend on content cadence, not acquisition, first (M).** A server-published event feed (SIM-02), per-language chat filters so chat can stay on (LAW-01), and the wave-one translations (L10N-01). Retention is cheaper than installs: in this genre D30 of 8 to 12 percent versus 4 percent roughly triples lifetime value (benchmark arithmetic, not measured here).

## A revenue model with its assumptions

All inputs are benchmarks or assumptions; nothing has been measured for this game. Commission: 15 percent under Apple's Small Business Program and Google's 15 percent tier below $1M a year, 30 percent above. Hosting from the server's own structure: one Postgres with point-in-time recovery, one Redis, two small API instances, object storage and Sentry.

| Scenario | Monthly actives | Payer share | Spend per payer / month | Gross | Store cut (15%) | Hosting and tools | Support and moderation | Net before people and marketing |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Soft launch (PH, CA, AU, NZ) | 20,000 | 1.5% | $9 | $2,700 | $405 | $350 | $800 (one part-time moderator) | about $1,100 |
| Regional (plus BR, ID, TR, ES-speaking) | 150,000 | 1.8% | $10 | $27,000 | $4,050 | $1,200 | $4,000 | about $17,700 |
| Worldwide (plus JP, KR, EU, US) | 600,000 | 2.2% | $14 | $184,800 | $27,700 to $55,400 | $4,500 | $15,000 | about $110,000 to $138,000 |

Arithmetic: gross = actives x payer share x spend; the worldwide store cut is shown at 15 and 30 percent because the yearly total crosses $1M. Hosting at 600k monthly actives assumes about 60k daily actives and the polling fix (OPS-01); without it add roughly $2,000 a month of database and egress. Payer share and spend per payer are the levers above: with today's ladder the spend per payer is capped near $35 a month and in practice sits below $10, so the soft-launch row is the honest expectation until MON-01 to MON-02 and PROD-01 land.

What the illustration in the worldwide audit ($8,000 gross from 100,000 actives) assumed is consistent with the soft-launch row here: the game is small money until retention and the catalog change.

## Plan

**First 90 days (no paid acquisition).** Owner: entity, facts, ids, accounts, keys (lever 1). Code: SEC-01 to SEC-03 and PAY-01 before anyone can sign in; MON-01 ladder fix; PROD-02 telemetry; CLI-01 refused-action toast; the Spanish money messages (L10N-02); the deletion schema test (SRV-07). Store: one TestFlight and one Play closed track with the sandbox purchase, refund and restore checklist on two cheap Android phones and one old iPhone. Metrics and kill criteria written down: tutorial completion above 70 percent, first raid above 60 percent, D1 above 35 percent, D7 above 12 percent, crash-free sessions above 99 percent; pause if two of five fail after 5,000 installs.

**Months 4 to 6 (soft launch, English and Spanish).** Levers 3 and 4: visible looks and the first warrior skins, the pass redesign, the event feed (SIM-02). Per-language filters and a moderation vendor quote (LAW-01). Decide the web's role and build the hand-off (lever 5). Spend at most $15,000 on installs in two markets to validate D7 and payer share; read them by country and device tier.

**Months 7 to 12 (regional).** Wave-one translations with native review (L10N-01: Portuguese-Brazil, Indonesian, Turkish, Japanese, French, German), the legal items per market, regional price templates, and a second cosmetics wave. Only then paid acquisition at scale, and only if the soft-launch rows above held.

## Catalog changes to make first

- Clan Stipend: one active at a time; 30 payments of 12 Jade stays. Label it plainly as 30 daily payments, never "monthly".
- Artisan's Bundle: once per Keep level, or priced at the pack rate plus a free builder-day; today it is a weekly 130 Jade per dollar faucet.
- Packs: $49.99 to 4,250 Jade and $99.99 to 9,000 Jade so the ladder climbs to about 90 per dollar; the $0.99 Pinch stays as the first-purchase trigger.
- Season Scroll: exclusives (one warrior skin, one hero look, a profile frame, an extra preset) plus Keep-scaled resources; premium Jade down to 120.
- Looks: visible to others first (PROD-01); then three warrior skin sets at 300 to 600 Jade and a base decor set at 400.
- Offers for undeclared-age players: none, as today; for adults, show the Starter Pack at the first long wait, as today, and nothing else until Keep 4.

## Live-ops and retention as revenue

The data already supports a daily chest, a streak, a 28-day calendar, a pass with daily and weekly tasks, Alliance Wars, Gang Wars, Friendly Duels and Shadow Trials. What is missing is change over time (SIM-02) and a reason to see other players' progress (PROD-01). A monthly themed event with a visible reward, a clan leaderboard season with a shared chest, and replays that can be shared as a link are the three cheapest additions. Every one of them is measurable only after PROD-02.

## Adjacent revenue

- Web payments (Stripe or Paddle) for the web client: yes, once the web's role is decided; lower fees and a path for markets where store payments are weak.
- A premium "no waits" edition: no; it breaks the one-economy model and the server's replay of commands.
- Rewarded video or ads: no; the listing promises no ads, minors are present, and the stores' families policies make the compliance cost higher than the revenue at this scale.
- Cosmetic partnerships or licensed skins: later, when there is an audience.
- Licensing the deterministic battle engine or the server-checked economy to other studios: a real asset but a different business; park it.
- Grants and publisher deals: the honest-design position and the server architecture are a credible pitch to publishers who want a clean mid-core title; a publisher removes the owner-work bottleneck of lever 1.

## What not to do

- Do not add random paid items, pop-up offers to unknown ages, or sell the chest, streak repairs, calendar or trial rewards. The code enforces these rules and the stores reward them.
- Do not buy installs before PROD-02 lands and the store flows have been run on devices.
- Do not launch chat in a language without a filter list and a moderator who reads it.
- Do not lower the under-18 protections to lift conversion; fix the USD basis instead (PAY-02).

## Owner decisions required

- Legal entity, name check, bundle id and package name, domain, hosting and crash-report regions, governing law, retention periods, terms effective date (LAW-03, REL-02).
- Apple and Google developer accounts, keys and secrets, OAuth clients, the products in both consoles (REL-04).
- The web's role: demo with hand-off, or full web client with web payments (PROD-03).
- Catalog prices and the ladder (MON-01, MON-02) and regional price templates.
- Moderation staffing and vendor (LAW-01); the wave-one language list (L10N-01).
- Whether to collect consumption consent for Apple refund disputes (PAY-04).

---

# Part 4. The same game from different angles

8 short assessments, each written from one point of view and grounded in the findings above (ids in brackets).

## A first-time player on a $100 Android phone in Manila, on 3G

I tapped a friend's link and got the web game, not an app. It loaded, slowly, and I was building a village in under a minute, which is more than most games manage on this phone. The tutorial is ten steps and gets me to a raid by step nine; the Smoke Bomb idea landed. Then the waits began and the gold "Finish now" button is the brightest thing on the screen. I understood Jade was money. My village is on this phone only; when I switch to the app later, I will find out whether it comes with me (PROD-03). Chat is in English and the filter will not catch Tagalog (LAW-01). If my data runs out, the Alliance screen keeps polling every four seconds (OPS-01). What would change my mind: a store badge and a sign-in that carries my village to the app; a Keep look I can show my Alliance; Tagalog or at least a filter that works in my language.

## A player on a Windows 11 laptop with a trackpad

The game fits the window and the HUD is readable. The modal dialogs trap focus and close on Escape, which is better than most web games. But I cannot reach the Jade chip or the Honor chip with Tab (UI-01), most panels have no roles or names (UI-02), and there are no keyboard shortcuts for Build, Army or Attack. The battle is a touch design: tapping a glowing ring with a trackpad works, but there is no hover help and no right-click. What would change my mind: real buttons everywhere, B/A/Enter shortcuts, and tooltips on hover.

## An App Store reviewer

The build I would see today cannot be submitted: the bundle id is another app's and the contact information, privacy policy and terms pages say "not set yet" (REL-02, LAW-03). Assuming those are fixed: purchases go through StoreKit with a confirm step and real prices from the store, there are no loot boxes, the odds of the free chest are shown, account deletion exists in-app and on the web, and Sign in with Apple is offered where other sign-ins are. I would ask about the chat filter for a 13+ game with user-generated content (LAW-01), check the privacy manifest on upload (LAW-02), and try to buy with a sandbox account, which nobody has done yet (REL-04). What would change my mind: a TestFlight build that completes a sandbox purchase, a refund and a restore; live legal pages; a filter list for every language the app lists.

## A Google Play policy reviewer

Billing 9 is in the code, the Age Signals plugin is wired, there is a web deletion URL and the Data safety answers are drafted. The package name is still the old app's (REL-02), the release workflow has never produced a signed bundle because no upload key exists (REL-04), and backups are allowed with no rules (SEC-05). The UGC policy needs a working filter and a staffed report queue (LAW-01); thirty English words will not do for a worldwide listing. What would change my mind: a closed-track upload, one real purchase and refund on a license tester account, a Data safety form that matches the statistics events (PROD-02), and per-language filters.

## Someone who wants to cheat

The battle is replayed on the server, the seed comes from the server, and the under-18 cap is checked again at redeem, so the obvious tricks are closed. What is left: export my village, edit the JSON (the code is unsigned, SEC-06), give myself the Jade the import allowance tolerates and a maxed army, and import (PAY-01). Refund a purchase after spending it, re-register, repeat (PAY-03). Mint tokens on a linked account to multiply my lookup and match limits (SRV-03). If I ever found a staff token, the office IP fence would not stop me (SEC-01). What would change my mind: signed export codes, a tighter import allowance, refund counting per store identity, and admin access decided on the matched route.

## A parent of a 12-year-old

I like what I read: no loot boxes, a spending cap that the server keeps even if my child says they are older, no pop-up offers for minors, chat limited to fixed phrases under 13, and a way to withdraw consent that actually suspends the account. I do not like that the cap is in US dollars rather than what we are charged (PAY-02), that the chat filter for older kids is thirty English words (LAW-01), or that the age question is a self-declared birth year. What would change my mind: a cap stated in my currency, filters in our language, and the store's own age signal used wherever it is available.

## An investor doing due diligence

Strong engineering, clean code, honest design, a server that owns the economy. No players, no revenue, no deployed server, no storefront, no measured retention, and a founder bottleneck on legal and store setup that code cannot remove (LAW-03, REL-02, REL-04). The catalog caps spend per payer near $8 a week (MON-01), the cosmetics cannot be seen by anyone else (PROD-01), the web build gives the game away (PROD-03), and the telemetry cannot tell me which country or phone tier converts (PROD-02). I would fund the next six months as a soft launch, not a worldwide release, with the ladder fix, visible cosmetics, telemetry and the store flows on devices as milestones. What would change my mind: a signed build completing purchases, D7 above 12 percent in two markets, and payer share above 1.5 percent with the new ladder.

## The live-ops and community manager on launch day

I can change prices of nothing and balance of some things through signed bundles, but I cannot add an event, a message of the day or an offer rule without a release (SIM-02, SIM-01). The dashboards alert on errors and desyncs but not on failed purchases or a stuck refund poll (OPS-02). Players who build on two devices will lose actions silently and write to me about it (CLI-01). The ladder is bots labelled as bots until real players arrive, which the reviews will mention. What would change my mind: a server-published event and notice feed, money alerts, and a visible record of undone actions in the game.

---

# Part 5. Method, verification and limits

## What was covered

The author read, in the current code: the server's HTTP adapter, rate limiter, idempotency and admin hooks; the purchase, receipt-verification, refund and import modules; the raid ticket module's structure; the village command set the server replays; the save format, export codes and offline progress; the battle simulation's arithmetic and its parity with the archived server rules; the client's token storage, sync conflict handling, service worker and update flow; the quality detection and fonts; the HUD's accessibility markup, modal focus handling and hard-coded text; the age, offer and statistics code; the native manifests, workflows and Dockerfile; the balance data files (packs, offers, pass, chest, streak, calendar, events, trials, ranks, cosmetics, builders) through small scripts; and the three earlier audits' open items. One aborted auditor's in-process probe of the server (eleven scenarios against the memory repository) was recovered and its results were re-read against the code.

## What was not covered

No physical phone, no signed build, no storefront, no deployed server, no legal review. The battle simulation's internal logic (targeting, pathing, abilities) was checked only for determinism and parity, not for new balance or exploit findings beyond the earlier audits. The procedural art and audio code, the Phaser scenes' per-frame behaviour and texture budget, the Spanish text quality, the server's SQL in detail (locks, indexes, deadlocks), the deletion routine line by line, the workflows' secrets handling beyond pinning, and the tutorial's exact copy were not reviewed in this pass; the earlier audits' findings in those areas stand as recorded there. No independent verifier checked these findings; the planned adversarial verification did not run.

## Why the multi-agent plan failed

Two attempts to run 30 auditor lanes with verifiers were made on 8 November; each consumed the account's five-hour usage window within minutes of starting and every agent was cut off before writing a result. The scripts and lane briefs are kept in the session scratchpad and can be rerun when the usage window allows.

## Top ten in the author's judgment

1. LAW-03 and REL-02: nothing can be filed until the owner fills the publisher facts and picks the identifiers.
2. REL-04: the money path has never run on a device or storefront.
3. SEC-01: the admin network fence is bypassable.
4. PAY-01 with SEC-06: forged villages enter the ranked economy.
5. MON-01: the ladder caps revenue per payer.
6. PROD-01: invisible cosmetics, so Jade has nothing to buy.
7. PROD-03: the web build gives the game away with no store or hand-off.
8. PROD-02: a launch could not be measured by market or device.
9. LAW-01: a thirty-word English filter for worldwide chat.
10. L10N-01: two real languages.

## First two weeks

Owner: entity, facts, identifiers, accounts, keys. Engineering: SEC-01, SEC-02, SEC-03, SEC-06, PAY-01 (allowance and signing), MON-01 (data only), SRV-02, REL-01, then PROD-02. Then the first signed builds and the device checklist.

## Appendix A. Findings by area group

| Group | Findings | Verified | Suspected |
|---|---:|---:|---:|
| Server: authentication, accounts, raids, data (SRV) | 8 | 7 | 1 |
| Payments, entitlements and economy integrity (PAY) | 4 | 3 | 1 |
| Security (SEC) | 7 | 7 | 0 |
| Operations, scaling and cost (OPS) | 4 | 4 | 0 |
| Client adapters, saves and persistence (CLI) | 2 | 2 | 0 |
| Gameplay simulation and battle (SIM) | 2 | 2 | 0 |
| Balance and economy data (BAL) | 1 | 1 | 0 |
| HUD, interaction and accessibility (UI) | 3 | 3 | 0 |
| Rendering, performance, art and audio (PERF) | 1 | 0 | 1 |
| Build, release, tests and documentation (REL) | 4 | 4 | 0 |
| Privacy, minors and store compliance (LAW) | 3 | 2 | 1 |
| Localization (L10N) | 2 | 1 | 1 |
| Product, retention and live-ops (PROD) | 3 | 3 | 0 |
| Monetization design (MON) | 2 | 2 | 0 |

## Appendix B. Candidates that did not survive

None: no independent verification round ran on this pass, so no candidate was refuted. The workflow scripts for that round are described in Part 5.


