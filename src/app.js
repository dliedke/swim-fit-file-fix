import { analyze, applyEdits } from './swim.js';
import { isZip, extractFitFromZip } from './zip.js';
import { LANGS, LINKS, detectLang, saveLang, errorText } from './i18n.js';

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z em segundos Unix
const YARD = 0.9144;
const EPS = 0.0005;

const $ = (id) => document.getElementById(id);
const els = {
  drop: $('drop'), file: $('file'), error: $('error'), editor: $('editor'),
  filename: $('filename'), fileinfo: $('fileinfo'), warnings: $('warnings'),
  summary: $('summary'), compensate: $('compensate'), laps: $('laps'), totals: $('totals'),
  paceUnit: $('paceUnit'), reset: $('reset'), exportBtn: $('export'), result: $('result'), another: $('another'),
  upload: $('upload'), uploadGarmin: $('uploadGarmin'), uploadStrava: $('uploadStrava'), helpList: $('helpList'),
};
els.uploadGarmin.href = LINKS.garmin;
els.uploadStrava.href = LINKS.strava;

let lang = detectLang();
let T = LANGS[lang];

/** Aplica os textos estáticos do idioma atual na página. */
function applyLanguage() {
  T = LANGS[lang];
  document.documentElement.lang = T.locale;
  document.title = T.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', T.metaDescription);
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T[el.dataset.i18n];
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = T[el.dataset.i18nHtml];
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', T[el.dataset.i18nAria]);
  els.helpList.innerHTML = T.help.map((h) => `<li>${h}</li>`).join('');
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
}

for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => {
    if (b.dataset.lang === lang) return;
    lang = b.dataset.lang;
    saveLang(lang);
    applyLanguage();
    if (doc) renderAll();
  });
}
applyLanguage();

let doc = null; // { name, bytes, model, state: [{ timer, distance }], rows: [] }

// ---------------------------------------------------------------- formatação

function fmtTime(sec, decimals = 1) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const f = 10 ** decimals;
  let total = Math.round(sec * f) / f;
  const h = Math.floor(total / 3600);
  total -= h * 3600;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const ss = s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function parseTime(text) {
  const t = String(text).trim().replace(',', '.').replace(/[’'′]/g, ':').replace(/["″]/g, '');
  if (!t) return null;
  if (!/^\d+(:\d{1,2}(\.\d*)?)*(\.\d*)?$/.test(t) && !/^\d+(\.\d*)?$/.test(t)) return null;
  const parts = t.split(':');
  if (parts.length > 3) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + parseFloat(p);
  if (parts.length > 1 && parts.slice(1).some((p) => parseFloat(p) >= 60)) return null;
  return Number.isFinite(sec) ? sec : null;
}

const unitName = () => (doc.model.poolUnit === 1 ? 'yd' : 'm');
const toDisp = (m) => (doc.model.poolUnit === 1 ? m / YARD : m);
const fromDisp = (v) => (doc.model.poolUnit === 1 ? v * YARD : v);
const fmtDist = (m) => `${Math.round(toDisp(m)).toLocaleString(T.locale)} ${unitName()}`;
const fmtPace = (timer, dist) => (dist > 0 && timer > 0 ? fmtTime((timer / toDisp(dist)) * 100, 0) : '—');

function fmtDate(fitTs) {
  if (fitTs == null) return '';
  const d = new Date((fitTs + FIT_EPOCH) * 1000);
  return d.toLocaleString(T.locale, { dateStyle: 'full', timeStyle: 'short' });
}

// ---------------------------------------------------------------- arquivo

function showError(msg) {
  els.error.textContent = msg;
  els.error.hidden = !msg;
}

async function openFile(file) {
  showError('');
  hideResult();
  try {
    let bytes = new Uint8Array(await file.arrayBuffer());
    let name = file.name;
    if (isZip(bytes)) ({ name, bytes } = await extractFitFromZip(bytes));
    const model = analyze(bytes);
    doc = {
      name,
      bytes,
      model,
      state: model.laps.map((l) => ({ timer: l.timer, distance: l.distance })),
      rows: [],
    };
    renderAll();
  } catch (err) {
    console.error(err);
    showError(T.readError(errorText(T, err)));
  }
}

els.drop.addEventListener('click', () => els.file.click());
els.drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.file.click(); }
});
els.file.addEventListener('change', () => {
  if (els.file.files[0]) openFile(els.file.files[0]);
  els.file.value = '';
});
els.another.addEventListener('click', () => els.file.click());
for (const ev of ['dragenter', 'dragover']) {
  document.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.add('over'); });
}
for (const ev of ['dragleave', 'drop']) {
  document.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.remove('over'); });
}
document.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) openFile(f);
});

