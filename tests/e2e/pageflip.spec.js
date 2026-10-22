import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function init(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* ignore */
    }
  });
}

async function threePagePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Page numero ${i} — haut de feuille`, {
      x: 56,
      y: 770,
      size: 16,
      font,
      color: rgb(0.1, 0.12, 0.18),
    });
    p.drawText(`Bloc bas de page ${i} a manipuler`, {
      x: 56,
      y: 120,
      size: 14,
      font,
      color: rgb(0.15, 0.2, 0.28),
    });
  }
  return Buffer.from(await doc.save());
}

test.describe('Changement de page au défilement hors lecture (bindPageFlip)', () => {
  test('inactif en lecture continue, actif en Modifier / Annoter / Remplir et signer (bas → suivante, haut → précédente)', async ({
    page,
  }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'trois-pages.pdf',
      mimeType: 'application/pdf',
      buffer: await threePagePdf(),
    });

    await expect(page.locator('#readStack [data-read-page="3"]')).toBeAttached({ timeout: 20_000 });

    // 1. En mode Lecture : le défilement continu remplace bindPageFlip (canFlip === false, count === 0).
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(true);
    expect(await page.evaluate(() => window.__pdfStudio.pageFlipState.canFlip())).toBe(false);
    await page.mouse.move(200, 420);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 120);
    expect(await page.evaluate(() => window.__pdfStudio.pageFlipState.count)).toBe(0);

    // Revient en haut de la page 1 puis passe en mode Modifier.
    await page.evaluate(() => window.__pdfStudio.goToPage?.(1));
    await page.evaluate(() => {
      document.getElementById('canvasScroll').scrollTop = 0;
    });
    await page.locator('#docDock [data-dock=edit]').tap();
    await expect(page.locator('.line-block').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(false);
    expect(await page.evaluate(() => window.__pdfStudio.pageFlipState.canFlip())).toBe(true);
    expect(await page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);

    // 2. Mode Modifier : en bas de la page 1, continuer à défiler passe à la page 2.
    await page.evaluate(() => {
      const sc = document.getElementById('canvasScroll');
      sc.scrollTop = sc.scrollHeight;
    });
    await page.mouse.move(200, 420);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 80);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(1);
    expect(await page.evaluate(() => window.__pdfStudio.pageFlipState.count)).toBe(1);

    // Attend la fin du cooldown (700 ms), puis depuis le haut de la page 2, défiler vers le haut revient à la page 1.
    await page.waitForTimeout(750);
    await page.evaluate(() => {
      document.getElementById('canvasScroll').scrollTop = 0;
    });
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -80);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);
    expect(await page.evaluate(() => window.__pdfStudio.pageFlipState.count)).toBe(2);

    // 3. Mode Remplir et signer : retour lecture puis ouverture de Remplir et signer.
    await page.evaluate(() => window.__pdfStudio.setReadMode(true));
    await expect(page.locator('#readStack')).toBeVisible();
    await page.locator('#docDock [data-dock=fillsign]').tap();
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(false);
    await page.waitForTimeout(750);
    await page.evaluate(() => {
      const sc = document.getElementById('canvasScroll');
      sc.scrollTop = sc.scrollHeight;
    });
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 80);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(1);

    // 4. Mode Annoter : retour lecture puis ouverture d’Annoter (depuis page 2, remonter vers page 1).
    await page.locator('#docDock [data-dock=done]').tap();
    await page.locator('#docDock [data-dock=highlight]').tap();
    expect(await page.evaluate(() => window.__pdfStudio.isContinuousRead())).toBe(false);
    await page.waitForTimeout(750);
    await page.evaluate(() => {
      document.getElementById('canvasScroll').scrollTop = 0;
    });
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -80);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);
  });

  test('ne change pas de page pendant un glisser de bloc, poignée, signature, flèche ou un zoom à deux doigts', async ({
    page,
  }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'trois-pages.pdf',
      mimeType: 'application/pdf',
      buffer: await threePagePdf(),
    });

    await page.locator('#docDock [data-dock=edit]').tap();
    await expect(page.locator('.line-block').first()).toBeVisible({ timeout: 15_000 });

    // Place le défilement tout en bas de la page 1 pour tenter de provoquer un faux changement de page.
    const scrollToBottom = () =>
      page.evaluate(() => {
        const sc = document.getElementById('canvasScroll');
        sc.scrollTop = sc.scrollHeight;
      });

    // Helper d'envoi simultané pointer + touch (comme un vrai doigt sur mobile) vers le haut (dy = -140 px).
    const touchDragUp = async (selector) => {
      await scrollToBottom();
      const box = await page.locator(selector).first().boundingBox();
      expect(box).not.toBeNull();
      const sx = box.x + box.width / 2;
      const sy = box.y + box.height / 2;
      const ex = sx;
      const ey = sy - 140;
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.evaluate(
        ({ selector: sel, sx: x0, sy: y0, ex: x1, ey: y1 }) => {
          const target = document.querySelector(sel) || document.getElementById('canvasScroll');
          const t0 = [new Touch({ identifier: 1, target, clientX: x0, clientY: y0, pageX: x0, pageY: y0 })];
          target.dispatchEvent(new TouchEvent('touchstart', { touches: t0, targetTouches: t0, changedTouches: t0, bubbles: true, cancelable: true }));
          const t1 = [new Touch({ identifier: 1, target, clientX: x1, clientY: y1, pageX: x1, pageY: y1 })];
          target.dispatchEvent(new TouchEvent('touchmove', { touches: t1, targetTouches: t1, changedTouches: t1, bubbles: true, cancelable: true }));
        },
        { selector, sx, sy, ex, ey }
      );
      await page.mouse.move(ex, ey, { steps: 5 });
      await page.mouse.up();
      await page.evaluate(
        ({ selector: sel, ex: x1, ey: y1 }) => {
          const target = document.querySelector(sel) || document.getElementById('canvasScroll');
          const t1 = [new Touch({ identifier: 1, target, clientX: x1, clientY: y1, pageX: x1, pageY: y1 })];
          target.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: t1, bubbles: true, cancelable: true }));
        },
        { selector, ex, ey }
      );
    };

    // 1. Glisser d'un bloc texte (.inline-edge) et d'une poignée de coin (.inline-corner).
    await scrollToBottom();
    await page.locator('.line-block').last().click();
    await expect(page.locator('.inline-shell')).toBeVisible();
    await touchDragUp('.inline-edge.e-t');
    expect(await page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);
    await touchDragUp('.inline-corner.c-br');
    expect(await page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);
    await page.keyboard.press('Escape');

    // 2. Glisser d'une signature posée (.mk-stamp / .mk-image) et de sa poignée resize.
    await page.evaluate(() => {
      window.__pdfStudio.addTestMarkup({
        id: 'sig-test-1',
        type: 'stamp',
        page: 1,
        text: 'SIGNATURE',
        color: '#1d4ed8',
        bbox: { x: 100, y: 120, w: 140, h: 42 },
      });
      window.__pdfStudio.markup.select('sig-test-1');
    });
    await expect(page.locator('[data-mk-id="sig-test-1"]')).toBeVisible();
    await touchDragUp('[data-mk-id="sig-test-1"]');
    expect(await page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);
    await touchDragUp('[data-mk-handle="resize"]');
    expect(await page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);

    // 3. Glisser d'une flèche et de sa poignée d'extrémité (arrow-end).
    await page.evaluate(() => {
      window.__pdfStudio.addTestMarkup({
        id: 'arr-test-1',
        type: 'arrow',
        page: 1,
        color: '#dc2626',
        width: 3,
        p1: { x: 120, y: 180 },
        p2: { x: 260, y: 220 },
        bbox: { x: 112, y: 172, w: 156, h: 56 },
      });
      window.__pdfStudio.markup.select('arr-test-1');
    });
    await expect(page.locator('[data-mk-handle="arrow-end"]')).toBeVisible();
    await touchDragUp('[data-mk-handle="arrow-end"]');
    expect(await page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);

    // 4. Zoom à deux doigts (pinch) en bas de page : ne doit pas tourner la page.
    await scrollToBottom();
    await page.evaluate(() => {
      const el = document.getElementById('canvasScroll');
      const mkTouch = (id, x, y) =>
        new Touch({ identifier: id, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      const tStart = [mkTouch(1, 140, 500), mkTouch(2, 240, 500)];
      el.dispatchEvent(new TouchEvent('touchstart', { touches: tStart, targetTouches: tStart, changedTouches: tStart, bubbles: true, cancelable: true }));
      const tMove = [mkTouch(1, 90, 340), mkTouch(2, 290, 340)];
      el.dispatchEvent(new TouchEvent('touchmove', { touches: tMove, targetTouches: tMove, changedTouches: tMove, bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: tMove, bubbles: true, cancelable: true }));
    });
    expect(await page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(0);
    expect(await page.evaluate(() => window.__pdfStudio.pageFlipState.count)).toBe(0);
  });
});
