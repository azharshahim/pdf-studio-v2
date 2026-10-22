import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  canMergeIntoParagraph,
  groupLinesIntoParagraphs,
  wrapTextToWidth,
} from '../src/paragraphs.js';
import { exportPdf } from '../src/exporter.js';

function makeLine({
  id,
  text,
  x = 50,
  y,
  w = 360,
  h = 12,
  font = 'Helvetica',
  fontSize = 11,
  bold = false,
  italic = false,
  source = 'pdf',
}) {
  return {
    id,
    text,
    bbox: { x, y, w, h },
    baseline: y + h * 0.2,
    font,
    fontSize,
    bold,
    italic,
    source,
  };
}

describe('détection et reflux de paragraphes', () => {
  it('regroupe les lignes proches de même police et même marge gauche en un seul paragraphe (PDF texte)', () => {
    const lines = [
      makeLine({ id: 'h1', text: 'Article 1 — Objet du contrat', x: 50, y: 740, w: 220, h: 16, fontSize: 15, bold: true }),
      makeLine({ id: 'p1', text: 'Le présent contrat définit les obligations réciproques des parties', x: 50, y: 710, w: 380 }),
      makeLine({ id: 'p2', text: 'pour toute la durée de la prestation convenue entre le client et', x: 50, y: 695, w: 374 }),
      makeLine({ id: 'p3', text: 'le prestataire désigné ci-dessus.', x: 50, y: 680, w: 190 }),
      makeLine({ id: 'q1', text: 'Un second paragraphe commence après un interligne plus grand.', x: 50, y: 648, w: 365 }),
    ];

    const units = groupLinesIntoParagraphs(lines);
    expect(units).toHaveLength(3);
    expect(units[0].isParagraph).toBe(false);
    expect(units[0].id).toBe('h1');

    expect(units[1].isParagraph).toBe(true);
    expect(units[1].lineIds).toEqual(['p1', 'p2', 'p3']);
    expect(units[1].origBboxes).toHaveLength(3);
    expect(units[1].text).toBe(
      'Le présent contrat définit les obligations réciproques des parties pour toute la durée de la prestation convenue entre le client et le prestataire désigné ci-dessus.'
    );
    expect(units[1].bbox.x).toBe(50);
    expect(units[1].bbox.w).toBe(380);
    expect(units[1].bbox.y).toBe(680);
    expect(units[1].bbox.h).toBe(710 + 12 - 680);

    expect(units[2].isParagraph).toBe(false);
    expect(units[2].id).toBe('q1');
  });

  it('détecte les paragraphes sur une page OCRisée tout en gardant séparées les lignes de formulaire/tableau', () => {
    const ocrLines = [
      makeLine({ id: 'o1', text: 'N° client : 482910', x: 48, y: 700, w: 115, h: 13, fontSize: 12, source: 'ocr' }),
      makeLine({ id: 'o2', text: 'Montant TTC : 240,00 €', x: 48, y: 683, w: 138, h: 13, fontSize: 12, source: 'ocr' }),
      makeLine({
        id: 'o3',
        text: 'Nous vous confirmons la bonne réception de votre règlement par virement',
        x: 48,
        y: 640,
        w: 410,
        h: 13,
        fontSize: 11.5,
        source: 'ocr',
      }),
      makeLine({
        id: 'o4',
        text: 'bancaire enregistré sur votre compte client ce jour.',
        x: 50,
        y: 623,
        w: 295,
        h: 12.5,
        fontSize: 11,
        source: 'ocr',
      }),
    ];

    const units = groupLinesIntoParagraphs(ocrLines);
    expect(units).toHaveLength(3);
    expect(units[0].lineIds).toEqual(['o1']);
    expect(units[1].lineIds).toEqual(['o2']);
    expect(units[2].isParagraph).toBe(true);
    expect(units[2].lineIds).toEqual(['o3', 'o4']);
    expect(units[2].source).toBe('ocr');
  });

  it('ne fusionne pas les éléments d’une liste à puces ou numérotée', () => {
    const a = makeLine({ id: 'l1', text: 'Première phrase suffisamment longue pour dépasser le seuil minimal', x: 50, y: 500, w: 360 });
    const bullet = makeLine({ id: 'l2', text: '- Élément de liste à puce qui doit rester indépendant', x: 50, y: 485, w: 340 });
    expect(canMergeIntoParagraph([a], bullet)).toBe(false);
  });

  it('redistribue automatiquement les mots dans la largeur du bloc (wrapTextToWidth)', () => {
    // 6 px par caractère pour un test déterministe
    const measure = (s) => [...s].length * 6;
    const text = 'Ceci est un paragraphe modifié avec une phrase supplémentaire qui passe à la ligne.';
    const wrapped = wrapTextToWidth(text, 180, measure); // max 30 caractères par ligne
    expect(wrapped.length).toBeGreaterThanOrEqual(3);
    for (const ln of wrapped) {
      expect([...ln].length).toBeLessThanOrEqual(30);
    }
    expect(wrapped.join(' ')).toBe(text);
  });

  it('exporte un paragraphe modifié en effaçant toutes les lignes d’origine et en respectant les retours à la ligne', async () => {
    const src = await PDFDocument.create();
    const helv = await src.embedFont(StandardFonts.Helvetica);
    const page = src.addPage([595, 842]);
    page.drawText('Titre conservé intact', { x: 50, y: 770, size: 14, font: helv, color: rgb(0, 0, 0) });
    page.drawText('Premiere ligne ancienne qui doit disparaitre totalement', { x: 50, y: 730, size: 11, font: helv });
    page.drawText('Deuxieme ligne ancienne egalement remplacee par le reflux', { x: 50, y: 715, size: 11, font: helv });
    page.drawText('Troisieme ligne ancienne fin.', { x: 50, y: 700, size: 11, font: helv });
    page.drawText('Pied de page conservé intact', { x: 50, y: 650, size: 11, font: helv });
    const srcBytes = await src.save();

    const wrappedLines = [
      'Nouveau paragraphe réécrit avec une phrase',
      'beaucoup plus longue qui reflue proprement',
      'sur quatre lignes distinctes dans le document',
      'exporté final.',
    ];

    const { bytes: outBytes } = await exportPdf({
      sourceBytes: srcBytes,
      edits: [
        {
          id: 'edit-para-1',
          page: 1,
          kind: 'edit',
          paragraph: true,
          wrap: true,
          fit: false,
          lineId: 'p1',
          lineIds: ['p1', 'p2', 'p3'],
          source: 'pdf',
          bbox: { x: 50, y: 700, w: 320, h: 41 },
          origBbox: { x: 50, y: 700, w: 320, h: 41 },
          origBboxes: [
            { x: 49, y: 728, w: 330, h: 13 },
            { x: 49, y: 713, w: 330, h: 13 },
            { x: 49, y: 698, w: 180, h: 13 },
          ],
          baseline: 730,
          text: wrappedLines.join(' '),
          wrappedLines,
          font: 'Helvetica',
          size: 11,
          lineHeight: 1.25,
          color: '#111827',
          bg: '#ffffff',
        },
      ],
    });

    const doc = await pdfjsLib.getDocument({ data: outBytes, isEvalSupported: false }).promise;
    const p1 = await doc.getPage(1);
    const tc = await p1.getTextContent();
    const strings = tc.items.map((it) => it.str).filter((s) => s.trim().length > 0);
    const full = strings.join(' ');

    expect(full).toContain('Titre conservé intact');
    expect(full).toContain('Pied de page conservé intact');
    expect(full).not.toContain('ancienne');
    expect(full).not.toContain('disparaitre');
    for (const expectedLine of wrappedLines) {
      expect(strings).toContain(expectedLine);
    }
    await doc.destroy();
  });
});
