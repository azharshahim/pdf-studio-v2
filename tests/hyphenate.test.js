import { describe, it, expect } from 'vitest';
import { hyphenPoints, hyphenateWord, hyphenateText, stripShy, SHY } from '../src/hyphenate.js';
import { wrapTextToWidth } from '../src/paragraphs.js';

const show = (w) => hyphenateWord(w).split(SHY).join('-');

describe('césure française sans dictionnaire', () => {
  it('coupe selon les syllabes', () => {
    expect(show('administration')).toBe('admi-nis-tra-tion');
    expect(show('construire')).toBe('cons-truire');
    expect(show('télécharger')).toBe('télé-char-ger');
    expect(show('environnement')).toBe('envi-ron-ne-ment');
    expect(show('professionnelle')).toBe('pro-fes-sion-nelle');
  });

  it('ne coupe jamais une syllabe muette finale, ni trop près des bords, ni les mots courts', () => {
    expect(show('factures')).toBe('fac-tures');
    expect(show('table')).toBe('table');
    expect(hyphenPoints('avec')).toEqual([]);
  });

  it('ignore les nombres, sigles mêlés de chiffres et garde la ponctuation', () => {
    const out = hyphenateText("l'administration : 2147,48 € (réf. AB12345678)");
    expect(stripShy(out)).toBe("l'administration : 2147,48 € (réf. AB12345678)");
    expect(out.split(SHY).length).toBeGreaterThan(1);
    expect(out).toContain('2147,48');
  });

  it('le reflux coupe un mot long avec un tiret visible et respecte le retrait de première ligne', () => {
    const measure = (s) => s.length * 6; // police à chasse fixe fictive : 6 pt par caractère
    const text = hyphenateText('Une attestation administrative particulièrement circonstanciée');
    const lines = wrapTextToWidth(text, 120, measure, { firstIndent: 24 });
    for (const [i, l] of lines.entries()) {
      expect(l.includes(SHY)).toBe(false);
      expect(measure(l)).toBeLessThanOrEqual(i === 0 ? 96 : 120);
    }
    expect(lines.some((l) => l.endsWith('-'))).toBe(true);
    expect(lines.join(' ').replace(/- /g, '')).toContain('administrative');
  });
});
