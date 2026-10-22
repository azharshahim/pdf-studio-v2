/**
 * Calque d'objets graphiques posés sur la page : annotations, signatures,
 * tampons, images et cases à cocher. Les objets sont stockés en coordonnées
 * PDF (origine en bas à gauche) et rendus en DOM au-dessus du canvas, ce qui
 * garantit un aperçu fidèle à l'export.
 */

import { icon } from './icons.js';
import { uiLocale } from './i18n.js';

let seq = 0;
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const HIGHLIGHT_COLORS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4'];

export function clampRect(rect) {
  const w = Math.max(2, Math.abs(rect.w));
  const h = Math.max(2, Math.abs(rect.h));
  return {
    x: Math.min(rect.x, rect.x + rect.w),
    y: Math.min(rect.y, rect.y + rect.h),
    w,
    h,
  };
}

export function createMarkup({
  overlay,
  getScale = () => 1,
  rectFor,
  pageHeight = () => 842,
  getPage = () => 1,
  onChange = () => {},
  onPickNote = () => {},
  onStaticRender = null,
} = {}) {
  const state = {
    objects: [],
    tool: null,
    color: HIGHLIGHT_COLORS[0],
    inkColor: '#e11d48',
    inkWidth: 2.5,
    selected: null,
    draft: null,
  };
  let svgLayer = null;
  let draftEl = null;

  function ensureSvg() {
    if (svgLayer && svgLayer.isConnected) return svgLayer;
    svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgLayer.setAttribute('class', 'markup-ink');
    overlay.appendChild(svgLayer);
    return svgLayer;
  }

  function removeSvgIfEmpty() {
    if (svgLayer && !svgLayer.childElementCount) svgLayer.remove();
  }

  function pageObjects(page = getPage()) {
    return state.objects.filter((o) => o.page === page);
  }

  /* ─────────────────────────── Rendu DOM ─────────────────────────── */

  function render() {
    if (overlay?.dataset?.staticMode === '1') {
      onStaticRender?.();
      return;
    }
    overlay.querySelectorAll('.mk').forEach((n) => n.remove());
    const page = getPage();
    const scale = getScale() || 1;
    const list = pageObjects(page);
    const ink = list.filter((o) => o.type === 'ink');
    if (ink.length) {
      const svg = ensureSvg();
      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 ${overlay.clientWidth} ${overlay.clientHeight}`);
      for (const o of ink) {
        const d = inkPath(o, rectFor);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', o.color);
        path.setAttribute('stroke-width', String(Math.max(1, o.width * scale)));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.dataset.inkId = o.id;
        path.dataset.mkId = o.id;
        svg.appendChild(path);
      }
    } else {
      svgLayer?.remove();
      svgLayer = null;
    }

    for (const o of list) {
      if (o.type === 'ink') continue;
      const node = nodeFor(o, scale);
      if (node) {
        node.dataset.mkId = o.id;
        overlay.appendChild(node);
      }
    }
  }

  let selectedId = null;
  let handleEl = null;

  function select(id) {
    selectedId = id;
    render();
  }

  function clearSelection() {
    selectedId = null;
    render();
  }

  function selected() {
    return state.objects.find((o) => o.id === selectedId) || null;
  }

  function nodeFor(o, scale, { rectForFn = rectFor, interactive = true } = {}) {
    const r = rectForFn(o.bbox);
    if (!r || r.width <= 0 || r.height <= 0) return null;
    const el = document.createElement('div');
    el.className = `mk mk-${o.type}`;
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
    if (o.rotation) el.style.transform = `rotate(${o.rotation}deg)`;
    if (o.opacity != null) el.style.opacity = String(o.opacity);
    if (o.type === 'highlight') {
      el.style.background = o.color;
    } else if (o.type === 'underline') {
      el.style.borderBottom = `${Math.max(1, r.height * 0.14)}px solid ${o.color}`;
    } else if (o.type === 'strike') {
      el.style.setProperty('--mk-color', o.color);
      el.innerHTML = '<span class="mk-strike-line"></span>';
    } else if (o.type === 'rect' || o.type === 'ellipse') {
      el.classList.add(o.type === 'ellipse' ? 'mk-round' : 'mk-square');
      el.style.border = `${Math.max(1, (o.width || 2) * scale)}px solid ${o.color}`;
    } else if (o.type === 'arrow') {
      el.innerHTML = arrowSvg(o.color);
    } else if (o.type === 'note') {
      el.classList.add('mk-note');
      el.style.background = o.color || '#fde047';
      el.innerHTML = '<span class="mk-note-dot"></span>';
      el.title = o.text || '';
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onPickNote(o);
      });
    } else if (o.type === 'image' || o.type === 'signature' || o.type === 'photo') {
      const img = document.createElement('img');
      img.src = o.src;
      img.alt = o.label || '';
      img.draggable = false;
      el.appendChild(img);
    } else if (o.type === 'stamp') {
      // Le texte du tampon suit la taille réelle (points PDF × échelle) : ce que
      // l'on voit à l'écran est exactement ce qui sera dessiné dans le PDF.
      const fs = Math.max(6, (o.fontSize || 18) * scale);
      el.innerHTML = `<span class="stamp-text" style="color:${o.color};border-color:${
        o.borderColor || o.color
      };font-size:${fs}px;border-width:${Math.max(1, fs * 0.09)}px;border-radius:${Math.max(
        2,
        fs * 0.28,
      )}px;padding:${Math.max(1, fs * 0.14)}px ${Math.max(2, fs * 0.36)}px">${o.text || ''}</span>`;
    } else if (o.type === 'check') {
      el.innerHTML =
        o.mark === 'cross'
          ? `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${o.color}" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`
          : `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${o.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5L20 6.5"/></svg>`;
    } else if (o.type === 'date') {
      el.className = 'mk mk-date';
      el.style.color = o.color;
      el.style.fontSize = `${Math.max(6, (o.fontSize || 12) * scale)}px`;
      el.textContent = o.text || new Date().toLocaleDateString(uiLocale());
    }
    if (!interactive) return el;
    if (o.id === selectedId) {
      el.classList.add('selected');
      el.appendChild(selectionHandles(o, scale));
      if (o.type !== 'note') {
        el.style.pointerEvents = 'auto';
        el.style.touchAction = 'none';
        el.style.cursor = 'grab';
        el.addEventListener('pointerdown', (ev) => onObjectDown(o, ev));
      }
    } else if (!state.tool) {
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        select(o.id);
      });
    }
    return el;
  }

  /** Rendu statique des objets d'une page dans un calque de lecture continue. */
  function renderStaticPage(targetOverlay, { page, scale = 1, rectFor: customRectFor = rectFor } = {}) {
    if (!targetOverlay) return;
    targetOverlay.querySelectorAll('.mk, .markup-ink').forEach((n) => n.remove());
    const list = pageObjects(page);
    if (!list.length) return;
    const ink = list.filter((o) => o.type === 'ink');
    if (ink.length) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'markup-ink');
      const w = targetOverlay.clientWidth || parseFloat(targetOverlay.parentElement?.style.width) || 1;
      const h = targetOverlay.clientHeight || parseFloat(targetOverlay.parentElement?.style.height) || 1;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      for (const o of ink) {
        const d = inkPath(o, customRectFor);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', o.color);
        path.setAttribute('stroke-width', String(Math.max(1, o.width * scale)));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.dataset.inkId = o.id;
        path.dataset.mkId = o.id;
        svg.appendChild(path);
      }
      targetOverlay.appendChild(svg);
    }
    for (const o of list) {
      if (o.type === 'ink') continue;
      const node = nodeFor(o, scale, { rectForFn: customRectFor, interactive: false });
      if (node) {
        node.dataset.mkId = o.id;
        targetOverlay.appendChild(node);
      }
    }
  }

  /** Types dont les proportions sont verrouillées (image, signature, texte). */
  const RATIO_LOCKED = new Set(['image', 'signature', 'photo', 'check', 'stamp', 'date']);
  const SCALES_FONT = new Set(['stamp', 'date']);
  const MIN_SIDE = 12;

  /**
   * Nouvelle taille après glisser du coin bas-droit de (dx, dyDown) points PDF.
   * Images, signatures, tampons et textes gardent leurs proportions ; le texte
   * (tampon, date) change aussi de corps pour que ce qui est dessiné grandisse.
   */
  function resizePatch(o, box, fontSize, dx, dyDown) {
    if (RATIO_LOCKED.has(o.type)) {
      const minS = MIN_SIDE / Math.max(1, Math.min(box.w, box.h));
      const s = Math.min(8, Math.max(minS, 1 + (dx / box.w + dyDown / box.h) / 2));
      return scalePatch(o, box, fontSize, s, { x: box.x, y: box.y + box.h });
    }
    const w = Math.max(MIN_SIDE, box.w + dx);
    const h = Math.max(MIN_SIDE, box.h + dyDown);
    return { bbox: { ...box, w, h, y: box.y + box.h - h } };
  }

  /** Met `box` à l'échelle `s` autour de `anchor` (point fixe en coordonnées PDF). */
  function scalePatch(o, box, fontSize, s, anchor) {
    const w = box.w * s;
    const h = box.h * s;
    const patch = {
      bbox: {
        ...box,
        w,
        h,
        x: anchor.x - (anchor.x - box.x) * s,
        y: anchor.y - (anchor.y - box.y) * s,
      },
    };
    if (SCALES_FONT.has(o.type) && fontSize) patch.fontSize = Math.max(4, fontSize * s);
    return patch;
  }

  /* ───── Geste direct sur l'objet sélectionné : 1 doigt = déplacer, 2 doigts = agrandir ───── */

  const touches = new Map();
  let gesture = null;
  let gestureBound = false;

  const centroid = () => {
    let x = 0;
    let y = 0;
    for (const p of touches.values()) {
      x += p.x;
      y += p.y;
    }
    return { x: x / touches.size, y: y / touches.size };
  };
  const spread = () => {
    const pts = [...touches.values()];
    return pts.length < 2 ? 0 : Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };
  const rebase = (o) => {
    gesture = { id: o.id, box: { ...o.bbox }, fontSize: o.fontSize, start: centroid(), dist: spread() };
  };

  function onGestureMove(e) {
    if (!gesture || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const o = state.objects.find((x) => x.id === gesture.id);
    if (!o) return;
    const sc = getScale() || 1;
    const c = centroid();
    const dx = (c.x - gesture.start.x) / sc;
    const dy = -(c.y - gesture.start.y) / sc;
    const { box } = gesture;
    if (touches.size >= 2 && gesture.dist > 0) {
      const s = Math.min(8, Math.max(0.15, spread() / gesture.dist));
      const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      const patch = scalePatch(o, box, gesture.fontSize, s, center);
      patch.bbox = { ...patch.bbox, x: patch.bbox.x + dx, y: patch.bbox.y + dy };
      update(o.id, patch);
    } else {
      update(o.id, { bbox: { ...box, x: box.x + dx, y: box.y + dy } });
    }
  }

  function onGestureEnd(e) {
    touches.delete(e.pointerId);
    if (!touches.size) {
      window.removeEventListener('pointermove', onGestureMove);
      window.removeEventListener('pointerup', onGestureEnd);
      window.removeEventListener('pointercancel', onGestureEnd);
      gestureBound = false;
      gesture = null;
      return;
    }
    const o = gesture && state.objects.find((x) => x.id === gesture.id);
    if (o) rebase(o);
  }

  function onObjectDown(o, ev) {
    if (ev.target.closest('[data-mk-handle]')) return;
    ev.preventDefault();
    ev.stopPropagation();
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const current = state.objects.find((x) => x.id === o.id) || o;
    rebase(current);
    if (!gestureBound) {
      gestureBound = true;
      window.addEventListener('pointermove', onGestureMove);
      window.addEventListener('pointerup', onGestureEnd);
      window.addEventListener('pointercancel', onGestureEnd);
    }
  }

  /** Poignées de déplacement / redimensionnement / rotation. */
  function selectionHandles(o, scale) {
    handleEl = document.createElement('div');
    handleEl.className = 'mk-handles';
    handleEl.innerHTML = `
      <button class="mk-handle move" data-mk-handle="move" type="button" aria-label="Déplacer">✥</button>
      <button class="mk-handle resize" data-mk-handle="resize" type="button" aria-label="Redimensionner">⤡</button>
      <button class="mk-handle rotate" data-mk-handle="rotate" type="button" aria-label="Pivoter">⟳</button>
      <button class="mk-handle del" data-mk-handle="delete" type="button" aria-label="Supprimer">✕</button>`;
    handleEl.addEventListener('pointerdown', (ev) => {
      const kind = ev.target.closest('[data-mk-handle]')?.dataset.mkHandle;
      if (!kind) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (kind === 'delete') {
        remove(o.id);
        selectedId = null;
        return;
      }
      const start = { x: ev.clientX, y: ev.clientY };
      const box = { ...o.bbox };
      const startRotation = o.rotation || 0;
      const move = (e) => {
        const scaleNow = getScale() || 1;
        const dx = (e.clientX - start.x) / scaleNow;
        const dy = -(e.clientY - start.y) / scaleNow;
        if (kind === 'move') {
          update(o.id, { bbox: { ...box, x: box.x + dx, y: box.y + dy } });
        } else if (kind === 'resize') {
          // Coin bas-droit : glisser vers le bas / la droite agrandit, le coin
          // haut-gauche reste en place. dy est orienté vers le haut (PDF).
          update(o.id, resizePatch(o, box, o.fontSize, dx, -dy));
        } else if (kind === 'rotate') {
          update(o.id, { rotation: Math.round(startRotation + (e.clientX - start.x) * 0.6) });
        }
      };
      const up = (e) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        // Geste interrompu (défilement, geste système) : retour à l'état initial.
        if (e?.type === 'pointercancel') update(o.id, { bbox: box, rotation: startRotation });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
    return handleEl;
  }

  /* ───────────────────── Conversions de coordonnées ───────────────────── */

  /** Point CSS (relatif à l'overlay) → point PDF. */
  function toPdf(cssX, cssY) {
    const vp = overlay.__viewport;
    if (vp?.convertToPdfPoint) {
      const [x, y] = vp.convertToPdfPoint(cssX, cssY);
      return { x, y };
    }
    const scale = getScale() || 1;
    return { x: cssX / scale, y: pageHeight() - cssY / scale };
  }

  /** Rect CSS → bbox PDF (y = bas). */
  function toPdfRect(cssRect) {
    const a = toPdf(cssRect.left, cssRect.top + cssRect.height);
    const b = toPdf(cssRect.left + cssRect.width, cssRect.top);
    return clampRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
  }

  function localPoint(ev) {
    const box = overlay.getBoundingClientRect();
    return { x: ev.clientX - box.left, y: ev.clientY - box.top };
  }

  /* ─────────────────────────── Outils ─────────────────────────── */

  const RECT_TOOLS = new Set(['highlight', 'underline', 'strike', 'rect', 'ellipse', 'arrow']);

  function setTool(tool) {
    state.tool = tool;
    overlay.classList.toggle('tool-active', !!tool);
    overlay.classList.toggle('tool-eraser', tool === 'eraser');
    if (draftEl) {
      draftEl.remove();
      draftEl = null;
    }
    state.draft = null;
  }

  function setColor(color) {
    state.color = color;
  }

  function add(obj) {
    const item = { id: uid(obj.type || 'mk'), page: getPage(), ...obj };
    state.objects.push(item);
    render();
    onChange(state.objects, item);
    return item;
  }

  function remove(id) {
    const i = state.objects.findIndex((o) => o.id === id);
    if (i < 0) return;
    state.objects.splice(i, 1);
    render();
    onChange(state.objects, null);
  }

  function clearPage() {
    const page = getPage();
    state.objects = state.objects.filter((o) => o.page !== page);
    render();
    onChange(state.objects, null);
  }

  function setObjects(list) {
    state.objects = Array.isArray(list) ? list : [];
    render();
  }

  function update(id, patch) {
    const obj = state.objects.find((o) => o.id === id);
    if (!obj) return;
    Object.assign(obj, patch);
    render();
    onChange(state.objects, obj);
  }

  /* ───────────────────────── Interactions ─────────────────────────── */

  function onPointerDown(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    const tool = state.tool;
    if (!tool) {
      if (selectedId && !ev.target.closest('.mk')) clearSelection();
      return;
    }
    const target = ev.target.closest('[data-mk-id]');
    if (tool === 'eraser') {
      if (target) {
        ev.preventDefault();
        ev.stopPropagation();
        remove(target.dataset.mkId);
      }
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const start = localPoint(ev);

    if (tool === 'note') {
      add({
        type: 'note',
        bbox: toPdfRect({ left: start.x - 9, top: start.y - 9, width: 18, height: 18 }),
        color: state.color,
        text: '',
      });
      setTool(null);
      onPickNote(state.objects[state.objects.length - 1]);
      return;
    }

    if (tool === 'ink') {
      const points = [start];
      const obj = { type: 'ink', points: [], color: state.inkColor, width: state.inkWidth };
      const pid = ev.pointerId;
      const move = (e) => {
        if (e.pointerId !== pid) return;
        points.push(localPoint(e));
        obj.points = points.map((p) => toPdf(p.x, p.y));
        drawInkDraft(obj);
      };
      const up = (e) => {
        if (e && e.pointerId !== undefined && e.pointerId !== pid) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        draftEl?.remove();
        draftEl = null;
        if (e?.type === 'pointercancel') return;
        if (points.length > 1) {
          add({ type: 'ink', points: obj.points, color: obj.color, width: obj.width });
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      return;
    }

    if (RECT_TOOLS.has(tool)) {
      const rect = { left: start.x, top: start.y, width: 0, height: 0 };
      draftEl = document.createElement('div');
      draftEl.className = 'mk mk-draft';
      draftEl.style.background = tool === 'highlight' ? state.color : 'transparent';
      draftEl.style.border =
        tool === 'rect' || tool === 'ellipse' || tool === 'arrow' ? `2px dashed ${state.color}` : 'none';
      if (tool === 'underline') draftEl.style.borderBottom = `3px solid ${state.color}`;
      overlay.appendChild(draftEl);
      const pid = ev.pointerId;
      const move = (e) => {
        if (e.pointerId !== pid) return;
        const p = localPoint(e);
        rect.left = Math.min(start.x, p.x);
        rect.top = Math.min(start.y, p.y);
        rect.width = Math.abs(p.x - start.x);
        rect.height = Math.abs(p.y - start.y);
        Object.assign(draftEl.style, {
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
      };
      const up = (e) => {
        if (e && e.pointerId !== undefined && e.pointerId !== pid) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        draftEl?.remove();
        draftEl = null;
        if (e?.type === 'pointercancel') return;
        if (rect.width < 8 || rect.height < 6) {
          // Un simple toucher pose une marque standard.
          const fallback =
            tool === 'underline' || tool === 'strike'
              ? { left: start.x - 40, top: start.y - 4, width: 80, height: 10 }
              : { left: start.x - 30, top: start.y - 10, width: 60, height: 20 };
          Object.assign(rect, fallback);
        }
        if (tool === 'underline' || tool === 'strike') rect.height = Math.max(6, rect.height);
        add({ type: tool, bbox: toPdfRect(rect), color: state.color, width: state.inkWidth });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
  }

  function drawInkDraft(obj) {
    const svg = ensureSvg();
    if (!draftEl) {
      draftEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      draftEl.setAttribute('fill', 'none');
      draftEl.setAttribute('stroke', obj.color);
      draftEl.setAttribute('stroke-width', String(Math.max(1, obj.width * (getScale() || 1))));
      draftEl.setAttribute('stroke-linecap', 'round');
      draftEl.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(draftEl);
    }
    draftEl.setAttribute('d', inkPath(obj, rectFor));
  }

  overlay.addEventListener('pointerdown', onPointerDown, { capture: true });

  return {
    render,
    renderStaticPage,
    select,
    clearSelection,
    get selectedId() {
      return selectedId;
    },
    setTool,
    setColor,
    setInk({ color, width }) {
      if (color) state.inkColor = color;
      if (width) state.inkWidth = width;
    },
    add,
    remove,
    update,
    clearPage,
    setObjects,
    get objects() {
      return state.objects;
    },
    get tool() {
      return state.tool;
    },
    toPdfRect,
    toPdf,
    attachViewport(vp) {
      overlay.__viewport = vp;
    },
  };
}

/* ─────────────────────────── Helpers de dessin ─────────────────────────── */

/** Chemin SVG (coordonnées CSS) d'un tracé libre stocké en points PDF. */
export function inkPath(obj, rectFor) {
  const pts = obj.points || [];
  if (!pts.length) return '';
  return pts
    .map((p, i) => {
      const r = rectFor({ x: p.x, y: p.y, w: 0, h: 0 });
      return `${i === 0 ? 'M' : 'L'}${r.left.toFixed(1)} ${r.top.toFixed(1)}`;
    })
    .join(' ');
}

export function arrowSvg(color) {
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"><path d="M2 98 98 2"/><path d="M70 2h28v28"/></svg>`;
}

/** Tampons prédéfinis (texte + couleur). */
export const STAMP_PRESETS = [
  { id: 'approved', text: 'APPROUVÉ', color: '#059669' },
  { id: 'rejected', text: 'REFUSÉ', color: '#dc2626' },
  { id: 'received', text: 'REÇU', color: '#2563eb' },
  { id: 'paid', text: 'PAYÉ', color: '#7c3aed' },
  { id: 'draft', text: 'BROUILLON', color: '#64748b' },
  { id: 'confidential', text: 'CONFIDENTIEL', color: '#b91c1c' },
  { id: 'copy', text: 'COPIE CONFORME', color: '#0f766e' },
  { id: 'original', text: 'ORIGINAL', color: '#1d4ed8' },
  { id: 'urgent', text: 'URGENT', color: '#ea580c' },
];

/** Petites icônes utilisées par les barres d'outils. */
export const toolIcon = (name) => icon(name, 18);
