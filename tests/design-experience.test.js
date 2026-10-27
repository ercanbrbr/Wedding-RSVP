const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const sqlite3 = require('sqlite3');
const { randomUUID } = require('node:crypto');

let server, base, cookie, csrf, event, directory;
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = () => ({ 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf });
const wav = Buffer.alloc(16044);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);

before(async () => {
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  directory = fs.mkdtempSync(path.join(root, 'tmp', 'design-regression-'));
  // Exercise migration from an existing database without either music column.
  const old = new sqlite3.Database(path.join(directory, 'wedding_rsvp.db'));
  await new Promise((resolve, reject) => old.run(`CREATE TABLE events (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, event_date TEXT NOT NULL, location TEXT NOT NULL,
    description TEXT, admin_token TEXT UNIQUE, public_token TEXT UNIQUE, created_at TEXT
  )`, error => error ? reject(error) : resolve()));
  await new Promise(resolve => old.close(resolve));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', DATA_DIR: directory, UPLOADS_DIR: path.join(directory, 'uploads') }
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
    await delay(50);
  }
  assert.ok(ready, logs);
  const response = await fetch(`${base}/api/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test Etkinliği', location: 'Test Mekanı', event_date: '2027-06-12T19:00', admin_password: `Test-${randomUUID()}` })
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  cookie = response.headers.get('set-cookie').split(';')[0];
  csrf = result.csrf_token;
  event = result.event;
});

after(async () => {
  if (server && server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
  // Only this test's generated directory is eligible for cleanup.
  if (directory && path.dirname(path.resolve(directory)) === path.join(root, 'tmp')
    && path.basename(directory).startsWith('design-regression-')) fs.rmSync(directory, { recursive: true, force: true });
});

async function publicEvent() {
  return (await (await fetch(`${base}/api/public/${event.public_token}`)).json()).event;
}
async function upload(buffer = wav, name = 'music.wav', type = 'audio/wav', headers = { Cookie: cookie, 'X-CSRF-Token': csrf }) {
  const body = new FormData();
  body.append('music', new Blob([buffer], { type }), name);
  return fetch(`${base}/api/admin/session/music`, { method: 'POST', headers, body });
}
async function save(changes) {
  return fetch(`${base}/api/admin/session`, { method: 'PUT', headers: json(), body: JSON.stringify({ ...event, ...changes }) });
}

test('existing events receive quiet music defaults and public data contains no admin secrets', async () => {
  const result = await publicEvent();
  assert.equal(result.music_url, '');
  assert.equal(result.music_volume, 0.15);
  assert.equal(result.admin_token, undefined);
});

test('preview requires authentication and only preview allows same-origin framing', async () => {
  assert.equal((await fetch(`${base}/admin/preview`)).status, 401);
  const preview = await fetch(`${base}/admin/preview`, { headers: { Cookie: cookie } });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(preview.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal((await fetch(`${base}/e/${event.public_token}`)).headers.get('x-frame-options'), 'DENY');
});

test('music requires a session and CSRF, rejects non-audio and oversized files', async () => {
  assert.equal((await upload(wav, 'music.wav', 'audio/wav', {})).status, 401);
  assert.equal((await upload(wav, 'music.wav', 'audio/wav', { Cookie: cookie })).status, 403);
  assert.equal((await upload(Buffer.from('<html>fake music</html>'))).status, 400);
  assert.equal((await upload(wav, 'music.html', 'text/html')).status, 400);
  const huge = await upload(Buffer.alloc(20 * 1024 * 1024 + 1));
  assert.equal(huge.status, 400);
  assert.match((await huge.json()).error, /20 MB/);
  assert.deepEqual(fs.readdirSync(path.join(directory, 'uploads')), []);
});

test('music stays a draft until save, persists volume, streams, survives basic edits and can be removed', async () => {
  const response = await upload();
  assert.equal(response.status, 200);
  const { music_url } = await response.json();
  assert.equal((await publicEvent()).music_url, '');
  assert.equal((await save({ music_url, music_volume: 0.12 })).status, 200);
  assert.equal((await publicEvent()).music_url, music_url);
  assert.equal((await publicEvent()).music_volume, 0.12);
  const stream = await fetch(`${base}${music_url}`, { headers: { Range: 'bytes=0-43' } });
  assert.equal(stream.status, 206);
  assert.equal((await stream.arrayBuffer()).byteLength, 44);
  const unchanged = { ...event, description: 'Güncellenen not' };
  delete unchanged.music_url; delete unchanged.music_volume;
  assert.equal((await fetch(`${base}/api/admin/session`, { method: 'PUT', headers: json(), body: JSON.stringify(unchanged) })).status, 200);
  assert.equal((await publicEvent()).music_url, music_url);
  assert.equal((await publicEvent()).music_volume, 0.12);
  assert.equal((await save({ music_url: '', music_volume: 0 })).status, 200);
  assert.equal((await publicEvent()).music_url, '');
  assert.equal((await publicEvent()).music_volume, 0);
});

test('music URLs must belong to this event and volume must be within range', async () => {
  for (const music_url of ['https://example.com/song.mp3', '/uploads/../../secret.mp3', '/uploads/music_other.wav', null]) {
    assert.equal((await save({ music_url })).status, 400);
  }
  for (const music_volume of [-1, 1.01, '0.2', null]) assert.equal((await save({ music_volume })).status, 400);
});

test('draft image uploads also leave the published invitation untouched', async () => {
  const body = new FormData();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGxkAAAAASUVORK5CYII=', 'base64');
  body.append('image', new Blob([png], { type: 'image/png' }), 'invitation.png');
  const previous = (await publicEvent()).invitation_image_url;
  const response = await fetch(`${base}/api/admin/session/upload?draft=1`, {
    method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body
  });
  assert.equal(response.status, 200);
  const { image_url } = await response.json();
  assert.equal((await publicEvent()).invitation_image_url, previous);
  assert.equal((await save({ invitation_image_url: image_url })).status, 200);
  assert.equal((await publicEvent()).invitation_image_url, image_url);
});

test('new font names save and the bundled Libra font is served', async () => {
  assert.equal((await save({ custom_font: 'Libra Serif Modern', crest_font: 'Sloop Script Pro' })).status, 200);
  const result = await publicEvent();
  assert.equal(result.custom_font, 'Libra Serif Modern');
  assert.equal(result.crest_font, 'Sloop Script Pro');
  const font = await fetch(`${base}/fonts/LibraSerifModern-Regular.otf`);
  assert.equal(font.status, 200);
  assert.equal(Buffer.from(await font.arrayBuffer()).toString('ascii', 0, 4), 'OTTO');
});

test('invitation subtitle and hidden monogram persist independently of the event title', async () => {
  assert.equal((await publicEvent()).invitation_subtitle, null);
  assert.equal((await save({ invitation_subtitle: 'Sonsuza birlikte', crest_style: 'none' })).status, 200);
  let result = await publicEvent();
  assert.equal(result.invitation_subtitle, 'Sonsuza birlikte');
  assert.equal(result.crest_style, 'none');
  assert.equal(result.title, event.title);
  const basicEdit = { ...event, title: 'Yeni etkinlik başlığı', crest_style: 'none' };
  delete basicEdit.invitation_subtitle;
  assert.equal((await fetch(`${base}/api/admin/session`, { method: 'PUT', headers: json(), body: JSON.stringify(basicEdit) })).status, 200);
  assert.equal((await publicEvent()).invitation_subtitle, 'Sonsuza birlikte');
  assert.equal((await save({ invitation_subtitle: '', crest_style: 'circle' })).status, 200);
  result = await publicEvent();
  assert.equal(result.invitation_subtitle, '');
  assert.equal(result.crest_style, 'circle');
  for (const invitation_subtitle of ['x'.repeat(151), 42, {}]) assert.equal((await save({ invitation_subtitle })).status, 400);
});

test('guest templates contain no sample couple or monogram and stay hidden until data arrives', async () => {
  for (const route of [`/e/${event.public_token}`, '/guest.html', '/rsvp.html']) {
    const html = await (await fetch(`${base}${route}`)).text();
    assert.match(html, /class="container" hidden/);
    assert.match(html, /id="eventCalligraphyTitle"><\/h1>/);
    assert.match(html, /id="crestMonogram"><\/div>/);
  }
});
