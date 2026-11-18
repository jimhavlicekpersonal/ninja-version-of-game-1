# Progress ledger for `docs/prompts/BEAST_MODE_2026-11-16.md`

One row per work item that has been started (prompt section 3.9). An item not listed is `todo`. A session that
starts reads this first and **revalidates a `done` row against the code before building on it**; a session that
runs out of context writes its state here before stopping.

Statuses: `todo`, `doing`, `done`, `partly done`, `reverted`, `skipped: no longer true`, `open: needs owner`.

## Session of 2026-11-17 (before the prompt was handed to a coding session)

The owner asked for five findings to be fixed at once. They are parts of five items of the prompt. Nothing else in
the prompt has been started. No `SIM_RULES`, `SAVE_VERSION` or protocol change was made, and no new English string:
the notices reuse labels the catalog already has in every language.

On 2026-11-18 three independent reviewers were set against those commits, and what they found was fixed in
`0e836f2`, `dc89fc6` and `d888c7e` (section "Review of 2026-11-17" below). The rows here describe the code
after both rounds.

| Item | Status | Commits | What was done | What is left of the item |
|---|---|---|---|---|
| P1-11 (XPL-01) | partly done | `656d169` | `trustedSetup` in `sim/village.ts`: `trialEnd`, `bountyEnd` and `rematchEnd` rebuild the setup from the record's seed, army, levels, reinforcements, own hero (id and level checked against `heroFor`) and mastery; `infiltration` always on; `startDamage` and every other field dropped. A Trial clear, a Bounty step and a rematch win need `foughtWithWarriors`. These three are the only battle commands a server-held village may send that pay anything, so the server-side mint is closed. | The same setup is not yet used in `groveBattleEnd`, `abandonBattle` and the ticketless `battleEnd` (none is a paying player command on a server-held village: `battleEnd` and `groveBattleEnd` are not in `PLAYER_COMMANDS`, `abandonBattle` wins nothing). The eleven test files the item lists were therefore not touched. `checkBattleSetup` itself still returns a message, not a sanitized setup. |
| P1-12 (XPL-02) | partly done | `656d169` | `battleBegan`: a record's own time counts only inside `raids.battleResumeHours` (72) after a battle's length; older is refused in `bountyEnd` and `rematchEnd`. `bountyEnd` refuses an occurrence earlier than the one stored in `state.goalEvent`. | `groveBattleEnd` (device only) still uses `min(now, record.at)`. |
| P1-13 (XPL-03) | partly done | `656d169` | `ranks.json` `settleSeasonsMax` 6 (`rollSeasons` softens honor for the skipped seasons and pays at most six chests); `settleRaids` computes the last ended war week instead of counting; `validateVillage` refuses a fractional `season` or `settledWeek`. Import (`checkProvenance`): unconfirmed Clan Stipend Jade goes to the import hold, `topUp` shares are stripped from timers, the season is never behind the server's clock. | `armyPaid` is not stripped and a timer's `cost` is not clamped to the catalog on import. `validateVillage` does not bound `season` and `settledWeek` against `createdAt` and `lastSeenAt` (the catch-up caps limit the payout instead). |
| P1-01 (RET-03, ECO-02) | done, differently | `b9f8f09` | `settlePassSeason` in `advance`, before `rollPeriods` at both call sites: every unlocked, unclaimed tier is paid through `grantReward` at its `passTierKeep`; premium grants are recorded on the purchase, so a refund takes them back. `advance` returns `rewards`; `applyCommand` reports them with the command that first crossed the season end; `GameController.tick` emits them; `OfflineSummary.scroll` lists them. The paid events carry the source `pass_end:<track>:<tier>`. | The item asked for a saved `pass.lastSeason` and about two new strings. Neither was added: the summary is carried by the events (no save change), and the toast and the welcome-back line are built from three existing labels ("Season Scroll · Rewards · Claimed"). A written sentence is a Phase 6 string. |
| P2-01 (DEF-01, DEF-02, ECO-01) | partly done | `4f62f7f`, `d888c7e` | `raids.json` `carryByStars` `[0.2, 0.5, 0.8, 1]` and `defenseWin` `{ shareOfRaidLoot: 0.10, perStar: true }`, typed in `RaidsDef`; the carried amount is floored (no fractional resources); simulated raids only. A raid that brought no warrior moves no honor and pays nothing. The battle log calls a reward "Held!" only when no star was lost, otherwise "Reward:". Measurements below. | The slow gate test the item asks for (net per raid never falls with build quality at Keeps 9, 12, 15; loss per day never rises) is not written: `tests/gameplay/sim/defense-loot.test.ts` covers the rule and one Keep 9 comparison only. Real-player raids pay honor only (the three limits are not built; the ask is in `docs/backend/REQUESTS.md`). The "kept X of Y" log line is Phase 6. |

