import './polyfills.js';
import './style.css';
import { PdfEngine, pdfRectToViewportRect, fontTraits } from './pdfEngine.js';
import { recognizeCanvas, recognizeLine, terminateOcr } from './ocrEngine.js';
import { enhanceContrast, deskewCanvas } from './imagePrep.js';
import {
  CLEAN_PRESETS,
  CLEAN_QUALITY_TIERS,
  resolveCleanQuality,
  cleanCanvas,
  encodeCleanedCanvas,
  detectScannedPages,
} from './scanClean.js';
import * as PageOps from './pageOps.js';
import { detectWatermarks, applyWatermarkChange } from './watermark.js';
import { combinePdfs, countPages, nextCombinedName } from './combine.js';
import { readFormFields, readFormWidgetsFromPage, fillFormFields, detectFillAreas } from './forms.js';
import { findMatch } from './search.js';
import { createHistory } from './history.js';
import { createUi } from './ui.js';
import { createInlineEditor } from './inlineEditor.js';
import { estimateOffsetFromFraction, offsetAtPoint } from './caretPoint.js';
import * as Session from './session.js';
import { buildBackup, parseBackup, planRestore } from './backup.js';
import { inkStats, looksBold, otsuThreshold, maskBox, maskIoU, pickFontByWidth } from './scanStyle.js';
import { CACHET_SHAPES, fileToCachet, renderCachet } from './cachet.js';
import { applyFilter, buildPdfFromJpegs, canvasToJpeg, fileToCanvas, rotateCanvas } from './photoPdf.js';
import { CATALOG, BASE_FONTS, GROUP_LABELS, ensureCatalogFont, localFontsSupported, localFontsEnabled, loadLocalFonts, restoreLocalFonts } from './fonts.js';
import { isQuotaError } from './session.js';
import { describeBrowser, formatDiagnostic } from './diagnostic.js';
import { buildSampleTextPdf, buildSampleScanPdf } from './samples.js';
import { icon, hydrateIcons } from './icons.js';
import { applyLanguage, getLang, t, uiLocale } from './i18n.js';
import * as U from './utils.js';
import { initShell, routeTo, openSheet, closeSheet, isSheetOpen, isMobile, renderTools, showOnboarding } from './shell.js';
import { createMarkup, HIGHLIGHT_COLORS, STAMP_PRESETS } from './markup.js';
import { computeEditZoom, centerAxis } from './zoomView.js';
import { groupLinesIntoParagraphs, buildUnitFromGroup, wrapTextToWidth } from './paragraphs.js';
import { hyphenateText, stripShy, SHY } from './hyphenate.js';
import { groupOcrWords } from './ocrGrouping.js';
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
  saveImageStamp,
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
  pagesWrap: $('pagesWrap'),
  readStack: $('readStack'),
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
  homePhotos: $('homePhotos'),
  readEdit: $('readEdit'),
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
  filesBackup: $('filesBackup'),
  filesRestore: $('filesRestore'),
  filesCleanup: $('filesCleanup'),
  filesCleanupLabel: $('filesCleanupLabel'),
  backupInput: $('backupInput'),
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
  cleanedPages: {}, // pageNo -> { preset, intensity, qualityTier, dataUrl, width, height }
  scanPages: [], // pages détectées comme images scannées
  cleanQualityTier: 'standard', // 'eco' | 'standard' (JPEG 0,88) | 'high'
  active: null, // { edit, snapshot, isNew }
  addMode: false,
  editGranularity: null, // 'paragraph' | 'line' | null (auto : paragraphe sur PC, ligne sur téléphone)
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
  onStaticRender: () => refreshContinuousOverlays(),
});

/** Historique dédié aux annotations et aux pages nettoyées ; l'ordre réel est dans actionLog. */
const markupHistory = { stack: [], index: -1 };
const cleanHistory = createHistory(30);
const cleanedImageCache = new Map();

function loadCleanedImage(dataUrl) {
  if (!dataUrl) return Promise.resolve(null);
  if (cleanedImageCache.has(dataUrl)) return cleanedImageCache.get(dataUrl);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      cleanedImageCache.delete(dataUrl);
      reject(new Error('Image nettoyée illisible'));
    };
    img.src = dataUrl;
  });
  if (cleanedImageCache.size > 60) {
    const oldest = cleanedImageCache.keys().next().value;
    cleanedImageCache.delete(oldest);
  }
  cleanedImageCache.set(dataUrl, promise);
  return promise;
}

function hasCleanedPages() {
  return Object.keys(state.cleanedPages || {}).some((k) => {
    const info = state.cleanedPages[k];
    return info?.dataUrl && info.preset !== 'original';
  });
}

/** Ordre des actions (« text » / « markup » / « clean ») : Annuler défait toujours la dernière, quelle qu'elle soit. */
let actionLog = [];
let redoLog = [];
function noteAction(kind) {
  actionLog.push(kind);
  if (actionLog.length > 160) actionLog.shift();
  redoLog = [];
}
function pushTextHistory(snapshot) {
  state.history.push(snapshot);
  noteAction('text');
}
function pushCleanHistory(snapshot) {
  cleanHistory.push(Object.entries(snapshot || {}));
  noteAction('clean');
}
function clearHistories() {
  state.history.clear();
  cleanHistory.clear();
  actionLog = [];
  redoLog = [];
}

function undoEdits() {
  if (!state.engine) return;
  const kind = actionLog.pop();
  if (!kind) {
    toast(t('msg.nothingUndo'), 'info', { duration: 1800 });
    return;
  }
  redoLog.push(kind);
  if (kind === 'markup') {
    undoMarkup();
    toast(t('msg.undone'), 'info', { duration: 1800 });
  } else if (kind === 'clean') {
    undoClean();
  } else undoText();
  updateHistoryButtons();
}

function redoEdits() {
  if (!state.engine) return;
  const kind = redoLog.pop();
  if (!kind) {
    toast(t('msg.nothingRedo'), 'info', { duration: 1800 });
    return;
  }
  actionLog.push(kind);
  if (kind === 'markup') {
    redoMarkup();
    toast(t('msg.redone'), 'info', { duration: 1800 });
  } else if (kind === 'clean') {
    redoClean();
  } else redoText();
  updateHistoryButtons();
}

function pushMarkupHistory({ silent = false } = {}) {
  const snapshot = JSON.stringify(markup.objects);
  if (markupHistory.stack[markupHistory.index] === snapshot) return;
  markupHistory.stack = markupHistory.stack.slice(0, markupHistory.index + 1);
  markupHistory.stack.push(snapshot);
  markupHistory.index = markupHistory.stack.length - 1;
  if (!silent) {
    actionLog.push('markup');
    redoLog = [];
  }
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

/** Met à jour le fond échantillonné des blocs modifiés de la page courante après un nettoyage ou un retour à l'original. */
function refreshPageEditBackgrounds(pageNo) {
  if (!state.viewport || pageNo !== state.pageIndex + 1) return;
  let updated = false;
  for (const e of state.edits) {
    if (e.page !== pageNo || e.kind === 'add' || !e.bg || e.bg === 'none') continue;
    e.bg = sampleBackgroundForBbox(e.origBbox || e.bbox);
    updated = true;
  }
  if (updated) renderOverlay();
}

function applyCleanedPagesSnapshot(snapshot, { autosave = true } = {}) {
  const prevKeys = Object.keys(state.cleanedPages || {}).map(Number);
  state.cleanedPages = U.clone(snapshot || {});
  const nextKeys = Object.keys(state.cleanedPages || {}).map(Number);
  updateExportUi();
  updateHistoryButtons();
  updateDock();
  if (autosave) scheduleAutosave();
  const changedSet = new Set([...prevKeys, ...nextKeys]);
  renderCurrent().then(() => {
    const cur = state.pageIndex + 1;
    if (changedSet.has(cur)) refreshPageEditBackgrounds(cur);
  });
  for (const p of changedSet) {
    refreshThumbForPage(p);
  }
}

function undoClean() {
  if (!state.engine) return;
  const previous = cleanHistory.undo(Object.entries(state.cleanedPages || {}));
  if (previous == null) {
    toast(t('msg.nothingUndo'), 'info', { duration: 1800 });
    return;
  }
  applyCleanedPagesSnapshot(Object.fromEntries(previous));
  toast(t('msg.undone'), 'info', { duration: 1800 });
}

function redoClean() {
  if (!state.engine) return;
  const next = cleanHistory.redo(Object.entries(state.cleanedPages || {}));
  if (next == null) {
    toast(t('msg.nothingRedo'), 'info', { duration: 1800 });
    return;
  }
  applyCleanedPagesSnapshot(Object.fromEntries(next));
  toast(t('msg.redone'), 'info', { duration: 1800 });
}

/**
 * Défilement continu en lecture : suivi de la page visible au fil du scroll
 * et zoom PC à la molette (Ctrl + molette).
 */
let programmaticScrollUntil = 0;
let pinchActive = false;
let lastPinchEndAt = 0;

function isPinchBusy() {
  return (
    pinchActive ||
    Date.now() - lastPinchEndAt < 220 ||
    !!els.stage?.classList.contains('pinching') ||
    !!els.pagesWrap?.classList.contains('pinching')
  );
}

const pageFlipState = {
  count: 0,
  canFlip: () => false,
};

/**
 * Changement de page au bout du défilement dans les modes page par page
 * (Modifier, Annoter, Remplir et signer) : continuer à défiler en bas de page
 * passe à la suivante, et inversement en haut de page.
 * Inactif en mode Lecture (le défilement continu le remplace) et pendant tout
 * glisser de bloc, poignée, signature, flèche ou zoom à deux doigts.
 */
function bindPageFlip() {
  const sc = els.canvasScroll;
  if (!sc) return;
  let acc = 0;
  let lastT = 0;
  let cooldown = 0;
  const isGestureBusy = () =>
    isPinchBusy() || !!inline.isDragging?.() || !!markup.isDragging?.();
  const canFlip = () =>
    !!state.engine &&
    document.body.dataset.route === 'doc' &&
    !isContinuousRead() &&
    (!isReading() ||
      document.body.classList.contains('annotating') ||
      document.body.classList.contains('fillsign')) &&
    !isGestureBusy() &&
    !isSheetOpen() &&
    !document.querySelector('dialog[open]') &&
    Date.now() > cooldown;
  pageFlipState.canFlip = canFlip;
  const atBottom = () => sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
  const atTop = () => sc.scrollTop <= 1;
  const flip = async (dir) => {
    cooldown = Date.now() + 700;
    acc = 0;
    if (dir > 0 && state.pageIndex + 1 < state.numPages) {
      pageFlipState.count += 1;
      await goToPage(state.pageIndex + 2);
    } else if (dir < 0 && state.pageIndex > 0) {
      pageFlipState.count += 1;
      await goToPage(state.pageIndex, { keepScroll: true });
      sc.scrollTop = sc.scrollHeight;
    }
  };
  sc.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey || !canFlip()) {
        acc = 0;
        return;
      }
      const down = e.deltaY > 0;
      if ((down && atBottom()) || (!down && e.deltaY < 0 && atTop())) {
        const now = Date.now();
        if (now - lastT > 300) acc = 0;
        lastT = now;
        acc += e.deltaY;
        if (Math.abs(acc) > 180) flip(acc > 0 ? 1 : -1);
      } else {
        acc = 0;
      }
    },
    { passive: true }
  );
  let touch = null;
  sc.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1 || !canFlip()) {
        touch = null;
        return;
      }
      const tgt = e.target instanceof Element ? e.target : null;
      if (
        tgt?.closest('.inline-shell, .inline-corner, .inline-edge, .mk, [data-mk-handle]') ||
        (markup.tool && tgt?.closest('#stage, #overlay'))
      ) {
        touch = null;
        return;
      }
      touch = { y: e.touches[0].clientY, bottom: atBottom(), top: atTop(), at: Date.now() };
    },
    { passive: true }
  );
  sc.addEventListener(
    'touchmove',
    (e) => {
      if (!touch) return;
      if (e.touches.length !== 1 || isGestureBusy()) {
        touch = null;
      }
    },
    { passive: true }
  );
  sc.addEventListener(
    'touchcancel',
    () => {
      touch = null;
    },
    { passive: true }
  );
  sc.addEventListener(
    'touchend',
    (e) => {
      if (!touch || !canFlip()) {
        touch = null;
        return;
      }
      const dy = (e.changedTouches[0]?.clientY ?? touch.y) - touch.y;
      const t0 = touch;
      touch = null;
      if (dy < -90 && t0.bottom && atBottom()) flip(1);
      else if (dy > 90 && t0.top && atTop()) flip(-1);
    },
    { passive: true }
  );
}

function bindContinuousScrollAndWheel() {
  const sc = els.canvasScroll;
  if (!sc) return;
  let scrollRaf = 0;
  sc.addEventListener(
    'scroll',
    () => {
      if (!isContinuousRead() || Date.now() < programmaticScrollUntil) return;
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        syncVisibleReadPageFromScroll();
      });
    },
    { passive: true }
  );

  let wheelRaf = 0;
  let pendingFactor = 1;
  sc.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || !state.engine) return;
      e.preventDefault();
      pendingFactor *= e.deltaY < 0 ? 1.1 : 1 / 1.1;
      if (wheelRaf) return;
      wheelRaf = requestAnimationFrame(() => {
        wheelRaf = 0;
        const factor = pendingFactor;
        pendingFactor = 1;
        state.zoom = U.clamp((state.zoom ?? state.scale) * factor, 0.2, 6);
        renderCurrent();
      });
    },
    { passive: false }
  );
}

function updateAnnoUndo() {
  const btn = document.getElementById('annoUndo');
  if (btn) btn.disabled = actionLog.length === 0;
  updateHistoryButtons();
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
        if (lines.some((l) => l.hiddenLayer)) preloadScanFonts();
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

/** Mode de sélection en édition : par défaut paragraphe sur PC, ligne sur téléphone. */
function currentEditGranularity() {
  if (state.editGranularity === 'paragraph' || state.editGranularity === 'line') {
    return state.editGranularity;
  }
  return isMobile() ? 'line' : 'paragraph';
}

function syncGranularityUi() {
  const gran = currentEditGranularity();
  document.querySelectorAll('[data-edit-granularity]').forEach((btn) => {
    const active = btn.dataset.editGranularity === gran;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const chip = document.getElementById('hintGranularity');
  if (chip) {
    chip.hidden = !state.engine || isReading() || state.addMode;
    chip.textContent = gran === 'paragraph' ? t('ep.byParagraph') : t('ep.byLine');
  }
  const fabGran = document.getElementById('btnEditGranularity');
  const fabGranLabel = document.getElementById('btnEditGranularityLabel');
  if (fabGran) {
    fabGran.hidden = !state.engine || isReading() || state.addMode;
    if (fabGranLabel) {
      fabGranLabel.textContent = gran === 'paragraph' ? t('ep.byParagraph') : t('ep.byLine');
    }
  }
}

function setEditGranularity(next) {
  if (next !== 'paragraph' && next !== 'line') return;
  if (state.active) closeActive();
  state.editGranularity = next;
  syncGranularityUi();
  renderOverlay();
}

function editUnitsForPage(pageNo) {
  const lines = editLinesForPage(pageNo);
  const pageEdits = state.edits.filter((e) => e.page === pageNo);
  const covered = coveredLineIds(pageEdits);
  const uncovered = lines.filter((l) => l && l.bbox && l.bbox.w > 0 && l.bbox.h > 0 && !covered.has(l.id));
  if (currentEditGranularity() === 'paragraph') {
    return groupLinesIntoParagraphs(uncovered);
  }
  return uncovered.map((l) => buildUnitFromGroup([l]));
}

/* ─────────────────────────── Rendu ─────────────────────────── */

let resizeTimer = null;
let thumbObserver = null;
const measureCtx = document.createElement('canvas').getContext('2d');

/** Lecture seule pure : pages empilées verticalement avec rendu progressif. */
function isContinuousRead() {
  return (
    !!state.engine &&
    isReading() &&
    !document.body.classList.contains('annotating') &&
    !document.body.classList.contains('fillsign')
  );
}

const continuousState = {
  active: false,
  docToken: 0,
  numPages: 0,
  scale: 0,
  sizesEngine: null,
  sizesPromise: null,
  baseSizes: new Map(),
  viewports: new Map(),
  renderTasks: new Map(),
  inFlight: new Map(),
  rendered: new Set(),
  visible: new Set(),
  observer: null,
};

/**
 * Lit la vraie taille de chaque page (getViewport({ scale: 1 }) de pdf.js,
 * rapide et sans aucun rendu de pixels) afin qu'un document mélangeant portrait
 * et paysage ne saute jamais pendant le défilement continu.
 */
async function ensureContinuousPageSizes(engine = state.engine) {
  if (!engine || !engine.numPages) return;
  if (continuousState.sizesEngine === engine && continuousState.baseSizes.size === engine.numPages) {
    return;
  }
  if (continuousState.sizesPromise && continuousState.sizesEngine === engine) {
    return continuousState.sizesPromise;
  }
  if (continuousState.sizesEngine !== engine) {
    continuousState.baseSizes.clear();
    continuousState.viewports.clear();
    continuousState.sizesEngine = engine;
  }
  const job = (async () => {
    const total = engine.numPages;
    const BATCH = 24;
    for (let start = 1; start <= total; start += BATCH) {
      if (state.engine !== engine) return;
      const end = Math.min(total, start + BATCH - 1);
      const batch = [];
      for (let p = start; p <= end; p++) {
        if (continuousState.baseSizes.has(p)) continue;
        batch.push(
          engine.getPage(p).then((pageObj) => {
            const vp = pageObj.getViewport({ scale: 1 });
            continuousState.baseSizes.set(p, { width: vp.width, height: vp.height });
          })
        );
      }
      if (batch.length) await Promise.all(batch);
    }
  })();
  continuousState.sizesPromise = job;
  try {
    await job;
  } finally {
    if (continuousState.sizesPromise === job) {
      continuousState.sizesPromise = null;
    }
  }
}

function cleanSigForPage(pageNo) {
  const info = state.cleanedPages?.[pageNo];
  if (!info?.dataUrl || info.preset === 'original') return 'orig';
  return `${info.preset}:${info.intensity}:${info.qualityTier || ''}:${info.dataUrl.length}`;
}

function getReadSlotParts(pageNo) {
  if (pageNo === 1) {
    return { slot: els.stage, canvas: els.pdfCanvas, overlay: els.overlay };
  }
  const slot = els.readStack?.querySelector(`[data-read-page="${pageNo}"]`);
  if (!slot) return { slot: null, canvas: null, overlay: null };
  return {
    slot,
    canvas: slot.querySelector('canvas'),
    overlay: slot.querySelector('.overlay'),
  };
}

function slotTopInScroller(slot) {
  const sc = els.canvasScroll;
  if (!sc || !slot) return 0;
  const sr = sc.getBoundingClientRect();
  const r = slot.getBoundingClientRect();
  return sc.scrollTop + (r.top - sr.top);
}

function releaseReadPage(pageNo) {
  const task = continuousState.renderTasks.get(pageNo);
  if (task) {
    try {
      task.cancel();
    } catch {
      /* ignore */
    }
    continuousState.renderTasks.delete(pageNo);
  }
  continuousState.inFlight.delete(pageNo);
  const { slot, canvas, overlay } = getReadSlotParts(pageNo);
  if (canvas) {
    canvas.width = 1;
    canvas.height = 1;
  }
  if (overlay) overlay.innerHTML = '';
  if (slot) {
    slot.dataset.renderedScale = '';
    slot.dataset.cleanSig = '';
  }
  continuousState.rendered.delete(pageNo);
}

/** Libère la mémoire des pages éloignées de la zone visible (PDF de 100+ pages). */
function pruneFarReadPages() {
  if (!continuousState.active) return;
  const current = state.pageIndex + 1;
  let minVis = current;
  let maxVis = current;
  if (continuousState.visible.size) {
    minVis = Math.min(...continuousState.visible);
    maxVis = Math.max(...continuousState.visible);
  }
  for (const p of [...continuousState.rendered]) {
    if (continuousState.visible.has(p)) continue;
    if (p >= minVis - 1 && p <= maxVis + 1) continue;
    if (Math.abs(p - current) <= 1) continue;
    releaseReadPage(p);
  }
}

function teardownContinuousRead({ resetCache = false } = {}) {
  if (continuousState.observer) {
    continuousState.observer.disconnect();
    continuousState.observer = null;
  }
  for (const task of continuousState.renderTasks.values()) {
    try {
      task.cancel();
    } catch {
      /* ignore */
    }
  }
  continuousState.renderTasks.clear();
  continuousState.inFlight.clear();
  if (els.readStack) {
    els.readStack.querySelectorAll('canvas').forEach((c) => {
      c.width = 1;
      c.height = 1;
    });
    els.readStack.innerHTML = '';
    els.readStack.hidden = true;
  }
  if (els.overlay) delete els.overlay.dataset.staticMode;
  if (els.stage) {
    delete els.stage.dataset.readPage;
    delete els.stage.dataset.renderedScale;
    delete els.stage.dataset.cleanSig;
  }
  const activeVp = continuousState.viewports.get(state.pageIndex + 1);
  if (activeVp) {
    state.viewport = activeVp;
    markup.attachViewport(activeVp);
  }
  continuousState.active = false;
  continuousState.rendered.clear();
  continuousState.visible.clear();
  if (resetCache) {
    continuousState.docToken = 0;
    continuousState.numPages = 0;
    continuousState.scale = 0;
    continuousState.sizesEngine = null;
    continuousState.sizesPromise = null;
    continuousState.baseSizes.clear();
    continuousState.viewports.clear();
  }
}

function syncVisibleReadPageFromScroll() {
  if (!isContinuousRead() || !continuousState.active || !els.canvasScroll) return;
  const sc = els.canvasScroll;
  const sr = sc.getBoundingClientRect();
  if (!sr.height) return;
  const probeY = sr.top + sr.height * 0.36;
  let bestPage = state.pageIndex + 1;
  let bestScore = -Infinity;
  const checkSlot = (slot, pageNo) => {
    if (!slot || slot.hidden) return;
    const r = slot.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(r.bottom, sr.bottom) - Math.max(r.top, sr.top));
    const containsProbe = probeY >= r.top && probeY <= r.bottom ? sr.height : 0;
    const distPenalty = Math.abs((r.top + r.bottom) / 2 - probeY) * 0.05;
    const score = overlap + containsProbe - distPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestPage = pageNo;
    }
  };
  checkSlot(els.stage, 1);
  if (els.readStack && !els.readStack.hidden) {
    els.readStack.querySelectorAll('[data-read-page]').forEach((slot) => {
      checkSlot(slot, Number(slot.dataset.readPage));
    });
  }
  if (bestPage >= 1 && bestPage <= state.numPages && bestPage - 1 !== state.pageIndex) {
    state.pageIndex = bestPage - 1;
    const vp = continuousState.viewports.get(bestPage);
    if (vp) state.viewport = vp;
    updatePageNav();
    updateThumbActive();
    updatePanelsForPage();
    const activeThumb = els.thumbs?.querySelector('.thumb.active');
    activeThumb?.scrollIntoView({ block: 'nearest' });
    pruneFarReadPages();
  }
}

async function renderReadPage(pageNo, token = state.renderToken, { force = false } = {}) {
  if (!isContinuousRead() || token !== state.renderToken) return;
  if (pageNo < 1 || pageNo > state.numPages) return;
  const { slot, canvas, overlay } = getReadSlotParts(pageNo);
  if (!slot || !canvas || !overlay) return;
  const scale = continuousState.scale || state.scale || 1;
  const scaleKey = String(scale);
  const cleanKey = cleanSigForPage(pageNo);
  if (
    !force &&
    continuousState.rendered.has(pageNo) &&
    slot.dataset.renderedScale === scaleKey &&
    slot.dataset.cleanSig === cleanKey
  ) {
    return;
  }
  const existing = continuousState.inFlight.get(pageNo);
  if (existing && !force && existing.scaleKey === scaleKey && existing.token === token) {
    return existing.promise;
  }

  const job = (async () => {
    const page = await state.engine.getPage(pageNo);
    if (token !== state.renderToken || !isContinuousRead()) return;
    const base = page.getViewport({ scale: 1 });
    continuousState.baseSizes.set(pageNo, { width: base.width, height: base.height });
    const vp = page.getViewport({ scale });
    continuousState.viewports.set(pageNo, vp);
    if (pageNo === state.pageIndex + 1) state.viewport = vp;

    slot.style.width = `${vp.width}px`;
    slot.style.height = `${vp.height}px`;

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxPx = 8000;
    if (vp.width * dpr > maxPx || vp.height * dpr > maxPx) {
      dpr = Math.max(0.5, Math.min(maxPx / vp.width, maxPx / vp.height));
    }

    const prevTask = continuousState.renderTasks.get(pageNo);
    if (prevTask) {
      try {
        prevTask.cancel();
      } catch {
        /* ignore */
      }
      continuousState.renderTasks.delete(pageNo);
    }

    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;
    canvas.width = Math.max(1, Math.floor(vp.width * dpr));
    canvas.height = Math.max(1, Math.floor(vp.height * dpr));
    const ctx = canvas.getContext('2d');

    const cleanInfo = state.cleanedPages?.[pageNo];
    if (cleanInfo?.dataUrl && cleanInfo.preset !== 'original') {
      try {
        const img = await loadCleanedImage(cleanInfo.dataUrl);
        if (token !== state.renderToken || !isContinuousRead()) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } catch (err) {
        console.warn('clean render', err);
      }
    } else {
      try {
        const task = page.render({
          canvasContext: ctx,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          background: '#ffffff',
        });
        continuousState.renderTasks.set(pageNo, task);
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') {
          console.warn('render', err);
        }
        return;
      } finally {
        continuousState.renderTasks.delete(pageNo);
      }
    }
    if (token !== state.renderToken || !isContinuousRead()) return;

    await ensureLines(pageNo);
    if (token !== state.renderToken || !isContinuousRead()) return;

    renderReadPageOverlay(pageNo, overlay, vp, scale);
    slot.dataset.renderedScale = scaleKey;
    slot.dataset.cleanSig = cleanKey;
    continuousState.rendered.add(pageNo);
  })();

  continuousState.inFlight.set(pageNo, { token, scaleKey, promise: job });
  try {
    await job;
  } finally {
    if (continuousState.inFlight.get(pageNo)?.promise === job) {
      continuousState.inFlight.delete(pageNo);
    }
  }
}

