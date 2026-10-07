/* INT Globe — localStorage edition */

var STORAGE_KEY = 'intglobe_pins';
var AUTHOR_KEY  = 'intglobe_author';

function loadPins() {
  try {
    var pins = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(pins) ? pins.filter(function(p) { return p.pin_type === 'personal'; }) : [];
  }
  catch (_) { return []; }
}
function savePins(pins) {
  var legacyPins = [];
  try {
    var storedPins = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(storedPins))
      legacyPins = storedPins.filter(function(p) { return p.pin_type !== 'personal'; });
  } catch (_) {}
  localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyPins.concat(pins)));
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
var map, personalLayer, globe;
var activeMode = 'map';
var isPresentation = false;
var placing = false;
var pendingLL = null;
var editingPinId = null;
var store = {};
var globeContainer = document.getElementById('globe');

function initMap() {
  map = L.map('map', { center: [20, 0], zoom: 2, minZoom: 2 });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Labels &copy; Esri, HERE, Garmin, FAO, NOAA, USGS, EPA, and NPS',
    maxZoom: 19,
    pane: 'overlayPane',
  }).addTo(map);
  personalLayer = L.layerGroup().addTo(map);
  map.on('click', onMapClick);
}

function initGlobe() {
  if (globe) return true;
  if (typeof THREE !== 'object') {
    alert('The globe graphics library could not be loaded. Check your internet connection and try again.');
    return false;
  }
  if (typeof Globe !== 'function') {
    alert('The 3D globe could not be loaded. Check your internet connection and try again.');
    return false;
  }
  globe = Globe()(globeContainer)
    .globeImageUrl('https://unpkg.com/three-globe@2.32.0/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe@2.32.0/example/img/earth-topology.png')
    .backgroundColor('#070b16')
    .showAtmosphere(true)
    .atmosphereColor('#72c8ff')
    .atmosphereAltitude(0.18)
    .pointsData([])
    .pointLat(function(pin) { return +pin.lat; })
    .pointLng(function(pin) { return +pin.lng; })
    .pointAltitude(0.004)
    .pointRadius(0.65)
    .pointResolution(12)
    .pointColor(function() { return '#ffc878'; })
    .onPointClick(function(pin) { window.openView(pin.id); })
    .objectsData([])
    .objectLat(function(pin) { return Math.max(-89.5, +pin.lat - 7); })
    .objectLng(function(pin) { return +pin.lng; })
    .objectAltitude(0.025)
    .objectFacesSurface(true)
    .objectThreeObject(createStoryTag)
    .onObjectClick(function(pin) { window.openView(pin.id); })
    .onGlobeClick(function(coords) {
      if (placing) onMapClick({ latlng: { lat: coords.lat, lng: coords.lng } });
    });
  globe.pointOfView({ lat: 18, lng: 0, altitude: 2.35 }, 0);
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.32;
  globe.controls().enableDamping = true;
  updateGlobeSize();
  updateGlobePins();
  return true;
}

function updateGlobeSize() {
  if (globe) {
    globe.width(globeContainer.clientWidth);
    globe.height(globeContainer.clientHeight);
  }
}

function updateGlobePins() {
  if (!globe) return;
  var pins = loadPins();
  globe.objectsData([]);
  globe.pointsData(pins);
  globe.objectsData(pins);
}

function createStoryTag(pin) {
  var width = 640;
  var height = 164;
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create story marker canvas');

  context.beginPath();
  context.roundRect(4, 4, width - 8, 78, 26);
  context.fillStyle = 'rgba(5, 17, 35, 0.96)';
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = 'rgba(255, 200, 120, 0.82)';
  context.stroke();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '600 34px "Segoe UI", Arial, sans-serif';
  context.fillStyle = '#ffffff';
  context.fillText(storyHint(pin), width / 2, 43, width - 44);
  var author = pin.author_name || 'Anonymous';
  context.font = 'italic 600 30px "Segoe UI", Arial, sans-serif';
  context.fillStyle = '#a9e3ff';
  var authorWidth = Math.min(width - 20, Math.max(180, context.measureText(author).width + 44));
  var authorLeft = (width - authorWidth) / 2;
  context.beginPath();
  context.roundRect(authorLeft, 94, authorWidth, 62, 22);
  context.fillStyle = 'rgba(5, 17, 35, 0.82)';
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(139, 220, 255, 0.5)';
  context.stroke();
  context.fillStyle = '#a9e3ff';
  context.fillText(author, width / 2, 125, authorWidth - 24);

  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  var material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  var radius = globe.getGlobeRadius();
  var tagWidth = radius * 0.6;
  var tagHeight = tagWidth * height / width;
  var tag = new THREE.Mesh(new THREE.PlaneGeometry(tagWidth, tagHeight), material);
  tag.userData.pinId = pin.id;
  return tag;
}

