import { describe, expect, it } from 'vitest';
import {
  clampRect,
  inkPath,
  arrowSvg,
  arrowEndpoints,
  arrowBboxFromEndpoints,
  arrowGeometry,
  STAMP_PRESETS,
  HIGHLIGHT_COLORS,
} from '../src/markup.js';
import { COMPRESS_LEVELS, WATERMARK_PRESETS } from '../src/tools.js';
import { SIGNATURE_FONTS, signatureSheetHtml } from '../src/signature.js';
import { detectFillAreas } from '../src/forms.js';

describe('annotations — helpers', () => {
  it('normalise un rectangle tracé dans n’importe quel sens', () => {
    expect(clampRect({ x: 100, y: 200, w: -40, h: -20 })).toEqual({ x: 60, y: 180, w: 40, h: 20 });
    expect(clampRect({ x: 10, y: 10, w: 0, h: 0 })).toMatchObject({ w: 2, h: 2 });
  });

  it('convertit un tracé libre en chemin SVG', () => {
    const rectFor = ({ x, y }) => ({ left: x, top: 100 - y });
    const d = inkPath({ points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }, rectFor);
    expect(d).toBe('M10.0 80.0 L30.0 60.0');
    expect(inkPath({ points: [] }, rectFor)).toBe('');
  });

  it('fournit 4 couleurs de surlignage et 9 tampons', () => {
    expect(HIGHLIGHT_COLORS).toHaveLength(4);
    expect(STAMP_PRESETS.map((s) => s.text)).toContain('APPROUVÉ');
    expect(STAMP_PRESETS).toHaveLength(9);
  });

  it('produit une flèche SVG colorée et orientée dans toutes les directions', () => {
    expect(arrowSvg('#ff0000')).toContain('#ff0000');
    expect(arrowSvg('#ff0000')).toContain('<svg');
    // Vers le bas-gauche
    const gDownLeft = arrowGeometry({ p1: { x: 200, y: 300 }, p2: { x: 80, y: 120 }, width: 2 });
    expect(gDownLeft.p1).toEqual({ x: 200, y: 300 });
    expect(gDownLeft.p2).toEqual({ x: 80, y: 120 });
    // Les deux ailes partent de la pointe p2 vers l'arrière (x > 80 et y > 120)
    expect(gDownLeft.wing1.x).toBeGreaterThan(80);
    expect(gDownLeft.wing2.x).toBeGreaterThan(80);
    expect(gDownLeft.wing1.y).toBeGreaterThan(120);
    expect(gDownLeft.wing2.y).toBeGreaterThan(120);

    // Horizontale pure droite → gauche : le cadre englobant garde une hauteur > 0
    const p1 = { x: 250, y: 400 };
    const p2 = { x: 100, y: 400 };
    const bbox = arrowBboxFromEndpoints(p1, p2, 2);
    expect(bbox.h).toBeGreaterThanOrEqual(16);
    expect(bbox.x).toBeLessThan(100);
    expect(bbox.x + bbox.w).toBeGreaterThan(250);

    // Rétrocompatibilité : ancienne flèche enregistrée avec uniquement bbox
    const legacy = arrowEndpoints({ type: 'arrow', bbox: { x: 40, y: 50, w: 60, h: 30 } });
    expect(legacy).toEqual({ p1: { x: 40, y: 50 }, p2: { x: 100, y: 80 } });
  });

  it('expose 3 niveaux de compression et 4 filigranes', () => {
    expect(COMPRESS_LEVELS.map((l) => l.id)).toEqual(['light', 'balanced', 'strong']);
    expect(WATERMARK_PRESETS).toContain('CONFIDENTIEL');
  });
});

describe('signature', () => {
  it('propose 3 polices manuscrites', () => {
    expect(SIGNATURE_FONTS).toHaveLength(3);
    expect(SIGNATURE_FONTS.map((f) => f.id)).toEqual(['script', 'hand', 'elegant']);
  });

  it('construit la feuille de signature avec les 3 onglets', () => {
    const html = signatureSheetHtml();
    expect(html).toContain('data-sig-tab="draw"');
    expect(html).toContain('data-sig-tab="type"');
    expect(html).toContain('data-sig-tab="image"');
    expect(html).toContain('id="sigPad"');
  });
});

describe('détection de zones à remplir', () => {
  const line = (text, i = 0) => ({ id: `p1-l${i}`, text, bbox: { x: 50, y: 500 - i * 20, w: 200, h: 12 } });

  it('repère les pointillés, signatures et cases', () => {
    const areas = detectFillAreas([
      line('Nom : ______', 0),
      line('Signature du client', 1),
      line('[ ] J’accepte', 2),
      line('Texte normal', 3),
    ]);
    expect(areas.map((a) => a.kind)).toEqual(['field', 'signature', 'checkbox']);
    expect(areas[0].label).toContain('Nom');
  });

  it('ignore les lignes sans zone', () => {
    expect(detectFillAreas([line('Paragraphe ordinaire')])).toHaveLength(0);
  });
});
