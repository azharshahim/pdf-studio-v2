import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Un bloc modifié garde le style d'origine de chaque mot : un premier mot gras
 * ne rend pas toute la ligne grasse, et chaque mot garde sa couleur.
 */

const init = (page) =>
  page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* ignore */
    }
  });

async function colorLinePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const label = 'Montant dû : ';
  page.drawText(label, { x: 60, y: 720, size: 14, font, color: rgb(0, 0, 0) });
  page.drawText('2147,48 €', { x: 60 + font.widthOfTextAtSize(label, 14), y: 720, size: 14, font, color: rgb(0.8, 0, 0) });
  return Buffer.from(await doc.save());
}

const runsOf = (page) =>
  page.evaluate(() => {
    const e = window.__pdfStudio.state.edits[0] || window.__pdfStudio.state.active?.edit;
    return { text: e?.text, bold: e?.bold, color: e?.color, runs: e?.runs || null };
  });

test.describe('Styles d’origine conservés à la modification', () => {
  test('chaque mot garde sa couleur (PDF texte)', async ({ page }) => {
    await init(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({ name: 'couleurs.pdf', mimeType: 'application/pdf', buffer: await colorLinePdf() });
    await expect(page.locator('#docDock [data-dock="edit"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('#docDock [data-dock="edit"]').click();
    const block = page.locator('#overlay .line-block').first();
    await expect(block).toBeVisible({ timeout: 15_000 });
    await block.click();
    const editor = page.locator('.inline-shell .inline-text');
    await expect(editor).toBeVisible();

    let snap = await runsOf(page);
    expect(snap.runs).not.toBeNull();
    const red = snap.runs.find((r) => r.text.includes('2147'));
    const black = snap.runs.find((r) => r.text.includes('Montant'));
    expect(red).toBeTruthy();
    expect(black).toBeTruthy();
    const hex = (c) => parseInt(c.slice(1, 3), 16);
    expect(hex(red.color)).toBeGreaterThan(150); // rouge
    expect(hex(black.color)).toBeLessThan(80); // noir

    // L'éditeur affiche déjà le montant en rouge.
    const editorColors = await editor.evaluate((el) => [...el.querySelectorAll('span.run')].map((s) => [s.textContent, getComputedStyle(s).color]));
    expect(editorColors.some(([t, c]) => t.includes('2147') && /rgb\((1[5-9]\d|2\d\d),/.test(c))).toBe(true);

    // Modification du montant : il reste rouge, le libellé reste noir.
    await editor.click();
    await page.keyboard.press('End');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type('90 €');
    await page.locator('#stage').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('.inline-shell')).toHaveCount(0);

    snap = await runsOf(page);
    expect(snap.text).toBe('Montant dû : 2147,90 €');
    const red2 = snap.runs.find((r) => r.text.includes('2147,90'));
    expect(red2 && hex(red2.color)).toBeGreaterThan(150);
    expect(hex(snap.runs.find((r) => r.text.includes('Montant')).color)).toBeLessThan(80);

    const shown = await page.evaluate(() =>
      [...document.querySelectorAll('#overlay .edit-block .edit-text span.run')].map((s) => [s.textContent, getComputedStyle(s).color]),
    );
    expect(shown.some(([t, c]) => t.includes('2147,90') && /rgb\((1[5-9]\d|2\d\d),/.test(c))).toBe(true);
    expect(shown.some(([t, c]) => t.includes('Montant') && /rgb\(\d{1,2}, \d{1,2}, \d{1,2}\)/.test(c))).toBe(true);
  });

  test('scan OCR : un premier mot gras ne met pas toute la ligne en gras', async ({ page }) => {
    await init(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#homeDemoScan')).toBeVisible();
    await page.evaluate(() => document.querySelector('#homeDemoScan').click());
    await page.locator('#pdfCanvas').first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(700);
    await page.evaluate(() =>
      window.__pdfStudio.setOcrLines(1, [
        {
          text: 'Salaire de base 1 850,00',
          bbox: { x: 48, y: 300, w: 300, h: 16 },
          fontSize: 12,
          bold: false,
          words: [
            { text: 'Salaire', bbox: { x: 48, y: 300, w: 60, h: 16 }, bold: true },
            { text: 'de', bbox: { x: 112, y: 300, w: 18, h: 16 }, bold: false },
            { text: 'base', bbox: { x: 134, y: 300, w: 38, h: 16 }, bold: false },
            { text: '1', bbox: { x: 270, y: 300, w: 8, h: 16 }, bold: false },
            { text: '850,00', bbox: { x: 282, y: 300, w: 66, h: 16 }, bold: false },
          ],
        },
      ]),
    );
    const block = page.locator('.line-block.ocr').first();
    await expect(block).toHaveCount(1);
    const resume = page.locator('#resumeDialog');
    if (await resume.isVisible().catch(() => false)) await page.locator('#resumeYes').click();
    await block.scrollIntoViewIfNeeded();
    await block.tap();
    await page.waitForTimeout(500);

    let snap = await runsOf(page);
    expect(snap.bold).toBe(false);
    expect(snap.runs).not.toBeNull();
    expect(snap.runs[0]).toMatchObject({ text: 'Salaire ', bold: true });
    expect(snap.runs.slice(1).every((r) => r.bold === false)).toBe(true);

    await page.evaluate(() => {
      const el = document.querySelector('.inline-text, .inline-textarea');
      el.focus();
      if (el.tagName === 'TEXTAREA') el.value = 'Salaire de base 1 900,00';
      else el.textContent = 'Salaire de base 1 900,00';
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await page.evaluate(() => document.querySelector('#editDone').click());
    await page.waitForTimeout(500);
    snap = await runsOf(page);
    expect(snap.text).toBe('Salaire de base 1 900,00');
    expect(snap.runs[0]).toMatchObject({ text: 'Salaire ', bold: true });
    expect(snap.runs.slice(1).every((r) => r.bold === false)).toBe(true);
    const weights = await page.evaluate(() =>
      [...document.querySelectorAll('.edit-block .edit-text span.run')].map((s) => [s.textContent, getComputedStyle(s).fontWeight]),
    );
    expect(weights[0]).toEqual(['Salaire ', '700']);
    expect(weights.slice(1).every(([, w]) => w === '400')).toBe(true);
  });

  test('gras sur une sélection seulement', async ({ page }) => {
    await init(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([595, 842]).drawText('Référence client 4521', { x: 60, y: 720, size: 14, font });
    await page.locator('#fileInput').setInputFiles({ name: 'selection.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
    await expect(page.locator('#docDock [data-dock="edit"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('#docDock [data-dock="edit"]').click();
    await page.locator('#overlay .line-block').first().click();
    const editor = page.locator('.inline-shell .inline-text');
    await expect(editor).toBeVisible();
    await page.waitForTimeout(700); // le curseur initial est placé
    // Sélectionne « 4521 » puis Gras dans le panneau Modifier.
    await editor.evaluate((el) => {
      const node = el.firstChild;
      const r = document.createRange();
      const i = node.data.indexOf('4521');
      r.setStart(node, i);
      r.setEnd(node, i + 4);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    });
    const boldBtn = page.locator('#editPanel [data-ep-fmt="bold"], #editPanel [data-fmt="bold"], [data-fmt="bold"]').first();
    await boldBtn.click();
    const snap = await runsOf(page);
    expect(snap.bold).toBe(false);
    expect(snap.runs).toEqual([
      expect.objectContaining({ text: 'Référence client ', bold: false }),
      expect.objectContaining({ text: '4521', bold: true }),
    ]);
  });
});
