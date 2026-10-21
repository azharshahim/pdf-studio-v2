/**
 * Magasin de documents local (IndexedDB).
 *
 * Un enregistrement = un PDF complet : ses octets, son nom, sa taille, et la
 * session d'édition (modifications, annotations, OCR). Tout est écrit dans le
 * **même** enregistrement ; les mises à jour sont fusionnées, sinon la
 * sauvegarde de la session effacerait les octets (et inversement).
 *
 * Aucune donnée ne quitte le navigateur. Le stockage est demandé « persistant »
 * (le navigateur ne l'efface pas de lui-même) et limité par l'espace réel du
 * navigateur, pas par un nombre fixe de documents.
 *
 * Robustesse : aucune opération ne peut rester en attente indéfiniment. Si la
 * base est bloquée par une autre fenêtre (mise à niveau), si elle ne répond
 * pas ou si elle est indisponible, l'appelant reçoit une `StorageError` au
 * bout d'un délai et peut réessayer ou réinitialiser le stockage.
 */

const DB_NAME = 'pdf-studio';
const DB_VERSION = 2;
const STORE = 'sessions';

/** Plafond de sécurité du nombre de documents (pas une limite d'usage). */
export const MAX_DOCUMENTS = 1000;
/** Plafond par défaut quand le navigateur ne donne pas son quota. */
export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MIN_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_TOTAL_CAP = 4 * 1024 * 1024 * 1024;

const timeouts = { open: 8000, tx: 20000 };

/** Pour les tests : raccourcit les délais. */
export function __setTimeouts(next = {}) {
  Object.assign(timeouts, next);
}

/**
 * Erreur de stockage local.
 * `code` : 'blocked' (une autre fenêtre garde l'ancienne base ouverte),
 * 'timeout' (pas de réponse), 'unavailable' (IndexedDB refusé).
 */
export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message || code);
    this.name = 'StorageError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

let dbPromise = null;
let currentDb = null;
let blockedSeen = false;

function resetConnection() {
  dbPromise = null;
  if (currentDb) {
    try {
      currentDb.close();
    } catch {
      /* déjà fermée */
    }
  }
  currentDb = null;
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      done(
        reject,
        new StorageError(
          blockedSeen ? 'blocked' : 'timeout',
          blockedSeen ? 'Base bloquée par une autre fenêtre' : "Le stockage local ne répond pas"
        )
      );
    }, timeouts.open);
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      return done(reject, new StorageError('unavailable', 'IndexedDB indisponible', err));
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    // Une autre fenêtre garde l'ancienne version ouverte : la mise à niveau
    // attend. On le note ; elle reprend dès que l'autre fenêtre se ferme.
    req.onblocked = () => {
      blockedSeen = true;
      console.warn('[store] mise à niveau bloquée par une autre fenêtre');
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        // Réponse tardive après abandon : on referme proprement.
        try {
          db.close();
        } catch {
          /* ignoré */
        }
        return;
      }
      blockedSeen = false;
      // Cette fenêtre ne doit jamais bloquer une version plus récente.
      db.onversionchange = () => {
        db.close();
        if (currentDb === db) {
          currentDb = null;
          dbPromise = null;
        }
      };
      db.onclose = () => {
        if (currentDb === db) {
          currentDb = null;
          dbPromise = null;
        }
      };
      currentDb = db;
      done(resolve, db);
    };
    req.onerror = () => {
      console.warn('[store] IndexedDB indisponible', req.error);
      done(reject, new StorageError('unavailable', 'IndexedDB indisponible', req.error));
    };
  });
  dbPromise = promise;
  // Un échec ne doit pas rester en cache : le prochain appel réessaie.
  promise.catch(() => {
    if (dbPromise === promise) dbPromise = null;
  });
  return promise;
}

/**
 * Exécute `fn(store)` dans une transaction. Rejette en cas d'erreur (quota,
 * transaction avortée, délai dépassé) pour que l'appelant puisse prévenir
 * l'utilisateur.
 */
function withStore(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) return resolve(null);
        let tx;
        try {
          tx = db.transaction(STORE, mode);
        } catch (err) {
          resetConnection();
          return reject(err);
        }
        let result;
        let thrown = null;
        let finished = false;
        const finish = (fnDone, value) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          fnDone(value);
        };
        const timer = setTimeout(() => {
          try {
            tx.abort();
          } catch {
            /* déjà terminée */
          }
          finish(reject, new StorageError('timeout', 'Le stockage local ne répond pas'));
        }, timeouts.tx);
        try {
          result = fn(tx.objectStore(STORE));
        } catch (err) {
          // Erreur synchrone (quota, structure) : on la garde pour la remonter
          // telle quelle, `tx.error` pouvant rester vide.
          thrown = err;
          try {
            tx.abort();
          } catch {
            /* déjà terminée */
          }
          return finish(reject, err);
        }
        // Une écriture peut échouer dans un gestionnaire d'événement (quota) :
        // l'erreur exacte est conservée par l'opération, `tx.error` ne
        // contenant alors qu'un AbortError générique.
        const failure = () => (result && typeof result.failure !== 'undefined' ? result.failure : null);
        tx.oncomplete = () => finish(resolve, result?.result ?? result ?? null);
        tx.onerror = () => finish(reject, failure() || tx.error || thrown || new Error('transaction interrompue'));
        tx.onabort = () => finish(reject, failure() || tx.error || thrown || new Error('transaction annulée'));
      })
  );
}

