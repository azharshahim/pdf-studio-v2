import { describe, expect, it } from 'vitest';
import { createInstabilityGuard, cssFontFamilyFor, normalizeInlineText } from '../src/inlineEditor.js';

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

describe('garde-fou Samsung Internet — instabilité du contenteditable', () => {
  it('ne signale rien quand le curseur avance normalement', () => {
    const guard = createInstabilityGuard(2);
    expect(guard.note({ before: 3, after: 4, lengthBefore: 10, lengthAfter: 11 })).toBe(false);
    expect(guard.note({ before: 4, after: 5, lengthBefore: 11, lengthAfter: 12 })).toBe(false);
    expect(guard.jumps).toBe(0);
  });

  it('signale le repli après deux remises à zéro pendant la frappe', () => {
    const guard = createInstabilityGuard(2);
    expect(guard.note({ before: 5, after: 0, lengthBefore: 10, lengthAfter: 11 })).toBe(false);
    expect(guard.jumps).toBe(1);
    expect(guard.note({ before: 1, after: 0, lengthBefore: 11, lengthAfter: 12 })).toBe(true);
  });

  it('compte les sauts consécutifs même si le curseur est déjà à zéro', () => {
    const guard = createInstabilityGuard(2);
    guard.note({ before: 6, after: 0, lengthBefore: 10, lengthAfter: 11 });
    expect(guard.note({ before: 0, after: 0, lengthBefore: 11, lengthAfter: 12 })).toBe(true);
  });

  it('ne confond pas une frappe en début de ligne avec un saut', () => {
    const guard = createInstabilityGuard(2);
    expect(guard.note({ before: 0, after: 1, lengthBefore: 10, lengthAfter: 11 })).toBe(false);
    expect(guard.note({ before: 1, after: 2, lengthBefore: 11, lengthAfter: 12 })).toBe(false);
    expect(guard.jumps).toBe(0);
  });

  it('oublie un saut isolé si la frappe redevient normale', () => {
    const guard = createInstabilityGuard(2);
    guard.note({ before: 5, after: 0, lengthBefore: 10, lengthAfter: 11 });
    expect(guard.note({ before: 2, after: 3, lengthBefore: 11, lengthAfter: 12 })).toBe(false);
    expect(guard.jumps).toBe(0);
    expect(guard.note({ before: 3, after: 0, lengthBefore: 12, lengthAfter: 13 })).toBe(false);
    expect(guard.jumps).toBe(1);
  });

  it('détecte aussi un recul de plus d’un caractère', () => {
    const guard = createInstabilityGuard(2);
    expect(guard.note({ before: 8, after: 2, lengthBefore: 12, lengthAfter: 12 })).toBe(false);
    expect(guard.note({ before: 5, after: 1, lengthBefore: 12, lengthAfter: 12 })).toBe(true);
  });
});
