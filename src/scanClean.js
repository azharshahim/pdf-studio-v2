/**
 * Nettoyage local de pages scannées et atténuation de filigranes d'image.
 *
 * 100 % exécuté dans le navigateur (Canvas / tableaux typés), sans bibliothèque
 * lourde ni appel réseau. Toutes les fonctions sur `{ data, width, height }`
 * sont pures et testables directement sur de petits tableaux de pixels.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const OPS = pdfjsLib.OPS || {};

/** Préréglages disponibles dans l'outil « Nettoyer la feuille ». */
export const CLEAN_PRESETS = [
  'original',
  'lighten',
  'enhance',
  'magic',
  'nowatermark',
  'noshadow',
  'bw',
  'grayscale',
];

/**
 * Paliers de qualité / taille pour les pages nettoyées :
 * - `eco`      : compact pour les documents volumineux (1400 px, JPEG 0,72)
 * - `standard` : défaut équilibré (2200 px, JPEG 0,88 ; PNG sans perte en N&B)
 * - `high`     : netteté maximale (2800 px, JPEG 0,95 ; PNG sans perte en N&B)
 */
export const CLEAN_QUALITY_TIERS = {
  eco: { id: 'eco', maxSide: 1400, jpegQuality: 0.72 },
  standard: { id: 'standard', maxSide: 2200, jpegQuality: 0.88 },
  high: { id: 'high', maxSide: 2800, jpegQuality: 0.95 },
};

/** Renvoie la configuration `{ id, maxSide, jpegQuality }` d'un palier valide. */
export function resolveCleanQuality(tier = 'standard') {
  return CLEAN_QUALITY_TIERS[tier] || CLEAN_QUALITY_TIERS.standard;
}

function clampByte(v) {
  return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Crée une copie indépendante d'un tampon RGBA `{ width, height, data }`. */
export function cloneImageBuffer(src) {
  return {
    width: src.width,
    height: src.height,
    data: new Uint8ClampedArray(src.data),
  };
}

/** Luminance perceptuelle (BT.601) sur 1 octet par pixel. */
export function computeLuminance(src) {
  const { data, width, height } = src;
  const n = width * height;
  const lum = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    lum[i] = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2] + 128) >> 8;
  }
  return lum;
}

function histogram256(plane) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < plane.length; i++) hist[plane[i]]++;
  return hist;
}

function percentileFromHist(hist, total, q) {
  if (!total) return 0;
  const target = Math.max(0, Math.min(total - 1, Math.floor(total * q)));
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc > target) return v;
  }
  return 255;
}

/* ─────────────────── Morphologie & flou rapides O(W×H) ─────────────────── */

/**
 * Maximum ou minimum glissant 1D de rayon `r` (fenêtre `2r + 1`) par
 * l'algorithme de Van Herk / Gil-Werman (3 comparaisons/pixel quel que soit `r`).
 */
export function slidingExtremum1D(src, len, r, isMax) {
  const out = new Uint8Array(len);
  if (len === 0) return out;
  if (r <= 0 || len === 1) {
    out.set(src);
    return out;
  }
  const W = 2 * r + 1;
  const Lp = len + 2 * r;
  const pad = new Uint8Array(Lp);
  pad.fill(src[0], 0, r);
  pad.set(src, r);
  pad.fill(src[len - 1], r + len);

  const prefix = new Uint8Array(Lp);
  const suffix = new Uint8Array(Lp);

  if (isMax) {
    for (let i = 0; i < Lp; i++) {
      prefix[i] = i % W === 0 ? pad[i] : pad[i] > prefix[i - 1] ? pad[i] : prefix[i - 1];
    }
    for (let i = Lp - 1; i >= 0; i--) {
      suffix[i] =
        i === Lp - 1 || (i + 1) % W === 0 ? pad[i] : pad[i] > suffix[i + 1] ? pad[i] : suffix[i + 1];
    }
    for (let i = 0; i < len; i++) {
      const a = suffix[i];
      const b = prefix[i + 2 * r];
      out[i] = a > b ? a : b;
    }
  } else {
    for (let i = 0; i < Lp; i++) {
      prefix[i] = i % W === 0 ? pad[i] : pad[i] < prefix[i - 1] ? pad[i] : prefix[i - 1];
    }
    for (let i = Lp - 1; i >= 0; i--) {
      suffix[i] =
        i === Lp - 1 || (i + 1) % W === 0 ? pad[i] : pad[i] < suffix[i + 1] ? pad[i] : suffix[i + 1];
    }
    for (let i = 0; i < len; i++) {
      const a = suffix[i];
      const b = prefix[i + 2 * r];
      out[i] = a < b ? a : b;
    }
  }
  return out;
}

