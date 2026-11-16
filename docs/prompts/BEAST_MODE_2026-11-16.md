# Agent prompt: the replayability, game-theory, economy and publishability pass

Written 2026-11-16 against commit `9bf76af` (the tip of `main` and of `claude/gracious-meitner-4k0h0d` that day).
The evidence behind every instruction is in [`docs/audit/understand-2026-11-16/`](../audit/understand-2026-11-16/README.md):
ten investigator reports, their structured findings and the measurement scripts they ran.

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

This document is long because the work is wide. It is not a wish list: every work item names its evidence, the
files and data keys to change, how to measure it, the tests to add and the result that makes it done. Where it gives
a number to ship, that number is a **starting value from a measurement on 2026-11-16**. You re-measure before and
after, and the acceptance result decides, not the starting value.

## 0. How to work

### 0.1 Read first, in this order

1. `CLAUDE.md`, `AGENTS.md`, `docs/STATUS.md` (generated: the only source for version numbers).
2. `docs/store/WORLDWIDE_AUDIT.md`: the owner objective at the top, the open findings (GLOBAL-001, 006 markets, 007,
   008, 015, 017, risks R01 to R10), and the last six closure records, to learn the record format you will write in.
3. `docs/DECISIONS.md` in full. It is the design intent behind almost everything you will touch.
4. `src/gameplay/CLAUDE.md`, `src/presentation/CLAUDE.md`, `src/backend/CLAUDE.md`, `locales/CLAUDE.md`,
   `compartments.json`.
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
  work item says the old target was wrong and gives the new one with its measurement.
- Never skip, `.skip`, quarantine or delete a failing test. Fix the cause or revert the change.
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
| Months: the long horizon | Goals that outlast Keep 15 | Nothing new after day 113; the "endless" Trials end near tier 68; Keeps 9, 10, 13, 14, 15 unlock no building; no collection layer is live (`pacing.md` 2, 4; `retention.md` 3) | Phases 3, 5, and the built-not-live work in Phase 4 |
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
   threads, identical on three JavaScript engines when measured on 2026-11-16 (`publish.md` 1c).
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
    rejected.
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
    stays. Phase 2 changes the stake multipliers only.

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

If you believe one of these must change shape to complete a work item, stop that item and record why. Do not
decide it alone.

## 3. Rules and procedures you must follow exactly

### 3.1 Changing anything a battle reads: one `SIM_RULES` bump for the whole pass

The combat fingerprint covers `troops.json`, `buildings.json` and `battle.json` with text, prices and timers
removed (`tests/gameplay/battle/rules-version.test.ts`, the `TEXT` set; the same list is `NOT_COMBAT` in
`src/backend/net/dataVersion.ts`). Code in `src/gameplay/sim/battle/` that changes how a battle plays is covered by
the rule too, even though no hash sees it.

All combat changes of this pass ship under **one** bump, in Phase 4, in this order:

1. Finish and measure every combat change on a scratch copy or behind data values that are not yet set, so the live
   fingerprint is still the old one.
2. `npm run rules:snapshot` while `SIM_RULES` is still the current value. This archives today's rules for the
   server (`server/rules/v<N>/`, `archive.ts`, `manifest.json`) and records the fixture. It refuses to run twice for
   one version.
3. Bump `SIM_RULES`. Set `SIM_RULES_COMPATIBLE` to the versions the new code still plays exactly. If a battle with
   none of the new content can differ from the old rules in any way (it can, as soon as a live warrior's behaviour
   changes), the list is empty.
4. Apply the data changes. Update the fingerprint and rules number in `rules-version.test.ts` to the values the new
   code produces. Re-pin `tests/gameplay/battle/aura-cache.test.ts` from the new code.
5. `npm run rules:fixture` for the new version.
6. `npm run balance:armies`, `npm run balance:campaign`, `npm run test:slow`, `npm run docs:progression`,
   `npm run status`, then the full checks.
7. Write the `docs/backend/REQUESTS.md` entry: the new rules number, the archived one, and "deploy the server before
   the game".

Do not bump twice. If a combat item is not ready when the bump is made, it waits for a later pass.

Two keys in `battle.json` are deliberately outside the fingerprint: `scoutFeeByHall` and `generatedLootByHall` (they
are in the `TEXT` set). The defense report's warning that editing them forces a bump is wrong. They still change the
data version and the campaign fingerprint.

`battle.json` `temper.offers.counterShare` is matchmaking, not battle arithmetic, but it sits inside the
fingerprinted file. Changing it belongs to the bump.

### 3.2 Changing what a village stores: one `SAVE_VERSION` bump for the whole pass

`docs/DECISIONS.md` records the lesson of v23: a bump forces "Update Kagemura" on every older build that meets a
newer server village, so bumps are grouped and a field is added only when the feature that writes it goes live.

- This pass makes **one** bump (current version plus one). Introduce it in the first work item that needs stored
  state, and add every later field of this pass to the same migration step.
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

### 3.4 Changing balance data: the campaign fingerprint

`tools/balance/campaign.ts` hashes the played data (`buildings`, `hall`, `economy`, `troops`, `battle`, `ranks`,
`raids`, `pass`, `daily`, `events`, `trials`, text removed), the rules number, five source files
(`tools/balance/playerModel.ts`, `matchmaking.ts`, `basegen.ts`, `defense.ts`, `offline.ts`) and the campaign list.
Any change to one of them makes `tests/gameplay/balance/campaign-gates.test.ts` fail until you run
`npm run balance:campaign` and commit the regenerated `docs/game-theory/CAMPAIGN.md` and `campaign.json`.

- The campaigns take several minutes. Batch: finish a phase's data changes, then run once. While iterating, use the
  focused harnesses in section 4, which answer in seconds.
- After the run, read the gates. If one fails, the change is wrong or the work item explicitly re-states that gate.
- `achievements.json`, `cosmetics.json`, `store.json`, `offers.json`, `social.json` and `notifications.json` are not
  played and do not need the run.

### 3.5 Player-visible text: every string costs 49 translations

All 50 languages are complete today and `Settings` hides a language that is not. One new English string makes 49
languages incomplete until it is translated.

- Interface text goes through `t()` (`src/presentation/ui/i18n.ts`) with its English in `locales/en/ui.json`;
  plurals are keyed ICU messages. Game-data text lives in `src/gameplay/data/*.json` and reaches the catalog through
  `npm run i18n:extract && npm run i18n:sync`. Server messages are `srv.<code>` entries in `locales/en/messages.json`
  thrown with `fail(...)`. Never rename or reuse a key or code.
- Reuse an existing key only when the meaning is identical, not merely the English.
- Do not build sentences from fragments, do not let anything agree in gender with a placeholder, and isolate names.
- Names in any script go through `sim/social/names.ts`.
- Keep a running list of new and changed keys in the ledger, with what each is for. Translation is done once per
  phase, at its end, by the procedure in section 13, so wording can still change while you build the phase.
- Inside a phase the language-readiness tests fail as soon as one English string is added
  (`tests/locales/*.test.ts` assert `ready` for every language) and the status file's ready list goes stale. Those
  are the only failures you may carry, and only inside a phase. After every `npm test` in that state, confirm the
  failing files are exactly `tests/locales/*` and `tests/architecture/status.test.ts`; anything else is a real
  failure. **Every phase ends fully green with all 50 languages complete.**
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
| A number in the status table | plus `npm run status` |
| Native config, plugins | plus `npm run build && npx cap sync`, and commit what it regenerates |

`npm test` runs the boundary, import-cycle, unused-export and status tests. An export nobody imports fails
`tests/architecture/unused-exports.test.ts`; its allow-list may only shrink.

### 3.9 The progress ledger

Create `docs/audit/understand-2026-11-16/PROGRESS.md` in your first commit and keep it current. One row per work
item id from this prompt: status (`todo`, `doing`, `done`, `reverted`, `skipped: no longer true`,
`open: needs owner`), the commit, the before and after numbers, the new or changed locale keys, and anything the
next session must know. A session that runs out of context writes its state there before stopping. A session that
starts reads it first.

When a phase is complete, add its closure record to `docs/store/WORLDWIDE_AUDIT.md` in the format of the existing
ones: a table of finding, status, what changed, evidence, remaining limitations, then the verification line with the
commands you ran and what they reported. Say plainly what was not verified: no device, no store, no person played
it, model-player outcomes are not observed retention or revenue.

## 4. The measurement toolkit

