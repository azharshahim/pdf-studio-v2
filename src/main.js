import './polyfills.js';
import './style.css';
import { PdfEngine, pdfRectToViewportRect, fontTraits } from './pdfEngine.js';
import { recognizeCanvas, terminateOcr } from './ocrEngine.js';
import { exportPdf, analyzeExport } from './exporter.js';
import { buildSampleTextPdf, buildSampleScanPdf } from './samples.js';
import { icon, hydrateIcons } from './icons.js';
import * as U from './utils.js';

const $ = (id) => document.getElementById(id);
const els = {
  fileChip: $('fileChip'),
  fileName: $('fileName'),
  fileMeta: $('fileMeta'),
  btnSearch: $('btnSearch'),
  btnOpen: $('btnOpen'),
  btnExport: $('btnExport'),
  exportMenu: $('exportMenu'),
  exportClose: $('exportClose'),
  expEdits: $('expEdits'),
  expOcr: $('expOcr'),
  expEditsCount: $('expEditsCount'),
  expRedact: $('expRedact'),
  glyphDialog: $('glyphDialog'),
  glyphText: $('glyphText'),
  glyphCancel: $('glyphCancel'),
  glyphContinue: $('glyphContinue'),
  expOcrCount: $('expOcrCount'),
  btnExportPdf: $('btnExportPdf'),
  btnExportText: $('btnExportText'),
  searchbar: $('searchbar'),
  searchInput: $('searchInput'),
  searchCount: $('searchCount'),
  searchPrev: $('searchPrev'),
  searchNext: $('searchNext'),
  searchClose: $('searchClose'),
  searchResults: $('searchResults'),
  thumbCount: $('thumbCount'),
  thumbs: $('thumbs'),
  btnPrev: $('btnPrev'),
  pageInput: $('pageInput'),
  pageCount: $('pageCount'),
  btnNext: $('btnNext'),
  btnZoomOut: $('btnZoomOut'),
  zoomLabel: $('zoomLabel'),
  btnZoomIn: $('btnZoomIn'),
  btnFit: $('btnFit'),
  ocrHint: $('ocrHint'),
  btnAddTextTop: $('btnAddTextTop'),
  btnInspectorToggle: $('btnInspectorToggle'),
  canvasScroll: $('canvasScroll'),
  stage: $('stage'),
  pdfCanvas: $('pdfCanvas'),
  overlay: $('overlay'),
  emptyState: $('emptyState'),
  btnEmptyOpen: $('btnEmptyOpen'),
  btnDemoText: $('btnDemoText'),
  btnDemoScan: $('btnDemoScan'),
  hintbar: $('hintbar'),
  hintText: $('hintText'),
  hintCancel: $('hintCancel'),
  inspector: $('inspector'),
  editCount: $('editCount'),
  editCountList: $('editCountList'),
  editEmpty: $('editEmpty'),
  editForm: $('editForm'),
  btnAddText: $('btnAddText'),
  editList: $('editList'),
  editListEmpty: $('editListEmpty'),
  btnClearEdits: $('btnClearEdits'),
  efPage: $('efPage'),
  efSource: $('efSource'),
  efClose: $('efClose'),
  efOriginalWrap: $('efOriginalWrap'),
  efOriginal: $('efOriginal'),
  efText: $('efText'),
  efFont: $('efFont'),
  efSize: $('efSize'),
  efBold: $('efBold'),
  efItalic: $('efItalic'),
  efColor: $('efColor'),
  efBg: $('efBg'),
  efFit: $('efFit'),
  efApply: $('efApply'),
  efReset: $('efReset'),
  ocrLang: $('ocrLang'),
  btnOcrPage: $('btnOcrPage'),
  btnOcrAll: $('btnOcrAll'),
  ocrProgress: $('ocrProgress'),
  ocrProgressFill: $('ocrProgressFill'),
  ocrStatus: $('ocrStatus'),
  btnOcrCancel: $('btnOcrCancel'),
  ocrConf: $('ocrConf'),
  ocrResultBox: $('ocrResultBox'),
  ocrText: $('ocrText'),
  ocrNoResult: $('ocrNoResult'),
  btnCopyOcr: $('btnCopyOcr'),
  btnOcrFix: $('btnOcrFix'),
  ocrPageChips: $('ocrPageChips'),
  textSource: $('textSource'),
  pageText: $('pageText'),
  btnCopyPageText: $('btnCopyPageText'),
  btnDownloadText: $('btnDownloadText'),
  toasts: $('toasts'),
  loadingScreen: $('loadingScreen'),
  loadingLabel: $('loadingLabel'),
  dropOverlay: $('dropOverlay'),
  fileInput: $('fileInput'),
  exportModal: $('exportModal'),
  exportModalTitle: $('exportModalTitle'),
  exportModalClose: $('exportModalClose'),
  exportPreviewWrap: $('exportPreviewWrap'),
  exportPreview: $('exportPreview'),
  exportKind: $('exportKind'),
  exportFileName: $('exportFileName'),
  exportFileMeta: $('exportFileMeta'),
  exportTextBox: $('exportTextBox'),
  exportTextPreview: $('exportTextPreview'),
  exportDownload: $('exportDownload'),
  exportCopyText: $('exportCopyText'),
};

const state = {
  engine: null,
  bytes: null,
  fileName: 'document.pdf',
  numPages: 0,
  pageIndex: 0,
  zoom: null, // null = ajuster à la largeur
  scale: 1,
  viewport: null,
  renderTask: null,
  renderToken: 0,
  docToken: 0,
  loadToken: 0,
  pages: new Map(), // n -> { lines, ocr, ocrStatus }
  edits: [],
  active: null, // { edit, snapshot, isNew }
  addMode: false,
  search: { query: '', matches: [], active: -1 },
  textIndexReady: false,
  ensuringAll: null,
  ocr: { running: false, cancel: false },
};

/* ─────────────────────────── UI helpers ─────────────────────────── */

let loadingDepth = 0;
let modalUrl = null;
let modalToken = 0;
function pushLoading(label = 'Chargement…') {
  loadingDepth++;
  els.loadingLabel.textContent = label;
  els.loadingScreen.hidden = false;
}
function popLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (!loadingDepth) els.loadingScreen.hidden = true;
}

function toast(message, type = 'info', opts = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icoName = type === 'success' ? 'check' : type === 'error' || type === 'warn' ? 'alert' : 'sparkle';
  el.innerHTML = `<span class="t-ico">${icon(icoName, 16)}</span><span class="t-msg">${U.escapeHtml(message)}</span>`;
  els.toasts.appendChild(el);
  const dismiss = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  if (opts.action) {
    const b = document.createElement('button');
    b.className = 't-action';
    b.textContent = opts.action;
    b.addEventListener('click', () => {
      opts.onAction?.();
      dismiss();
    });
    el.appendChild(b);
  }
  setTimeout(dismiss, opts.duration ?? (type === 'error' ? 7500 : 4200));
}

function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}

function openInspectorOnMobile() {
  if (window.matchMedia('(max-width: 900px)').matches) els.inspector.classList.add('open');
}

function getPageData(n) {
  if (!state.pages.has(n)) {
    state.pages.set(n, { lines: null, ocr: null, ocrStatus: 'idle' });
  }
  return state.pages.get(n);
}

function ensureLines(n) {
  const pd = getPageData(n);
  if (pd.lines) return Promise.resolve(pd.lines);
  if (!pd.linesPromise) {
    pd.linesPromise = state.engine
      .extractLines(n)
      .then((lines) => {
        pd.lines = lines;
        pd.linesPromise = null;
        return lines;
      })
      .catch((err) => {
        console.warn('extractLines', n, err);
        pd.lines = [];
        pd.linesPromise = null;
        return pd.lines;
      });
  }
  return pd.linesPromise;
}

async function ensureAllLines() {
  if (state.textIndexReady) return;
  if (!state.ensuringAll) {
    const token = state.docToken;
    state.ensuringAll = (async () => {
      for (let n = 1; n <= state.numPages; n++) {
        if (token !== state.docToken || !state.engine) return;
        await ensureLines(n);
        if (n === state.pageIndex + 1) {
          renderOverlay();
          updateTextPanel();
        }
      }
      if (token === state.docToken) state.textIndexReady = true;
    })().finally(() => {
      state.ensuringAll = null;
    });
  }
  return state.ensuringAll;
}

function editLinesForPage(n) {
  const pd = getPageData(n);
  if (pd.lines && pd.lines.length) return pd.lines;
  if (pd.ocr && pd.ocr.lines.length) return pd.ocr.lines;
  return pd.lines || [];
}

