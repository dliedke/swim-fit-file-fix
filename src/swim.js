// Lógica de natação: extrai séries (voltas) e piscinas (lengths) de um FIT e
// aplica correções de tempo e distância, recalculando tudo o que depende disso.

import { parseFit, encodeFit, readField, writeField, hasField, cloneMessage, FitError } from './fit.js';

export const MSG = {
  FILE_ID: 0, SESSION: 18, LAP: 19, RECORD: 20, EVENT: 21, ACTIVITY: 34,
  LENGTH: 101, SEGMENT_LAP: 142, TIMESTAMP_CORRELATION: 162, SPLIT: 312,
};

export const STROKES = {
  0: 'Livre', 1: 'Costas', 2: 'Peito', 3: 'Borboleta', 4: 'Educativo', 5: 'Misto', 6: 'Medley', 7: 'Medley', 8: 'Rimo',
};

// Campos do tipo data/hora (além do 253, presente em qualquer mensagem).
const DATE_FIELDS = {
  [MSG.SESSION]: [2], [MSG.LAP]: [2], [MSG.EVENT]: [15], [MSG.LENGTH]: [2],
  [MSG.SEGMENT_LAP]: [2], [MSG.TIMESTAMP_CORRELATION]: [1], [MSG.SPLIT]: [9, 27],
};
// Campos de hora local: deslocados pelo mesmo ajuste do timestamp da mensagem.
const LOCAL_DATE_FIELDS = { [MSG.ACTIVITY]: [5], [MSG.TIMESTAMP_CORRELATION]: [3] };

// Campos Garmin não documentados, gravados em atividades de natação
// (confirmados empiricamente: SWOLF e braçadas por piscina x10).
const GARMIN_LAP_SWOLF = 73;
const GARMIN_LAP_STROKES_PER_LENGTH = 90;
const GARMIN_SESSION_STROKES_PER_LENGTH = 79;
const GARMIN_SESSION_SWOLF = 80;

const get = (msg, num, scale = 1) => {
  const v = readField(msg, num);
  return v == null ? null : v / scale;
};
const set = (msg, num, value, scale = 1) => writeField(msg, num, value == null ? null : value * scale);
const setIfPresent = (msg, num, value, scale = 1) => (hasField(msg, num) ? set(msg, num, value, scale) : false);

function isActiveLength(len) {
  const type = get(len, 12);
  return type == null ? true : type === 1;
}

function lengthTimer(len) {
  return get(len, 4, 1000) ?? get(len, 3, 1000) ?? 0;
}

/** Encontra o arquivo (dentro de um FIT encadeado) que contém a atividade. */
function activityFile(parsed) {
  return parsed.files.find((f) => f.messages.some((m) => m.def.globalNum === MSG.LAP)) || parsed.files[0];
}

function collect(file) {
  const by = (n) => file.messages.filter((m) => m.def.globalNum === n);
  return {
    fileId: by(MSG.FILE_ID)[0] || null,
    sessions: by(MSG.SESSION),
    laps: by(MSG.LAP),
    lengths: by(MSG.LENGTH),
    activity: by(MSG.ACTIVITY)[0] || null,
    records: by(MSG.RECORD),
  };
}

/** Associa as piscinas de cada volta. Retorna array (por volta) de arrays de mensagens length. */
function assignLengths(laps, lengths) {
  const result = laps.map(() => []);
  if (!lengths.length) return result;
  const idxOf = (len, i) => get(len, 254) ?? i;
  const useIndex = laps.length > 0 && laps.every((l) => get(l, 35) != null);
  if (useIndex) {
    const firsts = laps.map((l) => get(l, 35));
    lengths.forEach((len, i) => {
      const idx = idxOf(len, i);
      let owner = -1;
      for (let j = 0; j < laps.length; j++) {
        const start = firsts[j];
        const end = j + 1 < laps.length ? Math.max(firsts[j + 1], start) : Infinity;
        if (idx >= start && idx < end) owner = j;
      }
      if (owner < 0) {
        // Índice inconsistente: cai para a última volta que começa antes.
        for (let j = 0; j < laps.length; j++) if (firsts[j] <= idx) owner = j;
      }
      if (owner >= 0) result[owner].push(len);
    });
    return result;
  }
  // Sem índices: associa pelo horário de início.
  lengths.forEach((len) => {
    const st = get(len, 2) ?? get(len, 253);
    let owner = 0;
    laps.forEach((lap, j) => {
      const ls = get(lap, 2);
      if (ls != null && st != null && st >= ls) owner = j;
    });
    result[owner].push(len);
  });
  return result;
}

