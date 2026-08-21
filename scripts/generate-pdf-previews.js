const fs = require('fs');
const path = require('path');
const { db, dbQuery } = require('../db');
const {
  createFloorPlanPdf,
  createGuestListPdf,
  safeFilenamePart
} = require('../pdf-export');

function writePdf(filePath, createPdf, data) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    output.on('finish', () => resolve(filePath));
    output.on('error', reject);
    createPdf(data, output);
  });
}

async function main() {
  const publicToken = process.argv[2] || 'fafcb04a-7de8-40a2-b5a0-e7f2b2198c38';
  const event = await dbQuery.get('SELECT * FROM events WHERE public_token = ?', [publicToken]);
  if (!event) throw new Error('Preview için etkinlik bulunamadı.');

  const [tables, assignments, decorations, responses] = await Promise.all([
    dbQuery.all('SELECT * FROM seating_tables WHERE event_id = ? ORDER BY rowid ASC', [event.id]),
    dbQuery.all('SELECT * FROM seat_assignments WHERE event_id = ? ORDER BY rowid ASC', [event.id]),
    dbQuery.all('SELECT * FROM seating_decorations WHERE event_id = ? ORDER BY rowid ASC', [event.id]),
    dbQuery.all('SELECT * FROM responses WHERE event_id = ? ORDER BY guest_name COLLATE NOCASE ASC', [event.id])
  ]);

  const data = { event, tables, assignments, decorations, responses };
  const outputDirectory = path.join(__dirname, '..', 'output', 'pdf');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const eventName = safeFilenamePart(event.couple_names || event.title);
  const width = Number(event.hall_width) || 10;
  const height = Number(event.hall_height) || 10;
  const guestListPath = path.join(outputDirectory, `masa_isim_listesi_${eventName}.pdf`);
  const floorPlanPath = path.join(outputDirectory, `salon_kat_plani_${width}x${height}m_${eventName}.pdf`);

  await Promise.all([
    writePdf(guestListPath, createGuestListPdf, data),
    writePdf(floorPlanPath, createFloorPlanPdf, data)
  ]);

  console.log(JSON.stringify({
    event: event.couple_names || event.title,
    tables: tables.length,
    assignments: assignments.length,
    attendingResponses: responses.filter(response => response.status === 'ATTENDING').length,
    files: [guestListPath, floorPlanPath]
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
