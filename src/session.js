/**
 * Sauvegarde de session locale (IndexedDB).
 *
 * Chaque document est identifié par l'empreinte SHA-256 de ses octets :
 * rouvrir le même fichier propose de reprendre les modifications et les
 * résultats OCR. Aucune donnée ne quitte le navigateur.
 */

const DB_NAME = 'pdf-studio';
const DB_VERSION = 1;
const STORE = 'sessions';

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[session] IndexedDB indisponible', req.error);
        resolve(null);
      };
    });
  }
  return dbPromise;
}

function withStore(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);
        let tx;
        try {
          tx = db.transaction(STORE, mode);
        } catch {
          return resolve(null);
        }
        const store = tx.objectStore(STORE);
        let result;
        try {
          result = fn(store);
        } catch (err) {
          console.warn('[session] opération impossible', err);
          return resolve(null);
        }
        tx.oncomplete = () => resolve(result?.result ?? result ?? null);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      })
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

export async function saveSession(key, payload) {
  return withStore('readwrite', (store) =>
    store.put({ key, ...payload, updatedAt: Date.now() })
  );
}

export async function loadSession(key) {
  return withStore('readonly', (store) => store.get(key));
}

export async function deleteSession(key) {
  return withStore('readwrite', (store) => store.delete(key));
}

export async function clearSessions() {
  return withStore('readwrite', (store) => store.clear());
}

/** Enregistre les octets du document avec la session (pour « Fichiers »). */
export async function saveBytes(key, bytes, meta = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = data.slice();
  return withStore('readwrite', (store) =>
    store.put({
      key,
      bytes: copy.buffer,
      name: meta.name || 'document.pdf',
      size: copy.byteLength,
      updatedAt: Date.now(),
    })
  );
}

export async function loadBytes(key) {
  const entry = await loadSession(key);
  if (!entry?.bytes) return null;
  return new Uint8Array(entry.bytes);
}

/** Liste les documents enregistrés (sans les octets). */
export async function listSessions() {
  const all = await withStore('readonly', (store) => store.getAll());
  if (!Array.isArray(all)) return [];
  return all
    .map((entry) => ({
      key: entry.key,
      name: entry.name || 'document.pdf',
      size: entry.size || 0,
      updatedAt: entry.updatedAt || 0,
      edits: entry.edits?.length || 0,
      ocr: entry.ocrPages?.length || 0,
      hasBytes: !!entry.bytes,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function renameSession(key, name) {
  const entry = await loadSession(key);
  if (!entry) return;
  return saveSession(key, { ...entry, name });
}
