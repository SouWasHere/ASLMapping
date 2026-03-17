import * as THREE          from 'three';
import { GLTFLoader }      from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader }     from 'three/addons/loaders/DRACOLoader.js';

// ── DOM refs ──────────────────────────────────────────────────────────────
const canvas      = document.getElementById('canvas');
const loadingEl   = document.getElementById('loading');
const loadCardEl  = document.getElementById('load-card');
const loadBarFill = document.getElementById('load-bar-fill');
const loadPctEl   = document.getElementById('load-pct');
const loadMsgEl   = document.getElementById('load-msg');
const loadLabel   = document.getElementById('load-label');
const statusEl    = document.getElementById('status');
const pickedLabel = document.getElementById('picked-label');
const statsPill   = document.getElementById('stats-pill');
const listEl      = document.getElementById('list');
const searchInput = document.getElementById('search');
const resetBtn    = document.getElementById('resetView');
const clearBtn    = document.getElementById('clearSel');
const resPanel    = document.getElementById('res-panel');
const rpAddress   = document.getElementById('rp-address');
const rpMesh      = document.getElementById('rp-mesh');
const rpClose     = document.getElementById('rp-close');
const rpSearch    = document.getElementById('rp-search');
const rpList      = document.getElementById('rp-list');
const sTotal      = document.getElementById('s-total');
const sMale       = document.getElementById('s-male');
const sPwd        = document.getElementById('s-pwd');
const sSenior     = document.getElementById('s-senior');
const modal       = document.getElementById('modal');
const modalTitle  = document.getElementById('modal-title');
const modalClose  = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSave   = document.getElementById('modal-save');
const modalDelete = document.getElementById('modal-delete');
const formBiz     = document.getElementById('form-business');
const formGov     = document.getElementById('form-government');
const exportBtn   = document.getElementById('export-btn');

// ── Renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace    = THREE.SRGBColorSpace;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.shadowMap.enabled   = true;
renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x1e2a3a, 1);

// ── Scene / camera / controls ─────────────────────────────────────────────
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.position.set(0, 500, 500);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping      = true;
controls.dampingFactor      = 0.08;
controls.screenSpacePanning = true;
controls.minDistance        = 1;
controls.maxDistance        = 5000;
controls.maxPolarAngle      = Math.PI / 2 - 0.01;

// ── Lighting ──────────────────────────────────────────────────────────────
const hemi = new THREE.HemisphereLight(0xddeeff, 0x556644, 2.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e0, 5.0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 800;
['left','right','bottom','top'].forEach((k,i) => sun.shadow.camera[k] = [-250,250,-250,250][i]);
scene.add(sun); scene.add(sun.target);
const fill   = new THREE.DirectionalLight(0x88aaee, 1.0);
const bounce = new THREE.DirectionalLight(0xffd8a0, 0.35);
bounce.position.set(0, -40, 0);
scene.add(fill); scene.add(bounce);

function updateSunPosition(a, h) {
  const phi = THREE.MathUtils.degToRad(90 - h), th = THREE.MathUtils.degToRad(a), r = 200;
  sun.position.set(r*Math.sin(phi)*Math.cos(th), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(th));
  fill.position.set(-sun.position.x*.5, sun.position.y*.6, -sun.position.z*.5);
}
updateSunPosition(45, 60);
document.getElementById('sunAngle').addEventListener('input',  e => updateSunPosition(+e.target.value, +document.getElementById('sunHeight').value));
document.getElementById('sunHeight').addEventListener('input', e => updateSunPosition(+document.getElementById('sunAngle').value, +e.target.value));
document.getElementById('exposure').addEventListener('input',  e => renderer.toneMappingExposure = +e.target.value / 100);

// ── Resize ────────────────────────────────────────────────────────────────
function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(onResize).observe(canvas);
onResize();

// ── Data stores ───────────────────────────────────────────────────────────
let addressMap = {};   // { meshName → address }
let residents  = [];   // [ {name,age,gender,isPWD,isSenior,address} ]
let buildings  = {};   // { meshName → { type, bizType?, govOffice? } }

// ── Helpers ───────────────────────────────────────────────────────────────
function parseBool(v) { return v?.trim().toLowerCase() === 'true' || v?.trim() === '1'; }

function parseCSV(text) {
  const lines  = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    return Object.fromEntries(header.map((h, i) => [h, vals[i] ?? '']));
  });
}

