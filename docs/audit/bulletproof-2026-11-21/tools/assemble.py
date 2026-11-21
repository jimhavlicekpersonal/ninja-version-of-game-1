"""Assemble BEAST_MODE_2026-11-21.md from front.md and the seven lane reports."""
import re
import sys
from pathlib import Path

S = Path(sys.argv[1])          # scratchpad
OUT = Path(sys.argv[2])        # output .md
F = S / 'findings'
LANES = [
    ('ECO', 'Economy, monetization and real-money integrity'),
    ('SEC', 'Security, cheating and server readiness'),
    ('SAV', 'Save data, progression and client networking'),
    ('STB', 'Crashes, stability, memory, lifecycle and performance'),
    ('OPS', 'Store compliance, release pipeline, observability, launch and live ops'),
    ('UX', 'Input, audio and visual polish, UI/UX, accessibility, localization'),
    ('GT', 'Content, game design, game theory and strategy'),
]
PHASE = {}
for ph, ids in {
    1: 'ECO-01 UX-01 ECO-02 SEC-03 UX-03 UX-02 UX-09 ECO-08 ECO-10 ECO-09 ECO-06',
    2: 'SEC-01 GT-01 SEC-02 SEC-04 SEC-12 ECO-07 SEC-17 SEC-15 SEC-13 SEC-06 SEC-07 SEC-14 SEC-10 SEC-16 SAV-12 SEC-05',
    3: 'SAV-01 SAV-02 SAV-03 SAV-04 SAV-05 SAV-07 SAV-06 SAV-10 SAV-11 SAV-13 SAV-09 SAV-14',
    4: 'STB-01 STB-03 OPS-02 STB-02 OPS-03 STB-04 STB-05 OPS-08 STB-06 OPS-06 OPS-07',
    5: 'OPS-01 SAV-08 OPS-05 SEC-09 OPS-04 OPS-09 OPS-10 OPS-12 SEC-08 OPS-13',
    6: 'STB-07 STB-08 STB-09 UX-05 STB-10 UX-04 UX-06 UX-07 UX-08 OPS-14 UX-10 UX-11',
    7: 'GT-11 ECO-03 GT-02 GT-08 GT-03 GT-04 GT-06 ECO-04 GT-05 GT-07 GT-09 GT-10 GT-12 GT-13 GT-16 GT-17 GT-14 GT-15',
    8: 'OPS-11',
}.items():
    for i in ids.split():
        PHASE[i] = str(ph)
for i in 'ECO-05 STB-11 STB-12 SAV-15 SAV-16 SEC-11'.split():
    PHASE[i] = 'Owner/device'
DUP = {'UX-01': 'ECO-01', 'STB-02': 'OPS-02', 'STB-04': 'OPS-03', 'OPS-08': 'STB-05', 'SAV-08': 'OPS-01',
       'SEC-05': 'SAV-12', 'ECO-07': 'SEC-12', 'SEC-09': 'OPS-05', 'ECO-04': 'GT-06', 'ECO-03': 'GT-11',
       'UX-05': 'STB-09', 'UX-10': 'OPS-14'}

PATHFIX = [
    (r'/tmp/claude-0/[^\s`)]*?/scratchpad/scripts/', 'docs/audit/bulletproof-2026-11-21/evidence/ux-probes/'),
    (r'/tmp/claude-0/[^\s`)]*?/scratchpad/shots/', 'docs/audit/bulletproof-2026-11-21/evidence/shots/'),
    (r'…/scratchpad/scripts/', 'docs/audit/bulletproof-2026-11-21/evidence/ux-probes/'),
    (r'…/scratchpad/shots/', 'docs/audit/bulletproof-2026-11-21/evidence/shots/'),
    (r'scratchpad/scripts/', 'docs/audit/bulletproof-2026-11-21/evidence/ux-probes/'),
    (r'scratchpad/shots/', 'docs/audit/bulletproof-2026-11-21/evidence/shots/'),
    (r'(?<![\w/])shots/', 'docs/audit/bulletproof-2026-11-21/evidence/shots/'),
    (r'`tools/scratch/gt\.ts`', '`docs/audit/bulletproof-2026-11-21/evidence/gt/gt.ts`'),
    (r'`run\.mjs`', '`evidence/gt/run.mjs`'),
    (r'`rep\.mjs`', '`evidence/gt/rep.mjs`'),
    (r'/tmp/claude-0/[^\s`)]*', '(session scratch, not kept)'),
]


def fix(text):
    for a, b in PATHFIX:
        text = re.sub(a, b, text)
    # .png shots referenced: kept as .jpg in the repo
    text = re.sub(r'([\w-]+)\.png', r'\1.jpg', text)
    return text


def section(text, start_pat, end_pat=None):
    m = re.search(start_pat, text, re.M)
    if not m:
        return ''
    rest = text[m.end():]
    if end_pat:
        e = re.search(end_pat, rest, re.M)
        if e:
            rest = rest[:e.start()]
    return rest.strip('\n')


