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
const TRIAL_DAYS = 15;
const PRICES = { worker: 990, business: 2900 }; // standart, admin o'zgartira oladi
let PRICE_OVERRIDES = {};
async function priceFor(u) {
  if (u.custom_price != null) return u.custom_price;
  return PRICE_OVERRIDES[u.type] ?? PRICES[u.type];
}

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
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id INTEGER REFERENCES orgs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      pay_type TEXT NOT NULL DEFAULT 'hourly',
      rate NUMERIC NOT NULL DEFAULT 0,
      tax_percent NUMERIC NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS org_invites (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',     -- pending | accepted | declined
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (org_id, user_id)
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

  await pool.query(`
    ALTER TABLE orgs ADD COLUMN IF NOT EXISTS check_mode TEXT NOT NULL DEFAULT 'qr';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS birthdate DATE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_price INTEGER;
    ALTER TABLE memberships ADD COLUMN IF NOT EXISTS tax_percent NUMERIC NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS radius INTEGER NOT NULL DEFAULT 50;
    ALTER TABLE memberships ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC NOT NULL DEFAULT 0;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL;
  `);

  // Mavjud jamoa a'zoliklari uchun bog'langan ish joyi yozuvlari
  await pool.query(`
    INSERT INTO jobs (user_id, org_id, name)
    SELECT m.user_id, m.org_id, o.name FROM memberships m
    JOIN orgs o ON o.id = m.org_id
    WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.user_id = m.user_id AND j.org_id = m.org_id)
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

// Ikki nuqta orasidagi masofa (metrda)
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Joylashuv tekshiruvi: koordinatali filiallardan eng yaqini radius ichidami
function geofenceCheck(branches, lat, lng) {
  const located = branches.filter((b) => b.lat != null && b.lng != null);
  if (!located.length) return { ok: true };
  if (lat == null || lng == null) return { ok: false, code: 'LOCATION_REQUIRED' };
  let best = Infinity, radius = 50;
  for (const b of located) {
    const d = distanceM(lat, lng, b.lat, b.lng);
    if (d < best) { best = d; radius = b.radius || 50; }
  }
  if (best > radius) return { ok: false, code: 'TOO_FAR', distance: Math.round(best) };
  return { ok: true };
}

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

function sessionOf(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    const s = verifyToken(h.slice(7));
    if (s) return s;
  }
  return verifyToken(req.cookies.sid);
}

async function loadUser(req) {
  const s = sessionOf(req);
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
  const s = sessionOf(req);
  if (!s || s.t !== 'padmin') return fail(res, 401, 'Admin sifatida kiring', 'AUTH_ADMIN');
  next();
}

async function orgOf(userId) {
  return (await pool.query(`SELECT * FROM orgs WHERE owner_id = $1`, [userId])).rows[0] || null;
}

// ================= UMUMIY =================
app.get('/healthz', (req, res) => res.json({ ok: true }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_RE = /^\+?[0-9][0-9 -]{6,18}$/;
const normPhone = (p) => String(p || '').replace(/[^0-9+]/g, '');

app.post('/api/register', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return fail(res, 429, "Urinishlar ko'p", 'RATE_LIMIT');
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const name = String((req.body || {}).name || '').trim();
  const type = (req.body || {}).type === 'business' ? 'business' : 'worker';
  const businessName = String((req.body || {}).businessName || '').trim();
  const phone = normPhone((req.body || {}).phone);
  const birthdate = String((req.body || {}).birthdate || '').trim() || null;
  if (!EMAIL_RE.test(email)) return fail(res, 400, "Email noto'g'ri", 'BAD_EMAIL');
  if (phone && !PHONE_RE.test(phone)) return fail(res, 400, "Telefon raqam noto'g'ri", 'BAD_PHONE');
  if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return fail(res, 400, "Sana noto'g'ri", 'BAD_DATE');
  // Parol ixtiyoriy — telefon + tug'ilgan kun bo'lsa, tug'ilgan kun parol o'rnida
  if (!password && !(phone && birthdate)) return fail(res, 400, "Parol kamida 6 belgi", 'PW_SHORT6');
  if (password && password.length < 6) return fail(res, 400, "Parol kamida 6 belgi", 'PW_SHORT6');
  if (!name) return fail(res, 400, 'Ism kiriting', 'NAME_REQUIRED');
  if (type === 'business' && !businessName) return fail(res, 400, 'Oshxona nomini kiriting', 'BIZ_NAME_REQUIRED');
  const dup = (await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email])).rows[0];
  if (dup) return fail(res, 400, "Bu email ro'yxatdan o'tgan", 'EMAIL_TAKEN');
  if (phone) {
    const dupP = (await pool.query(`SELECT 1 FROM users WHERE phone = $1`, [phone])).rows[0];
    if (dupP) return fail(res, 400, "Bu telefon ro'yxatdan o'tgan", 'PHONE_TAKEN');
  }

  const hash = await bcrypt.hash(password || birthdate, 10);
  const u = (await pool.query(
    `INSERT INTO users (email, password_hash, name, type, phone, birthdate, paid_until)
     VALUES ($1, $2, $3, $4, $5, $6, now() + interval '${TRIAL_DAYS} days') RETURNING *`,
    [email, hash, name, type, phone || null, birthdate]
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
  const { email, password, phone, birthdate } = req.body || {};
  let u, cred;
  if (phone) {
    u = (await pool.query(`SELECT * FROM users WHERE phone = $1`, [normPhone(phone)])).rows[0];
    cred = String(password || birthdate || '');
  } else {
    u = (await pool.query(`SELECT * FROM users WHERE email = $1`,
      [String(email || '').trim().toLowerCase()])).rows[0];
    cred = String(password || '');
  }
  let ok = u && (await bcrypt.compare(cred, u.password_hash));
  // Telefon rejimida parol kiritilgan-u mos kelmasa, tug'ilgan kun bilan ham tekshiramiz
  if (!ok && u && phone && birthdate && password) {
    ok = await bcrypt.compare(String(birthdate), u.password_hash);
  }
  if (!ok) return fail(res, 401, "Email yoki parol noto'g'ri", 'BAD_LOGIN');
  setSessionCookie(res, { t: 'user', id: u.id }, 60);
  res.json(await meJson(u));
}));

app.post('/api/logout', (req, res) => {
  res.clearCookie('sid');
  res.json({ ok: true });
});

async function meJson(u) {
  const memberships = (await pool.query(
    `SELECT m.org_id AS "orgId", o.name AS "orgName", o.check_mode AS "checkMode"
     FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1`, [u.id])).rows;
  const org = u.type === 'business' ? await orgOf(u.id) : null;
  const pending = (await pool.query(
    `SELECT 1 FROM payments WHERE user_id = $1 AND status = 'pending'`, [u.id])).rows[0];
  const invites = u.type === 'business' ? [] : (await pool.query(
    `SELECT i.id, i.org_id AS "orgId", o.name AS "orgName"
     FROM org_invites i JOIN orgs o ON o.id = i.org_id
     WHERE i.user_id = $1 AND i.status = 'pending'`, [u.id])).rows;
  return {
    role: 'user',
    id: u.id, email: u.email, name: u.name, type: u.type,
    phone: u.phone || '',
    timezone: u.timezone,
    payType: u.pay_type, hourlyRate: +u.hourly_rate, dailyRate: +u.daily_rate, taxPercent: +u.tax_percent,
    active: isActive(u),
    paidUntil: u.paid_until,
    daysLeft: Math.max(0, Math.ceil((new Date(u.paid_until) - Date.now()) / 86400_000)),
    price: await priceFor(u),
    token: signToken({ t: 'user', id: u.id, exp: Date.now() + 60 * 86400_000 }),
    pendingPayment: !!pending,
    org: org ? { id: org.id, name: org.name } : null,
    memberships,
    invites,
  };
}

app.get('/api/me', wrap(async (req, res) => {
  const s = sessionOf(req);
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
  if ((req.body || {}).phone !== undefined) {
    const p = normPhone(req.body.phone);
    if (p && !PHONE_RE.test(p)) return fail(res, 400, "Telefon raqam noto'g'ri", 'BAD_PHONE');
    if (p) {
      const dup = (await pool.query(`SELECT 1 FROM users WHERE phone = $1 AND id <> $2`, [p, req.user.id])).rows[0];
      if (dup) return fail(res, 400, "Bu telefon band", 'PHONE_TAKEN');
    }
    await pool.query(`UPDATE users SET phone = $1 WHERE id = $2`, [p || null, req.user.id]);
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
    [req.user.id, await priceFor(req.user), image, link]
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
  let orgName = null, orgCheckMode = null;
  if (open?.org_id) {
    const o = (await pool.query(`SELECT name, check_mode FROM orgs WHERE id = $1`, [open.org_id])).rows[0];
    orgName = o?.name || null;
    orgCheckMode = o?.check_mode || null;
  }
  res.json({
    checkedIn: !!open,
    since: open ? localTime(tz, open.check_in) : null,
    sinceDate: open ? localDate(tz, open.check_in) : null,
    sinceIso: open ? open.check_in.toISOString() : null,
    orgName, orgId: open?.org_id || null, orgCheckMode,
    jobId: open?.job_id || null,
  });
}));

async function togglePunch(user, orgId, branchId, jobId, res) {
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
    `INSERT INTO entries (user_id, org_id, branch_id, job_id, work_date, check_in) VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, orgId, branchId, jobId, localDate(tz, now), now]
  );
  res.json({ action: 'in', time: localTime(tz, now), date: localDate(tz, now) });
}