function sessionLaps(session, laps, sessions) {
  const first = get(session, 25);
  const num = get(session, 26);
  if (first != null && num != null) return laps.slice(first, first + num);
  if (sessions.length === 1) return laps;
  const st = get(session, 2);
  const end = st + (get(session, 7, 1000) ?? 0);
  return laps.filter((l) => {
    const ls = get(l, 2);
    return ls != null && ls >= st && ls <= end;
  });
}

function lapSummary(lap, lapLengths, index, poolLength) {
  const active = lapLengths.filter(isActiveLength);
  const distance = get(lap, 9, 100) ?? 0;
  const timer = get(lap, 8, 1000) ?? 0;
  const elapsed = get(lap, 7, 1000) ?? timer;
  let strokes = get(lap, 10);
  if (strokes == null && active.length) strokes = active.reduce((s, l) => s + (get(l, 5) ?? 0), 0);
  const isRest = distance === 0 && active.length === 0;
  const strokeCode = get(lap, 38) ?? (active.length ? get(active[0], 7) : null);
  return {
    index,
    startTime: get(lap, 2),
    timer,
    elapsed,
    distance,
    strokes: strokes ?? 0,
    isRest,
    stroke: strokeCode,
    strokeName: isRest ? 'Descanso' : (STROKES[strokeCode] ?? '—'),
    activeLengths: active.length,
    lengths: lapLengths.map((len) => ({
      active: isActiveLength(len),
      timer: lengthTimer(len),
      strokes: get(len, 5) ?? 0,
      stroke: get(len, 7),
      startTime: get(len, 2),
    })),
    poolLength,
  };
}

/** Lê o FIT e devolve um resumo para exibir/editar. */
export function analyze(bytes) {
  const parsed = parseFit(bytes);
  const file = activityFile(parsed);
  const c = collect(file);
  if (!c.laps.length) throw new FitError('O arquivo não contém séries (voltas). É um arquivo de atividade?', 'no_laps');
  const session = c.sessions[0] || null;
  const sport = session ? get(session, 5) : null;
  const subSport = session ? get(session, 6) : null;
  const poolLength = session ? get(session, 44, 100) : null;
  const poolUnit = session ? get(session, 46) : null; // 0 = métrico, 1 = jardas
  const lapLengths = assignLengths(c.laps, c.lengths);
  const laps = c.laps.map((lap, i) => lapSummary(lap, lapLengths[i], i, poolLength));
  return {
    crcOk: parsed.files.every((f) => f.header.crcOk),
    sport,
    subSport,
    isSwim: sport === 5,
    isPool: sport === 5 && subSport !== 18 && !!poolLength,
    poolLength,
    poolUnit: poolUnit ?? 0,
    manufacturer: c.fileId ? get(c.fileId, 1) : null,
    product: c.fileId ? get(c.fileId, 2) : null,
    startTime: session ? get(session, 2) : laps[0].startTime,
    totalTimer: session ? get(session, 8, 1000) : laps.reduce((s, l) => s + l.timer, 0),
    totalElapsed: session ? get(session, 7, 1000) : null,
    totalDistance: session ? get(session, 9, 100) : laps.reduce((s, l) => s + l.distance, 0),
    laps,
  };
}

