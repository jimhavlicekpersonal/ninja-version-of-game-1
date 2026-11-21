# Beast Mode 2026-11-21: progress ledger

Source: `docs/prompts/BEAST_MODE_2026-11-21.md` (text of the PDF; audited commit 560ce7a). One row per work item.
Status values: open, done, skipped-not-reproduced, reverted-with-numbers, blocked-owner, blocked-device, partial.
OWNER, DEVICE and NEEDS-PLAYERS items are never closed from code.

## Phase 0 baseline

Run on 560ce7a in a clean worktree, 2026-11-21 (container, Node from the image):

- `npm test`: 262 files passed, 1 skipped; 2348 tests passed, 19 skipped.
- `npm run lint`: clean. `npm run build`: ok (index 561.83 kB / 183.88 kB gzip, phaser 660.58 kB / 175.47 kB, defineProperty 356.33 kB / 115.07 kB, keep 193.07 kB, communityRules 156.34 kB).
- `npm run typecheck:server`: ok. `npm run server:build`: ok (main.js 17,155.87 kB).
- Not available here: `TEST_DATABASE_URL`, `TEST_REDIS_URL` (Postgres and Redis tests skipped), devices, store sandboxes.

Owner decisions D1-D8 (section 2.9) are not recorded in `docs/DECISIONS.md` yet. Items that need one are implemented only behind a switch with the conservative default, or left `blocked-owner`.

New player-visible strings are translated into all 49 other ready languages in the same commit (machine-written by the coding session, not native-reviewed: worksheet `REVIEW.json` entries are not added).

## Items

