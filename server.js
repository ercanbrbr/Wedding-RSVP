const express = require('express');
const path = require('path');
const { randomUUID, randomBytes, createHash, scrypt: scryptCallback, timingSafeEqual } = require('crypto');
const { promisify } = require('util');
const multer = require('multer');
const fs = require('fs');

const envPath = path.join(__dirname, '.env');
if (typeof process.loadEnvFile === 'function' && fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
const { db, dbQuery, initDb } = require('./db');
const {
  createFloorPlanPdf,
  createGuestListPdf,
  safeFilenamePart
} = require('./pdf-export');

const app = express();
const uuidv4 = randomUUID;
const scrypt = promisify(scryptCallback);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_COOKIE = 'wedding_admin_session';
const SETUP_KEY = process.env.SETUP_KEY || '';

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Middleware
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  if (isProduction && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Upload directory setup
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, {
  dotfiles: 'deny',
  fallthrough: false,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

function rateLimit({ windowMs, max }) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    if (clients.size >= 5000) {
      for (const [clientKey, value] of clients) {
        if (value.resetAt <= now) clients.delete(clientKey);
      }
      while (clients.size >= 5000) {
        clients.delete(clients.keys().next().value);
      }
    }
    const current = clients.get(key);
    if (!current || current.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', max - 1);
      res.setHeader('RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
      return next();
    }
    current.count += 1;
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - current.count));
    res.setHeader('RateLimit-Reset', Math.ceil(current.resetAt / 1000));
    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.' });
    }
    next();
  };
}

const createEventLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const rsvpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function safeStringEqual(left, right) {
  const leftHash = createHash('sha256').update(String(left || '')).digest();
  const rightHash = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return { hash: derived.toString('hex'), salt };
}

async function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function validatePassword(password) {
  return typeof password === 'string'
    && password.length >= 12
    && password.length <= 128
    && /[a-zçğıöşü]/i.test(password)
    && /\d/.test(password);
}

function isOptionalHttpUrl(value) {
  if (!value || !String(value).trim()) return true;
  try {
    return ['http:', 'https:'].includes(new URL(String(value).trim()).protocol);
  } catch (err) {
    return false;
  }
}

function validHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function validateEventInput(body) {
  const title = String(body.title || '').trim();
  const location = String(body.location || '').trim();
  if (!title || !location || !body.event_date) return 'Başlık, tarih ve mekan alanları zorunludur.';
  if (title.length > 150 || location.length > 300 || String(body.description || '').length > 3000) {
    return 'Etkinlik bilgilerinden biri izin verilen uzunluğu aşıyor.';
  }
  if (Number.isNaN(Date.parse(body.event_date))) return 'Geçerli bir etkinlik tarihi girin.';
  const invitationUrl = String(body.invitation_image_url || '').trim();
  const validInvitationUrl = !invitationUrl
    || isOptionalHttpUrl(invitationUrl)
    || /^\/uploads\/[a-zA-Z0-9._-]+$/.test(invitationUrl);
  if (!isOptionalHttpUrl(body.map_url) || !isOptionalHttpUrl(body.custom_base_url) || !validInvitationUrl) {
    return 'Bağlantılar geçerli bir http:// veya https:// adresi olmalıdır.';
  }
  const allowedThemes = ['warm_ivory', 'botanical_sage', 'blush_rose', 'noir_gold', 'sage_linen', 'burgundy_cream'];
  const allowedFonts = ['Alex Brush', 'Corinthia', 'Italianno', 'Parisienne', 'Great Vibes', 'Cormorant Garamond', 'Bodoni Moda', 'Playfair Display', 'Cinzel', 'Prata', 'Lora', 'Spectral', 'Libre Baskerville', 'DM Sans'];
  if (body.theme_style && !allowedThemes.includes(body.theme_style)) return 'Geçersiz tema seçimi.';
  if (body.custom_font && !allowedFonts.includes(body.custom_font)) return 'Geçersiz yazı tipi seçimi.';
  if (body.crest_font && !allowedFonts.includes(body.crest_font)) return 'Geçersiz amblem yazı tipi seçimi.';
  for (const color of [body.custom_accent_color, body.custom_bg_color, body.custom_text_color].filter(Boolean)) {
    if (!validHexColor(color)) return 'Geçersiz renk değeri.';
  }
  if (String(body.event_schedule || '').length > 10000) return 'Etkinlik programı çok uzun.';
  return null;
}

