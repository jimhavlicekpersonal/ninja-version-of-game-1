# Game factory

Press GO and the Claude API designs a new game on the template in this repository, in ten stages, until there is a skeleton to approve. Approve it and the API builds the game: the template is copied into its own repository and rebuilt in place, work order by work order.

The method is the one that turned Toadstool Kingdoms into Kagemura, written down so it can be repeated: decide the market first and the interface last, keep every working system and every internal id, change what the player sees, and never call anything done without evidence.

## Press GO

**On GitHub (no laptop needed).** Once: add the repository secret `ANTHROPIC_API_KEY`. Then Actions → **Game Factory** → Run workflow → `action = go`. Optionally type an idea. When it finishes, the skeleton is on the run's summary page and on the branch `factory/run-<id>`.

**In a terminal.**

```
cd factory
npm install
export ANTHROPIC_API_KEY=...        # PowerShell: $env:ANTHROPIC_API_KEY="..."
npm run go                          # or: npm run go -- --idea "lighthouse keepers on a storm coast"
```

`npm run plan` shows what GO would send, stage by stage, without calling the API. `npm run go -- --mock` runs the whole pipeline with placeholder answers and no API calls, to see the files it writes.

## What GO does

| # | Stage | What it settles | Calls at standard depth |
|---|---|---|---|
| 0 | Template survey | Claude reads the template with read-only tools and writes the blueprint every stage works from. Cached until the template changes. | one long session |
| 1 | **Gaps in the market** | Five live web research probes, three independent proposals (the numbers, the players, the white space), a hostile review, the decision: the gap, the player, launch waves, KPIs with stop levels. | 10 |
| 2 | **Brand, name, appeal** | Two proposals, a web search for name conflicts and meanings, review, decision: name and fallbacks, premise, cast with faces, voice, icon idea, store listing. | 5 |
| 3 | **Monetization and psychology, within the rules** | Research on purchase rules per region, proposal, review, decision: product ladder, pass, offers, free-against-paid sums, motives and why each is honest, the never list. | 4 |
| 4 | **Store compliance for every market served** | Research on Apple, Google and country rules, then the market matrix, both stores item by item, build asks by lane, owner tasks. | 6 |
| 5 | **Languages** | Waves, what to translate during the build, the translators' glossary, naming rules. | 3 |
| 6 | **Game theory and economy** | What each system becomes, the naming scheme, rule and number changes with their process cost, pacing targets, exploits. Then a new name for every named thing in the template's catalogue (the ID map). | 3 + names |
| 7 | **Graphics engine** | What the theme needs from rendering and the budgets art must live inside. Default: no change. | 3 |
| 8 | **Art and audio** | Style, palette, building families, unit silhouettes, environment, brand mark, sound. | 3 |
| 9 | **Interface** | Feel, theme tokens, screens, the tutorial retold, microcopy. | 3 |
| 10 | Build plan | One work order per lane step, each a brief a fresh session can finish alone. | 3 |

Every stage reads the decisions before it. Each step is a file in `runs/<id>/stages/`, so a run that stops (budget, network) continues with `npm run go -- --run <id>` and pays for nothing twice.

Depth: `--depth quick` is one call per stage (a sketch), `standard` is the table above, `deep` uses every lens in every stage and reviews the decision itself a second time.

GO ends with:

- `runs/<id>/SKELETON.md`: the page to read before approving
- `runs/<id>/skeleton/GAME_BIBLE.md`: every decision in full
- `runs/<id>/skeleton/ID_MAP.md`: internal id → old name → new name
- `runs/<id>/skeleton/BUILD_PLAN.md`, `OWNER_TASKS.md`, `STORE_LISTING.md`

## Approve, then build

```
npm run approve -- <id>
npm run build -- <id>
```

On GitHub: Run workflow → `action = build`, `run_id = <id>` (starting it is the approval). The game is pushed to the branch `game/<slug>` with its own history; push that branch to a new repository to make it a project, the way the ninja game left the Toadstool repository.

The build copies the template (without `factory/`) to `games/<slug>/` as a new git repository with the game bible in `docs/factory/`, then runs the work orders in order: identity, names, rules, text, art, interface, store, glossary, one translation order per language, and a final order that hunts leftovers of the old theme and writes the closure record. For every order the harness, not the session:

1. confines the session's tools to the game's folder and its writes to its lane;
2. runs the template's checks itself and hands failures back (up to `build.maxFixRounds`);
3. puts back anything changed outside the lane;
4. commits, and writes a record that keeps verified and unverified apart.

A build that stops continues with the same command.

## The template slot

