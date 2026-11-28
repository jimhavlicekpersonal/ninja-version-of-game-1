"""Layout engine for the Kagemura development blueprint PDF (reportlab).

Content lives in content.py as plain Python data; this file only knows how to draw it.
Usage: python3 make_blueprint.py <out.pdf>
"""
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, KeepTogether, Flowable, CondPageBreak)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily, stringWidth

F = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DV', F + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', F + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVM', F + 'DejaVuSansMono.ttf'))
registerFontFamily('DV', normal='DV', bold='DVB', italic='DV', boldItalic='DVB')

INK = colors.HexColor('#1d2330')
MUTED = colors.HexColor('#5b6475')
ACCENT = colors.HexColor('#c8551b')
RULE = colors.HexColor('#d9dce3')
HEAD_BG = colors.HexColor('#f4f1ec')
SOFT_BG = colors.HexColor('#f7f8fa')
CALL_BG = colors.HexColor('#fdf3ec')
SEV = {'BLOCKER': '#a3160f', 'HIGH': '#c8551b', 'MEDIUM': '#8a6500', 'LOW': '#5b6475'}

PAGE_W, PAGE_H = letter
MARGIN = 0.72 * inch
W = PAGE_W - 2 * MARGIN

body = ParagraphStyle('body', fontName='DV', fontSize=9, leading=12.6, textColor=INK, alignment=TA_LEFT,
                      spaceAfter=5)
small = ParagraphStyle('small', parent=body, fontSize=7.9, leading=10.6, spaceAfter=0)
cell = ParagraphStyle('cell', parent=body, fontSize=7.9, leading=10.4, spaceAfter=0)
cellb = ParagraphStyle('cellb', parent=cell, fontName='DVB')
muted = ParagraphStyle('muted', parent=body, textColor=MUTED, fontSize=8.2, leading=11.2)
h1 = ParagraphStyle('h1', fontName='DVB', fontSize=17, leading=21, textColor=INK, spaceBefore=4, spaceAfter=3)
h2 = ParagraphStyle('h2', fontName='DVB', fontSize=11.5, leading=14.5, textColor=ACCENT, spaceBefore=11,
                    spaceAfter=3)
h3 = ParagraphStyle('h3', fontName='DVB', fontSize=9.4, leading=12.4, textColor=INK, spaceBefore=7, spaceAfter=2)
bullet = ParagraphStyle('bullet', parent=body, leftIndent=12, bulletIndent=2, spaceAfter=2.5)
num = ParagraphStyle('num', parent=body, leftIndent=16, bulletIndent=0, spaceAfter=3)
title = ParagraphStyle('title', fontName='DVB', fontSize=27, leading=32, textColor=INK, spaceAfter=2)
subtitle = ParagraphStyle('subtitle', fontName='DV', fontSize=12.5, leading=16.5, textColor=ACCENT, spaceAfter=10)
lead = ParagraphStyle('lead', parent=body, fontSize=10.2, leading=14.6, spaceAfter=7)
toc1 = ParagraphStyle('toc1', parent=body, fontName='DVB', fontSize=9.2, leading=13, spaceAfter=0, spaceBefore=4)
toc2 = ParagraphStyle('toc2', parent=body, fontSize=8.4, leading=11.2, leftIndent=12, spaceAfter=0, textColor=MUTED)

_code = re.compile(r'`([^`]+)`')
_bold = re.compile(r'\*\*([^*]+)\*\*')


def fmt(text):
    """Tiny markup: `code`, **bold**; everything else is escaped for reportlab's mini-HTML."""
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    text = _code.sub(lambda m: '<font name="DVM" size="-0.6">%s</font>' % m.group(1), text)
    text = _bold.sub(r'<b>\1</b>', text)
    return text


def sev(word):
    w = word.upper()
    key = 'MEDIUM' if w.startswith('MED') else w.split('-')[0].split('/')[0].strip()
    return '<font color="%s"><b>%s</b></font>' % (SEV.get(key, '#1d2330'), w)


