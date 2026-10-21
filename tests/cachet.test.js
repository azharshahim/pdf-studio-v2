import { describe, expect, it } from 'vitest';
import { opaqueBounds, removeLightBackground } from '../src/cachet.js';

const px = (r, g, b, a = 255) => [r, g, b, a];

describe('cachet importé', () => {
  it('le papier blanc devient transparent, l’encre reste', () => {
    const data = new Uint8ClampedArray([...px(255, 255, 255), ...px(30, 60, 200), ...px(240, 240, 235)]);
    removeLightBackground(data);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(255);
    expect(data[11]).toBe(0);
    // la teinte de l'encre n'est pas modifiée
    expect([data[4], data[5], data[6]]).toEqual([30, 60, 200]);
  });

  it('adoucit les bords gris clair au lieu de les couper net', () => {
    const data = new Uint8ClampedArray([...px(200, 200, 200)]);
    removeLightBackground(data, 225);
    expect(data[3]).toBeGreaterThan(0);
    expect(data[3]).toBeLessThan(255);
  });

  it('rogne les marges transparentes', () => {
    const w = 4;
    const h = 3;
    const data = new Uint8ClampedArray(w * h * 4);
    data[(1 * w + 2) * 4 + 3] = 255;
    data[(2 * w + 1) * 4 + 3] = 255;
    expect(opaqueBounds(data, w, h)).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });

  it('image entièrement transparente : garde le cadre entier', () => {
    expect(opaqueBounds(new Uint8ClampedArray(2 * 2 * 4), 2, 2)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });
});
