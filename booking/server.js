require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const db = require('./db/database');
const email = require('./services/emailService');
const { startScheduler } = require('./services/scheduler');

const pgSession = require('connect-pg-simple')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const SALON_NAME = process.env.SALON_NAME || "Men's Hair Style";

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(session({
  store: new pgSession({
    pool: db.pool,
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'mhs-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 dana
}));

function serveHtml(file) {
  return (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
    html = html.replace('</head>', `<script>window.BASE_PATH="${BASE}";window.SALON_NAME="${SALON_NAME}";</script>\n</head>`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path === '/auth/login') return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect(BASE + '/login.html');
}

app.use(BASE, express.static(path.join(__dirname, 'public'), { index: false }));
app.get(BASE + '/login.html', serveHtml('login.html'));
app.use(BASE, requireAuth);
app.get(BASE + '/', serveHtml('index.html'));
app.get(BASE, serveHtml('index.html'));

// ============================================================
//  AUTH
// ============================================================
app.post(BASE + '/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Pogrešni podaci' });
});

app.post(BASE + '/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ============================================================
//  CONFIG
// ============================================================
app.get(BASE + '/api/config', (req, res) => {
  res.json({ salonName: SALON_NAME, basePath: BASE });
});

// ============================================================
//  CLIENTS
// ============================================================
app.get(BASE + '/api/clients', async (req, res) => {
  try { res.json(await db.getClients()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(BASE + '/api/clients/:id', async (req, res) => {
  try {
    const client = await db.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Klijent nije pronađen' });
    const bookings = await db.getBookingsByClientId(client.id);
    res.json({ ...client, bookings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(BASE + '/api/clients', async (req, res) => {
  const { ime, prezime, email: e, telefon } = req.body;
  if (!ime || !prezime || !e) return res.status(400).json({ error: 'Ime, prezime i email su obavezni' });
  try {
    const client = await db.insertClient({ ime, prezime, email: e, telefon: telefon || null });
    res.status(201).json(client);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put(BASE + '/api/clients/:id', async (req, res) => {
  const { ime, prezime, email: e, telefon } = req.body;
  if (!ime || !prezime || !e) return res.status(400).json({ error: 'Ime, prezime i email su obavezni' });
  try {
    const client = await db.updateClient({ id: req.params.id, ime, prezime, email: e, telefon: telefon || null });
    res.json(client);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete(BASE + '/api/clients/:id', async (req, res) => {
  try { await db.deleteClient(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  SERVICES
// ============================================================
app.get(BASE + '/api/services', async (req, res) => {
  try { res.json(await db.getServices()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(BASE + '/api/services', async (req, res) => {
  const { naziv, trajanje, cijena } = req.body;
  if (!naziv) return res.status(400).json({ error: 'Naziv je obavezan' });
  try {
    const svc = await db.insertService({ naziv, trajanje: trajanje || null, cijena: cijena || null });
    res.status(201).json(svc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put(BASE + '/api/services/:id', async (req, res) => {
  const { naziv, trajanje, cijena } = req.body;
  if (!naziv) return res.status(400).json({ error: 'Naziv je obavezan' });
  try {
    const svc = await db.updateService({ id: req.params.id, naziv, trajanje: trajanje || null, cijena: cijena || null });
    res.json(svc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete(BASE + '/api/services/:id', async (req, res) => {
  try { await db.deleteService(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  BOOKINGS
// ============================================================
app.get(BASE + '/api/bookings/upcoming', async (req, res) => {
  try { res.json(await db.getUpcoming()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(BASE + '/api/bookings/upcoming-week-count', async (req, res) => {
  try { res.json({ count: await db.getUpcomingWeekCount() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(BASE + '/api/bookings', async (req, res) => {
  try {
    const { date } = req.query;
    res.json(date ? await db.getBookingsByDate(date) : await db.getBookings());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(BASE + '/api/bookings/:id', async (req, res) => {
  try {
    const booking = await db.getBooking(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Termin nije pronađen' });
    res.json(booking);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(BASE + '/api/bookings', async (req, res) => {
  const { client_id, service_id, datum_vrijeme, napomena } = req.body;
  if (!client_id || !service_id || !datum_vrijeme)
    return res.status(400).json({ error: 'client_id, service_id i datum_vrijeme su obavezni' });
  try {
    const booking = await db.insertBooking({ client_id, service_id, datum_vrijeme, napomena: napomena || null });
    try {
      await email.sendConfirmation(booking);
      await db.markEmailSent('email_potvrda_sent', booking.id);
    } catch (emailErr) { console.error('Email greška:', emailErr.message); }
    res.status(201).json(booking);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put(BASE + '/api/bookings/:id', async (req, res) => {
  const { client_id, service_id, datum_vrijeme, napomena, status } = req.body;
  if (!client_id || !service_id || !datum_vrijeme)
    return res.status(400).json({ error: 'client_id, service_id i datum_vrijeme su obavezni' });
  try {
    const booking = await db.updateBooking({ id: req.params.id, client_id, service_id, datum_vrijeme, napomena: napomena || null, status: status || 'pending' });
    res.json(booking);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete(BASE + '/api/bookings/:id', async (req, res) => {
  try { await db.cancelBooking(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  BLOCKED PERIODS
// ============================================================
app.get(BASE + '/api/blocked-periods', async (req, res) => {
  try {
    const { date } = req.query;
    res.json(date ? await db.getBlockedPeriodsForDate(date) : await db.getBlockedPeriods());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(BASE + '/api/blocked-periods', async (req, res) => {
  const { datum, cijeli_dan, od, razlog } = req.body;
  const doo = req.body['do'];
  if (!datum) return res.status(400).json({ error: 'Datum je obavezan' });
  try {
    const bp = await db.insertBlockedPeriod({ datum, cijeli_dan, od, do: doo, razlog });
    res.status(201).json(bp);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete(BASE + '/api/blocked-periods/:id', async (req, res) => {
  try { await db.deleteBlockedPeriod(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  EMAIL TEMPLATES
// ============================================================
app.get(BASE + '/api/email-templates', async (req, res) => {
  try { res.json(await db.getEmailTemplates()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put(BASE + '/api/email-templates/:key', async (req, res) => {
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject i body su obavezni' });
  try { res.json(await db.updateEmailTemplate(req.params.key, subject, body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(BASE + '/api/email-templates/:key/test', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Email adresa je obavezna' });
  const dummyBooking = {
    ime: 'Marko',
    prezime: 'Horvat',
    email: to,
    usluga: 'Šišanje kose i frizure',
    datum_vrijeme: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    client_id: 0
  };
  try {
    const key = req.params.key;
    if (key === 'confirmation') await email.sendConfirmation(dummyBooking);
    else if (key === 'reminder_24h') await email.send24hReminder(dummyBooking);
    else if (key === 'reminder_1h') await email.send1hReminder(dummyBooking);
    else if (key === 'review') await email.sendReviewRequest(dummyBooking);
    else return res.status(404).json({ error: 'Nepoznati template' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  START
// ============================================================
async function start() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nije postavljen! Dodaj PostgreSQL addon u Railway dashboardu.');
  }
  await db.init();
  console.log('Baza inicijalizirana.');
  app.listen(PORT, () => {
    console.log(`${SALON_NAME} Booking — http://localhost:${PORT}${BASE}`);
    startScheduler();
  });
}

start().catch(err => {
  console.error('Greška pri pokretanju:', err);
  process.exit(1);
});
