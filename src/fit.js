// Leitor/escritor FIT de baixo nível.
//
// O arquivo é lido como uma sequência de mensagens "cruas": cada mensagem de
// dados guarda seus bytes originais e aponta para a definição que a descreve.
// Assim, ao exportar, tudo o que não foi editado (campos desconhecidos,
// campos de desenvolvedor, mensagens proprietárias) é preservado byte a byte.

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

export function crc16(bytes, start = 0, end = bytes.length, crc = 0) {
  for (let i = start; i < end; i++) {
    const byte = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf];
  }
  return crc;
}

// Tipos base FIT: tamanho, valor inválido e leitura/escrita.
export const BASE_TYPES = {
  0x00: { name: 'enum', size: 1, invalid: 0xff },
  0x01: { name: 'sint8', size: 1, invalid: 0x7f },
  0x02: { name: 'uint8', size: 1, invalid: 0xff },
  0x83: { name: 'sint16', size: 2, invalid: 0x7fff },
  0x84: { name: 'uint16', size: 2, invalid: 0xffff },
  0x85: { name: 'sint32', size: 4, invalid: 0x7fffffff },
  0x86: { name: 'uint32', size: 4, invalid: 0xffffffff },
  0x07: { name: 'string', size: 1, invalid: 0x00 },
  0x88: { name: 'float32', size: 4, invalid: null },
  0x89: { name: 'float64', size: 8, invalid: null },
  0x0a: { name: 'uint8z', size: 1, invalid: 0x00 },
  0x8b: { name: 'uint16z', size: 2, invalid: 0x0000 },
  0x8c: { name: 'uint32z', size: 4, invalid: 0x00000000 },
  0x0d: { name: 'byte', size: 1, invalid: 0xff },
  0x8e: { name: 'sint64', size: 8, invalid: null },
  0x8f: { name: 'uint64', size: 8, invalid: null },
  0x90: { name: 'uint64z', size: 8, invalid: null },
};

export class FitError extends Error {
  constructor(message, code = 'corrupt') {
    super(message);
    this.name = 'FitError';
    this.code = code;
  }
}

/**
 * Lê um arquivo FIT (ArrayBuffer/Uint8Array). Suporta arquivos encadeados.
 * Retorna { files: [{ header, messages }] }.
 * Cada mensagem: { def, header, bytes, timestamp? } onde `bytes` são os bytes
 * de conteúdo (sem o byte de cabeçalho) e `def` é o objeto de definição.
 */
export function parseFit(input) {
  // Normaliza para Uint8Array "puro" (Buffer do Node compartilha memória em slice()).
  const bytes = ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input);
  const files = [];
  let pos = 0;
  while (pos < bytes.length) {
    // Ignora padding de zeros no fim, se houver.
    if (bytes.length - pos < 12) break;
    const { file, next } = parseOne(bytes, pos);
    files.push(file);
    pos = next;
  }
  if (!files.length) throw new FitError('Arquivo vazio ou não é um arquivo FIT.', 'not_fit');
  return { files };
}

