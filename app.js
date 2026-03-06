const STORAGE_KEY = 'dashtrade.trades.v1';

const state = {
  trades: loadTrades(),
  editId: null,
};

const els = {
  navButtons: [...document.querySelectorAll('.nav-btn')],
  sections: [...document.querySelectorAll('.section')],
  metricsGrid: document.getElementById('metrics-grid'),
  historyBody: document.getElementById('history-table-body'),
  form: document.getElementById('trade-form'),
  checklistPreview: document.getElementById('checklist-preview'),
  journalBody: document.getElementById('journal-table-body'),
  detailModal: document.getElementById('detail-modal'),
  detailContent: document.getElementById('detail-content'),
  closeDetail: document.getElementById('close-detail'),
  currency: document.getElementById('currency'),
  calcBalance: document.getElementById('calc-balance'),
  calcLeverage: document.getElementById('calc-leverage'),
  calcSl: document.getElementById('calc-sl'),
  calcTp: document.getElementById('calc-tp'),
  calcBwl: document.getElementById('calc-bwl'),
  calcLoss: document.getElementById('calc-loss'),
  calcProfit: document.getElementById('calc-profit'),
  calcReset: document.getElementById('calc-reset'),
};

function loadTrades() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTrades() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trades));
}

function nextNo() {
  return state.trades.length ? Math.max(...state.trades.map((t) => Number(t.no) || 0)) + 1 : 1;
}

function statusFromPnl(pnl) {
  if (pnl > 0) return 'WIN';
  if (pnl < 0) return 'LOSE';
  return 'ON GOING';
}

