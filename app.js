'use strict';

/* =========================================================
   Helpers
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24">${ICONS[name] || ICONS['circle-dollar-sign']}</svg>`;

// exact amounts: tiyn shown only when present (1 500 ₸ / 1 500,50 ₸)
const fmt = n => {
  const a = Math.round(Math.abs(n) * 100) / 100;
  const frac = Math.round(a * 100) % 100 !== 0;
  return (n < 0 && a ? '−' : '') + a.toLocaleString('ru-RU', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 }) + ' ₸';
};
// computed guidance (limits, averages): whole tenge
const fmt0 = n => fmt(n < 0 ? -Math.floor(-n) : Math.floor(n));
const signed = n => (n > 0 ? '+' : '') + fmt(n);
const compact = n => {
  const a = Math.abs(n);
  const f = (v, d) => v.toLocaleString('ru-RU', { maximumFractionDigits: d });
  if (a >= 1e6) return f(n / 1e6, a >= 1e7 ? 1 : 2) + ' млн';
  if (a >= 1e3) return f(n / 1e3, a >= 1e4 ? 0 : 1) + ' тыс';
  return f(n, 0);
};
const fmtShort = n => (Math.abs(n) >= 1e6 ? (n < 0 ? '−' : '') + compact(Math.abs(n)) + ' ₸' : fmt(n));

const plural = (n, f) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return f[a > 10 && a < 20 ? 2 : b > 1 && b < 5 ? 1 : b === 1 ? 0 : 2];
};
const DAYS = ['день', 'дня', 'дней'];

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MON_AXIS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON_DAT = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#a16207', '#78716c', '#64748b', '#334155'];

const UI_ICONS = new Set(['plus', 'x', 'chevron-left', 'chevron-right', 'list', 'chart-pie', 'settings',
  'arrow-down-wide-narrow', 'arrow-up-narrow-wide', 'arrow-right', 'trash-2', 'download', 'upload', 'check', 'search']);
const PICKER_ICONS = Object.keys(ICONS).filter(n => !UI_ICONS.has(n));

/* kinds: income source → wallet → category.
   tx types: income, expense, transfer, adjust (balance correction after a bank check, signed amount) */
const LISTS = { income: 'incomes', wallet: 'wallets', category: 'categories' };
const TX_KINDS = { income: ['income', 'wallet'], expense: ['wallet', 'category'], transfer: ['wallet', 'wallet'], adjust: ['wallet', 'wallet'] };
const TARGETS = { income: ['wallet'], wallet: ['wallet', 'category'] };
const txTypeFor = (src, dst) => (src === 'income' ? 'income' : dst === 'wallet' ? 'transfer' : 'expense');

/* =========================================================
   Storage
   ========================================================= */
const KEY = 'money-tracker.v1';

function seed() {
  return {
    v: 2,
    incomes: [
      { id: uid(), name: 'Зарплата', icon: 'briefcase', color: '#22c55e' },
      { id: uid(), name: 'Другое', icon: 'hand-coins', color: '#14b8a6' },
    ],
    wallets: [
      { id: uid(), name: 'Наличные', icon: 'banknote', color: '#f59e0b', initial: 0 },
      { id: uid(), name: 'BCC', icon: 'credit-card', color: '#3b82f6', initial: 0 },
    ],
    categories: [
      { id: uid(), name: 'Продукты', icon: 'shopping-cart', color: '#f97316', budget: 0 },
      { id: uid(), name: 'Кафе', icon: 'coffee', color: '#a16207', budget: 0 },
      { id: uid(), name: 'Транспорт', icon: 'bus', color: '#0ea5e9', budget: 0 },
      { id: uid(), name: 'Дом', icon: 'house', color: '#6366f1', budget: 0 },
      { id: uid(), name: 'Здоровье', icon: 'heart-pulse', color: '#ef4444', budget: 0 },
      { id: uid(), name: 'Покупки', icon: 'shopping-bag', color: '#ec4899', budget: 0 },
      { id: uid(), name: 'Развлечения', icon: 'gamepad-2', color: '#8b5cf6', budget: 0 },
      { id: uid(), name: 'Связь', icon: 'smartphone', color: '#64748b', budget: 0 },
    ],
    tx: [],
    quick: [],
    lastBackup: null,
  };
}

const defaultPlan = () => ({ on: true, paydays: [1, 16], reserve: 0, exclude: [], bills: [] });

// Bring any saved / imported data up to the current shape.
function normalize(d) {
  d.plan = d.plan || defaultPlan();
  d.plan.bills = d.plan.bills || [];
  d.plan.exclude = d.plan.exclude || [];
  d.quick = d.quick || [];
  if ((d.v || 1) < 2) {
    // v2: the app went Russian — rename the untouched English defaults
    const RU = { Salary: 'Зарплата', Other: 'Другое', Cash: 'Наличные', Groceries: 'Продукты', Cafe: 'Кафе',
      Transport: 'Транспорт', Home: 'Дом', Health: 'Здоровье', Shopping: 'Покупки', Fun: 'Развлечения', Mobile: 'Связь' };
    for (const k of ['incomes', 'wallets', 'categories']) d[k].forEach(i => { if (RU[i.name]) i.name = RU[i.name]; });
    d.v = 2;
  }
  return d;
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (valid(d)) return d;
  } catch (e) { /* fall through */ }
  return null;
}
const valid = d => d && ['incomes', 'wallets', 'categories', 'tx'].every(k => Array.isArray(d[k]));

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Не удалось сохранить — хранилище недоступно'); }
}

const pref = {
  get(k, def) { try { return JSON.parse(localStorage.getItem('mt.' + k)) ?? def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('mt.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

let S = normalize(load() || seed());
save();
navigator.storage?.persist?.().catch(() => {});

// Snapshot the data before a change; calling the result restores it.
function snapshot() {
  const snap = JSON.stringify(S);
  return () => {
    S = JSON.parse(snap);
    save();
    if (!sheetRoot.hidden) closeSheet();
    render();
  };
}

const now = new Date();
const UI = {
  tab: 'home',
  period: { mode: pref.get('mode', 'month'), y: now.getFullYear(), m: now.getMonth() },
  sort: pref.get('sort', 'manual'),
  sel: null,
  hf: 'all',
  q: '',
  openCat: null,
};

/* =========================================================
   Data queries
   ========================================================= */
const list = kind => S[LISTS[kind]];
const find = (kind, id) => list(kind).find(i => i.id === id);
const DELETED = { name: 'Удалено', icon: 'circle-dollar-sign', color: '#78716c' };
const findOr = (kind, id) => find(kind, id) || DELETED;

function inPeriod(date, P = UI.period) {
  if (P.mode === 'all') return true;
  if (P.mode === 'year') return date.startsWith(String(P.y));
  return date.startsWith(`${P.y}-${pad(P.m + 1)}`);
}
const periodTx = () => S.tx.filter(t => inPeriod(t.date));
const rangeTx = (s, e) => S.tx.filter(t => t.date >= s && t.date <= e); // inclusive

// Wallet balances, optionally only counting records before a date (exclusive).
function balances(before) {
  const b = {};
  S.wallets.forEach(w => (b[w.id] = +w.initial || 0));
  for (const t of S.tx) {
    if (before && t.date >= before) continue;
    const add = (id, v) => (b[id] = (b[id] || 0) + v);
    if (t.type === 'income') add(t.to, t.amount);
    else if (t.type === 'expense') add(t.from, -t.amount);
    else if (t.type === 'transfer') { add(t.from, -t.amount); add(t.to, t.amount); }
    else if (t.type === 'adjust') add(t.to, t.amount);
  }
  return b;
}

function sums(txs) {
  const inc = {}, exp = {};
  let totalInc = 0, totalExp = 0;
  for (const t of txs) {
    if (t.type === 'income') { inc[t.from] = (inc[t.from] || 0) + t.amount; totalInc += t.amount; }
    if (t.type === 'expense') { exp[t.to] = (exp[t.to] || 0) + t.amount; totalExp += t.amount; }
  }
  return { inc, exp, totalInc, totalExp };
}

function subsFor(catId) {
  const c = {};
  for (const t of S.tx) if (t.type === 'expense' && t.to === catId && t.sub) c[t.sub] = (c[t.sub] || 0) + 1;
  return Object.keys(c).sort((a, b) => c[b] - c[a]);
}

const sortTx = arr => arr.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.ts || 0) - (a.ts || 0)));
const dateOf = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((b - a) / 864e5);
const shortDate = d => `${d.getDate()} ${MON[d.getMonth()]}`;

/* ---------- pay-period plan: "можно потратить сегодня" ----------
   Daily limit = (money − unpaid bills − reserve, as of the start of today) / days left until payday.
   Overspend today → tomorrow's limit shrinks; underspend → it grows. */
function payPeriod(ref = new Date()) {
  const days = [...new Set(S.plan.paydays)].filter(d => d >= 1 && d <= 31).sort((a, b) => a - b);
  if (!days.length) return null;
  const at = (y, m, d) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));
  const t = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const cands = [];
  for (let k = -1; k <= 1; k++) for (const d of days) cands.push(at(t.getFullYear(), t.getMonth() + k, d));
  cands.sort((a, b) => a - b);
  const start = cands.filter(c => c <= t).pop();
  const end = cands.find(c => c > t);
  return { start, end, today: t };
}
const prevPayPeriod = pp => payPeriod(new Date(pp.start.getFullYear(), pp.start.getMonth(), pp.start.getDate() - 1));
const counted = id => !S.plan.exclude.includes(id) && !!find('wallet', id);
const countedBalance = bal => S.wallets.filter(w => counted(w.id)).reduce((a, w) => a + (bal[w.id] || 0), 0);

function planInfo() {
  const p = S.plan;
  if (!p.on) return null;
  const pp = payPeriod();
  if (!pp) return null;
  const balance = countedBalance(balances());
  const tdy = ymd(pp.today), startS = ymd(pp.start);
  // money leaving the counted wallets: expenses + transfers to excluded wallets (e.g. a deposit).
  // Bill payments are planned money and corrections are past money — neither eats into today.
  const outflow = t => !t.bill && ((t.type === 'expense' && counted(t.from)) ||
    (t.type === 'transfer' && counted(t.from) && !counted(t.to)));
  let spentToday = 0, spentPeriod = 0;
  for (const t of S.tx) {
    if (!outflow(t)) continue;
    if (t.date === tdy) spentToday += t.amount;
    if (t.date >= startS && t.date <= tdy) spentPeriod += t.amount;
  }
  const bills = billsInPeriod(pp);
  const unpaid = bills.filter(b => !b.paid);
  const billsLeft = unpaid.reduce((a, b) => a + b.b.amount, 0);
  const daysLeft = dayDiff(pp.today, pp.end); // including today
  const free = balance - p.reserve - billsLeft;
  const limit = Math.max(0, (free + spentToday) / daysLeft);
  const leftToday = limit - spentToday;
  const tomorrow = daysLeft > 1 ? Math.max(0, free / (daysLeft - 1)) : null;
  return { ...pp, balance, spentToday, spentPeriod, daysLeft, limit, leftToday, tomorrow, free, bills, unpaid, billsLeft };
}