/* ─────────────────────────── Rendu ─────────────────────────── */

let resizeTimer = null;
let thumbObserver = null;
const measureCtx = document.createElement('canvas').getContext('2d');
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.engine && state.zoom == null) renderCurrent();
  }, 180);
});

async function renderCurrent() {
  if (!state.engine) return;
  const token = ++state.renderToken;
  const n = state.pageIndex + 1;

  const page = await state.engine.getPage(n);
  if (token !== state.renderToken) return;

  const base = page.getViewport({ scale: 1 });
  const availW = Math.max(280, els.canvasScroll.clientWidth - 56);
  const availH = Math.max(240, els.canvasScroll.clientHeight - 56);
  let scale =
    state.zoom == null
      ? Math.min(availW / base.width, availH / base.height, 1.6)
      : state.zoom;
  scale = U.clamp(scale, 0.15, 6);
  state.scale = scale;

  const vp = page.getViewport({ scale });
  state.viewport = vp;

  const oldW = els.stage.offsetWidth;
  const oldH = els.stage.offsetHeight;
  const oldSL = els.canvasScroll.scrollLeft;
  const oldST = els.canvasScroll.scrollTop;

  els.overlay.innerHTML = '';
  els.stage.style.width = `${vp.width}px`;
  els.stage.style.height = `${vp.height}px`;
  els.stage.hidden = false;

  let dpr = Math.min(2, window.devicePixelRatio || 1);
  const maxPx = 8000;
  if (vp.width * dpr > maxPx || vp.height * dpr > maxPx) {
    dpr = Math.max(0.5, Math.min(maxPx / vp.width, maxPx / vp.height));
  }

  els.pdfCanvas.style.width = `${vp.width}px`;
  els.pdfCanvas.style.height = `${vp.height}px`;
  els.pdfCanvas.width = Math.max(1, Math.floor(vp.width * dpr));
  els.pdfCanvas.height = Math.max(1, Math.floor(vp.height * dpr));
  const ctx = els.pdfCanvas.getContext('2d');

  if (state.renderTask) {
    try {
      state.renderTask.cancel();
    } catch {
      /* ignore */
    }
  }

  try {
    state.renderTask = page.render({
      canvasContext: ctx,
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      background: '#ffffff',
    });
    await state.renderTask.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') {
      console.warn('render', err);
    }
  }
  if (token !== state.renderToken) return;

  // conserve approximativement le point de vue lors d'un zoom
  if (oldW && (oldW !== els.stage.offsetWidth || oldH !== els.stage.offsetHeight)) {
    const ratioX = els.stage.offsetWidth / oldW;
    const ratioY = els.stage.offsetHeight / oldH;
    els.canvasScroll.scrollLeft = (oldSL + els.canvasScroll.clientWidth / 2) * ratioX - els.canvasScroll.clientWidth / 2;
    els.canvasScroll.scrollTop = (oldST + els.canvasScroll.clientHeight / 2) * ratioY - els.canvasScroll.clientHeight / 2;
  }

  await ensureLines(n);
  await enrichPageLineTraits(n);
  if (token !== state.renderToken) return;

  renderOverlay();
  updateZoomLabel();
  updatePageNav();
  updateThumbActive();
  updatePanelsForPage();
}

async function goToPage(n, { keepScroll = false } = {}) {
  if (!state.engine) return;
  const target = U.clamp(Math.round(n) || 1, 1, state.numPages);
  closeActive();
  if (target - 1 === state.pageIndex) {
    if (!keepScroll) els.canvasScroll.scrollTo({ top: 0 });
    updatePageNav();
    return;
  }
  state.pageIndex = target - 1;
  if (!keepScroll) els.canvasScroll.scrollTo({ top: 0, left: 0 });
  updatePageNav();
  updateThumbActive();
  updatePanelsForPage();
  await renderCurrent();
  const activeThumb = els.thumbs.querySelector('.thumb.active');
  activeThumb?.scrollIntoView({ block: 'nearest' });
}

function updateZoomLabel() {
  els.zoomLabel.textContent = `${Math.round((state.scale || 1) * 100)} %`;
}

function updatePageNav() {
  const has = !!state.engine;
  els.pageInput.value = has ? state.pageIndex + 1 : 1;
  els.pageCount.textContent = has ? state.numPages : 0;
  els.btnPrev.disabled = !has || state.pageIndex <= 0;
  els.btnNext.disabled = !has || state.pageIndex >= state.numPages - 1;
  els.pageInput.disabled = !has;
}

function updateThumbActive() {
  els.thumbs.querySelectorAll('.thumb').forEach((t) => {
    t.classList.toggle('active', Number(t.dataset.page) === state.pageIndex + 1);
  });
}

function updateFileChip() {
  if (!state.engine) return;
  els.fileChip.hidden = false;
  els.fileName.textContent = state.fileName;
  els.fileMeta.textContent = `${state.numPages} page${state.numPages > 1 ? 's' : ''}${
    state.bytes ? ` · ${U.formatBytes(state.bytes.length)}` : ''
  }`;
}

async function buildThumbnails(token) {
  if (thumbObserver) {
    thumbObserver.disconnect();
    thumbObserver = null;
  }
  els.thumbs.innerHTML = '';
  for (let n = 1; n <= state.numPages; n++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb';
    btn.dataset.page = String(n);
    btn.innerHTML = `<div class="thumb-frame"></div><span class="thumb-num">${n}</span>`;
    els.thumbs.appendChild(btn);
  }
  updateThumbActive();

  // Rendu paresseux : seules les vignettes visibles sont dessinées.
  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        thumbObserver?.unobserve(entry.target);
        renderThumbnail(entry.target, token);
      }
    },
    { root: els.thumbs, rootMargin: '260px 0px' }
  );
  els.thumbs.querySelectorAll('.thumb').forEach((b) => thumbObserver.observe(b));
  renderThumbnail(els.thumbs.firstElementChild, token);
}

async function renderThumbnail(btn, token) {
  if (!btn || btn.dataset.rendered === '1' || btn.dataset.rendering === '1') return;
  btn.dataset.rendering = '1';
  const n = Number(btn.dataset.page);
  try {
    const size = await state.engine.getPageSize(n);
    if (token !== state.docToken || !state.engine) return;
    const frame = btn.querySelector('.thumb-frame');
    frame.style.aspectRatio = `${size.width} / ${size.height}`;
    const canvas = document.createElement('canvas');
    await state.engine.renderToCanvas(n, canvas, 132 / size.width);
    if (token !== state.docToken) return;
    btn.dataset.rendered = '1';
    frame.innerHTML = '';
    frame.appendChild(canvas);
  } catch {
    /* placeholder conservé */
  } finally {
    delete btn.dataset.rendering;
  }
}

/* ─────────────────────────── Overlay de texte ─────────────────────────── */

async function enrichPageLineTraits(n) {
  const pd = getPageData(n);
  if (!pd.lines?.length) return;
  let page;
  try {
    page = await state.engine.getPage(n);
  } catch {
    return;
  }
  for (const line of pd.lines) {
    if (line.traitsResolved || !line.fontId) continue;
    try {
      const font = page.commonObjs?.get(line.fontId);
      if (!font) continue;
      const t = fontTraits(font);
      line.font = t.family;
      line.bold = t.bold;
      line.italic = t.italic;
      line.traitsResolved = true;
    } catch {
      /* police pas encore disponible */
    }
  }
}

function sampleBackgroundForBbox(bbox) {
  if (!state.viewport) return '#ffffff';
  const rect = pdfRectToViewportRect(bbox, state.viewport);
  return U.sampleCanvasBackground(els.pdfCanvas, rect, 6);
}

