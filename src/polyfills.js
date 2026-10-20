/**
 * Polyfills pour les API JavaScript récentes utilisées par pdf.js, Tesseract
 * et nos propres modules. À importer en tout premier dans main.js.
 *
 * `pdfjs-dist/legacy` embarque déjà la plupart de ces polyfills ; on les
 * duplique volontairement (ils sont inoffensifs) afin de couvrir aussi les
 * workers et les navigateurs plus anciens (Safari < 17.4, Firefox < 128).
 */

/* Promise.withResolvers (ES2024, Safari 17.4+, Firefox 121+) */
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/* Promise.try (ES2025, Safari 18.4+, Firefox 134+) */
if (typeof Promise.try !== 'function') {
  Promise.try = function tryFn(fn, ...args) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

/* Map/WeakMap.prototype.getOrInsert & getOrInsertComputed (proposition TC39) */
for (const Ctor of [Map, WeakMap]) {
  if (typeof Ctor.prototype.getOrInsert !== 'function') {
    Object.defineProperty(Ctor.prototype, 'getOrInsert', {
      value: function getOrInsert(key, value) {
        if (this.has(key)) return this.get(key);
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
    });
  }
  if (typeof Ctor.prototype.getOrInsertComputed !== 'function') {
    Object.defineProperty(Ctor.prototype, 'getOrInsertComputed', {
      value: function getOrInsertComputed(key, callback) {
        if (this.has(key)) return this.get(key);
        const value = callback(key);
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
    });
  }
}

/* structuredClone (Safari 15.4+, Firefox 94+) — repli JSON pour les données simples */
if (typeof structuredClone !== 'function') {
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

/* Array.prototype.at / String.prototype.at (Safari 15.4+) */
for (const proto of [Array.prototype, String.prototype]) {
  if (typeof proto.at !== 'function') {
    Object.defineProperty(proto, 'at', {
      value: function at(index) {
        const i = Math.trunc(index) || 0;
        return this[i < 0 ? this.length + i : i];
      },
      writable: true,
      configurable: true,
    });
  }
}

/* Object.hasOwn (Safari 15.4+) */
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
}
