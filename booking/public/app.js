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
let editingClientId = null;
let editingBookingId = null;

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

  // Klijenti count
  const allClients = await api('GET', '/api/clients');
  document.getElementById('stat-clients').textContent = allClients.length;

  // Upcoming list
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
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteClient(id) {
  if (!confirm('Obrisati klijenta i sve njegove termine?')) return;
  try {
    await api('DELETE', `/api/clients/${id}`);
    toast('Klijent obrisan.');
    loadClients();
    closeClientDetail();
  } catch (err) {
    toast(err.message, 'error');
  }
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

  // Postavi default datum na danas, trenutno vrijeme zaokruženo na 30 min
  const now = new Date();
  now.setMinutes(now.getMinutes() >= 30 ? 60 : 30, 0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('bf-datetime').value = local;
  document.getElementById('bf-napomena').value = '';

  // Inline novi klijent form
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
    } catch (err) {
      toast(err.message, 'error'); return;
    }
  }

  if (!clientId) { toast('Odaberi klijenta.', 'error'); return; }
  const serviceId = document.getElementById('bf-service').value;
  if (!serviceId) { toast('Odaberi uslugu.', 'error'); return; }
  const datetimeVal = document.getElementById('bf-datetime').value;
  if (!datetimeVal) { toast('Odaberi datum i vrijeme.', 'error'); return; }

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
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================
//  BOOKINGS LIST
// ============================================================
async function loadBookings(dateFilter = '') {
  const url = dateFilter ? `/api/bookings?date=${dateFilter}` : '/api/bookings';
  bookings = await api('GET', url);
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
    loadBookings(document.getElementById('filter-date').value);
  } catch (err) {
    toast(err.message, 'error');
  }
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
  // Topbar date
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('hr-HR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Salon naziv u topbaru
  fetch('/api/config').then(r => r.json()).then(d => {
    if (d.salonName) document.title = d.salonName + ' — Admin';
  });

  // Nav (sidebar + bottom nav)
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Logout (sidebar + mobile)
  async function logout() {
    await fetch(BASE + '/auth/logout', { method: 'POST' });
    window.location.href = BASE + '/login.html';
  }
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-logout-mobile').addEventListener('click', logout);

  // Client search
  document.getElementById('client-search').addEventListener('input', e => loadClients(e.target.value));

  // Booking date filter
  document.getElementById('filter-date').addEventListener('change', e => loadBookings(e.target.value));
  document.getElementById('btn-clear-filter').addEventListener('click', () => {
    document.getElementById('filter-date').value = '';
    loadBookings();
  });

  // New client toggle
  document.getElementById('bf-new-client-toggle').addEventListener('change', function () {
    document.getElementById('new-client-form').style.display = this.checked ? 'block' : 'none';
    document.getElementById('bf-client').disabled = this.checked;
  });

  showView('dashboard');
});
