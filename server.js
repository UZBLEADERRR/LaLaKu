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
const advisor = require('./advisor');

const PORT = process.env.PORT || 3000;
const DEFAULT_TZ = process.env.TIMEZONE || 'Asia/Seoul';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATABASE_URL = process.env.DATABASE_URL;
const PRICES = { worker: 990, business: 2900 }; // standart, admin o'zgartira oladi
let PRICE_OVERRIDES = {};
// Admin o'zgartira oladigan global sozlamalar (boot'da settings'dan yuklanadi)
const CONFIG = { trialDays: 15, bankName: '토스뱅크 (Toss Bank)', bankAccount: '1000-8922-1696', premiumEnabled: true };
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
    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      work_date DATE NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (org_id, user_id, work_date)
    );
    CREATE INDEX IF NOT EXISTS idx_schedules_org_date ON schedules(org_id, work_date);
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
    ALTER TABLE finance_items ADD COLUMN IF NOT EXISTS paid_amount NUMERIC NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS radius INTEGER NOT NULL DEFAULT 50;
    ALTER TABLE memberships ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC NOT NULL DEFAULT 0;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL;
    ALTER TABLE orgs ADD COLUMN IF NOT EXISTS allowed_ip TEXT;
    ALTER TABLE orgs ADD COLUMN IF NOT EXISTS auto_checkout BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE orgs ADD COLUMN IF NOT EXISTS share_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS has_password BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      target NUMERIC NOT NULL,
      saved NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS day_notes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note_date DATE NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (user_id, note_date)
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      product_id TEXT NOT NULL,
      purchase_token TEXT UNIQUE NOT NULL,
      months INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Mavjud jamoa a'zoliklari uchun bog'langan ish joyi yozuvlari
  await pool.query(`
    INSERT INTO jobs (user_id, org_id, name)
    SELECT m.user_id, m.org_id, o.name FROM memberships m
    JOIN orgs o ON o.id = m.org_id
    WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.user_id = m.user_id AND j.org_id = m.org_id)
  `);

  // Boshliq kiritgan jamoa yozuvlariga job_id bog'lash (ishchi daromadi hisoblanishi uchun)
  await pool.query(`
    UPDATE entries e SET job_id = j.id
    FROM jobs j
    WHERE e.org_id IS NOT NULL AND e.job_id IS NULL
      AND j.user_id = e.user_id AND j.org_id = e.org_id
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

// Obuna faolmi (premium o'chirilgan bo'lsa hamma bepul; aks holda sinov/to'lov muddati)
const isActive = (u) => !CONFIG.premiumEnabled || new Date(u.paid_until) > new Date();
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

// Valyuta kurslari (KRW asosida) — 12 soat keshlanadi
let RATES_CACHE = null;
const RATE_KEYS = ['KRW', 'USD', 'UZS', 'RUB', 'VND', 'MMK', 'INR', 'CNY', 'KZT', 'KGS'];
app.get('/api/rates', wrap(async (req, res) => {
  if (RATES_CACHE && Date.now() - RATES_CACHE.ts < 12 * 3600_000) return res.json(RATES_CACHE.data);
  // Bir nechta manba: biri ishlamasa keyingisi
  const sources = [
    'https://open.er-api.com/v6/latest/KRW',
    'https://api.exchangerate.fun/latest?base=KRW',
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (!j.rates || !Object.keys(j.rates).length) continue;
      const rates = {};
      for (const k of RATE_KEYS) if (j.rates[k]) rates[k] = j.rates[k];
      rates.KRW = 1;
      const data = { base: 'KRW', rates, updated: new Date().toISOString() };
      RATES_CACHE = { ts: Date.now(), data };
      return res.json(data);
    } catch (e) { /* keyingi manbaga o'tamiz */ }
  }
  res.json(RATES_CACHE ? RATES_CACHE.data : { base: 'KRW', rates: { KRW: 1 } });
}));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_RE = /^\+?[0-9][0-9 -]{6,18}$/;
const normPhone = (p) => String(p || '').replace(/[^0-9+]/g, '');

app.post('/api/register', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return fail(res, 429, "Urinishlar ko'p", 'RATE_LIMIT');
  const emailIn = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const name = String((req.body || {}).name || '').trim();
  const type = (req.body || {}).type === 'business' ? 'business' : 'worker';
  const businessName = String((req.body || {}).businessName || '').trim();
  const phone = normPhone((req.body || {}).phone);
  const birthdate = String((req.body || {}).birthdate || '').trim() || null;
  // Yangi soddalashtirilgan ro'yxat: ism + telefon + tug'ilgan kun yetarli; parol va email ixtiyoriy
  if (!name) return fail(res, 400, 'Ism kiriting', 'NAME_REQUIRED');
  if (!phone || !PHONE_RE.test(phone)) return fail(res, 400, "Telefon raqam noto'g'ri", 'BAD_PHONE');
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return fail(res, 400, "Tug'ilgan kunni kiriting", 'BAD_DATE');
  if (password && password.length < 6) return fail(res, 400, "Parol kamida 6 belgi", 'PW_SHORT6');
  if (emailIn && !EMAIL_RE.test(emailIn)) return fail(res, 400, "Email noto'g'ri", 'BAD_EMAIL');
  if (type === 'business' && !businessName) return fail(res, 400, 'Oshxona nomini kiriting', 'BIZ_NAME_REQUIRED');
  // Email ixtiyoriy — kiritilmasa telefon asosida ichki email yaratiladi (login telefon+tug'ilgan kun orqali)
  const email = emailIn || `${phone.replace(/\D/g, '')}@albafit.local`;
  const dupP = (await pool.query(`SELECT 1 FROM users WHERE phone = $1`, [phone])).rows[0];
  if (dupP) return fail(res, 400, "Bu telefon ro'yxatdan o'tgan", 'PHONE_TAKEN');
  const dup = (await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email])).rows[0];
  if (dup) return fail(res, 400, "Bu email ro'yxatdan o'tgan", 'EMAIL_TAKEN');

  const hash = await bcrypt.hash(password || birthdate, 10);
  const u = (await pool.query(
    `INSERT INTO users (email, password_hash, name, type, phone, birthdate, paid_until, has_password)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' days')::interval, $8) RETURNING *`,
    [email, hash, name, type, phone || null, birthdate, CONFIG.trialDays, !!password]
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

// Akkaunt bor-yo'qligini va parol talab qilinishini tekshirish (login oqimi uchun)
app.post('/api/auth/lookup', wrap(async (req, res) => {
  const phone = normPhone((req.body || {}).phone);
  if (!phone) return fail(res, 400, "Telefon raqam noto'g'ri", 'BAD_PHONE');
  const u = (await pool.query(`SELECT name, has_password FROM users WHERE phone = $1`, [phone])).rows[0];
  if (!u) return res.json({ exists: false });
  res.json({ exists: true, hasPassword: !!u.has_password, name: u.name });
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
    birthdate: u.birthdate ? new Date(u.birthdate).toISOString().slice(0, 10) : '',
    timezone: u.timezone,
    payType: u.pay_type, hourlyRate: +u.hourly_rate, dailyRate: +u.daily_rate, taxPercent: +u.tax_percent,
    active: isActive(u),
    paidUntil: u.paid_until,
    daysLeft: Math.max(0, Math.ceil((new Date(u.paid_until) - Date.now()) / 86400_000)),
    price: await priceFor(u),
    token: signToken({ t: 'user', id: u.id, exp: Date.now() + 60 * 86400_000 }),
    pendingPayment: !!pending,
    bankName: CONFIG.bankName, bankAccount: CONFIG.bankAccount,
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
  if ((req.body || {}).birthdate !== undefined) {
    const bd = String(req.body.birthdate || '').trim() || null;
    if (bd && !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return fail(res, 400, "Sana noto'g'ri", 'BAD_DATE');
    await pool.query(`UPDATE users SET birthdate = $1 WHERE id = $2`, [bd, req.user.id]);
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
  let orgName = null, orgCheckMode = null, autoCheckout = false, geofences = [];
  if (open?.org_id) {
    const o = (await pool.query(`SELECT name, check_mode, auto_checkout FROM orgs WHERE id = $1`, [open.org_id])).rows[0];
    orgName = o?.name || null;
    orgCheckMode = o?.check_mode || null;
    autoCheckout = !!o?.auto_checkout;
    // Avto-chiqish uchun filial joylashuvlari (mijoz masofani tekshiradi)
    if (autoCheckout) {
      geofences = (await pool.query(
        `SELECT lat, lng, radius FROM branches WHERE org_id = $1 AND lat IS NOT NULL AND lng IS NOT NULL`,
        [open.org_id])).rows;
    }
  }
  res.json({
    checkedIn: !!open,
    since: open ? localTime(tz, open.check_in) : null,
    sinceDate: open ? localDate(tz, open.check_in) : null,
    sinceIso: open ? open.check_in.toISOString() : null,
    orgName, orgId: open?.org_id || null, orgCheckMode,
    jobId: open?.job_id || null,
    autoCheckout, geofences,
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

// IP tasdiqlash: jamoa allowed_ip belgilagan bo'lsa, kelish shu tarmoqdan bo'lishi shart.
// Aniq IP emas, /24 tarmoq (dastlabki 3 oktet) bo'yicha solishtiramiz — bir joyning
// barcha qurilmalari (dinamik IP ham) o'tishi uchun.
function ipPrefix(ip) {
  const m = String(ip || '').match(/(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}/);
  return m ? m[1] : String(ip || '');
}
async function ipAllowed(orgId, req) {
  const o = (await pool.query(`SELECT allowed_ip FROM orgs WHERE id = $1`, [orgId])).rows[0];
  if (!o?.allowed_ip) return true;
  return ipPrefix(req.ip) === ipPrefix(o.allowed_ip);
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
  // IP tekshiruvi faqat kelishda (ochiq yozuv bo'lmasa)
  if (!(await openEntry(req.user.id)) && !(await ipAllowed(b.org_id, req))) {
    return fail(res, 403, "Siz ish joyi tarmog'ida (Wi-Fi) emassiz", 'IP_MISMATCH');
  }
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

  // Yopish (ketish) doim ruxsat etiladi — ish joyidan uzoqda ham chiqib ketish mumkin.
  // Aks holda ishchi joyni tark etsa, yozuv ochiq qolib "ishda" bo'lib turaverardi.
  const open = await openEntry(req.user.id);
  if (open) {
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
    if (!(await ipAllowed(oid, req))) return fail(res, 403, "Siz ish joyi tarmog'ida (Wi-Fi) emassiz", 'IP_MISMATCH');
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
       AND NOT (e.org_id IS NOT NULL AND e.job_id IS NULL)
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

// Yillik jamlanma: har oy + ish joyi bo'yicha daqiqalar va kunlar
app.get('/api/my/year', requireUser, wrap(async (req, res) => {
  const year = parseInt(req.query.year, 10);
  if (!year || year < 2000 || year > 2100) return fail(res, 400, "Yil noto'g'ri", 'BAD_MONTH');
  const r = await pool.query(
    `SELECT EXTRACT(MONTH FROM work_date)::int AS month, COALESCE(job_id, 0) AS "jobId",
            SUM(ROUND(EXTRACT(EPOCH FROM (COALESCE(check_out, now()) - check_in)) / 60))::int AS minutes,
            COUNT(DISTINCT work_date)::int AS days
     FROM entries
     WHERE user_id = $1 AND work_date >= ($2 || '-01-01')::date AND work_date < (($2::int + 1) || '-01-01')::date
       AND NOT (org_id IS NOT NULL AND job_id IS NULL)
     GROUP BY 1, 2 ORDER BY 1`,
    [req.user.id, String(year)]);
  res.json({ year, rows: r.rows });
}));

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

// Taklif qilishda username/email bo'yicha takliflar (autocomplete)
app.get('/api/org/search-users', requireUser, requireBusiness, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const org = await orgOf(req.user.id);
  const rows = (await pool.query(
    `SELECT id, name, email FROM users
     WHERE type = 'worker' AND (email ILIKE $1 OR name ILIKE $1)
       AND id NOT IN (SELECT user_id FROM memberships WHERE org_id = $2)
     ORDER BY name LIMIT 8`, [`%${q}%`, org.id])).rows;
  res.json(rows);
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
    `SELECT id, kind, title, amount::float, paid_amount::float AS "paidAmount",
            due_day AS "dueDay", due_date::text AS "dueDate", active
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