/* ---------- mandatory payments (bills) ----------
   A bill belongs to the pay period its due day falls in. Until it is paid,
   its amount is set aside and excluded from the daily limit. */
const dueIn = (b, y, m) => new Date(y, m, Math.min(b.day, new Date(y, m + 1, 0).getDate()));

function billsInPeriod(pp) {
  const s = ymd(pp.start), e = ymd(pp.end);
  const out = [];
  for (const b of S.plan.bills) {
    for (let k = 0; k <= 1; k++) {
      const due = dueIn(b, pp.start.getFullYear(), pp.start.getMonth() + k);
      if (due >= pp.start && due < pp.end) { out.push({ b, due }); break; }
    }
  }
  out.forEach(o => (o.paid = S.tx.find(t => t.bill === o.b.id && t.date >= s && t.date < e) || null));
  return out.sort((a, b) => a.due - b.due);
}

function nextDue(b, after) {
  for (let k = 0; k <= 2; k++) {
    const d = dueIn(b, after.getFullYear(), after.getMonth() + k);
    if (d >= after) return d;
  }
}

/* =========================================================
   Rendering — shell
   ========================================================= */
const view = $('#view');

function periodLabel(P = UI.period) {
  if (P.mode === 'all') return 'Всё время';
  if (P.mode === 'year') return `${P.y} год`;
  return P.y === now.getFullYear() ? MONTHS[P.m] : `${MONTHS[P.m]} ${P.y}`;
}

function renderTopbar() {
  const tb = $('#topbar');
  if (UI.tab === 'settings') { tb.innerHTML = '<h1>Настройки</h1>'; return; }
  const P = UI.period;
  const arrows = P.mode !== 'all';
  tb.innerHTML = `
    <div class="pnav">
      <button class="icon-btn" data-act="prev" ${arrows ? '' : 'hidden'} aria-label="Назад">${icon('chevron-left')}</button>
      <button class="period" data-act="today">${esc(periodLabel())}</button>
      <button class="icon-btn" data-act="next" ${arrows ? '' : 'hidden'} aria-label="Вперёд">${icon('chevron-right')}</button>
    </div>
    <div class="seg">
      ${['month', 'year', 'all'].map(m => `<button data-act="mode" data-mode="${m}" class="${P.mode === m ? 'on' : ''}">${{ month: 'Месяц', year: 'Год', all: 'Всё' }[m]}</button>`).join('')}
    </div>`;
}

function render() {
  renderTopbar();
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === UI.tab));
  const top = view.scrollTop;
  ({ home: renderHome, history: renderHistory, analytics: renderAnalytics, settings: renderSettings })[UI.tab]();
  view.scrollTop = top;
}

function setTab(tab) {
  if (tab === UI.tab) { view.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  clearSel();
  hideTip();
  UI.tab = tab;
  render();
  view.scrollTop = 0;
}

/* =========================================================
   Home
   ========================================================= */
function tile(kind, it, amount, extra = '', amtCls = '') {
  return `<button class="tile" data-kind="${kind}" data-id="${it.id}" style="--c:${it.color}">
    <span class="coin">${icon(it.icon)}</span>
    <span class="tname">${esc(it.name)}</span>
    <span class="tamt ${amtCls}">${fmtShort(amount)}</span>${extra}
  </button>`;
}
const addTile = kind =>
  `<button class="tile add" data-act="new" data-kind="${kind}"><span class="coin">${icon('plus')}</span><span class="tname">Добавить</span><span class="tamt">&nbsp;</span></button>`;

function renderHome() {
  const bal = balances();
  const s = sums(periodTx());
  const totalBal = S.wallets.reduce((a, w) => a + (bal[w.id] || 0), 0);
  const P = UI.period;

  let cats = [...S.categories];
  if (UI.sort === 'desc') cats.sort((a, b) => (s.exp[b.id] || 0) - (s.exp[a.id] || 0));
  if (UI.sort === 'asc') cats.sort((a, b) => (s.exp[a.id] || 0) - (s.exp[b.id] || 0));
  const sortLabel = { manual: ['list', 'Мой порядок'], desc: ['arrow-down-wide-narrow', 'Сначала большие'], asc: ['arrow-up-narrow-wide', 'Сначала малые'] }[UI.sort];

  view.innerHTML = `
    ${planCard()}
    ${quickBlock()}
    <section class="sec">
      <div class="sec-head"><div class="left"><h3>Доходы</h3><div class="total">${fmt(s.totalInc)}</div></div></div>
      <div class="row">
        ${S.incomes.map(i => tile('income', i, s.inc[i.id] || 0, '', s.inc[i.id] ? '' : 'zero')).join('')}
        ${addTile('income')}
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><div class="left"><h3>Кошельки</h3><div class="total">${fmt(totalBal)}</div></div></div>
      <div class="row">
        ${S.wallets.map(w => tile('wallet', w, bal[w.id] || 0, '', (bal[w.id] || 0) < 0 ? 'neg' : '')).join('')}
        ${addTile('wallet')}
      </div>
    </section>

    <section class="sec">
      <div class="sec-head">
        <div class="left"><h3>Расходы</h3><div class="total">${fmt(s.totalExp)}</div></div>
        <button class="sort-btn" data-act="sort">${icon(sortLabel[0])}${sortLabel[1]}</button>
      </div>
      <div class="grid">
        ${cats.map(c => {
          const spent = s.exp[c.id] || 0;
          let extra = '';
          if (c.budget > 0 && P.mode === 'month') {
            const pct = Math.min(100, (spent / c.budget) * 100);
            extra = `<span class="bud ${spent > c.budget ? 'over' : ''}"><i style="width:${pct}%"></i></span>`;
          }
          return tile('category', c, spent, extra, spent ? '' : 'zero');
        }).join('')}
        ${addTile('category')}
      </div>
    </section>`;
  if (UI.sel) applySel();
}

function planCard() {
  const p = planInfo();
  if (!p) return '';
  const over = p.leftToday < 0;
  const pct = p.limit > 0 ? Math.min(100, (p.spentToday / p.limit) * 100) : 100;
  let note;
  if (p.free <= 0) note = `Не хватает ${fmt(-p.free)} на ${p.unpaid.length ? 'платежи' : 'запас'} до ${shortDate(p.end)}.`;
  else if (over && p.tomorrow !== null) note = `Перерасход ${fmt0(-p.leftToday)} — завтра лимит станет ${fmt0(p.tomorrow)}.`;
  else note = `${fmt0(p.limit)} в день · до зарплаты ${p.daysLeft} ${plural(p.daysLeft, DAYS)} (${shortDate(p.end)})`;
  return `<section class="sec plan" data-act="plan">
    <div class="plan-top">
      <div><div class="plan-label">${over ? 'Перерасход сегодня' : 'Можно потратить сегодня'}</div>
      <div class="plan-big ${over || p.free <= 0 ? 'neg' : 'ok'}">${fmt0(over ? -p.leftToday : p.leftToday)}</div></div>
      <div class="plan-right"><span>До ${shortDate(p.end)}</span><b>${fmt(Math.max(0, p.free))}</b></div>
    </div>
    <div class="bar plan-bar ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    <div class="plan-note">${note}</div>
    ${p.unpaid.length ? (() => {
      const nx = p.unpaid[0], late = nx.due < p.today;
      return `<div class="plan-bills ${late ? 'late' : ''}">${icon('lock')}<span>${fmt(p.billsLeft)} отложено на ${p.unpaid.length} ${plural(p.unpaid.length, ['платёж', 'платежа', 'платежей'])} · ${late ? 'просрочен' : 'ближайший'}: ${esc(nx.b.name)}, ${shortDate(nx.due)}</span></div>`;
    })() : ''}
  </section>`;
}

/* ---------- quick spends (one-tap templates) ---------- */
function quickSuggestions() {
  const since = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));
  const c = new Map();
  for (const t of S.tx) {
    if (t.type !== 'expense' || t.date < since || t.bill || !find('category', t.to)) continue;
    const k = `${t.to}|${t.sub}|${t.amount}`;
    const e = c.get(k) || { to: t.to, sub: t.sub, amount: t.amount, from: t.from, n: 0 };
    e.n++;
    c.set(k, e);
  }
  return [...c.values()]
    .filter(e => e.n >= 3 && !S.quick.some(q => q.to === e.to && (q.sub || '') === (e.sub || '') && q.amount === e.amount))
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
}

function quickBlock() {
  const sugg = quickSuggestions();
  const chips = S.quick.map(q => {
    const cat = findOr('category', q.to);
    return `<button class="qchip" data-act="quick" data-id="${q.id}" style="--c:${cat.color}">
      <span class="qcoin">${icon(cat.icon)}</span>
      <span class="qtext"><b>${esc(q.name)}</b><small>${q.amount ? fmt(q.amount) : 'сумма?'}</small></span>
    </button>`;
  }).join('');
  const suggChips = sugg.map((e, i) => {
    const cat = findOr('category', e.to);
    return `<button class="qchip sugg" data-act="quick-sugg" data-i="${i}" style="--c:${cat.color}">
      <span class="qcoin">${icon('plus')}</span>
      <span class="qtext"><b>${esc(e.sub || cat.name)}</b><small>${fmt(e.amount)} · ${e.n}×</small></span>
    </button>`;
  }).join('');
  return `<section class="sec quick">
    <div class="sec-head"><h3>Быстрые траты</h3>${S.quick.length ? `<button class="sort-btn" data-act="quick-manage">${icon('pencil')}Настроить</button>` : ''}</div>
    <div class="row qrow">
      ${chips}${suggChips}
      <button class="qchip add" data-act="quick-new"><span class="qcoin">${icon('plus')}</span><span class="qtext"><b>${S.quick.length ? 'Ещё' : 'Создать'}</b><small>одно касание</small></span></button>
    </div>
  </section>`;
}

function useQuick(id) {
  const q = S.quick.find(x => x.id === id);
  if (!q) return;
  if (!find('category', q.to)) return toast('Категория удалена — выберите новую'), openQuick(id);
  const from = find('wallet', q.from) ? q.from : S.wallets[0]?.id;
  if (!from) return toast('Сначала добавьте кошелёк');
  if (!q.amount) return openTx({ type: 'expense', from, to: q.to, sub: q.sub });
  const undo = snapshot();
  S.tx.push({ id: uid(), type: 'expense', from, to: q.to, amount: q.amount, date: today(), sub: q.sub || '', note: '', ts: Date.now() });
  save();
  render();
  toast(`${q.name}: −${fmt(q.amount)}`, undo);
}