### P2-01 measurements (from the raid records: `result.loot` taken, `banked` reward), share 0.10

Per raid, 24 raids a cell, generated layouts, the raider the game sends today, 6 hours in the collectors
(`scripts/defense-raids/hold_live.ts`, outputs `hold_live_30.out` and `hold_live_100.out`). "Before" is the rule
until 2026-11-17 (the raider carries everything, a full hold pays 5%). Net is reward minus loss, Coins and
Provisions together.

| Keep | Build | Stars 0/1/2/3 | Before: net | Now: loss | Now: reward | Now: net | Now: net with storages full |
|---|---|---|---|---|---|---|---|
| 5 | level 1, no walls | 88/13/0/0% | −46 k | 12 k | 7 k | −6 k | −15 k |
| 5 | bottom of the Keep's range | 88/8/4/0% | −32 k | 9 k | 7 k | −2 k | −11 k |
| 5 | middle | 88/13/0/0% | −47 k | 12 k | 7 k | −6 k | −14 k |
| 5 | caps | 96/4/0/0% | −68 k | 15 k | 7 k | −8 k | −13 k |
| 9 | level 1, no walls | 0/0/0/100% | −940 k | 940 k | 0 | −940 k | −940 k |
| 9 | bottom | 21/25/42/13% | −561 k | 377 k | 41 k | −336 k | −360 k |
| 9 | middle | 79/4/17/0% | −469 k | 167 k | 69 k | −98 k | −114 k |
| 9 | caps | 100/0/0/0% | −441 k | 96 k | 79 k | −17 k | −39 k |
| 12 | level 1, no walls | 0/0/0/100% | −3.82 M | 3.82 M | 0 | −3.82 M | −3.82 M |
| 12 | bottom | 50/17/29/4% | −2.03 M | 1.10 M | 206 k | −891 k | −926 k |
| 12 | middle | 83/13/4/0% | −1.78 M | 533 k | 271 k | −262 k | −326 k |
| 12 | caps | 96/4/0/0% | −1.68 M | 396 k | 287 k | −108 k | −211 k |
| 15 | level 1, no walls | 0/0/0/100% | −22.25 M | 22.25 M | 0 | −22.25 M | −22.50 M |
| 15 | bottom | 17/29/50/4% | −13.55 M | 8.90 M | 1.01 M | −7.88 M | −8.30 M |
| 15 | middle | 75/13/13/0% | −10.68 M | 3.62 M | 1.68 M | −1.94 M | −2.39 M |
| 15 | caps | 92/4/4/0% | −9.79 M | 2.63 M | 1.84 M | −794 k | −1.51 M |

Per day, three villages a cell, 20 days each, through the real raid schedule (`scripts/defense-raids/daily_live.ts`
with `SEEDS=11,22,33`; outputs `daily_live_30.out`, stores 30% full at each visit, and `daily_live_0.out`, stores
emptied before logging off):

