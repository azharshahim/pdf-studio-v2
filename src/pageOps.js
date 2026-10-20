/**
 * Opérations de pages (rotation, suppression, déplacement, insertion, fusion,
 * extraction). Chaque fonction renvoie de nouveaux octets PDF ; l'application
 * recharge ensuite le document pour rester cohérente (éditions et OCR repartent
 * de zéro, après confirmation de l'utilisateur).
 */

async function loadLib() {
  return import('pdf-lib');
}

export async function rotatePage(bytes, pageNo, delta) {
  const { PDFDocument, degrees } = await loadLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(pageNo - 1);
  if (!page) throw new Error('Page introuvable');
  const current = page.getRotation().angle || 0;
  page.setRotation(degrees((current + delta + 360) % 360));
  return doc.save();
}

export async function deletePage(bytes, pageNo) {
  const { PDFDocument } = await loadLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (doc.getPageCount() <= 1) throw new Error('Impossible de supprimer la seule page du document');
  doc.removePage(pageNo - 1);
  return doc.save();
}

export async function movePage(bytes, from, to) {
  if (from === to) return bytes;
  const { PDFDocument, PDFName, PDFArray, PDFDict } = await loadLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const count = doc.getPageCount();
  if (from < 1 || from > count || to < 1 || to > count) throw new Error('Déplacement invalide');
  try {
    // Arbre de pages plat (cas courant) : on réordonne les références, ce qui
    // préserve annotations et champs de formulaire.
    const pages = doc.catalog.lookup(PDFName.of('Pages'), PDFDict);
    const kids = pages.lookup(PDFName.of('Kids'), PDFArray);
    if (kids.size() !== count) throw new Error('arbre imbriqué');
    const ref = kids.get(from - 1);
    kids.remove(from - 1);
    kids.insert(to - 1, ref);
    return doc.save();
  } catch {
    // Repli : reconstruction par copie dans l'ordre souhaité.
    const order = Array.from({ length: count }, (_, i) => i);
    const [moved] = order.splice(from - 1, 1);
    order.splice(to - 1, 0, moved);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(doc, order);
    copied.forEach((p) => out.addPage(p));
    return out.save();
  }
}

export async function insertBlankPage(bytes, at, size) {
  const { PDFDocument } = await loadLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const reference = doc.getPage(Math.min(Math.max(at - 1, 0), doc.getPageCount() - 1));
  const [width, height] = size || (reference ? [reference.getWidth(), reference.getHeight()] : [595, 842]);
  doc.insertPage(at - 1, [width, height]);
  return doc.save();
}

export async function mergePdfs(bytes, otherBytes) {
  const { PDFDocument } = await loadLib();
  const base = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const other = await PDFDocument.load(otherBytes, { ignoreEncryption: true });
  const pages = await base.copyPages(other, other.getPageIndices());
  for (const page of pages) base.addPage(page);
  return base.save();
}

/**
 * Extrait une sélection de pages.
 * @param {number[]} indices indices 1-based dans l'ordre souhaité
 */
export async function extractPages(bytes, indices) {
  const { PDFDocument } = await loadLib();
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(
    source,
    indices.map((n) => n - 1)
  );
  for (const page of pages) out.addPage(page);
  return out.save();
}

/** Analyse « 1-3,5,8-9 » en liste d'indices 1-based. */
export function parsePageRanges(input, maxPage) {
  const result = [];
  const parts = String(input || '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) continue;
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!start || start > maxPage) continue;
    const lo = Math.min(start, end);
    const hi = Math.min(Math.max(start, end), maxPage);
    for (let n = lo; n <= hi; n++) result.push(n);
  }
  return [...new Set(result)].sort((a, b) => a - b);
}