Every harness below was run on 2026-11-16 and its output is kept next to it. They import the repository's real
simulator. They hard-code the checkout path `/home/user/ninja-version-of-game-1`; if yours differs, replace it with
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
| `defense-raids/def_econ.ts` | What a raid takes and what a hold pays, per build quality, under today's and proposed rules |
| `defense-raids/def_daily.ts` | Raids per day and loss per day through the real slot and shield rules |
| `defense-raids/raider_dist.ts` | Which bot raider a village meets, by honor |
| `defense-raids/pace_noraids.ts` | The regular model's pace with and without raids |
| `defense-raids/away.ts` | What a 7-day and a 30-day absence costs |
| `defense-raids/next_offers.ts` | The spread of Next offers against the fee |
| `pacing/casualwall.mjs` | The casual model day by day: income by source, stolen, spend, idle builders |
| `pacing/variants.mjs` with `v1.json` to `v7.json` | What-if campaigns with data patched in memory |
| `pacing/firsthour.mjs` | The first 90 minutes: raids, Keep times |
| `pacing/trialcap.mjs` | How far a maxed Keep 15 army climbs the Trial ladder |
| `pacing/keeptable.cjs`, `maxout.cjs`, `research.cjs` | Unlocks per Keep, builder-days per Keep and type, research lane-days |
| `economy/econ1.cjs`, `econ2.cjs`, `econ3.cjs` | Production against costs per Keep, free Jade per month, skip and top-up curves and the proposed re-curve |
| `retention/r1.mjs`, `r2.mjs`, `r3.mjs` | Task repetition, reward value by Keep, the Scroll rollover and look reproductions, Trial battles past tier 60 |
| `combat/common.ts` with `t1.ts` to `t14.ts` | Entry-point spread, hero and Rally, Smoke, army panel by temper profile, every warrior's marginal and kit value, formations, scouting-metric correlation, candidate fixes |
| `publish/det.ts` | A hash of generated bases, bot deployments and results for 48 raids, for cross-engine comparison |
| `exploits/repro1.xpl.ts` to `repro4.xpl.ts` | Reproductions of XPL-01 to XPL-06, XPL-09 and XPL-10. Run from the repository root: `npx vitest run --config docs/audit/understand-2026-11-16/scripts/exploits/vitest.config.mts repro1` |
| `exploits/matched.xpl.ts`, `matched2.xpl.ts`, `iso/` | The matched-raid test row by row: determinism, sensitivity to the Keep's slack, process isolation (XPL-07) |
| `built-not-live/squad.mjs` | Nine squad orders through six entry points per base |
| `built-not-live/heroes.mjs`, `herolast.mjs` | Each planned hero against the Shadow Captain and against no hero, sent first and sent last |
| `built-not-live/counters.mjs` | Each planned counter: with it, without it, and with its body only |
| `built-not-live/mastery.mjs`, `masterypower.mjs` | Raids needed per mastery level; what a bonus does to destruction |
| `built-not-live/caps.mjs`, `tables.mjs` | Cost and builder time of the planned buildings against the live defense budget |
| `ui-surface/i18n-probe.test.ts`, `objective-lengths.cjs` | Which strings the interface builds translate; the objective chip's length in 50 languages |
| `playthrough/daemon.cjs`, `tut_*.js`, `raid*.js`, `panels.js` | Playwright drivers for the first run, raids and every panel at 360×640 and 844×390 (Chromium and Playwright must be installed); `shots/` holds the screenshots the report cites |

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
     `--no-opt` or the current equivalent). Diff against `det-node22.txt`. Name the stage that differs.
  2. Add `.node-version` and make every workflow and the `Dockerfile` read one exact version.
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
  Record premium grants on the purchase's `premium` record exactly as `claimTier` does, so a refund still takes back
  what was given. Keep `{ season, granted, overflow }` in a new optional `pass.lastSeason` for the welcome-back
  summary.
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
- Also: `docs/store/LISTING.md` claims "one Scroll-only look" and a test pins it. Update the claim and its test
  together.
- Tests: twelve seasons give the list in order; an owner gets `repeatJade`; the estimate never lists an owned look.
- Strings: one name per new look.

**P1-03 (RET-02, ECO-03) Tasks pay nothing for the last third of every season, and the claim button does nothing.**
- Why: measured. A player who does everything earns 471 points a day and reaches tier 30 on day 19 of 30; 36% of
  earnable points have no tier. `claimTask` still adds points and shows "+100".
- Change: `pass.json` `bonus: { everyPoints, reward, maxPerSeason }`, resources only, Keep-scaled, no Jade (starting
  value: every 300 points, 6,000 Coins and 6,000 Provisions at scale 1, at most 17 a season). `claimTask` pays each
  newly crossed bonus through the normal grant path and reports it in its reward event. No new state: the count is
  `floor((points − tiers × pointsPerTier) / everyPoints)`. A "Bonus" row in the Scroll panel.
- Do not add the bonus to `passPremiumValue`.
- Done when: a task claimed after tier 30 always pays something visible, and a full season's bonus total is at most
  one raid's loot at that Keep (measure with `scripts/retention/r1.mjs`).
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
- Change, after P3-11 re-curves top-ups: value the Jade tiers as Jade and the supplies at the re-curved top-up
  price, and scale the reachable-tier count by the player's own task completion over the last 14 days (never above
  100%, a new player uses a data default). Add a guard: if the estimate still exceeds six times the Jade of the
  same-price pack, show the Jade and list the supplies by amount instead of converting them.
- Test: the guard at Keeps 3, 5, 10 and 15; a player who completes half the tasks sees about half the tiers counted.

**P1-06 (RET-06, PAC-05) The "endless" Trials end near tier 65 to 72, one achievement cannot be finished, and the
panel says "there is no top".**
- Why: measured twice with different harnesses. A fully researched Keep 15 army with the bot plan clears through
  about tier 63, with scattered clears to 68; growth is 6% a tier and nothing a Keep 15 player owns grows. Tier 60
  stacks both modifiers and gives one star. `achievements.json` `trial_walker` ends at 100 tiers (13 times the
  defense health and damage). Rewards are flat past tier 60.
- Change: `trials.json` `powerGrowthPerTier` down (the reports suggest 0.02 to 0.03; measure both with
  `scripts/pacing/trialcap.mjs`), a reward that keeps growing a little past tier 60, the two modifiers no longer
  stacking on one tier (P1-07 gives them offsets), `taskMaxGrowth` re-derived from the new growth. Set
  `trial_walker`'s last step to the highest tier the bot plan clears with two stars in at least half of the eight
  seed and alternate combinations, minus five. Replace the "no top" line with a true one.
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
  modifiers unless the data says so on purpose.
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

`exploits.md` reproduced each of these against today's simulator; the scripts are in `scripts/exploits/`. Three are
critical: on a server-held village they mint resources and Jade at the battle-command rate, with no army. For each
one, turn the reproduction into a failing test, fix the cause inside the shared simulator (protected item 53: one
`applyCommand`, never a client-only check), and add a server test that the replay refuses the same input. None
changes a battle rule, so none needs a rules bump.

**P1-11 (XPL-01, critical) Battle commands trust the client's setup.**
- Why: `trialEnd`, `bountyEnd` and `rematchEnd` rebuild the base and keep every other field the client sent.
  `checkBattleSetup` checks the army, levels, reinforcements and mastery only. `startDamage` (every building id
  with a huge number) gives three stars at tick 0 with an empty army; a Keep 1 village cleared Trial tiers 1 to 40
  in 40 commands, and the server's own `replayVillage` applied them. `hero` accepts any hero at any level;
  `infiltration` left out restores free placement.
- Change: `checkBattleSetup` returns a sanitized setup built from a whitelist (`seed`, `army`, `levels`,
  `reinforcements`, `mastery`), forces `infiltration: true`, sets `hero` from `heroFor(state, data)` (never above
  it, with the one Keep of slack the raid path allows) and drops `startDamage` (only the server's Gang War path
  builds it). Use it in `trialEnd`, `bountyEnd`, `rematchEnd`, `groveBattleEnd`, `abandonBattle` and the ticketless
  `battleEnd`. Require that warriors fought for a Trial clear, a Bounty step and a rematch win.
- Tests beside `tests/gameplay/sim/trials.test.ts`, and one through `replayVillage`.

**P1-12 (XPL-02, critical) A battle record's time is client-supplied and bounded only above.**
- Why: `bountyEnd` uses `min(now, record.at)`, so any past Bounty Hunt can be attacked at any time, and alternating
  two old occurrences pays the whole ladder every time: 20 commands paid 700 Jade. The same shape is in
  `rematchEnd` (the 72-hour window never closes) and `groveBattleEnd`.
