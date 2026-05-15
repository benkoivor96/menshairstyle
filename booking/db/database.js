const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ============================================================
//  INIT — kreira tablice i sida defaultne usluge
// ============================================================
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id        SERIAL PRIMARY KEY,
      ime       VARCHAR(100) NOT NULL,
      prezime   VARCHAR(100) NOT NULL,
      email     VARCHAR(200) NOT NULL,
      telefon   VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS services (
      id       SERIAL PRIMARY KEY,
      naziv    VARCHAR(200) NOT NULL,
      trajanje INTEGER,
      cijena   NUMERIC(10,2)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id                  SERIAL PRIMARY KEY,
      client_id           INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      service_id          INTEGER REFERENCES services(id),
      datum_vrijeme       TEXT NOT NULL,
      napomena            TEXT,
      status              VARCHAR(20) DEFAULT 'pending',
      email_potvrda_sent  BOOLEAN DEFAULT FALSE,
      email_24h_sent      BOOLEAN DEFAULT FALSE,
      email_1h_sent       BOOLEAN DEFAULT FALSE,
      email_review_sent   BOOLEAN DEFAULT FALSE,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*) FROM services');
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO services (naziv, trajanje) VALUES
        ('Šišanje kose i frizure', 45),
        ('Oblikovanje Brade',       30),
        ('Bojanje kose',            90),
        ('Pranje Kose',             20),
        ('Dječje Šišanje',          30),
        ('Brijanje britvom',        40)
    `);
  }
}

// ============================================================
//  CLIENTS
// ============================================================
async function getClients() {
  const { rows } = await pool.query(
    'SELECT * FROM clients ORDER BY prezime ASC, ime ASC'
  );
  return rows;
}

async function getClient(id) {
  const { rows } = await pool.query('SELECT * FROM clients WHERE id=$1', [id]);
  return rows[0] || null;
}

async function insertClient({ ime, prezime, email, telefon }) {
  const { rows } = await pool.query(
    'INSERT INTO clients (ime, prezime, email, telefon) VALUES ($1,$2,$3,$4) RETURNING *',
    [ime, prezime, email, telefon || null]
  );
  return rows[0];
}

async function updateClient({ id, ime, prezime, email, telefon }) {
  const { rows } = await pool.query(
    'UPDATE clients SET ime=$1, prezime=$2, email=$3, telefon=$4 WHERE id=$5 RETURNING *',
    [ime, prezime, email, telefon || null, id]
  );
  return rows[0];
}

async function deleteClient(id) {
  await pool.query('DELETE FROM clients WHERE id=$1', [id]);
}

// ============================================================
//  SERVICES
// ============================================================
async function getServices() {
  const { rows } = await pool.query('SELECT * FROM services ORDER BY naziv ASC');
  return rows;
}

async function getService(id) {
  const { rows } = await pool.query('SELECT * FROM services WHERE id=$1', [id]);
  return rows[0] || null;
}

async function insertService({ naziv, trajanje, cijena }) {
  const { rows } = await pool.query(
    'INSERT INTO services (naziv, trajanje, cijena) VALUES ($1,$2,$3) RETURNING *',
    [naziv, trajanje || null, cijena || null]
  );
  return rows[0];
}

async function updateService({ id, naziv, trajanje, cijena }) {
  const { rows } = await pool.query(
    'UPDATE services SET naziv=$1, trajanje=$2, cijena=$3 WHERE id=$4 RETURNING *',
    [naziv, trajanje || null, cijena || null, id]
  );
  return rows[0];
}

async function deleteService(id) {
  await pool.query('DELETE FROM services WHERE id=$1', [id]);
}

// ============================================================
//  BOOKINGS
// ============================================================
const ENRICH = `
  SELECT b.*, c.ime, c.prezime, c.email, c.telefon, s.naziv AS usluga, s.trajanje
  FROM bookings b
  LEFT JOIN clients c ON b.client_id = c.id
  LEFT JOIN services s ON b.service_id = s.id
