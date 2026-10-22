import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Outils : signature, tampons, surlignage, formulaire.
 *
 * Chaque cas est joué au doigt sur un écran 390 × 844, une capture est
 * enregistrée, puis le PDF exporté est **rouvert avec pdf.js** pour vérifier
 * que l'élément est bien présent dans le fichier (et pas seulement à l'écran).
 */

const CAPTURES = path.join(process.cwd(), 'test-results', 'captures', 'v2.5');

async function gotoApp(page) {
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
}

async function openTextDemo(page) {
  await gotoApp(page);
  await page.evaluate(() => document.querySelector('#homeDemoText').click());
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(700);
}

/** Ouvre l'onglet Outils puis l'outil demandé. */
async function openTool(page, id) {
  await page.evaluate(() => document.querySelector('[data-route="tools"]')?.click());
  await page.waitForTimeout(500);
  const card = page.locator(`#toolsGrid [data-tool="${id}"]`).first();
  await card.waitFor({ state: 'visible' });
  await card.click();
  await page.waitForTimeout(700);
}

/** Déplacement/redimensionnement au doigt (événements pointeur réels). */
async function drag(page, selector, dx, dy) {
  await page.evaluate(
    ({ sel, dx: mx, dy: my }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`cible absente : ${sel}`);
      const r = el.getBoundingClientRect();
      const x0 = r.x + r.width / 2;
      const y0 = r.y + r.height / 2;
      const opts = (x, y) => ({
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
      });
      el.dispatchEvent(new PointerEvent('pointerdown', opts(x0, y0)));
      // Plusieurs pas, comme un vrai glissement.
      for (let i = 1; i <= 6; i += 1) {
        window.dispatchEvent(new PointerEvent('pointermove', opts(x0 + (mx * i) / 6, y0 + (my * i) / 6)));
      }
      window.dispatchEvent(new PointerEvent('pointerup', opts(x0 + mx, y0 + my)));
    },
    { sel: selector, dx, dy }
  );
  await page.waitForTimeout(400);
}

/** Glissement sur la page (surlignage, tracé libre). */
async function dragOnPage(page, from, to) {
  await page.evaluate(
    ({ from: a, to: b }) => {
      const target = document.elementFromPoint(a.x, a.y) || document.querySelector('#overlay');
      const opts = (x, y) => ({
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        pointerId: 3,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
      });
      target.dispatchEvent(new PointerEvent('pointerdown', opts(a.x, a.y)));
      for (let i = 1; i <= 8; i += 1) {
        window.dispatchEvent(
          new PointerEvent('pointermove', opts(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8))
        );
      }
      window.dispatchEvent(new PointerEvent('pointerup', opts(b.x, b.y)));
    },
    { from, to }
  );
  await page.waitForTimeout(450);
}

