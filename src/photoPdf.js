/**
 * Photos → PDF : chaque photo devient une page. Les images sont réduites,
 * éventuellement redressées (rotation) et améliorées (« document »), puis
 * encodées en JPEG avant d'être placées dans le PDF.
 */
import { PDFDocument } from 'pdf-lib';
import { enhanceContrast } from './imagePrep.js';

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/**
 * Dimensions de page et rectangle de l'image (en points PDF), image centrée
 * et proportions gardées.
 * @param {number} imgW largeur de l'image (px)
 * @param {number} imgH hauteur de l'image (px)
 * @param {{size?: 'a4'|'letter'|'fit', margin?: number}} opts marge en points
 */
export function layoutPage(imgW, imgH, { size = 'a4', margin = 18 } = {}) {
  if (size === 'fit') {
    // Page à la taille de l'image (96 dpi → points), bornée pour rester lisible.
    const k = Math.min(1, 1400 / Math.max(imgW, imgH)) * 0.75;
    const w = Math.max(72, Math.round(imgW * k));
    const h = Math.max(72, Math.round(imgH * k));
    return { pageW: w, pageH: h, x: 0, y: 0, w, h };
  }
  let [pw, ph] = PAGE_SIZES[size] || PAGE_SIZES.a4;
  // Page paysage pour une photo en paysage.
  if (imgW > imgH) [pw, ph] = [ph, pw];
  const m = Math.max(0, margin);
  const availW = pw - m * 2;
  const availH = ph - m * 2;
  const k = Math.min(availW / imgW, availH / imgH);
  const w = imgW * k;
  const h = imgH * k;
  return { pageW: pw, pageH: ph, x: (pw - w) / 2, y: (ph - h) / 2, w, h };
}

function loadBitmap(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-illisible'));
    };
    img.src = url;
  });
}

/** Image → canvas réduit (≤ maxSide px), orientation EXIF déjà appliquée par le navigateur. */
export async function fileToCanvas(file, maxSide = 2200) {
  const img = await loadBitmap(file);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function rotateCanvas(canvas, quarterTurns = 1) {
  const q = ((quarterTurns % 4) + 4) % 4;
  if (!q) return canvas;
  const out = document.createElement('canvas');
  const swap = q % 2 === 1;
  out.width = swap ? canvas.height : canvas.width;
  out.height = swap ? canvas.width : canvas.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((q * Math.PI) / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

/** Applique un filtre : 'color' (rien), 'document' (contraste, gris) ou 'bw' (noir et blanc). */
export function applyFilter(canvas, filter = 'color') {
  if (filter === 'color') return canvas;
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  const out = enhanceContrast(copy);
  if (filter === 'bw') {
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, out.width, out.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] > 150 ? 255 : d[i] < 90 ? 0 : Math.round(((d[i] - 90) / 60) * 255);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }
  return out;
}

export function canvasToJpeg(canvas, quality = 0.85) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      async (blob) => (blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error('encodage'))),
      'image/jpeg',
      quality
    )
  );
}

/**
 * @param {Array<{jpeg: Uint8Array, width: number, height: number}>} pages
 * @returns {Promise<Uint8Array>} octets du PDF
 */
export async function buildPdfFromJpegs(pages, { size = 'a4', margin = 18 } = {}) {
  const doc = await PDFDocument.create();
  doc.setProducer('PDF Studio');
  doc.setCreationDate(new Date());
  for (const p of pages) {
    const img = await doc.embedJpg(p.jpeg);
    const l = layoutPage(p.width, p.height, { size, margin });
    const page = doc.addPage([l.pageW, l.pageH]);
    page.drawImage(img, { x: l.x, y: l.y, width: l.w, height: l.h });
  }
  return doc.save();
}
