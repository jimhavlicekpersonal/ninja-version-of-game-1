# PvP server roadmap (design + implementation steps)

> **For AI sessions.** This is the agreed design and plan for the online PvP backend, including Friends and Gangs (section 5), the most important system in the game ("the crown jewel"). Read it before changing `server/`, `src/backend/net/`, payments, or ranking. Owner: BACKEND compartment (`src/backend/CLAUDE.md`), with rating math in `src/gameplay/sim/` (GAMEPLAY).
>
> Status (2026-11-04): **steps marked `[x]` are done**, each with where it lives and its tests (Phases 1–6 code, Phase 1.5, and Phase 9 steps 59–61 so far). [Owner] steps stay unticked, with what was prepared for them. When you finish a step, mark it `[x]` here in the same commit.
>
> Tags: **[Owner]** = needs the human owner (accounts, money, legal). **[Code]** = can be done in the repo.

## 0. Current state (facts from the code, protocol v7)

- Server: `server/core/*` (rules, no HTTP/DB), `server/app.ts` (Fastify adapter), `Repo` port with `MemoryRepo` / `PgRepo`, versioned migrations in `server/migrations/` (applied by `npm run server:migrate` as a release step; step 12). Stateless API; all state in Postgres.
- Battles are played on the device; the server re-simulates every attack with `runBattle` (10 ticks/s, ≤1,800 ticks) and its result is authoritative. Tickets are single-use and idempotent (`tickets.response`).
- Ranking today = **Honor** (internal name `trophies`), Elo-like (`src/gameplay/sim/ranks.ts`, `ranks.json`):
  - win: `clamp(24 + 0.05·(def − att), 1, 50)`; loss: `clamp(20 − 0.05·(def − att), 2, 40)`; defender moves by the opposite.
  - leagues: sprout 0, fern 400, oak 1000, elder 2000, jade 2800, storm 3600, shadow 4400, kage 5200.
  - monthly season: Honor above 400 is halved toward 400.
  - matchmaking: Keep ±1, ±80 Honor then widening, power floor (`powerSlack` 0.25), bot base (`kind: 'bot'`) when nobody fits.
- Economy: **trusted-local by default** (village, army, research live on the device; the server checks legality, not ownership; `docs/PROTOCOL.md`, "Trust"). **Server-owned village (beta, steps 19–23):** a player can opt in (Settings; a new village for now, moving an existing one is step 25); the server then replays their commands with the shared sim, corrects the game when the economy hashes differ, and settles their attacks, raids, chests and gifts against the village it holds, with a ledger.
- Shared state and operations: optional Redis for the leaderboard, match locks and rate limits (step 16); logs with request ids, Sentry, `/healthz` + `/readyz`, Prometheus metrics (step 17); re-sim measured at up to ~0.45 s per late-Keep battle (step 18, section 2).
- Payments: StoreKit 2 on iOS (`ios/App/App/TkStorePlugin.swift`) calls `transaction.finish()` immediately and grants Jade on the device. Android and public web purchases are disabled (`src/backend/payments/select.ts`).

### Known gaps (must fix before a competitive launch)

1. ~~**The client picks the battle seed** (`BattleSubmission.seed`).~~ Fixed by step 10: the server issues it in the ticket.
2. ~~**Every attack and ticket stores a full copy of the defender's base** (~10–20 KB JSON).~~ Fixed by step 11: each base version is stored once and referenced by hash; replays are kept 30 days.
3. ~~**No account deletion** (`DELETE /v1/me`): required by Apple 5.1.1(v) and Google.~~ Fixed by step 14.
4. ~~**No chat report/block**: required for user-generated content (Apple 1.2). Only a word filter exists.~~ Fixed by step 15.
5. **No server-side receipt verification**.
6. ~~`schema.sql` migrates on every boot (races with several instances).~~ Fixed by step 12. ~~No rate limiting.~~ Fixed by step 13, shared between instances through Redis by step 16. ~~`rankOf` counts rows on every leaderboard call.~~ Fixed by step 16 (Redis sorted set).
7. Bot attacks move the attacker's Honor.
8. ~~**The server runs exactly one set of combat rules and never checks which set the client used.**~~ Fixed by Phase 1.5 (steps 72-78). `SIM_RULES` and the gameplay data are compiled into the server; `BattleSubmission` carries no rules version. Phone players stay on old app builds for weeks, so after a balance patch their battles are re-simulated under different rules and the server's (different) result silently wins. Changed Keep limits can also make old clients' base uploads fail. Fixed by Phase 1.5.

## 1. Ranking design

Use three numbers, each with one job:

| Number | Visible | Job |
|---|---|---|
| Honor (`trophies`, unchanged) | yes | leagues, season chests, leaderboard |
| Attack Rating (AR) | hidden | attacker skill; used for matchmaking |
| Base Rating (BR), per base layout | hidden | how hard the base is to raid; used for matchmaking |
| Power (P) | shown | Keep + research progress (`attackerStrength`, exists) |

Glicko-2 style, attacker against base:

```
E  = 1 / (1 + 10^((BR − AR − β·(P_att − P_def)) / 400))
S  = 0.6·(stars/3) + 0.4·destruction          // 0..1, rewards partial success
AR += K_a·(S − E)        BR −= K_b·(S − E)
```

- β (power weight): fit from real data; start ≈150 rating points per Keep level.
- K / uncertainty: K 40 for the first ~30 battles, then ~16; uncertainty grows while inactive.
- Reset BR when >25% of a layout's buildings move (stops swapping in a weak layout under a high rating).
- Bots: fixed rating with small K, or excluded from ratings entirely.
- Cap the Honor a defender can lose per day, on top of shields.
- "Power Ranking" leaderboard = power-adjusted AR. Honor stays the league ladder.
- Matchmaking: keep the Keep window and power floor, then choose the BR closest to the attacker's AR, aiming for ~55% expected score; widen as today.
- Season reset touches only Honor; hidden ratings carry over with a small uncertainty bump.
- Implementation: rating math in `src/gameplay/sim/rating.ts`, settings in a `rating` block in `ranks.json`; DB columns `attack_rating`, `attack_rd`, `base_rating`, `base_rd`, `rated_battles`. Hidden ratings need no protocol bump; showing Power Ranking means protocol 7.

## 2. Hosting design and cost

```
Phone/PWA ──HTTPS JSON──▶ Load balancer ──▶ N × API containers (Node + Fastify)
                                                 │ server/core/* + runBattle()
                                                 ▼
                                          Repo ──▶ Postgres  (+ Redis, + R2/S3 for replays)
```

- Stateless API servers, so scale horizontally. No real-time connections (asynchronous battles), which keeps it far cheaper than a real-time game.
- Re-sim CPU per battle, **measured** (step 18, `npm run server:bench`, 2026-11-04, a 4-vCPU Intel Xeon 2.1 GHz cloud container, Node 22; a full bot army at its research cap against a generated base of the same Keep, 40 battles per Keep):

  | Keep | median ms | p95 ms | max ms |
  |---|---|---|---|
  | 1 | 5 | 13 | 16 |
  | 4 | 29 | 40 | 42 |
  | 8 | 205 | 271 | 286 |
  | 12 | 329 | 440 | 444 |
  | 15 | 160 | 202 | 230 |

  Much more than the 20–100 ms first assumed once Keeps reach 8+ (bigger armies, summons, counters). Re-run it on the production host before sizing.
