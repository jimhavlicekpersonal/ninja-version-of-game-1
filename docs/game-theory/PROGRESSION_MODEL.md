# The progression model: one power budget for everything

Owner: GAME THEORY compartment (`src/gameplay/`). Constants: `src/gameplay/data/progression.json`. Code: `src/gameplay/sim/progression.ts`. Tests: `tests/gameplay/balance/progression-model.test.ts`. Generated tables: `ROSTER.md` (run `npm run docs:progression`).

## Playable roster release

All 50 warriors now have live troop definitions, training/research unlocks, combat behavior and code-drawn sprites. Keep levels 7–15 extend the existing buildings to their catalog caps; the four heroes and non-live buildings remain planned. `liveKeepLevels: 6` is the original calibration/interpolation pivot, not the current playable maximum (read `data.hall.levels.length` for that).

`troops.json` is authoritative for playable stats, prices, range, attack intervals and ability kits. Role formulas set baseline budgets; specialized ranges and abilities require battle tests beyond the budget equality test. Original six-warrior levels 1–5 remain unchanged. New tiers use the original role's entry training price where one exists, then tier and level multipliers. Late Keep costs grow ×1.45 to remain reachable. Keep timers grow ×2.2–3 to Keep 9 (64 h), then climb gently from 4 days at Keep 10 to 6.5 days at Keep 15 (design re-audit: they were a flat 168 h from Keep 10, the longest waits where players drop off). Keep 5 → 6 costs ×5 (100k → 500k Coins), no longer ×6.5 (130k → 850k), which took a casual player about 30 days. Collector payback continues increasing toward 167 hours. Late loot and fixed rewards are calibrated to tier-capped bot armies. See `PLAYABLE_ROSTER.md` for implemented mechanics and limits.

## The method in one paragraph

Every warrior, building, EXP track and difficulty tier is priced in one currency: **combat power = √(HP × DPS)** (Lanchester's square law: a unit's fighting value is the geometric mean of how long it lasts and how hard it hits). A warrior's power is a fixed **budget per housing** × its **role efficiency** (range, flight and abilities cost budget) × **1.4 per tier** × **1.16 per level**. The role then decides how the budget is split between HP and DPS. Costs grow faster than power (×1.3 training, ×1.55 research per level), so each level is worth less per Coin than the last: a long tail with no wall. Research time grows ×1.6 per level up to a 2.5-day cap, building time ×2.2 up to 7 days. Mastery EXP grows ×1.35 per level forever, while its bonus approaches +30%: there is always another level, but no runaway power creep. Defenses use the same 1.16 level growth, so attack and defense stay in step at every Keep level. The endless Shadow Trials ladder grows defense power +6% per tier past the last Keep level.

## Why this works

1. **It reproduces the existing balance.** All six live troops (Shinobi, Kunai Adept, Armored Guardian, Saboteur, Tunnel Runner, Kite Raider) land within 3% of the model's HP and DPS at level 1. Their level growth matches 1.16 within 4%. These are tests, so the live game and the design can't drift apart.
2. **Air pays for flying, range pays for safety.** The Sky role's efficiency is 0.568 (HP/DPS 2.7): flyers ignore walls and ground-only defenses, so a full budget let air armies win ~100% at every Keep (it was cut to 0.494, then raised ×1.15 in the design re-audit, when air armies three-starred nothing; a ×1.35 rise let pure-air armies flatten Keep 15 bases again). Shadow's efficiency is 1.2 (was 0.8) and Mystic's 0.82 (was 0.7), re-measured in the design re-audit. Throwers (range 3.5) fire from behind the front line and over walls, so their damage is 0.7× the old budget (efficiency 0.627, HP/DPS 3.43): they deal about 80% of a Blade's damage per housing. Measured with `npm run balance:armies`.
2. **No dominance inside a tier.** Same tier and level means the same budget per housing (scaled by role efficiency). Warriors differ in *what they do*, not in raw strength. This extends the existing balance fix #7 ("no troop dominates another").
3. **New tiers excite without making old ones useless.** A newly unlocked tier starts no stronger than the tier below at its cap (tested). At the pinnacle each tier is about 4% stronger than the one below. Legends are about 1.2× Initiates, not 10×.
4. **Every Keep level brings something new.** Ten roles per tier, spread over 3 Keep levels, so 3–4 warriors unlock at every level from 1 to 15 (tested).
5. **Long curve, bounded numbers, a stated horizon.** Maxing one warrior takes about 26 days of research. The whole roster at the Keep 15 caps takes about 268 days (three research lanes), about 68 at Keep 12 (tested: under a year at Keep 15). Mastery levels are unbounded but the bonus is capped. Trial power is capped at 10⁹ so numbers stay finite.
6. **Rewards can't be farmed.** Trial rewards grow with log₂(tier) and pay once per tier.

## The formulas

