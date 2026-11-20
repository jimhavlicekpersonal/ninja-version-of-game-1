# Economy, sinks/faucets and monetization: investigator notes (key: economy, prefix ECO-)

Read-only pass on 2026-11-16 against the checkout at `9bf76af`. Nothing in the repository was changed.
Numbers come from three node scripts over the live JSON (`econ1.cjs`, `econ2.cjs`, `econ3.cjs` in this folder), two
scratch vitest files run from outside the repo (`eco-scratch/eco.test.ts`, `eco-scratch/eco2.test.ts`, 7 tests, about 1 s), and
the generated `docs/game-theory/CAMPAIGN.md`. Versions are from `docs/STATUS.md` (battle rules 7, save 23, protocol 11,
14 store products). Not run: `npm test`, the campaign, the build. Model-player results are not observed play.

How each finding was checked is marked: **measured** (arithmetic over the data files or the generated campaign),
**reproduced** (the sim was driven to show it), **read-in-code**.

## 1. Answers to the questions asked

### Free Jade per 30 days for a daily player (measured, `econ2.cjs`)

| Source | Jade / 30 days | Where |
|---|---|---|
| Daily chest (15 % × 3 + 5 % × 10) | 28.5 | `daily.json` chest |
| Streak top step, once per 7 days | 21.4 | `daily.json` streak `jadeEveryDays` 7 |
| 28-day calendar | 48 first cycle, 91 after (45 + 40 repeat) | `daily.json` calendar |
| Season Scroll free track | 150 (all 30 tiers), 45 (15 tiers) | `pass.json` |
| Bounty Hunt, every 14 days | 75 at three stars, 21 at two | `events.json` |
| Alliance War (generated), weekly, needs 1 attack | 43 (all losses) to 171 (all wins), about 107 expected | `social.json` groveRaid |
| League chest, monthly | 10 to 200 (Iron 50, Obsidian 100) | `ranks.json` |

Totals: casual (Cedar, 15 tiers, two-star bounty, war losses) 232, then 275; regular (Iron, full pass) 480, then 523;
engaged (Obsidian, war wins) 595, then 637; top league 695, then 737. One-time: 500 at the start, 91 from obstacles,
2,540 from achievements, 30 from Trials.

Against the store: the $9.99 Box is 600 Jade and the $2.99 Clan Stipend is 360. A regular daily player earns about
the Box every month for free. The balance audit's "130 to 390" (JD-1) no longer holds; the calendar and the war chest
put it back near the first audit's 540.

### Pack values, dominated and dominant purchases (measured)

Jade per dollar: Pinch 45.5, Pouch 50.3, Bag 56.1, Box 60.1, Chest 65.0, Vault 70.0, Hoard 75.0. Monotonic, no pack
dominated by another pack. Stipend 120.4. Season Scroll 68.1 on Jade alone (340), plus resources, a look and 20 %
faster building and research.

- **Dominant:** the Season Scroll. At Keep 8+ its 20 % build speed alone saves about 37 builder-days a season with
  five builders, roughly 3,800 Jade of skips, more than the $49.99 Vault. This is the genre norm for a pass and is honest.
- **Dominated while the alternative is on sale:** Bag ($4.99, 280) by the Scroll ($4.99, 340 and more) and by the
  Artisan's Bundle ($4.99, 650); Box ($9.99, 600) by the Bundle; Pinch plus Pouch ($2.98, 145) by the stipend ($2.99, 360).
- Offers with full storage convert their resources to Jade at top-up prices (reproduced): Starter 366 Jade for $1.99
  (184/$), Keep Celebration 714 for $4.99 (143/$), War Supplies 284 for $2.99 (95/$). All beat every pack.

### Sinks with nothing worth buying

Complete list of Jade sinks in code (`village.ts`: `place` of a hut, `skip`, `skipResearch`, `skipTraining`, `topUp`,
`buySkin`, Jade decor): Artisan's Huts 250/500/1,000 (1,750), six Keep looks 200 to 900 (2,750), decor 20/60/120
(680 for all), time skips, top-ups. No shield, no preset slots, no rename.

