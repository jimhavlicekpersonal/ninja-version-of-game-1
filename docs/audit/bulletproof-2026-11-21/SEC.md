# SEC: security, cheating and server readiness (audited commit 560ce7a, 2026-11-21)

Read-only audit. Every line below was checked against the code at HEAD. Nothing was run: `node_modules` is absent in this checkout, so no test or probe was executed. Findings are from reading the code and are marked "(inferred)" where a step was reasoned rather than read. The 2026-11-20 security audit's fixes (C1, P1-P3, S1-S7, A1-A5, D1-D4, F1) were spot-checked and still hold. They are not re-reported here.

Earlier 2026-11-21 labels: **S-1, R-1, S-2 and G-1 map to concrete code below.** None of `REQUIRE_SERVER_VILLAGE`, "label allowlist" or "late-report rule" exists anywhere in `server/`, `src/` or `docs/`, so all three are still to be built. **S-3 and S-4 could not be identified**: no trace in the repo, and only the earlier audit's last page survives. The two polish items most likely to be them are SEC-15 and SEC-17, but that is a guess.

## 1. Verdict table

| Item | Verdict | One-line evidence |
|---|---|---|
| Device-held village trust (memory editor / save edit) → leaderboards, PvP, wars | **FAIL** | `checkArmy` is a legality check only (`server/core/pvp.ts:200-248`). `uploadBase` takes any legal base at any Keep, with no account-age or Keep-jump check (`pvp.ts:267-287`). `requireArmyOnServer` returns early for a device village (`pvp.ts:479`). No `REQUIRE_SERVER_VILLAGE` exists. |
| Leaderboards server-computed | **PARTIAL** | Honor and Power are computed on the server from re-simulated battles (`pvp.ts:756`, `876-891`), but from inputs a device village picks: Keep, army and levels at that Keep's cap, unlimited troops. |
| Retroactive cheater removal (staff) | **PARTIAL** | `ban` drops the player from the board (`server/core/admin.ts:156-171`) and `resetRating` exists (`173-185`). There is no honor reset, no undoing of honor the cheater's raids gave or took, no session revocation and no suspicious-player list (`server/routes/staff.ts:17-38`). |
| Replay / tamper (nonces, seq, idempotency, old reports) | **PASS** | Tickets are used once and keep their answer (`pvp.ts:452-468`). A repeated `seq` is refused (C1). `Idempotency-Key` carries a fingerprint (`docs/PROTOCOL.md` "Idempotency"). Seeds are issued by the server (`battleSeed`, `pvp.ts:686-693`). Bearer token over TLS; no request signing needed. |
| Late reports / tool-assisted battles (earlier G-1) | **FAIL** | A started raid can be reported up to `TICKET_TTL_MS + LATE_REPORT_MS` = 73 h after scouting (`pvp.ts:41,52,466`), and the seed is known from Attack. It is forfeited early only if the attacker calls `match` again (`pvp.ts:338`). Report latency is neither measured nor capped. |
| Secrets in client bundle | **PASS** | Only public values: `VITE_SENTRY_DSN` (public by design), `VITE_GOOGLE_CLIENT_ID`, `VITE_APPLE_SERVICES_ID`, `VITE_BALANCE_PUBLIC_KEY` (`.github/workflows/deploy.yml:47-59`). A grep of `src/ public/ android/ ios/ capacitor.config.ts index.html` found no private key, token or API secret. No `google-services.json`, keystore or `.env` is tracked. |
| Client obfuscation | **PASS (by design)** | Vite's default production minify. No `sourcemap` in `vite.config.ts:161-173`. `window.tk` appears only under `?debug` (`src/main.ts:737`). The server is the authority, so obfuscation adds nothing. |
| Value paths still trusted from the client | **FAIL** | For device villages: army, levels, Keep, base and loot holders (all bounded only by legality). Gang War, Alliance War and Grove Raid scores from device attackers pay chests into teammates' server-held villages (`server/core/gangWars.ts:409-431`). Raids by device attackers take real loot from server-held defenders (`pvp.ts:788`). Device-held donor → device receiver is trusted. Command times within 12 h (X1). |
| Rate limiting (account, IP, device; Redis down) | **PASS / note** | Per player 240/min, per IP 3,000/min, plus route rules (`server/rateLimit.ts:74-98`). Redis down falls back to per-instance memory counters divided by `RATE_LIMIT_INSTANCES` (`server/shared.ts:283-319`): degraded, not fully open. There is no per-device rule because device ids are chosen by the client. Registration is keyed by IPv6 /64 only (SEC-15). |
| Metrics label allowlist (earlier S-2) | **FAIL** | `tk_client_requests_total{build}` takes any 40-character `X-Client-Build` header, on every path including `/healthz`, **before** the rate-limit hook (`server/app.ts:266-267` vs `318-327`). `PromMetrics` keeps every series for ever (`server/observability.ts:69-93`). |
| Privacy minimisation | **PASS** | Statistics have no player id or IP (migration 0027). Crash reports are opt-in. Server Sentry sends no request body (`observability.ts:147-171`). |
| Deletion clears every player-owned table | **PARTIAL** | `deletePlayer` (`server/stores/pg/players.ts:172-276`) covers 40 tables. `player_notices`, `deletion_codes` and `village_parts` go by `ON DELETE CASCADE`. Not cleared: `squad_war_attacks.attacker_id`, `squad_war_relays.last_by/holder`, and the player's name inside stored bases (`base_versions`) that other players' tickets reference, until retention (SEC-14). |
| Load test and 10× target | **PARTIAL** | `server/load.ts:14-17` defines 5× peak (~14 battles/s) and tests battles only. There is no 10× target, and no command-batch or hello/sync traffic. Measured 3 battles/s per instance before workers (`docs/backend/PVP_ROADMAP.md:327`) and 7.96/s with 3 workers (`:342`). |
| Autoscaling and spend alerts | **OWNER** | Nothing in `ops/` (only `prometheus/alerts.yml`, `grafana/game-versions.json`). No cost or billing alert. No instance-count policy beyond "run at least two" (`docs/SHIPPING.md` 3h). |
| Backups and restore drill | **PASS (soft launch) / OWNER (scale)** | Daily encrypted dump, plus a Sunday restore drill that starts the server on the restore (`.github/workflows/backup.yml:17,76-84`). PITR / WAL archiving is an owner step (`docs/SHIPPING.md` 3h "Size"). |
| Graceful shutdown | **PASS** | `server/shutdown.ts:1-30`: drain `/readyz`, close HTTP, workers, Redis and pool, with a hard deadline. |
| Migrations backward-compatible | **PASS (policy)** | Numbered and never edited. The rule is in `src/backend/CLAUDE.md`, and contract tests run against the previous release's client (`server.yml:142`). No mechanical check that a migration is additive. |
| Observability and alerts | **PARTIAL** | 13 alerts (`ops/prometheus/alerts.yml`). None on `tk_resim_busy_total` (503 busy), series count or memory, forfeits or late reports, or honor-gain anomalies. |
| Deployment safety (staged, rollback) | **PARTIAL** | Staging gets automatic deploys and contract tests, then production by hand behind required reviewers (`.github/workflows/server.yml:148-173`). There is no documented one-command rollback and no canary. |
| Time source | **PASS** | Server clock (`Date.now`, `ctx.now`). Command times are clamped to `[max(row.at, now-12h), now+2 min]` (`server/core/village.ts:45`, `docs/PROTOCOL.md` "Time"). Host NTP is an owner step. |
| TLS | **PASS** | HSTS over HTTPS (`app.ts:249-250`). Production refuses unverified Postgres TLS (`server/config.ts:171-180`). |
| Certificate pinning | **DOCS (decide)** | No pinning, and no recorded decision (grep of `docs/DECISIONS.md`, `SHIPPING.md`, `PROTOCOL.md`). |
| CSP on web (F2) | **FAIL (open)** | `index.html` has no CSP meta and two inline scripts (`index.html:13,63`). Only the server pages have CSPs (`server/adminPage.ts:12`, `accountPage.ts:73`, `complaintPage.ts:64`). |
| Server address field in store builds (earlier R-1) | **FAIL** | Settings → Advanced → Server address is offered in every build (`src/presentation/ui/settingsUi.ts:184`, `hud.ts:1037-1055`). A chosen URL overrides `VITE_SERVER_URL` (`src/backend/net/connection.ts:122-126`). |
| Account takeover: login, token storage (F3), revocation, audit | **PARTIAL** | Sign-in tokens are checked (2026-11-20 audit). `revoke-others`, rotate and unlink exist. Open: iOS token in backups (F3: no Keychain; `ios/App/App/*.swift` has no Keychain code), `SIGNIN_NONCE_REQUIRED` off by default (`server/core/context.ts:51`), no new-device notice (`links.ts:265-275`), no staff session view or revoke, staff reads not logged. |
| Moderation: report, block, staff, names (S5) | **PARTIAL** | Report, block, mutes, complaints and renames are in place. S5's open part is confirmed: `nameKey` = lower + NFC + separators (`src/backend/net/names.ts:45-47`), no confusable skeleton. |
| L1 (caps outside a transaction) | **FAIL (open)** | `friends.ts:202-204` (counted before `transaction`), `squads.ts:121`, `groves.ts:95`. |
| P4 (sandbox credit cap off) | **OWNER/CODE (open)** | `DEFAULT_POLICY.sandboxDailyCapUsd: null` (`context.ts:55`). `checkConfig` neither warns nor refuses (`config.ts:160-205`). |
| X1 (12 h backdate on time-window claims) | **FAIL (open, design)** | `MAX_BACKDATE_MS = 12 h` (`village.ts:45`). Earliest time = `max(row.at, now-12h)` only. |
| "Honor never decreases on a lost defense" | **Confirmed (design)** | `ranks.json:169` `defenseHonorLossShare: 0`. Honor is not zero-sum, so a raid volume no troops limit (device villages) inflates the board without bound. Feeds SEC-01. |
| "Smurfing / 3 AM queues: generated rivals labelled" | **PASS (honesty) / NEEDS-DEVICE (population)** | `matchAnswer` labels `kind: 'bot'` when `defenderId` is null (`pvp.ts:442`). Not measured with a real population. |

