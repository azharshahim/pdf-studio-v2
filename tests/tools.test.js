import { describe, expect, it } from 'vitest';
import { reorderPages } from '../src/pageOps.js';
import { createSignaturePad, typedSignature, loadSignatures } from '../src/signature.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function makeDoc(pages = 3) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Page ${i}`, { x: 30, y: 340, size: 18, font });
  }
  return doc.save();
}

async function pageTexts(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: './node_modules/pdfjs-dist/standard_fonts/',
    isEvalSupported: false,
  }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out.push(content.items.map((item) => item.str).join(' ').trim());
  }
  return out;
}

describe('reorderPages', () => {
  it('réordonne les pages selon la liste fournie', async () => {
    const source = await makeDoc(3);
    const out = await reorderPages(source, [3, 1, 2]);
    const texts = await pageTexts(out);
    expect(texts).toEqual(['Page 3', 'Page 1', 'Page 2']);
  });

  it('complète les pages manquantes à la fin', async () => {
    const source = await makeDoc(3);
    const out = await reorderPages(source, [2]);
    const texts = await pageTexts(out);
    expect(texts).toEqual(['Page 2', 'Page 1', 'Page 3']);
  });
});

describe('signature', () => {
  it('enregistre et relit la bibliothèque locale', () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    expect(loadSignatures()).toEqual([]);
  });

  it('rend une signature tapée en image', () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        font: '',
        measureText: () => ({ width: 120 }),
        scale() {},
        fillText() {},
        set fillStyle(v) {},
        set textBaseline(v) {},
      }),
      toDataURL: () => 'data:image/png;base64,AAAA',
    };
    const original = globalThis.document;
    globalThis.document = {
      createElement: (tag) => (tag === 'canvas' ? { ...canvas, getContext: canvas.getContext } : {}),
    };
    try {
      const result = typedSignature('A. Shahim', 'cursive');
      expect(result.src).toMatch(/^data:image\/png/);
      expect(result.ratio).toBeGreaterThan(1);
    } finally {
      globalThis.document = original;
    }
  });

  it('expose un pad de dessin avec les méthodes attendues', () => {
    const listeners = {};
    const ctx = {
      setTransform() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      clearRect() {},
    };
    const canvas = {
      width: 300,
      height: 150,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 150 }),
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
      toDataURL: () => 'data:image/png;base64,BBBB',
    };
    const pad = createSignaturePad(canvas);
    pad.resize();
    expect(pad.isEmpty()).toBe(true);
    listeners.pointerdown({ preventDefault() {}, clientX: 10, clientY: 10, pointerId: 1 });
    expect(pad.isEmpty()).toBe(false);
    expect(pad.toDataURL()).toContain('data:image/png');
    pad.clear();
    expect(pad.isEmpty()).toBe(true);
  });
});