async function loadData() {
  try {
    loadMsgEl.textContent = 'Loading addresses.json…';
    const r = await fetch('./addresses.json');
    if (!r.ok) throw new Error();
    addressMap = await r.json();
  } catch(e) { addressMap = {}; }

  try {
    loadMsgEl.textContent = 'Loading residents.csv…';
    const r = await fetch('./residents.csv');
    if (!r.ok) throw new Error();
    residents = parseCSV(await r.text()).map(r => ({
      name:     r.name     || '(unknown)',
      age:      parseInt(r.age) || 0,
      gender:   r.gender   || 'Unknown',
      isPWD:    parseBool(r.isPWD),
      isSenior: parseBool(r.isSenior),
      address:  r.address  || '',
    }));
  } catch(e) { residents = []; }

  try {
    loadMsgEl.textContent = 'Loading buildings.json…';
    const r = await fetch('./buildings.json');
    if (!r.ok) throw new Error();
    buildings = await r.json();
  } catch(e) { buildings = {}; }
}

function getResidents(address) {
  if (!address) return [];
  return residents.filter(r => r.address.trim().toLowerCase() === address.trim().toLowerCase());
}

// ── Export buildings.json ─────────────────────────────────────────────────
// Since we can't write to disk from the browser, we download it as a file.
// User replaces their buildings.json with the downloaded one.
function exportBuildings() {
  const json = JSON.stringify(buildings, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'buildings.json';
  a.click();
  URL.revokeObjectURL(url);
}
exportBtn.addEventListener('click', exportBuildings);

// ── Building type colors ──────────────────────────────────────────────────
const TYPE_COLORS   = { residential: 0x4d9fff, business: 0xf97316, government: 0xef4444 };
const TYPE_EMISSIVE = { residential: 0x0d2a55, business: 0x3d1d00, government: 0x3d0000 };
const TYPE_ICON     = { residential: '🏠', business: '🏪', government: '🏛' };
const TYPE_LABEL    = { residential: 'Residential', business: 'Business', government: 'Government' };

function applyTypeColor(mesh) {
  const type = buildings[mesh.name]?.type;
  if (!type) { resetMeshColor(mesh); return; }
  if (!mesh.userData.ownMat) { mesh.material = mesh.material.clone(); mesh.userData.ownMat = true; }
  mesh.material.color.set(TYPE_COLORS[type]);
  if (mesh.material.emissive) { mesh.material.emissive.set(TYPE_EMISSIVE[type]); mesh.material.emissiveIntensity = 0.15; }
  origColors.set(mesh.uuid, mesh.material.color.clone());
}

// ── Panel tabs ────────────────────────────────────────────────────────────
let activeTab = 'residents';
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
}
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// ── Open panel ────────────────────────────────────────────────────────────
function openPanel(meshName) {
  const address = addressMap[meshName];
  const type    = buildings[meshName]?.type || 'residential';

  rpAddress.textContent = address || 'No address mapped';
  rpMesh.textContent    = meshName;

  document.querySelectorAll('.tag-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));

  // Residents tab
  rpSearch.value = ''; activeFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
  const all = getResidents(address);
  sTotal.textContent  = all.length;
  sMale.textContent   = all.filter(r => r.gender === 'Male').length;
  sPwd.textContent    = all.filter(r => r.isPWD).length;
  sSenior.textContent = all.filter(r => r.isSenior).length;
  renderResCards(all, address);
  renderBizPane(meshName);
  renderGovPane(meshName);

  if (type === 'business')    switchTab('business');
  else if (type === 'government') switchTab('government');
  else switchTab('residents');

  resPanel.classList.add('open');
}

// ── Residents tab ─────────────────────────────────────────────────────────
let activeFilter = 'all';

function renderResCards(list, address) {
  if (!list.length) {
    rpList.innerHTML = `
      <div class="rp-empty">
        <strong>No residents found</strong>
        ${address
          ? `Add entries with address <code>${address}</code> in residents.csv`
          : `Map this building in addresses.json first`}
      </div>`;
    return;
  }
  rpList.innerHTML = list.map(r => `
    <div class="res-card">
      <div class="res-name">${r.name}</div>
      <div class="res-badges">
        <span class="badge age">${r.age} yrs</span>
        <span class="badge ${r.gender === 'Male' ? 'male' : 'female'}">${r.gender}</span>
        ${r.isPWD    ? `<span class="badge pwd">PWD</span>`       : ''}
        ${r.isSenior ? `<span class="badge senior">Senior</span>` : ''}
      </div>
    </div>`).join('');
}

function getFiltered() {
  const address = addressMap[selectedMesh?.name];
  let list = getResidents(address);
  if (activeFilter === 'pwd')    list = list.filter(r => r.isPWD);
  if (activeFilter === 'senior') list = list.filter(r => r.isSenior);
  if (activeFilter === 'male')   list = list.filter(r => r.gender === 'Male');
  if (activeFilter === 'female') list = list.filter(r => r.gender === 'Female');
  const term = rpSearch.value.toLowerCase();
  if (term) list = list.filter(r => r.name.toLowerCase().includes(term));
  return list;
}

document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
  activeFilter = btn.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderResCards(getFiltered(), addressMap[selectedMesh?.name]);
}));
rpSearch.addEventListener('input', () => renderResCards(getFiltered(), addressMap[selectedMesh?.name]));

