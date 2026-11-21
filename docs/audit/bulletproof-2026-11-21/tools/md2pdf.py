"""Render a restricted Markdown file to a text-extractable, bookmarked PDF.

Supported: # .. #### headings (become PDF outline entries), paragraphs, '- ' bullets
(nested by two spaces), '1. ' numbered items, pipe tables, ``` fenced blocks, '> ' notes,
'---' rules, and inline **bold**, `code`, *italic*.

Usage: python3 md2pdf.py input.md output.pdf "Title" "Subject"
"""
import re
import sys
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Preformatted,
                                Spacer, Table, TableStyle, PageBreak, Flowable, KeepTogether)

FD = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DV', FD + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', FD + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVI', FD + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVBI', FD + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVM', FD + 'DejaVuSansMono.ttf'))
registerFontFamily('DV', normal='DV', bold='DVB', italic='DVI', boldItalic='DVBI')

INK = colors.HexColor('#1b2130')
MUTED = colors.HexColor('#5b6475')
ACCENT = colors.HexColor('#c2410c')
CODEBG = colors.HexColor('#f3f4f6')
RULE = colors.HexColor('#d6d9df')
SEV = {'BLOCKER': '#9f1239', 'HIGH': '#c2410c', 'MEDIUM': '#a16207', 'LOW': '#2563eb'}

body = ParagraphStyle('body', fontName='DV', fontSize=8.8, leading=12, textColor=INK, spaceAfter=4,
                      alignment=TA_LEFT)
small = ParagraphStyle('small', parent=body, fontSize=7.6, leading=9.6, spaceAfter=0)
cell = ParagraphStyle('cell', parent=body, fontSize=7.4, leading=9.2, spaceAfter=0)
cellh = ParagraphStyle('cellh', parent=cell, fontName='DVB', textColor=colors.white)
h1 = ParagraphStyle('h1', fontName='DVB', fontSize=17, leading=21, textColor=INK, spaceBefore=4,
                    spaceAfter=6)
h2 = ParagraphStyle('h2', fontName='DVB', fontSize=12.5, leading=16, textColor=ACCENT, spaceBefore=10,
                    spaceAfter=4)
h3 = ParagraphStyle('h3', fontName='DVB', fontSize=10, leading=13, textColor=INK, spaceBefore=8,
                    spaceAfter=3)
h4 = ParagraphStyle('h4', fontName='DVB', fontSize=9, leading=12, textColor=MUTED, spaceBefore=5,
                    spaceAfter=2)
note = ParagraphStyle('note', parent=body, backColor=colors.HexColor('#fff7ed'), borderColor=ACCENT,
                      borderWidth=0.6, borderPadding=5, spaceBefore=4, spaceAfter=8)
code = ParagraphStyle('code', fontName='DVM', fontSize=7.2, leading=9, textColor=INK,
                      backColor=CODEBG, borderPadding=4, spaceBefore=2, spaceAfter=6)


class Rule(Flowable):
    def wrap(self, aw, ah):
        self.w = aw
        return aw, 6

    def draw(self):
        self.canv.setStrokeColor(RULE)
        self.canv.setLineWidth(0.6)
        self.canv.line(0, 3, self.w, 3)


class Bookmark(Flowable):
    """Zero-size flowable that adds a PDF outline entry where it lands."""

    def __init__(self, title, level, key):
        super().__init__()
        self.title, self.level, self.key = title, level, key

    def wrap(self, aw, ah):
        return 0, 0

    def draw(self):
        c = self.canv
        c.bookmarkPage(self.key)
        c.addOutlineEntry(self.title, self.key, level=self.level, closed=self.level >= 1)


