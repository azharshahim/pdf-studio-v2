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
};

const byId = new Map(CATALOG.map((c) => [c.id, c]));

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
