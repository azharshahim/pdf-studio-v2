import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  deletePage,
  extractPages,
  insertBlankPage,
  mergePdfs,
  movePage,
  parsePageRanges,
  rotatePage,
} from '../src/pageOps.js';

async function makePdf(count = 3) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= count; i++) {
    const page = doc.addPage([300 + i * 10, 400]);
    page.drawText(`Page ${i}`, { x: 24, y: 360, size: 14, font });
  }
  return doc.save();
}

async function load(bytes) {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

async function texts(bytes) {
  const doc = await load(bytes);
  return Promise.all(
    doc.getPages().map(async (page) => {
      void page;
      return page.getWidth();
    })
  );
}

describe('parsePageRanges', () => {
  it('analyse les plages et les listes', () => {
    expect(parsePageRanges('1-3,5', 6)).toEqual([1, 2, 3, 5]);
    expect(parsePageRanges(' 4 ; 2 - 3 ', 6)).toEqual([2, 3, 4]);
  });

  it('déduplique et trie', () => {
    expect(parsePageRanges('3,1,2,3', 3)).toEqual([1, 2, 3]);
  });

  it('borne les valeurs et ignore les entrées invalides', () => {
    expect(parsePageRanges('0,2-9,abc', 4)).toEqual([2, 3, 4]);
    expect(parsePageRanges('', 4)).toEqual([]);
    expect(parsePageRanges('99', 4)).toEqual([]);
  });
});

describe('opérations de pages', () => {
  it('pivote une page', async () => {
    const src = await makePdf(2);
    const out = await rotatePage(src, 1, 90);
    const doc = await load(out);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(0);
  });

  it('supprime une page', async () => {
    const src = await makePdf(3);
    const doc = await load(await deletePage(src, 2));
    expect(doc.getPageCount()).toBe(2);
  });

  it('refuse de supprimer la dernière page', async () => {
    const src = await makePdf(1);
    await expect(deletePage(src, 1)).rejects.toThrow();
  });

  it('déplace une page en préservant son contenu', async () => {
    const src = await makePdf(3);
    const doc = await load(await movePage(src, 3, 1));
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((p) => p.getWidth())).toEqual([330, 310, 320]);
  });

  it('insère une page vierge', async () => {
    const src = await makePdf(2);
    const doc = await load(await insertBlankPage(src, 2));
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(1).getWidth()).toBe(320);
  });

  it('extrait une sélection de pages', async () => {
    const src = await makePdf(4);
    const doc = await load(await extractPages(src, [2, 4]));
    expect(doc.getPageCount()).toBe(2);
  });

  it('fusionne deux PDF', async () => {
    const a = await makePdf(2);
    const b = await makePdf(3);
    const doc = await load(await mergePdfs(a, b));
    expect(doc.getPageCount()).toBe(5);
    expect(await texts(a)).toEqual([310, 320]);
  });
});