- Change: a lower bound on `at` (the battle's length plus a resume window, from data), and refuse an occurrence
  that started before the one already stored in `state.goalEvent`. No save change.

**P1-13 (XPL-03, critical) The server import takes liabilities it never looks at, and two loops the attacker
sizes.**
- Why: a forged save with 500 Jade on hand passed the import checks and two ordinary commands left 280,500 Jade:
  a stipend with a forged balance, and a timer with a forged top-up share that `cancel` refunds. A `season` set
  3,000 months back paid 3,000 league chests; 3,000,000 forged seasons made one command run 9.1 seconds inside the
  row lock. The offline war's `settledWeek` loop has the same shape. For honest players the same loop pays a league
  chest for every month away, played or not.
- Change: cap the season catch-up with a data value (as the war already has `settleWeeksMax`); bound `season` and
  `settledWeek` in `validateVillage`; in the import, zero the stipend unless a credited stipend purchase covers it,
  strip `topUp` and `armyPaid` from timers and the army, and clamp a timer's `cost` to the catalog.
- Tests: the forged file from `repro2.xpl.ts`; a command on a village 10,000 seasons behind returns in
  milliseconds and pays at most the cap.

**P1-14 (XPL-04) A refund debt is wiped by top-up, train, cancel.** `shortfallQuote` computes the shortfall from a
negative balance, so a top-up buys the debt too, and `cancelTraining` returns all the Jade. A top-up never covers a
debt: compute the shortfall from `max(0, balance)`, so the action stays refused until income repays the debt. This
protects item 7.

**P1-15 (XPL-05) A hero-only battle is a free way out of a started raid.** An unmodified player can do it from
Keep 7: a raid with only the hero deployed counts as practice, so honor and shield stay, the scout is cleared and
the next look skips the Next fee; a hero-only abandon keeps the same opponent and seed (watch the traps, then
attack for real); online a hero-only report burns the ticket with no forfeit. A started raid in which the hero
went in and no warrior did is a lost attack, in `battleEnd`, `abandonBattle` and the server's `attack()`
(`forfeitTicket`). A battle with nobody deployed stays rejected as today.

**P1-16 (XPL-06) The client picks tomorrow's daily chest.** `openDailyChest` mixes the client's `entropy` into the
next salt and the server replays the value sent; a search found a salt that makes the next chest the best one in
57 tries. For a server-held village the server draws the entropy and returns it in the command's outcome (an
additive protocol field, `docs/PROTOCOL.md`, a contract test) and the game applies that value. This closes the
backend ask of 2026-11-13.

**P1-17 (XPL-08) `Math.pow` and `Math.log2` still feed Trial fortresses and Trial rewards.** The battle rules
allow only + − × ÷ and √. `sim/trials.ts` raises the growth with `Math.pow` (it differs from repeated
multiplication for 318 of 401 exponents, and engines need not agree to the last bit) and floors a `log2` product
that lands exactly on an integer at tiers 2, 4, 16, 32 and 64. Use repeated multiplication (as `temper.ts` does
with `raise()`) and an integer-safe floor (a table, or a small epsilon), and pin the rewards at those tiers. Do it
together with P1-06, which changes the same lines.

**P1-18 (XPL-09) A top-up with `pay: 'dew'` is a free-standing Jade to Coins exchange.** `topUpTarget` prices the
action in Coins and the action then pays Provisions, so the bought Coins stay in storage. Pass `action.pay` to the
quote. This protects item 22.

**P1-19 (XPL-10) Twelve hours of backdating is a daily free skip.** After 12 quiet hours a modified client dates
`upgrade`, `research` and `train` 12 hours back (about 650 Jade of skips a day with five artisans). The window
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
only booleans and keep the one-way rule. `donate` accepts a fractional count; `groveBattleEnd` trusts the client's
base and never checks its target; `bountyEnd` lets the client pick the easier fortress.

**P1-22 (BNL-07) Shared replays accept an unchecked `setup.mastery` although mastery is not live.**
`server/core/sharedReplays.ts` copies it from the request and the live engine multiplies health and damage by it.
Drop it unless the feature is on; when on, keep only known warrior ids with values between 0 and the cap. Validate
`setup.hero` the same way.

The report's "checked and found sound" list is at its end. Do not re-hunt those.

Close the phase: `npm run balance:campaign`, `npm run test:slow`, section 13 for the phase's text, the full checks,
the closure record.

## 7. Phase 2: make defense a real decision

No battle result changes in this phase. Everything is in `raids.json`, `ranks.json`, `economy.json` and hooks that
already exist behind data values live data does not set. Read `defense-raids.md` in full first; its section 1
corrects a belief three audits repeated.

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
    storage-capped and report what did not fit; do not use the `uncapped` hook.
  - Fix the bug the hook carries: `raidVillage` computes `v = v0 * carry` and the storage branch does not round, so
    resources become fractional. Floor it, and add a test that no resource is ever fractional after a raid.
  - Add `carryByStars` and `defenseWin.perStar` to `RaidsDef` in `src/gameplay/sim/types.ts` (and `raiderMatch` in
    P2-02), and remove the `as` casts in `defense.ts` and `matchmaking.ts` that read them.
- Measure with `def_econ.ts` and `def_daily.ts` at Keeps 5, 9, 12 and 15, at least 24 raids a cell, for the four
  build qualities (level 1 without walls, caps − 2, caps − 1, caps). **Read this before you trust them:** both
  harnesses compute their "proposed" columns by their own arithmetic on today's `raidVillage` result; they do not
  read the live keys. Record their proposed columns before you touch `raids.json`. Once the keys are live, the
  "today" column is the new rule and the "proposed" column applies the carry twice: read "today", or give the
  harness a flag that reads losses and rewards from the record (`result.loot`, `banked`). Their proposed reward is
  also never storage-capped.
- Done when all hold, judged on the storage-capped reward the game really pays:
  1. Net result per raid improves at every step of build quality at every measured Keep.
  2. For a one-visit player, loss per day never rises with build quality (today a maxed Keep 15 base loses 29% more
     per day than a caps − 2 base).
  3. A base at caps is about neutral against the typical raider (within ±10% of one full hold's reward). With the
     starting values the uncapped harness gave +38%, +28%, +15% and +5% of a hold's reward at Keeps 5, 9, 12 and 15.
  4. The undefended village loses what it loses today, within noise: losses still hurt.
  5. A maxed base's rewards per day stay under 20% of the regular player's daily raid loot at that Keep, so defense
     is not a farm (the uncapped harness gave about 25% at Keep 15 with four visits a day).
  6. Nobody is worse off than today in any cell.
  If 3 or 5 still miss on the capped reward, lower `shareOfRaidLoot` and record the value. Do not widen the bands.
- Scope: bot raids on device villages and the server's simulated raids (P2-12). For raids by real players keep
  conservation: the defender loses what the attacker carries. Add only the per-star reward there
  (`server/core/pvp.ts` pays honor only today).
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
- Change: add `{ id: 'regular_fortress', opts: { raidsPerSession: 2, policy: 'fortress', fortressGap: 2 } }` to
  `CAMPAIGNS` (the `fortress` policy exists in `tools/balance/playerModel.ts`; its default gap is 1, the strictest).
  Give that campaign's village a real layout through a data clone with `raids.labAutoLayout` and `labWalls`, passed
  by the campaign tool to the new campaign only. Live data never sets those flags: add a test that
  `defaultData.raids` has neither.
- Replace the `KNOWN FAILING (PS-1, open)` assertion in `campaign-gates.test.ts` with gates that say what defense is
  for. Three hypotheses to start from: the fortress holds at least 40% of raids at Keeps 9 to 15; its
  stolen-to-looted ratio is at most 0.6 times the rusher's; it reaches Keep 12 within 1.25 times the rusher's days.
  Know where they come from: the only campaign evidence is the lab's run with hired artisans, a garrison crew of 2,
  the lab's carry values and uncapped rewards, and even that run met only some of them (stolen share 0.76 times the
  rusher's for the gap-3 fortress; Keep 12 at 1.21 and 1.30 times for gaps 3 and 1). Set each gate from your first
  full run with at least two days or five points of margin, say so in the record, and expect the pace gate to hold
  only after P2-14.
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
  record.

**P2-09 (DEF-10, ECO-08, RET-14) The league win bonus fades from 30% of a raid at Keep 5 to 1.4% at Keep 15.**
- Change: a new key per league, for example `winBonusShare`: a share of the Keep's lowest generated raid loot
  (`battle.generatedLootByHall[keep − 1].min`), for three stars, scaled by stars ÷ 3. Starting values 2% in Cedar
  rising to 15% in Kage. This is the pattern `defenseWin`, `rematch` and `trialReward` already use; it is not
  `rewardScaleByHall`. Do not change the meaning of the existing `winBonus`, and do not tie the bonus to the raid's
  own loot. `leagueWinBonus` needs the Keep: update its callers and `matchmaking.test.ts`.
- Leave the season reset as it is.
- Done when: the bonus is between 5% and 20% of an average raid's banked loot at every Keep from 5 to 15 at the
  model's league. Show it on the Honor panel (an existing number, no new sentence if possible).

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
  authorises restating that test against the Keep the fee is priced by, and adds the `next_offers.ts` measure as a
  second check: the fee is 1.5 to 2.5% of the mean offer at Keeps 5, 9, 12 and 15.

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
- Change: add the key to `economy.json` with its type, and unit tests for the hook: absent or 0 plays exactly as
  today; with it, a defense upgrade starts with every artisan busy; a `support` building follows the decision; a
  top-up for a crew build is offered; the offer trigger does not fire for a crew build. It is free and never sold:
  no product, no offer, no Jade price. The second queue in the builder panel is P6-12.
- Done when: with the crew on, `regular_fortress` reaches Keep 12 within 1.25 times the rusher's days (the lab's
  crew-2 runs gave 1.21 and 1.30 times; without the crew the fortress is much slower). Record the ratio with and
  without the crew. The regular player's Keep 15 day stays inside its gate.
