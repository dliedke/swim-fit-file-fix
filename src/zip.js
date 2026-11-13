// Extração mínima de ZIP (para o "Exportar original" do Garmin Connect, que
// entrega o .fit dentro de um .zip). Usa DecompressionStream nativo.

function zipError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function isZip(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Retorna { name, bytes } do primeiro arquivo .fit dentro do zip. */
export async function extractFitFromZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Localiza o "end of central directory".
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw zipError('Arquivo .zip inválido.', 'zip_invalid');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.fit$/i.test(name)) continue;
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + compSize);
    if (method === 0) return { name: name.split('/').pop(), bytes: data.slice() };
    if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const out = new Uint8Array(await new Response(stream).arrayBuffer());
      return { name: name.split('/').pop(), bytes: out };
    }
    throw zipError('Compressão do .zip não suportada. Extraia o arquivo .fit e envie-o diretamente.', 'zip_method');
  }
  throw zipError('Nenhum arquivo .fit encontrado dentro do .zip.', 'zip_no_fit');
}