| ID | Sev | Phase | Kind | Status | Commit | Test | Notes and limits |
|---|---|---|---|---|---|---|---|
| ECO-01 | HIGH | 1 | CODE | done | 86d7e52 | tests/backend/server/beast-mode-2026-11-21-money.test.ts (ECO-01), tests/presentation/dom/purchase-guard.dom.test.ts | Server: one open intent per offer/Scroll/Stipend (memory + pg openIntentsFor, no migration); redeem refuses a duplicate Scroll / once-per-account offer for a server village (409 already_owned, unfinished for support refund; D4 open). Client: EconomyUi buying flag disables every buy button; controller single-flight IN_PROGRESS. Android TkBillingPlugin claim/release synchronized (not compiled here). Limits: Ask-to-Buy double approval and real store sheets not run on devices; device-held duplicate Scroll receipts still granted by the device (intent rule prevents the second charge). |
| ECO-02 | MEDIUM | 1 | CODE | done | 74e26d5 | tests/backend/server/purchases.test.ts 'ECO-02: …' (4 tests; the honest lost-answer test still passes) | Google consumed token → already, no grant. Apple known row → no grant into a server village started after the credit; 409 needs_support + import hold for staff. Import: not-carried credited rows granted at import when credited after the file's savedAt, else held for staff; rows marked held_on_server (Repo.markPurchaseHeld, existing column, no migration). Limits: a device clock set back before the purchase can make a stripped file look older (bounded: then the purchase is granted once and the row is held, so no second replay); Postgres path not run here. |
| ECO-03 | MEDIUM | 7 | DESIGN | open | | | |
| ECO-04 | MEDIUM | 7 | DESIGN | open | | | |
| ECO-05 | HIGH | Owner/device | DEVICE | open | | | |
| ECO-06 | LOW | 1 | OWNER | partial | eaa09de | tests/backend/server/purchases.test.ts 'ECO-06: …' | Code: Google purchaseType 1 → environment 'Promo', 0 counted cents, outside the sandbox cap; quantity > 1 logged + tk_refused_total{multi_quantity} (one unit delivered); checkConfig warns in production when App Store is on and USD_RATES has only USD; SHIPPING 3b: never enable multi-quantity. Open (OWNER, D6): set USD_RATES monthly or decide on local-money counting. |
| ECO-07 | LOW | 2 | OWNER | partial | 1691f6b | same as SEC-12 | Folded into SEC-12 (same commit). Owner sets the cap. |
| ECO-08 | LOW | 1 | DESIGN | done | 6bb5d8c | tests/presentation/dom/keep-rush.dom.test.ts | The Keep's Jade 'Finish now' and resource top-up confirms carry keep.armyBehind (existing text) as a note under the spend when armyBehindKeep (no hard gate; no real-money figure). spendMoonstones(…, note?). |
| ECO-09 | LOW | 1 | CODE | partial | 634a3c2, 1300e6b | tests/backend/server/purchases.test.ts 'ECO-09: …' | Code done: certificate dates checked at payload.signedDate (bounded: ≤ now+5 min, ≥ now−3 years), else now; chain/OID/P-256 checks unchanged. Open (DEVICE): whether StoreKit re-signs jwsRepresentation for Transaction.unfinished was not checked on a device. |
| ECO-10 | LOW | 1 | CODE | done | a290b96 | tests/presentation/dom/store-prices.dom.test.ts | loadPrices skips retired offers (offer_rebuild); one ask per session once complete. |
| GT-01 | HIGH | 2 | DESIGN | blocked-owner |  | — | Needs owner decision D2 (should a lost defense cost honor; should generated-base wins earn honor). Every fix step changes the honor economy that feeds matchmaking (campaign gates, rating-convergence). SEC-01's REQUIRE_SERVER_VILLAGE closes the device-village half of the collusion path; the per-pair cap and generated-base share wait for D2. |
| GT-02 | HIGH | 7 | TOOLING | open | | | |
| GT-03 | HIGH | 7 | DESIGN | open | | | |
| GT-04 | HIGH | 7 | DESIGN | open | | | |
| GT-05 | HIGH | 7 | DESIGN | open | | | |
| GT-06 | HIGH | 7 | DESIGN | open | | | |
| GT-07 | MEDIUM | 7 | DESIGN | open | | | |
| GT-08 | MEDIUM | 7 | TOOLING | open | | | |
| GT-09 | MEDIUM | 7 | DESIGN | open | | | |
| GT-10 | MEDIUM | 7 | DESIGN | open | | | |
| GT-11 | MEDIUM | 7 | TOOLING | open | | | |
| GT-12 | MEDIUM | 7 | DESIGN | open | | | |
| GT-13 | LOW | 7 | DESIGN | open | | | |
| GT-14 | LOW | 7 | TOOLING | open | | | |
| GT-15 | LOW | 7 | DESIGN | open | | | |
| GT-16 | LOW | 7 | DESIGN | open | | | |
| GT-17 | LOW | 7 | DESIGN | open | | | |
| OPS-01 | HIGH | 5 | CODE | open | | | |
| OPS-02 | HIGH | 4 | CODE | open | | | |
| OPS-03 | HIGH | 4 | CODE | open | | | |
| OPS-04 | MEDIUM | 5 | CODE | open | | | |
| OPS-05 | MEDIUM | 5 | CODE | open | | | |
| OPS-06 | MEDIUM | 4 | CODE | open | | | |
| OPS-07 | MEDIUM | 4 | DOCS | open | | | |
| OPS-08 | MEDIUM | 4 | DOCS | open | | | |
| OPS-09 | MEDIUM | 5 | CODE | open | | | |
| OPS-10 | MEDIUM | 5 | CODE | open | | | |
| OPS-11 | MEDIUM | 8 | DOCS | open | | | |
| OPS-12 | LOW | 5 | CODE | open | | | |
| OPS-13 | LOW | 5 | DOCS | open | | | |
| OPS-14 | LOW | 6 | CODE | open | | | |
| SAV-01 | HIGH | 3 | CODE | open | | | |
| SAV-02 | MEDIUM | 3 | CODE | open | | | |
| SAV-03 | MEDIUM | 3 | CODE | open | | | |
| SAV-04 | MEDIUM | 3 | CODE | open | | | |
| SAV-05 | MEDIUM | 3 | CODE | open | | | |
| SAV-06 | MEDIUM | 3 | CODE | open | | | |
| SAV-07 | MEDIUM | 3 | CODE | open | | | |
| SAV-08 | MEDIUM | 5 | CODE | open | | | |
| SAV-09 | MEDIUM | 3 | CODE | open | | | |
| SAV-10 | LOW | 3 | CODE | open | | | |
| SAV-11 | LOW | 3 | CODE | open | | | |
| SAV-12 | LOW | 2 | DESIGN | blocked-owner |  | — | Owner decision D1 (keep the 12 h idle backdate for offline play, or require per-device last-contact evidence) not recorded. The SEC-05 design (villages.device_seen + client heartbeats) is ready to build once D1 says so. |
| SAV-13 | LOW | 3 | CODE | open | | | |
| SAV-14 | LOW | 3 | CODE | open | | | |
| SAV-15 | LOW | Owner/device | OWNER | open | | | |
| SAV-16 | LOW | Owner/device | DEVICE | open | | | |
| SEC-01 | BLOCKER | 2 | CODE | partial | 90ba19e | tests/backend/server/require-server-village.test.ts (a) policy-on refusals, (b) held-only boards (memory; repo + leaderboard route), (c) Keep 15 upload by a 1-day-old account refused, (d) device reroll budget | Done: policy requireServerVillage (REQUIRE_SERVER_VILLAGE, production warns while unset); requireHeldVillage on upload, match, start, attack, Alliance War ticket/report/claim, Gang War queue/ticket/report/claim, duel ticket/report, troop requests, donations; BoardFilter.heldOnly in both adapters + Redis read drop + rebuildFilter; findOpponents heldOnly. Interim (policy off): upload account-age rule (UPLOAD_ACCOUNT_AGE, default on) and +1 Keep per upload; deviceRerolls 12/10 min. Open: per-day honor-gain ceiling for device villages (needs a stored daily gain: a migration), the move-refusal reason in /admin/v1/players/:id (not stored server-side), Postgres run of (b) (no TEST_DATABASE_URL), owner decision D8 (when to switch on). |
| SEC-02 | HIGH | 2 | CODE | done | fc98132 | tests/backend/server/metrics-labels.test.ts (2,000 random builds → ≤ 3 series, body < 200 kB; overflow cap; normalisers) | PromMetrics caps every metric at MAX_SERIES_PER_METRIC (500) label sets, then {overflow="1"} + tk_metrics_series_dropped_total{metric}; buildLabel/rulesLabel normalise client headers and report rules (app.ts, pvp.ts); tk_client_requests_total moved to onResponse for matched routes that were not rate limited; alert MetricsSeriesOverflow. Limit: 'at or below the newest known build' not checked (no server-side list of builds; the shape regex and the cap bound it). |
| SEC-03 | HIGH | 1 | CODE | done | 344fd42 | tests/backend/net/server-choice.test.ts, tests/presentation/dom/server-choice.dom.test.ts | resolveServerUrl(kv, builtIn, allowChoice): off ignores tk.net.server except 'off' and needs https; serverChoiceAllowed(dev or VITE_ALLOW_SERVER_CHOICE=1); a stored custom address is forgotten at start; the Settings field only with HudDeps.allowServerChoice; no workflow sets the flag (test). checkConfig warns in production while SIGNIN_NONCE_REQUIRED is not 1 (the switch itself is an owner step). Limits: not run on a device build. |
| SEC-04 | MEDIUM | 2 | CODE | done | 032df07 | tests/backend/server/late-reports.test.ts (forfeit with the rule on while online; settles with it off; 3-day offline report settles; latency observed) | Latency histogram + late counter by kind for every report (takeTicket); per-player late_reports/late_report_at and online_since (migration 0043, new numbered file); rule behind LATE_REPORT_RULE (policy lateReportRule, default off): late pvp report + an uninterrupted online session since before startedAt+grace → forfeitTicket. 'Online' is a session of requests ≤ 5 min apart instead of the suggested previous-lastSeenAt check, because an honest reconnect sends its village actions (authenticated) before the report. Client: outbox flushed before defenses/donations/chests and before me() on every sync. Alert LateReportsRising. Limits: a cheater who makes no request while holding the report is not caught (same as the item's rule); Postgres columns untested here; war/raid/duel tickets carry their seed at issue (up to 1 h of private search) unchanged. |
| SEC-05 | MEDIUM | 2 | CODE | blocked-owner |  | — | Folded into SAV-12; waits on owner decision D1. |
| SEC-06 | MEDIUM | 2 | CODE | partial | 4c4e193 | tests/backend/server/name-skeleton.test.ts (skeleton unit; a wholly Cyrillic look-alike rename refused, fails before; an Indic name allowed) | nameSkeleton/skeletonOfKey (names.ts): look-alike + digit folds only for names wholly in Latin look-alike scripts (the folds drop combining marks, which Indic vowel signs are); players.name_skeleton + non-unique index (migration 0044, concurrently, no-transaction); kept in step with name_key on create/update; backfilled at start (migrateNames); nameFree refuses another player's skeleton. Open: name holds by skeleton (a released name's look-alike is not held), admin listing of pre-existing clashes, staff/brand words in the remaining ready languages; Postgres path untested here. Note: digit folds also make 'Sam1' and 'Sami' clash (as the item specifies). |
| SEC-07 | MEDIUM | 2 | CODE | partial | 1cd7170 | tests/backend/server/admin-sessions.test.ts (revoke → 401 + staff action; sessions without hashes; reset-honor moves the board, only down; views logged once an hour; suspects logged) | Staff: GET /admin/v1/players/:id/sessions (Repo.sessionsOf), POST …/revoke-sessions (Repo.revokeAllTokens: devices, first token, rotations), POST …/reset-honor (down only, board moved), GET /admin/v1/suspects?days= (honor gained from recorded raids, wins per active hour, late reports, village kind; Repo.attacksBy); staff reads of a player logged ('view', once per staff member, player and hour); /admin page buttons. Open: the player notice on a sign-in from a new device (step 6, needs a translated notice code); reversing honor that a cheater's raids took from others (not built). |
| SEC-08 | MEDIUM | 5 | CODE | open | | | |
| SEC-09 | MEDIUM | 5 | OWNER | open | | | |
| SEC-10 | LOW | 2 | CODE | partial | 812893a | tests/backend/csp.test.ts; built dist served by vite preview in Chromium 390×844: no CSP violation, game started, stylesheet switched to all | vite.config.ts cspMeta (post, build only) writes a CSP meta from tools/release/csp.mjs: SHA-256 of every inline script, 'self', VITE_SERVER_URL and VITE_SENTRY_DSN origins, Google/Apple sign-in hosts; object-src/base-uri none. The stylesheet's inline onload became a hashed inline script. check-published-game.mjs verifies the deployed page's CSP covers its inline scripts. Open (DEVICE): Google and Apple sign-in on the web and the Capacitor WebViews (capacitor://localhost) were not exercised; frame-ancestors cannot be set from a meta tag. |
| SEC-11 | LOW | Owner/device | CODE | open | | | |
| SEC-12 | LOW | 2 | OWNER | partial | 1691f6b | tests/backend/server/beast-mode-2026-11-21-config.test.ts SEC-12 | Code: production checkConfig errors when store checks are configured and SANDBOX_CREDIT_DAILY_CAP_USD is unset (explicit 0 allowed); SHIPPING 3h updated. Open (OWNER): set the value in production. |
| SEC-13 | LOW | 2 | CODE | partial | 6bccefe | tests/backend/server/l1-caps.test.ts (memory; fails before the fix: 10 parallel joins overfilled; the Postgres variant runs with TEST_DATABASE_URL, not run here) | Alliance join, Gang join and friendship cap re-counted inside the transaction under tx.lockPlayer('grove:'/'squad:' id, or both player ids sorted). Done-when needs the Postgres run (not available here). |
| SEC-14 | LOW | 2 | CODE | partial | 2892ade | tests/backend/server/deletion-shared-rows.test.ts (memory; fails before; Postgres variant needs TEST_DATABASE_URL) | deletePlayer (pg + memory): open tickets on the player point at a renamed copy of their base (own base version), defender_name → deleted name; squad_war_attacks.attacker_id → deleted id; relays last_by → deleted id, holder cleared. Open: the Postgres path is untested here, and a full-text search of a real database was not run. |
| SEC-15 | LOW | 2 | CODE | done | 8d4bcc0 | tests/backend/server/register-wide.test.ts | Rule registerWide (3000/h) keyed by IPv6 /48 (ipKey48), checked with register on IPv6 only (IPv4 stays per address for carrier NAT); tk_rate_limited_total{rule=registerWide} through tooMany; shareOf divides it like every rule. |
| SEC-16 | LOW | 2 | DOCS | done | f40a629 | — (docs) | docs/DECISIONS.md 'Transport': no certificate pinning, with the reasons and the revisit trigger. The owner may still overrule (D5); recorded as the default. |
| SEC-17 | LOW | 2 | CODE | done | 0488ba4 | tests/backend/server/beast-mode-2026-11-21-config.test.ts SEC-17 | Production warnings: SIGNIN_NONCE_REQUIRED (SEC-03 commit), REQUIRE_SERVER_VILLAGE (SEC-01 commit), REDIS_URL without RATE_LIMIT_INSTANCES (here), SANDBOX_CREDIT_DAILY_CAP_USD (error, SEC-12). Boot logs 'security switches {…}' (securitySwitches: values only, no secrets/URLs). |
| STB-01 | HIGH | 4 | CODE | open | | | |
| STB-02 | HIGH | 4 | CODE | open | | | |
| STB-03 | HIGH | 4 | CODE | open | | | |
| STB-04 | HIGH | 4 | CODE | open | | | |
| STB-05 | MEDIUM | 4 | CODE | open | | | |
| STB-06 | MEDIUM | 4 | CODE | open | | | |
| STB-07 | MEDIUM | 6 | CODE | open | | | |
| STB-08 | MEDIUM | 6 | CODE | open | | | |
| STB-09 | LOW | 6 | CODE | open | | | |
| STB-10 | LOW | 6 | CODE | open | | | |
| STB-11 | HIGH | Owner/device | DEVICE | open | | | |
| STB-12 | MEDIUM | Owner/device | OWNER | open | | | |
| UX-01 | HIGH | 1 | CODE | done | 86d7e52 | tests/presentation/dom/purchase-guard.dom.test.ts | Folded into ECO-01 (same commit). |
| UX-02 | HIGH | 1 | CODE | done | 09fad4e | tools/ui/surfaces.mjs --battle (new card hit test) at 568×320, 640×360, 844×390, 320×568, 390×844 in en and de: every card passes after Speed shows (before: smoke_bomb covered by End battle at all three landscape sizes); tests/presentation/store-compliance.test.ts UX-02 | Short landscape (max-height 480px): live-mode .b-bottom stacks Speed over End battle, 138 px wide (< the cards' 158 px). Remaining (pre-existing, same before the fix): at 568×320 the scripted squad tap finds no ring inside the free area and the camera stays at the entry fit; in de the squad row scrolls by 7 px. Chromium emulation, not a device. |
| UX-03 | HIGH | 1 | CODE | done | 7dd4d99 | tests/presentation/dom/web-back.dom.test.ts; Playwright 360×640 Chromium (store open → Back closes it, game stays; Back again → 'Leave Kagemura?') | src/presentation/ui/webBack.ts: one guard history entry, re-armed after each Back; battle → battleBack, else closeTop, else the Leave confirm (save, then history.go(-2)). Wired in main.ts installBackButton for !isNative(). Limits: battle Back and iOS Safari swipe-back not run in a browser here (unit test only; iOS NEEDS-DEVICE); installed standalone PWA not tested. |
| UX-04 | MEDIUM | 6 | CODE | open | | | |
| UX-05 | MEDIUM | 6 | CODE | open | | | |
| UX-06 | MEDIUM | 6 | CODE | open | | | |
| UX-07 | MEDIUM | 6 | CODE | open | | | |
| UX-08 | MEDIUM | 6 | CODE | open | | | |
| UX-09 | LOW | 1 | CODE | done | fa6cf91 | tests/presentation/dom/army-preset-delete.dom.test.ts | A danger confirm (existing strings: 'Delete saved army {name}', the army's contents, Remove / Cancel) instead of the 5 s undo toast: the toast has no action buttons, and a confirm needs no new text in 49 languages. The preset is found again by name+army when confirmed. |
| UX-10 | LOW | 6 | CODE | open | | | |
| UX-11 | LOW | 6 | DEVICE | open | | | |
