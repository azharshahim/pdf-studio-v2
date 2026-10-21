import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function simplePdf(text = 'Bonjour lecture') {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  page.drawText(text, { x: 30, y: 120, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await doc.save());
}

const init = (page) =>
  page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });

test.describe('Lecture seule et démarrage', () => {
  test('un PDF s’ouvre en lecture seule ; « Modifier » ouvre les outils ; le menu ramène en lecture', async ({ page }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({ name: 'lire.pdf', mimeType: 'application/pdf', buffer: await simplePdf() });
    await expect(page.locator('#readEdit')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#docDock')).toBeHidden();
    await expect(page.locator('#btnSave')).toBeHidden();
    await expect(page.locator('.line-block')).toHaveCount(0, { timeout: 15_000 }).catch(() => {});
    await expect(page.locator('.line-block:visible')).toHaveCount(0);

    await page.locator('#readEdit').tap();
    await expect(page.locator('#docDock')).toBeVisible();
    await expect(page.locator('#readEdit')).toBeHidden();
    await expect(page.locator('.line-block').first()).toBeVisible({ timeout: 30_000 });

    await page.locator('#btnDocMenu').tap();
    await page.locator('[data-doc-menu=read]').tap();
    await expect(page.locator('#readEdit')).toBeVisible();
    await expect(page.locator('#docDock')).toBeHidden();
  });

  test('un fichier ouvert par le système (double-clic Windows) s’ouvre en lecture', async ({ page }) => {
    await init(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'launchQueue', {
        configurable: true,
        value: { setConsumer: (cb) => (window.__launch = cb) },
      });
    });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    const bytes = [...(await simplePdf('Ouvert par Windows'))];
    await page.evaluate(async (arr) => {
      const file = new File([new Uint8Array(arr)], 'depuis-explorateur.pdf', { type: 'application/pdf' });
      await window.__launch({ files: [{ getFile: async () => file }] });
    }, bytes);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.fileName), { timeout: 30_000 }).toBe('depuis-explorateur.pdf');
    await expect(page.locator('#readEdit')).toBeVisible();
  });

  test('le démarrage affiche la liste des fichiers, récents en haut', async ({ page, context }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    for (const [name, text] of [['ancien.pdf', 'Un'], ['recent.pdf', 'Deux']]) {
      await page.locator('#fileInput').setInputFiles({ name, mimeType: 'application/pdf', buffer: await simplePdf(text) });
      await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.fileName), { timeout: 30_000 }).toBe(name);
      await page.waitForTimeout(1200);
    }
    const fresh = await context.newPage();
    await fresh.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(fresh.locator('#screenFiles')).toBeVisible({ timeout: 15_000 });
    await expect(fresh.locator('.file-row').first()).toContainText('recent');
    await expect(fresh.locator('.file-row').nth(1)).toContainText('ancien');
  });

  test('premier lancement sans fichier : écran d’accueil', async ({ page }) => {
    await init(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#screenHome')).toBeVisible();
  });
});
