import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';

/* ---------- text ---------- */
const UI = {
  vi: {
    sitePlan: 'Mặt bằng', share: 'Chia sẻ', contact: 'Liên hệ', sample: 'Ảnh mẫu – chưa phải ảnh thực tế của KCN',
    searchPh: 'Tìm lô, ví dụ 2.3-CN4', code: 'Mã lô', landuse: 'Chức năng', area: 'Diện tích', floors: 'Tầng cao',
    density: 'Mật độ XD', far: 'Hệ số SDĐ', approx: 'Ranh giới vẽ lệch {d}% so với diện tích quy hoạch.',
    unmatched: 'Chưa có ranh giới lô trên bản đồ (đang cập nhật).', copied: 'Đã sao chép đường dẫn',
    view360: 'Xem 360°', goTo: 'Đi tới', phone: 'Gọi', satellite: 'Vệ tinh', streets: 'Bản đồ', plotsLayer: 'Lô đất',
    noResult: 'Không tìm thấy', away: 'cách {d} km',
  },
  en: {
    sitePlan: 'Site plan', share: 'Share', contact: 'Contact', sample: 'Sample photo – not the actual park yet',
    searchPh: 'Find a plot, e.g. 2.3-CN4', code: 'Plot', landuse: 'Land use', area: 'Area', floors: 'Floors',
    density: 'Site coverage', far: 'Floor area ratio', approx: 'Drawn outline differs by {d}% from the planned area.',
    unmatched: 'Plot outline not on the map yet (being updated).', copied: 'Link copied',
    view360: 'View 360°', goTo: 'Go to', phone: 'Call', satellite: 'Satellite', streets: 'Map', plotsLayer: 'Plots',
    noResult: 'No match', away: '{d} km away',
  },
};

// Land-use classes, keyed by the plot code prefix (2.3-CN4 → CN)
const CLASSES = [
  { id: 'industrial', codes: ['CN'], color: '#9b6fe0', vi: 'Đất công nghiệp', en: 'Industrial' },
  { id: 'public', codes: ['CC', 'HH'], color: '#e5534b', vi: 'Công cộng, dịch vụ', en: 'Public & services' },
  { id: 'residential', codes: ['LK', 'SL', 'DL', 'CT', 'TDC'], color: '#f2c14e', vi: 'Nhà ở', en: 'Housing' },
  { id: 'education', codes: ['GD', 'NT'], color: '#f08c3a', vi: 'Giáo dục', en: 'Education' },
  { id: 'health', codes: ['YT'], color: '#e0609a', vi: 'Y tế', en: 'Health' },
  { id: 'green', codes: ['CX', 'CXCL', 'STT'], color: '#3fae4f', vi: 'Cây xanh, thể thao', en: 'Green & sport' },
  { id: 'water', codes: ['MN'], color: '#3b8fd9', vi: 'Mặt nước', en: 'Water' },
  { id: 'utilities', codes: ['HT', 'TBA'], color: '#19b3b3', vi: 'Hạ tầng kỹ thuật', en: 'Utilities' },
  { id: 'parking', codes: ['BX'], color: '#9aa4ad', vi: 'Bãi đỗ xe', en: 'Parking' },
  { id: 'reserve', codes: ['DT'], color: '#c9a96e', vi: 'Đất dự trữ', en: 'Reserve' },
];
const OTHER = { id: 'other', codes: [], color: '#cccccc', vi: 'Khác', en: 'Other' };
const classOf = (code) => {
  const p = (code.match(/^\d\.\d-([A-Za-z]+?)\d*(?:-|$)/) || [])[1]?.toUpperCase() || '';
  return CLASSES.find((c) => c.codes.includes(p)) || OTHER;
};

