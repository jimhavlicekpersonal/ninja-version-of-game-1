# Retention and honest return hooks: investigator notes (key: retention, ids RET-)

Read-only pass over the code at commit `9bf76af` (clean tree), 2026-11-16. Versions per `docs/STATUS.md`: SIM_RULES 7, SAVE_VERSION 23, PROTOCOL 11, 50 ready languages.
Scratch scripts (all read-only, vite `ssrLoadModule` over the live sim and data): `docs/audit/understand-2026-11-16/scripts/retention/r1.mjs` (tasks, events, pass, reward relevance, achievements, trials, leagues), `r2.mjs` (reproductions), `r3.mjs` (maxed-army Trial battles).

"Verified" words used below: measured = a script ran the live code/data; reproduced = the defect was triggered through `applyCommand`/`advance`; read-in-code = file:line; inferred = reasoning from those.

## 1. Inventory: what exists today

| System | Data / code | Size | Repeats |
|---|---|---|---|
| Daily chest | `daily.json` chest, `sim/daily.ts`, `village.ts:1553` | 5 weighted outcomes, odds shown, EV 30,000 resources x Keep scale + 0.95 Jade/day | daily (UTC day) |
| Streak | `daily.json` streak | 7 steps, x1.0 to x1.6, +5 Jade at step 7 once per 7 days, 1 free skip a week, -1 step per missed day | tops out on day 7 |
| 28-day calendar | `daily.json` calendar, `sim/calendar.ts` | 28 fixed days, 45 Jade, Moonlit Shrine look on day 28 (40 Jade once owned) | identical every cycle |
| Daily tasks | `pass.json` dailyTasks, `sim/pass.ts` | 8 templates, 3 a day, 100 points each | every template seen in 6.6 days (measured) |
| Weekly challenges | `pass.json` weeklyChallenges | 7 templates, 3 a week, 400 points each | every template seen in 5.4 weeks |
| Season Scroll | `pass.json` | 30 tiers x 300 points, 30-day season, free + premium ($4.99), one look (`lantern_elder`) | identical every season |
| Events | `events.json`, `sim/events.ts` | 5 slots, 4 distinct (collect +30%, raid loot +20% twice, training -25%, Bounty Hunt) | 14-day loop, forever |
| Goal events | `sim/goalEvents.ts` | 1 kind (`bounty`), 4-step ladder, 300,000 resources x scale + 35 Jade | 72 h every 14 days |
| Achievements | `achievements.json` | 9 achievements, 44 tiers, 2,540 Jade, all cumulative counters | one-off |
| Shadow Trials | `trials.json`, `sim/trials.ts` | 60 tiers through Keep 15 (4 a Keep), then +6% power a tier; 2 modifiers | one-off per tier |
| Leagues | `ranks.json` | 8 leagues (0 to 5,200 honor), monthly chest, honor above 400 halved at reset | monthly |
| Next objective | `sim/objective.ts` | 8 kinds: chest, raid, upgrade, save, research, train, builders, none | n/a |
| Notifications | `notifications.json`, `sim/reminders.ts` | 12 types, 7 device reminder kinds, 4 a day, quiet hours 22-8 | n/a |
| Rival clans | `names.json` rivalClans, `sim/rivals.ts`, `battle.json` temper.rivals | 3 clans, tempers from Keep 5 | per opponent |

## 2. Measurements

### Tasks (r1)
- Daily: 8 templates over 8 stats (collectedAcorns, collectedDew, upgradesDone, troopsTrained, raidsWon, starsEarned, raidDestruction, researchDone). 400 seeded players x 120 days: every template seen after 6.6 days on average; identical set as the day before 1.8% of days; at least 2 of 3 repeat from the day before on 28.3% of days.
- Weekly: 7 templates; all seen after 5.4 weeks; identical to last week 2.8%; at least 2 of 3 repeat 36.7%.
- Collect targets are linear in Keep (`base 2000 + 3000 x (Keep-1)`), production is exponential: Keep 6 target 17,000 vs 619,200 Coins/day from mints at cap (2.7%); Keep 12 target 35,000 vs 10,177,056/day (0.3%). Two of eight daily templates complete on the first collect.
- Timer tasks drop out late: of the upgrade steps a Keep newly allows, those that fit one day: Keep 7 50/50, Keep 8 20/51, Keep 10 19/52, Keep 12 11/57, Keep 13 6/40, Keep 15 4/51 (median build time 168 h from Keep 10). Research steps that fit a day: Keep 12 38/58, Keep 15 27/127. `taskEligible` then removes them, so the late daily pool is about six templates.
- Walls: `village.ts:577` counts an instant upgrade in `upgradesDone`, and walls are instant (level 13 costs 134,765 Coins at Keep 15 against 6.2M loot a raid). `taskEligible` deliberately ignores walls ("would make the task a chore", `pass.ts:147-150`) but progress does not: "Finish 10 upgrades this week" is ten wall taps. Five Artisans x 168 h builds cannot finish 10 timed upgrades in a week, so at Keep 10+ walls are the only way.
- A task pays pass points only (`village.ts:1317-1329`, event `grants: {}`).
- No template uses: a Trial tier (daily), the Bounty, a rematch (`rematchesWon` exists), donations (`donations` exists), a 3-star, a declared stake, scouting, tempering, the hero, an Alliance War attack.