| Quantity | Formula | Constant |
|---|---|---|
| Warrior power | `B × eff(role) × housing(role) × 1.4^(tier−1) × 1.16^(level−1)` | `powerPerHousing` B = 21 |
| HP, DPS | `HP = P·√r`, `DPS = P/√r`, with r = role HP:DPS ratio | `roles.*.hpPerDps` |
| Unlock Keep | live: from Dojo gating; planned: `firstKeep(tier) + ⌊3·roleIndex/10⌋` | `tiers[].firstKeep` = 1, 4, 7, 10, 13 |
| Level cap | `troopLevelCapByKeep[K] − 2·(tier−1)`, clamped to 1..20 | `levelCapOffsetPerTier` = 2 |
| Training cost | `20 × housing × 2^(tier−1) × 1.3^(level−1)` Provisions | `training` |
| Training time | `20 s × housing × 1.35^(tier−1)` (tier 1 keeps its hand-set times), divided by the Dojo's `trainingSpeed` (1 up to Dojo 4, then 1.2, 1.4, 1.6, 2, 2.5, 3, 3.5, 4, 4.5) | `training`, `buildings.json` |
| Research | cost `4000 × 3^(tier−1) × 1.55^(level−2)`, time `30 min × 1.6^(level−2)` ≤ 2.5 days, the same curve for all 50 warriors (the original six used to switch curves at level 6) | `research` |
| Research lanes | 1 at Keep 1–6, 2 at Keep 7–10, 3 at Keep 11–15; one lane per warrior | `hall.json` `researchLanes` |
| Mastery EXP | total to reach M: `50 × (1.35^M − 1) / 0.35`; bonus `0.30 × (1 − 0.92^M)` | `mastery` |
| EXP per battle | `housing used × (1 + 2 × stars)` per warrior type | `mastery.xpPer*` |
| Building level | power ×1.16, cost ×1.45, time `10 s × 2.2^(level−1)` ≤ 7 days | `buildings` |
| Building mastery | defenses earn EXP by defending, collectors by producing; bonus → +15% | `buildingMastery` |
| Max building level | live tables to Keep 6, then a straight climb to `pinnacleMaxLevel` at Keep 15 | `buildingCatalog` |
| Shadow Trial t | Keep `min(15, 1 + ⌊(t−1)/4⌋)` (every Keep level); past tier 60, power ×1.06^(t−60); ×2 walls every 5th, ×1.2 defenses every 10th | `trials.json` |
| Trial reward | `25% × hall's min raid loot × (1 + 0.1·log₂ t)`, once; 5 Jade every 10th tier | `trials.json` |

## Pacing targets (gameplay audit, November 2026)

The audit measured a 13-hour serial refill for a Keep 15 army and 6.7 years of single-lane research for the roster. The targets are now explicit and tested (`progression-model.test.ts`):

| Target | Value | How |
|---|---|---|
| Refill a full army of the newest warriors at a maxed Dojo | ≤ 2 hours at every Keep (about 1.5 h at Keep 15) | Dojo `trainingSpeed`, tier time ×1.35 |
| Next army | One full army can wait, trained, in the queue while the camps are full (`economy.json` `queuedArmies`) | `finishTraining` moves warriors in as camp space frees |
| Refills | `train` takes a count; `trainArmy` refills to a saved preset or the last army; ready warriors can be dismissed for 50% back | `village.ts` |
| Try before training | Practice battle with a squad of any unlocked warrior; nothing spent or won | `practiceArmy`, `App.practice` |
| Whole roster to the Keep 15 caps | under a year of research (about 268 days) | research curve, lanes |
| One warrior to level 20 | about 26 days | research curve |

**Days per Keep, from the generated campaign (P3-10, rewritten 2026-11-18 from `docs/game-theory/campaign.json` after Phases 2 and 3 of the replayability pass; model players, one seed, ±2 days at the low Keeps and about ±2 weeks late for the casual player):**

| Keep | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Regular (4 sessions a day) | 0.6 | 3.6 | 8.6 | 14 | 19.4 | 26.7 | 32.2 | 42 | 51.6 | 65 | 82.4 | **101** |
| Casual (one visit a day) | 1.7 | 6.7 | 16.7 | 40.4 | 49.4 | 62.4 | 75.4 | 92.4 | 109.4 | 129.4 | 153.4 | **174.4** |

The regular player's gate is Keep 15 between day 100 and 140 (the owner's target; P3-03's four-day cap on the economy buildings was chosen to stay above 100). The casual player is gated to Keep 6 by day 25 and no stretch over 21 days through Keep 10 (`campaign-gates.test.ts`; the Keep 6 → 7 stretch, 23.7 days, is a recorded open gap). A casual player who hires the third artisan with the starting Jade reaches Keep 15 on day 134, and one who also queues the next army on day 111 (`casual_hires`, `casual_queues`).