// Qarz/chiqimni to'lash: qisman (amount) yoki to'liq (full=true)
app.post('/api/finance/:id/pay', requireUser, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = (await pool.query(
    `SELECT amount::float, paid_amount::float AS paid FROM finance_items WHERE id = $1 AND user_id = $2`,
    [id, req.user.id])).rows[0];
  if (!item) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  const full = (req.body || {}).full === true;
  if (full) {
    await pool.query(`UPDATE finance_items SET paid_amount = amount, active = false WHERE id = $1`, [id]);
    return res.json({ ok: true, remaining: 0 });
  }
  const pay = Number((req.body || {}).amount);
  if (!Number.isFinite(pay) || pay <= 0) return fail(res, 400, "Summa noto'g'ri", 'BAD_AMOUNT');
  const newPaid = Math.min(item.amount, item.paid + pay);
  const done = newPaid >= item.amount;
  await pool.query(`UPDATE finance_items SET paid_amount = $1, active = $2 WHERE id = $3`,
    [newPaid, !done, id]);
  res.json({ ok: true, remaining: Math.max(0, item.amount - newPaid) });
}));

app.delete('/api/finance/:id', requireUser, wrap(async (req, res) => {
  await pool.query(`DELETE FROM finance_items WHERE id = $1 AND user_id = $2`,
    [parseInt(req.params.id, 10), req.user.id]);
  res.json({ ok: true });
}));

