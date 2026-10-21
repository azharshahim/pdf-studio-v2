/**
 * Télécharge des polices libres (SIL OFL) des paquets @fontsource (via jsDelivr) et
 * génère public/fonts/more/*.woff2 + src/fontsMore.json.
 * Usage : node scripts/fetch-fonts.mjs   (réseau requis, une seule fois)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// [slug fontsource, libellé, groupe, famille CSS de repli, sous-ensemble]
const LIST = [
  // Sans-serif
  ['inter', 'Inter', 'sans'], ['poppins', 'Poppins', 'sans'], ['nunito', 'Nunito', 'sans'],
  ['nunito-sans', 'Nunito Sans', 'sans'], ['source-sans-3', 'Source Sans 3', 'sans'],
  ['work-sans', 'Work Sans', 'sans'], ['raleway', 'Raleway', 'sans'], ['oswald', 'Oswald', 'sans'],
  ['ubuntu', 'Ubuntu', 'sans'], ['pt-sans', 'PT Sans', 'sans'], ['fira-sans', 'Fira Sans', 'sans'],
  ['dm-sans', 'DM Sans', 'sans'], ['barlow', 'Barlow', 'sans'], ['quicksand', 'Quicksand', 'sans'],
  ['mulish', 'Mulish', 'sans'], ['karla', 'Karla', 'sans'], ['rubik', 'Rubik', 'sans'],
  ['manrope', 'Manrope', 'sans'], ['josefin-sans', 'Josefin Sans', 'sans'], ['cabin', 'Cabin', 'sans'],
  ['hind', 'Hind', 'sans'], ['ibm-plex-sans', 'IBM Plex Sans', 'sans'], ['archivo', 'Archivo', 'sans'],
  ['noto-sans', 'Noto Sans (catalogue)', 'sans'], ['open-sans-condensed', 'Open Sans Condensed', 'sans'],
  ['roboto-condensed', 'Roboto Condensed', 'sans'], ['titillium-web', 'Titillium Web', 'sans'],
  ['exo-2', 'Exo 2', 'sans'], ['signika', 'Signika', 'sans'], ['asap', 'Asap', 'sans'],
  // Serif
  ['lora', 'Lora', 'serif'], ['libre-baskerville', 'Libre Baskerville', 'serif'],
  ['crimson-text', 'Crimson Text', 'serif'], ['eb-garamond', 'EB Garamond', 'serif'],
  ['cormorant-garamond', 'Cormorant Garamond', 'serif'], ['noto-serif', 'Noto Serif', 'serif'],
  ['pt-serif', 'PT Serif', 'serif'], ['source-serif-4', 'Source Serif 4', 'serif'],
  ['bitter', 'Bitter', 'serif'], ['cardo', 'Cardo', 'serif'], ['old-standard-tt', 'Old Standard TT', 'serif'],
  ['libre-caslon-text', 'Libre Caslon Text', 'serif'], ['spectral', 'Spectral', 'serif'],
  ['domine', 'Domine', 'serif'], ['vollkorn', 'Vollkorn', 'serif'], ['ibm-plex-serif', 'IBM Plex Serif', 'serif'],
  ['crimson-pro', 'Crimson Pro', 'serif'], ['zilla-slab', 'Zilla Slab', 'serif'],
  ['alegreya', 'Alegreya', 'serif'], ['arvo', 'Arvo', 'serif'], ['gelasio', 'Gelasio (≈ Georgia)', 'serif'],
  // Chasse fixe
  ['source-code-pro', 'Source Code Pro', 'mono'], ['fira-code', 'Fira Code', 'mono'],
  ['fira-mono', 'Fira Mono', 'mono'], ['ibm-plex-mono', 'IBM Plex Mono', 'mono'],
  ['space-mono', 'Space Mono', 'mono'], ['inconsolata', 'Inconsolata', 'mono'],
  ['jetbrains-mono', 'JetBrains Mono', 'mono'], ['ubuntu-mono', 'Ubuntu Mono', 'mono'],
  ['pt-mono', 'PT Mono', 'mono'], ['dm-mono', 'DM Mono', 'mono'], ['special-elite', 'Special Elite (machine à écrire)', 'mono'],
  ['cutive-mono', 'Cutive Mono', 'mono'],
  // Écriture / manuscrite
  ['pacifico', 'Pacifico', 'hand'], ['caveat', 'Caveat', 'hand'], ['satisfy', 'Satisfy', 'hand'],
  ['great-vibes', 'Great Vibes', 'hand'], ['sacramento', 'Sacramento', 'hand'],
  ['kaushan-script', 'Kaushan Script', 'hand'], ['shadows-into-light', 'Shadows Into Light', 'hand'],
  ['indie-flower', 'Indie Flower', 'hand'], ['homemade-apple', 'Homemade Apple', 'hand'],
  ['allura', 'Allura', 'hand'], ['parisienne', 'Parisienne', 'hand'], ['courgette', 'Courgette', 'hand'],
  ['merienda', 'Merienda', 'hand'], ['patrick-hand', 'Patrick Hand', 'hand'],
  ['architects-daughter', 'Architects Daughter', 'hand'], ['reenie-beanie', 'Reenie Beanie', 'hand'],
  ['alex-brush', 'Alex Brush', 'hand'], ['tangerine', 'Tangerine', 'hand'], ['yellowtail', 'Yellowtail', 'hand'],
  ['marck-script', 'Marck Script', 'hand'], ['gloria-hallelujah', 'Gloria Hallelujah', 'hand'],
  // Titres
  ['bebas-neue', 'Bebas Neue', 'display'], ['anton', 'Anton', 'display'], ['abril-fatface', 'Abril Fatface', 'display'],
  ['lobster', 'Lobster', 'display'], ['archivo-black', 'Archivo Black', 'display'],
  ['righteous', 'Righteous', 'display'], ['alfa-slab-one', 'Alfa Slab One', 'display'],
  ['fjalla-one', 'Fjalla One', 'display'], ['passion-one', 'Passion One', 'display'],
  ['bangers', 'Bangers', 'display'], ['permanent-marker', 'Permanent Marker', 'display'],
  ['cinzel', 'Cinzel', 'display'], ['playfair-display-sc', 'Playfair Display SC', 'display'],
  ['oleo-script', 'Oleo Script', 'display'], ['fredoka', 'Fredoka', 'display'], ['chewy', 'Chewy', 'display'],
  // Arabe
  ['amiri', 'Amiri', 'arabic', 'arabic'], ['cairo', 'Cairo', 'arabic', 'arabic'],
  ['tajawal', 'Tajawal', 'arabic', 'arabic'], ['scheherazade-new', 'Scheherazade New', 'arabic', 'arabic'],
  ['noto-kufi-arabic', 'Noto Kufi Arabic', 'arabic', 'arabic'], ['lateef', 'Lateef', 'arabic', 'arabic'],
  ['reem-kufi', 'Reem Kufi', 'arabic', 'arabic'], ['harmattan', 'Harmattan', 'arabic', 'arabic'],
  ['almarai', 'Almarai', 'arabic', 'arabic'], ['changa', 'Changa', 'arabic', 'arabic'],
];

const root = path.resolve(process.cwd());
const out = path.join(root, 'public/fonts/more');
fs.mkdirSync(out, { recursive: true });

// jsDelivr sert les paquets @fontsource sans passer par npm.
const BASE = 'https://cdn.jsdelivr.net/npm/@fontsource';
// curl : il respecte le proxy de l'environnement (le fetch de Node l'ignore).
async function grab(slug, subset, weight, style) {
  const url = `${BASE}/${slug}/files/${slug}-${subset}-${weight}-${style}.woff2`;
  try {
    return execFileSync('curl', ['-sSf', '-m', '30', url], { maxBuffer: 20 * 1024 * 1024 });
  } catch {
    return null;
  }
}

const manifest = [];
for (const [slug, label, group, subset = 'latin'] of LIST) {
  const files = {};
  const want = [['n', '400', 'normal'], ['b', '700', 'normal'], ['i', '400', 'italic'], ['bi', '700', 'italic']];
  for (const [key, weight, style] of want) {
    const name = `${slug}-${key}.woff2`;
    const target = path.join(out, name);
    // Reprise : un fichier déjà téléchargé n'est pas redemandé.
    const buf = fs.existsSync(target) ? fs.readFileSync(target) : await grab(slug, subset, weight, style);
    if (!buf || buf.length < 500) continue;
    if (!fs.existsSync(target)) fs.writeFileSync(target, buf);
    files[key] = name;
  }
  if (!files.n && fs.existsSync(path.join(out, `${slug}-n.woff2`))) files.n = `${slug}-n.woff2`;
  if (!files.n) {
    // Police sans graisse 400 (titres) : on prend la 500, puis la 700, comme « normale ».
    for (const w of ['500', '600', '700', '300']) {
      const buf = await grab(slug, subset, w, 'normal').catch(() => null);
      if (buf && buf.length > 500) {
        fs.writeFileSync(path.join(out, `${slug}-n.woff2`), buf);
        files.n = `${slug}-n.woff2`;
        break;
      }
    }
  }
  if (!files.n) {
    console.warn('introuvable :', slug);
    continue;
  }
  manifest.push({ id: label.replace(/ \(.*\)$/, ''), label, group, slug, files });
}
fs.writeFileSync(path.join(root, 'src/fontsMore.json'), JSON.stringify(manifest, null, 1));
const bytes = fs.readdirSync(out).reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log(`${manifest.length} polices, ${fs.readdirSync(out).length} fichiers, ${(bytes / 1048576).toFixed(1)} Mo`);