### Season Scroll (r1, r2)
- Points a day at full completion 471.4 (`passPointsPerDay`); 9,000 needed; finished in 19.1 of 30 days; 36% of earnable points (5,143 of 14,143) have no tier. At 75% completion still tier 30; 50% reaches tier 23; 33% tier 15.
- After tier 30, `claimTask` still adds points (`s.pass.points += task.points`), `unlockedTier` is capped at 30 (`pass.ts:30-32`): the claim button says "+100" and nothing happens.
- Free track: 90,000 Coins + 90,000 Provisions + 150 Jade (base). Premium: 313,500 + 270,000 + 340 Jade + 1 look.
- Rollover (reproduced): a village with 3,000 points, 10 tiers unlocked, none claimed; `advance` past `passSeasonEndsAt`: season 10 to 11, points 0, resources unchanged. Unlocked rewards are discarded (`pass.ts:306`). The panel says only "Season ends in {time}. Complete tasks to earn points and unlock tiers." (`messages.json:1376`). The rail badge counts claimable tiers (`hud.ts:590`), nothing warns of the loss.
- Same look twice (reproduced): premium, tier 15, `lantern_elder` already owned: `claimTier` returns ok with `grants: {}`. `passPremiumValue(...).skins` still lists `lantern_elder` for that owner (`pass.ts:87-88`), and the pitch says "the {look} look" (`messages.json:716`).

### What rewards are worth by Keep (r1; raid loot = regular campaign, `campaign.json`)

| Keep | Scale | Loot / raid | Chest EV at top streak (raids) | Free Scroll season (raids) | Premium resources (raids) | Calendar cycle (raids) | Bounty ladder (raids) | Trial tier (raids) | League win bonus at model honor |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 0.30 | 10,474 | 1.37 | 5.2 | 16.7 | 7.6 | 8.6 | 0.94 | Cedar 2,000 = 19.1% |
| 5 | 0.60 | 32,720 | 0.88 | 3.3 | 10.7 | 4.8 | 5.5 | 0.77 | Iron 10,000 = 30.6% |
| 6 | 1.00 | 58,792 | 0.82 | 3.1 | 9.9 | 4.5 | 5.1 | 0.99 | Iron 10,000 = 17.0% |
| 8 | 2.76 | 264,210 | 0.50 | 1.9 | 6.1 | 2.8 | 3.1 | 0.63 | Obsidian 40,000 = 15.1% |
| 10 | 8.02 | 685,986 | 0.56 | 2.1 | 6.8 | 3.1 | 3.5 | 0.72 | Ember 60,000 = 8.7% |
| 12 | 18.21 | 1,668,270 | 0.52 | 2.0 | 6.4 | 2.9 | 3.3 | 0.68 | Ember 60,000 = 3.6% |
| 14 | 67.85 | 5,256,749 | 0.62 | 2.3 | 7.5 | 3.4 | 3.9 | 0.82 | Storm 90,000 = 1.7% |
| 15 | 120.00 | 6,213,993 | 0.93 | 3.5 | 11.3 | 5.1 | 5.8 | 1.23 | Storm 90,000 = 1.4% |

Reading: everything that goes through `scaleReward` keeps its meaning to Keep 15 (the chest is half to one raid a day throughout). The exception is the league win bonus (`ranks.json` `winBonus`, `village.ts:1773-1782`), which is flat. A whole free Scroll season is worth two to three raids of resources; its value is the 150 Jade. One daily task is a third of a tier: about 2,500 x scale resources, 3 to 4% of one raid.

League chest (r2): Keep-scaled; at the regular model's honor it is 10 to 17% of full storage (Keep 15 Storm: 72.0M Coins of 490.9M storage), so it fits and is about 14 to 23 raids of loot once a month. Still meaningful.