// Jamoa uchun: foydalanuvchining shu jamoaga bog'langan ish joyi yozuvi
async function orgJobId(userId, orgId) {
  return (await pool.query(
    `SELECT id FROM jobs WHERE user_id = $1 AND org_id = $2`, [userId, orgId])).rows[0]?.id || null;
}

// QR skanerlash (jamoa a'zolari uchun) — joylashuv tekshiruvi bilan
app.post('/api/scan', requireUser, requireActive, wrap(async (req, res) => {
  const code = String((req.body || {}).code || '').trim();
  const { lat, lng } = req.body || {};
  const b = (await pool.query(
    `SELECT b.id, b.org_id, b.lat, b.lng, b.radius FROM branches b WHERE b.qr_token = $1`, [code])).rows[0];
  if (!b) return fail(res, 400, "QR kod noto'g'ri", 'BAD_QR');
  const member = (await pool.query(
    `SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2`, [req.user.id, b.org_id])).rows[0];
  if (!member) return fail(res, 403, "Siz bu jamoaning a'zosi emassiz", 'NOT_MEMBER');
  const geo = geofenceCheck([b], lat, lng);
  if (!geo.ok) {
    return fail(res, 403, geo.code === 'TOO_FAR'
      ? `Siz ish joyidan ${geo.distance} m uzoqdasiz` : 'Joylashuvga ruxsat kerak', geo.code);
  }
  await togglePunch(req.user, b.org_id, b.id, await orgJobId(req.user.id, b.org_id), res);
}));

