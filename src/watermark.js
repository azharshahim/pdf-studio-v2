/**
 * Filigranes : détection (texte en diagonale ou très pâle, répété sur les
 * pages), suppression et changement de texte.
 *
 * Détection : on parcourt la liste d'opérateurs de pdf.js et on repère le
 * texte dont la matrice totale est inclinée (≈ 10°–80°) ou très transparent et
 * de grande taille. Les occurrences de même inclinaison / taille / opacité
 * forment un seul filigrane.
 *
 * Suppression : on réécrit les flux de contenu (page et objets de formulaire)
 * en retirant les opérateurs de texte qui ont cette signature.
 */

import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { tokenizeContent } from './textRemoval.js';

const OP = pdfjsLib.OPS || {};
const DEG = 180 / Math.PI;

/** m puis n (point × m × n). */
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const ID = () => [1, 0, 0, 1, 0, 0];

/** Angle (°, −90…90) d'une matrice, ramené pour que 180° et 0° coïncident. */
function angleOf(m) {
  let a = Math.atan2(m[1], m[0]) * DEG;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

/** Matrice 6 valeurs, que pdf.js la passe à plat ou dans un tableau. */
function matrixArg(a) {
  if (!a) return null;
  const m = typeof a[0] === 'number' ? a : a[0];
  return m && m.length >= 6 && typeof m[0] === 'number' ? [m[0], m[1], m[2], m[3], m[4], m[5]] : null;
}

function colorArg(a) {
  if (!a) return null;
  if (typeof a[0] === 'string') {
    const hex = a[0].replace('#', '');
    if (hex.length === 6) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return null;
  }
  if (typeof a[0] === 'number' && a.length >= 3) return [a[0], a[1], a[2]].map((v) => (v > 1 ? v / 255 : v));
  return null;
}

/** Vrai si (angle, taille, opacité) ressemble à un filigrane. */
export function looksLikeWatermark({ angle, size, alpha }) {
  const tilted = Math.abs(angle) >= 10 && Math.abs(angle) <= 80;
  if (tilted && size >= 18) return true;
  return alpha <= 0.6 && size >= 28;
}

const alphaBucket = (a) => Math.round(Math.min(1, Math.max(0, a)) * 10);

export const signatureOf = ({ angle, size, alpha }) =>
  `${Math.round(angle / 5) * 5}|${Math.round(size)}|${alphaBucket(alpha)}`;

/** Deux signatures décrivent-elles le même filigrane (tolérance de mesure) ? */
export function sameWatermark(a, b) {
  return (
    Math.abs(a.angle - b.angle) <= 3.5 &&
    Math.abs(a.size - b.size) <= Math.max(1.5, a.size * 0.06) &&
    Math.abs(alphaBucket(a.alpha) - alphaBucket(b.alpha)) <= 1
  );
}

/**
 * Analyse un opérateur-liste pdf.js.
 * @returns {Array<{angle:number,size:number,alpha:number,text:string,x:number,y:number,color:number[]}>}
 */
export function scanOperatorList(fnArray = [], argsArray = [], ops = OP) {
  const found = [];
  let ctm = ID();
  let tm = ID();
  let lm = ID();
  let fontSize = 12;
  let alpha = 1;
  let color = [0, 0, 0];
  const stack = [];
  const shows = new Set([ops.showText, ops.showSpacedText, ops.nextLineShowText, ops.nextLineSetSpacingShowText]);
  let leading = 0;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i];
    if (fn === ops.save) stack.push({ ctm, tm, lm, fontSize, alpha, color });
    else if (fn === ops.restore) {
      const top = stack.pop();
      if (top) ({ ctm, tm, lm, fontSize, alpha, color } = top);
    } else if (fn === ops.transform && matrixArg(a)) ctm = mul(matrixArg(a), ctm);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push({ ctm, tm, lm, fontSize, alpha, color });
      if (matrixArg(a)) ctm = mul(matrixArg(a), ctm);
    } else if (fn === ops.paintFormXObjectEnd) {
      const top = stack.pop();
      if (top) ({ ctm, tm, lm, fontSize, alpha, color } = top);
    } else if (fn === ops.beginText) {
      tm = ID();
      lm = ID();
    } else if (fn === ops.setFont) fontSize = Math.abs(Number(a?.[1])) || fontSize;
    else if (fn === ops.setTextMatrix && matrixArg(a)) {
      tm = matrixArg(a);
      lm = [...tm];
    } else if (fn === ops.moveText || fn === ops.setLeadingMoveText) {
      lm = mul([1, 0, 0, 1, a[0], a[1]], lm);
      tm = [...lm];
      if (fn === ops.setLeadingMoveText) leading = -a[1];
    } else if (fn === ops.setLeading) leading = Number(a?.[0]) || 0;
    else if (fn === ops.nextLine) {
      lm = mul([1, 0, 0, 1, 0, -leading], lm);
      tm = [...lm];
    } else if (fn === ops.setGState) {
      for (const [k, v] of a?.[0] || []) if (k === 'ca' && typeof v === 'number') alpha = v;
    } else if (fn === ops.setFillRGBColor || fn === ops.setFillGray) color = colorArg(a) || color;
    else if (shows.has(fn)) {
      if (fn === ops.nextLineShowText || fn === ops.nextLineSetSpacingShowText) {
        lm = mul([1, 0, 0, 1, 0, -leading], lm);
        tm = [...lm];
      }
      const glyphs = (fn === ops.nextLineSetSpacingShowText ? a?.[2] : a?.[0]) || [];
      const text = glyphs
        .map((g) => (g && typeof g === 'object' && typeof g.unicode === 'string' ? g.unicode : ''))
        .join('');
      if (!text.trim()) continue;
      const m = mul(tm, ctm);
      const size = fontSize * Math.hypot(m[0], m[1]);
      const angle = angleOf(m);
      if (looksLikeWatermark({ angle, size, alpha })) {
        found.push({ angle, size, alpha, text, x: m[4], y: m[5], color: [...color] });
      }
    }
  }
  return found;
}

