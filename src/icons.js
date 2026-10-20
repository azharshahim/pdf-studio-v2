/* Jeu d'icônes SVG (tracé fin, 24×24) */
const P = {
  file: '<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3v6h6"/>',
  fileText:
    '<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2a2 2 0 0 1 1.4.6l1 1a2 2 0 0 0 1.4.6h5a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20.5h14"/>',
  chevronDown: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  chevronUp: '<path d="m6.5 14.5 5.5-5.5 5.5 5.5"/>',
  chevronLeft: '<path d="m14.5 6.5-5.5 5.5 5.5 5.5"/>',
  chevronRight: '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fit: '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5V9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15M15 20h3.5a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M8 12h8"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M15 4.5v15"/>',
  scan:
    '<path d="M4 8.5V6.5A2.5 2.5 0 0 1 6.5 4h2M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2"/><path d="M4 12h16" stroke-dasharray="2 3"/>',
  edit: '<path d="M4.5 19.5h4L20 8l-4-4L4.5 15.5z"/><path d="m13.5 6.5 4 4"/>',
  text: '<path d="M5 5.5h14M12 5.5v13M9 18.5h6"/>',
  shield: '<path d="M12 3.5 5 6.2v5.5c0 4.2 2.9 7.4 7 8.8 4.1-1.4 7-4.6 7-8.8V6.2z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  check: '<path d="m4.5 12.5 5 5L20 6.5"/>',
  undo: '<path d="M9 5 4 10l5 5"/><path d="M4 10h9a6.5 6.5 0 0 1 0 13h-1"/>',
  redo: '<path d="m15 5 5 5-5 5"/><path d="M20 10h-9a6.5 6.5 0 0 0 0 13h1"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15.5 9V6.5A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5H9"/>',
  trash:
    '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10.5 11v5.5M13.5 11v5.5"/>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m5 17 5-5 3.5 3.5 2.5-2 3 3"/>',
  arrowLeft: '<path d="M19 12H5m0 0 6-6m-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14m0 0-6-6m6 6-6 6"/>',
  sparkle:
    '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6L4.5 10.8 10.2 9z"/><path d="M18.5 16.5 19.2 19l2.3.8-2.3.7-.7 2.5-.7-2.5-2.3-.7 2.3-.8z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 4 2.8 20h18.4z"/><path d="M12 9.5v5M12 17.3v.2"/>',
  loader: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />',
  languages:
    '<path d="M4 5.5h8M8 5.5V4M10.5 5.5c-.6 4-3 7.2-6 9M6 9.5c1.4 2.6 3.7 4.6 6.5 5.7"/><path d="m13 20 3.5-8 3.5 8M14.3 17.5h4.4"/>',
  searchDoc:
    '<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3v6h6"/><circle cx="11" cy="14.5" r="2.8"/><path d="m13.2 16.7 2.3 2.3"/>',
};
export function icon(name, size = 18) {
  const body = P[name] || P.file;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconDone) return;
    el.innerHTML = icon(el.dataset.icon, el.dataset.iconSize ? +el.dataset.iconSize : 18);
    el.dataset.iconDone = '1';
  });
}
