# Time bombs and content integrity: audit report

Auditor lens: everything that works today and silently breaks or runs out later, and content or text that
contradicts the data or cannot be reached. Read-only. Repository head `4b79711`, 2026-11-27. The run was cut
short by a usage limit; section 1.3 lists what was not reached.

Scratch tests and scripts are kept in
`(session scratch, not kept)/timebomb/`
(`tests/*.test.ts`, `data_sanity.cjs`, `data_sanity.out`, `en_numbers.txt`, `en_data_numbers.txt`, `trial-loop.out`,
`known.sh` for the dedupe greps). `tests/_scratch_time/` was deleted; `git status` is clean.

## 1. What was covered

### 1.1 Time-driven systems: endless or finite

| System | Where | Schedule source | Endless? | Last date / what runs out |
|---|---|---|---|---|
| Season Scroll seasons | `sim/pass.ts` `passSeason`; `data/pass.json` `epoch` 2026-01-01 UTC, `seasonDays` 30 | epoch arithmetic | endless | none. `seasonSkins` (8) and `seasonNames` (12) are taken modulo the list: looks repeat from the 9th season a player buys (an owner gets `repeatJade` 60 instead), names after 12 |
| Season Scroll sale window | `pass.ts` `passSaleOpen` | derived from the season end | endless | none |
| 28-day calendar | `sim/calendar.ts`, `data/daily.json` `calendar` | one claim per local day, the list restarts | endless | the looks run out after cycle 6 (`skins` has 5), then day 28 pays 40 Jade for ever (by design; see DATA-3 for the text) |
| Event loop (13 windows) | `sim/events.ts` `eventsBetween`; `events.json` `epoch` 2026-01-01, `periodDays` 28 | epoch arithmetic | endless | none |
| Dated festivals (5 a year) | `sim/events.ts`, `events.json` `dated` (month, day) | `Date.UTC(year, month-1, day)` for every year | endless | none; key `<id>#<year>`; no festival on 29 February |
| Operator event schedule | `src/backend/net/eventSchedule.ts:40-41` | operator file; epoch bounded 2024-01-01 to 2100-01-01 | endless once set | none in practice |
| Alliance War | `data/social.json` `groveRaid.epoch` 2026-01-03 UTC, 48 h, weekly | epoch arithmetic | endless | returning player settled for at most `settleWeeksMax` 2 wars |
| Gang War | `social.json` `gangWar` (2 h prep, 22 h battle) | started by players | n/a | none |
| League (honor) seasons | `sim/ranks.ts` `seasonOf` = UTC year x 12 + month | UTC calendar month | endless | catch-up pays at most `seasonCatchUpMax` 2 chests |
| Daily chest, streak, skip week | `sim/daily.ts` (`chestDay`; week = floor(day / 7)) | day index from the Scroll epoch, player's own day | endless | none |
| Chest milestone looks | `village.ts` `openDailyChest`, `daily.json` `chestLooks` 30/100/200/365 | lifetime counter | finite by design | last look at 365 chests |
| Daily and weekly tasks | `pass.ts` `rollPeriods` | local day index | endless | none |
| Clan Stipend | `sim/stipend.ts` | local day index, 30 payments | per purchase | none |
| Under-18 monthly cap | `sim/monetization.ts` `monthOf` | UTC calendar month | endless | none |
| New-player shield | `village.ts:294`, `raids.json` 24 h | absolute timestamp | n/a | none |
| Simulated raids | `sim/defense.ts` `raidTimes` | hourly slots from the Unix epoch, seeded | endless | at most `maxRaidsPerCatchUp` 3 per catch-up |
| Shadow Trials | `sim/trials.ts`, `data/trials.json` | tier number | endless in name | power capped at 1e9 by a bounded loop: no overflow or NaN at tier 1e6 or 2^53; practical ceiling tier 58 (known) |
| Device token rotation | `src/backend/net/connection.ts:126` 30 days | client-driven | n/a | the old token keeps working until a rotation is confirmed; extra tokens unused 400 days are signed out (`server/core/links.ts:111`) |
| Server retention | `server/core/retention.ts` | hourly job, idempotent, batched | n/a | replays 30 days, late raid reports 72 h, dormant anonymous accounts 730 days (owner policy) |
| Server tables | `server/migrations/*.sql` | epoch milliseconds in `bigint` | no 2038 problem | no `timestamp` column of either kind; `integer` holds counters, day/week indices, cents and levels only |
| Apple receipt root | `server/payments/apple.ts:22` Apple Root CA G3 fingerprint | pinned, env override `APPLE_ROOT_CA_SHA256` | until 2039 | replaceable without a release |

