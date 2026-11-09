# Design proposal: stances, rivals that scout you back, and one economic scale

> Superseded by [`DESIGN_LIVING_FORTRESS_2026-11-08.md`](DESIGN_LIVING_FORTRESS_2026-11-08.md), which blends the stances with two further mechanisms (memory and the Watch) and keeps the prototype numbers below as evidence.

Owner: GAME THEORY compartment. Status: proposal, not implemented. Written 2026-11-08 against the measurements in [`docs/audit/BALANCE_AUDIT_2026-11-08.md`](../audit/BALANCE_AUDIT_2026-11-08.md); the two prototypes quoted below ran in the real simulation with data-only changes (`docs/audit/balance-2026-11-08/scripts/design/`).

## 0. Why the game has one answer today

A strategy game is hard to solve when the value of a choice depends on what the opponent chose, and when the information you need is only partly visible. Kagemura's attack payoff today depends on nothing the defender decided: every base of a Keep is the same distribution of towers, so the same army is best against all of them (throwers behind a guardian line, +10 to +33 points over the Suggested army at every Keep). The economy has the same shape: defence spend returns nothing to a progression-maximizer (zero defence reaches Keep 12 two days after the documented raider; defence-first takes 31 days longer), so the Coins order is fixed, and the matchmaking floor can be pulled down for free, so research stops mattering for stars. Twelve separate nerfs would move the numbers without changing the shape. The proposal below changes the shape with four mechanisms, each of which closes several findings at once.

## 1. The design in one paragraph

**A base declares a stance; rivals adapt to what you bring; your strength is what you field; everything is priced in hours of your own income.** The defender chooses one of four *stances* (kamae) for the whole village, visible at scouting and sticky for a day; each stance re-tunes the existing towers so that one army family is punished and another is favoured, in a cycle. The three computer rival clans each fight in a stance, and the mix of stances the player is offered drifts toward the one that counters the player's own last ten raids, so a fixed army is countered half the time and the best answer becomes a *distribution*, not a composition. Matchmaking strength is weighted by what the player actually fields, and a raid that fields no warriors wins nothing. Held raids pay the defender a share of the attacker's army; undefended hoards leak more. All per-Keep tables, prices and rewards derive from one number per Keep, the Keep's hourly income, so a top-up costs the same hours at Keep 1 and Keep 15 and a Season Scroll tier is worth what it was when it unlocked.

## 2. Mechanism A — Stances (kamae)

The defender picks one stance in the Keep sheet; it is stored on the village (`VillageState.stance`, save v21), carried by `BaseLayout`/`BattleSetup` (the server replays it; `SIM_RULES` 6), shown in the scout report and on the base ("The Crimson Crane clan holds the **Wind** stance"), and changeable once a day. Each stance is a small set of multipliers that `stepDefense`, `stepTraps` and `fortifications.ts` already have the hooks for. The prototype used only data the current sim reads, and it already produces the cycle:

| Stance | What it does to the existing buildings (prototype values) | Measured effect, Keep 12 / Keep 15, bias 0.5, 20 battles per cell | Who it punishes | Who it favours |
|---|---|---|---|---|
| **Wind** | Kunai and Shuriken Towers +3 range, +30 % damage, and prefer attackers fighting from ≥ 3.5 tiles (the Yagura's rule) | thrower-guardian line 90.7 → 57.5 and 85.2 → 53.1; blades −11 / −10; shadow −9 / −15; air −27 / −8 | ranged lines (the current optimum) | shadow, air |
| **Stone** | Mortar damage ×1.6, Spike Pits ×3 (splash and traps hit hidden and tanky warriors that towers cannot target) | shadow 98.3 → 57.5 at Keep 15 (−41); thrower line −11 / −3; air 0 | stealth, big slow units | ranged lines, air |
| **Sky** | Kunai Towers can hit flyers at ×0.5 damage | air 61.5 → 15.7 and 82.0 → 26.6; everyone else unchanged | air | everyone on the ground |
| **Thicket** (to be measured) | walls ×2 HP, Shuriken fire ×1.3 against 1-housing warriors, Bitter Smoke Brazier heal cut 0.5 → 0.8 | not in the prototype (the lantern-only variant did nothing: 92.0 vs 90.7) | swarm melee and healer-supported lines | siege, stealth |

Each stance must also pay for its strength, or every defender picks the one that counters the current meta and we are back to one answer. The prototype's Wind stance costs the defender nothing and hurts every army, which is wrong; the tuned version trades range for damage (+3 range, −15 % damage against melee) so that blades and shadows *gain* against it. The tuning target is a gate, not a feeling (section 7): against each stance the best army must differ, a specialist must beat the robust mix by ≥ 10 points against its favoured stance, and the robust mix must stay within 10 points of the best against every stance. The prototype shows the first two already (best against Stone at Keep 15 is the thrower mix at 82.6, against anything else the stealth army at 84–98; the thrower mix loses 33 points to Wind while stealth loses 15).

What it closes: AS-1 and AS-2 (the optimum depends on the base), DM-1 (the soft counters and the Mortar become stance-scaled instead of dead or capped), RM-2/RM-3 in part (stealth, wall multipliers and taunt gain contexts where they are worth their price), DZ-2 (the two closed approaches become part of the stance choice, chosen by the defender and shown at scouting, instead of a hash).

## 3. Mechanism B — Rivals that scout you back

Generated opponents are already outposts of three named computer rival clans (`names.json` `rivalClans`, `sim/rivals.ts`). Give each clan a stance, and let the *offer* adapt: the share of each stance among the bases a player is shown is a deterministic function of the player's last ten raid armies (which `battleLog` already holds and the server already stores). Compute the housing share of each role family over those raids; the stance that counters the heaviest family gets 50 % of the offers, the neutral stances 30 %, the stance it beats 20 %. A player who brings the same army every time meets its counter every second scout; a player who rotates meets a flat field. "Next" cycles through the offer as today, at the same fee.

This is the mechanism that answers the owner's requirement directly: there is no fixed optimal army, because the environment responds to the army you fixed. It is honest (the Codex says rivals scout you; the base card says "Generated rival, Wind stance"), it is cheap (one pure function from the log to a stance weight vector, seeded as today), and it needs no new art. Against real players the same thing happens without code: defenders pick the stance that counters what has been hitting them (the defence log shows it), and the population cycles.

What it closes: AS-1 (as a moving target), S3 and the "Suggested army" trap (the suggestion becomes "against Wind, bring…", which is true and still leaves the prediction to the player).

## 4. Mechanism C — Strength is what you field

Two rule fixes with no design cost:

1. `attackerStrength` weights each fielded type by its housing in the *army* (the training queue does not count), and reads a type's level as the highest the player can field. One queued level-1 Shinobi then moves strength by 0.1 %, not by a Keep. Test: queuing any unit never lowers strength; one unit among 300 housing moves it by < 1 %.
2. `battleEnd` treats a battle whose `result.used` is empty as practice: no loot, no honor, no shield drop. The free hero stops being a 17 k–327 k loot engine with no army.

What it closes: LD-1 (the 5 % → 95 % three-star exploit), DZ-3, and LD-2 in part (honor cannot be farmed below the floor).

## 5. Mechanism D — Defence that pays, in the currency the attacker spent

Today a held raid pays 5 % of the Keep's minimum loot (0 Coins over 206 raids for the documented raider) and an undefended hoard loses 2 % of a full storage per raid. Two changes make defence a return instead of a tax, without turning the game into a turtle contest:

- **Spoils.** A held raid (attacker under 50 % destruction) pays the defender 25 % of the attacker's army training cost in Provisions, plus the honor the attacker lost. Bot raiders carry a real army (`attackerFor`), so the spoils are real numbers: 23 k Provisions at Keep 8, 67 k at Keep 10, 152 k at Keep 12 per held raid, against a raid tax of 420 k–2.7 M per lost raid. Thematically it is captured gear; mechanically it is the first defence reward that scales with the attacker, not with the Keep.
- **Leak.** `storageLootCapByHall` at Keeps 7–15 rises from 1.0× to 2.5× the Keep's minimum generated loot, so a 100 % raid takes 4–10 % of a full storage instead of 1.7–4 %, and the held-raid shield matches the lost-raid shield (12 h). A player who never defends then loses about 2.5× what the documented raider loses (stolen ÷ looted 64 % → ~160 %), which is the first time "rusher" costs days. The casual player is protected by the other half of the change: `shieldTiers` 12/14/16 h → 16/20/24 h and at most two losing bot raids count per local day; the Monte Carlo in `raidtax.out.txt` says that cuts a one-visit player's raids from 1.2 to about 0.9 a day.

What it closes: DM-2 and PS-1 (defence enters the Coin order), LD-3 (holds matter), LD-4 (the casual tax is bounded), CU-4 in part (hoarders leak, so hoarding becomes a choice with a price).

## 6. Mechanism E — One scale: hours of income

Six per-Keep tables are hand-written today and disagree by up to 37× in what a Jade buys (`rewardScaleByHall`, `generatedLootByHall`, `storageLootCapByHall`, `scoutFeeByHall`, `topUpScaleByHall`, `trainingSkipScaleByHall`). Replace them with one generated table, `incomePerHour[K]` (both currencies at the Keep's max collectors), and express everything in hours:

| Quantity | Today | Proposed |
|---|---|---|
| Generated raid loot | hand table, 3–6.7 h of income | 4–6 h of income at every Keep (one curve) |
| Storage loot cap | = generated minimum from Keep 7 | 2.5× the minimum (Mechanism D) |
| Scout fee | 3 % of loot | 3 % of loot (derived) |
| Top-up | 15 Jade per hour of income at Keep 1, 550 at Keep 15 | **12 Jade per hour of income at every Keep** (a day of income 288, a week of time 720) |
| Army finish | 50 → 756 Jade for a 2-hour army | the same hours rule: the loot the army would bring, priced per hour |
| Fixed rewards (chest, calendar, Scroll tiers, league chests, bounty) | scaled by the Keep *at claim* (×1.9 for waiting a season) | scaled by the Keep *at unlock* (stored with the unlock) |
| Keep upgrade cost | Coins only | half Coins, half Provisions |
| Research, tiers 4–5 | Provisions | Coins |

The last two rows balance the currencies: the measured per-Keep demand ratio Coins ÷ Provisions goes from 0.19–2.72 today to 0.56–2.15, and from Keep 8 on it sits between 0.77 and 1.41 instead of 0.19–1.16 (arithmetic in `measurements/design/currency_split.txt`). Raiding stops being Provisions-negative at Keeps 13–15 because research stops draining Provisions there. The top-up rule keeps TOP_UP.md's "exact and immediate" principle and drops its square-root scale, which was chosen to stop a Keep-1 giveaway (fixed instead by pricing the first three Keeps' income at the same 12 Jade an hour: five hours of Keep 1 income is 60 Jade, not 55 for a Jade-to-Provisions loop). A cancelled topped-up action refunds the topped-up share in Jade, which closes the train-and-cancel exchange.

What it closes: CU-1, CU-2, CU-5, CU-6, CU-3, JD-1 in part, and FSR X3 (five parallel tables become one).

## 7. Gates: how we know it worked

Everything above is tunable data except the three rules in C and the stance hooks in A; the numbers are set by gates, not by taste. Add to `tests/gameplay/balance/`:

1. **Stance cycle** (`stances.test.ts`, uses the composition harness from `docs/audit/balance-2026-11-08/scripts/army_search/harness.ts` as a tool): for Keeps 8, 12 and 15, the best composition against each stance differs from the best against every other stance; the specialist beats the robust mix by ≥ 10 points against its favoured stance; the robust mix is within 10 points of the best against every stance; no composition is within 3 points of the best against all four stances. This is the formal version of "almost impossible to find the optimal strategy": there is none to find.
2. **Adaptive offer** (`rivals.test.ts`): a model player that fixes one army meets its counter-stance in 45–55 % of scouts after ten raids; one that rotates meets each stance in 20–30 %.
3. **Strength** (`matchmaking.test.ts`): queuing a unit never lowers `attackerStrength`; one unit among 300 housing moves it by < 1 %; a battle with no warriors banks nothing.
4. **Defence pays** (`campaign-gates.test.ts`, with the rusher, turtle and sandbagger policies from `scripts/policy_sim/` added to `tools/balance/campaign.ts`): the rusher reaches Keep 12 at least 10 % later than a player who spends 20 % of Coins on defence; the turtle is at most 25 % slower than the raider; the one-visit casual player's stolen ÷ looted stays under 120 %.
5. **One scale** (`economy.test.ts`): a top-up of one hour of income costs 12 ± 1 Jade at every Keep; a Scroll tier claimed on day 1 and on day 29 of the same season pays the same; the six derived tables agree with `incomePerHour` within 10 %.
6. **Kits** (`kits.test.ts`, from `scripts/roster_math/kits.ts`): every kit is worth ≥ +2 points on versus off against the neutral field at its unlock Keep and at Keep 15.

The existing gates stay (no army over 92 % against same-Keep bases, model-player star floors), and `npm run balance:armies` gains a stance column.

## 8. Order of work

1. Mechanism C and the no-army rule: one day, no `SIM_RULES` change for the strength fix (matchmaking is not replayed), one line in `battleEnd` plus the server's report check. Tell BACKEND (`docs/backend/REQUESTS.md`).
2. Mechanism E: generate the tables with a new `tools/balance/scale.mjs` (replacing `topup.mjs`), store the unlock Keep on Scroll tiers and calendar days (save v21), move the Keep cost and tier 4–5 research between currencies, retune `tests/gameplay/economy/topup.test.ts`'s rush bounds. Two days.
3. Mechanism D: `raids.json` spoils and cap, shields, the daily losing-raid cap; make the model player's defender policy upgrade what it builds (it leaves towers at level 1 today). Two days.
4. Mechanism A: stance field, four multiplier sets in `battle.json` `stances`, hooks in `stepDefense` (damage × stance multiplier by target role; targetability for air; range), `stepTraps`, `fortifications.ts`, the Keep sheet control, the scout report and base label, `generateOpponent` taking a stance; `npm run rules:snapshot` before `SIM_RULES` 6; `PROTOCOL_VERSION` bump for the scout field; tune with gate 1. One week.
5. Mechanism B: the stance weight function from the battle log, used by `opponentFor` and the server's generated fallback. Two days, after A.

## 9. What stays honest, and the risks

Nothing random is sold, every countdown stays real, generated opponents stay labelled, and the Codex says in one sentence what rivals do with your raid history. The risks: (1) a stance that is too strong makes defenders converge again, which gate 1 catches but only if the four stances are tuned together; (2) the adaptive offer can feel punitive if the counter share is too high (50 % is the proposal; 35 % is the floor at which a fixed army is still clearly worse than a rotation); (3) raising the loot cap raises the casual tax, which is why the shield and daily-cap changes ship in the same step; (4) moving research to Coins changes what the server replays (`PLAYER_COMMANDS` effects), so BACKEND must deploy first. None of these changes needs art.
