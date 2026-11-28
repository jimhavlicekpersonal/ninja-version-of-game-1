# Server data layer and runtime operations: new findings (auditor "serverdata")

Lens: `server/stores/**`, `server/migrations/**`, `server/migrate.ts`, `server/jobs.ts`, `server/shutdown.ts`, `server/redis.ts`, `server/shared.ts`, `server/rateLimit.ts`, `server/resim/**`, `server/main.ts`, `server/config.ts`, `server/observability.ts`, `Dockerfile`, `ops/**`, `.github/workflows/backup.yml`, `server.yml`, `tools/ops/*.mjs`.

How the reproductions were run: a private Postgres 16 cluster (port 55447) with all 49 migrations applied by `node dist-server/migrate.js`, and a private redis-server 7.0.15 (port 56387). Scratch vitest files drove the repository's own code (`PgRepo`, `runMigrations`, `runLeased`, `summarizeNew`, `RedisClient`, `RedisLeaderboard`, `RedisLocks`). Both servers are stopped and their data removed; the scratch tests are deleted from the repository; copies and raw output are in `scratchpad/serverdata/` (`repro/*.ts`, `out.log`, `redis-out.log`, `schema.sql`). The sandbox is a 4-vCPU VM with default Postgres settings, so absolute times will differ on a real host; the growth rates will not.

Every finding below was searched for (symbol, table name, keywords) in the five owner documents, `docs/store/WORLDWIDE_AUDIT.md`, `docs/audit/**`, `docs/prompts/BEAST_MODE_*.md`, `docs/history/`, `docs/DECISIONS.md`, `docs/SHIPPING.md`, `docs/ops/`, `docs/backend/`, `docs/PROTOCOL.md`. None is recorded there.

## 1. Ranked table

| ID | Severity | Confidence | Title |
|---|---|---|---|
| DB-1 | HIGH | high (reproduced) | Account deletion costs grow with all-time history: sequential scans of `tickets` and chat, and every Alliance War roster and Gang War record ever stored is decompressed, under a 30 s statement timeout |
| DB-2 | MEDIUM | high (reproduced 12/12) | Redis leaderboard rebuild races between instances on one shared temp key: after an outage the board keeps 5-60% of the players and is flagged healthy |
| DB-3 | MEDIUM | high (reproduced) | The Alliance browser and war pairing only see the oldest 200 / 1,000 Alliances; with those full, no Alliance is joinable |
| DB-4 | MEDIUM | high (reproduced) | Job leases are re-entrant for their holder: the "daily" dormant-account job runs 24 times a day, and a run that outlives its interval overlaps itself |
| DB-5 | MEDIUM | high (reproduced) | The migration runner sets no `lock_timeout`: an `ALTER TABLE` waiting behind a long reader (the daily `pg_dump`) blocks every query on that table |
| DB-6 | MEDIUM | high for two rules (source), medium for the third (measured) | Three alerts cannot fire in the case they exist for: `RetentionStalled`, `PurchasesStalled` (absent series), `RedisDown` (samples a 1 s breaker flag) |
| DB-7 | LOW-MEDIUM | high (reproduced) | Redis errors on a live socket (memory full, quota, READONLY, failed AUTH) never trip the breaker: match locks grant everyone and never fall back to tickets; a failed AUTH never reconnects |
| DB-8 | LOW-MEDIUM | medium-high (state simulated, code path run) | The statistics watermark is a transaction id of the old cluster: after a `pg_dump` restore the hourly rollup silently reads nothing |
| DB-9 | LOW-MEDIUM | medium (source only) | Lock order inversion between attack settlement and the defender's own command batch: sporadic deadlocks |
| DB-10 | LOW | high (source only) | `backup.yml` is green when it backed up nothing; the drill's check loads every village file once per resource into memory |
| DB-11 | LOW | medium (source only) | Tables with no retention that the retention/privacy documents do not list (`raid_pairings`, `squad_wars` and their rows, `name_holds` and others) |
| DB-12 | LOW | medium (source only) | Gang War reminders read only the 500 wars ending soonest, from a table with no index on `ends_at` and no pruning |

