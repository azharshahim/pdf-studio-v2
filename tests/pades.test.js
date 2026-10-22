import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  generateSelfSignedTestP12,
  parsePkcs12,
  signPdfBytes,
  verifySignedPdfBytes,
} from '../src/pades.js';
import { exportPdf } from '../src/exporter.js';

async function samplePdfBytes() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Contrat de prestation n° 2026-042', { x: 50, y: 760, size: 14, font });
  page.drawText('Montant convenu : 2 147,48 EUR TTC', { x: 50, y: 730, size: 11, font });
  return new Uint8Array(await doc.save());
}

describe('Signature numérique certifiée PAdES (.p12 / .pfx)', () => {
  it('déchiffre un certificat .p12 auto-signé généré à la volée et rejette un mauvais mot de passe', () => {
    const p12 = generateSelfSignedTestP12({
      commonName: 'Éléonore Dupré (Test)',
      organization: 'Studio PDF Unitaire',
      password: 'secret-test-uniquement',
    });

    const parsed = parsePkcs12(p12, 'secret-test-uniquement');
    expect(parsed.summary.subjectName).toBe('Éléonore Dupré (Test)');
    expect(parsed.summary.organization).toBe('Studio PDF Unitaire');
    expect(parsed.summary.isExpired).toBe(false);

    expect(() => parsePkcs12(p12, 'mauvais-mot-de-passe')).toThrow(/Mot de passe/i);
  });

  it('produit un PDF PAdES ETSI.CAdES.detached valide avec ByteRange exact, ESSCertIDv2 et OpenSSL cms -verify', async () => {
    const p12Bytes = generateSelfSignedTestP12({
      commonName: 'Jean-Marc Lefèvre (Test)',
      organization: 'Validation PAdES',
      password: 'pades-local-password',
    });

    // Simule d'abord une modification du PDF, puis la signature en toute dernière étape
    const rawPdf = await samplePdfBytes();
    const { bytes: editedPdf } = await exportPdf({
      sourceBytes: rawPdf,
      edits: [
        {
          id: 'e1',
          page: 1,
          kind: 'add',
          bbox: { x: 50, y: 690, w: 240, h: 16 },
          baseline: 694,
          text: 'Avenant validé avant signature.',
          font: 'Helvetica',
          size: 11,
          color: '#111827',
        },
      ],
    });

    const signed = await signPdfBytes(editedPdf, {
      p12Bytes,
      password: 'pades-local-password',
      reason: 'Bon pour accord',
      location: 'Paris, France',
      pageNumber: 1,
      visibleStamp: true,
      subFilter: 'ETSI.CAdES.detached',
    });

    expect(signed.subFilter).toBe('ETSI.CAdES.detached');
    expect(signed.byteRange[0]).toBe(0);
    expect(signed.byteRange[2] + signed.byteRange[3]).toBe(signed.bytes.length);

    const check = verifySignedPdfBytes(signed.bytes);
    expect(check.valid).toBe(true);
    expect(check.reason).toBe('OK');
    expect(check.subFilter).toBe('ETSI.CAdES.detached');
    expect(check.canonicalOrder).toBe(true);
    expect(check.hasSigningCertV2).toBe(true);
    expect(check.signerSubject).toBe('Jean-Marc Lefèvre (Test)');

    // Vérification externe indépendante avec OpenSSL (`openssl cms -verify`) si installé
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pades-check-'));
    try {
      const derPath = path.join(tmpDir, 'sig.der');
      const contentPath = path.join(tmpDir, 'byterange.bin');
      const caPath = path.join(tmpDir, 'ca.pem');
      fs.writeFileSync(derPath, check.cmsDerBytes);
      fs.writeFileSync(contentPath, check.signedSlice);
      fs.writeFileSync(caPath, check.signerCertPem);

      execFileSync(
        'openssl',
        [
          'cms',
          '-verify',
          '-binary',
          '-inform',
          'DER',
          '-in',
          derPath,
          '-content',
          contentPath,
          '-CAfile',
          caPath,
          '-out',
          path.join(tmpDir, 'verified.bin'),
        ],
        { stdio: 'pipe' }
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // Toute modification ultérieure d'un seul octet hors /Contents invalide immédiatement la signature
    const tampered = new Uint8Array(signed.bytes);
    tampered[24] = tampered[24] ^ 0x01;
    const tamperedCheck = verifySignedPdfBytes(tampered);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.reason).toBe('DIGEST_MISMATCH');
  });

  it('prend également en charge adbe.pkcs7.detached avec ByteRange exact', async () => {
    const p12Bytes = generateSelfSignedTestP12({ password: 'pkcs7-test-password' });
    const rawPdf = await samplePdfBytes();
    const signed = await signPdfBytes(rawPdf, {
      p12Bytes,
      password: 'pkcs7-test-password',
      visibleStamp: false,
      subFilter: 'adbe.pkcs7.detached',
    });

    const check = verifySignedPdfBytes(signed.bytes);
    expect(check.valid).toBe(true);
    expect(check.subFilter).toBe('adbe.pkcs7.detached');
    expect(check.canonicalOrder).toBe(true);
  });
});
