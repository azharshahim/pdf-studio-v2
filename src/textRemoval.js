/**
 * Suppression réelle du texte d'origine dans les flux de contenu PDF.
 *
 * Principe : on décode le flux de contenu de la page, on suit l'état du texte
 * (matrices `Tm`/`Td`, taille de police, transformations `cm`) et on repère les
 * opérateurs d'affichage (`Tj`, `TJ`, `'`, `"`). Tout opérateur dont l'emprise
 * tombe dans une zone éditée est retiré du flux : le texte n'est alors plus
 * extractible, au lieu d'être simplement recouvert d'un rectangle.
 *
 * Le procédé est volontairement prudent :
 * - si le flux utilise un filtre non géré ou un objet de formulaire (XObject),
 *   la page est signalée comme non traitée et l'appelant retombe sur le masque ;
 * - si un opérateur semble couvrir beaucoup plus que la ligne éditée
 *   (paragraphe entier), on abandonne aussi pour ne pas effacer du texte voisin.
 */

import {
  PDFArray,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';

const WS = new Set(['\0', '\t', '\n', '\f', '\r', ' ']);
const DELIM = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);

const isWs = (c) => WS.has(c);
const isDelim = (c) => DELIM.has(c);

/** Décodage latin-1 : chaque octet devient un caractère, sans perte. */
function bytesToLatin1(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return out;
}

function latin1ToBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

/** Tokenise un flux de contenu en conservant les positions exactes. */
export function tokenizeContent(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '%') {
      while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }
    if (isWs(c)) {
      i++;
      continue;
    }
    const start = i;

    if (c === '(') {
      // chaîne littérale : gérer les parenthèses imbriquées et les échappements
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = src[i];
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        i++;
      }
      tokens.push({ type: 'string', start, end: i });
      continue;
    }
    if (c === '<' && src[i + 1] === '<') {
      i += 2;
      tokens.push({ type: 'dictOpen', start, end: i });
      continue;
    }
    if (c === '>' && src[i + 1] === '>') {
      i += 2;
      tokens.push({ type: 'dictClose', start, end: i });
      continue;
    }
    if (c === '<') {
      i++;
      while (i < n && src[i] !== '>') i++;
      i = Math.min(n, i + 1);
      tokens.push({ type: 'string', start, end: i });
      continue;
    }
    if (c === '[') {
      i++;
      tokens.push({ type: 'arrOpen', start, end: i });
      continue;
    }
    if (c === ']') {
      i++;
      tokens.push({ type: 'arrClose', start, end: i });
      continue;
    }
    if (c === '/') {
      i++;
      while (i < n && !isWs(src[i]) && !isDelim(src[i])) i++;
      tokens.push({ type: 'name', start, end: i });
      continue;
    }

    i++;
    while (i < n && !isWs(src[i]) && !isDelim(src[i])) i++;
    const word = src.slice(start, i);
    const isNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word);
    tokens.push({
      type: isNumber ? 'number' : 'operator',
      start,
      end: i,
      value: isNumber ? Number(word) : word,
    });
  }
  return tokens;
}

/** Nombre de caractères approximatif d'une chaîne PDF (littérale ou hex). */
function stringLength(raw) {
  if (!raw) return 0;
  if (raw.startsWith('<')) {
    const hex = raw.slice(1, -1).replace(/[^0-9a-fA-F]/g, '');
    return Math.ceil(hex.length / 2);
  }
  let count = 0;
  for (let i = 1; i < raw.length - 1; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      count++;
      continue;
    }
    const next = raw[i + 1];
    if (/[0-7]/.test(next)) {
      // octal jusqu'à 3 chiffres
      let j = i + 1;
      let digits = 0;
      while (j < raw.length - 1 && digits < 3 && /[0-7]/.test(raw[j])) {
        j++;
        digits++;
      }
      i = j - 1;
    } else {
      i++;
    }
    count++;
  }
  return count;
}

const identity = () => [1, 0, 0, 1, 0, 0];

