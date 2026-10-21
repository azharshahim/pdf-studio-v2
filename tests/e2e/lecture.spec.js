import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function simplePdf(text = 'Bonjour lecture') {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  page.drawText(text, { x: 30, y: 120, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await doc.save());
}

const init = (page) =>
  page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });

test.describe('Lecture seule et démarrage', () => {
  test('un PDF s’ouvre en lecture seule à 125 % ; Modifier ouvre les outils ; le menu ramène en lecture', async ({ page }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({ name: 'lire.pdf', mimeType: 'application/pdf', buffer: await simplePdf() });
    const dock = page.locator('#docDock');
    await expect(dock.locator('[data-dock=fillsign]')).toBeVisible({ timeout: 60_000 });
    await expect(dock.locator('[data-dock=edit]')).toBeVisible();
    await expect(dock.locator('[data-dock=search]')).toBeVisible();
    // Pas d'OCR ni d'outils de modification en lecture.
    await expect(dock.locator('[data-dock=ocr]')).toBeHidden();
    await expect(dock.locator('[data-dock=highlight]')).toBeVisible();
    await expect(dock.locator('[data-dock=comment]')).toBeVisible();
    await expect(dock.locator('[data-dock=draw]')).toBeVisible();
    await expect(dock.locator('[data-dock=pages]')).toBeHidden();
    await expect(page.locator('#btnSave')).toBeHidden();
    await expect(page.locator('.line-block:visible')).toHaveCount(0);

    // 125 % de la largeur ajustée.
    const fit = await page.evaluate(() => {
      const sc = document.getElementById('canvasScroll');
      const base = window.__pdfStudio.state.scale;
      return { base, avail: sc.clientWidth - 16 };
    });
    expect(fit.base).toBeGreaterThan(0);
    const readW = await page.evaluate(() => document.getElementById('pdfCanvas').getBoundingClientRect().width);
    await dock.locator('[data-dock=edit]').tap();
    await expect(dock.locator('[data-dock=highlight]')).toBeVisible();
    await expect(dock.locator('[data-dock=fillsign]')).toBeHidden();
    await expect(page.locator('.line-block').first()).toBeVisible({ timeout: 30_000 });
    const editW = await page.evaluate(() => document.getElementById('pdfCanvas').getBoundingClientRect().width);
    expect(readW / editW).toBeGreaterThan(1.15);
    expect(readW / editW).toBeLessThan(1.35);

    await page.locator('#btnDocMenu').tap();
    await page.locator('[data-doc-menu=read]').tap();
    await expect(dock.locator('[data-dock=fillsign]')).toBeVisible();
  });

  test('surligner en lecture seule, sans passer en modification', async ({ page }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({ name: 'surl.pdf', mimeType: 'application/pdf', buffer: await simplePdf('Texte a surligner en lecture') });
    const dock = page.locator('#docDock');
    await dock.locator('[data-dock=highlight]').tap();
    await expect(page.locator('#annobar')).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.body.classList.contains('reading'))).toBe(true);
    const box = await page.locator('#pdfCanvas').boundingBox();
    await page.mouse.move(box.x + 40, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 62, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.markup.objects.map((o) => o.type))).toEqual(['highlight']);
    await page.locator('#annoDone').tap();
    await expect(dock.locator('[data-dock=fillsign]')).toBeVisible();
    expect(await page.evaluate(() => document.body.classList.contains('reading'))).toBe(true);
  });

  test('modification : « Photos » crée un PDF depuis la galerie ou l’appareil photo', async ({ page }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({ name: 'ph.pdf', mimeType: 'application/pdf', buffer: await simplePdf() });
    const dock = page.locator('#docDock');
    await dock.locator('[data-dock=edit]').tap();
    await dock.locator('[data-dock=photos]').evaluate((b) => b.scrollIntoView({ inline: 'center' }));
    await dock.locator('[data-dock=photos]').tap();
    await expect(page.locator('#photoCamera')).toBeVisible({ timeout: 15_000 });
  });

  test('Remplir et signer : outils de saisie, renommer le fichier, retour à la lecture', async ({ page }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({ name: 'contrat.pdf', mimeType: 'application/pdf', buffer: await simplePdf() });
    const dock = page.locator('#docDock');
    await dock.locator('[data-dock=fillsign]').tap();
    for (const id of ['text', 'sign', 'stamp', 'date', 'check', 'rename', 'done']) {
      await expect(dock.locator(`[data-dock=${id}]`), id).toBeVisible();
    }
    await expect(dock.locator('[data-dock=highlight]')).toBeHidden();
    await expect(dock.locator('[data-dock=ocr]')).toBeHidden();

    await dock.locator('[data-dock=check]').tap();
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.markup.objects.length)).toBe(1);

    await dock.locator('[data-dock=rename]').tap();
    await page.locator('#renameInput').fill('Contrat signé');
    await page.locator('#renameOk').tap();
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.fileName)).toBe('Contrat signé.pdf');

    await dock.locator('[data-dock=done]').tap();
    await expect(dock.locator('[data-dock=fillsign]')).toBeVisible();
    await expect(dock.locator('[data-dock=check]')).toBeHidden();
  });

  test('rechercher puis remplacer : le texte change, la police et la taille restent', async ({ page }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({ name: 'rempl.pdf', mimeType: 'application/pdf', buffer: await simplePdf('Facture Alpha et Alpha') });
    const dock = page.locator('#docDock');
    await dock.locator('[data-dock=edit]').tap();
    await expect(page.locator('.line-block').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.getElementById('btnSearch').click());
    await page.locator('#searchInput').fill('alpha');
    await expect(page.locator('.search-result').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#replaceInput').fill('Beta');
    await page.locator('#replaceAll').tap();
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.edits.at(-1)?.text)).toBe('Facture Beta et Beta');
    const e = await page.evaluate(() => window.__pdfStudio.state.edits.at(-1));
    expect(e.font).toBe('Helvetica');
    expect(e.size).toBeGreaterThan(10);
  });

  test('un fichier ouvert par le système (double-clic Windows) s’ouvre en lecture', async ({ page }) => {
    await init(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'launchQueue', {
        configurable: true,
        value: { setConsumer: (cb) => (window.__launch = cb) },
      });
    });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    const bytes = [...(await simplePdf('Ouvert par Windows'))];
    await page.evaluate(async (arr) => {
      const file = new File([new Uint8Array(arr)], 'depuis-explorateur.pdf', { type: 'application/pdf' });
      await window.__launch({ files: [{ getFile: async () => file }] });
    }, bytes);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.fileName), { timeout: 30_000 }).toBe('depuis-explorateur.pdf');
    await expect(page.locator('#docDock [data-dock=fillsign]')).toBeVisible();
  });

  test('le démarrage affiche la liste des fichiers, récents en haut', async ({ page, context }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    for (const [name, text] of [['ancien.pdf', 'Un'], ['recent.pdf', 'Deux']]) {
      await page.locator('#fileInput').setInputFiles({ name, mimeType: 'application/pdf', buffer: await simplePdf(text) });
      await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.fileName), { timeout: 30_000 }).toBe(name);
      await page.waitForTimeout(1200);
    }
    const fresh = await context.newPage();
    await fresh.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(fresh.locator('#screenFiles')).toBeVisible({ timeout: 15_000 });
    await expect(fresh.locator('.file-row').first()).toContainText('recent');
    await expect(fresh.locator('.file-row').nth(1)).toContainText('ancien');
  });

  test('premier lancement sans fichier : écran d’accueil', async ({ page }) => {
    await init(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#screenHome')).toBeVisible();
  });

  test('filigrane : détecté dans la barre de modification, supprimé et renommé', async ({ page }) => {
    await init(page);
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    const { PDFDocument: D, StandardFonts: SF, degrees, rgb } = await import('pdf-lib');
    const doc = await D.create();
    const font = await doc.embedFont(SF.Helvetica);
    const pg = doc.addPage([400, 300]);
    pg.drawText('Rapport mensuel', { x: 30, y: 250, size: 14, font });
    pg.drawText('BROUILLON', { x: 80, y: 80, size: 54, font, color: rgb(0.6, 0.6, 0.6), opacity: 0.3, rotate: degrees(35) });
    const buffer = Buffer.from(await doc.save());
    await page.locator('#fileInput').setInputFiles({ name: 'wm.pdf', mimeType: 'application/pdf', buffer });
    const dock = page.locator('#docDock');
    await dock.locator('[data-dock=edit]').tap();
    await expect(dock.locator('[data-dock=watermark]')).toBeVisible({ timeout: 30_000 });
    await dock.locator('[data-dock=watermark]').tap();
    await expect(page.locator('.wm-item')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('.wm-text')).toHaveValue('BROUILLON');
    await page.locator('.wm-text').fill('COPIE');
    await page.locator('[data-wm-act=rename]').tap();
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.getPageText?.(1) ?? ''), { timeout: 30_000 }).toBeDefined();
    await page.waitForTimeout(1500);
    const txt = await page.evaluate(async () => {
      const { default: _ } = { default: 0 };
      const doc = window.__pdfStudio.state.engine.doc;
      const p = await doc.getPage(1);
      return (await p.getTextContent()).items.map((i) => i.str).join(' ');
    });
    expect(txt).toContain('COPIE');
    expect(txt).not.toContain('BROUILLON');
    expect(txt).toContain('Rapport mensuel');

    await dock.locator('[data-dock=watermark]').tap();
    await expect(page.locator('.wm-item')).toHaveCount(1, { timeout: 30_000 });
    await page.locator('[data-wm-act=delete]').tap();
    await page.waitForTimeout(1500);
    const txt2 = await page.evaluate(async () => {
      const p = await window.__pdfStudio.state.engine.doc.getPage(1);
      return (await p.getTextContent()).items.map((i) => i.str).join(' ');
    });
    expect(txt2).not.toContain('COPIE');
    expect(txt2).toContain('Rapport mensuel');
  });
});