function morph2D(plane, width, height, radius, isMax) {
  if (radius <= 0 || width <= 0 || height <= 0) return new Uint8Array(plane);
  const tmp = new Uint8Array(width * height);
  const rowBuf = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    const off = y * width;
    for (let x = 0; x < width; x++) rowBuf[x] = plane[off + x];
    const res = slidingExtremum1D(rowBuf, width, radius, isMax);
    tmp.set(res, off);
  }
  const out = new Uint8Array(width * height);
  const colBuf = new Uint8Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) colBuf[y] = tmp[y * width + x];
    const res = slidingExtremum1D(colBuf, height, radius, isMax);
    for (let y = 0; y < height; y++) out[y * width + x] = res[y];
  }
  return out;
}

/** Fermeture morphologique (dilatation puis érosion) : gomme les traits sombres fins. */
export function morphClose2D(plane, width, height, radius) {
  if (radius <= 0) return new Uint8Array(plane);
  const dilated = morph2D(plane, width, height, radius, true);
  return morph2D(dilated, width, height, radius, false);
}

/** Flou boîte 2D séparable en temps O(W×H) indépendant du rayon. */
export function boxBlur2D(plane, width, height, radius, passes = 2) {
  if (radius <= 0 || width <= 1 && height <= 1) return new Uint8Array(plane);
  let src = new Uint8Array(plane);
  let tmp = new Uint8Array(width * height);
  const wSize = 2 * radius + 1;

  for (let pass = 0; pass < passes; pass++) {
    // Passe horizontale
    for (let y = 0; y < height; y++) {
      const off = y * width;
      let sum = src[off] * (radius + 1);
      for (let x = 1; x <= radius; x++) {
        sum += src[off + (x < width ? x : width - 1)];
      }
      for (let x = 0; x < width; x++) {
        tmp[off + x] = (sum / wSize + 0.5) | 0;
        const leftIdx = x - radius;
        const rightIdx = x + radius + 1;
        sum -= src[off + (leftIdx < 0 ? 0 : leftIdx)];
        sum += src[off + (rightIdx >= width ? width - 1 : rightIdx)];
      }
    }
    // Passe verticale
    for (let x = 0; x < width; x++) {
      let sum = tmp[x] * (radius + 1);
      for (let y = 1; y <= radius; y++) {
        sum += tmp[(y < height ? y : height - 1) * width + x];
      }
      for (let y = 0; y < height; y++) {
        src[y * width + x] = (sum / wSize + 0.5) | 0;
        const topIdx = y - radius;
        const botIdx = y + radius + 1;
        sum -= tmp[(topIdx < 0 ? 0 : topIdx) * width + x];
        sum += tmp[(botIdx >= height ? height - 1 : botIdx) * width + x];
      }
    }
  }
  return src;
}

function downsamplePlane(plane, width, height, step) {
  if (step <= 1) return { plane: new Uint8Array(plane), w: width, h: height };
  const sw = Math.max(1, Math.ceil(width / step));
  const sh = Math.max(1, Math.ceil(height / step));
  const out = new Uint8Array(sw * sh);
  for (let sy = 0; sy < sh; sy++) {
    const y0 = sy * step;
    const y1 = Math.min(height, y0 + step);
    for (let sx = 0; sx < sw; sx++) {
      const x0 = sx * step;
      const x1 = Math.min(width, x0 + step);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          sum += plane[row + x];
          count++;
        }
      }
      out[sy * sw + sx] = (sum / count + 0.5) | 0;
    }
  }
  return { plane: out, w: sw, h: sh };
}

