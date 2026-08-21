const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REGULAR = path.join(__dirname, 'assets', 'fonts', 'Vera.ttf');
const FONT_BOLD = path.join(__dirname, 'assets', 'fonts', 'VeraBd.ttf');

function registerFonts(doc) {
  doc.registerFont('Vera', FONT_REGULAR);
  doc.registerFont('VeraBold', FONT_BOLD);
}

function safeFilenamePart(value, fallback = 'etkinlik') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}

function buildAttendingPeople(responses) {
  const people = [];
  (responses || []).filter(response => response.status === 'ATTENDING').forEach(response => {
    people.push(response.guest_name);
    let details = [];
    try {
      details = JSON.parse(response.plus_ones_details || '[]');
    } catch (_error) {
      details = [];
    }
    const fallbackNames = String(response.plus_ones_names || '')
      .split(/,|\n/)
      .map(name => name.trim())
      .filter(Boolean);
    for (let index = 0; index < (Number(response.plus_ones_count) || 0); index += 1) {
      people.push(
        details[index]?.name
        || fallbackNames[index]
        || `${response.guest_name} (+1 Misafir ${index + 1})`
      );
    }
  });
  return people;
}

function createGuestListPdf({ event, tables, assignments, responses }, writable) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    compress: true,
    info: { Title: `${event.couple_names || event.title} Masa Listesi` }
  });
  registerFonts(doc);
  doc.pipe(writable);

  const pageBottom = () => doc.page.height - doc.page.margins.bottom;
  const addPage = () => {
    doc.addPage();
    doc.font('Vera').fontSize(11).fillColor('#000000');
  };
  const ensureSpace = (height) => {
    if (doc.y + height > pageBottom()) addPage();
  };
  const drawSection = (title, names) => {
    ensureSpace(48);
    doc.font('VeraBold').fontSize(14).fillColor('#000000').text(title);
    doc.moveDown(0.25);
    doc.moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .lineWidth(0.7)
      .strokeColor('#000000')
      .stroke();
    doc.moveDown(0.55);

    names.forEach((name, index) => {
      if (doc.y + 18 > pageBottom()) {
        addPage();
        doc.font('VeraBold').fontSize(12).text(`${title} - devam`);
        doc.moveDown(0.45);
      }
      doc.font('Vera').fontSize(11).fillColor('#000000').text(`${index + 1}. ${name}`, {
        lineGap: 2
      });
    });
    doc.moveDown(1.1);
  };

  doc.font('VeraBold').fontSize(20).fillColor('#000000').text('Masa Listesi');
  doc.moveDown(0.25);
  doc.font('Vera').fontSize(11).fillColor('#333333').text(event.couple_names || event.title || '');
  doc.moveDown(1.4);

  (tables || []).forEach((table, tableIndex) => {
    const names = (assignments || [])
      .filter(assignment => assignment.table_id === table.id)
      .map(assignment => assignment.guest_name)
      .sort((left, right) => left.localeCompare(right, 'tr'));
    drawSection(`${tableIndex + 1}. ${table.name}`, names);
  });

  const assignedNames = new Set((assignments || []).map(assignment => assignment.guest_name));
  const unassigned = buildAttendingPeople(responses)
    .filter(name => !assignedNames.has(name))
    .sort((left, right) => left.localeCompare(right, 'tr'));
  if (unassigned.length) drawSection('Masaya Atanmayanlar', unassigned);

  doc.end();
}

function decorationColors(type) {
  const colors = {
    STAGE: ['#f0e5d8', '#a67c52', '#422d17'],
    COUPLE_TABLE: ['#fff8eb', '#b78c4a', '#7b5b29'],
    ENTRANCE: ['#e6f4ea', '#34a853', '#137333'],
    KITCHEN: ['#fff4cf', '#d99b00', '#8a5600'],
    DJ_BOOTH: ['#eceef1', '#6d7278', '#303438']
  };
  return colors[type] || ['#eee7dd', '#9a7d58', '#4a3b2b'];
}

