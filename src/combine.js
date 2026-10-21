/**
 * Combiner plusieurs PDF en un seul, dans l'ordre choisi.
 */

/** Assemble les PDF (octets) dans l'ordre donné ; renvoie les octets du PDF combiné. */
export async function combinePdfs(parts) {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

/** Nombre de pages d'un PDF. */
export async function countPages(bytes) {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/** Prochain nom « Classeur N.pdf » libre parmi `names`. */
export function nextCombinedName(names = [], base = 'Classeur') {
  const used = new Set(names.map((n) => String(n).toLowerCase()));
  let i = 1;
  while (used.has(`${base} ${i}.pdf`.toLowerCase()) || used.has(`${base}${i}.pdf`.toLowerCase())) i++;
  return `${base}${i}.pdf`;
}