// Qo'lda boshlash/tugatish: shaxsiy (jobId) yoki tugma rejimidagi jamoa (orgId)
app.post('/api/punch', requireUser, requireActive, wrap(async (req, res) => {
  const { orgId, jobId, lat, lng } = req.body || {};

  // Yopish: ochiq yozuv bo'lsa uning qoidalari qo'llanadi
  const open = await openEntry(req.user.id);
  if (open) {
    if (open.org_id) {
      const org = (await pool.query(`SELECT check_mode FROM orgs WHERE id = $1`, [open.org_id])).rows[0];
      if (org?.check_mode === 'qr') return fail(res, 400, 'Ketish uchun QR skanerlang', 'USE_QR');
      const branches = (await pool.query(
        `SELECT lat, lng, radius FROM branches WHERE org_id = $1`, [open.org_id])).rows;
      const geo = geofenceCheck(branches, lat, lng);
      if (!geo.ok) {
        return fail(res, 403, geo.code === 'TOO_FAR'
          ? `Siz ish joyidan ${geo.distance} m uzoqdasiz` : 'Joylashuvga ruxsat kerak', geo.code);
      }
    }
    return togglePunch(req.user, null, null, null, res);
  }

  // Boshlash
  if (orgId) {
    const oid = parseInt(orgId, 10);
    const member = (await pool.query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2`, [req.user.id, oid])).rows[0];
    if (!member) return fail(res, 403, "Siz bu jamoaning a'zosi emassiz", 'NOT_MEMBER');
    const org = (await pool.query(`SELECT check_mode FROM orgs WHERE id = $1`, [oid])).rows[0];
    if (org?.check_mode === 'qr') return fail(res, 400, 'Bu jamoada QR skanerlash kerak', 'USE_QR');
    const branches = (await pool.query(
      `SELECT lat, lng, radius FROM branches WHERE org_id = $1`, [oid])).rows;
    const geo = geofenceCheck(branches, lat, lng);
    if (!geo.ok) {
      return fail(res, 403, geo.code === 'TOO_FAR'
        ? `Siz ish joyidan ${geo.distance} m uzoqdasiz` : 'Joylashuvga ruxsat kerak', geo.code);
    }
    return togglePunch(req.user, oid, null, await orgJobId(req.user.id, oid), res);
  }
  let jid = null;
  if (jobId) {
    const j = (await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND user_id = $2 AND org_id IS NULL AND active`,
      [parseInt(jobId, 10), req.user.id])).rows[0];
    if (!j) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
    jid = j.id;
  }
  await togglePunch(req.user, null, null, jid, res);
}));

