import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function multiPagePdf(count = 100) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= count; i++) {
    const p = doc.addPage([420, 560]);
    p.drawText(`Chapitre page ${i} sur ${count}`, { x: 40, y: 480, size: 16, font });
    p.drawText(`Texte selectionnable de la page ${i}`, { x: 40, y: 440, size: 12, font });
  }
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

test.describe('Défilement continu en lecture', () => {
  test('mobile : empile 100 pages, libère les pages éloignées, zoome à deux doigts et garde les modes page par page', async ({
    page,
  }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'cent-pages.pdf',
      mimeType: 'application/pdf',
      buffer: await multiPagePdf(100),
    });

    await expect(page.locator('#docDock [data-dock=fillsign]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#readStack')).toBeVisible();
    expect(await page.locator('#readStack .read-page').count()).toBe(99);
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(true);

    // Mémoire maîtrisée au chargement : seules les premières pages sont dessinées.
    const initialRendered = await page.evaluate(() => window.__pdfStudio.continuousState.rendered.size);
    expect(initialRendered).toBeGreaterThanOrEqual(1);
    expect(initialRendered).toBeLessThanOrEqual(6);

    // Texte sélectionnable présent sur la page 1.
    await expect(page.locator('#overlay .read-text-layer span').first()).toContainText('Chapitre page 1');

    // Défilement naturel jusqu'au milieu du document (page ~50) : l'indicateur suit et la page 1 est libérée.
    await page.evaluate(() => {
      const sc = document.getElementById('canvasScroll');
      const slot50 = document.querySelector('[data-read-page="50"]');
      sc.scrollTop = slot50.offsetTop;
    });

    await expect
      .poll(() => page.evaluate(() => window.__pdfStudio.state.pageIndex + 1), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(49);
    await expect
      .poll(() => page.evaluate(() => Number(document.getElementById('pageInput').value)), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(49);
    await expect
      .poll(
        () => page.evaluate(() => !!document.querySelector('[data-read-page="50"] .read-text-layer span')),
        { timeout: 15_000 },
      )
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => document.getElementById('pdfCanvas').width), { timeout: 10_000 })
      .toBe(1);

    const midStats = await page.evaluate(() => ({
      renderedCount: window.__pdfStudio.continuousState.rendered.size,
      page1CanvasWidth: document.getElementById('pdfCanvas').width,
      page50HasText: !!document.querySelector('[data-read-page="50"] .read-text-layer span'),
    }));
    expect(midStats.renderedCount).toBeLessThanOrEqual(8);
    expect(midStats.page1CanvasWidth).toBe(1);
    expect(midStats.page50HasText).toBe(true);

    // Zoom à deux doigts (pinch) : conserve le mode continu et agrandit la page visible.
    const wBeforePinch = await page.evaluate(() => document.querySelector('[data-read-page="50"]').offsetWidth);
    await page.evaluate(() => {
      const el = document.getElementById('canvasScroll');
      const mkTouch = (id, x, y) =>
        new Touch({ identifier: id, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      const tStart = [mkTouch(1, 140, 300), mkTouch(2, 240, 300)];
      el.dispatchEvent(new TouchEvent('touchstart', { touches: tStart, targetTouches: tStart, changedTouches: tStart, bubbles: true, cancelable: true }));
      const tMove = [mkTouch(1, 90, 300), mkTouch(2, 290, 300)];
      el.dispatchEvent(new TouchEvent('touchmove', { touches: tMove, targetTouches: tMove, changedTouches: tMove, bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: tMove, bubbles: true, cancelable: true }));
    });
    await expect
      .poll(() => page.evaluate(() => document.querySelector('[data-read-page="50"]').offsetWidth))
      .toBeGreaterThan(wBeforePinch * 1.3);

    // Passage en « Remplir et signer » : revient en affichage page par page.
    await page.locator('#docDock [data-dock=fillsign]').tap();
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(false);
    await expect(page.locator('#readStack')).toBeHidden();
    await page.locator('#docDock [data-dock=done]').tap();
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(true);
    await expect(page.locator('#readStack')).toBeVisible();

    // Passage en « Annoter » : affichage page par page, retour continu à « Terminer ».
    await page.locator('#docDock [data-dock=highlight]').tap();
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(false);
    await expect(page.locator('#readStack')).toBeHidden();
    await page.locator('#annoDone').tap();
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(true);
    await expect(page.locator('#readStack')).toBeVisible();

    // Passage en « Modifier » : affichage page par page sur la page courante.
    const currentBeforeEdit = await page.evaluate(() => window.__pdfStudio.state.pageIndex + 1);
    await page.locator('#docDock [data-dock=edit]').tap();
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(false);
    await expect(page.locator('#readStack')).toBeHidden();
    await expect(page.locator('.line-block').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.__pdfStudio.state.pageIndex + 1)).toBe(currentBeforeEdit);
  });

  test('grand écran : clic sur une vignette fait défiler vers la page et zoom PC fonctionne', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'vingt-pages.pdf',
      mimeType: 'application/pdf',
      buffer: await multiPagePdf(20),
    });

    await expect(page.locator('#thumbs .thumb[data-page="12"]')).toBeAttached({ timeout: 30_000 });
    await page.locator('#thumbs .thumb[data-page="12"]').evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await page.locator('#thumbs .thumb[data-page="12"]').click();

    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.pageIndex + 1)).toBe(12);
    await expect(page.locator('[data-read-page="12"] .read-text-layer span').first()).toContainText(
      'Chapitre page 12',
      { timeout: 15_000 }
    );

    const wBeforeZoom = await page.evaluate(() => document.querySelector('[data-read-page="12"]').offsetWidth);
    await page.locator('#btnZoomIn').click();
    await expect
      .poll(() => page.evaluate(() => document.querySelector('[data-read-page="12"]').offsetWidth))
      .toBeGreaterThan(wBeforeZoom * 1.15);
  });

  test('PDF portrait + paysage : lit la vraie taille de chaque page au chargement sans saut pendant le défilement', async ({
    page,
  }) => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const specs = [
      [595, 842], // 1 : portrait
      [842, 595], // 2 : paysage
      [595, 842], // 3 : portrait
      [842, 595], // 4 : paysage
      [595, 842], // 5 : portrait
      [842, 595], // 6 : paysage
      [595, 842], // 7 : portrait
      [842, 595], // 8 : paysage (éloignée, non rendue au départ)
      [595, 842], // 9 : portrait (éloignée, non rendue au départ)
      [842, 595], // 10 : paysage (éloignée, non rendue au départ)
    ];
    specs.forEach(([w, h], idx) => {
      const p = doc.addPage([w, h]);
      p.drawText(`Feuille ${idx + 1} (${w > h ? 'paysage' : 'portrait'})`, {
        x: 48,
        y: h - 72,
        size: 18,
        font,
        color: rgb(0.1, 0.14, 0.2),
      });
    });
    const mixedBuffer = Buffer.from(await doc.save());

    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'portrait-paysage.pdf',
      mimeType: 'application/pdf',
      buffer: mixedBuffer,
    });

    await expect(page.locator('#readStack [data-read-page="10"]')).toBeAttached({ timeout: 20_000 });

    // Avant tout défilement : toutes les tailles réelles ont été lues sans rendre les pages éloignées.
    const before = await page.evaluate(() => {
      const sc = document.getElementById('canvasScroll');
      const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
        const el = document.querySelector(`[data-read-page="${n}"]`);
        return { n, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      });
      return {
        baseSizesCount: window.__pdfStudio.continuousState.baseSizes.size,
        renderedHas10: window.__pdfStudio.continuousState.rendered.has(10),
        scrollHeight: sc.scrollHeight,
        slots,
      };
    });

    expect(before.baseSizesCount).toBe(10);
    expect(before.renderedHas10).toBe(false);
    // Pages impaires : portrait (hauteur > largeur), pages paires : paysage (largeur > hauteur).
    for (const s of before.slots) {
      if (s.n % 2 === 1) {
        expect(s.height).toBeGreaterThan(s.width * 1.35);
      } else {
        expect(s.width).toBeGreaterThan(s.height * 1.35);
      }
    }

    // Fait défiler jusqu'à la page 8 puis la page 10 (qui sont rendues à la volée) : aucun saut de position ni de scrollHeight.
    for (const target of [8, 10]) {
      await page.evaluate((t) => {
        const sc = document.getElementById('canvasScroll');
        const slot = document.querySelector(`[data-read-page="${t}"]`);
        sc.scrollTop = slot.offsetTop;
      }, target);
      await expect
        .poll(
          () => page.evaluate((t) => !!document.querySelector(`[data-read-page="${t}"] .read-text-layer span`), target),
          { timeout: 15_000 }
        )
        .toBe(true);
    }

    const after = await page.evaluate(() => {
      const sc = document.getElementById('canvasScroll');
      const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
        const el = document.querySelector(`[data-read-page="${n}"]`);
        return { n, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      });
      return { scrollHeight: sc.scrollHeight, slots };
    });

    expect(after.scrollHeight).toBe(before.scrollHeight);
    for (let i = 0; i < before.slots.length; i++) {
      expect(after.slots[i].top).toBe(before.slots[i].top);
      expect(after.slots[i].width).toBe(before.slots[i].width);
      expect(after.slots[i].height).toBe(before.slots[i].height);
    }
  });
});
