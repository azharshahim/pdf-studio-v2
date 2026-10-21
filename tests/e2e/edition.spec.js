import { expect, test } from '@playwright/test';

/**
 * Édition directe sur la page — parcours de bout en bout.
 *
 * Chaque test part d'un document neuf (PDF d'exemple) et tape réellement sur
 * la page avec un écran tactile 390 × 844. Les assertions portent sur le
 * curseur, le texte inséré, la validation, l'annulation et la vue retrouvée.
 */

const TAP_SETTLE = 400;

async function gotoApp(page) {
  // L'écran de bienvenue est un panneau animé : on le neutralise à la source
  // (drapeau de première visite) plutôt que de cliquer dessus.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pdf-studio-onboarded', '1');
    } catch {
      /* stockage indisponible */
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homeDemoText')).toBeVisible();
}

async function openDemo(page, id, waitFor) {
  await gotoApp(page);
  // Clic direct : les tests portent sur la page, pas sur les animations
  // d'accueil qui empêchent Playwright de considérer le bouton « stable ».
  await page.evaluate((sel) => document.querySelector(sel).click(), id);
  await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(600);
}

async function openTextDemo(page) {
  await openDemo(page, '#homeDemoText', '.line-block');
}

async function openScanDemo(page) {
  await gotoApp(page);
  await page.evaluate((sel) => document.querySelector(sel).click(), '#homeDemoScan');
  // Un scan n'a pas de couche texte : on attend que le document soit chargé.
  await expect
    .poll(() => page.evaluate(() => window.__pdfStudio.state.numPages), { timeout: 60_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(800);
}

/** Ligne d'origine la plus large de la page courante. */
async function longestLine(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('.line-block')];
    els.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    const el = els[0];
    const r = el.getBoundingClientRect();
    return {
      id: el.dataset.lineId,
      text: el.title,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  });
}

/** Index de caractère attendu sous le point touché, mesuré au canevas. */
async function expectedIndex(page, { text, fraction, fontSizePx, fontFamily }) {
  return page.evaluate(
    ({ text, fraction, fontSizePx, fontFamily }) => {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `400 ${fontSizePx}px ${fontFamily}`;
      const total = Math.max(1, ctx.measureText(text).width);
      const target = total * fraction;
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i <= text.length; i += 1) {
        const width = ctx.measureText(text.slice(0, i)).width;
        const distance = Math.abs(width - target);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      return { index: best, totalWidth: total };
    },
    { text, fraction, fontSizePx, fontFamily }
  );
}

/**
 * Touche une ligne à une fraction de sa largeur et attend l'ouverture du
 * champ. Renvoie la position du curseur et le texte du bloc.
 */
async function tapLine(page, fraction = 0.5, selector = '.line-block') {
  const info = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    els.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    const el = els[0];
    const r = el.getBoundingClientRect();
    return {
      id: el.dataset.lineId || el.dataset.editId,
      text: el.title || el.textContent,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  }, selector);

  const x = info.rect.x + info.rect.w * fraction;
  const y = info.rect.y + info.rect.h / 2;
  await page.touchscreen.tap(x, y);
  await page.locator('.inline-text').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(TAP_SETTLE);

  const editor = await readEditor(page);
  return { ...info, x, y, editor };
}

async function readEditor(page) {
  return page.evaluate(() => {
    const t = document.querySelector('.inline-text');
    if (!t) return null;
    const shell = t.closest('.inline-shell');
    const isArea = t.tagName === 'TEXTAREA';
    const sel = window.getSelection();
    return {
      tag: t.tagName,
      surface: shell?.dataset.surface,
      samsung: shell?.dataset.samsung,
      text: isArea ? t.value : t.textContent,
      length: (isArea ? t.value : t.textContent).length,
      offset: isArea ? t.selectionStart : sel?.anchorOffset ?? -1,
      endOffset: isArea ? t.selectionEnd : sel?.focusOffset ?? -1,
      collapsed: isArea ? t.selectionStart === t.selectionEnd : !!sel?.isCollapsed,
      selection: isArea ? t.value.slice(t.selectionStart, t.selectionEnd) : sel?.toString() ?? '',
    };
  });
}

