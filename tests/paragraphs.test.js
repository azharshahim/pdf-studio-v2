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

  it('détecte et conserve l’alignement d’origine (gauche, centré, droite, justifié)', () => {
    // 1. Aligné à gauche (drapeau droit irrégulier)
    const leftUnits = groupLinesIntoParagraphs([
      makeLine({ id: 'l1', text: 'Le présent avenant précise les modalités pratiques convenues', x: 60, y: 700, w: 342 }),
      makeLine({ id: 'l2', text: 'entre les parties signataires du contrat principal de service', x: 60, y: 686, w: 368 }),
      makeLine({ id: 'l3', text: 'pour toute la durée de la période.', x: 60, y: 672, w: 195 }),
    ]);
    expect(leftUnits).toHaveLength(1);
    expect(leftUnits[0].align).toBe('left');

    // 2. Justifié (même bord gauche ET même bord droit sur toutes les lignes hors dernière)
    const justUnits = groupLinesIntoParagraphs([
      makeLine({ id: 'j1', text: 'Le présent avenant précise les modalités pratiques convenues', x: 60, y: 620, w: 380 }),
      makeLine({ id: 'j2', text: 'entre les parties signataires du contrat principal de service', x: 60, y: 606, w: 380 }),
      makeLine({ id: 'j3', text: 'pour toute la durée de la période.', x: 60, y: 592, w: 195 }),
    ]);
    expect(justUnits).toHaveLength(1);
    expect(justUnits[0].align).toBe('justify');

    // 3. Centré (même axe central x + w/2 = 297.5)
    const centerUnits = groupLinesIntoParagraphs([
      makeLine({ id: 'c1', text: 'Nous vous remercions chaleureusement de votre confiance renouvelée', x: 107.5, y: 540, w: 380 }),
      makeLine({ id: 'c2', text: 'tout au long de cette collaboration annuelle fructueuse', x: 127.5, y: 526, w: 340 }),
      makeLine({ id: 'c3', text: 'et restons à votre entière disposition.', x: 187.5, y: 512, w: 220 }),
    ]);
    expect(centerUnits).toHaveLength(1);
    expect(centerUnits[0].align).toBe('center');

    // 4. Aligné à droite (même bord droit x + w = 520)
    const rightUnits = groupLinesIntoParagraphs([
      makeLine({ id: 'r1', text: 'Document établi pour faire valoir ce que de droit auprès', x: 160, y: 460, w: 360 }),
      makeLine({ id: 'r2', text: 'des organismes compétents conformément aux dispositions', x: 140, y: 446, w: 380 }),
      makeLine({ id: 'r3', text: 'légales actuellement en vigueur.', x: 310, y: 432, w: 210 }),
    ]);
    expect(rightUnits).toHaveLength(1);
    expect(rightUnits[0].align).toBe('right');
  });

  it('exporte un paragraphe justifié avec bords gauche et droit alignés sauf sur la dernière ligne', async () => {
    const src = await PDFDocument.create();
    src.addPage([595, 842]);
    const srcBytes = await src.save();

    const wrappedLines = [
      'Le contrat de prestation prend effet immédiatement',
      'entre les parties signataires pour une durée ferme',
      'de douze mois renouvelable.',
    ];

    const boxX = 60;
    const boxW = 380; // bord droit attendu = 440

    const { bytes: outBytes } = await exportPdf({
      sourceBytes: srcBytes,
      edits: [
        {
          id: 'edit-just-1',
          page: 1,
          kind: 'add',
          paragraph: true,
          wrap: true,
          fit: false,
          bbox: { x: boxX, y: 660, w: boxW, h: 46 },
          baseline: 694,
          text: wrappedLines.join(' '),
          wrappedLines,
          wrappedLineEnds: [false, false, true],
          align: 'justify',
          font: 'Helvetica',
          size: 11,
          lineHeight: 1.3,
          color: '#111827',
        },
      ],
    });

    const doc = await pdfjsLib.getDocument({ data: outBytes, isEvalSupported: false }).promise;
    const p1 = await doc.getPage(1);
    const tc = await p1.getTextContent();
    const visible = tc.items.filter((it) => it.str.trim().length > 0);

    // Regroupe les items par ordonnée Y de ligne (du haut vers le bas).
    const byRow = new Map();
    for (const it of visible) {
      const yKey = Math.round(it.transform[5]);
      if (!byRow.has(yKey)) byRow.set(yKey, []);
      byRow.get(yKey).push(it);
    }
    const rows = [...byRow.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, arr]) => {
        arr.sort((a, b) => a.transform[4] - b.transform[4]);
        const left = arr[0].transform[4];
        const last = arr[arr.length - 1];
        const right = last.transform[4] + last.width;
        return { text: arr.map((x) => x.str).join(' '), left, right };
      });

    expect(rows).toHaveLength(3);
    // Lignes 1 et 2 (non finales) : justifiées de boxX (60) à boxX + boxW (440).
    expect(Math.abs(rows[0].left - boxX)).toBeLessThan(1.2);
    expect(Math.abs(rows[0].right - (boxX + boxW))).toBeLessThan(1.8);
    expect(Math.abs(rows[1].left - boxX)).toBeLessThan(1.2);
    expect(Math.abs(rows[1].right - (boxX + boxW))).toBeLessThan(1.8);
    // Ligne 3 (dernière ligne) : alignée à gauche à boxX (60), non étirée jusqu'au bord droit.
    expect(Math.abs(rows[2].left - boxX)).toBeLessThan(1.2);
    expect(rows[2].right).toBeLessThan(boxX + boxW - 100);
    await doc.destroy();
  });

  it('reconnaît un paragraphe justifié de 2 lignes grâce à la marge droite de la page', () => {
    // Autre paragraphe justifié de la page : ses lignes pleines finissent à x = 450.
    const other = [
      makeLine({ id: 'o1', text: 'Les parties conviennent des modalités suivantes pour', x: 50, y: 700, w: 400 }),
      makeLine({ id: 'o2', text: 'la bonne exécution du présent contrat de prestation', x: 50, y: 686, w: 400 }),
      makeLine({ id: 'o3', text: 'de services.', x: 50, y: 672, w: 70 }),
    ];
    // Paragraphe de 2 lignes : la 1re ligne (étirée) finit aussi à 450, la 2e est courte.
    const two = [
      makeLine({ id: 't1', text: 'Le paiement intervient sous trente jours', x: 50, y: 640, w: 400 }),
      makeLine({ id: 't2', text: 'à réception de la facture.', x: 50, y: 626, w: 150 }),
    ];
    const units = groupLinesIntoParagraphs([...other, ...two]);
    const u = units.find((x) => x.lineIds.includes('t1'));
    expect(u.isParagraph).toBe(true);
    expect(u.align).toBe('justify');

    // Même paragraphe seul sur la page, sans marge de référence : prudence, à gauche.
    const alone = groupLinesIntoParagraphs(two).find((x) => x.lineIds.includes('t1'));
    expect(alone.align).toBe('left');

    // Une 1re ligne qui s'arrête avant la marge commune reste alignée à gauche.
    const ragged = [
      makeLine({ id: 'r1', text: 'Le paiement intervient sous trente jours', x: 50, y: 640, w: 330 }),
      makeLine({ id: 'r2', text: 'à réception de la facture.', x: 50, y: 626, w: 150 }),
    ];
    const r = groupLinesIntoParagraphs([...other, ...ragged]).find((x) => x.lineIds.includes('r1'));
    expect(r.align).toBe('left');
  });

  it('détecte le retrait de première ligne et le reproduit à l’export', async () => {
    const lines = [
      makeLine({ id: 'i1', text: 'Conformément aux conditions générales de vente', x: 74, y: 700, w: 340 }),
      makeLine({ id: 'i2', text: 'acceptées par le client, la présente facture est', x: 50, y: 686, w: 364 }),
      makeLine({ id: 'i3', text: 'payable à trente jours.', x: 50, y: 672, w: 140 }),
    ];
    const u = groupLinesIntoParagraphs(lines).find((x) => x.lineIds.includes('i1'));
    expect(u.isParagraph).toBe(true);
    expect(u.firstIndent).toBeGreaterThan(20);
    expect(u.firstIndent).toBeLessThan(28);
    expect(u.bbox.x).toBe(50);

    const src = await PDFDocument.create();
    src.addPage([595, 842]);
    const { bytes } = await exportPdf({
      sourceBytes: await src.save(),
      edits: [
        {
          id: 'edit-indent',
          page: 1,
          kind: 'add',
          paragraph: true,
          wrap: true,
          fit: false,
          bbox: { x: 50, y: 660, w: 364, h: 46 },
          baseline: 700,
          indent: 24,
          text: 'Première ligne en retrait suite du texte',
          wrappedLines: ['Première ligne en retrait', 'suite du texte'],
          wrappedLineEnds: [false, true],
          align: 'left',
          font: 'Helvetica',
          size: 11,
          lineHeight: 1.3,
          color: '#111827',
        },
      ],
    });
    const doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const tc = await (await doc.getPage(1)).getTextContent();
    const items = tc.items.filter((it) => it.str.trim());
    const first = items.find((it) => it.str.startsWith('Première'));
    const second = items.find((it) => it.str.startsWith('suite'));
    expect(Math.abs(first.transform[4] - (50 + 24 + 0.5))).toBeLessThan(1);
    expect(Math.abs(second.transform[4] - (50 + 0.5))).toBeLessThan(1);
    await doc.destroy();
  });
});
