/*
 * Service worker de PDF Studio.
 * Stratégies :
 *  - navigation : réseau d'abord, repli sur l'application en cache (hors ligne) ;
 *  - assets statiques (JS, CSS, polices, modèles OCR, pdf.js) : cache d'abord ;
 *  - tout le reste : réseau avec mise en cache opportuniste.
 * Aucune requête ne sort de l'origine : aucun fichier utilisateur n'est transmis.
 */

const VERSION = 'pdf-studio-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

/** Liste complète des fichiers du build (générée par Vite dans precache.json). */
async function precacheList() {
  try {
    const res = await fetch('./precache.json', { cache: 'no-store' });
    if (!res.ok) return SHELL;
    const list = await res.json();
    return Array.isArray(list) && list.length ? list.concat(SHELL) : SHELL;
  } catch {
    return SHELL;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      const list = await precacheList();
      // add() individuel : un fichier manquant ne fait pas échouer l'installation.
      await Promise.allSettled(list.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau puis cache (fonctionne hors ligne).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
