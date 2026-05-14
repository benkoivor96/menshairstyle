// ============================================================
//  CONFIG
// ============================================================
const BASE = window.BASE_PATH || '';

// ============================================================
//  STATE
// ============================================================
let clients = [];
let services = [];
let bookings = [];
let allBookingsCache = [];
let editingClientId = null;
let editingBookingId = null;
let pickerDate = null;
let pickerTime = null;
const calStates = {};

// ============================================================
//  UTILS
// ============================================================
function fmt(dtStr) {
  if (!dtStr) return '—';
  const d = new Date(dtStr);
  return d.toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(dtStr) {
  if (!dtStr) return '—';
  const d = new Date(dtStr);
  return d.toLocaleDateString('hr-HR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtHour(dtStr) {
  if (!dtStr) return '—';
  const d = new Date(dtStr);
  return d.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
}
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, 3500);
}
function statusBadge(status) {
  const labels = { pending: 'Rezervirano', completed: 'Završeno', cancelled: 'Otkazano' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

// ============================================================
//  API
// ============================================================
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Greška');
  return data;
}

// ============================================================
//  MINI CALENDAR ENGINE
// ============================================================
const MONTHS_HR = ['Siječanj','Veljača','Ožujak','Travanj','Svibanj','Lipanj','Srpanj','Kolovoz','Rujan','Listopad','Studeni','Prosinac'];
const DAYS_HR = ['Pon','Uto','Sri','Čet','Pet','Sub','Ned'];

function calInit(id, { selected = null, marked = [], minDate = null, onSelect } = {}) {
  const d = selected ? new Date(selected + 'T12:00:00') : new Date();
  calStates[id] = { year: d.getFullYear(), month: d.getMonth(), selected, marked, minDate, onSelect };
  calRender(id);
}

function calRender(id) {
  const s = calStates[id];
  const el = document.getElementById(id);
  if (!el || !s) return;
  const { year, month, selected, marked, minDate } = s;
  const first = new Date(year, month, 1).getDay();
  const offset = first === 0 ? 6 : first - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  let html = `<div class="mcal">
    <div class="mcal-nav">
      <button class="mcal-navbtn" onclick="calNav('${id}',-1)">&#8249;</button>
      <span class="mcal-title">${MONTHS_HR[month]} ${year}</span>
      <button class="mcal-navbtn" onclick="calNav('${id}',1)">&#8250;</button>
    </div>
    <div class="mcal-grid">`;

  DAYS_HR.forEach(d => { html += `<div class="mcal-hd">${d}</div>`; });
  for (let i = 0; i < offset; i++) html += '<div></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isPast = minDate ? ds < minDate : false;
    const cls = ['mcal-day',
      ds === todayStr ? 'is-today' : '',
      ds === selected ? 'is-sel' : '',
      marked.includes(ds) ? 'is-marked' : '',
      isPast ? 'is-past' : ''
    ].filter(Boolean).join(' ');
    html += `<div class="${cls}" ${!isPast ? `onclick="calClick('${id}','${ds}')"` : ''}>
      <span>${d}</span>${marked.includes(ds) ? '<i class="cal-dot"></i>' : ''}
    </div>`;
  }
  html += '</div></div>';
  el.innerHTML = html;
}

function calNav(id, dir) {
  const s = calStates[id];
  if (!s) return;
  s.month += dir;
  if (s.month > 11) { s.month = 0; s.year++; }
  if (s.month < 0) { s.month = 11; s.year--; }
  calRender(id);
}

function calClick(id, ds) {
  const s = calStates[id];
  if (!s) return;
  s.selected = ds;
  calRender(id);
  if (s.onSelect) s.onSelect(ds);
}

// ============================================================
//  BOOKING DATE/TIME PICKER
// ============================================================
function initBookingPicker() {
  pickerDate = null;
  pickerTime = null;
  document.getElementById('bf-datetime').value = '';
  const disp = document.getElementById('bf-dt-display');
  if (disp) { disp.textContent = ''; disp.className = 'dt-display'; }
  const tw = document.getElementById('booking-time-wrap');
  if (tw) tw.style.display = 'none';

  const today = new Date().toISOString().slice(0, 10);
  calInit('booking-date-cal', {
    minDate: today,
    onSelect: (ds) => {
      pickerDate = ds;
      pickerTime = null;
      document.getElementById('bf-datetime').value = '';
      renderPickerSlots();
      updateDtDisplay();
    }
  });
}

function renderPickerSlots() {
  const wrap = document.getElementById('booking-time-wrap');
  const el = document.getElementById('booking-time-slots');
  if (!wrap || !el) return;
  wrap.style.display = 'block';

  const slots = [];
  for (let h = 8; h <= 19; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    slots.push(`${String(h).padStart(2,'0')}:30`);
  }

  el.innerHTML = '<div class="tslots">' +
    slots.map(t => `<button class="tslot${t === pickerTime ? ' sel' : ''}" onclick="pickTime('${t}')">${t}</button>`).join('') +
    '</div>';
}