/** Échantillonne le fond et la couleur dominante du texte d'un bloc. */
function sampleColorsForBbox(bbox) {
  const bg = sampleBackgroundForBbox(bbox);
  const fallback = { bg, fg: '#111827' };
  if (!state.viewport) return fallback;
  const rect = pdfRectToViewportRect(bbox, state.viewport);
  const canvas = els.pdfCanvas;
  const ratioX = canvas.width / Math.max(1, parseFloat(canvas.style.width) || canvas.width);
  const ratioY = canvas.height / Math.max(1, parseFloat(canvas.style.height) || canvas.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;
  const x = Math.max(0, Math.floor(rect.left * ratioX));
  const y = Math.max(0, Math.floor(rect.top * ratioY));
  const w = Math.min(canvas.width - x, Math.ceil(rect.width * ratioX));
  const h = Math.min(canvas.height - y, Math.ceil(rect.height * ratioY));
  if (w < 2 || h < 2 || w * h > 6e6) return fallback;
  let data;
  try {
    data = ctx.getImageData(x, y, w, h).data;
  } catch {
    return fallback;
  }
  const bg255 = U.hexToRgb01(bg);
  const br = bg255.r * 255;
  const bgc = bg255.g * 255;
  const bb = bg255.b * 255;
  let best = null;
  let bestDist = 0;
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 24000)));
  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      const i = (py * w + px) * 4;
      if (data[i + 3] < 200) continue;
      const dr = data[i] - br;
      const dg = data[i + 1] - bgc;
      const db = data[i + 2] - bb;
      const dist = dr * dr + dg * dg + db * db;
      if (dist > bestDist) {
        bestDist = dist;
        best = [data[i], data[i + 1], data[i + 2]];
      }
    }
  }
  if (!best || bestDist < 42 * 42) return fallback;
  return { bg, fg: U.rgbToHex(best[0], best[1], best[2]) };
}

function editSignature(e) {
  return JSON.stringify([e.text, e.font, e.size, !!e.bold, !!e.italic, e.color, e.bg, e.fit]);
}

function renderOverlay() {
  if (!state.engine || !state.viewport) return;
  els.overlay.innerHTML = '';
  const pageNo = state.pageIndex + 1;
  const vp = state.viewport;
  const lines = editLinesForPage(pageNo);
  const pageEdits = state.edits.filter((e) => e.page === pageNo);
  const activeId = state.active?.edit?.id || null;
  const covered = new Set(pageEdits.filter((e) => e.kind === 'edit' && e.lineId).map((e) => e.lineId));
  const query = state.search.query;
  const nq = query ? U.normalizeText(query) : '';
  const activeMatch = state.search.matches[state.search.active];

  // Zones de texte d'origine (cliquables)
  for (const line of lines) {
    if (!line.bbox || line.bbox.w <= 0 || line.bbox.h <= 0) continue;
    if (covered.has(line.id)) continue;
    const r = pdfRectToViewportRect(line.bbox, vp);
    if (r.width < 1 || r.height < 1) continue;
    const d = document.createElement('div');
    d.className = 'line-block' + (line.source === 'ocr' ? ' ocr' : '');
    d.dataset.lineId = line.id;
    d.style.left = `${r.left}px`;
    d.style.top = `${r.top}px`;
    d.style.width = `${r.width}px`;
    d.style.height = `${r.height}px`;
    d.title = line.text;
    if (nq && U.normalizeText(line.text).includes(nq)) {
      d.classList.add('hit');
      if (activeMatch && activeMatch.page === pageNo && activeMatch.lineId === line.id) {
        d.classList.add('hit-active');
      }
    }
    els.overlay.appendChild(d);
  }

  // Blocs modifiés / ajoutés
  for (const e of pageEdits) {
    if (!e.bbox || e.bbox.w <= 0) continue;
    const r = pdfRectToViewportRect(e.bbox, vp);
    if (r.width < 0.5 || r.height < 0.5) continue;
    const scale = state.scale;
    const padX = Math.max(1, (e.size || 10) * 0.12) * scale;
    const padY = Math.max(0.8, (e.size || 10) * 0.05) * scale;
    const d = document.createElement('div');
    d.className = 'edit-block' + (e.id === activeId ? ' active' : '');
    d.dataset.editId = e.id;
    d.style.left = `${r.left - padX}px`;
    d.style.top = `${r.top - padY}px`;
    d.style.minWidth = `${r.width + padX * 2}px`;
    d.style.minHeight = `${r.height + padY * 2}px`;
    d.style.padding = `${padY}px ${padX}px`;
    d.style.background = e.bg && e.bg !== 'none' ? e.bg : 'transparent';

    const fontFamily = U.cssFontFamily(e.font);
    const basePx = Math.max(1, (e.size || 10) * scale);
    let fontSizePx = basePx;
    const lines = String(e.text || '').split('\n');
    if (e.fit !== false && e.bbox.w > 2 && lines.some((l) => l.trim())) {
      try {
        measureCtx.font = `${e.italic ? 'italic ' : ''}${e.bold ? '700' : '400'} ${basePx}px ${fontFamily}`;
        let maxW = 0;
        for (const ln of lines) maxW = Math.max(maxW, measureCtx.measureText(ln || ' ').width);
        const allowed = (e.bbox.w + 1) * scale;
        if (maxW > allowed && maxW > 0) fontSizePx = Math.max(1, basePx * (allowed / maxW));
      } catch {
        /* mesure indisponible */
      }
    }

    const span = document.createElement('span');
    span.className = 'edit-text';
    span.textContent = e.text || '';
    span.style.display = 'block';
    span.style.whiteSpace = 'pre';
    span.style.fontFamily = fontFamily;
    span.style.fontSize = `${fontSizePx}px`;
    span.style.lineHeight = '1.16';
    span.style.fontWeight = e.bold ? '700' : '400';
    span.style.fontStyle = e.italic ? 'italic' : 'normal';
    span.style.color = e.color || '#111827';
    // compense la réduction de taille pour garder la ligne de base
    if (fontSizePx < basePx) span.style.paddingTop = `${0.88 * (basePx - fontSizePx)}px`;
    d.appendChild(span);

    const flag = document.createElement('span');
    flag.className = 'edit-flag';
    flag.textContent = e.kind === 'add' ? 'Nouveau' : 'Modifié';
    d.appendChild(flag);
    els.overlay.appendChild(d);
  }
}

function stagePoint(ev) {
  const rect = els.stage.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

els.overlay.addEventListener('click', async (ev) => {
  if (!state.engine) return;
  const editEl = ev.target.closest('.edit-block');
  const lineEl = ev.target.closest('.line-block');

  if (state.addMode) {
    if (lineEl) {
      cancelAddMode();
      selectLine(lineEl.dataset.lineId);
      return;
    }
    const p = stagePoint(ev);
    placeTextAt(p.x, p.y);
    return;
  }
  if (editEl) {
    selectEdit(editEl.dataset.editId);
    return;
  }
  if (lineEl) {
    selectLine(lineEl.dataset.lineId);
  }
});

/* ─────────────────────────── Édition ─────────────────────────── */

function showForm() {
  els.editEmpty.hidden = true;
  els.editForm.hidden = false;
}

function hideForm() {
  els.editForm.hidden = true;
  els.editEmpty.hidden = false;
}

function fillForm(e) {
  showForm();
  els.efPage.textContent = `Page ${e.page}`;
  els.efSource.textContent = e.kind === 'add' ? 'Nouveau bloc' : e.source === 'ocr' ? 'Bloc OCR' : 'Texte PDF';
  els.efSource.className = 'badge outline' + (e.source === 'ocr' ? ' warn' : '');
  els.efOriginalWrap.hidden = e.kind === 'add';
  els.efOriginal.textContent = e.originalText || '';
  els.efText.value = e.text || '';
  els.efFont.value = e.font || 'Helvetica';
  els.efSize.value = e.size ?? 12;
  els.efColor.value = normalizeHex(e.color, '#111827');
  els.efBg.value = normalizeHex(e.bg, '#ffffff');
  els.efBg.disabled = e.kind === 'add';
  els.efBold.classList.toggle('active', !!e.bold);
  els.efItalic.classList.toggle('active', !!e.italic);
  els.efFit.checked = e.fit !== false;
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) {
      els.efText.focus();
      els.efText.select();
    }
  });
}

