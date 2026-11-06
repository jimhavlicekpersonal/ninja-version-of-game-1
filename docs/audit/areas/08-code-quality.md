# Code-quality / efficiency / anti-slop audit — Kagemura (`/home/user/ninja-version-of-game-1`, HEAD `2a4b222`)

Read-only; nothing in the repo was modified. Scratch scripts and the JSON test report are under `(session scratchpad, not in the repo)/agent-quality/` (`ast-stats.mjs`, `dups.mjs`, `cycles.mjs`, `unused-exports.mjs`, `vitest.json`).

## Key measurements

| Metric | Value |
|---|---|
| Tracked files / size | 664 files, 24.3 MB (14.2 MB is 39 binaries: splash PNGs, icons, fonts, `dump.rdb`) |
| LOC: gameplay sim / control / data(JSON) | 9,435 / 717 / 20,387 |
| LOC: presentation art / audio / render / ui | 4,829 / 531 / 3,565 / 7,386 |
| LOC: backend (client) / server (excl. archive) / `server/rules/v3` archive | 6,294 / ~12,900 / 28,953 (65 files, verbatim copy of sim+data) |
| LOC: tests / tools / docs / locales | 16,779 / 2,932 / 14,185 (42 .md) / 32,661 (50 worksheets, 49 empty) |
| Tests | 117 files, 1,041 tests (1,027 pass, 14 skipped by env, 1 file whole-skipped), 93.7 s wall; critical path `policies.test.ts` 51.7 s |
| Largest files | `art/ninja.ts` 2,647 · `ui/hud.ts` 2,160 · `server/repo.ts` 1,906 · `sim/village.ts` 1,770 · `server/pgRepo.ts` 1,516 · `net/protocol.ts` 1,109 · `net/connection.ts` 1,071 · `art/warriorIcons.ts` 1,004 · `render/BattleScene.ts` 935 · `sim/types.ts` 911 · `battle/battle.ts` 909 · `render/VillageScene.ts` 815 · `src/main.ts` 746 · `art/ground.ts` 649 · `server/core/pvp.ts` 633 |
| Longest functions (body lines) | `main.ts boot` 508 · `ground.ts paintGround` 481 · `server/app.ts buildServer` 411 · `village.ts runCommand` 222 (60 cases) · `ninja.ts ninja` 206 · `armyUi.ts open` 175 · `server/main.ts main` 165 · `hud.ts openSettings` 164 · `app.ts open` 155 · `BattleScene.update` 155 · `save.ts migrate` 151 · `qr.ts qrMatrix` 150 · `basegen.ts generateOpponent` 145 |
| `tsconfig` strict | yes (`strict`, `noUnusedLocals/Parameters`); `noUncheckedIndexedAccess: false` → 2,013 errors if enabled; `exactOptionalPropertyTypes` → 109 |
| `any` (AST) | **0** in src+server; `as unknown as` 35 src (18 in `sim/data.ts` JSON casts) + 6 server; `as never` 35 server (33 in `app.ts` on `req.body`); non-null `!` 143 (src+server) |
| `@ts-ignore`/`@ts-expect-error` | 0 |
| Empty catch blocks | 0 bare; 24 comment-only (all reasoned: storage blocked, already closed, etc.); 168 catch clauses total |
| `console.*` in src/server | 47 (16 in `server/main.ts` startup; 6 in `src/main.ts`; rest warn-on-failure) — low noise |
| TODO/FIXME/HACK | 1 real (`battleHud.ts:316`) |
| Duplicate 8-line windows (src+server, excl. archive) | **4** (near-zero duplication) |
| Import cycles (SCCs) | src: 3 (`battle.ts↔warriors.ts↔fortifications.ts` value cycle; `economyUi↔ageScreen`; `connection↔groveSource` type-only); server: 1 (`core/pvp.ts↔core/village.ts`) |
| Unreferenced exports | src: 20 unused anywhere, 196 only used in own file (45 are functions/consts); server: 1 unused, 75 own-file-only |
| Magic numeric literals in `sim/*.ts` (excl. 0/1/2, comments) | 417 (`basegen.ts` 61, `social/grove.ts` 27, `save.ts` 27, `battle.ts` 18, `pathfind.ts` 17) |
| Bundle | one main chunk 1,476.8 kB (422 kB gzip) + 3 tiny Capacitor web chunks; CSS 50 kB; `chunkSizeWarningLimit: 2000` silences the warning. Custom Phaser build is effective (Tilemap/Arcade/Matter/Sound/Spine/BitmapText absent) |
| Server bundle | `main.js` 314 kB + chunks 1.0 MB (incl. archived rules 333 kB) |
| Lint/format | none (no eslint/prettier/biome/editorconfig); 934 lines >160 chars, 147 >250 chars (`hud.ts` 105, `pgRepo.ts` 82) |
| Comment density | sim/backend/server-core 16–17 %; UI 7 %, art 8 %; `server/inProcess.ts` 2 %, `pgRepo.ts` 4 % |
| Docs required reading for a new session | CLAUDE.md 5,238 words + AGENTS 786 + WORLDWIDE_AUDIT 7,263 + compartment brief 0.9–3.4k (+ ROADMAP 9,473, PROTOCOL 7,128, SHIPPING 5,766, HANDOFF 2,654 by reference) ≈ 47k words |

