import { expect, test } from '@playwright/test';

async function openScanDemo(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homeDemoScan')).toBeVisible();
  await page.evaluate(() => document.querySelector('#homeDemoScan').click());
  await page.locator('#pdfCanvas').waitFor({ state: 'visible', timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio?.state?.numPages || 0), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(600);
}

/** Luminance moyenne de l'image affichée dans #pdfCanvas. */
async function canvasMeanLuma(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#pdfCanvas');
    const ctx = c.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    let count = 0;
    const step = Math.max(1, Math.floor((width * height) / 4000));
    for (let i = 0; i < width * height; i += step) {
      const p = i * 4;
      sum += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      count++;
    }
    return sum / Math.max(1, count);
  });
}

test('Nettoyer la feuille : applique « Magique » sur le PDF démo d’image, préserve le texte OCR et exporte un PDF cherchable', async ({
  page,
}) => {
  await openScanDemo(page);

  const lumaBefore = await canvasMeanLuma(page);

  // Simule le résultat OCR déjà posé sur la facture scannée
  await page.evaluate(() => {
    window.__pdfStudio.setOcrLines(1, [
      { id: 'ocr-1', text: 'ATELIER DU NORD', bbox: { x: 46, y: 760, w: 195, h: 20 } },
      { id: 'ocr-2', text: 'Facture n° 2026-0418', bbox: { x: 390, y: 762, w: 150, h: 16 } },
      { id: 'ocr-3', text: 'Total TTC : 1 428,00 EUR', bbox: { x: 350, y: 210, w: 190, h: 18 } },
    ]);
  });

  // Vérifie que les blocs OCR sont bien présents sur la page avant nettoyage
  await expect(page.locator('.line-block')).toHaveCount(3);
  const bboxBefore = await page
    .locator('.line-block')
    .first()
    .evaluate((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }));

  // Ouvre « Nettoyer la feuille » depuis le dock
  await page.evaluate(() => document.querySelector('#docDock [data-dock="clean"]').click());
  await expect(page.locator('#sheet [data-clean-preset]')).toHaveCount(8);

  // Vérifie le bouton « Comparer » (bascule côte à côte Avant / Après)
  await page.locator('#cleanCompare').click();
  await expect(page.locator('#cleanPreviewStage')).toHaveClass(/is-split/);
  await page.locator('#cleanCompare').click();
  await expect(page.locator('#cleanPreviewStage')).not.toHaveClass(/is-split/);

  // Sélectionne « Magique » et applique
  await page.locator('#sheet [data-clean-preset="magic"]').click();
  await page.locator('#cleanApply').click();

  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.preset || null))
    .toBe('magic');
  await page.waitForTimeout(400);

  // Le fond du scan est devenu nettement plus clair qu'avant
  const lumaAfter = await canvasMeanLuma(page);
  expect(lumaAfter).toBeGreaterThan(lumaBefore + 4);

  // Le texte OCR est resté présent exactement au même endroit
  await expect(page.locator('.line-block')).toHaveCount(3);
  const bboxAfter = await page
    .locator('.line-block')
    .first()
    .evaluate((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }));
  expect(bboxAfter).toEqual(bboxBefore);

  // Vérifie l'export PDF complet : ouverture du menu Exporter -> Télécharger le PDF
  await page.evaluate(() => document.querySelector('#btnExport').click());
  await expect(page.locator('#btnExportPdf')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => document.querySelector('#btnExportPdf').click());
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const ch of stream) chunks.push(ch);
  const exportedBuf = Buffer.concat(chunks);
  expect(exportedBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

  // Rouvre les octets du PDF exporté pour vérifier que l'image nettoyée ET le texte OCR y sont présents
  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await window.__pdfStudio.openPdfBytes(bytes, 'export-verifie.pdf', '', { readOnly: false, session: 'skip' });
  }, exportedBuf.toString('base64'));
  await page.waitForTimeout(500);

  const exportedCheck = await page.evaluate(async () => {
    const pg = await window.__pdfStudio.state.engine.getPage(1);
    const tc = await pg.getTextContent();
    return tc.items.map((i) => i.str).join(' ');
  });

  expect(exportedCheck).toContain('ATELIER DU NORD');
  expect(exportedCheck).toContain('Facture');
  expect(exportedCheck).toContain('1 428,00 EUR');
  const lumaExported = await canvasMeanLuma(page);
  expect(lumaExported).toBeGreaterThan(lumaBefore + 4);
});