function setSessionCookie(req, res, token, maxAgeMs = SESSION_TTL_MS) {
  const secure = req.secure || process.env.SECURE_COOKIES === '1';
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function createAdminSession(req, res, eventId) {
  const rawToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await dbQuery.run('DELETE FROM admin_sessions WHERE expires_at <= ?', [new Date().toISOString()]);
  await dbQuery.run(
    `DELETE FROM admin_sessions WHERE event_id = ? AND id NOT IN (
      SELECT id FROM admin_sessions WHERE event_id = ? ORDER BY created_at DESC LIMIT 9
    )`,
    [eventId, eventId]
  );
  await dbQuery.run(
    'INSERT INTO admin_sessions (id, event_id, token_hash, csrf_token, expires_at) VALUES (?, ?, ?, ?, ?)',
    [uuidv4(), eventId, tokenHash(rawToken), csrfToken, expiresAt]
  );
  setSessionCookie(req, res, rawToken);
  return csrfToken;
}

async function authenticateSession(req) {
  const rawToken = parseCookies(req)[SESSION_COOKIE];
  if (!rawToken) return null;
  return dbQuery.get(
    `SELECT s.id AS session_id, s.csrf_token, s.event_id, e.admin_token
     FROM admin_sessions s JOIN events e ON e.id = s.event_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash(rawToken), new Date().toISOString()]
  );
}

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  const expected = `${req.protocol}://${req.get('host')}`;
  return origin === expected;
}

async function requireAuthenticatedSession(req, res, next) {
  try {
    const session = await authenticateSession(req);
    if (!session) return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
    req.adminSession = session;
    next();
  } catch (err) {
    next(err);
  }
}

function requireCsrf(req, res, next) {
  if (!sameOrigin(req) || req.get('x-csrf-token') !== req.adminSession.csrf_token) {
    return res.status(403).json({ error: 'Güvenlik doğrulaması başarısız.' });
  }
  next();
}

// Keep the existing internal handlers while exposing only the non-secret /session URL.
app.use(async (req, res, next) => {
  if (!req.url.startsWith('/api/admin/session')) return next();
  try {
    const session = await authenticateSession(req);
    if (!session) return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!sameOrigin(req) || req.get('x-csrf-token') !== session.csrf_token) {
        return res.status(403).json({ error: 'Güvenlik doğrulaması başarısız.' });
      }
    }
    req.url = req.url.replace(/^\/api\/admin\/session/, `/api/admin/${session.admin_token}`);
    req.adminSession = session;
    next();
  } catch (err) {
    next(err);
  }
});

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const extensions = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif'
    };
    const ext = extensions[file.mimetype];
    cb(null, `invitation_${Date.now()}_${uuidv4().substring(0, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece görsel dosyaları yükleyebilirsiniz.'));
    }
  }
});

async function requireAdmin(req, res, next) {
  try {
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [req.params.adminToken]);
    if (!event) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    }
    req.adminEvent = event;
    next();
  } catch (err) {
    next(err);
  }
}

function detectImageMime(filePath) {
  const buffer = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (bytesRead < 6) return null;
    const hex = buffer.subarray(0, bytesRead).toString('hex');
    const gifHeader = buffer.subarray(0, 6).toString('ascii');
    if (hex.startsWith('ffd8ff')) return 'image/jpeg';
    if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return 'image/gif';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

// Helper for building URLs
function getPublicUrl(req, event) {
  if (event.custom_base_url && event.custom_base_url.trim()) {
    const baseUrl = event.custom_base_url.trim().replace(/\/+$/, '');
    return `${baseUrl}/e/${event.public_token}`;
  }
  const host = req.get('host');
  const protocol = req.protocol;
  return `${protocol}://${host}/e/${event.public_token}`;
}

function getAdminUrl(req, event) {
  if (event.custom_base_url && event.custom_base_url.trim()) {
    const baseUrl = event.custom_base_url.trim().replace(/\/+$/, '');
    return `${baseUrl}/admin`;
  }
  const host = req.get('host');
  const protocol = req.protocol;
  return `${protocol}://${host}/admin`;
}

