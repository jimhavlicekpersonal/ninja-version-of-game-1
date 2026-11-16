# Pacing and difficulty curve: investigation notes (key: pacing, ids PAC-)

Read-only investigation, 2026-11-16. Nothing in the repository was changed. All "measured" numbers come from
scratch scripts in this folder that load the real sim and the real model player (`tools/balance/playerModel.ts`)
through Vite SSR with the data patched in memory only:

- `keeptable.cjs`, `maxout.cjs`, `research.cjs`: tables over `src/gameplay/data/*.json`.
- `casualwall.mjs`: the casual model player instrumented day by day (income by source, stolen, spend, builders).
- `variants.mjs` + `v1..v7.json`: what-if runs (data patched in memory), casual and regular, to Keep 7/8/15.
- `firsthour.mjs`: the first 90 minutes. `trialcap.mjs`: how far a maxed Keep 15 army climbs the Trial ladder.

The baseline run of `casualwall.mjs` reproduces the committed campaign exactly (Keep 5 day 12.7, Keep 6 day 38.7),
so the what-if numbers are comparable with `docs/game-theory/CAMPAIGN.md`. Single seed each: day figures carry
roughly ±2 days of noise (raid times are seeded).

## 1. What builds the casual Keep 5 -> 6 wall (26 days)

Casual model: one visit a day at 18:00, two rounds 10 minutes apart, 2 artisans, never hires a third, never queues
a second army, Trials every 4th day.

Keep 5 stretch, days 14-38 (25 visits), Coins + Provisions together (`casual_baseline_log.txt`):

| Flow | Total | Per day |
|---|---|---|
| Collected from Mints/Farms | 2,241,000 | 89,640 |
| Raid loot (18 raids) | 556,000 | 22,240 |
| Daily chest | 775,000 | 31,000 |
| Trials + tasks | 44,800 | 1,800 |
| **Stolen by bot raids (27 raids)** | **2,343,000** | **93,720** |
| Training + research | 296,000 | 11,840 |

Stolen = 105 % of everything the collectors produced, 65 % of all income. Net about 39 k a day against a 500 k Coin
Keep plus about 700 k Provisions of storage/camp/Dojo prerequisites: about 30 days. Three mechanisms, in numbers:

1. **Collector cap.** `economy.json:72 collectorHoursCap: 8`: a once-a-day player banks 8 of 24 hours (33 %); a
   4-session player (gaps 4.5/5.5/4/10 h) banks 22 of 24 (92 %).
2. **Savings trap.** A raid takes `min(20 % of stored, storageLootCapByHall[Keep])` per resource plus 50 % of what
   sits uncollected (`economy.json:73-74`, `defense.ts:63-70`). Keep 5 cap 60,000 (`raids.json:143`). Raids come
   12 % per hour slot (`raids.json:47`), mean 8.3 h after leaving, then a 12-16 h shield (`raids.json:32-43`), and
   attacking ends the shield (`village.ts:1823`): a daily raider is hit about 1.1 times a day (27 in 25 days; two
   in one day on 7 days). Equilibrium stock where income equals losses: with about 45 k Coins a day of income the
   Coin stock stalls at about 280-320 k. The log shows exactly that: Coins 256 k-321 k on days 27-35, no progress
   for 9 days; the Keep was bought only after a day without a raid (day 38) once Mints reached level 8.
3. **Two upgrades a day.** Keep 5 timers are minutes (longest single upgrade 3.7 h; everything new at Keep 5 is
   2.8 builder-days), but each artisan starts one job per visit, so a one-visit player gets 2 upgrades a day and
   the artisans idle about 23 h. Taking 5 Mints + 5 Farms from level 4 to 10 alone is 60 upgrades. The model
   arrives at Keep 5 with Mints at 4/3/3/3 and is still at 8/8/8/8/8 on day 38 (cap 10).

Model fidelity (the committed casual is pessimistic; see PAC-09): `train()` stops at camp capacity
(`playerModel.ts:273`) although `queuedArmies: 1` (`economy.json:77`) lets a second trained army wait, so a real
casual can raid twice per visit; no campaign sets `hireBuilders` although the 500 starting Jade cover the 250-Jade
third artisan.

### What-if runs (casual, days; regular in brackets where run)