// ================= MAQSADLAR (goals) =================
app.get('/api/goals', requireUser, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, title, target::float, saved::float FROM goals WHERE user_id = $1 ORDER BY id`, [req.user.id]);
  res.json(r.rows);
}));

app.post('/api/goals', requireUser, wrap(async (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 80);
  const target = Number(req.body?.target);
  if (!title || !(target > 0)) return fail(res, 400, "Ma'lumot noto'g'ri", 'BAD_INPUT');
  const r = await pool.query(
    `INSERT INTO goals (user_id, title, target) VALUES ($1, $2, $3) RETURNING id`,
    [req.user.id, title, target]);
  res.json({ ok: true, id: r.rows[0].id });
}));

app.put('/api/goals/:id', requireUser, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const own = (await pool.query(`SELECT saved::float FROM goals WHERE id = $1 AND user_id = $2`, [id, req.user.id])).rows[0];
  if (!own) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  if (req.body?.add !== undefined) {
    const add = Number(req.body.add);
    if (!isFinite(add)) return fail(res, 400, "Ma'lumot noto'g'ri", 'BAD_INPUT');
    await pool.query(`UPDATE goals SET saved = GREATEST(saved + $1, 0) WHERE id = $2`, [add, id]);
    return res.json({ ok: true });
  }
  const title = String(req.body?.title || '').trim().slice(0, 80);
  const target = Number(req.body?.target);
  if (!title || !(target > 0)) return fail(res, 400, "Ma'lumot noto'g'ri", 'BAD_INPUT');
  await pool.query(`UPDATE goals SET title = $1, target = $2 WHERE id = $3`, [title, target, id]);
  res.json({ ok: true });
}));

app.delete('/api/goals/:id', requireUser, wrap(async (req, res) => {
  await pool.query(`DELETE FROM goals WHERE id = $1 AND user_id = $2`, [parseInt(req.params.id, 10), req.user.id]);
  res.json({ ok: true });
}));

// ================= KUN IZOHLARI (notes) =================
app.get('/api/my/notes', requireUser, wrap(async (req, res) => {
  const year = parseInt(req.query.year, 10), month = parseInt(req.query.month, 10);
  if (!year || !month) return fail(res, 400, "Sana noto'g'ri", 'BAD_DATE');
  const r = await pool.query(
    `SELECT to_char(note_date, 'YYYY-MM-DD') AS date, text FROM day_notes
     WHERE user_id = $1 AND note_date >= make_date($2, $3, 1)
       AND note_date < make_date($2, $3, 1) + INTERVAL '1 month'`,
    [req.user.id, year, month]);
  res.json(r.rows);
}));

app.put('/api/my/notes/:date', requireUser, wrap(async (req, res) => {
  const date = String(req.params.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, "Sana noto'g'ri", 'BAD_DATE');
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!text) {
    await pool.query(`DELETE FROM day_notes WHERE user_id = $1 AND note_date = $2`, [req.user.id, date]);
    return res.json({ ok: true, deleted: true });
  }
  await pool.query(
    `INSERT INTO day_notes (user_id, note_date, text) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, note_date) DO UPDATE SET text = EXCLUDED.text`,
    [req.user.id, date, text]);
  res.json({ ok: true });
}));

// ================= AI MOLIYAVIY YORDAMCHI =================
// Bir oyning sof daromadi + overtime (har entry uchun stavka aniqlanadi)
async function monthEarnings(userId, year, month) {
  const { start, next } = monthBounds(year, month);
  const r = await pool.query(
    `SELECT e.work_date::text AS date,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(e.check_out, now()) - e.check_in)) / 60)::int AS minutes,
            COALESCE(NULLIF(m.hourly_rate, 0), j.rate, 0)::float AS rate,
            COALESCE(NULLIF(m.tax_percent, 0), j.tax_percent, 0)::float AS tax,
            COALESCE(j.pay_type, 'hourly') AS pay_type,
            COALESCE(j.id, 0) AS job_id
     FROM entries e
     LEFT JOIN jobs j ON j.id = e.job_id
     LEFT JOIN memberships m ON m.org_id = e.org_id AND m.user_id = e.user_id
     WHERE e.user_id = $1 AND e.work_date >= $2 AND e.work_date < $3
       AND NOT (e.org_id IS NOT NULL AND e.job_id IS NULL)`,
    [userId, start, next]);
  let net = 0, minutes = 0;
  const byDay = {};
  const dailySeen = new Set();
  for (const row of r.rows) {
    minutes += row.minutes;
    byDay[row.date] = (byDay[row.date] || 0) + row.minutes;
    const factor = 1 - (row.tax || 0) / 100;
    if (row.pay_type === 'daily') {
      const key = `${row.date}_${row.job_id}`;
      if (!dailySeen.has(key)) { dailySeen.add(key); net += row.rate * factor; }
    } else {
      net += (row.minutes / 60) * row.rate * factor;
    }
  }
  let overtimeMin = 0;
  for (const mins of Object.values(byDay)) overtimeMin += Math.max(0, mins - 480);
  return { net: Math.round(net), minutes, days: Object.keys(byDay).length, overtimeMin };
}

async function financialContext(user, year, month) {
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const [thisMonth, lastMonth, finRes, goalRes] = await Promise.all([
    monthEarnings(user.id, year, month),
    monthEarnings(user.id, prev.y, prev.m),
    pool.query(`SELECT kind, title, amount::float, paid_amount::float AS paid, due_day, due_date::text AS due_date, active
                FROM finance_items WHERE user_id = $1`, [user.id]),
    pool.query(`SELECT id, title, target::float, saved::float FROM goals WHERE user_id = $1 ORDER BY id`, [user.id]),
  ]);
  const active = finRes.rows.filter((i) => i.active);
  const rem = (i) => Math.max(0, i.amount - (i.paid || 0));
  const income = active.filter((i) => i.kind === 'income').reduce((a, i) => a + i.amount, 0);
  const expenses = active.filter((i) => i.kind === 'expense').reduce((a, i) => a + rem(i), 0);
  const debts = active.filter((i) => i.kind === 'debt').reduce((a, i) => a + rem(i), 0);
  // Eng yaqin qarz/chiqim muddati (kun)
  const today = new Date();
  const daysUntilDay = (dd) => {
    if (!dd) return null;
    let d = new Date(today.getFullYear(), today.getMonth(), dd);
    if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) d = new Date(today.getFullYear(), today.getMonth() + 1, dd);
    return Math.round((d - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  };
  let nextDebt = null;
  for (const i of active.filter((x) => x.kind !== 'income')) {
    let days = null;
    if (i.due_date) days = Math.round((new Date(i.due_date + 'T00:00:00') - today) / 86400000);
    else if (i.due_day) days = daysUntilDay(i.due_day);
    if (days !== null && days >= 0 && days <= 7 && (!nextDebt || days < nextDebt.days)) nextDebt = { title: i.title, days };
  }
  const totalIncome = thisMonth.net + income;
  return {
    name: user.name,
    thisMonth,
    lastMonth: { net: lastMonth.net, minutes: lastMonth.minutes, days: lastMonth.days },
    finance: { income, expenses, debts, nextDebt },
    goals: goalRes.rows,
    stats: {
      net: thisMonth.net,
      hours: Math.round(thisMonth.minutes / 60 * 10) / 10,
      days: thisMonth.days,
      expenseRatio: totalIncome > 0 ? Math.round((expenses / totalIncome) * 100) : 0,
      leftover: Math.round(totalIncome - expenses - debts),
    },
  };
}

app.get('/api/ai/advice', requireUser, wrap(async (req, res) => {
  const now = new Date();
  const lang = ['uz', 'en', 'ko'].includes(req.query.lang) ? req.query.lang : 'uz';
  const ctx = await financialContext(req.user, now.getFullYear(), now.getMonth() + 1);
  const result = advisor.generateAdvice(ctx, lang);
  // Ixtiyoriy: Claude API bo'lsa tabiiy xulosa bilan almashtiramiz
  const llm = await advisor.llmSummary(ctx, lang);
  if (llm) { result.summary = llm; result.aiPowered = true; } else { result.aiPowered = false; }
  res.json(result);
}));

// AI chat — savol-javob (moliyaviy yordamchi)
app.post('/api/ai/chat', requireUser, wrap(async (req, res) => {
  const now = new Date();
  const lang = ['uz', 'en', 'ko'].includes(req.body?.lang) ? req.body.lang : 'uz';
  const message = String(req.body?.message || '').slice(0, 1000);
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
  if (!message.trim()) return fail(res, 400, "Bo'sh xabar", 'EMPTY');
  const ctx = await financialContext(req.user, now.getFullYear(), now.getMonth() + 1);
  let reply = await advisor.llmChat(ctx, history, message, lang);
  let aiPowered = true;
  if (!reply) { reply = advisor.chatReply(ctx, message, lang); aiPowered = false; }
  res.json({ reply, aiPowered });
}));

// ================= OBUNA (Google Play / App Store) =================
// Mahsulot -> obuna oylari
const SUB_MONTHS = { albafit_premium_monthly: 1, albafit_premium_yearly: 12 };
// Ilova xarididan keyin premiumni faollashtirish.
// ESLATMA: ishlab chiqarishda purchaseToken'ni Google Play Developer API orqali
// server tomonda tekshirish kerak (GOOGLE_PLAY_SERVICE_ACCOUNT). Hozircha token
// yagona (UNIQUE) bo'lgani uchun takroriy hisoblanmaydi.
app.post('/api/subscription/verify', requireUser, wrap(async (req, res) => {
  const { platform, productId, purchaseToken } = req.body || {};
  if (!platform || !productId || !purchaseToken) return fail(res, 400, "Ma'lumot to'liq emas", 'BAD_INPUT');
  const months = SUB_MONTHS[productId];
  if (!months) return fail(res, 400, "Noma'lum mahsulot", 'BAD_PRODUCT');
  // Idempotent: shu token allaqachon qayd etilgan bo'lsa qayta hisoblamaymiz
  const existing = (await pool.query(`SELECT id FROM subscriptions WHERE purchase_token = $1`, [String(purchaseToken)])).rows[0];
  if (!existing) {
    await pool.query(
      `INSERT INTO subscriptions (user_id, platform, product_id, purchase_token, months) VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, String(platform), String(productId), String(purchaseToken), months]);
    await pool.query(
      `UPDATE users SET paid_until = GREATEST(paid_until, now()) + ($1 || ' months')::interval WHERE id = $2`,
      [months, req.user.id]);
  }
  const u = (await pool.query(`SELECT paid_until FROM users WHERE id = $1`, [req.user.id])).rows[0];
  const daysLeft = Math.max(0, Math.ceil((new Date(u.paid_until) - new Date()) / 86400000));
  res.json({ ok: true, active: true, paidUntil: u.paid_until, daysLeft });
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
    allowedIp: org.allowed_ip || null,
    autoCheckout: !!org.auto_checkout,
    shareToken: org.share_token || null,
    branches, members, pendingInvites,
  });
}));

