/**
 * Construit une URL absolue à partir d'un chemin du dossier `public/`.
 * Compatible avec un déploiement sous sous-dossier (GitHub Pages) grâce à
 * `import.meta.env.BASE_URL` (`./` en production, `/` en développement).
 */
export function assetUrl(path = '') {
  const base = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '/');
  const clean = String(path).replace(/^\/+/, '');
  const relative = `${base}${clean}`;
  if (typeof document !== 'undefined' && document.baseURI) {
    try {
      return new URL(relative, document.baseURI).href;
    } catch {
      return relative;
    }
  }
  return relative;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
let _uid = 0;
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${(_uid++).toString(36)}`;

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Minuscule + suppression des accents, pour la recherche. */
export function normalizeText(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

export function hexToRgb01(hex, fallback = { r: 0, g: 0, b: 0 }) {
  if (!hex || typeof hex !== 'string') return fallback;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return fallback;
  const n = parseInt(h.slice(0, 6), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function rgbToHex(r, g, b) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function snapshot(obj) {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

export const clone = snapshot;

export function formatBytes(n) {
  if (!n && n !== 0) return '';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 || v >= 10 ? 0 : 1;
  return `${v.toFixed(digits).replace('.', ',')} ${units[i]}`;
}

let extraFontCss = () => null;
/** Permet au catalogue de polices de fournir sa famille CSS (évite un import circulaire). */
export function setFontCssResolver(fn) {
  extraFontCss = typeof fn === 'function' ? fn : () => null;
}

export function cssFontFamily(font) {
  const extra = extraFontCss(font);
  if (extra) return extra;
  if (font === 'Times') return '"Times New Roman", Times, serif';
  if (font === 'Courier') return '"Courier New", Courier, monospace';
  if (font === 'Noto Sans') return '"Noto Sans", "Noto Naskh Arabic", "Segoe UI", system-ui, sans-serif';
  return 'Helvetica, Arial, sans-serif';
}

export function formatPercent(p) {
  return `${Math.round(clamp(p, 0, 1) * 100)} %`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return url;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function baseName(name = 'document') {
  return String(name).replace(/\.pdf$/i, '') || 'document';
}

export function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Échantillonne la couleur de fond autour d'un rectangle (rectangle CSS px). */
export function sampleCanvasBackground(canvas, rect, margin = 6) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#ffffff';
  const ratioX = canvas.width / Math.max(1, parseFloat(canvas.style.width) || canvas.width);
  const ratioY = canvas.height / Math.max(1, parseFloat(canvas.style.height) || canvas.height);
  // Points sur et autour du cadre (jamais au centre : c'est là qu'est le texte).
  // Les voisins proches (bordures de tableau, texte d'à côté) sont minoritaires :
  // on retient la couleur la plus fréquente, pas la médiane.
  const pts = [];
  const L = rect.left;
  const R = rect.left + rect.width;
  const T = rect.top;
  const B = rect.top + rect.height;
  for (const m of [1.5, margin]) {
    for (let i = 0; i <= 6; i++) {
      const fx = L + ((R - L) * i) / 6;
      const fy = T + ((B - T) * i) / 6;
      pts.push([fx, T - m], [fx, B + m], [L - m, fy], [R + m, fy]);
    }
  }
  const buckets = new Map();
  for (const [x, y] of pts) {
    const px = Math.round(x * ratioX);
    const py = Math.round(y * ratioY);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
    try {
      const d = ctx.getImageData(px, py, 1, 1).data;
      if (d[3] <= 200) continue;
      const key = `${d[0] >> 4},${d[1] >> 4},${d[2] >> 4}`;
      const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++;
      e.r += d[0];
      e.g += d[1];
      e.b += d[2];
      buckets.set(key, e);
    } catch {
      /* ignore */
    }
  }
  if (!buckets.size) return '#ffffff';
  let total = 0;
  for (const e of buckets.values()) total += e.n;
  let best = null;
  // Papier blanc présent sur au moins 40 % du pourtour : c'est le fond (un gris
  // intermédiaire vient alors du texte ou des traits voisins, jamais du papier).
  for (const e of buckets.values()) {
    if (e.n / total >= 0.4 && Math.min(e.r, e.g, e.b) / e.n > 245) best = e;
  }
  if (best) return rgbToHex(Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n));
  for (const e of buckets.values()) {
    // À fréquence égale, on préfère le plus clair (papier plutôt que trait).
    if (!best || e.n > best.n || (e.n === best.n && e.r + e.g + e.b > best.r + best.g + best.b)) best = e;
  }
  return rgbToHex(Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n));
}
