import { describe, expect, it } from 'vitest';
import { cssFontFamilyFor, normalizeInlineText } from '../src/inlineEditor.js';

describe('édition directe — helpers', () => {
  it('normalise les fins de ligne et les espaces insécables', () => {
    expect(normalizeInlineText('Bonjour\r\nle monde')).toBe('Bonjour\nle monde');
    expect(normalizeInlineText('a\u00a0b')).toBe('a b');
    expect(normalizeInlineText('ligne   \nsuivante  ')).toBe('ligne\nsuivante');
    expect(normalizeInlineText('fin\n\n')).toBe('fin');
    expect(normalizeInlineText(null)).toBe('');
  });

  it('associe chaque police à une pile CSS', () => {
    expect(cssFontFamilyFor('Times')).toContain('Times New Roman');
    expect(cssFontFamilyFor('Courier')).toContain('Courier New');
    expect(cssFontFamilyFor('Noto Sans')).toContain('Noto Sans');
    expect(cssFontFamilyFor('Helvetica')).toContain('Helvetica');
    expect(cssFontFamilyFor('Inconnue')).toContain('Helvetica');
  });
});