function refreshContinuousOverlays() {
  if (!isContinuousRead() || !continuousState.active) return;
  for (const pageNo of continuousState.rendered) {
    const { overlay } = getReadSlotParts(pageNo);
    const vp = continuousState.viewports.get(pageNo);
    if (overlay && vp) renderReadPageOverlay(pageNo, overlay, vp, continuousState.scale || state.scale || 1);
  }
}

async function renderContinuous(token) {
  await ensureContinuousPageSizes(state.engine);
  const anchorPage = U.clamp(state.pageIndex + 1, 1, state.numPages);
  const page = await state.engine.getPage(anchorPage);
  if (token !== state.renderToken || !isContinuousRead()) return;

  positionDock();
  const base = continuousState.baseSizes.get(anchorPage) || page.getViewport({ scale: 1 });
  continuousState.baseSizes.set(anchorPage, { width: base.width, height: base.height });

  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const gutter = narrow ? 16 : 56;
  const availW = Math.max(280, els.canvasScroll.clientWidth - gutter);
  const availH = Math.max(240, els.canvasScroll.clientHeight - gutter);
  const readBoost = 1.25;
  let scale =
    state.zoom == null
      ? narrow
        ? Math.min(availW / base.width, 2) * readBoost
        : Math.min(availW / base.width, availH / base.height, 1.6) * readBoost
      : state.zoom;
  scale = U.clamp(scale, 0.15, 6);
  state.scale = scale;

  const anchorVp = page.getViewport({ scale });
  continuousState.viewports.set(anchorPage, anchorVp);
  state.viewport = anchorVp;
  markup.attachViewport(anchorVp);

  const wasActiveSameDoc =
    continuousState.active &&
    continuousState.docToken === state.docToken &&
    continuousState.numPages === state.numPages;

  let prevOffsetRatioY = 0;
  let prevCenterRatioX = 0.5;
  if (wasActiveSameDoc) {
    const prevSlot = getReadSlotParts(anchorPage).slot;
    if (prevSlot && prevSlot.offsetHeight > 0) {
      const topInSc = slotTopInScroller(prevSlot);
      prevOffsetRatioY = (els.canvasScroll.scrollTop - topInSc) / prevSlot.offsetHeight;
    }
    if (els.canvasScroll.scrollWidth > 0) {
      prevCenterRatioX =
        (els.canvasScroll.scrollLeft + els.canvasScroll.clientWidth / 2) / els.canvasScroll.scrollWidth;
    }
  }

  if (!wasActiveSameDoc) {
    if (continuousState.observer) {
      continuousState.observer.disconnect();
      continuousState.observer = null;
    }
    if (els.readStack) {
      els.readStack.innerHTML = '';
      for (let p = 2; p <= state.numPages; p++) {
        const slot = document.createElement('div');
        slot.className = 'stage read-page';
        slot.dataset.readPage = String(p);
        slot.innerHTML = '<canvas class="read-page-canvas"></canvas><div class="overlay read-page-overlay"></div>';
        els.readStack.appendChild(slot);
      }
      els.readStack.hidden = state.numPages <= 1;
    }
    els.stage.hidden = false;
    els.stage.dataset.readPage = '1';
    els.overlay.dataset.staticMode = '1';
  }

  for (let p = 1; p <= state.numPages; p++) {
    const { slot, canvas } = getReadSlotParts(p);
    if (!slot) continue;
    const pageObj = await state.engine.getPage(p);
    if (token !== state.renderToken || !isContinuousRead()) return;
    const vp = pageObj.getViewport({ scale });
    continuousState.viewports.set(p, vp);
    const w = vp.width;
    const h = vp.height;
    slot.style.width = `${w}px`;
    slot.style.height = `${h}px`;
    if (canvas && !continuousState.rendered.has(p)) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  }

  continuousState.active = true;
  continuousState.docToken = state.docToken;
  continuousState.numPages = state.numPages;
  continuousState.scale = scale;

  if (!continuousState.observer && typeof IntersectionObserver !== 'undefined') {
    continuousState.observer = new IntersectionObserver(
      (entries) => {
        if (!isContinuousRead() || !continuousState.active) return;
        for (const en of entries) {
          const p = Number(en.target.dataset.readPage);
          if (!p) continue;
          if (en.isIntersecting) {
            continuousState.visible.add(p);
            renderReadPage(p, state.renderToken);
          } else {
            continuousState.visible.delete(p);
          }
        }
        pruneFarReadPages();
      },
      { root: els.canvasScroll, rootMargin: '125% 0px' }
    );
    continuousState.observer.observe(els.stage);
    els.readStack?.querySelectorAll('[data-read-page]').forEach((slot) => {
      continuousState.observer.observe(slot);
    });
  }

  if (wasActiveSameDoc) {
    const curSlot = getReadSlotParts(anchorPage).slot;
    if (curSlot) {
      programmaticScrollUntil = Date.now() + 180;
      const topInSc = slotTopInScroller(curSlot);
      els.canvasScroll.scrollTop = Math.max(0, topInSc + prevOffsetRatioY * curSlot.offsetHeight);
      els.canvasScroll.scrollLeft = Math.max(
        0,
        prevCenterRatioX * els.canvasScroll.scrollWidth - els.canvasScroll.clientWidth / 2
      );
    }
  } else if (anchorPage > 1) {
    const curSlot = getReadSlotParts(anchorPage).slot;
    if (curSlot) {
      programmaticScrollUntil = Date.now() + 220;
      const padTop = parseFloat(getComputedStyle(els.canvasScroll).paddingTop) || 16;
      els.canvasScroll.scrollTo({ top: Math.max(0, slotTopInScroller(curSlot) - padTop), behavior: 'auto' });
    }
  }

  await renderReadPage(anchorPage, token);
  if (token !== state.renderToken || !isContinuousRead()) return;

  // Prépare sans bloquer les pages immédiatement voisines si elles sont proches.
  if (anchorPage + 1 <= state.numPages) renderReadPage(anchorPage + 1, token);
  if (anchorPage - 1 >= 1) renderReadPage(anchorPage - 1, token);
  pruneFarReadPages();

  updateZoomLabel();
  updatePageNav();
  updateThumbActive();
  updatePanelsForPage();
}

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
  if (isContinuousRead()) {
    await renderContinuous(token);
    return;
  }
  if (continuousState.active) {
    teardownContinuousRead();
  }
  const n = state.pageIndex + 1;

  const page = await state.engine.getPage(n);
  if (token !== state.renderToken) return;

  positionDock();
  const base = page.getViewport({ scale: 1 });
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const gutter = narrow ? 16 : 56;
  const availW = Math.max(280, els.canvasScroll.clientWidth - gutter);
  const availH = Math.max(240, els.canvasScroll.clientHeight - gutter);
  const readBoost = isReading() ? 1.25 : 1;
  let scale =
    state.zoom == null
      ? narrow
        ? Math.min(availW / base.width, 2) * readBoost
        : Math.min(availW / base.width, availH / base.height, 1.6) * readBoost
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

  const cleanInfo = state.cleanedPages?.[n];
  if (cleanInfo?.dataUrl && cleanInfo.preset !== 'original') {
    try {
      const img = await loadCleanedImage(cleanInfo.dataUrl);
      if (token !== state.renderToken) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, els.pdfCanvas.width, els.pdfCanvas.height);
      if (img) ctx.drawImage(img, 0, 0, els.pdfCanvas.width, els.pdfCanvas.height);
    } catch (err) {
      console.warn('clean render', err);
    }
  } else {
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
  if (isContinuousRead()) {
    state.pageIndex = target - 1;
    updatePageNav();
    updateThumbActive();
    updatePanelsForPage();
    if (!continuousState.active || continuousState.docToken !== state.docToken) {
      await renderCurrent();
    } else {
      const { slot } = getReadSlotParts(target);
      if (slot && !keepScroll) {
        programmaticScrollUntil = Date.now() + 220;
        const padTop = parseFloat(getComputedStyle(els.canvasScroll).paddingTop) || 16;
        els.canvasScroll.scrollTo({ top: Math.max(0, slotTopInScroller(slot) - padTop), behavior: 'auto' });
      }
      await renderReadPage(target, state.renderToken);
      if (target + 1 <= state.numPages) renderReadPage(target + 1, state.renderToken);
      if (target - 1 >= 1) renderReadPage(target - 1, state.renderToken);
      pruneFarReadPages();
    }
    const activeThumb = els.thumbs.querySelector('.thumb.active');
    activeThumb?.scrollIntoView({ block: 'nearest' });
    return;
  }
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
  renderTabs();
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
    const cleanInfo = state.cleanedPages?.[n];
    if (cleanInfo?.dataUrl && cleanInfo.preset !== 'original') {
      const img = await loadCleanedImage(cleanInfo.dataUrl);
      canvas.width = Math.max(1, Math.round(targetW * dpr));
      canvas.height = Math.max(1, Math.round((targetW * (size.height / size.width)) * dpr));
      const tctx = canvas.getContext('2d');
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, canvas.width, canvas.height);
      if (img) tctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      await state.engine.renderToCanvas(n, canvas, targetW / size.width, dpr);
    }
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

function refreshThumbForPage(n) {
  const btn = els.thumbs?.querySelector(`.thumb[data-page="${n}"]`);
  if (!btn || !state.engine) return;
  delete btn.dataset.rendered;
  delete btn.dataset.rendering;
  renderThumbnail(btn, state.docToken);
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
      if (isReading()) {
        setReadMode(false);
        break;
      }
      closeAnnotate?.();
      toast(t('dock.editHint'), 'info', { duration: 3200 });
      break;
    case 'fillsign':
      setFillSign(true);
      break;
    case 'done':
      setFillSign(false);
      break;
    case 'search':
      openSearch();
      break;
    case 'rename':
      openRenameSheet();
      break;
    case 'date':
      insertToday();
      break;
    case 'check':
      insertMark('check');
      break;
    case 'watermark':
      openWatermarkSheet();
      break;
    case 'photos':
      openPhotosTool();
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
    case 'certsign':
      openCertSignSheet();
      break;
    case 'stamp':
      openStampTool();
      break;
    case 'form':
      openFormTool();
      break;
    case 'pages':
    case 'ocr':
    case 'clean':
      openTool(id);
      break;
    default:
  }
  updateDock();
}

/** Place la palette d'outils (ordinateur) dans la colonne réservée, à gauche de la page. */
function positionDock() {
  const dock = els.docDock;
  const sc = els.canvasScroll;
  if (!dock || !sc || window.innerWidth < 901) return;
  const r = sc.getBoundingClientRect();
  if (!r.width) return;
  dock.style.setProperty('--dock-left', `${Math.round(r.left + 10)}px`);
  dock.style.setProperty('--dock-top', `${Math.round(r.top + 10)}px`);
  dock.style.setProperty('--dock-max', `${Math.max(160, Math.round(r.height - 20))}px`);
}
window.addEventListener('resize', () => positionDock());

function updateDock() {
  const dock = els.docDock;
  if (!dock) return;
  positionDock();
  const form = document.getElementById('dockForm');
  if (form) form.hidden = !state.formFields?.length;
  const cleanBtn = document.getElementById('dockClean');
  if (cleanBtn) {
    const hasOcr = [...state.pages.values()].some((p) => p.ocr);
    cleanBtn.hidden = !(state.scanPages?.length || hasOcr || hasCleanedPages());
  }
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

/**
 * Rassemble la couche OCR à embarquer à l'export.
 * Pour toute page dont l'image a été remplacée (`cleanedPages`), la couche de
 * texte existante (OCR reconnu ou couche cachée native du scan) est toujours
 * conservée à sa position exacte pour rester cherchable et modifiable.
 */
async function collectOcrPagesForExport({ includeOcr = true, cleanedPages = null } = {}) {
  const byPage = new Map();
  if (includeOcr) {
    for (const [pageNo, p] of state.pages.entries()) {
      if (p.ocr) byPage.set(pageNo, { pageNo, ocr: p.ocr });
    }
  }
  if (cleanedPages && typeof cleanedPages === 'object') {
    for (const [rawKey, info] of Object.entries(cleanedPages)) {
      const pageNo = Number(rawKey);
      if (!info?.dataUrl || info.preset === 'original') continue;
      if (byPage.has(pageNo)) continue;
      await ensureLines(pageNo);
      const pd = getPageData(pageNo);
      if (pd.ocr) {
        byPage.set(pageNo, { pageNo, ocr: pd.ocr });
      } else if (pd.lines?.length) {
        byPage.set(pageNo, {
          pageNo,
          ocr: {
            lines: pd.lines.map((l) => ({ text: l.text, bbox: l.bbox })),
          },
        });
      }
    }
  }
  return [...byPage.values()];
}

/** Génère le PDF courant (modifications, pages nettoyées, OCR, annotations) sans le télécharger. */
async function buildCurrentPdf() {
  closeActive();
  const { exportPdf } = await import('./exporter.js');
  const cleanedPages = hasCleanedPages() ? state.cleanedPages : null;
  const ocrPages = await collectOcrPagesForExport({ includeOcr: true, cleanedPages });
  const result = await exportPdf({
    sourceBytes: await bytesWithForm(),
    edits: state.edits,
    ocrPages,
    redactMode: 'stream',
    renderPage: null,
    objects: markup.objects,
    cleanedPages,
  });
  return new Blob([result.bytes], { type: 'application/pdf' });
}

/**
 * Document tel qu'il est maintenant (texte modifié, pages nettoyées, annotations) :
 * sert à Compresser, Protéger et Convertir pour que rien ne se perde. Sans
 * modification, on réutilise directement le document ouvert.
 */
async function currentDocumentSource() {
  const dirty = state.edits.length > 0 || (markup.objects?.length || 0) > 0 || hasCleanedPages();
  if (!dirty) return { engine: state.engine, bytes: state.bytes, dispose() {} };
  const blob = await buildCurrentPdf();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const engine = new PdfEngine(bytes.slice());
  await engine.load();
  return { engine, bytes, dispose: () => engine.destroy() };
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

/* ─────────────────────── Lecture seule / modification ─────────────────────── */

function isReading() {
  return document.body.classList.contains('reading');
}

/** Lecture seule : on lit le document ; « Modifier » ouvre les outils d'édition. */
/** Rend tout le fichier modifiable : OCR automatique des pages sans texte (scans). */
async function autoOcrForEdit() {
  if (!state.engine || state.ocr.running || isReading()) return;
  const token = state.docToken;
  await ensureAllLines();
  if (token !== state.docToken || isReading()) return;
  const todo = [];
  for (let n = 1; n <= state.numPages; n++) {
    const pd = getPageData(n);
    const hasText = pd.lines && pd.lines.some((l) => !l.hiddenLayer);
    const hasHidden = pd.lines && pd.lines.some((l) => l.hiddenLayer);
    if (!hasText && !hasHidden && !(pd.ocr && pd.ocr.lines.length) && pd.ocrStatus === 'idle') todo.push(n);
  }
  if (!todo.length) return;
  toast(t('edit.autoOcr', { n: todo.length }), 'info', { duration: 3500 });
  await runOcr(todo);
}

function setReadMode(on) {
  const was = isReading();
  document.body.classList.toggle('reading', !!on);
  if (!on) document.body.classList.remove('fillsign');
  if (on && !was) {
    try {
      closeActive();
      markup.setTool(null);
      if (document.body.classList.contains('annotating')) closeAnnotate();
      if (state.addMode) {
        state.addMode = false;
        els.stage.classList.remove('placing');
      }
    } catch {
      /* rien d'actif */
    }
  }
  if (els.readEdit) els.readEdit.hidden = true;
  updateDock();
  // Passer de la lecture à la modification (ou l'inverse) ne change jamais le
  // zoom : l'écran reste exactement tel quel.
  if (was !== !!on && state.engine) {
    if (state.zoom == null && state.scale) state.zoom = state.scale;
    renderCurrent();
  }
  if (!on && was && state.engine) autoOcrForEdit().catch(() => {});
}

/** Centre la page quand elle dépasse la largeur de l'écran (lecture à 125 %). */
function centerHorizontally() {
  const sc = els.canvasScroll;
  if (!sc) return;
  sc.scrollLeft = Math.max(0, (sc.scrollWidth - sc.clientWidth) / 2);
}

/** Remplir et signer : outils de saisie, sans passer en modification du texte. */
function setFillSign(on) {
  if (on && !isReading()) return;
  const was = document.body.classList.contains('fillsign');
  document.body.classList.toggle('fillsign', !!on);
  if (!on) {
    try {
      markup.setTool(null);
      if (state.addMode) cancelAddMode();
    } catch {
      /* rien d'actif */
    }
  } else {
    toast(t('read.fillHint'), 'info', { duration: 2600 });
  }
  updateDock();
  if (was !== !!on && state.engine) {
    if (state.zoom == null && state.scale) state.zoom = state.scale;
    renderCurrent();
  }
}

/** Renomme le document ouvert (liste des fichiers, titre et exports). */
/* ─────────────── Nettoyage de feuille scannée & filigrane d'image ─────────────── */

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** Rend la page d'origine (non modifiée) sur un canevas à la définition voulue. */
async function renderOriginalPageCanvas(pageNo, maxSide = 1850) {
  const page = await state.engine.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = U.clamp(maxSide / Math.max(1, base.width, base.height), 0.5, 2.8);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
  return canvas;
}

/**
 * Applique un préréglage de nettoyage (ou 'original' pour restaurer) sur une ou
 * plusieurs pages tout en préservant la couche OCR et l'historique Annuler/Rétablir.
 */
async function applyCleanToPages(
  pageNumbers,
  preset,
  { intensity = 0.72, qualityTier = state.cleanQualityTier || 'standard', onProgress } = {}
) {
  if (!state.engine || !pageNumbers?.length) return false;
  const before = U.clone(state.cleanedPages || {});
  const total = pageNumbers.length;
  const qCfg = resolveCleanQuality(qualityTier);
  state.cleanQualityTier = qCfg.id;

  if (preset === 'original') {
    for (let i = 0; i < total; i++) {
      const p = pageNumbers[i];
      onProgress?.((i + 1) / total, i + 1, total);
      delete state.cleanedPages[p];
    }
  } else {
    for (let i = 0; i < total; i++) {
      const p = pageNumbers[i];
      onProgress?.(i / total, i + 1, total);
      await nextPaint();
      const srcCanvas = await renderOriginalPageCanvas(p, qCfg.maxSide);
      const outCanvas = cleanCanvas(srcCanvas, preset, { intensity });
      const dataUrl = encodeCleanedCanvas(outCanvas, preset, qCfg.id);
      const width = outCanvas.width;
      const height = outCanvas.height;
      srcCanvas.width = srcCanvas.height = 1;
      outCanvas.width = outCanvas.height = 1;
      await loadCleanedImage(dataUrl);
      state.cleanedPages[p] = { preset, intensity, qualityTier: qCfg.id, dataUrl, width, height };
      onProgress?.((i + 1) / total, i + 1, total);
    }
  }

  const changed = JSON.stringify(before) !== JSON.stringify(state.cleanedPages);
  if (!changed) return false;

  pushCleanHistory(before);
  updateHistoryButtons();
  updateExportUi();
  updateDock();
  scheduleAutosave();
  await renderCurrent();
  const cur = state.pageIndex + 1;
  if (pageNumbers.includes(cur)) refreshPageEditBackgrounds(cur);
  for (const p of pageNumbers) refreshThumbForPage(p);
  return true;
}

function drawCanvasCopy(src, dst) {
  if (!src || !dst) return;
  dst.width = src.width;
  dst.height = src.height;
  dst.getContext('2d').drawImage(src, 0, 0);
}

/**
 * Relie un bouton « Comparer » et l'aperçu Avant / Après :
 * - Clic court ou clavier : affiche Avant et Après côte à côte.
 * - Appui maintenu (> 220 ms) : montre l'Original tant que le doigt reste posé.
 */
function bindPreviewCompare({
  compareBtn,
  stage,
  paneBefore,
  canvasBefore,
  canvasAfter,
  tagAfter,
  getBeforeCanvas,
  getAfterCanvas,
  getAfterLabel,
}) {
  let split = false;
  let holding = false;
  let holdTimer = 0;
  let holdTriggered = false;

  const paint = () => {
    const beforeC = getBeforeCanvas();
    const afterC = getAfterCanvas();
    if (!beforeC || !afterC) return;
    stage.classList.toggle('is-split', split);
    paneBefore.hidden = !split;
    compareBtn.classList.toggle('active', split || holding);
    compareBtn.setAttribute('aria-pressed', String(split));
    if (split) {
      drawCanvasCopy(beforeC, canvasBefore);
      drawCanvasCopy(afterC, canvasAfter);
      tagAfter.textContent = getAfterLabel();
    } else if (holding) {
      drawCanvasCopy(beforeC, canvasAfter);
      tagAfter.textContent = t('clean.before');
    } else {
      drawCanvasCopy(afterC, canvasAfter);
      tagAfter.textContent = getAfterLabel();
    }
  };

  compareBtn.addEventListener('pointerdown', () => {
    holdTriggered = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      if (split) return;
      holdTriggered = true;
      holding = true;
      paint();
    }, 220);
  });

  const endHold = () => {
    clearTimeout(holdTimer);
    if (holding) {
      holding = false;
      paint();
    }
  };
  compareBtn.addEventListener('pointerup', endHold);
  compareBtn.addEventListener('pointercancel', endHold);
  compareBtn.addEventListener('pointerleave', endHold);

  compareBtn.addEventListener('click', (ev) => {
    if (holdTriggered) {
      holdTriggered = false;
      ev.preventDefault();
      return;
    }
    split = !split;
    holding = false;
    paint();
  });

  canvasAfter.addEventListener('pointerdown', () => {
    if (split) return;
    holding = true;
    paint();
  });
  window.addEventListener('pointerup', endHold, { passive: true });

  return { paint, isSplit: () => split };
}