## 2. Findings

### DB-1 (HIGH, confidence high): account deletion scales with all-time history
- Where: `server/stores/pg/players.ts:187-306` (`deletePlayer`). Callers: `DELETE /v1/me`, staff deletion (`server/core/account.ts:22-33,116-135`), the dormant job (`server/core/retention.ts:96-109`).
- Cause, statement by statement (indexes from the migrated schema):
  - `tickets`: `:191` (by `attacker_id`), `:209` and `:214` (by `defender_id`). The only indexes on those columns are partial (`tickets_open_by_attacker_idx ... WHERE NOT used`, `tickets_lock_idx ... WHERE NOT used`), so each is a sequential scan of 30 days of tickets. The foreign keys `tickets.attacker_id/defender_id -> players(id)` add two more scans when the `players` row goes (`:304`).
  - `raid_pairings`: `:237-245`, `where roster @> ...` with no GIN index; the table is never pruned; each row holds a roster of up to 20 bases.
  - `squad_wars`: `:269-277`, the same once per side; never pruned; each record holds both rosters with bases (53 KB of JSON on average in the seed).
  - `grove_chat`: `:230` (`right(text, length($1)) = $1` on every donation line) and `:224-228` (every system line); chat is kept for the account lifetime.
  - No usable index either for `donations.from_id` and `to_id` (`:231-232`), `raid_attacks.attacker_id` (`:234`), `raid_claims.player_id` (`:235`), `squad_war_attacks.attacker_id` (`:215`), `squad_war_relays.last_by/holder` (`:216-217`), `squad_war_claims.player_id` (`:278`), `name_holds.player_id` (`:252`), `squad_invites.from_id` (`:267`), `reports.reporter_id` (`:279`).