- Capacity (8 attacks/player/day, ~150 ms per re-sim for a typical Keep mix): 10k daily players ≈ 80k battles/day ≈ 3.3 vCPU-hours/day (well under one vCPU, ~1 at peak); 1M ≈ 8M/day ≈ 14 vCPU average, ~70 at peak. **Compute is still affordable, but a 0.2–0.45 s re-sim blocks a Node instance's event loop, so other requests on it wait.** Before more than a handful of concurrent players, run re-sims in a `worker_threads` pool (step 57, now more urgent) and watch `tk_resim_ms` (step 17). Storage (now one copy per base, step 11) and the database remain the main money costs.

| Stage | Setup | ~USD/month |
|---|---|---|
| Beta (<5k daily) | 1 container (Render/Fly/Railway) + managed Postgres | 20–60 |
| Launch (5k–50k) | 2–3 containers, Postgres with HA, Redis, Sentry | 250–800 |
| Hit (100k–500k) | autoscaling (Fargate / Cloud Run / GKE), Aurora / Cloud SQL + replica, re-sim workers, R2/S3, CDN | 2k–8k |
| 1M+ | + partitioned `attacks`, Redis cluster, multi-zone | 10k–30k |

Fixed costs: Apple $99/yr, Google $25 once, domain ~$15/yr. Push (APNs/FCM) is free. The web build stays on GitHub Pages.

## 3. Client → server data (target: protocol 7, server owns the economy)

Principle: **the client sends what the player did, never what the player has.**

Headers on every request:
```
Authorization: Bearer <token>
X-Protocol: 7   X-Sim-Rules: <SIM_RULES>   X-Client-Build: <ver>+<platform>
Idempotency-Key: <uuid>
```

```ts
// a) Identity / device (rare)
{ link: { provider: 'apple'|'google'|'gamecenter'|'playgames', idToken },
  push?: { platform: 'apns'|'fcm', token, tz, quietHours: [22, 8], types: {...} },
  ageBand?: 'u13'|'13-17'|'18+' }                 // drives the under-18 spending cap

// b) Economy command batch (~every 15 s or on events)
{ fromSeq, stateHash, commands: [{ seq, t, op: 'upgrade'|'train'|'collect'|'research'|..., ...args }] }
// server replays them with src/gameplay/sim → { ackSeq, stateHash, corrections? }; server wins on mismatch.
// This also gives cloud saves across devices.

// c) Base layout (on change); no loot field, the server computes loot from its ledger
{ baseVersion, buildings: [{ id, type, level, x, y }], hash }

// d) Attack
// GET /v1/match → { ticket, seed (server-issued), base, expiresAt }
{ ticket, armyRef: 'preset-2' | { troops }, deployments: [{ tick, troop, x, y }] /* ≤2000, abilities included */,
  endTick?, clientResultHash /* desync detection only, never trusted */ }

// e) Social / war: as protocol 6 (the server can now check that donors own the troops)

// f) Purchases
{ store: 'apple', signedTransaction: '<JWS>' } | { store: 'google', productId, purchaseToken }

// g) Telemetry (opt-in): build, device class, FPS bucket, desync counts. No ad IDs, no email.
```

Expected volume: ~50–200 KB per player per day.

## 4. App stores, payments and hosting

- **One Jade ledger on the server, keyed by player.** Jade bought on one platform works on the other once accounts are linked (allowed if each store also sells it through its own IAP).
- **Apple:**
  1. The app sends the JWS to `POST /v1/purchases`.
  2. The server verifies it (App Store Server Library: signature, bundle id, product, unused `transactionId`) and credits the ledger.
  3. The app calls `finish()` only after the server confirms.
  - Refunds: App Store Server Notifications v2 (`REFUND`) take the Jade back.
  - Fees: 15% (Small Business Program, under $1M/yr), else 30%.
- **Google:**
  1. Add a Play Billing plugin; the app sends the `purchaseToken`.
  2. The server calls `purchases.products.get` with a service account, credits the ledger.
  3. The server consumes or acknowledges within 3 days, or Google refunds automatically.
  - Refunds: RTDN (Pub/Sub) + Voided Purchases API.
  - Fees: 15% on the first $1M/yr, then 30%.
- **Web (optional, later):** Stripe (~2.9% + $0.30); webhooks feed the same ledger.
- **Store rules that touch the server:**
  - IAP for all digital currency (Apple 3.1.1); odds shown for paid random items.
  - In-app account deletion, plus a web link for Google.
  - Report and block for chat.
  - Sign in with Apple if other third-party logins are offered.
  - Server up during review; works on IPv6 networks.
  - Privacy label, Data Safety form, IARC rating.
- **External payment links:** the rules are changing (Epic v. Apple and Epic v. Google in the US, the EU Digital Markets Act). Get legal advice before adding any link-out.

## 5. Friends and Gangs (required feature)

Owner requirement: players must be able to **find friends, battle them, and team up with up to 3 friends (a Gang of 2–4) to attack and defend against other Gangs.**

