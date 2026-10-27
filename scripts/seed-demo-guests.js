const sqlite3 = require('sqlite3').verbose();
const { randomUUID } = require('crypto');
const path = require('path');

const publicToken = process.argv[2];
const baseUrl = process.argv[3] || '';
if (!publicToken) {
  console.error('Kullanım: node scripts/seed-demo-guests.js <etkinlik-kodu> [site-adresi]');
  process.exit(1);
}
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const db = new sqlite3.Database(path.join(dataDir, 'wedding_rsvp.db'), sqlite3.OPEN_READWRITE);
const attending = Array.from({ length: 48 }, (_, index) => `Demo Konuk ${index + 1}`);
const companions = Array.from({ length: 7 }, (_, index) => `Demo Refakatçi ${index + 1}`);
const declined = Array.from({ length: 6 }, (_, index) => `Demo Katılmayan ${index + 1}`);
const meals = ['Etli Menü', 'Vejetaryen / Vegan', 'Etli Menü', 'Etli Menü', 'Çocuk Menüsü'];

db.get('SELECT id FROM events WHERE public_token = ?', [publicToken], (eventError, event) => {
  if (eventError || !event) {
    console.error(eventError?.message || 'Etkinlik bulunamadı.');
    return db.close();
  }

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE');
    db.run("DELETE FROM responses WHERE event_id = ? AND guest_token LIKE 'demo-v1-%'", [event.id]);
    if (baseUrl) db.run('UPDATE events SET custom_base_url = ? WHERE id = ?', [baseUrl, event.id]);
    const statement = db.prepare(`INSERT INTO responses (
      id, event_id, guest_name, status, plus_ones_count, plus_ones_names, plus_ones_details,
      meal_choice, song_request, note, guest_token, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);

    attending.forEach((name, index) => {
      const companion = index < companions.length ? companions[index] : '';
      const meal = meals[index % meals.length];
      const details = companion ? JSON.stringify([{ name: companion, meal: meals[(index + 1) % meals.length] }]) : '[]';
      const song = index % 9 === 0 ? `Demo Şarkı ${index + 1}` : '';
      statement.run(randomUUID(), event.id, name, 'ATTENDING', companion ? 1 : 0, companion, details, meal, song, '', `demo-v1-attending-${index + 1}`);
    });
    declined.forEach((name, index) => {
      statement.run(randomUUID(), event.id, name, 'DECLINED', 0, '', '[]', '', '', '', `demo-v1-declined-${index + 1}`);
    });

    statement.finalize(finalizeError => {
      if (finalizeError) {
        return db.run('ROLLBACK', () => {
          console.error(finalizeError.message);
          db.close();
        });
      }
      db.run('COMMIT', commitError => {
        if (commitError) {
          console.error(commitError.message);
          return db.close();
        }
        db.get(`SELECT
          SUM(CASE WHEN status='ATTENDING' THEN 1 ELSE 0 END) AS attending_responses,
          SUM(CASE WHEN status='ATTENDING' THEN 1 + plus_ones_count ELSE 0 END) AS attending_people,
          SUM(CASE WHEN status='DECLINED' THEN 1 ELSE 0 END) AS declined_responses
          FROM responses WHERE event_id = ? AND guest_token LIKE 'demo-v1-%'`, [event.id], (countError, counts) => {
          if (countError) console.error(countError.message);
          else console.log(JSON.stringify({ base_url: baseUrl, ...counts }, null, 2));
          db.close();
        });
      });
    });
  });
});
