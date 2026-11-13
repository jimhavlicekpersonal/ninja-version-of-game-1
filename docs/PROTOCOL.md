# Kagemura multiplayer protocol (version 11)

> Current numbers (protocol, battle rules, save format) are in `docs/STATUS.md`, generated from the code. Sections below are the history of each version, newest first.

> Internal names (`grove`, `acorns`, `toadstool-kingdoms` in `/v1/hello`) are stable IDs from the original project and are kept on purpose. Player-facing names are in `docs/rebuild/ID_MAP.md`.

**Version 11 (balance audit 2026-11-08, `docs/audit/BALANCE_AUDIT_2026-11-08.md`; all additions, servers still accept 10, and 7 except `GET /v1/match`):**
- **Tempering (feature `tempering`, battle rules 6):** a base's buildings may carry `temper` (`{ reach?, blast?, watch? }`, whole points, at most `battle.temper.steps` in total, only the axes `battle.temper.types` lists for the type). An uploaded base is refused with `400` for a temper its type cannot take, for two buildings of one type with different tempers (the game tempers by type), or for any temper below `temper.unlockKeep`; zero axes are dropped when stored. Rules 6 plays an untempered base exactly as rules 5, so servers listed `supportedRules: [6, 5, 4]` (battle rules 7, 2026-11-11, changed what a Watch base does with no protocol change: servers list `[7, 6, 5, 4]` with rules 6 from the archived engine in `server/rules/v6`); an older game is matched only with bases legal under its own rules, so it never meets a tempered base. Generated outposts (a fallback when nobody fits) carry their rival clan's temper, or with `offers.counterShare` one against the family of the attacker's recent raids (known for a village the server keeps).
- **Declared stakes (feature `stakes`):** `POST /v1/attacks/start` `{ ticket, stake? }`: `stake` is a star count from `raids.stakes.byStars` (2 or 3), kept with the ticket's first start only (anything else is ignored), and echoed as `AttackStartResponse.stake`. It is fixed before the battle seed is sent. The raid is settled with it: reaching it carries the loot × `byStars[stake]`; missing it carries nothing, and a real defender loses nothing (its `DefenseView.result.loot` is empty). `AttackResponse.stake` says what the raid was settled with; the game passes it to `settleOnlineAttack`.
- **What a raid carries** (no protocol change; `src/gameplay/sim/carry.ts`): the attacker banks `result.loot` × `diversityShare` (Gini-Simpson diversity of the warriors that fought, by role) × the stake's multiplier. The defender loses `result.loot` (the battle's own loot) as before.
- **Staked honor:** a lost defence costs the defender `defenseHonorLossShare` (0) of the attacker's gain, still capped by `defenderDailyHonorLossCap`; a held raid pays the defender as before. `winTrophies` falls by `attackWin.perTrophyBelow` (0.25) a point against a base with less honor, down to 0.
- **Exposure targeting and exhausted stores:** among the candidates of a trophy range, villages raided within `matchmaking.exposureHours` (12) come after every one that was not (longest ago first). A real defender's loot on the ticket is × `raids.exhaustion.factor` (0.5) for each raid it lost (1+ star) in the last `windowHours` (24). Raiding a higher Keep applies `lootPenaltyUpByHallDiff` (0.9 one Keep up).