## Findings

### A. Repo hygiene / stale branding

**1. [High, VERIFIED] `package.json` and lockfile still named/described as Toadstool Kingdoms.** `package.json:2-4` `"name": "toadstool-kingdoms"`, `"description": "Toadstool Kingdoms - an original cartoon-fantasy base-building and raiding game."`; `package-lock.json:2` same name; every `npm` log line prints `toadstool-kingdoms@0.1.0` (see build/test logs). Also `.github/workflows/android.yml:66` artifact name `toadstool-kingdoms-android-apk`. Bundle id `com.toadstoolkingdoms.app` (capacitor.config.ts:11, android `build.gradle:6,9`, `strings.xml:5-6`, Java package `android/app/src/main/java/com/toadstoolkingdoms/app/`, `ios-testflight.yml:17`) is documented as an owner step, fine; but name/description are not. Fix: rename to `kagemura`, rewrite description; keep `/v1/hello` `name: 'toadstool-kingdoms'` only if the contract test depends on it (it is documented as intentional in PROTOCOL.md).

**2. [High, VERIFIED] A Redis dump is committed at the repo root.** `dump.rdb` (965 B, "Redis RDB file, version 0010"), added in commit `9ee1d40` ("server hardening… RedisDown alert") — a local `redis-server` wrote it into cwd during a test run. `.gitignore` lacks `*.rdb`. Fix: `git rm dump.rdb`, add `*.rdb` and `appendonly*` to `.gitignore`.

**3. [Medium, VERIFIED] 49 of 50 locale worksheets are 100 % empty yet committed (3.4 MB, 32,661 lines).** `npm run i18n:status`: every language `0 / 648`; each `locales/<code>/data.json` repeats the full English string beside an empty `"text"` (e.g. `locales/es/data.json:2`). The game does not read `locales/` (CLAUDE.md). Fix: commit only `en` + `languages.json`, generate worksheets on demand (`i18n:next` already can), or keep worksheets without the duplicated `en` column.

