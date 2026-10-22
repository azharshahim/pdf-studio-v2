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

import {
  PDFDocument,
  PDFName,
  PDFHexString,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  setCharacterSpacing,
  setCharacterSqueeze,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ArabicShaper } from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';
import { assetUrl, clamp, hexToRgb01 } from './utils.js';
import { removeTextInBBoxes } from './textRemoval.js';
import { catalogFont, catalogFile, localFontBytes } from './fonts.js';

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

async function canvasToImageBytes(canvas, quality = 1) {
  const type = quality >= 1 ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('rastérisation impossible');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type };
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
  rasterQuality = 1,
  objects = [],
}) {
  const pdfDoc = await PDFDocument.load(sourceBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();

  const standardCache = new Map();
  const unicodeCache = new Map();
  const catalogCache = new Map();
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
    if (catalogFont(family)?.local) {
      const key = `local:${family}:${bold ? 'b' : ''}${italic ? 'i' : ''}`;
      try {
        if (!catalogCache.has(key)) {
          const bytes = await localFontBytes(family, bold, italic);
          catalogCache.set(key, bytes ? await pdfDoc.embedFont(bytes, { subset: true }) : null);
        }
        const font = catalogCache.get(key);
        if (font && [...String(run.text)].every((ch) => font.getCharacterSet().includes(ch.codePointAt(0)))) {
          return { font, unicode: true, file: key };
        }
      } catch (err) {
        console.warn('[export] police locale inutilisable', family, err);
        catalogCache.set(key, null);
      }
      const file = fontFileFor('sans', bold, italic);
      return { font: await getUnicodeFont('sans', bold, italic), unicode: true, file };
    }
    const catFile = catalogFont(family) ? catalogFile(family, bold, italic) : null;
    if (catFile) {
      if (!catalogCache.has(catFile)) {
        // Les fichiers .woff2 servent à l'écran ; pdf-lib ne sait pas sous-ensembler
        // un WOFF2 (table loca vide), on embarque donc la version TrueType.
        const bytes = await fetchFontBytes(catFile.replace(/\.woff2$/, '.ttf'));
        catalogCache.set(catFile, await pdfDoc.embedFont(bytes, { subset: true }));
      }
      const font = catalogCache.get(catFile);
      // Caractère absent de la police (ex. alphabet non latin) : repli sur Noto Sans.
      const covered = [...String(run.text)].every((ch) => font.getCharacterSet().includes(ch.codePointAt(0)));
      if (covered) return { font, unicode: true, file: catFile };
    }
    if (family === 'Noto Sans' || catFile || !isWinAnsiText(run.text)) {
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
        const encoded = await canvasToImageBytes(canvas, rasterQuality);
        const image =
          encoded.type === 'image/jpeg'
            ? await pdfDoc.embedJpg(encoded.bytes)
            : await pdfDoc.embedPng(encoded.bytes);
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
      // Texte réellement retiré du flux : rien à masquer. Couche cachée (scan) :
      // l'image du scan reste dessous, il faut toujours la couvrir.
      if (removed.has(e.bbox) && !e.hiddenLayer && e.source !== 'ocr') continue;
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

      // Espacement des caractères (pt, opérateur Tc) et échelle horizontale (%, Tz).
      const tc = clamp(Number(e.charSpacing) || 0, -5, 50);
      const hz = clamp(Number(e.hScale) || 100, 20, 400) / 100;
      const runW = (r, s) => (r.font.widthOfTextAtSize(r.text, s) + tc * [...r.text].length) * hz;
      const widthOf = (runs, s) => runs.reduce((acc, r) => acc + runW(r, s), 0);
      const spaced = tc !== 0 || hz !== 1;
      if (spaced) page.pushOperators(pushGraphicsState(), setCharacterSpacing(tc), setCharacterSqueeze(hz * 100));
      if (e.fit !== false && e.bbox.w > 2) {
        let factor = 1;
        for (const runs of prepared) {
          const w = widthOf(runs, size);
          if (w > e.bbox.w + 1) factor = Math.min(factor, (e.bbox.w + 1) / w);
        }
        size = Math.max(4, size * factor);
      }

      const lineHeight =
        size * (Number.isFinite(Number(e.lineHeight)) && Number(e.lineHeight) > 0 ? Number(e.lineHeight) : 1.16);
      const align = e.align === 'center' || e.align === 'right' ? e.align : 'left';
      let y = e.baseline ?? e.bbox.y + e.bbox.h * 0.24;
      for (const runs of prepared) {
        const total = widthOf(runs, size);
        let x = e.bbox.x + 0.5;
        if (align === 'center') x = e.bbox.x + (e.bbox.w - total) / 2;
        else if (align === 'right') x = e.bbox.x + e.bbox.w - total;
        const startX = x;
        for (const run of runs) {
          if (!run.text.trim()) {
            x += runW(run, size);
            continue;
          }
          page.drawText(run.text, {
            x,
            y,
            size,
            font: run.font,
            color: rgb(color.r, color.g, color.b),
          });
          x += runW(run, size);
        }
        if (e.underline && total > 0.2) {
          page.drawLine({
            start: { x: startX, y: y - size * 0.14 },
            end: { x: startX + total, y: y - size * 0.14 },
            thickness: Math.max(0.5, size * 0.055),
            color: rgb(color.r, color.g, color.b),
          });
        }
        y -= lineHeight;
      }
      if (spaced) page.pushOperators(popGraphicsState());
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

  // 4. Annotations, signatures, tampons et images posés sur la page
  if (objects.length) {
    try {
      stats.markup = await drawObjects(pdfDoc, pages, objects);
      if (!stats.markup) delete stats.markup;
    } catch (err) {
      console.warn('[exporter] annotations non dessinées', err);
    }
  }

  const bytes = await pdfDoc.save();
  return { bytes, stats, missingChars: [...missingChars] };
}


/* ─────────────── Annotations, signatures, tampons, images ─────────────── */

function dataUrlBytes(src) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(src || '');
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime: match[1], bytes };
}

