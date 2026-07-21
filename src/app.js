/* INT Globe — frontend logic
   Auth: SWA built-in auth (/.auth/login/aad)
   Map:  Leaflet + OpenStreetMap
   API:  Azure Functions (/api/pins)
*/

const API = '/api';
let map, personalLayer, missionLayer;
let user = null;
let placing = false;
let pendingLL = null;
const store = {};   // pinId -> pin object

// ── Auth ─────────────────────────────────────────────────────────────────────
async function loadUser() {
  try {
    const r = await fetch('/.auth/me');
    const d = await r.json();
    if (d.clientPrincipal) {
      user = { id: d.clientPrincipal.userId, name: d.clientPrincipal.userDetails };
      document.getElementById('auth-btn').textContent = 'Sign Out (' + user.name + ')';
      document.getElementById('fab').classList.remove('hidden');
    }
  } catch (_) {}
}

document.getElementById('auth-btn').addEventListener('click', () => {
  window.location.href = user ? '/.auth/logout' : '/.auth/login/aad';
});

// ── Map ──────────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { center: [20, 0], zoom: 2, minZoom: 2 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);
  personalLayer = L.layerGroup().addTo(map);
  missionLayer  = L.layerGroup().addTo(map);
  map.on('click', onMapClick);
}

function pinIcon(type) {
  const c = type === 'personal' ? '#4fc3f7' : '#ff8a65';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="32" viewBox="0 0 22 32">' +
    '<path d="M11 0C4.9 0 0 4.9 0 11c0 8.3 11 21 11 21S22 19.3 22 11C22 4.9 17.1 0 11 0z"' +
    ' fill="' + c + '" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>' +
    '<circle cx="11" cy="11" r="4.5" fill="white" opacity="0.85"/></svg>';
  return L.divIcon({ html: svg, className: '', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -34] });
}

function renderPin(pin) {
  const layer = pin.pin_type === 'personal' ? personalLayer : missionLayer;
  const m = L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.pin_type) });
  const preview = (pin.story || '').slice(0, 90) + ((pin.story || '').length > 90 ? '\u2026' : '');
  m.bindPopup(
    '<div class="popup">' +
    '<h4>' + esc(pin.title) + '</h4>' +
    (pin.country ? '<p>\uD83D\uDCCD ' + esc(pin.country) + '</p>' : '') +
    (preview     ? '<p>' + esc(preview) + '</p>' : '') +
    '<p>\uD83D\uDC64 ' + esc(pin.author_name || 'Anonymous') + '</p>' +
    '<button onclick="openView(\'' + pin.id + '\')">Read full story \u2192</button>' +
    '</div>'
  );
  m._pinId = pin.id;
  layer.addLayer(m);
}

// ── Load pins ─────────────────────────────────────────────────────────────────
async function loadPins() {
  try {
    const pins = await fetch(API + '/pins').then(r => r.json());
    personalLayer.clearLayers();
    missionLayer.clearLayers();
    pins.forEach(p => { store[p.id] = p; renderPin(p); });
  } catch (e) { console.error('loadPins:', e); }
}

// ── Layer toggles ─────────────────────────────────────────────────────────────
document.getElementById('toggle-personal').addEventListener('change', function(e) {
  if (e.target.checked) map.addLayer(personalLayer); else map.removeLayer(personalLayer);
});
document.getElementById('toggle-mission').addEventListener('change', function(e) {
  if (e.target.checked) map.addLayer(missionLayer); else map.removeLayer(missionLayer);
});

// ── Add Pin flow ──────────────────────────────────────────────────────────────
var fab      = document.getElementById('fab');
var pinModal = document.getElementById('pin-modal');
var saveBtn  = document.getElementById('save-btn');

fab.addEventListener('click', function() { placing ? cancelPlace() : startPlace(); });

