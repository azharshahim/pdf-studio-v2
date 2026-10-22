import { expect, test } from '@playwright/test';

async function openDemo(page) {
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
  await page.evaluate(() => document.querySelector('#homeDemoText').click());
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(700);
}

async function editFirstLine(page, text) {
  await page.locator('.line-block').nth(2).tap();
  await page.locator('.inline-text, .inline-textarea').first().waitFor({ state: 'visible' });
  await page.evaluate((value) => {
    const el = document.querySelector('.inline-text, .inline-textarea');
    el.focus();
    if (el.tagName === 'TEXTAREA') el.value = value;
    else el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('#editDone').click());
  await page.waitForTimeout(600);
}

const counts = (page) =>
  page.evaluate(() => ({ edits: window.__pdfStudio.state.edits.length, marks: window.__pdfStudio.markup.objects.length }));

test('Annuler / Rétablir suivent l’ordre réel : texte puis annotation', async ({ page }) => {
  await openDemo(page);
  await editFirstLine(page, 'Texte modifié');
  await page.evaluate(() =>
    window.__pdfStudio.addTestMarkup({ id: 'm1', page: 1, type: 'rect', bbox: { x: 50, y: 500, w: 100, h: 30 }, color: '#ff0000', width: 2 })
  );
  expect(await counts(page)).toEqual({ edits: 1, marks: 1 });
  await page.evaluate(() => document.querySelector('#btnUndo').click());
  await expect.poll(() => counts(page)).toEqual({ edits: 1, marks: 0 });
  await page.evaluate(() => document.querySelector('#btnUndo').click());
  await expect.poll(() => counts(page)).toEqual({ edits: 0, marks: 0 });
  await page.evaluate(() => document.querySelector('#btnRedo').click());
  await expect.poll(() => counts(page)).toEqual({ edits: 1, marks: 0 });
  await page.evaluate(() => document.querySelector('#btnRedo').click());
  await expect.poll(() => counts(page)).toEqual({ edits: 1, marks: 1 });
});

test('Compresser / Protéger / Convertir partent du document modifié', async ({ page }) => {
  await openDemo(page);
  await editFirstLine(page, 'Texte modifié 987');
  const text = await page.evaluate(async () => {
    const src = await window.__pdfStudio.currentDocumentSource();
    try {
      const pg = await src.engine.getPage(1);
      const tc = await pg.getTextContent();
      return tc.items.map((i) => i.str).join(' ');
    } finally {
      src.dispose();
    }
  });
  expect(text).toContain('Texte modifié 987');
});

test('lecture : le texte de la page est sélectionnable et copiable', async ({ page }) => {
  await openDemo(page);
  await page.evaluate(() => document.querySelector('#editDone')?.click());
  // Passe en lecture seule via le menu du document.
  await page.evaluate(() => window.__pdfStudio.setReadMode?.(true));
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('reading'))).toBe(true);
  await expect(page.locator('.read-text-layer span').first()).toBeAttached();
  const copied = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.read-text-layer span')];
    const range = document.createRange();
    range.setStartBefore(spans[0]);
    range.setEndAfter(spans[Math.min(2, spans.length - 1)]);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return { text: sel.toString(), first: spans[0].textContent };
  });
  expect(copied.text).toContain(copied.first.trim());
});

test('lecture : défiler au-delà du bas de la page passe à la page suivante', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'molette : Chromium');
  await openDemo(page);
  await page.evaluate(() => document.querySelector('#editDone')?.click());
  const pages = await page.evaluate(() => window.__pdfStudio.state.numPages);
  test.skip(pages < 2, 'document de démonstration à une seule page');
  await page.evaluate(() => window.__pdfStudio.setReadMode(true));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const sc = document.getElementById('canvasScroll');
    sc.scrollTop = sc.scrollHeight;
  });
  await page.mouse.move(300, 400);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.pageIndex)).toBe(1);
});