### 5.1 Concepts and names
- **Friend:** a two-way link between players (request → accept). At most 100 friends.
- **Gang:** a team of 2–4 players who are all friends with its leader. Internal id `squad`; player-facing name "Gang" (a ninja-flavoured name such as "Shadow Cell" can be chosen later through the data files, like every other display name).
- A player can be in **one Gang and one Alliance at the same time**. They're separate: an Alliance (10–20 members) is the large community; a Gang is a small team of friends.
- Gang mates may be in different Alliances. Gang mates are never matched against each other in normal PvP (as Alliance mates aren't today).

### 5.2 Finding friends
- **Friend code:** every player gets a short code (for example `KAGE-7Q4M`). Add by code, by a share link (`https://<domain>/f/<code>`, which opens the app or the web game), or by QR code shown in the app.
- **One name per player, looked up directly (primary way to find a friend).** There is no separate display name: a player has exactly **one unique name**, used everywhere (battles, chat, leaderboards, replays, Gang and Alliance lists) and typed to find them. Typing a name exactly finds that one player, shows their profile card (name, Keep, league, Gang), and offers "Add friend" and "Duel".
  - **Precedent followed** (classic online games, where one public name was both your identity and how friends found you):

    | Game (classic era) | Length | Characters | Treated as the same name |
    |---|---|---|---|
    | Xbox Live gamertag | up to 15 | letters, digits, single spaces; starts with a letter | upper/lower case |
    | PlayStation Network Online ID | 3–16 | letters, digits, `-`, `_`; starts with a letter | upper/lower case |
    | RuneScape | up to 12 | letters, digits, spaces, `-`, `_` | case, and space / `_` / `-` interchangeable |
    | World of Warcraft character | 2–12 | letters only | case (one name per realm) |

    These figures are from memory of those games' classic rules, used as a guide, not quoted policy. The shared pattern: short (12–16), starts with a letter, a small character set, case never makes a new name, and look-alike spellings (`Zezima` / `Zez1ma`, `xXNinjaXx`) were allowed as separate names; impersonation was handled by blocking staff-like names and marking real staff, not by folding letters and digits.
  - **Rules (PSN minimum, RuneScape separators, owner-chosen maximum):** **3–18 characters** (the owner chose 18: a little above the classic 12–16 range, room for two-word names); Latin letters, digits, single spaces, `_` and `-`; must start with a letter; no leading, trailing or doubled spaces or separators. 18 fits `Shadow of the Pine` or `Midnight Lotus 27` (`Silent Crane of Iga` is 19, one too many) but not sentence-length names, and keeps names readable on phone battle screens and leaderboards. Non-Latin scripts are a later option.
  - **What counts as the same name:** upper and lower case are the same, and a space, `_` and `-` are interchangeable, so `Silent Crane`, `silent_crane` and `SILENT-CRANE` are one name and only one player can hold it. **Digits and letters stay different** (`Silent Crane` and `S1lent Crane` can both exist), as in classic games. The server stores the name as written and a normalized key (lower case, separators made one); the key has a unique index and is what lookup matches.
  - **Impersonation guard, the classic way:** word filter on the normalized name; reserved names blocked *including* digit look-alikes of them (`admin`, `adm1n`, `kagemura`, `kag3mura`, `support`, `moderator`, `mod`, `gm`, staff names); staff and official accounts carry a badge next to their name that players can't get, so a spoof is visible at a glance. The old fallback name "Ruler" is removed: an invalid or taken name is refused with a reason and suggestions.
  - Chosen at sign-up (suggestions built from the data-file name parts, for example `Midnight Lotus`, with digits added if taken). One free change every 28 days (the RuneScape-style monthly name change); the old name is held for the previous owner for 35 days so nobody can grab it to impersonate, then released. Friends and Gang mates see "formerly …" for 28 days after a change. Battle records keep the name as it was at the time. Name changes are never sold.
  - Lookup is an exact match on the normalized key: no partial matches, no browsing or listing of players, so the player list can't be scraped. Rate-limited (about 30 a minute and 300 a day per player); a miss says only "No player with that name".
  - Privacy setting "Who can find me by name": Everyone (default for 13+), Friends of friends, Nobody (friend code only). The name is still shown to opponents and chat members either way. Under-13 accounts default to Nobody.
  - Migration: existing players keep their current name if it fits the rules and its normalized key is free; names over 18 characters are shortened at a word boundary; collisions get digits added (the oldest account keeps the plain name); names under 3 characters, not starting with a letter, or equal to "Ruler" get a suggested name. Everyone migrated gets one free change straight away. Protocol change: `POST /v1/players` and `PUT /v1/me` return `409 name_taken` with suggestions instead of silently renaming.
- **Suggestions:** recent opponents, Alliance mates, and (optional, opt-in) Game Center / Play Games friends. **No phone contacts upload** (privacy label stays small).
- Requests expire after 14 days. Players can block, which removes the friendship and hides them from search, and report (step 15's report system).
- Friend list shows Keep, Honor, league, Gang, online / last seen (players can hide their online status).

### 5.3 Battling friends: Friendly Duels
- Attack a friend's current base at any time. The friend can also set a separate **duel layout** to test designs.
- **No Honor, no loot, no rating change, no shield.** Ranked rewards between friends would let them trade wins, so duels stay friendly by design.
- Rewards: a duel record and a rivalry tally (wins, best stars), and small daily-task credit (at most 3 duels a day count).
- The server still re-simulates duels, so the rivalry tally and replays can be trusted. The defender gets the replay in their battle log, marked "Friendly duel".
- Optional "Duel challenge": both players attack each other's base within 24 hours; the higher stars, then destruction, wins the challenge. Still unranked.

### 5.4 Gangs
- **Create:** the leader names the Gang and invites friends; invitees accept. Roles: Leader and Member. The leader can hand over leadership; if the leader leaves, the longest-serving member takes over.
- **Gang chat** (filtered, like Alliance chat) and **troop gifts** inside the Gang (reuse the Alliance request/donation system, scoped to the Gang).
- **Leaving cooldown:** 24 hours before joining another Gang, and nobody can leave or join while a Gang War is running (the roster is locked at war start).

### 5.5 Gang Wars: attack and defend together
An asynchronous war, so no real-time servers are needed:

- **Queue:** the leader starts a search. Matched on Gang size (2v2, 3v3, 4v4), then **Gang Rating** (a Glicko rating per Gang, the same math as section 1), then total Power. Never against a Gang sharing a member, a recent opponent (last 3 wars), or a Gang whose members are mostly in the same Alliance.
- **Bot fallback:** if no Gang is found within a few minutes, a generated Gang is offered, clearly labelled as one (honesty rule). Bot wars don't move Gang Rating.
- **Prep (2 hours):** each member's base is copied into the war, without loot. Members can move defenses and choose a **Gang reinforcement**: gift troops to a mate's Lodge for the war (defending together).
- **Battle day (22 hours):** each member has 2 attacks. Two kinds:
  - **Solo strike:** a normal attack on any enemy base.
  - **Relay assault (the team attack):** gang mates attack the *same* enemy base one after another within the window. Damage carries over: buildings destroyed by an earlier strike stay destroyed, and damaged ones keep their lost HP. Stars are scored on the base's total destruction. This makes teamwork matter: one mate uses a cheap army to break walls and the Keep's outer defenses, the next sends the main force.
- **Scoring:** each enemy base counts its best result (relay assaults counted as one combined result). More stars wins; ties go to total destruction.
- **Rewards:** a war chest (fixed contents, scaled by Keep, nothing random or sold) and Gang Rating change. Honor is not changed by Gang Wars.
- **Defending:** a member's war base is defended by its own defenses plus any Gang reinforcements in its Lodge. All members get the defense replays and a "Your Gang is under attack" push.
- **Later option, live co-op strike:** 2–4 friends deploy into one battle at the same moment. Because the simulation is deterministic, the server only needs to relay each player's deployments over a WebSocket (lockstep) and re-simulate at the end. This adds always-on connections (more cost and complexity), so do it after asynchronous Gang Wars are proven.

### 5.6 Simulation changes needed (GAMEPLAY compartment)
- `BattleSetup` gains an optional `startDamage` (HP per building already lost) so a relay strike starts from the previous strike's end state. Bump `SIM_RULES`; old records without it replay unchanged.
- A relay strike's end state is stored per base per war, and the next ticket for that base starts from it. Two mates can't relay the same base at once (ticket lock, as PvP already does).
- Gang reinforcements reuse `BattleSetup.reinforcements` on the defending side (exists for donated troops).

### 5.7 Server data
New tables: `player_names` (name as written, unique normalized key, held-until for released names; replaces the free-text `players.name`), `friend_codes`, `friendships` (pair, status, created), `friend_requests`, `blocks`, `squads`, `squad_members` (one Gang per player), `squad_chat`, `squad_wars` (pairing, window, roster snapshots, score), `squad_war_attacks` (including relay order and end state), `duels`. Gang Rating columns on `squads`.

### 5.8 Client → server data (additions to section 3)
```ts
// Friends
GET  /v1/players/lookup?name=Silent%20Crane  → { id, name, keep, league, squad? } | 404
POST /v1/friends/requests      { code } | { name }
PUT  /v1/me                   { name }  → 409 'name_taken' with suggestions (one change per 28 days)
POST /v1/friends/requests/:id  { accept: boolean }
GET  /v1/friends                → { friends: [{ id, name, keep, honor, league, squad?, lastSeen? }] }
POST /v1/blocks                { playerId }      DELETE /v1/friends/:id
// Duels
POST /v1/duels/ticket          { friendId, layout?: 'live' | 'duel' }  → { ticket, seed, base, expiresAt }
POST /v1/duels                 BattleSubmission (same shape as PvP)
// Gangs
POST /v1/squads { name }   POST /v1/squads/invites { friendId }   POST /v1/squads/invites/:id { accept }
POST /v1/squad/leave   GET /v1/squad   GET|POST /v1/squad/chat
// Gang Wars
POST /v1/squad/war/queue  {}            GET /v1/squad/war  → { phase, endsAt, ours, theirs, bases[], relayState[] }
POST /v1/squad/war/ticket { target, relay: boolean }   → { ticket, seed, base, startDamage?, expiresAt }
POST /v1/squad/war/attacks BattleSubmission           → { result, stars, combined?, ours, theirs }
POST /v1/squad/war/claim  { warId }
```
Push types to add: friend request, Gang invite, war found, war ending soon, Gang under attack, relay strike handed to you ("Ryu broke the walls; your turn").

### 5.9 Store and safety rules
- Block and report on every friend, duel, Gang and chat surface (Apple 1.2). Chat filter on for everyone.
- Under-13: not findable by name unless a parent allows it (friend codes only), Gang chat limited to preset phrases unless a parent allows more (COPPA). Under-18 spending cap unchanged.
- No paid advantage in Gang Wars: war chests, relay turns and war attacks are never sold.
- Cost impact: small. Duels and war strikes are re-simulated like PvP (same CPU per battle); extra storage is war snapshots, kept 30 days.

## 6. Implementation steps

### Phase 0: Decisions and accounts (~1–2 weeks) [Owner]
- [ ] 1. Decide: server owns the economy (protocol 7). Recommended yes; Phases 2–3 depend on it.
- [ ] 2. Trademark and app-store name search for "Kagemura".
- [ ] 3. Final bundle id and new product ids (old `com.toadstoolkingdoms.app` / `moonstones_*` ids remain until then).
- [ ] 4. Business entity (LLC or similar), recommended.
- [ ] 5. Apple Developer Program: Paid Apps agreement, bank/tax details, Small Business Program.
- [ ] 6. Google Play Console: identity verification, payments profile.
- [ ] 7. Domain: `api.`, privacy policy, account-deletion page, support page.
- [ ] 8. Hosting accounts: server host, managed Postgres, Redis (Upstash), Sentry, Cloudflare R2.
- [ ] 9. Legal review: privacy policy/terms, under-18 cap and COPPA, loot-box laws, external payment links.

### Phase 1: Server hardening on protocol 6 (~2–3 weeks) [Code]
- [x] 10. Server-issued battle seed in the match ticket. `MatchResponse.seed` / `RaidTicketResponse.seed` (`tickets.seed`, migration 0002); the server re-simulates with it and refuses a report with another seed (`battleSeed` in `server/core/pvp.ts`); the client plays with it (`src/app.ts`, `RemoteGroveSource.raidBattle`). Still protocol 6 (`server-seed` feature). Tests: `core.test.ts`, contract test.
- [x] 11. Store each base version once (content hash); tickets and attacks reference it; 30-day replay retention. `base_versions` (migration 0003, `server/contentHash.ts`: SHA-256 of canonical JSON), written in the same statement as the ticket or attack; `server/core/retention.ts` (30-day records and tickets, unused tickets a day after expiry, unreferenced bases), run hourly by `server/main.ts`. Rows from before keep their own copy until retention removes them. Tests: `repo.test.ts` (both adapters, legacy rows on Postgres), `core.test.ts`.
- [x] 12. Migrations as a release step with versioned files (not on every boot). `server/migrations/NNNN_*.sql`, `server/migrate.ts` (checksums, advisory lock, a transaction per file), `npm run server:migrate`; the server refuses to boot with pending migrations unless `MIGRATE_ON_BOOT=1`. Tests: `tests/backend/server/migrate.test.ts`.
- [x] 13. Rate limiting per token/IP; request size limits. `server/rateLimit.ts` (`RateLimiter` port, memory fixed-window counters; per IP, per token hash, and per route for registration, matches, battle reports, moderation and deletion requests), `429 rate_limited` + `Retry-After`; per-route body limits (16 KB / 128 KB bases / 256 KB battles) and 200-character chat; `TRUST_PROXY`, `RATE_LIMITS` env. The client treats `rate_limited` as retryable, so a report stays in the outbox. Tests: `server.test.ts`, `connection.test.ts`.
- [x] 14. `DELETE /v1/me` plus a web deletion form. `server/core/account.ts` + `Repo.deletePlayer` (one transaction; what others keep is anonymised as "Deleted player"), migration 0004; web page `GET /account/delete` (`server/accountPage.ts`) posting `POST /v1/account/deletion-requests`, worked through by staff with the admin API (`ADMIN_TOKEN`, `/admin/v1/deletion-requests`); Settings → Online play → Account (Player ID, Delete online account), `Connection.deleteAccount` (pending attacks become practice, online play off on the device). Tests: `core.test.ts` (both adapters), `server.test.ts`, `online-authority.test.ts`, contract test.
- [x] 15. Chat report/block endpoints and screens; moderation queue. `server/core/moderation.ts` (reports with the message text as evidence, one open report per reporter, auto-hide after 3 reporters, blocks that hide messages and troop requests, chat mutes), migration 0005; `POST /v1/reports`, `GET|POST /v1/blocks`, `DELETE /v1/blocks/:id`, `ChatResponse.hidden`, `403 muted`; staff queue `/admin/v1/reports` (dismiss, remove message, mute); handled reports kept 90 days. Client: "⋯" on other players' chat messages and member rows opens Report (reason, note, also block) / Block / Unblock (`GroveSource.report/block/unblock`); Settings → Online play → Account lists blocked players. Tests: `core.test.ts` (both adapters), `server.test.ts`, `groveSource.test.ts`, contract test.
- [x] 16. Leaderboard as a Redis sorted set; match locks in Redis. `server/redis.ts` (a dependency-free RESP2 client, TLS for Upstash), `server/shared.ts`: `Leaderboard` (`RepoLeaderboard` default, `RedisLeaderboard`: ZADD/ZREVRANGE/ZCOUNT, equal honor ranks the older account first like the database, rebuilt from Postgres when missing), `MatchLocks` (`TicketLocks` default, `RedisLocks`: SET NX PX, released by the holder only; matchmaking skips its ticket scan and takes the lock atomically, so two attackers never get the same defender), `RedisRateLimiter` (one budget across instances). `REDIS_URL` turns them on. Tests: `tests/backend/server/redis.test.ts` (`TEST_REDIS_URL`).
- [x] 17. Observability: structured logs, Sentry (client + server), `/healthz`, metrics (re-sim ms, battles/min, desyncs, errors by code). Pino JSON logs with a request id (`x-request-id`, also on every answer) and tokens redacted (`LOG_LEVEL`); Sentry envelopes without the SDK (`src/backend/analytics/sentryEnvelope.ts`): server 5xx and crashes (`SENTRY_DSN`), game crashes (`VITE_SENTRY_DSN`, Settings → Send crash reports, never the sandbox, no player data); `/healthz` (liveness) and `/readyz` (database, Redis; 503 when down); `server/observability.ts` `PromMetrics` at `/metrics` behind `METRICS_TOKEN`: `tk_resim_ms`, `tk_battles_total`, `tk_desyncs_total` (from the new optional `BattleSubmission.clientHash`), `tk_errors_total{code}`, `tk_rate_limited_total`, request counts and latency. Tests: `tests/backend/server/observability.test.ts`.
- [x] 18. Benchmark `runBattle` on target hardware; record the result in section 2. `server/bench.ts` + `npm run server:bench` (built into `dist-server/bench.js`, so it runs on the host); measured here and recorded in section 2 (5 ms at Keep 1, up to 440 ms p95 at Keep 12), which moves step 57 (re-sim worker pool) forward. Test: `tests/backend/server/bench.test.ts`.

### Phase 1.5: Surviving game updates (~2–3 weeks) [Code]
Makes balance, combat and data changes safe while old app builds are still in use (gap 8). Art and UI changes need nothing: the server never loads presentation code (`compartments.json`, `boundaries.test.ts`). Do this before the first store release; steps 72, 74 and 75 are small, 73 is the main work. Steps are numbered 72–78 so earlier numbers stay stable.
- [x] 72. **Clients say which rules they use.** Every request sends `X-Sim-Rules` and `X-Data-Version` (a hash of `src/gameplay/data/*.json` made at build time); `BattleSubmission` carries `rules` and `dataVersion`; each ticket stores the rules and data version it was issued under, and the submission must match its ticket (`bad_request` otherwise, with a player-facing "please update" message). **Done:** `src/backend/net/dataVersion.ts` (`dataVersionOf`, `combatFingerprintOf`, `compareBuilds`); `x-data-version` from `httpAdapter.ts` (follows a balance bundle); `rules`/`dataVersion` in battle reports (recorded at play time, so a queued report keeps them); tickets store both (migration 0014); a report whose rules differ from its ticket is refused. Tests: `tests/backend/server/rules-versions.test.ts`.
- [x] 73. **The server keeps the last 2–3 rule versions loaded.** A build script snapshots the released sim and data into `server/rules/v<N>/` (generated, never edited by hand; the live code in `src/gameplay/sim` stays the only one people change). The server re-simulates each battle, validates each base and army, and computes loot caps with the version its ticket was issued under. Matchmaking only pairs a client with bases legal under its version (store bases tagged with the version they were uploaded under; re-check on the newer version). Tests: one recorded battle per supported version replays to its recorded `result.hash`. **Done:** `server/rules/registry.ts` (`RulesRegistry`: live engine + archived snapshots, newest engine for an unknown data version of the same rules, `RETIRED_RULES`), `server/rules/archive.ts`, `npm run rules:snapshot` / `rules:fixture` (`tools/release/rules-snapshot.mjs`). PvP and Alliance War re-simulate, check armies and make bot bases with the ticket's engine; an old game only meets bases legal under its rules; base uploads are checked with the sender's rules. One recorded battle per version (`tests/backend/fixtures/rules/v2.json`) must replay to its hash. No archived version exists yet (only rules 2 is released).
- [x] 74. **Release order: server first.** Deploy a server that accepts old and new versions, then ship the web and store builds, then retire the old version after its share of traffic drops below ~2% (or 4–6 weeks). Write the checklist into `docs/SHIPPING.md`; CI refuses a client release whose `SIM_RULES` the production server doesn't list in `/v1/hello`. **Done:** `tools/release/check-server-rules.mjs` runs before the web, Android and iPhone release builds and stops one whose `SIM_RULES` the server does not list; `docs/SHIPPING.md` 3i is the checklist. Test: `tests/backend/server/release-tools.test.ts`.
- [x] 75. **Friendly forced update.** `/v1/hello` adds `supportedRules: number[]` and `minClientBuild`. A client below either shows an "Update Kagemura" screen with a store link (online play paused, the village still playable offline) instead of getting wrong results. Bump `PROTOCOL_VERSION`; update `docs/PROTOCOL.md` and the contract tests. **Done:** `/v1/hello` `supportedRules`, `minClientBuild` (`MIN_CLIENT_BUILD`), `dataVersion`; older builds get `426`; `src/backend/net/versionCheck.ts` makes the game pause online play (`incompatible`) and the HUD shows "Update Kagemura" (store link from `VITE_APP_STORE_URL` / `VITE_PLAY_STORE_URL`, reload on the web). Protocol 8 (servers still accept 7).
- [x] 76. **Optional: server-delivered balance numbers.** Number-only changes (costs, timers, damage, HP) shipped as a signed, versioned data bundle the client downloads, so balance can change without an app release. Data only, never code (Apple 2.5.2 / Google Play policy allow downloaded data, not executable code). The bundle counts as a new data version under steps 72–73, is cached for offline play, and falls back to the built-in data if missing or badly signed. **Done:** `src/backend/net/balanceBundle.ts` (format and checks: ECDSA P-256 signature, existing numbers only, never combat numbers, one data build), `src/backend/net/balance.ts` (`BalanceLoader`: applied at start, never mid-session, cached for offline), server `BALANCE_BUNDLE_FILE` + `BALANCE_PUBLIC_KEY`, `GET /v1/balance`, feature `balance-bundles`; `npm run balance:bundle` (keygen, make); `docs/SHIPPING.md` 3j. Tests: `tests/backend/net/balance.test.ts`. Combat numbers are excluded on purpose (they would change replays); they go through 3i.
- [x] 77. **Contract tests in CI.** On every change to `src/gameplay/sim`, `src/gameplay/data` or `server/`, deploy to staging and run `npm run test:contract` against it with both the current and the previous client version. **Done:** Main: `.github/workflows/server.yml` (step 43) deploys to staging and runs the contract tests with this build's client and the previous release's. Pull requests: the `server` job in `deploy.yml` now also runs the previous release's contract tests against the freshly built server. (No `v*` release tag exists yet, so the previous-client run says so and passes.)
- [x] 78. **Monitoring.** Dashboard of traffic by client build and rules version, desync rate (client `clientResultHash` ≠ server hash) per version, and refused reports by reason; alert when desyncs rise after a release. **Done:** `ops/grafana/game-versions.json` (traffic by build and rules, share of battles per rules version, desyncs per version, refusals by reason, re-simulation time); `tk_battles_total`/`tk_desyncs_total` carry `rules`, `tk_refused_total` by reason; alerts `DesyncsRisingForOneVersion`, `GamesRefusedForVersion` in `ops/prometheus/alerts.yml`. Tests check that the dashboard and alerts only use real metrics.

### Phase 2: Server-owned economy, protocol 7 (~6–10 weeks) [Code]
- [x] 19. Tables: `villages` (state JSON + revision), `ledger` (append-only), `command_log`. Migration 0006: `villages` (save file, revision, last client `seq`, settled time, economy hash), `ledger` (every server-held resource change with balance, reason and ref; a trigger refuses updates), `command_log` (kept 30 days). `Repo.getVillage` (row lock inside a transaction), `createVillage`, `saveVillage` (revision check, ledger and log in one transaction), `ledgerOf`, `commandsOf`, and `Repo.transaction` (Postgres: one connection, savepoints when nested; memory: queued, rolled back on error). Account deletion removes all three. Tests: `repo.test.ts` (both adapters).
- [x] 20. Command endpoint: replay with the shared sim, check timers against server time, return `stateHash` plus corrections. `server/core/village.ts`: `POST /v1/village` (a new village on the server; moving an existing one is step 25), `GET /v1/village`, `POST /v1/village/commands` (numbered commands replayed with `applyCommand` in one transaction; retried numbers skipped; times clamped to never before the village's last change nor more than 2 min past the server clock; only `PLAYER_COMMANDS` from `src/gameplay/sim/serverEconomy.ts`; at most 3 battle replays a batch; ledger and command log written with it; answer: `ackSeq`, `stateHash` = `economyHash`, per-command results, and `corrections` with the server's economy when the game's hash differs), `GET /v1/village/ledger`. The raid base comes from the server's village, never an upload. Feature `server-economy`, additive on protocol 6 (the bump is step 26). Tests: `tests/backend/server/village.test.ts` (both adapters).
- [x] 21. Client: every action becomes a queued command (reuse the outbox); server state is the truth when online; offline actions stay pending until confirmed. `src/backend/net/villageSync.ts` (`Connection.village`): while the server keeps the village, each `PLAYER_COMMANDS` command is applied at once as always and queued with its number, time and economy hash (stored on the device like the battle outbox, so it survives restarts and lost connections); sent every 15 s, at 20 waiting, and before every attack report and match; corrections put the server's economy in place (`GameController.adoptEconomy`) and replay what is still queued. On connecting, the server's village wins when nothing is waiting. Settings → Online play → "Village on the server (beta)" starts one (a new village; the device village becomes a backup until step 25 can move it) and shows the ledger. Generated offline raids are off for a server village. Tests: `tests/backend/net/villageSync.test.ts`.
- [x] 22. Attacks use up server-held troops in the same transaction as the result; loot comes from the server ledger. `attack()` settles everything in one `Repo.transaction`: the ticket, honor and shields, the defense record, and for server-held villages the game's own `battleEnd` (troops must be in the village: `checkBattleSetup`; spent) and `settleOnlineAttack` (loot banked) on the attacker, `applyDefense` (losses from the buildings that fell) on the defender, with ledger lines (`attack:loot`, or `attack:loot:uploaded-base` / `:generated-base` when the loot came from a village the server does not hold, `defense:loss`). The battle runs once (`known` / `fallen`). A server-held village's raid base is built from it, so its loot is its real stock. Alliance War attacks spend troops the same way (`remoteGroveBattleEnd`), and war chests go into the server village with the first claim. Tests: `tests/backend/server/attacks-economy.test.ts` (both adapters; the games' hashes still match after an attack and a defense).
- [x] 23. Donations take troops from the donor's real army. Done with step 22 (a server-held army could otherwise be given away and then restored by a correction): `donate()` applies `spendDonation` to a server-held donor (refused if the warriors are not there) and `receiveDonations` to a server-held receiver, in one transaction with the request fill. Donors whose village is on their device stay trusted-local until they move it.
- [x] 24. Account linking (Apple, Google, Game Center, Play Games) = cloud save. `server/identity/verify.ts` (node:crypto only: Apple/Google ID tokens against their JWKS, issuer, audience, expiry; Game Center signatures with a key from an `*.apple.com` URL; Play Games code exchange), migration 0007 (`identity_links`, `player_tokens`: each device its own token), `GET|POST /v1/links`, `DELETE /v1/links/:provider`, `POST /v1/sessions` (sign in on a new device). Game: `platform/auth.ts` (iPhone: `TkAuthPlugin.swift`, Sign in with Apple + Game Center; web: Google Identity Services / Sign in with Apple JS when `VITE_GOOGLE_CLIENT_ID` / `VITE_APPLE_SERVICES_ID` are set), Settings → Account → Sign-ins (link, unlink, sign in here); a new device adopts the server-held village. **Owner:** enable the capabilities (Xcode: Sign in with Apple, Game Center) and set the server's `APPLE_CLIENT_IDS`, `GOOGLE_CLIENT_IDS`, `GAMECENTER_BUNDLE_IDS`, `PLAYGAMES_CLIENT_ID/SECRET`. Not yet: the Android app's Play Games / Google sign-in (needs the Play services SDKs in `android/`). Tests: `links.test.ts`, `villageSync.test.ts`.
- [x] 25. One-time upload of existing local saves, with sanity limits per Keep. `POST /v1/village/import { file }` (`server/core/villageImport.ts`, feature `village-import`): once per player; the village must be one its Keep could hold (buildings and levels the Keep allows, resources within storage, Jade ≤ `IMPORT_MAX_JADE`, army and queue within twice the camps, Lodge within the Keep's, warriors and research the Keep allows, no timer ending more than 30 days out); it is stored exactly as sent (economy unchanged), with the server's honor and shield and an `import` opening ledger. Settings → "Move this village to the server" (or start a new one). Tests: `villageImport.test.ts`, `villageSync.test.ts`.
- [x] 26. Protocol 7: update `docs/PROTOCOL.md` and the contract tests. `PROTOCOL_VERSION` 7, `minProtocol` 7 (older games are told to update); `ClientHeaders` on every request (`X-Protocol`, `X-Sim-Rules`, `X-Client-Build`, `Idempotency-Key` on writes; `426 version_mismatch` below `minProtocol`; requests counted by build and rules); idempotent writes (`idempotency_keys`, migration 0008, a day); the game moves its village to the server when it connects (`Connection.keepVillageOnServer`, refusals kept and shown). Tests: `server.test.ts`, `villageSync.test.ts`, contract test.

### Phase 3: Ranking (~2–3 weeks) [Code]
- [x] 27. `src/gameplay/sim/rating.ts` + `ranks.json` `rating` block + tests. Expected score with the power term, score from stars and destruction, K from the rating deviation (40 new, 16 settled), deviation growing while idle, `orderByRating`/`pickByRating`, `powerRating`, `layoutChangedShare`. Tests: `tests/gameplay/sim/rating.test.ts`.
- [x] 28. Rating columns; update ratings in `attack()`; bots fixed or excluded. Migration 0009 (`attack_*`, `base_*` rating, deviation, battles, time); `attack()` rates attacker and defender in its transaction; bot battles are excluded (no rating moves). Tests: `tests/backend/server/ratings.test.ts`.
- [x] 29. Matchmaking by BR closest to AR (~55% expected score), after the Keep window and power floor. `match()` orders the free candidates with `orderByRating` (ties from a random start) and takes the first lock it gets.
- [x] 30. Daily cap on defender Honor loss; BR reset on a big layout change. `defenderDailyHonorLossCap` (150 a UTC day; the attacker still gains in full; the defense record shows what was really lost); a layout that changed by more than `layoutResetShare` (25%) starts its Base Rating over, for uploads and server-held villages.
- [x] 31. Power Ranking leaderboard + client panel. `GET /v1/leaderboard/power` (Attack Rating + β·(Keep − 1), players with at least `powerBoardMinBattles` rated attacks; feature `power-ranking`); Settings → Online play → Leaderboard has Honor and Power tabs.
- [x] 32. Simulate weeks of model players (`tests/gameplay/balance/`) through the matchmaker; check convergence. `rating-convergence.test.ts`: 120 model players with hidden skills, 4 weeks of 4 raids a day through `pickByRating`; ratings rank the true skills (Spearman > 0.85 for attack and base), settle (deviation under half the start), and pairings average an expected score within 0.08 of the 0.55 target. (Outcomes come from the hidden skills, not full battles: full-battle campaigns are `npm run balance:campaign`.)

### Phase 4: Payments (~3–4 weeks) [Owner + Code]
- [ ] 33. [Owner] Create IAP products with the new ids in App Store Connect and the Play Console. **Prepared:** the 11 products (ids, type, price, contents) are listed in `docs/SHIPPING.md` section 3b.
- [ ] 34. [Owner] Keys as server secrets: Apple App Store Server API `.p8`, APNs `.p8`, Google service account linked in the Play Console. **Prepared:** every setting the server reads and where to get it is in `docs/SHIPPING.md` sections 3c and 3e (`APPLE_BUNDLE_IDS`, `GOOGLE_PLAY_PACKAGE`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_RTDN_*`, `APNS_*`, `FCM_*`); receipt checks need no App Store Server API key.
- [x] 35. [Code] Apple: send JWS → verify → credit → `finish()`; ASSN v2 refund webhook. `server/payments/apple.ts` (node:crypto: x5c chain to Apple Root CA - G3 pinned by fingerprint, Apple's marker OIDs, ES256, bundle id, allowed environments), `POST /v1/purchases`, `POST /v1/webhooks/apple` (REFUND/REVOKE take back what a server-held village still has: `revokePurchase`); `TkStorePlugin.swift` returns the JWS and finishes only when the game says (`finish`, `unfinished`); `StoreKitPaymentProvider`. Tests: `tests/backend/server/purchases.test.ts` (a made-up test chain in `tests/backend/fixtures/appstore/`), `tests/backend/net/purchases.test.ts`.
- [x] 36. [Code] Google: Play Billing plugin → verify token → credit → consume/acknowledge; RTDN + Voided Purchases. `TkBillingPlugin.java` (Billing 7.1.1; the game uses it only in builds made with `VITE_PLAY_BILLING=1`), `PlayBillingPaymentProvider`, `server/payments/google.ts` (service-account OAuth, Play Developer API, consume after credit, RTDN checked by its OIDC token, Voided Purchases API hourly). The Java was not compiled in this environment (no Android SDK); the Android workflow builds it.
- [x] 37. [Code] Transaction ids redeemable once; under-18 cap on the server; purchase history; restore. Migration 0010 (`purchases`, primary key store + transaction; `purchase_intents`), `POST /v1/purchases/intent` (cap across devices, intents held 30 minutes, `403 purchase_refused` before anything is charged), `GET /v1/purchases`, Store → Restore purchases (unfinished store purchases and this season's Scroll); purchase records outlive account deletion, unlinked. `grantPurchase` left `PLAYER_COMMANDS` (the server delivers, with `verified`).
- [x] 38. [Code] New product ids in `store.json`, `capacitor.config.ts` and the native projects. `store.json` `storeProductIds` maps the game's ids (kept: they are in saves) to store ids (`jade_pouch` … `season_scroll`); the native plugins take the id from the game, so the native projects need no product list. The app's bundle id in `capacitor.config.ts` stays the owner's choice with the new listing (`docs/SHIPPING.md` section 6).
- [ ] 39. [Owner] Test purchases: Apple sandbox testers (TestFlight), Google license testers (internal track). **Prepared:** the checklist is `docs/SHIPPING.md` section 3d.

### Phase 5: Push and native (~1–2 weeks)
- [x] 40. [Code] Server-sent push via APNs/FCM (raided, war, donations); respect quiet hours and `maxPerDay`; tokens per device. `server/push/push.ts` (APNs over HTTP/2 with an ES256 token, FCM HTTP v1; a push in quiet hours is dropped; invalid tokens removed), migration 0011 (`push_tokens`: types, time zone, count per local day), `PUT|DELETE /v1/push/tokens`, `@capacitor/push-notifications` + `platform/push.ts`; the game registers the types switched on in Settings and stops scheduling a local reminder the server pushes. Tests: `tests/backend/server/push.test.ts`.
- [ ] 41. [Owner] Firebase project for FCM; `google-services.json`. **Prepared:** steps in `docs/SHIPPING.md` section 3e; the Android build applies the Google services plugin as soon as the file is there.

### Phase 6: Launch infrastructure (~1–2 weeks) [Owner + Code]
- [x] 42. Separate staging and production (databases, secrets). `DEPLOY_ENV` and `server/config.ts` (production refuses to start without its database, staff token and CORS list, or with sandbox push), migration 0012 (`server_meta`: a database belongs to the first deployment that used it; the other kind refuses to start), `environment` in `/v1/hello` and a note in Settings. **Owner:** create the two hosts and databases (`docs/SHIPPING.md` section 3f).
- [x] 43. CI/CD: tests → build → deploy to staging → contract tests; production deploys by hand. `.github/workflows/server.yml` (tests with Postgres and Redis, one Docker image per commit on GHCR, staging deploy through a deploy hook, contract tests against staging with this and the previous release's client, production only by hand and read-only checks), `Dockerfile`, `tools/release/`. **Owner:** the two GitHub Environments, `DEPLOY_HOOK` and `SERVER_URL` (`docs/SHIPPING.md` section 3g).
- [x] 44. Automated backups + a practised restore, point-in-time recovery, 2+ API instances. `tools/ops/backup.mjs` (pg_dump, AES-256-GCM), `restore.mjs`, `restore-check.mjs` (migrations, row counts, villages against their ledger); `.github/workflows/backup.yml` (a daily encrypted backup kept 35 days; every Sunday it restores the new backup into an empty Postgres, checks it and starts the server on it; practised here end to end); `tests/backend/server/instances.test.ts` (two servers, one Postgres and one Redis: same players, idempotent retries across instances, one leaderboard, shared limits). **Owner:** turn on the host's point-in-time recovery, run 2+ instances with `REDIS_URL`, set `BACKUP_DATABASE_URL` and `BACKUP_KEY` (`docs/SHIPPING.md` 3h).
- [x] 45. HTTPS on the custom domain; works on IPv6. The server listens on `::` (IPv6 and IPv4; falls back to IPv4 where the machine has no IPv6), sends `Strict-Transport-Security` over HTTPS (behind a trusted proxy), and `tools/ops/check-domain.mjs` checks A and AAAA records, HTTPS over both, the certificate's remaining days and that plain HTTP does not serve the API. **Owner:** the domain, its DNS (A and AAAA) and the host's certificate.
- [x] 46. Load test with recorded battle traffic at 5× expected peak. `npm run server:load` (`server/load.ts`): players at Keeps 3–15 match and report full-army battles through the game's HTTP adapter at a set rate (traffic generated with the game's rules: there is no live traffic to record before launch). 5× the expected peak of 10k daily players is ~14 battles/s. **Measured (one instance, memory storage, 2.1 GHz vCPU):** it holds ~3 battles/s; at 14/s it fell to 2.7/s with match p95 ~40 s and attack p95 ~3.9 s, because re-simulation blocks the event loop. So the worker pool (step 57) and several instances are needed before launch; rerun on staging after them.
- [x] 47. Status page and alerts: error rate, response times, DB connections, refund spikes. `ops/prometheus/alerts.yml` (server down, 5xx rate, p95 latency, event-loop delay, database pool waiting, refund share, desync rate, rate-limit storms; a test checks every metric it names exists), gauges `tk_db_pool_connections` and `tk_event_loop_delay_ms`, and `SERVER_NOTICE` (an operators' message in `/v1/hello`, shown in Settings). **Owner:** a hosted status page and uptime check on `/readyz` (e.g. Better Stack or UptimeRobot), and Grafana Cloud or Prometheus scraping `/metrics` with these rules.
- [x] 48. Admin tool: player lookup, grant/revoke, ban, rating reset. `GET /admin` (a page served only with `ADMIN_TOKEN`, strict CSP) over `/admin/v1/players` (search by name or id, details: account, sign-ins, Alliance, server village, ledger, purchases, defenses, staff log), `…/adjust` (give or take resources in a server-held village: `staffAdjust`, ledger `staff:<note>`), `…/ban` (suspend for hours with a reason: `403 banned`, not matched, off the leaderboards; lifted by staff or by time), `…/reset-rating`, `/admin/v1/actions`; migration 0013 (`banned_until`, `staff_actions`). Tests: `tests/backend/server/admin.test.ts`.

### Phase 7: Store submission (~2–4 weeks) [Owner]
- [ ] 49. Listings: screenshots for iPhone and Android, description, support and privacy URLs. **Prepared:** `docs/store/LISTING.md` (names, description, keywords, categories, URLs), `npm run store:screenshots` (the built game at iPhone 6.9"/6.5", iPad 13" and Android sizes), `docs/store/PRIVACY_POLICY.md` (a draft to review and publish).
- [ ] 50. Privacy label, Data Safety form, IARC rating, user-generated content declaration. **Prepared:** `docs/store/PRIVACY.md` (what is collected, from the code, and the answers for each form).
- [ ] 51. Apple review notes (how to reach PvP, demo account, odds and deletion are in the app). **Prepared:** `docs/store/REVIEW_NOTES.md`.
- [ ] 52. Closed testing: TestFlight external testers; Google closed track (new personal accounts need 12+ testers for 14 days). **Prepared:** `docs/store/TESTING.md` (groups, the 14-day rule, a tester script on the staging server).
- [ ] 53. Submit; staged rollout / phased release. **Prepared:** `docs/store/RELEASE.md` (checklist, phased release and staged rollout, what to watch, how to pause and roll back).

### Phase 8: After launch (ongoing)
- [ ] 54. Weekly review: economy, rating convergence, desync rate, refund rate; rebalance through the data files.
- [ ] 55. Seasons: Honor reset, league chests, leaderboard archive.
- [ ] 56. Moderation, support, account-deletion requests within legal time limits.
- [x] 57. Scale when needed: re-sim worker pool, read replica, partition `attacks`, replays to object storage. (The worker pool is needed early: step 18 measured up to ~0.45 s per late-Keep re-sim, which blocks an instance's event loop.) **Done (worker pool):** `server/resim/` (`WorkerResimulator`: worker threads with the same rule engines, one battle each, a queue capped by `RESIM_QUEUE`, `503 busy` when full, a stuck or crashed worker replaced; `RESIM_WORKERS`, default CPU cores − 1; `dist-server/resimWorker.js`). Load test on a 4-core machine at 8 battles/s: main thread only 5.5/s, opponent search p50 1,172 ms, attack p50 1,241 ms, 51 errors; with 3 workers 7.96/s, 4 ms, 199 ms, no errors. Tests: `tests/backend/server/resim.test.ts` (real worker threads built from the bundle give the same results; the main loop stays free). Read replica, partitioning `attacks` and replays in object storage stay for real scale (owner hosting).
- [ ] 58. Rotate keys yearly; renew Apple membership; keep up with yearly SDK and target deadlines.

### Phase 9: Friends and Gangs (~6–9 weeks) [Code, design in section 5]
Needs steps 14–15 (deletion, report/block) and 24 (account linking). Build it after Phase 3 and before Phase 7, so it ships at launch. Order:
- [x] 59. Friend codes, share links, QR, one unique name per player (3–18 characters, starts with a letter, no separate display name; classic-game precedent) with direct name lookup (normalized key: case and space/`_`/`-` folded, digits distinct; reserved names and their look-alikes blocked, staff badge, no "Ruler" fallback, 28-day change, 35-day hold, rate limit, "who can find me" setting, migration of existing names), requests, accept, remove, block. Server tables + endpoints + contract tests. **Done:** Names: `src/backend/net/names.ts` (rules, shared with the game for hints), `server/core/names.ts` (new players get the closest free name; strict renames with suggestions, 28-day limit, 35-day hold; `migrateNames` at start-up, oldest keeps a shared name, one free change). Friends: `server/core/friends.ts` (exact-name lookup and friend codes, rate limited `lookup`/`lookupDay`; requests, 14-day lapse, asking back accepts; 100-friend cap; privacy; "formerly"; blocks end friendships both ways); migration 0015; both repo adapters; account deletion covers it. Share links (`?friend=KAGE-XXXXXX`) and QR codes in the game (`src/presentation/ui/qr.ts`, every version decoded with OpenCV). Tests: `tests/backend/server/friends.test.ts` (memory and Postgres), friends contract test, `tests/presentation/qr.test.ts`. Under-13 default `nobody` needs an age band the game does not collect yet.
- [x] 60. Friends panel in the client (list, online status toggle, suggestions from recent opponents and Alliance mates). **Done:** `src/presentation/ui/friendsUi.ts` (rail button when online with a `friends` server): find, your code (Copy, Share link, QR), requests, friends with last online (or hidden), suggestions from real raiders and Alliance mates, privacy, Remove / Report / Block on every card; `Connection` friends methods. Checked in Chromium at 390×844 and 844×390 against a local server; no DOM test (no browser in `npm test`).
- [x] 61. Optional Game Center / Play Games friend import (opt-in). **Done:** `POST /v1/friends/platform` (feature `platform-friends`): only for a caller who linked that platform, ≤ 300 ids, rate limited, hides `nobody` and blocked players. iPhone: `TkAuth.gameCenterFriends` (`GKLocalPlayer.loadFriends`, `NSGKFriendListUsageDescription`), opt-in button in Friends. Play Games: server ready; the Android app needs the Play Games SDK (same gap as Android sign-in). Not compiled here (no Mac): build it once in the iOS workflow.
- [ ] 62. Friendly Duels: duel tickets, re-sim, replay to both players, rivalry tally, optional duel layout, duel challenge. Unranked (test that Honor, loot and ratings never change).
- [ ] 63. Gangs: create, invite friends, accept, leave, hand over, 24 h leave cooldown, Gang chat, Gang troop gifts (reuse donations).
- [ ] 64. [GAMEPLAY] `BattleSetup.startDamage` for relay assaults; bump `SIM_RULES`; tests that a relay of two strikes matches the combined damage and that old records replay unchanged.
- [ ] 65. Gang War server: queue, matching by size → Gang Rating → Power, exclusions, labelled bot Gangs, prep phase with roster lock, battle day, solo and relay tickets with locks, scoring, claims.
- [ ] 66. Gang Rating (reuse `rating.ts`), not changed by bot wars.
- [ ] 67. Gang War client: war map of both Gangs' bases, relay hand-off view, prep-phase layout and reinforcement screen, war log and replays.
- [ ] 68. Push for friend requests, invites, war found or ending, under attack, relay hand-off.
- [ ] 69. Balance: model Gangs (`tests/gameplay/balance/`) fight simulated wars; check a coordinated relay beats four solo strikes by a clear but limited margin, and war chests fit the progression curve.
- [ ] 70. Protocol bump, `docs/PROTOCOL.md`, contract tests for every new route; abuse tests (win trading, roster swapping, a shared member, duplicate claims).
- [ ] 71. Later: live co-op strike over WebSocket lockstep (section 5.5), after asynchronous Gang Wars are proven.

### Totals and shortcut
- About 6–8 months for one developer or AI session, including Phase 9 (Friends and Gangs). Before launch: Apple $99, Google $25, domain ~$15, staging hosting $20–60/month, plus legal.
- Fastest playable online launch: Phases 0, 1, 1.5, 4, 6, 7 on the trusted-local economy, then Phases 2–3 and 9 before promoting competitive play. Friends and Gangs (Phase 9) are required at launch of competitive play. Until Phase 2, saves and purchases stay per device.

## Rules for sessions working from this file
- Keep the honesty rule (bots and simulated raids are labelled), loot-box odds, the never-sold rules and the under-18 cap (root `CLAUDE.md`, `src/backend/CLAUDE.md`).
- Any incompatible protocol change: bump `PROTOCOL_VERSION`, update `docs/PROTOCOL.md` and the contract tests. Any combat-data change: bump `SIM_RULES`. Any village state change: bump `SAVE_VERSION` with a migration.
- Server rules stay in `server/core` (no HTTP/DB code there); game rules stay in `src/gameplay/sim` and are shared, never forked. The only exception is the generated, read-only snapshots of released rule versions in `server/rules/v<N>/` (step 73); never edit them by hand.
- Any combat or data change that ships to players: follow the release order in step 74 (server first, old version kept until its traffic is gone).
- Cost and legal figures above are estimates as of 2026-11. Re-check store fees and policies before acting on them.