- Touches: the server replays `place` and `upgrade`. Strings: about 3, in Phase 6.

**P2-15 (UIS-07) The diversity carry cuts the tutorial raid.**
- Why: at Dojo level 1 only Shinobi can be trained, so the first result screen a player ever sees says "Your squad
  carried 85% of the loot". The rule is meant to reward a choice the player does not have yet.
- Change: the carry is full while the village can train fewer than two roles (a data value in `raids.diversity`).
  Give `raidCarry` and `diversityShare` in `sim/carry.ts` the village (or the count of trainable roles), and use the
  one function in `battleEnd`, `settleOnlineAttack` and the result screen: today `battleHud.ts` recomputes the share
  from the army, so it would still print 85% after the fix; it should read the record's `carry`. Update
  `round2-rules.test.ts`, whose new village expects the cut. Show the share before the raid, not only after it
  (P6-13).
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
- Follow-ons the keys force: `economy.json` `collectBubbleMinFraction` 0.02 → 0.007 (keeps the first collect bubble
  near ten minutes); the two building descriptions that say "Holds 8 hours of output" (data text, so
  `i18n:extract` and 49 translations of two strings; better, make the sentence read the number); the test that pins
  shield hours (`tests/gameplay/sim/raids.test.ts`).
- Do not lower the Keep 6 cost. `tests/gameplay/balance/curves.test.ts` requires the early cost multiplier never to
  shrink, and it only moves the wall to Keep 6 to 7.
- Measured result to reproduce (single seed, ±2 days): casual Keep 5 to 6 in 13 days (was 26), casual Keep 15 on day
  207 (was 246); regular Keep 15 unchanged at day 113, largest speed-up 11% at Keep 8.
- Done when: the casual stretch from Keep 5 to 6 is 10 to 16 days, no casual stretch through Keep 10 exceeds 21
  days, and the regular player's Keep 15 stays inside 100 to 140 days **with Phase 2 already applied** (the two
  phases move the same quantities; measure them together).

**P3-02 (PAC-02, PAC-08) Gate the casual pace, and model the player the game actually allows.**
- Add to `campaign-gates.test.ts`: casual reaches Keep 6 by day 25, and no casual stretch between Keeps is longer
  than 21 days through Keep 10.
- Add campaign policies (do not alter existing ones): one that hires the third artisan with the starting Jade
  (`hireBuilders`), one that queues the second army (`economy.json` `queuedArmies` allows it; the model's `train()`
  stops at camp capacity). Report them in `CAMPAIGN.md`. They describe a believable player; the gated baseline stays
  the conservative one.

**P3-03 (PAC-03, ECO-12) Three quarters of all builder time is Mints, Farms and storages at a flat seven days a
level.**
- Why: 1,294 of 1,771 builder-days. Every level from 15 up is seven days, and only collectors and storages have many
  such levels. A collector also produces nothing while it upgrades, so a Mint's level 15 forfeits 1.59 M Coins on
  top of its price.
- Change: cap `buildSeconds` of the four economy buildings (Coin Mint, Terraced Farm, Treasury, Storehouse) at three
  or four days from the level where they reach it. Let a collector keep producing at its old level while it
  upgrades (`sim/village.ts`, where `accrueFrom` is set to the upgrade's end), or failing that print the lost output
  in the upgrade quote.
- `tests/gameplay/sim/data.test.ts` exempts a level from its "about 2.2 times longer each level" check only when it
  is exactly seven days; with a lower cap every capped level after the first fails it. This item authorises changing
  that exemption to "a level at its building's cap", with the cap as a named data value, in the same commit.
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
     result another way: shorter `trainSeconds` for the tier-1 warriors (also outside the combat fingerprint; check
     `progression-model.test.ts` first, which pins training times to the model), or a Dojo table that never falls
     with level and a panel sentence that divides by the level-1 speed. If the level 1 or 2 speed changes, that test
     and that sentence change in the same commit, and the string is counted.
- Done when: `scripts/pacing/firsthour.mjs` shows at least seven raids in the first hour with Keep 3 still between
  40 and 80 minutes (`progression.test.ts` holds that window; the report's own variant gave seven raids and Keep 3
  at minute 44, four minutes above the floor); and a scripted run of the tutorial at 360×640, training the army the
  tutorial suggests, reaches the first battle in under four minutes with no Jade spent and no tap answered "Nothing
  to collect yet". The model harness cannot show the tutorial's time: it plays sessions two minutes apart.

**P3-05 (PAC-13) Keep 3 opens with a lost raid.**
- Why: after four three-star raids at Keep 2, the regular model's first Keep 3 raid is zero stars; the casual model
  wins none of its two Keep 3 raids.
- Raising `ranks.json` `powerSlackByKeep` for Keep 3 does nothing for the regular player: its strength minus the
  slack is already below the hard floor of the opponent window (`matchmaking.ts`, the clamp to own Keep minus the
  halls below), so it already meets the weakest base the window allows. Measured at 1.25 and at 2.0: no change.
  Slack helps only the casual model, whose strength (2.91) sits above the floor.
- Change: re-measure after P3-04 first (its faster armies alone gave 1, 1, 2, 2 stars on the first Keep 3 raids).
  If the first raid after a Keep upgrade is still a loss, use a lever that acts below the window: a softer generated
  base for the first two raids after a Keep upgrade (a `levelBias` cut, or one more Keep below, from data in
  `ranks.json`), in a shared helper, with the same note about the server's fallback as P2-10.
- Done when, by model: the regular Keep 3 average is 1.2 stars or more and its first Keep 3 raid wins a star; the
  casual Keep 3 average is at least 1; the three-star farming gate still holds.

**P3-06 (PAC-09, playthrough opportunity 4) A late starter clears dozens of trivial Trial tiers at a loss.**
- Why: a tier pays by its own Keep. A Keep 10 player starting the ladder has 36 easy tiers, each costing a full army
  for 0.5 to 60 k. In play, a Keep 5 village's first tier paid 500 of each resource against 200,000 in storage.
- The mechanism has to be stated, because `trialEnd` refuses any tier above the next uncleared one: a player may
  attempt the first tier of the Keep that is `catchUpKeepsBelow` (a new key in `trials.json`, starting value 2)
  below their own, even when lower tiers are uncleared. Clearing it sets the best tier to it and pays every skipped
  tier's reward once. Change the lock in `trialEnd` and the helpers and panel that assume the next tier is the best
  plus one (`nextTrialTier`, the variant and alternate helpers, the Trials panel). "Tier 2 is locked until tier 1
  is cleared" stays true for a Keep 1 village, and "paid once per tier" stays true for everyone.
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
- Done when: a returning player with no warriors always has one action that pays within two minutes, and the drill
  cannot be claimed without a battle the server re-ran.
- Touches: save (a stat), commands, server, UI. Strings: about 4.

**P3-08 (ECO-04, CU-5) Top-ups and army finishing are 37 times dearer at Keep 15 than at Keep 1, and offers scaled
by the same table are hollow.**
- Why: one hour of income costs 15 Jade at Keep 1 and 550 at Keep 15; finishing a Keep 15 army costs 461 Jade for
  one extra raid; the Keep Celebration's supplies are 0.34 hours of production at Keep 15.
- Change: regenerate `topUpScaleByHall` (in `src/gameplay/data/store.json`) with `tools/balance/topup.mjs` at
  exponent 0.75 instead of 0.5. **The tool as written cannot do this correctly**: at 0.75 it prices a raid's loot at
  830 Jade at Keep 14 and 790 at Keep 15, and `tests/gameplay/economy/topup.test.ts` requires that price never to
  fall with the Keep. Add a second rule to the tool beside its "a rush must cost more" rule: lower a Keep's scale
  until its raid price is at least the previous Keep's. The tool also overwrites `trainingSkipScaleByHall` with the
  top-up scale on every run: give that table its own formula (the one in `scripts/economy/econ3.cjs`: raid price ÷
  (4.5 × the two-hour training skip), at least 1, kept at 1 through Keep 5 and never falling with the Keep).
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
- Change: `nextObjective` returns an affordable Keep or storage upgrade before the chest when a storage is at 90%
  or more; the scout screen says when the loot on offer will not fit; the tutorial's last line points at the Keep
  first and the chest second. Consider raising Keep 1 and 2 storage in data so three first raids fit (`storage` is
  outside the combat fingerprint; the campaign must be re-run).
- Done when: a scripted first session of three raids loses nothing to overflow when the player follows the chip.
- Strings: 1.

**P3-12 (PLY-11) The tutorial's forced first raid silently ends the 24-hour new-player shield.**
- Change: a village's first attack does not end its new-player shield. Define the exemption on state the simulator
  has (no earlier attack record), from a data value in `raids.json`: the server cannot see tutorial progress, which
  is device-only. `battleEnd` is not a player command; the server applies it as its own result and also ends the
  attacker's shield in its own code on the player row (`server/core/pvp.ts`). Put the rule in one shared helper and
  use it in both branches of `battleEnd` and in that server path, with a server test, so the rule exists once.
  From then on the scout screen shows one line while a shield is running: attacking ends it, with the time left.
- Strings: 1.

Left open on purpose, record them as such: the currency load imbalance late (ECO-11: no late Coin sink, research is
100% Provisions; P2-13 is the only lever tried), the hollow second and third research lanes (PAC-12), and Keep 11
adding no army housing (PAC-06). All are real, none has a measured fix, and a guess here would move every Keep.

Close the phase: campaign, slow tests, section 13, full checks, the closure record.

## 9. Phase 4: battle strategy, under one rules bump

Read `combat.md` and `built-not-live.md` first, then section 3.1 again. Everything in this phase is developed and
measured before the bump, then lands together.

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
model rather than hand-editing `troops.json`). The six original warriors keep their stats through level 5, as
`src/gameplay/CLAUDE.md` requires.

