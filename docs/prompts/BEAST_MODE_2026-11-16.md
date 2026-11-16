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
| A session: 2 to 10 minutes | Always one thing that pays | After two raids nothing pays for 50 to 100 minutes; the next-objective chip dead-ends on "Next Artisan free in..." (`pacing.md` 3, RET-10) | Phases 3, 5, 6 |
| A day | Varied tasks that mean something | 15 task templates, all seen within a week, two of eight daily ones complete on the first collect, tasks pay nothing for the last 11 days of a season (`retention.md` 2) | Phases 1, 5 |
| A week | An appointment | Four event kinds on a 14-day loop, one playable event for 72 of 336 hours (`retention.md` RET-01) | Phase 5 |
| A month | A season worth finishing | The Scroll is identical every season, its paid look repeats, unclaimed tiers vanish; the league win bonus fades to 1.4% of a raid (`retention.md` RET-02 to 04, RET-14) | Phases 1, 2, 5 |
| Months: the long horizon | Goals that outlast Keep 15 | Nothing new after day 113; the "endless" Trials end near tier 68; Keeps 9, 10, 13, 14, 15 unlock no building; no collection layer is live (`pacing.md` 2, 4; `retention.md` 3) | Phases 3, 5, and the built-not-live work in Phase 4 |
| The defender's game | Building a base is a decision with a payoff | A held raid still loses a third of everything raidable and is paid 5 to 11% of that back; a stronger base is raided more often (`defense-raids.md` 1.3, 1.4) | Phase 2 |
| The first hour | A raid within minutes | First raid after about 12 minutes and two idle waits; the first Keep 3 raid is a loss (`pacing.md` 3) | Phase 3 |
| The casual player | Progress on one visit a day | Keep 5 to 6 takes 26 days because raids take back 105% of what the collectors produce (`pacing.md` 1) | Phases 2, 3 |

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

**P0-04 (PUB-02) `tests/gameplay/balance/matched.test.ts` fails on CI and passes locally.**
- Why: CI measured Keep 8 at 2.75 stars against a 2.2 ceiling on `9bf76af`; the same tree gives 2.167 on Node
  22.23.4, Node 24.22.1 and Bun (`scripts/publish/det-*.txt`, byte-identical). CI's Node was a later 24.x patch. In
  the same failing run the combat fingerprint and the pinned aura battles passed. Either one Node version computes
  something differently (which would make the server reject honest battles) or the test depends on something
  outside the tree. This is the most important unknown in the repository. `exploits.md` has a further analysis; read
  it first.
- Do: (1) run `scripts/publish/det.ts` on the exact Node the `Dockerfile` pins and on the version CI resolved, and
  diff against `det-node22.txt` to find the stage that differs (base generation, bot deployment or the battle).
  (2) Add `.node-version` and make all workflows and the `Dockerfile` read one exact version. (3) Add a small
  cross-engine fixture test: the hash of a few generated bases, bot deployment lists and battle results, pinned, so
  an engine change fails loudly rather than through a balance band. (4) Only then look at the gate itself: 2.167
  against 2.2 leaves a margin of one star in twelve raids, which is a fragile gate even when deterministic. More
  seeds or the mean of adjacent Keeps (CMB-12) is the fix; widening the band is not.
- Done when: the cause is named with evidence, or the record says exactly what was ruled out and what could not be
  run here. Do not close this by changing the number.

## 6. Phase 1: defects of honesty and integrity

Small, certain fixes. None needs a balance judgement. Several change stored state: this phase introduces the pass's
one `SAVE_VERSION` bump (3.2).

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

**P1-11 Exploits and logic defects from `exploits.md`.** Work through that report's list in its order. Each item
there has a reproduction script under `scripts/exploits/`: turn the reproduction into a failing test, fix the cause
in the simulator (never by a client-side check alone when the server replays the command), and confirm the server's
replay refuses the same input. Anything the report marks as a determinism hazard is fixed before Phase 4's rules
bump, with a pinned test.

