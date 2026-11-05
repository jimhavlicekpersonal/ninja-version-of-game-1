# Backend adversarial audit — Kagemura server (`server/`, `src/backend/`), read-only, 2026-11-05

Scope read in full: `server/app.ts`, `main.ts`, `config.ts`, `rateLimit.ts`, `redis.ts`, `shared.ts`, `observability.ts`, `pgRepo.ts`, all 24 migrations + `migrate.ts`, `core/{identity,account,pvp,village,villageImport,purchases,links,friends,names,moderation,admin,retention,duels,gangWars,squads,groves(partial),groveRaid(partial),age,pushTokens}.ts`, `payments/{apple,google}.ts`, `identity/{verify,appleTokens}.ts`, `push/push.ts`, `resim/*`, client `net/{connection,villageSync,httpAdapter}.ts`, the sim's `battleEnd/settleOnlineAttack/revokePurchase/checkBattleSetup`, workflows, `tools/ops`, `ops/prometheus/alerts.yml`, Dockerfile, test inventory. Ran `tests/backend/server/reaudit-{integrity,hardening}.test.ts` (29/29 pass) and `npm audit --omit=dev` (0 vulns). No Postgres/Redis here, so adapter tests were not run.

Severity scale: Critical = money or whole-population integrity with a trivial exploit; High = real exploit or outage path; Medium = needs conditions or is a scaling/ops gap; Low = hygiene.

---

## A. Findings

### A1 — HIGH — Loss hiding is still free: the "attack commit" is voluntary and `match` voids unstarted tickets without penalty — VERIFIED
- `server/core/pvp.ts:271-279` (`match` voids every open unstarted pvp ticket), `:373-377` (`startAttack` is a separate, client-initiated call), `:399-423` (`forfeitExpired` only punishes tickets with `startedAt`). `src/backend/net/connection.ts:998-1002` sends `start` best-effort only when online.
- Exploit (modified client, or just intercepting the HTTP calls): `GET /v1/match` → receive full base + server seed → run the public sim locally (`runBattle`) with the real seed → if the result is ≥1 star: `POST /v1/attacks/start` + `POST /v1/attacks`; else `GET /v1/match` again (previous ticket voided, no honor loss, defender lock released). Repeat at the `match` limit (30/min). Honor and Attack Rating become monotonic; the Honor and Power leaderboards and `orderByRating` matchmaking are corrupted for everybody.
- The audit row says "partly / documented limitation"; in practice it is no protection at all for the one population that matters (cheaters), and it costs honest players a round trip.
- Fix: make issuance the commitment. Split `match` into (1) opponent summary only (name, Keep, honor, lock taken) and (2) `start` which returns the base and the seed and sets `startedAt` in the same row update; an issued-and-started ticket that is never reported forfeits (already implemented). Optionally charge the scout "Next" fee server-side on void. Add a test: a client that never calls `start` and only reports wins must still lose honor for abandoned tickets.

### A2 — HIGH — Village import accepts any legality-checked progression; repeatable through delete-and-reregister — VERIFIED (exploit SUSPECTED only in magnitude)
- `server/core/villageImport.ts:415-439` (`importProblem`: counts/levels within the Keep, storages, research cap, timers ≤30 d), `:442-482` (once per player, 409 afterwards). Provenance (`:375-409`) holds only Jade > `freeJadeAllowance` and an unpaid pass; buildings, research, resources within storage and a full army at Keep 15 are accepted "as earned".
- Sequence: `POST /v1/players` (new anonymous account, 300/h per IPv4 or IPv6 /64) → `POST /v1/village/import` with a hand-made save v16 at Keep 15, all research at cap, storages full, 16,000 Jade (below the allowance at Keep 15), `flags.sandbox: false` → from now on the server "owns" and trusts it. To redo: `DELETE /v1/me`, register again, import again. Nothing checks account age vs Keep, nor import rate per IP/device.
- Impact: CFO: a $500+ progression for free; competitive: cheated Keep-15 bases flood the Keep-15 pool and the Power leaderboard; a cheater with full research also beats `attackerStrength` matchmaking. Storage: 1 MB body limit × 300 accounts/h/IP.
- Fix: (a) plausibility: minimum wall-clock to reach Keep k from a village start date you record (`players.created_at`, or the first `/v1/hello` seen) given the Jade the server credited; hold anything implausible in `import_holds`-style review instead of adopting it; (b) rate-limit `villageImport`/`startVillage` per IP and per device id; (c) cap Keep for imports from accounts younger than N days; (d) never let `DELETE /v1/me` + re-register from the same device/IP re-import within 30 days (device fingerprint from `CommandBatch.device` / the import body).

