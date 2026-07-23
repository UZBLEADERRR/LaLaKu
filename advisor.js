// AlbaFit — Moliyaviy AI yordamchi (maslahat generatori).
// Ikki qatlam: (1) bepul, kalitsiz ishlaydigan qoida-asosli engine;
// (2) ixtiyoriy Claude API (ANTHROPIC_API_KEY bo'lsa) — tabiiy tilda xulosa.

const T = {
  uz: {
    hello: (n) => `Salom, ${n}!`,
    noData: 'Hali yetarli maʼlumot yoʻq. Bir necha kun ishlang — men tahlil qilib, shaxsiy maslahatlar beraman.',
    summary: (h, w) => `Bu oy ${h} ishlab, ${w} topdingiz.`,
    pace: {
      up: (p) => `Zoʻr surʼat! Oʻtgan oyga nisbatan ${p}% koʻproq ishladingiz. Shu tarzda davom eting.`,
      down: (p) => `Bu oy oʻtgan oyga nisbatan ${p}% kam ishladingiz. Rejangizni koʻrib chiqing.`,
      same: 'Ish surʼatingiz oʻtgan oy bilan bir xil — barqarorlik yaxshi belgi.',
    },
    expenseHigh: (p) => `Chiqimlaringiz daromadning ${p}% ini tashkil etyapti. Buni 50% dan past ushlashga harakat qiling.`,
    expenseOk: (p) => `Chiqim/daromad nisbati ${p}% — juda yaxshi nazorat. Ortgan pulni jamgʻarmaga yoʻnaltiring.`,
    saveTip: (a) => `Har oy ${a} tejay olsangiz, yil oxirida jiddiy jamgʻarma yigʻiladi.`,
    goalEta: (g, w) => `"${g}" maqsadingizga yetishga ~${w} hafta qoldi. Sur'atni saqlang!`,
    goalClose: (g) => `"${g}" maqsadingizga oz qoldi — yana bir oz jamgʻaring va yeting!`,
    goalDone: (g) => `Tabriklaymiz! "${g}" maqsadiga yetdingiz 🎉`,
    overtime: (h) => `Bu oy ${h} qoʻshimcha (8 soatdan ortiq) ishladingiz — bu qoʻshimcha daromad. Ammo dam olishni ham unutmang.`,
    consistency: (d) => `Bu oy ${d} kun ishladingiz. Muntazamlik barqaror daromadga olib keladi.`,
    debtDue: (t, d) => `Eslatma: "${t}" toʻlovigacha ${d} kun qoldi. Oldindan ajratib qoʻying.`,
    payday: (d) => `Maoshingizga ${d} kun qoldi. Byudjetni shu kunga rejalashtiring.`,
    encourage: 'Har bir ishlangan soat sizni maqsadingizga yaqinlashtiradi. Davom eting! 💪',
  },
  en: {
    hello: (n) => `Hi, ${n}!`,
    noData: 'Not enough data yet. Work a few days and I\'ll analyze and give you personal tips.',
    summary: (h, w) => `This month you worked ${h} and earned ${w}.`,
    pace: {
      up: (p) => `Great pace! You worked ${p}% more than last month. Keep it up.`,
      down: (p) => `You worked ${p}% less than last month. Review your plan.`,
      same: 'Your pace matches last month — consistency is a good sign.',
    },
    expenseHigh: (p) => `Your expenses are ${p}% of income. Try to keep them under 50%.`,
    expenseOk: (p) => `Expense/income ratio is ${p}% — great control. Move the surplus into savings.`,
    saveTip: (a) => `If you save ${a} monthly, you\'ll build serious savings by year-end.`,
    goalEta: (g, w) => `You\'re ~${w} weeks from your "${g}" goal. Keep the pace!`,
    goalClose: (g) => `You\'re almost at your "${g}" goal — save a bit more and reach it!`,
    goalDone: (g) => `Congrats! You reached your "${g}" goal 🎉`,
    overtime: (h) => `You worked ${h} overtime (over 8h/day) this month — extra income. But don\'t forget to rest.`,
    consistency: (d) => `You worked ${d} days this month. Regularity leads to stable income.`,
    debtDue: (t, d) => `Reminder: "${t}" payment is due in ${d} days. Set it aside early.`,
    payday: (d) => `Payday is in ${d} days. Plan your budget around it.`,
    encourage: 'Every hour worked brings you closer to your goal. Keep going! 💪',
  },
  ko: {
    hello: (n) => `안녕하세요, ${n}님!`,
    noData: '아직 데이터가 부족합니다. 며칠 근무하시면 분석하여 맞춤 조언을 드립니다.',
    summary: (h, w) => `이번 달 ${h} 근무하고 ${w} 벌었습니다.`,
    pace: {
      up: (p) => `좋은 페이스! 지난달보다 ${p}% 더 일했습니다. 계속하세요.`,
      down: (p) => `지난달보다 ${p}% 적게 일했습니다. 계획을 점검하세요.`,
      same: '지난달과 비슷한 페이스 — 꾸준함은 좋은 신호입니다.',
    },
    expenseHigh: (p) => `지출이 소득의 ${p}%입니다. 50% 미만으로 유지하세요.`,
    expenseOk: (p) => `지출/소득 비율 ${p}% — 훌륭한 관리. 남은 돈을 저축으로 옮기세요.`,
    saveTip: (a) => `매달 ${a} 저축하면 연말에 상당한 저축이 됩니다.`,
    goalEta: (g, w) => `"${g}" 목표까지 약 ${w}주 남았습니다. 페이스를 유지하세요!`,
    goalClose: (g) => `"${g}" 목표에 거의 도달했습니다 — 조금만 더 모으세요!`,
    goalDone: (g) => `축하합니다! "${g}" 목표를 달성했습니다 🎉`,
    overtime: (h) => `이번 달 ${h} 초과근무(하루 8시간 초과)했습니다 — 추가 수입입니다. 휴식도 잊지 마세요.`,
    consistency: (d) => `이번 달 ${d}일 근무했습니다. 규칙성이 안정적인 수입으로 이어집니다.`,
    debtDue: (t, d) => `알림: "${t}" 결제까지 ${d}일 남았습니다. 미리 준비하세요.`,
    payday: (d) => `급여일까지 ${d}일 남았습니다. 예산을 계획하세요.`,
    encourage: '매 시간의 노력이 목표에 가까워지게 합니다. 계속하세요! 💪',
  },
};