Close the phase: `npm run balance:campaign`, `npm run test:slow`, section 13 for the phase's text, the full checks,
the closure record.

## 7. Phase 2: make defense a real decision

No battle result changes in this phase. Everything is in `raids.json`, `ranks.json` and hooks that already exist
behind data values live data does not set. Read `defense-raids.md` in full first; its section 1 corrects a belief
three audits repeated.

**What is actually true.** The campaign's "0% held at every Keep" is the model player's village, not the game: the
model leaves every defense at level 1 and places no walls. A built base holds the raider it is sent 75 to 100% of
the time. The real defects are these: a held raid protects nothing (loot leaves with every destroyed building
whatever the stars), a hold pays 5 to 11% of what it still lost, a strong base gets no shield and so is raided more
often, the raider's strength is a point mass that jumps a Keep when honor rises, the raiders bring one ground army
so anti-air never matters, and with a server no bot raid ever happens.

**What defense cannot do, so do not try.** It cannot buy Keep pace: the whole raid tax costs 11 to 13% of pace and a
defense to caps costs 1.4 to 3.9 times the next Keep's price. The old target "skipping defense costs 10% of the pace
to Keep 12" is unreachable by loot protection. Defense pays in wealth kept, in rewards and in visible results. P2-04
restates the gate that way.

**P2-01 (DEF-01, DEF-02, ECO-01) Stars decide what a raider carries home, and every star denied pays.**
- Change:
  - `raids.carryByStars`: the share of what it broke open that a bot raider carries, by stars won. Starting value
    `[0.2, 0.5, 0.8, 1]` (the lab used `[0.1, 0.4, 0.7, 1]`).
  - `raids.defenseWin`: `shareOfRaidLoot` 0.15 with `perStar: true`, so each star denied pays a third. Keep it
    storage-capped and report what did not fit; do not use the `uncapped` hook.
  - Fix the bug the hook carries: `raidVillage` computes `v = v0 * carry` and the storage branch does not round, so
    resources become fractional. Floor it, and add a test that no resource is ever fractional after a raid.
  - Add the three keys to the `RaidsData` type and remove the `as` casts that read them.
- Measure with `def_econ.ts` and `def_daily.ts` at Keeps 5, 9, 12 and 15, at least 24 raids a cell, for the four
  build qualities (level 1 without walls, caps − 2, caps − 1, caps).
