# Progress ledger for `docs/prompts/BEAST_MODE_2026-11-16.md`

One row per work item that has been started (prompt section 3.9). An item not listed is `todo`. A session that
starts reads this first and **revalidates a `done` row against the code before building on it**; a session that
runs out of context writes its state here before stopping.

Statuses: `todo`, `doing`, `done`, `partly done`, `reverted`, `skipped: no longer true`, `open: needs owner`.

## Session of 2026-11-17 (before the prompt was handed to a coding session)

The owner asked for five findings to be fixed at once. They are parts of five items of the prompt. Nothing else in
the prompt has been started. No `SIM_RULES`, `SAVE_VERSION` or protocol change was made, and no new English string:
the notices reuse labels the catalog already has in every language.

| Item | Status | Commits | What was done | What is left of the item |
|---|---|---|---|---|
| P1-11 (XPL-01) | partly done | `656d169` | `trustedSetup` in `sim/village.ts`: `trialEnd`, `bountyEnd` and `rematchEnd` rebuild the setup from the record's seed, army, levels, reinforcements, own hero (id and level checked against `heroFor`) and mastery; `infiltration` always on; `startDamage` and every other field dropped. A Trial clear, a Bounty step and a rematch win need `foughtWithWarriors`. These three are the only battle commands a server-held village may send that pay anything, so the server-side mint is closed. | The same setup is not yet used in `groveBattleEnd`, `abandonBattle` and the ticketless `battleEnd` (none is a paying player command on a server-held village: `battleEnd` and `groveBattleEnd` are not in `PLAYER_COMMANDS`, `abandonBattle` wins nothing). The eleven test files the item lists were therefore not touched. `checkBattleSetup` itself still returns a message, not a sanitized setup. |
| P1-12 (XPL-02) | partly done | `656d169` | `battleBegan`: a record's own time counts only inside `raids.battleResumeHours` (72) after a battle's length; older is refused in `bountyEnd` and `rematchEnd`. `bountyEnd` refuses an occurrence earlier than the one stored in `state.goalEvent`. | `groveBattleEnd` (device only) still uses `min(now, record.at)`. |
| P1-13 (XPL-03) | partly done | `656d169` | `ranks.json` `settleSeasonsMax` 6 (`rollSeasons` softens honor for the skipped seasons and pays at most six chests); `settleRaids` computes the last ended war week instead of counting; `validateVillage` refuses a fractional `season` or `settledWeek`. Import (`checkProvenance`): unconfirmed Clan Stipend Jade goes to the import hold, `topUp` shares are stripped from timers, the season is never behind the server's clock. | `armyPaid` is not stripped and a timer's `cost` is not clamped to the catalog on import. `validateVillage` does not bound `season` and `settledWeek` against `createdAt` and `lastSeenAt` (the catch-up caps limit the payout instead). |
| P1-01 (RET-03, ECO-02) | done, differently | `b9f8f09` | `settlePassSeason` in `advance`, before `rollPeriods` at both call sites: every unlocked, unclaimed tier is paid through `grantReward` at its `passTierKeep`; premium grants are recorded on the purchase, so a refund takes them back. `advance` returns `rewards`; `applyCommand` reports them with the command that first crossed the season end; `GameController.tick` emits them; `OfflineSummary.scroll` lists them. The paid events carry the source `pass_end:<track>:<tier>`. | The item asked for a saved `pass.lastSeason` and about two new strings. Neither was added: the summary is carried by the events (no save change), and the toast and the welcome-back line are built from three existing labels ("Season Scroll · Rewards · Claimed"). A written sentence is a Phase 6 string. |
| P2-01 (DEF-01, DEF-02, ECO-01) | partly done | `4f62f7f` | `raids.json` `carryByStars` `[0.2, 0.5, 0.8, 1]` and `defenseWin` `{ shareOfRaidLoot: 0.12, perStar: true }`, typed in `RaidsDef`; the carried amount is floored (no fractional resources); simulated raids only. The battle log calls a reward "Held!" only when no star was lost, otherwise "Reward:". Measurements below. | The slow gate test the item asks for (net per raid never falls with build quality at Keeps 9, 12, 15; loss per day never rises) is not written: `tests/gameplay/sim/defense-loot.test.ts` covers the rule and one Keep 9 comparison only. Real-player raids pay honor only (the three limits are not built; the ask is in `docs/backend/REQUESTS.md`). The "kept X of Y" log line is Phase 6. |

### P2-01 measurements (from the raid records: `result.loot` taken, `banked` reward)

Per raid, 24 raids a cell, generated layouts, the raider the game sends today, 6 hours in the collectors
(`scripts/defense-raids/hold_live.ts`, outputs `hold_live_30.out` and `hold_live_100.out`). "Before" is the rule
until 2026-11-17 (the raider carries everything, a full hold pays 5%). Net is reward minus loss, Coins and
Provisions together.

