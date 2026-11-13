// Textos da interface em português e inglês.
// O idioma vem do navegador (pt* → português, qualquer outro → inglês)
// e pode ser trocado pelo usuário (fica salvo neste navegador).

export const LINKS = {
  garmin: 'https://connect.garmin.com/app/import-data',
  strava: 'https://www.strava.com/upload/select',
};

const pt = {
  locale: 'pt-BR',
  title: 'Corrigir Natação FIT',
  metaDescription: 'Corrija o tempo e a distância das séries de um treino de natação (.FIT) e exporte o arquivo corrigido. Tudo roda no navegador.',
  heading: 'Corrigir natação',
  lead: 'Ajuste o tempo e a distância das séries do seu treino de natação e baixe o arquivo corrigido. O arquivo é processado só no seu navegador — nada é enviado para servidor nenhum.',
  dropAria: 'Escolher arquivo FIT',
  dropMain: '<strong>Arraste o arquivo .FIT aqui</strong> ou clique para escolher',
  dropHint: 'Garmin Connect: atividade → ⚙️ → “Exportar original” (vem em .zip; pode soltar o .zip aqui mesmo)',
  openAnother: 'Abrir outro arquivo',
  themeGroup: 'Tema',
  themeLight: 'Tema claro',
  themeSystem: 'Seguir o sistema',
  themeDark: 'Tema escuro',
  compensate: 'Ao mudar o tempo de uma série, <strong>compensar no descanso seguinte</strong> <span class="muted">(o restante do treino mantém o horário; desmarque para empurrar tudo que vem depois)</span>',
  colSet: 'Série',
  colDistance: 'Distância',
  colLengths: 'Piscinas',
  colTime: 'Tempo',
  colPace: 'Ritmo',
  colStrokes: 'Braçadas',
  colSwolf: 'SWOLF',
  resetAll: 'Desfazer tudo',
  download: 'Baixar FIT corrigido',
  helpTitle: 'Como funciona e como reenviar',
  help: [
    '<strong>Distância:</strong> é ajustada em múltiplos do tamanho da piscina. Se uma piscina do relógio está claramente longa demais (virada não detectada), ela é dividida ao meio; se está curta demais (virada a mais), é unida à vizinha. Fora isso, o tempo e as braçadas da série são distribuídos igualmente entre as piscinas.',
    '<strong>Tempo:</strong> as piscinas e a frequência cardíaca da série são esticadas/encolhidas proporcionalmente. Com a compensação ligada, o descanso seguinte absorve a diferença.',
    'São recalculados: distância e tempo totais, ritmo/velocidade média e máxima, número de piscinas, cadência, SWOLF e braçadas por piscina (série e treino). Todo o resto do arquivo (FC, calorias, dados do relógio) é preservado.',
    `<strong>Garmin Connect:</strong> apague a atividade original e depois importe o arquivo corrigido em <a href="${LINKS.garmin}" target="_blank" rel="noopener">connect.garmin.com/app/import-data</a>. Se a original não for apagada, ele recusa por ser duplicada.`,
    `<strong>Strava:</strong> apague a atividade original e envie o arquivo em <a href="${LINKS.strava}" target="_blank" rel="noopener">strava.com/upload/select</a>.`,
  ],
  footer: 'Feito para corrigir os erros de contagem do relógio na piscina. <a href="https://github.com/dliedke/swim-fit-file-fix" target="_blank" rel="noopener">Código aberto</a>.',

  rest: 'Descanso',
  strokes: { 0: 'Livre', 1: 'Costas', 2: 'Peito', 3: 'Borboleta', 4: 'Educativo', 5: 'Misto', 6: 'Medley', 7: 'Medley', 8: 'Rimo' },
  pool: (n, u) => `Piscina de ${n} ${u}`,
  ariaDistance: (n) => `Distância da série ${n}`,
  ariaLengths: (n) => `Piscinas da série ${n}`,
  ariaTime: (n) => `Tempo da série ${n}`,
  undoLap: 'Desfazer alterações desta série',
  showLengths: 'Ver piscinas registradas pelo relógio',
  noLengths: 'Sem piscinas registradas.',
  lengthsAsRecorded: 'Piscinas como o relógio gravou (original):',
  strokesShort: 'br.',
  idle: 'parado',
  total: 'Total',
  cardDistance: 'Distância',
  cardTotalTime: 'Tempo total',
  cardSwimTime: 'Tempo nadando',
  cardPace: (u) => `Ritmo médio /100${u}`,
  cardLengths: 'Piscinas',
  warnCrc: 'O arquivo original tem checksum inválido (pode estar corrompido). O arquivo exportado terá um checksum novo e válido.',
  warnNotSwim: 'Esta atividade não parece ser de natação. A edição funciona, mas os recálculos foram pensados para natação.',
  warnOpenWater: 'Natação em águas abertas: a distância é livre (sem piscinas) e a distância acumulada dos registros é ajustada proporcionalmente.',
  timeFormat: 'Use o formato m:ss ou m:ss.d (ex.: 3:42.5)',
  restZeroed: (n, rest) => `O descanso após a série ${n} foi zerado; os ${rest} restantes empurram o resto do treino.`,
  readError: (msg) => `Não foi possível ler o arquivo: ${msg}`,
  exportError: (msg) => `Erro ao gerar o arquivo: ${msg}`,
  checkFailed: 'a verificação da distância total falhou',
  fileSuffix: '_corrigido',
  exported: (n, dist, time) => `Arquivo gerado com ${n} série${n > 1 ? 's' : ''} corrigida${n > 1 ? 's' : ''}: ${dist} em ${time}.`,
  exportedNoChange: 'Nenhuma alteração feita — o arquivo baixado é idêntico ao original.',
  evenSpread: (list) => `${list.length > 1 ? `Nas séries ${list.join(', ')}` : `Na série ${list[0]}`}, o tempo e as braçadas foram distribuídos igualmente entre as piscinas.`,
  uploadHint: 'Apague a atividade original e envie o arquivo corrigido:',
  uploadGarmin: 'Enviar ao Garmin Connect',
  uploadStrava: 'Enviar ao Strava',
  errors: {
    not_fit: 'este arquivo não parece ser um arquivo .FIT.',
    truncated: 'o arquivo FIT está incompleto (truncado).',
    corrupt: 'o arquivo FIT está corrompido.',
    no_laps: 'o arquivo não contém séries (voltas). É um arquivo de atividade?',
    zip_invalid: 'arquivo .zip inválido.',
    zip_method: 'compressão do .zip não suportada. Extraia o arquivo .fit e envie-o diretamente.',
    zip_no_fit: 'nenhum arquivo .fit encontrado dentro do .zip.',
  },
};

