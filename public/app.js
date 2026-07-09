/* LaLaKu Vaqt — mijoz ilovasi */
(() => {
  const $app = document.getElementById('app');
  const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const DOWS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
  const AVATAR_COLORS = ['#4f46e5', '#0d9488', '#b45309', '#be185d', '#7c3aed', '#0369a1', '#059669', '#dc2626'];

  const state = {
    me: null,                    // {role, id, name}
    month: null,                 // {year, month} — ko'rilayotgan oy
    selectedDay: null,
    adminTab: 'calendar',
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
    if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
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

  function toast(msg, type = '', ms = 3200) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), ms);
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

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

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
    hint: document.getElementById('scanner-hint'),
    stream: null,
    raf: null,

    async open(onCode) {
      this.el.classList.remove('hidden');
      this.hint.textContent = 'QR kodni ramka ichiga joylashtiring';
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        this.close();
        toast("Kameraga ruxsat berilmadi. Brauzer sozlamalaridan kameraga ruxsat bering.", 'error', 5000);
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
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.video.srcObject = null;
      this.el.classList.add('hidden');
    },
  };
  document.getElementById('scanner-cancel').addEventListener('click', () => scanner.close());

  // ================================================================
  //  ISHCHI: LOGIN
  // ================================================================
  async function renderWorkerLogin() {
    stopTimer();
    $app.className = '';
    let workers = [];
    try { workers = await api('/api/workers'); } catch {}

    $app.innerHTML = `
      <div class="topbar"><div class="brand"><div class="logo">⏱</div> LaLaKu Vaqt</div></div>
      <div class="card">
        <h2>Ismingizni tanlang</h2>
        <div class="worker-list" id="worker-list">
          ${workers.length ? workers.map((w) => `
            <button class="worker-item" data-id="${w.id}" data-name="${esc(w.name)}">
              <span class="avatar" style="background:${avatarColor(w.name)}">${esc(initials(w.name))}</span>
              ${esc(w.name)}
            </button>`).join('') : `<p class="muted">Hozircha ishchilar qo'shilmagan. Admin panel orqali ishchi qo'shing.</p>`}
        </div>
      </div>
      <button class="btn ghost" id="go-admin">Admin panelga kirish</button>
    `;
    document.getElementById('go-admin').addEventListener('click', renderAdminLogin);
    document.querySelectorAll('.worker-item').forEach((btn) =>
      btn.addEventListener('click', () => renderPasswordStep(+btn.dataset.id, btn.dataset.name))
    );
  }

  function renderPasswordStep(workerId, name) {
    $app.innerHTML = `
      <div class="topbar"><div class="brand"><div class="logo">⏱</div> LaLaKu Vaqt</div></div>
      <div class="card" style="text-align:center">
        <span class="avatar" style="background:${avatarColor(name)};margin:0 auto 10px;width:60px;height:60px;font-size:22px;display:flex">${esc(initials(name))}</span>
        <h2 style="margin-bottom:4px">${esc(name)}</h2>
        <p class="muted">Parolingizni kiriting</p>
        <form id="pw-form">
          <label style="text-align:left">Parol</label>
          <input type="password" id="pw-input" autocomplete="current-password" inputmode="numeric" autofocus>
          <div class="error-text" id="pw-error"></div>
          <button class="btn" type="submit" style="margin-top:4px">Kirish</button>
        </form>
      </div>
      <button class="btn ghost" id="back-btn">← Orqaga</button>
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
        renderWorkerHome();
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
  }

  // ================================================================
  //  ISHCHI: BOSH SAHIFA
  // ================================================================
  async function renderWorkerHome() {
    stopTimer();
    $app.className = '';
    const { year, month } = currentMonth();
    let status, summary;
    try {
      [status, summary] = await Promise.all([
        api('/api/my/status'),
        api(`/api/my/summary?year=${year}&month=${month}`),
      ]);
    } catch (ex) {
      if (/kiring/i.test(ex.message)) return renderWorkerLogin();
      toast(ex.message, 'error');
      return;
    }

    const today = todayStr();
    const todayData = summary.days[today];
    const todayMin = todayData ? todayData.minutes : 0;

    $app.innerHTML = `
      <div class="topbar">
        <div class="brand"><div class="logo">⏱</div> LaLaKu Vaqt</div>
        <button class="chip gray" id="logout-btn">Chiqish</button>
      </div>

      <div class="card status-card">
        <span class="status-badge ${status.checkedIn ? 'in' : 'out'}">
          ${status.checkedIn ? '🟢 Siz ishdasiz' : 'Siz ishda emassiz'}
        </span>
        <div class="status-time" id="status-time">${status.checkedIn ? '' : '—'}</div>
        <div class="status-sub">${status.checkedIn
          ? `Kelgan vaqtingiz: <b>${status.since}</b>${status.sinceDate !== today ? ` (${status.sinceDate})` : ''}`
          : `Salom, <b>${esc(state.me.name)}</b>! Ishga kelganingizda QR kodni skanerlang.`}</div>
      </div>

      <button class="scan-btn ${status.checkedIn ? 'leave' : 'arrive'}" id="scan-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg>
        ${status.checkedIn ? 'Ketish — QR skanerlash' : 'Ishga keldim — QR skanerlash'}
      </button>

      <div class="stat-row">
        <div class="stat"><div class="value">${fmtH(todayMin)}</div><div class="label">Bugun ishlangan</div></div>
        <div class="stat"><div class="value">${fmtH(summary.totalMinutes)}</div><div class="label">${MONTHS[month - 1]} jami (soat)</div></div>
      </div>

      <div class="card">
        ${calendarHtml(summary, year, month)}
        <div class="day-detail ${state.selectedDay ? '' : 'hidden'}" id="day-detail">
          ${state.selectedDay ? dayDetailHtml(summary, state.selectedDay) : ''}
        </div>
      </div>
    `;

    if (status.checkedIn && status.sinceIso) {
      const started = new Date(status.sinceIso);
      const upd = () => {
        const mins = Math.max(0, Math.floor((Date.now() - started) / 60_000));
        document.getElementById('status-time').textContent = fmtH(mins);
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
          toast(r.action === 'in'
            ? `✅ Xush kelibsiz! Kelish vaqti yozildi: ${r.time}`
            : `👋 Yaxshi boring! Ketish vaqti yozildi: ${r.time}`, 'success', 4500);
          renderWorkerHome();
        } catch (ex) {
          toast(ex.message, 'error', 4500);
        }
      });
    });

    bindCalendarNav(renderWorkerHome);
    bindCalendarCells((date) => {
      state.selectedDay = state.selectedDay === date ? null : date;
      const det = document.getElementById('day-detail');
      if (state.selectedDay) {
        det.innerHTML = dayDetailHtml(summary, state.selectedDay);
        det.classList.remove('hidden');
      } else det.classList.add('hidden');
      document.querySelectorAll('.cal-cell').forEach((c) => (c.style.outline = c.dataset.date === state.selectedDay ? '2px solid var(--accent)' : ''));
    });
  }

  function calendarHtml(summary, year, month) {
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // dushanbadan boshlanadi
    const today = todayStr();
    let cells = DOWS.map((d) => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < lead; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${pad(month)}-${pad(d)}`;
      const dd = summary.days[date];
      const cls = ['cal-cell'];
      if (dd?.open) cls.push('open-day');
      else if (dd && dd.minutes > 0) cls.push('worked');
      if (date === today) cls.push('today');
      cells += `<div class="${cls.join(' ')}" data-date="${date}">
        <div class="d">${d}</div>
        <div class="h">${dd ? (dd.minutes > 0 ? fmtH(dd.minutes) : (dd.open ? '•••' : '')) : ''}</div>
      </div>`;
    }
    return `
      <div class="cal-head">
        <div class="cal-title">${MONTHS[month - 1]} ${year}</div>
        <div class="cal-nav">
          <button id="cal-prev" aria-label="Oldingi oy">‹</button>
          <button id="cal-next" aria-label="Keyingi oy">›</button>
        </div>
      </div>
      <div class="cal-grid">${cells}</div>
    `;
  }

  function dayDetailHtml(summary, date) {
    const dd = summary.days[date];
    const [y, m, d] = date.split('-');
    const title = `${+d}-${MONTHS[+m - 1].toLowerCase()}`;
    if (!dd) return `<b>${title}</b><p class="muted" style="margin-top:6px">Bu kunda yozuvlar yo'q</p>`;
    return `<b>${title}</b> — jami ${fmtH(dd.minutes)} soat${dd.open ? ' (davom etmoqda)' : ''}
      ${dd.sessions.map((s) => {
        return `<div class="session-row">
          <span class="times">${s.in} → ${s.out || '...'}</span>
          <span class="dur">${s.out ? durOf(s) + ' soat' : 'ishda'}</span>
        </div>`;
      }).join('')}`;
  }

  const durOf = (s) => {
    const [h1, m1] = s.in.split(':').map(Number);
    const [h2, m2] = s.out.split(':').map(Number);
    let mins = h2 * 60 + m2 - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    return fmtH(mins);
  };

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
  //  ADMIN: LOGIN
  // ================================================================
  function renderAdminLogin() {
    stopTimer();
    $app.className = '';
    $app.innerHTML = `
      <div class="topbar"><div class="brand"><div class="logo">⏱</div> LaLaKu Vaqt — Admin</div></div>
      <div class="card">
        <h2>Admin panel</h2>
        <form id="admin-form">
          <label>Admin parol</label>
          <input type="password" id="admin-pw" autocomplete="current-password">
          <div class="error-text" id="admin-error"></div>
          <button class="btn" type="submit" style="margin-top:4px">Kirish</button>
        </form>
      </div>
      <button class="btn ghost" id="back-btn">← Ishchi sifatida kirish</button>
    `;
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
        if (r.defaultPassword) toast("⚠️ Standart parol ishlatilmoqda. Railway'da ADMIN_PASSWORD env o'rnating!", 'error', 6000);
        renderAdmin();
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
  }

  // ================================================================
  //  ADMIN: PANEL
  // ================================================================
  async function renderAdmin() {
    stopTimer();
    $app.className = 'wide';
    $app.innerHTML = `
      <div class="topbar">
        <div class="brand"><div class="logo">⏱</div> LaLaKu Vaqt — Admin</div>
        <button class="chip gray" id="logout-btn">Chiqish</button>
      </div>
      <div class="tabs">
        <button class="tab ${state.adminTab === 'calendar' ? 'active' : ''}" data-tab="calendar">📅 Kalendar</button>
        <button class="tab ${state.adminTab === 'workers' ? 'active' : ''}" data-tab="workers">👥 Ishchilar</button>
        <button class="tab ${state.adminTab === 'qr' ? 'active' : ''}" data-tab="qr">🔳 QR kod</button>
      </div>
      <div id="tab-content"><div class="loading-screen"><div class="spinner"></div></div></div>
    `;
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/logout', { method: 'POST' });
      state.me = null;
      renderWorkerLogin();
    });
    document.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => { state.adminTab = t.dataset.tab; renderAdmin(); })
    );

    const box = document.getElementById('tab-content');
    try {
      if (state.adminTab === 'calendar') await adminCalendarTab(box);
      else if (state.adminTab === 'workers') await adminWorkersTab(box);
      else await adminQrTab(box);
    } catch (ex) {
      if (/kiring/i.test(ex.message)) return renderAdminLogin();
      box.innerHTML = `<div class="card"><p class="error-text">${esc(ex.message)}</p></div>`;
    }
  }

  // ---------- Admin: Kalendar ----------
  async function adminCalendarTab(box) {
    const { year, month } = currentMonth();
    const data = await api(`/api/admin/summary?year=${year}&month=${month}`);
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = todayStr();

    const headCells = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      headCells.push(`<th class="${dow === 0 || dow === 6 ? 'wknd' : ''}">${d}<br><span style="font-weight:600;opacity:.7">${DOWS[(dow + 6) % 7]}</span></th>`);
    }

    const rows = data.workers.map((w) => {
      let cells = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${pad(month)}-${pad(d)}`;
        const dd = w.days[date];
        const cls = dd ? (dd.open ? 'day-cell open' : 'day-cell has') : 'day-cell';
        cells += `<td class="${cls}" data-worker="${w.id}" data-date="${date}" data-name="${esc(w.name)}">${dd ? (dd.minutes > 0 ? fmtH(dd.minutes) : '•') : '·'}</td>`;
      }
      return `<tr>
        <td class="name-col" data-worker="${w.id}" data-name="${esc(w.name)}">${esc(w.name)}${w.active ? '' : '<span class="badge-inactive">nofaol</span>'}</td>
        ${cells}
        <td class="total-col">${fmtH(w.totalMinutes)}</td>
      </tr>`;
    }).join('');

    const grandTotal = data.workers.reduce((a, w) => a + w.totalMinutes, 0);

    box.innerHTML = `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div class="cal-title" style="font-size:18px">${MONTHS[month - 1]} ${year}</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="muted">Umumiy: <b style="color:var(--accent)">${fmtH(grandTotal)}</b> soat</span>
          <div class="cal-nav">
            <button id="cal-prev">‹</button>
            <button id="cal-next">›</button>
          </div>
        </div>
      </div>
      ${data.workers.length ? `
      <div class="table-wrap">
        <table class="summary">
          <thead><tr><th class="name-col">Ishchi</th>${headCells.join('')}<th class="total-col">Jami</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:10px">Katakni bosib kun tafsilotini ko'ring yoki vaqtni tahrirlang. Soatlar S:DD formatida.</p>
      ` : `<div class="card"><p class="muted">Ishchilar yo'q. «Ishchilar» bo'limidan qo'shing.</p></div>`}
    `;

    bindCalendarNav(renderAdmin);
    box.querySelectorAll('td.day-cell').forEach((td) =>
      td.addEventListener('click', () => openDayModal(+td.dataset.worker, td.dataset.name, td.dataset.date))
    );
    box.querySelectorAll('td.name-col').forEach((td) =>
      td.addEventListener('click', () => openDayModal(+td.dataset.worker, td.dataset.name, today))
    );
  }

  // Kun tafsiloti + tahrirlash oynasi
  async function openDayModal(workerId, name, date) {
    const [y, m] = date.split('-').map(Number);
    const data = await api(`/api/admin/worker/${workerId}/summary?year=${y}&month=${m}`);
    const dd = data.days[date] || { sessions: [], minutes: 0, open: false };
    const [, , d] = date.split('-');

    const modal = openModal(`
      <div class="modal-head">
        <h2 style="margin:0">${esc(name)} — ${+d}-${MONTHS[m - 1].toLowerCase()}</h2>
        <button class="modal-close" id="m-close">✕</button>
      </div>
      <p class="muted">Jami: <b>${fmtH(dd.minutes)}</b> soat${dd.open ? ' (hozir ishda)' : ''}</p>
      <div id="m-sessions">
        ${dd.sessions.map((s) => `
          <div class="entry-edit-row" data-entry="${s.id}">
            <input type="time" class="e-in" value="${s.in}">
            <span>→</span>
            <input type="time" class="e-out" value="${s.out || ''}">
            <button class="chip e-save" title="Saqlash">💾</button>
            <button class="chip red e-del" title="O'chirish">🗑</button>
          </div>`).join('') || `<p class="muted" style="padding:8px 0">Bu kunda yozuvlar yo'q</p>`}
      </div>
      <div style="border-top:1.5px solid var(--line);margin-top:14px;padding-top:12px">
        <b style="font-size:14px">Qo'lda yozuv qo'shish</b>
        <div class="entry-edit-row">
          <input type="time" id="new-in">
          <span>→</span>
          <input type="time" id="new-out">
          <button class="chip" id="new-add">＋ Qo'shish</button>
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
          toast('Saqlandi', 'success');
          refresh();
        } catch (ex) { err.textContent = ex.message; }
      });
      row.querySelector('.e-del').addEventListener('click', async () => {
        if (!confirm("Yozuv o'chirilsinmi?")) return;
        try {
          await api(`/api/admin/entries/${id}`, { method: 'DELETE' });
          toast("O'chirildi", 'success');
          refresh();
        } catch (ex) { err.textContent = ex.message; }
      });
    });

    modal.querySelector('#new-add').addEventListener('click', async () => {
      err.textContent = '';
      try {
        await api('/api/admin/entries', {
          method: 'POST',
          body: { workerId, date, in: modal.querySelector('#new-in').value, out: modal.querySelector('#new-out').value || null },
        });
        toast("Qo'shildi", 'success');
        refresh();
      } catch (ex) { err.textContent = ex.message; }
    });
  }

  // ---------- Admin: Ishchilar ----------
  async function adminWorkersTab(box) {
    const workers = await api('/api/admin/workers');
    box.innerHTML = `
      <div class="card" style="max-width:560px">
        <h2>Yangi ishchi qo'shish</h2>
        <form id="add-form">
          <div class="form-row">
            <div><label>Ism familiya</label><input id="add-name" placeholder="Masalan: Aziz Karimov"></div>
            <div><label>Parol</label><input id="add-pw" placeholder="Kamida 4 belgi"></div>
          </div>
          <div class="error-text" id="add-error"></div>
          <button class="btn" type="submit">＋ Qo'shish</button>
        </form>
      </div>
      <div class="card" style="max-width:560px">
        <h2>Ishchilar (${workers.length})</h2>
        ${workers.map((w) => `
          <div class="worker-admin-row" data-id="${w.id}">
            <span class="avatar" style="background:${avatarColor(w.name)}">${esc(initials(w.name))}</span>
            <div class="info">
              <div class="name">${esc(w.name)}${w.active ? '' : '<span class="badge-inactive">nofaol</span>'}</div>
            </div>
            <div class="actions">
              <button class="chip w-pw" title="Parolni almashtirish">🔑 Parol</button>
              <button class="chip gray w-toggle">${w.active ? '⏸ Nofaol' : '▶ Faollash'}</button>
              <button class="chip red w-del">🗑</button>
            </div>
          </div>`).join('') || `<p class="muted">Hozircha ishchilar yo'q</p>`}
      </div>
    `;

    document.getElementById('add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('add-error');
      err.textContent = '';
      try {
        await api('/api/admin/workers', {
          method: 'POST',
          body: { name: document.getElementById('add-name').value, password: document.getElementById('add-pw').value },
        });
        toast("Ishchi qo'shildi", 'success');
        renderAdmin();
      } catch (ex) { err.textContent = ex.message; }
    });

    box.querySelectorAll('.worker-admin-row').forEach((row) => {
      const id = row.dataset.id;
      const w = workers.find((x) => String(x.id) === id);
      row.querySelector('.w-pw').addEventListener('click', () => {
        const pw = prompt(`${w.name} uchun yangi parol (kamida 4 belgi):`);
        if (pw === null) return;
        api(`/api/admin/workers/${id}`, { method: 'PUT', body: { password: pw } })
          .then(() => toast("Parol o'zgartirildi", 'success'))
          .catch((ex) => toast(ex.message, 'error'));
      });
      row.querySelector('.w-toggle').addEventListener('click', async () => {
        try {
          await api(`/api/admin/workers/${id}`, { method: 'PUT', body: { active: !w.active } });
          renderAdmin();
        } catch (ex) { toast(ex.message, 'error'); }
      });
      row.querySelector('.w-del').addEventListener('click', async () => {
        if (!confirm(`${w.name} o'chirilsinmi? Barcha vaqt yozuvlari ham o'chadi! (Vaqtincha yashirish uchun «Nofaol» tugmasini ishlating.)`)) return;
        try {
          await api(`/api/admin/workers/${id}`, { method: 'DELETE' });
          toast("O'chirildi", 'success');
          renderAdmin();
        } catch (ex) { toast(ex.message, 'error'); }
      });
    });
  }

  // ---------- Admin: QR kod ----------
  async function adminQrTab(box) {
    const qr = await api('/api/admin/qr');
    box.innerHTML = `
      <div class="card qr-box" style="max-width:560px">
        <h2>Ish joyi QR kodi</h2>
        <p class="muted" style="margin-bottom:14px">Bu kodni chop etib, ish joyiga (kiraverishga) osib qo'ying.
        Ishchilar kelganda va ketganda shu kodni skanerlashadi.</p>
        <div class="print-area">
          <img src="${qr.dataUrl}" alt="QR kod">
          <div style="font-weight:800;font-size:20px">LaLaKu Vaqt — davomat QR kodi</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn outline" id="qr-print">🖨 Chop etish</button>
          <button class="btn red" id="qr-rotate">♻️ Yangi kod</button>
        </div>
        <p class="muted" style="margin-top:12px;font-size:13px">«Yangi kod» bosilsa eski chop etilgan kod ishlamay qoladi — yangisini chop etish kerak bo'ladi.</p>
      </div>
    `;
    document.getElementById('qr-print').addEventListener('click', () => window.print());
    document.getElementById('qr-rotate').addEventListener('click', async () => {
      if (!confirm('Yangi QR kod yaratilsinmi? Eski kod ishlamay qoladi.')) return;
      await api('/api/admin/qr/rotate', { method: 'POST' });
      toast('Yangi QR kod yaratildi', 'success');
      renderAdmin();
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
      if (me.role === 'worker') { state.me = me; return renderWorkerHome(); }
      if (me.role === 'admin') { state.me = me; return renderAdmin(); }
    } catch {}
    renderWorkerLogin();
  }

  boot();
})();