### Events (r1)
- 5 schedule entries, 4 distinct names, 4 distinct effects, `periodDays` 14. Next 365 days: 26 or 27 of each. At least one event is running 67.9% of all hours. The only playable one (Bounty Hunt) runs 72 of every 336 hours.
- Windows (epoch Thursday 2026-01-01): Harvest Thu-Sat; Night of Raids Sun 12:00-Tue 12:00 (both weeks); Swift Feet Thu-Sat week 2; Bounty Sat-Tue week 2.
- No dated or seasonal entry exists; `EventsDef` (`types.ts:1114-1119`) has no way to express one. The server can only retime built-in ids (`src/backend/net/eventSchedule.ts`: "names, text, effects and goals are the built-in ones"). The panel text says "repeats every two weeks" (`messages.json:943`).
- `events.json`, `pass.json`, `daily.json`, `trials.json`, `ranks.json` are in the campaign fingerprint (`tools/balance/campaign.ts:126` PLAYED), so changing any of them makes `campaign-gates.test.ts` stale until `npm run balance:campaign` is re-run. `achievements.json` and `cosmetics.json` are not. None of them is in the combat fingerprint (`dataVersion.ts:76`: troops, buildings, battle).

### Achievements (r1 + campaign)
- 9 achievements, 44 tiers, 2,540 Jade. Stats used: collectedAcorns, collectedDew, raidsWon, starsEarned, upgradesDone, obstaclesCleared, hallLevel, researchDone, trialsCleared. Stats that exist and are unused: donations, defensesWon, rematchesWon, troopsTrained, raidDestruction (`types.ts:366`).
- Totals available: 777 building upgrade steps to max Keep 15 plus 1,625 wall levels; 750 research steps; 26 obstacles (never respawn, `obstacles.ts`).
- Regular model (4 sessions a day): Win 5/25/100/250 raids on days 0/6/29/78, 600 about day 191, 1,200 about day 383. Stars 15/75/300/750 on days 0/8/45/126, 1,800 about day 301, 3,600 about day 602. Keep 3/5/6/9/12/15 on days 0/4.2/9.4/28.4/51.2/113. Trial tiers 5/25/60 cannot come before days 0/16.6/113.
- Casual model (one visit a day): 25 wins day 33, 100 wins day 159, 250 about day 380, 1,200 about day 1,824; 3,600 stars about day 2,697.
- By day 14 a regular player has about 18 of 44 tiers (about 405 to 445 Jade). After Keep 15 the reachable remainder is raider 600/1,200, stargazer 1,800/3,600 and scholar 400: all "more of the same".
- `trial_walker` tier 4 asks for 100 tiers: unreachable (see Trials).
- `defensesWon` would be a dishonest goal today: the campaign's "Held" column is 0% at every Keep from 4 up, for the defender policy too (`CAMPAIGN.md`).
- A new achievement also needs an entry in `src/backend/platform/achievementIds.json` (`tests/backend/growth-client.test.ts:29-35` checks every tier is mapped).

