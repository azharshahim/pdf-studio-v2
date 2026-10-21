import { describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '' }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({}), OPS: {} }));
const { hasInvisibleText } = await import('../src/pdfEngine.js');

const ops = { transform: 12, paintImageXObject: 85, save: 10, restore: 11, setTextRenderingMode: 38, showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47 };

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

  it('texte écrit sous une image qui couvre la page : caché', () => {
    const fn = [44, 10, 12, 85, 11];
    const args = [['x'], [], [600, 0, 0, 800, 0, 0], ['img'], []];
    expect(hasInvisibleText(fn, args, ops, 600 * 800)).toBe(true);
  });
  it('texte au-dessus d’une image de fond : visible', () => {
    const fn = [10, 12, 85, 11, 44];
    const args = [[], [600, 0, 0, 800, 0, 0], ['img'], [], ['x']];
    expect(hasInvisibleText(fn, args, ops, 600 * 800)).toBe(false);
  });
  it('petite image (logo) après le texte : visible', () => {
    const fn = [44, 10, 12, 85, 11];
    const args = [['x'], [], [50, 0, 0, 50, 0, 0], ['img'], []];
    expect(hasInvisibleText(fn, args, ops, 600 * 800)).toBe(false);
  });
});
