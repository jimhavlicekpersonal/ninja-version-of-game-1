# ECO: economy, monetization and real-money integrity audit (commit 560ce7a, 2026-11-21)

Scope: every IAP path (client, native plugins, server), receipt checks, refunds, double-spend, ads, sinks and faucets, local prices (GLOBAL-007), farming, arbitrage, Sybil, pay-to-win, minors, loot-box and subscription rules.
Method: I read the code (file:line below) and re-checked each earlier claim against it. **Limits:** `node_modules` is absent here, so I ran no test, no `npx tsx` script and no balance tool. All numbers come from the generated `docs/game-theory/CAMPAIGN.md` and from `docs/audit/understand-2026-11-16/economy.md` (measured there, not re-measured here). No device, store sandbox, Postgres or Redis was used. Anything marked "(inferred)" is reasoning from code that I did not execute.

## 1. Verdict table

| Item | Verdict | One-line evidence |
|---|---|---|
| Buy guard against double tap / second purchase while one is in flight (earlier E-1, client) | **FAIL** | `economyUi.ts:133-138` `buyButton` is never disabled after a click, and `buy()` (`:179-224`) has no in-flight flag. The Store modal stays live during `await this.c.purchase()` (`:219`). `controller.purchase` (`controller.ts:329-360`) is not single-flight. |
| Server intent rule for one-time products (earlier E-1, server) | **FAIL** | `purchases.ts:155-165` checks `canPurchase` on the village state, which ignores open intents: two Scroll intents both pass. At redeem, `:338` accepts each against its own intent. `grantPurchase(verified)` (`village.ts:1221-1241`) re-grants a Scroll the village already holds, so the player pays twice for one Scroll. |
| Interrupted payment (killed between store success and redeem) | PASS (code) / NEEDS-DEVICE | Apple: not finished until delivered (`TkStorePlugin.swift:75`); `unfinished` and `Transaction.updates` (`:110-134`); start retry in `main.ts:337-358`. Google: acknowledge-only for device villages (`purchases.ts:229`), `queryPurchasesAsync` (`TkBillingPlugin.java:279-297`). |
| Offline purchase | PASS | `connection.ts:269-271`: with a checking server, an intent needs a connection ("Connect to the internet to buy"), so nothing is charged offline. A retryable redeem failure becomes `PENDING` (`controller.ts:382-383`). |
| Pending (Ask to Buy, slow card) | PASS (code) / NEEDS-DEVICE | `releaseIntent` pending → 7-day hold (`purchases.ts:40,179-191`). Google PENDING is refused and arrives later via listener (`TkBillingPlugin.java:260-268`), and the server refuses `purchaseState` 2 (`google.ts:130`). Device check listed in `docs/store/TESTING.md:24-28`, not run. |
| Family Sharing | PASS (N/A) | Every product is a consumable in both stores (`docs/SHIPPING.md:164-184`), and consumables are not family-shared. |
| Restore purchases | PASS | `controller.ts:446-459` (unfinished plus this season's Scroll from server history); button disabled while running (`economyUi.ts:291-306`). |
| Apple JWS chain | PASS (hardened) / LOW gap | Pinned root, extension OIDs, `checkIssued`, P-256 leaf, bundle and environment (`apple.ts:123-161`). Certificates are checked against server `now`, not the JWS `signedDate` (`:144-146`): see ECO-09. No OCSP (recorded in P3). |
| Google Play API check | PASS | Product match, purchaseState 0 only, test purchases refused on production (`google.ts:120-145`); RTDN OIDC email check (`:190-213`); hourly voided poll (`purchases.ts:517-522`). |
| Replay protection | PARTIAL | Rows are unique per `(store, transactionId)`, and another player gets 409 (`purchases.ts:275-279,360-363`). But a replayed receipt of a purchase delivered on the device is delivered again into a later server village (`:286-299`): ECO-02. |
| Refund / revocation / debt | PASS | `revoke` (`purchases.ts:384-404`), refund notice before redeem (`:271-274`), `revokePurchase` turns spent value into debt (`village.ts` ~1256+), `settleRefunds` for device villages (`controller.ts:469-487`), refund pause after 3 refunds in 90 days per linked devices (`purchases.ts:42-43,135-139`). |
| Idempotent grants / reward-button spam | PASS | `grantPurchase` refuses a repeated id (`village.ts:1222`). Claims are state-checked and synchronous: `claimStipend` returns null when not claimable (`stipend.ts:59-61`). Concurrent redeems are serialised by `lockPurchases`, and the client re-checks `state.purchases` before dispatching (`controller.ts:389`). |
| Android plugin concurrent purchase | PARTIAL (inferred) | `pendingPurchase` is tested at `TkBillingPlugin.java:205` but set later on the UI thread (`:223`). Two quick calls can both pass, and the first `PluginCall` is then overwritten and never answered. Folded into ECO-01. |
| Ads | PASS (N/A, no ad SDK) | `package.json:62-75` lists no ad SDK. `grep -i admob/applovin/rewardedAd/interstitial` over `src/`, `server/` and the Android/iOS build files finds nothing. |
| Jade lifetime supply vs sink model | **FAIL** (unmodelled) | `tools/balance/playerModel.ts:179` spends Jade only on huts. The campaign keeps no Jade ledger. The only free-Jade figure is a 30-day audit scratch measurement (`understand-2026-11-16/economy.md:14-34`, `scripts/economy/econ2.cjs`). ECO-03. |
| Resource sinks/faucets (Coins/Provisions) | PARTIAL | From Keep 8, resources pile up while builders are the limit, and there is no late Coin sink (`economy.md:72-78`, ECO-11 "CU-1 open"). Folded into ECO-03. |
| Local-currency pricing (GLOBAL-007) | PASS (code) / NEEDS-DEVICE | Store prices only (`economyUi.ts:120-131`): "…" while loading, "Price unavailable" and buy disabled when the store fails, "Not sold here" when a product is missing. The confirm uses the store label (`:212-213`). Real storefronts unverified (GLOBAL-007 open). |
| Under-18 cap counted in local money | PARTIAL / OWNER | `countedCents` (`purchases.ts:117-121`) uses `USD_RATES`, but the default is `{USD:1}` (`context.ts:56`), and Google reports no price (`purchases.ts:227-228`), so most purchases count catalog USD. ECO-06. |
| Optimal farming (≥3× activity) | PARTIAL (not re-measured) | No activity ≥3× was found in the existing measurements: a raid nets 0.4-1.7 h of production (`economy.md:79-81`). Late raiding is economically negligible, and casual players lose 96-160 % of their loot to raids (`CAMPAIGN.md:59,128,151`). ECO-04. |
| Arbitrage loops | PASS | Top-up during debt and top-up priced in the paying currency are fixed (`village.ts:1100,1121`). Cancel, dismiss, Scroll-late and stipend loops are closed (`economy.md:99-110`). Jade → training skip → raid is priced by `trainingSkipScaleByHall` (about 1.2-1.5× the top-up rate at Keep 15, inferred from `economy.md:92-94`): not ≥3×. |
| Duplication / rollback detection | PASS (server) | Unique purchase rows, `economyHash` replay, import provenance holds unconfirmed Jade and Scroll (`villageImport.ts:129-170`). Device-held villages are trusted-local by design. |
| Sybil (daily rewards, sandbox credit P4) | PARTIAL / OWNER | Rewards are per village and cannot move between accounts except through raids (capped, exploit #7), donations, alt Gang chests (3-15 Jade, open limit #10) and referrals (Keep + 14 days + device check, L2). The sandbox daily cap is off by default (`context.ts:55`, `config.ts:249`): ECO-07. |
| Pay-to-win boundary | PASS | No combat stat is sold. Jade buys time and top-ups. The Scroll's 20 % speed is time. `$100` = 73 builder-days (`economy.md:118-126`). |
| Keep rushing (E06) | PARTIAL (design) | Warning on the Keep sheet only (`hud.ts:1698`), and only when more than one Keep behind (`objective.ts:106-108`). Nothing in the Jade spend confirm. ECO-08. |
| Variable reward schedules | PASS | The daily chest is free, its exact odds are shown before opening (`dailyUi.ts:152-166`), and it is never sold (`docs/DECISIONS.md:62`). The loss-triggered `rebuild_pack` is `retired: true` (`offers.json`). |
| Goodhart | PARTIAL (design) | Daily login rewards never punish a missed day (good), but late raiding pays about 5 % of passive income (earlier audit) and casual defense loses net value, so the game rewards logging in over playing. ECO-04 / S3. |
| Minors: cap, offers, age gate | PASS (code) / OWNER (legal) | Locked cap with open intents (`purchases.ts:142-151`), cap held at redeem (`:254-262,330-334`), offers only for stated adults (`offers.ts:15-17,40`), age asked before the first buy (`economyUi.ts:144-150`), grown-up second confirm (`:216-218`), under-18 sticky (`purchases.ts:73-81`). Under-13 bands can buy within the $50 cap: a legal question (GLOBAL-006). |
| Refund abuse | PASS | Pause after 3 refunds in 90 days across linked devices and installs (`purchases.ts:92-110,129-139`), debt (`village.ts` revokePurchase). |
| Loot boxes / odds | PASS | Nothing random is sold: product grants are fixed (`productGrantsFor`, `village.ts:1229`) and the chest is free. |
| Subscriptions (Clan Stipend) | PASS | A consumable, not a subscription (`stipend.ts:1-9`). The confirm says "daily payments … claimed one a day" plus its own withdrawal text (`economyUi.ts:196-209`). Nothing renews, so no cancellation is needed. |
| Price clarity | PASS (code) | Real prices only in the Store and its confirm; offer popups show contents and link to the Store with no price (`economyUi.ts:485-499`); in-village Jade confirm has no money figure (`:235-246`). |
| Store price request includes retired product | FAIL (low) | `loadPrices` asks for `offer_rebuild` (retired, not in `storeProductIds`), so `pricesComplete` never becomes true and prices are re-asked on every Store open (`economyUi.ts:99-108`). ECO-10. |

## 2. Work items

### ECO-01 — Double charge for one-time products: no buy guard and no single-open-intent rule (earlier E-1)
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: presentation/ui (with server and gameplay/control)
- Checklist refs: Checklist 3.3 (double-spend / idempotent purchase); Masterclass 19 Economy modeling (real-money integrity)
- Evidence:
  - `src/presentation/ui/economyUi.ts:133-138`: the buy button is enabled from `price()` only and never disabled on click. `buy()` `:179-224` has no in-flight flag. After the confirm closes, the Store modal (still open) is live during `await this.storefront()` (`:206`, up to 10 s on first use) and `await this.c.purchase(productId)` (`:219`), which spans the intent HTTP call, the store sheet and the redeem HTTP call. The pass card redraws only after `buy` resolves (`:437`, `after` = `redraw`).
  - `src/gameplay/control/controller.ts:329-360`: `purchase()` re-checks `canPurchase` against `state`, but `pass.premium` is only set after redeem (`:389-391`), so a second Scroll purchase passes `canPurchase` (`monetization.ts:133`).
  - `server/core/purchases.ts:155-165`: the P2 check runs `canPurchase` on the stored village and ignores this player's open intents. Two intents for `lantern_pass` (or an offer, or the stipend) both pass. The intent check runs only for server-held villages (`if (row)`).
  - `server/core/purchases.ts:338`: each receipt is accepted with its own unused intent for the product. `src/gameplay/sim/village.ts:1221-1241`: `grantPurchase(..., verified=true)` skips `canPurchase` and re-sets `pass.premium` for a village that already has it. **The second $4.99 buys nothing.** A second one-time offer is delivered again (the player gains, and `oncePerAccount` is broken). A pending Ask-to-Buy Scroll (7-day hold) followed by a second request gives the same double charge once a parent approves both.
  - `android/.../TkBillingPlugin.java:205` versus `:223`: the `pendingPurchase` test and its set are not atomic (inferred). A second call can overwrite the first `PluginCall`, whose promise then never resolves, so the client never redeems or finishes that purchase until the next start.
  - No test covers two intents for one one-time product (`tests/backend/server/security-audit-2026-11-20-money.test.ts:94-129`, `purchases.test.ts:135-335`).
- Fix:
  1. `EconomyUi`: add `private buying: string | null`. At the top of `buy(productId)`, return when `buying` is set. Set it before `ensureAge()`, clear it in `finally`. Make `buyButton` render `disabled` while `buying !== null` and redraw the Store when it changes. Show "Purchase in progress…" on the button that was tapped.
  2. `GameController.purchase`: keep a single-flight `private purchasing: Promise<PurchaseOutcome> | null`. A second call while one runs returns `{ ok:false, code:'IN_PROGRESS' }` with the text through `t()` (`locales/en/ui.json`).
  3. `server/core/purchases.ts` `purchaseIntent`: inside the locked transaction, for `product.kind` in `offer|pass|stipend`, refuse (`403 purchase_refused`, new key `purchase.already_in_progress`) when the player has another intent for the same `productId` with `!used && holdUntil > now`. Do this for device-held villages too: the rule needs only the intent table. Add `Repo.openIntentsFor(playerId, productId, now)` to the memory store and the pg store (a query, no schema change; add a new numbered migration only if an index is wanted).
  4. Redeem: when `heldOnServer` and the village already has `pass.premium` for `passSeason(now)` and the product is the Scroll (or `offers.bought` has a `oncePerAccount` offer), do not grant twice. Refuse with `purchase.already_owned`, leave the store transaction unfinished, log it for support/refund, and count `tk_refused_total{reason:'duplicate_one_time'}`. An owner decision is needed on whether to credit a duplicate Scroll to the next season instead.
  5. `TkBillingPlugin.purchase`: claim `pendingPurchase` synchronously (synchronized check-and-set before `connected(...)`) and release it on every early reject.
- Tests: write first: (a) `tests/backend/server/purchases.test.ts` "two Scroll intents: the second is refused while the first is open" (fails today: both return tokens); (b) "a second Scroll receipt for a premium village is not granted and not finished"; (c) `tests/presentation/dom/` happy-dom test: click a Jade pack buy button twice with a pending `purchase` promise, and `controller.purchase` is called once; (d) controller test: two concurrent `purchase()` calls with a slow mock verifier, and the second returns `IN_PROGRESS`.
- Done when: no sequence of taps, devices or Ask-to-Buy approvals produces two credited Scroll purchases (or two `oncePerAccount` offers) for one player in one season in the server tests. All buy buttons are disabled while a purchase runs (DOM test).
- Don't break: real prices only in the Store and its confirm (the progress label carries no price); under-18 cap and GLOBAL-004/005 holds; cancelled intents still free the hold; server owns truth; no SAVE_VERSION or SIM_RULES change needed (none of these fields are stored in the save).

### ECO-02 — Receipt replay re-delivers a purchase already delivered on the device into a later server village (earlier E-2, inferred label)
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: server
- Checklist refs: Checklist 3.3 (replay protection, idempotent grants); Masterclass 19 Economy modeling
- Evidence: `server/core/purchases.ts:279-301`. For a known row with `heldOnServer=false`, the server grants `grantPurchase(verified)` into the player's current server village whenever that village lacks the transaction id. The intent is legitimate: "the device may never have delivered it". Two ways to abuse it:
  - (a) `startVillage` (`server/core/village.ts:134-155`) creates a fresh village after the purchase. A modified client resends the old Apple JWS (bearer token, no age limit, `apple.ts:164-168`) or the consumed Google token (`google.ts:141`: a consumed purchase is still accepted), and every earlier device-delivered purchase is delivered again.
  - (b) `checkProvenance` (`server/core/villageImport.ts:129-155`) rebuilds `purchases` only from records the file carries and never marks credited rows the file left out. A device save with the purchase record stripped imports with its spent progress, then the replay credits the Jade a second time into the same online village.
  - The existing test `purchases.test.ts:295-313` covers only the honest case (Google token never consumed).
- Fix:
  1. In `redeem`'s known-row branch, before granting into the server village: for Google, re-read `p.consumed`. A consumed token whose row is `!heldOnServer` means the device delivered it, so answer `{ already: true, heldOnServer: false }` without granting.
  2. For Apple (no finished signal), grant only when the server village could not have received the purchase from the device: the village row's `createdAt` (startVillage) or its import time (the `import` ledger line, `repo.ledgerSumAt(..., 'import', ...)`) is earlier than `known.at`, or the imported file's own clock (`state` last-settled time) is earlier than `known.at`. Otherwise record an `import_holds`-style hold for staff (`purchase.needs_support`) instead of granting.
  3. In the import path (`villageImport.ts` caller), mark credited `!heldOnServer` rows of this player that the file did not carry as `held_on_server = true` with a ledger note `purchase-not-carried`. A later replay then answers `already` (needs a new numbered migration only if a new column is used; reusing `held_on_server` needs none).
- Tests: write first: `purchases.test.ts` "a consumed Google purchase delivered on the device is not delivered again into a new server village" (fails today: +600 Jade); "an Apple JWS replayed after startVillage is not re-granted"; `ledger-audit.test.ts` "an import that drops a credited purchase record cannot be topped up by replaying its receipt". The honest test at `:295` must still pass.
- Done when: each credited transaction adds its grants to at most one village per player across device delivery, import and new server villages (server tests), and the lost-answer case still delivers once.
- Don't break: server owns truth; a paid purchase is never lost (route doubtful cases to support, never silently drop); Google acknowledge-within-3-days rule; refund and debt flow.

### ECO-03 — Jade (and resource) lifetime supply-vs-sink model is missing; paid and free Jade are not separated
- Severity: MEDIUM
- Status: FAIL
- Kind: DESIGN
- Compartment: gameplay/data (tools/balance, docs/game-theory)
- Checklist refs: Masterclass 19 Economy modeling (faucets, sinks, inflation); Checklist 3.x (economy health)
- Evidence: `tools/balance/playerModel.ts:61,179`: the model player's only Jade use is huts, and `campaign.ts` and `CAMPAIGN.md` record no Jade balance. The only supply figures are a 30-day audit scratch measurement (`docs/audit/understand-2026-11-16/economy.md:14-34`: 232-737 free Jade per 30 days, plus 2,540 one-time from achievements) and its "sinks with nothing worth buying" list (`:49-56`). ECO-09 there says sinks are thin. P5-11 added 6 looks (`WORLDWIDE_AUDIT.md:1126`), not a model. Coins pile up from Keep 8 with no late sink (`economy.md:72-78`, CU-1 open). Jade is one pool (`resources.moonstones`), so the owner cannot state outstanding *paid* Jade. That figure is what Japan's Payment Services Act notices (`public/shikin-kessai.html` is shipped) depend on (legal reading inferred, OWNER to confirm).
- Fix:
  1. `tools/balance/playerModel.ts`: add a Jade ledger by source (chest, streak, calendar, Scroll free track, bounty, wars, league, achievements, obstacles, Trials, seals) and by sink (huts, skips, training skips, top-ups, looks, decor), read from the `grantReward`/command events the sim already emits.
  2. Add a "spender" policy (stipend monthly, Scroll each season) next to the free policies.
  3. `tools/balance/campaign.ts`: write a "Jade lifetime" table (balance, earned, spent at days 30/90/180/365) and a Coins/Provisions surplus-at-cap table into `CAMPAIGN.md` / `campaign.json`.
  4. `tests/gameplay/balance/campaign-gates.test.ts`: gate unspent free Jade at day 365 (upper bound chosen by the owner) and a minimum sink share.
  5. Server: add a staff metric of paid Jade still outstanding (ledger `purchase:*` minus a FIFO share of Jade spends) for the PSA base dates. OWNER confirms the legal need.
- Tests: the new campaign gate first. It fails while `campaign.json` has no Jade ledger fingerprint.
- Done when: `CAMPAIGN.md` shows per-policy Jade supply, sink and balance over 365 days, a gate holds it, and the owner has recorded a target ratio in `docs/DECISIONS.md`.
- Don't break: combat numbers never in balance bundles; `campaign-gates` fingerprint discipline (regenerate with `npm run balance:campaign`); no new paid random item; Jade buys resources only as a one-action top-up.

### ECO-04 — Casual players lose more to raids than they loot; late raiding is economically negligible (earlier D-2; S3 open)
- Severity: MEDIUM
- Status: OWNER
- Kind: DESIGN
- Compartment: gameplay/data
- Checklist refs: Masterclass 19 Economy modeling (reward per minute, Goodhart); Checklist 3.x (casual fairness)
- Evidence: `docs/game-theory/CAMPAIGN.md:59` (casual: 96 % of loot taken by raids), `:128` (casual explorer: 160 %), `:151` (casual who hires: 106 %), against regular 51 % (`:13`) and fortress 35 % (`:197`). The earlier audit measured raid net per training hour at about 35 % of collector income at Keep 10 and about 5 % at Keep 15 (not re-measured here; `economy.md:79-81` gives 0.4-1.7 h of production per raid). `WORLDWIDE_AUDIT.md:1244` S3 "casual players punished" is OPEN. These are offline bot raids: online bot raids do not run (P2-12), so the effect hits offline and device-held play.
- Fix:
  1. Owner decides the target, for example "a one-visit-a-day player keeps ≥ X % of what it loots".
  2. Candidate levers already in data: `raids.json` `exhaustion` / `recoverShare` / `lossStreakSlack` scaled by sessions-per-day, `defenseWin.shareOfRaidLoot` (owner-locked at 0.10; re-run `daily_live.ts` before changing it), a raid-count cap per absent day.
  3. Add a casual "stolen ÷ looted ≤ target" gate to `campaign-gates.test.ts`.
- Tests: the casual stolen/looted gate (fails today at 0.96-1.60).
- Done when: the gate passes with the owner's target and `CAMPAIGN.md` is regenerated.
- Don't break: `defenseWin.shareOfRaidLoot` owner decision; SIM_RULES (no combat change needed); simulated raids stay labelled; no resource reward for real-player raid holds.

### ECO-05 — Store prices and every IAP path still unverified on devices and storefronts (GLOBAL-007, plus purchase-path device checks)
- Severity: HIGH
- Status: NEEDS-DEVICE
- Kind: DEVICE
- Compartment: ops
- Checklist refs: Checklist 3.3 (IAP paths); GLOBAL-007
- Evidence: GLOBAL-007 is still OPEN (`docs/store/WORLDWIDE_AUDIT.md:82-88,238`). The code paths exist (`economyUi.ts:120-131`, `storekit.ts:74-80`, `playBilling.ts:87-101`), but the device script `docs/store/TESTING.md:24-28` (slow card, kill after pay, reinstall restore, Ask to Buy, refund) has never been run. The native plugins are "Not compiled here" (`TkStorePlugin.swift:47`, `TkBillingPlugin.java:184`). The 2026-11-20 security audit "Not run: … a device, a store sandbox".
- Fix:
  1. TestFlight and Play internal track builds against a staging server.
  2. Run `docs/store/TESTING.md` §Play Billing and §iPhone in full, plus: two fast taps on Buy (after ECO-01), a Scroll bought on two devices at once, at least three storefronts (US, a euro storefront, JP or IN) with screenshots of the buttons and confirm against the store sheet, a product removed from one storefront ("Not sold here"), airplane mode on Store open ("Price unavailable").
  3. Record results in the GLOBAL-007 closure row.
- Tests: device checklist (no unit test).
- Done when: GLOBAL-007 is closed with dated device evidence for each path above.
- Don't break: real prices only in Store and confirm; sandbox `(test)` label.

### ECO-06 — Under-18 cap and revenue counted in catalog USD for most purchases; promo and multi-quantity ignored
- Severity: LOW
- Status: OWNER
- Kind: OWNER
- Compartment: server
- Checklist refs: Checklist (minors' spending cap); GLOBAL-007 limit
- Evidence: `server/core/purchases.ts:117-121`: local price counts only with a rate. `server/core/context.ts:56`: the default `usdRates: { USD: 1 }`. `purchases.ts:227-228`: Google has `currency: null, priceMicros: null`, so the catalog price always counts. `google.ts:132-133`: `purchaseType` 1 (promo code) is credited as Production at catalog cents, so a free promo uses up a minor's cap and is counted as revenue. `google.ts:134-144`: `quantity` is ignored (inferred: harmless unless multi-quantity is enabled in Play Console, when a player would pay N and receive 1).
- Fix:
  1. Owner sets `USD_RATES` monthly (`docs/SHIPPING.md:240`). Make `checkConfig` warn in production when Apple payments are on and `USD_RATES` has only USD.
  2. Google: treat `purchaseType === 1` as `environment: 'Promo'` with 0 counted cents.
  3. Refuse or log `quantity > 1` until it is supported. Document "never enable multi-quantity" in `docs/SHIPPING.md` §3b.
  4. (Optional, inferred) read the charged price from the Play Developer API's order data where available.
- Tests: `purchases-batch.test.ts`: "a Google promo purchase counts 0 against the cap".
- Done when: config warning present, promo counted at 0, SHIPPING note added.
- Don't break: under-18 cap only gets stricter; P1 difference check.

### ECO-07 — Sandbox/TestFlight credit has no server-wide daily cap by default (P4)
- Severity: LOW
- Status: OWNER
- Kind: OWNER
- Compartment: server
- Checklist refs: Checklist (Sybil / free currency minting)
- Evidence: `server/core/context.ts:55` `sandboxDailyCapUsd: null`; `server/config.ts:249` sets it only from the environment; `purchases.ts:311-320` per buyer, grouped by client-sent device ids. `WORLDWIDE_AUDIT.md` security audit P4 OPEN.
- Fix: 1. Owner sets `SANDBOX_CREDIT_DAILY_CAP_USD` in production. 2. Code: when `deploy === 'production'`, default `sandboxDailyCapUsd` to a small number (for example 50) or make `checkConfig` an error when unset.
- Tests: `release-config.test.ts`: production config without the variable warns or errors.
- Done when: production cannot start without a sandbox daily cap (or ships with a default).
- Don't break: App Review purchases still credit (per-buyer $10).

### ECO-08 — Paying to rush the Keep: warning only on the sheet, not at the Jade spend (E06)
- Severity: LOW
- Status: PARTIAL
- Kind: DESIGN
- Compartment: presentation/ui
- Checklist refs: Masterclass 19 (whales vs free; spending that harms the buyer)
- Evidence: `src/presentation/ui/hud.ts:1698` (sheet note), `src/gameplay/sim/objective.ts:106-108` (only when `attackerStrength < keep - 1`). `economyUi.ts:235-246` `spendMoonstones` shows no warning for a Keep skip or a Keep top-up. Rushing still meets stronger bases (`economy.md:112-116`, reproduced at 2026-11-16).
- Fix: 1. In the Keep's skip/top-up confirm, append `t('keep.armyBehind')` when `armyBehindKeep(state)` (or when one Keep behind, owner's choice). 2. No hard gate (design: unrestricted).
- Tests: DOM test: the Keep skip confirm contains the note when the army is behind.
- Done when: the warning appears in the spend confirm.
- Don't break: no real-money figure in the in-village confirm.

### ECO-09 — App Store certificate validity checked at server time, not the JWS signing time (inferred)
- Severity: LOW
- Status: NEEDS-DEVICE
- Kind: CODE
- Compartment: server
- Checklist refs: Checklist 3.3 (receipt validation)
- Evidence: `server/payments/apple.ts:143-146` compares every certificate with `this.o.now()`. Apple's own server library uses the payload's `signedDate` when it does no online (OCSP) check (from memory, not checked here). An unfinished transaction whose cached JWS was signed under a leaf that has since expired would get a non-retryable 400 (`purchases.ts:232`), become `REFUSED` (`controller.ts:384`), and stay charged and undelivered (inferred, not reproduced).
- Fix: 1. Check certificate validity at `payload.signedDate` (bounded: not in the future, not older than for example 3 years), keep the chain and signature checks. 2. Check on a device whether StoreKit re-signs `jwsRepresentation` for `Transaction.unfinished`.
- Tests: `purchases.test.ts`: a JWS signed inside the test leaf's validity verifies after the leaf expires.
- Done when: decided from a device check and tested.
- Don't break: P3 hardening (OIDs, `checkIssued`, P-256).

### ECO-10 — Store asks the store for the retired `offer_rebuild`, so prices are never "complete"
- Severity: LOW
- Status: FAIL
- Kind: CODE
- Compartment: presentation/ui
- Checklist refs: GLOBAL-007 (price loading)
- Evidence: `src/presentation/ui/economyUi.ts:102` builds ids from every `offers.rules` entry, including `rebuild_pack` (`retired: true`, productId `offer_rebuild`). It is not in `store.json` `storeProductIds` (removed 2026-11-18, P1-10). `storeProductId` falls back to `offer_rebuild` (`monetization.ts:92-94`), which no store returns, so `pricesComplete` (`:108`) is never true and every Store open re-queries the store.
- Fix: filter `d.offers.rules.filter((o) => !o.retired)` in `loadPrices`.
- Tests: DOM test: with a mock provider returning all live ids, `prices` is called once across two Store opens.
- Done when: test passes.
- Don't break: "Not sold here" for genuinely missing products.

## 3. Verified sound

- **Server intent and cap locking (GLOBAL-004/005):** `purchases.ts:142-169` checks and reserves inside `lockPurchases`. Cancelled intents free the hold and pending ones hold 7 days (`:179-191`). A receipt with no live intent counts at redeem (`:330`). A dearer receipt counts the difference (P1, `:334`). An over-cap receipt is left unfinished, and Google auto-refunds it after 3 days (`:247-262`).
- **P2 holds for server-held villages:** an offer must be active, a Scroll unowned and on sale, a Stipend empty (`:155-165`). Redeem needs the product's own unused intent (`:338-341`). (The parallel-intent gap is ECO-01.)
- **C1 (repeated seq) fixed:** see closure record; `grantPurchase` is not a player command (`village.ts:98`, CLAUDE.md). `staffAdjust` never deepens debt.
- **Apple receipt chain (P3):** extension-id OIDs, CA flags, `checkIssued`, P-256 leaf, ES256 signature, bundle id and environment (`apple.ts:101-161`). Notification bundle binding (`:174-176`). Notifications deduplicated and ordered by `signedDate` (`purchases.ts:446-459`). RESCIND_CONSENT suspends and forces under-18 (`:486-501`).
- **Google:** URL and product match, `purchaseState` 0 only, test purchases refused on production (`google.ts:120-145`, `config.ts:228`). Consume only when the server village holds it, else acknowledge (`purchases.ts:229`). RTDN OIDC with service-account email (`google.ts:190-213`). Voided poll (`purchases.ts:517-522`).
- **Refund before redeem** is refused through refund notices (`purchases.ts:271-274,386-391`). Refund reversal restores exactly what was taken (`:412-430`).
- **Device-held deliveries finish only after the save lands** (`controller.ts:369-373,666-671`). Server-held finish after save (`:393-397`). A redeem network failure keeps the store transaction (`:382-383`).
- **Import provenance:** only server-credited purchases count. Unconfirmed Jade above `freeJadeAllowance` and an unpaid Scroll are held (`villageImport.ts:129-170`).
- **Offers never pop for minors or unknown ages** (`offers.ts:15-17,40`). The offer popup shows no price (`economyUi.ts:485-499`). The loss-triggered offer is retired (`offers.json` `rebuild_pack.retired`).
- **Minors' UI:** age asked before the first purchase (`economyUi.ts:144-150,180`), refused before the confirm when over the cap (`:187-191`), second "check with a grown-up" confirm (`:216-218`). Under-18 is sticky on the server (`purchases.ts:73-81`) and in the sim (`setProfile`, closure #14).
- **Store screen:** real prices only from the store; "…" / "Price unavailable" / "Not sold here" disable buying (`economyUi.ts:120-131`). Bonus percentages are computed from storefront micros in one currency (`:313-330`). An EU "about €" range only in the Store (`:166-172`). Restore button disabled while running (`:291-306`).
- **No ads:** no ad SDK in `package.json:62-75` or the native builds.
- **Nothing random sold:** fixed product grants (`grantPurchase`, `productGrantsFor`). The daily chest is free with exact odds shown (`dailyUi.ts:152-166`, `DECISIONS.md:62`).
- **Clan Stipend is not a subscription:** consumable, payments never lost on a missed day, buyable again when empty (`stipend.ts:1-9,31-37`). Its refund takes claimed Jade back (`village.ts` revokePurchase stipend branch).
- **Arbitrage fixes XPL-04/09** are in code (`village.ts:1100,1121`). `noteTopUp` spreads shares (#9). Season catch-up is bounded (`ranks.seasonCatchUpMax` 2, CLAUDE.md XPL-03).
- **Refund abuse:** a pause after 3 refunds in 90 days, counted per buyer across accounts on the same devices and installs (`purchases.ts:92-139`).
- **Rate limit:** purchase routes 120/h per player (`rateLimit.ts:87`, `routes/player.ts:88-91`).