| Change (in memory) | Keep 5 | Keep 6 | Keep 7 | Keep 8 | K5->6 | Regular K6 / K7 |
|---|---|---|---|---|---|---|
| Baseline | 12.7 | 38.7 | 56.4 | 75.4 | 26.0 | 9.4 / 16.6 |
| `collectorHoursCap` 12 | 11.7 | 30.7 | 47.4 | | 19.0 | 9.4 / 16.4 |
| `collectorHoursCap` 16 | 11.7 | 26.7 | 47.4 | | 15.0 | |
| `collectorHoursCap` 24 (V1) | 8.7 | 23.7 | 44.4 | 52.4 | 15.0 | 9.4 / 16.4 |
| `raidableUncollectedFraction` 0.25 only | 12.7 | 38.7 | 56.4 | | 26.0 | 9.4 / 16.6 |
| Keep 5 loot cap 60 k -> 40 k only | 12.7 | 33.7 | 60.4 | | 21.0 | 9.4 / 16.6 |
| Keep 6 cost 500 k -> 400 k only | 12.7 | 27.7 | 56.4 | | 15.0 | 9.0 / 16.6 |
| Keep 6 cost 500 k -> 350 k only | 12.7 | 26.7 | 55.4 | | 14.0 | 8.6 / 15.6 |
| Shields 16/20/24 h only | 13.7 | 34.7 | 52.4 | 67.4 | 21.0 | |
| cap 24 + shields 16/20/24 (V2) | 8.7 | 22.7 | 41.4 | 51.4 | 14.0 | |
| **cap 24 + shields + uncollected 0.25 (P)** | 8.7 | 21.7 | 39.4 | 51.4 | **13.0** | 9.2 / 15.4 |
| cap 24 + shields + loot caps x0.6 at Keeps 5-8 | 8.7 | 21.7 | 37.4 | 50.4 | 13.0 | |
| cap 24 + Keep 6 400 k | 8.7 | 16.7 | 44.4 | | 8.0 (then K6->7 27.7) | |
| Baseline, model hires artisans | 10.7 | 26.7 | 51.4 | 87.4 | 16.0 | 10.2 / 15.0 |
| cap 24, model hires artisans | 5.7 | 16.7 | 28.4 | 39.4 | **11.0** | 9.6 / 14.4 |

Full campaigns to Keep 15:

| | K5 | K6 | K7 | K8 | K9 | K10 | K11 | K12 | K13 | K14 | K15 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Regular baseline (CAMPAIGN.md) | 4.2 | 9.4 | 16.6 | 23.0 | 28.4 | 33.4 | 42.2 | 51.2 | 64.6 | 85.2 | 113 |
| Regular with P | 3.7 | 9.2 | 15.4 | 20.4 | 28.0 | 33.0 | 41.0 | 51.2 | 64.2 | 85.2 | 113 |
| Regular baseline, hires artisans | 4.2 | 10.2 | 15.0 | 19.2 | 25.7 | 30.0 | 40.0 | 48.2 | 59.6 | 75.0 | 91.2 |
| Regular with P + economy timers <= 3 d | 3.7 | 9.2 | 15.4 | 20.4 | 28.0 | 33.0 | 41.0 | 51.2 | 64.0 | 81.6 | 98 |
| Casual baseline (CAMPAIGN.md) | 12.7 | 38.7 | 56.4 | 75.4 | 93.4 | 120.4 | 152.4 | 169.4 | 186.4 | 214.4 | 246.4 |
| Casual with P | 8.7 | 21.7 | 39.4 | 51.4 | 65.4 | 78.4 | 95.4 | 120.4 | 146.4 | 173.4 | 207.4 |
| Casual baseline, hires artisans | 10.7 | 26.7 | 51.4 | 87.4 | 99.4 | 115.4 | 139.4 | 152.4 | 173.4 | 214.4 | 236.4 |
| Casual with P + economy timers <= 3 d | 8.7 | 21.7 | 39.4 | 51.4 | 65.4 | 78.4 | 95.4 | 120.4 | 146.4 | 173.4 | 197.4 |

**Smallest change that meets the brief:** P = three keys.
- `economy.json` `collectorHoursCap` 8 -> 24
- `economy.json` `raidableUncollectedFraction` 0.5 -> 0.25
- `raids.json` `shieldTiers[].hours` 12/14/16 -> 16/20/24

Casual Keep 5 -> 6: 26.0 -> 13.0 days; casual Keep 6 by day 21.7 (was 38.7); casual Keep 15 day 207 (was 246).
Regular: Keep 15 unchanged at day 113; the largest speed-up anywhere is Keep 8 (23.0 -> 20.4, 11 %), Keeps 9-15
within 3 %. With the third artisan hired the casual stretch is 11 days.

Follow-ons the three keys force:
- `economy.json:82 collectBubbleMinFraction` 0.02 -> 0.007, else the first collect bubble moves from 9.6 minutes of
  production to 28.8 (`VillageScene.ts:351`).
- `buildings.json:191` and `:417` descriptions say "Holds 8 hours of output": two data strings, 49 translations.
- `tests/gameplay/sim/raids.test.ts:86-88` pins shield hours 12/14/16.
- The Treasury sheet rule text reads the numbers from data (`hud.ts:1459`), no text change.
- Do **not** use the Keep 6 cost lever: `curves.test.ts:45-55` requires the early cost multiplier never to shrink
  (x4, x5, x5, x5); 400 k would be x4 after x5. It also only moves the wall to Keep 6 -> 7 (27.7 days).

