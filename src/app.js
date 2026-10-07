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
    .objectLat(function(pin) { return +pin.lat; })
    .objectLng(function(pin) {
      var latRadians = +pin.lat * Math.PI / 180;
      var offset = 8 / Math.max(0.25, Math.cos(latRadians));
      return ((+pin.lng + offset + 540) % 360) - 180;
    })
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
  var width = 760;
  var height = 200;
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create story marker canvas');

  context.beginPath();
  context.roundRect(190, 8, width - 198, 102, 28);
  context.fillStyle = 'rgba(5, 17, 35, 0.96)';
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = 'rgba(255, 200, 120, 0.82)';
  context.stroke();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 36px "Segoe UI", Arial, sans-serif';
  context.fillStyle = '#ffffff';
  context.fillText(storyHint(pin), 475, 59, 540);
  var author = pin.author_name || 'Anonymous';
  context.font = 'italic 600 28px "Segoe UI", Arial, sans-serif';
  var authorWidth = Math.min(540, Math.max(180, context.measureText(author).width + 48));
  var authorLeft = 475 - authorWidth / 2;
  context.beginPath();
  context.roundRect(authorLeft, 126, authorWidth, 62, 22);
  context.fillStyle = 'rgba(5, 17, 35, 0.82)';
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(139, 220, 255, 0.5)';
  context.stroke();
  context.fillStyle = '#a9e3ff';
  context.fillText(author, 475, 157, authorWidth - 24);

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
  var tagWidth = radius * 0.46;
  var tagHeight = tagWidth * height / width;
  var tag = new THREE.Mesh(new THREE.PlaneGeometry(tagWidth, tagHeight), material);
  tag.userData.pinId = pin.id;
  var artwork = new Image();
  artwork.onload = function() {
    context.save();
    context.beginPath();
    context.roundRect(8, 8, 174, 174, 34);
    context.clip();
    context.drawImage(artwork, 8, 8, 174, 174);
    context.restore();
    texture.needsUpdate = true;
  };
  artwork.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(storyArtwork(pin));
  return tag;
}

