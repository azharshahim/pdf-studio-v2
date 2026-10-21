import './polyfills.js';
import './style.css';
import { PdfEngine, pdfRectToViewportRect, fontTraits } from './pdfEngine.js';
import { recognizeCanvas, terminateOcr } from './ocrEngine.js';
import { enhanceContrast, deskewCanvas } from './imagePrep.js';
import * as PageOps from './pageOps.js';
import { readFormFields, readFormWidgetsFromPage, fillFormFields, detectFillAreas } from './forms.js';
import { findMatch } from './search.js';
import { createHistory } from './history.js';
import { createUi } from './ui.js';
import { createInlineEditor } from './inlineEditor.js';
import { estimateOffsetFromFraction, offsetAtPoint } from './caretPoint.js';
import * as Session from './session.js';
import { CATALOG, BASE_FONTS, GROUP_LABELS, ensureCatalogFont } from './fonts.js';
import { isQuotaError } from './session.js';
import { describeBrowser, formatDiagnostic } from './diagnostic.js';
import { buildSampleTextPdf, buildSampleScanPdf } from './samples.js';
import { icon, hydrateIcons } from './icons.js';
import { applyLanguage, getLang, t } from './i18n.js';
import * as U from './utils.js';
import { initShell, routeTo, openSheet, closeSheet, isSheetOpen, isMobile, renderTools, showOnboarding } from './shell.js';
import { createMarkup, HIGHLIGHT_COLORS, STAMP_PRESETS } from './markup.js';
import { computeEditZoom, centerAxis } from './zoomView.js';
import {
  renderPagesGrid,
  estimateCompression,
  COMPRESS_LEVELS,
  WATERMARK_PRESETS,
  toolHeader,
  progressMarkup,
} from './tools.js';
import {
  createSignaturePad,
  typedSignature,
  removeLightBackground,
  signatureSheetHtml,
  loadStamps,
  saveStamp,
  deleteStamp,
  loadSignerName,
  saveSignerName,
  loadSignatures,
  saveSignature,
  deleteSignature,
  SIGNATURE_FONTS,
} from './signature.js';

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
  expQuality: $('expQuality'),
  btnExportPng: $('btnExportPng'),
  btnExportJpg: $('btnExportJpg'),
  btnUndo: $('btnUndo'),
  btnRedo: $('btnRedo'),
  resumeDialog: $('resumeDialog'),
  confirmDialog: $('confirmDialog'),
  confirmTitle: $('confirmTitle'),
  confirmText: $('confirmText'),
  confirmOk: $('confirmOk'),
  confirmCancel: $('confirmCancel'),
  resumeText: $('resumeText'),
  resumeYes: $('resumeYes'),
  resumeNo: $('resumeNo'),
  passwordDialog: $('passwordDialog'),
  passwordForm: $('passwordForm'),
  passwordInput: $('passwordInput'),
  passwordError: $('passwordError'),
  passwordCancel: $('passwordCancel'),
  glyphDialog: $('glyphDialog'),
  glyphText: $('glyphText'),
  glyphCancel: $('glyphCancel'),
  glyphContinue: $('glyphContinue'),
  expOcrCount: $('expOcrCount'),
  btnExportPdf: $('btnExportPdf'),
  annobar: $('annobar'),
  annoTools: $('annoTools'),
  annoSub: $('annoSub'),
  btnSave: $('btnSave'),
  editSave: $('editSave'),
  saveAsPdf: $('saveAsPdf'),
  saveAsOcr: $('saveAsOcr'),
  saveAsText: $('saveAsText'),
  saveAsPng: $('saveAsPng'),
  saveAsJpg: $('saveAsJpg'),
  exportShare: $('exportShare'),
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
  langSelect: $('langSelect'),
  canvasScroll: $('canvasScroll'),
  btnTheme: $('btnTheme'),
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
  btnAddText: $('btnAddText'),
  editbar: $('editbar'),
  editDone: $('editDone'),
  editTitle: $('editTitle'),
  editUndo: $('editUndo'),
  editRedo: $('editRedo'),
  editbarCount: $('editbarCount'),
  formatbar: $('formatbar'),
  fmtSize: $('fmtSize'),
  fmtFont: $('fmtFont'),
  docDock: $('docDock'),
  btnDocMenu: $('btnDocMenu'),
  btnShare: $('btnShare'),
  btnBack: $('btnBack'),
  editBack: $('editBack'),
  editShare: $('editShare'),
  fmtColorBtn: $('fmtColorBtn'),
  fmtSwatch: $('fmtSwatch'),
  fmtColorPop: $('fmtColorPop'),
  fmtColorGrid: $('fmtColorGrid'),
  fmtColorInput: $('fmtColorInput'),
  fmtMore: $('fmtMore'),
  fmtMorePop: $('fmtMorePop'),
  fmtLineHeight: $('fmtLineHeight'),
  fmtDuplicate: $('fmtDuplicate'),
  fmtDelete: $('fmtDelete'),
  ocrLang: $('ocrLang'),
  ocrContrast: $('ocrContrast'),
  ocrDeskew: $('ocrDeskew'),
  efConfidence: $('efConfidence'),
  pgCurrent: $('pgCurrent'),
  pgTotal: $('pgTotal'),
  pgRange: $('pgRange'),
  btnRotateLeft: $('btnRotateLeft'),
  btnRotateRight: $('btnRotateRight'),
  btnMoveUp: $('btnMoveUp'),
  btnMoveDown: $('btnMoveDown'),
  btnDeletePage: $('btnDeletePage'),
  btnInsertBlank: $('btnInsertBlank'),
  btnExtractPages: $('btnExtractPages'),
  btnSplitPages: $('btnSplitPages'),
  btnMergePdf: $('btnMergePdf'),
  mergeInput: $('mergeInput'),
  tabForm: $('tabForm'),
  formFields: $('formFields'),
  formFlatten: $('formFlatten'),
  btnFillExport: $('btnFillExport'),
  discardDialog: $('discardDialog'),
  discardOk: $('discardOk'),
  discardCancel: $('discardCancel'),
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
  homeOpen: $('homeOpen'),
  homeResume: $('homeResume'),
  homeDemoText: $('homeDemoText'),
  homeDemoScan: $('homeDemoScan'),
  homeRecent: $('homeRecent'),
  homeRecentWrap: $('homeRecentWrap'),
  filesOpen: $('filesOpen'),
  filesBrowse: $('filesBrowse'),
  diagToggle: $('diagToggle'),
  diagBadge: $('diagBadge'),
  filesTotal: $('filesTotal'),
  filesRefresh: $('filesRefresh'),
  filesList: $('filesList'),
  filesCount: $('filesCount'),
  filesEmpty: $('filesEmpty'),
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

// Helpers d'interface (toasts, chargement, dialogues)
const ui = createUi(els);
const { toast, pushLoading, popLoading, confirmMissingGlyphs, askPassword, askConfirm } = ui;

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
  history: createHistory(),
  hash: null,
  autosaveTimer: null,
  restoring: false,
  formFields: [],
  formValues: {},
};

/* ─────────────────────── Édition directe sur la page ─────────────────────── */

const inline = createInlineEditor({
  overlay: els.overlay,
  getScale: () => state.scale || 1,
  rectFor: (bbox) => pdfRectToViewportRect(bbox, state.viewport),
  onChange: () => onInlineChange(),
  onCommit: () => closeActive(),
  onDelete: () => deleteActiveEdit(),
  onDuplicate: () => duplicateActiveEdit(),
});

const markup = createMarkup({
  overlay: els.overlay,
  getScale: () => state.scale || 1,
  rectFor: (bbox) => pdfRectToViewportRect(bbox, state.viewport),
  pageHeight: () => state.viewport?.height || 842,
  getPage: () => state.pageIndex + 1,
  onChange: () => {
    pushMarkupHistory();
    updateExportUi();
    scheduleAutosave();
  },
  onPickNote: (obj) => editNote(obj),
});

/** Historique dédié aux annotations (annulable indépendamment du texte). */
const markupHistory = { stack: [], index: -1 };

function pushMarkupHistory() {
  const snapshot = JSON.stringify(markup.objects);
  if (markupHistory.stack[markupHistory.index] === snapshot) return;
  markupHistory.stack = markupHistory.stack.slice(0, markupHistory.index + 1);
  markupHistory.stack.push(snapshot);
  markupHistory.index = markupHistory.stack.length - 1;
  if (markupHistory.stack.length > 80) {
    markupHistory.stack.shift();
    markupHistory.index--;
  }
  updateAnnoUndo();
}

function undoMarkup() {
  if (markupHistory.index <= 0) return;
  markupHistory.index--;
  markup.setObjects(JSON.parse(markupHistory.stack[markupHistory.index]));
  scheduleAutosave();
  updateAnnoUndo();
}

function redoMarkup() {
  if (markupHistory.index >= markupHistory.stack.length - 1) return;
  markupHistory.index++;
  markup.setObjects(JSON.parse(markupHistory.stack[markupHistory.index]));
  scheduleAutosave();
  updateAnnoUndo();
}

function updateAnnoUndo() {
  const btn = document.getElementById('annoUndo');
  if (btn) btn.disabled = markupHistory.index <= 0;
}

/* ─────────────────────────── UI helpers ─────────────────────────── */

let modalUrl = null;
let modalToken = 0;


function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
    t.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.panel').forEach((p) => {
    const active = p.dataset.panel === name;
    p.classList.toggle('active', active);
    p.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
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
  if (state.active) closeActive();
  const token = ++state.renderToken;
  const n = state.pageIndex + 1;

  const page = await state.engine.getPage(n);
  if (token !== state.renderToken) return;

  const base = page.getViewport({ scale: 1 });
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const gutter = narrow ? 16 : 56;
  const availW = Math.max(280, els.canvasScroll.clientWidth - gutter);
  const availH = Math.max(240, els.canvasScroll.clientHeight - gutter);
  let scale =
    state.zoom == null
      ? narrow
        ? Math.min(availW / base.width, 2)
        : Math.min(availW / base.width, availH / base.height, 1.6)
      : state.zoom;
  scale = U.clamp(scale, 0.15, 6);
  state.scale = scale;

  const vp = page.getViewport({ scale });
  state.viewport = vp;
  markup.attachViewport(vp);

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
  if (els.pgCurrent) els.pgCurrent.textContent = has ? state.pageIndex + 1 : 0;
  if (els.pgTotal) els.pgTotal.textContent = has ? state.numPages : 0;
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
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => {
      btn.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(n));
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      els.thumbs.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    });
    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      btn.classList.add('drop-target');
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drop-target'));
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('drop-target');
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (!from || from === n) return;
      applyPageOp('Réorganisation des pages…', () => PageOps.movePage(state.bytes, from, n), n);
    });
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
    // rendu à la taille réelle du cadre (netteté sur écrans HiDPI)
    const targetW = Math.max(120, frame.clientWidth || 172);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    await state.engine.renderToCanvas(n, canvas, targetW / size.width, dpr);
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

function clearOverlay() {
  for (const child of [...els.overlay.children]) {
    if (child.classList.contains('inline-shell')) continue;
    child.remove();
  }
}

/* ───────── Barre d'outils du document ───────── */

/** Actions de la barre : valide d'abord le texte en cours, puis lance l'outil. */
function dockAction(id) {
  if (!state.engine) return;
  if (id === 'more') {
    closeActive();
    routeTo('tools');
    return;
  }
  closeActive();
  if (state.addMode && id !== 'text') cancelAddMode();
  switch (id) {
    case 'edit':
      closeAnnotate?.();
      toast(t('dock.editHint'), 'info', { duration: 3200 });
      break;
    case 'text':
      startAddText();
      break;
    case 'comment':
      openAnnotate();
      activateAnnoTool('note');
      break;
    case 'highlight':
      openAnnotate();
      activateAnnoTool('highlight');
      break;
    case 'draw':
      openAnnotate();
      activateAnnoTool('ink');
      break;
    case 'sign':
      openSignTool();
      break;
    case 'stamp':
      openStampTool();
      break;
    case 'form':
      openFormTool();
      break;
    case 'pages':
    case 'ocr':
      openTool(id);
      break;
    default:
  }
  updateDock();
}

function updateDock() {
  const dock = els.docDock;
  if (!dock) return;
  const form = document.getElementById('dockForm');
  if (form) form.hidden = !state.formFields?.length;
  dock.querySelectorAll('[data-dock]').forEach((b) => {
    const id = b.dataset.dock;
    const active =
      (id === 'text' && state.addMode) ||
      (id === 'edit' && !state.addMode && !document.body.classList.contains('annotating'));
    b.classList.toggle('active', active);
  });
}

function bindDock() {
  const dock = els.docDock;
  if (!dock) return;
  // L'action part au relâchement du doigt (pas sur `click`) : WebKit (Safari,
  // iPhone) peut ne pas envoyer de `click` quand le focus du texte bouge, et
  // un `preventDefault` sur `pointerdown` y supprime parfois le clic. Un
  // déplacement > 10 px (défilement horizontal de la barre) n'est pas un appui.
  let press = null;
  let lastFired = 0;
  let swallowNext = false;
  const fire = (btn) => {
    lastFired = Date.now();
    swallowNext = true;
    dockAction(btn.dataset.dock);
  };
  // Le `click` qui suit l'appui tombe sur ce qui vient de s'ouvrir (fond de la
  // feuille, par exemple) et le refermerait aussitôt : on avale ce seul clic.
  // Un nouvel appui (autre `pointerdown`) annule la consigne.
  document.addEventListener(
    'pointerdown',
    () => {
      swallowNext = false;
    },
    true
  );
  document.addEventListener(
    'click',
    (ev) => {
      if (swallowNext && Date.now() - lastFired < 450 && !ev.target.closest('#docDock')) {
        swallowNext = false;
        ev.stopPropagation();
        ev.preventDefault();
      }
    },
    true
  );
  dock.addEventListener('pointerdown', (ev) => {
    const btn = ev.target.closest('[data-dock]');
    press = btn ? { btn, x: ev.clientX, y: ev.clientY, id: ev.pointerId } : null;
  });
  dock.addEventListener('pointerup', (ev) => {
    if (!press || press.id !== ev.pointerId) return;
    const { btn, x, y } = press;
    press = null;
    if (Math.hypot(ev.clientX - x, ev.clientY - y) > 10) return;
    if (!btn.contains(ev.target) && ev.target !== btn) return;
    fire(btn);
  });
  dock.addEventListener('pointercancel', () => {
    press = null;
  });
  // Clavier / lecteur d'écran : `click` sans pointeur ; on ignore le clic qui suit un appui déjà traité.
  dock.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-dock]');
    if (!btn || Date.now() - lastFired < 600) return;
    fire(btn);
  });
  updateDock();
}

/* ───────── Retour ───────── */

let routeBeforeDoc = 'files';

/**
 * Retour : valide le texte en cours, enregistre le travail, puis revient à
 * l'écran précédent (Fichiers ou Accueil). Le document reste ouvert.
 */
async function goBack() {
  closeActive();
  if (document.body.classList.contains('annotating')) closeAnnotate();
  flushSession();
  routeTo(routeBeforeDoc || 'files');
}

/* ───────── Menu ⋮ du document ───────── */

/** Génère le PDF courant (modifications, OCR, annotations) sans le télécharger. */
async function buildCurrentPdf() {
  closeActive();
  const { exportPdf } = await import('./exporter.js');
  const result = await exportPdf({
    sourceBytes: state.bytes,
    edits: state.edits,
    ocrPages: collectOcrForSession(),
    redactMode: 'stream',
    renderPage: null,
    objects: markup.objects,
  });
  return new Blob([result.bytes], { type: 'application/pdf' });
}

function docFileName(suffix = '') {
  const base = U.baseName(state.fileName || 'document.pdf');
  return `${base}${suffix}.pdf`;
}

async function shareCurrentPdf() {
  pushLoading(t('save.working'));
  try {
    const blob = await buildCurrentPdf();
    popLoading();
    await shareBlob(blob, docFileName('-modifie'));
  } catch (err) {
    console.error(err);
    popLoading();
    toast(t('save.error'), 'error');
  }
}

async function printCurrentPdf() {
  pushLoading(t('save.working'));
  let url = null;
  try {
    const blob = await buildCurrentPdf();
    url = URL.createObjectURL(blob);
    popLoading();
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
    frame.src = url;
    let done = false;
    const fallback = () => {
      if (done) return;
      done = true;
      toast(t('menu.printFail'), 'info', { duration: 5000 });
      window.open(url, '_blank', 'noopener');
    };
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        done = true;
      } catch {
        fallback();
      }
    });
    document.body.appendChild(frame);
    // Certains navigateurs mobiles n'affichent pas le PDF dans un cadre caché.
    setTimeout(fallback, 4000);
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 120000);
  } catch (err) {
    console.error(err);
    popLoading();
    toast(t('save.error'), 'error');
  }
}

