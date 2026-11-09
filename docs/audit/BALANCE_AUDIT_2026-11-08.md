# Kagemura: deep balance audit (2026-11-08)

Fourth independent review of `jimhavlicekpersonal/ninja-version-of-game-1`, at commit `64eafb5` (the tip of `main` on 2026-11-08). Question set by the owner: find the game's flaws, digging deepest into the balance of the warriors, the buildings, their mathematical combinations, the drop zones (Infiltration Points), the economy of Jade and of the two normal currencies, and the "grand unified game theory". The owner's requirement: **the game must have balance, and it must be almost impossible for a human to find the optimal strategy.**

> **Follow-up (2026-11-09):** on the owner's request the fixes were built: the fielded-strength and hero-only-practice rule fixes, Tempering (battle rules 6) and the round-2 economy and ladder rules (protocol 11, save v21). What was built and how it differs from the proposals: `docs/DECISIONS.md` ("Tempering", "Raids and honor after the balance audit"), `docs/game-theory/TEMPERING_CALIBRATION_2026-11-09.md`. The findings below describe commit `64eafb5` and are kept as written.

This is analysis only. Nothing in the game, server, data or tests was changed. Every number below was measured against the real simulation and data of this commit, with the scripts kept under `docs/audit/balance-2026-11-08/scripts/` (see Appendix B for how to rerun them).

---

## 0. Scope, method, limits

**Method.** Nine analysis dimensions, each run by its own agent against the real code: (AS) an optimal-army search with real battles, (DM) the value of every building per Coin, (DZ) the drop zones, (PS) model-player campaigns under alternative policies, (RM) the warrior roster as data, (CU) the Coins and Provisions flows, (JD) the Jade economy, (LD) matchmaking, ladder, bot raids, trials and events, (CR) the battle rules. Each dimension's findings then went to an adversarial verifier with two lenses (does the current code say this; does it reproduce and does it matter). Only findings that survived are reported as findings; the ones that did not are listed in section 5. A synthesis pass then built the strategy map of section 3.

**What "measured" means here.** Battles use the game's own deterministic simulation (`src/gameplay/sim/battle/`), the same code the server re-runs. Armies at a Keep use the Keep's full camp housing and every warrior at that Keep's research cap; from Keep 7 the Shadow Captain joins as in the real game. Bases are generated opponents (`generateOpponent`) at level bias 0.5 (buildings about a level below the Keep's caps, the state a real player is in most of the time) and 1.0 (maxed), across the five named layouts, with common seeds for every comparison. Deployments use the bot plan (three Infiltration Points nearest one side, toughest first) unless a finding says otherwise; a human does better, so attacker numbers are floors. Campaigns use the model player (`tools/balance/playerModel.ts`) with real timers, real battles and real offline bot raids.

**Limits.** No human has played this build; model players and scripted deployments are not players. The server was not run (its matchmaking uses the same functions as the device, which were tested). Device-clock exploits are known and out of scope (STATE E11). Account usage limits cut one pass short; the measurements on disk were kept and completed, and every table in this document comes from a file that can be regenerated.

**Prior reviews this builds on.** `docs/audit/FRESH_SLATE_REVIEW_2026-11-06.txt` ("FSR", ids B/D/S/P/H/X), `docs/audit/STATE_OF_THE_GAME.md` 3.3–3.4 ("STATE", ids E), `docs/game-theory/*` and `docs/DECISIONS.md`. Where this audit contradicts them, section 5 says which to trust and why.

---

## 1. Facts the findings rest on (read from the code and data of this commit)

- **Currencies.** Coins (`acorns`) pay for the Keep, defences, walls, traps, counters, Terraced Farms and Provision Storehouses; Provisions (`dew`) pay for every warrior, every research, Coin Mints, Treasuries, the Dojo and the camps. Jade (`moonstones`) is premium. Production and storage are symmetric between the two.
- **Warriors.** 50 live = 10 roles × 5 tiers. Power per housing = 21 × role efficiency × 1.4^(tier−1) × 1.16^(level−1); Shadow 1.2, Blade/Guardian/Infiltrator 1.0, Beast 0.95, Siege 0.9, Mystic 0.82, Saboteur 0.72, Thrower 0.627, Sky 0.568; three warriors carry a further DPS tax (`dpsScale`: Thousand Needle 0.6, Siege Bombardier 0.5, Hawk Tamer 0.6). Tier n unlocks at Keep 1/4/7/10/13; its level cap is the Keep's cap minus 2 per tier.
- **Battle.** 180 s at 10 ticks/s, deterministic from seed + deployments. Stars: 50 % destruction, the Keep, 100 %. Targeting is nearest building of the warrior's preference. A wall tile costs `hedgePathCost × 10 = 100` path units against 10 per step (`pathfind.ts`), so a wall is a ten-tile detour; a warrior whose cheapest path still crosses a wall stops and breaks it. Only `walls`/`breach` roles target walls deliberately.
- **Drop zones.** Eight compass anchors 1.5 tiles inside the map edge; a hash of the layout (every building's type and position) closes one opposite pair, leaving six Infiltration Points of radius 2.5. Each point hides `max(15, biggest housing, ceil(army housing / 3))` housing, so a full army enters as at least three squads. Smoke Bombs go anywhere.
- **Matchmaking.** The opponent's strength is clamped to `[max(Keep − 2, floor), Keep + 1)` where `floor = attackerStrength − slack` and `attackerStrength` is the **unweighted mean over the fielded warrior types** (army plus training queue) of the Keep whose research cap their level (plus the tier's cap offset) matches, never below Keep − 1.5 (`matchmaking.ts`). Honor only matters above that floor.
- **Bot raids.** One hourly slot, 12 % chance, seeded per village; a 12/14/16 h shield after a raid of 30/60/90 % destruction; the player's own attack ends the shield (`battleEnd`), a Shadow Trial does not. Losses: 20 % of stored resources, capped by `storageLootCapByHall` (which equals the Keep's minimum generated loot from Keep 7), plus 50 % of uncollected production.
- **Jade.** Skips: 1 h 15, 1 day 180, 1 week 720 (`skipCurve`); finishing training uses the old curve (25/300/1,200) times a Keep scale (1 to 15.1). Top-ups buy the shortfall of one action at `topUpCurve` divided by `topUpScaleByHall` (0.22 at Keep 1 to 15.1 at Keep 15). Builders 3–5 cost 250/500/1,000. Start: 500 Jade, 2,500/2,500 resources, two Artisans.

---

## 2. Verdict

**The game is not balanced, and its optimal strategy is easy to find.** Both halves of the owner's requirement fail today, and they fail in the same places:

