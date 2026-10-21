import { describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({}), OPS: {} }));
const { hasInvisibleText } = await import('../src/pdfEngine.js');

const ops = { save: 10, restore: 11, setTextRenderingMode: 38, showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47 };

describe('texte invisible (couche cachée des scans)', () => {
  it('détecte du texte affiché en mode 3', () => {
    expect(hasInvisibleText([38, 44], [[3], ['x']], ops)).toBe(true);
  });
  it('texte normal : non', () => {
    expect(hasInvisibleText([44, 45], [['a'], ['b']], ops)).toBe(false);
    expect(hasInvisibleText([38, 44], [[0], ['x']], ops)).toBe(false);
  });
  it('le mode est restauré par Q', () => {
    expect(hasInvisibleText([10, 38, 11, 44], [[], [3], [], ['x']], ops)).toBe(false);
  });
});
