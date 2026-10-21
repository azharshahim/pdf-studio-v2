import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { detectWatermarks, applyWatermarkChange, looksLikeWatermark, sameWatermark, removeWatermarksFromDoc } from '../src/watermark.js';

const MARK = { angle: 45, size: 60, alpha: 0.3 };

async function sample(viaForm = false) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Bonjour le monde', { x: 60, y: 760, size: 12, font });
  page.drawText('CONFIDENTIEL', { x: 140, y: 300, size: 60, font, color: rgb(0.5, 0.5, 0.5), opacity: 0.3, rotate: degrees(45) });
  if (!viaForm) return doc.save();
  // Même contenu, mais dans un objet de formulaire dessiné par la page finale.
  const bytes = await doc.save();
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const [embedded] = await out.embedPdf(src, [0]);
  out.addPage([595, 842]).drawPage(embedded);
  return out.save();
}

async function pageText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  return tc.items.map((i) => i.str).join(' ');
}

describe('filigranes', () => {
  it('reconnaît un texte incliné ou très pâle', () => {
    expect(looksLikeWatermark(MARK)).toBe(true);
    expect(looksLikeWatermark({ angle: 0, size: 12, alpha: 1 })).toBe(false);
    expect(looksLikeWatermark({ angle: 0, size: 48, alpha: 0.2 })).toBe(true);
    expect(sameWatermark(MARK, { angle: 46, size: 61, alpha: 0.3 })).toBe(true);
    expect(sameWatermark(MARK, { angle: 0, size: 60, alpha: 0.3 })).toBe(false);
  });

  it('supprime le filigrane et garde le texte normal', async () => {
    const bytes = await sample();
    expect(await pageText(bytes)).toContain('CONFIDENTIEL');
    const out = await applyWatermarkChange(bytes, [{ ...MARK, pages: [{ page: 1, x: 0, y: 0 }] }], null);
    const text = await pageText(out);
    expect(text).not.toContain('CONFIDENTIEL');
    expect(text).toContain('Bonjour le monde');
  });

  it('le renommage remplace le texte à la même inclinaison', async () => {
    const bytes = await sample();
    const out = await applyWatermarkChange(bytes, [{ ...MARK, color: [0.5, 0.5, 0.5], pages: [{ page: 1, x: 140, y: 300 }] }], 'COPIE');
    const text = await pageText(out);
    expect(text).toContain('COPIE');
    expect(text).not.toContain('CONFIDENTIEL');
    expect(text).toContain('Bonjour le monde');
  });

  it('traite aussi un filigrane placé dans un objet de formulaire', async () => {
    const bytes = await sample(true);
    expect(await pageText(bytes)).toContain('CONFIDENTIEL');
    const doc = await PDFDocument.load(bytes);
    const n = removeWatermarksFromDoc(doc, [MARK]);
    expect(n).toBeGreaterThan(0);
    const text = await pageText(await doc.save());
    expect(text).not.toContain('CONFIDENTIEL');
    expect(text).toContain('Bonjour le monde');
  });

  it('détecte le filigrane (texte, inclinaison, pages) sans confondre le texte normal', async () => {
    for (const viaForm of [false, true]) {
      const bytes = await sample(viaForm);
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
      const marks = await detectWatermarks({ numPages: doc.numPages, getPage: (n) => doc.getPage(n) });
      expect(marks).toHaveLength(1);
      expect(marks[0].text).toBe('CONFIDENTIEL');
      expect(Math.round(marks[0].angle)).toBe(45);
      expect(marks[0].pages[0].page).toBe(1);
      // Le résultat de la détection sert directement à la suppression.
      const out = await applyWatermarkChange(bytes, marks, null);
      expect(await pageText(out)).not.toContain('CONFIDENTIEL');
    }
  });
});
