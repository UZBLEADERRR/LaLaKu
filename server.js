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

const newQrToken = () => 'LALAKU:' + crypto.randomBytes(12).toString('hex');

// ---------- Ma'lumotlar bazasi sxemasi ----------
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      qr_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
    ALTER TABLE workers ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id);
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS branch_id INTEGER;
    ALTER TABLE workers ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC NOT NULL DEFAULT 0;
    ALTER TABLE workers ADD COLUMN IF NOT EXISTS tax_percent NUMERIC NOT NULL DEFAULT 0;
  `);

  // Vaqt zonasi sozlamasi (standart — env, keyin admin panelda o'zgartiriladi)
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('timezone', $1) ON CONFLICT (key) DO NOTHING`,
    [TIMEZONE]
  );

  // Sessiya kaliti — bir marta yaratiladi va bazada saqlanadi,
  // shunda server qayta ishga tushganda sessiyalar bekor bo'lmaydi.
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING`,
    [crypto.randomBytes(32).toString('hex')]
  );

  // Eski versiyadan ko'chirish: kamida bitta filial bo'lsin,
  // eski umumiy qr_token birinchi filialga o'tadi.
  const branchCount = (await pool.query(`SELECT count(*)::int AS n FROM branches`)).rows[0].n;
  if (branchCount === 0) {
    const old = (await pool.query(`SELECT value FROM settings WHERE key = 'qr_token'`)).rows[0];
    await pool.query(`INSERT INTO branches (name, qr_token) VALUES ($1, $2)`,
      ['Asosiy ish joyi', old ? old.value : newQrToken()]);
  }
  await pool.query(
    `UPDATE workers SET branch_id = (SELECT min(id) FROM branches) WHERE branch_id IS NULL`
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
// Sanalar UTC'da saqlanadi, ko'rsatish va "ish kuni" tanlangan zona bo'yicha.
// Zona admin panelda o'zgartiriladi va bazada saqlanadi.
let TZ = TIMEZONE;
const fmtCache = new Map();
function tzFmts(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, {
      date: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }),
      time: new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }),
    });
  }
  return fmtCache.get(tz);
}
function validTz(tz) {
  try { tzFmts(tz); return true; } catch { fmtCache.delete(tz); return false; }
}

const localDate = (d = new Date()) => tzFmts(TZ).date.format(d); // YYYY-MM-DD
const localTime = (d = new Date()) => tzFmts(TZ).time.format(d); // HH:MM

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

// error kodlari mijoz tomonda tarjima qilinadi (uz/en/ko)
function requireWorker(req, res, next) {
  const s = verifyToken(req.cookies.sid);
  if (!s || s.t !== 'worker') return res.status(401).json({ error: 'Tizimga kiring', code: 'AUTH' });
  req.workerId = s.id;
  next();
}

function requireAdmin(req, res, next) {
  const s = verifyToken(req.cookies.sid);
  if (!s || s.t !== 'admin') return res.status(401).json({ error: 'Admin sifatida kiring', code: 'AUTH_ADMIN' });
  next();
}

// ---------- Umumiy API ----------
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/branches', wrap(async (req, res) => {
  const r = await pool.query(`SELECT id, name FROM branches ORDER BY id`);
  res.json(r.rows);
}));

// Login sahifasi uchun ishchilar ro'yxati (faqat ism, id, filial)
app.get('/api/workers', wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, name, branch_id AS "branchId" FROM workers WHERE active ORDER BY name`
  );
  res.json(r.rows);
}));

app.post('/api/login', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: "Urinishlar ko'p. 10 daqiqadan so'ng qayta urinib ko'ring.", code: 'RATE_LIMIT' });
  const { workerId, password } = req.body || {};
  const r = await pool.query(`SELECT * FROM workers WHERE id = $1 AND active`, [workerId]);
  const w = r.rows[0];
  if (!w || !(await bcrypt.compare(String(password || ''), w.password_hash))) {
    return res.status(401).json({ error: "Parol noto'g'ri", code: 'BAD_PASSWORD' });
  }
  setSessionCookie(res, { t: 'worker', id: w.id }, 60);
  res.json({ id: w.id, name: w.name, hourlyRate: +w.hourly_rate, taxPercent: +w.tax_percent });
}));

