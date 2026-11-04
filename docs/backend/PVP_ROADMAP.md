# PvP server roadmap (design + implementation steps)

> **For AI sessions.** This is the agreed design and plan for the online PvP backend, the most important system in the game ("the crown jewel"). Read it before changing `server/`, `src/backend/net/`, payments, or ranking. Owner: BACKEND compartment (`src/backend/CLAUDE.md`), with rating math in `src/gameplay/sim/` (GAMEPLAY).
>
> Status (2026-11-04): **design only, nothing below is implemented yet** unless a step is marked done. When you finish a step, mark it `[x]` here in the same commit.
>
> Tags: **[Owner]** = needs the human owner (accounts, money, legal). **[Code]** = can be done in the repo.

## 0. Current state (facts from the code, protocol v6)

- Server: `server/core/*` (rules, no HTTP/DB), `server/app.ts` (Fastify adapter), `Repo` port with `MemoryRepo` / `PgRepo`, `server/schema.sql` (idempotent, runs on every boot). Stateless API; all state in Postgres.
- Battles are played on the device; the server re-simulates every attack with `runBattle` (10 ticks/s, ≤1,800 ticks) and its result is authoritative. Tickets are single-use and idempotent (`tickets.response`).
- Ranking today = **Honor** (internal name `trophies`), Elo-like (`src/gameplay/sim/ranks.ts`, `ranks.json`):
  - win: `clamp(24 + 0.05·(def − att), 1, 50)`; loss: `clamp(20 − 0.05·(def − att), 2, 40)`; defender moves by the opposite.
  - leagues: sprout 0, fern 400, oak 1000, elder 2000, jade 2800, storm 3600, shadow 4400, kage 5200.
  - monthly season: Honor above 400 is halved toward 400.
  - matchmaking: Keep ±1, ±80 Honor then widening, power floor (`powerSlack` 0.25), bot base (`kind: 'bot'`) when nobody fits.
- Economy is **trusted-local**: village, army, research live on the device; the server checks legality, not ownership (`docs/PROTOCOL.md`, "Trust").
- Payments: StoreKit 2 on iOS (`ios/App/App/TkStorePlugin.swift`) calls `transaction.finish()` immediately and grants Jade on the device. Android and public web purchases are disabled (`src/backend/payments/select.ts`).

### Known gaps (must fix before a competitive launch)

1. **The client picks the battle seed** (`BattleSubmission.seed`). The server must issue it in the ticket.
2. **Every attack and ticket stores a full copy of the defender's base** (~10–20 KB JSON). This is the main storage cost at scale.
3. **No account deletion** (`DELETE /v1/me`): required by Apple 5.1.1(v) and Google.
4. **No chat report/block**: required for user-generated content (Apple 1.2). Only a word filter exists.
5. **No server-side receipt verification**.
6. `schema.sql` migrates on every boot (races with several instances). No rate limiting. `rankOf` counts rows on every leaderboard call.
7. Bot attacks move the attacker's Honor.

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
- Re-sim CPU per battle: **assumed 20–100 ms, not measured yet** (step 18).
- Capacity (8 attacks/player/day, 50 ms per re-sim): 10k daily players ≈ 80k battles/day ≈ 1 vCPU-hour/day; 1M ≈ 8M/day ≈ 5 vCPU average, ~25 at peak. **Compute is cheap; storage (base copies, replays) and the database are the real costs.**

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

## 5. Implementation steps

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
- [ ] 10. Server-issued battle seed in the match ticket.
- [ ] 11. Store each base version once (content hash); tickets and attacks reference it; 30-day replay retention.
- [ ] 12. Migrations as a release step with versioned files (not on every boot).
- [ ] 13. Rate limiting per token/IP; request size limits.
- [ ] 14. `DELETE /v1/me` plus a web deletion form.
- [ ] 15. Chat report/block endpoints and screens; moderation queue.
- [ ] 16. Leaderboard as a Redis sorted set; match locks in Redis.
- [ ] 17. Observability: structured logs, Sentry (client + server), `/healthz`, metrics (re-sim ms, battles/min, desyncs, errors by code).
- [ ] 18. Benchmark `runBattle` on target hardware; record the result in section 2.

### Phase 2: Server-owned economy, protocol 7 (~6–10 weeks) [Code]
- [ ] 19. Tables: `villages` (state JSON + revision), `ledger` (append-only), `command_log`.
- [ ] 20. Command endpoint: replay with the shared sim, check timers against server time, return `stateHash` plus corrections.
- [ ] 21. Client: every action becomes a queued command (reuse the outbox); server state is the truth when online; offline actions stay pending until confirmed.
- [ ] 22. Attacks use up server-held troops in the same transaction as the result; loot comes from the server ledger.
- [ ] 23. Donations take troops from the donor's real army.
- [ ] 24. Account linking (Apple, Google, Game Center, Play Games) = cloud save.
- [ ] 25. One-time upload of existing local saves, with sanity limits per Keep.
- [ ] 26. Protocol 7: update `docs/PROTOCOL.md` and the contract tests.

