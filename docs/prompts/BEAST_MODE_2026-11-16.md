# Agent prompt: the replayability, game-theory, economy and publishability pass

Written 2026-11-16 against commit `9bf76af` (the tip of `main` and of `claude/gracious-meitner-4k0h0d` that day).
The evidence behind every instruction is in [`docs/audit/understand-2026-11-16/`](../audit/understand-2026-11-16/README.md):
ten investigator reports, their structured findings and the measurement scripts they ran.

How far to trust it: this prompt was reviewed twice. In the first round four independent reviewers checked about 900
of its claims against the code and the reports and returned 85 corrections. In the second round four more made about
1,175 checks and returned 82 issues (6 blockers, 31 major, 45 minor); each read the whole corrected prompt for one
question: invariants and sequencing, completeness against the reports, whether an agent can execute it, and whether
the first round's corrections are themselves right. Both rounds are applied, and where two reviewers proposed
different fixes for one passage Appendix B says which was chosen. Several instructions taken from the reports could
not have been executed as written; they are marked where they occur. Neither round ran the campaigns, the full test
suite on a changed tree, Postgres or the Node build the server image pins, and the tests this prompt names as pinned
are the ones its reviewers found, not a complete list. The revalidation step of section 0.3 is therefore not a
formality.

Update 2026-11-18: the owner asked for five findings to be fixed before this prompt was handed over, and those
fixes were then attacked by three independent reviewers and corrected. Parts of P1-01, P1-11, P1-12, P1-13 and
P2-01 are therefore already in the code, together with things this prompt did not ask for: a rule that a layout
must leave attackers a way in (`sim/entryRoom.ts`), a hardened village import, and a list of what the reviewers
found that is still open. The ledger
[`docs/audit/understand-2026-11-16/PROGRESS.md`](../audit/understand-2026-11-16/PROGRESS.md) says exactly what was
done and what is left of each, and sections 3.9 and P2-01 below point to it.

Paste everything below the line into a new agentic coding session with full repository access. The work is ordered.
Do the phases in order, one commit per work item, and report measurements after each phase. A phase may take a whole
session; the progress ledger (section 3.9) lets a later session pick up where an earlier one stopped.

---

You are working on **Kagemura: Ninja Clans**, an original ninja-clan base-building and raiding game in TypeScript
(Phaser 3.90, Vite, Vitest, a Fastify server, Capacitor 8 for iOS and Android, 50 languages). The repository is
unusually disciplined: a deterministic battle simulator the server re-runs, versioned saves and battle rules,
model-player campaigns with gates, and an audit trail with closure records. Your job is to make the game much more
replayable and compelling, fix its game-theory, economy and strategy problems, and close every publishability gap
that code can close, without damaging what already works.

The owner's request, verbatim:

> Go insane and make the game insanely replayable and addictive and fix all of the games game theory economy and
> strategy problems. If the game has some genius elements don't change anything!!!!! Make it 100% publishable turn
> over every stone

Read that as four orders, in this priority when they conflict:

1. **Protect what is excellent.** Section 2 lists it. Those systems keep their shape. You may change a number inside
   one only where a work item below says so.
2. **Fix what is broken or dishonest.** Defects first (a paid reward that vanishes, an achievement nobody can
   finish), then dominated and dead choices (defense that protects nothing, warriors worth more without their
   ability), then pacing walls.
3. **Add depth and reasons to return.** Honest ones only (section 1.2).
4. **Close the distance to a store release.** Everything code and repository content can do. What only the owner
   can do goes into one checklist, never into a claim of readiness.

This document is long because the work is wide. It is not a wish list: most work items name their evidence, the
files and data keys to change, how to measure it, the tests to add and the result that makes it done. An item
without a "Done when" line is done when the tests it names or implies exist and fail on the code before the change,
the checks of 3.8 pass and, for a screen, its screenshots at the four sizes are in the record. Where an item says
"measurably" or "about" without a number (P2-03, P2-07, P2-10), write the number in the ledger before you measure,
and make it at least the noise of section 4 (10 points of destruction, 2 days). Where the prompt gives a number to
ship, that number is a **starting value from a measurement on 2026-11-16**. You re-measure before and after, and the
acceptance result decides, not the starting value.

## 0. How to work

### 0.1 Read first, in this order

1. `CLAUDE.md`, `AGENTS.md`, `docs/STATUS.md` (generated: the only source for version numbers).
2. `docs/store/WORLDWIDE_AUDIT.md`: the owner objective at the top, the open findings (GLOBAL-001, 006 markets, 007,
   008, 015, 017, risks R01 to R10), and the last six closure records, to learn the record format you will write in.
3. `docs/DECISIONS.md` in full. It is the design intent behind almost everything you will touch.
4. `src/gameplay/CLAUDE.md`, `src/presentation/CLAUDE.md`, `src/backend/CLAUDE.md`, `locales/CLAUDE.md`,
   `compartments.json`, and `docs/localization/README.md`, which root `CLAUDE.md` names as the complete translation
   scope. Do not load its `INVENTORY.json` whole: query it by path for the surfaces outside the catalogs that this
   pass touches (local notifications S34, server push S35, native resources S40, store text).
5. `docs/audit/understand-2026-11-16/README.md`, then the report for the phase you are starting. The reports carry
   the tables and the reasoning this prompt compresses.
6. `docs/game-theory/CAMPAIGN.md` and `ARMY_BALANCE.md` (generated; the numbers every balance claim is held to),
   `docs/game-theory/rules10/README.md` and `SESSION_2026-11-15.md` (the last designer's lab work and its limits).

Line numbers in this prompt and in the reports are those of `9bf76af`. They drift. Find code by symbol name.

### 0.2 Your role and its limits

You are the **INTEGRATION** session of `AGENTS.md`, with the owner's request as authority to change gameplay,
interface, backend, tools and locales in one pass. That widens which files you may edit. It does not suspend any
rule:

- `tests/architecture/boundaries.test.ts` still decides who may import whom (`compartments.json`). `sim/` stays pure:
  no DOM, no Phaser, no `Date.now()`, no `Math.random()`, nothing imported from outside `src/gameplay/`.
- Commit per compartment where a work item spans several (data and sim, then control, then UI, then server, then
  locales), so each commit can be reviewed by the session that owns that lane.
- When a change alters what the server replays or accepts, write the entry in `docs/backend/REQUESTS.md` even though
  you also make the server change yourself. The file is the record of what must deploy together.
- Never push to `main`. Work on the branch your session was given. Do not open a pull request unless the owner asks.
- No new runtime dependencies, no font downloads, no web payment path and no analytics field that can hold free text
  without a new owner decision (`docs/DECISIONS.md`, `src/backend/CLAUDE.md`).

### 0.3 The loop for every work item

1. **Revalidate.** Read today's code and confirm the problem still exists as described. The reports were right on
   2026-11-16; they are not the code. If a finding no longer holds, write that in the ledger and skip it.
2. **Measure the "before".** Run the harness the item names (section 4) and keep the output.
3. **Write the failing test first** where the item is a defect: a test that fails on today's code for the reason
   the report gives.
4. **Change the smallest thing** that meets the acceptance result. Every balance number lives in
   `src/gameplay/data/*.json`; no magic numbers in code.
5. **Measure the "after"** with the same harness and the same seeds. Compare against the acceptance result.
6. **Run the checks the item touches** (section 3.8 says which).
7. **Commit** with a message that names the finding ids (`DEF-01`, `PAC-01`, ...) and states the before and after
   numbers in one line.
8. **Update the ledger** (section 3.9).

When a measurement disagrees with this prompt, the measurement wins. Pick the value that meets the acceptance
result. If no value meets it, revert the item, record the numbers and leave it open. A reverted item with numbers is
a better result than a shipped guess.

### 0.4 Things you never do to get green

- Never lower a gate, widen a band or add an entry to `KNOWN_BELOW` so a change passes. A gate moves only when the
  work item says the old target was wrong and gives the new one with its measurement. Two items re-baseline on
  purpose and say so: P4-08 (the army-lab cells, once, for a change of seed count on untouched data) and P3-01 with
  the close of Phase 4 (a gate that P2-04 or P2-14 set from its own first run).
- Never skip, `.skip`, quarantine or delete a failing test. Fix the cause or revert the change. An existing
  assertion changes only when the rule or number it pins is exactly what a work item changes. Then update it in the
  same commit and write the test, the old value and the new value in the ledger. Where an item names a test and says
  it authorises the change, that is what the reviewers found, not the whole list: you will meet others (P3-01, for
  example, also meets `tests/gameplay/sim/resources.test.ts` "stop at 8 hours of output"). An assertion never
  changes for any other reason: not because a side effect of the change moved it, not to make room for a faster
  result. If a test fails and the rule it pins is not the one the item changes, the change is wrong.
- Three windows on the regular model are not movable by any item of this pass: Keep 15 between 100 and 140 days
  (`campaign-gates.test.ts`), and Keep 3 between 40 and 80 minutes and Keep 6 between 9 and 17 days
  (`tests/gameplay/balance/progression.test.ts`, slow suite). The last one has almost no room left: P3-01 has the
  numbers.
- Never edit a file under `server/rules/v*/`, an applied migration in `server/migrations/`, or a generated file by
  hand (`docs/GENERATED.md` lists them; regenerate with the named command).
- Never hand-edit a pinned hash to match (`rules-version.test.ts`, `aura-cache.test.ts`, the campaign fingerprint).
  A pin changes only as the last step of the procedure that is allowed to change it (section 3).
- Never quote a version number, a test count or a balance figure from memory or from this prompt in a document you
  write. Generate it or measure it.

### 0.5 Use helpers, and check their work

- Use sub-agents for work that is wide and independent: one language per translator (section 13), one reviewer per
  finished phase, parallel readers when you need to map a subsystem. Give each a complete brief; they know nothing
  you do not tell them.
- After each phase, have a fresh reviewer that did not write the code try to refute it: re-run the phase's
  measurements from the committed tree, read the diff against section 2 (did anything protected change shape?) and
  against section 3 (was every procedure followed?). The 2026-11-14 records in the audit show why: every batch that
  was verified independently had real defects found in it.
- The machine may have few cores. `npm test` takes about two minutes and the campaigns several more. Do not run two
  heavy jobs at once, and do not let sub-agents run the full suite in parallel.

## 1. What "replayable and addictive" means here

### 1.1 The loops, and what is missing in each

A base-builder is replayed through nested loops. Each has a specific hole today, measured in the reports. Every work
item below closes one of these holes; if a change you are considering does not, it does not belong in this pass.

| Loop | What should pull the player | What is missing today (evidence) | Closed by |
|---|---|---|---|
| 30 seconds: decisions inside a raid | Choices whose effect is felt and learnable | The entry point is worth 16 to 21 destruction points and scouting cannot predict it; formation is worth 10 to 20 and has no screen; Smoke is worth 2 to 3 points; Rally is worth 0 (`combat.md` 1, 4, 5) | Phases 4 and 6 |
| 5 minutes: one raid and its result | A result that teaches and invites one more | No review of what another approach would have done; declared stakes are a losing button; nothing rotates between sessions (`combat.md` 1, `defense-raids.md` DEF-09, `retention.md` RET-11) | Phases 2, 5, 6 |
| A session: 2 to 10 minutes | Always one thing that pays | After two raids nothing pays for 50 to 100 minutes; the result screen ends in "Return home"; the next-objective chip dead-ends on "Next Artisan free in..." (`pacing.md` 3, RET-10, UIS-01) | Phases 3, 5, 6 |
| A day | Varied tasks that mean something | 15 task templates, all seen within a week, two of eight daily ones complete on the first collect, tasks pay nothing for the last 11 days of a season (`retention.md` 2) | Phases 1, 5 |
| A week | An appointment | Four event kinds on a 14-day loop, one playable event for 72 of 336 hours (`retention.md` RET-01) | Phase 5 |
| A month | A season worth finishing | The Scroll is identical every season, its paid look repeats, unclaimed tiers vanish; the league win bonus fades to 1.4% of a raid (`retention.md` RET-02 to 04, RET-14) | Phases 1, 2, 5 |
| Months: the long horizon | Goals that outlast Keep 15 | Nothing new after day 113; the "endless" Trials end near tier 68; Keeps 9, 10, 13, 14, 15 unlock no building; no collection layer is live (`pacing.md` 2, 4; `retention.md` 3) | Phases 1 (the Trial tail), 3, 5, and the built-not-live work in Phase 4 |
| The defender's game | Building a base is a decision with a payoff | A held raid still loses a third of everything raidable and is paid 5 to 11% of that back; a stronger base is raided more often (`defense-raids.md` 1.3, 1.4) | Phase 2 |
| The first hour | A raid within minutes | First raid after about 14 minutes and two idle waits without Jade; storage full after raid 1; the first Keep 3 raid is a loss; "Skip tutorial" sits over the Army button (`pacing.md` 3, `playthrough.md`) | Phases 3, 6 |
| The casual player | Progress on one visit a day | Keep 5 to 6 takes 26 days because raids take back 105% of what the collectors produce (`pacing.md` 1) | Phases 2, 3 |

Under all of them sits integrity. A ladder, a chest or a league means nothing if it can be minted: `exploits.md`
reproduced three ways to do that on a server-held village today. Phase 1 closes them before anything is added.

### 1.2 "Addictive" stays inside the project's own rules

The invariants in root `CLAUDE.md` ("Honesty", "Money and minors", "Return hooks stay ethical", "Privacy") are not
obstacles to this pass. They are the product's identity and its store-review defence. Compelling here means mastery
with a visible ceiling, variety, decisions that matter, and honest reasons to come back. It never means:

- anything random that is sold, or any paid way to open, reopen, reroll or repair a chest, a streak or a calendar;
- a countdown that is not a pure function of a schedule, a fake "almost", a close-call note that is not true;
- a streak, calendar or season mechanic that takes something away for a missed day (one existing defect does exactly
  that: Phase 1 fixes it);
- an offer that pops up for a minor or an unstated age, a price outside the Store and its confirm step;
- a notification the player did not opt into, or more than `maxPerDay`, or inside quiet hours;
- a goal the game shows but the player cannot reach (two exist today: Phase 1 fixes them).

Every new return hook you add gets a line in `docs/DECISIONS.md` "Engagement features (and their limits)" saying
what it is and which of these limits it keeps.

## 2. Protected: what must not change

The owner's instruction is absolute here. These are the systems the ten investigators independently named as the
reasons the game is worth finishing. Keep their mechanism, their guarantees and their tests. Numbers inside them
change only where a work item names the number.

### 2.1 Simulation and integrity

1. **The deterministic fixed-step battle simulator** (`src/gameplay/sim/battle/battle.ts`: `SIM_RULES`, `stateHash`,
   `runBattle`): seed plus deployments, 10 ticks a second, only + − × ÷ and √, replayed by the server in worker
   threads, identical on three runtimes (two V8 versions under Node 22 and 24, and JavaScriptCore under Bun) when
   measured on 2026-11-16 (`publish.md` 1c).
2. **Versioned battle rules with archived, digested snapshots** (`server/rules/v*/`, `manifest.json`,
   `tools/release/rules-snapshot.mjs`, `check-server-rules.mjs`) and the server-first release gate.
3. **Abilities as deployments** (`isAbility`, `useAbility`): Smoke, squad orders, replays and the server check all
   ride one recorded path.
4. **The built-not-live hook pattern**: code behind data values live data does not set, so live battles run the
   same arithmetic (`sim/plannedContent.ts` `withPreview`, `battle.crowding`, `wallHp`, `damageSpread`).
5. **Versioned saves that never lose a village** (`sim/save.ts`): a migration per version, `repairTrainingQueue` on
   every load, one writer per village, damaged saves kept and offered back, a newer save stops the boot.
6. **Server-owned truth** (`sim/serverEconomy.ts`, `server/core/`): seeds issued by the server, every battle
   re-simulated, `PLAYER_COMMANDS` replayed with `economyHash`, receipts verified, the under-18 cap atomic.
7. **The refund ledger**: purchases keep what they delivered, a refund becomes a debt that income repays, a reversed
   refund returns exactly what was taken, cancels refund a top-up's share as Jade.

### 2.2 Battle design

8. **Infiltration Points with cover of one third of the army** (`sim/battle/infiltration.ts`, `battle.json`
   `infiltration`): one short rule that forces three squads and creates the largest real decision in a raid.
9. **Tempering shown at scouting, and rival clans that answer the player's last ten raids** (`sim/battle/temper.ts`,
   `battle.json` `temper.rivals` and `temper.offers`, `matchmaking.ts` `opponentForRank`).
10. **Non-stacking auras, poison and burning; companions that split their owner's budget; shared jam immunity**
    (`sim/battle/warriors.ts`).
11. **Counters with counter-play**: stealth until the first strike and the Lantern that lights it; Kite-Cutter
    grounding with an immunity window; wall-breakers that break only the wall in the way.
12. **The honest hero**: free, no housing, level set by the Keep, never sold, and a battle with no warriors is
    rejected. P1-15 narrows the last clause on purpose: a battle with nobody deployed stays rejected, and a started
    raid fought by the hero alone becomes a lost attack.
13. **One power budget for every warrior, with live data pinned to it** (`data/progression.json`,
    `sim/progression.ts`, `tests/gameplay/balance/progression-model.test.ts`): power is the root of HP times DPS,
    ×1.4 a tier, ×1.16 a level, with costs that outgrow power. Phase 4 changes kits and a few listed taxes. It does
    not replace the model.
14. **The army lab with outcome gates and a listed-not-hidden gap list** (`tools/balance/armyLab.ts`,
    `tests/gameplay/balance/army-lab.test.ts`, `KNOWN_BELOW`).

### 2.3 Raids, matchmaking and honor

15. **The raid clock** (`sim/defense.ts` `raidTimes`): slots fixed on the real clock, seeded by the village, so the
    same save meets the same raids and splitting an absence dodges nothing.
16. **Matchmaking by earned research strength with per-Keep slack** (`matchmaking.ts` `attackerStrength`,
    `researchKeep`, `opponentFor`; `ranks.json` `powerSlackByKeep`). The sandbagger campaign proves holding research
    back does not pay.
17. **Staked honor** (`sim/ranks.ts`, `defenseHonorLossShare` 0, `perTrophyBelow`): being raided costs no honor, and
    a win against lower honor pays less, down to nothing.
18. **Exhausted stores and exposure targeting** (`defense.ts` `exhaustionFactor`, `server/core/pvp.ts` `byExposure`).
19. **The rematch structure** (`sim/rematch.ts`): the raider's own base rebuilt from the record, once, within 72
    hours, labelled simulated. Only its payout is wrong (Phase 2).
20. **Loot provenance and bounded loss**: loot leaves the building that held it, 20% of storage under a per-Keep
    cap, a debt is never deepened, and the first three raids on a new village are softened.
21. **Declared stakes, the diversity carry and the paid Next with clans that differ in loot**: the structure of each
    stays. Phase 2 changes the stake multipliers (P2-08), the Keep the Next fee is priced by (P2-11) and adds the
    one-role exemption to the carry (P2-15), nothing else.

### 2.4 Economy and monetization

22. **Top-ups as "exact and immediate"** (`topUp` with its action, `topUpQuote`): no open exchange, the action runs
    in the same command, a failure buys nothing.
23. **The Clan Stipend as a consumable**: missed days are never lost, no stacking, old stipends keep their rate.
24. **Offer rules**: adults who said so only, one a session, real deadlines, the Starter Pack first, the Store shows
    exactly what will be delivered.
25. **Keep-scaled fixed rewards** (`economy.json` `rewardScaleByHall`, `sim/economy.ts` `scaleReward`) with Scroll
    tiers scaled by the Keep they unlocked at (`pass.tierKeep`): measured, no scaled reward decays to nothing.
26. **Rewards that report what was granted and what overflowed, and warn before a chest that would not fit.**
27. **The next-army queue** (`sim/army.ts`, `economy.json` `queuedArmies`) and **army refill held under two hours at
    every Keep** by the Dojo. Do not turn the refill into a timer to be sold.

### 2.5 Return hooks

28. **The daily chest and streak**: odds shown before opening, a seeded and salted draw, never sold, a missed day
    steps back one and never wipes.
29. **Adaptive tasks, checked for feasibility and frozen when the period begins** (`sim/pass.ts` `taskEligible`,
    `rollPeriods`, `taskTarget`).
30. **Task days at the player's own midnight and a calendar that loses nothing** (`sim/calendar.ts`).
31. **Events as a pure schedule function, with goal ladders the server rebuilds** (`sim/events.ts`,
    `sim/goalEvents.ts`): every countdown is real by construction.
32. **Shadow Trials fairness**: the median of five generated fortresses per tier, an alternate after a failure, paid
    once. Only the tail past tier 60 and the modifiers need work.
33. **Honest selling of the Season Scroll** (`passSaleOpen`: no sale in the last four days unless 15 tiers are
    unlocked; the estimate counts only reachable tiers; premium claims recorded on the purchase for refunds).
34. **Notification ethics in the planner itself** (`sim/reminders.ts`): opt-in per type, quiet hours move a reminder
    to the morning, a daily cap by priority, no reminder is an offer.
35. **The next-objective chip never suggests anything paid** (`sim/objective.ts`).

### 2.6 Release engineering and honesty

36. **Legal pages that say "not published yet" instead of inventing facts** (`public/legal-config.js`,
    `public/legal.js`). Never fill a publisher fact with a placeholder.
37. **CI that says what it did not do** (`tools/release/ci-note.mjs`), the Android release job's gates, compliance
    mechanisms behind owner switches that default to the safest setting (`docs/SHIPPING.md` 3l).
38. **Listing claims tied to data and tests, with a "do not claim" column** (`docs/store/LISTING.md`).
39. **Closure records with a "remaining limitations" column, and the generated status file** with its staleness
    test.
40. **Result-stale gates**: the campaign fingerprint, the combat fingerprint, the explicit known-failing assertion.
    They are why this pass can be done safely at all.

### 2.7 Interface

41. **The honest, teaching result screen** (`src/presentation/ui/battleHud.ts`, `ui/feedback.ts`): loot counted up
    to what was really banked, explicit overflow, the stake's outcome, the squad's carry share, a close-call line
    only when true. Phase 6 adds to it. Nothing on it is ever an estimate or a consolation.
42. **The scout drawer and the Infiltration Point presentation**: a chip per point, the path highlight, tips
    filtered to the army brought, the temper profile, the stake row.
43. **Battle motion and feedback that only read the simulation** (`render/motion.ts`, `battleMarks.ts`,
    `calloutLayout.ts`). Rendering never changes a result; a camera or speed control added in Phase 6 keeps that.
44. **The source-text translation layer** (`locales/runtime.ts`, `ui/i18n.ts`): canonical English in the simulator,
    the server and saves, translated only at owned display boundaries.
45. **The Army panel's shortcuts and redraw discipline** (Suggested army, Refill last raid, Fill, Save this army;
    `sim/armyView.ts`).
46. **"Try" practice battles**, labelled "nothing is spent or won".
47. **Progressive disclosure with honest labels**: rail buttons appear as systems open, and every generated
    opponent says what it is.
48. **The warrior unlock ceremony and the 50-class Codex.**
49. **The welcome-back report** with defense replays and "(simulated raider)".
50. **The first-raid coach line**, which teaches from live battle state.
51. **Dialog, lazy-panel and toast plumbing**: every modal can be closed, panels load on first open.

### 2.8 Server flow and planned content

52. **The raid ticket flow** (`server/core/pvp.ts`): the seed comes only with `startAttack`, the stake is fixed
    before the seed, a started ticket that is never reported settles as a loss, a used ticket returns its stored
    answer, both players are locked and re-read before anything is written.
53. **One pure `applyCommand` for the game and the server**, checked by `economyHash` over canonical JSON. Phase 1
    fixes holes inside it. Never fork the logic or add a server-only copy of a rule.
54. **Rewards from bases the server rebuilds from seeds** (`trialBase`, `bountyBase`, `rematchBase`). The hole
    Phase 1 closes is the other setup fields, not this.
55. **Reference-derived level tables for planned content** (`planned.json` `ref`, `hpMult`, `damageMult`,
    `costMult`) and **the body-versus-effect measurement** in `tools/balance/preview.ts`, which separates what a
    rule does from what the building's health does.
56. **Mastery's guard rails** (`sim/mastery.ts` `masteryMatches`: never more than earned; donated warriors and the
    hero earn none; an asymptotic cap). The shape is right. Only the scale is wrong (P5-07).

### 2.9 Two more, named by the reports and added after review

57. **Timeline settlement and price-paid tracking** (`advance` in `sim/village.ts`; `armyPaid`, `takeFromArmy` and
    `armyValue` in `sim/army.ts`): timers finish in the order they ended, and task days, weeks and league seasons
    roll at their real boundary in between, so an absence settles exactly as if the game had been open; ready
    warriors remember what they cost, which keeps cancel and dismiss free of profit. Three items work inside it:
    P1-01 (the auto-claim), P1-13 (its catch-up cap is the only place an absence may settle differently, and its
    test says so) and P3-03 (the collector change).
58. **A clean shipped client** (`playthrough.md`): no console error, page error or failed request over a scripted
    session; a production cold boot of 1.4 to 4.0 s in headless Chromium; no clipped text, raw key or id in any
    panel at 360×640 and 844×390. Phase 6 measures all three before and after (its closing paragraph).

If you believe one of these must change shape to complete a work item, stop that item and record why. Do not
decide it alone.

