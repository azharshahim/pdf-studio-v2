import { describe, expect, it } from 'vitest';
import { CATALOG, catalogFile, catalogFont, matchCatalogByName } from '../src/fonts.js';
import { cssFontFamily } from '../src/utils.js';
import fs from 'node:fs';
import path from 'node:path';

describe('catalogue de polices', () => {
  it('propose au moins douze familles, chaque fichier existe', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(12);
    for (const font of CATALOG) {
      for (const file of Object.values(font.files)) {
        expect(fs.existsSync(path.join('public/fonts', file)), file).toBe(true);
      }
    }
  });

  it('choisit la bonne variante, avec repli quand elle manque', () => {
    expect(catalogFile('Roboto', true, true)).toBe('catalog/roboto-bi.woff2');
    expect(catalogFile('Roboto', false, true)).toBe('catalog/roboto-i.woff2');
    // Dancing Script n'a ni italique ni gras-italique : repli sur le gras
    expect(catalogFile('Dancing Script', true, true)).toBe('catalog/dancing-script-b.woff2');
    expect(catalogFile('Dancing Script', false, true)).toBe('catalog/dancing-script-n.woff2');
    expect(catalogFile('Helvetica', false, false)).toBeNull();
  });

  it('reconnaît les polices du catalogue dans un nom de police PDF', () => {
    expect(matchCatalogByName('ABCDEF+Roboto-Bold')).toBe('Roboto');
    expect(matchCatalogByName('Roboto-Mono')).toBe('Roboto Mono');
    expect(matchCatalogByName('OpenSans-Regular')).toBe('Open Sans');
    // Arial/Times restent sur les polices PDF de base (rendu inchangé)
    expect(matchCatalogByName('ArialMT')).toBeNull();
    expect(matchCatalogByName('TimesNewRomanPSMT')).toBeNull();
  });

  it('fournit la famille CSS pour l’aperçu', () => {
    expect(cssFontFamily('Lato')).toContain('Lato');
    expect(cssFontFamily('Times')).toContain('Times');
    expect(catalogFont('Inconnue')).toBeNull();
  });
});
