# BACKEND compartment (Section 3): multiplayer, monetization, store compliance

You are the **BACKEND AI**. You own `src/backend/` (net, social, payments, platform, persist, analytics, pwa), `server/`, `docs/PROTOCOL.md`, `docs/SHIPPING.md`, `ios/`, `android/` and `.github/workflows/`. You call game rules from `src/gameplay/sim`, and never fork or change them.

## Multiplayer (ports and adapters)

- `net/protocol.ts`: routes, types, error codes and `PROTOCOL_VERSION` (now **3**: a deployment may be a Smoke Bomb). Bump it for any change that would break older clients, and update `docs/PROTOCOL.md` and `tests/backend/contract/` with it. Servers report `minProtocol: 2` because battles without abilities replay the same.
- `net/ports.ts` → `ServerPort`; adapters `httpAdapter.ts` and `server/inProcess.ts`. `net/connection.ts` brings server results in only through idempotent commands, deduplicated by `state.net`. Battle reports go through a persisted outbox.
- `social/groveSource.ts`: `LocalGroveSource` (bot Alliance) and `RemoteGroveSource` (server).
- `server/core/` holds every server rule, with no HTTP or DB code. It reaches the outside only through `ServerContext` and the `Repo` port (`MemoryRepo`, `PgRepo`). `server/app.ts` is a thin Fastify adapter. `schema.sql` is idempotent.
- The server re-simulates every attack with `runBattle`. Smoke charges come from the army (`smokeCharges`), so no new stored fields are needed. The server applies the loot penalty once. The client must not apply it again.
- **Honesty rule:** when nobody fits, the server sends a generated base with `opponent.kind: 'bot'`; the client labels it. Simulated raids are flagged `simulated: true`.
- Internal names stay stable (`grove`, `toadstool-kingdoms` in `/v1/hello`). See `docs/rebuild/ID_MAP.md`.

## Monetization and compliance (keep these rules)

- Payments go through `PaymentProvider`: mock (web), StoreKit 2 (iOS, `ios/App/App/TkStorePlugin.swift`). **Android purchases are disabled** until Google Play Billing is added; ask the owner first.
- Real prices only in the Store and its confirm step. Clear confirm on every purchase (FTC/Epic lesson). Under-18 spending cap. Chat filter on.
- Paid random items need their odds shown before purchase (App Review 3.1.1), and the loot-box laws in each market must be checked first. The daily chest is free and never sold. Streak repairs, ability charges and trial rewards are never sold.
- New app identity: the display name is "Kagemura". The bundle id is still `com.toadstoolkingdoms.app`, and product ids are unchanged. Changing them means a new App Store / Play listing (owner steps in `docs/SHIPPING.md`).

## Checks

`npm test` (server tests use memory; set `TEST_DATABASE_URL` for Postgres), `npm run typecheck:server`, `npm run server:build`, `CONTRACT_URL=… npm run test:contract` against a deployed server.