/** Vue courante : zoom et défilement du canevas. */
async function readView(page) {
  return page.evaluate(() => {
    const scroller = document.getElementById('canvasScroll');
    return {
      zoom: window.__pdfStudio.state.zoom,
      left: Math.round(scroller.scrollLeft),
      top: Math.round(scroller.scrollTop),
      edits: window.__pdfStudio.state.edits.length,
    };
  });
}

test.describe('curseur au point touché', () => {
  test('début, milieu et dernier mot d’une ligne longue', async ({ page }) => {
    await openTextDemo(page);
    const line = await longestLine(page);
    const scale = await page.evaluate(() => window.__pdfStudio.state.scale);
    const fontSizePx = await page.evaluate(
      (id) => {
        const s = window.__pdfStudio.state;
        const pd = [...s.pages.values()][0];
        const l = (pd.lines || []).find((x) => x.id === id);
        return (l?.fontSize || 12) * s.scale;
      },
      line.id
    );

    const cases = [
      { fraction: 0.05, label: 'début' },
      { fraction: 0.5, label: 'milieu' },
      { fraction: 0.93, label: 'dernier mot' },
    ];

    for (const { fraction, label } of cases) {
      const expected = await expectedIndex(page, {
        text: line.text,
        fraction,
        fontSizePx,
        fontFamily: 'Helvetica, Arial, sans-serif',
      });
      const tap = await tapLine(page, fraction);
      const { offset, length, collapsed } = tap.editor;

      expect(collapsed, `${label} : le curseur doit être simple`).toBe(true);
      expect(length, `${label} : le bloc doit contenir la ligne`).toBe(line.text.length);
      expect(
        Math.abs(offset - expected.index),
        `${label} : curseur à ${offset}, attendu ≈ ${expected.index} (${line.text.length} caractères)`
      ).toBeLessThanOrEqual(1);
      // Le curseur ne doit jamais retomber au début ou à la fin par défaut.
      expect(offset, `${label} : curseur au début`).toBeGreaterThan(0);
      expect(offset, `${label} : curseur en fin de ligne`).toBeLessThan(line.text.length);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    expect(scale).toBeGreaterThan(0);
  });

  test('la saisie s’insère au milieu de la ligne', async ({ page }) => {
    await openTextDemo(page);
    const line = await longestLine(page);
    const tap = await tapLine(page, 0.5);
    const { offset, text } = tap.editor;
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(text.length);

    await page.keyboard.type('ABC', { delay: 40 });
    await page.waitForTimeout(250);
    const after = await readEditor(page);
    expect(after.text).toBe(`${text.slice(0, offset)}ABC${text.slice(offset)}`);
  });

  test('appui long : le mot touché est sélectionné', async ({ page }) => {
    await openTextDemo(page);
    const line = await longestLine(page);
    const x = line.rect.x + line.rect.w * 0.5;
    const y = line.rect.y + line.rect.h / 2;

    await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y)?.closest('.line-block');
        const ev = (type) =>
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerType: 'touch',
            pointerId: 7,
            isPrimary: true,
          });
        el.dispatchEvent(ev('pointerdown'));
        window.__pressTarget = el;
        window.__pressPoint = { x, y };
      },
      { x, y }
    );
    await page.waitForTimeout(650);
    await page.evaluate(() => {
      const el = window.__pressTarget;
      const p = window.__pressPoint;
      el?.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: p.x,
          clientY: p.y,
          pointerType: 'touch',
          pointerId: 7,
          isPrimary: true,
        })
      );
    });
    await page.locator('.inline-text').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(TAP_SETTLE);

    const editor = await readEditor(page);
    expect(editor.collapsed).toBe(false);
    expect(editor.selection.trim().length).toBeGreaterThan(1);
    expect(editor.selection).not.toContain(' ');
    // Le mot sélectionné existe bien dans la ligne d'origine.
    expect(line.text).toContain(editor.selection);
  });
});

