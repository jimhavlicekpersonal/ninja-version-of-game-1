# Tempering calibration (2026-11-09)

Owner: GAME THEORY. How the shipped Tempering numbers (`battle.json` `temper`, battle rules 6) were chosen, measured on the real simulation (not the scratch copy the design used). Design: [`DESIGN_TEMPERING_2026-11-08.md`](DESIGN_TEMPERING_2026-11-08.md). Decision record: `docs/DECISIONS.md` ("Tempering").

## Method

- **Panel harness** (`docs/audit/balance-2026-11-08/scripts/design/temper_calibration.ts <keep> '<patch>'`): ten army styles from the round-2 panel plus the raid bots' mix, at the Keep's research caps with the hero, against 10 generated bases (5 layouts × 2 seeds, `levelBias` 0.5) × 2 entry seeds, the bot deployment plan. Profiles: untempered; **Reach** (both towers Reach 10); **Blast** (Kunai Blast 10, Shuriken Reach 5 / Watch 5, since the Shuriken Tower cannot Blast); **Watch** (both Watch 10); **mixed** (Kunai 3/4/3, Shuriken 5/0/5). Cells are mean destruction %.
- **Raid bots' army across Keeps** (40 seeds per cell, bot plan, `levelBias` 0.5): average stars and destruction for each pure profile at Keeps 6, 8, 10, 12 and 15. This is the army the offline raids bring against players, so a profile that beats it is a dominant defence.
- **Campaigns** (`npm run balance:campaign`) and the matched-raid test (`tests/gameplay/balance/matched.test.ts`) for the whole game.

## What the design's numbers did on the real simulation

The design's round-3 values (Reach +2 range / −20% damage, Blast 0.5 splash / ×1.8 fire interval / −20%, Watch −10%) were described as power-neutral but were not:

| Panel mean destruction | untempered | Reach | Blast | Watch | mixed |
|---|---|---|---|---|---|
| Keep 12 | 61.2 | 55.6 | 46.7 | 58.5 | 63.7 |
| Keep 15 | 69.1 | 62.1 | 46.4 | 64.1 | 62.5 |

