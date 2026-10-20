/**
 * Recherche insensible à la casse et aux accents.
 * Le texte normalisé conserve une table de correspondance vers les index
 * d'origine afin de surligner la bonne portion (œ, æ et diacritiques compris).
 */

/** Normalise une chaîne : minuscules, sans accents, œ/æ développés. */
export function normalizeForSearch(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

/**
 * Cherche `query` dans `text`.
 * @returns {{index:number,length:number}} index -1 si absent.
 */
export function findMatch(text, query) {
  const source = String(text ?? '');
  const needle = String(query ?? '');
  if (!needle) return { index: -1, length: 0 };

  const direct = source.toLowerCase().indexOf(needle.toLowerCase());
  if (direct >= 0) return { index: direct, length: needle.length };

  const target = normalizeForSearch(needle);
  if (!target) return { index: -1, length: 0 };

  let norm = '';
  const map = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    let n = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (ch === 'œ' || ch === 'Œ') n = 'oe';
    else if (ch === 'æ' || ch === 'Æ') n = 'ae';
    if (!n) continue;
    for (const c of n) {
      norm += c;
      map.push(i);
    }
  }

  const idx = norm.indexOf(target);
  if (idx < 0) return { index: -1, length: 0 };
  const start = map[idx];
  const lastIdx = Math.min(map.length - 1, idx + target.length - 1);
  const end = map[lastIdx] + 1;
  return { index: start, length: Math.max(1, end - start) };
}

/**
 * Découpe un texte en trois morceaux autour de la correspondance, pour
 * construire un extrait avec <mark>.
 */
export function matchSnippet(text, query, before = 36, after = 60) {
  const match = findMatch(text, query);
  if (match.index < 0) return null;
  const source = String(text);
  let start = Math.max(0, match.index - before);
  const prevSpace = source.lastIndexOf(' ', start);
  if (prevSpace >= 0 && prevSpace > match.index - before - 30) start = prevSpace + 1;
  const end = Math.min(source.length, match.index + match.length + after);
  return {
    before: (start > 0 ? '…' : '') + source.slice(start, match.index),
    hit: source.slice(match.index, match.index + match.length),
    after: source.slice(match.index + match.length, end) + (end < source.length ? '…' : ''),
    index: match.index,
    length: match.length,
  };
}