function checklistMeta(checklist) {
  const keys = ['rsi', 'macd', 'structure', 'supportResistance', 'liquidity', 'volume'];
  const score = keys.reduce((sum, key) => sum + (checklist[key] ? 1 : 0), 0);
  let rating = 'Invalid';
  if (score >= 5) rating = 'Strong setup';
  else if (score === 4) rating = 'Valid setup';
  else if (score === 3) rating = 'Partial';
  return { score, rating };
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function deriveRr(entry, sl, tp, action) {
  if (!entry || !sl || !tp || !action) return 0;
  const risk = action === 'Buy' ? entry - sl : sl - entry;
  const reward = action === 'Buy' ? tp - entry : entry - tp;
  if (risk <= 0) return 0;
  return reward / risk;
}

function renderMetrics() {
  const total = state.trades.length;
  const wins = state.trades.filter((t) => safeNumber(t.pnl) > 0).length;
  const losses = state.trades.filter((t) => safeNumber(t.pnl) < 0).length;
  const winrate = total ? (wins / total) * 100 : 0;
  const grossProfit = state.trades.reduce((s, t) => s + Math.max(0, safeNumber(t.pnl)), 0);
  const grossLossAbs = Math.abs(state.trades.reduce((s, t) => s + Math.min(0, safeNumber(t.pnl)), 0));
  const profitFactor = grossLossAbs ? grossProfit / grossLossAbs : null;
  const rrValues = state.trades.map((t) => safeNumber(t.rr)).filter((rr) => rr > 0);
  const avgRr = rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0;

  const items = [
    ['Number of Trade', total],
    ['Win', wins],
    ['Lose', losses],
    ['Winrate', `${winrate.toFixed(2)}%`],
    ['Profit Factor', profitFactor === null ? 'No loss yet' : profitFactor.toFixed(2)],
    ['AVG RR', avgRr.toFixed(2)],
  ];

  els.metricsGrid.innerHTML = items
    .map(([label, value]) => `<article class="metric"><h4>${label}</h4><p>${value}</p></article>`)
    .join('');
}

function renderHistory() {
  const rows = [...state.trades]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map((trade) => {
      const status = statusFromPnl(safeNumber(trade.pnl));
      const statusClass = status === 'WIN' ? 'win' : status === 'LOSE' ? 'lose' : 'ongoing';
      return `<tr>
        <td>${trade.no}</td>
        <td>${trade.date || '-'}</td>
        <td>${trade.pair || '-'}</td>
        <td>${formatCurrency(safeNumber(trade.pnl))}</td>
        <td><span class="status ${statusClass}">${status}</span></td>
      </tr>`;
    });

  els.historyBody.innerHTML = rows.length
    ? rows.join('')
    : '<tr><td colspan="5" class="muted">No trade history yet.</td></tr>';
}

function renderJournal() {
  const rows = [...state.trades]
    .sort((a, b) => Number(a.no) - Number(b.no))
    .map((trade) => {
      const shortNotes = trade.notes?.length > 40 ? `${trade.notes.slice(0, 40)}...` : trade.notes || '';
      return `<tr>
      <td>${trade.no}</td>
      <td>${trade.date || ''}</td>
      <td>${trade.pair || ''}</td>
      <td>${trade.action || ''}</td>
      <td>${trade.tf || ''}</td>
      <td>${trade.setupType || ''}</td>
      <td>${trade.marketContext || ''}</td>
      <td>${trade.entry ?? ''}</td>
      <td>${trade.sl ?? ''}</td>
      <td>${trade.tp ?? ''}</td>
      <td>${safeNumber(trade.rr).toFixed(2)}</td>
      <td>${trade.leverage ?? ''}</td>
      <td>${trade.result || ''}</td>
      <td>${formatCurrency(safeNumber(trade.pnl))}</td>
      <td>${trade.winLoss || statusFromPnl(safeNumber(trade.pnl))}</td>
      <td>${trade.screenshot ? '<a href="' + trade.screenshot + '" target="_blank" rel="noopener">view</a>' : '-'}</td>
      <td title="${escapeHtml(trade.notes || '')}">${escapeHtml(shortNotes)}</td>
      <td><button type="button" data-action="detail" data-id="${trade.id}">(detail)</button></td>
      <td><button type="button" data-action="edit" data-id="${trade.id}">Edit</button></td>
      <td><button type="button" data-action="delete" data-id="${trade.id}" class="danger">Delete</button></td>
    </tr>`;
    });

  els.journalBody.innerHTML = rows.length
    ? rows.join('')
    : '<tr><td colspan="20" class="muted">No trades saved yet.</td></tr>';
}

function renderAll() {
  renderMetrics();
  renderHistory();
  renderJournal();
  els.form.elements.no.value = nextNo();
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toTrade(formData) {
  const checklist = {
    rsi: formData.get('checklist_rsi') === 'on',
    macd: formData.get('checklist_macd') === 'on',
    structure: formData.get('checklist_structure') === 'on',
    supportResistance: formData.get('checklist_supportResistance') === 'on',
    liquidity: formData.get('checklist_liquidity') === 'on',
    volume: formData.get('checklist_volume') === 'on',
  };

  const { score, rating } = checklistMeta(checklist);
  const now = new Date().toISOString();
  const existing = state.editId ? state.trades.find((t) => t.id === state.editId) : null;

  const entry = safeNumber(formData.get('entry'));
  const sl = safeNumber(formData.get('sl'));
  const tp = safeNumber(formData.get('tp'));
  const action = formData.get('action');
  const inputRr = safeNumber(formData.get('rr'));

  const rr = inputRr || deriveRr(entry, sl, tp, action);
  const pnl = safeNumber(formData.get('pnl'));

  return {
    id: existing?.id || crypto.randomUUID(),
    no: safeNumber(formData.get('no')) || nextNo(),
    date: formData.get('date'),
    pair: formData.get('pair')?.trim(),
    action,
    tf: formData.get('tf')?.trim(),
    setupType: formData.get('setupType')?.trim(),
    marketContext: formData.get('marketContext')?.trim(),
    entry,
    sl,
    tp,
    rr,
    leverage: safeNumber(formData.get('leverage')),
    result: formData.get('result')?.trim(),
    pnl,
    winLoss: formData.get('winLoss') || statusFromPnl(pnl),
    screenshot: formData.get('screenshot')?.trim(),
    notes: formData.get('notes')?.trim(),
    psychology: {
      emotion: formData.get('emotion'),
      confidence: safeNumber(formData.get('confidence')),
      discipline: formData.get('discipline'),
    },
    checklist: { ...checklist, score, rating },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function updateChecklistPreview() {
  const data = new FormData(els.form);
  const checklist = {
    rsi: data.get('checklist_rsi') === 'on',
    macd: data.get('checklist_macd') === 'on',
    structure: data.get('checklist_structure') === 'on',
    supportResistance: data.get('checklist_supportResistance') === 'on',
    liquidity: data.get('checklist_liquidity') === 'on',
    volume: data.get('checklist_volume') === 'on',
  };
  const { score, rating } = checklistMeta(checklist);
  els.checklistPreview.textContent = `Checklist Score: ${score}/6 (${rating})`;
}

function switchSection(id) {
  els.sections.forEach((sec) => sec.classList.toggle('active', sec.id === id));
  els.navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.section === id));
}

function fillForm(trade) {
  Object.entries({
    no: trade.no,
    date: trade.date,
    pair: trade.pair,
    action: trade.action,
    tf: trade.tf,
    setupType: trade.setupType,
    marketContext: trade.marketContext,
    entry: trade.entry,
    sl: trade.sl,
    tp: trade.tp,
    rr: trade.rr,
    leverage: trade.leverage,
    result: trade.result,
    pnl: trade.pnl,
    winLoss: trade.winLoss,
    screenshot: trade.screenshot,
    notes: trade.notes,
    emotion: trade.psychology?.emotion,
    confidence: trade.psychology?.confidence,
    discipline: trade.psychology?.discipline,
  }).forEach(([name, value]) => {
    if (els.form.elements[name]) els.form.elements[name].value = value ?? '';
  });

  const checks = trade.checklist || {};
  ['rsi', 'macd', 'structure', 'supportResistance', 'liquidity', 'volume'].forEach((key) => {
    const field = els.form.elements[`checklist_${key}`];
    if (field) field.checked = !!checks[key];
  });

  state.editId = trade.id;
  updateChecklistPreview();
  switchSection('start-trade');
}

function showDetail(trade) {
  const c = trade.checklist || {};
  els.detailContent.innerHTML = `
    <h4>Main Trade Summary</h4>
    <div class="table-wrap"><table><tbody>
      ${[
        ['No', trade.no], ['Date', trade.date], ['Pair', trade.pair], ['Action', trade.action], ['TF', trade.tf], ['Setup Type', trade.setupType],
        ['Market Context', trade.marketContext], ['Entry', trade.entry], ['SL', trade.sl], ['TP', trade.tp], ['RR', safeNumber(trade.rr).toFixed(2)], ['Leverage', trade.leverage],
        ['Result', trade.result], ['P/L', formatCurrency(safeNumber(trade.pnl))], ['Win/Loss', trade.winLoss], ['Screenshot', trade.screenshot ? `<a href="${trade.screenshot}" target="_blank" rel="noopener">Open screenshot</a>` : '-'], ['Notes', escapeHtml(trade.notes || '-')],
      ].map(([k, v]) => `<tr><th>${k}</th><td>${v ?? '-'}</td></tr>`).join('')}
    </tbody></table></div>

    <h4>Psychology / Execution Review</h4>
    <ul>
      <li>Emotion: ${trade.psychology?.emotion || '-'}</li>
      <li>Confidence: ${trade.psychology?.confidence ?? '-'}</li>
      <li>Discipline: ${trade.psychology?.discipline || '-'}</li>
    </ul>

    <h4>Setup Validation Checklist</h4>
    <ul>
      <li>RSI: ${c.rsi ? 'Checked' : 'Unchecked'}</li>
      <li>MACD: ${c.macd ? 'Checked' : 'Unchecked'}</li>
      <li>Structure: ${c.structure ? 'Checked' : 'Unchecked'}</li>
      <li>Support/Resistance: ${c.supportResistance ? 'Checked' : 'Unchecked'}</li>
      <li>Liquidity: ${c.liquidity ? 'Checked' : 'Unchecked'}</li>
      <li>Volume: ${c.volume ? 'Checked' : 'Unchecked'}</li>
      <li>Total checklist score: ${c.score ?? 0}/6</li>
      <li>Setup rating: ${c.rating ?? 'Invalid'}</li>
    </ul>
  `;
  els.detailModal.showModal();
}

function formatCurrency(value) {
  const curr = els.currency?.value || 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, maximumFractionDigits: 2 }).format(value);
}