// ---------- Shaxsiy ish joylari ----------
app.get('/api/jobs', requireUser, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, org_id AS "orgId", name, pay_type AS "payType", rate::float,
            tax_percent AS "taxPercent", active
     FROM jobs WHERE user_id = $1 ORDER BY org_id NULLS FIRST, id`, [req.user.id]);
  res.json(r.rows.map((j) => ({ ...j, taxPercent: +j.taxPercent })));
}));

function validJob(body, res) {
  const name = String(body.name || '').trim();
  const payType = body.payType === 'daily' ? 'daily' : 'hourly';
  const rate = Number(body.rate ?? 0);
  const tax = Number(body.taxPercent ?? 0);
  if (!name) { fail(res, 400, 'Nomini kiriting', 'NAME_REQUIRED'); return null; }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1e9) { fail(res, 400, "Stavka noto'g'ri", 'BAD_RATE'); return null; }
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) { fail(res, 400, 'Soliq 0-100 orasida', 'BAD_TAX'); return null; }
  return { name, payType, rate, tax };
}

app.post('/api/jobs', requireUser, wrap(async (req, res) => {
  const v = validJob(req.body || {}, res);
  if (!v) return;
  const r = await pool.query(
    `INSERT INTO jobs (user_id, name, pay_type, rate, tax_percent) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [req.user.id, v.name, v.payType, v.rate, v.tax]);
  res.json({ ok: true, id: r.rows[0].id });
}));

app.put('/api/jobs/:id', requireUser, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const own = (await pool.query(`SELECT id FROM jobs WHERE id = $1 AND user_id = $2`, [id, req.user.id])).rows[0];
  if (!own) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  const v = validJob(req.body || {}, res);
  if (!v) return;
  await pool.query(
    `UPDATE jobs SET name = $1, pay_type = $2, rate = $3, tax_percent = $4 WHERE id = $5`,
    [v.name, v.payType, v.rate, v.tax, id]);
  res.json({ ok: true });
}));