## 3. Rules and procedures you must follow exactly

### 3.1 Changing anything a battle reads: one `SIM_RULES` bump for the whole pass

The combat fingerprint covers `troops.json`, `buildings.json` and `battle.json` with text, prices and timers
removed (`tests/gameplay/battle/rules-version.test.ts`, the `TEXT` set; the same list is `NOT_COMBAT` in
`src/backend/net/dataVersion.ts`). Code in `src/gameplay/sim/battle/` that changes how a battle plays is covered by
the rule too, even though no hash sees it.

All combat changes of this pass ship under **one** bump, in Phase 4, in this order:

1. Develop Phase 4 in a second checkout on its own local branch
   (`git worktree add ../kagemura-rules-next -b <working branch>-rules-next`), not on a copy of `src/gameplay`
   alone: the army lab, `army-lab.test.ts`, the matched-raid test and the campaigns import `tools/` and `tests/` by
   relative path, so only a full checkout can produce the results the work items ask for (the combat scripts take
   `REPO=<that checkout>`). Phase 4's one-commit-per-item commits are made there, and `SIM_RULES`, the fingerprint
   and the pins may already be changed on that branch. Nothing from it reaches the working branch before step 3:
   when step 2 runs, the working branch must still be rules N in data and in code. The fingerprint hashes data only,
   so an unchanged fingerprint does not prove unchanged behaviour. A combat change may instead sit on the working
   branch only behind a data value that is not yet set.
2. `npm run rules:snapshot` while `SIM_RULES` is still the current value. This copies the working tree's
   `src/gameplay/sim` and `src/gameplay/data` to `server/rules/v<N>/` as rules N, lists it in `archive.ts`, fixes its
   digest in `manifest.json` for good and records the fixture. It refuses to run twice for one version. Immediately
   before it, with nothing bumped, run `rules-version.test.ts`, `aura-cache.test.ts`, `relay.test.ts` and
   `tests/backend/server/rules-versions.test.ts` and confirm the old pins still pass: what you snapshot must still
   be rules N. Phase 1 to 3 changes are part of it, which is correct (they change no battle).
3. Bump `SIM_RULES`. Set `SIM_RULES_COMPATIBLE` to the versions the new code still plays exactly. If a battle with
   none of the new content can differ from the old rules in any way (it can, as soon as a live warrior's behaviour
   changes), the list is empty.
4. Merge the rules branch of step 1 (the combat code and the data changes). Update the fingerprint and rules number
   in `rules-version.test.ts` to the values the new code produces. Re-pin `tests/gameplay/battle/aura-cache.test.ts`
   from the new code. Update `tests/gameplay/battle/relay.test.ts` (the rules number, the compatible list and its
   table of which old records still replay) and the version history comment above `SIM_RULES` in `battle.ts`.
5. `npm run rules:fixture` for the new version.
6. `npm run balance:armies`, `npm run balance:campaign`, `npm run test:slow`, `npm run docs:progression`,
   `npm run status`, then the full checks, then the re-measurements listed at the end of Phase 4: the bump changes
   the armies that Phases 1 to 3 measured their results with.
7. Write the `docs/backend/REQUESTS.md` entry: the new rules number, the archived one, and "deploy the server before
   the game".

Do not bump twice. If a combat item is not ready when the bump is made, it waits for a later pass.

Two keys in `battle.json` are deliberately outside the fingerprint: `scoutFeeByHall` and `generatedLootByHall` (they
are in the `TEXT` set). The defense report's warning that editing them forces a bump is wrong. They still change the
data version and the campaign fingerprint.

The reverse trap: a new data key added to `troops.json`, `buildings.json` or `battle.json` whose name is not already
in the `TEXT` set enters the fingerprint and makes `rules-version.test.ts` fail outside the bump. Outside Phase 4,
put a new key in a file the fingerprint does not read (`economy.json`, `raids.json`, `ranks.json`, `trials.json`,
`pass.json`). The two likeliest slips are the build-time cap of P3-03 (beside `buildSeconds`) and the resume window
of P1-12 (beside `battle.json` `durationSeconds`, which is hashed).

`battle.json` `temper.offers.counterShare` is matchmaking, not battle arithmetic, but it sits inside the
fingerprinted file. Changing it belongs to the bump.

### 3.2 Changing what a village stores: one `SAVE_VERSION` bump for the whole pass

`docs/DECISIONS.md` records the lesson of v23: a bump forces "Update Kagemura" on every older build that meets a
newer server village, so bumps are grouped and a field is added only when the feature that writes it goes live.

- This pass makes **one** bump (current version plus one). Introduce it in the first work item that needs stored
  state, and add every later field of this pass to the same migration step.
- A migration step runs only for files below the new version. A village saved at the new version by an early build
  of this branch never runs it again, so a field added to the step in a later phase would never reach that village.
  Two consequences. Until the pass's last stored field has landed, no build of this branch is released and no server
  holds villages written by it: say so in the ledger and in each phase's closure record. And every field added
  after the commit that made the bump is also defaulted on every load (beside `repairTrainingQueue`), with a test
  that loads a new-version file written without it.
- A field that only a not-yet-live feature would write is not added. Code reads it as optional with a default.
- The migration never drops progress. Every new field gets a test in the save tests that loads a file of the
  previous version and checks the migrated value.
- A new `StatKey` is a state change. A new optional field that nothing writes yet is not.

### 3.3 Changing what the server replays or accepts

- `PLAYER_COMMANDS` and `BATTLE_COMMANDS` in `src/gameplay/sim/serverEconomy.ts` list what a player may send. A new
  player command, or a change to what an existing one does, changes what the server replays with the same
  `applyCommand`. Keep `applyCommand` pure, add the command to the list only if a player must send it (never a
  server result), and note it in `docs/backend/REQUESTS.md`.
- A new protocol field or route goes in `docs/PROTOCOL.md` with a contract test, and `PROTOCOL_VERSION` moves only
  for an incompatible change. Prefer additive fields announced as a `/v1/hello` feature.
- A database change is a new numbered file in `server/migrations/`, listed in its `index.ts`, backward compatible
  with the previous server build.