/* ---------- state ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const hash = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
let lang = ['vi', 'en'].includes(hash.lang) ? hash.lang : (store.get('lang') || 'vi');
let tour, plots, scene, viewer, markers, minimap, siteMap;
let currentView = hash.view === 'map' ? 'map' : 'pano';
const hidden = new Set();

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const t = (v) => (v && typeof v === 'object' ? (v[lang] ?? v.vi ?? v.en) : v) ?? '';
const ui = (k, vars = {}) => UI[lang][k].replace(/\{(\w+)\}/g, (_, n) => vars[n]);
const num = (v, d = 2) => (v == null ? '–' : Number(v).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: d }));
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
function distanceKm(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2000);
}
function openPanel(html) { $('#panel-body').innerHTML = html; $('#panel').hidden = false; }
function closePanel() { $('#panel').hidden = true; }

/* ---------- panorama ---------- */
function hotspotYaw(h) {
  if (h.yaw != null) return h.yaw;
  const target = h.to ? tour.scenes.find((s) => s.id === h.to) : h;
  return (scene.north || 0) + bearing(scene, target);
}

function buildMarkers() {
  return (scene.hotspots || []).map((h, i) => {
    const yaw = hotspotYaw(h);
    let pitch = h.pitch;
    let html, tooltip;
    if (h.type === 'link') {
      const to = tour.scenes.find((s) => s.id === h.to);
      pitch ??= scene.type === 'aerial' ? -20 : -8;
      html = `<div class="hs hs-link"><div class="hs-dot">➜</div><div class="hs-label">${esc(t(to.name))}</div></div>`;
    } else if (h.type === 'landmark') {
      pitch ??= 0;
      const d = h.distance_km ?? distanceKm(scene, h);
      html = `<div class="hs hs-landmark"><div class="hs-dot"></div><div class="hs-label">${esc(t(h.title))} · ${num(d, d < 10 ? 1 : 0)} km</div></div>`;
    } else {
      pitch ??= 0;
      html = '<div class="hs hs-info"><div class="hs-dot">i</div></div>';
      tooltip = t(h.title);
    }
    return { id: `h${i}`, position: { yaw: `${yaw}deg`, pitch: `${pitch}deg` }, html, anchor: 'center left', tooltip, data: h };
  });
}

function onHotspot(h) {
  if (h.type === 'link') goScene(h.to);
  else if (h.type === 'info') {
    openPanel(`<h2>${esc(t(h.title))}</h2><p>${esc(t(h.text))}</p>${(h.photos || []).map((p) => `<img src="${esc(p)}" alt="" style="width:100%;border-radius:8px">`).join('')}${h.link ? `<div class="btn-row"><a href="${esc(h.link)}" target="_blank" rel="noopener">↗</a></div>` : ''}`);
  }
}

async function goScene(id, pos) {
  const next = tour.scenes.find((s) => s.id === id) || tour.scenes[0];
  scene = next;
  const position = pos || { yaw: `${next.view?.yaw ?? 0}deg`, pitch: `${next.view?.pitch ?? 0}deg` };
  markers.clearMarkers();
  updateSceneUI();
  await viewer.setPanorama(next.image, { position, zoom: next.view?.zoom ?? 30, transition: 800, caption: t(next.name) });
  markers.setMarkers(buildMarkers());
  updateHash();
}

function updateSceneUI() {
  $('#sample-badge').hidden = !scene.sample;
  document.querySelectorAll('.scene-card').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === scene.id)));
  updateMinimap();
}

function renderScenes() {
  $('#scenes').innerHTML = tour.scenes.map((s) => `<button class="scene-card" data-id="${esc(s.id)}"><img src="${esc(s.thumb)}" alt="" loading="lazy"><span>${esc(t(s.name))}</span></button>`).join('');
  document.querySelectorAll('.scene-card').forEach((b) => b.addEventListener('click', () => goScene(b.dataset.id)));
  if (scene) updateSceneUI();
}

/* ---------- maps ---------- */
const satellite = () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
});
const streets = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap contributors',
});
const plotStyle = (f) => ({ color: '#fff', weight: 1, opacity: 0.8, fillColor: classOf(f.properties.code).color, fillOpacity: 0.55 });
const outlined = () => plots.features.filter((f) => f.geometry.type !== 'Point');