/** Multiplie deux matrices PDF (convention ligne : point × matrice). */
function multiply(m, n) {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function applyMatrix(m, x, y) {
  return { x: x * m[0] + y * m[2] + m[4], y: x * m[1] + y * m[3] + m[5] };
}

/** Vrai si le segment [x0,x1] à la hauteur y croise la boîte éditée. */
function segmentHitsBox(x0, x1, y, box, fontSize) {
  const padY = Math.max(2, fontSize * 0.45);
  if (y < box.y - padY || y > box.y + box.h + padY) return false;
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  return hi >= box.x - 2 && lo <= box.x + box.w + 2;
}

/**
 * Retire les opérateurs de texte situés dans `boxes` du flux `src`.
 * @returns {{ content: string, removed: number, skipped: boolean, boxes: Set<object> }}
 */
export function removeTextFromContent(src, boxes) {
  const removedBoxes = new Set();
  if (!boxes.length) return { content: src, removed: 0, skipped: false, boxes: removedBoxes };
  const tokens = tokenizeContent(src);

  let ctm = identity();
  const ctmStack = [];
  let tm = identity();
  let lm = identity();
  let fontSize = 12;
  let leading = 0;
  let hScale = 1;
  let removed = 0;
  let skipped = false;
  const ranges = [];

  let operandStart = 0;
  let operands = [];

  const currentBox = (x0, x1, y) => boxes.find((b) => segmentHitsBox(x0, x1, y, b, fontSize));

  const showText = (charCount, kerning, rangeStart, rangeEnd) => {
    if (!charCount) return;
    // Largeur approx. en points : moyenne de 0,5 em (0,6 pour le monospace).
    const avg = 0.5;
    const width = Math.max(0, charCount * fontSize * avg * hScale + kerning);
    const origin = applyMatrix(ctm, tm[4], tm[5]);
    const endPoint = applyMatrix(ctm, tm[4] + width * tm[0], tm[5] + width * tm[1]);
    const box = currentBox(origin.x, endPoint.x, origin.y);
    if (!box) {
      // avancer la matrice de texte pour l'opérateur suivant
      tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + width * tm[0], tm[5] + width * tm[1]];
      return;
    }
    // Garde-fou : si l'opérateur couvre beaucoup plus large que la zone,
    // il contient probablement du texte voisin → on n'y touche pas.
    if (width > box.w * 1.9 + 26) {
      skipped = true;
      tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + width * tm[0], tm[5] + width * tm[1]];
      return;
    }
    ranges.push({ start: rangeStart, end: rangeEnd });
    removedBoxes.add(box);
    removed++;
    tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + width * tm[0], tm[5] + width * tm[1]];
  };

  for (const token of tokens) {
    if (token.type !== 'operator') {
      operands.push(token);
      continue;
    }

    const op = token.value;
    const n = operands.filter((t) => t.type === 'number').map((t) => t.value);
    const strings = operands.filter((t) => t.type === 'string');

    switch (op) {
      case 'q':
        ctmStack.push([...ctm]);
        break;
      case 'Q':
        if (ctmStack.length) ctm = ctmStack.pop();
        break;
      case 'cm':
        if (n.length >= 6) ctm = multiply(n.slice(-6), ctm);
        break;
      case 'BT':
        tm = identity();
        lm = identity();
        break;
      case 'Tf':
        if (n.length) fontSize = Math.abs(n[n.length - 1]) || 12;
        break;
      case 'TL':
        if (n.length) leading = n[n.length - 1];
        break;
      case 'Tz':
        if (n.length) hScale = n[n.length - 1] / 100;
        break;
      case 'Tm':
        if (n.length >= 6) {
          tm = n.slice(-6);
          lm = [...tm];
        }
        break;
      case 'Td':
      case 'TD':
        if (n.length >= 2) {
          const tx = n[n.length - 2];
          const ty = n[n.length - 1];
          lm = multiply([1, 0, 0, 1, tx, ty], lm);
          tm = [...lm];
          if (op === 'TD') leading = -ty;
        }
        break;
      case 'T*':
        lm = multiply([1, 0, 0, 1, 0, -leading], lm);
        tm = [...lm];
        break;
      case 'Tj': {
        const raw = operands.filter((t) => t.type === 'string').pop();
        const count = raw ? stringLength(src.slice(raw.start, raw.end)) : 0;
        showText(count, 0, operandStart, token.end);
        break;
      }
      case "'":
      case '"': {
        lm = multiply([1, 0, 0, 1, 0, -leading], lm);
        tm = [...lm];
        const raw = strings.pop();
        const count = raw ? stringLength(src.slice(raw.start, raw.end)) : 0;
        showText(count, 0, operandStart, token.end);
        break;
      }
      case 'TJ': {
        // additionne longueurs de chaînes et crénages (nombres négatifs → avance)
        let count = 0;
        let kerning = 0;
        let inside = false;
        for (const t of operands) {
          if (t.type === 'arrOpen') inside = true;
          else if (t.type === 'arrClose') inside = false;
          else if (inside && t.type === 'string') {
            const raw = src.slice(t.start, t.end);
            let len = stringLength(raw);
            // chaînes CID (2 octets par glyphe) : on divise par deux
            if (!raw.startsWith('<')) {
              const inner = raw.slice(1, -1);
              const high = [...inner].filter((ch) => ch.charCodeAt(0) > 127).length;
              if (inner.length && high / inner.length > 0.7) len = Math.ceil(len / 2);
            } else {
              const hex = raw.slice(1, -1).replace(/[^0-9a-fA-F]/g, '');
              if (hex.length >= 4 && hex.length % 4 === 0) len = Math.ceil(len / 2);
            }
            count += len;
          } else if (inside && t.type === 'number') {
            kerning += (-t.value / 1000) * fontSize * hScale;
          }
        }
        showText(count, kerning, operandStart, token.end);
        break;
      }
      default:
        break;
    }

    operands = [];
    operandStart = token.end;
  }

  if (!removed) return { content: src, removed: 0, skipped, boxes: new Set() };
  if (skipped) return { content: src, removed: 0, skipped: true, boxes: new Set() };

  ranges.sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue;
    out += src.slice(cursor, r.start) + '\n';
    cursor = r.end;
  }
  out += src.slice(cursor);
  return { content: out, removed, skipped: false, boxes: removedBoxes };
}

