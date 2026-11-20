# Understand pass, 2026-11-16

Ten independent read-only investigations of the repository at commit `9bf76af`, run before any change, to answer
the owner's request: make the game far more replayable, fix its game-theory, economy and strategy problems, protect
what is excellent, and close the distance to a store release.

Nothing in the game, server or data was changed by this pass. The work it calls for is specified in
[`docs/prompts/BEAST_MODE_2026-11-16.md`](../../prompts/BEAST_MODE_2026-11-16.md), which cites these reports.

## The reports

| Report | Finding ids | Area |
|---|---|---|
| [`economy.md`](economy.md) | ECO- | Resource economy, sinks and faucets, monetization design |
| [`combat.md`](combat.md) | CMB- | Battle strategy depth and combat balance: the 50 warriors, the hero, Smoke, entry points, tempering, Rules 10 |
| [`defense-raids.md`](defense-raids.md) | DEF- | The raid loop between attacker and defender: matchmaking, loot, honor, shields, defense value, rematch, stakes |
| [`pacing.md`](pacing.md) | PAC- | Progression from the first minute to Keep 15 and the end game |
| [`retention.md`](retention.md) | RET- | Honest return hooks: tasks, chest, calendar, Season Scroll, events, achievements, Trials, leagues |
| [`publish.md`](publish.md) | PUB- | Everything between the repository and a store release that code can still do; the state of CI |
| [`built-not-live.md`](built-not-live.md) | BNL- | Content and systems that are built but switched off, and what making each live takes |
| [`exploits.md`](exploits.md) | XPL- | An adversarial hunt through the command surface, and determinism risks |
| [`ui-surface.md`](ui-surface.md) | UIS- | The player-facing surface: which rules have a screen, feedback, hard-coded text |
| [`playthrough.md`](playthrough.md) | PLY- | The first session and mid-game sessions played in a real browser, with screenshots |

Each report marks every finding as **measured** (a script ran the live code or data), **reproduced** (the defect
was triggered through the simulator), **read-in-code** (file and line) or **inferred**. Each also lists the
elements in its area that are excellent and should not change, and additions that reuse systems that already exist.

`structured/<report>.json` holds the same findings in a fixed shape: for each problem an id, severity, how it was
verified, the evidence, a proposed fix, a size and what the fix touches (`SIM_RULES`, `SAVE_VERSION`, `PROTOCOL`,
`SERVER`, `PLAYER_COMMANDS`, `I18N`, `BALANCE_GATES`, `UI`, `DATA_ONLY`, `DOCS`).

## The scripts

`scripts/<report>/` holds the one-off harnesses and their outputs, as run. They import the repository's real
simulator and change nothing.

- They hard-code the checkout path `/home/user/ninja-version-of-game-1`. Elsewhere, replace it:
  `grep -rl /home/user/ninja-version-of-game-1 docs/audit/understand-2026-11-16/scripts | xargs sed -i "s#/home/user/ninja-version-of-game-1#$PWD#g"`.
- Scripts that need a scratch folder read the `SCRATCH` environment variable (default `/tmp/kagemura-understand`;
  create it first).
- TypeScript harnesses run with
  `node --experimental-transform-types --import ./tools/balance/lab/register.mjs <script.ts>` (Node 22.18 or newer).
  The `.mjs` harnesses start Vite's server in middleware mode and load the simulator with `ssrLoadModule`, which
  lets them patch data in memory for a what-if. The `.cjs` ones are plain tables over the JSON data.
- The combat investigator's rule-change experiments ran on a scratch copy of `src/gameplay`, which was not kept.
  Re-create one to repeat them.

Each report's own first section says which script produced which table.

## Limits

- Sample sizes are small: 6 to 24 battles a cell, single-seed campaigns. A six-battle cell swings 10 to 15 points
  from one neutral change; a single-seed campaign carries about ±2 days. The reports say where a number is noise.
