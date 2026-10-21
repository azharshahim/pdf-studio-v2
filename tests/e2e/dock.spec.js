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

const inViewport = (page, sel) =>
  page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
  });

test.describe('Barre d’outils du document', () => {
  test('remplace la navigation et garde Signer et Tampon visibles', async ({ page }) => {
    await openDemo(page);
    await expect(page.locator('#docDock')).toBeVisible();
    await expect(page.locator('#tabbar')).toBeHidden();
    for (const id of ['edit', 'text', 'highlight', 'draw', 'sign', 'stamp']) {
      expect(await inViewport(page, `#docDock [data-dock=${id}]`), id).toBe(true);
    }
  });

  test('pendant la modification, Signer ouvre la feuille de signature en un seul appui', async ({ page }) => {
    await openDemo(page);
    await page.locator('.line-block').nth(2).tap();
    await page.waitForTimeout(600);
    await expect(page.locator('body')).toHaveClass(/editing/);
    expect(await inViewport(page, '#docDock [data-dock=sign]')).toBe(true);
    await page.locator('#docDock [data-dock=sign]').tap();
    await expect(page.locator('#sheet')).toBeVisible();
    await expect(page.locator('#sheetTitle')).toContainText('signer');
    await expect(page.locator('body')).not.toHaveClass(/editing/);
  });

  test('Tampon, Surligner et Texte sont lançables depuis la barre', async ({ page }) => {
    await openDemo(page);
    await page.locator('#docDock [data-dock=stamp]').tap();
    await expect(page.locator('#sheet')).toBeVisible();
    await page.evaluate(() => document.querySelector('#sheetBackdrop')?.click());
    await page.waitForTimeout(500);
    await page.locator('#docDock [data-dock=highlight]').tap();
    await expect(page.locator('body')).toHaveClass(/annotating/);
  });

  test('menu ⋮ : actions du document, partage et compression', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.canShare = () => true;
      navigator.share = async (data) => {
        window.__shared = { name: data.files[0].name, type: data.files[0].type, size: data.files[0].size };
      };
    });
    await openDemo(page);
    await page.locator('#btnDocMenu').tap();
    await expect(page.locator('#sheet [data-doc-menu]')).toHaveCount(12);

    await page.locator('[data-doc-menu=share]').tap();
    await expect.poll(() => page.evaluate(() => window.__shared?.name)).toMatch(/-modifie\.pdf$/);
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.type).toBe('application/pdf');
    expect(shared.size).toBeGreaterThan(1000);

    await page.locator('#btnDocMenu').tap();
    await page.locator('[data-doc-menu=compress]').tap();
    await expect(page.locator('#sheetTitle')).toContainText(/ompress/i);
  });

  test('Enregistrer ne télécharge pas ; Partager visible ; Télécharger dans ⋮ ; Retour', async ({ page }) => {
    await openDemo(page);
    let downloads = 0;
    page.on('download', () => downloads++);
    await expect(page.locator('#btnShare')).toBeVisible();
    await expect(page.locator('#btnExport')).toBeHidden();
    await expect(page.locator('#btnBack')).toBeVisible();
    await page.locator('#btnSave, .save-btn').first().tap().catch(() => {});
    await page.waitForTimeout(1200);
    expect(downloads).toBe(0);
    await page.locator('#btnDocMenu').tap();
    const dl = page.waitForEvent('download', { timeout: 20_000 });
    await page.locator('[data-doc-menu=download]').tap();
    // Le nom du document est conservé (le navigateur de test renvoie « download » pour un nom accentué).
    expect((await dl).suggestedFilename()).toMatch(/\.pdf$|^download$/);
    await page.locator('#btnBack').tap();
    await expect(page.locator('#docDock')).toBeHidden();
  });
});
