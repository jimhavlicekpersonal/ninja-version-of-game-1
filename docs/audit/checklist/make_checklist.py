from reportlab.lib.pagesizes import letter
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether, Flowable)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import sys

pdfmetrics.registerFont(TTFont('DV', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('CJK', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', subfontIndex=0))
import re
_cjk = re.compile(r'([\u3000-\u9fff\uff00-\uffef]+)')
def cjk(text):
    return _cjk.sub(r'<font name="CJK">\1</font>', text)
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily('DV', normal='DV', bold='DVB', italic='DV', boldItalic='DVB')

INK = colors.HexColor('#1d2330'); MUTED = colors.HexColor('#5b6475'); ACCENT = colors.HexColor('#8a2b2b')
TAGC = {'CODE': '#2f5d9b', 'OWNER': '#8a5a00', 'DEVICE': '#2d7a4a', 'LEGAL': '#7a2d6b',
        'ART': '#b0472a', 'DESIGN': '#4a4f9b', 'DOCS': '#5b6475'}

body = ParagraphStyle('b', fontName='DV', fontSize=8.6, leading=11, textColor=INK)
small = ParagraphStyle('s', parent=body, fontSize=7.8, leading=10, textColor=MUTED)
h1 = ParagraphStyle('h1', fontName='DVB', fontSize=22, leading=27, textColor=INK, spaceAfter=4)
h2 = ParagraphStyle('h2', fontName='DVB', fontSize=13, leading=16, textColor=ACCENT, spaceBefore=10, spaceAfter=2)
h3 = ParagraphStyle('h3', fontName='DVB', fontSize=9.6, leading=12, textColor=INK, spaceBefore=6, spaceAfter=2)
intro = ParagraphStyle('i', parent=body, fontSize=9.4, leading=13)


class Box(Flowable):
    def wrap(self, aw, ah):
        return 9, 9
    def draw(self):
        self.canv.setStrokeColor(INK); self.canv.setLineWidth(0.8)
        self.canv.rect(0, 0, 8, 8)


def tagpara(tags):
    out = []
    for t in tags.split():
        out.append(f'<font color="{TAGC[t]}"><b>{t}</b></font>')
    return Paragraph(' '.join(out), ParagraphStyle('t', parent=small, fontSize=6.8, leading=8.5))


from content import SECTIONS, SUMMARY_ROWS

total = sum(len(it) for _, _, subs in SECTIONS for _, it in subs)
counts = {}
for _, _, subs in SECTIONS:
    for _, items in subs:
        for _, tags in items:
            for t in tags.split():
                counts[t] = counts.get(t, 0) + 1

out = sys.argv[1]
doc = SimpleDocTemplate(out, pagesize=letter, leftMargin=0.6*inch, rightMargin=0.6*inch,
                        topMargin=0.6*inch, bottomMargin=0.6*inch,
                        title='Kagemura: Ninja Clans — What Needs Building or Fixing',
                        author='Claude Code review, 2026-11-13')
W = letter[0] - 1.2*inch
story = []
story.append(Paragraph('Kagemura: Ninja Clans', h1))
story.append(Paragraph('Everything that still needs to be built or fixed — a checklist', ParagraphStyle('sub', parent=h2, spaceBefore=0)))
story.append(Paragraph('Reviewed 2026-11-13 at commit <b>2174d05</b> (main). Sources: the live code, every audit in '
    '<i>docs/audit/</i> and <i>docs/store/WORLDWIDE_AUDIT.md</i>, the balance audit, the fresh-slate review, the PvP roadmap, '
    'SHIPPING/RELEASE/TESTING checklists, the legal and localization docs, and a fresh test and build run. Items already closed '
    'in code are left out; items whose closure left a stated limitation are kept.', intro))
story.append(Spacer(1, 8))

story.append(Paragraph('Build health today', h3))
t = Table([[Paragraph(a, body), Paragraph(b, body)] for a, b in SUMMARY_ROWS], colWidths=[1.9*inch, W-1.9*inch])
t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#c9ced8')),
                       ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f3f7')),
                       ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]))
story.append(t)
story.append(Spacer(1, 8))
story.append(Paragraph('Who does it (tag on every item)', h3))
legend = [
    ('CODE', 'An engineering change in this repository.'),
    ('DESIGN', 'A game-design or balance decision first, then usually code.'),
    ('ART', 'Needs a human artist, composer or writer.'),
    ('OWNER', 'Accounts, money, consoles, hosting, business decisions: only the owner can do it.'),
    ('LEGAL', 'Needs a lawyer or a legal decision.'),
    ('DEVICE', 'Must be checked on a physical phone or a signed store build.'),
    ('DOCS', 'Documentation that is wrong or stale.'),
]
lt = Table([[tagpara(k), Paragraph(v + f'  <font color="#5b6475">({counts.get(k,0)} items)</font>', body)] for k, v in legend],
           colWidths=[0.8*inch, W-0.8*inch])
lt.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 1), ('BOTTOMPADDING', (0, 0), (-1, -1), 1)]))
story.append(lt)
story.append(Spacer(1, 8))
story.append(Paragraph('Sections', h3))
for i, (title, note, subs) in enumerate(SECTIONS, 1):
    n = sum(len(it) for _, it in subs)
    story.append(Paragraph(f'{i}. {title} <font color="#5b6475">— {n} items</font>', body))
story.append(Spacer(1, 4))
story.append(Paragraph(f'<b>{total} items in total.</b> Priority runs top to bottom: sections 1–3 block any launch, 4–9 block a '
                       'good launch, 10–14 make the game competitive and keep it maintainable, 15–17 are the owner and launch work, 18 is the separate mainland China track.', body))
story.append(PageBreak())

for i, (title, note, subs) in enumerate(SECTIONS, 1):
    story.append(Paragraph(f'{i}. {title}', h2))
    if note:
        story.append(Paragraph(cjk(note), small))
    for sub, items in subs:
        rows = []
        for text, tags in items:
            rows.append([Box(), Paragraph(cjk(text), body), tagpara(tags)])
        tbl = Table(rows, colWidths=[0.22*inch, W-0.22*inch-0.95*inch, 0.95*inch])
        tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                 ('TOPPADDING', (0, 0), (-1, -1), 2.2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.2),
                                 ('LEFTPADDING', (0, 0), (0, -1), 0), ('TOPPADDING', (0, 0), (0, -1), 4),
                                 ('LINEBELOW', (0, 0), (-1, -1), 0.3, colors.HexColor('#e2e5ec'))]))
        head = Paragraph(sub, h3) if sub else Spacer(1, 2)
        story.append(KeepTogether([head, tbl]) if len(rows) <= 6 else head)
        if len(rows) > 6:
            story.append(tbl)


def footer(c, d):
    c.saveState(); c.setFont('DV', 7); c.setFillColor(MUTED)
    c.drawString(0.6*inch, 0.38*inch, 'Kagemura — build & fix checklist — 2026-11-13 — commit 2174d05')
    c.drawRightString(letter[0]-0.6*inch, 0.38*inch, f'Page {d.page}')
    c.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(total, counts)
