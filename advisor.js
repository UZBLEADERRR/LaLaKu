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

module.exports = { generateAdvice, llmSummary, fmtWon, fmtHours };