/**
 * Détecte les filigranes d'un document ouvert avec pdf.js.
 * @param {import('./pdfEngine.js').PdfEngine} engine
 */
export async function detectWatermarks(engine, { maxPages = 40 } = {}) {
  const groups = [];
  const pages = Math.min(engine.numPages, maxPages);
  for (let n = 1; n <= pages; n++) {
    const page = await engine.getPage(n);
    const ops = await page.getOperatorList();
    for (const hit of scanOperatorList(ops.fnArray, ops.argsArray)) {
      let g = groups.find((x) => sameWatermark(x, hit));
      if (!g) {
        g = { ...hit, id: `wm${groups.length + 1}`, pages: new Map(), texts: new Map() };
        groups.push(g);
      }
      if (!g.pages.has(n)) g.pages.set(n, { x: hit.x, y: hit.y, text: '' });
      g.pages.get(n).text += hit.text;
      g.texts.set(hit.text.trim(), (g.texts.get(hit.text.trim()) || 0) + 1);
    }
  }
  return groups
    .map((g) => {
      const label = [...g.texts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      return {
        id: g.id,
        text: [...g.pages.values()][0]?.text.trim() || label,
        angle: g.angle,
        size: g.size,
        alpha: g.alpha,
        color: g.color,
        pages: [...g.pages.entries()].map(([page, v]) => ({ page, x: v.x, y: v.y })),
      };
    })
    .filter((g) => g.text.replace(/\s/g, '').length >= 2);
}

/* ───────────────────────── Réécriture des flux ───────────────────────── */

function bytesToLatin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return out;
}
const latin1ToBytes = (str) => Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xff);

/** Opacité (`ca`) d'un ExtGState nommé. */
function gsAlpha(context, resources, name) {
  try {
    const gsDict = resources && context.lookupMaybe(resources.get(PDFName.of('ExtGState')), PDFDict);
    const g = gsDict && context.lookupMaybe(gsDict.get(PDFName.of(name.slice(1))), PDFDict);
    const ca = g && context.lookupMaybe(g.get(PDFName.of('ca')), PDFNumber);
    return ca ? ca.asNumber() : null;
  } catch {
    return null;
  }
}