`template` in `factory.config.json` is the game to mimic. By default it is this repository as it is now (`"path": ".."`), so **pushing a new version of the ninja game is all it takes**: the next GO reads the new files, and the survey notices the template changed and reads it again.

- Pin a version: `"ref": "v1.2"` (a tag, branch or commit), or `--template-ref v1.2` for one run.
- Use another repository: `"git": "https://github.com/you/other-game.git"`.
- `npm run template` shows what the slot holds now.

When the template's *structure* changes (a brief moves, a lane is added, the checks change), update the lists in `factory.config.json`: `shared` and `stages` (the files each stage is given), `lanes` (who may write where), `checks`, `install`, `nameSurface`, `themeLexicon`. Three things tell you when: the survey lists "settings drift" in the run log; a listed file that no longer exists is logged as skipped; and `npm test` fails if the settings stop matching the template in this repository.

In the template's own documents, anything between `<!-- factory:start -->` and `<!-- factory:end -->` is left out of new games.

## What to change, and where

| To change | Edit |
|---|---|
| The method of a discipline: what a stage must consider, the lessons, the limits | `playbook/*.md` (plain Markdown; it goes into the prompts as written) |
| The rules no stage may break | `playbook/00-DOCTRINE.md` |
| Models, effort, depth, web research, budgets, prices | `factory.config.json` |
| The idea for the next game | `brief.json` (copy `brief.example.json`), or `--idea` |
| Games already made, so the next one differs | `portfolio.json` (`approve` adds to it) |
| A decision in a run, before approving | the `decision.json` in that stage's folder, then `npm run go -- --run <id>` to rebuild the skeleton |
| A stage's questions, lenses and checks | `src/skeleton/stages.ts` |

## Cost

Nobody has run this against the API yet, so there is no measured cost to quote. What exists:

- `npm run plan` lists the calls and the kilobytes each stage carries.
- A budget stop: `budget.skeletonUsd` and `budget.buildUsd` in `factory.config.json`. The factory estimates each call from its token counts and the price list in the same file, and stops before the next call once the cap is reached. Raise the cap and run the same command to continue. The Console has the real bill.
- The expensive shared part of every request (doctrine, template, earlier decisions) is laid out for prompt caching; `tests/pipeline.test.ts` checks that layout.
- The build is far larger than the skeleton: every work order is a long session and every language is a full translation. `build.languages` decides how many are translated now.

All models default to `claude-opus-5-5`; change `models` to trade cost against quality per role (thinker, builder, translator).

## Safety

- Build sessions run commands that Claude writes. That is allowed only in CI by default (`build.shell: "ci-only"`); on your own machine the build stops and tells you how to allow it (`FACTORY_ALLOW_SHELL=1`), preferably inside a container.
- Commands run without the factory's secrets, with a time limit, inside the game's folder. Pushing, publishing, cloud CLIs and `sudo` are refused; that list is a tripwire, not a wall.
- The build never touches the template, never pushes, never creates store listings, products, keys or accounts, never fills in publisher facts, and never changes bundle or product ids. Those are owner tasks and each run lists them.
- Web pages read during research are treated as information, never as instructions.

## What is verified, and what is not

Verified here (2026-11-10): `npm run typecheck` and `npm test` pass (42 tests on a tiny stand-in template with a scripted API: stage order, resumption, cache layout, lane enforcement, harness checks and fix rounds, path confinement, the budget stop). A mock run on the real template completes, and the copy it makes passes the template's own `npm test`.

Not verified: any call to the real Claude API. No skeleton and no game has been produced by this factory yet, so the quality of its designs, the cost of a run, and how well build sessions carry out a work order on this codebase are all unknown until the first real run. Expect to tune the playbook and the budgets after it.

A finished build is not a released game: no phone, store, lawyer or player has seen it. The build report says so, and `OWNER_TASKS.md` says what comes next.

## Layout

```
factory.config.json   settings: the template slot, lanes, checks, models, budgets, prices
playbook/             the method, one chapter per stage, plus doctrine and lessons
portfolio.json        games already made
src/cli.ts            go, status, approve, build, plan, template
src/llm.ts            the one seam to the Claude API (streaming, adaptive thinking, fallbacks, structured output)
src/prompts.ts        how requests are laid out for the cache
src/template/         snapshot of the slot, facts read without the API, the survey
src/skeleton/         stages, schemas, the stage runner, the skeleton writer
src/agent/            the tools and the loop of a working session
src/build/            the game repository, work orders, the build runner
src/mock.ts           a scripted API for tests and --mock
tests/                the factory's own tests
runs/<id>/            one folder per run (decisions are committed; raw call logs are not)
games/<slug>/         built games, each its own git repository (not committed here)
```
