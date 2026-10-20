import { describe, expect, it } from 'vitest';
import { clamp, hexToRgb01, normalizeText, rgbToHex, formatBytes } from '../src/utils.js';

describe('clamp', () => {
  it('borne les valeurs', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
  });
});

describe('normalizeText', () => {
  it('ignore casse, accents et ligatures', () => {
    expect(normalizeText('ÉLÈVE à l’Œuvre')).toBe('eleve a l’oeuvre');
    expect(normalizeText('Cœur')).toBe('coeur');
    expect(normalizeText('Straße')).toBe('straße');
  });
});

describe('couleurs', () => {
  it('convertit hex → rgb normalisé', () => {
    expect(hexToRgb01('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb01('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });
  it('utilise le repli sur une valeur invalide', () => {
    expect(hexToRgb01('nope', { r: 1, g: 0, b: 0 })).toEqual({ r: 1, g: 0, b: 0 });
  });
  it('convertit rgb → hex', () => {
    expect(rgbToHex(255, 128, 0)).toBe('#ff8000');
  });
});

describe('formatBytes', () => {
  it('formate les tailles', () => {
    expect(formatBytes(512)).toBe('512 o');
    expect(formatBytes(2048)).toContain('Ko');
  });
});