- Any table that stores player data must be cleared by account deletion (`Repo.deletePlayer`).
- A counter, claim list or reward ladder this pass adds (the Scroll bonus, Keep seals, chest milestones, earnable
  and festival looks, goal-event progress by occurrence, the drill's day, mastery experience, `pass.lastSeason`)
  gets two things in the commit that adds it. A bound in `validateVillage` (`sim/save.ts`), set so that no honest
  village can exceed it: an unbounded number or map in a save is what XPL-03 used, and a village that fails the
  check is treated as damaged. And a rule in `checkProvenance` (`server/core/villageImport.ts`), which already
  counts whatever an imported village's counters have reached as claimed and drops a Scroll look nobody paid for:
  seals and milestones an imported village already qualifies for count as claimed, and a look only play can grant is
  kept only when the imported state meets the condition that grants it. One import test per item, with a forged
  save.

### 3.4 Changing balance data: the campaign fingerprint

`tools/balance/campaign.ts` hashes the played data (`buildings`, `hall`, `economy`, `troops`, `battle`, `ranks`,
`raids`, `pass`, `daily`, `events`, `trials`, text removed), the rules number, five source files
(`tools/balance/playerModel.ts`, `src/gameplay/sim/matchmaking.ts`, `src/gameplay/sim/battle/basegen.ts`,
`src/gameplay/sim/defense.ts`, `src/gameplay/sim/offline.ts`) and the campaign list. Any change to one of them, even
a comment in one of the five files, makes `tests/gameplay/balance/campaign-gates.test.ts` fail until you run
`npm run balance:campaign` and commit the regenerated `docs/game-theory/CAMPAIGN.md` and `campaign.json`.

The reverse does not hold. The fingerprint does not see `sim/village.ts`, `pass.ts`, `trials.ts`, `carry.ts`,
`rematch.ts` or `goalEvents.ts`, so a code-only change there (P1-01, P1-03, P1-17, P2-07, P2-15, P3-03, P3-06,
P3-07, P5-03) leaves "campaign results are current" green while the results are stale. Run the campaign at the end
of every phase that touched the simulator, whatever that test says.

- The campaigns take several minutes. Batch: finish a phase's data changes, then run once. While iterating, use the
  focused harnesses in section 4, which answer in seconds.
- Between the first such change of a phase and that run, the test "campaign results are current" in
  `campaign-gates.test.ts` fails. That one assertion may be carried inside a phase. Every other test in the file
  must stay green against the last generated results, and the phase ends with the run.
- After the run, read the gates. If one fails, the change is wrong or the work item explicitly re-states that gate.
- `achievements.json`, `cosmetics.json`, `store.json`, `offers.json`, `social.json` and `notifications.json` are not
  played and do not need the run.
- The slow suite holds two more windows on the regular model (0.4): Keep 3 between 40 and 80 minutes and Keep 6
  between 9 and 17 days. Keep 6 is at 9.42 days today and Phase 3's own starting values bring it to 9.00. Measure it
  after every item that speeds up Keeps 1 to 5 (P1-03, P2-14, P3-01, P3-04, P3-07, P3-11).

### 3.5 Player-visible text: every string costs 49 translations

All 50 languages are complete today and `Settings` hides a language that is not. One new English string makes 49
languages incomplete until it is translated.

- Interface text goes through `t()` (`src/presentation/ui/i18n.ts`) with its English in `locales/en/ui.json`;
  plurals are keyed ICU messages. Game-data text lives in `src/gameplay/data/*.json` and reaches the catalog through
  `npm run i18n:extract && npm run i18n:sync`. Server messages are `srv.<code>` entries in `locales/en/messages.json`
  thrown with `fail(...)`. Never rename or reuse a key or code.
- A sentence the simulator itself returns (a `fail(code, 'English')` refusal, a generated name) is a fourth route.
  The interface shows it through `messageText`, which looks the English up among the `sim.*` entries of
  `locales/en/messages.json` and the patterns of `locales/legacy-patterns.json`. For a new refusal prefer a code
  with `FailParams` that the interface maps to a `t()` key, as `ui/refusalText.ts` does. If you add simulator
  English instead, add its `sim.` entry (and a pattern when it carries a number or a name) and count it in the
  ledger. Nothing fails if you forget: the sentence stays English in 49 languages while every language still reports
  ready. Many items add refusals (P1-11, P1-12, P1-14, P3-06, P3-07, P5-08).
- Reuse an existing key only when the meaning is identical, not merely the English.
- Do not build sentences from fragments, do not let anything agree in gender with a placeholder, and isolate names.
- Names in any script go through `sim/social/names.ts`.
- Keep a running list of new and changed keys in the ledger, with what each is for. Translation is done once per
  phase, at its end, by the procedure in section 13, so wording can still change while you build the phase.
- Run `npm run i18n:sync` after adding any English key, interface keys included, so every worksheet at least holds
  the key. If an English page changed (`public/*.html`, the server's account and complaint pages), run
  `node tools/i18n/pages.mjs extract` first: until then every npm pre-hook (`test`, `build`, `typecheck`) stops with
  "Untranslated or stale page".
- Inside a phase three things fail as soon as one English string is added: the language-readiness tests
  (`tests/locales/*.test.ts` assert `ready` for every language), `tests/presentation/i18n.test.ts` (it needs at
  least one complete language) and the status file's ready list (`tests/architecture/status.test.ts`). Those, and
  the one assertion named in 3.4, are the only failures you may carry, and only inside a phase. After every
  `npm test` in that state, confirm the failing files are exactly those; anything else is a real failure. **Every
  phase ends fully green with all 50 languages complete.**
- Prefer designs that need few strings. A number, an icon that already exists and an existing label beat a new
  sentence. Each work item below says roughly how many strings it should need.

### 3.6 Honesty in what you add

- A generated opponent, a simulated raid, a generated Gang and a practice battle are always labelled as such. A new
  mode that fights a generated base says so on its card and its result.
- A shared challenge everyone plays (the Gauntlet in Phase 5) must really be the same base for everyone at that Keep.
- A reward shows what it gave. If part of it did not fit, the result says so.
- A value estimate shown to sell something counts only what this player can still get, at a price the game itself
  would charge.

### 3.7 Money and minors

Nothing in this pass adds a product, changes a real price or sells anything random. New Jade sinks are cosmetic
(looks) or convenience that is not power. No new offer trigger. Anything that pays Jade to a player is fixed and
earnable by play; record the new monthly free-Jade total in the closure record (it was 480 to 523 for a regular
daily player on 2026-11-16, `economy.md` 1) and keep the added amount small and one-time where possible.

### 3.8 Which checks a change needs

| You changed | Run |
|---|---|
| Anything | `npm test`, `npm run lint`, `npm run build` |
| `server/` or `src/backend/` | plus `npm run typecheck:server`, `npm run server:build`; with Postgres and Redis available, set `TEST_DATABASE_URL` and `TEST_REDIS_URL` |
| Costs, times, loot, raids, ranks, pass, daily, events, trials, the model player | plus `npm run balance:campaign`, `npm run test:slow` |
| Anything in the combat fingerprint or `sim/battle/` | the procedure in 3.1 |
| Roster or progression data | plus `npm run docs:progression` |
| Game-data text | plus `npm run i18n:extract && npm run i18n:sync`, `npm run i18n:check` |
| Interface or server-message text | plus `npm run i18n:sync`, `npm run i18n:check` |
| A public page or the server's account or complaint page | plus `node tools/i18n/pages.mjs extract`, then `npm run i18n:sync` |
| A number in the status table | plus `npm run status` |
| Native config, plugins | plus `npm run build && npx cap sync`, and commit what it regenerates |

`npm test` runs the boundary, import-cycle, unused-export and status tests. An export nobody imports fails
`tests/architecture/unused-exports.test.ts`; its allow-list may only shrink.

### 3.9 The progress ledger

`docs/audit/understand-2026-11-16/PROGRESS.md` already exists: a session on 2026-11-17 did parts of P1-01, P1-11,
P1-12, P1-13 and P2-01 (the three exploits a server-held village could mint with, the Season Scroll rollover, and
loot protection for simulated raids). Read it before anything else, revalidate each of its rows against the code as
section 0.3 says, and do only what its "left" column lists for those items. Keep it current. One row per work
item id from this prompt: status (`todo`, `doing`, `done`, `reverted`, `skipped: no longer true`,
`open: needs owner`), the commit, the before and after numbers, the new or changed locale keys, and anything the
next session must know. A session that runs out of context writes its state there before stopping. A session that
starts reads it first.

When a phase is complete, add its closure record to `docs/store/WORLDWIDE_AUDIT.md` in the format of the existing
ones: a table of finding, status, what changed, evidence, remaining limitations, then the verification line with the
commands you ran and what they reported. Say plainly what was not verified: no device, no store, no person played
it, model-player outcomes are not observed retention or revenue.

## 4. The measurement toolkit

Every harness below was run on 2026-11-16. Saved outputs (`*.out`, `*.txt`) exist for some of them; produce your
own "before" for the rest. They import the repository's real simulator. They hard-code the checkout path
`/home/user/ninja-version-of-game-1`; if yours differs, replace it with
`sed` or run from a symlink. Scripts that need a scratch folder read `SCRATCH` (default `/tmp/kagemura-understand`;
create it).

Two ways to run TypeScript against the simulator without a build:

- `node --experimental-transform-types --import ./tools/balance/lab/register.mjs <script.ts>` (Node 22.18 or newer;
  the lab's loader resolves extension-less and JSON imports). Fast: a Keep 15 battle takes about 0.2 s.
- A `.mjs` that uses Vite's `createServer` and `ssrLoadModule`, as the pacing and retention scripts do. This also
  lets you patch data in memory for a what-if without touching a file.

| Harness (`docs/audit/understand-2026-11-16/scripts/`) | Answers |
|---|---|
| `defense-raids/def_hold.ts` | How often a village of a given build quality holds a bot raid, by Keep and raider strength |
| `defense-raids/def_econ.ts` | What a raid takes and what a hold pays, per build quality, under today's and proposed rules. Both reward columns are the harness's own arithmetic and every storage starts full: read P2-01's warning first |
| `defense-raids/def_daily.ts` | Raids per day and loss per day through the real slot and shield rules |
| `defense-raids/raider_dist.ts` | Which bot raider a village meets, by honor |
| `defense-raids/pace_noraids.ts` | The regular model's pace with and without raids |
| `defense-raids/away.ts` | What a 7-day and a 30-day absence costs |
| `defense-raids/next_offers.ts` | The spread of Next offers against the fee of the player's own Keep (it reads the fee table and never calls `scoutFee`: P2-11) |
| `pacing/casualwall.mjs` | The casual model day by day: income by source, stolen, spend, idle builders |
| `pacing/variants.mjs` with `v1.json` to `v7.json` | What-if campaigns with data patched in memory |
| `pacing/firsthour.mjs` | The first 90 minutes: raids, Keep times |
| `pacing/trialcap.mjs` | How far a maxed Keep 15 army climbs the Trial ladder: tiers 53 to 76 only, one seed, the best of five fortresses |
| `pacing/keeptable.cjs`, `maxout.cjs`, `research.cjs` | Unlocks per Keep, builder-days per Keep and type, research lane-days |
| `economy/econ1.cjs`, `econ2.cjs`, `econ3.cjs` | Production against costs per Keep, free Jade per month, skip and top-up curves and the proposed re-curve |
| `retention/r1.mjs`, `r2.mjs`, `r3.mjs` | Task repetition with every template counted as eligible, and reward value by Keep (`r1.mjs`); the Scroll rollover and look reproductions (`r2.mjs`); Trial battles for any tier list (`r3.mjs <tiers> <seeds>` fights two fortresses of each tier with each seed) |
| `combat/common.ts` with `t1.ts` to `t14.ts` (there is no `t4` or `t6`) | Entry-point spread, hero and Rally, Smoke (`t3.ts`, `t13.ts`), army panel by temper profile, every warrior's marginal and kit value (`t7.ts`), formations, scouting-metric correlation, candidate fixes (`t10.ts`). The combat scripts take `REPO=<path>`. In `t10.ts` the variants `supportFights` and `noJamChase`, and the flag half of `combo`, `half15`, `half17late` and `all3`, set `battle.warriorRules` values that only a patched copy of `src/gameplay` reads: against the real tree they are ignored without a message, and the mixed variants then apply only their data half. The data-only variants (`storm25`, `siegeSpeed`, `siegeDef`, `wall4`, `wall2`) measure correctly against the real tree |
| `publish/det.ts` | A hash of generated bases, bot deployments and results for 48 raids, for cross-engine comparison |
| `exploits/repro1.xpl.ts` to `repro4.xpl.ts` | Reproductions of XPL-01 to XPL-06, XPL-09 and XPL-10. Run from the repository root: `npx vitest run --config docs/audit/understand-2026-11-16/scripts/exploits/vitest.config.mts repro1` |
| `exploits/matched.xpl.ts`, `matched2.xpl.ts`, `iso/` | The matched-raid test row by row: determinism, sensitivity to the Keep's slack, process isolation (XPL-07) |
| `built-not-live/squad.mjs` | Nine squad orders through six entry points per base |
| `built-not-live/heroes.mjs`, `herolast.mjs` | Each planned hero against the Shadow Captain and against no hero, sent first and sent last |
| `built-not-live/counters.mjs` | Each planned counter: with it, without it, and with its body only |
| `built-not-live/mastery.mjs`, `masterypower.mjs` | Raids needed per mastery level; what a bonus does to destruction |
| `built-not-live/caps.mjs`, `tables.mjs` | Cost and builder time of the planned buildings against the live defense budget |
| `ui-surface/i18n-probe.test.ts`, `objective-lengths.cjs` | Which strings the interface builds translate; the objective chip's length in 50 languages |
| `playthrough/daemon.cjs`, `tut_*.js`, `raid*.js`, `panels.js` | Playwright drivers for the first run, raids and every panel at 360×640 and 844×390 (they need Playwright and a matching Chromium: the Phase 6 preamble says how to find what the machine has); `shots/` holds the screenshots the report cites |

Noise, from the investigators' own notes:

- A six-battle cell swings by 10 to 15 points from one neutral change. Decide nothing on fewer than 20 battles a
  cell, and trust only effects that are large and have the same sign at several Keeps.
- A single-seed campaign carries about ±2 days. A gate you add must hold with that margin.
- Hold-rate cells of 16 to 24 raids carry ±10 points.

When you add a gate, prefer one that uses more seeds or the mean of two adjacent Keeps over one six-battle cell
(`combat.md` CMB-12).

## 5. Phase 0: ground truth and a green pipeline

Nothing else can be trusted while `main`'s CI is red. It is red today for three separate reasons (`publish.md` 1).

**P0-01 Baseline.** `npm ci`, then `npm test`, `npm run lint`, `npm run build`, `npm run typecheck:server`,
`npm run server:build`. On 2026-11-16 at `9bf76af` with Node 22.23.4 and no Postgres or Redis, `npm test` passed
(205 files and 1 skipped; 1,934 tests and 19 skipped), lint was clean and the build passed. If your baseline
differs, find out why before changing anything. Create the ledger (3.9).

**P0-02 (PUB-01) The deploy check rejects every right-to-left language.**
- Why: `tools/release/check-published-game.mjs` asserts the exact text `<html lang="<code>">`, and
  `tools/i18n/pages.mjs` writes `<html lang="ar" dir="rtl">` for Arabic, Hebrew and Urdu. Since all 50 languages
  became ready the check fails on `ar/community.html`, after the pages are already published.
- Change: match `lang` and `dir` separately against `locales/languages.json` (or accept a space or `>` after the
  attribute).
- Test: a unit test that applies the checker's page assertion to `public/<code>/*.html` for every ready language.
  It must fail on today's checker.
- Done when: the test passes and the check script accepts a local build's pages for all 50 languages.

**P0-03 (PUB-03) Postgres-backed tests time out at Vitest's default 5 s.**
- Why: every Postgres test makes a schema and runs all migrations, files run in parallel against one database, and
  `vite.config.ts` sets no timeout. A failed `server` job skips `deploy`.
- Change: `testTimeout` and `hookTimeout` of 30 s when `TEST_DATABASE_URL` is set; `--maxWorkers=2` on the Postgres
  steps in `.github/workflows/deploy.yml` and `server.yml`. If time allows, migrate one template schema per worker in
  `tests/backend/server/pg.ts` and clone it per test.
- Done when: with a local Postgres 16 (start one if the machine allows; otherwise say so in the record) the Postgres
  suites pass three runs in a row.

**P0-04 (PUB-02, XPL-07) `tests/gameplay/balance/matched.test.ts` fails on CI and passes everywhere else.**
- What is known. CI has computed the Keep 8 row as 2.75 stars against a 2.2 ceiling on at least three runs
  (`dbe487f` attempt 1, which passed on attempt 2; `9bf76af` on `main` and on `theory/rules10`), and passed on
  `9bb9a44` ten minutes before, where the only difference is one document. The same tree gives 2.167 on Node
  22.23.4, Node 24.22.1 and Bun, byte-identical down to each base, deployment list and result
  (`scripts/publish/det-*.txt`). In the failing runs the combat fingerprint and the pinned aura battles passed.
- What the number says. 2.75 is 33 stars in 36, exactly what the Keep 8 row **two research levels behind** gives
  every time; the hybrids (cap levels against the lagging village's opponents, and the reverse) give 36 and 16. So
  the failing runs computed the whole lag-0 row as lag 2. `lag` is used once, in `tools/balance/matched.ts`. No
  clock, random source or module-level state is on the path, and test files run in separate processes.
- What remains: the engine build CI ran. The workflows ask for `node-version: 24` (floating); the `Dockerfile` pins
  `node:24.22.3-slim`; neither investigator could run that exact version. A compiler fault that makes one closure
  see another call's parameter is the only thing found that fits, and it matters far beyond the test: the server
  re-simulates every battle on the same major version, and would reject honest battles.
- Do, in this order:
  1. Run `scripts/publish/det.ts` and `scripts/exploits/matched.xpl.ts` on the exact Node the `Dockerfile` pins and
     on whatever `24` resolves to on the runners, with and without the optimizing compilers (`--jitless`, and
     `--no-opt` or the current equivalent). Diff against `det-node22.txt`. Name the stage that differs. The exact
     build can usually be fetched without installing it: download the linux-x64 archive from
     `nodejs.org/dist/v<version>/`, check it against `SHASUMS256.txt`, unpack it under the scratch folder and call
     its `bin/node` directly.
  2. Add `.node-version` holding the exact version the `Dockerfile`'s `NODE_IMAGE` names (24.22.3 on 2026-11-16) and
     point every workflow's `setup-node` at it with `node-version-file`. A Dockerfile cannot read that file, and
     `tests/backend/release-config.test.ts` requires its `node:<version>-slim@sha256:<digest>` line: leave the line
     as it is and add a test that its version equals `.node-version`.
  3. Make the test print each battle's hash, opponent Keep and warrior levels, and assert the opponent Keep before
     it asserts stars, so a wrong-row result fails with its cause.
  4. Add a small pinned fixture for the path the existing pins do not cover (generated bases, matchmaking, bot
     deployments, the battles), and run that file a second time in CI without the optimizing compilers.
  5. Add an alert on `tk_desyncs_total` in `ops/prometheus/alerts.yml` if none exists.
  6. Only then look at the gate itself: 2.167 against 2.2 leaves one star in twelve raids, and the row swings from
     1.33 to 2.83 as that Keep's slack goes from 0.25 to 1.0. More seeds or the mean of adjacent Keeps (P4-08) is
     the fix. Widening the band is not.
- Done when: the cause is named with evidence, or the record says exactly what was ruled out and what could not be
  run here. Do not close this by changing the number. If you find an engine fault, write it at the top of the
  phase's closure record and in `docs/backend/REQUESTS.md`: the server must not run on that version.

## 6. Phase 1: defects of honesty and integrity

Certain fixes. None needs a balance judgement. Do the exploit items (P1-11 to P1-22, at the end of this section)
first: three of them mint Jade on a server-held village. Several items change stored state: this phase introduces
the pass's one `SAVE_VERSION` bump (3.2).

### Honesty defects (P1-01 to P1-10)

**P1-01 (RET-03, ECO-02) Unclaimed Season Scroll rewards, including paid ones, vanish when the season rolls.**
- Why: reproduced. `sim/pass.ts` replaces the pass state at the roll; a village with the premium Scroll and 20 tiers
  unlocked but unclaimed went through it with Jade +0 and Coins +0. Nothing warns. This is the one place the game
  takes something for a missed day.
- Change: in `advance` (`sim/village.ts`), before `rollPeriods` moves the season, grant every unlocked and unclaimed
  free tier, and every premium one while premium is owned, through `grantReward` at that tier's `passTierKeep`.
  `advance` reaches `rollPeriods` at two call sites, inside the timeline loop and after it: the auto-claim runs at
  the season boundary at both (protected item 57). Record premium grants on the purchase's `premium` record exactly
  as `claimTier` does, so a refund still takes back what was given. Keep `{ season, granted, overflow }` in a new
  optional `pass.lastSeason` for the welcome-back summary.
- Tests: the reproduction in `scripts/retention/r2.mjs` as a test (fails today); a refund after an auto-claim takes
  back the auto-claimed premium rewards; a tier already claimed is not paid twice; overflow is reported, never
  silently dropped.
- Touches: save (one optional field that is written), the server replays `advance`. Strings: about 2 (the summary
  line). Run the campaign at the end of the phase.

**P1-02 (RET-04) The paid track's look repeats every season; a returning buyer's look tier grants nothing.**
- Why: reproduced. `claimTier` returns ok with empty grants for an owned look, while the value estimate still lists
  the look and the pitch names it.
- Change: `pass.json` `seasonSkins` (6 to 12 look ids, chosen by season number modulo the list) and `repeatJade` for
  a look already owned. New `passOnly` looks in `cosmetics.json` are two colours and a name each; no artist is
  needed. `passTierReward` resolves the season's look or the Jade; `passPremiumValue` leaves out a look the player
  owns; the Store and Scroll panels show the look of this season.
- Also: `docs/store/LISTING.md` names the one look (the Lantern Festival Keep look) in the store description and in
  its claims table. No test pins it. Reword the English to a Keep look that changes each season, and add a test that
  the claims-table row matches `pass.json` `seasonSkins`. Leave the 49 translated `docs/store/<code>/LISTING.md`
  files to P7-13, which re-translates each of them in full, and note the stale sentence in the ledger so that P7-13
  cannot miss it.
- Tests: twelve seasons give the list in order; an owner gets `repeatJade`; the estimate never lists an owned look.
- Strings: one name per new look.

**P1-03 (RET-02, ECO-03) Tasks pay nothing for the last third of every season, and the claim button does nothing.**
- Why: measured. A player who does everything earns 471 points a day and reaches tier 30 on day 19 of 30; 36% of
  earnable points have no tier. `claimTask` still adds points and shows "+100".
- Change: `pass.json` `bonus: { everyPoints, reward, maxPerSeason }`, resources only, Keep-scaled, no Jade (starting
  value: every 300 points, 3,000 Coins and 3,000 Provisions at scale 1, at most 17 a season). `claimTask` pays each
  newly crossed bonus through the normal grant path and reports it in its reward event. No new state: the count is
  `floor((points − tiers × pointsPerTier) / everyPoints)`. A "Bonus" row in the Scroll panel.
- Do not add the bonus to `passPremiumValue`.
- Done when: a task claimed after tier 30 always pays something visible, and a full season's bonus total is at most
  the free track's own supply total at that Keep, which is two to five raids' loot (measure with
  `scripts/retention/r1.mjs`; the retention report's 6,000 and 6,000 would slightly exceed it).
- Strings: about 2.

**P1-04 (ECO-05) The Artisan's Bundle is offered when it cannot do what it says.**
- Why: reproduced. With four huts the next costs 1,000 Jade; the bundle gives 650 and says "Jade to hire another
  Village Artisan".
- Change: the trigger (`canHireArtisan` and the offer rule) fires only while the bundle's Jade covers the next hut.
- Test: four huts, no offer; two and three huts, the offer as today.

**P1-05 (ECO-06) The Scroll's "≈ N Jade value" reaches 65 times the same-price pack.**
- Why: reproduced. The estimate prices supplies as top-ups, the worst rate in the game, and assumes every task is
  done every day: 18,176 Jade shown for $4.99 at Keep 15, where $99.99 buys 7,500.
- Keep (protected item 33): the estimate counts only tiers this player can still reach.
- Change, in two steps. In this phase: value the Jade tiers as Jade; scale the reachable-tier count by the player's
  own pace this season, from state that already exists (`pass.points` against the days elapsed and
  `passPointsPerDay`; never above 100%; a data default in a season's first days), so no save field is needed; and
  add a guard: if the estimate exceeds six times the Jade of the same-price pack, show the Jade and list the
  supplies by amount instead of converting them. After P3-08 re-curves top-ups: re-check the supplies' price and the
  guard, and keep the item open in the ledger until then.
- Test: the guard at Keeps 3, 5, 10 and 15; a player who completes half the tasks sees about half the tiers counted.

**P1-06 (RET-06, PAC-05) The "endless" Trials end near tier 65 to 72, one achievement cannot be finished, and the
panel says "there is no top".**
- Why: measured twice with different harnesses. A fully researched Keep 15 army with the bot plan clears through
  about tier 63, with scattered clears to 68; growth is 6% a tier and nothing a Keep 15 player owns grows. Tier 60
  stacks both modifiers and gives one star. `achievements.json` `trial_walker` ends at 100 tiers (13 times the
  defense health and damage). Rewards are flat past tier 60.
- Change: `trials.json` `powerGrowthPerTier` down (the reports suggest 0.02 to 0.03; measure both with
  `scripts/retention/r3.mjs <tier list> 4`, which fights two fortresses of each tier with four seeds: the eight
  combinations named below, for any tiers), a reward that keeps growing a little past tier 60, the two modifiers no
  longer stacking on one tier (P1-07 gives them offsets), `taskMaxGrowth` re-derived from the new growth. Set
  `trial_walker`'s last step to the highest tier the bot plan clears with two stars in at least half of the eight
  seed and alternate combinations, minus five. Replace the "no top" line with a true one.
- `scripts/pacing/trialcap.mjs` cannot give that result: it scans tiers 53 to 76 only, with one seed, and prints the
  best of five fortresses, and at a growth of 0.02 the power that stops the bot plan today (about ×1.42) arrives
  near tier 78. Today `r3.mjs` gives two stars in 2 of 8 at tier 63, 0 of 8 at tier 66 and 1 of 8 at tier 68.
- `docs/store/LISTING.md` makes the "no top" claim twice (the promotional text, "an endless ladder of fortresses",
  and the feature line "An endless ladder of fortresses"). Reword both to what stays true (each tier is harder than
  the last and pays once), add the claim to the "claims checked" table tied to the measured cap (protected item 38),
  and leave the 49 translated listings to P7-13's batch with a note in the ledger.
- The cap constant, the last step and `taskMaxGrowth` are measured under today's battle rules. The close of Phase 4
  re-derives them under the new ones.
- Test: every achievement tier in the game is reachable by construction (a test that walks `achievements.json`
  against what the data allows: tiers against the measured cap constant, upgrade counts against the catalogue,
  research counts against the roster).
- Strings: 1 changed. Campaign run (trials are played).

**P1-07 (RET-07) "Ironclad Walls: walls have double HP" only ever lands on the layout that has no walls.**
- Why: reproduced. Tier `t` uses layout `(t − 1) mod 5` and Ironclad fires when `t mod 5 = 0`, which is always
  Open Courtyard (0 walls); the first alternate has none either.
- Change: `TrialModifierDef` gains `offset`; `trialInfo` tests `(t − offset) mod every`. Put Ironclad on the Walled
  Keep tiers and Elite on a period that does not collide with it. Add two or three modifiers built from inputs a
  battle already takes, so no rules change is needed: a rival clan's tempers through `temperBase`, and `levelBias`.
- Test: for tiers 1 to 120, every modifier that names walls lands on a fortress with walls; no tier carries two
  modifiers unless the data says so on purpose. `tests/gameplay/sim/trials.test.ts` pins today's modifier tiers;
  this item authorises updating those assertions.
- Strings: one name and one line per new modifier.

**P1-08 (RET-05, first half) Two of eight daily tasks complete on the first collect, and "finish 10 upgrades" is ten
wall taps.**
- Why: measured. Collect targets are linear in the Keep while production is exponential (0.3% of a day's production
  at Keep 12). `upgradesDone` counts instant wall levels, and from Keep 10 five artisans cannot finish ten timed
  upgrades in a week, so walls are the only way.
- Change: collect targets become a share of the village's own daily collector production (`TaskTemplate`
  `ofDailyProduction`, starting value 0.25, read in `fixedTarget`). Upgrade tasks count timed upgrades only: a new
  stat for timed upgrades (part of the one save bump), used by the task and by `taskEligible`. Leave `upgradesDone`
  and the achievement that uses it alone.
- Test: at Keeps 3, 8 and 15 no daily task is complete after one collect of an hour's production; ten wall levels do
  not move the upgrade task.

**P1-09 (retention notes) An English date fragment sits inside a translated reminder.**
- `sim/reminders.ts` builds the event reminder with `toUTCString().slice(...)`. Pass the timestamp as a parameter
  and format it where the reminder is delivered, in the device language. No new string.

**P1-10 (ECO-13) The retired Rebuild Kit is still listed as a store product** (`store.json` `storeProductIds`,
`ios/App/Products.storekit`, `docs/SHIPPING.md`, the status count). No store listing exists yet, so nothing was ever
sold under it. Confirm that in the code and the shipping notes, then remove it from the product map, regenerate with
`npm run store:storekit` and `npm run status`, and fix the shipping table. If anything suggests a receipt could
exist, leave it and record why.

### Exploits: do these first (P1-11 to P1-22)

`exploits.md` reproduced P1-11 to P1-16, P1-18 and P1-19 against today's simulator (the scripts are in
`scripts/exploits/`). P1-17, P1-20 and P1-21 were read in code, and P1-22 was read in code by the built-not-live
report. Three are critical: on a server-held village they mint resources and Jade at the battle-command rate, with
no army. For each one, turn the reproduction into a failing test (or write the failing test from the description),
fix the cause inside the shared simulator (protected item 53: one `applyCommand`, never a client-only check), and
add a server test that the replay refuses the same input. None changes a battle rule, so none needs a rules bump.

**P1-11 (XPL-01, critical) Battle commands trust the client's setup.**
- Why: `trialEnd`, `bountyEnd` and `rematchEnd` rebuild the base and keep every other field the client sent.
  `checkBattleSetup` checks the army, levels, reinforcements and mastery only. `startDamage` (every building id
  with a huge number) gives three stars at tick 0 with an empty army; a Keep 1 village cleared Trial tiers 1 to 40
  in 40 commands, and the server's own `replayVillage` applied them. `hero` accepts any hero at any level;
  `infiltration` left out restores free placement.
- Change: `checkBattleSetup` returns a sanitized setup: `seed`, `army`, `levels`, `reinforcements` and `mastery`
  copied after their checks, `infiltration: true`, no `startDamage` (only the server's Gang War path builds it), and
  `base` supplied by the caller (rebuilt in `trialEnd`, `bountyEnd` and `rematchEnd`; the recorded base in the
  ticketless `battleEnd` and in `groveBattleEnd`, until P1-21 rebuilds the war base).
- `hero` is checked the way the raid path checks it (`checkArmy` in `server/core/pvp.ts`) and never overwritten:
  absent is allowed; otherwise its id must be the one `heroFor(state, data)` gives and its level an integer from 1
  to that hero's level. A lower level is legal (a Keep that finished during the battle), and the battle must be
  replayed with the hero that fought it. The raid path's one Keep of slack exists because the player row can lag the
  village; inside `applyCommand` the state is the village itself, so it is not needed here.
- Use the sanitized setup in `trialEnd`, `bountyEnd`, `rematchEnd`, `groveBattleEnd`, `abandonBattle` and the
  ticketless `battleEnd`. Require that warriors fought for a Trial clear, a Bounty step and a rematch win.
- Tests beside `tests/gameplay/sim/trials.test.ts`, and one through `replayVillage`.
- Forcing `infiltration: true` changes existing tests that send these commands with free placement, and this item
  authorises changing them. Eleven files send them and never set `infiltration`: under `tests/gameplay/sim/`,
  `trials`, `audit-settlement`, `army`, `round2-rules`, `matchmaking`, `defense`, `research` and `army-queue`;
  `tests/gameplay/social/social`; and under `tests/backend/server/`, `village` and `reaudit-hardening`. For example
  `army.test.ts` "battleEnd re-simulates, spends used troops and adds loot" sends twelve warriors at (25, 19); with
  the rule forced all twelve are dropped, for 0 stars and nothing used. In each file give the setup
  `infiltration: true` and move the deployments inside an open point (read them from
  `createBattle(setup, data).entry`). Keep every assertion about loot, warriors spent and stars, and list the files
  in the ledger.

**P1-12 (XPL-02, critical) A battle record's time is client-supplied and bounded only above.**
- Why: `bountyEnd` uses `min(now, record.at)`, so any past Bounty Hunt can be attacked at any time, and alternating
  two old occurrences pays the whole ladder every time: 20 commands paid 700 Jade. The same shape is in
  `rematchEnd` (the 72-hour window never closes) and `groveBattleEnd`.
- Change: a lower bound on `at` (the battle's length plus a resume window, from a new data value in `raids.json`,
  not beside `battle.json` `durationSeconds`: section 3.1), and refuse an occurrence that started before the one
  already stored for the same event id in `state.goalEvent`. No save change. When P5-01 turns the progress into a
  map by occurrence key, this rule stays per event id and never compares different events, or an attack on the goal
  window that opened first would be refused while a later one runs.

**P1-13 (XPL-03, critical) The server import takes liabilities it never looks at, and two loops the attacker
sizes.**
- Why: a forged save with 500 Jade on hand passed the import checks, and ordinary commands then left 280,500 Jade:
  150,000 from a stipend with a forged balance, 100,000 from a timer with a forged top-up share that `cancel`
  refunds, and 30,000 from 3,000 league chests paid by a `season` set 3,000 months back. 3,000,000 forged seasons
  made one command run 9.1 seconds inside the row lock. The offline war's `settledWeek` loop has the same shape. For
  honest players the same loop pays a league
  chest for every month away, played or not.
- Change: cap the season catch-up with a data value (as the war already has `settleWeeksMax`). Bound `season` and
  `settledWeek` in `validateVillage` only to what no honest village can hold (before the village's `createdAt`, or
  more than one season after its `lastSeenAt`): that check runs on every load and a village that fails it is treated
  as damaged, so a village last seen years ago must still load. The catch-up cap is what limits its payout, and a
  test loads one.
- In the import, hold back the stipend unless a credited stipend purchase covers it: clear its payments and add its
  remaining Jade to the import hold (`import_holds`, reported to the game as `importHeld`, releasable by staff), as
  `checkProvenance` already does for unconfirmed Jade and an unpaid Scroll. Never drop it without a hold: a stipend
  bought through a store this server did not check is real money, and the import's rule is to hold what it cannot
  confirm, not to confiscate it. Strip `topUp` and `armyPaid` from timers and the army, and clamp a timer's `cost`
  to the catalog.
- Tests: the forged file from `repro2.xpl.ts`; a command on a village 10,000 seasons behind returns in
  milliseconds and pays at most the cap.

**P1-14 (XPL-04) A refund debt is wiped by top-up, train, cancel.** `shortfallQuote` computes the shortfall from a
negative balance, so a top-up buys the debt too, and `cancelTraining` returns all the Jade. A top-up never covers a
debt: compute the shortfall from `max(0, balance)`, so the action stays refused until income repays the debt. This
protects item 7.

**P1-15 (XPL-05) A hero-only battle is a free way out of a started raid.** An unmodified player can do it from Keep
7: a raid with only the hero deployed counts as practice, so honor and shield stay, the scout is cleared and the
next look skips the Next fee; a hero-only abandon keeps the same opponent and seed (watch the traps, then attack for
real); online a hero-only report burns the ticket with no forfeit. A started raid in which the hero went in and no
warrior did is a lost attack (the honor of a 0-star loss, the shield ends, still no loot), in `battleEnd`,
`abandonBattle` and the server's `attack()` (`forfeitTicket`). A battle with nobody deployed stays rejected as
today, and `no_warriors` stays its answer.
- This reverses a pinned rule and narrows protected item 12 on purpose, and this item authorises both. Restate
  `tests/gameplay/sim/balance-rules.test.ts` "a battle with only the hero is practice (DZ-3)", which expects
  `no_warriors`, unchanged honor and an unchanged shield, as "a raid with only the hero is a lost attack". Keep a
  separate case for nobody deployed, and change any server case that expects `409 no_warriors` for a hero-only
  report.
- Two translated strings say the opposite today: `raid.rejected.no_warriors` in `locales/en/ui.json` and
  `srv.pvp.no_warriors` in `locales/en/messages.json` ("No warriors fought, so it counts as practice"). Keep both
  keys for the nobody-deployed case. The hero-only loss gets its own line on the result screen (one new interface
  key) and, where the server answers with a message, one new `srv.` code. Strings: 1 or 2.

**P1-16 (XPL-06) The client picks tomorrow's daily chest.** `openDailyChest` mixes the client's `entropy` into the
next salt and the server replays the value sent; a search found a salt that makes the next chest the best one in 57
tries. For a server-held village the server draws the entropy and returns it in the command's outcome (an additive
protocol field, `docs/PROTOCOL.md`, a contract test) and the game applies that value. This closes the backend ask of
2026-11-13.
- The next chest is drawn from the salt this claim rolls, and `daily.salt` is outside `Economy`, so `economyHash`
  does not catch a wrong local salt until the next chest pays something else. When the outcome arrives, the game
  overwrites its local `daily.salt` with the one the server's entropy gives. Test: two consecutive days opened
  through the client path and through `replayVillage` give the same second chest.
- On a server-held village a chest is never revealed from a salt the server has not confirmed. While an earlier
  `openDailyChest` is unsent or unanswered, the next chest stays closed with one line saying it opens when the game
  is back online (1 string), so a chest never shows contents the server then replaces (the Honesty invariant: a
  chest only shows what it gave). The first chest of an offline spell still opens: its salt is confirmed. Test two
  chests on consecutive days with no sync between them. Device villages keep today's behaviour.
- Do not queue the second open under its own day with the reveal held back: the server dates a command at most 12
  hours back (`MAX_BACKDATE_MS` in `server/core/village.ts`), so a queued open cannot keep its day across a longer
  offline spell. Under the existing streak rule a day missed that way steps the streak back one and never wipes it.
  Write the change into the R01 row of the phase's closure record and into the offline sentence (Phase 7, after
  P7-16).

**P1-17 (XPL-08) `Math.pow` and `Math.log2` still feed Trial fortresses and Trial rewards.** The battle rules allow
only + − × ÷ and √. `sim/trials.ts` raises the growth with `Math.pow` (it differs from repeated multiplication for
318 of 401 exponents, and engines need not agree to the last bit) and floors a `log2` product that lands exactly on
an integer at tiers 2, 4, 16, 32 and 64. Use repeated multiplication (as `temper.ts` does with `raise()`) and an
integer-safe floor (a table, or a small epsilon), and pin the rewards at those tiers. `sim/pass.ts` `taskEligible`
(the `trialsCleared` case) raises the same growth with `Math.pow` behind a 1e-9 guard, and the server replays the
frozen task pick: use the same helper there and check it against the `taskMaxGrowth` that P1-06 re-derives. Do it
together with P1-06, which changes the same lines.

**P1-18 (XPL-09) A top-up with `pay: 'dew'` is a free-standing Jade to Coins exchange.** `topUpTarget` prices the
action in Coins and the action then pays Provisions, so the bought Coins stay in storage. Pass `action.pay` to the
quote. This protects item 22.

**P1-19 (XPL-10) Twelve hours of backdating is a daily free skip.** After 12 quiet hours a modified client dates
`upgrade`, `research` and `train` 12 hours back (about 650 Jade of skips a day with five artisans and two research
lanes). The window
exists so real offline play can sync. Bound it by the device's previous authenticated contact, or use a shorter
bound for commands that start timers. It is a backend decision: choose the conservative one, and record it in
`docs/backend/REQUESTS.md` and `docs/PROTOCOL.md`.

**P1-20 (XPL-12) A missed stake gives the defender a free shield and exhaustion; lost attacks feed honor.** Online,
a raid whose stake was missed takes nothing, yet shields the defender by destruction and counts for exhaustion; an
alternate account can shield a main for 14 to 16 hours at no cost. A 0-star attack also pays the defender honor
with no daily cap on the gain. No loot lost means no shield and no exhaustion; cap the honor one attacker can give
one defender in a day. Server code, with a test in the attack suite.

**P1-21 (XPL-13) Type and trust holes on low-value commands.** `setProfile` stores any `under18`, so `null` turns a
stated minor back to unknown on a device village (the server's age table still blocks a server-held one): accept
only booleans and keep the one-way rule. `donate` accepts a fractional count, which leaves an army that
`validateVillage` calls damaged and can make a village unloadable: floor and check the count. `groveBattleEnd`
trusts the client's base and never checks its target: rebuild the war base from the Alliance seed, the week and the
target, and check the target index. `bountyEnd` lets the client pick the easier fortress (the one a Keep lower):
take the Bounty's Keep from the pending battle the village recorded, not from the record. One test each.

**P1-22 (BNL-07) Shared replays accept an unchecked `setup.mastery` although mastery is not live.**
`server/core/sharedReplays.ts` copies it from the request and the live engine multiplies health and damage by it.
Drop it unless the feature is on; when on, keep only known warrior ids with values between 0 and the cap. Validate
`setup.hero` the same way.

The report's "checked and found sound" list is at its end. Do not re-hunt those.

Close the phase: `npm run balance:campaign`, `npm run test:slow`, section 13 for the phase's text, the full checks,
the closure record.

## 7. Phase 2: make defense a real decision

No battle rule changes in this phase, so there is no rules bump. Raids against villages do come out differently,
because the raider and its army change. Four hooks already exist behind data values live data does not set
(`carryByStars`, `defenseWin.perStar`, `raiderMatch`, `garrisonCrew`). The rest is new code in the simulator and the
server: the raider mixes, the league share, the loss-streak slack, the rematch share, the Next fee, the carry
exemption and the server's simulated raider. Read `defense-raids.md` in full first; its section 1 corrects a belief
three audits repeated.

**What is actually true.** The campaign's "0% held at every Keep" is the model player's village, not the game: the
model leaves every defense at level 1 and places no walls. A built base holds the raider it is sent 75 to 100% of
the time. The real defects are these: a held raid protects nothing (loot leaves with every destroyed building
whatever the stars), a hold pays 5 to 11% of what it still lost, a strong base gets no shield and so is raided more
often, the raider's strength is a point mass that climbs when honor rises, the raiders bring one ground army so
anti-air never matters, and with a server no bot raid ever happens.

**What defense cannot do, so do not try.** It cannot buy Keep pace: the whole raid tax costs 11 to 13% of pace, and
a defense costs 1.4 to 2.0 times the next Keep's price to reach two levels under its caps and 3.3 to 3.9 times to
reach them (Keeps 12 and 14). The old target "skipping defense costs 10% of the pace to Keep 12" is unreachable by
loot protection. Defense pays in wealth kept, in rewards and in visible results. P2-04 restates the gate that way,
and P2-14 removes the builder-time cost.

**P2-01 (DEF-01, DEF-02, ECO-01) Stars decide what a raider carries home, and every star denied pays.**
- Change:
  - `raids.carryByStars`: the share of what it broke open that a bot raider carries, by stars won. Starting value
    `[0.2, 0.5, 0.8, 1]` (the lab used `[0.1, 0.4, 0.7, 1]`).
  - `raids.defenseWin`: `shareOfRaidLoot` 0.15 with `perStar: true`, so each star denied pays a third. Keep it
    storage-capped and report what did not fit; do not use the `uncapped` hook. (Shipped at 0.10, with the
    carry table, the flooring and the types of this list: result 5 missed at Keep 15 at 0.15 and sat on its
    bound at 0.12 once three villages a cell were measured. The measurements are in the ledger; what is left of
    this item is the gate test, results 1 and 2 re-measured against the raider of P2-02, and the real-player
    limits.)
  - Fix the bug the hook carries: `raidVillage` computes `v = v0 * carry` and the storage branch does not round, so
    resources become fractional (a scratch run with the keys live left fractional resources in 19 of 24 Keep 5
    villages). Floor it, and add a test that no resource is ever fractional after a raid.
  - Add `carryByStars` and `defenseWin.perStar` to `RaidsDef` in `src/gameplay/sim/types.ts` (and `raiderMatch` in
    P2-02), and remove the `as` casts in `defense.ts` and `matchmaking.ts` that read them.
- Measure with `def_econ.ts` and `def_daily.ts` at Keeps 5, 9, 12 and 15, at least 24 raids a cell, for the four
  build qualities (level 1 without walls, caps − 2, caps − 1, caps). **Read this before you trust them:** both
  harnesses compute their "proposed" columns by their own arithmetic on today's `raidVillage` result; they do not
  read the live keys. Record their proposed columns before you touch `raids.json`. Once the keys are live, the
  "proposed" columns of both apply the carry twice. The "today" loss columns are then the new rule, and so is the
  "today" reward of `def_daily.ts`, which sums `record.banked`. The "today" reward of `def_econ.ts` is not: it is
  the harness's own arithmetic too (full holds only at the live share, no per-star part, no storage cap). Before you
  use `def_econ.ts` after the change, make it sum `record.banked` and give it a setting for how full the storages
  start: it starts them full, which is exactly where the cap decides the reward.
- Done when all hold, judged on the reward the record banks (`record.banked`), which is storage-capped:
  1. Net result per raid improves at every step of build quality at every measured Keep.
  2. For a one-visit player, loss per day never rises with build quality (today a maxed Keep 15 base loses 29% more
     per day than a caps − 2 base).
  3. A base at caps is close to neutral and not a profit. Gated: with storages 30% full its net per raid is at most
     35% of one full hold's reward above zero at Keeps 9, 12 and 15, against today's raider and against the raider
     P2-02 sends. Reported, not gated: the same number at Keep 5, and at all four Keeps with storages full.
  4. A village that is three-starred loses what it loses today: level 1 at Keeps 9, 12 and 15 (940 k, 3.82 M and
     22.5 M in the harness, unchanged). Keep 5 is not part of this check: a level-1 Keep 5 village already holds 54
     to 60% of raids at zero stars, so the carry rule lowers its loss (81 k to 37 k in the harness). That is the
     rule working, not a failure.
  5. A maxed base's rewards per day stay under 20% of the regular player's daily raid loot at that Keep, so defense
     is not a farm (the uncapped harness gave about 25% at Keep 15 with four visits a day).
  6. Nobody is worse off than today in any cell.
- What the starting values measured for result 3: the net of a base at caps as a share of one full hold's reward
  (10.5 k, 118.5 k, 437 k and 2.88 M at Keeps 5, 9, 12 and 15), 20 to 24 raids a cell.

  | Reward and storages | Raider | Keep 5 | Keep 9 | Keep 12 | Keep 15 |
  |---|---|---|---|---|---|
  | Harness arithmetic, uncapped | Keep + U(−1, 0), as P2-02 | −38% | +28% | +15% | +5% |
  | Harness arithmetic, uncapped | Keep − 1, today's | −38% | +30% | +24% | +19% |
  | Live keys, `record.banked`, room in storage | Keep + U(−1, 0) | −36% to −42% | +28% | +15% | +5% |
  | Live keys, `record.banked`, storages full | Keep + U(−1, 0) | −88% | −25% | −45% | −37% |

  The first two rows are the investigator's saved outputs (`econ_uniform_raider.out`, `econ_today_raider.out`). The
  last two are scratch runs by two reviewers with the keys set live, storages 30% and 50% full for "room".
- Three things about that table, because an earlier draft of this prompt had them wrong. A Keep 5 base at caps still
  loses about 4 k a raid (it lost 15 k and was paid 10 k): −38%, not +38%. No single `shareOfRaidLoot` puts Keeps 5
  and 9 inside one narrow band, because Keep 5 has about twice the loot at risk per Coin of hold reward that Keeps 9
  to 15 have (Keep 5 would need a share of 0.19 to 0.24 where Keep 9 needs 0.10 to 0.12): the ±10% band the draft
  asked for cannot be met. And with storages full the reward can only refill what the raid just took out of storage,
  so every Keep is negative there: that is the cap working. Report it and do not tune against it.
- If 5 misses, or 3 is over its bound at Keeps 9 to 15, lower `shareOfRaidLoot` until both hold, and record the
  value and what it does to the numbers of 3: it moves them down at every Keep (result 5 needs about 0.12 at Keep
  15, which takes Keep 15 of result 3 to about −17%). Do not raise the share for Keep 5. If Keep 5 falls under −50%,
  record it as open and keep the item: do not revert P2-01 for it. A share per Keep is a new key and a design
  decision: record it as open, do not add it. Do not widen the bands.
- Tests: a gate beside the campaign gates (listed in `SLOW_TESTS` if it takes more than a few seconds) that builds
  villages at the four build qualities at Keeps 9, 12 and 15, raids each through `raidVillage` with the live keys,
  and asserts from the records (`result.loot` and the reward banked) that net per raid never falls with build
  quality and, through the slot and shield rules as `def_daily.ts` applies them, that loss per day never rises
  (DEF-02 asked for this gate). Without it this phase's results are one-time readings from harnesses that misreport
  once the keys are live.
- Scope: bot raids on device villages and the server's simulated raids (P2-12). For raids by real players keep
  conservation (the defender loses what the attacker carries) and **pay honor only, as `server/core/pvp.ts` does
  today, unless all three limits below are built in the same change.** Without them the reward is a faucet for two
  accounts. A 0-star raid gives the defender no shield (shields start at 30% destruction, and P1-20 gives none when
  no loot was lost), so the same attacker can come straight back. One warrior is a valid attack, and after P1-15 the
  free hero alone is a lost attack too. Each such raid would pay a full hold: 437 k of Coins and Provisions together
  at Keep 12, 2.88 M at Keep 15. P1-20 caps honor, not resources, and result 5 is measured at the bot slot rate
  only. The limits, all from data, applied in `attack` under the row locks:
  1. the reward is paid only when the attacker deployed at least 80% of its army's housing (the rule of P2-10);
  2. at most one reward for the same attacker and defender in a UTC day, beside P1-20's honor cap;
  3. at most `raids.defenseWin.maxPerDay` rewards a day for one defender from real raids (starting value 3, about
     the bot slot rate).
- With the limits: a test for each in the attack suite, a test that twenty one-warrior or hero-only raids between
  two accounts pay nothing, and a test that five accounts in a day pay one defender at most the daily cap. A
  device-held village learns the reward from the server: add `DefenseView.reward` (additive, `docs/PROTOCOL.md`, a
  contract test, a REQUESTS entry) and pass it through `applyDefense`; the game never computes it. The same limits
  decide whether a real raid counts for the stars-denied task (P5-04) and the raids-held achievement (P5-05).
  Without the limits: write what they need in `docs/backend/REQUESTS.md`, and the closure record says raids by real
  players still pay honor only.
- Strings: 1 or 2 for the defense log line ("kept X of Y"), built in Phase 6.

**P2-02 (DEF-04) Raiders come from the defender's Keep, not from honor.**
- Why: measured. At the campaign's honor the raider is the same one every time (Keep − 1 at the low end). With more
  honor it climbs: the defender's own Keep from about 350 × (Keep − 1) honor and Keep + 1 from about 350 × Keep
  (Keep 12 at 4,300 honor meets a Keep 13 raider 91% of the time). Holding raids raises honor, so holding summons a
  stronger raider.
- Change: `raids.raiderMatch: { lo: -1, hi: 0 }` (the hook is in `matchmaking.ts` `attackerFor`).
- Done when: `raider_dist.ts` shows a spread across the band at every honor, and no honor value moves the raider
  above the defender's Keep.

**P2-03 (DEF-05) Raiders bring more than one army.**
- Why: `raids.json` `botArmyMix` has no flyer at Keeps 7 to 15 and uses four of ten roles. Sky Bows, Ballistas, the
  Lantern Line and two of three temper axes never matter on defense.
- Change: `raids.raiderMixes`: two or three alternates per Keep band (today's line, an air raid, a shadow and siege
  raid), picked by the raid's seed in `attackerFor`. `botArmy()` and its other callers stay as they are.
- Measure each alternate in the army lab against generated bases of its Keep: none may be a free hold (under 20%
  destruction on average) or a free three stars (over 85%) against a caps − 1 base.
- Done when: a base without anti-air does measurably worse against the air alternate than one with it, at Keeps 8,
  12 and 15.

**P2-04 (DEF-03) Teach the campaign to see defense, and replace the known-failing gate.**
- Change: add a `regular_fortress` entry to `CAMPAIGNS` with
  `name: 'Regular fortress (4 sessions a day, every defense within 2 levels of its cap before each Keep)'`,
  `opts: { raidsPerSession: 2, policy: 'fortress', fortressGap: 2 }`, `casual: false` and `maxDays: 220`.
  `CampaignSpec` requires all five fields, and `casual` decides the visit pattern. The `fortress` policy exists in
  `tools/balance/playerModel.ts`; its default gap is 1, the strictest. Give that campaign's village a real layout
  through a data clone with `raids.labAutoLayout` and `labWalls`, passed by the campaign tool to the new campaign
  only. Live data never sets those flags: add a test that `defaultData.raids` has neither. `labWalls` hands the
  village walls it never paid for: say so beside the campaign's results.
- Replace the `KNOWN FAILING (PS-1, open)` assertion in `campaign-gates.test.ts` with gates that say what defense is
  for. Three hypotheses to start from: the fortress holds at least 40% of raids at Keeps 9 to 15; its
  stolen-to-looted ratio is at most 0.6 times the rusher's; it reaches Keep 12 within 1.25 times the rusher's days.
  Know where they come from: the only campaign evidence is the lab's run with hired artisans, a garrison crew of 2,
  the lab's carry values and uncapped rewards, and even that run met only some of them (stolen share 0.76 times the
  rusher's for the gap-3 fortress; Keep 12 at 1.21 and 1.30 times for gaps 3 and 1). A gap-2 fortress that hires
  nobody was never run. Set each gate from your first full run with at least two days or five points of margin, say
  so in the record, and set the pace gate from the run with P2-14's crew on.
- Phase 3's keys and the Phase 4 bump both move these numbers. P3-01 and the close of Phase 4 authorise restating a
  gate set here from the new run with the same margins, old and new value in the record. Nothing else does.
- Do not change the behaviour of an existing campaign policy. Add policies. The history of every gate depends on the
  old ones staying comparable.

**P2-05 and P2-06 (DEF-06, DEF-11) A long absence must not empty the treasury, and exhaustion must reach the
once-a-day player.**
- Why: measured. Thirty days away with storages 30% full loses 94 to 97% of what was stored, and the welcome-back
  screen lists 24 raids. Exhaustion (each lost raid in 24 hours halves the next raider's take) rarely catches raids
  a day apart.
- Change: `raids.maxRaidsPerCatchUp` 24 → 3 and `raids.exhaustion.windowHours` 24 → 36. Measure them together with
  `away.ts` (level-1 defenses; storages 30% full and full). With the cap alone Keep 9 still loses 37% of what was
  stored; with both, 24.9% at Keep 9 and 15.9% at Keep 12. With a cap of 3 a week and a month away lose the same.
- Done when: the loss from storage is at most 30% of what was stored for any absence, at Keeps 9 and 12, at both
  fill levels. If Keep 9 is over, lower the cap to 2. The regular player's Keep 15 day stays inside its gate.
- Tests: add the absence case to the gate file of P2-01, read from the records: 30 days away loses at most 30% of
  what was stored at Keeps 9 and 12.

**P2-07 (DEF-08, ECO-07) Settle the score loses resources even at three stars.**
- Why: measured. Three stars pay 437 k at Keep 12 against a 607 k army and 1.67 M banked by an average raid (Keep
  10: 192 k against a 267 k army).
- Change: `raids.rematch.recoverShare` (starting value 0.75): the reward is the larger of today's and
  `recoverShare × stars ÷ 3 ×` what that raid took (`record.result.loot`). `rematchReward` and `rematchEnd`.
- Done when: at 2.5 stars the rematch is worth about a normal raid and at three stars a little more, at Keeps 5, 10
  and 15. It stays once per raid, 72 hours, no honor, labelled simulated.
- Touches: the server replays `rematchEnd`. Strings: 0 to 1.

**P2-08 (DEF-09) Declared stakes are a button nobody should press.**
- Why: break-even hit rates are 91% (two stars) and 80% (three). The regular campaign's rates at Keeps 10 to 15 are
  50 to 64% and 4 to 17% (Keeps 5 and 9 are 85 to 90% for two stars).
- Change: `raids.stakes.byStars` to `{ "2": 1.3, "3": 1.75 }` (break-even 77% and 57%).
- Done when: over the whole regular campaign, raid-weighted, declaring two stars with the bot plan is still a loss
  (it is a skill bet, not free loot), and for a player who hits two stars four times in five it is a gain. List the
  Keeps where the bot plan gains (expected: 5 and 9, and the casual model at 13 to 15) and state both numbers in the
  record. A two-star hit rate is not a column of `campaign.json`: derive it as `stars − won − threeStar` (regular
  Keep 15: 1.55 − 0.8125 − 0.1 = 0.64).

**P2-09 (DEF-10, ECO-08, RET-14) The league win bonus fades from 30% of a raid at Keep 5 to 1.4% at Keep 15.**
- Change: a new key per league, for example `winBonusShare`: a share of the Keep's lowest generated raid loot
  (`battle.generatedLootByHall[keep − 1].min`), applied to each resource as `defenseWin` does, for three stars,
  scaled by stars ÷ 3. Starting values 2% in Cedar rising to 15% in Kage. This is the pattern `defenseWin`,
  `rematch` and `trialReward` already use; it is not `rewardScaleByHall`. Do not tie the bonus to the raid's own
  loot. `leagueWinBonus` needs the Keep: update its callers and `matchmaking.test.ts`.
- The share replaces the amounts; it is not paid on top of them. Keep the meaning of the existing `winBonus` key
  (amounts) but stop paying it: set every league's `winBonus` to `{}` in the same commit, so that only the share is
  paid. Iron pays 5,000 of each resource today, 30.6% of the average Keep 5 raid; paid as well as the share, the
  result below fails at once. The Honor panel prints `winBonus` as cost chips today: make it print the share's
  amount at the player's Keep.
- Leave the season reset as it is.
- Done when: the three-star bonus, Coins and Provisions added together, is between 5% and 20% of the regular
  campaign's banked loot per raid (`campaign.json` `byKeep[].loot`) at every Keep from 5 to 15, at the league that
  row's `honor` falls in. Equal steps from 2% in Cedar to 15% in Kage do not meet it: Keeps 5 and 7 pass at 8.9% and
  6.7%, but Storm (10.7%) gives 20%, 22% and 33% at Keeps 13, 14 and 15. Lower the upper leagues until it holds and
  record the table. Show it on the Honor panel (an existing number, no new sentence if possible).

**P2-10 (DEF-12) A struggling player's opponents never get easier.**
- Why: the casual explorer wins 18 to 19% at Keeps 13 and 14 while honor falls, because the research floor sets the
  opponent.
- Change: `ranks.matchmaking.lossStreakSlack`: 0.25 of slack per consecutive lost raid, cap 1.0, reset by a win,
  counting only raids that deployed at least 80% of the army's housing so it cannot be farmed with one-warrior
  losses. Put it in a shared helper that `opponentFor` uses. `opponentFor` is the device path only: the server's
  generated fallback in `server/core/pvp.ts` has its own floor. Decide whether it gets the same slack and note it in
  `docs/backend/REQUESTS.md`.
- Done when: the sandbagger gate still holds and a deliberate-loss strategy (lose four, then raid) measures worse in
  loot per hour than playing straight.

**P2-11 (DEF-13) Next is priced by the player's Keep while the offers are a Keep lower.**
- Change: in `scoutFee`, price by the Keep the player is matched against. Say how that Keep is derived before the
  next base is known (from `attackerStrength` minus the slack, as matchmaking does).
- An existing test pins the fee at 2 to 5% of the average generated loot at the player's own Keep
  (`tests/gameplay/sim/matchmaking.test.ts`); priced a Keep lower it is 1.1 to 2.2% of that and fails. This item
  authorises restating that test against the Keep the fee is priced by, and adds a second check with
  `next_offers.ts` changed to call `scoutFee()` on a village of that Keep and research: the fee is 1.5 to 2.5% of
  the mean offer at Keeps 5, 9, 12 and 15. As written the harness prints `scoutFeeByHall[K - 1]`, the player's own
  Keep, and shows 4.82%, 1.56%, 1.60% and 3.32% before and after the change; with the fee of the matched Keep the
  same means give 1.93%, 1.56%, 1.60% and 1.88%.

**P2-12 (DEF-07) With a server, a village is never raided unless a real player attacks it.**
- Why: `src/main.ts` sets `botRaids: !serverUrl`. At launch population that means no raids at all: defenses,
  shields, exhaustion, the defense log and Settle the score are dead in exactly the build that ships, and the game
  runs 11 to 13% faster than every gated campaign.
- Change (server): when a server-held village has had no real raid in the last N hours, the server sends a
  **labelled simulated raider** at the bot slot rate, through the same `raidVillage` arithmetic and `applyDefense`,
  re-simulated in the worker pool, with the same shield, exhaustion and reward rules as a device village. The
  record is `simulated: true` and the interface says so. A real raid always takes priority.
- Follow 3.3: an additive `/v1/hello` feature, `docs/PROTOCOL.md`, a contract test, a migration if the schedule
  needs a column, account deletion unaffected.
- The design must also state, and tests check, four things the project's rules require of a raid the server makes
  up:
  - it never moves the Attack or Base Rating (bots never move a rating: `docs/DECISIONS.md`, `docs/PROTOCOL.md`);
  - it sends no push. The existing `raided` push reads "<name> raided your village" with no label, the device build
    sends none for a bot raid, and a made-up raider must never be what calls a player back. The welcome-back report
    shows the raid, labelled;
  - its honor change and shield are written to the player row and `ctx.board` in the same transaction as the
    village, and the record says whether a held simulated raid pays honor on the public board;
  - a village that stays on the device but plays online is covered too: `botRaids: !serverUrl` switches its local
    bot raids off as well. Give it its local bot raids back, yielding to any real raid the server reports, or say in
    the closure record that it is still never raided.
- Whether or not this item ships: the push a defender receives after a real raid is built in `server/core/pvp.ts`
  `attack` with the attacker's name not isolated (`duels.ts` uses `isolateName` for the same kind of sentence; root
  `CLAUDE.md`, Text). Wrap it there, so the existing pattern `{arg1} raided your village` still translates, and add
  a server test that checks the isolation marks around the name.
- If this is too large to finish safely, write the full design in `docs/backend/REQUESTS.md` and leave it open. Say
  so in the closure record in words an owner cannot miss: online, defense does nothing until this ships.

**P2-13 (optional, ECO-11, CU-1) Towers payable in Provisions.** Coins bind 1.1 to 2.7 times harder than Provisions
at Keeps 3 to 12. Adding `defense` and `support` to `economy.provisionsPayable` gives the idle currency a use.
Measure the regular and casual pace before deciding; skip it if either moves by more than 5%.

**P2-14 (built-not-live opportunity 4) The garrison crew: defense builds do not take a Village Artisan.**
- Why: defense competes with growth for builder time, and P2-01 cannot change that (the preamble's "what defense
  cannot do"). The hook exists (`economy.garrisonCrew`, read in `builderStatus`). The lab's Rules 10 patch used 2.
- What the hook covers today: the `defense` and `trap` categories only. Two of the five live counters are category
  `support` and stay on the artisans (decide whether they join the crew and change the hook if so). Walls take no
  builder at all. Three callers ignore the crew and must not: the top-up check refuses a Jade top-up for a defense
  while the artisans are busy (pass the building type), the next-objective chip does not see the crew, and the
  `all_builders_busy` offer trigger can fire after a crew build.
- Change: add the key to `economy.json` with its type (starting value 2, the lab's), and unit tests for the hook:
  absent or 0 plays exactly as today; with it, a defense upgrade starts with every artisan busy; a `support`
  building follows the decision; a top-up for a crew build is offered; the offer trigger does not fire for a crew
  build. It is free and never sold: no product, no offer, no Jade price. The second queue in the builder panel is
  P6-12.
- Done when: `regular_fortress` reaches Keep 12 sooner with the crew than without it, by more than the two days a
  single seed carries, and the regular player's Keep 15 day stays inside its gate. Record the fortress-to-rusher
  ratio with the crew on and off; P2-04 sets its pace gate from the crew-on run by its own rule. 1.25 is a
  hypothesis, not the bar: a miss by a few hundredths must not revert the crew.
- For orientation only: the lab's fortresses, which hired artisans, reached Keep 12 at 1.21 (gap 3) and 1.30 (gap 1)
  times the rusher's days under its whole raid patch with a crew of 2, and at 1.28 and 1.40 times with the auto
  layout alone. That difference also contains the changed raid rules. The crew can also speed the early Keeps: check
  the Keep 6 floor (3.4).
- Touches: the server replays `place` and `upgrade`. Strings: about 3, in Phase 6.

**P2-15 (UIS-07) The diversity carry cuts the tutorial raid.**
- Why: at Dojo level 1 only Shinobi can be trained, so the first result screen a player ever sees says "Your squad
  carried 85% of the loot". The rule is meant to reward a choice the player does not have yet.
- Change: the carry is full while the village can train fewer than two roles (a data value in `raids.diversity`).
  Give `raidCarry` and `diversityShare` in `sim/carry.ts` the village (or the count of trainable roles), and use the
  one function in `battleEnd`, `settleOnlineAttack` and the result screen: today `battleHud.ts` recomputes the share
  from the army, so it would still print 85% after the fix; it must call the same shared helper with the village. Do
  not print the record's `carry` there: that is the diversity share times the stake multiplier, 0 on a missed stake,
  absent when it is 1 and absent while an online raid is pending. Update `round2-rules.test.ts`, whose new village
  expects the cut. Show the share before the raid, not only after it (P6-13).
- Test: the tutorial army carries 100%; a one-role army at Keep 5 still carries 85%.

Close the phase: campaign, slow tests, section 13, full checks, the closure record. Rewrite the "Is defense worth
building?" section of `docs/game-theory/CAMPAIGN.md` through its generator, and correct the E26 and PS-1 statements
in `docs/store/WORLDWIDE_AUDIT.md` by adding a dated record (never by editing old ones).

## 8. Phase 3: pacing, the first hour, and prices that stay sane

The regular player's curve is healthy and should stay almost where it is (Keep 15 on day 113, gated to 100 to 140).
The casual curve is broken by three numbers. Read `pacing.md` first.

**P3-01 (PAC-01) The casual Keep 5 to 6 wall: 26 days, exactly where day-30 retention is measured.**
- Why: reproduced to the decimal. At Keep 5 bot raids take 2.34 M of the 2.24 M the collectors produce in 25 days.
  A once-a-day player banks 8 of 24 hours, loses 20% of stored plus half of what is uncollected about 1.1 times a
  day, and Coins stall near 300 k under a 500 k Keep.
- Change, three keys measured together as a full campaign:
  - `economy.json` `collectorHoursCap` 8 → 24
  - `economy.json` `raidableUncollectedFraction` 0.5 → 0.25
  - `raids.json` `shieldTiers[].hours` 12 / 14 / 16 → 16 / 20 / 24
- Follow-ons the keys force:
  - `economy.json` `collectBubbleMinFraction` 0.02 → 0.007 (keeps the first collect bubble near ten minutes);
  - the two building descriptions that say "Holds 8 hours of output" (data text, so `i18n:extract` and 49
    translations of two strings; better, make the sentence read the number);
  - two pinned tests, which this item authorises changing to the new numbers: the shield hours in
    `tests/gameplay/sim/raids.test.ts` (12 / 14 / 16) and `tests/gameplay/sim/resources.test.ts` "stop at 8 hours of
    output", which asserts `200 * 8`;
  - the "Collectors are full" reminder, which `sim/reminders.ts` times from `collectorHoursCap`: with the cap at 24
    it fires a day after a collect instead of eight hours, so a player who visits more than once a day never gets it
    again. Decide and record in `docs/DECISIONS.md`: leave it at the fill time, or fire it at a data-set share of
    the cap with a title that stays true (one changed string in 49 languages). Add the case to
    `tests/gameplay/sim/return-hooks.test.ts`.
- Do not lower the Keep 6 cost. `tests/gameplay/balance/curves.test.ts` requires the early cost multiplier never to
  shrink, and it only moves the wall to Keep 6 to 7.
- Measured result to reproduce (single seed, ±2 days): casual Keep 5 to 6 in 13 days (was 26), casual Keep 15 on day
  207 (was 246); regular Keep 15 unchanged at day 113, largest speed-up 11% at Keep 8.
- Done when: the casual stretch from Keep 5 to 6 is 10 to 16 days, no casual stretch through Keep 10 exceeds 21
  days, and the regular player's Keep 15 stays inside 100 to 140 days **with Phase 2 already applied** (the two
  phases move the same quantities; measure them together).
- The three keys also move Phase 2's own results. Longer shields protect a base that falls and not one that holds,
  and 24 hours at a quarter exposes six hours of production where 8 hours at a half exposed four. After setting
  them, re-run `def_daily.ts`, `def_econ.ts` and `away.ts` and re-check P2-01's results 2, 3 and 5 and P2-05's 30%
  bound, recording both sets of numbers. If result 2 now fails, change the shield tiers, not P2-01's bands. If a
  gate that P2-04 or P2-14 set from Phase 2's run fails here, this item authorises restating it from the new run
  with the same margins, old and new value in the record.
- A second pace gate sits beside the Keep 15 window, and this prompt does not authorise moving it:
  `tests/gameplay/balance/progression.test.ts` (slow suite) holds the regular model's Keep 6 between 9 and 17 days.
  It is 9.42 days today, 9.19 with the three keys, and exactly 9.00 with the three keys, the 60-second Keep 2 and
  tier-1 training halved (P3-04). Anything else that speeds up Keeps 1 to 5 (P1-03, P2-14, P3-07, P3-11's storage)
  takes it under 9. Measure Keep 6 with the phase's other numbers after each such item. Where a change takes it
  under 9 days, choose the value that does not, or leave the item open with the number.

**P3-02 (PAC-02, PAC-08) Gate the casual pace, and model the player the game actually allows.**
- Add to `campaign-gates.test.ts`: casual reaches Keep 6 by day 25, and no casual stretch between Keeps is longer
  than 21 days through Keep 10.
- Add campaign policies (do not alter existing ones): one that hires the third artisan with the starting Jade
  (`hireBuilders`), one that queues the second army (`economy.json` `queuedArmies` allows it; the model's `train()`
  stops at camp capacity). Report them in `CAMPAIGN.md`. They describe a believable player; the gated baseline stays
  the conservative one.
- Add to `campaign-gates.test.ts` the casual player's `totals.stolen / totals.looted` (1.56 today; the casual
  explorer 2.66). The existing test of that ratio gates the regular campaign only, and ECO-01 asked for under 0.75.
  Set the gate from the first full run with Phases 2 and 3 applied, with five points of margin, and never above 1.0:
  a once-a-day player must not lose more to raids than they loot. If the run is above 1.0, P3-01 is not done: lower
  `raidableUncollectedFraction` again, or `raids.storageLootCapByHall` at Keeps 5 to 8 (the pacing report measured
  ×0.6 there: the same 13 days, less stolen), and run again. Report the explorer's ratio beside it; it is gated
  after P4-09.
- The game's side of PAC-02 (Appendix B keeps the starting economy; this does not change it). Today the only text
  that tells a player a third Artisan can be hired is the paid Artisan's Bundle offer, which minors and players of
  unstated age never see. When a build or upgrade is refused because every Artisan is busy and the village holds
  enough Jade for the next hut, the refusal names the Artisan's Hut and opens the Build panel on it (reuse the hut's
  name and the busy sentence; at most one new string). It is never an offer, shows no price in money, and is not an
  objective-chip kind (protected item 35). Test: shown with 250 Jade and two huts, not shown with 249. Without it
  the hiring campaign of this item describes a player the game does not produce.
- Record "upgrade several levels in one job" (pacing opportunity 4) in the ledger as an open idea: it is the
  report's other answer to two upgrades a day.

**P3-03 (PAC-03, ECO-12) Three quarters of all builder time is Mints, Farms and storages at a flat seven days a
level.**
- Why: 1,294 of 1,771 builder-days. Every level from 15 up is seven days, and only collectors and storages have many
  such levels. A collector also produces nothing while it upgrades, so a Mint's level 15 forfeits 1.59 M Coins on
  top of its price.
- Change: cap `buildSeconds` of the four economy buildings (Coin Mint, Terraced Farm, Treasury, Storehouse) at three
  or four days from the level where they reach it. Let a collector keep producing at its old level while it
  upgrades, or failing that print the lost output in the upgrade quote.
- The collector change works inside protected item 57. A collector's accrual start is written in seven places:
  `place`, `upgrade`, `skip`, `cancel`, `collect` and `applyDefenseLosses` in `sim/village.ts`, and the raid's take
  in `sim/defense.ts` (a hashed campaign source). Five of them push it to the upgrade's end. Change them together:
  old-level output is banked up to the upgrade's end at that point of the timeline, and a test shows that a raided,
  upgrading collector keeps producing at its old level. The sheet's sentence `sheet.collectorPause` ("It produces
  nothing while it upgrades…") then becomes false: reword it (1 changed string, 49 translations) and correct "the
  collector pause" in `src/presentation/CLAUDE.md`.
- `tests/gameplay/sim/data.test.ts` exempts a level from its "about 2.2 times longer each level" check only when it
  is exactly seven days; with a lower cap every capped level after the first fails it. This item authorises changing
  that exemption to "a level at its building's cap", with the cap as a named data value in `economy.json`, in the
  same commit. Not in `buildings.json`: a new key there would enter the combat fingerprint (3.1).
- Measured: a three-day cap brings the total to 1,089 builder-days and the regular Keep 15 to day 98, which is under
  the gate; a four-day cap gives 1,267. Choose the cap that keeps the regular Keep 15 at 100 days or more. The gate
  is the owner's stated target and does not move.
- `buildSeconds` is outside the combat fingerprint. The collector change alters what `advance` computes, so the
  server replays it.

**P3-04 (PAC-04, UIS-02, PLY-03) The first raid arrives after two idle countdowns: about 14 minutes without Jade.**
- Why: the tutorial upgrades the Keep (240 s), then stops at a step whose ring sits on the Jade "Finish now" button
  until the Keep is level 2, then trains 20 Shinobi at 20 s each and stops again. Played in a browser without Jade
  it is about 14 minutes to the first battle; the model player gets five raids in the first hour, the first at
  minute 18. The step before asks the player to tap a coin that needs 576 seconds to appear, and five Collect taps
  answer "Nothing to collect yet".
- Change:
  1. Keep the nine steps and their order (the save stores the step index, so no migration is needed). Step
     `finishKeep` (the fourth) is done when the Keep is level 2 **or is upgrading while an Artisan is free**, so
     the army steps run while the Keep builds. Remove the Jade button and its confirm from that step's targets. The
     later step `finishTrain` also rings a Jade "Finish" button: either remove that target too or leave it and say
     so; `src/presentation/CLAUDE.md` documents that selector and must be updated with whichever you choose.
  2. While the tutorial is running, the collect bubble shows as soon as one coin exists.
  3. Data: Keep level 2 `buildSeconds` 240 → 60 (outside the combat fingerprint).
  4. Make the first armies train faster. The pacing report's proposal (Dojo levels 1 to 4 `trainingSpeed` 2 / 2 /
     1.6 / 1.3) **cannot ship as written**: the live table is 1, 1, 1, 1, 1.2, 1.4, 1.6, 2, ..., so it would make
     upgrading the Dojo slow training down; `tests/gameplay/sim/audit-pacing.test.ts` pins a level 2 Dojo at speed
     1; and the Army panel prints the speed as a multiple "of a level 1 Dojo" whenever it is above 1. Reach the same
     result another way: shorter `trainSeconds` for the tier-1 warriors, or a Dojo table that never falls with level
     and a panel sentence that divides by the level-1 speed. `trainSeconds` is outside the combat fingerprint and
     nothing pins a tier-1 value: `progression-model.test.ts` holds only an upper bound (a full army of the newest
     warriors refills in two hours or less), and `tools/progression/pacing.mjs` rewrites `trainSeconds` for tiers 2
     to 5 only, so a tier-1 value set by hand survives it. If the level 1 or 2 Dojo speed changes, that test and
     that sentence change in the same commit, and the string is counted.
- Done when: `scripts/pacing/firsthour.mjs` shows at least seven raids in the first hour with Keep 3 still between
  40 and 80 minutes (`progression.test.ts` holds that window; the report's own variant gave seven raids and Keep 3
  at minute 44, four minutes above the floor); and a scripted run of the tutorial at 360×640, training the army the
  tutorial suggests, reaches the first battle in under four minutes with no Jade spent and no tap answered "Nothing
  to collect yet". The model harness cannot show the tutorial's time: it plays sessions two minutes apart. The
  scripted run needs a browser: the Phase 6 preamble says how to find the one the machine has and what to record if
  there is none.
- Halving tier-1 training with the 60-second Keep 2 puts the regular model's Keep 6 at exactly 9.00 days, the floor
  of the slow suite (P3-01). Measure it before you choose the training time.

**P3-05 (PAC-13) Keep 3 opens with a lost raid.**
- Why: after four three-star raids at Keep 2, the regular model's first Keep 3 raid is zero stars; the casual model
  wins none of its two Keep 3 raids.
- Raising `ranks.json` `powerSlackByKeep` for Keep 3 does nothing for the regular player: its strength minus the
  slack is already below the hard floor of the opponent window (`matchmaking.ts`, the clamp to own Keep minus the
  halls below), so it already meets the weakest base the window allows. Measured at 1.25 and at 2.0: no change.
  Slack helps only the casual model, whose strength (2.91) sits above the floor.
- Change: re-measure after P3-04 first (its faster armies alone gave 1, 1, 2, 2 stars on the first Keep 3 raids). If
  the first raid after a Keep upgrade is still a loss, use a lever that acts below the window: a softer generated
  base for the first two raids after a Keep upgrade (a `levelBias` cut, or one more Keep below, from data in
  `ranks.json`), in a shared helper, with the same note about the server's fallback as P2-10. The lever needs stored
  state: nothing in a village records when the Keep last levelled or how many raids were fought since, and the
  battle log holds ten records with no Keep on them. Add a count of raids fought at the current Keep to the one save
  bump, reset in `advance` when the Keep's level rises and counted in `battleEnd` and `settleOnlineAttack`.
- Done when, by model: the regular Keep 3 average is 1.2 stars or more and its first Keep 3 raid wins a star; the
  casual Keep 3 average is at least 1; the three-star farming gate still holds.

**P3-06 (PAC-09, playthrough opportunity 4) A late starter clears dozens of trivial Trial tiers at a loss.**
- Why: a tier pays by its own Keep. A Keep 10 player starting the ladder has 36 easy tiers, each costing a full army
  for 0.5 to 60 k. In play, a Keep 5 village's first tier paid 500 of each resource against 200,000 in storage.
- The mechanism has to be stated, because `trialEnd` refuses any tier above the next uncleared one: a player may
  attempt the first tier of the Keep that is `catchUpKeepsBelow` (a new key in `trials.json`, starting value 2)
  below their own, even when lower tiers are uncleared. Clearing it sets the best tier to it, pays every skipped
  tier's reward once, adds every skipped tier to `stats.trialsCleared` (the Trial Walker achievement and the Trial
  task count that stat, not the best tier) and grants anything else tied to a skipped tier (the tier looks of
  P5-06). Change the lock in `trialEnd` and the helpers and panel that assume the next tier is the best plus one
  (`nextTrialTier`, the variant and alternate helpers, the Trials panel). "Tier 2 is locked until tier 1 is cleared"
  stays true for a Keep 1 village, and "paid once per tier" stays true for everyone.
- Test: a village that jumps to its catch-up tier has `trialsCleared` equal to its best tier. Without that a Keep 10
  player who jumps 28 tiers stays 28 short for good, and the upper steps of Trial Walker become unreachable for that
  player: the defect P1-06 removes, made again.
- Touches: the server replays `trialEnd`. Strings: 1 (the result line listing what was cleared).

**P3-07 (PAC-10) After two raids a session has nothing left that pays.**
- Why: army refill is 50 to 104 minutes from Keep 5; every battle mode spends the same warriors; practice pays
  nothing.
- Change: a **daily drill**. One practice battle a day against the player's next Trial fortress, with nothing
  spent, paying a small fixed Keep-scaled reward once per local day (about a fifth of the daily chest), labelled
  practice. It needs a command the server can replay and re-simulate: `drillEnd`, in `PLAYER_COMMANDS` and
  `BATTLE_COMMANDS`, and a stat for the day's task.
- `drillEnd` rebuilds its army itself, as `trialEnd` rebuilds the base: a full-camp army of the village's own mix at
  its researched levels (a new helper; `practiceArmy` is the "Try this warrior" helper and needs a troop). It
  ignores the army and levels the client sent, does not check them against the camps, and does not spend warriors.
  The setup goes through the sanitizer of P1-11.
- Done when: on a local day's first visit without warriors, one action pays within two minutes, and the drill cannot
  be claimed without a battle the server re-ran in which at least one warrior fought. Say in the record what this
  does not close: on later visits the same day nothing pays while the army trains (PAC-10 is narrowed to one session
  a day, not closed).
- The drill's record, if it keeps one, carries a marker so that `recentRaidArmies`, `recentRaidRates`, the loss
  streak of P2-10 and the first-attack rule of P3-12 ignore it. Its label says what is true (nothing is spent; a
  fixed reward once a day), not the Try battles' "nothing is spent or won" (protected item 46).
- Record as an open idea, with what it needs: Trial attempts that spend no warriors (economy opportunity 1 and
  PAC-09's alternative). Rewards are already paid once per tier, so it is no farm, but its effect on Trial pace and
  on mastery experience is unmeasured.
- Touches: save (a stat for the task and the local day of the last paid drill, both in the one save bump: a lifetime
  stat alone cannot keep "once per local day"), commands, server, UI. The reward speeds the early Keeps a little:
  check the Keep 6 floor (P3-01). Strings: about 4.

**P3-08 (ECO-04, CU-5) Top-ups and army finishing are 37 times dearer at Keep 15 than at Keep 1, and offers scaled
by the same table are hollow.**
- Why: one hour of income costs 15 Jade at Keep 1 and 550 at Keep 15; finishing a Keep 15 army costs 461 Jade for
  one extra raid; the Keep Celebration's supplies are 0.34 hours of production at Keep 15.
- Change: regenerate `topUpScaleByHall` (in `src/gameplay/data/store.json`) with `tools/balance/topup.mjs` at an
  exponent near 0.75 instead of 0.5; starting value 0.76. **The tool as written cannot do this correctly**: at 0.75
  it prices a raid's loot at 830 Jade at Keep 14 and 790 at Keep 15, and `tests/gameplay/economy/topup.test.ts`
  requires that price never to fall with the Keep. Add a second rule to the tool beside its "a rush must cost more"
  rule: lower a Keep's scale until its raid price is at least the previous Keep's. The tool also overwrites
  `trainingSkipScaleByHall` with the top-up scale on every run: give that table its own formula (the one in
  `scripts/economy/econ3.cjs`: raid price ÷ (4.5 × the two-hour training skip), at least 1, kept at 1 through Keep 5
  and never falling with the Keep).
- Why 0.76 and not 0.75: with the arithmetic of `econ3.cjs` and that second rule, 0.75 leaves the Keep Celebration
  at 0.9998 hours of production at Keep 14 and 0.77 takes an hour of income at Keep 7 to 69 Jade; 0.76 gives 70 to
  202 Jade an hour, 1.03 hours and a 26,820 Jade rush. The three results below have no margin at Keeps 7 and 14:
  print every Keep, not the nine the script shows.
- Keep (protected item 22): the top-up's shape. Keep every invariant `topup.test.ts` and
  `docs/game-theory/TOP_UP.md` state; update the document through its numbers.
- Done when: an hour of income costs 70 to 210 Jade from Keep 5 to 15; the Keep Celebration's supplies are worth at
  least an hour of production at every Keep from 5 to 15; a full Keep 1 to 15 rush by Jade costs at least 25,000
  Jade (it must stay a bad idea). Report the Starter Pack and War Supplies in hours of production and in armies: if
  either is still hollow (the Starter Pack is 17 to 22 minutes of production today, and this change does not raise
  it), change its contents in `offers.json`, not the scale.
- Then finish the second half of P1-05.

**P3-09 (ECO-10, E06) Paying to rush the Keep makes the game worse for the buyer and nothing says so.**
- Why: reproduced. A Keep 15 village with level-1 research meets only Keep 14 bases and is raided by Keep 14 armies.
  `nextObjective` recommends the Keep whenever it is affordable.
- Change: `nextObjective` prefers a research or army objective over the Keep while the army's strength is more than
  one Keep behind the village; the Keep's upgrade sheet shows one plain line when that is the case. No forced
  prerequisite: matchmaking already prices rushing, and the choice stays the player's.
- Strings: 1.

**P3-10 (PAC-14) The pacing documents disagree with the generated campaign.** After the phase, rewrite the "Pacing
targets" of `docs/game-theory/PROGRESSION_MODEL.md` from the regenerated campaign: days per Keep for both players,
the builder-day horizon, where the Trial ladder ends.

**P3-11 (PLY-04) Storage is full after the first raid.**
- Why: seen in play. Raid 1 fills storage; the tutorial's own closing chest answers "Storage is nearly full...
  anything that does not fit is lost"; raids 2 and 3 threw away 1,833 Coins and 1,258 Provisions. The objective
  chip pointed at the chest while Keep 3 cost exactly the 4,000 the player held.
- Change: `nextObjective` returns an affordable Keep or storage upgrade before the chest when a storage is at 90% or
  more; the scout screen says when the loot on offer will not fit; the tutorial's last line points at the Keep first
  and the chest second. Consider raising Keep 1 and 2 storage in data so three first raids fit (`storage` is outside
  the combat fingerprint; the campaign must be re-run, and the Keep 6 floor of P3-01 checked).
- Done when: a scripted first session of three raids loses nothing to overflow when the player follows the chip.
- Strings: 1.

**P3-12 (PLY-11) The tutorial's forced first raid silently ends the 24-hour new-player shield.**
- Change: a village's first attack does not end its new-player shield. Define the exemption on state the simulator
  has, from a data value in `raids.json`: the server cannot see tutorial progress, which is device-only. "No earlier
  attack record" is not that state: the battle log keeps ten records, which Trial, Bounty and rejected records
  share, so it can become true again inside the 24 hours. Use a lifetime count of attacks made, a new stat in the
  one save bump (`raidsWon` and `starsEarned` both stay 0 after a lost first raid).
- `battleEnd` is not a player command; the server applies it as its own result and also ends the attacker's shield
  in its own code on the player row (`server/core/pvp.ts`). Put the rule in one shared helper and use it in both
  branches of `battleEnd`, in `abandonBattle` and in that server path, with a server test, so the rule exists once.
  `abandonBattle` ends the shield today when warriors were sent, and writes no attack record: it counts as an attack
  made, so a first raid that is abandoned keeps the shield and uses the exemption up. From then on the scout screen
  shows one line while a shield is running: attacking ends it, with the time left.
- This reverses a pinned rule on purpose and this item authorises it: `tests/gameplay/sim/defense.test.ts` "attacks
  change trophies and end the shield" attacks from a brand-new village and expects the shield to be over. Restate it
  as "a village's first attack keeps its new-player shield, the next attack ends the shield".
- Strings: 1.

Left open on purpose, record them as such: the currency load imbalance late (ECO-11: no late Coin sink, research is
100% Provisions; P2-13 is the only lever tried), the hollow second and third research lanes (PAC-12), and Keep 11
adding no army housing (PAC-06). All are real, none has a measured fix, and a guess here would move every Keep.

Close the phase: campaign, slow tests, section 13, full checks, the closure record.

## 9. Phase 4: battle strategy, under one rules bump

Read `combat.md` and `built-not-live.md` first, then section 3.1 again. Everything in this phase is developed and
measured before the bump, then lands together: it is built on the rules branch of 3.1 step 1, one commit per item
there. Do P4-08 first. Every "before" number of this phase depends on its seed count.

**What decides a raid today** (measured, `combat.md` 1): the army (10 to 60 points between armies of equal housing)
and the entry point (best minus worst side 30 to 45 points). Formation is worth 10 to 20. Everything the game
presents as tactics is small: all three Smoke charges 2 to 3 points, the hero 0 to 4, his Rally 0. Holding a reserve
costs 13 points. The goal of this phase is that each thing the game teaches as a decision is worth making, that no
warrior is a trap, and that no single army answers every base. It is not to rebalance the roster.

**What not to do.** Do not switch on Rules 10 (`docs/game-theory/rules10/`). Its own pass table fails, seven of ten
Keeps were never tuned, it needs a class on all 50 warriors and per-warrior multipliers from 0.51 to 2.71 that
contradict the power model the live roster is pinned to (protected item 13). Take its lessons (support needs an
effect that does damage; squad orders) and leave its hooks inert. Record in `rules10/README.md` what a switch-on
would still need, and drop `kit.breachRadius` (measured to do nothing) when you are in `warriors.ts`.

**Use the model's own levers.** `tests/gameplay/balance/progression-model.test.ts` pins live warrior data to the
power-budget model. Change a warrior's strength through the model (`roster.json` `dpsScale` with the matching live
damage, a role's budget through `tools/progression/rolecut.mjs`, and if you need a health tax add that lever to the
model rather than hand-editing `troops.json`). The six original warriors (`hedgehog_roller`, `frog_lobber`,
`beetle_brute`, `owl_bomber`, `mole_digger`, `saboteur`) keep their stats through level 5, as
`src/gameplay/CLAUDE.md` requires (the Kite Raider already carries the air-role cut). No test checks this and
`rolecut.mjs` scales a whole role, so compare their first five levels before and after any role-wide change.

**P4-01 (CMB-01) Support warriors never attack, so all five support kits are worth less than nothing.**
- Why: reproduced. A support warrior that has reached its ally returns before the attack code and never strikes
  while any non-support ally lives (`sim/battle/warriors.ts`, the branch in `beforeWarriorAction` that returns
  early). With 20% of an army's housing in one support type, removing its kit raises destruction by 10 to 17 points
  at Keep 15 and 6 to 10 at Keep 8.
- Change: when a support warrior is in position, let it strike the nearest non-wall building within its own range
  at a data-set share of its damage: `battle.json` `warriorRules.supportStrike`, starting value 0.5.
- Measured on a scratch copy at 0.5: the support family reaches 38.3 / 34.7 / 44.3 at Keeps 7 / 8 / 15 (from 27.2 /
  22.0 / 37.8). At 1.0 it overshoots badly (Keep 10 support from 49.5 to 91.2). Do not ship 1.0.
- Done when: `support@7` and `support@8` are out of `KNOWN_BELOW` (at P4-08's four seeds `support@7` is already out
  on untouched data, so this item's work shows in `support@8`); every army-lab upper gate that exists today still
  holds; the light-support mix at Keep 6 stays under 92% with at most 60% three stars; at Keep 10 it is no higher
  than the value measured on the unchanged tree; and with `scripts/combat/t7.ts` no support warrior is worth more
  with its kit removed, at Keeps 8 and 15.
- Two warnings. First, no army-lab gate covers the light-support mix at Keeps 6 and 10 today, and the mix is already
  at the upper gate before any change: on live rules the gate cells read 86.2% (50% three stars) at Keep 6 and 92.2%
  (67%) at Keep 10 at two seeds, and `ARMY_BALANCE.md` reads 85% (61%) and 81% (50%) on its own layouts. Measure
  both cells on the unchanged tree first, at P4-08's seed count. Add a cell that passes to the outcome gate as a
  plain assertion. Add a cell that is over 92% or 60% in its own commit as a named known-over cell with its numbers
  (the `KNOWN_BELOW` pattern: a list that may only shrink, and the test fails when the cell comes back under), and
  record it as an open finding: the strike share cannot lower it, and the list must show today's state, not this
  item's.
- Second, at 0.5 the investigator measured 92.7% (67% three stars) at Keep 6 and 91.3% (67%) at Keep 10, so 0.5 as
  measured does not pass at Keep 6: tune the share, or the aura numbers, until it does. The last clause of "Done
  when" was not measured at 0.5 either. If a support kit still measures negative, raise that warrior's aura numbers
  (its `kit` in `troops.json`) rather than the strike share, and list any kit still below the gate the `KNOWN_BELOW`
  way.

**P4-02 (CMB-05) The Shadow Captain's Rally changes nothing, and its text contradicts the code.**
- Why: measured over 20 battles a cell: live against Rally strength 0 is −0.7 / −1.0 / +4.1 at Keeps 7 / 10 / 15.
  Only 20 to 27% of living warriors stand inside the 4-tile aura. The description says "once per battle"; the code
  re-arms it on every new target. The mismatch is an open design question in `docs/game-theory/REQUESTS.md`; the
  owner's request to fix strategy problems settles it.
- Two candidates, both measured:
  - A: a whole-squad radius at 30%, re-arming as today: 80.5 / 85.3 / 81.5 (no hero: 70.4 / 81.0 / 74.0).
  - B: `kit.oncePerBattle` with a 15-second, 50% burst across the field: 82.8 / 85.0 / 77.8.
- Prefer B: it matches what the text has promised in 50 languages, and it makes when the hero goes in a decision.
  Ship B if, over 20 battles a cell, Rally against strength 0 is worth at least 4 points on the mean of Keeps 7, 10
  and 15 and is not negative at any of them (the report's cells give B +7.9 / +3.8 / +5.9 and A +5.6 / +4.1 /
  +9.6), and sending the hero with the main squad beats sending him first by at least 4. If B fails either test
  and A passes the first, ship A and change the text to describe the re-arm.
- Either way the description's numbers change: update `battle.json`, `roster.json` and close the REQUESTS entry.
  Strings: 2 changed.
- This decision sets the baseline every planned hero is measured against (P4-10). Make it first. If the bump is
  not made at all, still rewrite the two English strings so they describe what the code does.

**P4-03 (CMB-07) The Smoke Bomb, the signature tactic, is worth two to four points for all three charges.**
- Change: `battle.json` `abilities.smoke_bomb.radius` 3 → 4. Measured with a scripted policy: +6.2 at Keep 10 and
  +7.8 at Keep 15. The description names the 8 seconds and not the radius, so no text changes. (Twelve seconds
  measures better still but would change the text in 50 languages for 1 to 3 points; leave it.)
- Done when: `scripts/combat/t13.ts` (which produced the radius-4 numbers; its throw policy groups warriors within
  the cloud's own radius) shows +5 to +12 at Keeps 10 and 15, `t3.ts` agrees in sign, and
  `tests/gameplay/battle/tactics.test.ts` passes unchanged (the charge count, the 2-tile floor, the expiry).

**P4-04 (CMB-06) The siege family is too slow to matter.**
- Why: `siege@8` is 25.5% against a 30% floor. On a scratch copy, raising all four wall and breach warriors from
  0.12 to 0.17 speed lifts Keep 8 to 47.3 but takes Keep 4 to 90.3 with 67% three stars.
- Change: Fire Monk, Bomb Carrier and Volcano Cannoneer to 0.17; tune Ram Crew separately (0.15, or a per-level
  answer) so Keep 8 clears 30% without Keep 4 passing the three-star gate. Run the Keep 4 and Keep 6 home-ground
  gates on all six layouts; the investigator did not.
- Done when: `siege@8` leaves `KNOWN_BELOW` and no gate at Keeps 4 and 6 fails.

**P4-05 (CMB-04) Newer tiers are worse than older ones, and a dozen kits measure zero.**
- Why (`scripts/combat/t7.ts`, Keep 15, 20% of an army): Thousand Needle (tier 5) scores 73.4, below every older
  thrower (77.1 to 88.0). Volcano Cannoneer (tier 5 siege) 64.5 is below Ram Crew (tier 1) 68.7. Sage of Clouds
  (tier 5) is below Herbalist. Shuriken Storm's Fan Throw is exactly 0.0 at both Keeps because its radius is
  measured from the target's centre. Ten more kits measure within one point of zero.
- A correction to the combat report: Wall Climber, Grapple Raider, Crane Glider, Thousand Needle and Siege
  Bombardier do not have "an ability name with nothing behind it". They carry an empty `kit`, and what their cards
  name is their stat line (range, speed, wall bypass, target preference), described truthfully. No card changes for
  that reason. Four of them are in scope as weak warriors at Keep 15 (Crane Glider 57.5, Wall Climber 61.2, Grapple
  Raider 66.1 and Thousand Needle 73.4 against a mix that scores 79.8). Siege Bombardier scores 78.4 and needs
  nothing. All 50 warriors keep a unique ability id and name (`roster-abilities.test.ts`).
- Change, in this order of certainty:
  1. Shuriken Storm `kit.radius` 1.5 → 2.5 (measured +2 to +2.5 for ranged armies at Keep 8).
  2. Thousand Needle: lift its 0.6 `dpsScale` toward 0.8, or give it a kit effect. Measure both.
  3. Tier-5 siege and mystic: a second effect or the stats that put each above the tier below in its slot. P4-01
     may already fix the mystic; measure before adding anything.
  4. For a kit that still measures zero, change its numbers through the existing data-driven kit code. Add a kit
     effect to an empty-kit warrior only where the measurement calls for it.
- Add two lab gates in `army-lab.test.ts`, with today's failures listed the `KNOWN_BELOW` way so the list can only
  shrink: every non-empty kit is worth at least +2 points at its unlock Keep or at Keep 15; and at Keep 15 no
  warrior scores below the previous tier in its own role and slot.
- Strings: only if a card's text must change because its numbers did. Each is a data string in 49 languages.

**P4-06 (CMB-03) Two single-warrior armies three-star most Keep 15 bases, and one fixed mix is never wrong.**
- Why: 180 Eclipse Ninjas score 90 to 95 on three of four temper profiles, 90 Dragon Kite Crews 89 to 96 on three
  of four. The answering temper works (Blast takes Eclipse to 56, Watch takes kites to 41) and scouting shows the
  profile, so the farm is "bring one warrior, press Next past the one profile that answers it". At Keep 12 one
  searched mix is best against every profile.
- Change:
  - `battle.json` `temper.offers.counterShare` 0.5 → about 0.75, so pressing past the answering profile stops being
    cheap. Measure it with a new script: for each family, pass ten recent armies of that family to
    `opponentForRank` and report, over 400 seeds at Keeps 9, 12 and 15, the share of offers that carry the answering
    temper and the expected number of Next presses and Coins to reach one that does not, at 0.5 and at 0.75.
    (`next_offers.ts` passes no recent armies and measures loot only; it cannot see this change.) Next must stay a
    fair choice.
  - Dragon Kite Crew: `dpsScale` 0.85 with the matching live damage (measured: 73%, three stars 43%).
  - Eclipse Ninja: trimming damage does not work (at 0.65 it still scores 82%). Its strength is arriving unseen at
    full health. Trim health through the model, or let a defense see a hidden warrior inside the Smoke floor of 2
    tiles. One measuring pass decides; do not ship both.
- Add upper gates: no single-warrior army above 85% on untempered Keep 15 bases; and a listed known gap for "one
  army best on all four profiles at Keep 12", so it is visible until a later pass closes it.

**P4-07 (CMB-08) Ordinary raids never use the five base layouts, and the layouts differ by 25 to 44 points.**
- Why: `opponentForRank` calls `generateOpponent` with no `layout`; only Trials and the Bounty pass one. Every raid
  base comes from one ring generator. Open Courtyard is the easiest at every Keep.
- Change: each rival clan gets one or two home layouts, chosen from the seed in `opponentForRank` (the layouts and
  their scouting tips exist). Add a per-layout level-bias offset table so the gap between the easiest and the
  hardest is about 15 points or less; put it in `raids.json` or `ranks.json`, not in `battle.json`. Re-derive
  `trials.json` `layoutPower` from the same measurement. Leave `rematch.ts` as it is.
- A ticket carries the base it was issued with and a battle record keeps its setup, so no replay breaks. Ship it
  with the bump anyway, so that builds on the old rules keep getting bases from the archived `matchmaking.ts`: run
  `rules:snapshot` before `opponentForRank` changes. `matchmaking.ts` is a hashed campaign source, so the campaign
  is re-run, and the server is deployed first.
- Done when: over 20 battles a layout at Keeps 8, 12 and 15 with the raid bots' mix, the gap is 15 points or less,
  and the matched-raid and campaign gates pass.

**P4-08 (CMB-12) Gates rest on six-battle cells that swing 10 to 15 points.** Do this first in Phase 4, on untouched
data, in a commit of its own that changes no game data (it touches only the test, so it may be committed on the
working branch before the rules branch is made). Raise the gate cells of `army-lab.test.ts` to four seeds (the
outcome slice takes 33 s instead of 16 s); where the time budget does not allow that, gate on the mean of two
adjacent Keeps.
- Expect cells to move on untouched data. Four seeds give `support@7` 32.3% (it leaves `KNOWN_BELOW` with no change
  to the game), `melee@8` 27.3% (from 37.8%: a new cell under the 30% floor) and a ranged-over-balanced gap of 21.3
  points at Keep 15 (the gate is 20).
- This item authorises one re-baselining to what four seeds measure on untouched data: `KNOWN_BELOW`, and a
  listed-not-hidden entry for the Keep 15 gap, with every moved cell and both values in the record. From then on
  rule 0.4 applies again, and every "before" number of this phase is the four-seed one.
- Done when: the four-seed gates are green on untouched data, the two-seed and four-seed tables are in the record,
  and no gate value was changed.

**P4-09 (PAC-07) Players who field their newest warriors lose most raids from Keep 8.** The casual explorer wins 18
to 58% at Keeps 8 to 14 (under half at every Keep but 10) and is gated only at 0.1 stars a Keep and 0.3 on average.
After P4-01, P4-04 and P4-05, re-run the campaign. P2-10's loss-streak slack already lifts this player by
matchmaking (it loses four raids in five, so it sits at the slack's cap), so measure the explorer twice from the
same tree: as committed, and with `ranks.matchmaking.lossStreakSlack` patched to 0 in memory (a what-if run in the
style of `scripts/pacing/variants.mjs` with `{"policy":"explorer"}`, printing stars per Keep). Raise the gate to
what the committed run gives. Judge PAC-07 on the second run, with 0.9 stars as the target: if it is still under 0.9
there, record both numbers and the warriors responsible; do not paper over it with matchmaking. Until those warriors
are fixed, make the Army panel's Fill use the Suggested army for a player whose last five raids averaged under one
star (`sim/suggest.ts` builds it; no new string). Then gate the explorer's stolen-to-looted ratio (P3-02).

**P4-10 (BNL-03, 04, 05, 06, 09 to 13) Built-not-live content: what may go live under this bump, and what may not.**

`built-not-live.md` measured every planned item on 12 to 30 bases. Its findings overturn the assumption that this
content is ready to switch on:

- **The three planned heroes are a false choice.** With that hero's own family of warriors, the live Shadow Captain
  equals or beats every one of them in 8 of 9 cells (Sky Admiral with a sky army: +0.3 to +1.0 points over no hero
  at all). Their abilities fire once; the Captain's re-arms. Choosing a hero can also lower his level: `heroFor`
  caps a chosen hero at the Hall's level and leaves the automatic one uncapped.
- **Ten of the fifteen planned counters change nothing in a raid** (effects of exactly 0.0 on 18 bases for six of
  them). Five work: Steam Vent, Lightning Rod Tower, Whirling Blade Tower, Bronze Mirror Screen, Living Bamboo
  Wall. A building's body matters more than its rule: one extra building near the defenses moves a raid by up to
  20 points, so adding bodies to every generated base is a whole new balance.
- **They are priced past the whole live defense budget**: 616 M Coins and 494 builder-days to max the sixteen,
  against 418 M and 407 for every live defense, trap, support and wall together.
- **The server would refuse a chosen hero**, and several translated descriptions do not match the code.

So the default outcome of this item is: nothing here goes live in this pass, and the next pass inherits a gate
instead of a guess. Do these, in order:

1. **Type and test the hooks (BNL-10).** Declare the Rules 10 keys that stay in `src/gameplay/sim/types.ts`, add
   one unit test per hook (absent plays identically; present has the effect), remove `kit.breachRadius`, and
   correct `rules10/README.md` (a balance bundle cannot switch on keys that do not exist in shipped data).
2. **Make the preview decide things (BNL-12).** In `tools/balance/preview.mjs` (the layouts and seeds) and
   `tools/balance/preview.ts`: six layouts × five seeds, a paired standard error, events counted for the building
   under test only, heroes sent first and sent last. Regenerate `PREVIEW_BALANCE.md`.
3. **Write the go-live gate as a slow test that reads results, not one that fights** (the pattern of `campaign.json`
   and `campaign-gates.test.ts`). Make `npm run balance:preview` also write its rows to a generated
   `docs/game-theory/preview.json` with a fingerprint of `planned.json`, the rules number and the preview tool (list
   the file in `docs/GENERATED.md`); the test under `tests/gameplay/planned/` holds those rows to the rule and fails
   while the fingerprint is stale. Fighting inside the test is not affordable: one counter and one hero on six bases
   take about a minute, so 30 bases are about 14,000 battles and three quarters of an hour on one core, against a
   slow suite of about 50 s today. Run the full preview once per tuning round and `npm run balance:preview -- <ids>`
   while tuning. The rule: a counter may be marked live only if its effect is −3 points or better against the armies
   it is meant to beat at two of three Keeps on 30 bases, and the armies its card says beat it do not do worse
   against it than the armies it is meant to stop; a hero only if its own family beats the Captain by 5 or more at
   its three Keeps and the raid mix stays within 3. The gate lists today's failures the `KNOWN_BELOW` way. Add its
   path to `SLOW_TESTS` in `tests/slow.ts`, so `npm run test:slow` runs it and `npm test` does not.
4. **Fix what is wrong whether or not anything ships**: the Hall cap trap (BNL-11: one rule for both paths); the
   English that does not match the code (BNL-13; these are data strings in 50 languages, so fix them once, now);
   the Lightning Rod's event flood (at most one `absorbed` event per rod per second; events never enter the result
   hash).
5. **Retune toward the gate** in `planned.json` and the catalog: the three hero kits (starting values for the Sky
   Admiral and the Iron Matriarch are in `structured/built-not-live.json`, BNL-03; the Grand Sensei has none and
   needs its own search), the five working counters re-priced so a first wave adds no more than about a quarter to
   the live defense budget, first levels capped at one day of building. Before re-pricing, stop `previewLevels` in
   `sim/plannedContent.ts` extrapolating past the reference's last level: a level 12 Living Bamboo Wall has 1.81
   times a level 13 Stone Wall's health and a level 10 Bronze Mirror Screen 2.3 times a maxed Kunai Tower's, and the
   inflated body moves a raid more than the price does. Correct the `planned.json` comments that say otherwise, and
   pin the first wave's total cost and builder time in a test under `tests/gameplay/planned/`. Correct the Whirling
   Blade Tower's `counteredBy` list: the armies listed as beating it lose 17.3 and 10.4 points to it, more than the
   armies it is meant to stop.
6. **Only if an item passes the gate and time remains, make it live under this bump**, heroes before counters,
   because Keeps 9, 11 and 13 are exactly where the late game has nothing new. Going live means all of: the
   definition moved into the live data files and `live` set in the catalog ("Making one live" in
   `src/gameplay/CLAUDE.md`); the server side (BNL-06: `checkArmy` reading the hero from the server-held village,
   `chooseHero` in `PLAYER_COMMANDS`, a hello feature, `docs/PROTOCOL.md`, contract tests); battle callouts for
   every new event kind (BNL-09); a painter for any new building (the generic one is not shippable); and every
   balance artefact re-run. A lower-risk first step for counters is to let those that pass the gate appear only in
   Trial and Bounty fortresses (a separate list read by `trialBase` and `bountyBase`), so players meet new puzzles
   before anyone can build them. On today's numbers only the Steam Vent and the Whirling Blade Tower pass the effect
   rule, and the Whirling Blade Tower passes the gate only once its `counteredBy` list is corrected (step 5); the
   other three of the five fail until retuned, and the generator cannot place a Living Bamboo Wall without new
   base-generation code.

P4-02's Rally decision sets the baseline every other hero is measured against. Make it before step 5.

**P4-11 (stretch, CMB-10) Which approaches are closed is a hash of the layout, not the defender's choice.** Making
the closed pair an explicit base setting (`BaseLayout.closed`, absent means today's hash so old records replay), a
village command to set it, the scout report showing it and a base-editor control is the one change that would make
base design a decision against the largest lever in a raid. It touches the rules, the save, the commands, the
protocol, the server, the interface and the catalog. Do it only if every other item in this phase is done and
measured; otherwise write the design in `docs/game-theory/REQUESTS.md` and leave it.

Then perform the bump exactly as section 3.1 lists, and regenerate `ARMY_BALANCE.md`, the campaign, the roster
documents and the status file.

The bump changes the armies on which Phases 1 to 3 measured their acceptance results: the raid bots' mix at Keeps 13
to 15 is a quarter Thousand Needle (P4-05), and the air, shadow and siege alternates of P2-03 are built from the
warriors P4-04 and P4-06 retune. Section 3.1 re-runs the gates. Harness results are not gates and go stale silently,
so re-measure under the new rules what earlier phases accepted under the old ones:

- `scripts/retention/r3.mjs`: re-derive the Trial cap constant, `trial_walker`'s last step and `taskMaxGrowth`
  (P1-06);
- `def_hold.ts`, `def_econ.ts`, `def_daily.ts` and `away.ts`: P2-01's results 1 to 6 and P2-05's bound;
- every `raids.raiderMixes` alternate against a caps − 1 base: P2-03's 20% and 85% bounds;
- the stake list of P2-08, the 5 to 20% band of P2-09 and the Keep 3 stars of P3-05.

A gate that P2-04 or P2-14 set from an earlier run may be restated here from the new run with the same margins, old
and new value in the record. Every other gate still moves only as 0.4 says.

Run section 13 for the phase's text, and write the closure record with the before and after of every gate cell that
moved.

## 10. Phase 5: reasons to come back that have not been seen before

Read `retention.md`. The return-hook layer is honest and well built, and it is thin: a regular player has seen every
event kind and every daily task template by day 14 (every weekly one after about five weeks), and from day 28 the
calendar, the Scroll and the events repeat identically. A Keep 15 player (day 113) has three counter achievements
and the monthly league climb left.

Every item here reuses a system that exists. Every item is a pure function of a schedule, a seed or the player's
own play: nothing random is sold, nothing is taken for a missed day, every countdown is real. Each new hook gets
its line in `docs/DECISIONS.md` (1.2).

Most of the data lives in files the campaign plays (`pass`, `daily`, `events`, `trials`, `ranks`). Batch the data
changes and run the campaign once at the end of the phase.

**P5-01 (RET-01) Events: four kinds on a 14-day loop, nothing dated, an event running 68% of all hours.**
- Change, data: make `events.json` a 28-day loop of nine or ten named windows built from the three existing effects
  (collect bonus, raid loot bonus, training discount) at different sizes and lengths, with quiet days between them,
  plus a second goal entry. No raid-loot window may exceed 25%: P5-03's bound on what a raid carries depends on it.
- Change, code: optional `events.dated[]` (month and day of start, `durationHours`, an effect or a goal), merged in
  `sim/events.ts` `eventsBetween` with the occurrence key `id#year`; `EventsDef` in `types.ts`; the validator in
  `src/backend/net/eventSchedule.ts` (the server may retime built-in ids only, and that stays true); a note in
  `docs/PROTOCOL.md`. Five festivals a year is enough: new year, spring blossom, midsummer lanterns, harvest moon,
  winter. Each is a goal event or a boosted effect whose top ladder step gives that festival's look (two colours
  and a name; `GoalLadderStep.reward` gains a look).
- Keep (protected item 31): start and end come only from the schedule. Reword the panel line that says "repeats
  every two weeks".
- Three things the change must not break:
  - Changing the period renumbers every occurrence key (`<id>#<period number>`), and a stored key from the old
    numbering could match a later occurrence of the new one. Give the goal entries of the new loop new ids, and
    either carry a running Bounty's claimed steps forward in the save migration or accept one extra ladder for a
    player in mid-Bounty and record it.
  - Goal progress is one slot today (`VillageState.goalEvent`), reset whenever the key differs, and
    `activeGoalEvent` returns only the earliest running goal event. With a second goal entry, the Gauntlet (P5-02)
    and festivals, two goal windows can overlap, and alternating attacks between them would reset the claimed steps
    and pay a ladder again. Either make the progress a map by occurrence key (part of the one save bump, with a
    migration test) and let `bountyEnd` take any running goal event by its key, or guarantee in data that no two
    goal windows ever overlap and test that over 365 days. With the map, P1-12's "not before the stored occurrence"
    rule stays per event id and never compares different events. Add a test that alternating attacks between two
    goal events never pays a step twice, and one that an attack on the window that opened first is accepted while a
    later one runs.
  - `applyEventSchedule` in `src/backend/net/eventSchedule.ts` rebuilds `data.events` from the epoch, the period
    and the schedule only. Whenever an operator's schedule is in force, on the server or in the game, any new field
    (`dated`, and `contracts` if P5-03 puts it there) would be dropped silently. Make it carry every non-timing
    field through unchanged, with a test.
- Check the festival names and dates with care: they must be culturally neutral or clearly Japanese-inspired in the
  game's own fiction, never a real religious observance. Add them to the list for the owner's cultural review.
- Done when: over the next 365 days a player meets at least twelve distinct event names, no two consecutive weeks
  are identical, and at most half of all hours have an event running.
- Strings: a name and a line per window and festival, about 30. This is the largest text cost in the pass; write
  them once, well.

**P5-02 (retention opportunity 1) The weekly Gauntlet: one shared challenge fortress.**
- A second goal-event kind whose fortress is seeded from the occurrence key and the Keep only, never the village,
  so every player at the same Keep attacks the same base that week. It carries Trial-style modifiers (`power`,
  `wallPower`) and a rival clan's tempers, and pays a star ladder once per week. It reuses the ladder code and the
  Events panel, but not unchanged: `bountyEnd` refuses any goal whose kind is not `bounty` and always rebuilds the
  fortress from the village seed, and the panel's `goalEventView` does the same. Add a kind branch in both (the
  base from the occurrence key and the Keep), and settle the single-slot question of P5-01 first.
- Honesty (3.6): it is labelled a generated fortress, and "everyone at your Keep fights this base this week" must be
  literally true. Add a test that two villages with different seeds at one Keep get the identical base for one
  occurrence, and different bases for the next.
- A best-destruction board between friends and Gang mates needs server work; write it in
  `docs/backend/REQUESTS.md` and do not build it in this pass unless Phase 2's server item is already done.
- Strings: about 4.

**P5-03 (RET-11) Raids have no rotating context: the daily contract.**
- One contract a day, the same for everyone, a pure function of the day from data (`contracts[]` in `events.json`,
  with the `applyEventSchedule` fix of P5-01, or in `raids.json`). It changes only what a won raid carries home, in
  `bankRaidLoot`, never the battle, and it needs no stored state. Starting set: more loot from one rival clan's
  outposts; declared stakes pay more today; the diversity share counts double; three-star raids carry a little
  more.
- Bound it: with the contract, an event bonus, a stake and the diversity carry all at their best, a raid carries at
  most 2.2 times its plain loot. Add that as a test over the data. The bound is nearly used up before any contract
  exists: P2-08's 3★ stake (1.75) and today's 20% raid-loot window already carry 2.10 times. So either no contract
  applies while a raid-loot window runs (say so in data and test it), or a contract adds under 5% on such a day. And
  no raid-loot window of P5-01 may exceed 25% (2.2 ÷ 1.75 = 1.257).
- The server settles online raids with the same simulator code, so the contract must be computed from the raid's
  own time on both sides. Add the REQUESTS entry.
- Done when: the regular campaign's Keep 15 day moves by less than 3% with contracts on (the model takes each day's
  contract only when its normal raid already satisfies it).
- Strings: a short line per contract, 5 to 7.

**P5-04 (RET-05, second half) Tasks: 15 templates over 10 counters.**
- Add about eight templates. On stats that exist: a Trial tier (daily, one), a donation, a rematch won. On new stats
  counted in `afterCommand` and `bountyEnd` (part of the one save bump): three-star raids, stakes won, Bounty or
  Gauntlet steps, the daily drill (P3-07), and, once Phase 2 is in, stars denied on defense. Each gets its
  `taskEligible` case, so a task the village cannot finish is never offered (protected item 29).
- The stars-denied task is weekly only (a shielded village cannot be raided that day), and it is never offered to a
  village that plays online unless P2-12 shipped, because online no raid arrives without it. A raid by a real player
  counts for it only inside the limits of P2-01's scope bullet.
- Done when, measured with the real `taskEligible` through `rollPeriods` on model villages at Keeps 5, 10 and 15
  (for Keep 15: every building at its cap, Trials at the measured wall, no Alliance, no open rematch, no goal event
  running): the same three daily tasks as the day before on under 1% of days, at least two of three repeating on
  under 15% of days (28% today), and no collect template completed by one collect of an hour's production (P1-08's
  test; after P3-01 a collector holds a day, so "by a single collect" cannot be the test).
- `scripts/retention/r1.mjs` counts every template as eligible, so it cannot show this: extend it to draw on those
  villages. Drawing three of n, at least two repeat on 28.6% of days at n = 8, 15.2% at 11 and 12.7% at 12, so under
  15% needs twelve daily templates eligible at once. The retention report counted about six at Keep 15 today (the
  upgrade and research templates drop out there), and the Trial, donation, rematch, Bounty and stars-denied
  templates are conditional. So most of the new templates must be daily and always eligible (three-star raids,
  stakes won, the drill).
- Report the weekly set too (seven templates; two of three repeat on 36.7% of weeks today), with under 25% as the
  target.
- Strings: one per template, about 8.

**P5-05 (RET-08) Achievements: nine counters, three reachable goals after Keep 15.**
- Add ten to twelve. Data only: donations, rematches won, warriors trained, total destruction. With a small
  extension of `achievementValue`: calendar days claimed, warriors unlocked, looks owned, tower types tempered. On
  the new stats of P5-04: three-star raids, stakes won, Gauntlet ladders completed. Raids held: only after Phase 2,
  only if the fortress campaign of P2-04 holds at least 40%, and only if P2-12 has shipped, because online no raid
  arrives without it and the goal could not be reached. A raid by a real player counts for it only inside the limits
  of P2-01's scope bullet.
- Every tier must be reachable (the test from P1-06). Every new tier needs its entry in
  `src/backend/platform/achievementIds.json` (`tests/backend/growth-client.test.ts` checks the map).
- Keep the added Jade under about 600 in total and record the new one-time and monthly free-Jade totals (3.7).
- Strings: a name and a line each, about 24.

**P5-06 (RET-09, RET-13) A collection layer: earnable looks.**
- Fifteen two-colour looks that are granted and never sold: the first season finished in Obsidian, Storm and Kage;
  Trial tiers 20, 40 and 60; calendar cycles 2 to 6 (`calendar.skins[]`, so each cycle's day 28 gives the next look
  instead of 40 Jade); lifetime chest milestones at 30, 100, 200 and 365 chests opened, which a missed day cannot
  touch (a new stat, paid in `openDailyChest`).
- Grant by what the village has reached, not by the moment it crosses: from `trials.best`, `calendar.cycles` and
  `seasonLog`, both in the command (`rollSeasons`, `trialEnd`, the calendar claim) and once on load (beside
  `repairTrainingQueue`). `trialEnd` pays only on the first clear of the next tier, so without this a village
  already past tier 60, one that jumps tier 20 with P3-06's catch-up, and one that finished cycle 3 last year could
  never earn their looks: goals the game shows and the player cannot reach (1.2). Test a village at tier 70.
- A "looks collected: N of M" count where looks are shown. It covers these earnable looks only, never looks that are
  sold or come with the Scroll, so a player who pays nothing can complete it.
- The import rule of 3.3 applies: a look only play can grant is kept only when the imported state meets its
  condition.
- Strings: a name per look (15) and the count line.

**P5-07 (BNL-02) Warrior Mastery, as ranks with no stat bonus.**
- Why not the bonus: as tuned, mastery is not a long chase. One three-star raid with a one-type army gives +10%
  health and damage, an evening gives +15 to +20%, and +10% is worth about 10 points of destruction at Keep 12
  (three-star rate 8% → 25%). Matchmaking does not see it, defense has no counterpart, no gate was ever run with
  it, and the server neither checks nor versions it. Switching the bonus on would undo Phase 4.
- What ships: ranks. Set `mastery.maxBonus` to 0 and retune `xpBase` (starting value about 1,500, which puts a
  rank-5 equivalent near 40 raids for a warrior that is a quarter of the army) in `progression.json`; add
  `features: { mastery: true }` to the shipped data; drop the "preview" label; show experience gained on the result
  screen (the return value of `awardMastery` is discarded today) and each warrior's rank in the Codex. With the
  bonus at 0 no battle setup carries one, so no battle changes and the fingerprint does not move.
- Fix before anyone can earn: experience is paid for any replayed Trial tier, cleared or not (tier 1 is a farm).
  Pay it for raids and for the first clear of a tier only. Decide once whether Alliance War, Gang War, Bounty and
  rematch battles pay (today they do not) and make the result screen agree.
- This changes pinned tests on purpose, and this item authorises it. `masteryBonus` reads `progression.json`
  directly, so a zero cap also removes the bonus under the preview that the planned-content tests exercise.
  Rewrite the mastery case in `tests/gameplay/balance/progression-model.test.ts` and the three Warrior Mastery
  cases in `tests/gameplay/planned/progression.test.ts` to the ranks contract (experience grows without end, the
  rank comes from the level curve, `masteryBonuses` returns nothing and no setup carries mastery). Remove `mastery`
  from the features `planned.json` lists as off, and fix the "features off" line the status generator prints from
  those keys; then `npm run status` and `npm run docs:progression`. If you would rather keep the stat bonus
  playable in the preview, move the cap and the rate into `GameData` (`planned.json`) first instead of zeroing
  `progression.json`.
- The save field exists since v23. Of the four translated Codex strings, the row that reads "Level N · +X health
  and damage" must not be shown for ranks (it would promise a bonus that does not exist): add a rank row. Count
  two new strings, the rank row and the experience line on the result screen.
- Record as open, with what it needs: the stat bonus (a retuned curve, a cap near +15%, a place in
  `attackerStrength` or a limit to generated bases and Trials, a mastered campaign policy with a gate, the server
  truth of BNL-06, the curve moved inside `GameData` so it is versioned, and a rules bump because archived engines
  ignore the field).
- Done when: fifty warriors each have a rank that a month of play moves visibly and a year does not exhaust, and a
  test shows no `BattleSetup` built by the game carries a mastery bonus.

**P5-08 (PAC-11) Keep seals.** When every building a Keep allows is at that Keep's cap, pay a fixed Keep-scaled
reward once and mark the Keep with a seal on the Keep sheet and the profile. Fifteen medium-horizon goals from data
that already exists (`hall.json` limits), and a pull against hollow Keep rushing that forces nothing. A claim
command the server replays, one stored field. A seal is earned whenever the village meets that Keep's caps and
counts, also after it has moved past that Keep, so all fifteen stay reachable. The reward scales by the seal's own
Keep and holds no Jade (if it does, count it in 3.7's totals). The import (`checkProvenance` in
`server/core/villageImport.ts`) marks every seal an imported village already qualifies for as claimed, as it does
for achievements and Scroll tiers, with a test (3.3): otherwise a forged, fully built village imports and claims
fifteen rewards. Strings: about 3.

**P5-09 (RET-12) Two daily clocks.** The chest, the streak's skip week and the stipend roll at UTC midnight (dinner
time in the Americas); tasks and the calendar roll at the player's midnight. Move the first three to
`localDayIndex`. The migration must not allow a second chest on the day of the switch, and
`LOCAL_TIME_CHANGE_DAYS` already limits clock moves. Update the refusal text that says "(UTC)" and the reminder.