**Version 10 (ledger audit, docs/audit/STATE_OF_THE_GAME.md section 5 step 1; servers accept 7, except `GET /v1/match`, which needs 10):**
- **The battle seed comes when the raid starts:** `GET /v1/match` no longer sends `seed`. `POST /v1/attacks/start` `{ ticket }` → `{ started: true, seed }` (feature `seed-at-start`; the same seed on a retry; `409` for a used ticket, `410` for an unstarted one past its hour). The game asks on Attack and does not begin the battle without the answer. `GET /v1/match` from a game older than 10 gets `426 version_mismatch`.
- **Unreported raids count sooner:** a started raid with no report `REPORT_GRACE_MS` (8 minutes) after Attack is settled as a 0-star loss (honor and Attack Rating) when its attacker next asks for a match; its late report then gets `410`. The game sends its waiting reports before it asks (`Connection.sendReportsBeforeMatch`). The hourly sweep still settles the rest 72 hours after the ticket's hour.
- **Rerolls cost Next for server-held villages:** a new opponent needs a new scout in the village (the free first look after a raid, or a paid Next, both replayed from the game's `scout` command). Asking again with the same scout gets the same open ticket back; with no scout at all, `409`.
- **Under-18 cap at redeem:** a receipt with no open intent of this player (none, an already used one, a pruned one) is credited only if the month leaves room under the cap; otherwise `403 purchase_refused`, nothing credited, and the store transaction stays unfinished.
- **Village import by account age:** above Keep 5, `POST /v1/village/import` needs an account at least half as old as the days the regular model player took to reach that Keep (Keep 6: 5.2 days … Keep 15: 60.6), else `403 cooldown` with the wait in the message (the game tries again a day later). Imports also have a per-IP limit (`villageImport`, 60 an hour).
- **Gang War chests:** `POST /v1/squad/war/claim` answers `generated: true` for a war against a generated Gang; its chest pays no Jade, and the game applies `claimGangChest` with `generated`.

**Version 9 (roadmap steps 57 and 62-70; servers still accept 7):**
- **Battle rules 3:** `BattleSetup.startDamage` (relay strikes). Rules 3 plays every rules 2 battle exactly, so servers list `supportedRules: [3, 2]` and keep serving rules 2 games; only relay strikes need 3 (`426` otherwise).
- **`503 busy`:** the server's battle-checking queue is full or a worker failed (step 57). The game retries it like any server error; queued reports stay in the outbox.
- **Friendly Duels** (feature `duels`): `POST /v1/duels/ticket` `{ friendId, layout?: live | duel, challengeId? }` → `{ ticket, seed, base (no loot), opponent, layout, expiresAt }` (friends only); `POST /v1/duels` (a `BattleSubmission`) → `{ duelId, result, rivalry, challenge? }`; `GET /v1/duels?since=` → `{ duels (both ways, with replays), rivalries }`; `PUT /v1/duels/layout` `{ base | null }`; `POST /v1/duels/challenges` `{ friendId }` and `GET /v1/duels/challenges` (each side attacks once within 24 h; more stars, then destruction, wins). Duels never change honor, loot, ratings, shields or the army.
- **Gangs** (feature `gangs`): `GET /v1/squad` → `{ squad, invites, canJoinAt }`; `POST /v1/squad` `{ name }`; `POST /v1/squad/invites` `{ friendId }` (leader; friends of the leader only); `POST /v1/squad/invites/:id` `{ accept }`; `POST /v1/squad/leave`; `POST /v1/squad/leader` `{ playerId }`; chat `GET|POST /v1/squad/chat` and troop requests `GET|POST /v1/squad/requests`, `POST /v1/squad/requests/:id/donate` (the same rules as the Alliance's; gifts arrive in `/v1/grove/inbox`; report Gang chat with `kind: 'chat'`). 2-4 members; 24 h before joining another Gang after leaving; rosters locked during a war.
- **Gang Wars** (feature `gang-wars`): `GET /v1/squad/war` → `{ war, queued, recent }`; `POST|DELETE /v1/squad/war/queue` (leader); `POST /v1/squad/war/base` (prep: copy my village in again); `POST /v1/squad/war/ticket` `{ target, relay? }` → `{ ticket, seed, base, startDamage?, expiresAt }` (`409 conflict` while a Gang mate holds that relay); `POST /v1/squad/war/attacks` (a `BattleSubmission`, re-simulated with `startDamage` for a relay); `POST /v1/squad/war/claim` `{ warId }` → `{ warId, outcome, alreadyClaimed }`. The game banks the chest with `claimGangChest` once per war.
- **Pushes** add the types `friends`, `gang` and `gangWar` (players switch each on or off).

**Version 8 (roadmap Phase 1.5 and steps 59-61; servers still accept 7):**
- **Game versions:** every request also carries `X-Data-Version` (`dataVersionOf` the balance data, `src/backend/net/dataVersion.ts`); battle reports carry `rules` and `dataVersion`. Each ticket records the rules and data version it was issued under, and the report is re-simulated with that engine (`server/rules/registry.ts`). A report with other rules than its ticket is refused (`bad_request`). `/v1/hello` adds `supportedRules` (newest first), `dataVersion` and, when set, `minClientBuild`; a game whose `SIM_RULES` is not listed, or whose build is older, must update (requests get `426 version_mismatch`; the game shows "Update Kagemura"). Feature `rules-versions`.
- **Balance bundles** (feature `balance-bundles`): `GET /v1/balance` (no token) → `{ bundle, cohorts? }`, a signed list of changes to existing non-combat numbers (`src/backend/net/balanceBundle.ts`). The game checks the signature against its built-in key and every rule, keeps it, and uses it from its next start. `cohorts` (report section 5 step 5) are experiment arms: bundles with `cohort: { experiment, arm, from, to }` that repeat `bundle`'s changes and may add only offer-timing changes (`checkCohort`); a game that shares play statistics takes the first arm whose buckets hold `cohortBucket(experiment, statistics id)`, every other game takes `bundle`. The server plays `bundle`'s numbers for everyone.
- **Play statistics** (feature `stats`, report section 5 step 5): `POST /v1/stats` with **no token** `StatsBatch` `{ install, build, arm?, events: [{ name, at, props }] }` (≤ 200 events) → `{ accepted }`; `DELETE /v1/stats?install=` → `{ deleted }`. `install` is a random UUID made for statistics, never the player id. The server keeps only the events and fields of `STATS_EVENTS` (`src/backend/net/stats.ts`; anything else is dropped), puts an event more than 30 days old or an hour ahead at its arrival time, stores no IP address and writes no request log line for these routes; per-IP rate rule `stats`. Games send only after an adult player said yes (`src/backend/analytics/share.ts`).
- **Unique names** (feature `unique-names`): 3-18 characters, letters, digits, single spaces, `_`, `-`, starting with a letter; case and space/`_`/`-` don't make a new name (`src/backend/net/names.ts`). `POST /v1/players` gives the closest free name if the asked one is taken or not allowed. `PUT /v1/me` is strict: `400 bad_request` (not allowed) or `409 name_taken`, both with `suggestions`; `429 name_cooldown` within 28 days of the last change (capitals are free). `PlayerView` adds `nameChangeAt` and `staff`.
- **Friends** (feature `friends`): `GET /v1/friends` (my code, friends, incoming and outgoing requests, privacy), `GET /v1/players/lookup?name=` (exact name; 404 "No player with that name" also when they hide), `GET /v1/players/code/:code`, `POST /v1/friends/requests` `{ name | code | playerId }` → `{ status: 'sent' | 'friends' }` (asking someone who asked you makes you friends), `POST /v1/friends/requests/:id` `{ accept }`, `DELETE /v1/friends/requests/:id` (take back), `DELETE /v1/friends/:id`, `PUT /v1/me/privacy` `{ findable: everyone | friends_of_friends | nobody, showOnline }`. Lookups and requests are rate limited per minute and per day. Requests lapse after 14 days; at most 100 friends. A block ends the friendship and hides both players from each other.
- **Platform friends** (feature `platform-friends`): `POST /v1/friends/platform` `{ provider: gamecenter | playgames, ids }` → `{ players }`, only for a player who linked that platform; at most 300 ids.

**Version 7 (roadmap step 26, the server owns the economy):** servers say `minProtocol: 7`; a game older than that is told to update.
- **Every request** carries `X-Protocol` (7), `X-Sim-Rules` (`SIM_RULES`), `X-Client-Build` (`<version>+<platform>`), and every write an `Idempotency-Key` (a fresh id per action). A request whose `X-Protocol` is below `minProtocol` gets `426 version_mismatch` (except `/v1/hello`, so the game can learn why). Requests without the header (tools, webhooks, the deletion page) are served as before.
- **Idempotency:** a write repeated with the same key by the same player gets the first answer back (`Idempotent-Replay: true`), for a day. Refusals are not remembered, so a corrected request can reuse its key. The stored answer is looked up only after the rate limits and the token check (re-audit), so an unknown, suspended or deleted token gets its own `401`/`403`, never a replay.
- **The game keeps its village on the server:** when it connects to a server with `village-import`, it moves its village there (`POST /v1/village/import`). A village the server refuses stays on the device and Settings shows why. Everything below marked as a `/v1/hello` feature (steps 10–25) is part of protocol 7.

**Version 6, server hardening (2026-11, roadmap Phase 1):** additions that keep protocol 6 for clients that use them.
- **Server-owned village (beta, feature `server-economy`, roadmap Phase 2).** `POST /v1/village` starts keeping the player's village on the server (a new one; an existing village moves with `POST /v1/village/import`, roadmap step 25, "Moving a village" below), `GET /v1/village` returns it (`404 no_village` while it lives on the device). The game then sends what the player does as numbered commands (`POST /v1/village/commands`); the server replays them with the shared simulation and answers with its economy hash, plus `corrections` (the server's economy) when the game's differs. See "Server-owned village" below.
- **Ratings (roadmap Phase 3).** Hidden Attack and Base Ratings (`src/gameplay/sim/rating.ts`) steer matchmaking: after the Keep window and power floor, the base whose expected score is nearest 55% is offered. Battles against generated bases never move a rating. A defender loses at most `defenderDailyHonorLossCap` honor a UTC day (`DefenseView.trophies` is what was really lost). `GET /v1/leaderboard/power?limit=` → `{ players: [{ rank, name, power, hallLevel, grove }], me: { rank, power, battles } | null }` (feature `power-ranking`).
- **Linked sign-ins (cloud save).** `GET /v1/links` (providers this server checks, and the player's links), `POST /v1/links { provider, credential }`, `DELETE /v1/links/:provider`, and `POST /v1/sessions { provider, credential, device? }` (no token) → `{ playerId, token }` for the linked player: a new token for this device, the others keep theirs. Credentials: apple/google `{ idToken }`, gamecenter `{ teamPlayerId, bundleId, timestamp, salt, signature, publicKeyUrl }`, playgames `{ serverAuthCode }`. Only the provider's stable id is stored. A sign-in linked to another player is `409 conflict`; an unlinked one at `/v1/sessions` is `404 not_found`.
- **Purchases (roadmap Phase 4; features `purchases-apple`, `purchases-google`).** Before paying, `POST /v1/purchases/intent { store, productId, under18 }` → `{ accountToken, storeProductId }`: the server refuses with `403 purchase_refused` (nothing charged) when the store is not set up there, the age group is unknown, or a player under 18 would pass `minorMonthlyCapUsd` this UTC month (counting purchases on every device and intents still holding: 30 minutes from the ask, ended by a cancel, 7 days while pending). The game pays with `storeProductId` and passes `accountToken` to the store (Apple `appAccountToken`, Google `obfuscatedAccountId`). The check and the reservation happen in one locked step per player (Postgres advisory lock, worldwide audit GLOBAL-004), so simultaneous intents cannot both pass the cap. The server keeps the age group a player stated (`player_age`, migration 0018): once under 18 it stays under 18 whatever a device sends (GLOBAL-006; staff can clear it with `POST /admin/v1/players/:id/reset-age` after a support check). `POST /v1/purchases/intent/release { accountToken, outcome }` (GLOBAL-005): `cancelled` (the store said the player cancelled; nothing was charged) ends the intent's hold at once, `pending` (Ask to Buy, a cash payment) holds it for 7 days so a late approval still counts; only the player's own unused intents change (`{ changed }`). Then `POST /v1/purchases { store, storeProductId, receipt }` (Apple: the transaction's JWS; Google: the purchase token) → `{ transactionId, productId, usd, heldOnServer, already }`. Each store transaction is credited once; a retry answers `already: true`; someone else's receipt is `409 conflict`; a forged, refunded or unknown one is `400 bad_request`. A server-held village gets it at once (ledger `purchase:<store>`); otherwise the game delivers it under `transactionId`. Only then does the game finish the store transaction. `GET /v1/purchases` lists the player's purchases (`credited` or `refunded`). Refunds arrive at `POST /v1/webhooks/apple` (App Store Server Notifications v2, `{ signedPayload }`) and `POST /v1/webhooks/google` (Pub/Sub push with an OIDC token), plus Google's Voided Purchases API hourly; a server-held village gives back what is still there (`refund:<store>`). `grantPurchase` is no longer a player command.
- **Server push (feature `push`).** `PUT /v1/push/tokens { token, platform: 'ios'|'android', types, tzOffsetMinutes }` registers this device (types are `notifications.json` ids; the server pushes `raided`, `donations` and `groveRaid`); `DELETE /v1/push/tokens?token=` stops it. Never in the device's quiet hours, at most `maxPerDay` a local day.
- **Suspensions.** Staff can suspend an account (`403 banned`, with the reason and the end time in the message); a suspended player is not matched and not on the leaderboards. The game shows "Suspended" and tries again on its next start.
- **Operators' notice.** `/v1/hello` may carry `notice` (maintenance, an incident); the game shows it in Settings → Online play.
- **Test servers.** `/v1/hello` carries `environment: 'staging' | 'development'` on a server that is not production; the game says so in Settings.
- **Observability.** `BattleSubmission.clientHash` (optional) is the result hash the client's own simulation got; the server counts and logs a difference as a desync and never trusts it. Every answer carries `x-request-id` (a caller's own well-formed id is kept), so a player's report can be matched to the server log.
- **Reports and blocks** (Apple 1.2). `POST /v1/reports` reports an Alliance chat message (the server keeps its text as it was) or a player; `POST /v1/blocks`, `DELETE /v1/blocks/:id`, `GET /v1/blocks`. A message reported by 3 different players is hidden for everyone until staff decide; `ChatResponse.hidden` lists recently hidden ids so clients drop them. Blocked players' messages and troop requests are left out for the blocker. A muted player's chat gets `403 muted`. `/v1/hello` lists `reports` and `blocks`.
- **Account deletion.** `DELETE /v1/me` deletes the caller's online account (`204`); its token stops working. Players who can't open the game use the web page `GET /account/delete`, which sends `POST /v1/account/deletion-requests` for staff to verify. `/v1/hello` lists `account-deletion`.
- **Rate and size limits.** Too many requests get `429 rate_limited` with a `Retry-After` header (seconds); the game treats it as "try again later", never as a refusal, so a rate-limited battle report stays in the outbox. Request bodies are capped (16 KB, base uploads 128 KB, battle reports 256 KB; more is `413`), and chat messages at 200 characters.
- **Server-issued battle seeds.** `MatchResponse.seed` and `RaidTicketResponse.seed` carry the battle seed the server chose for the ticket. The client plays the battle with it and sends it back as `BattleSubmission.seed`; the server re-simulates with its own seed, and a report with any other seed is refused with `400 bad_request` (a player-facing "update the game" message), without using up the ticket. A client facing an older server that sends no seed picks its own. `/v1/hello` lists the `server-seed` feature.

**Version 6 (gameplay audit fixes):** clients and servers must upgrade together (`minProtocol: 6`), because the battle rules changed (`SIM_RULES` 2: counters are off while upgrading, wall-breakers target the wall in the way, the Siege Bombardier fires on defenses, healers break walls, rebalanced Throwers and kites).
- `BattleSubmission.reinforcements` lists donated troops in the army with the level each was donated at; they deploy first at that level. `DefenseView` carries `reinforcements` and `rules`.
- A used ticket stores its answer. Reporting the same battle again returns that same answer (no `409`), so a client that lost an answer can always recover it, and nothing is applied twice.
- The client banks an online attack's loot and honor only from the server's answer. A refused report (expired ticket, failed check) becomes a practice result on the client. A raid (`pvp` ticket) may be reported up to 72 hours after its ticket expired (`LATE_REPORT_MS`, worldwide audit R02), so a connection lost after the battle does not cost its loot; other tickets keep their deadline.
- Uploaded bases must be legal for their Keep, and armies must be trainable at the attacker's Keep (see PvP rules).
- Alliance Wars pair equal rosters, cap each side's attacks at roster × allowance, and break star ties by destruction.

**Version 5 (defensive counters, Infiltration Points):** the server re-simulates every attack with the five live counter buildings and with Infiltration Points on (`BattleSetup.infiltration: true`): warriors only enter inside the base's points, each hiding about a third of the army; off-point deployments are dropped, exactly as in the game. `DefenseView.infiltration` is `true` on attacks recorded under this rule, so replays use it. The server advertises `minProtocol: 5` and the `defense-counters` feature.

**Version 4 (playable roster):** all 50 warriors and Keep levels 1–15 are supported. The server advertises `minProtocol: 4` and the `warriors-50` feature. Deployments still use `{ tick, troop, x, y }`; new troop IDs are listed in `troops.json`. Summons, auras, poison, burning, resurrection, shields and defense control reconstruct from seed + deployments using the shared simulation. Summons never appear in submitted inventory. Army validation checks `unlockKeep`; research validation subtracts each troop's `levelCapOffset`. Clients and servers must upgrade together.

Version 3 introduced tactical ability deployments: `{ tick, troop: "smoke_bomb", x, y }` throws a Smoke Bomb. Charges are derived from the submitted army.

This is what the game expects from a multiplayer server. Our server in `server/` implements it. A future server can be anything, in any language or on any database, as long as it speaks this protocol and passes the contract tests.

- **Types:** `src/backend/net/protocol.ts` has every route, request and response. This page explains them.
- **Contract tests:** `tests/backend/contract/protocol.contract.test.ts` checks a running server through the game's own HTTP adapter:

  ```bash
  CONTRACT_URL=https://your-server.example.com npm run test:contract
  ```

  On Windows PowerShell, run `$env:CONTRACT_URL="https://your-server.example.com"; npm run test:contract`. The tests leave a few players and a Grove named "Contract …" behind, so use a staging server if you can.

## How the game is split into ports

```
 game (browser / iOS / Android)                     server
 ┌───────────────────────────────┐                 ┌────────────────────────────────────┐
 │ App, Grove screen, Settings   │                 │ server/app.ts      HTTP adapter    │
 │        │                      │   protocol v6   │ server/inProcess.ts  (tests)       │
 │ Connection (outbox, sync)     │ ──────────────▶ │        │                           │
 │ GroveSource (local | remote)  │  JSON over      │ server/core/   every rule, no HTTP │
 │        │                      │  HTTPS          │        │                           │
 │ ServerPort ── HttpServerAdapter                 │ Repo port: MemoryRepo | PgRepo     │
 └───────────────────────────────┘                 └────────────────────────────────────┘
```

- **`ServerPort`** (`src/backend/net/ports.ts`) is everything the game needs from a server. The game only talks to this interface.
  - `HttpServerAdapter` implements it over HTTPS.
  - `InProcessServerAdapter` implements it by calling our server core directly.
- **`Connection`** (`src/backend/net/connection.ts`) handles registration and status. It brings server results into the village as idempotent commands, and keeps battle reports in an outbox until the server accepts them.
- **`GroveSource`** (`src/backend/social/groveSource.ts`) gives the Grove screen one view model, whether the Grove is the offline bot Grove or a real Grove on a server.
- **Server core** (`server/core/`) holds every multiplayer rule. It needs two things from outside:
  - a `ServerContext`: clock, ids, token hashing, randomness;
  - a `Repo` storage port.

### Three ways to build a future server

1. **New database, same rules.** Keep `server/core` and `server/app.ts`, and write a new `Repo` adapter (for example DynamoDB, Firestore or SQLite). Add its factory to `tests/backend/server/pg.ts`, and `tests/backend/server/repo.test.ts` plus `tests/backend/server/core.test.ts` will check it.
2. **New hosting, same rules.** Keep `server/core` and write a new HTTP adapter for another framework or a serverless platform. It should be about as thin as `server/app.ts`. Then run the contract tests against it.
3. **From scratch.** Implement this document in any language, then run the contract tests against it. The one hard part is battles: the server must replay them exactly like the game (see below).

## Basics

- **Transport:** JSON over HTTPS. Native apps need HTTPS; iOS and Android block plain HTTP.
- **Auth:** `POST /v1/players` returns a `token`. Send it on every other call as `Authorization: Bearer <token>`. Store only a hash of it.
- **CORS:** allow `Authorization` and `Content-Type` headers, and the methods `GET, POST, PUT, DELETE, OPTIONS`; expose `Retry-After` and `X-Request-Id`. Allowed origins:
  - the web game (GitHub Pages);
  - `capacitor://localhost` (iOS app);
  - `https://localhost` (Android app);
  - or simply `*`, which is safe because no cookies are used.
- **Errors:** an HTTP status plus `{ "error": ErrorCode, "message": "…" }`. The client shows `message` to players, so write it for players.

  | code | status | meaning |
  |---|---|---|
  | `unauthorized` | 401 | missing or unknown token |
  | `bad_request` | 400 | malformed input, or something the rules forbid (impossible base, army too big, …) |
  | `not_found` | 404 | unknown ticket, Grove, request, enemy base, or a raid the player did not take part in |
  | `conflict` | 409 | a ticket that was already used |
  | `expired` | 410 | a ticket used too late |
  | `cooldown` | 429 | too many chat messages, or asking for troops again too soon |
  | `full` | 409 | the Grove is full, or the request has no room for those troops |
  | `not_in_grove` | 404 | a Grove call by a player who is not in one |
  | `already_in_grove` | 409 | creating or joining while already in a Grove |
  | `raid_not_live` | 409 | a Grove Raid ticket outside the raid |
  | `raid_not_ended` | 409 | claiming a chest before the raid ends |
  | `no_attacks_left` | 409 | both Grove Raid attacks used, or joined after the raid started |
  | `muted` | 403 | a moderator paused this player's chat (the message says for how long) |
  | `no_village` | 404 | the player's village lives on the device, not on the server (server-owned village routes) |
  | `purchase_refused` | 403 | a purchase is not allowed (under-18 monthly cap, age group unknown, or the store is not set up on this server); nothing was charged |
  | `banned` | 403 | staff suspended this account from online play; the message says why and until when |
  | `rate_limited` | 429 | too many requests; wait `Retry-After` seconds (the header is exposed to the web game through CORS) |

  - **Retries:** the client retries network errors, 5xx answers and `rate_limited` (on its next round, not at once). It never retries other 4xx answers.
- **Limits (our server; other servers may choose their own):**

  | what | limit |
  |---|---|
  | every request, per IPv4 address or IPv6 /64 | 3,000 a minute |
  | every request, per player token | 240 a minute |
  | new players and sign-ins (`POST /v1/players`, `/v1/sessions`), per IPv4 address or IPv6 /64 | 300 an hour |
  | opponent searches and war tickets, per player | 30 a minute |
  | battle reports (re-simulated), per player | 20 a minute |
  | village command batches, per player | 30 a minute |
  | battle commands in village batches (`trialEnd`, `abandonBattle`), per player | 3 a batch, 6 a minute (`TOO_MANY_BATTLES`) |
  | purchases (intent, release, receipt, history), per player | 120 an hour |
  | reports, blocks, links, push tokens, Gangs, duel challenges, per player | 30 an hour |
  | request body | 16 KB; `PUT /v1/base` 128 KB; battle reports and command batches 256 KB (`413` above) |
  | one village command | 8 KB; battle commands 192 KB (`TOO_LARGE`) |
  | chat message | 200 characters (`400 bad_request` above) |

  The per-IP limits are deliberately loose: carrier-grade NAT puts thousands of phones behind one IPv4 address in much of the world, so the per-token limits do the real work. With Redis (`REDIS_URL`) every instance shares one budget; without it each instance counts its own (N instances allow up to N times as much). While Redis is down the limits fail open rather than refusing everyone. Behind a load balancer the server must see each player's own IP address (`TRUST_PROXY` as a hop count or the proxies' CIDRs, never `true`; `docs/SHIPPING.md`), or all players share one per-IP budget.
- **Compression:** answers over 1 KB (JSON, text) are sent with `Content-Encoding: br` or `gzip` when the request's `Accept-Encoding` allows it (`Vary: Accept-Encoding`); a village file of ~290 KB becomes a few KB. Browsers, WebViews and Node's `fetch` decode it themselves; a port must send `Accept-Encoding` only for encodings it decodes. Request bodies are not compressed.
- **Versioning:** `GET /v1/hello` reports `protocol` and `minProtocol`. The game refuses a server whose `minProtocol` is above the game's version, or whose `protocol` is below it. Bump `PROTOCOL_VERSION` in `protocol.ts` for any change that would break older clients.
- **Time:** all times are epoch milliseconds, taken from the server's clock.

## Battles must replay exactly

The client plays a battle locally and sends `{ ticket, seed, army, levels, reinforcements, deployments, endTick }`. The seed is the one the server issued with the ticket (`MatchResponse.seed`, `RaidTicketResponse.seed`), so a client cannot try seeds offline and report the luckiest. The server re-runs the battle from the ticket's base and its own seed with `runBattle` from `src/gameplay/sim/battle/battle.ts`, and the server's result is what counts. The client records the attack as pending and banks the loot and honor from the server's answer (`settleOnlineAttack`); a permanently refused report becomes a practice result with no loot or honor.

- The battle simulation is deterministic: fixed 10 ticks per second, a seeded random generator, and JavaScript number math (IEEE-754 doubles) done in a fixed order. A port must do the same operations in the same order.
- A server written in another language must either run this TypeScript code (for example a small Node sidecar) or port it exactly.
- The contract test compares the server's `result.hash` with the game's own replay.

Every battle report must also be checked:

- Own troops (army minus `reinforcements`) are trainable at the attacker's Keep (`troopEarliestKeep`: the troop's Keep gate and the Keep that allows its Dojo level) and fit full Army Camps at that Keep.
- Donated troops fit the largest Lodge at that Keep, and their levels are at most the highest research cap any donor could have.
- Troop levels are at most `troopLevelCap` for the attacker's hall.
- At most 2,000 deployments. A deployment whose `troop` is an ability id (battle.json `abilities`) is an ability use, limited by its charges. Ability uses never count as troops used.
- Each ticket is used once. A repeated report of a used ticket gets the stored answer back.
- `seed` must equal the ticket's seed; anything else is `bad_request` and leaves the ticket unused. (Tickets issued before server seeds have none and keep the client's seed.)

