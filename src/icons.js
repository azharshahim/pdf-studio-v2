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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>',
  languages:
    '<path d="M4 5.5h8M8 5.5V4M10.5 5.5c-.6 4-3 7.2-6 9M6 9.5c1.4 2.6 3.7 4.6 6.5 5.7"/><path d="m13 20 3.5-8 3.5 8M14.3 17.5h4.4"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.5 20.5v-6h5v6"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  pen: '<path d="M4.5 19.5h4L20 8l-4-4L4.5 15.5z"/><path d="m13.5 6.5 4 4M4.5 19.5 3 21"/>',
  highlight: '<path d="M4 20h16"/><path d="M7 15.5 15.5 7a2.1 2.1 0 0 1 3 3L10 18.5z"/><path d="M6.5 17h4"/>',
  strike: '<path d="M5 12h14"/><path d="M7 8.5a4 4 0 0 1 4-3c2 0 3.5.8 4.2 2M7 15c.4 2 2.2 3.2 5 3.2 2.2 0 3.8-.9 4.4-2.4"/>',
  note: '<path d="M5 5.5h14v10l-4 4H5z"/><path d="M15 19.5v-4h4"/><path d="M8.5 9h7M8.5 12.5h4"/>',
  eraser: '<path d="m9 19.5-4.5-4.5a2 2 0 0 1 0-2.8l7-7a2 2 0 0 1 2.8 0l4.5 4.5a2 2 0 0 1 0 2.8l-7 7z"/><path d="M4 20.5h16M8.5 9.5l5 5"/>',
  square: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>',
  circle: '<ellipse cx="12" cy="12" rx="8" ry="7"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  signature: '<path d="M4 17c3 0 3.5-9 6-9s1 7 3.5 7 2.5-6 4-6 1.5 3 2.5 3"/><path d="M4 20.5h16"/>',
  stamp: '<path d="M9 4h6a2 2 0 0 1 2 2v3l-1.5 2h-7L7 9V6a2 2 0 0 1 2-2z"/><path d="M7 13h10v3.5H7z"/><path d="M5 19.5h14"/>',
  layers: '<path d="m12 3.5 8.5 4.5L12 12.5 3.5 8z"/><path d="m4 12 8 4.2 8-4.2M4 16l8 4.2 8-4.2"/>',
  more: '<circle cx="12" cy="5.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/>',
  printer: '<path d="M7 9V4.5h10V9"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7.5 14h9v6h-9z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 14.5v2.5"/>',
  compress: '<path d="M12 3.5v6M9.5 7l2.5 2.5L14.5 7"/><path d="M12 20.5v-6M9.5 17l2.5-2.5 2.5 2.5"/><path d="M4 12h16"/>',
  convert: '<path d="M4.5 8.5h12l-3-3M19.5 15.5h-12l3 3"/>',
  share: '<circle cx="6.5" cy="12" r="2.5"/><circle cx="17" cy="6.5" r="2.5"/><circle cx="17" cy="17.5" r="2.5"/><path d="m8.8 10.8 5.9-3.1M8.8 13.2l5.9 3.1"/>',
  camera: '<path d="M4 8.5h3l1.5-2h7l1.5 2h3v10H4z"/><circle cx="12" cy="13.2" r="3.3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5V10h-5.5"/>',
  crop: '<path d="M7 3.5v13.5h13.5"/><path d="M3.5 7H17v13.5"/>',
  checkSquare: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12.2 2.6 2.6L16 9"/>',
  eye: '<path d="M2.8 12S6 6.5 12 6.5 21.2 12 21.2 12 18 17.5 12 17.5 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  sliders: '<path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="17" r="2"/>',
  save: '<path d="M5 4.5h11L20 8.5v11H5z"/><path d="M8.5 4.5v5h7v-5"/><path d="M8.5 15.5h7"/>',
  clock2: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  searchDoc2: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
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