function normalizeHex(v, fallback) {
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v;
  if (typeof v === 'string' && /^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  return fallback;
}

function makeEditFromLine(line, pageNo) {
  const { bg, fg } = sampleColorsForBbox(line.bbox);
  return {
    id: U.uid('edit'),
    page: pageNo,
    kind: 'edit',
    lineId: line.id,
    source: line.source || 'pdf',
    bbox: { ...line.bbox },
    baseline: line.baseline,
    originalText: line.text,
    text: line.text,
    font: line.font || 'Helvetica',
    size: U.clamp(Math.round((line.fontSize || 12) * 2) / 2, 4, 120),
    bold: !!line.bold,
    italic: !!line.italic,
    color: fg,
    bg,
    fit: false,
  };
}

function selectLine(lineId) {
  const pageNo = state.pageIndex + 1;
  const line = editLinesForPage(pageNo).find((l) => l.id === lineId);
  if (!line) return;
  closeActive();
  const edit = makeEditFromLine(line, pageNo);
  state.edits.push(edit);
  state.active = { edit, snapshot: { sig: editSignature(edit), data: U.clone(edit) }, isNew: true };
  fillForm(edit);
  renderOverlay();
  renderEditList();
  updateExportUi();
  setTab('edit');
  openInspectorOnMobile();
  requestAnimationFrame(() => scrollOverlayBlockIntoView());
}

function selectEdit(id) {
  const edit = state.edits.find((x) => x.id === id);
  if (!edit) return;
  closeActive();
  state.active = { edit, snapshot: { sig: editSignature(edit), data: U.clone(edit) }, isNew: false };
  fillForm(edit);
  renderOverlay();
  renderEditList();
  setTab('edit');
  openInspectorOnMobile();
  requestAnimationFrame(() => scrollOverlayBlockIntoView());
}

function scrollOverlayBlockIntoView() {
  const el = els.overlay.querySelector('.edit-block.active');
  el?.scrollIntoView({ block: 'center', inline: 'nearest' });
}

function closeActive() {
  const a = state.active;
  if (!a) {
    hideForm();
    return;
  }
  const dirty = editSignature(a.edit) !== a.snapshot.sig;
  if (!dirty && a.isNew) {
    state.edits = state.edits.filter((x) => x.id !== a.edit.id);
  }
  state.active = null;
  hideForm();
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
}

const refreshFormEcho = U.debounce(() => {
  renderEditList();
  updateTextPanel();
}, 180);

function onFormInput() {
  const a = state.active;
  if (!a) return;
  const e = a.edit;
  e.text = els.efText.value;
  e.font = els.efFont.value;
  const s = parseFloat(els.efSize.value);
  if (Number.isFinite(s)) e.size = U.clamp(s, 4, 200);
  e.bold = els.efBold.classList.contains('active');
  e.italic = els.efItalic.classList.contains('active');
  e.color = els.efColor.value;
  if (e.kind !== 'add') e.bg = els.efBg.value;
  e.fit = els.efFit.checked;
  renderOverlay();
  refreshFormEcho();
}

function resetActiveEdit() {
  const a = state.active;
  if (!a) return;
  const removed = a.edit;
  const wasNew = a.isNew;
  state.edits = state.edits.filter((x) => x.id !== removed.id);
  state.active = null;
  hideForm();
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  if (!wasNew) {
    toast("Texte d'origine rétabli.", 'info', {
      action: 'Annuler',
      onAction: () => {
        state.edits.push(removed);
        renderOverlay();
        renderEditList();
        updateExportUi();
        updateTextPanel();
      },
    });
  }
}

function startAddText() {
  if (!state.engine) return;
  closeActive();
  state.addMode = true;
  els.stage.classList.add('placing');
  updateHint();
  setTab('edit');
  openInspectorOnMobile();
  toast('Cliquez sur la page à l’endroit où placer le texte.', 'info', { duration: 3000 });
}

function cancelAddMode() {
  state.addMode = false;
  els.stage.classList.remove('placing');
  updateHint();
}

function placeTextAt(cssX, cssY) {
  if (!state.viewport) return;
  const [x, y] = state.viewport.convertToPdfPoint(cssX, cssY);
  const size = 14;
  const edit = {
    id: U.uid('edit'),
    page: state.pageIndex + 1,
    kind: 'add',
    lineId: null,
    source: 'add',
    bbox: { x, y: y - size * 0.26, w: 120, h: size * 1.14 },
    baseline: y,
    originalText: '',
    text: '',
    font: 'Helvetica',
    size,
    bold: false,
    italic: false,
    color: '#111827',
    bg: null,
    fit: false,
  };
  state.edits.push(edit);
  state.active = { edit, snapshot: { sig: editSignature(edit), data: U.clone(edit) }, isNew: true };
  cancelAddMode();
  fillForm(edit);
  els.efText.focus();
  renderOverlay();
  renderEditList();
  updateExportUi();
  setTab('edit');
}

function renderEditList() {
  const n = state.edits.length;
  els.editCount.textContent = n;
  els.editCount.dataset.zero = n ? '0' : '1';
  els.editCountList.textContent = n;
  els.btnClearEdits.disabled = !n;
  els.btnClearEdits.style.opacity = n ? '' : '0.45';
  els.editListEmpty.hidden = n > 0;
  if (!n) {
    els.editList.innerHTML = '';
    return;
  }
  const sorted = [...state.edits].sort((a, b) => a.page - b.page || b.bbox.y - a.bbox.y);
  els.editList.innerHTML = sorted
    .map((e) => {
      const preview = (e.text || '').replace(/\s+/g, ' ').trim() || '(texte supprimé)';
      const original = (e.originalText || '').replace(/\s+/g, ' ').trim();
      return `<div class="edit-item" data-edit-id="${e.id}" role="button" tabindex="0">
        <span class="edit-item-page">p.${e.page}</span>
        <span class="edit-item-text">${U.escapeHtml(preview.slice(0, 70))}</span>
        ${original ? `<span class="edit-item-original">${U.escapeHtml(original.slice(0, 40))}</span>` : ''}
        <button class="icon-btn tiny" data-del-id="${e.id}" title="Supprimer cette modification">${icon('trash', 14)}</button>
      </div>`;
    })
    .join('');
}

function deleteEditById(id) {
  const removed = state.edits.find((e) => e.id === id);
  if (!removed) return;
  if (state.active?.edit?.id === id) {
    state.active = null;
    hideForm();
  }
  state.edits = state.edits.filter((e) => e.id !== id);
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  toast('Modification supprimée.', 'info', {
    action: 'Annuler',
    onAction: () => {
      state.edits.push(removed);
      renderOverlay();
      renderEditList();
      updateExportUi();
      updateTextPanel();
    },
  });
}

function clearAllEdits() {
  if (!state.edits.length) return;
  const snapshot = [...state.edits];
  state.active = null;
  hideForm();
  state.edits = [];
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  toast('Toutes les modifications ont été retirées.', 'info', {
    action: 'Annuler',
    onAction: () => {
      state.edits = snapshot;
      renderOverlay();
      renderEditList();
      updateExportUi();
      updateTextPanel();
    },
  });
}

/* ─────────────────────────── OCR ─────────────────────────── */

function ocrStatusLabel(status) {
  const labels = {
    'loading tesseract core': 'Chargement du moteur OCR…',
    'initializing tesseract': 'Initialisation du moteur…',
    'loading language traineddata': 'Chargement du modèle de langue…',
    'initializing api': 'Préparation de la reconnaissance…',
    'recognizing text': 'Reconnaissance du texte…',
  };
  return labels[status] || status;
}

function setOcrProgress(progress, label) {
  els.ocrProgress.hidden = false;
  els.ocrProgressFill.style.width = `${Math.round(U.clamp(progress, 0, 1) * 100)}%`;
  if (label) els.ocrStatus.textContent = label;
}

function updateOcrButtons() {
  const running = state.ocr.running;
  els.btnOcrPage.disabled = running;
  els.btnOcrAll.disabled = running;
  els.btnOcrCancel.disabled = !running;
}

/**
 * Regroupe les mots OCR en segments horizontaux cohérents.
 * Contrairement aux lignes Tesseract, les colonnes éloignées (tableaux,
 * en-têtes gauche/droite) sont séparées pour que chaque bloc soit éditable seul.
 */
function groupOcrWords(words) {
  const items = words
    .filter((w) => w.text && w.text.trim())
    .map((w) => ({
      text: w.text.trim(),
      x0: w.bbox.x0,
      y0: w.bbox.y0,
      x1: w.bbox.x1,
      y1: w.bbox.y1,
      h: Math.max(1, w.bbox.y1 - w.bbox.y0),
      confidence: w.confidence || 0,
    }))
    .sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1) || a.x0 - b.x0);

  const rows = [];
  for (const it of items) {
    const cy = (it.y0 + it.y1) / 2;
    let row = null;
    for (const r of rows) {
      if (Math.abs(r.cy - cy) <= Math.max(5, Math.min(it.h, r.h) * 0.6)) {
        row = r;
        break;
      }
    }
    if (!row) {
      row = { cy, h: it.h, items: [] };
      rows.push(row);
    }
    row.items.push(it);
    row.h = Math.max(row.h, it.h);
  }

  const segments = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.x0 - b.x0);
    let seg = null;
    for (const it of row.items) {
      const gap = seg ? it.x0 - seg.x1 : 0;
      const maxH = Math.max(it.h, seg ? seg.h : 0);
      if (!seg || gap > Math.max(maxH * 1.25, 14)) {
        if (seg) segments.push(seg);
        seg = { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, h: it.h, items: [it] };
      } else {
        seg.items.push(it);
        seg.x1 = Math.max(seg.x1, it.x1);
        seg.y0 = Math.min(seg.y0, it.y0);
        seg.y1 = Math.max(seg.y1, it.y1);
        seg.h = Math.max(seg.h, it.h);
      }
    }
    if (seg) segments.push(seg);
  }

  return segments
    .map((seg) => ({
      text: seg.items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim(),
      bbox: { x0: seg.x0, y0: seg.y0, x1: seg.x1, y1: seg.y1 },
      confidence: Math.round(
        seg.items.reduce((sum, i) => sum + (i.confidence || 0), 0) / Math.max(1, seg.items.length)
      ),
    }))
    .filter((seg) => seg.text);
}