function storyArtwork(pin) {
  var text = ((pin.title || '') + ' ' + (pin.story || '')).toLowerCase();
  var scene;
  if (/\b(famil|parent|wedding|celebrat|festival|birthday|gather|together|reunion|friend)\w*/.test(text)) {
    scene = {
      label: 'Celebration',
      colors: ['#ff6d3a', '#ffd34e', '#34b8b4'],
      art: '<path d="M38 126Q78 90 116 126T198 118" fill="none" stroke="#143a58" stroke-width="8" stroke-linecap="round"/><path d="M73 113h92v32q-46 19-92 0z" fill="#ff7044" stroke="#143a58" stroke-width="5"/><path d="M84 107h70v17H84z" fill="#fff0c1" stroke="#143a58" stroke-width="4"/><path d="M119 103V78m-14 20q-9-12 0-20 9 8 0 20zm28 0q9-12 0-20-9 8 0 20z" fill="#ffd34e" stroke="#143a58" stroke-width="4"/><path d="m50 67 7 15m-2-25 14 7m105 14 14-9m-8 27 16 2" stroke="#ff6d3a" stroke-width="6" stroke-linecap="round"/>'
    };
  } else if (/\b(music|song|sing|dance|drum|rhythm|concert|choir|instrument)\w*/.test(text)) {
    scene = {
      label: 'Music',
      colors: ['#7254c8', '#35b8b1', '#ffc64b'],
      art: '<path d="M65 97q54-30 109 0l-9 48q-45 20-91 0z" fill="#ff7044" stroke="#143a58" stroke-width="6"/><ellipse cx="119" cy="98" rx="54" ry="19" fill="#ffd34e" stroke="#143a58" stroke-width="6"/><path d="M82 109q37 17 74 0m-71 16q34 16 68 0" fill="none" stroke="#fff0c1" stroke-width="5" stroke-linecap="round"/><path d="M67 57q19-19 31 0t30 0m13 2q15-21 30-3t25-2" fill="none" stroke="#7254c8" stroke-width="7" stroke-linecap="round"/><circle cx="60" cy="88" r="6" fill="#35b8b1"/><circle cx="184" cy="75" r="7" fill="#ff7044"/>'
    };
  } else if (/\b(food|cook|cooking|meal|recipe|bread|dish|kitchen|feast|taste|rice|tea|coffee|spice)\w*/.test(text)) {
    scene = {
      label: 'Food',
      colors: ['#ff7044', '#ffd34e', '#35b8b1'],
      art: '<path d="M55 93q62 81 128 0z" fill="#ff7044" stroke="#143a58" stroke-width="6"/><ellipse cx="119" cy="92" rx="64" ry="21" fill="#fff0c1" stroke="#143a58" stroke-width="6"/><path d="M85 88q8-24 20-4 13-29 25-3 17-23 28 3" fill="none" stroke="#35b8b1" stroke-width="8" stroke-linecap="round"/><circle cx="97" cy="80" r="8" fill="#ff7044"/><circle cx="145" cy="78" r="9" fill="#ffd34e"/><path d="M172 48v38m-9-28q9-20 18 0m-106-8v28m-9-19q9-19 18 0" fill="none" stroke="#143a58" stroke-width="6" stroke-linecap="round"/>'
    };
  } else if (/\b(travel|journey|trip|mountain|ocean|river|sea|hiking|visit|road|move|return|island|coast)\w*/.test(text)) {
    scene = {
      label: 'Journey',
      colors: ['#35b8b1', '#4488d4', '#ffd34e'],
      art: '<path d="M28 130 78 61l34 43 28-31 72 68H28z" fill="#35b8b1" stroke="#143a58" stroke-width="6" stroke-linejoin="round"/><path d="m78 61 17 22-19-9-17 16zm62 12 18 21-24-7-14 12z" fill="#fff0c1"/><path d="M44 151q25-14 49 0t49 0 49 0 27 0" fill="none" stroke="#4488d4" stroke-width="9" stroke-linecap="round"/><path d="M119 45v76m0-70 35 52h-35" fill="#ff7044" stroke="#143a58" stroke-width="5" stroke-linejoin="round"/><path d="M51 47q15-14 30 0m92-11q17-16 34 0" fill="none" stroke="#ff7044" stroke-width="6" stroke-linecap="round"/>'
    };
  } else if (/\b(art|craft|draw|paint|sew|make|create|weav|pottery|design|build|knit)\w*/.test(text)) {
    scene = {
      label: 'Creativity',
      colors: ['#ff7044', '#7254c8', '#35b8b1'],
      art: '<path d="m65 135 43-66q9-12 20-4l22 15q10 8 2 20l-45 65z" fill="#ff7044" stroke="#143a58" stroke-width="6" stroke-linejoin="round"/><path d="m106 70 36 27m-52-9 36 27m-55-8 34 26" fill="none" stroke="#ffd34e" stroke-width="8" stroke-linecap="round"/><path d="M46 57q15-18 30 0t30 0m31-10q15-18 30 0t30 0" fill="none" stroke="#7254c8" stroke-width="7" stroke-linecap="round"/><circle cx="179" cy="119" r="15" fill="#35b8b1" stroke="#143a58" stroke-width="5"/><circle cx="54" cy="111" r="9" fill="#ffd34e"/>'
    };
  } else if (/\b(home|house|community|village|neighbou?rhood|school|market|street|local|belong|childhood)\w*/.test(text)) {
    scene = {
      label: 'Community',
      colors: ['#35b8b1', '#ff7044', '#ffd34e'],
      art: '<path d="m39 104 38-35 39 35v48H39zm81-15 33-31 39 33v61h-72z" fill="#ff7044" stroke="#143a58" stroke-width="6" stroke-linejoin="round"/><path d="M62 112h22v40H62zm73-4h19v23h-19zm35 0h18v23h-18z" fill="#fff0c1" stroke="#143a58" stroke-width="5"/><path d="M31 158q46-18 89 0t87 0" fill="none" stroke="#35b8b1" stroke-width="9" stroke-linecap="round"/><circle cx="166" cy="46" r="18" fill="#ffd34e"/><path d="M48 54q20-13 38 0" fill="none" stroke="#7254c8" stroke-width="6" stroke-linecap="round"/>'
    };
  } else {
    scene = {
      label: 'Personal story',
      colors: ['#ff7044', '#4488d4', '#ffd34e'],
      art: '<path d="M55 67q29-17 63 0v81q-34-16-63 0zm63 0q32-17 66 0v81q-34-16-66 0z" fill="#fff0c1" stroke="#143a58" stroke-width="6" stroke-linejoin="round"/><path d="M71 91h31m-31 14h30m33-14h34m-34 14h31" stroke="#35b8b1" stroke-width="6" stroke-linecap="round"/><path d="m117 47 6 13 14 2-11 9 3 14-12-7-12 7 3-14-11-9 14-2z" fill="#ff7044" stroke="#143a58" stroke-width="4" stroke-linejoin="round"/><circle cx="54" cy="49" r="8" fill="#7254c8"/><circle cx="188" cy="48" r="9" fill="#35b8b1"/>'
    };
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170" role="img" aria-label="' + scene.label + ' story illustration">' +
    '<rect x="5" y="5" width="230" height="160" rx="35" fill="#fff6df"/>' +
    '<path d="M12 47Q48 14 92 35T174 27q32-10 55 17l-8 100q-41 21-83 7t-122 1z" fill="' + scene.colors[0] + '" opacity=".16"/>' +
    '<path d="M17 126q38-19 74-3t70-1 62 1" fill="none" stroke="' + scene.colors[1] + '" stroke-width="10" stroke-linecap="round" opacity=".7"/>' +
    '<path d="M25 38q29-16 55-2m89 7q21-13 44 0" fill="none" stroke="' + scene.colors[2] + '" stroke-width="7" stroke-linecap="round" opacity=".8"/>' +
    scene.art +
    '<path d="M17 83q5-7 10 0m183 47q5-7 10 0" fill="none" stroke="' + scene.colors[0] + '" stroke-width="5" stroke-linecap="round"/>' +
    '</svg>';
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
  document.getElementById('v-artwork').innerHTML = storyArtwork(p);
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
