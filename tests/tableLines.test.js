import { describe, expect, it } from 'vitest';

// pdf.js importe un worker (?url) : on le neutralise pour tester buildLines seul.
import { vi } from 'vitest';
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({}) }));

const { buildLines } = await import('../src/pdfEngine.js');

const item = (str, x, width, y = 700, size = 6.5) => ({
  str,
  width,
  transform: [size, 0, 0, size, x, y],
  fontName: 'f1',
});

describe('lignes de tableau', () => {
  it('chaque colonne d’un tableau reste une ligne séparée', () => {
    const items = [
      item('Release Date', 100, 36),
      item('Time', 160, 14),
      item('Valid to Date', 220, 40),
      item('Time', 300, 14),
    ];
    const lines = buildLines(items, {}, 1);
    expect(lines.map((l) => l.text)).toEqual(['Release Date', 'Time', 'Valid to Date', 'Time']);
  });

  it('une phrase normale reste en une seule ligne', () => {
    const items = [item('Bonjour', 50, 30, 700, 10), item('le', 84, 8, 700, 10), item('monde', 96, 28, 700, 10)];
    expect(buildLines(items, {}, 1).map((l) => l.text)).toEqual(['Bonjour le monde']);
  });
});