- Keeps 1 to 4: timers are under an hour, so skips are 1 to 17 Jade and the only real sink is the huts. Fine.
- From about week 6 a free daily player has all five huts (500 start + about 800 early achievements and obstacles +
  about 500 a month; my estimate from the tier thresholds, not simulated). After that the only sink is skips; top-ups
  are a bad buy after Keep 5 (next section).

### Production, storage and costs per Keep (measured, `econ1.cjs`)

| Keep | Coins/h (maxed) | Storage cap | Next Keep cost | Hours of production | New demand at this Keep, Coins / Provisions (days of production) | Builder-days |
|---|---|---|---|---|---|---|
| 2 | 1.6 k | 10 k | 4 k | 2.5 | 0.9 / 0.3 | 0.0 |
| 5 | 17.5 k | 908 k | 500 k | 28.6 | 7.3 / 2.5 | 2.9 |
| 6 | 25.8 k | 2.56 M | 1.23 M | 47.8 | 14.1 / 4.8 | 7.1 |
| 7 | 32.7 k | 3.97 M | 1.79 M | 54.7 | 19.5 / 4.2 | 14.7 |
| 8 | 56.9 k | 9.52 M | 2.59 M | 45.6 | 11.5 / 6.8 | 80.9 |
| 10 | 149 k | 22.9 M | 5.45 M | 36.5 | 10.4 / 5.5 | 227.5 |
| 12 | 424 k | 85.1 M | 11.5 M | 27.0 | 9.8 / 5.3 | 261.4 |
| 14 | 1.24 M | 317 M | 24.1 M | 19.4 | 10.1 / 6.4 | 401.6 |
| 15 | 1.78 M | 491 M | – | – | 8.0 / 4.0 (+ 35.7 days of Provisions for full-roster research) | 312.2 |

- Overflow: Keep 2 only (eight hours of collectors = 12.8 k against a 10 k store). From Keep 6 eight hours of
  collectors is 3 to 8 % of storage. No single item costs more than 40 % of storage at any Keep.
- Starvation: Coins at Keeps 6 and 7 (14 to 19.5 days of production for 7 to 15 builder-days of work: builders idle).
  From Keep 8 it flips: 81 to 402 builder-days against 7 to 11 days of production (resources pile up, builders bind).
- Timers: average upgrade step 6.7 h at Keep 7, 37.5 h at Keep 8, 76 h at Keep 9, 105 to 147 h from Keep 10. There are
  214 week-long steps from Keep 9, 120 of them on the twelve collectors (levels 15 to 24).
- Research is paid only in Provisions (the Coins share is 0 at every Keep). Full roster to the Keep 15 cap: 1.53 B
  Provisions, 81 days on three lanes. The bot-mix army alone: 171 M, 4 days of production.
- Raid arithmetic: a capped bot-mix army costs 0.22 to 0.49 of one resource's average loot, 1 to 2.2 hours of
  Provisions production, 0.1 to 1.7 hours to train. With the campaign's real results a raid nets 0.4 to 1.7 hours of
  production (Keep 15: 6.2 M looted, 3.98 M army, 0.6 h).

### Skip and top-up curves against the genre (measured)

- Building and research skips: 1 h 15, 1 day 180, 7 days 720 Jade. At the Box rate that is $3.00 a day and $12 a
  week; Clash of Clans is about $2.2 a day and $8.3 a week (from memory of its gem prices, not checked). About 1.4×
  the genre, with far more free currency. Fine.
- $100 (7,500 Jade) skips 73 builder-days at the weekly rate. Skipping every timer of one Keep costs 10.8 k Jade at
  Keep 8 and 20 k to 42 k at Keeps 10 to 15. Every building timer in the game: 197.6 k Jade (about $2,600); every
  research: 112.6 k (about $1,500).
- Top-ups: one hour of income costs 15 Jade at Keep 1, 97 at Keep 5, 198 at Keep 10, 550 at Keep 15. A day of income
  costs 8,079 Jade at Keep 15; a 24-hour skip costs 180. Top-ups are a 37× worse buy at Keep 15 than at Keep 1 (CU-5 holds).
- Finishing army training is multiplied by the same table: a 1.45 h Keep 15 army costs 461 Jade (about $6) per extra
  raid, 128 at Keep 10, 21 at Keep 5. The same 1.45 hours on a building costs 19.

### Arbitrage loops checked

