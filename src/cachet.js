/**
 * Cachets : création (texte + forme → image transparente) et import depuis
 * une photo ou un scan (le fond clair devient transparent).
 */

/**
 * Rend transparent le fond clair d'une image (cachet photographié sur papier).
 * Le blanc devient transparent ; les couleurs d'encre gardent leur teinte et
 * s'adoucissent progressivement près du seuil pour éviter un contour crénelé.
 * @param {Uint8ClampedArray} data pixels RGBA (modifiés sur place)
 * @param {number} threshold luminosité (0-255) au-delà de laquelle c'est du papier
 */
export function removeLightBackground(data, threshold = 225) {
  const soft = 40;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (lum >= threshold) data[i + 3] = 0;
    else if (lum > threshold - soft) data[i + 3] = Math.round((data[i + 3] * (threshold - lum)) / soft);
  }
  return data;
}

/** Rogne les marges entièrement transparentes ; renvoie le rectangle utile. */
export function opaqueBounds(data, width, height, alphaMin = 12) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaMin) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: width, h: height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-illisible'));
    img.src = src;
  });
}

/**
 * Fichier image → cachet PNG transparent (≤ 600 px), rogné.
 * @returns {Promise<{src:string, ratio:number}>}
 */
export async function fileToCachet(file, { removeBg = true, threshold = 225, maxSide = 600 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    if (removeBg) removeLightBackground(data.data, threshold);
    ctx.putImageData(data, 0, 0);
    const b = removeBg ? opaqueBounds(data.data, w, h) : { x: 0, y: 0, w, h };
    const out = document.createElement('canvas');
    out.width = b.w;
    out.height = b.h;
    out.getContext('2d').drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return { src: out.toDataURL('image/png'), ratio: b.w / b.h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const CACHET_SHAPES = ['rect', 'rounded', 'ellipse', 'double'];

/**
 * Dessine un cachet (1 à 4 lignes, centré, cadre au choix) sur un canevas
 * transparent. Les proportions s'adaptent au texte.
 * @returns {{src:string, ratio:number}}
 */
export function renderCachet({ lines = [], color = '#1d4ed8', shape = 'rounded', width = 520 } = {}) {
  const rows = lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 4);
  if (!rows.length) rows.push('CACHET');
  const pad = 28;
  const font = (px, bold) => `${bold ? '700 ' : '500 '}${px}px Arial, Helvetica, sans-serif`;
  const measure = document.createElement('canvas').getContext('2d');
  // Taille de police : la ligne la plus longue remplit la largeur utile.
  let size = 56;
  measure.font = font(size, true);
  const widest = Math.max(...rows.map((r) => measure.measureText(r).width), 1);
  const inner = width - pad * 2 - (shape === 'ellipse' ? width * 0.16 : 0);
  size = Math.max(16, Math.min(56, Math.floor((size * inner) / widest)));
  const lineH = Math.round(size * 1.25);
  const height = Math.round(pad * 2 + lineH * rows.length + (shape === 'ellipse' ? lineH * 0.9 : 0));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 7;
  const m = 8;
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
  };
  if (shape === 'rect') rr(m, m, width - m * 2, height - m * 2, 2);
  else if (shape === 'rounded') rr(m, m, width - m * 2, height - m * 2, 26);
  else if (shape === 'double') {
    rr(m, m, width - m * 2, height - m * 2, 10);
    ctx.lineWidth = 3;
    rr(m + 14, m + 14, width - (m + 14) * 2, height - (m + 14) * 2, 6);
  } else {
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width / 2 - m, height / 2 - m, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  rows.forEach((row, i) => {
    ctx.font = font(size, i === 0);
    ctx.fillText(row, width / 2, height / 2 + (i - (rows.length - 1) / 2) * lineH);
  });
  return { src: canvas.toDataURL('image/png'), ratio: width / height };
}
