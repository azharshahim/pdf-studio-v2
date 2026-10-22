/**
 * Détection et reflux de paragraphes (PDF texte natif et pages OCRisées).
 *
 * En mode « Modifier par paragraphe », les lignes consécutives d'un même
 * paragraphe (interligne proche et régulier, même police/style, même marge
 * gauche, continuité de prose) sont regroupées en un seul bloc modifiable
 * avec retour automatique à la ligne dans la largeur du bloc.
 */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function lineTop(l) {
  return (l.bbox?.y || 0) + (l.bbox?.h || 0);
}

function lineBottom(l) {
  return l.bbox?.y || 0;
}

function lineRight(l) {
  return (l.bbox?.x || 0) + (l.bbox?.w || 0);
}

function lineBaseline(l) {
  return Number.isFinite(l.baseline) ? l.baseline : (l.bbox?.y || 0) + (l.bbox?.h || 0) * 0.24;
}

function horizontalOverlap(a, b) {
  const start = Math.max(a.bbox.x, b.bbox.x);
  const end = Math.min(lineRight(a), lineRight(b));
  return Math.max(0, end - start);
}

const BULLET_START_RE = /^(?:[•●▪◦‣–—\-*]\s+|\(?[0-9]{1,3}[.)]\s+|\(?[a-zA-Z][.)]\s+)/;
const HEADING_END_RE = /[:;]\s*$/;

/**
 * Décide si `next` (située juste sous `prev`) prolonge le même paragraphe
 * commencé dans `group` (`group` contient au moins 1 ligne, `prev` en est la dernière).
 */
export function canMergeIntoParagraph(group, next) {
  const first = group[0];
  const prev = group[group.length - 1];
  if (!prev?.bbox || !next?.bbox || !prev.text?.trim() || !next.text?.trim()) return false;

  const isOcr = prev.source === 'ocr' || next.source === 'ocr';
  if ((prev.source || 'pdf') !== (next.source || 'pdf')) return false;
  if (!!prev.hiddenLayer !== !!next.hiddenLayer) return false;

  // Même police et même style (gras / italique).
  if (!isOcr) {
    if ((prev.font || 'Helvetica') !== (next.font || 'Helvetica')) return false;
    if (!!prev.bold !== !!next.bold || !!prev.italic !== !!next.italic) return false;
  } else {
    if (typeof prev.bold === 'boolean' && typeof next.bold === 'boolean' && prev.bold !== next.bold) {
      return false;
    }
  }

  // Même corps de texte (tolérance plus souple sur OCR car la hauteur dépend des jambages).
  const fsPrev = Math.max(4, prev.fontSize || prev.bbox.h);
  const fsNext = Math.max(4, next.fontSize || next.bbox.h);
  const fs = (fsPrev + fsNext) / 2;
  const maxFsDiff = Math.max(fsPrev, fsNext) * (isOcr ? 0.30 : 0.15);
  if (Math.abs(fsPrev - fsNext) > maxFsDiff) return false;

  // Proximité verticale et régularité d'interligne.
  const prevBase = lineBaseline(prev);
  const nextBase = lineBaseline(next);
  const step = prevBase - nextBase;
  if (step < fs * 0.68 || step > fs * (isOcr ? 1.95 : 1.72)) return false;

  const vGap = lineBottom(prev) - lineTop(next);
  if (vGap > fs * (isOcr ? 0.92 : 0.74) || vGap < -fs * 0.45) return false;

  if (group.length >= 2) {
    const firstStep = (lineBaseline(group[0]) - prevBase) / (group.length - 1);
    if (firstStep > 0 && Math.abs(step - firstStep) > firstStep * (isOcr ? 0.38 : 0.28)) {
      return false;
    }
  }

  // Même marge gauche (autorise un léger alinéa positif sur la toute première ligne uniquement).
  const marginTol = isOcr ? Math.max(7, fs * 0.72) : Math.max(4, fs * 0.45);
  const bodyLeft = group.length >= 2 ? group[1].bbox.x : next.bbox.x;
  if (group.length === 1) {
    const indent = first.bbox.x - next.bbox.x;
    const sameLeft = Math.abs(indent) <= marginTol;
    const firstLineIndent = indent > marginTol && indent <= fs * 2.4 && Math.abs(lineRight(first) - lineRight(next)) <= fs * 2.2;
    if (!sameLeft && !firstLineIndent) return false;
  } else if (Math.abs(next.bbox.x - bodyLeft) > marginTol) {
    return false;
  }

  // Continuité de prose : pas une liste à puces, pas un libellé terminé par « : »,
  // pas des champs clé-valeur courts (« N° client : ... »), et la ligne précédente
  // doit être suffisamment remplie (pas une fin de paragraphe ni une étiquette courte).
  const prevText = prev.text.trim();
  const nextText = next.text.trim();
  if (HEADING_END_RE.test(prevText)) return false;
  if (BULLET_START_RE.test(nextText) || BULLET_START_RE.test(first.text.trim())) return false;
  const kvFieldRe = /^[^:;\n]{1,34}\s*:\s*\S/;
  if (kvFieldRe.test(prevText) && prev.bbox.w < fs * 24) return false;
  if (kvFieldRe.test(nextText) && next.bbox.w < fs * 24) return false;

  // Une ligne pleine d'un paragraphe a une largeur significative (évite de fusionner
  // deux courtes cellules de tableau, deux étiquettes ou deux lignes d'adresse courtes).
  if (prev.bbox.w < fs * 13.5) return false;

  const maxRightSoFar = Math.max(...group.map(lineRight), lineRight(next));
  const bodyWidth = Math.max(1, maxRightSoFar - Math.min(first.bbox.x, bodyLeft));
  // Si la ligne précédente s'arrête bien avant le bord droit du bloc, c'était la fin d'un paragraphe !
  if (lineRight(prev) < maxRightSoFar - Math.max(fs * 4.2, bodyWidth * 0.26)) {
    return false;
  }

  return true;
}

