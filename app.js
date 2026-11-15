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
// dark or white ink, whichever reads better on the colour
const onColor = hex => {
  const n = parseInt(String(hex).slice(1), 16);
  if (Number.isNaN(n)) return '#fff';
  const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const L = .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
  return L > .3 ? '#111114' : '#ffffff';
};
const cv = color => `--c:${color};--on:${onColor(color)}`;
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
const MON_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const MON_DAT = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#a16207', '#78716c', '#64748b', '#334155'];

const UI_ICONS = new Set(['plus', 'x', 'chevron-left', 'chevron-right', 'list', 'chart-pie', 'settings',
  'arrow-down-wide-narrow', 'arrow-up-narrow-wide', 'arrow-right', 'trash-2', 'download', 'upload', 'check', 'search', 'arrow-down', 'mic', 'key-round', 'lightbulb', 'copy']);
const PICKER_ICONS = Object.keys(ICONS).filter(n => !UI_ICONS.has(n));

/* kinds: income source → wallet → category.
   tx types: income, expense, transfer, adjust (balance correction after a bank check, signed amount),
   debt (money lent or borrowed, or paid back: signed like adjust, `debt` points at S.debts, `dk` is 'open' or 'back').
   A wallet with `dep` is a deposit: it has a rate and maybe a goal, and is never part of the spending plan. */
const LISTS = { income: 'incomes', wallet: 'wallets', category: 'categories' };
const TX_KINDS = { income: ['income', 'wallet'], expense: ['wallet', 'category'], transfer: ['wallet', 'wallet'], adjust: ['wallet', 'wallet'], debt: ['wallet', 'wallet'] };
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
    debts: [],
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
  d.debts = d.debts || [];
  d.aliases = d.aliases || {}; // Apple Pay merchant as the bank sends it → the name you gave it
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

// index.html sets the theme before the first paint; this keeps it and the status bar colour in sync
function applyTheme() {
  const t = pref.get('theme', 'dark');
  document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0b0f' : '#f2f3f5');
}
applyTheme();
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);

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
  animate: true, // rings and bars grow in when the home screen opens
  dots: new Set(), // categories that just got a spending tip
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
    else if (t.type === 'adjust' || t.type === 'debt') add(t.to, t.amount);
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

// Descriptions used in a category, most frequent first. With `all` false only the ones worth a chip:
// used at least twice, or within the last 30 days — a shop visited once in your life fades away.
function subsFor(catId, all = true) {
  const c = {}, last = {};
  for (const t of S.tx) {
    if (t.type !== 'expense' || t.to !== catId || !t.sub) continue;
    c[t.sub] = (c[t.sub] || 0) + 1;
    if (!last[t.sub] || t.date > last[t.sub]) last[t.sub] = t.date;
  }
  const since = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  return Object.keys(c).filter(k => all || c[k] >= 2 || last[k] >= since)
    .sort((a, b) => c[b] - c[a] || (last[b] > last[a] ? 1 : -1));
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
const isDep = id => !!find('wallet', id)?.dep;
const counted = id => !S.plan.exclude.includes(id) && !!find('wallet', id) && !isDep(id);
// Money that leaves the plan: expenses, and transfers to wallets kept out of it. Saving into a deposit
// isn't spending — it just leaves less for the days ahead.
const outflow = t => !t.bill && ((t.type === 'expense' && counted(t.from)) ||
  (t.type === 'transfer' && counted(t.from) && !counted(t.to) && !isDep(t.to)));
const countedBalance = bal => S.wallets.filter(w => counted(w.id)).reduce((a, w) => a + (bal[w.id] || 0), 0);

function planInfo() {
  const p = S.plan;
  if (!p.on) return null;
  const pp = payPeriod();
  if (!pp) return null;
  const balance = countedBalance(balances());
  const tdy = ymd(pp.today), startS = ymd(pp.start);
  // Bill payments are planned money and corrections are past money — neither eats into today.
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
  UI.animate = tab === 'home';
  render();
  view.scrollTop = 0;
}

/* =========================================================
   Home
   ========================================================= */
function tile(kind, it, amount, amtCls = '') {
  if (kind === 'income') return `<button class="tile inc" data-kind="income" data-id="${it.id}" style="${cv(it.color)}">
    <span class="coin">${icon('arrow-down')}</span><span class="tname">${esc(it.name)}</span><span class="tamt ${amtCls}">${amount ? compact(amount) : '0'}</span>
  </button>`;
  return `<button class="tile wal" data-kind="${kind}" data-id="${it.id}" style="${cv(it.color)}">
    <span class="whead"><span class="coin">${icon(it.icon)}</span><span class="tname">${esc(it.name)}</span></span>
    <span class="tamt ${amtCls}">${fmtShort(amount)}</span>
  </button>`;
}

// Category: the ring fills up as the month's limit is used; without a limit it stays an empty track.
const RING_C = 2 * Math.PI * 29;
function catTile(c, spent, limit) {
  const pct = limit > 0 ? Math.min(1, spent / limit) : 0;
  const over = limit > 0 && spent > limit;
  let label, cls = '';
  if (over) { label = `+${compact(spent - limit)} сверх`; cls = 'over'; }
  else if (limit > 0) label = `ещё ${compact(limit - spent)}`;
  else { label = fmtShort(spent); cls = spent ? '' : 'zero'; }
  return `<button class="tile cat ${UI.bump === c.id ? 'bump' : ''}" data-kind="category" data-id="${c.id}" style="${cv(c.color)}">
    <span class="ring ${over ? 'over' : ''}"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle class="trk" cx="32" cy="32" r="29"/>${pct > 0 && !over ? `<circle class="arc" cx="32" cy="32" r="29" style="--len:${(pct * RING_C).toFixed(1)}" stroke-dasharray="${(pct * RING_C).toFixed(1)} ${RING_C.toFixed(1)}"/>` : ''}</svg>
    <span class="coin">${icon(c.icon)}</span>${UI.dots.has(c.id) ? '<span class="cdot"></span>' : ''}</span>
    <span class="tname">${esc(c.name)}</span>
    <span class="tamt ${cls}">${label}</span>
  </button>`;
}

const addTile = kind => ({
  category: `<button class="tile cat add" data-act="new" data-kind="category"><span class="ring"><span class="coin">${icon('plus')}</span></span><span class="tname">Добавить</span><span class="tamt">&nbsp;</span></button>`,
  income: `<button class="tile inc add" data-act="new" data-kind="income" aria-label="Добавить источник дохода"><span class="coin">${icon('plus')}</span></button>`,
  wallet: `<button class="tile wal add" data-act="new" data-kind="wallet"><span class="whead"><span class="coin">${icon('plus')}</span><span class="tname">Добавить</span></span><span class="tamt">&nbsp;</span></button>`,
})[kind];

function renderHome() {
  const bal = balances();
  const s = sums(periodTx());
  const wallets = S.wallets.filter(w => !w.dep);
  const totalBal = wallets.reduce((a, w) => a + (bal[w.id] || 0), 0);
  const P = UI.period;

  let cats = [...S.categories];
  if (UI.sort === 'desc') cats.sort((a, b) => (s.exp[b.id] || 0) - (s.exp[a.id] || 0));
  if (UI.sort === 'asc') cats.sort((a, b) => (s.exp[a.id] || 0) - (s.exp[b.id] || 0));
  const sortLabel = { manual: ['list', 'Мой порядок'], desc: ['arrow-down-wide-narrow', 'Сначала большие'], asc: ['arrow-up-narrow-wide', 'Сначала малые'] }[UI.sort];

  const spentToday = S.tx.filter(t => t.type === 'expense' && t.date === today()).reduce((a, t) => a + t.amount, 0);
  const anim = UI.animate ? 'anim' : '';
  UI.animate = false;

  view.innerHTML = `<div class="${anim}">
    <div class="today-line">Сегодня потрачено <b>${fmt(spentToday)}</b></div>
    ${storiesRow()}
    ${planCard()}
    ${quickBlock()}
    <div class="h2row"><h2>Доходы</h2><span class="total">${fmt(s.totalInc)}</span></div>
    <div class="row irow">
      ${S.incomes.map(i => tile('income', i, s.inc[i.id] || 0)).join('')}
      ${addTile('income')}
    </div>

    <div class="h2row"><h2>Кошельки</h2><span class="total">${fmt(totalBal)}</span></div>
    <div class="row">
      ${wallets.map(w => tile('wallet', w, bal[w.id] || 0)).join('')}
      ${addTile('wallet')}
    </div>

    <div class="h2row"><h2>Расходы</h2><span class="total">${fmt(s.totalExp)}</span>
      <button class="sort-btn" data-act="sort">${icon(sortLabel[0])}${sortLabel[1]}</button></div>
    <div class="grid">
      ${cats.map(c => catTile(c, s.exp[c.id] || 0, P.mode === 'month' ? c.budget : 0)).join('')}
      ${addTile('category')}
    </div>
    ${depositsBlock(bal)}
    ${debtsBlock()}</div>`;
  UI.bump = null;
  countUp();
  if (UI.sel) applySel();
}

/* ---------- deposits: a stack of cards; a tap fans it out ---------- */
const fmtRate = r => String(r).replace('.', ',');

const goalBy = ym => { const [y, m] = ym.split('-').map(Number); return `${MON_DAT[m - 1]}${y !== now.getFullYear() ? ' ' + y : ''}`; };

// How much to top up every month to reach the goal by its month. The deposit's own interest helps
// (compounded monthly), so it's a bit less than «what's left ÷ months».
function goalPlan(w, bal) {
  if (!(w.goalAmount > 0)) return null;
  if (bal >= w.goalAmount) return { done: true };
  if (!w.goalDate) return { noDate: true };
  const [y, m] = w.goalDate.split('-').map(Number);
  const n = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  if (n <= 0) return { late: true };
  const r = (w.rate || 0) / 1200, g = (1 + r) ** n;
  const pmt = r ? ((w.goalAmount - bal * g) * r) / (g - 1) : (w.goalAmount - bal) / n;
  return { n, pmt: Math.max(0, pmt) };
}
function goalLine(w, gp) {
  if (!gp) return '';
  if (gp.done) return 'Цель достигнута';
  if (gp.noDate) return 'Задайте срок цели — посчитаю, сколько откладывать';
  if (gp.late) return 'Срок цели прошёл';
  if (gp.pmt < 1) return `Цель наберётся на процентах к ${goalBy(w.goalDate)}`;
  return `Откладывать по <b>${fmt0(gp.pmt)}</b> в месяц, чтобы успеть к ${goalBy(w.goalDate)}`;
}

function depCard(w, bal, top) {
  const pct = w.goalAmount > 0 ? Math.min(1, Math.max(0, bal / w.goalAmount)) : null;
  const monthly = w.rate > 0 && bal > 0 ? (bal * w.rate) / 100 / 12 : 0;
  const gl = goalLine(w, goalPlan(w, bal));
  return `<button class="tile dep" data-kind="wallet" data-id="${w.id}" style="${cv(w.color)}${top !== undefined ? ';' + top : ''}">
    <span class="coin">${icon(w.icon)}</span>
    <span class="dhead"><span class="dot"></span><span class="tname">${esc(w.name)}${w.goal ? ' · ' + esc(w.goal) : ''}</span>${w.rate ? `<span class="rate">${fmtRate(w.rate)}%</span>` : ''}</span>
    <span class="tamt">${fmt(bal)}</span>
    ${pct !== null ? `<span class="gbar"><i style="width:${pct * 100}%"></i></span>` : ''}
    <span class="dmeta"><span>${pct !== null ? `<b>${Math.floor(pct * 100)}%</b> из ${fmt(w.goalAmount)}` : 'без цели'}</span>${monthly ? `<span>проценты ≈ +${fmt0(monthly)}/мес</span>` : ''}</span>
    ${gl ? `<span class="dneed">${gl}</span>` : ''}
  </button>`;
}

const STACK_PEEK = 46, STACK_CARD = 172, STACK_MAX = 4;
// deposits in the order the stack shows them: the last one brought forward comes first
function depsOrdered() {
  const order = pref.get('depOrder', []);
  const deps = S.wallets.filter(w => w.dep);
  const rank = id => { const i = order.indexOf(id); return i < 0 ? 1e6 + deps.findIndex(w => w.id === id) : i; };
  return deps.sort((a, b) => rank(a.id) - rank(b.id));
}
const stackPos = (i, m) => `top:${(m - 1 - i) * STACK_PEEK}px;z-index:${m - i}`;
function depositsBlock(bal) {
  const deps = depsOrdered();
  // wallets someone already keeps out of the plan are probably deposits — ask once
  const cand = !S.plan.depAsked && S.wallets.find(w => !w.dep && S.plan.exclude.includes(w.id));
  const offer = cand ? `<div class="dep-offer"><span>«${esc(cand.name)}» не учитывается в плане трат. Это депозит или накопления?</span>
    <span class="dep-offer-btns"><button class="chip on" data-act="dep-yes" data-id="${cand.id}">Да, депозит</button><button class="chip" data-act="dep-no">Нет</button></span></div>` : '';
  if (!deps.length) return offer ? `<div class="h2row"><h2>Накопления</h2></div>${offer}` : '';
  const total = deps.reduce((a, w) => a + (bal[w.id] || 0), 0);
  const head = `<div class="h2row"><h2>Накопления</h2><span class="total">${fmt(total)}</span></div>`;
  const add = `<button class="dep-add" data-act="new-dep">${icon('plus')} Новый депозит</button>`;
  if (deps.length === 1) return head + offer + `<div class="stack">${depCard(deps[0], bal[deps[0].id] || 0)}</div>` + add;
  if (UI.stackOpen) return head + offer + `<div class="stack open">${deps.map(w => depCard(w, bal[w.id] || 0)).join('')}</div>
    <div class="stack-btns">${add}<button class="dep-add" data-act="stack-all">Свернуть</button></div>`;
  const vis = deps.slice(0, STACK_MAX), m = vis.length;
  // the first deposit lies in front; the others peek out above it. A tap on one behind brings it forward.
  const cards = vis.map((w, i) => depCard(w, bal[w.id] || 0, stackPos(i, m))).join('');
  return head + offer + `<div class="stack shut" data-act="stack" style="height:${(m - 1) * STACK_PEEK + STACK_CARD}px">${cards}</div>
    <div class="stack-btns"><button class="dep-link" data-act="stack-all">Все ${deps.length} ${plural(deps.length, ['депозит', 'депозита', 'депозитов'])}</button></div>`;
}

/* ---------- debts ---------- */
function debtLeft(d) {
  let open = 0, back = 0;
  for (const t of S.tx) if (t.type === 'debt' && t.debt === d.id) (t.dk === 'back' ? (back += Math.abs(t.amount)) : (open += Math.abs(t.amount)));
  return { open, back, left: Math.round((open - back) * 100) / 100 };
}
function debtStats() {
  const out = { in: [], out: [], sumIn: 0, sumOut: 0 };
  for (const d of S.debts) {
    const l = debtLeft(d);
    if (l.left <= 0) continue;
    out[d.dir].push({ d, ...l });
    if (d.dir === 'in') out.sumIn += l.left; else out.sumOut += l.left;
  }
  return out;
}
function debtsBlock() {
  const st = debtStats();
  if (!st.in.length && !st.out.length) return `<div class="h2row"><h2>Долги</h2></div>
    <button class="dep-add" data-act="debts" data-dir="in">${icon('plus')} Записать долг</button>`;
  const names = arr => arr.map(x => x.d.name).slice(0, 3).join(', ') + (arr.length > 3 ? '…' : '');
  const sq = (dir, title, sum, arr) => `<button class="dsq ${dir}" data-act="debts" data-dir="${dir}">
    <span class="dsq-t">${title}${icon('chevron-right')}</span>
    <b>${arr.length ? fmt(sum) : '—'}</b><small>${arr.length ? esc(names(arr)) : 'никому'}</small></button>`;
  return `<div class="h2row"><h2>Долги</h2></div><div class="dsqs">
    ${sq('in', 'Тебе должны', st.sumIn, st.in)}${sq('out', 'Ты должен', st.sumOut, st.out)}</div>`;
}

// Daily spending for the last 14 days, oldest first (bill payments excluded, like the limit)
function spendDays(n = 14) {
  const out = [];
  for (let k = n - 1; k >= 0; k--) out.push(ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - k)));
  const by = Object.fromEntries(out.map(d => [d, 0]));
  for (const t of S.tx) if (t.type === 'expense' && !t.bill && t.date in by) by[t.date] += t.amount;
  return out.map(d => by[d]);
}