**P4-01 (CMB-01) Support warriors never attack, so all five support kits are worth less than nothing.**
- Why: reproduced. A support warrior that has reached its ally returns before the attack code and never strikes
  while any non-support ally lives (`sim/battle/warriors.ts`, the branch in `beforeWarriorAction` that returns
  early). With 20% of an army's housing in one support type, removing its kit raises destruction by 10 to 17 points
  at Keep 15 and 6 to 10 at Keep 8.
- Change: when a support warrior is in position, let it strike the nearest non-wall building within its own range
  at a data-set share of its damage: `battle.json` `warriorRules.supportStrike`, starting value 0.5.
- Measured on a scratch copy at 0.5: the support family reaches 38.3 / 34.7 / 44.3 at Keeps 7 / 8 / 15 (from 27.2 /
  22.0 / 37.8). At 1.0 it overshoots badly (Keep 10 support from 49.5 to 91.2). Do not ship 1.0.
- Done when: `support@7` and `support@8` leave `KNOWN_BELOW`; every army-lab upper gate still holds, including the
  light-support mixes at Keeps 6 and 10 (they sat at 86 to 92 before the change: watch them); and with
  `scripts/combat/t7.ts` no support warrior is worth more with its kit removed, at Keeps 8 and 15.

**P4-02 (CMB-05) The Shadow Captain's Rally changes nothing, and its text contradicts the code.**
- Why: measured over 20 battles a cell: live against Rally strength 0 is −0.7 / −1.0 / +4.1 at Keeps 7 / 10 / 15.
  Only 20 to 27% of living warriors stand inside the 4-tile aura. The description says "once per battle"; the code
  re-arms it on every new target. The mismatch is an open design question in `docs/game-theory/REQUESTS.md`; the
  owner's request to fix strategy problems settles it.
- Two candidates, both measured:
  - A: a whole-squad radius at 30%, re-arming as today: 80.5 / 85.3 / 81.5 (no hero: 70.4 / 81.0 / 74.0).
  - B: `kit.oncePerBattle` with a 15-second, 50% burst across the field: 82.8 / 85.0 / 77.8.
- Prefer B: it matches what the text has promised in 50 languages, and it makes when the hero goes in a decision.
  Ship B if, over 20 battles a cell at Keeps 7, 10 and 15, Rally against strength 0 is worth at least 4 points and
  sending the hero with the main squad beats sending him first by at least 4. If B fails the second test and A
  passes the first, ship A and change the text to describe the re-arm.
- Either way the description's numbers change: update `battle.json`, `roster.json` and close the REQUESTS entry.
  Strings: 2 changed.
- This decision sets the baseline every planned hero is measured against (P4-10). Make it first. If the bump is
  not made at all, still rewrite the two English strings so they describe what the code does.

**P4-03 (CMB-07) The Smoke Bomb, the signature tactic, is worth two to four points for all three charges.**
- Change: `battle.json` `abilities.smoke_bomb.radius` 3 → 4. Measured with a scripted policy: +6.2 at Keep 10 and
  +7.8 at Keep 15. The description names the 8 seconds and not the radius, so no text changes. (Twelve seconds
  measures better still but would change the text in 50 languages for 1 to 3 points; leave it.)
- Done when: `scripts/combat/t3.ts` shows +5 to +12 at Keeps 10 and 15, and `tests/gameplay/battle/tactics.test.ts`
  passes with its limits intact (no stacking, the 2-tile floor).

**P4-04 (CMB-06) The siege family is too slow to matter.**
- Why: `siege@8` is 25.5% against a 30% floor. On a scratch copy, raising all four wall and breach warriors from
  0.12 to 0.17 speed lifts Keep 8 to 47.3 but takes Keep 4 to 90.3 with 67% three stars.
- Change: Fire Monk, Bomb Carrier and Volcano Cannoneer to 0.17; tune Ram Crew separately (0.15, or a per-level
  answer) so Keep 8 clears 30% without Keep 4 passing the three-star gate. Run the Keep 4 and Keep 6 home-ground
  gates on all six layouts; the investigator did not.
- Done when: `siege@8` leaves `KNOWN_BELOW` and no gate at Keeps 4 and 6 fails.

**P4-05 (CMB-04) Newer tiers are worse than older ones, a dozen kits measure zero, and five warriors have an
ability name with no ability behind it.**
- Why (`scripts/combat/t7.ts`, Keep 15, 20% of an army): Thousand Needle (tier 5) scores 73.4, below every older
  thrower (77.1 to 88.0), and has no kit behind "Needle Rain". Volcano Cannoneer (tier 5 siege) 64.5 is below Ram
  Crew (tier 1) 68.7. Sage of Clouds (tier 5) is below Herbalist. Shuriken Storm's Fan Throw is exactly 0.0 at both
  Keeps because its radius is measured from the target's centre. Wall Climber, Grapple Raider, Crane Glider,
  Thousand Needle and Siege Bombardier show an ability name and have no `kit`.
- Change, in this order of certainty:
  1. Shuriken Storm `kit.radius` 1.5 → 2.5 (measured +2 to +2.5 for ranged armies at Keep 8).
  2. Thousand Needle: lift its 0.6 `dpsScale` toward 0.8, or give it the kit its card names. Measure both.
  3. Tier-5 siege and mystic: a second effect or the stats that put each above the tier below in its slot. P4-01
     may already fix the mystic; measure before adding anything.
  4. For each of the five warriors with no kit: either build the ability the card names, cheaply and through the
     existing data-driven kit code, or change the card to say what the warrior is. An ability name with nothing
     behind it is not allowed to remain.
- Add two lab gates in `army-lab.test.ts`, with today's failures listed the `KNOWN_BELOW` way so the list can only
  shrink: every kit is worth at least +2 points at its unlock Keep or at Keep 15; and at Keep 15 no warrior scores
  below the previous tier in its own role and slot.
- Strings: only for cards that change. Each is a data string in 49 languages; choose "build the ability" where it
  is cheap.

**P4-06 (CMB-03) Two single-warrior armies three-star most Keep 15 bases, and one fixed mix is never wrong.**
- Why: 180 Eclipse Ninjas score 90 to 95 on three of four temper profiles, 90 Dragon Kite Crews 89 to 96 on three
  of four. The answering temper works (Blast takes Eclipse to 56, Watch takes kites to 41) and scouting shows the
  profile, so the farm is "bring one warrior, press Next past the one profile that answers it". At Keep 12 one
  searched mix is best against every profile.
- Change:
  - `battle.json` `temper.offers.counterShare` 0.5 → about 0.75, so pressing past the answering profile stops being
    cheap. Measure the Next spread again (`next_offers.ts`): Next must stay a fair choice.
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
- This changes which base a seed generates, so it must ride the rules bump: a ticket issued before the change is
  rebuilt by the archived engine only because the rules number differs.
- Done when: over 20 battles a layout at Keeps 8, 12 and 15 with the raid bots' mix, the gap is 15 points or less,
  and the matched-raid and campaign gates pass.

