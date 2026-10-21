import { expect, test } from '@playwright/test';
import zlib from 'node:zlib';
import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, setTextRenderingMode } from 'pdf-lib';

// Scan simulé : un aplat gris (l'« image ») + texte invisible en Courier par-dessus.
async function scanPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const f = await doc.embedFont(StandardFonts.Courier);
  page.drawRectangle({ x: 20, y: 100, width: 360, height: 40, color: rgb(0.95, 0.95, 0.9) });
  page.pushOperators(pushGraphicsState(), setTextRenderingMode(3));
  page.drawText('les caracteristiques de votre compte', { x: 30, y: 120, size: 12, font: f });
  page.pushOperators(popGraphicsState());
  return Buffer.from(await doc.save());
}

test('couche de texte cachée (Courier) : l’édition propose une police sans empattement', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await page.locator('#fileInput').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: await scanPdf() });
  await page.locator('#readEdit').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('#readEdit').tap();
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.locator('.line-block').first().tap();
  await page.locator('.inline-shell').waitFor({ state: 'visible' });
  const fam = await page.locator('.inline-shell').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fam.toLowerCase()).not.toMatch(/courier|mono/);
  expect(fam.toLowerCase()).toMatch(/helvetica|arial|sans/);
});

// PNG uni (RGB) sans dépendance : suffisant pour simuler l'image d'un scan.
function solidPng(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function coveredTextPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  const f = await doc.embedFont(StandardFonts.Courier);
  page.drawText('les caracteristiques de votre compte', { x: 30, y: 120, size: 12, font: f, color: rgb(0, 0, 0) });
  const img = await doc.embedPng(solidPng(8, 4, [250, 250, 245]));
  page.drawImage(img, { x: 0, y: 0, width: 400, height: 200 });
  return Buffer.from(await doc.save());
}

test('texte caché sous l’image du scan : même résultat (sans Courier)', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
      localStorage.setItem('pdf-studio-lang', 'fr');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/?open=home', { waitUntil: 'domcontentloaded' });
  await page.locator('#fileInput').setInputFiles({ name: 'scan2.pdf', mimeType: 'application/pdf', buffer: await coveredTextPdf() });
  await page.locator('#readEdit').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('#readEdit').tap();
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.locator('.line-block').first().tap();
  await page.locator('.inline-shell').waitFor({ state: 'visible' });
  const fam = await page.locator('.inline-shell').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fam.toLowerCase()).not.toMatch(/courier|mono/);
});