- Attack plans are scripted (the raid bots' plan, a best-of-six entry, a scripted Smoke policy). A person does
  better or worse.
- The playthrough ran in headless Chromium, which is not a phone.
- Model-player outcomes are not observed retention or revenue. No person has played any of this. No device, no
  signed build and no storefront was involved.

## Known corrections

- `defense-raids.md` (DEF-13) says `battle.json` `scoutFeeByHall` and `generatedLootByHall` sit inside the combat
  fingerprint. They do not: both are in the excluded set in `tests/gameplay/battle/rules-version.test.ts` and in
  `NOT_COMBAT` in `src/backend/net/dataVersion.ts`. Editing them changes the data version and the campaign
  fingerprint, not `SIM_RULES`.
- `pacing.md` (PAC-04) proposes Dojo training speeds of 2 / 2 / 1.6 / 1.3 for levels 1 to 4. The live table
  continues 1.2, 1.4, so upgrading the Dojo would slow training down; an existing test and an Army panel sentence
  also pin level 1 and 2 at speed 1. Its three-minute first raid is the tutorial's target, not what
  `firsthour.mjs` measures (the model's first raid moves from minute 18 to 16).
- `pacing.md` (PAC-13): raising the Keep 3 slack changes nothing for the regular model, whose opponent is already
  at the window's floor. (PAC-09): `trialEnd` locks every tier above the next uncleared one, so "clearing a tier
  clears the lower ones" needs a change to that lock.
- `economy.md` (ECO-04): the top-up tool at exponent 0.75 prices a raid's loot at 830 Jade at Keep 14 and 790 at
  Keep 15, which breaks an invariant of `topup.test.ts`; the tool also overwrites the training-skip table.
- `combat.md` (CMB-04): Wall Climber, Grapple Raider, Crane Glider, Thousand Needle and Siege Bombardier have an
  empty `kit`, and their cards describe their stat line truthfully. "An ability name with nothing behind it" is
  wrong.
- `defense-raids.md`: the type is `RaidsDef`, not `RaidsData`; `def_econ.ts` and `def_daily.ts` compute the proposed
  rules themselves, so they double-apply once the keys are live; the fortress gates rest on a lab run with hired
  artisans, a garrison crew of 2 and uncapped rewards; `next_offers.ts` passes no recent armies and cannot see
  `counterShare`.
- `retention.md`: the 15 task templates use 10 stats, not 9. `bountyEnd` and the goal progress hold one goal event
  of kind `bounty`; a second goal event needs more than data.
- `publish.md` (PUB-14) marks `VITE_STATS_TZ` as not needing the owner; `docs/SHIPPING.md` 3l records it as the
  owner's switch. (PUB-10): word lists cannot live under `locales/`, which `sim/` may not import. Its tables number
  six PUB findings differently from `structured/publish.json`.
- `built-not-live.md` (BNL-14) would put the preview flag in `deploy.yml`; a test forbids that.
- `built-not-live.md` section 3.4 calls five planned counters working; by the go-live gate it proposes, only two
  pass on its own numbers.
- Where two reports propose different values for the same number, the prompt's Appendix B says which was chosen and
  why.

Found by the second review of the prompt (below):

- `defense-raids.md` (DEF-01, section 2): under the proposed rules a Keep 5 base at caps still loses about 4 k a
  raid, which is −38% of a hold's reward, not a gain. The "today" reward column of `def_econ.ts` is the harness's
  own arithmetic as well, and it starts every storage full, where the game's reward is capped at what the raid took
  (−88% to −25% of a hold at caps). DEF-01 was scoped to offline raids: paid on raids by real players without
  limits, the reward can be farmed by two accounts.
- Harness limits: `pacing/trialcap.mjs` scans tiers 53 to 76 with one seed and prints the best of five fortresses;
  `defense-raids/next_offers.ts` reads the fee of the player's own Keep and never calls `scoutFee`;
  `retention/r1.mjs` counts every task template as eligible; in `combat/t10.ts` the variants that set
  `battle.warriorRules` flags need a patched copy of `src/gameplay`, while the data-only ones measure correctly
  against the real tree.
- `combat.md` (CMB-01, CMB-12): the light-support mix at Keep 10 is over the army lab's upper gate on live rules
  (92.2%, 67% three stars) before any support change. At four seeds the lab's cells move on untouched data
  (`support@7` 32.3%, `melee@8` 27.3%, the ranged-over-balanced gap at Keep 15 21.3 points).
- `pacing.md` (PAC-01, PAC-04, PAC-09): the slow suite holds the regular model's Keep 6 at 9 days or more. It is
  9.42 days today, 9.19 with the three casual keys, and exactly 9.00 with a 60-second Keep 2 and tier-1 training
  halved on top. Tiers skipped by a Trial catch-up are not counted in `stats.trialsCleared`, which the Trial Walker
  achievement reads. Nothing pins a tier-1 warrior's `trainSeconds`.
- `retention.md`: the league season is a UTC calendar month and the Scroll season is 30 days from its epoch, so
  "the season" is two things. The task-repetition figures assume every template is eligible; about six of eight
  daily templates are at Keep 15.

## How the prompt was checked

Two rounds, each by four independent reviewers working against the repository and these reports.

- First round: about 900 claims, split by part of the prompt (sections 0 to 6; Phases 2 and 3; Phases 4 and 5;
  Phases 6 and 7 with the appendices). 85 corrections: 3 instructions that could not be executed as written, 24
  major errors or omissions and 58 minor ones.
- Second round: about 1,175 checks, each reviewer reading the whole corrected prompt for one question. 82 issues:
  6 blockers, 31 major and 45 minor.

| Second-round reviewer | Checks | Issues | Blockers |
|---|---|---|---|
| Invariants and sequencing | 165 | 23 | 1 |
| Completeness against the ten reports | 445 | 23 | 2 |
| Executability, read as the agent who must do the work | 330 | 23 | 2 |
| The first round's corrections | 236 | 13 | 1 |

All six blockers were in one work item, P2-01, and were the same two problems seen from four sides: a reward for
stars denied that two accounts could farm on raids by real players, and an acceptance result with a sign error
that no value could meet. Both rounds are applied. Where two reviewers proposed different fixes for one passage,
the prompt's Appendix B says which was chosen and why. The second round added one work item (P6-19) and two
protected items (57 and 58).

What neither round did: run the campaigns, the full test suite on a changed tree, Postgres, or the Node build the
server image pins. The tests the prompt names as pinned are the ones the reviewers found, not a complete list.
