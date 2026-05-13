const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, '..', 'booking.json'));
const db = low(adapter);

// Seed default structure
db.defaults({
  clients: [],
  services: [
    { id: 1, naziv: 'Šišanje kose i frizure', trajanje: 45, cijena: null },
    { id: 2, naziv: 'Oblikovanje Brade',       trajanje: 30, cijena: null },
    { id: 3, naziv: 'Bojanje kose',            trajanje: 90, cijena: null },
    { id: 4, naziv: 'Pranje Kose',             trajanje: 20, cijena: null },
    { id: 5, naziv: 'Dječje Šišanje',          trajanje: 30, cijena: null },
    { id: 6, naziv: 'Brijanje britvom',        trajanje: 40, cijena: null }
  ],
  bookings: [],
  _seq: { clients: 1, bookings: 1 }
}).write();

// ---- ID helpers ----
function nextId(collection) {
  const id = db.get(`_seq.${collection}`).value();
  db.set(`_seq.${collection}`, id + 1).write();
  return id;
}

// ---- Clients ----
const getClients = {
  all: () => db.get('clients').orderBy(['prezime', 'ime'], ['asc', 'asc']).value()
};

const getClient = {
  get: (id) => db.get('clients').find({ id: parseInt(id) }).value()
};

const insertClient = {
  run: ({ ime, prezime, email, telefon }) => {
    const id = nextId('clients');
    const client = { id, ime, prezime, email, telefon: telefon || null, created_at: new Date().toISOString() };
    db.get('clients').push(client).write();
    return { lastInsertRowid: id };
  }
};

const updateClient = {
  run: ({ id, ime, prezime, email, telefon }) => {
    db.get('clients').find({ id: parseInt(id) }).assign({ ime, prezime, email, telefon: telefon || null }).write();
  }
};

const deleteClient = {
  run: (id) => {
    db.get('clients').remove({ id: parseInt(id) }).write();
    db.get('bookings').remove({ client_id: parseInt(id) }).write();
  }
};

// ---- Services ----
const getServices = {
  all: () => db.get('services').sortBy('naziv').value()
};

const getService = {
  get: (id) => db.get('services').find({ id: parseInt(id) }).value()
};

const insertService = {
  run: ({ naziv, trajanje, cijena }) => {
    const allIds = db.get('services').map('id').value();
    const id = allIds.length ? Math.max(...allIds) + 1 : 1;
    db.get('services').push({ id, naziv, trajanje: trajanje || null, cijena: cijena || null }).write();
    return { lastInsertRowid: id };
  }
};

const updateService = {
  run: ({ id, naziv, trajanje, cijena }) => {
    db.get('services').find({ id: parseInt(id) }).assign({ naziv, trajanje: trajanje || null, cijena: cijena || null }).write();
  }
};

const deleteService = {
  run: (id) => db.get('services').remove({ id: parseInt(id) }).write()
};

// ---- Bookings helpers ----
function enrichBooking(b) {
  if (!b) return null;
  const client = db.get('clients').find({ id: b.client_id }).value() || {};
  const service = db.get('services').find({ id: b.service_id }).value() || {};
  return { ...b, ime: client.ime, prezime: client.prezime, email: client.email, telefon: client.telefon, usluga: service.naziv };
}

const getBookings = {
  all: () => db.get('bookings').orderBy('datum_vrijeme', 'desc').value().map(enrichBooking)
};

const getBookingsByDate = {
  all: (date) => db.get('bookings')
    .filter(b => b.datum_vrijeme && b.datum_vrijeme.startsWith(date))
    .sortBy('datum_vrijeme').value().map(enrichBooking)
};

const getBookingsByClientId = {
  all: (clientId) => db.get('bookings')
    .filter({ client_id: parseInt(clientId) })
    .orderBy('datum_vrijeme', 'desc').value().map(b => {
      const service = db.get('services').find({ id: b.service_id }).value() || {};
      return { ...b, usluga: service.naziv };
    })
};

const getBooking = {
  get: (id) => enrichBooking(db.get('bookings').find({ id: parseInt(id) }).value())
};

const insertBooking = {
  run: ({ client_id, service_id, datum_vrijeme, napomena }) => {
    const id = nextId('bookings');
    const booking = {
      id, client_id: parseInt(client_id), service_id: parseInt(service_id),
      datum_vrijeme, napomena: napomena || null,
      status: 'pending',
      email_potvrda_sent: 0, email_24h_sent: 0, email_1h_sent: 0, email_review_sent: 0,
      created_at: new Date().toISOString()
    };
    db.get('bookings').push(booking).write();
    return { lastInsertRowid: id };
  }
};

const updateBooking = {
  run: ({ id, client_id, service_id, datum_vrijeme, napomena, status }) => {
    db.get('bookings').find({ id: parseInt(id) }).assign({
      client_id: parseInt(client_id), service_id: parseInt(service_id),
      datum_vrijeme, napomena: napomena || null, status: status || 'pending'
    }).write();
  }
};

const cancelBooking = {
  run: (id) => db.get('bookings').find({ id: parseInt(id) }).assign({ status: 'cancelled' }).write()
};

function markEmailSent(field, id) {
  db.get('bookings').find({ id: parseInt(id) }).assign({ [field]: 1 }).write();
}

// ---- Scheduler queries ----
function getPendingReminders(minHours, maxHours) {
  const now = Date.now();
  return db.get('bookings').filter(b => {
    if (b.status !== 'pending') return false;
    const dt = new Date(b.datum_vrijeme).getTime();
    const diffH = (dt - now) / 36e5;
    return diffH >= minHours && diffH <= maxHours;
  }).value().map(enrichBooking);
}

const getPending24h = {
  all: () => {
    const res = getPendingReminders(23, 25);
    return res.filter(b => b && !b.email_24h_sent);
  }
};

const getPending1h = {
  all: () => {
    const mins55 = 55 / 60;
    const mins65 = 65 / 60;
    const res = getPendingReminders(mins55, mins65);
    return res.filter(b => b && !b.email_1h_sent);
  }
};

const getPendingReview = {
  all: () => {
    const now = Date.now();
    return db.get('bookings').filter(b => {
      if (b.status !== 'pending' || b.email_review_sent) return false;
      const dt = new Date(b.datum_vrijeme).getTime();
      return (now - dt) >= 30 * 60 * 1000; // 30 min prošlo
    }).value().map(enrichBooking);
  }
};

const completeBooking = {
  run: (id) => db.get('bookings').find({ id: parseInt(id) }).assign({ status: 'completed', email_review_sent: 1 }).write()
};

const getUpcoming = {
  all: () => {
    const now = new Date();
    const in7days = new Date(Date.now() + 7 * 24 * 36e5);
    return db.get('bookings').filter(b => {
      if (b.status !== 'pending') return false;
      const dt = new Date(b.datum_vrijeme);
      return dt >= now && dt <= in7days;
    }).sortBy('datum_vrijeme').value().map(enrichBooking);
  }
};

module.exports = {
  db,
  getClients, getClient, insertClient, updateClient, deleteClient,
  getServices, getService, insertService, updateService, deleteService,
  getBookings, getBookingsByDate, getBookingsByClientId, getBooking,
  insertBooking, updateBooking, cancelBooking, markEmailSent,
  getPending24h, getPending1h, getPendingReview, completeBooking,
  getUpcoming
};