function upsampleBilinear(small, sw, sh, width, height) {
  if (sw === width && sh === height) return small;
  const out = new Uint8Array(width * height);
  const scaleX = sw > 1 ? (sw - 1) / Math.max(1, width - 1) : 0;
  const scaleY = sh > 1 ? (sh - 1) / Math.max(1, height - 1) : 0;

  for (let y = 0; y < height; y++) {
    const fy = y * scaleY;
    const y0 = fy | 0;
    const y1 = y0 + 1 < sh ? y0 + 1 : y0;
    const wy = fy - y0;
    const row0 = y0 * sw;
    const row1 = y1 * sw;
    const outRow = y * width;
    for (let x = 0; x < width; x++) {
      const fx = x * scaleX;
      const x0 = fx | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0;
      const wx = fx - x0;
      const top = small[row0 + x0] * (1 - wx) + small[row0 + x1] * wx;
      const bot = small[row1 + x0] * (1 - wx) + small[row1 + x1] * wx;
      out[outRow + x] = (top * (1 - wy) + bot * wy + 0.5) | 0;
    }
  }
  return out;
}

/**
 * Estime le fond lent du papier d'un plan 2D (en gommant d'abord les traits
 * sombres fins par fermeture morphologique, puis en lissant).
 */
export function estimateBackgroundPlane(plane, width, height, { strokeRatio = 0.015, blurRatio = 0.055 } = {}) {
  const minDim = Math.min(width, height);
  const step = minDim > 420 ? Math.max(1, Math.floor(minDim / 340)) : 1;
  const { plane: sub, w: sw, h: sh } = downsamplePlane(plane, width, height, step);
  const subMin = Math.min(sw, sh);
  const strokeR = clamp(Math.round(subMin * strokeRatio), 1, 20);
  const blurR = clamp(Math.round(subMin * blurRatio), 2, 48);
  const closed = morphClose2D(sub, sw, sh, strokeR);
  const smooth = boxBlur2D(closed, sw, sh, blurR, 3);
  return upsampleBilinear(smooth, sw, sh, width, height);
}

/* ─────────────────── Préréglages de nettoyage ─────────────────── */

/** 1. Original : copie intacte. */
export function applyOriginal(src) {
  return cloneImageBuffer(src);
}

/** 2. Éclaircir : fond nettement plus clair tout en conservant la densité du texte. */
export function applyLighten(src) {
  const out = cloneImageBuffer(src);
  const { data, width, height } = out;
  const lum = computeLuminance(src);
  const hist = histogram256(lum);
  const total = width * height;
  const blackRef = Math.min(85, percentileFromHist(hist, total, 0.02));
  const whiteRef = clamp(percentileFromHist(hist, total, 0.78), Math.max(blackRef + 45, 155), 250);
  const span = Math.max(1, whiteRef - blackRef);

  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    if (v <= blackRef) {
      lut[v] = Math.round(v * 0.88);
    } else if (v >= whiteRef) {
      lut[v] = 255;
    } else {
      const t = (v - blackRef) / span;
      // Courbe douce qui blanchit fortement les tons clairs tout en tenant les sombres.
      const curved = Math.pow(t, 0.68);
      const base = blackRef * 0.88;
      lut[v] = clampByte(base + curved * (255 - base));
    }
  }

  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const y = lum[i];
    const targetY = lut[y];
    if (y === 0) {
      data[p] = data[p + 1] = data[p + 2] = targetY;
    } else if (targetY === 255 && y >= whiteRef) {
      // Blanchit aussi toute dominante jaunâtre résiduelle sur le fond papier
      data[p] = clampByte(data[p] + (255 - y) * 1.15);
      data[p + 1] = clampByte(data[p + 1] + (255 - y) * 1.15);
      data[p + 2] = clampByte(data[p + 2] + (255 - y) * 1.15);
    } else {
      const gain = targetY / y;
      data[p] = clampByte(data[p] * gain);
      data[p + 1] = clampByte(data[p + 1] * gain);
      data[p + 2] = clampByte(data[p + 2] * gain);
    }
    data[p + 3] = 255;
  }
  return out;
}