function openDocMenu() {
  if (!state.engine) return;
  const items = [
    { id: 'save', icon: 'save', title: 'menu.save', hint: 'menu.saveHint' },
    { id: 'export', icon: 'download', title: 'menu.export', hint: 'menu.exportHint' },
    { id: 'download', icon: 'download', title: 'menu.download', hint: 'menu.downloadHint' },
    { id: 'share', icon: 'share', title: 'menu.share', hint: 'menu.shareHint' },
    { id: 'print', icon: 'printer', title: 'menu.print', hint: 'menu.printHint' },
    { id: 'compress', icon: 'compress', title: 'menu.compress', hint: 'menu.compressHint' },
    { id: 'convert', icon: 'convert', title: 'menu.convert', hint: 'menu.convertHint' },
    { id: 'password', icon: 'lock', title: 'menu.password', hint: 'menu.passwordHint' },
    { id: 'search', icon: 'search', title: 'menu.search', hint: 'menu.searchHint' },
  ];
  const rows = items
    .map(
      (it) => `<button class="sheet-row" data-doc-menu="${it.id}" type="button">
        <span class="sheet-row-icon">${icon(it.icon, 19)}</span>
        <span class="sheet-row-text"><strong>${t(it.title)}</strong><span>${t(it.hint)}</span></span>
        ${icon('chevronRight', 16)}
      </button>`
    )
    .join('');
  const body = openSheet({
    title: U.baseName(state.fileName || t('menu.title')),
    html: `<div class="sheet-list">${rows}</div>`,
    className: 'doc-menu',
  });
  body?.querySelectorAll('[data-doc-menu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.docMenu;
      closeSheet();
      // Laisse la feuille se fermer avant d'ouvrir l'action suivante.
      setTimeout(() => {
        if (id === 'save') handleSave();
        else if (id === 'download') downloadModifiedPdf();
        else if (id === 'export') els.btnExport.click();
        else if (id === 'share') shareCurrentPdf();
        else if (id === 'print') printCurrentPdf();
        else if (id === 'compress') openCompressTool();
        else if (id === 'convert') openConvertTool();
        else if (id === 'password') openProtectTool();
        else if (id === 'search') openSearch();
      }, 260);
    });
  });
}

const fontsRendered = new Set();

/** Remplit la liste des polices : polices de base, puis le catalogue par famille. */
function populateFontSelect() {
  if (!els.fmtFont) return;
  const opt = (id, label) => `<option value="${U.escapeHtml(id)}">${U.escapeHtml(label)}</option>`;
  let html = `<optgroup label="PDF">${BASE_FONTS.map((f) => opt(f.id, f.label)).join('')}</optgroup>`;
  for (const [group, label] of Object.entries(GROUP_LABELS)) {
    const items = CATALOG.filter((c) => c.group === group);
    if (items.length) html += `<optgroup label="${label}">${items.map((c) => opt(c.id, c.label)).join('')}</optgroup>`;
  }
  els.fmtFont.innerHTML = html;
}