| Keep | Build | Visits a day | Raids a day | Held | Lost a day (30% full) | Reward a day | Net a day (30% full) | Net a day (stores emptied) |
|---|---|---|---|---|---|---|---|---|
| 9 | caps | 1 | 1.43 | 86% | 0.17 M | 0.10 M | −0.07 M | +0.03 M |
| 9 | caps | 4 | 1.98 | 87% | 0.19 M | 0.14 M | −0.04 M | +0.10 M |
| 9 | middle | 1 | 1.17 | 60% | 0.21 M | 0.07 M | −0.14 M | 0.00 M |
| 9 | middle | 4 | 1.92 | 57% | 0.29 M | 0.12 M | −0.17 M | +0.07 M |
| 12 | caps | 1 | 1.32 | 96% | 0.55 M | 0.38 M | −0.17 M | +0.12 M |
| 12 | caps | 4 | 2.10 | 98% | 0.60 M | 0.61 M | +0.01 M | +0.44 M |
| 12 | middle | 1 | 1.23 | 54% | 0.95 M | 0.28 M | −0.68 M | −0.08 M |
| 12 | middle | 4 | 1.97 | 50% | 1.33 M | 0.43 M | −0.90 M | +0.16 M |
| 15 | caps | 1 | 1.75 | 100% | 3.47 M | 3.36 M | −0.11 M | +2.45 M |
| 15 | caps | 4 | 2.18 | 100% | 3.76 M | 4.19 M | +0.43 M | +3.68 M |
| 15 | middle | 1 | 1.38 | 80% | 4.30 M | 2.44 M | −1.85 M | +1.62 M |
| 15 | middle | 4 | 2.05 | 80% | 5.72 M | 3.62 M | −2.10 M | +3.07 M |

Against the item's results:

1. Net per raid improves with every step of build quality at Keeps 9, 12 and 15. At Keep 5 it does not (−6 k,
   −2 k, −6 k, −8 k): every build there holds about nine raids in ten, the amounts are a few thousand, and the
   harness fills the bigger storages of a better build with more to lose. Recorded, not tuned.
2. Loss per day for a one-visit player falls from middle to caps at all three Keeps (0.21 M to 0.17 M, 0.95 M to
   0.55 M, 4.30 M to 3.47 M). The one-village sample of 2026-11-17 showed a rise at Keep 15; with three villages
   it does not. A caps base is still raided more often (1.75 a day against 1.38) because it earns no shield
   (DEF-06, P2-05).
3. A base at caps with room in storage nets −22%, −37% and −41% of one full hold's reward a raid at Keeps 9, 12
   and 15: under the +35% bound, and not a profit.
4. A level-1 village at Keeps 9, 12 and 15 loses exactly what it lost (940 k, 3.82 M, 22.25 M).
5. Rewards per day for a base at caps, four visits a day: 0.14 M, 0.61 M and 4.19 M at Keeps 9, 12 and 15. The
   regular campaign player loots about 2.7 M, 6.7 M and 24.9 M a day there (about four raids a day times the loot
   per raid in `docs/game-theory/CAMPAIGN.md`), so 5%, 9% and 17%: under 20%. The share was 0.12 on 2026-11-17 on
   a one-village reading of 18.5%; three villages gave 20% (the reviewer's `def-farm2-B15.out`), so it is 0.10.
6. Nobody is worse off in any cell.

Not a result of the item, and worth knowing: a player who empties the stores before logging off loses little
and keeps the reward (last column). At Keep 15 that is 2.5 to 3.7 M a day for a caps base, which is 40 to 60% of
the loot of one regular raid there (6.2 M). It is bounded by result 5 and is the intended pay for a maxed
defense, but it is the largest number here and the first to re-check if raid loot or the raider changes.

Limits: one layout generator, scripted raiders, 24 raids a cell per raid and three villages of 20 days a cell
per day. No person defended anything.

### Harness changes

- `scripts/defense-raids/hold_live.ts` (new): per-raid loss, reward and net for four build qualities, read from the
  records, comparing the rule before the change with a candidate given on the command line. Outputs:
  `hold_live_30.out`, `hold_live_100.out`.
- `scripts/defense-raids/daily_live.ts` (new): the per-day version of the same, through the real raid schedule.
- `scripts/defense-raids/review-2026-11-17/` (new): the defense reviewer's probes as left (`def-lib.ts`,
  `def-farm1.ts` with its packer of a village no raider can enter, `def-farm2.ts`) and their outputs at a share of
  0.12, before the entry-room rule. The packed village of `def-farm1.ts` is the one
  `tests/gameplay/sim/entry-room.test.ts` builds: a raid on it now moves no honor and pays nothing.