### Shadow Trials (r1, r2, r3)
- Tier t: Keep `min(15, 1 + floor((t-1)/4))`, layout `LAYOUTS[(t-1) % 5]`, modifiers where `t % every === 0` (ironclad 5, elite 10).
- Aliasing (reproduced): every modifier tier (5, 10, ... 60) is `open_court`, which has 0 walls ("Buildings spread wide with no walls", `basegen.ts:126-128`). "Ironclad Walls: Walls have double HP" therefore never changes anything. The first alternate (`kunai_ring`) has 0 walls too. Wall counts elsewhere: tier 57 walled_keep 125, tier 58 mortar_core 65, tier 59 twin_gates 64.
- Past tier 60 power is x1.06 per tier: tier 61 x1.06, 65 x1.45, 70 x2.32, 80 x4.16, 100 x13.33. Reward is flat: 3,817,727 each at tier 60, 3,994,602 at tier 100; Jade over tiers 1-60 is 30.
- Where the ladder really ends (measured: the raid bots' Keep-15 army at full research with the Shadow Captain level 9, bot deployment plan, base variant 0 and 1, 4 deployment seeds each): tiers 55-63 all cleared at least once; 64 fail (best 1 star 46%); 65 clear; 66 fail; 67 and 68 one clear in eight; 70 fail (best 1 star 50%); 72 fail; 75 best 0 stars 30%; 80 best 0 stars 35%. A human plans better than the bot, so the practical top is somewhere around tier 65-72. The panel says "there is no top" (`messages.json:759`).
- The weekly "Clear 2 new Trial tiers" task is already limited to growth 1.1236 (`taskMaxGrowth`), the designers' own judgement that two tiers past 60 is the reliable limit.
- The panel shows only the next tier (`hud.ts:2147-2177`): no ladder, no milestones.

### Leagues (r1)
- Reset: honor above 400 is halved toward 400. 4,300 (Storm) becomes 2,350 (Obsidian); 5,200 (Kage) becomes 2,800 (Ember). A monthly climb of one to two leagues: a sound loop.

### Next objective (r2, read)
- `objective.ts:20-28`: chest, raid, upgrade, save, research, train, builders, none. Nothing for claimable tasks, Scroll tiers or achievements, a running Bounty with unpaid steps, the next Trial tier, Alliance War attacks left, a rematch that is open. With all Artisans busy and the army training the chip reads "Next Artisan free in {time}" (`ui.json:44`).

### Clocks (read)
- Chest, streak and stipend: UTC day (`daily.ts:38-45`, `village.ts:1554-1555` "(UTC)"). Tasks, weeks, calendar: local midnight (`calendar.ts:34-41`, `pass.ts:284`). Fresh-slate review H3 is still open. Since save v22 the chest draw also takes a salt rolled at each claim (`village.ts:1557-1568`), so the fixed UTC day is no longer what stops rerolling.

## 3. What a player has to look forward to (new, not seen before)

Regular (4 sessions a day; Keep days from `CAMPAIGN.md`):
- Day 3 (Keep 4, Keep 5 at day 4.2): tempering at Keep 5, three more warriors, the first full streak (day 7), calendar day 7 (10 Jade), two or three events not yet seen, the first Bounty Hunt, the first league chest, Trials to tier 16-20.
- Day 14 (Keep 6, Keep 7 at 16.6): the Shadow Captain at Keep 7, the calendar look on day 28, the Scroll's last tiers (done about day 19). Already exhausted: every event kind, every daily task template, the streak ladder.
- Day 45 (Keep 11): three or four warriors per Keep and one new building type (Longbow Yagura at Keep 12, day 51). Everything in the return-hook layer is on its second or third identical lap: calendar cycle 2 (day 28 is now 40 Jade), Scroll season 2 (same 30 tiers, the same look, which pays nothing), event loop 4.
- Day 120 (Keep 15 since day 113, 50 of 50 warriors): nothing new. Trials wall within a few tiers of 60. What remains: the monthly league climb, identical Scroll seasons, counter achievements measured in hundreds of raids, Alliance and Gang wars (server).

Casual (one visit a day): day 3 Keep 3-4; day 14 Keep 5 (12.7); day 45 Keep 6 (38.7); day 120 Keep 9-10. In the 26 days between Keep 5 and Keep 6 the only new things are tempering, the calendar look on day 28 and the fortnightly Bounty.

System unlocks by Keep (data): buildings 1: nine types; 2: Shuriken Tower, Alliance Lodge; 3: Firework Mortar, Spike Pit, Caltrop Field; 4: Sky Bow Tower; 5: Paper Lantern Line + tempering; 6: Repair Crane, Smoke Brazier; 7: hero; 8: Kite-Cutter Ballista; 12: Longbow Yagura; 9, 10, 11, 13, 14, 15: no new building type. Warriors: 6/1/3/4/3/3/4/3/3/4/3/3/4/3/3 per Keep. Built but not live (`planned.json`): 16 buildings, 3 heroes, mastery, hero choice.

## 4. Where variety comes from

Procedural: opponent bases (`generateOpponent`: 5 layout archetypes, level bias, loot range, counter placement), 3 rival clans whose tempers answer the player's recent armies from Keep 5 (`matchmaking.ts:182-220`), the Bounty fortress (per village and occurrence), Trial fortresses (deterministic per tier, median of 5 candidates, up to 4 alternates), the chest draw, the task pick, offline bot raids, settle-the-score rematches (once per bot raid, 72 h), the bot Alliance.
Fixed: the event schedule, the Scroll's tiers and look, the calendar, the streak ladder, achievements, leagues, the two Trial modifiers, the chest table.
Session-to-session variance in a raid's offer: the base itself, the opt-in declared stake (x1.1 at 2 stars, x1.25 at 3; nothing on a miss), the diversity carry (85-100%), +20% loot for 96 of every 336 hours. No daily or weekly raid modifier, no special target apart from the Bounty.

## 5. Dark-pattern check (must stay ethical)

Clean: chest odds before opening; draw fixed per day and salted; streak never wipes and is never sold; calendar loses nothing on a missed day; countdowns are pure functions of the schedule; notifications opt-in, per type, quiet hours, 4 a day; the objective chip never suggests anything paid; no Scroll sale in the last 4 days unless 15 tiers are unlocked; "≈ N Jade" counts only reachable tiers.
Not clean (found here): (1) unclaimed Scroll tiers are discarded at rollover with no warning, including paid premium ones (RET-03); (2) the paid track's look is advertised to someone who owns it and then pays nothing (RET-04); (3) an achievement that cannot be completed is shown forever (RET-06); (4) "there is no top" for a ladder whose top is about tier 65-72 (RET-06); (5) a claim button that does nothing after tier 30 (RET-02).

## 6. Problems (ordered; the same list goes in the structured output)

RET-01 high. Events: 4 kinds, 14-day loop, no dated or seasonal content, an event running 67.9% of hours.
RET-02 high. Season Scroll finished in 19.1 of 30 days; 36% of points have no tier; tasks pay nothing for the last 11 days of every season.
RET-03 high. Unlocked but unclaimed Scroll tiers are discarded at the season end (reproduced).
RET-04 high. The premium look repeats every season; a returning buyer's tier 15 grants nothing while the value estimate lists it (reproduced).
RET-05 high. Tasks: 15 templates over 9 stats, seen in a week, two of eight daily ones are no-ops by mid-game, upgrade tasks done with walls, none steers toward varied play.
RET-06 medium. Trials stop at about tier 65-72, rewards flat past 60, `trial_walker` 100 unreachable, text says "no top".
RET-07 medium. Ironclad Walls only ever lands on the wall-less layout (reproduced); two modifiers in total.
RET-08 medium. Achievements: nine counters, 18 of 44 tiers by day 14, three reachable goals after Keep 15.
RET-09 medium. No collection or completion layer is live; nothing new unlocks after Keep 8 except one building.
RET-10 medium. The objective chip dead-ends on "Next Artisan free in…".
RET-11 medium. Raids have no rotating context between sessions.
RET-12 medium. Two daily clocks (UTC chest and stipend, local tasks and calendar).
RET-13 low. Streak tops out on day 7; calendar and Scroll are identical from the second lap.
RET-14 low. League win bonus is flat: 15-31% of a raid at Keeps 4-8, 1.4-3.6% at Keeps 12-15.

Lower-priority items that did not fit:
- Event reminder body is built with `new Date(e.end).toUTCString().slice(0, 22)` inside a translated sentence (`reminders.ts:63`, key `sim.ends_utc_5598bc85ac`): an English date fragment in every language. S, I18N-free code fix (pass a timestamp and format in the reminder service).
- No device reminder for the calendar, a Scroll season about to end with unclaimed tiers, or a Bounty about to end with unpaid steps. The auto-claim in RET-03 removes the need for the second.
- "Defender" goals (hold N raids) are impossible while the campaign's held rate is 0% at Keep 4+; this rules out the audit's "Defender's Week" until defense balance changes (another investigator's area).
- Bounty fortress is per village (`bountyBase(state.seed, …)`), so two players cannot compare; fine for now, see the Gauntlet opportunity.
- The Trials panel shows one tier; a ladder view would make the 60 authored tiers read as a journey.
- The Events panel string "repeats every two weeks" is hard-coded text: changing `periodDays` means re-translating it.
- `currentTasks` builds English labels with `toLocaleString('en-US')` in the sim (`pass.ts:263`); the UI already rebuilds them (`economyUi.ts:512-515`). Harmless.
- The `events` notification type defaults off; reasonable.

## 7. Elements to protect (see structured output for the eight chosen)

Also worth protecting, though they belong to neighbouring areas: rival clans whose tempers answer the player's recent armies; declared stakes and the diversity carry (a real decision per raid); settle-the-score rematches; `nextObjective` never suggesting anything paid.

## 8. Dependencies and costs to keep in mind when fixing

- Any change to `pass.json`, `daily.json`, `events.json`, `trials.json` or `ranks.json` needs `npm run balance:campaign` (the fingerprint includes them), even when the model's results do not move.
- `claimTask`, `claimTier`, `openDailyChest`, `trialEnd`, `bountyEnd`, `claimCalendar`, `claimAchievement` are all in `PLAYER_COMMANDS` (`serverEconomy.ts:93-128`): a change to what they do is a change to what the server replays; deploy the server first.
- New StatKeys are a state change: bump `SAVE_VERSION` with a migration step.
- All 50 languages are listed as ready (`STATUS.md`), so each new English string is 49 translations. Looks are two colours each (`cosmetics.json` `cap`, `spots`): new looks need names only, no artist.
- Trial fortresses and the Bounty fortress accept `power`, `wallPower` and per-building `temper` today (`BaseLayout`, `temperBase`): new modifiers built from those need no battle-rules change.
