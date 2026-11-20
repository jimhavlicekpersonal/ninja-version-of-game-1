# Built, not live: what could be switched on, and what it really takes

Investigator key `built-not-live`, problem prefix `BNL-`. Read-only pass over the code at commit `9bf76af` (2026-11-16; the later `9d9ade9` adds documents only).
Numbers of record come from `docs/STATUS.md` (generated): protocol 11 (servers accept from 7), `SIM_RULES` 7 (also
replays 5 and 4; archives v6, v5, v4, v3), `SAVE_VERSION` 23, 50 of 50 warriors live, 1 of 4 heroes live, 54 catalog
buildings (25 live), "Built, not live: 16 buildings, 3 heroes; features off: mastery, heroChoice", 50 ready languages.

Every finding below says how it was verified: **measured** (my scripts, real simulator), **read-in-code**, or
**reproduced**. Scripts and raw outputs: `docs/audit/understand-2026-11-16/scripts/built-not-live/`
(`load.mjs` is a Vite SSR loader with its cache in the scratchpad; nothing was written to the repository).
`tests/gameplay/planned/*` and `tests/gameplay/control/squad.test.ts`: 59 tests in 4 files pass today (2.5 s).

## 1. Ranking: replayability gained per unit of risk

| # | Switch | Replay value | What it touches | Verdict |
|---|---|---|---|---|
| 1 | Squad orders screen | Very high: same army scores 22% to 100% by order and entry point | UI, I18N only | **Ship now** |
| 2 | Hero made visible (Rally callout, Keep 7 moment, Codex card, true text) | Medium: the one live hero is invisible today | UI, I18N | **Ship now** |
| 3 | Warrior Mastery as ranks with no stat bonus (retuned EXP) | Medium-high: 50 long tracks, reason to rotate | DATA_ONLY, UI, I18N | **Ship now** (variant) |
| 4 | Two economy hooks from Rules 10 (`garrisonCrew`, `defenseWin.perStar`) | Medium: defence stops competing with growth | DATA_ONLY, SERVER deploy, BALANCE_GATES | Ship after a campaign re-run |
| 5 | First wave of counters (Steam Vent, Lightning Rod, Whirling Blade, Mirror Screen, Living Bamboo) | High: new base puzzles at Keeps 4, 6, 7, 9, 13 | SIM_RULES, BALANCE_GATES, UI, I18N, art, SERVER deploy | Ship after re-pricing and a whole balance pass |
| 6 | Hero Hall, hero choice, three heroes | High if the choice is real | SIM_RULES, SERVER, PROTOCOL, PLAYER_COMMANDS, BALANCE_GATES | Ship after kit redesign and server work |
| 7 | Warrior Mastery stat bonus | High, and dangerous | SERVER, PROTOCOL, BALANCE_GATES | Ship after retune, server truth, and a defender counterpart |
| 8 | The other ten counters | Low as built (measured no-ops) | SIM_RULES | **Leave** until redesigned |
| 9 | Rules 10 combat (crowding, wall health x4, shot spread, class hunting, warrior multipliers) | Unknown; fails its own tests | SIM_RULES, everything | **Leave** |
| 10 | Living Fortress leftovers (the Watch, per-base memory) | Design only | SIM_RULES, SAVE, SERVER | Leave (Tempering already delivers the core) |

## 2. Which switches are data-only, and which change the battle fingerprint

The fingerprint (`tests/gameplay/battle/rules-version.test.ts:35-37`, value `66975486` at rules 7) hashes
`data.troops`, `data.buildings` and `data.battle` with text, prices and timers stripped. `data.features`,
`hall.json`, `raids.json`, `economy.json` and `progression.json` are outside it.

**No fingerprint change, no SIM_RULES bump:**
- Squad orders (control lane and presentation; recorded as ordinary deployments).
- Hero callouts and Codex cards; the Rally text fix (`description`/`text` are stripped from the fingerprint).
- `features.mastery` with `mastery.maxBonus` 0 (no setup carries a bonus: `masteryBonuses` keeps only `bonus > 0`,
  `src/gameplay/sim/mastery.ts:29-30`).