/** Convertit un tracé de points PDF en chemin SVG (repère PDF, y vers le haut). */
export function pointsToSvgPath(points = []) {
  if (!points.length) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

/**
 * Dessine les objets (annotations, signatures, tampons, images) sur le PDF.
 * Les bbox sont exprimées en points PDF avec l'origine en bas à gauche.
 */
export async function drawObjects(pdfDoc, pages, objects) {
  let drawn = 0;
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Caractères hors WinAnsi (arabe, emoji…) : remplacés par « ? » plutôt que
  // de faire échouer tout l'export.
  const safeText = (text) =>
    [...String(text)]
      .map((ch) => (ch === '\n' ? ' ' : font.getCharacterSet().includes(ch.codePointAt(0)) ? ch : '?'))
      .join('');
  const imageCache = new Map();

  const embedImage = async (src) => {
    if (imageCache.has(src)) return imageCache.get(src);
    const data = dataUrlBytes(src);
    if (!data) return null;
    const image = data.mime.includes('jpeg') || data.mime.includes('jpg')
      ? await pdfDoc.embedJpg(data.bytes)
      : await pdfDoc.embedPng(data.bytes);
    imageCache.set(src, image);
    return image;
  };

  for (const obj of objects) {
    const page = pages[(obj.page || 1) - 1];
    if (!page) continue;
    // Les tracés libres n'ont pas de bbox : on la déduit des points.
    if (!obj.bbox && obj.type === 'ink' && obj.points?.length) {
      const xs = obj.points.map((p) => p.x);
      const ys = obj.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      obj.bbox = { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
    if (!obj.bbox) continue;
    const { x, y, w, h } = obj.bbox;
    drawn++;
    const { r, g, b } = hexToRgb01(obj.color || '#111827', { r: 0, g: 0, b: 0 });
    const color = rgb(r, g, b);

    // Rotation affichée à l'écran : sens horaire autour du centre de la boîte.
    const rot = Number(obj.rotation) || 0;
    const rotated = rot % 360 !== 0 && obj.type !== 'ink' && obj.type !== 'note';
    if (rotated) {
      const a = (-rot * Math.PI) / 180;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos)
      );
    }

    if (obj.type === 'highlight') {
      page.drawRectangle({ x, y, width: w, height: h, color, opacity: 0.38, borderWidth: 0 });
    } else if (obj.type === 'underline') {
      page.drawRectangle({ x, y, width: w, height: Math.max(1, h * 0.16), color });
    } else if (obj.type === 'strike') {
      const thickness = Math.max(1, h * 0.14);
      page.drawRectangle({ x, y: y + h / 2 - thickness / 2, width: w, height: thickness, color });
    } else if (obj.type === 'ink') {
      const points = obj.points || [];
      const thickness = Math.max(0.6, obj.width || 2);
      for (let i = 1; i < points.length; i++) {
        page.drawLine({
          start: { x: points[i - 1].x, y: points[i - 1].y },
          end: { x: points[i].x, y: points[i].y },
          color,
          thickness,
          lineCap: 1,
        });
      }
    } else if (obj.type === 'rect') {
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: color,
        borderWidth: Math.max(0.8, obj.width || 2),
        borderOpacity: obj.opacity ?? 1,
      });
    } else if (obj.type === 'ellipse') {
      page.drawEllipse({
        x: x + w / 2,
        y: y + h / 2,
        xScale: Math.max(0.5, w / 2),
        yScale: Math.max(0.5, h / 2),
        borderColor: color,
        borderWidth: Math.max(0.8, obj.width || 2),
        borderOpacity: obj.opacity ?? 1,
      });
    } else if (obj.type === 'arrow') {
      page.drawLine({
        start: { x, y },
        end: { x: x + w, y: y + h },
        color,
        thickness: Math.max(0.8, obj.width || 2),
      });
      const head = Math.max(4, Math.min(w, h) * 0.28);
      page.drawLine({ start: { x: x + w - head, y: y + h }, end: { x: x + w, y: y + h }, color, thickness: Math.max(0.8, obj.width || 2) });
      page.drawLine({ start: { x: x + w, y: y + h - head }, end: { x: x + w, y: y + h }, color, thickness: Math.max(0.8, obj.width || 2) });
    } else if (obj.type === 'note') {
      page.drawEllipse({
        x: x + w / 2,
        y: y + h / 2,
        xScale: Math.max(2, w / 2),
        yScale: Math.max(2, h / 2),
        color,
        opacity: 0.9,
        borderColor: rgb(0.1, 0.12, 0.16),
        borderWidth: 0.8,
      });
      if (obj.text) {
        // Le commentaire devient une vraie note PDF (Acrobat l'affiche en bulle),
        // il n'est plus écrit sur la page.
        const annot = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Text',
          Rect: [x, y, x + w, y + h],
          Contents: PDFHexString.fromText(String(obj.text)),
          Name: 'Comment',
          C: [r, g, b],
          F: 4,
        });
        page.node.addAnnot(pdfDoc.context.register(annot));
      }
    } else if (obj.type === 'image' || obj.type === 'signature' || obj.type === 'photo') {
      const image = await embedImage(obj.src);
      if (image) {
        page.drawImage(image, {
          x,
          y,
          width: w,
          height: h,
          opacity: obj.opacity ?? 1,
        });
      }
    } else if (obj.type === 'stamp') {
      const size = obj.fontSize || Math.max(8, Math.min(h * 0.62, 34));
      const text = safeText(obj.text || '');
      const textWidth = font.widthOfTextAtSize(text, size);
      const boxW = Math.min(w || textWidth + 18, textWidth + 18);
      const boxH = Math.min(Math.max(h, size + 10), size * 1.9);
      page.drawRectangle({
        x: x + ((w || boxW) - boxW) / 2,
        y: y + (h - boxH) / 2,
        width: boxW,
        height: boxH,
        borderColor: color,
        borderWidth: Math.max(1, size * 0.09),
        opacity: 0,
        borderOpacity: obj.opacity ?? 0.9,
      });
      page.drawText(text, {
        x: x + ((w || boxW) - boxW) / 2 + (boxW - textWidth) / 2,
        y: y + (h - boxH) / 2 + (boxH - size * 0.72) / 2,
        size,
        font,
        color,
        opacity: obj.opacity ?? 0.9,
      });
    } else if (obj.type === 'check') {
      const size = Math.max(6, Math.min(w, h));
      if (obj.mark === 'cross') {
        page.drawLine({ start: { x, y }, end: { x: x + size, y: y + size }, color, thickness: Math.max(1, size * 0.12) });
        page.drawLine({ start: { x, y: y + size }, end: { x: x + size, y }, color, thickness: Math.max(1, size * 0.12) });
      } else {
        const thickness = Math.max(1, size * 0.13);
        page.drawLine({ start: { x, y: y + size * 0.45 }, end: { x: x + size * 0.32, y: y + size * 0.12 }, color, thickness, lineCap: 1 });
        page.drawLine({ start: { x: x + size * 0.32, y: y + size * 0.12 }, end: { x: x + size, y: y + size * 0.82 }, color, thickness, lineCap: 1 });
      }
    } else if (obj.type === 'date') {
      const size = obj.fontSize || Math.max(7, Math.min(h * 0.9, 16));
      page.drawText(safeText(obj.text || ''), { x, y, size, font, color });
    }
    if (rotated) page.pushOperators(popGraphicsState());
  }
  return drawn;
}