**P4-08 (CMB-12) Gates rest on six-battle cells that swing 10 to 15 points.** Raise the gate cells to four seeds
where the time budget allows, or gate on the mean of two adjacent Keeps. Do this before re-pinning anything, so the
new pins are steadier than the old.

**P4-09 (PAC-07) Players who field their newest warriors lose most raids from Keep 8.** The casual explorer wins 18
to 40% at Keeps 8 to 14 and is gated only at 0.1 stars. After P4-01, P4-04 and P4-05, re-run the campaign and raise
that gate to what the run gives, with 0.9 stars as the target. If it is still under 0.9, record the number and the
warriors responsible; do not paper over it with matchmaking.

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
2. **Make the preview decide things (BNL-12).** In `tools/balance/preview.ts`: six layouts × five seeds, a paired
   standard error, events counted for the building under test only, heroes sent first and sent last. Regenerate
   `PREVIEW_BALANCE.md`.
3. **Write the go-live gate as a slow test** under `tests/gameplay/planned/`: a counter may be marked live only if
   its effect is −3 points or better against the armies it is meant to beat at two of three Keeps on 30 bases; a
   hero only if its own family beats the Captain by 5 or more at its three Keeps and the raid mix stays within 3.
   The gate lists today's failures the `KNOWN_BELOW` way.
4. **Fix what is wrong whether or not anything ships**: the Hall cap trap (BNL-11: one rule for both paths); the
   English that does not match the code (BNL-13; these are data strings in 50 languages, so fix them once, now);
   the Lightning Rod's event flood (at most one `absorbed` event per rod per second; events never enter the result
   hash).
5. **Retune toward the gate** in `planned.json` and the catalog: the three hero kits (the report gives starting
   values), the five working counters re-priced so a first wave adds no more than about a quarter to the live
   defense budget, first levels capped at one day of building.
6. **Only if an item passes the gate and time remains, make it live under this bump**, heroes before counters,
   because Keeps 9, 11 and 13 are exactly where the late game has nothing new. Going live means all of: the
   definition moved into the live data files and `live` set in the catalog ("Making one live" in
   `src/gameplay/CLAUDE.md`); the server side (BNL-06: `checkArmy` reading the hero from the server-held village,
   `chooseHero` in `PLAYER_COMMANDS`, a hello feature, `docs/PROTOCOL.md`, contract tests); battle callouts for
   every new event kind (BNL-09); a painter for any new building (the generic one is not shippable); and every
   balance artefact re-run. A lower-risk first step for counters is to let the five that work appear only in Trial
   and Bounty fortresses (a separate list read by `trialBase` and `bountyBase`), so players meet new puzzles before
   anyone can build them.

P4-02's Rally decision sets the baseline every other hero is measured against. Make it before step 5.

**P4-11 (stretch, CMB-10) Which approaches are closed is a hash of the layout, not the defender's choice.** Making
the closed pair an explicit base setting (`BaseLayout.closed`, absent means today's hash so old records replay), a
village command to set it, the scout report showing it and a base-editor control is the one change that would make
base design a decision against the largest lever in a raid. It touches the rules, the save, the commands, the
protocol, the server, the interface and the catalog. Do it only if every other item in this phase is done and
measured; otherwise write the design in `docs/game-theory/REQUESTS.md` and leave it.

Then perform the bump exactly as section 3.1 lists, regenerate `ARMY_BALANCE.md`, the campaign, the roster
documents and the status file, run section 13 for the phase's text, and write the closure record with the before
and after of every gate cell that moved.

## 10. Phase 5: reasons to come back that have not been seen before

Read `retention.md`. The return-hook layer is honest and well built, and it is thin: a regular player has seen
every event kind and every task template by day 14, and from day 28 the calendar, the Scroll and the events repeat
identically. A Keep 15 player (day 113) has three counter achievements and the monthly league climb left.

Every item here reuses a system that exists. Every item is a pure function of a schedule, a seed or the player's
own play: nothing random is sold, nothing is taken for a missed day, every countdown is real. Each new hook gets
its line in `docs/DECISIONS.md` (1.2).

Most of the data lives in files the campaign plays (`pass`, `daily`, `events`, `trials`, `ranks`). Batch the data
changes and run the campaign once at the end of the phase.

**P5-01 (RET-01) Events: four kinds on a 14-day loop, nothing dated, an event running 68% of all hours.**
- Change, data: make `events.json` a 28-day loop of nine or ten named windows built from the three existing effects
  (collect bonus, raid loot bonus, training discount) at different sizes and lengths, with quiet days between them,
  plus a second goal entry.
- Change, code: optional `events.dated[]` (month and day of start, `durationHours`, an effect or a goal), merged in
  `sim/events.ts` `eventsBetween` with the occurrence key `id#year`; `EventsDef` in `types.ts`; the validator in
  `src/backend/net/eventSchedule.ts` (the server may retime built-in ids only, and that stays true); a note in
  `docs/PROTOCOL.md`. Five festivals a year is enough: new year, spring blossom, midsummer lanterns, harvest moon,
  winter. Each is a goal event or a boosted effect whose top ladder step gives that festival's look (two colours
  and a name; `GoalLadderStep.reward` gains a look).
- Keep (protected item 31): start and end come only from the schedule. Reword the panel line that says "repeats
  every two weeks".
- Check the festival names and dates with care: they must be culturally neutral or clearly Japanese-inspired in the
  game's own fiction, never a real religious observance. Add them to the list for the owner's cultural review.
- Done when: over the next 365 days a player meets at least twelve distinct event names, no two consecutive weeks
  are identical, and at most half of all hours have an event running.
- Strings: a name and a line per window and festival, about 30. This is the largest text cost in the pass; write
  them once, well.

**P5-02 (retention opportunity 1) The weekly Gauntlet: one shared challenge fortress.**
- A second goal-event kind whose fortress is seeded from the occurrence key and the Keep only, never the village,
  so every player at the same Keep attacks the same base that week. It carries Trial-style modifiers (`power`,
  `wallPower`) and a rival clan's tempers, and pays a star ladder once per week. It reuses `bountyEnd`, the ladder
  code and the Events panel as they are.
- Honesty (3.6): it is labelled a generated fortress, and "everyone at your Keep fights this base this week" must be
  literally true. Add a test that two villages with different seeds at one Keep get the identical base for one
  occurrence, and different bases for the next.
- A best-destruction board between friends and Gang mates needs server work; write it in
  `docs/backend/REQUESTS.md` and do not build it in this pass unless Phase 2's server item is already done.
- Strings: about 4.

**P5-03 (RET-11) Raids have no rotating context: the daily contract.**
- One contract a day, the same for everyone, a pure function of the day from `events.json` `contracts[]`. It
  changes only what a won raid carries home, in `bankRaidLoot`, never the battle. Starting set: more loot from one
  rival clan's outposts; declared stakes pay more today; the diversity share counts double; three-star raids carry
  a little more; a first raid of the day with a role the player has not used this week carries more.
- Bound it: with the contract, an event bonus, a stake and the diversity carry all at their best, a raid carries at
  most 2.2 times its plain loot. Add that as a test over the data.
- The server settles online raids with the same simulator code, so the contract must be computed from the raid's
  own time on both sides. Add the REQUESTS entry.
- Done when: the regular campaign's Keep 15 day moves by less than 3% with contracts on (the model takes each day's
  contract only when its normal raid already satisfies it).
- Strings: a short line per contract, 5 to 7.

**P5-04 (RET-05, second half) Tasks: 15 templates over 9 counters.**
- Add about eight templates. On stats that exist: a Trial tier (daily, one), a donation, a rematch won. On new
  stats counted in `afterCommand` and `bountyEnd` (part of the one save bump): three-star raids, stakes won, Bounty
  or Gauntlet steps, the daily drill (P3-07), and, once Phase 2 is in, stars denied on defense. Each gets its
  `taskEligible` case, so a task the village cannot finish is never offered (protected item 29).
- Done when (`scripts/retention/r1.mjs`): the same three daily tasks as the day before on under 1% of days, at least
  two of three repeating on under 15% of days (28% today), and no template is completable by a single collect.
- Strings: one per template, about 8.

**P5-05 (RET-08) Achievements: nine counters, three reachable goals after Keep 15.**
- Add ten to twelve. Data only: donations, rematches won, warriors trained, total destruction. With a small
  extension of `achievementValue`: calendar days claimed, warriors unlocked, looks owned, tower types tempered. On
  the new stats of P5-04: three-star raids, stakes won, Gauntlet ladders completed. After Phase 2 and only if the
  fortress campaign of P2-04 holds at least 40%: raids held.
- Every tier must be reachable (the test from P1-06). Every new tier needs its entry in
  `src/backend/platform/achievementIds.json` (`tests/backend/growth-client.test.ts` checks the map).