- Done when all hold:
  1. Net result per raid improves at every step of build quality at every measured Keep.
  2. For a one-visit player, loss per day never rises with build quality (today a maxed Keep 15 base loses 29% more
     per day than a caps − 2 base).
  3. A base at caps is about neutral against the typical raider (within ±10% of one raid's reward).
  4. The undefended village loses what it loses today, within noise: losses still hurt.
  5. A maxed base's rewards per day stay under 20% of the regular player's daily raid loot at that Keep, so defense
     is not a farm.
  6. Nobody is worse off than today in any cell.
- Scope: bot raids on device villages and the server's simulated raids (P2-12). For raids by real players keep
  conservation: the defender loses what the attacker carries. Add only the per-star reward there
  (`server/core/pvp.ts` pays honor only today).
- Strings: 1 or 2 for the defense log line ("kept X of Y"), built in Phase 6.

**P2-02 (DEF-04) Raiders come from the defender's Keep, not from honor.**
- Why: measured. At the campaign's honor the raider is the same one every time (Keep − 1 at the low end); above
  about 350 × (Keep − 1) honor it jumps to Keep + 1. Holding raids raises honor, so holding summons a stronger
  raider.
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
- Change: add a `regular_fortress` policy to `CAMPAIGNS` (the lab's `fortress` policy already exists in
  `tools/balance/playerModel.ts`), and give model villages a real layout through a data clone with
  `raids.labAutoLayout` and `labWalls`, passed by the campaign tool only. Live data never sets those flags; add a
  test that `defaultData.raids` has neither.
- Replace the `KNOWN FAILING (PS-1, open)` assertion in `campaign-gates.test.ts` with gates that say what defense is
  for: the fortress holds at least 40% of raids at Keeps 9 to 15; its stolen-to-looted ratio is at most 0.6 times
  the rusher's; it reaches Keep 12 within 1.25 times the rusher's days. Use the values the run gives you if they
  differ, and record why.
- Do not change the behaviour of an existing campaign policy. Add policies. The history of every gate depends on the
  old ones staying comparable.

**P2-05 (DEF-06) A long absence must not empty the treasury.**
- Why: measured. Thirty days away loses 94 to 97% of what was stored, and the welcome-back screen lists 24 raids.
- Change: `raids.maxRaidsPerCatchUp` 24 → 3. Measure with `away.ts`.
- Done when: 7 days away loses at most a quarter of what was stored and 30 days at most 30%, at Keeps 9 and 12.

**P2-06 (DEF-11) Exhaustion reaches the once-a-day player.** `raids.exhaustion.windowHours` 24 → 36. Check the
regular player's Keep 15 day stays inside its gate.

**P2-07 (DEF-08, ECO-07) Settle the score loses resources even at three stars.**
- Why: measured. Three stars pay 437 k at Keep 12 against 1.67 M banked by an average raid and a 267 k army.
- Change: `raids.rematch.recoverShare` (starting value 0.75): the reward is the larger of today's and
  `recoverShare × stars ÷ 3 ×` what that raid took (`record.result.loot`). `rematchReward` and `rematchEnd`.
- Done when: at 2.5 stars the rematch is worth about a normal raid and at three stars a little more, at Keeps 5, 10
  and 15. It stays once per raid, 72 hours, no honor, labelled simulated.
- Touches: the server replays `rematchEnd`. Strings: 0 to 1.

**P2-08 (DEF-09) Declared stakes are a button nobody should press.**
- Why: break-even hit rates are 91% (two stars) and 80% (three); the campaign's rates are 50 to 64% and 4 to 17%.
- Change: `raids.stakes.byStars` to `{ "2": 1.3, "3": 1.75 }` (break-even 77% and 57%).
- Done when: for the bot plan declaring is still a loss on average (it is a skill bet, not free loot), and for a
  player who hits two stars four times in five it is a gain. State both numbers in the record.

**P2-09 (DEF-10, ECO-08, RET-14) The league win bonus fades from 30% of a raid at Keep 5 to 1.4% at Keep 15.**
- Change: express `winBonus` as a share of the Keep's lowest generated raid loot per league (starting values 2% in
  Cedar rising to 15% in Kage, for three stars, scaled by stars ÷ 3), in `ranks.json` and `leagueWinBonus`. This
  follows the Keep-scaled reward pattern (protected item 25); do not tie it to the raid's own loot.
- Leave the season reset as it is.
- Done when: the bonus is between 5% and 20% of an average raid's banked loot at every Keep from 5 to 15 at the
  model's league. Show it on the Honor panel (an existing number, no new sentence if possible).

**P2-10 (DEF-12) A struggling player's opponents never get easier.**
- Why: the casual explorer wins 18 to 19% at Keeps 13 and 14 while honor falls, because the research floor sets the
  opponent.
- Change: `ranks.matchmaking.lossStreakSlack`: 0.25 of slack per consecutive lost raid, cap 1.0, reset by a win,
  counting only raids that deployed at least 80% of the army's housing so it cannot be farmed with one-warrior
  losses. In `opponentFor`.
- Done when: the sandbagger gate still holds and a deliberate-loss strategy (lose four, then raid) measures worse in
  loot per hour than playing straight.

**P2-11 (DEF-13) Next is priced by the player's Keep while the offers are a Keep lower.** In `scoutFee`, price by the
Keep the player is matched against. Measure with `next_offers.ts`: the fee is 1.5 to 2.5% of the mean offer at Keeps
5, 9, 12 and 15.

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

