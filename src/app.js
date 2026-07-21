/* INT Globe — localStorage edition */

var STORAGE_KEY = 'intglobe_pins';
var AUTHOR_KEY  = 'intglobe_author';

function loadPins() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch (_) { return []; }
}
function savePins(pins) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  updateCount();
}
function getAuthor() { return localStorage.getItem(AUTHOR_KEY) || ''; }
function setAuthor(n) { localStorage.setItem(AUTHOR_KEY, n); }
function genId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Map ───────────────────────────────────────────────────────────────────────
var map, personalLayer, missionLayer;
var placing = false;
var pendingLL = null;
var store = {};

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
  var c = type === 'personal' ? '#4fc3f7' : '#ff8a65';
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="32" viewBox="0 0 22 32">' +
    '<path d="M11 0C4.9 0 0 4.9 0 11c0 8.3 11 21 11 21S22 19.3 22 11C22 4.9 17.1 0 11 0z"' +
    ' fill="' + c + '" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>' +
    '<circle cx="11" cy="11" r="4.5" fill="white" opacity="0.85"/></svg>';
  return L.divIcon({ html: svg, className: '', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -34] });
}

function renderPin(pin) {
  var layer = pin.pin_type === 'personal' ? personalLayer : missionLayer;
  var m = L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.pin_type) });
  var preview = (pin.story || '').slice(0, 90) + ((pin.story || '').length > 90 ? '\u2026' : '');
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
  store[pin.id] = pin;
}

function reloadAllPins() {
  personalLayer.clearLayers();
  missionLayer.clearLayers();
  store = {};
  loadPins().forEach(renderPin);
  updateCount();
}

function updateCount() {
  var pins = loadPins();
  var p = pins.filter(function(x) { return x.pin_type === 'personal'; }).length;
  var m = pins.filter(function(x) { return x.pin_type === 'mission'; }).length;
  document.getElementById('pin-count').textContent =
    p + ' personal  \u00B7  ' + m + ' mission  \u00B7  ' + pins.length + ' total';
}

// ── Layer toggles ─────────────────────────────────────────────────────────────
document.getElementById('toggle-personal').addEventListener('change', function(e) {
  if (e.target.checked) map.addLayer(personalLayer); else map.removeLayer(personalLayer);
});
document.getElementById('toggle-mission').addEventListener('change', function(e) {
  if (e.target.checked) map.addLayer(missionLayer); else map.removeLayer(missionLayer);
});

// ── Author name ───────────────────────────────────────────────────────────────
var authorInput = document.getElementById('author-input');
authorInput.value = getAuthor();
authorInput.addEventListener('input', function() {
  setAuthor(authorInput.value.trim());
  updateFab();
});
function updateFab() {
  var fab = document.getElementById('fab');
  if (getAuthor()) fab.classList.remove('hidden');
  else fab.classList.add('hidden');
}

// ── Add Pin — two-step flow ───────────────────────────────────────────────────
// Step 1: click FAB  → show hint bar, enter crosshair mode
// Step 2: click map  → record coordinates, show form modal
// Step 3: fill form  → save

var fab       = document.getElementById('fab');
var placeHint = document.getElementById('place-hint');
var pinModal  = document.getElementById('pin-modal');
var saveBtn   = document.getElementById('save-btn');

fab.addEventListener('click', function() {
  if (placing) cancelPlace(); else startPlace();
});

document.getElementById('hint-cancel').addEventListener('click', cancelPlace);

function startPlace() {
  placing = true; pendingLL = null;
  fab.classList.add('placing'); fab.title = 'Cancel (Esc)';
  map.getContainer().style.cursor = 'crosshair';
  placeHint.classList.remove('hidden');
  pinModal.classList.add('hidden');
}

function cancelPlace() {
  placing = false; pendingLL = null;
  fab.classList.remove('placing'); fab.title = 'Add pin';
  map.getContainer().style.cursor = '';
  placeHint.classList.add('hidden');
  pinModal.classList.add('hidden');
}