## Endpoints

### Identity

| | request | response |
|---|---|---|
| `GET /v1/hello` | | `HelloResponse` `{ name: "toadstool-kingdoms", protocol, minProtocol, serverTime, features[] }` |
| `POST /v1/players` | `{ name }` | `201 { playerId, token }` |
| `GET /v1/me` | | `PlayerView` `{ id, name, trophies, hallLevel, shieldUntil, groveId }` |
| `PUT /v1/me` | `{ name }` | `PlayerView` |
| `DELETE /v1/me` | | `204` (the online account is deleted; the token stops working) |
| `POST /v1/account/deletion-requests` | `{ playerId?, name?, code?, note? }` (no token; `contact` is ignored) | `202 { id, verified }` |
| `GET /account/delete` | | the web deletion page (HTML), for store listings |
| `POST /v1/me/deletion-code` | | `{ code: "XXXXX-XXXXX", expiresAt }` (feature `deletion-codes`; one at a time, 30 days, only its hash is kept) |
| `PUT /v1/me/rules` | `{ version }` | `{ version }`: the community rules version this account accepted (feature `rules-acceptance`, report section 5 step 7). Chat, creating an Alliance or Gang and renaming answer `403 rules_required` until it is the current `COMMUNITY_RULES_VERSION`. |
| `PUT /v1/me/age` | `{ band: 'under13' \| '13to17' \| 'adult' \| null }` | `{ band }`: the strictest band the server keeps (feature `age-bands`) |
| `GET /v1/notices` · `POST /v1/notices/read` | · `{ ids }` | `{ notices: [{ id, at, kind, text, read }] }` · `204` (feature `notices`) |
| `POST /v1/sessions/revoke-others` | | `{ revoked }`: every other device token of this account is signed out (feature `sessions`) |
| `POST /v1/webhooks/apple-signin` | `{ payload: JWT }` (Apple, no token) | `{ ok: true }`; `consent-revoked` unlinks Apple, `account-delete` deletes the player |