/**
 * Regroupe un tableau de lignes (`pdf` ou `ocr`) en unités d'édition :
 * chaque unité représente soit un paragraphe multi-lignes (`isParagraph: true`),
 * soit une ligne isolée (`isParagraph: false`).
 */
export function groupLinesIntoParagraphs(lines) {
  const valid = (lines || []).filter((l) => l && l.bbox && l.bbox.w > 0 && l.bbox.h > 0 && l.text?.trim());
  if (!valid.length) return [];

  // Tri de haut en bas, puis de gauche à droite.
  const sorted = [...valid].sort((a, b) => lineTop(b) - lineTop(a) || a.bbox.x - b.bbox.x);

  // Détecte les lignes qui partagent exactement la même rangée horizontale avec un voisin
  // proche dans un tableau (plusieurs colonnes courtes sur la même ordonnée).
  const used = new Set();
  const groups = [];

  for (let i = 0; i < sorted.length; i++) {
    const seed = sorted[i];
    if (used.has(seed.id)) continue;
    used.add(seed.id);
    const group = [seed];

    let searching = true;
    while (searching) {
      searching = false;
      const cur = group[group.length - 1];
      const fs = Math.max(4, cur.fontSize || cur.bbox.h);

      // Cherche la ligne libre située immédiatement sous `cur` dans la même colonne horizontale.
      let bestIdx = -1;
      let bestStep = Infinity;
      for (let j = i + 1; j < sorted.length; j++) {
        const cand = sorted[j];
        if (used.has(cand.id)) continue;
        const step = lineBaseline(cur) - lineBaseline(cand);
        if (step < fs * 0.5) continue;
        if (step > fs * 2.2) {
          // Trié du haut vers le bas : au-delà, plus aucun candidat proche possible.
          if (lineTop(cand) < lineBottom(cur) - fs * 2.2) break;
          continue;
        }
        const overlap = horizontalOverlap(cur, cand);
        if (overlap < Math.min(cur.bbox.w, cand.bbox.w) * 0.35) continue;
        if (step < bestStep) {
          bestStep = step;
          bestIdx = j;
        }
      }

      if (bestIdx >= 0) {
        const cand = sorted[bestIdx];
        // Vérifie qu'aucun autre bloc non fusionnable ne s'intercale verticalement dans la même colonne.
        const blocked = sorted.some((other) => {
          if (other.id === cur.id || other.id === cand.id) return false;
          const b = lineBaseline(other);
          if (b >= lineBaseline(cur) - 0.5 || b <= lineBaseline(cand) + 0.5) return false;
          return horizontalOverlap(cur, other) > Math.min(cur.bbox.w, other.bbox.w) * 0.25;
        });
        if (!blocked && canMergeIntoParagraph(group, cand)) {
          used.add(cand.id);
          group.push(cand);
          searching = true;
        }
      }
    }

    groups.push(group);
  }

  return groups.map((g) => buildUnitFromGroup(g));
}

