import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { exportPdf } from '../src/exporter.js';

const hasPoppler = spawnSync('pdftoppm', ['-v']).status !== null && !spawnSync('pdftoppm', ['-v']).error;

/** Rend la page 1 en niveaux de gris (PGM) et renvoie { w, h, px }. */
function render(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xf-'));
  const pdf = path.join(dir, 'a.pdf');
  fs.writeFileSync(pdf, bytes);
  const r = spawnSync('pdftoppm', ['-r', '72', '-gray', '-f', '1', '-l', '1', pdf, path.join(dir, 'o')]);
  const out = fs.readdirSync(dir).find((f) => f.endsWith('.pgm'));
  if (r.status !== 0 || !out) throw new Error('pdftoppm a échoué');
  const buf = fs.readFileSync(path.join(dir, out));
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(buf.subarray(0, 40).toString('latin1'));
  return { w: +m[1], h: +m[2], px: buf.subarray(m[0].length) };
}

function darkIn(img, x, y, w, h) {
  let n = 0;
  for (let j = Math.max(0, y); j < Math.min(img.h, y + h); j++)
    for (let i = Math.max(0, x); i < Math.min(img.w, x + w); i++) if (img.px[j * img.w + i] < 140) n++;
  return n;
}

async function blank() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Ancien', { x: 40, y: 150, size: 16, font: f, color: rgb(0, 0, 0) });
  return doc.save();
}

const baseEdit = (over = {}) => ({
  id: 'e1',
  page: 1,
  kind: 'edit',
  bbox: { x: 36, y: 144, w: 90, h: 20 },
  baseline: 150,
  text: 'Nouveau 127',
  font: 'Helvetica',
  size: 16,
  bold: false,
  italic: false,
  color: '#000000',
  bg: '#ffffff',
  fit: false,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!hasPoppler)('fidélité de l’export (rendu Poppler)', () => {
  const stubFonts = () =>
    vi.stubGlobal('fetch', async (url) => {
      const file = String(url).replace(/^.*fonts\//, 'public/fonts/');
      if (!fs.existsSync(file)) return { ok: false };
      const buf = fs.readFileSync(file);
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    });

  it('une police du catalogue est réellement dessinée dans le PDF', async () => {
    stubFonts();
    const { bytes } = await exportPdf({ sourceBytes: await blank(), edits: [baseEdit({ font: 'Roboto' })], ocrPages: [] });
    const img = render(bytes);
    // zone du texte : y PDF 144-164 → haut de page 200 : lignes 36-56
    expect(darkIn(img, 36, 34, 100, 26)).toBeGreaterThan(60);
  });

  it('espacement des caractères et échelle horizontale élargissent le texte', async () => {
    const width = async (over) => {
      const { bytes } = await exportPdf({ sourceBytes: await blank(), edits: [baseEdit({ text: 'IIIIII', bg: 'none', ...over })], ocrPages: [] });
      const img = render(bytes);
      let right = 0;
      for (let x = 0; x < img.w; x++) if (darkIn(img, x, 34, 1, 26) > 0) right = x;
      return right;
    };
    const plain = await width({});
    expect(await width({ charSpacing: 3 })).toBeGreaterThan(plain + 10);
    expect(await width({ hScale: 200 })).toBeGreaterThan(plain + 10);
  });

  it('un scan à couche cachée est masqué avant le nouveau texte', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    // « image » du scan : aplat noir sous la zone éditée
    page.drawRectangle({ x: 36, y: 144, width: 90, height: 20, color: rgb(0, 0, 0) });
    const { bytes } = await exportPdf({
      sourceBytes: await doc.save(),
      edits: [baseEdit({ text: ' ', hiddenLayer: true })],
      ocrPages: [],
    });
    const img = render(bytes);
    expect(darkIn(img, 40, 38, 80, 14)).toBeLessThan(10);
  });

  it('rotation d’un rectangle et note PDF réelle', async () => {
    const { bytes, stats } = await exportPdf({
      sourceBytes: await blank(),
      edits: [],
      ocrPages: [],
      objects: [
        { id: 'r', page: 1, type: 'rect', bbox: { x: 100, y: 60, w: 100, h: 10 }, color: '#000000', width: 2, rotation: 90 },
        { id: 'n', page: 1, type: 'note', bbox: { x: 20, y: 20, w: 18, h: 18 }, color: '#facc15', text: 'Commentaire é€ مرحبا' },
      ],
    });
    expect(stats.markup).toBe(2);
    const doc = await PDFDocument.load(bytes);
    const annots = doc.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
    // rectangle 100×10 pivoté de 90° autour de son centre (150,65) → vertical
    const img = render(bytes);
    expect(darkIn(img, 144, 86, 12, 6)).toBeGreaterThan(5); // haut du rectangle vertical
    expect(darkIn(img, 104, 131, 8, 8)).toBeLessThan(3); // extrémité gauche d'origine vide
  });
});
