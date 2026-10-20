import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { exportPdf } from '../src/exporter.js';

async function makeSource() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Ancien texte à remplacer', { x: 40, y: 220, size: 16, font, color: rgb(0, 0, 0) });
  page.drawText('Ligne conservée', { x: 40, y: 180, size: 12, font, color: rgb(0, 0, 0) });
  return doc.save();
}

async function extractText(bytes) {
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: './node_modules/pdfjs-dist/standard_fonts/',
    isEvalSupported: false,
  }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(' ') + '\n';
  }
  return text;
}

describe('exportPdf', () => {
  it('produit un PDF valide', async () => {
    const source = await makeSource();
    const { bytes } = await exportPdf({ sourceBytes: source, edits: [], ocrPages: [] });
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('remplace réellement le texte (suppression du flux)', async () => {
    const source = await makeSource();
    const edits = [
      {
        id: 'e1',
        page: 1,
        kind: 'edit',
        bbox: { x: 36, y: 214, w: 210, h: 20 },
        baseline: 220,
        text: 'Nouveau texte',
        font: 'Helvetica',
        size: 16,
        bold: false,
        italic: false,
        color: '#111827',
        bg: '#ffffff',
        fit: false,
      },
    ];
    const { bytes, stats } = await exportPdf({ sourceBytes: source, edits, ocrPages: [], redactMode: 'stream' });
    const text = await extractText(bytes);
    expect(text).toContain('Nouveau texte');
    expect(text).not.toContain('Ancien texte');
    expect(text).toContain('Ligne conservée');
    expect(stats.removedPages).toContain(1);
  });

  it('ajoute une couche OCR extractible', async () => {
    const source = await makeSource();
    const ocrPages = [
      {
        pageNo: 1,
        ocr: {
          lines: [{ text: 'Texte reconnu par OCR', bbox: { x: 40, y: 100, w: 160, h: 14 } }],
          words: [],
        },
      },
    ];
    const { bytes } = await exportPdf({ sourceBytes: source, edits: [], ocrPages });
    const text = await extractText(bytes);
    expect(text).toContain('Texte reconnu par OCR');
  });

  it('conserve le mode masque sans retirer le texte', async () => {
    const source = await makeSource();
    const edits = [
      {
        id: 'e2',
        page: 1,
        kind: 'edit',
        bbox: { x: 36, y: 214, w: 210, h: 20 },
        baseline: 220,
        text: 'Masqué',
        font: 'Helvetica',
        size: 16,
        color: '#111827',
        bg: '#ffffff',
        fit: false,
      },
    ];
    const { bytes } = await exportPdf({ sourceBytes: source, edits, ocrPages: [], redactMode: 'mask' });
    const text = await extractText(bytes);
    expect(text).toContain('Ancien texte');
    expect(text).toContain('Masqué');
  });
});
