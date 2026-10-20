import { describe, expect, it } from 'vitest';
import {
  estimateOffsetFromFraction,
  isLongPress,
  isSamsungUserAgent,
  nearestIndexFromWidths,
  relativeCharWidth,
  wordBoundsAt,
} from '../src/caretPoint.js';

const SAMSUNG_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';

describe('curseur au point touché — helpers', () => {
  it('choisit la largeur de préfixe la plus proche', () => {
    const widths = [0, 10, 20, 30];
    expect(nearestIndexFromWidths(widths, 0)).toBe(0);
    expect(nearestIndexFromWidths(widths, 9)).toBe(1);
    expect(nearestIndexFromWidths(widths, 16)).toBe(2);
    expect(nearestIndexFromWidths(widths, 400)).toBe(3);
    expect(nearestIndexFromWidths([], 12)).toBe(0);
  });

  it('donne des largeurs relatives plausibles', () => {
    expect(relativeCharWidth(' ')).toBeLessThan(relativeCharWidth('a'));
    expect(relativeCharWidth('m')).toBeGreaterThan(relativeCharWidth('i'));
    expect(relativeCharWidth('ô')).toBeGreaterThan(0);
    expect(relativeCharWidth('')).toBe(0);
  });

  it('estime l’index à partir d’une fraction de largeur', () => {
    const text = 'Le chat dort sur le clavier mécanique';
    expect(estimateOffsetFromFraction(text, 0)).toBe(0);
    expect(estimateOffsetFromFraction(text, 1)).toBe(text.length);
    const middle = estimateOffsetFromFraction(text, 0.5);
    expect(Math.abs(middle - text.length / 2)).toBeLessThanOrEqual(3);
    // Un point au tout début ne doit pas renvoyer la fin de ligne.
    expect(estimateOffsetFromFraction(text, 0.02)).toBeLessThan(3);
    expect(estimateOffsetFromFraction('', 0.5)).toBe(0);
    expect(estimateOffsetFromFraction(null, 0.5)).toBe(0);
  });

  it('trouve les bornes du mot touché', () => {
    const text = 'Le chat dort';
    expect(wordBoundsAt(text, 4)).toEqual([3, 7]);
    expect(wordBoundsAt(text, 3)).toEqual([3, 7]);
    expect(wordBoundsAt(text, 6)).toEqual([3, 7]);
    // une espace : on sélectionne le caractère lui-même
    expect(wordBoundsAt(text, 2)).toEqual([2, 3]);
    // fin de ligne : dernier mot
    expect(wordBoundsAt(text, text.length)).toEqual([8, 12]);
    // apostrophe et tiret restent dans le mot
    expect(wordBoundsAt("l'écran tactile", 4)).toEqual([0, 7]);
    expect(wordBoundsAt('rendez-vous', 7)).toEqual([0, 11]);
    // texte vide
    expect(wordBoundsAt('', 0)).toEqual([0, 0]);
  });

  it('reconnaît Samsung Internet', () => {
    expect(isSamsungUserAgent(SAMSUNG_UA)).toBe(true);
    expect(isSamsungUserAgent(CHROME_UA)).toBe(false);
    expect(isSamsungUserAgent(undefined)).toBe(false);
  });

  it('distingue appui long et frôlement', () => {
    expect(isLongPress(500, 3)).toBe(true);
    expect(isLongPress(200, 3)).toBe(false);
    expect(isLongPress(500, 40)).toBe(false);
    expect(isLongPress(480, 10)).toBe(true);
  });
});
