# Fuzz audit: machine-found defects in the simulation

Lens: property-based fuzzing, invariants, determinism hazards, long-horizon numerics, save round-trips.
Read-only: no tracked file was changed. Scripts and raw output are kept in
`(session scratch, not kept)/fuzz/`
(`lib.ts` invariants, `gen.ts` command generator, `fuzz1.test.ts` command fuzzer, `battle.test.ts` battle fuzzer,
`perf.test.ts`/`perf2.test.ts`/`walls.test.ts` battle cost, `misc.test.ts` long horizon, locale, conservation,
`save2.test.ts` save corruption, `repro1.test.ts` reproducer of FUZ-1, and their `*.json` results).

The run was interrupted once and finished on a tight budget on a machine shared with other auditors (load
average 5 to 10 on 4 cores). Section 1 says exactly what ran and what did not.

## 1. Coverage summary

**Command fuzzer** (seeded mulberry32, through `applyCommand`, the entry point `server/core/villageReplay.ts`
uses): about 321,000 commands.

| Run | Commands | Applied | Notes |
|---|---|---|---|
| fresh village, `PLAYER_COMMANDS`, JSON-reachable values | 60,000 | evolving village | reset every 400 commands |
| Jade-rich fresh village, same | 60,000 | evolving village | |
| fixtures v21-keep8, v24-keep8, v24-keep15, same | 180,000 | **single-step only** | the fixtures start far above storage (written by `tools/saves/make-fixture.mjs` with 5e7 of each resource), which tripped my cap invariant, so every command was applied to the start state |
| v24-keep8 with resources clamped to storage | 20,352 | 3,682 applied, evolving | the corrected rerun |
| all 50 command types, any JS value (NaN, undefined...) | 600 | smoke run only | |

Time steps in these runs: 0, 1 ms, 7 ms, 1 s, 1 min, hours, days, 30 days, 10 years, fractional milliseconds.
Parameters: valid ids, ids of other categories, `planned.json` ids, unknown ids, prototype keys, wrong types
(`Infinity` as `1e999`, `-0`, 1e308, 2^53+1, fractions, negatives, strings, arrays, objects, null), missing and
extra fields.

Applied counts by type (first 300,600 commands): scout 8,625, claimCalendar 8,498, openDailyChest 8,419,
abandonBattle 8,294, move 6,409, setProfile 3,762, upgrade 3,695, dismiss 3,057, clear 2,131, place 1,086,
drillEnd 515, trialEnd 468, setLocalTime 431, buySkin 378, claimAchievement 335, bountyEnd 264, trialAlternate 167,
train 104, trainArmy 87, research 85. **Hardly or never applied:** collect 1, cancel 1, cancelTraining 1, skip 1,
topUp 1, temper 2, skipTraining 0, skipResearch 0, cancelResearch 0, claimTask 0, claimTier 0, claimStipend 0,
claimKeepSeal 0, rematchEnd 0 (refused 8,000 to 11,000 times each). The random generator rarely met their
preconditions; these paths are covered only by the conservation loops below.

**Not completed:** the "chaos" runs (clock going backwards, NaN/Infinity/1e308 clocks, all non-player commands).
Two were lost to a start-up race between concurrent vitest processes (note N1), one did not finish in its time box
and was not triaged. Backwards time was only exercised by the long-horizon check.

**Invariants checked after every applied command:** no throw; input state untouched; no NaN, Infinity, -0 or
undefined anywhere in the state; whole-number counters; resources >= 0 and <= storage; Jade never rises outside
grant commands; army <= housing; army + queue <= queue limit; queue timers ordered and never ending before they
began; busy builders <= builders; one research per warrior; `validateVillage` clean; `deserialize(serialize(s))`
deep-equal and idempotent; `economyHash` equal before and after a save/load.

**Conservation loops** (`misc.test.ts`): 12,000 do/undo attempts on v24-keep8 and v24-keep15 at 100%, 99.9%, 50% and
5% of storage. Only 309 completed both halves: top-up upgrade + cancel 221, top-up train + cancel 30, top-up
research + cancel 28, train + skip + dismiss 15, train + cancel 11, upgrade + cancel 2, clear + cancel 1,
place + cancel 0. Thin coverage; no gain in those.