app.post('/api/admin/login', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: "Urinishlar ko'p. 10 daqiqadan so'ng qayta urinib ko'ring.", code: 'RATE_LIMIT' });
  const { password } = req.body || {};
  if (String(password || '') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Parol noto'g'ri", code: 'BAD_PASSWORD' });
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
  const r = await pool.query(
    `SELECT id, name, hourly_rate::float AS "hourlyRate", tax_percent::float AS "taxPercent"
     FROM workers WHERE id = $1 AND active`, [s.id]);
  if (!r.rows[0]) return res.json({ role: null });
  res.json({ role: 'worker', ...r.rows[0] });
}));

// Ishchining shaxsiy maosh sozlamalari
app.put('/api/my/settings', requireWorker, wrap(async (req, res) => {
  const rate = Number((req.body || {}).hourlyRate);
  const tax = Number((req.body || {}).taxPercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1e9) return res.status(400).json({ error: "Soatlik maosh noto'g'ri", code: 'BAD_RATE' });
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) return res.status(400).json({ error: "Soliq foizi 0-100 orasida bo'lsin", code: 'BAD_TAX' });
  await pool.query(`UPDATE workers SET hourly_rate = $1, tax_percent = $2 WHERE id = $3`, [rate, tax, req.workerId]);
  res.json({ ok: true });
}));

// ---------- Ochiq davomat taxtasi (loginsiz) ----------

// Bugungi jonli holat: kim ishda, kim ketdi, necha soat ishladi
app.get('/api/board', wrap(async (req, res) => {
  const today = localDate();
  const branches = (await pool.query(`SELECT id, name FROM branches ORDER BY id`)).rows;
  const rows = (await pool.query(
    `SELECT w.id, w.name, w.branch_id AS "branchId",
            COALESCE(SUM(ROUND(EXTRACT(EPOCH FROM (COALESCE(e.check_out, now()) - e.check_in)) / 60)), 0)::int AS minutes,
            BOOL_OR(e.check_out IS NULL) AS open,
            MIN(e.check_in) AS first_in
     FROM workers w
     LEFT JOIN entries e ON e.worker_id = w.id AND e.work_date = $1
     WHERE w.active
     GROUP BY w.id
     ORDER BY w.name`,
    [today]
  )).rows;
  res.json({
    date: today,
    time: localTime(),
    branches,
    workers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      branchId: r.branchId,
      minutes: r.minutes,
      status: r.open ? 'in' : (r.minutes > 0 ? 'out' : 'none'),
      since: r.first_in ? localTime(r.first_in) : null,
    })),
  });
}));

// Oylik jamlanma — hamma uchun ochiq (faqat o'qish)
app.get('/api/board/summary', wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  res.json(await monthSummary(year, month));
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
  const branch = (await pool.query(
    `SELECT id, name FROM branches WHERE qr_token = $1`, [String(code || '').trim()]
  )).rows[0];
  if (!branch) {
    return res.status(400).json({ error: "QR kod noto'g'ri. Ish joyidagi QR kodni skanerlang.", code: 'BAD_QR' });
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
      return res.status(400).json({ error: "Siz hozirgina kelganingizni belgiladingiz. Ketishda qayta skanerlang.", code: 'DUP_SCAN' });
    }
    await pool.query(`UPDATE entries SET check_out = $1 WHERE id = $2`, [now, open.id]);
    return res.json({ action: 'out', time: localTime(now), date: localDate(now), branch: branch.name });
  }

  await pool.query(
    `INSERT INTO entries (worker_id, work_date, check_in, branch_id) VALUES ($1, $2, $3, $4)`,
    [req.workerId, localDate(now), now, branch.id]
  );
  res.json({ action: 'in', time: localTime(now), date: localDate(now), branch: branch.name });
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
    res.status(400).json({ error: "Yil/oy noto'g'ri", code: 'BAD_MONTH' });
    return {};
  }
  return { year, month };
}

const monthBounds = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start, next };
};

