import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

async function blankPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([420, 420]);
  return Buffer.from(await doc.save());
}

const init = (page) =>
  page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* ignore */
    }
  });

test.describe('Sens et manipulation des flèches', () => {
  test('trace dans n’importe quelle direction, déplace, étire les deux extrémités, exporte à l’identique et supporte les anciennes flèches', async ({
    page,
  }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'fleches.pdf',
      mimeType: 'application/pdf',
      buffer: await blankPdf(),
    });

    await expect(page.locator('#docDock [data-dock=draw]')).toBeVisible({ timeout: 30_000 });
    await page.locator('#docDock [data-dock=draw]').tap();
    await expect(page.locator('#annobar')).toBeVisible();
    await page.locator('[data-anno-tool="arrow"]').tap();

    // 1. Tracé du haut-droite vers le bas-gauche (sens inverse de l'ancien comportement fixe).
    const box = await page.locator('#overlay').boundingBox();
    const startScreen = { x: box.x + box.width * 0.78, y: box.y + box.height * 0.22 };
    const endScreen = { x: box.x + box.width * 0.24, y: box.y + box.height * 0.72 };

    await page.mouse.move(startScreen.x, startScreen.y);
    await page.mouse.down();
    await page.mouse.move(endScreen.x, endScreen.y, { steps: 8 });
    await page.mouse.up();

    const drawn = await page.evaluate(() => {
      const o = window.__pdfStudio.markup.objects.find((x) => x.type === 'arrow');
      return JSON.parse(JSON.stringify(o));
    });
    expect(drawn).toBeTruthy();
    // En coordonnées PDF (origine bas-gauche) : départ en haut-droite (x grand, y grand), pointe en bas-gauche (x petit, y petit).
    expect(drawn.p1.x).toBeGreaterThan(drawn.p2.x + 80);
    expect(drawn.p1.y).toBeGreaterThan(drawn.p2.y + 80);

    // 2. Désactive l'outil de tracé et sélectionne la flèche posée.
    await page.evaluate(() => {
      const m = window.__pdfStudio.markup;
      m.setTool(null);
      m.select(m.objects[0].id);
    });
    await expect(page.locator('[data-mk-handle="arrow-start"]')).toBeVisible();
    await expect(page.locator('[data-mk-handle="arrow-end"]')).toBeVisible();

    // 3. Déplacement de toute la flèche via la poignée de déplacement.
    const moveBtn = await page.locator('[data-mk-handle="move"]').boundingBox();
    await page.mouse.move(moveBtn.x + moveBtn.width / 2, moveBtn.y + moveBtn.height / 2);
    await page.mouse.down();
    await page.mouse.move(moveBtn.x + moveBtn.width / 2 + 25, moveBtn.y + moveBtn.height / 2 - 15, { steps: 5 });
    await page.mouse.up();

    const moved = await page.evaluate(() => JSON.parse(JSON.stringify(window.__pdfStudio.markup.objects[0])));
    expect(moved.p1.x).toBeGreaterThan(drawn.p1.x + 8);
    expect(moved.p2.x).toBeGreaterThan(drawn.p2.x + 8);
    expect(Math.abs((moved.p2.x - moved.p1.x) - (drawn.p2.x - drawn.p1.x))).toBeLessThan(1.5);

    // 4. Étirement indépendant de l'extrémité de départ (la pointe p2 ne bouge pas).
    const startHandle = await page.locator('[data-mk-handle="arrow-start"]').boundingBox();
    await page.mouse.move(startHandle.x + startHandle.width / 2, startHandle.y + startHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(startHandle.x + startHandle.width / 2 - 40, startHandle.y + startHandle.height / 2, {
      steps: 5,
    });
    await page.mouse.up();

    const afterStart = await page.evaluate(() => JSON.parse(JSON.stringify(window.__pdfStudio.markup.objects[0])));
    expect(afterStart.p1.x).toBeLessThan(moved.p1.x - 12);
    expect(Math.abs(afterStart.p2.x - moved.p2.x)).toBeLessThan(0.5);
    expect(Math.abs(afterStart.p2.y - moved.p2.y)).toBeLessThan(0.5);

    // 5. Étirement indépendant de la pointe (le départ p1 ne bouge pas).
    const endHandle = await page.locator('[data-mk-handle="arrow-end"]').boundingBox();
    await page.mouse.move(endHandle.x + endHandle.width / 2, endHandle.y + endHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(endHandle.x + endHandle.width / 2, endHandle.y + endHandle.height / 2 + 35, {
      steps: 5,
    });
    await page.mouse.up();

    const afterEnd = await page.evaluate(() => JSON.parse(JSON.stringify(window.__pdfStudio.markup.objects[0])));
    expect(afterEnd.p2.y).toBeLessThan(afterStart.p2.y - 10);
    expect(Math.abs(afterEnd.p1.x - afterStart.p1.x)).toBeLessThan(0.5);
    expect(Math.abs(afterEnd.p1.y - afterStart.p1.y)).toBeLessThan(0.5);

    // 6. Rétrocompatibilité avec une ancienne flèche enregistrée sans p1/p2 + vérification pixels à l'export PDF.
    const pixelCheck = await page.evaluate(async () => {
      const studio = window.__pdfStudio;
      studio.markup.objects[0].color = '#e11d48';
      studio.markup.objects[0].width = 3.5;
      studio.addTestMarkup({
        id: 'legacy-arrow',
        page: 1,
        type: 'arrow',
        bbox: { x: 40, y: 330, w: 70, h: 45 },
        color: '#2563eb',
        width: 3,
      });
      const src = await studio.currentDocumentSource();
      const c = document.createElement('canvas');
      await src.engine.renderToCanvas(1, c, 1);
      src.dispose();
      const ctx = c.getContext('2d');
      const pageH = c.height;

      // Compte les pixels non blancs dans un carré autour d'un point PDF (x, y).
      const inkAround = (pdfX, pdfY, r = 10) => {
        const cx = Math.round(pdfX);
        const cy = Math.round(pageH - pdfY);
        let n = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const px = ctx.getImageData(cx + dx, cy + dy, 1, 1).data;
            if (px[0] < 245 || px[1] < 245 || px[2] < 245) n++;
          }
        }
        return n;
      };
      const cur = studio.markup.objects[0];
      // À la pointe p2, la tige + les 2 ailes convergent => densité d'encre nettement plus forte qu'au départ p1 !
      return {
        tipInk: inkAround(cur.p2.x, cur.p2.y, 10),
        tailInk: inkAround(cur.p1.x, cur.p1.y, 10),
        legacyTipInk: inkAround(40 + 70, 330 + 45, 10),
      };
    });

    expect(pixelCheck.tipInk).toBeGreaterThan(pixelCheck.tailInk + 12);
    expect(pixelCheck.legacyTipInk).toBeGreaterThan(20);
  });
});