/** Outil « Nettoyer la feuille » (façon CamScanner) : 8 préréglages + aperçu Avant/Après. */
async function openCleanSheet({ initialPreset = null } = {}) {
  routeTo('doc');
  if (!state.engine) {
    toast(t('tool.needDoc'), 'warn');
    els.fileInput.click();
    return;
  }
  if (isReading()) setReadMode(false);
  closeActive();

  const currentPage = state.pageIndex + 1;
  const existing = state.cleanedPages?.[currentPage];
  let preset = initialPreset || existing?.preset || 'magic';
  let intensityPct = Math.round((existing?.intensity ?? 0.72) * 100);
  let qualityTier = resolveCleanQuality(existing?.qualityTier || state.cleanQualityTier || 'standard').id;
  let scope = 'page';

  const presetButtons = CLEAN_PRESETS.map(
    (id) => `<button class="clean-preset-btn ${id === preset ? 'on' : ''}" type="button" data-clean-preset="${id}">
      <strong>${t(`clean.p.${id}`)}</strong>
      <span>${t(`clean.d.${id}`)}</span>
    </button>`
  ).join('');

  const qualityButtons = Object.keys(CLEAN_QUALITY_TIERS)
    .map(
      (id) =>
        `<button class="${id === qualityTier ? 'on' : ''}" type="button" data-clean-quality="${id}">${t(`clean.q.${id}`)}</button>`
    )
    .join('');

  const html = `<div class="clean-sheet">
    ${toolHeader('sparkle', t('clean.title'), t('clean.subtitle'))}
    <div class="clean-preview-wrap">
      <div class="clean-preview-bar">
        <span class="clean-preview-hint" id="cleanActiveDesc">${t(`clean.d.${preset}`)}</span>
        <button class="clean-compare-btn" id="cleanCompare" type="button" aria-pressed="false">
          ${icon('eye', 15)}<span>${t('clean.compare')}</span>
        </button>
      </div>
      <div class="clean-preview-stage" id="cleanPreviewStage">
        <div class="clean-preview-pane" id="cleanPaneBefore" hidden>
          <canvas id="cleanCanvasBefore"></canvas>
          <span class="clean-preview-tag">${t('clean.before')}</span>
        </div>
        <div class="clean-preview-pane" id="cleanPaneAfter">
          <canvas id="cleanCanvasAfter"></canvas>
          <span class="clean-preview-tag" id="cleanTagAfter">${t('clean.after')}</span>
        </div>
      </div>
    </div>

    <div class="clean-presets" role="group" aria-label="${t('clean.presets')}">
      ${presetButtons}
    </div>

    <div class="clean-intensity-box" id="cleanIntensityBox" ${preset === 'nowatermark' ? '' : 'hidden'}>
      <p class="wm-disclaimer">${t('clean.watermarkNote')}</p>
      <div class="clean-intensity-head">
        <label for="cleanIntensity">${t('clean.intensity')}</label>
        <span id="cleanIntensityVal">${intensityPct} %</span>
      </div>
      <input type="range" id="cleanIntensity" min="10" max="100" step="5" value="${intensityPct}" />
    </div>

    <div class="clean-quality" id="cleanQualityRow">
      <span class="clean-quality-label">${t('clean.qualityLabel')}</span>
      <div class="clean-quality-seg" role="group" aria-label="${t('clean.qualityLabel')}">
        ${qualityButtons}
      </div>
    </div>

    <div class="clean-scope-row" role="group" aria-label="${t('clean.scope')}">
      <button class="seg on" type="button" data-clean-scope="page">${t('clean.scopePage')}</button>
      <button class="seg" type="button" data-clean-scope="all" ${state.numPages <= 1 ? 'disabled' : ''}>${t('clean.scopeAll', { n: state.numPages })}</button>
    </div>

    <div id="cleanProgressBox" hidden>${progressMarkup(t('clean.working', { i: 1, n: 1 }))}</div>

    <div class="clean-actions">
      <button class="btn ghost" type="button" id="cleanReset" ${existing || hasCleanedPages() ? '' : 'disabled'}>
        ${icon('undo', 16)}<span>${t('clean.reset')}</span>
      </button>
      <button class="btn primary" type="button" id="cleanApply">
        ${icon('check', 16)}<span>${t('clean.apply')}</span>
      </button>
    </div>
  </div>`;

  const body = openSheet({ title: t('clean.title'), html, size: 'tall', className: 'clean-sheet-host' });
  if (!body) return;

  const q = (sel) => body.querySelector(sel);
  let beforePreviewCanvas = null;
  let afterPreviewCanvas = null;

  const compareCtrl = bindPreviewCompare({
    compareBtn: q('#cleanCompare'),
    stage: q('#cleanPreviewStage'),
    paneBefore: q('#cleanPaneBefore'),
    canvasBefore: q('#cleanCanvasBefore'),
    canvasAfter: q('#cleanCanvasAfter'),
    tagAfter: q('#cleanTagAfter'),
    getBeforeCanvas: () => beforePreviewCanvas,
    getAfterCanvas: () => afterPreviewCanvas,
    getAfterLabel: () =>
      preset === 'original' ? t('clean.p.original') : `${t('clean.after')} · ${t(`clean.p.${preset}`)}`,
  });

  const refreshPreview = () => {
    if (!beforePreviewCanvas || !body.isConnected) return;
    afterPreviewCanvas = cleanCanvas(beforePreviewCanvas, preset, { intensity: intensityPct / 100 });
    q('#cleanActiveDesc').textContent = t(`clean.d.${preset}`);
    q('#cleanIntensityBox').hidden = preset !== 'nowatermark';
    const hasResettable = scope === 'all' ? hasCleanedPages() : !!state.cleanedPages?.[currentPage];
    q('#cleanReset').disabled = !hasResettable;
    compareCtrl.paint();
  };

  // Rendu initial de la miniature d'aperçu
  renderOriginalPageCanvas(currentPage, 780)
    .then((canvas) => {
      if (!body.isConnected) return;
      beforePreviewCanvas = canvas;
      refreshPreview();
    })
    .catch((err) => console.warn('[clean] aperçu impossible', err));

  body.querySelectorAll('[data-clean-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      preset = btn.dataset.cleanPreset;
      body.querySelectorAll('[data-clean-preset]').forEach((b) => b.classList.toggle('on', b === btn));
      refreshPreview();
    });
  });

  const range = q('#cleanIntensity');
  const debouncedRefresh = U.debounce(refreshPreview, 45);
  range?.addEventListener('input', () => {
    intensityPct = Number(range.value) || 70;
    q('#cleanIntensityVal').textContent = `${intensityPct} %`;
    debouncedRefresh();
  });

  body.querySelectorAll('[data-clean-quality]').forEach((btn) => {
    btn.addEventListener('click', () => {
      qualityTier = btn.dataset.cleanQuality;
      body.querySelectorAll('[data-clean-quality]').forEach((b) => b.classList.toggle('on', b === btn));
    });
  });

  body.querySelectorAll('[data-clean-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      scope = btn.dataset.cleanScope;
      body.querySelectorAll('[data-clean-scope]').forEach((b) => b.classList.toggle('on', b === btn));
      const hasResettable = scope === 'all' ? hasCleanedPages() : !!state.cleanedPages?.[currentPage];
      q('#cleanReset').disabled = !hasResettable;
    });
  });

  const setBusy = (busy) => {
    body.querySelectorAll('button, input').forEach((el) => {
      if (busy) el.dataset.wasDisabled = el.disabled ? '1' : '0';
      el.disabled = busy ? true : el.dataset.wasDisabled === '1';
    });
  };

  q('#cleanApply')?.addEventListener('click', async () => {
    const pages =
      scope === 'all'
        ? Array.from({ length: state.numPages }, (_, i) => i + 1)
        : [currentPage];
    const progBox = q('#cleanProgressBox');
    const progFill = progBox?.querySelector('[data-progress]');
    const progLabel = progBox?.querySelector('[data-progress-label]');
    if (progBox) progBox.hidden = false;
    setBusy(true);
    try {
      await applyCleanToPages(pages, preset, {
        intensity: intensityPct / 100,
        qualityTier,
        onProgress: (ratio, idx, tot) => {
          if (progFill) progFill.style.width = `${Math.round(ratio * 100)}%`;
          if (progLabel) progLabel.textContent = t('clean.working', { i: idx, n: tot });
        },
      });
      closeSheet();
      if (preset === 'original') {
        toast(t('clean.restored'), 'info', { duration: 2400 });
      } else {
        const label = t(`clean.p.${preset}`);
        toast(
          pages.length > 1 ? t('clean.doneMany', { n: pages.length, preset: label }) : t('clean.done', { preset: label }),
          'success',
          { duration: 3000 }
        );
      }
    } catch (err) {
      console.error(err);
      setBusy(false);
      toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
    }
  });

  q('#cleanReset')?.addEventListener('click', async () => {
    const pages =
      scope === 'all'
        ? Object.keys(state.cleanedPages || {}).map(Number)
        : [currentPage];
    if (!pages.length) return;
    setBusy(true);
    try {
      await applyCleanToPages(pages, 'original');
      closeSheet();
      toast(t('clean.restored'), 'info', { duration: 2400 });
    } catch (err) {
      console.error(err);
      setBusy(false);
    }
  });
}

/** Filigranes détectés : renommer ou supprimer (texte PDF), ou atténuer sur une image scannée. */
async function openWatermarkSheet() {
  if (!state.engine) return;
  closeActive();
  const body = openSheet({
    title: t('wm.title'),
    html: `<p class="muted" id="wmBusy">${t('wm.scanning')}</p><div id="wmList"></div>`,
    size: 'tall',
  });
  if (!body) return;
  let marks = [];
  let scanPages = [];
  try {
    const [detectedMarks, detectedScans] = await Promise.all([
      detectWatermarks(state.engine).catch((err) => {
        console.warn('[watermark] détection impossible', err);
        return [];
      }),
      detectScannedPages(state.engine).catch(() => []),
    ]);
    marks = detectedMarks;
    const scanSet = new Set(detectedScans);
    for (const [pageNo, p] of state.pages.entries()) {
      if (p?.ocr) scanSet.add(pageNo);
    }
    for (const k of Object.keys(state.cleanedPages || {})) {
      const p = Number(k);
      if (p >= 1 && p <= state.numPages) scanSet.add(p);
    }
    scanPages = [...scanSet].sort((a, b) => a - b);
  } catch (err) {
    console.warn('[watermark]', err);
  }
  if (!body.isConnected) return;
  body.querySelector('#wmBusy')?.remove();
  const list = body.querySelector('#wmList');
  if (!list) return;

  if (!marks.length && !scanPages.length) {
    list.innerHTML = `<div class="wm-empty"><strong>${t('wm.none')}</strong><p class="muted">${t('wm.noneHint')}</p></div>`;
    return;
  }

  let html = '';
  if (marks.length) {
    html += marks
      .map(
        (m, i) => `<div class="wm-item" data-wm="${i}">
          <div class="wm-meta">${t('wm.found', { n: m.pages.length })}</div>
          <input class="wm-text" type="text" value="${U.escapeHtml(m.text)}" aria-label="${t('wm.renamePrompt')}" autocomplete="off" spellcheck="false" />
          <div class="wm-actions">
            <button class="btn" type="button" data-wm-act="rename">${t('wm.rename')}</button>
            <button class="btn danger" type="button" data-wm-act="delete">${t('wm.delete')}</button>
          </div>
        </div>`
      )
      .join('');
  }

  const currentPage = state.pageIndex + 1;
  const targetScanPage = scanPages.includes(currentPage) ? currentPage : scanPages[0];

  if (scanPages.length) {
    const existing = state.cleanedPages?.[targetScanPage];
    const startIntensity = Math.round((existing?.preset === 'nowatermark' ? existing.intensity : 0.72) * 100);
    const startQuality = resolveCleanQuality(existing?.qualityTier || state.cleanQualityTier || 'standard').id;
    const wmQualityButtons = Object.keys(CLEAN_QUALITY_TIERS)
      .map(
        (id) =>
          `<button class="${id === startQuality ? 'on' : ''}" type="button" data-wm-quality="${id}">${t(`clean.q.${id}`)}</button>`
      )
      .join('');
    html += `<div class="wm-image-card" id="wmImageCard">
      <h3>${t('wm.imgTitle')}</h3>
      <p class="wm-disclaimer" id="wmImgDisclaimer">${t('wm.imgDisclaimer')}</p>
      <div class="clean-preview-wrap">
        <div class="clean-preview-bar">
          <span class="clean-preview-hint">${t('pagesGrid.page', { n: targetScanPage })}</span>
          <button class="clean-compare-btn" id="wmCompare" type="button" aria-pressed="false">
            ${icon('eye', 15)}<span>${t('clean.compare')}</span>
          </button>
        </div>
        <div class="clean-preview-stage" id="wmPreviewStage">
          <div class="clean-preview-pane" id="wmPaneBefore" hidden>
            <canvas id="wmCanvasBefore"></canvas>
            <span class="clean-preview-tag">${t('clean.before')}</span>
          </div>
          <div class="clean-preview-pane" id="wmPaneAfter">
            <canvas id="wmCanvasAfter"></canvas>
            <span class="clean-preview-tag" id="wmTagAfter">${t('clean.after')}</span>
          </div>
        </div>
      </div>
      <div class="clean-intensity-box">
        <div class="clean-intensity-head">
          <label for="wmImgIntensity">${t('wm.imgIntensity')}</label>
          <span id="wmImgIntensityVal">${startIntensity} %</span>
        </div>
        <input type="range" id="wmImgIntensity" min="10" max="100" step="5" value="${startIntensity}" />
      </div>
      <div class="clean-quality" id="wmQualityRow">
        <span class="clean-quality-label">${t('clean.qualityLabel')}</span>
        <div class="clean-quality-seg" role="group" aria-label="${t('clean.qualityLabel')}">
          ${wmQualityButtons}
        </div>
      </div>
      ${
        scanPages.length > 1
          ? `<div class="clean-scope-row">
              <button class="seg on" type="button" data-wm-scope="page">${t('wm.imgScopePage')}</button>
              <button class="seg" type="button" data-wm-scope="all">${t('wm.imgScopeAll', { n: scanPages.length })}</button>
            </div>`
          : ''
      }
      <div id="wmImgProgress" hidden>${progressMarkup(t('wm.imgWorking', { i: 1, n: 1 }))}</div>
      <div class="clean-actions">
        ${
          existing
            ? `<button class="btn ghost" type="button" id="wmImgReset">${icon('undo', 16)}<span>${t('clean.reset')}</span></button>`
            : ''
        }
        <button class="btn primary" type="button" id="wmImgApply">${icon('sparkle', 16)}<span>${t('wm.imgAction')}</span></button>
      </div>
    </div>`;
  }

  list.innerHTML = html;

  list.querySelectorAll('[data-wm-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('[data-wm]');
      const mark = marks[Number(row.dataset.wm)];
      const act = btn.dataset.wmAct;
      const text = row.querySelector('.wm-text').value.trim();
      if (act === 'rename' && (!text || text === mark.text)) return;
      closeSheet();
      changeWatermark(mark, act === 'delete' ? null : text);
    });
  });

  if (scanPages.length) {
    const q = (sel) => list.querySelector(sel);
    let intensityPct = Number(q('#wmImgIntensity')?.value || 72);
    let wmQualityTier = resolveCleanQuality(
      state.cleanedPages?.[targetScanPage]?.qualityTier || state.cleanQualityTier || 'standard'
    ).id;
    let wmScope = 'page';
    let beforeCanvas = null;
    let afterCanvas = null;

    const compareCtrl = bindPreviewCompare({
      compareBtn: q('#wmCompare'),
      stage: q('#wmPreviewStage'),
      paneBefore: q('#wmPaneBefore'),
      canvasBefore: q('#wmCanvasBefore'),
      canvasAfter: q('#wmCanvasAfter'),
      tagAfter: q('#wmTagAfter'),
      getBeforeCanvas: () => beforeCanvas,
      getAfterCanvas: () => afterCanvas,
      getAfterLabel: () => t('clean.after'),
    });

    const refreshWmPreview = () => {
      if (!beforeCanvas || !body.isConnected) return;
      afterCanvas = cleanCanvas(beforeCanvas, 'nowatermark', { intensity: intensityPct / 100 });
      compareCtrl.paint();
    };

    renderOriginalPageCanvas(targetScanPage, 760)
      .then((canvas) => {
        if (!body.isConnected) return;
        beforeCanvas = canvas;
        refreshWmPreview();
      })
      .catch(() => {});

    const debouncedWm = U.debounce(refreshWmPreview, 45);
    q('#wmImgIntensity')?.addEventListener('input', (ev) => {
      intensityPct = Number(ev.target.value) || 72;
      q('#wmImgIntensityVal').textContent = `${intensityPct} %`;
      debouncedWm();
    });

    list.querySelectorAll('[data-wm-quality]').forEach((btn) => {
      btn.addEventListener('click', () => {
        wmQualityTier = btn.dataset.wmQuality;
        list.querySelectorAll('[data-wm-quality]').forEach((b) => b.classList.toggle('on', b === btn));
      });
    });

    list.querySelectorAll('[data-wm-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        wmScope = btn.dataset.wmScope;
        list.querySelectorAll('[data-wm-scope]').forEach((b) => b.classList.toggle('on', b === btn));
      });
    });

    q('#wmImgApply')?.addEventListener('click', async () => {
      if (isReading()) setReadMode(false);
      const targets = wmScope === 'all' ? scanPages : [targetScanPage];
      const prog = q('#wmImgProgress');
      const fill = prog?.querySelector('[data-progress]');
      const lbl = prog?.querySelector('[data-progress-label]');
      if (prog) prog.hidden = false;
      q('#wmImgApply').disabled = true;
      try {
        await applyCleanToPages(targets, 'nowatermark', {
          intensity: intensityPct / 100,
          qualityTier: wmQualityTier,
          onProgress: (ratio, idx, tot) => {
            if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
            if (lbl) lbl.textContent = t('wm.imgWorking', { i: idx, n: tot });
          },
        });
        closeSheet();
        toast(
          targets.length > 1 ? t('wm.imgDoneMany', { n: targets.length }) : t('wm.imgDone'),
          'success',
          { duration: 3000 }
        );
      } catch (err) {
        console.error(err);
        q('#wmImgApply').disabled = false;
        toast(t('wm.failed'), 'error');
      }
    });

    q('#wmImgReset')?.addEventListener('click', async () => {
      const targets = wmScope === 'all' ? scanPages : [targetScanPage];
      await applyCleanToPages(targets, 'original');
      closeSheet();
      toast(t('clean.restored'), 'info', { duration: 2400 });
    });
  }
}

async function changeWatermark(mark, newText) {
  if (!(await confirmDiscard())) return;
  pushLoading(t('wm.scanning'));
  try {
    const page = state.pageIndex + 1;
    const bytes = await applyWatermarkChange(state.bytes, [mark], newText);
    await openPdfBytes(new Uint8Array(bytes), state.fileName, '', { readOnly: false, session: 'skip' });
    if (page > 1) await goToPage(Math.min(page, state.numPages));
    toast(t(newText ? 'wm.renamed' : 'wm.removed'), 'success', { duration: 2400 });
  } catch (err) {
    console.error(err);
    toast(t('wm.failed'), 'error');
  } finally {
    popLoading();
  }
}