function renderOverlay() {
  if (!state.engine || !state.viewport) return;
  clearOverlay();
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

  markup.render();
  renderFormOverlay();

  // Blocs modifiés / ajoutés (le bloc en cours d'édition est rendu par l'éditeur)
  for (const e of pageEdits) {
    if (e.id === activeId) continue;
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

    if (e.font) ensureCatalogFont(e.font).then((ok) => ok && !fontsRendered.has(e.font) && (fontsRendered.add(e.font), renderOverlay()));
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

/* ─────────── Curseur au point touché (avant tout re-rendu) ─────────── */

/**
 * Dernier contact mémorisé : coordonnées écran + cible. Les coordonnées sont
 * relevées sur `pointerdown`, avant l'ouverture du bloc éditable et avant le
 * zoom, puis converties en index de caractère au moment du clic.
 */
const pendingPointer = { point: null, key: null, word: false, at: 0 };
let longPressTimer = 0;
let longPressOrigin = null;
let suppressClickUntil = 0;

function clearLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = 0;
  longPressOrigin = null;
}

/** Police du bloc superposé, identique à celle de l'éditeur en place. */
function caretFontFor({ font, size, bold, italic }) {
  const scale = state.scale || 1;
  return {
    fontFamily: U.cssFontFamily(font),
    fontSize: `${Math.max(4, (Number(size) || 12) * scale)}px`,
    fontWeight: bold ? '700' : '400',
    fontStyle: italic ? 'italic' : 'normal',
    lineHeight: '1.16',
    letterSpacing: 'normal',
  };
}

/**
 * Convertit un point de l'écran en index de caractère dans `text`.
 * Renvoie `null` quand aucune information fiable n'est disponible : l'éditeur
 * retombe alors sur son comportement par défaut (fin de ligne).
 */
function caretFromPoint(point, el, { text, font, size, bold, italic }) {
  if (!point || !el || !text) return null;
  const measured = el.querySelector?.('.edit-text') || el;
  const rect = measured.getBoundingClientRect();
  if (!rect.width) return null;
  const descriptor = caretFontFor({ font, size, bold, italic });
  const offset = offsetAtPoint({ x: point.x, y: point.y, text, rect, font: descriptor });
  if (offset == null) {
    const fraction = (point.x - rect.left) / rect.width;
    return { offset: estimateOffsetFromFraction(text, fraction), word: pendingPointer.word };
  }
  return { offset, word: pendingPointer.word };
}

/** Curseur pour l'élément de ligne touché, si le contact le concernait. */
function caretForElement(el, payload) {
  const key = el.dataset.lineId || el.dataset.editId || null;
  if (!key || key !== pendingPointer.key || !pendingPointer.point) return null;
  return caretFromPoint(pendingPointer.point, el, payload);
}

els.overlay.addEventListener(
  'pointerdown',
  (ev) => {
    const el = ev.target.closest('.line-block, .edit-block');
    if (!el || !state.engine) {
      pendingPointer.point = null;
      pendingPointer.key = null;
      clearLongPress();
      return;
    }
    // Mémorisé ici : les coordonnées du doigt restent valables même si le
    // bloc est redessiné (zoom) avant l'ouverture du champ.
    pendingPointer.point = { x: ev.clientX, y: ev.clientY };
    pendingPointer.key = el.dataset.lineId || el.dataset.editId || null;
    pendingPointer.word = false;
    pendingPointer.at = performance.now();
    clearLongPress();
    if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;
    longPressOrigin = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    longPressTimer = setTimeout(() => {
      longPressTimer = 0;
      if (!longPressOrigin) return;
      pendingPointer.word = true;
      pendingPointer.point = { x: longPressOrigin.x, y: longPressOrigin.y };
      suppressClickUntil = performance.now() + 1500;
      navigator.vibrate?.(8);
      if (el.classList.contains('line-block')) selectLine(el.dataset.lineId);
      else selectEdit(el.dataset.editId);
    }, 480);
  },
  true
);

els.overlay.addEventListener('pointermove', (ev) => {
  if (!longPressOrigin) return;
  // Un simple frôlement ne doit pas transformer le toucher en appui long.
  if (Math.hypot(ev.clientX - longPressOrigin.x, ev.clientY - longPressOrigin.y) > 10) clearLongPress();
});

els.overlay.addEventListener('pointerup', clearLongPress);
els.overlay.addEventListener('pointercancel', clearLongPress);
els.overlay.addEventListener('contextmenu', (ev) => {
  // L'appui long est déjà géré : on ne laisse pas le menu natif interrompre.
  if (ev.target.closest('.line-block, .edit-block, .inline-shell')) ev.preventDefault();
});

els.overlay.addEventListener('click', async (ev) => {
  if (!state.engine) return;
  if (performance.now() < suppressClickUntil) return;
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

/* ─────────────────────── Édition directe ─────────────────────── */

const COLOR_PRESETS = [
  '#111827', '#ffffff', '#6b7280', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#0ea5e9', '#4f46e5', '#a855f7', '#ec4899', '#78350f',
];

function normalizeHexColor(value, fallback = '#111827') {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value;
  if (typeof value === 'string' && /^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split('').map((c) => c + c).join('')}`;
  }
  return fallback;
}

function buildColorGrid() {
  if (!els.fmtColorGrid || els.fmtColorGrid.childElementCount) return;
  for (const color of COLOR_PRESETS) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'color-dot';
    dot.style.background = color;
    dot.dataset.color = color;
    dot.setAttribute('aria-label', color);
    dot.addEventListener('click', () => {
      applyFormat((e) => {
        e.color = color;
      });
      closeFormatPops();
    });
    els.fmtColorGrid.appendChild(dot);
  }
}

function syncFormatbar() {
  const e = state.active?.edit;
  if (!e || !els.formatbar) return;
  els.fmtSize.textContent = String(Math.round(Number(e.size) || 12));
  if (els.fmtFont) els.fmtFont.value = e.font || 'Helvetica';
  if (els.fmtSwatch) els.fmtSwatch.style.background = e.color || '#111827';
  if (els.fmtColorInput) els.fmtColorInput.value = normalizeHexColor(e.color);
  if (els.fmtLineHeight) {
    els.fmtLineHeight.textContent = (Number(e.lineHeight) || 1.16).toFixed(2).replace('.', ',');
  }
  document.querySelectorAll('[data-fmt]').forEach((btn) => {
    btn.classList.toggle('active', !!e[btn.dataset.fmt]);
  });
  document.querySelectorAll('[data-align]').forEach((btn) => {
    btn.classList.toggle('active', (e.align || 'left') === btn.dataset.align);
  });
}

function applyFormat(mutator) {
  const e = state.active?.edit;
  if (!e) return;
  mutator(e);
  inline.refresh();
  syncFormatbar();
  onInlineChange();
  scheduleAutosave();
}

function closeFormatPops() {
  if (els.fmtColorPop) els.fmtColorPop.hidden = true;
  if (els.fmtMorePop) els.fmtMorePop.hidden = true;
}

function showFormatbar() {
  if (!els.formatbar) return;
  buildColorGrid();
  els.formatbar.hidden = false;
  closeFormatPops();
  syncFormatbar();
  updateKeyboardInset();
  const row = els.formatbar.querySelector('.formatbar-row');
  if (row) row.scrollLeft = 0;
}

function hideFormatbar() {
  if (!els.formatbar) return;
  els.formatbar.hidden = true;
  closeFormatPops();
}

function updateKeyboardInset() {
  const vv = window.visualViewport;
  let inset = 0;
  if (vv) inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--kb-offset', `${Math.round(inset)}px`);
}

function bindFormatbar() {
  if (!els.formatbar) return;
  // Garde le focus et la sélection dans le bloc éditable.
  els.formatbar.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) ev.preventDefault();
  });

  els.formatbar.querySelectorAll('[data-fmt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.fmt;
      applyFormat((e) => {
        e[key] = !e[key];
      });
    });
  });

  els.formatbar.querySelectorAll('[data-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyFormat((e) => {
        const next = Math.round((Number(e.size) || 12) + Number(btn.dataset.size));
        e.size = U.clamp(next, 4, 200);
      });
    });
  });

  populateFontSelect();
  bindDock();
  els.btnDocMenu?.addEventListener('click', openDocMenu);
  els.btnShare?.addEventListener('click', () => shareCurrentPdf());
  els.editShare?.addEventListener('click', () => shareCurrentPdf());
  els.btnBack?.addEventListener('click', goBack);
  els.editBack?.addEventListener('click', goBack);
  els.fmtFont?.addEventListener('change', () => {
    const value = els.fmtFont.value;
    // Charge la police avant de l'appliquer : l'aperçu et les mesures doivent
    // correspondre à l'export.
    ensureCatalogFont(value).finally(() => {
      applyFormat((e) => {
        e.font = value;
      });
      renderOverlay();
    });
  });

  document.querySelectorAll('[data-align]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyFormat((e) => {
        e.align = btn.dataset.align;
      });
    });
  });

  els.fmtColorBtn?.addEventListener('click', () => {
    if (!els.fmtColorPop) return;
    const open = els.fmtColorPop.hidden;
    closeFormatPops();
    els.fmtColorPop.hidden = !open;
  });

  els.fmtColorInput?.addEventListener('input', () => {
    const color = normalizeHexColor(els.fmtColorInput.value);
    applyFormat((e) => {
      e.color = color;
    });
  });

  els.fmtMore?.addEventListener('click', () => {
    if (!els.fmtMorePop) return;
    const open = els.fmtMorePop.hidden;
    closeFormatPops();
    els.fmtMorePop.hidden = !open;
  });

  els.formatbar.querySelectorAll('[data-lh]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyFormat((e) => {
        const next = (Number(e.lineHeight) || 1.16) + Number(btn.dataset.lh);
        e.lineHeight = U.clamp(Math.round(next * 100) / 100, 0.8, 2.6);
      });
    });
  });

  els.fmtDuplicate?.addEventListener('click', () => {
    closeFormatPops();
    duplicateActiveEdit();
  });
  els.fmtDelete?.addEventListener('click', () => {
    closeFormatPops();
    deleteActiveEdit();
  });
}

function showEditingUi() {
  const e = state.active?.edit;
  if (!e) return;
  document.body.classList.add('editing');
  if (els.editbar) els.editbar.hidden = false;
  if (els.editTitle) {
    els.editTitle.textContent = e.kind === 'add' ? t('editbar.addTitle') : t('editbar.title');
  }
  updateEditbarCount();
  updateHistoryButtons();
  showFormatbar();
}

function hideEditingUi() {
  document.body.classList.remove('editing');
  if (els.editbar) els.editbar.hidden = true;
  hideFormatbar();
}

function updateEditbarCount() {
  if (!els.editbarCount) return;
  const n = state.edits.length;
  els.editbarCount.textContent = String(n);
  els.editbarCount.hidden = n === 0;
}

function updateHistoryButtons() {
  const canUndo = state.history.canUndo();
  const canRedo = state.history.canRedo();
  if (els.btnUndo) els.btnUndo.disabled = !canUndo;
  if (els.btnRedo) els.btnRedo.disabled = !canRedo;
  if (els.editUndo) els.editUndo.disabled = !canUndo;
  if (els.editRedo) els.editRedo.disabled = !canRedo;
}

const refreshTextEcho = U.debounce(() => {
  updateTextPanel();
}, 200);

function onInlineChange() {
  inline.refresh();
  updateEditbarCount();
  updateExportUi();
  refreshTextEcho();
}

function editSignature(e) {
  return JSON.stringify([
    e.text,
    e.font,
    e.size,
    !!e.bold,
    !!e.italic,
    !!e.underline,
    e.align || 'left',
    Number(e.lineHeight) || 1.16,
    e.color,
    e.bg,
    e.fit,
  ]);
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
    underline: false,
    align: 'left',
    lineHeight: 1.16,
    color: fg,
    bg,
    fit: false,
    confidence: typeof line.confidence === 'number' ? line.confidence : undefined,
  };
}

/* ─────────────── Zoom d'édition et retour à la vue précédente ─────────────── */

/** Hauteur du clavier virtuel (px), exposée par --kb-offset. */
function keyboardInset() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--kb-offset');
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Mémorise zoom et position de défilement avant d'ouvrir une ligne.
 * Chaque capture reçoit un jeton : une fermeture asynchrone (le rendu au Zoom
 * précédent prend quelques dizaines de ms) ne peut pas écraser la capture
 * d'une édition ouverte entre-temps.
 */
let editViewSnapshot = null;
let editViewSeq = 0;

function captureEditView() {
  if (!state.engine) {
    editViewSnapshot = null;
    return null;
  }
  editViewSeq += 1;
  editViewSnapshot = {
    token: editViewSeq,
    zoom: state.zoom,
    left: els.canvasScroll.scrollLeft,
    top: els.canvasScroll.scrollTop,
  };
  return editViewSnapshot.token;
}

/** Revient exactement au zoom et au défilement d'avant l'édition. */
async function restoreEditView(token = null) {
  const snap = editViewSnapshot;
  if (!snap) return;
  if (token != null && snap.token !== token) return; // vue déjà remplacée
  editViewSnapshot = null;
  if (!state.engine || state.active) return;
  const sameZoom = (snap.zoom ?? null) === (state.zoom ?? null);
  if (!sameZoom) {
    state.zoom = snap.zoom;
    await renderCurrent();
    // Un autre bloc a pu être ouvert pendant le rendu : sa capture prime.
    if (editViewSnapshot && editViewSnapshot.token !== snap.token) return;
  }
  const apply = () => els.canvasScroll.scrollTo({ left: snap.left, top: snap.top, behavior: 'auto' });
  apply();
  requestAnimationFrame(apply);
  // Le défilement d'un navigateur mobile se stabilise après le rendu.
  setTimeout(apply, 120);
}

/**
 * Cadre la ligne touchée : texte lisible (≈16 px), ligne centrée horizontalement
 * quand elle tient, sinon on aligne son début sans jamais le couper ; centrage
 * vertical dans la zone encore visible au-dessus du clavier.
 */
async function zoomForLine(line) {
  if (!state.scale) return false;
  const viewW = els.canvasScroll.clientWidth;
  const target = computeEditZoom({
    fontSize: line.fontSize,
    scale: state.scale,
    mobile: isMobile(),
    maxZoom: 3,
    fits: line.bbox.w * state.scale <= viewW - 28,
  });
  if (!target) return false;
  state.zoom = target;
  await renderCurrent();
  return true;
}

/** Centre la vue sur une ligne (appelé après le zoom, avant l'ouverture du champ). */
function focusLineInView(line) {
  const scroller = els.canvasScroll;
  if (!scroller || !state.viewport || !els.stage) return;
  const rect = pdfRectToViewportRect(line.bbox, state.viewport);
  const view = scroller.getBoundingClientRect();
  const stage = els.stage.getBoundingClientRect();
  const left = scroller.scrollLeft + (stage.left - view.left) + rect.left;
  const top = scroller.scrollTop + (stage.top - view.top) + rect.top;
  const usableH = Math.max(
    120,
    view.height - keyboardInset() - (document.body.classList.contains('editing') ? 78 : 12)
  );
  const margin = 14;
  const targetLeft = centerAxis({ start: left, size: rect.width, view: view.width, margin });
  const targetTop = centerAxis({ start: top, size: rect.height, view: usableH, margin: 0 });
  scroller.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' });
}

async function selectLine(lineId) {
  const pageNo = state.pageIndex + 1;
  const line = editLinesForPage(pageNo).find((l) => l.id === lineId);
  if (!line) return;
  // Le point touché a été mémorisé avant le zoom : on le convertit ici, sur la
  // géométrie encore affichée, en index de caractère de la ligne d'origine.
  const blockEl = els.overlay.querySelector(`.line-block[data-line-id="${CSS.escape(lineId)}"]`);
  const caret = caretForElement(blockEl || { dataset: {} }, {
    text: line.text,
    font: line.font,
    size: line.fontSize,
    bold: line.bold,
    italic: line.italic,
  });
  if (state.active) closeActive({ restore: false });
  const viewToken = captureEditView();
  await zoomForLine(line);
  focusLineInView(line);
  const before = U.clone(state.edits);
  const edit = makeEditFromLine(line, pageNo);
  state.edits.push(edit);
  state.active = {
    edit,
    before,
    snapshot: { sig: editSignature(edit), data: U.clone(edit) },
    isNew: true,
    viewToken,
  };
  renderOverlay();
  inline.open(edit, { isNew: true, caret });
  showEditingUi();
  syncFormatbar();
  renderEditList();
  updateExportUi();
}

function selectEdit(id) {
  const edit = state.edits.find((x) => x.id === id);
  if (!edit) return;
  const blockEl = els.overlay.querySelector(`.edit-block[data-edit-id="${CSS.escape(id)}"]`);
  const caret = caretForElement(blockEl || { dataset: {} }, {
    text: edit.text,
    font: edit.font,
    size: edit.size,
    bold: edit.bold,
    italic: edit.italic,
  });
  if (state.active) closeActive({ restore: false });
  const viewToken = captureEditView();
  state.active = {
    edit,
    before: U.clone(state.edits),
    snapshot: { sig: editSignature(edit), data: U.clone(edit) },
    isNew: false,
    viewToken,
  };
  renderOverlay();
  inline.open(edit, { isNew: false, caret });
  showEditingUi();
  syncFormatbar();
  renderEditList();
  updateExportUi();
}

function closeActive({ restore = true } = {}) {
  const a = state.active;
  if (!a) {
    hideEditingUi();
    return;
  }
  inline.sync();
  const changed = editSignature(a.edit) !== a.snapshot.sig;
  const hasText = String(a.edit.text || '').trim().length > 0;

  if (a.isNew && !changed) {
    // Annuler une modification non validée ne doit laisser aucune trace :
    // ni bloc superposé, ni entrée dans l'historique, ni compteur incrémenté.
    state.edits = state.edits.filter((x) => x.id !== a.edit.id);
  } else if (!hasText && a.isNew) {
    state.edits = state.edits.filter((x) => x.id !== a.edit.id);
  } else if (changed) {
    state.history.push(a.before);
  }

  state.active = null;
  inline.close();
  hideEditingUi();
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  updateHistoryButtons();
  scheduleAutosave();
  if (restore) restoreEditView(a.viewToken);
}

function deleteActiveEdit() {
  const a = state.active;
  if (!a) return;
  const removed = a.edit;
  if (!a.isNew) {
    state.history.push(a.before);
    updateHistoryButtons();
  }
  state.edits = state.edits.filter((x) => x.id !== removed.id);
  state.active = null;
  inline.close();
  hideEditingUi();
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  scheduleAutosave();
  restoreEditView(a.viewToken);
  if (!a.isNew) {
    toast(t('msg.blockDeleted'), 'info', {
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

function duplicateActiveEdit() {
  const a = state.active;
  if (!a) return;
  inline.sync();
  const copy = U.clone(a.edit);
  copy.id = U.uid('edit');
  copy.kind = 'add';
  copy.lineId = null;
  copy.source = 'add';
  copy.bbox = { ...copy.bbox, x: copy.bbox.x + 14, y: copy.bbox.y - 14 };
  copy.baseline = (copy.baseline ?? copy.bbox.y) - 14;
  copy.bg = null;
  state.history.push(U.clone(state.edits));
  state.edits.push(copy);
  closeActive();
  selectEdit(copy.id);
  scheduleAutosave();
}

function startAddText() {
  if (!state.engine) return;
  closeActive();
  state.addMode = true;
  els.stage.classList.add('placing');
  updateHint();
  toast(t('msg.tapToPlace'), 'info', { duration: 3000 });
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
    bbox: { x, y: y - size * 0.26, w: 140, h: size * 1.14 },
    baseline: y,
    originalText: '',
    text: '',
    font: 'Helvetica',
    size,
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    lineHeight: 1.16,
    color: '#111827',
    bg: null,
    fit: false,
  };
  const before = U.clone(state.edits);
  state.edits.push(edit);
  state.active = { edit, before, snapshot: { sig: editSignature(edit), data: U.clone(edit) }, isNew: true };
  cancelAddMode();
  renderOverlay();
  inline.open(edit, { isNew: true });
  showEditingUi();
  renderEditList();
  updateExportUi();
}

/** Remplace l'état des modifications (undo/redo, restauration de session). */
function applyEditsSnapshot(snapshot, { autosave = true } = {}) {
  if (state.active) closeActive();
  state.active = null;
  state.edits = U.clone(snapshot);
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  updateHistoryButtons();
  if (autosave) scheduleAutosave();
}

function undoEdits() {
  if (!state.engine) return;
  closeActive();
  const previous = state.history.undo(state.edits);
  if (previous == null) {
    toast(t('msg.nothingUndo'), 'info', { duration: 1800 });
    return;
  }
  applyEditsSnapshot(previous);
  toast(t('msg.undone'), 'info', { duration: 1800 });
}

function redoEdits() {
  if (!state.engine) return;
  closeActive();
  const next = state.history.redo(state.edits);
  if (next == null) {
    toast(t('msg.nothingRedo'), 'info', { duration: 1800 });
    return;
  }
  applyEditsSnapshot(next);
  toast(t('msg.redone'), 'info', { duration: 1800 });
}

/* ── Sauvegarde / restauration de session (IndexedDB) ─────────────── */

function collectOcrForSession() {
  return [...state.pages.entries()]
    .filter(([, p]) => p.ocr)
    .map(([pageNo, p]) => ({ pageNo, ocr: p.ocr }));
}

/** Écrit la session (modifications, annotations, OCR) dans le stockage local. */
async function flushSession() {
  if (!state.hash) return false;
  const payload = {
    name: state.fileName,
    size: state.bytes?.byteLength || 0,
    numPages: state.numPages,
    edits: state.edits,
    ocrPages: collectOcrForSession(),
    markup: markup.objects,
  };
  try {
    await Session.saveSession(state.hash, payload);
    return true;
  } catch (err) {
    console.warn('[store] session non enregistrée', err);
    return false;
  }
}

function scheduleAutosave(now = false) {
  if (!state.hash || state.restoring) return;
  clearTimeout(state.autosaveTimer);
  // Même sans modification, l'enregistrement reste : il porte les octets du
  // PDF et permet de le rouvrir depuis « Fichiers ». Seule la session
  // d'édition est vidée.
  if (now) return flushSession();
  state.autosaveTimer = setTimeout(() => {
    flushSession();
  }, 900);
}

/**
 * Enregistre le PDF et ses métadonnées dans IndexedDB, après avoir vérifié les
 * limites (10 documents / 150 Mo). Les documents les plus anciens ne sont
 * supprimés qu'après confirmation explicite.
 */
async function persistDocument(hash, bytes) {
  try {
    const plan = await Session.checkLimits(hash, bytes.byteLength);
    if (plan.blocked) {
      toast(t('files.tooBig', { size: U.formatBytes(bytes.byteLength), max: U.formatBytes(plan.maxBytes || Session.MAX_TOTAL_BYTES) }), 'error', {
        duration: 9000,
      });
      return false;
    }
    if (plan.evict.length) {
      const docs = await Session.listDocuments().catch(() => []);
      const names = plan.evict
        .map((key) => docs.find((d) => d.key === key)?.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      const ok = await askConfirm({
        title: t('files.limitTitle'),
        message: t('files.limitText', {
          max: U.formatBytes(plan.maxBytes || Session.MAX_TOTAL_BYTES),
          names: names || t('files.someOld'),
        }),
        confirmLabel: t('files.limitConfirm'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) {
        toast(t('files.limitKept'), 'warn', { duration: 7000 });
        return false;
      }
      for (const key of plan.evict) {
        await Session.deleteDocument(key).catch(() => {});
      }
    }
    await Session.saveDocumentBytes(hash, bytes, {
      name: state.fileName,
      numPages: state.numPages,
    });
    // Demande au navigateur de ne pas effacer ces documents de lui-même.
    Session.requestPersistence();
    return true;
  } catch (err) {
    console.warn('[store] enregistrement impossible', err);
    toast(
      isQuotaError(err) ? t('files.quota') : err?.code === 'blocked' ? t('files.blocked') : t('files.saveFailed'),
      'error',
      { duration: 9000 }
    );
    return false;
  }
}

/** Applique une session enregistrée au document courant (sans dialogue). */
function applySessionData(saved) {
  state.restoring = true;
  try {
    if (Array.isArray(saved.edits)) {
      state.edits = saved.edits.filter((e) => e && e.page >= 1 && e.page <= state.numPages);
    }
    if (Array.isArray(saved.markup)) {
      markup.setObjects(saved.markup.filter((o) => o && o.page >= 1 && o.page <= state.numPages));
      markupHistory.stack = [JSON.stringify(markup.objects)];
      markupHistory.index = 0;
    }
    for (const entry of saved.ocrPages || []) {
      if (!entry?.ocr || entry.pageNo < 1 || entry.pageNo > state.numPages) continue;
      const pd = getPageData(entry.pageNo);
      pd.ocr = entry.ocr;
      pd.ocrStatus = 'done';
    }
    state.history.clear();
    updateHistoryButtons();
    renderOverlay();
    renderEditList();
    updateExportUi();
    updatePanelsForPage();
    updateTextPanel();
    return true;
  } finally {
    state.restoring = false;
  }
}

/**
 * Reprend la session d'un document (modifications, annotations, OCR).
 * @param {string} hash clé du document
 * @param {{silent?:boolean}} options `silent` : pas de dialogue (ouverture
 *   depuis « Fichiers » ou reprise directe après avoir choisi le fichier)
 */
async function restoreSessionData(hash, { silent = false } = {}) {
  if (!hash) return false;
  let saved = null;
  try {
    saved = await Session.loadSession(hash);
  } catch {
    return false;
  }
  if (!saved) return false;
  const nEdits = saved.edits?.length || 0;
  const nOcr = saved.ocrPages?.length || 0;
  const nMarkup = saved.markup?.length || 0;
  if (!nEdits && !nOcr && !nMarkup) return false;

  if (silent) {
    applySessionData(saved);
    toast(t('msg.sessionRestored'), 'success', { duration: 2200 });
    return true;
  }

  const parts = [];
  if (nEdits) parts.push(`${nEdits} modification${nEdits > 1 ? 's' : ''}`);
  if (nOcr) parts.push(`${nOcr} page${nOcr > 1 ? 's' : ''} OCRisée${nOcr > 1 ? 's' : ''}`);
  if (nMarkup) parts.push(`${nMarkup} annotation${nMarkup > 1 ? 's' : ''}`);
  els.resumeText.textContent = `Une session a été trouvée pour « ${saved.name || state.fileName} » : ${parts.join(
    ' et '
  )}. Voulez-vous reprendre où vous en étiez ?`;

  const answer = await new Promise((resolve) => {
    const finish = (value) => {
      els.resumeYes.removeEventListener('click', onYes);
      els.resumeNo.removeEventListener('click', onNo);
      els.resumeDialog.removeEventListener('close', onClose);
      if (els.resumeDialog.open) els.resumeDialog.close();
      resolve(value);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    const onClose = () => finish(false);
    els.resumeYes.addEventListener('click', onYes);
    els.resumeNo.addEventListener('click', onNo);
    els.resumeDialog.addEventListener('close', onClose);
    els.resumeDialog.showModal();
  });

  if (!answer) {
    // Refuser la reprise ne doit pas supprimer le document : on efface
    // seulement la session d'édition, les octets restent dans « Fichiers ».
    await Session.saveSession(state.hash, {
      name: state.fileName,
      numPages: state.numPages,
      edits: [],
      ocrPages: [],
      markup: [],
    }).catch(() => {});
    return false;
  }
  applySessionData(saved);
  toast(t('msg.sessionRestored'), 'success', { duration: 2600 });
  return true;
}

/** Propose de reprendre une session (ouverture manuelle d'un PDF). */
function maybeRestoreSession() {
  return restoreSessionData(state.hash, { silent: false });
}

/* ── Mode diagnostic ─────────────────────────────────────────────── */

const DIAG_KEY = 'pdf-studio-diagnostic';
const diagnostic = { on: false, timer: 0 };

/** Met à jour le badge : navigateur · mode d'édition · offset du curseur. */
function updateDiagnostics() {
  if (!diagnostic.on || !els.diagBadge) return;
  els.diagBadge.textContent = formatDiagnostic({
    browser: describeBrowser(navigator.userAgent),
    surface: inline.isOpen() ? inline.surface : null,
    offset: inline.isOpen() ? inline.caretOffset() : null,
  });
}

function setDiagnostics(on) {
  diagnostic.on = !!on;
  try {
    localStorage.setItem(DIAG_KEY, diagnostic.on ? '1' : '0');
  } catch {
    /* stockage indisponible */
  }
  if (els.diagToggle) els.diagToggle.checked = diagnostic.on;
  if (els.diagBadge) els.diagBadge.hidden = !diagnostic.on;
  clearInterval(diagnostic.timer);
  diagnostic.timer = 0;
  if (diagnostic.on) {
    updateDiagnostics();
    // Léger : suffisant pour suivre le curseur, sans écouter chaque frappe.
    diagnostic.timer = setInterval(updateDiagnostics, 400);
  }
}

function initDiagnostics() {
  let saved = false;
  try {
    saved = localStorage.getItem(DIAG_KEY) === '1';
  } catch {
    /* stockage indisponible */
  }
  els.diagToggle?.addEventListener('change', () => setDiagnostics(els.diagToggle.checked));
  setDiagnostics(saved);
  document.addEventListener('selectionchange', updateDiagnostics);
  document.addEventListener('input', updateDiagnostics, true);
}

/* ── Dialogue de mot de passe ─────────────────────────────────────── */



function renderEditList() {
  scheduleAutosave();
  updateEditbarCount();
}

function deleteEditById(id) {
  const removed = state.edits.find((e) => e.id === id);
  if (!removed) return;
  if (state.active?.edit?.id === id) {
    state.active = null;
    inline.close();
    hideEditingUi();
  }
  state.history.push(U.clone(state.edits));
  updateHistoryButtons();
  state.edits = state.edits.filter((e) => e.id !== id);
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  toast(t('msg.editDeleted'), 'info', {
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
  state.history.push(U.clone(state.edits));
  updateHistoryButtons();
  state.active = null;
  inline.close();
  hideEditingUi();
  state.edits = [];
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  toast(t('msg.allCleared'), 'info', {
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

  // Prétraitement optionnel : contraste puis redressement
  let prepared = canvas;
  if (els.ocrContrast?.checked) prepared = enhanceContrast(prepared);
  if (els.ocrDeskew?.checked) prepared = deskewCanvas(prepared);

  const res = await recognizeCanvas(prepared, langs, onProgress);

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
  const langs = [...els.ocrLang.querySelectorAll('input[type="checkbox"]:checked')].map((i) => i.value);
  if (!langs.length) {
    toast(t('msg.pickOcrLang'), 'warn');
    state.ocr.running = false;
    updateOcrButtons();
    return;
  }
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
      scheduleAutosave();
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
      toast(t('msg.ocrPageFailed', { n, msg }), 'error');
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
  if (done) toast(t('msg.ocrDone', { n: done }), 'success');
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
  updateDock();
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
  if (els.btnSave) els.btnSave.disabled = !state.engine;
  els.btnSearch.disabled = !state.engine;
  if (els.btnDocMenu) els.btnDocMenu.disabled = !state.engine;
  if (els.btnShare) els.btnShare.disabled = !state.engine;
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

/**
 * Ouvre un PDF.
 * @param {Uint8Array} bytes
 * @param {string} name
 * @param {string} [password]
 * @param {{session?: 'ask'|'auto'|'skip'}} [options] `auto` : reprend la
 *   session sans demander (ouverture depuis « Fichiers ») ; `skip` : ignore
 *   toute session enregistrée.
 */
async function openPdfBytes(bytes, name, password = '', options = {}) {
  const openOptions = { session: 'ask', ...options };
  pushLoading(t('msg.opening'));
  const attempt = ++state.loadToken;
  let passwordPrompt = null;
  try {
    const engine = new PdfEngine(bytes.slice());
    await engine.load(password);
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
    state.hash = null;
    state.history.clear();
    updateHistoryButtons();
    state.formFields = [];
    state.formValues = {};
    markup.setObjects([]);
    markupHistory.stack = [];
    markupHistory.index = -1;
    insertCount = 0;
    if (els.annobar && !els.annobar.hidden) closeAnnotate();
    if (els.tabForm) els.tabForm.hidden = true;
    if (els.formFields) els.formFields.innerHTML = '';
    els.stage.classList.remove('placing');
    els.searchbar.hidden = true;
    els.searchResults.hidden = true;
    els.searchInput.value = '';
    els.hintbar.hidden = false;
    closeExportMenu();
    document.title = `${U.baseName(state.fileName)} — PDF Studio`;
    document.body.classList.remove('no-doc');
    routeTo('doc');
    els.emptyState.hidden = true;
    els.stage.hidden = false;
    els.fileChip.hidden = false;
    els.pageInput.max = String(state.numPages);
    els.thumbCount.textContent = String(state.numPages);
    updateFileChip();
    updatePageNav();
    inline.close();
    hideEditingUi();
    state.active = null;
    state.addMode = false;
    els.stage.classList.remove('placing');
    renderEditList();
    updateExportUi();
    setTab('text');
    buildThumbnails(token);
    await renderCurrent();
    els.canvasScroll.scrollTo({ top: 0, left: 0 });
    updatePanelsForPage();
    ensureAllLines().catch(() => {}); // indexation en arrière-plan
    toast(t('msg.opened', { name: state.fileName, n: state.numPages }), 'success', {
      duration: 2600,
    });

    // Détection des champs AcroForm (sans bloquer le rendu)
    readFormFields(bytes)
      .then((fields) => {
        if (docToken !== state.docToken || !fields.length) return;
        state.formFields = fields;
        state.formValues = Object.fromEntries(fields.map((f) => [f.name, f.value || '']));
        els.tabForm.hidden = false;
        renderFormPanel();
      })
      .catch(() => {});

    // Empreinte, enregistrement local, puis session éventuelle.
    const docToken = state.docToken;
    Session.hashBytes(bytes)
      .then(async (hash) => {
        if (docToken !== state.docToken) return;
        state.hash = hash;
        const pending = takePendingReopen();
        if (pending && pending.key === hash) {
          // Le fichier choisi correspond bien au document perdu : on reprend
          // la session enregistrée, sans redemander.
          await persistDocument(hash, bytes);
          if (docToken !== state.docToken) return;
          await restoreSessionData(hash, { silent: true });
          return;
        }
        if (pending) toast(t('files.wrongFile'), 'warn', { duration: 7000 });
        await persistDocument(hash, bytes);
        if (docToken !== state.docToken) return;
        if (openOptions.session === 'auto') return restoreSessionData(hash, { silent: true });
        if (openOptions.session === 'skip') return;
        return maybeRestoreSession();
      })
      .catch(() => {});
  } catch (err) {
    if (err?.name === 'PasswordException') {
      passwordPrompt = { wrong: !!password };
    } else {
      console.error(err);
      if (state.numPages === 0) {
        document.body.classList.add('no-doc');
        els.emptyState.hidden = false;
        els.stage.hidden = true;
      }
      const msg =
        err?.name === 'InvalidPDFException'
          ? 'fichier corrompu ou qui n’est pas un PDF valide.'
          : err?.name === 'MissingPDFException'
            ? 'fichier introuvable.'
            : err?.message || String(err);
      toast(t('msg.openFailed', { msg }), 'error', { duration: 8000 });
    }
  } finally {
    popLoading();
  }

  // Demande de mot de passe (nouvelle tentative avec le mot de passe saisi)
  if (passwordPrompt) {
    const pwd = await askPassword(!passwordPrompt.wrong);
    if (pwd) return openPdfBytes(bytes, name, pwd, options);
  }
}

async function handleFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    toast(t('msg.notPdf'), 'warn');
    return;
  }
  const MB = 1024 * 1024;
  if (!file.size) {
    toast(t('msg.emptyFile'), 'error');
    return;
  }
  if (file.size > 200 * MB) {
    toast(
      t('msg.tooBig', { n: Math.round(file.size / MB) }),
      'error',
      { duration: 9000 }
    );
    return;
  }
  if (file.size > 60 * MB) {
    toast(
      t('msg.bigFile', { n: Math.round(file.size / MB) }),
      'warn',
      { duration: 5000 }
    );
  }
  try {
    pushLoading(t('msg.reading'));
    const buf = await file.arrayBuffer();
    popLoading();
    await openPdfBytes(new Uint8Array(buf), file.name);
  } catch (err) {
    popLoading();
    console.error(err);
    toast(t('msg.readFailed'), 'error');
  }
}

async function openDemo(kind) {
  pushLoading(kind === 'scan' ? t('msg.demoScan') : t('msg.demoText'));
  try {
    const bytes = kind === 'scan' ? await buildSampleScanPdf() : await buildSampleTextPdf();
    popLoading();
    await openPdfBytes(bytes, kind === 'scan' ? 'Facture — exemple scanné.pdf' : 'Rapport — exemple texte.pdf');
  } catch (err) {
    popLoading();
    console.error(err);
    toast(t('msg.demoFailed'), 'error');
  }
}

/* ─────────────────────────── Aperçu d'export ─────────────────────────── */

/** Partage un fichier via l'API Web Share (mobile) ou téléchargement sinon. */
async function shareBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') return false;
    }
  }
  U.downloadBlob(blob, name);
  toast(t('save.shareFallback'), 'info');
  return false;
}

let lastSaved = null; // { blob, name }

/** Valide le bloc en cours puis télécharge le PDF modifié. */
/**
 * Enregistrer : copie le travail dans « Fichiers » (PDF + modifications,
 * annotations, OCR), sans rien télécharger. Les modifications restent
 * modifiables à la réouverture.
 */
async function handleSave() {
  if (!state.engine) return;
  closeActive();
  const ok = await flushSession();
  if (ok) Session.requestPersistence();
  toast(ok ? t('save.stored') : t('save.storeFailed'), ok ? 'success' : 'error', {
    duration: ok ? 4500 : 9000,
    action: t('common.share'),
    onAction: () => shareCurrentPdf(),
  });
  updateSaveState(ok);
}

/** Petit retour visuel sur le bouton Enregistrer (coche brève). */
function updateSaveState(ok) {
  for (const btn of [els.btnSave, els.editSave]) {
    if (!btn) continue;
    btn.classList.toggle('just-saved', !!ok);
    if (ok) setTimeout(() => btn.classList.remove('just-saved'), 1800);
  }
}

/** Télécharge le PDF avec les modifications (ancien comportement d'« Enregistrer »). */
async function downloadModifiedPdf() {
  if (!state.engine) return;
  closeActive();
  const ocrPages = collectOcrForSession();
  pushLoading(t('save.working'));
  try {
    const { exportPdf } = await import('./exporter.js');
    const result = await exportPdf({
      sourceBytes: state.bytes,
      edits: state.edits,
      ocrPages,
      redactMode: 'stream',
      renderPage: null,
      objects: markup.objects,
    });
    const name = 'fichier-modifie.pdf';
    const blob = new Blob([result.bytes], { type: 'application/pdf' });
    lastSaved = { blob, name };
    U.downloadBlob(blob, name);
    // Le PDF est déjà téléchargé : la copie locale ne doit jamais bloquer l'écran.
    Promise.resolve(scheduleAutosave(true)).catch(() => {});
    const canShare = !!navigator.canShare?.({ files: [new File([blob], name, { type: 'application/pdf' })] });
    toast(t('save.done'), 'success', {
      duration: 6500,
      action: canShare ? t('common.share') : undefined,
      onAction: () => shareBlob(blob, name),
    });
  } catch (err) {
    console.error(err);
    toast(t('save.error'), 'error');
  } finally {
    popLoading();
  }
}

async function showExportModal({ kind, filename, blob, text }) {
  const token = ++modalToken;
  els.exportModal.hidden = false;
  els.exportModalTitle.textContent = kind === 'pdf' ? t('modal.pdfTitle') : t('modal.textTitle');
  els.exportKind.textContent = kind === 'pdf' ? 'PDF' : 'TXT';
  els.exportFileName.textContent = filename;
  els.exportFileMeta.textContent = `${U.formatBytes(blob.size)}${
    kind === 'pdf' ? ` · ${t('modal.ready')}` : ` · ${t('modal.rawText')}`
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
  els.exportCopyText.innerHTML = `${icon('copy', 16)}<span>${t('modal.copy')}</span>`;
  const canShare = !!navigator.canShare?.({ files: [new File([blob], filename, { type: blob.type })] });
  els.exportShare.hidden = !canShare;
  els.exportShare.onclick = () => shareBlob(blob, filename);

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
  toast(t('msg.generated', { name }), 'success', { duration: 6000 });
  showExportModal({ kind: mime === 'application/pdf' ? 'pdf' : 'txt', filename: name, blob });
}

function closeExportMenu() {
  els.exportMenu.hidden = true;
}



/** Rend une page du PDF source en canvas pour la rastérisation d'export. */
async function renderPageForExport(pageNo) {
  const size = await state.engine.getPageSize(pageNo);
  const scale = Math.min(3, 1800 / Math.max(1, size.width));
  const canvas = document.createElement('canvas');
  await state.engine.renderToCanvas(pageNo, canvas, Math.max(1, scale));
  return canvas;
}

async function handleExportPdf(options = {}) {
  if (!state.engine) return;
  const includeEdits = els.expEdits.checked;
  const includeOcr = els.expOcr.checked;
  if (!includeEdits && !includeOcr) {
    toast(t('msg.pickOption'), 'warn');
    return;
  }
  closeActive();
  const ocrPages = includeOcr
    ? [...state.pages.entries()].filter(([, p]) => p.ocr).map(([n, p]) => ({ pageNo: n, ocr: p.ocr }))
    : [];
  const edits = includeEdits ? state.edits : [];
  const redactMode = els.expRedact?.value || 'stream';

  pushLoading(t('msg.exporting'));
  try {
    // Import paresseux : pdf-lib et fontkit ne pèsent pas sur le bundle initial.
    const { exportPdf, analyzeExport } = await import('./exporter.js');
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
      rasterQuality: Number(els.expQuality?.value || 1),
      objects: markup.objects,
    });
    const bytes = result.bytes;
    const suffix =
      typeof options?.suffix === 'string' ? options.suffix : fileNameSuffix(includeEdits, includeOcr);
    const name = `${U.baseName(state.fileName)}-${suffix}.pdf`;
    saveBytes(bytes, name);
    if (redactMode === 'stream' && result.stats?.removedPages?.length) {
      toast(
        t('msg.redacted', { n: result.stats.removedPages.length }),
        'success',
        { duration: 3800 }
      );
    }
    closeExportMenu();
  } catch (err) {
    console.error(err);
    toast(t('msg.exportFailed', { msg: err?.message || err }), 'error');
  } finally {
    popLoading();
  }
}

/**
 * Exporte la page courante en image PNG ou JPEG.
 * @param {'png'|'jpg'} format
 */
async function handleExportImage(format) {
  if (!state.engine) return;
  pushLoading(t('msg.rendering'));
  try {
    const n = state.pageIndex + 1;
    const size = await state.engine.getPageSize(n);
    const scale = Math.min(3, 2200 / Math.max(1, size.width));
    const canvas = document.createElement('canvas');
    await state.engine.renderToCanvas(n, canvas, Math.max(1, scale));
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? Number(els.expQuality?.value || 0.82) || 0.82 : 1;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('Rendu impossible');
    const name = `${U.baseName(state.fileName)}-page-${n}.${format}`;
    U.downloadBlob(blob, name);
    toast(t('msg.imageExported', { fmt: format.toUpperCase(), size: U.formatBytes(blob.size) }), 'success', {
      duration: 4500,
    });
    closeExportMenu();
  } catch (err) {
    console.error(err);
    toast(t('msg.imageFailed', { msg: err?.message || err }), 'error');
  } finally {
    popLoading();
  }
}

async function handleExportText() {
  if (!state.engine) return;
  pushLoading(t('msg.preparingText'));
  try {
    await ensureAllLines();
    const parts = [];
    for (let n = 1; n <= state.numPages; n++) {
      const { text } = getPageText(n);
      if (text.trim()) parts.push(`— Page ${n} —\n${text.trim()}`);
    }
    if (!parts.length) {
      toast(t('msg.noText'), 'warn');
      return;
    }
    const blob = new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    const name = `${U.baseName(state.fileName)}.txt`;
    U.downloadBlob(blob, name);
    toast(t('msg.textExported'), 'success');
    showExportModal({ kind: 'txt', filename: name, blob, text: parts.join('\n\n') });
    closeExportMenu();
  } catch (err) {
    console.error(err);
    toast(t('msg.textFailed'), 'error');
  } finally {
    popLoading();
  }
}

/* ─────────────────────────── Formulaires AcroForm ─────────────────────────── */

function renderFormPanel() {
  if (!els.formFields) return;
  if (!state.formFields.length) {
    els.formFields.innerHTML = `<p class="form-empty">${t('form.none')}</p>`;
    return;
  }
  els.formFields.innerHTML = state.formFields
    .map((field, index) => {
      const id = `form-field-${index}`;
      const value = state.formValues[field.name] ?? '';
      if (field.type === 'checkbox') {
        return `<div class="form-field">
          <label for="${id}"><input type="checkbox" id="${id}" data-field="${U.escapeHtml(field.name)}" ${
            value === 'true' ? 'checked' : ''
          } /> ${U.escapeHtml(field.name)}</label>
        </div>`;
      }
      if (field.type === 'select' || field.type === 'radio') {
        const options = field.options
          .map(
            (opt) =>
              `<option value="${U.escapeHtml(opt)}" ${opt === value ? 'selected' : ''}>${U.escapeHtml(opt)}</option>`
          )
          .join('');
        return `<div class="form-field">
          <label for="${id}">${U.escapeHtml(field.name)}</label>
          <select id="${id}" data-field="${U.escapeHtml(field.name)}">
            <option value="">—</option>${options}
          </select>
        </div>`;
      }
      if (field.type === 'button') return '';
      return `<div class="form-field">
        <label for="${id}">${U.escapeHtml(field.name)}</label>
        <input type="text" id="${id}" data-field="${U.escapeHtml(field.name)}" value="${U.escapeHtml(
        value
      )}" />
      </div>`;
    })
    .join('');
}

function bindFormTools() {
  if (!els.formFields) return;
  els.formFields.addEventListener('input', (e) => {
    const target = e.target.closest('[data-field]');
    if (!target) return;
    const name = target.dataset.field;
    state.formValues[name] = target.type === 'checkbox' ? (target.checked ? 'true' : '') : target.value;
  });
  els.btnFillExport?.addEventListener('click', async () => {
    if (!state.engine) return;
    pushLoading('Remplissage du formulaire…');
    try {
      const bytes = await fillFormFields(state.bytes, state.formValues, {
        flatten: !!els.formFlatten?.checked,
      });
      const name = `${U.baseName(state.fileName)}-formulaire.pdf`;
      saveBytes(bytes, name);
      toast(t('msg.formExported'), 'success', { duration: 4500 });
    } catch (err) {
      console.error(err);
      toast(t('msg.formFailed', { msg: err?.message || err }), 'error');
    } finally {
      popLoading();
    }
  });
}

/* ─────────────────────────── Outils de pages ─────────────────────────── */

/** Confirmation avant de perdre les modifications en cours. */
function confirmDiscard() {
  if (!state.edits.length && ![...state.pages.values()].some((p) => p.ocr)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (value) => {
      els.discardOk.removeEventListener('click', onOk);
      els.discardCancel.removeEventListener('click', onCancel);
      els.discardDialog.removeEventListener('close', onCancel);
      if (els.discardDialog.open) els.discardDialog.close();
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    els.discardOk.addEventListener('click', onOk);
    els.discardCancel.addEventListener('click', onCancel);
    els.discardDialog.addEventListener('close', onCancel);
    els.discardDialog.showModal();
  });
}

/**
 * Applique une opération de page puis recharge le document.
 * @param {string} label libellé du chargement
 * @param {() => Promise<Uint8Array>} operation
 * @param {number} [targetPage] page à afficher après rechargement
 */
async function applyPageOp(label, operation, targetPage) {
  if (!state.engine) return;
  if (!(await confirmDiscard())) return;
  pushLoading(label);
  try {
    const bytes = await operation();
    const name = state.fileName;
    await openPdfBytes(bytes, name);
    setTab('pages');
    if (targetPage && targetPage > 1) {
      await goToPage(Math.min(targetPage, state.numPages));
    }
  } catch (err) {
    console.error(err);
    toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
  } finally {
    popLoading();
  }
}

function currentPageNo() {
  return state.pageIndex + 1;
}

function bindPageTools() {
  els.btnRotateLeft.addEventListener('click', () =>
    applyPageOp('Rotation de la page…', () => PageOps.rotatePage(state.bytes, currentPageNo(), -90), currentPageNo())
  );
  els.btnRotateRight.addEventListener('click', () =>
    applyPageOp('Rotation de la page…', () => PageOps.rotatePage(state.bytes, currentPageNo(), 90), currentPageNo())
  );
  els.btnMoveUp.addEventListener('click', () => {
    const n = currentPageNo();
    if (n <= 1) return;
    applyPageOp('Déplacement de la page…', () => PageOps.movePage(state.bytes, n, n - 1), n - 1);
  });
  els.btnMoveDown.addEventListener('click', () => {
    const n = currentPageNo();
    if (n >= state.numPages) return;
    applyPageOp('Déplacement de la page…', () => PageOps.movePage(state.bytes, n, n + 1), n + 1);
  });
  els.btnDeletePage.addEventListener('click', () => {
    const n = currentPageNo();
    applyPageOp('Suppression de la page…', () => PageOps.deletePage(state.bytes, n), Math.min(n, state.numPages - 1) || 1);
  });
  els.btnInsertBlank.addEventListener('click', () =>
    applyPageOp('Insertion d’une page…', () => PageOps.insertBlankPage(state.bytes, currentPageNo() + 1), currentPageNo() + 1)
  );

  els.btnExtractPages.addEventListener('click', async () => {
    if (!state.engine) return;
    const pages = PageOps.parsePageRanges(els.pgRange.value, state.numPages);
    if (!pages.length) {
      toast(t('msg.badRange'), 'warn');
      return;
    }
    pushLoading('Extraction des pages…');
    try {
      const bytes = await PageOps.extractPages(state.bytes, pages);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const name = `${U.baseName(state.fileName)}-pages-${pages[0]}${pages.length > 1 ? `-${pages[pages.length - 1]}` : ''}.pdf`;
      U.downloadBlob(blob, name);
      toast(t('msg.extracted', { n: pages.length, name }), 'success', { duration: 5000 });
    } catch (err) {
      console.error(err);
      toast(t('msg.extractFailed'), 'error');
    } finally {
      popLoading();
    }
  });

  els.btnSplitPages.addEventListener('click', async () => {
    if (!state.engine) return;
    const n = currentPageNo();
    if (n < 1 || n >= state.numPages) {
      toast(t('msg.splitHint'), 'warn');
      return;
    }
    pushLoading('Division du document…');
    try {
      const before = PageOps.parsePageRanges(`1-${n}`, state.numPages);
      const after = PageOps.parsePageRanges(`${n + 1}-${state.numPages}`, state.numPages);
      const [a, b] = await Promise.all([
        PageOps.extractPages(state.bytes, before),
        PageOps.extractPages(state.bytes, after),
      ]);
      const base = U.baseName(state.fileName);
      U.downloadBlob(new Blob([a], { type: 'application/pdf' }), `${base}-partie-1.pdf`);
      setTimeout(() => U.downloadBlob(new Blob([b], { type: 'application/pdf' }), `${base}-partie-2.pdf`), 600);
      toast(t('msg.splitDone'), 'success', { duration: 5000 });
    } catch (err) {
      console.error(err);
      toast(t('msg.splitFailed'), 'error');
    } finally {
      popLoading();
    }
  });

  els.btnMergePdf.addEventListener('click', () => els.mergeInput.click());
  els.mergeInput.addEventListener('change', async () => {
    const file = els.mergeInput.files?.[0];
    els.mergeInput.value = '';
    if (!file) return;
    pushLoading('Lecture du PDF à fusionner…');
    try {
      const other = new Uint8Array(await file.arrayBuffer());
      popLoading();
      await applyPageOp('Fusion des documents…', () => PageOps.mergePdfs(state.bytes, other));
      toast(t('msg.merged', { name: file.name }), 'success', { duration: 4500 });
    } catch (err) {
      popLoading();
      console.error(err);
      toast(t('msg.mergeFailed'), 'error');
    }
  });
}

/* ─────────────────────────── Événements ─────────────────────────── */

/* ───────────────────────── Annotations (calque d'objets) ───────────────────────── */

const ANNO_TOOLS = [
  { id: 'highlight', icon: 'highlight', label: 'anno.highlight', color: true },
  { id: 'underline', icon: 'minus', label: 'anno.underline' },
  { id: 'strike', icon: 'strike', label: 'anno.strike' },
  { id: 'ink', icon: 'pen', label: 'anno.ink' },
  { id: 'note', icon: 'note', label: 'anno.note' },
  { id: 'rect', icon: 'square', label: 'anno.rect' },
  { id: 'ellipse', icon: 'circle', label: 'anno.ellipse' },
  { id: 'arrow', icon: 'arrowUpRight', label: 'anno.arrow' },
  { id: 'eraser', icon: 'eraser', label: 'anno.eraser', danger: true },
];

let annoColor = HIGHLIGHT_COLORS[0];
let annoInkColor = '#e11d48';
let annoInkWidth = 2.5;

function buildAnnoBar() {
  if (!els.annoTools) return;
  els.annoTools.innerHTML = ANNO_TOOLS.map((tool) => {
    const swatch =
      tool.id === 'highlight'
        ? `<span class="anno-swatch" style="background:${annoColor}"></span>`
        : icon(tool.icon, 19);
    return `<button class="anno-btn ${tool.danger ? 'danger' : ''}" data-anno-tool="${tool.id}" type="button">
      ${swatch}<span>${t(tool.label)}</span>
    </button>`;
  }).join('') +
    `<button class="anno-btn" data-anno-insert="image" type="button">${icon('image', 19)}<span>${t('anno.image')}</span></button>
     <button class="anno-btn" data-anno-insert="camera" type="button">${icon('camera', 19)}<span>${t('anno.photo')}</span></button>
     <button class="anno-btn" data-anno-insert="check" type="button">${icon('check', 19)}<span>${t('anno.check')}</span></button>
     <button class="anno-btn" data-anno-insert="cross" type="button">${icon('x', 19)}<span>${t('anno.cross')}</span></button>
     <button class="anno-btn" data-anno-insert="date" type="button">${icon('clock', 19)}<span>${t('anno.date')}</span></button>
     <button class="anno-btn" data-anno-insert="sign" type="button">${icon('signature', 19)}<span>${t('tool.sign')}</span></button>
     <button class="anno-btn" data-anno-insert="stamp" type="button">${icon('stamp', 19)}<span>${t('tool.stamp')}</span></button>
     <button class="anno-btn" id="annoUndo" type="button">${icon('undo', 19)}<span>${t('common.undo')}</span></button>
     <button class="anno-btn" id="annoClear" type="button">${icon('trash', 19)}<span>${t('anno.clear')}</span></button>
     <button class="anno-btn" id="annoDone" type="button">${icon('check', 19)}<span>${t('common.done')}</span></button>`;
  els.annoTools.querySelectorAll('[data-anno-tool]').forEach((btn) => {
    btn.addEventListener('click', () => activateAnnoTool(btn.dataset.annoTool));
  });
  els.annoTools.querySelectorAll('[data-anno-insert]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.annoInsert;
      if (kind === 'image') return openImageTool(false);
      if (kind === 'camera') return openImageTool(true);
      if (kind === 'check') return insertMark('check');
      if (kind === 'cross') return insertMark('cross');
      if (kind === 'date') return insertToday();
      if (kind === 'sign') return openSignTool();
      if (kind === 'stamp') return openStampTool();
    });
  });
  document.getElementById('annoUndo')?.addEventListener('click', undoMarkup);
  document.getElementById('annoClear')?.addEventListener('click', () => {
    markup.clearPage();
    toast(t('anno.cleared'), 'info', { duration: 2200 });
  });
  document.getElementById('annoDone')?.addEventListener('click', closeAnnotate);
  updateAnnoUndo();
}

