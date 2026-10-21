import { expect, test } from '@playwright/test';

/** Annotations jouées avec de vrais gestes tactiles (CDP) : le navigateur ne doit pas reprendre le geste. */

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

async function touchDrag(page, a, b, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps + (i % 2 ? 2 : -2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Après la fin du geste, un déplacement de souris ne doit plus rien modifier.
  await page.mouse.move(30, 700);
  await page.mouse.move(300, 300);
  await page.waitForTimeout(200);
}

const objects = (page) => page.evaluate(() => window.__pdfStudio.markup.objects.map((o) => ({ ...o })));

test.describe('Annotations au doigt', () => {
  for (const tool of ['highlight', 'underline', 'strike', 'rect', 'ink']) {
    test(`${tool} : un seul objet, à la taille du geste`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'CDP : Chromium seulement');
      await openDemo(page);
      await page.evaluate(() => document.querySelector('[data-route="tools"]')?.click());
      await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelector('#toolsGrid [data-tool="annotate"]')?.click());
      await page.waitForTimeout(500);
      await page.locator(`[data-anno-tool="${tool}"]`).click();
      // Page agrandie : le conteneur défile, le navigateur voudrait prendre le geste.
      await page.evaluate(() => { window.__pdfStudio.state.zoom = 2.2; document.querySelector('#btnZoomIn')?.click(); });
      await page.waitForTimeout(800);
      const line = await page.evaluate(() => {
        const els = [...document.querySelectorAll('.line-block')];
        els.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
        const r = els[0].getBoundingClientRect();
        const y = Math.min(Math.max(r.y + r.height / 2, 160), 600);
        return { x1: Math.max(r.x + 4, 20), x2: Math.max(r.x + 4, 20) + 150, y };
      });
      await touchDrag(page, { x: line.x1, y: line.y }, { x: line.x2, y: line.y });
      const list = await objects(page);
      expect(list).toHaveLength(1);
      expect(list[0].type).toBe(tool);
      const widthPdf = tool === 'ink' ? Math.max(...list[0].points.map((p) => p.x)) - Math.min(...list[0].points.map((p) => p.x)) : list[0].bbox.w;
      const scale = await page.evaluate(() => window.__pdfStudio.state.scale || 1);
      expect(widthPdf * scale).toBeLessThan((line.x2 - line.x1) * 1.5 + 20);
    });
  }
});
