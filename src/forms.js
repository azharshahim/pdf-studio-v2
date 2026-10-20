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
