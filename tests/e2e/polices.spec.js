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
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homeDemoText')).toBeVisible();
}

test.describe('Polices', () => {
  test('la liste propose le catalogue et la police choisie est appliquée à la ligne', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => document.querySelector('#homeDemoText').click());
    await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(700);

    const options = await page.locator('#fmtFont option').evaluateAll((els) => els.map((e) => e.value));
    for (const id of ['Helvetica', 'Roboto', 'Open Sans', 'Tinos', 'Merriweather', 'Cousine', 'Dancing Script']) {
      expect(options, id).toContain(id);
    }
    expect(options.length).toBeGreaterThanOrEqual(16);

    const block = page.locator('.line-block').first();
    await block.scrollIntoViewIfNeeded();
    await block.tap();
    await page.waitForTimeout(600);
    await page.locator('#fmtFont').selectOption('Roboto');
    await page.waitForTimeout(800);

    const state = await page.evaluate(() => ({
      font: window.__pdfStudio.state.edits.at(-1)?.font,
      loaded: document.fonts.check('16px Roboto'),
      options: document.querySelectorAll('#fmtFont optgroup').length,
    }));
    expect(state.font).toBe('Roboto');
    expect(state.loaded).toBe(true);
    expect(state.options).toBeGreaterThanOrEqual(4);
  });
});