1. **One army family wins everywhere, and the game's own "Suggested army" is 10 to 33 destruction points below it.** A hill climb over compositions against 20 generated bases per Keep (section 4.1) finds the same shape at every Keep: a thrower core behind a small guardian line, a few saboteurs and a few healers, and no blades. At Keep 5 that army averages 98 % destruction and three-stars 93 % of bases; the Suggested army averages 66 % and three-stars 10 %. At Keeps 8, 12 and 15 the margins are +10, +22 and +12 points. Blades, the "basic" warrior the tutorial trains first, appear in none of the 25 near-optimal compositions found. Only 1–3 % of the compositions evaluated land within 3 points of the best, so the landscape is peaked, but the climb reaches the peak from the Suggested army in three to eight greedy moves that all point the same way ("fewer blades, more throwers, add five Iron Monks and a few healers"). A player who experiments for an evening finds it.
2. **Defence does not pay for a progression-maximizer, and the turtle pays 60 % more days.** In played campaigns (section 4.4), a player who never builds a single defence, trap, wall or counter reaches Keep 12 on day 53.4 against day 51.2 for the documented raider and day 53.0 for the "defender" policy; the turtle, who builds and upgrades everything defensive first and keeps 125 walls at cap, reaches Keep 12 on day 82.6 and still loses 59 % of what it loots. The Coins order "Keep, camps, collectors, storage, and nothing on defence" is therefore dominant and obvious.
3. **Research sandbagging turns the ladder into a star machine.** The matchmaking floor averages research over fielded warrior *types* without weighting by count. Queuing one level-1 copy of every old warrior (15 to 46 units, 0 housing, a few hundred Provisions) pulls the floor one Keep down while the real army stays at its caps: three-star rates go from 5–10 % to 70–95 % at Keeps 6–15, honor per raid rises, and loot falls only 5–44 % (section 4.5). No surface in the game shows the strength floor, so this is hidden, but once found it is a dominant line for every star-based reward.
4. **The defence economy is upside down.** Paired simulations (section 4.2) show the Firework Mortar as the best defensive purchase per Coin at Keeps 9–15 and the most valuable class to silence at every Keep, while the metric the prior review used (HP × DPS per Coin) called it 5–10× dominated. The three soft counters add 0.0 destruction points at Keeps 12 and 15 against the ground meta; Sky Bows and Ballistas add 0.0 against the bot mix; upgrading a Longbow Yagura measures slightly negative. The Mortar is capped at level 6 from Keep 7 to Keep 10 and 2 per base at every Keep.
5. **The two normal currencies carry unequal loads and the Jade price of a resource is 37× steeper at Keep 15 than at Keep 1.** Coins bind at Keeps 3–12 and Provisions at 13–15; raiding is a Coins engine paid in Provisions and is Provisions-negative at Keeps 3–5, 13 and 15. A top-up costs 15 Jade per hour of income at Keep 1 and 550 at Keep 15, while a 24-hour skip costs 180 everywhere, so from Keep 8 on the only rational Jade use is time. The casual player loses 1.2 to 5× what it loots to bot raids.

What is genuinely sound: the sim is deterministic and server-replayed, the power model keeps warriors inside a 4 % band per tier, nothing random is sold, the loot cap makes hoarding survivable per raid, and the Infiltration Points do create a real lever (the entry side swings a battle by 27–33 points). The problem is not the engine; it is that the numbers on top of it have one answer per question.

---

## 3. The grand unified game theory

The table below is the strategy map a competitive player converges to, with the margin over the runner-up and whether the game shows it. "Obvious" means the UI or the first session gives it away; "guessable" means an evening of play finds it; "hidden" means it needs the code or a tool.

| Phase | Decision | Dominant choice | Runner-up | Margin (evidence) | Findable |
|---|---|---|---|---|---|
| Keep 1–4 | Coins | Keep first, then camps and collectors; no defence | Build the catalogue | Keep 4 on day 0.7 either way; the first Kunai Tower holds the three softened raids only (PS, CU opening) | obvious |
| Keep 1–4 | Army | Throwers + a guardian; skip blades | Suggested army (blades + throwers) | +32.5 points at Keep 5 (AS-1) | guessable |
| Keep 1–4 | Jade | Spend the 500 on nothing but the third Artisan | Top-ups or skips | A top-up at Keep 1–3 costs 15–59 Jade per hour of income; the hut is permanent (JD-2) | obvious (the hut card shows the price) |
| Keep 5–8 | Coins | Keep > camps > collectors > storage; defence last or never | Defence-first | Rusher day 53.4 vs raider 51.2 vs turtle 82.6 to Keep 12 (PS-1) | obvious |
| Keep 5–8 | Provisions | Research the one line you field; train the bot mix | Research the roster | Research is 2–7 % of newly allowed Provision demand at Keeps 5–8 (CU flows B) | obvious |
| Keep 5–8 | Army | Thrower core, 5 Iron Monks, saboteurs, 4+4 healers | Suggested | +9.8 at Keep 8; Iron Monk is the single best addition at every Keep screened (AS-1, AS-3) | guessable |
| Keep 5–8 | Raid cadence | Raid whenever the army is 80 % full; press Next only for loot | Farm | Raiding yields 1.3–2.8× production per hour from Keep 6 (CU-2); 2 raids/session = 6 raids/session in days to Keep 12 (PS) | obvious |
| Keep 5–8 | Drop zone | Try all four sides; the scout report cannot tell you | Enter where the fewest defences cover | Best−worst side 27 points at Keep 6; the least-covered side wins 7 of 15 bases (DZ-1) | hidden |
| Keep 9–12 | Coins | Keep and economy; if any defence, Mortars and traps | Kunai Towers (the HP×DPS answer) | Mortar +1 saves 2.4–4.1 points per 1M Coins vs 0.7–2.8 for a Kunai Tower (DM-1) | hidden |
| Keep 9–12 | Research | Stop at the floor and dilute the queue | Research to the caps | Queue dilution: 3-star 95 % vs 5 % at Keep 12, loot −5 % (LD-1) | hidden |
| Keep 9–12 | Army | Chain-Sickle Reapers behind Mountain Shields, few Moonblades, healers | Suggested | +22.4 at Keep 12 (AS-1) | guessable |
| Keep 13–15 | Provisions | Train less, research the thrower and guardian lines only | Research all 50 | Roster research is 1.5 B Provisions at Keep 15; the optimum uses 6 types (CU, AS) | guessable |
| Keep 13–15 | Army | Thousand Needles behind Oni Breakers, Reapers, 7 Iron Monks | Pure Eclipse Ninja / pure Dragon Kites | +11.6 over Suggested; the pure armies sit 2–4 points under the best (AS-1) | guessable |
| Any | Jade | Skips only; never a top-up after Keep 7 | Top-ups | 550 Jade per hour of income by top-up vs 180 for a day of time (JD-1) | obvious |
| Any | Pass | Claim tiers on the last day of the season | Claim as unlocked | ×1.9 mean resources for the regular player (CU-6) | hidden |

Eleven of the fifteen decisions are obvious or guessable; the four hidden ones are hidden because the game does not show the quantity that matters (the strength floor, the per-Coin value of a defence, the side the bot would choose, the reward scale at claim time), not because several answers are close. **A game that is hard to solve has several near-equal answers per question. Kagemura has one answer per question and hides four of them.**

**The attacker–defender equilibrium.** There is no defender best response. Against the dominant thrower-guardian attack, the best Coin per point of defence is the Mortar, yet even upgrading every shooting defence one level at Keep 15 (100 M Coins) moves destruction by 19 points, and a maxed Keep 15 base still holds 40 % of raids only against the weak bot mix. Meanwhile defence spend delays the Keep, and the Keep (army housing, caps, hero level) is what wins raids. A population of optimizing players converges to: no walls (they are a 10-tile path cost that matters only where a ring is closed), two Mortars and the free Kunai Towers, full storage (the loot cap limits a raid to 1.7–4 % of it), full-time research of two lines, queue dilution, and thrower-guardian armies. Once real players meet, the hoarders are the best targets (a real village with full storage offers 1.4–3× the loot of a generated base of the same Keep, CU-4), and the honor ladder rewards session count: the regular player ends the campaign in the Obsidian league (100 Jade a month) and the casual player in Iron (50), on matchmaking that is research-driven, so honor buys nothing in the fights themselves.

---

## 4. Findings by dimension

Each finding gives the claim, the evidence, how it was measured, and the direction of a fix. Scripts and raw outputs are under `docs/audit/balance-2026-11-08/` (Appendix B). Severity: **critical** = breaks the owner's requirement on its own; **high** = a dominant line or dead system; **medium** = a clear defect or exploit of bounded size; **low** = polish.

### 4.1 Army composition (AS)