// ---------------------------------------------------------------- render

function lapChanged(i) {
  const o = doc.model.laps[i];
  const s = doc.state[i];
  return Math.abs(o.timer - s.timer) > EPS || Math.abs(o.distance - s.distance) > 0.005;
}

function lengthsFor(i) {
  const pool = doc.model.poolLength;
  return doc.model.isPool && pool ? Math.round(doc.state[i].distance / pool) : null;
}

function renderAll() {
  const m = doc.model;
  els.editor.hidden = false;
  els.drop.classList.add('compact');
  els.filename.textContent = doc.name;
  const pool = m.poolLength ? ` · ${T.pool(Math.round(toDisp(m.poolLength)), unitName())}` : '';
  els.fileinfo.textContent = `${fmtDate(m.startTime)}${pool}`;
  els.paceUnit.textContent = `/100${unitName()}`;

  const warns = [];
  if (!m.crcOk) warns.push(T.warnCrc);
  if (!m.isSwim) warns.push(T.warnNotSwim);
  else if (!m.isPool) warns.push(T.warnOpenWater);
  els.warnings.innerHTML = warns.map((w) => `<div class="alert warn">${w}</div>`).join('');

  els.laps.innerHTML = '';
  doc.rows = m.laps.map((lap, i) => buildRow(lap, i));
  updateAll();
}

function buildRow(lap, i) {
  const tr = document.createElement('tr');
  tr.className = lap.isRest ? 'rest' : '';
  const m = doc.model;
  const pool = m.poolLength;
  const step = m.isPool && pool ? Math.round(toDisp(pool) * 100) / 100 : 1;

  const cells = {};
  const td = (cls = '') => {
    const c = document.createElement('td');
    if (cls) c.className = cls;
    tr.appendChild(c);
    return c;
  };
  td('c-idx').textContent = String(i + 1);
  td('stroke').textContent = lap.isRest ? T.rest : (T.strokes[lap.stroke] ?? '—');

  cells.dist = td('num');
  cells.len = td('num hide-sm');
  if (lap.isRest) {
    cells.dist.textContent = '—';
    cells.len.textContent = '—';
  } else {
    const dist = document.createElement('input');
    dist.type = 'number';
    dist.className = 'dist';
    dist.min = String(step);
    dist.step = String(step);
    dist.inputMode = 'decimal';
    dist.setAttribute('aria-label', T.ariaDistance(i + 1));
    dist.addEventListener('change', () => onDistance(i, dist));
    cells.distInput = dist;
    cells.distOrig = document.createElement('span');
    cells.distOrig.className = 'orig';
    cells.dist.append(dist, unitSpan(), cells.distOrig);

    if (m.isPool && pool) {
      const len = document.createElement('input');
      len.type = 'number';
      len.min = '1';
      len.step = '1';
      len.inputMode = 'numeric';
      len.style.width = '4em';
      len.setAttribute('aria-label', T.ariaLengths(i + 1));
      len.addEventListener('change', () => onLengths(i, len));
      cells.lenInput = len;
      cells.len.append(len);
    } else {
      cells.len.textContent = '—';
    }
  }

  cells.time = td('num');
  const time = document.createElement('input');
  time.type = 'text';
  time.inputMode = 'decimal';
  time.autocomplete = 'off';
  time.setAttribute('aria-label', T.ariaTime(i + 1));
  time.addEventListener('change', () => onTime(i, time));
  time.addEventListener('keydown', (e) => { if (e.key === 'Enter') time.blur(); });
  cells.timeInput = time;
  cells.timeOrig = document.createElement('span');
  cells.timeOrig.className = 'orig';
  cells.time.append(time, cells.timeOrig);

  cells.pace = td('num');
  cells.strokes = td('num hide-sm');
  cells.swolf = td('num hide-sm');
  const act = td('num');

  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'icon-btn';
  undo.title = T.undoLap;
  undo.textContent = '↺';
  undo.addEventListener('click', () => {
    const o = doc.model.laps[i];
    setTimer(i, o.timer);
    doc.state[i].distance = o.distance;
    updateAll();
  });
  cells.undo = undo;

  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'icon-btn';
  expand.title = T.showLengths;
  expand.textContent = '▾';
  expand.setAttribute('aria-expanded', 'false');
  const detail = document.createElement('tr');
  detail.className = 'lengths';
  detail.hidden = true;
  detail.innerHTML = `<td colspan="9">${lengthChips(lap)}</td>`;
  expand.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    expand.setAttribute('aria-expanded', String(!detail.hidden));
  });
  if (lap.lengths.length) act.append(expand);
  act.append(undo);

  els.laps.append(tr, detail);
  return { tr, cells };
}