- New players start with `ranks.startingTrophies` and a shield of `raids.newPlayerShieldHours`.
- Names are trimmed, filtered for bad words, and 2–24 characters long. Anything else becomes "Ruler".
- **Deleting an account** (`DELETE /v1/me`, Apple 5.1.1(v)) leaves the player's Alliance (leadership passes on; the notice does not name them) and deletes the player, their shared base, tickets they hold, raids on them, their chat lines, troop requests and gifts to them, war claims and Alliance notices naming them. What other players keep stays without the name: replays of raids they made (attacker "Deleted player"), troops they gave, war rosters and war attacks (a war's score must not change). Copies of their base inside other players' recent tickets go with the 30-day retention. The game also turns its pending online attacks into practice results and switches online play off on that device, so it does not quietly register a new player.
- **Deletion requests from the web** (`POST /v1/account/deletion-requests`, 5 an hour per IP address) need a `playerId` (or a `name`) and, to be carried out, the one-time `code` from Settings (`POST /v1/me/deletion-code`): Player IDs are visible to other players, so an ID alone proves nothing. A request with a valid code answers `verified: true` and uses the code up; anything else answers `verified: false`, whether or not the player exists. Staff carry out only verified requests (an unverified one needs `override` with a note saying how ownership was checked); the admin API is our server's, not part of this protocol.
- **Report section 5 step 8 (battle rules 5):** `BattleSubmission.hero` `{ id, level }` names the clan hero the attacker brought (the Shadow Captain from Keep 7, level = Keep − 6); the server accepts the hero its record of the attacker's Keep allows, with one Keep of slack, and refuses anything else (`400 bad hero`). Attack records and `DefenseView.hero` keep it for replays. Rules-4 games (no hero) are served by the archived rules 4. A generated base carries `base.rival` (a computer rival clan's id) and is still `opponent.kind: 'bot'`.
- **Report section 5 step 7:** names (players, Alliances, Gangs) are refused when they carry a link, an address, a number to call or a messaging-app handle, also written around the filter ("d1sc0rd"); chat replaces them. A friend request by `playerId` follows the search rules (findability, under 13, suspended, blocks) unless the two are tied (the other asked first, same Alliance or Gang). Deleting an account drops its stored idempotent answers at once and keeps its name taken for 35 days. An App Store `RESCIND_CONSENT` notification suspends online play for the account it can be traced to.
- **Age bands** (re-audit): the game sends the band from its age screen or the store's age signal before it registers or goes online. The server keeps the strictest one it heard (an `adult` after a minor band is ignored; staff can reset it). `under13`: chat accepts only the `PRESET_CHAT` phrases, and the `PRESET_CHAT_RETIRED` ones older games still offer ("troops" became "warriors" in the remnant audit, 2026-11-06) (`403 age_restricted` otherwise), no renames (`403 age_restricted`), never found by name or in platform-friend lists, `findable` stays `nobody`. `13to17`, the first time it is stated: `findable` `friends_of_friends` (if it was `everyone`) and `showOnline` off; later choices are kept.
- **Notices** (EU DSA art. 16(5)/17): when staff act on a report, each reporter gets the outcome and the affected player gets the decision, the reason and how to appeal (`SUPPORT_CONTACT`); suspensions add one too. A muted chat send (`403 muted`) says the reason and until when.
- **Sessions**: each device token remembers the sign-in that made it; unlinking that provider signs those devices out (not the one asking). Extra device tokens unused for 400 days are deleted by retention; the first device's token is the account itself and stays.

