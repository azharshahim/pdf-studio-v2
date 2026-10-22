import { describe, it, expect } from 'vitest';
import { groupOcrWords } from '../src/ocrGrouping.js';

function word(text, x0, x1, { y0 = 100, y1 = 120, confidence = 94, ratio } = {}) {
  const w = { text, bbox: { x0, y0, x1, y1 }, confidence };
  if (typeof ratio === 'number') w.ratio = ratio;
  return w;
}

describe('Regroupement OCR des montants et devises (sans coupure)', () => {
  it('garde "2 147,48 €" dans un seul bloc même avec espace des milliers large et densité différente sur €', () => {
    const segs = groupOcrWords([
      word('2', 200, 212, { ratio: 0.13 }),
      word('147,48', 236, 294, { ratio: 0.15 }), // gap = 24 px (> 0.85 * 20)
      word('€', 320, 336, { ratio: 0.25 }), // gap = 26 px + ratio élevé (gras apparent)
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('2 147,48 €');
    expect(segs[0].bbox).toEqual({ x0: 200, y0: 100, x1: 336, y1: 120 });
  });

  it('garde "2147,48€" collé dans un seul bloc sans insérer d’espace parasite', () => {
    // Cas 1 : Tesseract sépare les chiffres et € collés (gap = 1 px)
    const splitTight = groupOcrWords([
      word('2147,48', 200, 268, { ratio: 0.14 }),
      word('€', 269, 283, { ratio: 0.24 }),
    ]);
    expect(splitTight).toHaveLength(1);
    expect(splitTight[0].text).toBe('2147,48€');

    // Cas 2 : Tesseract renvoie déjà un jeton unique
    const singleToken = groupOcrWords([word('2147,48€', 200, 283)]);
    expect(singleToken).toHaveLength(1);
    expect(singleToken[0].text).toBe('2147,48€');
  });

  it('garde "1.250,00 EUR" dans un seul bloc (points de milliers + code ISO)', () => {
    const segs = groupOcrWords([
      word('1.250,00', 300, 378, { ratio: 0.14 }),
      word('EUR', 404, 442, { ratio: 0.22 }), // gap = 26 px + graisse différente
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('1.250,00 EUR');

    // Variante où l'OCR isole "1." et "250,00"
    const splitDot = groupOcrWords([
      word('1.', 300, 316),
      word('250,00', 318, 378),
      word('EUR', 402, 440),
    ]);
    expect(splitDot).toHaveLength(1);
    expect(splitDot[0].text).toBe('1.250,00 EUR');
  });

  it('garde "-35,20 €" dans un seul bloc même quand le signe moins est un petit glyphe isolé', () => {
    const segs = groupOcrWords([
      // Le tiret "-" fait seulement 3 px de haut au milieu de la ligne !
      word('-', 180, 188, { y0: 109, y1: 112, ratio: 0.35 }),
      word('35,20', 191, 238, { y0: 100, y1: 120, ratio: 0.15 }),
      word('€', 260, 275, { y0: 100, y1: 120, ratio: 0.24 }),
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('-35,20 €');
    expect(segs[0].bbox.x0).toBe(180);
    expect(segs[0].bbox.x1).toBe(275);
  });

  it('continue de séparer proprement le libellé de gauche et les colonnes distinctes d’un tableau', () => {
    const segs = groupOcrWords([
      word('Total', 40, 82),
      word('TTC', 90, 124),
      // Grande séparation de colonne vers la droite (x0 = 360)
      word('2', 360, 372),
      word('147,48', 394, 452),
      word('€', 476, 492),
    ]);
    expect(segs.map((s) => s.text)).toEqual(['Total TTC', '2 147,48 €']);
  });
});
