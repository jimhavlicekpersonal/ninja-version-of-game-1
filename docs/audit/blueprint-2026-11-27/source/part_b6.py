"""Part B6: the project measured against 'Why Games Fail From Within'."""
from engine import *  # noqa: F401,F403


def part_b6(m):
    """m: dict of measured project numbers (filled by make_blueprint.py)."""
    s = []
    s += H2('B6. Why Games Fail From Within: the document nobody applied')
    s += P('The Beast Mode pass drew on the checklist, the Masterclass and page 15. This fourth document was not used by any '
           'pass, and nothing in the repository mentions a pre-mortem, design pillars or a definition of done. It is about the '
           'project rather than the product, so here it is applied to the project.')
    s += stat_tiles([
        (m['days'], 'days since the first commit (2026-11-01)'),
        (m['commits'], 'commits on `main` in its first 23 days: %s a day' % m['per_day']),
        (m['langs'], 'languages, all machine-translated'),
        (m['audits'], 'audit and fix passes recorded'),
        ('0', 'strangers who have played; phones that have run it; store purchases made'),
    ])
    s += H3('The 30 red flags')
    s += P('"Three or more is a conversation; six or more is a stop-and-reassess." Thirteen are plainly true today:')
    s += table(['Red flag', 'Evidence'], [
        ['Nobody outside the team has played the game in the last month', 'The playtest table is empty. Nobody has, ever.'],
        ['You are polishing something no stranger has tested', 'Text size, shake settings, 50 languages, composed music, walk frames: all before a first playtest.'],
        ['The feature list has grown every month and nothing has been cut', 'No cut list exists. In the last three days three branches added music, lessons, army strategies, Jade batch buying, hero choice and three new buildings while 62 audit items stayed open.'],
        ['The best idea of the week keeps replacing the plan', 'Same three branches. None of them is in the order of work of any audit you supplied.'],
        ['The same design argument has been reopened more than twice', 'Does defense matter, and how much may casual players lose: raised 2026-11-08, 11-16, 11-20 and 11-21; still decisions D2 and D3.'],
        ['Tests fail randomly and everyone ignores them', '`main` was red 43 % of the time while work kept landing (REPO-1); a leaked timer fails CI at random (X-2); one branch\'s commit message notes a test "was already failing before this change".'],
        ['Open bugs increase every week', '97 items on 11-21, 33 more on 11-24, %s more in this document.' % m['new_findings']],
        ['The team avoids a particular topic', 'The 35 owner and device steps. Each pass rewrites them more carefully and none has been started.'],
        ['Only one person understands a critical system', 'Worse: no person does. Knowledge lives in briefs for coding sessions. Every account, key and decision will rest on one owner.'],
        ['The plan depends on everything going right', 'The stated goal is a worldwide release in 50 languages at once.'],
        ['You cannot say what evidence would make you stop', 'The kill lines in the soft-launch plan are blank owner cells.'],
        ['Nobody can say what was cut and why', 'Nothing was cut.'],
        ['Your plan has no buffer', 'There is no dated plan.'],
    ], [0.42, 0.58])
    s += Note('Not true, and worth saying: the build is playable every day, small changes are fast and safe, quality is not '
              'postponed, bad news is written down plainly, and the honesty rules (no paid randomness, labelled bots, real '
              'countdowns) are unusually strong. The project fails this document on evidence, not on craft.')
    s += H3('The ten-minute health audit')
    s += table(['Area', 'Question', 'Score', 'Why'], [
        ['Core loop', 'Do strangers choose to replay it unprompted?', '1', 'Unknown is a failing score: it has never been asked.'],
        ['Vision', 'Can everyone state the pillars the same way?', '2', 'No pillars are written. The invariants in `CLAUDE.md` come close.'],
        ['Scope', 'Does the plan fit your worst month, with buffer?', '2', 'No plan; scope is "everything, everywhere".'],
        ['Build health', 'Is there a playable build from today?', '3', '`main` is green and deployed today, but was red 43 % of the last three weeks, and three branches have left it.'],
        ['Quality', 'Is the bug trend flat or falling?', '3', 'Each audit finds as many as the last one closed.'],
        ['Technical health', 'A small change, safely, in under an hour?', '4', 'Yes, unless it changes a sentence (50 files).'],
        ['Feedback loop', 'Is every playtest finding resolved with a decision?', '1', 'There are no playtest findings.'],
        ['Decision discipline', 'Written tripwires and kill criteria?', '2', 'Templates exist; the cells are blank; D1 to D8 pending.'],
    ], [0.17, 0.36, 0.07, 0.40])
    s += Note('"Any 1 or 2 is your next sprint." Team health and personal sustainability are yours to score.')
    s += H3('Which failure modes these are')
    s += UL([
        '**Unproven core loop** and **the "it will click later" story.** Content, languages and balance passes are being built on a loop no stranger has judged.',
        '**Expert blindness in tuning.** All pacing and balance numbers come from model players written by the same sessions that write the game. The models are careful; they are still the maker judging the maker\'s game.',
        '**Avoiding the hard part.** For a solo developer directing AI sessions, the hard part is the part the sessions cannot do. It is the only part not moving.',
        '**Late integration.** New in the last three days: parallel lines of work that conflict in 53 files (finding X-1).',
        '**Perfectionism and the polish trap.** Each audit is honest and each fix is real, which is exactly what makes the loop comfortable.',
    ])
    return s