// ── Business pane ─────────────────────────────────────────────────────────
function renderBizPane(meshName) {
  const pane = document.getElementById('pane-business');
  const b    = buildings[meshName];
  if (!b || b.type !== 'business') {
    pane.innerHTML = `<div class="rp-empty"><strong>Not tagged as Business</strong>Click 🏪 Business above to tag this building.</div>`;
    return;
  }
  pane.innerHTML = `
    <div class="info-card">
      <div class="info-row"><span class="info-lbl">Type of Business</span><span class="info-val">${b.bizType || '—'}</span></div>
    </div>
    <button class="edit-btn" id="edit-biz-btn">✏ Edit Details</button>`;
  document.getElementById('edit-biz-btn').addEventListener('click', () => openModal(meshName, 'business'));
}

// ── Government pane ───────────────────────────────────────────────────────
function renderGovPane(meshName) {
  const pane = document.getElementById('pane-government');
  const b    = buildings[meshName];
  if (!b || b.type !== 'government') {
    pane.innerHTML = `<div class="rp-empty"><strong>Not tagged as Government</strong>Click 🏛 Government above to tag this building.</div>`;
    return;
  }
  pane.innerHTML = `
    <div class="info-card">
      <div class="info-row"><span class="info-lbl">Office / Dept</span><span class="info-val">${b.govOffice || '—'}</span></div>
    </div>
    <button class="edit-btn" id="edit-gov-btn">✏ Edit Details</button>`;
  document.getElementById('edit-gov-btn').addEventListener('click', () => openModal(meshName, 'government'));
}

// ── Tag buttons ───────────────────────────────────────────────────────────
document.querySelectorAll('.tag-btn').forEach(btn => btn.addEventListener('click', () => {
  if (!selectedMesh) return;
  const meshName = selectedMesh.name;
  const newType  = btn.dataset.type;
  const current  = buildings[meshName];

  // Already this type → open edit modal (except residential which has no extra fields)
  if (current?.type === newType) {
    if (newType !== 'residential') openModal(meshName, newType);
    return;
  }

  buildings[meshName] = { ...(current || {}), type: newType };

  applyTypeColor(selectedMesh);
  setMeshColor(selectedMesh, 0x4d9fff, 0x0d2a55, 0.5); // keep selected highlight

  document.querySelectorAll('.tag-btn').forEach(b => b.classList.toggle('active', b === btn));
  buildList(pickables);
  renderBizPane(meshName);
  renderGovPane(meshName);

  if (newType === 'business' || newType === 'government') {
    switchTab(newType);
    openModal(meshName, newType);
  } else {
    switchTab('residents');
  }
}));

// ── Edit modal ────────────────────────────────────────────────────────────
let modalMesh = null, modalType = null;

function openModal(meshName, type) {
  modalMesh = meshName; modalType = type;
  const b       = buildings[meshName] || {};
  const address = addressMap[meshName] || meshName;

  modalTitle.textContent = `${type === 'business' ? '🏪 Business' : '🏛 Government'} — ${address}`;
  formBiz.style.display  = type === 'business'    ? '' : 'none';
  formGov.style.display  = type === 'government'  ? '' : 'none';

  if (type === 'business')   document.getElementById('f-biz-type').value    = b.bizType   || '';
  if (type === 'government') document.getElementById('f-gov-office').value  = b.govOffice || '';

  modalDelete.style.display = buildings[meshName] ? '' : 'none';
  modal.classList.add('open');
}

function closeModal() { modal.classList.remove('open'); modalMesh = null; modalType = null; }
modalClose.addEventListener('click',  closeModal);
modalCancel.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