// Ochiq sessiyalar ham jonli hisoblanadi (check_out o'rniga hozirgi vaqt)
async function workerMonth(workerId, year, month) {
  const { start, next } = monthBounds(year, month);
  const r = await pool.query(
    `SELECT id, work_date::text AS date, check_in, check_out,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(check_out, now()) - check_in)) / 60)::int AS minutes
     FROM entries
     WHERE worker_id = $1 AND work_date >= $2 AND work_date < $3
     ORDER BY check_in`,
    [workerId, start, next]
  );
  const days = {};
  let totalMinutes = 0;
  for (const e of r.rows) {
    const d = (days[e.date] ||= { sessions: [], minutes: 0, open: false });
    d.sessions.push({ id: e.id, in: localTime(e.check_in), out: e.check_out ? localTime(e.check_out) : null, minutes: e.minutes });
    d.minutes += e.minutes;
    totalMinutes += e.minutes;
    if (!e.check_out) d.open = true;
  }
  return { year, month, days, totalMinutes };
}

// Barcha ishchilar bo'yicha oylik jamlanma (jonli)
async function monthSummary(year, month) {
  const { start, next } = monthBounds(year, month);
  const workers = (await pool.query(
    `SELECT id, name, active, branch_id AS "branchId" FROM workers ORDER BY active DESC, name`
  )).rows;
  const branches = (await pool.query(`SELECT id, name FROM branches ORDER BY id`)).rows;
  const sums = (await pool.query(
    `SELECT worker_id, work_date::text AS date,
            SUM(ROUND(EXTRACT(EPOCH FROM (COALESCE(check_out, now()) - check_in)) / 60))::int AS minutes,
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
  return {
    year, month, branches,
    workers: workers.map((w) => {
      const days = byWorker[w.id] || {};
      const totalMinutes = Object.values(days).reduce((a, d) => a + d.minutes, 0);
      return { id: w.id, name: w.name, active: w.active, branchId: w.branchId, days, totalMinutes };
    }),
  };
}

// ---------- Admin API ----------

// Ishchilar ro'yxati (batafsil)
app.get('/api/admin/workers', requireAdmin, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, name, active, branch_id AS "branchId", created_at FROM workers ORDER BY active DESC, name`
  );
  res.json(r.rows);
}));

app.post('/api/admin/workers', requireAdmin, wrap(async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const password = String((req.body || {}).password || '');
  let branchId = parseInt((req.body || {}).branchId, 10);
  if (!name) return res.status(400).json({ error: 'Ism kiriting', code: 'NAME_REQUIRED' });
  if (password.length < 4) return res.status(400).json({ error: "Parol kamida 4 belgidan iborat bo'lsin", code: 'PW_SHORT' });
  if (!branchId) {
    branchId = (await pool.query(`SELECT min(id) AS id FROM branches`)).rows[0].id;
  } else if (!(await pool.query(`SELECT id FROM branches WHERE id = $1`, [branchId])).rows[0]) {
    return res.status(400).json({ error: 'Filial topilmadi', code: 'NOT_FOUND' });
  }
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    `INSERT INTO workers (name, password_hash, branch_id) VALUES ($1, $2, $3)
     RETURNING id, name, active, branch_id AS "branchId", created_at`,
    [name, hash, branchId]
  );
  res.json(r.rows[0]);
}));

app.put('/api/admin/workers/:id', requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, password, active, branchId } = req.body || {};
  const w = (await pool.query(`SELECT id FROM workers WHERE id = $1`, [id])).rows[0];
  if (!w) return res.status(404).json({ error: 'Ishchi topilmadi', code: 'NOT_FOUND' });
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ error: 'Ism kiriting', code: 'NAME_REQUIRED' });
    await pool.query(`UPDATE workers SET name = $1 WHERE id = $2`, [n, id]);
  }
  if (password !== undefined && password !== '') {
    if (String(password).length < 4) return res.status(400).json({ error: "Parol kamida 4 belgidan iborat bo'lsin", code: 'PW_SHORT' });
    await pool.query(`UPDATE workers SET password_hash = $1 WHERE id = $2`, [await bcrypt.hash(String(password), 10), id]);
  }
  if (active !== undefined) {
    await pool.query(`UPDATE workers SET active = $1 WHERE id = $2`, [!!active, id]);
  }
  if (branchId !== undefined) {
    const b = (await pool.query(`SELECT id FROM branches WHERE id = $1`, [parseInt(branchId, 10)])).rows[0];
    if (!b) return res.status(400).json({ error: 'Filial topilmadi', code: 'NOT_FOUND' });
    await pool.query(`UPDATE workers SET branch_id = $1 WHERE id = $2`, [b.id, id]);
  }
  res.json({ ok: true });
}));