## 2. Work items

### SEC-01: Device-held villages are fully trusted in ranked play: add `REQUIRE_SERVER_VILLAGE` (earlier S-1)
- Severity: BLOCKER
- Status: FAIL
- Kind: CODE
- Compartment: server
- Checklist refs: Checklist 7.x "server owns online truth"; Masterclass 6 Trust boundaries; CLAUDE.md Invariant "The server owns online truth"
- Evidence: There is no `REQUIRE_SERVER_VILLAGE` anywhere (grep of the repo), and `checkConfig` has no such rule (`server/config.ts:160-205`).
  - **Base upload.** `uploadBase` takes any base `validateBase` accepts at the Keep the base itself names (`pvp.ts:82-136`, `267-287`). There is no account-age gate (import has one: `importMinAccountDays`, `villageImport.ts:268-271,398-404`) and no limit on Keep jumps. A fresh account can upload a maxed Keep 15 base on day 1, and `hallLevel` sets its match window and its Power Ranking value (`powerRating(…, p.hallLevel)`, `pvp.ts:886`).
  - **Army.** `checkArmy` allows full camps at research-cap levels for that Keep (`pvp.ts:210-248`). `requireArmyOnServer` skips device villages (`pvp.ts:479`), so troops are never consumed and raids are limited only by `match` 30/min and `battle` 20/min (`rateLimit.ts:78-79`).
  - **Rerolls.** A device village can `match` → void → `match` freely. The scout-seed reuse that stops this applies only to server-held villages (`pvp.ts:323-329`, whose own comment notes a guessed seed predicts the outcome ~98% of the time).
  - **Honor.** Honor is gained against generated bases too (`defTrophies = ticket.defenderTrophies`, `pvp.ts:755-756`). There is no daily gain cap for attackers, and defenders lose nothing (`ranks.json:169`).
  - **Harm to honest players.** A device-held raider takes real resources from server-held defenders (`lootFrom === 'server-village'`, `pvp.ts:788`). Device attackers' war stars earn Gang War chests, with Jade against real Gangs, for server-held teammates (`gangWars.ts:409-431`).
  - The game itself auto-moves villages (`src/main.ts:288` `keepVillageOnServer: true`, `connection.ts:247`), so only modded clients or scripts stay device-held. The documented protocol plus the shipped simulator (`botDeployments`) make such a script easy (inferred).
  - Verified by reading. Not run (no node_modules).
