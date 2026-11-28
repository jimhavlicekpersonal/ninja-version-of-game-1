"""Part B of the blueprint: what is still open from the five supplied documents."""
from engine import *  # noqa: F401,F403

LEDGER_SERIES = [('Done', '#257de0'), ('Partial', '#f47230'), ('Blocked on owner', '#00b894'),
                 ('Blocked on a device', '#f2a600'), ('Open', '#ee7fac')]
LEDGER_ROWS = [
    ('Money (ECO)', [4, 4, 1, 0, 1]),
    ('Security (SEC)', [7, 9, 1, 0, 0]),
    ('Saves, network (SAV)', [7, 6, 1, 2, 0]),
    ('Stability (STB)', [2, 8, 1, 1, 0]),
    ('Release (OPS)', [4, 10, 0, 0, 0]),
    ('Screens (UX)', [8, 2, 0, 1, 0]),
    ('Balance (GT)', [3, 12, 2, 0, 0]),
]
WAITING = [
    ('An owner decision, account or setting', 24),
    ('A run on a real phone', 19),
    ('More code or design work', 13),
    ('A staging server or Postgres run', 3),
    ('Real players (telemetry, playtest)', 3),
]


def part_b():
    s = []
    s += H1('Part B. What is still open from your five documents')
    s += Lead('Short version: the code-side work in these documents is largely done. What is left is almost entirely the '
              'part no coding session can do. One of the five documents, **Why Games Fail From Within**, was never '
              'applied to the project at all, and it is the one that describes the project\'s real risk.')

    # ---- B1
    s += H2('B1. Exploit, economy and strategy audit (2026-11-20)')
    s += P('All 14 exploits and the 4 low items were fixed with regression tests in commit `37c1b59` and checked again by '
           'the later passes. Four fixes carry a stated residue, and the three strategy problems were only partly '
           'answered by later balance work.')
    s += table(['Item', 'Status today', 'What is still open'], [
        ['Exploits 1-6, 8, 9, 11-14; L1, L3', 'Fixed', 'Nothing recorded. The simulation fuzzer in Part A re-attacked the same command surface.'],
        ['7. Loot from a planted alt base', 'Fixed (capped)', 'An alt can still feed generated-base amounts. Bounded by the per-pair daily cap (GT-17); needs telemetry to see whether anyone does it.'],
        ['10. Gang War chest without fighting', 'Fixed', 'Two alt Gangs that attack each other still earn a chest (3-15 Jade per war). Accepted, not closed.'],
        ['L2. Referral Jade from alt accounts', 'Reduced', 'Device and install ids are still client-sent; there is no store-account signal. A 14-day wait is the only brake.'],
        ['L4. Client-chosen battle seeds', 'Fixed', 'A client can still pick among a window of up to 256 seeds. No gain was measured over 40 seeds.'],
        ['S1. Defense does not matter', 'Partly answered', 'Held raids rose (GT-05), but honor is still never lost on defense. Waits on owner decision D2.'],
        ['S2. One army wins', 'Partly answered', 'Rules 9 narrowed the gaps on `main`; rules 10 with the first counters is on an unmerged branch with failing tests (finding X-1).'],
        ['S3. Casual players punished; timers; non-choices', 'Open', 'Waits on owner decision D3 (how much loot casual players may lose). Builder pricing and stipend value were never revisited.'],
    ], [0.27, 0.15, 0.58])

    # ---- B2
    s += H2('B2. Beast Mode bulletproofing pass (2026-11-21, 97 work items)')
    s += P('Status of the 97 work items in the repository ledger (`docs/audit/bulletproof-2026-11-21/PROGRESS.md`) at '
           '`main` 4b79711. "Partial" means the code part is done and something else is not.')
    s += [StackedBars(LEDGER_SERIES, LEDGER_ROWS), Spacer(1, 4)]
    s += Note('Items per lane. Totals: 35 done, 51 partial, 6 blocked on an owner decision, 4 blocked on a device, 1 open.')
    s += H3('What the 62 unfinished items are waiting for')
    s += [Bars(WAITING), Spacer(1, 3)]
    s += Note('Primary blocker of each unfinished item, read from the ledger notes. 49 of 62 wait on something only a person, '
              'a phone, a store or a server can provide.')
    s += P('The follow-up re-audit of 2026-11-24 found 33 more defects in the same lanes (among them that `main` had not '
           'deployed for three days and the Android workflow was invalid). 31 are fixed on `main`; the last two '
           '(N24-UX-3 select text, N24-UX-4 plural forms) are fixed only on the unmerged branch.')
    s += H3('Still open at severity HIGH or above')
    s += table(['ID', 'Sev', 'What it is', 'What is missing'], [
        ['SEC-01', 'BLOCKER', 'Device-held villages are trusted in ranked play', 'Switch `REQUIRE_SERVER_VILLAGE` on (decision D8) and run its Postgres path.'],
        ['ECO-05', 'HIGH', 'Store prices and every purchase path unverified', 'A real sandbox purchase, cancel, restore and refund on both stores.'],
        ['STB-11', 'HIGH', 'No device evidence for stability or performance', 'A 2 GB Android and an older iPhone: memory, renderer kill, 12 h background.'],
        ['GT-01', 'HIGH', 'Honor is not zero-sum', 'Decision D2.'],
        ['GT-06', 'HIGH', 'Casual players lose about what they loot', 'Decision D3.'],
        ['GT-02 to GT-05', 'HIGH', 'Early dip, Air family, tier order, late defense', 'Gates still failing or marked expected-fail; rules 10 is the answer and is not merged.'],
        ['OPS-01, OPS-02, OPS-03', 'HIGH', 'Version identity, source maps, Android renderer death', 'First store version and tag, a staging crash showing TypeScript lines, a device kill test.'],
        ['STB-01, STB-02, STB-04', 'HIGH', 'Push crash loop, release ids, renderer death', 'Ten launches of a debug APK on a phone; the same staging and device runs as above.'],
    ], [0.15, 0.10, 0.36, 0.39], sev_col=1)
    s += H3('The eight owner decisions (section 2.9): none is recorded')
    s += P('`docs/DECISIONS.md` lists D1 to D8 as pending. They block 11 work items, including the only BLOCKER. '
           'Recommended answers are in Part C, section C3.')
    s += H3('The 35 owner and device steps (Part C of that document): none is done')
    s += table(['Evidence in the repository today', 'State'], [
        ['`public/legal-config.js`: publisher, address, support email, deletion URL, governing law, retention', 'Every field empty'],
        ['`docs/store/PLAYTEST.md` results table', 'Empty: no stranger has played'],
        ['`docs/store/DEVICE_MATRIX.md` results table', 'Empty: no phone has run a release build'],
        ['`docs/store/OWNER_CHECKLIST.md`', '0 boxes ticked'],
        ['Bundle id (`APP_ID`)', 'Not set; a signed build would upload under the old `com.toadstoolkingdoms.app`, which Google Play never lets you change'],
        ['`tools/release/last-release.json`', '`released: false`; no `v*` tag exists'],
        ['`npm run release:preflight`', '27 items still open for a store build'],
    ], [0.62, 0.38])

    # ---- B3
    s += H2('B3. Release Bulletproofing Audit, page 15 (the order of work)')
    s += table(['Step on that page', 'Status today'], [
        ['1. Money and input safety (E-1, I-1, I-2, I-4, E-2)', 'Done in code (ECO-01/UX-01, UX-02, UX-03, UX-09, ECO-02). No store sandbox run.'],
        ['2. Integrity (S-1, R-1, S-2, G-1)', 'Code done; S-1 is switched off until decision D8. Late-report detection is live.'],
        ['3. See crashes (O-1, O-2, session envelopes, E-3)', 'Code done. Not one real crash report has been seen with readable lines.'],
        ['4. Release machinery (R-2, R-3, R-4, runbooks)', 'Code and documents done. Rollback and hotfix never rehearsed; no pager route.'],
        ['5. Polish and accessibility (N-A, A-1 to A-4, I-3, S-3, S-4, N-B, D-3)', 'Done in Chromium. Phone font scale, Control Center and audio interruption not run.'],
        ['6. Balance (D-1, D-2, Air, tiers, Keep 15 gate, multi-seed, Jade model, D-4 to D-6)', 'Partly done. Multi-seed campaigns exist; a Jade model for paying players does not; D-1 and D-2 wait on the owner.'],
        ['Owner and device work (legal config, bundle id, signed builds, staging load test at 10x, device matrix, Sentry, support, playtest, soft-launch plan, native review)', '**None started.** The templates and protocols for each were written; every results cell is blank.'],
        ['17h methods listed as missing: human or min-maxer playtest, red-team session against a live server, telemetry against the model', 'Still missing. Nothing in the repository mentions a red-team or min-maxer session.'],
    ], [0.52, 0.48])

    # ---- B4
    s += H2('B4. Game Release Bulletproofing Checklist (17 sections)')
    s += P('Scored against today\'s code and evidence. "Code" is what a coding session can prove; "Evidence" is what the '
           'checklist actually asks for. The last column lists checklist lines that no earlier document turned into a work item.')
    s += table(['Section', 'Code', 'Evidence', 'Lines nobody picked up'], [
        ['1 Crashes and stability', 'Strong', 'None', '"Play 2+ hours and watch the memory graph": the first such run is in Part A (one leak, SOAK-1; otherwise flat over 74 minutes). No thermal run on a named phone.'],
        ['2 Saves and progression', 'Strong', 'None', 'Reinstall and restore; two-device conflict on real hardware.'],
        ['3 Economy and monetization', 'Strong', 'None', 'A supply and sink model for a paying player (ECO-03). Local-currency display has never been seen on a storefront.'],
        ['3b Onboarding and retention', 'Unknown', 'None', 'The first 60 seconds with a stranger. There is no way to compute day-1 retention before a store cohort exists.'],
        ['4 Input and controls', 'Good', 'Emulated', 'Palm and third-finger touches. Fast repeated taps were tried in Part A and held, except RUN-4.'],
        ['5 Performance', 'Budgeted', 'None', 'Battery per hour, shader and GC stutter, release-build profile on the worst phone.'],
        ['6 Networking', 'Good', 'None', 'Load test at 10x never run. Auto-scaling and a spending alert appear only as an owner line.'],
        ['7 Security and cheating', 'Strong', 'Local', 'A red-team session against a deployed server.'],
        ['8 Content and design', 'Modelled', 'None', 'Solvability is proven by a bot for Trials only; difficulty spikes are charted from model players, not people.'],
        ['9 Audio and polish', 'Fair', 'None', 'Mute switch, Bluetooth, ducking, volume balance by ear. The new music on the unmerged branch has never been heard on a phone.'],
        ['10 UI and UX', 'Good', 'Emulated', 'A dialog that cannot be answered at 360x640 (RUN-1); contrast and keyboard gaps (A11Y-1, A11Y-2).'],
        ['11 Localization and accessibility', 'Coverage only', 'None', 'One-handed play is mentioned nowhere. No native speaker has read any of the 49 translations.'],
        ['12 Store compliance', 'Prepared', 'None', 'Everything here is an owner step.'],
        ['13 Build and release', 'Good', 'Web only', 'Signing-key backup (no key exists yet); hotfix rehearsal.'],
        ['14 Analytics', 'Opt-in adults', 'None', 'Whether funnel events fire in a release build; the sample is opt-in, so store consoles are the real source.'],
        ['15 Real-world testing', 'n/a', 'None', 'All of it.'],
        ['16 Launch-day readiness', 'Documents', 'None', 'Support address, community channel, on-call, day-0 patch.'],
        ['17 Game theory', 'Deep modelling', 'None', 'Min-maxer playtest, observed-versus-designed strategy, a published patch cadence.'],
    ], [0.21, 0.12, 0.10, 0.57])

    # ---- B5
    s += H2('B5. Masterclass: the final Go / No-Go gate')
    s += P('"Every line must be a yes, or have a named owner and an accepted risk. A blank is a no." Today:')
    s += table(['Gate line', 'Today', 'Why'], [
        ['Crash-free sessions at or above 99.5 % in beta, symbolicated', 'No', 'No beta, no cohort, no crash report seen.'],
        ['Save, kill, reinstall, restore, cloud-sync round trip on two devices', 'No', 'Never run on a device.'],
        ['Every purchase path tested with a real transaction', 'No', 'No store products exist yet.'],
        ['Receipts validated server-side, rewards granted exactly once', 'Code yes', 'Sandbox refund and replay not run.'],
        ['Release build on the oldest supported device, stable frame pacing', 'No', 'No device run.'],
        ['First-run flow tested by five strangers with no help', 'No', 'Zero strangers.'],
        ['Economy spreadsheet and simulation reviewed', 'Partly', 'Model players only; no paying-player model; D3 pending.'],
        ['Solver or bot verified that all content is completable', 'Partly', 'Trials ladder only, with known gaps.'],
        ['No dominant strategy above threshold', 'No', 'One army still wins at Keep 15 on `main`.'],
        ['Network failure, offline and server-down paths recoverable', 'Code yes', 'Emulated only.'],
        ['Privacy policy, consent, data safety, age rating match behaviour', 'No', 'Publisher facts empty; forms not filed.'],
        ['Store metadata, screenshots, review notes complete', 'No', 'No listing exists.'],
        ['Debug menus and test keys removed or gated', 'Yes', 'Sandbox and debug are query-gated and never online.'],
        ['Kill switches and flags tested in production configuration', 'No', 'No production exists.'],
        ['Hotfix rehearsal done, day-0 patch ready', 'No', 'Never rehearsed.'],
        ['Dashboards, alerts and on-call owner for launch week', 'No', 'Rules written; nothing scrapes; nobody is on call.'],
        ['Retention gates defined, soft-launch data meets them', 'No', 'Template only.'],
        ['Support channels, canned responses, known-issues list', 'No', 'Support email is empty.'],
        ['Signing keys and credentials backed up in two places', 'No', 'No keys exist.'],
        ['Written rollback plan read by someone other than its author', 'No', 'Written; unread and unrehearsed.'],
    ], [0.50, 0.11, 0.39])
    s += Note('One yes, two "yes in code", two partial, fifteen no. None of the fifteen can be turned by writing code.')
    return s