const en = {
  locale: 'en-US',
  title: 'Swim FIT Fixer',
  metaDescription: 'Fix the time and distance of the sets in a swim workout (.FIT) and export the corrected file. Everything runs in your browser.',
  heading: 'Swim FIT fixer',
  lead: 'Adjust the time and distance of the sets in your swim workout and download the corrected file. The file is processed only in your browser — nothing is uploaded to any server.',
  dropAria: 'Choose FIT file',
  dropMain: '<strong>Drop your .FIT file here</strong> or click to choose',
  dropHint: 'Garmin Connect: activity → ⚙️ → “Export Original” (it comes as a .zip; you can drop the .zip right here)',
  openAnother: 'Open another file',
  themeGroup: 'Theme',
  themeLight: 'Light theme',
  themeSystem: 'Follow system',
  themeDark: 'Dark theme',
  compensate: 'When changing a set’s time, <strong>offset it in the following rest</strong> <span class="muted">(the rest of the workout keeps its timing; uncheck to push everything after it)</span>',
  colSet: 'Set',
  colDistance: 'Distance',
  colLengths: 'Lengths',
  colTime: 'Time',
  colPace: 'Pace',
  colStrokes: 'Strokes',
  colSwolf: 'SWOLF',
  resetAll: 'Undo all',
  download: 'Download fixed FIT',
  helpTitle: 'How it works and how to re-upload',
  help: [
    '<strong>Distance:</strong> adjusted in multiples of the pool length. If a recorded length is clearly too long (missed turn), it is split in half; if it is clearly too short (extra turn), it is merged with its neighbour. Otherwise, the set’s time and strokes are spread evenly across its lengths.',
    '<strong>Time:</strong> the set’s lengths and heart rate are stretched/shrunk proportionally. With the offset option on, the following rest absorbs the difference.',
    'Recalculated: total distance and time, average/max pace and speed, number of lengths, cadence, SWOLF and strokes per length (per set and for the workout). Everything else in the file (HR, calories, device data) is kept as is.',
    `<strong>Garmin Connect:</strong> delete the original activity, then import the fixed file at <a href="${LINKS.garmin}" target="_blank" rel="noopener">connect.garmin.com/app/import-data</a>. If the original is not deleted, it is rejected as a duplicate.`,
    `<strong>Strava:</strong> delete the original activity and upload the file at <a href="${LINKS.strava}" target="_blank" rel="noopener">strava.com/upload/select</a>.`,
  ],
  footer: 'Made to fix your watch’s lap-counting mistakes in the pool. <a href="https://github.com/dliedke/swim-fit-file-fix" target="_blank" rel="noopener">Open source</a>.',

  rest: 'Rest',
  strokes: { 0: 'Freestyle', 1: 'Backstroke', 2: 'Breaststroke', 3: 'Butterfly', 4: 'Drill', 5: 'Mixed', 6: 'IM', 7: 'IM', 8: 'Rimo' },
  pool: (n, u) => `${n} ${u} pool`,
  ariaDistance: (n) => `Distance of set ${n}`,
  ariaLengths: (n) => `Lengths of set ${n}`,
  ariaTime: (n) => `Time of set ${n}`,
  undoLap: 'Undo changes to this set',
  showLengths: 'Show lengths recorded by the watch',
  noLengths: 'No lengths recorded.',
  lengthsAsRecorded: 'Lengths as recorded by the watch (original):',
  strokesShort: 'str.',
  idle: 'idle',
  total: 'Total',
  cardDistance: 'Distance',
  cardTotalTime: 'Total time',
  cardSwimTime: 'Swim time',
  cardPace: (u) => `Avg pace /100${u}`,
  cardLengths: 'Lengths',
  warnCrc: 'The original file has an invalid checksum (it may be corrupted). The exported file will get a new, valid checksum.',
  warnNotSwim: 'This activity does not look like a swim. Editing works, but the recalculations are designed for swimming.',
  warnOpenWater: 'Open-water swim: distance is free (no pool lengths) and the cumulative distance of the records is scaled proportionally.',
  timeFormat: 'Use the m:ss or m:ss.d format (e.g. 3:42.5)',
  restZeroed: (n, rest) => `The rest after set ${n} was reduced to zero; the remaining ${rest} pushes the rest of the workout.`,
  readError: (msg) => `Could not read the file: ${msg}`,
  exportError: (msg) => `Error generating the file: ${msg}`,
  checkFailed: 'total distance check failed',
  fileSuffix: '_fixed',
  exported: (n, dist, time) => `File generated with ${n} corrected set${n > 1 ? 's' : ''}: ${dist} in ${time}.`,
  exportedNoChange: 'No changes made — the downloaded file is identical to the original.',
  evenSpread: (list) => `In set${list.length > 1 ? 's' : ''} ${list.join(', ')}, time and strokes were spread evenly across the lengths.`,
  uploadHint: 'Delete the original activity and upload the fixed file:',
  uploadGarmin: 'Upload to Garmin Connect',
  uploadStrava: 'Upload to Strava',
  errors: {
    not_fit: 'this does not look like a .FIT file.',
    truncated: 'the FIT file is incomplete (truncated).',
    corrupt: 'the FIT file is corrupted.',
    no_laps: 'the file has no sets (laps). Is it an activity file?',
    zip_invalid: 'invalid .zip file.',
    zip_method: 'unsupported .zip compression. Extract the .fit file and open it directly.',
    zip_no_fit: 'no .fit file found inside the .zip.',
  },
};

export const LANGS = { pt, en };
const STORAGE_KEY = 'swim-fit-lang';

export function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch { /* armazenamento indisponível */ }
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const l of prefs) {
    const code = String(l).toLowerCase();
    if (code.startsWith('pt')) return 'pt';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}

export function saveLang(lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignora */ }
}

/** Mensagem de erro traduzida (erros com `code` conhecido) ou a original. */
export function errorText(dict, err) {
  return (err && err.code && dict.errors[err.code]) || err?.message || String(err);
}