**AS-1 · critical · One composition family dominates at every Keep, and the Suggested army is far below it.** Harness: 20 bases per Keep (five layouts × level bias 0.5 and 1.0 × two seeds), full housing, research caps, hero from Keep 7, bot deployment plan with two entry seeds, coordinate-descent over housing shares from three starts, then the top ten re-fought. Results (mean of both entry seeds, destruction % / three-star rate):

| Keep | Best found | Suggested army | Bot mix | Margin | Within 3 pts of best |
|---|---|---|---|---|---|
| 5 | **98.2 / 93 %**: 15 Iron Monk, 40 Shuriken Storm, 23 Kunai Adept, 9 Saboteur, 4 Drum Monk, 4 Herbalist | 65.8 / 10 % | 58.9 / 10 % | +32.5 | 12 of 355 (3 %) |
| 8 | **69.7 / 32 %**: 102 Wind-Step Assassin, 40 Blowgun Hunter, 13 Bell Warden, 13 Gearbreaker, 5 Iron Monk, 6 Wall Climber | 59.9 / 10 % | (= Suggested) | +9.8 | 6 of 211 (3 %) |
| 12 | **79.4 / 38 %**: 67 Chain-Sickle Reaper, 54 Moonblade Master, 30 Blowgun Hunter, 18 Mountain Shield, 6 Iron Monk, 7 Gearbreaker, 5 Spirit Caller, 5 Herbalist | 57.0 / 3 % | (= Suggested) | +22.4 | 3 of 253 (1 %) |
| 15 | **76.3 / 28 %**: 132 Thousand Needle, 56 Storm Sovereign, 36 Chain-Sickle Reaper, 13 Oni Breaker, 18 Gearbreaker, 7 Iron Monk | 64.7 / 15 % | (= Suggested) | +11.6 | 4 of 241 (2 %) |

Two-type armies already beat the Suggested army by a wide margin: 90 Shuriken Storm + 18 Iron Monk scores 97.0 / 80 % at Keep 5; 160 Chain-Sickle Reaper + 31 Mountain Shield scores 70.6 at Keep 12; 180 Eclipse Ninja alone scores 72.5 / 43 % and 90 Dragon Kite Armada 68.8 / 40 % at Keep 15. The roles present in every Keep 5 near-optimum are thrower (12/12, 33 % of housing), guardian (12/12, 38 %) and mystic (11/12); blade, siege, beast and shadow appear in 0/12. The hill climb reached each optimum from the Suggested army in 3–8 accepted moves, every one of them a variant of "take housing from blades or saboteurs, give it to Iron Monks, throwers or healers". *Findability:* the Suggested army button is a trap that costs one to two stars per raid; the fix direction is learnable in one evening because every move points the same way. *Fix direction:* the optimum must change with the opponent. Give the layouts real counters to the thrower-guardian line (a Mortar with range 10 cannot hit a thrower standing at 3.5 tiles behind a guardian that absorbs splash; the Yagura that can is Keep 12 only and costs 1.5 M) and make the Suggested army layout-dependent (the scout report already knows the archetype). Add a lower gate per family and a "no single family > X" upper gate to `tests/gameplay/balance/army-lab.test.ts`.

**AS-2 · high · Generated bases at level bias 0.5 are flattened by the right army at every Keep, including Keep 5 maxed bases.** The best Keep 5 army averages 100.0 % against bias-0.5 bases and 96.5 % against maxed ones; per layout it averages 95–100 %. The layouts do not resist different armies differently: the global best is within 0–5 points of each layout's own best at every Keep (Keep 8: Twin Gates best 64.5 vs global 69.7 on that layout; Open Court 62.0). So base archetype is not a decision for the attacker and cannot be one for the defender (DECISIONS promises "three archetypes should each beat a different army"; the data says none does).

**AS-3 · medium · The marginal screens point the same way at every Keep.** Moving 10 % of housing from the Suggested mix to one warrior: Iron Monk is the best single addition at Keeps 12 and 15 (+8.7 and +5.1 points) and the climb's first accepted move at Keeps 8 and 15 (+9.4 and +4.0 when taken from throwers or blades); Gearbreaker is the best at Keep 8 (+2.9). The bottom of every screen is the same warriors: Shinobi/Hedgehog line (Keeps 5, 8, 12), Shadow Stalker and Mirage Twin (8, 15), Crane Glider (12, 15), Mist Weaver (8), Ram Crew (5). Whole families never enter a near-optimum at any Keep: siege (pure siege scores 6.7, 14.6, 29.8 and 20.6 at Keeps 5, 8, 12, 15), beasts (42.5, 13.3, 41.5, 40.6) and, from Keep 8, blades as more than filler. These are dead choices today.

### 4.2 Buildings and defence (DM)

**DM-1 · high · The best defence per Coin is the Firework Mortar, then traps; the prior metric inverted this.** Paired simulation on 15 bases × 2 entry seeds per Keep (bias 0.5, bot mix at caps with hero): destruction points saved per 1 M Coins when every building of one type goes up one level:

| Purchase | Keep 6 | Keep 9 | Keep 12 | Keep 15 |
|---|---|---|---|---|
| Shuriken Tower +1 | **13.6** | 0.7 | 0.7 | 0.5 |
| Kunai Tower +1 | 10.7 | 2.8 | 0.9 | 0.2 |
| Mortar +1 | 4.4 | **4.1** | **2.4** | **1.5** |
| Traps +1 level | 1.5 | 6.3 | 2.2 | 0.6 |
| Sky Bow +1 | 0.7 | 0.6 | 0.3 | 0.1 |
| Ballista +1 | – | 1.2 | 0.1 | 0.0 |
| Yagura +1 | – | – | −0.4 | −0.0 |
| Walls +1 level | 1.8 | 0.8 | 0.5 | −0.3 |
| Soft counters +1 | 2.0 | 1.1 | 0.7 | −0.1 |
| Collectors + storage +1 (HP filler) | 0.1 | 0.3 | 0.0 | 0.0 |

Silencing a whole class shows the same picture: both Mortars silenced adds +38.7 points to the attacker at Keep 6, +17.5 at Keep 9, +27.9 at Keep 12 and +20.2 at Keep 15 for 0.3–10 M Coins of buildings, while the three soft counters silenced add 0.0 at Keeps 12 and 15 and Sky Bows and Ballistas add 0.0 against the bot mix. FSR 3.4 and D3 used HP × DPS per Coin and ranked the Mortar 5–10× below the Kunai Tower; the metric ignores splash against swarms, and the sims reverse it. *Fix direction:* lift the Mortar's count and level caps (2 per base at every Keep; level 6 frozen from Keep 7 to 10), give every defence a per-Coin budget measured by this paired test rather than by HP × DPS, and let the soft counters do something against the live meta (a Brazier that also cuts thrower range or a Lantern Line that reveals and slows).