function pickTime(t) {
  pickerTime = t;
  renderPickerSlots();
  if (pickerDate) document.getElementById('bf-datetime').value = `${pickerDate}T${pickerTime}`;
  updateDtDisplay();
}

function updateDtDisplay() {
  const disp = document.getElementById('bf-dt-display');
  if (!disp) return;
  if (pickerDate && pickerTime) {
    const dt = new Date(`${pickerDate}T${pickerTime}`);
    disp.textContent = '✓ ' + dt.toLocaleString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    disp.className = 'dt-display dt-ready';
  } else if (pickerDate) {
    disp.textContent = 'Odaberi termin →';
    disp.className = 'dt-display';
  } else {
    disp.textContent = '';
    disp.className = 'dt-display';
  }
}

// ============================================================
//  NAVIGATION
// ============================================================
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('[data-view]').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${id}`).classList.add('active');
  document.querySelectorAll(`[data-view="${id}"]`).forEach(el => el.classList.add('active'));
  document.getElementById('topbar-title').textContent =
    { dashboard: 'Dashboard', clients: 'Klijenti', booking: 'Novi termin', bookings: 'Termini', services: 'Usluge' }[id];

  if (id === 'dashboard') loadDashboard();
  if (id === 'clients') loadClients();
  if (id === 'booking') loadBookingForm();
  if (id === 'bookings') loadBookings();
  if (id === 'services') loadServices();
}

// ============================================================
//  DASHBOARD
// ============================================================
async function loadDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [todayBookings, upcoming] = await Promise.all([
    api('GET', `/api/bookings?date=${today}`),
    api('GET', '/api/bookings/upcoming')
  ]);

  document.getElementById('stat-today').textContent = todayBookings.length;
  document.getElementById('stat-upcoming').textContent = upcoming.length;

  const allClients = await api('GET', '/api/clients');
  document.getElementById('stat-clients').textContent = allClients.length;

  const list = document.getElementById('upcoming-list');
  if (upcoming.length === 0) {
    list.innerHTML = '<div class="empty">Nema nadolazećih termina.</div>';
    return;
  }
  list.innerHTML = upcoming.map(b => `
    <div class="upcoming-card">
      <div class="upcoming-time">
        <div class="day">${fmtDate(b.datum_vrijeme)}</div>
        <div class="hour">${fmtHour(b.datum_vrijeme)}</div>
      </div>
      <div class="upcoming-info">
        <div class="name">${b.ime} ${b.prezime}</div>
        <div class="service">${b.usluga}</div>
      </div>
      ${statusBadge(b.status)}
    </div>
  `).join('');
}

// ============================================================
//  CLIENTS
// ============================================================
async function loadClients(search = '') {
  clients = await api('GET', '/api/clients');
  const filtered = search
    ? clients.filter(c => `${c.ime} ${c.prezime} ${c.email} ${c.telefon}`.toLowerCase().includes(search.toLowerCase()))
    : clients;

  const tbody = document.getElementById('clients-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty">Nema klijenata.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(c => `
    <tr>
      <td><strong style="color:#fff">${c.ime} ${c.prezime}</strong></td>
      <td>${c.email}</td>
      <td>${c.telefon || '—'}</td>
      <td>${new Date(c.created_at).toLocaleDateString('hr-HR')}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-outline" onclick="openClientDetail(${c.id})">Detalji</button>
          <button class="btn btn-sm btn-outline" onclick="openEditClient(${c.id})">Uredi</button>
          <button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id})">Obriši</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function openClientDetail(id) {
  const data = await api('GET', `/api/clients/${id}`);
  const panel = document.getElementById('client-detail');
  document.getElementById('detail-name').textContent = `${data.ime} ${data.prezime}`;
  document.getElementById('detail-meta').textContent = `${data.email}${data.telefon ? ' · ' + data.telefon : ''}`;

  const hist = document.getElementById('detail-history');
  if (!data.bookings || data.bookings.length === 0) {
    hist.innerHTML = '<div class="empty">Nema povijest termina.</div>';
  } else {
    hist.innerHTML = `<table><thead><tr><th>Datum</th><th>Usluga</th><th>Status</th><th>Napomena</th></tr></thead><tbody>` +
      data.bookings.map(b => `
        <tr>
          <td>${fmt(b.datum_vrijeme)}</td>
          <td>${b.usluga}</td>
          <td>${statusBadge(b.status)}</td>
          <td>${b.napomena || '—'}</td>
        </tr>
      `).join('') + '</tbody></table>';
  }
  panel.classList.add('open');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeClientDetail() {
  document.getElementById('client-detail').classList.remove('open');
}

