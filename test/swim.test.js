import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Decoder, Stream } from '@garmin/fitsdk';
import { analyze, applyEdits } from '../src/swim.js';
import { parseFit, encodeFit, crc16, readField } from '../src/fit.js';
import { isZip, extractFitFromZip } from '../src/zip.js';
import { makeSwimFit, START } from './fixture.js';

function decode(bytes) {
  const d = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  assert.ok(d.isFIT(), 'deve ser FIT');
  assert.ok(d.checkIntegrity(), 'CRC/integridade deve ser válida');
  const { messages, errors } = d.read({ convertDateTimesToDates: false, mergeHeartRates: false, includeUnknownData: true });
  assert.deepEqual(errors, []);
  return messages;
}

const near = (a, b, tol = 0.002) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

test('ler e regravar sem edições gera bytes idênticos', () => {
  const input = makeSwimFit();
  const { bytes, changed } = applyEdits(input, {});
  assert.equal(changed, false);
  assert.deepEqual(Buffer.from(bytes), Buffer.from(input));
});

test('analyze resume séries, descansos e piscinas', () => {
  const m = analyze(makeSwimFit());
  assert.equal(m.isPool, true);
  assert.equal(m.poolLength, 25);
  assert.equal(m.laps.length, 7);
  assert.deepEqual(m.laps.map((l) => l.isRest), [false, true, false, true, false, true, false]);
  assert.deepEqual(m.laps.map((l) => l.distance), [100, 0, 100, 0, 125, 0, 100]);
  assert.equal(m.laps[1].lengths.length, 1);
  assert.equal(m.laps[1].lengths[0].active, false);
  assert.equal(m.totalDistance, 425);
});

test('tempo com compensação no descanso: resto do treino não se move', () => {
  const input = makeSwimFit();
  const out = applyEdits(input, { 0: { timer: 95 }, 1: { timer: 68 } }).bytes; // série 103 s -> 95 s
  const msg = decode(out);
  const [lap0, rest, lap2] = msg.lapMesgs;
  near(lap0.totalTimerTime, 95);
  near(lap0.totalElapsedTime, 95);
  near(rest.totalTimerTime, 68);
  assert.equal(rest.startTime, START + 95);
  assert.equal(lap2.startTime, START + 163, 'série seguinte começa no mesmo horário');
  near(lap0.enhancedAvgSpeed, 100 / 95);
  const s = msg.sessionMesgs[0];
  near(s.totalTimerTime, analyze(input).totalTimer);
  near(s.totalDistance, 425);
  // Piscinas da série escaladas e somando o tempo da série.
  const lens = msg.lengthMesgs.slice(0, 4);
  near(lens.reduce((a, l) => a + l.totalTimerTime, 0), 95, 0.01);
  assert.equal(lens[0].startTime, START);
  // Velocidade média da sessão = distância / tempo nadando.
  const swim = msg.lapMesgs.filter((l) => l.totalDistance > 0).reduce((a, l) => a + l.totalTimerTime, 0);
  near(s.enhancedAvgSpeed, 425 / swim);
});

test('tempo sem compensação: empurra tudo que vem depois', () => {
  const input = makeSwimFit();
  const before = decode(input);
  const out = applyEdits(input, { 2: { timer: 139 } }).bytes; // 129 -> 139 s (+10)
  const msg = decode(out);
  assert.equal(msg.lapMesgs[3].startTime, before.lapMesgs[3].startTime + 10);
  assert.equal(msg.lapMesgs[6].startTime, before.lapMesgs[6].startTime + 10);
  near(msg.sessionMesgs[0].totalTimerTime, before.sessionMesgs[0].totalTimerTime + 10);
  near(msg.activityMesgs[0].totalTimerTime, before.activityMesgs[0].totalTimerTime + 10);
  assert.equal(msg.activityMesgs[0].timestamp, before.activityMesgs[0].timestamp + 10);
  assert.equal(msg.activityMesgs[0].localTimestamp, before.activityMesgs[0].localTimestamp + 10);
  const stop = msg.eventMesgs.find((e) => e.eventType === 'stopAll');
  const stop0 = before.eventMesgs.find((e) => e.eventType === 'stopAll');
  assert.equal(stop.timestamp, stop0.timestamp + 10);
  // Registros continuam em ordem cronológica.
  const ts = msg.recordMesgs.map((r) => r.timestamp);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
});

test('distância maior com piscina longa demais: divide a piscina', () => {
  const input = makeSwimFit();
  const { bytes, report } = applyEdits(input, { 2: { distance: 125 } });
  assert.equal(report[0].lengthMode, 'split');
  const msg = decode(bytes);
  const lap = msg.lapMesgs[2];
  assert.equal(lap.totalDistance, 125);
  assert.equal(lap.numActiveLengths, 5);
  assert.equal(lap.numLengths, 5);
  const lens = msg.lengthMesgs.slice(lap.firstLengthIndex, lap.firstLengthIndex + 5);
  assert.deepEqual(lens.map((l) => l.totalTimerTime), [26, 26, 26, 25, 26]);
  assert.deepEqual(lens.map((l) => l.startTime - lens[0].startTime), [0, 26, 52, 78, 103]);
  // Índices renumerados e voltas seguintes apontando para o lugar certo.
  assert.deepEqual(msg.lengthMesgs.map((l) => l.messageIndex), msg.lengthMesgs.map((_, i) => i));
  assert.equal(msg.lapMesgs[3].firstLengthIndex, lap.firstLengthIndex + 5);
  assert.equal(msg.lengthMesgs[msg.lapMesgs[3].firstLengthIndex].lengthType, 'idle');
  const s = msg.sessionMesgs[0];
  assert.equal(s.totalDistance, 450);
  assert.equal(s.numActiveLengths, 18);
  // Distância acumulada dos registros termina no novo total.
  const lastDist = msg.recordMesgs.at(-1).distance;
  assert.ok(lastDist >= 425 && lastDist <= 450, `distância final ${lastDist}`);
});

