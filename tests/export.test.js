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

/* ───────────── Annotations, signatures, tampons — export fidèle ───────────── */

async function streamOf(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages()[0].node.Contents().toString();
}

describe('exportPdf — annotations et objets', () => {
  it('dessine un surlignage, un rectangle et un tracé libre', async () => {
    const source = await makeSource();
    const { bytes, stats } = await exportPdf({
      sourceBytes: source,
      edits: [],
      ocrPages: [],
      objects: [
        { id: 'h', page: 1, type: 'highlight', bbox: { x: 40, y: 200, w: 120, h: 14 }, color: '#fde047' },
        { id: 'r', page: 1, type: 'rect', bbox: { x: 40, y: 120, w: 80, h: 40 }, color: '#111827', width: 2 },
        { id: 'i', page: 1, type: 'ink', points: [{ x: 10, y: 10 }, { x: 30, y: 40 }, { x: 60, y: 20 }], color: '#e11d48', width: 3 },
      ],
    });
    expect(stats.markup).toBe(3);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const stream = doc.getPages()[0].node.Contents().toString();
    expect(stream.length).toBeGreaterThan(0);
    // le PDF grandit par rapport à un export sans objets
    const plain = await exportPdf({ sourceBytes: source, edits: [], ocrPages: [] });
    expect(bytes.length).toBeGreaterThan(plain.bytes.length);
  });

  it('dessine un tampon texte et une date', async () => {
    const source = await makeSource();
    const { bytes, stats } = await exportPdf({
      sourceBytes: source,
      edits: [],
      ocrPages: [],
      objects: [
        { id: 's', page: 1, type: 'stamp', text: 'APPROUVE', color: '#059669', bbox: { x: 200, y: 250, w: 120, h: 40 } },
        { id: 'd', page: 1, type: 'date', text: '20/10/2026', color: '#111827', bbox: { x: 200, y: 180, w: 80, h: 16 } },
      ],
    });
    expect(stats.markup).toBe(2);
    const text = await extractText(bytes);
    expect(text).toContain('APPROUVE');
    expect(text).toContain('20/10/2026');
  });

  it('ignore proprement un objet sans géométrie', async () => {
    const source = await makeSource();
    const { bytes, stats } = await exportPdf({
      sourceBytes: source,
      edits: [],
      ocrPages: [],
      objects: [{ id: 'x', page: 1, type: 'highlight' }, { id: 'y', page: 9, type: 'rect', bbox: { x: 0, y: 0, w: 4, h: 4 } }],
    });
    expect(stats.markup).toBeUndefined();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});