**P2-13 (optional, CU-1) Towers payable in Provisions.** Coins bind 1.1 to 2.7 times harder than Provisions at Keeps
3 to 12. Adding `defense` and `support` to `economy.provisionsPayable` gives the idle currency a use. Measure the
regular and casual pace before deciding; skip it if either moves by more than 5%.

Close the phase: campaign, slow tests, section 13, full checks, the closure record. Rewrite the "Is defense worth building?"
section of `docs/game-theory/CAMPAIGN.md` through its generator, and correct the E26 and PS-1 statements in
`docs/store/WORLDWIDE_AUDIT.md` by adding a dated record (never by editing old ones).

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
  shield hours.
- Do not lower the Keep 6 cost. `curves.test.ts` requires the early cost multiplier never to shrink, and it only
  moves the wall to Keep 6 to 7.
- Measured result to reproduce (single seed, ±2 days): casual Keep 5 to 6 in 13 days (was 26), casual Keep 15 on day
  207 (was 246); regular Keep 15 unchanged at day 113, largest speed-up 11% at Keep 8.
- Done when: the casual stretch from Keep 5 to 6 is 10 to 16 days, no casual stretch through Keep 10 exceeds 21
  days, and the regular player's Keep 15 stays inside 100 to 140 days **with Phase 2 already applied** (the two
  phases move the same quantities; measure them together).

**P3-02 (PAC-02, PAC-08) Gate the casual pace, and model the player the game actually allows.**
- Add to `campaign-gates.test.ts`: casual reaches Keep 6 by day 25, and no casual stretch between Keeps is longer
  than 21 days through Keep 10.
- Add campaign policies (do not alter existing ones): one that hires the third artisan with the starting Jade, one
  that queues the second army (`economy.json` `queuedArmies` allows it; the model's `train()` stops at camp
  capacity). Report them in `CAMPAIGN.md`. They describe a believable player; the gated baseline stays the
  conservative one.

**P3-03 (PAC-03, ECO-12) Three quarters of all builder time is Mints, Farms and storages at a flat seven days a
level.**
- Why: 1,294 of 1,771 builder-days. Every level from 15 up is seven days, and only collectors and storages have many
  such levels. A collector also produces nothing while it upgrades, so a Mint's level 15 forfeits 1.59 M Coins on
  top of its price.