function openQuick(id, pre) {
  const ex = id ? S.quick.find(x => x.id === id) : null;
  const defWallet = (S.wallets.find(w => counted(w.id)) || S.wallets[0] || {}).id;
  const q = ex ? { ...ex } : { name: '', amount: '', from: defWallet, to: S.categories[0]?.id, sub: '', ...pre };
  if (!S.categories.length || !S.wallets.length) return toast('Нужны хотя бы один кошелёк и одна категория');
  const sh = openSheet(`
    ${sheetHead(ex ? 'Быстрая трата' : 'Новая быстрая трата')}
    <div class="field"><span>Название</span><input id="q-name" maxlength="20" placeholder="Кофе" value="${esc(q.name)}" autocomplete="off" enterkeyhint="done"></div>
    <div class="field"><span>Сумма</span><input id="q-amount" inputmode="decimal" placeholder="спрашивать каждый раз" value="${q.amount || ''}" enterkeyhint="done"></div>
    <div class="field"><span>Откуда</span><select id="q-from">${S.wallets.map(w => `<option value="${w.id}" ${w.id === q.from ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
    <div class="field"><span>Категория</span><select id="q-to">${S.categories.map(c => `<option value="${c.id}" ${c.id === q.to ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><span>На что</span><input id="q-sub" placeholder="необязательно" value="${esc(q.sub)}" autocomplete="off" enterkeyhint="done"></div>
    <p class="set-note" style="padding:10px 0 0">Касание кнопки на главной сразу записывает трату на сегодня. Без суммы — откроется форма, где нужно ввести только сумму.</p>
    <div class="actions">
      ${ex ? `<button class="btn danger" id="q-del" aria-label="Удалить">${icon('trash-2')}</button>` : ''}
      <button class="btn primary" id="q-save">Сохранить</button>
    </div>`);
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  $('#q-save', sh).onclick = () => {
    const sub = $('#q-sub', sh).value.trim();
    const to = $('#q-to', sh).value;
    const name = $('#q-name', sh).value.trim() || sub || findOr('category', to).name;
    const amtRaw = $('#q-amount', sh).value.trim();
    const amount = amtRaw ? Math.round(parseAmount(amtRaw) * 100) / 100 : 0;
    if (amtRaw && !(amount > 0)) return $('#q-amount', sh).focus();
    const rec = { id: ex ? ex.id : uid(), name, amount, from: $('#q-from', sh).value, to, sub };
    if (ex) S.quick[S.quick.findIndex(x => x.id === ex.id)] = rec;
    else S.quick.push(rec);
    save();
    closeSheet();
    render();
  };
  if (ex) $('#q-del', sh).onclick = () => {
    const undo = snapshot();
    S.quick = S.quick.filter(x => x.id !== ex.id);
    save();
    closeSheet();
    render();
    toast('Быстрая трата удалена', undo);
  };
}

function openQuickList() {
  const sh = openSheet(`
    ${sheetHead('Быстрые траты')}
    <div class="list bills">${S.quick.map((q, i) => {
      const cat = findOr('category', q.to);
      return `<div class="bill-row" data-q="${q.id}">
        <span class="coin" style="--c:${cat.color}">${icon(cat.icon)}</span>
        <span class="tx-main"><div class="tx-title">${esc(q.name)}</div><div class="tx-sub">${esc(cat.name)} · ${esc(findOr('wallet', q.from).name)}</div></span>
        <b class="tx-amt">${q.amount ? fmt(q.amount) : '—'}</b>
        <span class="order-mini">
          <button class="icon-btn" data-qmove="-1" data-qi="${i}" aria-label="Выше" ${i === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button>
          <button class="icon-btn" data-qmove="1" data-qi="${i}" aria-label="Ниже" ${i === S.quick.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button>
        </span>
      </div>`;
    }).join('')}</div>
    <button class="btn add-bill" id="q-add">${icon('plus')} Добавить</button>`);
  $('#q-add', sh).onclick = () => openQuick();
  sh.addEventListener('click', e => {
    const mv = e.target.closest('[data-qmove]');
    if (mv) {
      const i = +mv.dataset.qi, j = i + +mv.dataset.qmove;
      if (j < 0 || j >= S.quick.length) return;
      [S.quick[i], S.quick[j]] = [S.quick[j], S.quick[i]];
      save();
      render();
      return openQuickList();
    }
    const row = e.target.closest('[data-q]');
    if (row) openQuick(row.dataset.q);
  });
}

/* ---------- bills ---------- */
function billStatus(o, pp) {
  if (o.paid) return { cls: 'paid', text: `Оплачено ${shortDate(dateOf(o.paid.date))}` };
  if (o.due < pp.today) return { cls: 'late', text: `Просрочено с ${shortDate(o.due)}` };
  const d = dayDiff(pp.today, o.due);
  return { cls: 'due', text: d === 0 ? 'Сегодня' : d === 1 ? 'Завтра' : `До ${shortDate(o.due)}` };
}

function billsBlock(info) {
  const bills = S.plan.bills;
  const inPer = new Map((info?.bills || []).map(o => [o.b.id, o]));
  const rows = [...bills].sort((a, b) => a.day - b.day).map(b => {
    const cat = findOr('category', b.cat);
    const o = inPer.get(b.id);
    let st;
    if (o) st = billStatus(o, info);
    else st = { cls: 'later', text: info ? `След. период · ${shortDate(nextDue(b, info.end))}` : `Каждое ${b.day}-е число` };
    return `<div class="bill-row" data-bill="${b.id}">
      <span class="coin" style="--c:${cat.color}">${icon(cat.icon)}</span>
      <span class="tx-main"><div class="tx-title">${esc(b.name)}</div><div class="tx-sub ${st.cls}">${st.text}</div></span>
      <b class="tx-amt">${fmt(b.amount)}</b>
      ${o && !o.paid ? `<button class="pay-btn" data-pay="${b.id}">Оплатить</button>` : o?.paid ? `<span class="paid-ic">${icon('check')}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="label">Обязательные платежи</div>
    ${rows ? `<div class="list bills">${rows}</div>` : '<div class="set-note" style="padding:0 0 8px">Аренда, коммуналка, интернет, кредиты, подписки. Деньги на них откладываются заранее, и дневной лимит их не трогает.</div>'}
    <button class="btn add-bill" id="bill-add">${icon('plus')} Добавить платёж</button>`;
}

function payBill(id) {
  const b = S.plan.bills.find(x => x.id === id);
  if (!b) return;
  const w = S.wallets.find(x => counted(x.id)) || S.wallets[0];
  if (!w) return toast('Сначала добавьте кошелёк');
  openTx({ type: 'expense', from: w.id, to: b.cat, amount: b.amount, sub: b.name, bill: b.id, back: openPlan });
}

function openBill(id) {
  const ex = id ? S.plan.bills.find(b => b.id === id) : null;
  if (!S.categories.length) return toast('Сначала добавьте категорию расходов');
  const b = ex ? { ...ex } : { name: '', amount: '', day: 1, cat: (S.categories.find(c => /дом|аренд|коммун|home|rent/i.test(c.name)) || S.categories[0]).id };
  const sh = openSheet(`
    ${sheetHead(ex ? 'Платёж' : 'Новый платёж')}
    <div class="field"><span>Название</span><input id="b-name" maxlength="30" placeholder="Аренда" value="${esc(b.name)}" autocomplete="off" enterkeyhint="done"></div>
    <div class="field"><span>Сумма</span><input id="b-amount" inputmode="decimal" placeholder="0 ₸" value="${b.amount}" enterkeyhint="done"></div>
    <div class="field"><span>Число месяца</span><select id="b-day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${b.day === i + 1 ? 'selected' : ''}>${i + 1}-е</option>`).join('')}</select></div>
    <div class="field"><span>Категория</span><select id="b-cat">${S.categories.map(c => `<option value="${c.id}" ${c.id === b.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <p class="set-note" style="padding:10px 0 0">Ежемесячно. Платёж попадает в тот период между зарплатами, на который приходится его дата, и до оплаты его сумма отложена. Если платите дважды в месяц — добавьте два платежа с разными числами.</p>
    <div class="actions">
      ${ex ? `<button class="btn danger" id="b-del" aria-label="Удалить">${icon('trash-2')}</button>` : ''}
      <button class="btn" id="b-back">Назад</button>
      <button class="btn primary" id="b-save">Сохранить</button>
    </div>`);
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  $('#b-back', sh).onclick = openPlan;
  $('#b-save', sh).onclick = () => {
    const name = $('#b-name', sh).value.trim();
    const amount = Math.round(parseAmount($('#b-amount', sh).value) * 100) / 100;
    if (!name) return $('#b-name', sh).focus();
    if (!(amount > 0)) return $('#b-amount', sh).focus();
    const rec = { id: ex ? ex.id : uid(), name, amount, day: +$('#b-day', sh).value, cat: $('#b-cat', sh).value };
    if (ex) S.plan.bills[S.plan.bills.findIndex(x => x.id === ex.id)] = rec;
    else S.plan.bills.push(rec);
    save();
    render();
    openPlan();
  };
  if (ex) $('#b-del', sh).onclick = () => {
    const undo = snapshot();
    S.plan.bills = S.plan.bills.filter(x => x.id !== ex.id);
    save();
    render();
    openPlan();
    toast(`Платёж «${ex.name}» удалён`, undo);
  };
}

function openPlan() {
  const p = S.plan;
  const info = planInfo();
  const row = (k, v) => `<div class="field"><span>${k}</span><b class="fv">${v}</b></div>`;
  const sh = openSheet(`
    ${sheetHead('План трат')}
    ${info ? `
      ${row('Период', `${shortDate(info.start)} – ${shortDate(new Date(info.end - 864e5))}`)}
      ${row('Денег в кошельках', fmt(info.balance))}
      ${row('Ещё оплатить', fmt(info.billsLeft))}
      ${row('Оставить в конце', fmt(p.reserve))}
      ${row('Свободно', `<span style="color:${info.free < 0 ? 'var(--neg)' : 'inherit'}">${fmt(info.free)}</span>`)}
      ${row('Потрачено за период', fmt(info.spentPeriod))}
      ${row('Осталось дней (с сегодня)', info.daysLeft)}
      ${row('Лимит на сегодня', fmt0(info.limit))}
      ${row('Потрачено сегодня', fmt(info.spentToday))}
      ${info.tomorrow !== null ? row('Лимит на завтра (если больше не тратить)', fmt0(info.tomorrow)) : ''}
      <p class="set-note" style="padding:10px 0 0">Каждое утро лимит пересчитывается: (деньги − неоплаченные платежи − запас) ÷ дни до зарплаты. Потратил меньше — завтра лимит вырастет, больше — уменьшится.</p>
      <button class="btn add-bill" id="p-summary">${icon('chart-line')} Итоги прошлого периода</button>` : ''}
    ${billsBlock(info)}
    <div class="label">Настройки</div>
    <div class="field"><span>Показывать на главной</span><input type="checkbox" id="p-on" class="switch" ${p.on ? 'checked' : ''}></div>
    <div class="field"><span>Дни зарплаты</span><input id="p-days" inputmode="text" placeholder="1, 16" value="${p.paydays.join(', ')}" autocomplete="off" enterkeyhint="done"></div>
    <div class="field"><span>Оставлять в конце периода</span><input id="p-res" inputmode="decimal" placeholder="0" value="${p.reserve || ''}" enterkeyhint="done"></div>
    <div class="field col"><span>Какие кошельки учитывать</span>
      <div class="chips" id="p-w">${S.wallets.map(w => `<button type="button" class="chip ${p.exclude.includes(w.id) ? '' : 'on'}" data-w="${w.id}">${esc(w.name)}</button>`).join('')}</div>
      <span class="hint">Отключите накопительные счета и депозиты, с которых не тратите. Перевод на них считается тратой.</span>
    </div>
    <div class="actions"><button class="btn primary" id="p-save">Сохранить</button></div>`);

  $('#bill-add', sh).onclick = () => openBill();
  $('#p-summary', sh)?.addEventListener('click', () => openSummary(prevPayPeriod(payPeriod())));
  sh.addEventListener('click', e => {
    const pay = e.target.closest('[data-pay]');
    if (pay) return payBill(pay.dataset.pay);
    const row = e.target.closest('[data-bill]');
    if (row) openBill(row.dataset.bill);
  });

  const ex = new Set(p.exclude);
  $('#p-w', sh).onclick = e => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    ex.has(b.dataset.w) ? ex.delete(b.dataset.w) : ex.add(b.dataset.w);
    b.classList.toggle('on');
  };
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  $('#p-save', sh).onclick = () => {
    const days = ($('#p-days', sh).value.match(/\d+/g) || []).map(Number).filter(d => d >= 1 && d <= 31);
    if (!days.length) return toast('Укажите хотя бы один день зарплаты, например 1, 16');
    S.plan = {
      ...S.plan,
      on: $('#p-on', sh).checked,
      paydays: [...new Set(days)].sort((a, b) => a - b),
      reserve: Math.max(0, parseAmount($('#p-res', sh).value) || 0),
      exclude: [...ex],
    };
    save();
    closeSheet();
    render();
  };
}

/* ---------- pay-period summary ---------- */
function periodStats(pp) {
  const s = ymd(pp.start), eIncl = ymd(new Date(pp.end - 864e5));
  const txs = rangeTx(s, eIncl);
  let income = 0, spent = 0, bills = 0, adjust = 0;
  const byCat = {};
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') {
      // bills land in only one of the two periods, so they'd skew the category comparison
      if (t.bill) bills += t.amount;
      else { spent += t.amount; byCat[t.to] = (byCat[t.to] || 0) + t.amount; }
    } else if (t.type === 'adjust') adjust += t.amount;
  }
  return { s, eIncl, txs, income, spent, bills, adjust, byCat, days: dayDiff(pp.start, pp.end) };
}

const delta = (cur, prev, goodWhenDown = true) => {
  if (!prev || !cur) return '';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (!pct) return '<span class="chg flat">≈</span>';
  const up = pct > 0;
  const txt = pct >= 200 ? `×${(cur / prev).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}` : `${Math.abs(pct)}%`;
  return `<span class="chg ${up === goodWhenDown ? 'bad' : 'good'}">${up ? '↑' : '↓'}${txt}</span>`;
};

function openSummary(pp) {
  if (!pp) return;
  const st = periodStats(pp);
  const pPrev = prevPayPeriod(pp);
  const first = S.tx.reduce((a, t) => (!a || t.date < a ? t.date : a), null);
  const prev = first && ymd(pPrev.start) >= first ? periodStats(pPrev) : { spent: 0, byCat: {} };
  const left = countedBalance(balances(ymd(pp.end)));
  const cats = Object.entries(st.byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const savings = S.wallets.find(w => S.plan.exclude.includes(w.id));
  const from = S.wallets.find(w => counted(w.id));
  const range = `${shortDate(pp.start)} – ${shortDate(new Date(pp.end - 864e5))}`;
  const row = (k, v) => `<div class="field"><span>${k}</span><b class="fv">${v}</b></div>`;
  const sh = openSheet(`
    ${sheetHead('Итоги периода')}
    <div class="sum-hero">
      <span>${range}</span>
      <small>Осталось к зарплате ${shortDate(pp.end)}</small>
      <b class="${left < 0 ? 'neg' : 'ok'}">${fmt(left)}</b>
    </div>
    ${row('Доходы', fmt(st.income))}
    ${row(`Траты ${prev.spent ? '<small class="vs">к прошлому периоду</small>' : ''}`, `${delta(st.spent, prev.spent)} ${fmt(st.spent)}`)}
    ${row('Обязательные платежи', fmt(st.bills))}
    ${st.adjust ? row('Сверка с банком', signed(st.adjust)) : ''}
    ${row('В среднем в день', fmt0(st.spent / st.days))}
    ${cats.length ? `<div class="label">Больше всего</div>
      ${cats.map(([id, v]) => {
        const c = findOr('category', id);
        return `<div class="catrow" style="--c:${c.color}"><span class="coin">${icon(c.icon)}</span>
          <span class="meta"><span class="top"><span>${esc(c.name)} ${delta(v, prev.byCat[id])}</span><b>${fmt(v)}</b></span></span></div>`;
      }).join('')}` : ''}
    <div class="actions">
      ${savings && from && left > 0 ? `<button class="btn" id="sum-save">${icon('piggy-bank')} Отложить в «${esc(savings.name)}»</button>` : ''}
      <button class="btn primary" data-close>Готово</button>
    </div>`);
  $('#sum-save', sh)?.addEventListener('click', () =>
    openTx({ type: 'transfer', from: from.id, to: savings.id, amount: Math.floor(left), note: `Остаток за ${range}` }));
}

// Show last period's summary once, on the first launch of a new pay period.
function checkSummary() {
  if (!S.plan.on) return;
  const cur = payPeriod();
  if (!cur) return;
  const key = ymd(cur.start), seen = S.plan.seen;
  if (seen === key) return;
  S.plan.seen = key;
  save();
  if (!seen) return;
  const prev = prevPayPeriod(cur);
  if (rangeTx(ymd(prev.start), ymd(new Date(prev.end - 864e5))).length) openSummary(prev);
}

/* ---------- selection (tap-tap mode) ---------- */
function validTarget(src, el) {
  if (!src || !el || !el.dataset.id) return false;
  const k = el.dataset.kind;
  if (!(TARGETS[src.kind] || []).includes(k)) return false;
  return !(k === src.kind && el.dataset.id === src.id);
}

function select(kind, id) {
  UI.sel = { kind, id };
  applySel();
  const it = find(kind, id);
  const where = kind === 'income' ? 'на кошелёк' : 'на категорию или другой кошелёк';
  const h = $('#hint');
  h.innerHTML = `<span><b>${esc(it.name)}</b> → нажмите ${where}. Ещё раз на него — настройки${kind === 'wallet' ? ' и сверка' : ''}.</span><button class="icon-btn" data-act="unsel" aria-label="Отмена">${icon('x')}</button>`;
  h.hidden = false;
}
function applySel() {
  $$('.tile[data-id]').forEach(el => {
    el.classList.toggle('selected', el.dataset.kind === UI.sel.kind && el.dataset.id === UI.sel.id);
    el.classList.toggle('droppable', validTarget(UI.sel, el));
  });
}
function clearSel() {
  UI.sel = null;
  $('#hint').hidden = true;
  $$('.tile.selected, .tile.droppable').forEach(el => el.classList.remove('selected', 'droppable'));
}

function tapTile(el) {
  const { kind, id } = el.dataset;
  const sel = UI.sel;
  if (sel) {
    if (sel.kind === kind && sel.id === id) { clearSel(); return openItem(kind, id); }
    if (validTarget(sel, el)) { clearSel(); return openTx({ type: txTypeFor(sel.kind, kind), from: sel.id, to: id }); }
    clearSel();
  }
  if (TARGETS[kind]) return select(kind, id);
  openItem(kind, id);
}

/* ---------- drag & drop (long-press on touch, drag on mouse) ---------- */
const D = { timer: null, start: null, el: null, active: false, ghost: null, over: null, pos: null, suppress: false, mouse: false };

function beginDrag(el) {
  D.timer = null;
  D.active = true;
  clearSel();
  D.src = { kind: el.dataset.kind, id: el.dataset.id };
  D.edgeX = D.edgeY = 0;
  const coin = el.querySelector('.coin').cloneNode(true);
  coin.classList.add('ghost');
  coin.style.setProperty('--c', el.style.getPropertyValue('--c'));
  document.body.appendChild(coin);
  D.ghost = coin;
  el.classList.add('dragging');
  $$('.tile[data-id]').forEach(t => validTarget(D.src, t) && t.classList.add('droppable'));
  moveDrag(D.start.x, D.start.y);
  navigator.vibrate?.(12);
  requestAnimationFrame(autoScroll);
}

function moveDrag(x, y) {
  D.pos = { x, y };
  D.ghost.style.transform = `translate(${x - 30}px, ${y - 46}px) scale(1.1)`;
  updateOver(false);
}

// Highlight the drop target under the finger. A little slack around the current
// target keeps it from flickering between neighbouring tiles.
function updateOver(force) {
  const { x, y } = D.pos;
  if (D.over && !force) {
    const r = D.over.getBoundingClientRect();
    if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8) return;
  }
  const hit = document.elementFromPoint(x, y)?.closest('.tile[data-id]');
  const over = validTarget(D.src, hit) ? hit : null;
  if (over !== D.over) {
    D.over?.classList.remove('over');
    over?.classList.add('over');
    D.over = over;
  }
}

// Scroll only when the finger rests near an edge for a moment, then re-check the target,
// so content never slides under a still finger by accident.
const EDGE = 36, EDGE_DELAY = 300;
function edgeScroll(el, prop, d, key) {
  if (!d) { D[key] = 0; return false; }
  const t = performance.now();
  if (!D[key]) D[key] = t;
  if (t - D[key] < EDGE_DELAY) return false;
  const before = el[prop];
  el[prop] += Math.sign(d) * Math.min(12, 2 + Math.abs(d) / 3);
  return el[prop] !== before;
}

function autoScroll() {
  if (!D.active) return;
  const { x, y } = D.pos;
  let moved = false;

  const row = document.elementFromPoint(x, y)?.closest('.row');
  let dx = 0;
  if (row) {
    const r = row.getBoundingClientRect();
    if (x < r.left + EDGE) dx = x - (r.left + EDGE);
    else if (x > r.right - EDGE) dx = x - (r.right - EDGE);
  }
  moved = edgeScroll(row, 'scrollLeft', dx, 'edgeX') || moved;

  const top = view.getBoundingClientRect().top;
  const bottom = $('#tabbar').getBoundingClientRect().top;
  let dy = 0;
  if (y < top + EDGE) dy = y - (top + EDGE);
  else if (y > bottom - EDGE) dy = y - (bottom - EDGE);
  moved = edgeScroll(view, 'scrollTop', dy, 'edgeY') || moved;

  if (moved) updateOver(true);
  requestAnimationFrame(autoScroll);
}

function endDrag(drop) {
  const target = drop ? D.over : null;
  const src = D.src;
  D.active = false;
  D.ghost?.remove();
  D.ghost = null;
  D.over = null;
  $$('.tile.dragging, .tile.droppable, .tile.over').forEach(t => t.classList.remove('dragging', 'droppable', 'over'));
  D.suppress = true;
  setTimeout(() => (D.suppress = false), 350);
  if (target) openTx({ type: txTypeFor(src.kind, target.dataset.kind), from: src.id, to: target.dataset.id });
}

function cancelPress() { clearTimeout(D.timer); D.timer = null; }

document.addEventListener('touchstart', e => {
  if (UI.tab !== 'home' || e.touches.length > 1) return;
  const el = e.target.closest('.tile[data-id]');
  if (!el || !TARGETS[el.dataset.kind]) return;
  const p = e.touches[0];
  D.start = { x: p.clientX, y: p.clientY };
  D.el = el;
  cancelPress();
  D.timer = setTimeout(() => beginDrag(el), 320);
}, { passive: true });

document.addEventListener('touchmove', e => {
  const p = e.touches[0];
  if (D.active) { e.preventDefault(); moveDrag(p.clientX, p.clientY); return; }
  if (D.timer && Math.hypot(p.clientX - D.start.x, p.clientY - D.start.y) > 10) cancelPress();
}, { passive: false });

document.addEventListener('touchend', e => {
  cancelPress();
  if (D.active) { e.preventDefault(); endDrag(true); }
}, { passive: false });
document.addEventListener('touchcancel', () => { cancelPress(); if (D.active) endDrag(false); });
document.addEventListener('contextmenu', e => { if (e.target.closest('.tile')) e.preventDefault(); });

// Mouse (desktop testing): drag after moving a few pixels
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0 || UI.tab !== 'home') return;
  const el = e.target.closest('.tile[data-id]');
  if (!el || !TARGETS[el.dataset.kind]) return;
  D.mouse = true;
  D.el = el;
  D.start = { x: e.clientX, y: e.clientY };
});
document.addEventListener('pointermove', e => {
  if (!D.mouse) return;
  if (D.active) return moveDrag(e.clientX, e.clientY);
  if (Math.hypot(e.clientX - D.start.x, e.clientY - D.start.y) > 6) { e.preventDefault(); beginDrag(D.el); }
});
document.addEventListener('pointerup', () => {
  if (!D.mouse) return;
  D.mouse = false;
  if (D.active) endDrag(true);
});

/* =========================================================
   Bottom sheet
   ========================================================= */
const sheetRoot = $('#sheet');
let sheetTimer = null;

function openSheet(html) {
  clearTimeout(sheetTimer);
  hideTip();
  sheetRoot.innerHTML = `<div class="backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  sheetRoot.hidden = false;
  sheetRoot.classList.remove('open');
  void sheetRoot.offsetHeight;
  sheetRoot.classList.add('open');
  return sheetRoot.querySelector('.sheet');
}
function closeSheet() {
  document.activeElement?.blur?.();
  sheetRoot.classList.remove('open');
  sheetTimer = setTimeout(() => { sheetRoot.hidden = true; sheetRoot.innerHTML = ''; }, 280);
}
sheetRoot.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });

// Keep the sheet above the iOS keyboard
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}

const sheetHead = title => `<div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Закрыть">${icon('x')}</button></div>`;

function parseAmount(v) {
  v = String(v).replace(/[\s ₸]/g, '').replace(/,/g, '.').replace(/[−–]/g, '-');
  if (!v) return NaN;
  if (!/^[\d.+\-]+$/.test(v)) return NaN;
  // allow simple sums like 1500+320-100
  const parts = v.match(/[+\-]?[^+\-]+/g) || [];
  return parts.reduce((a, p) => a + parseFloat(p), 0);
}
const money = v => Math.round(parseAmount(v) * 100) / 100;

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

/* ---------- transaction sheet ---------- */
function openTx(o) {
  const ex = o.id ? S.tx.find(t => t.id === o.id) : null;
  if (ex?.type === 'adjust') return openAdjust(ex.id);
  const t = ex ? { ...ex } : { type: o.type, from: o.from, to: o.to, amount: o.amount || '', date: today(), sub: o.sub || '', note: o.note || '', bill: o.bill };
  const bills = S.plan.bills;
  const billSel = t.type === 'expense' && (bills.length || t.bill);
  const [fk, tk] = TX_KINDS[t.type];
  const title = ex
    ? { income: 'Доход', expense: 'Расход', transfer: 'Перевод' }[t.type]
    : { income: 'Новый доход', expense: 'Новый расход', transfer: 'Новый перевод' }[t.type];
  const opts = (kind, sel) => {
    const items = list(kind).map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)}</option>`);
    if (!find(kind, sel)) items.unshift(`<option value="${sel}" selected>Удалено</option>`);
    return items.join('');
  };

  const sh = openSheet(`
    ${sheetHead(title)}
    <div class="flow" id="tx-flow"></div>
    <div class="bal-note" id="tx-bal"></div>
    <label class="amount"><input id="f-amount" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0" value="${t.amount}"><span>₸</span></label>
    <div class="field"><span>Откуда</span><select id="f-from">${opts(fk, t.from)}</select></div>
    <div class="field"><span>Куда</span><select id="f-to">${opts(tk, t.to)}</select></div>
    ${t.type === 'expense' ? `
      <div class="field col">
        <span>На что</span>
        <input id="f-sub" placeholder="Magnum, такси, кофе…" autocomplete="off" enterkeyhint="done" value="${esc(t.sub)}">
        <div class="chips" id="sub-chips"></div>
      </div>` : ''}
    ${billSel ? `<div class="field"><span>Обязательный платёж</span><select id="f-bill">
      <option value="">Нет</option>
      ${bills.map(b => `<option value="${b.id}" ${b.id === t.bill ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
      ${t.bill && !bills.some(b => b.id === t.bill) ? `<option value="${t.bill}" selected>Удалённый платёж</option>` : ''}
    </select></div>` : ''}
    <div class="field"><span>Дата</span><input type="date" id="f-date" value="${t.date}"></div>
    <div class="field"><span>Заметка</span><input id="f-note" placeholder="Необязательно" autocomplete="off" enterkeyhint="done" value="${esc(t.note)}"></div>
    ${!ex && t.type === 'expense' && !t.bill ? `<div class="field"><span>Добавить в быстрые траты</span><input type="checkbox" id="f-quick" class="switch"></div>` : ''}
    <div class="actions">
      ${ex ? `<button class="btn danger" id="tx-del" aria-label="Удалить">${icon('trash-2')}</button>` : ''}
      <button class="btn primary" id="tx-save">Сохранить</button>
    </div>`);

  const fFrom = $('#f-from', sh), fTo = $('#f-to', sh), fAmt = $('#f-amount', sh), fSub = $('#f-sub', sh);
  const bal = balances();

  const paintFlow = () => {
    const a = findOr(fk, fFrom.value), b = findOr(tk, fTo.value);
    const side = it => `<div class="side"><span class="coin" style="--c:${it.color}">${icon(it.icon)}</span><span>${esc(it.name)}</span></div>`;
    $('#tx-flow', sh).innerHTML = side(a) + `<span class="arrow">${icon('arrow-right')}</span>` + side(b);
    $('#tx-bal', sh).textContent = fk === 'wallet' && find('wallet', fFrom.value)
      ? `На «${a.name}»: ${fmt(bal[fFrom.value] || 0)}` : '';
  };
  const paintChips = () => {
    if (!fSub) return;
    const q = fSub.value.trim().toLowerCase();
    const all = subsFor(fTo.value);
    const shown = all.filter(s => !q || s.toLowerCase().includes(q)).slice(0, 14);
    $('#sub-chips', sh).innerHTML = shown.map(s =>
      `<button type="button" class="chip ${s === fSub.value.trim() ? 'on' : ''}" data-sub="${esc(s)}">${esc(s)}</button>`).join('');
  };
  const fitAmt = () => (fAmt.style.width = Math.max(1, fAmt.value.length || 1) + 0.6 + 'ch');
  fAmt.addEventListener('input', fitAmt);
  fitAmt();
  paintFlow();
  paintChips();

  // Auto-link to a bill when category and amount match exactly (until the user picks manually)
  const fBill = $('#f-bill', sh);
  let billTouched = !!ex || !!t.bill;
  const autoBill = () => {
    if (!fBill || billTouched) return;
    const amt = parseAmount(fAmt.value);
    const m = bills.find(b => b.cat === fTo.value && Math.round(b.amount * 100) === Math.round(amt * 100));
    fBill.value = m ? m.id : '';
  };
  if (fBill) fBill.onchange = () => (billTouched = true);
  fAmt.addEventListener('input', autoBill);

  fFrom.onchange = paintFlow;
  fTo.onchange = () => { paintFlow(); paintChips(); autoBill(); };
  if (fSub) {
    fSub.oninput = paintChips;
    $('#sub-chips', sh).onclick = e => {
      const c = e.target.closest('[data-sub]');
      if (!c) return;
      fSub.value = c.dataset.sub;
      paintChips();
    };
  }
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });

  $('#tx-save', sh).onclick = () => {
    const amount = money(fAmt.value);
    if (!(amount > 0)) { shake(fAmt.parentElement); fAmt.focus(); return; }
    if (t.type === 'transfer' && fFrom.value === fTo.value) return toast('Выберите два разных кошелька');
    const undo = snapshot();
    const rec = {
      id: ex ? ex.id : uid(),
      type: t.type,
      from: fFrom.value,
      to: fTo.value,
      amount,
      date: $('#f-date', sh).value || today(),
      sub: fSub ? fSub.value.trim() : '',
      note: $('#f-note', sh).value.trim(),
      ts: ex ? ex.ts : Date.now(),
    };
    if (fBill?.value) rec.bill = fBill.value;
    if (ex) S.tx[S.tx.findIndex(x => x.id === ex.id)] = rec;
    else S.tx.push(rec);
    if ($('#f-quick', sh)?.checked) {
      S.quick.push({ id: uid(), name: rec.sub || findOr('category', rec.to).name, amount, from: rec.from, to: rec.to, sub: rec.sub });
    }
    save();
    render();
    if (o.back) o.back(); else closeSheet();
    toast(ex ? 'Изменено' : `Записано: ${fmt(amount)}`, undo);
  };
  if (ex) $('#tx-del', sh).onclick = () => {
    const undo = snapshot();
    S.tx = S.tx.filter(x => x.id !== ex.id);
    save();
    closeSheet();
    render();
    toast('Запись удалена', undo);
  };

  if (!ex && !t.amount) fAmt.focus({ preventScroll: true });
}

/* ---------- balance check (сверка) ---------- */
function openReconcile(wid) {
  const w = find('wallet', wid);
  if (!w) return;
  const cur = balances()[wid] || 0;
  const sh = openSheet(`
    ${sheetHead(`Сверка: ${w.name}`)}
    <p class="set-note" style="padding:0 0 4px">Откройте приложение банка и введите, сколько там сейчас. Разница запишется одной корректировкой — ни в доходы, ни в расходы она не попадёт.</p>
    <div class="field"><span>В приложении</span><b class="fv">${fmt(cur)}</b></div>
    <div class="label">Сколько на самом деле</div>
    <label class="amount"><input id="r-amount" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="${Math.round(cur * 100) / 100}"><span>₸</span></label>
    <div class="recon-diff" id="r-diff"></div>
    <div class="actions"><button class="btn primary" id="r-save">Сверить</button></div>`);
  const fA = $('#r-amount', sh), out = $('#r-diff', sh);
  const fit = () => (fA.style.width = Math.max(1, (fA.value || fA.placeholder).length) + 0.6 + 'ch');
  const diffOf = () => Math.round((money(fA.value) - cur) * 100) / 100;
  const paint = () => {
    fit();
    const d = diffOf();
    if (!fA.value.trim() || isNaN(d)) { out.textContent = ''; out.className = 'recon-diff'; return; }
    out.className = 'recon-diff ' + (d === 0 ? 'ok' : d < 0 ? 'neg' : 'pos');
    out.textContent = d === 0 ? 'Всё сходится ✓'
      : d < 0 ? `Разница ${fmt(d)} — похоже, какие-то траты не записаны`
      : `Разница +${fmt(d)} — например, кэшбэк или проценты`;
  };
  fA.addEventListener('input', paint);
  fit();
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  $('#r-save', sh).onclick = () => {
    const d = diffOf();
    if (!fA.value.trim() || isNaN(d)) { shake(fA.parentElement); return fA.focus(); }
    if (d === 0) { closeSheet(); return toast('Баланс совпадает ✓'); }
    const undo = snapshot();
    S.tx.push({ id: uid(), type: 'adjust', from: wid, to: wid, amount: d, date: today(), sub: '', note: '', ts: Date.now() });
    w.checked = today();
    save();
    closeSheet();
    render();
    toast(`${w.name}: баланс исправлен на ${signed(d)}`, undo);
  };
  fA.focus({ preventScroll: true });
}

// Edit or delete an existing correction
function openAdjust(id) {
  const t = S.tx.find(x => x.id === id);
  const sh = openSheet(`
    ${sheetHead('Корректировка баланса')}
    <div class="field"><span>Кошелёк</span><select id="a-w">${S.wallets.map(w => `<option value="${w.id}" ${w.id === t.to ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
    <div class="field"><span>Сумма (минус — списание)</span><input id="a-amount" inputmode="text" value="${t.amount}" enterkeyhint="done"></div>
    <div class="field"><span>Дата</span><input type="date" id="a-date" value="${t.date}"></div>
    <div class="actions">
      <button class="btn danger" id="a-del" aria-label="Удалить">${icon('trash-2')}</button>
      <button class="btn primary" id="a-save">Сохранить</button>
    </div>`);
  $('#a-save', sh).onclick = () => {
    const a = money($('#a-amount', sh).value);
    if (!a) return $('#a-amount', sh).focus();
    const undo = snapshot();
    const w = $('#a-w', sh).value;
    Object.assign(t, { amount: a, from: w, to: w, date: $('#a-date', sh).value || t.date });
    save();
    closeSheet();
    render();
    toast('Изменено', undo);
  };
  $('#a-del', sh).onclick = () => {
    const undo = snapshot();
    S.tx = S.tx.filter(x => x.id !== id);
    save();
    closeSheet();
    render();
    toast('Корректировка удалена', undo);
  };
}

/* ---------- item (income / wallet / category) sheet ---------- */
function openItem(kind, id) {
  const ex = id ? find(kind, id) : null;
  const n = list(kind).length;
  const it = ex ? { ...ex } : {
    name: '',
    icon: { income: 'briefcase', wallet: 'credit-card', category: 'shopping-bag' }[kind],
    color: COLORS[(n * 5 + 3) % COLORS.length],
    initial: 0,
    budget: 0,
  };

  let extraInfo = '';
  let recent = '';
  if (ex) {
    const related = sortTx(S.tx.filter(t => t.from === id || t.to === id)).slice(0, 8);
    if (related.length) recent = `<div class="label">Последние записи</div><div class="list">${related.map(txRow).join('')}</div>`;
    if (kind === 'wallet') extraInfo = `Баланс: ${fmt(balances()[id] || 0)}`;
    else {
      const s = sums(periodTx());
      extraInfo = `${periodLabel()}: ${fmt((kind === 'income' ? s.inc : s.exp)[id] || 0)}`;
    }
  }
  const titles = ex ? { income: 'Источник дохода', wallet: 'Кошелёк', category: 'Категория' } : { income: 'Новый доход', wallet: 'Новый кошелёк', category: 'Новая категория' };

  const sh = openSheet(`
    ${sheetHead(titles[kind])}
    <div class="preview" id="pv"></div>
    ${ex && kind === 'wallet' ? `<button class="btn recon-btn" id="i-recon">${icon('landmark')} Сверить с банком${ex.checked ? `<small>последняя: ${dayLabel(ex.checked).toLowerCase()}</small>` : ''}</button>` : ''}
    <div class="field"><span>Название</span><input id="i-name" maxlength="30" placeholder="${{ income: 'Зарплата', wallet: 'Kaspi Gold', category: 'Продукты' }[kind]}" value="${esc(it.name)}" autocomplete="off" enterkeyhint="done"></div>
    ${kind === 'wallet' ? `<div class="field"><span>Начальный баланс</span><input id="i-initial" inputmode="decimal" placeholder="0" value="${it.initial || ''}" enterkeyhint="done"></div>` : ''}
    ${kind === 'category' ? `<div class="field"><span>Бюджет на месяц</span><input id="i-budget" inputmode="decimal" placeholder="Нет" value="${it.budget || ''}" enterkeyhint="done"></div>` : ''}
    <div class="label">Цвет</div>
    <div class="swatches" id="i-colors">${COLORS.map(c => `<button type="button" class="sw" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
    <div class="label">Иконка</div>
    <div class="icon-grid" id="i-icons">${PICKER_ICONS.map(n => `<button type="button" data-icon="${n}" aria-label="${n}">${icon(n)}</button>`).join('')}</div>
    ${ex && n > 1 ? `<div class="label">Порядок</div><div class="order"><button class="btn" data-move="-1">${icon('chevron-left')} Раньше</button><button class="btn" data-move="1">Позже ${icon('chevron-right')}</button></div>` : ''}
    ${recent}
    <div class="actions">
      ${ex ? `<button class="btn danger" id="i-del" aria-label="Удалить">${icon('trash-2')}</button>` : ''}
      <button class="btn primary" id="i-save">${ex ? 'Сохранить' : 'Создать'}</button>
    </div>`);

  const fName = $('#i-name', sh);
  const paint = () => {
    $('#pv', sh).innerHTML = `<span class="coin" style="--c:${it.color}">${icon(it.icon)}</span>
      <span class="pname">${esc(fName.value.trim() || 'Название')}</span>${extraInfo ? `<span class="pbal">${esc(extraInfo)}</span>` : ''}`;
    $$('.sw', sh).forEach(b => b.classList.toggle('on', b.dataset.color === it.color));
    $$('#i-icons button', sh).forEach(b => b.classList.toggle('on', b.dataset.icon === it.icon));
    $('#i-icons', sh).style.setProperty('--sel', it.color);
  };
  paint();
  $('#i-icons button.on', sh)?.scrollIntoView({ block: 'nearest' });
  $('#i-recon', sh)?.addEventListener('click', () => openReconcile(id));
  fName.oninput = paint;
  $('#i-colors', sh).onclick = e => { const b = e.target.closest('[data-color]'); if (b) { it.color = b.dataset.color; paint(); } };
  $('#i-icons', sh).onclick = e => { const b = e.target.closest('[data-icon]'); if (b) { it.icon = b.dataset.icon; paint(); } };
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  sh.addEventListener('click', e => {
    const tx = e.target.closest('[data-act="tx"]');
    if (tx) openTx({ id: tx.dataset.id });
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const arr = list(kind), i = arr.findIndex(x => x.id === id), j = i + +mv.dataset.move;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      if (kind === 'category' && UI.sort !== 'manual') { UI.sort = 'manual'; pref.set('sort', 'manual'); }
      save();
      render();
      toast('Перемещено');
    }
  });

  $('#i-save', sh).onclick = () => {
    const name = fName.value.trim();
    if (!name) { fName.focus(); shake(fName.closest('.field')); return; }
    const rec = { id: ex ? ex.id : uid(), name, icon: it.icon, color: it.color };
    if (kind === 'wallet') rec.initial = parseAmount($('#i-initial', sh).value) || 0;
    if (kind === 'category') rec.budget = Math.max(0, parseAmount($('#i-budget', sh).value) || 0);
    const arr = list(kind);
    if (ex) arr[arr.findIndex(x => x.id === ex.id)] = { ...ex, ...rec };
    else arr.push(rec);
    save();
    closeSheet();
    render();
  };

  if (ex) $('#i-del', sh).onclick = () => {
    const cnt = S.tx.filter(t => t.from === id || t.to === id).length;
    const msg = `Удалить «${ex.name}»?` + (cnt ? `\n\nВместе с ним удалится ${cnt} ${plural(cnt, ['запись', 'записи', 'записей'])}.` : '');
    if (!confirm(msg)) return;
    const undo = snapshot();
    S[LISTS[kind]] = list(kind).filter(x => x.id !== id);
    S.tx = S.tx.filter(t => t.from !== id && t.to !== id);
    save();
    closeSheet();
    render();
    toast(`«${ex.name}» удалено`, undo);
  };
}

/* =========================================================
   History
   ========================================================= */
function txRow(t) {
  const [fk, tk] = TX_KINDS[t.type];
  const a = findOr(fk, t.from), b = findOr(tk, t.to);
  let main, title, sub, amt, cls;
  if (t.type === 'expense') {
    main = b; title = t.sub || b.name;
    sub = [t.sub ? b.name : '', a.name, t.note].filter(Boolean).join(' · ');
    amt = '−' + fmt(t.amount); cls = '';
  } else if (t.type === 'income') {
    main = a; title = a.name;
    sub = ['→ ' + b.name, t.note].filter(Boolean).join(' · ');
    amt = '+' + fmt(t.amount); cls = 'pos';
  } else if (t.type === 'adjust') {
    main = { icon: 'landmark', color: '#78716c' }; title = 'Сверка с банком';
    sub = b.name;
    amt = signed(t.amount); cls = 'mid';
  } else {
    main = { icon: 'repeat', color: '#64748b' }; title = 'Перевод';
    sub = [`${a.name} → ${b.name}`, t.note].filter(Boolean).join(' · ');
    amt = fmt(t.amount); cls = 'mid';
  }
  return `<button class="txrow" data-act="tx" data-id="${t.id}">
    <span class="coin" style="--c:${main.color}">${icon(main.icon)}</span>
    <span class="tx-main"><div class="tx-title">${esc(title)}</div><div class="tx-sub">${esc(sub)}</div></span>
    <span class="tx-amt ${cls}">${amt}</span>
  </button>`;
}

function dayLabel(d) {
  const t = new Date();
  if (d === ymd(t)) return 'Сегодня';
  t.setDate(t.getDate() - 1);
  if (d === ymd(t)) return 'Вчера';
  const [y, m, day] = d.split('-').map(Number);
  const wd = new Date(y, m - 1, day).toLocaleDateString('ru-RU', { weekday: 'short' });
  return `${wd}, ${day} ${MON[m - 1]}${y !== now.getFullYear() ? ' ' + y : ''}`;
}

function renderHistory() {
  view.innerHTML = `
    <div class="toolbar">
      <label class="search">${icon('search')}<input id="h-q" type="search" placeholder="Поиск" value="${esc(UI.q)}" autocomplete="off" enterkeyhint="search"></label>
      <div class="seg">${[['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы'], ['transfer', 'Переводы']]
        .map(([k, l]) => `<button data-act="hf" data-f="${k}" class="${UI.hf === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div id="h-list"></div>`;
  $('#h-q').addEventListener('input', e => { UI.q = e.target.value; renderHistoryList(); });
  renderHistoryList();
}

function renderHistoryList() {
  const q = UI.q.trim().toLowerCase();
  const names = t => { const [fk, tk] = TX_KINDS[t.type]; return `${findOr(fk, t.from).name} ${findOr(tk, t.to).name} ${t.sub} ${t.note} ${t.amount}`.toLowerCase(); };
  const ok = t => UI.hf === 'all' || t.type === UI.hf || (UI.hf === 'transfer' && t.type === 'adjust');
  const txs = sortTx(periodTx().filter(t => ok(t) && (!q || names(t).includes(q))));
  const box = $('#h-list');
  if (!txs.length) {
    box.innerHTML = `<div class="empty">За период «${esc(periodLabel())}» записей нет${q ? ' по этому запросу' : ''}.<br><br>На главной зажмите доход или кошелёк и перетащите на кошелёк или категорию — или нажмите на один, потом на другой.</div>`;
    return;
  }
  const groups = new Map();
  txs.forEach(t => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
  box.innerHTML = [...groups].map(([d, arr]) => {
    const spent = arr.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    return `<div class="day-head"><span>${dayLabel(d)}</span><span>${spent ? '−' + fmt(spent) : ''}</span></div>
      <div class="list">${arr.map(txRow).join('')}</div>`;
  }).join('');
}

/* =========================================================
   Analytics
   ========================================================= */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
// bar with rounded data-end only, anchored to the baseline
function barPath(x, y, w, h, r = 4) {
  if (h <= 0.5) return '';
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// The range to compare the selected period with. For the current month/year it is
// the same number of days of the previous one, so a half-finished month isn't compared to a full one.
function compareRange() {
  const r = compareRangeRaw();
  // no comparison while the earlier range predates the first record — it would be half-empty
  const first = S.tx.reduce((a, t) => (!a || t.date < a ? t.date : a), null);
  return r && first && r.s >= first ? r : null;
}
function compareRangeRaw() {
  const P = UI.period;
  if (P.mode === 'month') {
    const isCur = P.y === now.getFullYear() && P.m === now.getMonth();
    const pm = new Date(P.y, P.m - 1, 1);
    const dim = new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate();
    const endDay = isCur ? Math.min(now.getDate(), dim) : dim;
    return {
      s: ymd(pm), e: ymd(new Date(pm.getFullYear(), pm.getMonth(), endDay)),
      label: isCur ? `к 1–${endDay} ${MON_GEN[pm.getMonth()]}` : `к ${MON_DAT[pm.getMonth()]}`,
    };
  }
  if (P.mode === 'year') {
    const isCur = P.y === now.getFullYear();
    const end = isCur ? new Date(P.y - 1, now.getMonth(), now.getDate()) : new Date(P.y - 1, 11, 31);
    return { s: `${P.y - 1}-01-01`, e: ymd(end), label: isCur ? `к ${P.y - 1} на эту дату` : `к ${P.y - 1} году` };
  }
  return null;
}

function monthsForTrend() {
  const P = UI.period;
  const out = [];
  if (P.mode === 'year') { for (let m = 0; m < 12; m++) out.push([P.y, m]); return out; }
  const n = P.mode === 'month' ? 6 : 12;
  const end = P.mode === 'month' ? new Date(P.y, P.m, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) { const d = new Date(end.getFullYear(), end.getMonth() - i, 1); out.push([d.getFullYear(), d.getMonth()]); }
  return out;
}

function trendChart() {
  const months = monthsForTrend();
  const by = {};
  for (const t of S.tx) {
    if (t.type !== 'income' && t.type !== 'expense') continue;
    const k = t.date.slice(0, 7);
    by[k] = by[k] || { i: 0, e: 0 };
    by[k][t.type === 'income' ? 'i' : 'e'] += t.amount;
  }
  const data = months.map(([y, m]) => ({ y, m, ...(by[`${y}-${pad(m + 1)}`] || { i: 0, e: 0 }) }));
  const W = 340, H = 170, L = 48, B = 20, T = 6;
  const max = niceMax(Math.max(...data.map(d => Math.max(d.i, d.e))));
  const ph = H - B - T, gw = (W - L) / data.length, bw = Math.min(14, gw * 0.32);
  const yOf = v => T + ph - (v / max) * ph;
  let s = '';
  [0, 0.5, 1].forEach(f => {
    const y = yOf(max * f);
    s += `<line class="${f ? 'grid-l' : 'base-l'}" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 3}" text-anchor="end">${compact(max * f)}</text>`;
  });
  data.forEach((d, i) => {
    const cx = L + gw * i + gw / 2;
    const tip = `${MONTHS[d.m]} ${d.y}\nДоходы   ${fmt(d.i)}\nРасходы  ${fmt(d.e)}\nРазница  ${fmt(d.i - d.e)}`;
    s += `<rect class="hit" x="${L + gw * i}" y="${T}" width="${gw}" height="${ph}" rx="6" data-tip="${esc(tip)}"/>`;
    s += `<path d="${barPath(cx - bw - 1, yOf(d.i), bw, ph + T - yOf(d.i))}" fill="var(--inc)" pointer-events="none"/>`;
    s += `<path d="${barPath(cx + 1, yOf(d.e), bw, ph + T - yOf(d.e))}" fill="var(--exp)" pointer-events="none"/>`;
    s += `<text x="${cx}" y="${H - 5}" text-anchor="middle">${MON_AXIS[d.m]}</text>`;
  });
  return `<div class="card"><h4>Доходы и расходы</h4><div class="csub">По месяцам · нажмите на месяц для деталей</div>
    <div class="legend"><span style="--c:var(--inc)"><i></i>Доходы</span><span style="--c:var(--exp)"><i></i>Расходы</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Доходы и расходы по месяцам">${s}</svg></div>`;
}

function dailyChart(txs) {
  const P = UI.period;
  const dim = new Date(P.y, P.m + 1, 0).getDate();
  const vals = Array(dim).fill(0);
  txs.forEach(t => { if (t.type === 'expense') vals[+t.date.slice(8, 10) - 1] += t.amount; });
  const total = vals.reduce((a, b) => a + b, 0);
  if (!total) return '';
  const isCur = P.y === now.getFullYear() && P.m === now.getMonth();
  const daysSoFar = isCur ? now.getDate() : dim;
  const avg = total / daysSoFar;
  const W = 340, H = 150, L = 48, B = 20, T = 6;
  const max = niceMax(Math.max(...vals));
  const ph = H - B - T, gw = (W - L) / dim, bw = Math.max(3, gw - 2);
  const yOf = v => T + ph - (v / max) * ph;
  let s = '';
  [0, 0.5, 1].forEach(f => {
    const y = yOf(max * f);
    s += `<line class="${f ? 'grid-l' : 'base-l'}" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 3}" text-anchor="end">${compact(max * f)}</text>`;
  });
  vals.forEach((v, i) => {
    const x = L + gw * i;
    s += `<rect class="hit" x="${x}" y="${T}" width="${gw}" height="${ph}" data-tip="${esc(`${i + 1} ${MON_GEN[P.m]}\n${fmt(v)}`)}"/>`;
    s += `<path d="${barPath(x + (gw - bw) / 2, yOf(v), bw, ph + T - yOf(v), 2)}" fill="var(--exp)" pointer-events="none"/>`;
    if ([1, 8, 15, 22].includes(i + 1) || i + 1 === dim) s += `<text x="${x + gw / 2}" y="${H - 5}" text-anchor="middle">${i + 1}</text>`;
  });
  const ay = yOf(avg);
  s += `<line x1="${L}" x2="${W}" y1="${ay}" y2="${ay}" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="4 3" pointer-events="none"/>`;
  return `<div class="card"><h4>Траты по дням</h4><div class="csub">В среднем ${fmt0(avg)} в день (пунктир)</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Траты по дням">${s}</svg></div>`;
}

function donut(segs, total) {
  const R = 70, SW = 22, C = 2 * Math.PI * R, gap = segs.length > 1 ? 2 : 0;
  let off = 0, s = '';
  segs.forEach(g => {
    const len = (g.v / total) * C;
    const draw = Math.max(0.5, len - gap);
    s += `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${g.color}" stroke-width="${SW}" stroke-dasharray="${draw} ${C - draw}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)" data-tip="${esc(`${g.name}\n${fmt(g.v)} · ${Math.round((g.v / total) * 100)}%`)}"/>`;
    off += len;
  });
  return `<svg viewBox="0 0 180 180" width="200" height="200" role="img" aria-label="Расходы по категориям">
    ${s}
    <text x="90" y="86" text-anchor="middle" font-size="19" font-weight="700" fill="var(--text)">${compact(total)} ₸</text>
    <text x="90" y="106" text-anchor="middle" font-size="12" fill="var(--text-2)">потрачено</text>
  </svg>`;
}

function renderAnalytics() {
  const txs = periodTx();
  const s = sums(txs);
  const P = UI.period;
  const net = s.totalInc - s.totalExp;
  const exps = txs.filter(t => t.type === 'expense');
  const cmp = compareRange();
  const ps = cmp ? sums(rangeTx(cmp.s, cmp.e)) : null;
  const vs = (cur, prev, goodWhenDown) => (ps && prev ? `<small class="kdelta">${delta(cur, prev, goodWhenDown)} ${cmp.label}</small>` : '');

  let days = 0;
  if (P.mode === 'month') {
    const isCur = P.y === now.getFullYear() && P.m === now.getMonth();
    days = isCur ? now.getDate() : new Date(P.y, P.m + 1, 0).getDate();
  } else if (P.mode === 'year') {
    const start = new Date(P.y, 0, 1), end = P.y === now.getFullYear() ? now : new Date(P.y, 11, 31);
    days = Math.max(1, Math.round((end - start) / 864e5) + 1);
  } else if (exps.length) {
    const first = exps.reduce((a, t) => (t.date < a ? t.date : a), exps[0].date);
    days = Math.max(1, dayDiff(dateOf(first), now) + 1);
  }

  const cats = S.categories.map(c => ({ ...c, v: s.exp[c.id] || 0 })).filter(c => c.v > 0);
  // spending in deleted categories still counts
  const orphan = Object.entries(s.exp).filter(([id]) => !find('category', id)).reduce((a, [, v]) => a + v, 0);
  if (orphan) cats.push({ id: '_del', ...DELETED, v: orphan });
  cats.sort((a, b) => b.v - a.v);

  let catBlock;
  if (!cats.length) {
    catBlock = `<div class="card"><h4>По категориям</h4><div class="empty">За период «${esc(periodLabel())}» расходов пока нет.</div></div>`;
  } else {
    const max = cats[0].v;
    catBlock = `<div class="card"><h4>По категориям</h4><div class="csub">Нажмите на категорию, чтобы увидеть, на что ушли деньги${ps ? `. Стрелки — ${cmp.label}` : ''}</div>
      <div class="donut-wrap">${donut(cats, s.totalExp)}</div>
      ${cats.map(c => {
        const open = UI.openCat === c.id;
        let subs = '';
        if (open) {
          const by = {};
          exps.filter(t => (c.id === '_del' ? !find('category', t.to) : t.to === c.id))
            .forEach(t => { const k = t.sub || 'Без описания'; by[k] = (by[k] || 0) + t.amount; });
          const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
          const sm = rows[0][1];
          subs = `<div class="subs" style="--c:${c.color}">${rows.map(([n, v]) =>
            `<div class="subrow"><span>${esc(n)}</span><b>${fmt(v)}</b></div><div class="bar"><i style="width:${(v / sm) * 100}%"></i></div>`).join('')}
            ${ps && ps.exp[c.id] ? `<div class="subrow muted"><span>${cmp.label[0].toUpperCase() + cmp.label.slice(1)} было</span><b>${fmt(ps.exp[c.id])}</b></div>` : ''}</div>`;
        }
        const chg = ps ? (ps.exp[c.id] ? delta(c.v, ps.exp[c.id]) : c.id !== '_del' ? '<span class="chg new">новое</span>' : '') : '';
        return `<button class="catrow" data-act="cat" data-id="${c.id}" style="--c:${c.color}">
          <span class="coin">${icon(c.icon)}</span>
          <span class="meta"><span class="top"><span>${esc(c.name)}<span class="pct">${Math.round((c.v / s.totalExp) * 100)}%</span>${chg}</span><b>${fmt(c.v)}</b></span>
          <div class="bar"><i style="width:${(c.v / max) * 100}%"></i></div></span>
        </button>${subs}`;
      }).join('')}</div>`;
  }

  const top = [...exps].sort((a, b) => b.amount - a.amount).slice(0, 10);

  view.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Доходы</span><b style="color:var(--pos)">${fmt(s.totalInc)}</b>${vs(s.totalInc, ps?.totalInc, false)}</div>
      <div class="kpi"><span>Расходы</span><b>${fmt(s.totalExp)}</b>${vs(s.totalExp, ps?.totalExp, true)}</div>
      <div class="kpi"><span>Разница</span><b style="color:${net < 0 ? 'var(--neg)' : 'var(--text)'}">${fmt(net)}</b></div>
      <div class="kpi"><span>В среднем в день</span><b>${fmt0(days ? s.totalExp / days : 0)}</b></div>
    </div>
    ${catBlock}
    ${P.mode === 'month' ? dailyChart(txs) : ''}
    ${trendChart()}
    ${top.length ? `<div class="card"><h4>Самые крупные траты</h4><div class="csub">${esc(periodLabel())}</div></div><div class="list" style="margin-top:-8px;border-radius:0 0 20px 20px">${top.map(txRow).join('')}</div>` : ''}`;
}

/* ---------- chart tooltip ---------- */
const tip = $('#tip');
let tipEl = null;
function showTip(el, x, y) {
  tipEl?.classList.remove('on');
  tipEl = el;
  el.classList.add('on');
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + 'px';
  tip.style.top = Math.max(8, y - h - 14) + 'px';
}
function hideTip() { tip.hidden = true; tipEl?.classList.remove('on'); tipEl = null; }
view.addEventListener('scroll', hideTip, { passive: true });

/* =========================================================
   Settings
   ========================================================= */
function renderSettings() {
  const last = S.lastBackup;
  const daysSince = last ? Math.floor((Date.now() - new Date(last)) / 864e5) : null;
  const stale = S.tx.length > 0 && (daysSince === null || daysSince > 14);
  view.innerHTML = `
    <div class="group-title">Бюджет</div>
    <div class="set-list">
      <button class="set-row" data-act="plan">${icon('calendar')}План трат<small>${S.plan.on ? 'Зарплата ' + S.plan.paydays.join(' и ') : 'Выключен'}</small></button>
      <button class="set-row" data-act="quick-manage">${icon('zap')}Быстрые траты<small>${S.quick.length}</small></button>
    </div>
    <div class="set-note">План показывает, сколько можно потратить сегодня, чтобы денег хватило до зарплаты.</div>

    <div class="group-title">Резервная копия</div>
    <div class="set-list">
      <button class="set-row" data-act="export">${icon('download')}Сохранить копию<small>${S.tx.length} ${plural(S.tx.length, ['запись', 'записи', 'записей'])}</small></button>
      <button class="set-row" data-act="import">${icon('upload')}Восстановить из копии</button>
    </div>
    <div class="set-note ${stale ? 'warn' : ''}">
      ${last ? `Последняя копия: ${dayLabel(last.slice(0, 10)).toLowerCase()}.` : 'Копий ещё не было.'}
      Данные хранятся только на этом iPhone. Если удалить иконку с экрана «Домой» или очистить данные Safari — они пропадут. Время от времени сохраняйте копию в «Файлы» или iCloud Drive.
    </div>

    <div class="group-title">Как пользоваться</div>
    <div class="help">
      <p><b>Пришли деньги:</b> зажмите доход (например, «Зарплата») и перетащите на кошелёк, введите сумму.</p>
      <p><b>Потратил:</b> перетащите кошелёк на категорию. Напишите, на что, — прошлые ответы появятся кнопками.</p>
      <p><b>Перевод:</b> перетащите один кошелёк на другой.</p>
      <p><b>Не получается тащить?</b> Нажмите на источник, потом на цель.</p>
      <p><b>Быстрые траты:</b> кнопки под планом записывают трату одним касанием.</p>
      <p><b>Сверка:</b> нажмите кошелёк дважды → «Сверить с банком».</p>
      <p><b>Ошибся?</b> Нажмите «Отменить» во всплывающем сообщении или исправьте запись в Истории.</p>
      <p><b>Суммы</b> можно складывать: <code>1500+320</code>.</p>
    </div>

    <div class="group-title">Опасная зона</div>
    <div class="set-list">
      <button class="set-row danger" data-act="reset">${icon('trash-2')}Стереть все данные</button>
    </div>
    <div class="set-note">Деньги · v1.1 · работает без интернета</div>`;
}

async function exportData() {
  S.lastBackup = new Date().toISOString();
  save();
  const name = `money-backup-${today()}.json`;
  const file = new File([JSON.stringify(S, null, 1)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); render(); return; }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  render();
}

$('#import-file').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!valid(d)) throw new Error('bad');
      normalize(d);
      if (!confirm(`Заменить все текущие данные этой копией?\n\n${d.tx.length} ${plural(d.tx.length, ['запись', 'записи', 'записей'])}, кошельков: ${d.wallets.length}, категорий: ${d.categories.length}.`)) return;
      const undo = snapshot();
      S = d;
      save();
      render();
      toast('Данные восстановлены', undo);
    } catch (err) { toast('Этот файл не похож на резервную копию'); }
  };
  r.readAsText(f);
});

/* =========================================================
   Global events
   ========================================================= */
let toastTimer;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="undo">Отменить</button>' : ''}`;
  t.classList.toggle('has-undo', !!undo);
  t.hidden = false;
  if (undo) t.querySelector('.undo').onclick = () => { undo(); toast('Отменено'); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), undo ? 5000 : 1800);
}

const ACTIONS = {
  prev: () => shiftPeriod(-1),
  next: () => shiftPeriod(1),
  today: () => { UI.period.y = now.getFullYear(); UI.period.m = now.getMonth(); render(); },
  mode: el => { UI.period.mode = el.dataset.mode; pref.set('mode', UI.period.mode); render(); },
  sort: () => { UI.sort = { manual: 'desc', desc: 'asc', asc: 'manual' }[UI.sort]; pref.set('sort', UI.sort); render(); },
  new: el => { clearSel(); openItem(el.dataset.kind); },
  unsel: clearSel,
  tx: el => openTx({ id: el.dataset.id }),
  hf: el => { UI.hf = el.dataset.f; $$('[data-act="hf"]').forEach(b => b.classList.toggle('on', b === el)); renderHistoryList(); },
  plan: () => { clearSel(); openPlan(); },
  quick: el => { clearSel(); useQuick(el.dataset.id); },
  'quick-new': () => { clearSel(); openQuick(); },
  'quick-manage': () => { clearSel(); S.quick.length ? openQuickList() : openQuick(); },
  'quick-sugg': el => {
    clearSel();
    const e = quickSuggestions()[+el.dataset.i];
    if (e) openQuick(null, { name: e.sub || findOr('category', e.to).name, amount: e.amount, from: e.from, to: e.to, sub: e.sub });
  },
  cat: el => { UI.openCat = UI.openCat === el.dataset.id ? null : el.dataset.id; render(); },
  export: exportData,
  import: () => $('#import-file').click(),
  reset: () => {
    if (!confirm('Стереть ВСЕ данные?\n\nСовет: сначала сохраните копию.')) return;
    const undo = snapshot();
    S = normalize(seed());
    save();
    render();
    toast('Все данные стёрты', undo);
  },
};

function shiftPeriod(d) {
  const P = UI.period;
  if (P.mode === 'year') P.y += d;
  else { const dt = new Date(P.y, P.m + d, 1); P.y = dt.getFullYear(); P.m = dt.getMonth(); }
  UI.openCat = null;
  render();
}

document.addEventListener('click', e => {
  if (D.suppress) { e.preventDefault(); e.stopPropagation(); return; }
  if (sheetRoot.contains(e.target) || $('#toast').contains(e.target)) return;

  const tab = e.target.closest('[data-tab]');
  if (tab) return setTab(tab.dataset.tab);

  const tipT = e.target.closest('[data-tip]');
  if (tipT) return showTip(tipT, e.clientX, e.clientY);
  hideTip();

  const a = e.target.closest('[data-act]');
  if (a) return ACTIONS[a.dataset.act]?.(a, e);

  const t = e.target.closest('.tile[data-id]');
  if (t) return tapTile(t);

  if (UI.sel && view.contains(e.target)) clearSel();
}, true);

// Tab icons
$$('#tabbar button').forEach(b => {
  b.querySelector('svg').outerHTML = icon({ home: 'house', history: 'list', analytics: 'chart-pie', settings: 'settings' }[b.dataset.tab]);
});

// Re-render when returning to the app on a new day
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== ymd(now)) location.reload();
});

render();
checkSummary();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