// ---------------------------------------------------------------------------
// Aplicação das correções
// ---------------------------------------------------------------------------

function splitLength(file, len, poolLength) {
  const timer = lengthTimer(len);
  const elapsed = get(len, 3, 1000) ?? timer;
  const strokes = get(len, 5);
  const start = get(len, 2);
  const ts = get(len, 253);
  const ta = Math.round((timer * 1000) / 2) / 1000;
  const tb = timer - ta;
  const ea = Math.round((elapsed * 1000) / 2) / 1000;
  const eb = elapsed - ea;
  const b = cloneMessage(len);
  setIfPresent(len, 4, ta, 1000);
  setIfPresent(len, 3, ea, 1000);
  setIfPresent(b, 4, tb, 1000);
  setIfPresent(b, 3, eb, 1000);
  if (strokes != null) {
    const sa = Math.ceil(strokes / 2);
    set(len, 5, sa);
    set(b, 5, strokes - sa);
  }
  const cal = get(len, 11);
  if (cal != null) {
    set(len, 11, Math.ceil(cal / 2));
    set(b, 11, cal - Math.ceil(cal / 2));
  }
  if (start != null) set(b, 2, Math.round(start + ea));
  // Se o timestamp marca o fim da piscina, a primeira metade termina antes.
  if (ts != null && start != null && Math.abs(ts - (start + elapsed)) <= 2) set(len, 253, Math.round(start + ea));
  refreshLengthMetrics(len, poolLength);
  refreshLengthMetrics(b, poolLength);
  const pos = file.messages.indexOf(len);
  file.messages.splice(pos + 1, 0, b);
  return b;
}

function mergeLengths(file, first, second, poolLength) {
  const t = lengthTimer(first) + lengthTimer(second);
  const e = (get(first, 3, 1000) ?? lengthTimer(first)) + (get(second, 3, 1000) ?? lengthTimer(second));
  setIfPresent(first, 4, t, 1000);
  setIfPresent(first, 3, e, 1000);
  const s1 = get(first, 5);
  const s2 = get(second, 5);
  if (s1 != null || s2 != null) set(first, 5, (s1 ?? 0) + (s2 ?? 0));
  const c1 = get(first, 11);
  const c2 = get(second, 11);
  if (c1 != null || c2 != null) set(first, 11, (c1 ?? 0) + (c2 ?? 0));
  const ts2 = get(second, 253);
  const ts1 = get(first, 253);
  if (ts1 != null && ts2 != null && ts2 > ts1) set(first, 253, ts2);
  refreshLengthMetrics(first, poolLength);
  file.messages.splice(file.messages.indexOf(second), 1);
}

function refreshLengthMetrics(len, poolLength) {
  if (!isActiveLength(len)) return;
  const timer = lengthTimer(len);
  if (poolLength && timer > 0) setIfPresent(len, 6, poolLength / timer, 1000);
  const strokes = get(len, 5);
  if (strokes != null && timer > 0 && get(len, 9) != null) set(len, 9, (strokes * 60) / timer);
}

