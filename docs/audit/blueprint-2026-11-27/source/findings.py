"""New findings (Part A). One dict per finding; make_blueprint.py renders them and writes FINDINGS.md.

proof: 'Reproduced' (a script, test or browser run showed it), 'Read' (traced in source, not run),
       'Re-checked' (the lead reviewer confirmed the auditor's evidence independently).
"""

META = dict(date='2026-11-27', commit='4b79711', days='26', commits='1,536', per_day='67', langs='50', audits='54',
            new_findings='0')

LANES = [
    ('X', 'Integration and process', 'Found while establishing what "the game" currently is. These decide the order of everything else.'),
    ('SOAK', 'Long sessions and the installed web app', 'A cheap-phone profile (360x640, CPU slowed four times) cycled through panels and battles in headless Chromium against the production build. The owner\'s checklist asks for a two-hour memory graph; this is the first such run.'),
    ('FUZ', 'The simulation under a fuzzer', 'Seeded random and hostile commands through the same entry point the server replays, with invariants checked after every command.'),
    ('RUN', 'A first-time player in a real browser', 'A fresh browser profile at phone size, playing the public build as a newcomer and then abusing it.'),
    ('TIME', 'Time bombs and content integrity', 'Everything that works today and stops working on a date, a count or a long absence; and text that disagrees with the data.'),
    ('NAT', 'Native Android and iOS shells', 'A static read of the Capacitor shells, manifests and custom plugins. No native toolchain was available.'),
    ('DB', 'Server data layer and operations', 'Queries against indexes, table growth, jobs with several instances, shutdown and backups.'),
    ('API', 'Server routes, one by one', 'Authorisation, input limits, staff pages and identity flows, probed against a local server.'),
    ('LOC', 'Translation quality and accessibility', 'What the 50 languages actually say, and whether the screens work for players who see, hear or move differently.'),
    ('REPO', 'Repository and pipeline', 'Supply chain, licences, what CI really checks, and documentation drift.'),
]

X = [
    dict(id='X-1', sev='HIGH', lane='X', proof='Reproduced',
         title='Three unmerged lines of work have left `main`; two of them conflict in 53 files',
         where='`claude/gifted-darwin-xt5n6e` (20 commits, 325 files, +44,592 lines: battle rules 10, three buildings, two heroes and hero choice go live, plurals rewritten in 50 languages), `claude/relaxed-cori-mhvk90` (4 commits, 118 files: Jade batch buying, eight army strategies, 18 tutorial lessons), `claude/busy-hamilton-dfgic0` (1 commit: a new music engine). All branch from `main` 4b79711.',
         what='Every audit you supplied, and this one, describes `main`. The game being built is three other trees. A trial merge of the first two stops on 53 files (all 50 `locales/*/ui.json`, `docs/STATUS.md`, two more). The music branch says in its own commit message that a test "was already failing before this change". Fixes made on `main` now have to be carried to each branch, and the rules-10 branch changes what the server must accept ("deploy the server before the game").',
         fix='Phase 0, step 0.1: one integration session lands them in a fixed order (rules 10 first, then rebase the two small branches and resolve the translation conflicts once), or the owner parks them in writing. Until then no new branch.',
         checked='`git merge-tree --write-tree` on each pair (53 conflicted files for the first pair, 0 for the others); `git diff --shortstat origin/main...<branch>`; GitHub Actions runs 543 to 563.'),
    dict(id='X-2', sev='MEDIUM', lane='X', proof='Reproduced',
         title='A tutorial timer that is never stopped turns CI red at random',
         where='`src/presentation/ui/tutorial.ts:151-152` (a 400 ms `setInterval`, cleared only when the tutorial finishes); `tests/presentation/dom/hud.dom.test.ts:42-55` leaves it running.',
         what='When the timer fires after the test\'s page has been torn down, Vitest reports "ReferenceError: document is not defined" and exits 1 with every test file passing. That is how run 561 on the rules-10 branch failed (334 of 334 files passed); the next push went green without the cause being touched. `main` has identical code and the same exposure. In the game the same timer queries the page every 400 ms for as long as the tutorial is unfinished.',
         fix='Give `Tutorial` a `stop()` that clears the interval; call it from the test\'s `afterEach` and wherever the HUD is disposed; make `tick()` return early when there is no document.',
         checked='CI job log of run 45794462712 (all files passed, one unhandled error with this stack); `git diff origin/main <branch>` shows both files unchanged; the three tests that timed out in a loaded local run pass on an idle machine.'),
    dict(id='X-3', sev='MEDIUM', lane='X', proof='Reproduced',
         title='The evidence the Beast Mode prompt calls canonical is not in the repository',
         where='`docs/prompts/BEAST_MODE_2026-11-21.md` cites `docs/audit/bulletproof-2026-11-21/{ECO,SAV,SEC,STB,OPS,UX,GT}.md` and an `evidence/` folder; the folder holds only `PROGRESS.md`, on `main` and on every branch.',
         what='Rule 0.1 of that prompt tells sessions to read the lane report first and "do not fix what is listed as sound". Those lists of things verified sound, the probe scripts and the measurements exist nowhere, so each new pass re-derives them or re-opens settled ground. The same is true of the repro tests of the 2026-11-20 exploit audit ("kept in the session scratchpad").',
         fix='Recover the files from the session that wrote them if it still exists; otherwise delete the references and make it a rule that evidence a document cites is committed with it.',
         checked='`git ls-tree` of that folder on `main` and on the newest branch; `git log --all` for `ECO.md` finds nothing.'),
    dict(id='X-4', sev='MEDIUM', lane='X', proof='Reproduced',
         title='Every sentence lives in 50 files, so any two branches that touch text collide',
         where='`locales/*/ui.json` (50 files), rewritten by every commit that adds or changes a string.',
         what='The rule "new strings are translated into all 49 other languages in the same commit" makes parallel work impossible to merge cleanly (X-1 is the first instance) and puts 49 unreviewed machine translations of every experimental sentence into the tree before anyone knows whether the sentence will survive a playtest.',
         fix='Until Gate 1, change English only. A language is offered only while its pack is 100 % complete (`ready` in `locales/availability.json`), so the other 49 drop out of test builds until the next batch, which is the honest state of an unreviewed machine translation; or add a per-key English fallback. Translate in one batch per release candidate, on one branch.',
         checked='The 53-file conflict in X-1; the ledger\'s own note that new strings are "machine-written by the coding session, not native-reviewed".'),
]

