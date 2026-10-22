/**
 * Signature numérique certifiée PAdES (ETSI.CAdES.detached / adbe.pkcs7.detached).
 *
 * Traitement 100 % local dans le navigateur :
 *  - Lecture du conteneur PKCS#12 (.p12 / .pfx) en mémoire via `node-forge`
 *    (choisie car autonome, sans dépendance externe, compatible navigateur et
 *    capable de déchiffrer tous les schémas d'enveloppe PKCS#12 PBE/PBES2/3DES/AES
 *    que WebCrypto ne prend pas en charge nativement).
 *  - Construction d'une signature CMS détachée conforme PAdES-B-B
 *    (`ETSI.CAdES.detached`, attribut signé `signingCertificateV2` ESSCertIDv2,
 *    tri canonique DER `SET OF` X.690 §11.6, RSA-SHA256).
 *  - Insertion en dernière étape dans le PDF avec `/AcroForm` (`/SigFlags 3`),
 *    widget `/Sig` et calcul exact au seul octet près du `/ByteRange`.
 *  - Ni le certificat ni le mot de passe ne sont jamais transmis ni sauvegardés.
 */

import forge from 'node-forge';
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
  PDFArray,
  PDFDict,
  StandardFonts,
  rgb,
} from 'pdf-lib';

const OID_SIGNING_CERT_V2 = '1.2.840.113549.1.9.16.2.47';
const BYTERANGE_PLACEHOLDER = [0, 8111111111, 8222222222, 8333333333];

