import json
import os
import sqlite3

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, 'data', 'wedding_rsvp.db')
OUTPUT_PATH = os.path.join(ROOT, 'output', 'pdf', 'masa_isim_listesi_Elif_Ercan.pdf')
PUBLIC_TOKEN = 'fafcb04a-7de8-40a2-b5a0-e7f2b2198c38'

pdfmetrics.registerFont(TTFont('WeddingSans', r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('WeddingSansBold', r'C:\Windows\Fonts\arialbd.ttf'))

connection = sqlite3.connect(DB_PATH)
connection.row_factory = sqlite3.Row
event = connection.execute(
    'SELECT id, title, couple_names FROM events WHERE public_token = ?', (PUBLIC_TOKEN,)
).fetchone()
tables = connection.execute(
    'SELECT id, name, capacity FROM seating_tables WHERE event_id = ? ORDER BY created_at, rowid',
    (event['id'],),
).fetchall()
assignments = connection.execute(
    'SELECT table_id, guest_name, is_plus_one, main_guest_name FROM seat_assignments WHERE event_id = ? ORDER BY rowid',
    (event['id'],),
).fetchall()
responses = connection.execute(
    "SELECT guest_name, plus_ones_count, plus_ones_names, plus_ones_details FROM responses WHERE event_id = ? AND status = 'ATTENDING' ORDER BY rowid",
    (event['id'],),
).fetchall()
connection.close()

people = []
for response in responses:
    people.append({'name': response['guest_name'], 'main': '', 'plus': False})
    try:
        details = json.loads(response['plus_ones_details'] or '[]')
    except (TypeError, json.JSONDecodeError):
        details = []
    fallback = [
        name.strip()
        for name in (response['plus_ones_names'] or '').replace('\n', ',').split(',')
        if name.strip()
    ]
    for index in range(response['plus_ones_count'] or 0):
        name = (
            (details[index].get('name') if index < len(details) else '')
            or (fallback[index] if index < len(fallback) else f"{response['guest_name']} (+1)")
        )
        people.append({'name': name, 'main': response['guest_name'], 'plus': True})

assigned_names = {assignment['guest_name'] for assignment in assignments}
unassigned = [person for person in people if person['name'] not in assigned_names]

styles = getSampleStyleSheet()
title_style = ParagraphStyle(
    'TitleTR', parent=styles['Title'], fontName='WeddingSansBold', fontSize=22,
    leading=27, alignment=TA_CENTER, textColor=colors.HexColor('#28241f'), spaceAfter=5 * mm,
)
subtitle_style = ParagraphStyle(
    'SubtitleTR', parent=styles['Normal'], fontName='WeddingSans', fontSize=9,
    leading=12, alignment=TA_CENTER, textColor=colors.HexColor('#6f685e'), spaceAfter=9 * mm,
)
heading_style = ParagraphStyle(
    'HeadingTR', parent=styles['Heading2'], fontName='WeddingSansBold', fontSize=12,
    leading=15, textColor=colors.HexColor('#302a24'),
)
body_style = ParagraphStyle(
    'BodyTR', parent=styles['Normal'], fontName='WeddingSans', fontSize=9.5,
    leading=13, textColor=colors.HexColor('#302a24'),
)
small_style = ParagraphStyle(
    'SmallTR', parent=body_style, fontSize=7.5, leading=10, textColor=colors.HexColor('#777067'),
)


def create_table_block(name, capacity_text, rows, empty_text=None):
    header = Table(
        [[Paragraph(name, heading_style), Paragraph(capacity_text, small_style)]],
        colWidths=[125 * mm, 40 * mm],
    )
    header.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f3f0ea')),
        ('BOX', (0, 0), (-1, -1), 0.7, colors.HexColor('#d4cdc2')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5 * mm),
        ('TOPPADDING', (0, 0), (-1, -1), 3 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * mm),
    ]))

    content_rows = []
    if rows:
        for row_index in range(0, len(rows), 2):
            pair = []
            for person in rows[row_index:row_index + 2]:
                companion = (
                    f"<br/><font size='7' color='#777067'>Eşlik ettiği kişi: {person['main']}</font>"
                    if person.get('plus') else ''
                )
                pair.append(Paragraph(
                    f"{row_index + len(pair) + 1}. <b>{person['name']}</b>{companion}", body_style
                ))
            while len(pair) < 2:
                pair.append('')
            content_rows.append(pair)
    else:
        content_rows = [[Paragraph(empty_text or 'Kayıt bulunmuyor.', small_style), '']]

    content = Table(content_rows, colWidths=[82.5 * mm, 82.5 * mm])
    content.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.7, colors.HexColor('#d4cdc2')),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#eee9e1')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5 * mm),
        ('TOPPADDING', (0, 0), (-1, -1), 3 * mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * mm),
    ]))
    block = [header, content, Spacer(1, 6 * mm)]
    # Keep short table sections together, but allow long lists to start on the
    # current page and flow naturally onto following pages.
    return [KeepTogether(block)] if len(rows) <= 12 else block


story = [
    Paragraph(event['couple_names'] or event['title'], title_style),
    Paragraph(
        f"Masa İsim Listesi | {len(people)} katılımcı | {len(tables)} masa", subtitle_style
    ),
]

for index, table in enumerate(tables, 1):
    rows = [
        {
            'name': assignment['guest_name'],
            'plus': bool(assignment['is_plus_one']),
            'main': assignment['main_guest_name'] or '',
        }
        for assignment in assignments
        if assignment['table_id'] == table['id']
    ]
    story.extend(create_table_block(
        f"{index}. {table['name']}", f"{len(rows)} / {table['capacity']} kişi", rows,
        'Bu masaya henüz katılımcı atanmadı.',
    ))

if unassigned:
    story.extend(create_table_block('Masaya Atanmayanlar', f"{len(unassigned)} kişi", unassigned))


def draw_footer(canvas, document):
    canvas.saveState()
    canvas.setFont('WeddingSans', 7.5)
    canvas.setFillColor(colors.HexColor('#777067'))
    canvas.drawString(20 * mm, 10 * mm, 'Elif & Ercan - Masa İsim Listesi')
    canvas.drawRightString(190 * mm, 10 * mm, f'Sayfa {document.page}')
    canvas.restoreState()


os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
document = SimpleDocTemplate(
    OUTPUT_PATH, pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm,
    topMargin=18 * mm, bottomMargin=17 * mm, title='Elif & Ercan Masa İsim Listesi',
)
document.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
print(OUTPUT_PATH)