class Rule(Flowable):
    def __init__(self, width=W, color=ACCENT, thick=1.1, space=3):
        super().__init__()
        self.width, self.color, self.thick, self.space = width, color, thick, space

    def wrap(self, aw, ah):
        return self.width, self.thick + self.space

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thick)
        self.canv.line(0, self.space / 2, self.width, self.space / 2)


class Heading(Paragraph):
    """A paragraph that registers itself in the table of contents."""

    def __init__(self, text, style, level=None):
        super().__init__(text, style)
        self.toc_level = level
        self.toc_text = re.sub(r'<[^>]+>', '', text)


def H1(text):
    return [CondPageBreak(1.6 * inch), Heading(fmt(text), h1, 0), Rule()]


def H2(text, toc=True):
    return [CondPageBreak(1.1 * inch), Heading(fmt(text), h2, 1 if toc else None)]


def H3(text):
    return [CondPageBreak(0.8 * inch), Paragraph(fmt(text), h3)]


def P(text, style=body):
    return [Paragraph(fmt(text), style)]


def Lead(text):
    return [Paragraph(fmt(text), lead)]


def Note(text):
    return [Paragraph(fmt(text), muted)]


def UL(items, style=bullet):
    return [Paragraph(fmt(i), style, bulletText='•') for i in items]


def OL(items):
    return [Paragraph(fmt(i), num, bulletText='%d.' % (n + 1)) for n, i in enumerate(items)]


def Gap(h=6):
    return [Spacer(1, h)]


def table(header, rows, widths, sev_col=None, bold_col=None, font=cell, zebra=False, repeat=True):
    """widths are fractions of the text width; cells are tiny-markup strings."""
    cw = [W * f for f in widths]
    data = []
    if header:
        data.append([Paragraph('<b>%s</b>' % fmt(h), font) for h in header])
    for r in rows:
        line = []
        for i, c in enumerate(r):
            if isinstance(c, Flowable):
                line.append(c)
            elif sev_col is not None and i == sev_col:
                line.append(Paragraph(sev(c), font))
            elif bold_col is not None and i == bold_col:
                line.append(Paragraph('<b>%s</b>' % fmt(c), font))
            else:
                line.append(Paragraph(fmt(str(c)), font))
        data.append(line)
    t = Table(data, colWidths=cw, repeatRows=1 if (header and repeat) else 0)
    st = [('VALIGN', (0, 0), (-1, -1), 'TOP'),
          ('TOPPADDING', (0, 0), (-1, -1), 3.2), ('BOTTOMPADDING', (0, 0), (-1, -1), 3.6),
          ('LEFTPADDING', (0, 0), (-1, -1), 4.5), ('RIGHTPADDING', (0, 0), (-1, -1), 4.5),
          ('LINEBELOW', (0, 0), (-1, -1), 0.4, RULE)]
    if header:
        st += [('BACKGROUND', (0, 0), (-1, 0), HEAD_BG), ('LINEBELOW', (0, 0), (-1, 0), 0.8, ACCENT)]
    if zebra:
        for i in range(1 if header else 0, len(data)):
            if (i % 2) == 0:
                st.append(('BACKGROUND', (0, i), (-1, i), SOFT_BG))
    t.setStyle(TableStyle(st))
    return [t, Spacer(1, 7)]


def callout(title_text, lines, bg=CALL_BG, edge=ACCENT):
    inner = []
    if title_text:
        inner.append(Paragraph('<b>%s</b>' % fmt(title_text), ParagraphStyle('ct', parent=body, fontSize=9.6,
                                                                               leading=13, spaceAfter=3)))
    for ln in lines:
        if ln.startswith('- '):
            inner.append(Paragraph(fmt(ln[2:]), ParagraphStyle('cb', parent=bullet, spaceAfter=2), bulletText='•'))
        else:
            inner.append(Paragraph(fmt(ln), ParagraphStyle('cp', parent=body, spaceAfter=3)))
    t = Table([[inner]], colWidths=[W])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('LINEBEFORE', (0, 0), (0, -1), 3, edge),
                           ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                           ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
    return [t, Spacer(1, 8)]