**DM-2 · high · No defence spend pays back for a progression-maximizer; the "0 % held" of the prior campaigns was mostly the model's policy.** The documented model player leaves its defences at level 1 and places no walls, so its village is destroyed 100 % by every raid (the raider has 2 of 4 Kunai Towers at level 1 and nothing else at Keep 8). Generated bases of the same Keep hold 9 % at bias 0.5 and 40 % at bias 1.0 against the capped bot mix (held = 0 stars; three-starred 29 % and 2 %). So a base *can* hold, but in the played campaigns the policy that builds everything defensive (turtle) holds 22 % of raids and loses 481 k per raid against the raider's 684 k, at the price of 31 more days to Keep 12; stolen per raid for the rusher (no defence at all) is 727 k against the raider's 684 k, a 6 % difference. With bot raids taking 20–30 % of a 4-session player's production and the best purchase saving at most 4 points per 1 M Coins at Keep 9 (about 1.8 % of the stolen amount per raid for a 1 M Coin spend that would otherwise be 27 % of the next Keep), defence is dominated in every Keep for anyone who values progression. *Fix direction:* either make defence buy progression (a held raid should pay more than 5 % of a raid's minimum loot: the held reward paid 0 Coins over 206 raids for the raider and 446 k over 314 for the turtle) or make losses hurt (the loot cap of 1.7–4 % of a full storage from Keep 7 makes the undefended hoard safe).

**DM-3 · medium · Hand-written caps leave dead stretches.** Sky Bows: 2 per base from Keep 6 to 10, level 3 at both Keeps 6 and 7; Mortar level 6 from Keep 7 to 10; Spike Pit level flat across five pairs of Keeps; Shuriken Tower level 8 from Keep 7 to 9; the Yagura appears at Keep 12 at level 3 and jumps 3 → 5 → 7 → 10. The late-Keep defence count is 16 shooting towers for a 360-housing army (FSR D4 holds). From Keep 9 every collector, storage and camp level sits on the 7-day timer (`buildings.maxSeconds`), so builder time, not Coins, gates Keeps 9–15 (1,771 builder-days to max, 7–10 resource-days per Keep; FSR P2 holds).

**DM-4 · low · Storage is never harmful and the walls budget buys little.** The 20 % raidable rule binds only at Keeps 1–2; from Keep 3 the loot cap binds, so bigger storage never raises losses. Walls at Keep 9 matter (removing all of them adds 12.7 points to the attacker on walled layouts) but at Keeps 12 and 15 they do not (+0.7, −1.6), because a hedge is a 10-tile detour and the late layouts have gaps; 52.5 M Coins to max them is 15 % of the Keep 15 defence budget.

### 4.3 Drop zones (DZ)

**DZ-1 · high · The entry side is the largest in-battle lever, and the information the game shows does not predict it.** Same army, same base, four bot entry sides: best minus worst side averages 26.7 points at Keep 6, 33.3 at Keep 10 and 32.2 at Keep 15 (five layouts × three seeds, bias 0.5). The scout report's per-point count of covering defences (`pointIntel.defenses`) picks the best side 7 of 15, 6 of 15 and 7 of 15 times (chance is 1 in 4) and the rank correlation between coverage and destruction is 0.08, −0.07 and 0.04. FSR S1 measured "timing and grouping" at a few points; the *side* is worth a star, and the player has no way to read it except trial and error against a base that changes every scout. *Fix direction:* make the point intel mean something (defence DPS reachable along the path, not a count) or let the attacker preview a dry run; alternatively, make the side matter less (defences on every approach) and move the skill into timing, which today is worth little.

**DZ-2 · medium · Which approaches are closed is a hash of the layout, and one decor tile flips it for 4–19 points.** Moving a single Bonsai Planter among free interior tiles cycles the closed pair through all four possibilities: on a Keep 12 Twin Gates base the attacker's mean destruction over all sides moves from 58.0 to 76.8 (18.8 points); on a Keep 12 Walled Keep 53.4 to 68.5; on Keep 8 bases 3.9 and 7.1. The defender gets no feedback and cannot choose; a player who learns the hash (it is in the open-source client) can. Confirms FSR D5 with a magnitude. *Fix direction:* make the closed approaches an explicit defender choice shown at scouting (a gate building or a saved setting), which is also the only way the base layout becomes a decision against the dominant attack.

**DZ-3 · medium · The free hero banks loot alone.** `checkBattleSetup` does not require a single warrior; a battle with `army: {}` and the hero runs. The Shadow Captain alone destroys 2.5–4.3 % of a base at bias 0.5 (never a star) but banks 17 k Coins + Provisions per battle at Keep 7, 33 k at Keep 9, 47 k at Keep 12 and 327 k at Keep 15, with no army spent, no fee (the first scout after an attack is free) and at most 20 honor lost (none at 0 honor). Twenty such battles an hour is 348 k at Keep 7 against 65 k of production in both currencies, and 6.5 M at Keep 15 against 3.6 M. *Fix direction:* no loot or honor change from a battle that deployed no warriors (one line in `battleEnd`), and a server rule of the same shape.

**DZ-4 · low · Cover and squads behave as designed.** Cover is `max(15, biggest housing, ceil(army/3))` from `setup.army` only; the hero needs a point like everyone else; abilities go anywhere; a dead warrior does not free cover. At Keeps 1–2 the 15-housing minimum gives two then three squads. No bug found in `pointAt`, `coverLeft` or `deploy`.

### 4.4 Played campaigns under alternative policies (PS)

Model player, regular cadence (four visits a day), real timers, battles and bot raids, stopped at Keep 12; casual cadence (one visit) for 90 days. The documented raider and defender are the baselines from `docs/game-theory/campaign.json`.

| Policy (regular) | Keep 8 | Keep 10 | Keep 12 | Raids | Avg stars | Loot/raid | Held | Stolen/raid | Stolen ÷ looted |
|---|---|---|---|---|---|---|---|---|---|
| raider (documented) | 23.4 | 32.6 | 51.2 | 206 | 1.86 | 524 k | 0 % | 684 k | 64 % |
| raid_max (6 raids/session) | 23.4 | 32.6 | 51.2 | 206 | 1.86 | 524 k | 0 % | 684 k | 64 % |
| defender (documented) | 23.4 | 33.4 | 53.0 | 209 | 1.62 | 527 k | 0 % | 692 k | 67 % |
| rusher (no defence at all) | 23.4 | 33.0 | 53.4 | 215 | 1.71 | 521 k | 0 % | 727 k | 70 % |
| sandbagger (research stops at the floor) | 24.4 | 39.6 | 59.4 | 234 | 1.87 | 351 k | 1 % | 728 k | 102 % |
| no_research | 24.4 | 43.0 | 66.0 | 263 | 1.17 | 266 k | 0 % | 755 k | 137 % |
| hoarder (never raids) | 26.0 | 44.0 | 73.0 | 0 | – | – | 0 % | 828 k | – |
| turtle (defence and walls first) | 44.2 | 57.2 | 82.6 | 314 | 1.32 | 440 k | 22 % | 481 k | 59 % |

| Policy (casual, 90 days) | Keep 5 | Keep 6 | Keep 7 | Keep 8 | Held | Stolen ÷ looted |
|---|---|---|---|---|---|---|
| raider | 13.7 | 38.7 | 56.4 | 74.4 | 1 % | 190 % |
| rusher | 13.7 | 38.7 | 56.4 | 74.4 | 0 % | 190 % |
| sandbagger | 11.7 | 38.7 | 77.4 | – | 1 % | 370 % |
| turtle | 28.7 | 55.7 | – | – | 24 % | 155 % |

**PS-1 · critical · Zero defence costs nothing measurable; defence-first costs 60 % of the pace.** Rusher and raider are identical to the day at Keeps 4–8 and within 2 days at Keep 12 for the regular player, and identical to the day for 90 casual days. The turtle holds a fifth of raids and loses 30 % less per raid, and reaches Keep 8 on day 44 instead of 23. The model has no Jade and uses the bot plan, so a human turtle does a little better, but the ordering is not close.

**PS-2 · high · Raid frequency is capped by the army, not by the player.** Six raids a session produced exactly the campaign of two raids a session (same 206 raids): the refill time (51–105 minutes at the best Dojo) and the 80 % threshold bind. Raiding is still necessary: the hoarder reaches Keep 12 on day 73 against 51.

**PS-3 · medium · Sandbagging research as a progression strategy loses (day 59 vs 51 to Keep 12) because loot per raid falls 33 %; as a star strategy it wins (section 4.5).** Not researching at all is punished from Keep 9 (0.52 stars, 35 % wins).

**PS-4 · low · The model player's own village is the weakest base in the game**: level-1 towers, no walls, built last, so the campaign's "0 % held" measures the policy, not the defences (hold_b.out). Prior reviews (FSR D1, STATE E26) drew the "defence is worthless" conclusion from it; the paired sims and the turtle campaign give the corrected version in DM-2.

### 4.5 Ladder, matchmaking, bot raids, trials and events (LD)

**LD-1 · critical · Queue dilution: the matchmaking floor can be pulled a full Keep down for free, and three-star rates go from 5 % to 95 %.** `attackerStrength` averages `researchKeep(level + levelCapOffset)` over the *set* of fielded warrior types (army plus training queue), unweighted by count, floored at Keep − 1.5. Queuing one level-1 copy of each old warrior the Keep can train (15 types at Keep 6, 26 at Keep 9, 36 at Keep 12, 46 at Keep 15; they wait in the queue because the camps are full, so they cost 0 housing and a few hundred Provisions) while the real army sits at its research caps gives, against the opponents the matchmaker then serves at the campaign's typical honor (20 seeds, bot plan, hero):

| Keep | Honest: destruction / stars / 3-star / loot | Diluted queue: destruction / stars / 3-star / loot | Honor per raid |
|---|---|---|---|
| 6 | 51.8 / 1.10 / 5 % / 143 k | 90.8 / 2.65 / 70 % / 80 k | +31.8 → +31.3 |
| 9 | 66.2 / 1.90 / 10 % / 727 k | 97.9 / 2.90 / 90 % / 427 k | +47.4 → +50.0 |
| 12 | 56.1 / 1.50 / 5 % / 2.11 M | 98.3 / 2.95 / 95 % / 2.01 M | +39.6 → +50.0 |
| 15 | 60.0 / 1.25 / 0 % / 14.9 M | 96.7 / 2.85 / 85 % / 10.2 M | +31.8 → +50.0 |

Diluting the camps instead of the queue costs housing and gives roughly half the gain; stopping research at the floor ("B1") gives +1 star and −13 to −56 % loot. At Keep 12 the diluted player banks 95 % of the honest player's loot with 19× the three-star rate and more honor. Every star- or win-based system (daily and weekly tasks, Season Scroll points, achievements, honor, leagues, Alliance War stars, Gang Wars, the Bounty Hunt ladder) is exposed. The UI shows the Keep and honor, never the strength floor, so this is hidden until found; once found it is dominant. *Fix direction:* weight the average by housing (or take the maximum over types), ignore the training queue, and read a type's level as the level the player *can* field; add a test that queuing a unit never lowers `attackerStrength`.

**LD-2 · high · Honor does not reach the matchmaker in normal play; the ladder rewards session count.** The honor needed before honor raises the opponent above the research floor is 2,013 at Keep 6, 3,063 at Keep 9, 4,025 at Keep 12 and 5,163 at Keep 15; the regular campaign's honor at those Keeps is 1,480, 2,031, 3,000 and 3,786. So opponents are set by research alone, honor is a league-chest counter (10 to 200 Jade a month), and a 4-session player (final honor 3,800, Ember/Storm) out-earns a 1-session player (1,257, Iron) by 75–100 Jade a month for identical skill. Sandbagging research therefore costs nothing on the ladder.

**LD-3 · medium · The player's own attack ends the shield; a Trial does not.** `battleEnd` sets `shieldUntil = min(shieldUntil, now)`; `trialEnd` leaves it. Raids against a 1-session player fall from 1.20 a day to 1.00 if attacks kept the shield (Monte Carlo on the real slot rule); the optimal play is to attack in a burst just before a shield lapses and to play Trials while shielded, which nothing tells the player. The held-defence reward (5 % of the Keep's minimum loot) was paid 0 times in 206 raids for the raider; the settle-the-score rematch costs a full army for 15 % × stars/3 of the minimum loot and has negative expected value at every Keep (−3.5 k at Keep 3 to −3.2 M at Keep 15 per rematch at the campaign's average stars).

**LD-4 · medium · The casual player's raid tax is 1.2–5× what they loot.** From the campaign: stolen ÷ looted is 64 % for the regular player and 190 % for the casual raider over 90 days (370 % for the casual sandbagger); per Keep the casual loss is 21–59 % of an 8-hour-a-day production. Confirms FSR P3 with per-Keep numbers; raids per day are 1.1 for one visit and 1.5–1.9 for two to four visits (shields block 25–57 % of slots).

**LD-5 · low · Events and tasks.** Night of Raids covers 28.6 % of all time and lifts a uniform raider's loot 5.7 %; a player who saves raids for its 96 hours gains 20 % on those. Harvest Festival is worth at most 2.4 hours of production per collector per event because collectors hold 8 hours. Swift Feet (−25 % training) lets a player bank camps plus one queued army at a discount. The adaptive star and win tasks follow the last ten raids, so a player who throws raids lowers the target (`recentRaidRates`); the diluted queue makes that unnecessary.

### 4.6 Warriors as data (RM)

**RM-1 · high · The Shadow role is on the Pareto front of power per housing and power per Provision at every Keep from 3, and nothing else is.** Shadow Stalker is the cheapest power per Provision at Keeps 3–15; Eclipse Ninja has the highest power per housing at Keep 15 (495 vs 413 for Storm Sovereign, +20 %); 45 of 50 warriors are dominated on both raw axes at Keep 15. The role efficiencies (1.2 Shadow, 0.627 Thrower, 0.568 Sky) and the three DPS taxes make Thousand Needle, Siege Bombardier and Hawk Tamer strictly dominated with kits that measure 0.0 points (needle), 0.0 (bombardier) and +1.3 (tamer) when switched on. The sims agree in part: pure Eclipse Ninja is the second-best Keep 15 army; but the optimum is the thrower line the data calls weakest, because splash and standing behind a guardian are worth more than raw power. The power budget (`progression.json`) is therefore not the quantity that decides battles, and the "no dominance inside a tier" test checks inputs the battles do not respect (FSR X2 holds).

**RM-2 · high · Newer tiers are often worse than older ones in the same slot.** Swapping one role's slot in the bot mix at Keep 15 (6 layouts × 2 seeds): Mountain Shield (tier 4) beats Oni Breaker (tier 5) by +8.4 points; Gearbreaker (tier 3) beats Ghost Engineer (tier 5) by +5.9; the tier-1 Saboteur beats Ghost Engineer by +3.1; Eclipse Ninja in the blade slot is +13.6. At Keep 13 Wind-Step Assassin (tier 3) ≥ Storm Sovereign (tier 5), Chain-Sickle Reaper (tier 4) +5.2 over Thousand Needle. A new tier arrives at level 1 reading 4–8 % stronger per housing than the old tier at its cap and costs 18 % more to train and 3× to research; the extra 4 % per tier at the pinnacle (FSR B3) is real but is swamped by the kits. *Fix direction:* either give each tier-5 kit a measured value of at least the 4 % budget step (Oni Breaker's wall multiplier and Ghost Engineer's multi-jam are worth ≤ 0 against bases with gaps and jam immunity) or stop presenting tiers as upgrades.

**RM-3 · medium · Twelve kits are worth nothing or less than nothing in play.** Kit on versus off, same army and bases (6 layouts × 2 seeds, early and Keep 15): 0.0 points for Shinobi, Kunai Adept, Armored Guardian, Kite Raider, Tunnel Runner, Shuriken Storm (early), Wall Climber, Grapple Raider, Crane Glider, Thousand Needle, Trap Breaker (late); negative at Keep 15 for Bell Warden (−5.7: the taunt pulls every defence in range onto him), Blowgun Hunter (−3.4), Chain-Sickle Reaper (−3.6), Oni Breaker (−1.2), Phantom Gate (−1.2). The hero's Rally aura at 30 % versus 0 % changes nothing measurable (77.3 vs 77.2 at Keep 7, 82.7 vs 82.2 at Keep 15); the hero's +4 to +6 points come from his body (2 % of army power) absorbing fire. Big kits: Moonblade +15.7, Storm Chain +14.7, Mountain Shield +12.5/+10.3, Gearbreaker +9.5/+12.6, Spirit Caller +10.7, Eclipse +9.8, Drum Monk +10.2. *Fix direction:* a test that every kit is worth ≥ +2 points in the lab, and a rewrite of the zero ones (several are plain stat units whose card promises an effect).

**RM-4 · low · Data consistency.** Tier at cap vs tier below at the same Keep: power ×1.04, train cost ×1.18, research ×1.1–1.25; housing per Keep matches `armyHousingByKeep` (K10 = K11 = 300); the refill target (≤ 2 h at the best Dojo) holds (51–105 min). The hero is 1.6–2.7 % of the army's power at every Keep.

### 4.7 Coins and Provisions (CU)

**CU-1 · high · The two currencies carry unequal loads and the binding one flips at Keep 13.** Newly allowed demand per Keep (buildings × caps, research for the bot mix, refills) against a 4-session player's supply (production, campaign loot and losses): Coins bind at Keeps 3–12 by a factor 1.1–2.7 (Keep 7: 15.2 days of Coins against 5.7 of Provisions); Provisions bind at Keeps 13–15 (Keep 15: 7.5 days of Coins against 12.3 of mix research or 61 of full-roster research). Coins pay the Keep, defence, walls and Farms; Provisions pay every warrior, research, Mint, Treasury and camp. A player who follows the dominant line (no defence) is Coins-rich from Keep 8 (storage full 13 % of sessions, Coins full 13 %, Provisions full 0 % in the raider campaign).

**CU-2 · high · Raiding is a Coins engine paid in Provisions, and it is Provisions-negative at Keeps 3–5, 13 and 15.** Campaign loot per raid minus the bot-mix army's Provisions: −1.7 k at Keep 3, −3.7 k at Keep 4, −1.7 k at Keep 5, +6.9 k at Keep 6, +85 k at Keep 8, +300 k at Keep 11, −50 k at Keep 13, −990 k at Keep 15 per raid. Per raid-hour (refill + 3 min) raiding yields 1.0–2.8× both-currency production from Keep 5 on, so it is always right for Coins and wrong for Provisions late, which deepens the Keep 13–15 Provisions wall (research of the full roster: 1.53 B Provisions at Keep 15, 61 days of a 4-session player's net).

