import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Écran « Fichiers » : le PDF complet (octets) et la session d'édition sont
 * enregistrés dans IndexedDB. Ces tests couvrent l'enregistrement, la
 * réouverture avec modifications, la suppression, le quota, la disparition
 * des octets et la limite du nombre de documents.
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
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#homeDemoText')).toBeVisible();
}

async function openTextDemo(page) {
  await gotoApp(page);
  await page.evaluate(() => document.querySelector('#homeDemoText').click());
  await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(700);
}

/** Modifie la première ligne du document via l'interface. */
async function editFirstLine(page, text) {
  const box = await page.locator('.line-block').nth(2).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('.inline-text').waitFor({ state: 'visible' });
  await page.evaluate((value) => {
    const el = document.querySelector('.inline-text');
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }, text);
  await page.evaluate(() => document.querySelector('#editDone')?.click());
  await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.edits.length)).toBe(1);
  // Laisse l'autosave écrire dans IndexedDB.
  await page.waitForTimeout(1600);
}

async function goFiles(page) {
  await page.evaluate(() => document.querySelector('[data-route="files"]')?.click());
  await expect(page.locator('#screenFiles')).toBeVisible();
  await expect(page.locator('.file-row').first()).toBeVisible();
}

/**
 * Repart d'un onglet neuf : le moteur PDF précédent (canevas, worker) est
 * libéré, ce qui évite les manques de mémoire des machines de test.
 */
async function newPage(context) {
  const page = await context.newPage();
  await gotoApp(page);
  return page;
}

/** Attend que le document soit rendu (et non seulement chargé). */
async function waitRendered(page) {
  await expect(page.locator('.line-block').first()).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(500);
}