| Loop | Result |
|---|---|
| Top-up, then cancel | Closed (CU-3): the topped-up share returns as Jade, training 100 %, upgrades and research 50 %. |
| Cancel at full storage | Closed (CU-7): refused with `STORAGE_FULL`. |
| Dismiss after research | Closed: refund is 50 % of the price paid (`armyPaid`). |
| Train at the 25 % event discount, cancel later | No gain: the refund is the discounted price paid. |
| Many small top-ups or skips | No gain: both curves are concave, bulk is cheaper. |
| Season Scroll tiers claimed late | Closed (CU-6, `pass.tierKeep`). |
| Stipend refund or stacking | Closed (`addStipend`, `revokePurchase`). |
| Training queue as a raid-proof bank | Open but small: up to two armies' Provisions at 100 % refund; a raid takes at most 2 % of a full store. |
| Offer bought at full storage | Open: resources convert to Jade at the top-up price (143/$ on the Keep Celebration). Situational, since late storage is rarely full. |
| Calendar or chest claimed after a Keep-up | Not stackable (one claim a day, no backlog). |

### Is rushing the Keep still harmful (E06)? Yes (reproduced)

Rushing Keeps 1 to 15 with top-ups and skips costs 44,944 Jade ($600 to $750). A Keep 15 village with level-1
research reads `attackerStrength` 13.5 and meets only Keep 14 bases (8 of 8 seeds); its raiders are Keep 14 armies of
293 housing. A rushed Keep 8 meets only Keep 7 bases. Nothing warns the buyer, and `nextObjective` recommends the Keep
whenever it is affordable (`objective.ts:95`).

### What a spender gets

- $5: the Season Scroll is the best buy (340 Jade, 10 to 20 hours of production in supplies, a look, 20 % faster
  building and research), or the Bag, which is 50 hours of skips or the third hut.
- $20: 1,300 Jade. At Keep 5 that finishes every timer the Keep unlocks (809) and buys a hut. At Keep 10 it is 6 % of
  the Keep's builder time.
- $100: 7,500 Jade, 73 builder-days: about 70 % of Keep 8's timers, a quarter to a third of a Keep from Keep 10.
- Not pay-to-win: no combat stat is sold. Satisfying early, thin late, in line with the genre at the top end.

### "Not fixed (design decisions)" items and the numbers I would use

- **E03 stipend:** leave at 12 a payment. It is 2.1× the same-price pack rate, modest for a monthly card, and adds
  about 70 % to a free player's income.
- **E05 skip curve:** leave. The remaining problem is sinks, not prices.
- **CU-5 top-up curve:** regenerate with exponent 0.75 instead of 0.5 (`tools/balance/topup.mjs`). One hour of income
  then costs 70 to 207 Jade from Keep 5 (now 97 to 550), a raid's loot 268 to 830 (now 268 to 2,428), a full rush
  27,205 Jade (now 44,944), and offer supplies stay at 1 to 3.3 hours of production at every Keep (now 0.34 at Keep 15).
  Decouple `trainingSkipScaleByHall` so a top-up stays about 4.5 to 7 times skip-and-raid: 1 at Keeps 1 to 5 rising to
  3 to 5 at Keep 15 (now 15.1). Table in `econ3.cjs`.
- **DM-2 / PS-1 defense:** the values are already written and hooked: `raids.carryByStars [0.1, 0.4, 0.7, 1]`,
  `raids.defenseWin { shareOfRaidLoot 0.15, perStar, uncapped }`, `raids.raiderMatch { lo −1, hi 0 }`,
  `economy.garrisonCrew 2` (`docs/game-theory/rules10/rules10_data_patch.json`, hooks at `defense.ts:206-245`,
  `matchmaking.ts:272`, `village.ts:427`). They are not in live data. I could not run the campaign to confirm them.

## 2. Claimed fixes, checked against today's code

Real: E01 (`offers.ts:206-210`), E02 gameplay side, E03 (12 a payment), E05 (`skipCurve`, `trainingSkipCurve`,
`jadeEveryDays`), E08 (`docs/SHIPPING.md:168-181` lists all 14), E12 (`groveRaid.ts:162-189`), E13 (`net.ts:102`),
E16, E18 (`village.ts:1553-1568`), E27 (`pass.ts:188-200`), CU-3 (`village.ts:1030-1052`, `1619-1642`), CU-6
(`village.ts:1311-1327`), CU-7.