function parseOne(bytes, start) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = bytes[start];
  if (headerSize !== 12 && headerSize !== 14) throw new FitError('Cabeçalho FIT inválido.', 'not_fit');
  if (start + headerSize > bytes.length) throw new FitError('Arquivo FIT truncado.', 'truncated');
  const sig = String.fromCharCode(...bytes.subarray(start + 8, start + 12));
  if (sig !== '.FIT') throw new FitError('Este arquivo não parece ser um arquivo .FIT.', 'not_fit');
  const header = {
    size: headerSize,
    protocolVersion: bytes[start + 1],
    profileVersion: view.getUint16(start + 2, true),
    dataSize: view.getUint32(start + 4, true),
  };
  const dataStart = start + headerSize;
  const dataEnd = dataStart + header.dataSize;
  if (dataEnd + 2 > bytes.length) throw new FitError('Arquivo FIT truncado (tamanho declarado maior que o arquivo).', 'truncated');

  const fileCrc = view.getUint16(dataEnd, true);
  const calcCrc = crc16(bytes, start, dataEnd);
  header.crcOk = fileCrc === calcCrc;

  const localDefs = new Array(16).fill(null);
  const messages = [];
  let lastTimestamp = null;
  let pos = dataStart;

  while (pos < dataEnd) {
    const rh = bytes[pos++];
    if (rh & 0x80) {
      // Cabeçalho com timestamp comprimido.
      const local = (rh >> 5) & 0x03;
      const offset = rh & 0x1f;
      const def = localDefs[local];
      if (!def) throw new FitError(`Mensagem sem definição (tipo local ${local}).`);
      if (lastTimestamp == null) throw new FitError('Timestamp comprimido sem timestamp de referência.');
      let ts = (lastTimestamp & ~0x1f) + offset;
      if (offset < (lastTimestamp & 0x1f)) ts += 0x20;
      lastTimestamp = ts >>> 0;
      const len = def.dataSize;
      messages.push({ def, compressedTimestamp: lastTimestamp, bytes: bytes.slice(pos, pos + len) });
      pos += len;
      continue;
    }
    const local = rh & 0x0f;
    if (rh & 0x40) {
      const hasDev = (rh & 0x20) !== 0;
      const arch = bytes[pos + 1];
      const little = arch === 0;
      const globalNum = little ? view.getUint16(pos + 2, true) : view.getUint16(pos + 2, false);
      const numFields = bytes[pos + 4];
      let p = pos + 5;
      const fields = [];
      let offset = 0;
      for (let i = 0; i < numFields; i++) {
        const f = { num: bytes[p], size: bytes[p + 1], baseType: bytes[p + 2], offset };
        offset += f.size;
        fields.push(f);
        p += 3;
      }
      const devFields = [];
      if (hasDev) {
        const n = bytes[p++];
        for (let i = 0; i < n; i++) {
          devFields.push({ num: bytes[p], size: bytes[p + 1], devIndex: bytes[p + 2], offset });
          offset += bytes[p + 1];
          p += 3;
        }
      }
      const def = { local, little, globalNum, fields, devFields, dataSize: offset };
      def.fieldMap = new Map(fields.map((f) => [f.num, f]));
      localDefs[local] = def;
      pos = p;
      continue;
    }
    const def = localDefs[local];
    if (!def) throw new FitError(`Mensagem sem definição (tipo local ${local}).`);
    const msg = { def, bytes: bytes.slice(pos, pos + def.dataSize) };
    pos += def.dataSize;
    const tsField = def.fieldMap.get(253);
    if (tsField && tsField.size === 4) {
      const ts = readField(msg, 253);
      if (ts != null) lastTimestamp = ts;
    }
    messages.push(msg);
  }
  if (pos !== dataEnd) throw new FitError('Estrutura de mensagens inconsistente.');

  return { file: { header, messages }, next: dataEnd + 2 };
}

function rawGet(view, offset, baseType, little) {
  switch (baseType) {
    case 0x00: case 0x02: case 0x0a: case 0x0d: case 0x07: return view.getUint8(offset);
    case 0x01: return view.getInt8(offset);
    case 0x83: return view.getInt16(offset, little);
    case 0x84: case 0x8b: return view.getUint16(offset, little);
    case 0x85: return view.getInt32(offset, little);
    case 0x86: case 0x8c: return view.getUint32(offset, little);
    case 0x88: return view.getFloat32(offset, little);
    case 0x89: return view.getFloat64(offset, little);
    default: return null;
  }
}

function rawSet(view, offset, baseType, little, value) {
  switch (baseType) {
    case 0x00: case 0x02: case 0x0a: case 0x0d: case 0x07: view.setUint8(offset, value); break;
    case 0x01: view.setInt8(offset, value); break;
    case 0x83: view.setInt16(offset, value, little); break;
    case 0x84: case 0x8b: view.setUint16(offset, value, little); break;
    case 0x85: view.setInt32(offset, value, little); break;
    case 0x86: case 0x8c: view.setUint32(offset, value, little); break;
    case 0x88: view.setFloat32(offset, value, little); break;
    case 0x89: view.setFloat64(offset, value, little); break;
    default: throw new FitError('Tipo base não suportado para escrita.');
  }
}

function msgView(msg) {
  return new DataView(msg.bytes.buffer, msg.bytes.byteOffset, msg.bytes.byteLength);
}

/** Lê o valor bruto (sem escala) de um campo; null se ausente ou inválido. */
export function readField(msg, num) {
  if (num === 253 && msg.compressedTimestamp != null && !msg.def.fieldMap.has(253)) return msg.compressedTimestamp;
  const f = msg.def.fieldMap.get(num);
  if (!f) return null;
  const bt = BASE_TYPES[f.baseType];
  if (!bt || f.size < bt.size || bt.size === 8 && f.baseType !== 0x89) return null;
  const v = rawGet(msgView(msg), f.offset, f.baseType, msg.def.little);
  if (v == null) return null;
  if (bt.invalid !== null && v === bt.invalid) return null;
  if ((f.baseType === 0x88 || f.baseType === 0x89) && !Number.isFinite(v)) return null;
  return v;
}

export function hasField(msg, num) {
  return msg.def.fieldMap.has(num) || (num === 253 && msg.compressedTimestamp != null);
}

/**
 * Escreve um valor bruto num campo existente. Retorna false se o campo não
 * existe na mensagem. Valores fora da faixa são limitados ao máximo válido.
 */
