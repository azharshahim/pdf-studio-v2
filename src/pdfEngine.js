import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { assetUrl } from './utils.js';
import { matchCatalogByName } from './fonts.js';

// Le build `legacy` de pdf.js inclut les polyfills (Promise.try,
// Map#getOrInsertComputed…) nécessaires aux navigateurs un peu anciens.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PDF_OPTS = {
  cMapUrl: assetUrl('pdfjs/cmaps/'),
  cMapPacked: true,
  standardFontDataUrl: assetUrl('pdfjs/standard_fonts/'),
  wasmUrl: assetUrl('pdfjs/wasm/'),
};

function mapFontFamily(family = '') {
  const f = String(family).toLowerCase();
  if (f.includes('mono')) return 'Courier';
  if (f.includes('serif') && !f.includes('sans')) return 'Times';
  return 'Helvetica';
}

/** Devine famille / graisse / style depuis le nom réel de la police. */
export function fontTraits(font) {
  const name = String(font?.name || '');
  const lower = name.toLowerCase();
  const bold =
    typeof font?.bold === 'boolean'
      ? font.bold
      : /bold|black|heavy|semibold|demi|extrabold/.test(lower);
  const italic =
    typeof font?.italic === 'boolean'
      ? font.italic
      : /italic|oblique/.test(lower);
  let family = 'Helvetica';
  const catalog = matchCatalogByName(name);
  if (catalog) family = catalog;
  else if (/courier|mono|consolas|menlo/.test(lower)) family = 'Courier';
  else if (/times|georgia|garamond|palatino|cambria|serif|bookman|book/.test(lower) && !/sans/.test(lower)) {
    family = 'Times';
  }
  return { family, bold, italic, name };
}

/** Regroupe les fragments de texte de pdf.js en lignes éditables. */
export function buildLines(items, styles, pageNo, fontMap = {}) {
  const raw = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || !it.str.length) continue;
    const tr = it.transform;
    // On ignore le texte pivoté (rare, ex. titres verticaux)
    const rotated = Math.abs(tr[1]) > Math.abs(tr[0]) * 0.12 && Math.abs(tr[2]) > Math.abs(tr[3]) * 0.12;
    if (rotated) continue;
    const fontSize = Math.hypot(tr[2], tr[3]) || it.height || 10;
    const traits = fontMap[it.fontName];
    raw.push({
      str: it.str,
      x: tr[4],
      baseline: tr[5],
      width: it.width || 0,
      fontSize,
      hasEOL: !!it.hasEOL,
      fontId: it.fontName || null,
      fontFamily: styles?.[it.fontName]?.fontFamily || '',
      bold: !!traits?.bold,
      italic: !!traits?.italic,
      traitsKnown: !!traits,
      traitsFamily: traits?.family || '',
    });
  }

  raw.sort((a, b) => b.baseline - a.baseline || a.x - b.x);

  const out = [];
  let cur = null;

  const finalize = (line) => {
    const text = line.text.replace(/\s+/g, ' ').trim();
    if (!text) return;
    out.push({
      id: `p${pageNo}-l${out.length}`,
      text,
      x: line.x,
      y: line.baseline,
      width: line.width,
      fontSize: line.fontSize,
      fontFamily: line.fontFamily,
      fontId: line.fontId,
      bold: !!line.bold,
      italic: !!line.italic,
      traitsFamily: line.traitsFamily,
      hasEOL: line.hasEOL,
    });
  };

  const close = () => {
    if (cur) finalize(cur);
    cur = null;
  };

  for (const it of raw) {
    if (!it.str.trim()) {
      if (cur && it.hasEOL) close();
      continue;
    }
    const tol = Math.max(1.4, Math.min(it.fontSize, 48) * 0.42);
    // Changement de style au milieu d'une ligne (« N° SS » gras puis un numéro
    // normal) : un bloc par style, comme Acrobat, pour qu'éditer l'un ne
    // transforme pas l'autre (graisse, taille).
    const styleChange =
      !!cur &&
      cur.fontId !== it.fontId &&
      (!cur.traitsKnown || !it.traitsKnown || cur.bold !== it.bold || cur.italic !== it.italic) &&
      it.str.trim().length > 0;
    const sizeChange = !!cur && Math.max(cur.fontSize, it.fontSize) / Math.max(0.1, Math.min(cur.fontSize, it.fontSize)) > 1.18;
    const startsNew =
      !cur ||
      styleChange ||
      sizeChange ||
      Math.abs(it.baseline - cur.baseline) > tol ||
      it.x - cur.endX > Math.max(6, it.fontSize * 1.05) ||
      it.x < cur.x - Math.max(10, it.fontSize * 1.5);

    if (startsNew) {
      close();
      cur = {
        text: it.str,
        x: it.x,
        endX: it.x + it.width,
        width: it.width,
        baseline: it.baseline,
        fontSize: it.fontSize,
        fontFamily: it.fontFamily,
        fontId: it.fontId,
        bold: it.bold,
        italic: it.italic,
        traitsKnown: it.traitsKnown,
        traitsFamily: it.traitsFamily,
        hasEOL: it.hasEOL,
      };
    } else {
      const gap = it.x - cur.endX;
      const needSpace =
        gap > Math.max(0.7, it.fontSize * 0.13) && !/\s$/.test(cur.text) && !/^\s/.test(it.str);
      cur.text += (needSpace ? ' ' : '') + it.str;
      cur.endX = Math.max(cur.endX, it.x + it.width);
      cur.x = Math.min(cur.x, it.x);
      cur.width = cur.endX - cur.x;
      cur.baseline = Math.max(cur.baseline, it.baseline);
      cur.fontSize = Math.max(cur.fontSize, it.fontSize);
      cur.hasEOL = it.hasEOL;
      if (!cur.fontFamily && it.fontFamily) cur.fontFamily = it.fontFamily;
    }
    if (it.hasEOL) close();
  }
  close();

  // Conversion en objets « line » prêts pour l'édition
  return out.map((l) => {
    const fontSize = Math.max(4, l.fontSize);
    return {
      id: l.id,
      text: l.text,
      source: 'pdf',
      font: l.traitsFamily || mapFontFamily(l.fontFamily),
      bold: !!l.bold,
      italic: !!l.italic,
      fontId: l.fontId || null,
      traitsResolved: !!l.traitsFamily,
      fontSize,
      baseline: l.y,
      bbox: {
        x: l.x,
        y: l.y - fontSize * 0.26,
        w: Math.max(2, l.width),
        h: fontSize * 1.14,
      },
    };
  });
}

