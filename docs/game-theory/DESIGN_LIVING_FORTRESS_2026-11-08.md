# Design: the Living Fortress

Owner: GAME THEORY compartment. Status: proposal, not implemented. Supersedes [`DESIGN_STANCES_2026-11-08.md`](DESIGN_STANCES_2026-11-08.md) (kept for the stance prototype numbers). Every number below was measured in the real simulation with data-only changes or in the model player; scripts and outputs are under `docs/audit/balance-2026-11-08/scripts/design/` and `measurements/design/`.

## 1. The problem, restated as structure

The audit found one answer per question: one army family at every Keep (the Suggested army is 10–33 points below it), no return on defence for a progression-maximizer (zero defence reaches Keep 12 on day 53, the documented raider on 51, the turtle on 83), a matchmaking floor that one queued unit per type can pull down, and currencies and Jade prices that do not share a scale. Those are four symptoms of two missing properties:

1. **Nothing the opponent decides changes the attacker's payoff**, so a payoff table with one column has one best row.
2. **Nothing the attacker spends on their own base comes back through their attacks**, so the Coins decision has a corner solution.

A game is hard to solve when its payoffs are *relational* (depend on the other side's choice) and *path-dependent* (depend on your own history), and when the thing that matters is shown truthfully but must still be predicted. The design below installs those properties with four mechanisms that reinforce each other, and keeps the simulation deterministic and server-replayable.

## 2. Three elegant solutions, and what each one misses alone

**A. Stances (the defender declares).** One of four stances per village, visible at scouting, sticky for a day; each re-tunes the existing towers so that one army family is punished and another favoured, in a cycle. Prototyped: a Wind stance cuts the dominant thrower line 30–33 points, a Stone stance cuts the stealth army 41, a Sky stance cuts air 47–55 (`doctrine2.out`). *Alone it misses:* a defender has no reason to choose well (defence is dominated anyway), and against generated bases a player could still solve "the best army against each stance" and pick by scouting.

**B. The base remembers (the fortress adapts).** Every base keeps a short memory of the warrior types that raided it (the last ten raids, by housing share) and its towers gain against those types, capped and decaying. Real bases remember real attackers; a rival clan's generated bases remember the player's own raids against that clan. Prototyped as a per-type HP scaling of 1 / (1 + 0.6 × share, share capped at 0.5) over 30 consecutive raids (`familiarity.out`):

| Keep | Player | Memory off | Memory on |
|---|---|---|---|
| 15 | fixed stealth army (180 Eclipse Ninja) | 93.3 %, 77 % three-star | **57.1 %, 10 %** |
| 15 | fixed thrower line (6 types) | 88.1 %, 57 % | 88.1 %, 50 % |
| 15 | rotation of three armies | 90.2 %, 70 % | 83.1 %, 53 % |
| 12 | fixed thrower line | 90.4 %, 57 % | 79.8 %, 33 % |
| 12 | rotation of three armies | 62.1 %, 23 % | 60.4 %, 20 % |

Memory punishes mono-type armies hard (−36 points), diversified armies lightly (0 to −11) and rotations least (−2 to −7): a *diversity premium* with no hidden distribution shift, shown on the Keep sheet ("Your towers know Eclipse Ninjas: +28 %") and in the scout report. *Alone it misses:* at Keep 12 the rotation still loses to the fixed line by 19 points, because the alternative armies are weak against every base; memory makes repetition expensive but does not make alternatives good.

**C. The home escorts the spoils (the Watch).** Loot a raid banks is multiplied by 0.5 + 0.5 × min(1, defence index), where the index is the village's tower strength over a generated base of its Keep at level bias 0.5. Spend nothing on defence and half of every raid is lost on the way home; keep a base of your Keep's standard and all of it arrives. Prototyped in the model player, regular cadence, days to Keep 12 (`watch_*.log`, `*_regular_watch.out`):

| Policy | Today | With the Watch | Defence index |
|---|---|---|---|
| rusher (no defence) | 53.4 | 69 | 0.00 |
| raider (documented: two level-1 towers) | 51.2 | 69 | 0.00 |
| defender (every defence built, level 1) | 53.0 | **60** | 0.09 |
| turtle (everything defensive first, walls at cap) | 82.6 | 84 | 0.94 |

Today the three non-turtles tie and defence-first is 60 % slower; with the Watch, *some* defence is the fastest line and none is the slowest, so the Coins decision has an interior optimum (a policy at index ≈ 0.5 was not in the run and should be the fastest of all). The rule costs the casual player nothing they had (it caps an upside), unlike raising raid losses. *Alone it misses:* it says how much defence to build, not which; without A and B every player builds the same towers.

Also considered and set aside: *survivors carry the loot* (loot × share of warriors alive) would deepen the thrower-guardian line, which already survives best; *weekly weather* (global role modifiers) rotates the meta but each week is solvable in a day, so it is a live-ops flourish, not a fix; *one shared doctrine for army and base* couples the two choices but removes freedom; *population pricing of warriors* (the most-fielded types cost more next week) needs the server and duplicates what memory does locally.

## 3. The blend: the Living Fortress

The three mechanisms close each other's gaps, and two rule fixes and one scale from the audit complete them.

| Piece | What it does | What it needs from the others |
|---|---|---|
| **Stance** (A) | makes the best army depend on the base | B and C give the defender a reason to choose the stance that fits what raids them; the Watch makes a stance worth keeping |
| **Memory** (B) | makes the best army depend on your own and others' history | A gives the alternatives a base they beat, so rotation is a real option, not a sacrifice |
| **Watch** (C) | makes defence spend return through your own raids | A and B decide *which* defence: the stance that counters what has been raiding you, as the memory shows |
| **Fielded strength** | strength weighted by army housing, queue ignored; no warriors deployed, no loot or honor | closes the leaks that would otherwise let a player sidestep A–C |
| **One scale** | every per-Keep table, price and reward derives from the Keep's hourly income; Keep cost half Coins half Provisions; tier 4–5 research in Coins; rewards fixed at the Keep at unlock | keeps A–C's numbers comparable across Keeps and both currencies load-bearing |
| **Truthful information** | scouting shows the stance, the base's memory and a path-based intel number that predicts the side; the Suggested army is per stance | makes the problem one of *prediction*, not of hidden rules |

Why the result is hard to solve: the attacker's best army now depends on the base's stance (visible), on that base's memory of *other* attackers (visible), on the attacker's own last ten raids (self-inflicted, visible on the rivals' sheets), and on how much the attacker invested in their own base (the Watch multiplier) against the Keep timeline. The defender's best stance depends on the attacker population. Neither side has a dominant pure strategy; the equilibrium is a rotation, and the right rotation depends on who you are and what you did last week. The player still sees everything that matters; what they cannot do is memorize an answer.

## 4. The mechanisms in detail

### 4.1 Stance (kamae)

- State: `VillageState.stance: 'wind' | 'stone' | 'sky' | 'thicket' | 'open'` (save v21; `open` is today's behaviour and the default for old saves), `stanceSetAt`; changeable once a day. `BaseLayout.stance`, carried by `BattleSetup` (the server replays it); `SIM_RULES` 6 after `npm run rules:snapshot`.
- Rules, read from `battle.json` `stances` (every number data, none in code):
  - **Wind:** Kunai and Shuriken Towers +2 range and prefer attackers fighting from ≥ 3.5 tiles; −15 % damage against 1-housing melee (the trade that makes blades and shadows gain).
  - **Stone:** Mortar damage ×1.5, Spike Pits ×3; splash and traps hit hidden and 4–5-housing warriors; Kunai Towers −15 %.
  - **Sky:** Kunai Towers target `both` at ×0.5 damage against flyers; Sky Bows −25 %.
  - **Thicket:** walls ×2 HP, Shuriken ×1.3 against 1-housing warriors, Bitter Smoke Brazier cut 0.5 → 0.8; Mortar −25 %.
  - The exact trades are set by gate 1 (section 6), not by taste.
- Generated bases: each rival clan (`names.json` `rivalClans`) has a home stance; `generateOpponent` takes it; the Shadow Trials cycle stances with their layouts.
- Shown: on the base at scouting and in the Keep sheet; the five closed-approach choices move from the layout hash to the stance (two closed approaches per stance, shown at scouting), which gives the defender the drop-zone decision the audit found missing (DZ-2).

### 4.2 Memory

- State: `VillageState.memory: Record<troopId, number>` = housing share of each type over the last ten raids against this village (the defence log already holds the records); the same vector per rival clan, computed from the player's `battleLog` against that clan (pure function of records the server stores).
- Rule: defence damage against a warrior ×(1 + 0.6 × min(0.5, memory[type])), applied in `damageTroop` by source building; traps too. No change to targeting, stealth or range: memory is a pure multiplier, so it never makes a stance redundant.
- Decay: the window is the last ten raids, so a type not fielded for ten raids is forgotten; a memory of 0.5 (half the army, ten raids running) is the cap (+30 %).
- Shown: Keep sheet ("Your towers know: Eclipse Ninja +28 %, Chain-Sickle Reaper +12 %"); scout report ("This base knows throwers +18 %"); the Codex explains it in one sentence. Honest: nothing random, nothing hidden.

### 4.3 The Watch

- Rule: in `bankRaidLoot`, `result.loot` is multiplied by `0.5 + 0.5 × min(1, index)` before banking; the difference is reported on the result screen ("The Watch brought home 71 % of the spoils") so the player sees the price of an undefended village. Index = `defenseStrength(villageToBase(own))` over the mean `defenseStrength` of two generated bases of the Keep at bias 0.5 (`sim/trials.ts` already has the function). Server: the same function on the server-held village.
- Held raids pay spoils: 25 % of the attacker's army training cost in Provisions plus the honor the attacker lost (bot raiders carry a real army, `attackerFor`). This is the second return on defence, and the first that scales with the attacker rather than with the Keep.
- Casual protection stays as it is (no change to raid losses, shields or caps is needed for this mechanism; raising losses is no longer the lever).

### 4.4 Fielded strength and the no-army rule

- `attackerStrength` weights each type by its housing in the *army*; the training queue does not count; a type's level is the highest the player can field. Tests: queuing a unit never lowers strength; one unit among 300 housing moves it by < 1 %.
- `battleEnd` treats a battle whose `result.used` is empty as practice: no loot, no honor, no shield drop (the free hero's 17 k–327 k per battle disappears). Server report check of the same shape.

### 4.5 One scale

- `tools/balance/scale.mjs` generates one table, `incomePerHour[K]`, and derives from it: generated loot (4–6 h), the storage loot cap (today's values; the Watch replaces the need to raise them), scout fee (3 % of loot), top-up price (12 Jade per hour of income at every Keep; today 15 at Keep 1 and 550 at Keep 15), army finish (the same hours rule), fixed rewards (chest, calendar, Scroll tiers, league chests, bounty) **at the Keep at unlock**, stored with the unlock (save v21).
- Keep upgrades cost half Coins, half Provisions; research of tiers 4–5 costs Coins. Measured per-Keep demand ratio Coins ÷ Provisions: 0.19–2.72 today → 0.56–2.15, and 0.77–1.41 from Keep 8 (`currency_split.txt`). Raiding stops being Provisions-negative at Keeps 13–15.
- A cancelled topped-up action refunds the topped-up share in Jade (closes the train-and-cancel exchange).

### 4.6 Truthful information

- `pointIntel` reports defence DPS reachable along the shortest path to the Keep from each point, not a count (the count predicts the best side 7 of 15 times; the target is a rank correlation ≥ 0.5).
- The Suggested army takes the scouted stance and memory and says what it is for ("against a Wind base that knows throwers: shadows and blades").
- The Codex gets a matchup page: stances × families, memory, the Watch. Everything is written; nothing is hidden; the skill is prediction and rotation.

## 5. What each audit finding becomes

| Finding | Mechanism |
|---|---|
| AS-1/AS-2 one army everywhere, Suggested army far below | Stance (per-base optimum), Memory (per-history optimum), per-stance Suggested army |
| AS-3 dead families (siege, beasts, blades as filler) | Stance trades (Wind and Stone favour melee and stealth), kit gate (section 6) |
| DM-1 Mortar best per Coin yet capped; counters 0.0 | Stone and Thicket make the Mortar, Brazier and Lantern stance-scaled; caps lifted by the stance budget gate |
| DM-2/PS-1 defence dominated | Watch (interior optimum), spoils |
| DZ-1 side unpredictable from intel | path-based intel |
| DZ-2 closed approaches by hash | chosen by stance, shown |
| DZ-3 hero-only loot | no-army rule |
| LD-1 queue dilution | fielded strength |
| LD-2 honor rewards session count | honor is no longer the only ladder: the Watch and memory reward the base, spoils reward holds |
| LD-3 shield drops on attack, holds pay nothing | spoils; the shield rule can stay |
| RM-1/RM-2/RM-3 Shadow dominance, tiers as downgrades, zero kits | Memory caps any mono-type line; stances give stealth and wall kits a base they matter on; kit gate |
| CU-1/CU-2 currency loads | Keep cost split, tier 4–5 research in Coins |
| CU-3 train top-up and cancel | Jade refund |
| CU-4 hoarders are the best targets | the Watch makes the undefended hoard a 50 % raider as well as a target |
| CU-5 top-up 15 → 550 Jade per hour of income | one scale: 12 at every Keep |
| CU-6 rewards scale at claim | at unlock |
| JD-3 paying hurts (bought Keeps meet the floor) | unchanged by design: the floor protects research; with fielded strength it cannot be gamed |

## 6. Gates

1. **Stance cycle** (`stances.test.ts`, harness in `scripts/army_search/`): at Keeps 8, 12, 15 the best composition differs across the four stances; a specialist beats the robust mix by ≥ 10 points against its favoured stance; the robust mix stays within 10 points of the best against every stance; no composition is within 3 points of the best against all four.
2. **Memory** (`memory.test.ts`): over 30 raids against bases that remember, a mono-type army loses ≥ 25 points to its memory-off result while a three-army rotation loses ≤ 8; a six-type mix loses ≤ 5.
3. **Watch** (`campaign-gates.test.ts` with rusher, defender, turtle and a balanced policy at index ≈ 0.5 added to `tools/balance/campaign.ts`): the balanced policy reaches Keep 12 first; the rusher is ≥ 15 % slower than it; the turtle ≤ 25 % slower; the one-visit player's stolen ÷ looted stays under today's 190 %.
4. **Strength** (`matchmaking.test.ts`): queuing never lowers strength; one unit among 300 housing moves it < 1 %; a battle with no warriors banks nothing.
5. **One scale** (`economy.test.ts`): a top-up of one hour of income costs 12 ± 1 Jade at every Keep; a Scroll tier pays the same on day 1 and day 29; the derived tables agree with `incomePerHour` within 10 %; demand ratio Coins ÷ Provisions within 0.7–1.5 at Keeps 8–15.
6. **Kits** (`kits.test.ts`, from `scripts/roster_math/kits.ts`): every kit ≥ +2 points on versus off against the open stance at its unlock Keep and at Keep 15.
7. **Information** (`intel.test.ts`): rank correlation between the shown point intel and the measured side outcome ≥ 0.5 over the `dz.ts` set.

## 7. Order of work and cost

| Step | Work | Size | Versioning |
|---|---|---|---|
| 1 | Fielded strength, no-army rule, Jade refund on cancelled top-ups | 1 day | none for matchmaking; server report check; tell BACKEND |
| 2 | One scale: `scale.mjs`, unlock-time rewards, Keep cost split, tier 4–5 research in Coins, retune `topup.test.ts` bounds | 2 days | save v21 (unlock Keep on tiers and calendar); `PLAYER_COMMANDS` effects change → BACKEND deploys first |
| 3 | The Watch and spoils (`bankRaidLoot`, `raidVillage`, result screen); balanced policy in the model | 2 days | server settlement uses the same function |
| 4 | Memory (`damageTroop` multiplier, `VillageState.memory`, rival memory from the log, Keep sheet and scout text) | 3 days | `SIM_RULES` 6 after `rules:snapshot`; `BattleSetup.memory`; `PROTOCOL_VERSION` for the scout field |
| 5 | Stances (`battle.json` `stances`, hooks in `stepDefense`/`stepTraps`/`fortifications.ts`, Keep sheet control, closed approaches, generated rivals' home stances, per-stance Suggested army) | 5 days | same `SIM_RULES` bump as step 4 if shipped together |
| 6 | Intel and Codex pages; gates 1–7 | 2 days | none |

About three weeks of GAME THEORY work plus a BACKEND day, no art. Steps 1–3 already fix the exploits and the economy; steps 4–5 are what makes the game unsolvable.

## 8. Risks and honesty

Nothing random is sold; every countdown stays real; generated rivals stay labelled and their home stances and memory are shown; the Codex states the rules in plain words. Risks: a stance tuned too strong re-converges the defenders (gate 1); memory at 0.6 may feel punitive to a player who loves one warrior (0.4 is the floor at which the mono-type stealth army still loses ≥ 25 points); the Watch's 0.5 floor halves a careless player's raids, so the result screen must say why and the Keep sheet must show the index and the cheapest way to raise it; the currency split changes what the server replays, so BACKEND goes first. Each risk has a gate or a visible number attached, which is the difference between a design and a hope.
