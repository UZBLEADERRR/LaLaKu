/* LaLaKu Vaqt — mijoz ilovasi */
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
  const fmtMoney = (n) => new Intl.NumberFormat(LOCALES[LANG]).format(Math.round(n));

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
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 15.2c2.2.3 3.6 1.8 4 4.3"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg>',
  };

  const state = {
    me: null,                    // {role, id, name, hourlyRate, taxPercent}
    month: null,                 // {year, month} — ko'rilayotgan oy
    selectedDay: null,
    view: 'home',                // ishchi: home | board | calendar
    boardMode: 'today',          // today | month
    boardBranch: 0,              // 0 = hammasi
    adminTab: 'calendar',
    adminBranch: 0,
    timerId: null,
    boardTimer: null,
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
    if (state.boardTimer) { clearInterval(state.boardTimer); state.boardTimer = null; }
  }

  // ---------- Pastki navigatsiya ----------
  function showNav(active) {
    $nav.classList.remove('hidden');
    $nav.innerHTML = `
      <button data-v="home" class="${active === 'home' ? 'active' : ''}">${ICONS.home}<span>${{ uz: 'Bosh sahifa', en: 'Home', ko: '홈' }[LANG]}</span></button>
      <button data-v="board" class="${active === 'board' ? 'active' : ''}">${ICONS.board}<span>${{ uz: 'Davomat', en: 'Attendance', ko: '출근 현황' }[LANG]}</span></button>
      <button data-v="calendar" class="${active === 'calendar' ? 'active' : ''}">${ICONS.calendar}<span>${{ uz: 'Kalendar', en: 'Calendar', ko: '달력' }[LANG]}</span></button>
    `;
    $nav.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        state.view = b.dataset.v;
        renderWorkerView();
      })
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
  function closeModal() {
    document.getElementById('modal-back')?.remove();
  }

  // ---------- QR skaner ----------
  const scanner = {
    el: document.getElementById('scanner'),
    video: document.getElementById('scanner-video'),
    stream: null,
    raf: null,

    async open(onCode) {
      document.getElementById('scanner-hint').textContent = t('scanHint');
      document.getElementById('scanner-cancel').textContent = t('scanCancel');
      this.el.classList.remove('hidden');
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
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
    <div class="brand"><div class="logo">⏱</div><div>LaLaKu Vaqt${sub ? `<small>${sub}</small>` : ''}</div></div>`;

  // ================================================================
  //  LOGIN
  // ================================================================
  async function renderWorkerLogin() {
    stopTimers();
    hideNav();
    $app.className = 'no-nav';
    let workers = [], branches = [];
    try {
      [workers, branches] = await Promise.all([api('/api/workers'), api('/api/branches')]);
    } catch {}
    const branchName = (id) => branches.find((b) => b.id === id)?.name || '';

    $app.innerHTML = `
      <div class="topbar">${brandHtml('')}${langSelHtml()}</div>
      <div class="hero-login">
        <h1>${t('welcome')}</h1>
        <p>${t('choosePrompt')}</p>
      </div>
      <div class="worker-grid">
        ${workers.length ? workers.map((w) => `
          <button class="worker-item" data-id="${w.id}" data-name="${esc(w.name)}">
            <span class="avatar" style="background:${avatarColor(w.name)}">${esc(initials(w.name))}</span>
            ${esc(w.name)}
            ${branches.length > 1 ? `<small>${esc(branchName(w.branchId))}</small>` : ''}
          </button>`).join('') : `<div class="card" style="grid-column:1/-1"><p class="muted">${t('noWorkers')}</p></div>`}
      </div>
      <div class="login-links">
        <button class="btn outline" id="go-board">${t('boardBtn')}</button>
        <button class="btn ghost" id="go-admin">${t('adminBtn')}</button>
      </div>
    `;
    bindLangSel();
    document.getElementById('go-admin').addEventListener('click', renderAdminLogin);
    document.getElementById('go-board').addEventListener('click', () => renderPublicBoard());
    document.querySelectorAll('.worker-item').forEach((btn) =>
      btn.addEventListener('click', () => renderPasswordStep(+btn.dataset.id, btn.dataset.name))
    );
  }

  function renderPasswordStep(workerId, name) {
    hideNav();
    $app.className = 'no-nav';
    $app.innerHTML = `
      <div class="topbar">${brandHtml('')}</div>
      <div class="card" style="text-align:center;padding:28px 22px">
        <span class="avatar" style="background:${avatarColor(name)};margin:0 auto 12px;width:64px;height:64px;font-size:23px;display:flex;border-radius:22px">${esc(initials(name))}</span>
        <h2 style="margin-bottom:4px">${esc(name)}</h2>
        <p class="muted">${t('enterPassword')}</p>
        <form id="pw-form">
          <label style="text-align:left">${t('password')}</label>
          <input type="password" id="pw-input" autocomplete="current-password" inputmode="numeric">
          <div class="error-text" id="pw-error"></div>
          <button class="btn" type="submit" style="margin-top:4px">${t('signIn')}</button>
        </form>
      </div>
      <button class="btn ghost" id="back-btn">${t('back')}</button>
    `;
    document.getElementById('back-btn').addEventListener('click', renderWorkerLogin);
    document.getElementById('pw-input').focus();
    document.getElementById('pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('pw-error');
      err.textContent = '';
      try {
        const me = await api('/api/login', { method: 'POST', body: { workerId, password: document.getElementById('pw-input').value } });
        state.me = { role: 'worker', ...me };
        state.month = null;
        state.view = 'home';
        renderWorkerView();
      } catch (ex) {
        err.textContent = terr(ex);
      }
    });
  }

  // ================================================================
  //  ISHCHI KO'RINISHLARI (pastki navigatsiya bilan)
  // ================================================================
  function renderWorkerView() {
    stopTimers();
    $app.className = '';
    showNav(state.view);
    if (state.view === 'board') return renderBoard(false);
    if (state.view === 'calendar') return renderMyCalendar();
    return renderWorkerHome();
  }

  // Maosh kartasi (oylik daromad hisobi)
  function salaryCardHtml(totalMinutes) {
    const rate = state.me.hourlyRate || 0;
    const tax = state.me.taxPercent || 0;
    const gearBtn = `<button class="chip gray" id="salary-gear">⚙️</button>`;
    if (!rate) {
      return `
      <div class="card">
        <div class="modal-head" style="margin-bottom:4px"><h2 style="margin:0">${t('salary')}</h2>${gearBtn}</div>
        <p class="muted">${t('salaryHint')}</p>
      </div>`;
    }
    const gross = totalMinutes / 60 * rate;
    const taxAmt = gross * tax / 100;
    const net = gross - taxAmt;
    return `
      <div class="card">
        <div class="modal-head" style="margin-bottom:6px"><h2 style="margin:0">${t('salary')}</h2>${gearBtn}</div>
        <div class="sal-row"><span class="muted">${t('gross')}</span><b>${fmtMoney(gross)}</b></div>
        ${tax > 0 ? `<div class="sal-row"><span class="muted">${t('taxLabel', tax)}</span><b style="color:var(--red)">−${fmtMoney(taxAmt)}</b></div>` : ''}
        <div class="sal-row net"><span>${t('net')}</span><b style="color:var(--green)">${fmtMoney(net)}</b></div>
      </div>`;
  }

  function bindSalaryCard(rerender) {
    document.getElementById('salary-gear')?.addEventListener('click', () => {
      const modal = openModal(`
        <div class="modal-head"><h2 style="margin:0">${t('salarySettings')}</h2><button class="modal-close" id="m-close">✕</button></div>
        <p class="muted">${t('salaryHint')}</p>
        <label>${t('hourlyRate')}</label>
        <input type="number" id="s-rate" min="0" step="any" inputmode="decimal" value="${state.me.hourlyRate || ''}" placeholder="10030">
        <label>${t('taxPercent')}</label>
        <input type="number" id="s-tax" min="0" max="100" step="any" inputmode="decimal" value="${state.me.taxPercent || ''}" placeholder="3.3">
        <div class="error-text" id="s-error"></div>
        <button class="btn" id="s-save">${t('save')}</button>
      `);
      modal.querySelector('#m-close').addEventListener('click', closeModal);
      modal.querySelector('#s-save').addEventListener('click', async () => {
        const err = modal.querySelector('#s-error');
        err.textContent = '';
        try {
          const hourlyRate = Number(modal.querySelector('#s-rate').value || 0);
          const taxPercent = Number(modal.querySelector('#s-tax').value || 0);
          await api('/api/my/settings', { method: 'PUT', body: { hourlyRate, taxPercent } });
          state.me.hourlyRate = hourlyRate;
          state.me.taxPercent = taxPercent;
          toast(t('saved'), 'success');
          closeModal();
          rerender();
        } catch (ex) { err.textContent = terr(ex); }
      });
    });
  }

  async function renderWorkerHome() {
    let status, summary;
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1;
    try {
      [status, summary] = await Promise.all([
        api('/api/my/status'),
        api(`/api/my/summary?year=${year}&month=${month}`),
      ]);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderWorkerLogin();
      toast(terr(ex), 'error');
      return;
    }

    const today = todayStr();
    const todayData = summary.days[today];
    const todayMin = todayData ? todayData.minutes : 0;

    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(esc(state.me.name))}
        <div style="display:flex;gap:8px;align-items:center">
          ${langSelHtml()}
          <button class="chip gray" id="logout-btn">${t('logout')}</button>
        </div>
      </div>

      <div class="hero ${status.checkedIn ? 'working' : ''}">
        <span class="badge">${status.checkedIn ? `<span class="pulse-dot"></span> ${t('atWork')}` : t('offWork')}</span>
        <div class="big" id="status-time">${status.checkedIn ? '' : fmtH(todayMin)}</div>
        <div class="sub">${status.checkedIn
          ? `${t('arrivedAt', status.since)}${status.sinceDate !== today ? ` (${status.sinceDate})` : ''}`
          : (todayMin > 0 ? t('restMsg') : t('scanPrompt'))}</div>
      </div>

      <button class="scan-btn ${status.checkedIn ? 'leave' : 'arrive'}" id="scan-btn">
        ${ICONS.scan}
        ${status.checkedIn ? t('checkoutBtn') : t('checkinBtn')}
      </button>

      <div class="stat-row">
        <div class="stat"><div class="value">${fmtH(todayMin)}</div><div class="label">${t('workedToday')}</div></div>
        <div class="stat"><div class="value">${fmtH(summary.totalMinutes)}</div><div class="label">${t('monthTotal', MONTHS()[month - 1])}</div></div>
      </div>

      ${salaryCardHtml(summary.totalMinutes)}

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
    bindSalaryCard(renderWorkerView);

    if (status.checkedIn && status.sinceIso) {
      const started = new Date(status.sinceIso);
      const closedBefore = todayData
        ? todayData.sessions.filter((s) => s.out).reduce((a, s) => a + s.minutes, 0) : 0;
      const upd = () => {
        const mins = Math.max(0, Math.floor((Date.now() - started) / 60_000));
        const el = document.getElementById('status-time');
        if (el) el.textContent = fmtH(closedBefore + mins);
      };
      upd();
      state.timerId = setInterval(upd, 15_000);
    }

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      state.me = null;
      renderWorkerLogin();
    });

    document.getElementById('scan-btn').addEventListener('click', () => {
      scanner.open(async (code) => {
        try {
          const r = await api('/api/scan', { method: 'POST', body: { code } });
          toast(r.action === 'in' ? t('scanInOk', r.time) : t('scanOutOk', r.time), 'success', 4500);
          renderWorkerView();
        } catch (ex) {
          toast(terr(ex), 'error', 4500);
        }
      });
    });
  }

  // ---------- Ishchi: o'z kalendari ----------
  async function renderMyCalendar() {
    const { year, month } = currentMonth();
    let summary;
    try {
      summary = await api(`/api/my/summary?year=${year}&month=${month}`);
    } catch (ex) {
      if (ex.code === 'AUTH') return renderWorkerLogin();
      toast(terr(ex), 'error');
      return;
    }

    $app.innerHTML = `
      <div class="topbar">${brandHtml(esc(state.me.name))}${langSelHtml()}</div>
      <div class="stat-row">
        <div class="stat"><div class="value">${fmtH(summary.totalMinutes)}</div><div class="label">${t('monthHours', MONTHS()[month - 1])}</div></div>
        <div class="stat"><div class="value">${Object.values(summary.days).filter((d) => d.minutes > 0 || d.open).length}</div><div class="label">${t('daysWorked')}</div></div>
      </div>
      <div class="card">
        ${calendarHtml(summary, year, month)}
        <div class="day-detail ${state.selectedDay ? '' : 'hidden'}" id="day-detail">
          ${state.selectedDay ? dayDetailHtml(summary, state.selectedDay) : ''}
        </div>
      </div>
      ${salaryCardHtml(summary.totalMinutes)}
    `;
    bindLangSel();
    bindSalaryCard(renderWorkerView);

    bindCalendarNav(renderWorkerView);
    bindCalendarCells((date) => {
      state.selectedDay = state.selectedDay === date ? null : date;
      const det = document.getElementById('day-detail');
      if (state.selectedDay) {
        det.innerHTML = dayDetailHtml(summary, state.selectedDay);
        det.classList.remove('hidden');
      } else det.classList.add('hidden');
      document.querySelectorAll('.cal-cell').forEach((c) => c.classList.toggle('selected', c.dataset.date === state.selectedDay));
    });
  }

  function calendarHtml(summary, year, month) {
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // dushanbadan boshlanadi
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
    const title = LANG === 'ko' ? `${year}년 ${MONTHS()[month - 1]}` : `${MONTHS()[month - 1]} ${year}`;
    return `
      <div class="cal-head">
        <div class="cal-title">${title}</div>
        <div class="cal-nav">
          <button id="cal-prev" aria-label="prev">‹</button>
          <button id="cal-next" aria-label="next">›</button>
        </div>
      </div>
      <div class="cal-grid">${cells}</div>
    `;
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
      c.addEventListener('click', () => onPick(c.dataset.date))
    );
  }

  // ================================================================
  //  DAVOMAT TAXTASI (hamma uchun ochiq)
  // ================================================================
  function renderPublicBoard() {
    stopTimers();
    hideNav();
    $app.className = 'no-nav';
    renderBoard(true);
  }

  async function renderBoard(isPublic) {
    const container = () => document.getElementById('board-content');

    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml(t('attendance'))}
        <div style="display:flex;gap:8px;align-items:center">
          ${langSelHtml()}
          ${isPublic ? `<button class="chip gray" id="back-btn">${t('loginLink')}</button>` : ''}
        </div>
      </div>
      <div class="segment">
        <button data-m="today" class="${state.boardMode === 'today' ? 'active' : ''}">${t('today')}</button>
        <button data-m="month" class="${state.boardMode === 'month' ? 'active' : ''}">${t('month')}</button>
      </div>
      <div id="board-content"><div class="loading-screen" style="padding-top:60px"><div class="spinner"></div></div></div>
    `;
    bindLangSel();
    if (isPublic) document.getElementById('back-btn').addEventListener('click', renderWorkerLogin);
    document.querySelectorAll('.segment button').forEach((b) =>
      b.addEventListener('click', () => {
        state.boardMode = b.dataset.m;
        isPublic ? renderPublicBoard() : renderBoard(false);
      })
    );

    try {
      if (state.boardMode === 'today') {
        await renderBoardToday(container());
        // Jonli yangilanish: har 60 soniyada
        state.boardTimer = setInterval(async () => {
          const el = container();
          if (el) { try { await renderBoardToday(el); } catch {} }
          else stopTimers();
        }, 60_000);
      } else {
        await renderBoardMonth(container());
      }
    } catch (ex) {
      container().innerHTML = `<div class="card"><p class="error-text">${esc(terr(ex))}</p></div>`;
    }
  }

  async function renderBoardToday(box) {
    const data = await api('/api/board');
    const multi = data.branches.length > 1;
    const branchChips = multi ? `
      <div class="branch-chips">
        <button class="branch-chip ${state.boardBranch === 0 ? 'active' : ''}" data-b="0">${t('all')}</button>
        ${data.branches.map((b) => `<button class="branch-chip ${state.boardBranch === b.id ? 'active' : ''}" data-b="${b.id}">${esc(b.name)}</button>`).join('')}
      </div>` : '';

    const filtered = data.workers.filter((w) => !state.boardBranch || w.branchId === state.boardBranch);
    const atWork = filtered.filter((w) => w.status === 'in').length;

    const rowHtml = (w) => `
      <div class="board-row ${w.status === 'in' ? 'working' : ''}">
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
          <div class="l">${t('hToday')}</div>
        </div>
      </div>`;

    let listHtml;
    if (multi && !state.boardBranch) {
      listHtml = data.branches.map((b) => {
        const ws = filtered.filter((w) => w.branchId === b.id);
        if (!ws.length) return '';
        return `<div class="branch-title">${esc(b.name)}</div>` + ws.map(rowHtml).join('');
      }).join('');
    } else {
      listHtml = filtered.map(rowHtml).join('');
    }

    box.innerHTML = `
      <div class="board-date">${dayTitle(data.date)} · ${data.time} · <b style="color:var(--green)">${t('atWorkCount', atWork)}</b></div>
      ${branchChips}
      ${listHtml || `<div class="card"><p class="muted">${t('noWorkers')}</p></div>`}
    `;
    box.querySelectorAll('.branch-chip').forEach((c) =>
      c.addEventListener('click', () => { state.boardBranch = +c.dataset.b; renderBoardToday(box); })
    );
  }

  async function renderBoardMonth(box) {
    const { year, month } = currentMonth();
    const data = await api(`/api/board/summary?year=${year}&month=${month}`);
    box.innerHTML = summaryTableHtml(data, { editable: false });
    bindSummaryTable(box, data, { editable: false, rerender: () => renderBoardMonth(box) });
  }

  // ---------- Oylik jadval (umumiy renderer: taxta va admin) ----------
  function summaryTableHtml(data, { editable }) {
    const { year, month } = data;
    const daysInMonth = new Date(year, month, 0).getDate();
    const multi = data.branches.length > 1;
    const branch = editable ? state.adminBranch : state.boardBranch;
    const workers = data.workers.filter((w) =>
      (editable || w.active) && (!branch || w.branchId === branch));

    const branchChips = multi ? `
      <div class="branch-chips">
        <button class="branch-chip ${branch === 0 ? 'active' : ''}" data-b="0">${t('all')}</button>
        ${data.branches.map((b) => `<button class="branch-chip ${branch === b.id ? 'active' : ''}" data-b="${b.id}">${esc(b.name)}</button>`).join('')}
      </div>` : '';

    const headCells = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      headCells.push(`<th class="${dow === 0 || dow === 6 ? 'wknd' : ''}">${d}<br><span style="font-weight:700;opacity:.75">${DOWS()[(dow + 6) % 7]}</span></th>`);
    }

    const rows = workers.map((w) => {
      let cells = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${pad(month)}-${pad(d)}`;
        const dd = w.days[date];
        const cls = dd ? (dd.open ? 'day-cell open' : 'day-cell has') : 'day-cell';
        cells += `<td class="${cls}" data-worker="${w.id}" data-date="${date}" data-name="${esc(w.name)}">${dd ? fmtH(dd.minutes) : '·'}</td>`;
      }
      return `<tr>
        <td class="name-col" data-worker="${w.id}" data-name="${esc(w.name)}">${esc(w.name)}${w.active ? '' : `<span class="badge-inactive">${t('inactive')}</span>`}</td>
        ${cells}
        <td class="total-col">${fmtH(w.totalMinutes)}</td>
      </tr>`;
    }).join('');

    const grandTotal = workers.reduce((a, w) => a + w.totalMinutes, 0);
    const title = LANG === 'ko' ? `${year}년 ${MONTHS()[month - 1]}` : `${MONTHS()[month - 1]} ${year}`;

    return `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:16px 18px">
        <div class="cal-title">${title}</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="muted">${t('grandTotal')}: <b style="color:var(--accent)">${fmtH(grandTotal)}</b> ${t('hUnit')}</span>
          <div class="cal-nav">
            <button id="cal-prev">‹</button>
            <button id="cal-next">›</button>
          </div>
        </div>
      </div>
      ${branchChips}
      ${workers.length ? `
      <div class="table-wrap">
        <table class="summary">
          <thead><tr><th class="name-col">${t('workerCol')}</th>${headCells.join('')}<th class="total-col">${t('totalCol')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted" style="margin:10px 4px 0">${editable ? t('tableHint') : t('boardMonthHint')}</p>
      ` : `<div class="card"><p class="muted">${t('noWorkers')}</p></div>`}
    `;
  }

  function bindSummaryTable(box, data, { editable, rerender }) {
    bindCalendarNav(rerender);
    box.querySelectorAll('.branch-chip').forEach((c) =>
      c.addEventListener('click', () => {
        if (editable) state.adminBranch = +c.dataset.b;
        else state.boardBranch = +c.dataset.b;
        rerender();
      })
    );
    if (!editable) return;
    box.querySelectorAll('td.day-cell').forEach((td) =>
      td.addEventListener('click', () => openDayModal(+td.dataset.worker, td.dataset.name, td.dataset.date))
    );
    box.querySelectorAll('td.name-col').forEach((td) =>
      td.addEventListener('click', () => openDayModal(+td.dataset.worker, td.dataset.name, todayStr()))
    );
  }

  // ================================================================
  //  ADMIN
  // ================================================================
  function renderAdminLogin() {
    stopTimers();
    hideNav();
    $app.className = 'no-nav';
    $app.innerHTML = `
      <div class="topbar">${brandHtml('Admin')}${langSelHtml()}</div>
      <div class="card">
        <h2>${t('adminTitle')}</h2>
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
    document.getElementById('back-btn').addEventListener('click', renderWorkerLogin);
    document.getElementById('admin-pw').focus();
    document.getElementById('admin-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('admin-error');
      err.textContent = '';
      try {
        const r = await api('/api/admin/login', { method: 'POST', body: { password: document.getElementById('admin-pw').value } });
        state.me = { role: 'admin' };
        state.month = null;
        if (r.defaultPassword) toast(t('defaultPwWarn'), 'error', 6000);
        renderAdmin();
      } catch (ex) {
        err.textContent = terr(ex);
      }
    });
  }

  async function renderAdmin() {
    stopTimers();
    hideNav();
    $app.className = 'wide';
    $app.innerHTML = `
      <div class="topbar">
        ${brandHtml('Admin')}
        <div style="display:flex;gap:8px;align-items:center">
          ${langSelHtml()}
          <button class="chip gray" id="logout-btn">${t('logout')}</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab ${state.adminTab === 'calendar' ? 'active' : ''}" data-tab="calendar">${t('tabCalendar')}</button>
        <button class="tab ${state.adminTab === 'workers' ? 'active' : ''}" data-tab="workers">${t('tabWorkers')}</button>
        <button class="tab ${state.adminTab === 'branches' ? 'active' : ''}" data-tab="branches">${t('tabBranches')}</button>
        <button class="tab ${state.adminTab === 'settings' ? 'active' : ''}" data-tab="settings">${t('tabSettings')}</button>
      </div>
      <div id="tab-content"><div class="loading-screen" style="padding-top:80px"><div class="spinner"></div></div></div>
    `;
    bindLangSel();
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      state.me = null;
      renderWorkerLogin();
    });
    document.querySelectorAll('.tab').forEach((tab) =>
      tab.addEventListener('click', () => { state.adminTab = tab.dataset.tab; renderAdmin(); })
    );

    const box = document.getElementById('tab-content');
    try {
      if (state.adminTab === 'calendar') await adminCalendarTab(box);
      else if (state.adminTab === 'workers') await adminWorkersTab(box);
      else if (state.adminTab === 'branches') await adminBranchesTab(box);
      else await adminSettingsTab(box);
    } catch (ex) {
      if (ex.code === 'AUTH_ADMIN') return renderAdminLogin();
      box.innerHTML = `<div class="card"><p class="error-text">${esc(terr(ex))}</p></div>`;
    }
  }

  // ---------- Admin: Kalendar ----------
  async function adminCalendarTab(box) {
    const { year, month } = currentMonth();
    const data = await api(`/api/admin/summary?year=${year}&month=${month}`);
    box.innerHTML = summaryTableHtml(data, { editable: true });
    bindSummaryTable(box, data, { editable: true, rerender: renderAdmin });
  }

  // Kun tafsiloti + tahrirlash oynasi
  async function openDayModal(workerId, name, date) {
    const [y, m] = date.split('-').map(Number);
    const data = await api(`/api/admin/worker/${workerId}/summary?year=${y}&month=${m}`);
    const dd = data.days[date] || { sessions: [], minutes: 0, open: false };

    const modal = openModal(`
      <div class="modal-head">
        <h2 style="margin:0">${esc(name)} — ${dayTitle(date)}</h2>
        <button class="modal-close" id="m-close">✕</button>
      </div>
      <p class="muted">${t('dayTotal')}: <b style="color:var(--green)">${fmtH(dd.minutes)}</b> ${t('hUnit')}${dd.open ? ` <span style="color:var(--amber)">(${t('nowWorking')})</span>` : ''}</p>
      <div id="m-sessions">
        ${dd.sessions.map((s) => `
          <div class="entry-edit-row" data-entry="${s.id}">
            <input type="time" class="e-in" value="${s.in}">
            <span>→</span>
            <input type="time" class="e-out" value="${s.out || ''}">
            <button class="chip e-save" title="${t('save')}">💾</button>
            <button class="chip red e-del" title="🗑">🗑</button>
          </div>`).join('') || `<p class="muted" style="padding:8px 0">${t('noRecords')}</p>`}
      </div>
      <div style="border-top:1.5px solid var(--line);margin-top:16px;padding-top:14px">
        <b style="font-size:14px">${t('manualAdd')}</b>
        <div class="entry-edit-row">
          <input type="time" id="new-in">
          <span>→</span>
          <input type="time" id="new-out">
          <button class="chip" id="new-add">${t('add')}</button>
        </div>
      </div>
      <div class="error-text" id="m-error"></div>
    `);

    const err = modal.querySelector('#m-error');
    const refresh = () => { closeModal(); renderAdmin(); };
    modal.querySelector('#m-close').addEventListener('click', closeModal);

    modal.querySelectorAll('.entry-edit-row[data-entry]').forEach((row) => {
      const id = row.dataset.entry;
      row.querySelector('.e-save').addEventListener('click', async () => {
        err.textContent = '';
        try {
          await api(`/api/admin/entries/${id}`, { method: 'PUT', body: { in: row.querySelector('.e-in').value, out: row.querySelector('.e-out').value || null } });
          toast(t('saved'), 'success');
          refresh();
        } catch (ex) { err.textContent = terr(ex); }
      });
      row.querySelector('.e-del').addEventListener('click', async () => {
        if (!confirm(t('delEntryConfirm'))) return;
        try {
          await api(`/api/admin/entries/${id}`, { method: 'DELETE' });
          toast(t('deleted'), 'success');
          refresh();
        } catch (ex) { err.textContent = terr(ex); }
      });
    });

    modal.querySelector('#new-add').addEventListener('click', async () => {
      err.textContent = '';
      try {
        await api('/api/admin/entries', {
          method: 'POST',
          body: { workerId, date, in: modal.querySelector('#new-in').value, out: modal.querySelector('#new-out').value || null },
        });
        toast(t('added'), 'success');
        refresh();
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  // ---------- Admin: Ishchilar ----------
  async function adminWorkersTab(box) {
    const [workers, branches] = await Promise.all([
      api('/api/admin/workers'),
      api('/api/branches'),
    ]);
    const branchName = (id) => branches.find((b) => b.id === id)?.name || '—';
    const branchOptions = (sel) => branches.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)}</option>`).join('');

    box.innerHTML = `
      <div class="card" style="max-width:600px">
        <h2>${t('addWorker')}</h2>
        <form id="add-form">
          <div class="form-row">
            <div><label>${t('fullName')}</label><input id="add-name" placeholder="${t('namePh')}"></div>
            <div><label>${t('password')}</label><input id="add-pw" placeholder="${t('pwPh')}"></div>
          </div>
          ${branches.length > 1 ? `<label>${t('branch')}</label><select id="add-branch">${branchOptions(branches[0].id)}</select>` : ''}
          <div class="error-text" id="add-error"></div>
          <button class="btn" type="submit">${t('add')}</button>
        </form>
      </div>
      <div class="card" style="max-width:600px">
        <h2>${t('workersList', workers.length)}</h2>
        ${workers.map((w) => `
          <div class="worker-admin-row" data-id="${w.id}">
            <span class="avatar" style="background:${avatarColor(w.name)}">${esc(initials(w.name))}</span>
            <div class="info">
              <div class="name">${esc(w.name)}${w.active ? '' : `<span class="badge-inactive">${t('inactive')}</span>`}</div>
              <div class="sub">${esc(branchName(w.branchId))}</div>
            </div>
            <div class="actions">
              <button class="chip w-pw">${t('changePw')}</button>
              ${branches.length > 1 ? `<button class="chip w-branch">🏢</button>` : ''}
              <button class="chip gray w-toggle">${w.active ? '⏸' : '▶'}</button>
              <button class="chip red w-del">🗑</button>
            </div>
          </div>`).join('') || `<p class="muted">${t('noWorkers')}</p>`}
      </div>
    `;

    document.getElementById('add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('add-error');
      err.textContent = '';
      try {
        await api('/api/admin/workers', {
          method: 'POST',
          body: {
            name: document.getElementById('add-name').value,
            password: document.getElementById('add-pw').value,
            branchId: document.getElementById('add-branch')?.value,
          },
        });
        toast(t('workerAdded'), 'success');
        renderAdmin();
      } catch (ex) { err.textContent = terr(ex); }
    });

    box.querySelectorAll('.worker-admin-row').forEach((row) => {
      const id = row.dataset.id;
      const w = workers.find((x) => String(x.id) === id);
      row.querySelector('.w-pw').addEventListener('click', () => {
        const pw = prompt(t('pwPrompt', w.name));
        if (pw === null) return;
        api(`/api/admin/workers/${id}`, { method: 'PUT', body: { password: pw } })
          .then(() => toast(t('pwChanged'), 'success'))
          .catch((ex) => toast(terr(ex), 'error'));
      });
      row.querySelector('.w-branch')?.addEventListener('click', () => {
        const modal = openModal(`
          <div class="modal-head"><h2 style="margin:0">${esc(w.name)}</h2><button class="modal-close" id="m-close">✕</button></div>
          <label>${t('chooseBranch')}</label>
          <select id="b-select">${branchOptions(w.branchId)}</select>
          <button class="btn" id="b-save" style="margin-top:16px">${t('save')}</button>
        `);
        modal.querySelector('#m-close').addEventListener('click', closeModal);
        modal.querySelector('#b-save').addEventListener('click', async () => {
          try {
            await api(`/api/admin/workers/${id}`, { method: 'PUT', body: { branchId: modal.querySelector('#b-select').value } });
            toast(t('branchChanged'), 'success');
            closeModal();
            renderAdmin();
          } catch (ex) { toast(terr(ex), 'error'); }
        });
      });
      row.querySelector('.w-toggle').addEventListener('click', async () => {
        try {
          await api(`/api/admin/workers/${id}`, { method: 'PUT', body: { active: !w.active } });
          renderAdmin();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      row.querySelector('.w-del').addEventListener('click', async () => {
        if (!confirm(t('delWorkerConfirm', w.name))) return;
        try {
          await api(`/api/admin/workers/${id}`, { method: 'DELETE' });
          toast(t('deleted'), 'success');
          renderAdmin();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
    });
  }

  // ---------- Admin: Filiallar va QR ----------
  async function adminBranchesTab(box) {
    const branches = await api('/api/admin/branches');
    box.innerHTML = `
      <div class="card" style="max-width:600px">
        <h2>${t('addBranch')}</h2>
        <p class="muted" style="margin-bottom:10px">${t('branchNote')}</p>
        <form id="add-branch-form">
          <div class="form-row">
            <input id="branch-name" placeholder="${t('branchPh')}">
            <button class="btn" type="submit" style="flex:0 0 auto;width:auto;padding:14px 22px">${t('add')}</button>
          </div>
          <div class="error-text" id="branch-error"></div>
        </form>
      </div>
      ${branches.map((b) => `
        <div class="card qr-card" style="max-width:600px" data-id="${b.id}">
          <div class="modal-head" style="margin-bottom:4px">
            <h2 style="margin:0">🏢 ${esc(b.name)}</h2>
            <span class="muted">${t('workersUnit', b.workers)}</span>
          </div>
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
      <p class="muted" style="max-width:600px">${t('qrRotateNote')}</p>
    `;

    document.getElementById('add-branch-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('branch-error');
      err.textContent = '';
      try {
        await api('/api/admin/branches', { method: 'POST', body: { name: document.getElementById('branch-name').value } });
        toast(t('branchAdded'), 'success');
        renderAdmin();
      } catch (ex) { err.textContent = terr(ex); }
    });

    box.querySelectorAll('.card[data-id]').forEach((card) => {
      const id = card.dataset.id;
      const b = branches.find((x) => String(x.id) === id);
      card.querySelector('.b-print').addEventListener('click', () => {
        // Faqat shu filial QR'i chop etilsin
        document.querySelectorAll('.print-area').forEach((p) => p.classList.toggle('hidden', p.dataset.branch !== id));
        window.print();
        document.querySelectorAll('.print-area').forEach((p) => p.classList.remove('hidden'));
      });
      card.querySelector('.b-rename').addEventListener('click', async () => {
        const name = prompt(t('branchNewName'), b.name);
        if (!name) return;
        try {
          await api(`/api/admin/branches/${id}`, { method: 'PUT', body: { name } });
          renderAdmin();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      card.querySelector('.b-rotate').addEventListener('click', async () => {
        if (!confirm(t('newQrConfirm', b.name))) return;
        try {
          await api(`/api/admin/branches/${id}/qr/rotate`, { method: 'POST' });
          toast(t('qrRotated'), 'success');
          renderAdmin();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
      card.querySelector('.b-del').addEventListener('click', async () => {
        if (!confirm(t('delBranchConfirm', b.name))) return;
        try {
          await api(`/api/admin/branches/${id}`, { method: 'DELETE' });
          toast(t('deleted'), 'success');
          renderAdmin();
        } catch (ex) { toast(terr(ex), 'error'); }
      });
    });
  }

  // ---------- Admin: Sozlamalar ----------
  async function adminSettingsTab(box) {
    const s = await api('/api/admin/settings');
    const opts = TIMEZONES.map(([tz, label]) =>
      `<option value="${tz}" ${tz === s.timezone ? 'selected' : ''}>${label} — ${tz}</option>`).join('');
    const custom = TIMEZONES.some(([tz]) => tz === s.timezone) ? '' :
      `<option value="${esc(s.timezone)}" selected>${esc(s.timezone)}</option>`;
    box.innerHTML = `
      <div class="card" style="max-width:600px">
        <h2>${t('settingsTitle')}</h2>
        <label>${t('timezone')}</label>
        <select id="tz-select">${custom}${opts}</select>
        <p class="muted" style="margin-top:10px">${t('tzNote')}</p>
        <div class="error-text" id="tz-error"></div>
        <button class="btn" id="tz-save">${t('save')}</button>
      </div>
    `;
    document.getElementById('tz-save').addEventListener('click', async () => {
      const err = document.getElementById('tz-error');
      err.textContent = '';
      try {
        await api('/api/admin/settings', { method: 'PUT', body: { timezone: document.getElementById('tz-select').value } });
        toast(t('saved'), 'success');
      } catch (ex) { err.textContent = terr(ex); }
    });
  }

  // ================================================================
  //  BOSHLASH
  // ================================================================
  async function boot() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    try {
      const me = await api('/api/me');
      if (me.role === 'worker') { state.me = me; state.view = 'home'; return renderWorkerView(); }
      if (me.role === 'admin') { state.me = me; return renderAdmin(); }
    } catch {}
    renderWorkerLogin();
  }

  boot();
})();
