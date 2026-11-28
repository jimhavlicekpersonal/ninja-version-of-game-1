"""Part C of the blueprint: the plan."""
from engine import *  # noqa: F401,F403

PHASES = [
    ('0  Stop the line', 0, 1, 'Gate 0'),
    ('1  First contact', 0, 2, 'Gate 1: 5 strangers, 3 phones'),
    ('2  Become a publisher', 0, 5, 'Gate 2: signed builds, real purchases'),
    ('3  Closed beta', 5, 9, 'Gate 3: crash-free, retention'),
    ('4  Soft launch', 9, 15, 'Gate 4: two markets hold'),
    ('5  Worldwide, in waves', 15, 20, 'continues'),
]


def part_c(phase0_rows):
    s = []
    s += H1('Part C. The blueprint')
    s += Lead('One rule organises everything below: **each phase ends at a gate that only a person, a phone, a store or a '
              'player can open.** Code work is limited to what the next gate needs. That reverses the last four weeks, in '
              'which code moved at about 60 commits a day and the evidence columns stayed blank.')
    s += [Roadmap(PHASES, 20), Spacer(1, 4)]
    s += Note('Weeks from today. Phases 0 to 2 overlap because their work belongs to different hands: a coding session, '
              'the owner with five strangers, and the owner with the stores. The length of phase 2 is set by account '
              'approval, not by effort: start it on day one.')

    # ------------------------------------------------------------------ C1
    s += H2('C1. Phase 0: stop the line (this week, mostly code)')
    s += P('**Goal:** one tree, one list, no new surface. Nothing in this phase is new functionality.')
    s += table(['#', 'Work', 'Who', 'Done when'], phase0_rows, [0.05, 0.52, 0.10, 0.33])
    s += P('**Gate 0:** `main` is the only line of work, it is green, the new HIGH findings are closed with tests, '
           'and D1 to D8 are written down.')

    # ------------------------------------------------------------------ C2
    s += H2('C2. Phase 1: first contact (weeks 0 to 2, about ten hours of the owner\'s time)')
    s += P('**Goal:** the first evidence that the game is understood and wanted, and that it runs on the phone it is aimed '
           'at. This needs no store account: the web build is already live on GitHub Pages and CI already produces a debug '
           'Android app.')
    s += table(['#', 'Work', 'Who', 'Done when'], [
        ['1.1', 'Silent playtest with **five strangers**, 30 minutes each, on their own phones, with the protocol already in `docs/store/PLAYTEST.md`. Not friends, not family, at least one who rarely plays games.', 'Owner', 'Five rows in the PLAYTEST table: stalls, tutorial finished or not, would return or not.'],
        ['1.2', '**Three phones, not twenty:** the cheapest Android you can borrow or buy (2 to 3 GB of memory, Android 10 to 12), a Pixel 7, an iPhone. Cold start ten times, twenty minutes of battles back to back, a two-hour session, a phone call mid-battle, airplane mode mid-raid, low storage.', 'Owner', 'Three rows in the DEVICE_MATRIX table with start times, frame rate, memory and what broke.'],
        ['1.3', 'Fix what those two runs found, and nothing else. A stall seen by two players is a defect.', 'Code', 'Each stall has a commit or a written decision not to fix it.'],
        ['1.4', 'If fewer than four of five finished the tutorial unaided: rework the first ten minutes and repeat 1.1 with five **new** strangers.', 'Both', 'Gate 1 met, or the stop rule in C6 applies.'],
    ], [0.05, 0.57, 0.08, 0.30])
    s += callout('Gate 1 (starting values; change them once, in writing, before the run)', [
        '- At least 4 of 5 strangers finish the tutorial with no help, and at least 3 of 5 can say afterwards what the game is about and say they would open it tomorrow.',
        '- Nobody loses progress, hits a dead end or sees a crash.',
        '- On the cheap Android: the village appears within 8 seconds of a cold start, a battle holds 30 frames a second at the median, and twenty minutes of battles end without a reload card or the app being killed.',
        'If the gate fails twice, stop adding anything and read C6.',
    ])

    # ------------------------------------------------------------------ C3
    s += H2('C3. The eight owner decisions: recommended answers')
    s += P('These have been pending since 2026-11-21 and block eleven work items. Recommendations, with the reason in one line each. '
           'They are yours to overrule; what matters is that each is written into `docs/DECISIONS.md` this week.')
    s += table(['#', 'Decision', 'Recommendation', 'Reason'], [
        ['D8', 'Require server-held villages for ranked play: at launch, or after a migration window?', '**On from the first public build.**', 'A migration window protects existing players. There are none. This closes the only BLOCKER.'],
        ['D7', 'Crash reports: opt-in in Settings, or ask at first launch?', '**Ask adults once at first launch;** stay off for minors. Use Play vitals and Xcode Organizer as the release gate.', 'A switch nobody finds gives a sample too small and too biased to compute a crash-free rate.'],
        ['D2', 'Honor: should a lost defense cost honor; should wins against generated bases earn it?', '**Lose honor on defense only from the upper leagues up; generated-base wins earn a reduced share.**', 'Makes defense matter where competitive players are, without adding loss for casual players (who already lose too much, D3).'],
        ['D3', 'How much of their loot may casual players lose to raids?', '**At most half, enforced by a campaign gate;** cap simulated raids by sessions played.', 'Today the model casual player loses roughly what they loot. That is a quit reason at exactly the day-7 to day-30 window.'],
        ['D4', 'A duplicate Season Scroll receipt: refund, or credit?', '**Credit it to the next season and say so; offer the store\'s refund sheet on request.**', 'You cannot issue an App Store refund yourself; a visible credit is exactly-once and honest.'],
        ['D1', 'How far back may an idle device village date a windowed claim?', '**Keep 12 hours until D8 is on, then require server contact.**', 'With server-held villages the question disappears for ranked rewards.'],
        ['D6', 'Under-18 monthly cap: count in catalog USD or local money?', '**Catalog USD.**', 'Predictable, already built, and stricter than local money in most low-price markets.'],
        ['D5', 'Certificate pinning?', '**No** (already the recorded default).', 'Pinning a host you do not operate turns a routine certificate change into an outage.'],
    ], [0.05, 0.30, 0.31, 0.34])

    # ------------------------------------------------------------------ C4
    s += H2('C4. Phase 2: become a publisher (weeks 0 to 5, owner)')
    s += P('**Goal:** a signed build in each store\'s test track, bought from with a real sandbox account, talking to a staging '
           'server that has been load-tested and rolled back once. Start the account steps today; several have waiting '
           'periods you do not control.')
    s += table(['#', 'Work', 'Done when'], [
        ['2.1', 'Decide who publishes (you or a company), check the name "Kagemura" for trademark and store conflicts, and **choose the final bundle id before any upload**. Google Play never lets it change.', '`APP_ID` set; preflight stops warning about `com.toadstoolkingdoms.app`.'],
        ['2.2', 'Apple Developer Program and Google Play Console accounts. A new personal Play account must run a closed test with at least 12 testers for 14 days before production access; a company Apple account needs a D-U-N-S number. Recheck both rules on the day.', 'Both consoles open; tax and payee forms accepted.'],
        ['2.3', 'A domain and a support address; fill every field of `public/legal-config.js`; a lawyer reads the privacy policy and terms for the **soft-launch markets only**.', 'Live privacy, terms and support pages with no "not published yet" text.'],
        ['2.4', 'Hosting: a staging and a production server with Postgres, backups to a bucket you own, the Sentry projects, a metrics scrape and one phone that rings.', 'A test alert reaches the phone; a restore drill is timed.'],
        ['2.5', 'Create the 13 products in both stores. First signed Android bundle to the internal track; first TestFlight build.', 'Both builds installed from the store on a phone.'],
        ['2.6', 'On those builds: buy, cancel, pending, restore and refund every product type; the save, kill, reinstall, restore and two-device round trip; a forced crash that shows TypeScript line numbers.', 'The "Native checks" log in `docs/store/TESTING.md` is filled.'],
        ['2.7', 'Staging: the contract tests, the load test at ten times the expected launch traffic, one rollback and one hotfix rehearsal. From the load test, **compute the server cost per 1,000 daily players** (no document has this number).', 'Numbers recorded in `docs/SHIPPING.md`; rollback time and cost per 1,000 written down.'],
    ], [0.05, 0.62, 0.33])
    s += P('**Gate 2:** `npm run release:preflight` reports nothing open, and Go/No-Go lines 2, 3, 4, 13 to 16, 19 and 20 are a yes.')

    # ------------------------------------------------------------------ C5
    s += H2('C5. Phases 3 to 5: beta, soft launch, the world')
    s += table(['Phase', 'What happens', 'Gate to leave it'], [
        ['3 Closed beta (weeks 5 to 9)', 'Play closed test (12 or more testers for 14 days) and 20 to 50 TestFlight strangers recruited from strategy-game communities. The device matrix on the testers\' own phones. **One red-team week:** two or three genre veterans are asked to break the economy on staging. First comparison of the armies players actually use with the ones the model predicted. Native review of the soft-launch languages only.', 'Crash-free sessions at or above 99.5 % in the store consoles. Tutorial completion at or above 80 %. Day-1 return at or above 35 % and day-7 at or above 12 % (small sample: read the direction). No unrecovered save loss. No exploit open above MEDIUM.'],
        ['4 Soft launch (weeks 9 to 15)', 'Two markets: one cheap-Android market that plays in English and one higher-spend English market. Fill in the kill lines already drafted in `docs/store/SOFT_LAUNCH.md`. A balance patch every two weeks with published notes. No paid installs until the gates have held for two weeks; then a small paid test to learn the cost of an install.', 'Day-1 at or above 35 %, day-7 at or above 12 %, day-30 at or above 4 %; crash-free at or above 99.5 %; payer conversion and refund rate measured; server cost per player below revenue per player.'],
        ['5 Worldwide (week 15 on)', 'Markets open in waves. A market joins a wave when its language has been read by a native speaker, its legal pages are ready and its store prices have been seen on a phone. Built-but-not-live content becomes the first seasons of live operations rather than launch scope.', 'Per wave: the same four numbers as the soft launch, by country.'],
    ], [0.17, 0.50, 0.33])
    return s