### A3 — HIGH — Battle commands run a full battle on the main thread inside a row-locked transaction: cheap CPU DoS — VERIFIED code path, SUSPECTED scale
- `server/core/village.ts:174-259`: `applyCommands` holds `select … for update` on `villages` and runs `applyCommand` for `BATTLE_COMMANDS` (`trialEnd`, `bountyEnd`, `rematchEnd`; `sim/village.ts:1520+` calls `runBattle` on the request thread). Cap: 3 per batch, 6/min per player (`BATTLE_COMMANDS_PER_MINUTE`), but per player, and players are free (300 registrations/h/IP, more with several /64s).
- Arithmetic: 200 accounts × 6 battles/min × ~0.45 s (Keep 8–15 fortress) = 540 CPU-s per minute on one event loop → the API instance is 100 % blocked; each blocked request also pins one of 10 pool connections. The worker pool does not help: these battles are not routed through `ctx.resim`.
- Fix: a per-instance semaphore/queue for battle commands (e.g. at most 2 in flight, others 503 busy), or precompute the battle in the worker pool before taking the row lock (the sim already supports a `known` result for `battleEnd`; add the same hook for `trialEnd`/`bountyEnd`/`rematchEnd`), plus a global per-minute budget. Add the EventLoopBlocked alert threshold test to the load script.

### A4 — HIGH — The under-18 spending cap is enforced only when the client attaches the intent; intent-less receipts are credited — VERIFIED
- `server/core/purchases.ts:203-207`: the intent is looked up only if the receipt carries `appAccountToken`/`obfuscatedExternalAccountId`; `:219-248` credits regardless; no cap re-check at redeem.
- Sequence (modified client or a StoreKit call without `appAccountToken`): skip `POST /v1/purchases/intent`, buy in the store, `POST /v1/purchases` → credited for a player the server knows is under 18 and already at the cap.
- Impact: the compliance claim in `WORLDWIDE_AUDIT.md` (GLOBAL-004 "across devices before the store is asked") is true only for honest clients; regulators judge the server rule.
- Fix: for a player whose kept age group is under 18, refuse redeem without a matching intent (credit nothing, tell the player to refund with the store) or credit but write a `spending_cap_breach` notice + alert; re-check `spentCents` at redeem and hold the excess as a held grant (like `import_holds`), never silently exceed.