test('distância menor com piscina curta demais: junta piscinas', () => {
  const input = makeSwimFit();
  const { bytes, report } = applyEdits(input, { 4: { distance: 100 } });
  assert.equal(report[0].lengthMode, 'merge');
  const msg = decode(bytes);
  const lap = msg.lapMesgs[4];
  assert.equal(lap.totalDistance, 100);
  assert.equal(lap.numActiveLengths, 4);
  const lens = msg.lengthMesgs.slice(lap.firstLengthIndex, lap.firstLengthIndex + 4);
  assert.deepEqual(lens.map((l) => l.totalTimerTime), [24, 25, 25, 25]);
  near(lens[2].avgSpeed, 1);
  assert.equal(msg.lengthMesgs.length, 19);
});

test('distância sem piscina anômala: redistribui igualmente', () => {
  const input = makeSwimFit();
  const { bytes, report } = applyEdits(input, { 0: { distance: 150 } });
  assert.equal(report[0].lengthMode, 'even');
  const msg = decode(bytes);
  const lap = msg.lapMesgs[0];
  assert.equal(lap.totalDistance, 150);
  assert.equal(lap.numActiveLengths, 6);
  const lens = msg.lengthMesgs.slice(0, 6);
  near(lens.reduce((a, l) => a + l.totalTimerTime, 0), 103, 0.005);
  const strokes = lens.reduce((a, l) => a + l.totalStrokes, 0);
  assert.equal(strokes, lap.totalCycles, 'braçadas preservadas');
  assert.equal(msg.lengthMesgs[6].lengthType, 'idle');
  near(lap.enhancedAvgSpeed, 150 / 103);
});

test('distância arredondada para múltiplo da piscina', () => {
  const { bytes } = applyEdits(makeSwimFit(), { 0: { distance: 140 } });
  assert.equal(decode(bytes).lapMesgs[0].totalDistance, 150);
});

test('edições combinadas continuam válidas e consistentes', () => {
  const input = makeSwimFit();
  const { bytes } = applyEdits(input, {
    0: { timer: 110, distance: 125 }, 1: { timer: 53 }, 2: { distance: 125 }, 4: { distance: 100, timer: 100 }, 6: { timer: 90 },
  });
  const msg = decode(bytes);
  const laps = msg.lapMesgs;
  const s = msg.sessionMesgs[0];
  near(s.totalDistance, laps.reduce((a, l) => a + l.totalDistance, 0));
  near(s.totalTimerTime, laps.reduce((a, l) => a + l.totalTimerTime, 0), 0.01);
  assert.equal(s.numActiveLengths, laps.reduce((a, l) => a + l.numActiveLengths, 0));
  for (let i = 1; i < laps.length; i++) assert.ok(laps[i].startTime >= laps[i - 1].startTime);
  for (const lap of laps) {
    const lens = msg.lengthMesgs.slice(lap.firstLengthIndex, lap.firstLengthIndex + Math.max(lap.numLengths, 1));
    if (lap.totalDistance > 0) near(lens.reduce((a, l) => a + l.totalTimerTime, 0), lap.totalTimerTime, 0.01);
  }
});

test('mensagens com timestamp comprimido são preservadas', () => {
  // Monta um FIT mínimo à mão: definição de record (253 + FC) e uma mensagem
  // normal, seguida de uma mensagem com cabeçalho de timestamp comprimido.
  const b = [
    0x40, 0, 0, 20, 0, 2, 253, 4, 0x86, 3, 1, 0x02,
    0x00, 0x10, 0x27, 0, 0, 100,
    0x41, 0, 0, 20, 0, 1, 3, 1, 0x02, // definição local 1 sem timestamp
    0x80 | (1 << 5) | ((10000 + 3) & 0x1f), 101,
  ];
  {
    const header = [14, 0x20, 0x08, 0x08, b.length, 0, 0, 0, 0x2e, 0x46, 0x49, 0x54];
    const h = new Uint8Array([...header, 0, 0]);
    const hc = crc16(h, 0, 12);
    h[12] = hc & 0xff; h[13] = hc >> 8;
    const file = new Uint8Array([...h, ...b, 0, 0]);
    const c = crc16(file, 0, file.length - 2);
    file[file.length - 2] = c & 0xff; file[file.length - 1] = c >> 8;
    const parsed = parseFit(file);
    const msgs = parsed.files[0].messages;
    assert.equal(readField(msgs[1], 253), 10003);
    const out = encodeFit(parsed);
    const records = decode(out).recordMesgs;
    assert.deepEqual(records.map((r) => [r.timestamp, r.heartRate]), [[10000, 100], [10003, 101]]);
  }
});

test('extrai .fit de dentro de um .zip', async () => {
  const fit = makeSwimFit();
  const zlib = await import('node:zlib');
  const deflated = zlib.deflateRawSync(Buffer.from(fit));
  const name = Buffer.from('atividade_ACTIVITY.fit');
  const crc = zlib.crc32 ? zlib.crc32(Buffer.from(fit)) : 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc >>> 0, 14); local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(fit.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc >>> 0, 16); central.writeUInt32LE(deflated.length, 20); central.writeUInt32LE(fit.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + deflated.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  const zip = new Uint8Array(Buffer.concat([local, name, deflated, central, name, eocd]));
  assert.ok(isZip(zip));
  const { name: n, bytes } = await extractFitFromZip(zip);
  assert.equal(n, 'atividade_ACTIVITY.fit');
  assert.deepEqual(Buffer.from(bytes), Buffer.from(fit));
});
