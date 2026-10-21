import { describe, expect, it } from 'vitest';
import { inkStats, looksBold, otsuThreshold, pickFontByWidth } from '../src/scanStyle.js';

// Zone 40×12 : fond blanc, 3 « traits » verticaux de largeur `w`.
function strokes(w) {
  const W = 40;
  const H = 12;
  const g = new Uint8ClampedArray(W * H).fill(250);
  for (const x0 of [5, 15, 25]) for (let y = 1; y < 11; y++) for (let x = x0; x < x0 + w; x++) g[y * W + x] = 20;
  return { g, W, H };
}

describe('style d’un scan', () => {
  it('seuil d’Otsu entre l’encre et le papier', () => {
    const { g } = strokes(2);
    const t = otsuThreshold(g);
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(250);
  });

  it('mesure la largeur d’un trait et la hauteur d’encre', () => {
    const { g, W, H } = strokes(2);
    const s = inkStats(g, W, H);
    expect(s.stem).toBe(2);
    expect(s.inkTop).toBe(1);
    expect(s.inkBottom).toBe(10);
  });

  it('trait fin = normal, trait épais = gras', () => {
    const thin = inkStats(...Object.values(strokes(1)));
    const thick = inkStats(...Object.values(strokes(3)));
    expect(looksBold(thin.stem, 10)).toBe(false);
    expect(looksBold(thick.stem, 10)).toBe(true);
  });

  it('choisit la police dont la largeur colle à la ligne', () => {
    const widths = { Arimo: 100, Lato: 92, Courier: 150 };
    const measure = (font) => widths[font];
    const pick = pickFontByWidth(measure, 'texte', 10, 93, ['Arimo', 'Lato', 'Courier']);
    expect(pick.font).toBe('Lato');
    expect(pick.scale).toBeCloseTo(93 / 92, 3);
  });

  it('rien à choisir sans mesure valide', () => {
    expect(pickFontByWidth(() => 0, 'x', 10, 50, ['A'])).toBeNull();
    expect(inkStats(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

import { maskBox, maskIoU } from '../src/scanStyle.js';

describe('comparaison de masques', () => {
  it('boîte englobante et ressemblance', () => {
    const a = new Uint8Array(16);
    a[5] = 1;
    a[6] = 1;
    expect(maskBox(a, 4, 4)).toEqual({ x0: 1, y0: 1, x1: 2, y1: 1 });
    expect(maskBox(new Uint8Array(4), 2, 2)).toBeNull();
    expect(maskIoU(a, a)).toBe(1);
    const b = new Uint8Array(16);
    b[5] = 1;
    expect(maskIoU(a, b)).toBe(0.5);
  });
});