// Yesterday's limit by the same rule: the money left at the end of yesterday plus what was spent yesterday,
// spread over the days that were left then. null when yesterday belongs to the previous pay period.
function yesterdayLimit(p) {
  const y = new Date(p.today.getFullYear(), p.today.getMonth(), p.today.getDate() - 1);
  if (y < p.start) return null;
  const ys = ymd(y), tdy = ymd(p.today);
  let spentY = 0;
  for (const t of S.tx) if (t.date === ys && outflow(t)) spentY += t.amount;
  const freeY = countedBalance(balances(tdy)) - S.plan.reserve - p.billsLeft;
  return Math.max(0, (freeY + spentY) / (p.daysLeft + 1));
}

function planCard() {
  const p = planInfo();
  if (!p) return '';
  const over = p.leftToday < 0;
  const state = over || p.free <= 0 ? 'over' : p.limit > 0 && p.leftToday < p.limit * .2 ? 'warn' : '';
  let note = '';
  if (p.free <= 0) note = `Не хватает ${fmt(-p.free)} на ${p.unpaid.length ? 'платежи' : 'запас'} до ${shortDate(p.end)}.`;
  else if (over && p.tomorrow !== null) note = `Завтра лимит станет ${fmt0(p.tomorrow)}.`;
  else if (state === 'warn') note = `Потрачено ${fmt0(p.spentToday)} из ${fmt0(p.limit)}`;
  const yl = yesterdayLimit(p);
  const d = yl === null ? 0 : Math.round(p.limit) - Math.round(yl);
  const delta = !over && Math.abs(d) >= 1
    ? `<div class="plan-delta ${d < 0 ? 'down' : ''}">${d > 0 ? '+' : '−'}${fmt0(Math.abs(d))} к вчерашнему лимиту</div>` : '';
  const days = spendDays(), top = Math.max(...days, 1);
  return `<section class="sec plan ${state}" data-act="plan">
    <div class="plan-label">${over ? 'Перерасход сегодня' : 'Можно потратить сегодня'}</div>
    <div class="plan-big" data-count="${Math.round(over ? -p.leftToday : p.leftToday)}">${fmt0(over ? -p.leftToday : p.leftToday)}</div>
    ${delta}
    <div class="spark-head"><span>Траты за 14 дней</span><span>сегодня</span></div>
    <div class="spark">${days.map((v, i) => `<i class="${i === days.length - 1 ? 'now' : ''}" style="height:${Math.max(4, (v / top) * 100)}%;animation-delay:${i * 18}ms"></i>`).join('')}</div>
    <div class="plan-meta"><span>${p.daysLeft} ${plural(p.daysLeft, DAYS)} до зарплаты · ${shortDate(p.end)}</span><span>≈ ${fmt0(p.limit)} в день</span></div>
    ${note ? `<div class="plan-note">${note}</div>` : ''}
    ${billSoonLine(p)}
  </section>`;
}

// The nearest unpaid bill, shown only in its last week (or when it's late) so it doesn't hang there all month
const SOON_DAYS = 7;
function billSoon(p) {
  const all = p.unpaid.map(o => ({ b: o.b, due: o.due }));
  for (const b of S.plan.bills) if (!p.bills.some(o => o.b.id === b.id)) all.push({ b, due: nextDue(b, p.end) });
  const lim = new Date(p.today.getFullYear(), p.today.getMonth(), p.today.getDate() + SOON_DAYS);
  return all.filter(o => o.due && o.due <= lim).sort((a, b) => a.due - b.due)[0] || null;
}
function billSoonLine(p) {
  const o = billSoon(p);
  if (!o) return '';
  const d = dayDiff(p.today, o.due);
  const when = d < 0 ? 'Просрочен платёж' : d === 0 ? 'Сегодня платёж' : d === 1 ? 'Завтра платёж' : `Через ${d} ${plural(d, DAYS)} платёж`;
  return `<div class="plan-bill ${d < 0 ? 'late' : ''}">${icon('repeat')}<span>${when} <b>${esc(o.b.name)}</b></span><b>${fmt(o.b.amount)}</b></div>`;
}