| Keep | Build | Stars 0/1/2/3 | Before: net | Now: loss | Now: reward | Now: net | Now: net with storages full |
|---|---|---|---|---|---|---|---|
| 5 | level 1, no walls | 88/13/0/0% | −46 k | 12 k | 8 k | −4 k | −14 k |
| 5 | bottom of the Keep's range | 88/8/4/0% | −32 k | 9 k | 8 k | −1 k | −10 k |
| 5 | middle | 88/13/0/0% | −47 k | 12 k | 8 k | −4 k | −13 k |
| 5 | caps | 96/4/0/0% | −68 k | 15 k | 8 k | −7 k | −12 k |
| 9 | level 1, no walls | 0/0/0/100% | −940 k | 940 k | 0 | −940 k | −940 k |
| 9 | bottom | 21/25/42/13% | −561 k | 377 k | 49 k | −328 k | −353 k |
| 9 | middle | 79/4/17/0% | −469 k | 167 k | 83 k | −84 k | −106 k |
| 9 | caps | 100/0/0/0% | −441 k | 96 k | 95 k | −1 k | −31 k |
| 12 | level 1, no walls | 0/0/0/100% | −3.82 M | 3.82 M | 0 | −3.82 M | −3.82 M |
| 12 | bottom | 50/17/29/4% | −2.03 M | 1.10 M | 248 k | −850 k | −900 k |
| 12 | middle | 83/13/4/0% | −1.78 M | 533 k | 325 k | −207 k | −299 k |
| 12 | caps | 96/4/0/0% | −1.68 M | 396 k | 345 k | −51 k | −191 k |
| 15 | level 1, no walls | 0/0/0/100% | −22.25 M | 22.25 M | 0 | −22.25 M | −22.50 M |
| 15 | bottom | 17/29/50/4% | −13.55 M | 8.90 M | 1.22 M | −7.68 M | −8.15 M |
| 15 | middle | 75/13/13/0% | −10.68 M | 3.62 M | 2.02 M | −1.60 M | −2.19 M |
| 15 | caps | 92/4/4/0% | −9.79 M | 2.63 M | 2.21 M | −426 k | −1.36 M |

Against the item's results:

1. Net per raid improves with every step of build quality at Keeps 9, 12 and 15. At Keep 5 it does not (−4 k,
   −1 k, −4 k, −7 k): every build there holds about nine raids in ten, the amounts are a few thousand, and the
   harness fills the bigger storages of a better build with more to lose. Recorded, not tuned.
2. Loss per day for a one-visit player, caps against middle (`daily_live.ts`, one village, 20 days, storages 30%
   full at each visit): Keep 15 3.87 M against 3.10 M (the middle village also held every raid in this sample,
   and the caps village was raided 1.65 times a day against 1.35), Keep 12 0.42 M against 0.57 M, Keep 9 0.10 M
   against 0.15 M. So result 2 holds at Keeps 9 and 12 and is **not shown at Keep 15**: a better base is raided more
   often because it earns no shield (DEF-06, P2-05), and with the reward counted the two villages end the day
   level (−0.07 M and +0.01 M). Re-measure with more than one village after P2-05.
3. A base at caps with room in storage nets −1%, −15% and −18% of one full hold's reward at Keeps 9, 12 and 15:
   under the +35% bound, and not a profit.
4. A level-1 village at Keeps 9, 12 and 15 loses exactly what it lost (940 k, 3.82 M, 22.25 M).
5. Rewards per day for a base at caps, four visits a day: 0.19 M, 0.77 M and 4.61 M at Keeps 9, 12 and 15. The
   regular campaign player loots about 2.7 M, 6.7 M and 24.9 M a day there (about four raids a day times the loot
   per raid in `docs/game-theory/CAMPAIGN.md`), so 7%, 11% and 18.5%: under 20%. At 0.15 Keep 15 came to about
   23%, which is why the share is 0.12.
6. Nobody is worse off in any cell.

Limits: one layout generator, scripted raiders, 20 to 24 raids a cell per raid and a single village per cell per
day. No person defended anything.

### Harness changes

- `scripts/defense-raids/hold_live.ts` (new): per-raid loss, reward and net for four build qualities, read from the
  records, comparing the rule before the change with a candidate given on the command line. Outputs:
  `hold_live_30.out`, `hold_live_100.out`.
- `scripts/defense-raids/daily_live.ts` (new): the per-day version of the same, through the real raid schedule.
- `def_econ.ts` and `def_daily.ts` are unchanged and now misreport, as the prompt warns: their "proposed" columns
  apply the carry a second time.

### Things the next session must know

- `advance` now returns `rewards`. Any new caller that settles time for a player should surface them.
- `tests/architecture/unused-exports.test.ts`: `goalEventByKey` and `raidWeek` left the allow-list (both are used).
- The campaign was re-run after these changes (`docs/game-theory/CAMPAIGN.md`). The model player still never
  upgrades a defense, so its "0% held" and its pace are unchanged by P2-01; P2-04 is what makes the campaign see it.
