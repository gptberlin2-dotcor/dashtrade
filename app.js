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
  screenshotFile: document.getElementById('screenshot-file'),
  screenshotPreview: document.getElementById('screenshot-preview'),
  screenshotDropzone: document.getElementById('screenshot-dropzone'),
  uploadFileChip: document.getElementById('upload-file-chip'),
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

function parseRr(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  if (raw.includes(':')) {
    const [left, right] = raw.split(':').map((part) => safeNumber(part));
    if (left > 0 && right >= 0) return right / left;
    return 0;
  }

  return safeNumber(raw);
}

function formatRr(value) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return '';
  if (raw.includes(':')) return raw;

  const rr = parseRr(raw);
  if (!rr) return '';
  return `1:${rr.toFixed(2).replace(/\.00$/, '')}`;
}

function normalizeLeverage(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const numericPart = raw.toLowerCase().startsWith('x') ? raw.slice(1) : raw;
  const parsed = safeNumber(numericPart);
  if (!parsed) return '';
  return `x${parsed}`;
}


function setScreenshotPreview(value) {
  if (!els.screenshotPreview) return;
  const src = String(value || '').trim();
  if (!src) {
    els.screenshotPreview.hidden = true;
    els.screenshotPreview.removeAttribute('src');
    return;
  }
  els.screenshotPreview.src = src;
  els.screenshotPreview.hidden = false;
}


function setUploadFileChip(name) {
  if (!els.uploadFileChip) return;
  const label = String(name || '').trim();
  if (!label) {
    els.uploadFileChip.hidden = true;
    els.uploadFileChip.textContent = '-';
    return;
  }
  els.uploadFileChip.hidden = false;
  els.uploadFileChip.textContent = label;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}


function normalizeScreenshotSrc(src) {
  const value = String(src || '').trim();
  if (!value) return '';

  // Normalize malformed image data URLs that miss ";base64,"
  if (value.startsWith('data:image/') && !value.includes(';base64,')) {
    const [prefix, payload] = value.split(',', 2);
    if (payload) return `${prefix};base64,${payload}`;
  }

  return value;
}