No schedule in `src/gameplay/data` is a finite list of dates, so there is no "day after the last entry". Hard-coded
years in shipped code: `eventSchedule.ts:40-41`, `clock.ts:19` (the test clock's default), `public/legal-config.js:59`
(`policyUpdated`, filled into the privacy pages), and third-party copyright lines in `public/licenses.html`.

### 1.2 Content integrity covered

Achievement ceilings (all 21) recomputed from data and from 3,000 new villages; level tables of the 25 live buildings
and 50 warriors; Keep limits; the 42 looks and their sources; daily chest odds by computation and Monte Carlo of the
real roll; every English warrior, counter, event, festival, contract and war description that states a number,
against `src/gameplay/data` and the server constants; Jade per dollar across packs; offers against their text;
the Codex pairs and whether any live data file names a not-live id.

### 1.3 Not reached (budget)

Art manifest and sound keys for live items (the manifest's shape did not fit a quick id match: inconclusive, not
reported), the tutorial script against current costs, the honesty invariants other than chest odds (generated
opponent labels, close-call notes), the returning player with a 12-month-old app end to end (protocol floor, dropped
battle rules: read only, not exercised), server job catch-up after downtime, name-pool exhaustion, text column
lengths, DST and week-numbering edge days beyond reading the code.

## 2. Ranked new findings

| ID | Severity | Confidence | Title |
|---|---|---|---|
| TIME-1 | MEDIUM | high (reproduced) | One session with the device date ahead freezes a device-held village after the date is corrected: no production, chest, calendar, new tasks or paid Clan Stipend for as long as the error, while every countdown says "tomorrow" |
| DATA-1 | MEDIUM | high (reproduced) | Closed but still broken (P3-06): a Trial catch-up clear counts as one tier, so Trial Walker's upper steps become unreachable for good |
| DATA-2 | MEDIUM | high (computed) | Master Artisan's last step (1,000 upgrades, 100 Jade) cannot be reached: 775 upgrades exist since walls stopped counting; the reachability test still counts walls |
| TIME-2 | LOW | loop: high; server reach: medium (read) | A work loop sized by the saved best Trial tier: `validateVillage` has no upper bound, and at Keep 15 the task check runs one multiplication per tier |
| DATA-3 | LOW | high (read) | The calendar's fixed line "Day 28 gives a Keep look" is false from the seventh cycle on, when day 28 pays Jade |

## 3. Findings

### TIME-1 (MEDIUM, confidence high): a wrong device date, once corrected, freezes a device-held village

- Where: `src/gameplay/sim/offline.ts:38-39` (`awayMs = max(0, now - from)`, nothing else compares the save to the
  clock), `src/gameplay/sim/resources.ts:41` (`Math.max(0, to - from)`: no production until `accrueFrom`),
  `sim/daily.ts` `chestReady` / `nextChestAt`, `sim/calendar.ts` `calendarView` / `claimCalendarDay`,
  `sim/stipend.ts` `stipendStatus`, `sim/pass.ts` `rollPeriods` (`day > state.tasks.day`),
  `sim/ranks.ts` `rollSeasons`, `src/gameplay/control/controller.ts:158` (load path).
- Relation to the known lists: E11 (`docs/audit/areas/03-04-economy-monetization-game-theory.md:30`) and
  `understand-2026-11-16/exploits.md:270` record that a device village has no clock detection and that moving the
  clock forward pays rewards. Neither records what happens to the village afterwards. The root cause is known; the
  lock-out, the paid product inside it and the wrong countdowns are new.
- Scenario (reproduced with a fake clock, `clock-jump.test.ts`): a device-held village; on one day the phone's date
  is a year ahead (typed wrong after a reset, or set ahead for another game) for a five-minute session in which the
  player opens the chest, claims the calendar day and a Clan Stipend payment and starts one upgrade. The date is then
  corrected. The next real day:

  | What | State after the correction |
  |---|---|
  | Daily chest | refused "You've opened today's chest"; stays refused for 365 days; `nextChestAt` shows tomorrow every day |
  | 28-day calendar | `lastDay` 690 against today's 326: refused for 364 days, "ready tomorrow" |
  | Clan Stipend ($2.99, 28 payments left) | "Today's stipend is already claimed. Come back tomorrow." for a year |
  | Daily and weekly tasks | `tasks.day` 690: the same three tasks until the real date catches up |
  | Coin Mint | `accrueFrom` in 2027: produces nothing for a year (4,800 stored today and 30 days later) |
  | The upgrade started in that session | ends 2027-11-22: the Artisan is busy for a year unless cancelled |
  | Scroll and league season | stored season 23 against the real 10; league season 2027-11: no rollover, no league chest for a year |

  The lock lasts exactly as long as the error (a day ahead locks a day). Nothing repairs a save whose stamps are
  after the clock, and a device village gets no warning: the clock note added for SAV-13 needs a server hello.
  A session with the date behind (one day or 400 days) was also run: claims stay closed, nothing is wiped, and the
  village recovers when the date is fixed; only the welcome-back screen reports the wrong time away.
- What the player sees: a village that looks alive but pays nothing, with countdowns that reset to "tomorrow" each
  day, and a bought stipend that cannot be claimed. Support sees a refund request with no explanation in the save.
- Suggested fix: on load (next to `repairTrainingQueue`), when stamps are later than now by more than a slack,
  pull them back: day and week indices (`daily.lastDay`, `calendar.lastDay`, `stipend.lastDay`, `tasks.day/week`,
  `pass.season`, `season`) to today's, collector `accrueFrom` and `raidCheckAt` to now, and running timers shifted
  by the same offset. Tell the player once that the device date changed. Keep it out of the server path (the server
  already clamps command times). This also removes the reward for the forward jump only if paired with E11's
  owner decision; it does not need it.
- Limits: sim functions driven directly with a fake clock, not the app. Server-held villages are not affected.
  How often real devices carry a wrong forward date is not known; the damage per case is the reason for MEDIUM.

### DATA-1 (MEDIUM, confidence high): Trial catch-up clears count as one tier

- Where: `src/gameplay/sim/village.ts:2320` (`s.stats.trialsCleared++` in the first-clear branch of `trialEnd`),
  `sim/trials.ts` `trialCatchUpTier`, `sim/achievements.ts` (reads `stats.trialsCleared`),
  `data/achievements.json` `trial_walker` `[[5,20],[25,40],[40,75],[53,100]]`.
- Status in the known lists: the P3-06 prompt (`docs/prompts/BEAST_MODE_2026-11-16.md:1396-1408`) requires the
  catch-up clear to add every skipped tier to `stats.trialsCleared` and names the test. P3-06 is recorded done
  (`docs/store/WORLDWIDE_AUDIT.md:1041`, `understand-2026-11-16/PROGRESS.md:71`). The code adds 1, and the existing
  test (`tests/gameplay/sim/trials.test.ts:245-258`) never clears the tier. Closed, still broken.
- Scenario (reproduced through the real `trialEnd`, `trial-catchup.test.ts`):

  | Keep | Catch-up tier offered | Best after the clear | `trialsCleared` | Most the counter can ever reach (ceiling tier 58) |
  |---|---|---|---|---|
  | 5 | 9 | 9 | 1 | 50 |
  | 10 | 29 | 29 | 1 | 30 |
  | 15 | 49 | 49 | 1 | 10 |

  The app always offers the catch-up tier (`attemptTier`, `src/app.ts:245`, `src/presentation/ui/hud.ts:301`), so
  the lower tier cannot be chosen. A player whose Keep outruns Trial progress by more than five tiers in total can
  never claim the 53-tier step (100 Jade); a Keep 10 late starter also loses the 40-tier step (75 Jade).
- What the player sees: Trials panel "tiers 1 to 29 cleared"; the achievement at 1 of 5, with steps that cannot fill.
- Suggested fix: add `tier - s.trials.best` instead of 1, add the test the prompt names, and repair saves on load
  (`trialsCleared = max(trialsCleared, trials.best)`). The Trial tasks read the same counter: decide whether a
  catch-up clear should also finish "Clear 2 new Trial tiers", or give tasks their own counter.
- Limits: the clears used 400 level-capped Shinobi placed by the test helper; the counter does not depend on the army.

### DATA-2 (MEDIUM, confidence high): Master Artisan's 1,000-upgrade step is unreachable

- Where: `data/achievements.json` `busy_beaver` ("Finish {n} upgrades", stat `upgradesDone`, last step 1,000 for
  100 Jade); `sim/village.ts:377` (timed upgrades) and `:677` (instant ones, walls / decorations / obstacles left
  out since the exploit audit of 2026-11-20); `tests/gameplay/balance/achievements-reachable.test.ts:35-36`.
- Why: every wall level and decoration builds in 0 seconds, and those no longer count. What still counts at the
  Keep 15 limits: 763 placements and levels across the 19 other building types plus 14 Keep levels, less the two
  Artisan's Huts a village starts with: **775**. There is no sell or remove command, so nothing repeats. The test
  still computes its ceiling with walls in it (2,424), so it passes. Not in any known list.
- What the player sees: a fully maxed Keep 15 village stuck near 775 of 1,000. Villages that counted wall levels
  before 2026-11-20 keep them, so two identical villages show different progress.
- Suggested fix: lower the last step to what the data allows with margin (about 700), or count walls for the
  achievement through a separate counter; make the test's ceiling use the exclusion in `village.ts:677`.
- Limits: computed from `hall.json` and the two code paths; not played through.

### TIME-2 (LOW): a loop sized by the saved best Trial tier

- Where: `src/gameplay/sim/pass.ts` `taskEligible`, case `trialsCleared` (`for (let i = 0; i < beyond; i++) growth *= ...`,
  no cap, unlike `trialInfo`); `src/gameplay/sim/save.ts:431` (`trials.best` only has to be a non-negative integer).
  P1-17 replaced `Math.pow` here with the loop.
- Scenario (timed, `trial-loop.test.ts`): a Keep 15 village with `trials.best` 1e8 passes `validateVillage` and
  `taskEligible` takes 295 ms for one template (1e7: 48 ms; a day-and-week roll at 1e7: 163 ms). The cost is linear:
  1e12 is about 50 minutes, 9e15 never returns. `rollPeriods` runs it at each day roll, inside `advance`. Below
  Keep 15 the Keep check returns first and the loop never runs.
- Reach: no legitimate village gets there (ceiling about tier 58). A forged save does. On a device that is
  self-inflicted. On the server the same code replays stored villages (`server/core/villageReplay.ts:88`,
  `villageImport.ts:372`) and `villageImport.ts` has no Trial bound, so an imported Keep 15 village (the import rule
  needs an account about 60 days old) would stall its replay at each day roll. The server path was read, not run.
- Suggested fix: stop the loop once `growth` passes `taskMaxGrowth` (it can only grow), and refuse a
  `trials.best` above a generous bound in `validateVillage`.
- Also seen: `trialReward(1e6)` is 21.6 billion of each resource; harmless because grants are storage-capped.

### DATA-3 (LOW, confidence high): "Day 28 gives a Keep look" is false from the seventh cycle

- Where: `locales/en/ui.json` `calendar.about`, shown unconditionally at `src/presentation/ui/dailyUi.ts:82`;
  `sim/calendar.ts` `calendarReward`; `data/daily.json` `calendar.skins` (5 looks) and `repeatJade` 40.
- Scenario: after 168 claimed days (six cycles; about five and a half months of daily play) day 28 gives 40 Jade.
  The grid shows Jade on day 28 while the line above it still promises a look. A text that is true at launch and
  wrong later, in all 50 languages.
- Suggested fix: two keyed lines chosen by whether the next day-28 reward is a look.

## 4. Checked and found sound

- Daily chest odds: shown 30 / 30 / 20 / 15 / 5 %; measured 30.12 / 29.97 / 19.98 / 14.95 / 4.97 % over 400,000
  draws of the real `chestOutcome`, and within 0.4 points over 20,000 consecutive days for each of four seeds.
  `chestOdds` and the roll read the same weights. (`mixSeed(a, b)` depends only on `a XOR b`, so two villages'
  chests are shifted copies of each other; the odds are unaffected.)
- No finite date list: seasons, events, festivals, wars, leagues and the calendar compute from an epoch or the
  UTC calendar for any year.
- Server columns: times are `bigint` milliseconds, `revision`, `seq` and ledger ids `bigint` / `bigserial`.
- A device date set behind: claims stay closed, nothing re-opens, nothing is wiped.
- Time zone: the stored offset changes at most once in 7 days; moving west only delays the next claim.
- Token rotation after a long absence: client-driven, the old token stays valid until a rotation is confirmed.
- Text against data, all matching: 16 warrior descriptions, Smoke Bomb, Shadow Captain, the five live counters,
  seven event and five festival bonuses and lengths (Plunder Moon's "all weekend" is a Saturday and Sunday in every
  28-day period), five contracts, Elite Garrison 20%, the 24-hour shield, Gang War 2 h / 22 h / 2 attacks / half
  damage / 2 to 4 members, duel and Gang rejoin 24 hours, the 72-hour late-report limit, Alliance Lodge at Keep 2.
- Jade packs: Jade per dollar rises at every price step (45.5 to 75.0); no larger pack is worse value.
- Level tables: no cost, HP, damage or build-time regression; Keep limits never regress; no level above the
  Keep 15 cap; each warrior's level count equals its research cap (750 research steps against Scholar's 400).
- Obstacles: 26 placed in 3,000 of 3,000 new villages. Looks: 22 earnable without paying against Many Colours' 15.
- No live data file names a not-live building or hero; the Codex pairs name live ids only; the retired
  `offer_rebuild` is not in `storeProductIds` (13 products).

## 5. Already known, skipped

- Clock forward pays per-day and per-month rewards on a device village; no clock detection (E11, exploits.md:270).
- No client-server time sync (SAV-13).
- Trials' practical ceiling of tier 58 and the old 100-tier step (RET-06 / P1-06).
- League season (UTC month) and Scroll season (30 days) being two different seasons.
- Yearly Play target-API check (owner calendar item), `macos-26` runner (P7-06), Node pin (`.node-version`).
- Offline war chests for missed weeks (E12), dormant-account deletion (owner policy).