function paintAnnoSub(tool) {
  if (!els.annoSub) return;
  if (tool === 'highlight') {
    els.annoSub.hidden = false;
    els.annoSub.innerHTML = HIGHLIGHT_COLORS.map(
      (c) => `<button class="color-dot" data-anno-color="${c}" style="background:${c}" type="button" aria-label="${c}"></button>`,
    ).join('');
    els.annoSub.querySelectorAll('[data-anno-color]').forEach((dot) => {
      dot.addEventListener('click', () => {
        annoColor = dot.dataset.annoColor;
        markup.setColor(annoColor);
        buildAnnoBar();
        activateAnnoTool('highlight');
      });
    });
    return;
  }
  if (tool === 'ink') {
    els.annoSub.hidden = false;
    els.annoSub.innerHTML = `
      <span class="muted">${t('anno.color')}</span>
      ${['#e11d48', '#2563eb', '#059669', '#111827'].map(
        (c) =>
          `<button class="color-dot" data-ink-color="${c}" style="background:${c}" type="button" aria-label="${c}"></button>`,
      ).join('')}
      <span class="muted">${t('anno.width')}</span>
      <input type="range" min="1" max="8" step="0.5" value="${annoInkWidth}" id="annoWidth" />`;
    els.annoSub.querySelectorAll('[data-ink-color]').forEach((dot) => {
      dot.addEventListener('click', () => {
        annoInkColor = dot.dataset.inkColor;
        markup.setInk({ color: annoInkColor });
      });
    });
    const range = document.getElementById('annoWidth');
    range?.addEventListener('input', () => {
      annoInkWidth = Number(range.value);
      markup.setInk({ width: annoInkWidth });
    });
    return;
  }
  els.annoSub.hidden = true;
  els.annoSub.innerHTML = '';
}

