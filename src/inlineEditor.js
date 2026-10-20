/**
 * Édition directe sur la page : un bloc contentEditable est superposé à la
 * ligne du PDF, à la même position et avec le même rendu (police, taille,
 * couleur, fond échantillonné). Aucun panneau latéral n'est nécessaire.
 *
 * Le module ne connaît ni pdf.js ni pdf-lib : il reçoit la conversion
 * bbox PDF → rectangle CSS et signale les changements à l'application, qui
 * conserve la logique d'historique, d'export et de sauvegarde.
 */

import * as U from './utils.js';

/** Familles CSS correspondant aux polices proposées à l'édition. */
export function cssFontFamilyFor(font) {
  if (font === 'Times') return '"Times New Roman", Times, serif';
  if (font === 'Courier') return '"Courier New", Courier, monospace';
  if (font === 'Noto Sans') {
    return '"Noto Sans", "Noto Naskh Arabic", "Segoe UI", system-ui, sans-serif';
  }
  return 'Helvetica, Arial, sans-serif';
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
  let edit = null;
  let isNew = false;
  let moveHandle = null;
  let resizeHandle = null;
  let dragState = null;

  function build() {
    shell = document.createElement('div');
    shell.className = 'inline-shell';

    textEl = document.createElement('div');
    textEl.className = 'inline-text';
    try {
      textEl.contentEditable = 'plaintext-only';
    } catch {
      /* navigateur ancien */
    }
    if (textEl.contentEditable !== 'plaintext-only') textEl.contentEditable = 'true';
    textEl.spellcheck = false;
    textEl.setAttribute('role', 'textbox');
    textEl.setAttribute('aria-multiline', 'true');
    textEl.dataset.placeholder = 'Saisissez le texte…';

    textEl.addEventListener('input', () => {
      if (!edit) return;
      edit.text = normalizeInlineText(textEl.innerText);
      onChange?.(edit);
    });

    textEl.addEventListener('paste', (ev) => {
      ev.preventDefault();
      const raw = (ev.clipboardData || window.clipboardData)?.getData('text/plain') || '';
      const clean = normalizeInlineText(raw);
      if (clean) document.execCommand('insertText', false, clean);
    });

    textEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onCommit?.('escape');
        return;
      }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        onCommit?.('shortcut');
      }
    });

    textEl.addEventListener('focus', () => {
      // Sur mobile, le clavier met quelques centaines de ms à apparaître.
      setTimeout(() => scrollIntoView(), 280);
    });

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

  function applyStyle() {
    if (!edit || !shell) return;
    const scale = getScale() || 1;
    const sizePx = Math.max(4, (Number(edit.size) || 12) * scale);
    shell.style.fontFamily = cssFontFamilyFor(edit.font);
    shell.style.fontSize = `${sizePx}px`;
    shell.style.lineHeight = String(edit.lineHeight || 1.16);
    shell.style.fontWeight = edit.bold ? '700' : '400';
    shell.style.fontStyle = edit.italic ? 'italic' : 'normal';
    shell.style.textDecoration = edit.underline ? 'underline' : 'none';
    shell.style.textDecorationThickness = edit.underline ? `${Math.max(1, sizePx * 0.06)}px` : '';
    shell.style.color = edit.color || '#111827';
    shell.style.textAlign = edit.align || 'left';
    const bg = edit.bg && edit.bg !== 'none' ? edit.bg : 'transparent';
    shell.style.setProperty('--inline-bg', edit.kind === 'add' ? 'transparent' : bg);
    shell.classList.toggle('is-new', edit.kind === 'add');
    moveHandle.hidden = edit.kind !== 'add';
    resizeHandle.hidden = edit.kind !== 'add';
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
    const bound = Math.max(base, (overlay.clientWidth || base) - left - 2);
    shell.style.width = `${Math.min(Math.max(base, needed), bound)}px`;
    shell.style.minHeight = `${Math.max(4, rect.height + padY * 2)}px`;
    shell.style.padding = `${padY}px ${padX}px`;
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
    const bar = keyboard + (document.body.classList.contains('editing') ? 78 : 12);
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

  function placeCaret({ selectAll = false, atEnd = true } = {}) {
    if (!textEl) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const node = textEl.firstChild;
    if (selectAll && textEl.textContent?.length) {
      range.selectNodeContents(textEl);
    } else if (node && node.nodeType === Node.TEXT_NODE) {
      // Curseur dans le nœud texte : évite un décalage au début du bloc.
      range.setStart(node, atEnd ? node.textContent.length : 0);
    } else {
      range.selectNodeContents(textEl);
      range.collapse(atEnd);
    }
    if (!selectAll) range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }


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

  function open(nextEdit, { isNew: fresh = false } = {}) {
    if (!nextEdit) return;
    close();
    if (!shell) build();
    edit = nextEdit;
    isNew = fresh;
    shell.classList.toggle('is-new', edit.kind === 'add');
    textEl.textContent = edit.text || '';
    if (!overlay.contains(shell)) overlay.appendChild(shell);
    applyStyle();
    position();
    overlay.classList.add('has-inline-editor');

    const initial = edit.text || '';
    requestAnimationFrame(() => {
      textEl.focus({ preventScroll: true });
      placeCaret({ selectAll: false, atEnd: true });
      scrollIntoView();
    });
    // Certains navigateurs replacent le curseur au début juste après le focus.
    setTimeout(() => {
      if (!shell?.isConnected) return;
      if (textEl.textContent !== initial) return; // l'utilisateur a déjà saisi
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.anchorOffset === 0) {
        placeCaret({ atEnd: true });
      }
    }, 80);
  }

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
  }

  function sync() {
    if (edit && textEl) {
      edit.text = normalizeInlineText(textEl.innerText);
    }
    return edit?.text;
  }

  function refresh() {
    applyStyle();
    position();
  }

  function isOpen() {
    return !!edit && !!shell?.isConnected;
  }

  return { open, close, sync, refresh, isOpen, get edit() { return edit; } };
}

export { FONT_CHOICES };