/** 3. Améliorer : étirement de contraste + accentuation de la netteté (unsharp mask). */
export function applyEnhance(src) {
  const out = cloneImageBuffer(src);
  const { data, width, height } = out;
  const total = width * height;
  const lum = computeLuminance(src);
  const hist = histogram256(lum);
  const lo = Math.min(95, percentileFromHist(hist, total, 0.015));
  const hi = Math.max(lo + 40, percentileFromHist(hist, total, 0.9));
  const span = Math.max(1, hi - lo);

  // Étirement avec légère courbe en S
  const stretchedLum = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const t = clamp((lum[i] - lo) / span, 0, 1);
    const s = t * t * (3 - 2 * t);
    const mixed = 0.65 * t + 0.35 * s;
    stretchedLum[i] = clampByte(mixed * 255);
  }

  const blurred = boxBlur2D(stretchedLum, width, height, 1, 1);
  const amount = 0.85;

  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const baseY = stretchedLum[i];
    const diff = baseY - blurred[i];
    const sharpY = Math.abs(diff) >= 3 ? clampByte(baseY + diff * amount) : baseY;
    const origY = lum[i];
    if (origY < 4) {
      data[p] = data[p + 1] = data[p + 2] = sharpY;
    } else {
      // Préserve la couleur d'origine tout en appliquant le contraste et la netteté
      const r = src.data[p];
      const g = src.data[p + 1];
      const b = src.data[p + 2];
      if (sharpY >= 250) {
        data[p] = data[p + 1] = data[p + 2] = 255;
      } else {
        const ratio = sharpY / origY;
        data[p] = clampByte(r * ratio);
        data[p + 1] = clampByte(g * ratio);
        data[p + 2] = clampByte(b * ratio);
      }
    }
    data[p + 3] = 255;
  }
  return out;
}

/**
 * 4. Magique : égalisation de l'éclairage (division par le fond flouté par canal
 * pour ôter taches, ombres, plis et dominante jaune) + réajustement du contraste
 * et nettoyage du bruit de fond.
 */
export function applyMagic(src) {
  const out = cloneImageBuffer(src);
  const { data, width, height } = out;
  const total = width * height;
  if (!total) return out;

  const rPlane = new Uint8Array(total);
  const gPlane = new Uint8Array(total);
  const bPlane = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    rPlane[i] = src.data[p];
    gPlane[i] = src.data[p + 1];
    bPlane[i] = src.data[p + 2];
  }

  const bgR = estimateBackgroundPlane(rPlane, width, height, { strokeRatio: 0.016, blurRatio: 0.055 });
  const bgG = estimateBackgroundPlane(gPlane, width, height, { strokeRatio: 0.016, blurRatio: 0.055 });
  const bgB = estimateBackgroundPlane(bPlane, width, height, { strokeRatio: 0.016, blurRatio: 0.055 });

  // Division par le fond local : le papier (même jauni/ombragé/taché) remonte vers 255
  const normR = new Uint8Array(total);
  const normG = new Uint8Array(total);
  const normB = new Uint8Array(total);
  const normY = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    const nr = clampByte((rPlane[i] * 255) / Math.max(45, bgR[i]));
    const ng = clampByte((gPlane[i] * 255) / Math.max(45, bgG[i]));
    const nb = clampByte((bPlane[i] * 255) / Math.max(45, bgB[i]));
    normR[i] = nr;
    normG[i] = ng;
    normB[i] = nb;
    normY[i] = (77 * nr + 150 * ng + 29 * nb + 128) >> 8;
  }

  // Léger masque flou pour la netteté des caractères après normalisation
  const blurY = boxBlur2D(normY, width, height, 1, 1);

  // Seuils de réajustement : coupure du bruit papier proche du blanc et ancrage des noirs
  const whiteClip = 232;
  const blackFloor = 46;
  const range = whiteClip - blackFloor;

  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const y = normY[i];
    if (y >= whiteClip) {
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = 255;
      continue;
    }
    const diff = y - blurY[i];
    const ySharp = Math.abs(diff) >= 4 ? clamp(y + diff * 0.45, 0, 255) : y;
    const t = clamp((ySharp - blackFloor) / range, 0, 1);
    const targetY = clampByte(Math.pow(t, 1.08) * 255);

    const invOrig = Math.max(1, 255 - y);
    const invTarget = 255 - targetY;
    const densityGain = invTarget / invOrig;

    data[p] = clampByte(255 - (255 - normR[i]) * densityGain);
    data[p + 1] = clampByte(255 - (255 - normG[i]) * densityGain);
    data[p + 2] = clampByte(255 - (255 - normB[i]) * densityGain);
    data[p + 3] = 255;
  }
  return out;
}