app.delete('/api/jobs/:id', requireUser, wrap(async (req, res) => {
  await pool.query(`DELETE FROM jobs WHERE id = $1 AND user_id = $2 AND org_id IS NULL`,
    [parseInt(req.params.id, 10), req.user.id]);
  res.json({ ok: true });
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
    `SELECT e.id, e.work_date::text AS date, e.check_in, e.check_out, e.org_id, e.job_id,
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
    d.sessions.push({ id: e.id, jobId: e.job_id, orgId: e.org_id, in: localTime(tz, e.check_in), out: e.check_out ? localTime(tz, e.check_out) : null, minutes: e.minutes });
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

// ---------- Shaxsiy yozuvlarni tahrirlash (faqat org'siz yozuvlar) ----------
async function validPersonalJob(userId, jobId) {
  if (!jobId) return null;
  const j = (await pool.query(
    `SELECT id FROM jobs WHERE id = $1 AND user_id = $2 AND org_id IS NULL`,
    [parseInt(jobId, 10), userId])).rows[0];
  return j ? j.id : undefined; // undefined = xato
}

app.post('/api/my/entries', requireUser, wrap(async (req, res) => {
  const { date, in: inTime, out: outTime, jobId } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return fail(res, 400, "Sana noto'g'ri", 'BAD_DATE');
  if (!TIME_RE.test(String(inTime || ''))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  if (outTime && !TIME_RE.test(String(outTime))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  const jid = await validPersonalJob(req.user.id, jobId);
  if (jid === undefined) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  try {
    await pool.query(
      `INSERT INTO entries (user_id, job_id, work_date, check_in, check_out)
       VALUES ($1, $2, $3::date,
               ($3 || ' ' || $4)::timestamp AT TIME ZONE $6,
               CASE WHEN $5::text IS NULL THEN NULL
                    ELSE ($7 || ' ' || $5)::timestamp AT TIME ZONE $6 END)`,
      [req.user.id, jid, date, inTime, outTime || null, req.user.timezone, outDateFor(date, inTime, outTime)]);
  } catch (e) {
    if (e.constraint === 'out_after_in') return fail(res, 400, "Ketish kelishdan keyin bo'lsin", 'OUT_BEFORE_IN');
    throw e;
  }
  res.json({ ok: true });
}));

app.put('/api/my/entries/:id', requireUser, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const e = (await pool.query(
    `SELECT id, work_date::text AS date FROM entries
     WHERE id = $1 AND user_id = $2 AND org_id IS NULL`, [id, req.user.id])).rows[0];
  if (!e) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  const { in: inTime, out: outTime, jobId } = req.body || {};
  if (!TIME_RE.test(String(inTime || ''))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  if (outTime && !TIME_RE.test(String(outTime))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  const jid = await validPersonalJob(req.user.id, jobId);
  if (jid === undefined) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  try {
    await pool.query(
      `UPDATE entries SET job_id = $6,
         check_in = ($2 || ' ' || $3)::timestamp AT TIME ZONE $5,
         check_out = CASE WHEN $4::text IS NULL THEN NULL
                          ELSE ($7 || ' ' || $4)::timestamp AT TIME ZONE $5 END
       WHERE id = $1`,
      [id, e.date, inTime, outTime || null, req.user.timezone, jid, outDateFor(e.date, inTime, outTime)]);
  } catch (err) {
    if (err.constraint === 'out_after_in') return fail(res, 400, "Ketish kelishdan keyin bo'lsin", 'OUT_BEFORE_IN');
    throw err;
  }
  res.json({ ok: true });
}));

// Ish joyisiz (eski) shaxsiy yozuvlarni tanlangan ish joyiga o'tkazish
app.post('/api/my/entries/assign', requireUser, wrap(async (req, res) => {
  const jid = await validPersonalJob(req.user.id, (req.body || {}).jobId);
  if (!jid) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  const r = await pool.query(
    `UPDATE entries SET job_id = $1 WHERE user_id = $2 AND org_id IS NULL AND job_id IS NULL`,
    [jid, req.user.id]);
  res.json({ ok: true, moved: r.rowCount });
}));

app.delete('/api/my/entries/:id', requireUser, wrap(async (req, res) => {
  await pool.query(`DELETE FROM entries WHERE id = $1 AND user_id = $2 AND org_id IS NULL`,
    [parseInt(req.params.id, 10), req.user.id]);
  res.json({ ok: true });
}));

// ---------- ID orqali taklif ----------
// Oshxona ishchining ID raqami (yoki emaili) bilan taklif yuboradi,
// ishchi qabul qilsa jamoaga avtomatik qo'shiladi.
app.post('/api/org/invites', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const q = String((req.body || {}).query || '').trim();
  if (!q) return fail(res, 400, 'ID yoki email kiriting', 'NAME_REQUIRED');
  const target = q.includes('@')
    ? (await pool.query(`SELECT id, type FROM users WHERE email = $1`, [q.toLowerCase()])).rows[0]
    : (await pool.query(`SELECT id, type FROM users WHERE id = $1`, [parseInt(q.replace('#', ''), 10) || 0])).rows[0];
  if (!target) return fail(res, 404, 'Foydalanuvchi topilmadi', 'USER_NOT_FOUND');
  if (target.type === 'business') return fail(res, 400, "Biznes akkaunt jamoaga qo'shila olmaydi", 'BUSINESS_CANT_JOIN');
  const member = (await pool.query(
    `SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2`, [target.id, org.id])).rows[0];
  if (member) return fail(res, 400, "Bu ishchi allaqachon jamoada", 'ALREADY_MEMBER');
  await pool.query(
    `INSERT INTO org_invites (org_id, user_id, status) VALUES ($1, $2, 'pending')
     ON CONFLICT (org_id, user_id) DO UPDATE SET status = 'pending', created_at = now()`,
    [org.id, target.id]);
  res.json({ ok: true });
}));

app.delete('/api/org/invites/:id', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  await pool.query(`DELETE FROM org_invites WHERE id = $1 AND org_id = $2`,
    [parseInt(req.params.id, 10), org.id]);
  res.json({ ok: true });
}));

// Ishchi taklifni qabul qiladi / rad etadi
app.post('/api/invites/:id/accept', requireUser, wrap(async (req, res) => {
  const inv = (await pool.query(
    `UPDATE org_invites SET status = 'accepted' WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING org_id`, [parseInt(req.params.id, 10), req.user.id])).rows[0];
  if (!inv) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  const org = (await pool.query(`SELECT id, name FROM orgs WHERE id = $1`, [inv.org_id])).rows[0];
  await pool.query(
    `INSERT INTO memberships (user_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.user.id, org.id]);
  await pool.query(
    `INSERT INTO jobs (user_id, org_id, name)
     SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE user_id = $1 AND org_id = $2)`,
    [req.user.id, org.id, org.name]);
  res.json({ ok: true, orgName: org.name });
}));