app.delete('/api/admin/workers/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query(`DELETE FROM workers WHERE id = $1`, [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
}));

// Oylik jamlanma (admin — tahrirlash huquqi bilan ishlatiladi)
app.get('/api/admin/summary', requireAdmin, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  res.json(await monthSummary(year, month));
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

// Ketish vaqti kelishdan kichik bo'lsa — tungi smena: ketish keyingi kunga o'tadi
function outDateFor(date, inTime, outTime) {
  if (!outTime || outTime > inTime) return date;
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Qo'lda yozuv qo'shish (skaner unutilgan kunlar uchun)
app.post('/api/admin/entries', requireAdmin, wrap(async (req, res) => {
  const { workerId, date, in: inTime, out: outTime } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: "Sana noto'g'ri", code: 'BAD_DATE' });
  if (!/^\d{2}:\d{2}$/.test(String(inTime || ''))) return res.status(400).json({ error: "Kelish vaqti noto'g'ri (SS:DD)", code: 'BAD_TIME' });
  if (outTime && !/^\d{2}:\d{2}$/.test(String(outTime))) return res.status(400).json({ error: "Ketish vaqti noto'g'ri (SS:DD)", code: 'BAD_TIME' });
  const w = (await pool.query(`SELECT id, branch_id FROM workers WHERE id = $1`, [parseInt(workerId, 10)])).rows[0];
  if (!w) return res.status(404).json({ error: 'Ishchi topilmadi', code: 'NOT_FOUND' });
  try {
    await pool.query(
      `INSERT INTO entries (worker_id, work_date, check_in, check_out, branch_id)
       VALUES ($1, $2::date,
               ($2 || ' ' || $3)::timestamp AT TIME ZONE $5,
               CASE WHEN $4::text IS NULL THEN NULL
                    ELSE ($6 || ' ' || $4)::timestamp AT TIME ZONE $5 END,
               $7)`,
      [w.id, date, inTime, outTime || null, TZ, outDateFor(date, inTime, outTime), w.branch_id]
    );
  } catch (e) {
    if (e.constraint === 'out_after_in') {
      return res.status(400).json({ error: "Ketish vaqti kelish vaqtidan keyin bo'lishi kerak", code: 'OUT_BEFORE_IN' });
    }
    throw e;
  }
  res.json({ ok: true });
}));

// Yozuvni tahrirlash
app.put('/api/admin/entries/:id', requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const e = (await pool.query(`SELECT id, work_date::text AS date FROM entries WHERE id = $1`, [id])).rows[0];
  if (!e) return res.status(404).json({ error: 'Yozuv topilmadi', code: 'NOT_FOUND' });
  const { in: inTime, out: outTime } = req.body || {};
  if (!/^\d{2}:\d{2}$/.test(String(inTime || ''))) return res.status(400).json({ error: "Kelish vaqti noto'g'ri (SS:DD)", code: 'BAD_TIME' });
  if (outTime && !/^\d{2}:\d{2}$/.test(String(outTime))) return res.status(400).json({ error: "Ketish vaqti noto'g'ri (SS:DD)", code: 'BAD_TIME' });
  try {
    await pool.query(
      `UPDATE entries SET
         check_in = ($2 || ' ' || $3)::timestamp AT TIME ZONE $5,
         check_out = CASE WHEN $4::text IS NULL THEN NULL
                          ELSE ($6 || ' ' || $4)::timestamp AT TIME ZONE $5 END
       WHERE id = $1`,
      [id, e.date, inTime, outTime || null, TZ, outDateFor(e.date, inTime, outTime)]
    );
  } catch (err) {
    if (err.constraint === 'out_after_in') {
      return res.status(400).json({ error: "Ketish vaqti kelish vaqtidan keyin bo'lishi kerak", code: 'OUT_BEFORE_IN' });
    }
    throw err;
  }
  res.json({ ok: true });
}));

