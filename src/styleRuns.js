/**
 * Styles par caractère d'un bloc de texte (gras, italique, couleur).
 *
 * Un bloc modifié garde des « segments » `runs` : [{ text, bold, italic, color }]
 * dont la concaténation est exactement `edit.text`. Quand le texte change, les
 * caractères conservés gardent leur style d'origine et les caractères saisis
 * prennent le style du caractère qui les précède (comme dans Acrobat ou Word).
 *
 * Sans `runs`, le bloc a un style unique (`edit.bold`, `edit.italic`, `edit.color`).
 */

const KEYS = ['bold', 'italic', 'color'];

export function sameStyle(a, b) {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && normColor(a.color) === normColor(b.color);
}

function normColor(c) {
  return String(c || '').toLowerCase();
}

function baseStyle(edit) {
  return { bold: !!edit.bold, italic: !!edit.italic, color: edit.color || '#111827' };
}

/** Fusionne les segments voisins de même style et retire les segments vides. */
export function compactRuns(runs) {
  const out = [];
  for (const r of runs || []) {
    if (!r || !r.text) continue;
    const prev = out[out.length - 1];
    if (prev && sameStyle(prev, r)) prev.text += r.text;
    else out.push({ text: r.text, bold: !!r.bold, italic: !!r.italic, color: r.color || '#111827' });
  }
  return out;
}

/** Style de chaque caractère (tableau aligné sur les unités UTF-16 du texte). */
export function charStyles(runs) {
  const out = [];
  for (const r of runs || []) {
    const st = { bold: !!r.bold, italic: !!r.italic, color: r.color };
    for (let i = 0; i < r.text.length; i++) out.push(st);
  }
  return out;
}

/** Reconstruit des segments à partir d'un texte et d'un style par caractère. */
export function runsFromChars(text, styles) {
  const runs = [];
  for (let i = 0; i < text.length; i++) {
    const st = styles[i] || styles[styles.length - 1] || {};
    const prev = runs[runs.length - 1];
    if (prev && sameStyle(prev, st)) prev.text += text[i];
    else runs.push({ text: text[i], bold: !!st.bold, italic: !!st.italic, color: st.color || '#111827' });
  }
  return runs;
}

/**
 * Adapte les segments à un nouveau texte : préfixe et suffixe communs gardent
 * leur style ; le texte inséré prend le style du caractère précédent (ou du
 * suivant en tout début de bloc).
 */
export function updateRunsForText(runs, newText) {
  const oldText = (runs || []).map((r) => r.text).join('');
  const text = String(newText ?? '');
  if (oldText === text) return compactRuns(runs);
  const styles = charStyles(runs);
  if (!styles.length) return null;
  let p = 0;
  const maxP = Math.min(oldText.length, text.length);
  while (p < maxP && oldText[p] === text[p]) p++;
  let s = 0;
  const maxS = Math.min(oldText.length - p, text.length - p);
  while (s < maxS && oldText[oldText.length - 1 - s] === text[text.length - 1 - s]) s++;
  const insertLen = text.length - p - s;
  // Style hérité : celui du caractère précédent ; après un blanc (début de mot),
  // celui du mot qui suit, pour ne pas étendre un libellé gras au mot saisi après lui.
  const nextIdx = oldText.length - s;
  const prevIsBlank = p > 0 && /\s/.test(oldText[p - 1]);
  const nextIsWord = nextIdx < oldText.length && !/\s/.test(oldText[nextIdx]);
  const inherit =
    p > 0 && !(prevIsBlank && nextIsWord) ? styles[p - 1] : styles[nextIdx] || styles[p - 1] || styles[0];
  const next = [
    ...styles.slice(0, p),
    ...Array.from({ length: insertLen }, () => inherit),
    ...styles.slice(oldText.length - s),
  ];
  return runsFromChars(text, next);
}

/** Vrai si le bloc a réellement plusieurs styles. */
export function hasMixedRuns(edit) {
  const runs = edit?.runs;
  if (!Array.isArray(runs) || runs.length < 2) return false;
  return runs.some((r) => !sameStyle(r, runs[0]));
}

/**
 * Remet `edit.runs` en accord avec `edit.text` (après une saisie, un
 * remplacement, une annulation…) et le supprime s'il ne sert plus à rien.
 * Retourne les segments à utiliser (toujours au moins un).
 */
export function syncRuns(edit) {
  const text = String(edit?.text ?? '');
  if (!edit || !Array.isArray(edit.runs) || !edit.runs.length) {
    return [{ text, ...baseStyle(edit || {}) }];
  }
  const updated = updateRunsForText(edit.runs, text);
  if (!updated || !updated.length) {
    delete edit.runs;
    return [{ text, ...baseStyle(edit) }];
  }
  edit.runs = updated;
  if (!hasMixedRuns(edit)) {
    // Un seul style : il devient le style du bloc.
    const only = updated[0];
    edit.bold = !!only.bold;
    edit.italic = !!only.italic;
    edit.color = only.color;
    delete edit.runs;
    return [{ text, ...baseStyle(edit) }];
  }
  return updated;
}

/**
 * Applique un réglage de mise en forme (gras, italique, couleur) à tout le
 * bloc : tous les segments le prennent.
 */