function toBinaryString(u8) {
  const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const CHUNK = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function binaryStringToUint8(bin) {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function compareUint8(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function decodeAttrValue(attr) {
  if (!attr || attr.value == null) return '';
  const raw = String(attr.value);
  // Si la chaîne contient une séquence UTF-8 brute en Latin-1 (ex. certificats externes), la décode proprement.
  if (/[\xc2-\xf4][\x80-\xbf]/.test(raw)) {
    try {
      return forge.util.decodeUtf8(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function getDnField(dn, shortOrName) {
  const attrs = dn?.attributes || [];
  const found = attrs.find(
    (a) => a.shortName === shortOrName || a.name === shortOrName
  );
  return found ? decodeAttrValue(found) : '';
}

function formatPdfDate(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `D:${d.getUTCFullYear()}` +
    `${pad(d.getUTCMonth() + 1)}` +
    `${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}` +
    `${pad(d.getUTCMinutes())}` +
    `${pad(d.getUTCSeconds())}+00'00'`
  );
}

function asciiClean(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
}

/**
 * Extrait les nœuds ASN.1 originaux `serialNumber` et `issuer` directement depuis
 * le `TBSCertificate` du certificat afin de préserver au bit près l'encodage
 * d'origine du Distinguished Name (UTF8String / PrintableString / TeletexString).
 */
function extractOriginalIssuerAndSerialAsn1(certAsn1, fallbackCert) {
  const asn1 = forge.asn1;
  const tbs = certAsn1?.value?.[0];
  if (tbs && Array.isArray(tbs.value) && tbs.value.length >= 4) {
    const first = tbs.value[0];
    const hasExplicitVersion =
      first.tagClass === asn1.Class.CONTEXT_SPECIFIC && first.type === 0;
    const serialNode = tbs.value[hasExplicitVersion ? 1 : 0];
    const issuerNode = tbs.value[hasExplicitVersion ? 3 : 2];
    if (serialNode && issuerNode) {
      return { serialNode, issuerNode };
    }
  }
  let serialHex = String(fallbackCert.serialNumber || '01').replace(/^0x/i, '');
  if (serialHex.length % 2) serialHex = '0' + serialHex;
  if (parseInt(serialHex.slice(0, 2), 16) >= 0x80) serialHex = '00' + serialHex;
  return {
    serialNode: asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.INTEGER,
      false,
      forge.util.hexToBytes(serialHex)
    ),
    issuerNode: forge.pki.distinguishedNameToAsn1(fallbackCert.issuer),
  };
}

/**
 * Déchiffre et inspecte un fichier PKCS#12 (.p12 / .pfx) en mémoire.
 */
export function parsePkcs12(p12Bytes, password = '') {
  if (!p12Bytes || !(p12Bytes.byteLength >= 16 || p12Bytes.length >= 16)) {
    const err = new Error('Fichier de certificat vide ou invalide.');
    err.code = 'INVALID_PKCS12';
    throw err;
  }
  const u8 = p12Bytes instanceof Uint8Array ? p12Bytes : new Uint8Array(p12Bytes);
  let p12Asn1;
  try {
    p12Asn1 = forge.asn1.fromDer(toBinaryString(u8));
  } catch {
    const err = new Error('Le fichier sélectionné n’est pas un certificat .p12 / .pfx valide.');
    err.code = 'INVALID_PKCS12';
    throw err;
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, String(password ?? ''));
  } catch (cause) {
    const msg = String(cause?.message || '');
    const badPwd = /password|mac|decrypt|padding|pkcs#12/i.test(msg);
    const err = new Error(
      badPwd
        ? 'Mot de passe du certificat incorrect ou chiffrement non reconnu.'
        : 'Impossible de lire le conteneur .p12 / .pfx.'
    );
    err.code = badPwd ? 'BAD_PASSWORD' : 'INVALID_PKCS12';
    throw err;
  }

  const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
    forge.pki.oids.pkcs8ShroudedKeyBag
  ] || [];
  const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[
    forge.pki.oids.keyBag
  ] || [];
  const keyBags = [...shroudedBags, ...plainKeyBags].filter((b) => b && b.key);

  if (!keyBags.length) {
    const err = new Error('Aucune clé privée de signature trouvée dans ce fichier .p12 / .pfx.');
    err.code = 'NO_PRIVATE_KEY';
    throw err;
  }

  const certBags = (
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  ).filter((b) => b && b.cert);

  if (!certBags.length) {
    const err = new Error('Aucun certificat X.509 trouvé dans ce fichier .p12 / .pfx.');
    err.code = 'NO_CERTIFICATE';
    throw err;
  }

  // Apparie la clé privée et son certificat signataire (par localKeyId, puis module RSA, puis feuille non-CA).
  let chosenKeyBag = keyBags[0];
  let signerBag = null;

  for (const kb of keyBags) {
    const keyId = kb.attributes?.localKeyId?.[0];
    if (keyId) {
      const match = certBags.find((cb) => cb.attributes?.localKeyId?.[0] === keyId);
      if (match) {
        chosenKeyBag = kb;
        signerBag = match;
        break;
      }
    }
  }

  if (!signerBag) {
    for (const kb of keyBags) {
      const nHex = kb.key?.n?.toString?.(16);
      if (!nHex) continue;
      const match = certBags.find((cb) => cb.cert?.publicKey?.n?.toString?.(16) === nHex);
      if (match) {
        chosenKeyBag = kb;
        signerBag = match;
        break;
      }
    }
  }

  if (!signerBag) {
    signerBag =
      certBags.find((cb) => {
        const bc = cb.cert.getExtension?.('basicConstraints');
        return !bc || !bc.cA;
      }) || certBags[0];
  }

  const signerCert = signerBag.cert;
  const signerCertAsn1 = forge.pki.certificateToAsn1(signerCert);
  const chainAsn1 = [signerCertAsn1];
  const signerDer = forge.asn1.toDer(signerCertAsn1).getBytes();
  let totalCertDerBytes = signerDer.length;

  for (const cb of certBags) {
    if (cb === signerBag) continue;
    const asn1Node = forge.pki.certificateToAsn1(cb.cert);
    const der = forge.asn1.toDer(asn1Node).getBytes();
    if (der === signerDer) continue;
    chainAsn1.push(asn1Node);
    totalCertDerBytes += der.length;
  }

  const subjectName =
    getDnField(signerCert.subject, 'CN') ||
    getDnField(signerCert.subject, 'commonName') ||
    getDnField(signerCert.subject, 'O') ||
    'Signataire certifié';
  const issuerName =
    getDnField(signerCert.issuer, 'CN') ||
    getDnField(signerCert.issuer, 'commonName') ||
    getDnField(signerCert.issuer, 'O') ||
    subjectName;
  const organization =
    getDnField(signerCert.subject, 'O') ||
    getDnField(signerCert.subject, 'organizationName') ||
    '';
  const email =
    getDnField(signerCert.subject, 'E') ||
    getDnField(signerCert.subject, 'emailAddress') ||
    '';
  const notBefore = signerCert.validity?.notBefore || null;
  const notAfter = signerCert.validity?.notAfter || null;
  const now = Date.now();
  const isExpired = !!(notAfter && notAfter.getTime() < now);

  return {
    privateKey: chosenKeyBag.key,
    signerCert,
    signerCertAsn1,
    signerDer,
    chainAsn1,
    totalCertDerBytes,
    summary: {
      subjectName,
      issuerName,
      organization,
      email,
      serialNumber: signerCert.serialNumber,
      notBefore: notBefore ? notBefore.toISOString() : null,
      notAfter: notAfter ? notAfter.toISOString() : null,
      isExpired,
      certCount: chainAsn1.length,
    },
  };
}

/**
 * Construit une signature CMS détachée encodée en DER (`SignedData`),
 * conforme à PAdES-B-B (`ETSI.CAdES.detached`) ou PKCS#7 (`adbe.pkcs7.detached`).
 */
export function createCmsDetachedSignature(
  signedContentBytes,
  parsedP12,
  { subFilter = 'ETSI.CAdES.detached', signingDate = new Date() } = {}
) {
  const asn1 = forge.asn1;
  const contentBin = toBinaryString(signedContentBytes);
  const contentDigestBytes = forge.md.sha256.create().update(contentBin).digest().getBytes();
  const certHashBytes = forge.md.sha256.create().update(parsedP12.signerDer).digest().getBytes();

  const makeAttr = (oid, valueNode) =>
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [valueNode]),
    ]);

  // ESSCertIDv2 ::= SEQUENCE { hashAlgorithm [DEFAULT sha256 omitted], certHash OCTET STRING }
  const essCertIdV2 = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, certHashBytes),
  ]);
  const signingCertV2 = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [essCertIdV2]),
  ]);

  const attrs = [
    makeAttr(
      forge.pki.oids.contentType,
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.data).getBytes())
    ),
    makeAttr(
      forge.pki.oids.messageDigest,
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, contentDigestBytes)
    ),
    makeAttr(OID_SIGNING_CERT_V2, signingCertV2),
  ];

  if (subFilter === 'adbe.pkcs7.detached') {
    const d = signingDate instanceof Date ? signingDate : new Date();
    const timeNode =
      d.getUTCFullYear() >= 1950 && d.getUTCFullYear() <= 2049
        ? asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTCTIME, false, asn1.dateToUtcTime(d))
        : asn1.create(asn1.Class.UNIVERSAL, asn1.Type.GENERALIZEDTIME, false, asn1.dateToGeneralizedTime(d));
    attrs.push(makeAttr(forge.pki.oids.signingTime, timeNode));
  }

  // Tri canonique DER (X.690 §11.6) sur les octets DER de chaque Attribute du SET OF.
  const decorated = attrs.map((node) => ({
    node,
    der: binaryStringToUint8(asn1.toDer(node).getBytes()),
  }));
  decorated.sort((a, b) => compareUint8(a.der, b.der));
  const sortedAttrs = decorated.map((d) => d.node);

  // Signature RSA-SHA256 sur l'encodage DER `SET OF Attribute` (tag 0x31).
  const attrSetForSig = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, sortedAttrs);
  const attrSetDerBin = asn1.toDer(attrSetForSig).getBytes();
  const sigMd = forge.md.sha256.create().update(attrSetDerBin);
  const signatureBin = parsedP12.privateKey.sign(sigMd);

  const { serialNode, issuerNode } = extractOriginalIssuerAndSerialAsn1(
    parsedP12.signerCertAsn1,
    parsedP12.signerCert
  );

  const sha256AlgId = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
  ]);
  const rsaSha256AlgId = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OID,
      false,
      asn1.oidToDer(forge.pki.oids.sha256WithRSAEncryption).getBytes()
    ),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
  ]);

  const signerInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [issuerNode, serialNode]),
    sha256AlgId,
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, sortedAttrs),
    rsaSha256AlgId,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, signatureBin),
  ]);

  const signedData = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [sha256AlgId]),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.data).getBytes()),
    ]),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, parsedP12.chainAsn1),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [signerInfo]),
  ]);

  const contentInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.pki.oids.signedData).getBytes()),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
  ]);

  return binaryStringToUint8(asn1.toDer(contentInfo).getBytes());
}