**P5-10 (retention opportunity 8) Season identity and a recap.** There are two seasons with different boundaries:
the league's is a UTC calendar month (`seasonOf`) and the Scroll's is 30 days from `pass.epoch`, so they drift apart
and one shared name or rollover does not exist. Name the league season from a data list of twelve, as objects
(`[{ id, name }]`: the extractor takes `name` fields and ignores plain string lists outside `LISTS` in
`tools/i18n/lib.mjs`, so a list of bare strings would never be translated). The Scroll keeps its number and its
look's name (P1-02) and gets no second name. At the league rollover show one card with the existing share sheet:
league and honor from `seasonLog`, which stores them at settlement (a best league is not stored); raids won and
stars need a baseline of `stats.raidsWon` and `stats.starsEarned` stored when the season starts (in the one save
bump). The first recap after the update shows only what was recorded, never an estimate. The Scroll's own rollover
keeps the summary of P1-01 (`pass.lastSeason` carries what was auto-claimed). Strings: twelve names and about four
lines.

**P5-11 (ECO-09) Honest Jade sinks.** Free Jade is about the $9.99 pack every month and after the fifth artisan the
only sink is skips. Add more Keep looks for Jade (two colours and a name each) at the existing price ladder. Do not
add a sink that is power, and do not add a product. Strings: a name per look.

