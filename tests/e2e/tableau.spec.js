import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Petit tableau : cellules étroites, bordures noires proches du texte.
async function tablePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const line = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.8, color: rgb(0, 0, 0) });
  for (const y of [150, 140, 130]) line(20, y, 380, y);
  for (const x of [20, 120, 200, 300, 380]) line(x, 150, x, 130);
  page.drawText('Release Date', { x: 24, y: 142, size: 7, font: f });
  page.drawText('Time', { x: 124, y: 142, size: 7, font: f });
  page.drawText('2026-09-30', { x: 24, y: 132, size: 7, font: f });
  page.drawText('2026-10-21', { x: 204, y: 132, size: 7, font: f });
  return Buffer.from(await doc.save());
}

test('le fond sous une cellule de tableau reste blanc (pas de grisé)', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await page.locator('#fileInput').setInputFiles({ name: 'table.pdf', mimeType: 'application/pdf', buffer: await tablePdf() });
  await page.locator('#docDock [data-dock=edit]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('#docDock [data-dock=edit]').tap();
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(700);
  const target = page.locator('.line-block').nth(3);
  await target.scrollIntoViewIfNeeded();
  await target.tap();
  await page.locator('.inline-shell').waitFor({ state: 'visible' });
  const bg = await page.locator('.inline-shell').evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g).map(Number);
  expect(Math.min(r, g, b), `fond ${bg}`).toBeGreaterThan(235);
});
