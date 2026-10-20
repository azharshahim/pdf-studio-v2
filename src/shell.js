/* Navigation par écrans (Accueil / Fichiers / Outils / Document) et feuilles du bas. */
import { icon } from './icons.js';
import { t } from './i18n.js';

export const TOOLS = [
  { id: 'edit', icon: 'edit', color: 'indigo', title: 'tool.edit', desc: 'tool.editDesc' },
  { id: 'annotate', icon: 'highlight', color: 'amber', title: 'tool.annotate', desc: 'tool.annotateDesc' },
  { id: 'sign', icon: 'signature', color: 'teal', title: 'tool.sign', desc: 'tool.signDesc' },
  { id: 'form', icon: 'checkSquare', color: 'sky', title: 'tool.form', desc: 'tool.formDesc' },
  { id: 'stamp', icon: 'stamp', color: 'rose', title: 'tool.stamp', desc: 'tool.stampDesc' },
  { id: 'pages', icon: 'layers', color: 'violet', title: 'tool.pages', desc: 'tool.pagesDesc' },
  { id: 'ocr', icon: 'scan', color: 'sky', title: 'tool.ocr', desc: 'tool.ocrDesc' },
  { id: 'compress', icon: 'compress', color: 'slate', title: 'tool.compress', desc: 'tool.compressDesc' },
  { id: 'convert', icon: 'convert', color: 'emerald', title: 'tool.convert', desc: 'tool.convertDesc' },
  { id: 'protect', icon: 'lock', color: 'orange', title: 'tool.protect', desc: 'tool.protectDesc' },
];

const ROUTES = ['home', 'files', 'tools', 'doc'];
let handlers = { onRoute: null, onTool: null };
let currentRoute = 'home';
let sheet = null; // { node, parent, next, onClose }

const $ = (id) => document.getElementById(id);

export function isMobile() {
  return window.matchMedia('(max-width: 900px)').matches;
}

export function routeTo(name, detail = {}) {
  if (!ROUTES.includes(name)) name = 'home';
  currentRoute = name;
  document.body.dataset.route = name;
  for (const r of ['home', 'files', 'tools']) {
    const el = $(`screen${r[0].toUpperCase()}${r.slice(1)}`);
    if (el) el.hidden = r !== name;
  }
  const doc = $('docView');
  if (doc) doc.hidden = name !== 'doc';
  document.querySelectorAll('.tabitem').forEach((b) => {
    const active = b.dataset.route === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.body.classList.toggle('on-screen', name !== 'doc');
  handlers.onRoute?.(name, detail);
}

export function openSheet({ title, node, html, size = 'auto', onClose, className = '' } = {}) {
  closeSheet({ silent: true });
  const section = $('sheet');
  const body = $('sheetBody');
  if (!section || !body) return null;
  $('sheetTitle').textContent = title || '';
  body.innerHTML = '';
  body.className = `sheet-body ${className}`.trim();
  if (node) {
    sheet = { node, parent: node.parentNode, next: node.nextSibling, onClose };
    node.classList.add('in-sheet');
    body.appendChild(node);
  } else if (html) {
    body.innerHTML = html;
    sheet = { node: null, onClose };
  } else {
    sheet = { node: null, onClose };
  }
  section.dataset.size = size;
  $('sheetBackdrop').hidden = false;
  section.hidden = false;
  requestAnimationFrame(() => {
    section.classList.add('open');
    $('sheetBackdrop').classList.add('open');
  });
  document.body.classList.add('sheet-open');
  return body;
}

export function closeSheet({ silent = false } = {}) {
  const section = $('sheet');
  if (!section || section.hidden) return;
  if (sheet?.node && sheet.parent) {
    sheet.node.classList.remove('in-sheet');
    if (sheet.next && sheet.next.parentNode === sheet.parent) {
      sheet.parent.insertBefore(sheet.node, sheet.next);
    } else {
      sheet.parent.appendChild(sheet.node);
    }
  }
  if (!silent) sheet?.onClose?.();
  sheet = null;
  section.classList.remove('open');
  $('sheetBackdrop').classList.remove('open');
  document.body.classList.remove('sheet-open');
  const body = $('sheetBody');
  setTimeout(() => {
    if (!document.body.classList.contains('sheet-open')) {
      section.hidden = true;
      $('sheetBackdrop').hidden = true;
      if (body) body.innerHTML = '';
    }
  }, 220);
}

export function isSheetOpen() {
  const section = $('sheet');
  return !!section && !section.hidden;
}

export function getRoute() {
  return currentRoute;
}

function toolCard(tool, compact = false) {
  return `<button class="tool-card ${compact ? 'compact' : ''}" data-tool="${tool.id}" type="button">
    <span class="tool-icon ${tool.color}">${icon(tool.icon, compact ? 20 : 22)}</span>
    <span class="tool-text">
      <strong>${t(tool.title)}</strong>
      <span>${t(tool.desc)}</span>
    </span>
  </button>`;
}

export function renderTools() {
  const full = $('toolsGrid');
  if (full) full.innerHTML = TOOLS.map((tool) => toolCard(tool)).join('');
  const quick = $('homeTools');
  if (quick) quick.innerHTML = TOOLS.slice(0, 4).map((tool) => toolCard(tool, true)).join('');
}

export function initShell(options = {}) {
  handlers = { ...handlers, ...options };
  document.querySelectorAll('.tabitem').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.route;
      routeTo(currentRoute === target ? 'home' : target);
    });
  });
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => routeTo(btn.dataset.goto));
  });
  document.addEventListener('click', (ev) => {
    const tool = ev.target.closest('[data-tool]');
    if (tool) handlers.onTool?.(tool.dataset.tool);
  });
  $('sheetClose')?.addEventListener('click', () => closeSheet());
  $('sheetBackdrop')?.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && isSheetOpen()) {
      ev.preventDefault();
      closeSheet();
    }
  });
  renderTools();
  routeTo(document.body.classList.contains('no-doc') ? 'home' : 'doc');
}
