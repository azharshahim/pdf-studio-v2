import { expect, test } from '@playwright/test';
import fs from 'node:fs';

// Ordinateur : toucher une ligne ne change ni le zoom ni la mise en page
// (panneaux, barre du haut, position de la page).
test('grand écran : la mise en page reste figée quand on modifie une ligne', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'grand écran uniquement');
  test.setTimeout(180_000);
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
  await page.locator('#docDock [data-dock=edit]').click();
  await expect(page.locator('.line-block.ocr').first()).toBeAttached({ timeout: 150_000 });
  await page.waitForTimeout(500);
  const rect = () => page.locator('#pdfCanvas').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width)];
  });
  const before = await rect();
  await page.locator('.line-block.ocr').nth(3).click();
  await page.locator('.inline-shell').waitFor({ state: 'visible' });
  await page.waitForTimeout(600);
  expect(await rect()).toEqual(before);
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.thumbrail')).toBeVisible();
});
