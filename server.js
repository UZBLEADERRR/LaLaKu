/**
 * LaLaKu Vaqt — ish vaqti va moliya SaaS platformasi (Koreya uchun).
 * Express + PostgreSQL. Railway'ga mos (PORT va DATABASE_URL env orqali).
 *
 * Akkauntlar: worker (₩990/oy) va business/oshxona (₩2900/oy), 7 kun bepul sinov.
 * To'lov: bank o'tkazmasi skrinshoti -> platforma admini tasdiqlaydi.
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const DEFAULT_TZ = process.env.TIMEZONE || 'Asia/Seoul';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATABASE_URL = process.env.DATABASE_URL;
const TRIAL_DAYS = 7;
const PRICES = { worker: 990, business: 2900 }; // KRW / oy

if (!DATABASE_URL) {
  console.error('DATABASE_URL topilmadi. Railway\'da PostgreSQL qo\'shing yoki env o\'rnating.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: /railway|render|heroku|amazonaws/.test(DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

const newToken = (p = 'LALAKU') => p + ':' + crypto.randomBytes(12).toString('hex');

// ---------- Sxema va eski versiyadan ko'chirish ----------
async function initDb() {
  // v1 jadvallarini arxivga o'tkazish (ma'lumot yo'qolmaydi)
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'entries' AND column_name = 'worker_id') THEN
        ALTER TABLE entries RENAME TO entries_legacy;
        ALTER TABLE workers RENAME TO workers_legacy;
        ALTER TABLE branches RENAME TO branches_legacy;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'worker',        -- worker | business
      timezone TEXT NOT NULL DEFAULT '${DEFAULT_TZ}',
      pay_type TEXT NOT NULL DEFAULT 'hourly',    -- hourly | daily
      hourly_rate NUMERIC NOT NULL DEFAULT 0,
      daily_rate NUMERIC NOT NULL DEFAULT 0,
      tax_percent NUMERIC NOT NULL DEFAULT 0,
      paid_until TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS orgs (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      invite_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      qr_token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS memberships (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, org_id)
    );
    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id INTEGER REFERENCES orgs(id) ON DELETE SET NULL,
      branch_id INTEGER,
      work_date DATE NOT NULL,
      check_in TIMESTAMPTZ NOT NULL,
      check_out TIMESTAMPTZ,
      CONSTRAINT out_after_in CHECK (check_out IS NULL OR check_out > check_in)
    );
    CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, work_date);
    CREATE INDEX IF NOT EXISTS idx_entries_org_date ON entries(org_id, work_date);
    CREATE TABLE IF NOT EXISTS finance_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,                         -- expense | debt | income
      title TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      due_day INTEGER,                            -- har oy shu kunda (1-31)
      due_date DATE,                              -- bir martalik (qarz)
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      image TEXT,
      link TEXT,
      status TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at TIMESTAMPTZ
    );
  `);

  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING`,
    [crypto.randomBytes(32).toString('hex')]
  );

  await migrateLegacy();
}

// v1 ishchilarini yangi akkauntlarga ko'chirish: email = ism@lalaku.local,
// parollari o'zgarmaydi, yozuvlari shaxsiy yozuv sifatida saqlanadi.
async function migrateLegacy() {
  const done = (await pool.query(`SELECT 1 FROM settings WHERE key = 'migrated_v2'`)).rows[0];
  if (done) return;
  const hasLegacy = (await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'workers_legacy'`)).rows[0];
  if (hasLegacy) {
    const tz = (await pool.query(`SELECT value FROM settings WHERE key = 'timezone'`)).rows[0]?.value || DEFAULT_TZ;
    const workers = (await pool.query(`SELECT * FROM workers_legacy`)).rows;
    const used = new Set();
    for (const w of workers) {
      let base = w.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'user';
      let email = `${base}@lalaku.local`;
      let i = 1;
      while (used.has(email)) email = `${base}${++i}@lalaku.local`;
      used.add(email);
      const exists = (await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email])).rows[0];
      if (exists) continue;
      const u = (await pool.query(
        `INSERT INTO users (email, password_hash, name, type, timezone, pay_type, hourly_rate, tax_percent, paid_until)
         VALUES ($1, $2, $3, 'worker', $4, 'hourly', $5, $6, now() + interval '30 days')
         RETURNING id`,
        [email, w.password_hash, w.name, tz, w.hourly_rate || 0, w.tax_percent || 0]
      )).rows[0];
      await pool.query(
        `INSERT INTO entries (user_id, work_date, check_in, check_out)
         SELECT $1, work_date, check_in, check_out FROM entries_legacy WHERE worker_id = $2`,
        [u.id, w.id]
      );
      console.log(`Ko'chirildi: ${w.name} -> ${email}`);
    }
  }
  await pool.query(`INSERT INTO settings (key, value) VALUES ('migrated_v2', '1') ON CONFLICT (key) DO NOTHING`);
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

// ---------- Vaqt zonasi (har bir foydalanuvchi o'ziniki) ----------
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
const localDate = (tz, d = new Date()) => tzFmts(tz).date.format(d);
const localTime = (tz, d = new Date()) => tzFmts(tz).time.format(d);

// ---------- Login urinishlarini cheklash ----------
const loginAttempts = new Map();
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
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, error, code) => res.status(status).json({ error, code });

async function loadUser(req) {
  const s = verifyToken(req.cookies.sid);
  if (!s || s.t !== 'user') return null;
  const r = await pool.query(`SELECT * FROM users WHERE id = $1`, [s.id]);
  return r.rows[0] || null;
}

function requireUser(req, res, next) {
  loadUser(req).then((u) => {
    if (!u) return fail(res, 401, 'Tizimga kiring', 'AUTH');
    req.user = u;
    next();
  }).catch(next);
}

// Obuna faolmi (sinov muddati yoki to'lov)
const isActive = (u) => new Date(u.paid_until) > new Date();
function requireActive(req, res, next) {
  if (!isActive(req.user)) return fail(res, 402, 'Obuna muddati tugagan', 'SUB_EXPIRED');
  next();
}

function requireBusiness(req, res, next) {
  if (req.user.type !== 'business') return fail(res, 403, 'Bu amal faqat biznes akkaunt uchun', 'BUSINESS_ONLY');
  next();
}

function requirePlatformAdmin(req, res, next) {
  const s = verifyToken(req.cookies.sid);
  if (!s || s.t !== 'padmin') return fail(res, 401, 'Admin sifatida kiring', 'AUTH_ADMIN');
  next();
}

async function orgOf(userId) {
  return (await pool.query(`SELECT * FROM orgs WHERE owner_id = $1`, [userId])).rows[0] || null;
}

// ================= UMUMIY =================
app.get('/healthz', (req, res) => res.json({ ok: true }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/register', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return fail(res, 429, "Urinishlar ko'p", 'RATE_LIMIT');
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const name = String((req.body || {}).name || '').trim();
  const type = (req.body || {}).type === 'business' ? 'business' : 'worker';
  const businessName = String((req.body || {}).businessName || '').trim();
  if (!EMAIL_RE.test(email)) return fail(res, 400, "Email noto'g'ri", 'BAD_EMAIL');
  if (password.length < 6) return fail(res, 400, "Parol kamida 6 belgi", 'PW_SHORT6');
  if (!name) return fail(res, 400, 'Ism kiriting', 'NAME_REQUIRED');
  if (type === 'business' && !businessName) return fail(res, 400, 'Oshxona nomini kiriting', 'BIZ_NAME_REQUIRED');
  const dup = (await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email])).rows[0];
  if (dup) return fail(res, 400, "Bu email ro'yxatdan o'tgan", 'EMAIL_TAKEN');

  const hash = await bcrypt.hash(password, 10);
  const u = (await pool.query(
    `INSERT INTO users (email, password_hash, name, type, paid_until)
     VALUES ($1, $2, $3, $4, now() + interval '${TRIAL_DAYS} days') RETURNING *`,
    [email, hash, name, type]
  )).rows[0];

  if (type === 'business') {
    const org = (await pool.query(
      `INSERT INTO orgs (owner_id, name, invite_token) VALUES ($1, $2, $3) RETURNING id`,
      [u.id, businessName, newToken('INVITE')]
    )).rows[0];
    await pool.query(`INSERT INTO branches (org_id, name, qr_token) VALUES ($1, $2, $3)`,
      [org.id, businessName, newToken()]);
  }

  setSessionCookie(res, { t: 'user', id: u.id }, 60);
  res.json(await meJson(u));
}));

app.post('/api/login', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return fail(res, 429, "Urinishlar ko'p", 'RATE_LIMIT');
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const u = (await pool.query(`SELECT * FROM users WHERE email = $1`, [email])).rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return fail(res, 401, "Email yoki parol noto'g'ri", 'BAD_LOGIN');
  }
  setSessionCookie(res, { t: 'user', id: u.id }, 60);
  res.json(await meJson(u));
}));

app.post('/api/logout', (req, res) => {
  res.clearCookie('sid');
  res.json({ ok: true });
});

async function meJson(u) {
  const memberships = (await pool.query(
    `SELECT m.org_id AS "orgId", o.name AS "orgName"
     FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1`, [u.id])).rows;
  const org = u.type === 'business' ? await orgOf(u.id) : null;
  const pending = (await pool.query(
    `SELECT 1 FROM payments WHERE user_id = $1 AND status = 'pending'`, [u.id])).rows[0];
  return {
    role: 'user',
    id: u.id, email: u.email, name: u.name, type: u.type,
    timezone: u.timezone,
    payType: u.pay_type, hourlyRate: +u.hourly_rate, dailyRate: +u.daily_rate, taxPercent: +u.tax_percent,
    active: isActive(u),
    paidUntil: u.paid_until,
    daysLeft: Math.max(0, Math.ceil((new Date(u.paid_until) - Date.now()) / 86400_000)),
    price: PRICES[u.type],
    pendingPayment: !!pending,
    org: org ? { id: org.id, name: org.name } : null,
    memberships,
  };
}

app.get('/api/me', wrap(async (req, res) => {
  const s = verifyToken(req.cookies.sid);
  if (s?.t === 'padmin') return res.json({ role: 'padmin' });
  const u = await loadUser(req);
  if (!u) return res.json({ role: null });
  res.json(await meJson(u));
}));

app.put('/api/profile', requireUser, wrap(async (req, res) => {
  const { name, email, password, timezone } = req.body || {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return fail(res, 400, 'Ism kiriting', 'NAME_REQUIRED');
    await pool.query(`UPDATE users SET name = $1 WHERE id = $2`, [n, req.user.id]);
  }
  if (email !== undefined) {
    const e = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return fail(res, 400, "Email noto'g'ri", 'BAD_EMAIL');
    const dup = (await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id <> $2`, [e, req.user.id])).rows[0];
    if (dup) return fail(res, 400, "Bu email band", 'EMAIL_TAKEN');
    await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [e, req.user.id]);
  }
  if (password !== undefined && password !== '') {
    if (String(password).length < 6) return fail(res, 400, 'Parol kamida 6 belgi', 'PW_SHORT6');
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`,
      [await bcrypt.hash(String(password), 10), req.user.id]);
  }
  if (timezone !== undefined) {
    if (!validTz(String(timezone))) return fail(res, 400, "Vaqt zonasi noto'g'ri", 'BAD_TZ');
    await pool.query(`UPDATE users SET timezone = $1 WHERE id = $2`, [String(timezone), req.user.id]);
  }
  res.json({ ok: true });
}));

// Maosh sozlamalari: soatlik yoki kunlik
app.put('/api/my/pay', requireUser, wrap(async (req, res) => {
  const payType = (req.body || {}).payType === 'daily' ? 'daily' : 'hourly';
  const hourly = Number((req.body || {}).hourlyRate ?? 0);
  const daily = Number((req.body || {}).dailyRate ?? 0);
  const tax = Number((req.body || {}).taxPercent ?? 0);
  if (!Number.isFinite(hourly) || hourly < 0 || hourly > 1e9) return fail(res, 400, "Soatlik maosh noto'g'ri", 'BAD_RATE');
  if (!Number.isFinite(daily) || daily < 0 || daily > 1e9) return fail(res, 400, "Kunlik maosh noto'g'ri", 'BAD_RATE');
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) return fail(res, 400, 'Soliq 0-100 orasida', 'BAD_TAX');
  await pool.query(
    `UPDATE users SET pay_type = $1, hourly_rate = $2, daily_rate = $3, tax_percent = $4 WHERE id = $5`,
    [payType, hourly, daily, tax, req.user.id]
  );
  res.json({ ok: true });
}));

// ================= OBUNA / TO'LOV =================
app.post('/api/payment', requireUser, wrap(async (req, res) => {
  const image = (req.body || {}).image ? String(req.body.image) : null;
  const link = (req.body || {}).link ? String(req.body.link).trim().slice(0, 500) : null;
  if (!image && !link) return fail(res, 400, "Skrinshot yoki to'lov havolasini yuboring", 'PAYMENT_PROOF_REQUIRED');
  if (image && (!image.startsWith('data:image/') || image.length > 2_000_000)) {
    return fail(res, 400, "Rasm noto'g'ri yoki juda katta", 'BAD_IMAGE');
  }
  const pending = (await pool.query(
    `SELECT 1 FROM payments WHERE user_id = $1 AND status = 'pending'`, [req.user.id])).rows[0];
  if (pending) return fail(res, 400, "Sizda tekshirilayotgan to'lov bor", 'PAYMENT_PENDING');
  await pool.query(
    `INSERT INTO payments (user_id, amount, image, link) VALUES ($1, $2, $3, $4)`,
    [req.user.id, PRICES[req.user.type], image, link]
  );
  res.json({ ok: true });
}));

// ================= VAQT HISOBI =================
async function openEntry(userId) {
  return (await pool.query(
    `SELECT * FROM entries WHERE user_id = $1 AND check_out IS NULL ORDER BY check_in DESC LIMIT 1`,
    [userId])).rows[0] || null;
}

app.get('/api/my/status', requireUser, wrap(async (req, res) => {
  const tz = req.user.timezone;
  const open = await openEntry(req.user.id);
  let orgName = null;
  if (open?.org_id) {
    orgName = (await pool.query(`SELECT name FROM orgs WHERE id = $1`, [open.org_id])).rows[0]?.name || null;
  }
  res.json({
    checkedIn: !!open,
    since: open ? localTime(tz, open.check_in) : null,
    sinceDate: open ? localDate(tz, open.check_in) : null,
    sinceIso: open ? open.check_in.toISOString() : null,
    orgName,
  });
}));

async function togglePunch(user, orgId, branchId, res) {
  const now = new Date();
  const open = await openEntry(user.id);
  const tz = user.timezone;
  if (open) {
    if (now - new Date(open.check_in) < 60_000) {
      return fail(res, 400, 'Hozirgina boshlagansiz', 'DUP_SCAN');
    }
    await pool.query(`UPDATE entries SET check_out = $1 WHERE id = $2`, [now, open.id]);
    return res.json({ action: 'out', time: localTime(tz, now), date: localDate(tz, now) });
  }
  await pool.query(
    `INSERT INTO entries (user_id, org_id, branch_id, work_date, check_in) VALUES ($1, $2, $3, $4, $5)`,
    [user.id, orgId, branchId, localDate(tz, now), now]
  );
  res.json({ action: 'in', time: localTime(tz, now), date: localDate(tz, now) });
}

// QR skanerlash (jamoa a'zolari uchun)
app.post('/api/scan', requireUser, requireActive, wrap(async (req, res) => {
  const code = String((req.body || {}).code || '').trim();
  const b = (await pool.query(
    `SELECT b.id, b.org_id FROM branches b WHERE b.qr_token = $1`, [code])).rows[0];
  if (!b) return fail(res, 400, "QR kod noto'g'ri", 'BAD_QR');
  const member = (await pool.query(
    `SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2`, [req.user.id, b.org_id])).rows[0];
  if (!member) return fail(res, 403, "Siz bu jamoaning a'zosi emassiz", 'NOT_MEMBER');
  await togglePunch(req.user, b.org_id, b.id, res);
}));

// Qo'lda boshlash/tugatish (shaxsiy hisob uchun)
app.post('/api/punch', requireUser, requireActive, wrap(async (req, res) => {
  await togglePunch(req.user, null, null, res);
}));

function parseYearMonth(req, res) {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) {
    fail(res, 400, "Yil/oy noto'g'ri", 'BAD_MONTH');
    return {};
  }
  return { year, month };
}

const monthBounds = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start, next };
};

// Bir foydalanuvchining oylik hisobi (ochiq sessiyalar jonli hisoblanadi)
async function userMonth(userId, tz, year, month, orgOnly = null) {
  const { start, next } = monthBounds(year, month);
  const r = await pool.query(
    `SELECT e.id, e.work_date::text AS date, e.check_in, e.check_out, e.org_id,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(e.check_out, now()) - e.check_in)) / 60)::int AS minutes
     FROM entries e
     WHERE e.user_id = $1 AND e.work_date >= $2 AND e.work_date < $3
       AND ($4::int IS NULL OR e.org_id = $4)
     ORDER BY e.check_in`,
    [userId, start, next, orgOnly]
  );
  const days = {};
  let totalMinutes = 0;
  for (const e of r.rows) {
    const d = (days[e.date] ||= { sessions: [], minutes: 0, open: false });
    d.sessions.push({ id: e.id, in: localTime(tz, e.check_in), out: e.check_out ? localTime(tz, e.check_out) : null, minutes: e.minutes });
    d.minutes += e.minutes;
    totalMinutes += e.minutes;
    if (!e.check_out) d.open = true;
  }
  const daysWorked = Object.values(days).filter((d) => d.minutes > 0 || d.open).length;
  return { year, month, days, totalMinutes, daysWorked };
}

app.get('/api/my/summary', requireUser, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  res.json(await userMonth(req.user.id, req.user.timezone, year, month));
}));

// ================= MOLIYA =================
app.get('/api/finance', requireUser, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, kind, title, amount::float, due_day AS "dueDay", due_date::text AS "dueDate", active
     FROM finance_items WHERE user_id = $1 ORDER BY active DESC, kind, id DESC`, [req.user.id]);
  res.json(r.rows);
}));

function validFinance(body, res) {
  const kind = ['expense', 'debt', 'income'].includes(body.kind) ? body.kind : null;
  const title = String(body.title || '').trim();
  const amount = Number(body.amount);
  const dueDay = body.dueDay ? parseInt(body.dueDay, 10) : null;
  const dueDate = body.dueDate ? String(body.dueDate) : null;
  if (!kind) { fail(res, 400, "Turi noto'g'ri", 'BAD_KIND'); return null; }
  if (!title) { fail(res, 400, 'Nomini kiriting', 'NAME_REQUIRED'); return null; }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) { fail(res, 400, "Summa noto'g'ri", 'BAD_AMOUNT'); return null; }
  if (dueDay && (dueDay < 1 || dueDay > 31)) { fail(res, 400, "Kun 1-31 orasida", 'BAD_DAY'); return null; }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { fail(res, 400, "Sana noto'g'ri", 'BAD_DATE'); return null; }
  return { kind, title, amount, dueDay, dueDate };
}

app.post('/api/finance', requireUser, wrap(async (req, res) => {
  const v = validFinance(req.body || {}, res);
  if (!v) return;
  const r = await pool.query(
    `INSERT INTO finance_items (user_id, kind, title, amount, due_day, due_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.id, v.kind, v.title, v.amount, v.dueDay, v.dueDate]);
  res.json({ ok: true, id: r.rows[0].id });
}));

app.put('/api/finance/:id', requireUser, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const own = (await pool.query(`SELECT kind FROM finance_items WHERE id = $1 AND user_id = $2`, [id, req.user.id])).rows[0];
  if (!own) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  if ((req.body || {}).active !== undefined) {
    await pool.query(`UPDATE finance_items SET active = $1 WHERE id = $2`, [!!req.body.active, id]);
    return res.json({ ok: true });
  }
  const v = validFinance({ ...req.body, kind: own.kind }, res);
  if (!v) return;
  await pool.query(
    `UPDATE finance_items SET title = $1, amount = $2, due_day = $3, due_date = $4 WHERE id = $5`,
    [v.title, v.amount, v.dueDay, v.dueDate, id]);
  res.json({ ok: true });
}));

app.delete('/api/finance/:id', requireUser, wrap(async (req, res) => {
  await pool.query(`DELETE FROM finance_items WHERE id = $1 AND user_id = $2`,
    [parseInt(req.params.id, 10), req.user.id]);
  res.json({ ok: true });
}));

// ================= JAMOA (biznes akkaunt) =================
app.get('/api/org', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const branches = (await pool.query(
    `SELECT id, name, qr_token AS token FROM branches WHERE org_id = $1 ORDER BY id`, [org.id])).rows;
  for (const b of branches) {
    b.dataUrl = await QRCode.toDataURL(b.token, { width: 512, margin: 2 });
  }
  const members = (await pool.query(
    `SELECT u.id, u.name, u.email, m.joined_at AS "joinedAt"
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 ORDER BY u.name`, [org.id])).rows;
  res.json({
    id: org.id, name: org.name,
    inviteToken: org.invite_token,
    branches, members,
  });
}));

app.put('/api/org', requireUser, requireBusiness, wrap(async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return fail(res, 400, 'Nomini kiriting', 'NAME_REQUIRED');
  const org = await orgOf(req.user.id);
  await pool.query(`UPDATE orgs SET name = $1 WHERE id = $2`, [name, org.id]);
  res.json({ ok: true });
}));

app.post('/api/org/invite/rotate', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const token = newToken('INVITE');
  await pool.query(`UPDATE orgs SET invite_token = $1 WHERE id = $2`, [token, org.id]);
  res.json({ inviteToken: token });
}));

app.delete('/api/org/members/:userId', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  await pool.query(`DELETE FROM memberships WHERE org_id = $1 AND user_id = $2`,
    [org.id, parseInt(req.params.userId, 10)]);
  res.json({ ok: true });
}));

// Filiallar
app.post('/api/org/branches', requireUser, requireBusiness, requireActive, wrap(async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return fail(res, 400, 'Nomini kiriting', 'NAME_REQUIRED');
  const org = await orgOf(req.user.id);
  await pool.query(`INSERT INTO branches (org_id, name, qr_token) VALUES ($1, $2, $3)`,
    [org.id, name, newToken()]);
  res.json({ ok: true });
}));

app.put('/api/org/branches/:id', requireUser, requireBusiness, wrap(async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return fail(res, 400, 'Nomini kiriting', 'NAME_REQUIRED');
  const org = await orgOf(req.user.id);
  const r = await pool.query(`UPDATE branches SET name = $1 WHERE id = $2 AND org_id = $3 RETURNING id`,
    [name, parseInt(req.params.id, 10), org.id]);
  if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  res.json({ ok: true });
}));

app.delete('/api/org/branches/:id', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const n = (await pool.query(`SELECT count(*)::int AS n FROM branches WHERE org_id = $1`, [org.id])).rows[0].n;
  if (n <= 1) return fail(res, 400, 'Kamida bitta filial qolishi kerak', 'LAST_BRANCH');
  await pool.query(`DELETE FROM branches WHERE id = $1 AND org_id = $2`, [parseInt(req.params.id, 10), org.id]);
  res.json({ ok: true });
}));

app.post('/api/org/branches/:id/qr/rotate', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const r = await pool.query(`UPDATE branches SET qr_token = $1 WHERE id = $2 AND org_id = $3 RETURNING id`,
    [newToken(), parseInt(req.params.id, 10), org.id]);
  if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  res.json({ ok: true });
}));

// Jamoa oylik jadvali (faqat shu jamoadagi yozuvlar)
app.get('/api/org/summary', requireUser, requireBusiness, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  const org = await orgOf(req.user.id);
  const { start, next } = monthBounds(year, month);
  const members = (await pool.query(
    `SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 ORDER BY u.name`, [org.id])).rows;
  const sums = (await pool.query(
    `SELECT user_id, work_date::text AS date,
            SUM(ROUND(EXTRACT(EPOCH FROM (COALESCE(check_out, now()) - check_in)) / 60))::int AS minutes,
            BOOL_OR(check_out IS NULL) AS open
     FROM entries WHERE org_id = $1 AND work_date >= $2 AND work_date < $3
     GROUP BY user_id, work_date`, [org.id, start, next])).rows;
  const byUser = {};
  for (const s of sums) (byUser[s.user_id] ||= {})[s.date] = { minutes: s.minutes, open: s.open };
  res.json({
    year, month,
    workers: members.map((m) => {
      const days = byUser[m.id] || {};
      return { id: m.id, name: m.name, days, totalMinutes: Object.values(days).reduce((a, d) => a + d.minutes, 0) };
    }),
  });
}));

// Jamoaning bugungi jonli holati
app.get('/api/org/board', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const tz = req.user.timezone;
  const today = localDate(tz);
  const rows = (await pool.query(
    `SELECT u.id, u.name,
            COALESCE(SUM(ROUND(EXTRACT(EPOCH FROM (COALESCE(e.check_out, now()) - e.check_in)) / 60)), 0)::int AS minutes,
            BOOL_OR(e.check_out IS NULL) AS open,
            MIN(e.check_in) AS first_in
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN entries e ON e.user_id = u.id AND e.org_id = $1 AND e.work_date = $2
     WHERE m.org_id = $1
     GROUP BY u.id ORDER BY u.name`, [org.id, today])).rows;
  res.json({
    date: today, time: localTime(tz),
    workers: rows.map((r) => ({
      id: r.id, name: r.name, minutes: r.minutes,
      status: r.open ? 'in' : (r.minutes > 0 ? 'out' : 'none'),
      since: r.first_in ? localTime(tz, r.first_in) : null,
    })),
  });
}));

// A'zoning oylik tafsiloti (tahrirlash oynasi uchun)
app.get('/api/org/member/:id/summary', requireUser, requireBusiness, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  const org = await orgOf(req.user.id);
  const uid = parseInt(req.params.id, 10);
  const member = (await pool.query(
    `SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 AND m.user_id = $2`, [org.id, uid])).rows[0];
  if (!member) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  res.json({ worker: member, ...(await userMonth(uid, req.user.timezone, year, month, org.id)) });
}));

// Ketish kelishdan kichik bo'lsa — tungi smena (keyingi kun)
function outDateFor(date, inTime, outTime) {
  if (!outTime || outTime > inTime) return date;
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const TIME_RE = /^\d{2}:\d{2}$/;

app.post('/api/org/entries', requireUser, requireBusiness, wrap(async (req, res) => {
  const { userId, date, in: inTime, out: outTime } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return fail(res, 400, "Sana noto'g'ri", 'BAD_DATE');
  if (!TIME_RE.test(String(inTime || ''))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  if (outTime && !TIME_RE.test(String(outTime))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  const org = await orgOf(req.user.id);
  const member = (await pool.query(
    `SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2`, [org.id, parseInt(userId, 10)])).rows[0];
  if (!member) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  try {
    await pool.query(
      `INSERT INTO entries (user_id, org_id, work_date, check_in, check_out)
       VALUES ($1, $2, $3::date,
               ($3 || ' ' || $4)::timestamp AT TIME ZONE $6,
               CASE WHEN $5::text IS NULL THEN NULL
                    ELSE ($7 || ' ' || $5)::timestamp AT TIME ZONE $6 END)`,
      [parseInt(userId, 10), org.id, date, inTime, outTime || null, req.user.timezone, outDateFor(date, inTime, outTime)]);
  } catch (e) {
    if (e.constraint === 'out_after_in') return fail(res, 400, "Ketish kelishdan keyin bo'lsin", 'OUT_BEFORE_IN');
    throw e;
  }
  res.json({ ok: true });
}));

app.put('/api/org/entries/:id', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const id = parseInt(req.params.id, 10);
  const e = (await pool.query(
    `SELECT id, work_date::text AS date FROM entries WHERE id = $1 AND org_id = $2`, [id, org.id])).rows[0];
  if (!e) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  const { in: inTime, out: outTime } = req.body || {};
  if (!TIME_RE.test(String(inTime || ''))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  if (outTime && !TIME_RE.test(String(outTime))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  try {
    await pool.query(
      `UPDATE entries SET
         check_in = ($2 || ' ' || $3)::timestamp AT TIME ZONE $5,
         check_out = CASE WHEN $4::text IS NULL THEN NULL
                          ELSE ($6 || ' ' || $4)::timestamp AT TIME ZONE $5 END
       WHERE id = $1`,
      [id, e.date, inTime, outTime || null, req.user.timezone, outDateFor(e.date, inTime, outTime)]);
  } catch (err) {
    if (err.constraint === 'out_after_in') return fail(res, 400, "Ketish kelishdan keyin bo'lsin", 'OUT_BEFORE_IN');
    throw err;
  }
  res.json({ ok: true });
}));

app.delete('/api/org/entries/:id', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  await pool.query(`DELETE FROM entries WHERE id = $1 AND org_id = $2`, [parseInt(req.params.id, 10), org.id]);
  res.json({ ok: true });
}));

// ================= TAKLIF HAVOLASI =================
app.get('/api/invite/:token', wrap(async (req, res) => {
  const org = (await pool.query(`SELECT id, name FROM orgs WHERE invite_token = $1`, [req.params.token])).rows[0];
  if (!org) return fail(res, 404, 'Taklif havolasi eskirgan', 'BAD_INVITE');
  res.json({ orgName: org.name });
}));

app.post('/api/join', requireUser, wrap(async (req, res) => {
  const token = String((req.body || {}).token || '');
  const org = (await pool.query(`SELECT id, name FROM orgs WHERE invite_token = $1`, [token])).rows[0];
  if (!org) return fail(res, 404, 'Taklif havolasi eskirgan', 'BAD_INVITE');
  if (req.user.type === 'business') return fail(res, 400, "Biznes akkaunt jamoaga qo'shila olmaydi", 'BUSINESS_CANT_JOIN');
  await pool.query(
    `INSERT INTO memberships (user_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.user.id, org.id]);
  res.json({ ok: true, orgName: org.name });
}));

app.delete('/api/my/memberships/:orgId', requireUser, wrap(async (req, res) => {
  await pool.query(`DELETE FROM memberships WHERE user_id = $1 AND org_id = $2`,
    [req.user.id, parseInt(req.params.orgId, 10)]);
  res.json({ ok: true });
}));

// ================= PLATFORMA ADMINI =================
app.post('/api/admin/login', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return fail(res, 429, "Urinishlar ko'p", 'RATE_LIMIT');
  if (String((req.body || {}).password || '') !== ADMIN_PASSWORD) {
    return fail(res, 401, "Parol noto'g'ri", 'BAD_PASSWORD');
  }
  setSessionCookie(res, { t: 'padmin' }, 7);
  res.json({ ok: true, defaultPassword: ADMIN_PASSWORD === 'admin123' });
}));

app.get('/api/admin/overview', requirePlatformAdmin, wrap(async (req, res) => {
  const stats = (await pool.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE type = 'business')::int AS business,
      count(*) FILTER (WHERE paid_until > now())::int AS active
    FROM users`)).rows[0];
  const pending = (await pool.query(
    `SELECT count(*)::int AS n FROM payments WHERE status = 'pending'`)).rows[0].n;
  res.json({ ...stats, pendingPayments: pending });
}));

app.get('/api/admin/users', requirePlatformAdmin, wrap(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const r = await pool.query(
    `SELECT id, email, name, type, paid_until AS "paidUntil", created_at AS "createdAt",
            (paid_until > now()) AS active
     FROM users WHERE email ILIKE $1 OR name ILIKE $1
     ORDER BY created_at DESC LIMIT 100`, [q]);
  res.json(r.rows);
}));

app.put('/api/admin/users/:id', requirePlatformAdmin, wrap(async (req, res) => {
  const days = parseInt((req.body || {}).addDays, 10);
  if (!Number.isFinite(days) || Math.abs(days) > 3660) return fail(res, 400, "Kun soni noto'g'ri", 'BAD_DAYS');
  const r = await pool.query(
    `UPDATE users SET paid_until = GREATEST(paid_until, now()) + ($1 || ' days')::interval
     WHERE id = $2 RETURNING paid_until AS "paidUntil"`,
    [days, parseInt(req.params.id, 10)]);
  if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  res.json(r.rows[0]);
}));

app.get('/api/admin/payments', requirePlatformAdmin, wrap(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const r = await pool.query(
    `SELECT p.id, p.amount, p.image, p.link, p.status, p.created_at AS "createdAt",
            u.id AS "userId", u.email, u.name, u.type
     FROM payments p JOIN users u ON u.id = p.user_id
     WHERE p.status = $1 ORDER BY p.created_at DESC LIMIT 50`, [status]);
  res.json(r.rows);
}));

app.post('/api/admin/payments/:id/approve', requirePlatformAdmin, wrap(async (req, res) => {
  const p = (await pool.query(
    `UPDATE payments SET status = 'approved', decided_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING user_id`, [parseInt(req.params.id, 10)])).rows[0];
  if (!p) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  await pool.query(
    `UPDATE users SET paid_until = GREATEST(paid_until, now()) + interval '30 days' WHERE id = $1`,
    [p.user_id]);
  res.json({ ok: true });
}));

app.post('/api/admin/payments/:id/reject', requirePlatformAdmin, wrap(async (req, res) => {
  await pool.query(
    `UPDATE payments SET status = 'rejected', decided_at = now() WHERE id = $1 AND status = 'pending'`,
    [parseInt(req.params.id, 10)]);
  res.json({ ok: true });
}));

// SPA: qolgan barcha yo'llar index.html'ga (jumladan /join/TOKEN)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Topilmadi', code: 'NOT_FOUND' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server xatosi', code: 'SERVER_ERROR' });
});

initDb()
  .then(async () => {
    SESSION_SECRET = (await pool.query(`SELECT value FROM settings WHERE key = 'session_secret'`)).rows[0].value;
    app.listen(PORT, () => console.log(`LaLaKu Vaqt ${PORT}-portda ishlamoqda`));
  })
  .catch((e) => {
    console.error('Bazani sozlashda xato:', e);
    process.exit(1);
  });