- Change: cap `buildSeconds` of the four economy buildings (Coin Mint, Terraced Farm, Treasury, Storehouse) at three
  or four days from the level where they reach it. Let a collector keep producing at its old level while it
  upgrades (`sim/village.ts`, where `accrueFrom` is set to the upgrade's end), or failing that print the lost output
  in the upgrade quote.
- Measured: a three-day cap brings the total to 1,089 builder-days and the regular Keep 15 to day 98, which is under
  the gate; a four-day cap gives 1,267. Choose the cap that keeps the regular Keep 15 at 100 days or more. The gate
  is the owner's stated target and does not move.
- `buildSeconds` is outside the combat fingerprint. The collector change alters what `advance` computes, so the
  server replays it.

**P3-04 (PAC-04) The first raid arrives after about twelve minutes and two idle countdowns.**
- Why: the tutorial upgrades the Keep (240 s), waits for it, then trains (up to 400 s) and waits again. The model
  gets five raids in the first hour.
- Change: `buildings.json` Dojo levels 1 to 4 `trainingSpeed` 1 / 1 / 1 / 1 → 2 / 2 / 1.6 / 1.3; Keep level 2
  `buildSeconds` 240 → 60; reorder the tutorial (`src/presentation/ui/tutorial.ts`) so the army, train and raid
  steps come before the Keep upgrade. The save stores the tutorial's step index: remap it in the migration so a
  player in the middle of the old order lands on the equivalent step.
- Done when (`scripts/pacing/firsthour.mjs`): first raid inside three minutes with no Jade spent, at least seven
  raids in the first hour, Keep 3 still inside the 40 to 80 minute window `progression.test.ts` holds.

**P3-05 (PAC-13) Keep 3 opens with a lost raid.** After four three-star raids at Keep 2, the first Keep 3 raid is
zero stars; the casual model wins none of its two Keep 3 raids. Either raise `ranks.json` `powerSlackByKeep` for
Keep 3 (1 → 1.25) or add `firstRaidsSlack` for the first two raids after any Keep upgrade in `opponentFor`. Done
when the regular Keep 3 average is 1.2 stars or more, the casual Keep 3 average is at least 1, and the three-star
farming gate still holds.

**P3-06 (PAC-09) A late starter clears dozens of trivial Trial tiers at a loss.**
- Why: a tier pays by its own Keep. A Keep 10 player starting the ladder has 36 easy tiers, each costing a full army
  for 0.5 to 60 k.
- Change: `trials.json` `catchUpKeepsBelow` (2): clearing tier `t` also clears every lower tier whose Keep is at
  least that far below the player's, paying their rewards once. In `trialEnd`. "Paid once per tier" stays true.
- Touches: the server replays `trialEnd`. Strings: 1 (the result line listing what was cleared).

**P3-07 (PAC-10) After two raids a session has nothing left that pays.**
- Why: army refill is 50 to 104 minutes from Keep 5; every battle mode spends the same warriors; practice pays
  nothing.
- Change: a **daily drill**. One practice battle a day against the player's next Trial fortress with
  `practiceArmy` (full camps at current research, nothing spent, so it works with empty camps), paying a small
  fixed Keep-scaled reward once per local day. It needs a command the server can replay and re-simulate
  (`drillEnd`, in `PLAYER_COMMANDS` and `BATTLE_COMMANDS`, built on the `trialEnd` path) and a stat for the day's
  task. The reward is about a fifth of the daily chest. It is labelled practice.
- Done when: a returning player with no warriors always has one action that pays within two minutes, and the drill
  cannot be claimed without a battle the server re-ran.
- Touches: save (a stat), commands, server, UI. Strings: about 4.

**P3-08 (ECO-04, CU-5) Top-ups and army finishing are 37 times dearer at Keep 15 than at Keep 1, and offers scaled
by the same table are hollow.**
- Why: one hour of income costs 15 Jade at Keep 1 and 550 at Keep 15; finishing a Keep 15 army costs 461 Jade for
  one extra raid; the Keep Celebration's supplies are 0.34 hours of production at Keep 15.
- Change: regenerate `topUpScaleByHall` with `tools/balance/topup.mjs` at exponent 0.75 instead of 0.5, and decouple
  `trainingSkipScaleByHall` so skip-and-raid stays a few times cheaper than a top-up for the same loot (1 at Keeps 1
  to 5 rising to 3 to 5 at Keep 15). The table is in `scripts/economy/econ3.cjs`.
- Keep (protected item 22): the top-up's shape. Keep the invariants `tests/gameplay/economy/topup.test.ts` and
  `docs/game-theory/TOP_UP.md` state; update the document through its numbers.
- Done when: an hour of income costs 70 to 210 Jade from Keep 5 to 15; every offer's supplies are worth at least an
  hour of production at every Keep it can appear at; a full Keep 1 to 15 rush by Jade costs at least 25,000 Jade
  (it must stay a bad idea).

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

Left open on purpose, record them as such: the currency load imbalance late (ECO-11: no late Coin sink, research is
100% Provisions) and the hollow second and third research lanes (PAC-12). Both are real, neither has a measured fix,
and a guess here would move every Keep.

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

**P4-10 Built-not-live content that goes live under this bump.** `built-not-live.md` ranks every item by
replayability gained per unit of risk and gives the exact steps for each. Apply its "ship now" list here and only
that list. The rules are fixed:
- An item goes live only if its entry in `docs/game-theory/PREVIEW_BALANCE.md` (regenerate with
  `npm run balance:preview`) shows it neither broken nor a no-op, and the army-lab gates pass with it in the data.
- Follow "Making one live" in `src/gameplay/CLAUDE.md`: move the generated definition into the live data files, set
  `live` in the catalog, snapshot before the bump.
- A hero, a building or a command that the server must accept needs the server side in the same pass (`checkArmy`,
  `validateBase`, `PLAYER_COMMANDS`), with the REQUESTS entry.
- The late Keeps are where content is missing: Keeps 9, 10, 13, 14 and 15 unlock no building type and the regular
  player spends 20 to 28 days at each of Keeps 13 and 14. The three built heroes sit on Keeps 9, 11 and 13 and the
  Hero Hall on Keep 7. If the report's evidence supports it, heroes are the first choice.
- Every name and description is already translated (the catalog and `roster.json`). Anything that is not costs 49
  translations.

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

**P5-07 Warrior Mastery as the long-horizon track.**
- `built-not-live.md` gives the system's exact state. It is built (`sim/mastery.ts`: experience per battle from
  housing and stars, a level curve, a bonus that never passes +30%) and switched off, with its save field present
  since v23 and a Codex panel made for the preview.