async function runOcrOnPage(n, langs, onProgress) {
  const page = await state.engine.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const ocrScale = U.clamp(2200 / Math.max(base.width, base.height), 2, 3.5);
  const vp = page.getViewport({ scale: ocrScale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;

  const res = await recognizeCanvas(canvas, langs, onProgress);

  const mapBox = (b) => {
    const [x1, y1] = vp.convertToPdfPoint(b.x0, b.y0);
    const [x2, y2] = vp.convertToPdfPoint(b.x1, b.y1);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    };
  };

  const words = res.words
    .map((w) => ({ text: w.text, bbox: mapBox(w.bbox), confidence: w.confidence }))
    .filter((w) => w.bbox.w > 0.3 && w.bbox.h > 0.3);

  const lines = groupOcrWords(res.words)
    .map((seg, i) => {
      const bbox = mapBox(seg.bbox);
      return {
        id: `p${n}-o${i}`,
        text: seg.text,
        source: 'ocr',
        font: 'Helvetica',
        fontSize: U.clamp(bbox.h * 1.2, 5, 72),
        baseline: bbox.y + bbox.h * 0.24,
        bbox,
        confidence: seg.confidence,
      };
    })
    .filter((l) => l.bbox.w > 1 && l.bbox.h > 1 && l.text);

  return {
    text: res.text,
    confidence: res.confidence,
    lines,
    words,
    langs,
    at: Date.now(),
  };
}

async function runOcr(pageNumbers) {
  if (!state.engine || state.ocr.running) return;
  const docToken = state.docToken;
  closeActive();
  state.ocr.running = true;
  state.ocr.cancel = false;
  updateOcrButtons();
  const langs = els.ocrLang.value;
  const total = pageNumbers.length;
  setOcrProgress(0, 'Préparation de la reconnaissance…');
  let done = 0;
  let failed = 0;

  for (let i = 0; i < pageNumbers.length; i++) {
    if (state.ocr.cancel || docToken !== state.docToken) break;
    const n = pageNumbers[i];
    const pd = getPageData(n);
    pd.ocrStatus = 'running';
    try {
      const result = await runOcrOnPage(n, langs, (m) => {
        const progress = (i + (m.progress || 0)) / total;
        setOcrProgress(
          progress,
          `${ocrStatusLabel(m.status)} Page ${n} (${i + 1}/${total})`
        );
      });
      if (state.ocr.cancel || docToken !== state.docToken) break;
      pd.ocr = result;
      pd.ocrStatus = 'done';
      done++;
      if (n === state.pageIndex + 1) {
        renderOverlay();
        updateOcrPanel();
        updateTextPanel();
        updateHint();
      }
      updateOcrChips();
      updateExportUi();
    } catch (err) {
      if (state.ocr.cancel) break;
      console.error('OCR page', n, err);
      pd.ocrStatus = 'error';
      failed++;
      const msg = err?.message || String(err);
      toast(`OCR impossible sur la page ${n} : ${msg}`, 'error');
      if (/fetch|network|importScripts|Failed to load|NetworkError/i.test(msg)) break;
    }
  }

  if (docToken !== state.docToken) return;
  state.ocr.running = false;
  updateOcrButtons();
  if (done) {
    setOcrProgress(1, `Terminé — ${done} page${done > 1 ? 's' : ''} analysée${done > 1 ? 's' : ''}.`);
    els.expOcr.checked = true;
  } else if (!failed) {
    els.ocrProgress.hidden = true;
  }
  setTimeout(() => {
    if (!state.ocr.running) els.ocrProgress.hidden = true;
  }, 2200);

  updateOcrPanel();
  updateOcrChips();
  updateExportUi();
  updateHint();
  renderOverlay();
  if (done) toast(`OCR terminé sur ${done} page${done > 1 ? 's' : ''}.`, 'success');
  if (state.search.query) performSearch(state.search.query);
}

function updateOcrPanel() {
  if (!state.engine) return;
  const pd = getPageData(state.pageIndex + 1);
  const has = !!pd.ocr;
  els.ocrResultBox.hidden = !has;
  els.ocrNoResult.hidden = has;
  els.ocrConf.hidden = !has;
  if (has) {
    els.ocrText.value = pd.ocr.text || '(Aucun texte détecté sur cette page.)';
    const conf = Math.round(pd.ocr.confidence || 0);
    els.ocrConf.textContent = `${conf} % · ${pd.ocr.lines.length} blocs`;
    els.ocrConf.title = `Confiance moyenne : ${conf} %`;
    els.ocrConf.className = `badge ${conf >= 70 ? 'ok' : 'warn'}`;
  }
  updateOcrChips();
}

function updateOcrChips() {
  const entries = [...state.pages.entries()].filter(([, p]) => p.ocr).map(([n]) => n).sort((a, b) => a - b);
  const cur = state.pageIndex + 1;
  if (!entries.length) {
    els.ocrPageChips.innerHTML = '<span class="muted small">—</span>';
    return;
  }
  els.ocrPageChips.innerHTML = entries
    .map((n) => `<button class="chip ocr-ok${n === cur ? ' active' : ''}" data-page="${n}">p. ${n}</button>`)
    .join('');
}

/* ─────────────────────────── Panneaux ─────────────────────────── */

function getPageText(n) {
  const pd = getPageData(n);
  const native = pd.lines || [];
  const ocrLines = pd.ocr?.lines || [];
  const base = native.length ? native : ocrLines;
  const source = native.length ? 'PDF' : pd.ocr ? 'OCR' : '—';

  if (!base.length) {
    if (pd.ocr?.text) return { text: pd.ocr.text, source: 'OCR' };
    return { text: '', source: '—' };
  }

  const edits = state.edits.filter((e) => e.page === n);
  const byLine = new Map(
    edits.filter((e) => e.kind === 'edit' && e.lineId).map((e) => [e.lineId, e])
  );
  const rows = base.map((l) => ({
    x: l.bbox.x,
    y: l.baseline ?? l.bbox.y + l.bbox.h,
    h: l.bbox.h,
    text: byLine.has(l.id) ? byLine.get(l.id).text : l.text,
  }));
  for (const e of edits) {
    if (e.kind === 'add' && e.text.trim()) {
      rows.push({ x: e.bbox.x, y: e.baseline ?? e.bbox.y, h: e.bbox.h, text: e.text });
    }
  }
  return { text: sortReadingOrder(rows).map((r) => r.text).join('\n'), source };
}

/** Ordonne les segments ligne par ligne (haut → bas), puis de gauche à droite. */
function sortReadingOrder(rows) {
  const sorted = rows
    .slice()
    .sort((a, b) => b.y - a.y || (a.x || 0) - (b.x || 0));
  const lines = [];
  let cur = null;
  for (const r of sorted) {
    const h = r.h || 10;
    if (!cur || Math.abs(cur.y - r.y) > Math.max(4, Math.min(h, cur.h) * 0.6)) {
      cur = { y: r.y, h, items: [r] };
      lines.push(cur);
    } else {
      cur.items.push(r);
      cur.h = Math.max(cur.h, h);
    }
  }
  return lines.flatMap((row) => row.items.sort((a, b) => (a.x || 0) - (b.x || 0)));
}

function updateTextPanel() {
  if (!state.engine) return;
  const { text, source } = getPageText(state.pageIndex + 1);
  els.pageText.value = text;
  els.textSource.textContent = source;
  els.textSource.className = `badge${source === 'OCR' ? ' warn' : ''}`;
  els.btnCopyPageText.disabled = !text.trim();
}

function updateHint() {
  if (!state.engine) return;
  const pd = getPageData(state.pageIndex + 1);
  els.hintCancel.hidden = !state.addMode;
  els.hintbar.classList.toggle('placing', state.addMode);
  els.ocrHint.hidden = !pd.ocr;
  if (state.addMode) {
    els.hintText.textContent = 'Cliquez sur la page pour placer votre texte — Échap pour annuler';
    return;
  }
  if (state.search.query && state.search.matches.length) {
    els.hintText.textContent = `${state.search.matches.length} résultat${
      state.search.matches.length > 1 ? 's' : ''
    } pour « ${state.search.query} »`;
    return;
  }
  if (pd.ocr) {
    els.hintText.textContent = 'Blocs OCR en pointillés — cliquez sur un bloc pour corriger le texte';
    return;
  }
  if (pd.lines?.length) {
    els.hintText.textContent = 'Cliquez sur un texte pour le modifier';
    return;
  }
  els.hintText.textContent = 'Aucun texte natif sur cette page — lancez l’OCR pour l’extraire';
}

function updatePanelsForPage() {
  if (!state.engine) return;
  updateOcrPanel();
  updateTextPanel();
  updateHint();
  updateOcrChips();
}

function updateExportUi() {
  const nEdits = state.edits.length;
  const ocrPages = [...state.pages.values()].filter((p) => p.ocr).length;
  els.expEditsCount.textContent = `(${nEdits})`;
  els.expOcrCount.textContent = ocrPages ? `(${ocrPages} page${ocrPages > 1 ? 's' : ''})` : '(0)';
  els.expOcr.disabled = ocrPages === 0;
  if (!ocrPages) els.expOcr.checked = false;
  els.btnExport.disabled = !state.engine;
  els.btnSearch.disabled = !state.engine;
}

/* ─────────────────────────── Recherche ─────────────────────────── */

async function performSearch(rawQuery) {
  const query = rawQuery.trim();
  state.search.query = query;
  if (!state.engine) return;
  if (!query) {
    state.search.matches = [];
    state.search.active = -1;
    renderSearchResults();
    renderOverlay();
    updateHint();
    return;
  }
  if (!state.textIndexReady) {
    els.searchCount.textContent = 'Indexation…';
    await ensureAllLines();
  }
  if (state.search.query !== query) return;

  const nq = U.normalizeText(query);
  const matches = [];
  for (let n = 1; n <= state.numPages; n++) {
    const pd = getPageData(n);
    const lines = pd.lines?.length ? pd.lines : pd.ocr?.lines || [];
    const byLine = new Map(
      state.edits.filter((e) => e.page === n && e.kind === 'edit').map((e) => [e.lineId, e])
    );
    for (const line of lines) {
      const edit = byLine.get(line.id);
      const text = edit ? edit.text : line.text;
      if (!text) continue;
      const found = findMatch(text, query);
      if (found.index >= 0) {
        matches.push({ page: n, lineId: line.id, text, idx: found.index, len: found.length });
      }
    }
  }
  state.search.matches = matches;
  state.search.active = matches.length ? 0 : -1;
  renderSearchResults();
  if (matches.length) await focusMatch(0);
  else {
    renderOverlay();
    updateHint();
  }
}

/** Recherche insensible à la casse ET aux accents, avec l'index dans le texte d'origine. */
function findMatch(text, query) {
  const direct = text.toLowerCase().indexOf(query.toLowerCase());
  if (direct >= 0) return { index: direct, length: query.length };
  const target = U.normalizeText(query);
  if (!target) return { index: -1, length: 0 };
  let norm = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
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

function renderSearchResults() {
  const { matches, active, query } = state.search;
  if (!query) {
    els.searchResults.hidden = true;
    els.searchCount.textContent = '';
    return;
  }
  const visible = els.searchbar.hidden ? false : true;
  if (!visible) return;
  els.searchResults.hidden = false;
  if (!matches.length) {
    els.searchCount.textContent = 'Aucun résultat';
    els.searchResults.innerHTML = `<div class="search-empty muted small" style="padding:12px 10px">
      Aucun texte trouvé${!state.textIndexReady ? ' pour le moment' : ''}. Sur un scan, lancez d’abord l’OCR (onglet OCR).
    </div>`;
    return;
  }
  els.searchCount.textContent = `${active + 1} / ${matches.length}`;
  const html = matches.slice(0, 80).map((m, i) => {
    const len = m.len || query.length;
    let start = Math.max(0, m.idx - 36);
    const prevSpace = m.text.lastIndexOf(' ', start);
    if (prevSpace >= 0 && prevSpace > m.idx - 80) start = prevSpace + 1;
    const end = Math.min(m.text.length, m.idx + len + 60);
    const raw = m.text.slice(start, end);
    const local = m.idx - start;
    const snippet =
      (start > 0 ? '…' : '') +
      U.escapeHtml(raw.slice(0, local)) +
      '<mark>' +
      U.escapeHtml(raw.slice(local, local + len)) +
      '</mark>' +
      U.escapeHtml(raw.slice(local + len)) +
      (end < m.text.length ? '…' : '');
    return `<button class="search-result${i === active ? ' active' : ''}" data-idx="${i}">
      <span class="sr-page">p.${m.page}</span>
      <span class="sr-text">${snippet}</span>
    </button>`;
  });
  els.searchResults.innerHTML = html.join('');
}

async function focusMatch(i) {
  const m = state.search.matches[i];
  if (!m) return;
  state.search.active = i;
  if (m.page !== state.pageIndex + 1) {
    await goToPage(m.page);
  } else {
    renderOverlay();
  }
  renderSearchResults();
  updateHint();
  requestAnimationFrame(() => {
    const el = els.overlay.querySelector('.hit-active');
    el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  });
}

async function stepMatch(dir) {
  const { matches } = state.search;
  if (!matches.length) return;
  let i = state.search.active + dir;
  if (i < 0) i = matches.length - 1;
  if (i >= matches.length) i = 0;
  await focusMatch(i);
}

function openSearch() {
  if (!state.engine) return;
  els.searchbar.hidden = false;
  state.search.query = '';
  state.search.matches = [];
  state.search.active = -1;
  els.searchInput.focus();
  els.searchInput.select();
  if (els.searchInput.value.trim()) performSearch(els.searchInput.value);
  else renderSearchResults();
}

function closeSearch() {
  els.searchbar.hidden = true;
  els.searchResults.hidden = true;
  els.searchInput.value = '';
  state.search = { query: '', matches: [], active: -1 };
  renderOverlay();
  updateHint();
}

/* ─────────────────────────── Import / démo ─────────────────────────── */

async function openPdfBytes(bytes, name) {
  pushLoading('Ouverture du document…');
  const attempt = ++state.loadToken;
  try {
    const engine = new PdfEngine(bytes.slice());
    await engine.load();
    if (attempt !== state.loadToken) {
      engine.destroy();
      return;
    }
    if (state.ocr.running) {
      state.ocr.cancel = true;
      terminateOcr();
    }
    state.engine?.destroy();
    const token = ++state.docToken;
    closeExportModal();
    state.engine = engine;
    state.bytes = bytes;
    state.fileName = name || 'document.pdf';
    state.numPages = engine.numPages;
    state.pageIndex = 0;
    state.zoom = null;
    state.scale = 1;
    state.viewport = null;
    state.pages = new Map();
    state.edits = [];
    state.active = null;
    state.addMode = false;
    state.search = { query: '', matches: [], active: -1 };
    state.textIndexReady = false;
    state.ensuringAll = null;
    state.ocr = { running: false, cancel: false };
    els.stage.classList.remove('placing');
    els.searchbar.hidden = true;
    els.searchResults.hidden = true;
    els.searchInput.value = '';
    els.hintbar.hidden = false;
    closeExportMenu();
    document.title = `${U.baseName(state.fileName)} — PDF Studio`;
    document.body.classList.remove('no-doc');
    els.emptyState.hidden = true;
    els.stage.hidden = false;
    els.fileChip.hidden = false;
    els.pageInput.max = String(state.numPages);
    els.thumbCount.textContent = String(state.numPages);
    updateFileChip();
    updatePageNav();
    hideForm();
    renderEditList();
    updateExportUi();
    setTab('edit');
    buildThumbnails(token);
    await renderCurrent();
    els.canvasScroll.scrollTo({ top: 0, left: 0 });
    updatePanelsForPage();
    ensureAllLines().catch(() => {}); // indexation en arrière-plan
    toast(`« ${state.fileName} » ouvert${state.numPages > 1 ? ` — ${state.numPages} pages` : ''}.`, 'success', {
      duration: 2600,
    });
  } catch (err) {
    console.error(err);
    if (state.numPages === 0) {
      document.body.classList.add('no-doc');
      els.emptyState.hidden = false;
      els.stage.hidden = true;
    }
    const msg =
      err?.name === 'PasswordException'
        ? 'Ce PDF est protégé par mot de passe.'
        : err?.message || String(err);
    toast(`Impossible d’ouvrir le PDF — ${msg}`, 'error', { duration: 8000 });
  } finally {
    popLoading();
  }
}

async function handleFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    toast('Merci de choisir un fichier PDF.', 'warn');
    return;
  }
  try {
    pushLoading('Lecture du fichier…');
    const buf = await file.arrayBuffer();
    popLoading();
    await openPdfBytes(new Uint8Array(buf), file.name);
  } catch (err) {
    popLoading();
    console.error(err);
    toast('Lecture du fichier impossible.', 'error');
  }
}

