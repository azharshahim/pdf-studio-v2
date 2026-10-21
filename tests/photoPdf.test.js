import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildPdfFromJpegs, layoutPage } from '../src/photoPdf.js';

// Plus petit JPEG valide (1×1 px).
const JPEG_1PX = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
  ),
  (c) => c.charCodeAt(0)
);

describe('photos → PDF', () => {
  it('A4 portrait : la photo est centrée et proportionnelle', () => {
    const l = layoutPage(3000, 4000, { size: 'a4', margin: 20 });
    expect(l.pageW).toBeCloseTo(595.28, 1);
    expect(l.pageH).toBeCloseTo(841.89, 1);
    expect(l.w / l.h).toBeCloseTo(3000 / 4000, 4);
    expect(l.x).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(l.x + l.w).toBeLessThanOrEqual(l.pageW - 20 + 1e-6);
    expect(l.y + l.h).toBeLessThanOrEqual(l.pageH - 20 + 1e-6);
  });

  it('une photo paysage donne une page paysage', () => {
    const l = layoutPage(4000, 3000, { size: 'a4' });
    expect(l.pageW).toBeGreaterThan(l.pageH);
  });

  it('« taille de la photo » : pas de marge', () => {
    const l = layoutPage(800, 600, { size: 'fit' });
    expect(l.x).toBe(0);
    expect(l.w).toBe(l.pageW);
    expect(l.h).toBe(l.pageH);
  });

  it('construit un PDF avec une page par photo, dans l’ordre', async () => {
    const bytes = await buildPdfFromJpegs([
      { jpeg: JPEG_1PX, width: 1, height: 2 },
      { jpeg: JPEG_1PX, width: 2, height: 1 },
      { jpeg: JPEG_1PX, width: 1, height: 1 },
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const [a, b] = [doc.getPage(0).getSize(), doc.getPage(1).getSize()];
    expect(a.height).toBeGreaterThan(a.width);
    expect(b.width).toBeGreaterThan(b.height);
  });
});
