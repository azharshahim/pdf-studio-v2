/**
 * Édition directe sur la page : un bloc éditable est superposé à la ligne du
 * PDF, à la même position et avec le même rendu (police, taille, couleur,
 * fond échantillonné). Aucun panneau latéral n'est nécessaire.
 *
 * Le module ne connaît ni pdf.js ni pdf-lib : il reçoit la conversion
 * bbox PDF → rectangle CSS et signale les changements à l'application, qui
 * conserve la logique d'historique, d'export et de sauvegarde.
 *
 * Deux surfaces de saisie coexistent :
 *  - un `div[contenteditable=plaintext-only]` par défaut ;
 *  - un `textarea` superposé, même police et même interligne, quand le
 *    navigateur s'avère instable (Samsung Internet notamment).
 * Dans les deux cas, le contenu n'est jamais réécrit pendant la frappe : le
 * modèle est mis à jour par les événements `input` / `beforeinput`.
 */

import * as U from './utils.js';
import { isSamsungUserAgent, wordBoundsAt } from './caretPoint.js';

/** Familles CSS correspondant aux polices proposées à l'édition. */
export function cssFontFamilyFor(font) {
  return U.cssFontFamily(font);
}

/** Normalise le texte saisi (fins de ligne, espaces insécables). */
export function normalizeInlineText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '');
}

const FONT_CHOICES = ['Helvetica', 'Times', 'Courier', 'Noto Sans'];

/**
 * Détecteur d'instabilité du `contenteditable` (Samsung Internet remet
 * parfois le curseur à zéro pendant la frappe). Deux sauts consécutifs
 * déclenchent le repli sur `textarea`.
 */
export function createInstabilityGuard(limit = 2) {
  let jumps = 0;
  return {
    /** @returns {boolean} vrai si le repli doit être déclenché */
    note({ before, after, lengthBefore, lengthAfter }) {
      const grew = lengthAfter > lengthBefore;
      // Le texte s'allonge mais le curseur reste à zéro : signature du bug
      // Samsung. `before` peut déjà valoir 0 après un premier saut, d'où le
      // test sur `after` seul.
      const reset = after === 0 && grew;
      const movedBack = after < before - 1 && lengthAfter === lengthBefore;
      if (reset || movedBack) jumps += 1;
      else jumps = 0;
      return jumps >= limit;
    },
    get jumps() {
      return jumps;
    },
    reset() {
      jumps = 0;
    },
  };
}