**CU-3 · medium · Train top-up then cancel is a Jade-to-Provisions exchange at 100 % refund, breaking the no-stockpile rule, but at a price that makes it a curiosity.** `topUp` with a `train` action pays the shortfall (a top-up is allowed from 0 resources: `shortfallQuote` refuses only when the full cost exceeds storage) and `cancelTraining` refunds the full cost into storage. One command buys up to the training-queue room: 2 k Provisions for 55 Jade at Keep 1, 72 k for 364 at Keep 5, 1.15 M for 384 at Keep 15, each at exactly the top-up curve. Upgrade and research cancels refund 50 %, so they cost 2×. TOP_UP.md rule 1 ("bought resources never sit in storage") does not hold; materiality is low because the same Jade buys 24 hours of time at every Keep and only 0.6 hours of income at Keep 15 (next finding). *Fix direction:* refund a cancelled top-up in Jade, or refund the Provisions share that was topped up at the cancel fraction.

**CU-4 · high · A real village is a better target than a generated base, not a worse one.** `villageToBase` exposes 20 % of storage capped at the Keep's minimum generated loot plus 50 % of up to 8 hours of collector output, so a full village offers 1.4× (Keep 15) to 3.0× (Keep 3) the loot of a generated base of its Keep (51 k vs 17 k at Keep 3; 33 M vs 24 M at Keep 15). FSR P7 claimed the opposite. Per 100 % raid a Keep 7–15 hoard loses 1.7–4 % of a full storage, so hoarding is safe per raid and expensive per month (60 raids = 100–240 % of a full storage). Once real players meet, the dominant target is the undefended hoarder, which the dominant Coin order produces.

