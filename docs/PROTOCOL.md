# Kagemura multiplayer protocol (version 4)

> Internal names (`grove`, `acorns`, `toadstool-kingdoms` in `/v1/hello`) are stable IDs from the original project and are kept on purpose. Player-facing names are in `docs/rebuild/ID_MAP.md`.

**Version 4 (Shadow Clans):** additions only, so v2 and v3 clients keep working (`minProtocol: 2`). A v4 server lists the features `candidates`, `shadow_rank`, `regions`, `factions`, `tournaments` and `metrics` in `/v1/hello`; a v4 client uses them only when listed and otherwise falls back to the v3 flow (one opponent from `GET /v1/match`). New-player protection now also applies to `GET /v1/match`: Keep 1-2 only get generated villages and are never offered to others. See "Shadow Clans" below and `docs/game-theory/SHADOW_CLANS.md`.

**Version 3 (ninja rebuild):** a deployment may name a tactical ability instead of a troop. `{ tick, troop: "smoke_bomb", x, y }` throws a Smoke Bomb. Charges come from the army (`smokeCharges` in `src/gameplay/sim/battle/battle.ts`), so nothing new is sent or stored. A v2 server would ignore smoke and score the battle differently, so v3 clients refuse v2 servers. v3 servers still accept v2 clients (`minProtocol: 2`), because a battle without abilities replays the same.

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

  - **Retries:** the client retries network errors and 5xx answers. It never retries 4xx answers.
- **Versioning:** `GET /v1/hello` reports `protocol` and `minProtocol`. The game refuses a server whose `minProtocol` is above the game's version, or whose `protocol` is below it. Bump `PROTOCOL_VERSION` in `protocol.ts` for any change that would break older clients.
- **Time:** all times are epoch milliseconds, taken from the server's clock.

## Battles must replay exactly

The client plays a battle locally and sends `{ ticket, seed, army, levels, deployments, endTick }`. The server re-runs it from the ticket's base with `runBattle` from `src/gameplay/sim/battle/battle.ts`, and the server's result is what counts.

- The battle simulation is deterministic: fixed 10 ticks per second, a seeded random generator, and JavaScript number math (IEEE-754 doubles) done in a fixed order. A port must do the same operations in the same order.
- A server written in another language must either run this TypeScript code (for example a small Node sidecar) or port it exactly.
- The contract test compares the server's `result.hash` with the game's own replay.

Every battle report must also be checked:

- The army fits `maxHousing(attacker hall)`: full Army Camps plus a full Grove Lodge at that hall.
- Troop levels are at most `troopLevelCap` for the attacker's hall.
- At most 2,000 deployments. A deployment whose `troop` is an ability id (battle.json `abilities`) is an ability use, limited by its charges. Ability uses never count as troops used.
- Each ticket can be used only once.

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
| `GET /v1/match` | | `MatchResponse` `{ ticket, base, opponent: { name, trophies, hallLevel, kind }, expiresAt }` |
| `POST /v1/attacks` | `BattleSubmission` | `AttackResponse` `{ attackId, result, trophies, playerTrophies }` |
| `GET /v1/defenses?since=` | | `{ defenses: DefenseView[] }` (raids on this player after `since`, oldest first, at most 20) |
| `GET /v1/leaderboard?limit=` | | `{ players: [{ rank, name, trophies, hallLevel, grove }], me }` |

Rules: these come from the matchmaking design in `src/gameplay/sim/matchmaking.ts` and the balance data in `src/gameplay/data/`.

- **Base upload:**
  - Refuse impossible bases: unknown buildings, bad levels, buildings off the map or overlapping, anything other than exactly one Elder Toadstool, or bad loot values.
  - Then cap the loot:
    - each collector at `ratePerHour × collectorHoursCap × raidableUncollectedFraction`;
    - storages together at `storageLootCapByHall[hall]` per resource, scaled down proportionally.
  - The base's hall level is its Elder Toadstool's level.
- **Matching:**
  - Pick real players whose hall is within `hallsBelow`/`hallsAbove` of the attacker's, who have a base, and who are not shielded.
  - Skip the attacker, players they attacked in the last hour, their Grove mates, and anyone with an open ticket from the last 5 minutes (someone is already attacking them).
  - Search the trophy range `matchTrophyRange` first, then ±200, ±400, then any trophies.
  - When nobody fits, generate a base with `opponentForRank(seed, trophies, hall)` and return it with `kind: "bot"`. Never answer "nobody": the game should always have something to attack.
- **The ticket:**
  - Holds a copy of the base with `lootPenaltyByHallDiff` already applied for the attacker's hall. The client must not apply it again.
  - Lasts 1 hour (`expiresAt`).
- **Attack results:**
  - Trophies use `winTrophies`/`lossTrophies` from `src/gameplay/sim/ranks.ts`, based on both players' trophies. The defender moves by the opposite amount.
  - Attacking ends the attacker's own shield.
  - A real defender gets the shield from `shieldTiers` for the destruction reached, plus a defense record that includes the replay. Bot opponents get neither.

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
| `POST /v1/grove/raid/ticket` | `{ target }` | `{ ticket, base, expiresAt }` |
| `POST /v1/grove/raid/attacks` | `BattleSubmission` | `{ result, stars, ours, theirs }` |
| `POST /v1/grove/raid/claim` | `{ week }` | `{ week, outcome, ours, theirs, alreadyClaimed }` |