// ================= API ENDPOINTS =================

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { event_code, password } = req.body;
    const code = String(event_code || '').trim().split('/').filter(Boolean).pop();
    const event = await dbQuery.get('SELECT * FROM events WHERE public_token = ?', [code]);
    const valid = event && await verifyPassword(password || '', event.admin_password_salt, event.admin_password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Etkinlik kodu veya parola hatalı.' });
    }
    const csrfToken = await createAdminSession(req, res, event.id);
    res.json({ success: true, csrf_token: csrfToken, admin_url: '/admin' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/legacy-setup', loginLimiter, async (req, res, next) => {
  try {
    const { legacy_token, password } = req.body;
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Parola en az 12 karakter olmalı ve en az bir harf ile bir rakam içermelidir.' });
    }
    const event = await dbQuery.get(
      'SELECT id, admin_password_hash FROM events WHERE admin_token = ?',
      [String(legacy_token || '')]
    );
    if (!event || event.admin_password_hash) {
      return res.status(401).json({ error: 'Geçiş bağlantısı geçersiz veya daha önce kullanılmış.' });
    }
    const passwordData = await hashPassword(password);
    await dbQuery.run(
      'UPDATE events SET admin_password_hash = ?, admin_password_salt = ?, admin_token = ? WHERE id = ?',
      [passwordData.hash, passwordData.salt, uuidv4(), event.id]
    );
    const csrfToken = await createAdminSession(req, res, event.id);
    res.json({ success: true, csrf_token: csrfToken, admin_url: '/admin' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/logout', requireAuthenticatedSession, requireCsrf, async (req, res, next) => {
  try {
    await dbQuery.run('DELETE FROM admin_sessions WHERE id = ?', [req.adminSession.session_id]);
    setSessionCookie(req, res, '', 0);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.use('/api/admin/:adminToken', (req, res, next) => {
  if (!req.adminSession) return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
  next();
});

// 1. Create New Wedding Event
app.post('/api/events', createEventLimiter, async (req, res) => {
  try {
    if (isProduction && (!SETUP_KEY || !safeStringEqual(req.get('x-setup-key'), SETUP_KEY))) {
      return res.status(403).json({ error: 'Geçerli sunucu kurulum anahtarı gerekli.' });
    }
    const {
      title, couple_names, event_date, location, map_url, description,
      invitation_image_url, theme_style, custom_font, custom_accent_color, custom_bg_color, custom_text_color,
      custom_meal_options, custom_base_url, welcome_message, dress_code, event_schedule, crest_style, crest_text, crest_font,
      enable_meal_choice, enable_song_request, hall_width, hall_height, admin_password
    } = req.body;

    const inputError = validateEventInput(req.body);
    if (inputError) return res.status(400).json({ error: inputError });
    if (!validatePassword(admin_password)) {
      return res.status(400).json({ error: 'Yönetici parolası en az 12 karakter olmalı ve en az bir harf ile bir rakam içermelidir.' });
    }

    const id = uuidv4();
    const adminToken = uuidv4();
    const publicToken = uuidv4();
    const password = await hashPassword(admin_password);

    const defaultSchedule = JSON.stringify([
      { time: '19:00', title: 'Karşılama & Kokteyl', icon: '' },
      { time: '20:00', title: 'Nikah Töreni', icon: '' },
      { time: '21:00', title: 'Düğün Yemeği & Dans', icon: '' }
    ]);

    await dbQuery.run(
      `INSERT INTO events (
        id, title, couple_names, event_date, location, map_url, description,
        invitation_image_url, theme_style, custom_font, custom_accent_color, custom_bg_color, custom_text_color,
        custom_meal_options, custom_base_url, welcome_message, dress_code, event_schedule, crest_style, crest_text, crest_font,
        enable_meal_choice, enable_song_request, hall_width, hall_height, admin_token, public_token,
        admin_password_hash, admin_password_salt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title.trim(),
        couple_names ? couple_names.trim() : title.trim(),
        event_date,
        location.trim(),
        map_url ? map_url.trim() : '',
        description ? description.trim() : '',
        invitation_image_url ? invitation_image_url.trim() : '',
        theme_style || 'warm_ivory',
        custom_font || 'Alex Brush',
        custom_accent_color || '#b78c4a',
        custom_bg_color || '#faf8f4',
        custom_text_color || '#2b2925',
        custom_meal_options ? custom_meal_options.trim() : 'Etli Menü, Vejetaryen / Vegan, Çocuk Menüsü',
        custom_base_url ? custom_base_url.trim() : '',
        welcome_message ? welcome_message.trim() : 'Bu mutlu günümüzde sizleri aramızda görmekten onur duyarız.',
        dress_code ? dress_code.trim() : 'Şık Giyim (Formal / Black Tie)',
        event_schedule || defaultSchedule,
        crest_style || 'circle',
        crest_text ? crest_text.trim() : '',
        crest_font || 'Alex Brush',
        enable_meal_choice !== undefined ? (enable_meal_choice ? 1 : 0) : 1,
        enable_song_request !== undefined ? (enable_song_request ? 1 : 0) : 1,
        hall_width ? parseInt(hall_width) : 10,
        hall_height ? parseInt(hall_height) : 10,
        adminToken,
        publicToken,
        password.hash,
        password.salt
      ]
    );

    const createdEvent = await dbQuery.get('SELECT * FROM events WHERE id = ?', [id]);
    const publicUrl = getPublicUrl(req, createdEvent);
    const adminUrl = getAdminUrl(req, createdEvent);
    const csrfToken = await createAdminSession(req, res, id);

    res.json({
      success: true,
      event: {
        ...createdEvent,
        admin_token: undefined,
        admin_password_hash: undefined,
        admin_password_salt: undefined,
        public_url: publicUrl,
        admin_url: adminUrl
      },
      csrf_token: csrfToken
    });
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Etkinlik oluşturulurken sunucu hatası meydana geldi.' });
  }
});

// 2. Fetch Event Data for Admin Dashboard
app.get('/api/admin/:adminToken', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { adminToken } = req.params;
    const event = await dbQuery.get('SELECT * FROM events WHERE admin_token = ?', [adminToken]);

    if (!event) {
      return res.status(404).json({ error: 'Yönetim paneli bulunamadı.' });
    }

    const responses = await dbQuery.all(
      'SELECT * FROM responses WHERE event_id = ? ORDER BY rowid DESC',
      [event.id]
    );

    let totalAttendingPeople = 0;
    let attendingMainCount = 0;
    let declinedMainCount = 0;
    let totalPlusOnesCount = 0;

    responses.forEach(r => {
      if (r.status === 'ATTENDING') {
        attendingMainCount += 1;
        const plusOnes = r.plus_ones_count || 0;
        totalPlusOnesCount += plusOnes;
        totalAttendingPeople += (1 + plusOnes);
      } else if (r.status === 'DECLINED') {
        declinedMainCount += 1;
      }
    });

    const publicUrl = getPublicUrl(req, event);
    const adminUrl = getAdminUrl(req, event);

    res.json({
      success: true,
      event: {
        ...event,
        admin_token: 'session',
        admin_password_hash: undefined,
        admin_password_salt: undefined,
        public_url: publicUrl,
        admin_url: adminUrl
      },
      csrf_token: req.adminSession.csrf_token,
      stats: {
        total_responses: responses.length,
        total_attending_people: totalAttendingPeople,
        attending_main_count: attendingMainCount,
        declined_main_count: declinedMainCount,
        total_plus_ones_count: totalPlusOnesCount
      },
      responses
    });
  } catch (err) {
    console.error('Error fetching admin data:', err);
    res.status(500).json({ error: 'Yönetim verileri getirilemedi.' });
  }
});

// 3. Update Event Details (Admin)
app.put('/api/admin/:adminToken', async (req, res) => {
  try {
    const { adminToken } = req.params;
    const {
      title, couple_names, event_date, location, map_url, description,
      invitation_image_url, theme_style, custom_font, custom_accent_color, custom_bg_color, custom_text_color,
      custom_meal_options, custom_base_url, welcome_message, dress_code, event_schedule, crest_style, crest_text, crest_font,
      enable_meal_choice, enable_song_request, hall_width, hall_height
    } = req.body;

    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    }
    const inputError = validateEventInput(req.body);
    if (inputError) return res.status(400).json({ error: inputError });

    await dbQuery.run(
      `UPDATE events
       SET title = ?, couple_names = ?, event_date = ?, location = ?, map_url = ?, description = ?,
           invitation_image_url = ?, theme_style = ?, custom_font = ?, custom_accent_color = ?, custom_bg_color = ?, custom_text_color = ?,
           custom_meal_options = ?, custom_base_url = ?, welcome_message = ?, dress_code = ?, event_schedule = ?,
           crest_style = ?, crest_text = ?, crest_font = ?, enable_meal_choice = ?, enable_song_request = ?,
           hall_width = ?, hall_height = ?
       WHERE admin_token = ?`,
      [
        title.trim(),
        couple_names ? couple_names.trim() : title.trim(),
        event_date,
        location.trim(),
        map_url ? map_url.trim() : '',
        description ? description.trim() : '',
        invitation_image_url ? invitation_image_url.trim() : '',
        theme_style || 'warm_ivory',
        custom_font || 'Cormorant Garamond',
        custom_accent_color || '#b78c4a',
        custom_bg_color || '#faf8f4',
        custom_text_color || '#2b2925',
        custom_meal_options ? custom_meal_options.trim() : 'Etli Menü, Vejetaryen / Vegan, Çocuk Menüsü',
        custom_base_url ? custom_base_url.trim() : '',
        welcome_message ? welcome_message.trim() : '',
        dress_code ? dress_code.trim() : '',
        typeof event_schedule === 'string' ? event_schedule : JSON.stringify(event_schedule || []),
        crest_style || 'circle',
        crest_text ? crest_text.trim() : '',
        crest_font || 'Alex Brush',
        enable_meal_choice ? 1 : 0,
        enable_song_request ? 1 : 0,
        hall_width ? parseInt(hall_width) : 10,
        hall_height ? parseInt(hall_height) : 10,
        adminToken
      ]
    );

    const updatedEvent = await dbQuery.get('SELECT * FROM events WHERE id = ?', [event.id]);

    res.json({
      success: true,
      event: {
        ...updatedEvent,
        admin_token: 'session',
        admin_password_hash: undefined,
        admin_password_salt: undefined,
        public_url: getPublicUrl(req, updatedEvent),
        admin_url: getAdminUrl(req, updatedEvent)
      }
    });
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: 'Etkinlik bilgileri güncellenemedi.' });
  }
});

// 4. Upload Invitation Cover Image
app.post('/api/admin/:adminToken/upload', uploadLimiter, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Lütfen bir görsel dosyası seçiniz.' });
    }

    if (detectImageMime(req.file.path) !== req.file.mimetype) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Dosyanın içeriği desteklenen bir görsel değil.' });
    }

    const previousEvent = await dbQuery.get('SELECT invitation_image_url FROM events WHERE id = ?', [req.adminEvent.id]);
    const imageUrl = `/uploads/${req.file.filename}`;
    await dbQuery.run('UPDATE events SET invitation_image_url = ? WHERE id = ?', [imageUrl, req.adminEvent.id]);

    const previousUrl = previousEvent && previousEvent.invitation_image_url;
    if (previousUrl && /^\/uploads\/[a-zA-Z0-9._-]+$/.test(previousUrl)) {
      const previousPath = path.join(uploadsDir, path.basename(previousUrl));
      if (previousPath !== req.file.path && fs.existsSync(previousPath)) {
        fs.unlink(previousPath, () => {});
      }
    }

    res.json({
      success: true,
      image_url: imageUrl
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }
    console.error('Error uploading image:', err);
    res.status(500).json({ error: 'Görsel yükleme sırasında hata oluştu.' });
  }
});

// 5. Delete Guest Response (Admin)
app.delete('/api/admin/:adminToken/responses/:responseId', async (req, res) => {
  try {
    const { adminToken, responseId } = req.params;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);

    if (!event) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    }

    const responseToDelete = await dbQuery.get('SELECT guest_name FROM responses WHERE id = ? AND event_id = ?', [responseId, event.id]);
    if (responseToDelete) {
      await dbQuery.run('DELETE FROM seat_assignments WHERE event_id = ? AND (guest_name = ? OR main_guest_name = ?)', [
        event.id,
        responseToDelete.guest_name,
        responseToDelete.guest_name
      ]);
    }

    await dbQuery.run('DELETE FROM responses WHERE id = ? AND event_id = ?', [responseId, event.id]);

    res.json({ success: true, message: 'Yanıt ve masa atamaları başarıyla silindi.' });
  } catch (err) {
    console.error('Error deleting response:', err);
    res.status(500).json({ error: 'Kayıt silinemedi.' });
  }
});

// 6. Export Guest List to CSV (BOM added for Turkish Characters in Excel)
app.get('/api/admin/:adminToken/export', async (req, res) => {
  try {
    const { adminToken } = req.params;
    const event = await dbQuery.get('SELECT * FROM events WHERE admin_token = ?', [adminToken]);

    if (!event) {
      return res.status(404).send('Etkinlik bulunamadı.');
    }

    const responses = await dbQuery.all(
      'SELECT * FROM responses WHERE event_id = ? ORDER BY rowid ASC',
      [event.id]
    );

    const filename = `davetli_listesi_${(event.couple_names || event.title).replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    let csvContent = '\uFEFF';
    csvContent += 'Konuk Tipi;Davetli Adı Soyadı;Katılım Durumu;Yemek Tercihi;Şarkı İsteği;Not/Mesaj;Ana Konuk / Bağlantı;Son Güncelleme\n';

    responses.forEach(r => {
      const isAttending = r.status === 'ATTENDING';
      const statusStr = isAttending ? 'Katılıyor' : 'Katılmıyor';
      const formattedTime = new Date(r.updated_at).toLocaleString('tr-TR');

      csvContent += `"Ana Konuk";"${escapeCsv(r.guest_name)}";"${statusStr}";"${isAttending ? escapeCsv(r.meal_choice || '-') : '-'}";"${escapeCsv(r.song_request || '-')}";"${escapeCsv(r.note || '-')}";"Kendi Kaydı";"${formattedTime}"\n`;

      if (isAttending && r.plus_ones_count > 0) {
        let detailsList = [];
        try {
          detailsList = r.plus_ones_details ? JSON.parse(r.plus_ones_details) : [];
        } catch (e) {
          detailsList = [];
        }

        let namesList = [];
        if (r.plus_ones_names && r.plus_ones_names.trim()) {
          namesList = r.plus_ones_names.split(/,|\n/).map(n => n.trim()).filter(n => n.length > 0);
        }

        for (let i = 0; i < r.plus_ones_count; i++) {
          const item = detailsList[i] || {};
          const pName = item.name || namesList[i] || `${r.guest_name} (+1 Misafir ${i+1})`;
          const pMeal = item.meal || r.meal_choice || '-';

          csvContent += `"+1 Misafir";"${escapeCsv(pName)}";"Katılıyor (+1)";"${escapeCsv(pMeal)}";"-";"-";"Ana Konuk: ${escapeCsv(r.guest_name)}";"${formattedTime}"\n`;
        }
      }
    });

    res.send(csvContent);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).send('CSV indirilirken sunucu hatası oluştu.');
  }
});

function escapeCsv(val) {
  if (!val) return '';
  return val.toString().replace(/"/g, '""');
}

// 7. SEATING & SALON FLOOR PLAN ENDPOINTS

// Fetch Seating Layout Data (Tables, Assignments & Architectural Decorations)
app.get('/api/admin/:adminToken/seating', async (req, res) => {
  try {
    const { adminToken } = req.params;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    const tables = await dbQuery.all('SELECT * FROM seating_tables WHERE event_id = ? ORDER BY created_at ASC', [event.id]);
    const assignments = await dbQuery.all('SELECT * FROM seat_assignments WHERE event_id = ?', [event.id]);
    const decorations = await dbQuery.all('SELECT * FROM seating_decorations WHERE event_id = ?', [event.id]);

    res.json({
      success: true,
      tables,
      assignments,
      decorations
    });
  } catch (err) {
    console.error('Seating fetch error:', err);
    res.status(500).json({ error: 'Oturma planı çekilemedi.' });
  }
});

async function getSeatingExportData(adminToken) {
  const event = await dbQuery.get('SELECT * FROM events WHERE admin_token = ?', [adminToken]);
  if (!event) return null;

  const [tables, assignments, decorations, responses] = await Promise.all([
    dbQuery.all('SELECT * FROM seating_tables WHERE event_id = ? ORDER BY rowid ASC', [event.id]),
    dbQuery.all('SELECT * FROM seat_assignments WHERE event_id = ? ORDER BY rowid ASC', [event.id]),
    dbQuery.all('SELECT * FROM seating_decorations WHERE event_id = ? ORDER BY rowid ASC', [event.id]),
    dbQuery.all('SELECT * FROM responses WHERE event_id = ? ORDER BY guest_name COLLATE NOCASE ASC', [event.id])
  ]);

  return { event, tables, assignments, decorations, responses };
}

function sendPdfError(res, error, label) {
  console.error(`${label} PDF export error:`, error);
  if (!res.headersSent) {
    res.status(500).json({ error: 'PDF oluşturulamadı.' });
  } else {
    res.destroy(error);
  }
}

// Generate PDFs on the server so browser canvas/rendering differences cannot erase content.
app.get('/api/admin/:adminToken/seating/guest-list.pdf', async (req, res) => {
  try {
    const data = await getSeatingExportData(req.params.adminToken);
    if (!data) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    const eventName = safeFilenamePart(data.event.couple_names || data.event.title);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="masa_isim_listesi_${eventName}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    createGuestListPdf(data, res);
  } catch (error) {
    sendPdfError(res, error, 'Guest list');
  }
});

app.get('/api/admin/:adminToken/seating/floor-plan.pdf', async (req, res) => {
  try {
    const data = await getSeatingExportData(req.params.adminToken);
    if (!data) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    const width = Number(data.event.hall_width) || 10;
    const height = Number(data.event.hall_height) || 10;
    const eventName = safeFilenamePart(data.event.couple_names || data.event.title);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="salon_kat_plani_${width}x${height}m_${eventName}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    createFloorPlanPdf(data, res);
  } catch (error) {
    sendPdfError(res, error, 'Floor plan');
  }
});

// Create Seating Table
app.post('/api/admin/:adminToken/seating/tables', async (req, res) => {
  try {
    const { adminToken } = req.params;
    const { name, capacity, pos_x, pos_y } = req.body;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    const tableId = uuidv4();
    await dbQuery.run(
      'INSERT INTO seating_tables (id, event_id, name, capacity, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?)',
      [tableId, event.id, name.trim(), capacity || 10, pos_x || 50, pos_y || 50]
    );

    res.json({ success: true, table_id: tableId });
  } catch (err) {
    res.status(500).json({ error: 'Masa eklenemedi.' });
  }
});

// Update Table Position (Canvas Drag)
app.put('/api/admin/:adminToken/seating/tables/:tableId/position', async (req, res) => {
  try {
    const { adminToken, tableId } = req.params;
    const { pos_x, pos_y } = req.body;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    await dbQuery.run('UPDATE seating_tables SET pos_x = ?, pos_y = ? WHERE id = ? AND event_id = ?', [
      pos_x, pos_y, tableId, event.id
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Masa konumu kaydedilemedi.' });
  }
});

// Delete Table
app.delete('/api/admin/:adminToken/seating/tables/:tableId', async (req, res) => {
  try {
    const { adminToken, tableId } = req.params;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    await dbQuery.run('DELETE FROM seat_assignments WHERE table_id = ? AND event_id = ?', [tableId, event.id]);
    await dbQuery.run('DELETE FROM seating_tables WHERE id = ? AND event_id = ?', [tableId, event.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Masa silinemedi.' });
  }
});

// Create Architectural Hall Decoration (Sahne, Kapı, Mutfak, DJ)
app.post('/api/admin/:adminToken/seating/decorations', async (req, res) => {
  try {
    const { adminToken } = req.params;
    const { type, label, pos_x, pos_y, width, height } = req.body;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    const decorId = uuidv4();
    await dbQuery.run(
      'INSERT INTO seating_decorations (id, event_id, type, label, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [decorId, event.id, type, label, pos_x || 50, pos_y || 50, width || 200, height || 100]
    );

    res.json({ success: true, decoration_id: decorId });
  } catch (err) {
    res.status(500).json({ error: 'Mimari eleman eklenemedi.' });
  }
});

// Update Architectural Decoration Position & Size
app.put('/api/admin/:adminToken/seating/decorations/:decorId/position', async (req, res) => {
  try {
    const { adminToken, decorId } = req.params;
    const { pos_x, pos_y, width, height } = req.body;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    await dbQuery.run('UPDATE seating_decorations SET pos_x = ?, pos_y = ?, width = ?, height = ? WHERE id = ? AND event_id = ?', [
      pos_x, pos_y, width || 200, height || 100, decorId, event.id
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eleman konumu güncellenemedi.' });
  }
});

// Delete Architectural Decoration
app.delete('/api/admin/:adminToken/seating/decorations/:decorId', async (req, res) => {
  try {
    const { adminToken, decorId } = req.params;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    await dbQuery.run('DELETE FROM seating_decorations WHERE id = ? AND event_id = ?', [decorId, event.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Mimari eleman silinemedi.' });
  }
});

// Assign Guest to Table
app.post('/api/admin/:adminToken/seating/assign', async (req, res) => {
  try {
    const { adminToken } = req.params;
    const { table_id, guest_name, is_plus_one, main_guest_name } = req.body;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    const table = await dbQuery.get('SELECT capacity FROM seating_tables WHERE id = ? AND event_id = ?', [table_id, event.id]);
    if (!table) return res.status(404).json({ error: 'Masa bulunamadı.' });

    const existingSeats = await dbQuery.all('SELECT id FROM seat_assignments WHERE table_id = ?', [table_id]);
    if (existingSeats.length >= table.capacity) {
      return res.status(400).json({ error: 'Bu masanın kapasitesi dolmuştur.' });
    }

    await dbQuery.run('DELETE FROM seat_assignments WHERE event_id = ? AND guest_name = ?', [event.id, guest_name]);

    const assignId = uuidv4();
    await dbQuery.run(
      'INSERT INTO seat_assignments (id, event_id, table_id, guest_name, is_plus_one, main_guest_name) VALUES (?, ?, ?, ?, ?, ?)',
      [assignId, event.id, table_id, guest_name, is_plus_one ? 1 : 0, main_guest_name || '']
    );

    res.json({ success: true, assignment_id: assignId });
  } catch (err) {
    res.status(500).json({ error: 'Konuk masaya atanamadı.' });
  }
});

// Remove Guest Seat Assignment
app.delete('/api/admin/:adminToken/seating/assign/:assignId', async (req, res) => {
  try {
    const { adminToken, assignId } = req.params;
    const event = await dbQuery.get('SELECT id FROM events WHERE admin_token = ?', [adminToken]);
    if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });

    await dbQuery.run('DELETE FROM seat_assignments WHERE id = ? AND event_id = ?', [assignId, event.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Atama silinemedi.' });
  }
});

// 8. Public Guest Page Endpoints
app.get('/api/public/:publicToken', async (req, res) => {
  try {
    const { publicToken } = req.params;
    const event = await dbQuery.get('SELECT * FROM events WHERE public_token = ?', [publicToken]);

    if (!event) {
      return res.status(404).json({ error: 'Düğün davetiyesi bulunamadı.' });
    }

    res.json({
      success: true,
      event: {
        title: event.title,
        couple_names: event.couple_names || event.title,
        event_date: event.event_date,
        location: event.location,
        map_url: event.map_url,
        description: event.description,
        invitation_image_url: event.invitation_image_url,
        theme_style: event.theme_style || 'warm_ivory',
        custom_font: event.custom_font || 'Cormorant Garamond',
        custom_accent_color: event.custom_accent_color,
        custom_bg_color: event.custom_bg_color,
        custom_text_color: event.custom_text_color,
        custom_meal_options: event.custom_meal_options || 'Etli Menü, Vejetaryen / Vegan, Çocuk Menüsü',
        welcome_message: event.welcome_message,
        dress_code: event.dress_code,
        event_schedule: event.event_schedule,
        crest_style: event.crest_style || 'circle',
        crest_text: event.crest_text,
        crest_font: event.crest_font || 'Alex Brush',
        enable_meal_choice: event.enable_meal_choice !== 0,
        enable_song_request: event.enable_song_request !== 0
      }
    });
  } catch (err) {
    console.error('Error fetching public event:', err);
    res.status(500).json({ error: 'Davetiye bilgileri yüklenemedi.' });
  }
});

// Public RSVP Submit Endpoint
app.post('/api/public/:publicToken/rsvp', rsvpLimiter, async (req, res) => {
  try {
    const { publicToken } = req.params;
    const {
      guest_name, status, plus_ones_count, plus_ones_names, plus_ones_details,
      meal_choice, song_request, note, guest_token
    } = req.body;

    const event = await dbQuery.get('SELECT id FROM events WHERE public_token = ?', [publicToken]);
    if (!event) {
      return res.status(404).json({ error: 'Düğün etkinliği bulunamadı.' });
    }

    if (!guest_name || !guest_name.trim() || !status) {
      return res.status(400).json({ error: 'Lütfen adınızı ve katılım durumunuzu seçiniz.' });
    }
    if (!['ATTENDING', 'DECLINED'].includes(status)) {
      return res.status(400).json({ error: 'Geçersiz katılım durumu.' });
    }
    if (guest_name.trim().length > 120
      || String(plus_ones_names || '').length > 1000
      || String(note || '').length > 2000
      || String(song_request || '').length > 300
      || String(meal_choice || '').length > 120) {
      return res.status(400).json({ error: 'Yanıt alanlarından biri izin verilen uzunluğu aşıyor.' });
    }

    let finalGuestToken = guest_token;
    let existingResponse = null;

    if (finalGuestToken) {
      existingResponse = await dbQuery.get(
        'SELECT id FROM responses WHERE guest_token = ? AND event_id = ?',
        [finalGuestToken, event.id]
      );
    }

    const cleanPlusCount = status === 'ATTENDING' ? Math.min(20, Math.max(0, parseInt(plus_ones_count) || 0)) : 0;
    const cleanPlusNames = status === 'ATTENDING' && plus_ones_names ? plus_ones_names.trim() : '';
    const cleanPlusDetails = status === 'ATTENDING' && plus_ones_details ? plus_ones_details : '[]';

    if (existingResponse) {
      await dbQuery.run(
        `UPDATE responses
         SET guest_name = ?, status = ?, plus_ones_count = ?, plus_ones_names = ?, plus_ones_details = ?,
             meal_choice = ?, song_request = ?, note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          guest_name.trim(),
          status,
          cleanPlusCount,
          cleanPlusNames,
          cleanPlusDetails,
          status === 'ATTENDING' ? (meal_choice ? meal_choice.trim() : '') : '',
          status === 'ATTENDING' ? (song_request ? song_request.trim() : '') : '',
          note ? note.trim() : '',
          existingResponse.id
        ]
      );
    } else {
      finalGuestToken = uuidv4();
      const responseId = uuidv4();

      await dbQuery.run(
        `INSERT INTO responses (
          id, event_id, guest_name, status, plus_ones_count, plus_ones_names, plus_ones_details,
          meal_choice, song_request, note, guest_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          responseId,
          event.id,
          guest_name.trim(),
          status,
          cleanPlusCount,
          cleanPlusNames,
          cleanPlusDetails,
          status === 'ATTENDING' ? (meal_choice ? meal_choice.trim() : '') : '',
          status === 'ATTENDING' ? (song_request ? song_request.trim() : '') : '',
          note ? note.trim() : '',
          finalGuestToken
        ]
      );
    }

    res.json({
      success: true,
      message: 'Yanıtınız alındı, teşekkür ederiz!',
      guest_token: finalGuestToken
    });
  } catch (err) {
    console.error('Error saving RSVP:', err);
    res.status(500).json({ error: 'Yanıtınız kaydedilirken bir hata oluştu.' });
  }
});

// Fetch Guest's Own Previous Response (For Edits)
app.get('/api/public/:publicToken/guest', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { publicToken } = req.params;
    const guestToken = req.get('x-guest-token');
    if (!guestToken) {
      return res.status(401).json({ error: 'Davetli erişim anahtarı gerekli.' });
    }
    const event = await dbQuery.get('SELECT id FROM events WHERE public_token = ?', [publicToken]);

    if (!event) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
    }

    const response = await dbQuery.get(
      'SELECT * FROM responses WHERE guest_token = ? AND event_id = ?',
      [guestToken, event.id]
    );

    if (!response) {
      return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    }

    res.json({
      success: true,
      response
    });
  } catch (err) {
    console.error('Error fetching guest response:', err);
    res.status(500).json({ error: 'Kayıt çekilemedi.' });
  }
});

// HTML Page Routes
app.get(['/login', '/admin/setup'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin/:adminToken', (req, res) => {
  res.redirect(302, `/admin/setup#token=${encodeURIComponent(req.params.adminToken)}`);
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/e/:publicToken', (req, res) => {
  const guestPath = path.join(__dirname, 'public', 'guest.html');
  const rsvpPath = path.join(__dirname, 'public', 'rsvp.html');
  if (fs.existsSync(guestPath)) {
    res.sendFile(guestPath);
  } else if (fs.existsSync(rsvpPath)) {
    res.sendFile(rsvpPath);
  } else {
    res.status(404).send('Davetiye sayfası bulunamadı.');
  }
});

app.get('/health', async (req, res) => {
  try {
    await dbQuery.get('SELECT 1 AS ready');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Central error handler

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Görsel en fazla 10 MB olabilir.'
      : 'Dosya yüklenemedi.';
    return res.status(400).json({ error: message });
  }
  if (err && err.message && err.message.includes('Sadece')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled request error:', err);
  res.status(500).json({ error: 'Beklenmeyen bir sunucu hatası oluştu.' });
});

initDb()
  .then(() => app.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(` Wedding & Event RSVP System running on port ${PORT}`);
    console.log(` Local URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`====================================================`);
  }))
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