- `def_econ.ts` and `def_daily.ts` are unchanged and now misreport, as the prompt warns: their "proposed" columns
  apply the carry a second time.

## Review of 2026-11-17 (2026-11-18)

Three reviewers attacked the three commits above; the closure record of 2026-11-18 in
`docs/store/WORLDWIDE_AUDIT.md` lists every finding and what was done. What a later session needs:

**Fixed** (`0e836f2`, `dc89fc6`, `d888c7e`): R3-01 to R3-12 except the achievement counters, SCR-01, SCR-03,
SCR-04, SCR-06, SCR-07, SCR-08, a village no raider can enter (the entry-room rule), and the hold reward's share
(0.12 to 0.10).

**Open, with the reproduction to start from** (the reviewers' probe files are in the session scratchpad and are
not kept in the repository, except the defense probes under `scripts/defense-raids/review-2026-11-17/`):

| Id | What | Why it is open | Where to start |
|---|---|---|---|
| R3-12 (part) | A forged file with achievement counters one step under a tier pays on the first real action after a move: at most 840 Jade, once per account | Needs a baseline per achievement kept by the server, so only progress made there counts (a field in the village, so a save change, or a server table) | `checkProvenance`, the achievements loop |
| R3-13 | The free hero with one Shinobi clears low Trial tiers (5 at Keep 7, 8 at Keep 10, 21 at Keep 15), each paid once | A design question: `foughtWithWarriors` asks for one warrior. A share of housing or of damage would be a rule the player must be told | `trialEnd`; P1-15 of the prompt touches the same rule |
| R3-14 | A rematch counts for up to 144 hours after the raid when its record is backdated inside `battleResumeHours` | Pays once per raid either way; tighten together with P2-09 | `rematchEnd`, `rematchStatus` |
| R3-15 | A game older than `656d169` counts a hero-only Trial clear the server no longer counts, stays a tier ahead, and has later tiers refused | `trials.best` is not in the economy a correction carries; asked of BACKEND | `docs/backend/REQUESTS.md` 2026-11-18, open ask 2 |
| SCR-02 | A Scroll refunded before its season ends and reinstated after it never pays its unclaimed premium tiers (180 Jade, 1,080 Coins and 900 Provisions in the reproduction) | Needs the unclaimed tiers stored on the refunded purchase: a save change with a migration | `revokePurchase`, `reinstatePurchase`; do it with the pass's one save bump |
| SCR-05 | One advance across the Scroll's end and the league's end pays the league chest first, so what a later refund takes back depends on whether the game ticked in between (resources and the economy hash end equal) | Needs both boundaries on `advance`'s timeline in time order | `advance` in `sim/village.ts` |
| SCR-09 | The server's ledger merges the Scroll payout into whatever command crossed the season's end | Server change in `villageReplay.ts`, asked of BACKEND | `docs/backend/REQUESTS.md` 2026-11-17, correction |
| — | The place and move refusal for the entry-room rule says "That spot isn't free." | Its own sentence needs every language (Phase 6) | `closesEntry` in `sim/village.ts` |
| — | The defense reviewer did not finish: the record and replay checks of its brief (points 3 and 6) were not run by anyone | Stopped on a usage limit | its brief is in the session's workflow script; re-run before the next defense change |

### Things the next session must know

- `advance` now returns `rewards`. Any new caller that settles time for a player should surface them.
- `tests/architecture/unused-exports.test.ts`: `goalEventByKey` and `raidWeek` left the allow-list (both are used).
- The campaign was re-run after these changes (`docs/game-theory/CAMPAIGN.md`). The model player still never
  upgrades a defense, so its "0% held" and its pace are unchanged by P2-01; P2-04 is what makes the campaign see it.