- Rules 10 raid and economy keys (`raids.carryByStars`, `raids.defenseWin.perStar/uncapped/shareOfRaidLoot`,
  `raids.raiderMatch`, `raids.attackCarryByStars`, `economy.garrisonCrew`). They do change what the server replays
  (`builderStatus` decides `place`/`upgrade`; `bankRaidLoot` runs in `settleOnlineAttack`): server first, campaign re-run.

**Fingerprint changes, so `npm run rules:snapshot` (archives v7) BEFORE `SIM_RULES` 7 -> 8, then `rules:fixture`:**
- Any planned building moved into `buildings.json`, the Hero Hall included (its HP counts in destruction %).
- Any planned hero moved into `battle.json` `heroes`.
- `kit.oncePerBattle: true` on the Shadow Captain.
- Every Rules 10 combat key (`battle.crowding`, `battle.wallHp`, `battle.damageSpread`, `battle.temper.convexity`,
  an axis's `versus`, a troop's `cls`, `kit.breachRadius`, `abilityCharges`, the per-warrior strength table).
- `SIM_RULES_COMPATIBLE` may keep 7 (and 5, 4) only if the bump adds new building kinds and changes nothing a rules 7
  battle reads; any tuning of live numbers in the same bump empties it.

**Not in the fingerprint but still a rules contract:** mastery with a bonus above 0. `BattleSetup.mastery` is applied in
`deploy` (`src/gameplay/sim/battle/battle.ts:293-294`); the archived engines v3 to v6 ignore the field, so a mastered
battle checked or replayed by old rules diverges. Ship it with a bump, a hello feature and a protocol field.

**Not bundle-switchable today:** a balance bundle may only change numbers that already exist
(`src/backend/net/balanceBundle.ts:84-85`, "only existing numbers can change"). None of the Rules 10 economy keys exist
in shipped data, two are booleans, and the mastery curve is in `progression.json`, which is not part of `GameData`, of
`dataVersionOf` (`src/backend/net/dataVersion.ts:51-57` hashes the `GameData` object) or of bundles.
`docs/game-theory/rules10/README.md:12-14` says "Only the raid and economy numbers could go in a bundle": not as coded.

## 3. Item by item

### 3.1 Squad orders (on main since `e563a99`, no screen)

- **State.** Logic: `src/gameplay/control/squadPlan.ts` (85 lines), `BattleSession.orderSquad/holdSquad/squadWaiting`
  (`src/gameplay/control/battleSession.ts:105-121`). Tests: `tests/gameplay/control/squad.test.ts`. UI: none
  (`grep orderSquad|holdSquad|squadWaiting|SquadOrder src/presentation src/app.ts` finds nothing). Text: none.
  Server: nothing needed (deployments list is capped at 2000, `server/core/pvp.ts:643`). The ask is written down in
  `docs/art/REQUESTS.md:20-34`.
