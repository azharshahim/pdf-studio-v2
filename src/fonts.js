/**
 * Catalogue de polices libres (licence SIL OFL), embarquées avec l'application :
 * disponibles hors ligne, à l'écran (édition) comme dans le PDF exporté.
 *
 * Quatre polices PDF « standard » restent proposées (Helvetica, Times, Courier,
 * Noto Sans) : ce sont celles des anciens documents et de l'import.
 * `Arimo`, `Tinos` et `Cousine` ont exactement les mêmes largeurs qu'Arial,
 * Times New Roman et Courier New : elles remplacent ces polices sans décalage.
 */

import { assetUrl, setFontCssResolver } from './utils.js';
import MORE from './fontsMore.json';

/** @typedef {{id:string,label:string,css:string,group:string,files:{n:string,b?:string,i?:string,bi?:string},aliases:RegExp}} CatalogFont */

const f = (slug, hasItalic = true) => ({
  n: `catalog/${slug}-n.woff2`,
  b: `catalog/${slug}-b.woff2`,
  ...(hasItalic ? { i: `catalog/${slug}-i.woff2`, bi: `catalog/${slug}-bi.woff2` } : {}),
});

const FALLBACK = {
  sans: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", monospace',
  hand: 'cursive',
  display: 'Impact, Arial, sans-serif',
  arabic: '"Noto Naskh Arabic", serif',
};

/** @type {CatalogFont[]} */
export const CATALOG = [
  { id: 'Arimo', label: 'Arimo (≈ Arial)', css: 'Arimo, Arial, Helvetica, sans-serif', group: 'sans', files: f('arimo'), aliases: /^arimo/i },
  { id: 'Roboto', label: 'Roboto', css: 'Roboto, Arial, sans-serif', group: 'sans', files: f('roboto'), aliases: /roboto(?![ -]?mono)/i },
  { id: 'Open Sans', label: 'Open Sans', css: '"Open Sans", Arial, sans-serif', group: 'sans', files: f('open-sans'), aliases: /open[ -]?sans/i },
  { id: 'Lato', label: 'Lato', css: 'Lato, Arial, sans-serif', group: 'sans', files: f('lato'), aliases: /lato/i },
  { id: 'Montserrat', label: 'Montserrat', css: 'Montserrat, Arial, sans-serif', group: 'sans', files: f('montserrat'), aliases: /montserrat/i },
  { id: 'Tinos', label: 'Tinos (≈ Times New Roman)', css: 'Tinos, "Times New Roman", Times, serif', group: 'serif', files: f('tinos'), aliases: /^tinos/i },
  { id: 'Merriweather', label: 'Merriweather', css: 'Merriweather, Georgia, serif', group: 'serif', files: f('merriweather'), aliases: /merriweather/i },
  { id: 'Playfair Display', label: 'Playfair Display', css: '"Playfair Display", Georgia, serif', group: 'serif', files: f('playfair-display'), aliases: /playfair/i },
  { id: 'Cousine', label: 'Cousine (≈ Courier New)', css: 'Cousine, "Courier New", monospace', group: 'mono', files: f('cousine'), aliases: /^cousine/i },
  { id: 'Roboto Mono', label: 'Roboto Mono', css: '"Roboto Mono", monospace', group: 'mono', files: f('roboto-mono'), aliases: /roboto[ -]?mono/i },
  { id: 'Courier Prime', label: 'Courier Prime (machine à écrire)', css: '"Courier Prime", "Courier New", monospace', group: 'mono', files: f('courier-prime'), aliases: /courier[ -]?prime/i },
  { id: 'Dancing Script', label: 'Dancing Script (écriture)', css: '"Dancing Script", cursive', group: 'hand', files: f('dancing-script', false), aliases: /dancing/i },
];

// Polices supplémentaires (scripts/fetch-fonts.mjs) : chargées à la demande.
for (const m of MORE) {
  if (CATALOG.some((c) => c.id === m.id)) continue;
  const files = Object.fromEntries(Object.entries(m.files).map(([k, v]) => [k, `more/${v}`]));
  CATALOG.push({
    id: m.id,
    label: m.label,
    css: `"${m.id}", ${FALLBACK[m.group] || 'sans-serif'}`,
    group: m.group,
    files,
    aliases: new RegExp(`^${m.id.replace(/[^a-z0-9]+/gi, '[ -]?')}`, 'i'),
  });
}

