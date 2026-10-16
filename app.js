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

// exact amounts: tiyn shown only when present (1,500 ₸ / 1,500.50 ₸)
const fmt = n => {
  const a = Math.round(Math.abs(n) * 100) / 100;
  const frac = Math.round(a * 100) % 100 !== 0;
  return (n < 0 && a ? '−' : '') + a.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 }) + ' ₸';
};
// computed guidance (limits, averages): whole tenge
const fmt0 = n => fmt(n < 0 ? -Math.floor(-n) : Math.floor(n));
const compact = n => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
};
const fmtShort = n => (Math.abs(n) >= 1e6 ? (n < 0 ? '−' : '') + compact(Math.abs(n)) + ' ₸' : fmt(n));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map(m => m.slice(0, 3));

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#a16207', '#78716c', '#64748b', '#334155'];

const UI_ICONS = new Set(['plus', 'x', 'chevron-left', 'chevron-right', 'list', 'chart-pie', 'settings',
  'arrow-down-wide-narrow', 'arrow-up-narrow-wide', 'arrow-right', 'trash-2', 'download', 'upload', 'check', 'search']);
const PICKER_ICONS = Object.keys(ICONS).filter(n => !UI_ICONS.has(n));

/* kinds: income source → wallet → category */
const LISTS = { income: 'incomes', wallet: 'wallets', category: 'categories' };
const KIND_NAME = { income: 'income source', wallet: 'wallet', category: 'category' };
const TX_KINDS = { income: ['income', 'wallet'], expense: ['wallet', 'category'], transfer: ['wallet', 'wallet'] };
const TARGETS = { income: ['wallet'], wallet: ['wallet', 'category'] };
const txTypeFor = (src, dst) => (src === 'income' ? 'income' : dst === 'wallet' ? 'transfer' : 'expense');

/* =========================================================
   Storage
   ========================================================= */
const KEY = 'money-tracker.v1';

function seed() {
  return {
    v: 1,
    incomes: [
      { id: uid(), name: 'Salary', icon: 'briefcase', color: '#22c55e' },
      { id: uid(), name: 'Other', icon: 'hand-coins', color: '#14b8a6' },
    ],
    wallets: [
      { id: uid(), name: 'Cash', icon: 'banknote', color: '#f59e0b', initial: 0 },
      { id: uid(), name: 'BCC', icon: 'credit-card', color: '#3b82f6', initial: 0 },
    ],
    categories: [
      { id: uid(), name: 'Groceries', icon: 'shopping-cart', color: '#f97316', budget: 0 },
      { id: uid(), name: 'Cafe', icon: 'coffee', color: '#a16207', budget: 0 },
      { id: uid(), name: 'Transport', icon: 'bus', color: '#0ea5e9', budget: 0 },
      { id: uid(), name: 'Home', icon: 'house', color: '#6366f1', budget: 0 },
      { id: uid(), name: 'Health', icon: 'heart-pulse', color: '#ef4444', budget: 0 },
      { id: uid(), name: 'Shopping', icon: 'shopping-bag', color: '#ec4899', budget: 0 },
      { id: uid(), name: 'Fun', icon: 'gamepad-2', color: '#8b5cf6', budget: 0 },
      { id: uid(), name: 'Mobile', icon: 'smartphone', color: '#64748b', budget: 0 },
    ],
    tx: [],
    lastBackup: null,
  };
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
  catch (e) { toast('Could not save — storage unavailable'); }
}