- **Measured** (`bnl/squad.mjs`, raid-bot army at the Keep's caps, 3 generated bases per Keep, 9 orders x 6 points = 54
  raids per base, 324 raids):

  | Keep | Bot plan (the gates' attacker) | Best order and point | Worst | Warriors a plan failed to place |
  |---|---|---|---|---|
  | 9 | 60.0% | 100.0% | 29.3% | 0 of 162 runs |
  | 12 | 49.7% | 93.3% | 22.0% | 0 of 162 runs |

  Mean over all six points, Keep 9 / Keep 12: together+tanks 73.8 / 59.1 (best), pincer+reserve 49.8 / 49.9 (worst),
  file+reserve 66.6 / 53.1. The best order differs by base (together+tanks, file+rush, together+rush), so it is a real
  decision and not one answer. The oracle "best of 54" is an upper bound, not a player.
- **To make it live.** `src/presentation/ui/battleHud.ts` (formation picker, wave picker, remembered between raids in
  a device preference, a tap on an Infiltration Point sends the squad, a Hold button with `squadWaiting`),
  `src/presentation/render/BattleScene.ts` (the point tap), about 11 strings in `locales/en/ui.json` and 49 worksheets,
  Playwright at 320x568, 360x640, 390x844, 844x390. No SIM_RULES, save, protocol or server change.
- **Risks.** The balance gates use the bot plan; a hand-placing expert can already reach these scores, so no gate is
  invalidated, but three-star rates in the wild will rise once the lever is one tap. "Reserve" is on average the weakest
  wave order, so its one-line explanation matters.
- **Recommendation: ship now.**

### 3.2 Warrior Mastery (`features.mastery`, off)

- **State.** Data: `progression.json` `mastery` = `{xpBase 50, xpGrowth 1.35, maxBonus 0.3, bonusRate 0.08,
  xpPerHousingUsed 1, xpPerStar 2}`. Sim: `src/gameplay/sim/mastery.ts`; awarded in `battleEnd`, `settleOnlineAttack`,
  `trialEnd` (`village.ts:1818, 1885, 1933`); applied in `deploy`. Save: `VillageState.mastery` exists since v23 (empty).
  Tests: `tests/gameplay/planned/progression.test.ts`. UI: `masterySection` in the Codex
  (`src/presentation/ui/contentPreviewUi.ts:79-104`), labelled "preview"; its 4 strings are translated in all 49 other
  languages. Server: not done (see BNL-06). `PREVIEW_BALANCE.md` does not measure mastery at all.
- **Measured: the curve** (`bnl/mastery.mjs`). Level 5 (+10.2%) needs 498 EXP in total; one three-star raid with 120
  housing of one warrior type pays 840.

  | Keep (housing) | One-type army, three stars: raids to +10% / +15% / +20% / +25% | Five types, even split |
  |---|---|---|
  | 4 (120) | 1 / 3 / 12 / 126 | 3 / 12 / 56 / 626 |
  | 9 (285) | 1 / 1 / 5 / 53 | 2 / 5 / 24 / 264 |
  | 12 (315) | 1 / 1 / 5 / 48 | 2 / 5 / 22 / 239 |
  | 15 (360) | 1 / 1 / 4 / 42 | 1 / 4 / 19 / 209 |

- **Measured: what the bonus does** (`bnl/masterypower.mjs`, raid-bot army with the live hero, 12 bases, bot plan;
  an earlier run of this investigation on 18 bases, `bnl/mastery.out`, agrees):

  | Keep | +0% | +10% | +17% | +24% |
  |---|---|---|---|---|
  | 9 | 82.6%, three stars 50% | 91.8%, 75% | 96.1%, 75% | 97.5%, 92% |
  | 12 | 62.8%, 8% | 73.2%, 25% | 82.4%, 50% | 87.4%, 67% |
  | 15 | 73.3%, 25% | 88.5%, 50% | 89.7%, 50% | 91.4%, 67% |

  18-base run, Keep 12: +10% is worth +10.7 +- 2.6 points, +17% +17.1 +- 3.4, +24% +25.0 +- 4.1; Keep 9 at +30% is
  100% destruction and 100% three stars.
- **Reading.** As tuned, mastery is not a long chase: the first raid gives +10% and the first evening +15 to +20%,
  after which the curve is flat for months. `attackerStrength` (`matchmaking.ts:126-148`) does not see it, there is no
  defender counterpart (`progression.json` `buildingMastery` is numbers only, no sim), and the campaign and army-lab gates
  were never run with it.
- **To make the stat bonus live.** (1) Retune in `progression.json`: `xpBase` 50 -> about 1500 puts +10% at about 40
  raids for a warrior that is a quarter of a Keep 9 army (71 housing x 5 = 356 EXP a two-star raid), +17% near 230
  raids, +21% near 1,070; consider `maxBonus` 0.30 -> 0.15. (2) Fold the bonus into `attackerStrength` or apply it only
  against generated bases and Trials. (3) Server and protocol work of BNL-06. (4) Put the curve inside `GameData` so it
  is versioned and tunable. (5) Re-run `balance:campaign`, `balance:armies`, Trials tests with a mastered model player.
- **To ship ranks only, now.** Set `maxBonus` 0 and the retuned `xpBase`, add `features: { mastery: true }` to the
  shipped data (`src/gameplay/sim/data.ts` has no `features` today), drop the "preview" line, show EXP gained on the
  result screen (today `awardMastery`'s return value is discarded) and levels in the Codex. No battle changes; the
  server only needs the same data.
- **Recommendation: ranks now; stats after retune and server truth.**

### 3.3 Hero Hall, hero choice, Iron Matriarch, Sky Admiral, Grand Sensei (`features.heroChoice`, off)

- **State.** Data: `planned.json` `heroes` (derived per housing from the role's tier-3 warrior, HP x10, damage x3) and
  `hero_shrine` (Training Dojo prices; 5.17 M Provisions and 7.5 builder-days to level 10). Sim:
  `src/gameplay/sim/battle/heroAbilities.ts`, `src/gameplay/sim/heroes.ts`, command `chooseHero`
  (`village.ts:820-833`, refused while off). Tests: `tests/gameplay/planned/heroes.test.ts`, `progression.test.ts`.
  UI: hero picker on the Hall's sheet (`contentPreviewUi.ts:29-63`, wired in `hud.ts:1494-1496`), 7 strings
  translated in every language. Art: all four heroes have code-drawn sprites (`render/assets.ts:27`); the Hall uses the
  generic painter. Names and ability texts are translated in all 49 other languages. Server: refuses (BNL-06).
- **Balance, committed report** (`docs/game-theory/PREVIEW_BALANCE.md:155-172`, 6 bases per cell): Sky Admiral against
  the Shadow Captain with a sky army -7.5, -7.3, +0.2; Iron Matriarch with a guardian army -9.0, -3.3, +0.5; Grand
  Sensei with a mystic army -4.7, -5.8, +3.7.
- **Measured again on 18 bases per cell** (`bnl/heroes.out`, 6 layouts x 3 seeds, hero deployed first as in the tool):

  | Hero | Keep | Own-family army: no hero / Captain / hero | Hero minus Captain | Raid mix: hero minus Captain |
  |---|---|---|---|---|
  | Iron Matriarch | 9 | 42.7 / 52.9 / 53.2 | +0.3 | -5.7 |
  | | 12 | 47.9 / 51.7 / 48.5 | -3.2 | -3.8 |
  | | 15 | 48.9 / 55.1 / 52.9 | -2.1 | -2.7 |
  | Sky Admiral | 11 | 18.2 / 28.3 / 18.6 | -9.7 | -2.4 |
  | | 13 | 17.5 / 24.4 / 18.5 | -5.9 | -2.9 |
  | | 15 | 40.9 / 43.9 / 41.8 | -2.1 | -2.8 |
  | Grand Sensei | 13 | 13.1 / 18.1 / 13.7 | -4.4 | +2.4 |
  | | 14 | 32.7 / 33.0 / 26.3 | -6.7 | +3.4 |
  | | 15 | 34.7 / 38.8 / 33.7 | -5.1 | -0.1 |

  The Captain is equal or better in 14 of 18 cells and in 8 of 9 own-family cells. The Sky Admiral is worth +0.3,
  +1.0 and +0.9 points over no hero at all with a sky army. Deploying the hero last instead of first
  (`bnl/herolast.out`, 12 bases) does not change the picture: Sky Admiral at Keep 11 20.5 first / 20.1 last against the
  Captain's 28.8 / 26.7; Iron Matriarch at Keep 9 53.4 / 52.1 against 55.4 / 54.3; Grand Sensei at Keep 13 16.3 / 11.8
  against 18.9 / 15.7 (no hero 16.0). An earlier 30-base run on the raid mix (`bnl/hero.out`) puts every hero within
  about one standard error of every other at Keeps 12 and 15.
- **Why (read in code).** The Captain's Rally re-arms on every new target (`warriors.ts:304`, the open RM-3 question in
  `docs/game-theory/REQUESTS.md:7`), so it is up most of the fight; the three new abilities fire once per battle.
  Squall only pushes flyers that already have a target and shields them for 5 s (`heroAbilities.ts:43-49`). The Sky
  role's HP cut carries into the hero: Sky Admiral 3,558 HP at his top level against the Captain's 9,110.
- **The choice trap.** `heroFor` caps a chosen hero at the Hall's level but leaves the automatic hero uncapped
  (`heroes.ts:47-54`): at Keep 12 with a level 1 Hall, choosing the Shadow Captain gives level 1 where "Let the Keep
  choose" gives level 6. A maxed Hall never caps (Hall max level by Keep 7..15: 1, 2, 3, 4, 6, 7, 8, 9, 10).
- **To make it live.** Redesign the three kits in `planned.json` to a gate (each hero beats the Captain by 5 or more
  points with its own family at its three Keeps on 30 or more bases, and stays within 3 on the raid mix); decide Rally;
  fix the cap; move the definitions to `battle.json` `heroes`, `buildings.json` and `hall.json`; set `live` in the
  catalog; `rules:snapshot`, `SIM_RULES` 8; server `checkArmy`, `chooseHero` in `PLAYER_COMMANDS`, a hello feature and
  `docs/PROTOCOL.md` contract tests; campaign re-run; fix the Hall's description ("one hall per hero") in 50 languages.
- **Recommendation: ship after redesign.** As built it is a false choice.

### 3.4 The fifteen counters

- **State.** Data: `planned.json` (level tables derived from a live reference building), effects in
  `progression.json` `buildingCatalog`. Sim: `src/gameplay/sim/battle/previewCounters.ts` (332 lines, all fifteen
  kinds), every hook behind `BattleSim.previewKinds`. Tests: `tests/gameplay/planned/counters.test.ts` (one or two
  mechanics tests per kind, a determinism test). UI: placeable in the preview shop; names and descriptions translated
  in all 49 other languages; no art (generic painter; no file under `src/presentation` names any of them); **no battle
  callouts** (`BattleScene.ts:129` `COUNTER_LABEL` knows only `lit`, `repair`, `grounded`; the nine new event kinds
  `doused`, `surfaced`, `revealed`, `stunned`, `defused`, `absorbed`, `discharge`, `sleep`, `sealed` show nothing).
  Under `withPreview`, generated bases include them (basegen reads `hall.levels[].limits`,
  `basegen.ts:151-191`), except the Living Bamboo Wall (hedges are skipped, `basegen.ts:172, 218, 361`).
- **Measured on 12 bases per cell** (`bnl/countersA.out`, `bnl/countersB.out`; 6 layouts x 2 seeds; the tool's own
  method: effect = with the building minus with its body only; negative is good for the defender; three Keeps each):

  | Building | Effect against the armies it is meant to beat | Against the armies meant to beat it | Raid mix | Verdict |
  |---|---|---|---|---|
  | Steam Vent | -5.0, 0.0, -6.6 | -0.7, -1.4, -0.8 | -3.8, -3.5, -2.1 | works, right direction |
  | Lightning Rod Tower | -6.7, -2.2, -1.2 | 0.0, 0.0, 0.0 | -1.1, -5.1, -3.0 | works, right direction |
  | Whirling Blade Tower | -9.2, -4.8, -0.3 | -17.3, -10.4, -1.9 | -1.4, -7.6, -4.2 | works, but hurts its own counters more, and fades by Keep 15 |
  | Bronze Mirror Screen | -2.9, -2.8, +0.2 | 0.0, 0.0, 0.0 | -2.7, -5.3, -1.5 | small; its HP is the real power |
  | Living Bamboo Wall | -0.4, -3.8, -0.9 | -2.0, -0.4, 0.0 | 0.0, -1.4, -6.3 | small |
  | Sand Bucket Post | 0.0, 0.0, 0.0 | -0.7, 0.0, -0.4 | 0.0, 0.0, -3.8 | no-op |
  | Rolling Log Chute | -0.4, 0.0, -0.4 | 0.0, 0.0, -0.4 | -1.1, 0.0, 0.0 | no-op |
  | Sleep Dart Tower | +1.0, -1.3, -0.2 | +1.1, -0.3, -3.0 | -0.7, +1.3, +1.6 | no-op (noise) |
  | Straw Scarecrow | +2.9, -0.3, -0.5 | 0.0, 0.0, -0.4 | 0.0, 0.0, 0.0 | no-op |
  | Listening Jars | -1.2, 0.0, 0.0 | 0.0, 0.0, 0.0 | 0.0, 0.0, 0.0 | no-op |
  | Discipline Banner | -0.5, -0.4, 0.0 | 0.0, 0.0, 0.0 | +0.9, 0.0, 0.0 | no-op |
  | Spotter's Perch | 0.0, +0.8, 0.0 | 0.0, 0.0, 0.0 | -1.1, 0.0, 0.0 | no-op |
  | Rain Barrel Tower | 0.0, 0.0, 0.0 | 0.0, 0.0, +0.2 | 0.0, 0.0, +1.8 | effect is a no-op (it still shoots) |
  | Ink Seal Post | 0.0, 0.0, 0.0 | 0.0, 0.0, 0.0 | 0.0, 0.0, 0.0 | exact no-op (it seals 7 to 13 warriors a fight; nobody was going to revive them) |
  | Moonlit Gravel Garden | 0.0, +0.3, 0.0 | 0.0, 0.0, 0.0 | 0.0, 0.0, 0.0 | exact no-op |

  An independent 18-base run at Keep 15 with standard errors (`bnl/counters15.out`, `counters15t.out`) agrees: effect
  deltas of exactly 0.0 +- 0.0 for Listening Jars, Scarecrow, Banner, Perch, Gravel and Ink Seal; -4.4 +- 2.7 for the
  Lightning Rod and -4.0 +- 2.0 for the Whirling Blade Tower on the raid mix; -2.2 +- 0.9 for the Steam Vent on its
  targets.
- **The body matters more than the rule.** One extra building near the defences changes a raid by more than most
  effects: Discipline Banner body at Keep 15, raid mix, -13.9 points with an effect of 0.0; Mirror Screen body at Keep
  7 against the melee army meant to beat it, -20.2. Fifteen new bodies on every generated base is a whole new balance.
- **Measured: the price** (`bnl/caps.mjs`, `bnl/tables.mjs`). To max all sixteen planned buildings at Keep 15: 616 M
  Coins and 494 builder-days. All live defences, traps, supports and walls together today: 418 M and 407. The five that
  work cost 393 M and 214 builder-days by themselves (Lightning Rod 154 M; Living Bamboo Wall 3.79 M x 25). First
  levels of late buildings take the reference's top-level time: Ink Seal Post level 1 is 1.62 M Coins and 7 days,
  Lightning Rod level 1 is 4.28 M and 7 days. Levels past the reference's top grow x1.16 power and x1.45 cost each
  (`plannedContent.ts:89-91`), so a level 12 Living Bamboo Wall has 54,761 HP (1.81x a level 13 Stone Wall) for
  1,191,459 Coins (8.8x), where `planned.json:22` says "Stone Wall HP at double the price"; a level 10 Mirror Screen
  has 125,810 HP (2.3x a max Kunai Tower). No level costs more than the Keep's storage cap.
- **To make one live.** Move its generated definition (`previewBuildingDef`) into `buildings.json`, its counts into
  `hall.json`, set `live` in `progression.json`; `rules:snapshot`; `SIM_RULES` 8 and the fingerprint; `rules:fixture`;
  `npm run docs:progression`; callout labels through `t()` (one per event kind, 50 languages); a painter in
  `src/presentation/art/ninja.ts` `buildingPainters`; scout tips; then every balance artefact, because generated bases,
  Trial fortresses and bot raids all change: `balance:armies`, `balance:campaign` (and the gate fingerprint),
  `test:slow`, `trials.test.ts`. Server deployed first.
- **Recommendation.** First wave of at most five, re-priced, after a balance pass. Leave the other ten: their rules
  work in the unit tests and change nothing in a raid.

### 3.5 Rules 10 hooks (lab, on main since `f7d3e6c`)

| Hook | Where | Data key (absent in shipped data) | Kind |
|---|---|---|---|
| Towers need room | `battle/battle.ts:154-168` | `battle.crowding {radius, slow, max}` | combat |
| Wall health multiplier | `battle/battle.ts:120-121` | `battle.wallHp` | combat |
| Shot spread (draws from the battle RNG when on) | `battle/battle.ts:709-715` | `battle.damageSpread` | combat |
| Class hunting and convex tempers | `battle/temper.ts:118-127, 143, 208`, `battle/battle.ts:717-722` | `battle.temper.convexity`, axis `versus`, troop `cls` | combat |
| Siege breach | `battle/warriors.ts:354-361` | `kit.breachRadius` | combat |
| Ability charges | `battle/battle.ts:318` | `abilityCharges` | combat |
| Raider carries by stars | `defense.ts:206-209` | `raids.carryByStars` | economy, offline raids |
| Defence pays per star, uncapped | `defense.ts:242-245, 278` | `raids.defenseWin.perStar`, `.uncapped` | economy |
| Raiders matched to the Keep | `matchmaking.ts:272-279` | `raids.raiderMatch {lo, hi}` | matchmaking |
| Attacker carries by stars | `village.ts:1848-1851` | `raids.attackCarryByStars` | economy, server replays it |
| Garrison crew | `village.ts:427-438` | `economy.garrisonCrew` | economy, server replays it |
| Model player's layout | `defense.ts:182-185` | `raids.labAutoLayout` | lab only |

- Read in code: every hook is reached through an untyped cast (`(data.battle as { wallHp?: number })`), and no file
  under `tests/` names any of the keys. `cls` appears 0 times in `troops.json`; the lab assigns it at run time
  (`tools/balance/lab/lab.ts:78`).
- The lab's own results (`docs/game-theory/rules10/SESSION_2026-11-15.md:75-94`): after the last loop the gap between
  the best and worst standard army is 19 / 19 / 17 at Keeps 9 / 12 / 15 against a pass mark of 12; Keep 9 has not
  converged; Keeps 6, 7, 8, 10, 11, 13 and 14 have not had the loop; the breach radius "does nothing measurable" and
  "can be dropped"; "No person has played any of this."
- **Recommendation: leave the combat side.** The two economy hooks that answer "defence is not worth building"
  (`garrisonCrew`, `defenseWin.perStar`) are worth a campaign run on their own.

### 3.6 Stances, Living Fortress, balance-pass option (design documents)

| Idea | Status in today's code |
|---|---|
| Stances (four per village) | Replaced by Tempering, live since rules 6 (`battle/temper.ts`, HUD panel `hud.ts:1616`) |
| Rivals that answer the player's last ten raids | Live as temper offers (`battle.json` `temper.offers`: `recentRaids` 10, `counterShare` 0.5; `matchmaking.ts:218`) |
| Per-base memory of attackers | Not built |
| The Watch (loot x own defence index) | Not built; "Watch" is now the name of a temper axis |
| Spoils for a held raid | Only `raids.defenseWin.shareOfRaidLoot` 0.05 |
| Strength is what you field; no warriors, no reward | Built (`matchmaking.ts:126-148`, `village.ts:1789-1797, 1838`) |
| One economic scale | Other investigators' area |

Leave these as documents. The realized part (Tempering plus adaptive rival offers) is the design's core.

### 3.7 Thirteen catalog buildings with no implementation

Scroll Library, Shadow Ink Well and Vault (a third currency), Reinforced Gate, Sky Net, Alarm Bell Tower, Clan Forge,
Wind Chime Wire, Repeating Crossbow Bastion, Flame Trench, Thunder Spire, Ninja Watch Post, Great Dragon Cannon. Names
and descriptions are in the catalog and translated; there is no sim, data or test. Leave.

## 4. Live features a player cannot find or read

| Feature | Sim | What the player gets |
|---|---|---|
| Squad orders | `control/squadPlan.ts` | nothing |
| The Shadow Captain's Rally | `warriors.ts:302-307` emits `ability: rally` | no callout: `ABILITY_NAME` is built from roster warriors only (`BattleScene.ts:128, 1200-1206`) |
| The hero himself | `heroes.ts`, `battle.json` `heroes` | only a troop card in battle; hero data is read nowhere else in `src/presentation` (no Keep 7 moment, no Codex entry) |
| Rally "once per battle" | re-arms on every new target | text says once (`battle.json` hero description, `roster.json` "Recharges each battle") |
| Rival clans answer your last ten raids | `temper.offers` | the scouted profile is shown (`battleHud.ts:363-364`); no sentence anywhere says rivals adapt (no such string in `locales/en/ui.json` or `data.json`); clan bios do not name their temper |
| What counters what | `counters`/`counteredBy` on 20 catalog buildings | not shown; the Codex lists warriors only |
| Exhausted stores (each lost raid in 24 h halves the next raider's take) | `defense.ts:84`, `raids.json` `exhaustion` | no text |

Checked and fine: Tempering (panel on the tower sheet), stakes (scout drawer), diversity carry (`carry.diversity`
line), rematch, "Try a different fortress", army presets, practice battles ("Try").

## 5. Other findings

- **A not-live field is accepted by a live endpoint.** `POST /v1/replays/shared` copies `setup.mastery` from the
  request (`server/core/sharedReplays.ts:74, 84, 118`) and re-simulates it unchecked (`:127`); the live engine multiplies HP
  and damage by `1 + mastery` (`battle.ts:293-294`). No range, no `features.mastery` test, no comparison with the
  recorded attack. When the seed matches one of the sharer's recorded raids the share is labelled as a raid on a real
  player (`:139`). Read in code, not reproduced.
- **Mastery EXP is not awarded** in Alliance War, Gang War, Bounty Hunt or rematch battles (three call sites only).
- **Translated text that does not match the code** (each fix is 50 languages): Hero Hall "one hall per hero" (one Hall,
  one chosen hero); Ink Seal Post "nothing bails out of them" (no such mechanic: `grep bail src/gameplay/sim` finds
  nothing); Grand Sensei "ignores the next jam" (code: stun, trap or splash, `heroAbilities.ts:51-56`); Bronze Mirror
  Screen "Melee warriors just walk up and smash it" (its body costs the melee army 20 points at Keep 7).
- **The committed preview report is thin.** `PREVIEW_BALANCE.md` uses 6 bases per cell; its "Events" column counts
  every counter on the base, live ones included (values of 1.0 to 1.5 are the Repair Crane); it has no mastery section
  and does not test the Hall cap.
- **Lightning Rod event volume.** 1,200 to 1,700 `absorbed` events per fight at Keeps 13 to 15 (one per absorbed hit,
  `previewCounters.ts:273`).
- **No human can reach the preview on the deployed build.** `previewAllowed` needs a dev build, or `?debug&preview` in
  a build with `VITE_ALLOW_PREVIEW=1`, which the deploy workflow never sets (`src/backend/payments/select.ts:23-27`,
  `src/main.ts:275-279`).
- **Lesson already written down, keep it:** `docs/DECISIONS.md:10` (do not add save fields for features that are not
  about to go live; v23 forced an update notice for two empty fields).

## 6. Genius elements (do not change)

1. `withPreview` isolation (`sim/plannedContent.ts`): the shipped data never holds planned content, and
   `BattleSim.previewKinds` keeps every hook off the live path; a test proves a live battle plays the same under both.
2. Reference-derived level tables (`planned.json` `ref`, `hpMult`, `damageMult`, `costMult`): one rule, no hand-typed
   tables; the hero rule reproduces the Shadow Captain exactly (tested).
3. Squad orders as pure planning that emits ordinary deployments: no protocol, replay or server surface.
4. The body-versus-effect measurement in `tools/balance/preview.ts`: it separates what a rule does from what HP does.
5. Rules archives (`server/rules/vN`, `manifest.json` digests, `SIM_RULES_COMPATIBLE`, snapshot before bump).
6. Tempering with adaptive rival offers: a fixed-budget reshaping shown at scouting; an untempered base plays exactly
   as rules 5.
7. Mastery's guard rails: `masteryMatches` (never more than earned), donated warriors and the hero earn none, an
   asymptotic cap. The shape is right; only the scale is wrong.
8. The balance lab's method and candour (role-frontier objective, exploit search, pass marks it reports failing).

## 7. How to re-run the measurements

From `docs/audit/understand-2026-11-16/scripts/built-not-live/`:
`node mastery.mjs` (curve), `node masterypower.mjs` (bonus against bases, about 40 s), `BASES=3 KEEPS=9,12 node squad.mjs`
(about 2 min), `SEEDS=3 node heroes.mjs iron_matriarch sky_admiral grand_sensei` (about 4 min), `node herolast.mjs`
(about 3 min), `node counters.mjs <ids...>` (30 to 80 s per building), `node tables.mjs`, `node caps.mjs`.
