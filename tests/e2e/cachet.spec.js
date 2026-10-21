import { expect, test } from '@playwright/test';

async function openDemo(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homeDemoText')).toBeVisible();
  await page.evaluate(() => document.querySelector('#homeDemoText').click());
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(700);
}

const objects = (page) => page.evaluate(() => window.__pdfStudio.markup.objects.map((o) => ({ ...o, src: undefined })));

test.describe('Cachets', () => {
  test('créer un cachet, le placer, puis le retrouver dans Mes tampons', async ({ page }) => {
    await openDemo(page);
    await page.locator('#docDock [data-dock=stamp]').tap();
    await page.locator('#cachetCreate').tap();
    await expect(page.locator('#cachetUse')).toBeDisabled();
    await page.locator('#cachetL1').fill('RAPID NET SERVICES');
    await page.locator('#cachetL2').fill('93210 La Plaine St Denis');
    await expect(page.locator('#cachetPreview')).toHaveAttribute('src', /^data:image\/png/);
    await expect(page.locator('#cachetUse')).toBeEnabled();
    await page.locator('[data-shape=ellipse]').tap();
    await page.locator('#cachetUse').tap();
    await expect.poll(async () => (await objects(page)).length).toBe(1);

    await page.locator('#docDock [data-dock=stamp]').tap();
    await expect(page.locator('.stamp-mine .stamp-img img')).toHaveCount(1);
  });

  test('importer un cachet : le fond blanc devient transparent', async ({ page }) => {
    await openDemo(page);
    await page.locator('#docDock [data-dock=stamp]').tap();
    await page.locator('#cachetImport').tap();
    // Image de test : fond blanc, disque bleu.
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 80;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, 120, 80);
      x.fillStyle = '#1d4ed8';
      x.beginPath();
      x.arc(60, 40, 25, 0, Math.PI * 2);
      x.fill();
      return c.toDataURL('image/png').split(',')[1];
    });
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#cachetPick').tap();
    await (await chooser).setFiles({ name: 'cachet.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('#cachetPreview')).toHaveAttribute('src', /^data:image\/png/);
    const info = await page.locator('#cachetPreview').evaluate(async (img) => {
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const corner = x.getImageData(0, 0, 1, 1).data[3];
      const mid = x.getImageData(c.width >> 1, c.height >> 1, 1, 1).data[3];
      return { corner, mid, w: c.width, h: c.height };
    });
    expect(info.mid).toBe(255);
    expect(info.corner).toBe(0);
    // rogné au disque (≈ 50 px) et non plus 120×80
    expect(info.w).toBeLessThan(70);
    await page.locator('#cachetUse').tap();
    await expect.poll(async () => (await objects(page)).length).toBe(1);
  });
});