const coneIcon = () => L.divIcon({
  className: 'cone', iconSize: [80, 80], iconAnchor: [40, 40],
  html: '<svg width="80" height="80" viewBox="-40 -40 80 80"><path d="M0 0 L-18 -36 A40 40 0 0 1 18 -36 Z" fill="rgba(240,160,32,.55)" stroke="#f0a020"/><circle r="5" fill="#f0a020" stroke="#fff" stroke-width="2"/></svg>',
});

function initMinimap() {
  minimap = L.map('minimap', { zoomControl: false, attributionControl: false, keyboard: false });
  satellite().addTo(minimap);
  const layer = L.geoJSON({ type: 'FeatureCollection', features: outlined() }, {
    style: (f) => ({ ...plotStyle(f), weight: 0.5, fillOpacity: 0.35 }), interactive: false,
  }).addTo(minimap);
  minimap.fitBounds(layer.getBounds());
  minimap.scenePoints = tour.scenes.map((s) => L.circleMarker([s.lat, s.lon], { radius: 5, color: '#fff', weight: 2, fillColor: '#222', fillOpacity: 1 })
    .on('click', () => goScene(s.id)).addTo(minimap));
  minimap.cone = L.marker([0, 0], { icon: coneIcon(), interactive: false }).addTo(minimap);
}

function updateMinimap() {
  if (!minimap) return;
  minimap.cone.setLatLng([scene.lat, scene.lon]);
  updateCone();
}

function updateCone() {
  const svg = minimap?.cone.getElement()?.querySelector('svg');
  if (!svg || !viewer) return;
  const heading = deg(viewer.getPosition().yaw) - (scene.north || 0);
  svg.style.transform = `rotate(${heading}deg)`;
}

function plotPopup(p) {
  const c = classOf(p.code);
  const rows = [
    [ui('landuse'), `<i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c.color}"></i> ${esc(c[lang])}`],
    [ui('area'), `${num(p.area_ha, 4)} ha`],
    [ui('floors'), p.floors && p.floors !== '-' ? esc(p.floors) : '–'],
    [ui('density'), p.density_pct != null ? `${num(p.density_pct, 1)}%` : '–'],
    [ui('far'), num(p.far)],
  ];
  const note = p.status === 'approx' ? ui('approx', { d: num(p.area_diff_pct, 1) }) : p.status === 'unmatched' ? ui('unmatched') : '';
  return `<strong>${esc(p.code)}</strong><table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>${note ? `<p class="note">${esc(note)}</p>` : ''}`;
}

function initSiteMap() {
  siteMap = L.map('map', { zoomControl: true });
  const sat = satellite().addTo(siteMap);
  const plotsLayer = L.geoJSON(plots, {
    filter: (f) => !hidden.has(classOf(f.properties.code).id),
    style: plotStyle,
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: '#fff', weight: 1.5, dashArray: '3 3', fillColor: classOf(f.properties.code).color, fillOpacity: 0.9 }),
    onEachFeature: (f, layer) => {
      layer.bindPopup(() => plotPopup(f.properties));
      layer.bindTooltip(esc(f.properties.code), { permanent: true, direction: 'center', className: 'plot-label' });
      layer.on('mouseover', () => layer.setStyle?.({ weight: 3 }));
      layer.on('mouseout', () => layer.setStyle?.({ weight: f.geometry.type === 'Point' ? 1.5 : 1 }));
    },
  }).addTo(siteMap);
  siteMap.plotsLayer = plotsLayer;
  const scenesLayer = L.layerGroup(tour.scenes.map((s) => L.circleMarker([s.lat, s.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#f0a020', fillOpacity: 1 })
    .bindPopup(() => `<strong>${esc(t(s.name))}</strong><div class="btn-row"><button data-go="${esc(s.id)}">${ui('view360')}</button></div>`))).addTo(siteMap);
  Object.assign(siteMap, { sat, streets: streets(), scenesLayer });
  addLayerControl();
  siteMap.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: outlined() }).getBounds(), { padding: [20, 20] });
  const labels = () => $('#map').classList.toggle('no-labels', siteMap.getZoom() < 16);
  siteMap.on('zoomend', labels); labels();
  siteMap.on('popupopen', (e) => e.popup.getElement().querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { setView('pano'); goScene(b.dataset.go); })));
  renderLegend();
}

