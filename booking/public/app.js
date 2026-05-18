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
let allBlocksCache = [];
let editingClientId = null;
let editingBookingId = null;
let pickerDate = null;
let pickerTime = null;
let blockedSlotsCache = null;
let blockedSlotsCacheDate = null;
let pickerDayFullyBlocked = false;
let detailClientId = null;
let pendingPrefillClientId = null;
const calStates = {};

// ============================================================
//  UTILS
// ============================================================
// Sigurno parsiranje DATE iz baze (izbjegava timezone pomak)
function parseDatum(datum) {
  if (!datum) return '';
  // Čisti "YYYY-MM-DD" string — vrati direktno, nema konverzije
  const str = String(datum);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Date objekt ili ISO string s vremenom — koristi LOKALNE metode
  const d = datum instanceof Date ? datum : new Date(str);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function datumToLocal(datum) {
  const [y, m, d] = parseDatum(datum).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // lokalno podne, bez UTC pomaka
}

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

function calInit(id, { selected = null, marked = [], blockedDays = [], partialBlockedDays = [], minDate = null, disableBlocked = false, onSelect } = {}) {
  const d = selected ? new Date(selected + 'T12:00:00') : new Date();
  calStates[id] = { year: d.getFullYear(), month: d.getMonth(), selected, marked, blockedDays, partialBlockedDays, minDate, disableBlocked, onSelect };
  calRender(id);
}

function calRender(id) {
  const s = calStates[id];
  const el = document.getElementById(id);
  if (!el || !s) return;
  const { year, month, selected, marked, minDate } = s;
  const blockedDays = s.blockedDays || [];
  const partialBlockedDays = s.partialBlockedDays || [];
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
    const isBlocked = blockedDays.includes(ds);
    const isPartial = !isBlocked && partialBlockedDays.includes(ds);
    const isDisabled = isPast || (isBlocked && s.disableBlocked);
    const cls = ['mcal-day',
      ds === todayStr ? 'is-today' : '',
      ds === selected ? 'is-sel' : '',
      marked.includes(ds) ? 'is-marked' : '',
      isBlocked ? (s.disableBlocked ? 'is-blocked-grey' : 'is-blocked') : '',
      isPartial ? 'is-partial-blocked' : '',
      isPast ? 'is-past' : ''
    ].filter(Boolean).join(' ');
    html += `<div class="${cls}" ${!isDisabled ? `onclick="calClick('${id}','${ds}')"` : ''}>
      <span>${d}</span>
      ${marked.includes(ds) ? '<i class="cal-dot"></i>' : ''}
      ${isBlocked && !s.disableBlocked ? '<i class="cal-blk"></i>' : ''}
      ${isPartial ? '<i class="cal-blk"></i>' : ''}
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
function initBookingPicker(blockedPeriods = []) {
  pickerDate = null;
  pickerTime = null;
  blockedSlotsCache = null;
  blockedSlotsCacheDate = null;
  document.getElementById('bf-datetime').value = '';
  const disp = document.getElementById('bf-dt-display');
  if (disp) { disp.textContent = ''; disp.className = 'dt-display'; }
  const tw = document.getElementById('booking-time-wrap');
  if (tw) tw.style.display = 'none';

  const fullBlockedDays = [...new Set(
    blockedPeriods.filter(bp => bp.cijeli_dan).map(bp => parseDatum(bp.datum))
  )];
  const partialBlockedDays = [...new Set(
    blockedPeriods.filter(bp => !bp.cijeli_dan).map(bp => parseDatum(bp.datum))
  )];

  const today = new Date().toISOString().slice(0, 10);
  calInit('booking-date-cal', {
    minDate: today,
    blockedDays: fullBlockedDays,
    disableBlocked: true,
    onSelect: async (ds) => {
      pickerDate = ds;
      pickerTime = null;
      blockedSlotsCache = null;
      blockedSlotsCacheDate = null;
      document.getElementById('bf-datetime').value = '';
      await renderPickerSlots();
      updateDtDisplay();
    }
  });
}

async function getBlockedSlots(date) {
  if (blockedSlotsCacheDate === date && blockedSlotsCache !== null) return blockedSlotsCache;

  const [dayBookings, blockedPeriods] = await Promise.all([
    api('GET', `/api/bookings?date=${date}`),
    api('GET', `/api/blocked-periods?date=${date}`)
  ]);

  const blocked = new Set();
  pickerDayFullyBlocked = false;

  // Provjeri cijeli dan
  const fullDayBlock = blockedPeriods.find(bp => bp.cijeli_dan);
  if (fullDayBlock) {
    pickerDayFullyBlocked = true;
    for (let h = 8; h <= 19; h++) {
      blocked.add(`${String(h).padStart(2,'0')}:00`);
      blocked.add(`${String(h).padStart(2,'0')}:30`);
    }
    blockedSlotsCacheDate = date;
    blockedSlotsCache = blocked;
    return blocked;
  }

  // Parcijalne blokade (određeni sati)
  for (const bp of blockedPeriods) {
    if (bp.od && bp.do) {
      const [oh, om] = bp.od.slice(0, 5).split(':').map(Number);
      const [dh, dm] = bp.do.slice(0, 5).split(':').map(Number);
      const startMin = oh * 60 + om;
      const endMin = dh * 60 + dm;
      for (let min = startMin; min < endMin; min += 30) {
        blocked.add(`${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`);
      }
    }
  }

  // Postojeće rezervacije
  for (const b of dayBookings) {
    if (b.status === 'cancelled') continue;
    const timeStr = b.datum_vrijeme.slice(11, 16);
    const [h, m] = timeStr.split(':').map(Number);
    const startMin = h * 60 + m;
    const duration = parseInt(b.trajanje) || 30;
    for (let offset = 0; offset < duration; offset += 30) {
      const total = startMin + offset;
      blocked.add(`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`);
    }
  }

  blockedSlotsCacheDate = date;
  blockedSlotsCache = blocked;
  return blocked;
}

function getSelectedServiceDuration() {
  const serviceId = document.getElementById('bf-service').value;
  const svc = services.find(s => String(s.id) === String(serviceId));
  return parseInt(svc?.trajanje) || 30;
}

function slotAvailable(time, blocked, duration) {
  const [h, m] = time.split(':').map(Number);
  const startMin = h * 60 + m;
  for (let offset = 0; offset < duration; offset += 30) {
    const total = startMin + offset;
    const t = `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
    if (blocked.has(t)) return false;
  }
  return true;
}

async function renderPickerSlots() {
  const wrap = document.getElementById('booking-time-wrap');
  const el = document.getElementById('booking-time-slots');
  if (!wrap || !el) return;
  wrap.style.display = 'block';

  const slots = [];
  for (let h = 7; h <= 19; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    slots.push(`${String(h).padStart(2,'0')}:30`);
  }

  const blocked = pickerDate ? await getBlockedSlots(pickerDate) : new Set();

  // Cijeli dan blokiran
  if (pickerDayFullyBlocked) {
    pickerTime = null;
    document.getElementById('bf-datetime').value = '';
    updateDtDisplay();
    el.innerHTML = '<div class="day-blocked-msg">🚫 Ovaj dan je blokiran</div>';
    return;
  }

  const duration = getSelectedServiceDuration();

  // If currently selected time is now blocked, deselect it
  if (pickerTime && !slotAvailable(pickerTime, blocked, duration)) {
    pickerTime = null;
    document.getElementById('bf-datetime').value = '';
    updateDtDisplay();
  }

  el.innerHTML = '<div class="tslots">' +
    slots.map(t => {
      const avail = slotAvailable(t, blocked, duration);
      const cls = `tslot${t === pickerTime ? ' sel' : ''}${!avail ? ' blocked' : ''}`;
      return `<button class="${cls}" ${!avail ? 'disabled' : `onclick="pickTime('${t}')"`}>${t}</button>`;
    }).join('') +
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
function openVise() {
  document.getElementById('vise-overlay').classList.add('open');
  document.getElementById('vise-sheet').classList.add('open');
  document.getElementById('btn-vise').classList.add('active');
}
function closeVise() {
  document.getElementById('vise-overlay').classList.remove('open');
  document.getElementById('vise-sheet').classList.remove('open');
  document.getElementById('btn-vise').classList.remove('active');
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('[data-view]').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${id}`).classList.add('active');
  document.querySelectorAll(`[data-view="${id}"]`).forEach(el => el.classList.add('active'));
  // Više gumb ostaje aktivan kad su otvoreni services ili blocks
  if (['services', 'blocks'].includes(id)) {
    const btn = document.getElementById('btn-vise');
    if (btn) btn.classList.add('active');
  }
  document.getElementById('topbar-title').textContent =
    { dashboard: 'Dashboard', clients: 'Klijenti', booking: 'Novi termin', bookings: 'Termini', services: 'Usluge', blocks: 'Blokade' }[id];

  if (id === 'dashboard') loadDashboard();
  if (id === 'clients') loadClients();
  if (id === 'booking') loadBookingForm();
  if (id === 'bookings') loadBookings();
  if (id === 'services') loadServices();
  if (id === 'blocks') loadBlocks();
}

// ============================================================
//  DASHBOARD
// ============================================================
async function loadDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [todayBookings, upcoming, weekData] = await Promise.all([
    api('GET', `/api/bookings?date=${today}`),
    api('GET', '/api/bookings/upcoming'),
    api('GET', '/api/bookings/upcoming-week-count')
  ]);

  document.getElementById('stat-today').textContent = todayBookings.length;
  document.getElementById('stat-upcoming').textContent = weekData.count;

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
  const filtered = (search
    ? clients.filter(c => `${c.ime} ${c.prezime} ${c.email} ${c.telefon}`.toLowerCase().includes(search.toLowerCase()))
    : clients).slice().sort((a, b) =>
      a.ime.localeCompare(b.ime, 'hr') || a.prezime.localeCompare(b.prezime, 'hr')
    );

  const tbody = document.getElementById('clients-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty">Nema klijenata.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(c => `
    <tr class="client-row" onclick="openClientDetail(${c.id})">
      <td><strong style="color:#fff">${c.ime} ${c.prezime}</strong></td>
      <td>${c.telefon || '—'}</td>
      <td>${c.email || '—'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-outline" onclick="openEditClient(${c.id})">Uredi</button>
          <button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id})">Obriši</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function bookFromDetail() {
  pendingPrefillClientId = detailClientId;
  closeClientDetail();
  showView('booking');
}

async function openClientDetail(id) {
  detailClientId = id;
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
  const clientToFill = prefillClientId || pendingPrefillClientId;
  pendingPrefillClientId = null;

  const [clientsData, servicesData, blockedPeriods] = await Promise.all([
    api('GET', '/api/clients'),
    api('GET', '/api/services'),
    api('GET', '/api/blocked-periods')
  ]);
  clients = clientsData;
  services = servicesData;

  // Client search init
  document.getElementById('bf-client').value = '';
  document.getElementById('bf-client-search').value = '';
  document.getElementById('bf-client-dropdown').style.display = 'none';
  if (clientToFill) {
    const c = clients.find(x => x.id === clientToFill || String(x.id) === String(clientToFill));
    if (c) {
      document.getElementById('bf-client').value = c.id;
      document.getElementById('bf-client-search').value = `${c.ime} ${c.prezime}`;
    }
  }

  const serviceSel = document.getElementById('bf-service');
  serviceSel.innerHTML = '<option value="">— Odaberi uslugu —</option>' +
    services.map(s => `<option value="${s.id}">${s.naziv}${s.trajanje ? ' · ' + s.trajanje + ' min' : ''}</option>`).join('');

  // Re-render slots on service change
  serviceSel.onchange = async () => {
    if (pickerDate) {
      blockedSlotsCache = null;
      await renderPickerSlots();
    }
  };

  initBookingPicker(blockedPeriods);
  document.getElementById('bf-napomena').value = '';
  document.getElementById('new-client-form').style.display = 'none';
  document.getElementById('bf-new-client-toggle').checked = false;
}

function initClientSearch() {
  const search = document.getElementById('bf-client-search');
  const dropdown = document.getElementById('bf-client-dropdown');
  const hidden = document.getElementById('bf-client');
  if (!search) return;

  function showDropdown(q) {
    const matches = q
      ? clients.filter(c => `${c.ime} ${c.prezime} ${c.email} ${c.telefon || ''}`.toLowerCase().includes(q)).slice(0, 10)
      : clients.slice(0, 10);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(c =>
      `<div class="client-option" onclick="selectClientSearch(${c.id},'${(c.ime+' '+c.prezime).replace(/'/g,"\\'")}')">
        <span class="co-name">${c.ime} ${c.prezime}</span>
        <span class="co-email">${c.email}</span>
      </div>`
    ).join('');
    dropdown.style.display = 'block';
  }

  search.addEventListener('focus', () => showDropdown(search.value.trim().toLowerCase()));
  search.addEventListener('input', () => {
    hidden.value = '';
    showDropdown(search.value.trim().toLowerCase());
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.client-search-wrap')) dropdown.style.display = 'none';
  });
}

function selectClientSearch(id, name) {
  document.getElementById('bf-client').value = id;
  document.getElementById('bf-client-search').value = name;
  document.getElementById('bf-client-dropdown').style.display = 'none';
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
  const blocks = allBlocksCache.filter(b => parseDatum(b.datum) === ds);
  renderBookings(bookings, blocks);
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
  const [allB, allBlocks] = await Promise.all([
    api('GET', '/api/bookings'),
    api('GET', '/api/blocked-periods')
  ]);
  allBookingsCache = allB;
  allBlocksCache = allBlocks;
  const markedDates = [...new Set(allBookingsCache.map(b => b.datum_vrijeme.slice(0, 10)))];
  const fullBlockedDays = [...new Set(allBlocks.filter(b => b.cijeli_dan).map(b => parseDatum(b.datum)))];
  const partialBlockedDays = [...new Set(allBlocks.filter(b => !b.cijeli_dan).map(b => parseDatum(b.datum)))];

  if (!calStates['bookings-calendar']) {
    calInit('bookings-calendar', {
      marked: markedDates,
      blockedDays: fullBlockedDays,
      partialBlockedDays,
      selected: dateFilter || null,
      onSelect: onBookingCalSelect
    });
  } else {
    calStates['bookings-calendar'].marked = markedDates;
    calStates['bookings-calendar'].blockedDays = fullBlockedDays;
    calStates['bookings-calendar'].partialBlockedDays = partialBlockedDays;
    if (dateFilter) calStates['bookings-calendar'].selected = dateFilter;
    calRender('bookings-calendar');
  }

  const selDate = calStates['bookings-calendar']?.selected;
  if (selDate) {
    bookings = allBookingsCache.filter(b => b.datum_vrijeme.startsWith(selDate));
    const blocks = allBlocksCache.filter(b => parseDatum(b.datum) === selDate);
    updateBookingsFilterLabel(selDate);
    renderBookings(bookings, blocks);
  } else {
    bookings = allBookingsCache;
    updateBookingsFilterLabel('');
    renderBookings(bookings, allBlocksCache);
  }
}

function renderBookings(list, blocks = []) {
  const tbody = document.getElementById('bookings-tbody');

  // Spoji termine i blokade, sortiraj po datumu/vremenu
  const combined = [
    ...list.map(b => ({ type: 'booking', sortKey: b.datum_vrijeme, data: b })),
    ...blocks.map(b => ({
      type: 'block', data: b,
      sortKey: parseDatum(b.datum) + 'T' + (b.od ? b.od.slice(0, 5) : '00:00')
    }))
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  if (combined.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty">Nema termina.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = combined.map(item => {
    if (item.type === 'block') {
      const b = item.data;
      const dateStr = datumToLocal(b.datum).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = b.cijeli_dan ? 'Cijeli dan' : `${b.od ? b.od.slice(0,5) : '?'} – ${b.do ? b.do.slice(0,5) : '?'}`;
      return `<tr style="opacity:0.75;">
        <td style="color:var(--danger)">🔒 ${dateStr}</td>
        <td style="color:var(--muted)">—</td>
        <td style="color:var(--danger);font-weight:600;">${timeStr}</td>
        <td><span class="badge" style="background:rgba(224,90,90,0.15);color:var(--danger);border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;">BLOKADA</span></td>
        <td style="color:var(--muted)">${b.razlog || '—'}</td>
        <td><button class="btn btn-sm btn-outline" onclick="removeBlockFromBookings(${b.id})">Ukloni</button></td>
      </tr>`;
    }
    const b = item.data;
    return `<tr>
      <td>${fmt(b.datum_vrijeme)}</td>
      <td><strong style="color:#fff">${b.ime} ${b.prezime}</strong></td>
      <td>${b.usluga}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${b.napomena || '—'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          ${b.status === 'pending' ? `<button class="btn btn-sm btn-danger" onclick="cancelBooking(${b.id})">Otkaži</button>` : `<button class="btn btn-sm btn-outline" onclick="cancelBooking(${b.id})">Briši</button>`}
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function removeBlockFromBookings(id) {
  if (!confirm('Ukloniti ovu blokadu?')) return;
  try {
    await api('DELETE', `/api/blocked-periods/${id}`);
    toast('Blokada uklonjena.');
    blockedSlotsCache = null; blockedSlotsCacheDate = null;
    loadBookings(calStates['bookings-calendar']?.selected || '');
  } catch (err) { toast(err.message, 'error'); }
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
//  QUICK BOOKING MODAL (u Termini tabu)
// ============================================================
let qbDate = null;
let qbTime = null;
let qbBlockedSlotsCache = null;
let qbBlockedSlotsCacheDate = null;
let qbDayFullyBlocked = false;

async function openQuickBooking() {
  qbDate = calStates['bookings-calendar']?.selected || new Date().toISOString().slice(0, 10);
  qbTime = null;
  qbBlockedSlotsCache = null;
  qbBlockedSlotsCacheDate = null;
  qbDayFullyBlocked = false;

  const [clientsData, servicesData, blockedPeriods] = await Promise.all([
    api('GET', '/api/clients'),
    api('GET', '/api/services'),
    api('GET', '/api/blocked-periods')
  ]);
  clients = clientsData;
  services = servicesData;

  const d = new Date(qbDate + 'T12:00:00');
  document.getElementById('qb-modal-date').textContent =
    d.toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const svc = document.getElementById('qb-service');
  svc.innerHTML = '<option value="">— Odaberi uslugu —</option>' +
    services.map(s => `<option value="${s.id}">${s.naziv}${s.trajanje ? ' · ' + s.trajanje + ' min' : ''}</option>`).join('');
  svc.onchange = async () => { qbBlockedSlotsCache = null; await renderQbSlots(); };

  document.getElementById('qb-client-search').value = '';
  document.getElementById('qb-client').value = '';
  document.getElementById('qb-napomena').value = '';
  document.getElementById('qb-datetime').value = '';

  const qbFullBlockedDays = [...new Set(blockedPeriods.filter(b => b.cijeli_dan).map(b => parseDatum(b.datum)))];
  const today = new Date().toISOString().slice(0, 10);
  calInit('qb-date-cal', {
    selected: qbDate,
    minDate: today,
    blockedDays: qbFullBlockedDays,
    disableBlocked: true,
    onSelect: async (ds) => {
      qbDate = ds;
      qbTime = null;
      qbBlockedSlotsCache = null;
      qbBlockedSlotsCacheDate = null;
      document.getElementById('qb-datetime').value = '';
      const dd = new Date(ds + 'T12:00:00');
      document.getElementById('qb-modal-date').textContent =
        dd.toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      await renderQbSlots();
      updateQbDtDisplay();
    }
  });

  initQbClientSearch();
  await renderQbSlots();
  updateQbDtDisplay();
  document.getElementById('qb-modal').classList.add('open');
}

function closeQuickBooking() {
  document.getElementById('qb-modal').classList.remove('open');
}

async function getQbBlockedSlots(date) {
  if (qbBlockedSlotsCacheDate === date && qbBlockedSlotsCache !== null) return qbBlockedSlotsCache;
  const [dayBookings, blockedPeriods] = await Promise.all([
    api('GET', `/api/bookings?date=${date}`),
    api('GET', `/api/blocked-periods?date=${date}`)
  ]);
  const blocked = new Set();
  qbDayFullyBlocked = false;
  const fullDayBlock = blockedPeriods.find(bp => bp.cijeli_dan);
  if (fullDayBlock) {
    qbDayFullyBlocked = true;
    for (let h = 8; h <= 19; h++) {
      blocked.add(`${String(h).padStart(2,'0')}:00`);
      blocked.add(`${String(h).padStart(2,'0')}:30`);
    }
    qbBlockedSlotsCacheDate = date; qbBlockedSlotsCache = blocked; return blocked;
  }
  for (const bp of blockedPeriods) {
    if (bp.od && bp.do) {
      const [oh, om] = bp.od.slice(0,5).split(':').map(Number);
      const [dh, dm] = bp.do.slice(0,5).split(':').map(Number);
      for (let min = oh*60+om; min < dh*60+dm; min += 30)
        blocked.add(`${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`);
    }
  }
  for (const b of dayBookings) {
    if (b.status === 'cancelled') continue;
    const [h, m] = b.datum_vrijeme.slice(11,16).split(':').map(Number);
    const dur = parseInt(b.trajanje) || 30;
    for (let offset = 0; offset < dur; offset += 30) {
      const t = h*60+m+offset;
      blocked.add(`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`);
    }
  }
  qbBlockedSlotsCacheDate = date; qbBlockedSlotsCache = blocked; return blocked;
}

async function renderQbSlots() {
  const el = document.getElementById('qb-time-slots');
  if (!el) return;
  const slots = [];
  for (let h = 7; h <= 19; h++) { slots.push(`${String(h).padStart(2,'0')}:00`); slots.push(`${String(h).padStart(2,'0')}:30`); }
  const blocked = qbDate ? await getQbBlockedSlots(qbDate) : new Set();
  if (qbDayFullyBlocked) {
    qbTime = null; document.getElementById('qb-datetime').value = ''; updateQbDtDisplay();
    el.innerHTML = '<div class="day-blocked-msg">🚫 Ovaj dan je blokiran</div>'; return;
  }
  const svcId = document.getElementById('qb-service').value;
  const svc = services.find(s => String(s.id) === String(svcId));
  const duration = parseInt(svc?.trajanje) || 30;
  if (qbTime && !slotAvailable(qbTime, blocked, duration)) {
    qbTime = null; document.getElementById('qb-datetime').value = ''; updateQbDtDisplay();
  }
  el.innerHTML = '<div class="tslots">' +
    slots.map(t => {
      const avail = slotAvailable(t, blocked, duration);
      const cls = `tslot${t === qbTime ? ' sel' : ''}${!avail ? ' blocked' : ''}`;
      return `<button class="${cls}" ${!avail ? 'disabled' : `onclick="pickQbTime('${t}')"`}>${t}</button>`;
    }).join('') + '</div>';
}

function pickQbTime(t) {
  qbTime = t;
  renderQbSlots();
  if (qbDate) document.getElementById('qb-datetime').value = `${qbDate}T${qbTime}`;
  updateQbDtDisplay();
}

function updateQbDtDisplay() {
  const disp = document.getElementById('qb-dt-display');
  if (!disp) return;
  if (qbDate && qbTime) {
    const dt = new Date(`${qbDate}T${qbTime}`);
    disp.textContent = '✓ ' + dt.toLocaleString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    disp.className = 'dt-display dt-ready';
  } else {
    disp.textContent = qbDate ? 'Odaberi termin →' : '';
    disp.className = 'dt-display';
  }
}

function initQbClientSearch() {
  const oldSearch = document.getElementById('qb-client-search');
  const newSearch = oldSearch.cloneNode(true);
  oldSearch.parentNode.replaceChild(newSearch, oldSearch);
  const dropdown = document.getElementById('qb-client-dropdown');
  const hidden = document.getElementById('qb-client');

  function showDropdown(q) {
    const matches = q
      ? clients.filter(c => `${c.ime} ${c.prezime} ${c.email} ${c.telefon||''}`.toLowerCase().includes(q)).slice(0,10)
      : clients.slice(0,10);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(c =>
      `<div class="client-option" onclick="selectQbClientSearch(${c.id},'${(c.ime+' '+c.prezime).replace(/'/g,"\\'")}')">
        <span class="co-name">${c.ime} ${c.prezime}</span><span class="co-email">${c.email}</span>
      </div>`).join('');
    dropdown.style.display = 'block';
  }

  newSearch.addEventListener('focus', () => showDropdown(newSearch.value.trim().toLowerCase()));
  newSearch.addEventListener('input', () => { hidden.value = ''; showDropdown(newSearch.value.trim().toLowerCase()); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#qb-modal .client-search-wrap')) dropdown.style.display = 'none';
  });
}

function selectQbClientSearch(id, name) {
  document.getElementById('qb-client').value = id;
  document.getElementById('qb-client-search').value = name;
  document.getElementById('qb-client-dropdown').style.display = 'none';
}

async function submitQuickBooking() {
  const clientId = document.getElementById('qb-client').value;
  if (!clientId) { toast('Odaberi klijenta.', 'error'); return; }
  const serviceId = document.getElementById('qb-service').value;
  if (!serviceId) { toast('Odaberi uslugu.', 'error'); return; }
  const datetimeVal = document.getElementById('qb-datetime').value;
  if (!datetimeVal) { toast('Odaberi termin.', 'error'); return; }
  try {
    await api('POST', '/api/bookings', {
      client_id: parseInt(clientId), service_id: parseInt(serviceId),
      datum_vrijeme: datetimeVal, napomena: document.getElementById('qb-napomena').value.trim()
    });
    toast('Termin rezerviran! Email potvrda je poslana.');
    closeQuickBooking();
    loadBookings(calStates['bookings-calendar']?.selected || '');
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
//  QUICK BLOCK MODAL (u Termini tabu)
// ============================================================
function openQuickBlock() {
  const selDate = calStates['bookings-calendar']?.selected || new Date().toISOString().slice(0, 10);
  const d = new Date(selDate + 'T12:00:00');
  document.getElementById('qb-blk-datum').value = selDate;
  document.getElementById('qb-blk-date-display').textContent =
    d.toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('qb-blk-razlog').value = '';
  document.getElementById('qb-blk-cijeli').checked = true;
  document.getElementById('qb-blk-time-range').style.display = 'none';
  document.getElementById('qb-block-modal').classList.add('open');
}

function closeQuickBlock() {
  document.getElementById('qb-block-modal').classList.remove('open');
}

async function submitQuickBlock() {
  const datum = document.getElementById('qb-blk-datum').value;
  const cijeliDan = document.getElementById('qb-blk-cijeli').checked;
  const body = { datum, cijeli_dan: cijeliDan };
  if (!cijeliDan) {
    body.od = document.getElementById('qb-blk-od').value;
    body['do'] = document.getElementById('qb-blk-do').value;
    if (!body.od || !body['do']) { toast('Upiši "od" i "do" vrijeme.', 'error'); return; }
    if (body.od >= body['do']) { toast('"Od" mora biti prije "do".', 'error'); return; }
  }
  const razlog = document.getElementById('qb-blk-razlog').value.trim();
  if (razlog) body.razlog = razlog;
  try {
    await api('POST', '/api/blocked-periods', body);
    toast('Dan blokiran.');
    closeQuickBlock();
    blockedSlotsCache = null; blockedSlotsCacheDate = null;
    loadBookings(calStates['bookings-calendar']?.selected || '');
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
//  BLOCKS
// ============================================================
let blocksData = [];
let blockSelectedDate = null;

async function loadBlocks() {
  blocksData = await api('GET', '/api/blocked-periods');
  const fullBlockedDays = [...new Set(blocksData.filter(b => b.cijeli_dan).map(b => parseDatum(b.datum)))];
  const partialBlockedDays = [...new Set(blocksData.filter(b => !b.cijeli_dan).map(b => parseDatum(b.datum)))];

  if (!calStates['blocks-date-cal']) {
    calInit('blocks-date-cal', {
      blockedDays: fullBlockedDays,
      partialBlockedDays,
      onSelect: (ds) => {
        blockSelectedDate = ds;
        document.getElementById('blk-datum').value = ds;
        document.getElementById('blk-selected-date').textContent =
          datumToLocal(ds).toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      }
    });
  } else {
    calStates['blocks-date-cal'].blockedDays = fullBlockedDays;
    calStates['blocks-date-cal'].partialBlockedDays = partialBlockedDays;
    calRender('blocks-date-cal');
  }

  renderBlocksList();
}

function renderBlocksList() {
  const el = document.getElementById('blocks-list');
  if (blocksData.length === 0) {
    el.innerHTML = '<div class="empty">Nema blokada.</div>';
    return;
  }
  // Sortiraj po datumu
  const sorted = [...blocksData].sort((a, b) => a.datum.localeCompare(b.datum));
  el.innerHTML = sorted.map(b => {
    const dateStr = datumToLocal(b.datum).toLocaleDateString('hr-HR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const typeStr = b.cijeli_dan
      ? '<span class="blk-badge blk-full">Cijeli dan</span>'
      : `<span class="blk-badge blk-partial">${b.od ? b.od.slice(0,5) : '?'} – ${b.do ? b.do.slice(0,5) : '?'}</span>`;
    return `
      <div class="block-item">
        <div class="block-item-info">
          <div class="block-item-date">${dateStr}</div>
          <div class="block-item-meta">${typeStr}${b.razlog ? ' · ' + b.razlog : ''}</div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteBlock(${b.id})">Ukloni</button>
      </div>
    `;
  }).join('');
}

async function saveBlock() {
  const datum = document.getElementById('blk-datum').value;
  if (!datum) { toast('Odaberi datum u kalendaru.', 'error'); return; }

  const cijeliDan = document.getElementById('blk-cijeli').checked;
  const body = { datum, cijeli_dan: cijeliDan };

  if (!cijeliDan) {
    body.od = document.getElementById('blk-od').value;
    body['do'] = document.getElementById('blk-do').value;
    if (!body.od || !body['do']) { toast('Upiši "od" i "do" vrijeme.', 'error'); return; }
    if (body.od >= body['do']) { toast('"Od" mora biti prije "do".', 'error'); return; }
  }

  const razlog = document.getElementById('blk-razlog').value.trim();
  if (razlog) body.razlog = razlog;

  try {
    await api('POST', '/api/blocked-periods', body);
    toast('Dan blokiran.');
    document.getElementById('blk-razlog').value = '';
    // Resetiraj cache za blokade u picker-u
    blockedSlotsCache = null;
    blockedSlotsCacheDate = null;
    loadBlocks();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteBlock(id) {
  if (!confirm('Ukloniti ovu blokadu?')) return;
  try {
    await api('DELETE', `/api/blocked-periods/${id}`);
    toast('Blokada uklonjena.');
    blockedSlotsCache = null;
    blockedSlotsCacheDate = null;
    loadBlocks();
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
  initClientSearch();

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

  document.querySelectorAll('input[name="blk-type"]').forEach(r => {
    r.addEventListener('change', () => {
      const showTime = document.getElementById('blk-sati-radio').checked;
      document.getElementById('blk-time-range').style.display = showTime ? 'block' : 'none';
    });
  });

  document.querySelectorAll('input[name="qb-blk-type"]').forEach(r => {
    r.addEventListener('change', () => {
      const showTime = document.getElementById('qb-blk-sati').checked;
      document.getElementById('qb-blk-time-range').style.display = showTime ? 'block' : 'none';
    });
  });

  showView('dashboard');
});
