/**
 * Sauvegarde / restauration de tous les documents (fichier unique .pdfstudio).
 * Format : "PDFSTUDIO1\n" + longueur du manifeste (4 octets, big-endian)
 *          + manifeste JSON (UTF-8) + octets des PDF mis bout à bout.
 */
const MAGIC = 'PDFSTUDIO1\n';

const META_FIELDS = ['key', 'name', 'numPages', 'edits', 'ocrPages', 'markup', 'createdAt', 'updatedAt'];

/** @param {Array<object>} records enregistrements IndexedDB (avec `bytes`) */
export function buildBackup(records) {
  const enc = new TextEncoder();
  const docs = [];
  const chunks = [];
  let offset = 0;
  for (const r of records) {
    if (!r?.bytes) continue;
    const bytes = new Uint8Array(r.bytes);
    const meta = {};
    for (const f of META_FIELDS) if (r[f] !== undefined) meta[f] = r[f];
    meta.offset = offset;
    meta.length = bytes.byteLength;
    docs.push(meta);
    chunks.push(bytes);
    offset += bytes.byteLength;
  }
  const manifest = enc.encode(JSON.stringify({ version: 1, createdAt: Date.now(), docs }));
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, manifest.byteLength, false);
  return new Blob([enc.encode(MAGIC), head, manifest, ...chunks], { type: 'application/octet-stream' });
}

/**
 * @param {ArrayBuffer} buffer contenu d'un fichier .pdfstudio
 * @returns {Array<object>} enregistrements prêts à être restaurés (avec `bytes`)
 */
export function parseBackup(buffer) {
  const data = new Uint8Array(buffer);
  const dec = new TextDecoder();
  const magic = dec.decode(data.subarray(0, MAGIC.length));
  if (magic !== MAGIC) throw new Error('not-a-backup');
  const manifestLen = new DataView(data.buffer, data.byteOffset + MAGIC.length, 4).getUint32(0, false);
  const start = MAGIC.length + 4;
  if (start + manifestLen > data.length) throw new Error('corrupt-backup');
  let manifest;
  try {
    manifest = JSON.parse(dec.decode(data.subarray(start, start + manifestLen)));
  } catch {
    throw new Error('corrupt-backup');
  }
  const base = start + manifestLen;
  const out = [];
  for (const d of manifest.docs || []) {
    const from = base + d.offset;
    const to = from + d.length;
    if (!d.key || !(d.length > 0) || to > data.length) continue;
    const { offset, length, ...meta } = d;
    out.push({ ...meta, size: length, bytes: data.slice(from, to).buffer });
  }
  return out;
}

/**
 * Fusionne des enregistrements sauvegardés avec ceux déjà présents : un
 * document déjà là et plus récent (ou identique) est conservé.
 * @returns {{ restore: object[], skipped: number }}
 */
export function planRestore(incoming, existing) {
  const have = new Map(existing.map((d) => [d.key, d]));
  const restore = [];
  let skipped = 0;
  for (const rec of incoming) {
    const cur = have.get(rec.key);
    if (cur && cur.hasBytes && (cur.updatedAt || 0) >= (rec.updatedAt || 0)) {
      skipped++;
      continue;
    }
    restore.push(rec);
  }
  return { restore, skipped };
}