def items(text):
    out = []
    for m in re.finditer(r'^### ((?:[A-Z]+)-\d+)\s*(?:—|:|-)\s*(.*)$', text, re.M):
        iid, title = m.group(1), m.group(2).strip()
        block = text[m.end():]
        nxt = re.search(r'^#{2,3} ', block, re.M)
        block = block[:nxt.start()] if nxt else block

        def field(name):
            f = re.search(r'^- ' + name + r':\s*(.*)$', block, re.M)
            return f.group(1).strip() if f else ''
        out.append(dict(id=iid, title=title, sev=field('Severity'), status=field('Status'), kind=field('Kind'),
                        comp=field('Compartment')))
    return out


def sevkey(s):
    for k in ('BLOCKER', 'HIGH', 'MEDIUM', 'LOW'):
        if s.upper().startswith(k):
            return k
    return 'LOW'


front = (S / 'front.md').read_text()
allitems = []
lane_work, lane_verdict, lane_sound, lane_intro, owner = {}, {}, {}, {}, ''
for code, name in LANES:
    t = fix((F / f'{code}.md').read_text())
    lane_intro[code] = section(t, r'^# .*$', r'^## ')
    lane_verdict[code] = section(t, r'^## 1\..*$', r'^## 2\.')
    lane_work[code] = section(t, r'^## 2\..*$', r'^## 3\.')
    if code == 'OPS':
        owner = section(t, r'^## 3\..*$', r'^## 4\.')
        lane_sound[code] = section(t, r'^## 4\..*$')
    else:
        lane_sound[code] = section(t, r'^## 3\..*$')
    for it in items(lane_work[code]):
        it['lane'] = code
        allitems.append(it)

counts = {k: 0 for k in ('BLOCKER', 'HIGH', 'MEDIUM', 'LOW')}
for it in allitems:
    counts[sevkey(it['sev'])] += 1
own_n = len(re.findall(r'^\| OWN-\d+', owner, re.M))
prim = sum(1 for it in allitems if it['id'] not in DUP)
lanes_line = ', '.join(f"{c} {sum(1 for i in allitems if i['lane']==c)}" for c, _ in LANES)
counts_md = (f"**{len(allitems)} work items** ({prim} after folding duplicates): "
             f"**{counts['BLOCKER']} BLOCKER, {counts['HIGH']} HIGH, {counts['MEDIUM']} MEDIUM, {counts['LOW']} LOW**, "
             f"plus **{own_n} owner and device steps** (Part C). By lane: {lanes_line}.")

rows = ['| ID | Sev | Phase | Kind | Compartment | Dup of | Title |', '|---|---|---|---|---|---|---|']
order = {'BLOCKER': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
for it in sorted(allitems, key=lambda i: (order[sevkey(i['sev'])], i['lane'], i['id'])):
    title = it['title'].replace('|', '\\|')
    comp = re.sub(r'\s*\(.*?\)', '', it['comp']).replace('|', '/')[:40]
    kind = it['kind'].replace('|', '/')[:24]
    rows.append(f"| {it['id']} | {sevkey(it['sev'])} | {PHASE.get(it['id'], '?')} | {kind} | {comp} | "
                f"{DUP.get(it['id'], '')} | {title} |")
missing = [i['id'] for i in allitems if i['id'] not in PHASE]
if missing:
    print('NO PHASE:', missing)

doc = front.replace('{{COUNTS}}', counts_md).replace('{{INDEX}}', '\n'.join(rows))
parts = [doc]
for code, name in LANES:
    parts.append('<<<PAGEBREAK>>>')
    parts.append(f'## Lane {code}: {name}')
    intro = lane_intro[code].strip()
    if intro:
        parts.append(intro)
    # demote nothing: work items are ### already; drop the lane's own "## 2." header
    parts.append(lane_work[code])
parts.append('<<<PAGEBREAK>>>')
parts.append('# Part C: owner and device checklist')
parts.append('Code cannot close these. Each needs the evidence named in its row. Record it in '
             '`docs/store/OWNER_CHECKLIST.md` and the ledger. Device and owner work items in Part B '
             '(ECO-05, STB-11, STB-12, SAV-15, SAV-16, SEC-09, SEC-11) belong here too.')
parts.append(owner)
parts.append('<<<PAGEBREAK>>>')
parts.append('# Appendix A: verdict tables by lane')
parts.append('One row per checklist line the auditor judged: PASS, PARTIAL, FAIL, NEEDS-DEVICE, NEEDS-PLAYERS or OWNER.')
for code, name in LANES:
    parts.append(f'## A.{code}: {name}')
    parts.append(lane_verdict[code])
parts.append('<<<PAGEBREAK>>>')
parts.append('# Appendix B: verified sound (do not "fix" these)')
for code, name in LANES:
    parts.append(f'## B.{code}: {name}')
    parts.append(lane_sound[code])
parts.append('<<<PAGEBREAK>>>')
parts.append((S / 'appendix_c.md').read_text())
md = '\n\n'.join(p for p in parts if p.strip()) + '\n'
OUT.write_text(md)
print(counts_md)
print('items', len(allitems), 'owner', own_n, 'bytes', len(md))