### PvP

| | request | response |
|---|---|---|
| `PUT /v1/base` | `{ base: BaseLayout }` | `204` |
| `GET /v1/match` | | `MatchResponse` `{ ticket, seed, base, opponent: { name, trophies, hallLevel, kind }, expiresAt }` |
| `POST /v1/attacks/start` | `{ ticket, stake? }` | `{ started, seed, stake? }` |
| `POST /v1/attacks` | `BattleSubmission` | `AttackResponse` `{ attackId, result, trophies, playerTrophies, stake? }` |
| `GET /v1/defenses?since=` | | `{ defenses: DefenseView[] }` (raids on this player after `since`, oldest first, at most 20; kept for 30 days) |
| `GET /v1/leaderboard?limit=` | | `{ players: [{ rank, name, trophies, hallLevel, grove }], me }` |

Rules: these come from the matchmaking design in `src/gameplay/sim/matchmaking.ts` and the balance data in `src/gameplay/data/`.

- **Base upload:**
  - Refuse impossible bases: unknown buildings, bad levels, buildings off the map or overlapping, duplicate ids, anything other than exactly one Clan Keep, bad loot values, more buildings of a type or higher levels than the Keep allows (`hall.json` limits), and any field outside the allowed shape (a `power`/`wallPower` multiplier or a label is never accepted from a player).
  - Drop loot from buildings that cannot hold it (only a collector holds what it produces; only a storage or the Keep holds what it stores; Jade is never loot).
  - Then cap the loot:
    - each collector at `ratePerHour × collectorHoursCap × raidableUncollectedFraction`;
    - storages together at `storageLootCapByHall[hall]` per resource, scaled down proportionally.
  - The base's hall level is its Elder Toadstool's level.
