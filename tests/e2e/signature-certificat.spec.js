import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { generateSelfSignedTestP12, verifySignedPdfBytes } from '../../src/pades.js';

async function buildUnsignedPdfBuffer() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Devis n° 2026-88', { x: 52, y: 760, size: 15, font });
  page.drawText('Ligne modifiable avant signature certifiée', { x: 52, y: 724, size: 12, font });
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

test.describe('Signature numérique certifiée (PAdES) dans Remplir et signer', () => {
  test('signe localement avec un certificat .p12 de test après modifications, affiche l’avertissement et ne persiste aucun secret', async ({
    page,
  }) => {
    await init(page);

    const externalRequests = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        externalRequests.push(url);
      }
    });

    const p12Password = 'mot-de-passe-ephemere-test-p12';
    const p12Bytes = generateSelfSignedTestP12({
      commonName: 'Claire Moreau (Test E2E)',
      organization: 'PDF Studio Local',
      password: p12Password,
    });

    await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
    await page.locator('#fileInput').setInputFiles({
      name: 'devis-a-signer.pdf',
      mimeType: 'application/pdf',
      buffer: await buildUnsignedPdfBuffer(),
    });

    // 1. Vérifie que « Signer avec un certificat » apparaît bien dans « Remplir et signer »
    await expect(page.locator('#docDock [data-dock="fillsign"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('#docDock [data-dock="fillsign"]').click();
    const certBtn = page.locator('#docDock [data-dock="certsign"]');
    await expect(certBtn).toBeVisible();
    await page.locator('#docDock [data-dock="done"]').click();

    // 2. Effectue une modification de texte avant la signature finale
    await expect(page.locator('#docDock [data-dock="edit"]')).toBeVisible();
    await page.locator('#docDock [data-dock="edit"]').click();
    await page.locator('#overlay .line-block').nth(1).click();
    const editor = page.locator('.inline-shell .inline-text');
    await expect(editor).toBeVisible();
    await editor.fill('Clause validée et figée avant signature PAdES');
    await page.locator('#editDone').click();

    // 3. Revient en lecture -> « Remplir et signer » -> « Signer avec un certificat »
    await page.locator('#btnDocMenu').click();
    await page.locator('#sheet [data-menu="read"], #sheet button').first().waitFor({ state: 'visible' });
    await page.evaluate(() => {
      // Utilise le bouton Signer de la barre ou revient en Remplir et signer
      document.querySelector('#sheetClose')?.click();
    });
    await page.locator('#docDock [data-dock="sign"]').click();
    await expect(page.locator('#sigOpenCert')).toBeVisible();
    await page.locator('#sigOpenCert').click();

    // 3. Vérifie que l'avertissement d'invalidation ultérieure et la mention locale sont bien affichés
    const warnBanner = page.locator('#certInvalidateWarn');
    await expect(warnBanner).toBeVisible();
    await expect(warnBanner).toContainText('invalidera la signature');

    // 4. Charge le certificat .p12 auto-signé généré à la volée + mot de passe
    await page.locator('#certFileInput').setInputFiles({
      name: 'certificat-test-ephemere.p12',
      mimeType: 'application/x-pkcs12',
      buffer: Buffer.from(p12Bytes),
    });
    await page.locator('#certPassword').fill(p12Password);
    await expect(page.locator('#certSummary')).toBeVisible();
    await expect(page.locator('#certSummary')).toContainText('Claire Moreau (Test E2E)');
    await page.locator('#certReason').fill('Bon pour accord définitif');
    await page.locator('#certLocation').fill('Paris');

    // 5. Signe et intercepte l'enregistrement final
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#certSubmitBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('devis-a-signer-signe.pdf');

    const dlPath = await download.path();
    const signedBytes = new Uint8Array(fs.readFileSync(dlPath));

    // 6. Vérifie la validité cryptographique PAdES et la présence de la modification préalable
    const verification = verifySignedPdfBytes(signedBytes);
    expect(verification.valid).toBe(true);
    expect(verification.subFilter).toBe('ETSI.CAdES.detached');
    expect(verification.canonicalOrder).toBe(true);
    expect(verification.hasSigningCertV2).toBe(true);
    expect(verification.signerSubject).toBe('Claire Moreau (Test E2E)');

    const parsedDoc = await pdfjsLib.getDocument({ data: signedBytes, isEvalSupported: false }).promise;
    const p1 = await parsedDoc.getPage(1);
    const tc = await p1.getTextContent();
    const fullText = tc.items.map((i) => i.str).join(' ');
    expect(fullText).toContain('Clause validée et figée avant signature PAdES');
    expect(fullText).not.toContain('Ligne modifiable avant signature certifiée');
    await parsedDoc.destroy();

    // 7. Vérifie qu'aucun secret n'a été envoyé sur le réseau ni sauvegardé dans le stockage navigateur
    expect(externalRequests).toEqual([]);
    const storageDump = await page.evaluate((pwd) => {
      const dump = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        dump.push(`${k}=${localStorage.getItem(k)}`);
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        dump.push(`${k}=${sessionStorage.getItem(k)}`);
      }
      const joined = dump.join('\n');
      return {
        hasPassword: joined.includes(pwd),
        hasCertSubject: joined.includes('Claire Moreau (Test E2E)'),
      };
    }, p12Password);
    expect(storageDump.hasPassword).toBe(false);
    expect(storageDump.hasCertSubject).toBe(false);
  });
});
