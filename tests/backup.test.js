import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, planRestore } from '../src/backup.js';

const pdf = (n) => new Uint8Array([37, 80, 68, 70, n, n + 1, n + 2]).buffer;

describe('sauvegarde .pdfstudio', () => {
  it('aller-retour : octets, modifications et dates conservés', async () => {
    const recs = [
      { key: 'a', name: 'é.pdf', bytes: pdf(1), numPages: 2, edits: [{ id: 'e1', text: 'Bonjour' }], markup: [], ocrPages: [], createdAt: 1, updatedAt: 5 },
      { key: 'b', name: 'b.pdf', bytes: pdf(9), numPages: 1, createdAt: 2, updatedAt: 6 },
      { key: 'vide', name: 'sans pdf', numPages: 1 },
    ];
    const blob = buildBackup(recs);
    const back = parseBackup(await blob.arrayBuffer());
    expect(back.map((r) => r.key)).toEqual(['a', 'b']);
    expect(back[0].name).toBe('é.pdf');
    expect(back[0].edits[0].text).toBe('Bonjour');
    expect(back[0].updatedAt).toBe(5);
    expect([...new Uint8Array(back[1].bytes)]).toEqual([37, 80, 68, 70, 9, 10, 11]);
    expect(back[1].size).toBe(7);
  });

  it('refuse un fichier qui n’est pas une sauvegarde', () => {
    expect(() => parseBackup(new TextEncoder().encode('hello world, pas une sauvegarde').buffer)).toThrow('not-a-backup');
  });

  it('refuse un fichier tronqué', async () => {
    const blob = buildBackup([{ key: 'a', name: 'a', bytes: pdf(1) }]);
    const buf = await blob.arrayBuffer();
    expect(() => parseBackup(buf.slice(0, 16))).toThrow();
  });

  it('restauration : garde le document existant plus récent', () => {
    const incoming = [
      { key: 'a', updatedAt: 5 },
      { key: 'b', updatedAt: 9 },
      { key: 'c', updatedAt: 1 },
    ];
    const existing = [
      { key: 'a', updatedAt: 7, hasBytes: true },
      { key: 'b', updatedAt: 3, hasBytes: true },
      { key: 'c', updatedAt: 99, hasBytes: false },
    ];
    const plan = planRestore(incoming, existing);
    expect(plan.restore.map((r) => r.key)).toEqual(['b', 'c']);
    expect(plan.skipped).toBe(1);
  });
});