**Builder-day horizon:** every building to the Keep 15 caps takes 1,267 builder-days (1,771 before P3-03), of which the Coin Mints, Terraced Farms, Treasuries and Storehouses are 789 (they keep producing while they upgrade). **Where the Trial ladder ends:** a fully researched Keep 15 army with the bot plan clears to about tier 58 (P1-06; the maxed Keep 15 fortress is the wall, not growth); a late starter may begin at the first tier of the Keep two below their own (P3-06).

Tasks are chosen when a day or week begins, only from ones the village can still do (`taskEligible`): no obstacle challenge without obstacles, no upgrade task when nothing fits in the period, research and Shadow Trial tasks as alternatives.

The pacing model player (`tests/gameplay/balance/progression.test.ts`) reaches Keep 6 in 9–17 days (about 10.4 since the design re-audit smoothed Keep 5 → 6). `policies.test.ts` checks the same pace for a defensive planner that builds the counters and an explorer that fields the newer warriors of every family and plays Trials, tasks and the pass.

## Content runway after Keep 15 (Beast Mode GT-15, 2026-11-23; figures from the SIM_RULES 10 release campaign, 2026-11-26)

Model players, not observed play (8 seeds each, `docs/game-theory/campaign.json`; play time is the campaign's
estimate from `tools/balance/playerModel.ts` `PLAY_TIME`: 90 s of upkeep a session, 20 s a scout, 30 s to place an
army, each battle at its simulated length at 1x):

| Player | Keep 15 (day) | Play to Keep 15 | About a day |
|---|---|---|---|
| Regular (4 sessions a day) | 104.2 | 43.7 h | 25 min |
| Regular, online build (no simulated raids) | 96.5 | 41.1 h | 26 min |
| Regular fortress | 120.5 | 48.8 h | 25 min |
| Casual who queues the next army | 109.9 | 17.5 h | 10 min |
| Casual who hires the third artisan | 129.7 | 13.3 h | 6 min |
| Casual (one visit a day) | 174.7 | 17.8 h | 6 min |
| Casual explorer | 196.3 | 20.6 h | 6 min |

**After Keep 15** a regular player has, in order of length: the roster's research to the caps (under a year of
research, `progression-model.test.ts`; the Keep 15 bot mix alone is about 290M Provisions, roughly a week of
income), the builder-day horizon (1,267 builder-days to every cap), the Shadow Trial ladder to about tier 58, and
the repeating loops (the weekly Gauntlet, the 28-day event calendar, monthly leagues, Alliance and Gang Wars).
Warrior Mastery gives no stat bonus. SIM_RULES 10 released the first wave of built content (Steam Vent, Lightning
Rod Tower, Bronze Mirror Screen, the Hero Hall with hero choice, the Iron Matriarch and the Sky Admiral). The rest
(twelve counters and the Grand Sensei, `withPreview`) is the next runway and is held by
`tests/gameplay/planned/golive-gate.test.ts`.

**Owner decision (not code):** whether the regular player's runway (about 44 hours of play over 15 weeks, then the
loops) is long enough for the launch markets. The owner delegated the go-live order on 2026-11-25; the remaining
content goes live only past its gate.

**Playtest plan** (replaces the `PLAY_TIME` assumptions with observations; `docs/ops/PLAYTEST.md` has the silent
protocol): 8-12 players across the casual and regular rhythms for two weeks on a sandbox build with time skips
off; record session length and sessions a day (opt-in statistics `session_start`, `raid_end.ticks`,
`scout_leave`), minutes per raid from scout to result, and the first day each player stops raising the Keep. Compare
the median session and minutes a day with the table above; rerun the campaign with the measured `PLAY_TIME` and
restate the runway in hours.

## How to change it (GAME THEORY AI checklist)

1. Change a constant in `progression.json` or `trials.json`. Never change a number in code. For research or training curves, run `node tools/progression/pacing.mjs` to rewrite the live tables; to change a role's budget, `node tools/progression/rolecut.mjs <role> <hp×> <damage×>` scales its live troops and the model together.
2. Run `npm test`. The progression-model tests say which invariant broke. If combat numbers changed, bump `SIM_RULES` (`sim/battle/battle.ts`) and update the fingerprint in `tests/gameplay/battle/rules-version.test.ts`.
3. Run `npm run docs:progression` to regenerate `ROSTER.md` and the icon manifest.
4. To make a planned warrior playable: add it to `troops.json` with stats from `warriorStats()`, add its unlock to `hall.json`, implement its ability in `sim/battle/battle.ts` (deterministic, with a test in `tests/gameplay/battle/`), then remove "planned" by adding `liveTroop` in `roster.json`. The calibration test then keeps it honest.
5. Keep Keep levels 7–15, Shadow Ink and heroes behind a save migration (`SAVE_VERSION`) and a `PROTOCOL_VERSION` bump if the server must know.
