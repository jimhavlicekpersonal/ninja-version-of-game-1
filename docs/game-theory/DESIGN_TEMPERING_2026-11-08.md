# Design: Tempering — a sliding scale instead of stances

Owner: GAME THEORY. Status: **implemented 2026-11-09** (battle rules 6) with re-calibrated numbers (`TEMPERING_CALIBRATION_2026-11-09.md`); the text below is the design as proposed. Step-by-step build note for a future session: [`IMPLEMENTATION_NOTE_TEMPERING.md`](IMPLEMENTATION_NOTE_TEMPERING.md). Written 2026-11-08. Replaces the four discrete stances of [`DESIGN_LIVING_FORTRESS_2026-11-08.md`](DESIGN_LIVING_FORTRESS_2026-11-08.md) with one continuous mechanism built into the upgrades that already exist. Everything below was measured in the real simulation with data-only changes to a scratch copy; scripts in `docs/audit/balance-2026-11-08/scripts/design/temper.ts` and `equilibrium.mjs`, outputs in `measurements/design/temper*_K*.out` and `temper_equilibria.txt`.

## 1. The idea in one paragraph

Every defence level already buys a fixed bundle of HP and damage. Let it instead buy one **temper point**, which the player places on a three-way scale for that building: **Reach** (range), **Blast** (splash) or **Watch** (sight: anti-air, anti-aura, trap strength). The points are power-neutral trades, so a Kunai Tower with ten levels is not "level 10" but a point inside a triangle, and the whole base is the power-weighted centre of its towers' points, shown at scouting as a small triangle marker. Re-tempering is instant and costs Coins. The attacker's mirror already exists: how wide the army is deployed across the Infiltration Points, which the measurements show is the counter to Blast and the wrong answer to Reach. Because the profile space is continuous and the three directions beat each other in a cycle, there is no base shape that is safe against every army and no army that is safe against every shape; the best answer is a position that moves as the population moves.

## 2. Why three axes, and why these three

The audit's problem is that every base of a Keep has the same shape, so the same army is best against all of them. A stance system fixes that with four discrete shapes; a sliding scale fixes it with infinitely many, and it reuses the one decision the late game lacks (from Keep 9 every upgrade is a seven-day timer with no choice inside it). The axes were chosen by measurement, not by theme. Two candidates failed:

- **Volley (fire rate).** Twice the shots at half the damage changed nothing (panel mean 59.9 vs 57.4 today): a level-12 Kunai Tower already kills a 1-housing warrior in one shot, so fire rate is not a lever in this engine. A Volley axis would need a new armour rule, so it is dropped.
- **Sight against stealth.** Turning stealth off entirely cut the Eclipse Ninja army by 2 points (97.2 → 95.0). Stealth is not why that army wins; its power per housing and its crit are, and its counter is splash (Blast: 97.2 → 28.3). So "Watch" is anti-air, anti-aura and traps, not stealth detection.

The three that work, with the counter each gives and the family each leaves free (Keep 15, round 3, mean destruction over 10 bases × 2 entry seeds; `temper3_K15.out`):

| Axis | What the point does (prototype values) | Beats | Leaves free |
|---|---|---|---|
| **Reach** | +2 range, −20 % damage; at ≥ 50 % Reach the tower prefers attackers fighting from 3.5+ tiles | ranged lines 89.6 → 71.5, 81.1 → 63.5 | air 100, Eclipse 93.5, blades 51.7 (unchanged) |
| **Blast** | Kunai Tower gains splash 0.5 and fires 80 % slower, −20 % damage; Mortar +15 % | Eclipse 97.2 → 40.1, blades 57 → 29, beasts 55 → 26, stacked ranged line 89.6 → 62.3 | air 100; a **spread** ranged line 92.5 |
| **Watch** | Sky Bow +30 % damage and −40 % fire interval, Brazier cut 0.3 → 0.8, Spike Pits ×2; towers −10 % | air 100 → 58.5 | ranged line 83.8, Eclipse 88.8 |

## 3. The attacker's mirror: deployment width

The same army, same bases, deployed through the three nearest points (the bot plan) or dealt round all six:

| Keep | Base profile | Stacked | Spread | Difference |
|---|---|---|---|---|
| 15 | today | 89.6 | 90.6 | +1 |
| 15 | Blast | 62.3 | **92.5** | **+30** |
| 15 | Reach | 71.5 | 69.6 | −2 |
| 12 | today | 94.0 | 76.8 | −17 |
| 12 | Blast | 95.2 | 83.2 | −12 |
| 12 | Reach | 77.0 | 56.2 | −21 |

Width is a continuous choice the game already has (which points you tap), and its value flips sign with the defender's profile. With the profile shown at scouting, "how wide" becomes a read, not a habit. This is the piece a stance system cannot offer: the attacker's answer to a Blast base is a deployment, not a different army.

## 4. Does it remove the single answer? The matrices

Each round is a 10–12 army × 7–8 profile matrix of mean destruction; `equilibrium.mjs` checks for a pure saddle point (one army and one profile that are best against each other, the formal version of "one answer") and otherwise finds the mixed equilibrium (the rotation each side must play).

| Round | Keep | Pure saddle? | Attacker rotation | Defender rotation | Value |
|---|---|---|---|---|---|
| today (one column) | 12 | one answer | thrower line 100 % | — | 94.0 |
| today | 15 | one answer | Eclipse 100 % | — | 97.2 |
| 1 (uncalibrated) | 12 | **yes** (Blast beats all) | thrower line | Blast | 62.3 |
| 1 | 15 | no | thrower 62 % · air 38 % | Blast+Watch 74 % · Watch 26 % | 65.5 |
| 2 (weaker Blast) | 12 | **yes** (Blast beats all) | thrower line | Blast | 75.5 |
| 2 | 15 | no | thrower 68 % · air 32 % | Blast 66 % · Watch 34 % | 66.5 |
| 3 (budgeted Blast, air viable, spread plans) | 12 | no | thrower 85 % · air 15 % | Reach 69 % · Reach+Watch 31 % | 78.4 |
| 3 | 15 | no | **spread thrower 54 % · Eclipse 23 % · air 22 %** | **Watch 43 % · Reach 39 % · Blast 18 %** | 82.0 |

Round 3 at Keep 15 is the shape the owner asked for: three armies and three profiles in the equilibrium, none of them safe alone (the thrower line's worst case is 62, Eclipse's 40, air's 58; Watch's worst case is 88.8, Reach's 100, Blast's 100). Keep 12 is not there yet (support 2 and 2): the thrower line is still robust because air at Keep 12 is weak even with +25 %, so the Blast counter is missing; that is a tuning job for gate 2 below, not a structural failure.

Two lessons from the rounds. First, **splash is the dominant power in this engine**: even a weakened Blast beat every army at Keep 12 twice (rounds 1 and 2), because the bot plan stacks three squads; the correct budget for a profile is not its panel mean but its value against the attacker's best response, which includes spreading. Second, **air must be viable at every Keep** for the cycle to close (air is what punishes Blast and Reach); the audit found air dead below Keep 15, so the Sky role needs about +25 % below Keep 13 (the Dragon Kites at 15 need nothing: with +25 % they scored 100 against five of seven profiles, so the buff should stop at Keep 12).

## 5. The mechanism