function fmtWon(v) { return '₩' + Math.round(v).toLocaleString('en-US'); }
function fmtHours(min) { return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`; }

// Qoida-asosli maslahat generatori. ctx — moliyaviy kontekst (raqamlar).
function generateAdvice(ctx, lang = 'uz') {
  const t = T[lang] || T.uz;
  const tips = [];
  const add = (id, icon, severity, text) => tips.push({ id, icon, severity, text });

  if (ctx.thisMonth.minutes < 60) {
    return { greeting: t.hello(ctx.name), summary: t.noData, tips: [], stats: ctx.stats };
  }

  // 1) Oylik surʼat taqqoslash
  if (ctx.lastMonth.minutes > 0) {
    const diff = Math.round(((ctx.thisMonth.minutes - ctx.lastMonth.minutes) / ctx.lastMonth.minutes) * 100);
    if (diff >= 8) add('pace', '📈', 'good', t.pace.up(diff));
    else if (diff <= -8) add('pace', '📉', 'warn', t.pace.down(Math.abs(diff)));
    else add('pace', '➡️', 'info', t.pace.same);
  }

  // 2) Chiqim/daromad nisbati
  const income = ctx.thisMonth.net + ctx.finance.income;
  if (income > 0 && ctx.finance.expenses > 0) {
    const ratio = Math.round((ctx.finance.expenses / income) * 100);
    if (ratio >= 60) add('expense', '⚠️', 'warn', t.expenseHigh(ratio));
    else add('expense', '✅', 'good', t.expenseOk(ratio));
  }

  // 3) Jamgʻarma imkoniyati
  const leftover = income - ctx.finance.expenses - ctx.finance.debts;
  if (leftover > 0) add('save', '💰', 'good', t.saveTip(fmtWon(leftover)));

  // 4) Maqsadlar
  for (const g of ctx.goals) {
    const pct = g.target > 0 ? g.saved / g.target : 0;
    if (pct >= 1) add('goal_' + g.id, '🎯', 'good', t.goalDone(g.title));
    else if (pct >= 0.85) add('goal_' + g.id, '🎯', 'info', t.goalClose(g.title));
    else if (leftover > 0 && pct < 0.85) {
      const remaining = g.target - g.saved;
      const weeks = Math.max(1, Math.ceil(remaining / Math.max(1, leftover / 4.3)));
      if (weeks <= 52) add('goal_' + g.id, '🎯', 'info', t.goalEta(g.title, weeks));
    }
  }

  // 5) Overtime tan olish
  if (ctx.thisMonth.overtimeMin >= 60) add('overtime', '⏱', 'info', t.overtime(fmtHours(ctx.thisMonth.overtimeMin)));

  // 6) Muntazamlik
  if (ctx.thisMonth.days >= 3) add('consistency', '📅', 'info', t.consistency(ctx.thisMonth.days));

  // 7) Qarz eslatmasi
  if (ctx.finance.nextDebt) add('debt', '🔔', 'warn', t.debtDue(ctx.finance.nextDebt.title, ctx.finance.nextDebt.days));

  // 8) Ragʻbat
  add('encourage', '💪', 'good', t.encourage);

  return {
    greeting: t.hello(ctx.name),
    summary: t.summary(fmtHours(ctx.thisMonth.minutes), fmtWon(ctx.thisMonth.net)),
    tips,
    stats: ctx.stats,
  };
}

// Ixtiyoriy: Claude API orqali tabiiy, shaxsiylashtirilgan xulosa.
// ANTHROPIC_API_KEY yoʻq boʻlsa null qaytaradi (qoida-asosli javob ishlatiladi).
async function llmSummary(ctx, lang = 'uz') {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const langName = { uz: 'Uzbek', en: 'English', ko: 'Korean' }[lang] || 'Uzbek';
  const prompt = `You are AlbaFit's friendly financial assistant for a part-time worker in Korea. `
    + `Based on this data, write 2-3 short, warm, actionable sentences of financial advice in ${langName}. `
    + `Be specific with numbers. Do not use markdown.\n\nData:\n${JSON.stringify(ctx, null, 2)}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = (j.content || []).map((c) => c.text || '').join('').trim();
    return text || null;
  } catch {
    return null;
  }
}

// ---------------- CHAT (savol-javob) ----------------
const CHAT = {
  uz: {
    earn: (h, w) => `Bu oy ${h} ishlab, ${w} topdingiz (soliqdan keyin).`,
    expense: (e, r) => `Bu oy chiqimlaringiz ${e}. Daromadning ${r}% i. Uni 50% dan past ushlashga harakat qiling.`,
    save: (a) => `Hozircha ${a} qoladigan koʻrinadi. Uni jamgʻarmaga yoki maqsadga yoʻnaltiring.`,
    goalsNone: 'Sizda hali moliyaviy maqsad yoʻq. Moliya boʻlimidan qoʻshsangiz, men kuzatib boraman.',
    goalsList: (s) => `Maqsadlaringiz: ${s}`,
    goalOne: (t, p, r) => `"${t}" — ${p}% bajarildi, yana ${r} qoldi.`,
    afford: (l, y, n) => y ? `Ha, ${n} ni koʻtara olasiz — hozir ${l} qoladigan pulingiz bor.` : `Hozircha qiyin: faqat ${l} qoladi, bu ${n} dan kam. Biroz jamgʻaring yoki koʻproq ishlang.`,
    hours: (h, d) => `Bu oy ${h} ishladingiz (${d} kun).`,
    help: 'Mendan soʻrashingiz mumkin: "qancha topdim", "xarajatlarim", "necha soat ishladim", "jamgʻara olamanmi", "maqsadlarim". Yaxshiroq suhbat uchun ilova egasidan ANTHROPIC_API_KEY qoʻshishni soʻrang.',
    fallback: (h, w) => `Bu oy ${h} ishlab, ${w} topdingiz. Batafsil: xarajat, jamgʻarma yoki maqsadlar haqida soʻrang.`,
  },
  en: {
    earn: (h, w) => `This month you worked ${h} and earned ${w} (after tax).`,
    expense: (e, r) => `Your expenses this month are ${e} — ${r}% of income. Try to keep them under 50%.`,
    save: (a) => `You have about ${a} left over. Put it into savings or a goal.`,
    goalsNone: 'You have no financial goals yet. Add one in Finance and I\'ll track it.',
    goalsList: (s) => `Your goals: ${s}`,
    goalOne: (t, p, r) => `"${t}" — ${p}% done, ${r} to go.`,
    afford: (l, y, n) => y ? `Yes, you can afford ${n} — you have ${l} left over.` : `Not quite: only ${l} left, less than ${n}. Save a bit more or work more.`,
    hours: (h, d) => `You worked ${h} this month (${d} days).`,
    help: 'You can ask me: "how much did I earn", "my expenses", "hours worked", "can I save", "my goals". For richer chat, ask the app owner to add ANTHROPIC_API_KEY.',
    fallback: (h, w) => `This month you worked ${h} and earned ${w}. Ask me about expenses, savings, or goals.`,
  },
  ko: {
    earn: (h, w) => `이번 달 ${h} 근무하고 ${w} 벌었습니다 (세후).`,
    expense: (e, r) => `이번 달 지출은 ${e}, 소득의 ${r}%입니다. 50% 미만으로 유지하세요.`,
    save: (a) => `약 ${a} 남습니다. 저축이나 목표에 넣으세요.`,
    goalsNone: '아직 목표가 없습니다. 재무 탭에서 추가하면 추적해 드립니다.',
    goalsList: (s) => `목표: ${s}`,
    goalOne: (t, p, r) => `"${t}" — ${p}% 완료, ${r} 남음.`,
    afford: (l, y, n) => y ? `네, ${n} 구입 가능합니다 — ${l} 남았습니다.` : `조금 부족합니다: ${l}만 남아 ${n}보다 적습니다. 더 저축하세요.`,
    hours: (h, d) => `이번 달 ${h} 근무했습니다 (${d}일).`,
    help: '이렇게 물어보세요: "얼마 벌었나요", "지출", "근무 시간", "저축 가능한가요", "목표". 더 나은 대화를 위해 앱 소유자에게 ANTHROPIC_API_KEY 추가를 요청하세요.',
    fallback: (h, w) => `이번 달 ${h} 근무하고 ${w} 벌었습니다. 지출, 저축, 목표에 대해 물어보세요.`,
  },
};

// Xabardan raqam ajratib olish (masalan "500000 so'm" -> 500000)
function extractAmount(msg) {
  const m = String(msg).replace(/[,\s]/g, '').match(/(\d{3,})/);
  return m ? parseInt(m[1], 10) : null;
}

// Qoida-asosli chat javobi (kalitsiz ishlaydi)
function chatReply(ctx, message, lang = 'uz') {
  const c = CHAT[lang] || CHAT.uz;
  const t = T[lang] || T.uz;
  const msg = String(message || '').toLowerCase();
  const income = ctx.thisMonth.net + ctx.finance.income;
  const leftover = income - ctx.finance.expenses - ctx.finance.debts;
  const has = (...words) => words.some((w) => msg.includes(w));

  // "... ni ko'tara olamanmi / afford" — summa bilan
  const amount = extractAmount(msg);
  if (amount && has('olama', 'ko\'tar', 'kotar', 'afford', 'sotib', 'buy', '살', '구입')) {
    return c.afford(fmtWon(leftover), leftover >= amount, fmtWon(amount));
  }
  if (has('topdim', 'topgan', 'daromad', 'maosh', 'earn', 'income', 'salary', '벌', '수입', '급여')) {
    return c.earn(fmtHours(ctx.thisMonth.minutes), fmtWon(ctx.thisMonth.net));
  }
  if (has('soat', 'ishladim', 'hour', 'worked', '시간', '근무')) {
    return c.hours(fmtHours(ctx.thisMonth.minutes), ctx.thisMonth.days);
  }
  if (has('xarajat', 'chiqim', 'expense', 'spend', '지출', '비용')) {
    const ratio = income > 0 ? Math.round((ctx.finance.expenses / income) * 100) : 0;
    return c.expense(fmtWon(ctx.finance.expenses), ratio);
  }
  if (has('jamg', 'tejash', 'tejay', 'save', 'saving', '저축', '모으')) {
    return c.save(fmtWon(Math.max(0, leftover)));
  }
  if (has('maqsad', 'goal', '목표')) {
    if (!ctx.goals.length) return c.goalsNone;
    if (ctx.goals.length === 1) {
      const g = ctx.goals[0];
      const p = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0;
      return c.goalOne(g.title, p, fmtWon(Math.max(0, g.target - g.saved)));
    }
    return c.goalsList(ctx.goals.map((g) => `${g.title} (${g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0}%)`).join(', '));
  }
  if (has('salom', 'hi', 'hello', 'hey', '안녕')) {
    return `${t.hello(ctx.name)} ${c.fallback(fmtHours(ctx.thisMonth.minutes), fmtWon(ctx.thisMonth.net))}`;
  }
  if (has('yordam', 'help', 'nima', 'what can', '도움')) return c.help;
  return c.fallback(fmtHours(ctx.thisMonth.minutes), fmtWon(ctx.thisMonth.net));
}

// Ixtiyoriy: Claude API bilan to'liq suhbat
async function llmChat(ctx, history, message, lang = 'uz') {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const langName = { uz: 'Uzbek', en: 'English', ko: 'Korean' }[lang] || 'Uzbek';
  const system = `You are AlbaFit's friendly, concise financial assistant for a part-time worker in Korea. `
    + `Always reply in ${langName}. Be warm, specific with numbers, and practical. Keep replies to 1-4 sentences. No markdown. `
    + `Here is the user's current financial data (KRW):\n${JSON.stringify(ctx)}`;
  const msgs = [];
  for (const h of (history || []).slice(-10)) {
    if (!h || !h.text) continue;
    msgs.push({ role: h.role === 'user' ? 'user' : 'assistant', content: String(h.text) });
  }
  msgs.push({ role: 'user', content: String(message || '') });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system,
        messages: msgs,
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = (j.content || []).map((x) => x.text || '').join('').trim();
    return text || null;
  } catch {
    return null;
  }
}

module.exports = { generateAdvice, llmSummary, chatReply, llmChat, fmtWon, fmtHours };