test.describe('validation et annulation', () => {
  test('✓ valide le texte et restitue le zoom et le défilement', async ({ page }) => {
    await openTextDemo(page);
    const before = await readView(page);
    const tap = await tapLine(page, 0.45);
    const during = await readView(page);
    expect(during.zoom, 'l’édition zoome la ligne').not.toBe(before.zoom);

    await page.keyboard.type('ZZ', { delay: 40 });
    await page.waitForTimeout(200);
    const typed = await readEditor(page);
    await page.locator('#editDone').click();
    await page.locator('.inline-text').waitFor({ state: 'detached', timeout: 15_000 });
    await page.waitForTimeout(700);

    const after = await readView(page);
    expect(after.zoom).toBe(before.zoom);
    expect(after.left).toBe(before.left);
    expect(after.top).toBe(before.top);
    expect(after.edits).toBe(1);

    const blocks = await page.evaluate(() =>
      [...document.querySelectorAll('.edit-block .edit-text')].map((el) => el.textContent)
    );
    expect(blocks.some((t) => t.includes('ZZ'))).toBe(true);
  });

  test('Échap ferme l’édition et restitue le zoom et le défilement', async ({ page }) => {
    await openTextDemo(page);
    const before = await readView(page);
    await tapLine(page, 0.4);
    await page.keyboard.type('QQ', { delay: 40 });
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.locator('.inline-text').waitFor({ state: 'detached', timeout: 15_000 });
    await page.waitForTimeout(700);

    const after = await readView(page);
    expect(after.zoom).toBe(before.zoom);
    expect(after.left).toBe(before.left);
    expect(after.top).toBe(before.top);
    // Échap ferme l'édition sans perdre la frappe : un seul bloc, avec QQ.
    expect(after.edits).toBe(1);
    const blocks = await page.evaluate(() =>
      [...document.querySelectorAll('.edit-block .edit-text')].map((el) => el.textContent)
    );
    expect(blocks.length).toBe(1);
    expect(blocks[0]).toContain('QQ');
  });

  test('annuler après un simple toucher ne crée rien', async ({ page }) => {
    await openTextDemo(page);
    const before = await readView(page);
    await tapLine(page, 0.6);
    await page.keyboard.press('Escape');
    await page.locator('.inline-text').waitFor({ state: 'detached', timeout: 15_000 });
    await page.waitForTimeout(500);
    const after = await readView(page);
    expect(after.edits).toBe(0);
    expect(after.zoom).toBe(before.zoom);
    expect(after.left).toBe(before.left);
    expect(after.top).toBe(before.top);
  });
});