Still open: E06, E10 (`leagueWinBonus`, `village.ts:1773`, unscaled), E19 (partly), CU-1, CU-2, CU-4, CU-5, DM-2, PS-1
(`campaign-gates.test.ts:102-108` holds the failing expectation), and the casual raid tax
(`campaign-gates.test.ts:87-89` gates only the regular player).

## 3. Problems

**ECO-01 (critical, measured): raids against the village take more than a casual player loots.**
`CAMPAIGN.md`: regular 972 M taken against 1,534 M looted (63 %); casual 549 M against 352 M (156 %); casual explorer
859 M against 322 M (266 %). Held: 0 % at every Keep from 4 for every policy, including the defender. Paid for held
raids over a whole campaign: 0 (regular), 600 Coins (defender). The defender reaches Keep 15 on day 113, the same day
as the raider. Per bot raid the village loses 1.3 hours of production at Keep 5 and 2.6 to 3.2 from Keep 8, while its
own raid nets 0.4 to 1.7 after the army's cost. ("Looted" and "taken" are both Coins plus Provisions; looted is what
was banked, `playerModel.ts:351`.)
Mechanism: `economy.json` `collectorHoursCap` 8 with `raidableUncollectedFraction` 0.5, not covered by
`storageLootCapByHall` (`defense.ts:63`): at Keep 15 full collectors expose 7.1 M per resource. A once-a-day player
always has full collectors. Attacking drops the shield (`village.ts:1803`), so an active raider is raided about twice a
day. The held reward is 5 % of the minimum loot (5 to 16 minutes of production).

**ECO-02 (high, reproduced): unclaimed Season Scroll rewards, including paid ones, vanish at the season roll.**
`pass.ts:306` replaces the pass state. A village with the premium Scroll and 20 tiers unlocked but unclaimed went
through the roll with Jade +0 and Coins +0 (260 premium Jade, 70 free Jade and all supplies gone). No auto-claim, no
warning.

**ECO-03 (high, read-in-code): daily tasks pay nothing for the last third of a season.**
`claimTask` grants only pass points (`village.ts:1317-1328`), and tiers stop at 30. A player who does everything
earns 471 points a day and finishes on day 19; the remaining 11 days pay nothing. The tasks themselves are chores at
late Keeps: "Collect 44,000 Coins" at Keep 15 is 90 seconds of production.

**ECO-04 (high, measured): top-up and army-finish prices are out of line late; offers scaled by the same table are hollow.**
See the curves above. Keep Celebration supplies: 2.29 h of production at Keep 5, 1.05 h at Keep 10, 0.34 h at Keep 15.
War Supplies ("Provisions for your warriors"): 1.4 armies at Keep 5, 0.37 at Keep 10, 0.095 at Keep 15. Starter Pack
supplies at Keeps 4 to 5: 17 to 22 minutes of production.

**ECO-05 (high, reproduced): the Artisan's Bundle is offered when it cannot do what it says.**
With four huts the next costs 1,000 Jade; the offer is raised (`canHireArtisan`, `village.ts:464`, `867`) with 650
Jade and the text "Jade to hire another Village Artisan, plus a little extra."

**ECO-06 (medium, reproduced): the Scroll's "≈ N Jade value" is inflated up to 65× the same-price pack.**
`passPremiumValue` prices supplies as top-ups, the worst rate in the game, and assumes every task is done every day.
Shown value for $4.99: 1,573 Jade at Keep 3, 2,314 at Keep 5, 6,480 at Keep 10, 18,176 at Keep 15. The $99.99 Hoard is 7,500.

**ECO-07 (medium, measured): "Settle the score" loses resources even at three stars.**
`rematch.shareOfRaidLoot` 0.15: three stars pay 96 k + 96 k at Keep 10 against a 267 k army; 1.44 M + 1.44 M at Keep 15
against 3.98 M; 5.25 k + 5.25 k at Keep 5 against 17.4 k.

**ECO-08 (medium, measured): league win bonuses are noise (E10 open).**
Flat 1 k to 80 k of each resource per three-star win. With the campaign's honor and stars: about 22 % of a raid's
banked loot at Keep 5 (Iron), 4.8 % at Keep 10 (Ember), 0.7 % at Keep 15 (Storm). Honor has no economic meaning late
between monthly chests.

