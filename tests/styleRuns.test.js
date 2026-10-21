import { describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({}), OPS: {} }));

const { buildLines } = await import('../src/pdfEngine.js');

const item = (str, x, width, fontName, size = 7) => ({ str, width, transform: [size, 0, 0, size, x, 700], fontName });
const fonts = {
  B: { family: 'Helvetica', bold: true, italic: false },
  R: { family: 'Helvetica', bold: false, italic: false },
};

describe('style mixte sur une ligne', () => {
  it('un premier mot gras ne rend pas toute la ligne grasse', () => {
    const lines = buildLines([item('N° SS', 50, 20, 'B'), item('1905080891 52', 73, 50, 'R')], {}, 1, fonts);
    expect(lines.map((l) => [l.text, l.bold])).toEqual([
      ['N° SS', true],
      ['1905080891 52', false],
    ]);
  });

  it('même style, autre police (sous-ensemble) : une seule ligne', () => {
    const lines = buildLines([item('Bonjour', 50, 26, 'R'), item('monde', 78, 22, 'R2')], {}, 1, { ...fonts, R2: fonts.R });
    expect(lines.map((l) => l.text)).toEqual(['Bonjour monde']);
  });

  it('un mot plus grand ne grossit pas le reste de la ligne', () => {
    const lines = buildLines([item('TITRE', 50, 40, 'R', 12), item('suite', 93, 18, 'R', 7)], {}, 1, fonts);
    expect(lines.map((l) => [l.text, Math.round(l.fontSize)])).toEqual([
      ['TITRE', 12],
      ['suite', 7],
    ]);
  });
});
