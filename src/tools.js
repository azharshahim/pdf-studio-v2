/**
 * Outils de document : pages (grille plein écran), OCR en un geste,
 * compression avec estimation, protection par filigrane et conversion.
 */

import { icon } from './icons.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

/* ─────────────────────────── Grille de pages ─────────────────────────── */

export function renderPagesGrid(container, { numPages, thumbFor, onSelect, onReorder }) {
  container.innerHTML = `
    <div class="pages-grid" id="pagesGrid"></div>
    <p class="muted xsmall pages-hint">${t('pagesGrid.hint')}</p>`;
  const grid = container.querySelector('#pagesGrid');

  const cards = [];
  for (let n = 1; n <= numPages; n++) {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.dataset.page = String(n);
    card.innerHTML = `
      <div class="page-thumb" data-thumb="${n}"></div>
      <span class="page-num">${n}</span>
      <button class="page-menu" data-page-menu="${n}" type="button" aria-label="${t('pagesGrid.actions')}">⋯</button>`;
    grid.appendChild(card);
    cards.push(card);
    thumbFor(n)
      .then((src) => {
        const holder = card.querySelector('.page-thumb');
        if (!holder || !src) return;
        holder.innerHTML = `<img src="${src}" alt="" draggable="false" />`;
      })
      .catch(() => {});
  }

  grid.addEventListener('click', (ev) => {
    const menu = ev.target.closest('[data-page-menu]');
    if (menu) {
      onSelect(Number(menu.dataset.pageMenu), true);
      return;
    }
    const card = ev.target.closest('.page-card');
    if (card) onSelect(Number(card.dataset.page), false);
  });

  // Réorganisation par glisser-déposer (pointeur, tactile inclus)
  let dragCard = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  grid.addEventListener('pointerdown', (ev) => {
    const card = ev.target.closest('.page-card');
    if (!card || ev.target.closest('.page-menu')) return;
    dragCard = card;
    startX = ev.clientX;
    startY = ev.clientY;
    dragging = false;
  });
  grid.addEventListener('pointermove', (ev) => {
    if (!dragCard) return;
    if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) {
      dragging = true;
      dragCard.classList.add('dragging');
    }
    if (!dragging) return;
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.page-card');
    if (target && target !== dragCard) {
      const rect = target.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      grid.insertBefore(dragCard, after ? target.nextSibling : target);
    }
  });
  const finish = () => {
    if (!dragCard) return;
    dragCard.classList.remove('dragging');
    if (dragging) {
      const order = [...grid.querySelectorAll('.page-card')].map((c) => Number(c.dataset.page));
      onReorder(order);
    }
    dragCard = null;
    dragging = false;
  };
  grid.addEventListener('pointerup', finish);
  grid.addEventListener('pointercancel', finish);
  return grid;
}

/* ─────────────────────────── Compression ─────────────────────────── */

export const COMPRESS_LEVELS = [
  { id: 'light', label: 'compress.light', scale: 1.4, quality: 0.85 },
  { id: 'balanced', label: 'compress.balanced', scale: 1.1, quality: 0.7 },
  { id: 'strong', label: 'compress.strong', scale: 0.8, quality: 0.55 },
];

/** Estimation rapide : rastérise la page 1 et extrapole sur tout le document. */
export async function estimateCompression(engine, level, numPages) {
  const canvas = document.createElement('canvas');
  await engine.renderToCanvas(1, canvas, level.scale);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', level.quality));
  const perPage = blob?.size || 0;
  return Math.round(perPage * numPages * 0.92);
}

/* ─────────────────────────── Filigrane ─────────────────────────── */

export const WATERMARK_PRESETS = ['CONFIDENTIEL', 'BROUILLON', 'COPIE', 'SPÉCIMEN'];

/* ─────────────────────────── Aides UI ─────────────────────────── */

export function toolHeader(iconName, title, description) {
  return `<div class="tool-head">
    <span class="tool-head-icon">${icon(iconName, 20)}</span>
    <div><strong>${title}</strong><span>${description}</span></div>
  </div>`;
}

export function progressMarkup(label) {
  return `<div class="tool-progress">
    <div class="progress-track"><div class="progress-fill" data-progress></div></div>
    <span class="muted small" data-progress-label>${label}</span>
  </div>`;
}