export function writeField(msg, num, value) {
  if (num === 253 && msg.compressedTimestamp != null && !msg.def.fieldMap.has(253)) {
    msg.compressedTimestamp = Math.round(value) >>> 0;
    return true;
  }
  const f = msg.def.fieldMap.get(num);
  if (!f) return false;
  const bt = BASE_TYPES[f.baseType];
  if (!bt || f.size !== bt.size || bt.size === 8) return false;
  let v = value;
  if (value == null) {
    if (bt.invalid === null) return false;
    v = bt.invalid;
  } else if (f.baseType !== 0x88 && f.baseType !== 0x89) {
    v = Math.round(value);
    const max = limits(f.baseType);
    v = Math.min(Math.max(v, max.min), max.max);
  }
  rawSet(msgView(msg), f.offset, f.baseType, msg.def.little, v);
  return true;
}

function limits(baseType) {
  switch (baseType) {
    case 0x00: case 0x02: case 0x0d: return { min: 0, max: 0xfe };
    case 0x0a: return { min: 1, max: 0xff };
    case 0x01: return { min: -0x7f, max: 0x7e };
    case 0x83: return { min: -0x7fff, max: 0x7ffe };
    case 0x84: return { min: 0, max: 0xfffe };
    case 0x8b: return { min: 1, max: 0xffff };
    case 0x85: return { min: -0x7fffffff, max: 0x7ffffffe };
    case 0x86: return { min: 0, max: 0xfffffffe };
    case 0x8c: return { min: 1, max: 0xffffffff };
    default: return { min: -Infinity, max: Infinity };
  }
}

/** Copia uma mensagem (mesma definição, bytes independentes). */
export function cloneMessage(msg) {
  const copy = { def: msg.def, bytes: Uint8Array.prototype.slice.call(msg.bytes) };
  if (msg.compressedTimestamp != null) copy.compressedTimestamp = msg.compressedTimestamp;
  return copy;
}

/**
 * Serializa a estrutura de volta para bytes FIT.
 * Definições são emitidas sempre que uma mensagem usa uma definição diferente
 * da que está ativa no seu tipo local. Mensagens com timestamp comprimido são
 * convertidas em mensagens normais com o campo timestamp explícito.
 */
export function encodeFit(parsed) {
  const chunks = [];
  for (const file of parsed.files) chunks.push(encodeOne(file));
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

const expandedDefs = new WeakMap();

function expandCompressed(msg) {
  let def = expandedDefs.get(msg.def);
  if (!def) {
    const ts = { num: 253, size: 4, baseType: 0x86, offset: 0 };
    const fields = [ts, ...msg.def.fields.map((f) => ({ ...f, offset: f.offset + 4 }))];
    const devFields = msg.def.devFields.map((f) => ({ ...f, offset: f.offset + 4 }));
    def = { ...msg.def, fields, devFields, dataSize: msg.def.dataSize + 4 };
    def.fieldMap = new Map(fields.map((f) => [f.num, f]));
    expandedDefs.set(msg.def, def);
  }
  const bytes = new Uint8Array(def.dataSize);
  new DataView(bytes.buffer).setUint32(0, msg.compressedTimestamp >>> 0, def.little);
  bytes.set(msg.bytes, 4);
  return { def, bytes };
}

function encodeDefinition(def) {
  const hasDev = def.devFields.length > 0;
  const size = 1 + 5 + def.fields.length * 3 + (hasDev ? 1 + def.devFields.length * 3 : 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out[0] = 0x40 | (hasDev ? 0x20 : 0) | def.local;
  out[1] = 0;
  out[2] = def.little ? 0 : 1;
  view.setUint16(3, def.globalNum, def.little);
  out[5] = def.fields.length;
  let p = 6;
  for (const f of def.fields) { out[p++] = f.num; out[p++] = f.size; out[p++] = f.baseType; }
  if (hasDev) {
    out[p++] = def.devFields.length;
    for (const f of def.devFields) { out[p++] = f.num; out[p++] = f.size; out[p++] = f.devIndex; }
  }
  return out;
}

function encodeOne(file) {
  const parts = [];
  const active = new Array(16).fill(null);
  let dataSize = 0;
  for (const original of file.messages) {
    const msg = original.compressedTimestamp != null && !original.def.fieldMap.has(253)
      ? expandCompressed(original)
      : original;
    const def = msg.def;
    if (active[def.local] !== def) {
      const d = encodeDefinition(def);
      parts.push(d);
      dataSize += d.length;
      active[def.local] = def;
    }
    const rec = new Uint8Array(1 + msg.bytes.length);
    rec[0] = def.local;
    rec.set(msg.bytes, 1);
    parts.push(rec);
    dataSize += rec.length;
  }
  const headerSize = file.header.size === 12 ? 12 : 14;
  const out = new Uint8Array(headerSize + dataSize + 2);
  const view = new DataView(out.buffer);
  out[0] = headerSize;
  out[1] = file.header.protocolVersion;
  view.setUint16(2, file.header.profileVersion, true);
  view.setUint32(4, dataSize, true);
  out.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  if (headerSize === 14) view.setUint16(12, crc16(out, 0, 12), true);
  let p = headerSize;
  for (const part of parts) { out.set(part, p); p += part.length; }
  view.setUint16(p, crc16(out, 0, p), true);
  return out;
}