// Jadval havolasi: ochib qo'yish/yangilash (eski havola ishlamay qoladi) va o'chirish
app.post('/api/org/share/rotate', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const token = newToken('T');
  await pool.query(`UPDATE orgs SET share_token = $1 WHERE id = $2`, [token, org.id]);
  res.json({ shareToken: token });
}));

app.delete('/api/org/share', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  await pool.query(`UPDATE orgs SET share_token = NULL WHERE id = $1`, [org.id]);
  res.json({ ok: true });
}));

app.put('/api/org', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  const body = req.body || {};
  const { name, checkMode } = body;
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return fail(res, 400, 'Nomini kiriting', 'NAME_REQUIRED');
    await pool.query(`UPDATE orgs SET name = $1 WHERE id = $2`, [n, org.id]);
  }
  if (checkMode !== undefined) {
    const m = checkMode === 'button' ? 'button' : 'qr';
    await pool.query(`UPDATE orgs SET check_mode = $1 WHERE id = $2`, [m, org.id]);
  }
  // IP tasdiqlash: 'current' — hozirgi IP saqlanadi, null — o'chiriladi
  if (body.allowedIp !== undefined) {
    const ip = body.allowedIp === 'current' ? String(req.ip || '').slice(0, 64) : (body.allowedIp ? String(body.allowedIp).slice(0, 64) : null);
    await pool.query(`UPDATE orgs SET allowed_ip = $1 WHERE id = $2`, [ip, org.id]);
  }
  if (body.autoCheckout !== undefined) {
    await pool.query(`UPDATE orgs SET auto_checkout = $1 WHERE id = $2`, [!!body.autoCheckout, org.id]);
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
  const uid = parseInt(req.params.userId, 10);
  const r = await pool.query(
    `UPDATE memberships SET hourly_rate = $1, tax_percent = $2 WHERE org_id = $3 AND user_id = $4 RETURNING user_id`,
    [rate, tax, org.id, uid]);
  if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  // Boshliq belgilagan stavka ishchining shu jamoaga bog'langan ish joyiga ham yoziladi
  await pool.query(
    `UPDATE jobs SET rate = $1, tax_percent = $2, pay_type = 'hourly' WHERE user_id = $3 AND org_id = $4`,
    [rate, tax, uid, org.id]);
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
  const uid = parseInt(req.params.userId, 10);
  await pool.query(`DELETE FROM memberships WHERE org_id = $1 AND user_id = $2`, [org.id, uid]);
  // Ishchining shu jamoaga bog'langan ish joyi yozuvini ham olib tashlaymiz (tarix entries'da qoladi)
  await pool.query(`DELETE FROM jobs WHERE org_id = $1 AND user_id = $2`, [org.id, uid]);
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
  const tz = req.user.timezone;
  const { start, next } = monthBounds(year, month);
  const members = (await pool.query(
    `SELECT u.id, u.name, u.email, m.hourly_rate::float AS rate, m.tax_percent::float AS tax
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 ORDER BY u.name`, [org.id])).rows;
  const rows = (await pool.query(
    `SELECT id, user_id, work_date::text AS date, check_in, check_out,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(check_out, now()) - check_in)) / 60)::int AS minutes
     FROM entries WHERE org_id = $1 AND work_date >= $2 AND work_date < $3
     ORDER BY check_in`, [org.id, start, next])).rows;
  const byUser = {};
  for (const e of rows) {
    const days = (byUser[e.user_id] ||= {});
    const d = (days[e.date] ||= { sessions: [], minutes: 0, open: false });
    d.sessions.push({ id: e.id, in: localTime(tz, e.check_in), out: e.check_out ? localTime(tz, e.check_out) : null, minutes: e.minutes });
    d.minutes += e.minutes;
    if (!e.check_out) d.open = true;
  }
  res.json({
    year, month,
    workers: members.map((m) => {
      const days = byUser[m.id] || {};
      const totalMinutes = Object.values(days).reduce((a, d) => a + d.minutes, 0);
      return { id: m.id, name: m.name, email: m.email, rate: m.rate, tax: m.tax, days, totalMinutes,
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
            BOOL_OR(e.id IS NOT NULL AND e.check_out IS NULL) AS open,
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
  // Ishchining shu jamoaga bog'langan ish joyi — daromad hisoblanishi uchun job_id bog'lanadi
  const jid = await orgJobId(parseInt(userId, 10), org.id);
  try {
    await pool.query(
      `INSERT INTO entries (user_id, org_id, job_id, work_date, check_in, check_out)
       VALUES ($1, $2, $8, $3::date,
               ($3 || ' ' || $4)::timestamp AT TIME ZONE $6,
               CASE WHEN $5::text IS NULL THEN NULL
                    ELSE ($7 || ' ' || $5)::timestamp AT TIME ZONE $6 END)`,
      [parseInt(userId, 10), org.id, date, inTime, outTime || null, req.user.timezone, outDateFor(date, inTime, outTime), jid]);
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

// ================= REJA (SMENA) =================
// Oshxona ishchilarga oldindan ish rejasini (smena) tuzadi
app.get('/api/org/schedule', requireUser, requireBusiness, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  const org = await orgOf(req.user.id);
  const { start, next } = monthBounds(year, month);
  const rows = (await pool.query(
    `SELECT id, user_id AS "userId", work_date::text AS date, start_time AS "start", end_time AS "end", note
     FROM schedules WHERE org_id = $1 AND work_date >= $2 AND work_date < $3
     ORDER BY work_date`, [org.id, start, next])).rows;
  res.json({ year, month, schedules: rows });
}));

app.post('/api/org/schedule', requireUser, requireBusiness, requireActive, wrap(async (req, res) => {
  const { userId, date, start, end, note } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return fail(res, 400, "Sana noto'g'ri", 'BAD_DATE');
  if (!TIME_RE.test(String(start || '')) || !TIME_RE.test(String(end || ''))) return fail(res, 400, "Vaqt noto'g'ri", 'BAD_TIME');
  const org = await orgOf(req.user.id);
  const member = (await pool.query(
    `SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2`, [org.id, parseInt(userId, 10)])).rows[0];
  if (!member) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  await pool.query(
    `INSERT INTO schedules (org_id, user_id, work_date, start_time, end_time, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (org_id, user_id, work_date)
     DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, note = EXCLUDED.note`,
    [org.id, parseInt(userId, 10), date, start, end, note ? String(note).slice(0, 200) : null]);
  res.json({ ok: true });
}));

app.delete('/api/org/schedule/:id', requireUser, requireBusiness, wrap(async (req, res) => {
  const org = await orgOf(req.user.id);
  await pool.query(`DELETE FROM schedules WHERE id = $1 AND org_id = $2`, [parseInt(req.params.id, 10), org.id]);
  res.json({ ok: true });
}));

// Ishchi o'z rejasini ko'radi (barcha jamoalar bo'yicha)
app.get('/api/my/schedule', requireUser, wrap(async (req, res) => {
  const { year, month } = parseYearMonth(req, res);
  if (!year) return;
  const { start, next } = monthBounds(year, month);
  const rows = (await pool.query(
    `SELECT s.id, s.work_date::text AS date, s.start_time AS "start", s.end_time AS "end", s.note, o.name AS "orgName"
     FROM schedules s JOIN orgs o ON o.id = s.org_id
     WHERE s.user_id = $1 AND s.work_date >= $2 AND s.work_date < $3
     ORDER BY s.work_date`, [req.user.id, start, next])).rows;
  res.json({ year, month, schedules: rows });
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
  const orgId = parseInt(req.params.orgId, 10);
  await pool.query(`DELETE FROM memberships WHERE user_id = $1 AND org_id = $2`, [req.user.id, orgId]);
  // Jamoadan chiqilganda shu jamoaga bog'langan ish joyi ham o'chadi (kalendar/profildan yo'qoladi)
  await pool.query(`DELETE FROM jobs WHERE user_id = $1 AND org_id = $2`, [req.user.id, orgId]);
  res.json({ ok: true });
}));

// ================= PLATFORMA ADMINI =================
app.post('/api/admin/login', wrap(async (req, res) => {
  if (rateLimited(req.ip)) return fail(res, 429, "Urinishlar ko'p", 'RATE_LIMIT');
  if (String((req.body || {}).password || '') !== ADMIN_PASSWORD) {
    return fail(res, 401, "Parol noto'g'ri", 'BAD_PASSWORD');
  }
  setSessionCookie(res, { t: 'padmin' }, 7);
  // Ko'p-akkaunt tizimi uchun token — admin ham akkauntlar safida bo'ladi
  res.json({
    ok: true,
    defaultPassword: ADMIN_PASSWORD === 'admin123',
    token: signToken({ t: 'padmin', exp: Date.now() + 7 * 86400_000 }),
  });
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
    `SELECT id, email, name, phone, to_char(birthdate, 'YYYY-MM-DD') AS birthdate, type,
            paid_until AS "paidUntil", created_at AS "createdAt", (paid_until > now()) AS active
     FROM users WHERE email ILIKE $1 OR name ILIKE $1 OR phone ILIKE $1
     ORDER BY created_at DESC LIMIT 100`, [q]);
  res.json(r.rows);
}));

// Yaratuvchi (admin) uchun bitta foydalanuvchining to'liq ma'lumoti
app.get('/api/admin/users/:id/detail', requirePlatformAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const u = (await pool.query(
    `SELECT id, email, name, phone, to_char(birthdate, 'YYYY-MM-DD') AS birthdate, type, timezone,
            pay_type AS "payType", hourly_rate::float AS "hourlyRate", tax_percent::float AS "taxPercent",
            custom_price AS "customPrice", paid_until AS "paidUntil", created_at AS "createdAt"
     FROM users WHERE id = $1`, [id])).rows[0];
  if (!u) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
  const now = new Date();
  const { start, next } = monthBounds(now.getFullYear(), now.getMonth() + 1);
  const monthMin = (await pool.query(
    `SELECT COALESCE(SUM(ROUND(EXTRACT(EPOCH FROM (COALESCE(check_out, now()) - check_in)) / 60)), 0)::int AS m
     FROM entries WHERE user_id = $1 AND work_date >= $2 AND work_date < $3`, [id, start, next])).rows[0].m;
  const entriesTotal = (await pool.query(`SELECT count(*)::int AS n FROM entries WHERE user_id = $1`, [id])).rows[0].n;
  const financeN = (await pool.query(`SELECT count(*)::int AS n FROM finance_items WHERE user_id = $1 AND active`, [id])).rows[0].n;
  const teams = (await pool.query(
    `SELECT o.name FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = $1 ORDER BY o.name`, [id])).rows.map((r) => r.name);
  let org = null;
  if (u.type === 'business') {
    const o = (await pool.query(`SELECT id, name FROM orgs WHERE owner_id = $1`, [id])).rows[0];
    if (o) {
      const mc = (await pool.query(`SELECT count(*)::int AS n FROM memberships WHERE org_id = $1`, [o.id])).rows[0].n;
      const bc = (await pool.query(`SELECT count(*)::int AS n FROM branches WHERE org_id = $1`, [o.id])).rows[0].n;
      org = { name: o.name, members: mc, branches: bc };
    }
  }
  res.json({ ...u, monthMinutes: monthMin, entriesTotal, financeActive: financeN, teams, org });
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
    trialDays: CONFIG.trialDays,
    bankName: CONFIG.bankName,
    bankAccount: CONFIG.bankAccount,
    premiumEnabled: CONFIG.premiumEnabled,
  });
}));