/** Polices PDF de base, gardées pour la compatibilité. */
export const BASE_FONTS = [
  { id: 'Helvetica', label: 'Helvetica' },
  { id: 'Times', label: 'Times' },
  { id: 'Courier', label: 'Courier' },
  { id: 'Noto Sans', label: 'Noto Sans (Unicode, arabe)' },
];

export const GROUP_LABELS = {
  sans: 'Sans-serif',
  serif: 'Serif',
  mono: 'Chasse fixe',
  hand: 'Écriture',
  display: 'Titres',
  arabic: 'Arabe',
  local: 'Polices de ce PC',
};

const byId = new Map(CATALOG.map((c) => [c.id, c]));

/* ---------- Polices installées sur l'appareil (Windows, Acrobat…) ----------
 * Jamais copiées dans l'application : on les lit à la demande via l'API
 * « Local Font Access » (Chrome / Edge, après autorisation de l'utilisateur).
 * Elles servent à l'aperçu, aux mesures et à l'export sur cet appareil seulement. */
const LOCAL_KEY = 'studio-pdf-local-fonts';
const LOCAL_WANTED =
  /^(Verdana|Calibri|Segoe UI|Tahoma|Trebuchet MS|Georgia|Cambria|Consolas|Arial|Times New Roman|Courier New|Century Gothic|Candara|Corbel|Constantia|Franklin Gothic|Palatino Linotype|Garamond|Book Antiqua|Lucida Sans|Microsoft Sans Serif|Myriad|Minion|Adobe|Calisto|Gill Sans|Bookman|Rockwell|Comic Sans)/i;
/** @type {Map<string, Record<string, any>>} id → { n, b, i, bi } (objets FontData) */
const localFaces = new Map();

export function localFontsSupported() {
  return typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
}
export function localFontsEnabled() {
  try {
    return localStorage.getItem(LOCAL_KEY) === '1';
  } catch {
    return false;
  }
}
export function localFontIds() {
  return [...localFaces.keys()];
}

function variantKey(style = '') {
  const st = style.toLowerCase();
  const bold = /bold|black|heavy/.test(st) && !/semi|demi/.test(st);
  const italic = /italic|oblique/.test(st);
  if (/^(regular|normal|book|roman)$/.test(st)) return 'n';
  if (/semi|demi|light|thin|narrow|condensed|medium|extra|ultra/.test(st)) return null;
  return bold && italic ? 'bi' : bold ? 'b' : italic ? 'i' : null;
}

/**
 * Lit les polices de l'appareil (geste de l'utilisateur requis la première fois)
 * et les ajoute au catalogue, groupe « local ». Renvoie le nombre de familles.
 */
export async function loadLocalFonts({ remember = true } = {}) {
  if (!localFontsSupported()) return 0;
  const list = await window.queryLocalFonts();
  localFaces.clear();
  for (const fd of list) {
    if (!LOCAL_WANTED.test(fd.family)) continue;
    const key = variantKey(fd.style);
    if (!key) continue;
    if (!localFaces.has(fd.family)) localFaces.set(fd.family, {});
    localFaces.get(fd.family)[key] ||= fd;
  }
  for (const [family, faces] of [...localFaces]) {
    if (!faces.n || CATALOG.some((c) => c.id === family && !c.local)) {
      localFaces.delete(family);
      continue;
    }
    if (byId.has(family)) continue;
    const mono = /consolas|courier|lucida console/i.test(family);
    const serif = /times|georgia|cambria|constantia|palatino|garamond|book antiqua|bookman|minion|calisto/i.test(family);
    const entry = {
      id: family,
      label: family,
      css: `"${family}", ${mono ? 'monospace' : serif ? 'serif' : 'sans-serif'}`,
      group: 'local',
      local: true,
      files: {},
      aliases: new RegExp(`^${family.replace(/[^a-z0-9]+/gi, '[ -]?')}`, 'i'),
    };
    CATALOG.push(entry);
    byId.set(family, entry);
  }
  if (remember) {
    try {
      localStorage.setItem(LOCAL_KEY, '1');
    } catch {
      /* ignoré */
    }
  }
  return localFaces.size;
}

