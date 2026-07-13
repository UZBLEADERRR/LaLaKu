/* LaLaKu Vaqt — mijoz ilovasi (SaaS) */
(() => {
  const $app = document.getElementById('app');
  const $nav = document.getElementById('bottom-nav');
  const AVATAR_COLORS = ['#5b5bd6', '#0d9488', '#c2410c', '#be185d', '#7c3aed', '#0369a1', '#0a9f6d', '#e5484d'];
  const LANG_NAMES = {
    uz: "O'zbekcha", en: 'English', ru: 'Русский', ko: '한국어', vi: 'Tiếng Việt',
    my: 'မြန်မာ', hi: 'हिन्दी', zh: '中文', kk: 'Қазақша', ky: 'Кыргызча',
  };
  const LOCALES = {
    uz: 'uz-UZ', en: 'en-US', ru: 'ru-RU', ko: 'ko-KR', vi: 'vi-VN',
    my: 'my-MM', hi: 'hi-IN', zh: 'zh-CN', kk: 'kk-KZ', ky: 'ky-KG',
  };
  // Valyutalar: kod → belgi
  const CURRENCIES = {
    KRW: '₩', USD: '$', UZS: "so'm", RUB: '₽', VND: '₫',
    MMK: 'K', INR: '₹', CNY: '¥', KZT: '₸', KGS: 'сом',
  };
  let CUR = localStorage.getItem('lalaku_cur') || 'KRW';
  if (!CURRENCIES[CUR]) CUR = 'KRW';
  let RATES = { KRW: 1 };  // KRW → boshqa valyuta
  try { RATES = JSON.parse(localStorage.getItem('lalaku_rates')) || { KRW: 1 }; } catch {}
  async function loadRates() {
    try {
      const r = await fetch('/api/rates');
      const j = await r.json();
      if (j.rates && j.rates.KRW) {
        RATES = j.rates;
        localStorage.setItem('lalaku_rates', JSON.stringify(RATES));
      }
    } catch {}
  }
  const TIMEZONES = [
    ['Asia/Seoul', 'Seoul (Korea)'], ['Asia/Tokyo', 'Tokyo (Japan)'],
    ['Asia/Shanghai', 'Shanghai (China)'], ['Asia/Tashkent', 'Tashkent (Uzbekistan)'],
    ['Asia/Almaty', 'Almaty (Kazakhstan)'], ['Asia/Bishkek', 'Bishkek (Kyrgyzstan)'],
    ['Asia/Dubai', 'Dubai (UAE)'], ['Europe/Istanbul', 'Istanbul (Turkey)'],
    ['Europe/Moscow', 'Moscow (Russia)'], ['Europe/Berlin', 'Berlin (Germany)'],
    ['Europe/London', 'London (UK)'], ['America/New_York', 'New York (USA)'],
    ['America/Los_Angeles', 'Los Angeles (USA)'], ['UTC', 'UTC'],
  ];

  // ---------- Til ----------
  let LANG = localStorage.getItem('lalaku_lang') || 'uz';
  if (!window.I18N[LANG]) LANG = 'uz';
  const t = (key, ...args) => {
    const v = window.I18N[LANG][key] ?? window.I18N.uz[key] ?? key;
    return typeof v === 'function' ? v(...args) : v;
  };
  const terr = (ex) => (ex.code && (window.I18N[LANG].err[ex.code] || window.I18N.uz.err[ex.code])) || ex.message || t('genericError');
  const MONTHS = () => window.I18N[LANG].months;
  const DOWS = () => window.I18N[LANG].dows;
  // Pul KRW'da saqlanadi, tanlangan valyutaga jonli aylantiriladi
  function fmtMoney(krw) {
    const rate = RATES[CUR] || 1;
    const val = krw * rate;
    const sym = CURRENCIES[CUR];
    const dec = (CUR === 'USD' || CUR === 'CNY') ? (Math.abs(val) < 1000 ? 2 : 0) : 0;
    const num = new Intl.NumberFormat(LOCALES[LANG], { maximumFractionDigits: dec }).format(Math.abs(val));
    const sign = krw < 0 ? '−' : '';
    // Belgi oldinda (₩$¥₹₽₫₸) yoki keyin (so'm, сом, K)
    return /^[A-Za-zА-Яа-яʻ']/.test(sym) ? `${sign}${num} ${sym}` : `${sign}${sym}${num}`;
  }

  const langSelHtml = () => `
    <select class="lang-sel" id="lang-sel" aria-label="Language">
      ${Object.entries(LANG_NAMES).map(([k, v]) => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${v}</option>`).join('')}
    </select>`;
  function bindLangSel() {
    document.getElementById('lang-sel')?.addEventListener('change', (e) => {
      localStorage.setItem('lalaku_lang', e.target.value);
      location.reload();
    });
  }

  // Valyuta tez tanlagichi (asosiy ekranda)
  const curSelHtml = () => `
    <select class="lang-sel" id="cur-quick" aria-label="Currency">
      ${Object.keys(CURRENCIES).map((c) => `<option value="${c}" ${c === CUR ? 'selected' : ''}>${c} ${CURRENCIES[c]}</option>`).join('')}
    </select>`;
  function bindCurSel(rerender) {
    document.getElementById('cur-quick')?.addEventListener('change', async (e) => {
      CUR = e.target.value;
      localStorage.setItem('lalaku_cur', CUR);
      await loadRates();
      rerender();
    });
  }

  // ---------- Mavzu ----------
  const THEMES = ['classic', 'kakao', 'kakaodark', 'mint', 'dark'];
  let THEME = localStorage.getItem('lalaku_theme') || 'classic';
  if (!THEMES.includes(THEME)) THEME = 'classic';
  function applyTheme() {
    document.documentElement.dataset.theme = THEME;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content',
      { classic: '#5b5bd6', kakao: '#FEE500', kakaodark: '#241a16', mint: '#0d9488', dark: '#12141f' }[THEME]);
  }
  applyTheme();

  function themePickerHtml() {
    return `<div class="card"><h2>${t('theme')}</h2>
      <div class="theme-row">
        ${THEMES.map((th) => `
          <button class="theme-chip ${th === THEME ? 'active' : ''}" data-theme-pick="${th}">
            <span class="dot dot-${th}"></span>${t('theme' + th[0].toUpperCase() + th.slice(1))}
          </button>`).join('')}
      </div></div>`;
  }
  function bindThemePicker(rerender) {
    document.querySelectorAll('[data-theme-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        THEME = b.dataset.themePick;
        localStorage.setItem('lalaku_theme', THEME);
        applyTheme();
        rerender();
      }));
  }

  // ---------- Joylashuv (geofence uchun) ----------
  function getLoc(timeoutMs = 7000) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
      );
    });
  }

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V21h14V9.8"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16.5 15h.01"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg>',
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 15.2c2.2.3 3.6 1.8 4 4.3"/></svg>',
  };

  const state = {
    me: null,
    month: null,
    selectedDay: null,
    view: 'home',           // worker: home | calendar | finance | profile | forecast
    bizTab: 'board',        // business: board | calendar | team | qr | profile
    padTab: 'payments',
    joinToken: null,
    timerId: null,
  };

  // ---------- Akkauntlar (bitta qurilmada bir nechta, Telegram kabi) ----------
  const getAccounts = () => { try { return JSON.parse(localStorage.getItem('lalaku_accounts')) || []; } catch { return []; } };
  const saveAccounts = (a) => localStorage.setItem('lalaku_accounts', JSON.stringify(a));
  const activeAccount = () => getAccounts()[+localStorage.getItem('lalaku_active') || 0] || null;
  function upsertAccount(me) {
    const a = getAccounts();
    const entry = { id: me.id, name: me.name, email: me.email, type: me.type, token: me.token };
    const i = a.findIndex((x) => x.id === me.id);
    if (i >= 0) a[i] = entry; else a.push(entry);
    saveAccounts(a);
    localStorage.setItem('lalaku_active', String(a.findIndex((x) => x.id === me.id)));
  }
  function removeActiveAccount() {
    const a = getAccounts();
    a.splice(+localStorage.getItem('lalaku_active') || 0, 1);
    saveAccounts(a);
    localStorage.setItem('lalaku_active', '0');
  }

  // ---------- API (stale-while-revalidate: keshdan darhol, fonда yangilaydi) ----------
  const CACHEABLE = ['/api/me', '/api/my/summary', '/api/jobs', '/api/finance', '/api/my/status', '/api/my/year', '/api/my/schedule'];
  const cacheKey = (url) => `lalaku_c_${activeAccount()?.id || 0}_${url}`;
  // Mutatsiyadan keyin joriy akkaunt keshini tozalash (keyingi GET yangisini oladi)
  function bustCache() {
    const id = activeAccount()?.id || 0;
    Object.keys(localStorage).forEach((k) => { if (k.startsWith(`lalaku_c_${id}_`)) localStorage.removeItem(k); });
  }

  async function api(url, opts = {}) {
    const isGet = !opts.method || opts.method === 'GET';
    const cacheable = isGet && CACHEABLE.some((p) => url.startsWith(p));
    const acc = activeAccount();
    const doFetch = async () => {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(acc?.token ? { Authorization: 'Bearer ' + acc.token } : {}),
        },
        credentials: 'same-origin',
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(data.error || t('genericError'));
        e.code = data.code;
        throw e;
      }
      if (cacheable) { try { localStorage.setItem(cacheKey(url), JSON.stringify(data)); } catch {} }
      // Mutatsiya (POST/PUT/DELETE) serverni o'zgartiradi — keshni tozalaymiz
      else if (!isGet && url.startsWith('/api/')) bustCache();
      state.offline = false;
      return data;
    };

    // Kesh bo'lsa — darhol qaytaramiz, fonда yangilaymiz (tez ishlashi uchun)
    if (cacheable) {
      const cached = localStorage.getItem(cacheKey(url));
      if (cached) {
        doFetch().catch(() => {}); // fon: server yukiga qo'shimcha bermaydi, bloklamaydi
        try { return JSON.parse(cached); } catch {}
      }
    }
    try {
      return await doFetch();
    } catch (e) {
      if (isGet && !e.code) {
        const cached = localStorage.getItem(cacheKey(url));
        if (cached) { state.offline = true; return JSON.parse(cached); }
      }
      throw e;
    }
  }

  // ---------- Yordamchilar ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtH = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const avatarColor = (name) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };
  const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const dayTitle = (date) => {
    const [, m, d] = date.split('-');
    return LANG === 'ko' ? `${+m}월 ${+d}일` : LANG === 'en' ? `${MONTHS()[+m - 1]} ${+d}` : `${+d}-${MONTHS()[+m - 1].toLowerCase()}`;
  };
  const calTitle = (year, month) => LANG === 'ko' ? `${year}년 ${MONTHS()[month - 1]}` : `${MONTHS()[month - 1]} ${year}`;

  function toast(msg, type = '', ms = 3400) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast ${type}`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function currentMonth() {
    if (!state.month) {
      const d = new Date();
      state.month = { year: d.getFullYear(), month: d.getMonth() + 1 };
    }
    return state.month;
  }
  function shiftMonth(delta) {
    const { year, month } = currentMonth();
    const d = new Date(year, month - 1 + delta, 1);
    state.month = { year: d.getFullYear(), month: d.getMonth() + 1 };
    state.selectedDay = null;
  }
  function stopTimers() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  // Ish haqi hisobi: har bir ish joyi (job) o'z stavkasi bilan,
  // jobsiz yozuvlar profil stavkasida hisoblanadi
  function computeEarnings(summary, jobs) {
    const me = state.me;
    const agg = new Map(); // jobId (0 = umumiy) -> {minutes, days}
    for (const [date, d] of Object.entries(summary.days)) {
      for (const sess of d.sessions) {
        const k = sess.jobId || 0;
        if (!agg.has(k)) agg.set(k, { minutes: 0, days: new Set() });
        const a = agg.get(k);
        a.minutes += sess.minutes;
        a.days.add(date);
      }
    }
    let gross = 0, tax = 0, hasRate = false;
    const parts = [];
    for (const [k, a] of agg) {
      const job = jobs.find((j) => j.id === k);
      const payType = job ? job.payType : me.payType;
      const rate = job ? job.rate : (me.payType === 'daily' ? me.dailyRate : me.hourlyRate);
      const taxP = job ? job.taxPercent : me.taxPercent;
      if (rate > 0) hasRate = true;
      const g = payType === 'daily' ? a.days.size * rate : (a.minutes / 60) * rate;
      gross += g;
      tax += g * taxP / 100;
      parts.push({ name: job ? job.name : t('personal'), gross: g });
    }
    if (!agg.size) {
      hasRate = (me.payType === 'daily' ? me.dailyRate : me.hourlyRate) > 0 || jobs.some((j) => j.rate > 0);
    }
    return { gross, tax, net: gross - tax, hasRate, parts };
  }

  // Bitta ish joyi (yoki umumiy) uchun sof daromad
  function jobEarn(job, minutes, daysCount) {
    const me = state.me;
    const payType = job ? job.payType : me.payType;
    const rate = job ? job.rate : (me.payType === 'daily' ? me.dailyRate : me.hourlyRate);
    const taxP = job ? job.taxPercent : me.taxPercent;
    const g = payType === 'daily' ? daysCount * rate : (minutes / 60) * rate;
    return { gross: g, net: g * (1 - taxP / 100), hasRate: rate > 0 };
  }

  // Kalendarni bitta ish joyi bo'yicha filtrlash
  function filterSummary(summary, jobId) {
    if (!jobId) return summary;
    const days = {};
    let totalMinutes = 0;
    for (const [date, d] of Object.entries(summary.days)) {
      const sessions = d.sessions.filter((x) => (x.jobId || 0) === jobId);
      if (!sessions.length) continue;
      const minutes = sessions.reduce((a, x) => a + x.minutes, 0);
      days[date] = { sessions, minutes, open: sessions.some((x) => !x.out) };
      totalMinutes += minutes;
    }
    return { ...summary, days, totalMinutes, daysWorked: Object.keys(days).length };
  }

  // ---------- Navigatsiya (ishchi) ----------
  function showNav(active) {
    $nav.classList.remove('hidden');
    const items = [
      ['home', ICONS.home, t('navHome')],
      ['calendar', ICONS.calendar, t('navCalendar')],
      ['finance', ICONS.wallet, t('navFinance')],
      ['profile', ICONS.user, t('navProfile')],
    ];
    $nav.innerHTML = items.map(([v, ic, label]) =>
      `<button data-v="${v}" class="${active === v ? 'active' : ''}">${ic}<span>${label}</span></button>`).join('');
    $nav.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => { state.view = b.dataset.v; renderWorker(); })
    );
  }
  function hideNav() { $nav.classList.add('hidden'); }

  // ---------- Modal ----------
  function openModal(html) {
    closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.id = 'modal-back';
    back.innerHTML = `<div class="modal">${html}</div>`;
    back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    document.body.appendChild(back);
    return back.querySelector('.modal');
  }
  function closeModal() { document.getElementById('modal-back')?.remove(); }

  // ---------- QR skaner ----------
  const scanner = {
    el: document.getElementById('scanner'),
    video: document.getElementById('scanner-video'),
    stream: null, raf: null,
    async open(onCode) {
      document.getElementById('scanner-hint').textContent = t('scanHint');
      document.getElementById('scanner-cancel').textContent = t('scanCancel');
      this.el.classList.remove('hidden');
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        });
      } catch {
        this.close();
        toast(t('cameraDenied'), 'error', 5000);
        return;
      }
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let done = false;
      const tick = () => {
        if (done) return;
        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
          canvas.width = this.video.videoWidth;
          canvas.height = this.video.videoHeight;
          ctx.drawImage(this.video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            done = true;
            if (navigator.vibrate) navigator.vibrate(80);
            this.close();
            onCode(code.data);
            return;
          }
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    },
    close() {
      cancelAnimationFrame(this.raf);
      this.stream?.getTracks().forEach((tr) => tr.stop());
      this.stream = null;
      this.video.srcObject = null;
      this.el.classList.add('hidden');
    },
  };
  document.getElementById('scanner-cancel').addEventListener('click', () => scanner.close());

  const brandHtml = (sub) => `
    <div class="brand"><div class="logo">⏱</div><div>LaLaKu Vaqt${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;

  // ================================================================
  //  AUTH (login / signup)
  // ================================================================
  async function renderAuth(mode = 'login') {
    stopTimers();
    hideNav();
    $app.className = 'no-nav';

    let joinBanner = '';
    if (state.joinToken) {
      try {
        const inv = await api(`/api/invite/${encodeURIComponent(state.joinToken)}`);
        joinBanner = `<div class="card" style="background:var(--green-soft);border:1.5px solid var(--green)">
          <b>${t('joinTitle', esc(inv.orgName))}</b>
          <p class="muted" style="margin-top:4px">${t('joinDesc')}</p>
        </div>`;
      } catch { state.joinToken = null; }
    }

    $app.innerHTML = `
      <div class="topbar">
        ${state.addingAccount ? `<button class="chip gray" id="auth-back">${t('back')}</button>` : brandHtml('')}
        ${langSelHtml()}
      </div>
      ${joinBanner}
      <div class="hero-login">
        <h1>${t('welcome')}</h1>
        <p>${t('authIntro')}</p>
      </div>
      <div class="segment">
        <button data-m="login" class="${mode === 'login' ? 'active' : ''}">${t('signIn')}</button>
        <button data-m="signup" class="${mode === 'signup' ? 'active' : ''}">${t('signUp')}</button>
      </div>
      <div class="card">
        <form id="auth-form">
          ${mode === 'signup' ? `
            <label>${t('accountType')}</label>
            <div class="type-pick">
              <label class="type-card"><input type="radio" name="acctype" value="worker" checked>
                <b>${t('typeWorker')}</b><span>${t('typeWorkerDesc')}</span></label>
              <label class="type-card"><input type="radio" name="acctype" value="business">
                <b>${t('typeBusiness')}</b><span>${t('typeBusinessDesc')}</span></label>
            </div>
            <div id="bizname-wrap" class="hidden">
              <label>${t('businessName')}</label>
              <input id="auth-bizname" placeholder="🍽">
            </div>
            <label>${t('yourName')}</label>
            <input id="auth-name" autocomplete="name">
          ` : ''}
          ${mode === 'login' ? `
          <div class="segment" style="margin-top:8px">
            <button type="button" data-lm="email" class="${state.loginMode !== 'phone' ? 'active' : ''}">${t('loginEmail')}</button>
            <button type="button" data-lm="phone" class="${state.loginMode === 'phone' ? 'active' : ''}">${t('loginPhone')}</button>
          </div>` : ''}
          <div id="f-email" class="${mode === 'login' && state.loginMode === 'phone' ? 'hidden' : ''}">
            <label>${t('email')}</label>
            <input id="auth-email" type="email" autocomplete="email" inputmode="email">
          </div>
          <div id="f-phone" class="${mode === 'signup' || state.loginMode === 'phone' ? '' : 'hidden'}">
            <label>${t('phone')}</label>
            <input id="auth-phone" type="tel" inputmode="tel" placeholder="010-1234-5678">
            <label>${t('birthdate')}</label>
            <input id="auth-bd" type="date">
          </div>
          <label>${mode === 'signup' ? t('pwOptional') : (state.loginMode === 'phone' ? t('pwIfSet') : t('password'))}</label>
          <input id="auth-pw" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}">
          <div class="error-text" id="auth-error"></div>
          <button class="btn" type="submit">${mode === 'signup' ? t('signUp') : t('signIn')}</button>
          ${mode === 'signup' ? `<p class="muted" style="text-align:center;margin-top:10px;font-size:13px">${t('trialNote', 15)}</p>` : ''}
        </form>
      </div>
      <button class="btn ghost" id="auth-switch">${mode === 'signup' ? t('haveAccount') : t('noAccount')}</button>
      <button class="btn ghost" id="go-admin" style="font-size:13px;padding:8px">${t('adminBtn')}</button>
    `;
    bindLangSel();
    document.querySelectorAll('.segment button').forEach((b) =>
      b.addEventListener('click', () => renderAuth(b.dataset.m)));
    document.getElementById('auth-switch').addEventListener('click', () => renderAuth(mode === 'signup' ? 'login' : 'signup'));
    document.getElementById('auth-back')?.addEventListener('click', () => {
      // Akkaunt qo'shishdan voz kechish — avvalgi faol akkauntga qaytish
      state.addingAccount = false;
      location.reload();
    });
    document.getElementById('go-admin').addEventListener('click', renderPadminLogin);

    if (mode === 'signup') {
      document.querySelectorAll('input[name=acctype]').forEach((r) =>
        r.addEventListener('change', () => {
          document.getElementById('bizname-wrap').classList.toggle('hidden', r.value !== 'business' || !r.checked);
        }));
    }

    document.querySelectorAll('[data-lm]').forEach((b) =>
      b.addEventListener('click', () => { state.loginMode = b.dataset.lm; renderAuth('login'); }));

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('auth-error');
      err.textContent = '';
      try {
        const body = { password: document.getElementById('auth-pw').value || undefined };
        let me;
        if (mode === 'signup') {
          body.email = document.getElementById('auth-email').value;
          body.phone = document.getElementById('auth-phone')?.value || undefined;
          body.birthdate = document.getElementById('auth-bd')?.value || undefined;
          body.name = document.getElementById('auth-name').value;
          body.type = document.querySelector('input[name=acctype]:checked').value;
          body.businessName = document.getElementById('auth-bizname')?.value || '';
          // Qurilmada bitta ishchi akkaunt qoidasi
          if (body.type === 'worker' && getAccounts().some((a) => a.type === 'worker')) {
            err.textContent = t('onlyOneWorker');
            return;
          }
          me = await api('/api/register', { method: 'POST', body });
        } else if (state.loginMode === 'phone') {
          body.phone = document.getElementById('auth-phone').value;
          body.birthdate = document.getElementById('auth-bd').value || undefined;
          me = await api('/api/login', { method: 'POST', body });
        } else {
          body.email = document.getElementById('auth-email').value;
          me = await api('/api/login', { method: 'POST', body });
        }
        upsertAccount(me);
        state.me = me;
        state.addingAccount = false;
        await afterAuth();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  async function afterAuth() {
    if (state.joinToken && state.me.type !== 'business') {
      try {
        const r = await api('/api/join', { method: 'POST', body: { token: state.joinToken } });
        toast(t('joined', r.orgName), 'success', 5000);
        state.me = await api('/api/me');
      } catch (ex) { toast(terr(ex), 'error', 5000); }
      state.joinToken = null;
      history.replaceState(null, '', '/');
    }
    if (state.me.type === 'business') { state.bizTab = 'board'; renderBusiness(); }
    else { state.view = 'home'; renderWorker(); }
  }

  // ================================================================
  //  OBUNA / TO'LOV
  // ================================================================
  function subBannerHtml() {
    const me = state.me;
    if (!me.active) {
      return `<div class="sub-banner expired">🔒 ${t('subExpired')}</div>`;
    }
    if (me.daysLeft <= 5) {
      return `<div class="sub-banner warn">⏳ ${t('paidLeft', me.daysLeft)}</div>`;
    }
    return '';
  }

  function payCardHtml() {
    const me = state.me;
    if (me.pendingPayment) {
      return `<div class="card paywall"><h2>${t('payTitle')}</h2><p class="muted">${t('payPending')}</p></div>`;
    }
    return `
      <div class="card paywall">
        <h2>${t('payTitle')}</h2>
        <p class="muted">${t('payDesc', new Intl.NumberFormat(LOCALES[LANG]).format(me.price))}</p>
        <div class="bank-box">
          <div><b>${t('payBank')}</b></div>
          <div class="acc" id="bank-acc">${t('payAccount')}</div>
          <button class="chip" id="acc-copy">${t('copy')}</button>
        </div>
        <label class="btn outline" style="text-align:center;cursor:pointer;margin-top:12px">
          ${t('payUpload')}
          <input type="file" id="pay-file" accept="image/*" class="hidden">
        </label>
        <div id="pay-preview" class="pay-preview hidden"><img alt=""></div>
        <label>${t('payLink')}</label>
        <input id="pay-link" placeholder="https://toss.me/...">
        <div class="error-text" id="pay-error"></div>
        <button class="btn" id="pay-send">${t('paySend')}</button>
      </div>`;
  }

  function bindPayCard(rerender) {
    document.getElementById('acc-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('bank-acc').textContent.trim())
        .then(() => toast(t('copied'), 'success'));
    });
    let imageData = null;
    document.getElementById('pay-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      imageData = await compressImage(file);
      const prev = document.getElementById('pay-preview');
      prev.querySelector('img').src = imageData;
      prev.classList.remove('hidden');
    });
    document.getElementById('pay-send')?.addEventListener('click', async () => {
      const err = document.getElementById('pay-error');
      err.textContent = '';
      try {
        await api('/api/payment', {
          method: 'POST',
          body: { image: imageData, link: document.getElementById('pay-link').value || null },
        });
        toast(t('paySent'), 'success', 5000);
        state.me = await api('/api/me');
        rerender();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  async function compressImage(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  // ================================================================
  //  ISHCHI
  // ================================================================
  function renderWorker() {
    stopTimers();
    $app.className = '';
    showNav(state.view);
    if (state.view === 'calendar') return renderMyCalendar();
    if (state.view === 'finance') return renderFinance();
    if (state.view === 'profile') return renderProfile();
    if (state.view === 'forecast') return renderForecast();
    if (state.view === 'wp') return renderWorkplace();
    return renderWorkerHome();
  }

  async function renderWorkerHome() {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1;
    let status, summary, jobs, sched = { schedules: [] };
    try {
      [status, summary, jobs, state.me] = await Promise.all([
        api('/api/my/status'),
        api(`/api/my/summary?year=${year}&month=${month}`),
        api('/api/jobs'),
        api('/api/me'),
      ]);
      if (state.me.memberships.length) sched = await api(`/api/my/schedule?year=${year}&month=${month}`);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderAuth();
      toast(terr(ex), 'error');
      return;
    }
    state.jobs = jobs;

    // Bugun va keyingi kunlardagi rejalashtirilgan smenalar
    const today0 = todayStr();
    const upcoming = sched.schedules.filter((s) => s.date >= today0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    const schedHtml = upcoming.length ? `
      <div class="card">
        <h2>${t('mySchedule')}</h2>
        ${upcoming.map((s) => `
          <div class="sched-row">
            <span class="sd">${s.date === today0 ? '<b style="color:var(--green)">•</b> ' : ''}${dayTitle(s.date)}</span>
            <span class="st">${s.start} → ${s.end}</span>
            <span class="muted" style="font-size:12px;text-align:right">${esc(s.orgName)}${s.note ? `<br>${esc(s.note)}` : ''}</span>
          </div>`).join('')}
      </div>` : '';

    const me = state.me;
    const today = todayStr();
    const todayMin = summary.days[today] ? summary.days[today].minutes : 0;
    const e = computeEarnings(summary, jobs);

    // Har bir ish joyining bu oydagi soatlari va kunlari
    const perJobMin = {}, perJobDays = {};
    for (const [dt, d] of Object.entries(summary.days)) {
      for (const sess of d.sessions) {
        const k = sess.jobId || 0;
        perJobMin[k] = (perJobMin[k] || 0) + sess.minutes;
        (perJobDays[k] ||= new Set()).add(dt);
      }
    }

    const personalJobs = jobs.filter((j) => !j.orgId && j.active);
    const memberOrgIds = new Set(me.memberships.map((m) => m.orgId));

    // Taklif kartalari
    const invitesHtml = (me.invites || []).map((inv) => `
      <div class="card invite-card" data-invite="${inv.id}">
        <b>${t('invitedYou', esc(inv.orgName))}</b>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn inv-accept" style="padding:11px;font-size:14px">${t('accept')}</button>
          <button class="btn ghost inv-decline" style="padding:11px;font-size:14px">${t('decline')}</button>
        </div>
      </div>`).join('');

    // Ish joyi kartasi
    const activeJobId = status.checkedIn ? (status.jobId || 0) : null;
    const cardFor = (kind, obj) => {
      // kind: 'job' (shaxsiy) | 'team'
      const isTeam = kind === 'team';
      const name = isTeam ? obj.orgName : obj.name;
      const teamJob = isTeam ? jobs.find((j) => j.orgId === obj.orgId) : null;
      const jid = isTeam ? (teamJob?.id || -1) : obj.id;
      const mins = perJobMin[jid] || 0;
      const isActive = status.checkedIn && (isTeam ? status.orgId === obj.orgId : activeJobId === obj.id);
      const otherActive = status.checkedIn && !isActive;
      let action = '';
      if (!me.active) {
        action = '';
      } else if (isActive) {
        action = (isTeam && status.orgCheckMode === 'qr')
          ? `<button class="wp-btn stop" data-scan="1">${t('scanQrBtn')}</button>`
          : `<button class="wp-btn stop" data-stop="1">${t('stopBtn')}</button>`;
      } else if (!otherActive) {
        action = isTeam
          ? (obj.checkMode === 'qr'
            ? `<button class="wp-btn start" data-scan="1">${t('scanQrBtn')}</button>`
            : `<button class="wp-btn start" data-orgstart="${obj.orgId}">${t('startBtn')}</button>`)
          : `<button class="wp-btn start" data-jobstart="${obj.id}">${t('startBtn')}</button>`;
      }
      const rateJob = isTeam ? teamJob : obj;
      const earn = jobEarn(rateJob, mins, (perJobDays[jid] || new Set()).size);
      const earnTxt = earn.hasRate && earn.net > 0 ? ` · <b style="color:var(--green)">${fmtMoney(earn.net)}</b>` : '';
      return `
      <div class="wp-card ${isActive ? 'active' : ''} ${otherActive ? 'dim' : ''}"
           data-wp="${isTeam ? 'team' : 'job'}" data-wpjob="${jid}" data-wporg="${isTeam ? obj.orgId : ''}">
        <span class="avatar" style="background:${avatarColor(name)}">${isTeam ? '🍽' : esc(initials(name))}</span>
        <div class="info wp-open">
          <div class="name">${esc(name)}${isTeam ? ` <span class="tag-team">${t('teamTag')}</span>` : ''}
            ${isActive ? `<span class="tag-live"><span class="pulse-dot"></span>${t('activeTag')}</span>` : ''}</div>
          <div class="sub">${fmtH(mins)} ${t('hUnit')}${earnTxt}</div>
        </div>
        ${action}
      </div>`;
    };

    const wpCards =
      me.memberships.map((m) => cardFor('team', m)).join('') +
      personalJobs.map((j) => cardFor('job', j)).join('');

    $app.innerHTML = `
      <div class="topbar">${brandHtml(me.name)}${curSelHtml()}</div>
      ${state.offline ? `<div class="sub-banner warn">${t('offlineTag')}</div>` : ''}
      ${subBannerHtml()}
      ${invitesHtml}

      <div class="hero-mini ${status.checkedIn ? 'working' : ''}">
        <div>
          <div class="hm-label">${status.checkedIn
            ? `${t('atWork')}${status.orgName ? ` · ${esc(status.orgName)}` : ''} · ${status.since}`
            : t('offWork').replace('🌙 ', '')}</div>
          <div class="hm-time" id="status-time">${status.checkedIn ? '' : fmtH(todayMin)}</div>
        </div>
        <div class="hm-stats">
          <div><b>${fmtH(summary.totalMinutes)}</b><span>${t('monthTotal', MONTHS()[month - 1])}</span></div>
          ${e.hasRate ? `<div><b>${fmtMoney(e.net)}</b><span>${t('monthNet')}</span></div>` : ''}
        </div>
      </div>

      ${status.checkedIn && me.active ? `
      <button class="scan-btn leave" id="global-stop">
        ${status.orgId && status.orgCheckMode === 'qr' ? `${ICONS.scan} ${t('checkoutBtn')}` : t('stopBtn')}
      </button>` : ''}

      ${!me.active ? payCardHtml() : ''}

      <div class="wp-head">
        <h2 style="margin:0">${t('myWorkplaces')}</h2>
        <button class="chip" id="job-add">＋</button>
      </div>
      ${wpCards || `<div class="card"><p class="muted">${t('noWorkplaces')}</p></div>`}
      ${schedHtml}
    `;
    bindPayCard(renderWorker);
    bindCurSel(renderWorker);
    document.getElementById('job-add').addEventListener('click', () => openJobModal(null));

    if (status.checkedIn && status.sinceIso) {
      const started = new Date(status.sinceIso);
      const closedBefore = summary.days[today]
        ? summary.days[today].sessions.filter((x) => x.out).reduce((a, x) => a + x.minutes, 0) : 0;
      const upd = () => {
        const mins = Math.max(0, Math.floor((Date.now() - started) / 60_000));
        const el = document.getElementById('status-time');
        if (el) el.textContent = fmtH(closedBefore + mins);
      };
      upd();
      state.timerId = setInterval(upd, 15_000);
    }

    const doAction = async (fn) => {
      try {
        const r = await fn();
        toast(r.action === 'in' ? t('scanInOk', r.time) : t('scanOutOk', r.time), 'success', 4000);
        renderWorker();
      } catch (ex) { toast(terr(ex), 'error', 4500); }
    };
    document.querySelectorAll('[data-scan]').forEach((b) =>
      b.addEventListener('click', async () => {
        const loc = await getLoc();
        scanner.open((code) => doAction(() => api('/api/scan', { method: 'POST', body: { code, ...loc } })));
      }));
    document.querySelectorAll('[data-orgstart]').forEach((b) =>
      b.addEventListener('click', async () => {
        const loc = await getLoc();
        doAction(() => api('/api/punch', { method: 'POST', body: { orgId: +b.dataset.orgstart, ...loc } }));
      }));
    document.querySelectorAll('[data-jobstart]').forEach((b) =>
      b.addEventListener('click', () =>
        doAction(() => api('/api/punch', { method: 'POST', body: { jobId: +b.dataset.jobstart } }))));
    document.querySelectorAll('[data-stop]').forEach((b) =>
      b.addEventListener('click', async () => {
        const loc = status.orgId ? await getLoc() : {};
        doAction(() => api('/api/punch', { method: 'POST', body: { ...loc } }));
      }));

    // Doim ko'rinadigan "Ketish" tugmasi (kelib bo'lgach)
    document.getElementById('global-stop')?.addEventListener('click', async () => {
      if (status.orgId && status.orgCheckMode === 'qr') {
        const loc = await getLoc();
        scanner.open((code) => doAction(() => api('/api/scan', { method: 'POST', body: { code, ...loc } })));
      } else {
        const loc = status.orgId ? await getLoc() : {};
        doAction(() => api('/api/punch', { method: 'POST', body: { ...loc } }));
      }
    });

    document.querySelectorAll('.wp-card .wp-open').forEach((el) =>
      el.addEventListener('click', () => {
        const card = el.closest('.wp-card');
        state.wp = {
          kind: card.dataset.wp,
          jobId: +card.dataset.wpjob || 0,
          orgId: card.dataset.wporg ? +card.dataset.wporg : null,
        };
        state.month = null;
        state.selectedDay = null;
        state.view = 'wp';
        renderWorker();
      }));

    document.querySelectorAll('.invite-card').forEach((card) => {
      const id = card.dataset.invite;
      card.querySelector('.inv-accept').addEventListener('click', async () => {
        try {
          const r = await api(`/api/invites/${id}/accept`, { method: 'POST' });
          toast(t('joined', r.orgName), 'success', 5000);
          renderWorker();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      card.querySelector('.inv-decline').addEventListener('click', async () => {
        try {
          await api(`/api/invites/${id}/decline`, { method: 'POST' });
          renderWorker();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
    });
  }

  // ---------- Maosh kartasi ----------
  function salaryCardHtml(e) {
    const gearBtn = `<button class="chip gray" id="salary-gear">⚙️</button>`;
    if (!e.hasRate) {
      return `<div class="card">
        <div class="modal-head" style="margin-bottom:4px"><h2 style="margin:0">${t('salary')}</h2>${gearBtn}</div>
        <p class="muted">${t('salaryHint')}</p>
      </div>`;
    }
    const partRows = e.parts.length > 1
      ? e.parts.map((p) => `<div class="sal-row"><span class="muted">· ${esc(p.name)}</span><span>${fmtMoney(p.gross)}</span></div>`).join('')
      : '';
    return `<div class="card">
      <div class="modal-head" style="margin-bottom:6px"><h2 style="margin:0">${t('salary')}</h2>${gearBtn}</div>
      ${partRows}
      <div class="sal-row"><span class="muted">${t('gross')}</span><b>${fmtMoney(e.gross)}</b></div>
      ${e.tax > 0 ? `<div class="sal-row"><span class="muted">${t('taxLabel', Math.round(e.tax / e.gross * 1000) / 10)}</span><b style="color:var(--red)">−${fmtMoney(e.tax)}</b></div>` : ''}
      <div class="sal-row net"><span>${t('net')}</span><b style="color:var(--green)">${fmtMoney(e.net)}</b></div>
    </div>`;
  }

  function bindSalaryCard(rerender) {
    document.getElementById('salary-gear')?.addEventListener('click', () => {
      const me = state.me;
      const modal = openModal(`
        <div class="modal-head"><h2 style="margin:0">${t('paySettings')}</h2><button class="modal-close" id="m-close">✕</button></div>
        <label>${t('payType')}</label>
        <div class="segment" style="margin-bottom:4px">
          <button type="button" data-pt="hourly" class="${me.payType !== 'daily' ? 'active' : ''}">${t('payHourly')}</button>
          <button type="button" data-pt="daily" class="${me.payType === 'daily' ? 'active' : ''}">${t('payDaily')}</button>
        </div>
        <div id="rate-hourly" class="${me.payType === 'daily' ? 'hidden' : ''}">
          <label>${t('hourlyRate')}</label>
          <input type="number" id="s-hourly" min="0" step="any" inputmode="decimal" value="${me.hourlyRate || ''}" placeholder="10030">
        </div>
        <div id="rate-daily" class="${me.payType === 'daily' ? '' : 'hidden'}">
          <label>${t('dailyRate')}</label>
          <input type="number" id="s-daily" min="0" step="any" inputmode="decimal" value="${me.dailyRate || ''}" placeholder="100000">
        </div>
        <label>${t('taxPercent')}</label>
        <input type="number" id="s-tax" min="0" max="100" step="any" inputmode="decimal" value="${me.taxPercent || ''}" placeholder="3.3">
        <div class="error-text" id="s-error"></div>
        <button class="btn" id="s-save">${t('save')}</button>
      `);
      let payType = me.payType;
      modal.querySelectorAll('[data-pt]').forEach((b) =>
        b.addEventListener('click', () => {
          payType = b.dataset.pt;
          modal.querySelectorAll('[data-pt]').forEach((x) => x.classList.toggle('active', x === b));
          modal.querySelector('#rate-hourly').classList.toggle('hidden', payType === 'daily');
          modal.querySelector('#rate-daily').classList.toggle('hidden', payType !== 'daily');
        }));
      modal.querySelector('#m-close').addEventListener('click', closeModal);
      modal.querySelector('#s-save').addEventListener('click', async () => {
        const err = modal.querySelector('#s-error');
        err.textContent = '';
        try {
          const body = {
            payType,
            hourlyRate: Number(modal.querySelector('#s-hourly').value || 0),
            dailyRate: Number(modal.querySelector('#s-daily').value || 0),
            taxPercent: Number(modal.querySelector('#s-tax').value || 0),
          };
          await api('/api/my/pay', { method: 'PUT', body });
          Object.assign(state.me, body);
          toast(t('saved'), 'success');
          closeModal();
          rerender();
        } catch (ex) { err.textContent = terr(ex); }
      });
    });
  }

  // ---------- Kalendar (ishchi) ----------
  // Bitta ish joyi tafsiloti: statistika, daromad, kalendar, sozlamalar
  async function renderWorkplace() {
    const wp = state.wp;
    if (!wp) { state.view = 'home'; return renderWorker(); }
    const { year, month } = currentMonth();
    let fullSummary, jobs, yearData;
    try {
      [fullSummary, jobs, yearData] = await Promise.all([
        api(`/api/my/summary?year=${year}&month=${month}`),
        api('/api/jobs'),
        api(`/api/my/year?year=${year}`),
      ]);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderAuth();
      toast(terr(ex), 'error');
      return;
    }
    const job = jobs.find((j) => j.id === wp.jobId) || null;
    const isTeam = wp.kind === 'team';
    const name = job ? job.name : (state.me.memberships.find((m) => m.orgId === wp.orgId)?.orgName || '');
    const summary = filterSummary(fullSummary, wp.jobId);
    const e = jobEarn(job, summary.totalMinutes, summary.daysWorked);
    const taxP = job ? job.taxPercent : state.me.taxPercent;

    // Yillik: shu ish joyi bo'yicha har oy soat va sof daromad
    const byMonth = {};
    for (const r of yearData.rows) {
      if ((r.jobId || 0) !== wp.jobId) continue;
      (byMonth[r.month] ||= { minutes: 0, days: 0 });
      byMonth[r.month].minutes += r.minutes;
      byMonth[r.month].days += r.days;
    }
    let yearMin = 0, yearNet = 0;
    const yearCells = [];
    for (let m = 1; m <= 12; m++) {
      const d = byMonth[m];
      if (!d || d.minutes === 0) continue;
      const em = jobEarn(job, d.minutes, d.days);
      yearMin += d.minutes;
      yearNet += em.net;
      yearCells.push(`<div class="year-cell"><div class="ym">${MONTHS()[m - 1].slice(0, 3)}</div><div class="yh">${fmtH(d.minutes)}</div>${em.hasRate ? `<div class="yn">${fmtMoney(em.net)}</div>` : ''}</div>`);
    }

    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(t('wpDetail'))}
        <button class="chip gray" id="back-btn">${t('back')}</button>
      </div>

      <div class="card" style="display:flex;align-items:center;gap:14px">
        <span class="avatar" style="background:${avatarColor(name)};width:54px;height:54px;font-size:19px;border-radius:18px">${isTeam ? '🍽' : esc(initials(name))}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:17px">${esc(name)}${isTeam ? ` <span class="tag-team">${t('teamTag')}</span>` : ''}</div>
          <div class="muted" style="font-size:13px">${job && job.rate > 0 ? `${fmtMoney(job.rate)}/${job.payType === 'daily' ? t('dUnit') : t('hUnit')}${taxP ? ` · −${taxP}%` : ''}` : t('salaryHint')}</div>
        </div>
        <button class="chip gray" id="wp-edit">✏️</button>
      </div>

      <div class="stat-row">
        <div class="stat"><div class="value">${fmtH(summary.totalMinutes)}</div><div class="label">${t('monthHours', MONTHS()[month - 1])}</div></div>
        <div class="stat"><div class="value">${summary.daysWorked}</div><div class="label">${t('daysWorked')}</div></div>
        ${e.hasRate ? `<div class="stat"><div class="value" style="color:var(--green)">${fmtMoney(e.net)}</div><div class="label">${t('earnedFrom')}</div></div>` : ''}
      </div>

      <div class="card">
        ${calendarHtml(summary, year, month)}
        <div class="day-detail ${state.selectedDay ? '' : 'hidden'}" id="day-detail"></div>
      </div>

      ${yearCells.length ? `
      <div class="card year-total-card">
        <div class="modal-head" style="margin-bottom:10px">
          <h2 style="margin:0">${t('yearTotal', year)}</h2>
          <span class="muted">${fmtH(yearMin)}${e.hasRate ? ` · <b style="color:var(--green)">${fmtMoney(yearNet)}</b>` : ''}</span>
        </div>
        <div class="year-grid">${yearCells.join('')}</div>
      </div>` : ''}

      ${!isTeam ? `<button class="btn outline" id="wp-move" style="margin-bottom:10px">${t('moveOld')}</button>` : ''}
      ${isTeam ? `<button class="btn ghost" id="wp-leave" style="color:var(--red)">${t('leaveTeam')} — ${esc(name)}</button>` : ''}
    `;
    document.getElementById('back-btn').addEventListener('click', () => { state.view = 'home'; state.month = null; renderWorker(); });
    document.getElementById('wp-edit').addEventListener('click', () => job && openJobModal(job));
    bindCalendarNav(renderWorker);

    const showDetail = () => {
      const det = document.getElementById('day-detail');
      if (!state.selectedDay) { det.classList.add('hidden'); return; }
      det.innerHTML = dayDetailHtml(summary, state.selectedDay);
      det.classList.remove('hidden');
      bindDayDetail(det, summary, jobs, state.selectedDay);
    };
    showDetail();
    bindCalendarCells((date) => {
      state.selectedDay = state.selectedDay === date ? null : date;
      showDetail();
      document.querySelectorAll('.cal-cell').forEach((c) => c.classList.toggle('selected', c.dataset.date === state.selectedDay));
    });

    document.getElementById('wp-move')?.addEventListener('click', async () => {
      try {
        const r = await api('/api/my/entries/assign', { method: 'POST', body: { jobId: wp.jobId } });
        toast(t('movedN', r.moved), 'success');
        renderWorker();
      } catch (ex) { toast(terr(ex), 'error'); }
    });
    document.getElementById('wp-leave')?.addEventListener('click', async () => {
      if (!confirm(t('leaveTeamConfirm', name))) return;
      try {
        await api(`/api/my/memberships/${wp.orgId}`, { method: 'DELETE' });
        state.me = await api('/api/me');
        state.view = 'home';
        renderWorker();
      } catch (ex) { toast(terr(ex), 'error'); }
    });
  }

  async function renderMyCalendar() {
    const { year, month } = currentMonth();
    let fullSummary, jobs;
    try {
      [fullSummary, jobs] = await Promise.all([
        api(`/api/my/summary?year=${year}&month=${month}`),
        api('/api/jobs'),
      ]);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderAuth();
      toast(terr(ex), 'error');
      return;
    }
    if (!jobs.some((j) => j.id === state.calJob)) state.calJob = 0;
    const summary = filterSummary(fullSummary, state.calJob);
    const jobChips = jobs.length ? `
      <div class="branch-chips">
        <button class="branch-chip ${!state.calJob ? 'active' : ''}" data-caljob="0">${t('all')}</button>
        ${jobs.map((j) => `<button class="branch-chip ${state.calJob === j.id ? 'active' : ''}" data-caljob="${j.id}">${esc(j.name)}</button>`).join('')}
      </div>` : '';

    $app.innerHTML = `
      <div class="topbar">${brandHtml(state.me.name)}${curSelHtml()}</div>
      ${jobChips}
      <div class="stat-row">
        <div class="stat"><div class="value">${fmtH(summary.totalMinutes)}</div><div class="label">${t('monthHours', MONTHS()[month - 1])}</div></div>
        <div class="stat"><div class="value">${summary.daysWorked}</div><div class="label">${t('daysWorked')}</div></div>
        <div class="stat"><div class="value" style="color:var(--green)">${fmtMoney(computeEarnings(summary, jobs).net)}</div><div class="label">${t('monthNetShort')}</div></div>
      </div>
      <div class="card">
        ${calendarHtml(summary, year, month)}
        <div class="day-detail ${state.selectedDay ? '' : 'hidden'}" id="day-detail"></div>
      </div>
      <button class="btn outline" id="copy-report">${t('copyReport')}</button>
    `;
    bindCalendarNav(renderWorker);
    bindCurSel(renderWorker);
    document.querySelectorAll('[data-caljob]').forEach((c) =>
      c.addEventListener('click', () => { state.calJob = +c.dataset.caljob; renderWorker(); }));

    const showDetail = () => {
      const det = document.getElementById('day-detail');
      if (!state.selectedDay) { det.classList.add('hidden'); return; }
      det.innerHTML = dayDetailHtml(summary, state.selectedDay);
      det.classList.remove('hidden');
      bindDayDetail(det, summary, jobs, state.selectedDay);
    };
    showDetail();

    bindCalendarCells((date) => {
      state.selectedDay = state.selectedDay === date ? null : date;
      showDetail();
      document.querySelectorAll('.cal-cell').forEach((c) => c.classList.toggle('selected', c.dataset.date === state.selectedDay));
    });

    // SMS uchun ro'yxat nusxalash
    document.getElementById('copy-report').addEventListener('click', () => {
      const lines = [t('reportTitle', MONTHS()[month - 1], year, state.me.name)];
      const dates = Object.keys(summary.days).sort();
      for (const d of dates) {
        const dd = summary.days[d];
        const sess = dd.sessions.map((x) => `${x.in}→${x.out || '...'}`).join(', ');
        lines.push(`${+d.split('-')[2]}: ${sess} (${fmtH(dd.minutes)})`);
      }
      lines.push(`${t('reportTotal')}: ${fmtH(summary.totalMinutes)} (${summary.daysWorked} ${t('dUnit')})`);
      navigator.clipboard.writeText(lines.join('\n'))
        .then(() => toast(t('copied'), 'success'))
        .catch(() => toast(t('genericError'), 'error'));
    });
  }

  // Kun tafsilotidagi shaxsiy yozuvlarni tahrirlash
  function bindDayDetail(det, summary, jobs, date) {
    const dd = summary.days[date];
    det.querySelectorAll('.s-edit').forEach((b) =>
      b.addEventListener('click', () => {
        const sess = dd.sessions.find((x) => String(x.id) === b.closest('[data-sess]').dataset.sess);
        openMyEntryModal(date, sess, jobs);
      }));
    det.querySelector('#day-add')?.addEventListener('click', () => openMyEntryModal(date, null, jobs));
  }

  function openMyEntryModal(date, sess, jobs) {
    const personalJobs = jobs.filter((j) => !j.orgId);
    const jobSel = personalJobs.length ? `
      <label>${t('jobName')}</label>
      <select id="me-job">
        <option value="">${t('personal')}</option>
        ${personalJobs.map((j) => `<option value="${j.id}" ${sess && sess.jobId === j.id ? 'selected' : ''}>${esc(j.name)}</option>`).join('')}
      </select>` : '';
    const modal = openModal(`
      <div class="modal-head"><h2 style="margin:0">${dayTitle(date)}</h2><button class="modal-close" id="m-close">✕</button></div>
      <div class="entry-edit-row" style="margin-top:4px">
        <input type="time" id="me-in" value="${sess ? sess.in : ''}">
        <span>→</span>
        <input type="time" id="me-out" value="${sess?.out || ''}">
      </div>
      ${jobSel}
      <div class="error-text" id="me-error"></div>
      <button class="btn" id="me-save">${t('save')}</button>
      ${sess ? `<button class="btn ghost" id="me-del" style="color:var(--red);margin-top:6px">🗑</button>` : ''}
    `);
    const err = modal.querySelector('#me-error');
    modal.querySelector('#m-close').addEventListener('click', closeModal);
    modal.querySelector('#me-save').addEventListener('click', async () => {
      err.textContent = '';
      try {
        const body = {
          date,
          in: modal.querySelector('#me-in').value,
          out: modal.querySelector('#me-out').value || null,
          jobId: modal.querySelector('#me-job')?.value || null,
        };
        if (sess) await api(`/api/my/entries/${sess.id}`, { method: 'PUT', body });
        else await api('/api/my/entries', { method: 'POST', body });
        toast(t('saved'), 'success');
        closeModal();
        renderWorker();
      } catch (ex) { err.textContent = terr(ex); }
    });
    modal.querySelector('#me-del')?.addEventListener('click', async () => {
      if (!confirm(t('delEntryConfirm'))) return;
      try {
        await api(`/api/my/entries/${sess.id}`, { method: 'DELETE' });
        toast(t('deleted'), 'success');
        closeModal();
        renderWorker();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  function calendarHtml(summary, year, month) {
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const today = todayStr();
    let cells = DOWS().map((d) => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < lead; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${pad(month)}-${pad(d)}`;
      const dd = summary.days[date];
      const cls = ['cal-cell'];
      if (dd?.open) cls.push('open-day');
      else if (dd && dd.minutes > 0) cls.push('worked');
      if (date === today) cls.push('today');
      if (date === state.selectedDay) cls.push('selected');
      cells += `<div class="${cls.join(' ')}" data-date="${date}">
        <div class="d">${d}</div>
        <div class="h">${dd && dd.minutes > 0 ? fmtH(dd.minutes) : ''}</div>
      </div>`;
    }
    return `
      <div class="cal-head">
        <div class="cal-title">${calTitle(year, month)}</div>
        <div class="cal-nav"><button id="cal-prev">‹</button><button id="cal-next">›</button></div>
      </div>
      <div class="cal-grid">${cells}</div>`;
  }

  function dayDetailHtml(summary, date) {
    const dd = summary.days[date] || { sessions: [], minutes: 0, open: false };
    const header = `<div class="modal-head" style="margin-bottom:4px">
      <b>${dayTitle(date)} — <span style="color:var(--green)">${fmtH(dd.minutes)}</span> ${t('hUnit')}${dd.open ? ` <span style="color:var(--amber)">(${t('ongoing')})</span>` : ''}</b>
      <button class="chip" id="day-add">＋</button>
    </div>`;
    if (!dd.sessions.length) return header + `<p class="muted">${t('noRecords')}</p>`;
    const hasOrg = dd.sessions.some((x) => x.orgId);
    return header + dd.sessions.map((x) => `
      <div class="session-row" data-sess="${x.id}">
        <span class="times">${x.in} → ${x.out || `<span style="color:var(--green)">${t('working')}</span>`}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="dur">${fmtH(x.minutes)} ${t('hUnit')}</span>
          ${x.orgId ? '<span title="🔒">🔒</span>' : '<button class="chip gray s-edit" style="padding:5px 9px">✏️</button>'}
        </span>
      </div>`).join('') +
      (hasOrg ? `<p class="muted" style="margin-top:8px;font-size:12.5px">${t('teamLocked')}</p>` : '');
  }

  function bindCalendarNav(rerender) {
    document.getElementById('cal-prev')?.addEventListener('click', () => { shiftMonth(-1); rerender(); });
    document.getElementById('cal-next')?.addEventListener('click', () => { shiftMonth(1); rerender(); });
  }
  function bindCalendarCells(onPick) {
    document.querySelectorAll('.cal-cell[data-date]').forEach((c) =>
      c.addEventListener('click', () => onPick(c.dataset.date)));
  }

  // ---------- Moliya ----------
  function nextDue(item, base = new Date()) {
    const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    if (item.dueDate) {
      const d = new Date(item.dueDate + 'T00:00:00');
      return Math.round((d - today) / 86400_000);
    }
    if (item.dueDay) {
      const y = today.getFullYear(), m = today.getMonth();
      const dim = new Date(y, m + 1, 0).getDate();
      let due = new Date(y, m, Math.min(item.dueDay, dim));
      if ((due - today) / 86400_000 < -7) {
        const dim2 = new Date(y, m + 2, 0).getDate();
        due = new Date(y, m + 1, Math.min(item.dueDay, dim2));
      }
      return Math.round((due - today) / 86400_000);
    }
    return null;
  }

  async function renderFinance() {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1;
    let items, summary, jobs;
    try {
      [items, summary, jobs] = await Promise.all([
        api('/api/finance'),
        api(`/api/my/summary?year=${year}&month=${month}`),
        api('/api/jobs'),
      ]);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderAuth();
      toast(terr(ex), 'error');
      return;
    }

    const e = computeEarnings(summary, jobs);
    // Har bir yozuvda qolgan summa = amount − to'langan
    const remOf = (i) => Math.max(0, i.amount - (i.paidAmount || 0));
    const act = items.filter((i) => i.active);
    const incomes = act.filter((i) => i.kind === 'income').reduce((a, i) => a + i.amount, 0);
    const expenses = act.filter((i) => i.kind === 'expense').reduce((a, i) => a + remOf(i), 0);
    const debtsMonth = act.filter((i) => i.kind === 'debt' &&
      (i.dueDay || (i.dueDate && i.dueDate.startsWith(`${year}-${pad(month)}`)))).reduce((a, i) => a + remOf(i), 0);
    const leftOver = e.net + incomes - expenses - debtsMonth;

    const reminders = act
      .filter((i) => i.kind !== 'income')
      .map((i) => ({ ...i, days: nextDue(i) }))
      .filter((i) => i.days !== null && i.days <= 7)
      .sort((a, b) => a.days - b.days);
    maybeNotify(reminders);

    if (!['expense', 'debt', 'income'].includes(state.finKind)) state.finKind = 'expense';
    const list = items.filter((i) => i.kind === state.finKind);

    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(state.me.name)}
        <div style="display:flex;gap:8px">
          <button class="chip gray" id="salary-gear">⚙️</button>
          <button class="chip gray" id="forecast-btn">🔮</button>
        </div>
      </div>

      <div class="card remain-card">
        <div class="sal-row"><span class="muted">${t('monthEarn')}</span><b>${fmtMoney(e.net)}</b></div>
        ${incomes ? `<div class="sal-row"><span class="muted">${t('otherIncome')}</span><b style="color:var(--green)">+${fmtMoney(incomes)}</b></div>` : ''}
        ${expenses ? `<div class="sal-row"><span class="muted">${t('monthExpenses')}</span><b style="color:var(--red)">−${fmtMoney(expenses)}</b></div>` : ''}
        ${debtsMonth ? `<div class="sal-row"><span class="muted">${t('monthDebts')}</span><b style="color:var(--red)">−${fmtMoney(debtsMonth)}</b></div>` : ''}
        <div class="sal-row net"><span>${t('leftOver')}</span><b style="color:${leftOver >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtMoney(leftOver)}</b></div>
      </div>

      ${reminders.length ? `
      <div class="card">
        ${reminders.map((r) => `
          <div class="fin-row" data-remind="${r.id}">
            <div class="info">
              <div class="name">${esc(r.title)}</div>
              <div class="sub ${r.days <= 0 ? 'urgent' : ''}">🔔 ${t('dueInDays', r.days)}${(r.paidAmount || 0) > 0 ? ` · ${t('remainingL')} ${fmtMoney(remOf(r))}` : ''}</div>
            </div>
            <b class="amt">−${fmtMoney(remOf(r))}</b>
            <button class="chip r-pay" style="padding:8px 12px">${t('payNow')}</button>
          </div>`).join('')}
      </div>` : ''}

      <div class="card">
        <div class="modal-head" style="margin-bottom:10px">
          <div class="segment" style="margin:0;flex:1">
            ${['expense', 'debt', 'income'].map((k) => `
              <button data-fk="${k}" class="${state.finKind === k ? 'active' : ''}">${{ expense: '🏠', debt: '💸', income: '💰' }[k]} ${t('kind' + k[0].toUpperCase() + k.slice(1))}</button>`).join('')}
          </div>
          <button class="chip" data-add="${state.finKind}" style="margin-left:8px">＋</button>
        </div>
        ${list.length ? list.map((i) => `
          <div class="fin-row ${i.active ? '' : 'paid'}" data-id="${i.id}">
            <div class="info">
              <div class="name">${esc(i.title)}${i.active ? '' : ` <span class="badge-inactive">${t('paidOff')}</span>`}</div>
              <div class="sub">${i.dueDay ? `📅 ${i.dueDay}` : (i.dueDate || '')}${(i.paidAmount || 0) > 0 && i.active ? ` · ${t('remainingL')} ${fmtMoney(remOf(i))}` : ''}</div>
            </div>
            <b class="amt ${state.finKind === 'income' ? 'plus' : ''}">${state.finKind === 'income' ? '+' : '−'}${fmtMoney(state.finKind === 'income' ? i.amount : remOf(i))}</b>
            <div class="actions">
              ${state.finKind !== 'income' && i.active ? `<button class="chip gray f-pay" style="padding:6px 9px">${t('payNow')}</button>` : ''}
              <button class="chip red f-del" style="padding:6px 9px">🗑</button>
            </div>
          </div>`).join('') : `<p class="muted">${t('noFinance')}</p>`}
      </div>
    `;
    bindSalaryCard(renderWorker);
    bindCurSel(renderWorker);
    document.getElementById('forecast-btn').addEventListener('click', () => { state.view = 'forecast'; renderWorker(); });
    document.querySelectorAll('[data-fk]').forEach((b) =>
      b.addEventListener('click', () => { state.finKind = b.dataset.fk; renderWorker(); }));
    document.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => openFinanceModal(b.dataset.add)));
    document.querySelectorAll('[data-remind]').forEach((row) =>
      row.querySelector('.r-pay').addEventListener('click', () =>
        openPayModal(items.find((i) => String(i.id) === row.dataset.remind), remOf)));
    document.querySelectorAll('.fin-row[data-id]').forEach((row) => {
      const id = row.dataset.id;
      const item = items.find((i) => String(i.id) === id);
      row.querySelector('.f-pay')?.addEventListener('click', () => openPayModal(item, remOf));
      row.querySelector('.f-del')?.addEventListener('click', async () => {
        if (!confirm(t('delEntryConfirm'))) return;
        try {
          await api(`/api/finance/${id}`, { method: 'DELETE' });
          renderWorker();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
    });
  }

  // Qarz/chiqim to'lash oynasi: to'liq yoki bir qismini
  function openPayModal(item, remOf) {
    const rem = remOf(item);
    const modal = openModal(`
      <div class="modal-head"><h2 style="margin:0">${esc(item.title)}</h2><button class="modal-close" id="m-close">✕</button></div>
      <p class="muted">${t('remainingL')}: <b>${fmtMoney(rem)}</b></p>
      <label>${t('payAmountL')}</label>
      <input id="pay-amt" type="number" min="0" step="any" inputmode="decimal" placeholder="${Math.round(rem * (RATES[CUR] || 1))}">
      <div class="error-text" id="pay-err"></div>
      <button class="btn" id="pay-partial" style="margin-bottom:8px">${t('payPartial')}</button>
      <button class="btn" style="background:var(--green)" id="pay-full">${t('payFull')} (${fmtMoney(rem)})</button>
    `);
    modal.querySelector('#m-close').addEventListener('click', closeModal);
    modal.querySelector('#pay-full').addEventListener('click', async () => {
      try {
        await api(`/api/finance/${item.id}/pay`, { method: 'POST', body: { full: true } });
        toast(t('saved'), 'success');
        closeModal();
        renderWorker();
      } catch (ex) { modal.querySelector('#pay-err').textContent = terr(ex); }
    });
    modal.querySelector('#pay-partial').addEventListener('click', async () => {
      const err = modal.querySelector('#pay-err');
      err.textContent = '';
      // Kiritilgan summa tanlangan valyutada — KRW ga qaytaramiz
      const inCur = Number(modal.querySelector('#pay-amt').value);
      if (!Number.isFinite(inCur) || inCur <= 0) { err.textContent = t('err').BAD_AMOUNT || 'Summa'; return; }
      const krw = inCur / (RATES[CUR] || 1);
      try {
        await api(`/api/finance/${item.id}/pay`, { method: 'POST', body: { amount: krw } });
        toast(t('saved'), 'success');
        closeModal();
        renderWorker();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  // ---------- Bildirishnomalar ----------
  const notifEnabled = () => localStorage.getItem('lalaku_notif') === '1' &&
    'Notification' in window && Notification.permission === 'granted';
  function maybeNotify(reminders) {
    if (!notifEnabled()) return;
    const today = todayStr();
    if (localStorage.getItem('lalaku_notif_last') === today) return;
    const due = reminders.filter((r) => r.days <= 0);
    if (!due.length) return;
    try {
      new Notification('LaLaKu Vaqt', {
        body: due.map((d) => `${d.title}: ${fmtMoney(d.amount)}`).join('\n'),
        icon: '/icons/icon-192.png',
      });
      localStorage.setItem('lalaku_notif_last', today);
    } catch {}
  }

  function openFinanceModal(kind) {
    const kindName = { expense: t('kindExpense'), debt: t('kindDebt'), income: t('kindIncome') }[kind];
    const modal = openModal(`
      <div class="modal-head"><h2 style="margin:0">${kindName}</h2><button class="modal-close" id="m-close">✕</button></div>
      <label>${t('itemTitle')}</label>
      <input id="f-title" placeholder="${t('itemTitlePh')}">
      <label>${t('amount')}</label>
      <input id="f-amount" type="number" min="0" step="any" inputmode="decimal">
      <div class="form-row">
        <div><label>${t('everyMonthDay')}</label><input id="f-day" type="number" min="1" max="31" inputmode="numeric"></div>
        ${kind === 'debt' ? `<div><label>${t('onceDate')}</label><input id="f-date" type="date"></div>` : ''}
      </div>
      <div class="error-text" id="f-error"></div>
      <button class="btn" id="f-save">${t('addItem')}</button>
    `);
    modal.querySelector('#m-close').addEventListener('click', closeModal);
    modal.querySelector('#f-save').addEventListener('click', async () => {
      const err = modal.querySelector('#f-error');
      err.textContent = '';
      try {
        await api('/api/finance', {
          method: 'POST',
          body: {
            kind,
            title: modal.querySelector('#f-title').value,
            amount: modal.querySelector('#f-amount').value,
            dueDay: modal.querySelector('#f-day').value || null,
            dueDate: modal.querySelector('#f-date')?.value || null,
          },
        });
        toast(t('added'), 'success');
        closeModal();
        renderWorker();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  // ---------- Prognoz ----------
  async function renderForecast() {
    let items = [], jobs = [];
    try { [items, jobs] = await Promise.all([api('/api/finance'), api('/api/jobs')]); } catch {}
    const expenses = items.filter((i) => i.active && i.kind === 'expense').reduce((a, i) => a + (i.amount - (i.paidAmount || 0)), 0);
    const me = state.me;
    // Stavkani real ish joyidan olamiz (bo'lmasa profil)
    const rj = jobs.find((j) => j.payType !== 'daily' && j.rate > 0);
    const dj = jobs.find((j) => j.payType === 'daily' && j.rate > 0);
    const defHourly = rj ? rj.rate : (me.hourlyRate || '');
    const defDaily = dj ? dj.rate : (me.dailyRate || '');

    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(t('forecast').replace('🔮 ', ''))}
        <button class="chip gray" id="back-btn">${t('back')}</button>
      </div>
      <div class="card">
        <h2>${t('forecast')}</h2>
        <p class="muted">${t('forecastNote')}</p>
        <label>${t('payType')}</label>
        <div class="segment">
          <button type="button" data-pt="hourly" class="${me.payType !== 'daily' ? 'active' : ''}">${t('payHourly')}</button>
          <button type="button" data-pt="daily" class="${me.payType === 'daily' ? 'active' : ''}">${t('payDaily')}</button>
        </div>
        <div class="form-row">
          <div><label>${t('fDays')}</label><input id="fc-days" type="number" min="0" max="31" inputmode="numeric" value="22"></div>
          <div id="fc-hours-wrap" class="${me.payType === 'daily' ? 'hidden' : ''}"><label>${t('fHours')}</label><input id="fc-hours" type="number" min="0" max="24" step="any" inputmode="decimal" value="8"></div>
        </div>
        <div class="form-row">
          <div id="fc-rate-wrap"><label id="fc-rate-label">${me.payType === 'daily' ? t('dailyRate') : t('hourlyRate')}</label>
            <input id="fc-rate" type="number" min="0" step="any" inputmode="decimal" value="${me.payType === 'daily' ? defDaily : defHourly}"></div>
          <div><label>${t('taxPercent')}</label><input id="fc-tax" type="number" min="0" max="100" step="any" inputmode="decimal" value="${me.taxPercent || 0}"></div>
        </div>
      </div>
      <div class="card remain-card">
        <h2>${t('fResult')}</h2>
        <div class="sal-row"><span class="muted">${t('fGross')}</span><b id="fc-gross">—</b></div>
        <div class="sal-row"><span class="muted" id="fc-tax-label"></span><b id="fc-taxv" style="color:var(--red)">—</b></div>
        <div class="sal-row"><span class="muted">${t('fNet')}</span><b id="fc-net" style="color:var(--green)">—</b></div>
        ${expenses ? `<div class="sal-row"><span class="muted">${t('monthExpenses')}</span><b style="color:var(--red)">−${fmtMoney(expenses)}</b></div>
        <div class="sal-row net"><span>${t('fMinusExp')}</span><b id="fc-left" style="color:var(--green)">—</b></div>` : ''}
      </div>
    `;
    document.getElementById('back-btn').addEventListener('click', () => { state.view = 'home'; renderWorker(); });

    let payType = me.payType;
    const recompute = () => {
      const days = Number(document.getElementById('fc-days').value || 0);
      const hours = Number(document.getElementById('fc-hours')?.value || 0);
      const rate = Number(document.getElementById('fc-rate').value || 0);
      const tax = Number(document.getElementById('fc-tax').value || 0);
      const gross = payType === 'daily' ? days * rate : days * hours * rate;
      const taxAmt = gross * tax / 100;
      const net = gross - taxAmt;
      document.getElementById('fc-gross').textContent = fmtMoney(gross);
      document.getElementById('fc-tax-label').textContent = t('taxLabel', tax);
      document.getElementById('fc-taxv').textContent = '−' + fmtMoney(taxAmt);
      document.getElementById('fc-net').textContent = fmtMoney(net);
      const left = document.getElementById('fc-left');
      if (left) left.textContent = fmtMoney(net - expenses);
    };
    document.querySelectorAll('[data-pt]').forEach((b) =>
      b.addEventListener('click', () => {
        payType = b.dataset.pt;
        document.querySelectorAll('[data-pt]').forEach((x) => x.classList.toggle('active', x === b));
        document.getElementById('fc-hours-wrap').classList.toggle('hidden', payType === 'daily');
        document.getElementById('fc-rate-label').textContent = payType === 'daily' ? t('dailyRate') : t('hourlyRate');
        document.getElementById('fc-rate').value = payType === 'daily' ? defDaily : defHourly;
        recompute();
      }));
    ['fc-days', 'fc-hours', 'fc-rate', 'fc-tax'].forEach((id) =>
      document.getElementById(id)?.addEventListener('input', recompute));
    recompute();
  }

  // ---------- Profil (ishchi) ----------
  // Akkauntlar kartasi (Telegram kabi almashish)
  function accountsCardHtml() {
    const accounts = getAccounts();
    const activeIdx = +localStorage.getItem('lalaku_active') || 0;
    return `
      <div class="card">
        <div class="modal-head" style="margin-bottom:6px"><h2 style="margin:0">${t('accounts')}</h2>
          <button class="chip" id="acc-add">＋</button></div>
        ${accounts.map((a, i) => `
          <div class="fin-row acc-row" data-acci="${i}" style="cursor:pointer">
            <span class="avatar" style="background:${avatarColor(a.name)};width:38px;height:38px;font-size:13px">${a.type === 'business' ? '🍽' : esc(initials(a.name))}</span>
            <div class="info">
              <div class="name">${esc(a.name)}</div>
              <div class="sub">${esc(a.email)}</div>
            </div>
            ${i === activeIdx ? `<span class="tag-live">${t('activeAcc')}</span>` : `<button class="chip acc-switch">${t('switchTo')}</button>`}
          </div>`).join('')}
      </div>`;
  }
  function bindAccountsCard() {
    document.getElementById('acc-add')?.addEventListener('click', () => {
      state.addingAccount = true;
      renderAuth('signup');
    });
    document.querySelectorAll('.acc-row').forEach((row) =>
      row.addEventListener('click', () => {
        const i = +row.dataset.acci;
        if (i === (+localStorage.getItem('lalaku_active') || 0)) return;
        localStorage.setItem('lalaku_active', String(i));
        location.reload();
      }));
  }

  function openAccInfoModal(rerender) {
    const me = state.me;
    const tzOpts = TIMEZONES.map(([tz, label]) =>
      `<option value="${tz}" ${tz === me.timezone ? 'selected' : ''}>${label}</option>`).join('');
    const modal = openModal(`
      <div class="modal-head"><h2 style="margin:0">${t('accInfoRow')}</h2><button class="modal-close" id="m-close">✕</button></div>
      <label>${t('yourName')}</label><input id="p-name" value="${esc(me.name)}">
      <label>${t('email')}</label><input id="p-email" type="email" value="${esc(me.email)}">
      <label>${t('phone')}</label><input id="p-phone" type="tel" value="${esc(me.phone || '')}" placeholder="010-1234-5678">
      <label>${t('changePassword')}</label><input id="p-pw" type="password" autocomplete="new-password">
      <label>${t('timezone')}</label><select id="p-tz">${tzOpts}</select>
      <div class="error-text" id="p-error"></div>
      <button class="btn" id="p-save">${t('save')}</button>
    `);
    modal.querySelector('#m-close').addEventListener('click', closeModal);
    modal.querySelector('#p-save').addEventListener('click', async () => {
      const err = modal.querySelector('#p-error');
      err.textContent = '';
      try {
        await api('/api/profile', {
          method: 'PUT',
          body: {
            name: modal.querySelector('#p-name').value,
            email: modal.querySelector('#p-email').value,
            phone: modal.querySelector('#p-phone').value,
            password: modal.querySelector('#p-pw').value || undefined,
            timezone: modal.querySelector('#p-tz').value,
          },
        });
        state.me = await api('/api/me');
        upsertAccount(state.me);
        toast(t('saved'), 'success');
        closeModal();
        rerender();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  async function renderProfile() {
    const me = state.me;
    let jobs = [];
    try { jobs = await api('/api/jobs'); } catch {}
    const notifOn = localStorage.getItem('lalaku_notif') === '1';
    // Asosiy soatlik ish haqi (boshliq belgilagan yoki o'zi qo'ygan)
    const rateJob = jobs.find((j) => j.rate > 0);

    $app.innerHTML = `
      <div class="topbar">${brandHtml('')}${langSelHtml()}</div>

      <div class="card profile-head">
        <span class="avatar" style="background:${avatarColor(me.name)};width:64px;height:64px;font-size:23px;border-radius:22px">${esc(initials(me.name))}</span>
        <div class="ph-name">${esc(me.name)}</div>
        <div class="ph-email">${esc(me.email)}</div>
        ${rateJob ? `<div style="font-weight:800;font-size:15px;margin-top:8px;color:var(--green)">${t('hourlyRate').replace(' (₩)', '')}: ${fmtMoney(rateJob.rate)}/${rateJob.payType === 'daily' ? t('dUnit') : t('hUnit')}</div>` : ''}
        <div class="ph-badges">
          <button class="chip" id="id-copy" title="${t('idNote')}">ID <b>#${me.id}</b> ⧉</button>
          <span class="chip ${me.active ? 'gray' : 'red'}">${me.active ? t(me.daysLeft > 7 ? 'paidLeft' : 'trialLeft', me.daysLeft) : t('subExpired')}</span>
        </div>
      </div>

      ${accountsCardHtml()}

      <div class="card">
        <div class="modal-head" style="margin-bottom:6px"><h2 style="margin:0">${t('myJobs')}</h2><button class="chip" id="job-add">＋</button></div>
        ${jobs.length ? jobs.map((j) => `
          <div class="fin-row" data-job-row="${j.id}">
            <div class="info">
              <div class="name">${esc(j.name)}${j.orgId ? ` <span class="tag-team">${t('teamTag')}</span>` : ''}</div>
              <div class="sub">${j.payType === 'daily' ? t('payDaily') : t('payHourly')} · ${fmtMoney(j.rate)}${j.taxPercent ? ` · −${j.taxPercent}%` : ''}</div>
            </div>
            <div class="actions">
              <button class="chip gray j-edit">✏️</button>
              ${j.orgId ? '' : '<button class="chip red j-del">🗑</button>'}
            </div>
          </div>`).join('') : `<p class="muted">${t('jobsNote')}</p>`}
      </div>

      <div class="card">
        <h2>${t('settingsT')}</h2>
        <div class="set-row" id="set-accinfo">
          <span>${t('accInfoRow')}</span><span class="muted">›</span>
        </div>
        <div class="set-row">
          <span>${t('currency')}</span>
          <select id="cur-sel" class="lang-sel" style="max-width:150px">
            ${Object.keys(CURRENCIES).map((c) => `<option value="${c}" ${c === CUR ? 'selected' : ''}>${c} ${CURRENCIES[c]}</option>`).join('')}
          </select>
        </div>
        <div class="set-row">
          <span>${t('notifRow')}</span>
          <button class="chip ${notifOn ? '' : 'gray'}" id="notif-toggle">${notifOn ? t('notifOn') : t('notifOff')}</button>
        </div>
        <div class="set-row" style="display:block">
          <div style="margin-bottom:10px">${t('theme')}</div>
          <div class="theme-row">
            ${THEMES.map((th) => `
              <button class="theme-chip ${th === THEME ? 'active' : ''}" data-theme-pick="${th}">
                <span class="dot dot-${th}"></span>${t('theme' + th[0].toUpperCase() + th.slice(1))}
              </button>`).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>${t('subscription')}</h2>
        <div id="pay-area">${me.active && !me.pendingPayment ? `<button class="btn outline" id="show-pay">${t('payTitle')}</button>` : payCardHtml()}</div>
      </div>

      <button class="btn ghost" id="logout-btn" style="color:var(--red)">${t('logout')}</button>
    `;
    bindLangSel();
    bindPayCard(renderWorker);
    bindThemePicker(renderWorker);
    bindAccountsCard();
    document.getElementById('id-copy').addEventListener('click', () =>
      navigator.clipboard.writeText('#' + me.id).then(() => toast(t('copied'), 'success')));
    document.getElementById('set-accinfo').addEventListener('click', () => openAccInfoModal(renderWorker));
    document.getElementById('cur-sel').addEventListener('change', async (e) => {
      CUR = e.target.value;
      localStorage.setItem('lalaku_cur', CUR);
      await loadRates();
      renderWorker();
    });
    document.getElementById('notif-toggle').addEventListener('click', async () => {
      if (localStorage.getItem('lalaku_notif') === '1') {
        localStorage.setItem('lalaku_notif', '0');
      } else {
        if (!('Notification' in window)) return toast(t('notifDenied'), 'error');
        const p = await Notification.requestPermission();
        if (p !== 'granted') return toast(t('notifDenied'), 'error');
        localStorage.setItem('lalaku_notif', '1');
      }
      renderWorker();
    });
    document.getElementById('show-pay')?.addEventListener('click', () => {
      document.getElementById('pay-area').innerHTML = payCardHtml();
      bindPayCard(renderWorker);
    });
    document.getElementById('job-add').addEventListener('click', () => openJobModal(null));
    document.querySelectorAll('[data-job-row]').forEach((row) => {
      const job = jobs.find((j) => String(j.id) === row.dataset.jobRow);
      row.querySelector('.j-edit').addEventListener('click', () => openJobModal(job));
      row.querySelector('.j-del')?.addEventListener('click', async () => {
        if (!confirm(t('delEntryConfirm'))) return;
        try {
          await api(`/api/jobs/${job.id}`, { method: 'DELETE' });
          renderWorker();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
    });
    document.getElementById('logout-btn').addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch {}
      removeActiveAccount();
      state.me = null;
      if (getAccounts().length) location.reload();
      else renderAuth();
    });
  }

  // Ish joyi qo'shish/tahrirlash oynasi
  function openJobModal(job) {
    let payType = job?.payType || 'hourly';
    const modal = openModal(`
      <div class="modal-head"><h2 style="margin:0">${job ? esc(job.name) : t('addJob')}</h2><button class="modal-close" id="m-close">✕</button></div>
      <label>${t('jobName')}</label>
      <input id="j-name" value="${job ? esc(job.name) : ''}" placeholder="${t('jobNamePh')}">
      <label>${t('payType')}</label>
      <div class="segment" style="margin-bottom:4px">
        <button type="button" data-pt="hourly" class="${payType !== 'daily' ? 'active' : ''}">${t('payHourly')}</button>
        <button type="button" data-pt="daily" class="${payType === 'daily' ? 'active' : ''}">${t('payDaily')}</button>
      </div>
      <label>${t('rateLabel')}</label>
      <input id="j-rate" type="number" min="0" step="any" inputmode="decimal" value="${job?.rate || ''}" placeholder="10030">
      <label>${t('taxPercent')}</label>
      <input id="j-tax" type="number" min="0" max="100" step="any" inputmode="decimal" value="${job?.taxPercent || ''}" placeholder="3.3">
      <div class="error-text" id="j-error"></div>
      <button class="btn" id="j-save">${t('save')}</button>
    `);
    modal.querySelector('#m-close').addEventListener('click', closeModal);
    modal.querySelectorAll('[data-pt]').forEach((b) =>
      b.addEventListener('click', () => {
        payType = b.dataset.pt;
        modal.querySelectorAll('[data-pt]').forEach((x) => x.classList.toggle('active', x === b));
      }));
    modal.querySelector('#j-save').addEventListener('click', async () => {
      const err = modal.querySelector('#j-error');
      err.textContent = '';
      try {
        const body = {
          name: modal.querySelector('#j-name').value,
          payType,
          rate: Number(modal.querySelector('#j-rate').value || 0),
          taxPercent: Number(modal.querySelector('#j-tax').value || 0),
        };
        if (job) await api(`/api/jobs/${job.id}`, { method: 'PUT', body });
        else await api('/api/jobs', { method: 'POST', body });
        toast(t('saved'), 'success');
        closeModal();
        renderWorker();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  // ================================================================
  //  BIZNES (oshxona)
  // ================================================================
  function showBizNav(active) {
    $nav.classList.remove('hidden');
    const items = [
      ['board', ICONS.home, t('tabBoard').replace('📊 ', '')],
      ['calendar', ICONS.calendar, t('navCalendar')],
      ['team', ICONS.board, t('tabTeam').replace('👥 ', '')],
      ['profile', ICONS.user, t('navProfile')],
    ];
    $nav.innerHTML = items.map(([v, ic, label]) =>
      `<button data-v="${v}" class="${active === v ? 'active' : ''}">${ic}<span>${label}</span></button>`).join('');
    $nav.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => { state.bizTab = b.dataset.v; renderBusiness(); }));
  }

  async function renderBusiness() {
    stopTimers();
    $app.className = '';
    const me = state.me;
    showBizNav(state.bizTab === 'qr' ? 'team' : state.bizTab);
    $app.innerHTML = `
      <div class="topbar">${brandHtml(me.org?.name || me.name)}${state.bizTab === 'profile' ? langSelHtml() : ''}</div>
      ${state.offline ? `<div class="sub-banner warn">${t('offlineTag')}</div>` : ''}
      ${subBannerHtml()}
      <div id="tab-content"><div class="loading-screen" style="padding-top:80px"><div class="spinner"></div></div></div>
    `;
    bindLangSel();

    const box = document.getElementById('tab-content');
    try {
      if (state.bizTab === 'board') await bizBoardTab(box);
      else if (state.bizTab === 'calendar') await bizCalendarTab(box);
      else if (state.bizTab === 'team') await bizTeamTab(box);
      else if (state.bizTab === 'qr') await bizQrTab(box);
      else await bizProfileTab(box);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderAuth();
      box.innerHTML = `<div class="card"><p class="error-text">${esc(terr(ex))}</p></div>`;
    }
  }

  async function bizBoardTab(box) {
    const data = await api('/api/org/board');
    const atWork = data.workers.filter((w) => w.status === 'in').length;
    box.innerHTML = `
      <div class="board-date">${dayTitle(data.date)} · ${data.time} · <b style="color:var(--green)">${t('atWorkCount', atWork)}</b></div>
      ${data.workers.length ? data.workers.map((w) => `
        <div class="board-row ${w.status === 'in' ? 'working' : ''}" style="max-width:600px">
          <span class="avatar" style="background:${avatarColor(w.name)}">${esc(initials(w.name))}</span>
          <div class="info">
            <div class="name">${esc(w.name)}</div>
            <div class="meta">
              ${w.status === 'in' ? `<span class="status-tag in"><span class="pulse-dot"></span>${t('inTag')}</span> ${t('sinceTime', w.since)}`
                : w.status === 'out' ? `<span class="status-tag out">${t('leftTag')}</span> ${t('arrivedTime', w.since)}`
                : `<span class="status-tag none">${t('absentTag')}</span>`}
            </div>
          </div>
          <div class="hours">
            <div class="v">${fmtH(w.minutes)}</div>
            <div class="l">${w.earned != null ? `<span style="color:var(--green);font-weight:800">${fmtMoney(w.earned)}</span>` : t('hToday')}</div>
          </div>
        </div>`).join('') : `<div class="card" style="max-width:600px"><p class="muted">${t('noMembers')}</p></div>`}
    `;
  }

  async function bizCalendarTab(box) {
    const { year, month } = currentMonth();
    const mode = state.bizCalMode === 'schedule' ? 'schedule' : 'worked';
    const [data, sched] = await Promise.all([
      api(`/api/org/summary?year=${year}&month=${month}`),
      api(`/api/org/schedule?year=${year}&month=${month}`),
    ]);
    const daysInMonth = new Date(year, month, 0).getDate();
    // Rejalarni user_id+sana bo'yicha indekslash
    const schedMap = {};
    for (const s of sched.schedules) schedMap[`${s.userId}_${s.date}`] = s;

    const headCells = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      headCells.push(`<th class="${dow === 0 || dow === 6 ? 'wknd' : ''}">${d}<br><span style="font-weight:700;opacity:.75">${DOWS()[(dow + 6) % 7]}</span></th>`);
    }
    const rows = data.workers.map((w) => {
      let cells = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${pad(month)}-${pad(d)}`;
        if (mode === 'schedule') {
          const sc = schedMap[`${w.id}_${date}`];
          cells += `<td class="day-cell ${sc ? 'has' : ''}" data-worker="${w.id}" data-date="${date}" data-name="${esc(w.name)}">${sc ? `${sc.start}<br>${sc.end}` : '·'}</td>`;
        } else {
          const dd = w.days[date];
          const cls = dd ? (dd.open ? 'day-cell open' : 'day-cell has') : 'day-cell';
          cells += `<td class="${cls}" data-worker="${w.id}" data-date="${date}" data-name="${esc(w.name)}">${dd ? fmtH(dd.minutes) : '·'}</td>`;
        }
      }
      const totalCell = mode === 'schedule' ? '' :
        `<td class="total-col">${fmtH(w.totalMinutes)}${w.earned != null ? `<br><span style="font-size:11px">${fmtMoney(w.earned)}</span>` : ''}</td>`;
      return `<tr>
        <td class="name-col" data-worker="${w.id}" data-name="${esc(w.name)}">${esc(w.name)}</td>
        ${cells}${totalCell}</tr>`;
    }).join('');
    const grandTotal = data.workers.reduce((a, w) => a + w.totalMinutes, 0);

    // Ishchilar ro'yxati (jami soat + daromad) — umumiy ko'rinish
    const rosterHtml = data.workers.length ? `
      <div class="card">
        <div class="modal-head" style="margin-bottom:8px"><h2 style="margin:0">${t('rosterTitle')}</h2>
          <span class="muted"><b style="color:var(--accent)">${fmtH(grandTotal)}</b> ${t('hUnit')}</span></div>
        ${data.workers.map((w) => `
          <div class="fin-row" data-roster="${w.id}" data-name="${esc(w.name)}" style="cursor:pointer">
            <span class="avatar" style="background:${avatarColor(w.name)};width:38px;height:38px;font-size:13px">${esc(initials(w.name))}</span>
            <div class="info"><div class="name">${esc(w.name)}</div>
              <div class="sub">${fmtH(w.totalMinutes)} ${t('hUnit')}${w.days && Object.keys(w.days).length ? ` · ${Object.keys(w.days).length} ${t('dUnit')}` : ''}</div></div>
            ${w.earned != null ? `<b style="color:var(--green)">${fmtMoney(w.earned)}</b>` : ''}
          </div>`).join('')}
      </div>` : '';

    box.innerHTML = `
      <div class="cal-toggle">
        <button class="tab ${mode === 'worked' ? 'active' : ''}" data-bcm="worked">${t('modeWorked')}</button>
        <button class="tab ${mode === 'schedule' ? 'active' : ''}" data-bcm="schedule">${t('modeSchedule')}</button>
      </div>
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:16px 18px">
        <div class="cal-title">${calTitle(year, month)}</div>
        <div class="cal-nav"><button id="cal-prev">‹</button><button id="cal-next">›</button></div>
      </div>
      ${data.workers.length ? `
      <div class="table-wrap">
        <table class="summary">
          <thead><tr><th class="name-col">${t('workerCol')}</th>${headCells.join('')}${mode === 'worked' ? `<th class="total-col">${t('totalCol')}</th>` : ''}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted" style="margin:10px 4px 14px">${mode === 'schedule' ? t('noSchedule') : t('tableHint')}</p>
      ` : `<div class="card"><p class="muted">${t('noMembers')}</p></div>`}
      ${mode === 'worked' ? rosterHtml : ''}
    `;
    bindCalendarNav(renderBusiness);
    box.querySelectorAll('[data-bcm]').forEach((b) =>
      b.addEventListener('click', () => { state.bizCalMode = b.dataset.bcm; renderBusiness(); }));
    const openCell = (td) => mode === 'schedule'
      ? openScheduleModal(+td.dataset.worker, td.dataset.name, td.dataset.date, schedMap[`${td.dataset.worker}_${td.dataset.date}`])
      : openOrgDayModal(+td.dataset.worker, td.dataset.name, td.dataset.date);
    box.querySelectorAll('td.day-cell').forEach((td) => td.addEventListener('click', () => openCell(td)));
    box.querySelectorAll('td.name-col').forEach((td) =>
      td.addEventListener('click', () => mode === 'schedule'
        ? openScheduleModal(+td.dataset.worker, td.dataset.name, todayStr(), schedMap[`${td.dataset.worker}_${todayStr()}`])
        : openOrgDayModal(+td.dataset.worker, td.dataset.name, todayStr())));
    box.querySelectorAll('[data-roster]').forEach((r) =>
      r.addEventListener('click', () => openOrgDayModal(+r.dataset.roster, r.dataset.name, todayStr())));
  }

  // Smena rejalash oynasi
  function openScheduleModal(userId, name, date, existing) {
    const modal = openModal(`
      <div class="modal-head"><h2 style="margin:0">${esc(name)} — ${dayTitle(date)}</h2><button class="modal-close" id="m-close">✕</button></div>
      <b style="font-size:14px">${t('planShift')}</b>
      <div class="entry-edit-row" style="margin-top:8px">
        <div style="flex:1"><label style="margin-top:0">${t('shiftStart')}</label><input type="time" id="sc-start" value="${existing ? existing.start : '09:00'}"></div>
        <div style="flex:1"><label style="margin-top:0">${t('shiftEnd')}</label><input type="time" id="sc-end" value="${existing ? existing.end : '18:00'}"></div>
      </div>
      <label>${t('shiftNote')}</label>
      <input id="sc-note" value="${existing?.note ? esc(existing.note) : ''}" placeholder="...">
      <div class="error-text" id="sc-error"></div>
      <button class="btn" id="sc-save">${t('save')}</button>
      ${existing ? `<button class="btn ghost" id="sc-del" style="color:var(--red);margin-top:6px">🗑</button>` : ''}
    `);
    const err = modal.querySelector('#sc-error');
    modal.querySelector('#m-close').addEventListener('click', closeModal);
    modal.querySelector('#sc-save').addEventListener('click', async () => {
      err.textContent = '';
      try {
        await api('/api/org/schedule', {
          method: 'POST',
          body: { userId, date, start: modal.querySelector('#sc-start').value, end: modal.querySelector('#sc-end').value, note: modal.querySelector('#sc-note').value || null },
        });
        toast(t('saved'), 'success');
        closeModal();
        renderBusiness();
      } catch (ex) { err.textContent = terr(ex); }
    });
    modal.querySelector('#sc-del')?.addEventListener('click', async () => {
      try {
        await api(`/api/org/schedule/${existing.id}`, { method: 'DELETE' });
        toast(t('deleted'), 'success');
        closeModal();
        renderBusiness();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  async function openOrgDayModal(userId, name, date) {
    const [y, m] = date.split('-').map(Number);
    const data = await api(`/api/org/member/${userId}/summary?year=${y}&month=${m}`);
    const dd = data.days[date] || { sessions: [], minutes: 0, open: false };
    const modal = openModal(`
      <div class="modal-head">
        <h2 style="margin:0">${esc(name)} — ${dayTitle(date)}</h2>
        <button class="modal-close" id="m-close">✕</button>
      </div>
      <p class="muted">${t('dayTotal')}: <b style="color:var(--green)">${fmtH(dd.minutes)}</b> ${t('hUnit')}${dd.open ? ` <span style="color:var(--amber)">(${t('nowWorking')})</span>` : ''}</p>
      <div>
        ${dd.sessions.map((s) => `
          <div class="entry-edit-row" data-entry="${s.id}">
            <input type="time" class="e-in" value="${s.in}">
            <span>→</span>
            <input type="time" class="e-out" value="${s.out || ''}">
            <button class="chip e-save">💾</button>
            <button class="chip red e-del">🗑</button>
          </div>`).join('') || `<p class="muted" style="padding:8px 0">${t('noRecords')}</p>`}
      </div>
      <div style="border-top:1.5px solid var(--line);margin-top:16px;padding-top:14px">
        <b style="font-size:14px">${t('manualAdd')}</b>
        <div class="entry-edit-row">
          <input type="time" id="new-in"><span>→</span><input type="time" id="new-out">
          <button class="chip" id="new-add">${t('add')}</button>
        </div>
      </div>
      <div class="error-text" id="m-error"></div>
    `);
    const err = modal.querySelector('#m-error');
    const refresh = () => { closeModal(); renderBusiness(); };
    modal.querySelector('#m-close').addEventListener('click', closeModal);
    modal.querySelectorAll('.entry-edit-row[data-entry]').forEach((row) => {
      const id = row.dataset.entry;
      row.querySelector('.e-save').addEventListener('click', async () => {
        err.textContent = '';
        try {
          await api(`/api/org/entries/${id}`, { method: 'PUT', body: { in: row.querySelector('.e-in').value, out: row.querySelector('.e-out').value || null } });
          toast(t('saved'), 'success');
          refresh();
        } catch (ex) { err.textContent = terr(ex); }
      });
      row.querySelector('.e-del').addEventListener('click', async () => {
        if (!confirm(t('delEntryConfirm'))) return;
        try {
          await api(`/api/org/entries/${id}`, { method: 'DELETE' });
          toast(t('deleted'), 'success');
          refresh();
        } catch (ex) { err.textContent = terr(ex); }
      });
    });
    modal.querySelector('#new-add').addEventListener('click', async () => {
      err.textContent = '';
      try {
        await api('/api/org/entries', {
          method: 'POST',
          body: { userId, date, in: modal.querySelector('#new-in').value, out: modal.querySelector('#new-out').value || null },
        });
        toast(t('added'), 'success');
        refresh();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  async function bizTeamTab(box) {
    const org = await api('/api/org');
    const inviteUrl = `${location.origin}/join/${org.inviteToken}`;
    box.innerHTML = `
      <div class="card" style="max-width:600px">
        <h2>${t('inviteTitle')}</h2>
        <p class="muted">${t('linkAlt')} ${t('inviteNote')}</p>
        <div class="invite-box" id="invite-url">${esc(inviteUrl)}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn outline" id="invite-copy">${t('inviteCopy')}</button>
          <button class="chip red" id="invite-rotate" style="padding:12px 16px">${t('inviteRotate')}</button>
        </div>
      </div>
      <button class="btn outline" id="go-qr" style="max-width:600px;margin-bottom:14px">${t('tabQr')}</button>
      <div class="card" style="max-width:600px">
        <h2>${t('inviteById')}</h2>
        <p class="muted">${t('inviteByIdNote')}</p>
        <form id="inv-form">
          <div class="form-row" style="margin-top:10px">
            <input id="inv-q" placeholder="${t('idPh')}">
            <button class="btn" type="submit" style="flex:0 0 auto;width:auto;padding:14px 20px">${t('sendInvite')}</button>
          </div>
          <div class="error-text" id="inv-error"></div>
        </form>
        ${org.pendingInvites.length ? org.pendingInvites.map((i) => `
          <div class="fin-row" data-inv="${i.id}">
            <div class="info">
              <div class="name">${esc(i.name)} <span class="badge-inactive" style="background:var(--amber-soft);color:var(--amber)">${t('pendingTag')}</span></div>
              <div class="sub">${esc(i.email)}</div>
            </div>
            <button class="chip red inv-cancel">✕</button>
          </div>`).join('') : ''}
      </div>
      <div class="card" style="max-width:600px">
        <h2>${t('checkModeTitle')}</h2>
        <div class="segment" style="margin-bottom:8px">
          <button data-cm="qr" class="${org.checkMode !== 'button' ? 'active' : ''}">${t('modeQr')}</button>
          <button data-cm="button" class="${org.checkMode === 'button' ? 'active' : ''}">${t('modeButton')}</button>
        </div>
        <p class="muted" style="font-size:13px">${t('modeNote')}</p>
      </div>
      <div class="card" style="max-width:600px">
        <h2>${t('members', org.members.length)}</h2>
        ${org.members.length ? org.members.map((m) => `
          <div class="worker-admin-row" data-id="${m.id}">
            <span class="avatar" style="background:${avatarColor(m.name)}">${esc(initials(m.name))}</span>
            <div class="info">
              <div class="name">${esc(m.name)}</div>
              <div class="sub">${esc(m.email)}${m.hourlyRate > 0 ? ` · ${fmtMoney(m.hourlyRate)}/${t('hUnit')}` : ''}</div>
            </div>
            <div class="actions">
              <button class="chip m-rate">${t('memberRate')}</button>
              <button class="chip red m-remove">${t('removeMember')}</button>
            </div>
          </div>`).join('') : `<p class="muted">${t('noMembers')}</p>`}
      </div>
    `;
    document.getElementById('go-qr').addEventListener('click', () => { state.bizTab = 'qr'; renderBusiness(); });
    document.getElementById('invite-copy').addEventListener('click', () =>
      navigator.clipboard.writeText(inviteUrl).then(() => toast(t('copied'), 'success')));
    document.getElementById('inv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('inv-error');
      err.textContent = '';
      try {
        await api('/api/org/invites', { method: 'POST', body: { query: document.getElementById('inv-q').value } });
        toast(t('inviteSent'), 'success');
        renderBusiness();
      } catch (ex) { err.textContent = terr(ex); }
    });
    box.querySelectorAll('[data-inv] .inv-cancel').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await api(`/api/org/invites/${b.closest('[data-inv]').dataset.inv}`, { method: 'DELETE' });
          renderBusiness();
        } catch (ex) { toast(terr(ex), 'error'); }
      }));
    document.getElementById('invite-rotate').addEventListener('click', async () => {
      if (!confirm(t('inviteRotateConfirm'))) return;
      await api('/api/org/invite/rotate', { method: 'POST' });
      renderBusiness();
    });
    box.querySelectorAll('[data-cm]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await api('/api/org', { method: 'PUT', body: { checkMode: b.dataset.cm } });
          toast(t('saved'), 'success');
          renderBusiness();
        } catch (ex) { toast(terr(ex), 'error'); }
      }));
    box.querySelectorAll('.worker-admin-row').forEach((row) => {
      const m = org.members.find((x) => String(x.id) === row.dataset.id);
      row.querySelector('.m-rate').addEventListener('click', () => {
        const modal = openModal(`
          <div class="modal-head"><h2 style="margin:0">${t('memberRateTitle', esc(m.name))}</h2><button class="modal-close" id="m-close">✕</button></div>
          <label>${t('hourlyRate')}</label>
          <input id="mr-rate" type="number" min="0" step="any" inputmode="decimal" value="${m.hourlyRate || ''}" placeholder="10030">
          <label>${t('taxPercent')}</label>
          <input id="mr-tax" type="number" min="0" max="100" step="any" inputmode="decimal" value="${m.taxPercent || ''}" placeholder="3.3">
          <div class="error-text" id="mr-error"></div>
          <button class="btn" id="mr-save">${t('save')}</button>
        `);
        modal.querySelector('#m-close').addEventListener('click', closeModal);
        modal.querySelector('#mr-save').addEventListener('click', async () => {
          const err = modal.querySelector('#mr-error');
          err.textContent = '';
          try {
            await api(`/api/org/members/${m.id}`, {
              method: 'PUT',
              body: {
                hourlyRate: Number(modal.querySelector('#mr-rate').value || 0),
                taxPercent: Number(modal.querySelector('#mr-tax').value || 0),
              },
            });
            toast(t('saved'), 'success');
            closeModal();
            renderBusiness();
          } catch (ex) { err.textContent = terr(ex); }
        });
      });
      row.querySelector('.m-remove').addEventListener('click', async () => {
        if (!confirm(t('removeMemberConfirm', m.name))) return;
        try {
          await api(`/api/org/members/${m.id}`, { method: 'DELETE' });
          toast(t('deleted'), 'success');
          renderBusiness();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
    });
  }

  async function bizQrTab(box) {
    const org = await api('/api/org');
    box.innerHTML = `
      <button class="chip gray" id="qr-back" style="margin-bottom:12px">${t('back')}</button>
      <div class="card" style="max-width:600px">
        <h2>${t('addBranch')}</h2>
        <form id="add-branch-form">
          <div class="form-row">
            <input id="branch-name" placeholder="${t('branchPh')}">
            <button class="btn" type="submit" style="flex:0 0 auto;width:auto;padding:14px 22px">${t('add')}</button>
          </div>
          <div class="error-text" id="branch-error"></div>
        </form>
      </div>
      ${org.branches.map((b) => `
        <div class="card qr-card" style="max-width:600px" data-id="${b.id}">
          <div class="modal-head" style="margin-bottom:4px"><h2 style="margin:0">🏢 ${esc(b.name)}</h2></div>
          <div class="print-area" data-branch="${b.id}">
            <img src="${b.dataUrl}" alt="QR">
            <div class="pt">${esc(b.name)} — ${t('qrCaption')}</div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center">
            <button class="chip b-print">${t('printQr')}</button>
            <button class="chip gray b-rename">${t('renameBranch')}</button>
            <button class="chip red b-rotate">${t('newQr')}</button>
            <button class="chip red b-del">🗑</button>
          </div>
          <div class="loc-box">
            <div class="muted" style="font-size:13px;margin-bottom:8px">
              ${b.lat != null ? `<b style="color:var(--green)">${t('locationSaved', b.radius)}</b>` : t('locationNone')}
            </div>
            <div style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap">
              <button class="chip b-setloc">${t('setLocation')}</button>
              <input class="b-radius" type="number" min="20" max="2000" value="${b.radius || 50}"
                     style="width:90px;padding:8px 10px;border-radius:10px" title="${t('radiusLabel')}"> m
              ${b.lat != null ? '<button class="chip red b-clearloc">✕</button>' : ''}
            </div>
            <p class="muted" style="font-size:12px;margin-top:8px">${t('locNote')}</p>
          </div>
        </div>`).join('')}
    `;
    document.getElementById('qr-back').addEventListener('click', () => { state.bizTab = 'team'; renderBusiness(); });
    document.getElementById('add-branch-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('branch-error');
      err.textContent = '';
      try {
        await api('/api/org/branches', { method: 'POST', body: { name: document.getElementById('branch-name').value } });
        toast(t('added'), 'success');
        renderBusiness();
      } catch (ex) { err.textContent = terr(ex); }
    });
    box.querySelectorAll('.card[data-id]').forEach((card) => {
      const id = card.dataset.id;
      const b = org.branches.find((x) => String(x.id) === id);
      card.querySelector('.b-print').addEventListener('click', () => {
        document.querySelectorAll('.print-area').forEach((p) => p.classList.toggle('hidden', p.dataset.branch !== id));
        window.print();
        document.querySelectorAll('.print-area').forEach((p) => p.classList.remove('hidden'));
      });
      card.querySelector('.b-rename').addEventListener('click', async () => {
        const name = prompt(t('branchNewName'), b.name);
        if (!name) return;
        try {
          await api(`/api/org/branches/${id}`, { method: 'PUT', body: { name } });
          renderBusiness();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      card.querySelector('.b-rotate').addEventListener('click', async () => {
        if (!confirm(t('newQrConfirm'))) return;
        try {
          await api(`/api/org/branches/${id}/qr/rotate`, { method: 'POST' });
          toast(t('saved'), 'success');
          renderBusiness();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      card.querySelector('.b-del').addEventListener('click', async () => {
        if (!confirm(t('delBranchConfirm'))) return;
        try {
          await api(`/api/org/branches/${id}`, { method: 'DELETE' });
          toast(t('deleted'), 'success');
          renderBusiness();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      card.querySelector('.b-setloc').addEventListener('click', async () => {
        const loc = await getLoc(10000);
        if (loc.lat == null) return toast(t('err').LOCATION_REQUIRED || terr({ code: 'LOCATION_REQUIRED' }), 'error', 5000);
        try {
          await api(`/api/org/branches/${id}/location`, {
            method: 'PUT',
            body: { ...loc, radius: +card.querySelector('.b-radius').value || 50 },
          });
          toast(t('saved'), 'success');
          renderBusiness();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      card.querySelector('.b-clearloc')?.addEventListener('click', async () => {
        try {
          await api(`/api/org/branches/${id}/location`, { method: 'PUT', body: { lat: null, lng: null } });
          toast(t('locationCleared'), 'success');
          renderBusiness();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
    });
  }

  async function bizProfileTab(box) {
    const me = state.me;
    const tzOpts = TIMEZONES.map(([tz, label]) =>
      `<option value="${tz}" ${tz === me.timezone ? 'selected' : ''}>${label}</option>`).join('');
    box.innerHTML = `
      <div class="card" style="max-width:600px">
        <h2>${t('subscription')}</h2>
        <p class="muted">${me.active ? t('paidLeft', me.daysLeft) : t('subExpired')}</p>
        <div id="pay-area">${me.active && !me.pendingPayment ? `<button class="btn outline" id="show-pay" style="margin-top:8px">${t('payTitle')}</button>` : payCardHtml()}</div>
      </div>
      ${accountsCardHtml()}
      ${themePickerHtml()}
      <div class="card" style="max-width:600px">
        <h2>${t('accountInfo')}</h2>
        <label>${t('orgName')}</label>
        <input id="p-orgname" value="${esc(me.org?.name || '')}">
        <label>${t('yourName')}</label>
        <input id="p-name" value="${esc(me.name)}">
        <label>${t('email')}</label>
        <input id="p-email" type="email" value="${esc(me.email)}">
        <label>${t('changePassword')}</label>
        <input id="p-pw" type="password" autocomplete="new-password">
        <label>${t('timezone')}</label>
        <select id="p-tz">${tzOpts}</select>
        <div class="error-text" id="p-error"></div>
        <button class="btn" id="p-save">${t('save')}</button>
      </div>
    `;
    bindPayCard(renderBusiness);
    bindThemePicker(renderBusiness);
    bindAccountsCard();
    document.getElementById('show-pay')?.addEventListener('click', () => {
      document.getElementById('pay-area').innerHTML = payCardHtml();
      bindPayCard(renderBusiness);
    });
    box.insertAdjacentHTML('beforeend',
      `<button class="btn ghost" id="logout-btn" style="color:var(--red);max-width:600px">${t('logout')}</button>`);
    document.getElementById('logout-btn').addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch {}
      removeActiveAccount();
      state.me = null;
      if (getAccounts().length) location.reload();
      else renderAuth();
    });
    document.getElementById('p-save').addEventListener('click', async () => {
      const err = document.getElementById('p-error');
      err.textContent = '';
      try {
        const newOrgName = document.getElementById('p-orgname').value.trim();
        if (newOrgName && newOrgName !== me.org?.name) {
          await api('/api/org', { method: 'PUT', body: { name: newOrgName } });
        }
        await api('/api/profile', {
          method: 'PUT',
          body: {
            name: document.getElementById('p-name').value,
            email: document.getElementById('p-email').value,
            password: document.getElementById('p-pw').value || undefined,
            timezone: document.getElementById('p-tz').value,
          },
        });
        state.me = await api('/api/me');
        toast(t('saved'), 'success');
        renderBusiness();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  // ================================================================
  //  PLATFORMA ADMINI
  // ================================================================
  function renderPadminLogin() {
    stopTimers();
    hideNav();
    $app.className = 'no-nav';
    $app.innerHTML = `
      <div class="topbar">${brandHtml('Admin')}${langSelHtml()}</div>
      <div class="card">
        <h2>${t('padminTitle')}</h2>
        <form id="admin-form">
          <label>${t('adminPassword')}</label>
          <input type="password" id="admin-pw" autocomplete="current-password">
          <div class="error-text" id="admin-error"></div>
          <button class="btn" type="submit" style="margin-top:4px">${t('signIn')}</button>
        </form>
      </div>
      <button class="btn ghost" id="back-btn">${t('workerLogin')}</button>
    `;
    bindLangSel();
    document.getElementById('back-btn').addEventListener('click', () => renderAuth());
    document.getElementById('admin-pw').focus();
    document.getElementById('admin-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('admin-error');
      err.textContent = '';
      try {
        const r = await api('/api/admin/login', { method: 'POST', body: { password: document.getElementById('admin-pw').value } });
        if (r.defaultPassword) toast(t('defaultPwWarn'), 'error', 6000);
        renderPadmin();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  async function renderPadmin() {
    stopTimers();
    hideNav();
    $app.className = 'wide';
    let ov;
    try {
      ov = await api('/api/admin/overview');
    } catch (ex) {
      if (ex.code === 'AUTH_ADMIN') return renderPadminLogin();
      toast(terr(ex), 'error');
      return;
    }
    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(t('padminTitle'))}
        <div style="display:flex;gap:8px;align-items:center">
          ${langSelHtml()}
          <button class="chip gray" id="logout-btn">${t('logout')}</button>
        </div>
      </div>
      <div class="stat-row" style="max-width:600px">
        <div class="stat"><div class="value">${ov.total}</div><div class="label">${t('padTotal')}</div></div>
        <div class="stat"><div class="value">${ov.active}</div><div class="label">${t('padActive')}</div></div>
        <div class="stat"><div class="value">${ov.business}</div><div class="label">${t('padBiz')}</div></div>
        <div class="stat"><div class="value" style="color:${ov.pendingPayments ? 'var(--amber)' : 'inherit'}">${ov.pendingPayments}</div><div class="label">${t('padPending')}</div></div>
      </div>
      <div class="tabs">
        <button class="tab ${state.padTab === 'payments' ? 'active' : ''}" data-tab="payments">${t('padPayments')}</button>
        <button class="tab ${state.padTab === 'history' ? 'active' : ''}" data-tab="history">${t('padHistory')}</button>
        <button class="tab ${state.padTab === 'users' ? 'active' : ''}" data-tab="users">${t('padUsers')}</button>
        <button class="tab ${state.padTab === 'prices' ? 'active' : ''}" data-tab="prices">${t('padPrices')}</button>
      </div>
      <div id="tab-content"><div class="loading-screen" style="padding-top:60px"><div class="spinner"></div></div></div>
    `;
    bindLangSel();
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      renderAuth();
    });
    document.querySelectorAll('.tab').forEach((tab) =>
      tab.addEventListener('click', () => { state.padTab = tab.dataset.tab; renderPadmin(); }));

    const box = document.getElementById('tab-content');
    if (state.padTab === 'payments') await padPaymentsTab(box);
    else if (state.padTab === 'history') await padHistoryTab(box);
    else if (state.padTab === 'prices') await padPricesTab(box);
    else await padUsersTab(box);
  }

  // To'lovlar tarixi (tasdiqlangan/rad etilgan)
  async function padHistoryTab(box) {
    const list = await api('/api/admin/payments?status=history');
    box.innerHTML = `<div style="max-width:600px">${list.length ? list.map((p) => `
      <div class="card" style="padding:14px 16px">
        <div class="fin-row" style="border:none;padding:0">
          <div class="info">
            <div class="name">${esc(p.name)} <span class="badge-inactive" style="${p.status === 'approved' ? 'background:var(--green-soft);color:var(--green)' : ''}">${p.status === 'approved' ? t('approvedTag') : t('rejectedTag')}</span></div>
            <div class="sub">${esc(p.email)} · ${new Date(p.decidedAt || p.createdAt).toLocaleString()}</div>
          </div>
          <b style="color:var(--accent)">₩${new Intl.NumberFormat().format(p.amount)}</b>
        </div>
      </div>`).join('') : `<div class="card"><p class="muted">—</p></div>`}</div>`;
  }

  // Obuna narxlarini boshqarish
  async function padPricesTab(box) {
    const prices = await api('/api/admin/prices');
    box.innerHTML = `
      <div class="card" style="max-width:480px">
        <h2>${t('padPrices')}</h2>
        <label>${t('priceWorker')}</label>
        <input id="pr-w" type="number" min="0" value="${prices.worker}">
        <label>${t('priceBusiness')}</label>
        <input id="pr-b" type="number" min="0" value="${prices.business}">
        <div class="error-text" id="pr-error"></div>
        <button class="btn" id="pr-save">${t('save')}</button>
      </div>`;
    document.getElementById('pr-save').addEventListener('click', async () => {
      const err = document.getElementById('pr-error');
      err.textContent = '';
      try {
        await api('/api/admin/prices', {
          method: 'PUT',
          body: { worker: document.getElementById('pr-w').value, business: document.getElementById('pr-b').value },
        });
        toast(t('saved'), 'success');
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  async function padPaymentsTab(box) {
    const list = await api('/api/admin/payments?status=pending');
    box.innerHTML = list.length ? list.map((p) => `
      <div class="card" style="max-width:600px" data-id="${p.id}">
        <div class="modal-head" style="margin-bottom:4px">
          <h2 style="margin:0">${esc(p.name)} <span class="muted" style="font-size:13px">(${p.type})</span></h2>
          <b style="color:var(--accent)">₩${new Intl.NumberFormat().format(p.amount)}</b>
        </div>
        <p class="muted">${esc(p.email)} · ${new Date(p.createdAt).toLocaleString()}</p>
        ${p.image ? `<img src="${p.image}" alt="chek" style="max-width:100%;max-height:340px;border-radius:12px;border:1.5px solid var(--line);margin-top:10px">` : ''}
        ${p.link ? `<p style="margin-top:10px"><a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link)}</a></p>` : ''}
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn" style="background:var(--green)" data-act="approve">${t('padApprove')}</button>
          <button class="btn red" data-act="reject">${t('padReject')}</button>
        </div>
      </div>`).join('') : `<div class="card" style="max-width:600px"><p class="muted">${t('padNoPayments')}</p></div>`;

    box.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = b.closest('[data-id]').dataset.id;
        try {
          await api(`/api/admin/payments/${id}/${b.dataset.act}`, { method: 'POST' });
          toast(t('saved'), 'success');
          renderPadmin();
        } catch (ex) { toast(terr(ex), 'error'); }
      }));
  }

  async function padUsersTab(box) {
    const q = state.padQuery || '';
    const users = await api(`/api/admin/users?q=${encodeURIComponent(q)}`);
    box.innerHTML = `
      <div style="max-width:600px">
        <input id="u-search" placeholder="${t('padSearch')}" value="${esc(q)}" style="margin-bottom:12px">
        ${users.map((u) => `
          <div class="card" style="padding:14px 16px" data-id="${u.id}">
            <div class="worker-admin-row" style="border:none;padding:0">
              <span class="avatar" style="background:${avatarColor(u.name)}">${esc(initials(u.name))}</span>
              <div class="info">
                <div class="name">${esc(u.name)} ${u.type === 'business' ? '🍽' : ''} ${u.active ? '' : `<span class="badge-inactive">${t('subExpired')}</span>`}</div>
                <div class="sub">${esc(u.email)} · ${t('padUntil')}: ${new Date(u.paidUntil).toLocaleDateString()}</div>
              </div>
              <div class="actions">
                <button class="chip" data-days="30">${t('padAddDays', 30)}</button>
                <button class="chip" data-days="365">${t('padAddDays', 365)}</button>
                <button class="chip gray" data-price="1">💲</button>
                <button class="chip red" data-days="-3660">✕</button>
              </div>
            </div>
          </div>`).join('')}
      </div>
    `;
    let timer;
    document.getElementById('u-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.padQuery = e.target.value; padUsersTab(box); }, 350);
    });
    document.getElementById('u-search').focus();
    box.querySelectorAll('[data-days]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = b.closest('[data-id]').dataset.id;
        try {
          await api(`/api/admin/users/${id}`, { method: 'PUT', body: { addDays: +b.dataset.days } });
          toast(t('saved'), 'success');
          padUsersTab(box);
        } catch (ex) { toast(terr(ex), 'error'); }
      }));
    box.querySelectorAll('[data-price]').forEach((b) =>
      b.addEventListener('click', async () => {
        const row = b.closest('[data-id]');
        const u = users.find((x) => String(x.id) === row.dataset.id);
        const v = prompt(t('customPricePrompt', u.name), '');
        if (v === null) return;
        try {
          await api(`/api/admin/users/${u.id}/price`, { method: 'PUT', body: { customPrice: v === '' ? null : +v } });
          toast(t('saved'), 'success');
        } catch (ex) { toast(terr(ex), 'error'); }
      }));
  }

  // ================================================================
  //  BOSHLASH
  // ================================================================
  async function boot() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    loadRates(); // fon rejimida valyuta kurslarini yangilaydi
    const joinMatch = location.pathname.match(/^\/join\/([\w:.-]+)/);
    if (joinMatch) state.joinToken = joinMatch[1];

    try {
      const me = await api('/api/me');
      if (me.role === 'padmin') return renderPadmin();
      if (me.role === 'user') {
        upsertAccount(me);
        state.me = me;
        return afterAuth();
      }
    } catch {}
    renderAuth(state.joinToken ? 'signup' : 'login');
  }

  boot();
})();