function openRenameSheet() {
  if (!state.engine) return;
  const body = openSheet({
    title: t('rename.title'),
    html: `<label class="field"><span>${t('rename.label')}</span>
      <input id="renameInput" type="text" autocomplete="off" spellcheck="false" value="${U.escapeHtml(U.baseName(state.fileName))}" /></label>
      <button class="btn primary block" id="renameOk" type="button">${t('rename.save')}</button>`,
  });
  if (!body) return;
  const input = body.querySelector('#renameInput');
  const apply = async () => {
    const raw = input.value.trim().replace(/[\\/:*?"<>|]+/g, ' ').trim();
    if (!raw) return;
    const name = /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`;
    closeSheet();
    state.fileName = name;
    if (state.hash) await Session.renameDocument(state.hash, name).catch(() => {});
    if (state.hash) registerTab(state.hash, name);
    updateFileChip();
    document.title = `${U.baseName(name)} — PDF Studio`;
    toast(t('rename.done'), 'success', { duration: 1800 });
  };
  body.querySelector('#renameOk').addEventListener('click', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply();
  });
  setTimeout(() => {
    input.focus();
    input.select();
  }, 60);
}

function openDocMenu() {
  if (!state.engine) return;
  const items = [
    isReading()
      ? { id: 'edit', icon: 'edit', title: 'menu.edit', hint: 'menu.editHint' }
      : { id: 'read', icon: 'eye', title: 'menu.read', hint: 'menu.readHint' },
    { id: 'rename', icon: 'edit', title: 'rename.title', hint: 'rename.label' },
    { id: 'combine', icon: 'layers', title: 'tool.combine', hint: 'tool.combineDesc' },
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
        if (id === 'edit') setReadMode(false);
        else if (id === 'read') setReadMode(true);
        else if (id === 'rename') openRenameSheet();
        else if (id === 'combine') openTool('combine');
        else if (id === 'save') handleSave();
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

/* ─────────────── Sélecteur de polices : aperçu de chaque police + recherche ─────────────── */

function openFontPicker() {
  const current = els.fmtFont?.value || 'Helvetica';
  const row = (id, label, css) =>
    `<button class="font-row${id === current ? ' on' : ''}" type="button" data-font="${U.escapeHtml(id)}" data-label="${U.escapeHtml(label.toLowerCase())}">
      <span class="font-name" style="font-family:${css}">${U.escapeHtml(label)}</span>
      <span class="font-sample" style="font-family:${css}">Aa — 0123 éàç</span>
    </button>`;
  const baseCss = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", monospace', 'Noto Sans': '"Noto Sans", sans-serif' };
  let html = `<input class="font-search" id="fontSearch" type="search" placeholder="${t('fonts.search')}" autocomplete="off" />
    <div class="font-list" id="fontList">`;
  if (localFontsSupported() && !CATALOG.some((c) => c.local)) {
    html += `<button class="btn font-local" id="fontLocal" type="button">${t('fonts.local')}</button>`;
  }
  html += `<h4 class="font-group">PDF</h4>${BASE_FONTS.map((f) => row(f.id, f.label, baseCss[f.id])).join('')}`;
  for (const [group, label] of Object.entries(GROUP_LABELS)) {
    const items = CATALOG.filter((c) => c.group === group);
    if (!items.length) continue;
    html += `<h4 class="font-group" data-group="${group}">${label} <small>${items.length}</small></h4>${items.map((c) => row(c.id, c.label, c.css)).join('')}`;
  }
  html += '</div>';
  const body = openSheet({ title: t('fonts.title'), html, size: 'tall', className: 'font-picker' });
  if (!body) return;
  const list = body.querySelector('#fontList');
  body.querySelector('#fontLocal')?.addEventListener('click', async () => {
    try {
      const n = await loadLocalFonts();
      populateFontSelect();
      closeSheet();
      toast(n ? t('fonts.localOk', { n }) : t('fonts.localNone'));
      if (n) openFontPicker();
    } catch (err) {
      toast(t('fonts.localDenied'));
    }
  });
  // Chargement des polices au fil du défilement (aperçu réel de chaque police).
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            io.unobserve(en.target);
            ensureCatalogFont(en.target.dataset.font).catch(() => {});
          }
        },
        { root: body, rootMargin: '200px' }
      )
    : null;
  list.querySelectorAll('.font-row').forEach((el) => {
    if (io) io.observe(el);
    el.addEventListener('click', () => {
      const id = el.dataset.font;
      closeSheet();
      if (!els.fmtFont) return;
      els.fmtFont.value = id;
      els.fmtFont.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  const search = body.querySelector('#fontSearch');
  search.addEventListener('input', () => {
    const q = U.normalizeText(search.value.trim());
    list.querySelectorAll('.font-row').forEach((el) => {
      el.hidden = !!q && !U.normalizeText(el.dataset.label).includes(q);
    });
    list.querySelectorAll('.font-group').forEach((g) => {
      let n = g.nextElementSibling;
      let any = false;
      while (n && !n.classList.contains('font-group')) {
        if (!n.hidden) any = true;
        n = n.nextElementSibling;
      }
      g.hidden = !any;
    });
  });
  list.querySelector('.font-row.on')?.scrollIntoView({ block: 'center' });
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

function coveredLineIds(pageEdits) {
  const s = new Set();
  for (const e of pageEdits) {
    if (e.kind !== 'edit') continue;
    if (Array.isArray(e.lineIds)) for (const id of e.lineIds) s.add(id);
    if (e.lineId) s.add(e.lineId);
  }
  return s;
}

function appendReadTextLayer(targetOverlay, lines, pageEdits, covered, vp) {
  const layer = document.createElement('div');
  layer.className = 'read-text-layer';
  const addSpan = (text, bbox) => {
    if (!text || !text.trim() || !bbox || bbox.w <= 0 || bbox.h <= 0) return;
    const r = pdfRectToViewportRect(bbox, vp);
    if (r.width < 2 || r.height < 2) return;
    const fs = Math.max(4, r.height * 0.82);
    measureCtx.font = `${fs}px sans-serif`;
    const natural = measureCtx.measureText(text).width || 1;
    const sx = U.clamp(r.width / natural, 0.2, 6);
    const span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = `left:${r.left}px;top:${r.top}px;height:${r.height}px;line-height:${r.height}px;font-size:${fs}px;transform:scaleX(${sx});`;
    layer.appendChild(span);
  };
  for (const line of lines) {
    if (covered.has(line.id)) continue;
    addSpan(line.text, line.bbox);
  }
  for (const e of pageEdits) addSpan(e.text, e.bbox);
  targetOverlay.appendChild(layer);
}

function appendPageEditsToOverlay(targetOverlay, pageEdits, vp, scale, activeId = null) {
  // Blocs déplacés ou multi-lignes : le texte d'origine reste recouvert à son ancienne place.
  for (const e of pageEdits) {
    const covers = Array.isArray(e.origBboxes) && e.origBboxes.length
      ? e.origBboxes
      : e.origBbox
        ? [e.origBbox]
        : [];
    for (const box of covers) {
      const ro = pdfRectToViewportRect(box, vp);
      const px = Math.max(1, (e.size || 10) * 0.12) * scale;
      const py = Math.max(0.8, (e.size || 10) * 0.05) * scale;
      const cover = document.createElement('div');
      cover.className = 'edit-cover';
      cover.style.cssText = `position:absolute;left:${ro.left - px}px;top:${ro.top - py}px;width:${ro.width + px * 2}px;height:${ro.height + py * 2}px;background:${e.bg && e.bg !== 'none' ? e.bg : 'transparent'};pointer-events:none;`;
      targetOverlay.appendChild(cover);
    }
  }

  // Blocs modifiés / ajoutés (le bloc en cours d'édition est rendu par l'éditeur)
  for (const e of pageEdits) {
    if (e.id === activeId) continue;
    if (!e.bbox || e.bbox.w <= 0) continue;
    const r = pdfRectToViewportRect(e.bbox, vp);
    if (r.width < 0.5 || r.height < 0.5) continue;
    const padX = Math.max(1, (e.size || 10) * 0.12) * scale;
    const padY = Math.max(0.8, (e.size || 10) * 0.05) * scale;
    const d = document.createElement('div');
    d.className = 'edit-block' + (e.id === activeId ? ' active' : '');
    d.dataset.editId = e.id;
    d.style.left = `${r.left - padX}px`;
    d.style.top = `${r.top - padY}px`;
    d.style.minWidth = `${r.width + padX * 2}px`;
    if (e.wrap) d.style.width = `${r.width + padX * 2}px`;
    d.style.minHeight = `${r.height + padY * 2}px`;
    d.style.padding = `${padY}px ${padX}px`;
    const hasCustomCovers = (Array.isArray(e.origBboxes) && e.origBboxes.length) || !!e.origBbox;
    d.style.background = e.bg && e.bg !== 'none' && !hasCustomCovers ? e.bg : 'transparent';

    if (e.font) ensureCatalogFont(e.font).then((ok) => ok && !fontsRendered.has(e.font) && (fontsRendered.add(e.font), renderOverlay()));
    const fontFamily = U.cssFontFamily(e.font);
    const basePx = Math.max(1, (e.size || 10) * scale);
    let fontSizePx = basePx;
    const lines = String(e.text || '').split('\n');
    if (e.fit !== false && !e.wrap && e.bbox.w > 2 && lines.some((l) => l.trim())) {
      try {
        measureCtx.font = `${e.italic ? 'italic ' : ''}${e.bold ? '700' : '400'} ${basePx}px ${fontFamily}`;
        let maxW = 0;
        const hz = (Number(e.hScale) || 100) / 100;
        const cs = (Number(e.charSpacing) || 0) * scale;
        for (const ln of lines) maxW = Math.max(maxW, (measureCtx.measureText(ln || ' ').width + cs * [...ln].length) * hz);
        const allowed = (e.bbox.w + 1) * scale;
        if (maxW > allowed && maxW > 0) fontSizePx = Math.max(1, basePx * (allowed / maxW));
      } catch {
        /* mesure indisponible */
      }
    }

    const span = document.createElement('span');
    span.className = 'edit-text';
    span.textContent = e.wrap ? editDisplayText(e) : e.text || '';
    span.style.display = 'block';
    span.style.whiteSpace = e.wrap ? 'pre-wrap' : 'pre';
    if (e.wrap) {
      span.style.overflowWrap = 'break-word';
      span.style.hyphens = 'manual';
      span.style.width = `${r.width}px`;
      const ind = editFirstIndent(e);
      if (ind) span.style.textIndent = `${(ind * scale) / Math.max(0.2, (Number(e.hScale) || 100) / 100)}px`;
    }
    span.style.fontFamily = fontFamily;
    span.style.fontSize = `${fontSizePx}px`;
    span.style.lineHeight = String(e.lineHeight || 1.16);
    span.style.fontWeight = e.bold ? '700' : '400';
    span.style.fontStyle = e.italic ? 'italic' : 'normal';
    if (e.underline) span.style.textDecoration = 'underline';
    if (e.align && e.align !== 'left') {
      span.style.textAlign = e.align;
      span.style.width = e.wrap ? `${r.width}px` : '100%';
    }
    span.style.color = e.color || '#111827';
    if (e.charSpacing) span.style.letterSpacing = `${Number(e.charSpacing) * scale * (fontSizePx / basePx)}px`;
    if (e.hScale && Number(e.hScale) !== 100) {
      span.style.transform = `scaleX(${Number(e.hScale) / 100})`;
      span.style.transformOrigin = 'left top';
    }
    if (fontSizePx < basePx) span.style.paddingTop = `${0.88 * (basePx - fontSizePx)}px`;
    d.appendChild(span);

    const flag = document.createElement('span');
    flag.className = 'edit-flag';
    flag.textContent = e.kind === 'add' ? 'Nouveau' : 'Modifié';
    d.appendChild(flag);
    targetOverlay.appendChild(d);
  }
}

function renderReadPageOverlay(pageNo, targetOverlay, vp, scale) {
  if (!targetOverlay || !vp) return;
  targetOverlay.innerHTML = '';
  const lines = editLinesForPage(pageNo);
  const pageEdits = state.edits.filter((e) => e.page === pageNo);
  const covered = coveredLineIds(pageEdits);
  const query = state.search.query;
  const nq = query ? U.normalizeText(query) : '';
  const activeMatch = state.search.matches[state.search.active];

  appendReadTextLayer(targetOverlay, lines, pageEdits, covered, vp);

  if (nq) {
    for (const line of lines) {
      if (!line.bbox || line.bbox.w <= 0 || line.bbox.h <= 0 || covered.has(line.id)) continue;
      if (!U.normalizeText(line.text).includes(nq)) continue;
      const r = pdfRectToViewportRect(line.bbox, vp);
      if (r.width < 1 || r.height < 1) continue;
      const d = document.createElement('div');
      d.className = 'line-block hit' + (activeMatch && activeMatch.page === pageNo && activeMatch.lineId === line.id ? ' hit-active' : '');
      d.dataset.lineId = line.id;
      d.style.left = `${r.left}px`;
      d.style.top = `${r.top}px`;
      d.style.width = `${r.width}px`;
      d.style.height = `${r.height}px`;
      targetOverlay.appendChild(d);
    }
  }

  markup.renderStaticPage(targetOverlay, {
    page: pageNo,
    scale,
    rectFor: (b) => pdfRectToViewportRect(b, vp),
  });
  appendPageEditsToOverlay(targetOverlay, pageEdits, vp, scale, null);
}

function renderOverlay() {
  if (!state.engine) return;
  if (isContinuousRead() && continuousState.active) {
    refreshContinuousOverlays();
    return;
  }
  if (!state.viewport) return;
  clearOverlay();
  const pageNo = state.pageIndex + 1;
  const vp = state.viewport;
  const lines = editLinesForPage(pageNo);
  const pageEdits = state.edits.filter((e) => e.page === pageNo);
  const activeId = state.active?.edit?.id || null;
  const covered = coveredLineIds(pageEdits);
  const query = state.search.query;
  const nq = query ? U.normalizeText(query) : '';
  const activeMatch = state.search.matches[state.search.active];

  // Lecture : texte transparent sélectionnable / copiable par-dessus la page.
  if (isReading() && !document.body.classList.contains('annotating')) {
    appendReadTextLayer(els.overlay, lines, pageEdits, covered, vp);
  }

  // Zones de texte d'origine (cliquables : par paragraphe ou par ligne selon l'option active)
  if (isReading()) {
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
  } else {
    const units = editUnitsForPage(pageNo);
    for (const unit of units) {
      const r = pdfRectToViewportRect(unit.bbox, vp);
      if (r.width < 1 || r.height < 1) continue;
      const d = document.createElement('div');
      d.className =
        'line-block' +
        (unit.source === 'ocr' ? ' ocr' : '') +
        (unit.isParagraph ? ' para-block' : '');
      d.dataset.lineId = unit.id;
      if (unit.isParagraph) d.dataset.paraLines = String(unit.lines.length);
      d.style.left = `${r.left}px`;
      d.style.top = `${r.top}px`;
      d.style.width = `${r.width}px`;
      d.style.height = `${r.height}px`;
      d.title = unit.text;
      if (nq && U.normalizeText(unit.text).includes(nq)) {
        d.classList.add('hit');
        if (activeMatch && activeMatch.page === pageNo && unit.lineIds.includes(activeMatch.lineId)) {
          d.classList.add('hit-active');
        }
      }
      els.overlay.appendChild(d);
    }
  }

  syncGranularityUi();
  markup.render();
  renderFormOverlay();
  appendPageEditsToOverlay(els.overlay, pageEdits, vp, state.scale, activeId);
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
    }, 650);
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
  syncEditPanel();
}

/* ───────── Panneau « Modifier » (grand écran, façon Acrobat) ───────── */

const fmtNum = (v, d) => String(Math.round(Number(v) * 10 ** d) / 10 ** d);

function syncEditPanel() {
  const panel = document.getElementById('editPanel');
  if (!panel) return;
  const e = state.active?.edit;
  const fields = document.getElementById('epFields');
  if (fields) fields.disabled = !e;
  if (!e) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = v;
  };
  const fontName = document.getElementById('epFontName');
  if (fontName) fontName.textContent = e.font || 'Helvetica';
  set('epSize', fmtNum(Number(e.size) || 12, 1));
  set('epColor', normalizeHexColor(e.color));
  set('epLineHeight', fmtNum(Number(e.lineHeight) || 1.16, 2));
  set('epCharSpacing', fmtNum(Number(e.charSpacing) || 0, 2));
  set('epHScale', fmtNum(Number(e.hScale) || 100, 0));
  panel.querySelectorAll('[data-ep-fmt]').forEach((b) => b.classList.toggle('active', !!e[b.dataset.epFmt]));
  panel.querySelectorAll('[data-ep-align]').forEach((b) => b.classList.toggle('active', (e.align || 'left') === b.dataset.epAlign));
}

function bindEditPanel() {
  const panel = document.getElementById('editPanel');
  if (!panel) return;
  // Les boutons ne prennent pas le focus : le curseur reste dans le bloc édité.
  panel.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) ev.preventDefault();
  });
  document.querySelectorAll('[data-edit-granularity]').forEach((btn) =>
    btn.addEventListener('click', () => setEditGranularity(btn.dataset.editGranularity))
  );
  document.getElementById('hintGranularity')?.addEventListener('click', () => {
    setEditGranularity(currentEditGranularity() === 'paragraph' ? 'line' : 'paragraph');
  });
  document.getElementById('btnEditGranularity')?.addEventListener('click', () => {
    setEditGranularity(currentEditGranularity() === 'paragraph' ? 'line' : 'paragraph');
  });
  panel.querySelectorAll('[data-ep-fmt]').forEach((btn) =>
    btn.addEventListener('click', () => applyFormat((e) => {
      e[btn.dataset.epFmt] = !e[btn.dataset.epFmt];
    }))
  );
  panel.querySelectorAll('[data-ep-align]').forEach((btn) =>
    btn.addEventListener('click', () => applyFormat((e) => {
      e.align = btn.dataset.epAlign;
    }))
  );
  const num = (id, key, min, max, def) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => {
      const v = parseFloat(String(el.value).replace(',', '.'));
      if (!Number.isFinite(v)) return;
      applyFormat((e) => {
        e[key] = U.clamp(v, min, max);
        if (key === 'size') e.fit = false; // taille choisie à la main : respectée telle quelle
      });
    });
    el?.addEventListener('change', () => {
      if (!Number.isFinite(parseFloat(el.value))) el.value = def;
      syncEditPanel();
    });
  };
  num('epSize', 'size', 4, 200, 12);
  num('epLineHeight', 'lineHeight', 0.8, 2.6, 1.16);
  num('epCharSpacing', 'charSpacing', -5, 50, 0);
  num('epHScale', 'hScale', 20, 400, 100);
  document.getElementById('epColor')?.addEventListener('input', (ev) => {
    const color = normalizeHexColor(ev.target.value);
    applyFormat((e) => {
      e.color = color;
    });
  });
  document.getElementById('epFont')?.addEventListener('click', () => {
    if (!state.active?.edit || !els.fmtFont) return;
    els.fmtFont.value = state.active.edit.font || 'Helvetica';
    openFontPicker();
  });
  document.getElementById('epDuplicate')?.addEventListener('click', () => duplicateActiveEdit());
  document.getElementById('epDelete')?.addEventListener('click', () => deleteActiveEdit());
  document.getElementById('epAddText')?.addEventListener('click', () => startAddText());
  document.getElementById('epCleanPage')?.addEventListener('click', () => openCleanSheet());
  document.getElementById('epClose')?.addEventListener('click', () => {
    closeActive();
    setReadMode(true);
  });
  syncEditPanel();
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
  restoreLocalFonts().then((n) => n && populateFontSelect()).catch(() => {});
  bindDock();
  els.btnDocMenu?.addEventListener('click', openDocMenu);
  els.fileChip?.addEventListener('click', () => {
    if (state.engine) openRenameSheet();
  });
  document.getElementById('replaceOne')?.addEventListener('click', () => replaceMatches(false));
  document.getElementById('replaceAll')?.addEventListener('click', () => replaceMatches(true));
  els.btnShare?.addEventListener('click', () => shareCurrentPdf());
  els.editShare?.addEventListener('click', () => shareCurrentPdf());
  els.btnBack?.addEventListener('click', goBack);
  els.editBack?.addEventListener('click', goBack);
  // Le menu natif est remplacé par le sélecteur avec aperçu des polices.
  for (const ev of ['mousedown', 'touchstart']) {
    els.fmtFont?.addEventListener(
      ev,
      (e) => {
        e.preventDefault();
        openFontPicker();
      },
      { passive: false }
    );
  }
  els.fmtFont?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFontPicker();
    }
  });
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
  // Sur grand écran, la mise en page reste strictement la même qu'en lecture
  // (panneaux, barre du haut, défilement) : seule la barre de mise en forme s'ajoute.
  const wide = window.innerWidth >= 901;
  document.body.classList.toggle('editing-wide', wide);
  document.body.classList.toggle('editing', !wide);
  if (els.editbar) els.editbar.hidden = wide;
  if (els.editTitle) {
    els.editTitle.textContent = e.kind === 'add' ? t('editbar.addTitle') : t('editbar.title');
  }
  updateEditbarCount();
  updateHistoryButtons();
  showFormatbar();
}

function hideEditingUi() {
  document.body.classList.remove('editing', 'editing-wide');
  if (els.editbar) els.editbar.hidden = true;
  hideFormatbar();
  queueMicrotask(syncEditPanel);
}

function updateEditbarCount() {
  if (!els.editbarCount) return;
  const n = state.edits.length;
  els.editbarCount.textContent = String(n);
  els.editbarCount.hidden = n === 0;
}

function updateHistoryButtons() {
  const canUndo = actionLog.length > 0;
  const canRedo = redoLog.length > 0;
  if (els.btnUndo) els.btnUndo.disabled = !canUndo;
  if (els.btnRedo) els.btnRedo.disabled = !canRedo;
  if (els.editUndo) els.editUndo.disabled = !canUndo;
  if (els.editRedo) els.editRedo.disabled = !canRedo;
}

const refreshTextEcho = U.debounce(() => {
  updateTextPanel();
}, 200);

let wrapMeasureEl = null;

/** Retrait de première ligne d'un bloc (pt), seulement pour un texte aligné à gauche ou justifié. */
function editFirstIndent(edit) {
  const ind = Number(edit?.indent) || 0;
  if (!(ind > 0) || !edit.wrap) return 0;
  const align = edit.align || 'left';
  if (align !== 'left' && align !== 'justify') return 0;
  return Math.min(ind, Math.max(0, (edit.bbox?.w || 0) * 0.6));
}

function setHidden(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: false });
}

/**
 * Texte affiché d'un bloc à retour automatique, avec traits d'union
 * conditionnels (U+00AD) : tous les mots longs d'un paragraphe justifié, et,
 * quelle que soit l'alignement, les mots trop longs pour tenir sur une ligne.
 */
function editDisplayText(edit) {
  const raw = String(edit?.text || '');
  if (!edit?.wrap || !raw) return raw;
  const scale = state.scale || 1;
  const hz = (Number(edit.hScale) || 100) / 100;
  const cs = (Number(edit.charSpacing) || 0) * scale;
  const basePx = Math.max(1, (Number(edit.size) || 10) * scale);
  const widthPx = Math.max(8, (edit.bbox?.w || 0) * scale);
  const key = JSON.stringify([raw, edit.align, edit.font, edit.bold, edit.italic, edit.size, edit.hScale, edit.charSpacing, Math.round(widthPx), edit.hyphenate]);
  if (edit._displayKey === key && typeof edit._display === 'string') return edit._display;
  let out = raw;
  if (edit.hyphenate !== false) {
    if ((edit.align || 'left') === 'justify') {
      out = hyphenateText(raw);
    } else {
      try {
        measureCtx.font = `${edit.italic ? 'italic ' : ''}${edit.bold ? '700' : '400'} ${basePx}px ${U.cssFontFamily(edit.font)}`;
        const tooLong = (w) => (measureCtx.measureText(w).width + cs * w.length) * hz > widthPx * 0.98;
        out = hyphenateText(raw, { minWordLength: 6, filter: tooLong });
      } catch {
        out = raw;
      }
    }
  }
  setHidden(edit, '_display', out);
  setHidden(edit, '_displayKey', key);
  return out;
}

/**
 * Mesure les lignes visuelles réellement affichées à l'écran pour un bloc à
 * retour automatique (`edit.wrap`), afin que l'export PDF respecte les mêmes
 * retours à la ligne au mot près (césure et retrait de première ligne compris).
 */
function computeEditWrappedLines(edit) {
  if (!edit || !edit.wrap || !(edit.bbox?.w > 4)) {
    if (edit) {
      delete edit.wrappedLines;
      delete edit.wrappedLineEnds;
    }
    return null;
  }
  const raw = String(edit.text || '');
  if (!raw.trim()) {
    edit.wrappedLines = [''];
    edit.wrappedLineEnds = [true];
    return edit.wrappedLines;
  }
  const display = editDisplayText(edit);
  const scale = state.scale || 1;
  const basePx = Math.max(1, (Number(edit.size) || 10) * scale);
  const hz = (Number(edit.hScale) || 100) / 100;
  const cs = (Number(edit.charSpacing) || 0) * scale;
  const widthPx = Math.max(8, edit.bbox.w * scale);
  const indentPx = (editFirstIndent(edit) * scale) / Math.max(0.2, hz);
  const fontFamily = U.cssFontFamily(edit.font);
  // Ligne coupée sur un trait d'union conditionnel : le tiret devient visible.
  const finish = (str, brokenInside) => {
    let t = str.replace(/[ \t]+$/, '');
    if (brokenInside && t.endsWith(SHY)) t = t.slice(0, -1) + '-';
    return stripShy(t);
  };

  if (typeof document !== 'undefined' && document.body && typeof document.createRange === 'function') {
    if (!wrapMeasureEl || !wrapMeasureEl.isConnected) {
      wrapMeasureEl = document.createElement('div');
      wrapMeasureEl.setAttribute('aria-hidden', 'true');
      wrapMeasureEl.style.cssText =
        'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;margin:0;padding:0;border:0;white-space:pre-wrap;overflow-wrap:break-word;hyphens:manual;';
      document.body.appendChild(wrapMeasureEl);
    }
    wrapMeasureEl.style.fontFamily = fontFamily;
    wrapMeasureEl.style.fontSize = `${basePx}px`;
    wrapMeasureEl.style.fontWeight = edit.bold ? '700' : '400';
    wrapMeasureEl.style.fontStyle = edit.italic ? 'italic' : 'normal';
    wrapMeasureEl.style.lineHeight = String(edit.lineHeight || 1.16);
    wrapMeasureEl.style.letterSpacing = cs ? `${cs}px` : 'normal';
    wrapMeasureEl.style.width = `${widthPx / Math.max(0.2, hz)}px`;

    const out = [];
    const ends = [];
    const range = document.createRange();
    let firstPara = true;
    for (const para of display.split('\n')) {
      wrapMeasureEl.style.textIndent = firstPara && indentPx ? `${indentPx}px` : '0px';
      firstPara = false;
      if (!para) {
        out.push('');
        ends.push(true);
        continue;
      }
      wrapMeasureEl.textContent = para;
      const node = wrapMeasureEl.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) {
        out.push(stripShy(para));
        ends.push(true);
        continue;
      }
      let lineStart = 0;
      let curTop = null;
      const len = para.length;
      for (let i = 0; i < len; i++) {
        if (para[i] === ' ' || para[i] === SHY) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rects = range.getClientRects();
        const r = rects[rects.length - 1];
        if (!r || (!r.width && !r.height)) continue;
        if (curTop === null) {
          curTop = r.top;
        } else if (r.top - curTop > basePx * 0.45) {
          out.push(finish(para.slice(lineStart, i), true));
          ends.push(false);
          lineStart = i;
          curTop = r.top;
        }
      }
      out.push(finish(para.slice(lineStart), false));
      ends.push(true);
    }
    wrapMeasureEl.textContent = '';
    wrapMeasureEl.style.textIndent = '0px';
    if (out.length) {
      edit.wrappedLines = out;
      edit.wrappedLineEnds = ends;
      return out;
    }
  }

  measureCtx.font = `${edit.italic ? 'italic ' : ''}${edit.bold ? '700' : '400'} ${basePx}px ${fontFamily}`;
  const measureFn = (str) => (measureCtx.measureText(stripShy(str)).width + cs * [...stripShy(str)].length) * hz;
  const lines = [];
  const ends = [];
  let first = true;
  for (const para of display.split('\n')) {
    const sub = wrapTextToWidth(para, widthPx, measureFn, { firstIndent: first ? indentPx * hz : 0 });
    first = false;
    for (let i = 0; i < sub.length; i++) {
      lines.push(sub[i]);
      ends.push(i === sub.length - 1);
    }
  }
  edit.wrappedLines = lines;
  edit.wrappedLineEnds = ends;
  return lines;
}

function onInlineChange() {
  if (state.active?.edit?.wrap) {
    computeEditWrappedLines(state.active.edit);
  }
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
    Number(e.charSpacing) || 0,
    Number(e.hScale) || 100,
    !!e.wrap,
    e.wrappedLines || null,
    e.bbox ? [Math.round(e.bbox.x), Math.round(e.bbox.y), Math.round(e.bbox.w), Math.round(e.bbox.h)] : null,
  ]);
}

/* ─────────────── Style des lignes de scan (police, gras) ─────────────── */

/** Polices sans empattement proposées pour imiter un scan (par ordre de préférence). */
const SCAN_FONTS = ['Arimo', 'Inter', 'DM Sans', 'Manrope', 'Nunito Sans', 'Roboto', 'Open Sans', 'DejaVu Sans', 'Lato', 'Source Sans 3', 'Fira Sans', 'PT Sans', 'Work Sans', 'IBM Plex Sans', 'Noto Sans', 'Cabin', 'Barlow'];
let scanFontsRequested = false;

function preloadScanFonts() {
  if (scanFontsRequested) return;
  scanFontsRequested = true;
  for (const id of SCAN_FONTS) ensureCatalogFont(id).catch(() => {});
}

const scanMeasureCtx = document.createElement('canvas').getContext('2d');

/**
 * Pour une ligne de scan : gras ou non (épaisseur du trait) et police dont la
 * largeur colle à la ligne. Renvoie null si rien de fiable n'est mesurable.
 */
function guessScanLineStyle(line) {
  if (!state.viewport || !line.text) return null;
  const rect = pdfRectToViewportRect(line.bbox, state.viewport);
  const canvas = els.pdfCanvas;
  const ratioX = canvas.width / Math.max(1, parseFloat(canvas.style.width) || canvas.width);
  const ratioY = canvas.height / Math.max(1, parseFloat(canvas.style.height) || canvas.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const x = Math.max(0, Math.floor(rect.left * ratioX));
  const y = Math.max(0, Math.floor(rect.top * ratioY));
  const w = Math.min(canvas.width - x, Math.ceil(rect.width * ratioX));
  const h = Math.min(canvas.height - y, Math.ceil(rect.height * ratioY));
  if (w < 6 || h < 6 || w * h > 4e6) return null;
  let data;
  try {
    data = ctx.getImageData(x, y, w, h).data;
  } catch {
    return null;
  }
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  const stats = inkStats(gray, w, h);
  if (!stats) return null;
  // Graisse : celle mesurée mot par mot à l'OCR si elle existe, sinon la
  // largeur médiane des traits (un seul mot gras ne rend pas la ligne grasse).
  const bold = typeof line.bold === 'boolean' && line.source === 'ocr' ? line.bold : looksBold(stats.stem, stats.inkBottom - stats.inkTop + 1);
  const localScan = CATALOG.filter((c) => c.local && /^(Verdana|Arial|Calibri|Segoe UI|Tahoma|Trebuchet MS)$/.test(c.id)).map((c) => c.id);
  const ready = [...localScan, ...SCAN_FONTS].filter((id) => document.fonts?.check?.(`12px "${id}"`));
  const size = Math.max(4, line.fontSize || 12);
  const measure = (id, isBold, px, text) => {
    scanMeasureCtx.font = `${isBold ? '700 ' : '400 '}${px}px ${U.cssFontFamily(id)}`;
    return scanMeasureCtx.measureText(text).width;
  };
  const candidates = ready.length ? ready : ['Arimo'];
  // Comparaison des formes : chaque police (normale et grasse) est dessinée à la
  // largeur de la ligne puis comparée pixel à pixel à l'encre réelle.
  let font = null;
  try {
    const thr = otsuThreshold(gray);
    const target = new Uint8Array(w * h);
    for (let i = 0; i < target.length; i++) target[i] = gray[i] <= thr ? 1 : 0;
    const tb = maskBox(target, w, h);
    if (tb && tb.x1 - tb.x0 > 6 && tb.y1 - tb.y0 > 3) {
      const sc = document.createElement('canvas');
      sc.width = w;
      sc.height = h;
      const sx = sc.getContext('2d', { willReadFrequently: true });
      let best = -1;
      for (const id of candidates) {
        for (const isBold of [bold]) {
          const family = U.cssFontFamily(id);
          sx.font = `${isBold ? 700 : 400} 100px ${family}`;
          const nat = sx.measureText(line.text).width;
          if (!(nat > 0)) continue;
          const fs = (100 * (tb.x1 - tb.x0 + 1)) / nat;
          const draw = (dy) => {
            sx.fillStyle = '#fff';
            sx.fillRect(0, 0, w, h);
            sx.fillStyle = '#000';
            sx.font = `${isBold ? 700 : 400} ${fs}px ${family}`;
            sx.textBaseline = 'alphabetic';
            sx.fillText(line.text, tb.x0, h * 0.75 + dy);
            const px = sx.getImageData(0, 0, w, h).data;
            const m = new Uint8Array(w * h);
            for (let i = 0, p = 0; p < m.length; i += 4, p++) m[p] = px[i] < 128 ? 1 : 0;
            return m;
          };
          let m = draw(0);
          const rb = maskBox(m, w, h);
          if (!rb) continue;
          m = draw(tb.y0 - rb.y0);
          const score = maskIoU(target, m);
          if (score > best) {
            best = score;
            font = id;
          }
        }
      }
    }
  } catch {
    font = null;
  }
  const pick = pickFontByWidth(measure, line.text, size, line.bbox.w, font ? [font] : candidates, bold);
  if (!pick) return { bold, font: 'Arimo', scale: 1, size };
  return {
    bold,
    font: pick.font,
    scale: U.clamp(pick.scale, 0.3, 3),
    size: size * U.clamp(pick.scale, 0.3, 3),
  };
}

function makeEditFromLine(line, pageNo) {
  const { bg, fg } = sampleColorsForBbox(line.bbox);
  const scanStyle = line.hiddenLayer || line.source === 'ocr' ? guessScanLineStyle(line) : null;
  if (scanStyle) preloadScanFonts();
  return {
    id: U.uid('edit'),
    page: pageNo,
    kind: 'edit',
    lineId: line.id,
    source: line.source || 'pdf',
    hiddenLayer: !!line.hiddenLayer,
    bbox: { ...line.bbox },
    baseline: line.baseline,
    originalText: line.text,
    text: line.text,
    font: scanStyle ? scanStyle.font : line.font || 'Helvetica',
    // Scan : la taille se cale sur la largeur réelle de la ligne et ne dépasse
    // jamais la hauteur visible du texte (sinon l'écriture grossit à l'édition).
    size: U.clamp(
      Math.round(
        Math.min(
          scanStyle ? scanStyle.size || (line.fontSize || 12) * scanStyle.scale : line.fontSize || 12,
          scanStyle ? Math.max(4, line.bbox.h * 1.5) : Infinity
        ) * 2
      ) / 2,
      4,
      120
    ),
    bold: scanStyle ? scanStyle.bold : !!line.bold,
    italic: !!line.italic,
    underline: false,
    align: line.align || 'left',
    lineHeight: 1.16,
    color: fg,
    bg,
    fit: !!scanStyle,
    confidence: typeof line.confidence === 'number' ? line.confidence : undefined,
  };
}

function makeEditFromParagraph(unit, pageNo) {
  const firstLine = unit.lines[0];
  const { bg, fg } = sampleColorsForBbox(unit.bbox);
  const scanStyle = unit.hiddenLayer || unit.source === 'ocr' ? guessScanLineStyle(firstLine) : null;
  if (scanStyle) preloadScanFonts();
  const font = scanStyle ? scanStyle.font : unit.font || 'Helvetica';
  const rawSize = scanStyle
    ? Math.min(scanStyle.size || (unit.fontSize || 12) * scanStyle.scale, Math.max(4, firstLine.bbox.h * 1.5))
    : unit.fontSize || 12;
  const size = U.clamp(Math.round(rawSize * 2) / 2, 4, 120);
  const bold = scanStyle ? scanStyle.bold : !!unit.bold;
  const italic = !!unit.italic;
  const align = unit.align || 'left';

  // S'assure que la largeur du cadre accueille les lignes d'origine sans coupure parasite initiale,
  // sans élargir inutilement un bloc justifié, centré ou aligné à droite.
  let minWidthPt = unit.bbox.w;
  try {
    measureCtx.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${size}px ${U.cssFontFamily(font)}`;
    for (const l of unit.lines) {
      const lw = measureCtx.measureText(l.text.trim()).width;
      if (lw > unit.bbox.w) minWidthPt = Math.max(minWidthPt, lw + 1);
    }
  } catch {
    /* mesure facultative */
  }
  const { w: pageW } = pdfPageSize();
  let finalX = unit.bbox.x;
  let finalW = Math.min(Math.max(8, pageW - 12), Math.max(unit.bbox.w, minWidthPt));
  if (finalW > unit.bbox.w) {
    const dw = finalW - unit.bbox.w;
    if (align === 'right') finalX = Math.max(6, unit.bbox.x - dw);
    else if (align === 'center') finalX = Math.max(6, unit.bbox.x - dw / 2);
  }
  if (finalX + finalW > pageW - 6) {
    finalW = Math.max(8, pageW - finalX - 6);
  }

  const edit = {
    id: U.uid('edit'),
    page: pageNo,
    kind: 'edit',
    lineId: unit.id,
    lineIds: [...unit.lineIds],
    paragraph: true,
    wrap: true,
    fit: false,
    source: unit.source || 'pdf',
    hiddenLayer: !!unit.hiddenLayer,
    bbox: { ...unit.bbox, x: finalX, w: finalW },
    origBbox: { ...unit.bbox },
    origBboxes: unit.origBboxes.map((b) => ({ ...b })),
    baseline: unit.baseline,
    originalText: unit.text,
    text: unit.text,
    font,
    size,
    bold,
    italic,
    underline: false,
    align,
    ...(unit.firstIndent > 0 && finalX === unit.bbox.x ? { indent: unit.firstIndent } : {}),
    lineHeight: unit.lineHeight || 1.16,
    color: fg,
    bg,
    confidence: typeof unit.confidence === 'number' ? unit.confidence : undefined,
  };
  computeEditWrappedLines(edit);
  return edit;
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
const ZOOM_ON_EDIT = false;
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
  // Pas de zoom automatique : modifier ne doit pas bouger la page.
  if (ZOOM_ON_EDIT === false || !state.scale) return false;
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
    view.height - keyboardInset() - (document.body.classList.contains('editing') || document.body.classList.contains('editing-wide') ? 78 : 12)
  );
  const margin = 14;
  // Ligne déjà entièrement visible : on ne fait pas défiler (l'écran reste intact).
  const inX = left >= scroller.scrollLeft + margin && left + rect.width <= scroller.scrollLeft + view.width - margin;
  const inY = top >= scroller.scrollTop + 4 && top + rect.height <= scroller.scrollTop + usableH - 4;
  if (inX && inY) return;
  const targetLeft = centerAxis({ start: left, size: rect.width, view: view.width, margin });
  const targetTop = centerAxis({ start: top, size: rect.height, view: usableH, margin: 0 });
  scroller.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' });
}

async function selectLine(lineId) {
  const pageNo = state.pageIndex + 1;
  const units = editUnitsForPage(pageNo);
  const unit = units.find((u) => u.id === lineId || u.lineIds.includes(lineId));
  const line = unit ? unit.lines[0] : editLinesForPage(pageNo).find((l) => l.id === lineId);
  if (!line) return;
  const isPara = !!unit?.isParagraph;
  const targetId = unit ? unit.id : lineId;
  // Le point touché a été mémorisé avant le zoom : on le convertit ici, sur la
  // géométrie encore affichée, en index de caractère de la ligne ou du paragraphe d'origine.
  const blockEl = els.overlay.querySelector(`.line-block[data-line-id="${CSS.escape(targetId)}"]`);
  let caret = null;
  if (isPara && pendingPointer.point && blockEl && state.viewport) {
    // Identifie la sous-ligne touchée dans le paragraphe pour placer le curseur sous le doigt.
    const stageRect = els.stage.getBoundingClientRect();
    const clickY = pendingPointer.point.y - stageRect.top;
    let charBase = 0;
    let picked = unit.lines[0];
    let pickedBase = 0;
    let bestDist = Infinity;
    for (const sub of unit.lines) {
      const sr = pdfRectToViewportRect(sub.bbox, state.viewport);
      const dist = Math.abs(clickY - (sr.top + sr.height / 2));
      if (dist < bestDist) {
        bestDist = dist;
        picked = sub;
        pickedBase = charBase;
      }
      charBase += sub.text.trim().length + 1;
    }
    const subRect = pdfRectToViewportRect(picked.bbox, state.viewport);
    const frac = U.clamp((pendingPointer.point.x - (stageRect.left + subRect.left)) / Math.max(1, subRect.width), 0, 1);
    const localOff = Math.round(frac * picked.text.trim().length);
    caret = { offset: Math.min(unit.text.length, pickedBase + localOff), word: !!pendingPointer.word };
  } else {
    caret = caretForElement(blockEl || { dataset: {} }, {
      text: line.text,
      font: line.font,
      size: line.fontSize,
      bold: line.bold,
      italic: line.italic,
    });
  }
  if (state.active) closeActive({ restore: false });
  // L'interface d'édition change la largeur disponible : on fige le zoom pour
  // que la page ne se redimensionne pas au toucher.
  if (state.zoom == null && state.scale) state.zoom = state.scale;
  const viewToken = captureEditView();
  const focusTarget = isPara ? unit : line;
  await zoomForLine(focusTarget);
  focusLineInView(focusTarget);
  const before = U.clone(state.edits);
  const edit = isPara ? makeEditFromParagraph(unit, pageNo) : makeEditFromLine(line, pageNo);
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
    pushTextHistory(a.before);
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
    pushTextHistory(a.before);
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
  copy.lineIds = null;
  copy.origBbox = null;
  copy.origBboxes = null;
  copy.source = 'add';
  copy.bbox = { ...copy.bbox, x: copy.bbox.x + 14, y: copy.bbox.y - 14 };
  copy.baseline = (copy.baseline ?? copy.bbox.y) - 14;
  copy.bg = null;
  pushTextHistory(U.clone(state.edits));
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

function undoText() {
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

function redoText() {
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

/** Écrit la session (modifications, annotations, OCR, pages nettoyées) dans le stockage local. */
async function flushSession() {
  if (!state.hash) return false;
  const payload = {
    name: state.fileName,
    size: state.bytes?.byteLength || 0,
    numPages: state.numPages,
    edits: state.edits,
    ocrPages: collectOcrForSession(),
    markup: markup.objects,
    cleanedPages: state.cleanedPages || {},
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


/* ───────────────────────── Onglets (plusieurs PDF ouverts) ───────────────────────── */

const TABS_KEY = 'pdf-studio-tabs';
let openTabs = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(TABS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.key && x.name).slice(0, 30) : [];
  } catch {
    return [];
  }
})();

function saveTabs() {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(openTabs.slice(0, 30)));
  } catch {
    /* stockage indisponible */
  }
}

/** Ajoute (ou renomme) l'onglet d'un document. */
function registerTab(key, name) {
  if (!key) return;
  const tab = openTabs.find((x) => x.key === key);
  if (tab) tab.name = name || tab.name;
  else openTabs.push({ key, name: name || 'document.pdf' });
  saveTabs();
  renderTabs();
}

function renderTabs() {
  const strip = document.getElementById('docTabs');
  if (!strip) return;
  const show = openTabs.length >= 2 || (openTabs.length >= 1 && window.innerWidth >= 901);
  strip.hidden = !show;
  if (!show) return;
  strip.innerHTML =
    openTabs
      .map(
        (tab) => `<div class="doc-tab${tab.key === state.hash ? ' active' : ''}" role="tab" aria-selected="${tab.key === state.hash}" data-tab-key="${U.escapeHtml(tab.key)}" title="${U.escapeHtml(tab.name)}">
          <button class="doc-tab-label" type="button" data-tab-open="${U.escapeHtml(tab.key)}">${U.escapeHtml(U.baseName(tab.name))}</button>
          <button class="doc-tab-close" type="button" data-tab-close="${U.escapeHtml(tab.key)}" aria-label="${t('tabs.close')}">×</button>
        </div>`,
      )
      .join('') +
    `<button class="doc-tab-add" type="button" data-tab-add aria-label="${t('tabs.add')}" title="${t('tabs.add')}">+</button>
     <button class="doc-tab-combine" type="button" data-tab-combine>${icon('layers', 15)}<span>${t('tabs.combine')}</span></button>`;
  strip.querySelector('.doc-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function switchTab(key) {
  if (!key || key === state.hash) return;
  closeActive();
  flushSession();
  const tab = openTabs.find((x) => x.key === key);
  const bytes = await Session.loadBytes(key).catch(() => null);
  if (!bytes) {
    openTabs = openTabs.filter((x) => x.key !== key);
    saveTabs();
    renderTabs();
    toast(t('files.needFile'), 'warn');
    return;
  }
  const docs = await Session.listDocuments().catch(() => []);
  const name = docs.find((d) => d.key === key)?.name || tab?.name || 'document.pdf';
  await openPdfBytes(new Uint8Array(bytes), name, '', { session: 'auto', readOnly: isReading() });
}

async function closeTab(key) {
  const i = openTabs.findIndex((x) => x.key === key);
  if (i < 0) return;
  const wasActive = key === state.hash;
  if (wasActive) {
    closeActive();
    flushSession();
  }
  openTabs.splice(i, 1);
  saveTabs();
  if (wasActive) {
    const next = openTabs[Math.min(i, openTabs.length - 1)];
    if (next) await switchTab(next.key);
    else routeTo('files');
  }
  renderTabs();
}

/** Ouvre un ou plusieurs PDF : un onglet par fichier, le dernier est affiché. */
async function openFiles(fileList) {
  const files = [...(fileList || [])].filter((f) => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)));
  if (!files.length) {
    if (fileList?.length) toast(t('msg.notPdf'), 'warn');
    return;
  }
  if (files.length === 1) return handleFile(files[0]);
  pushLoading(t('combine.reading'));
  try {
    for (const file of files.slice(0, -1)) {
      if (!file.size) continue;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await Session.hashBytes(bytes);
      const pages = await countPages(bytes).catch(() => 0);
      await Session.saveDocumentBytes(hash, bytes, { name: file.name, numPages: pages });
      registerTab(hash, file.name);
    }
  } catch (err) {
    console.warn('[tabs] fichier non ajouté', err);
  } finally {
    popLoading();
  }
  return handleFile(files[files.length - 1]);
}

