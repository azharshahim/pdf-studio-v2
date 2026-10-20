import { createWorker, OEM } from 'tesseract.js';
import { assetUrl } from './utils.js';

const LANG_MAP = {
  'fra+eng': ['fra', 'eng'],
  fra: ['fra'],
  eng: ['eng'],
};

const VERSION = '1';

let worker = null;
let workerLangs = null;
let initPromise = null;
let activeLogger = null;
let lastUsed = 0;

/**
 * Crée (ou réutilise) le worker Tesseract. Les ressources sont servies
 * localement depuis `public/tesseract`, `public/tesseract-core` et
 * `public/tessdata`, avec des URL construites à partir de BASE_URL.
 */
async function ensureWorker(langsKey) {
  workerLangs = workerLangs || langsKey;
  if (worker && workerLangs === langsKey) return worker;

  if (worker && workerLangs !== langsKey) {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
    worker = null;
    initPromise = null;
  }
  if (initPromise) return initPromise;

  workerLangs = langsKey;
  initPromise = createWorker(LANG_MAP[langsKey] || ['fra', 'eng'], OEM.LSTM_ONLY, {
    workerPath: `${assetUrl('tesseract/worker.min.js')}?v=${VERSION}`,
    corePath: assetUrl('tesseract-core'),
    langPath: assetUrl('tessdata'),
    cacheMethod: 'none', // évite IndexedDB (bloqué dans certains contextes sandboxés)
    workerBlobURL: true,
    legacyCore: false,
    legacyLang: false,
    logger: (m) => {
      if (activeLogger) activeLogger(m);
    },
    errorHandler: (e) => console.error('[tesseract]', e),
  })
    .then((w) => {
      worker = w;
      lastUsed = Date.now();
      return w;
    })
    .catch((err) => {
      initPromise = null;
      workerLangs = null;
      worker = null;
      throw err;
    });

  return initPromise;
}

function parseBlocks(data) {
  const lines = [];
  const words = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const ws = (line.words || [])
          .filter((w) => w.text && w.text.trim())
          .map((w) => ({
            text: w.text.trim(),
            bbox: w.bbox,
            confidence: w.confidence,
          }));
        if (!ws.length) continue;
        lines.push({
          text: (line.text || ws.map((w) => w.text).join(' ')).replace(/\s+/g, ' ').trim(),
          bbox: line.bbox,
          confidence: line.confidence,
          words: ws,
        });
        words.push(...ws);
      }
    }
  }
  return { lines, words };
}

/**
 * Lance l'OCR sur un canvas déjà rendu.
 * @param {HTMLCanvasElement} canvas
 * @param {'fra'|'eng'|'fra+eng'} langsKey
 * @param {(m: {status: string, progress: number}) => void} onProgress
 */
export async function recognizeCanvas(canvas, langsKey, onProgress) {
  activeLogger = onProgress || null;
  const w = await ensureWorker(langsKey);
  activeLogger = onProgress || null;
  const result = await w.recognize(canvas, {}, { blocks: true, text: true });
  const data = result.data || {};
  const { lines, words } = parseBlocks(data);
  return {
    text: (data.text || '').replace(/\r\n/g, '\n').trim(),
    confidence: data.confidence || 0,
    lines,
    words,
    langs: langsKey,
    at: Date.now(),
  };
}

export async function terminateOcr() {
  if (!worker) return;
  try {
    await worker.terminate();
  } catch {
    /* ignore */
  }
  worker = null;
  workerLangs = null;
  initPromise = null;
  activeLogger = null;
}

export function isWorkerReady() {
  return !!worker && Date.now() - lastUsed < 1000 * 60 * 10;
}
