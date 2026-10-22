/**
 * Regroupement des mots reconnus par l'OCR en segments horizontaux cohérents,
 * avec préservation intégrale des montants (espaces/points de milliers,
 * décimales, signe négatif) et de leur symbole ou code monétaire.
 */

const SIGN_ONLY_RE = /^[-+−–]$/;

// Jeton numérique complet ou partiel (ex. "2", "-35,20", "1.250,00", "147,48", "2147,48€")
const NUMBER_TOKEN_RE =
  /^[-+−–]?\d{1,4}(?:[.,]\d{1,3})*(?:[.,]\d{1,4})?$/;

const NUMBER_WITH_CURRENCY_RE =
  /^[-+−–]?\d[\d\s.,\u00a0\u202f]*(?:€|\$|£|¥|CHF|EUR|USD|GBP|CAD|MAD|TND|DZD|FCFA|XOF|DH)s?\.?$/i;

// Groupe de milliers ou fraction décimale qui suit un premier groupe de chiffres (ex. "147,48", "000", "250,00", ",48")
const THOUSANDS_OR_DEC_CONT_RE =
  /^(?:\d{3}(?:[.,]\d{1,4})?|[.,]\d{1,4}|\d{1,3}[.,]\d{2})$/;

// Symbole ou code ISO de devise
const CURRENCY_TOKEN_RE =
  /^(?:€|\$|£|¥|CHF|EUR|USD|GBP|CAD|MAD|TND|DZD|FCFA|XOF|DH)\.?$/i;

const PREFIX_CURRENCY_RE = /^(?:€|\$|£|¥)$/;

const ISOLATED_SEP_RE = /^[.,]$/;

/**
 * Indique si `text` se termine par un nombre susceptible d'être prolongé par un
 * groupe de milliers, une partie décimale ou une devise.
 */