`;

async function getBookings() {
  const { rows } = await pool.query(ENRICH + ' ORDER BY b.datum_vrijeme DESC');
  return rows;
}

async function getBookingsByDate(date) {
  const { rows } = await pool.query(
    ENRICH + " WHERE b.datum_vrijeme LIKE $1 ORDER BY b.datum_vrijeme ASC",
    [date + '%']
  );
  return rows;
}

async function getBookingsByClientId(clientId) {
  const { rows } = await pool.query(
    ENRICH + ' WHERE b.client_id=$1 ORDER BY b.datum_vrijeme DESC',
    [clientId]
  );
  return rows;
}

async function getBooking(id) {
  const { rows } = await pool.query(ENRICH + ' WHERE b.id=$1', [id]);
  return rows[0] || null;
}

async function insertBooking({ client_id, service_id, datum_vrijeme, napomena }) {
  const { rows } = await pool.query(
    'INSERT INTO bookings (client_id, service_id, datum_vrijeme, napomena) VALUES ($1,$2,$3,$4) RETURNING id',
    [client_id, service_id, datum_vrijeme, napomena || null]
  );
  return getBooking(rows[0].id);
}

async function updateBooking({ id, client_id, service_id, datum_vrijeme, napomena, status }) {
  await pool.query(
    'UPDATE bookings SET client_id=$1, service_id=$2, datum_vrijeme=$3, napomena=$4, status=$5 WHERE id=$6',
    [client_id, service_id, datum_vrijeme, napomena || null, status || 'pending', id]
  );
  return getBooking(id);
}

async function cancelBooking(id) {
  await pool.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [id]);
}

async function markEmailSent(field, id) {
  await pool.query(`UPDATE bookings SET ${field}=TRUE WHERE id=$1`, [id]);
}

// ============================================================
//  SCHEDULER QUERIES — filtriranje u JS zbog TEXT datuma
// ============================================================
async function _getPendingBookings() {
  const { rows } = await pool.query(ENRICH + " WHERE b.status='pending'");
  return rows;
}

async function getPending24h() {
  const all = await _getPendingBookings();
  const now = Date.now();
  return all.filter(b => {
    if (b.email_24h_sent) return false;
    const diff = (new Date(b.datum_vrijeme).getTime() - now) / 36e5;
    return diff >= 23 && diff <= 25;
  });
}

async function getPending1h() {
  const all = await _getPendingBookings();
  const now = Date.now();
  return all.filter(b => {
    if (b.email_1h_sent) return false;
    const diff = (new Date(b.datum_vrijeme).getTime() - now) / 36e5;
    return diff >= (55/60) && diff <= (65/60);
  });
}

async function getPendingReview() {
  const all = await _getPendingBookings();
  const now = Date.now();
  return all.filter(b => {
    if (b.email_review_sent) return false;
    return (now - new Date(b.datum_vrijeme).getTime()) >= 30 * 60 * 1000;
  });
}

async function completeBooking(id) {
  await pool.query(
    "UPDATE bookings SET status='completed', email_review_sent=TRUE WHERE id=$1", [id]
  );
}

async function getUpcoming() {
  const all = await _getPendingBookings();
  const now = Date.now();
  const in7 = now + 7 * 24 * 36e5;
  return all
    .filter(b => {
      const t = new Date(b.datum_vrijeme).getTime();
      return t >= now && t <= in7;
    })
    .sort((a, b) => new Date(a.datum_vrijeme) - new Date(b.datum_vrijeme));
}

module.exports = {
  init, pool,
  getClients, getClient, insertClient, updateClient, deleteClient,
  getServices, getService, insertService, updateService, deleteService,
  getBookings, getBookingsByDate, getBookingsByClientId, getBooking,
  insertBooking, updateBooking, cancelBooking, markEmailSent,
  getPending24h, getPending1h, getPendingReview, completeBooking,
  getUpcoming
};