- Keep the added Jade under about 600 in total and record the new one-time and monthly free-Jade totals (3.7).
- Strings: a name and a line each, about 24.

**P5-06 (RET-09, RET-13) A collection layer: earnable looks.**
- A dozen two-colour looks that are granted and never sold: the first season finished in Obsidian, Storm and Kage
  (in `rollSeasons`); Trial tiers 20, 40 and 60 (in `trialEnd`); calendar cycles 2 to 6 (`calendar.skins[]`, so each
  cycle's day 28 gives the next look instead of 40 Jade); lifetime chest milestones at 30, 100, 200 and 365 chests
  opened, which a missed day cannot touch (a new stat, paid in `openDailyChest`).
- A "looks collected: N of M" count where looks are shown.
- Strings: a name per look, about 14.

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
- The save field exists since v23 and the Codex panel's strings are translated; count any new ones.
- Record as open, with what it needs: the stat bonus (a retuned curve, a cap near +15%, a place in
  `attackerStrength` or a limit to generated bases and Trials, a mastered campaign policy with a gate, the server
  truth of BNL-06, the curve moved inside `GameData` so it is versioned, and a rules bump because archived engines
  ignore the field).
- Done when: fifty warriors each have a rank that a month of play moves visibly and a year does not exhaust, and a
  test shows no `BattleSetup` built by the game carries a mastery bonus.

**P5-08 (PAC-11) Keep seals.** When every building a Keep allows is at that Keep's cap, pay a fixed Keep-scaled
reward once and mark the Keep with a seal on the Keep sheet and the profile. Fifteen medium-horizon goals from data
that already exists (`hall.json` limits), and a pull against hollow Keep rushing that forces nothing. A claim
command the server replays, one stored field. Strings: about 3.

**P5-09 (RET-12) Two daily clocks.** The chest, the streak's skip week and the stipend roll at UTC midnight (dinner
time in the Americas); tasks and the calendar roll at the player's midnight. Move the first three to
`localDayIndex`. The migration must not allow a second chest on the day of the switch, and
`LOCAL_TIME_CHANGE_DAYS` already limits clock moves. Update the refusal text that says "(UTC)" and the reminder.

**P5-10 (retention opportunity 8) Season identity and a recap.** Name each Scroll and league season from a data
list of twelve. At the rollover show one card: best league, raids won, stars, tiers claimed (P1-01's
`pass.lastSeason` already carries what was auto-claimed), with the existing share sheet. Strings: twelve names and
about four lines.

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
most new strings come from: design each screen to need few (3.5). Both reports list, per fix, how many new strings
it needs; many need none because the right label already exists.

Device targets from root `CLAUDE.md` apply to everything here: touch first, safe areas, portrait and landscape, the
bottom bar fits 320 px, cheap Android phones on the low quality profile. Check every new or changed surface at
320×568, 360×640, 390×844 and 844×390 in the sandbox (`?sandbox`), in English, in one right-to-left language and in
one long-word language (Arabic and German), with real touch events at element centres, and look at the screenshots
yourself. The playthrough's drivers in `scripts/playthrough/` do exactly this and refuse a tap on a covered target.

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
- Strings: 0 to 1.

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
  weakest on average but not always. Offer it, with its Hold button, only if on ten bases at each of Keeps 9, 12
  and 15 it is the best order on at least one base in five. A button that is nearly always wrong is a trap.
- Done when: a full raid can be played in three taps; a squad-order raid's record replays identically; the new row
  fits at 320×568 and 844×390 with the safe area.
- Strings: about 8 (11 with the reserve).

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
  screen stays responsive on the low profile (`npm run perf:profile`).
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
buildings that fell. All of it is in the battle record. Today a 0-star raid reads "took 167,676 Coins and 108,575
Provisions (+40 honor)", which is how a held raid that lost a quarter of the collectors looks before Phase 2; after
it, the line must show what holding saved. Feed "the side raiders break through" to `nextObjective` as a free
suggestion. Strings: about 4.

**P6-04 (defense opportunity 1) "Test my defenses".** On demand, run the simulated raider (`attackerFor`,
`villageToBase`, `botDeployments`) against the player's own village and play the replay; and from a lost defense in
the log, start a practice battle with that raider's army against the village as it is now. No loot, no honor, no
shield change, labelled practice, device only. This makes moving a tower an experiment with a result. Strings:
about 3.

**P6-12 (P2-14) The garrison crew in the builder panel.** A second, named queue for defenses, traps, walls and
counters, shown where the artisans are shown, and one line when it first opens. Strings: about 3.

**P6-18 (built-not-live section 4) Rules a player cannot read.** No sentence anywhere says that rival clans answer
the player's last ten raids, that each lost raid halves the next raider's take for a day, or what counters what.
Add a short Codex page: the `counters` and `counteredBy` lists that already exist on the catalog (names are
translated), the three temper axes, each rival clan's leaning, and those two sentences. Strings: about 4.

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
route to the Army panel; "Next" is disabled with no reason when the fee cannot be paid; 27 explanations exist only
as hover titles, which touch never shows (a long press on a troop card shows its name and line from data); battle
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
Do this early in the phase: every other item here then gets a test.

Close the phase: section 13, `npm test`, lint, build, the perf scripts, screenshots of every new surface at the four
sizes in the closure record, and the note that nothing was checked on a physical device.

## 12. Phase 7: everything code can still do toward a store release

Read `publish.md`. Most of the cheap wins earlier audits named are already done; its section 3 lists them so you do
not redo them. What is left:

**P7-01 (PUB-04) A test requires the publisher facts to be empty, and nothing stops a store build shipping with
"not published yet" pages.**
- Keep (protected item 36): the pages never invent a fact.
- Change: the test accepts an empty value or a well-formed one (no `example.com`, no angle-bracket placeholder). Add
  `tools/release/check-store-ready.mjs` and an npm script for it (cross-platform, no bash syntax). It prints one
  table of everything still missing for a store build: empty publisher facts, draft terms, the legacy bundle id,
  missing signing secrets and server URL, products in the shipping table, a stale policy date, unsynced native
  plugins. It is an error in the signed Android and TestFlight jobs when operator, support email, deletion URL or
  terms date are empty, and a notice on the web build (reuse `tools/release/ci-note.mjs`).
- Test it in `tests/backend/server/release-tools.test.ts`.

**P7-02 (PUB-05) The signed Android job would upload the old game's package name, which Google Play never lets you
change.** The id `com.toadstoolkingdoms.app` is in five places. Read the app id from one variable, consumed by
`capacitor.config.ts` and `android/app/release.gradle` (the application id only; the Java namespace can stay). The
signed jobs fail with a clear message while it is unset or still the old id, unless `ALLOW_LEGACY_APP_ID=1`. Cover
it in `tests/backend/release-config.test.ts`. Choosing the id is the owner's decision; do not choose it.

**P7-03 (PUB-06) Committed native project files do not list two plugins the game depends on.** Run
`npm run build && npx cap sync` and commit what it regenerates. Add a test that every `@capacitor*` dependency in
`package.json` appears in the Android and iOS plugin lists.