function unitSpan() {
  const s = document.createElement('span');
  s.className = 'unit';
  s.textContent = unitName();
  return s;
}

function lengthChips(lap) {
  if (!lap.lengths.length) return `<span class="muted">${T.noLengths}</span>`;
  const chips = lap.lengths.map((l, j) => (l.active
    ? `<span class="chip"><b>${j + 1}</b> ${fmtTime(l.timer)} · ${l.strokes} ${T.strokesShort}</span>`
    : `<span class="chip idle">${T.idle} ${fmtTime(l.timer)}</span>`)).join('');
  return `<div class="muted small" style="margin-bottom:6px">${T.lengthsAsRecorded}</div><div class="chips">${chips}</div>`;
}

function updateAll() {
  doc.state.forEach((_, i) => updateRow(i));
  updateTotals();
  const any = doc.state.some((_, i) => lapChanged(i));
  els.reset.disabled = !any;
  hideResult();
}

function updateRow(i) {
  const { tr, cells } = doc.rows[i];
  const o = doc.model.laps[i];
  const s = doc.state[i];
  const changed = lapChanged(i);
  tr.classList.toggle('changed', changed);
  cells.undo.style.visibility = changed ? 'visible' : 'hidden';

  if (cells.timeInput !== document.activeElement || !cells.timeInput.classList.contains('invalid')) {
    cells.timeInput.value = fmtTime(s.timer);
    cells.timeInput.classList.remove('invalid');
  }
  const tChanged = Math.abs(o.timer - s.timer) > EPS;
  cells.timeInput.classList.toggle('edited', tChanged);
  cells.timeOrig.textContent = tChanged ? fmtTime(o.timer) : '';

  const lengths = lengthsFor(i);
  if (cells.distInput) {
    cells.distInput.value = String(Math.round(toDisp(s.distance) * 100) / 100);
    cells.distInput.classList.remove('invalid');
    const dChanged = Math.abs(o.distance - s.distance) > 0.005;
    cells.distInput.classList.toggle('edited', dChanged);
    cells.distOrig.textContent = dChanged ? fmtDist(o.distance) : '';
    if (cells.lenInput) {
      cells.lenInput.value = String(lengths);
      cells.lenInput.classList.toggle('edited', dChanged);
    }
  }
  cells.pace.textContent = o.isRest ? '—' : fmtPace(s.timer, s.distance);
  cells.strokes.textContent = o.isRest || !o.strokes ? '—' : String(o.strokes);
  const n = lengths ?? o.activeLengths;
  cells.swolf.textContent = !o.isRest && n && o.strokes ? String(Math.round(s.timer / n + o.strokes / n)) : '—';
}

function totalsOf(list, laps) {
  const t = { timer: 0, swim: 0, dist: 0, lengths: 0 };
  list.forEach((s, i) => {
    t.timer += s.timer;
    t.dist += s.distance;
    if (!laps[i].isRest) t.swim += s.timer;
  });
  return t;
}

function updateTotals() {
  const m = doc.model;
  const orig = totalsOf(m.laps.map((l) => ({ timer: l.timer, distance: l.distance })), m.laps);
  const cur = totalsOf(doc.state, m.laps);
  const pool = m.isPool ? m.poolLength : null;
  const lengthsOrig = m.laps.reduce((a, l) => a + l.activeLengths, 0);
  const lengthsCur = pool ? doc.state.reduce((a, s, i) => a + (m.laps[i].isRest ? 0 : Math.round(s.distance / pool)), 0) : lengthsOrig;

  const card = (label, now, was) => {
    const changed = was != null && was !== now;
    return `<div class="card${changed ? ' changed' : ''}"><div class="label">${label}</div>
      <div class="value">${now}${changed ? `<span class="was">${was}</span>` : ''}</div></div>`;
  };
  els.summary.innerHTML = [
    card(T.cardDistance, fmtDist(cur.dist), fmtDist(orig.dist)),
    card(T.cardTotalTime, fmtTime(cur.timer, 0), fmtTime(orig.timer, 0)),
    card(T.cardSwimTime, fmtTime(cur.swim, 0), fmtTime(orig.swim, 0)),
    card(T.cardPace(unitName()), fmtPace(cur.swim, cur.dist), fmtPace(orig.swim, orig.dist)),
    pool ? card(T.cardLengths, String(lengthsCur), String(lengthsOrig)) : '',
  ].join('');

  els.totals.innerHTML = `<tr><td></td><td>${T.total}</td><td class="num">${fmtDist(cur.dist)}</td>
    <td class="num hide-sm">${pool ? lengthsCur : '—'}</td><td class="num">${fmtTime(cur.timer)}</td>
    <td class="num">${fmtPace(cur.swim, cur.dist)}</td><td class="num hide-sm"></td><td class="num hide-sm"></td><td></td></tr>`;
}

