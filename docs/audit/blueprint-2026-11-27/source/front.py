"""Cover, summary, Part A introduction, the phase 0 work table and the appendix."""
from engine import *  # noqa: F401,F403
from findings import META, FINDINGS, NOT_COVERED

HIGHS = [f['id'] for f in FINDINGS if f['sev'] in ('BLOCKER', 'HIGH') and f['id'] not in ('X-1', 'REPO-1', 'REPO-2')]
REOPENED = [('NAT-1', 'OPS-10'), ('NAT-2', 'F12'), ('NAT-5', 'F22'), ('NAT-6', 'F19'), ('DATA-1', 'P3-06'), ('REPO-8', 'quality 11')]

TOP5 = [
    ['1', '**Put the game in front of five strangers this week.** The web build is live at `jimhavlicekpersonal.github.io/ninja-version-of-game-1`; the protocol is already written in `docs/store/PLAYTEST.md`.', 'Owner', 'It is the only question no audit can answer, it needs no store account, and it costs about five hours.'],
    ['2', '**Decide whether the repository stays public, and protect `main`.** Today anyone can read the exploit notes and download build artifacts (REPO-2), and nothing stops work landing on a red build (REPO-1).', 'Owner', 'One decision and one setting. Both get more expensive the day a store build exists.'],
    ['3', '**Answer the eight pending decisions** (recommendations in C3), choose who publishes and the final bundle id, and open both store accounts.', 'Owner', 'They block eleven work items and the only BLOCKER; the accounts have waiting periods nobody can shorten.'],
    ['4', '**One integration session:** land the three stray branches (X-1), then fix the new HIGH code findings (%s).' % ', '.join(HIGHS), 'Code', 'Every list, including this one, describes a tree that is no longer where the work happens.'],
    ['5', '**Get one cheap Android phone** (2 to 3 GB of memory) and run twenty minutes of battles and a two-hour session on it.', 'Owner', 'The target device has never run the game, and several of the new findings (RUN-1, FUZ-2, NAT-2, NAT-3) are about exactly that kind of phone.'],
]


def front():
    s = []
    s += [Spacer(1, 30), Paragraph('Kagemura: Ninja Clans', title),
          Paragraph('Development blueprint: new findings, what is still open, and the plan from here', subtitle)]
    s += P('%s · audited commit `%s` (tip of `main`) · written for the owner. Coding sessions should work from '
           '`FINDINGS.md`, the machine-readable list beside this file.' % (META['date'], META['commit']), muted)
    s += Gap(4)
    s += callout('The verdict in four sentences', [
        'The engineering is strong and honest, and it is no longer what is holding the game back.',
        'In 26 days the project has produced about 1,500 commits, 50 languages and 54 recorded audit and fix passes; '
        'in the same 26 days not one stranger has played it, not one phone has run a release build, and none of the 35 '
        'owner steps or 8 owner decisions in your documents has been taken.',
        'A fresh scan through nine lenses the earlier audits did not use still found **%s new defects** (Part A), '
        'six of them in work an earlier pass had recorded as fixed or sound. That is the point: another audit will '
        'always find more, and none of them can tell you whether the game is fun.' % META['new_findings'],
        'The plan in Part C therefore ends every phase at a gate that only a person, a phone, a store or a player can open.',
    ])
    return s


def front_actions(rows):
    s = []
    s += H2('Do these five things first', toc=False)
    s += table(['#', 'Action', 'Who', 'Why this one'], rows, [0.04, 0.48, 0.08, 0.40])
    return s


def front_how():
    n = sum(1 for f in FINDINGS if f['proof'] == 'Re-checked')
    return Note('How this was made: your five documents and the repository\'s ledgers were read first, so that nothing here '
                'repeats them. Nine independent auditors then each took a lens no earlier pass had used. Every candidate was '
                'checked against your lists, and the lead reviewer re-read the code behind %d of the %s findings, including '
                'every HIGH. No phone, store, server or player was available. Method, baseline and limits are in the appendix.'
                % (n, META['new_findings']))


