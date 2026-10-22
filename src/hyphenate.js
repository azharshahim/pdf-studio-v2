/**
 * Césure légère (français, et anglais de façon approchée) sans dictionnaire.
 *
 * Règles syllabiques classiques du français :
 *  - une consonne entre deux voyelles part avec la syllabe suivante (fac-tu-re) ;
 *  - deux consonnes se séparent (par-tir, bel-le), sauf les groupes inséparables
 *    (bl, br, ch, cl, cr, dr, fl, fr, gl, gn, gr, ph, pl, pr, th, tr, vr) ;
 *  - trois consonnes ou plus : coupure avant le groupe inséparable final, sinon
 *    avant la dernière consonne (cons-truire, obs-tiné) ;
 *  - jamais entre deux voyelles, jamais autour d'un « x » intervocalique ;
 *  - au moins 3 lettres de chaque côté, et pas de syllabe muette finale isolée
 *    (fac-tures plutôt que factu-res).
 *
 * Le résultat s'utilise avec des traits d'union conditionnels (U+00AD) : le
 * navigateur ne coupe qu'à ces endroits et affiche alors un tiret.
 */

export const SHY = '­';

const VOWELS = new Set('aeiouyàâäéèêëîïôöùûüÿœæ'.split(''));
const INSEPARABLE = new Set([
  'bl', 'br', 'ch', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gn', 'gr', 'ph', 'pl', 'pr', 'th', 'tr', 'vr', 'kl', 'kr',
  'qu', 'gu',
]);

function isVowelAt(w, i) {
  const c = w[i];
  if (!VOWELS.has(c)) return false;
  // « qu » et « gu » devant voyelle : le u appartient à la consonne.
  if (c === 'u' && i > 0 && (w[i - 1] === 'q' || w[i - 1] === 'g') && i + 1 < w.length && VOWELS.has(w[i + 1])) {
    return false;
  }
  return true;
}

/** Fin de mot muette : consonnes + e, es ou ent (« re », « tres », « blent »). */
function isMuteTail(tail) {
  if (/^ments?$/.test(tail)) return false; // « -ment » se coupe (rapide-ment)
  return /^[^aeiouyàâäéèêëîïôöùûüÿœæ]*e(s|nt)?$/.test(tail);
}

/**
 * Positions de coupure possibles dans un mot fait uniquement de lettres :
 * l'indice `i` signifie « couper entre word[i-1] et word[i] ».
 */
export function hyphenPoints(word, { minLeft = 3, minRight = 3 } = {}) {
  const w = String(word || '').toLowerCase();
  if (w.length < minLeft + minRight) return [];
  if (!/^\p{L}+$/u.test(w)) return [];
  const isV = [...w].map((_, i) => isVowelAt(w, i));
  const points = [];
  let i = 0;
  // Avance jusqu'au premier noyau vocalique.
  while (i < w.length && !isV[i]) i++;
  while (i < w.length) {
    // Fin du noyau vocalique courant.
    while (i < w.length && isV[i]) i++;
    const s = i;
    while (i < w.length && !isV[i]) i++;
    const e = i;
    if (e >= w.length) break; // consonnes finales : pas de coupure
    const n = e - s;
    let cut = -1;
    if (n === 1) {
      if (w[s] !== 'x') cut = s;
    } else if (n === 2) {
      const pair = w.slice(s, e);
      cut = INSEPARABLE.has(pair) || pair[1] === 'h' ? s : s + 1;
    } else if (n >= 3) {
      const last2 = w.slice(e - 2, e);
      cut = INSEPARABLE.has(last2) || last2[1] === 'h' ? e - 2 : e - 1;
    }
    if (cut >= minLeft && w.length - cut >= minRight && !isMuteTail(w.slice(cut))) {
      points.push(cut);
    }
  }
  return points;
}

/** Insère des traits d'union conditionnels dans un mot. */
export function hyphenateWord(word, opts) {
  const pts = hyphenPoints(word, opts);
  if (!pts.length) return word;
  let out = '';
  let prev = 0;
  for (const p of pts) {
    out += word.slice(prev, p) + SHY;
    prev = p;
  }
  return out + word.slice(prev);
}

/**
 * Insère des traits d'union conditionnels dans un texte.
 * `filter(word)` permet de ne traiter que certains mots (par exemple ceux qui
 * ne tiennent pas sur une ligne) ; par défaut tous les mots d'au moins
 * `minWordLength` lettres.
 */
export function hyphenateText(text, { minWordLength = 7, filter = null } = {}) {
  return String(text ?? '').replace(/\p{L}+/gu, (word) => {
    if (word.length < minWordLength) return word;
    if (filter && !filter(word)) return word;
    return hyphenateWord(word);
  });
}

/** Retire les traits d'union conditionnels. */
export function stripShy(text) {
  return String(text ?? '').split(SHY).join('');
}