- Fix:
  1. Add a policy field `requireServerVillage: boolean` to `ServerPolicy` / `DEFAULT_POLICY` (`server/core/context.ts`). Read it in `policyFromEnv` (`server/config.ts`) from `REQUIRE_SERVER_VILLAGE=1`. In `checkConfig`, production warns while it is unset. After the migration window, refuse to start without it (or require an explicit `REQUIRE_SERVER_VILLAGE=0`).
  2. Add `requireHeldVillage(ctx, me)` in `server/core/village.ts`: when the policy is on and `!hasServerVillage(ctx.repo, me.id)`, throw `fail(404, 'no_village', 'pvp.village_required')`. Add `srv.pvp.village_required` to `locales/en/messages.json` and translate it (`npm run i18n:sync && npm run i18n:check`).
  3. Call it at the top of: `pvp.match`, `pvp.startAttack`, `pvp.attack`, `pvp.uploadBase` (refuse instead of storing), `groveRaid.raidTicket` and its report, `gangWars` ticket, report and claim, `duels.duelTicket` (optional), `groves.donateIn` (donor and receiver), `referrals.claim` (already requires one) and `sharedReplays` (optional).
  4. Rankings: add `BoardFilter.heldOnly` to `topPlayers`, `rankOf`, `topByPower`, `powerValues` and `rankedPlayers` in both adapters (join `villages`). With the policy on, `boardFilter(ctx)` sets it, and the Redis board rebuild uses it (`shared.ts` `rebuildFilter`). `ctx.board.set` is skipped for device players.
  5. Matchmaking: exclude defenders without a server village from `findOpponents` while the policy is on. Otherwise uploaded-base raids continue.
  6. Interim hardening even with the policy off:
     - `uploadBase` caps the Keep with the same `importMinAccountDays(keep)` age rule as import, and allows at most +1 Keep per `MIN_KEEP_UPGRADE_HOURS` (data-driven) above the stored `hallLevel`.
     - Device villages get the scout-seed reroll rule: one open unstarted ticket, with a reroll cooldown.
     - Add a per-player daily honor-gain ceiling for device villages.
  7. Villages whose move was refused (`villageMoveRefused`): the game already offers "start a new village on the server". Add the refused reason to `/admin/v1/players/:id` so support can resolve it.
  8. Document in `docs/PROTOCOL.md` "Trust" and "Server-owned village" (behaviour change, existing error code, no protocol bump), and in `docs/SHIPPING.md` 3h (switch on after a release where the auto-move has run).