async function openDemo(kind) {
  pushLoading(kind === 'scan' ? 'Création du scan d’exemple…' : 'Création du PDF d’exemple…');
  try {
    const bytes = kind === 'scan' ? await buildSampleScanPdf() : await buildSampleTextPdf();
    popLoading();
    await openPdfBytes(bytes, kind === 'scan' ? 'Facture — exemple scanné.pdf' : 'Rapport — exemple texte.pdf');
  } catch (err) {
    popLoading();
    console.error(err);
    toast('Impossible de créer l’exemple.', 'error');
  }
}

/* ─────────────────────────── Aperçu d'export ─────────────────────────── */

async function showExportModal({ kind, filename, blob, text }) {
  const token = ++modalToken;
  els.exportModal.hidden = false;
  els.exportModalTitle.textContent = kind === 'pdf' ? 'PDF généré' : 'Texte extrait';
  els.exportKind.textContent = kind === 'pdf' ? 'PDF' : 'TXT';
  els.exportFileName.textContent = filename;
  els.exportFileMeta.textContent = `${U.formatBytes(blob.size)}${
    kind === 'pdf' ? ' · prêt à télécharger' : ' · texte brut UTF-8'
  }`;
  if (modalUrl) URL.revokeObjectURL(modalUrl);
  modalUrl = URL.createObjectURL(blob);
  els.exportDownload.href = modalUrl;
  els.exportDownload.setAttribute('download', filename);
  els.exportTextBox.hidden = kind === 'pdf';
  els.exportCopyText.hidden = kind === 'pdf';
  els.exportPreviewWrap.hidden = kind !== 'pdf';
  const content = els.exportModal.querySelector('.modal-content');
  if (content) content.classList.toggle('single', kind !== 'pdf');
  els.exportCopyText.innerHTML = `${icon('copy', 16)}<span>Copier le texte</span>`;

  if (kind === 'pdf') {
    els.exportTextPreview.value = '';
    const canvas = els.exportPreview;
    try {
      const engine = new PdfEngine(new Uint8Array(await blob.arrayBuffer()));
      await engine.load();
      if (token !== modalToken) {
        engine.destroy();
        return;
      }
      const size = await engine.getPageSize(1);
      await engine.renderToCanvas(1, canvas, Math.min(2, 620 / size.width));
      engine.destroy();
    } catch (err) {
      console.warn('export preview', err);
    }
  } else {
    els.exportTextPreview.value = text || '';
  }
}