function activateAnnoTool(tool) {
  markup.setColor(annoColor);
  markup.setTool(tool);
  els.annoTools?.querySelectorAll('[data-anno-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.annoTool === tool);
  });
  paintAnnoSub(tool);
  updateHint();
}

function openAnnotate() {
  routeTo('doc');
  if (!state.engine) return;
  closeActive();
  buildAnnoBar();
  els.annobar.hidden = false;
  document.body.classList.add('annotating');
  activateAnnoTool('highlight');
  if (!markupHistory.stack.length) pushMarkupHistory();
}

function closeAnnotate() {
  markup.setTool(null);
  els.annobar.hidden = true;
  els.annoSub.hidden = true;
  els.annoTools?.querySelectorAll('.anno-btn').forEach((b) => b.classList.remove('active'));
  document.body.classList.remove('annotating');
  scheduleAutosave();
}

let noteTarget = null;
function editNote(obj) {
  noteTarget = obj;
  const value = window.prompt(t('anno.notePrompt'), obj.text || '');
  if (value == null) return;
  markup.update(obj.id, { text: value });
  toast(t('anno.noteSaved'), 'success', { duration: 2000 });
}

/* ───────────────────────── Signatures et tampons ───────────────────────── */

/** Décalage en cascade pour que les objets insérés ne se superposent pas. */
var insertCount = 0;
/** Taille de la page en points PDF (l'origine des bbox d'objets). */
function pdfPageSize() {
  const vp = state.viewport;
  const box = vp?.viewBox;
  if (box && box.length === 4) {
    return { w: Math.abs(box[2] - box[0]) || 595, h: Math.abs(box[3] - box[1]) || 842 };
  }
  const scale = state.scale || 1;
  return { w: (vp?.width || 595) / scale, h: (vp?.height || 842) / scale };
}

/** Coordonnées PDF du centre de la zone réellement visible (bbox = points PDF). */
function viewCenterPdf() {
  const vp = state.viewport;
  const scroller = els.canvasScroll;
  const stage = els.stage;
  if (vp?.convertToPdfPoint && scroller && stage) {
    const sr = scroller.getBoundingClientRect();
    const st = stage.getBoundingClientRect();
    // Centre de la fenêtre, ramené dans les limites de la page.
    const cx = Math.min(Math.max(sr.left + sr.width / 2 - st.left, 0), st.width);
    const cy = Math.min(Math.max(sr.top + sr.height / 2 - st.top, 0), st.height);
    const [x, y] = vp.convertToPdfPoint(cx, cy);
    return { x, y };
  }
  if (vp?.convertToPdfPoint) {
    const [x, y] = vp.convertToPdfPoint(vp.width / 2, vp.height / 2);
    return { x, y };
  }
  const { w, h } = pdfPageSize();
  return { x: w / 2, y: h / 2 };
}

/** Deux rectangles PDF se chevauchent-ils vraiment (pas juste leurs bords) ? */
function bboxOverlap(a, b, slack = 2) {
  return (
    a.x + slack < b.x + b.w &&
    b.x + slack < a.x + a.w &&
    a.y + slack < b.y + b.h &&
    b.y + slack < a.y + a.h
  );
}

/**
 * Décale une zone nouvellement insérée vers le bas tant qu'elle recouvre un
 * objet déjà posé sur la page : le tampon ne se superpose pas à la signature.
 */
function freeSpot(bbox) {
  const page = state.pageIndex + 1;
  const others = markup.objects.filter((o) => o.page === page && o.bbox && o.type !== 'ink');
  const { w: pageW } = pdfPageSize();
  let box = { ...bbox };
  for (let i = 0; i < 8 && others.some((o) => bboxOverlap(box, o.bbox)); i++) {
    box = { ...box, y: box.y - Math.max(16, box.h * 0.65) };
    if (box.y < 10) {
      box = { ...box, y: Math.max(10, bbox.y - Math.max(16, box.h * 0.65)) };
      box.x = Math.min(Math.max(10, box.x + box.w * 0.35), Math.max(10, pageW - box.w - 10));
    }
  }
  return box;
}

/** Décalage en cascade exprimé en points PDF, pour ne pas empiler les insertions. */
function cascadeOffset() {
  const k = 18 / (state.scale || 1);
  const dx = (insertCount % 3) * k;
  const dy = Math.floor(insertCount / 3) * (k * 1.2);
  insertCount++;
  return { dx, dy };
}

/** Ajoute une image (signature, photo, tampon) centrée sur la page. */
function addImageObject(src, { ratio = 3, label = '', type = 'image' } = {}) {
  const { w: pageW } = pdfPageSize();
  const scale = state.scale || 1;
  const width = Math.min(pageW * 0.34, 150 / scale);
  const height = width / Math.max(0.2, ratio);
  const center = viewCenterPdf();
  const { dx, dy } = cascadeOffset();
  const bbox = freeSpot({
    x: center.x - width / 2 + dx,
    y: center.y - height / 2 - dy,
    w: width,
    h: height,
  });
  const obj = markup.add({ type, src, bbox, label, rotation: 0, opacity: 1 });
  markup.setTool(null);
  markup.select?.(obj.id);
  return obj;
}

function openSignTool() {
  routeTo('doc');
  if (!state.engine) return;
  const body = openSheet({ title: t('tool.sign'), html: signatureSheetHtml(), size: 'tall' });
  if (!body) return;

  const padCanvas = body.querySelector('#sigPad');
  const pad = padCanvas ? createSignaturePad(padCanvas) : null;
  requestAnimationFrame(() => pad?.resize());

  body.querySelectorAll('[data-sig-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      body.querySelectorAll('[data-sig-tab]').forEach((x) => x.classList.toggle('active', x === tab));
      body.querySelectorAll('[data-sig-pane]').forEach((pane) => {
        pane.hidden = pane.dataset.sigPane !== tab.dataset.sigTab;
      });
      if (tab.dataset.sigTab === 'draw') requestAnimationFrame(() => pad?.resize());
    });
  });

  body.querySelector('#sigClear')?.addEventListener('click', () => pad?.clear());

  body.querySelector('#sigSaveDraw')?.addEventListener('click', () => {
    if (!pad || pad.isEmpty()) {
      toast(t('sign.empty'), 'warn');
      return;
    }
    const src = pad.toDataURL();
    const ratio = padCanvas.width / Math.max(1, padCanvas.height);
    saveSignature({ src, ratio, kind: 'draw' });
    closeSheet();
    addImageObject(src, { ratio, type: 'signature', label: t('sign.label') });
    toast(t('sign.placed'), 'success');
  });

  let font = SIGNATURE_FONTS[0];
  const textInput = body.querySelector('#sigText');
  const preview = body.querySelector('#sigPreview');
  textInput?.addEventListener('input', () => {
    preview.textContent = textInput.value;
  });
  body.querySelectorAll('[data-sig-font]').forEach((btn) => {
    btn.addEventListener('click', () => {
      font = SIGNATURE_FONTS.find((f) => f.id === btn.dataset.sigFont) || SIGNATURE_FONTS[0];
      body.querySelectorAll('[data-sig-font]').forEach((b) => b.classList.toggle('active', b === btn));
      preview.style.fontFamily = font.css;
    });
  });
  body.querySelector('#sigSaveType')?.addEventListener('click', () => {
    const value = textInput?.value?.trim();
    if (!value) {
      toast(t('sign.empty'), 'warn');
      return;
    }
    const printed = typedSignature(value, font.css);
    saveSignature({ src: printed.src, ratio: printed.ratio, kind: 'type' });
    closeSheet();
    addImageObject(printed.src, { ratio: printed.ratio, type: 'signature', label: value });
    toast(t('sign.placed'), 'success');
  });

  const file = body.querySelector('#sigFile');
  body.querySelector('#sigPickImage')?.addEventListener('click', () => file?.click());
  file?.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(chosen);
    });
    const trim = body.querySelector('#sigTrim')?.checked;
    const src = trim ? await removeLightBackground(dataUrl) : dataUrl;
    const img = new Image();
    img.src = src;
    await new Promise((r) => {
      img.onload = r;
      img.onerror = r;
    });
    const ratio = (img.naturalWidth || 3) / Math.max(1, img.naturalHeight || 1);
    if (chosen.size < 400000) saveSignature({ src, ratio, kind: 'image' });
    closeSheet();
    addImageObject(src, { ratio, type: 'signature', label: chosen.name });
    toast(t('sign.placed'), 'success');
  });

  body.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.quick;
      let text = '';
      if (kind === 'date') {
        text = new Date().toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
      } else if (kind === 'check') text = '✓';
      else if (kind === 'cross') text = '✗';
      else if (kind === 'name') {
        let name = loadSignerName();
        if (!name) {
          name = (window.prompt(t('quick.namePrompt'), '') || '').trim();
          if (!name) return;
          saveSignerName(name);
        }
        text = name;
      }
      closeSheet();
      placeQuickText(text);
    });
  });
  body.querySelectorAll('[data-sig-use]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = loadSignatures().find((s) => s.id === btn.dataset.sigUse);
      if (!entry) return;
      closeSheet();
      addImageObject(entry.src, { ratio: entry.ratio || 3, type: 'signature', label: t('sign.label') });
      toast(t('sign.placed'), 'success');
    });
  });
  body.querySelectorAll('[data-sig-del]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteSignature(el.dataset.sigDel);
      openSignTool();
    });
  });
}