def stat_tiles(tiles):
    """tiles: list of (big value, label). A row of plain figures, not a chart."""
    n = len(tiles)
    big = ParagraphStyle('big', fontName='DVB', fontSize=19, leading=22, textColor=INK)
    lab = ParagraphStyle('lab', parent=small, textColor=MUTED, fontSize=7.6, leading=9.8)
    cells = [[Paragraph(fmt(v), big), Paragraph(fmt(l), lab)] for v, l in tiles]
    t = Table([cells], colWidths=[W / n] * n)
    st = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 8),
          ('RIGHTPADDING', (0, 0), (-1, -1), 6), ('TOPPADDING', (0, 0), (-1, -1), 7),
          ('BOTTOMPADDING', (0, 0), (-1, -1), 7), ('BACKGROUND', (0, 0), (-1, -1), SOFT_BG)]
    for i in range(1, n):
        st.append(('LINEBEFORE', (i, 0), (i, 0), 2, colors.white))
    t.setStyle(TableStyle(st))
    return [t, Spacer(1, 9)]


class StackedBars(Flowable):
    """Horizontal stacked bars, one row per category. series: [(name, hex)], rows: [(label, [values])]."""

    def __init__(self, series, rows, width=W, bar_h=13, row_gap=8, label_w=92, total_w=34):
        super().__init__()
        self.series, self.rows, self.width = series, rows, width
        self.bar_h, self.row_gap, self.label_w, self.total_w = bar_h, row_gap, label_w, total_w
        self.legend_h = 16
        self.height = self.legend_h + len(rows) * (bar_h + row_gap) + 2

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        # legend (always present for two or more series)
        x = self.label_w
        y = self.height - 10
        c.setFont('DV', 7.6)
        for name, hexc in self.series:
            c.setFillColor(colors.HexColor(hexc))
            c.roundRect(x, y - 1, 8, 8, 1.5, stroke=0, fill=1)
            c.setFillColor(INK)
            c.drawString(x + 11, y, name)
            x += 11 + stringWidth(name, 'DV', 7.6) + 14
        plot_w = self.width - self.label_w - self.total_w
        mx = max(sum(v) for _, v in self.rows) or 1
        y = self.height - self.legend_h - self.bar_h - 2
        for label, vals in self.rows:
            c.setFillColor(INK)
            c.setFont('DV', 8)
            c.drawRightString(self.label_w - 6, y + 3.4, label)
            x = self.label_w
            for (name, hexc), v in zip(self.series, vals):
                if v <= 0:
                    continue
                w = plot_w * v / mx
                c.setFillColor(colors.HexColor(hexc))
                c.rect(x, y, max(w - 2, 0.8), self.bar_h, stroke=0, fill=1)  # 2pt surface gap
                if w > 15:
                    c.setFillColor(colors.white if hexc in ('#257de0',) else INK)
                    c.setFont('DVB', 7.2)
                    c.drawCentredString(x + (w - 2) / 2, y + 3.6, str(v))
                x += w
            c.setFillColor(MUTED)
            c.setFont('DV', 7.6)
            c.drawString(x + 4, y + 3.4, str(sum(vals)))
            y -= self.bar_h + self.row_gap


