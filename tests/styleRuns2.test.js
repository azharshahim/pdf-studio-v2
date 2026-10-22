import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { syncRuns, updateRunsForText, styledLinesFor, runsFromTokens, hasMixedRuns } from '../src/styleRuns.js';
import { exportPdf } from '../src/exporter.js';

const B = (text, color = '#000000') => ({ text, bold: true, italic: false, color });
const R = (text, color = '#000000') => ({ text, bold: false, italic: false, color });

describe('styles par caractère d’un bloc modifié', () => {
  it('un premier mot gras reste le seul en gras après modification', () => {
    const e = { text: 'Salaire de base 1 850,00', bold: false, color: '#000000', runs: [B('Salaire '), R('de base 1 850,00')] };
    e.text = 'Salaire de base 1 900,00';
    const runs = syncRuns(e);
    expect(runs).toEqual([B('Salaire '), R('de base 1 900,00')]);
  });

  it('chaque caractère garde sa couleur ; le texte saisi prend le style voisin', () => {
    const runs = [R('Montant dû : '), R('2147,48 €', '#c00000')];
    // Saisie au milieu du montant : rouge. Nouveau mot après le libellé : style du mot suivant.
    expect(updateRunsForText(runs, 'Montant dû : 2150,48 €')).toEqual([R('Montant dû : '), R('2150,48 €', '#c00000')]);
    expect(updateRunsForText(runs, 'Montant dû : env. 2147,48 €')).toEqual([R('Montant dû : '), R('env. 2147,48 €', '#c00000')]);
    // Ajout en fin de libellé (avant l'espace) : style du libellé.
    expect(updateRunsForText(runs, 'Montant total dû : 2147,48 €')).toEqual([R('Montant total dû : '), R('2147,48 €', '#c00000')]);
  });

  it('supprimer le seul mot d’un autre style rend le bloc uniforme', () => {
    const e = { text: 'Total 12', runs: [B('Total '), R('12')], bold: false, color: '#000000' };
    e.text = 'Total ';
    syncRuns(e);
    expect(e.runs).toBeUndefined();
    expect(e.bold).toBe(true);
  });

  it('les lignes du reflux (césure comprise) retrouvent le style de chaque caractère', () => {
    const e = { text: 'Net à payer administrativement', runs: [B('Net à payer '), R('administrativement', '#1f4e9c')] };
    const lines = styledLinesFor(e, ['Net à payer adminis-', 'trativement']);
    expect(lines[0]).toEqual([B('Net à payer '), R('adminis-', '#1f4e9c')]);
    expect(lines[1]).toEqual([R('trativement', '#1f4e9c')]);
  });

  it('style majoritaire du bloc = style de base', () => {
    const text = 'N° SS 1905080891 52';
    const { runs, major } = runsFromTokens(
      text,
      [
        { start: 0, end: 2, bold: true },
        { start: 3, end: 5, bold: true },
        { start: 6, end: 16, bold: false },
        { start: 17, end: 19, bold: false },
      ],
      { bold: false, italic: false, color: '#111111' },
    );
    expect(major.bold).toBe(false);
    expect(runs[0]).toMatchObject({ text: 'N° SS ', bold: true });
    expect(hasMixedRuns({ runs })).toBe(true);
  });

  it('l’export garde gras et couleurs mot par mot', async () => {
    const src = await PDFDocument.create();
    src.addPage([595, 842]);
    const { bytes } = await exportPdf({
      sourceBytes: await src.save(),
      edits: [
        {
          id: 'mix',
          page: 1,
          kind: 'add',
          bbox: { x: 50, y: 700, w: 300, h: 14 },
          baseline: 703,
          text: 'Net à payer 2147,48 €',
          runs: [B('Net à payer ', '#000000'), R('2147,48 €', '#cc0000')],
          font: 'Helvetica',
          size: 11,
          color: '#000000',
          fit: false,
        },
      ],
    });
    const doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    const items = tc.items.filter((i) => i.str.trim());
    const label = items.find((i) => i.str.includes('Net'));
    const amount = items.find((i) => i.str.includes('2147'));
    expect(label).toBeTruthy();
    expect(amount).toBeTruthy();
    // Polices différentes (Helvetica-Bold / Helvetica) et couleurs différentes.
    const ops = await page.getOperatorList();
    const fills = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === pdfjsLib.OPS.setFillRGBColor) fills.push(String(ops.argsArray[i]));
    }
    expect(fills.some((f) => /#cc0000|204,0,0/i.test(f))).toBe(true);
    expect(fills.some((f) => /#000000|^0,0,0$/i.test(f))).toBe(true);
    expect(label.fontName).not.toBe(amount.fontName);
    await doc.destroy();
  });
});