**CU-5 · medium · The Jade price of a resource is 37× steeper at Keep 15 than at Keep 1, so top-ups are dead after Keep 7.** `topUpScaleByHall` grows 0.22 → 15.1 while hourly income grows 400 → 1.78 M (×4,450); a top-up costs 15 Jade per hour of income at Keep 1, 97 at Keep 5, 133 at Keep 8, 364 at Keep 12 and 550 at Keep 15, while a 24-hour skip is 180 Jade at every Keep and an army finish is 50 → 756. The design chose the square root of loot deliberately (TOP_UP.md) to stop early-Keep giveaways; the result is that one product is a giveaway at Keep 1 (five hours of income for 55 Jade) and irrelevant at Keep 15. The rational Jade use is one sentence long: "buy time, never resources, after Keep 7".

**CU-6 · medium · Season Scroll and calendar rewards are read at the Keep at claim time; waiting multiplies them.** `claimTier` scales the fixed resources by `rewardScaleByHall` at the moment of the claim (tier 2 premium: 1.8 k at Keep 5, 8.3 k at Keep 8, 115 k at Keep 13). Over the regular campaign a Keep changes inside 99 % of seasons; claiming every tier on the last day instead of as unlocked yields ×1.94 on average (×5.1 in the best season, 12.6 hours of income, about 3,100 Jade of top-ups) and ×1.47 for the casual player. The premium Scroll's honest estimate prices the tiers at the Keep at purchase. STATE E07 called this small; it is not. *Fix direction:* scale by the Keep at unlock, or at the season's start.

**CU-7 · low · Refunds and rewards at full storage are silently lost** (a 42 k refund received as 0; a chest consumed with its contents overflowed), the dismiss refund uses the *current* level price (a level-1 Shinobi dismissed after research to level 20 refunds 73× what it cost: 0.3 h of Keep 15 production per full camp, immaterial), and the six parallel per-Keep tables agree within 1.5× of each other except `storageLootCapByHall`, which kinks at Keep 7 to the generated minimum.

### 4.8 Jade (JD)

**JD-1 · high · Free Jade and the price ladder make time the only purchase; a free daily player earns about 130–390 Jade a month, not 540.** From code: chest 28.5 a month (0.95 a day), streak 21.4 (5 every 7 days), calendar 48 in the first 28 days then 91 a cycle, Season Scroll free track 150 for all 30 tiers (471 points a day of full tasks reach tier 30 in 19 days; one daily plus one weekly a day reaches tier 15 and 45 Jade), league chest 50 (Iron, casual) to 125 (Ember, regular), Bounty Hunt 75, Alliance War 10–40 a week only if the player attacks, Trials 5 per 10 tiers once. A casual player with no war: about 130–200 a month; a regular player who does everything: about 390. One-time: 500 start, 91 obstacles, 2,540 achievements over the whole game, 30 trials. STATE E05's ~540 counted the pre-fix streak and war chests. What it buys: builder 3 (250) in 1–2 months for the casual player, then builder 4 (500) in 3–4; at Keep 10 a month of free Jade skips 36–52 hours of a 223-builder-day Keep.

