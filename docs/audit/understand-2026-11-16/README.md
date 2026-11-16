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
- Where two reports propose different values for the same number, the prompt's Appendix B says which was chosen and
  why.