function runCalculator() {
  const balance = safeNumber(els.calcBalance.value);
  const leverage = safeNumber(els.calcLeverage.value);
  const slPct = safeNumber(els.calcSl.value) / 100;
  const tpPct = safeNumber(els.calcTp.value) / 100;

  const bwl = balance * leverage;
  const balanceLoss = bwl * slPct;
  const balanceProfit = bwl * tpPct;

  els.calcBwl.textContent = formatCurrency(bwl);
  els.calcLoss.textContent = formatCurrency(balanceLoss);
  els.calcProfit.textContent = formatCurrency(balanceProfit);
}

els.navButtons.forEach((btn) => btn.addEventListener('click', () => switchSection(btn.dataset.section)));

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const trade = toTrade(new FormData(els.form));
  if (state.editId) {
    state.trades = state.trades.map((t) => (t.id === state.editId ? trade : t));
  } else {
    state.trades.push(trade);
  }
  saveTrades();
  state.editId = null;
  els.form.reset();
  renderAll();
  updateChecklistPreview();
  switchSection('trade-journal');
});

els.form.addEventListener('reset', () => {
  state.editId = null;
  setTimeout(() => {
    els.form.elements.no.value = nextNo();
    updateChecklistPreview();
  }, 0);
});

els.form.addEventListener('change', updateChecklistPreview);
els.form.addEventListener('input', updateChecklistPreview);

els.journalBody.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.dataset.id;
  const action = target.dataset.action;
  if (!id || !action) return;
  const trade = state.trades.find((t) => t.id === id);
  if (!trade) return;

  if (action === 'detail') showDetail(trade);
  if (action === 'edit') fillForm(trade);
  if (action === 'delete') {
    state.trades = state.trades.filter((t) => t.id !== id);
    saveTrades();
    renderAll();
  }
});

els.closeDetail.addEventListener('click', () => els.detailModal.close());
els.detailModal.addEventListener('click', (event) => {
  const rect = els.detailModal.getBoundingClientRect();
  const inside = rect.top <= event.clientY && event.clientY <= rect.bottom && rect.left <= event.clientX && event.clientX <= rect.right;
  if (!inside) els.detailModal.close();
});

[els.currency, els.calcBalance, els.calcLeverage, els.calcSl, els.calcTp].forEach((el) => el.addEventListener('input', runCalculator));
els.calcReset.addEventListener('click', () => {
  els.currency.value = 'USD';
  els.calcBalance.value = 0;
  els.calcLeverage.value = 1;
  els.calcSl.value = 1;
  els.calcTp.value = 2;
  runCalculator();
});

renderAll();
updateChecklistPreview();
runCalculator();