**JD-2 · medium · The opening has one answer and the tutorial points at the wrong button.** 500 Jade at Keep 1–3: a third Artisan (250, permanent, +50 % builder throughput for the game) against a top-up that buys 5 hours of income at Keep 1 and 2.5 at Keep 2, or the Keep 4 → 5 timer skip (72 min, 18 Jade). The hut is the only non-trivial use and is shown with its price; the tutorial's two "Finish now" prompts (FSR H4) spend Jade on the worst rate in the game. Keep 1–2 have no other choice: the model player reaches Keep 3 in one hour and Keep 4 in 16 (opening.out.txt).

**JD-3 · medium · Paying hurts in the one place money could matter.** Rushing Keeps without research puts the army at the floor: the "zero research" line at Keep 12 scores 43.9 % and 0.60 stars against 56.1 % honest, and at Keep 15 26.8 % and 0 stars against the opponents its Keep floor serves (LD sandbag table, B0 rows). The game's matchmaker protects honest research; it punishes bought Keeps. The dollar ladder itself (45–75 Jade per $ in packs, 120 in the stipend, offers 130–184) still inverts (FSR H2 holds; the stipend was cut to 360 but packs were not raised).

### 4.9 Battle rules (CR)

**CR-1 · medium · Walls are a ten-tile detour, not a wall.** `findPath` adds `hedgeCost × 10 = 100` to a hedge tile against 10 per straight step, so a warrior walks around a wall when the gap is within ten tiles and breaks through otherwise (`stepTroop` attacks the hedge on its path). With 125 walls and the generated layouts' gaps, this is why walls matter at Keep 9 (+12.7 when removed) and not at 12–15 (DM-4), and why only `walls`/`breach` roles ever earn their wall multipliers (Oni Breaker's ×5 measured −1.2). FSR D2 described the cost as "10"; the effective value is 100 path units, which changes the fix: raising it further would not help; a layout with no gaps would.

**CR-2 · medium · The decisive levers a human has are the side and the composition; the abilities are small.** Smoke Bomb was measured by FSR at +1.6 to +8 points for three charges; Sabotage is one 6-second jam per Saboteur with 10 seconds of immunity (`jam`, `immuneUntil`), so no defence can be locked; the hero's Rally is a no-op in effect (RM-3); a second wave loses 5–15 points to the 180-second clock. Against that, the entry side is worth 27–33 points and the composition 10–33. The 180-second clock ends battles with troops alive often enough that two-wave plans lose; this is why "everything at once from the right side with the right army" is the whole skill.

**CR-3 · low · Determinism.** The replayed battle path uses only the allowed operations; `trials.ts` uses `Math.pow` to set a tier's power *before* the battle, which is fine. No bug was found in splash flags, grounded flyers and traps, projectile targets, or cover accounting in the paths read.

---

## 5. Checked and corrected

Claims from the prior reviews that this audit's measurements contradict or narrow, and claims of this audit that did not survive its own checks.

| Prior claim | What the measurements say | Trust |
|---|---|---|
| FSR D3 / 3.4: the Mortar is 5–10× dominated per Coin (HP × DPS) | Paired sims: Mortar +1 is the best purchase per Coin at Keeps 9–15 and silencing Mortars adds 17–39 points; HP × DPS ignores splash | this audit (DM-1) |
| FSR D1, STATE E26: defence is nearly worthless; 0 % held in 270 raids | The 0 % was the model player's level-1, wall-less village; generated maxed bases hold 40 %, the turtle holds 22 %. Defence is dominated for *progression*, not worthless | this audit (DM-2, PS-1) |
| FSR P7: real player bases are strictly worse targets than generated ones | A full real village offers 1.4–3× a generated base's loot (storage cap + collectors) | this audit (CU-4) |
| FSR D2: walls are "a path cost of 10, not a block" | The cost is 100 path units (a 10-tile detour); walls matter where rings are closed (Keep 9 +12.7) and not where gaps exist | this audit (CR-1) |
| FSR B1: air, support and siege are dead strategies | Pure Dragon Kites score 68.8 (2nd–3rd) at Keep 15 and pure Crane Gliders 92.5 at Keep 5; mystics are in 11 of 12 Keep 5 near-optima as a 12 % share. Siege and beasts are dead; air and support are not, as complements | both, narrowed (AS-1, AS-3) |
| FSR S1: timing and grouping move the result by a few points | True for timing; the entry side moves it 27–33 points and composition 10–33 | both, extended (DZ-1) |
| STATE E07: pass-tier scaling at claim time is a small timing exploit | ×1.94 mean for the regular player, ×5 in the best season | this audit (CU-6) |
| STATE E05 / FSR 3.6: ~450–550 free Jade a month | 130–200 casual, ~390 regular after the streak and war fixes | this audit (JD-1) |
| FSR H5 / TOP_UP.md: skip-and-raid within 1–10× (or 16×) of a top-up | Not recomputed this pass; the top-up price per hour of income (15 → 550) makes the comparison moot after Keep 7 | open |
| This audit, first pass: "top-up then cancel is an exploit" | True as a rule break, immaterial as value (CU-3) | narrowed |
| This audit, first pass: "the hero alone can one-star bases" | False (0 stars at every Keep); it banks 3–5 % of a raid's loot for free instead (DZ-3) | corrected |

Verification note: the plan was two independent adversarial verifiers per dimension. The account's usage limits ended both verifier passes before any reported, so the verification in this document is the author's: every code claim above was re-read in the cited function (`cancelTraining`, `shortfallQuote`, `attackerStrength`, `matchStrength`, `battleEnd`, `trialEnd`, `checkBattleSetup`, `findPath`, `villageToBase`, `claimTier`), every simulation number comes from a script in Appendix B that can be rerun, and the two first-pass claims that did not hold are listed above. Independent re-verification remains worth doing before data changes are made on the strength of this report.

---

## 6. Changes that would make the game balanced and hard to solve

Ranked by how much they move the two requirements. Each names the data or rule, the tests and tools to rerun, and the risk. Combat changes (3, 4, 6, 7) change the battle result: run `npm run rules:snapshot` first, bump `SIM_RULES`, update `tests/gameplay/battle/rules-version.test.ts`, and deploy the server before the game.

