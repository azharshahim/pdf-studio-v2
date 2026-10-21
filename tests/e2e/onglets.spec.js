import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function pdf(texts) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of texts) doc.addPage([400, 200]).drawText(t, { x: 30, y: 120, size: 14, font });
  return Buffer.from(await doc.save());
}

test.describe('Onglets et combinaison', () => {
  test('plusieurs PDF = un onglet chacun ; combiner dans l’ordre voulu', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        localStorage.setItem('pdf-studio-onboarded', '1');
        localStorage.setItem('pdf-studio-lang', 'fr');
      } catch {
        /* stockage indisponible */
      }
    });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles([
      { name: 'un.pdf', mimeType: 'application/pdf', buffer: await pdf(['Page A']) },
      { name: 'deux.pdf', mimeType: 'application/pdf', buffer: await pdf(['Page B1', 'Page B2']) },
    ]);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.fileName), { timeout: 30_000 }).toBe('deux.pdf');
    await expect(page.locator('.doc-tab')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator('.doc-tab.active')).toContainText('deux');

    // Changer d'onglet.
    await page.locator('.doc-tab-label', { hasText: 'un' }).first().tap();
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.fileName), { timeout: 30_000 }).toBe('un.pdf');
    await expect(page.locator('.doc-tab.active')).toContainText('un');

    // Combiner : le document courant + un fichier déjà ouvert dans un onglet.
    await page.locator('[data-tab-combine]').tap();
    await expect(page.locator('.combine-card')).toHaveCount(1, { timeout: 15_000 });
    await page.locator('#combineFromTabs').tap();
    await page.locator('.combine-tab-row input').first().check();
    await page.locator('#combineTabsOk').tap();
    await expect(page.locator('.combine-card')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator('.combine-card').first()).toContainText('un');
    // Mettre deux.pdf en premier.
    await page.locator('.combine-card').nth(1).locator('[data-cmove="-1"]').tap();
    await expect(page.locator('.combine-card').first()).toContainText('deux');
    await expect(page.locator('#combineName')).toHaveValue('Classeur1.pdf');
    await page.locator('#combineGo').tap();

    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.fileName), { timeout: 30_000 }).toBe('Classeur1.pdf');
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.numPages)).toBe(3);
    const order = await page.evaluate(async () => {
      const doc = window.__pdfStudio.state.engine.doc;
      const out = [];
      for (let n = 1; n <= doc.numPages; n++) out.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(' '));
      return out;
    });
    expect(order).toEqual(['Page B1', 'Page B2', 'Page A']);
    await expect(page.locator('.doc-tab')).toHaveCount(3);

    // La grille des pages s'ouvre pour ranger les pages.
    await expect(page.locator('#sheet')).toBeVisible();
    await page.locator('#sheetClose').tap();
    await expect(page.locator('#sheet')).toBeHidden();

    // Fermer un onglet.
    await page.locator('.doc-tab.active .doc-tab-close').tap();
    await expect(page.locator('.doc-tab')).toHaveCount(2);
  });
});
