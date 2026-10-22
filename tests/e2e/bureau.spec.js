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

  // Panneau « Modifier » façon Acrobat : à droite, lié au bloc actif.
  await expect(page.locator('#editPanel')).toBeVisible();
  await expect(page.locator('#epFields')).toBeEnabled();
  await page.locator('#epSize').fill('14');
  await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.active?.edit?.size)).toBe(14);
  const wasBold = await page.evaluate(() => !!window.__pdfStudio.state.active?.edit?.bold);
  await page.locator('#editPanel [data-ep-fmt=bold]').click();
  await expect.poll(() => page.evaluate(() => !!window.__pdfStudio.state.active?.edit?.bold)).toBe(!wasBold);
  await page.locator('#epCharSpacing').fill('0.5');
  await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.active?.edit?.charSpacing)).toBe(0.5);
  expect(await rect()).toEqual(before);

  // Poignées façon Acrobat : coins = redimensionner, bords = déplacer.
  const ed = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__pdfStudio.state.active.edit)));
  const e0 = await ed();
  const corner = await page.locator('.inline-corner.c-br').boundingBox();
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 60, corner.y + corner.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  const e1 = await ed();
  expect(e1.wrap).toBe(true);
  expect(e1.bbox.w).toBeGreaterThan(e0.bbox.w + 10);
  expect(e1.bbox.h).toBeGreaterThan(e0.bbox.h);
  expect(e1.origBbox).toBeTruthy();

  const edge = await page.locator('.inline-edge.e-t').boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + 40, edge.y + edge.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  const e2 = await ed();
  expect(e2.bbox.x).toBeGreaterThan(e1.bbox.x + 10);
  expect(e2.bbox.y).toBeLessThan(e1.bbox.y - 10);
  expect(e2.origBbox).toEqual(e1.origBbox);
  expect(await rect()).toEqual(before);
});