def front_method():
    s = []
    s += H2('How this document was made')
    s += UL([
        '**Read** all five documents you attached and the repository\'s own ledgers, so that nothing below repeats them.',
        '**Ran the baseline** on `main`: %s' % META['baseline'],
        '**Nine independent auditors**, each with a lens no earlier pass took: the native shells; the server\'s data layer on a real Postgres and Redis; its routes, probed one by one; a fuzzer against the simulation; a first-time player in a real browser; a long-session soak; translation quality and accessibility; time bombs; and the repository itself.',
        '**Each candidate was checked against your lists.** The lead reviewer then re-read the code behind %d of the %s findings, including every HIGH.' % (sum(1 for f in FINDINGS if f['proof'] == 'Re-checked'), META['new_findings']),
    ])
    s += Note('Limits: no phone, store sandbox, deployed server or player was available, as in every earlier pass. Three of the '
              'nine passes were cut short; the lead read their saved results and re-ran their main reproducers. Nothing in the '
              'game was changed. What was not reached is listed in the appendix.')
    return s


def part_a_intro():
    s = []
    s += Lead('Every finding here was checked against the five documents and the repository\'s audit trail before it was '
              'counted. **Reproduced** means a script, test, database or browser run showed it. **Read** means it was traced '
              'in the source and not run. **Re-checked** means the lead reviewer confirmed the auditor\'s evidence in the code.')
    s += callout('Six of these are in work that was recorded as fixed or sound', [
        ', '.join('%s (recorded as %s)' % (a, b) for a, b in REOPENED) + '.',
        'In each case the closing record was written from the code as read, and the check that would have caught it (a device, '
        'a real upload, a test that exercises the path) was never run. More audits of the same kind will keep producing this.',
    ])
    return s


def phase0_rows():
    return [
        ['0.1', '**Protect `main` and decide on visibility** (REPO-1, REPO-2): required checks before a merge; the repository private, or its audit trail and artifacts moved out.', 'Owner', 'A ruleset exists; the decision is in `docs/DECISIONS.md`.'],
        ['0.2', '**Land or park the three branches** (X-1). Fix the leaked tutorial timer first (X-2), merge the rules-10 branch, then rebase the two small branches and resolve the 53 translation conflicts once.', 'Code', '`main` contains or has explicitly dropped all three; CI green twice in a row.'],
        ['0.3', '**Fix the new HIGH code findings:** %s. FUZ-2 changes battle results, so it rides with the rules bump of 0.2.' % ', '.join(HIGHS), 'Code', 'Each has a fixing commit and a test that fails before it.'],
        ['0.4', '**Re-open the six items recorded as fixed that are not:** %s.' % ', '.join(a for a, _ in REOPENED), 'Code', 'The earlier closing records are corrected, not just the code.'],
        ['0.5', '**One register of open items** (REPO-8), generated from the ledgers: one line per item and who can close it. Stop appending to the 1,578-line audit file.', 'Code', '`docs/OPEN.md` exists and a test fails when it is stale.'],
        ['0.6', '**Record decisions D1 to D8** (recommendations in C3) and switch on what they unblock.', 'Owner', 'Eight entries in `docs/DECISIONS.md`.'],
        ['0.7', '**Feature freeze and pillars,** written into `CLAUDE.md`: until Gate 1 a session may only work on items in the register. Three pillars and one sentence for what the game should feel like (draft in the appendix).', 'Owner', 'Both are in the file every session reads first.'],
    ]


def appendix():
    s = []
    s += H1('Appendix')
    s += H2('Draft pillars, for the owner to edit')
    s += P('One sentence: **"Outwit a village in three minutes: scout it, blind it, strike where it is weak."**')
    s += UL([
        '**Cunning beats force.** Smoke, sabotage and the choice of entry point should decide more raids than army size.',
        '**Honest.** Nothing random is sold, bots are labelled, countdowns are real, a missed day costs nothing.',
        '**Anyone\'s phone.** Playable on a cheap Android on a poor connection, in the player\'s own language.',
    ])
    s += P('These are distilled from the invariants already in `CLAUDE.md`. Their use is to say no: a feature that serves '
           'none of the three waits.')
    s += front_method()
    s += H2('What this scan did not cover')
    s += P('Stated so that nobody reads silence as a pass.')
    s += UL(NOT_COVERED)
    s += H2('How to use the findings')
    s += UL([
        '`FINDINGS.md` beside this file lists every finding with the same fields (where, what happens, fix, how checked) in a form a coding session can parse.',
        'The rule the repository already has still applies: revalidate against the current code, write the failing test first, one finding per commit, and close it with the commit and the test.',
        'Findings marked **Read** deserve a reproduction before a fix. Findings about native code need a device before they are called closed.',
    ])
    return s
