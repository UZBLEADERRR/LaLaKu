/**
 * LaLaKu Vaqt — QR-kod orqali ish vaqtini hisoblash tizimi.
 * Express + PostgreSQL. Railway'ga mos (PORT va DATABASE_URL env orqali).
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Tashkent';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL topilmadi. Railway\'da PostgreSQL qo\'shing yoki env o\'rnating.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: /railway|render|heroku|amazonaws/.test(DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

// ---------- Ma'lumotlar bazasi sxemasi ----------
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      work_date DATE NOT NULL,
      check_in TIMESTAMPTZ NOT NULL,
      check_out TIMESTAMPTZ,
      CONSTRAINT out_after_in CHECK (check_out IS NULL OR check_out > check_in)
    );
    CREATE INDEX IF NOT EXISTS idx_entries_worker_date ON entries(worker_id, work_date);
  `);

  // Sessiya kaliti va QR token — bir marta yaratiladi va bazada saqlanadi,
  // shunda server qayta ishga tushganda sessiyalar bekor bo'lmaydi.
  await ensureSetting('session_secret', () => crypto.randomBytes(32).toString('hex'));
  await ensureSetting('qr_token', () => 'LALAKU:' + crypto.randomBytes(12).toString('hex'));
}

async function ensureSetting(key, makeValue) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
    [key, makeValue()]
  );
}

async function getSetting(key) {
  const r = await pool.query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return r.rows[0] ? r.rows[0].value : null;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

// ---------- Sessiya tokenlari (HMAC bilan imzolangan) ----------
let SESSION_SECRET = null;

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function setSessionCookie(res, payload, days) {
  const token = signToken({ ...payload, exp: Date.now() + days * 86400_000 });
  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: days * 86400_000,
  });
}

// ---------- Vaqt zonasi yordamchilari ----------
// Sanalar UTC'da saqlanadi, ko'rsatish va "ish kuni" TIMEZONE bo'yicha aniqlanadi.
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
});

const localDate = (d = new Date()) => dateFmt.format(d); // YYYY-MM-DD
const localTime = (d = new Date()) => timeFmt.format(d); // HH:MM

// ---------- Login urinishlarini cheklash ----------
const loginAttempts = new Map(); // ip -> {count, resetAt}
function rateLimited(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  rec.count++;
  return rec.count > 30;
}

// ---------- Express ----------
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function requireWorker(req, res, next) {
  const s = verifyToken(req.cookies.sid);
  if (!s || s.t !== 'worker') return res.status(401).json({ error: 'Tizimga kiring' });
  req.workerId = s.id;
  next();
}

function requireAdmin(req, res, next) {
  const s = verifyToken(req.cookies.sid);
  if (!s || s.t !== 'admin') return res.status(401).json({ error: 'Admin sifatida kiring' });
  next();
}

// ---------- Umumiy API ----------
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Login sahifasi uchun ishchilar ro'yxati (faqat ism va id)
app.get('/api/workers', wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, name FROM workers WHERE active ORDER BY name`
  );
  res.json(r.rows);
}));

app.post('/api/login', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: "Urinishlar ko'p. 10 daqiqadan so'ng qayta urinib ko'ring." });
  const { workerId, password } = req.body || {};
  const r = await pool.query(`SELECT * FROM workers WHERE id = $1 AND active`, [workerId]);
  const w = r.rows[0];
  if (!w || !(await bcrypt.compare(String(password || ''), w.password_hash))) {
    return res.status(401).json({ error: "Parol noto'g'ri" });
  }
  setSessionCookie(res, { t: 'worker', id: w.id }, 60);
  res.json({ id: w.id, name: w.name });
}));

app.post('/api/admin/login', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: "Urinishlar ko'p. 10 daqiqadan so'ng qayta urinib ko'ring." });
  const { password } = req.body || {};
  if (String(password || '') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Parol noto'g'ri" });
  }
  setSessionCookie(res, { t: 'admin' }, 7);
  res.json({ ok: true, defaultPassword: ADMIN_PASSWORD === 'admin123' });
}));

app.post('/api/logout', (req, res) => {
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/me', wrap(async (req, res) => {
  const s = verifyToken(req.cookies.sid);
  if (!s) return res.json({ role: null });
  if (s.t === 'admin') return res.json({ role: 'admin' });
  const r = await pool.query(`SELECT id, name FROM workers WHERE id = $1 AND active`, [s.id]);
  if (!r.rows[0]) return res.json({ role: null });
  res.json({ role: 'worker', ...r.rows[0] });
}));

// ---------- Ishchi API ----------

// Hozirgi holat: ochiq (yakunlanmagan) sessiya bormi
app.get('/api/my/status', requireWorker, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, check_in FROM entries WHERE worker_id = $1 AND check_out IS NULL
     ORDER BY check_in DESC LIMIT 1`,
    [req.workerId]
  );
  const open = r.rows[0];
  res.json({
    checkedIn: !!open,
    since: open ? localTime(open.check_in) : null,
    sinceDate: open ? localDate(open.check_in) : null,
    sinceIso: open ? open.check_in.toISOString() : null,
  });
}));

// QR skanerlash: ochiq sessiya bo'lmasa kelish, bo'lsa ketish vaqti yoziladi
app.post('/api/scan', requireWorker, wrap(async (req, res) => {
  const { code } = req.body || {};
  const qrToken = await getSetting('qr_token');
  if (String(code || '').trim() !== qrToken) {
    return res.status(400).json({ error: "QR kod noto'g'ri. Ish joyidagi QR kodni skanerlang." });
  }

  const now = new Date();
  const openR = await pool.query(
    `SELECT id, check_in FROM entries WHERE worker_id = $1 AND check_out IS NULL
     ORDER BY check_in DESC LIMIT 1`,
    [req.workerId]
  );
  const open = openR.rows[0];

  if (open) {
    // Tasodifiy ikki marta skanerlashdan himoya
    if (now - new Date(open.check_in) < 60_000) {
      return res.status(400).json({ error: "Siz hozirgina kelganingizni belgiladingiz. Ketishda qayta skanerlang." });
    }
    await pool.query(`UPDATE entries SET check_out = $1 WHERE id = $2`, [now, open.id]);
    return res.json({ action: 'out', time: localTime(now), date: localDate(now) });
  }

  await pool.query(
    `INSERT INTO entries (worker_id, work_date, check_in) VALUES ($1, $2, $3)`,
    [req.workerId, localDate(now), now]
  );
  res.json({ action: 'in', time: localTime(now), date: localDate(now) });
}));

// Oylik hisobot (o'zi uchun)
app.get('/api/my/summary', requireWorker, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  res.json(await workerMonth(req.workerId, year, month));
}));

function parseYearMonth(req, res) {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) {
    res.status(400).json({ error: "Yil/oy noto'g'ri" });
    return {};
  }
  return { year, month };
}

const monthBounds = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start, next };
};

async function workerMonth(workerId, year, month) {
  const { start, next } = monthBounds(year, month);
  const r = await pool.query(
    `SELECT id, work_date::text AS date, check_in, check_out
     FROM entries
     WHERE worker_id = $1 AND work_date >= $2 AND work_date < $3
     ORDER BY check_in`,
    [workerId, start, next]
  );
  const days = {};
  let totalMinutes = 0;
  for (const e of r.rows) {
    const d = (days[e.date] ||= { sessions: [], minutes: 0, open: false });
    const session = { id: e.id, in: localTime(e.check_in), out: e.check_out ? localTime(e.check_out) : null };
    d.sessions.push(session);
    if (e.check_out) {
      const mins = Math.round((new Date(e.check_out) - new Date(e.check_in)) / 60_000);
      d.minutes += mins;
      totalMinutes += mins;
    } else {
      d.open = true;
    }
  }
  return { year, month, days, totalMinutes };
}

// ---------- Admin API ----------

// Ishchilar ro'yxati (batafsil)
app.get('/api/admin/workers', requireAdmin, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, name, active, created_at FROM workers ORDER BY active DESC, name`
  );
  res.json(r.rows);
}));

app.post('/api/admin/workers', requireAdmin, wrap(async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const password = String((req.body || {}).password || '');
  if (!name) return res.status(400).json({ error: 'Ism kiriting' });
  if (password.length < 4) return res.status(400).json({ error: "Parol kamida 4 belgidan iborat bo'lsin" });
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    `INSERT INTO workers (name, password_hash) VALUES ($1, $2) RETURNING id, name, active, created_at`,
    [name, hash]
  );
  res.json(r.rows[0]);
}));

app.put('/api/admin/workers/:id', requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, password, active } = req.body || {};
  const w = (await pool.query(`SELECT id FROM workers WHERE id = $1`, [id])).rows[0];
  if (!w) return res.status(404).json({ error: 'Ishchi topilmadi' });
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ error: 'Ism kiriting' });
    await pool.query(`UPDATE workers SET name = $1 WHERE id = $2`, [n, id]);
  }
  if (password !== undefined && password !== '') {
    if (String(password).length < 4) return res.status(400).json({ error: "Parol kamida 4 belgidan iborat bo'lsin" });
    await pool.query(`UPDATE workers SET password_hash = $1 WHERE id = $2`, [await bcrypt.hash(String(password), 10), id]);
  }
  if (active !== undefined) {
    await pool.query(`UPDATE workers SET active = $1 WHERE id = $2`, [!!active, id]);
  }
  res.json({ ok: true });
}));

app.delete('/api/admin/workers/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query(`DELETE FROM workers WHERE id = $1`, [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
}));

// Oylik jamlanma: barcha ishchilar, kunlik daqiqalar va jami
app.get('/api/admin/summary', requireAdmin, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  const { start, next } = monthBounds(year, month);
  const workers = (await pool.query(
    `SELECT id, name, active FROM workers ORDER BY active DESC, name`
  )).rows;
  const sums = (await pool.query(
    `SELECT worker_id, work_date::text AS date,
            SUM(CASE WHEN check_out IS NOT NULL
                THEN ROUND(EXTRACT(EPOCH FROM (check_out - check_in)) / 60) ELSE 0 END)::int AS minutes,
            BOOL_OR(check_out IS NULL) AS open
     FROM entries
     WHERE work_date >= $1 AND work_date < $2
     GROUP BY worker_id, work_date`,
    [start, next]
  )).rows;
  const byWorker = {};
  for (const s of sums) {
    (byWorker[s.worker_id] ||= {})[s.date] = { minutes: s.minutes, open: s.open };
  }
  res.json({
    year, month,
    workers: workers.map((w) => {
      const days = byWorker[w.id] || {};
      const totalMinutes = Object.values(days).reduce((a, d) => a + d.minutes, 0);
      return { id: w.id, name: w.name, active: w.active, days, totalMinutes };
    }),
  });
}));

// Bitta ishchining oylik tafsiloti (admin ko'rinishida)
app.get('/api/admin/worker/:id/summary', requireAdmin, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  const id = parseInt(req.params.id, 10);
  const w = (await pool.query(`SELECT id, name FROM workers WHERE id = $1`, [id])).rows[0];
  if (!w) return res.status(404).json({ error: 'Ishchi topilmadi' });
  res.json({ worker: w, ...(await workerMonth(id, year, month)) });
}));

// Qo'lda yozuv qo'shish (skaner unutilgan kunlar uchun)
app.post('/api/admin/entries', requireAdmin, wrap(async (req, res) => {
  const { workerId, date, in: inTime, out: outTime } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: "Sana noto'g'ri" });
  if (!/^\d{2}:\d{2}$/.test(String(inTime || ''))) return res.status(400).json({ error: "Kelish vaqti noto'g'ri (SS:DD)" });
  if (outTime && !/^\d{2}:\d{2}$/.test(String(outTime))) return res.status(400).json({ error: "Ketish vaqti noto'g'ri (SS:DD)" });
  const w = (await pool.query(`SELECT id FROM workers WHERE id = $1`, [parseInt(workerId, 10)])).rows[0];
  if (!w) return res.status(404).json({ error: 'Ishchi topilmadi' });
  try {
    await pool.query(
      `INSERT INTO entries (worker_id, work_date, check_in, check_out)
       VALUES ($1, $2::date,
               ($2 || ' ' || $3)::timestamp AT TIME ZONE $5,
               CASE WHEN $4::text IS NULL THEN NULL
                    ELSE ($2 || ' ' || $4)::timestamp AT TIME ZONE $5 END)`,
      [w.id, date, inTime, outTime || null, TIMEZONE]
    );
  } catch (e) {
    if (e.constraint === 'out_after_in') {
      return res.status(400).json({ error: "Ketish vaqti kelish vaqtidan keyin bo'lishi kerak" });
    }
    throw e;
  }
  res.json({ ok: true });
}));

// Yozuvni tahrirlash
app.put('/api/admin/entries/:id', requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const e = (await pool.query(`SELECT id, work_date::text AS date FROM entries WHERE id = $1`, [id])).rows[0];
  if (!e) return res.status(404).json({ error: 'Yozuv topilmadi' });
  const { in: inTime, out: outTime } = req.body || {};
  if (!/^\d{2}:\d{2}$/.test(String(inTime || ''))) return res.status(400).json({ error: "Kelish vaqti noto'g'ri (SS:DD)" });
  if (outTime && !/^\d{2}:\d{2}$/.test(String(outTime))) return res.status(400).json({ error: "Ketish vaqti noto'g'ri (SS:DD)" });
  try {
    await pool.query(
      `UPDATE entries SET
         check_in = ($2 || ' ' || $3)::timestamp AT TIME ZONE $5,
         check_out = CASE WHEN $4::text IS NULL THEN NULL
                          ELSE ($2 || ' ' || $4)::timestamp AT TIME ZONE $5 END
       WHERE id = $1`,
      [id, e.date, inTime, outTime || null, TIMEZONE]
    );
  } catch (err) {
    if (err.constraint === 'out_after_in') {
      return res.status(400).json({ error: "Ketish vaqti kelish vaqtidan keyin bo'lishi kerak" });
    }
    throw err;
  }
  res.json({ ok: true });
}));

app.delete('/api/admin/entries/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query(`DELETE FROM entries WHERE id = $1`, [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
}));

// QR kod (chop etish uchun)
app.get('/api/admin/qr', requireAdmin, wrap(async (req, res) => {
  const token = await getSetting('qr_token');
  const dataUrl = await QRCode.toDataURL(token, { width: 512, margin: 2 });
  res.json({ token, dataUrl });
}));

// QR kodni yangilash (eski chop etilgan kod ishlamay qoladi)
app.post('/api/admin/qr/rotate', requireAdmin, wrap(async (req, res) => {
  const token = 'LALAKU:' + crypto.randomBytes(12).toString('hex');
  await setSetting('qr_token', token);
  const dataUrl = await QRCode.toDataURL(token, { width: 512, margin: 2 });
  res.json({ token, dataUrl });
}));

// SPA: qolgan barcha yo'llar index.html'ga
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Topilmadi' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server xatosi' });
});

initDb()
  .then(async () => {
    SESSION_SECRET = await getSetting('session_secret');
    app.listen(PORT, () => console.log(`LaLaKu Vaqt ${PORT}-portda ishlamoqda (${TIMEZONE})`));
  })
  .catch((e) => {
    console.error('Bazani sozlashda xato:', e);
    process.exit(1);
  });