/**
 * Applique la suppression à toutes les pages comportant des modifications.
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {Map<number, Array>} editsByPage
 * @returns {Map<number, Set<object>>} pages traitées → boîtes réellement retirées
 */
export function removeTextInBBoxes(pdfDoc, editsByPage) {
  const done = new Map();
  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();

  for (const [pageNo, edits] of editsByPage) {
    const page = pages[pageNo - 1];
    if (!page) continue;
    const boxes = edits
      .filter((e) => e.kind !== 'add' && e.bbox && e.bbox.w > 0 && e.bbox.h > 0)
      .map((e) => e.origBbox || e.bbox);
    if (!boxes.length) continue;

    try {
      const contentsRef = page.node.get(PDFName.of('Contents'));
      if (!contentsRef) continue;
      const contents = context.lookup(contentsRef);
      const streams = [];
      if (contents instanceof PDFArray) {
        for (let i = 0; i < contents.size(); i++) {
          const s = context.lookup(contents.get(i));
          if (s) streams.push(s);
        }
      } else if (contents) {
        streams.push(contents);
      }
      if (!streams.length) continue;

      let source = '';
      for (const stream of streams) {
        if (!(stream instanceof PDFRawStream)) throw new Error('flux non brut');
        source += `${bytesToLatin1(decodePDFRawStream(stream).decode())}\n`;
      }

      const result = removeTextFromContent(source, boxes);
      if (!result.removed) continue;

      const newStream = context.flateStream(latin1ToBytes(result.content));
      page.node.set(PDFName.of('Contents'), context.register(newStream));
      done.set(pageNo, result.boxes);
    } catch (err) {
      console.warn(`[textRemoval] page ${pageNo} non traitée`, err);
    }
  }
  return done;
}