Considered and left out, record them as open ideas: raising `queuedArmies` to 2 (unmeasured effect on pace), a
raider-clan forecast in the Events panel (wait for P2-03 to prove itself), real-player revenge online (server and
protocol work with moderation consequences).

Close the phase: campaign, slow tests, section 13, full checks, the new `DECISIONS.md` lines, the closure record.

## 11. Phase 6: screens, so that what was built can be found and felt

Read `ui-surface.md` and `playthrough.md` first, then `src/presentation/CLAUDE.md`. A rule in the simulator that no
screen shows does not exist for a player. This phase is where the earlier ones become visible. It is also where
most new strings come from: design each screen to need few (3.5). `ui-surface.md` section 4 lists the new strings
each of its fixes needs; many need none because the right label already exists. `playthrough.md` does not count
them, so count P6-09's yourself (a skip confirmation, the folded kind tags, the Dojo's "unlocks" row, three
corrected English strings, each retranslated 49 times).

Device targets from root `CLAUDE.md` apply to everything here: touch first, safe areas, portrait and landscape, the
bottom bar fits 320 px, cheap Android phones on the low quality profile. Check every new or changed surface at
320×568, 360×640, 390×844 and 844×390 in the sandbox (`?sandbox`), in English, in one right-to-left language and in
one long-word language (Arabic and German), with real touch events at element centres, and look at the screenshots
yourself. The playthrough's drivers in `scripts/playthrough/` take a width and a height and refuse a tap on a
covered target; they were run only at 360×640 and 844×390 in English, so extend them to the four sizes and the two
languages.

