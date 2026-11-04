# Kagemura multiplayer protocol (version 6)

> Internal names (`grove`, `acorns`, `toadstool-kingdoms` in `/v1/hello`) are stable IDs from the original project and are kept on purpose. Player-facing names are in `docs/rebuild/ID_MAP.md`.

**Version 6, server hardening (2026-11, roadmap Phase 1):** additions that keep protocol 6 for clients that use them.
- **Rate and size limits.** Too many requests get `429 rate_limited` with a `Retry-After` header (seconds); the game treats it as "try again later", never as a refusal, so a rate-limited battle report stays in the outbox. Request bodies are capped (16 KB, base uploads 128 KB, battle reports 256 KB; more is `413`), and chat messages at 200 characters.
- **Server-issued battle seeds.** `MatchResponse.seed` and `RaidTicketResponse.seed` carry the battle seed the server chose for the ticket. The client plays the battle with it and sends it back as `BattleSubmission.seed`; the server re-simulates with its own seed, and a report with any other seed is refused with `400 bad_request` (a player-facing "update the game" message), without using up the ticket. A client facing an older server that sends no seed picks its own. `/v1/hello` lists the `server-seed` feature.

**Version 6 (gameplay audit fixes):** clients and servers must upgrade together (`minProtocol: 6`), because the battle rules changed (`SIM_RULES` 2: counters are off while upgrading, wall-breakers target the wall in the way, the Siege Bombardier fires on defenses, healers break walls, rebalanced Throwers and kites).
- `BattleSubmission.reinforcements` lists donated troops in the army with the level each was donated at; they deploy first at that level. `DefenseView` carries `reinforcements` and `rules`.
- A used ticket stores its answer. Reporting the same battle again returns that same answer (no `409`), so a client that lost an answer can always recover it, and nothing is applied twice.
- The client banks an online attack's loot and honor only from the server's answer. A refused report (expired ticket, failed check) becomes a practice result on the client.
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
 │        │                      │   protocol v2   │ server/inProcess.ts  (tests)       │
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
- **CORS:** allow `Authorization` and `Content-Type` headers, and the methods `GET, POST, PUT, OPTIONS`. Allowed origins:
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
  | `rate_limited` | 429 | too many requests; wait `Retry-After` seconds (the header is exposed to the web game through CORS) |

  - **Retries:** the client retries network errors, 5xx answers and `rate_limited` (on its next round, not at once). It never retries other 4xx answers.
- **Limits (our server; other servers may choose their own):**

  | what | limit |
  |---|---|
  | every request, per IP address | 600 a minute |
  | every request, per player token | 240 a minute |
  | new players (`POST /v1/players`), per IP address | 30 an hour |
  | opponent searches and war tickets, per player | 30 a minute |
  | battle reports (re-simulated), per player | 20 a minute |
  | request body | 16 KB; `PUT /v1/base` 128 KB; battle reports 256 KB (`413` above) |
  | chat message | 200 characters (`400 bad_request` above) |

  Behind a load balancer the server must see each player's own IP address (`TRUST_PROXY`, `docs/SHIPPING.md`), or all players share one per-IP budget.
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

- New players start with `ranks.startingTrophies` and a shield of `raids.newPlayerShieldHours`.
- Names are trimmed, filtered for bad words, and 2–24 characters long. Anything else becomes "Ruler".

### PvP

| | request | response |
|---|---|---|
| `PUT /v1/base` | `{ base: BaseLayout }` | `204` |
| `GET /v1/match` | | `MatchResponse` `{ ticket, seed, base, opponent: { name, trophies, hallLevel, kind }, expiresAt }` |
| `POST /v1/attacks` | `BattleSubmission` | `AttackResponse` `{ attackId, result, trophies, playerTrophies }` |
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
  - Search the trophy range `matchTrophyRange` first, then ±200, ±400, then any trophies.
  - When nobody fits, generate a base with `opponentForRank(seed, trophies, hall, floor)` and return it with `kind: "bot"`. The floor is the attacker's assumed earned strength (half-way through their Keep, minus `powerSlack`), the same rule the game uses offline with the player's real research. Never answer "nobody": the game should always have something to attack.
- **The ticket:**
  - Holds a copy of the base with `lootPenaltyByHallDiff` already applied for the attacker's hall. The client must not apply it again.
  - Holds the battle seed (a random 32-bit integer the server chose), returned as `seed`.
  - Lasts 1 hour (`expiresAt`).
- **Attack results:**
  - Trophies use `winTrophies`/`lossTrophies` from `src/gameplay/sim/ranks.ts`, based on both players' trophies. The defender moves by the opposite amount.
  - Attacking ends the attacker's own shield.
  - A real defender gets the shield from `shieldTiers` for the destruction reached, plus a defense record that includes the replay. Bot opponents get neither.
- **Retention:** defense records (with their replays) and tickets are kept for 30 days; an unused ticket goes a day after it expires. A report for a ticket that is gone gets `404 not_found`. Our server stores each distinct base once (`base_versions`, by content hash) and tickets and records refer to it, so keeping 30 days of replays costs a few KB per battle instead of a full base copy each.

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

Rules:

- One Grove per player, with at most `social.membersMax` members.
- Chat is always filtered with `filterText`, also for adults. A player may post at most `social.chatPerMinute` messages per minute.
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

**Owner decision before a competitive launch:** keep online play as trusted-local (today), or move the economy to the server: persist inventory, research and timers per player and consume them in the same transaction as each attack. That is a protocol 7 change and a larger server project (`docs/SHIPPING.md`).