const setSetting = (key, value) => pool.query(
  `INSERT INTO settings (key, value) VALUES ($1, $2)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, String(value)]);

app.put('/api/admin/prices', requirePlatformAdmin, wrap(async (req, res) => {
  const body = req.body || {};
  const w = parseInt(body.worker, 10);
  const b = parseInt(body.business, 10);
  if (!Number.isFinite(w) || w < 0 || w > 1e7 || !Number.isFinite(b) || b < 0 || b > 1e7) {
    return fail(res, 400, "Narx noto'g'ri", 'BAD_AMOUNT');
  }
  await setSetting('price_worker', w);
  await setSetting('price_business', b);
  PRICE_OVERRIDES = { worker: w, business: b };
  // Bepul muddat (kun)
  if (body.trialDays !== undefined) {
    const td = parseInt(body.trialDays, 10);
    if (!Number.isFinite(td) || td < 0 || td > 3660) return fail(res, 400, "Kun soni noto'g'ri", 'BAD_DAYS');
    await setSetting('trial_days', td);
    CONFIG.trialDays = td;
  }
  // Bank rekvizitlari
  if (body.bankAccount !== undefined) {
    CONFIG.bankAccount = String(body.bankAccount).slice(0, 80);
    await setSetting('bank_account', CONFIG.bankAccount);
  }
  if (body.bankName !== undefined) {
    CONFIG.bankName = String(body.bankName).slice(0, 80);
    await setSetting('bank_name', CONFIG.bankName);
  }
  if (body.premiumEnabled !== undefined) {
    CONFIG.premiumEnabled = !!body.premiumEnabled;
    await setSetting('premium_enabled', CONFIG.premiumEnabled ? '1' : '0');
  }
  res.json({ ok: true });
}));

// Barcha foydalanuvchi ma'lumotlarini tozalash (faqat admin, sozlamalar saqlanadi)
app.post('/api/admin/reset', requirePlatformAdmin, wrap(async (req, res) => {
  if (String((req.body || {}).confirm || '') !== 'RESET') return fail(res, 400, 'Tasdiqlang', 'CONFIRM_REQUIRED');
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
  res.json({ ok: true });
}));

// Admin: foydalanuvchi parolini tiklash (parollar shifrlangan — ko'rsatib bo'lmaydi, faqat almashtiriladi)
app.put('/api/admin/users/:id/password', requirePlatformAdmin, wrap(async (req, res) => {
  const password = String((req.body || {}).password || '');
  if (password.length < 6) return fail(res, 400, 'Parol kamida 6 belgi', 'PW_SHORT6');
  const r = await pool.query(`UPDATE users SET password_hash = $1, has_password = TRUE WHERE id = $2 RETURNING id`,
    [await bcrypt.hash(password, 10), parseInt(req.params.id, 10)]);
  if (!r.rows[0]) return fail(res, 404, 'Topilmadi', 'NOT_FOUND');
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

// Ommaviy (autentifikatsiyasiz) jadval havolasi — faqat o'qish uchun.
// Egasi istagan vaqt havolani yangilaydi (rotate) → eski havola ishlamay qoladi.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
app.get('/t/:token', wrap(async (req, res) => {
  const org = (await pool.query(
    `SELECT o.id, o.name, u.timezone FROM orgs o JOIN users u ON u.id = o.owner_id WHERE o.share_token = $1`,
    [req.params.token])).rows[0];
  if (!org) return res.status(404).send('<!doctype html><meta charset=utf-8><body style="background:#0F1117;color:#A2A8B5;font-family:system-ui;text-align:center;padding:60px">Havola eskirgan yoki yangilangan.</body>');
  const tz = org.timezone;
  const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.ym || ''));
  const now = new Date();
  const year = m ? +m[1] : now.getFullYear();
  const month = m ? +m[2] : now.getMonth() + 1;
  const { start, next } = monthBounds(year, month);
  const members = (await pool.query(
    `SELECT u.id, u.name, m.hourly_rate::float AS rate, m.tax_percent::float AS tax
     FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 ORDER BY u.name`, [org.id])).rows;
  const rows = (await pool.query(
    `SELECT user_id, work_date::text AS date, check_in, check_out,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(check_out, now()) - check_in)) / 60)::int AS minutes
     FROM entries WHERE org_id = $1 AND work_date >= $2 AND work_date < $3 ORDER BY check_in`, [org.id, start, next])).rows;
  const byUser = {};
  const totals = {};
  for (const e of rows) {
    (byUser[e.user_id] ||= {});
    (byUser[e.user_id][e.date] ||= []).push(`${localTime(tz, e.check_in)}~${e.check_out ? localTime(tz, e.check_out) : '…'}`);
    totals[e.user_id] = (totals[e.user_id] || 0) + e.minutes;
  }
  const dim = new Date(year, month, 0).getDate();
  const fmtH = (mins) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  const dows = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
  let body = '';
  for (let d = 1; d <= dim; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(year, month - 1, d).getDay();
    const cls = dow === 0 ? 'sun' : dow === 6 ? 'sat' : '';
    const cells = members.map((mem) => {
      const v = byUser[mem.id]?.[date];
      return `<td>${v ? v.map(esc).join('<br>') : '·'}</td>`;
    }).join('');
    body += `<tr class="${cls}"><td class="d">${d}<small>${dows[dow]}</small></td>${cells}</tr>`;
  }
  const totRow = `<tr class="sum"><td class="d">Jami</td>${members.map((mem) => `<td>${fmtH(totals[mem.id] || 0)}</td>`).join('')}</tr>`;
  const salRow = `<tr class="sum"><td class="d">Maosh</td>${members.map((mem) => {
    const mins = totals[mem.id] || 0;
    const earned = mem.rate > 0 ? Math.round(mins / 60 * mem.rate * (1 - (mem.tax || 0) / 100)) : null;
    return `<td>${earned != null ? '₩' + earned.toLocaleString() : '—'}</td>`;
  }).join('')}</tr>`;
  const head = members.map((mem) => `<th>${esc(mem.name)}</th>`).join('');
  const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  res.send(`<!doctype html><html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>${esc(org.name)} — ${MONTHS[month - 1]} ${year}</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0F1117;color:#fff;font-family:system-ui,-apple-system,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:20px 14px 60px}