The drivers, the `perf:*` scripts, `store:screenshots` and `i18n:smoke` need Playwright and a Chromium build that
matches it, which `npm ci` does not install. First test what the machine already has, from the repository root:
`node -e "require('playwright').chromium.launch().then(b => b.close())"`. Where that works (a global Playwright
found through `NODE_PATH`, browsers under `PLAYWRIGHT_BROWSERS_PATH`), use it and add nothing: a development
dependency at a newer version would shadow it and ask for a Chromium build that is not there. Otherwise add
`playwright` as a development dependency at an exact version (allowed: it is not a runtime one) and install its
Chromium; if a Chromium build is on the machine but downloads are blocked, pin the Playwright version that build
belongs to. If no browser can be started, record those checks as not run instead of failing the phase. The same rule
covers the scripted tutorial run of P3-04 and the scripted first session of P3-11, which need a browser two phases
earlier.

Order of work: P6-15 (tests that build the HUD) comes first, before P6-09, so that every fix in this phase can have
a test. The headings below group the items by what a player meets, not by the order of work.

What the playthrough found excellent, and what stopped "one more raid", in the player's own words: the stake, the
true near-miss line, new warriors to try and the loot count-up pulled; what stopped it was that the whole army is
spent on every raid, storage was full after raid 1, the fight is two minutes of watching dots after half a minute of
input, and the result screen ends in "Return home". This phase answers the last three. The first is the genre's
core cost and stays.