SOUND_X = [
    'Baseline on `main`: 333 test files and 2,638 tests pass (5 expected failures; 19 skipped for a missing Postgres, Redis or IPv6); lint, the server type-check, the translation check, the bundle budget and both builds pass.',
]

from findings_repo_nat import REPO, NAT, SOUND_REPO_NAT  # noqa: E402
from findings_api import API, SOUND_API  # noqa: E402
from findings_time import TIME, SOUND_TIME  # noqa: E402
from findings_loc import LOC, SOUND_LOC  # noqa: E402
from findings_db import DB, SOUND_DB  # noqa: E402
try:
    from findings_late import SOAK, FUZ, RUN, SOUND_LATE  # noqa: E402
except ImportError:
    SOAK, FUZ, RUN, SOUND_LATE = [], [], [], []

FINDINGS = X + SOAK + FUZ + RUN + TIME + NAT + DB + API + LOC + REPO
SOUND = SOUND_X + SOUND_LATE + SOUND_TIME + SOUND_REPO_NAT[2:4] + SOUND_DB + SOUND_API + SOUND_LOC + SOUND_REPO_NAT[:2] + SOUND_REPO_NAT[4:]
META['new_findings'] = str(len(FINDINGS))
META['baseline'] = ('333 test files and 2,638 tests pass (5 expected failures and 19 skipped, all recorded); lint, the server '
                    'type-check, the translation check and both builds pass; the bundle is 633 of 645 KB; the store preflight lists 27 open items.')

NOT_COVERED = [
    '**The three unmerged branches.** Everything here describes `main` at 4b79711. Battle rules 10, the newly live buildings and heroes, the Jade batch buttons, the tutorial lessons and the new music were not audited.',
    '**Balance and pacing.** Deliberately left alone: your documents cover them at length and they need players, not another model.',
    '**Native code on a device.** Nothing was compiled or run; the sign-in bridge, the age-signal plugins and the StoreKit test configuration were not read.',
    '**The server at production scale.** Real row sizes, several instances on real infrastructure, sign-in with the real Apple and Google services, and the game\'s own networking client.',
    '**Forty of the fifty languages** were checked by script only. Audio (volume balance, mute switch, interruptions) and a full sweep of hand-built number and date formats were not done.',
    '**Art and sound keys** for every live item, the tutorial script against current data, and the path of a player who returns after a year with an old app.',
    '**The first-run pass was cut short.** Tutorial abuse at other steps, 320x568 and landscape, edit-mode gestures, text entry and the public pages were not reached.',
    '**The fuzzer rarely reached** cancel, skip, top-up, task, tier and stipend commands, and did not run clocks going backwards beyond one check. Nothing was fuzzed over HTTP.',
    '**Not run in the soak:** storage quota, a slow or lossy network during boot, a half-uploaded deploy, and a soak on the high-quality profile.',
]