function closeExportModal() {
  els.exportModal.hidden = true;
  modalToken++;
}

/* ─────────────────────────── Export ─────────────────────────── */

function fileNameSuffix(includeEdits, includeOcr) {
  const parts = [];
  if (includeEdits && state.edits.length) parts.push('modifie');
  if (includeOcr) {
    const ocrPages = [...state.pages.values()].filter((p) => p.ocr).length;
    if (ocrPages) parts.push('ocr');
  }
  return parts.join('-') || 'copie';
}

function saveBytes(bytes, name, mime = 'application/pdf') {
  const blob = new Blob([bytes], { type: mime });
  U.downloadBlob(blob, name);
  toast(`« ${name} » généré.`, 'success', { duration: 6000 });
  showExportModal({ kind: mime === 'application/pdf' ? 'pdf' : 'txt', filename: name, blob });
}

function closeExportMenu() {
  els.exportMenu.hidden = true;
}

/**
 * Avertit l'utilisateur lorsque des caractères ne peuvent être dessinés par
 * aucune police embarquée, avant de lancer l'export.
 */
function confirmMissingGlyphs(missing) {
  return new Promise((resolve) => {
    const list = missing
      .slice(0, 8)
      .map((m) => `<code>${U.escapeHtml(m.char)}</code> (U+${m.char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
      .join(', ');
    const more = missing.length > 8 ? ` et ${missing.length - 8} autre(s)` : '';
    els.glyphText.innerHTML =
      `Ces caractères n'existent dans aucune des polices embarquées et seront remplacés par un carré vide : ` +
      `${list}${more}.<br />Vérifiez le texte ou choisissez une autre police.`;
    const done = (value) => {
      els.glyphDialog.removeEventListener('close', onClose);
      els.glyphCancel.removeEventListener('click', onCancel);
      els.glyphContinue.removeEventListener('click', onContinue);
      if (els.glyphDialog.open) els.glyphDialog.close();
      resolve(value);
    };
    const onClose = () => done(false);
    const onCancel = () => done(false);
    const onContinue = () => done(true);
    els.glyphDialog.addEventListener('close', onClose);
    els.glyphCancel.addEventListener('click', onCancel);
    els.glyphContinue.addEventListener('click', onContinue);
    els.glyphDialog.showModal();
  });
}

/** Rend une page du PDF source en canvas pour la rastérisation d'export. */
async function renderPageForExport(pageNo) {
  const size = await state.engine.getPageSize(pageNo);
  const scale = Math.min(3, 1800 / Math.max(1, size.width));
  const canvas = document.createElement('canvas');
  await state.engine.renderToCanvas(pageNo, canvas, Math.max(1, scale));
  return canvas;
}

async function handleExportPdf() {
  if (!state.engine) return;
  const includeEdits = els.expEdits.checked;
  const includeOcr = els.expOcr.checked;
  if (!includeEdits && !includeOcr) {
    toast('Sélectionnez au moins une option à exporter.', 'warn');
    return;
  }
  closeActive();
  const ocrPages = includeOcr
    ? [...state.pages.entries()].filter(([, p]) => p.ocr).map(([n, p]) => ({ pageNo: n, ocr: p.ocr }))
    : [];
  const edits = includeEdits ? state.edits : [];
  const redactMode = els.expRedact?.value || 'stream';

  pushLoading('Génération du PDF…');
  try {
    // 1. Vérification des caractères non dessinables (avertissement avant export)
    if (edits.length || ocrPages.length) {
      const analysis = await analyzeExport({ edits, ocrPages });
      if (analysis.missing?.length) {
        const cont = await confirmMissingGlyphs(analysis.missing);
        if (!cont) {
          popLoading();
          return;
        }
      }
    }

    // 2. Génération
    const result = await exportPdf({
      sourceBytes: state.bytes,
      edits,
      ocrPages,
      redactMode,
      renderPage: redactMode === 'raster' ? renderPageForExport : null,
    });
    const bytes = result.bytes;
    const suffix = fileNameSuffix(includeEdits, includeOcr);
    const name = `${U.baseName(state.fileName)}-${suffix}.pdf`;
    saveBytes(bytes, name);
    if (redactMode === 'stream' && result.stats?.removedPages?.length) {
      toast(
        `Texte d'origine retiré du flux sur ${result.stats.removedPages.length} page(s).`,
        'success',
        { duration: 3800 }
      );
    }
    closeExportMenu();
  } catch (err) {
    console.error(err);
    toast(`Export impossible — ${err?.message || err}`, 'error');
  } finally {
    popLoading();
  }
}

async function handleExportText() {
  if (!state.engine) return;
  pushLoading('Préparation du texte…');
  try {
    await ensureAllLines();
    const parts = [];
    for (let n = 1; n <= state.numPages; n++) {
      const { text } = getPageText(n);
      if (text.trim()) parts.push(`— Page ${n} —\n${text.trim()}`);
    }
    if (!parts.length) {
      toast('Aucun texte à exporter. Lancez l’OCR sur les pages scannées.', 'warn');
      return;
    }
    const blob = new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    const name = `${U.baseName(state.fileName)}.txt`;
    U.downloadBlob(blob, name);
    toast('Texte exporté (.txt).', 'success');
    showExportModal({ kind: 'txt', filename: name, blob, text: parts.join('\n\n') });
    closeExportMenu();
  } catch (err) {
    console.error(err);
    toast('Export du texte impossible.', 'error');
  } finally {
    popLoading();
  }
}

/* ─────────────────────────── Événements ─────────────────────────── */

function bindEvents() {
  // Fichier
  [els.btnOpen, els.btnEmptyOpen].forEach((b) => b.addEventListener('click', () => els.fileInput.click()));
  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    els.fileInput.value = '';
    if (file) handleFile(file);
  });
  els.btnDemoText.addEventListener('click', () => openDemo('text'));
  els.btnDemoScan.addEventListener('click', () => openDemo('scan'));

  // Drag & drop
  let dragDepth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    els.dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.dropOverlay.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    els.dropOverlay.hidden = true;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  });

  // Barre supérieure
  els.btnSearch.addEventListener('click', openSearch);
  els.btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.engine) return;
    els.exportMenu.hidden = !els.exportMenu.hidden;
    updateExportUi();
  });
  els.exportClose.addEventListener('click', closeExportMenu);
  els.btnExportPdf.addEventListener('click', handleExportPdf);
  els.btnExportText.addEventListener('click', handleExportText);
  els.exportModalClose.addEventListener('click', closeExportModal);
  els.exportModal.addEventListener('click', (e) => {
    if (e.target === els.exportModal) closeExportModal();
  });
  els.exportCopyText.addEventListener('click', async () => {
    const ok = await U.copyText(els.exportTextPreview.value || '');
    toast(ok ? 'Texte copié.' : 'Copie impossible.', ok ? 'success' : 'error', { duration: 2400 });
  });
  document.addEventListener('click', (e) => {
    if (!els.exportMenu.hidden && !e.target.closest('.export-wrap')) closeExportMenu();
    if (
      window.matchMedia('(max-width: 900px)').matches &&
      els.inspector.classList.contains('open') &&
      !e.target.closest('#inspector') &&
      !e.target.closest('.line-block') &&
      !e.target.closest('.edit-block') &&
      !e.target.closest('#btnInspectorToggle')
    ) {
      els.inspector.classList.remove('open');
    }
  });

  // Recherche
  const debouncedSearch = U.debounce((v) => performSearch(v), 220);
  els.searchInput.addEventListener('input', () => debouncedSearch(els.searchInput.value));
  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (els.searchInput.value.trim() && !state.search.matches.length) performSearch(els.searchInput.value);
      else stepMatch(e.shiftKey ? -1 : 1);
    }
  });
  els.searchClose.addEventListener('click', closeSearch);
  els.searchPrev.addEventListener('click', () => stepMatch(-1));
  els.searchNext.addEventListener('click', () => stepMatch(1));
  els.searchResults.addEventListener('click', (e) => {
    const b = e.target.closest('[data-idx]');
    if (b) focusMatch(Number(b.dataset.idx));
  });

  // Navigation
  els.btnPrev.addEventListener('click', () => goToPage(state.pageIndex));
  els.btnNext.addEventListener('click', () => goToPage(state.pageIndex + 2));
  els.pageInput.addEventListener('change', () => goToPage(parseInt(els.pageInput.value, 10) || 1));
  els.pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.pageInput.blur();
      goToPage(parseInt(els.pageInput.value, 10) || 1);
    }
  });
  els.btnZoomOut.addEventListener('click', () => {
    if (!state.engine) return;
    state.zoom = U.clamp(state.scale / 1.25, 0.2, 6);
    renderCurrent();
  });
  els.btnZoomIn.addEventListener('click', () => {
    if (!state.engine) return;
    state.zoom = U.clamp(state.scale * 1.25, 0.2, 6);
    renderCurrent();
  });
  els.btnFit.addEventListener('click', () => {
    state.zoom = null;
    renderCurrent();
  });
  els.zoomLabel.addEventListener('click', () => {
    state.zoom = null;
    renderCurrent();
  });
  els.thumbs.addEventListener('click', (e) => {
    const b = e.target.closest('.thumb');
    if (b) goToPage(Number(b.dataset.page));
  });

  // Onglets
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => setTab(t.dataset.tab));
  });
  els.btnInspectorToggle.addEventListener('click', () => els.inspector.classList.toggle('open'));

  // Édition
  els.btnAddText.addEventListener('click', startAddText);
  els.btnAddTextTop.addEventListener('click', startAddText);
  els.hintCancel.addEventListener('click', cancelAddMode);
  els.editList.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-id]');
    if (del) {
      e.stopPropagation();
      deleteEditById(del.dataset.delId);
      return;
    }
    const item = e.target.closest('[data-edit-id]');
    if (!item) return;
    const edit = state.edits.find((x) => x.id === item.dataset.editId);
    if (!edit) return;
    if (edit.page !== state.pageIndex + 1) await goToPage(edit.page);
    selectEdit(edit.id);
  });
  els.btnClearEdits.addEventListener('click', clearAllEdits);
  els.efText.addEventListener('input', onFormInput);
  els.efFont.addEventListener('change', onFormInput);
  els.efSize.addEventListener('input', onFormInput);
  els.efColor.addEventListener('input', onFormInput);
  els.efBg.addEventListener('input', onFormInput);
  els.efFit.addEventListener('change', onFormInput);
  els.efBold.addEventListener('click', () => {
    els.efBold.classList.toggle('active');
    onFormInput();
  });
  els.efItalic.addEventListener('click', () => {
    els.efItalic.classList.toggle('active');
    onFormInput();
  });
  els.efApply.addEventListener('click', () => closeActive());
  els.efClose.addEventListener('click', () => closeActive());
  els.efReset.addEventListener('click', resetActiveEdit);
  els.efText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      closeActive();
    }
  });

  // OCR
  els.btnOcrPage.addEventListener('click', () => {
    if (!state.engine || state.ocr.running) return;
    runOcr([state.pageIndex + 1]);
  });
  els.btnOcrAll.addEventListener('click', () => {
    if (!state.engine || state.ocr.running) return;
    runOcr(Array.from({ length: state.numPages }, (_, i) => i + 1));
  });
  els.btnOcrCancel.addEventListener('click', async () => {
    if (!state.ocr.running) return;
    state.ocr.cancel = true;
    els.ocrStatus.textContent = 'Annulation…';
    await terminateOcr();
  });
  els.btnCopyOcr.addEventListener('click', async () => {
    const ok = await U.copyText(els.ocrText.value || '');
    toast(ok ? 'Texte copié.' : 'Copie impossible.', ok ? 'success' : 'error', { duration: 2500 });
  });
  els.btnOcrFix.addEventListener('click', () => {
    const pd = getPageData(state.pageIndex + 1);
    if (!pd.ocr?.lines.length) {
      toast('Aucun bloc OCR sur cette page.', 'warn');
      return;
    }
    setTab('edit');
    openInspectorOnMobile();
    selectLine(pd.ocr.lines[0].id);
  });
  els.ocrPageChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (b) goToPage(Number(b.dataset.page));
  });

  // Texte
  els.btnCopyPageText.addEventListener('click', async () => {
    const ok = await U.copyText(els.pageText.value || '');
    toast(ok ? 'Texte de la page copié.' : 'Copie impossible.', ok ? 'success' : 'error', { duration: 2500 });
  });
  els.btnDownloadText.addEventListener('click', handleExportText);

  // Raccourcis
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearch();
      return;
    }
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      els.fileInput.click();
      return;
    }
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (state.engine) handleExportPdf();
      return;
    }
    if (e.key === 'Escape') {
      if (!els.exportModal.hidden) return closeExportModal();
      if (state.addMode) return cancelAddMode();
      if (!els.searchbar.hidden) return closeSearch();
      if (state.active) return closeActive();
      closeExportMenu();
      return;
    }
    if (typing || !state.engine) return;
    if (e.key === 'ArrowLeft') goToPage(state.pageIndex);
    else if (e.key === 'ArrowRight') goToPage(state.pageIndex + 2);
    else if (e.key === '+' || e.key === '=') {
      state.zoom = U.clamp(state.scale * 1.25, 0.2, 6);
      renderCurrent();
    } else if (e.key === '-') {
      state.zoom = U.clamp(state.scale / 1.25, 0.2, 6);
      renderCurrent();
    }
  });
}

/* ─────────────────────────── Démarrage ─────────────────────────── */

function init() {
  hydrateIcons();
  bindEvents();
  els.btnSearch.disabled = true;
  els.btnExport.disabled = true;
  updatePageNav();
  updateZoomLabel();
  hideForm();
  updateOcrButtons();
  renderEditList();
}

init();

// Exposé pour les tests automatisés
window.__pdfStudio = {
  state,
  openPdfBytes,
  getPageText,
  exportPdf,
};