export function createInlineEditor({
  overlay,
  getScale,
  rectFor,
  onChange,
  onCommit,
  onDelete,
  onDuplicate,
}) {
  let shell = null;
  let textEl = null;
  let surface = 'ce'; // 'ce' = contenteditable, 'ta' = textarea
  let edit = null;
  let isNew = false;
  let moveHandle = null;
  let resizeHandle = null;
  let dragState = null;
  let composing = false;
  let refreshQueued = false;
  let lastCaret = null;
  let lastLength = 0;
  let typedSinceOpen = false;
  let preferTextarea = false;
  const guard = createInstabilityGuard();
  const isSamsung = isSamsungUserAgent(
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  );

  /* ─────────────────────── Surface de saisie ─────────────────────── */

  function applyInputAttributes(el) {
    el.spellcheck = false;
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'none');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('data-gramm', 'false');
    el.setAttribute('data-gramm_editor', 'false');
    el.setAttribute('data-enable-grammarly', 'false');
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
  }

  function makeContentEditable() {
    const el = document.createElement('div');
    el.className = 'inline-text';
    try {
      el.contentEditable = 'plaintext-only';
    } catch {
      /* navigateur ancien */
    }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.dataset.placeholder = 'Saisissez le texte…';
    return el;
  }

  function makeTextarea() {
    const el = document.createElement('textarea');
    el.className = 'inline-text inline-textarea';
    el.rows = 1;
    el.wrap = 'off';
    el.setAttribute('wrap', 'off');
    el.setAttribute('enterkeyhint', 'enter');
    return el;
  }

  function readText(el = textEl) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA') return el.value;
    return el.innerText;
  }

  function writeText(value) {
    if (!textEl) return;
    if (textEl.tagName === 'TEXTAREA') textEl.value = value;
    else textEl.textContent = value;
  }

  /** Position du curseur dans la surface courante. */
  function caretOffset() {
    if (!textEl) return 0;
    if (textEl.tagName === 'TEXTAREA') return textEl.selectionStart ?? 0;
    const selection = window.getSelection();
    const node = textEl.firstChild;
    if (!selection || !selection.anchorNode || !node) return 0;
    if (selection.anchorNode === node) return selection.anchorOffset;
    return textEl.contains(selection.anchorNode) ? (selection.anchorOffset || 0) : 0;
  }

  function buildSurfaceListeners(el) {
    el.addEventListener('compositionstart', () => {
      composing = true;
    });

    el.addEventListener('compositionend', () => {
      composing = false;
      typedSinceOpen = true;
      if (!edit || !textEl) return;
      edit.text = normalizeInlineText(readText());
      onChange?.(edit);
      scheduleRefresh();
      requestAnimationFrame(keepCaretVisible);
    });

    // `input` : on met à jour le modèle, jamais le DOM de la surface.
    el.addEventListener('input', () => {
      if (!edit || !textEl) return;
      typedSinceOpen = true;
      edit.text = normalizeInlineText(readText());
      const after = caretOffset();
      if (surface === 'ce' && !composing) {
        // Un `contenteditable` stable ne replace jamais le curseur en tête
        // quand le texte s'allonge : c'est exactement le symptôme Samsung.
        const fallback = guard.note({
          before: lastCaret ?? after,
          after,
          lengthBefore: lastLength,
          lengthAfter: edit.text.length,
        });
        if (fallback && edit.text.trim()) {
          lastCaret = after;
          lastLength = edit.text.length;
          switchToTextarea(edit.text, after);
          return;
        }
      }
      lastCaret = after;
      lastLength = edit.text.length;
      onChange?.(edit);
      if (!composing) requestAnimationFrame(keepCaretVisible);
    });

    el.addEventListener('beforeinput', () => {
      // Rien à réécrire : on garde seulement l'état d'avant la frappe pour
      // détecter un éventuel saut de curseur, et on évite que le navigateur
      // n'hérite des styles (gras, couleur) du PDF.
      if (!composing) {
        lastCaret = caretOffset();
        lastLength = readText().length;
      }
    });

    el.addEventListener('paste', (ev) => {
      ev.preventDefault();
      const raw = (ev.clipboardData || window.clipboardData)?.getData('text/plain') || '';
      const clean = normalizeInlineText(raw);
      if (!clean) return;
      if (textEl?.tagName === 'TEXTAREA') {
        const start = textEl.selectionStart ?? 0;
        const end = textEl.selectionEnd ?? start;
        textEl.setRangeText(clean, start, end, 'end');
        textEl.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, clean);
      }
    });

    el.addEventListener('keydown', (ev) => {
      if (ev.isComposing) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onCommit?.('escape');
        return;
      }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        onCommit?.('shortcut');
      }
      if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
        // Une ligne du PDF reste une ligne : Entrée valide, Maj+Entrée passe
        // à la ligne (le bloc peut alors s'agrandir).
        ev.preventDefault();
        onCommit?.('enter');
      }
    });

    el.addEventListener('focus', () => {
      // Sur mobile, le clavier met quelques centaines de ms à apparaître : on
      // recentre une fois, mais jamais si l'utilisateur a déjà commencé à
      // taper (un défilement pendant la saisie fait sauter le curseur).
      setTimeout(() => {
        if (typedSinceOpen || composing) return;
        scrollIntoView();
      }, 280);
    });
  }

  /**
   * Remplace la surface `contenteditable` par un `textarea` superposé, à
   * l'identique (même police, même taille, même couleur, même interligne),
   * en conservant texte et position du curseur.
   */
  function switchToTextarea(text, offset) {
    if (!shell || surface === 'ta') return;
    preferTextarea = true;
    const previous = textEl;
    surface = 'ta';
    textEl = makeTextarea();
    textEl.value = text;
    applyInputAttributes(textEl);
    buildSurfaceListeners(textEl);
    if (previous) previous.replaceWith(textEl);
    else shell.insertBefore(textEl, moveHandle);
    shell.dataset.surface = 'textarea';
    applyStyle();
    position();
    requestAnimationFrame(() => {
      textEl.focus({ preventScroll: true });
      placeCaret({ offset });
    });
  }

  function build() {
    shell = document.createElement('div');
    shell.className = 'inline-shell';
    surface = preferTextarea ? 'ta' : 'ce';
    shell.dataset.surface = surface === 'ta' ? 'textarea' : 'contenteditable';

    textEl = surface === 'ta' ? makeTextarea() : makeContentEditable();
    applyInputAttributes(textEl);
    buildSurfaceListeners(textEl);

    moveHandle = document.createElement('button');
    moveHandle.type = 'button';
    moveHandle.className = 'inline-handle move';
    moveHandle.tabIndex = -1;
    moveHandle.setAttribute('aria-label', 'Déplacer le bloc');
    moveHandle.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2v12M4 6l4-4 4 4M4 10l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    resizeHandle = document.createElement('button');
    resizeHandle.type = 'button';
    resizeHandle.className = 'inline-handle resize';
    resizeHandle.tabIndex = -1;
    resizeHandle.setAttribute('aria-label', 'Redimensionner le bloc');
    resizeHandle.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 13L13 3M9 3h4v4M13 9v4H9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    for (const handle of [moveHandle, resizeHandle]) {
      handle.addEventListener('pointerdown', (ev) => startDrag(handle === moveHandle ? 'move' : 'resize', ev));
    }

    shell.appendChild(textEl);
    shell.appendChild(moveHandle);
    shell.appendChild(resizeHandle);

    shell.addEventListener('pointermove', onDragMove);
    shell.addEventListener('pointerup', endDrag);
    shell.addEventListener('pointercancel', endDrag);
  }

  /* ───────────────────────── Rendu et placement ───────────────────────── */

  function applyStyle() {
    if (!edit || !shell) return;
    const scale = getScale() || 1;
    const sizePx = Math.max(4, (Number(edit.size) || 12) * scale);
    shell.style.fontFamily = cssFontFamilyFor(edit.font);
    shell.style.fontSize = `${sizePx}px`;
    shell.style.lineHeight = String(edit.lineHeight || 1.16);
    shell.style.letterSpacing = edit.charSpacing ? `${Number(edit.charSpacing) * scale}px` : '';
    shell.style.fontStretch = '';
    if (textEl) {
      const hz = Number(edit.hScale) || 100;
      textEl.style.transform = hz !== 100 ? `scaleX(${hz / 100})` : '';
      textEl.style.transformOrigin = 'left center';
      textEl.style.width = hz !== 100 ? `${100 / (hz / 100)}%` : '';
    }
    shell.style.fontWeight = edit.bold ? '700' : '400';
    shell.style.fontStyle = edit.italic ? 'italic' : 'normal';
    shell.style.textDecoration = edit.underline ? 'underline' : 'none';
    shell.style.textDecorationThickness = edit.underline ? `${Math.max(1, sizePx * 0.06)}px` : '';
    shell.style.color = edit.color || '#111827';
    shell.style.textAlign = edit.align || 'left';
    const bg = edit.bg && edit.bg !== 'none' ? edit.bg : 'transparent';
    shell.style.setProperty('--inline-bg', edit.kind === 'add' ? 'transparent' : bg);
    shell.classList.toggle('is-new', edit.kind === 'add');
    if (moveHandle) moveHandle.hidden = edit.kind !== 'add';
    if (resizeHandle) resizeHandle.hidden = edit.kind !== 'add';
  }

  function position() {
    if (!edit || !shell) return;
    const scale = getScale() || 1;
    const rect = rectFor(edit.bbox);
    const padX = Math.max(1, (Number(edit.size) || 10) * 0.12) * scale;
    const padY = Math.max(0.8, (Number(edit.size) || 10) * 0.05) * scale;
    const left = rect.left - padX;
    shell.style.left = `${left}px`;
    shell.style.top = `${rect.top - padY}px`;
    // La boîte s'élargit pour contenir le texte saisi, sans déborder de la page.
    const base = Math.max(24, rect.width + padX * 2);
    const needed = textEl ? textEl.scrollWidth + padX * 2 : base;
    // Le bloc ne dépasse jamais la zone visible : une ligne plus large que
    // l'écran après zoom défile à l'intérieur du champ, elle n'est pas coupée.
    const scroller = document.getElementById('canvasScroll');
    const overlayRect = overlay.getBoundingClientRect();
    const viewRight = scroller
      ? scroller.getBoundingClientRect().right - 8 - overlayRect.left
      : (overlay.clientWidth || base) - 2;
    const available = Math.max(48, Math.min(overlay.clientWidth - left - 2, viewRight - left));
    // Une ligne d'origine plus large que l'écran est rognée au cadre visible :
    // c'est le texte qui défile dans le champ, pas la page.
    shell.style.width = `${Math.min(Math.max(base, needed), available)}px`;
    shell.style.minHeight = `${Math.max(4, rect.height + padY * 2)}px`;
    shell.style.padding = `${padY}px ${padX}px`;
    if (textEl?.tagName === 'TEXTAREA' && !composing) {
      // Un `textarea` doit être aussi haut que son contenu, sinon la dernière
      // ligne est masquée par la barre de défilement interne.
      textEl.style.height = 'auto';
      const lineHeight = (Number(edit.lineHeight) || 1.16) * Math.max(4, (Number(edit.size) || 12) * scale);
      textEl.style.height = `${Math.max(lineHeight * 1.2, textEl.scrollHeight)}px`;
    }
  }

  /* ───────────── Défilement horizontal : le curseur reste visible ───────────── */

  let measureCtx = null;

  function prefixWidth(value) {
    if (!measureCtx) {
      const canvas = document.createElement('canvas');
      measureCtx = canvas.getContext('2d');
    }
    if (!measureCtx || !shell) return 0;
    const cs = window.getComputedStyle(shell);
    measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return measureCtx.measureText(value).width;
  }

  /** Position horizontale (écran) du curseur, ou null si indéterminable. */
  function caretScreenX() {
    if (!textEl) return null;
    const box = textEl.getBoundingClientRect();
    if (textEl.tagName === 'TEXTAREA') {
      const offset = textEl.selectionStart ?? 0;
      return box.left + prefixWidth(textEl.value.slice(0, offset)) - textEl.scrollLeft;
    }
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect?.();
    if (!rect || (!rect.width && !rect.height)) {
      // Firefox ne fournit pas de rectangle pour un curseur simple : on pose
      // un marqueur invisible dans une copie de la plage, retiré aussitôt.
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      const copy = range.cloneRange();
      copy.collapse(false);
      copy.insertNode(marker);
      rect = marker.getBoundingClientRect();
      marker.remove();
    }
    return rect && rect.width + rect.height > 0 ? rect.left : null;
  }

  /**
   * Fait défiler le champ horizontalement pour que le curseur reste visible
   * (avant et pendant la saisie, clavier ouvert). Ne touche jamais à la
   * sélection ni au contenu.
   */
  function keepCaretVisible() {
    if (!textEl || !shell?.isConnected) return;
    const box = textEl.getBoundingClientRect();
    const x = caretScreenX();
    if (x == null || !Number.isFinite(x)) return;
    const margin = Math.min(36, Math.max(8, box.width / 3));
    if (x < box.left + margin) {
      textEl.scrollLeft = Math.max(0, textEl.scrollLeft - (box.left + margin - x));
    } else if (x > box.right - margin) {
      textEl.scrollLeft += x - (box.right - margin);
    }
  }

  /**
   * Centre le bloc dans la zone visible au-dessus du clavier. Si le bloc est
   * plus large que l'écran, on aligne son bord gauche : le début de la ligne
   * n'est jamais coupé. Idempotent, donc rappelable après l'apparition du clavier.
   */
  function scrollIntoView() {
    if (!shell?.isConnected) return;
    const scroller = document.getElementById('canvasScroll');
    if (!scroller) return;
    const vv = window.visualViewport;
    const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    const bar = keyboard + (document.body.classList.contains('editing') || document.body.classList.contains('editing-wide') ? 78 : 12);
    const rect = shell.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const margin = 14;
    const usableH = Math.max(120, view.height - bar);
    const centerY = view.top + usableH / 2;
    const centerX = view.left + view.width / 2;

    const contentLeft = scroller.scrollLeft + (rect.left - view.left);
    const contentTop = scroller.scrollTop + (rect.top - view.top);
    let left;
    if (rect.width <= view.width - margin * 2) {
      left = contentLeft + rect.width / 2 - view.width / 2;
    } else {
      left = contentLeft - margin;
    }
    const top = contentTop + rect.height / 2 - usableH / 2;
    const targetLeft = Math.max(0, left);
    const targetTop = Math.max(0, top);
    if (Math.abs(targetLeft - scroller.scrollLeft) < 2 && Math.abs(targetTop - scroller.scrollTop) < 2) return;
    // « auto » plutôt que « smooth » : les appels successifs (ouverture, puis
    // apparition du clavier) calculent depuis une position stable.
    scroller.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' });
  }

  /**
   * Place le curseur dans le bloc éditable.
   *
   * `offset` est l'index de caractère calculé à partir du point touché : le
   * curseur apparaît sous le doigt, ni au début ni à la fin de la ligne.
   * `word` étend la sélection au mot touché (appui long), avec les poignées
   * natives du navigateur.
   */
  function placeCaret({ selectAll = false, atEnd = true, offset = null, word = false } = {}) {
    if (!textEl) return { offset: 0, word: false };
    const value = readText() || '';
    const length = value.length;
    let target = Number.isFinite(offset) ? Math.min(length, Math.max(0, Math.round(offset))) : atEnd ? length : 0;
    let start = target;
    let end = target;
    if (word && length) [start, end] = wordBoundsAt(value, target);

    if (textEl.tagName === 'TEXTAREA') {
      if (selectAll) textEl.setSelectionRange(0, length);
      else textEl.setSelectionRange(start, end);
      lastCaret = start;
      return { offset: start, word: !!word && end > start };
    }

    const selection = window.getSelection();
    if (!selection) return { offset: 0, word: false };
    const range = document.createRange();
    const node = textEl.firstChild;
    if (selectAll && length) {
      range.selectNodeContents(textEl);
    } else if (node && node.nodeType === Node.TEXT_NODE) {
      if (word && length) {
        range.setStart(node, start);
        range.setEnd(node, end);
      } else {
        // Curseur dans le nœud texte : évite un décalage au début du bloc.
        range.setStart(node, target);
        range.collapse(true);
      }
    } else {
      range.selectNodeContents(textEl);
      range.collapse(atEnd);
    }
    if (!selectAll && !word) range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    lastCaret = start;
    requestAnimationFrame(keepCaretVisible);
    return { offset: target, word: !selectAll && word };
  }

  /* ─────────────────────────── Rafraîchissement ─────────────────────────── */

  /**
   * Sur Samsung Internet (et pendant une composition), on ne repositionne
   * jamais le bloc entre deux frappes : le rafraîchissement est différé et
   * groupé, sans toucher au contenu ni à la sélection.
   */
  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      if (!isOpen() || composing) return;
      applyStyle();
      position();
      keepCaretVisible();
    });
  }

  function refresh() {
    if (isSamsung || composing) {
      scheduleRefresh();
      return;
    }
    applyStyle();
    position();
  }

  /* ──────────────────────────── Cycle de vie ──────────────────────────── */

  function open(nextEdit, { isNew: fresh = false, caret = null } = {}) {
    if (!nextEdit) return;
    close();
    if (!shell) build();
    edit = nextEdit;
    isNew = fresh;
    guard.reset();
    composing = false;
    typedSinceOpen = false;
    lastCaret = null;
    lastLength = String(nextEdit.text || '').length;
    shell.classList.toggle('is-new', edit.kind === 'add');
    shell.dataset.samsung = isSamsung ? 'true' : 'false';
    writeText(edit.text || '');
    if (!overlay.contains(shell)) overlay.appendChild(shell);
    applyStyle();
    position();
    overlay.classList.add('has-inline-editor');

    const initial = edit.text || '';
    const hasCaret = caret && Number.isFinite(caret.offset);
    // Le curseur est posé après le focus (rAF), puis re-posé une fois à 50 ms :
    // certains navigateurs mobiles replacent le caret à 0 quand le clavier
    // s'ouvre, ce qui annulerait le point touché.
    requestAnimationFrame(() => {
      textEl.focus({ preventScroll: true });
      placeCaret(hasCaret ? { offset: caret.offset, word: !!caret.word } : { selectAll: false, atEnd: true });
      scrollIntoView();
    });
    setTimeout(() => {
      if (!shell?.isConnected) return;
      if (readText() !== initial) return; // l'utilisateur a déjà saisi
      if (!hasCaret) {
        if (surface === 'ta') return;
        const sel = window.getSelection();
        if (sel && sel.isCollapsed && sel.anchorOffset === 0) placeCaret({ atEnd: true });
        return;
      }
      const expected =
        surface === 'ta'
          ? caret.word
            ? wordBoundsAt(initial, caret.offset)[0]
            : Math.min(initial.length, caret.offset)
          : null;
      if (surface === 'ta') {
        const ok = caret.word
          ? textEl.selectionStart === expected
          : textEl.selectionStart === expected && textEl.selectionEnd === expected;
        if (!ok) placeCaret({ offset: caret.offset, word: !!caret.word });
        return;
      }
      const sel = window.getSelection();
      const node = textEl.firstChild;
      const correct =
        !!sel &&
        !!node &&
        node.nodeType === Node.TEXT_NODE &&
        (caret.word
          ? !sel.isCollapsed && sel.anchorNode === node && sel.anchorOffset === wordBoundsAt(initial, caret.offset)[0]
          : sel.isCollapsed && sel.anchorNode === node && sel.anchorOffset === Math.min(initial.length, caret.offset));
      if (!correct) placeCaret({ offset: caret.offset, word: !!caret.word });
    }, 50);
  }

  // Le curseur peut aussi bouger au clavier ou après un déplacement du doigt :
  // on ne réécrit jamais la sélection, on se contente de faire défiler.
  document.addEventListener('selectionchange', () => {
    if (!isOpen() || document.activeElement !== textEl) return;
    requestAnimationFrame(keepCaretVisible);
  });

  // Quand le clavier apparaît, on garde la ligne visible au-dessus de la barre.
  function onViewportResize() {
    if (!isOpen()) return;
    clearTimeout(onViewportResize._t);
    onViewportResize._t = setTimeout(() => scrollIntoView(), 120);
  }
  window.visualViewport?.addEventListener('resize', onViewportResize);

  function close() {
    if (shell) shell.remove();
    overlay.classList.remove('has-inline-editor');
    edit = null;
    isNew = false;
    dragState = null;
    composing = false;
    refreshQueued = false;
    typedSinceOpen = false;
    lastCaret = null;
    lastLength = 0;
    textEl = null;
    shell = null;
  }

  function sync() {
    if (edit) edit.text = normalizeInlineText(readText());
    return edit?.text;
  }

  /* ──────────────────────────── Glisser-déposer ──────────────────────────── */

  function startDrag(kind, ev) {
    if (!edit || edit.kind !== 'add') return;
    ev.preventDefault();
    ev.stopPropagation();
    const scale = getScale() || 1;
    dragState = {
      kind,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      bbox: { ...edit.bbox },
      baseline: edit.baseline ?? edit.bbox.y + edit.bbox.h * 0.76,
      scale,
    };
    (kind === 'move' ? moveHandle : resizeHandle).setPointerCapture?.(ev.pointerId);
    shell.classList.add('dragging');
  }

  function onDragMove(ev) {
    if (!dragState || !edit) return;
    if (ev.pointerId !== dragState.pointerId) return;
    ev.preventDefault();
    const dx = (ev.clientX - dragState.startX) / dragState.scale;
    const dy = (ev.clientY - dragState.startY) / dragState.scale;
    if (dragState.kind === 'move') {
      edit.bbox.x = dragState.bbox.x + dx;
      edit.bbox.y = dragState.bbox.y - dy;
      edit.baseline = dragState.baseline - dy;
    } else {
      edit.bbox.w = Math.max(30, dragState.bbox.w + dx);
    }
    position();
    onChange?.(edit);
  }

  function endDrag(ev) {
    if (!dragState) return;
    if (ev?.pointerId != null && ev.pointerId !== dragState.pointerId) return;
    dragState = null;
    shell?.classList.remove('dragging');
    if (edit) onChange?.(edit);
  }

  function isOpen() {
    return !!edit && !!shell?.isConnected;
  }

  return {
    open,
    close,
    sync,
    refresh,
    isOpen,
    caretOffset,
    get edit() {
      return edit;
    },
    /** « contenteditable », « textarea », ou null hors édition. */
    get surface() {
      if (!isOpen()) return null;
      return surface === 'ta' ? 'textarea' : 'contenteditable';
    },
  };
}

export { FONT_CHOICES };
