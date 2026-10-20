import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { dataUrlToBytes } from './utils.js';

const A4 = [595.28, 841.89];

/* ─────────────────── Exemple 1 : PDF « numérique » ─────────────────── */
export async function buildSampleTextPdf() {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.08, 0.09, 0.15);
  const muted = rgb(0.42, 0.45, 0.5);
  const accent = rgb(0.24, 0.22, 0.72);

  const header = (page, label) => {
    page.drawRectangle({ x: 0, y: 771, width: A4[0], height: 71, color: rgb(0.09, 0.11, 0.25) });
    page.drawText('STUDIO LUMIÈRE', { x: 48, y: 803, size: 13, font: bold, color: rgb(1, 1, 1) });
    const right = label;
    page.drawText(right, {
      x: A4[0] - 48 - bold.widthOfTextAtSize(right, 8.5),
      y: 805,
      size: 8.5,
      font: bold,
      color: rgb(0.72, 0.74, 0.95),
    });
    page.drawRectangle({ x: 0, y: 771, width: A4[0], height: 2.5, color: accent });
  };

  const footer = (page, n) => {
    page.drawLine({ start: { x: 48, y: 62 }, end: { x: A4[0] - 48, y: 62 }, thickness: 0.6, color: rgb(0.82, 0.84, 0.88) });
    page.drawText('Studio Lumière — 24 rue des Écoles, 75005 Paris', { x: 48, y: 46, size: 8, font: reg, color: muted });
    page.drawText(`${n} / 2`, { x: A4[0] - 62, y: 46, size: 8, font: reg, color: muted });
  };

  /* Page 1 */
  const p1 = doc.addPage(A4);
  header(p1, 'RAPPORT ANNUEL 2026');
  p1.drawText('Une année de lumière', { x: 48, y: 696, size: 30, font: bold, color: ink });
  p1.drawText("Bilan d'activité et perspectives — exercice 2025-2026", { x: 48, y: 673, size: 11.5, font: reg, color: muted });

  const para = [
    "L'année écoulée a été marquée par une croissance soutenue de nos activités. Les",
    "équipes ont accompagné plus de cent vingt projets, de la scénographie au design",
    "d'espaces, avec une exigence constante de qualité et de sobriété énergétique.",
    'Nos clients — institutions culturelles, maisons de couture et acteurs publics —',
    'nous ont confié des lieux toujours plus variés, en France comme en Europe.',
  ];
  para.forEach((line, i) => {
    p1.drawText(line, { x: 48, y: 636 - i * 16.5, size: 10.8, font: reg, color: rgb(0.18, 0.2, 0.26) });
  });

  // Encadré coloré (test de l'échantillonnage du fond)
  p1.drawRectangle({ x: 48, y: 468, width: 499, height: 62, color: rgb(1, 0.965, 0.83) });
  p1.drawRectangle({ x: 48, y: 468, width: 3, height: 62, color: rgb(0.96, 0.62, 0.04) });
  p1.drawText('Objectif 2026 : réduire de 30 % l\u2019empreinte carbone de nos productions,', {
    x: 62,
    y: 505,
    size: 10.5,
    font: bold,
    color: rgb(0.32, 0.25, 0.05),
  });
  p1.drawText('tout en élargissant notre offre de services aux collectivités.', {
    x: 62,
    y: 489,
    size: 10.5,
    font: reg,
    color: rgb(0.32, 0.25, 0.05),
  });

  p1.drawText('Faits marquants', { x: 48, y: 428, size: 15, font: bold, color: ink });
  const bullets = [
    'Ouverture du studio de Lyon et recrutement de huit collaborateurs.',
    'Certification ISO 20121 pour nos événements responsables.',
    'Lancement de la gamme « Horizon », plébiscitée dès son premier trimestre.',
  ];
  bullets.forEach((t, i) => {
    const y = 397 - i * 22;
    p1.drawCircle({ x: 52, y: y + 3.2, size: 2, color: accent });
    p1.drawText(t, { x: 62, y, size: 10.8, font: reg, color: rgb(0.18, 0.2, 0.26) });
  });

  p1.drawText("Perspectives", { x: 48, y: 300, size: 15, font: bold, color: ink });
  p1.drawText(
    'Le plan stratégique 2026-2028 s\u2019articule autour de trois axes : la création d\u2019un pôle de',
    { x: 48, y: 274, size: 10.8, font: reg, color: rgb(0.18, 0.2, 0.26) }
  );
  p1.drawText('recherche sur la lumière naturelle, le développement de notre offre digitale et la', {
    x: 48,
    y: 258,
    size: 10.8,
    font: reg,
    color: rgb(0.18, 0.2, 0.26),
  });
  p1.drawText('formation continue de nos équipes.', { x: 48, y: 242, size: 10.8, font: reg, color: rgb(0.18, 0.2, 0.26) });
  footer(p1, 1);

  /* Page 2 */
  const p2 = doc.addPage(A4);
  header(p2, 'CHIFFRES CLÉS');
  p2.drawText('Chiffres clés', { x: 48, y: 716, size: 24, font: bold, color: ink });
  p2.drawText('Exercice clos le 31 mars 2026', { x: 48, y: 695, size: 10.5, font: reg, color: muted });

  const rows = [
    ["Chiffre d'affaires", '4 820 000 €'],
    ['Marge brute', '1 936 000 €'],
    ['Effectif permanent', '42 personnes'],
    ['Clients actifs', '128'],
  ];
  rows.forEach(([label, value], i) => {
    const y = 640 - i * 34;
    p2.drawText(label, { x: 48, y, size: 11, font: reg, color: rgb(0.18, 0.2, 0.26) });
    const w = bold.widthOfTextAtSize(value, 11);
    p2.drawText(value, { x: A4[0] - 48 - w, y, size: 11, font: bold, color: ink });
    p2.drawLine({ start: { x: 48, y: y - 12 }, end: { x: A4[0] - 48, y: y - 12 }, thickness: 0.5, color: rgb(0.88, 0.9, 0.93) });
  });

  p2.drawRectangle({ x: 48, y: 420, width: 499, height: 92, color: rgb(0.93, 0.94, 1) });
  p2.drawText('« La lumière n\u2019est pas seulement ce que nous vendons :', { x: 68, y: 482, size: 13, font: serifItalic, color: rgb(0.2, 0.19, 0.45) });
  p2.drawText('c\u2019est notre manière de raconter les lieux. »', { x: 68, y: 461, size: 13, font: serifItalic, color: rgb(0.2, 0.19, 0.45) });
  p2.drawText('— Camille Fontaine, directrice artistique', { x: 68, y: 439, size: 8.5, font: reg, color: muted });

  p2.drawText('Répartition des activités', { x: 48, y: 380, size: 15, font: bold, color: ink });
  const activities = [
    ['Scénographie (54 %)', '2 603 000 €'],
    ['Design d\u2019espaces (28 %)', '1 350 000 €'],
    ['Événementiel (18 %)', '867 000 €'],
  ];
  activities.forEach(([label, value], i) => {
    const y = 350 - i * 26;
    p2.drawText(label, { x: 48, y, size: 10.8, font: reg, color: rgb(0.18, 0.2, 0.26) });
    p2.drawText(value, { x: 320, y, size: 10.8, font: reg, color: rgb(0.3, 0.32, 0.38) });
  });

  footer(p2, 2);
  return doc.save();
}