/** Pose un petit texte (date, coche, croix, nom) au centre de la zone visible. */
function placeQuickText(text) {
  const scale = state.scale || 1;
  const fontSize = Math.max(8, 18 / scale);
  const w = Math.max(fontSize * 1.4, fontSize * 0.62 * String(text).length + 8 / scale);
  const h = fontSize * 1.5;
  const center = viewCenterPdf();
  const obj = markup.add({
    type: 'date',
    text,
    fontSize,
    bbox: freeSpot({ x: center.x - w / 2, y: center.y - h / 2, w, h }),
    color: '#111827',
  });
  markup.setTool(null);
  markup.select?.(obj.id);
  scheduleAutosave();
  return obj;
}

function openStampTool() {
  routeTo('doc');
  if (!state.engine) return;
  const today = new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
  const html = `
    <div class="stamp-grid">
      ${STAMP_PRESETS.map(
        (st) =>
          `<button class="stamp-preset" data-stamp="${st.id}" type="button" style="color:${st.color};border-color:${st.color}">${st.text}</button>`,
      ).join('')}
      <button class="stamp-preset date" data-stamp="date" type="button">${icon('clock', 15)} ${today}</button>
    </div>
    ${
      loadStamps().length
        ? `<div class="stamp-mine"><h4>${t('stamp.mine')}</h4><div class="stamp-grid">${loadStamps()
            .map(
              (st) =>
                `<span class="stamp-saved"><button class="stamp-preset" data-stamp-saved="${st.id}" type="button" style="color:${st.color};border-color:${st.color}">${U.escapeHtml(st.text)}</button><button class="sig-del" data-stamp-del="${st.id}" type="button" aria-label="${t('sign.delete')}">${icon('x', 13)}</button></span>`
            )
            .join('')}</div></div>`
        : ''
    }
    <div class="stamp-custom">
      <h4>${t('stamp.custom')}</h4>
      <input id="stampText" placeholder="${t('stamp.text')}" value="" />
      <label class="check compact"><input type="checkbox" id="stampSave" checked /><span>${t('stamp.saveIt')}</span></label>
      <div class="stamp-row">
        <input type="color" id="stampColor" value="#059669" />
        <button class="btn primary small" id="stampAdd" type="button">${icon('plus', 15)}<span>${t('stamp.add')}</span></button>
      </div>
    </div>`;
  const body = openSheet({ title: t('tool.stamp'), html });
  if (!body) return;

  const place = (obj) => {
    closeSheet();
    markup.setTool(null);
    markup.select?.(obj.id);
  };

  body.querySelectorAll('[data-stamp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.stamp;
      const center = viewCenterPdf();
      if (id === 'date') {
        const w = Math.max(120, 150 / (state.scale || 1));
        const h = Math.max(18, 24 / (state.scale || 1));
        const obj = markup.add({
          type: 'date',
          text: today,
          fontSize: Math.max(8, 18 / (state.scale || 1)),
          bbox: freeSpot({ x: center.x - w / 2, y: center.y - h / 2, w, h }),
          color: '#111827',
        });
        place(obj);
        return;
      }
      const preset = STAMP_PRESETS.find((s) => s.id === id);
      if (!preset) return;
      const scale = state.scale || 1;
      const width = Math.min(pdfPageSize().w * 0.62, 240 / scale);
      const height = width * 0.24;
      const obj = markup.add({
        type: 'stamp',
        text: preset.text,
        color: preset.color,
        borderColor: preset.color,
        bbox: freeSpot({ x: center.x - width / 2, y: center.y - height / 2, w: width, h: height }),
        rotation: 0,
        opacity: 0.95,
        fontSize: Math.max(9, Math.min(36, width * 0.13)),
      });
      place(obj);
    });
  });

  const addCustomStamp = (text, color) => {
    const center = viewCenterPdf();
    const scale = state.scale || 1;
    const w = Math.min(pdfPageSize().w * 0.62, 240 / scale);
    const h = w * 0.24;
    const obj = markup.add({
      type: 'stamp',
      text,
      color,
      borderColor: color,
      bbox: freeSpot({ x: center.x - w / 2, y: center.y - h / 2, w, h }),
      rotation: 0,
      opacity: 0.95,
      fontSize: Math.max(9, Math.min(36, w * 0.13)),
    });
    place(obj);
  };
  body.querySelectorAll('[data-stamp-saved]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const st = loadStamps().find((x) => x.id === btn.dataset.stampSaved);
      if (st) addCustomStamp(st.text, st.color);
    });
  });
  body.querySelectorAll('[data-stamp-del]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteStamp(btn.dataset.stampDel);
      openStampTool();
    });
  });

  body.querySelector('#stampAdd')?.addEventListener('click', () => {
    const text = body.querySelector('#stampText')?.value?.trim();
    if (!text) {
      toast(t('stamp.needText'), 'warn');
      return;
    }
    const color = body.querySelector('#stampColor')?.value || '#059669';
    if (body.querySelector('#stampSave')?.checked) saveStamp({ text, color });
    addCustomStamp(text, color);
  });
}

/** Insère une image / photo (appareil photo sur mobile). */
function openImageTool(capture = false) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (capture) input.capture = 'environment';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    const img = new Image();
    img.src = dataUrl;
    await new Promise((r) => {
      img.onload = r;
      img.onerror = r;
    });
    const ratio = (img.naturalWidth || 1) / Math.max(1, img.naturalHeight || 1);
    addImageObject(dataUrl, { ratio, type: 'image', label: file.name });
    toast(t('image.placed'), 'success');
  });
  input.click();
}

function insertMark(symbol) {
  const scale = state.scale || 1;
  const size = Math.max(14, 28 / scale);
  const center = viewCenterPdf();
  const { dx, dy } = cascadeOffset();
  const obj = markup.add({
    type: 'check',
    mark: symbol,
    color: symbol === 'cross' ? '#dc2626' : '#059669',
    bbox: freeSpot({
      x: center.x - size / 2 + dx,
      y: center.y - size / 2 - dy,
      w: size,
      h: size,
    }),
  });
  markup.select?.(obj.id);
}

function insertToday() {
  const today = new Date().toLocaleDateString();
  const scale = state.scale || 1;
  const center = viewCenterPdf();
  const { dx, dy } = cascadeOffset();
  const w = Math.max(90, 110 / scale);
  const h = Math.max(18, 22 / scale);
  const obj = markup.add({
    type: 'date',
    text: today,
    fontSize: Math.max(8, 16 / scale),
    color: '#111827',
    bbox: freeSpot({ x: center.x - w / 2 + dx, y: center.y - h / 2 - dy, w, h }),
  });
  markup.select?.(obj.id);
}

/* ─────────────────── Remplir un formulaire sur la page ─────────────────── */

const formOverlay = { fields: [], areas: [], active: false };

async function loadFormWidgets() {
  try {
    const pageProxy = await state.engine.getPage(state.pageIndex + 1);
    const widgets = await readFormWidgetsFromPage(pageProxy, state.pageIndex + 1);
    formOverlay.fields = widgets.map((w) => ({ ...w, value: state.formValues[w.name] ?? '' }));
  } catch (err) {
    console.warn('[forms] widgets', err);
    formOverlay.fields = [];
  }
  if (!formOverlay.fields.length) {
    try {
      await ensureLines(state.pageIndex + 1);
      const lines = editLinesForPage(state.pageIndex + 1);
      formOverlay.areas = detectFillAreas(lines);
    } catch {
      formOverlay.areas = [];
    }
  } else {
    formOverlay.areas = [];
  }
}

function renderFormOverlay() {
  els.overlay.querySelectorAll('.form-widget').forEach((n) => n.remove());
  if (!formOverlay.active || !state.viewport) return;
  for (const field of formOverlay.fields) {
    const r = pdfRectToViewportRect(field.rect, state.viewport);
    const input =
      field.type === 'checkbox'
        ? `<input type="checkbox" data-form-field="${U.escapeHtml(field.name)}" ${field.value === 'true' ? 'checked' : ''} />`
        : `<input type="text" data-form-field="${U.escapeHtml(field.name)}" value="${U.escapeHtml(field.value || '')}" placeholder="${U.escapeHtml(field.name)}" />`;
    const wrap = document.createElement('label');
    wrap.className = `form-widget ${field.type === 'checkbox' ? 'is-check' : ''}`;
    wrap.style.left = `${r.left}px`;
    wrap.style.top = `${r.top}px`;
    wrap.style.width = `${Math.max(24, r.width)}px`;
    wrap.style.height = `${Math.max(16, r.height)}px`;
    wrap.innerHTML = input;
    els.overlay.appendChild(wrap);
  }
  for (const area of formOverlay.areas) {
    const r = pdfRectToViewportRect(area.bbox, state.viewport);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'form-area';
    btn.style.left = `${r.left}px`;
    btn.style.top = `${r.top}px`;
    btn.style.width = `${Math.max(40, r.width)}px`;
    btn.style.height = `${Math.max(18, r.height + 6)}px`;
    btn.textContent = area.kind === 'signature' ? t('form.signHere') : '';
    btn.addEventListener('click', () => useFillArea(area));
    els.overlay.appendChild(btn);
  }
}

function useFillArea(area) {
  if (area.kind === 'signature') {
    openSignTool();
    return;
  }
  if (area.kind === 'checkbox') {
    insertMark('check');
    return;
  }
  // Champ texte : crée un bloc éditable vierge à l'emplacement détecté.
  const edit = {
    id: U.uid('edit'),
    page: state.pageIndex + 1,
    kind: 'add',
    bbox: { ...area.bbox },
    baseline: area.bbox.y + area.bbox.h * 0.24,
    originalText: '',
    text: '',
    font: 'Helvetica',
    size: Math.max(8, Math.round(area.bbox.h * 0.8)),
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    lineHeight: 1.16,
    color: '#111827',
    bg: null,
    fit: false,
  };
  state.edits.push(edit);
  state.active = { edit, before: U.clone(state.edits), isNew: true };
  renderOverlay();
  inline.open(edit, { isNew: true });
  showEditingUi();
  syncFormatbar();
}

async function openFormTool() {
  routeTo('doc');
  if (!state.engine) return;
  formOverlay.active = true;
  await loadFormWidgets();
  renderOverlay();
  const count = formOverlay.fields.length + formOverlay.areas.length;
  if (!count) {
    toast(t('form.noneFound'), 'info', { duration: 4200 });
    formOverlay.active = false;
    return;
  }
  toast(
    formOverlay.fields.length
      ? t('form.fillOnPage', { n: formOverlay.fields.length })
      : t('form.detected', { n: formOverlay.areas.length }),
    'success',
    { duration: 4200 },
  );
  showFormBar();
}

function showFormBar() {
  els.annobar.hidden = false;
  els.annoSub.hidden = true;
  // Comme pour l'annotation : la barre d'onglets s'efface pour laisser la place
  // aux champs et à la barre Valider / Fermer.
  document.body.classList.add('form-open');
  els.annoTools.innerHTML = `
    <button class="anno-btn" id="formValidate" type="button">${icon('check', 19)}<span>${t('form.validate')}</span></button>
    <button class="anno-btn" id="formClose" type="button">${icon('x', 19)}<span>${t('common.close')}</span></button>`;
  document.getElementById('formValidate')?.addEventListener('click', () => applyFormValues());
  document.getElementById('formClose')?.addEventListener('click', () => closeFormTool());
}

function closeFormTool() {
  formOverlay.active = false;
  document.body.classList.remove('form-open');
  els.overlay.querySelectorAll('.form-widget, .form-area').forEach((n) => n.remove());
  els.annobar.hidden = true;
  renderOverlay();
}

async function applyFormValues() {
  const widgets = els.overlay.querySelectorAll('[data-form-field]');
  widgets.forEach((input) => {
    state.formValues[input.dataset.formField] =
      input.type === 'checkbox' ? (input.checked ? 'true' : '') : input.value;
  });
  if (state.formFields.length) renderFormPanel();
  closeFormTool();
  pushLoading(t('form.applying'));
  try {
    const bytes = await fillFormFields(state.bytes, state.formValues);
    state.bytes = new Uint8Array(bytes);
    await renderCurrent();
    scheduleAutosave();
    toast(t('form.applied'), 'success');
  } catch (err) {
    console.error(err);
    toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
  } finally {
    popLoading();
  }
}

/* ─────────────── Zoom de vignette pour la grille de pages ─────────────── */

async function pageThumbDataUrl(n) {
  const canvas = document.createElement('canvas');
  try {
    await state.engine.renderToCanvas(n, canvas, 0.55);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

/* ─────────────────────────── Grille de pages ─────────────────────────── */

function openPagesGridTool() {
  routeTo('doc');
  if (!state.engine) return;
  const body = openSheet({ title: t('tool.pages'), html: '<div id="pagesGridHost"></div>', size: 'full' });
  if (!body) return;
  const host = body.querySelector('#pagesGridHost');
  renderPagesGrid(host, {
    numPages: state.numPages,
    thumbFor: pageThumbDataUrl,
    onSelect: (n, withMenu) => {
      if (!withMenu) {
        goToPage(n);
        closeSheet();
        return;
      }
      openPageActions(n);
    },
    onReorder: async (order) => {
      const identity = order.every((value, i) => value === i + 1);
      if (identity) return;
      try {
        pushLoading(t('pagesGrid.reordering'));
        const { reorderPages } = await import('./pageOps.js');
        if (typeof reorderPages === 'function') {
          const bytes = await reorderPages(state.bytes, order);
          await openPdfBytes(bytes, state.fileName);
          closeSheet();
        } else {
          toast(t('pagesGrid.manual'), 'info');
        }
      } catch (err) {
        console.error(err);
        toast(t('pagesGrid.failed'), 'error');
      } finally {
        popLoading();
      }
    },
  });
}

function openPageActions(n) {
  const body = openSheet({
    title: t('pagesGrid.page', { n }),
    html: `<div class="sheet-list">
      <button class="sheet-row" data-page-act="rotate" type="button"><span class="sheet-row-icon">${icon('rotate', 18)}</span><span class="sheet-row-text"><strong>${t('pagesGrid.rotate')}</strong><span>${t('pagesGrid.rotateHint')}</span></span></button>
      <button class="sheet-row" data-page-act="left" type="button"><span class="sheet-row-icon">${icon('arrowLeft', 18)}</span><span class="sheet-row-text"><strong>${t('pagesGrid.moveLeft')}</strong></span></button>
      <button class="sheet-row" data-page-act="right" type="button"><span class="sheet-row-icon">${icon('arrowRight', 18)}</span><span class="sheet-row-text"><strong>${t('pagesGrid.moveRight')}</strong></span></button>
      <button class="sheet-row" data-page-act="duplicate" type="button"><span class="sheet-row-icon">${icon('copy', 18)}</span><span class="sheet-row-text"><strong>${t('pagesGrid.duplicate')}</strong></span></button>
      <button class="sheet-row" data-page-act="blank" type="button"><span class="sheet-row-icon">${icon('plus', 18)}</span><span class="sheet-row-text"><strong>${t('pagesGrid.blank')}</strong></span></button>
      <button class="sheet-row" data-page-act="extract" type="button"><span class="sheet-row-icon">${icon('download', 18)}</span><span class="sheet-row-text"><strong>${t('pagesGrid.extract')}</strong></span></button>
      <button class="sheet-row danger" data-page-act="delete" type="button"><span class="sheet-row-icon">${icon('trash', 18)}</span><span class="sheet-row-text"><strong>${t('pagesGrid.delete')}</strong></span></button>
    </div>`,
  });
  if (!body) return;
  body.querySelectorAll('[data-page-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.pageAct;
      closeSheet();
      await runPageAction(act, n);
      if (act !== 'extract') openPagesGridTool();
    });
  });
}

