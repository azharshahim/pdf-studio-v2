import { expect, test } from '@playwright/test';

/**
 * États grisés : après validation, annulation ou changement de ligne, aucun
 * élément ne doit rester atténué (opacité < 1, filtre) ou désactivé à tort.
 *
 * Un test par cas. Les mesures portent sur les styles calculés réels
 * (opacité, filtre, `disabled`), pas sur des classes.
 */

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
  // Panneau de bienvenue : il peut masquer le document sur un profil neuf.
  const skip = page.locator('#onboardSkip, [data-onboard="skip"]');
  if (await skip.count()) await skip.first().click().catch(() => {});
}

async function openDemo(page, sel, waitFor) {
  await gotoApp(page);
  await page.evaluate((s) => document.querySelector(s).click(), sel);
  await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(700);
}

/** Le dialogue « Reprendre le travail ? » peut s'ouvrir si une session vient
 * d'être enregistrée pour ce même PDF : on accepte et on continue. */
async function dismissResume(page) {
  const dialog = page.locator('#resumeDialog');
  if (await dialog.isVisible().catch(() => false)) {
    await page.locator('#resumeYes').click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function tapBlock(page, selector, index = 0) {
  const el = page.locator(selector).nth(index);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  // `tap()` vérifie que la cible est bien atteignable (pas masquée par la
  // barre d'outils) et envoie de vrais événements tactiles.
  await el.tap();
  await page.waitForTimeout(550);
}

async function typeInEditor(page, text) {
  await page.locator('.inline-text, .inline-textarea').first().waitFor({ state: 'visible' });
  await page.evaluate((value) => {
    const el = document.querySelector('.inline-text, .inline-textarea');
    el.focus();
    if (el.tagName === 'TEXTAREA') el.value = value;
    else el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(250);
}

const measure = (page) =>
  page.evaluate(() => {
    const dim = (el) => {
      const s = getComputedStyle(el);
      return {
        opacity: Number(s.opacity),
        filtered: s.filter !== 'none',
        color: s.color,
        text: (el.textContent || '').slice(0, 40),
      };
    };
    const btn = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      return { disabled: el.disabled, opacity: Number(getComputedStyle(el).opacity) };
    };
    return {
      editing: document.body.classList.contains('editing'),
      formatbarOpen: !document.getElementById('formatbar').hidden,
      lines: [...document.querySelectorAll('.line-block')].map(dim),
      blocks: [...document.querySelectorAll('.edit-block')].map(dim),
      texts: [...document.querySelectorAll('.edit-text')].map(dim),
      editorColor: document.querySelector('.inline-text')
        ? getComputedStyle(document.querySelector('.inline-text')).color
        : null,
      save: btn('btnSave'),
      undo: btn('btnUndo'),
      redo: btn('btnRedo'),
      editUndo: btn('editUndo'),
      editRedo: btn('editRedo'),
      fmtDisabled: [...document.querySelectorAll('#formatbar .fmt-btn')].filter((b) => b.disabled).length,
      edits: window.__pdfStudio.state.edits.length,
      active: !!window.__pdfStudio.state.active,
    };
  });

/** Aucune ligne, aucun bloc, aucun texte modifié atténué. */
function expectNothingDimmed(state) {
  for (const item of [...state.lines, ...state.blocks, ...state.texts]) {
    expect(item.opacity, `opacité de « ${item.text} »`).toBe(1);
    expect(item.filtered, `filtre sur « ${item.text} »`).toBe(false);
  }
}

/** Boutons d'action actifs (hors « rétablir », légitimement inactif sans redo). */
function expectButtonsUsable(state) {
  expect(state.save?.disabled, 'Enregistrer').toBe(false);
  expect(state.undo?.disabled, 'Annuler').toBe(false);
  expect(state.editUndo?.disabled, 'Annuler (barre)').toBe(false);
  expect(state.fmtDisabled, 'boutons de mise en forme désactivés').toBe(0);
}

test.describe('États grisés', () => {
  test.beforeEach(({ browserName }) => {
    test.slow(browserName === 'webkit', 'Rendu et initialisation OCR plus lents sous WebKit en CI');
  });

  test('valider une modification ne grise ni la ligne ni les boutons', async ({ page }) => {
    await openDemo(page, '#homeDemoText', '.line-block');
    await tapBlock(page, '.line-block', 2);
    await typeInEditor(page, 'Ligne validée');
    await page.evaluate(() => document.querySelector('#editDone').click());
    await page.waitForTimeout(700);

    const state = await measure(page);
    expectNothingDimmed(state);
    expectButtonsUsable(state);
    expect(state.editing).toBe(false);
    expect(state.formatbarOpen).toBe(false);
    await expect(page.locator('.edit-text')).toHaveText('Ligne validée');
  });

  test('annuler une modification validée ne laisse rien de grisé', async ({ page }) => {
    await openDemo(page, '#homeDemoText', '.line-block');
    await tapBlock(page, '.line-block', 3);
    await typeInEditor(page, 'Texte à annuler');
    await page.evaluate(() => document.querySelector('#editDone').click());
    await page.waitForTimeout(700);

    // « Annuler » revient à la ligne d'origine : aucun bloc superposé.
    await page.locator('#btnUndo').click();
    await page.waitForTimeout(800);

    const state = await measure(page);
    expect(state.edits, 'modification annulée').toBe(0);
    expect(state.blocks).toHaveLength(0);
    expectNothingDimmed(state);
    expect(state.undo?.disabled, 'plus rien à annuler').toBe(true);
    expect(state.redo?.disabled, 'rétablissement possible').toBe(false);
    expect(state.save?.disabled).toBe(false);
    expect(state.editing).toBe(false);
    expect(state.formatbarOpen).toBe(false);
  });

  test('retoucher la même ligne remet la mise en forme active, sans grisé', async ({ page }) => {
    await openDemo(page, '#homeDemoText', '.line-block');
    await tapBlock(page, '.line-block', 2);
    await typeInEditor(page, 'Première passe');
    await page.evaluate(() => document.querySelector('#editDone').click());
    await page.waitForTimeout(600);

    await tapBlock(page, '.edit-block', 0);
    const state = await measure(page);
    expect(state.active).toBe(true);
    expect(state.formatbarOpen).toBe(true);
    expect(state.fmtDisabled, 'boutons de mise en forme').toBe(0);
    expect(state.editorColor, 'couleur du texte en cours d’édition').toBe('rgb(20, 23, 38)');
    expectNothingDimmed({ ...state, texts: [] });
    expect(state.edits).toBe(1);
  });

  test('retoucher une autre ligne ne grise pas la précédente', async ({ page }) => {
    await openDemo(page, '#homeDemoText', '.line-block');
    await tapBlock(page, '.line-block', 2);
    await typeInEditor(page, 'Ligne A');
    await page.evaluate(() => document.querySelector('#editDone').click());
    await page.waitForTimeout(600);

    await tapBlock(page, '.line-block', 5);
    await typeInEditor(page, 'Ligne B');
    await page.evaluate(() => document.querySelector('#editDone').click());
    await page.waitForTimeout(700);

    const state = await measure(page);
    expect(state.edits).toBe(2);
    expectNothingDimmed(state);
    expectButtonsUsable(state);
    expect(state.formatbarOpen).toBe(false);
  });

  test('scan OCR : le fond gris n’atténue pas le texte modifié', async ({ page }) => {
    await openDemo(page, '#homeDemoScan', '#pdfCanvas');
    // OCR simulé (la reconnaissance complète prend plusieurs minutes).
    await page.evaluate(() =>
      window.__pdfStudio.setOcrLines(1, [
        {
          text: 'Facture n° 2024-118',
          bbox: { x: 48, y: 90, w: 330, h: 26 },
          fontSize: 16,
        },
      ])
    );
    await expect(page.locator('.line-block.ocr')).toHaveCount(1);
    await dismissResume(page);
    await tapBlock(page, '.line-block.ocr', 0);
    await typeInEditor(page, 'Facture n° 2024-119');
    await page.evaluate(() => document.querySelector('#editDone').click());
    await page.waitForTimeout(700);

    const state = await measure(page);
    expectNothingDimmed(state);
    expectButtonsUsable(state);

    // Contraste : texte sombre sur le fond clair copié du scan.
    const contrast = await page.evaluate(() => {
      const text = document.querySelector('.edit-text');
      const block = document.querySelector('.edit-block');
      const parse = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const a = lum(parse(getComputedStyle(text).color));
      const b = lum(parse(getComputedStyle(block).backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThan(4.5);
  });
});