(with the design's Sky re-budget in place). Blast took 14–23 points off every attack, Reach 6–7: tempering was a free defence buff, and the matched-raid test fell under one star at Keep 15.

## Iterations

1. Blast and Reach costs raised (six variants at Keep 15, two at Keep 12): Reach −45% damage and Blast 0.3 splash / ×2 fire interval / −35% were neutral on the panel at Keeps 12 and 15.
2. **Sky re-budget dropped.** Without it, air at Keep 15 scores 91% untempered, 97% against Reach and 34% against Watch (Keep 12: 56 / 58 / 24): it is already the answer to Reach and Blast and Watch already stops it. The re-budget also broke the Keep 4 balance tests (a base a Keep above stopped being much harder; planned attacks stopped beating lazy ones).
3. **A far-target bonus for Reach was tried and removed.** Reach did little against the Keep 12 ranged army because Kunai Towers already kill those throwers in one shot; a ×1.25–×2 damage bonus on far attackers (and letting Reach shoot past a Guardian's taunt) changed nothing there and made Reach too strong at Keep 15.
4. **Mid Keeps.** Against the raid bots' army at Keeps 6–11 the step-1 numbers made Reach a strong defence (−0.4 to −0.9 stars) and Blast a weak one (+0.3 to +0.75), because +2 range covers far more of a small base. The shipped numbers trade range for damage:

| Shipped | Reach | Blast (Kunai only) | Watch |
|---|---|---|---|
| Own tower | +1 range; from 5 points prefers attackers fighting from 3.5+ tiles; −40% damage | 0.35-tile splash; fire interval ×1.8; −30% damage | −10% damage |
| Base-wide (by the base's mean temper) | – | Firework Mortar +15% damage | Sky Bow Tower +30% damage, fires 40% faster; Bitter Smoke Brazier +2 radius, +50% heal and aura cut; Spike Pits and Sap Puddles ×2 damage |

## Results with the shipped numbers

Raid bots' army, average stars (destruction):

| Keep | untempered | Reach 10 | Blast 10 | Watch 10 |
|---|---|---|---|---|
| 6 | 1.40 (58%) | 1.23 (58%) | 1.20 (56%) | 1.43 (59%) |
| 8 | 1.25 (56%) | 1.32 (54%) | 1.05 (52%) | 1.27 (56%) |
| 10 | 1.65 (69%) | 1.73 (65%) | 2.08 (75%) | 1.82 (71%) |
| 12 | 1.30 (57%) | 1.05 (56%) | 1.32 (60%) | 1.50 (61%) |
| 15 | 2.02 (75%) | 1.98 (76%) | 1.85 (71%) | 2.13 (77%) |

No pure profile is a dominant defence against the army the raid bots bring; Watch is slightly the weakest against ground armies, as an anti-air profile should be.

Ten-army panel, mean destruction %:

| Keep 12 | untempered | Reach | Blast | Watch | mixed |
|---|---|---|---|---|---|
| searched mixed army (best_found) | 94.0 | 94.8 | 96.8 | 94.7 | 98.3 |
| suggested army | 72.8 | 72.1 | 71.8 | 74.8 | 90.8 |
| throwers + shields | 79.7 | 83.9 | 86.3 | 82.7 | 98.8 |
| blade rush | 50.1 | 53.8 | 44.4 | 52.1 | 57.1 |
| blade swarm | 45.7 | 48.1 | 37.7 | 45.2 | 51.4 |
| shadow (Void Walkers) | 49.0 | 58.6 | 56.5 | 49.3 | 65.5 |
| air (Thunder Kites) | 55.6 | 67.3 | 46.1 | 23.6 | 32.5 |
| tanks + healers | 42.5 | 56.6 | 51.4 | 45.3 | 67.1 |
| beasts | 47.8 | 50.6 | 40.0 | 48.3 | 53.8 |
| siege + blades | 36.5 | 35.4 | 29.1 | 36.5 | 37.4 |
| **mean** | **58.8** | **63.0** | **57.4** | **57.0** | **67.6** |

| Keep 15 | untempered | Reach | Blast | Watch | mixed |
|---|---|---|---|---|---|
| searched mixed army (best_found) | 89.6 | 87.3 | 88.0 | 90.3 | 97.0 |
| suggested army | 80.5 | 78.7 | 72.0 | 79.8 | 86.3 |
| Thousand Needles + Oni | 81.1 | 74.3 | 69.5 | 77.8 | 83.8 |
| blade rush | 57.0 | 58.3 | 41.9 | 57.9 | 59.5 |
| blade swarm | 53.0 | 48.0 | 37.3 | 52.8 | 55.4 |
| Eclipse Ninjas | 97.2 | 99.3 | 60.1 | 97.2 | 70.3 |
| air (Dragon Kites) | 91.3 | 97.2 | 97.5 | 34.0 | 85.8 |
| tanks + healers | 43.0 | 55.0 | 57.3 | 40.9 | 67.1 |
| beasts | 54.6 | 54.6 | 36.4 | 53.8 | 46.1 |
| siege + blades | 43.4 | 43.7 | 33.6 | 43.4 | 45.3 |
| **mean** | **70.1** | **70.5** | **60.5** | **64.3** | **71.2** |

What this shows:

- **Keep 15 has no universal army any more.** Untempered and Watch bases are best attacked with Eclipse Ninjas, Blast bases (Eclipse 97 → 60) with air, Watch bases (air 91 → 34) not with air; the searched mixed army is never more than 12 points behind the best answer but is the best one only against mixed profiles.
- **Keep 12 still has one.** The searched mixed army (shields, healers, throwers and blades) is the best answer against every profile, by 0.5–14 points. Tempering moves the others around it (air 56 → 24 under Watch; swarms and beasts lose 8 under Blast) but not it. Making Reach or Blast strong enough to cut it made them dominant defences at Keeps 6–11 (iteration 4). Diversity is at least what that army has (it carries all its loot under the diversity rule); a counter to it is open work.
- **Specialising pays.** The mixed profile (points spread over every axis) is the weakest defence at Keep 12 (+8.8 points) and about neutral at Keep 15: a base should lean.
- Blast is the strongest defence on the panel at Keep 15 (−9.6), almost all of it against Eclipse, blades and beasts; air is its answer.

## Rival outposts

Each clan leans on one axis: Crimson Lotus Reach, Iron Tide Blast (Shuriken Towers on Watch) with 10% more loot and buildings 0.1 closer to their caps, Moon Veil Watch with 10% less loot and 0.1 further. The first assignment (Crimson Lotus Reach 5 / Watch 5 on both towers, Iron Tide ±0.25 and ×1.2 loot) cost the model players 0.3–0.8 stars at Keeps 8–14: the campaign's raider takes the first offer worth twice the average loot, so a ×1.2-loot, much harder clan was picked far more often than chance. With one axis per clan and a ±0.1 spread the average outpost is as hard as an untempered one for the raid bots' army.

## Campaigns and matchmaking

With every audit change in place (strength counts the fielded army, staked honor, tempered outposts, the loot rules), the campaigns' regular and defender players first averaged about 0.23 stars less from Keep 6 on than before the audit work (variant runs: tempered outposts ≈ 0 for the regular player and −0.12 for the defender, staked honor −0.1, the rest mostly the fielded-strength fix, after which the campaigns had never been rerun). Matchmaking slack (`powerSlackByKeep`) is the game's knob for this; the shipped table (0.25 at Keep 5, 0.5 at 6, 0.15 at 7, 0.75 at Keeps 8, 12 and 13, 0.5 elsewhere from Keep 9) passes every campaign gate and the matched-raid bounds: the regular and defender players average 1.61 and 1.58 stars from Keep 6 and reach Keep 15 on day 113 (before: 1.62 and 1.51, day 118 and 120). Keep 8 at 1.0 made matched raids a three-star farm (2.83 stars) and Keep 7 at 0 sends Keep 7 armies to Keep 8 bases. The campaigns are single trajectories: one slack step moves which Keep dips by about ±0.25 stars.

## Limits

The bot deployment plan, one seed set per cell, a fixed panel (a real player adapts both the army and the plan), and campaigns played by model players, not people. The Keep 12 universal army above is measured and not fixed.