- Turn it on in the narrowest form that the report shows is safe: ranks earned everywhere and shown in the Codex,
  with the battle bonus applied **only against a Shadow Trial fortress**. That changes no raid, no defense and no
  player-against-player result; it gives the Trial ladder something that grows (measured: the wall moves from about
  tier 68 to about 77) and gives each of 50 warriors its own rank to earn after Keep 15.
- It needs the server to carry mastery for a server-held village and to refuse a setup that claims more than was
  earned (`checkBattleSetup` already does on the device). If the bonus touches battle arithmetic that a live battle
  could reach, it belongs to Phase 4's bump: decide this before that bump is made. If the report says the server
  side is too large, ship ranks without any bonus and record the rest as open.
- Strings: the Codex panel's are already translated for the preview; check, and count any that are not.

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
most new strings come from: design each screen to need few (3.5).

Device targets from root `CLAUDE.md` apply to everything here: touch first, safe areas, portrait and landscape, the
bottom bar fits 320 px, cheap Android phones on the low quality profile. Check every new surface at 320×568,
360×640 and 844×390 in the sandbox (`?sandbox`), in English and in one right-to-left and one long-word language
(Arabic and German), and look at the screenshots yourself.

**P6-01 (CMB-09) Squad orders on screen.**
- Built and tested, with no screen: `src/gameplay/control/squadPlan.ts`, `BattleSession.orderSquad`,
  `tests/gameplay/control/squad.test.ts`; the ask is in `docs/art/REQUESTS.md`. The orders go through the ordinary
  deploy path, so replays and the server check are unchanged.
- Build: before the raid or in the battle bar, choose a formation and a wave order; then one tap on an Infiltration
  Point sends the undeployed army in that shape. The choice is remembered. Hand placement stays as it is.
- Offer **together** and **pincer**, **tanks first** and **rush**. Do not offer "file" or "hold a reserve": on the
  same army they measure 13 to 20 points worse (`scripts/combat/t8.ts`), and a button that is always wrong is a
  trap. If a later rule gives a reserve a job, it can come back.
- Done when: a full raid can be played in three taps; on ten bases at Keeps 10 and 15 the squad-order raid scores
  within 3 points of the same deployments placed by hand; the battle record replays identically.
- Strings: about 6.

**P6-02 (CMB-02) The largest lever in a raid cannot be read, so make it learnable: the post-raid review.**
- Why: the best entry point is worth 16 to 21 points over the mean point, and no static scouting metric predicts it
  (seven were tested; none exceeds a correlation of 0.31 or is consistent across Keeps). The count the scout screen
  shows per point is a true fact and bad advice.
- Build: on the result screen, a "what if" review that re-runs the same army and the same orders through the other
  open points with the deterministic simulator and shows each honest result (stars and destruction). Client only.
  Compute one point at a time, on demand, off the main thread or in slices: a Keep 15 battle takes about 0.2 s on a
  desktop and several times that on a cheap phone.
- Honesty: it says what it is (the same army sent through another point, simulated). It is never shown as what the
  player "should have" earned, and it never runs before the raid.