- Reproduction (seed: 50,000 players, 2,000,000 tickets = 1.2 GB, 2,000,000 chat lines, 20,000 Alliance War pairings = 479 MB, 20,000 Gang Wars = 246 MB, 500,000 donations; bases from the game's own `generateOpponent`). `repo.deletePlayer` through the real code, per-statement times:
  - `delete from tickets where attacker_id`: 15.6 s cold cache, 0.5 s warm
  - `update tickets ... where defender_id`: 6.7 s / 3.5 s
  - system chat delete: 11.5 s / 0.7 s; donation chat update: 1.5 s / 1.8 s
  - `update raid_pairings ... roster @>`: 13.3 s
  - `update squad_wars` side a + side b: 6.4 s + 2.0 s
  - the two foreign-key checks on `tickets`: 0.54 s + 0.42 s each (`Seq Scan on tickets` in the plan)
  - One deletion: about 65 s on a cold cache, about 30 s warm.
- Failure scenario: the statement timeout is 30 s per statement (`server/config.ts:95`). The `raid_pairings` statement alone took 13.3 s for 20,000 rows and is linear, so it crosses 30 s at about 45,000 rows: 1,000 Alliances after 45 weekly wars, or 5,000 after 9. From then on every `DELETE /v1/me`, every staff deletion and every dormant-account deletion fails and rolls back (Apple 5.1.1(v), Google account deletion, GDPR erasure). Before that point each deletion already holds a pool connection for tens of seconds, and the dormant job issues 200 per run (per DB-4: every hour).
- Fix: plain indexes on `tickets(attacker_id)` and `tickets(defender_id)` and on the columns listed; keep roster player ids in side tables (`raid_pairing_roster`, `squad_war_roster`) or add GIN indexes so the rows are found by key; prune finished wars and pairings (30-90 days, like replays); a deletion metric with an alert.
- Not verified: production row sizes; the full transaction end to end (the run through the code stopped at statement 24 on a foreign-key error caused by my seed, which had donations pointing at another player's request; the later statements were timed in psql inside a rolled-back transaction).

### DB-2 (MEDIUM, confidence high): leaderboard rebuild races between instances
- Where: `server/shared.ts:112-130` (`heal`): `DEL tmp`, `rankedPlayers()`, `ZADD tmp` in chunks of 500, `RENAME tmp key`, with `tmp = tk:leaderboard:rebuild` shared by every instance. Triggered by `markStale` at boot when Redis is unreachable (`server/main.ts:209-212`) and by any failed write (`shared.ts:136-139`).
- Failure scenario: Redis returns after an outage. Every instance is stale and starts `heal` on its next successful command, at the same moment. Instance A's `RENAME` lands while B is still adding chunks; B's remaining chunks create a new `tmp` holding only those players, and B's `RENAME` replaces the complete board with that fragment. Both set `stale = false`. The honor leaderboard and every rank (`ZCOUNT`) are then wrong for all players outside the fragment until each fights again or Redis is emptied.
- Reproduction: two `RedisLeaderboard` instances on one redis-server, 20,000 ranked players, both stale, database answers 2-35 ms apart. In 12 of 12 trials the board ended with 1,000 to 12,500 of 20,000 players (1000, 1500, 3000, 2500, 3500, 4000, 5500, 8000, 12500, 5500, 2000, 7500), both `stale` flags false, no error reported.
- Also (source only): inside one instance, an honor change written to the live key during the rebuild is overwritten by the older snapshot at `RENAME`.
- Fix: a per-instance temp key and a Redis lock (`SET NX PX`) so one instance rebuilds; or add into the live key and remove ids the database no longer ranks.
- Not verified: timing with real `rankedPlayers` latencies on a production database.

### DB-3 (MEDIUM, confidence high): Alliance browser and pairing see only the oldest Alliances
- Where: `server/stores/pg/alliances.ts:23-26` (`... group by g.id order by g.created_at limit $2`), `server/stores/memory/alliances.ts:24-31` (insertion order, the same effect), `server/core/groves.ts:65-74` (asks for 200, drops full ones, keeps 30), `server/core/groveRaid.ts:63-66` (`listGroves('', 1000).find(...)`).
- Reproduction: 5,000 Alliances, the 200 oldest full (20 members), 4,800 newer ones with 5 members. `repo.listGroves('', 200)` returned `grove-00001..grove-00200`; after the core's `members < max` filter 0 are joinable, with 4,800 Alliances having free places. `listGroves('', 1000)` did not contain `grove-04000`. Plan: sequential scans of `players`, `grove_members` and `groves` and a hash aggregate over all 5,000 before the limit (114 ms at this size, on every browser open).
- Failure scenario: (1) once the oldest 200 Alliances are full, `GET /v1/groves` shows new players nothing to join, and a newly founded Alliance is never listed (name search has the same 200 cap). (2) `ensurePairing` for an Alliance outside the oldest 1,000 reads `me` as undefined: its average honor counts as 0, so it is paired with the weakest candidates, and the opponent is told it faces "Alliance". (3) The query cost grows with all Alliances and all members.
- Fix: read the caller's own Alliance by id; select the browser list by free places and honor distance with stored `members`, `avg_trophies`, `last_active_at` on `groves`.
- Not verified: the client's behaviour on an empty list.

### DB-4 (MEDIUM, confidence high): re-entrant leases
- Where: `server/stores/pg/index.ts:108-117` (`... where job_leases.until <= $4 or job_leases.holder = excluded.holder`), `server/stores/memory/index.ts:77`, `server/jobs.ts:31-41`, `server/main.ts:343,351-364` (the hourly timer calls `dormant()`; comment "its lease is a day long: one instance runs it once a day"), `server/core/retention.ts:22-23` (`DORMANT_BATCH = 200`, "the job runs daily").
- Reproduction (PgRepo): 24 hourly ticks of `runLeased(..., 'dormant-accounts', DAY, ...)` on two instances: instance A ran 24 times, B 0 times. A 5-minute job whose run was still going at its next tick: 2 runs in flight on one instance.
- Failure scenario: the lease holder deletes up to 200 dormant accounts every hour, 4,800 a day, not 200. The daily batch is what bounds a mistyped `DORMANT_ACCOUNT_DAYS`, and each deletion is the transaction of DB-1. A reminder or rollup run longer than its interval is started again beside itself (the overlapping reminder runs both pass `stillHeld`).
- Fix: `runLeased` should start a job only when the lease has lapsed (or `next_run_at` has passed); the holder clause should apply only to `stillHeld` renewals; keep an in-process "running" flag per job.
- Not verified: a duplicate push from overlapping reminder runs (the war is marked before pushing, so it needs a precise interleaving).

### DB-5 (MEDIUM, confidence high): migrations wait for locks without a timeout
- Where: `server/migrate.ts:199-203` (no `set local lock_timeout`), `server/config.ts:95` (migrations run with the statement timeout off), `.github/workflows/backup.yml:17` (daily `pg_dump`, ACCESS SHARE on every table until it ends).
- Reproduction: a reader transaction held `players`; `runMigrations` with `alter table players add column ...` waited; a point read `select 1 from players where id = ...` from another connection was cancelled by its statement timeout after 3,037 ms (one ungranted lock in `pg_locks`); the migration applied only once the reader ended.
- Failure scenario: a release migration of the usual shape (0043, 0046, 0047 add columns to `players`) starts while the dump, a leaderboard scan or a retention batch reads the table. Every query on `players` queues behind the waiting `ALTER`; the API cancels its own statements after 30 s each and the pool fills. The game is down for as long as the reader runs.
- Fix: `set local lock_timeout = '5s'` per migration file with a few retries; note in `docs/SHIPPING.md` not to release during the backup window.
- Not verified: how long the production dump runs.

### DB-6 (MEDIUM): alerts that cannot fire
- Where: `ops/prometheus/alerts.yml` rules `RetentionStalled`, `PurchasesStalled`, `RedisDown`; `server/observability.ts:101-106` (a counter series exists only after its first `count()`); `server/main.ts:202`, `server/redis.ts:152-158` (`tk_redis_up` is the breaker's 1 s flag read at scrape time).
- Failure scenarios:
  - `RetentionStalled` (`sum(increase(tk_retention_runs_total[26h])) == 0`): after a deploy on which retention throws every run, the counter is never created; `sum()` over no series is empty and `empty == 0` never becomes pending. The pre-deploy series keeps the value above zero for 26 h, then disappears.
  - `PurchasesStalled` (severity `page`): the same when purchases have failed since the last restart (an expired key or wrong bundle id in the new configuration), which is the usual way they break.
  - `RedisDown` (`min(tk_redis_up) == 0 for 5m`): measured with Redis down throughout. Connection refused with steady traffic: the gauge read 0 in 99% of samples (the rule works). One Redis command every 5 s: it read 1 in 75%. A server that accepts connections and never answers: it read 1 in 33-34%. `for: 5m` needs 0 at every evaluation, so the last two cases almost never fire.
- How checked: source for the first two (no promtool in the sandbox; this is the standard empty-vector behaviour); sampling test for the third.
- Fix: `(sum(increase(...)) or vector(0)) == 0`; create the counters at 0 at boot; alert on `sum(rate(tk_redis_errors_total[5m])) > 0`.

### DB-7 (LOW-MEDIUM, confidence high): Redis errors on a live socket
- Where: `server/redis.ts:156-158,193-203,211-217` (only a failed connection or a timeout calls `trip()`), `:165-175` (a rejected AUTH or SELECT rejects `ready` but keeps `this.ready` and the socket), `server/shared.ts:232-234,252-259`, `server/core/pvp.ts:413` (`lockedSince: locks.external ? null : ...`).
- Reproduction: with `CONFIG SET maxmemory 1` (every write answers OOM) two attackers both acquired the same defender, `lockedAmong` was empty, `locks.external` and `client.available` stayed true. With a wrong password, three commands sent after the server's password was set to match still failed with the cached WRONGPASS while a new client succeeded.
- Failure scenario: Redis is full with `noeviction`, a provider's request quota is exhausted, or a demoted replica answers READONLY. Matchmaking skips the open-ticket check (because `external` is true) and `acquire` grants every attacker, so there is no defender lock at all for the length of the incident; the documented degradation is "fall back to tickets". Rate limits do fall back to memory. After one failed AUTH the client needs a process restart.
- Fix: treat OOM/READONLY/NOAUTH/quota answers as breaker trips (and drop the socket on READONLY/NOAUTH); on a failed hello destroy the socket and trip.

### DB-8 (LOW-MEDIUM): statistics watermark does not survive a restore
- Where: `server/migrations/0042_stats_commit_order.sql:12-13`, `server/stores/pg/growth.ts:120-129` (`txid > $1 and txid < $3`), `server/core/statsLocal.ts:78-113`, `tools/ops/restore.mjs:26`.
- Reproduction: a normal run summarized 1 id. With `stats_watermarks` set as a restore would leave it (5,000,000 above the cluster's current transaction id) a new id's events gave 0 summaries; `stats_installs` held 1 of 2 ids; the watermark stayed.
- Failure scenario: a logical restore (the drill's path, the runbook's path, a move to another database host) starts a cluster whose transaction ids begin near zero. The rollup reads nothing every hour until the new cluster has used as many ids as the old one. `stats_installs` and `stats_daily` (D1/D7/D30, the soft-launch gates) stop moving, with no error.
- Fix: when the horizon is at or below the watermark, reset the watermark to 0 (summaries are idempotent); check it in `restore-check.mjs`.
- Not verified: an actual `pg_dump`/`pg_restore` into a second cluster (the watermark was set by hand).

### DB-9 (LOW-MEDIUM, source only): lock order inversion
- Where: `server/core/pvp.ts:908-915` (`tx.updatePlayer(defender.id, ...)`, then `applyServerResult(tx, ctx, defender, ...)` which locks `villages[D]`), `server/core/village.ts:301-306,353,113-119` (the defender's batch locks `villages[D]`, then `refreshBase` updates `players[D]`); the batch takes no `lockPlayer(me.id)`.
- Failure scenario: a defender who is playing sends a batch while a raid on them settles. Each holds the row the other wants; Postgres ends one after `deadlock_timeout` (1 s) with 40P01: a 500 and a retry for the attacker's report or the defender's batch.
- Fix: take `lockPlayer(me.id)` first in the batch transaction, or write the defender's village before the defender's player row.
- Not verified: not reproduced; how often `refreshBase` writes for a real batch.

### DB-10 (LOW, source only): backup workflow
- Where: `.github/workflows/backup.yml:59-60` (secret unset: "nothing to back up", `exit 0`, the upload and drill steps are skipped: a green scheduled run with no backup), `tools/ops/restore-check.mjs:33-39` (`select v.player_id, v.file, ...` joined per resource: the ~290 KB village file comes back once per resource per village, all held in memory), `tools/ops/backup.mjs:22-27` and `restore.mjs:16` (`readFileSync` of the whole dump; fails above 2 GiB).
- With the secret set, the job dumps the real database and the drill restores that dump into the throwaway `postgres:16` service, checks it and starts the server on it; that part is sound.
- Fix: fail or warn the scheduled run when the secret is missing; select `v.file->'village'->'resources'` only; stream the cipher.
- Known nearby: "backups to GitHub artifacts will not scale" is an owner item (`WORLDWIDE_AUDIT.md:299`, `SHIPPING.md:246-247`).

### DB-11 (LOW, source only): tables with no retention outside the documents
- Not pruned and not in `docs/store/PRIVACY.md` or `server/core/retention.ts`: `raid_pairings` (one row per Alliance per week with the opponent's roster and bases), `raid_attacks`, `raid_claims`, `squad_wars` (both rosters with bases per war), `squad_war_attacks`, `squad_war_relays`, `squad_war_claims`, `refund_notices`, `referral_rewards`, `duel_tallies`, `stats_daily`, `groves` (no delete when the last member leaves; its chat stays), `name_holds` (rows stay after `until`; the privacy table says the old-name hold lasts 35 days, and a deleted player's former names stay under the deleted-player id).
- The first two groups are the growth driver of DB-1.
- Fix: prune wars, pairings and their rows after a fixed period; delete `name_holds` past `until`; delete an Alliance with no members.

### DB-12 (LOW, source only): Gang War reminders
- Where: `server/core/gangWars.ts:387` (`activeWars(t, 500)`), `server/stores/pg/gangs.ts:79-81` (`where ends_at > $1 order by ends_at limit $2`; no index on `ends_at`, table never pruned).
- Failure scenario: with more than 500 wars running, only the 500 ending soonest are read every 5 minutes, so "battle day begins" (due 22 h before the end) is pushed hours late or just before "2 hours left"; each run scans all wars ever stored.
- Fix: an index on `squad_wars(ends_at)`; page through all active wars, or select the wars whose reminder is due.

## 3. Checked and found sound
- Rate limits while Redis is down are not open: they fall back to a per-instance `MemoryRateLimiter` divided by `RATE_LIMIT_INSTANCES` (`server/shared.ts:302-312`, `server/main.ts:215`; confirmed in the OOM run: the limiter still answered).
- Redis client reconnects after a dropped or refused connection: 500 ms command timeout, 1 s connect timeout, 1 s fail-fast window, pending commands rejected, parser reset per connection.
- Worker pool: bounded queue (200, then 503 busy), a 15 s timeout replaces the worker, a crash replaces it once, timeouts count against the ticket; re-simulation and store receipt checks run before database transactions, not inside them.
- Shutdown order and deadline (`server/shutdown.ts`); tini as PID 1, non-root user, pinned base image, HEALTHCHECK (`Dockerfile`).
- Migration runner: polled advisory lock, checksums, per-file transaction, invalid concurrent index dropped before a retry.
- Retention deletes are batched by ctid with a time budget; a base version in use survives through `last_used_at` and the ctid recheck.
- A job that throws is logged and its timer keeps running (`server/main.ts:338-339`); two instances never both start a job in the same lease.
- Account deletion against migrations 0040-0049: `player_compliance`, `referral_rewards`, `player_installs`, `shared_replay_log` and `shared_replays` are cleared in `deletePlayer`; `village_parts` cascades; `stats_quota` and `reversed_attacks` hold no player id.
- Every metric an alert rule reads is emitted by the code.

Retention inventory, pruned tables: `attacks`, `tickets`, `base_versions`, `command_log`, `idempotency_keys`, handled `reports` (90 d), `purchase_intents` (90 d), handled `deletion_requests` and `complaints` (1 y), `store_notifications` (1 y), `auth_nonces`, `friend_requests` (14 d), `duels`, `duel_challenges` (30 d), `player_tokens`, `token_rotations`, `stats_events` (400 d), `stats_quota`, `stats_installs`, `stats_install_tz`, `shared_replays`, `shared_replay_log`, `reversed_attacks`. Kept by documented decision: `ledger`, `grove_chat`, `troop_requests`, `donations`, `player_notices`, `staff_actions`, `purchases`, `push_tokens`.

Not examined: GDPR data export/access support, PgBouncer compatibility of the pool's startup parameters, the deploy hook behind `server.yml`, the memory and Postgres adapters method by method (only `listGroves` and `claimJob` were compared), an EXPLAIN of every query.

## 4. Already known, skipped
- A1-A34 of `docs/audit/areas/06-backend-server.md` and their closure rows in `docs/store/WORLDWIDE_AUDIT.md:284-299,402,463-466,663-713`: unbatched retention (A18), `random()` matchmaking (A19), power board scans (A20), jobs on every instance (A21), concurrent index builds (A22), dormant accounts never pruned (A23), image contents (A26), CI pinning (A27), fail-open limiter (A8), no graceful shutdown (A9).
- Honor rank without Redis is `count(*)`: `WORLDWIDE_AUDIT.md:690`.
- Backups to GitHub artifacts will not scale; PITR is an owner step: `WORLDWIDE_AUDIT.md:299`, `SHIPPING.md:246-247`.
- Chat, notices and the staff log are kept for the account lifetime: `docs/store/PRIVACY.md:14,21,22`.
- Deleted player's id left in Gang War rows and stored bases: Beast Mode SEC-14 (`PROGRESS.md:94`).
- Metrics label cardinality: Beast Mode SEC-02.
- Idempotency keys are read before the handler and written after it, so two parallel requests with one key both run: seen in `server/app.ts:296-314,391-425`, outside this lens, not examined further.
