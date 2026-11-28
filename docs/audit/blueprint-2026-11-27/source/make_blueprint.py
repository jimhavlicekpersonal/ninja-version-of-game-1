"""Builds the Kagemura development blueprint PDF.

    python3 make_blueprint.py BLUEPRINT.pdf            # the PDF
    python3 make_blueprint.py --markdown FINDINGS.md   # the new findings as Markdown (for coding sessions)
"""
import sys
from engine import *  # noqa: F401,F403
from engine import Doc, toc
from findings import FINDINGS, LANES, SOUND, META
from part_b import part_b
from part_b6 import part_b6
from part_c import part_c, part_c_rules
from front import front, front_actions, front_how, part_a_intro, phase0_rows, appendix, TOP5

ORDER = {'BLOCKER': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
LANE_ORDER = [c for c, _, _ in LANES]


def rank(f):
    """Severity first, then the lane order of the report, then the finding's number."""
    prefix, number = f['id'].rsplit('-', 1)
    return (ORDER[f['sev']], LANE_ORDER.index(f['lane']), prefix, int(number))


def finding_card(f):
    head = Paragraph('<b>%s</b> &nbsp; %s &nbsp; <b>%s</b>' % (f['id'], sev(f['sev']), fmt(f['title'])),
                     ParagraphStyle('fh', parent=cell, fontSize=8.6, leading=11.4))
    rows = [[head, '']]
    for label, key in (('Where', 'where'), ('What happens', 'what'), ('Fix', 'fix'), ('How checked', 'checked')):
        if f.get(key):
            rows.append([Paragraph('<font color="#5b6475">%s</font>' % label, cell), Paragraph(fmt(f[key]), cell)])
    t = Table(rows, colWidths=[W * 0.13, W * 0.87])
    t.setStyle(TableStyle([
        ('SPAN', (0, 0), (1, 0)), ('BACKGROUND', (0, 0), (1, 0), HEAD_BG),
        ('LINEABOVE', (0, 0), (1, 0), 0.8, colors.HexColor(SEV.get(f['sev'], '#5b6475'))),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2.6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.8), ('LEFTPADDING', (0, 0), (-1, -1), 4.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4.5), ('LINEBELOW', (0, -1), (-1, -1), 0.4, RULE)]))
    return [KeepTogether([t]), Spacer(1, 6)]


def part_a():
    s = []
    s += H1('Part A. Flaws that are on none of your lists')
    s += part_a_intro()
    ranked = sorted(FINDINGS, key=rank)
    counts = {k: sum(1 for f in FINDINGS if f['sev'] == k) for k in ORDER}
    s += stat_tiles([(str(len(FINDINGS)), 'new findings'), (str(counts['BLOCKER']), 'BLOCKER'),
                     (str(counts['HIGH']), 'HIGH'), (str(counts['MEDIUM']), 'MEDIUM'), (str(counts['LOW']), 'LOW')])
    s += H2('A1. Ranked list')
    s += table(['ID', 'Sev', 'Finding', 'Checked'],
               [[f['id'], f['sev'], f['title'], f['proof']] for f in ranked],
               [0.11, 0.10, 0.62, 0.17], sev_col=1, bold_col=0)
    n = 2
    for code, name, blurb in LANES:
        fs = sorted([f for f in FINDINGS if f['lane'] == code], key=rank)
        if not fs:
            continue
        s += H2('A%d. %s' % (n, name))
        n += 1
        if blurb:
            s += P(blurb)
        for f in fs:
            if f['sev'] != 'LOW':
                s += finding_card(f)
        low = [f for f in fs if f['sev'] == 'LOW']
        if low:
            s += H3('Lower severity')
            s += table(['ID', 'Finding', 'Fix'], [[f['id'], f['title'] + ' (' + f['where'].split(';')[0].strip() + ')', f['fix']] for f in low],
                       [0.11, 0.49, 0.40], bold_col=0)
    s += H2('A%d. Checked and found sound' % n)
    s += P('Just as useful as the defects: what these lenses attacked without success.')
    s += UL(SOUND)
    return s


def markdown(path):
    out = ['# New findings, 2026-11-27 (audited commit `%s`)' % META['commit'], '',
           'Machine-readable form of Part A of `BLUEPRINT.pdf`. None of these appears in the earlier audits. ',
           'Revalidate each against the current code before fixing it; close it with the fixing commit and a test.', '',
           '| ID | Sev | Lane | Finding | Where | Checked |', '|---|---|---|---|---|---|']
    ranked = sorted(FINDINGS, key=rank)
    for f in ranked:
        out.append('| %s | %s | %s | %s | %s | %s |' % (f['id'], f['sev'], f['lane'], f['title'].replace('|', '/'),
                                                        f.get('where', '').replace('|', '/'), f['proof']))
    out.append('')
    for f in ranked:
        out += ['### %s — %s' % (f['id'], f['title']), '', '- **Severity:** %s' % f['sev'], '- **Lane:** %s' % f['lane']]
        for label, key in (('Where', 'where'), ('What happens', 'what'), ('Fix', 'fix'), ('How checked', 'checked')):
            if f.get(key):
                out.append('- **%s:** %s' % (label, f[key]))
        out.append('')
    out += ['## Checked and found sound', ''] + ['- ' + x for x in SOUND] + ['']
    open(path, 'w', encoding='utf8').write('\n'.join(out))


def build(path):
    doc = Doc(path, 'Kagemura: Ninja Clans · Development Blueprint · %s · main %s' % (META['date'], META['commit']),
              title='Kagemura: Ninja Clans — Development Blueprint', author='Independent review, %s' % META['date'],
              subject='New findings, open items and a phased plan')
    story = []
    story += front()
    story += front_actions(TOP5)
    story += front_how()
    story += [PageBreak()]
    story += [Paragraph('Contents', h1), Rule()] + toc() + [PageBreak()]
    story += part_a()
    story += [PageBreak()]
    story += part_b()
    story += part_b6(META)
    story += [PageBreak()]
    story += part_c(phase0_rows())
    story += part_c_rules()
    story += [PageBreak()]
    story += appendix()
    doc.multiBuild(story)


if __name__ == '__main__':
    if sys.argv[1] == '--markdown':
        markdown(sys.argv[2])
    else:
        build(sys.argv[1])