/**
 * 5. Sans filigrane / Enlever le filigrane de l'image :
 * Estime l'arrière-plan papier et atténue à la fois les grandes formes grises
 * ou floues derrière le texte et les marques/filigranes pâles, selon `intensity` (0..1).
 * Le texte sombre à fort contraste est préservé.
 */
export function attenuateImageWatermark(src, { intensity = 0.7 } = {}) {
  const out = cloneImageBuffer(src);
  const strength = clamp(Number.isFinite(intensity) ? intensity : 0.7, 0, 1);
  if (strength <= 0 || !out.width || !out.height) return out;

  const { data, width, height } = out;
  const total = width * height;
  const lum = computeLuminance(src);
  const hist = histogram256(lum);

  // Niveau de blanc du papier (percentile haut pour ignorer le filigrane et le texte)
  const paperY = Math.max(175, percentileFromHist(hist, total, 0.92));

  // Couleur moyenne du papier clair autour de paperY
  let sumPR = 0;
  let sumPG = 0;
  let sumPB = 0;
  let countP = 0;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    if (lum[i] >= paperY - 8) {
      sumPR += src.data[p];
      sumPG += src.data[p + 1];
      sumPB += src.data[p + 2];
      countP++;
    }
  }
  const paperR = countP ? sumPR / countP : paperY;
  const paperG = countP ? sumPG / countP : paperY;
  const paperB = countP ? sumPB / countP : paperY;

  // Estimation de la nappe d'arrière-plan (grandes zones grises/floues derrière le texte)
  const rPlane = new Uint8Array(total);
  const gPlane = new Uint8Array(total);
  const bPlane = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    rPlane[i] = src.data[p];
    gPlane[i] = src.data[p + 1];
    bPlane[i] = src.data[p + 2];
  }

  const bgR = estimateBackgroundPlane(rPlane, width, height, { strokeRatio: 0.015, blurRatio: 0.035 });
  const bgG = estimateBackgroundPlane(gPlane, width, height, { strokeRatio: 0.015, blurRatio: 0.035 });
  const bgB = estimateBackgroundPlane(bPlane, width, height, { strokeRatio: 0.015, blurRatio: 0.035 });

  // Estimation du niveau d'encre sombre du texte pour ne jamais entamer le texte noir
  let darkPixels = 0;
  for (let v = 0; v < Math.max(1, paperY - 35); v++) darkPixels += hist[v];
  let inkY = 45;
  if (darkPixels > 0) {
    let acc = 0;
    const targetDark = Math.max(1, Math.floor(darkPixels * 0.15));
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= targetDark) {
        inkY = v;
        break;
      }
    }
  }
  const maxSafeCutoff = Math.max(24, Math.min(130, Math.round((255 - inkY) * 0.62)));
  // Seuil de densité optique sous lequel une marque pâle est considérée comme filigrane
  const cutoff = Math.min(maxSafeCutoff, 14 + strength * 84);
  const softBand = 24;
  const bgLift = Math.min(1, strength * 1.15);

  // Fermeture morphologique fine : comble les traits fins de texte (1–3 px), mais pas
  // les larges formes grises ni les grosses lettres épaisses d'un filigrane.
  const fineR = clamp(Math.round(Math.min(width, height) * 0.0035), 1, 3);
  const fineClose = morphClose2D(lum, width, height, fineR);

  const targetWR = paperR + (255 - paperR) * strength * 0.85;
  const targetWG = paperG + (255 - paperG) * strength * 0.85;
  const targetWB = paperB + (255 - paperB) * strength * 0.85;

  for (let i = 0, p = 0; i < total; i++, p += 4) {
    // 1. Compensation de la grande forme grise/floue d'arrière-plan
    const liftR = bgR[i] < paperR ? (1 - bgLift) + bgLift * (paperR / Math.max(45, bgR[i])) : 1;
    const liftG = bgG[i] < paperG ? (1 - bgLift) + bgLift * (paperG / Math.max(45, bgG[i])) : 1;
    const liftB = bgB[i] < paperB ? (1 - bgLift) + bgLift * (paperB / Math.max(45, bgB[i])) : 1;

    let cr = Math.min(255, rPlane[i] * liftR);
    let cg = Math.min(255, gPlane[i] * liftG);
    let cb = Math.min(255, bPlane[i] * liftB);

    const cy = 0.299 * cr + 0.587 * cg + 0.114 * cb;
    const refWhiteY = 0.299 * targetWR + 0.587 * targetWG + 0.114 * targetWB;
    const darkness = Math.max(0, refWhiteY - cy);
    const chroma = Math.max(cr, cg, cb) - Math.min(cr, cg, cb);

    // Protège les petits caractères fins (même gris moyen) isolés sur papier clair
    const fineStroke = fineClose[i] - lum[i];
    const coarseMass = Math.max(0, paperY - fineClose[i]);
    const fineDetailGuard =
      fineStroke > 16 && coarseMass < 18 ? Math.min(cutoff * 0.68, (fineStroke - 12) * 0.85) : 0;

    // Un filigrane gris/coloré large bénéficie d'un bonus seulement s'il n'est pas un trait fin
    const chromaBonus =
      fineDetailGuard === 0 && chroma > 28 && cy > inkY + 35 && coarseMass >= 14
        ? Math.min(28, (chroma - 28) * 0.45 * strength)
        : 0;
    const effectiveCutoff = Math.max(8, cutoff + chromaBonus - fineDetailGuard);

    if (darkness <= effectiveCutoff) {
      // Atténuation forte vers le blanc papier selon l'intensité
      const keep = (1 - strength) * 0.22;
      cr = targetWR - (targetWR - cr) * keep;
      cg = targetWG - (targetWG - cg) * keep;
      cb = targetWB - (targetWB - cb) * keep;
    } else if (darkness < effectiveCutoff + softBand) {
      // Transition douce pour éviter les contours déchiquetés autour des lettres
      const t = (darkness - effectiveCutoff) / softBand;
      const w = t * t * (3 - 2 * t);
      const keep = (1 - strength) * 0.22;
      const attR = targetWR - (targetWR - cr) * keep;
      const attG = targetWG - (targetWG - cg) * keep;
      const attB = targetWB - (targetWB - cb) * keep;
      cr = attR * (1 - w) + cr * w;
      cg = attG * (1 - w) + cg * w;
      cb = attB * (1 - w) + cb * w;
    }

    data[p] = clampByte(cr);
    data[p + 1] = clampByte(cg);
    data[p + 2] = clampByte(cb);
    data[p + 3] = 255;
  }

  return out;
}