export function applyStyleToAllRuns(edit, key, value) {
  if (!KEYS.includes(key) || !Array.isArray(edit?.runs)) return;
  for (const r of edit.runs) r[key] = value;
  syncRuns(edit);
}

/**
 * Découpe le style par caractère en lignes, en suivant un découpage `lines`
 * (lignes visuelles du reflux) et un tableau `offsets` : pour chaque ligne,
 * l'indice dans `edit.text` de chaque caractère affiché (-1 pour un tiret de
 * césure ajouté, qui prend le style du caractère précédent).
 */
export function lineRunsFromOffsets(lines, offsets, styles, fallback) {
  return lines.map((line, li) => {
    const offs = offsets[li] || [];
    const out = [];
    let last = fallback;
    for (let i = 0; i < line.length; i++) {
      const o = offs[i];
      const st = o >= 0 && styles[o] ? styles[o] : last;
      last = st;
      const prev = out[out.length - 1];
      if (prev && sameStyle(prev, st)) prev.text += line[i];
      else out.push({ text: line[i], bold: !!st.bold, italic: !!st.italic, color: st.color || '#111827' });
    }
    return out;
  });
}

/** Segments de chaque ligne d'un texte coupé uniquement sur les `\n`. */
export function runsPerHardLine(edit) {
  const runs = syncRuns(edit);
  const lines = [[]];
  for (const r of runs) {
    const parts = r.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...r, text: part });
    });
  }
  return lines;
}

/**
 * Construit les segments d'un bloc à partir de ses mots : `tokens` est une
 * liste { start, end, bold, italic, color } sur `text`. Les espaces prennent
 * le style du mot qui précède. Retourne aussi le style majoritaire (en nombre
 * de caractères) qui devient le style de base du bloc.
 */
export function runsFromTokens(text, tokens, base) {
  const styles = Array.from({ length: text.length }, () => null);
  for (const t of tokens) {
    const st = {
      bold: typeof t.bold === 'boolean' ? t.bold : !!base.bold,
      italic: typeof t.italic === 'boolean' ? t.italic : !!base.italic,
      color: t.color || base.color,
    };
    for (let i = t.start; i < t.end && i < text.length; i++) styles[i] = st;
  }
  let last = null;
  for (let i = 0; i < styles.length; i++) {
    if (styles[i]) last = styles[i];
    else styles[i] = last;
  }
  const firstKnown = styles.find(Boolean) || { ...base };
  for (let i = 0; i < styles.length && !styles[i]; i++) styles[i] = firstKnown;
  const runs = runsFromChars(text, styles);
  // Style majoritaire, propriété par propriété (en nombre de caractères visibles).
  let boldW = 0;
  let italicW = 0;
  let total = 0;
  const colorW = new Map();
  for (const r of runs) {
    const n = r.text.replace(/\s/g, '').length;
    total += n;
    if (r.bold) boldW += n;
    if (r.italic) italicW += n;
    const k = normColor(r.color);
    colorW.set(k, { w: (colorW.get(k)?.w || 0) + n, color: r.color });
  }
  let bestColor = null;
  for (const v of colorW.values()) if (!bestColor || v.w > bestColor.w) bestColor = v;
  const major = {
    bold: total ? boldW * 2 > total : !!base.bold,
    italic: total ? italicW * 2 > total : !!base.italic,
    color: bestColor?.color || base.color,
  };
  return { runs: compactRuns(runs), major };
}

/**
 * Retrouve le style de chaque caractère des lignes visuelles (`lines`, issues
 * du reflux : espaces de fin retirés, tiret de césure ajouté) en les alignant
 * sur le texte du bloc. Retourne, pour chaque ligne, ses segments stylés.
 */
export function styledLinesFor(edit, lines) {
  const runs = syncRuns(edit);
  const text = runs.map((r) => r.text).join('');
  const styles = charStyles(runs);
  const fallback = styles[0] || { bold: !!edit.bold, italic: !!edit.italic, color: edit.color || '#111827' };
  let p = 0;
  let last = fallback;
  return (lines || []).map((line) => {
    const out = [];
    const push = (ch, st) => {
      const prev = out[out.length - 1];
      if (prev && sameStyle(prev, st)) prev.text += ch;
      else out.push({ text: ch, bold: !!st.bold, italic: !!st.italic, color: st.color || '#111827' });
    };
    const str = String(line ?? '');
    // Saute les blancs et retours à la ligne qui séparent deux lignes visuelles.
    while (p < text.length && /\s/.test(text[p]) && !(str && str[0] === text[p])) p++;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (p < text.length && text[p] === ch) {
        last = styles[p] || last;
        push(ch, last);
        p++;
        continue;
      }
      // Blancs multiples réduits, ou caractère ajouté (tiret de césure) : style du précédent.
      let q = p;
      while (q < text.length && /\s/.test(text[q]) && /\s/.test(ch) === false) q++;
      if (q < text.length && text[q] === ch && q - p <= 4) {
        p = q;
        last = styles[p] || last;
        push(ch, last);
        p++;
        continue;
      }
      push(ch, last);
    }
    return out;
  });
}