function addLayerControl() {
  siteMap.layerControl = L.control.layers(
    { [ui('satellite')]: siteMap.sat, [ui('streets')]: siteMap.streets },
    { [ui('plotsLayer')]: siteMap.plotsLayer, '360°': siteMap.scenesLayer },
  ).addTo(siteMap);
}

function refreshPlots() {
  siteMap.plotsLayer.clearLayers();
  siteMap.plotsLayer.addData(plots);
}

function renderLegend() {
  const used = new Set(plots.features.map((f) => classOf(f.properties.code).id));
  $('#legend').innerHTML = [...CLASSES, OTHER].filter((c) => used.has(c.id)).map((c) => `<label><input type="checkbox" data-cls="${c.id}" ${hidden.has(c.id) ? '' : 'checked'}><i style="background:${c.color}"></i>${esc(c[lang])}</label>`).join('');
  $('#legend').querySelectorAll('input').forEach((cb) => cb.addEventListener('change', () => {
    cb.checked ? hidden.delete(cb.dataset.cls) : hidden.add(cb.dataset.cls);
    refreshPlots();
  }));
}

function findPlot(code) {
  let hit;
  siteMap.plotsLayer.eachLayer((l) => { if (l.feature.properties.code === code && !hit) hit = l; });
  return hit;
}

function initSearch() {
  const input = $('#search');
  const list = $('#search-results');
  input.addEventListener('input', () => {
    const q = input.value.trim().toUpperCase();
    if (!q) { list.innerHTML = ''; return; }
    const hits = plots.features.filter((f) => f.properties.code.toUpperCase().includes(q)).slice(0, 8);
    list.innerHTML = hits.length
      ? hits.map((f) => `<li><button data-code="${esc(f.properties.code)}">${esc(f.properties.code)} · ${num(f.properties.area_ha, 2)} ha · ${esc(classOf(f.properties.code)[lang])}</button></li>`).join('')
      : `<li><button disabled>${ui('noResult')}</button></li>`;
    list.querySelectorAll('[data-code]').forEach((b) => b.addEventListener('click', () => {
      const f = plots.features.find((x) => x.properties.code === b.dataset.code);
      hidden.delete(classOf(f.properties.code).id); refreshPlots(); renderLegend();
      const layer = findPlot(f.properties.code);
      if (layer.getBounds) siteMap.fitBounds(layer.getBounds(), { maxZoom: 17 }); else siteMap.setView(layer.getLatLng(), 17);
      layer.openPopup();
      list.innerHTML = ''; input.value = '';
    }));
  });
}

/* ---------- chrome ---------- */
function setView(v) {
  currentView = v;
  $('#view-pano').hidden = v !== 'pano';
  $('#view-map').hidden = v !== 'map';
  $('#tab-pano').setAttribute('aria-selected', String(v === 'pano'));
  $('#tab-map').setAttribute('aria-selected', String(v === 'map'));
  if (v === 'map') {
    if (!siteMap) initSiteMap();
    siteMap.invalidateSize();
  } else {
    minimap?.invalidateSize();
  }
  updateHash();
}

function applyLang() {
  document.documentElement.lang = lang;
  $('#btn-lang').textContent = lang === 'vi' ? 'EN' : 'VI';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = ui(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = ui(el.dataset.i18nPh); });
  if (!tour) return;
  $('#title').textContent = t(tour.title);
  document.title = `${t(tour.title)} · 360°`;
  renderScenes();
  if (markers && scene) { markers.setMarkers(buildMarkers()); viewer.setOption('caption', t(scene.name)); }
  if (siteMap) {
    renderLegend();
    siteMap.closePopup();
    siteMap.removeControl(siteMap.layerControl);
    addLayerControl();
  }
}

