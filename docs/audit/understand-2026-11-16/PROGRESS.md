# Progress ledger: the 2026-11-16 replayability, game-theory, economy and publishability pass

The agent prompt is `docs/prompts/BEAST_MODE_2026-11-16.md`; this is its section 3.9 ledger. One row per work
item: status (`todo`, `doing`, `done`, `reverted`, `skipped: no longer true`, `open: needs owner`), the commit,
the before and after numbers, new or changed locale keys, and notes for the next session. A session that starts
reads this first; a session that runs out of context writes its state here before stopping.

Branch: `claude/magical-cray-wkpcl1`. It merged `origin/main` at `0c5eeb7` ("Harden game economy and battle
exploit handling", a partial fix of XPL-03/05/06 and the Trial `startDamage` refusal made by another session).

**Release note for every phase of this pass:** until the pass's last stored field has landed, no build of this
branch is released and no server holds villages written by it (section 3.2).

## Baseline (P0-01)

`npm ci` then `npm test` at `bb08e62` (main merged), Node 22.23.4, no Postgres: 204 files passed, 1 failed, 1
skipped; 1,939 tests passed, 1 failed, 19 skipped. The failure was main's `0c5eeb7`: the import refused to
confirm a verified purchase whose save relabelled its product, so the provenance test (written in that same
commit) expected 3,300 Jade and got 2,000. Fixed in Phase 0 (confirmation by transaction id; worth from the
server's own row). The prompt's baseline (205 files, 1,934 tests) predates `0c5eeb7`.

## Items

| Item | Status | Commit | Before → after | Locale keys | Notes |
|---|---|---|---|---|---|
| P0-01 | done |  | 205 files/1,934 tests at 9bf76af → 204 passed + 1 failed (main's 0c5eeb7) → fixed |  | Baseline above; main's import regression fixed in the Phase 0 commit |
| P0-02 | done |  | deploy check failed on ar/community.html → passes all 49 translated languages of a local build (vite preview) |  | tools/release/page-language.mjs; test in release-tools.test.ts |
| P0-03 | done |  | Postgres suites: 3 consecutive runs, 66 files / 692 tests each, 87-94 s, all green (local Postgres 16 + Redis 7, --maxWorkers=2) |  | 30 s test/hook timeout only when TEST_DATABASE_URL is set; --maxWorkers=2 in deploy.yml and server.yml. Not done: a template schema per worker (not needed for green). Not shown here: that the old 5 s limit fails on this machine |
| P0-04 | done (cause not found) |  | det.ts: Node 22.23.4, Node 24.22.3 (Dockerfile pin; also today's latest 24.x), 24.22.3 --no-turbofan --no-maglev, 24.22.3 --no-turbofan --no-maglev --no-sparkplug, 24.22.3 --jitless (bundled with esbuild) and 22 --jitless: all byte-identical to det-node22.txt (md5 231afcfc…). matched Keep 8 lag 0 = 2.167 |  | No engine fault found on any compiler tier of the pinned Node. .node-version (24.22.3) read by every workflow; Dockerfile pins the same (test). matched.test.ts asserts levels and opponent Keep before stars and prints each battle's hash. New pins tests/gameplay/battle/matchmaking-pins.test.ts, run a second time in CI with --no-turbofan --no-maglev. tk_desyncs_total alerts already existed. Step 6 (the 2.2 gate's one-star margin) is P4-08: not widened. Could not run: the GitHub runner itself (no Actions access from here) |
| P1-01 | todo | | | | |
| P1-02 | todo | | | | |
| P1-03 | todo | | | | |
| P1-04 | todo | | | | |
| P1-05 | todo | | | | |
| P1-06 | todo | | | | |
| P1-07 | todo | | | | |
| P1-08 | todo | | | | |
| P1-09 | todo | | | | |
| P1-10 | todo | | | | |
| P1-11 | todo | | | | |
| P1-12 | todo | | | | |
| P1-13 | todo | | | | |
| P1-14 | todo | | | | |
| P1-15 | todo | | | | |
| P1-16 | todo | | | | |
| P1-17 | todo | | | | |
| P1-18 | todo | | | | |
| P1-19 | todo | | | | |
| P1-20 | todo | | | | |
| P1-21 | todo | | | | |
| P1-22 | todo | | | | |
| P2-01 | todo | | | | |
| P2-02 | todo | | | | |
| P2-03 | todo | | | | |
| P2-04 | todo | | | | |
| P2-05 and P2-06 | todo | | | | |
| P2-07 | todo | | | | |
| P2-08 | todo | | | | |
| P2-09 | todo | | | | |
| P2-10 | todo | | | | |
| P2-11 | todo | | | | |
| P2-12 | todo | | | | |
| P2-13 | todo | | | | |
| P2-14 | todo | | | | |
| P2-15 | todo | | | | |
| P3-01 | todo | | | | |
| P3-02 | todo | | | | |
| P3-03 | todo | | | | |
| P3-04 | todo | | | | |
| P3-05 | todo | | | | |
| P3-06 | todo | | | | |
| P3-07 | todo | | | | |
| P3-08 | todo | | | | |
| P3-09 | todo | | | | |
| P3-10 | todo | | | | |
| P3-11 | todo | | | | |
| P3-12 | todo | | | | |
| P4-01 | todo | | | | |
| P4-02 | todo | | | | |
| P4-03 | todo | | | | |
| P4-04 | todo | | | | |
| P4-05 | todo | | | | |
| P4-06 | todo | | | | |
| P4-07 | todo | | | | |
| P4-08 | todo | | | | |
| P4-09 | todo | | | | |
| P4-10 | todo | | | | |
| P4-11 | todo | | | | |
| P5-01 | todo | | | | |
| P5-02 | todo | | | | |
| P5-03 | todo | | | | |
| P5-04 | todo | | | | |
| P5-05 | todo | | | | |
| P5-06 | todo | | | | |
| P5-07 | todo | | | | |
| P5-08 | todo | | | | |
| P5-09 | todo | | | | |
| P5-10 | todo | | | | |
| P5-11 | todo | | | | |
| P6-01 | todo | | | | |
| P6-02 | todo | | | | |
| P6-03 | todo | | | | |
| P6-04 | todo | | | | |
| P6-05 | todo | | | | |
| P6-06 | todo | | | | |
| P6-07 | todo | | | | |
| P6-08 | todo | | | | |
| P6-09 | todo | | | | |
| P6-10 | todo | | | | |
| P6-11 | todo | | | | |
| P6-12 | todo | | | | |
| P6-13 | todo | | | | |
| P6-14 | todo | | | | |
| P6-15 | todo | | | | |
| P6-16 | todo | | | | |
| P6-17 | todo | | | | |
| P6-18 | todo | | | | |
| P7-01 | todo | | | | |
| P7-02 | todo | | | | |
| P7-03 | todo | | | | |
| P7-04 | todo | | | | |
| P7-05 | todo | | | | |
| P7-06 | todo | | | | |
| P7-07 | todo | | | | |
| P7-08 | todo | | | | |
| P7-09 | todo | | | | |
| P7-10 | todo | | | | |
| P7-11 | todo | | | | |
| P7-12 | todo | | | | |
| P7-13 | todo | | | | |
| P7-14 | todo | | | | |
| P7-15 | todo | | | | |
| P7-16 | todo | | | | |

## New and changed locale keys (for section 13)

| Key | Phase | What it is for (screen, placeholders) |
|---|---|---|

## Open ideas and items left open on purpose