export function endsWithNumericAmount(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  // Un montant déjà suivi de sa devise est complet : une colonne chiffrée plus loin ne s'y rattache pas.
  if (NUMBER_WITH_CURRENCY_RE.test(s) && !/\d$/.test(s)) return false;
  return /(?:^|[\s(])[-+−–]?\d{1,4}(?:[\s.\u00a0\u202f]\d{3})*(?:[.,]\d{1,4})?[.,]?$/.test(s);
}

/**
 * Décide si le jeton `nextText` continue un montant commencé dans `prevText`,
 * même lorsque Tesseract a mesuré une graisse (`bold`) différente sur le symbole
 * monétaire ou un espace un peu plus large entre milliers et devise.
 */
export function isAmountContinuation(prevText, nextText, gap, refHeight) {
  const prev = String(prevText || '').trim();
  const next = String(nextText || '').trim();
  if (!prev || !next) return false;
  const h = Math.max(8, Number(refHeight) || 12);
  // Garde-fou : jamais de fusion à travers un vide de colonne de tableau, ni en cas de retour arrière.
  if (gap < -h * 0.45) return false;

  // 1. Signe négatif / positif isolé suivi des chiffres ("-" + "35,20" ou "-" + "35,20€")
  if ((SIGN_ONLY_RE.test(prev) || /[\s(][-+−–]$/.test(prev)) && /^(\d|\d.*(?:€|\$|£|EUR|USD|CHF))/i.test(next)) {
    return gap <= Math.max(h * 1.2, 14);
  }

  // 2. Symbole monétaire en préfixe suivi d'un nombre ("€" + "45,00", "$" + "1,250.00")
  if (PREFIX_CURRENCY_RE.test(prev) && (NUMBER_TOKEN_RE.test(next) || NUMBER_WITH_CURRENCY_RE.test(next))) {
    return gap <= Math.max(h * 1.6, 18);
  }

  if (!endsWithNumericAmount(prev)) return false;

  // 3. Séparateur décimal/milliers isolé ("," ou ".") collé aux chiffres
  if (ISOLATED_SEP_RE.test(next)) {
    return gap <= Math.max(h * 0.9, 10);
  }

  // 4. Si le segment précédent finit par "." ou "," (ex. "1." + "250,00" ou "2147," + "48")
  if (/[.,]$/.test(prev) && /^\d/.test(next)) {
    return gap <= Math.max(h * 1.1, 12);
  }

  // 5. Groupe de milliers ou décimales suivant un préfixe court de 1 à 3 chiffres (ex. "2" + "147,48")
  const lastChunk = prev.split(/\s+/).pop() || '';
  if (/^[-+−–]?\d{1,3}$/.test(lastChunk) && THOUSANDS_OR_DEC_CONT_RE.test(next)) {
    return gap <= Math.max(h * 1.65, 18);
  }

  // 6. Symbole ou code monétaire suivant immédiatement un montant ("2 147,48" + "€", "1.250,00" + "EUR")
  if (CURRENCY_TOKEN_RE.test(next)) {
    return gap <= Math.max(h * 1.9, 22);
  }

  // 7. Cas où l'OCR a attaché les derniers chiffres et la devise ensemble ("2" + "147,48€")
  if (/^[-+−–]?\d{1,3}$/.test(lastChunk) && /^\d{3}(?:[.,]\d{1,4})?(?:€|\$|£|EUR|USD|CHF)$/i.test(next)) {
    return gap <= Math.max(h * 1.65, 18);
  }

  return false;
}

/**
 * Concatène les mots d'un même segment OCR en respectant le collage visuel :
 *  - `-` collé à `35,20` -> `-35,20` (normalisé en tiret ASCII `-` si signe moins)
 *  - `2147,48` collé à `€` sans espace sur l'image -> `2147,48€`
 *  - `2 147,48` suivi d'un espace avant `€` -> `2 147,48 €`
 */
export function joinSegmentTokens(items) {
  if (!items || !items.length) return '';
  let out = items[0].text.trim();
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const tok = cur.text.trim();
    if (!tok) continue;
    const gap = cur.x0 - prev.x1;
    const refH = Math.max(8, prev.h || 12, cur.h || 12);

    const prevTrim = out.trimEnd();
    const unarySign =
      (SIGN_ONLY_RE.test(prevTrim) || /\s[-+−–]$/.test(prevTrim)) &&
      /^\d/.test(tok) &&
      gap <= Math.max(refH * 0.55, 6);
    const aroundIsolatedSep =
      ISOLATED_SEP_RE.test(tok) || (/[.,]$/.test(prevTrim) && /^\d/.test(tok) && gap <= Math.max(refH * 0.45, 5));
    const tightSymbolCurrency =
      /\d$/.test(prevTrim) &&
      /^(?:€|\$|£|¥)$/.test(tok) &&
      gap <= Math.max(refH * 0.14, 1.5);

    if (unarySign || aroundIsolatedSep || tightSymbolCurrency) {
      out = prevTrim + tok;
    } else {
      out = `${prevTrim} ${tok}`;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Regroupe les mots OCR en segments horizontaux cohérents tout en gardant
 * solidaires les montants chiffrés et leur devise.
 */
export function groupOcrWords(words) {
  const items = (words || [])
    .filter((w) => w && w.text && w.text.trim() && w.bbox)
    .map((w) => ({
      text: w.text.trim(),
      x0: w.bbox.x0,
      y0: w.bbox.y0,
      x1: w.bbox.x1,
      y1: w.bbox.y1,
      h: Math.max(1, w.bbox.y1 - w.bbox.y0),
      confidence: w.confidence || 0,
      ratio: w.ratio,
      bold: typeof w.bold === 'boolean' ? w.bold : undefined,
    }))
    .sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1) || a.x0 - b.x0);

  const rows = [];
  for (const it of items) {
    const cy = (it.y0 + it.y1) / 2;
    let row = null;
    for (const r of rows) {
      // Tolérance basée sur la hauteur de la ligne pour qu'un petit signe « - »
      // ou une virgule basse reste rattaché à la même ligne horizontale.
      const tol = Math.max(5, Math.min(it.h, r.h) * 0.6, r.h * 0.42);
      if (Math.abs(r.cy - cy) <= tol) {
        row = r;
        break;
      }
    }
    if (!row) {
      row = { cy, h: it.h, items: [] };
      rows.push(row);
    }
    row.items.push(it);
    // Met à jour le centre vertical pondéré vers les glyphes pleins (évite qu'un '-' isolé décentre la ligne).
    if (it.h >= row.h * 0.65) {
      row.cy = (row.cy * (row.items.length - 1) + cy) / row.items.length;
    }
    row.h = Math.max(row.h, it.h);
  }

  const segments = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.x0 - b.x0);
    const rated = row.items.filter((i) => typeof i.ratio === 'number');
    if (rated.length) {
      const vals = rated.map((i) => i.ratio);
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      if (rated.length >= 2 && mx / Math.max(mn, 0.01) > 1.3) {
        const mid = (mn + mx) / 2;
        for (const i of rated) i.bold = i.ratio > mid;
      } else {
        for (const i of rated) {
          if (i.ratio > 0.2) i.bold = true;
          else if (i.ratio < 0.14) i.bold = false;
        }
      }
    }

    let seg = null;
    for (const it of row.items) {
      const gap = seg ? it.x0 - seg.x1 : 0;
      const maxH = Math.max(it.h, seg ? seg.h : 0);
      const prevText = seg ? joinSegmentTokens(seg.items) : '';
      const keepAsAmount = seg ? isAmountContinuation(prevText, it.text, gap, maxH) : false;

      const styleBreak =
        !keepAsAmount &&
        seg &&
        typeof it.bold === 'boolean' &&
        typeof seg.bold === 'boolean' &&
        it.bold !== seg.bold;

      const gapBreak = !keepAsAmount && gap > Math.max(maxH * 0.85, 10);

      if (!seg || styleBreak || gapBreak) {
        if (seg) segments.push(seg);
        seg = {
          x0: it.x0,
          y0: it.y0,
          x1: it.x1,
          y1: it.y1,
          h: it.h,
          items: [it],
          bold: it.bold,
        };
      } else {
        if (typeof seg.bold !== 'boolean' && typeof it.bold === 'boolean') seg.bold = it.bold;
        seg.items.push(it);
        seg.x1 = Math.max(seg.x1, it.x1);
        seg.y0 = Math.min(seg.y0, it.y0);
        seg.y1 = Math.max(seg.y1, it.y1);
        seg.h = Math.max(seg.h, it.h);
      }
    }
    if (seg) segments.push(seg);
  }

  return segments
    .map((seg) => ({
      text: joinSegmentTokens(seg.items),
      bbox: { x0: seg.x0, y0: seg.y0, x1: seg.x1, y1: seg.y1 },
      bold: seg.bold,
      words: seg.items.map((i) => ({
        text: i.text,
        bbox: { x0: i.x0, y0: i.y0, x1: i.x1, y1: i.y1 },
        ...(typeof i.bold === 'boolean' ? { bold: i.bold } : {}),
      })),
      confidence: Math.round(
        seg.items.reduce((sum, i) => sum + (i.confidence || 0), 0) / Math.max(1, seg.items.length)
      ),
    }))
    .filter((seg) => seg.text);
}