/**
 * Retire de `src` les opérateurs de texte dont la signature correspond à l'un
 * des `targets`. Les objets de formulaire (`Do`) sont traités récursivement.
 * @returns {{content:string, removed:number}}
 */
export function stripWatermarkText(src, targets, { context, resources, ctm0 = ID(), depth = 0, onForm } = {}) {
  const tokens = tokenizeContent(src);
  let ctm = [...ctm0];
  const stack = [];
  let tm = ID();
  let lm = ID();
  let fontSize = 12;
  let alpha = 1;
  let leading = 0;
  let removed = 0;
  const ranges = [];
  let operands = [];
  let operandStart = 0;

  const hit = () => {
    const m = mul(tm, ctm);
    const probe = { angle: angleOf(m), size: fontSize * Math.hypot(m[0], m[1]), alpha };
    return looksLikeWatermark(probe) && targets.some((t) => sameWatermark(t, probe));
  };

  for (const token of tokens) {
    if (token.type !== 'operator') {
      operands.push(token);
      continue;
    }
    const op = token.value;
    const n = operands.filter((t) => t.type === 'number').map((t) => t.value);
    switch (op) {
      case 'q':
        stack.push({ ctm, alpha });
        break;
      case 'Q': {
        const top = stack.pop();
        if (top) ({ ctm, alpha } = top);
        break;
      }
      case 'cm':
        if (n.length >= 6) ctm = mul(n.slice(-6), ctm);
        break;
      case 'BT':
        tm = ID();
        lm = ID();
        break;
      case 'Tf':
        if (n.length) fontSize = Math.abs(n[n.length - 1]) || fontSize;
        break;
      case 'TL':
        if (n.length) leading = n[n.length - 1];
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
          lm = mul([1, 0, 0, 1, n[n.length - 2], n[n.length - 1]], lm);
          tm = [...lm];
          if (op === 'TD') leading = -n[n.length - 1];
        }
        break;
      case 'T*':
        lm = mul([1, 0, 0, 1, 0, -leading], lm);
        tm = [...lm];
        break;
      case 'gs': {
        const name = operands.find((t) => t.type === 'name');
        if (name && context) {
          const a = gsAlpha(context, resources, src.slice(name.start, name.end));
          if (a != null) alpha = a;
        }
        break;
      }
      case 'Tj':
      case 'TJ':
      case "'":
      case '"':
        if (op === "'" || op === '"') {
          lm = mul([1, 0, 0, 1, 0, -leading], lm);
          tm = [...lm];
        }
        if (hit()) {
          ranges.push({ start: operandStart, end: token.end });
          removed++;
        }
        break;
      case 'Do': {
        const name = operands.find((t) => t.type === 'name');
        if (name && onForm && depth < 4) {
          const changed = onForm(src.slice(name.start, name.end), ctm, resources, depth + 1);
          removed += changed || 0;
        }
        break;
      }
      default:
        break;
    }
    operands = [];
    operandStart = token.end;
  }

  if (!ranges.length) return { content: src, removed };
  let out = '';
  let cursor = 0;
  for (const r of ranges) {
    out += `${src.slice(cursor, r.start)}\n`;
    cursor = r.end;
  }
  return { content: out + src.slice(cursor), removed: removed };
}

function streamBytes(stream) {
  if (!(stream instanceof PDFRawStream)) throw new Error('flux non brut');
  return decodePDFRawStream(stream).decode();
}

/** Nouveau flux (même dictionnaire, contenu remplacé et recompressé). */
function replacementStream(context, oldStream, content) {
  const dict = {};
  for (const [key, value] of oldStream.dict.entries()) {
    const k = key.asString();
    if (k === '/Length' || k === '/Filter' || k === '/DecodeParms') continue;
    dict[k.slice(1)] = value;
  }
  return context.flateStream(latin1ToBytes(content), dict);
}

/**
 * Retire les filigranes `targets` d'un document pdf-lib.
 * @returns {number} nombre d'opérateurs retirés
 */