/* ───────────────────────── Combiner des fichiers ───────────────────────── */

const combineJob = { items: [], name: '' };
let combineSeq = 0;

async function pdfThumb(bytes) {
  const { PdfEngine } = await import('./pdfEngine.js');
  const eng = new PdfEngine(bytes.slice());
  try {
    await eng.load();
    const canvas = document.createElement('canvas');
    await eng.renderToCanvas(1, canvas, 0.3, 1);
    return { thumb: canvas.toDataURL('image/jpeg', 0.7), pages: eng.numPages };
  } finally {
    eng.destroy();
  }
}

async function addCombineItem(name, bytes, tabKey = null) {
  try {
    const info = await pdfThumb(bytes);
    combineJob.items.push({ id: `c${++combineSeq}`, name, bytes, tabKey, pages: info.pages, thumb: info.thumb });
  } catch (err) {
    console.warn('[combine] fichier illisible', name, err);
    toast(t('msg.openFailed', { msg: name }), 'warn', { duration: 3500 });
  }
}

async function addCombineFiles(files) {
  const list = [...(files || [])].filter((f) => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)));
  if (!list.length) return;
  pushLoading(t('combine.reading'));
  try {
    for (const f of list) await addCombineItem(f.name, new Uint8Array(await f.arrayBuffer()));
  } finally {
    popLoading();
  }
  renderCombine();
}