modalSave.addEventListener('click', () => {
  if (!modalMesh || !modalType) return;
  const b = buildings[modalMesh] || { type: modalType };

  if (modalType === 'business')   b.bizType   = document.getElementById('f-biz-type').value.trim();
  if (modalType === 'government') b.govOffice = document.getElementById('f-gov-office').value.trim();

  buildings[modalMesh] = b;
  closeModal();
  renderBizPane(modalMesh);
  renderGovPane(modalMesh);
  buildList(pickables);
});

modalDelete.addEventListener('click', () => {
  if (!modalMesh) return;
  const savedName = modalMesh;
  delete buildings[savedName];

  const mesh = pickables.find(m => m.name === savedName);
  if (mesh) {
    origColors.delete(mesh.uuid);
    if (mesh.userData.ownMat) {
      mesh.material.color.set(0xd2d7e1);
      if (mesh.material.emissive) { mesh.material.emissive.set(0); mesh.material.emissiveIntensity = 0; }
    }
    cacheColor(mesh);
    if (selectedMesh === mesh) setMeshColor(mesh, 0x4d9fff, 0x0d2a55, 0.5);
  }

  closeModal();
  if (selectedMesh?.name === savedName) openPanel(savedName);
  buildList(pickables);
});

// ── 3D picking ────────────────────────────────────────────────────────────
const raycaster  = new THREE.Raycaster();
const pointer    = new THREE.Vector2();
let pickables    = [];
let selectedMesh = null;
let hoveredMesh  = null;
let isDragging   = false;
let mouseDownPos = { x: 0, y: 0 };
const origColors = new Map();

function cacheColor(mesh) {
  if (!origColors.has(mesh.uuid))
    origColors.set(mesh.uuid, mesh.material.color ? mesh.material.color.clone() : new THREE.Color(0xd2d7e1));
}
function setMeshColor(mesh, hex, emissive = 0, emissiveInt = 0) {
  if (!mesh.userData.ownMat) { mesh.material = mesh.material.clone(); mesh.userData.ownMat = true; }
  mesh.material.color.set(hex);
  if (mesh.material.emissive) { mesh.material.emissive.set(emissive); mesh.material.emissiveIntensity = emissiveInt; }
}
function resetMeshColor(mesh) {
  if (!mesh.userData.ownMat) return;
  const orig = origColors.get(mesh.uuid);
  if (orig) mesh.material.color.copy(orig);
  if (mesh.material.emissive) { mesh.material.emissive.set(0); mesh.material.emissiveIntensity = 0; }
}

// ── Camera fit ────────────────────────────────────────────────────────────
function fitToObject(obj) {
  obj.updateMatrixWorld(true);
  const box    = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size   = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov    = camera.fov * (Math.PI / 180);
  const dist   = (maxDim / 2) / Math.tan(fov / 2) * 1.6;
  controls.target.copy(center);
  camera.position.set(center.x, center.y + dist * 1.2, center.z + dist * 0.3);
  camera.near = dist / 200; camera.far = dist * 20;
  camera.updateProjectionMatrix(); controls.update();
  const half = maxDim * 0.8;
  ['left','right','bottom','top'].forEach((k,i) => sun.shadow.camera[k] = [-half,half,-half,half][i]);
  sun.shadow.camera.far = dist * 10;
  sun.shadow.camera.updateProjectionMatrix();
}

// ── Sidebar list ──────────────────────────────────────────────────────────
function buildList(meshes) {
  listEl.innerHTML = '';
  meshes.forEach(mesh => {
    const address = addressMap[mesh.name];
    const resList = getResidents(address);
    const bldg    = buildings[mesh.name];
    const type    = bldg?.type;
    const el      = document.createElement('div');
    el.className  = 'item' + (resList.length ? ' has-data' : '') + (type ? ` type-${type}` : '');
    el.dataset.uuid = mesh.uuid;
    el.innerHTML = `
      <div class="item-dot"></div>
      <div class="item-info">
        <div class="item-name">${type ? `<span class="type-icon">${TYPE_ICON[type]}</span> ` : ''}${mesh.name}</div>
        ${address
          ? `<div class="item-addr">${address}${type ? ` · <span class="type-tag type-tag-${type}">${TYPE_LABEL[type]}</span>` : ''}</div>`
          : `<div class="item-addr no-addr">No address mapped</div>`}
      </div>
      ${resList.length ? `<div class="item-count">${resList.length}</div>` : ''}`;
    el.addEventListener('click', () => selectMesh(mesh));
    listEl.appendChild(el);
  });
}