/** Octets (TrueType/OpenType) d'une police locale, pour l'export. */
export async function localFontBytes(id, bold, italic) {
  const faces = localFaces.get(id);
  if (!faces) return null;
  const want = bold && italic ? 'bi' : bold ? 'b' : italic ? 'i' : 'n';
  const chain = { bi: ['bi', 'b', 'i', 'n'], b: ['b', 'n'], i: ['i', 'n'], n: ['n'] }[want];
  for (const k of chain) {
    if (!faces[k]) continue;
    const blob = await faces[k].blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    // Collection TrueType (.ttc) : non prise en charge par l'embarquement.
    if (String.fromCharCode(...buf.slice(0, 4)) === 'ttcf') return null;
    return buf;
  }
  return null;
}

/** Redemande silencieusement les polices si l'autorisation a déjà été donnée. */
export async function restoreLocalFonts() {
  if (!localFontsSupported() || !localFontsEnabled()) return 0;
  try {
    const perm = await navigator.permissions?.query({ name: 'local-fonts' });
    if (perm && perm.state !== 'granted') return 0;
    return await loadLocalFonts({ remember: false });
  } catch {
    return 0;
  }
}

export function catalogFont(id) {
  return byId.get(id) || null;
}

setFontCssResolver((id) => byId.get(id)?.css || null);

/** Fichier de police pour une variante ; replie sur la plus proche disponible. */
export function catalogFile(id, bold, italic) {
  const font = byId.get(id);
  if (!font) return null;
  const { files } = font;
  const wanted = bold && italic ? 'bi' : bold ? 'b' : italic ? 'i' : 'n';
  const chain = {
    bi: ['bi', 'b', 'i', 'n'],
    b: ['b', 'n'],
    i: ['i', 'n'],
    n: ['n'],
  }[wanted];
  for (const key of chain) if (files[key]) return files[key];
  return files.n;
}

/** Famille CSS pour l'aperçu à l'écran, ou null si ce n'est pas une police du catalogue. */
export function catalogCss(id) {
  return byId.get(id)?.css || null;
}

/**
 * Devine la police du catalogue la plus proche d'un nom de police PDF
 * (« ABCDEF+Roboto-Bold » → « Roboto »).
 */
export function matchCatalogByName(name = '') {
  const clean = String(name).replace(/^[A-Z]{6}\+/, '');
  for (const c of CATALOG) if (c.aliases.test(clean)) return c.id;
  return null;
}

const loaded = new Map();

/**
 * Charge une police du catalogue dans le navigateur (FontFace) pour que
 * l'aperçu et les mesures de texte correspondent à l'export. Silencieux si
 * l'API n'existe pas.
 */
export function ensureCatalogFont(id) {
  const font = byId.get(id);
  if (font?.local) return Promise.resolve(true); // déjà installée sur l'appareil
  if (!font || typeof FontFace === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }
  if (loaded.has(id)) return loaded.get(id);
  const family = font.css.split(',')[0].replace(/"/g, '').trim();
  const variants = [
    ['n', 'normal', '400'],
    ['b', 'normal', '700'],
    ['i', 'italic', '400'],
    ['bi', 'italic', '700'],
  ].filter(([key]) => font.files[key]);
  const promise = Promise.all(
    variants.map(async ([key, style, weight]) => {
      const face = new FontFace(family, `url(${assetUrl(`fonts/${font.files[key]}`)}) format("woff2")`, {
        style,
        weight,
      });
      await face.load();
      document.fonts.add(face);
    })
  )
    .then(() => true)
    .catch((err) => {
      console.warn('[fonts] chargement impossible', id, err);
      loaded.delete(id);
      return false;
    });
  loaded.set(id, promise);
  return promise;
}