/** Compte les enregistrements IndexedDB (octets compris). */
async function countRecords(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('pdf-studio', 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('sessions', 'readonly');
    const all = await new Promise((resolve) => {
      const r = tx.objectStore('sessions').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    return all.length;
  });
}

test.describe('Fichiers', () => {
  test('ouvre, ferme et rouvre un document modifié avec ses modifications', async ({ page, context }) => {
    await openTextDemo(page);
    await editFirstLine(page, 'Phrase conservée dans le stockage local');

    // Onglet neuf : plus rien en mémoire, tout vient d'IndexedDB.
    await page.close();
    page = await newPage(context);
    await goFiles(page);

    const row = page.locator('.file-row').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('modif.');
    // Taille du document affichée dans la ligne.
    await expect(row.locator('.file-meta').first()).toContainText('Ko');

    await row.locator('[data-open]').click();
    await waitRendered(page);
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.edits.length)).toBe(1);
    const text = await page.evaluate(() => window.__pdfStudio.state.edits[0].text);
    expect(text).toBe('Phrase conservée dans le stockage local');
    // Le PDF lui-même est bien rendu (pas seulement la session).
    await expect(page.locator('.line-block').first()).toBeVisible();
  });

  test('supprime le document et son PDF après confirmation', async ({ page }) => {
    await openTextDemo(page);
    await editFirstLine(page, 'À supprimer');
    expect(await countRecords(page)).toBe(1);

    await goFiles(page);
    const remove = page.locator('[data-remove]').first();
    const box = await remove.boundingBox();
    // Cible tactile de 44 px.
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await remove.click();

    await expect(page.locator('#confirmDialog')).toHaveAttribute('open', '');
    await expect(page.locator('#confirmText')).toContainText('seront effacés');
    await page.locator('#confirmOk').click();

    await expect(page.locator('.file-row')).toHaveCount(0);
    expect(await countRecords(page)).toBe(0);
  });

  test('annonce clairement une erreur de quota', async ({ page }) => {
    // Simule un navigateur à court d'espace : toute écriture échoue.
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'sessions') {
          throw new DOMException('Quota exceeded.', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    });
    await openTextDemo(page);
    const box = await page.locator('.line-block').nth(2).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator('.inline-text').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      document.querySelector('.inline-text').textContent = 'Toujours modifiable';
      document.querySelector('.inline-text').dispatchEvent(new InputEvent('input', { bubbles: true }));
      document.querySelector('#editDone')?.click();
    });
    // Message explicite, sans bloquer l'édition.
    await expect(page.locator('.toast').last()).toContainText(/espace|quota/i, { timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.edits.length)).toBe(1);
  });

  test('propose de rechoisir le PDF quand ses octets ont disparu', async ({ page, context }) => {
    await openTextDemo(page);
    await editFirstLine(page, 'Session à retrouver');

    // Sauvegarde des octets du PDF d'exemple pour les recharger ensuite.
    const b64 = await page.evaluate(() => {
      const bytes = window.__pdfStudio.state.bytes;
      let out = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return btoa(out);
    });
    const pdfPath = path.join(os.tmpdir(), `studio-pdf-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, Buffer.from(b64, 'base64'));

    // Simule l'éviction des octets par le navigateur : la session reste.
    await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const req = indexedDB.open('pdf-studio', 2);
        req.onsuccess = () => resolve(req.result);
      });
      const read = db.transaction('sessions', 'readonly');
      const all = await new Promise((resolve) => {
        const r = read.objectStore('sessions').getAll();
        r.onsuccess = () => resolve(r.result);
      });
      const write = db.transaction('sessions', 'readwrite');
      const store = write.objectStore('sessions');
      all.forEach((entry) => {
        const { bytes, ...rest } = entry;
        store.put(rest);
      });
      await new Promise((resolve) => (write.oncomplete = resolve));
    });

    await page.close();
    page = await newPage(context);
    await goFiles(page);
    const row = page.locator('.file-row').first();
    await expect(row).toHaveClass(/missing/);
    await expect(row).toContainText('Choisir le fichier à nouveau');

    const chooser = page.waitForEvent('filechooser');
    await row.locator('[data-open]').click();
    await (await chooser).setFiles(pdfPath);
    await waitRendered(page);

    await expect.poll(() => page.evaluate(() => window.__pdfStudio.state.edits.length)).toBe(1);
    expect(await page.evaluate(() => window.__pdfStudio.state.edits[0].text)).toBe('Session à retrouver');
    // Le PDF est réenregistré : une nouvelle ouverture directe suffira.
    await expect.poll(() => countRecords(page)).toBe(1);
  });

  test('demande confirmation avant d’évincer les plus anciens documents', async ({ page }) => {
    // Quota du navigateur simulé à 200 Mo : le plafond utilisable est de 150 Mo.
    await page.addInitScript(() => {
      const real = navigator.storage;
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: async () => ({ usage: 0, quota: 200 * 1024 * 1024 }),
          persisted: async () => true,
          persist: async () => true,
          getDirectory: real?.getDirectory?.bind(real),
        },
      });
    });
    await gotoApp(page);
    // 10 documents factices de 15 Mo (sans octets) pour saturer l'espace utilisable.
    await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const req = indexedDB.open('pdf-studio', 2);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('sessions')) {
            req.result.createObjectStore('sessions', { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
      });
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      for (let i = 0; i < 10; i += 1) {
        store.put({
          key: `ancien-${i}`,
          name: `Ancien document ${i}.pdf`,
          size: 15 * 1024 * 1024,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
          edits: [],
          ocrPages: [],
          markup: [],
        });
      }
      await new Promise((resolve) => (tx.oncomplete = resolve));
    });

    await page.evaluate(() => document.querySelector('#homeDemoText').click());
    await page.locator('.line-block').first().waitFor({ state: 'visible', timeout: 60_000 });

    await expect(page.locator('#confirmDialog')).toHaveAttribute('open', '', { timeout: 15_000 });
    await expect(page.locator('#confirmTitle')).toContainText('Limite');
    await expect(page.locator('#confirmText')).toContainText('Ancien document 0.pdf');
    await page.locator('#confirmOk').click();

    // Le plus ancien disparaît, le nouveau document est enregistré.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const db = await new Promise((resolve) => {
            const req = indexedDB.open('pdf-studio', 2);
            req.onsuccess = () => resolve(req.result);
          });
          const tx = db.transaction('sessions', 'readonly');
          const all = await new Promise((resolve) => {
            const r = tx.objectStore('sessions').getAll();
            r.onsuccess = () => resolve(r.result);
          });
          return { count: all.length, oldest: all.some((d) => d.key === 'ancien-0') };
        })
      )
      .toEqual({ count: 10, oldest: false });
  });

  test('sauvegarde de tous les documents, suppression puis restauration', async ({ page, context }) => {
    await openTextDemo(page);
    await editFirstLine(page, 'Texte sauvegardé');
    await page.close();
    page = await newPage(context);
    await goFiles(page);

    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.locator('#filesBackup').click();
    const dl = await download;
    expect(dl.suggestedFilename()).toMatch(/\.pdfstudio$/);
    const file = path.join(os.tmpdir(), `bk-${Date.now()}.pdfstudio`);
    await dl.saveAs(file);

    // Efface tout, puis restaure depuis le fichier.
    await page.locator('[data-remove]').first().click();
    await page.locator('#confirmOk').click();
    await expect(page.locator('.file-row')).toHaveCount(0);

    await page.locator('#backupInput').setInputFiles(file);
    await expect(page.locator('.file-row').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.file-row').first()).toContainText('modif.');
    expect(await countRecords(page)).toBe(1);
    fs.rmSync(file, { force: true });
  });

  test('un fichier qui n’est pas une sauvegarde est refusé', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => document.querySelector('[data-route="files"]')?.click());
    const file = path.join(os.tmpdir(), `bad-${Date.now()}.pdfstudio`);
    fs.writeFileSync(file, 'ceci n’est pas une sauvegarde');
    await page.locator('#backupInput').setInputFiles(file);
    await expect(page.locator('.toast').last()).toContainText('pas une sauvegarde');
    fs.rmSync(file, { force: true });
  });

  test('Nettoyer retire les anciens documents sans PDF et garde les autres', async ({ page, context }) => {
    await openTextDemo(page);
    await editFirstLine(page, 'Je reste');
    await page.close();
    page = await newPage(context);
    // Deux anciens enregistrements sans octets.
    await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const req = indexedDB.open('pdf-studio', 2);
        req.onsuccess = () => resolve(req.result);
      });
      const tx = db.transaction('sessions', 'readwrite');
      const st = tx.objectStore('sessions');
      st.put({ key: 'old1', name: 'ancien 1.pdf', updatedAt: 1, edits: [] });
      st.put({ key: 'old2', name: 'ancien 2.pdf', updatedAt: 2, edits: [] });
      await new Promise((r) => (tx.oncomplete = r));
    });
    await goFiles(page);
    await expect(page.locator('.file-row')).toHaveCount(3);
    await expect(page.locator('#filesCleanup')).toBeVisible();
    await expect(page.locator('#filesCleanup')).toContainText('2');
    await page.locator('#filesCleanup').click();
    await page.locator('#confirmOk').click();
    await expect(page.locator('.file-row')).toHaveCount(1);
    await expect(page.locator('#filesCleanup')).toBeHidden();
    await expect(page.locator('.file-row').first()).toContainText('modif.');
  });
});