export function removeWatermarksFromDoc(pdfDoc, targets) {
  const context = pdfDoc.context;
  let total = 0;
  const processedForms = new Map();

  const processForm = (formRefOrName, parentResources) => {
    // Renvoie un compteur ; remplace l'objet de formulaire dans les ressources.
    const xobjects = parentResources && context.lookupMaybe(parentResources.get(PDFName.of('XObject')), PDFDict);
    if (!xobjects) return () => 0;
    return (name, ctm, resources, depth) => {
      const dict = context.lookupMaybe(resources?.get(PDFName.of('XObject')) ?? xobjects, PDFDict) || xobjects;
      const ref = dict.get(PDFName.of(name.slice(1)));
      const form = context.lookup(ref);
      if (!(form instanceof PDFRawStream)) return 0;
      const subtype = form.dict.get(PDFName.of('Subtype'));
      if (!subtype || subtype.asString() !== '/Form') return 0;
      let matrix = ID();
      const mArr = context.lookupMaybe(form.dict.get(PDFName.of('Matrix')), PDFArray);
      if (mArr && mArr.size() >= 6) matrix = Array.from({ length: 6 }, (_, i) => context.lookup(mArr.get(i)).asNumber());
      const formRes = context.lookupMaybe(form.dict.get(PDFName.of('Resources')), PDFDict) || resources;
      let text;
      try {
        text = bytesToLatin1(streamBytes(form));
      } catch {
        return 0;
      }
      const key = `${ref instanceof PDFRef ? ref.toString() : name}|${ctm.map((v) => v.toFixed(2)).join(',')}`;
      if (processedForms.has(key)) return processedForms.get(key);
      const res = stripWatermarkText(text, targets, {
        context,
        resources: formRes,
        ctm0: mul(matrix, ctm),
        depth,
        onForm: processForm(null, formRes),
      });
      processedForms.set(key, res.removed);
      if (res.removed && ref instanceof PDFRef) {
        context.assign(ref, replacementStream(context, form, res.content));
      }
      return res.removed;
    };
  };

  for (const page of pdfDoc.getPages()) {
    try {
      const contentsRef = page.node.get(PDFName.of('Contents'));
      const contents = contentsRef && context.lookup(contentsRef);
      const streams = [];
      if (contents instanceof PDFArray) for (let i = 0; i < contents.size(); i++) streams.push(context.lookup(contents.get(i)));
      else if (contents) streams.push(contents);
      if (!streams.length) continue;
      const resources = page.node.Resources() || undefined;
      let source = '';
      for (const s of streams) source += `${bytesToLatin1(streamBytes(s))}\n`;
      const res = stripWatermarkText(source, targets, {
        context,
        resources,
        onForm: processForm(null, resources),
      });
      if (res.content !== source) {
        const fresh = context.flateStream(latin1ToBytes(res.content));
        page.node.set(PDFName.of('Contents'), context.register(fresh));
      }
      total += res.removed;
    } catch (err) {
      console.warn('[watermark] page non traitée', err);
    }
  }
  return total;
}

/**
 * Supprime ou renomme des filigranes dans des octets PDF.
 * @param {Uint8Array} bytes
 * @param {Array} marks filigranes détectés à traiter
 * @param {string|null} newText null = suppression, sinon nouveau texte
 */
export async function applyWatermarkChange(bytes, marks, newText = null) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const removed = removeWatermarksFromDoc(doc, marks);
  if (!removed) throw new Error('Filigrane introuvable dans le contenu des pages');
  if (newText && newText.trim()) {
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const safe = [...newText].filter((c) => {
      try {
        font.widthOfTextAtSize(c, 10);
        return true;
      } catch {
        return false;
      }
    }).join('');
    for (const mark of marks) {
      for (const where of mark.pages) {
        const page = doc.getPage(where.page - 1);
        if (!page || !safe) continue;
        page.drawText(safe, {
          x: where.x,
          y: where.y,
          size: mark.size,
          font,
          color: rgb(...(mark.color || [0.6, 0.6, 0.6])),
          opacity: mark.alpha ?? 1,
          rotate: degrees(mark.angle),
        });
      }
    }
  }
  return doc.save();
}
