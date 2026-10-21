import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, setTextRenderingMode } from 'pdf-lib';

// Scan simulé : un aplat gris (l'« image ») + texte invisible en Courier par-dessus.
async function scanPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const f = await doc.embedFont(StandardFonts.Courier);
  page.drawRectangle({ x: 20, y: 100, width: 360, height: 40, color: rgb(0.95, 0.95, 0.9) });
  page.pushOperators(pushGraphicsState(), setTextRenderingMode(3));
  page.drawText('les caracteristiques de votre compte', { x: 30, y: 120, size: 12, font: f });
  page.pushOperators(popGraphicsState());
  return Buffer.from(await doc.save());
}

test('couche de texte cachée (Courier) : l’édition propose une police sans empattement', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#fileInput').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: await scanPdf() });
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.locator('.line-block').first().tap();
  await page.locator('.inline-shell').waitFor({ state: 'visible' });
  const fam = await page.locator('.inline-shell').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fam.toLowerCase()).not.toMatch(/courier|mono/);
  expect(fam.toLowerCase()).toMatch(/helvetica|arial|sans/);
});
