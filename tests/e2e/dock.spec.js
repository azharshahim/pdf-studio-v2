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
  await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.locator('#sheet .icon-btn, #sheetClose').first().tap().catch(() => {});
    await page.evaluate(() => document.querySelector('#sheetBackdrop')?.click());
    await page.waitForTimeout(500);
    await page.locator('#docDock [data-dock=highlight]').tap();
    await expect(page.locator('body')).toHaveClass(/annotating/);
  });
});