### A5 — HIGH (money) — Refund take-back only creates debt for Jade; other resources floor at zero; refund pause is per free account — VERIFIED code, abuse SUSPECTED
- `src/gameplay/sim/village.ts:913-927` (`revokePurchase`): `moonstones` can go negative, every other resource `Math.max(0, …)`. Offers (`offer_*`, Artisan's Bundle, Keep-scaled `productGrantsFor`) deliver coins/rice/nightsap that are spent on upgrades within seconds. `server/core/purchases.ts:85-91` pauses purchases after 3 refunds in 90 days per player id; player ids are free.
- Sequence: buy offer → spend resources on an upgrade → request store refund (Apple grants most first refunds) → `REFUND` notification → nothing recoverable → repeat ×3 → new account (or just a new device village).
- Fix: debt for every resource (negative balances consumed from income, with the ledger already showing it), freeze the upgrades the refunded resources paid for (or suspend the account from PvP until the debt is repaid), and count refunds per store account identity (`originalTransactionId`, Apple `appAccountToken` reuse, Google `obfuscatedExternalAccountId`) and per device, not per player id. Answer Apple `CONSUMPTION_REQUEST` (currently ignored, `:322-326`): Apple decides refunds partly on it, and "no data" favours the refund.

### A6 — MEDIUM — Two late reports against one defender can both settle (no defender row lock) — VERIFIED code, race SUSPECTED
- `server/core/pvp.ts:517-521` checks `defensesFor(defender, ticket.createdAt)` outside the transaction; `:529` loads the defender outside; `:551-570` writes `tx.updatePlayer(defender.id, defPatch)` as a blind `UPDATE` (`pgRepo.ts:526-583`). Match locks last 5 min (`TICKET_LOCK_MS`), reports are accepted for 72 h (`LATE_REPORT_MS`), so two attackers can legitimately hold tickets on the same defender; if their reports interleave (both pass the check before either `addAttack` commits) both pay: the defender's server village loses loot twice and the second `trophies`/`shieldUntil` write wins (lost update). Same lost-update pattern for the attacker's own honor vs `forfeitExpired` (`:409-418`).
- Fix: inside the transaction `select … from players where id = $1 for update` on both players and re-run the `defensesFor` check; or `pg_advisory_xact_lock('attack:'||defenderId)`.

### A7 — MEDIUM — Per-player rate limits are keyed by token hash, and a player can mint unlimited tokens — VERIFIED
- `server/app.ts:213-223`: `who = t:<sha256(token)>`; `POST /v1/sessions` (`links.ts:572-582`) issues a new token per call for any linked account, limited only by the `register` IP rule (300/h). Every "per player" limit (`player` 240/min, `battle` 20/min, `commands`, `lookup`/`lookupDay` 300/day, `purchase`) multiplies by the number of tokens.
- Fix: key the `player` and route rules by `player.id` (authenticate before limiting for authed routes, or use the `verified` map), keep the token-hash key only for unauthenticated junk.

### A8 — MEDIUM — Rate limiting fails fully open while Redis is down (no local fallback) — VERIFIED
- `server/shared.ts:478-487`: any Redis error → `{ ok: true }`; `main.ts:153` installs only the Redis limiter, no `MemoryRateLimiter` behind it. A Redis quota exhaustion (Upstash free tiers) or a 500 ms stall turns every limit off on every instance for the outage, including registration and battle reports (re-sim CPU).
- Fix: `RedisRateLimiter` falls back to a per-instance `MemoryRateLimiter` while `redis.available === false`; alert already exists (`RedisDown`) but only after 5 min.

### A9 — MEDIUM — No graceful shutdown — VERIFIED
- `server/main.ts` registers no `SIGTERM`/`SIGINT` handler; `app.close()`, `pool.end()`, `resim.close()` are never called. On every deploy/scale-down the host kills the process mid-request: open transactions roll back (fine), re-sim jobs in flight die (`503 busy` to clients after they already waited), keep-alive connections are reset. Every release will show an error blip and retry storm from the outbox.
- Fix: `process.on('SIGTERM', async () => { await app.close(); await resim.close(); await pg.close(); process.exit(0); })` with a 25 s cap; stop accepting from the LB first (`/readyz` returns 503 during drain).

### A10 — MEDIUM — Outbound calls to Google Play, FCM, Play Games and JWKS have no timeout — VERIFIED
- `server/payments/google.ts:607-617` (`call`), `:543-555` (OAuth), `push/push.ts:160-173` (FCM), `identity/verify.ts:64-77` (JWKS `load`), `:262-271` (Play Games) all use bare `fetch`. Only Apple token exchange, Game Center and Sentry carry `AbortSignal`. Fastify has no request timeout by default, so a stalled Google endpoint pins `POST /v1/purchases` handlers and pool connections (redeem runs `check` before the transaction, so no DB lock, but the handler and socket stay).
- Fix: one `fetchWithTimeout` (5–10 s) used by every outbound client; bound `pollVoided` paging with a deadline.

### A11 — MEDIUM — Google purchase check trusts the client's `storeProductId`; the API answer is not cross-checked — SUSPECTED
- `server/payments/google.ts:620-640`: the URL uses the client-supplied `productId`; the returned `GooglePurchase.productId` is the input, never `p.productId` from the response; `acknowledgementState` is ignored. If Google ever returns the purchase state for a token regardless of product path (behaviour varies by API version), a `jade_pinch` token redeems as `jade_6`.
- Fix: refuse when `p.productId` is present and differs; refuse `purchaseState !== 0`; log `acknowledgementState`. Cheap and removes the dependency on Google's path validation.

### A12 — MEDIUM — Account deletion does not purge idempotency bodies (which can hold the whole village) — VERIFIED
- `server/app.ts:176-187` stores every 2xx body under `(sha256(token), key)` in `idempotency_keys`; `POST /v1/village/import` and `POST /v1/village` answer with the full `file` (~290 KB). `pgRepo.deletePlayer` (`:964-1044`) does not touch `idempotency_keys` (no FK, no cascade); they live until `idempotencyBefore` (24 h). Also `name_holds` are deleted at deletion (`:1003`), so a deleted player's name is reusable immediately (impersonation of an ex-Alliance leader).
- Fix: delete `idempotency_keys where scope = sha256(every token of the player)` in `deletePlayer`; do not store bodies for village routes (replay by returning 204 + re-fetch); keep a 35-day hold on a deleted player's name key.

### A13 — MEDIUM — Idempotency replay ignores method, route and body — VERIFIED
- `server/app.ts:168-173`: scope = token + key only. A reused key returns the stored body for a different route (e.g. a `POST /v1/attacks` answer to a `POST /v1/village/commands`), which the client would then apply as a command-batch response. Today's client generates a UUID per attempt (`httpAdapter.ts:404-409`), so this is latent, but it also means a replayed key never checks the body matches (standard idempotency semantics require 422 on mismatch).
- Fix: include `method + routeOptions.url` (and a hash of the body) in the scope; answer 422 on mismatch.

### A14 — MEDIUM — Friend requests by `playerId` bypass findability, blocks-by-age and the under-13 rule — VERIFIED
- `server/core/friends.ts:779-782` accepts any `playerId` "from a card the player already saw" without `findableBy` (which is what implements `findable: nobody`, bans and the under-13 "never found" rule, `:719-731`). Player ids are visible in chat rows, duel/challenge views (`duels.ts:82,152`), gang views and defense logs. The push "wants to be friends" then reaches an under-13 or a `nobody`-privacy player from any stranger.
- Fix: apply the under-13, banned and `findable` checks on the `playerId` path, or require an existing relation (same Alliance/Gang, duel partner).

### A15 — MEDIUM — Sign-in tokens are not nonce-bound; Game Center certificate chain and dates unchecked — VERIFIED
- `server/identity/verify.ts:112-140`: signature, issuer, audience, expiry only; no `nonce`, no `iat`. An Apple/Google ID token issued to our client id can be replayed for its lifetime (Apple ≈10 min, Google ≈1 h) by anyone who obtains it (logs, a malicious SDK, a proxy on a rooted phone) to mint a device token for that account (`POST /v1/sessions`). `GameCenterVerifier.cert` (`:197-236`) pins the host but does not verify the cert chains to Apple nor its validity window.
- Fix: server-issued nonce (`GET /v1/auth/nonce`), client passes it to ASAuthorization/Google Sign-In, server checks `nonce` (sha256 for Apple) and marks it used; check `iat ≤ now+5 min`; verify the GC cert against Apple's root and dates.

### A16 — MEDIUM — Bearer tokens never expire or rotate; no "sign out this device" — VERIFIED
- `nodeContext.ts:517` 24-byte random, hashed; no `expires_at`, no rotation on sign-in, no own-logout route (`revokeOtherSessions` keeps the caller's). The web build keeps the token in `localStorage` (`httpAdapter.ts:358-377`) on a GitHub Pages origin; any XSS there (the HUD renders player names, chat, notices) yields permanent account access, and the only remedy is the player noticing and revoking others from the stolen device's perspective.
- Fix: rotate the primary token on every sign-in; add `DELETE /v1/sessions/current`; consider short-lived access + refresh for the web build; keep CSP strict on the web origin.

### A17 — MEDIUM — Village JSON write amplification will be the first thing that hurts Postgres — SUSPECTED (sized, not measured)
- Every command batch (`villageSync.ts`: every 15 s while anything is queued, or at 20 commands) rewrites the whole `villages.file` JSONB (~290 KB raw; TOAST pglz maybe 40–80 KB) plus ledger rows per command (`pgRepo.ts:1157-1183`, one INSERT per ledger line in a loop) and `command_log` rows kept 30 days; every settled attack rewrites two villages (attacker and defender, `applyServerResult`) and recomputes `villageToBase`+`economyHash` (canonical JSON of the economy) on the main thread.
- At 20k DAU × ~60 batches/day that is ~1.2 M full-row rewrites/day (tens to hundreds of GB of WAL/TOAST churn per day, heavy autovacuum), and the serialize/deserialize CPU sits on the API event loop (not the worker pool).
- Fix: store the village compressed (`bytea`, gzip/brotli, ~5 KB per the audit's own number), batch ledger inserts with `unnest`, raise the client flush interval to 60 s when nothing urgent is queued, move `deserialize/advance/serialize` of villages into the worker pool for attack settlement, and measure `pg_stat_user_tables.n_tup_upd` on staging under `npm run server:load`.

### A18 — MEDIUM — Retention DELETEs are unbatched and run under the 30 s statement timeout — VERIFIED
- `pgRepo.ts:935-951`: `delete from attacks where at < $1`, `command_log`, `tickets`, `idempotency_keys` in single statements; `main.ts` uses the main pool with `PG_STATEMENT_TIMEOUT_MS` 30 000. Once a day's worth of rows exceeds what deletes in 30 s, the statement is cancelled every hour, retention silently stops, and tables grow until someone notices disk.
- Fix: batched deletes (`… where ctid = any(array(select ctid … limit 5000))` in a loop) and a `tk_retention_rows_total` metric with an alert when zero for 24 h.

### A19 — MEDIUM — Matchmaking query sorts by `random()` over a widening trophy window — VERIFIED
- `pgRepo.ts:820-831`: `… order by random() limit 20` with windows ±80, 200, 400, 1 000 000 (`pvp.ts:282`). The last window scans and sorts every ranked player in the Keep window (index `players_match2_idx` only narrows the range). 30 `match` calls/min per player.
- Fix: sample with a random `trophies` pivot (`order by abs(trophies - $pivot) limit 50`) then shuffle in memory; or `TABLESAMPLE SYSTEM_ROWS`.

### A20 — MEDIUM — Power leaderboard is a full scan per call; honor rank is `count(*)` without Redis — VERIFIED
- `pgRepo.ts:849-856` (`order by attack_rating + β·(hall_level−1)`, unindexable), `:837-840`. Both authed endpoints are called on every HUD open.
- Fix: a stored `power` column maintained on rating writes with an index, and a 30–60 s cache for both top lists.

### A21 — MEDIUM — Periodic jobs run on every instance without coordination — VERIFIED
- `main.ts:240-263`: `prune`, `pollVoided`, `gangWarReminders` (every 5 min) on each instance. `gangWarReminders` reads `notified`, pushes, then writes (`gangWars.ts:572-595`): two instances within the same 5-min tick both push "battle day" to every member. `pollVoided` calls Google N× per hour.
- Fix: `pg_try_advisory_lock` per job, or claim with `update squad_wars … where not coalesce((record->'notified'->>'battle')::bool,false) returning id` before pushing.

### A22 — MEDIUM — Migrations cannot build indexes concurrently — VERIFIED
- `server/migrate.ts:113-117` wraps each file in `begin/commit`; `CREATE INDEX CONCURRENTLY` is impossible, so any future index on `players`, `attacks`, `ledger` or `command_log` takes a write lock for the build duration during a release (first time it matters: the `power` column index above). 24 forward-only migrations, no down files (acceptable if restores are the rollback path, which the drill covers).
- Fix: a `-- migrate: no-transaction` header honoured by the runner.

### A23 — MEDIUM — Anonymous accounts are free, permanent and never pruned — VERIFIED
- No dormant-account retention anywhere (`retention.ts` prunes replays, tickets, tokens, requests, not players/villages). Each registration can create a ~300 KB village, an Alliance, a Gang, push tokens. 300/h per IPv4 or /64; a /48 gives an attacker 65 536 budgets. GDPR storage-limitation also expects a dormancy policy.
- Fix: prune players never seen for N months with no purchases and no links (after a notice), rate-limit `startVillage`/`import` per IP, and count registrations per /48 as well as /64.

### A24 — MEDIUM — Sandbox-purchase cap is per free account — VERIFIED
- `purchases.ts:209-218`: `$10` per player id on production. Public TestFlight testers (sandbox) can mint $10 of Jade per anonymous account forever; the ladder is shared with paying players.
- Fix: cap per device/`originalTransactionId` family and per IP/day; or credit sandbox only to accounts with a linked Apple identity on an allow-list (App Review's), which is what the exception is for.

### A25 — LOW — `dump.rdb` committed at the repo root — VERIFIED
- A 965-byte Redis 7.0.15 RDB from a local test run (keys `test:16976:…:board`, `inst-…:rlregister:ip:10.0.0.9`), added in `9ee1d40`, tracked by git, not in `.gitignore`. No secrets, but it is a stray artifact of running `redis-server` inside the checkout and will be re-committed by the next person who does the same.
- Fix: `git rm dump.rdb`; add `*.rdb`, `appendonly*` to `.gitignore`.

### A26 — LOW — Docker image ships the game's dependencies and has no HEALTHCHECK — VERIFIED
- `Dockerfile:18-19`: `npm ci --omit=dev` installs `phaser`, all `@capacitor/*` and `unicode-segmenter` (the comment says only fastify/pg). `node:24-slim` by tag only. No `HEALTHCHECK`, no `--init`. The server bundle is ESM via Vite, so the fix is easy.
- Fix: a `server/package.json` with `fastify`, `pg`, `unicode-segmenter` only (or bundle them), pin the base image digest, add `HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8787/healthz')…"`, `tini`/`--init`.

### A27 — LOW — CI/CD hygiene — VERIFIED
- Actions pinned to major tags only (`actions/checkout@v7`, `upload-artifact@v5` in backup.yml vs `@v7` elsewhere); no `npm audit`/SBOM step; `server.yml` pushes the image on every main push touching the server, deploys to staging automatically and production only by hand with environment protection (good). `deploy.yml` runs the Postgres contract job on PRs too (good, no secrets). Backups to GitHub artifacts are already flagged as owner work.
- Fix: pin actions by SHA, add `npm audit --omit=dev --audit-level=high` to `test`, make `upload-artifact` versions consistent.

### A28 — LOW — Staff token guessing is limited only by the IP rule — VERIFIED
- `app.ts:484-492`: constant-time compare and ≥24 chars (≈143 bits) make brute force infeasible, but each guess counts only against `ip` (3000/min) because every distinct bearer is a new token-hash key. Fine cryptographically; add a `staffAuthFailed` metric/alert and a dedicated rule (10/min/IP) so an attempt is at least visible.

### A29 — LOW — Apple notifications have no replay/ordering protection — VERIFIED
- `purchases.ts:305-327`: `notificationUUID` is logged, not stored. Out-of-order delivery (`REFUND_REVERSED` before `REFUND`) ends with the purchase refunded although Apple reversed it. `links.ts:546-569` `account-delete` deletes the whole game account immediately, even when Google/Game Center are also linked (product decision; at least log + notice and a grace period).
- Fix: store seen `notificationUUID`s with `signedDate`, apply the latest state by date.

### A30 — LOW — PII in logs — VERIFIED
- pino logs `req.url`: `GET /v1/players/lookup?name=…` and `/v1/players/code/KAGE-…` put names and friend codes in logs; `village import refused` logs `player` id; desync logs include client/server hashes (fine). Tokens are redacted. Add a URL redaction for those two routes before shipping logs to a third party.

### A31 — LOW — `TRUST_PROXY` hop count is easy to get wrong behind two proxies — SUSPECTED
- `config.ts:41-48`: `1` behind Cloudflare→Render (two hops) makes every player share Cloudflare's address → one shared 3000/min bucket and a shared registration bucket. `SHIPPING.md` says "usually 1". Add a `/v1/hello` field or a staff endpoint that echoes `req.ip` and the XFF chain so the owner can verify after deploy (the doc asks for a two-phone test, which nobody will do).

### A32 — LOW — Worker-pool failure modes — VERIFIED
- `resim/resim.ts:169,191-205`: a battle over 15 s kills and respawns the worker (new `RulesRegistry` + archived engines built per spawn, `worker.ts:232`), and `burnAfterFailures` ignores the resulting 503 (`pvp.ts:362`), so a pathological setup can be resubmitted 20×/min per token with no burn. I could not find a setup that runs >15 s (`runBattle` is bounded by `durationSeconds × ticksPerSecond`; `endTick` beyond that is harmless; negative/NaN `endTick` is ignored), so this is defence in depth: count timeouts against the ticket too.

### A33 — LOW — `x-request-id` from the client is trusted when it "looks like one" — `app.ts:115-118`; harmless but lets a client correlate/forge log lines. Prefer always generating and echoing the client's as a separate field.

### A34 — Test-quality gaps (what `tests/backend` does not prove) — VERIFIED by inventory
- Contract tests (`protocol.contract.test.ts`, 17 cases) assert status codes, feature lists and response shapes; they do not assert economics (loot amounts, honor deltas, ledger lines) over HTTP — those live in `core.test.ts`/`attacks-economy.test.ts` against the in-process adapter on `MemoryRepo`.
- Untested: concurrent reports against one defender (A6); per-player limits across several device tokens (A7); Redis-down limiter fallback (A8, the test asserts fail-open, which is the bug); graceful shutdown (A9); outbound timeouts (A10); Google product/token mismatch (A11); deletion purging `idempotency_keys` (A12); idempotency cross-route (A13); friend request by id vs under-13 (A14); token replay/nonce (A15); retention under statement timeout (A18); matchmaking at scale (A19, `findOpponents` is never run with >50 players); duplicate pushes across instances (A21, `instances.test.ts` is 57 lines and covers Redis sharing only); import plausibility (A2). `load.test.ts` (26 lines) only checks the tool's argument parsing. Postgres paths run only in CI (`TEST_DATABASE_URL`), never here. Apple JWS fixtures are a made-up chain (fine), but there is no negative test for a leaf without the receipt OID placed in a different cert position.

---

## B. Prior-audit claims checked against current code

| Claim (WORLDWIDE_AUDIT "Server, payments and battle integrity") | Holds? | Notes |
|---|---|---|
| Refund before redeem refused (`refund_notices`) | **Yes** | `purchases.ts:187-192`, migration 0021, test passes |
| Attack-commit: started raid never reported settles as a loss; one open raid per attacker | **Code yes, protection no** | A1: a client that never calls `start` pays nothing; the audit's own "limit" line understates it |
| Held tickets can no longer bypass a shield (`409 defender_protected`) | **Yes, with a race** | A6: check outside the transaction, no defender row lock |
| Backdating clamp 12 h, import dated by server clock | **Yes** | `village.ts:192-199`, `villageImport.ts:472` |
| Battle commands capped 6/min, `abandonBattle` no longer simulates | **Yes, insufficient** | A3: `trialEnd`/`bountyEnd`/`rematchEnd` still simulate on the main thread under a row lock |
| Ticket burned after 3 refused reports; server-held troops checked first | **Yes** | `pvp.ts:350-367`; levels/Lodge are checked only after re-sim (`checkBattleSetup`), 500/503 never count (A32) |
| TRUST_PROXY required, `true` refused, IPv6 /64, CGNAT-sized limits | **Yes** | A31 on hop-count misconfiguration; A7 on token-keyed limits |
| Game Center fetch restricted | **Yes** | host/path pinned, 16 KB, 5 s, LRU 16; chain/dates not verified (A15) |
| Refused commands logged by type only, no village rewrite | **Yes** | `village.ts:226-249`, `recordVillageCommands` |
| Idempotency after limits/auth | **Yes** | `app.ts:240-252` |
| Sandbox purchases capped on production ($10/player) | **Yes, per free account** | A24 |
| Spend-then-refund → debt; reversals re-grant; 3 refunds pause | **Partly** | Debt only for Jade (A5); reinstatement and pause verified |
| Postgres pool/timeouts/TLS verified | **Yes** | `config.ts:87-146`; the 30 s statement timeout now bites retention (A18) |
| Redis outage: 500 ms timeout, fail-open limiter, DB leaderboard | **Yes** | fail-open has no local fallback (A8) |
| One open raid per attacker, voided tickets release locks | **Yes** | and voiding is free (A1) |
| Purchases have their own rate bucket | **Yes** | `purchase` 120/h |
| Legacy batch without device id → 426 | **Yes** | `village.ts:178-181` |
| Tokens revoked on unlink / revoke-others / 400-day prune; JWKS throttled | **Yes** | no expiry/rotation (A16) |
| `ADMIN_TOKENS` per staff + `ADMIN_ALLOW_IPS` | **Yes** | constant-time, named actor |
| gzip/br ≥ 1 KB | **Yes** | `app.ts:254-276`; no BREACH exposure (no secret reflected alongside attacker text) |
| GLOBAL-002 provenance holds | **Yes for Jade/pass**, progression still trusted | A2 |
| GLOBAL-004 atomic intent reservation | **Yes** (advisory lock) | but bypassable at redeem (A4) |
| GLOBAL-009 device numbering, GLOBAL-010 storage errors, GLOBAL-012 timeout covers body, GLOBAL-013 retry on reconnect | **Yes** | `villageSync.ts`, `httpAdapter.ts:462-523`, `connection.ts` |
| GLOBAL-016 contract DB migrated in CI | **Yes** | `deploy.yml` server job |

---

## C. Operational readiness (100k MAU worldwide ≈ 20k DAU, ~2k peak concurrent, ~160k raids/day, ~5 raids/s peak)

What works: stateless API, Postgres as truth, optional Redis for locks/limits/board, migrations as a release step with a lock and checksum, worker-thread re-simulation with a bounded queue and `503 busy`, structured logs with redaction, metrics + sane alert rules, encrypted backups with a weekly restore drill, production config guard, staff tooling, DSA-style notices, account deletion that is broadly complete.

What breaks first, in order:
1. **Postgres write churn from whole-village JSON rewrites** (A17) and unbatched retention under the statement timeout (A18): bloat, autovacuum lag, disk growth; the GitHub-artifact backup cannot keep up (owner item already).
2. **API event loop**: village serialize/deserialize/`economyHash` per batch and per attack settlement, plus main-thread battle commands (A3). Expect one 2-vCPU instance to settle ~10–20 server-held attacks/s before the workers matter. Worker pool sizing: `cores − 1` workers each ~0.45 s per late-Keep battle → ~2 battles/s per vCPU; 3 workers cover the 5/s peak; the limiter (20 battle reports/min/token) is the only backpressure.
3. **Rate limiting in a Redis incident** (A8) combined with free accounts (A23) and loss hiding (A1): the abuse surface is wide open exactly when you are already in trouble.
4. **Matchmaking query cost** at >50k ranked players (A19) and leaderboard scans (A20).
5. **Deploy blips** from no graceful shutdown (A9), amplified by the outbox retry on every client.
6. **Single region**: everything in one Postgres region; a player in Jakarta or Lagos talking to a US host sees 250–350 ms RTT per call; the client makes ~6 sequential calls per sync (`hello, me, defenses, inbox, raid, gangWar`), so a sync is 2–3 s on good cellular, worse on 3G. Host near the largest market and collapse the sync into one `GET /v1/sync` endpoint; a CDN in front of the API buys nothing for POSTs.

Monthly cost guess at 100k MAU (assumptions: Render/Fly-class hosting, managed Postgres with PITR, Upstash Redis, ~15 GB/month compressed egress, push free): 2× API instances 2 vCPU/4 GB ≈ $50–120; Postgres 4 vCPU/16 GB with PITR ≈ $150–300 (storage grows ~1–2 GB/day with 30-day replays and command logs unless A17/A18 are fixed); Redis ≈ $10–40; Sentry/Grafana Cloud free–$50; object storage for backups ≈ $5. **≈ $250–500/month**, rising to $2–4k at 1M MAU mostly in Postgres. At the audit's own spend assumptions this is a rounding error against revenue, so the real constraint is engineering time for A1–A5, not hosting.

Verdict: can run a **soft launch (≤10k MAU, one region)** today if A9 (shutdown) and A8 (limiter fallback) are fixed and A1/A2/A4/A5 are accepted as known abuse until patched. **Not ready for a worldwide 100k-MAU launch** without A1, A2, A3, A5, A17, A18 and the owner items below.

---

## D. Owner/human tasks to go live (backend)

1. Hosting: a Postgres with PITR in the chosen primary region (Neon/Render/Supabase paid tier), `PG_CA_CERT` set, `max_connections` ≥ instances × `PG_POOL_MAX` + migrations + backups; Redis (`rediss://`) before the second instance; two API instances; `TRUST_PROXY` verified with two phones (A31); `DEPLOY_ENV=production`, `ADMIN_TOKENS` per person, `ADMIN_ALLOW_IPS` (VPN), `METRICS_TOKEN`, `SENTRY_DSN`, `SUPPORT_CONTACT`, `CORS_ORIGIN` list, `MIN_CLIENT_BUILD` policy.
2. Domain: `api.<domain>` with A+AAAA, HSTS verified by `tools/ops/check-domain.mjs`; set `VITE_SERVER_URL`, `SERVER_URL` variables and `DEPLOY_HOOK` secrets for the `staging` and `production` GitHub environments; required reviewers on `production`.
3. Backups: move `tools/ops/backup.mjs` to a scheduled job next to the database writing to an owned bucket; keep `BACKUP_KEY` outside GitHub; run one real restore into a fresh DB and point a staging server at it before launch.
4. Apple: App Store Connect server notifications URL (`/v1/purchases/apple/notifications`, production + sandbox), `APPLE_BUNDLE_IDS`, `APPLE_ENVIRONMENTS` (drop `Xcode`), Sign in with Apple key (`APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY`, `APPLE_CLIENT_IDS` incl. Services ID), server-to-server notification endpoint registered (`/v1/webhooks/apple-signin`), APNs key (`APNS_*`, `APNS_SANDBOX` unset in prod), Game Center bundle ids; decide the `CONSUMPTION_REQUEST` policy (A5).
5. Google: Play Console service account (`GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE`), RTDN Pub/Sub push subscription with OIDC (`GOOGLE_RTDN_AUDIENCE`, `GOOGLE_RTDN_SERVICE_ACCOUNT`) pointed at `/v1/purchases/google/notifications`, FCM project + key, OAuth web client id for Sign in with Google (`GOOGLE_CLIENT_IDS`), Play Games (optional), license testers; `GOOGLE_PLAY_ALLOW_TEST` unset in prod.
6. Operations: a Prometheus/Grafana scrape of `/metrics` with `ops/prometheus/alerts.yml` loaded and a pager for `ServerDown`/`HighErrorRate`/`DatabasePoolSaturated`; an on-call rota and a status/notice process (`SERVER_NOTICE`); Sentry project; log shipping with the A30 redactions; a weekly review of `tk_desyncs_total`, `tk_refunds_total`, `tk_forfeits_total`, staff actions.
7. Staff: at least one trained moderator for the report queue and the deletion queue (DSA/UK OSA timelines), the support mailbox in `SUPPORT_CONTACT`, a written refund/chargeback and cheating-ban policy that A5 and A1 can enforce.
8. Before the first store build: deploy the server first (`check-server-rules.mjs` gates builds), run `npm run server:bench` and `npm run server:load` on the real host to set `RESIM_WORKERS`, `RESIM_QUEUE`, instance count and the `RATE_LIMITS` overrides, and record the numbers in `docs/backend/PVP_ROADMAP.md`.
9. Repo hygiene from this audit: remove `dump.rdb`, pin CI actions, slim the Docker image.