// Gera um FIT sintético de natação em piscina (25 m) usando o SDK oficial da Garmin.
import { Encoder, Profile, Utils } from '@garmin/fitsdk';

export const START = 1100000000; // timestamp FIT
export const POOL = 25;

/**
 * sets: [{ lengths: [segundos...], rest: segundos }]
 * Retorna Uint8Array.
 */
export function makeSwimFit(sets = defaultSets()) {
  const enc = new Encoder();
  const M = Profile.MesgNum;
  enc.onMesg(M.FILE_ID, { type: 'activity', manufacturer: 'garmin', product: 4565, timeCreated: START, serialNumber: 1234 });
  enc.onMesg(M.EVENT, { timestamp: START, event: 'timer', eventType: 'start' });

  const lengths = [];
  const laps = [];
  let t = START;
  let lengthIndex = 0;
  const records = [];
  let dist = 0;

  const addLap = (lapLengths, isRest) => {
    const start = t;
    const first = lengthIndex;
    let strokes = 0;
    for (const sec of lapLengths) {
      const s = isRest ? 0 : Math.round(sec / 2.3);
      strokes += s;
      lengths.push({
        timestamp: Math.round(t + sec), startTime: Math.round(t), totalElapsedTime: sec, totalTimerTime: sec,
        messageIndex: lengthIndex++, event: 'length', eventType: 'stop',
        lengthType: isRest ? 'idle' : 'active',
        ...(isRest ? {} : { totalStrokes: s, avgSpeed: POOL / sec, swimStroke: 'freestyle', avgSwimmingCadence: Math.round((s * 60) / sec) }),
      });
      for (let k = 0; k < sec; k += 5) records.push({ timestamp: Math.round(t + k), heartRate: 120, distance: dist });
      t += sec;
      if (!isRest) dist += POOL;
    }
    const total = lapLengths.reduce((a, b) => a + b, 0);
    const d = isRest ? 0 : POOL * lapLengths.length;
    laps.push({
      timestamp: Math.round(t), startTime: start, totalElapsedTime: total, totalTimerTime: total, totalDistance: d,
      totalCycles: strokes, numLengths: isRest ? 0 : lapLengths.length, numActiveLengths: isRest ? 0 : lapLengths.length,
      firstLengthIndex: first, avgSpeed: d / total, maxSpeed: isRest ? 0 : Math.max(...lapLengths.map((x) => POOL / x)),
      enhancedAvgSpeed: d / total, enhancedMaxSpeed: isRest ? 0 : Math.max(...lapLengths.map((x) => POOL / x)),
      messageIndex: laps.length, event: 'lap', eventType: 'stop', sport: 'swimming', subSport: 'lapSwimming',
      swimStroke: isRest ? undefined : 'freestyle', avgCadence: isRest ? 0 : Math.round((strokes * 60) / total),
      lapTrigger: 'manual',
    });
  };

  for (const set of sets) {
    addLap(set.lengths, false);
    if (set.rest) addLap([set.rest], true);
  }

  for (const r of records) enc.onMesg(M.RECORD, r);
  for (const l of lengths) enc.onMesg(M.LENGTH, l);
  for (const l of laps) enc.onMesg(M.LAP, l);
  enc.onMesg(M.EVENT, { timestamp: Math.round(t), event: 'timer', eventType: 'stopAll' });

  const swimTime = laps.filter((l) => l.totalDistance > 0).reduce((a, l) => a + l.totalTimerTime, 0);
  const totalTime = laps.reduce((a, l) => a + l.totalTimerTime, 0);
  const totalStrokes = laps.reduce((a, l) => a + l.totalCycles, 0);
  const active = laps.reduce((a, l) => a + l.numActiveLengths, 0);
  enc.onMesg(M.SESSION, {
    timestamp: Math.round(t), startTime: START, totalElapsedTime: totalTime, totalTimerTime: totalTime, totalDistance: dist,
    totalCycles: totalStrokes, avgSpeed: dist / swimTime, enhancedAvgSpeed: dist / swimTime,
    maxSpeed: Math.max(...laps.map((l) => l.maxSpeed)), enhancedMaxSpeed: Math.max(...laps.map((l) => l.maxSpeed)),
    firstLapIndex: 0, numLaps: laps.length, numLengths: active, numActiveLengths: active, poolLength: POOL, poolLengthUnit: 'metric',
    avgStrokeCount: totalStrokes / active, sport: 'swimming', subSport: 'lapSwimming', event: 'session', eventType: 'stop',
    messageIndex: 0, avgCadence: Math.round((totalStrokes * 60) / swimTime),
  });
  enc.onMesg(M.ACTIVITY, { timestamp: Math.round(t), totalTimerTime: totalTime, numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop', localTimestamp: Math.round(t) - 10800 });
  return enc.close();
}

export function defaultSets() {
  return [
    { lengths: [25, 26, 25, 27], rest: 60 },       // 100 m normal
    { lengths: [26, 52, 25, 26], rest: 45 },       // 4 piscinas gravadas, uma longa demais (virada perdida) => era 125 m
    { lengths: [24, 25, 12, 13, 25], rest: 30 },   // 5 piscinas, uma virada a mais => era 100 m
    { lengths: [25, 25, 25, 25] },                 // sem descanso no fim
  ];
}