const OP = pdfjsLib.OPS || {};

const mulCtm = (m, n) => [
  n[0] * m[0] + n[1] * m[2],
  n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2],
  n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4],
  n[4] * m[1] + n[5] * m[3] + m[5],
];

/**
 * Vrai si le texte de la page n'est pas celui qu'on voit : couche de
 * reconnaissance cachée des scans, soit en mode « invisible » (3), soit
 * écrite sous une image qui recouvre la page. Sa police (souvent Courier)
 * n'a rien à voir avec ce qu'on voit sur l'image.
 * @param {number} pageArea surface de la page (en unités utilisateur)
 */
export function hasInvisibleText(fnArray = [], argsArray = [], ops = OP, pageArea = 0) {
  const shows = new Set([ops.showText, ops.showSpacedText, ops.nextLineShowText, ops.nextLineSetSpacingShowText]);
  const images = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintJpegXObject].filter((x) => x !== undefined));
  let mode = 0;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let visibleTextSeen = false;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === ops.save) stack.push({ mode, ctm });
    else if (fn === ops.restore) {
      const top = stack.pop();
      mode = top ? top.mode : 0;
      ctm = top ? top.ctm : [1, 0, 0, 1, 0, 0];
    } else if (fn === ops.transform) {
      const a = argsArray[i];
      if (a && a.length >= 6) ctm = mulCtm(ctm, a);
    } else if (fn === ops.setTextRenderingMode) mode = Number(argsArray[i]?.[0]) || 0;
    else if (shows.has(fn)) {
      if (mode === 3) return true;
      visibleTextSeen = true;
    } else if (images.has(fn) && pageArea > 0 && visibleTextSeen) {
      // Image qui recouvre l'essentiel de la page, dessinée après le texte.
      const cover = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) / pageArea;
      if (cover >= 0.6) return true;
    }
  }
  return false;
}

export class PdfEngine {
  constructor(bytes) {
    this.bytes = bytes;
    this.doc = null;
    this.numPages = 0;
    this.pageCache = new Map();
  }

  async load(password = '') {
    const task = pdfjsLib.getDocument({
      data: this.bytes,
      password: password || undefined,
      ...PDF_OPTS,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    this.doc = await task.promise;
    this.numPages = this.doc.numPages;
    return this.doc;
  }

  async getPage(n) {
    if (!this.pageCache.has(n)) {
      const promise = this.doc.getPage(n);
      this.pageCache.set(n, promise);
    }
    return this.pageCache.get(n);
  }

  async getPageSize(n) {
    const page = await this.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    return { width: vp.width, height: vp.height, rotation: page.rotate || 0 };
  }

  async getViewport(n, scale) {
    const page = await this.getPage(n);
    return page.getViewport({ scale });
  }

  async extractLines(n) {
    const page = await this.getPage(n);
    const tc = await page.getTextContent();
    const fontMap = {};
    const ids = new Set(tc.items.map((it) => it.fontName).filter(Boolean));
    for (const id of ids) {
      try {
        const font = page.commonObjs?.get(id);
        if (font) fontMap[id] = fontTraits(font);
      } catch {
        /* police pas encore chargée */
      }
    }
    const lines = buildLines(tc.items, tc.styles, n, fontMap);
    if (lines.length && (await this.pageHasHiddenText(page))) {
      // Texte caché d'un scan : on propose une police nette plutôt que Courier.
      for (const l of lines) {
        l.font = 'Helvetica';
        l.bold = false;
        l.italic = false;
        l.fontId = null;
        l.traitsResolved = true;
        l.hiddenLayer = true;
      }
    }
    return lines;
  }

  async pageHasHiddenText(page) {
    try {
      const ops = await page.getOperatorList();
      const [x0, y0, x1, y1] = page.view || [0, 0, 0, 0];
      return hasInvisibleText(ops.fnArray, ops.argsArray, OP, Math.abs((x1 - x0) * (y1 - y0)));
    } catch {
      return false;
    }
  }

  /**
   * Dessine une page dans un canvas.
   * @returns {Promise<import('pdfjs-dist').PageViewport>}
   */
  async renderToCanvas(n, canvas, scale, dpr = 1, ctxOptions = {}) {
    const page = await this.getPage(n);
    const viewport = page.getViewport({ scale });
    const w = Math.max(1, Math.floor(viewport.width * dpr));
    const h = Math.max(1, Math.floor(viewport.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d', ctxOptions);
    const task = page.render({
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      background: '#ffffff',
    });
    await task.promise;
    return viewport;
  }

  destroy() {
    try {
      this.doc?.destroy();
    } catch {
      /* ignore */
    }
    this.pageCache.clear();
  }
}

/** Rectangle PDF (x, y, w, h) → rectangle CSS dans le repère du viewport. */
export function pdfRectToViewportRect(bbox, viewport) {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    bbox.x,
    bbox.y,
    bbox.x + bbox.w,
    bbox.y + bbox.h,
  ]);
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