function syncListHighlight() {
  listEl.querySelectorAll('.item').forEach(el =>
    el.classList.toggle('active', selectedMesh ? el.dataset.uuid === selectedMesh.uuid : false));
  listEl.querySelector('.item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

searchInput.addEventListener('input', () => {
  const t = searchInput.value.toLowerCase();
  listEl.querySelectorAll('.item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(t) ? '' : 'none';
  });
});

// ── Selection ─────────────────────────────────────────────────────────────
function clearHover() {
  if (hoveredMesh && hoveredMesh !== selectedMesh) resetMeshColor(hoveredMesh);
  hoveredMesh = null;
}
function clearSelection() {
  if (selectedMesh) { resetMeshColor(selectedMesh); applyTypeColor(selectedMesh); }
  selectedMesh = null; clearHover();
  pickedLabel.innerHTML = `<strong>Selected</strong>: —`;
  resPanel.classList.remove('open');
  syncListHighlight();
}
function selectMesh(mesh) {
  if (selectedMesh === mesh) return;
  clearSelection();
  cacheColor(mesh); selectedMesh = mesh;
  setMeshColor(mesh, 0x4d9fff, 0x0d2a55, 0.5);
  pickedLabel.innerHTML = `<strong>${addressMap[mesh.name] || mesh.name}</strong>`;
  syncListHighlight();
  openPanel(mesh.name);
}

function toNDC(e) {
  const r = canvas.getBoundingClientRect();
  pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
  pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
}
function hitTest() { raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(pickables, false); }

canvas.addEventListener('mousedown', e => { mouseDownPos = { x: e.clientX, y: e.clientY }; isDragging = false; });
canvas.addEventListener('mousemove', e => {
  if (Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y) > 3) isDragging = true;
  if (!pickables.length) return;
  toNDC(e);
  const hit = hitTest()[0]?.object ?? null;
  if (hit !== hoveredMesh) {
    clearHover();
    if (hit && hit !== selectedMesh) { hoveredMesh = hit; cacheColor(hit); setMeshColor(hit, 0x90cdf4, 0x1a3a55, 0.2); }
  }
});
canvas.addEventListener('mouseleave', clearHover);
canvas.addEventListener('click', e => {
  if (isDragging || !pickables.length) return;
  toNDC(e);
  const hits = hitTest();
  hits.length ? selectMesh(hits[0].object) : clearSelection();
});

resetBtn.addEventListener('click', () => { if (scene.userData.root) fitToObject(scene.userData.root); });
clearBtn.addEventListener('click', clearSelection);
rpClose.addEventListener('click',  () => resPanel.classList.remove('open'));

function setStatus(t, err = false) { statusEl.textContent = t; statusEl.style.color = err ? 'var(--danger)' : 'var(--muted)'; }

// ── Boot ──────────────────────────────────────────────────────────────────
loadLabel.textContent = 'Loading data files…';
await loadData();
loadLabel.textContent = 'Loading map.glb…';

const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

loader.load('./map.glb',
  gltf => {
    const model = gltf.scene;
    scene.userData.root = model;
    model.rotation.x = -Math.PI / 2;
    scene.add(model);
    model.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = obj.receiveShadow = true;
      [].concat(obj.material).forEach(mat => { if (mat && !mat.color) mat.color = new THREE.Color(0xd2d7e1); });
      cacheColor(obj);
      pickables.push(obj);
    });
    pickables.forEach(applyTypeColor);
    buildList(pickables);
    fitToObject(model);
    loadingEl.style.display = 'none';
    const mapped = pickables.filter(m => addressMap[m.name]).length;
    const biz    = Object.values(buildings).filter(b => b.type === 'business').length;
    const gov    = Object.values(buildings).filter(b => b.type === 'government').length;
    setStatus(`${pickables.length} buildings · ${mapped} mapped · ${biz} biz · ${gov} gov`);
    statsPill.innerHTML = `<strong>${pickables.length}</strong> buildings`;
  },
  xhr => {
    if (xhr.lengthComputable) {
      const pct = Math.round(xhr.loaded / xhr.total * 100);
      loadBarFill.style.width = pct + '%'; loadPctEl.textContent = pct + '%';
    } else {
      loadMsgEl.textContent = `${Math.round(xhr.loaded / 1024)} KB…`;
    }
  },
  err => {
    console.error(err); loadCardEl.classList.add('error-card');
    loadMsgEl.textContent = String(err?.message ?? err);
    loadPctEl.textContent = 'ERR';
    setStatus('Failed to load map.glb', true);
  }
);

(function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();
