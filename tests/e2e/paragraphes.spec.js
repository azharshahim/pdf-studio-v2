import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function buildParagraphPdfBuffer() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  page.drawText('Attestation de prestation', { x: 56, y: 775, size: 16, font: bold, color: rgb(0.08, 0.1, 0.16) });
  page.drawText('Le prestataire certifie avoir réalisé la mission décrite dans le cahier', {
    x: 56,
    y: 735,
    size: 11.5,
    font,
    color: rgb(0.1, 0.12, 0.16),
  });
  page.drawText('des charges validé par les deux parties lors de la réunion initiale et', {
    x: 56,
    y: 719,
    size: 11.5,
    font,
    color: rgb(0.1, 0.12, 0.16),
  });
  page.drawText('livrée dans les délais convenus.', {
    x: 56,
    y: 703,
    size: 11.5,
    font,
    color: rgb(0.1, 0.12, 0.16),
  });
  page.drawText('Fait à Paris, pour servir et valoir ce que de droit.', {
    x: 56,
    y: 660,
    size: 11.5,
    font,
    color: rgb(0.1, 0.12, 0.16),
  });
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

test.describe('Reflux d’un paragraphe entier en mode Modifier', () => {
  test('par défaut : paragraphe sur PC, ligne sur téléphone, avec bascule dans le panneau Modifier', async ({ page }) => {
    await init(page);
    const buffer = await buildParagraphPdfBuffer();

    // 1. Téléphone (393x851) -> par défaut « Par ligne »
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'paragraphe.pdf',
      mimeType: 'application/pdf',
      buffer,
    });
    await expect(page.locator('#docDock [data-dock="edit"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('#docDock [data-dock="edit"]').click();

    await expect.poll(async () => page.evaluate(() => window.__pdfStudio.currentEditGranularity())).toBe('line');
    await expect(page.locator('#overlay .line-block.para-block')).toHaveCount(0);
    await expect(page.locator('#overlay .line-block')).toHaveCount(5);

    // Bascule vers « Modifier par paragraphe » via le bouton du mode Modifier sur téléphone
    await page.locator('#btnEditGranularity').click();
    await expect.poll(async () => page.evaluate(() => window.__pdfStudio.currentEditGranularity())).toBe('paragraph');
    await expect(page.locator('#overlay .line-block.para-block')).toHaveCount(1);
    await expect(page.locator('#overlay .line-block')).toHaveCount(3);

    // 2. PC (1280x800) sur une session fraîche -> par défaut « Modifier par paragraphe »
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'paragraphe-pc.pdf',
      mimeType: 'application/pdf',
      buffer,
    });
    await expect(page.locator('#docDock [data-dock="edit"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('#docDock [data-dock="edit"]').click();
    await expect(page.locator('#editPanel')).toBeVisible();
    await expect(page.locator('#editPanel [data-edit-granularity="paragraph"]')).toHaveClass(/active/);
    await expect(page.locator('#overlay .line-block.para-block')).toHaveCount(1);
  });

  test('éditer un paragraphe fait refluer les mots et l’export PDF respecte les retours à la ligne', async ({ page }) => {
    await init(page);
    const buffer = await buildParagraphPdfBuffer();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'paragraphe-reflux.pdf',
      mimeType: 'application/pdf',
      buffer,
    });
    await expect(page.locator('#docDock [data-dock="edit"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('#docDock [data-dock="edit"]').click();

    const paraBlock = page.locator('#overlay .line-block.para-block').first();
    await expect(paraBlock).toBeVisible();
    await paraBlock.click();

    const editor = page.locator('.inline-shell .inline-text');
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('Le prestataire certifie avoir réalisé la mission');
    await expect(editor).toContainText('livrée dans les délais convenus.');

    const updatedParagraph =
      'Le prestataire certifie avoir intégralement exécuté la prestation prévue au contrat cadre, avec validation complète des livrables techniques et documentaires par le comité de suivi réuni à la clôture du projet.';
    await editor.fill(updatedParagraph);

    const snap = await page.evaluate(() => {
      const e = window.__pdfStudio.state.edits[0];
      return {
        paragraph: !!e?.paragraph,
        wrap: !!e?.wrap,
        origCount: e?.origBboxes?.length || 0,
        wrappedLines: e?.wrappedLines || [],
      };
    });
    expect(snap.paragraph).toBe(true);
    expect(snap.wrap).toBe(true);
    expect(snap.origCount).toBe(3);
    expect(snap.wrappedLines.length).toBeGreaterThanOrEqual(3);

    // Exporte le PDF et vérifie que chaque ligne à l'écran se retrouve telle quelle dans le PDF exporté
    const exportedCheck = await page.evaluate(async () => {
      const { exportPdf } = await import('/src/exporter.js');
      const { PdfEngine } = await import('/src/pdfEngine.js');
      const src = await window.__pdfStudio.currentDocumentSource();
      const { bytes: outBytes } = await exportPdf({
        sourceBytes: src.bytes,
        edits: window.__pdfStudio.state.edits,
      });
      src.dispose();
      const eng = new PdfEngine(outBytes);
      await eng.load();
      const lines = await eng.extractLines(1);
      const texts = lines.map((l) => l.text.trim());
      eng.destroy();
      return {
        texts,
        expectedWrapped: window.__pdfStudio.state.edits[0].wrappedLines,
      };
    });

    const joined = exportedCheck.texts.join(' ');
    expect(joined).toContain('Attestation de prestation');
    expect(joined).toContain('Fait à Paris');
    expect(joined).not.toContain('réunion initiale');
    expect(joined).not.toContain('délais convenus');
    for (const wl of exportedCheck.expectedWrapped) {
      expect(exportedCheck.texts).toContain(wl.trim());
    }
  });
});