function startPlace() {
  placing = true; pendingLL = null;
  fab.classList.add('placing'); fab.title = 'Cancel (Esc)';
  map.getContainer().style.cursor = 'crosshair';
  document.getElementById('f-title').value  = '';
  document.getElementById('f-story').value  = '';
  document.getElementById('f-country').value = '';
  document.getElementById('f-coords').textContent = '';
  saveBtn.disabled = true;
  pinModal.classList.remove('hidden');
}

function cancelPlace() {
  placing = false;
  fab.classList.remove('placing'); fab.title = 'Add pin';
  map.getContainer().style.cursor = '';
  pinModal.classList.add('hidden');
}

function onMapClick(e) {
  if (!placing) return;
  pendingLL = e.latlng;
  document.getElementById('f-coords').textContent =
    e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
  saveBtn.disabled = false;
  document.getElementById('f-title').focus();
}

document.getElementById('cancel-btn').addEventListener('click', cancelPlace);

document.addEventListener('keydown', function(e) { if (e.key === 'Escape') cancelPlace(); });

saveBtn.addEventListener('click', async function() {
  if (!pendingLL || !user) return;
  var body = {
    pin_type: document.getElementById('f-type').value,
    title:    document.getElementById('f-title').value.trim(),
    story:    document.getElementById('f-story').value.trim(),
    lat: pendingLL.lat, lng: pendingLL.lng,
    country: document.getElementById('f-country').value.trim(),
  };
  if (!body.title) { alert('A title is required.'); return; }
  saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026';
  try {
    var pin = await fetch(API + '/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) { if (!r.ok) throw r; return r.json(); });
    store[pin.id] = pin;
    renderPin(pin);
    cancelPlace();
  } catch (_) { alert('Save failed. Please try again.'); }
  saveBtn.disabled = false; saveBtn.textContent = 'Save Pin';
});

// ── View Pin ──────────────────────────────────────────────────────────────────
var viewModal = document.getElementById('view-modal');

window.openView = function(id) {
  var p = store[id]; if (!p) return;
  var badge = document.getElementById('v-badge');
  badge.textContent = p.pin_type === 'personal' ? '\uD83C\uDFE0 Personal Story' : '\uD83D\uDCCB Case / Mission';
  badge.className   = 'badge ' + p.pin_type;
  document.getElementById('v-title').textContent    = p.title;
  document.getElementById('v-location').textContent =
    '\uD83D\uDCCD ' + (p.country ? p.country + '  ' : '') + '(' + (+p.lat).toFixed(3) + ', ' + (+p.lng).toFixed(3) + ')';
  document.getElementById('v-author').textContent   =
    '\uD83D\uDC64 ' + (p.author_name || 'Anonymous') + '  \u00B7  ' + new Date(p.created_at).toLocaleDateString();
  document.getElementById('v-story').textContent    = p.story || '(No story provided)';
  var acts = document.getElementById('v-actions');
  acts.innerHTML = '';
  if (user && p.author_id === user.id) {
    var d = document.createElement('button');
    d.className = 'ghost danger'; d.textContent = 'Delete Pin';
    d.onclick = function() { deletePin(id); };
    acts.appendChild(d);
  }
  viewModal.classList.remove('hidden');
};

document.getElementById('v-close').addEventListener('click', function() { viewModal.classList.add('hidden'); });
viewModal.addEventListener('click', function(e) { if (e.target === viewModal) viewModal.classList.add('hidden'); });

async function deletePin(id) {
  if (!confirm('Delete this pin? This cannot be undone.')) return;
  try {
    var r = await fetch(API + '/pins/' + id, { method: 'DELETE' });
    if (!r.ok) throw r;
    delete store[id];
    [personalLayer, missionLayer].forEach(function(l) {
      l.eachLayer(function(m) { if (m._pinId === id) l.removeLayer(m); });
    });
    viewModal.classList.add('hidden');
  } catch (_) { alert('Delete failed. Please try again.'); }
}

// ── Util ──────────────────────────────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async function() {
  initMap();
  await loadUser();
  await loadPins();
})();