async function runPageAction(act, n) {
  const current = n;
  try {
    if (act === 'rotate') {
      await applyPageOp(t('pagesGrid.rotating'), () => PageOps.rotatePage(state.bytes, current, 90), current);
    } else if (act === 'left' && current > 1) {
      await applyPageOp(t('pagesGrid.moving'), () => PageOps.movePage(state.bytes, current, current - 1), current - 1);
    } else if (act === 'right' && current < state.numPages) {
      await applyPageOp(t('pagesGrid.moving'), () => PageOps.movePage(state.bytes, current, current + 1), current + 1);
    } else if (act === 'delete') {
      await applyPageOp(t('pagesGrid.deleting'), () => PageOps.deletePage(state.bytes, current), Math.min(current, state.numPages - 1) || 1);
    } else if (act === 'blank') {
      await applyPageOp(t('pagesGrid.inserting'), () => PageOps.insertBlankPage(state.bytes, current + 1), current + 1);
    } else if (act === 'duplicate') {
      await applyPageOp(t('pagesGrid.duplicating'), async () => {
        const { PDFDocument } = await import('pdf-lib');
        const src = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
        const out = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
        const [copy] = await out.copyPages(src, [current - 1]);
        out.insertPage(current, copy);
        return out.save();
      }, current + 1);
    } else if (act === 'extract') {
      const { extractPages } = await import('./pageOps.js');
      const bytes = await extractPages(state.bytes, [current]);
      const name = `${U.baseName(state.fileName)}-page-${current}.pdf`;
      U.downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
      toast(t('msg.extracted', { n: 1, name }), 'success');
    }
  } catch (err) {
    console.error(err);
    toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
  }
}

/* ─────────────────────────── OCR en un geste ─────────────────────────── */

function openOcrTool() {
  routeTo('doc');
  if (!state.engine) return;
  const body = openSheet({
    title: t('tool.ocr'),
    html: `${toolHeader('scan', t('ocr.oneGesture'), t('ocr.oneGestureHint'))}
      <div class="btn-row">
        <button class="btn primary" id="ocrOne" type="button">${icon('sparkle', 16)}<span>${t('ocr.makeEditable')}</span></button>
      </div>
      <div id="ocrOneProgress" hidden>${progressMarkup(t('ocr.init'))}</div>
      <div class="ocr-langs-mini">
        <span class="muted small">${t('ocr.langs')}</span>
        <span class="badge" id="ocrDetected">${t('ocr.auto')}</span>
      </div>`,
  });
  if (!body) return;
  const langs = [...document.querySelectorAll('#ocrLang input:checked')].map((i) => i.value);
  const detected = body.querySelector('#ocrDetected');
  if (detected && langs.length) detected.textContent = langs.join(' · ');
  body.querySelector('#ocrOne')?.addEventListener('click', async () => {
    const progress = body.querySelector('#ocrOneProgress');
    const fill = body.querySelector('[data-progress]');
    const label = body.querySelector('[data-progress-label]');
    progress.hidden = false;
    closeSheet();
    try {
      await runOcr([state.pageIndex + 1], {
        onProgress: (ratio, text) => {
          if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
          if (label && text) label.textContent = text;
        },
      });
      toast(t('ocr.doneEditable'), 'success', { duration: 4000 });
    } catch (err) {
      console.error(err);
      toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
    }
  });
}

/* ─────────────────────────── Compression ─────────────────────────── */

async function openCompressTool() {
  routeTo('doc');
  if (!state.engine) {
    toast(t('tool.needDoc'), 'warn');
    els.fileInput.click();
    return;
  }
  const sourceSize = state.bytes?.byteLength || 0;
  const rows = COMPRESS_LEVELS.map(
    (level) => `<button class="compress-row" data-compress="${level.id}" type="button">
      <span class="compress-name">${t(level.label)}</span>
      <span class="compress-size" data-compress-size="${level.id}">…</span>
    </button>`,
  ).join('');
  const body = openSheet({
    title: t('tool.compress'),
    html: `${toolHeader('compress', t('compress.title'), t('compress.hint'))}
      <div class="compress-source">${t('compress.source', { size: U.formatBytes(sourceSize) })}</div>
      <div class="compress-list">${rows}</div>
      <p class="muted xsmall">${t('compress.note')}</p>`,
  });
  if (!body) return;
  for (const level of COMPRESS_LEVELS) {
    try {
      const size = await estimateCompression(state.engine, level, state.numPages);
      const el = body.querySelector(`[data-compress-size="${level.id}"]`);
      if (el) el.textContent = `≈ ${U.formatBytes(size)}`;
    } catch {
      const el = body.querySelector(`[data-compress-size="${level.id}"]`);
      if (el) el.textContent = '—';
    }
  }
  body.querySelectorAll('[data-compress]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const level = COMPRESS_LEVELS.find((l) => l.id === btn.dataset.compress);
      closeSheet();
      await compressDocument(level);
    });
  });
}

async function compressDocument(level) {
  pushLoading(t('compress.working'));
  try {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    for (let n = 1; n <= state.numPages; n++) {
      const canvas = document.createElement('canvas');
      await state.engine.renderToCanvas(n, canvas, level.scale);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', level.quality));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const img = await doc.embedJpg(bytes);
      const size = await state.engine.getPageSize(n);
      const page = doc.addPage([size.width, size.height]);
      page.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
    }
    const out = await doc.save({ useObjectStreams: true });
    const name = `${U.baseName(state.fileName)}-compresse.pdf`;
    U.downloadBlob(new Blob([out], { type: 'application/pdf' }), name);
    toast(t('compress.done', { before: U.formatBytes(state.bytes.byteLength), after: U.formatBytes(out.byteLength) }), 'success', { duration: 6000 });
  } catch (err) {
    console.error(err);
    toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
  } finally {
    popLoading();
  }
}

/* ─────────────────────────── Protection / filigrane ─────────────────────────── */

function openProtectTool() {
  routeTo('doc');
  if (!state.engine) {
    toast(t('tool.needDoc'), 'warn');
    els.fileInput.click();
    return;
  }
  const body = openSheet({
    title: t('tool.protect'),
    html: `${toolHeader('lock', t('protect.title'), t('protect.hint'))}
      <div class="field">
        <span>${t('protect.watermark')}</span>
        <input id="watermarkText" placeholder="${t('protect.watermarkPlaceholder')}" value="${WATERMARK_PRESETS[0]}" />
      </div>
      <div class="chip-row">
        ${WATERMARK_PRESETS.map((w) => `<button class="chip" data-watermark="${w}" type="button">${w}</button>`).join('')}
      </div>
      <label class="field-inline">
        <span>${t('protect.opacity')}</span>
        <input type="range" id="watermarkOpacity" min="6" max="60" value="18" />
      </label>
      <button class="btn primary wide" id="applyWatermark" type="button">${icon('shield', 16)}<span>${t('protect.apply')}</span></button>
      <div class="callout warn small">
        <p>${t('protect.passwordNote')}</p>
        <label class="check compact"><input type="checkbox" id="lockApp" /><span>${t('protect.lockApp')}</span></label>
      </div>`,
  });
  if (!body) return;
  body.querySelectorAll('[data-watermark]').forEach((chip) => {
    chip.addEventListener('click', () => {
      body.querySelector('#watermarkText').value = chip.dataset.watermark;
    });
  });
  body.querySelector('#applyWatermark')?.addEventListener('click', async () => {
    const text = body.querySelector('#watermarkText')?.value?.trim();
    const opacity = Number(body.querySelector('#watermarkOpacity')?.value || 18) / 100;
    if (!text) return;
    closeSheet();
    await applyWatermark(text, opacity);
  });
  body.querySelector('#lockApp')?.addEventListener('change', (ev) => {
    state.lockApp = ev.target.checked;
    scheduleAutosave();
    toast(ev.target.checked ? t('protect.locked') : t('protect.unlocked'), 'info');
  });
}

async function applyWatermark(text, opacity) {
  pushLoading(t('protect.working'));
  try {
    const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
    const doc = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const size = Math.max(28, Math.min(width, height) / 9);
      page.drawText(text, {
        x: width * 0.12,
        y: height * 0.42,
        size,
        font,
        color: rgb(0.35, 0.37, 0.45),
        opacity,
        rotate: degrees(35),
      });
    }
    const out = await doc.save();
    const name = `${U.baseName(state.fileName)}-protege.pdf`;
    U.downloadBlob(new Blob([out], { type: 'application/pdf' }), name);
    toast(t('protect.done'), 'success', { duration: 5000 });
  } catch (err) {
    console.error(err);
    toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
  } finally {
    popLoading();
  }
}

/* ─────────────────────────── Conversion ─────────────────────────── */

function openConvertTool() {
  routeTo('doc');
  if (!state.engine) {
    toast(t('tool.needDoc'), 'warn');
    els.fileInput.click();
    return;
  }
  const body = openSheet({
    title: t('tool.convert'),
    html: `${toolHeader('convert', t('convert.title'), t('convert.hint'))}
      <div class="sheet-list">
        <button class="sheet-row" data-convert="png" type="button"><span class="sheet-row-icon">${icon('image', 18)}</span><span class="sheet-row-text"><strong>${t('convert.png')}</strong><span>${t('convert.pngHint')}</span></span></button>
        <button class="sheet-row" data-convert="jpg" type="button"><span class="sheet-row-icon">${icon('image', 18)}</span><span class="sheet-row-text"><strong>${t('convert.jpg')}</strong><span>${t('convert.jpgHint')}</span></span></button>
        <button class="sheet-row" data-convert="txt" type="button"><span class="sheet-row-icon">${icon('fileText', 18)}</span><span class="sheet-row-text"><strong>${t('convert.txt')}</strong><span>${t('convert.txtHint')}</span></span></button>
        <button class="sheet-row" data-convert="pdf" type="button"><span class="sheet-row-icon">${icon('file', 18)}</span><span class="sheet-row-text"><strong>${t('convert.pdf')}</strong><span>${t('convert.pdfHint')}</span></span></button>
      </div>`,
  });
  if (!body) return;
  body.querySelectorAll('[data-convert]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.convert;
      closeSheet();
      if (kind === 'txt') return handleExportText();
      if (kind === 'pdf') return downloadModifiedPdf();
      pushLoading(t('convert.working'));
      try {
        for (let n = 1; n <= state.numPages; n++) {
          const canvas = document.createElement('canvas');
          await state.engine.renderToCanvas(n, canvas, 2);
          const type = kind === 'jpg' ? 'image/jpeg' : 'image/png';
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
          U.downloadBlob(blob, `${U.baseName(state.fileName)}-page-${n}.${kind}`);
        }
        toast(t('convert.done', { n: state.numPages }), 'success');
      } catch (err) {
        console.error(err);
        toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
      } finally {
        popLoading();
      }
    });
  });
}

/* ───────────────────────── Écran Fichiers (IndexedDB) ───────────────────────── */

let filesCache = [];

/**
 * Document dont les octets ont disparu : on demande à l'utilisateur de
 * rechoisir le fichier. La session, elle, est conservée.
 */
let pendingReopen = null;

function takePendingReopen() {
  const pending = pendingReopen;
  pendingReopen = null;
  return pending;
}

function fileDateLabel(ts) {
  if (!ts) return '';
  try {
    const locale = getLang() === 'en' ? 'en-GB' : getLang() === 'ar' ? 'ar' : 'fr-FR';
    const date = new Date(ts);
    const day = date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
    const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return `${day} ${time}`;
  } catch {
    return '';
  }
}

/**
 * Liste les documents enregistrés (octets + session), sans les octets.
 * Le tri est fait par date de dernière ouverture.
 */
async function loadFiles() {
  return Session.listDocuments();
}

/** Ouvre un document enregistré (octets stockés) et reprend sa session. */
async function openStoredDocument(item) {
  if (!item) return;
  pushLoading(t('files.opening', { name: item.name }));
  try {
    const bytes = await Session.loadBytes(item.key);
    if (!bytes) throw new Error('missing');
    await openPdfBytes(bytes, item.name, '', { session: 'auto' });
  } catch {
    toast(t('files.needFile'), 'warn', { duration: 6000 });
    pendingReopen = { key: item.key, name: item.name };
    renderFilesScreen();
  } finally {
    popLoading();
  }
}

async function deleteStoredDocument(item) {
  if (!item) return;
  const ok = await askConfirm({
    title: t('files.deleteTitle'),
    message: t('files.deleteText', { name: item.name }),
    confirmLabel: t('files.delete'),
    cancelLabel: t('common.cancel'),
  });
  if (!ok) return;
  try {
    await Session.deleteDocument(item.key);
  } catch {
    toast(t('files.saveFailed'), 'error');
    return;
  }
  if (state.hash === item.key) state.hash = null; // ne pas le recréer à l'autosave
  toast(t('files.deleted'), 'success');
  await renderFilesScreen();
}

/** Stockage local indisponible : message clair, réessayer ou réinitialiser. */
function renderFilesError(err) {
  console.warn('[store] liste indisponible', err);
  els.filesEmpty.hidden = true;
  els.filesList.hidden = false;
  els.filesCount.textContent = '!';
  if (els.filesTotal) els.filesTotal.textContent = '';
  els.filesList.innerHTML = `<div class="file-row">
      <div class="file-main">
        <strong>${t('files.storageError')}</strong>
        <span class="file-meta">${t('files.storageErrorHelp')}</span>
        <span class="file-actions">
          <button class="btn primary" type="button" data-retry>${t('files.retry')}</button>
          <button class="btn" type="button" data-reset>${t('files.reset')}</button>
        </span>
      </div>
    </div>`;
  els.filesList.querySelector('[data-retry]')?.addEventListener('click', () => renderFilesScreen());
  els.filesList.querySelector('[data-reset]')?.addEventListener('click', async () => {
    const ok = await askConfirm({
      title: t('files.reset'),
      message: t('files.resetText'),
      confirmLabel: t('files.reset'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await Session.resetStorage();
    } catch {
      toast(t('files.blocked'), 'error', { duration: 9000 });
      return;
    }
    await renderFilesScreen();
  });
}

async function renderFilesScreen() {
  if (!els.filesList) return;
  els.filesList.hidden = false;
  els.filesEmpty.hidden = true;
  els.filesList.innerHTML = `<p class="muted small">${t('files.loading')}</p>`;
  let items;
  let used = 0;
  try {
    [items, used] = await Promise.all([loadFiles(), Session.usedBytes().catch(() => 0)]);
  } catch (err) {
    renderFilesError(err);
    return;
  }
  filesCache = items;
  els.filesCount.textContent = String(items.length);
  els.filesEmpty.hidden = items.length > 0;
  els.filesList.hidden = items.length === 0;
  if (els.filesTotal) {
    els.filesTotal.textContent = items.length
      ? t('files.total', { size: U.formatBytes(used), n: String(items.length) })
      : '';
    Session.storageInfo().then((info) => {
      if (!items.length || !els.filesTotal) return;
      els.filesTotal.textContent =
        t('files.total', { size: U.formatBytes(used), n: String(items.length) }) +
        (info.persisted ? ` · ${t('files.persistent')}` : '');
    });
  }
  if (!items.length) {
    els.filesList.innerHTML = '';
    return;
  }
  els.filesList.innerHTML = items
    .map((f) => {
      const missing = !f.hasBytes;
      const summary = t('files.summary', { e: f.edits, o: f.ocr });
      const details = [fileDateLabel(f.updatedAt), U.formatBytes(f.size)].filter(Boolean).join(' · ');
      return `<div class="file-row${missing ? ' missing' : ''}" data-key="${U.escapeHtml(f.key)}">
        <span class="file-thumb-icon">${icon('fileText', 20)}</span>
        <button class="file-main" type="button" data-open="${U.escapeHtml(f.key)}">
          <strong>${U.escapeHtml(f.name)}</strong>
          <span class="file-meta">${U.escapeHtml(details)}</span>
          <span class="file-meta">${U.escapeHtml(summary)}</span>
          ${missing ? `<span class="file-missing">${t('files.rechoose')}</span>` : ''}
        </button>
        <div class="file-actions">
          <button class="icon-btn file-action" type="button" data-share="${U.escapeHtml(f.key)}" data-i18n-title="common.share" data-icon="share" aria-label="${t('common.share')}"></button>
          <button class="icon-btn file-action" type="button" data-rename="${U.escapeHtml(f.key)}" data-i18n-title="files.rename" data-icon="edit" aria-label="${t('files.rename')}"></button>
          <button class="icon-btn file-action" type="button" data-remove="${U.escapeHtml(f.key)}" data-i18n-title="files.delete" data-icon="trash" aria-label="${t('files.delete')}"></button>
        </div>
      </div>`;
    })
    .join('');
  hydrateIcons(els.filesList);

  els.filesList.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', async () => {
      const item = filesCache.find((f) => f.key === el.dataset.open);
      if (!item) return;
      if (!item.hasBytes) {
        // PDF disparu : on garde la session et on propose de rechoisir le fichier.
        pendingReopen = { key: item.key, name: item.name };
        toast(t('files.needFile'), 'warn', { duration: 8000 });
        els.fileInput.click();
        return;
      }
      await openStoredDocument(item);
    });
  });
  els.filesList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = filesCache.find((f) => f.key === btn.dataset.remove);
      await deleteStoredDocument(item);
    });
  });
  els.filesList.querySelectorAll('[data-rename]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = filesCache.find((f) => f.key === btn.dataset.rename);
      const name = window.prompt(t('files.renamePrompt'), item?.name || '');
      if (!name || !name.trim()) return;
      await Session.renameDocument(btn.dataset.rename, name).catch(() => {});
      if (state.hash === btn.dataset.rename) {
        state.fileName = name.trim();
        updateFileChip();
        document.title = `${U.baseName(state.fileName)} — PDF Studio`;
      }
      await renderFilesScreen();
    });
  });
  els.filesList.querySelectorAll('[data-share]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = filesCache.find((f) => f.key === btn.dataset.share);
      if (!item) return;
      const bytes = await Session.loadBytes(item.key).catch(() => null);
      if (!bytes) {
        toast(t('files.needFile'), 'warn');
        return;
      }
      await shareBlob(
        new Blob([bytes], { type: 'application/pdf' }),
        item.name.endsWith('.pdf') ? item.name : `${item.name}.pdf`
      );
    });
  });
}