**P7-04 (PUB-07) Two prepared Apple age-rating answers are wrong** (`docs/store/PRIVACY.md`: contests "None", age
assurance "No", while the game runs leagues and events and calls both stores' age APIs). Recheck Apple's current
definitions page before changing them (the audit lists the official references to recheck), write the reasoning
beside each answer, add the closure record for C05, and pin both answers in
`tests/presentation/store-compliance.test.ts`.

**P7-05 (PUB-08) No third-party licence notices ship with the game.** A small generator
(`tools/release/licenses.mjs`) writes `public/licenses.html` from the shipped dependencies and the two fonts, with
full licence texts in English, linked from the support page through `tools/i18n/pages.mjs` (one page string). A test
checks every runtime dependency appears.

**P7-06 (PUB-09) The iPhone release workflow runs on an image that may not carry the SDK Apple requires.** Move it
to the runner the audit names and turn the SDK warning into an error below the required version. The workflow has
never run; say so.

**P7-07 (PUB-10) The chat word filter is 30 English words for a game shipped in 50 languages.**
- Add per-language lists (for example `locales/<code>/blocklist.json`), merged into the filter in
  `sim/social/grove.ts` and used by the server through the same shared code, starting with the ten largest launch
  languages. Each list ships with a corpus of ordinary sentences in that language that must pass unfiltered, to
  catch false positives.
- Keep the lists conservative and mark every one for native review (`locales/<code>/REVIEW.json`). The word filter
  matches word edges in every script and substrings in unspaced scripts; test both.
- This is moderation quality, not legal compliance: the closure record says a native speaker has not reviewed them.

**P7-08 (PUB-11) The privacy page's "last updated" date is older than its last change.** Set `policyUpdated`, and
add a test that compares it with a hash of the English privacy strings so the text cannot change without the date.

**P7-09 (PUB-12) Shared links unfurl without an image; the install prompt has no screenshots.** When
`VITE_PUBLIC_URL` is set, write absolute `og:image`, `twitter:image` and `og:url` at build time. Commit two
compressed screenshots, list them in the manifest and the localized manifests, and keep them out of the service
worker's precache list.

**P7-10 (PUB-13) Open-item documents contradict the code.** Move answered entries in `docs/backend/REQUESTS.md`,
`docs/game-theory/REQUESTS.md` and `docs/art/REQUESTS.md` under a "Done" heading with their commits. Add the
open-item table from `publish.md` section 4 to the audit as a dated reassessment (R05 says "English only" while 50
languages are complete; the listing's languages row predates them).

**P7-11 (PUB-14) Retention statistics by the player's local day are built and switched off in every build.** Set
`VITE_STATS_TZ: '1'` in the build steps of the three client workflows and note it in `docs/SHIPPING.md`. Still
adults who opted in only.

**P7-12 (BNL-14) No person can play the built-not-live content on a deployed build.** The preview needs a dev build
or a build flag the deploy workflow never sets. Prepare, behind an explicit workflow input that is off by default,
a second web build under a preview path (sandbox save, never online) and a short tester checklist. Whether an
unfinished-content URL may exist, and who tests, is the owner's decision: put it on the checklist and do not switch
it on.

**P7-13 The listing sells an older game.** After the earlier phases, update `docs/store/LISTING.md` with what the
game now has, every claim tied to data or a test in its "claims checked" table (protected item 38), and regenerate
the per-language store copy in the translation batch. Flag for the owner the keywords that name things the game
does not contain.

**P7-14 "What's new".** A short per-version entry shown once in the existing News panel, with the same text kept as
the stores' release notes. Strings: one entry.

**P7-15 Things that cannot be compiled or verified here: write them down, do not pretend.** The app-level iOS
privacy manifest, the audio session category, the Game Center and Play Games achievements plugin, the
marketing-version mismatch in the Xcode project. Make the source change where it is plain text and safe, and list
each in the record as "not compiled, not run on a device".

**P7-16 The owner's checklist, in one place.** Write `docs/store/OWNER_CHECKLIST.md` from
`docs/audit/STATE_OF_THE_GAME.md` section 6, `publish.md` section 4e and what this pass adds: the legal entity,
bank and tax; the trademark search; the final bundle id and package name; the domain; every publisher fact; the
legal reviews per market and the under-13 position; store accounts, capabilities, keys, products and forms;
hosting, backups and staff; signing secrets; physical devices and store testing; native review of 49 languages, of
the word lists and of the festival names; whether a preview URL for unfinished content may exist and who tests it; an artist and music; real-player playtests of every number this pass
changed. Each line says what it blocks and which command or file shows whether it is done. The preflight of P7-01
checks the lines a machine can check.

Close the phase with section 13, the full checks and the closure record. Do not write "ready" anywhere.

## 13. Translation: all 49 languages, at the end of every phase that touched text

Run this procedure when a phase's English is final, before that phase's closure record. Two adjacent phases
finished in one session may share one run. The list of new and changed keys, with what each is for, comes from the
ledger.

1. `npm run i18n:extract && npm run i18n:sync`, then `npm run i18n:status`. Every language shows the same missing
   count; a changed English string appears with its old translation as a hint.
2. One translator sub-agent per language, each given `locales/CLAUDE.md` in full as its brief, with
   `locales/GLOSSARY.md`, its language's line in `languages.json` and its `TERMS.md`. A translator edits only
   `locales/<code>/`, fills `text` only, never changes a key or `en`, and runs `npm run i18n:check -- <code>` until
   it is clean. Run a few at a time; they do not need the test suite.
3. Tell each translator what the new text is for. Give them the screen, the feature and the placeholders' meaning
   for every new key (a table from your ledger). A translator who sees only "Kept {kept} of {total}" will guess.
4. When all are back: `npm run i18n:check`, `npm test -- tests/locales`, `npm run i18n:status` must say every
   language is complete. Run `npm run store:storekit` if any store text changed, and regenerate the per-language
   store copy if the listing changed.
5. Have a second agent per script family (Latin, Cyrillic, Arabic-script, Indic, CJK, Thai) read a sample of twenty
   new strings against the English for meaning, placeholders and the glossary's terms. Fix what it finds.
6. The record says what this is: machine translation checked for structure, not reviewed by native speakers.

## 14. Finishing

Before you report:

1. Every check, from a clean install: `npm ci`, `npm test`, `npm run test:slow`, `npm run lint`, `npm run build`,
   `npm run typecheck:server`, `npm run server:build`; the Postgres and Redis suites if you could run them; the perf
   scripts.
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
| `economy.md` | ECO-01 to ECO-07 | P2-01 and P3-01, P1-01, P1-03, P3-08, P1-04, P1-05, P2-07 |
| `economy.md` | ECO-08 to ECO-14 | P2-09, P5-11, P3-09, open, P3-03, P1-10, P2-08 and open |
| `defense-raids.md` | DEF-01 to DEF-13 | P2-01, P2-01, P2-04, P2-02, P2-03, P2-05, P2-12, P2-07, P2-08, P2-09, P2-06, P2-10, P2-11 |
| `pacing.md` | PAC-01 to PAC-07 | P3-01, P3-02, P3-03, P3-04, P1-06, P4-10, P4-09 |
| `pacing.md` | PAC-08 to PAC-14 | P3-02, P3-06, P3-07, P5-08, open, P3-05, P3-10 |
| `combat.md` | CMB-01 to CMB-06 | P4-01, P6-02, P4-06, P4-05, P4-02, P4-04 |
| `combat.md` | CMB-07 to CMB-12 | P4-03, P4-07, P6-01, P4-11, Phase 4 preamble and P4-10, P4-08 |
| `built-not-live.md` | BNL-01, BNL-02, BNL-07, BNL-08, BNL-14 | P6-01, P5-07, P1-22, P6-08, P7-12 |
| `built-not-live.md` | BNL-03 to BNL-06, BNL-09 to BNL-13 | P4-10 |
| `ui-surface.md` | UIS-01 to UIS-07 | P6-07, P3-04, P6-01, P6-05, P6-13, P6-08, P2-15 and P6-13 |
| `ui-surface.md` | UIS-08 to UIS-13 | P6-14, P6-15, P6-16, P6-06, P6-10, P6-16 |
| `playthrough.md` | PLY-01, 02, 06 to 10, 12, 14 | P6-09 |
| `playthrough.md` | PLY-03, PLY-04, PLY-05, PLY-11, PLY-13 | P3-04, P3-11, P6-11, P3-12, P6-07 |

Each report also lists opportunities and lower-priority notes. Those this prompt took are named in their work
items. The rest are recorded in the reports; add the ones you judge worth a later pass to the ledger as open ideas.

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
- **The league win bonus:** a share of the raid's own loot in one report, a share of the Keep's lowest loot in
  another. The Keep-scaled form is chosen because it follows the reward pattern the game already uses (P2-09).
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

## Appendix C. Traps, collected

- The campaign's defense columns describe a village with level-1 defenses and no walls until P2-04 lands.
- `supportStrike` at 1.0, Smoke at 12 seconds, `defenseWin.uncapped`, a lower Keep 6 cost, a trimmed Eclipse Ninja
  damage: each was measured or reasoned out and rejected. Do not rediscover them.
- Mastery's bonus as tuned (+10% after one raid), the three planned heroes as built (a false choice) and ten of
  the fifteen planned counters (no effect) are not ready, however finished their code looks.
- A new building's body moves a raid more than its rule does. Anything added to generated bases is a balance
  change even with its effect switched off.
- A "hold N raids" goal is dishonest until Phase 2 is in and measured.
- A change to which base a seed generates must ride the rules bump (P4-07).
- A field written by `createNewVillage` or a migration is a state change even when it is empty (3.2).
- A sanitized battle setup must not break replays of old records: records carry their own setup and are replayed
  as recorded; the whitelist applies to new battle commands (P1-11).
- A translated sentence that says a number ("Holds 8 hours of output", "repeats every two weeks", "8 seconds",
  "30% more damage") changes in 50 languages when the number does. Make the sentence read the number where you can.
- Every new English string makes 49 languages incomplete, and about 25 test files red, until section 13 is done
  for that phase.
- An achievement tier needs its platform id; a new table needs its line in account deletion; a new metric needs its
  help line; a new server message needs its code in the catalog.
- The exploit report's "checked and found sound" list, and each report's protected list, are there so nobody
  re-hunts or "fixes" them.
- Headless Chromium is not a phone, a model player is not a player, and a policy draft is not legal advice. Say so
  wherever you report a result.