/**
 * 6. Pas d'ombre : corrige les ombres de prise de vue (gradient d'éclairage,
 * ombre d'un téléphone ou d'une main) tout en gardant le rendu naturel de la feuille.
 */
export function applyNoShadow(src) {
  const out = cloneImageBuffer(src);
  const { data, width, height } = out;
  const total = width * height;
  if (!total) return out;

  const lum = computeLuminance(src);
  const bgLum = estimateBackgroundPlane(lum, width, height, { strokeRatio: 0.018, blurRatio: 0.075 });
  const bgHist = histogram256(bgLum);
  const targetPaper = Math.max(205, percentileFromHist(bgHist, total, 0.95));

  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const localBg = Math.max(38, bgLum[i]);
    const gain = localBg < targetPaper ? targetPaper / localBg : 1;
    data[p] = clampByte(src.data[p] * gain);
    data[p + 1] = clampByte(src.data[p + 1] * gain);
    data[p + 2] = clampByte(src.data[p + 2] * gain);
    data[p + 3] = 255;
  }
  return out;
}

/**
 * 7. Noir et blanc : seuillage adaptatif local de Sauvola par images intégrales.
 * Supporte sans broncher les ombres fortes et les éclairements très inégaux.
 */
export function applyAdaptiveBw(src, { k = 0.2, windowRadius } = {}) {
  const out = cloneImageBuffer(src);
  const { data, width, height } = out;
  const total = width * height;
  if (!total) return out;

  const lum = computeLuminance(src);
  const hist = histogram256(lum);
  const globalPaper = Math.max(140, percentileFromHist(hist, total, 0.9));
  const deepInkFloor = Math.min(72, Math.round(globalPaper * 0.36));

  const r =
    typeof windowRadius === 'number' && windowRadius > 0
      ? Math.round(windowRadius)
      : clamp(Math.round(Math.min(width, height) * 0.022), 5, 28);

  const stride = width + 1;
  const sum = new Float64Array(stride * (height + 1));
  const sumSq = new Float64Array(stride * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSq = 0;
    const srcOff = y * width;
    const prevOff = y * stride;
    const curOff = (y + 1) * stride;
    for (let x = 0; x < width; x++) {
      const v = lum[srcOff + x];
      rowSum += v;
      rowSq += v * v;
      sum[curOff + x + 1] = sum[prevOff + x + 1] + rowSum;
      sumSq[curOff + x + 1] = sumSq[prevOff + x + 1] + rowSq;
    }
  }

  const R = 128;
  const minContrast = 7;

  for (let y = 0; y < height; y++) {
    const y0 = y - r < 0 ? 0 : y - r;
    const y1 = y + r + 1 > height ? height : y + r + 1;
    const off0 = y0 * stride;
    const off1 = y1 * stride;
    const rowOff = y * width;

    for (let x = 0; x < width; x++) {
      const x0 = x - r < 0 ? 0 : x - r;
      const x1 = x + r + 1 > width ? width : x + r + 1;
      const area = (x1 - x0) * (y1 - y0);

      const s1 = sum[off1 + x1] - sum[off0 + x1] - sum[off1 + x0] + sum[off0 + x0];
      const s2 = sumSq[off1 + x1] - sumSq[off0 + x1] - sumSq[off1 + x0] + sumSq[off0 + x0];

      const mean = s1 / area;
      const variance = Math.max(0, s2 / area - mean * mean);
      const std = Math.sqrt(variance);
      const threshold = mean * (1 + k * (std / R - 1));

      const v = lum[rowOff + x];
      const isInk = (v <= threshold && mean - v >= minContrast) || v <= deepInkFloor;
      const bw = isInk ? 0 : 255;
      const p = (rowOff + x) * 4;
      data[p] = bw;
      data[p + 1] = bw;
      data[p + 2] = bw;
      data[p + 3] = 255;
    }
  }
  return out;
}