function createFloorPlanPdf({ event, tables, assignments, decorations }, writable) {
  const widthMeters = Number(event.hall_width) || 10;
  const heightMeters = Number(event.hall_height) || 10;
  const layout = widthMeters / heightMeters > 1.15 ? 'landscape' : 'portrait';
  const doc = new PDFDocument({
    size: 'A4',
    layout,
    margin: 24,
    compress: true,
    info: { Title: `${event.couple_names || event.title} Salon Planı` }
  });
  registerFonts(doc);
  doc.pipe(writable);

  const sourceWidth = Math.max(400, widthMeters * 80);
  const sourceHeight = Math.max(400, heightMeters * 80);
  const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const availableHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const planWidth = sourceWidth * scale;
  const planHeight = sourceHeight * scale;
  const originX = doc.page.margins.left + (availableWidth - planWidth) / 2;
  const originY = doc.page.margins.top + (availableHeight - planHeight) / 2;
  const sx = value => originX + (Number(value) || 0) * scale;
  const sy = value => originY + (Number(value) || 0) * scale;

  doc.rect(originX, originY, planWidth, planHeight).fill('#faf8f5');
  doc.fillColor('#d8cbb8');
  for (let x = 18; x < sourceWidth; x += 24) {
    for (let y = 18; y < sourceHeight; y += 24) {
      doc.circle(sx(x), sy(y), Math.max(0.45, scale * 0.9)).fill('#d8cbb8');
    }
  }
  doc.rect(originX, originY, planWidth, planHeight)
    .lineWidth(Math.max(1.2, scale * 3))
    .strokeColor('#7c6848')
    .stroke();

  const titleSize = Math.max(7, 11 * scale);
  doc.font('VeraBold').fontSize(titleSize).fillColor('#8f5558')
    .text(`${(event.couple_names || event.title || 'SALON').toUpperCase()} KAT PLANI`, sx(16), sy(14), {
      width: planWidth * 0.62,
      lineBreak: false
    });
  doc.text(`${widthMeters}m x ${heightMeters}m`, sx(sourceWidth - 170), sy(14), {
    width: 154 * scale,
    align: 'right',
    lineBreak: false
  });

  (decorations || []).forEach(decoration => {
    const x = Math.max(5, Number(decoration.pos_x) || 40);
    const y = Math.max(34, Number(decoration.pos_y) || 40);
    const width = Math.max(80, Number(decoration.width) || 180);
    const height = Math.max(40, Number(decoration.height) || 80);
    const [fill, stroke, textColor] = decorationColors(decoration.type);
    doc.roundedRect(sx(x), sy(y), width * scale, height * scale, Math.max(3, 8 * scale))
      .fillAndStroke(fill, stroke);
    doc.font('VeraBold').fontSize(Math.max(6, 12 * scale)).fillColor(textColor)
      .text(decoration.label, sx(x + 8), sy(y + 12), {
        width: Math.max(30, (width - 16) * scale),
        height: Math.max(18, (height - 20) * scale),
        align: 'center',
        ellipsis: true
      });
  });

  (tables || []).forEach((table, index) => {
    const tableAssignments = (assignments || []).filter(assignment => assignment.table_id === table.id);
    const x = Number.isFinite(Number(table.pos_x)) ? Number(table.pos_x) : 30 + (index % 3) * 220;
    const y = Number.isFinite(Number(table.pos_y)) ? Number(table.pos_y) : 140 + Math.floor(index / 3) * 160;
    const width = 185;
    const height = 135;
    const isFull = tableAssignments.length >= Number(table.capacity);
    doc.roundedRect(sx(x), sy(y), width * scale, height * scale, Math.max(4, 9 * scale))
      .fillAndStroke('#ffffff', isFull ? '#a95454' : '#9a6d6f');
    doc.font('VeraBold').fontSize(Math.max(7, 13 * scale)).fillColor('#2f2923')
      .text(String(table.name), sx(x + 10), sy(y + 11), {
        width: (width - 20) * scale,
        lineBreak: false,
        ellipsis: true
      });
    doc.moveTo(sx(x + 9), sy(y + 32)).lineTo(sx(x + width - 9), sy(y + 32))
      .lineWidth(0.6).strokeColor('#ddd5cb').stroke();
    doc.font('Vera').fontSize(Math.max(6, 9 * scale)).fillColor('#716a62')
      .text(`${tableAssignments.length}/${table.capacity} kişi`, sx(x + 10), sy(y + 39), {
        width: (width - 20) * scale,
        lineBreak: false
      });
    const names = tableAssignments.map(assignment => assignment.guest_name).join(', ') || 'Boş masa';
    doc.font('Vera').fontSize(Math.max(5.5, 8.5 * scale)).fillColor('#3b3530')
      .text(names, sx(x + 10), sy(y + 57), {
        width: (width - 20) * scale,
        height: (height - 65) * scale,
        ellipsis: true
      });
  });

  doc.end();
}

module.exports = {
  buildAttendingPeople,
  createFloorPlanPdf,
  createGuestListPdf,
  safeFilenamePart
};