// ---------- Sozlamalar (admin) ----------
app.get('/api/admin/settings', requireAdmin, wrap(async (req, res) => {
  res.json({ timezone: TZ });
}));

app.put('/api/admin/settings', requireAdmin, wrap(async (req, res) => {
  const tz = String((req.body || {}).timezone || '').trim();
  if (!tz || !validTz(tz)) return res.status(400).json({ error: "Vaqt zonasi noto'g'ri", code: 'BAD_TZ' });
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('timezone', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [tz]);
  TZ = tz;
  res.json({ ok: true, timezone: TZ });
}));

app.delete('/api/admin/entries/:id', requireAdmin, wrap(async (req, res) => {
  await pool.query(`DELETE FROM entries WHERE id = $1`, [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
}));

// ---------- Filiallar (admin) ----------
app.get('/api/admin/branches', requireAdmin, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT b.id, b.name, b.qr_token AS token,
            (SELECT count(*)::int FROM workers w WHERE w.branch_id = b.id AND w.active) AS workers
     FROM branches b ORDER BY b.id`
  );
  const out = [];
  for (const b of r.rows) {
    out.push({ ...b, dataUrl: await QRCode.toDataURL(b.token, { width: 512, margin: 2 }) });
  }
  res.json(out);
}));

app.post('/api/admin/branches', requireAdmin, wrap(async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Filial nomini kiriting', code: 'NAME_REQUIRED' });
  const r = await pool.query(
    `INSERT INTO branches (name, qr_token) VALUES ($1, $2) RETURNING id, name`,
    [name, newQrToken()]
  );
  res.json(r.rows[0]);
}));

app.put('/api/admin/branches/:id', requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Filial nomini kiriting', code: 'NAME_REQUIRED' });
  const r = await pool.query(`UPDATE branches SET name = $1 WHERE id = $2 RETURNING id`, [name, id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Filial topilmadi', code: 'NOT_FOUND' });
  res.json({ ok: true });
}));

app.delete('/api/admin/branches/:id', requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const n = (await pool.query(`SELECT count(*)::int AS n FROM branches`)).rows[0].n;
  if (n <= 1) return res.status(400).json({ error: "Kamida bitta filial qolishi kerak", code: 'LAST_BRANCH' });
  const used = (await pool.query(`SELECT count(*)::int AS n FROM workers WHERE branch_id = $1`, [id])).rows[0].n;
  if (used > 0) return res.status(400).json({ error: "Avval bu filialdagi ishchilarni boshqa filialga o'tkazing", code: 'BRANCH_HAS_WORKERS' });
  await pool.query(`DELETE FROM branches WHERE id = $1`, [id]);
  res.json({ ok: true });
}));

// Filial QR kodini yangilash (eski chop etilgan kod ishlamay qoladi)
app.post('/api/admin/branches/:id/qr/rotate', requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await pool.query(`UPDATE branches SET qr_token = $1 WHERE id = $2 RETURNING id`, [newQrToken(), id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Filial topilmadi', code: 'NOT_FOUND' });
  res.json({ ok: true });
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
    SESSION_SECRET = (await pool.query(`SELECT value FROM settings WHERE key = 'session_secret'`)).rows[0].value;
    const savedTz = (await pool.query(`SELECT value FROM settings WHERE key = 'timezone'`)).rows[0];
    if (savedTz && validTz(savedTz.value)) TZ = savedTz.value;
    app.listen(PORT, () => console.log(`LaLaKu Vaqt ${PORT}-portda ishlamoqda (${TIMEZONE})`));
  })
  .catch((e) => {
    console.error('Bazani sozlashda xato:', e);
    process.exit(1);
  });