def part_c_rules():
    s = []
    # ------------------------------------------------------------------ C6
    s += H2('C6. Scope, stop rules and tripwires')
    s += H3('Cut list (write it into the repository so every session reads it)')
    s += UL([
        '**Languages.** Keep the 50 packs, but iterate in English until Gate 1. Every changed sentence currently costs 49 machine translations and a 50-file merge conflict with any parallel branch (X-4). Translate in one batch per release candidate. Claim a language in a store listing only after a native speaker has read it.',
        '**Content.** The built-but-not-live buildings and heroes stay parked until soft-launch data exists. They answer the "thin runway after Keep 15" problem better as a season schedule than as launch scope.',
        '**Audits.** No further broad audit before Gate 1. Four weeks of audits have found real defects each time and will keep doing so; none of them can answer whether a stranger enjoys the first ten minutes.',
        '**Parallel sessions.** One integration queue. At most one open branch may change `locales/` or bump `SIM_RULES` at a time.',
        '**Worldwide on day one.** Dropped in favour of waves (C5).',
    ])
    s += H3('Tripwires (check every Friday; each has a fixed response)')
    s += table(['Signal', 'Threshold', 'Response'], [
        ['Days since a stranger last played', 'More than 14', 'No feature or balance work until five more have.'],
        ['`main` red', 'More than 24 hours', 'Stop the line: nothing else merges.'],
        ['Unmerged branches', 'Any older than 3 days, or two touching `locales/` or `SIM_RULES`', 'Merge or delete before new work starts.'],
        ['Open items in the register', 'Rises two weeks running', 'Bug week: no new surface.'],
        ['Owner steps', 'No evidence cell filled in 7 days', 'The next coding session is cancelled in favour of an owner step.'],
        ['A design question reopened', 'A third time', 'The owner decides in `docs/DECISIONS.md`; it is closed for 30 days.'],
        ['A fix that needed its own fix', 'Twice in one lane', 'That lane gets a test harness before another read-through.'],
    ], [0.30, 0.28, 0.42])
    s += H3('Stop rule')
    s += P('If two rounds of first-hour changes do not get four of five strangers through the tutorial and wanting to return, '
           'do not add content, languages or systems. Strip the first session back to scout, deploy, win, and rebuild from '
           'there. If a soft-launch market stays under 25 % day-1 return after two such iterations, pause spending and '
           'decide between changing the core loop and stopping. Write this down now, while it costs nothing to agree to.')

    # ------------------------------------------------------------------ C7
    s += H2('C7. What it costs')
    s += table(['Item', 'Rough cost', 'Note'], [
        ['Owner time, phases 0 to 2', '40 to 60 hours over five weeks', 'Playtests, three phones, accounts, legal facts, store products, sandbox runs.'],
        ['Apple Developer Program', 'US$99 a year', ''],
        ['Google Play Console', 'US$25 once', ''],
        ['A cheap Android test phone', 'US$60 to 100 used', 'The single most informative purchase on this list.'],
        ['Domain and support mailbox', 'US$20 to 80 a year', ''],
        ['Hosting, staging and production', 'Unknown until measured', 'Step 2.7 produces the number.'],
        ['Legal review, soft-launch markets', 'Varies widely', 'Get a fixed quote for two markets, not fifty.'],
        ['Native review per language', 'Varies', 'Only for languages entering a wave.'],
    ], [0.36, 0.26, 0.38])
    s += Note('Prices are the publicly listed programme fees as far as I know and rough market ranges; confirm each before paying.')
    return s