/** Vérifie que le stockage répond (ouverture + lecture). */
export async function checkStorage() {
  await listDocuments();
  return true;
}

/**
 * Supprime et recrée la base locale. Les documents enregistrés sont perdus :
 * dernier recours quand la base est corrompue ou bloquée.
 */
export function resetStorage() {
  resetConnection();
  if (typeof indexedDB === 'undefined') return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new StorageError('blocked', 'Suppression bloquée : fermez les autres fenêtres'));
    }, timeouts.open);
    let req;
    try {
      req = indexedDB.deleteDatabase(DB_NAME);
    } catch (err) {
      clearTimeout(timer);
      return reject(new StorageError('unavailable', 'IndexedDB indisponible', err));
    }
    req.onsuccess = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new StorageError('unavailable', 'Suppression impossible', req.error));
    };
    // `onblocked` : une autre fenêtre garde la base ouverte ; on attend le délai.
  });
}

/**
 * Demande au navigateur de ne jamais effacer ces données de lui-même
 * (« stockage persistant »). Sans cela, il peut les purger quand l'espace
 * manque. Silencieux : le navigateur peut refuser sans que ce soit une erreur.
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return !!(await navigator.storage.persist());
  } catch {
    /* non supporté */
  }
  return false;
}

/** État du stockage : usage, quota, persistance. */
export async function storageInfo() {
  const info = { usage: 0, quota: 0, persisted: false };
  try {
    const est = await navigator.storage?.estimate?.();
    info.usage = est?.usage || 0;
    info.quota = est?.quota || 0;
    info.persisted = !!(await navigator.storage?.persisted?.());
  } catch {
    /* non supporté */
  }
  return info;
}

/** Plafond d'espace utilisable pour les documents (octets). */
export async function maxTotalBytes() {
  const { quota } = await storageInfo();
  if (!quota) return MAX_TOTAL_BYTES;
  return Math.min(MAX_TOTAL_CAP, Math.max(MIN_TOTAL_BYTES, Math.floor(quota * 0.6)));
}

/** Vrai pour une erreur de quota de stockage. */
export function isQuotaError(err) {
  return (
    err?.name === 'QuotaExceededError' ||
    err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(String(err?.message || ''))
  );
}