### First: the things a reviewer or a new player hits in the first ten minutes

**P6-09 (PLY-01, 02, 06 to 10, 12, 14) Everything the playthrough saw.** Each was reproduced with a screenshot in
`scripts/playthrough/shots/`. Fix all of them; each fix that can have a test gets one.
- **"Skip tutorial" is one tap with no confirmation and lies over the Army button** when the bubble is docked low.
  The investigator skipped the whole tutorial twice by accident. Ask once through the HUD's modal, move the link to
  the bubble's top corner, and never dock the bubble over the bottom bar.
- **The tutorial bubble covers the button it asks the player to press** (the Keep's Upgrade button sits under the
  bubble and outside the sheet's scroll box at 360×640; a hit test at its centre returns the canvas). Find the
  step's target first, place the bubble in the free band, scroll the target into view. Make the building sheet a
  column with a sticky head and a sticky action row so Upgrade, Collect and Finish are always visible, and reset
  its scroll when its content is rebuilt.
- **The tutorial ring is drawn through an open sheet** (it rings the Mint's upgrade button while the text asks for
  the Keep: a new player can spend 300 on the wrong upgrade), and the sheet's close button ends up under the rail's
  fold toggle. Hide the map ring while a sheet covers its building, and keep the rail clear of an open sheet.
- **The Build panel goes stale**: "All your Village Artisans are busy" stays on a card 52 seconds after they are
  free, and the tap toasts the same error. Redraw the shop grid when the controller's state changes and quote again
  inside the click handler.
- **The browser-storage banner overlaps the first screen and hides the Keep.** Hold it until the tutorial is done
  and show it in the top banner slot.
- **The "computer rival" and "practice" labels are folded away by default on phones.** This is the Honesty
  invariant: keep a short kind tag on the folded opponent line, always visible, at 320 px too.
- **An internal id on the result screen**: "Warriors used: 1 shadow_captain". One shared unit-name lookup in the
  interface (warriors, then heroes, then abilities), used at every site, and a test that a result with the hero
  shows no snake_case id.
- **Dead seconds and silent milestones**: the Dojo's sheet does not say that its next level unlocks warriors
  (the ceremony says so 22 seconds later); empty-collect toasts fill the News log; a Keep level arrives with a
  changed badge and nothing else (P6-08).
- **Small things a reviewer notices**: `TkAge` is registered twice (a console warning on every boot); a canvas
  read-back warning in `render/quality.ts`; the web Store shows eight "Not available" cards with the explanation
  last; three English strings ("honor above 400 are halved", "More honor bring tougher opponents", "build another
  Firework Mortar" with none built); the training strip cuts a name to "S…"; in landscape the Army panel opens
  with no warrior row visible; edge labels are cut by the screen edge.

**P6-11 (PLY-05) Battles are tiny and passive on a phone.**
- Why: the camera stays at the entry fit (zoom 0.14) for the whole fight; the island is about 340×190 px and a
  warrior 4 to 5 px on a 360 px screen; a fight is 100 to 160 seconds of watching after 15 to 50 seconds of input.
- Change: once the player has deployed and no card with warriors left is selected, glide to an action frame (a box
  around the living warriors and their targets, zoom clamped), and glide back when a card or an edge chevron is
  touched. Show the replay's speed button in live battles once every warrior is deployed: `BattleSession.speed`
  already scales live ticks and deployments keep their tick, so results and replays do not change (protected item
  43). Add a test that a battle watched at 2× has the same result hash.
- When every deployed warrior is dead and undeployed ones remain, the battle runs to the clock with nothing on
  screen (2:45 in the playthrough), and the speed button does not help: it appears only once every warrior is
  deployed. Say so with the coach line and pulse the troop cards and the End battle button (reuse an existing line,
  or count one string).
- Strings: 0 to 2.

### The raid loop

**P6-01 (CMB-09, BNL-01, UIS-03) Squad orders on screen.**
- Built and tested, with no screen: `src/gameplay/control/squadPlan.ts`, `BattleSession.orderSquad`, `holdSquad`,
  `squadWaiting`, `tests/gameplay/control/squad.test.ts`; the ask is in `docs/art/REQUESTS.md`. The orders go
  through the ordinary deploy path, so replays and the server check are unchanged.
- Measured on 324 raids: at Keep 9 the same army scores from 29% to 100% by order and entry point (the raid bots'
  plan: 60%); at Keep 12 from 22% to 93% (bots: 50%). The best order differs by base, so it is a real decision.
- Build: one row above the troop cards with two chip groups, remembered on the device. With a formation armed, a
  tap on a point chip or ring sends the undeployed army in that shape. Hand placement, the hero and Smoke stay as
  they are.
- Which orders to offer. Formations: together, pincer, file. Wave orders: tanks first, rush. The two reports
  disagree about "hold a reserve": one measured it 13 points worse than sending everyone, the other found it the
  weakest on average but not always. Offer the reserve order only if on ten bases at each of Keeps 9, 12 and 15 it
  is the best order on at least one base in five. A button that is nearly always wrong is a trap.
- Always show Hold with the waiting count while `squadWaiting` is above 0, for every order: a large squad goes in
  over many seconds, and `holdSquad` is the only way to stop a mis-tapped order.
- Done when: a full raid can be played in three taps; a squad-order raid's record replays identically; the new row
  fits at 320×568 and 844×390 with the safe area.
- Strings: about 9 (11 with the reserve).

**P6-02 (CMB-02) The largest lever in a raid cannot be read, so make it learnable: the post-raid review.**
- Why: the best entry point is worth 16 to 21 points over the mean point, and no static scouting metric predicts it
  (seven were tested; none exceeds a correlation of 0.31 or is consistent across Keeps). The count the scout screen
  shows per point is a true fact and bad advice.
- Build: on the result screen, a "what if" review that re-runs the same army and the same orders through the other
  open points with the deterministic simulator and shows each honest result (stars and destruction). Client only.
  Compute one point at a time, on demand, in slices or off the main thread: a Keep 15 battle takes about 0.2 s on a
  desktop and several times that on a cheap phone.
- Honesty: it says what it is (the same army sent through another point, simulated). It is never shown as what the
  player "should have" earned, and it never runs before the raid.
- On the scout screen: keep the count as a count. Never label a point as recommended, safest or best unless a lab
  test shows the label is right ("the favoured point beats the mean point by 8 or more at Keeps 10 and 15"); no
  metric passes today.
- Done when: the review's numbers equal a real battle fought with those deployments (a test), and the result
  screen stays responsive on a slowed CPU at low quality. No script measures that today (`perf:profile` profiles
  start-up only; `perf:lowend -- --quality` runs a practice battle but never reaches a result screen): extend the
  latter to run one review battle at CPU ×4 to ×6 and state the longest main-thread task in the record.
- Strings: about 4.

**P6-07 (UIS-01, PLY-13) The result screen ends the loop.**
- Today: it celebrates well and honestly, then offers "Watch replay" and "Return home". It shows no progress the
  raid made and no next action. On a missed stake it prints "no loot came home" directly under a loot line that is
  the league bonus, and it prints "Your squad carried 85% of the loot" on a defeat that carried none.
- Add a short progress block from snapshots taken before and after the battle is settled: the tasks this raid
  moved with their count, honor to the next league, the Scroll tier, the contract, a running ladder. Add context
  buttons: after a raid "Refill in one tap" (the Army panel's command) and "Next" when an army is still standing;
  after a cleared Trial the next tier; after a failed one "Try a different fortress". `ui-surface.md` names the
  existing key for each; no new string is needed.
- Fix the contradictions: no carry line when nothing was carried; the loot line is labelled as the league bonus on
  a missed stake.
- "Watch replay" leaves the results for good today. A replay opened from the results returns to the same results
  dialog when it ends or is closed, so the context buttons, the progress block and P6-02's review are still there.
  Test it with the HUD tests of P6-15.
- Keep protected item 41: every line is a fact about the raid just fought.

**P6-13 (UIS-05, UIS-07) Two bets the player makes blind.**
- A 3★ stake can be declared in one tap while the sentence that says "miss it and carry none" is inside a closed
  drawer, and nothing shows the declared stake during the fight. On choosing a stake, show its existing help line
  and open the drawer the first time on a device; mark the staked star in the live star row.
- The diversity share is revealed only after the raid. Show it for the ready army in the Army panel and in the
  scout drawer when it is under 100%.
- Strings: 1.

**P6-17 (playthrough opportunity 1) Something to play while the army trains.** When the camps are empty, the Attack
button and the result screen offer what needs no standing army or pays without one: the daily drill (P3-07), a
"Try" practice battle, and with the retrain countdown beside them the next Trial tier and a running Bounty or
Gauntlet. Reuse existing labels.

### The defender's game

**P6-03 (defense opportunity 2) The defense report.** For each raid in the log and on the welcome-back screen:
what was kept of what was raidable, stars denied, the reward, the entry point the raider used and the first three
buildings that fell. Kept, stars, reward and loot are stored on the record; derive the entry point from its first
deployments, and get the first buildings to fall by replaying the record when it is replayable (omit that line for
records fought under older rules, which is every existing one after Phase 4's bump). No save field is added. Today a
0-star raid reads "took 167,676 Coins and 108,575
Provisions (+40 honor)", which is how a held raid that lost a quarter of the collectors looks before Phase 2; after
it, the line must show what holding saved. Feed "the side raiders break through" to `nextObjective` as a free
suggestion. Strings: about 4.

**P6-04 (defense opportunity 1) "Test my defenses".** On demand, run the simulated raider (`attackerFor`,
`villageToBase`, `botDeployments`) against the player's own village and play the replay; and from a lost defense in
the log, start a practice battle with that raider's army against the village as it is now. No loot, no honor, no
shield change, labelled practice, device only. This makes moving a tower an experiment with a result. Strings:
about 3.

**P6-12 (P2-14) The garrison crew in the builder panel.** A second, named queue for the building categories P2-14
gives the crew (defenses and traps, and support counters if you decided so; walls take no builder), shown where the
artisans are shown, and one line when it first opens. Strings: about 3.

**P6-18 (built-not-live section 4) Rules a player cannot read.** No sentence anywhere says that rival clans answer
the player's last ten raids, that each lost raid halves the next raider's take for a day, or what counters what.
Add a short Codex page: the `counters` and `counteredBy` lists of the catalog entries that are **live** (five
today; the other fifteen with lists are planned buildings and must never be shown), the three temper axes, each
rival clan's leaning, and those two sentences. The lists are design intent, not measurement: for each live building
confirm in the army lab that the listed warriors really do worse against it before the page says so. The two
sentences read their numbers from data as placeholders (the exhaustion window and factor, the number of recent
raids), because P2-06 and P4-06 change them. Strings: about 4.

### Finding things, and feeling them

**P6-05 (RET-10, UIS-04) The next-objective chip is cut off, does not move the camera, and dead-ends.**
- Add kinds ahead of `builders` and `none`: something to claim (a task, a Scroll tier, an achievement, a seal); an
  open rematch; a running Bounty or Gauntlet with unpaid steps and a full army; the next Trial tier when it is at or
  below the Keep; the daily drill. Each opens its panel. The chip never suggests anything paid (protected item 35).
- The "save" sentence is 76 characters in English and up to 106 in other languages on a chip that shows 20 to 40:
  show the shortfall as cost chips with the building's name. When the chip selects a building, move the camera to
  it.
- Cases in `tests/gameplay/sim/return-hooks.test.ts`. Strings: reuse the rail labels; at most 4 new.

**P6-08 (UIS-06, BNL-08, PLY-12) Moments that have no moment.**
- A league promotion or demotion shows nothing (no code compares the league before and after a raid). A Keep level
  arrives like any building, and the only Keep-specific surface is a paid offer. The hero joins at Keep 7 with no
  announcement, has no card outside the battle bar, and his Rally shows no callout (the callout names are built
  from roster warriors only). Tempering opens at Keep 5 silently. There is no haptic anywhere in the village.
- Generalise `ui/unlockCeremony.ts` into a milestone card (a title, icons, up to three lines, one button). Use it
  for a league change, for each Keep level (from the existing "what this Keep unlocks" list, shown before any
  offer), for the hero at Keep 7 and for tempering at Keep 5. Give the hero a card in the Army panel and the Codex
  (his name and ability text are translated) and add heroes to the battle callouts.
- Add a haptic and a count-up on the resource pills when an upgrade finishes, a claim pays or a raid's loot
  arrives. Respect reduced motion and the muted state. No new image files.
- Strings: 3 to 5.

**P6-14 (UIS-08) Side modes are hard to find.** Rail buttons are icon-only and appear silently; Trials shares its
icon with Honor; the Events badge is hard-coded to 0; nothing advertises an open rematch; the calendar is at the
bottom of the Daily panel under the odds table; the Honor pill is a `div` with a click handler. When a rail button
first appears, show its label beside it for a few seconds, once per device. Give Trials its own icon. Badge Events
while a goal event has an unpaid step, and the Battle log while a rematch is open. Move the calendar above the odds
table. Make the Honor pill a button with a label. No new strings.

**P6-06 (retention opportunity 7, UIS-11) The Trials ladder view.** The panel shows one tier, and says "you can
replay any cleared tier" while offering one. Show a ladder: cleared tiers, the next, the ten beyond with layout and
modifier, every tenth marked with its Jade, and a stepper for replays. Strings: about 2.

**P6-16 (UIS-10, UIS-13) Dead ends and keyboards.** The scout screen with no army shows a disabled button with no
route to the Army panel; "Next" is disabled with no reason when the fee cannot be paid; there are 27 `title`
attributes, and on troop cards, the Smoke card and the opponent's Honor line the title is the only explanation,
which touch never shows (a long press on a troop card shows its name and line from data; review the other 24); battle
dialogs have no Escape or focus trap; there are no battle hotkeys although a Windows laptop is a target (1 to 9
for cards, S for Smoke, Esc for "End the battle?"). No new strings.

**P6-10 (UIS-12) Text that leaks past the catalog.** The pending-sync count is concatenated in English onto the
net pill (a key for it exists); "Alliance War" is passed raw into a translated title (Spanish shows "Alliance War
contra X"); the Codex lower-cases a translated string with `replace`; two dead plural-suffix arguments remain in
`app.ts`. `main.ts` recognises the Settings dialog and the battle's back buttons by their translated text: use an
id. Canonical simulation and server wording is translated only at the display boundary through
`locales/runtime.ts`; never pass authored names or chat through a matcher.

**P6-15 (UIS-09) No test constructs the HUD.** `tests/presentation/ui` tests helpers and reads source text; nothing
builds `Hud`, `BattleHud` or `Tutorial`. Add a DOM test environment as a development dependency (not a runtime
one) and tests that build the three on a real `GameController` with stub dependencies: open every panel, walk the
nine tutorial steps, render the results dialog for a raid, a pending raid, a Trial, a practice battle, a Bounty and
a rematch, and assert the objective chip's action for every kind. Keep the Playwright drivers of
`scripts/playthrough/` as a script that measures the bottom bar, the chip and the battle rows at the four sizes.
Do this before anything else in the phase, P6-09 included (the heading "First" above P6-09 is about what a player
meets first, not the order of work): every other item here then gets a test.

**P6-19 (ui-surface opportunity 3, playthrough opportunity 6) Fifty warriors taught in play.** A "Try" button on
locked warriors in the Codex starts the existing practice battle with that warrior (`practiceArmy`, `App.practice`;
the Army panel offers it for unlocked warriors only), labelled practice as today (protected item 46). The first time
a class is brought to a raid, the battle coach line shows that warrior's ability line from data when its card is
selected, once per class per device (protected item 50, as it is). Reuse the existing "Try" key and the data text:
no new strings. Tests: a locked warrior's practice battle spends nothing, pays nothing and awards no mastery
experience; the coach line shows once.

Close the phase: section 13, `npm test`, lint, build, the perf scripts, screenshots of every new surface at the four
sizes in the closure record, and the note that nothing was checked on a physical device. Record before and after the
phase (protected item 58): the production build's main chunk size (gzip), cold boot with
`scripts/playthrough/distboot.cjs`, the console over a scripted session, and the overflow audit of
`scripts/playthrough/panels.js` on every panel. New panels (the Trials ladder, the defense report, the Codex page,
the what-if review, the milestone card) load through `ui/lazyPanel.ts`; nothing is added to the main chunk without
its size in the record. `hud.ts` is 2,298 lines and is where all of this lands by default: put new surfaces in their
own files.

## 12. Phase 7: everything code can still do toward a store release

Read `publish.md`. Most of the cheap wins earlier audits named are already done; its section 3 lists them so you do
not redo them. The finding ids below are those of `structured/publish.json`; the tables inside `publish.md` use an
older numbering for six of them (the plugin sync, the age-rating answers, the policy date, link previews, the word
filter, the bundle id). What is left:

**P7-01 (PUB-04) A test requires the publisher facts to be empty, and nothing stops a store build shipping with
"not published yet" pages.**
- Keep (protected item 36): the pages never invent a fact.
- Change: the test accepts an empty value or a well-formed one (no `example.com`, no angle-bracket placeholder).
  Check the parsed values, not the file's text: its comments use `example.com` on purpose. Add
  `tools/release/check-store-ready.mjs` and an npm script for it (cross-platform, no bash syntax). It prints one
  table of everything still missing for a store build: empty publisher facts, draft terms, the legacy bundle id,
  missing signing secrets and server URL, products in the shipping table, a stale policy date, unsynced native
  plugins. It is an error in the signed Android and TestFlight jobs when operator, support email, deletion URL or
  terms date are empty, and a notice on the web build (reuse `tools/release/ci-note.mjs`).
- Test it in `tests/backend/server/release-tools.test.ts`.

**P7-02 (PUB-05) The signed Android job would upload the old game's package name, which Google Play never lets you
change.** The id `com.toadstoolkingdoms.app` is in five places. Read the app id from one variable:
`capacitor.config.ts` reads it; `android/app/release.gradle` exports it and `android/app/build.gradle`
`defaultConfig.applicationId` reads that (the application id only; the Java namespace can stay; `release.gradle`
does not set the id today); `strings.xml` (`package_name`, `custom_url_scheme`), which `cap sync` does not rewrite,
follows it or is listed as staying; and the iOS variable `IOS_BUNDLE_ID` defaults to the same value. The
signed jobs fail with a clear message while it is unset or still the old id, unless `ALLOW_LEGACY_APP_ID=1`. Cover
it in `tests/backend/release-config.test.ts`. Choosing the id is the owner's decision; do not choose it.

**P7-03 (PUB-06) Committed native project files do not list two plugins the game depends on.** Run
`npm run build && npx cap sync` and commit what it regenerates. Add a test that every Capacitor plugin dependency
in `package.json` (each `@capacitor/*` and `@capacitor-community/*` package except `core`, `android`, `ios` and
`cli`, which are not plugins) appears in `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`
and `ios/App/CapApp-SPM/Package.swift`.

**P7-04 (PUB-07) Two prepared Apple age-rating answers are wrong** (`docs/store/PRIVACY.md`: contests "None", age
assurance "No", while the game runs leagues and events and calls both stores' age APIs). Recheck Apple's current
definitions page before changing them (the audit lists the official references to recheck), write the reasoning
beside each answer, add the closure record for C05, and pin both answers in
`tests/presentation/store-compliance.test.ts`.

**P7-05 (PUB-08) No third-party licence notices ship with the game.** A small generator
(`tools/release/licenses.mjs`) writes `public/licenses.html` from the shipped dependencies and the two fonts, with
full licence texts in English, linked from the support page. Page keys are positional, so put the link inside an
existing unit of `public/support.html` (its footer line): exactly one key then changes. A new paragraph or list item
renumbers every later key of that page in 49 languages, each with the old translation of a different sentence as
its hint. A test checks every runtime dependency appears.

**P7-06 (PUB-09) The iPhone release workflow runs on an image that may not carry the SDK Apple requires.** Move it
to the runner the audit names and turn the SDK warning into an error below the required version. The workflow has
never run; say so.

**P7-07 (PUB-10) The chat word filter is 30 English words for a game shipped in 50 languages.**
- Add per-language lists inside the gameplay compartment (for example `social.json` `profanityByLanguage`, or a new
  data file loaded by `sim/data.ts`), starting with the ten largest launch languages. They cannot live under
  `locales/`: `sim/` may import only from `src/gameplay`, and the filter reads `data.social.profanity`, which is
  part of the data the game and the server must load identically. The data version changes, so the server and the
  game deploy together (a REQUESTS entry).
- Each list ships with a corpus of ordinary sentences in that language that must pass unfiltered, to catch false
  positives. The same filter censors player names on the server, so test names as well as chat, and both matching
  modes (word edges in every script, substrings in unspaced scripts).
- Keep the lists conservative and mark every one for native review, in a place that exists for every language (not
  every `locales/<code>/` has a review file).
- This is moderation quality, not legal compliance: the closure record says a native speaker has not reviewed them.

**P7-08 (PUB-11) The privacy page's "last updated" date is older than its last change.** Set `policyUpdated`, and
add a test that compares it with a hash of the English privacy strings so the text cannot change without the date.

**P7-09 (PUB-12) Shared links unfurl without an image; the install prompt has no screenshots.** When
`VITE_PUBLIC_URL` is set, write absolute `og:image`, `twitter:image` and `og:url` at build time, and pass the
variable in the build step of `.github/workflows/deploy.yml` as the Android and iOS workflows already do (a
repository variable). The web deploy is the page a link crawler fetches, and its workflow never sets the variable
today. While it is unset the tags stay relative and the build says so through `tools/release/ci-note.mjs`. Commit
two compressed screenshots, list them in the manifest and the localized manifests, and keep them out of the service
worker's precache list.

**P7-10 (PUB-13) Open-item documents contradict the code.** Move answered entries in `docs/backend/REQUESTS.md`,
`docs/game-theory/REQUESTS.md` and `docs/art/REQUESTS.md` under a "Done" heading with their commits. Add the
open-item table from `publish.md` section 4 to the audit as a dated reassessment (R05 says "English only" while 50
languages are complete; the listing's languages row predates them).

**P7-11 (PUB-14) Retention statistics by the player's local day are built and switched off in every build.** Do
not switch them on: `docs/SHIPPING.md` 3l and `docs/store/PRIVACY.md` record `VITE_STATS_TZ` as the owner's switch
(protected item 37), against the report's reading. Wire it as a repository variable that defaults to off in the
three client workflows, document it in `docs/SHIPPING.md`, and put "switch on local-day statistics" on the owner's
checklist.

**P7-12 (BNL-14) No person can play the built-not-live content on a deployed build.** The preview needs a dev build
or a build flag the deploy workflow never sets, and a test forbids that flag in `deploy.yml`
(`tests/backend/verification-client.test.ts`); keep that test. Prepare a separate, manually dispatched workflow
file whose input defaults to off (a second web build under a preview path, sandbox save, never online), a test that
it has no push trigger, and a short tester checklist. Whether an unfinished-content URL may exist, and who tests,
is the owner's decision: put it on the checklist and do not switch it on.

**P7-13 The listing sells an older game.** After the earlier phases, update `docs/store/LISTING.md` with what the
game now has, every claim tied to data or a test in its "claims checked" table (protected item 38). No tool writes
the per-language store copy: `docs/store/<code>/LISTING.md` (with `PRODUCTS.json` or `LOCALE.json` where product
text changed) are 49 hand-translated files. Re-translate them in the translation batch, with each translator's
allowed paths extended to `docs/store/<code>/`, then run `npm run store:storekit`. The ledger lists the sentences
earlier items left stale in the translated listings (the season look of P1-02, the "endless ladder" claim of P1-06):
check each is gone. Flag for the owner the keywords that name things the game does not contain.

**P7-14 "What's new".** A short per-version entry shown once in the existing News panel, with the same text kept as
the stores' release notes. Strings: one entry.

**P7-15 Things that cannot be compiled or verified here: write them down, do not pretend.** The app-level iOS
privacy manifest, the audio session category, the Game Center and Play Games achievements plugin, the
marketing-version mismatch in the Xcode project. Make the source change where it is plain text and safe, and list
each in the record as "not compiled, not run on a device".

**P7-16 The owner's checklist, in one place.** Write `docs/store/OWNER_CHECKLIST.md` from
`docs/audit/STATE_OF_THE_GAME.md` section 6, `publish.md` section 4e and what this pass adds: the legal entity, bank
and tax; the trademark search; the final bundle id and package name; the domain; every publisher fact; the legal
reviews per market and the under-13 position; store accounts, capabilities, keys, products and forms; hosting,
backups and staff; signing secrets; physical devices and store testing; native review of 49 languages, of the word
lists and of the festival names; whether a preview URL for unfinished content may exist and who tests it; whether to
switch on local-day statistics; the open decision behind GLOBAL-002 (create online villages on the server at first
contact, or keep importing device villages); turning off the old Toadstool Pages site; an artist and music;
real-player playtests of every number this pass changed. Each line says what it blocks and which command or file
shows whether it is done. The preflight of P7-01 checks the lines a machine can check.

Not taken in this pass, record them as open in the ledger: an accessibility statement page (an owner decision, C21),
a clearer message for a late raid report (R02), `keepalive` on the last send before a kill (GLOBAL-010), release
tags so the previous-client contract test has something to test, Alliance polling payloads, deltas and compression
(R04: backoff exists, sizes were never measured), and the split of `hud.ts` and `main.ts` `boot()`.

One open risk this pass does change, and must write down. The game's offline sentence for a server-held village
(R01: "Offline you can still build, train, research, collect, fight Shadow Trials and practice battles") must name
what the pass adds that works queued (check each: the daily drill, a Bounty or Gauntlet attack) and what now waits
for a connection (the second chest of an offline spell, P1-16). It is one changed string.

Close the phase with section 13, the full checks and the closure record. Do not write "ready" anywhere.

## 13. Translation: all 49 languages, at the end of every phase that touched text

Run this procedure when a phase's English is final, before that phase's closure record. Two adjacent phases
finished in one session may share one run. The list of new and changed keys, with what each is for, comes from the
ledger.

1. `npm run i18n:extract && npm run i18n:sync` (and first `node tools/i18n/pages.mjs extract` if any English page
   changed), then `npm run i18n:status`. Every language shows the same missing count; a changed English string
   appears with its old translation as a hint.
2. One translator sub-agent per language, each given `locales/CLAUDE.md` as its brief, with `locales/GLOSSARY.md`,
   its language's line in `languages.json` and its `TERMS.md`. Override two steps of that brief, in writing, for
   every translator: they do not create or switch branches and do not commit (49 agents share one working tree; you
   commit `locales/<code>/` on the working branch), and they skip `npm test` (you run `npm test -- tests/locales`
   once in step 4). A translator edits only `locales/<code>/` (and `docs/store/<code>/` when the listing changed),
   fills `text` only, never changes a key or `en`, and is finished when `npm run i18n:next -- <code> 200` lists
   nothing and `npm run i18n:check -- <code>` is clean (the check alone passes with every new `text` still empty).
   Run a few at a time.
3. Tell each translator what the new text is for. Give them the screen, the feature and the placeholders' meaning
   for every new key (a table from your ledger). A translator who sees only "Kept {kept} of {total}" will guess.
4. When all are back: `npm run i18n:check`, `npm test -- tests/locales`, `npm run i18n:status` must say every
   language is complete. Run `npm run store:storekit` if any store text changed.
5. Have a second agent per script (one reviewer per `script` value in `languages.json`, with the Indic scripts
   grouped: Latin, Cyrillic, Greek, Arabic, Hebrew, Indic, Ethiopic, Thai, and one each for the four CJK worksheets,
   `zh-Hans`, `zh-Hant`, `ja` and `ko`) read a sample of twenty new strings against the English for meaning,
   placeholders and the glossary's terms. Fix what it finds.
6. The record says what this is: machine translation checked for structure, not reviewed by native speakers.

## 14. Finishing

Before you report:

1. Every check, from a clean install: `npm ci`, `npm test`, `npm run test:slow`, `npm run lint`, `npm run build`,
   `npm run typecheck:server`, `npm run server:build`; the Postgres and Redis suites if you could run them; the perf
   scripts if a browser could be started (the Phase 6 preamble). Whatever could not be run is listed as not run.
2. Every generated document is regenerated by its command and committed: the status file, the campaign, the army
   balance, the roster and progression documents, the preview balance, the StoreKit file, the language packs'
   availability.
3. The briefs describe the game as it now is: `src/gameplay/CLAUDE.md` (a section for this pass in the style of the
   existing batch sections), `src/presentation/CLAUDE.md`, `src/backend/CLAUDE.md`, `docs/DECISIONS.md`,
   `docs/PROTOCOL.md`, `docs/SHIPPING.md` (the release order for this pass: rules snapshot, server first, the save
   bump's forced-update notice).
4. `docs/backend/REQUESTS.md` lists everything that must deploy together and in what order.
5. A closure record per phase in `docs/store/WORLDWIDE_AUDIT.md`, and the ledger complete: every work item of this
   prompt has a final status.
6. An independent reviewer has tried to refute each phase (0.5) and its findings are fixed or recorded.

Your final report to the owner, in plain words:

- What changed, as the loops table of section 1.1 with a "now" column and the measured before and after for each
  row.
- Every number that moved a gate or a pin, with the old and new value.
- What you reverted or left open, with the numbers that made you stop.
- The release order, and what a player on an older build will see.
- What nobody has verified: no physical device, no store build, no real storefront, no person has played any of
  it; model-player outcomes are not retention or revenue; 49 languages are unreviewed by native speakers.
- What the understand pass never examined: the social systems (Alliance and Gang wars, friends, duels, chat) as
  replay loops, and art and audio. "Every stone" was not turned there.
- The path to `docs/store/OWNER_CHECKLIST.md`. "100% publishable" is true only when that list is empty, and no code
  can empty it.

## Appendix A. Where each finding went

| Report | Findings | Work items |
|---|---|---|
| `publish.md` | PUB-01, PUB-03, PUB-02 | P0-02, P0-03, P0-04 |
| `publish.md` | PUB-04 to PUB-14 | P7-01 to P7-11 |
| `exploits.md` | XPL-01 to XPL-06 | P1-11 to P1-16 |
| `exploits.md` | XPL-07, XPL-08, XPL-09, XPL-10, XPL-11, XPL-12, XPL-13 | P0-04, P1-17, P1-18, P1-19, P1-01, P1-20, P1-21 |
| `retention.md` | RET-01 to RET-07 | P5-01, P1-03, P1-01, P1-02, P1-08 and P5-04, P1-06, P1-07 |
| `retention.md` | RET-08 to RET-14 | P5-05, P5-06, P6-05, P5-03, P5-09, P5-06, P2-09 |
| `economy.md` | ECO-01 to ECO-07 | P2-01, P3-01 and the ratio gate of P3-02, P1-01, P1-03, P3-08, P1-04, P1-05, P2-07 |
| `economy.md` | ECO-08 to ECO-14 | P2-09, P5-11, P3-09, P2-13 (optional) and open, P3-03, P1-10, P3-11 and P3-08 in part with the rest open |
| `defense-raids.md` | DEF-01 to DEF-13 | P2-01, P2-01, P2-04, P2-02, P2-03, P2-05, P2-12, P2-07, P2-08, P2-09, P2-06, P2-10, P2-11 |
| `pacing.md` | PAC-01 to PAC-07 | P3-01, P3-02, P3-03, P3-04, P1-06, P4-10 step 6 if a hero passes the gate and otherwise open, P4-09 |
| `pacing.md` | PAC-08 to PAC-14 | P3-02, P3-06, P3-07, P5-08, open, P3-05, P3-10 |
| `combat.md` | CMB-01 to CMB-06 | P4-01, P6-02, P4-06, P4-05, P4-02, P4-04 |
| `combat.md` | CMB-07 to CMB-12 | P4-03, P4-07, P6-01, P4-11, Phase 4 preamble and P4-10, P4-08 |
| `built-not-live.md` | BNL-01, BNL-02, BNL-07, BNL-08, BNL-14 | P6-01, P5-07, P1-22, P6-08 and P4-02, P7-12 |
| `built-not-live.md` | BNL-03 to BNL-06, BNL-09 to BNL-13 | P4-10 |
| `ui-surface.md` | UIS-01 to UIS-07 | P6-07, P3-04, P6-01, P6-05, P6-13, P6-08, P2-15 and P6-13 |
| `ui-surface.md` | UIS-08 to UIS-13 | P6-14, P6-15, P6-16, P6-06, P6-10, P6-16 |
| `playthrough.md` | PLY-01, 02, 06 to 10, 12, 14 | P6-09 |
| `playthrough.md` | PLY-03, PLY-04, PLY-05, PLY-11, PLY-13 | P3-04, P3-11, P6-11, P3-12, P6-07 |

The PUB ids are those of `structured/publish.json`; the tables inside `publish.md` number six of them differently
(Phase 7's preamble).

Each report also lists opportunities and lower-priority notes. Those this prompt took are named in their work
items. The rest are recorded in the reports; add the ones you judge worth a later pass to the ledger as open ideas.

Work items added after the second review: P6-19 (ui-surface opportunity 3 and playthrough opportunity 6; no finding
id). That review's other additions are text inside existing items and two protected items (57 and 58, section 2.9).

## Appendix B. Where the reports disagreed, and what this prompt decided

- **Is the Scroll's value estimate a strength or a defect?** One report protects it (it counts only reachable
  tiers), another shows it reaches 65 times the same-price pack. Both are right. Keep the reachable-tier logic,
  change the price basis and add the guard (P1-05).
- **Trial growth past tier 60:** 0.03 in one report, about 0.02 in another, with different last achievement steps.
  Measure both; the achievement's last step follows the measurement (P1-06).
- **What a raider carries by stars:** `[0.2, 0.5, 0.8, 1]` in the defense report, `[0.1, 0.4, 0.7, 1]` in the lab
  and the economy report. The acceptance results of P2-01 decide.
- **The rematch payout:** a flat share raised to 0.6 in one report, a share of what the raid took in another. The
  second is chosen because it makes revenge recover a loss (P2-07).
- **The league win bonus:** a share of the raid's own loot in two reports (economy, retention), a share of the
  Keep's lowest loot in the defense report. The second is chosen against the majority, because it is the pattern
  the held-raid, rematch and Trial rewards already use and it cannot be inflated by picking rich targets (P2-09).
- **The league season reset:** one report would soften it, another calls it a sound loop. No measurement shows
  harm. It stays.
- **The third artisan:** one report suggests putting the hut in the starting layout. This prompt changes the model
  player instead (P3-02); the starting economy stays.
- **The tutorial:** one report would reorder its steps and remap the stored index; another keeps the nine steps and
  makes the waiting step non-blocking, which needs no migration. The second is chosen (P3-04).
- **Squad orders "file" and "hold a reserve":** traps in one measurement, sometimes best in another. File is
  offered; the reserve only if it passes a measurement (P6-01).
- **Rally:** one report would keep the re-arm and rewrite the text (no rules change); another measures two rule
  changes that make it matter. The rule change is chosen, because a text fix leaves it worth nothing (P4-02).
- **Warrior Mastery:** one report would switch the bonus on for Trials only; the report that measured it shows the
  curve gives +10% after one raid and the server does not check it. Ranks only (P5-07).
- **The planned heroes:** one report calls them the content for the empty late Keeps; the report that measured
  them shows the live hero beats each with its own army. They ship only through the gate (P4-10).
- **`battle.json` `scoutFeeByHall` and `generatedLootByHall`:** the defense report says editing them forces a rules
  bump. The code says otherwise (3.1).
- **Does defense pay?** Three earlier audits said no on the campaign's 0% held. The defense report shows that
  figure is the model's undefended village (Phase 2 preamble).

Settled after the second review, where its four reviewers disagreed with each other or with the first draft:

- **How neutral a base at caps must be (P2-01, result 3):** one reviewer gated +30% at Keeps 9 to 15, one gated −50%
  to +35% at every Keep, one gated nothing. All three agreed that the draft's +38% at Keep 5 was a sign error and
  that ±10% cannot be met. Chosen: an upper bound of +35% at Keeps 9, 12 and 15 with room in storage, which keeps
  five points of margin over the measured +30%; Keep 5 and full storages are reported. Results 1 and 6 already guard
  the low side.
- **A reward for stars denied on raids by real players (P2-01, scope):** two reviewers would pay it behind limits,
  one would not pay it in this pass. Chosen: honor only, unless all three limits are built in the same change.
- **The chest opened before the server's entropy arrives (P1-16):** one reviewer would queue the open under its own
  day and hold back the reveal; another keeps the chest closed until the earlier answer arrives. The second is
  chosen: the server dates a command at most 12 hours back, so a queued open cannot keep its day.
- **A push for a simulated raid (P2-12):** one reviewer would send it, labelled; another would send none. None is
  chosen: the device build sends no push for a bot raid, and a made-up raider should not be what calls a player
  back.
- **The light-support cells (P4-01):** one reviewer would bound the gain at Keeps 6 and 10 (3 points over live);
  another holds Keep 6 to the existing upper gate and lists Keep 10, which is over it today, as a known-over cell.
  The second is chosen: it is the gate Keeps 7, 8 and 15 already have.
- **The garrison crew's bar (P2-14):** both reviewers dropped 1.25 as a fixed bound. The crew must beat the same
  campaign without it by more than a seed's noise, and P2-04 sets the pace gate from that run.
- **How task repetition is measured (P5-04):** with the real eligibility on model villages (one reviewer), not with
  the all-eligible script plus a second report (another). The arithmetic of the second is kept as the explanation.
- **The hero in a sanitized battle setup (P1-11):** the first draft said both "set from `heroFor`" and "never above
  it". It is checked and never overwritten, as the raid path does.
- **Collector accrual sites (P3-03):** the reviewers listed two different sets of six. The code has seven writes,
  five of which push the start to the upgrade's end.

## Appendix C. Traps, collected

- The campaign's defense columns describe a village with level-1 defenses and no walls until P2-04 lands.
- `supportStrike` at 1.0, Smoke at 12 seconds, `defenseWin.uncapped`, a lower Keep 6 cost, a trimmed Eclipse Ninja
  damage, early Dojo speeds of 2 / 2 / 1.6 / 1.3, a top-up exponent of 0.75 without a monotonic rule, a higher Keep 3
  slack for the regular player: each was measured or reasoned out and rejected or found wanting. Do not rediscover
  them.
- Harnesses that mislead. Once their change is live, `def_econ.ts` and `def_daily.ts` double-apply the carry in
  their "proposed" columns, and the "today" reward of `def_econ.ts` is its own arithmetic too, on storages it starts
  full (P2-01). `next_offers.ts` reads the fee table by the player's own Keep, so it cannot see P2-11, and it passes
  no recent armies, so it cannot see `counterShare` (P4-06). `trialcap.mjs` scans tiers 53 to 76 with one seed and
  prints the best of five fortresses (P1-06 needs `r3.mjs`). `r1.mjs` counts every task template as eligible
  (P5-04). `firsthour.mjs` plays the model, not the tutorial (P3-04). The mixed variants of `t10.ts` drop their flag
  half against the real tree (section 4).
- Mastery's bonus as tuned (+10% after one raid), the three planned heroes as built (a false choice) and ten of
  the fifteen planned counters (no effect) are not ready, however finished their code looks.
- A new building's body moves a raid more than its rule does. Anything added to generated bases is a balance
  change even with its effect switched off.
- A "hold N raids" goal is dishonest until Phase 2 is in and measured, and unreachable online until P2-12 ships.
- A change to which base a seed generates rides the rules bump, so that builds on the old rules keep getting bases
  from the archived matchmaking (P4-07). Tickets and records carry their own base; no replay depends on it.
- A field written by `createNewVillage` or a migration is a state change even when it is empty (3.2).
- A sanitized battle setup must not break replays of old records: records carry their own setup and are replayed
  as recorded; the sanitizer applies to new battle commands (P1-11).
- A translated sentence that says a number ("Holds 8 hours of output", "repeats every two weeks", "8 seconds",
  "30% more damage") changes in 50 languages when the number does. Make the sentence read the number where you can.
- Every new English string makes 49 languages incomplete, and about 25 test files red, until section 13 is done
  for that phase.
- An achievement tier needs its platform id; a new table needs its line in account deletion; a new metric needs its
  help line; a new server message needs its code in the catalog.
- A reward for a star denied, paid on raids by real players without limits, is a faucet for two accounts: a 0-star
  raid leaves the defender unshielded and one warrior is a valid attack (P2-01).
- With storages full the held-raid reward can only refill what the raid took, so a base at caps nets −25% to −88% of
  a hold there. That is the cap working. Do not tune against it, and do not revert P2-01 for Keep 5 (P2-01).
- The regular model's Keep 6 has a floor of 9 days in the slow suite, and Phase 3's own starting values land on
  exactly 9.00 (P3-01).
- Four seeds in the army lab move cells on untouched data, and the light-support mix at Keep 10 is over its upper
  gate today (P4-08, P4-01).
- The rules snapshot copies the working tree. Phase 4's commits live on a second checkout until it is taken (3.1).
- A new key in `troops.json`, `buildings.json` or `battle.json` enters the combat fingerprint unless its name is
  already in the `TEXT` set (3.1).
- "campaign results are current" can be green while the results are stale: the fingerprint does not see
  `sim/village.ts` and five other simulator files (3.4).
- A simulator refusal written in English stays English in 49 languages, and nothing fails (3.5).
  `npm run i18n:check` passes with every new `text` empty (section 13).
- A look, seal or milestone granted only at the moment of crossing can never be earned by a village already past it,
  and an import must count what a village already qualifies for as claimed (P5-06, P5-08, 3.3).
- A battle record's `carry` is the diversity share times the stake multiplier, not the diversity share (P2-15). The
  battle log holds ten records of every kind, so "no earlier attack record" does not stay true (P3-12).
- There are two seasons: the league's is a UTC month, the Scroll's is 30 days from its epoch (P5-10). A plain list
  of strings in a data file is never translated.
- A `playwright` development dependency can shadow a working global one and ask for a Chromium that is not there
  (Phase 6 preamble).
- The exploit report's "checked and found sound" list, and each report's protected list, are there so nobody
  re-hunts or "fixes" them.
- Headless Chromium is not a phone, a model player is not a player, and a policy draft is not legal advice. Say so
  wherever you report a result.