test('Nettoyer la feuille : Annuler / Rétablir et « Revenir à l’original » restaurent le scan initial', async ({
  page,
}) => {
  await openScanDemo(page);

  await page.evaluate(() => window.__pdfStudio.openCleanSheet());
  await page.locator('#sheet [data-clean-preset="bw"]').click();
  await page.locator('#cleanApply').click();

  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.preset || null))
    .toBe('bw');

  // Annuler -> retour à l'état non nettoyé
  await page.evaluate(() => document.querySelector('#btnUndo').click());
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.preset || null))
    .toBeNull();

  // Rétablir -> retour au mode Noir et blanc
  await page.evaluate(() => document.querySelector('#btnRedo').click());
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.preset || null))
    .toBe('bw');

  // Bouton « Revenir à l'original » dans le panneau Nettoyer la feuille
  await page.evaluate(() => window.__pdfStudio.openCleanSheet());
  await expect(page.locator('#cleanReset')).toBeVisible();
  await page.locator('#cleanReset').click();
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.preset || null))
    .toBeNull();
});

test('Filigranes sur un scan : affiche l’avertissement honnête et atténue le filigrane de l’image', async ({
  page,
}) => {
  await openScanDemo(page);

  await page.evaluate(() => window.__pdfStudio.openWatermarkSheet());
  await expect(page.locator('#wmImgDisclaimer')).toBeVisible();
  const disclaimerText = await page.locator('#wmImgDisclaimer').textContent();
  expect(disclaimerText).toContain('atténué');
  expect(disclaimerText).toContain('pas supprimé parfaitement');

  // Change l'intensité et compare avant/après
  await page.locator('#wmImgIntensity').fill('80');
  await page.locator('#wmImgIntensity').dispatchEvent('input');
  await expect(page.locator('#wmImgIntensityVal')).toHaveText('80 %');

  await page.locator('#wmCompare').click();
  await expect(page.locator('#wmPreviewStage')).toHaveClass(/is-split/);

  await page.locator('#wmImgApply').click();
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.preset || null))
    .toBe('nowatermark');
});

test('Réglage « Qualité / taille » : garde Standard (JPEG 0,88) par défaut et Économique réduit nettement la taille', async ({
  page,
}) => {
  await openScanDemo(page);

  await page.evaluate(() => window.__pdfStudio.openCleanSheet());
  await expect(page.locator('#sheet [data-clean-quality="standard"]')).toHaveClass(/on/);

  // Applique en Haute qualité
  await page.locator('#sheet [data-clean-quality="high"]').click();
  await page.locator('#cleanApply').click();
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.qualityTier || null))
    .toBe('high');
  const highSize = await page.evaluate(() => window.__pdfStudio.state.cleanedPages[1].dataUrl.length);

  // Applique en Économique
  await page.evaluate(() => window.__pdfStudio.openCleanSheet());
  await page.locator('#sheet [data-clean-quality="eco"]').click();
  await page.locator('#cleanApply').click();
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.qualityTier || null))
    .toBe('eco');
  const ecoSize = await page.evaluate(() => window.__pdfStudio.state.cleanedPages[1].dataUrl.length);

  expect(ecoSize).toBeLessThan(highSize * 0.65);
});

