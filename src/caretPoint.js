/**
 * Position du curseur à partir d'un point touché sur la page.
 *
 * Le PDF n'expose pas de nœud texte : les lignes sont des rectangles
 * superposés. Pour retrouver le caractère sous le doigt, on construit une
 * sonde invisible contenant le texte d'origine, à la même position et avec la
 * même police que le bloc touché, puis on interroge `caretPositionFromPoint`
 * (ou `caretRangeFromPoint` sur Safari/WebKit). Les fonctions pures
 * (estimation, bornes de mot, détection Samsung) sont testées hors navigateur.
 */

/** Index dont la largeur de préfixe est la plus proche de `x` (px). */
export function nearestIndexFromWidths(widths, x) {
  if (!Array.isArray(widths) || !widths.length) return 0;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < widths.length; i += 1) {
    const distance = Math.abs(widths[i] - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Largeur relative approximative d'un caractère (fractions de cadratin). */
export function relativeCharWidth(char) {
  if (!char) return 0;
  if (char === ' ') return 0.28;
  if ('iljtfrI.,;:!|\'’'.includes(char)) return 0.3;
  if ('mwMW@%'.includes(char)) return 0.9;
  if ('ABCDEFGHKNOPQRSTUVXYZ'.includes(char)) return 0.68;
  if ('0123456789'.includes(char)) return 0.56;
  if (char === '\t') return 1.6;
  return 0.52;
}

/**
 * Estimation de secours : convertit une position horizontale (0 → gauche du
 * bloc, 1 → droite) en index de caractère, sans mesure réelle de la police.
 * Précision d'un ou deux caractères sur une ligne de texte courant.
 */
export function estimateOffsetFromFraction(text, fraction) {
  const value = String(text ?? '');
  if (!value) return 0;
  const f = Math.min(1, Math.max(0, Number(fraction) || 0));
  if (f <= 0) return 0;
  if (f >= 1) return value.length;
  const widths = [0];
  let total = 0;
  for (const char of value) {
    total += relativeCharWidth(char);
    widths.push(total);
  }
  if (!total) return 0;
  return nearestIndexFromWidths(widths, f * total);
}

/** Bornes du mot (ou du groupe de lettres/chiffres) contenant `offset`. */
export function wordBoundsAt(text, offset) {
  const value = String(text ?? '');
  if (!value) return [0, 0];
  const isWord = (ch) => /[\p{L}\p{N}\u2019'’-]/u.test(ch);
  let index = Math.min(Math.max(0, Number(offset) || 0), value.length);
  if (index === value.length) index = value.length - 1;
  if (index < 0) return [0, 0];
  if (!isWord(value[index])) {
    // Sur un espace ou une ponctuation : on sélectionne le caractère touché.
    return [index, index + 1];
  }
  let start = index;
  while (start > 0 && isWord(value[start - 1])) start -= 1;
  let end = index + 1;
  while (end < value.length && isWord(value[end])) end += 1;
  return [start, end];
}

/** Samsung Internet : moteur Chromium modifié, très sensible aux re-rendus. */
export function isSamsungUserAgent(userAgent) {
  return /SamsungBrowser/i.test(String(userAgent || ''));
}

/** Le point est-il un appui long (durée et déplacement) ? */
export function isLongPress(elapsedMs, distancePx, { delay = 480, slop = 10 } = {}) {
  return elapsedMs >= delay && distancePx <= slop;
}

/**
 * Cherche l'index de caractère sous un point, à l'aide d'une sonde invisible
 * placée sur le rectangle du bloc touché.
 *
 * @param {object} options
 * @param {Document} options.doc
 * @param {number} options.x position du toucher (px, viewport)
 * @param {number} options.y
 * @param {string} options.text texte d'origine de la ligne
 * @param {{left:number, top:number, width:number, height:number}} options.rect
 * @param {{fontFamily:string, fontSize:string, fontWeight?:string, fontStyle?:string, lineHeight:string, letterSpacing?:string}} options.font
 * @returns {number|null} index, ou null si le navigateur ne répond pas
 */
export function offsetAtPoint({ doc = document, x, y, text, rect, font }) {
  const value = String(text ?? '');
  if (!value) return 0;
  if (!rect || !(rect.width > 0)) return null;

  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.textContent = value;
  probe.style.cssText = [
    'position:fixed',
    `left:${rect.left}px`,
    `top:${rect.top}px`,
    'margin:0',
    'padding:0',
    'border:0',
    'white-space:pre',
    'overflow:visible',
    'color:transparent',
    'background:transparent',
    'opacity:0',
    'z-index:2147483647',
    `font-family:${font.fontFamily}`,
    `font-size:${font.fontSize}`,
    `font-weight:${font.fontWeight || '400'}`,
    `font-style:${font.fontStyle || 'normal'}`,
    `line-height:${font.lineHeight}`,
    `letter-spacing:${font.letterSpacing || 'normal'}`,
    'pointer-events:auto',
  ].join(';');

  doc.body.appendChild(probe);
  try {
    const probeWidth = probe.getBoundingClientRect().width;
    if (!probeWidth) return null;
    // Le texte de la sonde peut être plus court que le bloc (police du PDF
    // approchée par une police système) : on ramène le point proportionnellement.
    const scale = probeWidth / rect.width;
    const rawX = rect.left + (x - rect.left) * scale;
    const px = Math.min(rect.left + probeWidth - 0.5, Math.max(rect.left + 0.5, rawX));
    const py = Math.min(rect.top + rect.height - 1, Math.max(rect.top + 1, y));

    let node = null;
    let offset = 0;
    if (typeof doc.caretPositionFromPoint === 'function') {
      const caret = doc.caretPositionFromPoint(px, py);
      if (caret) {
        node = caret.offsetNode;
        offset = caret.offset;
      }
    }
    if ((!node || !probe.contains(node)) && typeof doc.caretRangeFromPoint === 'function') {
      const range = doc.caretRangeFromPoint(px, py);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    }
    if (!node || !probe.contains(node)) return null;
    if (node.nodeType === Node.TEXT_NODE) return Math.min(value.length, Math.max(0, offset));
    // Le curseur est tombé sur la sonde elle-même : on est avant/après le texte.
    return offset > 0 ? value.length : 0;
  } finally {
    probe.remove();
  }
}
