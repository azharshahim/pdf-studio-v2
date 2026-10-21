/**
 * Prétraitement d'image avant OCR : amélioration du contraste (niveaux de gris
 * + étirement des percentiles) et redressement (deskew) estimé par projection
 * horizontale. Tout est fait sur le canvas, sans dépendance externe.
 */

/** Convertit en niveaux de gris et étire les niveaux 2 %–98 %. */
export function enhanceContrast(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  if (!width || !height) return canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const histogram = new Uint32Array(256);
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    gray[p] = v;
    histogram[v]++;
  }
  const total = width * height;
  const lowTarget = total * 0.002;
  const highTarget = total * 0.98;
  let acc = 0;
  let low = 0;
  let high = 255;
  for (let v = 0; v < 256; v++) {
    acc += histogram[v];
    if (acc >= lowTarget) {
      low = v;
      break;
    }
  }
  acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += histogram[v];
    if (acc >= highTarget) {
      high = v;
      break;
    }
  }
  // Page presque entièrement blanche (texte épars) : étirer l'histogramme
  // noircirait tout. Sans contraste mesurable, on laisse l'image telle quelle.
  if (high - low < 16) return canvas;
  const span = Math.max(1, high - low);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = Math.max(0, Math.min(255, Math.round(((gray[p] - low) / span) * 255)));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Estime l'inclinaison (en degrés) d'une image binaire par variance de projection. */
export function estimateSkew(canvas, maxAngle = 5, step = 0.5) {
  const scale = Math.min(1, 700 / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, w, h);
  const image = sctx.getImageData(0, 0, w, h);
  const data = image.data;
  const dark = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    dark[p] = v < 150 ? 1 : 0;
  }

  let bestAngle = 0;
  let bestScore = -1;
  for (let angle = -maxAngle; angle <= maxAngle + 1e-6; angle += step) {
    const slope = Math.tan((angle * Math.PI) / 180);
    const buckets = new Float64Array(h);
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (!dark[y * w + x]) continue;
        const yy = Math.round(y + x * slope);
        if (yy >= 0 && yy < h) buckets[yy]++;
      }
    }
    let score = 0;
    for (let i = 0; i < h; i++) score += buckets[i] * buckets[i];
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

/** Redresse le canvas (rotation inverse de l'inclinaison détectée). */
export function deskewCanvas(canvas) {
  const angle = estimateSkew(canvas);
  if (Math.abs(angle) < 0.4) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((-angle * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}
