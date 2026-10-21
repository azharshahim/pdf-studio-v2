import { expect, test } from '@playwright/test';

/** Mode diagnostic : désactivé par défaut, discret, et fidèle à l'édition. */
test('le mode diagnostic est désactivé par défaut et suit le curseur', async ({ page }) => {
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

  // Désactivé par défaut : pas de badge, case décochée.
  await expect(page.locator('#diagBadge')).toBeHidden();

  await page.evaluate(() => document.querySelector('#homeDemoText').click());
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(600);

  await page.evaluate(() => document.querySelector('[data-route="tools"]')?.click());
  const badge = page.locator('#diagBadge');
  // Clic direct : le panneau d'outils peut encore glisser lors de l'ouverture.
  await page.evaluate(() => document.querySelector('#diagToggle').click());
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/Chrome|Safari|Firefox|Edge|Samsung/);

  await page.evaluate(() => document.querySelector('[data-route="home"]')?.click());
  await page.evaluate(() => document.querySelector('#homeResume')?.click());
  await page.waitForTimeout(700);

  const box = await page.locator('.line-block').nth(2).boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.locator('.inline-text, .inline-textarea').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(600);

  const before = await badge.textContent();
  expect(before).toMatch(/contentEditable|textarea/);
  expect(before).toMatch(/offset \d+/);

  await page.keyboard.type('XYZ');
  await expect.poll(async () => (await badge.textContent()) !== before, { timeout: 5000 }).toBe(true);

  // La préférence est mémorisée et le badge disparaît quand on la coupe.
  await page.evaluate(() => document.querySelector('[data-route="tools"]')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#diagToggle').click());
  await expect(badge).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('pdf-studio-diagnostic'))).toBe('0');
});