function updateHash() {
  if (!scene || !viewer) return;
  const p = viewer.getPosition();
  const h = new URLSearchParams({ scene: scene.id, yaw: Math.round(deg(p.yaw)), pitch: Math.round(deg(p.pitch)), lang });
  if (currentView === 'map') h.set('view', 'map');
  history.replaceState(null, '', `#${h}`);
}

function showContact() {
  const c = tour.contact || {};
  const links = [
    c.phone && `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">📞 ${ui('phone')} ${esc(c.phone)}</a>`,
    c.zalo && `<a href="https://zalo.me/${esc(c.zalo.replace(/\D/g, ''))}" target="_blank" rel="noopener">💬 Zalo</a>`,
    c.email && `<a href="mailto:${esc(c.email)}">✉️ ${esc(c.email)}</a>`,
  ].filter(Boolean);
  openPanel(`<h2>${esc(t(c.name) || ui('contact'))}</h2>${links.length ? `<div class="btn-row">${links.join('')}</div>` : ''}${c.note ? `<p class="note">${esc(t(c.note))}</p>` : ''}${tour.credits ? `<p class="note">${esc(tour.credits)}</p>` : ''}`);
}

async function share() {
  updateHash();
  try { await navigator.clipboard.writeText(location.href); toast(ui('copied')); }
  catch { window.prompt('URL', location.href); }
}

/* ---------- start ---------- */
async function main() {
  applyLang();
  [tour, plots] = await Promise.all([
    fetch('tour.json').then((r) => r.json()),
    fetch('data/plots.geojson').then((r) => r.json()),
  ]);
  scene = tour.scenes.find((s) => s.id === hash.scene) || tour.scenes.find((s) => s.id === tour.start) || tour.scenes[0];
  const fromHash = hash.scene === scene.id && hash.yaw != null;
  viewer = new Viewer({
    container: 'viewer',
    panorama: scene.image,
    caption: t(scene.name),
    defaultYaw: `${fromHash ? Number(hash.yaw) : scene.view?.yaw ?? 0}deg`,
    defaultPitch: `${fromHash ? Number(hash.pitch || 0) : scene.view?.pitch ?? 0}deg`,
    defaultZoomLvl: scene.view?.zoom ?? 30,
    navbar: ['zoom', 'move', 'caption', 'fullscreen'],
    touchmoveTwoFingers: false,
    mousewheelCtrlKey: false,
    plugins: [[MarkersPlugin, { markers: [] }]],
  });
  markers = viewer.getPlugin(MarkersPlugin);
  markers.addEventListener('select-marker', ({ marker }) => onHotspot(marker.data));
  viewer.addEventListener('ready', () => { markers.setMarkers(buildMarkers()); updateCone(); }, { once: true });
  let hashTimer;
  viewer.addEventListener('position-updated', () => {
    updateCone();
    clearTimeout(hashTimer); hashTimer = setTimeout(updateHash, 400);
  });

  applyLang();
  initMinimap();
  updateSceneUI();
  initSearch();
  setView(currentView);
}

$('#tab-pano').addEventListener('click', () => setView('pano'));
$('#tab-map').addEventListener('click', () => setView('map'));
$('#btn-lang').addEventListener('click', () => { lang = lang === 'vi' ? 'en' : 'vi'; store.set('lang', lang); applyLang(); updateHash(); });
$('#btn-share').addEventListener('click', share);
$('#btn-contact').addEventListener('click', () => tour && showContact());
$('#panel').addEventListener('click', (e) => { if (e.target.id === 'panel' || e.target.classList.contains('panel-close')) closePanel(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

main().catch((err) => {
  console.error(err);
  openPanel(`<h2>Error</h2><p>${esc(err.message)}</p>`);
});