function median(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Ajusta o número de piscinas ativas da volta para `target`.
 * - Se uma piscina é claramente longa demais (o relógio perdeu uma virada),
 *   ela é dividida ao meio; se é claramente curta demais (virada a mais),
 *   é unida à vizinha.
 * - Caso contrário, o tempo e as braçadas da série são redistribuídos
 *   igualmente entre as piscinas (como o Garmin Connect faz ao editar).
 * Retorna o modo usado: 'split', 'merge', 'even' ou null.
 */
function rebuildLengths(file, lapLengths, target, poolLength) {
  const active = () => lapLengths.filter(isActiveLength);
  let mode = null;
  let guard = 0;
  while (active().length < target && guard++ < 1000) {
    const list = active();
    const longest = list.reduce((a, b) => (lengthTimer(b) > lengthTimer(a) ? b : a));
    const others = median(list.filter((l) => l !== longest).map(lengthTimer));
    if (others != null && lengthTimer(longest) < 1.5 * others) break;
    const clone = splitLength(file, longest, poolLength);
    lapLengths.splice(lapLengths.indexOf(longest) + 1, 0, clone);
    mode = 'split';
  }
  while (active().length > target && active().length > 1 && guard++ < 2000) {
    const list = active();
    let i = 0;
    list.forEach((l, j) => { if (lengthTimer(l) < lengthTimer(list[i])) i = j; });
    const others = median(list.filter((_, j) => j !== i).map(lengthTimer));
    if (others != null && lengthTimer(list[i]) > 0.66 * others) break;
    let j;
    if (i === 0) j = 1;
    else if (i === list.length - 1) j = i - 1;
    else j = lengthTimer(list[i - 1]) <= lengthTimer(list[i + 1]) ? i - 1 : i + 1;
    const [a, b] = i < j ? [list[i], list[j]] : [list[j], list[i]];
    mergeLengths(file, a, b, poolLength);
    lapLengths.splice(lapLengths.indexOf(b), 1);
    mode = 'merge';
  }
  if (active().length !== target) {
    redistributeLengths(file, lapLengths, target, poolLength);
    mode = 'even';
  }
  return mode;
}

function spread(total, n, decimals) {
  // Divide `total` em n partes que somam exatamente o total (na precisão dada).
  const f = 10 ** decimals;
  const units = Math.round(total * f);
  const base = Math.floor(units / n);
  const rest = units - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / f);
}

function redistributeLengths(file, lapLengths, target, poolLength) {
  let list = lapLengths.filter(isActiveLength);
  const first = list[0];
  const timer = list.reduce((s, l) => s + lengthTimer(l), 0);
  const elapsed = list.reduce((s, l) => s + (get(l, 3, 1000) ?? lengthTimer(l)), 0);
  const hasStrokes = list.some((l) => get(l, 5) != null);
  const strokes = list.reduce((s, l) => s + (get(l, 5) ?? 0), 0);
  const hasCal = list.some((l) => get(l, 11) != null);
  const calories = list.reduce((s, l) => s + (get(l, 11) ?? 0), 0);
  const start0 = get(first, 2);
  const ts0 = get(first, 253);
  const endStamps = ts0 != null && start0 != null && Math.abs(ts0 - (start0 + (get(first, 3, 1000) ?? lengthTimer(first)))) <= 2;

  while (list.length < target) {
    const last = list[list.length - 1];
    const clone = cloneMessage(last);
    file.messages.splice(file.messages.indexOf(last) + 1, 0, clone);
    lapLengths.splice(lapLengths.indexOf(last) + 1, 0, clone);
    list.push(clone);
  }
  while (list.length > target) {
    const last = list.pop();
    file.messages.splice(file.messages.indexOf(last), 1);
    lapLengths.splice(lapLengths.indexOf(last), 1);
  }
  list = lapLengths.filter(isActiveLength);
  const timers = spread(timer, target, 3);
  const elapseds = spread(elapsed, target, 3);
  const strokeParts = spread(strokes, target, 0).reverse();
  const calParts = spread(calories, target, 0).reverse();
  let t = start0;
  list.forEach((len, i) => {
    setIfPresent(len, 4, timers[i], 1000);
    setIfPresent(len, 3, elapseds[i], 1000);
    if (hasStrokes) set(len, 5, strokeParts[i]);
    if (hasCal) set(len, 11, calParts[i]);
    if (t != null) {
      set(len, 2, Math.round(t));
      if (endStamps) set(len, 253, Math.round(t + elapseds[i]));
      t += elapseds[i];
    }
    refreshLengthMetrics(len, poolLength);
  });
}