function storyHint(pin) {
  var ignored = /^(a|an|and|are|as|at|be|by|for|from|in|is|it|my|of|on|or|our|the|to|was|we|where|with)$/i;
  var words = ((pin.title || '') + ' ' + (pin.story || ''))
    .match(/[\p{L}\p{N}]+/gu) || [];
  var hints = [];
  words.forEach(function(word) {
    if (hints.length < 2 && !ignored.test(word) && word.length > 1 &&
        !hints.some(function(hint) { return hint.toLowerCase() === word.toLowerCase(); })) {
      hints.push(word);
    }
  });
  return hints.join(' ') || 'A story';
}

function setMapMode(mode) {
  if (mode === 'globe' && !initGlobe()) return false;
  activeMode = mode;
  document.getElementById('map-mode').classList.toggle('active', mode === 'map');
  document.getElementById('map-mode').setAttribute('aria-pressed', mode === 'map');
  document.getElementById('globe-mode').classList.toggle('active', mode === 'globe');
  document.getElementById('globe-mode').setAttribute('aria-pressed', mode === 'globe');
  document.getElementById('map').classList.toggle('hidden', mode !== 'map');
  globeContainer.classList.toggle('hidden', mode !== 'globe');
  if (mode === 'map') map.invalidateSize();
  else requestAnimationFrame(updateGlobeSize);
  return true;
}

function pinIcon() {
  var c = '#4fc3f7';
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="32" viewBox="0 0 22 32">' +
    '<path d="M11 0C4.9 0 0 4.9 0 11c0 8.3 11 21 11 21S22 19.3 22 11C22 4.9 17.1 0 11 0z"' +
    ' fill="' + c + '" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>' +
    '<circle cx="11" cy="11" r="4.5" fill="white" opacity="0.85"/></svg>';
  return L.divIcon({ html: svg, className: '', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -34] });
}

function renderPin(pin) {
  if (pin.pin_type !== 'personal') return;
  var m = L.marker([pin.lat, pin.lng], { icon: pinIcon() });
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
  personalLayer.addLayer(m);
  store[pin.id] = pin;
  updateGlobePins();
}

function reloadAllPins() {
  personalLayer.clearLayers();
  store = {};
  loadPins().forEach(renderPin);
  updateGlobePins();
  updateCount();
}

function updateCount() {
  var pins = loadPins();
  document.getElementById('pin-count').textContent =
    pins.length + (pins.length === 1 ? ' personal story' : ' personal stories');
}

document.getElementById('map-mode').addEventListener('click', function() { setMapMode('map'); });
document.getElementById('globe-mode').addEventListener('click', function() { setMapMode('globe'); });

// ── Author name ───────────────────────────────────────────────────────────────
var authorInput = document.getElementById('author-input');
authorInput.value = getAuthor();
authorInput.addEventListener('input', function() {
  setAuthor(authorInput.value.trim());
  updateFab();
});
function updateFab() {
  var fab = document.getElementById('fab');
  if (getAuthor() && !isPresentation) fab.classList.remove('hidden');
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
var pinFormTitle = document.querySelector('#pin-modal h2');

fab.addEventListener('click', function() {
  if (placing) cancelPlace(); else startPlace();
});

document.getElementById('hint-cancel').addEventListener('click', cancelPlace);

function startPlace() {
  placing = true; pendingLL = null; editingPinId = null;
  fab.classList.add('placing'); fab.title = 'Cancel (Esc)';
  if (activeMode === 'map') map.getContainer().style.cursor = 'crosshair';
  else globeContainer.style.cursor = 'crosshair';
  placeHint.classList.remove('hidden');
  pinModal.classList.add('hidden');
}

function cancelPlace() {
  placing = false; pendingLL = null; editingPinId = null;
  fab.classList.remove('placing'); fab.title = 'Add story';
  map.getContainer().style.cursor = '';
  globeContainer.style.cursor = '';
  placeHint.classList.add('hidden');
  pinModal.classList.add('hidden');
  pinFormTitle.textContent = '\uD83D\uDCCD Add a Story';
  saveBtn.textContent = 'Save Story';
}

// Step 2: map click — record location, open form
function onMapClick(e) {
  if (!placing) return;
  pendingLL = e.latlng;
  // Reset form
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
  var title = document.getElementById('f-title').value.trim();
  if (!title) { alert('A title is required.'); return; }
  var pins = loadPins();
  var pin = editingPinId
    ? pins.find(function(item) { return item.id === editingPinId; })
    : null;
  if (editingPinId && (!pin || pin.author_name !== author)) {
    alert('This story is no longer available to edit.');
    cancelPlace();
    return;
  }
  if (pin) {
    pin.title = title;
    pin.story = document.getElementById('f-story').value.trim();
    pin.country = document.getElementById('f-country').value.trim();
  } else {
    pin = {
      id: genId(),
      pin_type: 'personal',
      title: title,
      story: document.getElementById('f-story').value.trim(),
      lat: pendingLL.lat,
      lng: pendingLL.lng,
      country: document.getElementById('f-country').value.trim(),
      author_name: author,
      created_at: new Date().toISOString(),
    };
    pins.push(pin);
  }
  savePins(pins);
  reloadAllPins();
  cancelPlace();
});