- Tests: `tests/backend/server/require-server-village.test.ts`:
  - (a) policy on: a device-held player gets `404 no_village` from match, attack, war ticket, upload base and donate;
  - (b) policy on: leaderboard and power board list only held players (memory + `TEST_DATABASE_URL`);
  - (c) policy off: a 1-day-old account uploading a Keep 15 base is refused (fails on today's code);
  - (d) policy off: a device player cannot reroll more than N tickets a minute without starting.
- Done when: with `REQUIRE_SERVER_VILLAGE=1`, no route that changes honor, rating, war score, loot or donations accepts a player without a server-held village. Both leaderboards contain only server-held players. Tests (a)-(d) pass on memory and Postgres.
- Don't break: offline play (device villages still play offline and Practice); protocol changes in `docs/PROTOCOL.md` with contract tests (`tests/backend/contract/`); deploy the server before the game; the honesty label for generated bases; under-13 board filters (`hideUnder13` must compose with `heldOnly`).

### SEC-02: Unbounded Prometheus label values from client headers (earlier S-2, "label allowlist")
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: server
- Checklist refs: Checklist availability / DoS; Masterclass 6 Trust boundaries (untrusted input into ops systems)
- Evidence:
  - `server/app.ts:266-267` counts `tk_client_requests_total{build: X-Client-Build.slice(0,40), rules: X-Sim-Rules.slice(0,8)}` for **every** request carrying the header, on any path including unmatched ones and `/healthz`. This hook (registered at `app.ts:256`) runs before the rate-limit hook (`app.ts:318`), so even refused requests create series.
  - `PromMetrics.count` stores one Map entry per distinct label set and never forgets it (`server/observability.ts:69-93`). `/metrics` prints them all (`:120-143`).
  - Other client-steered label values:
    - `tk_refused_total{rules: String(sub.rules)}` (`pvp.ts:633`; any integer from the body);
    - `{rules: String(client?.rules)}` (`pvp.ts:619`, `316`);
    - `rules` header in `app.ts:262`.
  - An unauthenticated sender with random build strings grows server memory and the scrape without bound: an availability and Prometheus-cost attack (inferred from code; not run).
- Fix:
  1. In `server/observability.ts`, add `LABEL_ALLOW: Record<string, (v: string) => string>`, plus a per-metric series cap (e.g. `MAX_SERIES_PER_METRIC = 500`). Beyond the cap, count into `{…, overflow="1"}`. Add `tk_metrics_series_dropped_total`.
  2. `build`: keep only values matching `/^\d+\.\d+\.\d+(\+(web|ios|android))?$/` **and** at or below the newest known build, else `other`. `rules`: an integer present in `ctx.rules` (live + archived + retired), else `other`.
  3. Move the `tk_client_requests_total` count into the `onResponse` hook, counting only requests that passed the rate limit and matched a route (`req.routeOptions.url`).
  4. Apply the same normaliser at `pvp.ts:316,619,633` and `app.ts:262`.
  5. Add a `METRIC_HELP` line for the new metric, and an alert `MetricsSeriesOverflow` in `ops/prometheus/alerts.yml` (the test checks names).
- Tests: in `tests/backend/server/observability.test.ts`, send 2,000 requests through `httpHarness` with random `X-Client-Build`. Assert that the `tk_client_requests_total` series count stays ≤ cap + 1 and that the `/metrics` body stays under a byte bound. Today's code fails this. Also assert `build="1.4.0+ios"` still appears.
- Done when: no metric label anywhere in `server/` takes a raw client string. Series per metric are bounded, and the test proves it.
- Don't break: the version dashboard `ops/grafana/game-versions.json` (`build` and `rules` labels keep their real values); `tests/…/alerts` metric-name check.

### SEC-03: Store builds let a player point the app at any server, a phishing path and a sign-in token relay (earlier R-1)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: backend/net + integration (settings UI is presentation; the decision is a build flag)
- Checklist refs: Checklist account security; Masterclass 6 Trust boundaries; App Review 5.1 (data sent to third parties)
- Evidence:
  - `settingsUi.ts:184` always appends `serverAddressBlock` (`hud.ts:1037-1055`: a free URL field). `Connection.choose` stores it (`connection.ts:535-539`), and `resolveServerUrl` prefers it over the built-in `VITE_SERVER_URL` (`connection.ts:122-126`, `main.ts:267-270`). `normalizeServerUrl` even picks plain `http://` for `10.`/`192.168.` addresses (`httpAdapter.ts:156-161`).
  - Tokens are stored per server address (`httpAdapter.ts:96-110`), so the game token itself does not leak. But a player talked into "use this server for free Jade" sends the following to that server:
    - sign-in credentials: Google ID token, Apple `authorizationCode`;
    - purchase intents;
    - age answers and chat.
  - The Google ID token's `aud` is the official client id (`VITE_GOOGLE_CLIENT_ID`), so the rogue server can replay it to the official `POST /v1/sessions` within its validity and obtain a token for the victim's linked account (`links.ts:265-275`, inferred).
  - The nonce does not stop this. The rogue server can fetch a nonce from the official `/v1/auth/nonce` and hand it to the victim's game, and `SIGNIN_NONCE_REQUIRED` is off by default anyway (`context.ts:51`). The rogue server can also show arbitrary `notice` and moderation text ("Support: send us your code").
- Fix:
  1. Add a build flag `VITE_ALLOW_SERVER_CHOICE`, default unset, and declare it in `vite-env.d.ts`. In `main.ts`, when the flag is off and the build is not a dev build, call `resolveServerUrl` with a `KeyValue` view that ignores `tk.net.server` except `'off'`. Clear a stored custom URL on start (keep `'off'` = play offline).
  2. In `settingsUi.ts:184`, append `serverAddressBlock()` only when `deps.allowServerChoice` (a new `HudDeps` field set in `main.ts` from the flag or `import.meta.env.DEV` or `?sandbox`). Keep the "Play offline" and "Use the built-in setting" buttons visible everywhere.
  3. Never set the flag in `deploy.yml`, `android.yml` or `ios-testflight.yml`. Add an assertion beside the existing `VITE_ALLOW_PREVIEW` check (`tests/backend/verification-client.test.ts`).
  4. Restrict `normalizeServerUrl` to `https://` outside dev builds.
  5. Server side (defence in depth): set `SIGNIN_NONCE_REQUIRED=1` once every supported build sends nonces (`docs/SHIPPING.md` 3h), and add it to the `checkConfig` production warnings.
- Tests: `tests/backend/net/server-choice.test.ts`:
  - with the flag off, `resolveServerUrl(kv{tk.net.server:'https://evil'}, 'https://api')` returns `https://api`;
  - `'off'` still returns `''`.
  - A DOM test in `tests/presentation/dom/` asserts that Settings → Advanced has no `input[type=url]` when `allowServerChoice` is false.
- Done when: a release build (web, Android, iOS) has no way to send any request to a server other than `VITE_SERVER_URL`, and the workflow test enforces the flag.
- Don't break: `npm run dev:lan` and local-server testing (dev builds keep the field); `?sandbox` stays offline; the per-URL token store.

### SEC-04: No rule or detection for late battle reports and tool-assisted deployments (earlier G-1)
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: server (+ backend/net for the outbox order)
- Checklist refs: Checklist anti-cheat; Masterclass 6 Trust boundaries; relates to X1
- Evidence:
  - The seed is sent at Attack (`startAttack`, `pvp.ts:522-535`), and battles are deterministic from seed + deployments (CLAUDE.md Invariant). A started raid is forfeited at the next `match` after `REPORT_GRACE_MS` = 8 min (`pvp.ts:61,338`). If the attacker never calls `match`, the report is accepted until `expiresAt + LATE_REPORT_MS` (1 h + 72 h; `pvp.ts:41,52,466`). That is 73 h to search deployment plans offline with the shipped simulator and report the best (inferred: no probe run).
  - War, raid and duel tickets return the seed at issue (`gangWars.ts:314`, `duels.ts:102`, `groveRaid.ts:218`), which gives up to 1 h of private search.
  - Nothing measures report latency: no metric, and no `startedAt` comparison in `attack()` (`pvp.ts:705-800`). The only related metric is `tk_forfeits_total` (`pvp.ts:590`).
- Fix:
  1. Measure. In `attack()`, `groveRaid` reports and `gangWars` reports, observe `tk_report_latency_ms` = `now - (ticket.startedAt ?? ticket.createdAt)`, with bucketed `kind`. Count `tk_late_reports_total{kind}` when the latency exceeds `REPORT_GRACE_MS`.
  2. Keep a per-player record: a new migration `0043_late_reports.sql` adds `players.late_reports integer not null default 0` and `players.late_report_at bigint not null default 0`. Show them in `admin.detail` (`admin.ts:50-80`).
  3. Rule: a pvp report later than `REPORT_GRACE_MS` after `startedAt` from a player whose `lastSeenAt` moved after `startedAt + REPORT_GRACE_MS` settles as `forfeitTicket`. `lastSeenAt` is updated by `authenticate` with minute granularity (`identity.ts:91-96`); keep the previous value on `Player` for this check. Such a player was online but held the report, which honest games never do once (4) ships.
  4. Game side: in `Connection.runSync`, flush the battle outbox first, before any other authenticated call, on every reconnection (today the guarantee is only `sendReportsBeforeMatch`). Ship this **before** enabling (3) (deploy the server with (3) behind `LATE_REPORT_RULE=1`, default off).
  5. Add an alert `LateReportsRising` (share of late reports > 2% for 1 h). Document in `docs/PROTOCOL.md` (behaviour change, no shape change).
- Tests: `tests/backend/server/late-reports.test.ts`:
  - a report 9 min after start, with another authenticated request in between, is a forfeit when the rule is on (fails today);
  - a report 3 days after start with no request in between still settles (poor connection);
  - the metric is observed.
- Done when: every report kind records its latency, staff can see per-player late counts, and the online-but-holding pattern is forfeited behind a switch, with the game's outbox order shipped first.
- Don't break: R02 (a phone offline for up to 3 days keeps its raid); deploy the server before the game; protocol docs.

### SEC-05: Backdated time-window claims (X1, still open)
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: server
- Checklist refs: 2026-11-20 security audit X1; Checklist economy integrity
- Evidence: `MAX_BACKDATE_MS = 12 * HOUR` (`server/core/village.ts:45`). Earliest command time = `max(row.at, now - MAX_BACKDATE_MS)` (`village.ts:165`, `235`). An idle village takes two daily chests or calendar days across midnight in one session (audit record X1, probe `frozen.probe.ts`). `villages.device_seqs` (migration 0019) keeps only numbers per device.
- Fix:
  1. A new migration `0043`/`0044` adds `villages.device_seen jsonb not null default '{}'` (additive, so the previous server build ignores it).
  2. In the batch path (`village.ts` and `villageReplay.ts` `VillageReplayJob`), set `earliest = max(row.at, now - MAX_BACKDATE_MS, device_seen[batch.device] ?? 0)`, then write `device_seen[device] = now` with the batch (also for a batch where nothing applied, in `recordVillageCommands`).
  3. Game: `VillageSync` sends an empty batch (heartbeat) on every reconnection after flushing the queue, and every 10 min while online. Server: accept empty batches under the existing `commands` rule.
  4. Count `tk_backdated_commands_total{type}` for commands dated more than 10 min before `now`.
  5. Add the rule to `docs/PROTOCOL.md` "Time".
- Tests: `tests/backend/server/x1-backdate.test.ts`:
  - after a heartbeat at 00:05, a `claimDaily` dated 23:50 the day before is clamped to 00:05 (fails today);
  - with no contact since 20:00, a claim at 23:50 the day before is honoured (offline player).
- Done when: the X1 probe cannot take two chests in one session while it keeps contact, and the honest offline case passes.
- Don't break: offline play on poor connections (worldwide target); database changes are new numbered migrations; GLOBAL-009 multi-device numbering.

### SEC-06: Look-alike names in other scripts pass uniqueness (S5 open part)
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: server + gameplay/sim (shared `names.ts`)
- Checklist refs: 2026-11-20 S5; Checklist moderation / impersonation
- Evidence: `nameKey` is `tidyName(name).toLowerCase().normalize('NFC').replace(/[ _-]/g,'_')` (`src/backend/net/names.ts:45-47`). `foldLookalikes` is used only for the reserved-word check (`names.ts:50-60`). "Јоhn" (Cyrillic) and "John" are both claimable. Staff words cover 7 languages (audit record).
- Fix:
  1. Add `nameSkeleton(name)` = `foldLookalikes(nameKey(name))` plus the digit folds of `lookalike()`, exported beside `nameKey`.
  2. A new migration adds `players.name_skeleton text` and a non-unique index (`CONCURRENTLY`, `-- migrate: no-transaction`), plus `name_holds.skeleton`.
  3. `migrateNames` at start backfills it in batches.
  4. `server/core/names.ts` claim and rename refuse when another player or a live hold has the same skeleton (`name.taken` with suggestions).
  5. Existing clashes stay (no forced rename), and `admin.detail` lists them.
  6. Extend the staff and brand words to the remaining ready languages from `languages.json`.
- Tests: `tests/gameplay/social/names.test.ts` "skeleton": "Јоhn" vs "John" share a skeleton. Add a server test where a rename to the Cyrillic look-alike of a taken name is refused (fails today), and where `影村` is still allowed.
- Done when: no two current claims made after the deploy share a skeleton, and staff words cover every ready language.
- Don't break: valid Indic and CJK names (shared validator, `censorText`); `NameTakenError` paths; migrations never edited.

### SEC-07: Staff tools cannot undo a cheater or rescue a taken-over account
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: server
- Checklist refs: Checklist live-ops / support; Masterclass 6 audit trail
- Evidence:
  - Staff routes (`server/routes/staff.ts:17-38`): adjust, ban, reset-rating, reset-age, rename, import-hold release.
  - There is no honor/trophy reset, and no reversal of honor the cheater's raids took from or gave to others.
  - There is no list or revocation of a player's device tokens: `admin.detail` (`admin.ts:50-80`) shows links but not `player_tokens`.
  - There is no suspicious-player view (top honor growth per day, device-held top 100, late reports).
  - Staff reads (`GET /admin/v1/players/:id`) are not written to `staff_actions`; only `audit()` on writes is.
  - Players get no notice of a new-device sign-in (`links.ts:265-275`).
- Fix:
  1. `admin.resetHonor(actor, id, {to, note})`, which also calls `ctx.board.set`.
  2. `admin.revokeSessions(actor, id, {note})`: delete all `player_tokens` except none, plus `token_rotations`; the player must sign in with a link.
  3. `admin.sessions(id)`: provider, device, created and last used, never the hash.
  4. `GET /admin/v1/suspects?days=` from `attacks`: honor gained per day, wins per hour, `late_reports`, device-held flag.
  5. `audit(ctx, actor, 'view', id)` on `admin.player`, rate-limited so it does not flood.
  6. On `signIn` from a new device, `notify(ctx, playerId, 'account', [msg('account.new_device', {provider})])` (add the code to `messages.json`).
  7. Add the new routes to `adminPage.ts`.
- Tests: `tests/backend/server/admin.test.ts`: revoke-sessions makes the old token `401` and writes a staff action; reset-honor moves the board; a view writes a `view` action; a sign-in from a new device creates an `account` notice.
- Done when: support can, from `/admin`, see and kill every session of a player, reset honor, and find the top honor gainers, and every look is logged.
- Don't break: "Every staff action must go through `audit()`"; `ADMIN_ALLOW_IPS`; account deletion clears the new rows (none added).

### SEC-08: Load test has no 10× target and skips the server-held traffic that dominates at launch
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: server / ops
- Checklist refs: Checklist server readiness (load, capacity)
- Evidence:
  - `server/load.ts:14-17` targets 5× peak = ~14 battles/s, with match + attack only. With every village server-held (`keepVillageOnServer: true`, and SEC-01), the main traffic is `POST /v1/village/commands` (30/min/player, battle replays in the worker pool, `village.ts:235`), `/v1/hello`, notices and chat. None of these is generated.
  - Last measured: 3 battles/s per instance on the main thread, 7.96/s with 3 workers on 4 cores (`PVP_ROADMAP.md:327,342`). No staging run with Postgres and Redis is recorded.
- Fix:
  1. Add `--mix` to `server/loadMain.ts` and `load.ts`: per virtual player, a session of hello → village commands (from a recorded `PLAYER_COMMANDS` script built with `src/gameplay/sim`) → match/start/attack → notices. Weights come from `tk_http_requests_total` once live.
  2. Write the targets down in `docs/SHIPPING.md` 3h: 10× peak = ~28 battles/s plus N command batches/s. Pass criteria: p95 < 1 s for commands, p95 < 3 s for attack, 0 5xx, `tk_resim_busy_total` = 0.
  3. Record a staging run (instances, cores, Postgres size) in `PVP_ROADMAP.md` step 46.
- Tests: extend `tests/backend/server/load.test.ts` so `--mix` runs against `inProcess` for 2 s with no errors and reports every route.
- Done when: a recorded staging run meets the written 10× criteria with the realistic mix.
- Don't break: never point the load test at production (`load.ts` header); `RATE_LIMITS` overrides only on staging.

### SEC-09: Autoscaling, spend alerts, PITR and one-command rollback are not set up
- Severity: MEDIUM
- Status: OWNER
- Kind: OWNER
- Compartment: ops
- Checklist refs: Checklist server readiness (scaling, cost, recovery, rollback)
- Evidence:
  - `ops/` holds only `prometheus/alerts.yml` and `grafana/game-versions.json`. There is no host config, autoscaling policy or billing alert.
  - Backups are a daily GitHub-artifact dump (`backup.yml:17`), with PITR an owner step (`SHIPPING.md` 3h "Size").
  - Production deploys run by hand through `workflow_dispatch` (`server.yml:148-173`). No rollback procedure is documented.
  - Missing alerts: `tk_resim_busy_total` rate, process memory, database size and connections, push failures.
- Fix:
  1. Owner: choose a host with autoscaling on CPU/event-loop delay, min 2 and a max cap; set billing/budget alerts at 50/80/100% of a monthly cap; switch on PITR (≥ 7 days).
  2. Code/docs: add `docs/SHIPPING.md` 3g "Rollback": run `server.yml` by hand with `target=production` on the previous `v*` tag. Migrations are additive, so the older image runs on the newer schema. Switch `VILLAGE_PARTS` off before rolling below its build.
  3. Add alerts `ResimBusy` (`rate(tk_resim_busy_total[5m]) > 0.1`), `ProcessMemoryHigh` (`process_resident_memory_bytes` if exported, else add a gauge) and `LateReportsRising` (SEC-04).
- Tests: the existing alerts metric-name test (`ops/prometheus/alerts.yml` checker) must pass with the new rules.
- Done when: the owner checklist shows autoscaling, budget alerts and PITR enabled, and a rollback has been rehearsed on staging and recorded.
- Don't break: deploy the server before the game; migrations backward-compatible with the previous build.

### SEC-10: No Content-Security-Policy on the web game (F2, still open)
- Severity: LOW
- Status: FAIL
- Kind: CODE
- Compartment: integration (vite build) + backend/pwa
- Checklist refs: 2026-11-20 F2; Masterclass 6 client hardening
- Evidence: `index.html` has no CSP and has inline scripts at `:13`, `:63` and the inlined `boot.js` (`vite.config.ts` `bootGuard`). The sign-in token sits in `localStorage` (`httpAdapter.ts:96-110`). GitHub Pages cannot send headers, so a `<meta http-equiv>` is the only option (`frame-ancestors` is not supported there).
- Fix:
  1. Add a Vite plugin `cspMeta()` in `vite.config.ts` that hashes every inline script after `bootGuard` runs and writes `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-…' https://accounts.google.com/gsi/client https://appleid.cdn-apple.com; connect-src 'self' ${VITE_SERVER_URL} https://*.ingest.sentry.io https://oauth2.googleapis.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-src https://accounts.google.com https://appleid.apple.com; base-uri 'none'; object-src 'none'">`.
  2. Skip it in dev. Build the origins from env.
  3. Device check: native WebViews load `capacitor://localhost` / `https://localhost`, so check that the same meta does not block them.
- Tests: `tests/backend/release-config.test.ts`: the built `dist/index.html` contains a CSP whose script hashes match every inline script.
- Done when: the deployed web game has a CSP that `tools/release/check-published-game.mjs` verifies, and sign-in works on web, iOS and Android.
- Don't break: the boot guard (ES5 inline), Google/Apple sign-in, Sentry envelopes, the service worker.

### SEC-11: iOS sign-in token likely in device backups (F3, still open)
- Severity: LOW
- Status: NEEDS-DEVICE
- Kind: CODE + DEVICE
- Compartment: backend/platform
- Checklist refs: 2026-11-20 F3; Checklist token storage
- Evidence:
  - The token is in WebView `localStorage` (`httpAdapter.ts:96-110`). On iOS this sits under the app's Library/WebKit, which iCloud/iTunes backup includes by default (inferred; not checked on a device).
  - There is no Keychain code in `ios/App/App/*.swift`.
  - Android excludes it (`android/app/src/main/res/xml/data_extraction_rules.xml`, `backup_rules.xml`).
- Fix:
  1. Add a small `TkSecureStore` Capacitor plugin (`get`, `set`, `remove`) using Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, registered in `TkViewController.swift`.
  2. Add `secureTokenStore(serverUrl)` in `src/backend/platform/` implementing `TokenStore` and used by `HttpServerAdapter` on iOS.
  3. On first start, migrate the old localStorage value and delete it.
  4. Extend `release-config.test.ts` to check the registration.
- Tests: a unit test of the migration (localStorage → secure store, key removed) with a fake plugin. Device: restore an iCloud backup to a second iPhone and check that the game is not signed in.
- Done when: a restored iOS backup carries no session token (device evidence recorded).
- Don't break: `storedAccounts`, token rotation's `nextTokens`, offline play.

### SEC-12: Sandbox credit cap off by default in production (P4, still open)
- Severity: LOW
- Status: OWNER
- Kind: OWNER + CODE
- Compartment: server
- Checklist refs: 2026-11-20 P4
- Evidence: `DEFAULT_POLICY.sandboxDailyCapUsd: null` (`server/core/context.ts:55`). The per-buyer cap groups by client-sent device ids (`config.ts:234-235`). `checkConfig` says nothing (`config.ts:160-205`).
- Fix:
  1. In `checkConfig`, production adds an error when `APPLE_BUNDLE_IDS` or `GOOGLE_PLAY_PACKAGE` is set and `SANDBOX_CREDIT_DAILY_CAP_USD` is unset (allow an explicit `0` = no sandbox credit).
  2. Owner: set it (e.g. 50) in production.
- Tests: in `tests/backend/server/deployable.test.ts`, production with Apple configured and no cap gives a `checkConfig` error.
- Done when: production cannot start with store checks and no sandbox daily cap.
- Don't break: App Review's sandbox purchases against production (a cap > 0 keeps them working).

### SEC-13: Friend, Gang and Alliance size caps checked outside a transaction (L1, still open)
- Severity: LOW
- Status: FAIL
- Kind: CODE
- Compartment: server
- Checklist refs: 2026-11-20 L1
- Evidence: `friends.ts:202-203` counts, then opens `transaction` at `:204`. `squads.ts:121` counts members before the join transaction. `groves.ts:95` does the same.
- Fix: move each count inside `ctx.repo.transaction` after `lockPlayers(tx, ['grove:'+id])`, `['squad:'+id]`, or both players' ids for friends (the pattern `war-side:` already exists). Re-read the count under the lock.
- Tests: `tests/backend/server/l1-caps.test.ts` (Postgres via `TEST_DATABASE_URL`): 10 parallel joins into a Gang with one free seat; exactly one succeeds.
- Done when: the parallel test passes on Postgres.
- Don't break: lock ordering (sorted ids in `lockPlayers`) to avoid deadlocks.

### SEC-14: Deletion leaves a deleted player's name and id in shared rows until retention
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: server
- Checklist refs: Privacy invariant "account deletion clears every player-owned table"
- Evidence:
  - `deletePlayer` (`pg/players.ts:172-276`) nulls `tickets.defender_id` (`:191`) but leaves the stored base. `uploadBase` writes `base.name = me.name` (`pvp.ts:282`), and the base lives in `base_versions`, referenced by other attackers' tickets (retention: 30 days).
  - `squad_war_attacks.attacker_id` and `squad_war_relays.last_by`/`holder` keep the raw player id. No statement touches them.
  - The memory adapter was not compared (inferred parity).
- Fix: in `deletePlayer`, rewrite the bases of open tickets naming the player:
  1. find `tickets where defender_id = $1` before nulling;
  2. store a renamed copy (`name = DELETED_PLAYER.name`) through the `base_versions` upsert and repoint `base_hash`;
  3. `update squad_war_attacks set attacker_id = $2 where attacker_id = $1` and the same for relays.
  
  Mirror it in `stores/memory/players.ts`.
- Tests: `tests/backend/server/repo.test.ts` "deletion": after deleting a defender with an open ticket on them, no `base_versions` row referenced by a ticket contains their name, and no squad-war row contains their id (both adapters).
- Done when: a full-text search of the database for a deleted player's name or id finds only `purchases` (kept, unlinked), `staff_actions` and `deletion_requests` (legal records).
- Don't break: war scores (bases stay, only names change); `contentHash` dedup.

### SEC-15: Account creation limited only per IPv4 / IPv6 /64 (possible earlier S-3)
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: server
- Checklist refs: Checklist alt-account abuse
- Evidence: `register: 300/h` keyed by `ipKey` (IPv6 /64) (`rateLimit.ts:77`, `app.ts:325,348`). One /48 holds 65,536 /64s, so free anonymous accounts are effectively unlimited from one IPv6 host. Alts feed referrals (adult and server-held gates help), honor (capped at 40 per attacker and day, `pvp.ts:703`) and war rosters.
- Fix: add a second rule `registerWide: 3000/h` keyed by IPv6 /48 (`ipKey48`) in `DEFAULT_RATE_LIMITS`, checked in the register route together with `register`. Expose `tk_rate_limited_total{rule="registerWide"}`.
- Tests: in `security-audit` style, 400 registrations from different /64s in one /48 hit the wide rule.
- Done when: registrations from one /48 are bounded.
- Don't break: carrier-grade NAT users (IPv4 stays loose); `RATE_LIMIT_INSTANCES` division.

### SEC-16: Certificate pinning decision not recorded
- Severity: LOW
- Status: OWNER
- Kind: DOCS
- Compartment: backend/platform
- Checklist refs: Checklist transport
- Evidence: no pinning in `android/` (no `network_security_config`) or `ios/` (no ATS pin keys in `Info.plist`). No decision in `docs/DECISIONS.md`.
- Fix: record in `docs/DECISIONS.md` "Transport": no certificate pinning, because the host rotates certificates, a pin would brick old app builds, and the server is the authority anyway (a MITM'd client can only cheat itself). Rely on TLS, HSTS (`app.ts:249-250`) and platform ATS. Revisit if a payment path ever trusts the client. Optionally add HSTS `includeSubDomains; preload` for the API domain (owner).
- Tests: none (docs).
- Done when: the decision is in `DECISIONS.md`.
- Don't break: n/a.

### SEC-17: Production config check misses several security switches (possible earlier S-4)
- Severity: LOW
- Status: PARTIAL
- Kind: CODE
- Compartment: server
- Checklist refs: Checklist deployment safety
- Evidence: `checkConfig` (`config.ts:160-205`) warns about Sentry and metrics. It is silent on:
  - `SIGNIN_NONCE_REQUIRED` (off by default, `context.ts:51`);
  - `REDIS_URL` set without `RATE_LIMIT_INSTANCES`;
  - `REQUIRE_SERVER_VILLAGE` (SEC-01);
  - `SANDBOX_CREDIT_DAILY_CAP_USD` (SEC-12).
- Fix: add production warnings for each (an error for SEC-12). Print the effective `ServerPolicy` at boot (without secrets).
- Tests: `deployable.test.ts`: each missing switch yields its warning.
- Done when: a production boot log names every security switch's value.
- Don't break: staging and dev boots (warnings only in production).

## 3. Verified sound

- **Replays of old reports:** `takeTicket` returns the stored answer for a used ticket and refuses voided, lapsed, burned or forfeited ones (`server/core/pvp.ts:452-468`). A ticket with `MAX_TICKET_FAILURES` takes no more (`:464`). A seeded raid must be started first (`:711`, S2 holds).
- **Server-issued seeds:** `battleSeed` refuses a foreign seed (`pvp.ts:686-693`).
- **Command batches:** a repeated `seq` is refused and `PLAYER_COMMANDS` is checked per command (C1; `src/backend/CLAUDE.md` "Security audit 2026-11-20").
- **Server-held villages:** troops are required and consumed, and loot is banked in the same transaction (`pvp.ts:477-489`, `796-800`). A device donor cannot fill a server-held receiver (`server/core/groves.ts:231`). Uploaded-base loot is capped (`pvp.ts:255-265`, `788-795`).
- **Per-server token storage:** a token is never sent to another address (`src/backend/net/httpAdapter.ts:96-110`). Android backup excludes localStorage (`android/app/src/main/res/xml/data_extraction_rules.xml`).
- **No private secrets in client artifacts.** The Sentry DSN, Google client id, Apple services id and balance public key are public by design (`.github/workflows/deploy.yml:47-59`, `android.yml:46-61`). `public/legal-config.js` holds only empty publisher fields.
- **Rate limits degrade, not open:** Redis down → `MemoryRateLimiter` per instance, divided by `RATE_LIMIT_INSTANCES` (`server/shared.ts:283-319`). The leaderboard falls back to the database (`shared.ts:86-171`).
- **Generated opponents labelled:** `kind: 'bot'` when there is no defender id (`pvp.ts:442`, `384`).
- **Graceful shutdown:** `server/shutdown.ts`. **Production config refusals:** database, staff tokens, `TRUST_PROXY`, CORS, TLS, short metrics token (`server/config.ts:164-188`).
- **Backups:** daily encrypted dump plus a weekly restore drill that starts the server (`.github/workflows/backup.yml:17,76-84`).
- **Staged deploy:** staging gets automatic deploys and contract tests with the previous release's client; production needs a manual dispatch behind environment reviewers (`.github/workflows/server.yml:114-173`).
- **Server pages have strict CSPs** (`server/adminPage.ts:12`, `accountPage.ts:73`, `complaintPage.ts:64`).
- **Ban removes from the board and notifies with the appeal route** (`server/core/admin.ts:156-171`). Banned players are skipped by ranking queries (`src/backend/CLAUDE.md` Operations).
- **Deletion covers 40 tables in one transaction** (`server/stores/pg/players.ts:172-276`), and `player_notices`, `deletion_codes` and `village_parts` cascade (migrations 0024, 0039). Purchases are kept unlinked as financial records.

Not run: any test (no `node_modules`), Postgres and Redis adapters, multi-instance, devices, store sandboxes. Passing reads here do not establish release readiness.