/** Exporte le PDF courant (octets) et le dépose dans un fichier temporaire. */
async function exportToFile(page) {
  const b64 = await page.evaluate(async () => {
    const res = await window.__pdfStudio.exportPdf({
      sourceBytes: window.__pdfStudio.state.bytes,
      edits: window.__pdfStudio.state.edits,
      ocrPages: [],
      objects: window.__pdfStudio.markup.objects,
    });
    const bytes = new Uint8Array(res.bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(out);
  });
  const file = path.join(os.tmpdir(), `studio-pdf-outils-${Date.now()}.pdf`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

/** Rouvre le PDF avec pdf.js et rend ce qu'il contient réellement. */
async function inspectPdf(file) {
  // Import paresseux : pdf.js en Node installe des globals qu'il vaut mieux
  // charger seulement au moment de l'inspection.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const ops = await page.getOperatorList();
  const fills = [];
  ops.fnArray.forEach((fn, i) => {
    if (fn !== pdfjs.OPS.setFillRGBColor) return;
    // pdf.js donne soit [r, g, b], soit ["#rrggbb"].
    const arg = ops.argsArray[i];
    const value = Array.isArray(arg) && typeof arg[0] === 'string' ? arg[0] : arg;
    fills.push(value);
  });
  const fields = await doc.getFieldObjects();
  return {
    text: content.items.map((it) => it.str).join(' '),
    images: ops.fnArray.filter(
      (fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject
    ).length,
    fills,
    fields,
    pages: doc.numPages,
  };
}

const objects = (page) => page.evaluate(() => window.__pdfStudio.markup.objects.map((o) => ({ ...o, src: undefined })));

test.beforeAll(() => {
  fs.mkdirSync(CAPTURES, { recursive: true });
});

test.describe('Outils', () => {
  test('signature dessinée au doigt : placer, déplacer, redimensionner', async ({ page }) => {
    await openTextDemo(page);
    await openTool(page, 'sign');

    // Tracé au doigt sur le pavé de signature.
    const pad = await page.locator('#sigPad').boundingBox();
    // Glissement réel : le pavé capture le pointeur, il faut donc de vrais
    // événements (un PointerEvent synthétique sans pointeur actif est ignoré).
    const pts = [
      [pad.x + pad.width * 0.12, pad.y + pad.height * 0.68],
      [pad.x + pad.width * 0.28, pad.y + pad.height * 0.28],
      [pad.x + pad.width * 0.45, pad.y + pad.height * 0.72],
      [pad.x + pad.width * 0.62, pad.y + pad.height * 0.32],
      [pad.x + pad.width * 0.8, pad.y + pad.height * 0.62],
    ];
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    for (const [px, py] of pts.slice(1)) {
      await page.mouse.move(px, py, { steps: 8 });
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURES, 'outil-signature-pave.png') });

    await page.locator('#sigSaveDraw').click();
    await page.waitForTimeout(900);

    const placed = await objects(page);
    expect(placed).toHaveLength(1);
    expect(placed[0].type).toBe('signature');
    const before = placed[0].bbox;

    // Déplacer puis redimensionner avec les poignées.
    await drag(page, '[data-mk-handle="move"]', 40, -30);
    const moved = (await objects(page))[0].bbox;
    expect(Math.abs(moved.x - before.x)).toBeGreaterThan(1);
    expect(Math.abs(moved.y - before.y)).toBeGreaterThan(1);

    await drag(page, '[data-mk-handle="resize"]', 30, 20);
    const resized = (await objects(page))[0].bbox;
    expect(Math.abs(resized.w - moved.w)).toBeGreaterThan(1);

    await page.screenshot({ path: path.join(CAPTURES, 'outil-signature.png') });

    const pdf = await inspectPdf(await exportToFile(page));
    expect(pdf.images, 'image de signature dans le PDF').toBeGreaterThan(0);
  });

  test('tampon « Approuvé »', async ({ page }) => {
    await openTextDemo(page);
    await openTool(page, 'stamp');
    await page.locator('[data-stamp="approved"]').click();
    await page.waitForTimeout(600);

    const placed = await objects(page);
    expect(placed[0].type).toBe('stamp');
    await page.screenshot({ path: path.join(CAPTURES, 'outil-tampon-approuve.png') });

    const pdf = await inspectPdf(await exportToFile(page));
    expect(pdf.text).toContain('APPROUVÉ');
  });

  test('tampon date', async ({ page }) => {
    await openTextDemo(page);
    await openTool(page, 'stamp');
    await page.locator('[data-stamp="date"]').click();
    await page.waitForTimeout(600);

    const placed = await objects(page);
    expect(placed[0].type).toBe('date');
    const label = placed[0].text;
    expect(label.length).toBeGreaterThan(4);
    await page.screenshot({ path: path.join(CAPTURES, 'outil-tampon-date.png') });

    const pdf = await inspectPdf(await exportToFile(page));
    expect(pdf.text).toContain(label);
  });

  test('surlignage jaune d’une phrase', async ({ page }) => {
    await openTextDemo(page);
    await openTool(page, 'annotate');
    await page.locator('[data-anno-tool="highlight"]').click();
    await page.waitForTimeout(300);

    // Surligne la ligne la plus large, du début à la fin.
    const line = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.line-block')];
      els.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
      const r = els[0].getBoundingClientRect();
      return { x1: r.x + 2, x2: r.right - 2, y: r.y + r.height / 2 };
    });
    await dragOnPage(page, { x: line.x1, y: line.y }, { x: line.x2, y: line.y });

    const placed = await objects(page);
    expect(placed).toHaveLength(1);
    expect(placed[0].type).toBe('highlight');
    expect(placed[0].color).toBe('#fde047');
    await page.screenshot({ path: path.join(CAPTURES, 'outil-surlignage.png') });

    const pdf = await inspectPdf(await exportToFile(page));
    // Le jaune #fde047 est bien une couleur de remplissage du PDF (opacité 0,38).
    // pdf.js renvoie « #fde047 » ; on accepte aussi la forme [r, g, b].
    const yellow = pdf.fills.some((c) =>
      typeof c === 'string'
        ? c.toLowerCase() === '#fde047'
        : c[0] > 0.9 && c[1] > 0.8 && c[2] < 0.4
    );
    expect(yellow, 'rectangle jaune dans le PDF').toBe(true);
  });

  test('champ de formulaire rempli', async ({ page }) => {
    await gotoApp(page);
    const bytes = await page.evaluate(async () => {
      const raw = await window.__pdfStudio.makeFormSample();
      let out = '';
      for (let i = 0; i < raw.length; i += 0x8000) {
        out += String.fromCharCode.apply(null, raw.subarray(i, i + 0x8000));
      }
      return btoa(out);
    });
    await page.evaluate(async (b64) => {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await window.__pdfStudio.openPdfBytes(raw, 'formulaire.pdf');
    }, bytes);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.numPages)).toBe(1);
    await page.waitForTimeout(800);

    await openTool(page, 'form');
    const field = page.locator('[data-form-field="nom"]');
    await field.waitFor({ state: 'visible' });
    await field.fill('Awa Diop');
    await page.screenshot({ path: path.join(CAPTURES, 'outil-formulaire-saisie.png') });

    await page.locator('#formValidate').click();
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.formValues.nom)).toBe('Awa Diop');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(CAPTURES, 'outil-formulaire.png') });

    const pdf = await inspectPdf(await exportToFile(page));
    // pdf.js liste le champ parent puis son widget : la valeur est sur le widget.
    const nom = (pdf.fields?.nom || []).find((f) => 'value' in f);
    expect(nom?.value, 'valeur du champ « nom » dans le PDF').toBe('Awa Diop');
  });
});
