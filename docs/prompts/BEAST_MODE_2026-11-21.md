# Beast Mode release bulletproofing pass, 2026-11-21 (text of the PDF)

This is the text layer of `BEAST_MODE_2026-11-21.pdf` (audited commit 560ce7a), extracted with `pdftotext -layout` because the Markdown source and the lane reports named inside it were not in this checkout. Page footers and table wrapping come from the PDF. The ledger is `docs/audit/bulletproof-2026-11-21/PROGRESS.md`.

```text
 BEAST MODE: Release Bulletproofing Pass for
 Kagemura: Ninja Clans
 Agent prompt and audit, 2026-11-21. Audited commit 560ce7a (tip of claude/dreamy-gauss-r3quc0, same tree
 as main's last security-audit merge).
 Sources: the Game Release Bulletproofing Checklist (17 sections), the Game Release Bulletproofing Masterclass (27
 chapters, the 20 Laws and the Go/No-Go gate), and page 15 of an earlier Release Bulletproofing Audit of the same
 date and commit (its order of work and its labels E-1, I-1 to I-4, S-1 to S-4, R-1 to R-4, G-1, O-1, O-2, E-2, E-3, N-A,
 N-B, A-1 to A-4, D-1 to D-6). Seven independent auditors re-checked every checklist line against today's code, one
 lane each. Every finding below carries file-and-line evidence and how it was checked (read, ran, or reproduced in a
 browser). Where an earlier label could not be traced, the item says "(inferred)".
 97 work items (85 after folding duplicates): 1 BLOCKER, 22 HIGH, 41 MEDIUM, 33 LOW, plus 35 owner and
 device steps (Part C). By lane: ECO 10, SEC 17, SAV 16, STB 12, OPS 14, UX 11, GT 17.
 What this document is not. It is not a statement of release readiness. Nothing here was run on a phone, in a
 store sandbox, against Postgres or Redis, or by a real player. Passing unit tests, a small bundle or a closed work
 item do not establish that the game is ready for a worldwide release (root CLAUDE.md, AGENTS.md). Owner, legal, device
 and store evidence stays open until it exists.


 How to use this document
 Humans: read "Verdict at a glance", then "Phases". The owner items (Part C) are yours. Everything else is for
 coding sessions.
 AI coding agents: paste the following into a new session with full repository access, then work the phases in
 order:
 Read docs/prompts/BEAST_MODE_2026-11-21.md (the Markdown source of this PDF) from top to bottom.
 You are the INTEGRATION session of AGENTS.md for this pass. Work the phases in order,
 one work item per commit, and update the ledger docs/audit/bulletproof-2026-11-21/PROGRESS.md
 after each item. Revalidate every finding against the current code before you change anything.

 The Markdown source is the canonical, machine-readable form: docs/prompts/BEAST_MODE_2026-11-21.md. The lane
 reports with their complete verdict tables are in docs/audit/bulletproof-2026-11-21/ (ECO.md, SAV.md, SEC.md, STB.md,
 OPS.md, UX.md, GT.md). Probe scripts, screenshots and measurement output are in its evidence/ folder. Every work item
 uses the same fields, so you can parse it: ### <ID> — title, then Severity, Status, Kind, Compartment, Checklist refs,
 Evidence, Fix, Tests, Done when, Don't break.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 1
 0. Rules of engagement (read before touching code)

 0.1 Read first, in this order
 1. CLAUDE.md, AGENTS.md, docs/STATUS.md (generated; the only source for version numbers).
 2. docs/store/WORLDWIDE_AUDIT.md: the owner objective, the open findings (GLOBAL-001, 006 markets, 007, 008,
    015, 017, risks R01-R10), and the last two closure records ("2026-11-20 exploit and strategy audit", "2026-11-20
    security audit"). Their format is the one you write in.
  3. docs/DECISIONS.md for every system you touch.
  4. The compartment brief of the files you change: src/gameplay/CLAUDE.md, src/presentation/CLAUDE.md,
    src/backend/CLAUDE.md, locales/CLAUDE.md, plus compartments.json.
  5. The lane report in docs/audit/bulletproof-2026-11-21/ for the item you start. It has the verdict table and the
    "verified sound" list. Do not fix what is listed as sound.

 0.2 Invariants that no work item suspends
 • Boundaries. tests/architecture/boundaries.test.ts decides who imports whom. src/gameplay/sim stays pure: no
    DOM, no Phaser, no Date.now(), no Math.random(). Cross-compartment asks go in docs/*/REQUESTS.md, even when
    you make the change yourself.
  • Saves. Any change to state shape bumps SAVE_VERSION with a migration step. Never drop progress. A damaged
    save is kept and offered back. A newer save stops the boot.
  • Battles. If combat data or rules change, run npm run rules:snapshot before bumping SIM_RULES. Battles replay
    from seed plus deployments using only + − × ÷ and √. Combat numbers never ship in balance bundles. Deploy
    the server before the game.
  • The server owns online truth. Protocol changes go in docs/PROTOCOL.md with contract tests. Database changes
    are new numbered migrations in server/migrations/ (listed in its index.ts), never edits.
  • Money and minors. Real prices appear only in the Store and its confirm step. Every purchase has a clear
    confirm. The under-18 monthly cap stays. No offers pop up for minors or unknown ages. Nothing random is sold.
  • Honesty. Generated opponents, simulated raids and generated Gangs are always labelled. A chest shows only
    what it gave.
  • Privacy. Statistics come only from adults who opt in, under a random id. Crash reports are opt-in. Age bands
    only get stricter. Deletion clears every player-owned table.
  • Text. New interface text goes through t(), with its English in locales/en/ui.json, and then npm run i18n:extract
    && npm run i18n:sync. Plurals are ICU messages. Names are isolated (<bdi> / isolateName).
  • Device targets. The bottom bar fits 320 px. Touch first. Safe areas. Portrait and landscape. Cheap Android is
    the worldwide target.
  • Branches. Never push to main. Work on the branch you were given. No pull request unless the owner asks. No
    new runtime dependency, font download, web payment path or free-text analytics field without a recorded owner
    decision.

 0.3 Never do these to get green
 Never skip, disable, loosen or delete a test or a campaign gate, or widen a gate's bounds, to make a change pass.
 Never edit an applied migration. Never mark an OWNER, DEVICE or NEEDS-PLAYERS item closed from code. Never
 say "fixed" without the fixing commit and the verifying test in the closure record. Never "fix" something listed as
 verified sound. Never invent a number: when an item gives a starting value, re-measure, and the acceptance line
 decides.

 0.4 The loop for every work item
 1. Revalidate. Read today's code at the cited symbols (line numbers drift; search by symbol). If the finding no
    longer holds, write that in the ledger with the evidence and skip it.
  2. Write the failing test first (the item's Tests field). Run it and see it fail for the stated reason.
  3. Change the smallest thing that meets Done when. Balance numbers live in src/gameplay/data/*.json; no magic
    numbers in code.
  4. Run the checks the change touches (0.5).



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 2
  5. Commit one item per commit (split per compartment where the item spans several), and name the IDs in the
    message, e.g. ECO-01 (earlier E-1): one open intent per one-time product; buy guard.
  6. Update the ledger docs/audit/bulletproof-2026-11-21/PROGRESS.md: ID, status (done / skipped-not-reproduced /
    reverted-with-numbers / blocked-owner), commit, test, measurements before and after, remaining limits.
  7. At the end of each phase, add a closure record to docs/store/WORLDWIDE_AUDIT.md in the format of the
    "2026-11-20 security audit" record: a table of # / finding / status / what changed / proving test / limits, then "Not
    run".

 0.5 Checks
 • Always: npm test, npm run lint, npm run build.
 • Server or backend: npm run typecheck:server, npm run server:build. Also the Postgres and Redis tests when
    TEST_DATABASE_URL and TEST_REDIS_URL are available. If they are not, say so in the record.
  • Costs, times, loot or combat numbers: npm run test:slow, tests/gameplay/balance/, npm run balance:armies, npm run
    balance:campaign (about 3 minutes; campaign-gates.test.ts fails while stale).
  • docs/STATUS.md numbers changed: npm run status.
  • UI layout: Playwright at 320×568, 360×640, 390×844, 568×320, 640×360 and 844×390 (npm run ui:surfaces
    needs npm run dev). Measure every button's box. Do it at 130 % root text too.
  • Keep npm scripts cross-platform: no bash-only syntax in package.json.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 3
 1. Verdict at a glance
 The game's foundations are strong: deterministic, server-re-simulated battles; versioned saves with atomic
 IndexedDB writes; receipts checked on the server; consent-gated statistics; honest odds; no ads; no paid
 randomness. This pass found holes in five places:
  1. Money and input safety. One purchase can be charged twice (reproduced in a browser). A receipt can be
      replayed into a later server village. Store builds let a player point the game at any server (a sign-in token relay).
      Back in the web build leaves the game mid-raid.
  2. Ranked integrity. Villages held on the device are trusted in ranked play, and honor cannot be lost on defense.
      Together they let a cheater, or two colluding accounts, top both leaderboards and take real loot and war chests
      from honest players.
  3. Save and network durability. An IndexedDB open failure can wipe a real village through the server. A
      damaged save is overwritten when its backup failed. There are no rolling backups. A won raid can be forfeited on
      a slow link. Clients retry with no jitter or circuit breaker.
  4. Crash visibility. No source maps and one frozen release id (0.1.0). An Android renderer death kills the app and
      is never reported. A push-registration crash loop on Android without Firebase config. One uncaught scene error
      freezes the map for good. The crash-free rate cannot be computed.
  5. Design under optimal play. Air is a dominated family. Newer warrior tiers score below older ones. One army
      wins at Keep 15. The Keep 15 cliff and the casual Keep 4 dip are hidden by how the gates average. Trials form a
      sawtooth. Casual players lose about what they loot. All of these come from single-seed gates, with no searched
      attacker in CI.
Checklist section                       Verdict                 Open work items (primary IDs)
1 Crashes and stability                 FAIL                    STB-01, STB-02/OPS-02, STB-03, STB-04/OPS-03, STB-05/OPS-08, STB-06,
                                                                STB-11
2 Save data and progression             PARTIAL                 SAV-01, SAV-02, SAV-03, SAV-04, SAV-09, SAV-12/SEC-05, SAV-15, SAV-16
3 Economy and monetization              PARTIAL                 ECO-01/UX-01, ECO-02, ECO-03, ECO-05, ECO-06, ECO-07/SEC-12, ECO-08,
                                                                ECO-09, ECO-10
3b Onboarding and retention             PARTIAL                 GT-02, OPS-11 (silent playtest), UX-10/OPS-14
4 Input and controls                    FAIL                    UX-01, UX-02, UX-03, UX-07, UX-09, UX-11
5 Performance                           PARTIAL /               STB-07, STB-08, STB-09, STB-10, STB-11
                                        NEEDS-DEVICE
6 Networking                            PARTIAL                 SAV-05, SAV-06, SAV-07, SAV-10, SAV-11, SAV-13, SAV-14, SEC-08
7 Security and cheating                 FAIL                    SEC-01, SEC-02, SEC-03, SEC-04, SEC-06, SEC-07, SEC-10, SEC-11, SEC-13 to
                                                                SEC-17
8 Content and game design               PARTIAL                 GT-08, GT-09, GT-10
9 Audio, visuals and polish             PARTIAL                 UX-04, UX-05/STB-09
10 UI and UX                            PARTIAL                 UX-02, UX-03, UX-09
11 Localization and accessibility       PARTIAL                 UX-06, UX-07, UX-08 (fonts and native review are owner items)
12 Platform and store compliance        PARTIAL / OWNER         OPS-10, OPS-12, ECO-05, OWN-01 to OWN-12
13 Build and release pipeline           FAIL                    OPS-01/SAV-08, OPS-04, OPS-05/SEC-09, OPS-09, OPS-13
14 Analytics and observability          PARTIAL                 OPS-06, OPS-07, SEC-02, STB-05
15 Real-world testing                   OWNER                   OPS-11, STB-11, SAV-16, OWN items
16 Launch-day readiness                 OWNER                   OPS-13, OPS-14, SEC-08, OWN items
17a-h Game theory and strategy          FAIL                    GT-01, GT-03 to GT-07, GT-11, GT-12 to GT-17, ECO-04/GT-06


 1.1 What the earlier page-15 labels map to
Earlier label                       Now                   Earlier label                          Now
E-1 buy guard + server intent       ECO-01, UX-01         S-3, S-4                               SEC-15, SEC-17 (inferred)
rule
I-1                                 UX-01                 N-A shake/flash setting                UX-04
I-2                                 sound (UX verdict     N-B                                    UX-05 (inferred)
                                    table)
I-3 PWA back                        UX-03                 A-1, A-2, A-4                          UX-08, UX-07, UX-06 (A-3 sound)
I-4                                 UX-02 (inferred)      D-1                                    GT-05 (inferred)




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 4
Earlier label                      Now                 Earlier label                            Now
E-2                                ECO-02 (inferred)   D-2                                      GT-06, ECO-04
S-1 REQUIRE_SERVER_VILLAGE SEC-01                      D-3                                      UX-09 (UX lane) / GT-07 (GT lane), both
                                                                                                inferred
R-1 server field in store builds   SEC-03              D-4                                      GT-01, GT-12
S-2 label allowlist                SEC-02              D-5                                      GT-09 or GT-10 (inferred)
G-1 late-report rule               SEC-04              D-6                                      GT-13, GT-17 (inferred)
O-1 source maps                    OPS-02, STB-02      Air and regressing tiers                 GT-03, GT-04, GT-09
O-2 Android renderer               OPS-03, STB-04      Keep 15 cliff gate                       GT-08
E-3 endReason/tier/abandon         OPS-06              multi-seed campaigns, Jade lifetime      GT-11, ECO-03
                                                       model
R-2 version bump guard             OPS-01, SAV-08      R-3 web rollback doc                     OPS-05
R-4 runbook annotations            OPS-07              session envelopes                        STB-05, OPS-08


 1.2 Duplicates: do these together, close them together
 Several lanes found the same hole from different sides. Do the primary item. Fold the other item's tests and Done
 when into it, and close both IDs in one commit.

Primary    Also closes                                         Shared hole
ECO-01     UX-01                                               Double purchase: client buy guard, controller single-flight, server
                                                               one-open-intent rule, no duplicate grant
OPS-02     STB-02                                              Hidden source maps uploaded privately; a release id per build
OPS-03     STB-04                                              Android onRenderProcessGone; record renderer death on both platforms
STB-05     OPS-08                                              Crash-free rate: context on reports, a session denominator, correct
                                                               RELEASE.md
OPS-01     SAV-08                                              Version-bump guard for app version, SAVE_VERSION, PROTOCOL_VERSION,
                                                               SIM_RULES, migrations; a live previous-client contract check
SAV-12     SEC-05                                              X1: backdated time-window claims (owner decision first)
SEC-12     ECO-07                                              P4: sandbox credit daily cap required in production
OPS-05     SEC-09 (code part)                                  One-command rollback, web and server
GT-06      ECO-04                                              D-2: casual loss vs loot, late raid value
GT-11      ECO-03 (model part)                                 Multi-seed campaigns with CIs; Jade lifetime supply/sink model
STB-09     UX-05 (audio resume), SAV-07 (pause when            Lifecycle: timers, audio and polling on hide/pause/resume
           hidden)
OPS-14     UX-10                                               Review prompt counts wins only on "Return home"; recent-problem guard
SEC-01     (with GT-01)                                        Ranked trust: device villages and non-zero-sum honor; land SEC-01 first,
                                                               then GT-01
SEC-04     (with SAV-11)                                       Late reports: a detection and rule, plus telling the player when a late report
                                                               becomes practice




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                          Page 5
 2. Phases (do them in this order)
 The order follows the masterclass triage. Save, purchase and first-run paths are release blockers. Then come
 integrity and stability, then release machinery, then polish, and balance last, because balance needs the multi-seed
 tooling and a stable pipeline. Within a phase, go in the order listed. A phase may take a whole session; the ledger
 lets the next session continue.

 Phase 0: set up and baseline (no code changes)
 1. npm ci. Then npm test, npm run lint, npm run build, npm run typecheck:server, npm run server:build. Record the
    results and the chunk sizes in the ledger.
  2. Create docs/audit/bulletproof-2026-11-21/PROGRESS.md with one row per work item in this document (the index in
    section 3), all open.
  3. Owner decisions: ask the owner for the decisions in section 2.9. Do not start an item that needs one until the
    decision is recorded in docs/DECISIONS.md.

 Phase 1: money and input safety (release blockers)
 ECO-01 (+UX-01) → ECO-02 → SEC-03 → UX-03 → UX-02 → UX-09 → ECO-08 → ECO-10 → ECO-09 → ECO-06.
 Gate: the double-purchase server tests and the happy-dom double-tap test pass. A store build has no
 server-address field. Back closes the top dialog in the web build and the PWA. Smoke Bomb can be tapped at
 568×320 and 640×360.

 Phase 2: ranked integrity and server hardening
 SEC-01 → GT-01 (needs owner decision D2) → SEC-02 → SEC-04 → SEC-12 (+ECO-07) → SEC-17 → SEC-15 → SEC-13
 → SEC-06 → SEC-07 → SEC-14 → SEC-10 → SEC-16 → SAV-12 (+SEC-05, after decision D1).
 Gate: with REQUIRE_SERVER_VILLAGE=1, a device-held village gets no honor, no ranked opponents, no loot from server
 villages and no war chest (server tests). Metric label cardinality is bounded. Production checkConfig refuses missing
 security switches.

 Phase 3: save and network durability
 SAV-01 → SAV-02 → SAV-03 → SAV-04 → SAV-05 → SAV-07 (+STB-09 timers) → SAV-06 → SAV-10 → SAV-11 → SAV-13
 → SAV-09 → SAV-14.
 Gate: the IndexedDB-failure path can never upload or adopt a throwaway village (test). A damaged save is never
 overwritten without a verified backup. The last 3 good saves are kept and loaded automatically. A real save fixture
 for every SAVE_VERSION loads in CI. Clients back off with jitter and pause when hidden.

 Phase 4: crashes and observability
 STB-01 → STB-03 → OPS-02 (+STB-02) → OPS-03 (+STB-04) → STB-05 (+OPS-08) → STB-06 → OPS-06 → OPS-07.
 Gate: a deliberately thrown error in a production build shows a readable stack (in a local Sentry-envelope test with
 the uploaded maps, or with sentry-cli sourcemaps explain). Android survives a forced renderer kill (chrome://crash in
 the WebView, a device step). Push registration never throws on a build without Firebase. An error thrown in a scene
 update is caught, reported and recovered.

 Phase 5: release machinery
 OPS-01 (+SAV-08) → OPS-05 (+SEC-09 code part) → OPS-04 → OPS-09 → OPS-10 → OPS-12 → SEC-08 → OPS-13.
 Gate: CI fails when save, rules, protocol or migrations change without a version bump. MIN_CLIENT_BUILD can tell
 builds apart. Rolling back the web build and the server is one documented command each, rehearsed once on
 staging and recorded. Kill switches turn off a product and a feature on staging without a store update.

 Phase 6: performance, polish and accessibility
 STB-07 → STB-08 → STB-09 (+UX-05) → STB-10 → UX-04 → UX-06 → UX-07 → UX-08 → OPS-14 (+UX-10) → UX-11.
 Gate: no first-use painting during a battle (the frame-time probe in the item). The boot script is under the item's size
 budget. A bundle-size test exists. The shake/flash setting is honoured with reduced motion on. Every tap target is ≥
 44 px at 320 px wide.


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 6
 Phase 7: balance (game-theory session; one SIM_RULES bump at most for the whole phase)
 GT-11 (multi-seed tooling, CIs and the Jade model, with ECO-03) → GT-02 → GT-08 → GT-03 → GT-04 → GT-06
 (+ECO-04, after decision D3) → GT-05 → GT-07 → GT-09 → GT-10 → GT-12 → GT-13 → GT-16 → GT-17 → GT-14 →
 GT-15.
 Gate: campaign gates are judged on at least 8 seeds with confidence intervals. A Keep-by-Keep gate (not paired
 averages) covers casual Keep 4 and regular Keep 15. Air is above the destruction floor at every Keep from 6. No
 newer tier scores below its predecessor at the Keep it unlocks. Run npm run rules:snapshot before the single
 SIM_RULES bump.


 Phase 8: documents and the owner hand-off
 OPS-11 → OPS-13 (if not done) → hand the owner Part C with every code-side prerequisite marked done or open.

 2.9 Owner decisions needed before some items can close
#    Decision                                                                                    Blocks           Options recorded in
D1   X1: how far back a time-window claim may be dated while idle (keep 12 h for offline play,   SAV-12, SEC-05   SAV-12
     or require per-device last-contact evidence)
D2   Honor model: should a lost defense cost honor, and should wins against generated bases      GT-01, GT-12     GT-01
     earn honor?
D3   Casual loss vs loot target: how much of their loot casual players may lose                  GT-06, ECO-04    GT-06
D4   A duplicate Season Scroll receipt: refund it, or credit it to the next season               ECO-01 step 4    ECO-01
D5   Certificate pinning: yes or no, and on which hosts                                          SEC-16           SEC-16
D6   Under-18 cap currency: count in local money, using the store's reported price               ECO-06           ECO-06
D7   Crash reports: keep opt-in, or ask at first launch; the Sentry project, region and alert    STB-12, OPS-02   STB-12
     routing
D8   REQUIRE_SERVER_VILLAGE rollout: on at launch, or on after a migration window                SEC-01           SEC-01




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                    Page 7
 2.10 The Go/No-Go gate, mapped to this document
 From the masterclass. Every line must be a yes, or have a named owner and an accepted risk. A blank is a no.
Gate line                                               Code work that must be done       Evidence only the owner, a device or players
                                                        first                             can give
Crash-free sessions ≥ 99.5 % in beta, symbolicated      STB-01, STB-03, STB-06, OPS-02,   Beta cohort crash-free rate from Sentry or the
reports verified                                        OPS-03, STB-05                    store consoles (OWN)
Save, kill, reinstall, restore and cloud-sync round     SAV-01 to SAV-05, SAV-09          SAV-15, SAV-16 device runs
trip on two devices
Every purchase path tested for success, failure,        ECO-01, ECO-02                    ECO-05 in both store sandboxes
cancel, restore and refund with a real transaction
Receipts validated server-side and rewards granted      ECO-01, ECO-02, ECO-09, SAV-10    Sandbox refund and replay runs
exactly once
Release build tested on the oldest supported device     STB-07, STB-08, STB-10            STB-11 (2 GB Android, older iPhone)
with stable frame pacing
First-run flow tested by at least 5 strangers with no   GT-02, OPS-11 (protocol)          Silent playtest notes (OWN)
help
Economy spreadsheet and simulation reviewed             ECO-03, GT-11, GT-06              Owner sign-off on decision D3
Solver or bot verified that all content can be          GT-09, GT-11 (searched attacker   none
completed                                               in CI)
No dominant strategy above threshold                    GT-03, GT-04, GT-07, GT-01        Closed-beta meta watch (GT-14)
Network failure, offline and server-down paths show SAV-05, SAV-06, SAV-07, SAV-11,       Link-conditioner runs at 500 ms and 5-20 % loss
clear, recoverable states                           SAV-13                                (SAV-16)
Privacy policy, consent flows, data safety forms and    OPS-10, SEC-14                    OWN-04, OWN-05, OWN-07, OWN-08
age rating match actual behaviour
Store metadata, screenshots and review notes            OPS-12                            OWN items for listings and screenshots
accurate and complete
Debug menus, test keys and verbose logging              SEC-03, SEC-12, SEC-17            Release-build check on a device
removed or gated
Kill switches, remote config and feature flags tested   OPS-09, OPS-01                    Staging drill record
in production configuration                             (MIN_CLIENT_BUILD live)
Hotfix rehearsal done and day-0 patch ready             OPS-01, OPS-05, OPS-13            Rehearsal through store review (OWN)
Dashboards, alerts and on-call owner set for launch     OPS-07, OPS-06, SEC-02            On-call rota (OWN)
week
Retention gates defined in advance, and soft-launch OPS-11                                Soft-launch data
data meets them
Support channels, canned responses and                  OPS-13                            Support email live (OWN-04)
known-issues list ready
Signing keys, certificates and credentials backed up    none                              OWN
in two secure places
A written rollback plan exists, and someone other       OPS-05, SEC-09                    Second reader's sign-off
than its author has read it


 2.11 The 20 Laws, as they apply here
 1. Saves are sacred: Phase 3 comes before polish. SAV-01 is the worst save bug found.
 2. A crash-free rate under 99.5 % kills: today it cannot even be measured (STB-05).
 3. The first five minutes: GT-02 (casual Keep 4 dip, days 2-6).
 4. Players do what the rules reward: GT-01 (honor is not zero-sum).
 5. A boring best strategy makes a boring game: GT-07 (one army wins).
 6. Never trust the client with value: SEC-01, ECO-02.
 7. Test the release build on the worst device and a bad network: STB-11, SAV-16.
 8. Idempotency beats cleverness: ECO-01, SAV-10.
 9. Models beat intuition: GT-11, ECO-03.
 10. A rehearsed hotfix: OPS-01, OPS-05.
 11. Every metric you reward will be gamed: GT-01, GT-12, GT-13.
 12. Fun with the systems off: GT-16 (the signature Smoke Bomb adds little).



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                         Page 8
  13. Prove solvability by machine: GT-09, GT-11.
  14. Honest UX: keep everything in the "verified sound" lists.
  15. Observe strangers: OPS-11.
  16. Control after release: OPS-09.
  17. Read the store guidelines the week you submit: OWN items.
  18. Plan the patch cadence: OPS-13.
  19. Content runway: GT-15.
  20. Ship what you can support: OPS-07, OPS-13.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)   Page 9
 3. Work-item index (machine-readable)
 One row per work item. "Phase" is the phase in section 2. "Dup" names the primary item when this one is folded
 into another.
ID        Sev        Phase           Kind            Compartment                 Dup of   Title
SEC-01    BLOCKE     2               CODE            server                               Device-held villages are fully trusted in
          R                                                                               ranked play: add REQUIRE_SERVER_VILLAGE
                                                                                          (earlier S-1)
ECO-01    HIGH       1               CODE            presentation/ui                      Double charge for one-time products: no buy
                                                                                          guard and no single-open-intent rule (earlier
                                                                                          E-1)
ECO-05    HIGH       Owner/device    DEVICE          ops                                  Store prices and every IAP path still
                                                                                          unverified on devices and storefronts
                                                                                          (GLOBAL-007, plus purchase-path device
                                                                                          checks)
GT-01     HIGH       2               DESIGN          gameplay/data, server                Honor is not zero-sum: no loss on defense,
                                                                                          gains against generated bases, win-trading
                                                                                          pays both sides (earlier D-4, LD-2; inferred
                                                                                          D-6 in part)
GT-02     HIGH       7               TOOLING +       tests, gameplay/data                 The casual early dip moved from Keep 3 to
                                     DESIGN                                               Keep 4 (days 2-6) and the gates cannot see
                                                                                          it (earlier "Keep 3 dip")
GT-03     HIGH       7               DESIGN          gameplay/data                        Air is a dominated family: weakest and most
                                                                                          expensive from Keep 6 (earlier "Air")
GT-04     HIGH       7               DESIGN          gameplay/data                        Newer warrior tiers score below older ones
                                                                                          and 20 kits do nothing: unlocking is a
                                                                                          sunk-cost trap (earlier "regressing tiers")
GT-05     HIGH       7               DESIGN (+       gameplay/data, server                Late defense barely matters, costs a month
                                     server)                                              on the fortress path, and does nothing
                                                                                          online (inferred earlier D-1; WORLDWIDE S1,
                                                                                          P2-12)
GT-06     HIGH       7               DESIGN          gameplay/data                        Casual players lose about what they loot,
                                                                                          and late raiding is a small share of income
                                                                                          (earlier D-2)
OPS-01    HIGH       5               CODE            integration and                      Version identity is frozen at 0.1.0; add a
                                                     backend/analytics)                   version-bump guard and per-build release
                                                                                          ids (earlier R-2)
OPS-02    HIGH       4               CODE            ops and integration,                 Hidden source maps, uploaded privately to
                                                     backend/analytics                    Sentry, never shipped (earlier O-1)
OPS-03    HIGH       4               CODE            ops                                  Android renderer process death kills the app
                                                                                          and is never reported (earlier O-2)
SAV-01    HIGH       3               CODE            integration                          If IndexedDB fails to open, a returning player
                                                                                          silently gets a throwaway village that still
                                                                                          goes online and can wipe the real village
SEC-02    HIGH       2               CODE            server                               Unbounded Prometheus label values from
                                                                                          client headers (earlier S-2, "label allowlist")
SEC-03    HIGH       1               CODE            backend/net + integration            Store builds let a player point the app at any
                                                                                          server, a phishing path and a sign-in token
                                                                                          relay (earlier R-1)
STB-01    HIGH       4               CODE            backend, ops, server                 Android app crashes (and can crash-loop)
                                                                                          when push is enabled without Firebase
                                                                                          config
STB-02    HIGH       4               CODE            integration, ops, backend   OPS-02   No source maps and one release id for every
                                                                                          build, so crash stack traces cannot be read
                                                                                          (O-1)
STB-03    HIGH       4               CODE            integration,                         An uncaught exception in any scene update
                                                     presentation/render                  or render stops the game loop for good
                                                                                          (frozen map, no recovery)
STB-04    HIGH       4               CODE            ops, integration, backend   OPS-03   WebView renderer death is unhandled on
                                                                                          Android (the app dies) and unrecorded on
                                                                                          both platforms (O-2); no unclean-exit signal
STB-11    HIGH       Owner/device    DEVICE          ops, presentation/render             Device evidence for stability and
                                                                                          performance is still missing (R03, R08)




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                      Page 10
ID        Sev        Phase           Kind            Compartment                     Dup of   Title
UX-01     HIGH       1               CODE            presentation/ui                 ECO-01   Purchase flow has no in-flight guard: double
                                                                                              tap = two confirms = two purchases (earlier
                                                                                              I-1)
UX-02     HIGH       1               CODE            presentation/ui                          Short landscape: "End battle" covers the
                                                                                              Smoke Bomb card once Speed appears
                                                                                              (earlier I-4, inferred)
UX-03     HIGH       1               CODE            integration + presentation/ui            Web/PWA Back leaves the game instead of
                                                                                              closing the top dialog (earlier I-3, "PWA
                                                                                              back")
ECO-02    MEDIUM 1                   CODE            server                                   Receipt replay re-delivers a purchase
                                                                                              already delivered on the device into a later
                                                                                              server village (earlier E-2, inferred label)
ECO-03    MEDIUM 7                   DESIGN          gameplay/data                   GT-11    Jade (and resource) lifetime supply-vs-sink
                                                                                              model is missing; paid and free Jade are not
                                                                                              separated
ECO-04    MEDIUM 7                   DESIGN          gameplay/data                   GT-06    Casual players lose more to raids than they
                                                                                              loot; late raiding is economically negligible
                                                                                              (earlier D-2; S3 open)
GT-07     MEDIUM 7                   DESIGN          gameplay/data,                           One army wins: the raid-bot mix (= the
                                                     gameplay/sim                             Suggested army) dominates at Keep 15, and
                                                                                              Keep 12 has one best answer to every
                                                                                              temper (inferred earlier D-3; WORLDWIDE
                                                                                              S2)
GT-08     MEDIUM 7                   TOOLING +       tests, gameplay/data                     The Keep 15 cliff is real in every seed, and
                                     DESIGN                                                   the pair rule hides it (earlier "Keep 15 cliff
                                                                                              gate", 4.8)
GT-09     MEDIUM 7                   DESIGN          gameplay/sim,                            The Shadow Trials ladder is a sawtooth:
                                                     gameplay/data                            each Keep's last tier is unclearable with a
                                                                                              capped army, and the next tier is trivial
                                                                                              (inferred earlier D-5 / "regressing tiers")
GT-10     MEDIUM 7                   DESIGN + UI     gameplay/data                            A declared 3★ stake is partly a lottery and
                                     request                                                  the stake screen shows no odds (17g)
GT-11     MEDIUM 7                   TOOLING         tools/progression, tests                 Methods gap: single-seed campaigns, no
                                                                                              searched attacker in CI, no Jade lifetime
                                                                                              model, no telemetry plan (17h)
GT-12     MEDIUM 7                   DESIGN          gameplay/sim, server                     The Power Ranking is mostly Keep, and the
                                                                                              rating's power term uses the Keep, not
                                                                                              research (earlier D-4)
OPS-04    MEDIUM 5                   CODE            ops                                      Native test builds cannot target the staging
                                                                                              server; client environment is not
                                                                                              staging/production
OPS-05    MEDIUM 5                   CODE + DOCS ops, docs                                    One-command rollback for the web build
                                                                                              and the server, with forward-only limits
                                                                                              (earlier R-3)
OPS-06    MEDIUM 4                   CODE            backend/analytics, with                  Statistics lack battle end reason, Trial tier
                                                     gameplay/control                         and quits (earlier E-3)
OPS-07    MEDIUM 4                   DOCS (+         ops, docs                                Runbooks and alert routing for every alert
                                     small config)                                            (earlier R-4)
OPS-08    MEDIUM 4                   DOCS + CODE backend/analytics, docs             STB-05   Crash-free-session measurement: correct
                                                                                              the docs, optionally add opt-in Sentry
                                                                                              sessions
OPS-09    MEDIUM 5                   CODE            server, backend                          Server-side kill switches for products and
                                                                                              features
OPS-10    MEDIUM 5                   CODE (+     ops                                          App-level PrivacyInfo.xcprivacy for the
                                     OWNER Xcode                                              iPhone app
                                     vali
OPS-11    MEDIUM 8                   DOCS            docs                                     Adopt a soft-launch plan with KPIs and kill
                                                                                              criteria, and a device-test matrix with
                                                                                              protocol
SAV-02    MEDIUM 3                   CODE            gameplay/sim +                           A damaged save is overwritten even when
                                                     backend/persist                          its backup could not be written
SAV-03    MEDIUM 3                   CODE            gameplay/sim +                           No rolling "last good" saves; one bad field
                                                     backend/persist                          replaces the whole village




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                          Page 11
ID        Sev        Phase           Kind            Compartment                 Dup of   Title
SAV-04    MEDIUM 3                   CODE            backend/net                          "Sign out this device" can drop unsent
                                                                                          actions and won raids
SAV-05    MEDIUM 3                   CODE +          backend/net                          Scouting on a poor connection forfeits a won
                                     DESIGN                                               raid whose report has not arrived
SAV-06    MEDIUM 3                   CODE            backend/net                          One 15 s timeout for every body; large
                                                                                          uploads never complete on slow links
SAV-07    MEDIUM 3                   CODE            backend/net                          Connection retry has no jitter, no breaker
                                                                                          and no background pause; an outage or
                                                                                          recovery causes retry storms
SAV-08    MEDIUM 5                   CODE +          integration + ops           OPS-01   No guard forces SAVE_VERSION or
                                     OWNER                                                PROTOCOL_VERSION bumps; the
                                                                                          previous-client contract check is inert
SAV-09    MEDIUM 3                   CODE            gameplay/sim                         Migration tests lack a real-save fixture for
                                                                                          each version
SEC-04    MEDIUM 2                   CODE            server                               No rule or detection for late battle reports
                                                                                          and tool-assisted deployments (earlier G-1)
SEC-05    MEDIUM 2                   CODE            server                      SAV-12   Backdated time-window claims (X1, still
                                                                                          open)
SEC-06    MEDIUM 2                   CODE            server + gameplay/sim                Look-alike names in other scripts pass
                                                                                          uniqueness (S5 open part)
SEC-07    MEDIUM 2                   CODE            server                               Staff tools cannot undo a cheater or rescue
                                                                                          a taken-over account
SEC-08    MEDIUM 5                   CODE            server / ops                         Load test has no 10× target and skips the
                                                                                          server-held traffic that dominates at launch
SEC-09    MEDIUM 5                   OWNER           ops                         OPS-05   Autoscaling, spend alerts, PITR and
                                                                                          one-command rollback are not set up
STB-05    MEDIUM 4                   CODE            backend, integration                 Crash reports lack context and a session
                                                                                          denominator; crash-free rate cannot be
                                                                                          computed
STB-06    MEDIUM 4                   CODE            presentation/render,                 WebGL context loss has no player-facing
                                                     integration                          handling, timeout or report
STB-07    MEDIUM 6                   CODE (with a    presentation/render,                 First-use painting causes stutter at battle
                                     DEVICE meas     integration                          open and in the middle of a battle
STB-08    MEDIUM 6                   CODE            integration, localization            First paint waits on a 193 KB inline boot
                                                     tooling, backe                       script with every language's boot strings
STB-12    MEDIUM Owner/device        OWNER           ops                                  Crash-reporting operations are owner
                                                                                          decisions: default opt-in, Sentry project,
                                                                                          console vitals
UX-04     MEDIUM 6                   CODE            presentation/render                  Screen shake and flashes ignore reduced
                                                                                          motion; no in-game motion/shake setting
                                                                                          (earlier N-A)
UX-05     MEDIUM 6                   CODE            presentation/audio          STB-09   Audio: an iOS "interrupted" AudioContext is
                                                                                          never resumed by a tap; no volume levels
                                                                                          (earlier N-B, inferred)
UX-06     MEDIUM 6                   CODE            presentation/ui                      Purchase flow and Jade entry have poor
                                                                                          accessible names (earlier A-4)
UX-07     MEDIUM 6                   CODE            presentation/ui                      Top-bar Builders/Honor pills and the unlock
                                                                                          chip are under 44 px with no hit-area
                                                                                          extension (earlier A-2)
UX-08     MEDIUM 6                   CODE +          presentation/ui                      No in-game text size; OS text size untested;
                                     DEVICE                                               canvas text fixed px (earlier A-1)
ECO-06    LOW        1               OWNER           server                               Under-18 cap and revenue counted in
                                                                                          catalog USD for most purchases; promo and
                                                                                          multi-quantity ignored
ECO-07    LOW        2               OWNER           server                      SEC-12   Sandbox/TestFlight credit has no
                                                                                          server-wide daily cap by default (P4)
ECO-08    LOW        1               DESIGN          presentation/ui                      Paying to rush the Keep: warning only on the
                                                                                          sheet, not at the Jade spend (E06)
ECO-09    LOW        1               CODE            server                               App Store certificate validity checked at
                                                                                          server time, not the JWS signing time
                                                                                          (inferred)




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 12
ID        Sev        Phase           Kind            Compartment                 Dup of   Title
ECO-10    LOW        1               CODE            presentation/ui                      Store asks the store for the retired
                                                                                          offer_rebuild, so prices are never
                                                                                          "complete"
GT-13     LOW        7               DESIGN          server, gameplay/data                War chests reward a token attack (free
                                                                                          riders and slot griefing) (inferred earlier D-6
                                                                                          in part; E14)
GT-14     LOW        7               TOOLING         tests, server                        Rating placement and smurf handling
                                                                                          unproven at launch population
GT-15     LOW        7               DESIGN          gameplay/data                        Content runway after Keep 15 is thin for a
                                                                                          regular player (≈ day 104)
GT-16     LOW        7               DESIGN          gameplay/data                        Smoke Bomb, the signature tactic, adds
                                                                                          little
GT-17     LOW        7               DESIGN          server                               Alt-account feeding through server villages
                                                                                          and troop gifts is bounded only by caps
OPS-12    LOW        5               CODE            ops                                  Store preflight misses Sentry DSN, public
                                                                                          URL and other launch variables
OPS-13    LOW        5               DOCS            docs                                 Launch-day and live-ops documents: known
                                                                                          issues, support macros, hotfix path, sunset
OPS-14    LOW        6               CODE            integration via backend              Review prompt: stale comment and no
                                                     request                              "recent problem" guard
SAV-10    LOW        3               CODE + DOCS backend/net                              Idempotency-Key is regenerated on every
                                                                                          attempt, so it never dedupes a client retry
SAV-11    LOW        3               CODE +          server + presentation/ui             R02 residue: raid reports later than 72 h,
                                     DESIGN                                               and all war/duel reports after 1 h, become
                                                                                          practice with no message
SAV-12    LOW        2               DESIGN          server                               X1: windowed claims may be dated up to 12
                                                                                          h back while the village is idle (owner
                                                                                          decision)
SAV-13    LOW        3               CODE + DOCS backend/net +                            No client-server time sync: serverTime is
                                                 gameplay/control                         ignored and war phases use the device clock
SAV-14    LOW        3               CODE            gameplay/control                     Every command writes the whole village,
                                                                                          uncoalesced
SAV-15    LOW        Owner/device    OWNER +         presentation/ui + ops                Reinstall, eviction and restore paths are
                                     DEVICE                                               unverified, and linking is never prompted
SAV-16    LOW        Owner/device    DEVICE          ops                                  Device checks for save durability and
                                                                                          network handoff
SEC-10    LOW        2               CODE            integration + backend/pwa            No Content-Security-Policy on the web game
                                                                                          (F2, still open)
SEC-11    LOW        Owner/device    CODE +          backend/platform                     iOS sign-in token likely in device backups
                                     DEVICE                                               (F3, still open)
SEC-12    LOW        2               OWNER +         server                               Sandbox credit cap off by default in
                                     CODE                                                 production (P4, still open)
SEC-13    LOW        2               CODE            server                               Friend, Gang and Alliance size caps checked
                                                                                          outside a transaction (L1, still open)
SEC-14    LOW        2               CODE            server                               Deletion leaves a deleted player's name and
                                                                                          id in shared rows until retention
SEC-15    LOW        2               CODE            server                               Account creation limited only per IPv4 / IPv6
                                                                                          /64 (possible earlier S-3)
SEC-16    LOW        2               DOCS            backend/platform                     Certificate pinning decision not recorded
SEC-17    LOW        2               CODE            server                               Production config check misses several
                                                                                          security switches (possible earlier S-4)
STB-09    LOW        6               CODE            backend, integration,                Lifecycle gaps: network timers run while
                                                     presentation/audio                   hidden, Capacitor pause path is incomplete,
                                                                                          iOS "interrupted" audio is never resumed
STB-10    LOW        6               CODE            integration                          No size budget gate for the shipped bundle
UX-09     LOW        1               CODE            presentation/ui                      Delete saved army is one tap with no
                                                                                          confirm or undo (earlier D-3, inferred)
UX-10     LOW        6               CODE            presentation/ui             OPS-14   Review prompt counts wins only when the
                                                                                          player taps "Return home"




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 13
ID        Sev        Phase           Kind            Compartment                Dup of   Title
UX-11     LOW        6               DEVICE (then    integration /                       Battle keeps running behind iOS Control
                                     CODE if con     presentation/render                 Center / notification shade




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                Page 14
 Part B: work items by lane
 Each lane below is copied from its auditor's report. The lane's verdict table and "verified sound" list are in
 Appendices A and B, and the full reports are in docs/audit/bulletproof-2026-11-21/.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 15
 Lane ECO: Economy, monetization and real-money integrity
 Scope: every IAP path (client, native plugins, server), receipt checks, refunds, double-spend, ads, sinks and faucets,
 local prices (GLOBAL-007), farming, arbitrage, Sybil, pay-to-win, minors, loot-box and subscription rules. Method: I
 read the code (file:line below) and re-checked each earlier claim against it. Limits: node_modules is absent here, so I
 ran no test, no npx tsx script and no balance tool. All numbers come from the generated
 docs/game-theory/CAMPAIGN.md and from docs/audit/understand-2026-11-16/economy.md (measured there, not
 re-measured here). No device, store sandbox, Postgres or Redis was used. Anything marked "(inferred)" is
 reasoning from code that I did not execute.

 ECO-01 — Double charge for one-time products: no buy guard and no single-open-intent
 rule (earlier E-1)
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: presentation/ui (with server and gameplay/control)
 • Checklist refs: Checklist 3.3 (double-spend / idempotent purchase); Masterclass 19 Economy modeling
    (real-money integrity)
  • Evidence:
    • src/presentation/ui/economyUi.ts:133-138: the buy button is enabled from price() only and never disabled on
       click. buy() :179-224 has no in-flight flag. After the confirm closes, the Store modal (still open) is live during
       await this.storefront() (:206, up to 10 s on first use) and await this.c.purchase(productId) (:219), which spans
       the intent HTTP call, the store sheet and the redeem HTTP call. The pass card redraws only after buy resolves
       (:437, after = redraw).
     • src/gameplay/control/controller.ts:329-360: purchase() re-checks canPurchase against state, but pass.premium is
       only set after redeem (:389-391), so a second Scroll purchase passes canPurchase (monetization.ts:133).
     • server/core/purchases.ts:155-165: the P2 check runs canPurchase on the stored village and ignores this player's
       open intents. Two intents for lantern_pass (or an offer, or the stipend) both pass. The intent check runs only for
       server-held villages (if (row)).
     • server/core/purchases.ts:338: each receipt is accepted with its own unused intent for the product.
       src/gameplay/sim/village.ts:1221-1241: grantPurchase(..., verified=true) skips canPurchase and re-sets
       pass.premium for a village that already has it. The second $4.99 buys nothing. A second one-time offer is
       delivered again (the player gains, and oncePerAccount is broken). A pending Ask-to-Buy Scroll (7-day hold)
       followed by a second request gives the same double charge once a parent approves both.
     • android/.../TkBillingPlugin.java:205 versus :223: the pendingPurchase test and its set are not atomic
       (inferred). A second call can overwrite the first PluginCall, whose promise then never resolves, so the client
       never redeems or finishes that purchase until the next start.
     • No test covers two intents for one one-time product
       (tests/backend/server/security-audit-2026-11-20-money.test.ts:94-129, purchases.test.ts:135-335).
  • Fix:
    1. EconomyUi: add private buying: string | null. At the top of buy(productId), return when buying is set. Set it
       before ensureAge(), clear it in finally. Make buyButton render disabled while buying !== null and redraw the
       Store when it changes. Show "Purchase in progress…" on the button that was tapped.
     2. GameController.purchase: keep a single-flight private purchasing: Promise<PurchaseOutcome> | null. A second
       call while one runs returns { ok:false, code:'IN_PROGRESS' } with the text through t() (locales/en/ui.json).
     3. server/core/purchases.ts purchaseIntent: inside the locked transaction, for product.kind in offer|pass|stipend,
       refuse (403 purchase_refused, new key purchase.already_in_progress) when the player has another intent for
       the same productId with !used && holdUntil > now. Do this for device-held villages too: the rule needs only the
       intent table. Add Repo.openIntentsFor(playerId, productId, now) to the memory store and the pg store (a
       query, no schema change; add a new numbered migration only if an index is wanted).
     4. Redeem: when heldOnServer and the village already has pass.premium for passSeason(now) and the product is
       the Scroll (or offers.bought has a oncePerAccount offer), do not grant twice. Refuse with purchase.already_owned,
       leave the store transaction unfinished, log it for support/refund, and count
       tk_refused_total{reason:'duplicate_one_time'}. An owner decision is needed on whether to credit a duplicate



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 16
       Scroll to the next season instead.
     5. TkBillingPlugin.purchase: claim pendingPurchase synchronously (synchronized check-and-set before
       connected(...)) and release it on every early reject.
  • Tests: write first: (a) tests/backend/server/purchases.test.ts "two Scroll intents: the second is refused while the
    first is open" (fails today: both return tokens); (b) "a second Scroll receipt for a premium village is not granted
    and not finished"; (c) tests/presentation/dom/ happy-dom test: click a Jade pack buy button twice with a pending
    purchase promise, and controller.purchase is called once; (d) controller test: two concurrent purchase() calls with
    a slow mock verifier, and the second returns IN_PROGRESS.
  • Done when: no sequence of taps, devices or Ask-to-Buy approvals produces two credited Scroll purchases (or two
    oncePerAccount offers) for one player in one season in the server tests. All buy buttons are disabled while a
    purchase runs (DOM test).
  • Don't break: real prices only in the Store and its confirm (the progress label carries no price); under-18 cap and
    GLOBAL-004/005 holds; cancelled intents still free the hold; server owns truth; no SAVE_VERSION or SIM_RULES
    change needed (none of these fields are stored in the save).

 ECO-02 — Receipt replay re-delivers a purchase already delivered on the device into a
 later server village (earlier E-2, inferred label)
  • Severity: MEDIUM
  • Status: FAIL
  • Kind: CODE
  • Compartment: server
  • Checklist refs: Checklist 3.3 (replay protection, idempotent grants); Masterclass 19 Economy modeling
  • Evidence: server/core/purchases.ts:279-301. For a known row with heldOnServer=false, the server grants
    grantPurchase(verified) into the player's current server village whenever that village lacks the transaction id. The
    intent is legitimate: "the device may never have delivered it". Two ways to abuse it:
     • (a) startVillage (server/core/village.ts:134-155) creates a fresh village after the purchase. A modified client
       resends the old Apple JWS (bearer token, no age limit, apple.ts:164-168) or the consumed Google token
       (google.ts:141: a consumed purchase is still accepted), and every earlier device-delivered purchase is
       delivered again.
     • (b) checkProvenance (server/core/villageImport.ts:129-155) rebuilds purchases only from records the file carries
       and never marks credited rows the file left out. A device save with the purchase record stripped imports with
       its spent progress, then the replay credits the Jade a second time into the same online village.
    • The existing test purchases.test.ts:295-313 covers only the honest case (Google token never consumed).
  • Fix:
    1. In redeem's known-row branch, before granting into the server village: for Google, re-read p.consumed. A
       consumed token whose row is !heldOnServer means the device delivered it, so answer { already: true,
       heldOnServer: false } without granting.
     2. For Apple (no finished signal), grant only when the server village could not have received the purchase from
       the device: the village row's createdAt (startVillage) or its import time (the import ledger line,
       repo.ledgerSumAt(..., 'import', ...)) is earlier than known.at, or the imported file's own clock (state
       last-settled time) is earlier than known.at. Otherwise record an import_holds-style hold for staff
       (purchase.needs_support) instead of granting.
     3. In the import path (villageImport.ts caller), mark credited !heldOnServer rows of this player that the file did
       not carry as held_on_server = true with a ledger note purchase-not-carried. A later replay then answers already
       (needs a new numbered migration only if a new column is used; reusing held_on_server needs none).
  • Tests: write first: purchases.test.ts "a consumed Google purchase delivered on the device is not delivered again
    into a new server village" (fails today: +600 Jade); "an Apple JWS replayed after startVillage is not re-granted";
    ledger-audit.test.ts "an import that drops a credited purchase record cannot be topped up by replaying its
    receipt". The honest test at :295 must still pass.
  • Done when: each credited transaction adds its grants to at most one village per player across device delivery,
    import and new server villages (server tests), and the lost-answer case still delivers once.
  • Don't break: server owns truth; a paid purchase is never lost (route doubtful cases to support, never silently
    drop); Google acknowledge-within-3-days rule; refund and debt flow.



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 17
 ECO-03 — Jade (and resource) lifetime supply-vs-sink model is missing; paid and free Jade
 are not separated
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: DESIGN
 • Compartment: gameplay/data (tools/balance, docs/game-theory)
 • Checklist refs: Masterclass 19 Economy modeling (faucets, sinks, inflation); Checklist 3.x (economy health)
 • Evidence: tools/balance/playerModel.ts:61,179: the model player's only Jade use is huts, and campaign.ts and
    CAMPAIGN.md record no Jade balance. The only supply figures are a 30-day audit scratch measurement
    (docs/audit/understand-2026-11-16/economy.md:14-34: 232-737 free Jade per 30 days, plus 2,540 one-time from
    achievements) and its "sinks with nothing worth buying" list (:49-56). ECO-09 there says sinks are thin. P5-11
    added 6 looks (WORLDWIDE_AUDIT.md:1126), not a model. Coins pile up from Keep 8 with no late sink
    (economy.md:72-78, CU-1 open). Jade is one pool (resources.moonstones), so the owner cannot state outstanding
    paid Jade. That figure is what Japan's Payment Services Act notices (public/shikin-kessai.html is shipped)
    depend on (legal reading inferred, OWNER to confirm).
  • Fix:
    1. tools/balance/playerModel.ts: add a Jade ledger by source (chest, streak, calendar, Scroll free track, bounty,
       wars, league, achievements, obstacles, Trials, seals) and by sink (huts, skips, training skips, top-ups, looks,
       decor), read from the grantReward/command events the sim already emits.
     2. Add a "spender" policy (stipend monthly, Scroll each season) next to the free policies.
     3. tools/balance/campaign.ts: write a "Jade lifetime" table (balance, earned, spent at days 30/90/180/365) and a
       Coins/Provisions surplus-at-cap table into CAMPAIGN.md / campaign.json.
     4. tests/gameplay/balance/campaign-gates.test.ts: gate unspent free Jade at day 365 (upper bound chosen by
       the owner) and a minimum sink share.
     5. Server: add a staff metric of paid Jade still outstanding (ledger purchase:* minus a FIFO share of Jade spends)
       for the PSA base dates. OWNER confirms the legal need.
  • Tests: the new campaign gate first. It fails while campaign.json has no Jade ledger fingerprint.
  • Done when: CAMPAIGN.md shows per-policy Jade supply, sink and balance over 365 days, a gate holds it, and the
    owner has recorded a target ratio in docs/DECISIONS.md.
  • Don't break: combat numbers never in balance bundles; campaign-gates fingerprint discipline (regenerate with npm
    run balance:campaign); no new paid random item; Jade buys resources only as a one-action top-up.


 ECO-04 — Casual players lose more to raids than they loot; late raiding is economically
 negligible (earlier D-2; S3 open)
 • Severity: MEDIUM
 • Status: OWNER
 • Kind: DESIGN
 • Compartment: gameplay/data
 • Checklist refs: Masterclass 19 Economy modeling (reward per minute, Goodhart); Checklist 3.x (casual fairness)
 • Evidence: docs/game-theory/CAMPAIGN.md:59 (casual: 96 % of loot taken by raids), :128 (casual explorer: 160 %),
    :151 (casual who hires: 106 %), against regular 51 % (:13) and fortress 35 % (:197). The earlier audit measured
    raid net per training hour at about 35 % of collector income at Keep 10 and about 5 % at Keep 15 (not
    re-measured here; economy.md:79-81 gives 0.4-1.7 h of production per raid). WORLDWIDE_AUDIT.md:1244 S3 "casual
    players punished" is OPEN. These are offline bot raids: online bot raids do not run (P2-12), so the effect hits
    offline and device-held play.
  • Fix:
    1. Owner decides the target, for example "a one-visit-a-day player keeps ≥ X % of what it loots".
    2. Candidate levers already in data: raids.json exhaustion / recoverShare / lossStreakSlack scaled by
       sessions-per-day, defenseWin.shareOfRaidLoot (owner-locked at 0.10; re-run daily_live.ts before changing it),
       a raid-count cap per absent day.
    3. Add a casual "stolen ÷ looted ≤ target" gate to campaign-gates.test.ts.
  • Tests: the casual stolen/looted gate (fails today at 0.96-1.60).


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 18
  • Done when: the gate passes with the owner's target and CAMPAIGN.md is regenerated.
  • Don't break: defenseWin.shareOfRaidLoot owner decision; SIM_RULES (no combat change needed); simulated raids
    stay labelled; no resource reward for real-player raid holds.

 ECO-05 — Store prices and every IAP path still unverified on devices and storefronts
 (GLOBAL-007, plus purchase-path device checks)
 • Severity: HIGH
 • Status: NEEDS-DEVICE
 • Kind: DEVICE
 • Compartment: ops
 • Checklist refs: Checklist 3.3 (IAP paths); GLOBAL-007
 • Evidence: GLOBAL-007 is still OPEN (docs/store/WORLDWIDE_AUDIT.md:82-88,238). The code paths exist
    (economyUi.ts:120-131, storekit.ts:74-80, playBilling.ts:87-101), but the device script
    docs/store/TESTING.md:24-28 (slow card, kill after pay, reinstall restore, Ask to Buy, refund) has never been run.
    The native plugins are "Not compiled here" (TkStorePlugin.swift:47, TkBillingPlugin.java:184). The 2026-11-20
    security audit "Not run: … a device, a store sandbox".
  • Fix:
    1. TestFlight and Play internal track builds against a staging server.
    2. Run docs/store/TESTING.md §Play Billing and §iPhone in full, plus: two fast taps on Buy (after ECO-01), a Scroll
       bought on two devices at once, at least three storefronts (US, a euro storefront, JP or IN) with screenshots of
       the buttons and confirm against the store sheet, a product removed from one storefront ("Not sold here"),
       airplane mode on Store open ("Price unavailable").
    3. Record results in the GLOBAL-007 closure row.
  • Tests: device checklist (no unit test).
  • Done when: GLOBAL-007 is closed with dated device evidence for each path above.
  • Don't break: real prices only in Store and confirm; sandbox (test) label.

 ECO-06 — Under-18 cap and revenue counted in catalog USD for most purchases; promo
 and multi-quantity ignored
 • Severity: LOW
 • Status: OWNER
 • Kind: OWNER
 • Compartment: server
 • Checklist refs: Checklist (minors' spending cap); GLOBAL-007 limit
 • Evidence: server/core/purchases.ts:117-121: local price counts only with a rate. server/core/context.ts:56: the
    default usdRates: { USD: 1 }. purchases.ts:227-228: Google has currency: null, priceMicros: null, so the catalog
    price always counts. google.ts:132-133: purchaseType 1 (promo code) is credited as Production at catalog cents, so
    a free promo uses up a minor's cap and is counted as revenue. google.ts:134-144: quantity is ignored (inferred:
    harmless unless multi-quantity is enabled in Play Console, when a player would pay N and receive 1).
  • Fix:
    1. Owner sets USD_RATES monthly (docs/SHIPPING.md:240). Make checkConfig warn in production when Apple
       payments are on and USD_RATES has only USD.
     2. Google: treat purchaseType === 1 as environment: 'Promo' with 0 counted cents.
     3. Refuse or log quantity > 1 until it is supported. Document "never enable multi-quantity" in docs/SHIPPING.md
       §3b.
     4. (Optional, inferred) read the charged price from the Play Developer API's order data where available.
  • Tests: purchases-batch.test.ts: "a Google promo purchase counts 0 against the cap".
  • Done when: config warning present, promo counted at 0, SHIPPING note added.
  • Don't break: under-18 cap only gets stricter; P1 difference check.

 ECO-07 — Sandbox/TestFlight credit has no server-wide daily cap by default (P4)
 • Severity: LOW


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 19
  • Status: OWNER
  • Kind: OWNER
  • Compartment: server
  • Checklist refs: Checklist (Sybil / free currency minting)
  • Evidence: server/core/context.ts:55 sandboxDailyCapUsd: null; server/config.ts:249 sets it only from the
    environment; purchases.ts:311-320 per buyer, grouped by client-sent device ids. WORLDWIDE_AUDIT.md security audit
    P4 OPEN.
  • Fix: 1. Owner sets SANDBOX_CREDIT_DAILY_CAP_USD in production. 2. Code: when deploy === 'production', default
    sandboxDailyCapUsd to a small number (for example 50) or make checkConfig an error when unset.
  • Tests: release-config.test.ts: production config without the variable warns or errors.
  • Done when: production cannot start without a sandbox daily cap (or ships with a default).
  • Don't break: App Review purchases still credit (per-buyer $10).

 ECO-08 — Paying to rush the Keep: warning only on the sheet, not at the Jade spend (E06)
 • Severity: LOW
 • Status: PARTIAL
 • Kind: DESIGN
 • Compartment: presentation/ui
 • Checklist refs: Masterclass 19 (whales vs free; spending that harms the buyer)
 • Evidence: src/presentation/ui/hud.ts:1698 (sheet note), src/gameplay/sim/objective.ts:106-108 (only when
    attackerStrength < keep - 1). economyUi.ts:235-246 spendMoonstones shows no warning for a Keep skip or a Keep
    top-up. Rushing still meets stronger bases (economy.md:112-116, reproduced at 2026-11-16).
  • Fix: 1. In the Keep's skip/top-up confirm, append t('keep.armyBehind') when armyBehindKeep(state) (or when one
    Keep behind, owner's choice). 2. No hard gate (design: unrestricted).
  • Tests: DOM test: the Keep skip confirm contains the note when the army is behind.
  • Done when: the warning appears in the spend confirm.
  • Don't break: no real-money figure in the in-village confirm.

 ECO-09 — App Store certificate validity checked at server time, not the JWS signing time
 (inferred)
 • Severity: LOW
 • Status: NEEDS-DEVICE
 • Kind: CODE
 • Compartment: server
 • Checklist refs: Checklist 3.3 (receipt validation)
 • Evidence: server/payments/apple.ts:143-146 compares every certificate with this.o.now(). Apple's own server
    library uses the payload's signedDate when it does no online (OCSP) check (from memory, not checked here). An
    unfinished transaction whose cached JWS was signed under a leaf that has since expired would get a
    non-retryable 400 (purchases.ts:232), become REFUSED (controller.ts:384), and stay charged and undelivered
    (inferred, not reproduced).
  • Fix: 1. Check certificate validity at payload.signedDate (bounded: not in the future, not older than for example 3
    years), keep the chain and signature checks. 2. Check on a device whether StoreKit re-signs jwsRepresentation for
    Transaction.unfinished.
  • Tests: purchases.test.ts: a JWS signed inside the test leaf's validity verifies after the leaf expires.
  • Done when: decided from a device check and tested.
  • Don't break: P3 hardening (OIDs, checkIssued, P-256).

 ECO-10 — Store asks the store for the retired offer_rebuild, so prices are never "complete"
 • Severity: LOW
 • Status: FAIL
 • Kind: CODE



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 20
  • Compartment: presentation/ui
  • Checklist refs: GLOBAL-007 (price loading)
  • Evidence: src/presentation/ui/economyUi.ts:102 builds ids from every offers.rules entry, including rebuild_pack
    (retired: true, productId offer_rebuild). It is not in store.json storeProductIds (removed 2026-11-18, P1-10).
    storeProductId falls back to offer_rebuild (monetization.ts:92-94), which no store returns, so pricesComplete
    (:108) is never true and every Store open re-queries the store.
  • Fix: filter d.offers.rules.filter((o) => !o.retired) in loadPrices.
  • Tests: DOM test: with a mock provider returning all live ids, prices is called once across two Store opens.
  • Done when: test passes.
  • Don't break: "Not sold here" for genuinely missing products.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 21
 Lane SEC: Security, cheating and server readiness
 Read-only audit. Every line below was checked against the code at HEAD. Nothing was run: node_modules is absent in
 this checkout, so no test or probe was executed. Findings are from reading the code and are marked "(inferred)"
 where a step was reasoned rather than read. The 2026-11-20 security audit's fixes (C1, P1-P3, S1-S7, A1-A5, D1-D4,
 F1) were spot-checked and still hold. They are not re-reported here.
 Earlier 2026-11-21 labels: S-1, R-1, S-2 and G-1 map to concrete code below. None of REQUIRE_SERVER_VILLAGE,
 "label allowlist" or "late-report rule" exists anywhere in server/, src/ or docs/, so all three are still to be built. S-3
 and S-4 could not be identified: no trace in the repo, and only the earlier audit's last page survives. The two
 polish items most likely to be them are SEC-15 and SEC-17, but that is a guess.

 SEC-01: Device-held villages are fully trusted in ranked play: add REQUIRE_SERVER_VILLAGE
 (earlier S-1)
 • Severity: BLOCKER
 • Status: FAIL
 • Kind: CODE
 • Compartment: server
 • Checklist refs: Checklist 7.x "server owns online truth"; Masterclass 6 Trust boundaries; CLAUDE.md Invariant
    "The server owns online truth"
  • Evidence: There is no REQUIRE_SERVER_VILLAGE anywhere (grep of the repo), and checkConfig has no such rule
    (server/config.ts:160-205).
     • Base upload. uploadBase takes any base validateBase accepts at the Keep the base itself names
       (pvp.ts:82-136, 267-287). There is no account-age gate (import has one: importMinAccountDays,
       villageImport.ts:268-271,398-404) and no limit on Keep jumps. A fresh account can upload a maxed Keep 15
       base on day 1, and hallLevel sets its match window and its Power Ranking value (powerRating(…, p.hallLevel),
       pvp.ts:886).
     • Army. checkArmy allows full camps at research-cap levels for that Keep (pvp.ts:210-248). requireArmyOnServer
       skips device villages (pvp.ts:479), so troops are never consumed and raids are limited only by match 30/min
       and battle 20/min (rateLimit.ts:78-79).
     • Rerolls. A device village can match → void → match freely. The scout-seed reuse that stops this applies only to
       server-held villages (pvp.ts:323-329, whose own comment notes a guessed seed predicts the outcome ~98%
       of the time).
     • Honor. Honor is gained against generated bases too (defTrophies = ticket.defenderTrophies, pvp.ts:755-756).
       There is no daily gain cap for attackers, and defenders lose nothing (ranks.json:169).
     • Harm to honest players. A device-held raider takes real resources from server-held defenders (lootFrom ===
       'server-village', pvp.ts:788). Device attackers' war stars earn Gang War chests, with Jade against real Gangs,
       for server-held teammates (gangWars.ts:409-431).
     • The game itself auto-moves villages (src/main.ts:288 keepVillageOnServer: true, connection.ts:247), so only
       modded clients or scripts stay device-held. The documented protocol plus the shipped simulator
       (botDeployments) make such a script easy (inferred).
     • Verified by reading. Not run (no node_modules).
  • Fix:
    1. Add a policy field requireServerVillage: boolean to ServerPolicy / DEFAULT_POLICY (server/core/context.ts).
       Read it in policyFromEnv (server/config.ts) from REQUIRE_SERVER_VILLAGE=1. In checkConfig, production warns
       while it is unset. After the migration window, refuse to start without it (or require an explicit
       REQUIRE_SERVER_VILLAGE=0).
     2. Add requireHeldVillage(ctx, me) in server/core/village.ts: when the policy is on and
       !hasServerVillage(ctx.repo, me.id), throw fail(404, 'no_village', 'pvp.village_required'). Add
       srv.pvp.village_required to locales/en/messages.json and translate it (npm run i18n:sync && npm run
       i18n:check).
     3. Call it at the top of: pvp.match, pvp.startAttack, pvp.attack, pvp.uploadBase (refuse instead of storing),
       groveRaid.raidTicket and its report, gangWars ticket, report and claim, duels.duelTicket (optional),
       groves.donateIn (donor and receiver), referrals.claim (already requires one) and sharedReplays (optional).




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 22
     4. Rankings: add BoardFilter.heldOnly to topPlayers, rankOf, topByPower, powerValues and rankedPlayers in both
       adapters (join villages). With the policy on, boardFilter(ctx) sets it, and the Redis board rebuild uses it
       (shared.ts rebuildFilter). ctx.board.set is skipped for device players.
     5. Matchmaking: exclude defenders without a server village from findOpponents while the policy is on. Otherwise
       uploaded-base raids continue.
     6. Interim hardening even with the policy off:
        • uploadBase caps the Keep with the same importMinAccountDays(keep) age rule as import, and allows at most
           +1 Keep per MIN_KEEP_UPGRADE_HOURS (data-driven) above the stored hallLevel.
        • Device villages get the scout-seed reroll rule: one open unstarted ticket, with a reroll cooldown.
        • Add a per-player daily honor-gain ceiling for device villages.
     7. Villages whose move was refused (villageMoveRefused): the game already offers "start a new village on the
       server". Add the refused reason to /admin/v1/players/:id so support can resolve it.
     8. Document in docs/PROTOCOL.md "Trust" and "Server-owned village" (behaviour change, existing error code, no
       protocol bump), and in docs/SHIPPING.md 3h (switch on after a release where the auto-move has run).
  • Tests: tests/backend/server/require-server-village.test.ts:
    • (a) policy on: a device-held player gets 404 no_village from match, attack, war ticket, upload base and donate;
    • (b) policy on: leaderboard and power board list only held players (memory + TEST_DATABASE_URL);
    • (c) policy off: a 1-day-old account uploading a Keep 15 base is refused (fails on today's code);
    • (d) policy off: a device player cannot reroll more than N tickets a minute without starting.
  • Done when: with REQUIRE_SERVER_VILLAGE=1, no route that changes honor, rating, war score, loot or donations
    accepts a player without a server-held village. Both leaderboards contain only server-held players. Tests (a)-(d)
    pass on memory and Postgres.
  • Don't break: offline play (device villages still play offline and Practice); protocol changes in docs/PROTOCOL.md with
    contract tests (tests/backend/contract/); deploy the server before the game; the honesty label for generated
    bases; under-13 board filters (hideUnder13 must compose with heldOnly).

 SEC-02: Unbounded Prometheus label values from client headers (earlier S-2, "label
 allowlist")
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: server
 • Checklist refs: Checklist availability / DoS; Masterclass 6 Trust boundaries (untrusted input into ops systems)
 • Evidence:
    • server/app.ts:266-267 counts tk_client_requests_total{build: X-Client-Build.slice(0,40), rules:
       X-Sim-Rules.slice(0,8)} for every request carrying the header, on any path including unmatched ones and
       /healthz. This hook (registered at app.ts:256) runs before the rate-limit hook (app.ts:318), so even refused
       requests create series.
     • PromMetrics.count stores one Map entry per distinct label set and never forgets it
       (server/observability.ts:69-93). /metrics prints them all (:120-143).
     • Other client-steered label values:
       • tk_refused_total{rules: String(sub.rules)} (pvp.ts:633; any integer from the body);
       • {rules: String(client?.rules)} (pvp.ts:619, 316);
       • rules header in app.ts:262.
     • An unauthenticated sender with random build strings grows server memory and the scrape without bound: an
       availability and Prometheus-cost attack (inferred from code; not run).
  • Fix:
    1. In server/observability.ts, add LABEL_ALLOW: Record<string, (v: string) => string>, plus a per-metric series
       cap (e.g. MAX_SERIES_PER_METRIC = 500). Beyond the cap, count into {…, overflow="1"}. Add
       tk_metrics_series_dropped_total.
     2. build: keep only values matching /^\d+\.\d+\.\d+(\+(web|ios|android))?$/ and at or below the newest known
       build, else other. rules: an integer present in ctx.rules (live + archived + retired), else other.


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 23
     3. Move the tk_client_requests_total count into the onResponse hook, counting only requests that passed the
       rate limit and matched a route (req.routeOptions.url).
     4. Apply the same normaliser at pvp.ts:316,619,633 and app.ts:262.
     5. Add a METRIC_HELP line for the new metric, and an alert MetricsSeriesOverflow in ops/prometheus/alerts.yml
       (the test checks names).
  • Tests: in tests/backend/server/observability.test.ts, send 2,000 requests through httpHarness with random
    X-Client-Build. Assert that the tk_client_requests_total series count stays ≤ cap + 1 and that the /metrics body
    stays under a byte bound. Today's code fails this. Also assert build="1.4.0+ios" still appears.
  • Done when: no metric label anywhere in server/ takes a raw client string. Series per metric are bounded, and the
    test proves it.
  • Don't break: the version dashboard ops/grafana/game-versions.json (build and rules labels keep their real
    values); tests/…/alerts metric-name check.

 SEC-03: Store builds let a player point the app at any server, a phishing path and a sign-in
 token relay (earlier R-1)
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: backend/net + integration (settings UI is presentation; the decision is a build flag)
 • Checklist refs: Checklist account security; Masterclass 6 Trust boundaries; App Review 5.1 (data sent to third
    parties)
  • Evidence:
    • settingsUi.ts:184 always appends serverAddressBlock (hud.ts:1037-1055: a free URL field). Connection.choose
       stores it (connection.ts:535-539), and resolveServerUrl prefers it over the built-in VITE_SERVER_URL
       (connection.ts:122-126, main.ts:267-270). normalizeServerUrl even picks plain http:// for 10./192.168.
       addresses (httpAdapter.ts:156-161).
     • Tokens are stored per server address (httpAdapter.ts:96-110), so the game token itself does not leak. But a
       player talked into "use this server for free Jade" sends the following to that server:
        • sign-in credentials: Google ID token, Apple authorizationCode;
        • purchase intents;
        • age answers and chat.
     • The Google ID token's aud is the official client id (VITE_GOOGLE_CLIENT_ID), so the rogue server can replay it to
       the official POST /v1/sessions within its validity and obtain a token for the victim's linked account
       (links.ts:265-275, inferred).
     • The nonce does not stop this. The rogue server can fetch a nonce from the official /v1/auth/nonce and hand it
       to the victim's game, and SIGNIN_NONCE_REQUIRED is off by default anyway (context.ts:51). The rogue server can
       also show arbitrary notice and moderation text ("Support: send us your code").
  • Fix:
    1. Add a build flag VITE_ALLOW_SERVER_CHOICE, default unset, and declare it in vite-env.d.ts. In main.ts, when the
       flag is off and the build is not a dev build, call resolveServerUrl with a KeyValue view that ignores tk.net.server
       except 'off'. Clear a stored custom URL on start (keep 'off' = play offline).
     2. In settingsUi.ts:184, append serverAddressBlock() only when deps.allowServerChoice (a new HudDeps field set
       in main.ts from the flag or import.meta.env.DEV or ?sandbox). Keep the "Play offline" and "Use the built-in
       setting" buttons visible everywhere.
     3. Never set the flag in deploy.yml, android.yml or ios-testflight.yml. Add an assertion beside the existing
       VITE_ALLOW_PREVIEW check (tests/backend/verification-client.test.ts).
     4. Restrict normalizeServerUrl to https:// outside dev builds.
     5. Server side (defence in depth): set SIGNIN_NONCE_REQUIRED=1 once every supported build sends nonces
       (docs/SHIPPING.md 3h), and add it to the checkConfig production warnings.
  • Tests: tests/backend/net/server-choice.test.ts:
    • with the flag off, resolveServerUrl(kv{tk.net.server:'https://evil'}, 'https://api') returns https://api;
    • 'off' still returns ''.


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 24
     • A DOM test in tests/presentation/dom/ asserts that Settings → Advanced has no input[type=url] when
       allowServerChoice is false.
  • Done when: a release build (web, Android, iOS) has no way to send any request to a server other than
    VITE_SERVER_URL, and the workflow test enforces the flag.
  • Don't break: npm run dev:lan and local-server testing (dev builds keep the field); ?sandbox stays offline; the
    per-URL token store.

 SEC-04: No rule or detection for late battle reports and tool-assisted deployments (earlier
 G-1)
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE
 • Compartment: server (+ backend/net for the outbox order)
 • Checklist refs: Checklist anti-cheat; Masterclass 6 Trust boundaries; relates to X1
 • Evidence:
   • The seed is sent at Attack (startAttack, pvp.ts:522-535), and battles are deterministic from seed +
       deployments (CLAUDE.md Invariant). A started raid is forfeited at the next match after REPORT_GRACE_MS = 8 min
       (pvp.ts:61,338). If the attacker never calls match, the report is accepted until expiresAt + LATE_REPORT_MS (1 h +
       72 h; pvp.ts:41,52,466). That is 73 h to search deployment plans offline with the shipped simulator and report
       the best (inferred: no probe run).
     • War, raid and duel tickets return the seed at issue (gangWars.ts:314, duels.ts:102, groveRaid.ts:218), which
       gives up to 1 h of private search.
     • Nothing measures report latency: no metric, and no startedAt comparison in attack() (pvp.ts:705-800). The
       only related metric is tk_forfeits_total (pvp.ts:590).
  • Fix:
    1. Measure. In attack(), groveRaid reports and gangWars reports, observe tk_report_latency_ms = now -
       (ticket.startedAt ?? ticket.createdAt), with bucketed kind. Count tk_late_reports_total{kind} when the
       latency exceeds REPORT_GRACE_MS.
     2. Keep a per-player record: a new migration 0043_late_reports.sql adds players.late_reports integer not null
       default 0 and players.late_report_at bigint not null default 0. Show them in admin.detail (admin.ts:50-80).
     3. Rule: a pvp report later than REPORT_GRACE_MS after startedAt from a player whose lastSeenAt moved after
       startedAt + REPORT_GRACE_MS settles as forfeitTicket. lastSeenAt is updated by authenticate with minute
       granularity (identity.ts:91-96); keep the previous value on Player for this check. Such a player was online but
       held the report, which honest games never do once (4) ships.
     4. Game side: in Connection.runSync, flush the battle outbox first, before any other authenticated call, on every
       reconnection (today the guarantee is only sendReportsBeforeMatch). Ship this before enabling (3) (deploy the
       server with (3) behind LATE_REPORT_RULE=1, default off).
     5. Add an alert LateReportsRising (share of late reports > 2% for 1 h). Document in docs/PROTOCOL.md (behaviour
       change, no shape change).
  • Tests: tests/backend/server/late-reports.test.ts:
    • a report 9 min after start, with another authenticated request in between, is a forfeit when the rule is on (fails
       today);
     • a report 3 days after start with no request in between still settles (poor connection);
     • the metric is observed.
  • Done when: every report kind records its latency, staff can see per-player late counts, and the online-but-holding
    pattern is forfeited behind a switch, with the game's outbox order shipped first.
  • Don't break: R02 (a phone offline for up to 3 days keeps its raid); deploy the server before the game; protocol
    docs.

 SEC-05: Backdated time-window claims (X1, still open)
 • Severity: MEDIUM
 • Status: FAIL



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 25
  • Kind: CODE
  • Compartment: server
  • Checklist refs: 2026-11-20 security audit X1; Checklist economy integrity
  • Evidence: MAX_BACKDATE_MS = 12 * HOUR (server/core/village.ts:45). Earliest command time = max(row.at, now -
    MAX_BACKDATE_MS) (village.ts:165, 235). An idle village takes two daily chests or calendar days across midnight in
    one session (audit record X1, probe frozen.probe.ts). villages.device_seqs (migration 0019) keeps only numbers
    per device.
  • Fix:
    1. A new migration 0043/0044 adds villages.device_seen jsonb not null default '{}' (additive, so the previous
       server build ignores it).
     2. In the batch path (village.ts and villageReplay.ts VillageReplayJob), set earliest = max(row.at, now -
       MAX_BACKDATE_MS, device_seen[batch.device] ?? 0), then write device_seen[device] = now with the batch (also
       for a batch where nothing applied, in recordVillageCommands).
     3. Game: VillageSync sends an empty batch (heartbeat) on every reconnection after flushing the queue, and
       every 10 min while online. Server: accept empty batches under the existing commands rule.
     4. Count tk_backdated_commands_total{type} for commands dated more than 10 min before now.
     5. Add the rule to docs/PROTOCOL.md "Time".
  • Tests: tests/backend/server/x1-backdate.test.ts:
    • after a heartbeat at 00:05, a claimDaily dated 23:50 the day before is clamped to 00:05 (fails today);
    • with no contact since 20:00, a claim at 23:50 the day before is honoured (offline player).
  • Done when: the X1 probe cannot take two chests in one session while it keeps contact, and the honest offline
    case passes.
  • Don't break: offline play on poor connections (worldwide target); database changes are new numbered
    migrations; GLOBAL-009 multi-device numbering.

 SEC-06: Look-alike names in other scripts pass uniqueness (S5 open part)
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: server + gameplay/sim (shared names.ts)
 • Checklist refs: 2026-11-20 S5; Checklist moderation / impersonation
 • Evidence: nameKey is tidyName(name).toLowerCase().normalize('NFC').replace(/[ _-]/g,'_')
    (src/backend/net/names.ts:45-47). foldLookalikes is used only for the reserved-word check (names.ts:50-60). "Јоhn"
    (Cyrillic) and "John" are both claimable. Staff words cover 7 languages (audit record).
  • Fix:
    1. Add nameSkeleton(name) = foldLookalikes(nameKey(name)) plus the digit folds of lookalike(), exported beside
       nameKey.
     2. A new migration adds players.name_skeleton text and a non-unique index (CONCURRENTLY, -- migrate:
       no-transaction), plus name_holds.skeleton.
     3. migrateNames at start backfills it in batches.
     4. server/core/names.ts claim and rename refuse when another player or a live hold has the same skeleton
       (name.taken with suggestions).
     5. Existing clashes stay (no forced rename), and admin.detail lists them.
     6. Extend the staff and brand words to the remaining ready languages from languages.json.
  • Tests: tests/gameplay/social/names.test.ts "skeleton": "Јоhn" vs "John" share a skeleton. Add a server test where
    a rename to the Cyrillic look-alike of a taken name is refused (fails today), and where   is still allowed.
  • Done when: no two current claims made after the deploy share a skeleton, and staff words cover every ready
    language.
  • Don't break: valid Indic and CJK names (shared validator, censorText); NameTakenError paths; migrations never
    edited.

 SEC-07: Staff tools cannot undo a cheater or rescue a taken-over account


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 26
  • Severity: MEDIUM
  • Status: PARTIAL
  • Kind: CODE
  • Compartment: server
  • Checklist refs: Checklist live-ops / support; Masterclass 6 audit trail
  • Evidence:
    • Staff routes (server/routes/staff.ts:17-38): adjust, ban, reset-rating, reset-age, rename, import-hold release.
    • There is no honor/trophy reset, and no reversal of honor the cheater's raids took from or gave to others.
    • There is no list or revocation of a player's device tokens: admin.detail (admin.ts:50-80) shows links but not
       player_tokens.
     • There is no suspicious-player view (top honor growth per day, device-held top 100, late reports).
     • Staff reads (GET /admin/v1/players/:id) are not written to staff_actions; only audit() on writes is.
     • Players get no notice of a new-device sign-in (links.ts:265-275).
  • Fix:
    1. admin.resetHonor(actor, id, {to, note}), which also calls ctx.board.set.
    2. admin.revokeSessions(actor, id, {note}): delete all player_tokens except none, plus token_rotations; the
       player must sign in with a link.
     3. admin.sessions(id): provider, device, created and last used, never the hash.
     4. GET /admin/v1/suspects?days= from attacks: honor gained per day, wins per hour, late_reports, device-held
       flag.
     5. audit(ctx, actor, 'view', id) on admin.player, rate-limited so it does not flood.
     6. On signIn from a new device, notify(ctx, playerId, 'account', [msg('account.new_device', {provider})])
       (add the code to messages.json).
    7. Add the new routes to adminPage.ts.
  • Tests: tests/backend/server/admin.test.ts: revoke-sessions makes the old token 401 and writes a staff action;
    reset-honor moves the board; a view writes a view action; a sign-in from a new device creates an account notice.
  • Done when: support can, from /admin, see and kill every session of a player, reset honor, and find the top honor
    gainers, and every look is logged.
  • Don't break: "Every staff action must go through audit()"; ADMIN_ALLOW_IPS; account deletion clears the new rows
    (none added).

 SEC-08: Load test has no 10× target and skips the server-held traffic that dominates at
 launch
  • Severity: MEDIUM
  • Status: PARTIAL
  • Kind: CODE
  • Compartment: server / ops
  • Checklist refs: Checklist server readiness (load, capacity)
  • Evidence:
    • server/load.ts:14-17 targets 5× peak = ~14 battles/s, with match + attack only. With every village
       server-held (keepVillageOnServer: true, and SEC-01), the main traffic is POST /v1/village/commands
       (30/min/player, battle replays in the worker pool, village.ts:235), /v1/hello, notices and chat. None of these is
       generated.
     • Last measured: 3 battles/s per instance on the main thread, 7.96/s with 3 workers on 4 cores
       (PVP_ROADMAP.md:327,342). No staging run with Postgres and Redis is recorded.
  • Fix:
    1. Add --mix to server/loadMain.ts and load.ts: per virtual player, a session of hello → village commands (from a
       recorded PLAYER_COMMANDS script built with src/gameplay/sim) → match/start/attack → notices. Weights come
       from tk_http_requests_total once live.
     2. Write the targets down in docs/SHIPPING.md 3h: 10× peak = ~28 battles/s plus N command batches/s. Pass
       criteria: p95 < 1 s for commands, p95 < 3 s for attack, 0 5xx, tk_resim_busy_total = 0.



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 27
     3. Record a staging run (instances, cores, Postgres size) in PVP_ROADMAP.md step 46.
  • Tests: extend tests/backend/server/load.test.ts so --mix runs against inProcess for 2 s with no errors and reports
    every route.
  • Done when: a recorded staging run meets the written 10× criteria with the realistic mix.
  • Don't break: never point the load test at production (load.ts header); RATE_LIMITS overrides only on staging.

 SEC-09: Autoscaling, spend alerts, PITR and one-command rollback are not set up
 • Severity: MEDIUM
 • Status: OWNER
 • Kind: OWNER
 • Compartment: ops
 • Checklist refs: Checklist server readiness (scaling, cost, recovery, rollback)
 • Evidence:
   • ops/ holds only prometheus/alerts.yml and grafana/game-versions.json. There is no host config, autoscaling
       policy or billing alert.
     • Backups are a daily GitHub-artifact dump (backup.yml:17), with PITR an owner step (SHIPPING.md 3h "Size").
     • Production deploys run by hand through workflow_dispatch (server.yml:148-173). No rollback procedure is
       documented.
    • Missing alerts: tk_resim_busy_total rate, process memory, database size and connections, push failures.
  • Fix:
    1. Owner: choose a host with autoscaling on CPU/event-loop delay, min 2 and a max cap; set billing/budget
       alerts at 50/80/100% of a monthly cap; switch on PITR (≥ 7 days).
     2. Code/docs: add docs/SHIPPING.md 3g "Rollback": run server.yml by hand with target=production on the
       previous v* tag. Migrations are additive, so the older image runs on the newer schema. Switch VILLAGE_PARTS
       off before rolling below its build.
     3. Add alerts ResimBusy (rate(tk_resim_busy_total[5m]) > 0.1), ProcessMemoryHigh (process_resident_memory_bytes
       if exported, else add a gauge) and LateReportsRising (SEC-04).
  • Tests: the existing alerts metric-name test (ops/prometheus/alerts.yml checker) must pass with the new rules.
  • Done when: the owner checklist shows autoscaling, budget alerts and PITR enabled, and a rollback has been
    rehearsed on staging and recorded.
  • Don't break: deploy the server before the game; migrations backward-compatible with the previous build.

 SEC-10: No Content-Security-Policy on the web game (F2, still open)
 • Severity: LOW
 • Status: FAIL
 • Kind: CODE
 • Compartment: integration (vite build) + backend/pwa
 • Checklist refs: 2026-11-20 F2; Masterclass 6 client hardening
 • Evidence: index.html has no CSP and has inline scripts at :13, :63 and the inlined boot.js (vite.config.ts
    bootGuard). The sign-in token sits in localStorage (httpAdapter.ts:96-110). GitHub Pages cannot send headers, so a
    <meta http-equiv> is the only option (frame-ancestors is not supported there).
  • Fix:
    1. Add a Vite plugin cspMeta() in vite.config.ts that hashes every inline script after bootGuard runs and writes
       <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-…'
       https://accounts.google.com/gsi/client https://appleid.cdn-apple.com; connect-src 'self' ${VITE_SERVER_URL}
       https://*.ingest.sentry.io https://oauth2.googleapis.com; img-src 'self' data: blob:; style-src 'self'
       'unsafe-inline'; frame-src https://accounts.google.com https://appleid.apple.com; base-uri 'none';
       object-src 'none'">.
     2. Skip it in dev. Build the origins from env.
     3. Device check: native WebViews load capacitor://localhost / https://localhost, so check that the same meta
       does not block them.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 28
  • Tests: tests/backend/release-config.test.ts: the built dist/index.html contains a CSP whose script hashes match
    every inline script.
  • Done when: the deployed web game has a CSP that tools/release/check-published-game.mjs verifies, and sign-in
    works on web, iOS and Android.
  • Don't break: the boot guard (ES5 inline), Google/Apple sign-in, Sentry envelopes, the service worker.

 SEC-11: iOS sign-in token likely in device backups (F3, still open)
 • Severity: LOW
 • Status: NEEDS-DEVICE
 • Kind: CODE + DEVICE
 • Compartment: backend/platform
 • Checklist refs: 2026-11-20 F3; Checklist token storage
 • Evidence:
   • The token is in WebView localStorage (httpAdapter.ts:96-110). On iOS this sits under the app's Library/WebKit,
       which iCloud/iTunes backup includes by default (inferred; not checked on a device).
     • There is no Keychain code in ios/App/App/*.swift.
     • Android excludes it (android/app/src/main/res/xml/data_extraction_rules.xml, backup_rules.xml).
  • Fix:
    1. Add a small TkSecureStore Capacitor plugin (get, set, remove) using Keychain with
       kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, registered in TkViewController.swift.
     2. Add secureTokenStore(serverUrl) in src/backend/platform/ implementing TokenStore and used by
       HttpServerAdapter on iOS.
     3. On first start, migrate the old localStorage value and delete it.
     4. Extend release-config.test.ts to check the registration.
  • Tests: a unit test of the migration (localStorage → secure store, key removed) with a fake plugin. Device: restore
    an iCloud backup to a second iPhone and check that the game is not signed in.
  • Done when: a restored iOS backup carries no session token (device evidence recorded).
  • Don't break: storedAccounts, token rotation's nextTokens, offline play.

 SEC-12: Sandbox credit cap off by default in production (P4, still open)
 • Severity: LOW
 • Status: OWNER
 • Kind: OWNER + CODE
 • Compartment: server
 • Checklist refs: 2026-11-20 P4
 • Evidence: DEFAULT_POLICY.sandboxDailyCapUsd: null (server/core/context.ts:55). The per-buyer cap groups by
    client-sent device ids (config.ts:234-235). checkConfig says nothing (config.ts:160-205).
  • Fix:
    1. In checkConfig, production adds an error when APPLE_BUNDLE_IDS or GOOGLE_PLAY_PACKAGE is set and
       SANDBOX_CREDIT_DAILY_CAP_USD is unset (allow an explicit 0 = no sandbox credit).
     2. Owner: set it (e.g. 50) in production.
  • Tests: in tests/backend/server/deployable.test.ts, production with Apple configured and no cap gives a
    checkConfig error.
  • Done when: production cannot start with store checks and no sandbox daily cap.
  • Don't break: App Review's sandbox purchases against production (a cap > 0 keeps them working).

 SEC-13: Friend, Gang and Alliance size caps checked outside a transaction (L1, still open)
 • Severity: LOW
 • Status: FAIL
 • Kind: CODE
 • Compartment: server


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                    Page 29
  • Checklist refs: 2026-11-20 L1
  • Evidence: friends.ts:202-203 counts, then opens transaction at :204. squads.ts:121 counts members before the
    join transaction. groves.ts:95 does the same.
  • Fix: move each count inside ctx.repo.transaction after lockPlayers(tx, ['grove:'+id]), ['squad:'+id], or both
    players' ids for friends (the pattern war-side: already exists). Re-read the count under the lock.
  • Tests: tests/backend/server/l1-caps.test.ts (Postgres via TEST_DATABASE_URL): 10 parallel joins into a Gang with
    one free seat; exactly one succeeds.
  • Done when: the parallel test passes on Postgres.
  • Don't break: lock ordering (sorted ids in lockPlayers) to avoid deadlocks.

 SEC-14: Deletion leaves a deleted player's name and id in shared rows until retention
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: server
 • Checklist refs: Privacy invariant "account deletion clears every player-owned table"
 • Evidence:
   • deletePlayer (pg/players.ts:172-276) nulls tickets.defender_id (:191) but leaves the stored base. uploadBase
       writes base.name = me.name (pvp.ts:282), and the base lives in base_versions, referenced by other attackers'
       tickets (retention: 30 days).
     • squad_war_attacks.attacker_id and squad_war_relays.last_by/holder keep the raw player id. No statement
       touches them.
     • The memory adapter was not compared (inferred parity).
  • Fix: in deletePlayer, rewrite the bases of open tickets naming the player:
    1. find tickets where defender_id = $1 before nulling;
    2. store a renamed copy (name = DELETED_PLAYER.name) through the base_versions upsert and repoint base_hash;
    3. update squad_war_attacks set attacker_id = $2 where attacker_id = $1 and the same for relays.
 Mirror it in stores/memory/players.ts.
  • Tests: tests/backend/server/repo.test.ts "deletion": after deleting a defender with an open ticket on them, no
    base_versions row referenced by a ticket contains their name, and no squad-war row contains their id (both
    adapters).
  • Done when: a full-text search of the database for a deleted player's name or id finds only purchases (kept,
    unlinked), staff_actions and deletion_requests (legal records).
  • Don't break: war scores (bases stay, only names change); contentHash dedup.

 SEC-15: Account creation limited only per IPv4 / IPv6 /64 (possible earlier S-3)
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: server
 • Checklist refs: Checklist alt-account abuse
 • Evidence: register: 300/h keyed by ipKey (IPv6 /64) (rateLimit.ts:77, app.ts:325,348). One /48 holds 65,536 /64s,
    so free anonymous accounts are effectively unlimited from one IPv6 host. Alts feed referrals (adult and
    server-held gates help), honor (capped at 40 per attacker and day, pvp.ts:703) and war rosters.
  • Fix: add a second rule registerWide: 3000/h keyed by IPv6 /48 (ipKey48) in DEFAULT_RATE_LIMITS, checked in the
    register route together with register. Expose tk_rate_limited_total{rule="registerWide"}.
  • Tests: in security-audit style, 400 registrations from different /64s in one /48 hit the wide rule.
  • Done when: registrations from one /48 are bounded.
  • Don't break: carrier-grade NAT users (IPv4 stays loose); RATE_LIMIT_INSTANCES division.

 SEC-16: Certificate pinning decision not recorded



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 30
  • Severity: LOW
  • Status: OWNER
  • Kind: DOCS
  • Compartment: backend/platform
  • Checklist refs: Checklist transport
  • Evidence: no pinning in android/ (no network_security_config) or ios/ (no ATS pin keys in Info.plist). No decision
    in docs/DECISIONS.md.
  • Fix: record in docs/DECISIONS.md "Transport": no certificate pinning, because the host rotates certificates, a pin
    would brick old app builds, and the server is the authority anyway (a MITM'd client can only cheat itself). Rely on
    TLS, HSTS (app.ts:249-250) and platform ATS. Revisit if a payment path ever trusts the client. Optionally add
    HSTS includeSubDomains; preload for the API domain (owner).
  • Tests: none (docs).
  • Done when: the decision is in DECISIONS.md.
  • Don't break: n/a.

 SEC-17: Production config check misses several security switches (possible earlier S-4)
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: server
 • Checklist refs: Checklist deployment safety
 • Evidence: checkConfig (config.ts:160-205) warns about Sentry and metrics. It is silent on:
   • SIGNIN_NONCE_REQUIRED (off by default, context.ts:51);
   • REDIS_URL set without RATE_LIMIT_INSTANCES;
   • REQUIRE_SERVER_VILLAGE (SEC-01);
   • SANDBOX_CREDIT_DAILY_CAP_USD (SEC-12).
 • Fix: add production warnings for each (an error for SEC-12). Print the effective ServerPolicy at boot (without
    secrets).
  • Tests: deployable.test.ts: each missing switch yields its warning.
  • Done when: a production boot log names every security switch's value.
  • Don't break: staging and dev boots (warnings only in production).




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 31
 Lane SAV: Save data, progression and client networking
 Audited commit 560ce7a (HEAD), 2026-11-21. Read-only. node_modules is absent, so no test was run: every verdict
 below comes from reading the code (file:line given). Anything not read directly is marked "(inferred)". Earlier
 closure records were re-checked against code, not taken on trust.

 SAV-01 — If IndexedDB fails to open, a returning player silently gets a throwaway village
 that still goes online and can wipe the real village
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: integration
 • Checklist refs: Checklist 2.1 atomic/fallback, 2.6 cloud sync; Masterclass 2 "never lose progress"
 • Evidence (read):
   1. openStorage falls back to MemorySaveStore when openGameDb rejects or takes more than 5 s (src/main.ts:171-185,
       src/backend/persist/idb.ts:13,22-55). That timeout was added because some iOS versions never answer an
       IDB open.
     2. GameController.start on an empty memory store creates and saves a new village (controller.ts:131-135). The
       only warning, "this browser can't save your village", is wrapped in afterTutorial (main.ts:777-778). A fresh
       village has its tutorial undone, so a returning player sees the Sensei tutorial on an empty village and no
       explanation.
     3. The Connection is built anyway with keepVillageOnServer: true (main.ts:288). Its VillageSync reads its state
       from localStorage, which still works (connection.ts:220-229).
     4. Device-held village (a move refused with cooldown and retried after 24 h, connection.ts:233-255; or a player
       who never connected): autoMoveVillage → enable('move') imports the fresh memory village
       (villageSync.ts:201-220). Keep 1 passes every import check. The server now holds an empty village, and
       stored.active = true is persisted to localStorage.
     5. Next normal start, IDB works and the real village loads. connect() finds stored.active true, an empty queue
       and a different hash, so it calls adopt(economyOf(server)) (villageSync.ts:249-258) →
       GameController.adoptEconomy replaces buildings and resources and saves with no backup
       (controller.ts:214-228). The real village can no longer be moved (the server already holds one).
     • (inferred) The whole chain was reasoned from code. A test is needed to confirm it. A server-held village
       self-heals (connect adopts the server economy into the memory village), but commands made before connect
       finishes are queued against the real server village.
  • Fix:
    1. main.ts openStorage: return a reason ('unavailable' = no IndexedDB/private mode, 'timeout'|'error' = the
       IDB exists but failed).
     2. On 'timeout'|'error' when the device shows signs of a returning player (any tk. localStorage key, e.g.
       tk.net.village:*, tk.persistPromptUntil, or tk.device.install): do not call GameController.start. Show a
       blocking card "Your village couldn't be opened. Retry / Play a temporary village", and retry openGameDb with a
       longer timeout.
     3. On a memory store, construct Connection with offline: true, or pass a new option readOnlyVillage: true that
       disables autoMoveVillage, VillageSync.record and connect() adoption.
     4. Show the "can't save" banner regardless of tutorial state when the store is not persistent (main.ts:777).
     5. Defence in depth: VillageSync.connect should call game.adoptVillage (which keeps a backup) instead of adopt
       when the local village's Keep level is above the server's, and log a refused-sync event.
  • Tests: tests/backend/net/villageSync.test.ts "a session on a memory store never imports or adopts". Build a
    Connection over a MemorySaveStore village with keepVillageOnServer and a villageMoveRetryAt in the past; assert
    importVillage is not called. Second case: a server village at Keep 1 with stored.active and a local village at Keep
    8 → assert a backup exists (listBackups().length === 1) after connect(). Add
    tests/presentation/dom/memory-fallback.test.ts: the banner shows while tutorial.done === false.
  • Done when: with IDB forced to time out, a returning player sees a Retry card, no import request is sent, and an
    injected Keep-1 server village never replaces a Keep-8 local village without a backup.



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 32
  • Don't break: server owns online truth (corrections still win for a genuinely server-held village); one writer per
    village; offline play for poor connections (a genuinely new player on a private-mode browser can still play).

 SAV-02 — A damaged save is overwritten even when its backup could not be written
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE
 • Compartment: gameplay/sim (control) + backend/persist
 • Checklist refs: Checklist 2.1 backups, 2.9 storage full
 • Evidence (read): controller.ts:122-135: await deps.store.backupDamaged(raw).catch(() => undefined), then
    createNewVillage + controller.save(). IdbSaveStore.load set this.rev from the damaged file
    (saveStore.ts:110-114), so the revision check passes and the new village replaces the only copy. backupDamaged is
    a separate put of the full 150-300 KB file (saveStore.ts:144-155). It is the write most likely to hit
    QuotaExceededError, while the tiny new village still fits. The same unchecked pattern appears in adoptVillage
    (controller.ts:231-234), where a failed backup makes every sync throw.
  • Fix:
    1. In GameController.start, if backupDamaged rejects, do not save the new village. Start on an in-memory controller
       (pass a MemorySaveStore wrapper) and return loadError with a new kept: false flag.
     2. main.ts: on kept === false, show "Your save could not be read and could not be copied: free some space, then
       Retry", with "Copy save code" from the raw file (reuse the newer-save card at main.ts:1093-1115).
     3. Optionally write the backup and the new village in one IDB transaction (a new SaveStore.replaceDamaged(raw,
       file)), so the replace is all-or-nothing.
  • Tests: tests/gameplay/control/controller.test.ts "a damaged save whose backup fails is not overwritten". Use a
    store whose backupDamaged rejects; assert that the stored slot still holds the damaged raw after start and that
    loadError is set.
  • Done when: no code path writes over a stored save that has not been copied first.
  • Don't break: one writer per village (revision check); a newer save still stops the boot.

 SAV-03 — No rolling "last good" saves; one bad field replaces the whole village
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: gameplay/sim + backend/persist
 • Checklist refs: Checklist 2.1 rolling backups and automatic fallback; 2.3 schema validation
 • Evidence (read): only the village key plus damaged/adopted copies (saveStore.ts:44-52). validateVillage refuses
    the village for one non-finite resource, an unknown building type, a level above maxDefinedLevel, a research level
    above the cap, or a collector mismatch (save.ts:324-372). A balance bundle or data change that lowers a cap, or a
    single runtime NaN, would turn every affected player's next load into a fresh village. backups() hides copies that
    still fail deserialize (controller.ts:611-626), so the player is offered nothing until a patch ships.
  • Fix:
    1. IdbSaveStore.save: in the same transaction, copy the current value to village-prev-1 (shift -1→-2) at most
       once per N minutes (e.g. 10) and on every app start, keeping 2-3 generations.
     2. GameController.start: when deserialize fails, try the generations newest first before creating a new village;
       report "restored from N minutes ago".
     3. save.ts: add repairResources (non-finite → 0, logged), repairResearch (clamp to the cap) and drop unknown
       building types other than the Keep, before validateVillage, as repairTempers already does. Keep hard failures
       for structural damage only (no Keep, buildings missing).
  • Tests: tests/gameplay/sim/save-repair.test.ts: a save with resources.coins = NaN loads with 0 coins (not a throw);
    a research level of 99 is clamped. tests/backend/persist/saveStore.test.ts: after three saves 10 minutes apart,
    village-prev-1 holds the previous file; a corrupted village falls back to it.
  • Done when: a save with one invalid numeric field loads, and a corrupted primary falls back to a previous
    generation automatically.



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 33
  • Don't break: SAVE_VERSION + migration (the repairs are load-time, no format change); damaged copies still
    kept; storage budget (Android Auto Backup 25 MB, F15).

 SAV-04 — "Sign out this device" can drop unsent actions and won raids
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE
 • Compartment: backend/net
 • Checklist refs: Checklist 2.6 account linking / sign-out risk
 • Evidence (read): connection.ts:863 await this.flush().catch(() => undefined), then port.signOutDevice(). On
    success, signedOutHere (connection.ts:892-905) runs village.reset() (the queue is emptied), saveOutbox([]), and
    turns every pending raid into practice (rejected: 'signed_out'). A flush that failed on 429 rate_limited, 503 busy
    or a timeout, while the small sign-out call then succeeds, loses the queued offline actions on the server's village
    and the loot and honor of unsent raids.
  • Fix:
    1. In signOutDevice, after the flush, refuse with a clear error when this.village?.pending > 0 ||
       this.outbox().length > 0 ("N actions and M raids are still being sent; try again when the connection is better").
    2. HUD: show the pending counts in the sign-out confirm (account.signOutDevice.*).
  • Tests: tests/backend/net/connection.test.ts "sign-out refuses while actions are unsent". The port's sendCommands
    throws ServerError(503,'busy'); assert signOutDevice rejects, port.signOutDevice is not called and the queue is
    intact.
  • Done when: sign-out never drops a queued command or an outbox report.
  • Don't break: server owns online truth; the signOutPending mark logic for lost answers.

 SAV-05 — Scouting on a poor connection forfeits a won raid whose report has not arrived
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE + DESIGN
 • Compartment: backend/net (+ presentation/ui app.ts)
 • Checklist refs: Checklist networking "requests in flight during a battle report"; R02
 • Evidence (read): app.ts:99-103 calls sendReportsBeforeMatch(), which gives up after 8 s (connection.ts:1375-1380),
    then port.match(). On the server, match forfeits any started ticket older than REPORT_GRACE_MS (8 min) as a loss
    (honor + Attack Rating) (server/core/pvp.ts:330-341). The late report is then refused and becomes practice. On a
    connection where the larger report POST keeps timing out but the small match succeeds, a won raid turns into a
    forfeit.
  • Fix:
    1. App.scout: if connection.outbox() still holds an attack item after sendReportsBeforeMatch, do not call match. Toast
       "Sending your last raid… (Retry)" and keep the player on the village (practice and Trials stay available).
     2. Optionally: a server match answer 409 report_pending instead of a silent forfeit while the client sends
       X-Pending-Report: <ticket>. That is a protocol addition, so it needs docs/PROTOCOL.md + a contract test.
  • Tests: tests/backend/net/connection.test.ts / an app test: outbox holds a started attack, submitAttack hangs past
    8 s; assert port.match is not called and the report is still queued.
  • Done when: no online match is requested while a started raid's report is still in the outbox.
  • Don't break: ledger audit A1 (hiding a lost raid must still lose honor: the server-side forfeit stays); protocol
    changes in docs/PROTOCOL.md with contract tests.

 SAV-06 — One 15 s timeout for every body; large uploads never complete on slow links
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: backend/net



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                          Page 34
  • Checklist refs: Checklist networking "high latency 500 ms+, packet loss"; worldwide target (cheap phones,
    2G/3G)
  • Evidence (read): httpAdapter.ts:183 timeoutMs = 15_000 for every exchange, body included (214-229). Request
    bodies are plain JSON.stringify (httpAdapter.ts:248); only responses are compressed (src/backend/CLAUDE.md,
    COMPRESS_MIN_BYTES). Large writes: importVillage(serialize(...)) (the whole village, 150-300 KB at late Keeps per
    main.ts:866-868); sendCommands batches of up to 200 commands with up to 3 battle commands of up to 192 KB
    each (server/core/village.ts:31-33,52-53). At about 10-20 KB/s of real uplink (inferred, EDGE/poor 3G) these
    exceed 15 s every time. The queue then never drains (retried every 15 s, connection.ts:1000), and the village
    move is retried on every sync.
  • Fix:
    1. HttpServerAdapter.once: timeout = max(timeoutMs, timeoutMs + bodyBytes / MIN_UPLINK_BYTES_PER_S) (e.g. 8
       KB/s), capped at 120 s.
     2. Gzip request bodies over 1 KB with CompressionStream where available (content-encoding: gzip). The server
       needs a decompression hook with the body limit applied after inflation (a protocol addition: docs/PROTOCOL.md, a
       hello feature request-gzip, contract test).
     3. VillageSync.run: send battle commands in batches of their own (one per request) so one large trial never
       blocks 199 small commands.
  • Tests: tests/backend/net/httpAdapter.test.ts: a 300 KB POST through a fake fetch that delivers at 10 KB/s
    succeeds; a GET still times out at 15 s. villageSync.test.ts: a queue with one trialEnd and 50 collect sends two
    requests.
  • Done when: a 300 KB import completes on a throttled 10 KB/s link (Playwright network throttling, NEEDS-DEVICE
    confirmation on a real 3G phone).
  • Don't break: protocol changes in docs/PROTOCOL.md with contract tests; idempotent replay by seq; the
    battle-command budget (6/min).

 SAV-07 — Connection retry has no jitter, no breaker and no background pause; an outage
 or recovery causes retry storms
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE
 • Compartment: backend/net
 • Checklist refs: Checklist networking "exponential backoff with jitter, circuit breaker, thundering herd"; R04 (cost)
 • Evidence (read):
    • start() installs setInterval(sync, 60_000), setInterval(uploadBase, 120_000) and setInterval(village.flush,
       15_000) (connection.ts:998-1003). sync() checks only incompatible/suspended (connection.ts:1056-1064), so the
       exponential retryDelay (15 s → 5 min, connection.ts:1166-1171) is overridden: an offline client still tries hello
       every 60 s.
     • Each hello is a GET retried twice more (600/1200 ms, httpAdapter.ts:184-185,302-304), so about 3 requests per
       minute per client during an outage, plus flushes every 15 s whenever the queue is non-empty.
     • No jitter on retryDelay; syncSoon resets it to 15 s on every online/visibilitychange (connection.ts:1033-1044).
     • After recovery every open client runs a full runSync within about 60 s: hello, balance, me, age, rules, terms,
       uploadBase, getVillage (whole file), autoMove, defenses, donations, chests, gang chests, flush, me
       (connection.ts:1066-1131). That is about 12-15 requests each (inferred load).
     • None of the three intervals checks document.visibilityState. A hidden web tab keeps syncing at least once a
       minute and uploading the whole device base every 2 minutes (connection.ts:1205-1214, no change check on
       the client).
  • Fix:
    1. Connection.sync: return early while retryTimer is pending (the interval becomes a no-op during backoff); apply
       full jitter (delay * (0.5 + Math.random())) to retryDelay and to the first reconnect after online.
     2. A breaker: after N consecutive network failures, stop the 15 s village.flush interval until the next successful
       hello.
     3. Pause all three intervals while document.visibilityState === 'hidden' (keep the goingAway flush) and resume
       through syncSoon.


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 35
     4. uploadBase: skip when the canonical hash of the base equals the last uploaded one (kept in memory).
     5. Server (optional): hello may return retryAfterMs under load; the client honours it.
  • Tests: tests/backend/net/connection.test.ts with fake timers: (a) with the server failing, over 10 minutes hello is
    called fewer than 8 times; (b) two connections started at the same instant schedule their retries at different
    times; (c) with document.hidden = true, no request is made over 5 minutes; (d) an unchanged base is uploaded
    once.
  • Done when: during a simulated 30-minute outage one client makes at most about 15 requests (today about
    90+), and a hidden tab makes none.
  • Don't break: offline play for poor connections (the queue is still sent on resume and on pagehide); GLOBAL-010
    (flush on going away).

 SAV-08 — No guard forces SAVE_VERSION or PROTOCOL_VERSION bumps; the
 previous-client contract check is inert
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE + OWNER
 • Compartment: integration (tests) + ops
 • Checklist refs: earlier audit "R-2 version bump guard"; Checklist 2.4 migrations
 • Evidence (read): SIM_RULES has a data fingerprint (tests/gameplay/battle/rules-version.test.ts:35-38); it covers
    data only, and battle code is guarded indirectly by aura-cache. SAVE_VERSION is only pinned with toBe(24)
    (migration-full.test.ts:26 and four others). Nothing hashes the VillageState shape (the keys of
    createNewVillage), so a new stored field without a bump passes CI. PROTOCOL_VERSION has no fingerprint of
    protocol.ts types or Routes. tools/release/previous-client-contract.mjs:17-23 exits 0 when no v* tag exists, and
    git tag here is empty (release tags are P7-17..20, "not taken"). It runs in deploy.yml:137 and server.yml:146, so it
    currently checks nothing.
  • Fix:
    1. tests/gameplay/sim/save-shape.test.ts: a recursive key-path fingerprint of createNewVillage(t, data) plus a
       fully populated fixture village; the expected value sits next to SAVE_VERSION with a comment "bump
       SAVE_VERSION + add a migration step".
     2. tests/backend/net/protocol-shape.test.ts: fingerprint Object.values(Routes), ERROR_CODES and the
       ClientHeaders names; expected value next to PROTOCOL_VERSION.
     3. Owner/ops: tag the first public release v1.0.0 so previous-client-contract.mjs has a baseline; make the script
       fail (not skip) in the release job when no tag exists after the first release.
  • Tests: the two fingerprint tests themselves; changing a stored field locally must make them fail.
  • Done when: adding a field to VillageState or a route to Routes fails CI until the version (or the pinned fingerprint,
    with a note) is updated, and a v* tag exists.
  • Don't break: SAVE_VERSION bump + migration; protocol changes in docs/PROTOCOL.md with contract tests.

 SAV-09 — Migration tests lack a real-save fixture for each version
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: gameplay/sim (tests)
 • Checklist refs: Checklist 2.4 "library of real saves from every version run in CI"
 • Evidence (read/grep): tests/gameplay/sim/migration-full.test.ts has one synthetic v1 save (5 buildings) and a
    v14→v15 case. Grep of version: N in tests/ finds inline saves for some versions only. No v4, v5, v6, v9, v11, v13,
    v14 (as a whole save), v15, v20, v23 or v24 village, and no late-game village (Keep 12-15, full logs, purchases,
    Alliance, stipend, pass). The public web build has been deployed (deploy.yml), so real older saves likely exist on
    players' devices (inferred).
  • Fix:
    1. Add tests/fixtures/saves/v<N>-<desc>.json, one per SAVE_VERSION 1..24. Where git history allows, generate
       each by checking out the commit that introduced that version and exporting a scripted mid/late-game village



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 36
       (tools/saves/make-fixture.ts). Always include one late-game village at the current version.
     2. tests/gameplay/sim/save-fixtures.test.ts: every fixture deserializes, validateVillage returns [],
       computeOfflineProgress for 24 h does not throw, serialize→deserialize round-trips, and the resources and Keep
       level are not lower than the fixture's.
     3. Policy: each SAVE_VERSION bump adds the fixture for the version it leaves.
  • Tests: as above (they must fail if a migration step is deleted).
  • Done when: 24+ fixtures load in CI.
  • Don't break: never drop progress; saves migrate.

 SAV-10 — Idempotency-Key is regenerated on every attempt, so it never dedupes a client
 retry
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE + DOCS
 • Compartment: backend/net
 • Checklist refs: Checklist 2.10 idempotent grants
 • Evidence (read): newKey() is called inside exchange for every non-GET request (httpAdapter.ts:244). Writes are not
    retried by the adapter (httpAdapter.ts:302); higher-level retries (reportDuel loop connection.ts:414-422, outbox
    flushes, deliverUnfinished) each mint a new key. docs/PROTOCOL.md:39 says "a fresh id per action". Safety today
    comes from domain ids (ticket response, command seq, store transaction id), so no double grant was found. But
    non-domain writes (chat post, friend request, purchase intent → a cap reservation held 30 min) are duplicated
    when an answer is lost.
  • Fix:
    1. Let HttpServerAdapter take an optional idempotencyKey per call; the outbox item, purchaseVerifier.intent and
       chat send create one key per action and reuse it on retry (OutboxItem.key, stored).
     2. Correct docs/PROTOCOL.md:39 to describe the behaviour.
  • Tests: tests/backend/net/httpAdapter.test.ts: two attempts of the same outbox item carry the same
    Idempotency-Key.
  • Done when: a lost answer to a purchase intent retried by the game does not reserve the cap twice.
  • Don't break: server 422 idempotency_mismatch (same key, same body only).

 SAV-11 — R02 residue: raid reports later than 72 h, and all war/duel reports after 1 h,
 become practice with no message
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE + DESIGN
 • Compartment: server + presentation/ui
 • Checklist refs: R02; Checklist networking "long outage"
 • Evidence (read): server/core/pvp.ts:41,52,466: TICKET_TTL_MS 1 h, LATE_REPORT_MS 72 h for kind === 'pvp' only
    (wars end on their own clock, groveRaid.ts:218, gangWars.ts:314). The client turns a non-retryable refusal into
    practice (connection.ts:1421-1425). The player-facing late-report message is listed "not taken"
    (WORLDWIDE_AUDIT.md:1202, P7-17..20).
  • Fix:
    1. rejectedWhy (main.ts:166-169) already has expired: make sure the toast or News entry names the raid, its date
       and "sent too late (after 72 h)". Add news.refused.lateRaid to locales/en/ui.json.
    2. Owner decision: document the 72 h promise in the help text and store listing (R01/R02 offline promise).
  • Tests: tests/presentation/dom/: a settled expired raid shows the late-report line in News.
  • Done when: every raid that becomes practice from lateness is told to the player once, with the reason.
  • Don't break: server owns online truth; honesty (no fake loot).

 SAV-12 — X1: windowed claims may be dated up to 12 h back while the village is idle
 (owner decision)


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 37
  • Severity: LOW
  • Status: OWNER
  • Kind: DESIGN
  • Compartment: server
  • Checklist refs: Checklist "clock manipulation"; security audit X1
  • Evidence (read): server/core/village.ts:45 (MAX_BACKDATE_MS 12 h), floor max(row.at, now−12h), with timer
    commands at now−10min (village.ts:51, villageReplay.ts:94-95). Daily chest, calendar, tasks, Bounty Hunt,
    rematch and drill use the claimed time. The gain is bounded: at most one earlier local day's chest or calendar
    step after a missed day; none of these is sold (CLAUDE.md money rules). For a truly missed day there is no
    device-side evidence that separates honest offline play from a backdated claim. Per-device last contact
    (device_seqs, player_tokens.last_used_at) only helps when the device was online during the window (reasoned).
  • Fix (owner picks one):
    1. Accept and record it as a known limitation, signed off by the owner.
    2. Narrow it for windowed claims only: floor = max(row.at, now−12h, lastAuthenticatedRequest(token) −
       CLOCK_SKEW_MS) using player_tokens.last_used_at read before this request updates it. That stops backdating
       behind a session the device was demonstrably online for, and keeps honest offline across midnight.
     3. Cap windowed claims to the server's current or previous local day only when the batch also contains a
       command dated after midnight.
  • Tests (option 2): tests/backend/server/x1-window.test.ts: a token used at 20:00 day N−1, a chest claim dated
    21:00 day N−1 sent on day N is accepted; a claim dated 19:00 is refused.
  • Done when: the owner's decision is recorded in docs/DECISIONS.md and, if option 2, the test passes.
  • Don't break: offline play for poor connections; server owns online truth.

 SAV-13 — No client-server time sync: serverTime is ignored and war phases use the device
 clock
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE + DOCS
 • Compartment: backend/net + gameplay/control
 • Checklist refs: Checklist networking "time sync between client and server"
 • Evidence (read/grep): HelloResponse.serverTime is documented "so all players agree on Grove Raid times"
    (protocol.ts:267-268) but is read nowhere in src/ (grep: only the type and the server).
    checkPrepOffer/raidPhase(now) use deps.clock.now() (controller.ts:236-250); timers and task days follow the
    device clock. A device whose clock is off by more than 2 minutes gets repeated corrections (server clamp at
    village.ts:37) and wrong war countdowns.
  • Fix:
    1. Connection.runSync: keep clockOffsetMs = server.serverTime − (t0 + rtt/2) (median of the last 3).
    2. Show a Settings/HUD note when |offset| > 5 min ("Your device clock is N min off; online timers follow the
       server").
     3. Use now + offset for Alliance/Gang War countdowns in the HUD only (the sim's Clock stays the injected clock;
       for a server-held village main.ts may wrap OffsetClock with the offset).
    4. Or correct the protocol doc comment.
  • Tests: tests/backend/net/connection.test.ts: a hello with serverTime 10 min ahead sets clockOffsetMs ≈ 600000
    and clockWarning.
  • Done when: a device 10 min off shows the warning and correct war countdowns.
  • Don't break: battles replay exactly (the offset never enters the sim's battle code); sim purity (Date.now() stays
    out of sim/).

 SAV-14 — Every command writes the whole village, uncoalesced
 • Severity: LOW
 • Status: NEEDS-DEVICE
 • Kind: CODE


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 38
  • Compartment: gameplay/control
  • Checklist refs: Checklist 2.2 write frequency / dirty check
  • Evidence (read): dispatch → void this.save() (controller.ts:189); tick → save (controller.ts:511); persist runs
    serialize (structuredClone) at once and chains one IDB put per call (controller.ts:660-690, save.ts:46-48). Ten
    quick taps mean ten clones and ten 150-300 KB writes. The autosave dirty check (main.ts:869-880) does not
    cover these.
  • Fix: in persist(), if a save is already queued and not started, replace its file instead of chaining another (keep the
    awaitingSave receipt bookkeeping: the merged save covers both). Clone lazily when the chain reaches it.
  • Tests: tests/gameplay/control/controller.test.ts: 10 dispatches within one microtask produce at most 2
    store.save calls, and receipts awaiting save are finished after the last.
  • Done when: rapid commands produce at most two writes per burst; frame-time impact measured on a cheap
    Android (NEEDS-DEVICE).
  • Don't break: GLOBAL-003 (a receipt is finished only after a save containing it landed); the save-on-hide ordering.

 SAV-15 — Reinstall, eviction and restore paths are unverified, and linking is never
 prompted
 • Severity: LOW (code) / owner decision
 • Status: OWNER / NEEDS-DEVICE
 • Kind: OWNER + DEVICE
 • Compartment: presentation/ui + ops
 • Checklist refs: Checklist 2.6 reinstall-and-restore, iOS 7-day eviction (F6); R08
 • Evidence (read): a linked sign-in adopts the server village on a new device (villageSync.ts:241-247,
    connection.ts:985-1000). Linking lives only in Settings → Account (hud.ts:1185-1198); nothing prompts after a
    purchase or a Keep milestone (grep, inferred). Android: localStorage excluded from backup, so a restored phone
    registers a new account and imports the restored village under it (data_extraction_rules.xml; import provenance
    holds the purchase value back, server/core/villageImport.ts). iOS has no Keychain token (security audit F3).
    Web Safari eviction: banner + advice only (main.ts:779-790).
  • Fix:
    1. Owner: decide whether to prompt "Link a sign-in to keep your village" once after the first purchase and at
       Keep 4, worded without pressure, adults and minors alike.
    2. Device test plan below.
  • Tests (device): (a) iOS app: play, no link, delete and reinstall → expect a fresh village; with a link → sign in
    restores the village and purchases. (b) Android: Google backup → new phone → document which account and
    village appear. (c) Safari tab unused 8 days, not on the Home Screen → document the eviction and the banner.
    (d) Home Screen PWA vs Safari: the separate village hint shows.
  • Done when: results are recorded in docs/store/WORLDWIDE_AUDIT.md with device and OS versions.
  • Don't break: privacy (no data before opt-in); minors protections; honesty.

 SAV-16 — Device checks for save durability and network handoff
 • Severity: LOW
 • Status: NEEDS-DEVICE
 • Kind: DEVICE
 • Compartment: ops
 • Checklist refs: Checklist 2.1 kill during write, networking airplane/handoff/latency
 • Evidence: the code paths are sound on reading (IDB transaction saveStore.ts:116-140, reconnecting handle
    idb.ts:57-150, lifecycle main.ts:886-933, outbox and queue in localStorage), but nothing was run on hardware.
  • Tests (device, each on Pixel 7, a cheap Android at 2-3 GB and an iPhone):
    1. Force-stop during a storm of actions (Collect all + 5 upgrades) → reopen: the village equals the last save or
       the one before it, never damaged.
     2. Fill device storage to under 50 MB → play → expect the "could not be saved" toast and no lost save after
       freeing space.
     3. Airplane mode during a raid's last 10 s → finish → reconnect after 10 min → raid settles with loot.


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                          Page 39
     4. Wi-Fi→cellular handoff during a purchase confirm → purchase delivered exactly once.
     5. 500 ms RTT + 5% loss (Android emulator network profile or a hardware link conditioner) → Alliance chat,
       village import, scouting and report times recorded.
     6. iOS app backgrounded 10 min → resume → saves land (IDB reconnection).
  • Done when: the results table is in the audit file.
  • Don't break: n/a.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 40
 Lane STB: Crashes, stability, memory, lifecycle and performance
 Audited commit 560ce7a (HEAD), 2026-11-21. Read-only audit: no repository file was edited. I ran npm ci
 --ignore-scripts, npm run build (passed, chunk sizes below) and npx vitest run tests/presentation/render
 tests/presentation/audio (15 files, 66 tests passed). node_modules/ and dist/ are gitignored, and git status is still
 clean. Not run: any browser or Playwright run (Playwright is not installed, so npm run perf:lowend and perf:profile
 were not run), any device, any native build, Sentry ingestion. Line numbers are from this checkout. Anything
 marked "(inferred)" is reasoning I did not reproduce.

 STB-01 — Android app crashes (and can crash-loop) when push is enabled without
 Firebase config
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: backend (src/backend/platform/push.ts, src/backend/net/connection.ts), ops
    (.github/workflows/android.yml, tools/release/check-store-ready.mjs), server (hello features)
  • Checklist refs: Checklist "Third-party SDK crashes / kill switches", "Permissions denied"; Masterclass 1 crash
    discipline
  • Evidence (read):
    • pushDevice() calls PushNotifications.register() on Android once permission is granted
       (src/backend/platform/push.ts:25-31).
     • The plugin's register calls FirebaseMessaging.getInstance() at once
       (node_modules/@capacitor/push-notifications/android/.../PushNotificationsPlugin.java:113-115). Without
       google-services.json no default FirebaseApp exists, and getInstance() throws IllegalStateException (Firebase
       behaviour, inferred from the SDK contract).
     • Capacitor rethrows any plugin exception as a RuntimeException on its handler thread
       (node_modules/@capacitor/android/.../Bridge.java:852-856, "Serious error executing plugin"). That is an
       uncaught native exception, which crashes the process.
     • android/app/build.gradle:67-74 applies google-services only when the file exists.
       .github/workflows/android.yml never writes it (grep google-services gives no hits).
     • The server lists push whenever any push transport is configured, APNs alone included
       (server/core/identity.ts:25 ctx.push.enabled; server/main.ts:239-240; transport from APNS_* or FCM_* env).
     • main.ts:415-418 calls syncPush on every reconnect, and connection.ts:313 calls device() whenever reminders
       are on.
     • Result (inferred, not run on a device): an Android player who turned reminders on crashes every time the
       game comes online, from the first server where the owner configured APNs (or FCM) and the Android build has
       no google-services.json.
  • Fix:
    1. In src/backend/platform/push.ts pushDevice(), return null on Android unless the build says Firebase is
       configured: import.meta.env.VITE_ANDROID_PUSH === '1'. On iOS keep today's path.
     2. Server: list push-apns and push-fcm separately (server/core/identity.ts, from the transports built in
       pushTransportFromEnv), keeping push for old games. In Connection.syncPush (connection.ts:300-319) require
       push-fcm on Android and push-apns on iOS when the server lists either. Record the additive hello features in
       docs/PROTOCOL.md.
     3. .github/workflows/android.yml: when a secret GOOGLE_SERVICES_JSON is set, write it to
       android/app/google-services.json before npx cap sync android and set VITE_ANDROID_PUSH=1 for npm run build.
       Otherwise leave it unset.
     4. tools/release/check-store-ready.mjs: add a blocking row when VITE_ANDROID_PUSH=1 is set but
       android/app/google-services.json is missing.
     5. Wrap the native call in pushDevice with an explicit try/catch (it already ends in .catch) and log once. This
       guards the JS side only; the native crash is what step 1 prevents.
  • Tests: tests/backend/platform/push.test.ts (new). Mock @capacitor/core getPlatform() to 'android' with
    VITE_ANDROID_PUSH unset. Assert that pushDevice() resolves null and that PushNotifications.register is never




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                          Page 41
    called. Extend tests/backend/release-config.test.ts to check that the Android workflow sets VITE_ANDROID_PUSH
    only in the step that writes google-services.json. Add a server test that hello lists push-apns but not push-fcm when
    only APNS_* is set.
  • Done when: an Android debug APK built without google-services.json, with reminders on, against a server with
    APNs configured, stays up through 10 launches (device check), and the unit test above passes.
  • Don't break: notifications off until the player says yes; no push token for under-13 (connection.ts:306); protocol
    changes in docs/PROTOCOL.md with contract tests; compartment boundaries (backend owns platform/).

 STB-02 — No source maps and one release id for every build, so crash stack traces cannot
 be read (O-1)
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: integration (vite.config.ts, src/main.ts), ops (.github/workflows/deploy.yml, android.yml,
    ios-testflight.yml), backend (src/backend/analytics/sentryEnvelope.ts)
  • Checklist refs: Checklist "source maps uploaded (O-1)", "crash-free rate"; Masterclass 1 crash discipline
  • Evidence:
    • (ran) npm run build produced no .map files, because vite.config.ts:162-175 sets no build.sourcemap.
    • (read) The service-worker plugin already skips .map (vite.config.ts:51).
    • (read) main.ts:237 sends release: kagemura@${__APP_VERSION__}, and package.json:4 is 0.1.0. Every Pages
       deploy and every native build share that one release, so Sentry cannot match artifacts or separate regressions
       per build.
     • (grep) No workflow uploads maps.
     • (read) Frames carry minified filename:line:col only (sentryEnvelope.ts:58-66).
  • Fix:
    1. vite.config.ts: set build.sourcemap: 'hidden'. Maps are written, but the bundles get no //# sourceMappingURL
       comment.
     2. Define a build id in vite.config.ts, __BUILD_ID__ = process.env.GITHUB_SHA?.slice(0, 12) ?? 'local'. In main.ts
       use release: kagemura@${__APP_VERSION__}+${__BUILD_ID__} and add dist: <platform> (web, ios, android). This
       needs a dist field in SentryEventInput and buildEnvelope (sentryEnvelope.ts:69-118).
     3. In each of deploy.yml, android.yml and ios-testflight.yml, after npm run build: if SENTRY_AUTH_TOKEN, SENTRY_ORG
       and SENTRY_PROJECT are set, run npx --yes @sentry/cli@<pinned> sourcemaps upload --release
       kagemura@<version>+<sha> --dist <platform> --url-prefix '~/assets' dist/assets. Then always run find dist
       -name '*.map' -delete before the Pages upload and before npx cap sync, so maps never ship.
     4. Optionally switch to debug ids: run sentry-cli sourcemaps inject and add debug_meta.images from
       globalThis._sentryDebugIds in buildEnvelope.
    5. Document the owner secrets in docs/SHIPPING.md.
  • Tests:
    • tests/backend/analytics/sentryEnvelope.test.ts: assert that the envelope carries release with a + build part
       and dist.
     • tests/backend/release-config.test.ts: assert that each of the three workflows deletes *.map from dist before
       deploy or cap sync, and that vite.config.ts sets sourcemap: 'hidden' (static parse).
     • Device / owner check: throw from ?debug (window.tk) in a deployed build and confirm Sentry shows the original
       src/...ts file and line.
  • Done when: a test exception from a deployed web build and from a TestFlight / APK build shows symbolicated
    TypeScript frames in Sentry, and dist/ as deployed contains 0 .map files.
  • Don't break: crash reports stay opt-in and never for under-13 (crashReportsAllowed); sentryEnvelope.ts adds no
    player data; npm scripts stay cross-platform (the delete step lives in the workflow, or uses a node script, not bash
    in package.json).

 STB-03 — An uncaught exception in any scene update or render stops the game loop for
 good (frozen map, no recovery)



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 42
  • Severity: HIGH
  • Status: FAIL
  • Kind: CODE
  • Compartment: integration (src/main.ts), presentation/render
  • Checklist refs: Checklist "Global error handlers with context", "Null states"; Masterclass 1 crash discipline
  • Evidence (read):
    • Phaser's frame callback runs the game step and only then asks for the next frame
       (node_modules/phaser/src/dom/RequestAnimationFrame.js:89-97). A throw inside _this.callback(time) means
       requestAnimationFrame is never called again.
     • TimeStep.pause and resume do not restart it (phaser/src/core/TimeStep.js:468-485). Only wake() does
       (TimeStep.js:792-811).
     • Nothing in src wraps game.loop.callback. main.ts has a fatal card only for boot() failures (main.ts:1048-1070).
     • Result: the DOM HUD stays alive, but the map or battle freezes until a reload. Nothing is told to the player, and
       nothing is reported unless the player opted in.
  • Fix:
    1. In main.ts, right after new Phaser.Game(...) (main.ts:435), wrap the loop. Save const step =
       game.loop.callback, then set game.loop.callback = (t, d) => { try { step(t, d); } catch (e) {
       onFrameError(e); } }.
     2. In onFrameError: call crashReporter?.report(e, { kind: 'frame', scene: activeSceneKey(), battle:
       String(currentApp()?.inBattle ?? false) }). Count errors in a 10 s window. Allow up to 3 before acting (the
       next frame was not scheduled, so call game.loop.sleep(); game.loop.wake(); to restart the frame callback). On
       the 4th within 10 s, stop the loop, await controller.save(), and show a localized card ("Something went wrong
       drawing the village", Reload). Reuse the boot error card style and add the strings to locales/en/ui.json.
     3. Inside a battle, on the fatal path call currentApp()?.flushBattle() before saving, so the pending battle settles
       as today.
  • Tests: tests/presentation/render/frameGuard.test.ts. Extract the wrapper as a pure guardLoop(loop, onError, now)
    into src/presentation/render/frameGuard.ts. Assert that a throwing callback is caught, onError is called, and the
    loop is restarted (sleep and wake called) for the first 3 errors and stopped on the 4th within 10 s. Device check: in
    ?debug, window.tk makes the village's update throw once, and the map keeps animating.
  • Done when: a one-off throw in VillageScene.update or BattleScene.update leaves the game drawing, and repeated
    throws show the reload card instead of a frozen canvas.
  • Don't break: battle determinism (the guard is presentation only; never re-run sim ticks); t() for the new text;
    crash reports opt-in; boundaries (render may not import backend; keep the reporter call in main.ts).

 STB-04 — WebView renderer death is unhandled on Android (the app dies) and unrecorded
 on both platforms (O-2); no unclean-exit signal
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: ops (android/, ios/), integration (src/main.ts), backend (src/backend/analytics/)
 • Checklist refs: Checklist "Android native or WebView renderer crash path (O-2)", "Low-memory kills", "Crash-free
    rate"
  • Evidence (read):
    • android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java registers no WebViewListener.
    • Capacitor's BridgeWebViewClient.onRenderProcessGone returns false unless a listener returns true
       (node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java:92-104).
       Android then crashes or kills the whole app (Android API contract for false).
     • On iOS, WebViewDelegationHandler.webViewWebContentProcessDidTerminate calls bridge.reset() and reload()
       (node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:164-168). The player sees a
       restart, and nothing records it.
     • Neither side leaves a marker for the next launch, and the JS side keeps no record of whether the last session
       ended cleanly (grep unclean/heartbeat gives no hits).



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 43
  • Fix:
    1. Android: in MainActivity.onCreate, after super.onCreate, call getBridge().addWebViewListener(new
       WebViewListener() { @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
       ... } }). In it, write tk_renderer_gone = { crashed: d.didCrash(), priority: d.rendererPriorityAtExit(), at:
       now } to SharedPreferences, call recreate(), and return true.
     2. iOS: in TkViewController there is no clean override point for webViewWebContentProcessDidTerminate, because it
       belongs to Capacitor's delegation handler. So write UserDefaults tk_webcontent_gone from capacitorDidLoad by
       observing a reload, or rely on the JS marker below.
     3. JS (works everywhere): add a small src/backend/analytics/sessionMarker.ts. On boot read tk.session ({
       visibleBeat, cleanHide }). While visible, write visibleBeat = Date.now() every 10 s. On hide, pagehide or pause,
       write cleanHide = true. At boot: last visibleBeat under 30 s before the last unload and no cleanHide means an
       unclean foreground exit.
     4. Report an unclean exit (and the native markers, read through a tiny TkDiagnostics plugin or a
       triggerWindowJSEvent from MainActivity after load) as crashReporter.report(new Error('unclean_exit'), { kind:
       'unclean_exit', ... }). Add an unclean_exit stats event to STATS_EVENTS (adults who opted in only).
    5. Wrap the localStorage writes in try/catch as everywhere else.
  • Tests:
    • tests/backend/analytics/sessionMarker.test.ts: a boot with { visibleBeat: now - 5_000, cleanHide: false }
       reports unclean; a boot with cleanHide: true or a beat 10 minutes old does not.
     • tests/backend/android-native.test.ts: assert that MainActivity.java contains onRenderProcessGone returning
       true and addWebViewListener.
     • Device: on Android, adb shell am crash, or open chrome://crash inside the WebView via
       webContentsDebuggingEnabled in a debug build. Expect the app to recreate the activity, not die, and the next
       boot to report one unclean_exit.
  • Done when: a killed renderer on Android no longer terminates the app, and both platforms produce exactly one
    unclean_exit event (when opted in) on the next boot.
  • Don't break: privacy (only for players who opted in to crash reports or statistics; no ids); saves (the marker lives
    in its own localStorage key, not in the save); boundaries (main.ts is the only place that wires native events).

 STB-05 — Crash reports lack context and a session denominator; crash-free rate cannot be
 computed
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: backend (src/backend/analytics/crashReports.ts, sentryEnvelope.ts), integration (src/main.ts)
 • Checklist refs: Checklist "Crash-free rate", "Global error handlers with context (scene, last action, build, device)"
 • Evidence (read):
   • CrashReporter.report sends only an event item (crashReports.ts:46-56, sentryEnvelope.ts:102-118). It sends no
       session items, so Sentry release health has no denominator.
     • Tags are only side, device (main.ts:240, OS family from platformName, main.ts:153-159) and kind.
     • The event has no contexts: no app build, renderer (WEBGL/CANVAS), quality profile, active scene, in-battle flag, or
       last command type.
    • The breadcrumb trail is empty.
  • Fix:
    1. Add contexts and tags providers to CrashReporterOptions (context?(): Record<string, string>), read at report
       time. From main.ts pass: scene (the active Phaser scene key), battle (currentApp()?.inBattle), quality
       (quality().profile), renderer (game.renderer.type === Phaser.CANVAS ? 'canvas' : 'webgl'), lastCommand (the
       type of the last controller.onCommand; a type only, never params), online (connection.status).
     2. Add startSession() and endSession(status) to CrashReporter. Send a Sentry session envelope item ({ sid,
       init, started, status, errors, attrs: { release, environment } }) at boot and on hide, only while enabled().
       Mark crashed when STB-03's fatal path or STB-04's unclean exit fires.
     3. Keep the scrubbing as it is. Never add names, ids or chat.



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 44
  • Tests: tests/backend/analytics/crashReports.test.ts. With post captured, assert that report() includes the
    context() values as tags, that startSession posts a session item with the same release, and that nothing is posted
    while enabled() is false.
  • Done when: a test error in a deployed build shows scene, battle, quality and renderer in Sentry, and Sentry's
    release health shows a crash-free sessions percentage for the opted-in population.
  • Don't break: privacy (opt-in, never under-13, no player data: Settings' "Send crash reports" text promises this,
    src/presentation/CLAUDE.md); STATS_EVENTS stays free of free-text fields.


 STB-06 — WebGL context loss has no player-facing handling, timeout or report
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: presentation/render (assets.ts or a new render/contextLoss.ts), integration (src/main.ts)
 • Checklist refs: Checklist "Low-memory kills and WebGL context loss"
 • Evidence (read):
   • Phaser's default dispatchContextLost stops rendering and calls preventDefault
       (node_modules/phaser/src/renderer/webgl/WebGLRenderer.js:1021-1033). Restore rebuilds wrappers and pipelines
       (:1044-1111).
     • The game hooks only RESTORE_WEBGL, to repaint released canvases (src/presentation/render/assets.ts:186-199).
       grep LOSE_WEBGL|contextlost in src gives 0 hits.
     • If a mobile browser never restores the context (common under memory pressure, inferred), the canvas stays
       black with the HUD over it, no message, no report and no way back short of a manual reload.
  • Fix:
    1. Add src/presentation/render/contextLoss.ts with watchContext(game, { onLost, onRestored, onStuck }). On
       Phaser.Renderer.Events.LOSE_WEBGL start an 8 s timer while document.visibilityState === 'visible'. Pause the
       timer while hidden. On RESTORE_WEBGL clear it.
     2. In main.ts, onStuck: save, then show a localized card ("The graphics stopped. Reload to continue", Reload calls
       location.reload()), with strings in locales/en/ui.json. onLost: call crashReporter.report(new
       Error('webgl_context_lost'), { kind: 'webgl' }) and trimTextureCaches.
    3. Count restores and losses in the opt-in stats (STATS_EVENTS webgl_lost, no free text).
  • Tests: tests/presentation/render/contextLoss.test.ts with a fake renderer emitter and fake timers. LOSE then 8 s
    visible calls onStuck. LOSE then RESTORE at 3 s does not. LOSE while hidden for 60 s, then visible for 7 s, does
    not. Device / browser check: game.renderer.gl.getExtension('WEBGL_lose_context').loseContext() in ?debug shows
    the card after 8 s if restoreContext() is not called.
  • Done when: a lost context that never returns shows the reload card within 10 s of being visible, and a restored
    one keeps playing with the island and scenery repainted.
  • Don't break: t() for the text; the boundary rule that render/ imports no backend (the reporter call stays in
    main.ts); never read pixels from released canvases.


 STB-07 — First-use painting causes stutter at battle open and in the middle of a battle
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE (with a DEVICE measurement)
 • Compartment: presentation/render (BattleScene.ts, assets.ts, fx.ts), integration (src/app.ts scout flow)
 • Checklist refs: Checklist "Shader/first-use stutter", "GC spikes", "Performance worst-device target"
 • Evidence (read):
   • BattleScene.create makes every building view synchronously (BattleScene.ts:239). Each one calls
       buildingTexture (BattleScene.ts:590), which paints any never-seen type × level on the spot (assets.ts
       buildingTexture → paintLevel: canvas paint plus GPU upload).
     • Scouting a base at another Keep can need dozens of new looks in one frame.
     • Ruins are painted the first time a building family and size is destroyed, inside update() (BattleScene.ts:1108 →
       fx.ts:301-305 ruinTexture → paintArtTexture).




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 45
     • Thumbnails are still a synchronous toDataURL('image/png') (assets.ts:323-340), already a known limit
       (2026-11-13 F11).
    • None of this has been measured on a phone.
  • Fix:
    1. Add prepareBattleTextures(scene, base, onSlice) in assets.ts, reusing prepareTextures' slice pattern
       (assets.ts:436-588). It paints every (type, level, size) in the base plus each ruinTexture(size,
       ruinFamily(kind, type)) the base can produce, in slices of about 8 ms.
     2. Run it while the scout drawer is open, from BattleScene.create before the opening glide, or via app.ts before
       sm.start('battle', init). Keep the textures held (holdBuildingTextures) so the budget does not evict them
       before use.
     3. Paint ruins up front for the base's families, so update() never paints.
     4. (Optional) Encode thumbnails lazily for visible rows with toBlob (async) instead of toDataURL.
  • Tests:
    • tests/presentation/render/battlePrepaint.test.ts: given a base, the list of keys prepareBattleTextures will
       paint includes every building level key and every ruin key the base can produce (pure key planner
       battleTextureKeys(base)).
     • Device check: npm run perf:lowend -- --quality (or Chrome tracing on a cheap Android). Scout a base two
       Keeps above the village. Before: record the longest task at battle open and the frame time at the first ruin.
       After: longest task under 100 ms and no frame over 50 ms at the first destruction.
  • Done when: on the emulated low profile (CPU ×4) battle open has no long task over 100 ms and the first
    destruction drops no frame over 50 ms, confirmed once on a physical cheap Android.
  • Don't break: texture budget invariants ("a new image built from a painted key must be in its scene's held set");
    phaserBuild.js (no new Phaser namespaces without adding them); battle determinism (render only).


 STB-08 — First paint waits on a 193 KB inline boot script with every language's boot
 strings
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: integration (vite.config.ts bootGuard), localization tooling (tools/i18n/build.mjs
    languageBootScript), backend (src/backend/pwa/boot.js)
  • Checklist refs: Checklist "Cold start", "Load time to playable", "Bundle and install size"
  • Evidence:
    • (ran) dist/index.html is 199 KB raw and 53 KB gzip. Its first inline script is 192,839 bytes, and its tables object
       holds 50 languages × 29 keys = 124,673 bytes (measured with node on the built file).
     • (read) tools/i18n/build.mjs:57-72 inlines boot strings for every ready language, plus every main.ts string after
       line 780 (mainKeys chosen by source line number: s.line >= 780, which breaks as soon as that file shifts).
     • (read) vite.config.ts:85-93 injects it head-prepend, so it blocks first paint.
     • (inferred) 53 KB gzip is about 1.8 s at the 240 kbps profile the 2026-11-13 record used, before the splash can
       paint, on every first visit (later visits come from the service worker cache).
  • Fix:
    1. In languageBootScript(), inline only en plus the 17 boot.* keys per language (the strings needed if the module
       never arrives). Move the main.ts error-card strings (mainKeys) out of the head script: once the module runs, the
       language pack (or English) is available through t().
     2. Replace the line-number heuristic with an explicit list (for example a boot: true marker or a named set in
       locales/), so moving code in main.ts cannot silently drop or add strings.
     3. Optional: emit the per-language boot table as lang/boot-<code>.json, precached, and inline only the matcher
       plus English.
  • Tests: tests/locales/boot-script.test.ts. Assert that languageBootScript().length < 60_000, that every ready
    language still has boot.loading, boot.failureTitle and boot.retry, and that no key outside the explicit list is
    inlined. Browser check: FCP on the 240 kbps / 840 ms RTT / CPU ×6 profile improves against the current build
    (npm run perf:lowend).



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 46
  • Done when: index.html is under 25 KB gzip, the boot guard still shows translated "Couldn't load" text in every
    ready language with the module blocked, and the FCP regression test (or perf run) records the gain.
  • Don't break: boot.js stays ES5; the boot guard must work when the module never downloads; t() and catalog
    rules (npm run i18n:extract && npm run i18n:sync); the localization compartment owns tools/i18n/ (coordinate
    through locales/CLAUDE.md).

 STB-09 — Lifecycle gaps: network timers run while hidden, Capacitor pause path is
 incomplete, iOS "interrupted" audio is never resumed
  • Severity: LOW
  • Status: PARTIAL
  • Kind: CODE
  • Compartment: backend (src/backend/net/connection.ts), integration (src/main.ts), presentation/audio
    (src/presentation/audio/sound.ts)
  • Checklist refs: Checklist "Resume from background; pause stops timers, audio, rendering and network polling",
    "Background throttling", "Thermal/battery"
  • Evidence (read):
    • Connection.start sets intervals for sync (60 s), uploadBase (120 s) and the village flush (15 s), with no visibility
       check (connection.ts:1005-1008). sync() and uploadBase() do not check it either (connection.ts:1056-1064,
       1205-1213). A desktop tab left in the background keeps calling the server.
     • In the apps, goingAway on Capacitor pause (main.ts:927-931) saves and flushes, but does not sound.suspend(true)
       and does not schedule device reminders. Those happen only on visibilitychange (main.ts:905-921), and the
       code itself says the WebView may stay "visible" while paused (main.ts:927).
     • Nothing listens for appStateChange or resume.
     • sound.unlock() resumes only when state === 'suspended' (sound.ts:95). Safari's interrupted state, after a call
       or Siri (inferred from WebKit behaviour), is not resumed on the next tap.
  • Fix:
    1. connection.ts: in the three interval callbacks, return early when typeof document !== 'undefined' &&
       document.visibilityState === 'hidden', except the flush that goingAway triggers explicitly. The existing syncSoon
       on visible already catches up.
     2. main.ts installLifecycle: move the "hidden" branch (sound suspend, uploadBase, reminder planning) into a
       wentToBackground() function. Call it from visibilitychange hidden and from Capacitor pause, deduplicated by the
       existing leftAt window. Add CapApp.addListener('resume', ...) that mirrors the visible branch (cancel
       reminders, save, sound.suspend(false)).
    3. sound.ts unlock(): if (this.ctx.state !== 'running') void this.ctx.resume();.
  • Tests:
    • tests/backend/net/connection-hidden.test.ts: with fake timers and document.visibilityState = 'hidden',
       advancing 5 minutes makes no hello, sync or uploadBase calls on the port; switching visible triggers one sync.
     • tests/presentation/audio/music.test.ts: a context in state 'interrupted' is resumed by unlock().
  • Done when: a hidden desktop tab makes no periodic server calls, and on iOS a paused app has its reminders
    scheduled and its audio suspended even when visibilitychange does not fire (device check).
  • Don't break: GLOBAL-010 (the hide, pagehide and pause flush of waiting actions must stay); notifications off until
    the player says yes; one writer per village (the save on return still runs).

 STB-10 — No size budget gate for the shipped bundle
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: integration (tests, vite.config.ts)
 • Checklist refs: Checklist "Bundle and install size", "Load time to playable"
 • Evidence:
   • (ran) Critical path today is about 723 KB gzip. Entry chunk 561.6 KB raw / 183.8 KB gzip, phaser 175.5 KB,
       defineProperty 114.9 KB, communityRules 51.2 KB, keep 47.4 KB, index.html 53 KB, CSS 17 KB, plus fonts.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 47
     • (read) chunkSizeWarningLimit: 1200 (vite.config.ts:166) never fires at these sizes.
     • (grep) No test fails when the entry or preload set grows. tests/architecture/code-split.test.ts checks only
       what is lazy.
  • Fix:
    1. Add tools/perf/bundle-budget.mjs. It reads dist/index.html, follows the entry script and modulepreload links,
       gzips each (level 9), and fails if the total is over a budget (start at 740 KB gzip) or if index.html is over 60 KB
       gzip (25 KB after STB-08).
     2. Run it in CI after npm run build (deploy.yml, android.yml). Use a node script, not bash.
     3. Record the measured numbers in docs/STATUS.md through npm run status if that generator takes them.
  • Tests: the script itself is the gate. Add tests/architecture/bundle-budget.test.ts, which runs the planner on a
    fixture index.html and asserts that it follows modulepreload links and sums sizes.
  • Done when: CI fails on a commit that adds 20 KB gzip to the critical path.
  • Don't break: cross-platform npm scripts; the Phaser chunk split (vite.config.ts:167-171).

 STB-11 — Device evidence for stability and performance is still missing (R03, R08)
 • Severity: HIGH
 • Status: NEEDS-DEVICE
 • Kind: DEVICE
 • Compartment: ops (devices), presentation/render
 • Checklist refs: Checklist "Cold start", "Worst-device target", "Thermal/battery", "Low-memory kills", "Profile in
    release", "Load time to playable"; Risks R03, R08
  • Evidence: every number in the 2026-11-13 runtime record is Chromium headless with SwiftShader and CPU
    throttling, which is not a physical-device result (docs/store/WORLDWIDE_AUDIT.md lines 574-576). This audit ran no
    browser and no device.
  • Fix (device protocol, release builds only, not ?debug):
    1. Devices: a cheap Android (2-3 GB, Android 10-12, Go-class GPU), a Pixel 7, an iPhone SE 2/3 (iOS 15-17), a
       current iPhone.
     2. For each device: cold start to the village's first frame (Wi-Fi and 3G); time to playable; 30 minutes of mixed
       play (scout 10 bases at other Keeps, 5 battles, 3 replays, a Trial, the Build menu). Record GPU/JS memory
       (Android dumpsys meminfo, Xcode Instruments) every 5 minutes, the drawn FPS (HUD readout), battery drop and
       device temperature.
     3. Force-quit mid-battle, mid-purchase (sandbox) and mid-save, and record what survives.
     4. Background the app for 10 minutes and for 12 hours, then resume.
     5. Turn notifications off at the OS level.
     6. Fill storage to under 50 MB free.
     7. Run adb shell am send-trim-memory <pkg> RUNNING_CRITICAL, and trigger a WebView renderer kill (STB-04).
  • Tests: the protocol above, written to docs/audit/devices/<date>-<device>.md with raw numbers.
  • Done when: every device completes 30 minutes with no crash, reload or blank canvas; memory stays under the
    platform's kill line with margin; battle drawn FPS ≥ 25 on low; cold start on 3G under 30 s; results recorded.
  • Don't break: none (measurement only). Do not lower quality or iOS/Android minimums without this evidence
    (R08).

 STB-12 — Crash-reporting operations are owner decisions: default opt-in, Sentry project,
 console vitals
 • Severity: MEDIUM
 • Status: OWNER
 • Kind: OWNER
 • Compartment: ops
 • Checklist refs: Checklist "Crash-free rate measurement possible?", "Third-party SDK kill switches"
 • Evidence (read):




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                          Page 48
     • Crash reports are off until the player switches them on (prefs.ts:10) and are never sent for under-13 players
       (crashReports.ts:27-29). So a crash on the very first launch (main.ts:1051) is never reported.
     • The DSN is a repository variable (deploy.yml:55). No Sentry auth token exists for map upload (STB-02).
     • The native crash data in Play Console Android vitals and App Store Connect is the only measurement that
       covers all users, and it needs live listings (owner).
  • Fix (owner):
    1. Create the Sentry project; set VITE_SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT.
    2. With counsel, decide whether crash reports may default on for adults in each market (no personal data,
       legitimate interest) or stay opt-in, and update the Settings text and privacy policy to match.
     3. Watch Play Console's crash and ANR rate and App Store Connect crashes per release.
     4. Keep the DSN revocable as the remote kill switch for client reporting (revoking it in Sentry stops ingestion).
  • Tests: none (owner). Verify one opted-in test crash per platform reaches Sentry.
  • Done when: the owner has recorded the decision and secrets in docs/SHIPPING.md, and a crash-free percentage is
    visible per release in at least one console.
  • Don't break: the privacy invariant (crash reports opt-in unless counsel decides otherwise; never for under-13).




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 49
 Lane OPS: Store compliance, release pipeline, observability, launch and
 live ops
 Audited commit 560ce7a (HEAD of claude/dreamy-gauss-r3quc0, equal to origin/main), 2026-11-21. Read-only audit: no
 repository file was changed.
 How this was verified: files read at the line numbers given; node tools/release/check-store-ready.mjs run locally (22
 items open, 6 blocking); the live GitHub Pages site fetched with curl; the latest CI runs read with gh run list/view.
 Things inferred rather than seen are marked "(inferred)". Owner, store-console and device evidence cannot come
 from this container. None of it is claimed.
 CI state observed: on main at 560ce7a, "Test, build and deploy", "Server release" and "Android app" are all green. But
 the Android aab job skipped 16 steps because no upload key is set (run 44852452737), and the server production job
 was skipped. No signed store build and no production deploy has ever run.


 OPS-01 — Version identity is frozen at 0.1.0; add a version-bump guard and per-build
 release ids (earlier R-2)
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: integration (with ops (.github/android/ios) and backend/analytics)
 • Checklist refs: Checklist §3 item "Set every production secret … MIN_CLIENT_BUILD"; §17 "Release tag and a
    green run"; Masterclass: Build hygiene / release management
  • Evidence:
    • package.json:4 "version": "0.1.0". The visible history (shallow clone) has never changed it, through save v24
       (SHIPPING.md:301), SIM_RULES = 8 (src/gameplay/sim/battle/battle.ts:55) and PROTOCOL_VERSION = 11
       (src/backend/net/protocol.ts:42).
     • Everything keyed to the version is therefore inert or conflated:
       • (a) MIN_CLIENT_BUILD: versionCheck.ts:23 and registry.ts:103-104 compare compareBuilds(build, min). Every
           build reports 0.1.0+<platform> (main.ts:288), so SHIPPING.md:230,301's "set MIN_CLIENT_BUILD to the first build
           of this release" cannot separate old from new builds. Any value above 0.1.0 locks out every build.
        • (b) What's new: newsUi.ts:90-95 stores tk.whatsNewSeen = '0.1.0', so a later release's notes never show to
           returning players.
        • (c) The Sentry release kagemura@0.1.0 (main.ts:237) and stats build (stats.ts:44-45) cannot tell releases
           apart.
        • (d) tk_client_requests_total by build (observability.ts:43) is one series.
     • git tag is empty, so previous-client-contract.mjs:19-22 prints "No earlier release tag" and the
       backward-compatibility contract (step 77) has never run.
     • No test or CI step compares the version with the last release (grep of tests/, tools/release/).
  • Fix:
    1. Add tools/release/last-release.json, written at each store release: { "version": "0.1.0", "save":
       <SAVE_VERSION>, "rules": <SIM_RULES>, "protocol": <PROTOCOL_VERSION>, "migrations": <highest migration
       number> }.
     2. Add tools/release/check-version.mjs (plain Node, cross-platform). It fails when SAVE_VERSION, SIM_RULES,
       PROTOCOL_VERSION or the newest migration differ from last-release.json while package.json version is not
       semver-greater than last-release.version. It also fails if the tag v<version> already exists on a different
       commit.
     3. Run it in deploy.yml (build job, after npm ci), in the aab job and in ios-testflight.yml before the build. Add the
       same rule as a vitest case so npm test catches it locally.
     4. Make the client build id unique per build. Define __BUILD_ID__ = ${version}+${GITHUB_SHA.slice(0,12) ||
       'local'} in vite.config.ts. Send it as the Sentry release (kagemura@<version>+<sha>) and add a dist of the
       platform. Keep the protocol build header as <version>+<platform>: compareBuilds strips everything after +, so
       MIN_CLIENT_BUILD keeps working on the semver part.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 50
     5. Bump package.json to 0.2.0 (or the first store version), update WHATS_NEW, RELEASE_NOTES.md and
       MARKETING_VERSION (project.pbxproj:432,455), and record last-release.json.
     6. Document in docs/store/RELEASE.md "Before submitting": bump the version, tag v<version>, update
       last-release.json after the stores accept the build.
  • Tests: tests/backend/release-config.test.ts: (a) "a SAVE_VERSION/SIM_RULES/PROTOCOL_VERSION/migration
    change since last-release.json requires a greater package version", written first against the current tree with a
    fixture last-release.json whose save is 23 (it must fail). (b) "WHATS_NEW.version equals package.json version"
    (exists, keep). (c) "main.ts passes a release that contains the commit id".
  • Done when: node tools/release/check-version.mjs fails on a branch that bumps SAVE_VERSION without bumping the
    version and passes after the bump. Two consecutive main builds report different Sentry release values.
    MIN_CLIENT_BUILD=<new version> answers 426 to a build of the previous version and not to the new one (contract
    test).
  • Don't break: deploy the server before the game; npm scripts cross-platform (no bash in package.json); never send
    the statistics id with the player token; compareBuilds semantics for existing servers.

 OPS-02 — Hidden source maps, uploaded privately to Sentry, never shipped (earlier O-1)
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: ops (.github/android/ios) and integration (vite.config.ts), backend/analytics (sentryEnvelope.ts)
 • Checklist refs: Checklist §3 "Sentry"; §17 release gates; Masterclass: Observability / crash triage
 • Evidence:
   • vite.config.ts:160-172 build has no sourcemap, so Vite emits no maps.
   • Live check: curl https://jimhavlicekpersonal.github.io/ninja-version-of-game-1/assets/index-BXdR6JcV.js.map
       returns 404, and the bundle has no sourceMappingURL.
     • No workflow runs sentry-cli or any upload (.github/workflows/*.yml read in full).
     • parseStack (sentryEnvelope.ts:55-67) sends minified filename:line:col with no abs_path.
     • The service worker already skips .map files (vite.config.ts:52), which is good.
     • Result: every crash report from launch would be an unreadable index-*.js:1:NNNNN.
  • Fix:
    1. vite.config.ts: build.sourcemap: 'hidden' (maps emitted, no sourceMappingURL comment).
    2. In sentryEnvelope.ts parseStack, also set abs_path to the scrubbed URL (Sentry's JS symbolication matches on
       it; (inferred) needs a staging test event to confirm).
     3. Add a workflow step after npm run build in deploy.yml, the aab job and ios-testflight.yml. When
       secrets.SENTRY_AUTH_TOKEN and vars.SENTRY_ORG/SENTRY_PROJECT are set, run npx --yes @sentry/cli@<pinned exact
       version> sourcemaps upload --release "$RELEASE" --url-prefix '~/assets' dist/assets, using the per-build
       release from OPS-01.
     4. Then always run find dist -name '*.map' -delete before upload-pages-artifact and before npx cap sync, so
       maps never reach Pages, the APK/AAB or the IPA.
     5. Add a CI assertion step: ! find dist -name '*.map' | grep -q ..
     6. Document the owner secret in SHIPPING.md §3 next to VITE_SENTRY_DSN.
  • Tests: release-config.test.ts: "vite build uses hidden source maps", "every workflow that uploads dist or runs
    cap sync deletes *.map first", "parseStack sets abs_path without a query string" (unit test in
    tests/backend/analytics/).
  • Done when: a forced error in a staging build (crash reports switched on) shows original TypeScript file and line in
    Sentry. curl <pages>/assets/<entry>.js.map returns 404. unzip -l app-release.aab | grep '\.map$' is empty.
  • Don't break: crash reports opt-in (prefs.ts:10 default off, never under 13, never in the sandbox); no player data
    in envelopes (scrubText/scrubUrl); npm scripts cross-platform (keep the upload in the workflow, not package.json);
    the SW precache list must stay free of .map.

 OPS-03 — Android renderer process death kills the app and is never reported (earlier O-2)
 • Severity: HIGH


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 51
  • Status: FAIL
  • Kind: CODE
  • Compartment: ops (.github/android/ios)
  • Checklist refs: Checklist §5 cheap-phone runtime; §6 device testing; Masterclass: Stability / crash-free rate
  • Evidence:
    • android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java overrides only onCreate and
       onTrimMemory, with no WebViewListener.
     • Capacitor 8 BridgeWebViewClient.java:92-104 returns false from onRenderProcessGone unless a listener returns
       true. Android then terminates the app process: on a 2 GB phone a renderer OOM kill becomes an app crash
       counted in Play vitals against the 1.09% threshold (RELEASE.md:24). Nothing is recorded for the next start.
     • iOS: Capacitor resets and reloads (node_modules/@capacitor/ios/.../WebViewDelegationHandler.swift:164-168),
       so the player recovers, but there is no count.
     • R03 (≈121 MB raw pixels) makes this the likely cheap-phone failure.
  • Fix:
    1. In MainActivity.onCreate after super.onCreate, getBridge().addWebViewListener(new WebViewListener() {
       onRenderProcessGone(view, detail) { … } }). Store {at, didCrash: detail.didCrash(), priority:
       detail.rendererPriorityAtExit()} in SharedPreferences("tk_native"), then call recreate() (the activity rebuilds
       the bridge and WebView) and return true.
     2. iOS: in TkViewController, override webViewWebContentProcessDidTerminate through the bridge's delegation
       handler (or a small WKNavigationDelegate wrapper), record a count in UserDefaults, and keep Capacitor's reload.
       If UserDefaults is used, declare reason CA92.1 in the PrivacyInfo of OPS-10.
     3. Add a tiny TkNative.lastRendererExit() plugin method on both platforms that returns and clears the record.
     4. In main.ts, on start, if a record exists: crashReporter.report(new Error('renderer process gone'),
       {kind:'renderer', didCrash}), only if crash reports are allowed. Optionally add renderer_gone:
       {didCrash:boolean} to STATS_EVENTS (adults opted in only).
     5. Device check: adb shell am crash is not enough. Use chrome://inducebrowsercrashforrealz in the WebView, or
       kill the renderer pid on a debug build, and confirm the game restarts to the village.
  • Tests: tests/backend/release-config.test.ts: "MainActivity registers a WebViewListener whose
    onRenderProcessGone returns true" (source check like the existing plugin-registration checks). A unit test for the
    main.ts reporter path with a fake plugin.
  • Done when: on a real Android phone, killing the WebView renderer returns the player to the village within 5 s
    without an app crash entry in Play's pre-launch report or vitals. With crash reports on, the next start sends one
    kind:renderer report.
  • Don't break: crash reports opt-in and never under 13 (crashReportsAllowed); tkmemorywarning handling
    (MainActivity.onTrimMemory); Capacitor plugin registration order (register before super.onCreate).

 OPS-04 — Native test builds cannot target the staging server; client environment is not
 staging/production
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE
 • Compartment: ops (.github/android/ios)
 • Checklist refs: Checklist §3 "staging and production GitHub environments"; §17 "TestFlight internal + external,
    Play closed track"
  • Evidence:
    • TESTING.md:7 says "Build with the staging VITE_SERVER_URL (GitHub Environment staging)" and SHIPPING.md:218
       says "Build games against each with GitHub Environments".
     • But grep -n "environment:" .github/workflows/*.yml finds environments only in backup.yml:31, deploy.yml:150
       and server.yml:115,152. android.yml (both jobs) and ios-testflight.yml read repository-level
       vars.VITE_SERVER_URL, the same value the public web deploy uses (deploy.yml:47).
     • So testers' TestFlight and closed-track builds talk to whatever the web build uses. Production then accepts
       their sandbox purchases (REVIEW_NOTES.md: APPLE_ENVIRONMENTS includes Sandbox).



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 52
     • Client crash reports carry environment: web|ios|android (main.ts:238), so staging crashes mix with production.
       TESTING.md:39 "(Sentry, staging environment)" is not true for the client.
  • Fix:
    1. Add workflow_dispatch input target: [staging, production] (default staging) to android.yml and
       ios-testflight.yml, and environment: ${{ inputs.target || 'production' }} on the aab and testflight jobs.
       Read VITE_SERVER_URL, VITE_SENTRY_DSN and similar from that environment.
     2. Add VITE_DEPLOY_ENV (staging|production) to every build and pass it as the crash reporter environment, keeping
       the platform as a tag.
     3. Name the AAB artifact …-<target>-<versionCode> and require target=production for anything uploaded to the
       production track (document in RELEASE.md).
    4. Update TESTING.md:7,39 and SHIPPING.md:218 to the real mechanism.
  • Tests: release-config.test.ts: "aab and testflight jobs declare an environment from a target input"; "main.ts
    crash reporter environment comes from VITE_DEPLOY_ENV".
  • Done when: a TestFlight build made with target=staging shows "This is a staging server" in Settings, and its test
    crash appears under Sentry environment staging.
  • Don't break: deploy the server before the game; the public web build keeps the production server; the
    ALLOW_LEGACY_APP_ID and preflight guards stay in front of signing.


 OPS-05 — One-command rollback for the web build and the server, with forward-only
 limits (earlier R-3)
  • Severity: MEDIUM
  • Status: FAIL (web) / PARTIAL (server)
  • Kind: CODE + DOCS
  • Compartment: ops (.github/android/ios), docs
  • Checklist refs: Checklist §3 "Pager … weekly review"; §17 release gates; Masterclass: Release management /
    rollback
  • Evidence:
    • No web rollback in docs/ (grep "roll back|rollback|revert").
    • Pages artifacts come from upload-pages-artifact with the default retention (1 day, (inferred) from the action's
       default) (deploy.yml:65-68), so an old artifact cannot be redeployed. Re-running an old run rebuilds and
       re-tests (including test:slow) with today's repository variables.
     • Server: RELEASE.md:43 "redeploy the previous image by hand (the release workflow with that commit)". But
       server.yml production needs image, which needs test (full suite with Postgres and Redis), and there is no input
       to deploy an existing ghcr.io/...:<sha> tag. workflow_dispatch can only pick a branch or tag, and there are no
       tags.
     • Forward-only state that a rollback can break is not written down anywhere as a rollback rule:
       • save versions (SHIPPING.md:230: a newer save stops an older build),
       • SIM_RULES (a server without the client's rules refuses its battles),
       • VILLAGE_PARTS ("switch it off before rolling back below it", src/backend/CLAUDE.md),
       • migrations compatible only with the previous build.
  • Fix:
    1. deploy.yml: retention-days: 30 on upload-pages-artifact.
    2. New .github/workflows/rollback-web.yml (workflow_dispatch, input run_id): download that run's github-pages
       artifact, read its sw.js/bundle SAVE_VERSION marker (emit a version.json with {version, sha, save, rules} in the
       build), refuse if save differs from the live version.json, then actions/deploy-pages and check-published-game.mjs.
     3. server.yml: workflow_dispatch input image_tag (optional). When set, skip test/image and deploy that tag to the
       chosen target via tools/release/deploy.mjs, refusing if the live server's /v1/hello supportedRules contains rules
       the target image lacks (call check-server-rules.mjs logic).
     4. docs/store/RELEASE.md "If something is wrong": the two commands. A table of what may roll back (same save
       version, same or superset rules, migrations of the previous build, VILLAGE_PARTS off first). When to prefer
       forward-fix plus SERVER_NOTICE. Halting store rollouts (exists).
     5. Owner: one rehearsal on staging (OWN-33).


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 53
  • Tests: release-config.test.ts: "deploy.yml keeps the Pages artifact ≥ 14 days", "rollback-web.yml refuses a
    different save version" (unit-test the comparison script), "server.yml production can deploy an existing image tag
    without rebuilding".
  • Done when: on staging, the previous web build is live again within 10 minutes of one gh workflow run
    rollback-web.yml -f run_id=<id>, and the previous server image within 10 minutes of gh workflow run server.yml
    -f target=staging -f image_tag=<sha>, both recorded in RELEASE.md.
  • Don't break: deploy the server before the game; saves never go backwards (never offer a rollback across a
    SAVE_VERSION bump); migrations are never edited or reverted by hand (restore into a new database instead).


 OPS-06 — Statistics lack battle end reason, Trial tier and quits (earlier E-3)
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE
 • Compartment: backend/analytics (src/backend/net/stats.ts), with gameplay/control (controller.ts) via the
    integration session
  • Checklist refs: Checklist §15 "Analytics: adults-only opt-in sample …"; §16 "Track tutorial drop-off"; Masterclass:
    Analytics / level funnels
  • Evidence:
    • stats.ts:25 raid_end: { kind, stars, destruction }.
    • controller.ts:185 logs endReason locally, but cleanStatsEvent (stats.ts:67-79) keeps only allowlisted fields, so
       endReason ('time'|'destroyed'|'no_troops'|'surrender', battle/types.ts:84) never reaches the server.
     • trial_end (village.ts:227, emitted at :2331) has no analytics.log call (grep controller.ts), so Shadow Trials
       leave no trace at all.
     • Quitting a battle is endReason:'surrender' and is invisible.
     • No schema version in StatsBatch (stats.ts:41-54).
     • The funnel (statsLocal.ts:41-55) therefore cannot give per-Keep or per-tier fail and quit rates.
  • Fix:
    1. STATS_EVENTS.raid_end gets endReason: 'id', ticks: 'number' and keep: 'number' (the attacker's Keep level,
       from state).
     2. Add trial_end: { tier:'number', cleared:'boolean', stars:'number', destruction:'number', endReason:'id' }
       and log it in controller.ts beside raid_end.
     3. Add scout_leave: { kind:'id', keep:'number' } for leaving a scouted opponent without deploying (the
       pre-battle quit), logged where the HUD's Next/Home leaves a scout.
     4. Add StatsBatch.schema = 2 (the server accepts a missing value as 1).
     5. statsLocal.ts: per-tier clear rate and surrender rate in statsFunnel, shown on /admin/stats.
     6. Update the PRIVACY.md statistics row (event list) and public/privacy.html if it lists events.
     7. Deploy the server first. Older servers drop unknown events (cleanStatsEvent returns null), which is safe.
  • Tests: tests/backend/net/stats.test.ts: "raid_end keeps endReason", "trial_end keeps tier/cleared and drops any
    other field", "no new field can hold free text" (all id fields match ^[a-z0-9_:.-]{1,40}$). Controller test: a Trial
    clear logs trial_end.
  • Done when: /admin/v1/stats/funnel reports, per Trial tier, the clear rate and, per Keep, the surrender share for a
    seeded memory-repo dataset.
  • Don't break: statistics only from adults who opt in, under a random id; never add a field that can hold a name,
    chat, transaction id or free text; never send the statistics id with the player token; deploy the server before the
    game.

 OPS-07 — Runbooks and alert routing for every alert (earlier R-4)
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: DOCS (+ small config)
 • Compartment: ops (ops/prometheus/), docs



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                          Page 54
  • Checklist refs: Checklist §3 "Pager for the alert rules, on-call rota, status page"; Masterclass: Live ops / incident
    response
  • Evidence:
    • ops/prometheus/alerts.yml:8-106: 13 alerts, each with only summary. grep -c runbook returns 0. No team/owner
       label, no Alertmanager or Grafana contact-point config in ops/.
     • tests/backend/server/observability.test.ts:196 checks only metric names.
     • There is also no alert for purchases stopping (tk_purchases_total flat while tk_http_requests_total is high) or
       for re-simulation saturation (tk_resim_busy_total), both launch-day failure modes (inferred).
  • Fix:
    1. Write docs/ops/RUNBOOK.md with one section per alert: what it means, first three checks (logs, /readyz, Grafana
       panel), mitigations (SERVER_NOTICE, scale instances, RESIM_WORKERS, MIN_CLIENT_BUILD, roll back per OPS-05, halt
       store rollout), and who to escalate to.
     2. Give every rule annotations.runbook_url:
       https://github.com/<owner>/<repo>/blob/main/docs/ops/RUNBOOK.md#<alert-lowercase> and labels.team: server.
     3. Add PurchasesStalled and ResimBusy rules.
     4. Add ops/alertmanager/alertmanager.example.yml (severity=page to the pager receiver, warn to chat, info to
       email) with placeholders the owner fills (no secrets).
  • Tests: extend observability.test.ts: "every alert has runbook_url pointing at an existing RUNBOOK.md heading
    and a severity label".
  • Done when: the test passes and every alert name appears as a heading in RUNBOOK.md. The owner routes page to a
    real pager (OWN-18).
  • Don't break: metric names must stay in METRIC_HELP; no secrets in the repository.

 OPS-08 — Crash-free-session measurement: correct the docs, optionally add opt-in Sentry
 sessions
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: DOCS + CODE
 • Compartment: backend/analytics, docs
 • Checklist refs: Checklist §16 "KPIs … crash-free sessions"; §17; Masterclass: Observability
 • Evidence:
   • sentryEnvelope.ts:102-118 sends only {"type":"event"} items, with no session/sessions items, so Sentry
       Release Health shows nothing.
     • RELEASE.md:34 lists "Crash-free sessions (Sentry, the stores' vitals)".
     • Store consoles are primary (RELEASE.md:20-29), which is correct for native. The PWA has no crash-free source.
  • Fix:
    1. DOCS (do now): RELEASE.md:34 becomes "Crash-free users/sessions: Play vitals and Xcode Organizer only;
       Sentry counts errors from opted-in players, not sessions". State in the soft-launch plan (OPS-11) that
       crash-free gates read the store consoles.
     2. CODE (optional): buildSessionEnvelope(dsn, {sid, init, status, started, duration, errors, release,
       environment}) with no did (no user id). Send it from CrashReporter at session start and on
       pagehide/visibilitychange hidden (status:'exited', or 'crashed' after an uncaught error), only when
       crashReportsAllowed(...). Throttle as today.
  • Tests: tests/backend/analytics/sentryEnvelope.test.ts: "session envelope has no did and carries
    release/environment"; "no session sent when crash reports are off or under 13".
  • Done when: RELEASE.md no longer claims Sentry sessions. If the code part is done, a staging build with crash
    reports on shows a crash-free-session rate per release in Sentry.
  • Don't break: crash reports opt-in; no user id or player data in envelopes; the under-13 rule.

 OPS-09 — Server-side kill switches for products and features
 • Severity: MEDIUM
 • Status: PARTIAL


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 55
  • Kind: CODE
  • Compartment: server, backend (net/protocol.ts, payments)
  • Checklist refs: Checklist §12 economy; §15 live ops; Masterclass: Live ops / remote config
  • Evidence:
    • Server env names (server/config.ts, server/main.ts, enumerated by grep) include SERVER_NOTICE,
       MIN_CLIENT_BUILD, RETIRED_RULES, BALANCE_BUNDLE_FILE, EVENT_SCHEDULE_FILE and the compliance switches, but no
       way to stop selling a product (a mis-priced offer, a broken Scroll delivery) or to switch off chat, referrals or
       shared replays during an incident.
     • Balance bundles change numbers only (balanceBundle.ts:1-20).
     • Features are a fixed list in /v1/hello (server/core/identity.ts:25).
  • Fix:
    1. ServerPolicy gains PRODUCTS_OFF (comma list of game product ids) and FEATURES_OFF (subset of hello features:
       chat, referrals, shared-replays, duels, gangs).
     2. purchaseIntent refuses an off product with a new srv.purchase.paused message (English plus every ready
       language, i18n:sync).
     3. identity.ts removes off features from features. Their routes answer 503 feature_paused.
     4. The client already gates on hasFeature. Check that the Store greys out a product the server reports paused
       (add pausedProducts to hello).
     5. Document in SHIPPING.md 3h and in RUNBOOK.md.
  • Tests: server tests: "an intent for a product in PRODUCTS_OFF is refused before payment"; "hello omits a feature
    in FEATURES_OFF and its route answers 503"; client DOM test: a paused product shows as unavailable.
  • Done when: setting PRODUCTS_OFF=season_scroll on staging makes the Store show it unavailable and the server
    refuse its intent, with no app update.
  • Don't break: real prices only in the Store and its confirm step; a purchase already paid is still delivered (redeem
    path untouched); protocol changes go in docs/PROTOCOL.md with contract tests; deploy the server before the game.

 OPS-10 — App-level PrivacyInfo.xcprivacy for the iPhone app
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE (+ OWNER Xcode validation)
 • Compartment: ops (.github/android/ios)
 • Checklist refs: Checklist §2 store submission; §7 store-API compliance
 • Evidence:
   • find ios -name '*.xcprivacy' finds nothing. Only
       node_modules/@capacitor/ios/{Capacitor,CapacitorCordova}/PrivacyInfo.xcprivacy exist.
     • OWNER_CHECKLIST.md §3 and the Phase 7 record (WORLDWIDE_AUDIT.md P7-15: "the app-level PrivacyInfo.xcprivacy
       (an Xcode target step, not made)").
     • The app's own Swift does not use required-reason APIs today (grep of ios/App/App/*.swift for
       UserDefaults/systemUptime/file dates finds nothing), and the bundled plugins neither use them nor ship
       manifests (grep of node_modules/@capacitor/*/ios, @capacitor-community/in-app-review). So this is the
       data-collection declaration Apple asks apps to carry, not a required-reason block (inferred). OPS-03 step 2
       would add UserDefaults.
  • Fix:
    1. Create ios/App/App/PrivacyInfo.xcprivacy: NSPrivacyTracking false, NSPrivacyTrackingDomains empty,
       NSPrivacyCollectedDataTypes matching PRIVACY.md:58-68 (User ID, Device ID, Purchase History, Gameplay
       Content, Other User Content, Other Data Types linked for App Functionality; Crash Data and Product
       Interaction not linked), and NSPrivacyAccessedAPITypes (CA92.1 UserDefaults once OPS-03 uses it).
     2. Add it to the App target's Resources build phase by editing project.pbxproj (PBXFileReference, PBXBuildFile,
       group and resources entries).
     3. Owner: archive in Xcode and check the generated privacy report (OWN-13).
  • Tests: release-config.test.ts: "PrivacyInfo.xcprivacy exists, parses as a plist, is in the App target's resources,
    NSPrivacyTracking is false, and its collected types match the list in PRIVACY.md".



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 56
  • Done when: the test passes and Xcode's "Generate Privacy Report" on the archive lists the app's own manifest
    (owner evidence).
  • Don't break: declarations must match PRIVACY.md and public/privacy.html (a wrong declaration is a policy
    problem); no tracking.

 OPS-11 — Adopt a soft-launch plan with KPIs and kill criteria, and a device-test matrix with
 protocol
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: DOCS
 • Compartment: docs (docs/store/)
 • Checklist refs: Checklist §6 (device testing), §16 items "Soft-launch plan" and "KPIs and kill criteria"; Masterclass:
    Soft launch / real-world testing
  • Evidence:
    • KPIs and kill criteria exist only as audit recommendations
       (docs/audit/areas/09-retention-and-marketing.md:129-131: D1 ≥ 35%, D7 ≥ 15%, tutorial ≥ 70%, kill if D1 <
       25% …; STATE_OF_THE_GAME.md:320-322). RELEASE.md has crash and ANR halt rules but no retention gates.
     • Device classes are listed (OWNER_CHECKLIST.md §5, TESTING.md "Native checks") with no fixed matrix, repeat
       counts, durations, thresholds or results template.
     • No silent first-time playtest protocol.
  • Fix:
    1. docs/store/SOFT_LAUNCH.md: markets for waves A and B, owner-chosen dates, cohort size, KPIs with targets and
       kill and pause lines, the data source for each (Play vitals and Xcode Organizer for crash-free and ANR;
       /admin/v1/stats/funnel for D1/D7/tutorial, noting the opt-in bias; store consoles for installs and conversion),
       the decision owner and the review cadence.
     2. docs/store/DEVICE_MATRIX.md: 10–20 devices (at least one 2 GB Android Go, 3–4 GB Androids, an iPhone on iOS
       15–16, current flagships, one tablet). Protocol: cold start ×50 and warm start ×50 (median and p90 ms),
       2-hour session memory (start, peak, end; tkmemorywarning count), 20-minute battle thermal (FPS p50/p5, skin
       temperature or throttling state), interruptions (call, notification, background 10 min, airplane mode mid-battle,
       low storage, kill and resume), battery % per hour, 3G/400–800 ms latency. Pass and fail thresholds to be set
       from the first measurements. A results table per build (date, build id from OPS-01, device, tester).
     3. docs/store/PLAYTEST.md: silent first-time protocol (5+ players new to the game, no help, screen and voice
       recording, note where they stall, questions only afterwards) and where notes go.
    4. Link all three from RELEASE.md "Before submitting" and OWNER_CHECKLIST.md §5.
  • Tests: tests/presentation/store-compliance.test.ts (docs presence): "SOFT_LAUNCH.md names a kill line for D1
    and crash-free rate"; "DEVICE_MATRIX.md lists a ≤2 GB Android device and the cold-start ×50 protocol".
  • Done when: the three documents exist, are linked from RELEASE.md, and the owner has filled the target and
    threshold cells (OWN-21, OWN-24, OWN-25).
  • Don't break: honesty, so model players are never reported as players; statistics are an adult opt-in sample and
    must be described as such.

 OPS-12 — Store preflight misses Sentry DSN, public URL and other launch variables
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: ops (tools/release/check-store-ready.mjs)
 • Checklist refs: Checklist §17 "VITE_PUBLIC_URL, VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_IDS set"
 • Evidence: the local run lists legal-config, terms, APP_ID, signing keys and VITE_SERVER_URL only (22 items). It never
    checks VITE_SENTRY_DSN, VITE_PUBLIC_URL, VITE_GOOGLE_CLIENT_ID, VITE_APP_STORE_URL/VITE_PLAY_STORE_URL, the
    PrivacyInfo file (OPS-10) or SENTRY_AUTH_TOKEN (OPS-02). RELEASE.md "Before submitting" requires VITE_PUBLIC_URL
    and VITE_GOOGLE_CLIENT_ID.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 57
  • Fix: add these as non-blocking rows (blocking in --store mode for VITE_PUBLIC_URL and, on Android,
    VITE_GOOGLE_CLIENT_ID). Pass the variables to the preflight steps in android.yml:96-103 and
    ios-testflight.yml:31-37.
  • Tests: extend the preflight test (or add tests/backend/release-preflight.test.ts): "missing VITE_PUBLIC_URL is
    blocking with --store".
  • Done when: npm run release:preflight lists the new rows, and a --store run without VITE_PUBLIC_URL fails.
  • Don't break: the web deploy's preflight stays a notice that never fails (deploy.yml:36).

 OPS-13 — Launch-day and live-ops documents: known issues, support macros, hotfix path,
 sunset
 • Severity: LOW
 • Status: FAIL
 • Kind: DOCS
 • Compartment: docs
 • Checklist refs: Checklist §3 "support mailbox; written refund, chargeback and cheat-ban policies"; §16 "Discord,
    subreddit…"; Masterclass: Launch day / live ops
  • Evidence:
    • No known-issues page or template (grep "known issue" in docs/, public/support.html).
    • No hotfix procedure (expedited Apple review request, Play staged rollout of a patch, MIN_CLIENT_BUILD use).
    • No sunset plan beyond terms.html "We can change or end the game or online play".
    • SERVER_NOTICE exists for in-game notices (SHIPPING.md:243).
  • Fix:
    1. docs/ops/LAUNCH_DAY.md: day-0 timeline (server deployed and pre-scaled, then web, then store release), who
       watches what (the RELEASE.md table), a known-issues page (a section in public/support.html driven by a small
       JSON, or a pinned community post) and its update rule, support reply templates (purchase not delivered:
       Player ID plus restore; age-band reset; deletion).
     2. Hotfix path: branch from the release tag, bump the patch version (OPS-01), run the same workflows, request
       expedited review, set MIN_CLIENT_BUILD only once the store builds are live.
     3. docs/ops/SUNSET.md: notice period (at least 30 days in-game through SERVER_NOTICE and push), stop sales first
       (PRODUCTS_OFF, OPS-09), unused-Jade handling per market (Japan          report GET
       /admin/v1/reports/jp-unused-balance already exists), offline mode for device villages, data deletion schedule.
  • Tests: docs only (a presence check in store-compliance.test.ts is optional).
  • Done when: the three documents exist and RELEASE.md links them.
  • Don't break: event countdowns are real; honesty about generated opponents in any notice.

 OPS-14 — Review prompt: stale comment and no "recent problem" guard
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: integration (presentation/ui) via backend request
 • Checklist refs: Checklist §15 growth; Masterclass: Store ratings
 • Evidence:
   • src/presentation/ui/reviewPrompt.ts:6 says "No native review plugin is installed", but package.json has
       @capacitor-community/in-app-review ^8.0.0 and main.ts:304 provides it through native.ts:50-54.
     • shouldAskForReview (reviewPrompt.ts:34-39) checks win, tutorial, ≥5 wins, the 120-day gap and ≤3 asks, but not
       a failed or unsaved purchase (PurchaseOutcome.unsaved), a crash or boot error, or a server error in the same
       session.
    • A 1-star raid counts as a win (battleHud.ts:887 r.stars > 0), which is acceptable.
  • Fix:
    1. Correct the comment.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                    Page 58
     2. Add a session flag reviewBlocked, set by the purchase flow on a failed or unsaved purchase, by main.ts on a
       boot-error report, and by Connection on a suspended/incompatible status. noteBattleResult returns false while it
       is set.
  • Tests: tests/presentation/ui/reviewPrompt.test.ts: "no request after a purchase problem in the same session".
  • Done when: the test passes.
  • Don't break: never gate anything on the review; never ask "do you like it?" first; never after a loss.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 59
 Lane UX: Input, audio and visual polish, UI/UX, accessibility, localization
 Audited commit 560ce7a (HEAD), 2026-11-21. Read-only. Browser checks used Playwright Chromium against npx
 vite --port 5199 in the testing sandbox (?sandbox&debug) with touch emulation (isMobile, hasTouch, DPR 2) at
 320×568, 360×640, 568×320, 640×360 and 844×390, in en, de, fi, ta and ar. These are emulation runs, not device
 tests. The dev server was stopped afterwards. Probe scripts are in
 docs/audit/bulletproof-2026-11-21/evidence/ux-probes/ (probe1–6.cjs) and screenshots in
 docs/audit/bulletproof-2026-11-21/evidence/shots/.

 About the earlier labels. The repository has no record of "I-1…I-4", "N-A", "N-B", "A-1…A-4" or "D-3": they do not
 appear in docs/, the checklist content.py, or the audit files. Only the last page of the earlier audit survives. Each
 label below is mapped from the hint in the brief to the closest finding in current code. Labels marked "(inferred)" are
 guesses about what the earlier audit meant. The findings themselves were all confirmed against current code or in
 the browser.

 UX-01 — Purchase flow has no in-flight guard: double tap = two confirms = two purchases
 (earlier I-1)
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: presentation/ui
 • Checklist refs: Checklist 9 (in-app purchase flow); CLAUDE.md "Money and minors" ("a clear confirm on every
    purchase", "no buy button sits where a stray tap lands"); src/presentation/CLAUDE.md UX rules
  • Evidence: src/presentation/ui/economyUi.ts:133-138 (buyButton: a click calls this.buy() each time, with no
    disabled or busy state); :179-224 (buy() awaits ensureAge() and await this.storefront() at :210 before the
    confirm, then awaits c.purchase() with no lock and no progress state);
    src/gameplay/control/controller.ts:329-359 (purchase() has no in-flight check; verifier.intent() is a network
    round trip that reserves the under-18 cap). Browser: probe2b sent two click()s on "$0.99 (test)" before the
    dialog rendered. The result was ["Store","Confirm purchase","Confirm purchase"], and confirming both gave
    purchases 0 → 2, Jade 500 → 590. Screenshot 360x640-buy-doubletap-two-confirms-sync.jpg. A real double tap
    (probe1) before the age was set opened two "Your age" dialogs. The two confirm dialogs sit at the same position,
    so a double tap on "Buy for …" confirms both. While the native store or server verification runs (seconds), the
    Store stays tappable with nothing shown.
  • Fix:
    1. In EconomyUi, add private purchasing: string | null = null. At the top of buy(productId): if (this.purchasing)
       return; this.purchasing = productId;, and clear it in a finally around the whole body (age step, confirms and
       c.purchase).
     2. In buyButton, set b.disabled = true and aria-busy="true" on click. Re-enable on the store redraw or in the
       finally. While purchasing is set, every .shop-card .btn in the open Store shows disabled.
     3. While c.purchase() runs, show a non-dismissable in-Store status line, for example a new
       t('store.purchasing') "Completing your purchase…", after 300 ms, in an aria-live="polite" region.
     4. In GameController.purchase add a defensive private purchaseInFlight that returns { ok:false, code:'BUSY' }
       for a second call. Map BUSY to a toast through the existing refusal text (ui/refusalText.ts). This touches
       gameplay/control, so file a request in docs/game-theory/REQUESTS.md if the GUI session may not edit it.
     5. In Hud.confirm/modal (hud.ts:2593-2670), ignore footer button clicks in the first ~250 ms after the dialog opens
       (openedAt = performance.now()). This stops a ghost or double tap from confirming. Keep Escape and
       backdrop-cancel working at once.
  • Tests: DOM (happy-dom, tests/presentation/dom/): build EconomyUi with a mock payments provider whose
    purchase resolves on demand. Click the price button twice synchronously and expect exactly one .modal titled
    "Confirm purchase". Confirm it, click the price button again before purchase resolves, and expect no new dialog
    and payments.purchase called once. Unit: controller.purchase called twice concurrently returns BUSY for the
    second. Playwright: double touchscreen.tap on a price button at 360×640 leaves one confirm.
  • Done when: in the sandbox at 360×640, two taps or two click()s on any price button within 300 ms give one
    confirm and at most one purchase, and the Store shows a busy state until the result toast.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 60
  • Don't break: real prices only in the Store and its confirm; the under-18 second confirm (economyUi.ts:215-218); the
    cap release on cancel (controller.ts:345-347); new text via t() with English in locales/en/ui.json, then npm run
    i18n:extract && npm run i18n:sync.


 UX-02 — Short landscape: "End battle" covers the Smoke Bomb card once Speed appears
 (earlier I-4, inferred)
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: presentation/ui
 • Checklist refs: src/presentation/CLAUDE.md "Measure with Playwright at … 844×390"; Checklist 9 (tap targets);
    device targets "portrait and landscape"
  • Evidence: src/presentation/ui/styles.css:817-818 (inside @media (max-height: 480px), from :805) places .b-troops
    at a fixed left: calc(158px + var(--safe-l)). .b-bottom holds Speed (103 px) and End battle (112 px), which
    needs ~237 px. Probe6, practice raid after the squad was sent: at 640×360, Speed x=12 w=103, End battle x=125
    w=112, Smoke Bomb card x=164 w=54 hitOk=false hitIs="btn danger". 568×320 gives the same result. At 360×640
    the card is reachable. At 844×390 the Speed button had not yet appeared and the card was reachable; the same
    overlap is expected once it shows (inferred). Screenshot battle-640-360-640-360.jpg (a white card behind End
    battle). Effect: once every warrior is in, the Smoke Bomb ability, a core raid action, cannot be tapped on
    landscape phones, and a tap there opens the End battle confirm.
  • Fix:
    1. In the max-height: 480px block, stop hard-coding 158px. Either make .b-bottom and .b-troops one flex row (a
       wrapper with display:flex; gap:8px; align-items:flex-end), or have battleHud.ts measure .b-bottom with a
       ResizeObserver and set --b-bottom-w on #battle-hud. Then use left: calc(var(--b-bottom-w, 150px) + 16px +
       var(--safe-l)) and max-width: calc(100% - var(--b-bottom-w) - 16px - 158px - safe…).
     2. Or, in short landscape, stack Speed above End battle (.b-bottom { flex-direction: column; }) so .b-bottom
       stays ≤ 120 px wide.
     3. Keep BattleHooks.safeArea in step: the HUD measures the free area, so re-measure after the Speed button
       appears (speedButton() in battleHud.ts:586).
  • Tests: Playwright, extending tools/ui/surfaces.mjs --battle or a new tests/e2e-style script: at 568×320,
    640×360 and 844×390, send every warrior (squad order), wait for [data-id="battle-speed"], then for each
    .troop-card assert that elementFromPoint(center) is inside the card and that no .b-bottom button box intersects a
    .troop-card box. Source test in store-compliance.test.ts: no fixed left: calc(158px for .b-troops.
  • Done when: in all three landscape sizes and the two portrait sizes, every troop/ability card passes the hit test
    before and after the Speed button appears, in en and de (longest "End battle" label).
  • Don't break: the bottom bar fits at 320 px; the scout-mode grid (styles.css:799-801,819-820); safe areas; toasts
    and coach line kept free by the fit.

 UX-03 — Web/PWA Back leaves the game instead of closing the top dialog (earlier I-3,
 "PWA back")
 • Severity: HIGH
 • Status: FAIL
 • Kind: CODE
 • Compartment: integration (main.ts) + presentation/ui
 • Checklist refs: Device targets (Pixel 7 Chrome, installable PWA); src/presentation/CLAUDE.md "Hud.closeTop() …
    (Android Back)"
  • Evidence: src/main.ts:963-978 registers backButton only for isNative() && platform() === 'android'. The web app
    never calls history.pushState and has no popstate listener; the only history call is replaceState for shortcuts
    (hud.ts:257). Probe1 at 360×640: with the Army dialog open, page.goBack() went to about:blank (the game
    unloaded; history.length was 2). In an installed display: standalone PWA on Android, Back or an edge swipe on
    the first entry closes the app. An edge swipe while panning the map from the screen edge does the same.
    Mid-raid the app closes, and resolvePendingBattle (controller.ts:552-595) plays out only the warriors already
    deployed; the rest "go home" and are not sent. iOS Safari's swipe-back has the same effect in a tab



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 61
    (NEEDS-DEVICE).
  • Fix:
    1. In main.ts, when !isNative(), add installWebBack(hud, currentApp, battleBack). At start, history.pushState({
       tk: 'guard' }, '') once. On popstate: if currentApp()?.inBattle, call battleBack(); else if hud.closeTop(),
       nothing more; else show the existing "Leave Kagemura?" confirm (ui.leave_kagemura_0b798fad93). Then
       history.pushState the guard again, so the next Back is caught too. If the player confirms leaving, call
       history.back() after controller.save().
     2. Keep the ?open= replaceState (hud.ts:252-258) before the guard is pushed.
     3. Do not push a history entry per dialog (that clutters history). One guard entry, re-armed after each Back, is
       enough.
  • Tests: Playwright: open the sandbox, open Army, then page.goBack() → the page is still the game (window.tk
    defined) and no .modal-backdrop:not(.out) remains. A second goBack() → the "Leave Kagemura?" dialog shows. In
    battle, goBack() → the End battle confirm shows. Unit (happy-dom): dispatching popstate calls hud.closeTop().
  • Done when: Back in a Chrome tab or installed PWA never unloads the game while a dialog, sheet or battle is
    open, and leaving needs the same confirm as the Android app.
  • Don't break: the Capacitor Android path (main.ts:964-978); the manifest shortcuts' ?open=; no reload loops with
    pwa/register.ts updateWebApp.


 UX-04 — Screen shake and flashes ignore reduced motion; no in-game motion/shake
 setting (earlier N-A)
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE
 • Compartment: presentation/render (+ presentation/ui for the switch)
 • Checklist refs: WORLDWIDE_AUDIT R10 ("reduced-motion support is limited"); Checklist 9 accessibility line
    (content.py:297)
  • Evidence: src/presentation/render/BattleScene.ts:1126 (shake per destroyed building, 140 ms), :1263 (splash
    hits), src/presentation/render/fx.ts:311-320 (keepCollapse: additive flash scaled ×6 and a 520 ms, 0.009 shake).
    None of these read reducedMotion() (render/motion.ts:8), which BattleScene already keeps in this.reduced (:216).
    Probe4 with reducedMotion: 'reduce': {"shakes":4,"reduced":true,"destroyed":4}. fx.ts perfectBanner/starSlam
    have no reduced-motion branch either (grep). Settings has only Sound effects, Music and Vibration
    (settingsUi.ts:72-84); prefs.ts:2 keys are sessionReminder | reminders | crashReports. Players who don't set the
    OS flag, or whose WebView doesn't pass it, have no way to turn shake off.
  • Fix:
    1. Add a device preference tk.pref.reduceEffects (in backend/platform/prefs.ts PrefKey, default false; a
       cross-compartment ask in docs/backend/REQUESTS.md, or keep a presentation-local key like tk.quality).
     2. Add export function calmEffects(): boolean { return reducedMotion() || pref } in render/motion.ts. In
       BattleScene.ts:1126,1263, guard the shakes: if (!calmEffects()) this.cameras.main.shake(...). In fx.ts
       keepCollapse, skip the shake and replace the ×6 additive flash with a short alpha fade (no ADD blend). Do the
       same in perfectBanner/starSlam, and skip slowUntil (BattleScene.ts:1118) when calm.
     3. In Settings (settingsUi.ts after the Vibration toggle), add a toggle t('settings.reduceEffects') "Reduce
       screen shake and flashes". Have ui/feedback.ts reducedMotion() honour it too (HUD animations).
  • Tests: unit with a stubbed scene: keepCollapse and the building-destroyed path call cameras.main.shake 0 times
    when matchMedia('(prefers-reduced-motion: reduce)') matches or the pref is set. Playwright: run probe4's
    counting hook with reduced motion and expect 0 shakes. DOM test for the toggle persisting.
  • Done when: with the OS flag or the new switch, a full practice raid records 0 shake calls and no full-screen
    additive flash, and the switch survives a reload.
  • Don't break: battles replay exactly (presentation only; never touch src/gameplay); the low quality profile
    behaviour; new text via t() + npm run i18n:extract && npm run i18n:sync.

 UX-05 — Audio: an iOS "interrupted" AudioContext is never resumed by a tap; no volume
 levels (earlier N-B, inferred)
  • Severity: MEDIUM


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 62
  • Status: NEEDS-DEVICE
  • Kind: CODE
  • Compartment: presentation/audio
  • Checklist refs: Masterclass audio items (interruption resume, independent volumes)
  • Evidence: src/presentation/audio/sound.ts:95: if (this.ctx.state === 'suspended') void this.ctx.resume();.
    WebKit puts the context in 'interrupted' after a phone call, Siri or an alarm. unlock() (called on every
    pointerdown, main.ts:814) skips that state, and suspend(false) (:151-160) resumes only on visibilitychange, which
    an in-app call banner may not fire. Expected result (inferred): silence until the app is backgrounded and
    foregrounded, or reloaded. Volume: only on/off checkboxes (settingsUi.ts:72-84; fixed gains sound.ts:78-84,
    master 0.8, SFX 0.55, music 0.14) and no limiter on master (inferred clipping risk when many boom/hit cues
    overlap; lastPlayed throttles per cue type only).
  • Fix:
    1. sound.ts unlock(): change the check to if (this.ctx.state !== 'running' && this.ctx.state !== 'closed')
       void this.ctx.resume();. Add this.ctx.onstatechange to restart the music clock (nextBeat = currentTime + 0.1)
       when it returns to running.
     2. Add musicVolume/sfxVolume (0–1) to Settings in loadSettings (keep the booleans for old tk.audio values) and
       range inputs in settingsUi.ts under Sound with aria-label from t().
     3. Insert a DynamicsCompressorNode (threshold −10 dB, ratio 4) between master and destination.
  • Tests: unit with a fake AudioContext whose state is 'interrupted': sound.unlock() calls resume(). Setting
    persistence: tk.audio round-trips the volumes and old {sfx,music} JSON still loads.
  • Done when: on an iPhone, after an incoming call during play, the next tap brings sound back (device check), and
    Settings offers separate music and effects volume that persists.
  • Don't break: no AudioContext while both are off (device F9/F18); the music scheduler runs only while audible;
    .ambient session on iOS (AppDelegate.swift:13).


 UX-06 — Purchase flow and Jade entry have poor accessible names (earlier A-4)
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: CODE
 • Compartment: presentation/ui
 • Checklist refs: R10 "screen-reader menus"; Checklist line 44 (EAA: WCAG 2.1 AA purchase flow)
 • Evidence: probe4 Store button names: ["Close","Jade","Offers","Season Scroll","Looks","$0.99 (test)","$1.99
    (test)",…,"$99.99 (test)"]. buyButton (economyUi.ts:133-138) labels the button with the price only, so
    screen-reader button navigation hears seven prices with no product. The Jade pill (hud.ts:331) is div
    role="button" with no tabindex and no aria-label (probe4: tabindex:null, label:null, text:"500+", tabIndex:-1):
    it cannot be reached by keyboard and is announced as "500 plus". The coin/provisions pills are clickable divs
    (hud.ts:322-326) without a role (only the debt explanation; low impact).
  • Fix:
    1. buyButton(productId, cls, after): set aria-label to t('store.buyNamed', { name, price }) ("Buy {name} for
       {price}"), which contains the visible price (WCAG 2.5.3). Pass p.name from the callers at
       economyUi.ts:336,352,388,437.
     2. hud.ts:331: make the Jade pill a <button type="button" class="res res-moonstones"> with aria-label =
       t('res.jadeOpenStore', { n }) ("Jade: {n}. Open the Store"), updated in refresh(). Change the CSS selector at
       styles.css:734 from .res[role='button']::after to .res-moonstones::after.
     3. Mark the purchase-confirm result toast region aria-live="assertive" for errors (the toasts are already polite,
       hud.ts:395).
  • Tests: DOM: open the Store; every enabled .shop-card .btn has an accessible name containing the product name
    and the price label; .res-moonstones is a BUTTON with a non-empty aria-label and tabIndex === 0.
  • Done when: a Chromium accessibility-tree snapshot of the Store lists "Buy … for …" for each pack, and Tab from
    the page reaches the Jade pill.
  • Don't break: real prices only in the Store and its confirm (the label only repeats the Store's own price); the 320 px
    top bar fit; text via t() + i18n sync.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 63
 UX-07 — Top-bar Builders/Honor pills and the unlock chip are under 44 px with no hit-area
 extension (earlier A-2)
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: presentation/ui
 • Checklist refs: R10/M8/F21 (closure "44 px … hit areas"); Checklist content.py:297
 • Evidence: probe1/probe3 measurements (CSS px): at 320×568 and 360×640 res-builders 72×30, res-trophies
    53×30, .unlocks 51×32; at 844×390 85×36, 66×36, 198×36. The extension styles.css:734 (inset:-6px -3px)
    covers only .res[role='button'] (Jade) and .res.res-news (:1052), but Builders and Honor are <button>s without
    role (hud.ts:338-341). styles.css:1093 sets .res { min-height: 30px } under 400 px, while the comment at :1088
    says "tap areas stay at least 44 px through the ::after rules above", which is untrue for these two. The battle
    point chips are 42–43 px wide (all languages, probe3).
  • Fix:
    1. styles.css:734: change the selector to .res-builders::after, .res-trophies::after, .res-moonstones::after,
       .event-chip::after with inset: -7px -3px (30 + 14 = 44), and add position: relative to .res if it is missing.
     2. .unlock-chip .unlocks (styles.css:878): min-height: 44px or an ::after with inset:-6px 0.
     3. .point-chip: min-width: 44px.
     4. Make sure the vertical gap between the wrapped top-bar rows (gap: 4px) does not let two extended hit areas
       overlap: shift the ::after inset so rows meet at the midpoint.
  • Tests: extend village-hud-batch.test.ts (source rule present for .res-builders::after). Playwright: at 320×568,
    360×640 and 844×390, every visible #hud button has a box, or a box plus its ::after, ≥ 44×44, and
    elementFromPoint at a point 6 px above or below each pill's box returns that pill.
  • Done when: the probe3 small list is empty for the village top bar at all three sizes and in de, fi, ta and ar.
  • Don't break: the top HUD height under 400 px (21 % at 320×568, closure record); the bottom bar fit; RTL.

 UX-08 — No in-game text size; OS text size untested; canvas text fixed px (earlier A-1)
 • Severity: MEDIUM
 • Status: NEEDS-DEVICE
 • Kind: CODE + DEVICE
 • Compartment: presentation/ui (+ integration for native)
 • Checklist refs: R10 "Assess larger text"; GUI batch remaining limitation "real OS text-size settings on phones not
    tested"
  • Evidence: rem type exists (2026-11-13), but grep finds no -apple-system-body, text-size-adjust, textZoom or
    text-size setting in src/, index.html, android/ or ios/. iOS WKWebView ignores Dynamic Type for plain CSS
    (inferred); Android WebView applies the system font scale through textZoom (inferred). Canvas labels are fixed px:
    BattleScene.ts:629 (15px), :964 (13px), fx.ts stamp. Round buttons and icons are fixed size (closure note).
  • Fix:
    1. Add Settings → Display "Text size" (100 / 115 / 130 %) stored in tk.textScale, applied before first paint by
       setting document.documentElement.style.fontSize in the inline boot script (index.html) so the splash also follows.
     2. On iOS native, optionally read UIFontMetrics through a tiny plugin, or default the setting from matchMedia
       (owner/native decision).
     3. Scale canvas label sizes by the same factor (BattleScene text and VillageScene.ts:239,403).
     4. Device pass: Android font scale 1.3 / 2.0 and iOS Larger Text with the new setting, at 360×640.
  • Tests: Playwright at 320×568 with fontSize 130 %: no horizontal overflow, the bottom bar fits, and every #hud
    button is still hit-testable (reuse probe3). Unit: the setting persists and is applied before main.ts runs.
  • Done when: the 130 % setting passes probe3 with no overflow at 320×568 in de and ta, and a device run at
    Android 1.3 font scale is recorded.
  • Don't break: the bottom bar fits 320 px (--rb* steps); inputs ≥ 16 px; no user-scalable=no.

 UX-09 — Delete saved army is one tap with no confirm or undo (earlier D-3, inferred)
 • Severity: LOW


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 64
  • Status: PARTIAL
  • Kind: CODE
  • Compartment: presentation/ui
  • Checklist refs: Masterclass "confirmation on destructive actions"
  • Evidence: src/presentation/ui/armyUi.ts:439-443: the "×" button dispatches deleteArmyPreset at once and
    redraws. It sits in the refill row next to the refill action (refillRow), so a stray tap loses a composed preset. Other
    destructive actions confirm (dismiss armyUi.ts:508-533, cancel :476,554, leave Alliance groveUi.ts:312, delete
    account hud.ts:1370, start over settingsUi.ts:358).
  • Fix: show an undo toast t('army.presetDeleted') with an "Undo" action that re-dispatches saveArmyPreset with the
    removed preset at its index (5 s). Alternatively use kit.confirm(..., danger=true). Undo is better for a cheap
    action.
  • Tests: DOM: click "×" on a preset, then the preset is gone and a toast with Undo exists; click Undo and the preset
    is back with the same name and army.
  • Done when: a deleted preset can be restored within 5 s.
  • Don't break: the Army panel's "never rebuild while a finger is on a button" rule; text via t().

 UX-10 — Review prompt counts wins only when the player taps "Return home"
 • Severity: LOW
 • Status: PARTIAL
 • Kind: CODE
 • Compartment: presentation/ui
 • Checklist refs: G26 (review after a win)
 • Evidence: src/presentation/ui/battleHud.ts:880-889: noteBattleResult runs only in the "Return home" onClick.
    The next actions (...next.map(...), :881) and "Watch replay" skip it, so wins left that way are never counted and
    REVIEW_MIN_WINS (5) is reached late or never. The policy itself is sound (reviewPrompt.ts:34-40: win, tutorial done,
    gap, max 3).
  • Fix: in showResult, count the result once when the result modal opens (noteBattleResult(win, tutorialDone, now,
    { ask: false })) and request the sheet only on close of the result through any button. Split noteBattleResult into
    countBattleResult and maybeAskForReview.
  • Tests: unit: count on show plus ask on close; leaving through a next action still increments wins and may ask;
    practice, trial and replay never count.
  • Done when: five wins left through any button can lead to one review request.
  • Don't break: never after a loss, never in the tutorial, never over a dialog.

 UX-11 — Battle keeps running behind iOS Control Center / notification shade
 • Severity: LOW
 • Status: NEEDS-DEVICE
 • Kind: DEVICE (then CODE if confirmed)
 • Compartment: integration (main.ts) / presentation/render
 • Checklist refs: Masterclass "interruptions (call, notification, Control Center)"
 • Evidence: battles pause only through Phaser's hidden-page sleep plus the 250 ms delta cap
    (battleSession.ts:77). No blur/pagehide battle pause (grep in main.ts, app.ts, BattleScene.ts). Pulling down
    Control Center does not fire visibilitychange in iOS Safari or WKWebView (inferred), so the 3:00 battle clock
    keeps going while the player cannot act. A call does hide the page.
  • Fix (after device confirmation): on window.blur during a live, offline-only battle (no ticket), show a "Paused"
    overlay and stop session.update until focus. Online ticket battles keep the server clock, so show a "battle
    continues" note only.
  • Tests: Playwright: dispatch blur in a practice raid → sim.tick does not advance for 2 s; focus resumes.
  • Done when: a device run records behaviour for Control Center, the notification shade and an incoming call.
  • Don't break: replays from seed and deployments (presentation-side pause only); server-held ticket timing.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 65
 Lane GT: Content, game design, game theory and strategy
 Audited commit 560ce7a (HEAD). Read-only: no repository file was edited. Measurements ran in a scratch copy (git
 archive HEAD plus npm ci under the session scratchpad). Scripts:
 docs/audit/bulletproof-2026-11-21/evidence/gt/gt.ts, evidence/gt/run.mjs and evidence/gt/rep.mjs in that copy.
 They are not in the repo.
 What I ran
  • npx vitest run tests/gameplay/balance: 11 files, 105 tests pass (75 s). The slow files are not in this set.
  • Trial ladder probe (gt.ts trials), tiers 1-66. Each tier used trialBase(t, data, v) for v 0-1 and two bot sides,
    with the raid bots' mix at the tier's own Keep, research at its caps and the hero. That is 4 battles a tier.
  • Luck probe (gt.ts luck) at Keeps 6, 10 and 15. Bases were 5 generated layouts at level bias 0.5, with fixed bot
    deployments; only setup.seed changed, over 12 seeds a cell.
  • Multi-seed campaigns (evidence/gt/rep.mjs): the regular campaign over 8 replicates through ModelPlayer's own
    unused rep option (tools/balance/playerModel.ts:67,108). Rep 0 is the committed run. The casual campaign ran
    over 6 replicates (reps 0-5).
  • Storage vs cost check (python over buildings.json, hall.json and troops.json).
  • Read: campaign.json / CAMPAIGN.md (fingerprint current, since campaign-gates passes) and ARMY_BALANCE.md. No
    combat data has changed since that file was generated on 2026-11-18: the only later sim/battle change is
    3cd05a5, the own-property canDeploy fix with valid battles unchanged.
 Labels from the earlier audit
  • D-2 (casual loss and late raiding) and D-4 (honor and Power) are named in the brief.
  • D-1, D-3, D-5 and D-6 are inferred. Their most likely subjects:
    • D-1: defense does not matter late, and does nothing online (WORLDWIDE_AUDIT S1, P2-12).
    • D-3: one army wins, the "solved line" (S2).
    • D-5: the Trial ladder sawtooth, or the 3★ stake lottery.
    • D-6: war-chest free riding / alt feeding, or Power ≈ Keep.

 GT-01 — Honor is not zero-sum: no loss on defense, gains against generated bases,
 win-trading pays both sides (earlier D-4, LD-2; inferred D-6 in part)
 • Severity: HIGH
 • Status: FAIL
 • Kind: DESIGN
 • Compartment: gameplay/data, server
 • Checklist refs: Checklist 17e (leaderboards), 17d (collusion and win-trading); Masterclass 17 Exploits and abuse;
    Goodhart's law
  • Evidence:
    • src/gameplay/data/ranks.json sets defenseHonorLossShare: 0, and ranks.ts defenseHonorLoss returns 0, so a lost
       defense never costs honor.
     • attackWin.base 24 pays +24 at equal honor, with perTrophyBelow 0.25 only below.
     • server/core/pvp.ts:756-770: the attacker's honor delta uses ticket.defenderTrophies. For a generated base that
       is base.trophies from opponentForRank, near the attacker's own honor (pvp.ts:378-391). Honor therefore climbs
       against generated bases at 3 AM.
     • pvp.ts:777-783: "bots never move a rating". They do move honor.
     • A Keep-only snipe (1★ from hallDestroyed, battle.ts:850-854) under 30% destruction gives the defender no
       shield (raids.json shieldTiers 30/60/90). Only recentTargets (1 h) and exposure ordering stand between two
       colluding accounts.
     • Each account gains +24 a win and loses nothing when raided. MAX_HONOR_FROM_ONE_ATTACKER 40 (pvp.ts:703)
       caps only honor fed by lost raids.
     • League chests pay Jade by honor (ranks.json leagues[].chest.moonstones 10-200 a month), and three leagues
       give looks.
    • LD-2 "honor rewards session count" is re-confirmed in docs/audit/understand-2026-11-16/defense-raids.md:222.
  • Fix:


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 66
     1. Set ranks.json defenseHonorLossShare to 0.5 (staked honor), keeping defenderDailyHonorLossCap 150. Gate it on
       the attacker having won at least 1★ with ≥ 30% destruction, so a snipe moves little.
     2. In pvp.ts settle, pay a generated-base win at most attackWin.base × generatedHonorShare, a new ranks.json
       key of about 0.5. Or exclude generated-base honor from the public board (keep a separate "practice honor").
       State this on the result screen (Honesty).
     3. Give the defender a minimum shield after any raid that took ≥ 1★ (a new shieldTiers entry {stars: 1, hours:
       4}). Or exclude a pair raided within 24 h from findOpponents (pair memory in recentTargets).
     4. Per-pair daily honor cap: at most pairHonorPerDay (e.g. 48) between the same two accounts in either direction.
     5. Re-measure: extend rating-convergence.test.ts into an honor-economy simulation with N players, a share of
       colluding pairs and generated-base fill at low population. Rerun npm run balance:campaign; the campaign's
       honor column feeds the matchmaker.
  • Tests: a new tests/backend/server/honor-collusion.test.ts. Two accounts at equal honor raid each other 10
    times in a day (Keep snipe, under 30%). Total honor gain ≤ the pair cap, and the sum of both accounts' honor
    change ≤ 0 net of generated-base wins. Also a sim test that defenseHonorLoss(24) > 0.
  • Done when: in the honor simulation, a colluding pair gains ≤ 10% more honor a month than an honest pair with
    the same win rate. Generated-base wins give ≤ 50% of real-base honor. The honor board correlates with Attack
    Rating (Spearman ≥ 0.6) in the population simulation.
  • Don't break:
    • Honor is a matchmaker input, so rerun balance:campaign and keep campaign-gates.
    • The matchedKeep / Next fee reads no honor (keep it so).
    • The server replays settleOnlineAttack, so note it in docs/backend/REQUESTS.md and docs/PROTOCOL.md if
       AttackResponse changes.
     • Under-13 board rules (DECISIONS line 13).
     • Generated opponents stay labelled.

 GT-02 — The casual early dip moved from Keep 3 to Keep 4 (days 2-6) and the gates
 cannot see it (earlier "Keep 3 dip")
 • Severity: HIGH
 • Status: FAIL
 • Kind: TOOLING + DESIGN
 • Compartment: tests, gameplay/data
 • Checklist refs: Checklist 17c (difficulty spikes, D1-D14 window); Masterclass 4.8 Flow
 • Evidence:
   • docs/game-theory/CAMPAIGN.md, casual: Keep 4 has 3 raids, 0.67★, 67% won; Keep 5 has 7 raids, 0.57★, 43%
       won. These are days 1.7 to 14.7.
     • casual_explorer Keep 4: 5 raids, 0.40★, 20% won. casual_hires Keep 4: 0.67★; Keep 7: 50% won.
     • 6-seed casual pool:
 | Keep | Raids | Stars | Won | Per seed | |---|---|---|---|---| | 4 | 29 | 0.48★ | 31% | 3-7 raids a seed; one seed 0.14★ /
 14% won | | 5 | 56 | 1.11★ | 59% | | | 6 | 73 | 1.29★ | 71% | | | 3 | 26 | 1.46★ | 77% | |
     • Regular Keep 3 is fixed (1.94 ± 0.22★ over 8 seeds).
     • campaign-gates.test.ts:36,60-66: rows(id, minRaids = 5) drops casual Keep 4 (3 raids). pairs() then joins Keep
       3 (2.00★, 5 raids) with Keep 5 (0.57★, 7 raids), giving 1.17★, which passes 0.9. The explorer has no lower
       gate below Keep 8.
  • Fix:
    1. Gates: in campaign-gates.test.ts, add a per-Keep floor for casual, casual_explorer and casual_hires at Keeps
       3-7. Pool raids across replicates (see GT-11) rather than dropping low-count Keeps, and use a lower confidence
       bound: Wilson 90% lower bound of wins ≥ 0.5.
     2. Design: diagnose before tuning. Keep 4 already has powerSlackByKeep[3] 0.75 (Keep 5 has 0.25), so the Keep
       4 dip probably comes from the army, not slack alone (inferred): a casual player one day after Keep 4 fields
       small camps and new-tier warriors at level 1, and does about one raid a day. Measure opponent Keep against
       army strength at casual Keep 4 (CAMPAIGN.md reads 3.3 against 3.15). Then try a Keep-4 researchFloorKeeps
       override, newPlayer-style easing for the first N raids after a Keep-up, or a faster Keep 4 research step



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                           Page 67
       (troops.json research seconds).
     3. Check that the casual suggested army at Keep 4-5 includes the newly unlocked roles. The explorer at Keep 4
       scores 20% won with the newest warriors, which links to GT-04.
     4. Re-measure with npm run balance:campaign plus a 6-seed casual run (rep).
  • Tests: the casual Keep 4 gate first. It fails today: 6-seed pool 0.48★ / 31% won; committed seed Keeps 4-5 0.60★
    / 50%.
  • Done when: casual, casual_explorer and casual_hires each reach ≥ 0.9★ and ≥ 55% wins at Keeps 4 and 5,
    pooled over ≥ 6 seeds, with a 90% lower bound ≥ 0.5 wins. The regular Keep 3 gate still passes.
  • Don't break: the farming bound (≤ 50% three-star at Keeps ≥ 6); sandbagger ≥ regular days; slack changes ride
    the server's generated fallback (pvp.ts:381), so log them in docs/backend/REQUESTS.md; the campaign fingerprint.

 GT-03 — Air is a dominated family: weakest and most expensive from Keep 6 (earlier "Air")
 • Severity: HIGH
 • Status: FAIL
 • Kind: DESIGN
 • Compartment: gameplay/data
 • Checklist refs: Checklist 17b (dominated strategies, usage matrix); Masterclass 17 Balance and counters
 • Evidence:
   • docs/game-theory/ARMY_BALANCE.md (current: no combat data change since generation). Air (80% air + 20%
       melee) by Keep:
 | Keep | Destruction (3★) | Rank among 9 armies | |---|---|---| | 6 | 47 (0%) | 9th | | 7 | 47 (0%) | 9th | | 8 | 36 (0%) |
 7th | | 10 | 49 (0%) | 8th | | 12 | 26 (0%) | 9th, below the 30% family floor | | 15 | 44 (0%) | 7th |
     • Training costs about 2× the others: K15 7.9M Provisions vs 4.0M for the mix; K12 1.2M vs 0.6M.
     • army-lab.test.ts:106 gates the family floor only at Keeps 7, 8 and 15, so air@12 = 26 is ungated.
       army-lab.test.ts:98 gates air only from above (< 95%).
     • Live counters cut air another 12.3 points at K8 (counters table).
     • Five warriors (owl_bomber, crane_glider, lantern_balloon, thunder_kite, dragon_kite_armada; 10% of the roster),
       and crane_glider<owl_bomber is a regressing pair.
     • Air only wins against bases without anti-air (P2-03: 38 → 97% at K15). Rational players will not train it, and
       then the Sky Bow and Ballista have no real-player target (inferred).
  • Fix:
    1. Rebalance the Sky role budget in roster.json / progression.json (efficiency 0.494, DECISIONS line 32). Raise
       it, or cut air Provisions cost (troops.json levels[].cost.dew) to parity with ground per destruction point. The
       target is the air family within 10 points of the median family at every lab Keep.
     2. Keep the anti-air counterplay: air ≤ 60% against a base with capped Sky Bows and Ballista.
     3. Run node tools/progression/rolecut.mjs for the Sky role.
     4. Then npm run rules:snapshot, bump SIM_RULES 8 → 9 and update the fingerprint in
       tests/gameplay/battle/rules-version.test.ts.
    5. Run npm run balance:armies, npm run test:slow (kits-tiers) and npm run balance:campaign.
  • Tests: extend the family floor gate in army-lab.test.ts to Keeps 6, 10 and 12, and add a cost-efficiency gate:
    destruction per million Provisions for air ≥ 0.6× the mix's. Both fail today (air@12 26%; air@15 44/7.9 = 5.6 vs
    mix 84/4.0 = 21).
  • Done when: air is ≥ 40% destruction at every lab Keep, ≥ 0.6× the mix's destruction-per-Provision, and ≤ 60%
    against capped anti-air. No army goes over the 92% / 60% gates.
  • Don't break: the SIM_RULES bump after the snapshot; server deploys first (docs/backend/REQUESTS.md); raider mixes
    (raidVillage air raid); the aura-cache.test.ts re-pin needs the bump; campaign-gates.

 GT-04 — Newer warrior tiers score below older ones and 20 kits do nothing: unlocking is a
 sunk-cost trap (earlier "regressing tiers")
 • Severity: HIGH
 • Status: FAIL



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                            Page 68
  • Kind: DESIGN
  • Compartment: gameplay/data
  • Checklist refs: Checklist 17b (power creep, early vs late scaling); Masterclass 17 Sunk cost
  • Evidence:
    • tests/gameplay/balance/kits-tiers.test.ts:22-24: TIER_KNOWN_BELOW lists 12 pairs scoring below the previous
       tier at Keep 15, among them storm_sovereign<moonblade_master, thousand_needle<chain_sickle_reaper,
       volcano_cannoneer<siege_bombardier, ghost_engineer<fuse_master and crane_glider<owl_bomber.
     • KIT_KNOWN_BELOW lists 20 kits worth < +2 points.
     • Effect: casual_explorer (newest warrior of each family) 0.62★ / 38% won at Keep 15 and 0.71★ at Keep 12
       (CAMPAIGN.md). The gate was lowered to 0.55 per pair / 0.75 mean with the 0.9 target not met
       (campaign-gates.test.ts:86-94, P4-09 partial).
     • Each newer tier still costs research up to 25.9M Provisions a level (storm_sovereign L12) and appears as
       progress in the Codex.
  • Fix:
    1. For each TIER_KNOWN_BELOW pair, raise the newer warrior's dpsScale / hp in roster.json + troops.json until its
       K15 kitValue score is ≥ the older one's + 2. Do one role at a time with node tools/progression/rolecut.mjs.
     2. For each kit in KIT_KNOWN_BELOW, either strengthen it to ≥ +2 or remove it and fold its budget into stats. A kit
       that does nothing is misleading Codex text (Honesty).
     3. Rules: npm run rules:snapshot, then bump SIM_RULES (batch this with GT-03 into one bump).
     4. Re-measure with npm run test:slow (kits-tiers), balance:armies and balance:campaign.
  • Tests: the lists in kits-tiers.test.ts already fail when an entry is fixed. Add a target test: TIER_KNOWN_BELOW.size
    === 0 as it.fails today, plus the explorer mean gate restored to 0.9.
  • Done when: TIER_KNOWN_BELOW and KIT_KNOWN_BELOW are empty; casual_explorer averages ≥ 0.9★ at Keeps 8-15
    across ≥ 4 seeds; progression-model.test.ts "no dominance inside a tier" still passes.
  • Don't break: the SIM_RULES bump after the snapshot; the original six units' stats through level 5
    (src/gameplay/CLAUDE.md); the single-warrior < 85% gate (kits-tiers.test.ts:58-62); the farming bound; the
    server deploys first.

 GT-05 — Late defense barely matters, costs a month on the fortress path, and does
 nothing online (inferred earlier D-1; WORLDWIDE S1, P2-12)
 • Severity: HIGH
 • Status: FAIL
 • Kind: DESIGN (+ server)
 • Compartment: gameplay/data, server
 • Checklist refs: Checklist 17b (attacker vs defender advantage, turtling), 17e (snowball/comeback); Masterclass
    17 Balance
  • Evidence:
    • CAMPAIGN.md "Is defense worth building?": held at Keeps 12/13/14/15 is regular 13/3/5/0%, regular_defender
       (counters first) 4/5/0/0%, fortress 69/44/31/12%.
     • 8-seed regular Keep 15 held: 3% ± 4.
     • The fortress reaches Keep 15 on day 129.6 against 100.2 for the rusher (1.29×). The gate checks only Keep
       12, at ≤ 1.25× (campaign-gates.test.ts:157-159).
     • The defender policy loses 57% of its loot vs the regular's 51%, so building counters first is worse.
     • Online, no raids reach a village except real players': src/main.ts:284 botRaids: !serverUrl; P2-12 not
       built (docs/backend/REQUESTS.md:11,23). The released game therefore runs 11-13% faster than every gated
       campaign, and all defense tuning is offline-only.
     • Raids with a server re-simulate real attacks only (pvp.ts). The hold reward is never paid for real raids (by
       design, against alt trading).
  • Fix:
    1. Ship P2-12 (BACKEND), or explicitly scope launch campaigns to "no bot raids online". Add an online campaign
       policy (botRaids: false) so the gated numbers describe the build that ships.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 69
     2. Late defense return: from Keep 12, raise raids.json carryByStars[0..1], the share a raider carries at 0-1★
       (today 0.2 / 0.5), so a near-capped base loses less. Or scale defenseWin.shareOfRaidLoot by Keep within the
       17% cap (do not raise it without daily_live.ts, owner decision 2026-11-20).
     3. Add a Keep 15 fortress gate: fortress Keep 15 day ≤ 1.2× the rusher's. Add a held-share gate for
       regular_defender at Keeps 12-15 of ≥ 15%.
     4. Re-measure with npm run balance:campaign over multi-seed (GT-11) and
       docs/audit/understand-2026-11-16/scripts/defense-raids/daily_live.ts.
  • Tests: a gate in campaign-gates.test.ts that regular_defender's held share at Keeps 12-15 ≥ 0.15. It fails today:
    0.02, from (27×4 + 37×5 + 39×0 + 36×0)/139.
  • Done when: defender held ≥ 15% at Keeps 12-15 and fortress Keep 15 ≤ 1.2× the rusher's days, both over ≥ 4
    seeds; P2-12 live, or an online campaign gated; defense rewards ≤ 1/5 of a regular day's raid loot
    (daily_live.ts).
  • Don't break: defenseWin.shareOfRaidLoot is an owner decision; hold rewards never come from real raids (alt
    trading); "the fortress loses ≤ 0.62× the rusher's share" gate; the casual loss (GT-06) must not rise; the server
    replays applyDefense (docs/backend/REQUESTS.md).

 GT-06 — Casual players lose about what they loot, and late raiding is a small share of
 income (earlier D-2)
  • Severity: HIGH
  • Status: FAIL
  • Kind: DESIGN
  • Compartment: gameplay/data
  • Checklist refs: Checklist 17f (risk and reward, loss aversion); Masterclass 17 Loss aversion
  • Evidence:
    • CAMPAIGN.md totals, stolen ÷ looted: casual 96% (368M of 382M), casual_explorer 160%, casual_hires 106%,
       casual_queues 58%.
     • Across seeds: casual 0.98 ± 0.09 (6 seeds, range 0.91-1.16); regular 0.53 ± 0.03 (8 seeds).
     • The gate is "regular < 0.8" only. Casual is explicitly "E26 open" (campaign-gates.test.ts:130-134).
     • Keep 15 economics, computed:
       • Collectors make 12 × 296,957 = 3.56M/h (buildings.json acorn_orchard / dewdrop_well L24).
       • A regular Keep 15 raid banks 5.12M against a 4.0M-Provision army (ARMY_BALANCE.md mix K15) trained in 6.6
           h / 4.5 (Dojo L13 trainingSpeed) ≈ 1.47 h.
        • Net ≈ 1.1M a raid ≈ 0.76M per training hour, about 21% of collector income, before the 62-76% win rate.
        • The earlier audit's 170k/h (≈ 5%) used other assumptions. Either way raiding is a minority income late.
        • Raids against the regular village at Keep 15 take 6.9M each (30 raids), more than a raid nets.
    • Online this applies only to real-player raids (P2-12; see GT-05).
  • Fix:
    1. Cap per-raid loss as a share of the casual player's daily production. Use a new raids.json
       lossCapHoursOfProduction (e.g. 6 h of their collectors) applied in raidVillage / capBaseLoot on top of
       storageLootCapByHall.
     2. Or extend exhaustion, so the second raid within 36 h on a one-visit player takes ×0.25.
     3. Raise late raid value: lower army Provisions cost at Keeps 13-15, or raise loot share. Re-measure the net per
       training hour (script in the scratch copy as a starting point).
     4. Run npm run balance:campaign with all casual policies over 6 seeds.
  • Tests: a gate casual.totals.stolen / casual.totals.looted < 0.6 and casual_explorer < 0.8. Both fail today (0.96 /
    1.60).
  • Done when: casual ≤ 0.6 and explorer ≤ 0.8 stolen ÷ looted (mean of ≥ 6 seeds); late raid net per training hour
    ≥ 25% of collector income at Keep 15; regular Keep 15 still 100-140 days.
  • Don't break: the "fortress ≤ 0.62× rusher" gate; the farming bound; defense rewards ≤ 1/5 of a day's raid loot;
    campaign-gates fingerprint and bounds.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 70
 GT-07 — One army wins: the raid-bot mix (= the Suggested army) dominates at Keep 15,
 and Keep 12 has one best answer to every temper (inferred earlier D-3; WORLDWIDE S2)
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: DESIGN
 • Compartment: gameplay/data, gameplay/sim
 • Checklist refs: Checklist 17b (equilibrium meta, "solved line"); Masterclass 17 Dominant strategies
 • Evidence:
   • ARMY_BALANCE.md Keep 15: mix 84 (33%) against artillery 69, shadow 57, breach 53, support 51, light-support
       50, air 44, melee 39, siege 37. Keep 12: mix 67 against 52 next.
     • kits-tiers.test.ts:67 lists it.todo('KNOWN GAP (P4-06): one army is best on all four temper profiles at Keep
       12').
     • The casual "suggested army" is the raid bots' roles (CAMPAIGN.md), so the game itself recommends the
       dominant line.
     • An older searched mixed army reached 87-98% against every temper profile
       (TEMPERING_CALIBRATION_2026-11-09.md:52,66; rules 6-7, stale for rules 8).
     • Live counter effects move most cells by ±3 points (ARMY_BALANCE.md counters table).
     • WORLDWIDE_AUDIT "2026-11-20 exploit and strategy audit" S2 is OPEN.
  • Fix:
    1. Keep 12: tune battle.json temper axes (Watch/Blast/Reach) until no army is best on all four profiles. Use the
       harness docs/audit/balance-2026-11-08/scripts/design/temper_calibration.ts.
     2. Make the Suggested army scout-aware (read ScoutReport.profile) rather than one mix.
     3. Pull GT-03 and GT-04 in first: they widen the viable set.
     4. Put a searched attacker in CI (GT-11).
     5. Bump SIM_RULES after rules:snapshot.
  • Tests: turn the it.todo into a real test (per temper profile, the best army differs at Keep 12), and add an army-lab
    gate: at Keeps 12 and 15 at least 3 compositions within 10 points of the best.
  • Done when: at Keeps 12 and 15, ≥ 3 of the 9 compositions are within 10 points of the best on untempered bases;
    no single army is best on all four profiles at Keeps 12 and 15 (lab, 4 seeds).
  • Don't break: the 92% / 60% army gates; the single-warrior < 85% gate; rules bump procedure; generated rival
    tempers (rivalTempers) stay labelled; the server deploys first.

 GT-08 — The Keep 15 cliff is real in every seed, and the pair rule hides it (earlier "Keep 15
 cliff gate", 4.8)
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: TOOLING + DESIGN
 • Compartment: tests, gameplay/data
 • Checklist refs: Checklist 17c (difficulty cliffs); Masterclass 4.8 Flow
 • Evidence:
    • 8-seed regular means, Keep 14 → Keep 15: 1.72 → 1.25★ (drop 0.47 ± 0.08, min 0.33); 84% → 68% won; 3★
       8%.
     • The committed seed is the second-worst: 1.10★ / 62% / 3%.
     • regular_fortress Keep 15: 0.96★ / 57% / 0% three-star. casual_explorer Keep 15: 0.62★ / 38%.
     • campaign-gates.test.ts:73-77 checks Keep 8+ pairs ≥ 1.2★. The Keep 14-15 pair is (87 × 1.69 + 61 × 1.10) /
       148 = 1.45, which passes. Keep 15 alone is never gated at 1.2.
     • Cause (inferred): at Keep 15 hallsAbove cannot lift the base Keep, but honor (4,687) lifts the level bias to
       maxed Keep 15 bases, while army strength is capped at 14.0 (attackerStrength). powerSlackByKeep[14] = 0.5.
  • Fix:
    1. Add a single-Keep lower bound for Keep 15 (regular, regular_defender, regular_fortress): ≥ 1.2★ and ≥ 65%
       won, pooled over seeds.


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                         Page 71
     2. Design options:
        • Raise powerSlackByKeep[14].
        • Cap the honor-driven level bias at Keep 15 (matchStrength with strengthJitter).
        • Add Keep 15-only research headroom (troop level cap +1 via levelCapOffset), so the endgame has a climb.
     3. Re-measure with balance:campaign over multi-seed.
  • Tests: the Keep 15 single-Keep gate. It fails today for the committed regular (1.10★, 62%) and fortress (0.96★,
    57%).
  • Done when: regular Keep 15 ≥ 1.4★ and ≥ 70% won (8-seed mean, lower 95% bound ≥ 1.25★); Keep 14→15
    drop ≤ 0.25★; farming bound still holds.
  • Don't break: the farming bound (≤ 50% three-star at any Keep ≥ 6 with ≥ 10 raids); matched-raid bounds
    (matched.test.ts); server fallback slack (docs/backend/REQUESTS.md).

 GT-09 — The Shadow Trials ladder is a sawtooth: each Keep's last tier is unclearable with a
 capped army, and the next tier is trivial (inferred earlier D-5 / "regressing tiers")
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: DESIGN
 • Compartment: gameplay/sim, gameplay/data
 • Checklist refs: Checklist 17a ("every Trial tier beatable", solver proof), 17c (spikes); Masterclass 4.8 Flow
 • Evidence:
   • sim/trials.ts:78-82: levelBias = within / (tiersPerHall − 1), so within each Keep the four tiers go from level
       bias 0 to 1.
     • My probe (capped raid-bot mix at the tier's Keep, hero, 4 battles a tier), average stars and clears:
 | Tier | Stars | Clears | |---|---|---| | 23 | 0.25★ | 0/4 | | 24 | 0.75★ | 1/4 | | 25 | 3.00★ | 4/4 | | 27 | 1.0★ | 0/4 | | 28 |
 0.25★ | 0/4 | | 29 | 3.0★ | 4/4 | | 32 | 0.0★ | 0/4 | | 33 | 3.0★ | 4/4 | | 36 | 0.0★ | 0/4 | | 37 | 2.25★ | 3/4 | | 40 | 0.25★
 | 0/4 | | 41 | 3.0★ | 4/4 | | 47 | 0.5★ | 0/4 | | 48 | 0.25★ | 0/4 | | 49 | 2.75★ | 4/4 | | 60 (elite) | 0.25★ | 0/4 | | 62 |
 0.25★ | 0/4 | | 64 | 0.25★ | 0/4 | | 65 | 2.0★ | 4/4 |
     • Clears need 2★ (trials.json starsToClear 2). Rewards grow with the tier while difficulty does not
       (rewardLog2Growth).
     • No test proves each tier is clearable by any plan. The bot plan is weak (humans do better), but no search
       exists.
  • Fix:
    1. Spread level bias over the ladder rather than resetting per Keep. For example, tier t uses Keep floor((t − 1)
       / tiersPerHall) + 1 with bias 0.25 + 0.5 × within / 3, and tier 4k+1 starts at the bias where tier 4k ended,
       minus the new Keep's step.
     2. Or order tiers by measured difficulty: compute defenseStrength × layoutPower × power (trials.ts:61-75) and
       require it non-decreasing.
     3. Add a CI proof with a small search over infiltration points: best of 6 points × 2 orders × 2 seeds ≥ 2★ for
       every tier ≤ the documented cap, with an army at the tier's Keep caps.
     4. Re-measure the probe and achievements-reachable.test.ts TRIAL_CAP.
  • Tests:
    • A monotonicity gate in tests/gameplay/balance/: mean destruction of the capped bot mix over 4 battles never
       rises more than 15 points from tier t to t+1 inside 1-60. It fails today: 32 → 33 is +66, 28 → 29 is +58.
    • A clearability gate: best-of-search ≥ 2★ for tiers ≤ 58.
  • Done when: both gates pass; tier 58 is still the measured ceiling or is re-documented; Trial looks (20/40/55) are
    still reachable (achievements-reachable.test.ts).
  • Don't break: trials.test.ts (growth, no skipping, rewards once, forged bases ignored); trialEnd seeds from
    trialBattleSeed; the campaign fingerprint includes Trials (the model plays them), so rerun balance:campaign; no
    SIM_RULES change unless the battle rules change (the base is generated data, not combat data).


 GT-10 — A declared 3★ stake is partly a lottery and the stake screen shows no odds (17g)
 • Severity: MEDIUM


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                               Page 72
  • Status: PARTIAL
  • Kind: DESIGN + UI request
  • Compartment: gameplay/data (+ presentation request)
  • Checklist refs: Checklist 17f (randomness and skill, commitment); Masterclass 17 Risk, reward, randomness
  • Evidence:
    • The deploy jitter battle.json deploySpread 0.3 is drawn from sim.rng (battle.ts:306-308). Further sim.rng draws
       are at battle.ts:668-669,725 and crits at warriors.ts:338.
     • My luck probe (fixed deployments, battle seed only, 12 seeds a cell):
       • Destruction SD: K6 4.7, K10 9.3, K15 2.6. Results off the modal star count: 29% / 16% / 8%.
       • Worst cells: K15 base0 side-2 gave 6/12 three-star (coin flip). K10 base3 side-2 gave stars 0/1/2/3 = 1/5/3/3,
           SD 19.5. K10 base0 side-2 gave 10/12 three-star, side-1 only 1/12.
     • Stakes 1.3 / 1.75: break-even hit rates 77% / 57% (raids.json stakes $commentP208). The regular 3★ rate at
       Keep 15 is 8% ± 4 over 8 seeds.
     • The UI text (locales/en/ui.json:174-179) shows no hit rate.
     • The server comment "a guessed seed predicts a raid's win or loss about 98% of the time" (pvp.ts match) holds
       for win/loss, not 3★.
  • Fix:
    1. Either drop deploySpread to 0.15 (rules bump; re-measure seed SD), or keep it and show "your last 10 raids
       reached 3★ N times" on the stake picker (recentRaidRates exists for tasks). Request the display from
       presentation in docs/art/REQUESTS.md, text via t().
     2. Consider making the 3★ stake pay partial (×0.5) at 2★ instead of 0. Re-measure EV with the P2-08 harness.
     3. Add the luck probe to the slow suite (12 seeds × 5 bases × K6/10/15).
  • Tests: a slow test that for the capped bot mix on 5 bases, the seed-only share of 3★ results that flip vs the modal
    result is ≤ 10% at K10 and K15. It fails today at K10 (16%).
  • Done when: seed-only star flips ≤ 10% at Keeps 6/10/15, or the stake screen shows the player's own recent hit
    rate; EV of a 3★ stake for the bot plan stays < 1 (no free money).
  • Don't break: any deploySpread change is combat data (rules:snapshot then a SIM_RULES bump); the online stake is
    fixed at /attacks/start before the seed; stakeMet is shared with the server.

 GT-11 — Methods gap: single-seed campaigns, no searched attacker in CI, no Jade lifetime
 model, no telemetry plan (17h)
 • Severity: MEDIUM
 • Status: FAIL
 • Kind: TOOLING
 • Compartment: tools/progression, tests (tools/balance)
 • Checklist refs: Checklist 17h (methods); Masterclass 17 Methods
 • Evidence:
   • ModelPlayer has rep (tools/balance/playerModel.ts:67,108), but tools/balance/campaign.ts and
       run-campaigns.mjs never pass it.
     • My 8 regular seeds:
 | Measure | Mean ± 95% CI | Range | |---|---|---| | Keep 12 day | 49.9 ± 1.0 | 47.4-51.6 | | Keep 15 day | 103.7 ± 1.3 |
 100.2-106.2 (gate ≥ 100: one seed sits on the bound) | | Keep 15 stars | 1.25 ± 0.11 | 1.07-1.44 (committed seed
 1.10) | | Keep 15 three-star | 0.08 ± 0.04 | 0.01-0.18 | | Keep 3 stars | 1.94 ± 0.16 | 1.40-2.14 (gate 1.2) |
     • My 6 casual seeds:
       • Keep 15 day 176.9, range 166.4-183.4 (committed seed 179.4).
       • Keep 6 day 14.7-19.7.
       • Keep 4 cells of 3-7 raids that swing 0.14-0.75★ between seeds.
     • So single-seed gates such as "Keep 3 ≥ 1.2" and "Keep 15 day ≥ 100" sit inside one-seed noise.
     • No adversarial search in CI: searches live only in docs/audit/balance-2026-11-08/scripts/design/coevo.ts,
       doctrine2.ts and defence_math/*.
     • No Jade field in campaign.json. The model only buys artisans (playerModel.ts:179).


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 73
     • No online defense-loss telemetry. "Real-player playtests are still owed" (campaign-gates.test.ts:12).
  • Fix:
    1. tools/balance/campaign.ts: add reps (default 4 in CI, 8 for releases). Write per-Keep means, SDs and pooled
       raids to campaign.json. Make campaign-gates.test.ts read pooled rows and use lower confidence bounds. Run
       reps in parallel processes as run-campaigns.mjs already does.
     2. tools/balance/search.ts: a deterministic best-of-N attacker (infiltration point × squad order × 2 seeds). Gate
       in slow tests: searched destruction ≤ 95% on capped same-Keep bases at K8/12/15, and Trial clearability
       (GT-09).
     3. Track Jade in KeepRow / totals: earned by source (chest, streak, calendar, tasks, Scroll free, leagues, wars,
       Trials, achievements) and spent. Add the Jade lifetime table to CAMPAIGN.md.
     4. Telemetry request (BACKEND / owner, adults who opt in only): per-Keep raid stars, defense held share and
       stolen ÷ looted, compared with campaign bands.
  • Tests: campaign-gates.test.ts "reps ≥ 4 and every gate reads pooled rows", and a Jade table present in
    campaign.json.
  • Done when: CI campaigns run ≥ 4 seeds, with gates on pooled lower bounds; the searched attacker runs in
    test:slow; the Jade lifetime table is generated; a telemetry spec is in docs/backend/REQUESTS.md.
  • Don't break: the campaign fingerprint (extend SOURCES if new files feed it); CI time (about 3 min a seed set on 4
    cores; mine took ~15 min for 8 regular seeds on 4 cores); privacy (opt-in adult statistics only, random id).

 GT-12 — The Power Ranking is mostly Keep, and the rating's power term uses the Keep,
 not research (earlier D-4)
 • Severity: MEDIUM
 • Status: PARTIAL
 • Kind: DESIGN
 • Compartment: gameplay/sim, server
 • Checklist refs: Checklist 17e (ranking fit, Goodhart)
 • Evidence:
   • rating.ts powerRating = attack.rating + powerWeight × (keep − 1), with ranks.json rating.powerWeight 150.
       Keep 1 → 15 adds 2,100 points; the convergence test's whole skill spread is 700
       (rating-convergence.test.ts:38).
     • Bots never move AR (pvp.ts:777-783), so at low population AR stays 1500 and the board is Keep order.
       powerBoardMinBattles 5 counts rated (real) battles only (inferred from rating path).
     • orderByRating / rateBattle pass me.hallLevel / ticket.base.hallLevel as power (pvp.ts:362,580,780). A
       Jade-rushed Keep with level-1 research reads as full power, so its expected score is overstated and its AR falls.
  • Fix:
    1. Use the attacker's attackerStrength (on the server, the stored village's) as power in expectedScore, and the
       base's defense strength (defenseStrength-like) for the defender.
     2. Power board: rank by AR within Keep bands, or lower powerWeight on the board only (e.g. 50).
     3. Rerun rating-convergence.test.ts, extended with mixed Keeps 3-15 and noise from the measured luck SD
       (GT-10).
  • Tests: convergence with Keeps 3-15: Spearman(Power board, true skill) within each Keep band ≥ 0.85, and the
    board's top 10% includes ≥ 30% players below Keep 15 with top-decile skill (inferred target).
  • Done when: the extended convergence test passes and the Power board is shown as "skill within your Keep
    band".
  • Don't break: the server uses the same functions, so changing rating numbers changes live matchmaking (note it
    in docs/backend/REQUESTS.md); bots never move a rating; under-13 board rules.

 GT-13 — War chests reward a token attack (free riders and slot griefing) (inferred earlier
 D-6 in part; E14)
 • Severity: LOW
 • Status: PARTIAL
 • Kind: DESIGN


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                           Page 74
  • Compartment: server, gameplay/data
  • Checklist refs: Checklist 17d (free riders, griefing); Masterclass 17 Multiplayer incentives
  • Evidence:
    • server/core/groveRaid.ts:163-165 (foughtIn counts attacks) and gangWars.ts:419-420: any reported attack
       qualifies, even one warrior. The chest is the same for every member by outcome (social.json
       groveRaid.rewards, gangWar).
     • A side's attack cap is roster × attacksPerMember (groveRaid.ts:45-47), so a token attack burns a team slot.
     • Alt Gangs fighting each other still pay 3-15 Jade a war (WORLDWIDE #10 Limits).
  • Fix:
    1. Count an attack toward chestMinAttacks only if it deployed ≥ minDeployShare (0.8, as in lossStreakSlack) of the
       camp housing or won ≥ 1★.
     2. Scale the chest by own stars: a base share plus a per-star share.
     3. Server-side check on the re-simulated result.used.
  • Tests: a server test that a war attack deploying one warrior does not unlock the chest. It fails today.
  • Done when: the test passes; Alliance and Gang War chests split ≥ 30% by own stars; a generated-Gang war pays
    no Jade (already true).
  • Don't break: protocol and contract tests (docs/PROTOCOL.md); claimGangChest replay; chests are never sold and
    never random.

 GT-14 — Rating placement and smurf handling unproven at launch population
 • Severity: LOW
 • Status: NEEDS-PLAYERS
 • Kind: TOOLING
 • Compartment: tests, server
 • Checklist refs: Checklist 17e (placement speed, uncertainty, smurfing, queue at low population)
 • Evidence:
   • rdShrinkPerBattle 0.93 takes RD from 350 to 60 in about 24 rated battles. Only real-player raids rate
       (pvp.ts:777-783).
     • The convergence test samples a full Keep 3-6 population of 120 with ±0.15 outcome noise
       (rating-convergence.test.ts:31-51), smaller than the measured luck (GT-10).
    • No simulation covers 10-50 concurrent players or smurfs (a skilled player held at a low Keep).
  • Fix:
    1. Extend rating-convergence.test.ts with a sparse-population mode (20 players over Keeps 3-15, 70%
       generated fill), a smurf cohort and measured noise. Assert that smurfs' victims see an expected score ≤ 0.7.
     2. Plan an online measurement (telemetry) of rated battles a player per week.
  • Tests: the sparse-population simulation.
  • Done when: smurfs face expected ≤ 0.7 against same-Keep players within 10 battles in the simulation; telemetry
    spec exists.
  • Don't break: rating numbers are shared with the server.

 GT-15 — Content runway after Keep 15 is thin for a regular player (≈ day 104)
 • Severity: LOW
 • Status: NEEDS-PLAYERS
 • Kind: DESIGN
 • Compartment: gameplay/data
 • Checklist refs: Checklist 17 content runway
 • Evidence:
   • Keep 15 at day 103.7 ± 1.3 (regular, 8 seeds), 106.4 casual_queues, 179.4 casual, 207.4 explorer
       (CAMPAIGN.md).
     • After that: research to caps (Keep 15 bot-mix caps ≈ 290M Provisions ≈ 6.8 days of income, economy E23);
       the roster under a year (progression-model.test.ts); Trials to about tier 58 (TRIAL_CAP); weekly Gauntlet;



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 75
       monthly leagues.
     • Mastery has no stat bonus (DECISIONS line 71). Fifteen counters, three heroes and the Hero Hall are built but
       not live (P4-10).
  • Fix:
    1. Decide the go-live order for built-not-live content (tests/gameplay/planned/golive-gate.test.ts).
    2. Model hours of play per day per policy in the campaign (sessions × minutes) to state the runway in hours.
  • Tests: none until a playtest; record the runway in PROGRESSION_MODEL.md.
  • Done when: the owner has a runway figure from the campaign plus a playtest plan.
  • Don't break: built-not-live content stays behind withPreview until its gate passes.

 GT-16 — Smoke Bomb, the signature tactic, adds little
 • Severity: LOW
 • Status: PARTIAL
 • Kind: DESIGN
 • Compartment: gameplay/data
 • Checklist refs: Checklist 17b (dominated abilities)
 • Evidence: P4-03 is open. Smoke gain under Rally B is +0.9 to +4.3 points (PROGRESS.md:80). The rule is unchanged
    (DECISIONS line 79).
  • Fix: tune battle.json smoke (range × 0.4, 8 s, charges) toward +6 to +8 points at K10/15, measured with the
    P4-03 harness; batch it into the GT-03/04 rules bump.
  • Tests: a slow test gating smoke's gain ≥ +5 at K10 and K15.
  • Done when: that gate passes and the farming bound holds.
  • Don't break: the SIM_RULES procedure; tactics.test.ts limits.

 GT-17 — Alt-account feeding through server villages and troop gifts is bounded only by
 caps
 • Severity: LOW
 • Status: NEEDS-PLAYERS
 • Kind: DESIGN
 • Compartment: server
 • Checklist refs: Checklist 17d (collusion, alt accounts)
 • Evidence:
   • Uploaded-base loot is capped (exploit #7) and device donors are refused (#8). A server-held alt village still
       pays real loot up to storageLootCapByHall (9.6M at Keep 15) when raided. Lodge gifts move trained troops.
     • Honor feeding by lost raids is capped at 40 a day a pair (pvp.ts:703). Resource feeding has no per-pair cap.
     • Matchmaking is random at low population, so pairs meet by chance (inferred).
  • Fix:
    1. A per-pair daily loot cap (attacker ← same defender) on the server.
    2. A flag on pairs with repeated mutual raids or donations for staff review (/admin).
    3. Measure with telemetry.
  • Tests: a server test that a second raid on the same defender within 24 h pays ≤ the pair cap.
  • Done when: the pair cap is live; the staff tool shows the pair report.
  • Don't break: the exhaustion rule (already halves repeat loot); privacy rules on what staff see.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                    Page 76
 Part C: owner and device checklist
 Code cannot close these. Each needs the evidence named in its row. Record it in docs/store/OWNER_CHECKLIST.md and
 the ledger. Device and owner work items in Part B (ECO-05, STB-11, STB-12, SAV-15, SAV-16, SEC-09, SEC-11)
 belong here too.
ID        What to do                                Where                                 Evidence that closes it                 Clo
                                                                                                                                  ses
OWN-0     Choose the publisher (person or           App Store Connect, Play Console       Payee accepted in both consoles         OWN
1         company). Set up bank and tax in both                                                                                   ER_
          stores; Apple Small Business Program;                                                                                   CHE
          EU DSA trader declaration.                                                                                              CKL
                                                                                                                                  IST
                                                                                                                                  §1,
                                                                                                                                  §3
OWN-0     Trademark and store-name search for    Search provider or lawyer                Search report filed                     OWN
2         "Kagemura" (USPTO, EUIPO, JPO; classes                                                                                  ER_
          9 and 41); pick a fallback                                                                                              CHE
                                                                                                                                  CKL
                                                                                                                                  IST
                                                                                                                                  §1
OWN-0     Choose the final bundle id. Set the       GitHub vars, android/app/src/main/r   npm run release:preflight has no        GL
3         repository variable APP_ID, then          es/values/strings.xml, server env     App id row                              OB
          strings.xml                                                                                                             AL-
          package_name/custom_url_scheme,                                                                                         017
          the Xcode identifier, server APPLE_BUND
          LE_IDS/GOOGLE_PLAY_PACKAGE,
          GAMECENTER_BUNDLE_IDS
OWN-0     Fill every fact in                        public/legal-config.js                Live /privacy.html, /terms.html         GL
4         public/legal-config.js (operator,                                               and /support.html show no "not          OB
          address, phone, responsible person,                                             published yet" and no draft banner;     AL-
          support email, deletion and complaint                                           preflight has 0 legal rows              015
          URLs, EU/UK representatives, hosting
          and Sentry regions, governing law, 4
          retention periods). Date
          termsEffective after legal review.
OWN-0     Lawyer review of privacy and terms per    Server env, docs/legal/               Reviewed texts merged; decisions        GL
5         market. Decide UNDER13_MODE, the                                                recorded in docs/legal/MARKETS.md       OB
          COPPA position, EU_JADE_VALUE,                                                                                          AL-
          APPLE_CONSUMPTION_RESPONSE and the                                                                                      006
          EAA statement.                                                                                                          (m
                                                                                                                                  ark
                                                                                                                                  ets)
                                                                                                                                  ,R
                                                                                                                                  07,
                                                                                                                                  R1
                                                                                                                                  0
OWN-0     Register a domain; decide hosting and     DNS, host                             node tools/ops/check-domain.mjs         R0
6         Sentry data regions; api.<domain> A                                             https://api.<domain> passes (IPv6       8 (I
          and AAAA, HSTS                                                                  too)                                    Pv6
                                                                                                                                  )
OWN-0     Apple: App ID capabilities (Sign in with App Store Connect,                     App privacy section submitted;          R0
7         Apple, Game Center, Push, Declared Age developer.apple.com                      TestFlight build processes              8
          Range), keys (SIWA, App Store Server
          API, APNs), server notification URLs,
          privacy label from PRIVACY.md:58-68
OWN-0     Play: Data safety (PRIVACY.md:70-92),     Play Console                          Each Policy → App content form shows    GL
8         target audience 13+, IARC, Age Signals                                          "Completed"                             OB
          access, deletion URL, service account                                                                                   AL-
          and RTDN, license testers                                                                                               001
                                                                                                                                  ,R
                                                                                                                                  08
OWN-0     Answer both age-rating questionnaires     App Store Connect, Play IARC          Ratings shown in both consoles          OWN
9         (prepared answers                                                                                                       ER_
          PRIVACY.md:94-120, after re-reading                                                                                     CHE
          Apple's definitions)                                                                                                    CKL
                                                                                                                                  IST
                                                                                                                                  §2




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                   Page 77
ID        What to do                                   Where                                   Evidence that closes it                    Clo
                                                                                                                                          ses
OWN-1     Create the 13 in-app products with the       Both consoles; phones                   Screenshots of the store sheet vs the      GL
0         store.json ids and regional prices;                                                  in-game confirm in USD, EUR, JPY/INR       OB
          check prices in 3+ storefronts on                                                                                               AL-
          devices                                                                                                                         007
OWN-1     Create the upload keystore. Put the four GitHub secrets, password manager, Play aab job runs; upload certificate                GL
1         ANDROID_KEYSTORE_* secrets in GitHub. Console                                   SHA-256 matches Play's                          OB
          Back up the .jks and passwords offline                                                                                          AL-
          in two places. Turn on Play App Signing.                                                                                        017
OWN-1     Produce the first signed AAB and upload      android.yml aab job, Play Console       Run log and Play Console screenshot        GL
2         it to internal testing. Confirm Billing ≥8                                           kept                                       OB
          in the log, versionCode increasing, no                                                                                          AL-
          .so (or 16 KB OK in the bundle                                                                                                  001
          explorer), no Billing deprecation                                                                                               ,G
          warning.                                                                                                                        LO
                                                                                                                                          BAL
                                                                                                                                          -01
                                                                                                                                          7,
                                                                                                                                          R0
                                                                                                                                          8
OWN-1     Apple signing secrets (APPLE_TEAM_ID,        GitHub, App Store Connect               A TestFlight build exists with no SDK      R0
3         ASC_*); first ios-testflight.yml run                                                 warning                                    8
          on macos-26; archive validates with the
          PrivacyInfo (OPS-10)
OWN-1     OAuth web and Android clients (with the      Google Cloud, GitHub vars, server env   Test log with date, build and phones       GL
4         Play signing SHA-1). Set                                                                                                        OB
          VITE_GOOGLE_CLIENT_ID and server                                                                                                AL-
          GOOGLE_CLIENT_IDS. Test reinstall and                                                                                           008
          second-device recovery.
OWN-1     Deploy staging and production servers:       GitHub environments, host               server.yml staging contract tests ran      OWN
5         GitHub environments with                                                             (no "No staging contract tests"            ER_
          DEPLOY_HOOK/SERVER_URL, production                                                   warning); production /readyz green         CHE
          required reviewers, every production                                                                                            CKL
          secret                                                                                                                          IST
                                                                                                                                          §4
OWN-1     Run npm run server:load on staging       Staging host                                Numbers recorded in SHIPPING.md 3h;        R0
6         at 10× the expected peak battles/s; size                                             p95 < 1 s; no ResimBusy                    4
          instances, RESIM_WORKERS and rate
          limits; pre-scale production for launch
          day
OWN-1     Sentry: game and server projects,            Sentry, GitHub vars and secrets         A staging test crash shows source          GL
7         VITE_SENTRY_DSN and SENTRY_DSN,                                                      lines; IP storage off (screenshot)         OB
          "Prevent Storing of IP Addresses" on,                                                                                           AL-
          data region recorded,                                                                                                           019
          SENTRY_AUTH_TOKEN for source maps
          (OPS-02), issue alerts to the pager
OWN-1     Scrape /metrics (METRICS_TOKEN),             Grafana Cloud or Prometheus, Better     A test alert reaches the on-call phone     OWN
8         load ops/prometheus/alerts.yml,              Stack/UptimeRobot                                                                  ER_
          route page alerts to a pager (OPS-07                                                                                            CHE
          example), uptime check and public                                                                                               CKL
          status page on /readyz                                                                                                          IST
                                                                                                                                          §4
OWN-1     On-call rota, trained moderator(s),          Team docs                               Rota published for launch week;            R0
9         support mailbox, refund, chargeback                                                  mailbox answers                            6
          and ban policies
OWN-2     Community channel (Discord or similar)       Community platform, support.html        Link live in Settings → Privacy and help   R0
0         staffed and moderated; publish the                                                                                              6
          known-issues list (OPS-13)




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                           Page 78
ID        What to do                                   Where                                 Evidence that closes it                    Clo
                                                                                                                                        ses
OWN-2     Run the 10–20 device matrix (OPS-11)         Real phones, store-installed builds   Filled DEVICE_MATRIX.md table per          R0
1         including a 2 GB Android Go: cold and                                              build                                      3,
          warm start ×50, 2-hour memory,                                                                                                R0
          20-minute thermal, interruptions,                                                                                             8,
          battery per hour, 3G/high latency,                                                                                            GL
          renderer kill (OPS-03)                                                                                                        OB
                                                                                                                                        AL-
                                                                                                                                        001
                                                                                                                                        (de
                                                                                                                                        vic
                                                                                                                                        ep
                                                                                                                                        art)
OWN-2     Signed-build store tests: purchase,       TestFlight, Play internal track          TESTING.md "Native checks" log with        GL
2         repeat consumable, cancel, slow card                                               date, build and phone                      OB
          approve and decline, kill after paying,                                                                                       AL-
          restore, refund and reversal, Ask to Buy,                                                                                     001
          Sign in with Apple and Game Center,                                                                                           ,G
          push and quiet hours, Android Back,                                                                                           LO
          updates over the previous build                                                                                               BAL
                                                                                                                                        -00
                                                                                                                                        7,
                                                                                                                                        GL
                                                                                                                                        OB
                                                                                                                                        AL-
                                                                                                                                        008
                                                                                                                                        ,R
                                                                                                                                        08
OWN-2     Closed testing: TestFlight external          Both consoles                         Play shows 14 days ≥12; production         GL
3         group; Play closed track ≥12 testers                                               access granted                             OB
          opted in for 14 consecutive days                                                                                              AL-
                                                                                                                                        017
OWN-2     Silent first-time playtest (5+ new           In person or remote                   Notes in PLAYTEST.md with stall points     (pla
4         players, no help, recorded)                                                                                                   yte
                                                                                                                                        st g
                                                                                                                                        ap,
                                                                                                                                        OWN
                                                                                                                                        ER_
                                                                                                                                        CHE
                                                                                                                                        CKL
                                                                                                                                        IST
                                                                                                                                        §5)
OWN-2     Soft-launch market plan with kill criteria   SOFT_LAUNCH.md (OPS-11), store        Plan signed off before any paid installs   GL
5         (D1, D7, tutorial, crash-free and ANR        territories                                                                      OB
          read from the store consoles; funnel                                                                                          AL-
          from /admin/stats); decision owner                                                                                            006
          named                                                                                                                         (m
                                                                                                                                        ark
                                                                                                                                        ets)
OWN-2     Native-speaker review of the 49              Reviewers                             Reviews recorded in                        R0
6         machine-translated languages, the chat                                             docs/localization/WORD_LISTS.md            5,
          word lists and the 49 store listings                                               and per-language notes                     R0
                                                                                                                                        6
OWN-2     Store screenshots from a                     Devices or npm run                    Screenshots uploaded; each matches         (list
7         store-configured build (not the sandbox:     store:screenshots, then retake the    current UI                                 ing
          no sandbox note, no "(test)" prices) at      Store shot                                                                       acc
          every required size; feature graphic                                                                                          ura
                                                                                                                                        cy,
                                                                                                                                        GL
                                                                                                                                        OB
                                                                                                                                        AL-
                                                                                                                                        020
                                                                                                                                        foll
                                                                                                                                        ow-
                                                                                                                                        up)




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 79
ID        What to do                                 Where                         Evidence that closes it               Clo
                                                                                                                         ses
OWN-2     Select territories (exclude mainland       Both consoles                 Territory list saved                  GL
8         China, Vietnam, Indonesia before PSE,                                                                          OB
          sanctioned markets)                                                                                            AL-
                                                                                                                         006
                                                                                                                         (m
                                                                                                                         ark
                                                                                                                         ets)
OWN-2     Set VITE_PUBLIC_URL and the App Links GitHub vars, domain,               Friend link opens the app on both     R0
9         / Universal Links domain files;       AndroidManifest.xml,               platforms                             9
          uncomment the manifest filter and     App.entitlements
          entitlement
OWN-3     Backups to an owned bucket (PITR or        Host, tools/ops/restore.mjs   Drill date and duration recorded      OWN
0         WAL) plus one real restore drill                                                                               ER_
                                                                                                                         CHE
                                                                                                                         CKL
                                                                                                                         IST
                                                                                                                         §4
OWN-3     Rehearse a hotfix and a rollback on        Staging, both consoles        Times recorded in RELEASE.md          (rol
1         staging (OPS-05, OPS-13): web rollback,                                                                        lba
          server image rollback, an                                                                                      ck
          expedited-review patch path                                                                                    gap
                                                                                                                         )
OWN-3     Tag every store release v<version> and git                               git tag lists the release; the        (R-
2         update                                                                   previous-client contract runs         2 fo
          tools/release/last-release.json                                                                                llo
          (OPS-01)                                                                                                       w-u
                                                                                                                         p)
OWN-3     Define the offline promise and test long   Design decision, devices      Decision in docs/DECISIONS.md;        R0
3         outages after first connection (raid                                     outage test log                       1,
          rewards past ticket expiry)                                                                                    R0
                                                                                                                         2
OWN-3     Turn off the old Toadstool Kingdoms        GitHub Pages                  Old URL returns 404                   OWN
4         Pages site on the same origin                                                                                  ER_
                                                                                                                         CHE
                                                                                                                         CKL
                                                                                                                         IST
                                                                                                                         §4
OWN-3     Every year: check Play target API and      Calendar                      Calendar entries exist                GL
5         Billing deadlines, Apple minimum SDK;                                                                          OB
          rotate keys; renew Apple membership                                                                            AL-
                                                                                                                         001
                                                                                                                         (on
                                                                                                                         goi
                                                                                                                         ng)




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                          Page 80
 Appendix A: verdict tables by lane
 One row per checklist line the auditor judged: PASS, PARTIAL, FAIL, NEEDS-DEVICE, NEEDS-PLAYERS or OWNER.


 A.ECO: Economy, monetization and real-money integrity
Item                                                      Verdict               One-line evidence
Buy guard against double tap / second purchase while      FAIL                  economyUi.ts:133-138 buyButton is never disabled
one is in flight (earlier E-1, client)                                          after a click, and buy() (:179-224) has no in-flight flag.
                                                                                The Store modal stays live during await
                                                                                this.c.purchase() (:219). controller.purchase
                                                                                (controller.ts:329-360) is not single-flight.
Server intent rule for one-time products (earlier E-1,    FAIL                  purchases.ts:155-165 checks canPurchase on the
server)                                                                         village state, which ignores open intents: two Scroll
                                                                                intents both pass. At redeem, :338 accepts each against
                                                                                its own intent. grantPurchase(verified)
                                                                                (village.ts:1221-1241) re-grants a Scroll the village
                                                                                already holds, so the player pays twice for one Scroll.
Interrupted payment (killed between store success and     PASS (code) /         Apple: not finished until delivered
redeem)                                                   NEEDS-DEVICE          (TkStorePlugin.swift:75); unfinished and
                                                                                Transaction.updates (:110-134); start retry in
                                                                                main.ts:337-358. Google: acknowledge-only for device
                                                                                villages (purchases.ts:229), queryPurchasesAsync
                                                                                (TkBillingPlugin.java:279-297).
Offline purchase                                          PASS                  connection.ts:269-271: with a checking server, an
                                                                                intent needs a connection ("Connect to the internet to
                                                                                buy"), so nothing is charged offline. A retryable redeem
                                                                                failure becomes PENDING (controller.ts:382-383).
Pending (Ask to Buy, slow card)                           PASS (code) /         releaseIntent pending → 7-day hold
                                                          NEEDS-DEVICE          (purchases.ts:40,179-191). Google PENDING is
                                                                                refused and arrives later via listener
                                                                                (TkBillingPlugin.java:260-268), and the server
                                                                                refuses purchaseState 2 (google.ts:130). Device
                                                                                check listed in docs/store/TESTING.md:24-28, not run.
Family Sharing                                            PASS (N/A)            Every product is a consumable in both stores
                                                                                (docs/SHIPPING.md:164-184), and consumables are not
                                                                                family-shared.
Restore purchases                                         PASS                  controller.ts:446-459 (unfinished plus this season's
                                                                                Scroll from server history); button disabled while running
                                                                                (economyUi.ts:291-306).
Apple JWS chain                                           PASS (hardened) /     Pinned root, extension OIDs, checkIssued, P-256 leaf,
                                                          LOW gap               bundle and environment (apple.ts:123-161).
                                                                                Certificates are checked against server now, not the JWS
                                                                                signedDate (:144-146): see ECO-09. No OCSP (recorded
                                                                                in P3).
Google Play API check                                     PASS                  Product match, purchaseState 0 only, test purchases
                                                                                refused on production (google.ts:120-145); RTDN OIDC
                                                                                email check (:190-213); hourly voided poll
                                                                                (purchases.ts:517-522).
Replay protection                                         PARTIAL               Rows are unique per (store, transactionId), and
                                                                                another player gets 409
                                                                                (purchases.ts:275-279,360-363). But a replayed
                                                                                receipt of a purchase delivered on the device is delivered
                                                                                again into a later server village (:286-299): ECO-02.
Refund / revocation / debt                                PASS                  revoke (purchases.ts:384-404), refund notice before
                                                                                redeem (:271-274), revokePurchase turns spent value
                                                                                into debt (village.ts ~1256+), settleRefunds for
                                                                                device villages (controller.ts:469-487), refund pause
                                                                                after 3 refunds in 90 days per linked devices
                                                                                (purchases.ts:42-43,135-139).
Idempotent grants / reward-button spam                    PASS                  grantPurchase refuses a repeated id
                                                                                (village.ts:1222). Claims are state-checked and
                                                                                synchronous: claimStipend returns null when not
                                                                                claimable (stipend.ts:59-61). Concurrent redeems are
                                                                                serialised by lockPurchases, and the client re-checks
                                                                                state.purchases before dispatching
                                                                                (controller.ts:389).



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 81
Item                                                      Verdict               One-line evidence
Android plugin concurrent purchase                        PARTIAL (inferred)    pendingPurchase is tested at
                                                                                TkBillingPlugin.java:205 but set later on the UI
                                                                                thread (:223). Two quick calls can both pass, and the
                                                                                first PluginCall is then overwritten and never
                                                                                answered. Folded into ECO-01.
Ads                                                       PASS (N/A, no ad      package.json:62-75 lists no ad SDK. grep -i
                                                          SDK)                  admob/applovin/rewardedAd/interstitial over
                                                                                src/, server/ and the Android/iOS build files finds
                                                                                nothing.
Jade lifetime supply vs sink model                        FAIL (unmodelled)     tools/balance/playerModel.ts:179 spends Jade only
                                                                                on huts. The campaign keeps no Jade ledger. The only
                                                                                free-Jade figure is a 30-day audit scratch measurement
                                                                                (understand-2026-11-16/economy.md:14-34,
                                                                                scripts/economy/econ2.cjs). ECO-03.
Resource sinks/faucets (Coins/Provisions)                 PARTIAL               From Keep 8, resources pile up while builders are the
                                                                                limit, and there is no late Coin sink (economy.md:72-78,
                                                                                ECO-11 "CU-1 open"). Folded into ECO-03.
Local-currency pricing (GLOBAL-007)                       PASS (code) /         Store prices only (economyUi.ts:120-131): "…" while
                                                          NEEDS-DEVICE          loading, "Price unavailable" and buy disabled when the
                                                                                store fails, "Not sold here" when a product is missing. The
                                                                                confirm uses the store label (:212-213). Real storefronts
                                                                                unverified (GLOBAL-007 open).
Under-18 cap counted in local money                       PARTIAL / OWNER       countedCents (purchases.ts:117-121) uses
                                                                                USD_RATES, but the default is {USD:1} (context.ts:56),
                                                                                and Google reports no price (purchases.ts:227-228),
                                                                                so most purchases count catalog USD. ECO-06.
Optimal farming (≥3× activity)                            PARTIAL (not          No activity ≥3× was found in the existing measurements:
                                                          re-measured)          a raid nets 0.4-1.7 h of production (economy.md:79-81).
                                                                                Late raiding is economically negligible, and casual
                                                                                players lose 96-160 % of their loot to raids
                                                                                (CAMPAIGN.md:59,128,151). ECO-04.
Arbitrage loops                                           PASS                  Top-up during debt and top-up priced in the paying
                                                                                currency are fixed (village.ts:1100,1121). Cancel,
                                                                                dismiss, Scroll-late and stipend loops are closed
                                                                                (economy.md:99-110). Jade → training skip → raid is
                                                                                priced by trainingSkipScaleByHall (about 1.2-1.5×
                                                                                the top-up rate at Keep 15, inferred from
                                                                                economy.md:92-94): not ≥3×.
Duplication / rollback detection                          PASS (server)         Unique purchase rows, economyHash replay, import
                                                                                provenance holds unconfirmed Jade and Scroll
                                                                                (villageImport.ts:129-170). Device-held villages are
                                                                                trusted-local by design.
Sybil (daily rewards, sandbox credit P4)                  PARTIAL / OWNER       Rewards are per village and cannot move between
                                                                                accounts except through raids (capped, exploit #7),
                                                                                donations, alt Gang chests (3-15 Jade, open limit #10)
                                                                                and referrals (Keep + 14 days + device check, L2). The
                                                                                sandbox daily cap is off by default (context.ts:55,
                                                                                config.ts:249): ECO-07.
Pay-to-win boundary                                       PASS                  No combat stat is sold. Jade buys time and top-ups. The
                                                                                Scroll's 20 % speed is time. $100 = 73 builder-days
                                                                                (economy.md:118-126).
Keep rushing (E06)                                        PARTIAL (design)      Warning on the Keep sheet only (hud.ts:1698), and only
                                                                                when more than one Keep behind
                                                                                (objective.ts:106-108). Nothing in the Jade spend
                                                                                confirm. ECO-08.
Variable reward schedules                                 PASS                  The daily chest is free, its exact odds are shown before
                                                                                opening (dailyUi.ts:152-166), and it is never sold
                                                                                (docs/DECISIONS.md:62). The loss-triggered
                                                                                rebuild_pack is retired: true (offers.json).
Goodhart                                                  PARTIAL (design)      Daily login rewards never punish a missed day (good),
                                                                                but late raiding pays about 5 % of passive income (earlier
                                                                                audit) and casual defense loses net value, so the game
                                                                                rewards logging in over playing. ECO-04 / S3.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 82
Item                                                        Verdict             One-line evidence
Minors: cap, offers, age gate                               PASS (code) /       Locked cap with open intents (purchases.ts:142-151),
                                                            OWNER (legal)       cap held at redeem (:254-262,330-334), offers only for
                                                                                stated adults (offers.ts:15-17,40), age asked before
                                                                                the first buy (economyUi.ts:144-150), grown-up second
                                                                                confirm (:216-218), under-18 sticky
                                                                                (purchases.ts:73-81). Under-13 bands can buy within
                                                                                the $50 cap: a legal question (GLOBAL-006).
Refund abuse                                                PASS                Pause after 3 refunds in 90 days across linked devices
                                                                                and installs (purchases.ts:92-110,129-139), debt
                                                                                (village.ts revokePurchase).
Loot boxes / odds                                           PASS                Nothing random is sold: product grants are fixed
                                                                                (productGrantsFor, village.ts:1229) and the chest is
                                                                                free.
Subscriptions (Clan Stipend)                                PASS                A consumable, not a subscription (stipend.ts:1-9). The
                                                                                confirm says "daily payments … claimed one a day" plus
                                                                                its own withdrawal text (economyUi.ts:196-209).
                                                                                Nothing renews, so no cancellation is needed.
Price clarity                                               PASS (code)         Real prices only in the Store and its confirm; offer popups
                                                                                show contents and link to the Store with no price
                                                                                (economyUi.ts:485-499); in-village Jade confirm has no
                                                                                money figure (:235-246).
Store price request includes retired product                FAIL (low)          loadPrices asks for offer_rebuild (retired, not in
                                                                                storeProductIds), so pricesComplete never becomes
                                                                                true and prices are re-asked on every Store open
                                                                                (economyUi.ts:99-108). ECO-10.



 A.SEC: Security, cheating and server readiness
Item                                                    Verdict                     One-line evidence
Device-held village trust (memory editor / save edit)   FAIL                        checkArmy is a legality check only
→ leaderboards, PvP, wars                                                           (server/core/pvp.ts:200-248). uploadBase
                                                                                    takes any legal base at any Keep, with no
                                                                                    account-age or Keep-jump check
                                                                                    (pvp.ts:267-287). requireArmyOnServer returns
                                                                                    early for a device village (pvp.ts:479). No
                                                                                    REQUIRE_SERVER_VILLAGE exists.
Leaderboards server-computed                            PARTIAL                     Honor and Power are computed on the server from
                                                                                    re-simulated battles (pvp.ts:756, 876-891), but
                                                                                    from inputs a device village picks: Keep, army and
                                                                                    levels at that Keep's cap, unlimited troops.
Retroactive cheater removal (staff)                     PARTIAL                     ban drops the player from the board
                                                                                    (server/core/admin.ts:156-171) and
                                                                                    resetRating exists (173-185). There is no honor
                                                                                    reset, no undoing of honor the cheater's raids gave
                                                                                    or took, no session revocation and no
                                                                                    suspicious-player list
                                                                                    (server/routes/staff.ts:17-38).
Replay / tamper (nonces, seq, idempotency, old          PASS                        Tickets are used once and keep their answer
reports)                                                                            (pvp.ts:452-468). A repeated seq is refused (C1).
                                                                                    Idempotency-Key carries a fingerprint
                                                                                    (docs/PROTOCOL.md "Idempotency"). Seeds are
                                                                                    issued by the server (battleSeed,
                                                                                    pvp.ts:686-693). Bearer token over TLS; no
                                                                                    request signing needed.
Late reports / tool-assisted battles (earlier G-1)      FAIL                        A started raid can be reported up to TICKET_TTL_MS
                                                                                    + LATE_REPORT_MS = 73 h after scouting
                                                                                    (pvp.ts:41,52,466), and the seed is known from
                                                                                    Attack. It is forfeited early only if the attacker calls
                                                                                    match again (pvp.ts:338). Report latency is neither
                                                                                    measured nor capped.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 83
Item                                                 Verdict                    One-line evidence
Secrets in client bundle                             PASS                       Only public values: VITE_SENTRY_DSN (public by
                                                                                design), VITE_GOOGLE_CLIENT_ID,
                                                                                VITE_APPLE_SERVICES_ID,
                                                                                VITE_BALANCE_PUBLIC_KEY
                                                                                (.github/workflows/deploy.yml:47-59). A grep
                                                                                of src/ public/ android/ ios/
                                                                                capacitor.config.ts index.html found no
                                                                                private key, token or API secret. No
                                                                                google-services.json, keystore or .env is
                                                                                tracked.
Client obfuscation                                   PASS (by design)           Vite's default production minify. No sourcemap in
                                                                                vite.config.ts:161-173. window.tk appears
                                                                                only under ?debug (src/main.ts:737). The server
                                                                                is the authority, so obfuscation adds nothing.
Value paths still trusted from the client            FAIL                       For device villages: army, levels, Keep, base and
                                                                                loot holders (all bounded only by legality). Gang
                                                                                War, Alliance War and Grove Raid scores from
                                                                                device attackers pay chests into teammates'
                                                                                server-held villages
                                                                                (server/core/gangWars.ts:409-431). Raids by
                                                                                device attackers take real loot from server-held
                                                                                defenders (pvp.ts:788). Device-held donor →
                                                                                device receiver is trusted. Command times within 12
                                                                                h (X1).
Rate limiting (account, IP, device; Redis down)      PASS / note                Per player 240/min, per IP 3,000/min, plus route
                                                                                rules (server/rateLimit.ts:74-98). Redis down
                                                                                falls back to per-instance memory counters divided
                                                                                by RATE_LIMIT_INSTANCES
                                                                                (server/shared.ts:283-319): degraded, not fully
                                                                                open. There is no per-device rule because device ids
                                                                                are chosen by the client. Registration is keyed by
                                                                                IPv6 /64 only (SEC-15).
Metrics label allowlist (earlier S-2)                FAIL                       tk_client_requests_total{build} takes any
                                                                                40-character X-Client-Build header, on every
                                                                                path including /healthz, before the rate-limit hook
                                                                                (server/app.ts:266-267 vs 318-327).
                                                                                PromMetrics keeps every series for ever
                                                                                (server/observability.ts:69-93).
Privacy minimisation                                 PASS                       Statistics have no player id or IP (migration 0027).
                                                                                Crash reports are opt-in. Server Sentry sends no
                                                                                request body (observability.ts:147-171).
Deletion clears every player-owned table             PARTIAL                    deletePlayer
                                                                                (server/stores/pg/players.ts:172-276) covers
                                                                                40 tables. player_notices, deletion_codes and
                                                                                village_parts go by ON DELETE CASCADE. Not
                                                                                cleared: squad_war_attacks.attacker_id,
                                                                                squad_war_relays.last_by/holder, and the
                                                                                player's name inside stored bases (base_versions)
                                                                                that other players' tickets reference, until retention
                                                                                (SEC-14).
Load test and 10× target                             PARTIAL                    server/load.ts:14-17 defines 5× peak (~14
                                                                                battles/s) and tests battles only. There is no 10×
                                                                                target, and no command-batch or hello/sync traffic.
                                                                                Measured 3 battles/s per instance before workers
                                                                                (docs/backend/PVP_ROADMAP.md:327) and 7.96/s
                                                                                with 3 workers (:342).
Autoscaling and spend alerts                         OWNER                      Nothing in ops/ (only prometheus/alerts.yml,
                                                                                grafana/game-versions.json). No cost or billing
                                                                                alert. No instance-count policy beyond "run at least
                                                                                two" (docs/SHIPPING.md 3h).
Backups and restore drill                            PASS (soft launch) /       Daily encrypted dump, plus a Sunday restore drill
                                                     OWNER (scale)              that starts the server on the restore
                                                                                (.github/workflows/backup.yml:17,76-84). PITR
                                                                                / WAL archiving is an owner step
                                                                                (docs/SHIPPING.md 3h "Size").
Graceful shutdown                                    PASS                       server/shutdown.ts:1-30: drain /readyz, close
                                                                                HTTP, workers, Redis and pool, with a hard deadline.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                  Page 84
Item                                                  Verdict                     One-line evidence
Migrations backward-compatible                        PASS (policy)               Numbered and never edited. The rule is in
                                                                                  src/backend/CLAUDE.md, and contract tests run
                                                                                  against the previous release's client
                                                                                  (server.yml:142). No mechanical check that a
                                                                                  migration is additive.
Observability and alerts                              PARTIAL                     13 alerts (ops/prometheus/alerts.yml). None on
                                                                                  tk_resim_busy_total (503 busy), series count or
                                                                                  memory, forfeits or late reports, or honor-gain
                                                                                  anomalies.
Deployment safety (staged, rollback)                  PARTIAL                     Staging gets automatic deploys and contract tests,
                                                                                  then production by hand behind required reviewers
                                                                                  (.github/workflows/server.yml:148-173).
                                                                                  There is no documented one-command rollback and
                                                                                  no canary.
Time source                                           PASS                        Server clock (Date.now, ctx.now). Command times
                                                                                  are clamped to [max(row.at, now-12h), now+2
                                                                                  min] (server/core/village.ts:45,
                                                                                  docs/PROTOCOL.md "Time"). Host NTP is an owner
                                                                                  step.
TLS                                                   PASS                        HSTS over HTTPS (app.ts:249-250). Production
                                                                                  refuses unverified Postgres TLS
                                                                                  (server/config.ts:171-180).
Certificate pinning                                   DOCS (decide)               No pinning, and no recorded decision (grep of
                                                                                  docs/DECISIONS.md, SHIPPING.md, PROTOCOL.md).
CSP on web (F2)                                       FAIL (open)                 index.html has no CSP meta and two inline scripts
                                                                                  (index.html:13,63). Only the server pages have
                                                                                  CSPs (server/adminPage.ts:12,
                                                                                  accountPage.ts:73, complaintPage.ts:64).
Server address field in store builds (earlier R-1)    FAIL                        Settings → Advanced → Server address is offered in
                                                                                  every build
                                                                                  (src/presentation/ui/settingsUi.ts:184,
                                                                                  hud.ts:1037-1055). A chosen URL overrides
                                                                                  VITE_SERVER_URL
                                                                                  (src/backend/net/connection.ts:122-126).
Account takeover: login, token storage (F3),          PARTIAL                     Sign-in tokens are checked (2026-11-20 audit).
revocation, audit                                                                 revoke-others, rotate and unlink exist. Open: iOS
                                                                                  token in backups (F3: no Keychain;
                                                                                  ios/App/App/*.swift has no Keychain code),
                                                                                  SIGNIN_NONCE_REQUIRED off by default
                                                                                  (server/core/context.ts:51), no new-device
                                                                                  notice (links.ts:265-275), no staff session view or
                                                                                  revoke, staff reads not logged.
Moderation: report, block, staff, names (S5)          PARTIAL                     Report, block, mutes, complaints and renames are
                                                                                  in place. S5's open part is confirmed: nameKey =
                                                                                  lower + NFC + separators
                                                                                  (src/backend/net/names.ts:45-47), no
                                                                                  confusable skeleton.
L1 (caps outside a transaction)                       FAIL (open)                 friends.ts:202-204 (counted before
                                                                                  transaction), squads.ts:121, groves.ts:95.
P4 (sandbox credit cap off)                           OWNER/CODE (open)           DEFAULT_POLICY.sandboxDailyCapUsd: null
                                                                                  (context.ts:55). checkConfig neither warns nor
                                                                                  refuses (config.ts:160-205).
X1 (12 h backdate on time-window claims)              FAIL (open, design)         MAX_BACKDATE_MS = 12 h (village.ts:45).
                                                                                  Earliest time = max(row.at, now-12h) only.
"Honor never decreases on a lost defense"             Confirmed (design)          ranks.json:169 defenseHonorLossShare: 0.
                                                                                  Honor is not zero-sum, so a raid volume no troops
                                                                                  limit (device villages) inflates the board without
                                                                                  bound. Feeds SEC-01.
"Smurfing / 3 AM queues: generated rivals labelled"   PASS (honesty) /          matchAnswer labels kind: 'bot' when
                                                      NEEDS-DEVICE (population) defenderId is null (pvp.ts:442). Not measured
                                                                                with a real population.



 A.SAV: Save data, progression and client networking



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                  Page 85
Item                                                 Verdict                Evidence (file:line, read)
Atomic save write                                    PASS                   One IndexedDB readwrite transaction does the revision
                                                                            check and the put together:
                                                                            src/backend/persist/saveStore.ts:116-140
Rolling backups of the last good saves + automatic   FAIL                   Only one village key. Backups exist only for damaged
fallback                                                                    saves, adopted villages and restores (saveStore.ts:44-52,
                                                                            controller.ts:129,232,634). There is no "last good" copy,
                                                                            and a load that fails falls to a new village
                                                                            (controller.ts:131-135)
Schema validation on load                            PASS                   deserialize → migrate + validateVillage
                                                                            (src/gameplay/sim/save.ts:250-260,321-428,430-435)
Checksum / tamper vs corruption                      PARTIAL                No checksum on the stored save. Export codes carry only
                                                                            FNV-1a (save.ts:445-470). Device villages are trusted-local
                                                                            by design; the server re-checks imports
Load repair vs replace                               PARTIAL                Repairs exist for stats, training queue and tempers only
                                                                            (save.ts:262-307). Any other bad field (one NaN resource,
                                                                            an unknown building type, a research level over the cap) fails
                                                                            the load and the village is replaced
                                                                            (controller.ts:122-135). The damaged copy is not offered
                                                                            if it still fails (controller.ts:611-626)
Damaged save kept and offered back                   PARTIAL                backupDamaged(raw).catch(() => undefined) and then a
                                                                            new village is saved over the old one
                                                                            (controller.ts:129-134). If the backup write fails (storage
                                                                            full), the damaged save is lost
Newer save stops the boot                            PASS                   migrate throws NewerSaveError (save.ts:56);
                                                                            controller.ts:127 rethrows it; main.ts:1076-1117 shows
                                                                            Update + "Copy save code"; tested in
                                                                            tests/backend/persist/saveStore.test.ts:77
Kill during write                                    PASS (code) /          An IDB transaction commits whole or not at all. Durability
                                                     NEEDS-DEVICE           under power loss or OS kill is not verified
Save on lifecycle events                             PASS                   visibilitychange hidden/visible, pagehide and Capacitor
                                                                            pause → controller.save() + connection.flush()
                                                                            (src/main.ts:886-933)
Write frequency / dirty check                        PARTIAL                The 15 s autosave skips an unchanged village
                                                                            (main.ts:869-880). But every successful command and
                                                                            every finished timer writes the whole village immediately
                                                                            (controller.ts:189,511), without coalescing
                                                                            (controller.ts:660-690)
SAVE_VERSION migrations: fixture library             PARTIAL                migration-full.test.ts uses one synthetic v1 save plus a
                                                                            v14→v15 case. Inline saves exist for some versions (grep:
                                                                            v1,2,3,7,8,10,12,16-19,21,22); none for
                                                                            v4,5,6,9,11,13,14,15,20,23,24. No real exported saves are
                                                                            kept as fixtures under tests/
Default-safe new fields                              PASS                   Each step uses ?? default; repairStats fills STAT_KEYS on
                                                                            every load (save.ts:262-273)
Version-bump guards (R-2)                            PARTIAL                SIM_RULES: data fingerprint test (tests/gameplay/battle/r
                                                                            ules-version.test.ts:35-38). SAVE_VERSION: only
                                                                            toBe(24) pins, no state-shape fingerprint.
                                                                            PROTOCOL_VERSION: no fingerprint;
                                                                            tools/release/previous-client-contract.mjs:17-23
                                                                            does nothing because git tag lists no v* tag
Two tabs / one writer per village                    PASS                   SaveConflictError + takenOver (saveStore.ts:8-22,
                                                                            controller.ts:661,676); tests saveStore.test.ts:22-65
Two devices offline then sync                        PASS (code) /          Commands numbered per device, server keeps device_seqs,
                                                     NEEDS-DEVICE           refusals listed (villageSync.ts:1-27,272-301;
                                                                            server/core/village.ts:198-208)
Server-held vs device-held village                   PASS (design)          Server corrections win (villageSync.ts:253-258).
                                                                            Device-held villages are trusted-local, as documented
IDB open failure / memory fallback                   FAIL                   The game starts a fresh village on the memory store and still
                                                                            goes online with keepVillageOnServer: true
                                                                            (main.ts:171-185,288). The warning waits until the tutorial
                                                                            ends (main.ts:777-778). See SAV-01
Sign-out risk to local data                          FAIL (partial)         signOutDevice swallows a failed flush and then drops the
                                                                            queue, the outbox and pending raids
                                                                            (connection.ts:863,892-905). See SAV-04




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 86
Item                                                 Verdict                Evidence (file:line, read)
Reinstall-and-restore                                OWNER /                A linked sign-in adopts the server village
                                                     NEEDS-DEVICE           (villageSync.ts:241-247). Without a link, a reinstall loses
                                                                            the token. Linking is offered only in Settings
                                                                            (hud.ts:1185-1198); no prompt (inferred from grep)
iOS Safari 7-day eviction / Home Screen (F6)         PARTIAL /              storageKept() + a weekly banner + Settings advice
                                                     NEEDS-DEVICE           (main.ts:187-200,779-790); a Home Screen hint
                                                                            (main.ts:791-800). Eviction itself is not verified on a device
Android backup                                       PASS (design)          localStorage (token, queue) is excluded; the IDB save is
                                                                            backed up (android/app/src/main/res/xml/data_extrac
                                                                            tion_rules.xml, backup_rules.xml)
Clock: server-held villages                          PASS                   Command time is clamped to [max(row.at, now−12h),
                                                                            now+2min]; timer commands to now−10min
                                                                            (server/core/village.ts:37,45,51,235;
                                                                            villageReplay.ts:94-95)
Clock: device-held villages                          OWNER                  SystemClock (sim/clock.ts:10-14); trusted-local by design
                                                                            (closure #4 limit); import has an age cooldown (audit A2/E11)
MAX_BACKDATE_MS window X1                            OWNER (design)         Still open: server/core/village.ts:45. See SAV-12
Time sync with server                                PARTIAL                HelloResponse.serverTime is sent (protocol.ts:268,
                                                                            server/core/identity.ts:25) but never read by the
                                                                            client (grep). Alliance War phase uses the device clock
                                                                            (controller.ts:241)
NaN / Infinity / overflow                            PASS                   Number.isFinite on resources, seeds, trophies and timers
                                                                            (save.ts:324-372); the server checks
                                                                            Number.isFinite(c.t) (village.ts:187). The security
                                                                            audit's 23,156 hostile variants produced no non-finite value
                                                                            (closure record)
Tutorial skip / quit / replay                        PASS                   Step index saved, completion read from state, Skip with
                                                                            confirm, replay from Settings (ui/tutorial.ts:42,149-199,
                                                                            settingsUi.ts:117). The raid step cannot be done offline on
                                                                            a server-held village (app.ts:76-83), but Skip exists, so it is
                                                                            not a soft-lock
Idempotent grants                                    PASS                   Purchases keyed <store>:<transactionId> and checked
                                                                            before a grant (controller.ts:350-357,383). Chests
                                                                            deduped by state.net (connection.ts:1290-1320);
                                                                            command seq unique per batch (village.ts:191)
Idempotency-Key semantics                            PARTIAL                A new key per HTTP attempt (httpAdapter.ts:244), so a
                                                                            client retry is never deduped by key. See SAV-10
Storage full during save                             PARTIAL                IDB failure → onSaveError → toast at most once a minute
                                                                            (main.ts:937-962). The queue sets storageProblem
                                                                            (villageSync.ts:155-171). Gap: a damaged save plus a
                                                                            failed backup, see SAV-02
Airplane mode mid-session                            PASS (code) /          offline event → status (connection.ts:1008-1012); raids
                                                     NEEDS-DEVICE           refused on a server-held village with a message
                                                                            (app.ts:76-83); the outbox and queue are stored
Requests in flight during purchase                   PASS                   Intent fails → nothing charged; redeem fails → PENDING, the
                                                                            store transaction stays unfinished, retried 15 s→15 min
                                                                            (controller.ts:331-344,377-385, main.ts:344-356)
Battle report in flight                              PARTIAL                Outbox + requeue from the battle log
                                                                            (connection.ts:1386-1430). Gap: scouting forfeits an
                                                                            unsent raid, see SAV-05
Bounded timeouts                                     PARTIAL                15 s for the whole exchange
                                                                            (httpAdapter.ts:183,214-229). The same value applies to
                                                                            every body size; uploads are uncompressed. See SAV-06
Exponential backoff with jitter                      PARTIAL                Alliance polling: exponential with jitter
                                                                            (groveSource.ts:386-389). Connection: doubling with no
                                                                            jitter, and a 60 s interval plus a 15 s flush ignore it
                                                                            (connection.ts:998-1003,1166-1171). See SAV-07
Circuit breaker / retry storm                        FAIL                   No breaker; every client retries at least once a minute and
                                                                            reconnects with a full sync within about 60 s of recovery
                                                                            (inferred load). See SAV-07
Server down: degradation                             PASS                   Boot does not wait on the network (main.ts:687,
                                                                            connection.ts:997); "No connection" pill + "Connect now"
                                                                            (hud.ts:817,952-958)
High latency / packet loss                           NEEDS-DEVICE           Code reasoning in SAV-06



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 87
Item                                                   Verdict                Evidence (file:line, read)
PROTOCOL_VERSION / forced update                       PASS                   426 version_mismatch (server/app.ts:254-264,
                                                                              MIN_PROTOCOL 7 at identity.ts:20) → incompatible →
                                                                              "Update Kagemura" (connection.ts:1137-1140,
                                                                              hud.ts:893,930); tested
                                                                              (tests/backend/net/connection.test.ts:100,
                                                                              villageSync.test.ts:62)
Alliance polling (R04)                                 PASS (code) /          4 s / 20 s only while the screen is visible; paused when
                                                       NEEDS-DEVICE           hidden; backoff to 60 s with jitter; no overlapping polls
                                                                              (groveSource.ts:250-430). The Connection intervals do
                                                                              not pause when hidden (SAV-07)
Long outage loses raid rewards (R02)                   PARTIAL                LATE_REPORT_MS 72 h for pvp only
                                                                              (server/core/pvp.ts:52,466); later reports become
                                                                              practice with no message (P7-17 not taken). See SAV-11



 A.STB: Crashes, stability, memory, lifecycle and performance
#    Checklist item                                           Verdict             One-line evidence
1    Crash-free rate can be measured                          FAIL                The reporter only sends error events
                                                                                  (src/backend/analytics/crashReports.ts:46-56). It
                                                                                  sends no session or release-health envelope, so there is
                                                                                  no denominator. It is opt-in and off by default
                                                                                  (src/backend/platform/prefs.ts:10), and nothing
                                                                                  detects an unclean exit.
2    Crash reporting wired in release and native builds       PASS (opt-in)       VITE_SENTRY_DSN is set in
                                                                                  .github/workflows/deploy.yml:55,
                                                                                  android.yml:57,138 and ios-testflight.yml:56. It
                                                                                  is installed first thing in boot() (src/main.ts:235-242).
                                                                                  Never in the sandbox, never for under-13
                                                                                  (crashReports.ts:27-29).
3    Source maps / symbols uploaded (O-1)                     FAIL                vite.config.ts:162-175 has no build.sourcemap. My
                                                                                  build made 0 .map files (find dist -name '*.map'
                                                                                  gives 0). No workflow uploads anything (grep sourcemap
                                                                                  in .github/ gives no hits). Every build reports release:
                                                                                  kagemura@0.1.0 (main.ts:237, package.json:4).
4    Android WebView renderer crash path (O-2)                FAIL                MainActivity.java registers no WebViewListener.
                                                                                  Capacitor's
                                                                                  BridgeWebViewClient.onRenderProcessGone returns
                                                                                  false unless a listener says otherwise (node_modules/@
                                                                                  capacitor/android/.../BridgeWebViewClient.java
                                                                                  :92-104), so Android kills the app. iOS reloads silently
                                                                                  (.../WebViewDelegationHandler.swift:164-168).
                                                                                  Neither is recorded anywhere.
5    Global error handlers with context                       PARTIAL             error and unhandledrejection listeners exist only
                                                                                  when a DSN is built in (crashReports.ts:61-68). Tags
                                                                                  are only side, device (OS family) and kind
                                                                                  (main.ts:240). There is no build id, scene, battle flag,
                                                                                  quality profile, renderer type or last command. An
                                                                                  exception inside the Phaser frame kills the render loop
                                                                                  for good with no recovery (STB-03).
6    Cold start                                               NEEDS-DEVICE        Boot guard, sliced texture painting and the splash are in
                                                                                  place (main.ts:461-488). The 2026-11-13 record
                                                                                  measured about 29 s to the village on emulated 2G.
                                                                                  Every first visit also parses a 193 KB inline head script
                                                                                  (STB-08).
7    Warm start / resume; pause stops timers, audio,          PARTIAL             Phaser pauses and resumes its loop
     rendering, polling                                                           (phaser/src/core/Game.js:590-633). Audio suspends
                                                                                  on hide (main.ts:907, sound.ts:151-160). Alliance
                                                                                  polling skips while hidden (groveSource.ts:366-417). A
                                                                                  resume syncs after at most 5 s
                                                                                  (connection.ts:1016-1021). But Connection's 60 s,
                                                                                  120 s and 15 s intervals keep running while hidden
                                                                                  (connection.ts:1005-1008). Capacitor pause neither
                                                                                  suspends audio nor schedules reminders
                                                                                  (main.ts:927-931), and nothing listens for
                                                                                  appStateChange (STB-09).




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                        Page 88
#    Checklist item                                        Verdict              One-line evidence
8    Force-quit mid-save                                   PASS                 The revision check and the write share one IndexedDB
                                                                                transaction (saveStore.ts:112-133). Damaged saves
                                                                                are kept, newest 5 (saveStore.ts:138-148).
9    Force-quit mid-purchase                               PASS (code) /        recoverPurchases runs on becoming visible and on
                                                           NEEDS-DEVICE         reconnect (main.ts:413-424). A store transaction is
                                                                                finished only after the save landed (backend brief,
                                                                                awaitingSave). No store sandbox was run.
10   Force-quit mid-battle                                 PASS                 The pending battle is tracked from the first deployment,
                                                                                throttled to 1.5 s (app.ts:542-575). flushBattle runs
                                                                                on hide, pagehide and pause (main.ts:888-890).
11   Autosave on pagehide / visibilitychange / app pause   PASS                 goingAway runs on visibilitychange hidden,
                                                                                pagehide and Capacitor pause (main.ts:888-931). The
                                                                                15 s dirty-check autosave is at main.ts:868-877.
12   Low-memory kills                                      PARTIAL              Android onTrimMemory (MainActivity.java:24-30)
                                                                                and iOS didReceiveMemoryWarning
                                                                                (TkViewController.swift:14-17) send
                                                                                tkmemorywarning, which trims unheld art and
                                                                                thumbnails (main.ts:897-904). The kill itself is
                                                                                unhandled (row 4), and no device has measured it.
13   WebGL context loss / restore                          PARTIAL              Phaser's defaults call preventDefault on loss and
                                                                                rebuild the GL wrappers on restore
                                                                                (WebGLRenderer.js:1021-1111). Released canvases
                                                                                are repainted on RESTORE_WEBGL (assets.ts:186-199).
                                                                                The game itself handles nothing: grep for LOSE_WEBGL /
                                                                                contextlost in src gives 0 hits. There is no message,
                                                                                no timeout or reload when the context never comes
                                                                                back, and nothing is reported (STB-06).
14   Texture LRU / eviction (F1)                           PASS                 render/textureBudget.ts (LRU with holders). The
                                                                                battle holds and releases its textures
                                                                                (BattleScene.ts:242-246). Budgets are 64 MB on high
                                                                                and 24 MB on low (quality.ts:138,152). Known limit:
                                                                                warrior and badge textures are not budgeted
                                                                                (2026-11-13 record).
15   Listeners, timers and tweens outliving scenes; DOM    PASS                 Cleanup on scene shutdown: VillageScene.ts:177,
     HUD listeners                                                              BattleScene.ts:243-261, cameraControl.ts:45,
                                                                                touchInput.ts:29. HUD timers and the key handler are
                                                                                cleared when their modal closes (armyUi.ts:245-249,
                                                                                groveUi.ts:128-133, battleHud.ts:276-277,
                                                                                hud.ts:2613, hud.ts:965-971). VillageScene.ts:141
                                                                                never removes its RESIZE listener, but the village only
                                                                                sleeps and wakes (app.ts:351,537) and is never
                                                                                restarted, so it is harmless today.
16   Thermal / battery: FPS caps, low profile, run-time    PASS (code) /        FPS caps at main.ts:445-447 and
     downgrade                                             NEEDS-DEVICE         frameRate.ts:83-87. The village idles at about 20 FPS
                                                                                and draws at about 10 under a dialog
                                                                                (main.ts:983-1020). A slow battle drops to 30 FPS
                                                                                (frameRate.ts:104-107, quality.ts:270-288). Low
                                                                                has no further step down, and nothing was measured on
                                                                                a phone.
17   Music synthesised while muted (F9)                    PASS                 The scheduler runs only while music is audible
                                                                                (sound.ts:438-446). There is no AudioContext while
                                                                                all sound is off (sound.ts:71-72).
18   Background throttling                                 PARTIAL              Render, audio and Alliance polling stop when hidden.
                                                                                Connection sync, base upload and flush keep firing (row
                                                                                7, STB-09).
19   Null states, divide-by-zero, empty arrays             PASS                 Divisors are guarded: hud.ts:570,1448,1457,1716,
                                                                                armyUi.ts:229,258, battleHud.ts:743,954. The few
                                                                                unguarded widths (economyUi.ts:553,
                                                                                groveUi.ts:273,281) are cosmetic only: CSS ignores
                                                                                NaN% and Infinity%, so nothing throws. I spot-checked
                                                                                empty-list screens, not all of them.
20   Worst-device target (low profile)                     NEEDS-DEVICE         quality.ts:141-153 (low profile) and autoProfile at
                                                                                quality.ts:160-180. No cheap-phone run exists (R03 is
                                                                                open).
21   Frame pacing                                          PASS (code)          Limits are set from the measured refresh rate
                                                                                (frameRate.ts:57-87). Battle steps are capped at 250
                                                                                ms per frame (battleSession.ts:77).



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                     Page 89
#    Checklist item                                        Verdict              One-line evidence
22   Load time to playable                                 NEEDS-DEVICE         Only the emulated figure exists (about 29 s on 2G,
                                                                                2026-11-13 record). Not re-measured here (no browser).
23   Bundle and install size                               PARTIAL              Measured: about 723 KB gzip on the critical path. Parts:
                                                                                entry 183.8 KB, phaser 175.5 KB, defineProperty
                                                                                114.9 KB, communityRules 51.2 KB, keep 47.4 KB,
                                                                                index.html 53 KB gzip (199 KB raw, 193 KB of it one
                                                                                inline script with 50 languages × 29 strings), CSS 17 KB
                                                                                and fonts. dist/ is 23 MB, of which dist/lang is 16 MB,
                                                                                all of it bundled into native installs. No size-budget test
                                                                                exists (STB-08, STB-10).
24   GC spikes (per-frame allocations)                     PASS (minor)         A few small allocations per frame: new Set per frame
                                                                                (BattleScene.ts:724, and in the troop sync around line
                                                                                1192), and a map().join() signature in drawEntry
                                                                                (BattleScene.ts:622). These are small. No hot-loop
                                                                                cloning: controller.tick does cheap checks before
                                                                                advance (controller.ts:492-504).
25   Shader / first-use stutter                            PARTIAL              Every building level a base needs is painted
                                                                                synchronously in BattleScene.create
                                                                                (BattleScene.ts:589-590 → assets.ts
                                                                                buildingTexture/paintLevel). Ruins are painted on
                                                                                the first destruction in the middle of a battle
                                                                                (BattleScene.ts:1108 → fx.ts:301-305). Thumbnails
                                                                                are encoded as synchronous PNG (assets.ts:323-340).
                                                                                Sound buffers are prewarmed (sound.ts:104-119)
                                                                                (STB-07).
26   Asset streaming                                       PASS                 The web fetches only the chosen language pack
                                                                                (vite.config.ts:58-63, boot script). Art comes from
                                                                                the manifest. Alliance, Friends, Settings and Codex load
                                                                                lazily (ui/lazyPanel.ts).
27   Profile in release                                    NEEDS-DEVICE         tools/perf/lowend.mjs and profile.mjs exist but
                                                                                were not run (no Playwright, no device).
28   Storage full                                          PASS                 A failed save is shown at most once a minute with advice
                                                                                to free storage (main.ts:938-960,
                                                                                locales/en/messages.json:1669). A queue the device
                                                                                could not store is told once (main.ts:368-373). If
                                                                                IndexedDB does not open in 5 s, the game runs on
                                                                                memory with a banner (backend brief, persist/idb.ts).
29   Permissions denied                                    PASS (with STB-01    Web reminders check the permission
                                                           caveat)              (reminders.ts:22-31). pushDevice returns null when
                                                                                push is refused (push.ts:25-26). The game never
                                                                                depends on notifications.
30   Third-party SDK crashes / kill switches               FAIL                 Android push without Firebase config crashes the app
                                                                                natively (STB-01). The only kill switch is the server's push
                                                                                feature, which is turned on by APNs alone
                                                                                (server/core/identity.ts:25,
                                                                                server/push/*.ts:199-203). Sign-in scripts load only
                                                                                on tap (auth.ts:173,183). The review prompt is
                                                                                guarded by isPluginAvailable.



 A.OPS: Store compliance, release pipeline, observability, launch and live
 ops
Item                                                    Verdict                   One-line evidence
O-1 Production source maps, private upload to Sentry    FAIL                      vite.config.ts:160-172 has no build.sourcemap,
                                                                                  so Vite's default is no maps. Live
                                                                                  assets/index-BXdR6JcV.js.map returns 404 and the
                                                                                  bundle has no sourceMappingURL. No sentry-cli or
                                                                                  upload step in any workflow. Stacks arrive as minified
                                                                                  index-*.js:1:NNNNN.
O-1 Release tagged in envelopes                         PARTIAL                   Client release: kagemura@${__APP_VERSION__}
                                                                                  (src/main.ts:237) is always kagemura@0.1.0
                                                                                  because package.json:4 never changes.
                                                                                  environment is the platform (main.ts:238), not
                                                                                  staging or production. The server is tagged with the
                                                                                  commit SHA (Dockerfile:36-37, server.yml:108),
                                                                                  which is sound.



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 90
Item                                                    Verdict                 One-line evidence
O-2 Android WebView renderer crash                      FAIL                    MainActivity.java registers no WebViewListener.
(onRenderProcessGone)                                                           Capacitor's BridgeWebViewClient.java:92-104
                                                                                returns false unless a listener handles it, so Android
                                                                                kills the whole app process (a crash in Android vitals).
                                                                                Nothing is reported. iOS reloads
                                                                                (WebViewDelegationHandler.swift:164-168) but
                                                                                also reports nothing.
Session tracking / crash-free-session rate              PARTIAL                 sentryEnvelope.ts:102-118 builds only event
                                                                                items, with no session items. RELEASE.md:34 claims
                                                                                "Crash-free sessions (Sentry, …)", which Sentry cannot
                                                                                show. The store consoles are documented as primary
                                                                                (RELEASE.md:20-29). The web/PWA has no crash-free
                                                                                source at all.
E-3 endReason / Trial tier / quit in statistics         FAIL                    Shared STATS_EVENTS.raid_end = {kind, stars,
                                                                                destruction} only
                                                                                (src/backend/net/stats.ts:25). The local log has
                                                                                endReason (controller.ts:185), but
                                                                                cleanStatsEvent strips it. trial_end
                                                                                (village.ts:227,2331) is never logged, not even
                                                                                locally. Quitting (endReason:'surrender') is invisible
                                                                                to the server.
R-2 Version bump guard (build/version,                  FAIL                    No guard exists. package.json "version": "0.1.0"
PROTOCOL_VERSION, SIM_RULES)                                                    is unchanged through save v24, SIM_RULES 8 and
                                                                                protocol 11. This leaves MIN_CLIENT_BUILD unable to
                                                                                tell builds apart (versionCheck.ts:23,
                                                                                compareBuilds dataVersion.ts:84). What's new is
                                                                                keyed to the version (newsUi.ts:90-95). There are 0
                                                                                git tags (git tag is empty), so
                                                                                previous-client-contract.mjs:19-22 always
                                                                                skips. versionCode and CFBundleVersion do increase
                                                                                (run number).
R-3 Web and server rollback doc                         FAIL (web) / PARTIAL    No web rollback anywhere (grep of docs). Server:
                                                        (server)                RELEASE.md:43 says "redeploy the previous image by
                                                                                hand (the release workflow with that commit)". But
                                                                                server.yml has no input for an existing image tag: it
                                                                                always rebuilds and re-runs the whole test job, and a
                                                                                commit can only be picked by branch or tag (and no
                                                                                tags exist).
R-4 Runbook annotations on alerts                       FAIL                    ops/prometheus/alerts.yml has 13 alerts, 0
                                                                                runbook_url, no owner or team labels and no
                                                                                Alertmanager routing. There is no runbook document
                                                                                (grep "runbook" in docs/, ops/).
iOS privacy nutrition label (documented)                PASS (docs) / OWNER     docs/store/PRIVACY.md:58-68
                                                        (submit)
iOS PrivacyInfo.xcprivacy (app level)                   FAIL                    find ios -name '*.xcprivacy' finds nothing. Only
                                                                                Capacitor core ships its own. OWNER_CHECKLIST.md §3
                                                                                lists it as an Xcode step.
ATT not needed                                          PASS                    No tracking, no NSUserTrackingUsageDescription in
                                                                                ios/App/App/Info.plist. REVIEW_NOTES.md states
                                                                                no ATT.
Sign in with Apple when other logins exist              PASS (code) /           Only Apple and Game Center on iPhone
                                                        NEEDS-DEVICE            (REVIEW_NOTES.md). Entitlement in
                                                                                App.entitlements. Never compiled or run here.
Restore Purchases button                                PASS (code) /           src/presentation/ui/economyUi.ts:289-292
                                                        NEEDS-DEVICE
In-app account deletion                                 PASS (code) /           src/presentation/ui/hud.ts:1368-1396
                                                        NEEDS-DEVICE            (conn.deleteAccount())
Android targetSdk                                       PASS                    android/variables.gradle targetSdkVersion =
                                                                                36
64-bit / 16 KB page size                                PASS (CI check) /       No native code of our own. android.yml:184-195 lists
                                                        NEEDS-DEVICE            any .so in the AAB. It has never run (aab job skipped).
Data Safety draft                                       PASS (docs) / OWNER     docs/store/PRIVACY.md:70-92
                                                        (submit)
Play Billing library (GLOBAL-001)                       PASS (code) / OWNER +   variables.gradle playBillingVersion =
                                                        NEEDS-DEVICE            '9.1.0'. CI fails below 8 (android.yml:160-171), but
                                                                                that step never ran.



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                     Page 91
Item                                                    Verdict                  One-line evidence
Age signals                                             PARTIAL / NEEDS-DEVICE   age-signals 0.0.4 beta (variables.gradle),
                                                                                 TkAgePlugin.java. Not compiled or run here.
Age-rating questionnaires                               OWNER                    Prepared answers in PRIVACY.md:94-120. Not
                                                                                 submitted.
Privacy policy and terms URLs live                      FAIL → OWNER             Live pages return 200 (/privacy.html, /terms.html,
                                                        (GLOBAL-015)             /support.html, /licenses.html,
                                                                                 /community.html). Live legal-config.js has
                                                                                 operator:'', supportEmail:'' and
                                                                                 termsEffective:'', so the pages say "not published
                                                                                 yet" and the terms show a draft banner.
No placeholder/beta/test text in build or metadata      PARTIAL                  App name "Kagemura" in strings.xml, Info.plist
                                                                                 and the manifest. But the legacy
                                                                                 package_name/custom_url_scheme
                                                                                 com.toadstoolkingdoms.app remain (strings.xml).
                                                                                 Store screenshots are made in the sandbox, which
                                                                                 shows a sandbox note and "(test)" prices
                                                                                 (LISTING.md:107).
Screenshots match the game                              OWNER / NEEDS-DEVICE     Only the 2 PWA screenshots exist
                                                                                 (public/screenshots/). No store screenshot set is
                                                                                 committed. The tool exists (npm run
                                                                                 store:screenshots).
Third-party licences                                    PASS                     public/licenses.html (generated by
                                                                                 tools/release/licenses.mjs, tested by
                                                                                 tests/backend/licenses.test.ts). It includes
                                                                                 @capacitor-community/in-app-review and
                                                                                 unicode-segmenter.
Loot-box / odds disclosure                              PASS (code)              Only the free daily chest is random, with odds shown
                                                                                 (dailyUi.ts). Nothing random is sold
                                                                                 (REVIEW_NOTES.md, CLAUDE.md invariant).
COPPA / GDPR (under-13, consent)                        PARTIAL (code) / OWNER   Age bands, UNDER13_MODE (default limited), crash
                                                        + LEGAL                  reports never for under-13 (crashReports.ts:27-29),
                                                                                 statistics adults-only opt-in (stats.ts:8). The legal
                                                                                 position is the owner's (GLOBAL-006 markets).
Trademark "Kagemura"; entity and tax                    OWNER                    OWNER_CHECKLIST.md §1
Release build tested end-to-end                         FAIL → OWNER             The aab job never ran (16 skipped steps, run
                                                                                 44852452737). The TestFlight workflow "has never
                                                                                 run" (ios-testflight.yml:13).
Reproducible builds from a clean checkout               PASS                     package-lock.json + npm ci, .node-version
                                                                                 24.22.3, actions pinned by SHA, Docker base pinned
                                                                                 by digest (Dockerfile:10), Gradle wrapper 8.14.3 (no
                                                                                 distributionSha256Sum: low).
versionCode / CFBundleVersion increments                PASS                     android.yml:150-159 (run number + offset),
                                                                                 release.gradle:27-32, ios-testflight.yml:88
                                                                                 (CURRENT_PROJECT_VERSION=run_number). The
                                                                                 marketing version does not increase (see R-2).
Debug menus, cheats, logging gated                      PASS                     isSandbox = ?sandbox/?debug (select.ts:13-16).
                                                                                 window.tk only with ?debug (main.ts:735-737). The
                                                                                 sandbox never goes online, has no DSN and keeps a
                                                                                 separate save (main.ts:231-288). Native WebViews
                                                                                 load without a query string and no deep link reaches
                                                                                 the WebView URL (custom-scheme and App Links
                                                                                 filters are absent or commented out in
                                                                                 AndroidManifest.xml, Info.plist) (inferred
                                                                                 unreachable). webContentsDebuggingEnabled
                                                                                 defaults to debug builds only (Capacitor
                                                                                 CapConfig.java:286). CAPACITOR_DEBUG is only in
                                                                                 ios/debug.xcconfig.
Staging vs production separated                         PARTIAL                  Server: DEPLOY_ENV + server_meta lock + separate
                                                                                 GitHub environments (SHIPPING.md:211-218,
                                                                                 server.yml:115,152). Client: android.yml and
                                                                                 ios-testflight.yml declare no environment: (only
                                                                                 backup.yml, deploy.yml and server.yml do), so a
                                                                                 TestFlight or internal build cannot use the staging
                                                                                 VITE_SERVER_URL that TESTING.md:7 and
                                                                                 SHIPPING.md:218 describe.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                   Page 92
Item                                                    Verdict                 One-line evidence
Remote config / kill switches / flags                   PARTIAL                 Present: SERVER_NOTICE, MIN_CLIENT_BUILD (inert,
                                                                                see R-2), RETIRED_RULES, signed balance bundles
                                                                                (numbers only, balanceBundle.ts:1-20),
                                                                                EVENT_SCHEDULE_FILE, compliance switches. Absent:
                                                                                any way to stop selling one product or to switch off
                                                                                chat, referrals or shared replays without a deploy of
                                                                                code (grep of server/config.ts env names). There is
                                                                                no ad SDK to disable.
Rollback plan                                           FAIL (web) / PARTIAL    See R-3
                                                        (server)
Hotfix rehearsal                                        FAIL (docs) / OWNER     No hotfix procedure or rehearsal record in docs/.
Signing key backup                                      OWNER                   SHIPPING.md:20-23 ("keep the file and passwords
                                                                                safe")
Funnel events (install, tutorial, first battle, first   PASS (code) / PARTIAL   stats.ts:22-32,
purchase, D1/D7)                                        (sample)                server/core/statsLocal.ts:18-55,125-157
                                                                                (D1/D7/D30, tutorial steps, first raid and first purchase
                                                                                within 7 days), /admin/stats. Only adults who opted
                                                                                in, so it is a biased sample.
Per-level fail/quit                                     FAIL                    See E-3
Economy telemetry                                       PARTIAL                 Shared: upgrade_start, research_start,
                                                                                skip_used, purchase, offer_shown. Local only:
                                                                                collect, reward, moonstone_spend, donation.
Performance telemetry                                   FAIL                    No boot time, FPS, memory warning, renderer or
                                                                                quality-profile field in STATS_EVENTS
                                                                                (stats.ts:22-32)
Error telemetry                                         PARTIAL                 Sentry opt-in (prefs.ts:10 crashReports:false,
                                                                                crashReports.ts:46-58), but unreadable without
                                                                                source maps. Live web build has no DSN (bundle
                                                                                contains no Sentry host).
Consent-gated analytics                                 PASS                    stats.ts:1-14, analytics/share.ts (adults only,
                                                                                off until yes, random id, delete on no)
Events verified in a release build                      NEEDS-DEVICE / OWNER    Never done (no release build exists)
Event schema versioned                                  PARTIAL                 StatsBatch.build exists (stats.ts:44-45), but it is
                                                                                always 0.1.0+<platform> (main.ts:288). No schema
                                                                                field.
Dashboards and alerts with owners                       PARTIAL                 /admin/stats page,
                                                                                ops/grafana/game-versions.json, 13 alerts, but no
                                                                                owners, routing or runbooks
Targets and baselines defined in advance                PARTIAL                 Crash 1.09% and ANR 0.47% halt rules
                                                                                (RELEASE.md:24-27). D1/D7/tutorial KPIs and kill
                                                                                criteria exist only as audit recommendations (docs/au
                                                                                dit/areas/09-retention-and-marketing.md:129-
                                                                                131), not an adopted plan.
Device matrix documented                                PARTIAL                 Device classes listed (OWNER_CHECKLIST.md §5,
                                                                                TESTING.md "Native checks"), but no fixed matrix,
                                                                                protocol (repeat counts, durations) or results template
Closed beta plan                                        PASS (docs) / OWNER     docs/store/TESTING.md (TestFlight, Play 12 testers
                                                                                × 14 days)
Silent playtest                                         OWNER                   Not documented as a protocol. Only "real-player
                                                                                playtests" (OWNER_CHECKLIST.md §5).
Soft-launch plan with kill criteria                     FAIL (docs) / OWNER     Only in audit text (areas/09:129-131,
                                                                                STATE_OF_THE_GAME.md:320-322)
Support channel, known-issues list, on-call             OWNER / FAIL (docs)     support.html exists but supportEmail is empty. No
                                                                                known-issues page or template. No runbook.
Day-0 patch readiness                                   PARTIAL                 MIN_CLIENT_BUILD and the "Update Kagemura" path
                                                                                exist but are inert (R-2). There are expedited-review
                                                                                notes nowhere.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                     Page 93
Item                                                    Verdict                   One-line evidence
Review prompt logic (after a win, never after loss)     PASS (code) /             reviewPrompt.ts:34-39 (win, tutorial done, ≥5 wins,
                                                        NEEDS-DEVICE              120-day gap, ≤3 asks). Called only on "Return home"
                                                                                  after a real raid (battleHud.ts:886-887). Plugin
                                                                                  @capacitor-community/in-app-review 8
                                                                                  (package.json, native.ts:50-54). The header
                                                                                  comment at reviewPrompt.ts:6 ("No native review
                                                                                  plugin is installed") is stale. There is no check against a
                                                                                  purchase problem or crash in the same session (low).
Server pre-scaling                                      OWNER                     server/load.ts, SHIPPING.md 3h "Load test" (about
                                                                                  3 battles/s per instance)
Event safety tests with time travel                     PASS                      tests/gameplay/sim/events-loop.test.ts:24-17
                                                                                  2 (365-day loop, per-occurrence payouts),
                                                                                  clocks.test.ts, return-hooks.test.ts (local
                                                                                  midnight, missed days)
Patch notes                                             PASS                      docs/store/RELEASE_NOTES.md = in-game What's
                                                                                  new (tests/presentation/ui/whats-new.test.ts:
                                                                                  12-17). Keyed to a version that never changes (R-2).
Sunset plan                                             FAIL (docs)               terms.html only says "We can change or end the
                                                                                  game or online play". No operational plan (notice
                                                                                  period, unused-Jade handling, offline mode).




 A.UX: Input, audio and visual polish, UI/UX, accessibility, localization
Item                                          Verdict                                   One-line evidence
I-1 Paid-action double-tap / in-flight        FAIL                                      Two taps on a Store price button before the
protection                                                                              confirm renders open two "Confirm purchase"
                                                                                        dialogs, stacked in the same place. Confirming
                                                                                        both made two purchases (probe2b: purchases
                                                                                        0 → 2, Jade 500 → 590). No busy guard exists in
                                                                                        economyUi.ts:133-138,179-224 or
                                                                                        controller.ts:329. Screenshot 360x640-buy-
                                                                                        doubletap-two-confirms-sync.jpg
I-1b Jade spends confirmed                    PASS                                      Every Jade spend goes through
                                                                                        EconomyUi.spendMoonstones
                                                                                        (economyUi.ts:234-244) and its confirm. The
                                                                                        confirm opens synchronously, so a second tap
                                                                                        lands on the backdrop and cancels. confirm()
                                                                                        resolves once (hud.ts:2607-2609 closed flag)
I-2 Drag that triggers taps; multitouch,      PASS                                      10 CSS px tap slop
pinch vs pan                                                                            (render/cameraControl.ts:4,147). A pinch
                                                                                        cancels the drag and no tap fires afterwards
                                                                                        (:129-135,169-172). Stale touch pointers are
                                                                                        released (render/touchInput.ts). A third
                                                                                        finger re-pinches with the first two
I-3 PWA / browser back, Android gesture       FAIL (web/PWA); PASS in code (Capacitor   main.ts:964-978 handles Back only when
back                                          Android, NEEDS-DEVICE)                    isNative() && platform()==='android'. The
                                                                                        web app has no pushState/popstate. In the
                                                                                        browser, page.goBack() with the Army dialog
                                                                                        open left the game for about:blank (probe1
                                                                                        BACK). The installed PWA is display:
                                                                                        standalone (public/manifest.webmanifest)
I-4 Input in short landscape during battle    FAIL                                      At 640×360 and 568×320, once "Speed"
(inferred)                                                                              appears, the "End battle" button (x 125–237)
                                                                                        covers the Smoke Bomb card (x 164–218). A hit
                                                                                        test at the card's centre returns btn danger
                                                                                        (probe6). Cause: styles.css:817-818.
                                                                                        Screenshot battle-640-360-640-360.jpg
N-A Screen shake / flash setting, reduced     FAIL                                      Camera shakes in BattleScene.ts:1126,1263
motion                                                                                  and fx.ts:320 do not check
                                                                                        prefers-reduced-motion: 4 shakes were
                                                                                        counted with reducedMotion:'reduce'
                                                                                        emulated (probe4). Settings has no shake, flash
                                                                                        or reduce-motion switch
                                                                                        (settingsUi.ts:72-84; prefs.ts:2 keys)




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                        Page 94
Item                                         Verdict                            One-line evidence
N-B Audio interruption resume (inferred)     PARTIAL / NEEDS-DEVICE             sound.ts:95 resumes on a tap only when state
                                                                                === 'suspended'. iOS WebKit's 'interrupted'
                                                                                state (after a call or Siri) is never resumed by a
                                                                                tap. Music and SFX are on/off only, with no
                                                                                volume sliders (settingsUi.ts:72-84)
A-1 Text scaling / dynamic type              PARTIAL / NEEDS-DEVICE             Type is rem-based (2026-11-13 batch), but there
                                                                                is no in-game text-size control and no
                                                                                -apple-system-body/Dynamic Type hook
                                                                                (grep: none). Canvas labels are fixed px
                                                                                (BattleScene.ts:629,964). OS text size not
                                                                                tested on phones
A-2 Touch targets ≥ 44 px                    PARTIAL                            Measured: the Builders pill is 72×30 and the
                                                                                Honor pill 53×30 (320/360 px wide), 85×36 /
                                                                                66×36 at 844×390, with no ::after hit area.
                                                                                The Keep-unlock chip is 51×32. Battle point
                                                                                chips are 42–43 px wide (probe3).
                                                                                styles.css:734 gives a hit area only to
                                                                                .res[role='button'] and news
A-3 Colour-blind signals                     PASS                               Battle role rings (fx.ts:173-203) come with a
                                                                                role silhouette per warrior
                                                                                (art/warriorIcons.ts ROLE_STYLE). Points
                                                                                show a letter and space left. Coin and provisions
                                                                                icons differ in shape and colour (screenshot
                                                                                360x640-first-launch.jpg)
A-4 Screen-reader labels on menus and        FAIL (partial)                     Store buy buttons are named by price only:
purchase flow                                                                   "$0.99 (test)"…"$99.99 (test)" (probe4).
                                                                                The Jade pill, the entry to the Store, is div
                                                                                role=button with no tabindex and no
                                                                                aria-label, so its name is "500+"
                                                                                (hud.ts:331). Dialogs are labelled and
                                                                                focus-trapped (hud.ts:2603-2669)
Zoom disabled in index.html                  PASS                               index.html:5 has no user-scalable=no, and
                                                                                touch-action rules keep pinch for the page.
                                                                                Android WebView pinch-zoom is off by default
                                                                                (inferred, NEEDS-DEVICE)
D-3 One-tap destructive actions without      PARTIAL                            Delete saved army (armyUi.ts:439-443) is one
confirm/undo (inferred)                                                         tap with no confirm or undo. Everything else
                                                                                destructive has a confirm: dismiss, cancel
                                                                                upgrade/research/training, leave Alliance/Gang,
                                                                                delete account, start over, remove/block friend
                                                                                (grep confirm( list)
Review prompt (win only)                     PASS (LOW gap)                     reviewPrompt.ts:34-40: needs a win, the
                                                                                tutorial done, ≥ 5 wins and a 120-day gap. It is
                                                                                counted only from "Return home"
                                                                                (battleHud.ts:883-889), so wins left through a
                                                                                next-action button are not counted
Notifications asked after value, with a      PASS                               hud.ts:481-500: after the tutorial, once, never
pre-prompt                                                                      over a dialog, with an in-game question before
                                                                                the OS prompt
First launch: no pop-up wall; tutorial       PASS                               The first frame is tutorial step 1 with "Skip
skippable and replayable                                                        tutorial", which asks once
                                                                                (tutorial.ts:185-190). Settings has "Replay
                                                                                the tutorial" (settingsUi.ts:117). Screenshot
                                                                                360x640-first-launch.jpg
Destructive and paid confirms in general     PASS                               See D-3 and I-1
Hard-coded English / Toadstool / TODO in     PASS                               text-leaks.test.ts and
player text                                                                     pseudo-locale.test.ts exist. "toadstool"
                                                                                appears only in internal ids in
                                                                                locales/*/data.json. No lorem or TODO in
                                                                                locales/en/ui.json. Generated rival names
                                                                                stay Latin by design (checklist 8)
Long languages (de, fi, ta) at 320–360 px;   PASS (emulated)                    Village, Store, Army, Settings and battle showed
RTL (ar)                                                                        no horizontal overflow and no cut buttons
                                                                                (probe3)




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                              Page 95
Item                                         Verdict                                     One-line evidence
Fonts for every script                       NEEDS-DEVICE / OWNER                        Only Latin subsets ship (ui/fonts/). Other
                                                                                         scripts use system stacks (render/fonts.ts,
                                                                                         styles.css data-script rules). Coverage of
                                                                                         Ethiopic, Odia, Gurmukhi and similar scripts on
                                                                                         cheap Android phones needs devices
Intl numbers, dates and currency             PASS                                        formatNumber/fmtDecimal/dateText. Real
                                                                                         store prices come from the store. The spending
                                                                                         summary uses Intl.NumberFormat(…, USD)
                                                                                         and is labelled as list prices
                                                                                         (economyUi.ts:28,646-647)
Safe areas, rotation mid-battle              PASS (emulated) / NEEDS-DEVICE              --safe-* variables are used throughout
                                                                                         styles.css:61-64. Battle refits on resize
                                                                                         (BattleScene.ts:260). Rotating 360×640 →
                                                                                         844×390 mid-battle left nothing off screen
                                                                                         (probe5)
Interruptions: hidden page                   PASS                                        battleSession.ts:77 caps the frame delta at
                                                                                         250 ms. Sound is suspended while hidden
                                                                                         (main.ts:905-907). A raid closed mid-way is
                                                                                         resolved from its deployments
                                                                                         (controller.ts:552-595)
Interruptions: iOS Control Center /          NEEDS-DEVICE                                No blur handling. The battle clock keeps
notification shade                                                                       running while the shade is down (inferred)
Mute switch                                  PASS (native) / NEEDS-DEVICE (Safari)       ios/App/App/AppDelegate.swift:13 sets
                                                                                         .ambient with .mixWithOthers
Music synthesised while muted                PASS                                        sound.ts:432-445 runs the scheduler only
                                                                                         while music can be heard
Settings persist                             PASS                                        Sound tk.audio, prefs tk.pref.*, quality
                                                                                         tk.quality and language are kept in
                                                                                         localStorage
Keyboard / controller                        PARTIAL                                     Battle keys (1-9, S, Esc), modal Tab trap,
                                                                                         :focus-visible styles. No gamepad (not a
                                                                                         target). The Jade pill cannot be reached by
                                                                                         keyboard (A-4)
Store listing localization                   OWNER                                       Draft listings exist in docs/store/<code>/ for
                                                                                         every language. Native review is an owner step



 A.GT: Content, game design, game theory and strategy
Item                                          Verdict                   One-line evidence
Soft-lock: resources / economy                PASS                      No demolish command exists (command list in village.ts).
                                                                        Collectors produce while upgrading. A refund debt is repaid by
                                                                        income (src/gameplay/CLAUDE.md Purchases). Max storage
                                                                        covers the largest cost at every Keep (Keep 14: 316.7M cap vs
                                                                        24.1M for Keep 15; Keep 15: 490.9M vs 21.6M; research max
                                                                        25.9M for storm_sovereign L12).
Soft-lock: builders / army empty              PASS                      Garrison crew 2 (economy.garrisonCrew). Cancel refunds and is
                                                                        refused only when the refund would not fit. The daily drill pays
                                                                        with nothing spent (drillEnd, daily.json drill). The Trial
                                                                        catch-up tier exists (trialCatchUpTier).
Soft-lock: entryRoom                          PASS                      sim/entryRoom.ts: 6 of 8 approaches must stay open, refused at
                                                                        place/move. A raid that deploys nothing pays nothing (DECISIONS
                                                                        line 40).
Win/lose conditions trigger                   PASS                      battle.ts:827-837: destroyed at 100%, time at
                                                                        durationSeconds 180 × 10, no_troops when every warrior is
                                                                        dead with nothing left to deploy; surrender in
                                                                        battleSession.ts:83,145. Stars at battle.ts:850-854 (50% /
                                                                        Keep / 100%).
Every Trial tier beatable                     PARTIAL                   Tier 58 is the measured ceiling for the bot mix (trials.json
                                                                        $commentCap, TRIAL_CAP 58). My probe: the last tier of most
                                                                        Keeps is 0/4 clears for a capped own-Keep army (tiers 23, 27, 28,
                                                                        32, 36, 40, 47, 48, 60, 62, 64), then the next tier is 100% (see
                                                                        GT-09). No solver proof exists, only fixed bot plans.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                      Page 96
Item                                          Verdict                   One-line evidence
Generated bases never impossible              PASS                      entry-room.test.ts holds that generated bases leave all 8
                                                                        approaches open. Lab floor: every family ≥ 30% except melee@8
                                                                        and support@8 (KNOWN_BELOW, army-lab.test.ts:145).
RNG fairness / seed reproducibility           PASS                      The integer-only mulberry32 RNG (rng.ts). Server seeds come
                                                                        from randomBytes(4) (server/nodeContext.ts:76). The online
                                                                        seed is issued at /attacks/start after the stake (DECISIONS line
                                                                        17). Offline seeds come from scoutBattleSeed; abandoning
                                                                        counts as a lost attack.
Seed noise (deploySpread 0.3)                 PARTIAL                   Seed-only destruction SD: K6 4.7, K10 9.3, K15 2.6. The star result
                                                                        differs from the modal result 29% / 16% / 8% of the time. Single
                                                                        cells reach SD 19.5 (K10, stars 0/1/2/3 = 1/5/3/3 from the seed
                                                                        alone) and a 6/12 three-star coin flip (K15). See GT-10.
Keep 3 dip                                    PASS (moved)              Regular K3 1.94★ ± 0.22 across 8 seeds (gate 1.2). The casual
                                                                        dip moved to Keep 4: 0.48★ and 31% won, pooled over 6 seeds
                                                                        and 29 raids (GT-02).
Keep 5→6                                      PASS                      Casual K5→6 is 9 days (CAMPAIGN.md: casual 5.7 → 14.7). The
                                                                        gate "≤ 21 days a stretch through Keep 10" passes.
Keep 15 cliff                                 FAIL (ungated)            Regular K14 1.72★ / 84% won → K15 1.25★ / 68% / 8% three-star
                                                                        (8-seed means). The drop of 0.47 ± 0.08 stars appears in every
                                                                        seed. The pair rule hides it (GT-08).
Trials "regressing tiers"                     FAIL                      The sawtooth goes from 0/4 to 4/4 at every Keep boundary
                                                                        (GT-09).
Warrior "regressing tiers"                    FAIL                      TIER_KNOWN_BELOW lists 12 newer-below-older pairs at K15 and
                                                                        KIT_KNOWN_BELOW lists 20 kits worth < +2
                                                                        (kits-tiers.test.ts:22-24) (GT-04).
Air                                           FAIL                      Air destruction (3★) by Keep from ARMY_BALANCE.md: K6 47 (0%),
                                                                        K7 47 (0%), K8 36 (0%), K10 49 (0%), K12 26 (0%), K15 44 (0%). It
                                                                        is the lowest or second-lowest at every Keep from 6 and costs
                                                                        about 2× the Provisions (K15 7.9M vs 4.0M for the mix) (GT-03).
Dominant / dominated strategies               FAIL                      The raid-bot mix at K15 scores 84 against 69 for the next army.
                                                                        Keep 12 is a listed gap (it.todo, kits-tiers.test.ts:67). Air is
                                                                        dominated. Rushing is fastest (rusher Keep 15 day 100.2 vs 103.6)
                                                                        (GT-07, GT-03).
Degenerate: turtling / Keep rush / farming    PARTIAL                   The farming bound passes (≤ 50% three-star). Sandbagging does
                                                                        not pay (gate). The fortress pays 26 days to Keep 15 (129.6 vs
                                                                        103.6), but only Keep 12 is gated (GT-05). The rushed-Keep line
                                                                        and seals exist (armyBehindKeep, claimKeepSeal).
Intransitive counters                         PARTIAL                   Tempering gives "no army best on every profile at K15"
                                                                        (DECISIONS line 37), but Keep 12 is still a gap. The five live
                                                                        counters move armies by about −12 to +9 points; most cells are
                                                                        within ±3 (ARMY_BALANCE.md, counters table). The 20 planned
                                                                        rock-paper-scissors buildings are not live.
Early vs late scaling / power creep           FAIL                      Newer tiers sit below older ones (GT-04). The late curve ×1.56 ×
                                                                        1.15^(K−6) is documented (DECISIONS line 31).
Attacker vs defender advantage                FAIL (late)               Held share at Keeps 13-15: regular 3% / 5% / 0%; defender 5% /
                                                                        0% / 0%; fortress 44% / 31% / 12% (CAMPAIGN.md). The 8-seed
                                                                        regular Keep 15 held rate is 3% ± 4 (GT-05).
Scouting / information asymmetry              PASS                      scout.ts never shows hidden traps or upgrading buildings as
                                                                        threats. The temper profile is shown (ScoutReport.profile). The
                                                                        rival-answer rule is on a Codex page (P6-18).
Commitment (3★ stake)                         PARTIAL                   1.3 / 1.75 multipliers; a miss carries nothing (raids.json
                                                                        stakes). Stake UI text gives no hit rate
                                                                        (locales/en/ui.json:174-179). Seed lottery as above (GT-10).
Gangs / Alliances free riders                 PARTIAL                   A chest needs chestMinAttacks 1
                                                                        (server/core/groveRaid.ts:163-165,290-294,
                                                                        gangWars.ts:417-420), but any attack counts, including a
                                                                        one-warrior attack, and the chest does not depend on contribution
                                                                        (GT-13).
Donations / collusion / alt feeding           NEEDS-PLAYERS             A device donor is refused for a server receiver (exploit #8).
                                                                        Uploaded-base loot is capped (#7). Server-village alts and troop
                                                                        gifts are uncapped beyond Lodge and storage caps (GT-17).




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                       Page 97
Item                                          Verdict                   One-line evidence
Win-trading / honor collusion                 FAIL                      A lost defense costs 0 honor (ranks.json
                                                                        defenseHonorLossShare 0, pvp.ts:763-770). Equal-honor wins
                                                                        pay +24 (attackWin.base). A Keep snipe under 30% gives the
                                                                        defender no shield (shieldTiers 30/60/90). Two accounts gain
                                                                        honor from each other with no loss (GT-01).
Kingmaking                                    PASS (N/A)                All wars are two-sided: Gang Wars 2v2-4v4 and Alliance pairings.
Griefing                                      PARTIAL                   The leader hands over on leave (groves.ts:105-115). A token
                                                                        war attack spends one of the side's attacksPerMember × roster
                                                                        slots without contributing (GT-13).
Snowball / comeback                           PASS (offline)            Shields 16/20/24 h, exhaustion ×0.5 over 36 h, upward loot
                                                                        penalty, lossStreakSlack (0.51-0.62× loot when abused, P2-10),
                                                                        catch-up raids ≤ 3. Online none of the defense side applies
                                                                        (P2-12, src/main.ts:284 botRaids: !serverUrl).
Quit incentives                               PASS                      Online, a started raid with no report becomes a forfeit after
                                                                        REPORT_GRACE_MS (pvp.ts match loop). Offline, abandonBattle
                                                                        is a lost attack (sanitizeBattleSetup).
Matchmaking algorithm fit                     PARTIAL                   Glicko-like AR/BR, K 40 → 16, RD 350 → 60 in about 24 battles
                                                                        (ranks.json rating, rating.ts). The convergence test uses
                                                                        synthetic skill (1200-1900) and ±0.15 noise
                                                                        (rating-convergence.test.ts:37-51). The power term uses
                                                                        the Keep, not research strength (pvp.ts:362,780).
Placement speed / uncertainty / decay         PASS (math) /             rdShrinkPerBattle 0.93 and rdGrowthPerIdleDay 6. Bots
                                              NEEDS-PLAYERS             never move a rating (pvp.ts:777-783), so at low population
                                                                        nobody gets placed.
Inflation / seasons                           PARTIAL                   A monthly halving above 400 (ranks.ts rollSeasons) bounds
                                                                        honor. Honor still only rises on defense (GT-01).
Smurfing                                      NEEDS-PLAYERS             The rating picks the base nearest matchTarget 0.55 among real
                                                                        candidates, which protects weaker players. Unmeasured with a
                                                                        population.
Queue time at low population                  PASS                      A generated fallback always exists and is labelled
                                                                        (pvp.ts:376-391, kind.generated / kind.rival).
Bots labelled and not distorting rank         PARTIAL                   They are labelled, and ratings are untouched, but honor and the
                                                                        honor leaderboard are earned against generated bases
                                                                        (pvp.ts:756, using ticket.defenderTrophies) (GT-01).
Leaderboard incentives (Goodhart)             FAIL                      Honor = session count × wins (LD-2 still holds,
                                                                        defense-raids.md:222). Power = AR + 150 × (Keep − 1)
                                                                        (rating.ts powerRating) (GT-01, GT-12).
Risk vs reward                                PASS                      Stakes, the upward loot penalty and carry by stars.
Loss aversion, casual                         FAIL                      Casual players lose 0.98 ± 0.09 of what they loot (6 seeds,
                                                                        minimum 0.91); explorer 160%; casual_hires 106%
                                                                        (CAMPAIGN.md) (GT-06).
Sunk-cost traps                               FAIL                      Researching a newer tier that scores below the older one (GT-04).
                                                                        Air research at 2× cost (GT-03).
Streak pressure (a missed day never wipes     PASS                      daily.ts:67-82: one free skip a week, then −1 step per missed
it)                                                                     day, never below 1. Tests daily.test.ts:82,89. The calendar
                                                                        loses nothing (daily.json calendar $comment). Note: 7+
                                                                        missed days return the streak to step 1, which matches the rule.
Methods: multi-seed CIs                       FAIL                      rep exists but no tool uses it. My 8 seeds: regular Keep 15 day
                                                                        103.7 ± 1.3 (95% CI), range 100.2-106.2, against gate ≥ 100
                                                                        (GT-11).
Methods: adversarial attacker in CI           FAIL                      Searches exist only in audit scripts (docs/audit/balance-2026-
                                                                        11-08/scripts/design/coevo.ts, doctrine2.ts). CI uses fixed
                                                                        bot plans only (GT-11).
Methods: defense-loss telemetry / human       NEEDS-PLAYERS             No telemetry against the model. "Real-player playtests are still
playtest                                                                owed" (campaign-gates.test.ts:12).
Jade lifetime model                           FAIL (tooling)            campaign.json has no moonstones field. The model only spends
                                                                        Jade on artisans (playerModel.ts:179) (GT-11).
Content runway                                NEEDS-PLAYERS             Keep 15 at day 103.7 for regular, 179.4 casual, 207.4 explorer,
                                                                        106.4 casual_queues. After that: research (< 1 year,
                                                                        progression-model.test.ts), Trials to about tier 58, weekly
                                                                        Gauntlet, monthly leagues (GT-15).




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                                         Page 98
 Appendix B: verified sound (do not "fix" these)
 B.ECO: Economy, monetization and real-money integrity
  • Server intent and cap locking (GLOBAL-004/005): purchases.ts:142-169 checks and reserves inside
    lockPurchases. Cancelled intents free the hold and pending ones hold 7 days (:179-191). A receipt with no live
    intent counts at redeem (:330). A dearer receipt counts the difference (P1, :334). An over-cap receipt is left
    unfinished, and Google auto-refunds it after 3 days (:247-262).
  • P2 holds for server-held villages: an offer must be active, a Scroll unowned and on sale, a Stipend empty
    (:155-165). Redeem needs the product's own unused intent (:338-341). (The parallel-intent gap is ECO-01.)
  • C1 (repeated seq) fixed: see closure record; grantPurchase is not a player command (village.ts:98,
    CLAUDE.md). staffAdjust never deepens debt.
  • Apple receipt chain (P3): extension-id OIDs, CA flags, checkIssued, P-256 leaf, ES256 signature, bundle id and
    environment (apple.ts:101-161). Notification bundle binding (:174-176). Notifications deduplicated and ordered by
    signedDate (purchases.ts:446-459). RESCIND_CONSENT suspends and forces under-18 (:486-501).
  • Google: URL and product match, purchaseState 0 only, test purchases refused on production (google.ts:120-145,
    config.ts:228). Consume only when the server village holds it, else acknowledge (purchases.ts:229). RTDN OIDC
    with service-account email (google.ts:190-213). Voided poll (purchases.ts:517-522).
  • Refund before redeem is refused through refund notices (purchases.ts:271-274,386-391). Refund reversal
    restores exactly what was taken (:412-430).
  • Device-held deliveries finish only after the save lands (controller.ts:369-373,666-671). Server-held finish
    after save (:393-397). A redeem network failure keeps the store transaction (:382-383).
  • Import provenance: only server-credited purchases count. Unconfirmed Jade above freeJadeAllowance and an
    unpaid Scroll are held (villageImport.ts:129-170).
  • Offers never pop for minors or unknown ages (offers.ts:15-17,40). The offer popup shows no price
    (economyUi.ts:485-499). The loss-triggered offer is retired (offers.json rebuild_pack.retired).
  • Minors' UI: age asked before the first purchase (economyUi.ts:144-150,180), refused before the confirm when
    over the cap (:187-191), second "check with a grown-up" confirm (:216-218). Under-18 is sticky on the server
    (purchases.ts:73-81) and in the sim (setProfile, closure #14).
  • Store screen: real prices only from the store; "…" / "Price unavailable" / "Not sold here" disable buying
    (economyUi.ts:120-131). Bonus percentages are computed from storefront micros in one currency (:313-330). An
    EU "about €" range only in the Store (:166-172). Restore button disabled while running (:291-306).
  • No ads: no ad SDK in package.json:62-75 or the native builds.
  • Nothing random sold: fixed product grants (grantPurchase, productGrantsFor). The daily chest is free with exact
    odds shown (dailyUi.ts:152-166, DECISIONS.md:62).
  • Clan Stipend is not a subscription: consumable, payments never lost on a missed day, buyable again when
    empty (stipend.ts:1-9,31-37). Its refund takes claimed Jade back (village.ts revokePurchase stipend branch).
  • Arbitrage fixes XPL-04/09 are in code (village.ts:1100,1121). noteTopUp spreads shares (#9). Season catch-up
    is bounded (ranks.seasonCatchUpMax 2, CLAUDE.md XPL-03).
  • Refund abuse: a pause after 3 refunds in 90 days, counted per buyer across accounts on the same devices and
    installs (purchases.ts:92-139).
  • Rate limit: purchase routes 120/h per player (rateLimit.ts:87, routes/player.ts:88-91).

 B.SEC: Security, cheating and server readiness
  • Replays of old reports: takeTicket returns the stored answer for a used ticket and refuses voided, lapsed,
    burned or forfeited ones (server/core/pvp.ts:452-468). A ticket with MAX_TICKET_FAILURES takes no more (:464). A
    seeded raid must be started first (:711, S2 holds).
  • Server-issued seeds: battleSeed refuses a foreign seed (pvp.ts:686-693).
  • Command batches: a repeated seq is refused and PLAYER_COMMANDS is checked per command (C1;
    src/backend/CLAUDE.md "Security audit 2026-11-20").
  • Server-held villages: troops are required and consumed, and loot is banked in the same transaction
    (pvp.ts:477-489, 796-800). A device donor cannot fill a server-held receiver (server/core/groves.ts:231).



Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                        Page 99
    Uploaded-base loot is capped (pvp.ts:255-265, 788-795).
  • Per-server token storage: a token is never sent to another address (src/backend/net/httpAdapter.ts:96-110).
    Android backup excludes localStorage (android/app/src/main/res/xml/data_extraction_rules.xml).
  • No private secrets in client artifacts. The Sentry DSN, Google client id, Apple services id and balance public
    key are public by design (.github/workflows/deploy.yml:47-59, android.yml:46-61). public/legal-config.js holds
    only empty publisher fields.
  • Rate limits degrade, not open: Redis down → MemoryRateLimiter per instance, divided by RATE_LIMIT_INSTANCES
    (server/shared.ts:283-319). The leaderboard falls back to the database (shared.ts:86-171).
  • Generated opponents labelled: kind: 'bot' when there is no defender id (pvp.ts:442, 384).
  • Graceful shutdown: server/shutdown.ts. Production config refusals: database, staff tokens, TRUST_PROXY,
    CORS, TLS, short metrics token (server/config.ts:164-188).
  • Backups: daily encrypted dump plus a weekly restore drill that starts the server
    (.github/workflows/backup.yml:17,76-84).
  • Staged deploy: staging gets automatic deploys and contract tests with the previous release's client; production
    needs a manual dispatch behind environment reviewers (.github/workflows/server.yml:114-173).
  • Server pages have strict CSPs (server/adminPage.ts:12, accountPage.ts:73, complaintPage.ts:64).
  • Ban removes from the board and notifies with the appeal route (server/core/admin.ts:156-171). Banned
    players are skipped by ranking queries (src/backend/CLAUDE.md Operations).
  • Deletion covers 40 tables in one transaction (server/stores/pg/players.ts:172-276), and player_notices,
    deletion_codes and village_parts cascade (migrations 0024, 0039). Purchases are kept unlinked as financial
    records.
 Not run: any test (no node_modules), Postgres and Redis adapters, multi-instance, devices, store sandboxes. Passing
 reads here do not establish release readiness.


 B.SAV: Save data, progression and client networking
  • Revision-checked atomic save: the read and the write share one IDB transaction, and an abort reports
    SaveConflictError (src/backend/persist/saveStore.ts:116-140); takenOver stops all further writes
    (controller.ts:661,676); tests tests/backend/persist/saveStore.test.ts:22-65.
  • Newer save never overwritten: save.ts:56, controller.ts:127, boot error card with Update and Copy save
    code (main.ts:1076-1117); for a server village from a newer build, incompatible without adoption
    (connection.ts:1144-1148, villageSync.test.ts:62-66).
  • IDB connection loss (iOS): reconnecting handle, a one-time retry of transact, a retried save via reconnected
    (idb.ts:57-196, main.ts:943-951); a 5 s open timeout so boot never hangs (idb.ts:13). The fallback behaviour itself
    is SAV-01.
  • Migrations are additive and default-safe v1→v24 with per-load repairs (save.ts:52-260); a v1 save loads and
    plays 24 h offline (migration-full.test.ts:6-47).
  • Lifecycle saves: hidden, pagehide, Capacitor pause, visible (main.ts:886-933); the 15 s autosave with a dirty
    check and a 2-minute floor (main.ts:869-880).
  • Purchase delivery is durable and idempotent: intent before charge, release on cancel/pending, redeem →
    grant → finish only after a landed save (awaitingSave), transaction ids unique (controller.ts:327-418); unfinished
    receipts retried 15 s→15 min with backoff (main.ts:344-356).
  • Command queue integrity: one seq per command, device-scoped numbering, a repeated seq refuses the whole
    batch (server/core/village.ts:181-208); a failed queue write is surfaced (storageProblem) and pushed to the
    server (villageSync.ts:155-171).
  • Server clock authority for held villages: commands clamped to 12 h back / 2 min ahead and timers to 10
    min back (server/core/village.ts:37-51,235); battle start times believed only within 600 s (closure #4).
  • Bounded HTTP: the whole exchange (headers, body, JSON) under a 15 s deadline that rejects even if fetch
    ignores abort; a cut-off success is a retryable error, never "no data" (httpAdapter.ts:214-283); only GETs
    auto-retry, never on rate_limited (httpAdapter.ts:302).
  • Alliance polling (R04): serial polls, 4 s/20 s while visible, none while hidden, exponential backoff to 60 s with
    ±15% jitter, a slow answer stretches the wait (social/groveSource.ts:250-430).




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 100
  • Forced update: server 426 below MIN_PROTOCOL 7 (server/app.ts:254-264), supportedRules/minClientBuild check
    (net/versionCheck.ts:19-27), the HUD "Update Kagemura" once per session plus a Settings button
    (hud.ts:893,930); tested (tests/backend/net/connection.test.ts:100-109).
  • Late raid reports up to 72 h after ticket expiry; retention keeps those tickets (server/core/pvp.ts:52,466,
    retention.ts:48-49).
  • Non-finite values cannot persist: validateVillage checks resources, timestamps, seeds, trophies and timers
    (save.ts:324-372); the server rejects a non-finite t (village.ts:187); the security audit fuzzed 23,156 command
    variants with no non-finite output (closure record 2026-11-20).
  • Tutorial cannot soft-lock: completion is read from state, Skip (with confirm) on every step but the last, Replay
    in Settings (ui/tutorial.ts:42-199, settingsUi.ts:117).
  • Android backup excludes the token and queue (no two phones becoming one online device)
    (android/app/src/main/res/xml/data_extraction_rules.xml).
  • Interrupted battles: pendingBattle is kept in the save and settled or abandoned on the next launch
    (controller.ts:548-595); pending online attacks missing from the outbox are re-queued from the battle log
    (connection.ts:1408).


 B.STB: Crashes, stability, memory, lifecycle and performance
  • Texture memory (F1): an LRU budget with per-scene holders
    (src/presentation/render/textureBudget.ts:15-95). Battle hold and release (BattleScene.ts:242-246). Low-memory
    trim on hide, pagehide, pause and tkmemorywarning (main.ts:893-904). Under WebGL the island and scenery CPU
    canvases are released after upload, with a repaint on a restored context (assets.ts:176-199). Tint copies are
    removed on battle shutdown (BattleScene.ts:245).
  • Scene cleanup: no RenderTexture/DynamicTexture anywhere in src/presentation (grep), so a context restore loses
    no drawn content. Scene input listeners, tweens and timers belong to the scene and are cleared by Phaser on
    shutdown. The global listeners on scale, window and game are removed (BattleScene.ts:261,
    cameraControl.ts:45, touchInput.ts:29).
  • HUD listeners: every modal-scoped interval and subscription is cleared in its modal's onClose
    (armyUi.ts:245-249, groveUi.ts:128-133). The battle HUD removes its keydown and interval (battleHud.ts:276-277).
    The Settings server block disconnects its observer when detached (hud.ts:965-971).
  • Audio (F9/F18): no AudioContext while all sound is off. The music scheduler runs only while audible and visible.
    The context is suspended on hide (sound.ts:71-160, 438-457).
  • Frame pacing (F2): drawn-frame meter, refresh measured at start, 120 Hz high limited to 60, idle 20 FPS, 10
    FPS under a dialog, and a live 30 FPS downgrade after slow battles (frameRate.ts, main.ts:983-1020,
    quality.ts:270-288). The slow-battles message is now localized (quality.ts:288, t('quality.slowBattles')), which
    fixes the 2026-11-13 "Also noticed".
  • Battle timing: real-time stepping caps each frame's delta at 250 ms (battleSession.ts:77), so a resume after a
    long pause cannot fast-forward a battle. The sim stays a fixed 10 ticks/s.
  • Persistence: atomic IndexedDB save with a revision check (saveStore.ts:112-133). Damaged-save backups are
    capped at 5. Save failures are shown to the player (main.ts:938-960). The queue-storage problem is told once
    (main.ts:368-373).
  • Boot resilience: boot.js catches script download failures and pre-start errors and rejections (boot.js:380-419).
    boot() failures show a card built with textContent and are reported (main.ts:1048-1070).
  • Polling: Alliance chat polling pauses while hidden and catches up once visible (groveSource.ts:339-425).
  • Notifications denied: web and native reminders and server push all degrade to "no notifications" without
    blocking play (reminders.ts:22-31, native.ts:21-24, push.ts:25-26). The only exception is the Android Firebase
    path in STB-01.
  • Division safety in the HUD: progress widths divide by Math.max(1, …) or are guarded by a count check
    (hud.ts:570,1448,1457,1716,1814; armyUi.ts:229,258; battleHud.ts:743,954). The unguarded ones cannot throw.
  • Tests run here: 15 render and audio test files, 66 tests, all pass, including memoryPressure.test.ts,
    textureBudget.test.ts, frameRate.test.ts and music.test.ts. npm run build passes.


 B.OPS: Store compliance, release pipeline, observability, launch and live
 ops

Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 101
  • Debug and cheat gating: the sandbox and debug tools need ?sandbox/?debug
    (src/backend/payments/select.ts:13-16). window.tk is set only with ?debug (src/main.ts:735-737). The sandbox has
    its own save, an in-memory event store, no server, no DSN and no balance or event loaders (main.ts:171-180,
    231-288). Native WebViews load without a query string and no deep link reaches the WebView URL (inferred from
    AndroidManifest.xml, Info.plist and the commented-out link filters). WebView debugging defaults to debug
    builds only (Capacitor CapConfig.java:286). Content preview needs VITE_ALLOW_PREVIEW=1, which no workflow sets.
  • Increasing native build numbers: Android versionCode = run number + ANDROID_VERSION_CODE_OFFSET with
    range checks (android.yml:150-159, release.gradle:27-32). iOS CURRENT_PROJECT_VERSION=run_number
    (ios-testflight.yml:88).
  • Commercial Android configuration: the signed AAB sets VITE_PLAY_BILLING=1, fails if Billing < 8, verifies the
    signature and lists native libraries (android.yml:127-195). The legacy app id is refused unless explicitly allowed
    (check-app-id.mjs, android.yml:104-109). targetSdkVersion 36, minSdk 24, minWebViewVersion 80 (variables.gradle,
    capacitor.config.ts). SCHEDULE_EXACT_ALARM is removed (AndroidManifest.xml).
  • Reproducible pipeline: npm ci from package-lock.json, .node-version 24.22.3 in every workflow, actions pinned
    by commit SHA, Docker base pinned by digest (Dockerfile:10), minifyEnabled false (no R8 mapping file needed).
  • Server release identity and order: the image is tagged with the commit and RELEASE=kagemura-server@<sha>
    (server.yml:101-109, Dockerfile:36-37). Production is manual and gated by an environment (server.yml:148-174).
    "Server first" checks run before every client build (check-server-rules.mjs in deploy.yml:60-62, android.yml:43-46,
    ios-testflight.yml:42-45). Migrations are a release step, and the built server is contract-tested on a freshly
    migrated Postgres (deploy.yml:106-137).
  • Staging vs production on the server: DEPLOY_ENV, the server_meta claim that stops staging from touching
    production data, and production refusing unsafe config (SHIPPING.md:211-218).
  • Privacy-preserving analytics: an allowlist with typed fields only, random statistics id, adults only, off until yes,
    deleted on no, no IP or player id stored (src/backend/net/stats.ts:1-91, PRIVACY.md statistics row). Funnel with
    D1/D7/D30, tutorial steps, first raid and first purchase (server/core/statsLocal.ts:18-157, /admin/v1/stats/funnel,
    server/routes/growth.ts:39-40).
  • Crash reports are consent-gated and scrubbed: off by default (prefs.ts:10), never under 13
    (crashReports.ts:27-29), never in the sandbox (main.ts:236), query strings and emails scrubbed
    (sentryEnvelope.ts:46-99), throttled to 10 a minute.
  • Store-required account features in code: Restore purchases (economyUi.ts:289-292), in-app deletion
    (hud.ts:1368-1396) plus the web deletion form, Sign in with Apple as the only third-party login on iPhone, odds
    shown for the only random item (the free daily chest), no ATT needed (no tracking).
    ITSAppUsesNonExemptEncryption=false (Info.plist).
  • Licence notices: public/licenses.html, generated and tested (tools/release/licenses.mjs,
    tests/backend/licenses.test.ts), covering every shipped npm package, native library families and fonts.
  • Store-readiness preflight: tools/release/check-store-ready.mjs fails the signed jobs on 6 blocking owner items
    and lists 22 open (run locally at 560ce7a).
  • Rollout watch plan: docs/store/RELEASE.md:20-37 (Play vitals 1.09% crash / 0.47% ANR halt lines, Xcode
    Organizer terminations, pre-launch report, desyncs by build, RefundSpike), plus pause instructions for both stores.
  • Review prompt policy: only after a real raid win, after the tutorial, ≥5 wins, 120 days apart, ≤3 times ever,
    never gating anything (reviewPrompt.ts:18-39, battleHud.ts:886-887).
  • Event and time safety tests: a 365-day event loop, per-occurrence payouts, local-midnight rolls, and missed
    days never wiping streaks or calendars (tests/gameplay/sim/events-loop.test.ts, clocks.test.ts,
    return-hooks.test.ts).
  • Patch notes: in-game What's new equals docs/store/RELEASE_NOTES.md
    (tests/presentation/ui/whats-new.test.ts). It only needs a version that changes (OPS-01).
  • Live legal pages are reachable: privacy.html, terms.html, support.html, licenses.html and community.html
    return HTTP 200 on GitHub Pages (curl, 2026-11-21). Their content is honestly marked unpublished until
    OWN-04.
  • Data Safety, privacy label and age-rating answers are drafted from the code
    (docs/store/PRIVACY.md:7-120). Closed-testing plan in docs/store/TESTING.md.


 B.UX: Input, audio and visual polish, UI/UX, accessibility, localization


Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                     Page 102
  • Every Jade spend is confirmed (economyUi.ts:234-244; callers armyUi.ts:292,357,549,590,
    hud.ts:1763,1792,2111,2119, economyUi.ts:474). It shows no real-money figure and offers "Visit the store" when
    short.
  • Store confirm step: price from the store, withdrawal notice, Japanese notices, second confirm for under-18
    (economyUi.ts:200-218). A cancelled purchase releases the cap (controller.ts:343-347).
  • Every other destructive action has a danger-styled confirm (see D-3). End battle is confirmed
    (battleHud.ts:571,824). Native Android Back closes the top dialog or sheet, then confirms leaving
    (main.ts:964-978, hud.ts:2678-2690).
  • Dialogs: named by title (aria-labelledby), focus moves in, Tab is trapped, Escape closes only the top one, focus
    goes back (hud.ts:2603-2669). Closing dialogs take no taps (.out).
  • Touch: 10 px tap slop, pinch cancels the tap, stale pointers released (render/cameraControl.ts,
    render/touchInput.ts). touch-action rules keep page zoom available (index.html:5, no user-scalable=no).
  • HUD reduced motion: a global rule ends CSS animations and transitions (styles.css:755-758). HUD JS animations
    check reducedMotion() (feedback.ts:33-51, unlockCeremony.ts:55,106, hud.ts:566). The battle opening glide is
    skipped (BattleScene.ts:363,427).
  • Localization: text-leaks.test.ts and pseudo-locale.test.ts (RTL Hebrew-letter and +40 %) exist. Emulated
    de/fi/ta at 320–360 px and ar at 360 px showed no overflow or cut buttons in village, Store, Army, Settings or
    battle (probe3; screenshots de-320x568-*.png, ta-320x568-*.png, ar-360x640-*.png). Names accept any script
    (net/names.ts:37 \p{L}, sim/social/names.ts). Prices come from the store; numbers and dates through Intl helpers.
    No "toadstool", lorem or TODO in player-visible English (locales/en/ui.json).
  • Onboarding: no pop-up wall on first launch (screenshot 360x640-first-launch.jpg). Skip asks once
    (tutorial.ts:185-190). Replay in Settings (settingsUi.ts:117). The notifications pre-prompt comes after the
    tutorial, once (hud.ts:481-500). The age question returns at most 3 times (askAgain.ts).
  • Audio: no AudioContext while sound is off. Music is scheduled only while audible (sound.ts:425-445). Sound is
    suspended while hidden (main.ts:905-907). The iOS session is .ambient + .mixWithOthers and respects the silent
    switch (AppDelegate.swift:13). Haptics have a switch.
  • Review prompt policy (win only, ≥ 5 wins, 120 days, ≤ 3 times, never in the tutorial, not for practice/trial/replay)
    with a native plugin installed (@capacitor-community/in-app-review, main.ts:304).
  • Rotation mid-battle (360×640 → 844×390) and a direct landscape start re-fit the battle with no off-screen
    buttons (probe5; screenshots battle-360-640-844-390.jpg, battle-844-390-844-390.jpg). Safe-area variables are
    used for every edge-anchored HUD block (styles.css:61-64 and uses).
  • Settings persist across reloads (tk.audio, tk.pref.*, tk.quality, tk.lang).
 Limits: emulation only (Chromium touch emulation, no Safari/WebKit, no physical phone). Device behaviour of Back
 in Capacitor, the iOS audio interruption, OS text scaling, font coverage for non-Latin scripts on cheap Android
 phones, Control Center and safe areas on notched devices remain NEEDS-DEVICE.


 B.GT: Content, game design, game theory and strategy
  • Battle end conditions (battle.ts:827-848): destroyed / time (180 s × 10 ticks) / no_troops, plus surrender.
    Smoke charges are separate from remaining, so unused smoke does not stop no_troops. Stars at
    battle.ts:850-854.
  • Deterministic, integer-only RNG (rng.ts mulberry32, mixSeed). Server seeds are crypto.randomBytes
    (server/nodeContext.ts:76). Trial, bounty and rematch seeds must come from the village's window (exploit L4).
  • No economic soft-lock:
    • No demolish/sell command.
    • The largest single cost fits max storage at every Keep 1-15 (Keep 1: 4.5k cap vs 1k; Keep 14: 316.7M vs 24.1M
       Keep 15 cost; research max 25.9M vs 490.9M).
     • Refund debts are repaid by income.
     • The daily drill pays without spending warriors.
     • trialCatchUpTier lifts a late starter out of trivial tiers.
  • Missed days never wipe a streak (daily.ts:67-82: one free skip a week, then one step per missed day, never
    below step 1; daily.test.ts:82,89). The 28-day calendar loses nothing on a miss.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                      Page 103
  • Quit = forfeit: online, an unreported started raid is settled as a loss (pvp.ts match loop, REPORT_GRACE_MS).
    Offline, abandonBattle counts as a lost attack.
  • Generated opponents are labelled: kind.generated / kind.rival, Gauntlet and festival "(generated)"
    (locales/en/ui.json:70-71,269-273,307). Server fallback rival outposts keep kind: 'bot' (pvp.ts:383-391).
  • Bots never move a rating (pvp.ts:777-783). A generated Gang war pays no Jade (social.json
    gangWar.generatedOpponentJade false).
  • Queue dilution (LD-1) closed: attackerStrength is housing-weighted over the fighting army only
    (matchmaking.ts:126-150).
  • Sandbagging does not pay: gate passes; sandbagger Keep 15 day 106 vs regular 103.6.
  • Loss-streak slack is not a farm: the 0.51-0.62× loot-per-army record (WORLDWIDE P2-10) and the
    camp-housing rule (matchmaking.ts:168-186).
  • Honor inflation is bounded per season (ranks.ts rollSeasons: halving above 400, seasonCatchUpMax 2).
  • Layouts must leave a way in (entryRoom.ts); generated bases keep all 8 approaches (entry-room.test.ts).
  • The balance suite is green at HEAD: tests/gameplay/balance 11 files / 105 tests, including campaign-gates
    (fingerprint current) and rating-convergence.
  • Regular pace is stable across seeds: Keep 12 day 49.9 ± 1.0, Keep 15 day 103.7 ± 1.3, stolen ÷ looted 0.53
    ± 0.03 (8 seeds, 95% CI).
  • Regular Keep 3 is no longer a cliff: 1.94 ± 0.16★ across 8 seeds (gate 1.2); one seed gave 1.40.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                       Page 104
 Appendix C: how this audit was done, and its limits
 Method. Seven auditors each took one lane of the checklist and masterclass: ECO (sections 3, 17f, 17g;
 masterclass 19-20), SEC (7, 6 server; masterclass 5-6), SAV (2, 6 client; masterclass 2, 5), STB (1, 5; masterclass 1,
 3), OPS (12-16; masterclass 22-25, 27), UX (3b, 4, 9-11; masterclass 4, 8-12), and GT (8, 17a-h; masterclass 7,
 13-18, 21). Each read the project briefs and the closure records of docs/store/WORLDWIDE_AUDIT.md. Each re-checked
 every claim against the code at 560ce7a and wrote file-and-line evidence. The integrating session re-read the code
 behind the highest-severity claims:
  • the second Season Scroll grant (grantPurchase skips canPurchase when verified, src/gameplay/sim/village.ts);
  • the device-village upload path with no REQUIRE_SERVER_VILLAGE anywhere (server/core/pvp.ts uploadBase,
    requireArmyOnServer);
  • defenseHonorLossShare: 0 (src/gameplay/data/ranks.json);
  • PushNotifications.register() with no google-services.json in android/app;
  • the server-address block added to Settings → Advanced in every build (src/presentation/ui/settingsUi.ts).
 What was run.
  • npm ci --ignore-scripts and npm run build in scratch copies (the build passes; no .map files are produced).
  • The render and audio tests (66 pass).
  • tests/gameplay/balance (105 of 105 pass; the campaign fingerprint is current).
  • Multi-seed campaigns: 8 regular seeds and 6 casual seeds, through the model player's existing replicate option
    (evidence/gt/).
  • A Shadow Trials probe of tiers 1-66 against a fully researched bot army (evidence/gt/trials.out).
  • A seed-noise probe at Keeps 6, 10 and 15 (evidence/gt/luck.out).
  • npm run release:preflight: 22 open rows, 6 of them blocking.
  • curl of the live GitHub Pages site: legal pages return 200 with empty publisher facts, and no .map files are served.
  • The latest CI runs: green, but the signed-AAB job skipped all 16 of its steps and the production server job was
    skipped.
  • Playwright Chromium with touch emulation at 320×568, 360×640, 568×320, 640×360 and 844×390, in en, de,
    fi, ta and ar (evidence/shots/, evidence/ux-probes/). The double purchase (UX-01/ECO-01) was reproduced this
    way: sandbox purchase count 0 → 2 from two taps.
 What was not run.
  • Any phone, tablet or native build.
  • Any store sandbox purchase, refund or restore.
  • Postgres and Redis (TEST_DATABASE_URL/TEST_REDIS_URL were not set; the memory stores stood in).
  • A multi-instance server, the worker-thread timeout path with real workers, Sentry ingestion, a load test.
  • The full npm test, test:slow and balance:campaign on this commit.
  • Any human playtest.
 The balance numbers are model-player results with a fixed bot attack plan. No search for better attacks was done,
 so the true optimum may be stronger than measured.
 Confidence. Items marked "(inferred)" were reasoned from code and not reproduced. Labels from the earlier
 page-15 audit that could not be traced are mapped by best guess (section 1.1). Every work item starts with step 1
 of the loop, revalidation, because line numbers and behaviour drift.
 Relationship to earlier passes. This pass does not reopen findings that the closure records show as fixed and
 that the auditors re-checked as holding (see Appendix B). The open items of the 2026-11-20 security audit (X1, P4,
 F2, F3, L1, S5 nameKey) are carried here as SAV-12/SEC-05, SEC-12/ECO-07, SEC-10, SEC-11, SEC-13 and SEC-06.
 GLOBAL-001, 006 (markets), 007, 008, 015, 017 and R01-R10 stay open on owner, device and store evidence. Part
 C lists the steps.




Kagemura: Beast Mode Release Bulletproofing Pass (2026-11-21, commit 560ce7a)                                    Page 105

```
