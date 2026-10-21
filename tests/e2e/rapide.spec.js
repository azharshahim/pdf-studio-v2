import { expect, test } from '@playwright/test';

// PNG 1×1 transparent : suffit pour une « signature enregistrée ».
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function openDemo(page, seed = {}) {
  await page.addInitScript((data) => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    } catch {
      /* stockage indisponible */
    }
  }, seed);
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homeDemoText')).toBeVisible();
  await page.evaluate(() => document.querySelector('#homeDemoText').click());
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(700);
}

const objects = (page) => page.evaluate(() => window.__pdfStudio.markup.objects.map((o) => ({ ...o, src: undefined })));

test.describe('Signatures et tampons enregistrés', () => {
  test('mes signatures s’affichent en premier et se posent en un appui', async ({ page }) => {
    await openDemo(page, {
      'pdf-studio-signatures': JSON.stringify([{ id: 'sig-test', src: PNG, ratio: 3, kind: 'draw', createdAt: 1 }]),
    });
    await page.locator('#docDock [data-dock=sign]').tap();
    await expect(page.locator('#sheet')).toBeVisible();
    // La signature enregistrée précède les onglets de création.
    const order = await page.evaluate(() => {
      const body = document.querySelector('#sheetBody');
      const saved = body.querySelector('.sig-saved-wrap');
      const tabs = body.querySelector('.sig-tabs');
      return !!saved && !!tabs && !!(saved.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
    await page.locator('[data-sig-use=sig-test]').tap();
    await expect.poll(async () => (await objects(page)).length).toBe(1);
    expect((await objects(page))[0].type).toBe('signature');
  });

  test('remplissage rapide : date du jour, coche et croix', async ({ page }) => {
    await openDemo(page);
    for (const kind of ['date', 'check', 'cross']) {
      await page.locator('#docDock [data-dock=sign]').tap();
      await expect(page.locator('#sheet')).toBeVisible();
      await page.locator(`[data-quick=${kind}]`).tap();
      await page.waitForTimeout(500);
    }
    const objs = await objects(page);
    expect(objs.map((o) => o.type)).toEqual(['date', 'date', 'date']);
    expect(objs[0].text).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(objs[1].text).toBe('✓');
    expect(objs[2].text).toBe('✗');
  });

  test('mon nom enregistré se pose directement', async ({ page }) => {
    await openDemo(page, { 'pdf-studio-name': 'Kevin Mbumba' });
    await page.locator('#docDock [data-dock=sign]').tap();
    await page.locator('[data-quick=name]').tap();
    await expect.poll(async () => (await objects(page)).map((o) => o.text)).toEqual(['Kevin Mbumba']);
  });

  test('un tampon personnalisé est enregistré puis proposé dans « Mes tampons »', async ({ page }) => {
    await openDemo(page);
    await page.locator('#docDock [data-dock=stamp]').tap();
    await page.locator('#stampText').fill('REÇU PAR RAPID NET');
    await page.locator('#stampAdd').tap();
    await expect.poll(async () => (await objects(page)).length).toBe(1);

    await page.locator('#docDock [data-dock=stamp]').tap();
    const mine = page.locator('[data-stamp-saved]');
    await expect(mine).toHaveCount(1);
    await expect(mine.first()).toContainText('REÇU PAR RAPID NET');
    await mine.first().tap();
    await expect.poll(async () => (await objects(page)).length).toBe(2);
    expect((await objects(page))[1]).toMatchObject({ type: 'stamp', text: 'REÇU PAR RAPID NET' });
  });

  test('agrandir une signature agrandit la signature elle-même, proportions gardées', async ({ page }) => {
    await openDemo(page, {
      'pdf-studio-signatures': JSON.stringify([{ id: 'sig-test', src: PNG, ratio: 3, kind: 'draw', createdAt: 1 }]),
    });
    await page.locator('#docDock [data-dock=sign]').tap();
    await page.locator('[data-sig-use=sig-test]').tap();
    await expect.poll(async () => (await objects(page)).length).toBe(1);
    await page.waitForTimeout(500);

    const imgSize = () =>
      page.locator('.mk-signature img').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
    const before = await imgSize();
    const handle = await page.locator('[data-mk-handle="resize"]').boundingBox();
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 26, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await imgSize();
    expect(after.w).toBeGreaterThan(before.w + 20);
    expect(after.h).toBeGreaterThan(before.h + 5);
    // Les proportions ne bougent pas.
    expect(Math.abs(after.w / after.h - before.w / before.h)).toBeLessThan(0.05);
    const box = (await objects(page))[0].bbox;
    expect(Math.abs(box.w / box.h - 3)).toBeLessThan(0.1);
  });

  test('glisser la signature elle-même la déplace', async ({ page }) => {
    await openDemo(page, {
      'pdf-studio-signatures': JSON.stringify([{ id: 'sig-test', src: PNG, ratio: 3, kind: 'draw', createdAt: 1 }]),
    });
    await page.locator('#docDock [data-dock=sign]').tap();
    await page.locator('[data-sig-use=sig-test]').tap();
    await expect.poll(async () => (await objects(page)).length).toBe(1);
    await page.waitForTimeout(500);
    const start = (await objects(page))[0].bbox;
    const r = await page.locator('.mk-signature').boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 50, r.y + r.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    const end = (await objects(page))[0].bbox;
    expect(end.x).toBeGreaterThan(start.x + 5);
    expect(end.y).toBeLessThan(start.y - 3);
    expect(end.w).toBeCloseTo(start.w, 3);
  });
});