test('Téléphone en 390 px de large : le bouton « Nettoyer » ne gêne pas la barre d’outils', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });

  // 1. Sur un PDF texte natif : « Nettoyer » reste caché dans la barre basse, les 6 outils principaux tiennent dans 390 px
  await page.evaluate(() => document.querySelector('#homeDemoText').click());
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(400);
  await expect(page.locator('#docDock [data-dock="clean"]')).toBeHidden();
  for (const id of ['edit', 'text', 'highlight', 'draw', 'sign', 'stamp']) {
    const inside = await page.locator(`#docDock [data-dock="${id}"]`).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= 390;
    });
    expect(inside, `texte 390px: ${id}`).toBe(true);
  }

  // 2. Sur un PDF scanné : « Nettoyer » ET les 6 outils principaux tiennent tous dans 390 px sans défilement gênant
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.querySelector('#homeDemoScan').click());
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio?.state?.scanPages?.length || 0), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(400);

  await expect(page.locator('#docDock [data-dock="clean"]')).toBeVisible();
  for (const id of ['edit', 'text', 'highlight', 'draw', 'sign', 'stamp', 'clean']) {
    const inside = await page.locator(`#docDock [data-dock="${id}"]`).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= 390;
    });
    expect(inside, `scan 390px: ${id}`).toBe(true);
  }
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
  expect(pageOverflow).toBe(true);
});

test('Filigrane de l’image traité après l’OCR : ne casse ni les blocs existants ni l’édition des blocs OCR', async ({
  page,
}) => {
  await openScanDemo(page);

  // 1. Pose la couche OCR sur le scan
  await page.evaluate(() => {
    window.__pdfStudio.setOcrLines(1, [
      { id: 'ocr-1', text: 'ATELIER DU NORD', bbox: { x: 46, y: 760, w: 195, h: 20 } },
      { id: 'ocr-2', text: 'Facture n° 2026-0418', bbox: { x: 390, y: 762, w: 150, h: 16 } },
      { id: 'ocr-3', text: 'Total TTC : 20 388,00 EUR', bbox: { x: 350, y: 210, w: 190, h: 18 } },
    ]);
  });
  await expect(page.locator('.line-block')).toHaveCount(3);

  // 2. Modifie d'abord un premier bloc OCR avant d'enlever le filigrane
  await page.locator('.line-block').nth(1).tap();
  await page.locator('.inline-text, .inline-textarea').first().waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const el = document.querySelector('.inline-text, .inline-textarea');
    el.focus();
    if (el.tagName === 'TEXTAREA') el.value = 'Facture n° 2026-0999';
    else el.textContent = 'Facture n° 2026-0999';
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#editDone').click());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pdfStudio.state.edits.length)).toBe(1);

  // 3. Traite ensuite le filigrane de l'image après l'OCR
  await page.evaluate(() => window.__pdfStudio.openWatermarkSheet());
  await expect(page.locator('#wmImgApply')).toBeVisible();
  await page.locator('#wmImgApply').click();
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.cleanedPages?.[1]?.preset || null))
    .toBe('nowatermark');
  await page.waitForTimeout(350);

  // 4. Les blocs restants et le bloc déjà modifié sont intacts ; un autre bloc OCR reste éditable
  await expect(page.locator('.edit-block')).toHaveCount(1);
  await expect(page.locator('.line-block')).toHaveCount(2);

  await page.locator('.line-block').first().tap();
  await page.locator('.inline-text, .inline-textarea').first().waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const el = document.querySelector('.inline-text, .inline-textarea');
    el.focus();
    if (el.tagName === 'TEXTAREA') el.value = 'ATELIER DU NORD SAS';
    else el.textContent = 'ATELIER DU NORD SAS';
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#editDone').click());
  await page.waitForTimeout(300);

  const editsTexts = await page.evaluate(() => window.__pdfStudio.state.edits.map((e) => e.text));
  expect(editsTexts).toEqual(['Facture n° 2026-0999', 'ATELIER DU NORD SAS']);
});