// Step 2: map click — record location, open form
function onMapClick(e) {
  if (!placing) return;
  pendingLL = e.latlng;
  // Reset form
  document.getElementById('f-type').value    = 'personal';
  document.getElementById('f-title').value   = '';
  document.getElementById('f-story').value   = '';
  document.getElementById('f-country').value = '';
  document.getElementById('f-coords').textContent =
    '\uD83D\uDCCD ' + e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
  placeHint.classList.add('hidden');
  pinModal.classList.remove('hidden');
  document.getElementById('f-title').focus();
}

document.getElementById('cancel-btn').addEventListener('click', cancelPlace);
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') cancelPlace(); });

// Step 3: save
saveBtn.addEventListener('click', function() {
  if (!pendingLL) return;
  var author = getAuthor();
  if (!author) { alert('Please enter your name in the header first.'); return; }
  var pin = {
    id:          genId(),
    pin_type:    document.getElementById('f-type').value,
    title:       document.getElementById('f-title').value.trim(),
    story:       document.getElementById('f-story').value.trim(),
    lat:         pendingLL.lat,
    lng:         pendingLL.lng,
    country:     document.getElementById('f-country').value.trim(),
    author_name: author,
    created_at:  new Date().toISOString(),
  };
  if (!pin.title) { alert('A title is required.'); return; }
  var pins = loadPins();
  pins.push(pin);
  savePins(pins);
  renderPin(pin);
  cancelPlace();
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
    '\uD83D\uDCCD ' + (p.country ? p.country + '  ' : '') +
    '(' + (+p.lat).toFixed(3) + ', ' + (+p.lng).toFixed(3) + ')';
  document.getElementById('v-author').textContent   =
    '\uD83D\uDC64 ' + (p.author_name || 'Anonymous') + '  \u00B7  ' +
    new Date(p.created_at).toLocaleDateString();
  document.getElementById('v-story').textContent    = p.story || '(No story provided)';
  var acts = document.getElementById('v-actions');
  acts.innerHTML = '';
  if (p.author_name === getAuthor() && getAuthor()) {
    var d = document.createElement('button');
    d.className = 'ghost danger'; d.textContent = 'Delete Pin';
    d.onclick = function() { deletePin(id); };
    acts.appendChild(d);
  }
  viewModal.classList.remove('hidden');
};

document.getElementById('v-close').addEventListener('click', function() { viewModal.classList.add('hidden'); });
viewModal.addEventListener('click', function(e) { if (e.target === viewModal) viewModal.classList.add('hidden'); });

function deletePin(id) {
  if (!confirm('Delete this pin? This cannot be undone.')) return;
  var pins = loadPins().filter(function(p) { return p.id !== id; });
  savePins(pins);
  delete store[id];
  [personalLayer, missionLayer].forEach(function(l) {
    l.eachLayer(function(m) { if (m._pinId === id) l.removeLayer(m); });
  });
  viewModal.classList.add('hidden');
}

// ── Export / Import ───────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', function() {
  var pins = loadPins();
  var blob = new Blob([JSON.stringify(pins, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'int-globe-pins-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
});

document.getElementById('import-input').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var incoming = JSON.parse(ev.target.result);
      if (!Array.isArray(incoming)) throw new Error('Not an array');
      var existing = loadPins();
      var existingIds = {};
      existing.forEach(function(p) { existingIds[p.id] = true; });
      var added = 0;
      incoming.forEach(function(p) {
        if (p.id && p.pin_type && p.title && p.lat != null && p.lng != null && !existingIds[p.id]) {
          existing.push(p); added++;
        }
      });
      savePins(existing);
      reloadAllPins();
      alert('Imported ' + added + ' new pin(s).');
    } catch (_) { alert('Invalid file. Please export from INT Globe first.'); }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ── Util ──────────────────────────────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
initMap();
reloadAllPins();
updateFab();