/** Routes des outils : ouvre le document si nécessaire, puis l'outil. */
async function openTool(id) {
  if (id === 'compress') return openCompressTool();
  if (id === 'protect') return openProtectTool();
  if (id === 'convert') return openConvertTool();
  if (id === 'pages') {
    routeTo('doc');
    return openPagesGridTool();
  }
  if (id === 'ocr') {
    routeTo('doc');
    return openOcrTool();
  }
  if (!state.engine) {
    toast(t('tool.needDoc'), 'warn', { duration: 4200 });
    els.fileInput.click();
    return;
  }
  if (id === 'edit') {
    routeTo('doc');
    if (!state.edits.length && !state.addMode) startAddText();
    else toast(t('tool.editHint'), 'info', { duration: 3600 });
    return;
  }
  if (id === 'annotate') return openAnnotate();
  if (id === 'sign') return openSignTool();
  if (id === 'form') return openFormTool();
  if (id === 'stamp') return openStampTool();
}

const PANEL_LABELS = { pages: 'tab.pages', ocr: 'tab.ocr', form: 'tab.form', text: 'tab.text' };
const PANEL_ICONS = { pages: 'layers', ocr: 'scan', form: 'edit', text: 'text' };

/** Feuille listant les panneaux disponibles (mobile). */
function openPanelsSheet(direct = null) {
  if (direct) {
    openPanelSheet(direct);
    return;
  }
  const rows = ['pages', 'ocr', 'form', 'text']
    .filter((name) => name !== 'form' || state.formFields.length)
    .map(
      (name) => `<button class="sheet-row" data-panel-open="${name}" type="button">
        <span class="sheet-row-icon">${icon(PANEL_ICONS[name], 19)}</span>
        <span class="sheet-row-text"><strong>${t(PANEL_LABELS[name])}</strong>
        <span>${t(`panel.${name}Hint`)}</span></span>
        ${icon('chevronRight', 16)}
      </button>`,
    )
    .join('');
  const body = openSheet({
    title: t('panel.title'),
    html: `<div class="sheet-list">${rows}</div>`,
    className: 'panel-menu',
  });
  body?.querySelectorAll('[data-panel-open]').forEach((btn) => {
    btn.addEventListener('click', () => openPanelSheet(btn.dataset.panelOpen));
  });
}

/** Ouvre un panneau existant dans une feuille. */
function openPanelSheet(name) {
  const panel = document.querySelector(`.panel[data-panel="${name}"]`);
  if (!panel) return;
  setTab(name);
  updatePanelsForPage();
  hydrateIcons(panel);
  openSheet({ title: t(PANEL_LABELS[name]), node: panel, className: `panel-sheet panel-${name}` });
}

function bindEvents() {
  // Fichier
  [els.btnOpen, els.btnEmptyOpen].forEach((b) => b.addEventListener('click', () => els.fileInput.click()));
  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    els.fileInput.value = '';
    if (file) handleFile(file);
  });
  bindPageTools();
  bindFormTools();
  els.btnExportPng?.addEventListener('click', () => handleExportImage('png'));
  els.btnExportJpg?.addEventListener('click', () => handleExportImage('jpg'));
  els.btnUndo.addEventListener('click', undoEdits);
  els.btnRedo.addEventListener('click', redoEdits);
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
    if (isMobile()) {
      updateExportUi();
      openSheet({ title: t('export.title'), node: els.exportMenu, onClose: closeExportMenu });
      els.exportMenu.hidden = false;
      return;
    }
    els.exportMenu.hidden = !els.exportMenu.hidden;
    updateExportUi();
  });
  els.exportClose.addEventListener('click', closeExportMenu);
  els.btnExportPdf.addEventListener('click', handleExportPdf);
  els.btnSave?.addEventListener('click', handleSave);
  els.editSave?.addEventListener('click', handleSave);
  els.saveAsPdf?.addEventListener('click', () => {
    els.expEdits.checked = true;
    els.expOcr.checked = false;
    handleExportPdf({ suffix: 'modifie' });
  });
  els.saveAsOcr?.addEventListener('click', () => {
    els.expEdits.checked = true;
    els.expOcr.checked = true;
    handleExportPdf({ suffix: 'modifie-ocr' });
  });
  els.saveAsText?.addEventListener('click', handleExportText);
  els.saveAsPng?.addEventListener('click', () => handleExportImage('png'));
  els.saveAsJpg?.addEventListener('click', () => handleExportImage('jpg'));
  els.btnExportText?.addEventListener('click', handleExportText);
  els.exportModalClose.addEventListener('click', closeExportModal);
  els.exportModal.addEventListener('click', (e) => {
    if (e.target === els.exportModal) closeExportModal();
  });
  els.exportCopyText.addEventListener('click', async () => {
    const ok = await U.copyText(els.exportTextPreview.value || '');
    toast(ok ? t('msg.copied') : t('msg.copyFailed'), ok ? 'success' : 'error', { duration: 2400 });
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
  els.btnInspectorToggle.addEventListener('click', () => {
    if (isMobile()) {
      openPanelsSheet();
      return;
    }
    els.inspector.classList.toggle('open');
  });

  // Écrans
  els.homeOpen?.addEventListener('click', () => els.fileInput.click());
  els.filesOpen?.addEventListener('click', () => els.fileInput.click());
  els.filesBrowse?.addEventListener('click', () => els.fileInput.click());
  els.filesRefresh?.addEventListener('click', () => renderFilesScreen());
  els.homeDemoText?.addEventListener('click', () => openDemo('text'));
  els.homeDemoScan?.addEventListener('click', () => openDemo('scan'));
  els.homeResume?.addEventListener('click', () => routeTo('doc'));

  // Édition directe sur la page
  els.btnAddText?.addEventListener('click', startAddText);
  els.btnAddTextTop?.addEventListener('click', startAddText);
  els.hintCancel.addEventListener('click', cancelAddMode);
  els.editDone?.addEventListener('click', () => closeActive());
  els.editUndo?.addEventListener('click', () => {
    closeActive();
    undoEdits();
  });
  els.editRedo?.addEventListener('click', () => {
    closeActive();
    redoEdits();
  });

  bindFormatbar();

  // Toucher en dehors du texte valide la modification.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!state.active) return;
      if (e.target.closest('.inline-shell, #formatbar, #editbar, #docDock, dialog, .popover')) return;
      closeActive();
    },
    true
  );

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
    toast(ok ? t('msg.copied') : t('msg.copyFailed'), ok ? 'success' : 'error', { duration: 2500 });
  });
  els.btnOcrFix.addEventListener('click', () => {
    const pd = getPageData(state.pageIndex + 1);
    if (!pd.ocr?.lines.length) {
      toast(t('msg.noOcrBlock'), 'warn');
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
    toast(ok ? t('msg.pageCopied') : t('msg.copyFailed'), ok ? 'success' : 'error', { duration: 2500 });
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
    if (mod && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) redoEdits();
      else undoEdits();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      redoEdits();
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

/* ── Thème clair / sombre ─────────────────────────────────────────── */

function applyTheme(preference) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effective = preference === 'auto' ? (systemDark ? 'dark' : 'light') : preference;
  if (preference === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = preference;
  if (els.btnTheme) {
    els.btnTheme.innerHTML = icon(effective === 'dark' ? 'sun' : 'moon', 18);
    els.btnTheme.setAttribute(
      'aria-label',
      effective === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre'
    );
    els.btnTheme.title = effective === 'dark' ? 'Mode clair' : 'Mode sombre';
  }
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem('pdf-studio-theme');
  } catch {
    /* stockage indisponible */
  }
  applyTheme(saved || 'auto');
  els.btnTheme?.addEventListener('click', () => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentAttr = document.documentElement.dataset.theme;
    const effective = currentAttr || (systemDark ? 'dark' : 'light');
    const next = effective === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('pdf-studio-theme', next);
    } catch {
      /* ignoré */
    }
    applyTheme(next);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!document.documentElement.dataset.theme) applyTheme('auto');
  });
}

/* ── Zoom par pincement (mobile) ──────────────────────────────────── */

function bindPinchZoom() {
  const el = els.canvasScroll;
  if (!el) return;
  let pinching = false;
  let startDistance = 0;
  let startZoom = 1;
  let factor = 1;

  const distance = (touches) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 2 || !state.engine) return;
      pinching = true;
      factor = 1;
      startDistance = distance(e.touches) || 1;
      startZoom = state.zoom ?? state.scale;
      els.stage.classList.add('pinching');
    },
    { passive: true }
  );

  el.addEventListener(
    'touchmove',
    (e) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
      factor = U.clamp(distance(e.touches) / startDistance, 0.3, 4);
      els.stage.style.transform = `scale(${factor})`;
    },
    { passive: false }
  );

  const end = () => {
    if (!pinching) return;
    pinching = false;
    els.stage.classList.remove('pinching');
    els.stage.style.transform = '';
    state.zoom = U.clamp(startZoom * factor, 0.2, 6);
    renderCurrent();
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

/* ── Balayage horizontal pour changer de page (mobile) ────────────── */

function bindSwipePaging() {
  const el = els.canvasScroll;
  if (!el) return;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;
  let dx = 0;

  const canSwipe = () => {
    if (!state.engine || state.active || markup.tool) return false;
    if (!els.annobar?.hidden) return false;
    if (document.querySelector('dialog[open], #sheet:not([hidden])')) return false;
    // Ne pas voler le geste quand la page dépasse en largeur (zoom, paysage).
    return el.scrollWidth <= el.clientWidth + 8;
  };

  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1 || !canSwipe()) {
        tracking = false;
        return;
      }
      tracking = true;
      dx = 0;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = performance.now();
    },
    { passive: true }
  );

  el.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking || e.touches.length !== 1) return;
      const mx = e.touches[0].clientX - startX;
      const my = e.touches[0].clientY - startY;
      if (Math.abs(my) > 40 && Math.abs(my) > Math.abs(mx)) {
        tracking = false;
        els.stage.style.transform = '';
        return;
      }
      if (Math.abs(mx) < 8) return;
      dx = mx;
      const atStart = state.pageIndex <= 0 && mx > 0;
      const atEnd = state.pageIndex >= state.numPages - 1 && mx < 0;
      const limit = atStart || atEnd ? 24 : 90;
      const offset = U.clamp(mx * 0.45, -limit, limit);
      els.stage.style.transform = `translateX(${offset}px)`;
    },
    { passive: true }
  );

  const finish = (cancelled) => {
    if (!tracking) return;
    tracking = false;
    const elapsed = performance.now() - startTime;
    els.stage.style.transform = '';
    if (cancelled) return;
    const far = Math.abs(dx) > 64;
    const fast = Math.abs(dx) > 32 && elapsed < 320;
    if (!far && !fast) return;
    if (dx < 0 && state.pageIndex < state.numPages - 1) goToPage(state.pageIndex + 2);
    else if (dx > 0 && state.pageIndex > 0) goToPage(state.pageIndex);
  };

  el.addEventListener('touchend', () => finish(false), { passive: true });
  el.addEventListener('touchcancel', () => finish(true), { passive: true });
}

/* ── Navigation clavier dans les onglets ──────────────────────────── */

function bindTabsKeyboard() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      let next = index;
      if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      const target = tabs[next];
      if (target.hidden) return;
      target.focus();
      setTab(target.dataset.tab);
    });
  });
}

/* ── PWA : service worker + invitation à installer ─────────────────── */

let installPromptEvent = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPromptEvent = event;
  toast(t('msg.install'), 'info', {
    action: t('msg.installAction'),
    duration: 9000,
    onAction: async () => {
      if (!installPromptEvent) return;
      installPromptEvent.prompt();
      try {
        await installPromptEvent.userChoice;
      } catch {
        /* ignoré */
      }
      installPromptEvent = null;
    },
  });
});

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const swUrl = U.assetUrl('sw.js');
  navigator.serviceWorker
    .register(swUrl, { scope: new URL(import.meta.env.BASE_URL, location.href).pathname })
    .catch((err) => console.warn('[pwa] service worker non enregistré', err));
}

function initLanguage() {
  const supported = ['fr', 'en', 'ar'];
  let lang = 'fr';
  try {
    const saved = localStorage.getItem('pdf-studio-lang');
    if (saved && supported.includes(saved)) lang = saved;
    else {
      const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase();
      if (supported.includes(nav)) lang = nav;
    }
  } catch {
    /* stockage indisponible */
  }
  if (els.langSelect) {
    els.langSelect.value = lang;
    els.langSelect.addEventListener('change', () => {
      const next = els.langSelect.value;
      applyLanguage(next);
      renderTools();
      try {
        localStorage.setItem('pdf-studio-lang', next);
      } catch {
        /* ignoré */
      }
    });
  }
  applyLanguage(lang);
}

function init() {
  initLanguage();
  hydrateIcons();
  bindEvents();
  els.btnSearch.disabled = true;
  els.btnExport.disabled = true;
  if (els.btnSave) els.btnSave.disabled = true;
  updatePageNav();
  updateZoomLabel();
  hideEditingUi();
  updateOcrButtons();
  renderEditList();
  updateHistoryButtons();
  registerServiceWorker();
  initTheme();
  initDiagnostics();
  initShell({
    onRoute: (name) => {
      if (name === 'doc' && !state.engine) {
        routeTo('home');
        return;
      }
      els.homeResume.hidden = !state.engine;
      if (name !== 'doc') routeBeforeDoc = name;
      if (name === 'files') renderFilesScreen();
    },
    onTool: (id) => openTool(id),
  });
  if (!state.engine) routeTo('home');
  setTimeout(() => showOnboarding(), 700);
  bindPinchZoom();
  bindSwipePaging();
  bindTabsKeyboard();
  updateKeyboardInset();
  window.visualViewport?.addEventListener('resize', updateKeyboardInset);
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
}

init();

// Exposé pour les tests automatisés
window.__pdfStudio = {
  state,
  markup,
  openPdfBytes,
  getPageText,
  exportPdf: (...args) => import('./exporter.js').then((m) => m.exportPdf(...args)),
  /**
   * Injecte un résultat d'OCR pour une page, sans lancer Tesseract. Les tests
   * de bout en bout vérifient ainsi l'édition d'un bloc OCR sans attendre la
   * reconnaissance complète (plusieurs minutes sur un scan).
   */
  /**
   * PDF d'exemple avec deux champs de formulaire, pour les tests de bout en
   * bout du remplissage (aucun échantillon livré n'en contient).
   */
  async makeFormSample() {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Formulaire de test', { x: 60, y: 760, size: 20, font });
    const form = doc.getForm();
    const fields = [
      ['nom', 660, 'Nom et prénom'],
      ['ville', 590, 'Ville'],
    ];
    for (const [name, y, label] of fields) {
      page.drawText(label, { x: 60, y: y + 36, size: 12, font, color: rgb(0.2, 0.2, 0.24) });
      const field = form.createTextField(name);
      field.addToPage(page, {
        x: 60,
        y,
        width: 320,
        height: 28,
        borderWidth: 1,
        borderColor: rgb(0.55, 0.58, 0.65),
      });
    }
    return new Uint8Array(await doc.save());
  },

  setOcrLines(pageNo, lines) {
    const pd = getPageData(pageNo);
    const normalized = (lines || []).map((line, i) => ({
      id: line.id || `p${pageNo}-o${i}`,
      text: line.text,
      source: 'ocr',
      font: line.font || 'Helvetica',
      fontSize: line.fontSize ?? 12,
      baseline: line.baseline ?? line.bbox.y + line.bbox.h * 0.24,
      bbox: line.bbox,
      confidence: line.confidence ?? 0.92,
    }));
    pd.ocr = {
      text: normalized.map((l) => l.text).join('\n'),
      confidence: 0.92,
      lines: normalized,
      words: [],
      langs: ['fra'],
      at: Date.now(),
    };
    pd.ocrStatus = 'done';
    renderOverlay();
    renderEditList();
    return normalized.length;
  },
};