// ── View Pin ──────────────────────────────────────────────────────────────────
var viewModal = document.getElementById('view-modal');

window.openView = function(id) {
  var p = store[id]; if (!p) return;
  var badge = document.getElementById('v-badge');
  badge.textContent = '\uD83C\uDFE0 Personal Story';
  badge.className   = 'badge personal';
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
    var edit = document.createElement('button');
    edit.className = 'ghost edit-story'; edit.textContent = 'Edit Story';
    edit.onclick = function() { editPin(id); };
    acts.appendChild(edit);
    var d = document.createElement('button');
    d.className = 'ghost danger'; d.textContent = 'Delete Story';
    d.onclick = function() { deletePin(id); };
    acts.appendChild(d);
  }
  viewModal.classList.remove('hidden');
};

function editPin(id) {
  var pin = store[id];
  if (!pin || !getAuthor() || pin.author_name !== getAuthor()) return;
  editingPinId = id;
  pendingLL = { lat: +pin.lat, lng: +pin.lng };
  document.getElementById('f-title').value = pin.title || '';
  document.getElementById('f-story').value = pin.story || '';
  document.getElementById('f-country').value = pin.country || '';
  document.getElementById('f-coords').textContent =
    '\uD83D\uDCCD ' + pendingLL.lat.toFixed(4) + ', ' + pendingLL.lng.toFixed(4);
  pinFormTitle.textContent = '\u270E Edit Your Story';
  saveBtn.textContent = 'Save Changes';
  viewModal.classList.add('hidden');
  pinModal.classList.remove('hidden');
  document.getElementById('f-title').focus();
}

document.getElementById('v-close').addEventListener('click', function() { viewModal.classList.add('hidden'); });
viewModal.addEventListener('click', function(e) { if (e.target === viewModal) viewModal.classList.add('hidden'); });

function deletePin(id) {
  if (!confirm('Delete this story? This cannot be undone.')) return;
  var pins = loadPins().filter(function(p) { return p.id !== id; });
  savePins(pins);
  delete store[id];
  personalLayer.eachLayer(function(m) {
    if (m._pinId === id) personalLayer.removeLayer(m);
  });
  updateGlobePins();
  viewModal.classList.add('hidden');
}

// ── Export / Import ───────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', function() {
  var pins = loadPins();
  var blob = new Blob([JSON.stringify(pins, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'int-globe-stories-' + new Date().toISOString().slice(0,10) + '.json';
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
        if (p.id && p.pin_type === 'personal' && p.title && p.lat != null && p.lng != null && !existingIds[p.id]) {
          existing.push(p); existingIds[p.id] = true; added++;
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

function enterPresentation() {
  cancelPlace();
  if (!setMapMode('globe')) return;
  isPresentation = true;
  document.body.classList.add('presentation');
  document.getElementById('presentation-brand').classList.remove('hidden');
  document.getElementById('presentation-exit').classList.remove('hidden');
  updateFab();
  requestAnimationFrame(updateGlobeSize);
}

function exitPresentation() {
  isPresentation = false;
  document.body.classList.remove('presentation');
  document.getElementById('presentation-brand').classList.add('hidden');
  document.getElementById('presentation-exit').classList.add('hidden');
  updateFab();
  requestAnimationFrame(updateGlobeSize);
}

document.getElementById('present-btn').addEventListener('click', enterPresentation);
document.getElementById('presentation-exit').addEventListener('click', exitPresentation);
window.addEventListener('resize', function() {
  if (activeMode === 'globe') updateGlobeSize();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && isPresentation) exitPresentation();
});

// ── Util ──────────────────────────────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
initMap();
reloadAllPins();
updateFab();