/* ─────────────────── Exemple 2 : facture « scannée » ─────────────────── */
export async function buildSampleScanPdf() {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fbfaf5';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.0045);
  ctx.translate(-W / 2, -H / 2);

  const serif = '"Times New Roman", Times, Georgia, serif';
  const sans = 'Helvetica, Arial, sans-serif';

  // En-tête
  ctx.fillStyle = '#1f2937';
  ctx.font = `bold 26px ${sans}`;
  ctx.fillText('ATELIER DU NORD', 90, 130);
  ctx.font = `18px ${sans}`;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('12 quai de la Fonderie · 59000 Lille · contact@atelierdunord.fr', 90, 164);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#374151';
  ctx.font = `19px ${sans}`;
  ctx.fillText('Facture N° 2026-0418', W - 90, 130);
  ctx.fillText('Émise le 12 septembre 2026', W - 90, 160);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#111827';
  ctx.font = `bold 64px ${serif}`;
  ctx.fillText('FACTURE', 90, 290);

  ctx.font = `22px ${sans}`;
  ctx.fillStyle = '#374151';
  ctx.fillText('Client :', 90, 350);
  ctx.font = `24px ${sans}`;
  ctx.fillText('Musée des Beaux-Arts de Rouen', 90, 384);
  ctx.fillText('Esplanade Marcel-Duchamp', 90, 416);
  ctx.fillText('76000 Rouen', 90, 448);

  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, 490);
  ctx.lineTo(W - 90, 490);
  ctx.stroke();

  // Tableau
  ctx.font = `bold 22px ${sans}`;
  ctx.fillStyle = '#111827';
  ctx.fillText('Désignation', 90, 540);
  ctx.fillText('Qté', 690, 540);
  ctx.fillText('Prix unitaire', 790, 540);
  ctx.textAlign = 'right';
  ctx.fillText('Total HT', W - 90, 540);
  ctx.textAlign = 'left';

  const items = [
    ["Rénovation de la salle d'exposition", '1', '8 500,00 €', '8 500,00 €'],
    ['Conception graphique et signalétique', '3', '1 250,00 €', '3 750,00 €'],
    ['Impression et pose des panneaux', '1', '2 340,00 €', '2 340,00 €'],
    ['Accompagnement et coordination', '5', '480,00 €', '2 400,00 €'],
  ];
  ctx.font = `23px ${sans}`;
  items.forEach(([label, qty, pu, total], i) => {
    const y = 600 + i * 58;
    ctx.fillStyle = '#1f2937';
    ctx.fillText(label, 90, y);
    ctx.fillText(qty, 690, y);
    ctx.fillText(pu, 790, y);
    ctx.textAlign = 'right';
    ctx.fillText(total, W - 90, y);
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(90, y + 20);
    ctx.lineTo(W - 90, y + 20);
    ctx.stroke();
  });

  // Totaux
  const totals = [
    ['Total HT', '16 990,00 €'],
    ['TVA 20 %', '3 398,00 €'],
    ['Total TTC', '20 388,00 €'],
  ];
  totals.forEach(([label, value], i) => {
    const y = 900 + i * 48;
    ctx.font = i === 2 ? `bold 27px ${sans}` : `24px ${sans}`;
    ctx.fillStyle = i === 2 ? '#111827' : '#4b5563';
    ctx.textAlign = 'right';
    ctx.fillText(label, W - 330, y);
    ctx.fillText(value, W - 90, y);
  });
  ctx.textAlign = 'left';

  // Mentions
  ctx.font = `21px ${sans}`;
  ctx.fillStyle = '#4b5563';
  ctx.fillText('Merci de votre confiance. Paiement à 30 jours.', 90, 1120);
  ctx.fillText('IBAN FR76 3000 4000 0300 0000 0000 123 · BIC BNPAFRPPXXX', 90, 1154);
  ctx.font = `italic 19px ${sans}`;
  ctx.fillStyle = '#9ca3af';
  ctx.fillText("TVA intracommunautaire : FR 32 123456789 — Atelier du Nord, SARL au capital de 40 000 €", 90, 1210);

  // Cachet
  ctx.save();
  ctx.translate(W - 260, 1280);
  ctx.rotate(-0.12);
  ctx.strokeStyle = 'rgba(30,64,175,0.45)';
  ctx.lineWidth = 5;
  ctx.strokeRect(-150, -48, 300, 96);
  ctx.fillStyle = 'rgba(30,64,175,0.45)';
  ctx.font = `bold 34px ${sans}`;
  ctx.textAlign = 'center';
  ctx.fillText('PAYÉ', 0, 12);
  ctx.restore();
  ctx.textAlign = 'left';

  ctx.restore();

  // Bruit de scan
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const a = Math.random() * 0.05;
    ctx.fillStyle = `rgba(40,40,40,${a.toFixed(3)})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // Légère ombre de bord
  const grad = ctx.createLinearGradient(0, 0, 40, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 40, H);

  const jpeg = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.9));
  const pdf = await PDFDocument.create();
  const img = await pdf.embedJpg(jpeg);
  const page = pdf.addPage(A4);
  page.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
  return pdf.save();
}