// The limit rolls to its new value instead of jumping
function countUp() {
  const el = $('.plan-big[data-count]', view);
  if (!el) return;
  const to = +el.dataset.count, from = UI.shown ?? to;
  UI.shown = to;
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now(), dur = 450;
  const step = t => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
    el.textContent = fmt0(from + (to - from) * e);
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
    return `<button class="qchip" data-act="quick" data-id="${q.id}" style="${cv(cat.color)}">
      <span class="qcoin">${icon(cat.icon)}</span>
      <span class="qtext"><b>${esc(q.name)}</b><small>${q.amount ? fmt(q.amount) : 'сумма?'}</small></span>
    </button>`;
  }).join('');
  const suggChips = sugg.map((e, i) => {
    const cat = findOr('category', e.to);
    return `<button class="qchip sugg" data-act="quick-sugg" data-i="${i}" style="${cv(cat.color)}">
      <span class="qcoin">${icon('plus')}</span>
      <span class="qtext"><b>${esc(e.sub || cat.name)}</b><small>${fmt(e.amount)} · ${e.n}×</small></span>
    </button>`;
  }).join('');
  return `<section class="quick">
    <div class="h2row"><h2>Быстрые траты</h2>${S.quick.length ? `<button class="sort-btn" data-act="quick-manage">${icon('pencil')}Настроить</button>` : ''}</div>
    <div class="qline">
      <div class="row qrow">
        ${chips}${suggChips}
        <button class="qchip add" data-act="quick-new"><span class="qcoin">${icon('plus')}</span><span class="qtext"><b>${S.quick.length ? 'Ещё' : 'Создать'}</b><small>одно касание</small></span></button>
      </div>
      <button class="mic-btn" data-act="voice" aria-label="Записать траты голосом или текстом">${icon('mic')}</button>
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
  const rec = { id: uid(), type: 'expense', from, to: q.to, amount: q.amount, date: today(), sub: q.sub || '', note: '', ts: Date.now() };
  S.tx.push(rec);
  const tip = spendTip(rec);
  UI.bump = q.to;
  if (tip) UI.dots.add(q.to);
  save();
  render();
  toast(`${q.name}: −${fmt(q.amount)}`, undo, true, tip);
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
        <span class="coin" style="${cv(cat.color)}">${icon(cat.icon)}</span>
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
      <span class="coin" style="${cv(cat.color)}">${icon(cat.icon)}</span>
      <span class="tx-main"><div class="tx-title">${esc(b.name)}</div><div class="tx-sub ${st.cls}">${st.text}</div></span>
      <b class="tx-amt">${fmt(b.amount)}</b>
      ${o && !o.paid ? `<button class="pay-btn" data-pay="${b.id}">Оплатить</button>` : o?.paid ? `<span class="paid-ic">${icon('check')}</span>` : ''}
    </div>`;
  }).join('');
  const monthly = bills.reduce((a, b) => a + b.amount, 0);
  return `<div class="label lrow"><span>Обязательные платежи и подписки</span>${monthly ? `<small>${fmt(monthly)} в месяц</small>` : ''}</div>
    ${rows ? `<div class="list bills">${rows}</div>` : '<div class="set-note" style="padding:0 0 8px">Аренда, коммуналка, интернет, кредиты, подписки. Деньги на них откладываются заранее, и дневной лимит их не трогает. За неделю до списания на главной появится напоминание.</div>'}
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
  let top = '';
  if (info) {
    const over = info.leftToday < 0;
    const state = over || info.free <= 0 ? 'over' : info.limit > 0 && info.leftToday < info.limit * .2 ? 'warn' : '';
    // where the money in the wallets goes: free to spend, set aside for bills, kept as the reserve
    const parts = [
      ['free', 'Свободно', Math.max(0, info.free)],
      ['bills', 'Платежи', info.billsLeft],
      ['res', 'Запас', p.reserve],
    ].filter(x => x[2] > 0);
    const sum = parts.reduce((a, x) => a + x[2], 0) || 1;
    const kpi = (k, v, cls = '') => `<div class="pk ${cls}"><span>${k}</span><b>${v}</b></div>`;
    top = `
      <div class="sec plan ${state} plan-sum">
        <div class="plan-label">Свободно до ${shortDate(info.end)}</div>
        <div class="plan-big">${fmt0(info.free)}</div>
        <div class="split">${parts.map(([c, , v]) => `<i class="${c}" style="flex:${v / sum}"></i>`).join('')}</div>
        <div class="split-legend">
          <span><i class="w"></i>В кошельках ${fmt0(info.balance)}</span>
          ${parts.map(([c, n, v]) => `<span><i class="${c}"></i>${n} ${fmt0(v)}</span>`).join('')}
        </div>
      </div>
      <div class="pks">
        ${kpi('Лимит на сегодня', fmt0(info.limit))}
        ${kpi('Потрачено сегодня', fmt0(info.spentToday), over ? 'neg' : '')}
        ${kpi('За период', fmt0(info.spentPeriod))}
        ${kpi('До зарплаты', `${info.daysLeft} ${plural(info.daysLeft, DAYS)}`)}
      </div>
      ${info.tomorrow !== null ? `<div class="pk-wide">Если сегодня больше не тратить, завтра лимит будет <b>${fmt0(info.tomorrow)}</b></div>` : ''}
      <details class="how"><summary>Как считается лимит</summary>
        <p>Каждое утро: (деньги в кошельках − неоплаченные платежи − запас) ÷ дни до зарплаты. Потратил меньше — завтра лимит вырастет, больше — уменьшится. Депозиты и долги не считаются тратами.</p></details>
      <button class="btn add-bill" id="p-summary">${icon('chart-line')} Итоги прошлого периода</button>`;
  }
  const paydays = new Set(p.paydays);
  const sh = openSheet(`
    ${sheetHead('План трат')}
    ${top}
    ${billsBlock(info)}
    <div class="label">Настройки</div>
    <div class="set-card">
      <div class="field"><span>Показывать на главной</span><input type="checkbox" id="p-on" class="switch" ${p.on ? 'checked' : ''}></div>
      <div class="field col"><span>Дни зарплаты</span>
        <div class="cal" id="p-days"></div>
        <span class="hint">Нажмите на число — зарплата будет приходить в этот день каждый месяц. Можно отметить несколько.</span>
      </div>
      <div class="field"><span>Оставлять в конце периода</span><input id="p-res" inputmode="decimal" placeholder="0 ₸" value="${p.reserve || ''}" enterkeyhint="done"></div>
      <div class="field col"><span>Какие кошельки учитывать</span>
        <div class="chips" id="p-w">${S.wallets.filter(w => !w.dep).map(w => `<button type="button" class="chip ${p.exclude.includes(w.id) ? '' : 'on'}" data-w="${w.id}">${esc(w.name)}</button>`).join('')}</div>
        <span class="hint">${S.wallets.some(w => w.dep) ? 'Депозиты не учитываются сами. ' : ''}Отключите счета, с которых не тратите.</span>
      </div>
    </div>
    <div class="actions"><button class="btn primary" id="p-save">Сохранить</button></div>`);

  // A month calendar: paydays repeat every month, so a tap picks the day of the month; «31» means the last day
  let calM = monthOf();
  const paintCal = () => {
    const y = calM.getFullYear(), m = calM.getMonth(), dim = daysIn(calM);
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const marked = new Set([...paydays].map(d => Math.min(d, dim)));
    const isToday = d => y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<i></i>';
    for (let d = 1; d <= dim; d++) {
      const wk = (lead + d - 1) % 7 >= 5;
      cells += `<button type="button" data-d="${d}" class="${marked.has(d) ? 'on' : ''} ${wk ? 'wk' : ''} ${isToday(d) ? 'today' : ''}">${d}</button>`;
    }
    // the next payday from today with the days picked right now
    let next = null;
    for (let k = 0; k <= 2 && !next; k++) {
      const mm = monthOf(k), dd = daysIn(mm);
      const c = [...paydays].map(d => new Date(mm.getFullYear(), mm.getMonth(), Math.min(d, dd))).sort((a, b) => a - b)
        .find(x => x >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));
      if (c) next = c;
    }
    const wd = next && next.toLocaleDateString('ru-RU', { weekday: 'short' });
    const off = next && (next.getDay() === 0 || next.getDay() === 6);
    $('#p-days', sh).innerHTML = `
      <div class="cal-head"><button type="button" class="icon-btn" data-cm="-1" aria-label="Предыдущий месяц">${icon('chevron-left')}</button>
        <b>${MONTHS[m]}${y !== now.getFullYear() ? ' ' + y : ''}</b>
        <button type="button" class="icon-btn" data-cm="1" aria-label="Следующий месяц">${icon('chevron-right')}</button></div>
      <div class="cal-grid">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(n => `<span>${n}</span>`).join('')}${cells}</div>
      <button type="button" class="chip ${paydays.has(31) ? 'on' : ''}" data-d="31" data-last="1">Последний день месяца</button>
      <div class="cal-next">${next ? `Следующая зарплата: <b>${wd}, ${next.getDate()} ${MON_GEN[next.getMonth()]}</b>${off ? ' — выходной, деньги могут прийти раньше' : ''}` : 'Отметьте хотя бы один день'}</div>`;
  };
  paintCal();
  $('#p-days', sh).onclick = e => {
    const nav = e.target.closest('[data-cm]');
    if (nav) { calM = new Date(calM.getFullYear(), calM.getMonth() + +nav.dataset.cm, 1); return paintCal(); }
    const b = e.target.closest('[data-d]');
    if (!b) return;
    let d = +b.dataset.d;
    // the last day of a short month stands for «the last day» when that's what's already picked
    if (!b.dataset.last && d === daysIn(calM) && d < 31 && paydays.has(31)) d = 31;
    paydays.has(d) ? paydays.delete(d) : paydays.add(d);
    paintCal();
  };
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
    const days = [...paydays];
    if (!days.length) return toast('Отметьте хотя бы один день зарплаты');
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

/* ---------- debts: sheets ---------- */
// the big amount field grows with its text so the ₸ sits right after the number
function fitAmount(el) {
  if (!el) return;
  const fit = () => (el.style.width = Math.max(1, (el.value || el.placeholder).length) + 0.6 + 'ch');
  el.addEventListener('input', fit);
  fit();
}
const avatarColor = name => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const spendWallets = () => S.wallets.filter(w => !w.dep);

function openDebts(dir = 'in', openId = null) {
  const st = debtStats();
  const rows = st[dir].sort((a, b) => (a.d.date < b.d.date ? 1 : -1));
  const closed = S.debts.filter(d => d.dir === dir && debtLeft(d).left <= 0).slice(-5).reverse();
  const row = x => {
    const { d } = x, w = findOr('wallet', d.wallet), on = openId === d.id;
    const part = x.back > 0 ? ` · вернул ${fmt(x.back)} из ${fmt(x.open)}` : '';
    return `<div class="drow ${on ? 'on' : ''}" data-debt="${d.id}">
      <span class="ava" style="${cv(avatarColor(d.name))}">${esc(d.name.slice(0, 1).toUpperCase())}</span>
      <span class="tx-main"><div class="tx-title">${esc(d.name)}</div><div class="tx-sub">${shortDate(dateOf(d.date))} · ${esc(w.name)}${part}${d.note ? ' · ' + esc(d.note) : ''}</div></span>
      <b class="tx-amt ${dir === 'in' ? 'pos' : 'neg'}">${fmt(x.left)}</b>
      ${on ? `<div class="dacts">
        <button class="btn primary" data-back-all="${d.id}">${dir === 'in' ? 'Вернул всё' : 'Отдал всё'}</button>
        <button class="btn" data-back-part="${d.id}">Часть</button>
        <button class="btn" data-debt-edit="${d.id}" aria-label="Изменить">${icon('pencil')}</button>
        <span class="hint">Деньги ${dir === 'in' ? 'вернутся' : 'спишутся'}: «${esc(w.name)}». Для другого кошелька — «Часть».</span>
      </div>` : ''}
    </div>`;
  };
  const sh = openSheet(`
    ${sheetHead('Долги')}
    <div class="seg dseg">
      <button data-dseg="in" class="${dir === 'in' ? 'on' : ''}">Мне должны${st.sumIn ? ' · ' + compact(st.sumIn) : ''}</button>
      <button data-dseg="out" class="${dir === 'out' ? 'on' : ''}">Я должен${st.sumOut ? ' · ' + compact(st.sumOut) : ''}</button>
    </div>
    ${rows.length ? `<div class="list dlist">${rows.map(row).join('')}</div>` : `<div class="empty">${dir === 'in' ? 'Тебе никто не должен.' : 'Ты никому не должен.'}</div>`}
    ${closed.length ? `<div class="label">Закрытые</div><div class="list dlist closed">${closed.map(d => `<div class="drow" data-debt-edit="${d.id}">
      <span class="ava done">${icon('check')}</span>
      <span class="tx-main"><div class="tx-title">${esc(d.name)}</div><div class="tx-sub">${shortDate(dateOf(d.date))}</div></span>
      <b class="tx-amt"><s>${fmt(debtLeft(d).open)}</s></b></div>`).join('')}</div>` : ''}
    <div class="actions">
      <button class="btn" data-debt-new="in">${icon('arrow-right')} Дал в долг</button>
      <button class="btn" data-debt-new="out">${icon('arrow-down')} Взял в долг</button>
    </div>
    <p class="set-note" style="padding:10px 0 0">Долг — не трата и не доход: деньги просто временно у другого человека. В статистику расходов он не попадает.</p>`);
  sh.addEventListener('click', e => {
    const k = e.target.closest('[data-dseg],[data-back-all],[data-back-part],[data-debt-edit],[data-debt-new],[data-debt]');
    if (!k) return;
    const ds = k.dataset;
    if (ds.dseg) return openDebts(ds.dseg);
    if (ds.backAll) return debtBack(ds.backAll, debtLeft(S.debts.find(d => d.id === ds.backAll)).left);
    if (ds.backPart) return openDebtBack(ds.backPart);
    if (ds.debtEdit) return openDebtForm(null, ds.debtEdit);
    if (ds.debtNew) return openDebtForm(ds.debtNew);
    if (ds.debt) return openDebts(dir, openId === ds.debt ? null : ds.debt);
  });
}

function debtBack(id, amount, wallet, date) {
  const d = S.debts.find(x => x.id === id);
  if (!d || !(amount > 0)) return;
  const undo = snapshot();
  const w = find('wallet', wallet) ? wallet : find('wallet', d.wallet) ? d.wallet : spendWallets()[0]?.id;
  if (!w) return toast('Сначала добавьте кошелёк');
  S.tx.push({ id: uid(), type: 'debt', debt: id, dk: 'back', from: w, to: w, amount: d.dir === 'in' ? amount : -amount,
    date: date || today(), sub: '', note: '', ts: Date.now() });
  save();
  render();
  openDebts(d.dir);
  toast(debtLeft(d).left <= 0 ? `Долг «${d.name}» закрыт` : `Записано: ${fmt(amount)}`, undo, true);
}

function openDebtBack(id) {
  const d = S.debts.find(x => x.id === id);
  if (!d) return;
  const left = debtLeft(d).left;
  const sh = openSheet(`
    ${sheetHead(d.dir === 'in' ? `${d.name} возвращает` : `Отдаю: ${d.name}`)}
    <div class="amount"><input id="db-amount" inputmode="decimal" value="${left}" autocomplete="off"><span>₸</span></div>
    <div class="bal-note">Осталось вернуть ${fmt(left)}</div>
    <div class="field"><span>${d.dir === 'in' ? 'На кошелёк' : 'С кошелька'}</span><select id="db-w">${spendWallets().map(w => `<option value="${w.id}" ${w.id === d.wallet ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
    <div class="field"><span>Дата</span><input id="db-date" type="date" value="${today()}"></div>
    <div class="actions"><button class="btn" id="db-back">Назад</button><button class="btn primary" id="db-save">Записать</button></div>`);
  fitAmount($('#db-amount', sh));
  $('#db-back', sh).onclick = () => openDebts(d.dir, id);
  $('#db-save', sh).onclick = () => {
    const a = Math.round(parseAmount($('#db-amount', sh).value) * 100) / 100;
    if (!(a > 0)) return shake($('.amount', sh));
    debtBack(id, Math.min(a, left), $('#db-w', sh).value, $('#db-date', sh).value);
  };
}