h1{font-size:20px;margin:0 0 2px}.sub{color:#A2A8B5;font-size:13px;margin-bottom:16px}
.scroll{overflow:auto;border-radius:16px;border:1px solid #262B36}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
th,td{padding:8px 6px;text-align:center;white-space:nowrap;border-bottom:1px solid #262B36;border-right:1px solid #262B36}
thead th{position:sticky;top:0;background:#171A22;font-weight:800}
td.d,th.corner{position:sticky;left:0;background:#12141b;font-weight:800;min-width:44px;text-align:center;line-height:1.05}
td.d small{display:block;color:#A2A8B5;font-size:10px}
tr.sat td{background:#141d2b}tr.sun td{background:#241722}
td{color:#24D17E;font-weight:600}
tr.sum td{background:#14251d;color:#24D17E;font-weight:800;border-top:2px solid #24D17E}
.foot{color:#A2A8B5;font-size:12px;margin-top:14px;text-align:center}
</style></head><body><div class="wrap">
<h1>${esc(org.name)}</h1><div class="sub">${MONTHS[month - 1]} ${year} · faqat o'qish uchun</div>
<div class="scroll"><table><thead><tr><th class="corner">Sana</th>${head}</tr></thead>
<tbody>${body}</tbody><tfoot>${totRow}${salRow}</tfoot></table></div>
<div class="foot">AlbaFit · havola egasi tomonidan istalgan vaqt yangilanishi mumkin</div>
</div></body></html>`);
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
    const cfg = (await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('price_worker','price_business','trial_days','bank_name','bank_account','premium_enabled')`)).rows;
    const cm = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
    if (cm.price_worker) PRICE_OVERRIDES.worker = parseInt(cm.price_worker, 10);
    if (cm.price_business) PRICE_OVERRIDES.business = parseInt(cm.price_business, 10);
    if (cm.trial_days) CONFIG.trialDays = parseInt(cm.trial_days, 10);
    if (cm.bank_name) CONFIG.bankName = cm.bank_name;
    if (cm.bank_account) CONFIG.bankAccount = cm.bank_account;
    if (cm.premium_enabled !== undefined) CONFIG.premiumEnabled = cm.premium_enabled === '1';
    app.listen(PORT, () => console.log(`LaLaKu Vaqt ${PORT}-portda ishlamoqda`));
  })
  .catch((e) => {
    console.error('Bazani sozlashda xato:', e);
    process.exit(1);
  });