class Bars(Flowable):
    """Single-series horizontal bars with the value at the tip."""

    def __init__(self, rows, width=W, bar_h=12, row_gap=7, label_w=210, color='#257de0'):
        super().__init__()
        self.rows, self.width, self.bar_h, self.row_gap, self.label_w, self.color = rows, width, bar_h, row_gap, label_w, color
        self.height = len(rows) * (bar_h + row_gap) + 2

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        plot_w = self.width - self.label_w - 40
        mx = max(v for _, v in self.rows) or 1
        y = self.height - self.bar_h - 1
        for label, v in self.rows:
            c.setFillColor(INK)
            c.setFont('DV', 8)
            c.drawRightString(self.label_w - 6, y + 3, label)
            w = max(plot_w * v / mx, 1)
            c.setFillColor(colors.HexColor(self.color))
            c.rect(self.label_w, y, max(w - 3, 0.5), self.bar_h, stroke=0, fill=1)
            c.roundRect(self.label_w + max(w - 8, 0), y, min(8, w), self.bar_h, 3, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont('DVB', 8)
            c.drawString(self.label_w + w + 5, y + 3, str(v))
            y -= self.bar_h + self.row_gap


class Roadmap(Flowable):
    """Phase lanes on a week axis. phases: [(name, start_week, end_week, gate text)]."""

    def __init__(self, phases, weeks, width=W, lane_h=17, gap=6, label_w=150):
        super().__init__()
        self.phases, self.weeks, self.width = phases, weeks, width
        self.lane_h, self.gap, self.label_w = lane_h, gap, label_w
        self.height = 20 + len(phases) * (lane_h + gap)

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        plot_w = self.width - self.label_w
        top = self.height - 14
        c.setFont('DV', 7.2)
        c.setFillColor(MUTED)
        for wk in range(0, self.weeks + 1, 2):
            x = self.label_w + plot_w * wk / self.weeks
            c.setStrokeColor(RULE)
            c.setLineWidth(0.5)
            c.line(x, 0, x, top)
            c.drawCentredString(x, top + 4, 'wk %d' % wk if wk else 'now')
        y = top - self.lane_h - 2
        for name, a, b, gate in self.phases:
            c.setFillColor(INK)
            c.setFont('DVB', 7.8)
            c.drawString(0, y + 5.5, name)
            x0 = self.label_w + plot_w * a / self.weeks
            x1 = self.label_w + plot_w * b / self.weeks
            c.setFillColor(colors.HexColor('#257de0'))
            c.roundRect(x0, y, max(x1 - x0 - 2, 3), self.lane_h, 3, stroke=0, fill=1)
            c.setFont('DV', 7.1)
            tw = stringWidth(gate, 'DV', 7.1)
            if tw + 8 < (x1 - x0):
                c.setFillColor(colors.white)
                c.drawString(x0 + 5, y + 5.6, gate)
            else:
                c.setFillColor(INK)
                c.drawString(x1 + 4, y + 5.6, gate)
            y -= self.lane_h + self.gap


class Doc(BaseDocTemplate):
    def __init__(self, path, footer_text, **kw):
        super().__init__(path, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=0.68 * inch,
                         bottomMargin=0.78 * inch, **kw)
        self.footer_text = footer_text
        frame = Frame(MARGIN, 0.78 * inch, W, PAGE_H - 0.68 * inch - 0.78 * inch, id='f', leftPadding=0,
                      rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id='p', frames=[frame], onPage=self._decorate)])
        self._bm = 0

    def _decorate(self, canv, doc):
        canv.saveState()
        canv.setStrokeColor(RULE)
        canv.setLineWidth(0.5)
        canv.line(MARGIN, 0.6 * inch, PAGE_W - MARGIN, 0.6 * inch)
        canv.setFont('DV', 7.2)
        canv.setFillColor(MUTED)
        canv.drawString(MARGIN, 0.44 * inch, self.footer_text)
        canv.drawRightString(PAGE_W - MARGIN, 0.44 * inch, 'Page %d' % doc.page)
        canv.restoreState()

    def beforeDocument(self):
        self._bm = 0

    def afterFlowable(self, fl):
        if isinstance(fl, Heading) and fl.toc_level is not None:
            self._bm += 1
            key = 'h%d' % self._bm
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(fl.toc_text, key, level=fl.toc_level, closed=fl.toc_level == 0)
            self.notify('TOCEntry', (fl.toc_level, fl.toc_text, self.page, key))


def toc():
    t = TableOfContents()
    t.levelStyles = [toc1, toc2]
    t.dotsMinLevel = 0
    return [t]