function openDebtForm(dir, id) {
  const ex = id ? S.debts.find(x => x.id === id) : null;
  if (ex) dir = ex.dir;
  const ws = spendWallets();
  if (!ws.length) return toast('Сначала добавьте кошелёк');
  const known = [...new Set(S.debts.map(d => d.name))];
  const sh = openSheet(`
    ${sheetHead(ex ? 'Долг' : dir === 'in' ? 'Дал в долг' : 'Взял в долг')}
    ${ex ? '' : `<div class="amount"><input id="df-amount" inputmode="decimal" placeholder="0" autocomplete="off"><span>₸</span></div>`}
    <div class="field"><span>${dir === 'in' ? 'Кому' : 'У кого'}</span><input id="df-name" maxlength="30" list="df-names" placeholder="Имя" value="${esc(ex?.name || '')}" autocomplete="off" enterkeyhint="done"></div>
    <datalist id="df-names">${known.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    ${ex ? '' : `<div class="field"><span>${dir === 'in' ? 'С кошелька' : 'На кошелёк'}</span><select id="df-w">${ws.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
    <div class="field"><span>Дата</span><input id="df-date" type="date" value="${today()}"></div>`}
    <div class="field"><span>Заметка</span><input id="df-note" maxlength="60" placeholder="Необязательно" value="${esc(ex?.note || '')}" autocomplete="off" enterkeyhint="done"></div>
    <div class="actions">
      ${ex ? `<button class="btn danger" id="df-del" aria-label="Удалить">${icon('trash-2')}</button>` : ''}
      <button class="btn" id="df-back">Назад</button>
      <button class="btn primary" id="df-save">Сохранить</button>
    </div>`);
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  fitAmount($('#df-amount', sh));
  if (!ex) setTimeout(() => $('#df-amount', sh)?.focus(), 300);
  $('#df-back', sh).onclick = () => openDebts(dir);
  $('#df-save', sh).onclick = () => {
    const name = $('#df-name', sh).value.trim();
    if (!name) return shake($('#df-name', sh).closest('.field'));
    const undo = snapshot();
    if (ex) Object.assign(ex, { name, note: $('#df-note', sh).value.trim() });
    else {
      const a = Math.round(parseAmount($('#df-amount', sh).value) * 100) / 100;
      if (!(a > 0)) return shake($('.amount', sh));
      const d = { id: uid(), name, dir, wallet: $('#df-w', sh).value, date: $('#df-date', sh).value || today(), note: $('#df-note', sh).value.trim() };
      S.debts.push(d);
      S.tx.push({ id: uid(), type: 'debt', debt: d.id, dk: 'open', from: d.wallet, to: d.wallet, amount: dir === 'in' ? -a : a,
        date: d.date, sub: '', note: d.note, ts: Date.now() });
    }
    save();
    render();
    openDebts(dir);
    toast(ex ? 'Изменено' : 'Долг записан', undo, !ex);
  };
  if (ex) $('#df-del', sh).onclick = () => {
    if (!confirm(`Удалить долг «${ex.name}» вместе с его записями?`)) return;
    const undo = snapshot();
    S.debts = S.debts.filter(d => d.id !== ex.id);
    S.tx = S.tx.filter(t => t.debt !== ex.id);
    save();
    render();
    openDebts(dir);
    toast('Долг удалён', undo);
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
  const savings = S.wallets.find(w => w.dep) || S.wallets.find(w => S.plan.exclude.includes(w.id));
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
        return `<div class="catrow" style="${cv(c.color)}"><span class="coin">${icon(c.icon)}</span>
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
  if (UI.dots.delete(id)) el.querySelector('.cdot')?.remove();
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
  coin.style.setProperty('--on', el.style.getPropertyValue('--on'));
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
  const sheet = sheetRoot.querySelector('.sheet');
  $$('input[inputmode="decimal"]', sheet).forEach(el => (el.value = groupDigits(el.value)));
  return sheet;
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

// 4124252 → 4 124 252 while typing (parseAmount ignores the spaces). Sums like 1500+320 are grouped per number.
const groupDigits = v => String(v).replace(/(\d[\d\s]*)([.,]\d*)?/g, (m, int, frac = '') => {
  const digits = int.replace(/\s/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (int.endsWith(' ') && !frac ? ' ' : '') + frac;
});
function formatAmountInput(el) {
  const v = el.value, nv = groupDigits(v);
  if (nv === v) return;
  // keep the caret after the same number of non-space characters
  const keep = v.slice(0, el.selectionStart ?? v.length).replace(/\s/g, '').length;
  el.value = nv;
  let i = 0;
  for (let n = 0; i < nv.length && n < keep; i++) if (!/\s/.test(nv[i])) n++;
  el.setSelectionRange(i, i);
}
// capture phase: runs before the fields' own input handlers, so they see the grouped text
document.addEventListener('input', e => { if (e.target.matches?.('input[inputmode="decimal"]')) formatAmountInput(e.target); }, true);

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
  if (ex?.type === 'debt') return openDebts(S.debts.find(d => d.id === ex.debt)?.dir || 'in', ex.debt);
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
    const side = it => `<div class="side"><span class="coin" style="${cv(it.color)}">${icon(it.icon)}</span><span>${esc(it.name)}</span></div>`;
    $('#tx-flow', sh).innerHTML = side(a) + `<span class="arrow">${icon('arrow-right')}</span>` + side(b);
    $('#tx-bal', sh).textContent = fk === 'wallet' && find('wallet', fFrom.value)
      ? `На «${a.name}»: ${fmt(bal[fFrom.value] || 0)}` : '';
  };
  const paintChips = () => {
    if (!fSub) return;
    const q = fSub.value.trim().toLowerCase();
    // typing searches everything; otherwise only the descriptions you actually repeat
    const all = subsFor(fTo.value, !!q);
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
    const tip = !ex && rec.type === 'expense' && !rec.bill ? spendTip(rec) : null;
    if (!ex && rec.type === 'expense') UI.bump = rec.to;
    if (tip) UI.dots.add(rec.to);
    save();
    render();
    if (o.back) o.back(); else closeSheet();
    toast(ex ? 'Изменено' : `Записано: ${fmt(amount)}`, undo, !ex, tip);
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
function openItem(kind, id, pre = {}) {
  const ex = id ? find(kind, id) : null;
  const n = list(kind).length;
  const it = ex ? { ...ex } : {
    name: '',
    icon: pre.dep ? 'piggy-bank' : { income: 'briefcase', wallet: 'credit-card', category: 'shopping-bag' }[kind],
    color: pre.dep ? '#8b5cf6' : COLORS[(n * 5 + 3) % COLORS.length],
    initial: 0,
    budget: 0,
    dep: !!pre.dep,
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
  const titles = ex ? { income: 'Источник дохода', wallet: it.dep ? 'Депозит' : 'Кошелёк', category: 'Категория' }
    : { income: 'Новый доход', wallet: 'Новый счёт', category: 'Новая категория' };
  const num = v => (v ? String(v).replace('.', ',') : '');

  const sh = openSheet(`
    ${sheetHead(titles[kind])}
    ${kind === 'wallet' ? `<div class="seg kind-seg" id="i-kind"><button type="button" data-k="0">Кошелёк</button><button type="button" data-k="1">Депозит</button></div>` : ''}
    <div class="preview" id="pv"></div>
    ${ex && kind === 'wallet' ? `<button class="btn recon-btn" id="i-recon">${icon('landmark')} Сверить с банком${ex.checked ? `<small>последняя: ${dayLabel(ex.checked).toLowerCase()}</small>` : ''}</button>` : ''}
    ${ex && it.dep ? `<button class="btn recon-btn" id="i-interest">${icon('percent')} Начислить проценты</button>` : ''}
    <div class="field"><span>Название</span><input id="i-name" maxlength="30" placeholder="${{ income: 'Зарплата', wallet: it.dep ? 'Halyk депозит' : 'Kaspi Gold', category: 'Продукты' }[kind]}" value="${esc(it.name)}" autocomplete="off" enterkeyhint="done"></div>
    ${kind === 'wallet' ? `<div class="field"><span>${ex ? 'Начальный баланс' : 'Сейчас на счёте'}</span><input id="i-initial" inputmode="decimal" placeholder="0" value="${it.initial || ''}" enterkeyhint="done"></div>
    <div class="dep-fields" id="i-dep">
      <div class="field"><span>Ставка, % годовых</span><input id="i-rate" inputmode="decimal" placeholder="Нет" value="${num(it.rate)}" enterkeyhint="done"></div>
      <div class="field"><span>Цель</span><input id="i-goal" maxlength="24" placeholder="Подушка, отпуск…" value="${esc(it.goal || '')}" autocomplete="off" enterkeyhint="done"></div>
      <div class="field"><span>Сумма цели</span><input id="i-goal-amt" inputmode="decimal" placeholder="Нет" value="${it.goalAmount || ''}" enterkeyhint="done"></div>
      <div class="field"><span>Срок цели</span><input id="i-goal-date" type="month" value="${it.goalDate || ''}"></div>
      <p class="set-note" style="padding:8px 0 0">Депозит не входит в «Можно потратить сегодня». Перевод с карты на депозит — не трата.</p>
    </div>` : ''}
    ${kind === 'category' ? `<div class="field"><span>Бюджет на месяц</span><input id="i-budget" inputmode="decimal" placeholder="Нет" value="${it.budget || ''}" enterkeyhint="done"></div>` : ''}
    <div class="label">Цвет</div>
    <div class="swatches" id="i-colors">${COLORS.map(c => `<button type="button" class="sw" data-color="${c}" style="${cv(c)}" aria-label="${c}"></button>`).join('')}</div>
    <div class="label">Иконка</div>
    <div class="icon-grid" id="i-icons">${PICKER_ICONS.map(n => `<button type="button" data-icon="${n}" aria-label="${n}">${icon(n)}</button>`).join('')}</div>
    ${ex && n > 1 ? `<div class="label">Порядок</div><div class="order"><button class="btn" data-move="-1">${icon('chevron-left')} Раньше</button><button class="btn" data-move="1">Позже ${icon('chevron-right')}</button></div>` : ''}
    ${recent}
    <div class="actions">
      ${ex ? `<button class="btn danger" id="i-del" aria-label="Удалить">${icon('trash-2')}</button>` : ''}
      <button class="btn primary" id="i-save">${ex ? 'Сохранить' : 'Создать'}</button>
    </div>`);

  const fName = $('#i-name', sh);
  const kindSeg = $('#i-kind', sh);
  const paintKind = () => {
    if (!kindSeg) return;
    $$('button', kindSeg).forEach(b => b.classList.toggle('on', !!+b.dataset.k === it.dep));
    $('#i-dep', sh).hidden = !it.dep;
  };
  paintKind();
  kindSeg?.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { it.dep = !!+b.dataset.k; paintKind(); } });
  $('#i-interest', sh)?.addEventListener('click', () => {
    let src = S.incomes.find(i => /процент/i.test(i.name));
    if (!src) { src = { id: uid(), name: 'Проценты', icon: 'percent', color: '#14b8a6' }; S.incomes.push(src); save(); }
    openTx({ type: 'income', from: src.id, to: id });
  });
  const paint = () => {
    $('#pv', sh).innerHTML = `<span class="coin" style="${cv(it.color)}">${icon(it.icon)}</span>
      <span class="pname">${esc(fName.value.trim() || 'Название')}</span>${extraInfo ? `<span class="pbal">${esc(extraInfo)}</span>` : ''}`;
    $$('.sw', sh).forEach(b => b.classList.toggle('on', b.dataset.color === it.color));
    $$('#i-icons button', sh).forEach(b => b.classList.toggle('on', b.dataset.icon === it.icon));
    $('#i-icons', sh).style.setProperty('--sel', it.color);
  };
  paint();
  // show the chosen icon inside the grid's own scroll — scrollIntoView would also scroll the whole sheet down to it
  const grid = $('#i-icons', sh), onIcon = $('button.on', grid);
  if (onIcon) grid.scrollTop = onIcon.offsetTop - 8;
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
    if (kind === 'wallet') {
      rec.initial = parseAmount($('#i-initial', sh).value) || 0;
      rec.dep = it.dep;
      if (it.dep) {
        rec.rate = Math.max(0, parseAmount($('#i-rate', sh).value) || 0);
        rec.goal = $('#i-goal', sh).value.trim();
        rec.goalAmount = Math.max(0, parseAmount($('#i-goal-amt', sh).value) || 0);
        rec.goalDate = $('#i-goal-date', sh).value || '';
        S.plan.exclude = S.plan.exclude.filter(x => x !== rec.id); // a deposit is out of the plan by itself
      }
    }
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
  } else if (t.type === 'debt') {
    const d = S.debts.find(x => x.id === t.debt), who = d ? d.name : 'Долг', lent = d?.dir !== 'out';
    main = { icon: 'hand-coins', color: '#14b8a6' };
    title = t.dk === 'back' ? (lent ? `${who} вернул долг` : `Вернул долг: ${who}`) : (lent ? `Дал в долг: ${who}` : `Взял в долг: ${who}`);
    sub = [b.name, t.note].filter(Boolean).join(' · ');
    amt = signed(t.amount); cls = t.amount > 0 ? 'pos' : 'mid';
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
    <span class="coin" style="${cv(main.color)}">${icon(main.icon)}</span>
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
  const ok = t => UI.hf === 'all' || t.type === UI.hf || (UI.hf === 'transfer' && (t.type === 'adjust' || t.type === 'debt'));
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
          const by = {}, n = {};
          exps.filter(t => (c.id === '_del' ? !find('category', t.to) : t.to === c.id))
            .forEach(t => { const k = t.sub || 'Без описания'; by[k] = (by[k] || 0) + t.amount; n[k] = (n[k] || 0) + 1; });
          let rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
          // past the biggest few, places visited once fold into one line
          const once = rows.slice(6).filter(([k]) => n[k] === 1);
          if (once.length >= 2) {
            const fold = new Set(once.map(([k]) => k));
            rows = [...rows.filter(([k]) => !fold.has(k)), [`Разовые покупки · ${once.length}`, once.reduce((a, [, v]) => a + v, 0)]]
              .sort((a, b) => b[1] - a[1]);
          }
          const sm = rows[0][1];
          subs = `<div class="subs" style="${cv(c.color)}">${rows.map(([n, v]) =>
            `<div class="subrow"><span>${esc(n)}</span><b>${fmt(v)}</b></div><div class="bar"><i style="width:${(v / sm) * 100}%"></i></div>`).join('')}
            ${ps && ps.exp[c.id] ? `<div class="subrow muted"><span>${cmp.label[0].toUpperCase() + cmp.label.slice(1)} было</span><b>${fmt(ps.exp[c.id])}</b></div>` : ''}</div>`;
        }
        const chg = ps ? (ps.exp[c.id] ? delta(c.v, ps.exp[c.id]) : c.id !== '_del' ? '<span class="chg new">новое</span>' : '') : '';
        return `<button class="catrow" data-act="cat" data-id="${c.id}" style="${cv(c.color)}">
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
   Insights: stories under the month title, and a tip right after a purchase.
   Everything is counted on the phone from the records — no AI, works offline.
   ========================================================= */
const monthOf = (k = 0) => new Date(now.getFullYear(), now.getMonth() + k, 1);
const ymOf = d => ymd(d).slice(0, 7);
const daysIn = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

// Expenses of a month (bills apart — they are planned), optionally only up to a day of the month
function monthExp(ym, upToDay) {
  const by = {}, subs = {};
  let total = 0;
  for (const t of S.tx) {
    if (t.type !== 'expense' || t.bill || !t.date.startsWith(ym)) continue;
    if (upToDay && +t.date.slice(8) > upToDay) continue;
    by[t.to] = (by[t.to] || 0) + t.amount;
    total += t.amount;
    if (t.sub) {
      const k = `${t.to}|${lowerRu(t.sub)}`;
      const e = subs[k] || (subs[k] = { to: t.to, sub: t.sub, n: 0, sum: 0 });
      e.n++; e.sum += t.amount;
    }
  }
  return { by, total, subs: Object.values(subs) };
}

function insights() {
  const out = [];
  const m0 = monthOf(), ym = ymOf(m0), day = now.getDate(), dim = daysIn(m0);
  const first = S.tx.reduce((a, t) => (!a || t.date < a ? t.date : a), null);
  if (!first) return out;
  const cur = monthExp(ym);
  const pm = monthOf(-1), pym = ymOf(pm);
  const hasPrev = first < `${ym}-01`;
  const prevSame = hasPrev ? monthExp(pym, day) : null;
  const prevFull = hasPrev ? monthExp(pym) : null;
  // last three full months + this one, for the bar charts
  const months = [-3, -2, -1, 0].map(k => monthOf(k)).filter(d => ymOf(d) >= first.slice(0, 7));
  const monthBars = catId => months.map(d => {
    const e = monthExp(ymOf(d));
    const v = catId ? e.by[catId] || 0 : e.total;
    return { label: MON_AXIS[d.getMonth()], v, now: ymOf(d) === ym };
  });
  const pace = v => (v / day) * dim;

  // 1. a category growing faster than last month
  if (prevSame && day >= 5) {
    let best = null;
    for (const c of S.categories) {
      const v = cur.by[c.id] || 0, p = prevSame.by[c.id] || 0;
      if (p > 0 && v - p >= 3000 && (v - p) / p >= 0.15 && (!best || v - p > best.d)) best = { c, v, p, d: v - p };
    }
    if (best) {
      const { c, v, p } = best, pct = Math.round(((v - p) / p) * 100);
      const subs = cur.subs.filter(e => e.to === c.id).sort((a, b) => b.sum - a.sum).slice(0, 3);
      out.push({
        id: `up:${ym}:${c.id}`, label: `${c.name} +${pct}%`, icon: c.icon, color: c.color,
        title: `На «${c.name}» уходит на ${pct}% больше, чем в ${MON_PREP[pm.getMonth()]}`,
        text: `К этому дню: ${fmt0(v)} против ${fmt0(p)}. В таком темпе к концу месяца — ${fmt0(pace(v))}${c.budget ? ` при лимите ${fmt0(c.budget)}` : ''}.`,
        bars: monthBars(c.id), rows: subs.map(e => [`${e.sub} · ${e.n} ${plural(e.n, ['раз', 'раза', 'раз'])}`, fmt0(e.sum)]),
        action: ['Открыть в аналитике', () => { UI.openCat = c.id; setTab('analytics'); }],
      });
    }
  }

  // 2. a category limit that will run out before the month ends
  const upCat = out[0]?.id.startsWith('up:') ? out[0].id.split(':')[2] : null; // one story per category is enough
  for (const c of S.categories) {
    const v = cur.by[c.id] || 0;
    if (c.id === upCat || !c.budget || v >= c.budget || day < 3 || pace(v) <= c.budget * 1.05) continue;
    const endDay = Math.min(dim, Math.max(day, Math.floor(c.budget / (v / day))));
    out.push({
      id: `lim:${ym}:${c.id}`, label: `Лимит ${c.name}`, icon: 'calendar', color: c.color,
      title: `Лимит «${c.name}» закончится примерно ${endDay} ${MON_GEN[m0.getMonth()]}`,
      text: `Потрачено ${fmt0(v)} из ${fmt0(c.budget)}. Чтобы уложиться, до конца месяца — не больше ${fmt0((c.budget - v) / (dim - day + 1))} в день.`,
      bars: monthBars(c.id), action: ['Открыть в аналитике', () => { UI.openCat = c.id; setTab('analytics'); }],
    });
    break;
  }

  // 3. a small purchase that adds up
  const freq = cur.subs.filter(e => e.n >= 4).sort((a, b) => b.sum - a.sum)[0];
  if (freq) {
    const c = findOr('category', freq.to);
    out.push({
      id: `freq:${ym}:${lowerRu(freq.sub)}:${Math.floor(freq.n / 5)}`, label: freq.sub, icon: c.icon, color: c.color,
      title: `«${freq.sub}» — ${freq.n} ${plural(freq.n, ['раз', 'раза', 'раз'])} за месяц`,
      text: `Всего ${fmt0(freq.sum)}, в среднем ${fmt0(freq.sum / freq.n)} за раз. Если вдвое реже — останется около ${fmt0(freq.sum / 2)}.`,
    });
  }

  // 4. where the month is heading
  if (day >= 3 && cur.total > 0) {
    const f = pace(cur.total), pt = prevFull?.total || 0;
    const cmp = pt ? Math.round(((f - pt) / pt) * 100) : 0;
    out.push({
      id: `fc:${ym}:${Math.floor((day - 1) / 7)}`, label: 'Прогноз', icon: 'trending-up', color: '#0ea5e9',
      title: `За ${MONTHS[m0.getMonth()].toLowerCase()} уйдёт около ${fmt0(f)}`,
      text: `Сейчас ${fmt0(cur.total)} за ${day} ${plural(day, DAYS)}.${pt ? ` Это ${cmp > 0 ? `на ${cmp}% больше` : cmp < 0 ? `на ${-cmp}% меньше` : 'столько же'}, чем за весь ${MONTHS[pm.getMonth()].toLowerCase()} (${fmt0(pt)}).` : ''}`,
      bars: monthBars().map(b => (b.now ? { ...b, v: f, label: b.label + ' ≈' } : b)),
    });
  }

  // 5. bills and subscriptions against income
  const billsSum = S.plan.bills.reduce((a, b) => a + b.amount, 0);
  if (billsSum > 0) {
    let inc = 0, n = 0;
    for (const k of [-3, -2, -1]) {
      const d = monthOf(k), y = ymOf(d);
      if (y < first.slice(0, 7)) continue;
      n++;
      inc += S.tx.filter(t => t.type === 'income' && t.date.startsWith(y)).reduce((a, t) => a + t.amount, 0);
    }
    if (n && inc > 0) {
      const pct = Math.round((billsSum / (inc / n)) * 100);
      out.push({
        id: `bills:${ym}:${pct}`, label: 'Платежи', icon: 'repeat', color: '#8b5cf6',
        title: `Платежи и подписки — ${pct}% дохода`,
        text: `${fmt0(billsSum)} в месяц при среднем доходе ${fmt0(inc / n)}.`,
        rows: [...S.plan.bills].sort((a, b) => b.amount - a.amount).slice(0, 5).map(b => [b.name, fmt0(b.amount)]),
        action: ['Открыть план трат', () => openPlan()],
      });
    }
  }

  // 6. how far a savings goal is
  const bal = balances();
  const dep = S.wallets.find(w => w.dep && w.goalAmount > (bal[w.id] || 0));
  if (dep) {
    const left = dep.goalAmount - (bal[dep.id] || 0);
    const since = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));
    const inflow = S.tx.filter(t => t.to === dep.id && t.date >= since && (t.type === 'transfer' || t.type === 'income')).reduce((a, t) => a + t.amount, 0) / 3;
    const gp = goalPlan(dep, bal[dep.id] || 0);
    const need = gp?.pmt >= 1 ? ` Чтобы успеть к ${goalBy(dep.goalDate)}, откладывай по ${fmt0(gp.pmt)} в месяц (с учётом процентов).` : '';
    out.push({
      id: `goal:${dep.id}:${Math.round(left / 50000)}`, label: dep.goal || dep.name, icon: dep.icon, color: dep.color,
      title: `До цели «${dep.goal || dep.name}» осталось ${fmt0(left)}`,
      text: (inflow > 0 ? `Откладываешь в среднем ${fmt0(inflow)} в месяц — это примерно ${Math.ceil(left / inflow)} ${plural(Math.ceil(left / inflow), ['месяц', 'месяца', 'месяцев'])}.` : 'За последние три месяца пополнений не было.') + need,
    });
  }
  return out;
}

const seenStories = () => pref.get('storiesSeen', []);
function storiesRow() {
  const list = insights();
  UI.stories = list;
  if (!list.length) return '';
  const seen = new Set(seenStories());
  // new ones first
  const order = list.map((s, i) => ({ s, i })).sort((a, b) => seen.has(a.s.id) - seen.has(b.s.id));
  return `<div class="row stories">${order.map(({ s, i }) => `<button class="story ${seen.has(s.id) ? 'seen' : ''}" data-act="story" data-i="${i}" style="${cv(s.color)}">
    <span class="sring"><span class="coin">${icon(s.icon)}</span></span><span class="slabel">${esc(s.label)}</span></button>`).join('')}</div>`;
}

function openStory(i) {
  const list = UI.stories || [];
  const s = list[i];
  if (!s) return closeStory();
  const seen = seenStories();
  if (!seen.includes(s.id)) pref.set('storiesSeen', [...seen, s.id].slice(-200));
  let el = $('#story');
  if (!el) { el = document.createElement('div'); el.id = 'story'; document.body.appendChild(el); }
  const top = Math.max(1, ...(s.bars || []).map(b => b.v));
  el.style.cssText = cv(s.color);
  el.innerHTML = `
    <div class="st-bars">${list.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="st-head"><span class="coin">${icon(s.icon)}</span><span>${esc(s.label)}</span><button class="icon-btn" data-st="close" aria-label="Закрыть">${icon('x')}</button></div>
    <div class="st-body">
      <h2>${esc(s.title)}</h2>
      <p>${esc(s.text)}</p>
      ${s.bars?.length > 1 ? `<div class="st-chart">${s.bars.map(b => `<div class="${b.now ? 'now' : ''}"><i style="height:${Math.max(3, (b.v / top) * 100)}%"></i><span>${esc(b.label)}</span></div>`).join('')}</div>` : ''}
      ${s.rows?.length ? `<div class="st-rows">${s.rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
    </div>
    ${s.action ? `<button class="btn st-act" data-st="act">${esc(s.action[0])}</button>` : ''}
    <div class="st-nav"><button data-st="prev" aria-label="Назад"></button><button data-st="next" aria-label="Дальше"></button></div>`;
  el.hidden = false;
  el.onclick = e => {
    const b = e.target.closest('[data-st]');
    if (!b) return;
    const k = b.dataset.st;
    if (k === 'close') return closeStory();
    if (k === 'act') { closeStory(); return s.action[1](); }
    if (k === 'prev') return i > 0 ? openStory(i - 1) : null;
    if (k === 'next') return i < list.length - 1 ? openStory(i + 1) : closeStory();
  };
}
function closeStory() {
  const el = $('#story');
  if (el) el.hidden = true;
  if (UI.tab === 'home') render();
}

// One line right after a purchase — only when there's something worth saying
function spendTip(t) {
  const c = find('category', t.to);
  if (!c) return null;
  const ym = t.date.slice(0, 7), e = monthExp(ym);
  const mi = +ym.slice(5) - 1;
  if (c.budget > 0 && ym === ymOf(monthOf())) {
    const v = e.by[c.id] || 0, left = c.budget - v, daysLeft = daysIn(monthOf()) - now.getDate() + 1;
    if (left < 0) return `Лимит «${c.name}» превышен на ${fmt0(-left)}.`;
    if (left < c.budget * 0.25) return `В «${c.name}» до лимита осталось ${fmt0(left)} на ${daysLeft} ${plural(daysLeft, DAYS)}.`;
  }
  if (t.sub) {
    const s = e.subs.find(x => x.to === c.id && lowerRu(x.sub) === lowerRu(t.sub));
    if (s && s.n >= 3) return `Это ${s.n}-й «${t.sub}» в ${MON_PREP[mi]} — уже ${fmt0(s.sum)}.`;
  }
  return null;
}

/* =========================================================
   Voice & AI: «кофе 1500 с каспи и такси 2000» → expenses
   The OpenAI key lives only in this device's storage — never in the code, the data or a backup.
   Without a key (or offline) a simple parser on the phone does the job.
   ========================================================= */
const AI = {
  get key() { try { return localStorage.getItem('mt.openaiKey') || ''; } catch (e) { return ''; } },
  set key(v) { try { v ? localStorage.setItem('mt.openaiKey', v) : localStorage.removeItem('mt.openaiKey'); } catch (e) { /* ignore */ } },
  get model() { try { return localStorage.getItem('mt.openaiModel') || 'gpt-4o-mini'; } catch (e) { return 'gpt-4o-mini'; } },
  set model(v) { try { localStorage.setItem('mt.openaiModel', v || 'gpt-4o-mini'); } catch (e) { /* ignore */ } },

  async json(system, user) {
    if (!this.key) throw new Error('Добавьте ключ OpenAI в настройках');
    let res;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
        body: JSON.stringify({ model: this.model, temperature: 0.2, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
    } catch (e) { throw new Error('Нет связи с OpenAI'); }
    if (!res.ok) {
      if (res.status === 401) throw new Error('Ключ OpenAI не подходит — проверьте его в настройках');
      if (res.status === 429) throw new Error('Лимит OpenAI исчерпан или слишком много запросов');
      if (res.status === 404) throw new Error(`Модель «${this.model}» недоступна — смените её в настройках`);
      throw new Error(`Ошибка OpenAI (${res.status})`);
    }
    const data = await res.json();
    try { return JSON.parse(data.choices[0].message.content); } catch (e) { throw new Error('ИИ ответил непонятно, попробуйте ещё раз'); }
  },
};

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const capFirst = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// What was this bought with last time? The newest expense with the same description decides — this is how
// categories are "learned": correct one once and the next «Magnum» lands in the right place.
function guessFromHistory(sub) {
  const q = lowerRu(sub);
  if (!q) return null;
  let best = null;
  for (const t of S.tx) {
    if (t.type !== 'expense' || !t.sub || !find('category', t.to)) continue;
    const ts = lowerRu(t.sub);
    if (ts !== q && !(q.length >= 4 && (ts.startsWith(q) || q.startsWith(ts)))) continue;
    if (!best || t.date > best.date || (t.date === best.date && (t.ts || 0) > (best.ts || 0))) best = t;
  }
  return best && { to: best.to, from: find('wallet', best.from) && !isDep(best.from) ? best.from : null };
}
function usualWallet() {
  const since = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)), n = {};
  for (const t of S.tx) if (t.type === 'expense' && t.date >= since && find('wallet', t.from) && !isDep(t.from)) n[t.from] = (n[t.from] || 0) + 1;
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || spendWallets()[0]?.id || null;
}
// «каспи», «фридом» should find Kaspi and Freedom: compare against a rough Cyrillic reading of the name too
const TRANSLIT = [['ee', 'и'], ['oo', 'у'], ['sh', 'ш'], ['ch', 'ч'], ['kh', 'х'], ['ya', 'я'], ['yu', 'ю'],
  ...[...'abcdefghijklmnopqrstuvwxyz'].map((c, i) => [c, 'абкдефгхижклмнопкрстуввксыз'[i]])];
const toCyr = s => TRANSLIT.reduce((a, [l, c]) => a.split(l).join(c), lowerRu(s));
const walletStems = w => [...new Set([lowerRu(w.name), toCyr(w.name)].map(n => n.replace(/[^a-zа-я0-9]/g, '').slice(0, 4)).filter(n => n.length >= 3))];
const catByName = name => S.categories.find(c => lowerRu(c.name) === lowerRu(name));
const walletByName = name => spendWallets().find(w => lowerRu(w.name) === lowerRu(name));

function parseSpendsLocal(text) {
  const yesterday = /вчера/i.test(text);
  const date = yesterday ? ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) : today();
  const out = [];
  for (let ch of text.replace(/вчера/gi, ' ').split(/\s*(?:(?<!\d),|,(?!\d)|[;\n]|\s(?:и|плюс|потом|ещё|еще)\s)\s*/i)) {
    const m = ch.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(тысяч[аи]?|тыс\.?|тыщ[иу]?|к(?![а-яё]))?/i);
    if (!m) continue;
    const amount = Math.round(parseFloat(m[1].replace(/\s/g, '').replace(',', '.')) * (m[2] ? 1000 : 1) * 100) / 100;
    if (!(amount > 0)) continue;
    let rest = ` ${lowerRu(ch.slice(0, m.index))} ${lowerRu(ch.slice(m.index + m[0].length))} `.replace(/(\s)(?:тенге|тг)(?=\s)|₸/g, '$1');
    let from = null;
    for (const w of spendWallets()) {
      const re = new RegExp(`\\s(?:(?:с|со|на|через|по|картой)\\s+)?(?:${walletStems(w).map(escRe).join('|')})[а-яa-z]*(?=\\s)`);
      if (walletStems(w).length && re.test(rest)) { from = w.id; rest = rest.replace(re, ' '); break; }
    }
    const sub = capFirst(rest.replace(/\s(?:за|на|в)\s*$/i, ' ').replace(/^\s*(?:за|на)\s/i, ' ').replace(/\s+/g, ' ').trim());
    const g = guessFromHistory(sub);
    out.push({ amount, sub, to: g?.to || catByName(sub)?.id || null, from: from || g?.from || usualWallet(), date });
  }
  return out;
}

async function parseSpendsAI(text) {
  const recent = [], seen = new Set();
  for (const t of sortTx(S.tx.filter(t => t.type === 'expense' && t.sub && find('category', t.to)))) {
    const k = lowerRu(t.sub);
    if (seen.has(k)) continue;
    seen.add(k);
    recent.push(`${t.sub} → ${findOr('category', t.to).name}`);
    if (recent.length >= 40) break;
  }
  const r = await AI.json(
    `Ты разбираешь короткую запись трат на русском (могут встречаться казахские слова) и возвращаешь только JSON:
{"items":[{"amount": сумма в тенге числом, "what": "на что, коротко, с большой буквы", "category": "точное название из списка категорий или null", "new_category": "короткое название новой категории — только если ни одна из списка не подходит, иначе null", "wallet": "точное название кошелька из списка или null", "date": "YYYY-MM-DD"}]}
Сегодня ${today()}. «Вчера» — это ${ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))}. «Полторы тысячи», «1.5к», «тыщу» — пиши числами.
Категории: ${S.categories.map(c => c.name).join(', ')}.
Кошельки: ${spendWallets().map(w => w.name).join(', ')}.
Как человек раньше относил траты (что → категория): ${recent.join('; ') || 'пока нет'}.
Не выдумывай траты, которых нет в тексте. Переводы и доходы пропускай.`, text);
  const items = Array.isArray(r?.items) ? r.items : [];
  return items.map(x => {
    const amount = Math.round(Number(String(x.amount).replace(/[^\d.,]/g, '').replace(',', '.')) * 100) / 100;
    const sub = capFirst(String(x.what || '').trim().slice(0, 40));
    const g = guessFromHistory(sub);
    const cat = catByName(x.category || '') || (g && find('category', g.to));
    return {
      amount, sub,
      to: cat?.id || null,
      newCat: !cat && x.new_category ? capFirst(String(x.new_category).trim().slice(0, 24)) : '',
      from: walletByName(x.wallet || '')?.id || g?.from || usualWallet(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') && x.date <= today() ? x.date : today(),
    };
  }).filter(x => x.amount > 0);
}

function openVoice(text = '') {
  // iOS asks for the microphone on every launch of a home-screen app, so dictation goes through the keyboard's 🎤
  const sh = openSheet(`
    ${sheetHead('Записать траты')}
    <textarea id="v-text" class="vtext" rows="3" placeholder="кофе 1500 с каспи и такси 2000" enterkeyhint="done">${esc(text)}</textarea>
    <div class="vhint">Нажмите 🎤 на клавиатуре и продиктуйте — или напишите текстом.
      ${AI.key ? '' : '<br>Без ключа OpenAI разбираю сам — простые фразы вроде «обед 2500 с каспи». <button class="linkish" data-act="ai">Подключить ИИ</button>'}</div>
    <div class="actions"><button class="btn primary" id="v-go">${AI.key ? 'Разобрать с ИИ' : 'Разобрать'}</button></div>`);
  const ta = $('#v-text', sh);
  setTimeout(() => ta.focus(), 300);
  $('#v-go', sh).onclick = async () => {
    const t = ta.value.trim();
    if (!t) return shake(ta);
    let items, note = '';
    if (AI.key) {
      const btn = $('#v-go', sh);
      btn.disabled = true;
      btn.textContent = 'Разбираю…';
      try { items = await parseSpendsAI(t); }
      catch (e) { items = parseSpendsLocal(t); note = `${e.message}. Разобрал сам — проверьте.`; }
      if (!sh.isConnected) return;
      btn.disabled = false;
    } else items = parseSpendsLocal(t);
    if (!items.length) return toast('Не нашёл сумм — напишите, например, «обед 2500»');
    openVoiceReview(items, t, note);
  };
}

// opts: title, back (false hides «Назад»), onSaved(recs) after the records are stored, onCancel when closed without saving
function openVoiceReview(items, text, note = '', opts = {}) {
  if (!S.categories.length || !spendWallets().length) return toast('Нужны хотя бы один кошелёк и одна категория');
  const catOpts = it => `${it.newCat ? `<option value="new" selected>＋ ${esc(it.newCat)} (новая)</option>` : ''}
    ${it.to ? '' : it.newCat ? '' : '<option value="" selected disabled>Категория?</option>'}
    ${S.categories.map(c => `<option value="${c.id}" ${c.id === it.to ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;
  const row = (it, i) => `<div class="vrow" data-i="${i}">
    <div class="vrow-top">
      <label class="v-subw">${icon('pencil')}<input class="v-sub" value="${esc(it.sub)}" placeholder="${it.raw ? 'Название' : 'На что'}" maxlength="40" autocomplete="off" enterkeyhint="done" aria-label="${it.raw ? 'Название продавца' : 'На что'}"></label>
      <input class="v-amt" inputmode="decimal" value="${it.amount}" autocomplete="off" enterkeyhint="done"><span class="v-cur">₸</span>
      <button class="icon-btn v-del" aria-label="Убрать">${icon('x')}</button>
    </div>
    <div class="vrow-sel">
      <select class="v-cat ${it.to || it.newCat ? '' : 'need'}">${catOpts(it)}</select>
      <select class="v-w">${spendWallets().map(w => `<option value="${w.id}" ${w.id === it.from ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>
    </div>
    ${it.date !== today() || it.card || it.raw ? `<div class="v-date">${[it.date !== today() ? dayLabel(it.date) : '', it.card ? esc(it.card) : '',
      it.raw && lowerRu(it.raw) !== lowerRu(it.sub) ? `в банке: ${esc(it.raw.trim().slice(0, 40))}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
  </div>`;
  const sh = openSheet(`
    ${sheetHead(opts.title || 'Проверьте')}
    ${note ? `<div class="vnote">${esc(note)}</div>` : ''}
    <div id="v-list">${items.map(row).join('')}</div>
    <div class="actions">${opts.back === false ? '' : '<button class="btn" id="v-back">Назад</button>'}<button class="btn primary" id="v-save"></button></div>`);
  const total = () => {
    const rows = $$('.vrow', sh);
    const sum = rows.reduce((a, r) => a + (money($('.v-amt', r).value) || 0), 0);
    $('#v-save', sh).textContent = rows.length ? `Записать ${fmt(sum)}` : 'Нечего записывать';
  };
  total();
  sh.addEventListener('input', total);
  sh.addEventListener('change', e => e.target.classList.contains('v-cat') && e.target.classList.remove('need'));
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  sh.addEventListener('click', e => { const d = e.target.closest('.v-del'); if (d) { d.closest('.vrow').remove(); total(); } });
  $('#v-back', sh)?.addEventListener('click', () => openVoice(text));
  $('#v-save', sh).onclick = () => {
    const rows = $$('.vrow', sh);
    if (!rows.length) { opts.onSaved?.([]); return closeSheet(); }
    const recs = [];
    for (const r of rows) {
      const it = items[+r.dataset.i], amount = money($('.v-amt', r).value), cat = $('.v-cat', r);
      if (!(amount > 0)) return shake($('.v-amt', r));
      if (!cat.value) { cat.classList.add('need'); return shake(cat); }
      recs.push({ it, amount, sub: $('.v-sub', r).value.trim(), to: cat.value, from: $('.v-w', r).value });
    }
    const undo = snapshot();
    const created = {};
    for (const x of recs) {
      if (x.to === 'new') {
        const name = x.it.newCat;
        if (!created[name]) {
          const ex = catByName(name);
          if (ex) created[name] = ex.id;
          else {
            const ic = BOK_ICONS.find(([re]) => re.test(lowerRu(name)))?.[1] || 'shopping-bag';
            const c = { id: uid(), name, icon: ic, color: COLORS[(S.categories.length * 5 + 3) % COLORS.length], budget: 0 };
            S.categories.push(c);
            created[name] = c.id;
          }
        }
        x.to = created[name];
      }
      const t = { id: uid(), type: 'expense', from: x.from, to: x.to, amount: x.amount, date: x.it.date, sub: x.sub, note: '', ts: Date.now() };
      if (x.it.ext) t.ext = x.it.ext; // Apple Pay inbox row id — never import it twice
      if (x.it.card) t.card = x.it.card;
      // remember a renamed Apple Pay merchant, so next time it arrives with your name
      if (x.it.raw && x.sub) {
        const k = merchantKey(x.it.raw);
        if (x.sub !== tidyMerchant(x.it.raw)) S.aliases[k] = x.sub; else delete S.aliases[k];
      }
      S.tx.push(t);
    }
    UI.bump = recs[recs.length - 1].to;
    // one tip is enough: the first purchase that has something worth saying
    let tip = null;
    for (const t of S.tx.slice(-recs.length)) if ((tip = spendTip(t))) { UI.dots.add(t.to); break; }
    save();
    closeSheet();
    render();
    opts.onSaved?.(recs);
    const sum = recs.reduce((a, x) => a + x.amount, 0);
    toast(`Записано ${recs.length} ${plural(recs.length, ['трата', 'траты', 'трат'])}: ${fmt(sum)}`, undo, true, tip);
  };
}

function openAISettings() {
  const sh = openSheet(`
    ${sheetHead('ИИ (OpenAI)')}
    <p class="set-note" style="padding:0 0 8px">ИИ разбирает голосовые и текстовые записи трат и подбирает категории. Без ключа работает простой разбор на телефоне.</p>
    <div class="field"><span>Ключ API</span><input id="ai-key" type="password" placeholder="${AI.key ? '•••• сохранён' : 'sk-…'}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"></div>
    <div class="field"><span>Модель</span><input id="ai-model" value="${esc(AI.model)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"></div>
    <p class="set-note" style="padding:10px 0 0">Ключ хранится только на этом телефоне: его нет в коде, в данных и в резервной копии. Создайте отдельный ключ и поставьте месячный лимит трат в кабинете OpenAI. В OpenAI уходит только текст, который вы диктуете, плюс названия ваших категорий и кошельков.</p>
    <div class="actions">
      ${AI.key ? `<button class="btn danger" id="ai-del">Удалить ключ</button>` : ''}
      <button class="btn primary" id="ai-save">Сохранить</button>
    </div>`);
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  $('#ai-save', sh).onclick = () => {
    const k = $('#ai-key', sh).value.trim();
    if (k) AI.key = k;
    AI.model = $('#ai-model', sh).value.trim();
    closeSheet();
    render();
    toast(AI.key ? 'ИИ подключён' : 'Сохранено');
  };
  $('#ai-del', sh)?.addEventListener('click', () => { AI.key = ''; closeSheet(); render(); toast('Ключ удалён'); });
}

/* =========================================================
   Apple Pay: a Shortcuts automation drops each purchase into a Supabase table; the app takes them,
   you confirm the categories, and they are deleted there. The project address, key and secret live
   only on this phone, like the OpenAI key.
   ========================================================= */
const INBOX = {
  get cfg() { try { return JSON.parse(localStorage.getItem('mt.inbox')) || {}; } catch (e) { return {}; } },
  set cfg(v) { try { v ? localStorage.setItem('mt.inbox', JSON.stringify(v)) : localStorage.removeItem('mt.inbox'); } catch (e) { /* ignore */ } },
  get ready() { const c = this.cfg; return !!(c.url && c.key && c.secret); },
  base(c = this.cfg) { return c.url.trim().replace(/\/+$/, ''); },
  async call(fn, body) {
    const c = this.cfg;
    let res;
    try {
      res = await fetch(`${this.base(c)}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) { throw new Error('Нет связи с Supabase'); }
    if (res.status === 401 || res.status === 403) throw new Error('Supabase не принял ключ — проверьте его в настройках Apple Pay');
    if (res.status === 404) throw new Error('В Supabase нет функций — выполните SQL из настроек Apple Pay');
    if (!res.ok) throw new Error(`Supabase ответил ошибкой ${res.status}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  },
  take() { return this.call('inbox_take', { p_secret: this.cfg.secret }); },
  done(ids) { return ids.length ? this.call('inbox_done', { p_secret: this.cfg.secret, p_ids: ids }) : Promise.resolve(); },
};
const newSecret = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join('');

// «1 500,00 ₸», «KZT 1,500.00», «1500» → 1500
function looseAmount(v) {
  let s = String(v ?? '').replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  const sep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  s = sep >= 0 && s.length - sep - 1 <= 2 ? s.slice(0, sep).replace(/[.,]/g, '') + '.' + s.slice(sep + 1) : s.replace(/[.,]/g, '');
  return Math.round(parseFloat(s) * 100) / 100;
}
// «MAGNUM CASH&CARRY» → «Magnum Cash&carry»; normal names stay as they are
// «ТОО "MAGNUM CASH&CARRY"» → «Magnum Cash&carry»: legal forms and quotes go, shouting gets calm
const tidyMerchant = m => {
  m = String(m || '').replace(/["«»“”'`]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:ИП|ТОО|АО|ПК|ЧП|TOO|LLP|IP|LLC|JSC)\.?\s+/i, '').trim().slice(0, 40);
  return /[a-zа-яё]/.test(m) ? m : m.toLowerCase().replace(/(^|[\s.-])(\S)/g, (x, a, b) => a + b.toUpperCase());
};
const merchantKey = m => lowerRu(String(m || '').replace(/\s+/g, ' '));
// the name you gave this merchant last time, else a tidied version of the bank's one
const merchantName = raw => S.aliases[merchantKey(raw)] || tidyMerchant(raw);
// the wallet this card paid from last time, else one whose name appears in the card's name
function walletForCard(card) {
  if (!card) return null;
  const last = sortTx(S.tx.filter(t => t.card === card && find('wallet', t.from) && !isDep(t.from)))[0];
  if (last) return last.from;
  const c = `${lowerRu(card)} ${toCyr(card)}`;
  return spendWallets().find(w => walletStems(w).some(st => c.includes(st)))?.id || null;
}

async function aiCategorize(names) {
  const r = await AI.json(
    `Для каждого магазина или заведения подбери категорию расходов. Отвечай только JSON:
{"items":[{"merchant":"как в запросе","category":"точное название из списка или null","new_category":"короткое название новой категории, только если ничего не подходит, иначе null"}]}
Категории: ${S.categories.map(c => c.name).join(', ')}.`, names.join('\n'));
  const out = {};
  for (const x of Array.isArray(r?.items) ? r.items : []) out[lowerRu(x.merchant)] = x;
  return out;
}

let inboxBusy = false;
async function checkInbox(manual) {
  if (!INBOX.ready || inboxBusy) return;
  if (!manual && (!navigator.onLine || !sheetRoot.hidden || UI.tab !== 'home')) return; // never interrupt
  inboxBusy = true;
  try {
    const rows = (await INBOX.take()) || [];
    const known = new Set(S.tx.map(t => t.ext).filter(Boolean));
    const stale = rows.filter(r => known.has(r.id)).map(r => r.id); // saved earlier, delete failed then
    if (stale.length) INBOX.done(stale).catch(() => {});
    const fresh = rows.filter(r => !known.has(r.id) && looseAmount(r.amount) > 0);
    if (!fresh.length) { if (manual) toast(rows.length ? 'Новых покупок нет' : 'Покупок пока нет — оплатите что-нибудь через Apple Pay'); return; }
    const items = fresh.map(r => {
      const sub = merchantName(r.merchant), g = guessFromHistory(sub);
      return { ext: r.id, card: r.card || '', raw: r.merchant || '', amount: looseAmount(r.amount), sub, to: g?.to || null,
        from: walletForCard(r.card) || g?.from || usualWallet(), date: ymd(new Date(r.created_at)) };
    });
    let note = '';
    const unknown = [...new Set(items.filter(it => !it.to && it.sub).map(it => it.sub))];
    if (unknown.length && AI.key) {
      try {
        const ai = await aiCategorize(unknown);
        for (const it of items) {
          const x = !it.to && ai[lowerRu(it.sub)];
          if (!x) continue;
          const c = catByName(x.category || '');
          if (c) it.to = c.id; else if (x.new_category) it.newCat = capFirst(String(x.new_category).trim().slice(0, 24));
        }
      } catch (e) { note = `${e.message}. Категории выберите сами.`; }
    }
    if (!manual && !sheetRoot.hidden) return; // something opened meanwhile — ask next time
    const ids = fresh.map(r => r.id);
    openVoiceReview(items, '', note, {
      title: `Apple Pay · ${items.length} ${plural(items.length, ['покупка', 'покупки', 'покупок'])}`,
      back: false,
      // removed rows count as declined: they're deleted from Supabase too
      onSaved: () => INBOX.done(ids).catch(() => toast('Сохранено, но Supabase не ответил — уберу записи в следующий раз')),
    });
  } catch (e) {
    if (manual) toast(e.message);
  } finally {
    inboxBusy = false;
  }
}

function copyText(text, what) {
  navigator.clipboard?.writeText(text).then(() => toast(`${what} скопирован${/а$/.test(what) ? 'а' : ''}`), () => toast('Не удалось скопировать'));
}

function openApplePay() {
  const c = INBOX.cfg;
  const secret = c.secret || newSecret();
  const sh = openSheet(`
    ${sheetHead('Apple Pay')}
    <p class="set-note" style="padding:0 0 8px">После каждой оплаты Apple Pay команда на iPhone отправляет сумму и магазин в ваш Supabase. Когда вы откроете «Деньги», покупки появятся на проверку — подтвердите категории, и записи в Supabase удалятся. Покупки через Kaspi QR сюда не попадают.</p>
    <div class="label">1. Supabase</div>
    <div class="set-card">
      <div class="field"><span>Адрес проекта</span><input id="ap-url" placeholder="https://…supabase.co" value="${esc(c.url || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url" enterkeyhint="done"></div>
      <div class="field"><span>Публичный ключ</span><input id="ap-key" type="password" placeholder="${c.key ? '•••• сохранён' : 'anon public'}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"></div>
    </div>
    <button class="btn add-bill" id="ap-sql">${icon('copy')} Скопировать SQL для Supabase</button>
    <div class="label">2. Команда на iPhone</div>
    <div class="set-card ap-copy">
      <button type="button" data-copy="url"><span>URL</span><small>${c.url ? esc(INBOX.base({ url: c.url }) + '/rest/v1/applepay_inbox') : 'сначала адрес проекта'}</small>${icon('copy')}</button>
      <button type="button" data-copy="key"><span>Ключ</span><small>${c.key ? 'для заголовков apikey и Authorization' : 'сначала ключ'}</small>${icon('copy')}</button>
      <button type="button" data-copy="secret"><span>Секрет</span><small>${secret.slice(0, 6)}…${secret.slice(-4)}</small>${icon('copy')}</button>
    </div>
    <p class="set-note" style="padding:8px 0 0">Секрет — ваш личный пароль к этим записям. Он хранится только здесь и в команде.</p>
    <div class="actions">
      ${c.url ? `<button class="btn danger" id="ap-off">Отключить</button>` : ''}
      <button class="btn primary" id="ap-save">Сохранить и проверить</button>
    </div>`);
  sh.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
  const read = () => ({ url: $('#ap-url', sh).value.trim(), key: $('#ap-key', sh).value.trim() || c.key || '', secret });
  sh.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const v = read();
    if (b.dataset.copy === 'url') return v.url ? copyText(INBOX.base(v) + '/rest/v1/applepay_inbox', 'Адрес') : toast('Сначала вставьте адрес проекта');
    if (b.dataset.copy === 'key') return v.key ? copyText(v.key, 'Ключ') : toast('Сначала вставьте ключ');
    copyText(secret, 'Секрет');
  });
  // fetched up front: iOS only lets a page write to the clipboard right inside the tap
  let sql = '';
  fetch('supabase/applepay.sql').then(r => r.text()).then(t => (sql = t)).catch(() => {});
  $('#ap-sql', sh).onclick = () => (sql ? copyText(sql, 'SQL') : toast('Нужен интернет, чтобы скопировать SQL'));
  $('#ap-save', sh).onclick = () => {
    const v = read();
    if (!/^https:\/\/.+/.test(v.url)) return shake($('#ap-url', sh).closest('.field'));
    if (!v.key) return shake($('#ap-key', sh).closest('.field'));
    INBOX.cfg = v;
    closeSheet();
    render();
    setTimeout(() => checkInbox(true), 350);
  };
  $('#ap-off', sh)?.addEventListener('click', () => { INBOX.cfg = null; closeSheet(); render(); toast('Apple Pay отключён'); });
}

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
      <button class="set-row" data-act="bills">${icon('repeat')}Платежи и подписки<small>${S.plan.bills.length}</small></button>
      <button class="set-row" data-act="applepay">${icon('credit-card')}Apple Pay<small>${INBOX.ready ? 'подключён' : 'выключен'}</small></button>
      <button class="set-row" data-act="ai">${icon('key-round')}ИИ (OpenAI)<small>${AI.key ? 'подключён' : 'нет ключа'}</small></button>
    </div>
    <div class="set-note">План показывает, сколько можно потратить сегодня, чтобы денег хватило до зарплаты.</div>

    <div class="group-title">Оформление</div>
    <div class="seg theme-seg">
      ${[['dark', 'Тёмная'], ['light', 'Светлая'], ['system', 'Как в системе']].map(([k, n]) =>
        `<button data-act="theme" data-theme="${k}" class="${pref.get('theme', 'dark') === k ? 'on' : ''}">${n}</button>`).join('')}
    </div>

    <div class="group-title">Резервная копия</div>
    <div class="set-list">
      <button class="set-row" data-act="export">${icon('download')}Сохранить копию<small>${S.tx.length} ${plural(S.tx.length, ['запись', 'записи', 'записей'])}</small></button>
      <button class="set-row" data-act="import">${icon('upload')}Восстановить из копии</button>
      <button class="set-row" data-act="import-csv">${icon('upload')}Импорт из BudgetOK<small>CSV</small></button>
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
    <div class="set-note">Деньги · v2.4 · работает без интернета</div>`;
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
   Import from BudgetOK (its CSV export)
   ========================================================= */
// Quoted fields may contain the separator, doubled quotes and line breaks.
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.slice(0, text.search(/\r?\n|$/));
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c !== '"') f += c;
      else if (text[i + 1] === '"') { f += '"'; i++; }
      else q = false;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

const BOK_ICONS = [
  [/еда|продукт|магазин/, 'shopping-cart'], [/кафе|ресторан|кофе/, 'coffee'], [/транспорт|такси|бензин|авто/, 'bus'],
  [/подар/, 'gift'], [/развлеч|отдых|кино/, 'gamepad-2'], [/рассроч|кредит|ипотек/, 'percent'],
  [/дом|квартир|аренд|коммунал/, 'house'], [/долг/, 'hand-coins'], [/подписк/, 'repeat'],
  [/связь|телефон|интернет/, 'smartphone'], [/накоп|сбереж|депозит/, 'piggy-bank'], [/здоров|аптек|врач/, 'heart-pulse'],
  [/одежд|обув/, 'shirt'], [/спорт|зал/, 'dumbbell'], [/учеб|образов|курс/, 'graduation-cap'],
  [/зарплат|аванс/, 'briefcase'], [/наличн/, 'banknote'],
];
const BOK_TYPES = { 'расход': 'expense', 'доход': 'income', 'перевод': 'transfer' };
const lowerRu = s => String(s || '').trim().toLowerCase().replace(/ё/g, 'е');

// Turn a BudgetOK export into a merged copy of S. Nothing is changed until the caller swaps it in.
function budgetOKImport(text) {
  const rows = parseCSV(text);
  const head = (rows.shift() || []).map(lowerRu);
  const col = n => head.indexOf(n);
  const C = { type: col('тип операции'), date: col('дата'), wallet: col('кошелек'), cat: col('категория'), sub: col('подкатегория'),
    amount: col('сумма'), cur: col('валюта'), amount2: col('сумма_dop'), cur2: col('валюта_dop'), note: col('комментарий') };
  if ([C.type, C.date, C.wallet, C.cat, C.amount].some(i => i < 0)) throw new Error('format');

  const d = JSON.parse(JSON.stringify(S));
  const fresh = !d.tx.length;
  const made = { income: 0, wallet: 0, category: 0 };
  const get = (r, i) => (i < 0 ? '' : String(r[i] ?? '').replace(/\s+/g, ' ').trim());
  const item = (kind, name) => {
    const list = d[LISTS[kind]];
    let it = list.find(x => lowerRu(x.name) === lowerRu(name));
    if (!it) {
      const ln = lowerRu(name);
      const ic = BOK_ICONS.find(([re]) => re.test(ln))?.[1];
      it = { id: uid(), name, icon: ic || { income: 'hand-coins', wallet: 'credit-card', category: 'circle-dollar-sign' }[kind],
        color: COLORS[(list.length * 5 + 3) % COLORS.length] };
      if (kind === 'wallet') it.initial = 0;
      if (kind === 'category') it.budget = 0;
      list.push(it);
      made[kind]++;
    }
    return it.id;
  };
  const money = s => parseFloat(String(s).replace(/[\s ]/g, '').replace(',', '.'));
  const isTenge = c => !c || /₸|kzt|тг|тенге/i.test(c);
  const toYmd = s => {
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
  };

  const seen = new Set(d.tx.map(t => t.imp).filter(Boolean));
  const repeats = {};
  const out = [];
  let skipped = 0, dup = 0;
  rows.forEach(r => {
    const type = BOK_TYPES[lowerRu(get(r, C.type))];
    const date = toYmd(get(r, C.date));
    const wallet = get(r, C.wallet), cat = get(r, C.cat), sub = get(r, C.sub), note = get(r, C.note);
    // amounts in another currency: take the copy converted to tenge, if the export has one
    let amount = money(get(r, C.amount));
    if (!isTenge(get(r, C.cur)) && isTenge(get(r, C.cur2)) && get(r, C.amount2)) amount = money(get(r, C.amount2));
    if (!type || !date || !wallet || !cat || !(amount > 0)) { skipped++; return; }

    // same row twice in one file is two real operations; the same file twice is not
    const base = ['bok', type, date, wallet, cat, sub, amount, note].join('|');
    repeats[base] = (repeats[base] || 0) + 1;
    const imp = base + '|' + repeats[base];
    if (seen.has(imp)) { dup++; return; }

    const t = { id: uid(), type, amount: Math.round(amount * 100) / 100, date, sub: '', note, imp };
    if (type === 'income') { t.from = item('income', cat); t.to = item('wallet', wallet); }
    else if (type === 'transfer') { t.from = item('wallet', wallet); t.to = item('wallet', cat); }
    else { t.from = item('wallet', wallet); t.to = item('category', cat); t.sub = sub || note; t.note = sub ? note : ''; }
    out.push(t);
  });

  // ts only orders records within one day; BudgetOK lists a day's operations in the order they were made
  const now = Date.now() - out.length;
  out.forEach((t, i) => (t.ts = now + i));
  d.tx.push(...out);

  // a brand-new app still holds the sample wallets and categories: drop the ones nothing uses
  if (fresh && out.length) {
    const used = new Set([...d.tx.flatMap(t => [t.from, t.to]), ...d.quick.flatMap(q => [q.from, q.to]),
      ...d.plan.bills.flatMap(b => [b.cat, b.wallet]), ...d.plan.exclude]);
    for (const k of Object.values(LISTS)) d[k] = d[k].filter(x => used.has(x.id));
  }

  const dates = out.map(t => t.date).sort();
  const n = type => out.filter(t => t.type === type).length;
  return { d, added: out.length, dup, skipped, made, from: dates[0], to: dates[dates.length - 1],
    counts: { expense: n('expense'), income: n('income'), transfer: n('transfer') } };
}

$('#import-csv').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let res;
    try { res = budgetOKImport(r.result); } catch (err) { return toast('Это не похоже на выгрузку BudgetOK'); }
    if (!res.added) return toast(res.dup ? 'Все эти записи уже импортированы' : 'В файле не нашлось операций');
    const dm = s => s.split('-').reverse().join('.');
    const c = res.counts, m = res.made;
    const lines = [
      `${res.added} ${plural(res.added, ['запись', 'записи', 'записей'])} за ${dm(res.from)} – ${dm(res.to)}:`,
      `расходов ${c.expense}, доходов ${c.income}, переводов ${c.transfer}.`,
      m.wallet + m.category + m.income ? `\nНовые: кошельков ${m.wallet}, категорий ${m.category}, источников дохода ${m.income}.` : '',
      res.dup ? `Уже были и будут пропущены: ${res.dup}.` : '',
      res.skipped ? `Не удалось разобрать строк: ${res.skipped}.` : '',
    ];
    if (!confirm(`Импортировать из BudgetOK?\n\n${lines.filter(Boolean).join('\n')}`)) return;
    const undo = snapshot();
    S = res.d;
    save();
    render();
    toast('Импорт готов. Сверьте балансы кошельков с банком', undo);
  };
  r.readAsText(f);
});

/* =========================================================
   Global events
   ========================================================= */
let toastTimer;
function toast(msg, undo, done, tip) {
  const t = $('#toast');
  t.innerHTML = `${done ? `<span class="tcheck">${icon('check')}</span>` : ''}<span class="tmsg">${esc(msg)}${tip ? `<small class="ttip">${icon('lightbulb')}<span>${esc(tip)}</span></small>` : ''}</span>${undo ? '<button class="undo">Отменить</button>' : ''}`;
  t.classList.toggle('has-tip', !!tip);
  t.classList.toggle('has-undo', !!undo);
  t.hidden = false;
  if (undo) t.querySelector('.undo').onclick = () => { undo(); toast('Отменено'); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), tip ? 7000 : undo ? 5000 : 1800);
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
  'import-csv': () => $('#import-csv').click(),
  theme: el => { pref.set('theme', el.dataset.theme); applyTheme(); render(); },
  stack: (el, e) => {
    const t = e?.target.closest('.tile[data-id]');
    if (!t) return;
    const ids = depsOrdered().map(w => w.id);
    // the front card (or any card while picking a transfer target) behaves like any other tile
    if (UI.sel || ids[0] === t.dataset.id) return tapTile(t);
    const order = [t.dataset.id, ...ids.filter(id => id !== t.dataset.id)];
    pref.set('depOrder', order);
    const m = Math.min(order.length, STACK_MAX);
    $$('.tile.dep', el).forEach(c => { const i = order.indexOf(c.dataset.id); c.style.top = `${(m - 1 - i) * STACK_PEEK}px`; c.style.zIndex = m - i; });
  },
  'stack-all': () => { UI.stackOpen = !UI.stackOpen; render(); },
  'new-dep': () => { clearSel(); openItem('wallet', null, { dep: true }); },
  'dep-yes': el => {
    const w = find('wallet', el.dataset.id);
    if (!w) return;
    const undo = snapshot();
    w.dep = true;
    S.plan.exclude = S.plan.exclude.filter(x => x !== w.id);
    save();
    render();
    toast(`«${w.name}» теперь депозит — задайте ставку и цель`, undo);
  },
  'dep-no': () => { S.plan.depAsked = true; save(); render(); },
  debts: el => { clearSel(); openDebts(el.dataset.dir); },
  voice: () => { clearSel(); openVoice(); },
  story: el => { clearSel(); openStory(+el.dataset.i); },
  ai: () => openAISettings(),
  applepay: () => openApplePay(),
  bills: () => { openPlan(); setTimeout(() => $('.lrow', sheetRoot)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320); },
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
  if (document.visibilityState !== 'visible') return;
  if (today() !== ymd(now)) return location.reload();
  checkInbox();
});

render();
checkSummary();
setTimeout(checkInbox, 600); // Apple Pay purchases waiting in Supabase

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