/** 8. Niveaux de gris : conversion fidèle en luminance neutre. */
export function applyGrayscale(src) {
  const out = cloneImageBuffer(src);
  const { data, width, height } = out;
  const total = width * height;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const y = (77 * src.data[p] + 150 * src.data[p + 1] + 29 * src.data[p + 2] + 128) >> 8;
    data[p] = y;
    data[p + 1] = y;
    data[p + 2] = y;
    data[p + 3] = 255;
  }
  return out;
}

/**
 * Applique l'un des 8 préréglages à un tampon `{ data, width, height }`.
 * Ne modifie jamais `src` en place.
 */
export function applyCleanPreset(src, preset = 'magic', options = {}) {
  switch (preset) {
    case 'original':
      return applyOriginal(src);
    case 'lighten':
      return applyLighten(src);
    case 'enhance':
      return applyEnhance(src);
    case 'magic':
      return applyMagic(src);
    case 'nowatermark':
      return attenuateImageWatermark(src, { intensity: options.intensity ?? 0.72 });
    case 'noshadow':
      return applyNoShadow(src);
    case 'bw':
      return applyAdaptiveBw(src, options);
    case 'grayscale':
      return applyGrayscale(src);
    default:
      return applyOriginal(src);
  }
}

/* ─────────────────── Aides Canvas & détection de pages scannées ─────────────────── */

/**
 * Crée un nouveau `<canvas>` contenant le résultat du préréglage choisi.
 */