- On the scout screen: keep the count as a count. Never label a point as recommended, safest or best unless a lab
  test shows the label is right ("the favoured point beats the mean point by 8 or more at Keeps 10 and 15"); no
  metric passes today.
- Done when: the review's numbers equal a real battle fought with those deployments (a test); the result screen
  stays responsive on the low profile with CPU slowed six times (`npm run perf:profile`).
- Strings: about 4.

**P6-03 (defense opportunity 2) The defense report.** For each raid in the log and on the welcome-back screen:
what was kept of what was raidable, stars denied, the reward, the entry point the raider used and the first three
buildings that fell. All of it is in the battle record already. Feed "the side raiders break through" to
`nextObjective` as a free suggestion. Strings: about 4.

**P6-04 (defense opportunity 1) "Test my defenses".** On demand, run the simulated raider (`attackerFor`,
`villageToBase`, `botDeployments`) against the player's own village and play the replay. No loot, no honor, no
shield change, labelled practice, device only. This is what makes moving a tower an experiment with a result.
Strings: about 3.

**P6-05 (RET-10) The next-objective chip dead-ends on "Next Artisan free in...".** Add kinds ahead of `builders`
and `none`: something to claim (a task, a Scroll tier, an achievement, a seal); a running Bounty or Gauntlet with
unpaid steps and a full army; the next Trial tier when it is at or below the Keep; the daily drill. Each opens its
panel. The chip never suggests anything paid (protected item 35). Cases in
`tests/gameplay/sim/return-hooks.test.ts`. Strings: about 4.

**P6-06 (retention opportunity 7) The Trials ladder view.** The panel shows one tier. Show the next ten with their
layout and modifier, and mark every tenth with its Jade. Strings: about 2.

**P6-07 The result screen gives a reason to raid again.** `ui-surface.md` lists what it shows today and what is
missing. The target: stars, what was banked and what overflowed, the honor change, a close-call note only when
true, progress the raid made toward today's tasks, the contract, the Scroll and the league, the review (P6-02), and
one next step from `nextObjective`. Everything on it is a fact about the raid just fought.

**P6-08 Feedback on the moments that matter.** `ui-surface.md` lists where sound, haptics and motion exist and
where they are missing. At minimum: three stars, a league promotion, a Keep upgrade finishing, a calendar or seal
claim, a look earned. Use `audio/sound.ts` and `audio/haptics.ts`; respect reduced motion and the muted state; no
new image files.

**P6-09 Everything `playthrough.md` saw.** That investigator played the first run and mid-game sessions in a real
browser and recorded every dead end, clipped or overlapping element, leaked internal id, untranslated string and
console error, each with a screenshot. Fix all of them. Each fix that can have a test gets one (a layout assertion
at 320 px, a string through `t()`, a missing handler).

**P6-10 Hard-coded English.** `ui-surface.md` lists string literals that reach the DOM outside `t()`. Move each to
the catalog. Canonical simulation and server wording is translated only at the display boundary through
`locales/runtime.ts`; never pass authored names or chat through a matcher.

Close the phase: section 13, `npm test`, lint, build, the perf scripts, screenshots of every new surface at the three sizes in
the closure record, and the note that nothing was checked on a physical device.

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

