import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { clamp, hexToRgb01 } from './utils.js';

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

function overlaps(cx, cy, b) {
  return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
}

export async function exportPdf({ sourceBytes, edits = [], ocrPages = [] }) {
  const pdfDoc = await PDFDocument.load(sourceBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const pages = pdfDoc.getPages();
  const fontCache = new Map();

  const getFont = async (family, bold, italic) => {
    const set = FONT_SETS[family] || FONT_SETS.Helvetica;
    const variant = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    const key = `${family}-${variant}`;
    if (!fontCache.has(key)) fontCache.set(key, await pdfDoc.embedFont(set[variant]));
    return fontCache.get(key);
  };

  const editsByPage = new Map();
  for (const e of edits) {
    if (!editsByPage.has(e.page)) editsByPage.set(e.page, []);
    editsByPage.get(e.page).push(e);
  }

  for (const [pageNo, pageEdits] of editsByPage) {
    const page = pages[pageNo - 1];
    if (!page) continue;
    const sorted = [...pageEdits].sort((a, b) => b.bbox.y - a.bbox.y);

    // 1. Masquage des textes d'origine
    for (const e of sorted) {
      if (!e.bg || e.bg === 'none') continue;
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
    }

    // 2. Nouveau texte
    for (const e of sorted) {
      const text = sanitizePdfText(e.text || '');
      if (!text.trim()) continue;
      const font = await getFont(e.font, e.bold, e.italic);
      const lines = text.split('\n');
      let size = clamp(Number(e.size) || 12, 4, 300);
      if (e.fit !== false && e.bbox.w > 2) {
        let factor = 1;
        for (const ln of lines) {
          if (!ln) continue;
          const w = font.widthOfTextAtSize(ln, size);
          if (w > e.bbox.w + 1) factor = Math.min(factor, (e.bbox.w + 1) / w);
        }
        size = Math.max(4, size * factor);
      }
      const color = hexToRgb01(e.color || '#111827');
      const lineHeight = size * 1.16;
      let y = e.baseline ?? e.bbox.y + e.bbox.h * 0.24;
      for (const ln of lines) {
        if (ln.trim()) {
          page.drawText(ln, {
            x: e.bbox.x + 0.5,
            y,
            size,
            font,
            color: rgb(color.r, color.g, color.b),
          });
        }
        y -= lineHeight;
      }
    }
  }

  // 3. Couche OCR invisible (texte recherchable / sélectionnable)
  for (const { pageNo, ocr } of ocrPages) {
    const page = pages[pageNo - 1];
    if (!page) continue;
    // On privilégie les segments (lignes) ; repli sur les mots pour les anciens résultats.
    const items = ocr?.lines?.length
      ? ocr.lines.map((l) => ({ text: l.text, bbox: l.bbox }))
      : (ocr?.words || []).map((w) => ({ text: w.text, bbox: w.bbox }));
    if (!items.length) continue;
    const font = await getFont('Helvetica', false, false);
    const pageEdits = editsByPage.get(pageNo) || [];
    for (const item of items) {
      const text = sanitizePdfText(item.text || '').trim();
      const b = item.bbox;
      if (!text || !b || b.w <= 0.5 || b.h <= 0.5) continue;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (pageEdits.some((e) => overlaps(cx, cy, e.bbox))) continue;
      let size = clamp(b.h * 0.88, 2.5, 200);
      try {
        const w = font.widthOfTextAtSize(text, size);
        if (w > b.w * 1.12) size = Math.max(2.5, size * ((b.w * 1.12) / w));
        page.drawText(text, {
          x: b.x,
          y: b.y + b.h * 0.16,
          size,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
      } catch {
        /* caractère non supporté — on l'ignore */
      }
    }
  }

  return pdfDoc.save();
}