- **State.** Each defensive building carries `temper: [reach, blast, watch]`, non-negative integers summing to its level (save v21; existing buildings start at `[0, 0, 0]` plus `level` "untempered" points, which play exactly as today). `BaseLayout` and `BattleSetup` carry the tempers (the server replays them); `SIM_RULES` 6 after `npm run rules:snapshot`.
- **Rules**, all numbers in `battle.json` `temper` (none in code): per point as a fraction of the building's level, Reach adds range and the far-attacker preference above half; Blast adds splash radius and slows fire; Watch adds Sky Bow fire rate and damage, Brazier cut and trap damage; every point costs the damage and HP trade in the table above. Walls take a single Gate/Stone scale (which approaches are closed vs HP). Traps take Damage/Radius.
- **UI.** One three-way slider per building type in the building sheet (all Kunai Towers share), per-building override behind "advanced". Re-temper costs 5 % of the building's cumulative Coins and applies at once: a late-game Coins sink that needs no builder, which the audit found the late game lacks (Coins full 13 % of sessions, builders the bottleneck).
- **Scouting.** The base card shows the profile as a triangle marker and three numbers ("Reach 55 · Blast 30 · Watch 15"), next to the layout and the loot. The Suggested army takes the profile: "against a Reach base: shadows and blades, stacked; against a Blast base: throwers, spread wide".
- **Generated bases.** Each rival clan has a home temper; the temper offered to a player is sampled around the counter to the player's last ten raid armies (a pure function of the battle log the server stores) with spread, so every scout is a new point in the triangle and a fixed army meets its counter often. The defence log shows a real player what hit them, so real defenders slide toward the counter themselves.
- **What stays from the audit.** Fielded strength (housing-weighted, queue ignored) and the no-warriors rule close the two leaks; the Watch loot rule (loot banked × (0.5 + 0.5 × defence index)) gives defence its return and pairs naturally with tempering: *power decides how much you bank, temper decides whom you beat*. Memory (bases remember attackers) is optional with tempering and can wait.

## 6. Gates: what "unbreakable" means in numbers

Measured with the panel and `equilibrium.mjs` at Keeps 8, 12 and 15, with stacked and spread plans for every army:

1. **Budget.** Each pure profile's worst case (its best-response value) within ±3 points of the others. Round 3: Keep 12 today 94 · Reach 86 · Blast 95 · Watch 94; Keep 15 today 100 · Reach 100 · Blast 100 · Watch 89. Fails today on Watch at 15 (air over-buffed); tune the air buff to stop at Keep 12.
2. **No single answer.** No pure saddle point, and mixed-equilibrium support ≥ 3 on both sides at every Keep ≥ 8. Round 3: Keep 15 passes (3 and 3), Keep 12 fails (2 and 2).
3. **Cycle.** Each pure profile's best army differs from the others', and no army is within 5 points of its best against all three pure profiles. Round 3, Keep 15: Reach → air, Blast → air (stacked) or spread throwers, Watch → Eclipse; passes once air is budgeted.
4. **Continuity.** A 50/50 blend lands between its components ±5 for every army. Round 3: holds for 9 of 12 armies at Keep 15; the exceptions are the blends that stack two damage penalties (Blast+Watch on the thrower line: 85 vs components 62 and 84), which says the penalties should be additive, not multiplicative.
5. **The width lever.** For at least one profile the spread plan beats the stacked plan by ≥ 15, and for another loses by ≥ 10. Round 3: +30 against Blast, −21 against Reach at Keep 12. Passes.
6. **Nothing dead.** Every family reaches ≥ 50 % against at least one pure profile at its Keep. Round 3: siege 26–43 and tanks 18–64 fail; siege needs its targeting fix, tanks are a support family and should be measured inside mixes.

## 7. Why this is endlessly replayable, in the game's own terms

The defender's choice space is a continuous triangle per building, times 16 towers, times five layouts and two closed approaches; the attacker's is 50 warriors, the composition, the width and the side; the matchmaker hands a different point in the triangle every scout, and the rival clans' points follow the player's own habits. In equilibrium both sides rotate among at least three answers (gate 2), so a player who finds "the" army finds it countered within a few raids and must read the triangle again. The information is complete and honest (the profile is on the scout card, the rules are in the Codex, the rivals are labelled), so the skill is prediction and adaptation. That is what "almost impossible to find the optimal strategy" means when it is true: not that the answer is hidden, but that it moves.

## 8. Order of work

1. Leak fixes (fielded strength, no-warriors rule): one day.
2. Temper state, rules and the replay plumbing (`SIM_RULES` 6, save v21, `BattleSetup`): three days.
3. Slider, scout triangle, per-profile Suggested army, Codex page: three days.
4. Rival tempers from the battle log; the Watch loot rule: two days.
5. Tuning to gates 1–6 with the harness (air budget below Keep 13, additive penalties, Keep 12 support): one week.

About three weeks, no art beyond a slider and a triangle marker; BACKEND deploys the rules bump first.