**ECO-09 (medium, measured): Jade sinks are thin and free Jade is about the $9.99 Box every month.**
See sections above. Looks are two colours each in `cosmetics.json`, so more of them are data plus names.

**ECO-10 (medium, reproduced): paying to rush the Keep harms the buyer and nothing says so (E06).**

**ECO-11 (medium, measured): the two currencies carry unequal loads (CU-1 open).**
Research is 100 % Provisions; Coins bind at Keeps 6 to 7, Provisions at 13 to 15; all 125 walls to level 13 cost 52.5 M
Coins in total (30 hours of Keep 15 production), so there is no late Coin sink.

**ECO-12 (medium, measured): timer cliff at Keeps 8 and 9.** Builder-days per Keep 14.7, then 80.9, then 114.9, then 227.5.

**ECO-13 (low, read-in-code): the retired Rebuild Kit is still a store product.** `offers.json` marks it `retired`; it
is still in `store.json` `storeProductIds`, `ios/App/Products.storekit`, `docs/SHIPPING.md:179` and the status count of 14.

**ECO-14 (low, measured): small inconsistencies.** Keep 2 collector overflow; fixed rewards follow loot, not
production, so the daily chest is worth 0.51 to 1.13 hours of production depending on the Keep; declared stakes pay
only +10 % / +25 % for all-or-nothing; the training queue can bank two armies of Provisions.

## 4. Elements that should not be changed

1. Top-ups as "exact and immediate": no exchange, the action runs in the same command, failure buys nothing, nothing
   sits in storage, nothing counts as collected.
2. The refund ledger: purchases keep what they delivered, a refund becomes a debt income repays, a reversed refund
   returns exactly what was taken; cancels refund the topped-up share as Jade and are refused when they would not fit.
3. The Clan Stipend as a consumable: missed days are never lost, no stacking, old stipends keep their rate.
4. The daily chest and streak: odds shown, seeded and salted draw, never sold, a missed day steps back one.
5. Season Scroll honesty: no sale in the last four days unless 15 tiers are unlocked, tiers scale at unlock, tasks
   are fixed at the start of the period, adaptive targets, impossible tasks not offered.
6. Offer rules: adults who said so only, one a session, real deadlines, Starter first, the Store shows exactly what
   will be delivered.
7. Raid-loot shaping in `raids.json` and `ranks.json`: exhaustion, loot penalty both ways, diversity carry, opt-in
   stakes, the 3 % Next fee with rival clans that differ in loot.
8. Fixed-reward plumbing: one Keep table, rewards report what was granted and what overflowed, warn-first before a
   chest; plus the fixed 14-day event schedule and pay-once ladders (Bounty, Trials).

## 5. Opportunities

1. Shadow Trial attempts that spend no warriors (rewards are already once per tier): something to play while armies train.
2. A league ladder that pays: win bonus as a share of banked loot by league.
3. Revenge that pays back what the raider took, by stars.
4. Bonus tiers after tier 30 on the free track (supplies only).
5. More goal events on the existing ladder code and more passive effects (`scoutFeeDiscount`, `researchDiscount`).
6. Skill tasks on stats that already exist (`defensesWon`, `rematchesWon`, daily `trialsCleared`, `donations`).
7. Honest Jade sinks: more Keep looks, paid army-preset slots.
8. `queuedArmies` 1 → 2: three raids a session instead of two.

## 6. Lower-priority notes

- A free player owns all five huts in about six weeks; in the genre the last builder is the main early purchase.
  A design choice, consumer-friendly; the Artisan's Bundle has a short life because of it.
- An adult can see two or three offer pop-ups a week (Bundle weekly, War Supplies every six days, Keep Celebration per
  Keep). Deadlines are real.
- `passPointsPerDay` assumes all three weeklies; a casual player reaches about tier 15 (45 free Jade).
- Under-18 cap of $50 allows one $49.99 Vault a month and never the Hoard.
- Events run 264 of every 336 hours; four kinds only.
- Calendar supply days are 0.2 to 0.4 hours of production, a third of a daily chest.
- Owner-only: store products for `offer_keep` and the decision on regional price tiers (E09); real spending data.
