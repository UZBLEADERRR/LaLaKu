/* LaLaKu Vaqt — mijoz ilovasi (SaaS) */
(() => {
  const $app = document.getElementById('app');
  const $nav = document.getElementById('bottom-nav');
  const AVATAR_COLORS = ['#5b5bd6', '#0d9488', '#c2410c', '#be185d', '#7c3aed', '#0369a1', '#0a9f6d', '#e5484d'];
  const LANG_NAMES = { uz: "O'zbekcha", en: 'English', ko: '한국어' };
  const LOCALES = { uz: 'uz-UZ', en: 'en-US', ko: 'ko-KR' };
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
  const fmtMoney = (n) => (n < 0 ? '−' : '') + '₩' + new Intl.NumberFormat(LOCALES[LANG]).format(Math.abs(Math.round(n)));

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

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V21h14V9.8"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16.5 15h.01"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg>',
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

  // ---------- API ----------
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
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
    return data;
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

  // Ish haqi hisobi (soatlik yoki kunlik)
  function earnings(totalMinutes, daysWorked) {
    const me = state.me;
    const gross = me.payType === 'daily'
      ? daysWorked * (me.dailyRate || 0)
      : (totalMinutes / 60) * (me.hourlyRate || 0);
    const tax = gross * (me.taxPercent || 0) / 100;
    return { gross, tax, net: gross - tax, hasRate: me.payType === 'daily' ? me.dailyRate > 0 : me.hourlyRate > 0 };
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
      <div class="topbar">${brandHtml('')}${langSelHtml()}</div>
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
          <label>${t('email')}</label>
          <input id="auth-email" type="email" autocomplete="email" inputmode="email">
          <label>${t('password')}</label>
          <input id="auth-pw" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}">
          <div class="error-text" id="auth-error"></div>
          <button class="btn" type="submit">${mode === 'signup' ? t('signUp') : t('signIn')}</button>
          ${mode === 'signup' ? `<p class="muted" style="text-align:center;margin-top:10px;font-size:13px">${t('trialNote', 7)}</p>` : ''}
        </form>
      </div>
      <button class="btn ghost" id="auth-switch">${mode === 'signup' ? t('haveAccount') : t('noAccount')}</button>
      <button class="btn ghost" id="go-admin" style="font-size:13px;padding:8px">${t('adminBtn')}</button>
    `;
    bindLangSel();
    document.querySelectorAll('.segment button').forEach((b) =>
      b.addEventListener('click', () => renderAuth(b.dataset.m)));
    document.getElementById('auth-switch').addEventListener('click', () => renderAuth(mode === 'signup' ? 'login' : 'signup'));
    document.getElementById('go-admin').addEventListener('click', renderPadminLogin);

    if (mode === 'signup') {
      document.querySelectorAll('input[name=acctype]').forEach((r) =>
        r.addEventListener('change', () => {
          document.getElementById('bizname-wrap').classList.toggle('hidden', r.value !== 'business' || !r.checked);
        }));
    }

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('auth-error');
      err.textContent = '';
      try {
        const body = {
          email: document.getElementById('auth-email').value,
          password: document.getElementById('auth-pw').value,
        };
        let me;
        if (mode === 'signup') {
          body.name = document.getElementById('auth-name').value;
          body.type = document.querySelector('input[name=acctype]:checked').value;
          body.businessName = document.getElementById('auth-bizname')?.value || '';
          me = await api('/api/register', { method: 'POST', body });
        } else {
          me = await api('/api/login', { method: 'POST', body });
        }
        state.me = me;
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
    return renderWorkerHome();
  }

  async function renderWorkerHome() {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1;
    let status, summary;
    try {
      [status, summary] = await Promise.all([
        api('/api/my/status'),
        api(`/api/my/summary?year=${year}&month=${month}`),
      ]);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderAuth();
      toast(terr(ex), 'error');
      return;
    }

    const me = state.me;
    const today = todayStr();
    const todayData = summary.days[today];
    const todayMin = todayData ? todayData.minutes : 0;
    const hasTeam = me.memberships.length > 0;
    const e = earnings(summary.totalMinutes, summary.daysWorked);

    let actionHtml;
    if (!me.active) {
      actionHtml = payCardHtml();
    } else if (hasTeam) {
      actionHtml = `
        <button class="scan-btn ${status.checkedIn ? 'leave' : 'arrive'}" id="scan-btn">
          ${ICONS.scan}
          ${status.checkedIn ? t('checkoutBtn') : t('checkinBtn')}
        </button>
        <button class="btn ghost" id="punch-btn" style="margin-top:-6px;margin-bottom:12px;font-size:13.5px">${t('manualLink')}</button>`;
    } else {
      actionHtml = `
        <button class="scan-btn ${status.checkedIn ? 'leave' : 'arrive'}" id="punch-btn">
          ${status.checkedIn ? t('punchOut') : t('punchIn')}
        </button>`;
    }

    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(me.name)}
        <div style="display:flex;gap:8px;align-items:center">${langSelHtml()}</div>
      </div>
      ${subBannerHtml()}

      <div class="hero ${status.checkedIn ? 'working' : ''}">
        <span class="badge">${status.checkedIn ? `<span class="pulse-dot"></span> ${t('atWork')}` : t('offWork')}</span>
        <div class="big" id="status-time">${status.checkedIn ? '' : fmtH(todayMin)}</div>
        <div class="sub">${status.checkedIn
          ? `${t('arrivedAt', status.since)}${status.orgName ? ` · ${esc(status.orgName)}` : ''}`
          : (todayMin > 0 ? t('restMsg') : t('scanPrompt'))}</div>
      </div>

      ${actionHtml}

      <div class="stat-row">
        <div class="stat"><div class="value">${fmtH(todayMin)}</div><div class="label">${t('workedToday')}</div></div>
        <div class="stat"><div class="value">${fmtH(summary.totalMinutes)}</div><div class="label">${t('monthTotal', MONTHS()[month - 1])}</div></div>
      </div>

      ${salaryCardHtml(e)}
      <button class="btn outline" id="forecast-btn" style="margin-bottom:14px">${t('forecastBtn')}</button>

      ${todayData ? `
      <div class="card">
        <h2>${t('todaySessions')}</h2>
        ${todayData.sessions.map((s) => `
          <div class="session-row">
            <span class="times">${s.in} → ${s.out || `<span style="color:var(--green)">${t('working')}</span>`}</span>
            <span class="dur">${fmtH(s.minutes)} ${t('hUnit')}</span>
          </div>`).join('')}
      </div>` : ''}
    `;
    bindLangSel();
    bindSalaryCard(renderWorker);
    bindPayCard(renderWorker);
    document.getElementById('forecast-btn').addEventListener('click', () => { state.view = 'forecast'; renderWorker(); });

    if (status.checkedIn && status.sinceIso) {
      const started = new Date(status.sinceIso);
      const closedBefore = todayData ? todayData.sessions.filter((s) => s.out).reduce((a, s) => a + s.minutes, 0) : 0;
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
        toast(r.action === 'in' ? t('scanInOk', r.time) : t('scanOutOk', r.time), 'success', 4500);
        renderWorker();
      } catch (ex) { toast(terr(ex), 'error', 4500); }
    };
    document.getElementById('scan-btn')?.addEventListener('click', () =>
      scanner.open((code) => doAction(() => api('/api/scan', { method: 'POST', body: { code } }))));
    document.getElementById('punch-btn')?.addEventListener('click', () =>
      doAction(() => api('/api/punch', { method: 'POST' })));
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
    return `<div class="card">
      <div class="modal-head" style="margin-bottom:6px"><h2 style="margin:0">${t('salary')}</h2>${gearBtn}</div>
      <div class="sal-row"><span class="muted">${t('gross')}</span><b>${fmtMoney(e.gross)}</b></div>
      ${e.tax > 0 ? `<div class="sal-row"><span class="muted">${t('taxLabel', state.me.taxPercent)}</span><b style="color:var(--red)">−${fmtMoney(e.tax)}</b></div>` : ''}
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
  async function renderMyCalendar() {
    const { year, month } = currentMonth();
    let summary;
    try {
      summary = await api(`/api/my/summary?year=${year}&month=${month}`);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderAuth();
      toast(terr(ex), 'error');
      return;
    }
    const e = earnings(summary.totalMinutes, summary.daysWorked);

    $app.innerHTML = `
      <div class="topbar">${brandHtml(state.me.name)}${langSelHtml()}</div>
      <div class="stat-row">
        <div class="stat"><div class="value">${fmtH(summary.totalMinutes)}</div><div class="label">${t('monthHours', MONTHS()[month - 1])}</div></div>
        <div class="stat"><div class="value">${summary.daysWorked}</div><div class="label">${t('daysWorked')}</div></div>
      </div>
      <div class="card">
        ${calendarHtml(summary, year, month)}
        <div class="day-detail ${state.selectedDay ? '' : 'hidden'}" id="day-detail">
          ${state.selectedDay ? dayDetailHtml(summary, state.selectedDay) : ''}
        </div>
      </div>
      <button class="btn outline" id="copy-report" style="margin-bottom:14px">${t('copyReport')}</button>
      ${salaryCardHtml(e)}
    `;
    bindLangSel();
    bindSalaryCard(renderWorker);
    bindCalendarNav(renderWorker);
    bindCalendarCells((date) => {
      state.selectedDay = state.selectedDay === date ? null : date;
      const det = document.getElementById('day-detail');
      if (state.selectedDay) {
        det.innerHTML = dayDetailHtml(summary, state.selectedDay);
        det.classList.remove('hidden');
      } else det.classList.add('hidden');
      document.querySelectorAll('.cal-cell').forEach((c) => c.classList.toggle('selected', c.dataset.date === state.selectedDay));
    });

    // SMS uchun ro'yxat nusxalash
    document.getElementById('copy-report').addEventListener('click', () => {
      const lines = [t('reportTitle', MONTHS()[month - 1], year, state.me.name)];
      const dates = Object.keys(summary.days).sort();
      for (const d of dates) {
        const dd = summary.days[d];
        const sess = dd.sessions.map((s) => `${s.in}→${s.out || '...'}`).join(', ');
        lines.push(`${+d.split('-')[2]}: ${sess} (${fmtH(dd.minutes)})`);
      }
      lines.push(`${t('reportTotal')}: ${fmtH(summary.totalMinutes)} (${summary.daysWorked} ${t('dUnit')})`);
      navigator.clipboard.writeText(lines.join('\n'))
        .then(() => toast(t('copied'), 'success'))
        .catch(() => toast(t('genericError'), 'error'));
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
    const dd = summary.days[date];
    if (!dd) return `<b>${dayTitle(date)}</b><p class="muted" style="margin-top:6px">${t('noRecords')}</p>`;
    return `<b>${dayTitle(date)}</b> — ${t('total')} <b style="color:var(--green)">${fmtH(dd.minutes)}</b> ${t('hUnit')}${dd.open ? ` <span style="color:var(--amber)">(${t('ongoing')})</span>` : ''}
      ${dd.sessions.map((s) => `
        <div class="session-row">
          <span class="times">${s.in} → ${s.out || `<span style="color:var(--green)">${t('working')}</span>`}</span>
          <span class="dur">${fmtH(s.minutes)} ${t('hUnit')}</span>
        </div>`).join('')}`;
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
    let items, summary;
    try {
      [items, summary] = await Promise.all([
        api('/api/finance'),
        api(`/api/my/summary?year=${year}&month=${month}`),
      ]);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderAuth();
      toast(terr(ex), 'error');
      return;
    }

    const e = earnings(summary.totalMinutes, summary.daysWorked);
    const act = items.filter((i) => i.active);
    const incomes = act.filter((i) => i.kind === 'income').reduce((a, i) => a + i.amount, 0);
    const expenses = act.filter((i) => i.kind === 'expense').reduce((a, i) => a + i.amount, 0);
    const debtsMonth = act.filter((i) => i.kind === 'debt' &&
      (i.dueDay || (i.dueDate && i.dueDate.startsWith(`${year}-${pad(month)}`)))).reduce((a, i) => a + i.amount, 0);
    const leftOver = e.net + incomes - expenses - debtsMonth;

    // Eslatmalar: 7 kun ichida to'lanishi kerak bo'lganlar
    const reminders = act
      .filter((i) => i.kind !== 'income')
      .map((i) => ({ ...i, days: nextDue(i) }))
      .filter((i) => i.days !== null && i.days <= 7)
      .sort((a, b) => a.days - b.days);

    const kindSection = (kind, titleKey) => {
      const list = items.filter((i) => i.kind === kind);
      return `
        <div class="card">
          <div class="modal-head" style="margin-bottom:8px">
            <h2 style="margin:0">${t(titleKey)}</h2>
            <button class="chip" data-add="${kind}">${t('add')}</button>
          </div>
          ${list.length ? list.map((i) => `
            <div class="fin-row ${i.active ? '' : 'paid'}" data-id="${i.id}">
              <div class="info">
                <div class="name">${esc(i.title)}${i.active ? '' : ` <span class="badge-inactive">${t('paidTag')}</span>`}</div>
                <div class="sub">${i.dueDay ? t('everyMonthDay').split('(')[0].trim() + ': ' + i.dueDay : (i.dueDate || '')}</div>
              </div>
              <b class="amt ${kind === 'income' ? 'plus' : ''}">${kind === 'income' ? '+' : '−'}${fmtMoney(i.amount)}</b>
              <div class="actions">
                ${kind === 'debt' ? `<button class="chip gray f-paid">${i.active ? t('markPaid') : t('markUnpaid')}</button>` : ''}
                <button class="chip red f-del">🗑</button>
              </div>
            </div>`).join('') : `<p class="muted">${t('noFinance')}</p>`}
        </div>`;
    };

    $app.innerHTML = `
      <div class="topbar">${brandHtml(state.me.name)}${langSelHtml()}</div>

      <div class="card remain-card">
        <h2>${t('remaining')}</h2>
        <div class="sal-row"><span class="muted">${t('monthEarn')}</span><b>${fmtMoney(e.net)}</b></div>
        ${incomes ? `<div class="sal-row"><span class="muted">${t('otherIncome')}</span><b style="color:var(--green)">+${fmtMoney(incomes)}</b></div>` : ''}
        ${expenses ? `<div class="sal-row"><span class="muted">${t('monthExpenses')}</span><b style="color:var(--red)">−${fmtMoney(expenses)}</b></div>` : ''}
        ${debtsMonth ? `<div class="sal-row"><span class="muted">${t('monthDebts')}</span><b style="color:var(--red)">−${fmtMoney(debtsMonth)}</b></div>` : ''}
        <div class="sal-row net"><span>${t('leftOver')}</span><b style="color:${leftOver >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtMoney(leftOver)}</b></div>
      </div>

      <div class="card">
        <h2>${t('reminders')}</h2>
        ${reminders.length ? reminders.map((r) => `
          <div class="fin-row">
            <div class="info">
              <div class="name">${esc(r.title)}</div>
              <div class="sub ${r.days <= 0 ? 'urgent' : ''}">${t('dueInDays', r.days)}</div>
            </div>
            <b class="amt">−${fmtMoney(r.amount)}</b>
          </div>`).join('') : `<p class="muted">${t('noReminders')}</p>`}
      </div>

      <p class="muted" style="margin:0 4px 14px">${t('financeNote')}</p>

      ${kindSection('expense', 'kindExpensePl')}
      ${kindSection('debt', 'kindDebtPl')}
      ${kindSection('income', 'kindIncomePl')}
    `;
    bindLangSel();

    document.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => openFinanceModal(b.dataset.add)));

    document.querySelectorAll('.fin-row[data-id]').forEach((row) => {
      const id = row.dataset.id;
      const item = items.find((i) => String(i.id) === id);
      row.querySelector('.f-paid')?.addEventListener('click', async () => {
        try {
          await api(`/api/finance/${id}`, { method: 'PUT', body: { active: !item.active } });
          renderWorker();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      row.querySelector('.f-del')?.addEventListener('click', async () => {
        if (!confirm(t('delEntryConfirm'))) return;
        try {
          await api(`/api/finance/${id}`, { method: 'DELETE' });
          toast(t('deleted'), 'success');
          renderWorker();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
    });
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
    let items = [];
    try { items = await api('/api/finance'); } catch {}
    const expenses = items.filter((i) => i.active && i.kind === 'expense').reduce((a, i) => a + i.amount, 0);
    const me = state.me;

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
            <input id="fc-rate" type="number" min="0" step="any" inputmode="decimal" value="${(me.payType === 'daily' ? me.dailyRate : me.hourlyRate) || ''}"></div>
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
        document.getElementById('fc-rate').value = (payType === 'daily' ? state.me.dailyRate : state.me.hourlyRate) || '';
        recompute();
      }));
    ['fc-days', 'fc-hours', 'fc-rate', 'fc-tax'].forEach((id) =>
      document.getElementById(id)?.addEventListener('input', recompute));
    recompute();
  }

  // ---------- Profil (ishchi) ----------
  async function renderProfile() {
    const me = state.me;
    const tzOpts = TIMEZONES.map(([tz, label]) =>
      `<option value="${tz}" ${tz === me.timezone ? 'selected' : ''}>${label}</option>`).join('');
    const tzCustom = TIMEZONES.some(([tz]) => tz === me.timezone) ? '' :
      `<option value="${esc(me.timezone)}" selected>${esc(me.timezone)}</option>`;

    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(t('profile'))}
        <div style="display:flex;gap:8px;align-items:center">
          ${langSelHtml()}
          <button class="chip gray" id="logout-btn">${t('logout')}</button>
        </div>
      </div>
      ${subBannerHtml()}

      <div class="card">
        <h2>${t('subscription')}</h2>
        <p class="muted">${me.active ? t(me.daysLeft > 7 ? 'paidLeft' : 'trialLeft', me.daysLeft) : t('subExpired')}</p>
        <div id="pay-area">${me.active && !me.pendingPayment ? `<button class="btn outline" id="show-pay" style="margin-top:8px">${t('payTitle')}</button>` : payCardHtml()}</div>
      </div>

      <div class="card">
        <h2>${t('accountInfo')}</h2>
        <label>${t('yourName')}</label>
        <input id="p-name" value="${esc(me.name)}">
        <label>${t('email')}</label>
        <input id="p-email" type="email" value="${esc(me.email)}">
        <label>${t('changePassword')}</label>
        <input id="p-pw" type="password" autocomplete="new-password">
        <label>${t('timezone')}</label>
        <select id="p-tz">${tzCustom}${tzOpts}</select>
        <p class="muted" style="margin-top:8px;font-size:13px">${t('tzNote')}</p>
        <div class="error-text" id="p-error"></div>
        <button class="btn" id="p-save">${t('save')}</button>
      </div>

      <div class="card">
        <h2>${t('myTeams')}</h2>
        ${me.memberships.length ? me.memberships.map((m) => `
          <div class="fin-row" data-org="${m.orgId}">
            <div class="info"><div class="name">🍽 ${esc(m.orgName)}</div></div>
            <button class="chip red team-leave">${t('leaveTeam')}</button>
          </div>`).join('') : `<p class="muted">${t('noTeams')}</p>`}
      </div>
    `;
    bindLangSel();
    bindPayCard(renderWorker);
    document.getElementById('show-pay')?.addEventListener('click', () => {
      document.getElementById('pay-area').innerHTML = payCardHtml();
      bindPayCard(renderWorker);
    });
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      state.me = null;
      renderAuth();
    });
    document.getElementById('p-save').addEventListener('click', async () => {
      const err = document.getElementById('p-error');
      err.textContent = '';
      try {
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
        renderWorker();
      } catch (ex) { err.textContent = terr(ex); }
    });
    document.querySelectorAll('.team-leave').forEach((b) =>
      b.addEventListener('click', async () => {
        const row = b.closest('[data-org]');
        const m = me.memberships.find((x) => String(x.orgId) === row.dataset.org);
        if (!confirm(t('leaveTeamConfirm', m.orgName))) return;
        try {
          await api(`/api/my/memberships/${m.orgId}`, { method: 'DELETE' });
          state.me = await api('/api/me');
          renderWorker();
        } catch (ex) { toast(terr(ex), 'error'); }
      }));
  }

  // ================================================================
  //  BIZNES (oshxona)
  // ================================================================
  async function renderBusiness() {
    stopTimers();
    hideNav();
    $app.className = 'wide';
    const me = state.me;
    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(me.org?.name || me.name)}
        <div style="display:flex;gap:8px;align-items:center">
          ${langSelHtml()}
          <button class="chip gray" id="logout-btn">${t('logout')}</button>
        </div>
      </div>
      ${subBannerHtml()}
      <div class="tabs">
        ${[['board', 'tabBoard'], ['calendar', 'tabCalendar'], ['team', 'tabTeam'], ['qr', 'tabQr'], ['profile', 'tabProfile']]
          .map(([k, lk]) => `<button class="tab ${state.bizTab === k ? 'active' : ''}" data-tab="${k}">${t(lk)}</button>`).join('')}
      </div>
      <div id="tab-content"><div class="loading-screen" style="padding-top:80px"><div class="spinner"></div></div></div>
    `;
    bindLangSel();
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      state.me = null;
      renderAuth();
    });
    document.querySelectorAll('.tab').forEach((tab) =>
      tab.addEventListener('click', () => { state.bizTab = tab.dataset.tab; renderBusiness(); }));

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
          <div class="hours"><div class="v">${fmtH(w.minutes)}</div><div class="l">${t('hToday')}</div></div>
        </div>`).join('') : `<div class="card" style="max-width:600px"><p class="muted">${t('noMembers')}</p></div>`}
    `;
  }

  async function bizCalendarTab(box) {
    const { year, month } = currentMonth();
    const data = await api(`/api/org/summary?year=${year}&month=${month}`);
    const daysInMonth = new Date(year, month, 0).getDate();
    const headCells = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      headCells.push(`<th class="${dow === 0 || dow === 6 ? 'wknd' : ''}">${d}<br><span style="font-weight:700;opacity:.75">${DOWS()[(dow + 6) % 7]}</span></th>`);
    }
    const rows = data.workers.map((w) => {
      let cells = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${pad(month)}-${pad(d)}`;
        const dd = w.days[date];
        const cls = dd ? (dd.open ? 'day-cell open' : 'day-cell has') : 'day-cell';
        cells += `<td class="${cls}" data-worker="${w.id}" data-date="${date}" data-name="${esc(w.name)}">${dd ? fmtH(dd.minutes) : '·'}</td>`;
      }
      return `<tr>
        <td class="name-col" data-worker="${w.id}" data-name="${esc(w.name)}">${esc(w.name)}</td>
        ${cells}<td class="total-col">${fmtH(w.totalMinutes)}</td></tr>`;
    }).join('');
    const grandTotal = data.workers.reduce((a, w) => a + w.totalMinutes, 0);

    box.innerHTML = `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:16px 18px">
        <div class="cal-title">${calTitle(year, month)}</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="muted">${t('grandTotal')}: <b style="color:var(--accent)">${fmtH(grandTotal)}</b> ${t('hUnit')}</span>
          <div class="cal-nav"><button id="cal-prev">‹</button><button id="cal-next">›</button></div>
        </div>
      </div>
      ${data.workers.length ? `
      <div class="table-wrap">
        <table class="summary">
          <thead><tr><th class="name-col">${t('workerCol')}</th>${headCells.join('')}<th class="total-col">${t('totalCol')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted" style="margin:10px 4px 0">${t('tableHint')}</p>
      ` : `<div class="card"><p class="muted">${t('noMembers')}</p></div>`}
    `;
    bindCalendarNav(renderBusiness);
    box.querySelectorAll('td.day-cell').forEach((td) =>
      td.addEventListener('click', () => openOrgDayModal(+td.dataset.worker, td.dataset.name, td.dataset.date)));
    box.querySelectorAll('td.name-col').forEach((td) =>
      td.addEventListener('click', () => openOrgDayModal(+td.dataset.worker, td.dataset.name, todayStr())));
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
        <p class="muted">${t('inviteNote')}</p>
        <div class="invite-box" id="invite-url">${esc(inviteUrl)}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn outline" id="invite-copy">${t('inviteCopy')}</button>
          <button class="chip red" id="invite-rotate" style="padding:12px 16px">${t('inviteRotate')}</button>
        </div>
      </div>
      <div class="card" style="max-width:600px">
        <h2>${t('members', org.members.length)}</h2>
        ${org.members.length ? org.members.map((m) => `
          <div class="worker-admin-row" data-id="${m.id}">
            <span class="avatar" style="background:${avatarColor(m.name)}">${esc(initials(m.name))}</span>
            <div class="info">
              <div class="name">${esc(m.name)}</div>
              <div class="sub">${esc(m.email)} · ${t('joinedAt', new Date(m.joinedAt).toLocaleDateString())}</div>
            </div>
            <button class="chip red m-remove">${t('removeMember')}</button>
          </div>`).join('') : `<p class="muted">${t('noMembers')}</p>`}
      </div>
    `;
    document.getElementById('invite-copy').addEventListener('click', () =>
      navigator.clipboard.writeText(inviteUrl).then(() => toast(t('copied'), 'success')));
    document.getElementById('invite-rotate').addEventListener('click', async () => {
      if (!confirm(t('inviteRotateConfirm'))) return;
      await api('/api/org/invite/rotate', { method: 'POST' });
      renderBusiness();
    });
    box.querySelectorAll('.worker-admin-row').forEach((row) => {
      const m = org.members.find((x) => String(x.id) === row.dataset.id);
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
        </div>`).join('')}
    `;
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
    document.getElementById('show-pay')?.addEventListener('click', () => {
      document.getElementById('pay-area').innerHTML = payCardHtml();
      bindPayCard(renderBusiness);
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
        <button class="tab ${state.padTab === 'users' ? 'active' : ''}" data-tab="users">${t('padUsers')}</button>
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
    else await padUsersTab(box);
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
  }

  // ================================================================
  //  BOSHLASH
  // ================================================================
  async function boot() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const joinMatch = location.pathname.match(/^\/join\/([\w:.-]+)/);
    if (joinMatch) state.joinToken = joinMatch[1];

    try {
      const me = await api('/api/me');
      if (me.role === 'padmin') return renderPadmin();
      if (me.role === 'user') {
        state.me = me;
        return afterAuth();
      }
    } catch {}
    renderAuth(state.joinToken ? 'signup' : 'login');
  }

  boot();
})();