## 2. What each Keep unlocks, and the dead stretches

From `hall.json`, `troops.json`, `battle.json` heroes (`keeptable.cjs`):

| Keep | New building types | Other structure | Warriors | Housing | Regular days here | Casual days here |
|---|---|---|---|---|---|---|
| 1 | start set | | 3 | 20 | 0 | 0 |
| 2 | Shuriken Tower, Alliance Lodge | | 2 | 40 | 0 | 0.4 |
| 3 | Firework Mortar, Spike Pit, Caltrop Field | 2nd camp, 2nd storages | 4 | 80 | 0.7 | 3.3 |
| 4 | Sky Bow Tower | tier 2 starts | 5 | 120 | 3.5 | 9.0 |
| 5 | Paper Lantern Line | 3rd camp | 3 | 180 | 5.2 | **26.0** |
| 6 | Repair Crane, Smoke Brazier | 3rd storages | 3 | 240 | 7.2 | 17.7 |
| 7 | none | 2nd research lane, Shadow Captain, tier 3 | 4 | 255 | 6.4 | 19.0 |
| 8 | Kite-Cutter Ballista | | 3 | 270 | 5.4 | 18.0 |
| 9 | **none** | | 3 | 285 | 5.0 | 27.0 |
| 10 | **none** | tier 4 | 4 | 300 | 8.8 | 32.0 |
| 11 | none | 3rd research lane, +1 Sky Bow, +1 Ballista | 3 | **300 (no growth)** | 9.0 | 17.0 |
| 12 | Longbow Yagura | | 3 | 315 | 13.4 | 17.0 |
| 13 | **none** | tier 5 | 4 | 330 | 20.6 | 28.0 |
| 14 | **none** | +1 Yagura | 3 | 345 | 27.8 | 32.0 |
| 15 | **none** | | 3 | 360 | end | end |

