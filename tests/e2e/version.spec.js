import { expect, test } from '@playwright/test';

test('le bouton de version affiche la version et la date de compilation', async ({ page }, info) => {
  test.skip(info.project.name === 'samsung', 'non testé sur Samsung');
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const chip = page.locator('#versionChip');
  if (!(await chip.isVisible())) test.skip(true, 'puce masquée sur petit écran');
  await expect(chip).toHaveText(/^v\d+\.\d+\.\d+/);
  await chip.click();
  await expect(page.locator('.ver-box')).toContainText('Compilée le');
  await expect(page.locator('#verUpdate')).toBeVisible();
});
