# Architecture: three compartments that separate AI sessions can upgrade

## What the research says (and what we took from it)

| Finding | Source | How Kagemura applies it |
|---|---|---|
| Strategy games sync **commands, not state**: same command + same state = same result, which needs full determinism. | [Archon Engine multiplayer notes](https://forgottenhistory.github.io/Archon-Engine/Docs/Engine/multiplayer-architecture.html), [Lua netcode chapter](https://birdor-blog.pages.dev/lua-game-dev-ch16/) | Battles replay from `seed + deployments`. Smoke Bombs ride the same stream, and the server re-simulates every attack. |
| Lockstep breaks on spiky mobile networks; server-validated deterministic progression is a better fit for mobile. | [Ruoyu Sun, *Lockstep*](https://ruoyusun.com/2019/04/06/game-networking-3.html), [Aalto thesis on Metaplay](https://aaltodoc.aalto.fi/items/5c9f2fc9-9cd0-40d9-82e7-a4600ef83925) | Battles are asynchronous: played locally, re-checked by the server. No live lockstep. |
| Modules should talk only through **public interfaces**, enforced by tooling that fails the build. | [Sheriff](https://github.com/softarc-consulting/sheriff), [Nx module boundaries](https://nx.dev/tutorials/2-react-monorepo/2r-smart-monorepo/11-module-boundaries), [modular monolith lesson](https://techlead-6ub.pages.dev/learn-software-architecture/modular-monolith) | `compartments.json` lists each compartment's contract files. `tests/architecture/boundaries.test.ts` fails CI on any other cross-compartment import. It's a plain test, so no new dependency. |
| Architecture rules can live as **tests** in the normal suite. | [module boundary enforcement guide](https://platform-django-template.readthedocs.io/en/latest/_sources/4-guides/module-boundary-enforcement.rst.txt) | The same approach as the existing `purity.test.ts`. |
| Parallel AI agents work best with **directory ownership**, a short per-directory brief, contract-first changes, separate branches or worktrees, and only a few agents at once. | [Running parallel Claude Code agents](https://medium.com/@koriigami/running-parallel-claude-code-agents-on-a-single-codebase-927d70e7349d), [agent team workflows](https://mindstudio.ai/blog/claude-code-agent-teams-parallel-workflows), [DEV: parallel agents](https://dev.to/subprime2010/claude-code-parallel-agents-how-to-run-multiple-ai-instances-on-the-same-codebase-5ggn) | Each compartment has a `CLAUDE.md` brief. `AGENTS.md` gives the session playbook. One branch per session. Contract changes go through an INTEGRATION session. |

Sources are practitioner blogs and one thesis, not formal standards. The rules above are also tests in this repo, so they hold whatever the sources say.

## The three sections

```
src/
  presentation/            SECTION 1  Art, GUI, animation        (ART AI, GUI & INTERACTION AI)
    art/                     procedural art + palette (ninja.ts), ground, toolkit
    audio/                   synthesized music and sound effects
    render/                  Phaser scenes, camera and touch input, effects, asset keys, art loader
    ui/                      DOM HUD, battle HUD, tutorial, menus, styles
  gameplay/                SECTION 2  Game theory, mechanics, user commands  (GAME THEORY AI)
    data/*.json              every balance number, the roster and the progression model
    sim/                     pure deterministic rules: village, battle, trials, progression, matchmaking...
    control/                 GameController (command dispatch, saving) and BattleSession (live battles)
  backend/                 SECTION 3  Connectivity, monetization, store compliance  (BACKEND AI)
    net/                     protocol, HTTP adapter, connection + outbox
    social/                  GroveSource: bot Alliance offline, real Alliance online
    payments/                PaymentProvider: mock, StoreKit, unavailable (Android)
    platform/  persist/  analytics/  pwa/
  main.ts, app.ts          composition root: wires the sections together (INTEGRATION only)
server/                    SECTION 3  Fastify + Postgres PvP server (re-simulates battles)
tools/                     art gallery, progression doc generator
tests/                     mirrors the sections; tests/architecture enforces the boundaries
```

### Dependency rules (enforced)

```
presentation ──► gameplay (read state, send commands)      presentation ──► backend contracts only
backend      ──► gameplay (types, re-simulation)           backend ──► control contract (dispatch)
gameplay/sim ──► nothing outside gameplay  (pure: no Phaser, no DOM, no Date.now, no Math.random)
root         ──► anything
```

A compartment's **contract files** (`compartments.json`) are its public API. Changing one is an interface change: it needs an INTEGRATION session (see `AGENTS.md`).

### Why the user-input split works

"Play the game" input has two halves. **What a tap means** (deploy here, throw smoke, upgrade this) is a command in `gameplay` (`Command` union, `BattleSession.tryDeploy`), so the GAME THEORY AI owns it and tests it without a screen. **How the tap is captured and shown** (gestures, camera, buttons, feedback) is in `presentation/render` and `presentation/ui`, owned by the GUI & INTERACTION AI. Neither can break the other without changing a contract file.