Rules: the same schedule and scoring as the offline Grove Raid in `src/gameplay/sim/social/groveRaid.ts`.

- **Schedule:**
  - Weekly, from `groveRaid.epoch`, lasting `durationHours`.
  - Weeks are numbered `floor((t − epoch) / 7 days)`.
- **Pairing:**
  - When a member first looks at a live raid, pair their Grove with the closest active, unpaired Grove (by average trophies; member counts within 5; active means seen in the last 3 days).
  - If no such Grove exists, pair it with a bot Grove from `enemyGrove(seed, week, averageHall)`. Its attacks on us are deterministic and spread over the raid.
  - Each side's roster is a copy of the other side's member bases with no loot.
- **Attacks:**
  - `attacksPerMember` per member.
  - Only members who joined before the raid started take part. `RaidView.eligible` is false for the others.
- **Scoring:** each base counts its best stars. The side with more stars in total wins.
- **Claims:**
  - Allowed after the raid ends, once per player per week. Repeating a claim is safe: it returns `alreadyClaimed: true` with the same outcome.
  - `RaidView.chests` lists this week's and last week's ended raids the player took part in, with whether each chest was claimed. The game claims every listed week it has not received yet.
  - The chest's contents are `groveRaidChest(outcome, hall)`, added by the game.

### Shadow Clans (protocol 4)

All rules come from `src/gameplay/sim/world/` and `src/gameplay/data/competition.json`, so the client and the server agree.

| Route | What it does |
|---|---|
| `GET /v1/candidates?offense=N` | Real players for the rivals board. Each of the board's slots (3) is a real player with probability `humanShare` = min(table by eligible villages in the attacker's band, defender capacity D×C/A). Only eligible defenders: Keep in the attacker's window, PvP on (Keep 4+, or Keep 3 opted in), not shielded, fewer than `maxAttacksPerDefenderPerDay` real attacks in 24 h, not a recent target, not an Alliance mate, not reserved. `offense` (optional) orders them by the fairest matchup. Each candidate has a `token`, the village (loot capped and penalised, `human: true`) and its Shadow Rank. Empty when the attacker's own PvP is off. |
| `POST /v1/match` `{ target }` | A ticket for a real player from the board. Eligibility is checked again: `404` if the attacker or defender may not take part, `409` if the defender is shielded, busy, a recent target, an Alliance mate or reserved. |
| `POST /v1/match` `{ ai: { clan, seed, strength } }` | A ticket for an AI clan village. The server rebuilds it with `clanVillage(clan, seed, strength)` and applies the loot penalty; `strength` must be inside the attacker's Keep window (`400` otherwise). `opponent.kind` is `bot`. |
| `POST /v1/match` `{}` | Same as `GET /v1/match`. |
| `PUT /v1/pvp` `{ optIn }` | Real-player battles at the optional Keep level. Returns `PlayerView`. |
| `PUT /v1/faction` `{ clan \| null }` | The AI faction the player serves (counts real members; leadership). |
| `GET /v1/world` | The player's region (`players` / `capacity`), real players and the human leader per AI faction (fewer than `minHumans` active members: the AI leads; inactive leaders and anyone who led `maxTerms` seasons in a row step aside), and the last finished Shadow Rank season. |
| `POST /v1/tournament/scores` | A tournament battle `{ tournament, index, seed, army, deployments, endTick? }`. Re-simulated against the tournament's fortress at standard levels; the draft must fit the housing budget and the tournament must be live (a battle started in its last minutes still counts). Returns `{ score, best, total }`. |
| `GET /v1/tournament?limit=` | The current tournament's top totals and the player's rank. |
| `GET /v1/metrics` | No auth, aggregates only: per attacker Keep band, eligible defenders, active players, expected attack requests and the target real-player share; real attacks per eligible defender and real vs generated matches in the last day. |
| `GET /v1/leaderboard?board=rank\|defense` | Shadow Rank or defense rating boards (players with a rated battle only). `board=honor` (default) is the trophy board. |

`PlayerView` gains `pvpOptIn`, `shadowRank` (`null` until the first battle against a real player), `lastSeason`, `region` and `faction`. `AttackResponse` gains `rating`: the Shadow Rank change, always `0` against a generated village. Shadow Rank compares the attacker's rating with the defender's **defense** rating (Elo, `rateBattle`); four-week seasons pull both halfway back to 1000.

## Trust

The server is the authority for:

- who exists, and their trophies and shields;
- matchmaking;
- every battle result, because it replays each one;
- Groves, chat, requests and donations;
- Grove Raid pairing, scoring and claims.

The village economy (resources, buildings, timers and the trained army) still lives on each device, as it did in Phases 1–5. So the server trusts:

- the uploaded base layout, after the checks and loot caps above;
- that a donor really had the troops they donated.

Moving the economy to the server would close those gaps. That would be a protocol 3 change.