1. **Close the matchmaking dilution (LD-1).** In `attackerStrength`, weight each type by its housing in the army, ignore the training queue, and read a type's level as the highest level the player can field. Add `tests/gameplay/sim/matchmaking.test.ts` cases: queuing a unit never lowers strength; one unit of a weak type among 300 housing moves strength by less than 1 %. No `SIM_RULES` change. Risk: none for honest players; the floor stays where their research is.
2. **No loot or honor from a battle that deployed no warriors (DZ-3).** One guard in `battleEnd` (and the server's report check): `result.used` empty → practice result. Risk: none.
3. **Make the dominant attack answerable, so the best army depends on the base (AS-1, AS-2, DM-1).** Three data moves in `buildings.json` and `hall.json`: lift the Mortar's level cap off its Keep 7–10 plateau (6 → 7 at Keep 8, 8 at Keep 10) and allow a third Mortar from Keep 9; give the Bitter Smoke Brazier a second effect against throwers (range −1 tile inside its radius) and the Paper Lantern Line a slow, so the soft counters stop measuring 0.0; bring one planned anti-thrower building forward to Keep 8 at a tenth of the Yagura's price (the catalogue has Sand Bucket Post and Steam Vent authored). Rerun `npm run balance:armies` and the harness in Appendix B: the target is that the per-layout best differs from the global best by ≥ 10 points on at least two layouts at Keeps 8, 12 and 15, and that no single composition is within 3 points of the best on all five layouts.
4. **Make the Suggested army a reading, not an answer.** `sim/suggest.ts` should take the scouted layout (`BaseLayout.practice` / archetype and the point intel) and return a different mix per archetype; add an army-lab gate that each archetype's suggested mix beats the global mix on that archetype by ≥ 5 points. This only matters after change 3 gives archetypes different weaknesses.
5. **Give defence a progression return (DM-2, PS-1).** `raids.json`: `defenseWin.shareOfRaidLoot` 0.05 → 0.25 and pay it on ≤ 1 star lost; raise `storageLootCapByHall` at Keeps 7–15 from the generated minimum to about 1.6× it so an undefended hoard loses 3–6 % per raid instead of 2 %; and let a held raid grant a shield like a lost one does. Rerun `npm run balance:campaign` with the turtle and rusher policies from `scripts/policy_sim/` added to `tools/balance/campaign.ts`: the target is rusher at least 10 % slower than a defender who spends 20 % of Coins on defence, not 4 % faster. Risk: the casual raid tax (LD-4) rises with the loot cap; pair it with `shieldTiers` 12/14/16 → 16/20/24 h.
6. **Let the defender choose the closed approaches and make the point intel predictive (DZ-1, DZ-2).** Replace `layoutHash(base) % 8` in `planInfiltration` with a saved defender choice (default: the hash, so old bases keep their points), shown at scouting; change `pointIntel` to report defence DPS reachable along the shortest path to the Keep rather than a count. Rerun `tests/gameplay/balance/placement.test.ts` and the `dz.ts` script: the target is a rank correlation ≥ 0.5 between the shown intel and the measured side outcome. This is the one change that makes base building a decision against the dominant attack.
7. **Make tiers and kits worth their price (RM-2, RM-3).** Add a lab gate that every kit measures ≥ +2 points on versus off at its unlock Keep and at Keep 15 (the `kits.ts` script is the gate); rewrite the eleven zero kits (start with Thousand Needle, whose tax 0.6 and range 5 buy nothing, and Bell Warden, whose taunt is negative); require each tier-5 kit to be worth the tier's 4 % step. Until then, stop the Codex calling tiers upgrades.
8. **Rebalance the two currencies (CU-1, CU-2).** Price tier-3+ research alternately in Coins and Provisions (or move the Treasury and camps to Coins), so Coins carry research late and Provisions carry something early; cut `research.tierCostMult` 3 → 2.2 as FSR 4.1.6 proposed. Rerun `progression-model.test.ts` (roster research < 1 year) and the flows script: the target is a binding-factor under 1.3 in both currencies at every Keep for the 4-session player.
9. **Scale fixed rewards at unlock, not at claim (CU-6).** In `claimTier` and `claimCalendarDay`, compute the reward at the Keep the player had when the tier unlocked (store it with the unlock) or at the season's start. Risk: none.
10. **Flatten the Jade price of resources across Keeps or retire top-ups after Keep 7 (CU-5).** Either regenerate `topUpScaleByHall` as income^0.75 (15 → ~150 Jade per hour of income instead of 15 → 550) with `tools/balance/topup.mjs`, accepting that TOP_UP.md's "rush costs more at every Keep" test must be re-tuned, or remove the top-up buttons from Keep 8 on and say so. Pair with a refund in Jade for a cancelled topped-up action (CU-3).
11. **Raise the entropy of the roster's raw power.** Today Shadow is on the Pareto front alone at every Keep (RM-1). Bring Shadow's efficiency to 1.1 and Thrower's to 0.7 while removing the three DPS taxes (whose kits are measured at 0), and re-measure with the harness; the target is at least three roles on the front at Keeps 8, 12 and 15.
12. **Measure, then gate, with the right instruments.** Replace HP × DPS per Coin in the balance docs with the paired marginal test (`marginal.ts`), add the composition harness as `npm run balance:search` with a gate "no composition within 3 points of the best on every layout", and add the rusher, turtle and sandbagger policies to the campaign gates so the dominance margins in section 4.4 are tracked.

Of FSR section 4's suggestions, this audit **confirms** 4.1.5 (shields and the casual tax), 4.1.7 (a return for defence), 4.2.6 (dead families, narrowed to siege and beasts), 4.3.2 (defender-chosen approaches) and 4.3.3 (a counter matrix); **supersedes** 4.3.1 (raising `hedgePathCost` would not help: it is already a 10-tile detour; closing gaps would) and 4.3.3's Mortar remark (the Mortar is the strongest defence per Coin, not the weakest); and **adds** changes 1, 2, 4, 6, 9 and 10, which the prior reviews did not see.

---

## 7. Open leads (not measured in this pass)

- A human-planned attack (smoke on the right tower, staggered squads, the best side) against the optimal armies: how much further the ceiling moves, and whether maxed bases hold against it at all.
- A wall ring with no gaps at Keeps 12–15 (the generated layouts always leave gates): whether walls become worth their 52 M Coins.
- The jam chain under 18 Ghost Engineers against two Mortars (immunity should prevent a lock; not simulated).
- Trials: the tier at which a Keep 8 and a Keep 12 army stall, and the one-time harvest per new Keep (the `trials.json` rules were read, not played).
- Online matchmaking with real players (`rating.ts`): whether the Base Rating reset on a rebuilt layout (`layoutResetShare` 0.25) can be used to dodge a bad rating.
- The $ to Keep 15 by paying only (STATE E06 ~$635) under the current skip curve.

---

## Appendix A. Measurement sources

All raw outputs are in `docs/audit/balance-2026-11-08/measurements/`:

| Dimension | Files | What is in them |
|---|---|---|
| Army search | `army_search/final_K{5,8,12,15}.out`, `climb_K*.out`, `log_K*.jsonl` not kept (170 KB each; regenerate) | final tables, near-optima, roles, per-layout and per-bias bests, climb logs |
| Defence | `defence_math/marginal_main.out`, `stats.out`, `contrib.out`, `hold_a.out`, `hold_b.out`, `tables.out`, `economy.out` | marginal value per Coin with paired errors; silencing by class; hold rates; building economy |
| Policies | `policy_sim/log_*_{regular,casual}.txt`, `run_all.log` | per-Keep campaign rows for eleven policy runs |
| Ladder | `ladder/sandbag.out.txt`, `policy_sim/sandbag_math.out` | the dilution and sandbag sims; the floor arithmetic per Keep |
| Currencies | `currencies/{flows,loops,raidtax,tables,opening,verify,passdelay}.out.txt` | flows, loops, raid tax, parallel tables, the opening, loot at risk, pass delay |
| Roster | `roster_math/out/*.md` | power and Pareto tables, tier swaps, hero, kit on/off |
| Drop zones | `drop_zones/dz.out`, `heroonly.out` | entry-side lever, intel predictiveness, closed-pair flips, hero-only raids |

## Appendix B. Reproducing the measurements

The scripts are TypeScript modules that import the game's own simulation. They are kept under `docs/audit/balance-2026-11-08/scripts/` with the relative imports they had when run (`../../src/...`), so copy them back before running:

```
cp -r docs/audit/balance-2026-11-08/scripts scratch        # creates scratch/<dim>/*.ts and scratch/run.mjs
node scratch/run.mjs scratch/army_search/harness.ts baselines 8
node scratch/run.mjs scratch/army_search/harness.ts climb 8 bot && node scratch/run.mjs scratch/army_search/harness.ts final 8
node scratch/run.mjs scratch/defence_math/marginal.ts
node scratch/run.mjs scratch/ladder/sandbag.ts
node scratch/run.mjs scratch/drop_zones/dz.ts
bash scratch/policy_sim/run_all.sh                           # eleven campaigns, about 12 minutes
```

`scratch/` is not part of the build or the tests (`tsconfig.json` includes only `src`, `tests`, `tools`; Vitest includes `tests/**`). One battle takes about 0.1–0.2 s on this machine; the whole set of measurements in this document is about 40 minutes of CPU. Nothing here changes the game: the scripts only read `src/` and `tools/` and write under `scratch/`.
