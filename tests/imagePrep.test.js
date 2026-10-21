import { describe, expect, it } from 'vitest';
import { deskewCanvas, enhanceContrast, estimateSkew } from '../src/imagePrep.js';

/** Canvas factice compatible avec les méthodes utilisées par imagePrep. */
function fakeCanvas(width, height, painter) {
  const state = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  const image = { width, height, data: state.data };
  if (painter) painter(image);
  return {
    get width() {
      return state.width;
    },
    set width(v) {
      state.width = v;
      state.data = new Uint8ClampedArray(Math.max(1, v) * Math.max(1, state.height) * 4);
    },
    get height() {
      return state.height;
    },
    set height(v) {
      state.height = v;
      state.data = new Uint8ClampedArray(Math.max(1, state.width) * Math.max(1, v) * 4);
    },
    getContext() {
      return {
        getImageData(_x, _y, w, h) {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const sx = Math.min(state.width - 1, Math.floor((x / w) * state.width));
              const sy = Math.min(state.height - 1, Math.floor((y / h) * state.height));
              const si = (sy * state.width + sx) * 4;
              const di = (y * w + x) * 4;
              data[di] = state.data[si] ?? 255;
              data[di + 1] = state.data[si + 1] ?? 255;
              data[di + 2] = state.data[si + 2] ?? 255;
              data[di + 3] = 255;
            }
          }
          return { width: w, height: h, data };
        },
        putImageData(img, _x, _y) {
          state.data.set(img.data);
        },
        drawImage() {},
        fillRect() {},
        translate() {},
        rotate() {},
        fillStyle: '#fff',
      };
    },
  };
}

function gray(image, fn) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const v = fn(x, y);
      const i = (y * image.width + x) * 4;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
}

describe('imagePrep', () => {
  it('enhanceContrast étire les niveaux de gris', () => {
    const canvas = fakeCanvas(50, 50, (image) =>
      gray(image, (x) => (x < 25 ? 100 : 140))
    );
    enhanceContrast(canvas);
    const out = canvas.getContext().getImageData(0, 0, 50, 50).data;
    const values = new Set();
    for (let i = 0; i < out.length; i += 4) values.add(out[i]);
    expect(values.has(0)).toBe(true);
    expect(values.has(255)).toBe(true);
    // les canaux restent bien gris
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(out[i + 1]);
      expect(out[i + 1]).toBe(out[i + 2]);
    }
  });

  it('estimateSkew renvoie ~0 pour des lignes horizontales', () => {
    const stripes = (image) => gray(image, (_x, y) => (y % 20 < 6 ? 40 : 230));
    globalThis.document = {
      createElement() {
        return fakeCanvas(300, 200, stripes);
      },
    };
    const canvas = fakeCanvas(300, 200, stripes);
    expect(Math.abs(estimateSkew(canvas))).toBeLessThanOrEqual(0.5);
  });

  it('deskewCanvas laisse un document droit inchangé', () => {
    const stripes = (image) => gray(image, (_x, y) => (y % 20 < 6 ? 40 : 230));
    globalThis.document = {
      createElement() {
        return fakeCanvas(120, 90, stripes);
      },
    };
    const canvas = fakeCanvas(120, 90, stripes);
    expect(deskewCanvas(canvas)).toBe(canvas);
  });
});

describe('enhanceContrast sur page presque blanche', () => {
  it('ne noircit pas une page au texte épars', () => {
    const c = fakeCanvas(100, 100, (img) => {
      img.data.fill(255);
      for (let i = 0; i < 40; i++) {
        const p = i * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = 0;
      }
    });
    enhanceContrast(c);
    const out = c.getContext().getImageData(0, 0, 100, 100).data;
    expect(out[4 * 5000]).toBe(255);
  });
});