test.describe('composition et stabilité de la saisie', () => {
  test('une composition ne réécrit pas le contenu éditable', async ({ page }) => {
    await openTextDemo(page);
    const tap = await tapLine(page, 0.5);
    const before = tap.editor;

    // Simulation d'un clavier IME : compositionstart, insertCompositionText,
    // compositionend. Le contenu de la surface doit rester le même nœud.
    const result = await page.evaluate(() => {
      const el = document.querySelector('.inline-text');
      const node = el.firstChild;
      const sel0 = window.getSelection();
      const range0 = sel0.getRangeAt(0).cloneRange();
      const offset = range0.startOffset;
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      // L'IME insère le caractère composé dans le nœud texte existant : le
      // nœud doit rester le même, sinon les poignées et le curseur sautent.
      node.insertData(Math.min(offset, node.data.length), 'é');
      const caret = range0.cloneRange();
      caret.setStart(node, Math.min(offset, node.data.length) + 1);
      caret.collapse(true);
      sel0.removeAllRanges();
      sel0.addRange(caret);
      el.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          inputType: 'insertCompositionText',
          data: 'é',
          isComposing: true,
        })
      );
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertCompositionText',
          data: 'é',
          isComposing: true,
        })
      );
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'é' }));
      const shell = el.closest('.inline-shell');
      return {
        sameNode: el.firstChild === node,
        surface: shell.dataset.surface,
        text: el.textContent,
        model: window.__pdfStudio.state.edits[0]?.text || '',
      };
    });

    await page.waitForTimeout(250);
    expect(result.sameNode, 'le nœud texte ne doit pas être remplacé').toBe(true);
    expect(result.surface).toBe('contenteditable');
    expect(result.text).toContain('é');
    expect(result.model).toContain('é');
    expect(before.length).toBeGreaterThan(10);
  });

  test('le repli textarea prend le relais si le curseur saute', async ({ page }) => {
    await openTextDemo(page);
    const tap = await tapLine(page, 0.5);
    const original = tap.editor.text;

    const steps = [];
    for (let i = 0; i < 2; i += 1) {
      steps.push(
        await page.evaluate(() => {
          const surface = document.querySelector('.inline-text');
          const shell = document.querySelector('.inline-shell');
          if (surface.tagName === 'TEXTAREA') return 'textarea';
          surface.textContent = `${surface.textContent}z`;
          const range = document.createRange();
          range.setStart(surface.firstChild, 0);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          surface.dispatchEvent(
            new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'z' })
          );
          return shell.dataset.surface;
        })
      );
      await page.waitForTimeout(250);
    }

    expect(steps[steps.length - 1]).toBe('textarea');
    const editor = await readEditor(page);
    expect(editor.tag).toBe('TEXTAREA');
    expect(editor.text.startsWith(original.slice(0, 2))).toBe(true);

    // Le textarea superposé reprend la police et la taille de la ligne.
    const style = await page.evaluate(() => {
      const shell = document.querySelector('.inline-shell');
      const cs = getComputedStyle(shell);
      return { fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight, color: cs.color };
    });
    expect(style.fontFamily).toContain('Helvetica');
    expect(parseFloat(style.fontSize)).toBeGreaterThan(8);

    // On peut continuer à taper dans le repli.
    await page.keyboard.type('!', { delay: 40 });
    await page.waitForTimeout(200);
    const typed = await readEditor(page);
    expect(typed.text).toContain('!');
  });
});

test.describe('bloc OCR', () => {
  test('une ligne reconnue sur un scan s’édite au point touché', async ({ page }) => {
    // Un vrai scan n'a pas de couche texte : on part du PDF d'exemple, on
    // retire ses lignes pour reproduire cette situation, puis on injecte le
    // résultat d'OCR (reconnaissance Tesseract non rejouée : plusieurs
    // minutes sur une image, hors budget d'une suite de tests).
    await openTextDemo(page);
    const text = 'Total à payer 1 268,40 EUR — échéance au 30 novembre 2026';
    const count = await page.evaluate((value) => {
      const st = window.__pdfStudio.state;
      const pd = st.pages.get(1);
      if (pd) pd.lines = [];
      return window.__pdfStudio.setOcrLines(1, [
        {
          text: value,
          bbox: { x: 60, y: 560, w: 470, h: 16 },
          fontSize: 12,
          font: 'Helvetica',
        },
      ]);
    }, text);
    expect(count).toBe(1);

    await page.locator('.line-block.ocr').first().waitFor({ state: 'visible', timeout: 15_000 });
    const tap = await tapLine(page, 0.55, '.line-block.ocr');
    const { offset, length } = tap.editor;
    expect(length).toBe(text.length);
    expect(offset).toBeGreaterThan(5);
    expect(Math.abs(offset - text.length * 0.55)).toBeLessThanOrEqual(4);

    await page.keyboard.type('X', { delay: 40 });
    await page.waitForTimeout(200);
    const after = await readEditor(page);
    expect(after.text).toBe(`${text.slice(0, offset)}X${text.slice(offset)}`);
  });
});