const pref = {
  get(k, def) { try { return JSON.parse(localStorage.getItem('mt.' + k)) ?? def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('mt.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

const defaultPlan = () => ({ on: true, paydays: [1, 16], reserve: 0, exclude: [], bills: [] });

let S = load();
if (!S) { S = seed(); save(); }
if (!S.plan) { S.plan = defaultPlan(); save(); }
if (!S.plan.bills) { S.plan.bills = []; save(); }
navigator.storage?.persist?.().catch(() => {});

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
const DELETED = { name: 'Deleted', icon: 'circle-dollar-sign', color: '#78716c' };
const findOr = (kind, id) => find(kind, id) || DELETED;

function inPeriod(date, P = UI.period) {
  if (P.mode === 'all') return true;
  if (P.mode === 'year') return date.startsWith(String(P.y));
  return date.startsWith(`${P.y}-${pad(P.m + 1)}`);
}
const periodTx = () => S.tx.filter(t => inPeriod(t.date));

function balances() {
  const b = {};
  S.wallets.forEach(w => (b[w.id] = +w.initial || 0));
  for (const t of S.tx) {
    if (t.type === 'income') b[t.to] = (b[t.to] || 0) + t.amount;
    else if (t.type === 'expense') b[t.from] = (b[t.from] || 0) - t.amount;
    else { b[t.from] = (b[t.from] || 0) - t.amount; b[t.to] = (b[t.to] || 0) + t.amount; }
  }
  return b;
}

function sums(txs) {
  const inc = {}, exp = {}, wIn = {}, wOut = {};
  let totalInc = 0, totalExp = 0;
  for (const t of txs) {
    if (t.type === 'income') { inc[t.from] = (inc[t.from] || 0) + t.amount; totalInc += t.amount; }
    if (t.type === 'expense') { exp[t.to] = (exp[t.to] || 0) + t.amount; totalExp += t.amount; }
  }
  return { inc, exp, totalInc, totalExp, wIn, wOut };
}

function subsFor(catId) {
  const c = {};
  for (const t of S.tx) if (t.type === 'expense' && t.to === catId && t.sub) c[t.sub] = (c[t.sub] || 0) + 1;
  return Object.keys(c).sort((a, b) => c[b] - c[a]);
}

/* ---------- pay-period plan: "safe to spend today" ----------
   Daily limit = (money at the start of today − reserve) / days left until next payday.
   Overspend today → tomorrow's limit shrinks; underspend → it grows. */
const dateOf = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((b - a) / 864e5);

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

function planInfo() {
  const p = S.plan;
  if (!p.on) return null;
  const pp = payPeriod();
  if (!pp) return null;
  const counted = id => !p.exclude.includes(id) && !!find('wallet', id);
  const bal = balances();
  const balance = S.wallets.filter(w => counted(w.id)).reduce((a, w) => a + (bal[w.id] || 0), 0);
  const tdy = ymd(pp.today), startS = ymd(pp.start);
  // money leaving the counted wallets: expenses + transfers to excluded wallets (e.g. a deposit)
  // bill payments are planned money, they don't eat into the daily limit
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

const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

const sortTx = arr => arr.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.ts || 0) - (a.ts || 0)));

/* =========================================================
   Rendering — shell
   ========================================================= */
const view = $('#view');

function periodLabel(P = UI.period) {
  if (P.mode === 'all') return 'All time';
  if (P.mode === 'year') return String(P.y);
  return P.y === now.getFullYear() ? MONTHS[P.m] : `${MON[P.m]} ${P.y}`;
}

function renderTopbar() {
  const tb = $('#topbar');
  if (UI.tab === 'settings') { tb.innerHTML = '<h1>Settings</h1>'; return; }
  const P = UI.period;
  const arrows = P.mode !== 'all';
  tb.innerHTML = `
    <div class="pnav">
      <button class="icon-btn" data-act="prev" ${arrows ? '' : 'hidden'} aria-label="Previous">${icon('chevron-left')}</button>
      <button class="period" data-act="today">${esc(periodLabel())}</button>
      <button class="icon-btn" data-act="next" ${arrows ? '' : 'hidden'} aria-label="Next">${icon('chevron-right')}</button>
    </div>
    <div class="seg">
      ${['month', 'year', 'all'].map(m => `<button data-act="mode" data-mode="${m}" class="${P.mode === m ? 'on' : ''}">${{ month: 'Month', year: 'Year', all: 'All' }[m]}</button>`).join('')}
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
const addTile = (kind, label) =>
  `<button class="tile add" data-act="new" data-kind="${kind}"><span class="coin">${icon('plus')}</span><span class="tname">${label}</span><span class="tamt">&nbsp;</span></button>`;

function renderHome() {
  const bal = balances();
  const s = sums(periodTx());
  const totalBal = S.wallets.reduce((a, w) => a + (bal[w.id] || 0), 0);
  const P = UI.period;

  let cats = [...S.categories];
  if (UI.sort === 'desc') cats.sort((a, b) => (s.exp[b.id] || 0) - (s.exp[a.id] || 0));
  if (UI.sort === 'asc') cats.sort((a, b) => (s.exp[a.id] || 0) - (s.exp[b.id] || 0));
  const sortLabel = { manual: ['list', 'My order'], desc: ['arrow-down-wide-narrow', 'Biggest'], asc: ['arrow-up-narrow-wide', 'Smallest'] }[UI.sort];

  view.innerHTML = `
    ${planCard()}
    <section class="sec">
      <div class="sec-head"><div class="left"><h3>Income</h3><div class="total">${fmt(s.totalInc)}</div></div></div>
      <div class="row">
        ${S.incomes.map(i => tile('income', i, s.inc[i.id] || 0, '', s.inc[i.id] ? '' : 'zero')).join('')}
        ${addTile('income', 'Add')}
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><div class="left"><h3>Wallets</h3><div class="total">${fmt(totalBal)}</div></div></div>
      <div class="row">
        ${S.wallets.map(w => tile('wallet', w, bal[w.id] || 0, '', (bal[w.id] || 0) < 0 ? 'neg' : '')).join('')}
        ${addTile('wallet', 'Add')}
      </div>
    </section>

    <section class="sec">
      <div class="sec-head">
        <div class="left"><h3>Expenses</h3><div class="total">${fmt(s.totalExp)}</div></div>
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
        ${addTile('category', 'Add')}
      </div>
    </section>`;
  if (UI.sel) applySel();
}

const shortDate = d => `${MON[d.getMonth()]} ${d.getDate()}`;

function planCard() {
  const p = planInfo();
  if (!p) return '';
  const over = p.leftToday < 0;
  const pct = p.limit > 0 ? Math.min(100, (p.spentToday / p.limit) * 100) : 100;
  let note;
  if (p.free <= 0) note = `You're short ${fmt(-p.free)} for ${p.unpaid.length ? 'bills' : 'your reserve'} until ${shortDate(p.end)}.`;
  else if (over && p.tomorrow !== null) note = `Over by ${fmt0(-p.leftToday)} — tomorrow's limit drops to ${fmt0(p.tomorrow)}.`;
  else note = `${fmt0(p.limit)} a day · ${p.daysLeft} day${p.daysLeft > 1 ? 's' : ''} to payday (${shortDate(p.end)})`;
  return `<section class="sec plan" data-act="plan">
    <div class="plan-top">
      <div><div class="plan-label">${over ? 'Over today’s limit' : 'Safe to spend today'}</div>
      <div class="plan-big ${over || p.free <= 0 ? 'neg' : 'ok'}">${fmt0(over ? -p.leftToday : p.leftToday)}</div></div>
      <div class="plan-right"><span>Until ${shortDate(p.end)}</span><b>${fmt(Math.max(0, p.free))}</b></div>
    </div>
    <div class="bar plan-bar ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    <div class="plan-note">${note}</div>
    ${p.unpaid.length ? (() => {
      const nx = p.unpaid[0], late = nx.due < p.today;
      return `<div class="plan-bills ${late ? 'late' : ''}">${icon('lock')}<span>${fmt(p.billsLeft)} set aside for ${p.unpaid.length} bill${p.unpaid.length > 1 ? 's' : ''} · ${late ? 'overdue' : 'next'}: ${esc(nx.b.name)}, ${shortDate(nx.due)}</span></div>`;
    })() : ''}
  </section>`;
}

function billStatus(o, pp) {
  if (o.paid) return { cls: 'paid', text: `Paid ${shortDate(dateOf(o.paid.date))}` };
  if (o.due < pp.today) return { cls: 'late', text: `Overdue since ${shortDate(o.due)}` };
  const d = dayDiff(pp.today, o.due);
  return { cls: 'due', text: d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due ${shortDate(o.due)}` };
}

function billsBlock(info) {
  const bills = S.plan.bills;
  const inPer = new Map((info?.bills || []).map(o => [o.b.id, o]));
  const rows = [...bills].sort((a, b) => a.day - b.day).map(b => {
    const cat = findOr('category', b.cat);
    const o = inPer.get(b.id);
    let st;
    if (o) st = billStatus(o, info);
    else st = { cls: 'later', text: info ? `Next period · ${shortDate(nextDue(b, info.end))}` : `Every ${ordinal(b.day)}` };
    return `<div class="bill-row" data-bill="${b.id}">
      <span class="coin" style="--c:${cat.color}">${icon(cat.icon)}</span>
      <span class="tx-main"><div class="tx-title">${esc(b.name)}</div><div class="tx-sub ${st.cls}">${st.text}</div></span>
      <b class="tx-amt">${fmt(b.amount)}</b>
      ${o && !o.paid ? `<button class="pay-btn" data-pay="${b.id}">Pay</button>` : o?.paid ? `<span class="paid-ic">${icon('check')}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="label">Mandatory payments</div>
    ${rows ? `<div class="list bills">${rows}</div>` : '<div class="set-note" style="padding:0 0 8px">Rent, utilities, internet, loans, subscriptions. Their money is set aside so the daily limit never touches it.</div>'}
    <button class="btn add-bill" id="bill-add">${icon('plus')} Add payment</button>`;
}

function payBill(id) {
  const b = S.plan.bills.find(x => x.id === id);
  if (!b) return;
  const w = S.wallets.find(x => !S.plan.exclude.includes(x.id)) || S.wallets[0];
  if (!w) return toast('Add a wallet first');
  openTx({ type: 'expense', from: w.id, to: b.cat, amount: b.amount, sub: b.name, bill: b.id, back: openPlan });
}

function openBill(id) {
  const ex = id ? S.plan.bills.find(b => b.id === id) : null;
  const b = ex ? { ...ex } : { name: '', amount: '', day: 1, cat: (S.categories.find(c => /home|rent|bill/i.test(c.name)) || S.categories[0] || {}).id };
  if (!S.categories.length) return toast('Add an expense category first');
  const sh = openSheet(`
    ${sheetHead(ex ? 'Edit payment' : 'New payment')}
    <div class="field"><span>Name</span><input id="b-name" maxlength="30" placeholder="Rent" value="${esc(b.name)}" autocomplete="off" enterkeyhint="done"></div>
    <div class="field"><span>Amount</span><input id="b-amount" inputmode="decimal" placeholder="0 ₸" value="${b.amount}" enterkeyhint="done"></div>
    <div class="field"><span>Day of month</span><select id="b-day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${b.day === i + 1 ? 'selected' : ''}>${ordinal(i + 1)}</option>`).join('')}</select></div>
    <div class="field"><span>Category</span><select id="b-cat">${S.categories.map(c => `<option value="${c.id}" ${c.id === b.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <p class="set-note" style="padding:10px 0 0">Monthly. The day falls into one of your pay periods. Until you pay it, its amount is set aside in that period. For something paid twice a month, add it twice with different days.</p>
    <div class="actions">
      ${ex ? `<button class="btn danger" id="b-del" aria-label="Delete">${icon('trash-2')}</button>` : ''}
      <button class="btn" id="b-back">Back</button>
      <button class="btn primary" id="b-save">Save</button>
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
    if (!confirm(`Delete “${ex.name}”? Past payments stay in History.`)) return;
    S.plan.bills = S.plan.bills.filter(x => x.id !== ex.id);
    save();
    render();
    openPlan();
  };
}

function openPlan() {
  const p = S.plan;
  const info = planInfo();
  const row = (k, v) => `<div class="field"><span>${k}</span><b class="fv">${v}</b></div>`;
  const sh = openSheet(`
    ${sheetHead('Spending plan')}
    ${info ? `
      ${row('Pay period', `${shortDate(info.start)} – ${shortDate(new Date(info.end - 864e5))}`)}
      ${row('Money in wallets', fmt(info.balance))}
      ${row('Bills still to pay', fmt(info.billsLeft))}
      ${row('Keep at the end', fmt(p.reserve))}
      ${row('Free to spend', `<span style="color:${info.free < 0 ? 'var(--neg)' : 'inherit'}">${fmt(info.free)}</span>`)}
      ${row('Spent this period', fmt(info.spentPeriod))}
      ${row('Days left (incl. today)', info.daysLeft)}
      ${row('Today’s limit', fmt0(info.limit))}
      ${row('Spent today', fmt(info.spentToday))}
      ${info.tomorrow !== null ? row('Tomorrow’s limit (if no more spending)', fmt0(info.tomorrow)) : ''}
      <p class="set-note" style="padding:10px 0 0">Every morning the limit is recalculated: (money − unpaid bills − reserve) ÷ days until payday. Spend less today and tomorrow’s limit grows; spend more and it shrinks.</p>` : ''}
    ${billsBlock(info)}
    <div class="label">Settings</div>
    <div class="field"><span>Show on Home</span><input type="checkbox" id="p-on" class="switch" ${p.on ? 'checked' : ''}></div>
    <div class="field"><span>Paydays (day of month)</span><input id="p-days" inputmode="text" placeholder="1, 16" value="${p.paydays.join(', ')}" autocomplete="off" enterkeyhint="done"></div>
    <div class="field"><span>Keep at the end of period</span><input id="p-res" inputmode="decimal" placeholder="0" value="${p.reserve || ''}" enterkeyhint="done"></div>
    <div class="field col"><span>Wallets that count</span>
      <div class="chips" id="p-w">${S.wallets.map(w => `<button type="button" class="chip ${p.exclude.includes(w.id) ? '' : 'on'}" data-w="${w.id}">${esc(w.name)}</button>`).join('')}</div>
      <span class="hint">Turn off savings or deposit accounts you don’t spend from. Moving money into them counts as spending.</span>
    </div>
    <div class="actions"><button class="btn primary" id="p-save">Save</button></div>`);

  $('#bill-add', sh).onclick = () => openBill();
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
    if (!days.length) return toast('Enter at least one payday, e.g. 1, 16');
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
  const where = kind === 'income' ? 'a wallet' : 'a category or another wallet';
  const h = $('#hint');
  h.innerHTML = `<span><b>${esc(it.name)}</b> → tap ${where}. Tap it again to edit.</span><button class="icon-btn" data-act="unsel" aria-label="Cancel">${icon('x')}</button>`;
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
  const hit = document.elementFromPoint(x, y)?.closest('.tile[data-id]');
  const over = validTarget(D.src, hit) ? hit : null;
  if (over !== D.over) {
    D.over?.classList.remove('over');
    over?.classList.add('over');
    D.over = over;
  }
}

function autoScroll() {
  if (!D.active) return;
  const { x, y } = D.pos;
  const row = document.elementFromPoint(x, y)?.closest('.row');
  if (row) {
    const r = row.getBoundingClientRect();
    if (x < r.left + 44) row.scrollLeft -= 7;
    else if (x > r.right - 44) row.scrollLeft += 7;
  }
  const vr = view.getBoundingClientRect();
  if (y < vr.top + 50) view.scrollTop -= 8;
  else if (y > vr.bottom - 110) view.scrollTop += 8;
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
document.addEventListener('pointerup', e => {
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

const sheetHead = title => `<div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>`;

function parseAmount(v) {
  v = String(v).replace(/\s/g, '').replace(/,/g, '.');
  if (!v) return NaN;
  if (!/^[\d.+\-]+$/.test(v)) return NaN;
  // allow simple sums like 1500+320-100
  const parts = v.match(/[+\-]?[^+\-]+/g) || [];
  return parts.reduce((a, p) => a + parseFloat(p), 0);
}

/* ---------- transaction sheet ---------- */
function openTx(o) {
  const ex = o.id ? S.tx.find(t => t.id === o.id) : null;
  const t = ex ? { ...ex } : { type: o.type, from: o.from, to: o.to, amount: o.amount || '', date: today(), sub: o.sub || '', note: '', bill: o.bill };
  const bills = S.plan.bills;
  const billSel = t.type === 'expense' && (bills.length || t.bill);
  const [fk, tk] = TX_KINDS[t.type];
  const title = { income: 'income', expense: 'expense', transfer: 'transfer' }[t.type];
  const opts = (kind, sel) => {
    const items = list(kind).map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)}</option>`);
    if (!find(kind, sel)) items.unshift(`<option value="${sel}" selected>Deleted</option>`);
    return items.join('');
  };

  const sh = openSheet(`
    ${sheetHead((ex ? 'Edit ' : 'New ') + title)}
    <div class="flow" id="tx-flow"></div>
    <div class="bal-note" id="tx-bal"></div>
    <label class="amount"><input id="f-amount" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0" value="${t.amount}"><span>₸</span></label>
    <div class="field"><span>From</span><select id="f-from">${opts(fk, t.from)}</select></div>
    <div class="field"><span>To</span><select id="f-to">${opts(tk, t.to)}</select></div>
    ${t.type === 'expense' ? `
      <div class="field col">
        <span>Spent on</span>
        <input id="f-sub" placeholder="e.g. Magnum, taxi, coffee…" autocomplete="off" enterkeyhint="done" value="${esc(t.sub)}">
        <div class="chips" id="sub-chips"></div>
      </div>` : ''}
    ${billSel ? `<div class="field"><span>Bill payment</span><select id="f-bill">
      <option value="">No</option>
      ${bills.map(b => `<option value="${b.id}" ${b.id === t.bill ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
      ${t.bill && !bills.some(b => b.id === t.bill) ? `<option value="${t.bill}" selected>Deleted bill</option>` : ''}
    </select></div>` : ''}
    <div class="field"><span>Date</span><input type="date" id="f-date" value="${t.date}"></div>
    <div class="field"><span>Note</span><input id="f-note" placeholder="Optional" autocomplete="off" enterkeyhint="done" value="${esc(t.note)}"></div>
    <div class="actions">
      ${ex ? `<button class="btn danger" id="tx-del" aria-label="Delete">${icon('trash-2')}</button>` : ''}
      <button class="btn primary" id="tx-save">Save</button>
    </div>`);

  const fFrom = $('#f-from', sh), fTo = $('#f-to', sh), fAmt = $('#f-amount', sh), fSub = $('#f-sub', sh);
  const bal = balances();

  const paintFlow = () => {
    const a = findOr(fk, fFrom.value), b = findOr(tk, fTo.value);
    const side = it => `<div class="side"><span class="coin" style="--c:${it.color}">${icon(it.icon)}</span><span>${esc(it.name)}</span></div>`;
    $('#tx-flow', sh).innerHTML = side(a) + `<span class="arrow">${icon('arrow-right')}</span>` + side(b);
    $('#tx-bal', sh).textContent = fk === 'wallet' && find('wallet', fFrom.value)
      ? `${a.name} balance: ${fmt(bal[fFrom.value] || 0)}` : '';
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
    const amount = Math.round(parseAmount(fAmt.value) * 100) / 100;
    if (!(amount > 0)) {
      fAmt.parentElement.classList.remove('shake');
      void fAmt.offsetWidth;
      fAmt.parentElement.classList.add('shake');
      fAmt.focus();
      return;
    }
    if (t.type === 'transfer' && fFrom.value === fTo.value) return toast('Pick two different wallets');
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
    save();
    render();
    if (o.back) o.back(); else closeSheet();
    toast(ex ? 'Updated' : `${fmt(amount)} saved`);
  };
  if (ex) $('#tx-del', sh).onclick = () => {
    if (!confirm('Delete this transaction?')) return;
    S.tx = S.tx.filter(x => x.id !== ex.id);
    save();
    closeSheet();
    render();
    toast('Deleted');
  };

  if (!ex && !t.amount) fAmt.focus({ preventScroll: true });
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
    if (related.length) recent = `<div class="label">Recent</div><div class="list">${related.map(txRow).join('')}</div>`;
    if (kind === 'wallet') extraInfo = `Balance: ${fmt(balances()[id] || 0)}`;
    else {
      const s = sums(periodTx());
      extraInfo = `${periodLabel()}: ${fmt((kind === 'income' ? s.inc : s.exp)[id] || 0)}`;
    }
  }

  const sh = openSheet(`
    ${sheetHead((ex ? 'Edit ' : 'New ') + KIND_NAME[kind])}
    <div class="preview" id="pv"></div>
    <div class="field"><span>Name</span><input id="i-name" maxlength="30" placeholder="${{ income: 'Salary', wallet: 'Kaspi Gold', category: 'Groceries' }[kind]}" value="${esc(it.name)}" autocomplete="off" enterkeyhint="done"></div>
    ${kind === 'wallet' ? `<div class="field"><span>Starting balance</span><input id="i-initial" inputmode="decimal" placeholder="0" value="${it.initial || ''}" enterkeyhint="done"></div>` : ''}
    ${kind === 'category' ? `<div class="field"><span>Monthly budget</span><input id="i-budget" inputmode="decimal" placeholder="None" value="${it.budget || ''}" enterkeyhint="done"></div>` : ''}
    <div class="label">Color</div>
    <div class="swatches" id="i-colors">${COLORS.map(c => `<button type="button" class="sw" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
    <div class="label">Icon</div>
    <div class="icon-grid" id="i-icons">${PICKER_ICONS.map(n => `<button type="button" data-icon="${n}" aria-label="${n}">${icon(n)}</button>`).join('')}</div>
    ${ex && n > 1 ? `<div class="label">Position</div><div class="order"><button class="btn" data-move="-1">${icon('chevron-left')} Earlier</button><button class="btn" data-move="1">Later ${icon('chevron-right')}</button></div>` : ''}
    ${recent}
    <div class="actions">
      ${ex ? `<button class="btn danger" id="i-del" aria-label="Delete">${icon('trash-2')}</button>` : ''}
      <button class="btn primary" id="i-save">${ex ? 'Save' : 'Create'}</button>
    </div>`);

  const fName = $('#i-name', sh);
  const paint = () => {
    $('#pv', sh).innerHTML = `<span class="coin" style="--c:${it.color}">${icon(it.icon)}</span>
      <span class="pname">${esc(fName.value.trim() || 'Name')}</span>${extraInfo ? `<span class="pbal">${esc(extraInfo)}</span>` : ''}`;
    $$('.sw', sh).forEach(b => b.classList.toggle('on', b.dataset.color === it.color));
    $$('#i-icons button', sh).forEach(b => b.classList.toggle('on', b.dataset.icon === it.icon));
    $('#i-icons', sh).style.setProperty('--sel', it.color);
  };
  paint();
  $('#i-icons button.on', sh)?.scrollIntoView({ block: 'nearest' });
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
      toast('Moved');
    }
  });

  $('#i-save', sh).onclick = () => {
    const name = fName.value.trim();
    if (!name) { fName.focus(); fName.closest('.field').classList.add('shake'); setTimeout(() => fName.closest('.field').classList.remove('shake'), 400); return; }
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
    const msg = `Delete “${ex.name}”?` + (cnt ? `\n\n${cnt} transaction${cnt > 1 ? 's' : ''} linked to it will also be deleted.` : '');
    if (!confirm(msg)) return;
    S[LISTS[kind]] = list(kind).filter(x => x.id !== id);
    S.tx = S.tx.filter(t => t.from !== id && t.to !== id);
    save();
    closeSheet();
    render();
    toast('Deleted');
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
  } else {
    main = { icon: 'repeat', color: '#64748b' }; title = 'Transfer';
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
  if (d === ymd(t)) return 'Today';
  t.setDate(t.getDate() - 1);
  if (d === ymd(t)) return 'Yesterday';
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  const wd = dt.toLocaleDateString('en-US', { weekday: 'short' });
  return `${wd}, ${MON[m - 1]} ${day}${y !== now.getFullYear() ? ' ' + y : ''}`;
}

function renderHistory() {
  view.innerHTML = `
    <div class="toolbar">
      <label class="search">${icon('search')}<input id="h-q" type="search" placeholder="Search" value="${esc(UI.q)}" autocomplete="off" enterkeyhint="search"></label>
      <div class="seg">${[['all', 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']]
        .map(([k, l]) => `<button data-act="hf" data-f="${k}" class="${UI.hf === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div id="h-list"></div>`;
  $('#h-q').addEventListener('input', e => { UI.q = e.target.value; renderHistoryList(); });
  renderHistoryList();
}

function renderHistoryList() {
  const q = UI.q.trim().toLowerCase();
  const names = t => { const [fk, tk] = TX_KINDS[t.type]; return `${findOr(fk, t.from).name} ${findOr(tk, t.to).name} ${t.sub} ${t.note} ${t.amount}`.toLowerCase(); };
  const txs = sortTx(periodTx().filter(t => (UI.hf === 'all' || t.type === UI.hf) && (!q || names(t).includes(q))));
  const box = $('#h-list');
  if (!txs.length) {
    box.innerHTML = `<div class="empty">No transactions for ${esc(periodLabel())}${q ? ' matching your search' : ''}.<br><br>On Home, long-press an income or wallet and drag it onto a wallet or category — or tap one, then tap the other.</div>`;
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
    if (t.type === 'transfer') continue;
    const k = t.date.slice(0, 7);
    by[k] = by[k] || { i: 0, e: 0 };
    by[k][t.type === 'income' ? 'i' : 'e'] += t.amount;
  }
  const data = months.map(([y, m]) => ({ y, m, ...(by[`${y}-${pad(m + 1)}`] || { i: 0, e: 0 }) }));
  const W = 340, H = 170, L = 38, B = 20, T = 6;
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
    const tip = `${MONTHS[d.m]} ${d.y}\nIncome   ${fmt(d.i)}\nExpenses ${fmt(d.e)}\nNet      ${fmt(d.i - d.e)}`;
    s += `<rect class="hit" x="${L + gw * i}" y="${T}" width="${gw}" height="${ph}" rx="6" data-tip="${esc(tip)}"/>`;
    s += `<path d="${barPath(cx - bw - 1, yOf(d.i), bw, ph + T - yOf(d.i))}" fill="var(--inc)" pointer-events="none"/>`;
    s += `<path d="${barPath(cx + 1, yOf(d.e), bw, ph + T - yOf(d.e))}" fill="var(--exp)" pointer-events="none"/>`;
    s += `<text x="${cx}" y="${H - 5}" text-anchor="middle">${MON[d.m]}</text>`;
  });
  return `<div class="card"><h4>Income vs expenses</h4><div class="csub">By month · tap a month for details</div>
    <div class="legend"><span style="--c:var(--inc)"><i></i>Income</span><span style="--c:var(--exp)"><i></i>Expenses</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and expenses by month">${s}</svg></div>`;
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
  const W = 340, H = 150, L = 38, B = 20, T = 6;
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
    s += `<rect class="hit" x="${x}" y="${T}" width="${gw}" height="${ph}" data-tip="${esc(`${MON[P.m]} ${i + 1}\n${fmt(v)}`)}"/>`;
    s += `<path d="${barPath(x + (gw - bw) / 2, yOf(v), bw, ph + T - yOf(v), 2)}" fill="var(--exp)" pointer-events="none"/>`;
    if ([1, 8, 15, 22].includes(i + 1) || i + 1 === dim) s += `<text x="${x + gw / 2}" y="${H - 5}" text-anchor="middle">${i + 1}</text>`;
  });
  const ay = yOf(avg);
  s += `<line x1="${L}" x2="${W}" y1="${ay}" y2="${ay}" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="4 3" pointer-events="none"/>`;
  return `<div class="card"><h4>Daily spending</h4><div class="csub">Average ${fmt0(avg)} per day (dashed line)</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending per day">${s}</svg></div>`;
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
  return `<svg viewBox="0 0 180 180" width="200" height="200" role="img" aria-label="Spending by category">
    ${s}
    <text x="90" y="86" text-anchor="middle" font-size="20" font-weight="700" fill="var(--text)">${compact(total)} ₸</text>
    <text x="90" y="106" text-anchor="middle" font-size="12" fill="var(--text-2)">spent</text>
  </svg>`;
}

