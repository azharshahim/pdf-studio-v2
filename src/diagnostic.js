/**
 * Mode diagnostic (désactivé par défaut).
 *
 * Affiche discrètement : le navigateur détecté, le mode d'édition réellement
 * utilisé (contentEditable ou textarea) et la position du curseur. Utile pour
 * diagnostiquer un clavier mobile capricieux sans outil de développement.
 */

/**
 * Décrit le navigateur à partir de son User-Agent, en restant court.
 * Les navigateurs embarqués (Samsung Internet, Edge, Chrome iOS) contiennent
 * « Chrome » ou « Safari » : ils sont testés en premier.
 * @param {string} ua
 * @returns {string} par exemple « Samsung Internet 26 » ou « Safari 18 »
 */
export function describeBrowser(ua = '') {
  const text = String(ua);
  const grab = (re) => {
    const match = text.match(re);
    return match ? match[1].split('.')[0] : null;
  };

  const samsung = grab(/SamsungBrowser\/([\d.]+)/);
  if (samsung) return `Samsung Internet ${samsung}`;
  const edge = grab(/Edg(?:iOS|A)?\/([\d.]+)/);
  if (edge) return `Edge ${edge}`;
  const firefox = grab(/Firefox\/([\d.]+)/);
  if (firefox) return `Firefox ${firefox}`;
  const firefoxIos = grab(/FxiOS\/([\d.]+)/);
  if (firefoxIos) return `Firefox iOS ${firefoxIos}`;
  const chromeIos = grab(/CriOS\/([\d.]+)/);
  if (chromeIos) return `Chrome iOS ${chromeIos}`;
  const chrome = grab(/Chrome\/([\d.]+)/);
  if (chrome) return `Chrome ${chrome}`;
  const safari = text.match(/Version\/([\d.]+).*Safari/);
  if (safari) return `Safari ${safari[1].split('.')[0]}`;
  return 'Navigateur inconnu';
}

/**
 * Ligne affichée par le badge.
 * @param {{browser:string, surface:?string, offset:?number}} info
 */
export function formatDiagnostic({ browser = '', surface = null, offset = null } = {}) {
  const mode =
    surface === 'textarea' ? 'textarea' : surface === 'contenteditable' ? 'contentEditable' : '—';
  const pos = Number.isInteger(offset) ? String(offset) : '—';
  return `${browser || 'Navigateur inconnu'} · ${mode} · offset ${pos}`;
}