app.post('/api/invites/:id/decline', requireUser, wrap(async (req, res) => {
  await pool.query(
    `UPDATE org_invites SET status = 'declined' WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [parseInt(req.params.id, 10), req.user.id]);
  res.json({ ok: true });
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
    `SELECT id, name, qr_token AS token, lat, lng, radius FROM branches WHERE org_id = $1 ORDER BY id`, [org.id])).rows;
  for (const b of branches) {
    b.dataUrl = await QRCode.toDataURL(b.token, { width: 512, margin: 2 });
  }
  const members = (await pool.query(
    `SELECT u.id, u.name, u.email, m.joined_at AS "joinedAt",
            m.hourly_rate::float AS "hourlyRate", m.tax_percent::float AS "taxPercent"
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 ORDER BY u.name`, [org.id])).rows;
  const pendingInvites = (await pool.query(
    `SELECT i.id, u.name, u.email FROM org_invites i JOIN users u ON u.id = i.user_id
     WHERE i.org_id = $1 AND i.status = 'pending' ORDER BY i.created_at DESC`, [org.id])).rows;
  res.json({
    id: org.id, name: org.name,
    inviteToken: org.invite_token,
    checkMode: org.check_mode,
    branches, members, pendingInvites,
  });
}));

app.put('/api/org', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const { name, checkMode } = req.body || {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return fail(res, 400, 'Nomini kiriting', 'NAME_REQUIRED');
    await pool.query(`UPDATE orgs SET name = $1 WHERE id = $2`, [n, org.id]);
  }
  if (checkMode !== undefined) {
    const m = checkMode === 'button' ? 'button' : 'qr';
    await pool.query(`UPDATE orgs SET check_mode = $1 WHERE id = $2`, [m, org.id]);
  }
  res.json({ ok: true });
}));

// A'zoning jamoadagi soatlik stavkasi (maosh ko'rsatish uchun)
app.put('/api/org/members/:userId', requireUser, requireBusiness, wrap(async (req, res) => {
  const rate = Number((req.body || {}).hourlyRate ?? 0);
  const tax = Number((req.body || {}).taxPercent ?? 0);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1e9) return fail(res, 400, "Stavka noto'g'ri", 'BAD_RATE');
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) return fail(res, 400, 'Soliq 0-100 orasida', 'BAD_TAX');
  const org = await orgOf(req.user.id);
  const r = await pool.query(
    `UPDATE memberships SET hourly_rate = $1, tax_percent = $2 WHERE org_id = $3 AND user_id = $4 RETURNING user_id`,
    [rate, tax, org.id, parseInt(req.params.userId, 10)]);
  if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  res.json({ ok: true });
}));

// Filial joylashuvini saqlash/o'chirish (geofence uchun)
app.put('/api/org/branches/:id/location', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const { lat, lng, radius } = req.body || {};
  if (lat === null || lng === null) {
    const r = await pool.query(
      `UPDATE branches SET lat = NULL, lng = NULL WHERE id = $1 AND org_id = $2 RETURNING id`,
      [parseInt(req.params.id, 10), org.id]);
    if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
    return res.json({ ok: true });
  }
  const la = Number(lat), ln = Number(lng), rad = Math.min(2000, Math.max(20, parseInt(radius, 10) || 50));
  if (!Number.isFinite(la) || la < -90 || la > 90 || !Number.isFinite(ln) || ln < -180 || ln > 180) {
    return fail(res, 400, "Joylashuv noto'g'ri", 'BAD_LOCATION');
  }
  const r = await pool.query(
    `UPDATE branches SET lat = $1, lng = $2, radius = $3 WHERE id = $4 AND org_id = $5 RETURNING id`,
    [la, ln, rad, parseInt(req.params.id, 10), org.id]);
  if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
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
    `SELECT u.id, u.name, m.hourly_rate::float AS rate, m.tax_percent::float AS tax
     FROM memberships m JOIN users u ON u.id = m.user_id
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
      const totalMinutes = Object.values(days).reduce((a, d) => a + d.minutes, 0);
      return { id: m.id, name: m.name, days, totalMinutes,
               earned: m.rate > 0 ? Math.round(totalMinutes / 60 * m.rate * (1 - (m.tax || 0) / 100)) : null };
    }),
  });
}));

