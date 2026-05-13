require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const db = require('./db/database');
const email = require('./services/emailService');
const { startScheduler } = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, ''); // npr. '/app' ili ''

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const SALON_NAME = process.env.SALON_NAME || "Men's Hair Style";

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'mhs-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// Injektira window.BASE_PATH i SALON_NAME u HTML fajlove
function serveHtml(file) {
  return (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
    html = html.replace('</head>', `<script>window.BASE_PATH="${BASE}";window.SALON_NAME="${SALON_NAME}";</script>\n</head>`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  };
}

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path === '/auth/login') return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect(BASE + '/login.html');
}

// Statičke datoteke (CSS, JS, slike) — bez auth
app.use(BASE, express.static(path.join(__dirname, 'public'), { index: false }));

// Login HTML — bez auth
app.get(BASE + '/login.html', serveHtml('login.html'));

// Sve ostalo zahtijeva login
app.use(BASE, requireAuth);

// Index redirect
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
app.get(BASE + '/api/clients', (req, res) => {
  try { res.json(db.getClients.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(BASE + '/api/clients/:id', (req, res) => {
  try {
    const client = db.getClient.get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Klijent nije pronađen' });
    res.json({ ...client, bookings: db.getBookingsByClientId.all(client.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(BASE + '/api/clients', (req, res) => {
  const { ime, prezime, email: e, telefon } = req.body;
  if (!ime || !prezime || !e) return res.status(400).json({ error: 'Ime, prezime i email su obavezni' });
  try {
    const r = db.insertClient.run({ ime, prezime, email: e, telefon: telefon || null });
    res.status(201).json(db.getClient.get(r.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put(BASE + '/api/clients/:id', (req, res) => {
  const { ime, prezime, email: e, telefon } = req.body;
  if (!ime || !prezime || !e) return res.status(400).json({ error: 'Ime, prezime i email su obavezni' });
  try {
    db.updateClient.run({ id: req.params.id, ime, prezime, email: e, telefon: telefon || null });
    res.json(db.getClient.get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete(BASE + '/api/clients/:id', (req, res) => {
  try { db.deleteClient.run(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  SERVICES
// ============================================================
app.get(BASE + '/api/services', (req, res) => {
  try { res.json(db.getServices.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(BASE + '/api/services', (req, res) => {
  const { naziv, trajanje, cijena } = req.body;
  if (!naziv) return res.status(400).json({ error: 'Naziv je obavezan' });
  try {
    const r = db.insertService.run({ naziv, trajanje: trajanje || null, cijena: cijena || null });
    res.status(201).json(db.getService.get(r.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put(BASE + '/api/services/:id', (req, res) => {
  const { naziv, trajanje, cijena } = req.body;
  if (!naziv) return res.status(400).json({ error: 'Naziv je obavezan' });
  try {
    db.updateService.run({ id: req.params.id, naziv, trajanje: trajanje || null, cijena: cijena || null });
    res.json(db.getService.get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete(BASE + '/api/services/:id', (req, res) => {
  try { db.deleteService.run(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  BOOKINGS
// ============================================================
app.get(BASE + '/api/bookings/upcoming', (req, res) => {
  try { res.json(db.getUpcoming.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(BASE + '/api/bookings', (req, res) => {
  try {
    const { date } = req.query;
    res.json(date ? db.getBookingsByDate.all(date) : db.getBookings.all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(BASE + '/api/bookings/:id', (req, res) => {
  try {
    const booking = db.getBooking.get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Termin nije pronađen' });
    res.json(booking);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(BASE + '/api/bookings', async (req, res) => {
  const { client_id, service_id, datum_vrijeme, napomena } = req.body;
  if (!client_id || !service_id || !datum_vrijeme)
    return res.status(400).json({ error: 'client_id, service_id i datum_vrijeme su obavezni' });
  try {
    const result = db.insertBooking.run({ client_id, service_id, datum_vrijeme, napomena: napomena || null });
    const booking = db.getBooking.get(result.lastInsertRowid);
    try {
      await email.sendConfirmation(booking);
      db.markEmailSent('email_potvrda_sent', booking.id);
    } catch (emailErr) { console.error('Email greška:', emailErr.message); }
    res.status(201).json(booking);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put(BASE + '/api/bookings/:id', (req, res) => {
  const { client_id, service_id, datum_vrijeme, napomena, status } = req.body;
  if (!client_id || !service_id || !datum_vrijeme)
    return res.status(400).json({ error: 'client_id, service_id i datum_vrijeme su obavezni' });
  try {
    db.updateBooking.run({ id: req.params.id, client_id, service_id, datum_vrijeme, napomena: napomena || null, status: status || 'pending' });
    res.json(db.getBooking.get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete(BASE + '/api/bookings/:id', (req, res) => {
  try { db.cancelBooking.run(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
//  START
// ============================================================
app.listen(PORT, () => {
  console.log(`${SALON_NAME} Booking — http://localhost:${PORT}${BASE}`);
  startScheduler();
});