**4. [Medium, VERIFIED] `server/rules/v3` is a 28,953-line verbatim copy of the live sim + data (65 files, incl. a second 216 kB `troops.json`), and it was edited after the snapshot.** `src/backend/CLAUDE.md:11` says archives are "made by `npm run rules:snapshot` … and never edited", but `git show --stat ad52840 -- server/rules/v3` shows `server/rules/v3/engine.ts` changed ("archived-rules typing"). `diff -r src/gameplay/sim server/rules/v3/sim` = 629 changed lines, so the archive is already ~98 % identical to live. Fix: keep the archive out of `tsc`/review surface (it is excluded from the tests' AST but not from the server tsconfig include glob), add a test that the archive matches its snapshot commit, or store archives as a built artifact rather than source.

**5. [Low, VERIFIED] Generated files are committed and regenerated by tools that also write into `src/gameplay/data`.** `tools/progression/rolecut.mjs:20,32` rewrites `troops.json`/`progression.json`; `tools/balance/topup.mjs:62` → `store.json`; `midkeep.mjs:36` → `buildings.json`; `tools/progression/generate.mjs` → `docs/game-theory/ROSTER.md`, `docs/art/ICON_MANIFEST.{json,md}` (299 kB JSON). None carry a "generated — do not hand-edit" marker inside the file (`troops.json` starts straight with `hedgehog_roller`). Risk: an AI session hand-edits a number that a tool later silently overwrites. Fix: add a `$comment`/header line in each generated file and a test that running the generator is a no-op.

**6. [Low, VERIFIED] No linter or formatter.** No eslint/prettier/biome/editorconfig anywhere; `package.json` has no lint script. Consequences visible: 934 lines >160 chars, 147 >250 chars, inconsistent one-line vs multi-line `catch` style. For a multi-session AI codebase a formatter is the cheapest consistency guard. Fix: add Prettier (printWidth 140 to match current style) + a minimal ESLint (`no-unused-vars` off, `@typescript-eslint/no-non-null-assertion` warn), run in `deploy.yml`.

**7. [Low, VERIFIED] `tsconfig` strict but `noUncheckedIndexedAccess` off (2,013 errors if on).** Most index reads into `Record<string, …>` from JSON data are unchecked; the code compensates with `!` (143) and `?.` (e.g. `village.ts:1387 sb.loot[k]!`). Not worth a flag flip, but new sim code should be written as if it were on.

### B. Documentation drift (contradicts code)

**8. [High, VERIFIED] Compartment briefs state the wrong protocol / rules versions.** Code: `PROTOCOL_VERSION = 9` (`src/backend/net/protocol.ts:30`), `SIM_RULES = 4`, `MIN_PROTOCOL = 7`. `src/backend/CLAUDE.md:7` "Game versions (Phase 1.5, protocol **8**…)" and `:14` "`PROTOCOL_VERSION` (now **8**…)". `docs/PROTOCOL.md:6` "Rules 3 plays every rules 2 battle exactly, so servers list `supportedRules: [3, 2]`" (rules 2 is retired, rules 4 is live per root CLAUDE.md); `docs/PROTOCOL.md:21` "`X-Protocol` (7)". These briefs are the *only* file a compartment session reads first.

**9. [High, VERIFIED] `docs/history/HANDOFF-2026-11-02.md` is frozen at 2026-11-02 while CLAUDE.md names it "state of the build".** `:25` "Save v9 → v10" (now v16), `:26` and `:102` "protocol 6", `:28` "**6 warriors live**" and "34 buildings" (root CLAUDE.md: all 50 warriors live, 54 buildings), `:32` "42 files, 286 tests" (now 117 / 1,041). Fix: either mark HANDOFF as historical (move under `docs/history/`) or regenerate its numbers; CLAUDE.md should point to one living status file.

**10. [Medium, VERIFIED] `AGENTS.md` prescribes request files that do not exist.** `AGENTS.md:30-31` route GUI→GAME THEORY via `docs/game-theory/REQUESTS.md` and anyone→BACKEND via `docs/backend/REQUESTS.md`; `src/gameplay/CLAUDE.md:47`, `src/presentation/CLAUDE.md:12` and `battleHud.ts:316` (`TODO(GAME THEORY, docs/game-theory/REQUESTS.md)`) refer to them. Only `docs/art/REQUESTS.md` (18 lines) exists. The cross-compartment communication channel the scheme depends on is broken.

**11. [Medium, VERIFIED] Doc sprawl and churn: 42 Markdown files, ~47k words of "required" reading; root `CLAUDE.md` changed in 37 of 95 commits, `src/backend/CLAUDE.md` in 31, `PVP_ROADMAP.md` in 29.** Root CLAUDE.md (5.2k words) duplicates the audit tables ("Balance pass (20 fixes)", "Gameplay audit (37)", "Army overhaul (21)") that also live in HANDOFF/WORLDWIDE_AUDIT. Each compartment brief repeats WORLDWIDE_AUDIT instructions verbatim. Fix: root CLAUDE.md = invariants + pointers only (≤1.5k words); move change logs to `docs/history/`; keep a single `STATUS.md` with the current save/protocol/rules/test numbers generated by a script.

**12. [Low, VERIFIED] Stale "Elder Toadstool"/"hall" vocabulary in comments and tools.** 18 doc comments in `src/gameplay/sim` + server core say "Elder Toadstool level" (`village.ts:360,369`, `matchmaking.ts:4,23,41,156`, `research.ts:36`, `ranks.ts:51`, `preview.ts:11`, …); `tools/balance/playerModel.ts` 7×; `progression.test.ts` test title "Elder Toadstool 6 takes about two weeks". User-facing strings are clean (checked `src/presentation`: only `Clan Keep`, `Jade`, `honor` appear in literals; `trophies`/`moonstones`/`hall` only as identifiers). Fix: comment-only rename to "Keep" (identifiers stay, per ID_MAP).

**13. [Low, VERIFIED] README dated "11/2/2026", says "Phase 6" and points to HANDOFF as the status page (see 9).**

### C. Dead code / over-exporting

**14. [Medium, VERIFIED] 20 exports referenced nowhere in src/server/tests/tools.** `protocol.ts`: `RegisterRequest`, `RenameRequest`, `CreateGroveRequest`, `PostChatRequest`, `CreateRequestRequest`, `AckRequest`, `SignInRequest`, `BlockRequest`, `RaidTicketRequest`, `RaidClaimRequest` (request types the adapters never use — routes pass inline bodies, so the "protocol" types don't actually type the protocol); `sim/defense.ts: shieldThreshold`; `goalEvents.ts: goalEventByKey`; `progression.ts: battleMasteryXp, buildingUpgradeSeconds, buildingStage`; `types.ts: PassReward`; `art/toolkit.ts: occlude, roundRectPath, softDiamondPath`; `ui/icons.ts: IconName`; `server/core/identity.ts: cleanName`. Plus 45 functions/consts in src exported but used only in their own file (e.g. `villageSync.ts: newDeviceId, BATCH_SIZE, FLUSH_AT`; `httpAdapter.ts: localTokenStore`). `noUnusedLocals` cannot see these. Fix: delete the 20; un-export the 45; add `tsc --noEmit` with `ts-prune`-like script (the scratchpad `unused-exports.mjs` works) to CI.

**15. [Low, VERIFIED] `src/backend/net/ports.ts` declares 9 port interfaces (`IdentityPort`, `PvpPort`, `GrovePort`, … `AccountPort`) that nothing outside the file references;** the adapters implement the aggregate `ServerPort` (`inProcess.ts` 89 methods, `httpAdapter.ts` 96 methods, `Routes` has 74 entries). The sub-ports are documentation, not seams.

### D. Oversized units / God objects

**16. [High, VERIFIED] `server/repo.ts` `Repo` interface has 174 async methods, implemented twice (`MemoryRepo` ~940 lines, `PgRepo` 1,516 lines, 4 % comments).** Every new feature adds a method to the interface and two implementations; the Postgres variant is only exercised when `TEST_DATABASE_URL` is set (3 describe blocks skipped here). This is the largest maintainability liability in the server: a session adding a feature must touch 3 files of 1.5–1.9k lines. Fix: split by aggregate (players, villages, battles, social, purchases, moderation) into separate repo interfaces/files; the memory implementation can be generated from the same per-aggregate shape.

**17. [High, VERIFIED] `src/presentation/ui/hud.ts` (2,160 lines, 65 methods, 11 `open*` panels, 105 over-long lines) is still the catch-all after `armyUi`/`economyUi`/`friendsUi` were split out.** `openSettings` is 164 lines, `renderSheet` 137, `accountBlock` 106, `onlineSection` ~100, `buildSkeleton` 107. Settings/account/online/recovery/notices belong in a `settingsUi.ts` like the other splits.

**18. [Medium, VERIFIED] `src/main.ts boot()` is a 508-line function with 28 nested closures** (debug time, storage fallback, push, analytics, idle FPS, session-break modal, friend link, recovery…). `app.ts open()` 155 lines. Composition-root code that is untestable (`tests/` has no test importing `main.ts`). Fix: extract `installIdleLimiter`, `installSessionReminder`, `wireFriendLink`, `installStorage` etc. into `src/backend/platform/*` or `src/presentation/ui/*` modules with unit tests.

**19. [Medium, VERIFIED] `server/app.ts buildServer()` 411 lines registers 108 routes inline with 0 Fastify schemas and 33 `req.body as never` casts** (`app.ts:353,356,359,364,…`). Validation is done field-by-field inside core (e.g. `friends.ts:293-300` checks `findable`), which works but means the request *types* in `protocol.ts` are never enforced at the edge — anything not explicitly checked in core flows through typed as if validated. SUSPECTED risk for less-defensive handlers. Fix: a tiny `body<T>(req, guard)` helper or Fastify JSON schemas per route; drop the `as never`.

**20. [Medium, VERIFIED] `village.ts runCommand` is a 222-line, 60-case switch; `save.ts migrate` 151 lines of sequential `if (v < n)` blocks; `basegen.ts generateOpponent` 145 lines with 61 magic literals.** The switch is a fine dispatcher but the file is 1,770 lines; `basegen.ts` encodes layout archetype numbers (ring radii, wall counts) in code rather than `battle.json`, contradicting the "all numbers are in JSON" rule stated in CLAUDE.md.

**21. [Low, VERIFIED] `art/ninja.ts` 2,647 lines and `ground.ts paintGround` 481 lines.** Procedural art is inherently long, but `ninja.ts` holds roof painters, kamon, warriors, ruins, skins and the level→tier tables (`:1720,1763`) in one file; per-family files (roofs, keep, defenses, warriors, ruins) would let the ART session work without loading 2.6k lines.

### E. Cycles / boundaries

**22. [Medium, VERIFIED] Value-level import cycle in the battle core:** `battle.ts → fortifications.ts → warriors.ts → battle.ts` (also `battle.ts → warriors.ts`). Works today because the imports are functions called after module init, but it is why `warriorActions` has to be threaded as a parameter (`beforeWarriorAction(sim, t, warriorActions)`), and any top-level constant use across the cycle would break at load. Server: `core/pvp.ts ↔ core/village.ts`. Client: `economyUi.ts → ageScreen.ts → economyUi.ts`. Fix: move shared helpers (`dist`, `rect`, `airborne`, `sabotageable`, `inSmoke`) to `battle/geometry.ts`/`battle/state.ts`.

**23. [Low, VERIFIED] The boundaries test is real but permissive where it matters least.** `tests/architecture/boundaries.test.ts` enforces `compartments.json`; however `gameplay.contracts = "*"` and `gui.mayImport = [gui, art, gameplay, control, backend]`, so UI may import any sim internal (it does: `groveUi.ts:8-10`, `dailyUi`, `battleHud` import deep sim modules), and `server/` is inside `backend` so it may import any sim file. The test prevents art↔backend and sim→anything leaks, nothing else. It also does not catch the cycles above. Fix: list real gameplay contract files (`controller.ts`, `types.ts`, `data.ts`, `battle/types.ts`), and add a cycle check (the scratchpad `cycles.mjs` is 30 lines).

### F. Tests

**24. [Medium, VERIFIED] Three model-player tests dominate wall time: `policies.test.ts` 51.7 s (2 tests), `progression.test.ts` 27.5 s, `gang-war.test.ts` 25.4 s = 105 s of 165 s total CPU; suite wall 94 s is set by `policies.test.ts` alone.** They are valuable (real battles) but run on every `npm test` and in `deploy.yml`. Fix: tag them (`describe.concurrent` inside the file so the two 26 s campaigns overlap; or move to `npm run test:balance` run on data changes/CI nightly), and enable vitest `isolate: false` (vitest itself reports ~4.7 s saved).

**25. [Medium, VERIFIED] Wall-clock timing assertions that can flake on a loaded CI runner:** `tests/gameplay/battle/perf.test.ts:19` `expect(ms / ticks).toBeLessThan(2)`; `tests/backend/server/resim.test.ts:165` `expect(maxGap).toBeLessThan(150)` (event-loop gap measured with a 5 ms `setInterval` while 4 worker battles run); `reaudit-integrity.test.ts:167` `toBeLessThan(200)` on `applyCommand`. 7 real `setTimeout` sleeps (`redis.test.ts:62,97` 20/60 ms). Fix: assert relative to a warm-up baseline or move to `npm run perf:*` scripts; keep correctness assertions, drop ms thresholds from the default suite.

**26. [Low, VERIFIED] 14 tests + 1 file are skipped in this environment (Postgres/Redis/IPv6 gated: `migrate.test.ts:98`, `repo.test.ts:283,309`, `push.test.ts:130`, `instances.test.ts:24`, `redis.test.ts:53`, `network.test.ts:12`).** `PgRepo` (1,516 lines) therefore has no coverage in the default CI run (`deploy.yml` runs `npm test` without services; `server.yml` contract tests run post-deploy). Fix: add a Postgres+Redis service container to `server.yml`'s test job.

**27. [Low, VERIFIED, positive] No tautological tests found:** 0 `expect(true)`, 0 snapshots, only 2 files use `vi.mock` (Capacitor fakes in `android-native.test.ts`, `touchInput.test.ts`), 11 `toBeDefined()` lines. `rules-version.test.ts` pins `{rules: 4, fingerprint: '9632dce7'}` — a deliberate tripwire, not a self-snapshot. Presentation has 10 test files; DOM panels are untested by design (documented).

### G. Performance

**28. [Medium, SUSPECTED (bench-backed)] Battle sim per tick is O(defenses × troops × supportTroops).** `battle.ts:660-700 stepDefense` builds `ok(t)` which calls `isHidden`, `inSmoke` and `auraStrength(sim,t,'veil')` for every troop for every defense every tick; `auraStrength` (`warriors.ts:30-42`) scans `sim.supportTroops` with `kitOf` and a distance each call; `stepTroop:547` calls `auraStrength(...,'haste')` twice per troop per tick; `chooseTarget:480` scans all buildings with `distToRect` (fine). The server bench (CLAUDE.md) measured ~0.45 s p95 per re-sim at Keeps 8–15 — enough that the roadmap needs a worker pool. Fix: compute per-tick caches once in `step()` (set of smoke-covered troops, aura strengths per troop, hidden flags), then `stepDefense` is a lookup. Expect 3–5× on big battles; `perf.test.ts` already logs ms/tick.

**29. [Low, VERIFIED] `structuredClone` of the whole village in `advance()` (`village.ts:285`) and `defense.ts:277`, plus JSON round-trips per command in `villageSync.ts:162` and `serverEconomy.ts:26`.** Not per-frame: `VillageScene.update` calls `controller.tick()` at most every 250 ms and `tick()` early-returns unless a timer is due (`controller.ts:430`), so cost is bounded. Noted as fine; keep the guard.

**30. [Low, VERIFIED] `BattleScene.update` redraws a `Graphics` health bar for every damaged building and troop each frame (`BattleScene.ts:706-709 drawBar`) and calls `this.textures.get`/`ruinTexture` inside the per-building loop; `sim.buildings.forEach` + `sim.troops.forEach` closures allocate per frame.** Minor on a Pixel 7; worth a dirty-flag (`v.lastHp !== b.hp`) on the low profile.

**31. [Medium, VERIFIED] One 1.48 MB client chunk; no code-splitting of rarely used UI.** All of Friends, Gangs, Store, Settings, Codex, daily chest, QR (`qr.ts qrMatrix` 150 lines), tutorial and the 1,004-line `warriorIcons.ts` are in the first download that the audit says must work "on one bar". Only `@capacitor/app` is a dynamic import (`main.ts:614`). `chunkSizeWarningLimit: 2000` hides Vite's warning. Fix: `import()` the panels from `hud.ts` `open*` methods; the PWA precache (`sw.template.js`) can still prefetch them in the background.

**32. [Medium, VERIFIED] The server Docker image installs Phaser (148 MB) and all seven `@capacitor/*` packages.** `Dockerfile:18-20` runs `npm ci --omit=dev` from the shared `package.json`, whose `dependencies` mix client (`phaser`, `@capacitor/*`) with server (`fastify`, `pg`); `vite.server.config.ts` bundles everything except node builtins/externals anyway. Fix: a `server/package.json` with only `fastify`, `pg`, `unicode-segmenter` for the runtime stage (or `npm ci --omit=dev --omit=optional` after moving client deps to `optionalDependencies`/a workspace).

### H. Error handling / typing escape hatches

**33. [Medium, VERIFIED] `applyDefenseLosses` swallows any exception from `runBattle` (`village.ts:1382-1390`), including sim bugs, and silently takes all loot from storage.** The comment says "A record this version cannot simulate", but `replayable(record)` exists (`battle.ts:41`) to express exactly that; a thrown error from a current-rules record is a bug that will never be seen. Fix: `if (!replayable(record)) { fallback } else runBattle(...)` with no try/catch, or at least `console.warn`/analytics in the catch. The other 23 comment-only catches are legitimate (storage/private mode/URL parse).

**34. [Low, VERIFIED] JSON data typing is asserted, not checked:** `sim/data.ts:23-25` casts every data file `as unknown as GameData[...]` (18 casts). `tests/gameplay/sim/data.test.ts` covers integrity, so this is acceptable, but a session that adds a field to a JSON file gets no compile error if the TS type disagrees.

### I. The compartment scheme

**35. [Medium, VERIFIED] "One AI session per compartment" has produced the structure it promised (0 `any`, 4 duplicate windows, clean boundaries test) but its coordination layer is where the rot is:** the request files don't exist (10), the briefs disagree with code on versions (8), the root brief grew to 5.2k words of change log (11), contract lists in `compartments.json` are either everything (`gameplay: "*"`) or too thin to matter (23), and 9 of the last 95 commits are "WIP" integration dumps (`git log`), meaning compartments were in practice integrated by one session that edited everything (e.g. `ad52840` touches sim, server, migrations and the archived rules). Cost going forward: every new session pays ~47k words of reading, much of it contradictory, before writing a line.

## Big-picture assessment

Code health is unusually good for an AI-built repo of this size: strict TypeScript with zero `any`, no `@ts-ignore`, no bare empty catches, near-zero copy-paste duplication, almost no TODOs, logging restrained, dependencies all used, lockfile consistent, custom Phaser build actually trimmed, boundary test real, 1,041 tests that are substantive (real battles, real worker threads, fake-timer-driven network tests). The weaknesses are not "slop" in the code but **accretion and drift around it**: a few God files (`repo.ts`/`pgRepo.ts` 174-method interface ×2, `hud.ts`, `main.ts boot`, `village.ts`, `ninja.ts`), a 29k-line archived copy of the sim inside `server/`, 3.4 MB of empty translation worksheets, a stray Redis dump, a package still called `toadstool-kingdoms`, and ~47k words of overlapping documentation whose version numbers no longer match the code — the exact things the next AI session will read first and trust. Performance risk concentrates in one known place (the O(n²·m) battle tick) which the team already measured; the client bundle is a single 1.5 MB chunk despite the "one bar" goal.

## Top 10 cleanups (priority order)

1. Fix the briefs: `src/backend/CLAUDE.md` protocol 8→9, `docs/PROTOCOL.md` supportedRules/rules text, HANDOFF.md either archived or regenerated; create the missing `docs/game-theory/REQUESTS.md` and `docs/backend/REQUESTS.md` (or delete the references). (findings 8, 9, 10)
2. `git rm dump.rdb`; add `*.rdb` to `.gitignore`; rename `package.json` name/description to Kagemura. (1, 2)
3. Shrink root `CLAUDE.md` to invariants + pointers; move the three audit tables to `docs/history/`; add a generated `STATUS.md` (save/protocol/rules/test counts) with a test that it matches the constants. (11)
4. Cache per-tick aura/smoke/hidden state in `battle.ts step()` so `stepDefense` stops rescanning support troops per troop per defense; verify with `perf.test.ts` and `npm run server:bench`. (28)
5. Split `Repo` into per-aggregate interfaces/files; add Postgres+Redis services to the CI test job so `PgRepo` runs. (16, 26)
6. Code-split the HUD panels (`hud.ts open*` → `import()`), remove `chunkSizeWarningLimit: 2000`, move Settings/account/online out of `hud.ts`. (17, 31)
7. Separate server runtime deps from client deps so the Docker image stops installing Phaser + Capacitor. (32)
8. Delete the 20 unreferenced exports, un-export the 45 own-file-only ones, keep the `unused-exports.mjs`/`cycles.mjs` checks in CI; break the `battle↔warriors↔fortifications` and `pvp↔village` cycles via a shared helpers module. (14, 22)
9. Stop committing 49 empty locale worksheets (generate on demand) and either make `server/rules/v3` immutable-by-test or treat it as a build artifact; mark tool-generated JSON/MD files with a header. (3, 4, 5)
10. Add Prettier + minimal ESLint to `deploy.yml`; move the three 25–52 s model-player tests and the ms-threshold assertions behind `npm run test:balance`/`perf:*` and set vitest `isolate: false`. (6, 24, 25)