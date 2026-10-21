import { describe, expect, it } from 'vitest';
import { describeBrowser, formatDiagnostic } from '../src/diagnostic.js';

const UA = {
  chrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:152.0) Gecko/152.0 Firefox/152.0',
  safari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
};

describe('describeBrowser', () => {
  it('reconnaît Samsung Internet avant Chrome', () => {
    expect(describeBrowser(UA.samsung)).toBe('Samsung Internet 26');
  });

  it('reconnaît les autres navigateurs', () => {
    expect(describeBrowser(UA.chrome)).toBe('Chrome 153');
    expect(describeBrowser(UA.firefox)).toBe('Firefox 152');
    expect(describeBrowser(UA.safari)).toBe('Safari 18');
    expect(describeBrowser(UA.edge)).toBe('Edge 131');
  });

  it('reste lisible avec un agent inconnu', () => {
    expect(describeBrowser('')).toBe('Navigateur inconnu');
    expect(describeBrowser('curl/8.0')).toBe('Navigateur inconnu');
  });
});

describe('formatDiagnostic', () => {
  it('affiche navigateur, mode et offset', () => {
    expect(formatDiagnostic({ browser: 'Chrome 153', surface: 'contenteditable', offset: 12 })).toBe(
      'Chrome 153 · contentEditable · offset 12'
    );
    expect(formatDiagnostic({ browser: 'Safari 18', surface: 'textarea', offset: 0 })).toBe(
      'Safari 18 · textarea · offset 0'
    );
  });

  it('remplace les valeurs absentes par un tiret', () => {
    expect(formatDiagnostic({ browser: 'Firefox 152' })).toBe('Firefox 152 · — · offset —');
  });
});
