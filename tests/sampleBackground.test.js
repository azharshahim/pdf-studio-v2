import { describe, expect, it } from 'vitest';
import { sampleCanvasBackground } from '../src/utils.js';

function fakeCanvas(pixel) {
  return {
    width: 400,
    height: 200,
    style: { width: '400px', height: '200px' },
    getContext: () => ({
      getImageData: (x, y) => ({ data: new Uint8ClampedArray([...pixel(x, y), 255]) }),
    }),
  };
}
const rect = { left: 100, top: 100, width: 80, height: 14 };

describe('sampleCanvasBackground', () => {
  it('papier blanc : blanc', () => {
    expect(sampleCanvasBackground(fakeCanvas(() => [255, 255, 255]), rect)).toBe('#ffffff');
  });

  it('cellule de tableau serrée : texte voisin au-dessus et trait dessous ne grisent pas le fond', () => {
    const c = fakeCanvas((x, y) => {
      if (y >= 90 && y <= 99) return [30, 30, 30]; // texte de l'en-tête juste au-dessus
      if (y >= 116 && y <= 118) return [0, 0, 0]; // bordure du tableau
      if (x > 100 && x < 180 && y > 100 && y < 114) return [20, 20, 20]; // le texte lui-même
      return [255, 255, 255];
    });
    const hex = sampleCanvasBackground(c, rect);
    expect(hex).toBe('#ffffff');
  });

  it('fond coloré uniforme : conservé', () => {
    expect(sampleCanvasBackground(fakeCanvas(() => [255, 240, 200]), rect)).toBe('#fff0c8');
  });
});