/** Cria a função de remapeamento de horários a partir das voltas. */
function buildTimeMap(lapInfos) {
  const pts = lapInfos
    .filter((l) => l.start != null)
    .sort((a, b) => a.start - b.start);
  if (!pts.length) return { map: (t) => t, lapStart: () => null };
  let off = 0;
  for (const p of pts) {
    p.newStart = p.start + off;
    off += p.newElapsed - p.elapsed;
  }
  const finalOff = off;
  const last = pts[pts.length - 1];
  const lastEnd = last.start + last.elapsed;
  const map = (t) => {
    if (t == null) return t;
    if (t < pts[0].start) return t;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const next = pts[i + 1];
      const end = next ? next.start : lastEnd;
      const newEnd = next ? next.newStart : last.newStart + last.newElapsed;
      if (t < end || (!next && t <= end)) {
        const span = end - p.start;
        if (span <= 0) return p.newStart;
        return p.newStart + ((t - p.start) * (newEnd - p.newStart)) / span;
      }
    }
    return t + finalOff;
  };
  return { map, finalOff };
}

function bestBasis(avgSpeed, distance, candidates) {
  if (avgSpeed == null || !distance) return candidates[0]?.key;
  let best = null;
  let bestErr = Infinity;
  for (const c of candidates) {
    if (!c.value) continue;
    const err = Math.abs(distance / c.value - avgSpeed);
    if (err < bestErr) { bestErr = err; best = c.key; }
  }
  return best ?? candidates[0]?.key;
}

/**
 * Aplica as correções e devolve os bytes do novo FIT.
 * edits: { [lapIndex]: { timer?: segundos, distance?: metros } }
 */