**Battle fuzzer:** 145 battles, 179,575 ticks (129 live data, 16 with `withPreview`): generated bases at Keeps 1-15
in all five layouts, Trial tiers 1 to 5,000, and hand-built degenerate bases (empty, walls only, Keep only, Keep in
1 to 5 closed wall rings, packed, traps only, one of each building, overlapping buildings, map-edge buildings,
duplicate ids, everything upgrading, `power`/`wallPower` 0 to 1e300); armies of 0.2x to 5x the Keep's housing;
deployments all at tick 0, on one tile, duplicated, trickled, in the last 3 ticks, none, out of range, at fractional
and negative ticks, with unknown and prototype-key troops. Each battle was run twice and a third time with the key
order of `army`, `levels` and `loot` reversed. Plus 61 targeted cost battles (`perf*.json`, `walls.json`).

**Long horizon:** fresh, v24-keep8 and v24-keep15 villages with timers running, advanced 1, 10, 100, 1,000 and 285,000
years in one jump; 1 and 10 years also in 365/520 steps; then everything collected; then the clock set back to the
start.

**Save corruption:** 1,800 mutated copies of the five fixtures (1 to 4 random fields deleted or replaced by a wrong
type or a huge value) through `deserialize`, then `advance` and seven commands on whatever loaded.

**Determinism by reading:** grep of `src/gameplay/sim` and `control` for locale, Date, random, pow/log/trig, sort
comparators. Not run under different `TZ` values (every `Date` use found reads UTC fields).

## 2. Ranked findings (new)

