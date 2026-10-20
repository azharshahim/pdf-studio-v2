/**
 * Détection et remplissage des champs AcroForm.
 * Les valeurs restent locales et sont appliquées à l'export.
 */

async function loadLib() {
  const lib = await import('pdf-lib');
  return lib;
}

/** @returns {Promise<Array<{name:string,type:string,value:string,options:string[]}>>} */
export async function readFormFields(bytes) {
  const { PDFDocument } = await loadLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const form = doc.getForm();
  const fields = form.getFields();
  const result = [];
  for (const field of fields) {
    const name = field.getName();
    const constructor = field.constructor.name;
    let type = 'text';
    let value = '';
    let options = [];
    if (constructor.includes('CheckBox')) {
      type = 'checkbox';
      value = field.isChecked() ? 'true' : '';
    } else if (constructor.includes('RadioGroup')) {
      type = 'radio';
      value = field.getSelected() || '';
      options = field.getOptions();
    } else if (constructor.includes('Dropdown')) {
      type = 'select';
      value = field.getSelected()?.[0] || '';
      options = field.getOptions();
    } else if (constructor.includes('OptionList')) {
      type = 'select';
      value = field.getSelected()?.[0] || '';
      options = field.getOptions();
    } else if (constructor.includes('Button')) {
      type = 'button';
    } else if (typeof field.getText === 'function') {
      type = 'text';
      value = field.getText() || '';
    }
    result.push({ name, type, value, options });
  }
  return result;
}

/**
 * Remplit les champs puis renvoie le PDF.
 * @param {Uint8Array} bytes
 * @param {Record<string,string>} values
 * @param {{flatten?:boolean}} [opts]
 */
export async function fillFormFields(bytes, values = {}, { flatten = false } = {}) {
  const { PDFDocument } = await loadLib();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values)) continue;
    const constructor = field.constructor.name;
    const value = values[name];
    try {
      if (constructor.includes('CheckBox')) {
        if (value === 'true' || value === true) field.check();
        else field.uncheck();
      } else if (constructor.includes('RadioGroup')) {
        if (value) field.select(String(value));
      } else if (constructor.includes('Dropdown') || constructor.includes('OptionList')) {
        if (value) field.select(String(value));
      } else if (typeof field.setText === 'function') {
        field.setText(String(value ?? ''));
      }
    } catch (err) {
      console.warn('[forms] champ ignoré', name, err);
    }
  }
  if (flatten) form.flatten();
  return doc.save();
}

/**
 * Lit les champs **avec leur position** à partir des annotations du lecteur PDF.
 * Les rectangles restent en coordonnées PDF (origine en bas à gauche).
 * @param {any} pageProxy page pdf.js déjà chargée
 * @param {number} pageNo numéro de page (1-indexé)
 */
export async function readFormWidgetsFromPage(pageProxy, pageNo = 1) {
  const annotations = await pageProxy.getAnnotations();
  const out = [];
  for (const annot of annotations) {
    if (annot.subtype !== 'Widget') continue;
    const rect = annot.rect;
    if (!Array.isArray(rect) || rect.length < 4) continue;
    const [x1, y1, x2, y2] = rect.map(Number);
    const type = annot.fieldType === 'Tx'
      ? 'text'
      : annot.fieldType === 'Btn'
        ? annot.checkBox
          ? 'checkbox'
          : 'radio'
        : annot.fieldType === 'Ch'
          ? 'select'
          : 'text';
    out.push({
      name: annot.fieldName || `field-${out.length + 1}`,
      type,
      options: annot.options?.map((o) => o.displayValue || o.exportValue) || [],
      page: pageNo,
      rect: {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
      },
    });
  }
  return out;
}

/**
 * Détecte les zones à remplir d'un PDF sans champs : rectangles vides,
 * traits de signature et cases à cocher dessinés dans le contenu.
 * (Heuristique sur la géométrie du texte détecté par le lecteur PDF.)
 * @param {Array<{id:string,text:string,bbox:{x:number,y:number,w:number,h:number}}>} lines
 */
export function detectFillAreas(lines = []) {
  const areas = [];
  const underlineRe = /[_.]{4,}|_{3,}/;
  lines.forEach((line, index) => {
    const text = (line.text || '').trim();
    if (!text) return;
    if (underlineRe.test(text)) {
      areas.push({
        id: `area-${index}`,
        kind: 'field',
        page: null,
        bbox: { ...line.bbox },
        label: text.replace(/[_.]+/g, '').trim() || `Champ ${index + 1}`,
      });
    } else if (/(signature|signé|signature\s*:)/i.test(text)) {
      areas.push({
        id: `area-${index}`,
        kind: 'signature',
        bbox: { ...line.bbox },
        label: text,
      });
    } else if (/\[?\s*\]/.test(text)) {
      areas.push({
        id: `area-${index}`,
        kind: 'checkbox',
        bbox: { ...line.bbox },
        label: text.replace(/\[?\s*\]/g, '').trim() || `Case ${index + 1}`,
      });
    }
  });
  return areas;
}
