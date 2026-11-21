"""Build BULLETPROOFING_AUDIT_2026-11-21.pdf from the Markdown report.

    python3 docs/audit/bulletproofing/make_report.py

Needs Python with reportlab and the DejaVu Sans fonts (Debian/Ubuntu: fonts-dejavu-core).
The Markdown file is the source of truth; this script only lays it out.
"""
import os
import re
import sys

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    CondPageBreak, KeepTogether, ListFlowable, ListItem, PageBreak, Paragraph,
    SimpleDocTemplate, Spacer, Table, TableStyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'BULLETPROOFING_AUDIT_2026-11-21.md')
OUT = os.path.join(HERE, 'BULLETPROOFING_AUDIT_2026-11-21.pdf')

FONT_DIRS = ['/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/dejavu', '/Library/Fonts', os.path.expanduser('~/Library/Fonts')]


def font(name):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    sys.exit(f'Font {name} not found (install DejaVu Sans).')


pdfmetrics.registerFont(TTFont('Sans', font('DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('Sans-Bold', font('DejaVuSans-Bold.ttf')))

def optional_font(name, fallback):
    for d in FONT_DIRS:
        if os.path.exists(os.path.join(d, name)):
            return os.path.join(d, name)
    return font(fallback)  # minimal installs ship no oblique: italics fall back to upright


pdfmetrics.registerFont(TTFont('Sans-Oblique', optional_font('DejaVuSans-Oblique.ttf', 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('Sans-BoldOblique', optional_font('DejaVuSans-BoldOblique.ttf', 'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('Mono', font('DejaVuSansMono.ttf')))
pdfmetrics.registerFontFamily('Sans', normal='Sans', bold='Sans-Bold', italic='Sans-Oblique', boldItalic='Sans-BoldOblique')

# Palette: ink and accent echo the owner's checklist; status colours from the dataviz status palette.
INK = colors.HexColor('#1f2430')
MUTED = colors.HexColor('#5f6673')
ACCENT = colors.HexColor('#e2571e')
RULE = colors.HexColor('#d9d7cf')
HEAD_BG = colors.HexColor('#f3f1ea')
ZEBRA = colors.HexColor('#fafaf7')
CALLOUT_BG = colors.HexColor('#fff4ec')
STATUS = {
    'pass': colors.HexColor('#0ca30c'),
    'partial': colors.HexColor('#fab219'),
    'fail': colors.HexColor('#d03b3b'),
    'device': colors.HexColor('#2a78d6'),
    'na': colors.HexColor('#a8a79e'),
}
STATUS_TEXT = {  # darker steps for text so it clears contrast on white
    'pass': '#006300', 'partial': '#8a5a00', 'fail': '#b02a2a', 'device': '#1c5cab', 'na': '#6b6a62',
}
SEV_COLORS = {'critical': '#b02a2a', 'high': '#b02a2a', 'medium': '#a14a12', 'low': '#5f6673'}

PAGE_W, PAGE_H = letter
MARGIN = 0.7 * inch
FRAME_W = PAGE_W - 2 * MARGIN

base = dict(fontName='Sans', textColor=INK)
S = {
    'title': ParagraphStyle('title', fontName='Sans-Bold', fontSize=26, leading=31, textColor=INK, spaceAfter=6),
    'subtitle': ParagraphStyle('subtitle', fontName='Sans', fontSize=11.5, leading=15.5, textColor=MUTED, spaceAfter=10),
    'h2': ParagraphStyle('h2', fontName='Sans-Bold', fontSize=15, leading=19, textColor=INK, spaceBefore=14, spaceAfter=6),
    'h3': ParagraphStyle('h3', fontName='Sans-Bold', fontSize=11.5, leading=15, textColor=INK, spaceBefore=10, spaceAfter=4),
    'h4': ParagraphStyle('h4', fontName='Sans-Bold', fontSize=10, leading=13, textColor=ACCENT, spaceBefore=8, spaceAfter=3),
    'body': ParagraphStyle('body', fontSize=9, leading=12.6, spaceAfter=5, alignment=TA_LEFT, **base),
    'bullet': ParagraphStyle('bullet', fontSize=9, leading=12.4, **base),
    'cell': ParagraphStyle('cell', fontSize=7.1, leading=9.0, **base),
    'cellhead': ParagraphStyle('cellhead', fontName='Sans-Bold', fontSize=7.1, leading=9.0, textColor=INK),
    'meta': ParagraphStyle('meta', fontSize=8.5, leading=11.5, textColor=MUTED),
}


# ---------------------------------------------------------------- inline markup

STATUS_WORDS = [
    (r'PASS', 'pass'), (r'PARTIAL', 'partial'), (r'FAIL', 'fail'),
    (r'DEVICE', 'device'), (r'OWNER', 'device'), (r'Dev/Own', 'device'), (r'N/A', 'na'),
]


def inline(text, status=False):
    t = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1', t)  # links: keep the text
    codes = []

    def keep_code(m):
        codes.append(m.group(1))
        return f'\x00{len(codes) - 1}\x00'

    t = re.sub(r'`([^`]+)`', keep_code, t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', t)
    if status:
        for word, kind in STATUS_WORDS:
            t = re.sub(r'(?<![\w/])(' + re.escape(word) + r')(?![\w/])', f'<font color="{STATUS_TEXT[kind]}"><b>\\1</b></font>', t)
    # Allow long paths and ids to wrap inside narrow cells.
    t = re.sub(r'\x00(\d+)\x00', lambda m: '<font name="Mono" size="-0.6">' + soft_wrap(codes[int(m.group(1))]) + '</font>', t)
    return t


def soft_wrap(code):
    # Text is already escaped; reportlab splits over-long words itself (splitLongWords), so no break hints are needed.
    return code


# ---------------------------------------------------------------- tables

def parse_row(line):
    cells = line.strip().strip('|').split('|')
    return [c.strip() for c in cells]


def col_widths(rows, total):
    n = len(rows[0])
    header = [h.lower() for h in rows[0]]
    if n == 6 and header[:3] == ['id', 'sev.', 'area']:
        fr = [0.052, 0.083, 0.112, 0.318, 0.228, 0.207]
    elif n == 7 and header[0] == '§':
        fr = [0.07, 0.42, 0.10, 0.11, 0.10, 0.09, 0.11]
    elif n == 3 and header[0] in ('item', 'check'):
        fr = [0.23, 0.17, 0.60] if header[0] == 'item' else [0.27, 0.73]
        if header[0] == 'check':
            fr = [0.27, 0.73]
        else:
            fr = [0.22, 0.16, 0.62]
    elif n == 2:
        fr = [0.27, 0.73]
    else:
        lens = []
        for i in range(n):
            longest = max(len(r[i]) if i < len(r) else 0 for r in rows)
            lens.append(min(max(longest, len(rows[0][i]) + 5, 9), 48))
        s = sum(lens)
        fr = [x / s for x in lens]
    return [total * f for f in fr]


def build_table(rows, status_cols=None):
    header, body = rows[0], rows[2:] if len(rows) > 1 and set(rows[1][0]) <= set('-: ') else rows[1:]
    rows_clean = [header] + body
    widths = col_widths(rows_clean, FRAME_W)
    head_l = [h.lower() for h in header]
    sev_col = head_l.index('sev.') if 'sev.' in head_l else None
    status_idx = set()
    for i, h in enumerate(head_l):
        if h in ('status', 'state', 'pass', 'partial', 'fail', 'n/a', 'dev/own') or h.startswith('pro priority'):
            status_idx.add(i)
    data = [[Paragraph(inline(h, status=False), S['cellhead']) for h in header]]
    for r in body:
        r = (r + [''] * len(header))[:len(header)]
        cells = []
        for i, c in enumerate(r):
            txt = inline(c, status=(i in status_idx or i == 1 and 'status' in head_l))
            if sev_col is not None and i == sev_col:
                key = re.sub(r'[^a-z]', ' ', c.lower()).split()
                colr = SEV_COLORS.get(key[0] if key else '', '#1f2430')
                txt = f'<font color="{colr}"><b>{inline(c)}</b></font>'
            if i == 0 and sev_col is not None:
                txt = f'<b>{txt}</b>'
            cells.append(Paragraph(txt, S['cell']))
        data.append(cells)
    t = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), HEAD_BG),
        ('LINEBELOW', (0, 0), (-1, 0), 0.8, ACCENT),
        ('LINEBELOW', (0, 1), (-1, -1), 0.25, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3.5),
        ('TOPPADDING', (0, 0), (-1, -1), 2.6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.8),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(style))
    return t


# ---------------------------------------------------------------- scorecard chart

def scorecard_chart(rows):
    """Horizontal stacked bars, one per checklist section, from the section-count table."""
    body = [r for r in rows[2:] if r[2].strip().isdigit()]
    kinds = [('pass', 'Pass'), ('partial', 'Partial'), ('fail', 'Fail'), ('device', 'Device / owner'), ('na', 'N/A')]
    idx = {'pass': 2, 'partial': 3, 'fail': 4, 'na': 5, 'device': 6}
    label_w, bar_x0, right_pad = 2.2 * inch, 2.3 * inch, 0.35 * inch
    row_h, gap = 13, 4
    top_pad, bottom_pad = 26, 8
    h = top_pad + len(body) * (row_h + gap) + bottom_pad
    w = FRAME_W
    max_total = max(sum(int(r[idx[k]]) for k, _ in kinds) for r in body)
    unit = (w - bar_x0 - right_pad) / max_total
    d = Drawing(w, h)
    # Legend (identity is never colour alone: legend + counts inside segments + the table below).
    lx = 0
    for k, name in kinds:
        d.add(Rect(lx, h - 12, 9, 9, fillColor=STATUS[k], strokeColor=None, rx=1.5, ry=1.5))
        d.add(String(lx + 13, h - 11, name, fontName='Sans', fontSize=7.6, fillColor=INK))
        lx += 13 + pdfmetrics.stringWidth(name, 'Sans', 7.6) + 16
    y = h - top_pad
    for r in body:
        y -= row_h
        name = f'{r[0]}  {r[1]}'
        while pdfmetrics.stringWidth(name, 'Sans', 7.6) > label_w and len(name) > 4:
            name = name[:-2].rstrip() + '…' if not name.endswith('…') else name[:-2] + '…'
        d.add(String(0, y + 3.5, name, fontName='Sans', fontSize=7.6, fillColor=INK))
        x = bar_x0
        for k, _ in kinds:
            v = int(r[idx[k]])
            if not v:
                continue
            seg = v * unit
            d.add(Rect(x, y, max(seg - 1.5, 0.5), row_h, fillColor=STATUS[k], strokeColor=None))
            if seg >= 9:
                ink = colors.HexColor('#0b0b0b') if k in ('partial', 'na') else colors.white
                d.add(String(x + seg / 2 - 0.75, y + 3.6, str(v), fontName='Sans-Bold', fontSize=7, fillColor=ink, textAnchor='middle'))
            x += seg
        y -= gap
    d.add(Line(bar_x0, h - top_pad + 2, bar_x0, y + gap - 2, strokeColor=colors.HexColor('#c3c2b7'), strokeWidth=0.6))
    return d


# ---------------------------------------------------------------- page furniture

def on_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.55 * inch, PAGE_W - MARGIN, 0.55 * inch)
    canvas.setFont('Sans', 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 0.38 * inch, 'Kagemura: Ninja Clans · Release Bulletproofing Audit · 2026-11-21 · commit 560ce7a')
    canvas.drawRightString(PAGE_W - MARGIN, 0.38 * inch, f'Page {doc.page}')
    canvas.restoreState()


# ---------------------------------------------------------------- markdown → story

def build_story(md):
    lines = md.split('\n')
    story = []
    i = 0
    para = []
    first_h2_seen = False

    def flush_para():
        nonlocal para
        if para:
            text = ' '.join(l.strip() for l in para)
            m = re.fullmatch(r'\*\*(.+?)\*\*(.*)', text)
            if m and not m.group(2).strip():
                story.append(Paragraph(inline(m.group(1)), S['h4']))
            elif text.startswith('**This is a report') or text.startswith('This is a report'):
                story.append(Paragraph(inline(text), S['body']))
            else:
                story.append(Paragraph(inline(text, status=False), S['body']))
            para = []

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith('# '):
            flush_para()
            story.append(Paragraph('Release Bulletproofing Audit', S['title']))
            story.append(Paragraph('Kagemura: Ninja Clans, checked item by item against the Game Release Bulletproofing Checklist: stability, saves, economy, security, store compliance, release pipeline and the game theory that decides whether the design survives real players.', S['subtitle']))
            story.append(_rule())
            story.append(Spacer(1, 4))
            story.append(Paragraph('Audit date 2026-11-21 · commit 560ce7acb2268fd0755adb799ed310db240ebe2e · branch claude/awesome-goodall-tglafs · report only, no fixes', S['meta']))
            story.append(Spacer(1, 8))
            i += 1
            continue
        if s == '---':
            flush_para()
            i += 1
            continue
        if s.startswith('## '):
            flush_para()
            title = s[3:]
            if first_h2_seen and title.startswith(('3.', '4.')):
                story.append(PageBreak())
            first_h2_seen = True
            story.append(CondPageBreak(1.3 * inch))
            story.append(Paragraph(inline(title), S['h2']))
            story.append(_rule(ACCENT, 1.2))
            story.append(Spacer(1, 4))
            i += 1
            continue
        if s.startswith('### '):
            flush_para()
            story.append(CondPageBreak(1.0 * inch))
            story.append(Paragraph(inline(s[4:]), S['h3']))
            i += 1
            continue
        if s.startswith('|'):
            flush_para()
            block = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                block.append(parse_row(lines[i]))
                i += 1
            head = [h.lower() for h in block[0]]
            if head and head[0] == '§':
                story.append(KeepTogether([scorecard_chart(block), Spacer(1, 8)]))
            if head and head[0].startswith('pro priority'):
                story.append(KeepTogether([_callout(block)]))
            else:
                story.append(build_table(block))
            story.append(Spacer(1, 7))
            continue
        if re.match(r'^(\s*)(- |\d+\. )', line):
            flush_para()
            numbered = bool(re.match(r'^\s*\d+\. ', line))
            items = []
            while i < len(lines) and re.match(r'^(\s*)(- |\d+\. )', lines[i]):
                txt = re.sub(r'^\s*(- |\d+\. )', '', lines[i])
                i += 1
                while i < len(lines) and lines[i].startswith('   ') and lines[i].strip() and not re.match(r'^\s*(- |\d+\. )', lines[i]):
                    txt += ' ' + lines[i].strip()
                    i += 1
                items.append(ListItem(Paragraph(inline(txt, status=True), S['bullet']), leftIndent=12, value=None))
            lf = ListFlowable(items, bulletType='1' if numbered else 'bullet', start=1 if numbered else '•',
                              bulletFontName='Sans-Bold' if numbered else 'Sans', bulletFontSize=8.5,
                              bulletColor=ACCENT, leftIndent=14, spaceBefore=1)
            story.append(lf)
            story.append(Spacer(1, 5))
            continue
        if not s:
            flush_para()
            i += 1
            continue
        para.append(line)
        i += 1
    flush_para()
    return story


def _rule(color=ACCENT, width=2.2):
    t = Table([['']], colWidths=[FRAME_W], rowHeights=[1])
    t.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, -1), width, color), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    return t


def _callout(block):
    """The 'what the pros obsess over' table, set as a highlighted box like the checklist's last page."""
    rows = block[2:]
    inner = [[Paragraph('<font color="#e2571e"><b>What the pros obsess over most, and where Kagemura stands</b></font>', ParagraphStyle('ct', parent=S['body'], fontSize=10.5, leading=14)), '']]
    for r in rows:
        inner.append([Paragraph(f'<b>{inline(r[0])}</b>', S['cell']), Paragraph(inline(r[1]), S['cell'])])
    t = Table(inner, colWidths=[FRAME_W * 0.24, FRAME_W * 0.76], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('SPAN', (0, 0), (-1, 0)),
        ('BACKGROUND', (0, 0), (-1, -1), CALLOUT_BG),
        ('BOX', (0, 0), (-1, -1), 1, ACCENT),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LINEBELOW', (0, 1), (-1, -2), 0.25, colors.HexColor('#f1d2bf')),
    ]))
    return t


def main():
    md = open(SRC, encoding='utf-8').read()
    doc = SimpleDocTemplate(
        OUT, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=0.65 * inch, bottomMargin=0.8 * inch,
        title='Kagemura Release Bulletproofing Audit (2026-11-21)', author='Kagemura audit',
        subject='Game Release Bulletproofing Checklist applied to commit 560ce7a',
    )
    doc.build(build_story(md), onFirstPage=on_page, onLaterPages=on_page)
    print(OUT)


if __name__ == '__main__':
    main()