| ID | Severity | Confidence | Title |
|---|---|---|---|
| FUZ-1 | HIGH | High (reproduced through the server's `replayVillage`) | A prototype-key troop id in `abandonBattle` deployments writes NaN into `army`; housing and queue limits stop applying for the rest of the batch (army 120, then 240, in camps of 60) |
| FUZ-2 | HIGH | High on the mechanism, medium on real-world frequency | A wall ring touching a building gives no protection against melee warriors (they never attack it) and makes every such warrior run a failed full-map path search each tick: 34x to ~870x the battle's CPU |
| FUZ-3 | MEDIUM | High | `validateVillage` accepts a village whose `tasks`, `pass` or `calendar` has the wrong shape; the save "loads" and the game then throws on `advance` or the next command instead of offering the damaged save back |
| FUZ-4 | LOW | High (comparator), not reproduced end to end | `drillArmy` picks its filler warrior with `localeCompare` in the runtime's locale: Czech, Slovak, Hausa and Igbo devices can build a different drill army than the server |
| FUZ-5 | LOW | High (stored values), medium (replay effect, by reading) | Battle commands store the client's record fields as sent (`endTick: Infinity`, `ticket`, junk deployments, `-0`): the stored record is not what a save/load gives back, and an `Infinity` end tick replays as a surrender at tick 0 |
| FUZ-6 | LOW | High | Device-only commands store unchecked numbers (`tutorial.step`, `markPrepOffer.week`) and several commands throw TypeErrors on malformed input (caught by the server's replay, not by the simulation) |

Note N1 (tooling, not the simulation): two vitest (or vitest and vite) processes started together in one checkout
can fail at config load, `ENOENT ... public/lang/boot-mr-....json` from `rmSync` in `tools/i18n/build.mjs:82`
(`buildLanguageAssets()` runs in `vite.config.ts` and deletes and rewrites `public/lang` each time).

## 3. Findings

### FUZ-1 (HIGH): prototype-key troop id in `abandonBattle` poisons the army with NaN

- **Defect.** `src/gameplay/sim/village.ts:2467-2475` `deployedTroops` tests `data.troops[d.troop]`, which is truthy
  for `hasOwnProperty`, `toString`, `valueOf`, `constructor` (inherited from `Object.prototype`), then does
  arithmetic on `setup.army[d.troop]` and `out[d.troop]`, both the inherited function: `out.hasOwnProperty` becomes
  the string `"function hasOwnProperty() { [native code] }1"`. `spendTroops` (`village.ts:2477-2492`) passes it to
  `takeFromArmy` (`src/gameplay/sim/army.ts:219-236`), which stores `state.army.hasOwnProperty = NaN`
  (`NaN <= 0` is false, so the entry is not deleted).
- **Consequence.** `armyHousing` (`army.ts:14-18`) is then NaN, and every comparison with it is false:
  `finishTraining` (`army.ts:40-56`, `used + size > cap`) moves every finished warrior into the camps whatever they
  hold, and `trainQuoteOn` (`village.ts:1581-1597`) stops refusing a full queue. The NaN lasts until the village is
  next read from JSON, where `repairFields` (`save.ts:341-349`) silently drops the entry ("Save repaired at load:
  army hasOwnProperty"): that is, for the rest of the command batch.
- **Reachable.** `abandonBattle` is in `PLAYER_COMMANDS`; the payload is plain JSON; the command always returns ok.
- **Reproducer** (`scratchpad/fuzz/repro1.test.ts`, through `server/core/villageReplay.ts` `replayVillage`, fixture
  `v24-keep8.json`: camps of 60, 10 Shinobi ready, 110 finished in the next-army queue). One batch:
  1. `{type:'abandonBattle', record:{at, opponentName:'x', setup:{seed:1, base:{name:'x',hallLevel:1,buildings:[]}, army:{}}, deployments:[{tick:0, troop:'hasOwnProperty', x:0, y:0}]}}`
  2. to 4. `{type:'train', troop:'hedgehog_roller', count:40}` three times.

  Without step 1: `2:ARMY_FULL 3:ARMY_FULL 4:ARMY_FULL`, army housing 10/60. With it: all four `ok`; after reload the
  army is 120 Shinobi in camps of 60 with 120 more queued. The same batch three days later: 240 in camps of 60.
  Repeating it has no bound. The fuzzer hit the same NaN 381 times in 300,000 commands with the keys
  `constructor`, `hasOwnProperty`, `toString`, `valueOf` (also as `hash-unstable`: `economyHash` before and after a
  save/load differ).
- **Impact.** An army several times the camps on a server-held village. `trialEnd`, `bountyEnd` and `rematchEnd`
  only check `n <= have` (`checkBattleSetup`, `village.ts:2019-2046`), so Shadow Trials, Bounty Hunt and Gauntlet
  ladders and rematches can be fought with a multiple of the intended army; the stock also removes the training
  wait between raids, which `skipTraining` sells for Jade. An online raid is still capped per raid by
  `server/core/pvp.ts:237` (`army.too_big`). Second effect: such an abandon is never counted as fought (`n > 0` on a
  string is false in `foughtWithWarriors`), so the E16 penalty does not apply to it.
- **Known lists.** WORLDWIDE_AUDIT D4 (`3cd05a5`) fixed `canDeploy` only; `src/gameplay/CLAUDE.md` then says "Keep
  every lookup of a client-sent id on an own property". This site was missed: closed but still broken.
- **Fix.** `Object.hasOwn(data.troops, d.troop)` in `deployedTroops` and `cleanArmy`; `takeFromArmy` should refuse a
  key that is not its own or a count that is not a whole number; `armyHousing`/`queueHousing` should skip ids that
  are not own keys of `data.troops`; and `applyCommand` (or `replayVillage`) should refuse any result that fails
  `validateVillage`, which would have turned this into a refusal.
- **Limits.** Reproduced on the in-process replay, not over HTTP. `BATTLE_COMMANDS_PER_MINUTE` limits how often.
  I did not run a Trial with the oversized army to measure how many tiers it skips.

### FUZ-2 (HIGH): a wall ring touching a building is ignored by melee warriors and multiplies the battle's CPU cost

- **Defect.** `src/gameplay/sim/battle/pathfind.ts:96-151` `findPath` only accepts a goal tile that is standable
  (line 117-118). When every tile within a melee warrior's reach of the target is a wall, no goal exists, the search
  expands the whole map and returns null. `src/gameplay/sim/battle/battle.ts:540-548` then takes the fallback
  "Fully walled in: walk straight at it", which walks the warrior to the target without attacking any wall, and
  because `t.path` stays null the same failed full-map search runs again next tick, for every such warrior.
- **Minimal reproducer** (`scratchpad/fuzz/walls.test.ts`, deterministic, seed 3): a level 3 Keep at (20,20), 20
  level 1 Shinobi (`hedgehog_roller`, range 0.6) deployed at tick 0 on the first Infiltration Point.

  | Base | Walls damaged | Keep destroyed at tick | Stars | CPU |
  |---|---|---|---|---|
  | no walls | - | 337 | 3 | 30 ms |
  | 20 max-level walls touching the Keep | 0 of 20 | 323 | 3 | 1,025 ms |
  | closed ring one tile away (28 walls) | 1 | never | 0 | 73 ms |
  | closed ring two tiles away (36 walls) | 1 | never | 0 | 52 ms |

  Four Samurai (`beetle_brute`) give the same picture (747, 734, never, never). So the ring that touches the Keep
  protects nothing, while the same walls one tile out stop the same army for the whole battle. Keep 1 allows exactly
  20 walls, the number of tiles round the 4x4 Keep, so the most natural first layout is the one that does not work.
- **Cost at scale** (`perf.json`; a max Keep with one touching ring, a Keep 15 camp of 360 housing):
  360 Shinobi at tick 0: 154,525 ms for a 122-tick battle (mean 1,267 ms per tick, worst tick 5,525 ms) against
  177 ms without the ring (about 870x). One Shinobi per tick: 22,017 ms. 72 Samurai: 7,032 ms. 120 Ram Crew:
  6,556 ms. Ranged (`frog_lobber`, range 3.5) and wall-ignoring (`mole_digger`) armies are unaffected (16 to 41 ms).
  One failed search costs about 1 ms (`perf2.json`).
- **Impact.** (1) A rule defect, not a balance opinion: walls placed against a building are skipped by every
  ground melee warrior, including three rings deep. (2) Devices: the simulation needs under 100 ms per tick; with a
  few dozen melee warriors heading for a wrapped building a cheap phone falls below real time. (3) Server: the
  re-simulation pool stops a battle at 15 s (`server/resim/resim.ts:154`, "a bug, never a real battle") and answers
  503, so an honest raid of this kind cannot be settled and each try costs a worker 15 s.
- **Known lists.** `docs/audit/areas/08-code-quality.md` item 28 is a different cost (`stepDefense`, defenses x
  troops x support). `docs/prompts/LOW_END_AND_BAD_NETWORK.md` records "about 1 ms per tick ... Not a problem".
  Nothing on walls touching a building or on failed path searches.
- **Fix.** Let the goal test accept a wall tile within reach (the warrior then breaks that wall, as it does on any
  other route), or on a null path target the nearest wall on the straight line; and remember a failed search until
  the grid changes (a building destroyed) instead of repeating it every tick. This changes battle results: it needs
  a `SIM_RULES` bump with `npm run rules:snapshot` first.
- **Limits.** Timings were taken on a loaded shared machine, so the ratios are the evidence, not the absolute
  milliseconds; nothing was measured on a phone. In a full generated max-level Keep 8 or Keep 15 base with only the
  Keep wrapped, single-type melee armies died before reaching the Keep, so those battles stayed cheap (232 to
  448 ms): the cost needs living melee warriors whose current target is wrapped. I did not check whether any
  generated layout or Trial fortress places walls against a building. The battle fuzzer's other slow cases (worst
  tick 2,994 ms, "packed", 353 warriors) were not minimised and may be the same cause.

### FUZ-3 (MEDIUM): wrong-shaped `tasks`, `pass` or `calendar` passes validation, then the game throws

- **Defect.** `src/gameplay/sim/save.ts:478` checks `stats`, `pass`, `tasks`, `cosmetics`, `offers`, `profile` only
  for truthiness (`!v.stats || !v.pass || !v.tasks ...`), and `calendar` and `stipend` not at all.
- **Reproducers** (fixtures in `tests/fixtures/saves/`, one field changed, `deserialize` succeeds):
  `v21-keep8` with `village.tasks = "x"`: the first `advance` throws `TypeError: Cannot create property 'dayIds' on
  string 'x'`. `v24-keep8` with `village.pass = []`: `Cannot read properties of undefined (reading 'includes')`.
  `v23-keep8` with `village.calendar = [1,2,3]`: `claimCalendar` throws `... (reading 'skin')`.
  13 of 1,800 mutated saves behaved this way.
- **Impact.** The invariant is "a damaged save is kept and offered back". These saves are accepted, so the
  damaged-save path never runs, and with `tasks` broken every `advance` throws: every tick and every command of
  that village. A village imported to the server in this state has all its commands refused (the replay's
  try/catch) for good.
- **Known lists.** Beast Mode SAV-03 and N24-SAV-7 added load-time repairs for resources, buildings, army,
  training, presets, research and the Lodge; none covers these objects.
- **Fix.** Check the shape of each sub-object in `validateVillage` (arrays where arrays are read, finite numbers
  where counters are stepped), or repair them to their empty value in `repairFields` as `mastery` and `hero` are.
- **Limits.** Real storage damage usually breaks the JSON as a whole; this needs a partly wrong object (an edited
  export code, or a bug). Four other mutations made the loader itself throw a `TypeError` instead of "Save data is
  damaged" (`del village`, `armyPresets.0.army = null`, `buildings.1.type = "__proto__"`); the boot path catches any
  error, so those are only untidy.

### FUZ-4 (LOW): locale-dependent sort in the drill army

- **Defect.** `src/gameplay/sim/drill.ts:45`: `sort((a, b) => housing difference || a.localeCompare(b))[0]`.
  `localeCompare` without a locale uses the runtime's. Also `src/gameplay/sim/objective.ts:70` (interface only).
- **Evidence.** Under `LC_ALL=cs_CZ.UTF-8` Node resolves `cs-CZ` and
  `'chain_sickle_reaper'.localeCompare('hedgehog_roller')` is `1`; under `en_US.UTF-8` it is `-1`
  (`locale-*.json`). With ICU 78 the pairs of equal housing that order differently from English are: `cs` and `sk`
  `chain_sickle_reaper` against `hedgehog_roller` and `frog_lobber`; `ha` and `ig` `shuriken_storm` against
  `storm_sovereign`; `ig` also `ghost_engineer` against `grapple_raider`. `cs`, `sk`, `ha` and `ig` are shipped
  languages. English order equals code-unit order for every pair of warrior ids.
- **Impact.** `drillEnd` is in `BATTLE_COMMANDS`: the server rebuilds the drill army in its own locale. On those
  devices, when the mix holds both warriors of a pair and rounding leaves spare housing, the extra warriors are of
  a different type, the server refuses the client's deployments of them and stores a different result than the
  player watched. The reward (paid for fighting at all) is the same.
- **Known lists.** WORLDWIDE_AUDIT line 1105, item 11 ("`localeCompare` sort", fixed) covered `heroes.ts:51` only;
  the drill came later.
- **Fix.** The code-unit comparator of `heroes.ts:51`.
- **Limits.** I showed the comparator, not a whole diverging drill: my fixture village had not unlocked
  `chain_sickle_reaper`, so its drill army was the same in both locales.

### FUZ-5 (LOW): battle records keep the client's fields as sent

- **Defect.** `trialEnd`, `bountyEnd`, `rematchEnd` and `drillEnd` build the stored record as `{ ...rec, setup, ... }`
  (`village.ts` about lines 2311, 2372, 2409 and 2441) and never check `rec.deployments` entries, `rec.endTick` or
  extra fields. The fuzzer stored `endTick: Infinity` and `-Infinity`, deployments with `tick`/`x`/`y`/`troop` of
  `Infinity` or `-0`, non-object deployments, and `ticket: -Infinity` (36 distinct cases).
- **Impact.** JSON turns those into `null`, so the record on disk is not the one that was played. For `endTick`,
  `runBattle` (`battle.ts:918-929`) tests `endTick !== undefined && sim.tick >= endTick`; `0 >= null` is true, so the
  stored record replays as a surrender at tick 0 while its result says otherwise. A client `ticket` and
  `settlement: 'pending'` also survive into a Trial record, and `settleOnlineAttack` matches records on exactly
  those two fields (`village.ts:2213`); I did not pursue whether that can be turned to advantage.
- **Fix.** Build the record from a whitelist (`at`, `opponentName`, cleaned `deployments`, a whole-number `endTick`).
- Same family, harmless: `move`/`place` accept `x: -0` and `setLocalTime` accepts `minutes: -0` (stored as `-0`, read
  back as `0`; `economyHash` is unaffected because `canonicalJson` prints both as `0`).

### FUZ-6 (LOW): unchecked device-only numbers and TypeErrors on malformed input

- `village.ts` about 1001-1006: `tutorial` stores `cmd.step` and `markPrepOffer` stores `cmd.week` as given;
  `{step: -Infinity}` and `{week: NaN}` are accepted and read back as `null`. Neither is a player command.
- TypeErrors seen (all from malformed shapes or prototype keys): a command whose `type` is `hasOwnProperty`,
  `constructor`, `__proto__` or `''` (`runCommand` returns undefined, `applyCommand` reads `.ok`, `village.ts:660`);
  `train`, `trainArmy`, `research`, `dismiss`, `topUp` with a prototype-key warrior (`reading 'length'`);
  `saveArmyPreset.name` and `chat.text` that are not strings; `battleProgress.pending` that is a number; battle
  commands with no `record`, a null deployment or non-iterable `deployments`; any id given as `{toString: 1}`
  (`Cannot convert object to primitive value`). About 6,400 in 321,000 commands.
- The server's replay catches them (`server/core/villageReplay.ts:103-108`) and refuses the command, so there is no
  500 there. In the game they would be uncaught exceptions, but only a modified game sends such input.
- `saveArmyPreset` with `army: {constructor: 5}` is accepted by `cleanArmy` (`village.ts`, same `data.troops[t]`
  test) and passes `validateVillage`; I did not check what the Army panel does with it.

## 4. Invariants that held

Across every applied command of the evolving runs (fresh, rich, clamped v24-keep8):

- No resource was ever negative, fractional or above storage; no counter left the safe-integer range.
- Jade rose only through grant commands. The one flag (`skip` on an obstacle being cleared, +3) is the obstacle's
  own 2 to 6 Jade arriving early for a 1 Jade skip of at most 60 s: by design.
- The input state was never mutated, on success, refusal or throw (so a refused command leaves the village as it
  was).
- Outside FUZ-1: army never above housing, queue never above its limit, queue timers in order, builders within
  their number, one research per warrior, `validateVillage` clean, save round-trip equal and idempotent,
  `economyHash` stable across save/load.
- Battles: no exception from the engine in 145 fuzzed battles (bad, duplicate, late, out-of-range and
  prototype-key deployments are refused cleanly); every battle ended within its duration; destruction 0 to 100,
  stars 0 to 3 and consistent with destruction and the Keep; loot finite; warriors used never above the army;
  identical hash on a second run and with reversed key order; no warrior idle for the last 60 s of a timed-out
  battle. One preview-data battle hit my 20 s wall-clock cap (the FUZ-2 pattern).
- Long idle: 1 to 1,000 years in one `advance` took 0 to 3 ms with nothing non-finite, negative or above storage;
  285,000 years (beyond the `Date` range) left `season` unchanged without NaN; collecting afterwards stayed within
  storage; setting the clock back to the start broke no invariant. One jump and the same span in daily steps differ
  only in Jade from league season chests (2 against 12 a year), which is the `ranks.seasonCatchUpMax` cap.
- Corrupted saves: 1,391 of 1,800 loaded and played, 391 were refused as damaged, none hung, none came back as a
  new village.
- Determinism by reading: no `Math.random` or `Date.now` in `sim/` outside `clock.ts`; every `Date` use reads UTC
  fields; `Math.pow`/`log2` only in `progression.ts`, `plannedContent.ts` and `trials.ts:127`, none in a battle;
  every `sort` in the battle code has a total order or sorts a deterministically built list.

## 5. Already known, skipped

- WORLDWIDE_AUDIT D4: `constructor` as a troop id in `canDeploy` (fixed `3cd05a5`): holds under fuzzing.
- WORLDWIDE_AUDIT item 11: `localeCompare` in `heroes.ts` (fixed). FUZ-4 is another site.
- Code quality item 28: per-tick cost of `stepDefense`. FUZ-2 is another cause.
- XPL-03: league seasons and Alliance wars pay a capped catch-up after a long absence (seen as path dependence).
- Beast Mode SAV-03 / N24-SAV-7: unknown buildings and warriors are dropped at load (one mutated save lost a
  building entry this way).
- E16 (abandon as a lost attack), XPL-01 (`sanitizeBattleSetup`), XPL-10 (timer backdating): not re-tested beyond
  the fuzzer's random probes.
- The fixtures' resources above storage come from the fixture tool, not from the game.

## 6. Not done

- Chaos mode: clocks going backwards or non-finite, and the 16 non-player command types, beyond a 600-command
  smoke run.
- Cancel, skip, top-up, task, tier, stipend and seal commands were almost never applied by the random fuzzer, and
  the conservation loops completed only 309 pairs.
- Battle determinism across processes, engines, locales or `TZ`; only same-process reruns.
- Planned (preview) content: 16 battles.
- Automatic shrinking: reproducers were minimised by hand.
- Anything over HTTP or against Postgres.
