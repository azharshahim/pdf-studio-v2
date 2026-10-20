/**
 * Calculs du zoom d'édition : rendre la ligne touchée lisible, la centrer sans
 * jamais couper son début, et revenir ensuite à la vue précédente.
 *
 * Fonctions pures, testées dans tests/zoom.test.js.
 */

/** Seuil de lisibilité à l'écran, en pixels CSS. */
export const READABLE_PX = 15;

/** Le texte de la ligne est-il déjà assez grand à l'écran ? */
export function isLineReadable(fontSize, scale, threshold = READABLE_PX) {
  return (Number(fontSize) || 12) * (Number(scale) || 1) >= threshold;
}

/**
 * Zoom nécessaire pour atteindre ≈ 16 px de texte, ou null si aucun zoom n'est
 * utile (texte déjà lisible, ou zoom demandé inférieur ou égal à l'existant).
 */
export function computeEditZoom({ fontSize, scale, mobile, maxZoom = 3, fits = true }) {
  if (!mobile || !scale) return null;
  if (isLineReadable(fontSize, scale) && fits) return null;
  const target = Math.min(maxZoom, Math.max(scale, 16 / (Number(fontSize) || 12)));
  if (target <= scale * 1.02) return null;
  return Math.round(target * 10000) / 10000;
}

/**
 * Position de défilement d'un axe : centrée quand l'élément tient dans la vue,
 * alignée sur son début (avec une marge) sinon. Jamais négative.
 */
export function centerAxis({ start, size, view, margin = 14 }) {
  const free = view - margin * 2;
  const raw = size <= free ? start + size / 2 - view / 2 : start - margin;
  return Math.max(0, Math.round(raw * 100) / 100);
}