function renderAnalytics() {
  const txs = periodTx();
  const s = sums(txs);
  const P = UI.period;
  const net = s.totalInc - s.totalExp;
  const exps = txs.filter(t => t.type === 'expense');

  let days = 0;
  if (P.mode === 'month') {
    const isCur = P.y === now.getFullYear() && P.m === now.getMonth();
    days = isCur ? now.getDate() : new Date(P.y, P.m + 1, 0).getDate();
  } else if (P.mode === 'year') {
    const start = new Date(P.y, 0, 1), end = P.y === now.getFullYear() ? now : new Date(P.y, 11, 31);
    days = Math.max(1, Math.round((end - start) / 864e5) + 1);
  } else if (exps.length) {
    const first = exps.reduce((a, t) => (t.date < a ? t.date : a), exps[0].date).split('-').map(Number);
    days = Math.max(1, Math.round((now - new Date(first[0], first[1] - 1, first[2])) / 864e5) + 1);
  }

  const cats = S.categories.map(c => ({ ...c, v: s.exp[c.id] || 0 })).filter(c => c.v > 0);
  // spending in deleted categories still counts
  const orphan = Object.entries(s.exp).filter(([id]) => !find('category', id)).reduce((a, [, v]) => a + v, 0);
  if (orphan) cats.push({ id: '_del', ...DELETED, v: orphan });
  cats.sort((a, b) => b.v - a.v);

  let catBlock;
  if (!cats.length) {
    catBlock = `<div class="card"><h4>By category</h4><div class="empty">No expenses in ${esc(periodLabel())} yet.</div></div>`;
  } else {
    const max = cats[0].v;
    catBlock = `<div class="card"><h4>By category</h4><div class="csub">Tap a category to see what the money went on</div>
      <div class="donut-wrap">${donut(cats, s.totalExp)}</div>
      ${cats.map(c => {
        const open = UI.openCat === c.id;
        let subs = '';
        if (open) {
          const by = {};
          exps.filter(t => (c.id === '_del' ? !find('category', t.to) : t.to === c.id))
            .forEach(t => { const k = t.sub || 'Other'; by[k] = (by[k] || 0) + t.amount; });
          const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
          const sm = rows[0][1];
          subs = `<div class="subs" style="--c:${c.color}">${rows.map(([n, v]) =>
            `<div class="subrow"><span>${esc(n)}</span><b>${fmt(v)}</b></div><div class="bar"><i style="width:${(v / sm) * 100}%"></i></div>`).join('')}</div>`;
        }
        return `<button class="catrow" data-act="cat" data-id="${c.id}" style="--c:${c.color}">
          <span class="coin">${icon(c.icon)}</span>
          <span class="meta"><span class="top"><span>${esc(c.name)}<span class="pct">${Math.round((c.v / s.totalExp) * 100)}%</span></span><b>${fmt(c.v)}</b></span>
          <div class="bar"><i style="width:${(c.v / max) * 100}%"></i></div></span>
        </button>${subs}`;
      }).join('')}</div>`;
  }

  const top = [...exps].sort((a, b) => b.amount - a.amount).slice(0, 10);

  view.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Income</span><b style="color:var(--pos)">${fmt(s.totalInc)}</b></div>
      <div class="kpi"><span>Expenses</span><b>${fmt(s.totalExp)}</b></div>
      <div class="kpi"><span>Saved</span><b style="color:${net < 0 ? 'var(--neg)' : 'var(--text)'}">${fmt(net)}</b></div>
      <div class="kpi"><span>Avg per day</span><b>${fmt0(days ? s.totalExp / days : 0)}</b></div>
    </div>
    ${catBlock}
    ${P.mode === 'month' ? dailyChart(txs) : ''}
    ${trendChart()}
    ${top.length ? `<div class="card"><h4>Largest expenses</h4><div class="csub">${esc(periodLabel())}</div></div><div class="list" style="margin-top:-8px;border-radius:0 0 20px 20px">${top.map(txRow).join('')}</div>` : ''}`;
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
    <div class="group-title">Budget</div>
    <div class="set-list">
      <button class="set-row" data-act="plan">${icon('calendar')}Spending plan<small>${S.plan.on ? 'Paydays ' + S.plan.paydays.join(', ') : 'Off'}</small></button>
    </div>
    <div class="set-note">Shows how much you can spend today so money lasts until the next payday.</div>

    <div class="group-title">Backup</div>
    <div class="set-list">
      <button class="set-row" data-act="export">${icon('download')}Export backup<small>${S.tx.length} records</small></button>
      <button class="set-row" data-act="import">${icon('upload')}Import backup</button>
    </div>
    <div class="set-note ${stale ? 'warn' : ''}">
      ${last ? `Last backup: ${dayLabel(last.slice(0, 10))}.` : 'No backup yet.'}
      Your data lives only on this iPhone. If you remove the app from the Home Screen or clear Safari data, it is gone — export a backup now and then (save it to Files or iCloud Drive).
    </div>

    <div class="group-title">How to use</div>
    <div class="help">
      <p><b>Add money:</b> long-press an income (e.g. Salary) and drag it onto a wallet, then enter the amount.</p>
      <p><b>Spend:</b> drag a wallet onto an expense category. Type what you spent on — your past answers show up as quick chips.</p>
      <p><b>Transfer:</b> drag one wallet onto another.</p>
      <p><b>No drag?</b> Tap the source, then tap the target.</p>
      <p><b>Edit:</b> tap a category, or tap an income/wallet twice. Fix or delete any record in History.</p>
      <p><b>Amounts</b> can be sums: <code>1500+320</code>.</p>
    </div>

    <div class="group-title">Danger zone</div>
    <div class="set-list">
      <button class="set-row danger" data-act="reset">${icon('trash-2')}Erase all data</button>
    </div>
    <div class="set-note">Money Tracker · v1.0 · works offline</div>`;
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
      d.plan = d.plan || defaultPlan();
      d.plan.bills = d.plan.bills || [];
      if (!confirm(`Replace all current data with this backup?\n\n${d.tx.length} transactions, ${d.wallets.length} wallets, ${d.categories.length} categories.`)) return;
      S = d;
      save();
      render();
      toast('Backup restored');
    } catch (err) { toast('That file is not a valid backup'); }
  };
  r.readAsText(f);
});

/* =========================================================
   Global events
   ========================================================= */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 1800);
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
  cat: el => { UI.openCat = UI.openCat === el.dataset.id ? null : el.dataset.id; render(); },
  export: exportData,
  import: () => $('#import-file').click(),
  reset: () => {
    if (!confirm('Erase ALL data? This cannot be undone.\n\nTip: export a backup first.')) return;
    if (!confirm('Are you absolutely sure?')) return;
    S = seed();
    S.plan = defaultPlan();
    save();
    render();
    toast('All data erased');
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
  if (sheetRoot.contains(e.target)) return;

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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
