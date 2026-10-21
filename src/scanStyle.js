/**
 * Style d'une ligne de scan : épaisseur du trait (gras ou non) et police dont
 * la largeur naturelle colle le mieux à la ligne vue sur l'image.
 */

/** Seuil de binarisation (Otsu) d'une image en niveaux de gris (0-255). */
export function otsuThreshold(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Mesures d'encre d'une zone de texte.
 * @param {Uint8ClampedArray|number[]} gray niveaux de gris, ligne par ligne
 * @returns {{stem:number, ink:number, inkTop:number, inkBottom:number}|null}
 *   stem = largeur médiane d'un trait (px), ink = part de pixels d'encre,
 *   inkTop/inkBottom = lignes extrêmes contenant de l'encre.
 */
export function inkStats(gray, width, height) {
  if (!width || !height || gray.length < width * height) return null;
  const thr = otsuThreshold(gray);
  const runs = [];
  let inkCount = 0;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    let run = 0;
    let rowInk = 0;
    for (let x = 0; x <= width; x++) {
      const dark = x < width && gray[y * width + x] <= thr;
      if (dark) {
        run++;
        rowInk++;
      } else if (run) {
        if (run <= Math.max(2, height)) runs.push(run);
        run = 0;
      }
    }
    inkCount += rowInk;
    if (rowInk > 0) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (!runs.length) return null;
  runs.sort((a, b) => a - b);
  return { stem: runs[Math.floor(runs.length / 2)], ink: inkCount / (width * height), inkTop: top, inkBottom: bottom };
}

/**
 * Gras ou non d'après l'épaisseur d'un trait rapportée à la hauteur de ligne.
 * Un trait de 11 à 14 % de la hauteur des capitales est « normal », au-delà de
 * 17 % c'est du gras.
 */
export function looksBold(stem, inkHeight) {
  if (!stem || !inkHeight) return false;
  return stem / inkHeight > 0.17;
}

/**
 * Police dont la largeur naturelle se rapproche le plus de celle de la ligne.
 * @param {(font:string, bold:boolean, size:number, text:string) => number} measure
 *   largeur du texte (même unité que `targetWidth`)
 * @param {string[]} candidates identifiants de polices
 * @returns {{font:string, scale:number}|null} scale = largeur visée / largeur naturelle
 */
export function pickFontByWidth(measure, text, size, targetWidth, candidates, bold = false) {
  if (!text || !(targetWidth > 0) || !candidates.length) return null;
  let best = null;
  for (const font of candidates) {
    const w = measure(font, bold, size, text);
    if (!(w > 0)) continue;
    const scale = targetWidth / w;
    const error = Math.abs(Math.log(scale));
    if (!best || error < best.error) best = { font, scale, error };
  }
  return best ? { font: best.font, scale: best.scale } : null;
}