function findAsciiSubarray(haystack, needleStr, fromIndex = 0) {
  const nLen = needleStr.length;
  const max = haystack.length - nLen;
  outer: for (let i = fromIndex; i <= max; i++) {
    for (let j = 0; j < nLen; j++) {
      if (haystack[i + j] !== needleStr.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

async function buildSignatureAppearanceRef(pdfDoc, { width, height, signerName, signingDate, reason }) {
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const [, helvKey] = pdfDoc.context.register ? [] : [];
  void helvKey;

  // Crée une mini-page temporaire pour dessiner proprement le cartouche via pdf-lib,
  // puis l'intègre comme Form XObject `/AP << /N ... >>` du widget `/Sig`.
  const stampDoc = await PDFDocument.create();
  const fReg = await stampDoc.embedFont(StandardFonts.Helvetica);
  const fBold = await stampDoc.embedFont(StandardFonts.HelveticaBold);
  const sp = stampDoc.addPage([width, height]);
  sp.drawRectangle({
    x: 0.75,
    y: 0.75,
    width: width - 1.5,
    height: height - 1.5,
    color: rgb(0.97, 0.985, 1),
    borderColor: rgb(0.18, 0.38, 0.72),
    borderWidth: 1,
  });
  const cleanSigner = asciiClean(signerName) || 'Certificat X.509';
  const iso = (signingDate instanceof Date ? signingDate : new Date())
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19) + ' UTC';
  sp.drawText('Signature numerique certifiee (PAdES)', {
    x: 8,
    y: height - 14,
    size: 7.5,
    font: fBold,
    color: rgb(0.12, 0.28, 0.58),
  });
  sp.drawText(`Signataire : ${cleanSigner.slice(0, 34)}`, {
    x: 8,
    y: height - 26,
    size: 8.5,
    font: fBold,
    color: rgb(0.08, 0.1, 0.16),
  });
  sp.drawText(`Date : ${iso}`, {
    x: 8,
    y: height - 37,
    size: 7,
    font: fReg,
    color: rgb(0.28, 0.32, 0.38),
  });
  if (reason && asciiClean(reason)) {
    sp.drawText(`Motif : ${asciiClean(reason).slice(0, 38)}`, {
      x: 8,
      y: height - 47,
      size: 7,
      font: fReg,
      color: rgb(0.28, 0.32, 0.38),
    });
  }
  void helv;
  void helvBold;
  const [embedded] = await pdfDoc.embedPages([sp]);
  return embedded.ref;
}

/**
 * Applique une signature cryptographique PAdES en toute dernière étape sur les
 * octets finaux d'un PDF (après toutes les modifications).
 */
export async function signPdfBytes(
  pdfBytes,
  {
    p12Bytes,
    password = '',
    reason = '',
    location = '',
    contactInfo = '',
    pageNumber = 1,
    visibleStamp = true,
    subFilter = 'ETSI.CAdES.detached',
    signingDate = new Date(),
  } = {}
) {
  if (subFilter !== 'ETSI.CAdES.detached' && subFilter !== 'adbe.pkcs7.detached') {
    throw new Error(`SubFilter non pris en charge : ${subFilter}`);
  }

  const parsedP12 = parsePkcs12(p12Bytes, password);
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const pages = pdfDoc.getPages();
  if (!pages.length) throw new Error('Le document PDF ne contient aucune page.');
  const targetIdx = Math.min(pages.length - 1, Math.max(0, (Number(pageNumber) || 1) - 1));
  const targetPage = pages[targetIdx];
  const { width: pageW } = targetPage.getSize();

  // Réserve une taille hexadécimale confortable pour le CMS DER + toute la chaîne X.509.
  const reservedBytes = Math.max(8192, parsedP12.totalCertDerBytes + 4096);
  const reservedHexLen = reservedBytes * 2;

  const byteRangeArray = PDFArray.withContext(pdfDoc.context);
  for (const n of BYTERANGE_PLACEHOLDER) {
    byteRangeArray.push(PDFNumber.of(n));
  }

  const sigDict = pdfDoc.context.obj({
    Type: PDFName.of('Sig'),
    Filter: PDFName.of('Adobe.PPKLite'),
    SubFilter: PDFName.of(subFilter),
    ByteRange: byteRangeArray,
    Contents: PDFHexString.of('0'.repeat(reservedHexLen)),
    M: PDFString.of(formatPdfDate(signingDate)),
    Name: PDFHexString.fromText(parsedP12.summary.subjectName),
  });
  if (reason && String(reason).trim()) {
    sigDict.set(PDFName.of('Reason'), PDFHexString.fromText(String(reason).trim()));
  }
  if (location && String(location).trim()) {
    sigDict.set(PDFName.of('Location'), PDFHexString.fromText(String(location).trim()));
  }
  const contact = String(contactInfo || parsedP12.summary.email || '').trim();
  if (contact) {
    sigDict.set(PDFName.of('ContactInfo'), PDFHexString.fromText(contact));
  }
  const sigDictRef = pdfDoc.context.register(sigDict);

  let rectNums = [0, 0, 0, 0];
  let apDict = null;
  if (visibleStamp) {
    const stampW = Math.min(210, Math.max(140, pageW - 40));
    const stampH = reason && String(reason).trim() ? 54 : 44;
    const x1 = Math.max(16, pageW - stampW - 20);
    const y1 = 18;
    rectNums = [x1, y1, x1 + stampW, y1 + stampH];
    const apRef = await buildSignatureAppearanceRef(pdfDoc, {
      width: stampW,
      height: stampH,
      signerName: parsedP12.summary.subjectName,
      signingDate,
      reason,
    });
    apDict = pdfDoc.context.obj({ N: apRef });
  }

  const fieldName = `Signature_PAdES_${Date.now()}`;
  const widgetDict = pdfDoc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Widget'),
    FT: PDFName.of('Sig'),
    Rect: rectNums,
    V: sigDictRef,
    T: PDFString.of(fieldName),
    F: PDFNumber.of(132), // Print (4) + Locked (128)
    P: targetPage.ref,
  });
  if (apDict) {
    widgetDict.set(PDFName.of('AP'), apDict);
  }
  const widgetRef = pdfDoc.context.register(widgetDict);

  // Ajoute le widget aux annotations de la page cible.
  let annots = targetPage.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) {
    annots = PDFArray.withContext(pdfDoc.context);
    targetPage.node.set(PDFName.of('Annots'), annots);
  }
  annots.push(widgetRef);

  // Met à jour `/AcroForm` du catalogue avec `/Fields` et `/SigFlags 3` (SignaturesExist | AppendOnly).
  let acroForm = pdfDoc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (!acroForm) {
    acroForm = pdfDoc.context.obj({
      Fields: PDFArray.withContext(pdfDoc.context),
      SigFlags: PDFNumber.of(3),
    });
    const acroRef = pdfDoc.context.register(acroForm);
    pdfDoc.catalog.set(PDFName.of('AcroForm'), acroRef);
  } else {
    acroForm.set(PDFName.of('SigFlags'), PDFNumber.of(3));
  }
  let fields = acroForm.lookupMaybe(PDFName.of('Fields'), PDFArray);
  if (!fields) {
    fields = PDFArray.withContext(pdfDoc.context);
    acroForm.set(PDFName.of('Fields'), fields);
  }
  fields.push(widgetRef);

  // Important : `useObjectStreams: false` garantit que `/Sig` et `/Contents` ne sont pas compressés.
  const savedBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
  const outBytes = new Uint8Array(savedBytes);

  // Localise le placeholder unique `/ByteRange` dans le PDF sérialisé.
  const markerPos = findAsciiSubarray(outBytes, String(BYTERANGE_PLACEHOLDER[1]));
  if (markerPos < 0) {
    throw new Error('Impossible de localiser le placeholder /ByteRange dans le PDF généré.');
  }
  let brOpen = markerPos;
  while (brOpen > 0 && outBytes[brOpen] !== 0x5b /* '[' */) brOpen--;
  let brClose = markerPos;
  while (brClose < outBytes.length && outBytes[brClose] !== 0x5d /* ']' */) brClose++;
  if (outBytes[brOpen] !== 0x5b || outBytes[brClose] !== 0x5d) {
    throw new Error('Délimiteurs /ByteRange introuvables.');
  }

  // Localise le placeholder hexadécimal unique `<000000...>` de `/Contents` dans le même dictionnaire `/Sig`.
  const zeroProbe = '<' + '0'.repeat(64);
  const hexOpen = findAsciiSubarray(outBytes, zeroProbe, brClose);
  if (hexOpen < 0) {
    throw new Error('Entrée /Contents introuvable dans le dictionnaire de signature.');
  }
  const hexClose = hexOpen + 1 + reservedHexLen;
  if (outBytes[hexOpen] !== 0x3c || outBytes[hexClose] !== 0x3e /* '>' */) {
    throw new Error('Délimiteurs hexadécimaux /Contents inattendus.');
  }

  // ISO 32000-1 §12.8.1 : tout le PDF est signé sauf `<hex...>` (chevrons inclus).
  const range0Offset = 0;
  const range0Length = hexOpen;
  const range1Offset = hexClose + 1;
  const range1Length = outBytes.length - range1Offset;
  const byteRange = [range0Offset, range0Length, range1Offset, range1Length];

  const brSlotLen = brClose - brOpen + 1;
  const brInner = `${range0Offset} ${range0Length} ${range1Offset} ${range1Length}`;
  if (brInner.length + 2 > brSlotLen) {
    throw new Error('Espace réservé insuffisant pour /ByteRange.');
  }
  const brFormatted = `[${brInner}${' '.repeat(brSlotLen - 2 - brInner.length)}]`;
  for (let i = 0; i < brSlotLen; i++) {
    outBytes[brOpen + i] = brFormatted.charCodeAt(i);
  }

  // Assemble les deux plages signées et génère le CMS CAdES-BES / PKCS#7 détaché.
  const signedSlice = new Uint8Array(range0Length + range1Length);
  signedSlice.set(outBytes.subarray(range0Offset, range0Offset + range0Length), 0);
  signedSlice.set(outBytes.subarray(range1Offset, range1Offset + range1Length), range0Length);

  const cmsDer = createCmsDetachedSignature(signedSlice, parsedP12, {
    subFilter,
    signingDate,
  });
  const cmsHex = Array.from(cmsDer, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  if (cmsHex.length > reservedHexLen) {
    throw new Error('La signature générée dépasse la taille réservée dans /Contents.');
  }
  const paddedHex = cmsHex.padEnd(reservedHexLen, '0');
  for (let i = 0; i < reservedHexLen; i++) {
    outBytes[hexOpen + 1 + i] = paddedHex.charCodeAt(i);
  }

  return {
    bytes: outBytes,
    byteRange,
    subFilter,
    signer: parsedP12.summary,
  };
}

/**
 * Vérifie cryptographiquement la signature PAdES / PKCS#7 d'un PDF signé :
 *  - cohérence exacte du `/ByteRange` sur tout le fichier,
 *  - correspondance du `messageDigest` SHA-256 avec les octets couverts,
 *  - correspondance de `signingCertificateV2` (`ESSCertIDv2`) avec le certificat X.509,
 *  - vérification mathématique de la signature RSA-SHA256 sur les `authenticatedAttributes`.
 */
export function verifySignedPdfBytes(pdfBytes) {
  const u8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const latin = toBinaryString(u8);

  const subMatch = /\/SubFilter\s*\/([A-Za-z0-9.]+)/.exec(latin);
  const brMatch = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(latin);
  if (!subMatch || !brMatch) {
    return { valid: false, reason: 'NO_SIGNATURE_FOUND' };
  }
  const subFilter = subMatch[1];
  const [o0, l0, o1, l1] = brMatch.slice(1, 5).map(Number);

  if (
    o0 !== 0 ||
    l0 <= 0 ||
    o1 <= l0 + 2 ||
    l1 <= 0 ||
    o1 + l1 !== u8.length ||
    u8[l0] !== 0x3c ||
    u8[o1 - 1] !== 0x3e
  ) {
    return { valid: false, reason: 'INVALID_BYTERANGE', byteRange: [o0, l0, o1, l1] };
  }

  const hexRaw = latin.slice(l0 + 1, o1 - 1).trim();
  if (!/^[0-9a-fA-F]+$/.test(hexRaw) || hexRaw.length % 2 !== 0) {
    return { valid: false, reason: 'INVALID_CONTENTS_HEX' };
  }
  const fullDerBin = forge.util.hexToBytes(hexRaw);
  const asn1 = forge.asn1;
  let contentInfo;
  try {
    contentInfo = asn1.fromDer(fullDerBin, { parseAllBytes: false });
  } catch {
    return { valid: false, reason: 'INVALID_CMS_ASN1' };
  }

  // Extrait le DER exact sans les zéros de remplissage de fin de /Contents.
  const cmsDerBytes = binaryStringToUint8(asn1.toDer(contentInfo).getBytes());

  const signedData = contentInfo.value?.[1]?.value?.[0];
  if (!signedData) return { valid: false, reason: 'MISSING_SIGNED_DATA' };

  const certsNode = signedData.value.find(
    (v) => v.tagClass === asn1.Class.CONTEXT_SPECIFIC && v.type === 0
  );
  if (!certsNode?.value?.length) return { valid: false, reason: 'MISSING_CERTIFICATES' };
  const signerCertAsn1 = certsNode.value[0];
  const signerCert = forge.pki.certificateFromAsn1(signerCertAsn1);

  const signerInfosNode = signedData.value[signedData.value.length - 1];
  const signerInfo = signerInfosNode?.value?.[0];
  if (!signerInfo) return { valid: false, reason: 'MISSING_SIGNER_INFO' };

  const authAttrsImplicit = signerInfo.value.find(
    (v) => v.tagClass === asn1.Class.CONTEXT_SPECIFIC && v.type === 0
  );
  if (!authAttrsImplicit?.value?.length) {
    return { valid: false, reason: 'MISSING_AUTH_ATTRS' };
  }

  // Vérifie l'ordre canonique DER du SET OF Attribute.
  const attrDerList = authAttrsImplicit.value.map((a) =>
    binaryStringToUint8(asn1.toDer(a).getBytes())
  );
  const canonicalOrder = attrDerList.every(
    (b, i) => i === 0 || compareUint8(attrDerList[i - 1], b) <= 0
  );

  let extractedDigest = null;
  let hasSigningCertV2 = false;
  const expectedCertSha256 = forge.md.sha256
    .create()
    .update(asn1.toDer(signerCertAsn1).getBytes())
    .digest()
    .getBytes();

  for (const attr of authAttrsImplicit.value) {
    const oid = asn1.derToOid(attr.value[0].value);
    const valNode = attr.value[1]?.value?.[0];
    if (oid === forge.pki.oids.messageDigest && valNode) {
      extractedDigest = valNode.value;
    } else if (oid === OID_SIGNING_CERT_V2 && valNode) {
      const essCertNode = valNode.value?.[0]?.value?.[0];
      const hashOctetNode = essCertNode?.value?.find(
        (n) => n.tagClass === asn1.Class.UNIVERSAL && n.type === asn1.Type.OCTETSTRING
      );
      hasSigningCertV2 = hashOctetNode?.value === expectedCertSha256;
    }
  }

  // Recalcule le condensat SHA-256 réel des deux plages ByteRange.
  const signedSlice = new Uint8Array(l0 + l1);
  signedSlice.set(u8.subarray(o0, o0 + l0), 0);
  signedSlice.set(u8.subarray(o1, o1 + l1), l0);
  const actualDigest = forge.md.sha256
    .create()
    .update(toBinaryString(signedSlice))
    .digest()
    .getBytes();

  if (!extractedDigest || extractedDigest !== actualDigest) {
    return {
      valid: false,
      reason: 'DIGEST_MISMATCH',
      subFilter,
      byteRange: [o0, l0, o1, l1],
    };
  }
  if (subFilter === 'ETSI.CAdES.detached' && !hasSigningCertV2) {
    return { valid: false, reason: 'MISSING_SIGNING_CERT_V2', subFilter };
  }

  const sigNode = signerInfo.value[signerInfo.value.length - 1];
  const signatureBin = sigNode.value;
  const attrSetForVerify = asn1.create(
    asn1.Class.UNIVERSAL,
    asn1.Type.SET,
    true,
    authAttrsImplicit.value
  );
  const attrHash = forge.md.sha256
    .create()
    .update(asn1.toDer(attrSetForVerify).getBytes())
    .digest()
    .getBytes();

  let cryptoValid = false;
  try {
    cryptoValid = signerCert.publicKey.verify(attrHash, signatureBin);
  } catch {
    cryptoValid = false;
  }

  return {
    valid: cryptoValid,
    reason: cryptoValid ? 'OK' : 'BAD_CRYPTO_SIGNATURE',
    subFilter,
    byteRange: [o0, l0, o1, l1],
    canonicalOrder,
    hasSigningCertV2,
    signerSubject: getDnField(signerCert.subject, 'CN'),
    cmsDerBytes,
    signedSlice,
    signerCertPem: forge.pki.certificateToPem(signerCert),
  };
}

/**
 * Génère à la volée en mémoire un certificat X.509 auto-signé de test et son
 * conteneur `.p12` chiffré (strictement réservé aux tests automatisés).
 */
export function generateSelfSignedTestP12({
  commonName = 'Camille Martin (Certificat de test)',
  organization = 'PDF Studio Tests Automatisés',
  country = 'FR',
  email = 'test@example.invalid',
  password = 'test-p12-password',
} = {}) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 60_000);
  cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

  const dn = [
    { name: 'commonName', value: commonName, valueTagClass: forge.asn1.Type.UTF8 },
    { name: 'organizationName', value: organization, valueTagClass: forge.asn1.Type.UTF8 },
    { name: 'countryName', value: country },
    { name: 'emailAddress', value: email },
  ];
  cert.setSubject(dn);
  cert.setIssuer(dn);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: false,
    },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
    friendlyName: 'Certificat de test PDF Studio',
    generateLocalKeyId: true,
  });
  const p12DerBin = forge.asn1.toDer(p12Asn1).getBytes();
  return binaryStringToUint8(p12DerBin);
}