**P7-12 (backend ask of 2026-11-13) The server replays the device's entropy for the daily chest.** For a
server-held village the server substitutes its own `openDailyChest.entropy`, so the next draw cannot be chosen by a
modified client.

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
the word lists and of the festival names; an artist and music; real-player playtests of every number this pass
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
| `retention.md` | RET-03, RET-04, RET-02, RET-06, RET-07, RET-05 | P1-01, P1-02, P1-03, P1-06, P1-07, P1-08 and P5-04 |
| `retention.md` | RET-01, RET-11, RET-08, RET-09, RET-13, RET-12, RET-10, RET-14 | P5-01, P5-03, P5-05, P5-06, P5-06, P5-09, P6-05, P2-09 |
| `economy.md` | ECO-01, ECO-02, ECO-03, ECO-04, ECO-05, ECO-06, ECO-07, ECO-08 | P2-01 and P3-01, P1-01, P1-03, P3-08, P1-04, P1-05, P2-07, P2-09 |
| `economy.md` | ECO-09, ECO-10, ECO-11, ECO-12, ECO-13, ECO-14 | P5-11, P3-09, open, P3-03, P1-10, P2-08 and open |
| `defense-raids.md` | DEF-01 to DEF-13 | P2-01, P2-01, P2-04, P2-02, P2-03, P2-05, P2-12, P2-07, P2-08, P2-09, P2-06, P2-10, P2-11 |
| `pacing.md` | PAC-01 to PAC-14 | P3-01, P3-02, P3-03, P3-04, P1-06, P4-10, P4-09, P3-02, P3-06, P3-07, P5-08, open, P3-05, P3-10 |
| `combat.md` | CMB-01 to CMB-12 | P4-01, P6-02, P4-06, P4-05, P4-02, P4-04, P4-03, P4-07, P6-01, P4-11, Phase 4 preamble, P4-08 |
| `exploits.md` | XPL-* | P1-11, P0-04 |
| `built-not-live.md` | BNL-* | P4-10, P5-07 |
| `ui-surface.md` | UIS-* | Phase 6 |
| `playthrough.md` | PLY-* | P6-09 |

## Appendix B. Where the reports disagreed, and what this prompt decided

- **Is the Scroll's value estimate a strength or a defect?** One report protects it (it counts only reachable
  tiers), another shows it reaches 65 times the same-price pack. Both are right. Keep the reachable-tier logic,
  change the price basis and add the guard (P1-05).
- **Trial growth past tier 60:** 0.03 in one report, about 0.02 in another, with different last achievement steps.
  Measure both; the achievement's last step follows the measurement (P1-06).
- **What a raider carries by stars:** `[0.2, 0.5, 0.8, 1]` in the defense report, `[0.1, 0.4, 0.7, 1]` in the lab.
  The acceptance results of P2-01 decide.
- **The league win bonus:** a share of the raid's own loot in one report, a share of the Keep's lowest loot in
  another. The Keep-scaled form is chosen because it follows the reward pattern the game already uses (P2-09).
- **The league season reset:** one report would soften it, another calls it a sound loop. No measurement shows
  harm. It stays.
- **The third artisan:** one report suggests putting the hut in the starting layout. This prompt changes the model
  player instead (P3-02); the starting economy stays.
- **`battle.json` `scoutFeeByHall` and `generatedLootByHall`:** the defense report says editing them forces a rules
  bump. The code says otherwise (3.1).
- **Does defense pay?** Three earlier audits said no on the campaign's 0% held. The defense report shows that
  figure is the model's undefended village (Phase 2 preamble).

## Appendix C. Traps, collected

- The campaign's defense columns describe a village with level-1 defenses and no walls until P2-04 lands.
- `supportStrike` at 1.0, Smoke at 12 seconds, "file" and "reserve" squad orders, `defenseWin.uncapped`, a lower
  Keep 6 cost: each was measured or reasoned out and rejected. Do not rediscover them.
- A "hold N raids" goal is dishonest until Phase 2 is in and measured.
- A change to which base a seed generates must ride the rules bump (P4-07).
- A field written by `createNewVillage` or a migration is a state change even when it is empty (3.2).
- A translated sentence that says a number ("Holds 8 hours of output", "repeats every two weeks", "8 seconds",
  "30% more damage") changes in 50 languages when the number does. Make the sentence read the number where you can.
- Every new English string makes 49 languages incomplete, and about 25 test files red, until section 13 is done
  for that phase.
- An achievement tier needs its platform id; a new table needs its line in account deletion; a new metric needs its
  help line; a new server message needs its code in the catalog.
- Headless Chromium is not a phone, a model player is not a player, and a policy draft is not legal advice. Say so
  wherever you report a result.

