import { describe, expect, it } from 'vitest';
import {
  MAX_DOCUMENTS,
  MAX_TOTAL_BYTES,
  chooseEvictions,
  formatBytes,
  isQuotaError,
} from '../src/session.js';

const mb = 1024 * 1024;

function doc(key, sizeMb, age) {
  return { key, size: sizeMb * mb, updatedAt: age };
}

describe('chooseEvictions', () => {
  it('ne supprime rien quand les limites sont respectées', () => {
    const plan = chooseEvictions([doc('a', 1, 3), doc('b', 1, 2)], {
      incomingKey: 'c',
      incomingBytes: 2 * mb,
    });
    expect(plan).toMatchObject({ evict: [], blocked: false, over: false, count: 3 });
    expect(plan.total).toBe(4 * mb);
  });

  it('évince les plus anciens quand il y a trop de documents', () => {
    const docs = Array.from({ length: MAX_DOCUMENTS }, (_, i) => doc(`d${i}`, 1, i)); // d0 le plus ancien
    const plan = chooseEvictions(docs, { incomingKey: 'new', incomingBytes: mb });
    expect(plan.evict).toEqual(['d0']);
    expect(plan.count).toBe(MAX_DOCUMENTS);
    expect(plan.over).toBe(false);
  });

  it('évince plusieurs documents quand le poids dépasse 150 Mo', () => {
    const docs = [doc('old', 60, 1), doc('mid', 60, 2), doc('new', 20, 3)];
    const plan = chooseEvictions(docs, { incomingKey: 'x', incomingBytes: 40 * mb });
    expect(plan.total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
    expect(plan.evict[0]).toBe('old');
    expect(plan.over).toBe(false);
  });

  it('ignore le document en cours de mise à jour (pas d’auto-éviction)', () => {
    // 11 enregistrements hérités d'une version antérieure : la mise à jour du
    // plus ancien ne doit jamais l'évincer lui-même.
    const docs = Array.from({ length: 11 }, (_, i) => doc(`d${i}`, 1, i));
    const plan = chooseEvictions(docs, { incomingKey: 'd0', incomingBytes: 2 * mb });
    expect(plan.evict).toEqual(['d1']);
    expect(plan.count).toBe(10);
  });

  it('bloque un document plus gros que la limite totale', () => {
    const plan = chooseEvictions([], { incomingKey: 'x', incomingBytes: 200 * mb });
    expect(plan.blocked).toBe(true);
    expect(plan.evict).toEqual([]);
  });

  it('évince tous les autres si nécessaire pour tenir sous 150 Mo', () => {
    const docs = [doc('a', 149, 1), doc('b', 149, 2)];
    const plan = chooseEvictions(docs, { incomingKey: 'x', incomingBytes: 10 * mb });
    expect(plan.evict).toEqual(['a', 'b']);
    expect(plan.total).toBe(10 * mb);
    expect(plan.over).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formate en français', () => {
    expect(formatBytes(860 * 1024, 'fr')).toBe('860 ko');
    expect(formatBytes(Math.round(1.4 * mb), 'fr')).toBe('1,4 Mo');
  });

  it('formate en anglais et en arabe', () => {
    expect(formatBytes(1024, 'en')).toBe('1.0 kB');
    expect(formatBytes(0, 'ar')).toBe('0 بايت');
  });
});

describe('isQuotaError', () => {
  it('reconnait les erreurs de quota des navigateurs', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ message: 'Quota exceeded.' })).toBe(true);
    expect(isQuotaError(new Error('autre chose'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});