export function applyEdits(bytes, edits) {
  const parsed = parseFit(bytes);
  const file = activityFile(parsed);
  const c = collect(file);
  const session = c.sessions[0] || null;
  const poolLength = session ? get(session, 44, 100) : null;
  const isPool = session && get(session, 5) === 5 && get(session, 6) !== 18 && !!poolLength;
  const garminSwim = c.fileId && get(c.fileId, 1) === 1 && session && get(session, 5) === 5;
  const lapLengths = assignLengths(c.laps, c.lengths);

  const infos = c.laps.map((lap, i) => {
    const timer = get(lap, 8, 1000) ?? 0;
    const elapsed = get(lap, 7, 1000) ?? timer;
    const distance = get(lap, 9, 100) ?? 0;
    const e = edits[i] || {};
    const newTimer = e.timer != null ? Math.max(0, e.timer) : timer;
    let newDistance = e.distance != null ? Math.max(0, e.distance) : distance;
    const activeBefore = lapLengths[i].filter(isActiveLength).length;
    return {
      lap, index: i, start: get(lap, 2), timer, elapsed, distance, activeBefore,
      newTimer, newElapsed: Math.max(0, elapsed + (newTimer - timer)), newDistance,
      timerChanged: Math.abs(newTimer - timer) > 0.0005,
      distanceChanged: Math.abs(newDistance - distance) > 0.005,
    };
  });

  // 1) Reconstrói as piscinas das voltas cuja distância mudou (piscina).
  for (const info of infos) {
    if (!info.distanceChanged || !isPool || info.activeBefore === 0) continue;
    const target = Math.max(1, Math.round(info.newDistance / poolLength));
    info.newDistance = target * poolLength;
    info.distanceChanged = Math.abs(info.newDistance - info.distance) > 0.005;
    info.lengthMode = rebuildLengths(file, lapLengths[info.index], target, poolLength);
  }

  // 2) Distância acumulada dos registros (antes de mexer nos horários).
  const changedAny = infos.some((i) => i.timerChanged || i.distanceChanged);
  const timeMap = buildTimeMap(infos);
  if (infos.some((i) => i.distanceChanged)) {
    let oldCum = 0;
    let newCum = 0;
    const ranges = infos.map((i) => {
      const r = { start: i.start, end: i.start + i.elapsed, oldStart: oldCum, newStart: newCum, old: i.distance, new: i.newDistance };
      oldCum += i.distance;
      newCum += i.newDistance;
      return r;
    });
    for (const rec of c.records) {
      const d = get(rec, 5, 100);
      const t = get(rec, 253);
      if (d == null || t == null) continue;
      let r = ranges[0];
      for (const x of ranges) if (x.start != null && t >= x.start) r = x;
      let nd;
      if (t > r.end + 1 && r === ranges[ranges.length - 1]) nd = d - oldCum + newCum;
      else if (r.old > 0) nd = r.newStart + Math.min(Math.max((d - r.oldStart) / r.old, 0), 1) * r.new;
      else nd = r.newStart + Math.max(0, d - r.oldStart);
      set(rec, 5, Math.max(0, nd), 100);
    }
  }

  // 3) Remapeia todos os horários do arquivo.
  if (infos.some((i) => i.timerChanged)) {
    const lapSet = new Set(c.laps);
    for (const msg of file.messages) {
      const g = msg.def.globalNum;
      const ts = get(msg, 253);
      const newTs = ts != null ? timeMap.map(ts) : null;
      if (ts != null) set(msg, 253, Math.round(newTs));
      for (const f of DATE_FIELDS[g] || []) {
        if (lapSet.has(msg) && f === 2) continue; // voltas tratadas abaixo
        const v = get(msg, f);
        if (v != null) set(msg, f, Math.round(timeMap.map(v)));
      }
      for (const f of LOCAL_DATE_FIELDS[g] || []) {
        const v = get(msg, f);
        if (v != null && ts != null) set(msg, f, Math.round(v + (newTs - ts)));
      }
    }
    for (const info of infos) if (info.start != null) set(info.lap, 2, Math.round(info.newStart));
  }

  // 4) Escala a duração das piscinas das voltas cujo tempo mudou.
  for (const info of infos) {
    if (!info.timerChanged) continue;
    const k = info.timer > 0 ? info.newTimer / info.timer : 1;
    const ke = info.elapsed > 0 ? info.newElapsed / info.elapsed : 1;
    const lens = lapLengths[info.index];
    if (info.timer === 0 && lens.length) {
      // Volta sem tempo original: distribui o novo tempo igualmente.
      const each = info.newTimer / lens.length;
      for (const len of lens) { setIfPresent(len, 4, each, 1000); setIfPresent(len, 3, each, 1000); }
    } else {
      for (const len of lens) {
        const t = get(len, 4, 1000);
        const e = get(len, 3, 1000);
        if (t != null) set(len, 4, t * k, 1000);
        if (e != null) set(len, 3, e * ke, 1000);
      }
    }
    for (const len of lens) refreshLengthMetrics(len, poolLength);
  }

  // 5) Renumera piscinas e índices das voltas.
  const allLengths = file.messages.filter((m) => m.def.globalNum === MSG.LENGTH);
  allLengths.forEach((len, i) => setIfPresent(len, 254, i));
  let cursor = 0;
  c.laps.forEach((lap, i) => {
    if (hasField(lap, 35) && lapLengths[i].length) set(lap, 35, allLengths.indexOf(lapLengths[i][0]));
    else if (hasField(lap, 35)) set(lap, 35, cursor);
    cursor += lapLengths[i].length;
  });

  // 6) Recalcula cada volta alterada.
  for (const info of infos) {
    if (!info.timerChanged && !info.distanceChanged) continue;
    const { lap } = info;
    const lens = lapLengths[info.index];
    const active = lens.filter(isActiveLength);
    const activeDelta = active.length - info.activeBefore;
    info.activeAfter = active.length;
    const dT = info.newTimer - info.timer;
    set(lap, 8, info.newTimer, 1000);
    setIfPresent(lap, 7, info.newElapsed, 1000);
    set(lap, 9, info.newDistance, 100);
    const moving = get(lap, 52, 1000);
    if (moving != null) set(lap, 52, Math.max(0, moving + dT), 1000);
    const activeTime = get(lap, 70, 1000);
    let newActive = null;
    if (activeTime != null) {
      newActive = Math.abs(activeTime - info.timer) < 0.01 ? info.newTimer : Math.max(0, activeTime + (info.distance > 0 ? dT : 0));
      set(lap, 70, newActive, 1000);
    }
    info.newActiveTime = newActive ?? (info.newDistance > 0 ? info.newTimer : 0);
    info.oldActiveTime = activeTime ?? (info.distance > 0 ? info.timer : 0);
    for (const f of [32, 40]) {
      const v = get(lap, f);
      if (v != null) set(lap, f, Math.max(0, v + activeDelta));
    }
    const strokes = get(lap, 10) ?? get(lap, 75);
    const basisTime = info.newActiveTime || info.newTimer;
    const speed = basisTime > 0 ? info.newDistance / basisTime : 0;
    const oldAvg = get(lap, 110, 1000) ?? get(lap, 13, 1000);
    if (oldAvg != null || info.newDistance > 0) {
      setIfPresent(lap, 13, speed, 1000);
      setIfPresent(lap, 110, speed, 1000);
    }
    let maxSpeed = null;
    if (active.length && poolLength) {
      maxSpeed = Math.max(...active.map((l) => {
        const t = lengthTimer(l);
        return t > 0 ? poolLength / t : 0;
      }));
    } else if (info.newDistance > 0) {
      const oldMax = get(lap, 111, 1000) ?? get(lap, 14, 1000);
      const oldSpeed = info.oldActiveTime > 0 ? info.distance / info.oldActiveTime : 0;
      maxSpeed = oldMax != null && oldSpeed > 0 ? Math.max(speed, oldMax * (speed / oldSpeed)) : speed;
    }
    if (maxSpeed != null) {
      setIfPresent(lap, 14, maxSpeed, 1000);
      setIfPresent(lap, 111, maxSpeed, 1000);
    }
    info.maxSpeed = maxSpeed ?? get(lap, 111, 1000) ?? get(lap, 14, 1000);
    if (strokes != null && basisTime > 0 && get(lap, 17)) set(lap, 17, (strokes * 60) / basisTime);
    if (strokes && get(lap, 37)) set(lap, 37, info.newDistance / strokes, 100);
    if (garminSwim && active.length && strokes != null) {
      if (hasField(lap, GARMIN_LAP_SWOLF) && get(lap, GARMIN_LAP_SWOLF)) {
        set(lap, GARMIN_LAP_SWOLF, basisTime / active.length + strokes / active.length);
      }
      if (hasField(lap, GARMIN_LAP_STROKES_PER_LENGTH) && get(lap, GARMIN_LAP_STROKES_PER_LENGTH)) {
        set(lap, GARMIN_LAP_STROKES_PER_LENGTH, (strokes / active.length) * 10);
      }
    }
  }

  // 7) Recalcula sessões e atividade.
  let totalTimerDelta = 0;
  for (const s of c.sessions) {
    const sLaps = new Set(sessionLaps(s, c.laps, c.sessions));
    const sInfos = infos.filter((i) => sLaps.has(i.lap));
    if (!sInfos.some((i) => i.timerChanged || i.distanceChanged)) continue;
    const dTimer = sInfos.reduce((a, i) => a + (i.newTimer - i.timer), 0);
    const dElapsed = sInfos.reduce((a, i) => a + (i.newElapsed - i.elapsed), 0);
    const dDist = sInfos.reduce((a, i) => a + (i.newDistance - i.distance), 0);
    const dActiveLengths = sInfos.reduce((a, i) => a + ((i.activeAfter ?? i.activeBefore) - i.activeBefore), 0);
    totalTimerDelta += dTimer;
    const oldTimer = get(s, 8, 1000) ?? 0;
    const oldDist = get(s, 9, 100) ?? 0;
    const oldMoving = get(s, 59, 1000);
    const oldActive = get(s, 78, 1000);
    const swimDelta = sInfos.reduce((a, i) => {
      if (!(i.timerChanged || i.distanceChanged)) return a;
      return a + ((i.newActiveTime ?? 0) - (i.oldActiveTime ?? 0));
    }, 0);
    const swimTimeOld = sInfos.reduce((a, i) => a + (i.distance > 0 ? i.timer : 0), 0);
    const swimTimeNew = sInfos.reduce((a, i) => a + (i.newDistance > 0 ? i.newTimer : 0), 0);
    const newTimer = oldTimer + dTimer;
    const newDist = oldDist + dDist;
    set(s, 8, newTimer, 1000);
    const el = get(s, 7, 1000);
    if (el != null) set(s, 7, el + dElapsed, 1000);
    set(s, 9, newDist, 100);
    if (oldMoving != null) set(s, 59, Math.max(0, oldMoving + dTimer), 1000);
    const newActive = oldActive != null ? Math.max(0, oldActive + swimDelta) : null;
    if (newActive != null) set(s, 78, newActive, 1000);
    for (const f of [33, 47]) {
      const v = get(s, f);
      if (v != null) set(s, f, Math.max(0, v + dActiveLengths));
    }
    // Velocidade média: usa a mesma base que o relógio usou originalmente.
    const oldAvg = get(s, 124, 1000) ?? get(s, 14, 1000);
    const basis = bestBasis(oldAvg, oldDist, [
      { key: 'active', value: oldActive },
      { key: 'swim', value: swimTimeOld },
      { key: 'moving', value: oldMoving },
      { key: 'timer', value: oldTimer },
    ]);
    const basisNew = { active: newActive, swim: swimTimeNew, moving: oldMoving != null ? oldMoving + dTimer : null, timer: newTimer }[basis] || newTimer;
    const avg = basisNew > 0 ? newDist / basisNew : 0;
    setIfPresent(s, 14, avg, 1000);
    setIfPresent(s, 124, avg, 1000);
    const lapMax = sInfos.map((i) => i.maxSpeed ?? get(i.lap, 111, 1000) ?? get(i.lap, 14, 1000) ?? 0);
    const maxSpeed = Math.max(avg, ...lapMax);
    setIfPresent(s, 15, maxSpeed, 1000);
    setIfPresent(s, 125, maxSpeed, 1000);
    const strokes = get(s, 10) ?? get(s, 85);
    const activeLengths = get(s, 47) ?? get(s, 33);
    const swimTime = newActive ?? swimTimeNew;
    if (strokes && activeLengths && get(s, 41) != null) set(s, 41, strokes / activeLengths, 10);
    if (strokes && get(s, 42)) set(s, 42, newDist / strokes, 100);
    if (strokes && swimTime > 0 && get(s, 18)) set(s, 18, (strokes * 60) / swimTime);
    const numLaps = get(s, 26);
    if (numLaps && get(s, 69) != null) set(s, 69, newTimer / numLaps, 1000);
    if (garminSwim && strokes != null && activeLengths) {
      if (get(s, GARMIN_SESSION_STROKES_PER_LENGTH)) set(s, GARMIN_SESSION_STROKES_PER_LENGTH, (strokes / activeLengths) * 10);
      if (get(s, GARMIN_SESSION_SWOLF)) set(s, GARMIN_SESSION_SWOLF, swimTime / activeLengths + strokes / activeLengths);
    }
  }
  if (c.activity && totalTimerDelta) {
    const t = get(c.activity, 0, 1000);
    if (t != null) set(c.activity, 0, t + totalTimerDelta, 1000);
  }

  const report = infos
    .filter((i) => i.timerChanged || i.distanceChanged)
    .map((i) => ({ index: i.index, timer: i.newTimer, distance: i.newDistance, lengthMode: i.lengthMode ?? null }));
  return { bytes: encodeFit(parsed), changed: changedAny, report };
}
