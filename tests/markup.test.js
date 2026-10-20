import { describe, expect, it } from 'vitest';
import { clampRect, inkPath, arrowSvg, STAMP_PRESETS, HIGHLIGHT_COLORS } from '../src/markup.js';
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

  it('produit une flèche SVG colorée', () => {
    expect(arrowSvg('#ff0000')).toContain('#ff0000');
    expect(arrowSvg('#ff0000')).toContain('<svg');
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
