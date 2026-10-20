import { describe, expect, it } from 'vitest';
import { computeEditZoom, centerAxis, isLineReadable } from '../src/zoomView.js';

describe('zoom d’édition', () => {
  it('ne zoome pas quand le texte est déjà lisible', () => {
    // 12 pt à l'échelle 1,5 → 18 px à l'écran
    expect(computeEditZoom({ fontSize: 12, scale: 1.5, mobile: true, maxZoom: 3 })).toBeNull();
  });

  it('zoome juste assez pour atteindre 16 px sur téléphone', () => {
    const zoom = computeEditZoom({ fontSize: 8, scale: 0.6, mobile: true, maxZoom: 3 });
    expect(zoom).toBeCloseTo(2, 5);
    expect(8 * zoom).toBeCloseTo(16, 5);
  });

  it('ne dépasse jamais le zoom maximal et n’applique jamais un zoom inférieur', () => {
    expect(computeEditZoom({ fontSize: 4, scale: 0.3, mobile: true, maxZoom: 3 })).toBe(3);
    expect(computeEditZoom({ fontSize: 40, scale: 1, mobile: true, maxZoom: 3 })).toBeNull();
  });

  it('garde le zoom courant sur ordinateur, sauf si la ligne dépasse', () => {
    expect(computeEditZoom({ fontSize: 6, scale: 1, mobile: false, maxZoom: 3 })).toBeNull();
    expect(computeEditZoom({ fontSize: 6, scale: 1, mobile: false, maxZoom: 3, fits: false })).toBeNull();
  });

  it('détecte la lisibilité à 15 px', () => {
    expect(isLineReadable(12, 1.2)).toBe(false);
    expect(isLineReadable(12, 1.3)).toBe(true);
  });
});

describe('centrage', () => {
  it('centre un élément plus étroit que la vue', () => {
    // 300 + 20 − 195 = 125 : le milieu de l'élément tombe au milieu de la vue.
    expect(centerAxis({ start: 300, size: 40, view: 390, margin: 14 })).toBe(125);
  });

  it('aligne le début d’un élément trop large sans le couper', () => {
    // 600 px pour 390 px de vue : on cale le bord gauche à 14 px de marge.
    expect(centerAxis({ start: 250, size: 600, view: 390, margin: 14 })).toBe(236);
  });

  it('ne renvoie jamais une position négative', () => {
    expect(centerAxis({ start: 4, size: 20, view: 390, margin: 14 })).toBe(0);
  });
});