- **Matching:**
  - Pick real players whose hall is within `hallsBelow`/`hallsAbove` of the attacker's, who have a base, and who are not shielded.
  - Skip the attacker, players they attacked in the last hour, their Grove mates, and anyone with an open ticket from the last 5 minutes (someone is already attacking them).
  - Search the trophy range `matchTrophyRange` first, then ±200, ±400, then any trophies. Within a range, players not raided in the last `exposureHours` come first (protocol 11).
  - When nobody fits, generate a base with `opponentForRank(seed, trophies, hall, floor)` and return it with `kind: "bot"`. The floor is the attacker's assumed earned strength (half-way through their Keep, minus `powerSlackAt(keep)`: `powerSlackByKeep`, else `powerSlack`), the same rule the game uses offline with the player's real research. Never answer "nobody": the game should always have something to attack.
- **The ticket:**
  - Holds a copy of the base with `lootPenaltyByHallDiff` (or `lootPenaltyUpByHallDiff` for a higher Keep) and the defender's exhausted stores already applied. The client must not apply them again.
  - Holds the battle seed (a random 32-bit integer the server chose), returned as `seed`.
  - Lasts 1 hour (`expiresAt`). <!-- tickets: see pvp section -->
- **Attack results:**
  - Trophies use `winTrophies`/`lossTrophies` from `src/gameplay/sim/ranks.ts`, based on both players' trophies. The defender loses `defenseHonorLoss` of the attacker's gain (`defenseHonorLossShare`, 0 since protocol 11), at most `defenderDailyHonorLossCap` (150) honor a UTC day across all their defenses (`DefenseView.trophies` is what was really lost); a lost attack moves the defender up by the attacker's loss.
  - Attacking ends the attacker's own shield.
  - A real defender gets the shield from `shieldTiers` for the destruction reached, plus a defense record that includes the replay. Bot opponents get neither.
