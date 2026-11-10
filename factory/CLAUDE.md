# FACTORY: the game factory (not part of the game)

`factory/` builds new games on this repository's game by calling the Claude API. It is a separate package (`factory/package.json`), outside the game's compartments, bundle, tests and Docker image. Read `factory/README.md` first.

## Rules for a session working here

- **The factory knows nothing about ninjas.** Everything it knows about the template comes from `factory.config.json` (the template slot, file lists, lanes, checks, theme words) and from reading the template at run time (`src/template/`). Never hard-code a template path, name, id or number in `src/`. A test (`tests/pipeline.test.ts`, "still match the template") fails when the settings and this repository drift apart: fix the settings.
- **The method lives in `playbook/`**, not in code. Stage prompts are the chapter plus a short ask (`src/skeleton/stages.ts`). Change how a discipline is done by editing its chapter.
- **One seam to the API:** `src/llm.ts` (`Llm.turn`). Everything else takes a `Session`, so tests and `--mock` run with `src/mock.ts`. Keep it that way: no direct SDK calls elsewhere.
- **Request layout is a contract** (`src/prompts.ts`): stable to volatile, breakpoints at the three boundaries, nothing time- or run-dependent in the cached part, conversations only ever appended to. The tests assert it.
- **The harness decides, not the session:** checks are run by `src/build/runBuild.ts`, lanes are enforced by `src/agent/tools.ts` and `enforceLane`, and reports keep verified and unverified apart. Do not weaken this to make a run look better.
- **Claude API specifics** (model ids, thinking, effort, structured outputs, fallbacks, caching, server tools) change faster than memory: check the current API reference before changing `src/llm.ts`, and keep the defaults in `factory.config.json`.
- A new stage = an entry in `STAGES`, a schema in `schemas.ts`, a chapter, and its id in `STAGE_IDS` and the config. A new standard work order = an entry in `STANDARD_ORDERS` and a line in `playbook/10-BUILD.md`.
- The root game must not depend on the factory, and a built game must not contain it (`template.exclude`; `<!-- factory:start/end -->` blocks are stripped from copied documents).

## Checks

```
cd factory
npm run typecheck
npm test
npm run go -- --mock && npm run approve && npm run build   # end to end on the real template, no API calls
```

Then delete the mock run (`runs/<id>/`) and `games/mock-game/` before committing.

## Not verified yet

No real API run has been made (see README, "What is verified"). The first one will show what to tune: record what it cost and what the sessions got wrong in `playbook/LESSONS.md`.