// ---------------------------------------------------------------- edição

let notice = '';

function setTimer(i, newTimer) {
  const laps = doc.model.laps;
  const delta = newTimer - doc.state[i].timer;
  doc.state[i].timer = newTimer;
  if (els.compensate.checked && !laps[i].isRest && laps[i + 1]?.isRest && Math.abs(delta) > EPS) {
    const rest = doc.state[i + 1];
    const wanted = rest.timer - delta;
    rest.timer = Math.max(0, wanted);
    if (wanted < 0) notice = T.restZeroed(i + 1, fmtTime(-wanted));
  }
}

function onTime(i, input) {
  const v = parseTime(input.value);
  if (v == null || v < 0 || v > 24 * 3600) {
    input.classList.add('invalid');
    input.title = T.timeFormat;
    return;
  }
  input.title = '';
  notice = '';
  setTimer(i, v);
  updateAll();
  if (notice) flash(notice, 'warn');
}

function onDistance(i, input) {
  const m = doc.model;
  const raw = parseFloat(String(input.value).replace(',', '.'));
  if (!Number.isFinite(raw) || raw <= 0) {
    input.classList.add('invalid');
    return;
  }
  let meters = fromDisp(raw);
  if (m.isPool && m.poolLength && m.laps[i].activeLengths > 0) {
    meters = Math.max(1, Math.round(meters / m.poolLength)) * m.poolLength;
  }
  doc.state[i].distance = meters;
  updateAll();
}

function onLengths(i, input) {
  const n = parseInt(input.value, 10);
  if (!Number.isFinite(n) || n < 1) {
    input.classList.add('invalid');
    return;
  }
  doc.state[i].distance = n * doc.model.poolLength;
  updateAll();
}

els.reset.addEventListener('click', () => {
  doc.state = doc.model.laps.map((l) => ({ timer: l.timer, distance: l.distance }));
  updateAll();
});

function flash(msg, kind = 'ok') {
  els.result.className = `alert ${kind}`;
  els.result.textContent = msg;
  els.result.hidden = false;
  els.upload.hidden = true;
}

function hideResult() {
  els.result.hidden = true;
  els.upload.hidden = true;
}

// ---------------------------------------------------------------- exportar

function buildEdits() {
  const edits = {};
  doc.state.forEach((s, i) => {
    const o = doc.model.laps[i];
    const e = {};
    if (Math.abs(o.timer - s.timer) > EPS) e.timer = Math.round(s.timer * 1000) / 1000;
    if (Math.abs(o.distance - s.distance) > 0.005) e.distance = s.distance;
    if (Object.keys(e).length) edits[i] = e;
  });
  return edits;
}

els.exportBtn.addEventListener('click', () => {
  try {
    const edits = buildEdits();
    const { bytes, report } = applyEdits(doc.bytes, edits);
    // Confere se o arquivo gerado é legível e bate com o esperado.
    const check = analyze(bytes);
    const expectDist = doc.state.reduce((a, s) => a + s.distance, 0);
    if (Math.abs(check.totalDistance - expectDist) > 1) throw new Error(T.checkFailed);

    const base = doc.name.replace(/\.fit$/i, '');
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}${T.fileSuffix}.fit`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    const even = report.filter((r) => r.lengthMode === 'even').map((r) => r.index + 1);
    // Conta as séries de nado alteradas (descansos só compensados não contam).
    const n = report.filter((r) => !doc.model.laps[r.index].isRest).length || report.length;
    let msg = n ? T.exported(n, fmtDist(check.totalDistance), fmtTime(check.totalTimer, 0)) : T.exportedNoChange;
    if (even.length) msg += ` ${T.evenSpread(even)}`;
    flash(msg, 'ok');
    els.upload.hidden = false;
  } catch (err) {
    console.error(err);
    flash(T.exportError(errorText(T, err)), 'error');
  }
});
