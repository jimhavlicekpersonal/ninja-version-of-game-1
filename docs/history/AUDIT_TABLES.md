# Fix tables from the November 2026 audits (history)

Moved verbatim out of the root `CLAUDE.md` (report section 5 step 10). Each row names its test; the tests stay the guard.

## Balance pass (20 fixes)

A review against how this genre is usually balanced found 20 game-theory holes and curve problems. Each fix has a test:

| # | Problem | Fix | Test |
|---|---|---|---|
| 1 | Home + Attack rerolled opponents for free | The scouted opponent is kept (`state.scout`) until it is attacked or Next is paid | `tests/gameplay/sim/matchmaking.test.ts` |
| 2 | Next fee shrank to <1% of loot | `scoutFeeByHall` is ~3% of a hall's average loot | same |
| 3 | Trophies didn't affect opponents | `src/gameplay/sim/matchmaking.ts`: strength = trophies / `trophiesPerHall`; it sets the opponent's hall, building levels and loot, kept within 1 hall below / 1 above | same |
| 4 | Trophies only went up | Opponents' trophies follow their strength, so running ahead of your hall makes wins pay less and losses cost more; win 24 / loss 20 at parity | same |
| 5 | Attacks ~100% / 3★ at every hall | Defense damage ×4.5, defense HP ×3, other buildings and hedges ×1.5; full army at matched strength now does ~55-75% | `tests/gameplay/balance/combat.test.ts` |
| 6 | Balance test assumed 55% loot | Model player fights real battles | `tests/gameplay/balance/progression.test.ts` |
| 7 | Shinobi (`hedgehog_roller`) best at everything | Re-tuned troop stats; no troop dominates another; mixed armies beat Shinobi (`hedgehog_roller`)-only | `combat.test.ts`, `curves.test.ts` |
| 8 | Bot raiders got weaker as you grew | Raiders are matched by your trophies and bring a full army at their hall's research cap (`attackerFor`) | `tests/gameplay/sim/raids.test.ts` |
| 9 | Checking in every 29 min avoided all raids | Raids sit at fixed per-hour slots on the clock (`raidTimes`); only time with the game open (plus a 2 min grace) or shielded is safe | same |
| 10 | Tasks counted started work (train/upgrade then cancel) | `troopsTrained` and new `upgradesDone` count finished work | `tests/gameplay/sim/research.test.ts` |
| 11 | Donating swapped cheap troops for expensive ones | Donating gives XP only; gifts are only troops your Dojo has unlocked | `tests/gameplay/social/social.test.ts` |
| 12 | Raid profit per Dew grew 1.3x → 9.6x | Troop training cost rises with level; ratio stays ~2-4.5x | `curves.test.ts` |
| 13 | Troops had no levels | Troop research in the Training Dojo (`burrow_barracks`) (`src/gameplay/sim/research.ts`), capped by `troopLevelCap` in hall.json | `research.test.ts` |
| 14 | Hall timer jumped 36x at hall 4 | Hall times grow ~2.7x per level (hall 10 would be ~7 days) | `curves.test.ts` |
| 15 | Hall cost multipliers shrank | 1k → 4k → 20k → 130k → 850k (x4, 5, 6.5, 6.5); the hall stores little | same |
| 16 | Collector payback went up and down | Paybacks rise every level and stay under a week | same |
| 17 | No cap on loot from storage; no penalty for hitting lower halls | `storageLootCapByHall`; `lootPenaltyByHallDiff` (client, bots and server) | `raids.test.ts`, `matchmaking.test.ts` |
| 18 | Shield always 12 h | 12/14/16 h at 30/60/90% (`shieldTiers`) | `raids.test.ts` |
| 19 | Alliance/league rewards flat across halls | Resources scaled by `rewardScaleByHall` (Jade (`moonstones`) not scaled) | `curves.test.ts` |
| 20 | Buying a hall level was cheap | Steeper skip and top-up curves; rushing hall 5→6 costs >3x the starting Jade (`moonstones`) | `curves.test.ts`, `economy.test.ts` |

Numbers in the spec below that these replaced (skip/top-up curve points, 0-3 raids per absence, 12-hour shield) are superseded by the data files.

## Gameplay audit (November 2026, 37 findings)

An external audit (simulated campaigns, 4,435 battles) found settlement, timer and online-authority bugs, AI and generator flaws, pacing walls and balance holes. Every finding has a fix and a test:

| # | Problem | Fix | Test |
|---|---|---|---|
| F01–F02 | Time skip and a free mock store in the normal build | Testing sandbox only (`?sandbox`): separate save, offline; public web store unavailable | `payments-sandbox.test.ts` |
| F03–F04 | Server accepted illegal bases and armies | Keep counts/levels, field allowlist, loot holders; earliest-Keep troops, camps vs Lodge, donated levels | `online-authority.test.ts` |
| F05 | Online loot banked before the server agreed | Attack recorded as pending; loot from the server's answer; refused = practice; idempotent tickets | same |
| F06, F19 | War attacks escaped interruption; no war replay | War battles tracked and settled once; kept in the battle log | same |
| F07 | Online raids took collector loot from storage | Losses split by building (re-simulated) | `audit-settlement.test.ts` |
| F08, F16, F17 | Research, task days, seasons not settled while open; overnight work lost from tasks | `advance` finishes timers in time order and settles seasons; `tick` covers research, days, seasons | same |
| F09 | Donated troop levels discarded | Lodge keeps a level per type; `BattleSetup.reinforcements` | same |
| F10, F21 | Counters active while upgrading; scouting disagreed | `activeInBattle` everywhere | same |
| F14, F15 | Overflow warnings inverted; chests reported unreceived resources | `banked` / `overflow` on records and events; warning before one-time claims | same |
| F18 | Replays changed after balance patches | `SIM_RULES` per record | `rules-version.test.ts` |
| F11–F13 | Cranes far from defenses; siege shot peripheral walls; healers stalled | Placement by coverage; breach only the wall in the way; support fallback | `audit-ai.test.ts` |
| F20 | Tutorial taught a smoke placement that protected nobody | Teach smoke over your warriors as they reach a tower | same |
| F22–F24 | Late three-star farming; ranged dominance; Thunder > Dragon Kite | Power-floor matchmaking; Thrower cut, DPS taxes, mid-Keep defenses; kite kits | `army-lab.test.ts`, `matchmaking.test.ts` |
| F25–F29 | 13 h refills; 6.7-year research; no batch/presets/dismiss | Dojo training speed, next-army queue, research lanes and one curve, batch, presets, retrain, dismiss, practice battles | `audit-pacing.test.ts`, `progression-model.test.ts` |
| F30–F32 | Impossible tasks; flat pass rewards; milestones ended at Keep 6 | Eligible tasks fixed per period; Keep-scaled pass; leagues to 5,200 honor; achievements to Keep 15 | `audit-pacing.test.ts` |
| F33 | Trial difficulty spikes | Median-strength fortress, layout factors, alternate fortress after a failure | `trials.test.ts` |
| F34 | Unequal war rosters | Equal rosters, side attack cap, destruction tiebreak | `online-authority.test.ts` |
| F35–F37 | Lab confound; narrow model player; formula-only tests | Effect-only counter comparison; defender/explorer/engaged policies and campaigns; outcome gates | `army-lab.test.ts`, `policies.test.ts` |

Details and remaining owner decisions: `docs/history/HANDOFF-2026-11-02.md` ("Gameplay audit fixes").

## Army overhaul (November 2026)

The Army panel, training queue and saving were traced end to end in a browser. Queue and save fixes have tests (`tests/gameplay/sim/army-queue.test.ts`, `tests/backend/persist/saveStore.test.ts`). Panel behaviour (A11–A13, A16, A19, A21) has no DOM test: there is no browser in `npm test`, so check it by hand.

| # | Problem | Fix |
|---|---|---|
| A1 | Finish training with more queued than the camps hold left timers ending before they began; the next load called the save damaged and started a new village | `skipTraining` keeps `startedAt <= endsAt`; `repairTrainingQueue` heals old saves on load |
| A2 | The wiped village sat in a hidden backup with no way back | `backups`/`restoreBackup`, offered at start-up and in Settings |
| A3 | A forgotten tab's 15-second autosave erased newer progress | Save revisions (`SaveConflictError`), a "taken over" screen, a save on becoming visible |
| A4 | A save from a newer build was replaced by a new village | `NewerSaveError` stops the boot and leaves the save alone |
| A5 | Fill bought two armies | `fillCount`: fill the camps; only then the next army (the button reads `Fill 20` or `Next 20`) |
| A6 | Finished warriors with no room showed `0s` forever | `armyView`: training / next / waiting stacks, with the reason in words |
| A7 | Cancelling the first warrior restarted every finished warrior and the one in training | `retimeQueue` moves only warriors who haven't started |
| A8 | A stale index could cancel the wrong warrior | `cancelTraining` takes the `troop`, and `count` for a whole stack |
| A9 | Jade paid for warriors who could only wait | `trainingSkipQuote` covers the warriors who fit |
| A10 | One redraw copied the village about 100 times; Fill froze the game for about a second | `armyView` settles once; `trainQuoteOn` and `researchStartQuoteOn` take a settled village |
| A11 | The whole panel rebuilt on every change: scroll jumped, taps were lost, dropdowns closed | `armyUi.ts`: pinned strip plus tabs, per-card rebuilds, none mid-tap |
| A12 | A new player saw an empty panel | Setup card names what's missing and links to Build |
| A13 | A long queue was one tile per warrior | Stacks with −1 and All |
| A14 | Refill toast said done after a partial refill | `train_short` event: how many are missing, and why |
| A15 | A new saved army could overwrite another after a delete; contents were tooltip-only | `nextArmyName`; contents shown |
| A16 | Dismiss was all or nothing | Dismiss 1 or all |
| A17 | The tutorial could stall on Finish training | The step ends when nothing more can be finished |
| A18 | No army status on the village screen, none on coming back, donated warriors invisible | Army pill, `summary.trained`, Lodge row |
| A19 | A warrior thumbnail asked for too early stayed blank | `thumbOf` remembers only real images |
| A20 | A finished warrior too big for the space left blocked everyone behind it, so free space sat empty | `finishTraining` lets anyone who fits walk past; `queueFits` is the same rule for quotes and the panel |
| A21 | "Army" meant space in one place and warriors in another; one line mixed both; the waiting warriors were listed last; timers and the missing Finish button went unexplained | Bar counts `Space`, everything else counts warriors; queue order; "needs N space", "Done in", "No room to finish" |