- Every Keep unlocks 2-5 warriors (the model's promise holds). Keeps 9, 10, 13, 14 and 15 add no building type;
  Keep 11 adds no army housing. The longest regular stretches (Keep 13: 20.6 d, Keep 14: 27.8 d) are exactly the
  Keeps with nothing new but level caps.
- Built-not-live content sits on those Keeps (`planned.json`, `roster.json` heroes): Iron Matriarch Keep 9, Sky
  Admiral Keep 11, Grand Sensei Keep 13, Hero Hall Keep 7; counters at Keep 9 (Discipline Banner, Spotter's Perch,
  Steam Vent), Keep 10 (Sleep Dart Tower), Keep 12 (Moonlit Gravel, Ink Seal Post), Keep 13 (Lightning Rod).
- The second and third research lanes (Keeps 7 and 11) are hollow as unlocks for the army a player actually uses:
  bringing the four raid-mix warriors to their cap is 0.22 lane-days at Keep 7 and 1.42 at Keep 11
  (`research.cjs`); research is Provisions-bound (367 k at Keep 7, 48.3 M at Keep 13, 170.7 M at Keep 15), never
  time-bound. Lanes matter only for the 804 lane-day whole-roster collection.

Builder time (`maxout.cjs`): everything newly allowed per Keep, in builder-days: K5 2.8, K6 6.7, K7 13.7, K8 78,
K9 111, K10 223, K11 187, K12 256, K13 185, K14 395, K15 312; total 1,771 (354 days with 5 artisans, 885 with 2).
By type: Coin Mint 459, Terraced Farm 459, Treasury 188, Storehouse 188 = **1,294 builder-days, 73 %**; every
defense, trap and counter together about 400. Level 15+ of anything is a flat 7 days (10 s x 2.2^(L-1), cap
604,800 s) and only Mints/Farms (24 levels) and storages (22) have many such levels. A collector produces nothing
while it upgrades (`village.ts:2166`, `accrueFrom: endsAt`): Mint 14 -> 15 costs 530,461 Provisions and forfeits
7 x 24 x 9,481 = 1.59 M Coins, so its real payback is about 620 h, not the 155 h the table implies.
Keep timers 2..15 sum to 35.7 days; the Keep is never the wall and needs nothing but Coins and an artisan.

## 3. Sessions

- Army refill at a maxed Dojo for the raid mix: Keep 1 7 min, Keep 2 14, Keep 3 30, Keep 4 38, Keep 5 50, Keep 6 66,
  Keep 7 96, Keeps 8-15 74-104 min (tested target <= 2 h holds). With the next-army queue a returning player has
  two armies: two raids, then 50-100 minutes of nothing that pays. Every battle mode (raid, Trial
  `village.ts:1932`, bounty `:1969`, rematch `:1994`) spends the same warriors; practice battles are free but pay
  nothing.
- The regular model raids 4.0 times a day at every Keep from 5 to 14 (one per session), because `train()` never
  queues the second army.
- From Keep 8 the artisans are busy for days, research lanes for hours: a session is collect, chest, two raids,
  re-queue: 5-8 minutes. A returning player with an army can always raid within 2 minutes; without one (back
  inside the refill window) there is nothing meaningful except a no-reward practice battle.

First session (`tutorial.ts` steps, `firsthour.mjs`):
- Tutorial order: welcome, build Mint and collect, upgrade Keep (240 s), **wait for it** (step 4 `finishKeep`),
  build Dojo/Courtyard/Tower, train, **wait for training** (20 Shinobi x 20 s = 400 s if the camp is filled),
  raid, end. A player who follows it without spending Jade reaches the first raid after about 11-12 minutes with
  two idle waits (4:00 and up to 6:40); with about 6 Jade of skips, about 3 minutes.
- Model player (a session every 2 minutes): Keep 2 at 4 min, first raid at minute 18, 2 raids in the first 30
  minutes, 5 in the first hour, Keep 3 at 58 min, and the first Keep 3 raid is a 0-star loss.
- What-if: Dojo levels 1-4 `trainingSpeed` 2/2/1.6/1.3 (now 1/1/1/1): 7 raids in the first hour, Keep 3 at 46 min
  (inside the tested 40-80 window of `progression.test.ts:17-18`). Keep 2 at 60 s instead of 240 s: first raid 2
  minutes sooner, nothing else moves.

## 4. End game after Keep 15

- Shadow Trials: 4 tiers per Keep to tier 60, then +6 % defense power per tier, Ironclad every 5th, Elite every
  10th. Measured (`trialcap.mjs`: fully researched Keep 15 raid mix, 360 housing, Shadow Captain level 9, bot plan,
  best of the 5 fortresses a player can switch between): 3 stars through tier 59; tier 60 (both modifiers) 1 star;
  tiers 61-65 and 67 two stars; from tier 68 zero or one star (one outlier at 72). With the +30 % mastery bonus
  (the feature's ceiling): two stars through 69, wall about tier 77. So the "endless" ladder ends 5-15 tiers after
  the Keep ladder for everyone, and nothing a Keep 15 player can do moves it (mastery is off).
- `achievements.json:227` Trial Walker's last step is 100 tiers; tier 100 is x13 defense HP and damage
  (`ROSTER.md:293`, generated). Unreachable.
- Trial rewards follow the tier's Keep, not the player's: tier 8 pays 1,137 each, tier 20 12,531, tier 40 245,724,
  tier 60 3.8 M. A Keep 10 player who starts the ladder late has 36 trivial tiers to clear, each costing a full
  Keep 10 army (267 k Provisions) for 0.5-60 k. The engaged casual model earned 28 k from Trials in 45 days
  (0.4 % of its income) and was on about tier 8 at Keep 5.
- Leagues: 8, Kage at 5,200 honor; monthly soft reset (honor above 400 halved, `ranks.ts:82`), Keep-scaled chest.
  The regular model averages 4,308 at Keep 15 (Shadow League starts at 4,400). A real recurring goal.
- Checklists left at Keep 15: buildings (1,771 builder-days in total), roster research (804 lane-days, about 268
  days on three lanes, about 1.5 B Provisions), achievements (2,540 Jade in total).
- No prestige or renown system anywhere in `src/gameplay` (grep). Warrior Mastery is fully built
  (`sim/mastery.ts`, save v23 field, `BattleSetup.mastery`, Codex UI) behind `features.mastery`, off; the server
  has no mastery support.

## 5. Problems (PAC-01 .. PAC-14)

See the structured output; all fourteen are listed there with evidence and fixes. Lower-priority notes that did
not fit:

- The tutorial's Mint step says "When a coin floats over it" but the bubble needs 2 % of capacity = 9.6 minutes at
  level 1 (the ring falls back to the building, so it works; the text is just early).
- `reminders.ts:30-63` builds English titles in the sim (localization area).
- `docs/game-theory/PROGRESSION_MODEL.md:60` says Keep 6 "about 10.4" days; the campaign says 9.4. Line 9 reads
  as if the casual wall were fixed ("took a casual player about 30 days") while CAMPAIGN.md shows 26.
- `rewardScaleByHall` jumps x1.99 at Keep 7 and x2.1 at Keep 13 (tier changes); fine.
- Keep 11 -> 12 for the casual with P is still 25 days, 12 -> 13 26, 13 -> 14 27, 14 -> 15 34: the long tail is
  now smooth but long; the built-not-live heroes are the content for it.

## 6. Genius elements and opportunities

In the structured output.
