import { describe, expect, it } from 'vitest';
import { isWinAnsiChar, isWinAnsiText, sanitizePdfText } from '../src/exporter.js';

describe('sanitizePdfText', () => {
  it('conserve les caractères français', () => {
    expect(sanitizePdfText('Élève — œuvre « citée »')).toBe('Élève — œuvre « citée »');
  });

  it('remplace les espaces fines et tirets spéciaux', () => {
    expect(sanitizePdfText('a\u202fb\u2011c')).toBe('a b-c');
  });

  it('conserve les ligatures WinAnsi Œ/œ', () => {
    expect(sanitizePdfText('\u0152uvre \u0153uf')).toBe('\u0152uvre \u0153uf');
  });

  it('supprime les caractères non encodables', () => {
    expect(sanitizePdfText('ok 😀 𝄞')).toBe('ok  ');
    expect(sanitizePdfText('arabe مرحبا')).toBe('arabe ');
  });

  it('conserve les retours à la ligne et remplace les tabulations', () => {
    expect(sanitizePdfText('a\tb\nc')).toBe('a    b\nc');
  });
});

describe('isWinAnsiText', () => {
  it('détecte les textes encodables', () => {
    expect(isWinAnsiText('Bonjour à tous — 20 €')).toBe(true);
    expect(isWinAnsiText('مرحبا')).toBe(false);
    expect(isWinAnsiChar('😀')).toBe(false);
  });
});
