import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { exportPdf } from '../src/exporter.js';

async function makeSource() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Ancien texte', { x: 40, y: 220, size: 16, font, color: rgb(0, 0, 0) });
  return doc.save();
}

function edit(text, font, bold = false, italic = false) {
  return {
    id: 'e1',
    page: 1,
    kind: 'edit',
    bbox: { x: 36, y: 214, w: 210, h: 20 },
    baseline: 220,
    text,
    font,
    size: 16,
    bold,
    italic,
    color: '#111827',
    bg: '#ffffff',
    fit: false,
  };
}

async function fontNames(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const names = [];
  for (const obj of pdf.context.enumerateIndirectObjects().map(([, o]) => o)) {
    const base = obj?.dict?.get?.(pdf.context.obj('BaseFont'));
    if (base) names.push(String(base));
  }
  return names.join(' ');
}

afterEach(() => vi.unstubAllGlobals());

describe('export avec les polices du catalogue', () => {
  const stub = () =>
    vi.stubGlobal('fetch', async (url) => {
      const file = String(url).replace(/^.*fonts\//, 'public/fonts/');
      if (!fs.existsSync(file)) return { ok: false };
      const buf = fs.readFileSync(file);
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    });

  it('intègre la police choisie (gras italique) et garde les accents', async () => {
    stub();
    const text = 'Relevé de situation € œ';
    const { bytes } = await exportPdf({
      sourceBytes: await makeSource(),
      edits: [edit(text, 'Roboto', true, true)],
      ocrPages: [],
    });
    const names = await fontNames(bytes);
    expect(names).toMatch(/Roboto/);
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    expect(content.items.map((i) => i.str).join(' ')).toContain('Relevé de situation');
  });

  it('replie sur Noto Sans pour un alphabet absent de la police', async () => {
    stub();
    const { bytes } = await exportPdf({
      sourceBytes: await makeSource(),
      edits: [edit('Bonjour مرحبا', 'Lato')],
      ocrPages: [],
    });
    const names = await fontNames(bytes);
    expect(names).toMatch(/Noto/);
  });
});
