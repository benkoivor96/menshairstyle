require('dotenv').config();
const db = require('../db/database');

const FROM_EMAIL = process.env.FROM_EMAIL || 'info@menshairstyle.eu';
const FROM_NAME = process.env.FROM_NAME || "Men's Hair Style";
const SALON_ADDRESS = 'Horvaćanska cesta 160, 10000 Zagreb';
const SALON_PHONE = '091 739 7846';

async function sendEmail({ to, toName, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to, name: toName || '' }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${err}`);
  }
  return res.json();
}

function formatDateTime(dt) {
  const d = new Date(dt);
  return d.toLocaleString('hr-HR', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function baseTemplate(bodyHtml) {
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
  <div class="body">${bodyHtml}</div>
  <div class="footer">
    ${SALON_ADDRESS} &nbsp;|&nbsp; <a href="tel:+385917397846">${SALON_PHONE}</a>
  </div>
</div>
</body>
</html>`;
}

function buildInfoBox(booking) {
  return `<div class="info-box">
    <p><strong>Usluga:</strong> ${booking.usluga}</p>
    <p><strong>Datum i vrijeme:</strong> ${formatDateTime(booking.datum_vrijeme)}</p>
    <p><strong>Adresa:</strong> ${SALON_ADDRESS}</p>
  </div>`;
}

function renderBody(templateBody, booking) {
  const reviewUrl = process.env.GOOGLE_REVIEW_URL || '#';
  const vars = {
    ime: booking.ime,
    prezime: booking.prezime,
    usluga: booking.usluga || '',
    datum_vrijeme: formatDateTime(booking.datum_vrijeme),
    adresa: SALON_ADDRESS,
    telefon: SALON_PHONE,
    info_box: buildInfoBox(booking),
    review_btn: `<a href="${reviewUrl}" class="btn">Ostavi recenziju na Googleu</a>`
  };

  let body = templateBody;
  for (const [key, val] of Object.entries(vars)) {
    body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }

  body = body.split('\n\n').map(p => {
    if (p.includes('<div') || p.includes('<a ')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return body;
}

async function sendConfirmation(booking) {
  const tmpl = await db.getEmailTemplate('confirmation');
  return sendEmail({
    to: booking.email,
    toName: `${booking.ime} ${booking.prezime}`,
    subject: tmpl.subject,
    html: baseTemplate(renderBody(tmpl.body, booking))
  });
}

async function send24hReminder(booking) {
  const tmpl = await db.getEmailTemplate('reminder_24h');
  return sendEmail({
    to: booking.email,
    toName: `${booking.ime} ${booking.prezime}`,
    subject: tmpl.subject,
    html: baseTemplate(renderBody(tmpl.body, booking))
  });
}

async function send1hReminder(booking) {
  const tmpl = await db.getEmailTemplate('reminder_1h');
  return sendEmail({
    to: booking.email,
    toName: `${booking.ime} ${booking.prezime}`,
    subject: tmpl.subject,
    html: baseTemplate(renderBody(tmpl.body, booking))
  });
}

async function sendReviewRequest(booking) {
  const tmpl = await db.getEmailTemplate('review');
  return sendEmail({
    to: booking.email,
    toName: `${booking.ime} ${booking.prezime}`,
    subject: tmpl.subject,
    html: baseTemplate(renderBody(tmpl.body, booking))
  });
}

module.exports = { sendConfirmation, send24hReminder, send1hReminder, sendReviewRequest };