function openScreenshotViewer(src) {
  const normalized = normalizeScreenshotSrc(src);
  if (!normalized) return;

  if (!normalized.startsWith('data:image/')) {
    window.open(normalized, '_blank', 'noopener');
    return;
  }

  const win = window.open('', '_blank', 'noopener');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Screenshot Viewer</title><style>body{margin:0;background:#0b0b0b;display:grid;place-items:center;min-height:100vh}img{max-width:100vw;max-height:100vh;object-fit:contain}</style></head><body><img src="${normalized}" alt="trade screenshot"/></body></html>`);
  win.document.close();
}

function deriveRr(entry, sl, tp, action) {
  if (!entry || !sl || !tp) return 0;

  const isLong = action === 'Long' || action === 'Buy';
  const isShort = action === 'Short' || action === 'Sell';

  let risk = 0;
  let reward = 0;

  if (isLong) {
    risk = entry - sl;
    reward = tp - entry;
  } else if (isShort) {
    risk = sl - entry;
    reward = entry - tp;
  } else {
    // Fallback when action has not been selected yet:
    // compute based on absolute distance so RR can still auto-fill.
    risk = Math.abs(entry - sl);
    reward = Math.abs(tp - entry);
  }

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
  const rrValues = state.trades.map((t) => parseRr(t.rr)).filter((rr) => rr > 0);
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
        <td>${trade.pnl == null || trade.pnl === '' ? '-' : formatCurrency(safeNumber(trade.pnl))}</td>
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
      <td class="action-cell ${trade.action === 'Long' || trade.action === 'Buy' ? 'action-long' : trade.action === 'Short' || trade.action === 'Sell' ? 'action-short' : ''}">${trade.action || ''}</td>
      <td>${trade.tf || ''}</td>
      <td>${trade.setupType || ''}</td>
      <td>${trade.marketContext || ''}</td>
      <td>${trade.entry ?? ''}</td>
      <td>${trade.sl ?? ''}</td>
      <td>${trade.tp ?? ''}</td>
      <td>${formatRr(trade.rr)}</td>
      <td>${trade.leverage ?? ''}</td>
      <td>${trade.result || ''}</td>
      <td><input type="number" step="0.01" class="journal-pnl-input" data-id="${trade.id}" value="${trade.pnl == null || trade.pnl === '' ? '' : String(trade.pnl)}" placeholder="isi saat close" /></td>
      <td>
        <select class="journal-winloss-select" data-id="${trade.id}">
          <option value="ON GOING" ${trade.winLoss === 'ON GOING' || !trade.winLoss ? 'selected' : ''}>ON GOING</option>
          <option value="WIN" ${trade.winLoss === 'WIN' ? 'selected' : ''}>WIN</option>
          <option value="LOSE" ${trade.winLoss === 'LOSE' ? 'selected' : ''}>LOSE</option>
        </select>
      </td>
      <td><button type="button" data-action="update-close" data-id="${trade.id}">Save</button></td>
      <td>${trade.screenshot ? '<button type="button" data-action="view-screenshot" data-id="' + trade.id + '">view</button>' : '-'}</td>
      <td title="${escapeHtml(trade.notes || '')}">${escapeHtml(shortNotes)}</td>
      <td><button type="button" data-action="detail" data-id="${trade.id}">(detail)</button></td>
      <td><button type="button" data-action="edit" data-id="${trade.id}">Edit</button></td>
      <td><button type="button" data-action="delete" data-id="${trade.id}" class="danger">Delete</button></td>
    </tr>`;
    });

  els.journalBody.innerHTML = rows.length
    ? rows.join('')
    : '<tr><td colspan="21" class="muted">No trades saved yet.</td></tr>';
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
  const rrInput = String(formData.get('rr') || '').trim();
  const parsedRr = parseRr(rrInput);
  const autoRr = deriveRr(entry, sl, tp, action);
  const rrValue = parsedRr || autoRr;
  const rr = rrInput || (rrValue > 0 ? `1:${rrValue.toFixed(2).replace(/\.00$/, '')}` : '');

  const pnl = existing?.pnl ?? null;

  const resultInput = String(formData.get('result') || '').trim();
  const result = resultInput || existing?.result || 'ON GOING';

  const winLoss = existing?.winLoss || 'ON GOING';

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
    leverage: normalizeLeverage(formData.get('leverage')),
    result,
    pnl,
    winLoss,
    screenshot: normalizeScreenshotSrc(formData.get('screenshot')?.trim()),
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


function prepareStartTradeForNewEntry() {
  if (state.editId) return;
  if (els.form.elements.no) els.form.elements.no.value = nextNo();
  if (els.form.elements.result && !els.form.elements.result.value) els.form.elements.result.value = 'ON GOING';
  if (els.form.elements.rr) els.form.elements.rr.dataset.manual = 'false';
  autoFillRrFromSetup({ force: true });
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
  if (id === 'start-trade') prepareStartTradeForNewEntry();
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

  setScreenshotPreview(trade.screenshot);
  if (trade.screenshot && trade.screenshot.startsWith('data:image')) setUploadFileChip('uploaded-image');
  else setUploadFileChip('');

  state.editId = trade.id;
  if (els.form.elements.rr) els.form.elements.rr.dataset.manual = 'true';
  autoFillRrFromSetup({ force: true });
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
        ['Market Context', trade.marketContext], ['Entry', trade.entry], ['SL', trade.sl], ['TP', trade.tp],
        ['Result', trade.result], ['P/L', trade.pnl == null || trade.pnl === '' ? '-' : formatCurrency(safeNumber(trade.pnl))], ['Win/Loss', trade.winLoss], ['Leverage', trade.leverage || '-'], ['RR', formatRr(trade.rr) || '-'], ['Screenshot', trade.screenshot ? 'Available (use journal view)' : '-'], ['Notes', escapeHtml(trade.notes || '-')],
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

function autoFillRrFromSetup(options = {}) {
  const rrField = els.form.elements.rr;
  const action = String(els.form.elements.action?.value || '').trim();
  const entry = safeNumber(els.form.elements.entry?.value);
  const sl = safeNumber(els.form.elements.sl?.value);
  const tp = safeNumber(els.form.elements.tp?.value);

  if (!rrField) return;
  const isManual = rrField.dataset.manual === 'true';
  if (isManual && !options.force) return;

  const rr = deriveRr(entry, sl, tp, action);
  rrField.value = rr > 0 ? `1:${rr.toFixed(2).replace(/\.00$/, '')}` : '';
}

els.navButtons.forEach((btn) => btn.addEventListener('click', () => {
  if (btn.dataset.section === 'start-trade') state.editId = null;
  switchSection(btn.dataset.section);
}));

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
  if (els.screenshotFile) els.screenshotFile.value = '';
  setScreenshotPreview('');
  setUploadFileChip('');
  if (els.form.elements.rr) els.form.elements.rr.dataset.manual = 'false';
  renderAll();
  updateChecklistPreview();
  switchSection('trade-journal');
});

els.form.addEventListener('reset', () => {
  state.editId = null;
  setTimeout(() => {
    els.form.elements.no.value = nextNo();
    if (els.screenshotFile) els.screenshotFile.value = '';
    setScreenshotPreview('');
    setUploadFileChip('');
    if (els.form.elements.result) els.form.elements.result.value = 'ON GOING';
    if (els.form.elements.rr) els.form.elements.rr.dataset.manual = 'false';
    autoFillRrFromSetup({ force: true });
    updateChecklistPreview();
  }, 0);
});

els.form.addEventListener('change', (event) => {
  updateChecklistPreview();
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (['entry', 'sl', 'tp', 'action'].includes(target.getAttribute('name') || '')) autoFillRrFromSetup({ force: true });
});

els.form.addEventListener('input', (event) => {
  updateChecklistPreview();
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const name = target.getAttribute('name') || '';
  if (name === 'rr') {
    const rrField = els.form.elements.rr;
    if (rrField) rrField.dataset.manual = rrField.value.trim() ? 'true' : 'false';
    if (!rrField.value.trim()) autoFillRrFromSetup();
    return;
  }

  if (['entry', 'sl', 'tp', 'action'].includes(name)) autoFillRrFromSetup({ force: true });
});

els.form.elements.screenshot?.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const normalized = normalizeScreenshotSrc(target.value);
  if (normalized !== target.value) target.value = normalized;
  setScreenshotPreview(normalized);
  if (!normalized.trim()) setUploadFileChip('');
});

async function handleScreenshotFile(file) {
  if (!file) return;
  try {
    const dataUrl = normalizeScreenshotSrc(await fileToDataUrl(file));
    if (els.form.elements.screenshot) els.form.elements.screenshot.value = dataUrl;
    setScreenshotPreview(dataUrl);
    setUploadFileChip(file.name || 'uploaded-image');
  } catch (err) {
    console.error(err);
  }
}

els.screenshotFile?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const file = target.files?.[0];
  await handleScreenshotFile(file);
});

['dragenter', 'dragover'].forEach((eventName) => {
  els.screenshotDropzone?.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.screenshotDropzone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  els.screenshotDropzone?.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.screenshotDropzone.classList.remove('drag-over');
  });
});

els.screenshotDropzone?.addEventListener('drop', async (event) => {
  if (!(event instanceof DragEvent)) return;
  const file = event.dataTransfer?.files?.[0];
  await handleScreenshotFile(file);
});

els.journalBody.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.dataset.id;
  const action = target.dataset.action;
  if (!id || !action) return;
  const trade = state.trades.find((t) => t.id === id);
  if (!trade) return;


  if (action === 'view-screenshot') {
    openScreenshotViewer(trade.screenshot);
    return;
  }

  if (action === 'update-close') {
    const row = target.closest('tr');
    if (!row) return;
    const pnlInputEl = row.querySelector('.journal-pnl-input');
    const winLossEl = row.querySelector('.journal-winloss-select');
    const pnlRaw = pnlInputEl ? pnlInputEl.value.trim() : '';
    const hasPnl = pnlRaw !== '';
    const nextPnl = hasPnl ? safeNumber(pnlRaw) : null;
    const selectedWinLoss = winLossEl ? winLossEl.value : 'ON GOING';
    const derivedWinLoss = hasPnl ? statusFromPnl(nextPnl) : 'ON GOING';
    const nextWinLoss = selectedWinLoss === 'ON GOING' ? derivedWinLoss : selectedWinLoss;

    state.trades = state.trades.map((t) => {
      if (t.id !== id) return t;
      return {
        ...t,
        pnl: nextPnl,
        winLoss: nextWinLoss,
        result: hasPnl && (!t.result || t.result === 'ON GOING') ? 'CLOSED' : (t.result || 'ON GOING'),
        updatedAt: new Date().toISOString(),
      };
    });
    saveTrades();
    renderAll();
    return;
  }

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
if (els.form.elements.result && !els.form.elements.result.value) els.form.elements.result.value = 'ON GOING';
if (els.form.elements.rr) els.form.elements.rr.dataset.manual = 'false';
autoFillRrFromSetup({ force: true });
setScreenshotPreview(els.form.elements.screenshot?.value || '');
setUploadFileChip('');
updateChecklistPreview();
runCalculator();
