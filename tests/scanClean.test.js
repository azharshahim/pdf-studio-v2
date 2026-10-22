import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  CLEAN_PRESETS,
  CLEAN_QUALITY_TIERS,
  applyAdaptiveBw,
  applyCleanPreset,
  applyEnhance,
  applyGrayscale,
  applyLighten,
  applyMagic,
  applyNoShadow,
  applyOriginal,
  attenuateImageWatermark,
  boxBlur2D,
  computeLuminance,
  decodeDataUrl,
  detectScannedPages,
  encodeCleanedCanvas,
  morphClose2D,
  resolveCleanQuality,
  slidingExtremum1D,
} from '../src/scanClean.js';

function makeImage(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = painter(x, y);
      const p = (y * width + x) * 4;
      if (typeof c === 'number') {
        data[p] = c;
        data[p + 1] = c;
        data[p + 2] = c;
        data[p + 3] = 255;
      } else {
        data[p] = c[0];
        data[p + 1] = c[1];
        data[p + 2] = c[2];
        data[p + 3] = c[3] ?? 255;
      }
    }
  }
  return { width, height, data };
}

function lumAt(img, x, y) {
  const p = (y * img.width + x) * 4;
  return Math.round(0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2]);
}

describe('scanClean — primitives sur petits tableaux de pixels', () => {
  it('expose les 8 préréglages attendus et ne mute jamais la source', () => {
    expect(CLEAN_PRESETS).toEqual([
      'original',
      'lighten',
      'enhance',
      'magic',
      'nowatermark',
      'noshadow',
      'bw',
      'grayscale',
    ]);
    const src = makeImage(16, 16, (x, y) => (x === 8 || y === 8 ? 25 : 210));
    const snapshot = new Uint8ClampedArray(src.data);
    for (const preset of CLEAN_PRESETS) {
      const res = applyCleanPreset(src, preset);
      expect(res.width).toBe(16);
      expect(res.height).toBe(16);
      expect(res.data).not.toBe(src.data);
    }
    expect([...src.data]).toEqual([...snapshot]);
  });

  it('slidingExtremum1D et morphClose2D effacent un trait sombre fin sur fond clair', () => {
    const line = new Uint8Array([240, 240, 240, 20, 240, 240, 240]);
    const max1d = slidingExtremum1D(line, line.length, 1, true);
    expect(max1d[3]).toBe(240);
    const min1d = slidingExtremum1D(max1d, line.length, 1, false);
    expect([...min1d]).toEqual([240, 240, 240, 240, 240, 240, 240]);

    const img = makeImage(21, 21, (x, y) => (x === 10 && y >= 4 && y <= 16 ? 18 : 230));
    const closed = morphClose2D(computeLuminance(img), 21, 21, 2);
    expect(closed[10 * 21 + 10]).toBe(230);
    const blurred = boxBlur2D(closed, 21, 21, 2, 2);
    expect(blurred[10 * 21 + 10]).toBe(230);
  });

  it('Original retourne les pixels exacts sans modification', () => {
    const src = makeImage(10, 8, (x, y) => [x * 20, y * 25, 120, 255]);
    const out = applyOriginal(src);
    expect([...out.data]).toEqual([...src.data]);
  });

  it('Éclaircir blanchit un fond terne tout en gardant le texte sombre', () => {
    const src = makeImage(30, 30, (x, y) => {
      if (y === 15 && x >= 5 && x <= 24) return [30, 30, 35];
      return [215, 210, 198];
    });
    const out = applyLighten(src);
    expect(lumAt(out, 2, 2)).toBeGreaterThanOrEqual(250);
    expect(lumAt(out, 12, 15)).toBeLessThan(40);
  });

  it('Améliorer augmente le contraste et la netteté des contours', () => {
    const src = makeImage(32, 32, (x, y) => {
      if (x >= 12 && x <= 19 && y >= 12 && y <= 19) return 75;
      return 205;
    });
    const out = applyEnhance(src);
    // Le contraste global (fond - encre) augmente nettement
    const contrastBefore = lumAt(src, 2, 2) - lumAt(src, 15, 15);
    const contrastAfter = lumAt(out, 2, 2) - lumAt(out, 15, 15);
    expect(contrastAfter).toBeGreaterThan(contrastBefore + 50);
  });

  it('Magique supprime ombre, tache et teinte jaunâtre tout en gardant le texte net', () => {
    // Feuille jaunie avec forte ombre à gauche (130 -> 240), une tache sombre douce, et du texte noir
    const src = makeImage(60, 40, (x, y) => {
      const shadow = 135 + Math.round((x / 59) * 105);
      const stain = Math.hypot(x - 42, y - 28) < 8 ? -28 : 0;
      const paperR = Math.min(255, shadow + stain);
      const paperG = Math.min(255, shadow - 4 + stain);
      const paperB = Math.min(255, shadow - 16 + stain);
      // Deux traits fins de texte : l'un dans l'ombre (x=10), l'autre dans la zone claire (x=45)
      if ((y === 14 && x >= 6 && x <= 18) || (y === 14 && x >= 38 && x <= 52)) {
        return [Math.round(paperR * 0.16), Math.round(paperG * 0.16), Math.round(paperB * 0.16)];
      }
      return [paperR, paperG, paperB];
    });

    const out = applyMagic(src);
    // Le fond dans l'ombre (x=4, y=4), sur la tache (x=42, y=28) et à droite (x=55, y=4) devient blanc propre
    expect(lumAt(out, 4, 4)).toBeGreaterThanOrEqual(245);
    expect(lumAt(out, 42, 28)).toBeGreaterThanOrEqual(240);
    expect(lumAt(out, 55, 4)).toBeGreaterThanOrEqual(250);
    // La dominante jaune du fond disparaît (canaux équilibrés)
    const pBg = (4 * out.width + 55) * 4;
    expect(Math.abs(out.data[pBg] - out.data[pBg + 2])).toBeLessThanOrEqual(5);
    // Le texte reste sombre aussi bien dans l'ombre qu'en pleine lumière
    expect(lumAt(out, 10, 14)).toBeLessThan(65);
    expect(lumAt(out, 44, 14)).toBeLessThan(65);
  });

  it('attenuateImageWatermark atténue un filigrane gris d’image selon l’intensité sans effacer le texte', () => {
    const src = makeImage(50, 50, (x, y) => {
      // Grande bande grise de filigrane au centre (luminance ~192) sur papier blanc (248)
      const inWatermark = x >= 12 && x <= 38 && y >= 15 && y <= 35;
      const bg = inWatermark ? 192 : 248;
      // Trait de texte noir traversant à la fois le papier et le filigrane
      if (y === 25 && x >= 5 && x <= 44) return 24;
      return bg;
    });

    const none = attenuateImageWatermark(src, { intensity: 0 });
    expect(lumAt(none, 20, 20)).toBe(192);

    const low = attenuateImageWatermark(src, { intensity: 0.25 });
    const high = attenuateImageWatermark(src, { intensity: 0.85 });

    // Plus l'intensité monte, plus la zone de filigrane se rapproche du blanc
    expect(lumAt(low, 20, 20)).toBeGreaterThan(198);
    expect(lumAt(high, 20, 20)).toBeGreaterThan(lumAt(low, 20, 20));
    expect(lumAt(high, 20, 20)).toBeGreaterThanOrEqual(244);

    // Le texte noir traversant le filigrane reste bien noir dans les deux cas
    expect(lumAt(low, 25, 25)).toBeLessThan(55);
    expect(lumAt(high, 25, 25)).toBeLessThan(60);
  });

  it('Pas d’ombre corrige un fort gradient d’éclairage de prise de vue', () => {
    const src = makeImage(50, 30, (x, y) => {
      const illum = 110 + Math.round((x / 49) * 135);
      if (y === 15 && x >= 8 && x <= 42) return Math.round(illum * 0.18);
      return illum;
    });
    const out = applyNoShadow(src);
    // Écart d'éclairage gauche/droite ramené à presque zéro
    expect(Math.abs(lumAt(out, 4, 4) - lumAt(out, 46, 4))).toBeLessThan(15);
    expect(lumAt(out, 4, 4)).toBeGreaterThan(225);
    expect(lumAt(out, 12, 15)).toBeLessThan(70);
  });

  it('Noir et blanc (Sauvola) binarise proprement en 0 et 255 même sous une ombre', () => {
    const src = makeImage(48, 32, (x, y) => {
      const bg = x < 24 ? 135 : 235;
      if (y === 16 && x >= 6 && x <= 42) return Math.round(bg * 0.22);
      return bg;
    });
    const out = applyAdaptiveBw(src);
    const values = new Set();
    for (let i = 0; i < out.data.length; i += 4) {
      values.add(out.data[i]);
      expect(out.data[i]).toBe(out.data[i + 1]);
      expect(out.data[i + 1]).toBe(out.data[i + 2]);
    }
    expect([...values].every((v) => v === 0 || v === 255)).toBe(true);
    // Papier blanc des deux côtés, texte noir des deux côtés
    expect(lumAt(out, 4, 4)).toBe(255);
    expect(lumAt(out, 40, 4)).toBe(255);
    expect(lumAt(out, 12, 16)).toBe(0);
    expect(lumAt(out, 36, 16)).toBe(0);
  });

  it('Niveaux de gris convertit une image colorée en R = G = B', () => {
    const src = makeImage(12, 12, (x) => (x < 6 ? [220, 40, 60] : [30, 120, 240]));
    const out = applyGrayscale(src);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(out.data[i + 1]);
      expect(out.data[i + 1]).toBe(out.data[i + 2]);
      expect(out.data[i + 3]).toBe(255);
    }
    expect(out.data[0]).not.toBe(out.data[6 * 4]);
  });

  it('decodeDataUrl décode un PNG/JPEG base64 hors réseau', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    const { bytes, mime } = decodeDataUrl(url);
    expect(mime).toBe('image/png');
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('detectScannedPages distingue une page texte native d’une page image scannée', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // Page 1 : texte pur
    const p1 = doc.addPage([400, 400]);
    p1.drawText('Document numérique natif', { x: 40, y: 320, size: 16, font });
    // Page 2 : image couvrant la page (1×1 PNG étiré sur 400×400)
    const png1x1 = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      ),
      (c) => c.charCodeAt(0)
    );
    const img = await doc.embedPng(png1x1);
    const p2 = doc.addPage([400, 400]);
    p2.drawImage(img, { x: 0, y: 0, width: 400, height: 400 });

    const bytes = await doc.save();
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const scans = await detectScannedPages({
      numPages: pdf.numPages,
      getPage: (n) => pdf.getPage(n),
    });
    expect(scans).toEqual([2]);
  });

  it('exportPdf remplace l’image de la page nettoyée tout en gardant la couche OCR au même endroit', async () => {
    const { exportPdf } = await import('../src/exporter.js');
    const doc = await PDFDocument.create();
    const png1x1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const rawPng = decodeDataUrl(png1x1).bytes;
    const embedded = await doc.embedPng(rawPng);
    const p = doc.addPage([595, 842]);
    p.drawImage(embedded, { x: 0, y: 0, width: 595, height: 842 });
    const sourceBytes = new Uint8Array(await doc.save());

    const ocrLines = [
      { text: 'ATELIER DU NORD', bbox: { x: 52, y: 740, w: 180, h: 18 } },
      { text: 'Facture 2026-0418', bbox: { x: 400, y: 740, w: 130, h: 14 } },
    ];
    const res = await exportPdf({
      sourceBytes,
      edits: [],
      ocrPages: [{ pageNo: 1, ocr: { lines: ocrLines } }],
      cleanedPages: {
        1: { preset: 'magic', dataUrl: png1x1 },
      },
    });
    expect(res.stats.cleanedPages).toEqual([1]);

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const outDoc = await pdfjs.getDocument({ data: new Uint8Array(res.bytes), useSystemFonts: true }).promise;
    const outPage = await outDoc.getPage(1);
    const tc = await outPage.getTextContent();
    const fullText = tc.items.map((i) => i.str).join(' ');
    expect(fullText).toContain('ATELIER DU NORD');
    expect(fullText).toContain('Facture 2026-0418');
    // Vérifie la position verticale conservée (~740 pt)
    const headerItem = tc.items.find((i) => i.str.includes('ATELIER'));
    expect(headerItem).toBeDefined();
    expect(Math.abs(headerItem.transform[5] - 740)).toBeLessThan(8);
  });

  it('buildBackup / parseBackup conserve cleanedPages dans la sauvegarde .pdfstudio', async () => {
    const { buildBackup, parseBackup } = await import('../src/backup.js');
    const blob = buildBackup([
      {
        key: 'scan1',
        name: 'facture.pdf',
        bytes: new Uint8Array([37, 80, 68, 70]).buffer,
        numPages: 1,
        edits: [],
        ocrPages: [],
        markup: [],
        cleanedPages: { 1: { preset: 'magic', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } },
        createdAt: 10,
        updatedAt: 20,
      },
    ]);
    const restored = parseBackup(await blob.arrayBuffer());
    expect(restored[0].cleanedPages[1].preset).toBe('magic');
  });

  it('CLEAN_QUALITY_TIERS garde le JPEG 0,88 en standard et règle économique / standard / haute', () => {
    expect(CLEAN_QUALITY_TIERS.standard).toEqual({ id: 'standard', maxSide: 2200, jpegQuality: 0.88 });
    expect(CLEAN_QUALITY_TIERS.eco.maxSide).toBeLessThan(CLEAN_QUALITY_TIERS.standard.maxSide);
    expect(CLEAN_QUALITY_TIERS.eco.jpegQuality).toBeLessThan(CLEAN_QUALITY_TIERS.standard.jpegQuality);
    expect(CLEAN_QUALITY_TIERS.high.maxSide).toBeGreaterThan(CLEAN_QUALITY_TIERS.standard.maxSide);
    expect(CLEAN_QUALITY_TIERS.high.jpegQuality).toBeGreaterThan(CLEAN_QUALITY_TIERS.standard.jpegQuality);
    expect(resolveCleanQuality('inconnu').jpegQuality).toBe(0.88);

    const calls = [];
    const fakeCanvas = {
      toDataURL(mime, quality) {
        calls.push({ mime, quality });
        return `data:${mime};base64,AAAA`;
      },
    };
    encodeCleanedCanvas(fakeCanvas, 'magic', 'standard');
    encodeCleanedCanvas(fakeCanvas, 'magic', 'eco');
    encodeCleanedCanvas(fakeCanvas, 'magic', 'high');
    encodeCleanedCanvas(fakeCanvas, 'bw', 'standard');
    encodeCleanedCanvas(fakeCanvas, 'bw', 'eco');

    expect(calls[0]).toEqual({ mime: 'image/jpeg', quality: 0.88 });
    expect(calls[1]).toEqual({ mime: 'image/jpeg', quality: 0.72 });
    expect(calls[2]).toEqual({ mime: 'image/jpeg', quality: 0.95 });
    expect(calls[3]).toEqual({ mime: 'image/png', quality: undefined });
    expect(calls[4]).toEqual({ mime: 'image/jpeg', quality: 0.78 });
  });
});
