# BEAST MODE: Release Bulletproofing Pass for Kagemura: Ninja Clans

**Agent prompt and audit, 2026-11-21. Audited commit `560ce7a` (tip of `claude/dreamy-gauss-r3quc0`, same tree as `main`'s last security-audit merge).**

Sources: the *Game Release Bulletproofing Checklist* (17 sections), the *Game Release Bulletproofing Masterclass* (27 chapters, the 20 Laws and the Go/No-Go gate), and page 15 of an earlier *Release Bulletproofing Audit* of the same date and commit (its order of work and its labels E-1, I-1 to I-4, S-1 to S-4, R-1 to R-4, G-1, O-1, O-2, E-2, E-3, N-A, N-B, A-1 to A-4, D-1 to D-6). Seven independent auditors re-checked every checklist line against today's code, one lane each. Every finding below carries file-and-line evidence and how it was checked (read, ran, or reproduced in a browser). Where an earlier label could not be traced, the item says "(inferred)".

{{COUNTS}}

> **What this document is not.** It is not a statement of release readiness. Nothing here was run on a phone, in a store sandbox, against Postgres or Redis, or by a real player. Passing unit tests, a small bundle or a closed work item do not establish that the game is ready for a worldwide release (root `CLAUDE.md`, `AGENTS.md`). Owner, legal, device and store evidence stays open until it exists.

## How to use this document

**Humans:** read "Verdict at a glance", then "Phases". The owner items (Part C) are yours. Everything else is for coding sessions.

**AI coding agents:** paste the following into a new session with full repository access, then work the phases in order:

```
Read docs/prompts/BEAST_MODE_2026-11-21.md (the Markdown source of this PDF) from top to bottom.
You are the INTEGRATION session of AGENTS.md for this pass. Work the phases in order,
one work item per commit, and update the ledger docs/audit/bulletproof-2026-11-21/PROGRESS.md
after each item. Revalidate every finding against the current code before you change anything.
```

The Markdown source is the canonical, machine-readable form: `docs/prompts/BEAST_MODE_2026-11-21.md`. The lane reports with their complete verdict tables are in `docs/audit/bulletproof-2026-11-21/` (`ECO.md`, `SAV.md`, `SEC.md`, `STB.md`, `OPS.md`, `UX.md`, `GT.md`). Probe scripts, screenshots and measurement output are in its `evidence/` folder. Every work item uses the same fields, so you can parse it: `### <ID> — title`, then `Severity`, `Status`, `Kind`, `Compartment`, `Checklist refs`, `Evidence`, `Fix`, `Tests`, `Done when`, `Don't break`.

<<<PAGEBREAK>>>

## 0. Rules of engagement (read before touching code)

### 0.1 Read first, in this order

1. `CLAUDE.md`, `AGENTS.md`, `docs/STATUS.md` (generated; the only source for version numbers).
2. `docs/store/WORLDWIDE_AUDIT.md`: the owner objective, the open findings (GLOBAL-001, 006 markets, 007, 008, 015, 017, risks R01-R10), and the last two closure records ("2026-11-20 exploit and strategy audit", "2026-11-20 security audit"). Their format is the one you write in.
3. `docs/DECISIONS.md` for every system you touch.
4. The compartment brief of the files you change: `src/gameplay/CLAUDE.md`, `src/presentation/CLAUDE.md`, `src/backend/CLAUDE.md`, `locales/CLAUDE.md`, plus `compartments.json`.
5. The lane report in `docs/audit/bulletproof-2026-11-21/` for the item you start. It has the verdict table and the "verified sound" list. **Do not fix what is listed as sound.**

### 0.2 Invariants that no work item suspends

- **Boundaries.** `tests/architecture/boundaries.test.ts` decides who imports whom. `src/gameplay/sim` stays pure: no DOM, no Phaser, no `Date.now()`, no `Math.random()`. Cross-compartment asks go in `docs/*/REQUESTS.md`, even when you make the change yourself.
- **Saves.** Any change to state shape bumps `SAVE_VERSION` with a migration step. Never drop progress. A damaged save is kept and offered back. A newer save stops the boot.
- **Battles.** If combat data or rules change, run `npm run rules:snapshot` *before* bumping `SIM_RULES`. Battles replay from seed plus deployments using only + − × ÷ and √. Combat numbers never ship in balance bundles. Deploy the server before the game.
- **The server owns online truth.** Protocol changes go in `docs/PROTOCOL.md` with contract tests. Database changes are new numbered migrations in `server/migrations/` (listed in its `index.ts`), never edits.
- **Money and minors.** Real prices appear only in the Store and its confirm step. Every purchase has a clear confirm. The under-18 monthly cap stays. No offers pop up for minors or unknown ages. Nothing random is sold.
- **Honesty.** Generated opponents, simulated raids and generated Gangs are always labelled. A chest shows only what it gave.
- **Privacy.** Statistics come only from adults who opt in, under a random id. Crash reports are opt-in. Age bands only get stricter. Deletion clears every player-owned table.
- **Text.** New interface text goes through `t()`, with its English in `locales/en/ui.json`, and then `npm run i18n:extract && npm run i18n:sync`. Plurals are ICU messages. Names are isolated (`<bdi>` / `isolateName`).
- **Device targets.** The bottom bar fits 320 px. Touch first. Safe areas. Portrait and landscape. Cheap Android is the worldwide target.
- **Branches.** Never push to `main`. Work on the branch you were given. No pull request unless the owner asks. No new runtime dependency, font download, web payment path or free-text analytics field without a recorded owner decision.

### 0.3 Never do these to get green

Never skip, disable, loosen or delete a test or a campaign gate, or widen a gate's bounds, to make a change pass. Never edit an applied migration. Never mark an OWNER, DEVICE or NEEDS-PLAYERS item closed from code. Never say "fixed" without the fixing commit and the verifying test in the closure record. Never "fix" something listed as verified sound. Never invent a number: when an item gives a starting value, re-measure, and the acceptance line decides.

### 0.4 The loop for every work item

1. **Revalidate.** Read today's code at the cited symbols (line numbers drift; search by symbol). If the finding no longer holds, write that in the ledger with the evidence and skip it.
2. **Write the failing test first** (the item's `Tests` field). Run it and see it fail for the stated reason.
3. **Change the smallest thing** that meets `Done when`. Balance numbers live in `src/gameplay/data/*.json`; no magic numbers in code.
4. **Run the checks the change touches** (0.5).
5. **Commit** one item per commit (split per compartment where the item spans several), and name the IDs in the message, e.g. `ECO-01 (earlier E-1): one open intent per one-time product; buy guard`.
6. **Update the ledger** `docs/audit/bulletproof-2026-11-21/PROGRESS.md`: ID, status (done / skipped-not-reproduced / reverted-with-numbers / blocked-owner), commit, test, measurements before and after, remaining limits.
7. At the end of each phase, add a closure record to `docs/store/WORLDWIDE_AUDIT.md` in the format of the "2026-11-20 security audit" record: a table of # / finding / status / what changed / proving test / limits, then "Not run".

### 0.5 Checks

- Always: `npm test`, `npm run lint`, `npm run build`.
- Server or backend: `npm run typecheck:server`, `npm run server:build`. Also the Postgres and Redis tests when `TEST_DATABASE_URL` and `TEST_REDIS_URL` are available. If they are not, say so in the record.
- Costs, times, loot or combat numbers: `npm run test:slow`, `tests/gameplay/balance/`, `npm run balance:armies`, `npm run balance:campaign` (about 3 minutes; `campaign-gates.test.ts` fails while stale).
- `docs/STATUS.md` numbers changed: `npm run status`.
- UI layout: Playwright at 320×568, 360×640, 390×844, 568×320, 640×360 and 844×390 (`npm run ui:surfaces` needs `npm run dev`). Measure every button's box. Do it at 130 % root text too.
- Keep npm scripts cross-platform: no bash-only syntax in `package.json`.

<<<PAGEBREAK>>>

## 1. Verdict at a glance

The game's foundations are strong: deterministic, server-re-simulated battles; versioned saves with atomic IndexedDB writes; receipts checked on the server; consent-gated statistics; honest odds; no ads; no paid randomness. This pass found holes in five places:

1. **Money and input safety.** One purchase can be charged twice (reproduced in a browser). A receipt can be replayed into a later server village. Store builds let a player point the game at any server (a sign-in token relay). Back in the web build leaves the game mid-raid.
2. **Ranked integrity.** Villages held on the device are trusted in ranked play, and honor cannot be lost on defense. Together they let a cheater, or two colluding accounts, top both leaderboards and take real loot and war chests from honest players.
3. **Save and network durability.** An IndexedDB open failure can wipe a real village through the server. A damaged save is overwritten when its backup failed. There are no rolling backups. A won raid can be forfeited on a slow link. Clients retry with no jitter or circuit breaker.
4. **Crash visibility.** No source maps and one frozen release id (0.1.0). An Android renderer death kills the app and is never reported. A push-registration crash loop on Android without Firebase config. One uncaught scene error freezes the map for good. The crash-free rate cannot be computed.
5. **Design under optimal play.** Air is a dominated family. Newer warrior tiers score below older ones. One army wins at Keep 15. The Keep 15 cliff and the casual Keep 4 dip are hidden by how the gates average. Trials form a sawtooth. Casual players lose about what they loot. All of these come from single-seed gates, with no searched attacker in CI.

| Checklist section | Verdict | Open work items (primary IDs) |
|---|---|---|
| 1 Crashes and stability | FAIL | STB-01, STB-02/OPS-02, STB-03, STB-04/OPS-03, STB-05/OPS-08, STB-06, STB-11 |
| 2 Save data and progression | PARTIAL | SAV-01, SAV-02, SAV-03, SAV-04, SAV-09, SAV-12/SEC-05, SAV-15, SAV-16 |
| 3 Economy and monetization | PARTIAL | ECO-01/UX-01, ECO-02, ECO-03, ECO-05, ECO-06, ECO-07/SEC-12, ECO-08, ECO-09, ECO-10 |
| 3b Onboarding and retention | PARTIAL | GT-02, OPS-11 (silent playtest), UX-10/OPS-14 |
| 4 Input and controls | FAIL | UX-01, UX-02, UX-03, UX-07, UX-09, UX-11 |
| 5 Performance | PARTIAL / NEEDS-DEVICE | STB-07, STB-08, STB-09, STB-10, STB-11 |
| 6 Networking | PARTIAL | SAV-05, SAV-06, SAV-07, SAV-10, SAV-11, SAV-13, SAV-14, SEC-08 |
| 7 Security and cheating | FAIL | SEC-01, SEC-02, SEC-03, SEC-04, SEC-06, SEC-07, SEC-10, SEC-11, SEC-13 to SEC-17 |
| 8 Content and game design | PARTIAL | GT-08, GT-09, GT-10 |
| 9 Audio, visuals and polish | PARTIAL | UX-04, UX-05/STB-09 |
| 10 UI and UX | PARTIAL | UX-02, UX-03, UX-09 |
| 11 Localization and accessibility | PARTIAL | UX-06, UX-07, UX-08 (fonts and native review are owner items) |
| 12 Platform and store compliance | PARTIAL / OWNER | OPS-10, OPS-12, ECO-05, OWN-01 to OWN-12 |
| 13 Build and release pipeline | FAIL | OPS-01/SAV-08, OPS-04, OPS-05/SEC-09, OPS-09, OPS-13 |
| 14 Analytics and observability | PARTIAL | OPS-06, OPS-07, SEC-02, STB-05 |
| 15 Real-world testing | OWNER | OPS-11, STB-11, SAV-16, OWN items |
| 16 Launch-day readiness | OWNER | OPS-13, OPS-14, SEC-08, OWN items |
| 17a-h Game theory and strategy | FAIL | GT-01, GT-03 to GT-07, GT-11, GT-12 to GT-17, ECO-04/GT-06 |

### 1.1 What the earlier page-15 labels map to

| Earlier label | Now | Earlier label | Now |
|---|---|---|---|
| E-1 buy guard + server intent rule | ECO-01, UX-01 | S-3, S-4 | SEC-15, SEC-17 (inferred) |
| I-1 | UX-01 | N-A shake/flash setting | UX-04 |
| I-2 | sound (UX verdict table) | N-B | UX-05 (inferred) |
| I-3 PWA back | UX-03 | A-1, A-2, A-4 | UX-08, UX-07, UX-06 (A-3 sound) |
| I-4 | UX-02 (inferred) | D-1 | GT-05 (inferred) |
| E-2 | ECO-02 (inferred) | D-2 | GT-06, ECO-04 |
| S-1 REQUIRE_SERVER_VILLAGE | SEC-01 | D-3 | UX-09 (UX lane) / GT-07 (GT lane), both inferred |
| R-1 server field in store builds | SEC-03 | D-4 | GT-01, GT-12 |
| S-2 label allowlist | SEC-02 | D-5 | GT-09 or GT-10 (inferred) |
| G-1 late-report rule | SEC-04 | D-6 | GT-13, GT-17 (inferred) |
| O-1 source maps | OPS-02, STB-02 | Air and regressing tiers | GT-03, GT-04, GT-09 |
| O-2 Android renderer | OPS-03, STB-04 | Keep 15 cliff gate | GT-08 |
| E-3 endReason/tier/abandon | OPS-06 | multi-seed campaigns, Jade lifetime model | GT-11, ECO-03 |
| R-2 version bump guard | OPS-01, SAV-08 | R-3 web rollback doc | OPS-05 |
| R-4 runbook annotations | OPS-07 | session envelopes | STB-05, OPS-08 |

### 1.2 Duplicates: do these together, close them together

Several lanes found the same hole from different sides. Do the **primary** item. Fold the other item's tests and `Done when` into it, and close both IDs in one commit.

| Primary | Also closes | Shared hole |
|---|---|---|
| ECO-01 | UX-01 | Double purchase: client buy guard, controller single-flight, server one-open-intent rule, no duplicate grant |
| OPS-02 | STB-02 | Hidden source maps uploaded privately; a release id per build |
| OPS-03 | STB-04 | Android `onRenderProcessGone`; record renderer death on both platforms |
| STB-05 | OPS-08 | Crash-free rate: context on reports, a session denominator, correct `RELEASE.md` |
| OPS-01 | SAV-08 | Version-bump guard for app version, `SAVE_VERSION`, `PROTOCOL_VERSION`, `SIM_RULES`, migrations; a live previous-client contract check |
| SAV-12 | SEC-05 | X1: backdated time-window claims (owner decision first) |
| SEC-12 | ECO-07 | P4: sandbox credit daily cap required in production |
| OPS-05 | SEC-09 (code part) | One-command rollback, web and server |
| GT-06 | ECO-04 | D-2: casual loss vs loot, late raid value |
| GT-11 | ECO-03 (model part) | Multi-seed campaigns with CIs; Jade lifetime supply/sink model |
| STB-09 | UX-05 (audio resume), SAV-07 (pause when hidden) | Lifecycle: timers, audio and polling on hide/pause/resume |
| OPS-14 | UX-10 | Review prompt counts wins only on "Return home"; recent-problem guard |
| SEC-01 | (with GT-01) | Ranked trust: device villages and non-zero-sum honor; land SEC-01 first, then GT-01 |
| SEC-04 | (with SAV-11) | Late reports: a detection and rule, plus telling the player when a late report becomes practice |

<<<PAGEBREAK>>>

## 2. Phases (do them in this order)

The order follows the masterclass triage. Save, purchase and first-run paths are release blockers. Then come integrity and stability, then release machinery, then polish, and balance last, because balance needs the multi-seed tooling and a stable pipeline. Within a phase, go in the order listed. A phase may take a whole session; the ledger lets the next session continue.

### Phase 0: set up and baseline (no code changes)

1. `npm ci`. Then `npm test`, `npm run lint`, `npm run build`, `npm run typecheck:server`, `npm run server:build`. Record the results and the chunk sizes in the ledger.
2. Create `docs/audit/bulletproof-2026-11-21/PROGRESS.md` with one row per work item in this document (the index in section 3), all `open`.
3. Owner decisions: ask the owner for the decisions in section 2.9. Do not start an item that needs one until the decision is recorded in `docs/DECISIONS.md`.

### Phase 1: money and input safety (release blockers)

ECO-01 (+UX-01) → ECO-02 → SEC-03 → UX-03 → UX-02 → UX-09 → ECO-08 → ECO-10 → ECO-09 → ECO-06.

*Gate:* the double-purchase server tests and the happy-dom double-tap test pass. A store build has no server-address field. Back closes the top dialog in the web build and the PWA. Smoke Bomb can be tapped at 568×320 and 640×360.

### Phase 2: ranked integrity and server hardening

SEC-01 → GT-01 (needs owner decision D2) → SEC-02 → SEC-04 → SEC-12 (+ECO-07) → SEC-17 → SEC-15 → SEC-13 → SEC-06 → SEC-07 → SEC-14 → SEC-10 → SEC-16 → SAV-12 (+SEC-05, after decision D1).

*Gate:* with `REQUIRE_SERVER_VILLAGE=1`, a device-held village gets no honor, no ranked opponents, no loot from server villages and no war chest (server tests). Metric label cardinality is bounded. Production `checkConfig` refuses missing security switches.

### Phase 3: save and network durability

SAV-01 → SAV-02 → SAV-03 → SAV-04 → SAV-05 → SAV-07 (+STB-09 timers) → SAV-06 → SAV-10 → SAV-11 → SAV-13 → SAV-09 → SAV-14.

*Gate:* the IndexedDB-failure path can never upload or adopt a throwaway village (test). A damaged save is never overwritten without a verified backup. The last 3 good saves are kept and loaded automatically. A real save fixture for every `SAVE_VERSION` loads in CI. Clients back off with jitter and pause when hidden.

### Phase 4: crashes and observability

STB-01 → STB-03 → OPS-02 (+STB-02) → OPS-03 (+STB-04) → STB-05 (+OPS-08) → STB-06 → OPS-06 → OPS-07.

*Gate:* a deliberately thrown error in a production build shows a readable stack (in a local Sentry-envelope test with the uploaded maps, or with `sentry-cli sourcemaps explain`). Android survives a forced renderer kill (`chrome://crash` in the WebView, a device step). Push registration never throws on a build without Firebase. An error thrown in a scene update is caught, reported and recovered.

### Phase 5: release machinery

OPS-01 (+SAV-08) → OPS-05 (+SEC-09 code part) → OPS-04 → OPS-09 → OPS-10 → OPS-12 → SEC-08 → OPS-13.

*Gate:* CI fails when save, rules, protocol or migrations change without a version bump. `MIN_CLIENT_BUILD` can tell builds apart. Rolling back the web build and the server is one documented command each, rehearsed once on staging and recorded. Kill switches turn off a product and a feature on staging without a store update.

### Phase 6: performance, polish and accessibility

STB-07 → STB-08 → STB-09 (+UX-05) → STB-10 → UX-04 → UX-06 → UX-07 → UX-08 → OPS-14 (+UX-10) → UX-11.

*Gate:* no first-use painting during a battle (the frame-time probe in the item). The boot script is under the item's size budget. A bundle-size test exists. The shake/flash setting is honoured with reduced motion on. Every tap target is ≥ 44 px at 320 px wide.

### Phase 7: balance (game-theory session; one `SIM_RULES` bump at most for the whole phase)

GT-11 (multi-seed tooling, CIs and the Jade model, with ECO-03) → GT-02 → GT-08 → GT-03 → GT-04 → GT-06 (+ECO-04, after decision D3) → GT-05 → GT-07 → GT-09 → GT-10 → GT-12 → GT-13 → GT-16 → GT-17 → GT-14 → GT-15.

*Gate:* campaign gates are judged on at least 8 seeds with confidence intervals. A Keep-by-Keep gate (not paired averages) covers casual Keep 4 and regular Keep 15. Air is above the destruction floor at every Keep from 6. No newer tier scores below its predecessor at the Keep it unlocks. Run `npm run rules:snapshot` *before* the single `SIM_RULES` bump.

### Phase 8: documents and the owner hand-off

OPS-11 → OPS-13 (if not done) → hand the owner Part C with every code-side prerequisite marked done or open.

### 2.9 Owner decisions needed before some items can close

| # | Decision | Blocks | Options recorded in |
|---|---|---|---|
| D1 | X1: how far back a time-window claim may be dated while idle (keep 12 h for offline play, or require per-device last-contact evidence) | SAV-12, SEC-05 | SAV-12 |
| D2 | Honor model: should a lost defense cost honor, and should wins against generated bases earn honor? | GT-01, GT-12 | GT-01 |
| D3 | Casual loss vs loot target: how much of their loot casual players may lose | GT-06, ECO-04 | GT-06 |
| D4 | A duplicate Season Scroll receipt: refund it, or credit it to the next season | ECO-01 step 4 | ECO-01 |
| D5 | Certificate pinning: yes or no, and on which hosts | SEC-16 | SEC-16 |
| D6 | Under-18 cap currency: count in local money, using the store's reported price | ECO-06 | ECO-06 |
| D7 | Crash reports: keep opt-in, or ask at first launch; the Sentry project, region and alert routing | STB-12, OPS-02 | STB-12 |
| D8 | `REQUIRE_SERVER_VILLAGE` rollout: on at launch, or on after a migration window | SEC-01 | SEC-01 |

<<<PAGEBREAK>>>

## 2.10 The Go/No-Go gate, mapped to this document

From the masterclass. Every line must be a yes, or have a named owner and an accepted risk. A blank is a no.

| Gate line | Code work that must be done first | Evidence only the owner, a device or players can give |
|---|---|---|
| Crash-free sessions ≥ 99.5 % in beta, symbolicated reports verified | STB-01, STB-03, STB-06, OPS-02, OPS-03, STB-05 | Beta cohort crash-free rate from Sentry or the store consoles (OWN) |
| Save, kill, reinstall, restore and cloud-sync round trip on two devices | SAV-01 to SAV-05, SAV-09 | SAV-15, SAV-16 device runs |
| Every purchase path tested for success, failure, cancel, restore and refund with a real transaction | ECO-01, ECO-02 | ECO-05 in both store sandboxes |
| Receipts validated server-side and rewards granted exactly once | ECO-01, ECO-02, ECO-09, SAV-10 | Sandbox refund and replay runs |
| Release build tested on the oldest supported device with stable frame pacing | STB-07, STB-08, STB-10 | STB-11 (2 GB Android, older iPhone) |
| First-run flow tested by at least 5 strangers with no help | GT-02, OPS-11 (protocol) | Silent playtest notes (OWN) |
| Economy spreadsheet and simulation reviewed | ECO-03, GT-11, GT-06 | Owner sign-off on decision D3 |
| Solver or bot verified that all content can be completed | GT-09, GT-11 (searched attacker in CI) | none |
| No dominant strategy above threshold | GT-03, GT-04, GT-07, GT-01 | Closed-beta meta watch (GT-14) |
| Network failure, offline and server-down paths show clear, recoverable states | SAV-05, SAV-06, SAV-07, SAV-11, SAV-13 | Link-conditioner runs at 500 ms and 5-20 % loss (SAV-16) |
| Privacy policy, consent flows, data safety forms and age rating match actual behaviour | OPS-10, SEC-14 | OWN-04, OWN-05, OWN-07, OWN-08 |
| Store metadata, screenshots and review notes accurate and complete | OPS-12 | OWN items for listings and screenshots |
| Debug menus, test keys and verbose logging removed or gated | SEC-03, SEC-12, SEC-17 | Release-build check on a device |
| Kill switches, remote config and feature flags tested in production configuration | OPS-09, OPS-01 (`MIN_CLIENT_BUILD` live) | Staging drill record |
| Hotfix rehearsal done and day-0 patch ready | OPS-01, OPS-05, OPS-13 | Rehearsal through store review (OWN) |
| Dashboards, alerts and on-call owner set for launch week | OPS-07, OPS-06, SEC-02 | On-call rota (OWN) |
| Retention gates defined in advance, and soft-launch data meets them | OPS-11 | Soft-launch data |
| Support channels, canned responses and known-issues list ready | OPS-13 | Support email live (OWN-04) |
| Signing keys, certificates and credentials backed up in two secure places | none | OWN |
| A written rollback plan exists, and someone other than its author has read it | OPS-05, SEC-09 | Second reader's sign-off |

### 2.11 The 20 Laws, as they apply here

1. **Saves are sacred:** Phase 3 comes before polish. SAV-01 is the worst save bug found.
2. **A crash-free rate under 99.5 % kills:** today it cannot even be measured (STB-05).
3. **The first five minutes:** GT-02 (casual Keep 4 dip, days 2-6).
4. **Players do what the rules reward:** GT-01 (honor is not zero-sum).
5. **A boring best strategy makes a boring game:** GT-07 (one army wins).
6. **Never trust the client with value:** SEC-01, ECO-02.
7. **Test the release build on the worst device and a bad network:** STB-11, SAV-16.
8. **Idempotency beats cleverness:** ECO-01, SAV-10.
9. **Models beat intuition:** GT-11, ECO-03.
10. **A rehearsed hotfix:** OPS-01, OPS-05.
11. **Every metric you reward will be gamed:** GT-01, GT-12, GT-13.
12. **Fun with the systems off:** GT-16 (the signature Smoke Bomb adds little).
13. **Prove solvability by machine:** GT-09, GT-11.
14. **Honest UX:** keep everything in the "verified sound" lists.
15. **Observe strangers:** OPS-11.
16. **Control after release:** OPS-09.
17. **Read the store guidelines the week you submit:** OWN items.
18. **Plan the patch cadence:** OPS-13.
19. **Content runway:** GT-15.
20. **Ship what you can support:** OPS-07, OPS-13.

<<<PAGEBREAK>>>

## 3. Work-item index (machine-readable)

One row per work item. "Phase" is the phase in section 2. "Dup" names the primary item when this one is folded into another.

{{INDEX}}

<<<PAGEBREAK>>>

# Part B: work items by lane

Each lane below is copied from its auditor's report. The lane's verdict table and "verified sound" list are in Appendices A and B, and the full reports are in `docs/audit/bulletproof-2026-11-21/`.
