# Combat investigator notes (key: combat, prefix CMB-)

Read-only pass over battle strategy depth and combat balance, 2026-11-16, at `main` 9bf76af.
Generated truth (`docs/STATUS.md`): SIM_RULES 7 (also replays 5, 4), 50 of 50 warriors live, 1 of 4 heroes live,
16 buildings and 3 heroes "built, not live", features `mastery` and `heroChoice` off.

Nothing in the repository was edited. All scripts and outputs are under
`docs/audit/understand-2026-11-16/scripts/combat/`
(`common.ts`, `t1.ts` ... `t14.ts`, `*.out`). The experiments that needed a rule change ran on a scratch copy of
`src/gameplay` in `cmb/copy/`, never in the repository.

## How the measurements were made, and their limits

- Runner: `node --experimental-transform-types --import ./register.mjs <script>` (the balance lab's own loader),
  importing the repository's real simulator.
- Faithfulness check: on the scratch copy with no flag set, the army-lab gate cells reproduce the documented
  values exactly (support 27.2 at Keep 7, 22.0 at Keep 8, siege 25.5 at Keep 8, the numbers quoted in
  `tests/gameplay/balance/army-lab.test.ts:136`).
- Unless stated: armies at the Keep's research caps, the Shadow Captain included from Keep 7, generated bases at
  `levelBias` 0.5, the five `LAYOUTS` archetypes, Infiltration Points on, a bot-style plan (three adjacent points,
  toughest first, two warriors a tick).
- Sample sizes are small (6 to 20 battles a cell). Differences under about 4 points are noise. One behaviour change
  I tried (`noJamChase`) moved individual 6-battle cells by up to 15 points in both directions, so single cells are
  fragile. Large effects (10+ points, same sign at several Keeps) are the ones to trust.
- No person played anything. The "competent smoke policy" and "best point" are scripted.

## 1. What decides a raid today

| Lever | Size (destruction points) | Source |
|---|---|---|
| Army composition | 10 to 60 between armies of equal housing | `t5.ts`, `docs/game-theory/ARMY_BALANCE.md` |
| Which Infiltration Point | best minus worst side 30.6 (Keep 6), 45.5 (Keep 10), 33.5 (Keep 15); best over mean about +16 to +21 | `t1.ts`, `t9.ts` |
| Formation (three adjacent points vs one point) | about 10 to 20 (together 82 vs file 62 at Keep 10) | `t8.ts` |
| Holding a reserve 30 s | minus 13 to 14 (together/tanks 82 and 79 vs together/reserve 68 and 66 at Keeps 10 and 15) | `t8.ts` |
| Smoke Bomb, all three charges, scripted policy | +2.4 (Keep 6), +1.9 (Keep 10), +3.2 (Keep 15) | `t3.ts` |
| Jammers in sensible numbers | +3 to +10 (Saboteurs at Keep 6: 6 give +3.4, 12 give +4.7, 24 give +7.2; Gearbreakers at Keep 8: 6 give +9.0, 12 give +9.3, 24 give +10.6; Ghost Engineers at Keep 15: 6 give +3.3, 12 give +5.2, 24 give +4.1; 3 of any is within noise) | `t11.ts sab` |
| Hero present vs absent | +3.8 (Keep 7), -0.8 (Keep 10), +2.0 (Keep 15) | `t2.ts` |
| Rally aura 30% vs 0% | -0.7, -1.0, +4.1 (noise) | `t2.ts` |

So decisions matter, but only two of them: the army and the entry point. Everything else is small, and wave timing
is negative (waiting always loses).

### Skill ceiling (`t8.ts`, `t9.ts`; raid bots' mix + hero, 10 bases per Keep)

| Keep | Game's bot plan (random side) | Best point, default order | Best point and order | Worst |
|---|---|---|---|---|
| 10, bias 0.5 | 81.8% (2.27 stars) | 98.4% | 100.0% (3.00 stars) | 35.1% |
| 15, bias 0.5 | 80.0% (2.20 stars) | 99.7% | 100.0% (3.00 stars) | 34.8% |
| 10, bias 1.0 | mean point 52.9% | 72.0% (2.10 stars) | not run | not run |
| 15, bias 1.0 | mean point 55.2% | 69.9% (2.00 stars) | not run | not run |

A player who always finds the best point three-stars every mid-level base with the stock army; against maxed bases
the best point gives about two stars. Bot end reasons at Keeps 10 and 15: army dead 15 to 16, base destroyed 12 to
13, clock 2 of 30, so the 180 s clock rarely binds for an all-in plan.

### The entry point cannot be read from scouting (`t9.ts`, `t12.ts`)

`pointIntel` (`src/gameplay/sim/battle/scout.ts:134-151`) counts defences whose range covers the straight walk to
the Keep. The point it favours is the best one 5% (Keep 10, bias 0.5), 15% (Keep 10, bias 1), 30% (Keep 15, 0.5)
and 7% (Keep 15, 1) of the time; chance is 17%. The correlation of that count with destruction has the right sign
at bias 0.5 (-0.25, -0.26) and the wrong sign on maxed bases (+0.16, +0.20). I tried six other static metrics
(defence DPS near the landing, distance to the nearest defence, uncovered buildings near the point, buildings
within 8 tiles, distance to the Keep, walls on the walk): none has |correlation| above 0.31 and none recovers more
than about 10 of the 15 to 21 points available, and none is consistent across Keeps and biases. The outcome by
point is close to chaotic for static features, so the largest lever is trial and error for a person.

The closed pair of approaches is still a hash of the layout (`infiltration.ts:82`,
`layoutHash(setup.base) % anchors.length`), so the defender cannot choose it (audit DZ-2 stands).

## 2. Dominant armies and dominated roles

### Army panel against the four temper profiles (`t5.ts`; 5 layouts, 3 sides; cells = mean side / best side)

Keep 15:

| Army | plain | Reach | Blast | Watch |
|---|---|---|---|---|
| raid bots' mix | 77 / 86 | 78 / 91 | 76 / 88 | 78 / 88 |
| audit's searched mix (132 Needle, 56 Sovereign, 36 Reaper, 13 Oni, 18 Gearbreaker, 7 Iron Monk) | 89 / 100 | 85 / 96 | 89 / 98 | 85 / 100 |
| 180 Eclipse Ninja | 90 / 100 | 95 / 100 | 56 / 70 | 90 / 100 |
| 90 Dragon Kite Crew | 89 / 100 | 96 / 100 | 96 / 100 | 41 / 63 |
| Needles + Oni | 80 / 88 | 77 / 89 | 76 / 87 | 77 / 83 |
| Storm Sovereign only | 55 / 68 | 57 / 77 | 33 / 40 | 55 / 69 |
| Tiger Lords only | 51 / 62 | 52 / 67 | 25 / 30 | 51 / 62 |
| Volcano + Sovereign | 48 / 62 | 51 / 63 | 35 / 42 | 47 / 61 |
| Wall Phantom only | 42 / 50 | 50 / 66 | 36 / 43 | 42 / 50 |
| Oni + Sage + Spirit Caller | 31 / 40 | 34 / 44 | 35 / 42 | 23 / 30 |

Keep 12:

| Army | plain | Reach | Blast | Watch |
|---|---|---|---|---|
| raid bots' mix | 64 / 82 | 69 / 88 | 69 / 82 | 63 / 77 |
| audit's searched mix (67 Reaper, 54 Moonblade, 30 Blowgun, 18 Mountain Shield, ...) | 90 / 100 | 94 / 99 | 96 / 100 | 78 / 91 |
| Reaper + Mountain Shield | 80 / 96 | 88 / 100 | 82 / 93 | 69 / 80 |
| 78 Thunder Kite | 65 / 98 | 71 / 96 | 54 / 92 | 25 / 35 |
| Bear Warriors | 55 / 71 | 60 / 73 | 44 / 54 | 55 / 64 |
| Void Walkers | 51 / 63 | 63 / 84 | 56 / 73 | 52 / 71 |
| Moonblade only | 46 / 63 | 44 / 55 | 34 / 43 | 44 / 56 |
| siege + blades | 33 / 42 | 35 / 43 | 36 / 45 | 34 / 42 |
| Burrow Ambushers | 32 / 42 | 35 / 50 | 31 / 45 | 31 / 42 |
| Mountain Shield + healers | 27 / 35 | 41 / 52 | 40 / 48 | 18 / 24 |

Keep 8: raid bots' mix 78 / 80 / 79 / 76; audit's searched mix 80 / 82 / 85 / 76; Lantern Balloons 51 / 69 / 41 /
26; Bell Warden + healers 17 / 20 / 21 / 16; Grapple Raiders 19 / 26 / 18 / 19.

Reading:

- Keep 12 has one best army against every profile (by 6 to 14 points; 9 on Watch in my 15 battles, about 1 in the
  calibration document's 20). Tempering does not create rock-paper-scissors there.
- Keep 15: two single-warrior armies three-star most bases. 180 Eclipse Ninjas score 90 to 95 on three of four
  profiles; 90 Dragon Kites 89 to 96 on three of four. The answering temper works (Blast takes Eclipse to 56,
  Watch takes kites to 41), and the scout report shows the profile, so the farm is "bring one warrior type, press
  Next past the one profile that answers it". The searched mix is within 1 to 11 points of the best answer on
  every profile, so a fixed army is also never wrong.
- Mainstream armies barely notice tempering (raid bots' mix moves at most 5 points at any Keep). As a defender's
  choice against the raid bots it is neutral by calibration (`TEMPERING_CALIBRATION_2026-11-09.md`: within 0.2
  stars).
- Trimming Eclipse damage does not fix it (`t14.ts`): at 0.65 damage it still scores 82% and three-stars 47% of
  plain bases. Its strength is arriving unseen with full health (stealth plus 194 HP per housing, the same
  toughness as the tier-5 blade with 43% more damage per housing: 48.4 vs 33.8, `troops.json`). Dragon Kites do
  respond: damage 0.85 gives 73% (three stars 43%), 0.75 gives 57%.

### Dominated roles (live `docs/game-theory/ARMY_BALANCE.md`, 3 seeds x 6 layouts, no hero)

Support-heavy 34 / 15 / 32 / 35 at Keeps 7 / 8 / 12 / 15; Siege 41 / 26 / 30 / 32; Air 47 / 36 / 27 / 47; Melee
rush 33 at Keep 8 and 39 at Keep 15. `KNOWN_BELOW` in `army-lab.test.ts:140` still lists `support@7`, `support@8`,
`siege@8`.

### Layouts (`t11.ts layout`; raid bots' mix, 6 battles a cell)

| Keep | kunai_ring | walled_keep | mortar_core | twin_gates | open_court |
|---|---|---|---|---|---|
| 8 | 80.3 (2.17) | 44.3 (0.17) | 56.2 (1.33) | 47.2 (0.33) | 88.2 (2.67) |
| 12 | 65.2 | 69.2 | 60.3 | 59.0 | 83.8 |
| 15 | 77.0 | 60.2 | 86.0 | 80.8 | 93.0 |

Gap between easiest and hardest: 44, 25 and 33 points. Open Courtyard is the easiest at every Keep.
`trials.json` `layoutPower` compensates with 1.08 for Open Courtyard and 0.94 for Mortar Core only.

Ordinary raid opponents never use these layouts: `opponentForRank` calls `generateOpponent(seed, st.hall, data,
{ levelBias })` with no `layout` (`src/gameplay/sim/matchmaking.ts:188`). Only Shadow Trials (`trials.ts:42`) and
the Bounty Hunt (`goalEvents.ts:66`) pass one. So every raid base comes from one ring generator.

## 3. The 50 warriors: marginal value and kit value (`t7.ts`)

Method: raid bots' mix scaled to 80% of housing plus 20% of housing of warrior X, 10 battles; then the same with
X's kit removed. Keep 15 baseline (pure mix) 79.8%; Keep 8 baseline 65.6%.

Keep 15, sorted by family:

| Warrior (unlock) | With 20% | Kit off | Kit value |
|---|---|---|---|
| Shinobi (1) | 62.1 | no kit | |
| Twin-Fang Dancer (4) | 72.3 | 69.1 | +3.2 |
| Wind-Step Assassin (7) | 75.0 | 69.1 | +5.9 |
| Moonblade Master (10) | 73.4 | 71.3 | +2.1 |
| Storm Sovereign (13) | 81.0 | 60.0 | +21.0 |
| Kunai Adept (1) | 77.1 | no kit | |
| Shuriken Storm (4) | 78.1 | 78.1 | 0.0 |
| Blowgun Hunter (7) | 78.8 | 78.5 | +0.3 |
| Chain-Sickle Reaper (10) | 88.0 | 78.1 | +9.9 |
| Thousand Needle (13) | 73.4 | no kit | |
| Armored Guardian (2) | 72.1 | no kit | |
| Iron Monk (4) | 80.1 | 75.4 | +4.7 |
| Bell Warden (7) | 75.0 | 77.6 | -2.6 |
| Mountain Shield (10) | 83.8 | 76.9 | +6.9 |
| Oni Breaker (13) | 83.3 | 79.1 | +4.2 |
| Saboteur (1) | 67.7 | 73.5 | -5.8 |
| Trap Breaker (4) | 73.2 | 72.0 | +1.2 |
| Gearbreaker (7) | 68.4 | 72.2 | -3.8 |
| Fuse Master (10) | 72.8 | 73.2 | -0.4 |
| Ghost Engineer (13) | 75.3 | 63.8 | +11.5 |
| Tunnel Runner (4) | 66.7 | no kit | |
| Wall Climber (5) | 61.2 | no kit | |
| Grapple Raider (8) | 66.1 | no kit | |
| Burrow Ambusher (11) | 68.2 | 67.5 | +0.7 |
| Wall Phantom (14) | 69.6 | 68.8 | +0.8 |
| Kite Raider (3) | 63.9 | no kit | |
| Crane Glider (5) | 57.5 | no kit | |
| Lantern Balloon (8) | 64.4 | 61.6 | +2.8 |
| Thunder Kite (11) | 68.9 | 64.5 | +4.4 |
| Dragon Kite Crew (14) | 69.5 | 63.8 | +5.7 |
| Herbalist (2) | 69.2 | 79.1 | -9.9 |
| Drum Monk (5) | 66.0 | 81.2 | -15.2 |
| Mist Weaver (8) | 61.4 | 78.6 | -17.2 |
| Spirit Caller (11) | 70.6 | 85.4 | -14.8 |
| Sage of Clouds (14) | 66.5 | 80.5 | -14.0 |
| Ram Crew (3) | 68.7 | 68.7 | 0.0 |
| Fire Monk (6) | 64.4 | 67.6 | -3.2 |
| Bomb Carrier (9) | 64.8 | 64.9 | -0.1 |
| Siege Bombardier (12) | 78.4 | no kit | |
| Volcano Cannoneer (15) | 64.5 | 65.8 | -1.3 |
| Hound Handler (3) | 68.6 | 68.3 | +0.3 |
| Hawk Tamer (6) | 80.5 | 79.6 | +0.9 |
| Boar Rider (9) | 68.1 | 67.2 | +0.9 |
| Bear Warrior (12) | 69.2 | 68.2 | +1.0 |
| Tiger Lord (15) | 69.2 | 68.2 | +1.0 |
| Shadow Stalker (3) | 69.5 | 68.1 | +1.4 |
| Mirage Twin (6) | 73.0 | 69.3 | +3.7 |
| Night Blade (9) | 71.1 | 70.9 | +0.2 (no smoke thrown in this test) |
| Void Walker (12) | 72.5 | 72.3 | +0.2 |
| Eclipse Ninja (15) | 80.5 | 74.9 | +5.6 |

Keep 8 (same method): Herbalist -7.9, Drum Monk -6.3, Mist Weaver -10.2, Saboteur -4.0, Fire Monk -1.7; Wind-Step
+20.5, Hawk Tamer +9.3, Gearbreaker +8.4, Bell Warden +5.5; Shuriken Storm 0.0, Shadow Stalker 0.0, Ram Crew
-0.5, Hound Handler -0.3.

Findings:

1. **All five support warriors are worth more with their kit removed** (10 to 17 points at Keep 15, 6 to 10 at
   Keep 8). Removing the kit turns them into plain fighters. The cause is in the code: a support warrior that has
   reached its ally returns before the attack code and never strikes anything while any non-support ally lives
   (`warriors.ts:231-247`, the `radius / 2` branch returns `true`; `battle.ts:459` then returns). A fifth of the
   army's housing does no damage and the auras do not pay for it.
2. **Newer tiers are worse than older ones in the same slot at Keep 15.** Thousand Needle (tier 5, 73.4) is below
   every older thrower (Kunai Adept 77.1, Shuriken Storm 78.1, Blowgun Hunter 78.8, Chain-Sickle Reaper 88.0) and
   has no kit at all although its card says "Needle Rain". Volcano Cannoneer (tier 5 siege, 64.5) is below Ram
   Crew (tier 1, 68.7). Sage of Clouds (tier 5, 66.5) is below Herbalist (69.2). Tiger Lord (tier 5) equals Bear
   Warrior and Hound Handler.
3. **Kits that do nothing measurable:** Shuriken Storm's Fan Throw is exactly 0.0 at both Keeps (`radius` 1.5 is
   measured from the target's centre, `warriors.ts:368`, so it only reaches a building touching a 3-tile target);
   Ram Crew's fourfold wall damage 0.0 / -0.5 (walls are walked around); Fuse Master, Burrow Ambusher, Wall
   Phantom, Bomb Carrier, Void Walker, Hound Handler, Tiger Lord, Boar Rider, Bear Warrior, Blowgun Hunter all
   within 1 point of zero. Wall Climber, Grapple Raider, Crane Glider, Thousand Needle and Siege Bombardier have
   an ability name on their card and no `kit` in `troops.json`.
4. **Weakest warriors at Keep 15 in a mix:** Crane Glider 57.5, Wall Climber 61.2, Mist Weaver 61.4, Shinobi 62.1,
   Kite Raider 63.9, Fire Monk and Lantern Balloon 64.4, Volcano Cannoneer 64.5, Bomb Carrier 64.8 (the mix alone
   scores 79.8).
5. Jammers are fine in sensible numbers (table in section 1) and negative when a fifth of the army is tier-1
   Saboteurs at Keep 15.

## 4. The Shadow Captain's Rally (`t2.ts`, `t11.ts rally`; raid bots' mix, 20 battles a cell)

| Variant | Keep 7 | Keep 10 | Keep 15 |
|---|---|---|---|
| no hero | 70.4 | 81.0 | 74.0 |
| live (radius 4, 30%, 8 s, re-arms on each new target) | 74.2 | 80.2 | 76.0 |
| Rally strength 0 | 74.9 | 81.2 | 71.9 |
| once per battle (`kit.oncePerBattle`) | 73.9 | 78.3 | 72.2 |
| radius 8, 20 s | 76.5 | 83.2 | 79.7 |
| whole field, 30% | 80.5 | 85.3 | 81.5 |
| radius 6, 50% | 78.5 | 87.3 | 80.3 |
| once per battle, whole field, 50% for 15 s | 82.8 | 85.0 | 77.8 |
| strength 100% (radius 4) | 81.5 | 87.8 | 83.4 |

- Live against strength 0: -0.7, -1.0, +4.1. Not measurable, as audit RM-3 said.
- While active, only 20 to 27% of living warriors stand inside the 4-tile aura.
- The text says "once per battle" (`battle.json:143`, `locales/en/data.json:23`; `roster.json` says "Recharges
  each battle"), but the code re-arms it on every new target (`battle.ts:473` sets `firstHit`, `warriors.ts:304`),
  so it is active 67 to 77% of the hero's life. The mismatch is already logged in
  `docs/game-theory/REQUESTS.md:7` as an owner design question.
- A whole-field aura at the same 30% is worth +4 to +10 points over no Rally and needs data only (`kit.radius`).

## 5. Smoke Bomb (`t3.ts`, `t13.ts`)

Policy: throw a cloud on the densest group being shot at, as soon as no cloud covers it, until charges run out.

| Army | No smoke | Live cloud (radius 3, 8 s) | radius 4 | radius 4, 12 s | radius 4, 12 s, range factor 0.25, floor 1 |
|---|---|---|---|---|---|
| Keep 10 raid mix | 81.0 | +1.9 | +6.2 | +9.2 | +11.8 |
| Keep 15 raid mix | 82.3 | +3.2 | +7.8 | +8.4 | +8.3 |
| Keep 10 Night Blade + Moonblade | 49.0 | +3.8 | +1.9 | +3.4 | +4.9 |

Keep 6 raid mix: +2.4 live. 150 Night Blades at Keep 10: +1.5 (the "twice as hard inside smoke" kit does not show).
Radius 3 to 4 alone roughly triples the value and changes no player-visible number (the description names the
8 seconds, not the radius).

## 6. Candidate fixes measured on the scratch copy (`t10.ts`; army-lab gate cells, 6 battles a cell)

Live cells, for reference: Keep 7 support 27.2, siege 38.5; Keep 8 support 22.0, siege 25.5; Keep 15 support 37.8,
siege 33.8.

| Change | Result |
|---|---|
| Support in position strikes the nearest building in its range at full damage | support 44.0 / 44.5 / 50.5 at Keeps 7 / 8 / 15; but Keep 10 support 49.5 to 91.2 and Keep 6 support 63.7 to 86.5 (three stars 67%), support_light Keep 6 94.0 |
| The same at half damage (`supportStrike` 0.5) | support 38.3 / 34.7 / 44.3 at Keeps 7 / 8 / 15 (both known gaps clear the 30 floor); Keep 10 57.2; Keep 6 79.3 (33%); Keep 4 73.5 (33%); support_light Keep 6 92.7 (67%), Keep 10 91.3 (67%) |
| Siege speed 0.12 to 0.17 (all four wall and breach warriors) | siege Keep 8 25.5 to 47.3, Keep 15 33.8 to 38.8, breach Keep 8 58.3 to 68.2; but siege Keep 4 66.0 to 90.3 (three stars 67%) |
| Siege speed 0.15 | siege Keep 8 29.5 (still under 30), Keep 4 85.5 (50%) |
| Ram Crew left at 0.12, the other three at 0.17 | siege Keep 8 28.5, Keep 4 unchanged at 66.0 |
| Shuriken Storm `kit.radius` 1.5 to 2.5 | artillery Keep 8 +2.0, breach Keep 8 +2.5, others unchanged |
| Walls with four times the health alone (`battle.wallHp` 4) | siege Keep 8 26.3 (no help), mixed Keep 15 78.7 to 73.3 |
| Siege warriors prefer defences instead of walls | worse (siege Keep 15 31.0, breach 44.2) |
| Saboteurs do not chase a new target when theirs is jammed | noise in both directions (mixed Keep 7 65.5 to 50.0, support_light Keep 8 59.2 to 73.3): rejected |

Notes for whoever implements: the support strike needs the half-damage setting or a similar cap, and
`support_light` at Keeps 6 and 10 already sits at 86 to 92 live (`ARMY_BALANCE.md` 85 (61%) and 81 (50%)), so the
upper gates there need watching. Siege needs Ram Crew faster to clear Keep 8, which overshoots Keep 4; a per-level
or Keep 6+ answer (Fire Monk carries Keep 6+) needs one more tuning pass. I did not run the Keep 4 and 6
"home ground" gates on all six layouts.

## 7. Rules 10: what switching it on would take, and whether it is ready

What exists in live code behind values live data does not set: `battle.crowding` (`battle.ts:156`),
`battle.wallHp` (`battle.ts:121`), `battle.damageSpread` (`battle.ts:712`), `temper.convexity` and an axis's
`versus` (`temper.ts`, `battle.ts:717`), `kit.breachRadius` (`warriors.ts:356`), plus raid and economy hooks.

What is missing to turn the battle side on:

1. A `cls` class on every warrior. The `versus` hook reads `troopDef(...).cls` through a cast; `troops.json` has no
   such field and `TroopDef` does not declare it. The lab assigns it at run time.
2. The tuning baked into `troops.json`: `troopStrengthAll` 0.8 and a per-warrior multiplier at each Keep's level
   (0.51 for Shuriken Storm and 0.53 for Chain-Sickle Reaper up to 2.71 for Bomb Carrier at Keep 12). That
   contradicts the power-budget model that `progression-model.test.ts` pins the live roster to.
3. Only Keeps 9, 12 and 15 were scored on fresh bases. Keeps 6, 7, 8, 10, 11, 13 and 14 have had no loop
   (`SESSION_2026-11-15.md`, last line), and Keep 9 "is not converged".
4. Its own pass/fail table fails: gap between best and worst standard army 19 / 19 / 17 (pass at 12), siege
   against Walled Keep -13 / +11 / -3, standard armies within 8 of the mean 10 / 12 / 12 of 13, healers with
   guardians at 50.
5. `npm run rules:snapshot`, a SIM_RULES bump, the server deployed first, re-pinned `aura-cache.test.ts` and
   rules fingerprint, regenerated `ARMY_BALANCE.md` and campaign gates, new scouting and tempering text in 50
   languages, and no person has played it.
6. Its own correction: the breach radius does nothing measurable and can be dropped.

Verdict: not ready, and it is a multi-day change. The parts worth taking are the lessons, not the patch: support
needs an effect that does damage (section 6 measures one), and squad orders (already on main in
`src/gameplay/control/squadPlan.ts`, no screen: no reference in `src/presentation`).

## 8. A small, safe set under one SIM_RULES bump (7 to 8)

1. Support warriors strike while in position, at a data-set share of their damage (`battle.json`
   `warriorRules.supportStrike`, about 0.5; about 15 lines in `warriors.ts`).
2. Rally reaches the whole squad: `battle.json` `heroes.shadow_captain.kit.radius`, and one decision on the text
   (either make the text match the re-arm, or set `oncePerBattle` with a longer, stronger burst).
3. Smoke Bomb `radius` 3 to 4.
4. Siege speed (Fire Monk, Bomb Carrier, Volcano Cannoneer to 0.17; Ram Crew tuned separately).
5. Shuriken Storm `kit.radius` 2.5, and real kits or honest cards for the five warriors with none.
6. Dragon Kite Crew damage about 0.85 through `roster.json` `dpsScale` and the matching live damage; an upper
   gate in `army-lab.test.ts` for single-warrior armies.

Procedure per the project rules: `npm run rules:snapshot` before the bump, empty `SIM_RULES_COMPATIBLE`, re-pin
`tests/gameplay/battle/rules-version.test.ts` and `aura-cache.test.ts`, remove the cleared entries from
`KNOWN_BELOW`, `npm run balance:armies`, `npm run balance:campaign`, `npm run test:slow`, `npm run status`, tell
BACKEND (`docs/backend/REQUESTS.md`), deploy the server before the game.

## 9. Things that are right and should be left alone

1. The deterministic fixed-step simulator: seed plus deployments, only + - x / and sqrt, the server re-simulates,
   `stateHash` with a fixed resource order, rule versions with archived snapshots.
2. Infiltration Points with cover of one third of the army: one short rule that forces three squads and produces
   the largest real decision in a raid.
3. Tempering shown at scouting, with rival clans that answer the player's last ten raids
   (`temper.offers.counterShare`): the answers measure as intended (kites 89 to 41 under Watch, Eclipse 90 to 56
   under Blast).
4. Non-stacking auras, poison and burning; companions that split their owner's budget; shared jam immunity.
5. Abilities as deployments (Smoke is a deployment whose troop is an ability id), so replays, the server check and
   squad orders all ride one path.
6. The "built, not live" pattern: hooks behind absent data values, so live battles run the same arithmetic. My
   copy reproduced three documented cells to the decimal.
7. The army lab with outcome gates and a `KNOWN_BELOW` list that fails when a gap is fixed, and counter effects
   measured on identical bases (`withoutCounterEffects`).
8. The honest hero: free, no housing, level set by the Keep, never sold; a battle with no warriors is rejected
   (`village.ts:1793`, `rejected: 'no_warriors'`), which closed audit DZ-3.
9. Counters with counter-play: stealth until the first attack and the Lantern that lights it; Kite-Cutter
   grounding with an immunity window; wall-breakers that break only the wall in the way (`wallInTheWay`).

## 10. Lower-priority items and open leads

- `tests/gameplay/balance/matched.test.ts` was reported flaky in CI on one commit (`SESSION_2026-11-15.md`). I did
  not reproduce it or find a nondeterministic call in the battle path. Not verified.
- `squadPlan.ts` uses `Math.atan2` to order points. It only plans deployments, which are then recorded, so replays
  are unaffected.
- Scout tips and layout tips are English strings built in sim code (`scout.ts:84-104`, `basegen.ts:92-133`); how
  they are translated is another investigator's area.
- Bell Warden's taunt measures +5.5 at Keep 8 and -2.6 at Keep 15; Gearbreaker +8.4 at Keep 8 and -3.8 at Keep 15
  when it is a fifth of the army.
- Army-lab gate cells are 6 battles each. One cell can move 10 points from one behaviour change that should be
  neutral. The lab's `battle.damageSpread` hook was built to blur exactly this; a small spread or more seeds per
  gate would make the gates steadier.
- Not measured: how often a player meets each rival profile in the real opponent stream, real opponent `levelBias`
  by honor, the Keep 4 and 6 home-ground gates under the fix set, any online (player-built) base.