function openCombineTool(reset = true, preset = []) {
  if (reset) combineJob.items = [];
  combineJob.name = '';
  openSheet({ title: t('combine.title'), html: '<div id="combineBody"></div>', size: 'tall', className: 'combine-sheet' });
  renderCombine();
  if (preset.length) {
    (async () => {
      for (const p of preset) await addCombineItem(p.name, p.bytes, p.tabKey || null);
      renderCombine();
    })();
  }
}

function renderCombine() {
  const host = document.getElementById('combineBody');
  if (!host) return;
  const items = combineJob.items;
  if (!combineJob.name) {
    combineJob.name = nextCombinedName(openTabs.map((x) => x.name));
  }
  host.innerHTML = `
    <p class="muted small">${t('combine.hint')}</p>
    <div class="combine-add">
      <button class="btn primary" id="combineAddFiles" type="button">${icon('plus', 17)}<span>${t('combine.addFiles')}</span></button>
      <button class="btn" id="combineFromTabs" type="button">${icon('layers', 17)}<span>${t('combine.fromTabs')}</span></button>
    </div>
    <div class="combine-grid" id="combineGrid">
      ${
        items.length
          ? items
              .map(
                (it, i) => `<div class="combine-card" data-cid="${it.id}">
                  <div class="combine-thumb"><img src="${it.thumb}" alt="" /><span class="combine-n">${i + 1}</span></div>
                  <div class="combine-name" title="${U.escapeHtml(it.name)}">${U.escapeHtml(U.baseName(it.name))}</div>
                  <div class="combine-meta">${t('combine.pages', { n: it.pages })}</div>
                  <div class="combine-actions">
                    <button type="button" class="icon-btn tiny" data-cmove="-1" aria-label="${t('combine.left')}" ${i === 0 ? 'disabled' : ''}>${icon('chevronLeft', 16)}</button>
                    <button type="button" class="icon-btn tiny" data-cmove="1" aria-label="${t('combine.right')}" ${i === items.length - 1 ? 'disabled' : ''}>${icon('chevronRight', 16)}</button>
                    <button type="button" class="icon-btn tiny danger" data-cdel aria-label="${t('combine.remove')}">${icon('trash', 16)}</button>
                  </div>
                </div>`,
              )
              .join('')
          : `<p class="muted combine-empty">${t('combine.empty')}</p>`
      }
    </div>
    <label class="field"><span>${t('combine.name')}</span>
      <input id="combineName" type="text" autocomplete="off" spellcheck="false" value="${U.escapeHtml(combineJob.name)}" /></label>
    <button class="btn primary block" id="combineGo" type="button" ${items.length < 2 ? 'disabled' : ''}>${
      items.length >= 2 ? t('combine.go', { n: items.length }) : t('combine.need2')
    }</button>`;
  host.querySelector('#combineAddFiles').addEventListener('click', () => document.getElementById('combineInput')?.click());
  host.querySelector('#combineFromTabs').addEventListener('click', openCombineFromTabs);
  host.querySelector('#combineName').addEventListener('input', (e) => {
    combineJob.name = e.target.value;
  });
  host.querySelectorAll('.combine-card').forEach((card) => {
    const id = card.dataset.cid;
    card.querySelectorAll('[data-cmove]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = items.findIndex((x) => x.id === id);
        const j = i + Number(b.dataset.cmove);
        if (i < 0 || j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        renderCombine();
      }),
    );
    card.querySelector('[data-cdel]').addEventListener('click', () => {
      combineJob.items = items.filter((x) => x.id !== id);
      renderCombine();
    });
  });
  host.querySelector('#combineGo').addEventListener('click', runCombine);
}

/** Choix parmi les documents déjà ouverts dans des onglets. */
async function openCombineFromTabs() {
  const used = new Set(combineJob.items.map((x) => x.tabKey).filter(Boolean));
  const others = openTabs.filter((tab) => !used.has(tab.key));
  const html = others.length
    ? `<div class="combine-tabs">${others
        .map(
          (tab) => `<label class="combine-tab-row"><input type="checkbox" value="${U.escapeHtml(tab.key)}" /><span>${U.escapeHtml(tab.name)}</span></label>`,
        )
        .join('')}</div>
      <button class="btn primary block" id="combineTabsOk" type="button">${t('combine.tabsAdd')}</button>`
    : `<p class="muted">${t('combine.tabsNone')}</p>`;
  const body = openSheet({ title: t('combine.tabsTitle'), html, size: 'auto', className: 'combine-tabs-sheet' });
  body?.querySelector('#combineTabsOk')?.addEventListener('click', async () => {
    const keys = [...body.querySelectorAll('input:checked')].map((c) => c.value);
    closeSheet();
    const preset = [];
    for (const key of keys) {
      const bytes = key === state.hash ? state.bytes : await Session.loadBytes(key).catch(() => null);
      if (!bytes) continue;
      const tab = openTabs.find((x) => x.key === key);
      preset.push({ name: tab?.name || 'document.pdf', bytes: new Uint8Array(bytes), tabKey: key });
    }
    openCombineTool(false, preset);
  });
}

async function runCombine() {
  const items = combineJob.items;
  if (items.length < 2) return;
  const raw = (combineJob.name || '').trim().replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Classeur1';
  const name = /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`;
  closeSheet();
  pushLoading(t('combine.working'));
  try {
    const bytes = await combinePdfs(items.map((x) => x.bytes));
    popLoading();
    combineJob.items = [];
    combineJob.name = '';
    await openPdfBytes(new Uint8Array(bytes), name, '', { readOnly: false, session: 'skip' });
    toast(t('combine.done', { n: state.numPages }), 'success', { duration: 4000 });
    openPagesGridTool();
  } catch (err) {
    popLoading();
    console.error(err);
    toast(t('combine.failed'), 'error');
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
      // Lecture faite par une ancienne version : on la refait (sauf si des
      // modifications s'appuient déjà sur ses blocs).
      const usedByEdit = (saved.edits || []).some((e) => e && e.page === entry.pageNo && e.source === 'ocr');
      if ((entry.ocr.v || 0) < OCR_VERSION && !usedByEdit) continue;
      const pd = getPageData(entry.pageNo);
      pd.ocr = entry.ocr;
      pd.ocrStatus = 'done';
    }
    if (saved.cleanedPages && typeof saved.cleanedPages === 'object') {
      const cleaned = {};
      for (const [k, info] of Object.entries(saved.cleanedPages)) {
        const p = Number(k);
        if (p >= 1 && p <= state.numPages && info?.dataUrl && info.preset !== 'original') {
          cleaned[p] = info;
          loadCleanedImage(info.dataUrl).catch(() => {});
        }
      }
      state.cleanedPages = cleaned;
    }
    if ([...state.pages.values()].some((p) => p.ocr)) els.expOcr.checked = true;
    clearHistories();
    updateHistoryButtons();
    renderCurrent();
    for (const p of Object.keys(state.cleanedPages || {}).map(Number)) refreshThumbForPage(p);
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
  const nClean = saved.cleanedPages ? Object.keys(saved.cleanedPages).length : 0;
  if (!nEdits && !nOcr && !nMarkup && !nClean) return false;

  if (silent) {
    applySessionData(saved);
    toast(t('msg.sessionRestored'), 'success', { duration: 2200 });
    return true;
  }

  const parts = [];
  if (nEdits) parts.push(`${nEdits} modification${nEdits > 1 ? 's' : ''}`);
  if (nClean) parts.push(`${nClean} page${nClean > 1 ? 's' : ''} nettoyée${nClean > 1 ? 's' : ''}`);
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
      cleanedPages: {},
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
  pushTextHistory(U.clone(state.edits));
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
  pushTextHistory(U.clone(state.edits));
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
  let pill = document.getElementById('ocrPill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'ocrPill';
    pill.className = 'ocr-pill';
    pill.setAttribute('role', 'status');
    document.body.appendChild(pill);
  }
  pill.hidden = false;
  pill.textContent = `${label || ''} ${Math.round(U.clamp(progress, 0, 1) * 100)} %`.trim();
  clearTimeout(pill._t);
  if (progress >= 1) pill._t = setTimeout(() => (pill.hidden = true), 1800);
}

function updateOcrButtons() {
  const running = state.ocr.running;
  els.btnOcrPage.disabled = running;
  els.btnOcrAll.disabled = running;
  els.btnOcrCancel.disabled = !running;
  const pill = document.getElementById('ocrPill');
  if (pill && !running) pill.hidden = true;
}

const NUMERIC_RE = /^(?:[\d\s,.\-−+/:€%$£¥]|EUR|USD|CHF|GBP|CAD|MAD)+$/i;

/**
 * Seconde lecture, bloc par bloc : chaque bloc est découpé, mis à l'échelle
 * idéale (≈ 56 px de haut) et relu en « ligne unique ». Corrige surtout les
 * chiffres, virgules et accents perdus à la première lecture. La nouvelle
 * lecture n'est retenue que si elle est au moins aussi fiable et de longueur
 * comparable.
 */
async function refineSegments(canvas, segments, langs, onProgress, shouldCancel) {
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });
  let i = 0;
  for (const seg of segments) {
    i++;
    if (shouldCancel?.()) break;
    onProgress?.({ status: 'refine', progress: i / segments.length });
    const { x0, y0, x1, y1 } = seg.bbox;
    const w = x1 - x0;
    const h = y1 - y0;
    if (h < 8 || w < 10 || h > 400) continue;
    const pad = Math.max(4, Math.round(h * 0.3));
    const compact = seg.text.replace(/\s/g, '');
    const numeric = compact.length > 0 && NUMERIC_RE.test(compact);
    const readAt = async (target) => {
      const scale = U.clamp(target / h, 0.5, 4);
      const cw = Math.max(8, Math.round((w + pad * 2) * scale));
      const ch = Math.max(8, Math.round((h + pad * 2) * scale));
      if (cw * ch > 3e6) return null;
      work.width = cw;
      work.height = ch;
      wctx.fillStyle = '#fff';
      wctx.fillRect(0, 0, cw, ch);
      wctx.imageSmoothingEnabled = true;
      wctx.imageSmoothingQuality = 'high';
      wctx.drawImage(canvas, x0 - pad, y0 - pad, w + pad * 2, h + pad * 2, 0, 0, cw, ch);
      return recognizeLine(work, langs, { digits: numeric });
    };
    try {
      let res = await readAt(56);
      if (!res) continue;
      if (numeric) {
        // Nombres : trois tailles, vote ; une virgule décimale détectée prime sur « 260068 ».
        const alt = [res, await readAt(40), await readAt(80)].filter((r) => r && r.text);
        const votes = new Map();
        for (const r of alt) votes.set(r.text, (votes.get(r.text) || 0) + 1 + (/[.,]\d{1,4}\b/.test(r.text) ? 0.5 : 0));
        const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) res = alt.find((r) => r.text === best[0]) || res;
      }
      const text = res.text;
      if (!text || text === seg.text) continue;
      const ratio = text.replace(/\s/g, '').length / Math.max(1, compact.length);
      if (ratio < 0.6 || ratio > 1.6) continue;
      if (res.confidence + 6 < seg.confidence) continue;
      // Ne remplace pas du texte par du bruit : au moins un caractère lettre/chiffre.
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      seg.text = text;
      seg.confidence = Math.round(Math.max(seg.confidence, res.confidence));
    } catch {
      /* on garde la première lecture */
    }
  }
  // Séparateur décimal : si la page écrit presque tout avec une virgule, un « 173.75 » isolé en est une.
  const dec = /\d[.,]\d{2}(?!\d)/;
  const commas = segments.filter((g) => dec.test(g.text) && /\d,\d{2}(?!\d)/.test(g.text)).length;
  const dots = segments.filter((g) => /\d\.\d{2}(?!\d)/.test(g.text) && !/,/.test(g.text)).length;
  // Montant lu sans virgule (« 260068 » pour « 2600,68 ») dans un tableau où tout porte 2 décimales.
  if (commas >= 10) {
    for (const g of segments) {
      const c = g.text.replace(/\s/g, '');
      if (/^-?\d{5,7}$/.test(c) && g.text.trim() === c) g.text = c.replace(/(\d{2})$/, ',$1');
    }
  }
  if (commas >= 4 && commas > dots * 3) {
    for (const g of segments) {
      if (NUMERIC_RE.test(g.text.replace(/\s/g, ''))) g.text = g.text.replace(/(\d)\.(\d{2})(?!\d)/g, '$1,$2');
    }
  }
}

/**
 * Épaisseur de trait de chaque mot reconnu : `bold` vaut true / false quand la
 * mesure est nette, et reste indéfini pour les mots trop courts ou ambigus.
 */
function markWordWeights(canvas, words) {
  let ctx;
  try {
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    return;
  }
  if (!ctx) return;
  for (const w of words) {
    try {
      if (!w.text || (w.text.match(/[\p{L}\p{N}]/gu) || []).length < 2) continue;
      const x = Math.max(0, Math.floor(w.bbox.x0));
      const y = Math.max(0, Math.floor(w.bbox.y0));
      const bw = Math.min(canvas.width - x, Math.ceil(w.bbox.x1 - w.bbox.x0));
      const bh = Math.min(canvas.height - y, Math.ceil(w.bbox.y1 - w.bbox.y0));
      if (bw < 8 || bh < 6) continue;
      const data = ctx.getImageData(x, y, bw, bh).data;
      const gray = new Uint8ClampedArray(bw * bh);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const st = inkStats(gray, bw, bh);
      if (!st) continue;
      const ratio = st.stem / Math.max(1, st.inkBottom - st.inkTop + 1);
      w.ratio = ratio;
    } catch {
      /* mesure impossible : mot neutre */
    }
  }
}

/** Incrémenté quand la lecture OCR s'améliore : les anciennes lectures sont refaites. */
const OCR_VERSION = 4;

async function runOcrOnPage(n, langs, onProgress) {
  const page = await state.engine.getPage(n);
  const base = page.getViewport({ scale: 1 });
  // Texte fin (bulletins, tableaux) : une définition élevée évite de perdre virgules et accents.
  const ocrScale = U.clamp(3400 / Math.max(base.width, base.height), 2, 4.5);
  const vp = page.getViewport({ scale: ocrScale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  const cleanInfo = state.cleanedPages?.[n];
  if (cleanInfo?.dataUrl && cleanInfo.preset !== 'original') {
    const img = await loadCleanedImage(cleanInfo.dataUrl);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } else {
    await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
  }

  // Prétraitement optionnel : contraste puis redressement
  let prepared = canvas;
  if (els.ocrContrast?.checked) prepared = enhanceContrast(prepared);
  if (els.ocrDeskew?.checked) prepared = deskewCanvas(prepared);

  const res = await recognizeCanvas(prepared, langs, onProgress);
  markWordWeights(prepared, res.words);

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

  const segs = groupOcrWords(res.words);
  await refineSegments(
    prepared,
    segs,
    langs,
    (m) => onProgress?.({ status: 'recognizing text', progress: 0.9 + 0.1 * (m.progress || 0) }),
    () => state.ocr.cancel
  );
  const lines = segs
    .map((seg, i) => {
      const bbox = mapBox(seg.bbox);
      return {
        id: `p${n}-o${i}`,
        text: seg.text,
        source: 'ocr',
        font: 'Helvetica',
        fontSize: U.clamp(bbox.h * 1.2, 5, 72),
        ...(typeof seg.bold === 'boolean' ? { bold: seg.bold } : {}),
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
    v: OCR_VERSION,
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
  updateDock();
  updateHint();
  renderOverlay();
  if (done) {
    toast(t('msg.ocrDone', { n: done }), 'success', {
      duration: 6000,
      action: t('tool.clean'),
      onAction: () => openCleanSheet(),
    });
  }
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
  const absorbed = new Set();
  for (const e of edits) {
    if (e.kind === 'edit' && Array.isArray(e.lineIds)) {
      for (const id of e.lineIds) {
        if (id !== e.lineId) absorbed.add(id);
      }
    }
  }
  const rows = base
    .filter((l) => !absorbed.has(l.id))
    .map((l) => ({
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
  syncGranularityUi();
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
  const nClean = Object.keys(state.cleanedPages || {}).filter((k) => {
    const info = state.cleanedPages[k];
    return info?.dataUrl && info.preset !== 'original';
  }).length;
  const nEdits = state.edits.length + nClean;
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
    const pageEdits = state.edits.filter((e) => e.page === n && e.kind === 'edit');
    const byLine = new Map(pageEdits.map((e) => [e.lineId, e]));
    const absorbed = new Set();
    for (const e of pageEdits) {
      if (Array.isArray(e.lineIds)) {
        for (const id of e.lineIds) if (id !== e.lineId) absorbed.add(id);
      }
    }
    for (const line of lines) {
      if (absorbed.has(line.id)) continue;
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
    if (isContinuousRead()) renderOverlay();
  } else {
    renderOverlay();
  }
  renderSearchResults();
  updateHint();
  requestAnimationFrame(() => {
    const el = els.canvasScroll.querySelector('.hit-active');
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

/** Remplace le texte trouvé en gardant police, taille, couleur et fond de chaque ligne. */
async function replaceMatches(all) {
  const { matches, query, active } = state.search;
  const repl = document.getElementById('replaceInput')?.value ?? '';
  if (!query || !matches.length) {
    toast(t('search.nothingToReplace'), 'info', { duration: 2200 });
    return;
  }
  closeActive();
  const targets = all ? matches : [matches[active]];
  const seen = new Set();
  const before = U.clone(state.edits);
  let count = 0;
  for (const m of targets) {
    const key = `${m.page}:${m.lineId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pd = getPageData(m.page);
    const lines = pd.lines?.length ? pd.lines : pd.ocr?.lines || [];
    const line = lines.find((l) => l.id === m.lineId);
    if (!line) continue;
    let edit = state.edits.find((e) => e.page === m.page && e.kind === 'edit' && e.lineId === m.lineId);
    const source = edit ? edit.text : line.text;
    const next = replaceInsensitive(source, query, repl, all);
    if (next === source) continue;
    if (!edit) {
      edit = makeEditFromLine(line, m.page);
      state.edits.push(edit);
    }
    edit.text = next;
    count += all ? countOccurrences(source, query) : 1;
  }
  if (!count) return;
  pushTextHistory(before);
  renderOverlay();
  renderEditList();
  updateExportUi();
  updateTextPanel();
  updateHistoryButtons();
  scheduleAutosave();
  toast(t('search.replaced', { n: count }), 'success', { duration: 2600 });
  await performSearch(query);
}

function countOccurrences(text, query) {
  let n = 0;
  let from = 0;
  const hay = String(text).toLowerCase();
  const needle = query.toLowerCase();
  while (needle && (from = hay.indexOf(needle, from)) >= 0) {
    n++;
    from += needle.length;
  }
  return Math.max(1, n);
}