/** Empreinte SHA-256 des octets du PDF (repli FNV-1a si SubtleCrypto absent). */
export async function hashBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* repli ci-dessous */
  }
  let hash = 0x811c9dc5;
  const step = Math.max(1, Math.floor(data.length / 4096));
  for (let i = 0; i < data.length; i += step) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv-${hash.toString(16)}-${data.length}`;
}

/**
 * Fusionne `patch` dans l'enregistrement `key` (créé au besoin). Les champs
 * absents du patch — notamment les octets — sont conservés.
 */
export function updateDocument(key, patch = {}, { touch = true } = {}) {
  let failure = null;
  return withStore('readwrite', (store) => {
    const get = store.get(key);
    let written;
    get.onsuccess = () => {
      try {
        const current = get.result || { key, createdAt: Date.now() };
        const next = { ...current, ...patch, key };
        if (touch) next.updatedAt = Date.now();
        written = store.put(next);
      } catch (err) {
        // Certains navigateurs lèvent le quota de façon synchrone.
        failure = err;
        try {
          store.transaction.abort();
        } catch {
          /* transaction déjà terminée */
        }
      }
    };
    get.onerror = () => {
      failure = get.error;
    };
    return {
      get result() {
        return written;
      },
      get failure() {
        return failure;
      },
    };
  });
}

/** Enregistre les octets du PDF et ses métadonnées. */
export async function saveDocumentBytes(key, bytes, meta = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Copie : le buffer d'origine peut être détaché par pdf.js.
  const copy = data.slice();
  return updateDocument(key, {
    bytes: copy.buffer,
    name: meta.name || 'document.pdf',
    size: copy.byteLength,
    numPages: meta.numPages || 0,
  });
}

/** Enregistre la session d'édition sans toucher aux octets. */
export function saveSession(key, payload) {
  return updateDocument(key, {
    name: payload.name,
    numPages: payload.numPages,
    edits: payload.edits || [],
    ocrPages: payload.ocrPages || [],
    markup: payload.markup || [],
  });
}

export function loadSession(key) {
  return withStore('readonly', (store) => store.get(key));
}

/** Octets du PDF enregistré, ou null s'ils ont disparu. */
export async function loadBytes(key) {
  const entry = await loadSession(key);
  if (!entry?.bytes) return null;
  return new Uint8Array(entry.bytes);
}

export function deleteDocument(key) {
  return withStore('readwrite', (store) => store.delete(key));
}

/** Compatibilité : supprime l'enregistrement complet (octets compris). */
export const deleteSession = deleteDocument;

/**
 * Liste des documents enregistrés, sans les octets.
 * @returns {Promise<Array<{key,name,size,updatedAt,createdAt,numPages,edits,ocr,markup,hasBytes}>>}
 */
export async function listDocuments() {
  const all = await withStore('readonly', (store) => store.getAll());
  if (!Array.isArray(all)) return [];
  return all
    .map((entry) => ({
      key: entry.key,
      name: entry.name || 'document.pdf',
      size: entry.size || 0,
      updatedAt: entry.updatedAt || entry.createdAt || 0,
      createdAt: entry.createdAt || entry.updatedAt || 0,
      numPages: entry.numPages || 0,
      edits: entry.edits?.length || 0,
      ocr: entry.ocrPages?.length || 0,
      markup: entry.markup?.length || 0,
      hasBytes: !!entry.bytes,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Compatibilité avec l'ancien nom. */
export const listSessions = listDocuments;

export async function renameDocument(key, name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  await updateDocument(key, { name: clean }, { touch: false });
  return clean;
}

export const renameSession = renameDocument;

/** Espace total occupé par les documents enregistrés (octets). */
export async function usedBytes() {
  const docs = await listDocuments();
  return docs.reduce((sum, d) => sum + d.size, 0);
}

/**
 * Décide quels documents supprimer pour faire tenir `incoming` dans les
 * limites. Fonction pure, testable hors navigateur.
 *
 * @param {Array<{key:string,size:number,updatedAt:number}>} docs documents existants
 * @param {{incomingKey?:string, incomingBytes?:number, maxDocs?:number, maxBytes?:number}} options
 * @returns {{evict: string[], total: number, count: number, blocked: boolean, over: boolean}}
 *   `evict` : clés à supprimer (plus anciennes d'abord), `blocked` : le document
 *   entrant dépasse à lui seul la limite (impossible à enregistrer).
 */
export function chooseEvictions(
  docs,
  { incomingKey = null, incomingBytes = 0, maxDocs = MAX_DOCUMENTS, maxBytes = MAX_TOTAL_BYTES } = {}
) {
  const others = (docs || [])
    .filter((d) => d.key !== incomingKey)
    .map((d) => ({ key: d.key, size: Number(d.size) || 0, updatedAt: Number(d.updatedAt) || 0 }))
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const blocked = incomingBytes > maxBytes;
  if (blocked) return { evict: [], total: incomingBytes, count: 1, blocked: true, over: true };

  const evict = [];
  let total = incomingBytes + others.reduce((sum, d) => sum + d.size, 0);
  let count = others.length + 1;
  for (const doc of others) {
    if (count <= maxDocs && total <= maxBytes) break;
    evict.push(doc.key);
    total -= doc.size;
    count -= 1;
  }
  return { evict, total, count, blocked: false, over: count > maxDocs || total > maxBytes };
}

/**
 * Vérifie les limites avant d'enregistrer un document.
 * @returns {Promise<{ok:boolean, evict:string[], blocked:boolean, total:number}>}
 */
export async function checkLimits(incomingKey, incomingBytes) {
  let docs = [];
  try {
    docs = await listDocuments();
  } catch {
    return { ok: true, evict: [], blocked: false, total: 0 };
  }
  const maxBytes = await maxTotalBytes();
  const plan = chooseEvictions(docs, { incomingKey, incomingBytes, maxBytes });
  return {
    ok: !plan.blocked && !plan.over,
    evict: plan.evict,
    blocked: plan.blocked,
    total: plan.total,
    maxBytes,
  };
}

/** Taille lisible : « 1,4 Mo », « 860 ko ». */
export function formatBytes(bytes, lang = 'fr') {
  const n = Number(bytes) || 0;
  const units = {
    fr: ['o', 'ko', 'Mo', 'Go'],
    en: ['B', 'kB', 'MB', 'GB'],
    ar: ['بايت', 'ك.ب', 'م.ب', 'غ.ب'],
  }[lang] || ['o', 'ko', 'Mo', 'Go'];
  if (n < 1024) return `${n} ${units[0]}`;
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  let formatted;
  try {
    formatted = new Intl.NumberFormat(lang === 'ar' ? 'ar' : lang === 'en' ? 'en' : 'fr', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    formatted = value.toFixed(digits).replace('.', ',');
  }
  return `${formatted} ${units[unit]}`;
}
