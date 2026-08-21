const sqlite3 = require('sqlite3').verbose();
const { randomUUID } = require('crypto');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', 'data', 'wedding_rsvp.db'));
const publicToken = 'fafcb04a-7de8-40a2-b5a0-e7f2b2198c38';
const baseUrl = process.argv[2] || 'http://192.168.111.2:3000';
const attending = [
  'Ahmet Yılmaz', 'Ayşe Demir', 'Mehmet Kaya', 'Zeynep Şahin', 'Mustafa Çelik', 'Elif Yıldız', 'Ali Aydın', 'Fatma Arslan',
  'Hasan Doğan', 'Emine Kılıç', 'Hüseyin Aslan', 'Hatice Çetin', 'İbrahim Koç', 'Merve Kurt', 'Burak Özdemir', 'Seda Polat',
  'Onur Güneş', 'Buse Aksoy', 'Kerem Yalçın', 'Selin Eren', 'Murat Karaca', 'Derya Tekin', 'Can Öztürk', 'Ece Kaplan',
  'Serkan Bulut', 'Gizem Keskin', 'Tolga Avcı', 'Ceren Tunç', 'Okan Acar', 'İrem Taş', 'Barış Erdem', 'Deniz Uçar',
  'Umut Korkmaz', 'Pelin Yavuz', 'Erhan Şen', 'Aslı Özkan', 'Kaan Işık', 'Nazlı Gür', 'Volkan Dinç', 'Damla Sönmez',
  'Sinan Bozkurt', 'Esra Ateş', 'Ömer Yücel', 'Gül Ergin', 'Cem Toprak', 'Nihan Keleş', 'Arda Alkan', 'Melis Başar'
];
const companions = ['Nermin Yılmaz', 'Kemal Demir', 'Sibel Kaya', 'Orhan Şahin', 'Leyla Çelik', 'Eren Yıldız', 'Aylin Aydın'];
const declined = ['Levent Akın', 'Şule Varol', 'Recep Oral', 'Mine Sezer', 'Yusuf Ekinci', 'Aysun Duman'];
const meals = ['Etli Menü', 'Vejetaryen / Vegan', 'Etli Menü', 'Etli Menü', 'Çocuk Menüsü'];

db.get('SELECT id FROM events WHERE public_token = ?', [publicToken], (eventError, event) => {
  if (eventError || !event) {
    console.error(eventError?.message || 'Etkinlik bulunamadı.');
    return db.close();
  }

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE');
    db.run("DELETE FROM responses WHERE event_id = ? AND guest_token LIKE 'demo-v1-%'", [event.id]);
    db.run('UPDATE events SET custom_base_url = ? WHERE id = ?', [baseUrl, event.id]);
    const statement = db.prepare(`INSERT INTO responses (
      id, event_id, guest_name, status, plus_ones_count, plus_ones_names, plus_ones_details,
      meal_choice, song_request, note, guest_token, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);

    attending.forEach((name, index) => {
      const companion = index < companions.length ? companions[index] : '';
      const meal = meals[index % meals.length];
      const details = companion ? JSON.stringify([{ name: companion, meal: meals[(index + 1) % meals.length] }]) : '[]';
      const songs = ['Tarkan - Beni Çok Sev', 'Sezen Aksu - Kutlama', 'Kenan Doğulu - Aşk ile Yap'];
      const song = index % 9 === 0 ? songs[index % songs.length] : '';
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