function replaceInsensitive(text, query, repl, all) {
  const src = String(text);
  const hay = src.toLowerCase();
  const needle = query.toLowerCase();
  let out = '';
  let from = 0;
  let idx = hay.indexOf(needle, from);
  if (idx < 0) {
    // Recherche tolérante aux accents : on remplace la première portion trouvée.
    let tolerant = '';
    let rest = src;
    for (let guard = 0; guard < 500; guard++) {
      const f = findMatch(rest, query);
      if (f.index < 0) break;
      tolerant += rest.slice(0, f.index) + repl;
      rest = rest.slice(f.index + Math.max(1, f.length));
      if (!all) break;
    }
    return tolerant + rest;
  }
  while (idx >= 0) {
    out += src.slice(from, idx) + repl;
    from = idx + needle.length;
    if (!all) break;
    idx = hay.indexOf(needle, from);
  }
  return out + src.slice(from);
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
    teardownContinuousRead({ resetCache: true });
    await ensureContinuousPageSizes(engine);
    state.pages = new Map();
    state.edits = [];
    state.cleanedPages = {};
    state.scanPages = [];
    state.active = null;
    state.addMode = false;
    state.search = { query: '', matches: [], active: -1 };
    state.textIndexReady = false;
    state.ensuringAll = null;
    state.ocr = { running: false, cancel: false };
    state.hash = null;
    clearHistories();
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
    // Ouverture d'un fichier : lecture seule ; les opérations sur le document
    // ouvert (pages, compression…) gardent le mode en cours.
    document.body.classList.toggle('reading', typeof options.readOnly === 'boolean' ? options.readOnly : isReading());
    await renderCurrent();
    els.canvasScroll.scrollTo({ top: 0, left: 0 });
    centerHorizontally();
    setReadMode(isReading());
    updatePanelsForPage();
    ensureAllLines().catch(() => {}); // indexation en arrière-plan
    try {
      const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 4096)));
      if (/\/Encrypt\b/.test(tail)) toast(t('msg.encrypted'), 'warn', { duration: 9000 });
    } catch {
      /* détection facultative */
    }
    if (!isReading()) autoOcrForEdit().catch(() => {});
    toast(t('msg.opened', { name: state.fileName, n: state.numPages }), 'success', {
      duration: 2600,
    });

    // Détection des pages scannées (affiche « Nettoyer » dans la barre d'outils sans bloquer)
    detectScannedPages(engine)
      .then((pages) => {
        if (token !== state.docToken) return;
        state.scanPages = pages;
        updateDock();
      })
      .catch(() => {});

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
        registerTab(hash, state.fileName);
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
    await openPdfBytes(new Uint8Array(buf), file.name, '', { readOnly: true });
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
    await openPdfBytes(bytes, kind === 'scan' ? 'Facture — exemple scanné.pdf' : 'Rapport — exemple texte.pdf', '', { readOnly: false });
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

/** Octets du PDF avec les champs de formulaire saisis (panneau ou superposition). */
async function bytesWithForm() {
  if (!state.formFields?.length) return state.bytes;
  try {
    return new Uint8Array(await fillFormFields(state.bytes, state.formValues));
  } catch {
    return state.bytes;
  }
}

/** Télécharge le PDF avec les modifications (ancien comportement d'« Enregistrer »). */
async function downloadModifiedPdf() {
  if (!state.engine) return;
  closeActive();
  pushLoading(t('save.working'));
  try {
    const { exportPdf } = await import('./exporter.js');
    const cleanedPages = hasCleanedPages() ? state.cleanedPages : null;
    const ocrPages = await collectOcrPagesForExport({ includeOcr: true, cleanedPages });
    const result = await exportPdf({
      sourceBytes: await bytesWithForm(),
      edits: state.edits,
      ocrPages,
      redactMode: 'stream',
      renderPage: null,
      objects: markup.objects,
      cleanedPages,
    });
    const name = /\.pdf$/i.test(state.fileName || '') ? state.fileName : `${state.fileName || 'fichier-modifie'}.pdf`;
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
  if (includeEdits && (state.edits.length || hasCleanedPages())) parts.push('modifie');
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
  const scale = Math.max(1, Math.min(3, 1800 / Math.max(1, size.width)));
  const canvas = document.createElement('canvas');
  const cleanInfo = state.cleanedPages?.[pageNo];
  if (cleanInfo?.dataUrl && cleanInfo.preset !== 'original') {
    const img = await loadCleanedImage(cleanInfo.dataUrl);
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  await state.engine.renderToCanvas(pageNo, canvas, scale);
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
  const edits = includeEdits ? state.edits : [];
  const cleanedPages = includeEdits && hasCleanedPages() ? state.cleanedPages : null;
  const ocrPages = await collectOcrPagesForExport({ includeOcr, cleanedPages });
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
      sourceBytes: await bytesWithForm(),
      edits,
      ocrPages,
      redactMode,
      renderPage: redactMode === 'raster' ? renderPageForExport : null,
      rasterQuality: Number(els.expQuality?.value || 1),
      objects: markup.objects,
      cleanedPages,
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
    const scale = Math.max(1, Math.min(3, 2200 / Math.max(1, size.width)));
    const canvas = document.createElement('canvas');
    const cleanInfo = state.cleanedPages?.[n];
    if (cleanInfo?.dataUrl && cleanInfo.preset !== 'original') {
      const img = await loadCleanedImage(cleanInfo.dataUrl);
      canvas.width = Math.max(1, Math.round(size.width * scale));
      canvas.height = Math.max(1, Math.round(size.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } else {
      await state.engine.renderToCanvas(n, canvas, scale);
    }
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
  if (!state.edits.length && !hasCleanedPages() && ![...state.pages.values()].some((p) => p.ocr)) {
    return Promise.resolve(true);
  }
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
    const oldHash = state.hash;
    await openPdfBytes(bytes, name);
    // L'ancienne version n'a plus de raison d'être dans « Fichiers » : pas de doublon.
    if (oldHash && state.hash && oldHash !== state.hash) {
      Session.deleteDocument(oldHash).catch(() => {});
    }
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
  document.getElementById('annoUndo')?.addEventListener('click', undoEdits);
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
  const wasContinuous = isContinuousRead();
  closeActive();
  buildAnnoBar();
  els.annobar.hidden = false;
  document.body.classList.add('annotating');
  if (wasContinuous) {
    if (state.zoom == null && state.scale) state.zoom = state.scale;
    const targetPage = state.pageIndex + 1;
    teardownContinuousRead();
    // Si on était sur une autre page que la 1, on redessine immédiatement cette page dans #stage.
    if (targetPage !== 1) renderCurrent();
    else renderOverlay();
  }
  activateAnnoTool('highlight');
  if (!markupHistory.stack.length) pushMarkupHistory({ silent: true });
}

function closeAnnotate() {
  markup.setTool(null);
  els.annobar.hidden = true;
  els.annoSub.hidden = true;
  els.annoTools?.querySelectorAll('.anno-btn').forEach((b) => b.classList.remove('active'));
  document.body.classList.remove('annotating');
  scheduleAutosave();
  if (isContinuousRead()) renderCurrent();
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
function addImageObject(src, { ratio = 3, label = '', type = 'image', widthPx = 150, pageShare = 0.34 } = {}) {
  const { w: pageW } = pdfPageSize();
  const scale = state.scale || 1;
  const width = Math.min(pageW * pageShare, widthPx / scale);
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
        text = new Date().toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  body.querySelector('#sigOpenCert')?.addEventListener('click', () => {
    openCertSignSheet();
  });
}

/**
 * Construit les octets finaux du PDF incluant toutes les modifications de la
 * session (formulaires, textes/paragraphes modifiés, OCR, annotations/flèches,
 * nettoyage de scan), afin que la signature PAdES soit appliquée en toute
 * dernière étape juste avant l'enregistrement final.
 */
async function buildFinalExportBytesForSigning() {
  closeActive();
  for (const e of state.edits) {
    if (e.wrap && !Array.isArray(e.wrappedLines)) {
      computeEditWrappedLines(e);
    }
  }
  const { exportPdf } = await import('./exporter.js');
  const cleanedPages = hasCleanedPages() ? state.cleanedPages : null;
  const ocrPages = await collectOcrPagesForExport({ includeOcr: true, cleanedPages });
  const result = await exportPdf({
    sourceBytes: await bytesWithForm(),
    edits: state.edits,
    ocrPages,
    redactMode: 'stream',
    renderPage: null,
    objects: markup.objects,
    cleanedPages,
  });
  return result.bytes;
}

/**
 * Feuille « Signer avec un certificat » (.p12 / .pfx) dans « Remplir et signer ».
 * Tout se passe en mémoire locale : ni le certificat ni le mot de passe ne sont
 * jamais envoyés sur le réseau ni enregistrés (ni dans localStorage, ni dans IndexedDB).
 */
function openCertSignSheet() {
  routeTo('doc');
  if (!state.engine) return;

  let p12Bytes = null;
  const wipeSecrets = (root) => {
    if (p12Bytes) {
      try {
        p12Bytes.fill(0);
      } catch {
        /* ignore */
      }
      p12Bytes = null;
    }
    const pwd = root?.querySelector?.('#certPassword');
    if (pwd) pwd.value = '';
    const fileIn = root?.querySelector?.('#certFileInput');
    if (fileIn) fileIn.value = '';
  };

  const html = `
    <div class="cert-sheet" id="certSheet">
      <p class="muted small">${U.escapeHtml(t('cert.desc'))}</p>
      <div class="cert-warn-banner" id="certInvalidateWarn" role="note">
        ${icon('alert', 18)}
        <span>${U.escapeHtml(t('cert.invalidateWarn'))}</span>
      </div>
      <div class="cert-local-note">
        ${icon('lock', 16)}
        <span>${U.escapeHtml(t('cert.localOnly'))}</span>
      </div>

      <div class="cert-field">
        <div class="cert-file-row">
          <button class="btn soft small" id="certPickBtn" type="button">${icon('shield', 15)}<span>${U.escapeHtml(t('cert.pickFile'))}</span></button>
          <span class="cert-file-name" id="certFileName"></span>
        </div>
        <input type="file" id="certFileInput" accept=".p12,.pfx,application/x-pkcs12" hidden />
      </div>

      <div class="cert-field">
        <label for="certPassword">${U.escapeHtml(t('cert.password'))}</label>
        <input type="password" id="certPassword" autocomplete="off" data-lpignore="true" placeholder="${U.escapeHtml(t('cert.passwordPlaceholder'))}" />
      </div>

      <div class="cert-summary" id="certSummary" hidden></div>
      <div class="cert-error" id="certError" role="alert" hidden></div>

      <div class="cert-field">
        <label for="certReason">${U.escapeHtml(t('cert.reason'))}</label>
        <input type="text" id="certReason" autocomplete="off" placeholder="${U.escapeHtml(t('cert.reasonPlaceholder'))}" />
      </div>

      <div class="cert-field">
        <label for="certLocation">${U.escapeHtml(t('cert.location'))}</label>
        <input type="text" id="certLocation" autocomplete="off" placeholder="${U.escapeHtml(t('cert.locationPlaceholder'))}" />
      </div>

      <label class="check compact">
        <input type="checkbox" id="certVisibleStamp" checked />
        <span>${U.escapeHtml(t('cert.visibleStamp'))}</span>
      </label>

      <button class="btn primary wide" id="certSubmitBtn" type="button">
        ${icon('shield', 16)}
        <span>${U.escapeHtml(t('cert.signAndSave'))}</span>
      </button>
    </div>
  `;

  let bodyRef = null;
  const body = openSheet({
    title: t('cert.title'),
    html,
    size: 'tall',
    onClose: () => wipeSecrets(bodyRef),
  });
  bodyRef = body;
  if (!body) return;

  const fileInput = body.querySelector('#certFileInput');
  const pickBtn = body.querySelector('#certPickBtn');
  const fileNameEl = body.querySelector('#certFileName');
  const pwdInput = body.querySelector('#certPassword');
  const summaryEl = body.querySelector('#certSummary');
  const errorEl = body.querySelector('#certError');
  const reasonInput = body.querySelector('#certReason');
  const locationInput = body.querySelector('#certLocation');
  const visibleInput = body.querySelector('#certVisibleStamp');
  const submitBtn = body.querySelector('#certSubmitBtn');

  const showError = (msg) => {
    if (!errorEl) return;
    if (!msg) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    } else {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }
  };

  const inspectCurrentP12 = async () => {
    showError('');
    if (!p12Bytes) {
      if (summaryEl) summaryEl.hidden = true;
      return;
    }
    try {
      const { parsePkcs12 } = await import('./pades.js');
      const parsed = parsePkcs12(p12Bytes, pwdInput?.value || '');
      const s = parsed.summary;
      const until = s.notAfter
        ? new Date(s.notAfter).toLocaleDateString(uiLocale(), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : '—';
      if (summaryEl) {
        summaryEl.innerHTML =
          `<div><strong>${U.escapeHtml(t('cert.subject'))} :</strong> ${U.escapeHtml(s.subjectName)}</div>` +
          `<div><strong>${U.escapeHtml(t('cert.issuer'))} :</strong> ${U.escapeHtml(s.issuerName)}</div>` +
          `<div><strong>${U.escapeHtml(t('cert.validUntil'))} :</strong> ${U.escapeHtml(until)}${
            s.isExpired ? ` <span class="badge warn">${U.escapeHtml(t('cert.expired'))}</span>` : ''
          }</div>`;
        summaryEl.hidden = false;
      }
    } catch (err) {
      if (summaryEl) summaryEl.hidden = true;
      if (pwdInput?.value) showError(err.message);
    }
  };

  pickBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (p12Bytes) p12Bytes.fill(0);
    p12Bytes = new Uint8Array(await file.arrayBuffer());
    if (fileNameEl) fileNameEl.textContent = file.name;
    await inspectCurrentP12();
  });

  pwdInput?.addEventListener('input', () => {
    inspectCurrentP12();
  });

  submitBtn?.addEventListener('click', async () => {
    showError('');
    if (!p12Bytes) {
      showError(t('cert.needFile'));
      return;
    }
    const password = pwdInput?.value || '';
    const reason = reasonInput?.value?.trim() || '';
    const location = locationInput?.value?.trim() || '';
    const visibleStamp = !!visibleInput?.checked;
    const pageNumber = (state.pageIndex || 0) + 1;

    submitBtn.disabled = true;
    pushLoading(t('cert.signing'));
    try {
      const { signPdfBytes } = await import('./pades.js');
      // 1. Applique d'abord toutes les modifications du document (texte, formulaires, flèches, OCR, nettoyage)
      const finalModifiedBytes = await buildFinalExportBytesForSigning();
      // 2. Signe cryptographiquement les octets finaux en toute dernière étape avant l'enregistrement
      const signed = await signPdfBytes(finalModifiedBytes, {
        p12Bytes,
        password,
        reason,
        location,
        pageNumber,
        visibleStamp,
        subFilter: 'ETSI.CAdES.detached',
      });

      const base = String(state.fileName || 'document')
        .replace(/\.pdf$/i, '')
        .replace(/-signe$/i, '');
      const outName = `${base}-signe.pdf`;
      const blob = new Blob([signed.bytes], { type: 'application/pdf' });
      lastSaved = { blob, name: outName };

      wipeSecrets(body);
      closeSheet();
      saveBytes(signed.bytes, outName, 'application/pdf');
      toast(t('cert.success'), 'success', { duration: 6500 });
    } catch (err) {
      showError(err?.message || t('save.error'));
    } finally {
      popLoading();
      submitBtn.disabled = false;
    }
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
  const today = new Date().toLocaleDateString(uiLocale(), { day: '2-digit', month: 'long', year: 'numeric' });
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
                `<span class="stamp-saved"><button class="stamp-preset${st.kind === 'image' ? ' stamp-img' : ''}" data-stamp-saved="${st.id}" type="button" ${st.kind === 'image' ? `aria-label="${t('cachet.title')}"` : `style="color:${st.color};border-color:${st.color}"`}>${st.kind === 'image' ? `<img src="${st.src}" alt="" />` : U.escapeHtml(st.text)}</button><button class="sig-del" data-stamp-del="${st.id}" type="button" aria-label="${t('sign.delete')}">${icon('x', 13)}</button></span>`
            )
            .join('')}</div></div>`
        : ''
    }
    <div class="stamp-cachet-row">
      <button class="btn soft" id="cachetCreate" type="button">${icon('stamp', 16)}<span>${t('cachet.create')}</span></button>
      <button class="btn soft" id="cachetImport" type="button">${icon('image', 16)}<span>${t('cachet.import')}</span></button>
    </div>
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
      if (!st) return;
      if (st.kind === 'image') {
        closeSheet();
        addImageObject(st.src, { ratio: st.ratio || 2, type: 'image', label: 'Cachet', widthPx: 190, pageShare: 0.4 });
        return;
      }
      addCustomStamp(st.text, st.color);
    });
  });
  body.querySelectorAll('[data-stamp-del]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteStamp(btn.dataset.stampDel);
      openStampTool();
    });
  });

  body.querySelector('#cachetCreate')?.addEventListener('click', () => openCachetSheet('create'));
  body.querySelector('#cachetImport')?.addEventListener('click', () => openCachetSheet('import'));

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

/** Cachets : création (texte + forme) ou import d'une photo / d'un scan. */
function openCachetSheet(mode = 'create') {
  const shapeLabels = { rect: 'cachet.shapeRect', rounded: 'cachet.shapeRounded', ellipse: 'cachet.shapeEllipse', double: 'cachet.shapeDouble' };
  const html = `
    <div class="cachet-tabs" role="tablist">
      <button class="seg ${mode === 'create' ? 'on' : ''}" data-cachet-tab="create" type="button">${t('cachet.create')}</button>
      <button class="seg ${mode === 'import' ? 'on' : ''}" data-cachet-tab="import" type="button">${t('cachet.import')}</button>
    </div>
    <div class="cachet-pane" data-pane="create" ${mode === 'create' ? '' : 'hidden'}>
      <input id="cachetL1" placeholder="${t('cachet.line1')}" maxlength="40" />
      <input id="cachetL2" placeholder="${t('cachet.line2')}" maxlength="40" />
      <input id="cachetL3" placeholder="${t('cachet.line3')}" maxlength="40" />
      <div class="cachet-shapes">${CACHET_SHAPES.map(
        (sh, i) => `<button class="seg ${i === 1 ? 'on' : ''}" data-shape="${sh}" type="button">${t(shapeLabels[sh])}</button>`
      ).join('')}</div>
      <div class="stamp-row"><input type="color" id="cachetColor" value="#1d4ed8" aria-label="${t('cachet.color')}" /></div>
    </div>
    <div class="cachet-pane" data-pane="import" ${mode === 'import' ? '' : 'hidden'}>
      <p class="muted small">${t('cachet.importHint')}</p>
      <div class="cachet-import-buttons">
        <button class="btn soft" id="cachetPick" type="button">${icon('image', 16)}<span>${t('cachet.pickGallery')}</span></button>
        <button class="btn soft" id="cachetShoot" type="button">${icon('camera', 16)}<span>${t('cachet.pickCamera')}</span></button>
      </div>
      <label class="check compact"><input type="checkbox" id="cachetNoBg" checked /><span>${t('cachet.removeBg')}</span></label>
      <label class="range-row"><span>${t('cachet.threshold')}</span><input type="range" id="cachetThr" min="150" max="250" value="225" /></label>
    </div>
    <div class="cachet-preview"><img id="cachetPreview" alt="" /></div>
    <label class="check compact"><input type="checkbox" id="cachetSave" checked /><span>${t('stamp.saveIt')}</span></label>
    <button class="btn primary" id="cachetUse" type="button" disabled>${icon('plus', 16)}<span>${t('cachet.use')}</span></button>`;
  const body = openSheet({ title: t('cachet.title'), html, size: 'tall' });
  if (!body) return;
  const q = (sel) => body.querySelector(sel);
  const preview = q('#cachetPreview');
  const use = q('#cachetUse');
  let current = null; // { src, ratio }
  let shape = 'rounded';
  let imported = null; // File
  let active = mode;

  const showCurrent = () => {
    use.disabled = !current;
    if (current) preview.src = current.src;
    else preview.removeAttribute('src');
    preview.parentElement.hidden = !current;
  };
  const refreshCreate = () => {
    const lines = ['#cachetL1', '#cachetL2', '#cachetL3'].map((id) => q(id).value);
    current = lines.some((l) => l.trim()) ? renderCachet({ lines, color: q('#cachetColor').value, shape }) : null;
    showCurrent();
  };
  const refreshImport = async () => {
    if (!imported) {
      current = null;
      showCurrent();
      return;
    }
    try {
      current = await fileToCachet(imported, { removeBg: q('#cachetNoBg').checked, threshold: Number(q('#cachetThr').value) });
    } catch {
      current = null;
      toast(t('cachet.badImage'), 'error');
    }
    showCurrent();
  };
  const refresh = () => (active === 'create' ? refreshCreate() : refreshImport());

  body.querySelectorAll('[data-cachet-tab]').forEach((tab) =>
    tab.addEventListener('click', () => {
      active = tab.dataset.cachetTab;
      body.querySelectorAll('[data-cachet-tab]').forEach((x) => x.classList.toggle('on', x === tab));
      body.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== active));
      refresh();
    })
  );
  body.querySelectorAll('[data-shape]').forEach((b) =>
    b.addEventListener('click', () => {
      shape = b.dataset.shape;
      body.querySelectorAll('[data-shape]').forEach((x) => x.classList.toggle('on', x === b));
      refreshCreate();
    })
  );
  ['#cachetL1', '#cachetL2', '#cachetL3', '#cachetColor'].forEach((id) => q(id).addEventListener('input', refreshCreate));
  q('#cachetNoBg').addEventListener('change', refreshImport);
  q('#cachetThr').addEventListener('input', U.debounce(refreshImport, 120));
  const pick = (capture) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = 'environment';
    input.addEventListener('change', () => {
      imported = input.files?.[0] || null;
      refreshImport();
    });
    input.click();
  };
  q('#cachetPick').addEventListener('click', () => pick(false));
  q('#cachetShoot').addEventListener('click', () => pick(true));
  use.addEventListener('click', () => {
    if (!current) return;
    if (q('#cachetSave').checked) {
      const res = saveImageStamp({ src: current.src, ratio: current.ratio, label: 'Cachet' });
      if (!res.ok) toast(t('cachet.notSaved'), 'warn');
    }
    closeSheet();
    markup.setTool(null);
    addImageObject(current.src, { ratio: current.ratio, type: 'image', label: 'Cachet', widthPx: 190, pageShare: 0.4 });
    toast(t('image.placed'), 'success');
  });
  showCurrent();
  if (mode === 'create') q('#cachetL1').focus();
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
  const today = new Date().toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
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
    const opts = (field.options || []).filter(Boolean);
    const current = state.formValues[field.name] ?? field.value ?? '';
    const input =
      (field.type === 'select' || field.type === 'radio') && opts.length
        ? `<select data-form-field="${U.escapeHtml(field.name)}"><option value=""></option>${opts
            .map((o) => `<option value="${U.escapeHtml(o)}" ${String(current) === String(o) ? 'selected' : ''}>${U.escapeHtml(o)}</option>`)
            .join('')}</select>`
        : field.type === 'checkbox'
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
    const bytes = new Uint8Array(await fillFormFields(state.bytes, state.formValues));
    // Nouveau moteur de rendu sur les octets remplis, sans toucher aux
    // modifications ni aux annotations en cours.
    const engine = new PdfEngine(bytes.slice());
    await engine.load();
    const old = state.engine;
    state.engine = engine;
    state.bytes = bytes;
    old?.destroy();
    await renderCurrent();
    try {
      const hash = await Session.hashBytes(bytes);
      state.hash = hash;
      registerTab(hash, state.fileName);
      await persistDocument(hash, bytes);
    } catch {
      /* copie locale facultative */
    }
    scheduleAutosave(true);
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
  const cleanInfo = state.cleanedPages?.[n];
  if (cleanInfo?.dataUrl && cleanInfo.preset !== 'original') return cleanInfo.dataUrl;
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
        <button class="btn soft" id="ocrCleanSheet" type="button">${icon('sparkle', 16)}<span>${t('tool.clean')}</span></button>
      </div>
      <div id="ocrOneProgress" hidden>${progressMarkup(t('ocr.init'))}</div>
      <div class="ocr-langs-mini">
        <span class="muted small">${t('ocr.langs')}</span>
        <span class="badge" id="ocrDetected">${t('ocr.auto')}</span>
      </div>`,
  });
  if (!body) return;
  body.querySelector('#ocrCleanSheet')?.addEventListener('click', () => {
    closeSheet();
    openCleanSheet();
  });
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
  let src = null;
  try {
    const { PDFDocument } = await import('pdf-lib');
    src = await currentDocumentSource();
    const doc = await PDFDocument.create();
    for (let n = 1; n <= state.numPages; n++) {
      const canvas = document.createElement('canvas');
      await src.engine.renderToCanvas(n, canvas, level.scale);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', level.quality));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const img = await doc.embedJpg(bytes);
      const size = await src.engine.getPageSize(n);
      const page = doc.addPage([size.width, size.height]);
      page.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
    }
    const out = await doc.save({ useObjectStreams: true });
    const name = `${U.baseName(state.fileName)}-compresse.pdf`;
    U.downloadBlob(new Blob([out], { type: 'application/pdf' }), name);
    toast(t('compress.done', { before: U.formatBytes(src.bytes.byteLength), after: U.formatBytes(out.byteLength) }), 'success', { duration: 6000 });
  } catch (err) {
    console.error(err);
    toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
  } finally {
    src?.dispose();
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
    const src = await currentDocumentSource();
    src.dispose();
    const doc = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
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
      let src = null;
      try {
        src = await currentDocumentSource();
        for (let n = 1; n <= state.numPages; n++) {
          const canvas = document.createElement('canvas');
          await src.engine.renderToCanvas(n, canvas, 2);
          const type = kind === 'jpg' ? 'image/jpeg' : 'image/png';
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
          U.downloadBlob(blob, `${U.baseName(state.fileName)}-page-${n}.${kind}`);
        }
        toast(t('convert.done', { n: state.numPages }), 'success');
      } catch (err) {
        console.error(err);
        toast(t('msg.opFailed', { msg: err?.message || err }), 'error');
      } finally {
        src?.dispose();
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
    const locale = uiLocale();
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
    await openPdfBytes(bytes, item.name, '', { session: 'auto', readOnly: true });
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
  const orphans = items.filter((f) => !f.hasBytes).length;
  if (els.filesCleanup) {
    els.filesCleanup.hidden = orphans === 0;
    if (els.filesCleanupLabel) els.filesCleanupLabel.textContent = t('files.cleanup', { n: String(orphans) });
  }
  els.filesCount.textContent = String(items.length);
  els.filesEmpty.hidden = items.length > 0;
  els.filesList.hidden = items.length === 0;
  if (els.filesTotal) {
    els.filesTotal.textContent = items.length
      ? t(items.length === 1 ? 'files.totalOne' : 'files.total', { size: U.formatBytes(used), n: String(items.length) })
      : '';
    Session.storageInfo().then((info) => {
      if (!items.length || !els.filesTotal) return;
      els.filesTotal.textContent =
        t(items.length === 1 ? 'files.totalOne' : 'files.total', { size: U.formatBytes(used), n: String(items.length) }) +
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

/** Sauvegarde de tous les documents dans un seul fichier .pdfstudio. */
async function backupAllDocuments() {
  try {
    const records = (await Session.exportRecords()).filter((r) => r.bytes);
    if (!records.length) {
      toast(t('files.backupEmpty'), 'warn');
      return;
    }
    const blob = buildBackup(records);
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `pdf-studio-sauvegarde-${stamp}.pdfstudio`;
    const file = new File([blob], name, { type: 'application/octet-stream' });
    let shared = false;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        shared = true;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    if (!shared) U.downloadBlob(blob, name);
    toast(t('files.backupDone', { n: String(records.length) }), 'success', { duration: 6000 });
  } catch (err) {
    console.warn('[backup]', err);
    toast(t('files.storageError'), 'error');
  }
}

async function restoreFromBackup(file) {
  if (!file) return;
  let incoming;
  try {
    incoming = parseBackup(await file.arrayBuffer());
  } catch {
    toast(t('files.restoreBad'), 'error', { duration: 8000 });
    return;
  }
  try {
    const existing = await Session.listDocuments();
    const { restore, skipped } = planRestore(incoming, existing);
    let done = 0;
    let full = false;
    for (const rec of restore) {
      try {
        await Session.restoreRecord(rec);
        done++;
      } catch (err) {
        if (Session.isQuotaError(err)) {
          full = true;
          break;
        }
        throw err;
      }
    }
    toast(t(full ? 'files.restoreFull' : 'files.restoreDone', { n: String(done), skipped: String(skipped) }), full ? 'warn' : 'success', {
      duration: 7000,
    });
  } catch (err) {
    console.warn('[restore]', err);
    toast(t('files.storageError'), 'error');
  }
  await renderFilesScreen();
}

async function cleanupOrphans() {
  const n = filesCache.filter((f) => !f.hasBytes).length;
  if (!n) return;
  const ok = await askConfirm({
    title: t('files.cleanupTitle'),
    message: t('files.cleanupText', { n: String(n) }),
    confirmLabel: t('files.cleanup', { n: String(n) }),
    cancelLabel: t('common.cancel'),
  });
  if (!ok) return;
  try {
    const removed = await Session.purgeWithoutPdf();
    toast(t('files.cleanupDone', { n: String(removed) }), 'success');
  } catch {
    toast(t('files.storageError'), 'error');
  }
  await renderFilesScreen();
}

/* ─────────────────────── Photos → PDF (galerie / appareil photo) ─────────────────────── */

const photoJob = { pages: [], size: 'a4', filter: 'document', name: '' };

function photoThumb(page) {
  // Miniature : rotation + filtre appliqués sur une petite image.
  const rotated = rotateCanvas(page.small, page.rot);
  return applyFilter(rotated, photoJob.filter).toDataURL('image/jpeg', 0.7);
}

async function addPhotoFiles(files) {
  let bad = 0;
  for (const file of files) {
    try {
      const full = await fileToCanvas(file, 2200);
      const jpeg = await canvasToJpeg(full, 0.9);
      const k = Math.min(1, 260 / Math.max(full.width, full.height));
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(full.width * k));
      small.height = Math.max(1, Math.round(full.height * k));
      small.getContext('2d').drawImage(full, 0, 0, small.width, small.height);
      full.width = full.height = 1; // libère la mémoire du grand canevas
      photoJob.pages.push({ id: U.uid('ph'), jpeg, small, rot: 0, thumb: '' });
    } catch {
      bad++;
    }
  }
  if (bad) toast(t('photos.badImage'), 'warn');
}

async function buildPhotoPdf() {
  const pages = [];
  for (const p of photoJob.pages) {
    const canvas = await fileToCanvas(new Blob([p.jpeg], { type: 'image/jpeg' }), 2200);
    const rotated = rotateCanvas(canvas, p.rot);
    const filtered = applyFilter(rotated, photoJob.filter);
    pages.push({ jpeg: await canvasToJpeg(filtered, 0.85), width: filtered.width, height: filtered.height });
    canvas.width = canvas.height = 1;
  }
  return buildPdfFromJpegs(pages, { size: photoJob.size });
}

function openPhotosTool(reset = true) {
  if (reset) {
    photoJob.pages = [];
    photoJob.size = 'a4';
    photoJob.filter = 'document';
    photoJob.name = '';
  }
  const sizes = [['a4', 'photos.sizeA4'], ['letter', 'photos.sizeLetter'], ['fit', 'photos.sizeFit']];
  const filters = [['color', 'photos.filterColor'], ['document', 'photos.filterDoc'], ['bw', 'photos.filterBw']];
  const n = photoJob.pages.length;
  const html = `
    <div class="photo-add">
      <button class="btn primary" id="photoCamera" type="button">${icon('camera', 17)}<span>${t('photos.camera')}</span></button>
      <button class="btn soft" id="photoGallery" type="button">${icon('image', 17)}<span>${t('photos.gallery')}</span></button>
    </div>
    ${
      n
        ? `<div class="photo-grid">${photoJob.pages
            .map(
              (p, i) => `<figure class="photo-card" data-ph="${p.id}">
        <img src="${p.thumb || (p.thumb = photoThumb(p))}" alt="${t('photos.page', { n: String(i + 1) })}" />
        <figcaption>${i + 1}</figcaption>
        <div class="photo-tools">
          <button type="button" data-ph-act="left" aria-label="${t('photos.left')}" ${i === 0 ? 'disabled' : ''}>${icon('arrowLeft', 15)}</button>
          <button type="button" data-ph-act="rotate" aria-label="${t('photos.rotate')}">${icon('rotate', 15)}</button>
          <button type="button" data-ph-act="right" aria-label="${t('photos.right')}" ${i === n - 1 ? 'disabled' : ''}>${icon('arrowRight', 15)}</button>
          <button type="button" data-ph-act="remove" aria-label="${t('photos.remove')}">${icon('trash', 15)}</button>
        </div>
      </figure>`
            )
            .join('')}</div>`
        : `<p class="muted photo-empty">${t('photos.empty')}</p>`
    }
    <h4 class="photo-h">${t('photos.size')}</h4>
    <div class="photo-segs">${sizes.map(([v, k]) => `<button class="seg ${photoJob.size === v ? 'on' : ''}" data-ph-size="${v}" type="button">${t(k)}</button>`).join('')}</div>
    <h4 class="photo-h">${t('photos.filter')}</h4>
    <div class="photo-segs">${filters.map(([v, k]) => `<button class="seg ${photoJob.filter === v ? 'on' : ''}" data-ph-filter="${v}" type="button">${t(k)}</button>`).join('')}</div>
    <h4 class="photo-h">${t('photos.name')}</h4>
    <input id="photoName" class="photo-name" value="${U.escapeHtml(photoJob.name)}" placeholder="${t('photos.defaultName')}" maxlength="80" />
    <button class="btn primary photo-create" id="photoCreate" type="button" ${n ? '' : 'disabled'}>${icon('fileText', 17)}<span>${n === 1 ? t('photos.createOne') : t('photos.create', { n: String(n) })}</span></button>`;
  const body = openSheet({ title: t('photos.title'), html, size: 'tall' });
  if (!body) return;
  const q = (sel) => body.querySelector(sel);
  const keepName = () => {
    photoJob.name = q('#photoName')?.value || '';
  };
  const rerender = () => {
    keepName();
    openPhotosTool(false);
  };
  const pick = (capture) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = 'environment';
    else input.multiple = true;
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      if (!files.length) return;
      keepName();
      pushLoading(t('photos.adding'));
      try {
        await addPhotoFiles(files);
      } finally {
        popLoading();
      }
      openPhotosTool(false);
    });
    input.click();
  };
  q('#photoCamera').addEventListener('click', () => pick(true));
  q('#photoGallery').addEventListener('click', () => pick(false));
  body.querySelectorAll('[data-ph-act]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.closest('[data-ph]').dataset.ph;
      const i = photoJob.pages.findIndex((p) => p.id === id);
      if (i < 0) return;
      const act = btn.dataset.phAct;
      if (act === 'remove') photoJob.pages.splice(i, 1);
      else if (act === 'rotate') {
        photoJob.pages[i].rot = (photoJob.pages[i].rot + 1) % 4;
        photoJob.pages[i].thumb = '';
      } else {
        const j = act === 'left' ? i - 1 : i + 1;
        if (j >= 0 && j < photoJob.pages.length) [photoJob.pages[i], photoJob.pages[j]] = [photoJob.pages[j], photoJob.pages[i]];
      }
      rerender();
    })
  );
  body.querySelectorAll('[data-ph-size]').forEach((b) =>
    b.addEventListener('click', () => {
      photoJob.size = b.dataset.phSize;
      rerender();
    })
  );
  body.querySelectorAll('[data-ph-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      photoJob.filter = b.dataset.phFilter;
      photoJob.pages.forEach((p) => (p.thumb = ''));
      rerender();
    })
  );
  q('#photoCreate').addEventListener('click', async () => {
    if (!photoJob.pages.length) return;
    keepName();
    const count = photoJob.pages.length;
    const base = (photoJob.name || '').trim() || `${t('photos.defaultName')} ${new Date().toISOString().slice(0, 10)}`;
    const name = /\.pdf$/i.test(base) ? base : `${base}.pdf`;
    closeSheet();
    pushLoading(t('photos.working'));
    let bytes;
    try {
      bytes = await buildPhotoPdf();
    } catch (err) {
      console.warn('[photos]', err);
      toast(t('photos.badImage'), 'error');
      return;
    } finally {
      popLoading();
    }
    photoJob.pages = [];
    await openPdfBytes(new Uint8Array(bytes), name, '', { readOnly: true });
    routeTo('doc');
    toast(t('photos.done', { n: String(count) }), 'success', { duration: 5000 });
  });
}

