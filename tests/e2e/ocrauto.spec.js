import { expect, test } from '@playwright/test';
import fs from 'node:fs';

// « Modifier » rend tout le fichier modifiable : un scan sans texte est
// reconnu automatiquement, sans passer d'abord par l'onglet OCR.
test('Modifier lance l’OCR des pages scannées et garde la police à l’édition', async ({ page, browserName }) => {
  // Tesseract WASM sans JIT SIMD est nettement plus lent sous WebKit Linux en CI.
  test.slow(browserName === 'webkit', 'OCR WebAssembly plus lent sous WebKit en environnement CI');
  test.setTimeout(browserName === 'webkit' ? 360_000 : 180_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await page.locator('#fileInput').setInputFiles({
    name: 'scan-fiche.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync('tests/fixtures/scan-fiche.pdf'),
  });
  await page.locator('#docDock [data-dock=edit]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(800);
  const reading = await page.locator('#pdfCanvas').evaluate((c) => c.style.width);
  await page.locator('#docDock [data-dock=edit]').tap();
  const ocrWaitTimeout = browserName === 'webkit' ? 300_000 : 150_000;
  await expect(page.locator('.line-block.ocr').first()).toBeAttached({ timeout: ocrWaitTimeout });
  expect(await page.locator('.line-block.ocr').count()).toBeGreaterThan(3);
  const before = reading;
  await page.waitForTimeout(500);
  await page.locator('.line-block.ocr').nth(3).tap();
  await page.locator('.inline-shell').waitFor({ state: 'visible' });
  // pas d'agrandissement à l'édition
  expect(await page.locator('#pdfCanvas').evaluate((c) => c.style.width)).toBe(before);
  const fam = await page.locator('.inline-shell').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fam.toLowerCase()).toMatch(/arimo|arial|helvetica/); // police source Helvetica : la comparaison des formes retrouve son équivalent
});
