const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'wedding_rsvp.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

db.configure('busyTimeout', 5000);

// Helper for Promises
const dbQuery = {
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  }),
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  }),
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  })
};

function initDb() {
  return new Promise((resolve, reject) => db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  // Events Table
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      couple_names TEXT,
      event_date DATETIME NOT NULL,
      location TEXT NOT NULL,
      map_url TEXT,
      description TEXT,
      invitation_image_url TEXT,
      theme_style TEXT DEFAULT 'warm_ivory',
      custom_font TEXT DEFAULT 'Alex Brush',
      custom_accent_color TEXT DEFAULT '#b78c4a',
      custom_bg_color TEXT DEFAULT '#faf8f4',
      custom_text_color TEXT DEFAULT '#2b2925',
      custom_meal_options TEXT DEFAULT 'Etli Menü, Vejetaryen / Vegan, Çocuk Menüsü',
      custom_base_url TEXT,
      external_upload_url TEXT,
      welcome_message TEXT,
      dress_code TEXT,
      event_schedule TEXT,
      crest_style TEXT DEFAULT 'circle',
      crest_text TEXT,
      crest_font TEXT DEFAULT 'Alex Brush',
      enable_meal_choice INTEGER DEFAULT 1,
      enable_song_request INTEGER DEFAULT 1,
      hall_width INTEGER DEFAULT 10,
      hall_height INTEGER DEFAULT 10,
      admin_token TEXT UNIQUE NOT NULL,
      public_token TEXT UNIQUE NOT NULL,
      admin_password_hash TEXT,
      admin_password_salt TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Column Migrations for Events
  const columnsToAdd = [
    { name: 'couple_names', type: 'TEXT' },
    { name: 'map_url', type: 'TEXT' },
    { name: 'invitation_image_url', type: 'TEXT' },
    { name: 'theme_style', type: "TEXT DEFAULT 'warm_ivory'" },
    { name: 'custom_font', type: "TEXT DEFAULT 'Alex Brush'" },
    { name: 'custom_accent_color', type: "TEXT DEFAULT '#b78c4a'" },
    { name: 'custom_bg_color', type: "TEXT DEFAULT '#faf8f4'" },
    { name: 'custom_text_color', type: "TEXT DEFAULT '#2b2925'" },
    { name: 'custom_meal_options', type: "TEXT DEFAULT 'Etli Menü, Vejetaryen / Vegan, Çocuk Menüsü'" },
    { name: 'custom_base_url', type: 'TEXT' },
    { name: 'external_upload_url', type: 'TEXT' },
    { name: 'welcome_message', type: 'TEXT' },
    { name: 'dress_code', type: 'TEXT' },
    { name: 'event_schedule', type: 'TEXT' },
    { name: 'crest_style', type: "TEXT DEFAULT 'circle'" },
    { name: 'crest_text', type: 'TEXT' },
    { name: 'crest_font', type: "TEXT DEFAULT 'Alex Brush'" },
    { name: 'enable_meal_choice', type: 'INTEGER DEFAULT 1' },
    { name: 'enable_song_request', type: 'INTEGER DEFAULT 1' },
    { name: 'hall_width', type: 'INTEGER DEFAULT 10' },
    { name: 'hall_height', type: 'INTEGER DEFAULT 10' },
    { name: 'admin_password_hash', type: 'TEXT' },
    { name: 'admin_password_salt', type: 'TEXT' }
  ];

  columnsToAdd.forEach(col => {
    db.run(`ALTER TABLE events ADD COLUMN ${col.name} ${col.type}`, (err) => {});
  });

  // Responses Table
  db.run(`
    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      status TEXT NOT NULL,
      plus_ones_count INTEGER DEFAULT 0,
      plus_ones_names TEXT,
      plus_ones_details TEXT,
      meal_choice TEXT,
      song_request TEXT,
      note TEXT,
      guest_token TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  const responseColumns = [
    { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
  ];
  responseColumns.forEach(col => {
    db.run(`ALTER TABLE responses ADD COLUMN ${col.name} ${col.type}`, (err) => {});
  });

  // Seating Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS seating_tables (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 10,
      pos_x INTEGER DEFAULT 50,
      pos_y INTEGER DEFAULT 50,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  // Seating Assignments
  db.run(`
    CREATE TABLE IF NOT EXISTS seat_assignments (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      is_plus_one INTEGER DEFAULT 0,
      main_guest_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY(table_id) REFERENCES seating_tables(id) ON DELETE CASCADE
    )
  `);

  // Architectural Hall Decorations (Sahne, Gelin Damat Masası, Kapı, Mutfak, DJ)
  db.run(`
    CREATE TABLE IF NOT EXISTS seating_decorations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      pos_x INTEGER DEFAULT 50,
      pos_y INTEGER DEFAULT 50,
      width INTEGER DEFAULT 200,
      height INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      csrf_token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash)');
  db.run('CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)', (err) => {
    if (err) reject(err);
    else resolve();
  });
  }));
}

module.exports = {
  db,
  dbQuery,
  initDb
};