function openAddClient() {
  editingClientId = null;
  document.getElementById('client-modal-title').textContent = 'Novi klijent';
  document.getElementById('client-form').reset();
  document.getElementById('client-modal').classList.add('open');
}

function openEditClient(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  editingClientId = id;
  document.getElementById('client-modal-title').textContent = 'Uredi klijenta';
  document.getElementById('f-ime').value = c.ime;
  document.getElementById('f-prezime').value = c.prezime;
  document.getElementById('f-email').value = c.email;
  document.getElementById('f-telefon').value = c.telefon || '';
  document.getElementById('client-modal').classList.add('open');
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('open');
}

async function saveClient() {
  const body = {
    ime: document.getElementById('f-ime').value.trim(),
    prezime: document.getElementById('f-prezime').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    telefon: document.getElementById('f-telefon').value.trim()
  };
  try {
    if (editingClientId) {
      await api('PUT', `/api/clients/${editingClientId}`, body);
      toast('Klijent ažuriran.');
    } else {
      await api('POST', '/api/clients', body);
      toast('Klijent dodan.');
    }
    closeClientModal();
    loadClients();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteClient(id) {
  if (!confirm('Obrisati klijenta i sve njegove termine?')) return;
  try {
    await api('DELETE', `/api/clients/${id}`);
    toast('Klijent obrisan.');
    loadClients();
    closeClientDetail();
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
//  BOOKING FORM
// ============================================================
async function loadBookingForm(prefillClientId) {
  [clients, services] = await Promise.all([
    api('GET', '/api/clients'),
    api('GET', '/api/services')
  ]);

  const clientSel = document.getElementById('bf-client');
  clientSel.innerHTML = '<option value="">— Odaberi klijenta —</option>' +
    clients.map(c => `<option value="${c.id}">${c.ime} ${c.prezime} (${c.email})</option>`).join('');
  if (prefillClientId) clientSel.value = prefillClientId;

  const serviceSel = document.getElementById('bf-service');
  serviceSel.innerHTML = '<option value="">— Odaberi uslugu —</option>' +
    services.map(s => `<option value="${s.id}">${s.naziv}${s.trajanje ? ' · ' + s.trajanje + ' min' : ''}</option>`).join('');

  initBookingPicker();
  document.getElementById('bf-napomena').value = '';
  document.getElementById('new-client-form').style.display = 'none';
  document.getElementById('bf-new-client-toggle').checked = false;
}

async function submitBooking() {
  const newClientToggle = document.getElementById('bf-new-client-toggle').checked;
  let clientId = document.getElementById('bf-client').value;

  if (newClientToggle) {
    const newClient = {
      ime: document.getElementById('nc-ime').value.trim(),
      prezime: document.getElementById('nc-prezime').value.trim(),
      email: document.getElementById('nc-email').value.trim(),
      telefon: document.getElementById('nc-telefon').value.trim()
    };
    if (!newClient.ime || !newClient.prezime || !newClient.email) {
      toast('Upiši ime, prezime i email novog klijenta.', 'error'); return;
    }
    try {
      const created = await api('POST', '/api/clients', newClient);
      clientId = created.id;
    } catch (err) { toast(err.message, 'error'); return; }
  }

  if (!clientId) { toast('Odaberi klijenta.', 'error'); return; }
  const serviceId = document.getElementById('bf-service').value;
  if (!serviceId) { toast('Odaberi uslugu.', 'error'); return; }
  const datetimeVal = document.getElementById('bf-datetime').value;
  if (!datetimeVal) { toast('Odaberi datum i termin.', 'error'); return; }

  try {
    await api('POST', '/api/bookings', {
      client_id: parseInt(clientId),
      service_id: parseInt(serviceId),
      datum_vrijeme: datetimeVal,
      napomena: document.getElementById('bf-napomena').value.trim()
    });
    toast('Termin rezerviran! Email potvrda je poslana.');
    loadBookingForm();
    showView('bookings');
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
//  BOOKINGS LIST
// ============================================================
function onBookingCalSelect(ds) {
  bookings = allBookingsCache.filter(b => b.datum_vrijeme.startsWith(ds));
  renderBookings(bookings);
  updateBookingsFilterLabel(ds);
}

function updateBookingsFilterLabel(ds) {
  const label = document.getElementById('bookings-filter-label');
  if (!label) return;
  if (ds) {
    const d = new Date(ds + 'T12:00:00');
    label.textContent = d.toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long' });
  } else {
    label.textContent = 'Svi termini';
  }
}

async function loadBookings(dateFilter = '') {
  allBookingsCache = await api('GET', '/api/bookings');
  const markedDates = [...new Set(allBookingsCache.map(b => b.datum_vrijeme.slice(0, 10)))];

  if (!calStates['bookings-calendar']) {
    calInit('bookings-calendar', {
      marked: markedDates,
      selected: dateFilter || null,
      onSelect: onBookingCalSelect
    });
  } else {
    calStates['bookings-calendar'].marked = markedDates;
    if (dateFilter) calStates['bookings-calendar'].selected = dateFilter;
    calRender('bookings-calendar');
  }

  const selDate = calStates['bookings-calendar']?.selected;
  if (selDate) {
    bookings = allBookingsCache.filter(b => b.datum_vrijeme.startsWith(selDate));
    updateBookingsFilterLabel(selDate);
  } else {
    bookings = allBookingsCache;
    updateBookingsFilterLabel('');
  }
  renderBookings(bookings);
}

function renderBookings(list) {
  const tbody = document.getElementById('bookings-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty">Nema termina.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(b => `
    <tr>
      <td>${fmt(b.datum_vrijeme)}</td>
      <td><strong style="color:#fff">${b.ime} ${b.prezime}</strong></td>
      <td>${b.usluga}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${b.napomena || '—'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          ${b.status === 'pending' ? `<button class="btn btn-sm btn-danger" onclick="cancelBooking(${b.id})">Otkaži</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function cancelBooking(id) {
  if (!confirm('Otkazati termin?')) return;
  try {
    await api('DELETE', `/api/bookings/${id}`);
    toast('Termin otkazan.');
    const selDate = calStates['bookings-calendar']?.selected || '';
    loadBookings(selDate);
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
//  SERVICES
// ============================================================
let editingServiceId = null;

async function loadServices() {
  services = await api('GET', '/api/services');
  const tbody = document.getElementById('services-tbody');
  if (services.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty">Nema usluga. Dodaj prvu uslugu.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = services.map(s => `
    <tr>
      <td><strong style="color:#fff">${s.naziv}</strong></td>
      <td>${s.trajanje ? s.trajanje + ' min' : '—'}</td>
      <td>${s.cijena ? s.cijena.toFixed(2) + ' €' : '—'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-outline" onclick="openEditService(${s.id})">Uredi</button>
          <button class="btn btn-sm btn-danger" onclick="deleteService(${s.id})">Obriši</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddService() {
  editingServiceId = null;
  document.getElementById('service-modal-title').textContent = 'Nova usluga';
  document.getElementById('s-naziv').value = '';
  document.getElementById('s-trajanje').value = '';
  document.getElementById('s-cijena').value = '';
  document.getElementById('service-modal').classList.add('open');
}

function openEditService(id) {
  const s = services.find(x => x.id === id);
  if (!s) return;
  editingServiceId = id;
  document.getElementById('service-modal-title').textContent = 'Uredi uslugu';
  document.getElementById('s-naziv').value = s.naziv;
  document.getElementById('s-trajanje').value = s.trajanje || '';
  document.getElementById('s-cijena').value = s.cijena || '';
  document.getElementById('service-modal').classList.add('open');
}

function closeServiceModal() {
  document.getElementById('service-modal').classList.remove('open');
}

async function saveService() {
  const body = {
    naziv: document.getElementById('s-naziv').value.trim(),
    trajanje: parseInt(document.getElementById('s-trajanje').value) || null,
    cijena: parseFloat(document.getElementById('s-cijena').value) || null
  };
  if (!body.naziv) { toast('Naziv je obavezan.', 'error'); return; }
  try {
    if (editingServiceId) {
      await api('PUT', `/api/services/${editingServiceId}`, body);
      toast('Usluga ažurirana.');
    } else {
      await api('POST', '/api/services', body);
      toast('Usluga dodana.');
    }
    closeServiceModal();
    loadServices();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteService(id) {
  if (!confirm('Obrisati ovu uslugu?')) return;
  try {
    await api('DELETE', `/api/services/${id}`);
    toast('Usluga obrisana.');
    loadServices();
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('hr-HR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  fetch('/api/config').then(r => r.json()).then(d => {
    if (d.salonName) document.title = d.salonName + ' — Admin';
  });

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  async function logout() {
    await fetch(BASE + '/auth/logout', { method: 'POST' });
    window.location.href = BASE + '/login.html';
  }
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-logout-mobile').addEventListener('click', logout);

  document.getElementById('client-search').addEventListener('input', e => loadClients(e.target.value));

  document.getElementById('btn-clear-filter').addEventListener('click', () => {
    if (calStates['bookings-calendar']) {
      calStates['bookings-calendar'].selected = null;
      calRender('bookings-calendar');
    }
    bookings = allBookingsCache;
    renderBookings(bookings);
    updateBookingsFilterLabel('');
  });

  document.getElementById('bf-new-client-toggle').addEventListener('change', function () {
    document.getElementById('new-client-form').style.display = this.checked ? 'block' : 'none';
    document.getElementById('bf-client').disabled = this.checked;
  });

  showView('dashboard');
});