- **Retention:** defense records (with their replays) and tickets are kept for 30 days; an unused ticket goes a day after it expires <!-- tickets: see pvp section -->. A report for a ticket that is gone gets `404 not_found`. Our server stores each distinct base once (`base_versions`, by content hash) and tickets and records refer to it, so keeping 30 days of replays costs a few KB per battle instead of a full base copy each.

### Groves

| | request | response |
|---|---|---|
| `GET /v1/groves?q=` | | `{ groves: GroveSummary[] }` (Groves with free places, closest average trophies first) |
| `POST /v1/groves` | `{ name }` | `201 GroveView` (the founder is Leader) |
| `POST /v1/groves/:id/join` | `{}` | `GroveView` |
| `GET /v1/grove` | | `{ grove: GroveView \| null }` |
| `POST /v1/grove/leave` | `{}` | `204` (a leaving Leader hands over to an Elder, else to the longest-serving member) |
| `GET /v1/grove/chat?after=` | | `{ messages: ChatView[], cursor }` (pass `cursor` back as `after`) |
| `POST /v1/grove/chat` | `{ text }` | `201 ChatView` |
| `GET /v1/grove/requests` | | `{ requests: RequestView[], nextRequestAt }` |
| `POST /v1/grove/requests` | `{ capacity }` | `201 RequestView` |
| `POST /v1/grove/requests/:id/donate` | `{ troop, count, level }` | `{ request, xp }` |
| `GET /v1/grove/inbox` | | `{ donations: DonationView[] }` (troops sent to this player, not yet acknowledged) |
| `POST /v1/grove/inbox/ack` | `{ ids }` | `204` |
| `POST /v1/reports` | `{ kind: 'chat' \| 'player', messageId?, playerId?, reason, note?, block? }` | `201 { id, alreadyReported, blocked }` |
| `GET /v1/blocks` | | `{ blocked: [{ id, name, at }] }` |
| `POST /v1/blocks` | `{ playerId }` | `204` |
| `DELETE /v1/blocks/:id` | | `204` |

Rules:

- One Grove per player, with at most `social.membersMax` members.
- Chat is always filtered with `filterText`, also for adults. A player may post at most `social.chatPerMinute` messages per minute.
- **Reports** (`reason`: `harassment`, `hate`, `sexual`, `spam`, `cheating`, `name`, `other`): a chat report must name a message in the caller's own Alliance chat, written by another player; the server stores the text as it was. One open report per reporter and message (or player): a repeat answers `alreadyReported: true` and files nothing. `block: true` also blocks the player. Once 3 different players report one message, it is hidden from everyone (and listed in `ChatResponse.hidden`) until staff look at it. At most 30 reports and blocks an hour per player.
- **Blocks** hide the blocked player's chat messages and troop requests from the blocker (on every device), up to 500 blocks. Blocking does not stop matchmaking or wars.
- **Moderation queue** (our server's staff API, not part of this protocol; `docs/SHIPPING.md`): staff dismiss a report (an auto-hidden message comes back), remove the message, or mute the player's chat for some hours (`403 muted` on posting). A decision about a message settles every open report on it. Handled reports, with their evidence, are deleted after 90 days.
- **Troop requests:**
  - The size is the smaller of the requester's free Lodge space (`capacity`) and the largest Lodge their hall allows.
  - A player may ask again after `requestCooldownMinutes`.
  - A request stays open for `requestLifetimeHours`, or until it is filled.
- **Donations:**
  - Players cannot fill their own request.
  - The troop level must be at most the donor's research cap.
  - A request is never overfilled, even when two players donate at once. Make the fill atomic.
  - The donor earns `housing × xpPerHousing` Grove XP. The troops go to the requester's inbox.
- **What the game does on its side:** it removes donated troops from the donor's army after the server accepts the donation. It adds received troops to the requester's Lodge exactly once per donation id, then acknowledges them. The village economy stays on the device, so the server cannot check the donor's army (see "Trust" below).

### Grove Raid

| | request | response |
|---|---|---|
| `GET /v1/grove/raid` | | `RaidView` |
| `POST /v1/grove/raid/ticket` | `{ target }` | `{ ticket, seed, base, expiresAt }` |
| `POST /v1/grove/raid/attacks` | `BattleSubmission` | `{ result, stars, ours, theirs }` |
| `POST /v1/grove/raid/claim` | `{ week }` | `{ week, outcome, ours, theirs, alreadyClaimed }` |

Rules: the same schedule and scoring as the offline Grove Raid in `src/gameplay/sim/social/groveRaid.ts`.

- **Schedule:**
  - Weekly, from `groveRaid.epoch`, lasting `durationHours`.
  - Weeks are numbered `floor((t − epoch) / 7 days)`.
- **Pairing:**
  - When a member first looks at a live raid, pair their Grove with the closest active, unpaired Grove (by average trophies; member counts within 5; active means seen in the last 3 days).
  - Both sides field the same number of bases: the smaller roster's size, taking each side's strongest members with a base (Keep, then honor). So both sides can win the same number of stars.
  - If no such Grove exists, pair it with a bot Grove from `enemyGrove(seed, week, averageHall)`, sized to match. Its attacks on us are deterministic and spread over the raid.
  - Each side's roster is a copy of the other side's member bases with no loot.
- **Attacks:**
  - `attacksPerMember` per member, and at most roster size × `attacksPerMember` for the whole side (equal for both sides).
  - Only members who joined before the raid started take part. `RaidView.eligible` is false for the others.
  - A repeated report of a used war ticket returns the same result with the current score.
- **Scoring:** each base counts its best stars (and, among equal stars, its best destruction). The side with more stars in total wins; between two real Alliances, equal stars are decided by total destruction.
- **Claims:**
  - Allowed after the raid ends, once per player per week. Repeating a claim is safe: it returns `alreadyClaimed: true` with the same outcome.
  - `RaidView.chests` lists this week's and last week's ended raids the player took part in, with whether each chest was claimed. The game claims every listed week it has not received yet.
  - The chest's contents are `groveRaidChest(outcome, hall)`, added by the game.

## Server-owned village (beta)

| | request | response |
|---|---|---|
| `GET /v1/village` | | `VillageResponse` `{ file, revision, seq, at, stateHash }`, or `404 no_village` |
| `POST /v1/village` | `{}` | `VillageResponse` (a new village; the one already there if any) |
| `POST /v1/village/import` | `{ file }` (a save file) | `VillageResponse` (this device's village; paid value the server could not confirm held back, reported as `importHeld: { jade, premium, purchases }`), `409 conflict` if one is already there, `400 bad_request` naming what its Keep could not hold or that it was played in the testing sandbox |
| `POST /v1/village/commands` | `CommandBatch` `{ stateHash, commands: [{ seq, t, command }], device? }` | `CommandBatchResponse` `{ ackSeq, revision, stateHash, results: [{ seq, ok, error? }], corrections? }` |
| `GET /v1/village/ledger?limit=` | | `{ entries: [{ at, resource, delta, balance, reason }] }` (newest first) |

- `file` is a save file (`src/gameplay/sim/save.ts`); `stateHash` is `economyHash` (`src/gameplay/sim/serverEconomy.ts`): a 64-bit FNV-1a of the canonical JSON of the economy (resources, buildings, next id, army, training, research, Lodge). Anything else in the village is the device's business.
- **Commands** are the game's own `Command`s, numbered by the game from 1 and timed by its clock. Only `PLAYER_COMMANDS` are accepted; results the server makes itself (`battleEnd`, `settleOnlineAttack`, `applyDefense`, donations, war chests, honor) are refused with `NOT_ALLOWED`. A batch holds at most 200 commands and 3 battle replays (`trialEnd`, `abandonBattle`); 30 batches a minute; at most 6 battle commands a minute per player across batches (and instances, through the shared limiter): more are refused with `TOO_MANY_BATTLES`. A command larger than 8 KB (battle commands: 192 KB) is refused with `TOO_LARGE`.
- **Time:** a command counts at the time it says, but never before the village's last change, never more than 12 hours before the server's clock (`MAX_BACKDATE_MS`), and never more than 2 minutes past it (later times count as the server's now). So a fast clock cannot finish timers early, and a backdated command cannot replay days of collector output or finish an upgrade the moment it starts. Offline play older than 12 hours is applied at that bound and the game takes the correction.
- **Idempotent:** numbers the server already applied are skipped; `ackSeq` is the last number processed (applied or refused). Refused commands change nothing; the server logs only their type and error, never their body, and a batch in which nothing applied only records its numbers (the village and its raid base are not rewritten; `revision` still goes up by one).
- **Several devices (worldwide audit GLOBAL-009):** a batch with `device` (the sending queue's random id) is numbered by that device: the server remembers the last number per device (`villages.device_seqs`, up to 16 devices), skips numbers it already processed for that device and answers `ackSeq` in them. Two devices' "command 1" are two commands; the other device gets the result as a correction and replays its queue on top. A batch without `device` (older games) uses the village's single counter, as before, until a device-numbered queue has written to the village: from then on a batch without `device` gets `426 version_mismatch` ("update the game"), because its numbers cannot be told apart and would be acknowledged and dropped. A new queue (new village, new device, reset) takes a new id.
- **Moving a village (GLOBAL-002):** a village marked `flags.sandbox` (save v14: played in the testing sandbox) is refused. Jade above `freeJadeAllowance(keep)` (2,000 + 1,000 per Keep above 1) plus the Jade of purchases this server credited to this player, a premium Season Scroll without a credited Scroll purchase this season, and purchase records the server never credited are held back (`import_holds`, migration 0020) and reported in `importHeld`; the game then adopts the server's village and keeps its own as a backup. Staff return what support confirms with the admin give/take.
- **Corrections:** when the game's `stateHash` (its economy right after its last command in the batch) differs from the server's, the answer includes `corrections: { economy, at }`. The game puts that economy in place and replays the commands it queued after the batch.
- **Ledger:** every change to a server-held resource, with the balance after it and a reason (`command:<type>`, `attack:loot`, `defense:loss`, `donation:sent`, `purchase:apple`, `refund:google`, …). Append-only.
- While a village lives on the server, its raid base (`PUT /v1/base`) is built from it; an upload is ignored.
- **Attacks and gifts use the server-held village** (one transaction with the result): an attack report spends the troops that fought from it and banks the loot (refused with `400 bad_request` if the village does not have those warriors; the ticket stays unused), a defender's server-held village loses what was taken, Alliance War attacks spend troops, war chests go in with the first claim, and donations come out of the donor's server-held army and go into the receiver's Lodge. The game applies the same results to its own copy (as it does today), so its economy hash keeps matching.
- During the transition, a server-held attacker can still raid a village that lives on a device: that loot comes from an uploaded base (capped as always) and the ledger marks it `attack:loot:uploaded-base`.

## Trust

The server is the authority for:

- who exists, and their trophies and shields;
- matchmaking;
- every battle result, because it replays each one;
- Groves, chat, requests and donations;
- Grove Raid pairing, scoring and claims.

The village economy (resources, buildings, timers, the trained army and research) still lives on each device. So the server checks legality, not ownership:

- an uploaded base must be one the Keep allows (counts, levels, shape, loot holders), but the server does not know the player paid for it;
- an attack's army must be trainable and fit at the attacker's Keep, but the server does not keep an inventory or research ledger, so it cannot tell whether those exact troops were trained;
- that a donor really had the troops they donated.

The client side keeps its own guards: time-skip tools and the instant test store exist only in a separate sandbox save that never goes online (`?sandbox`), and online loot is banked only from the server's answers.

**Server-owned village (beta):** a player can move to a village the server keeps (see "Server-owned village"). For them, the server holds inventory, research and timers, replays every action, and consumes troops and banks loot in the same transaction as each attack; the game is corrected whenever it disagrees. Everyone else stays trusted-local as described above. Making it the rule (and moving existing villages, step 25) is the protocol 7 plan in `docs/backend/PVP_ROADMAP.md`.