export function buildUnitFromGroup(group) {
  if (group.length === 1) {
    const l = group[0];
    return {
      id: l.id,
      isParagraph: false,
      lines: [l],
      lineIds: [l.id],
      source: l.source || 'pdf',
      hiddenLayer: !!l.hiddenLayer,
      text: l.text,
      font: l.font || 'Helvetica',
      fontSize: l.fontSize || 12,
      bold: !!l.bold,
      italic: !!l.italic,
      baseline: lineBaseline(l),
      lineHeight: 1.16,
      bbox: { ...l.bbox },
      origBboxes: [{ ...l.bbox }],
      confidence: l.confidence,
    };
  }

  const first = group[0];
  const last = group[group.length - 1];
  const minX = Math.min(...group.map((l) => l.bbox.x));
  const maxX = Math.max(...group.map(lineRight));
  const minY = Math.min(...group.map(lineBottom));
  const maxY = Math.max(...group.map(lineTop));

  const sizes = group.map((l) => Math.max(4, l.fontSize || l.bbox.h)).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)];
  const avgStep = (lineBaseline(first) - lineBaseline(last)) / Math.max(1, group.length - 1);
  const lineHeight = clamp(Math.round((avgStep / medianSize) * 100) / 100, 0.95, 2.2);

  // Rejoint les lignes du paragraphe avec un espace simple pour le reflux automatique.
  const text = group
    .map((l) => l.text.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const confs = group.map((l) => l.confidence).filter((c) => typeof c === 'number');
  const confidence = confs.length
    ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100
    : undefined;

  return {
    id: first.id,
    isParagraph: true,
    lines: group,
    lineIds: group.map((l) => l.id),
    source: first.source || 'pdf',
    hiddenLayer: group.some((l) => l.hiddenLayer),
    text,
    font: first.font || 'Helvetica',
    fontSize: medianSize,
    bold: !!first.bold,
    italic: !!first.italic,
    baseline: lineBaseline(first),
    lineHeight,
    bbox: {
      x: minX,
      y: minY,
      w: Math.max(8, maxX - minX),
      h: Math.max(4, maxY - minY),
    },
    origBboxes: group.map((l) => ({ ...l.bbox })),
    confidence,
  };
}

/**
 * Découpe `text` en lignes visuelles tenant dans `maxWidth` selon `measureFn(str) -> width`.
 * Respecte les retours à la ligne explicites (`\n`) et coupe les mots trop longs si nécessaire.
 */
export function wrapTextToWidth(text, maxWidth, measureFn) {
  const rawLines = String(text ?? '').split('\n');
  if (!(maxWidth > 4) || typeof measureFn !== 'function') return rawLines;
  const out = [];
  for (const para of rawLines) {
    if (!para) {
      out.push('');
      continue;
    }
    const tokens = para.split(/(?<= )/);
    let current = '';
    for (const tok of tokens) {
      const candidate = current + tok;
      if (current && measureFn(candidate.replace(/ +$/, '')) > maxWidth) {
        out.push(current.replace(/ +$/, ''));
        current = tok.replace(/^ +/, '');
      } else {
        current = candidate;
      }
    }
    out.push(current.replace(/ +$/, ''));
  }
  return out;
}
