require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const FROM = `"${process.env.FROM_NAME || "Men's Hair Style"}" <${process.env.FROM_EMAIL}>`;
const SALON_ADDRESS = 'Horvaćanska cesta 160, 10000 Zagreb';
const SALON_PHONE = '091 739 7846';

function formatDateTime(dt) {
  const d = new Date(dt);
  return d.toLocaleString('hr-HR', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function baseTemplate(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="hr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f5f0ea; font-family:'Helvetica Neue',Arial,sans-serif; }
  .wrap { max-width:560px; margin:32px auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }
  .header { background:#111; padding:28px 32px; text-align:center; }
  .header h1 { color:#C2A47E; font-size:22px; margin:0; letter-spacing:2px; text-transform:uppercase; }
  .body { padding:32px; color:#333; font-size:15px; line-height:1.7; }
  .body h2 { color:#111; font-size:18px; margin-bottom:8px; }
  .info-box { background:#f9f6f2; border-left:3px solid #C2A47E; padding:16px 20px; margin:20px 0; border-radius:0 4px 4px 0; }
  .info-box p { margin:4px 0; font-size:14px; }
  .info-box strong { color:#111; }
  .btn { display:inline-block; margin-top:20px; padding:12px 28px; background:#C2A47E; color:#000; font-weight:700; font-size:14px; text-decoration:none; border-radius:4px; letter-spacing:1px; text-transform:uppercase; }
  .footer { background:#111; padding:20px 32px; text-align:center; color:#666; font-size:12px; }
  .footer a { color:#C2A47E; text-decoration:none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>Men's Hair Style</h1></div>
  <div class="body">
    <h2>${title}</h2>
    ${bodyHtml}
  </div>
  <div class="footer">
    ${SALON_ADDRESS} &nbsp;|&nbsp; <a href="tel:+385917397846">${SALON_PHONE}</a>
  </div>
</div>
</body>
</html>`;
}

async function sendConfirmation(booking) {
  const html = baseTemplate('Termin potvrđen!', `
    <p>Dragi/a <strong>${booking.ime} ${booking.prezime}</strong>,</p>
    <p>Tvoj termin je uspješno rezerviran. Radujemo se tvom dolasku!</p>
    <div class="info-box">
      <p><strong>Usluga:</strong> ${booking.usluga}</p>
      <p><strong>Datum i vrijeme:</strong> ${formatDateTime(booking.datum_vrijeme)}</p>
      <p><strong>Adresa:</strong> ${SALON_ADDRESS}</p>
    </div>
    <p>Za otkazivanje ili promjenu termina nazovi nas na <a href="tel:+385917397846">${SALON_PHONE}</a>.</p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: booking.email,
    subject: "Potvrda termina — Men's Hair Style",
    html
  });
}

async function send24hReminder(booking) {
  const html = baseTemplate('Podsjetnik: sutra imaš termin', `
    <p>Dragi/a <strong>${booking.ime} ${booking.prezime}</strong>,</p>
    <p>Podsjećamo te da te sutra čekamo u salonu!</p>
    <div class="info-box">
      <p><strong>Usluga:</strong> ${booking.usluga}</p>
      <p><strong>Datum i vrijeme:</strong> ${formatDateTime(booking.datum_vrijeme)}</p>
      <p><strong>Adresa:</strong> ${SALON_ADDRESS}</p>
    </div>
    <p>Ako moraš otkazati, javi nam se na <a href="tel:+385917397846">${SALON_PHONE}</a>.</p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: booking.email,
    subject: "Podsjetnik: sutra imaš termin u Men's Hair Style",
    html
  });
}

async function send1hReminder(booking) {
  const html = baseTemplate('Vidimo se za sat vremena!', `
    <p>Dragi/a <strong>${booking.ime} ${booking.prezime}</strong>,</p>
    <p>Za otprilike sat vremena čekamo te u salonu. Do videnja!</p>
    <div class="info-box">
      <p><strong>Usluga:</strong> ${booking.usluga}</p>
      <p><strong>Vrijeme:</strong> ${formatDateTime(booking.datum_vrijeme)}</p>
      <p><strong>Adresa:</strong> ${SALON_ADDRESS}</p>
    </div>
  `);

  return transporter.sendMail({
    from: FROM,
    to: booking.email,
    subject: "Vidimo se za sat vremena — Men's Hair Style",
    html
  });
}

async function sendReviewRequest(booking) {
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || '#';
  const html = baseTemplate('Kako je bilo?', `
    <p>Dragi/a <strong>${booking.ime} ${booking.prezime}</strong>,</p>
    <p>Nadamo se da si zadovoljan/na tvojim novim stilom! Bilo bi nam jako drago da ostavljaš recenziju — pomaže nam da rastemo i poboljšamo uslugu.</p>
    <a href="${reviewUrl}" class="btn">Ostavi recenziju na Googleu</a>
    <p style="margin-top:24px;font-size:13px;color:#999;">Hvala što si odabrao/la Men's Hair Style!</p>
  `);

  return transporter.sendMail({
    from: FROM,
    to: booking.email,
    subject: "Kako je bilo? Ostavi recenziju — Men's Hair Style",
    html
  });
}

module.exports = { sendConfirmation, send24hReminder, send1hReminder, sendReviewRequest };