export function cleanCanvas(sourceCanvas, preset = 'magic', options = {}) {
  const w = Math.max(1, sourceCanvas.width);
  const h = Math.max(1, sourceCanvas.height);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const outCtx = out.getContext('2d');
  if (preset === 'original') {
    outCtx.drawImage(sourceCanvas, 0, 0);
    return out;
  }
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = srcCtx.getImageData(0, 0, w, h);
  const cleaned = applyCleanPreset(imgData, preset, options);
  const target = outCtx.createImageData(w, h);
  target.data.set(cleaned.data);
  outCtx.putImageData(target, 0, 0);
  return out;
}

/**
 * Encode un `<canvas>` nettoyé en Data URL selon le préréglage et le palier de qualité.
 * Garde le JPEG 0,88 en palier `standard` (et PNG sans perte pour `bw` en `standard`/`high`).
 */
export function encodeCleanedCanvas(canvas, preset = 'magic', tier = 'standard') {
  const q = resolveCleanQuality(tier);
  if (preset === 'bw' && q.id !== 'eco') {
    return canvas.toDataURL('image/png');
  }
  const quality = preset === 'bw' ? 0.78 : q.jpegQuality;
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Décode une URL `data:image/...;base64,...` en `{ bytes: Uint8Array, mime }`
 * sans passer par `fetch` (fonctionne hors réseau et dans Node/Vitest).
 */
export function decodeDataUrl(dataUrl) {
  const str = String(dataUrl || '');
  const comma = str.indexOf(',');
  if (!str.startsWith('data:') || comma < 0) throw new Error('dataUrl invalide');
  const header = str.slice(5, comma);
  const mime = header.split(';')[0] || 'image/jpeg';
  const b64 = str.slice(comma + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

function mulMat(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Inspecte une page pdf.js pour savoir s'il s'agit d'une image scannée
 * (grande image couvrant la page, ou images peintes sans texte visible natif).
 */
export async function inspectPageScanStatus(pageProxy) {
  try {
    const [, , v2, v3] = pageProxy.view || [0, 0, 595, 842];
    const pageArea = Math.max(1, Math.abs(v2 * v3));
    const [ops, textContent] = await Promise.all([
      pageProxy.getOperatorList(),
      pageProxy.getTextContent().catch(() => ({ items: [] })),
    ]);

    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let maxImageCoverage = 0;
    let imageCount = 0;
    let textMode = 0;
    let visibleChars = 0;

    // Compter les caractères non vides seulement si pas en mode invisible (Tr=3)
    const totalChars = (textContent?.items || []).reduce(
      (acc, it) => acc + String(it.str || '').trim().length,
      0
    );

    const { fnArray, argsArray } = ops;
    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];
      if (fn === OPS.save) {
        stack.push(ctm.slice());
      } else if (fn === OPS.restore) {
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
        ctm = mulMat(ctm, args);
      } else if (fn === OPS.setTextRenderingMode && Array.isArray(args)) {
        textMode = args[0] || 0;
      } else if (
        (fn === OPS.showText || fn === OPS.showSpacedText) &&
        textMode !== 3
      ) {
        visibleChars += 1;
      } else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageXObjectRepeat
      ) {
        imageCount++;
        const area = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
        const cov = area / pageArea;
        if (cov > maxImageCoverage) maxImageCoverage = cov;
      }
    }

    const hasVisibleNativeText = totalChars > 0 && visibleChars > 0 && maxImageCoverage < 0.55;
    const isScanImage = maxImageCoverage >= 0.35 || (imageCount > 0 && !hasVisibleNativeText);

    return {
      isScanImage,
      imageCoverage: Math.min(1, maxImageCoverage),
      imageCount,
      hasVisibleNativeText,
    };
  } catch {
    return { isScanImage: false, imageCoverage: 0, imageCount: 0, hasVisibleNativeText: false };
  }
}

/**
 * Renvoie la liste des numéros de pages (1..numPages) qui sont des images/scans.
 */
export async function detectScannedPages(engine) {
  if (!engine?.numPages) return [];
  const scanPages = [];
  for (let n = 1; n <= engine.numPages; n++) {
    try {
      const page = await engine.getPage(n);
      const info = await inspectPageScanStatus(page);
      if (info.isScanImage) scanPages.push(n);
    } catch {
      /* page illisible ignorée */
    }
  }
  return scanPages;
}
