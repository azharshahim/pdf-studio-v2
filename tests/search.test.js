import { describe, expect, it } from 'vitest';
import { findMatch, matchSnippet, normalizeForSearch } from '../src/search.js';

describe('findMatch', () => {
  it('trouve une correspondance exacte', () => {
    expect(findMatch('Bonjour le monde', 'monde')).toMatchObject({ index: 11, length: 5 });
  });

  it('ignore la casse', () => {
    expect(findMatch('Bonjour', 'BONJOUR')).toMatchObject({ index: 0, length: 7 });
  });

  it('ignore les accents et renvoie l’index d’origine', () => {
    const text = 'Une année de lumière';
    const match = findMatch(text, 'annee');
    expect(match.index).toBe(4);
    expect(text.slice(match.index, match.index + match.length)).toBe('année');
  });

  it('gère les ligatures œ et æ', () => {
    const text = 'Le cœur et le caæum';
    const coeur = findMatch(text, 'coeur');
    expect(text.slice(coeur.index, coeur.index + coeur.length)).toBe('cœur');
    expect(findMatch(text, 'caaeum').index).toBeGreaterThan(0);
  });

  it('retourne -1 quand absent', () => {
    expect(findMatch('abc', 'zzz')).toEqual({ index: -1, length: 0 });
    expect(findMatch('abc', '')).toEqual({ index: -1, length: 0 });
  });
});

describe('normalizeForSearch', () => {
  it('normalise accents et ligatures', () => {
    expect(normalizeForSearch('ÉLÈVE Œuvre')).toBe('eleve oeuvre');
  });
});

describe('matchSnippet', () => {
  it('produit un extrait avec la correspondance', () => {
    const snippet = matchSnippet('Texte avant, lumière dorée, texte après', 'lumiere');
    expect(snippet.hit).toBe('lumière');
    expect(snippet.before).toContain('Texte avant');
  });
});