### Phase 3: Ranking (~2–3 weeks) [Code]
- [ ] 27. `src/gameplay/sim/rating.ts` + `ranks.json` `rating` block + tests.
- [ ] 28. Rating columns; update ratings in `attack()`; bots fixed or excluded.
- [ ] 29. Matchmaking by BR closest to AR (~55% expected score), after the Keep window and power floor.
- [ ] 30. Daily cap on defender Honor loss; BR reset on a big layout change.
- [ ] 31. Power Ranking leaderboard + client panel.
- [ ] 32. Simulate weeks of model players (`tests/gameplay/balance/`) through the matchmaker; check convergence.

### Phase 4: Payments (~3–4 weeks) [Owner + Code]
- [ ] 33. [Owner] Create IAP products with the new ids in App Store Connect and the Play Console.
- [ ] 34. [Owner] Keys as server secrets: Apple App Store Server API `.p8`, APNs `.p8`, Google service account linked in the Play Console.
- [ ] 35. [Code] Apple: send JWS → verify → credit → `finish()`; ASSN v2 refund webhook.
- [ ] 36. [Code] Google: Play Billing plugin → verify token → credit → consume/acknowledge; RTDN + Voided Purchases.
- [ ] 37. [Code] Transaction ids redeemable once; under-18 cap on the server; purchase history; restore.
- [ ] 38. [Code] New product ids in `store.json`, `capacitor.config.ts` and the native projects.
- [ ] 39. [Owner] Test purchases: Apple sandbox testers (TestFlight), Google license testers (internal track).

### Phase 5: Push and native (~1–2 weeks)
- [ ] 40. [Code] Server-sent push via APNs/FCM (raided, war, donations); respect quiet hours and `maxPerDay`; tokens per device.
- [ ] 41. [Owner] Firebase project for FCM; `google-services.json`.

### Phase 6: Launch infrastructure (~1–2 weeks) [Owner + Code]
- [ ] 42. Separate staging and production (databases, secrets).
- [ ] 43. CI/CD: tests → build → deploy to staging → contract tests; production deploys by hand.
- [ ] 44. Automated backups + a practised restore, point-in-time recovery, 2+ API instances.
- [ ] 45. HTTPS on the custom domain; works on IPv6.
- [ ] 46. Load test with recorded battle traffic at 5× expected peak.
- [ ] 47. Status page and alerts: error rate, response times, DB connections, refund spikes.
- [ ] 48. Admin tool: player lookup, grant/revoke, ban, rating reset.

### Phase 7: Store submission (~2–4 weeks) [Owner]
- [ ] 49. Listings: screenshots for iPhone and Android, description, support and privacy URLs.
- [ ] 50. Privacy label, Data Safety form, IARC rating, user-generated content declaration.
- [ ] 51. Apple review notes (how to reach PvP, demo account, odds and deletion are in the app).
- [ ] 52. Closed testing: TestFlight external testers; Google closed track (new personal accounts need 12+ testers for 14 days).
- [ ] 53. Submit; staged rollout / phased release.

### Phase 8: After launch (ongoing)
- [ ] 54. Weekly review: economy, rating convergence, desync rate, refund rate; rebalance through the data files.
- [ ] 55. Seasons: Honor reset, league chests, leaderboard archive.
- [ ] 56. Moderation, support, account-deletion requests within legal time limits.
- [ ] 57. Scale when needed: re-sim worker pool, read replica, partition `attacks`, replays to object storage.
- [ ] 58. Rotate keys yearly; renew Apple membership; keep up with yearly SDK and target deadlines.

### Totals and shortcut
- About 4–6 months for one developer or AI session. Before launch: Apple $99, Google $25, domain ~$15, staging hosting $20–60/month, plus legal.
- Fastest playable online launch: Phases 0, 1, 4, 6, 7 on the trusted-local economy, then Phases 2–3 before promoting competitive play. Until Phase 2, saves and purchases stay per device.

## Rules for sessions working from this file
- Keep the honesty rule (bots and simulated raids are labelled), loot-box odds, the never-sold rules and the under-18 cap (root `CLAUDE.md`, `src/backend/CLAUDE.md`).
- Any incompatible protocol change: bump `PROTOCOL_VERSION`, update `docs/PROTOCOL.md` and the contract tests. Any combat-data change: bump `SIM_RULES`. Any village state change: bump `SAVE_VERSION` with a migration.
- Server rules stay in `server/core` (no HTTP/DB code there); game rules stay in `src/gameplay/sim` and are shared, never forked.
- Cost and legal figures above are estimates as of 2026-11. Re-check store fees and policies before acting on them.
