import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { combinePdfs, countPages, nextCombinedName } from '../src/combine.js';

async function make(texts) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of texts) doc.addPage([300, 200]).drawText(t, { x: 20, y: 100, size: 14, font });
  return doc.save();
}

async function texts(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) out.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(' '));
  return out;
}

describe('combiner des PDF', () => {
  it('garde l’ordre choisi et toutes les pages', async () => {
    const a = await make(['A1']);
    const b = await make(['B1', 'B2']);
    const c = await make(['C1']);
    const out = await combinePdfs([b, c, a]);
    expect(await countPages(out)).toBe(4);
    expect(await texts(out)).toEqual(['B1', 'B2', 'C1', 'A1']);
  });

  it('propose le prochain nom libre', () => {
    expect(nextCombinedName([])).toBe('Classeur1.pdf');
    expect(nextCombinedName(['Classeur1.pdf', 'autre.pdf'])).toBe('Classeur2.pdf');
    expect(nextCombinedName(['classeur 1.pdf', 'Classeur2.pdf'])).toBe('Classeur3.pdf');
  });
});