def inline(text):
    """Escape, then apply inline markdown (code spans are protected first)."""
    codes = []

    def keep(m):
        codes.append('<font name="DVM" size="7.6" color="#0f3d75">' + escape(m.group(1)) + '</font>')
        return f'\x00{len(codes) - 1}\x00'
    s = re.sub(r'`([^`]+)`', keep, text)
    s = escape(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', s)
    for k, v in SEV.items():
        s = re.sub(r'\b' + k + r'\b', f'<font color="{v}"><b>{k}</b></font>', s)
    return re.sub(r'\x00(\d+)\x00', lambda m: codes[int(m.group(1))], s)


def plain(text):
    return re.sub(r'[`*]', '', text)


def build(md_path, pdf_path, title, subject):
    lines = open(md_path, encoding='utf-8').read().split('\n')
    story = []
    i = 0
    bm = 0
    para_buf = []

    def flush_para():
        if para_buf:
            story.append(Paragraph(inline(' '.join(para_buf)), body))
            para_buf.clear()

    while i < len(lines):
        line = lines[i]
        s = line.rstrip()
        if s.startswith('```'):
            flush_para()
            j = i + 1
            buf = []
            while j < len(lines) and not lines[j].startswith('```'):
                buf.append(lines[j])
                j += 1
            story.append(Preformatted('\n'.join(buf), code))
            i = j + 1
            continue
        if s == '<<<PAGEBREAK>>>':
            flush_para()
            story.append(PageBreak())
            i += 1
            continue
        m = re.match(r'^(#{1,4})\s+(.*)$', s)
        if m:
            flush_para()
            level = len(m.group(1))
            text = m.group(2)
            bm += 1
            style = {1: h1, 2: h2, 3: h3, 4: h4}[level]
            if level <= 3:
                story.append(Bookmark(plain(text), level - 1, f'b{bm}'))
            story.append(Paragraph(inline(text), style))
            i += 1
            continue
        if s.strip() == '---':
            flush_para()
            story.append(Rule())
            i += 1
            continue
        if s.startswith('|'):
            flush_para()
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                r = lines[i].strip().strip('|')
                cells = [c.strip() for c in re.split(r'(?<!\\)\|', r)]
                if not all(re.match(r'^:?-{2,}:?$', c) for c in cells if c):
                    rows.append([c.replace('\\|', '|') for c in cells])
                i += 1
            ncol = max(len(r) for r in rows)
            rows = [r + [''] * (ncol - len(r)) for r in rows]
            data = [[Paragraph(inline(c), cellh if ri == 0 else cell) for c in r]
                    for ri, r in enumerate(rows)]
            avail = letter[0] - 1.2 * inch
            lens = [max(len(plain(r[c])) for r in rows) for c in range(ncol)]
            lens = [min(max(l, 4), 70) for l in lens]
            # a column is never narrower than its longest word (IDs, severities, verdicts)
            minw = [max(len(w) for r in rows for w in (plain(r[c]).split() or [''])) * 4.7 + 8
                    for c in range(ncol)]
            minw = [min(m, avail * 0.3) for m in minw]
            tot = sum(lens)
            widths = [max(minw[c], avail * lens[c] / tot) for c in range(ncol)]
            extra = sum(widths) - avail
            if extra > 0:
                flex = [c for c in range(ncol) if widths[c] > minw[c]]
                room = sum(widths[c] - minw[c] for c in flex) or 1
                widths = [w - (extra * (w - minw[c]) / room if c in flex else 0) for c, w in enumerate(widths)]
            t = Table(data, colWidths=widths, repeatRows=1)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
                ('GRID', (0, 0), (-1, -1), 0.4, RULE),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            story.append(t)
            story.append(Spacer(1, 6))
            continue
        m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', line)
        if m:
            flush_para()
            indent = len(m.group(1)) // 2
            marker = m.group(2)
            text = m.group(3)
            # continuation lines
            j = i + 1
            while j < len(lines) and lines[j].strip() and not re.match(r'^(\s*)([-*]|\d+\.)\s+', lines[j]) \
                    and not lines[j].startswith(('#', '|', '```', '>')) and lines[j].startswith('  '):
                text += ' ' + lines[j].strip()
                j += 1
            bullet = '•' if marker in '-*' else marker
            st = ParagraphStyle('li', parent=body, leftIndent=12 + indent * 12, bulletIndent=2 + indent * 12,
                                spaceAfter=2)
            story.append(Paragraph(inline(text), st, bulletText=bullet))
            i = j
            continue
        if s.startswith('>'):
            flush_para()
            buf = []
            while i < len(lines) and lines[i].startswith('>'):
                buf.append(lines[i].lstrip('>').strip())
                i += 1
            story.append(Paragraph(inline(' '.join(buf)), note))
            continue
        if not s.strip():
            flush_para()
            i += 1
            continue
        para_buf.append(s.strip())
        i += 1
    flush_para()

    def on_page(c, d):
        c.saveState()
        c.setFont('DV', 7)
        c.setFillColor(MUTED)
        c.drawString(0.6 * inch, 0.4 * inch, title)
        c.drawRightString(letter[0] - 0.6 * inch, 0.4 * inch, f'Page {d.page}')
        c.setStrokeColor(RULE)
        c.line(0.6 * inch, 0.52 * inch, letter[0] - 0.6 * inch, 0.52 * inch)
        c.restoreState()

    doc = BaseDocTemplate(pdf_path, pagesize=letter, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                          topMargin=0.6 * inch, bottomMargin=0.7 * inch, title=title, subject=subject,
                          author='Kagemura release audit', creator='md2pdf.py (reportlab)',
                          keywords='Kagemura, release, audit, bulletproofing, work items, AI agent prompt')
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
    doc.addPageTemplates([PageTemplate(id='p', frames=[frame], onPageEnd=on_page)])
    doc.build(story)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
