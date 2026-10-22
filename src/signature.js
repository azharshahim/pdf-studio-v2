/**
 * Signatures et tampons : création (dessin, saisie, image), bibliothèque
 * enregistrée dans le navigateur, et insertion sur la page.
 */

import { icon } from './icons.js';
import { t } from './i18n.js';

const STORE_KEY = 'pdf-studio-signatures';

export const SIGNATURE_FONTS = [
  { id: 'script', label: 'Script', css: "'Segoe Script','Brush Script MT',cursive" },
  { id: 'hand', label: 'Manuscrite', css: "'Bradley Hand','Comic Sans MS',cursive" },
  { id: 'elegant', label: 'Élégante', css: "'Snell Roundhand','Apple Chancery',cursive" },
];

export function loadSignatures() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveSignature(entry) {
  const list = loadSignatures();
  const item = { id: `sig-${Date.now().toString(36)}`, createdAt: Date.now(), ...entry };
  list.unshift(item);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* stockage plein */
  }
  return item;
}

const STAMP_KEY = 'pdf-studio-stamps';

export function loadStamps() {
  try {
    const list = JSON.parse(localStorage.getItem(STAMP_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Enregistre un tampon personnalisé (texte + couleur) ; pas de doublon. */
export function saveStamp({ text, color }) {
  const list = loadStamps().filter((s) => !(s.text === text && s.color === color));
  list.unshift({ id: `stp-${Date.now().toString(36)}`, text, color });
  try {
    localStorage.setItem(STAMP_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* stockage plein */
  }
  return list;
}

/** Enregistre un cachet-image (PNG transparent) dans « Mes tampons ». */
export function saveImageStamp({ src, ratio, label = '' }) {
  const list = loadStamps();
  list.unshift({ id: `stp-${Date.now().toString(36)}`, kind: 'image', src, ratio, label });
  // Les images pèsent : on garde les 12 plus récents, quitte à en retirer.
  let kept = list.slice(0, 12);
  while (kept.length) {
    try {
      localStorage.setItem(STAMP_KEY, JSON.stringify(kept));
      return { ok: true, list: kept };
    } catch {
      kept = kept.slice(0, -1);
    }
  }
  return { ok: false, list: [] };
}

export function deleteStamp(id) {
  const list = loadStamps().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STAMP_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

const NAME_KEY = 'pdf-studio-name';

export function loadSignerName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveSignerName(name) {
  try {
    localStorage.setItem(NAME_KEY, String(name || '').trim());
  } catch {
    /* ignore */
  }
}

export function deleteSignature(id) {
  const list = loadSignatures().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

/** Canvas de signature manuscrite : renvoie un dataURL PNG transparent. */
export function createSignaturePad(canvas, { color = '#111827', width = 2.6 } = {}) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let last = null;
  let dirty = false;

  const resize = () => {
    const ratio = globalThis.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const snapshot = dirty ? canvas.toDataURL() : null;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = snapshot;
    }
  };

  const pos = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    canvas.setPointerCapture?.(ev.pointerId);
    drawing = true;
    dirty = true;
    last = pos(ev);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drawing) return;
    ev.preventDefault();
    const p = pos(ev);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });
  const stop = () => {
    drawing = false;
    last = null;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  return {
    resize,
    clear() {
      const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      dirty = false;
    },
    isEmpty() {
      return !dirty;
    },
    toDataURL() {
      return canvas.toDataURL('image/png');
    },
  };
}

/** Rend une signature tapée en PNG transparent (mesure réelle du texte). */
export function typedSignature(text, fontCss, { color = '#111827', size = 64 } = {}) {
  const canvas = document.createElement('canvas');
  const ratio = 2;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${size}px ${fontCss}`;
  const width = Math.ceil(measure.measureText(text || ' ').width) + 40;
  const height = Math.ceil(size * 1.8);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = color;
  ctx.font = `${size}px ${fontCss}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, height / 2);
  return { src: canvas.toDataURL('image/png'), ratio: width / height };
}

/** Supprime le fond clair d'une image (photo de signature sur papier). */
export function removeLightBackground(src, threshold = 200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        if (r > threshold && g > threshold && b > threshold) px[i + 3] = 0;
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export function signatureSheetHtml() {
  const list = loadSignatures();
  const saved = list.length
    ? `<div class="sig-saved">${list
        .map(
          (s) => `<button class="sig-item" data-sig-use="${s.id}" type="button">
            <img src="${s.src}" alt="" />
            <span class="sig-del" data-sig-del="${s.id}" role="button" aria-label="${t('sign.delete')}">${icon('x', 13)}</span>
          </button>`,
        )
        .join('')}</div>`
    : '';
  const quick = `<div class="sig-quick-wrap"><h4>${t('sign.quick')}</h4>
      <div class="sig-quick">
        <button class="quick-chip" data-quick="date" type="button">${icon('clock', 15)}<span>${t('quick.date')}</span></button>
        <button class="quick-chip" data-quick="check" type="button"><span class="quick-glyph">✓</span></button>
        <button class="quick-chip" data-quick="cross" type="button"><span class="quick-glyph">✗</span></button>
        <button class="quick-chip" data-quick="name" type="button">${icon('text', 15)}<span>${t('quick.name')}</span></button>
      </div></div>`;
  return `
    ${saved ? `<div class="sig-saved-wrap first"><h4>${t('sign.saved')}</h4>${saved}</div>` : ''}
    ${quick}
    <div class="sig-tabs" role="tablist">
      <button class="sig-tab active" data-sig-tab="draw" type="button">${t('sign.draw')}</button>
      <button class="sig-tab" data-sig-tab="type" type="button">${t('sign.type')}</button>
      <button class="sig-tab" data-sig-tab="image" type="button">${t('sign.image')}</button>
    </div>
    <div class="sig-pane" data-sig-pane="draw">
      <canvas class="sig-pad" id="sigPad" height="150"></canvas>
      <div class="sig-actions">
        <button class="btn ghost small" id="sigClear" type="button">${icon('trash', 15)}<span>${t('sign.clear')}</span></button>
        <button class="btn primary small" id="sigSaveDraw" type="button">${icon('check', 15)}<span>${t('sign.use')}</span></button>
      </div>
    </div>
    <div class="sig-pane" data-sig-pane="type" hidden>
      <input class="sig-input" id="sigText" placeholder="${t('sign.name')}" value="" />
      <div class="sig-fonts" id="sigFonts">
        ${SIGNATURE_FONTS.map(
          (f, i) =>
            `<button class="sig-font ${i === 0 ? 'active' : ''}" data-sig-font="${f.id}" style="font-family:${f.css}" type="button">Aa</button>`,
        ).join('')}
      </div>
      <div class="sig-preview" id="sigPreview" style="font-family:${SIGNATURE_FONTS[0].css}"></div>
      <button class="btn primary wide" id="sigSaveType" type="button">${icon('check', 15)}<span>${t('sign.use')}</span></button>
    </div>
    <div class="sig-pane" data-sig-pane="image" hidden>
      <p class="muted small">${t('sign.imageHint')}</p>
      <label class="check compact"><input type="checkbox" id="sigTrim" checked /><span>${t('sign.trimBg')}</span></label>
      <button class="btn soft wide" id="sigPickImage" type="button">${icon('image', 16)}<span>${t('sign.choose')}</span></button>
      <input type="file" id="sigFile" accept="image/*" hidden />
    </div>
    <div class="sig-cert-cta">
      <button class="btn soft wide" id="sigOpenCert" type="button">${icon('shield', 16)}<span>${t('cert.openFromSign')}</span></button>
    </div>
  `;
}
