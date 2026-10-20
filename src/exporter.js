/**
 * Export PDF : suppression réelle du texte remplacé, masquage de secours,
 * police Unicode (Noto Sans / Noto Naskh Arabic) et couche OCR invisible.
 *
 * Trois stratégies de « caviardage » sont disponibles :
 *  - `stream` (défaut) : les opérateurs de texte d'origine sont retirés du flux
 *    de contenu (voir textRemoval.js) ; repli automatique sur le masque si la
 *    page n'est pas modifiable sans risque ;
 *  - `raster` : la page est rastérisée, la zone éditée repeinte, ce qui garantit
 *    la disparition du texte d'origine même dans les cas complexes ;
 *  - `mask` : ancien comportement (rectangle de couleur), conservé en option.
 */

import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ArabicShaper } from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';
import { assetUrl, clamp, hexToRgb01 } from './utils.js';
import { removeTextInBBoxes } from './textRemoval.js';

const bidi = bidiFactory();

const FONT_SETS = {
  Helvetica: {
    normal: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  Times: {
    normal: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  Courier: {
    normal: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
};

const EXTRA_WINANSI = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

const UNICODE_FONTS = {
  sans: {
    normal: 'NotoSans-Regular.ttf',
    bold: 'NotoSans-Bold.ttf',
    italic: 'NotoSans-Italic.ttf',
    boldItalic: 'NotoSans-BoldItalic.ttf',
  },
  arabic: {
    normal: 'NotoNaskhArabic-Regular.ttf',
    bold: 'NotoNaskhArabic-Bold.ttf',
    italic: 'NotoNaskhArabic-Regular.ttf',
    boldItalic: 'NotoNaskhArabic-Bold.ttf',
  },
};

/** Vrai si le caractère est encodable avec les polices standard (WinAnsi). */
export function isWinAnsiChar(ch) {
  if (ch === '\n') return true;
  const cp = ch.codePointAt(0);
  if ((cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255)) return true;
  return EXTRA_WINANSI.has(ch);
}

export function isWinAnsiText(text = '') {
  for (const ch of String(text)) {
    if (ch === '\n') continue;
    if (!isWinAnsiChar(ch)) return false;
  }
  return true;
}

/** Supprime les caractères non encodables en WinAnsi (polices standard). */
export function sanitizePdfText(input = '') {
  let out = '';
  const text = String(input).replace(/\r/g, '').replace(/\t/g, '    ');
  for (const ch of text) {
    if (ch === '\n') {
      out += ch;
      continue;
    }
    const cp = ch.codePointAt(0);
    if ((cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255) || EXTRA_WINANSI.has(ch)) {
      out += ch;
    } else if (ch === '\u00a0' || ch === '\u2009' || ch === '\u202f') {
      out += ' ';
    } else if (ch === '\u2010' || ch === '\u2011' || ch === '\u2212') {
      out += '-';
    } else if (ch === '\u0152') {
      out += 'OE';
    } else if (ch === '\u0153') {
      out += 'oe';
    } else if (ch === '\u2018' || ch === '\u2019' || ch === '\u02bc') {
      out += "'";
    } else if (ch === '\u201c' || ch === '\u201d') {
      out += '"';
    }
    // le reste (emoji, symboles…) est ignoré
  }
  return out;
}

const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;

/** Détecte la présence de caractères arabes. */
export function hasArabic(text = '') {
  return ARABIC_RE.test(String(text));
}

/**
 * Découpe une ligne en segments homogènes (arabe / non arabe). Les espaces et
 * ponctuations accolés à un segment arabe y restent rattachés.
 */
export function splitScriptRuns(text = '') {
  const runs = [];
  let current = null;
  for (const ch of String(text)) {
    const arabic = ARABIC_RE.test(ch);
    const neutral = /[\s.,;:!?«»“”"'()\[\]{}—–-]/.test(ch);
    if (!current) {
      current = { arabic, text: ch };
      runs.push(current);
    } else if (arabic === current.arabic || (neutral && current.arabic)) {
      current.text += ch;
    } else {
      current = { arabic, text: ch };
      runs.push(current);
    }
  }
  return runs;
}

/**
 * Prépare une ligne pour le dessin : shaping arabe (formes contextuelles)
 * puis réordonnancement bidi. Les autres écritures sont laissées telles quelles.
 */
export function prepareTextForPdf(text = '') {
  const value = String(text);
  if (!hasArabic(value)) return value;
  try {
    const shaped = ArabicShaper.convertArabic(value);
    const levels = bidi.getEmbeddingLevels(shaped, 'auto');
    return bidi.getReorderedString(shaped, levels);
  } catch {
    return value;
  }
}

/* ------------------------------------------------------------------ */
/* Chargement des polices Unicode                                      */
/* ------------------------------------------------------------------ */

const fileBytesCache = new Map();
const parsedFontCache = new Map();
let unicodeReady = null;

async function fetchFontBytes(file) {
  if (!fileBytesCache.has(file)) {
    const promise = (async () => {
      if (typeof fetch !== 'function') throw new Error('fetch indisponible');
      const res = await fetch(assetUrl(`fonts/${file}`));
      if (!res.ok) throw new Error(`police introuvable : ${file}`);
      return new Uint8Array(await res.arrayBuffer());
    })();
    fileBytesCache.set(file, promise);
  }
  return fileBytesCache.get(file);
}

/** Charge (une fois) les polices Noto et expose leurs tables de glyphes. */
function ensureUnicodeFonts() {
  if (!unicodeReady) {
    unicodeReady = (async () => {
      const files = new Set();
      for (const set of Object.values(UNICODE_FONTS)) {
        for (const f of Object.values(set)) files.add(f);
      }
      await Promise.all([...files].map((f) => fetchFontBytes(f)));
      for (const f of files) {
        parsedFontCache.set(f, fontkit.create(await fetchFontBytes(f)));
      }
      return true;
    })().catch((err) => {
      console.warn('[exporter] polices Unicode indisponibles', err);
      unicodeReady = null;
      return false;
    });
  }
  return unicodeReady;
}

function fontFileFor(kind, bold, italic) {
  const set = UNICODE_FONTS[kind] || UNICODE_FONTS.sans;
  if (bold && italic) return set.boldItalic;
  if (bold) return set.bold;
  if (italic) return set.italic;
  return set.normal;
}

function coverageOf(file) {
  return parsedFontCache.get(file) || null;
}

function missingInFont(text, file) {
  const font = coverageOf(file);
  if (!font) return [];
  const missing = [];
  for (const ch of String(text)) {
    if (ch === '\n' || ch === '\r') continue;
    const cp = ch.codePointAt(0);
    if (/\s/.test(ch)) continue;
    let ok = false;
    try {
      ok = font.hasGlyphForCodePoint(cp);
    } catch {
      ok = false;
    }
    if (!ok) missing.push(ch);
  }
  return missing;
}

/**
 * Analyse les textes avant export et renvoie les caractères qu'aucune police
 * embarquée ne peut dessiner (à afficher dans un avertissement).
 */
export async function analyzeExport({ edits = [], ocrPages = [] } = {}) {
  const ready = await ensureUnicodeFonts();
  if (!ready) return { ready: false, missing: [], arabic: false };
  const missing = new Map();
  let arabic = false;

  const check = (text) => {
    const value = String(text || '');
    if (!value.trim()) return;
    if (hasArabic(value)) arabic = true;
    // On analyse le texte tel qu'il sera dessiné (shaping + bidi), segment par segment.
    const visual = prepareTextForPdf(value);
    for (const run of splitScriptRuns(visual)) {
      if (run.arabic) {
        for (const ch of missingInFont(run.text, fontFileFor('arabic', false, false))) {
          const prev = missing.get(ch) || { char: ch, count: 0, sample: value.slice(0, 60) };
          prev.count++;
          missing.set(ch, prev);
        }
      } else if (!isWinAnsiText(run.text)) {
        for (const ch of missingInFont(run.text, fontFileFor('sans', false, false))) {
          const prev = missing.get(ch) || { char: ch, count: 0, sample: value.slice(0, 60) };
          prev.count++;
          missing.set(ch, prev);
        }
      }
    }
  };

  for (const e of edits) check(e.text);
  for (const { ocr } of ocrPages) {
    for (const line of ocr?.lines || []) check(line.text);
  }

  return { ready: true, missing: [...missing.values()], arabic };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function overlaps(cx, cy, b) {
  return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
}

async function canvasToPngBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('rastérisation impossible');
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * @param {object} options
 * @param {Uint8Array} options.sourceBytes
 * @param {Array} options.edits
 * @param {Array<{pageNo:number, ocr:object}>} options.ocrPages
 * @param {'stream'|'raster'|'mask'} [options.redactMode]
 * @param {(pageNo:number)=>Promise<HTMLCanvasElement>} [options.renderPage]
 * @returns {Promise<{bytes:Uint8Array, stats:object, missingChars:Array}>}
 */
export async function exportPdf({
  sourceBytes,
  edits = [],
  ocrPages = [],
  redactMode = 'stream',
  renderPage = null,
}) {
  const pdfDoc = await PDFDocument.load(sourceBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();

  const standardCache = new Map();
  const unicodeCache = new Map();
  const missingChars = new Set();

  const getStandardFont = async (family, bold, italic) => {
    const set = FONT_SETS[family] || FONT_SETS.Helvetica;
    const variant = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    const key = `${family}-${variant}`;
    if (!standardCache.has(key)) standardCache.set(key, await pdfDoc.embedFont(set[variant]));
    return standardCache.get(key);
  };

  const getUnicodeFont = async (kind, bold, italic) => {
    const file = fontFileFor(kind, bold, italic);
    if (!unicodeCache.has(file)) {
      const bytes = await fetchFontBytes(file);
      unicodeCache.set(file, await pdfDoc.embedFont(bytes, { subset: true }));
    }
    return unicodeCache.get(file);
  };

  /** Choisit la police adaptée à un segment de texte. */
  const resolveRunFont = async (run, family, bold, italic) => {
    if (run.arabic) {
      const file = fontFileFor('arabic', bold, false);
      return { font: await getUnicodeFont('arabic', bold, false), unicode: true, file };
    }
    if (!isWinAnsiText(run.text)) {
      const file = fontFileFor('sans', bold, italic);
      return { font: await getUnicodeFont('sans', bold, italic), unicode: true, file };
    }
    return { font: await getStandardFont(family, bold, italic), unicode: false, file: null };
  };

  const editsByPage = new Map();
  for (const e of edits) {
    if (!editsByPage.has(e.page)) editsByPage.set(e.page, []);
    editsByPage.get(e.page).push(e);
  }

  const stats = { removedPages: [], rasterizedPages: [], maskedPages: [] };

  // 1. Suppression réelle du texte d'origine (ou rastérisation si demandée)
  let removedBoxes = new Map();
  if (redactMode === 'stream' && editsByPage.size) {
    removedBoxes = removeTextInBBoxes(pdfDoc, editsByPage);
    stats.removedPages = [...removedBoxes.keys()];
  }

  if (redactMode === 'raster' && renderPage) {
    for (const [pageNo, pageEdits] of editsByPage) {
      const page = pages[pageNo - 1];
      if (!page) continue;
      const rotation = page.getRotation().angle || 0;
      if (rotation % 360 !== 0) {
        stats.maskedPages.push(pageNo);
        continue;
      }
      try {
        const { width: pageW, height: pageH } = page.getSize();
        const canvas = await renderPage(pageNo);
        const ctx = canvas.getContext('2d');
        const scale = canvas.width / pageW;
        for (const e of pageEdits) {
          if (!e.bg || e.bg === 'none') continue;
          const padX = Math.max(1, (e.size || 10) * 0.12);
          const padY = Math.max(0.8, (e.size || 10) * 0.05);
          const { r, g, b } = hexToRgb01(e.bg, { r: 1, g: 1, b: 1 });
          ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
          ctx.fillRect(
            (e.bbox.x - padX) * scale,
            (pageH - (e.bbox.y + e.bbox.h + padY)) * scale,
            (e.bbox.w + padX * 2) * scale,
            (e.bbox.h + padY * 2) * scale
          );
        }
        const png = await canvasToPngBytes(canvas);
        const image = await pdfDoc.embedPng(png);
        page.node.delete(PDFName.of('Contents'));
        page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
        stats.rasterizedPages.push(pageNo);
      } catch (err) {
        console.warn(`[exporter] rastérisation impossible page ${pageNo}`, err);
        stats.maskedPages.push(pageNo);
      }
    }
  }

  // 2. Masque de secours pour les zones non retirées du flux
  for (const [pageNo, pageEdits] of editsByPage) {
    if (stats.rasterizedPages.includes(pageNo)) continue;
    const page = pages[pageNo - 1];
    if (!page) continue;
    const removed = removedBoxes.get(pageNo) || new Set();
    const sorted = [...pageEdits].sort((a, b) => b.bbox.y - a.bbox.y);
    let masked = false;
    for (const e of sorted) {
      if (!e.bg || e.bg === 'none') continue;
      if (removed.has(e.bbox)) continue;
      const { r, g, b } = hexToRgb01(e.bg, { r: 1, g: 1, b: 1 });
      const padX = Math.max(1, (e.size || 10) * 0.12);
      const padY = Math.max(0.8, (e.size || 10) * 0.05);
      page.drawRectangle({
        x: e.bbox.x - padX,
        y: e.bbox.y - padY,
        width: e.bbox.w + padX * 2,
        height: e.bbox.h + padY * 2,
        color: rgb(r, g, b),
      });
      masked = true;
    }
    if (masked) stats.maskedPages.push(pageNo);
  }

  // 3. Nouveau texte
  for (const [pageNo, pageEdits] of editsByPage) {
    const page = pages[pageNo - 1];
    if (!page) continue;
    const sorted = [...pageEdits].sort((a, b) => b.bbox.y - a.bbox.y);
    for (const e of sorted) {
      const raw = String(e.text || '');
      if (!raw.trim()) continue;
      const color = hexToRgb01(e.color || '#111827');
      const preparedLines = prepareTextForPdf(raw).split('\n');
      let size = clamp(Number(e.size) || 12, 4, 300);

      // Prépare chaque ligne en segments (arabe / latin / symboles).
      const prepared = [];
      for (const line of preparedLines) {
        const runs = [];
        for (const run of splitScriptRuns(line)) {
          const resolved = await resolveRunFont(run, e.font, e.bold, e.italic);
          const text = resolved.unicode ? run.text : sanitizePdfText(run.text);
          if (!text) continue;
          if (resolved.unicode && resolved.file) {
            for (const ch of missingInFont(run.text, resolved.file)) missingChars.add(ch);
          }
          runs.push({ text, font: resolved.font });
        }
        prepared.push(runs);
      }

      const widthOf = (runs, s) => runs.reduce((acc, r) => acc + r.font.widthOfTextAtSize(r.text, s), 0);
      if (e.fit !== false && e.bbox.w > 2) {
        let factor = 1;
        for (const runs of prepared) {
          const w = widthOf(runs, size);
          if (w > e.bbox.w + 1) factor = Math.min(factor, (e.bbox.w + 1) / w);
        }
        size = Math.max(4, size * factor);
      }

      const lineHeight = size * 1.16;
      let y = e.baseline ?? e.bbox.y + e.bbox.h * 0.24;
      for (const runs of prepared) {
        let x = e.bbox.x + 0.5;
        for (const run of runs) {
          if (!run.text.trim()) {
            x += run.font.widthOfTextAtSize(run.text, size);
            continue;
          }
          page.drawText(run.text, {
            x,
            y,
            size,
            font: run.font,
            color: rgb(color.r, color.g, color.b),
          });
          x += run.font.widthOfTextAtSize(run.text, size);
        }
        y -= lineHeight;
      }
    }
  }

  // 4. Couche OCR invisible (texte recherchable / sélectionnable)
  for (const { pageNo, ocr } of ocrPages) {
    const page = pages[pageNo - 1];
    if (!page) continue;
    const items = ocr?.lines?.length
      ? ocr.lines.map((l) => ({ text: l.text, bbox: l.bbox }))
      : (ocr?.words || []).map((w) => ({ text: w.text, bbox: w.bbox }));
    if (!items.length) continue;
    const pageEdits = editsByPage.get(pageNo) || [];
    for (const item of items) {
      const b = item.bbox;
      if (!b || b.w <= 0.5 || b.h <= 0.5) continue;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (pageEdits.some((e) => overlaps(cx, cy, e.bbox))) continue;
      const raw = String(item.text || '').trim();
      if (!raw) continue;
      const visual = prepareTextForPdf(raw);
      const runs = [];
      for (const run of splitScriptRuns(visual)) {
        const resolved = await resolveRunFont(run, 'Helvetica', false, false);
        const text = resolved.unicode ? run.text : sanitizePdfText(run.text);
        if (text) runs.push({ text, font: resolved.font });
      }
      if (!runs.length) continue;
      let size = clamp(b.h * 0.88, 2.5, 200);
      try {
        const total = runs.reduce((acc, r) => acc + r.font.widthOfTextAtSize(r.text, size), 0);
        if (total > b.w * 1.12) size = Math.max(2.5, size * ((b.w * 1.12) / total));
        let x = b.x;
        for (const run of runs) {
          page.drawText(run.text, {
            x,
            y: b.y + b.h * 0.16,
            size,
            font: run.font,
            color: rgb(0, 0, 0),
            opacity: 0,
          });
          x += run.font.widthOfTextAtSize(run.text, size);
        }
      } catch {
        /* caractère non supporté — signalé via missingChars */
      }
    }
  }

  const bytes = await pdfDoc.save();
  return { bytes, stats, missingChars: [...missingChars] };
}