// Jamoaning bugungi jonli holati
app.get('/api/org/board', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const tz = req.user.timezone;
  const today = localDate(tz);
  const rows = (await pool.query(
    `SELECT u.id, u.name, m.hourly_rate::float AS rate, m.tax_percent::float AS tax,
            COALESCE(SUM(ROUND(EXTRACT(EPOCH FROM (COALESCE(e.check_out, now()) - e.check_in)) / 60)), 0)::int AS minutes,
            BOOL_OR(e.check_out IS NULL) AS open,
            MIN(e.check_in) AS first_in
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN entries e ON e.user_id = u.id AND e.org_id = $1 AND e.work_date = $2
     WHERE m.org_id = $1
     GROUP BY u.id, m.hourly_rate, m.tax_percent ORDER BY u.name`, [org.id, today])).rows;
  res.json({
    date: today, time: localTime(tz),
    workers: rows.map((r) => ({
      id: r.id, name: r.name, minutes: r.minutes,
      status: r.open ? 'in' : (r.minutes > 0 ? 'out' : 'none'),
      since: r.first_in ? localTime(tz, r.first_in) : null,
      earned: r.rate > 0 ? Math.round(r.minutes / 60 * r.rate * (1 - (r.tax || 0) / 100)) : null,
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
  await pool.query(
    `INSERT INTO jobs (user_id, org_id, name)
     SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE user_id = $1 AND org_id = $2)`,
    [req.user.id, org.id, org.name]);
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

app.get('/api/admin/prices', requirePlatformAdmin, wrap(async (req, res) => {
  res.json({
    worker: PRICE_OVERRIDES.worker ?? PRICES.worker,
    business: PRICE_OVERRIDES.business ?? PRICES.business,
  });
}));

app.put('/api/admin/prices', requirePlatformAdmin, wrap(async (req, res) => {
  const w = parseInt((req.body || {}).worker, 10);
  const b = parseInt((req.body || {}).business, 10);
  if (!Number.isFinite(w) || w < 0 || w > 1e7 || !Number.isFinite(b) || b < 0 || b > 1e7) {
    return fail(res, 400, "Narx noto'g'ri", 'BAD_AMOUNT');
  }
  await pool.query(`INSERT INTO settings (key, value) VALUES ('price_worker', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [String(w)]);
  await pool.query(`INSERT INTO settings (key, value) VALUES ('price_business', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [String(b)]);
  PRICE_OVERRIDES = { worker: w, business: b };
  res.json({ ok: true });
}));

// Foydalanuvchiga maxsus narx (null = umumiy narx)
app.put('/api/admin/users/:id/price', requirePlatformAdmin, wrap(async (req, res) => {
  const v = (req.body || {}).customPrice;
  const price = v === null || v === '' ? null : parseInt(v, 10);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1e7)) {
    return fail(res, 400, "Narx noto'g'ri", 'BAD_AMOUNT');
  }
  const r = await pool.query(`UPDATE users SET custom_price = $1 WHERE id = $2 RETURNING id`,
    [price, parseInt(req.params.id, 10)]);
  if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  res.json({ ok: true });
}));

app.get('/api/admin/payments', requirePlatformAdmin, wrap(async (req, res) => {
  const status = ['pending', 'approved', 'rejected', 'history'].includes(req.query.status) ? req.query.status : 'pending';
  const r = await pool.query(
    `SELECT p.id, p.amount, p.image, p.link, p.status, p.created_at AS "createdAt", p.decided_at AS "decidedAt",
            u.id AS "userId", u.email, u.name, u.type
     FROM payments p JOIN users u ON u.id = p.user_id
     WHERE ($1 = 'history' AND p.status <> 'pending') OR p.status = $1
     ORDER BY COALESCE(p.decided_at, p.created_at) DESC LIMIT 80`, [status]);
  res.json(r.rows);
}));

app.post('/api/admin/payments/:id/approve', requirePlatformAdmin, wrap(async (req, res) => {
  const p = (await pool.query(
    `UPDATE payments SET status = 'approved', decided_at = now(), image = NULL
     WHERE id = $1 AND status = 'pending' RETURNING user_id`, [parseInt(req.params.id, 10)])).rows[0];
  if (!p) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  await pool.query(
    `UPDATE users SET paid_until = GREATEST(paid_until, now()) + interval '30 days' WHERE id = $1`,
    [p.user_id]);
  res.json({ ok: true });
}));

app.post('/api/admin/payments/:id/reject', requirePlatformAdmin, wrap(async (req, res) => {
  await pool.query(
    `UPDATE payments SET status = 'rejected', decided_at = now(), image = NULL WHERE id = $1 AND status = 'pending'`,
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
    const pw = (await pool.query(`SELECT value FROM settings WHERE key = 'price_worker'`)).rows[0];
    const pb = (await pool.query(`SELECT value FROM settings WHERE key = 'price_business'`)).rows[0];
    if (pw) PRICE_OVERRIDES.worker = parseInt(pw.value, 10);
    if (pb) PRICE_OVERRIDES.business = parseInt(pb.value, 10);
    app.listen(PORT, () => console.log(`LaLaKu Vaqt ${PORT}-portda ishlamoqda`));
  })
  .catch((e) => {
    console.error('Bazani sozlashda xato:', e);
    process.exit(1);
  });
