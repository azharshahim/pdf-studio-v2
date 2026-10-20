import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fillFormFields, readFormFields } from '../src/forms.js';

async function makeForm() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Formulaire', { x: 30, y: 460, size: 16, font });
  const form = doc.getForm();

  const nom = form.createTextField('nom');
  nom.setText('Ancien nom');
  nom.addToPage(page, { x: 30, y: 400, width: 220, height: 22 });

  const abonne = form.createCheckBox('abonne');
  abonne.addToPage(page, { x: 30, y: 360, width: 16, height: 16 });

  const pays = form.createDropdown('pays');
  pays.addOptions(['France', 'Belgique', 'Suisse']);
  pays.select('France');
  pays.addToPage(page, { x: 30, y: 320, width: 160, height: 22 });

  return doc.save();
}

describe('formulaires AcroForm', () => {
  it('lit les champs et leurs valeurs', async () => {
    const fields = await readFormFields(await makeForm());
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.nom).toMatchObject({ type: 'text', value: 'Ancien nom' });
    expect(byName.abonne.type).toBe('checkbox');
    expect(byName.abonne.value).toBe('');
    expect(byName.pays.type).toBe('select');
    expect(byName.pays.options).toEqual(['France', 'Belgique', 'Suisse']);
    expect(byName.pays.value).toBe('France');
  });

  it('remplit les champs puis relit les valeurs', async () => {
    const src = await makeForm();
    const out = await fillFormFields(src, {
      nom: 'Camille Martin',
      abonne: 'true',
      pays: 'Suisse',
    });
    const fields = await readFormFields(out);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.nom.value).toBe('Camille Martin');
    expect(byName.abonne.value).toBe('true');
    expect(byName.pays.value).toBe('Suisse');
  });

  it('aplatit les champs à la demande', async () => {
    const src = await makeForm();
    const out = await fillFormFields(src, { nom: 'Aplat' }, { flatten: true });
    const doc = await PDFDocument.load(out, { ignoreEncryption: true });
    expect(doc.getForm().getFields()).toHaveLength(0);
  });
});
