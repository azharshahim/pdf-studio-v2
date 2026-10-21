import { expect, test } from '@playwright/test';

async function gotoApp(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homePhotos')).toBeVisible();
}

/** Image de test (fond coloré + disque) en PNG. */
const makePng = (page, w, h, color) =>
  page.evaluate(
    ([w, h, color]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = color;
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#111';
      x.beginPath();
      x.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, Math.PI * 2);
      x.fill();
      return c.toDataURL('image/png').split(',')[1];
    },
    [w, h, color]
  );

test.describe('Photos en PDF', () => {
  test('plusieurs photos de la galerie → un PDF de plusieurs pages, ouvert et enregistré', async ({ page }) => {
    await gotoApp(page);
    const a = await makePng(page, 600, 800, '#fde68a');
    const b = await makePng(page, 800, 600, '#bfdbfe');
    await page.locator('#homePhotos').tap();
    await expect(page.locator('#photoCreate')).toBeDisabled();

    const chooser = page.waitForEvent('filechooser');
    await page.locator('#photoGallery').tap();
    await (await chooser).setFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(a, 'base64') },
      { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(b, 'base64') },
    ]);
    await expect(page.locator('.photo-card')).toHaveCount(2);
    await expect(page.locator('#photoCreate')).toContainText('2 pages');

    // L'appareil photo ajoute une page de plus.
    const shot = page.waitForEvent('filechooser');
    await page.locator('#photoCamera').tap();
    await (await shot).setFiles({ name: 'c.png', mimeType: 'image/png', buffer: Buffer.from(a, 'base64') });
    await expect(page.locator('.photo-card')).toHaveCount(3);

    // Réordonner puis retirer la troisième.
    await page.locator('.photo-card').nth(1).locator('[data-ph-act=left]').tap();
    await page.locator('.photo-card').nth(2).locator('[data-ph-act=remove]').tap();
    await expect(page.locator('.photo-card')).toHaveCount(2);
    await page.locator('.photo-card').first().locator('[data-ph-act=rotate]').tap();
    await page.locator('#photoName').fill('Courrier mairie');
    await page.locator('#photoCreate').tap();

    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.numPages), { timeout: 30_000 }).toBe(2);
    expect(await page.evaluate(() => window.__pdfStudio.state.fileName)).toBe('Courrier mairie.pdf');
    // La page 1 (ex-paysage, pivotée) est en portrait.
    const sizes = await page.evaluate(async () => {
      const out = [];
      for (const n of [1, 2]) {
        const vp = await window.__pdfStudio.state.engine.getViewport(n, 1);
        out.push([vp.width, vp.height]);
      }
      return out;
    });
    expect(sizes[0][1]).toBeGreaterThan(sizes[0][0]);

    // Enregistré dans Fichiers.
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('[data-route="files"]')?.click());
    await expect(page.locator('.file-row').first()).toContainText('Courrier mairie');
  });
});