/** Routes des outils : ouvre le document si nécessaire, puis l'outil. */
async function openTool(id) {
  if (id === 'combine') {
    const preset = state.engine && state.bytes ? [{ name: state.fileName, bytes: new Uint8Array(state.bytes), tabKey: state.hash }] : [];
    return openCombineTool(true, preset);
  }
  if (id === 'photos') return openPhotosTool();
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
  if (id === 'clean') {
    return openCleanSheet();
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
    const files = [...(els.fileInput.files || [])];
    els.fileInput.value = '';
    if (files.length) openFiles(files);
  });
  document.getElementById('combineInput')?.addEventListener('change', (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    addCombineFiles(files);
  });
  document.getElementById('docTabs')?.addEventListener('click', (e) => {
    const open = e.target.closest('[data-tab-open]');
    const close = e.target.closest('[data-tab-close]');
    if (close) return closeTab(close.dataset.tabClose);
    if (open) return switchTab(open.dataset.tabOpen);
    if (e.target.closest('[data-tab-add]')) return els.fileInput.click();
    if (e.target.closest('[data-tab-combine]')) {
      const preset = state.engine && state.bytes ? [{ name: state.fileName, bytes: new Uint8Array(state.bytes), tabKey: state.hash }] : [];
      openCombineTool(true, preset);
    }
  });
  window.addEventListener('resize', renderTabs);
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
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) openFiles(files);
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
  bindPageFlip();
  bindContinuousScrollAndWheel();
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
  els.homePhotos?.addEventListener('click', () => openPhotosTool());
  els.filesOpen?.addEventListener('click', () => els.fileInput.click());
  els.filesBrowse?.addEventListener('click', () => els.fileInput.click());
  els.filesRefresh?.addEventListener('click', () => renderFilesScreen());
  els.filesBackup?.addEventListener('click', () => backupAllDocuments());
  els.filesRestore?.addEventListener('click', () => els.backupInput?.click());
  els.filesCleanup?.addEventListener('click', () => cleanupOrphans());
  els.backupInput?.addEventListener('change', async () => {
    const file = els.backupInput.files?.[0];
    els.backupInput.value = '';
    await restoreFromBackup(file);
  });
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
  bindEditPanel();

  // Toucher en dehors du texte valide la modification.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!state.active) return;
      if (e.target.closest('.inline-shell, #formatbar, #editPanel, #editbar, #docDock, dialog, .popover, .font-picker, .sheet')) return;
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
  document.getElementById('btnCleanFromOcr')?.addEventListener('click', () => openCleanSheet());
  document.getElementById('btnCleanAfterOcr')?.addEventListener('click', () => openCleanSheet());

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

  const pinchTarget = () => (isContinuousRead() && els.pagesWrap ? els.pagesWrap : els.stage);

  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 2 || !state.engine) return;
      pinching = true;
      pinchActive = true;
      factor = 1;
      startDistance = distance(e.touches) || 1;
      startZoom = state.zoom ?? state.scale;
      pinchTarget().classList.add('pinching');
    },
    { passive: true }
  );

  el.addEventListener(
    'touchmove',
    (e) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
      factor = U.clamp(distance(e.touches) / startDistance, 0.3, 4);
      pinchTarget().style.transform = `scale(${factor})`;
    },
    { passive: false }
  );

  const end = () => {
    if (!pinching) return;
    pinching = false;
    pinchActive = false;
    lastPinchEndAt = Date.now();
    for (const node of [els.stage, els.pagesWrap]) {
      if (!node) continue;
      node.classList.remove('pinching');
      node.style.transform = '';
    }
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
    if (!state.engine || isContinuousRead() || state.active || markup.tool) return false;
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

function openVersionSheet() {
  const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const build = typeof __APP_BUILD__ !== 'undefined' ? new Date(__APP_BUILD__) : null;
  const commit = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '';
  const when = build && !Number.isNaN(build.getTime()) ? build.toLocaleString(uiLocale(), { dateStyle: 'long', timeStyle: 'short' }) : '—';
  const html = `<div class="ver-box">
    <p class="ver-num">PDF Studio <strong>v${U.escapeHtml(v)}</strong></p>
    <dl class="ver-list">
      <dt>${t('ver.build')}</dt><dd>${U.escapeHtml(when)}</dd>
      ${commit ? `<dt>${t('ver.commit')}</dt><dd><code>${U.escapeHtml(commit)}</code></dd>` : ''}
    </dl>
    <button class="btn primary" id="verUpdate" type="button">${t('ver.update')}</button>
    <p class="ver-note" id="verNote"></p>
  </div>`;
  const body = openSheet({ title: t('ver.sheet'), html });
  const btn = body?.querySelector('#verUpdate');
  btn?.addEventListener('click', async () => {
    const note = body.querySelector('#verNote');
    btn.disabled = true;
    note.textContent = t('ver.checking');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      // Recharge depuis le réseau : récupère la dernière version publiée.
      note.textContent = t('ver.reloading');
      setTimeout(() => location.reload(), 600);
    } catch {
      note.textContent = t('ver.fail');
      btn.disabled = false;
    }
  });
}

function registerServiceWorker() {
  const chip = document.getElementById('versionChip');
  if (chip) {
    chip.textContent = `v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}`;
    chip.addEventListener('click', openVersionSheet);
  }
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

/* ─────────── Ouverture depuis l'explorateur (PWA installée) et écran de départ ─────────── */

let launchedWithFile = false;

/** Fichiers PDF ouverts par le système (double-clic, « Ouvrir avec », partage). */
function bindLaunchFiles() {
  if (!('launchQueue' in window)) return;
  window.launchQueue.setConsumer(async (params) => {
    const handles = params?.files || [];
    if (!handles.length) return;
    launchedWithFile = true;
    try {
      const files = [];
      for (const handle of handles) files.push(await handle.getFile());
      routeTo('doc');
      await openFiles(files);
    } catch (err) {
      console.warn('[launch] fichier illisible', err);
      toast(t('msg.openFailed', { msg: err?.message || String(err) }), 'error');
    }
  });
}

/**
 * Écran de départ : la liste des fichiers (récents en haut) quand il y en a,
 * l'accueil sinon. Les raccourcis de l'icône (?open=files|photos) priment.
 */
async function openStartScreen() {
  const wanted = new URLSearchParams(location.search).get('open');
  if (wanted === 'photos') {
    routeTo('home');
    openPhotosTool();
    return;
  }
  if (wanted === 'files') {
    routeTo('files');
    return;
  }
  if (wanted === 'home') {
    routeTo('home');
    return;
  }
  try {
    const docs = await Session.listDocuments();
    // Un fichier ouvert par le système, ou un document déjà ouvert, garde la main.
    if (launchedWithFile || state.engine) return;
    if (docs.length) routeTo('files');
  } catch {
    /* stockage indisponible : on reste sur l'accueil */
  }
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
  bindLaunchFiles();
  openStartScreen();
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
  continuousState,
  pageFlipState,
  isContinuousRead,
  setEditGranularity,
  currentEditGranularity,
  /** Tests : ajoute une annotation comme le ferait un geste (avec historique). */
  addTestMarkup: (obj) => {
    if (!markupHistory.stack.length) pushMarkupHistory({ silent: true });
    markup.setObjects([...markup.objects, obj]);
    pushMarkupHistory();
  },
  setReadMode,
  /** Tests : document tel qu'utilisé par Compresser / Protéger / Convertir. */
  currentDocumentSource,
  buildCurrentPdf,
  openCleanSheet,
  applyCleanToPages,
  openWatermarkSheet,
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
    // Si un OCR automatique avait démarré en arrière-plan, on l'arrête pour
    // qu'il ne sature pas le moteur (WebKit CI) ni n'écrase les lignes injectées.
    if (state.ocr.running) {
      state.ocr.cancel = true;
      terminateOcr().catch(() => {});
    }
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
    if (els.expOcr) els.expOcr.checked = true;
    renderOverlay();
    renderEditList();
    updateExportUi();
    updateDock();
    updateOcrPanel();
    updateTextPanel();
    return normalized.length;
  },
};
