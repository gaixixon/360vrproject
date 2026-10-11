import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* Conceptual 3D massing of the site plan: plots as flat slabs, one block per plot at the
   planned max coverage and floors (data/massing.geojson). Not actual site conditions. */

const SLAB = { water: 0.1, green: 0.5 };   // slab thickness (m); default 0.3

export function init3d(el, { plots, massing, tour, classOf, hidden, storeyM, onPlot, onScene, t }) {
  const coords = plots.features.flatMap((f) => f.geometry.coordinates.flat(Infinity)).reduce((a, v, i) => (a[i % 2].push(v), a), [[], []]);
  const lon0 = (Math.min(...coords[0]) + Math.max(...coords[0])) / 2;
  const lat0 = (Math.min(...coords[1]) + Math.max(...coords[1])) / 2;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const xy = ([lon, lat]) => new THREE.Vector2((lon - lon0) * kx, (lat - lat0) * ky);   // metres east / north

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a2026');
  scene.fog = new THREE.Fog('#1a2026', 7000, 16000);
  const camera = new THREE.PerspectiveCamera(40, 1, 5, 20000);
  const box = new THREE.Box2(xy([Math.min(...coords[0]), Math.min(...coords[1])]), xy([Math.max(...coords[0]), Math.max(...coords[1])]));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = rad(84);
  controls.minDistance = 80;
  controls.maxDistance = 6000;
  controls.screenSpacePanning = false;

  scene.add(new THREE.HemisphereLight('#dfe9f3', '#3a3f35', 1.1));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.position.set(-1500, 2500, 1200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -2600, right: 2600, top: 2600, bottom: -2600, near: 100, far: 7000 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // flat lowland around the site
  const land = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshLambertMaterial({ color: '#2b3528' }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.4;
  land.receiveShadow = true;
  scene.add(land);

  const shapesOf = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [])
    .map(([outer, ...holes]) => {
      const s = new THREE.Shape(outer.map(xy));
      s.holes = holes.map((h) => new THREE.Path(h.map(xy)));
      return s;
    });
  // Extrude in the XY plane (x east, y north), then lay it down: y north → -z, depth → up
  const extrude = (geom, depth, base = 0) => {
    const g = new THREE.ExtrudeGeometry(shapesOf(geom), { depth, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, base, 0);
    return g;
  };

  const byKind = (k) => massing.features.filter((f) => f.properties.kind === k);
  for (const f of byKind('ground')) {
    const m = new THREE.Mesh(extrude(f.geometry, 0.2, -0.2), new THREE.MeshLambertMaterial({ color: '#4a5056' }));
    m.receiveShadow = true;
    scene.add(m);
  }
  const roadPts = byKind('road').flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates))
    .flatMap((line) => line.slice(1).flatMap((c, i) => [xy(line[i]), xy(c)]))
    .map((v) => new THREE.Vector3(v.x, 0.15, -v.y));
  const roads = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(roadPts),
    new THREE.LineDashedMaterial({ color: '#d8d2b8', dashSize: 8, gapSize: 8, transparent: true, opacity: 0.5 }));
  roads.computeLineDistances();
  scene.add(roads);

  const masses = Object.fromEntries(byKind('mass').map((f) => [f.properties.code, f.properties]));
  const massGeom = Object.fromEntries(byKind('mass').map((f) => [f.properties.code, f.geometry]));
  const pickable = [];
  const items = [];   // { cls, objects[] } for the legend filter
  const edgeMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 });

  for (const f of plots.features) {
    if (f.geometry.type === 'Point') continue;
    const p = f.properties;
    const cls = classOf(p.code);
    const partial = p.status === 'partial';
    const thick = SLAB[cls.id] ?? 0.3;
    const color = new THREE.Color(cls.color);
    const slab = new THREE.Mesh(extrude(f.geometry, thick), new THREE.MeshLambertMaterial({
      color: color.clone().lerp(new THREE.Color('#808080'), 0.25), transparent: partial, opacity: partial ? 0.55 : 1,
    }));
    slab.receiveShadow = true;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry, 30), edgeMat);
    const objects = [slab, outline];
    const mass = masses[p.code];
    if (mass) {
      const h = mass.floors * (storeyM[cls.id] ?? 4);
      const block = new THREE.Mesh(extrude(massGeom[p.code], h, thick), new THREE.MeshStandardMaterial({
        color: color.clone().lerp(new THREE.Color('#ffffff'), 0.4), roughness: 0.85, transparent: partial, opacity: partial ? 0.6 : 1,
      }));
      block.castShadow = true;
      block.receiveShadow = true;
      objects.push(block, new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry, 30), new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(0.6) })));
      block.userData = { plot: p, height: h };
      pickable.push(block);
    }
    slab.userData = { plot: p };
    pickable.push(slab);
    objects.forEach((o) => scene.add(o));
    items.push({ cls: cls.id, objects });
  }

  // 360° viewpoints as HTML pins
  const pinLayer = document.createElement('div');
  pinLayer.className = 'pins3d';
  el.append(pinLayer);
  const pins = tour.scenes.map((s) => {
    const b = document.createElement('button');
    b.className = 'pin3d';
    b.addEventListener('click', () => onScene(s.id));
    pinLayer.append(b);
    const v = xy([s.lon, s.lat]);
    return { s, b, pos: new THREE.Vector3(v.x, s.type === 'aerial' ? 120 : 10, -v.y) };
  });
  const stems = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pins.flatMap(({ pos }) => [pos.clone().setY(0), pos])),
    new THREE.LineBasicMaterial({ color: '#f0a020' }));
  scene.add(stems);

  // pick plots: a tap (not a drag) opens the plot panel; hover shows the code
  const ray = new THREE.Raycaster();
  const tip = document.createElement('div');
  tip.className = 'tip3d';
  tip.hidden = true;
  el.append(tip);
  const hit = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    return ray.intersectObjects(pickable.filter((o) => o.visible), false)[0]?.object;
  };
  let selected, down;
  const setSelected = (o) => {
    selected?.material.emissive.setHex(0);
    selected = o;
    o?.material.emissive.setHex(0x553300);
  };
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const o = hit(e);
    const block = o?.userData.height != null ? o : pickable.find((b) => b.userData.height != null && b.userData.plot === o?.userData.plot);
    setSelected(block);
    if (o) onPlot(o.userData.plot, block?.userData.height);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) { tip.hidden = true; return; }
    const o = hit(e);
    tip.hidden = !o;
    if (o) {
      const r = el.getBoundingClientRect();
      tip.textContent = o.userData.plot.code;
      tip.style.transform = `translate(${e.clientX - r.left + 12}px, ${e.clientY - r.top + 12}px)`;
    }
    renderer.domElement.style.cursor = o ? 'pointer' : '';
  });
  renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; });

  const compass = el.querySelector('.compass');
  compass?.addEventListener('click', () => {
    // face north, keep distance and tilt
    const d = camera.position.clone().sub(controls.target);
    const flat = Math.hypot(d.x, d.z);
    camera.position.set(controls.target.x, camera.position.y, controls.target.z + flat);
  });

  const v = new THREE.Vector3();
  function frame() {
    controls.update();
    renderer.render(scene, camera);
    const w = el.clientWidth;
    const h = el.clientHeight;
    for (const { b, pos } of pins) {
      v.copy(pos).project(camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      b.hidden = !on;
      if (on) b.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
    if (compass) compass.style.transform = `rotate(${deg(controls.getAzimuthalAngle())}deg)`;
  }
  // whole site in view, seen from the south-southeast at ~45°
  function fit() {
    const size = box.getSize(new THREE.Vector2());
    const half = rad(camera.fov / 2);
    const dist = 0.5 * Math.max(size.y / Math.tan(half), size.x / (Math.tan(half) * camera.aspect));
    const az = rad(20);
    const pol = rad(52);
    controls.target.set(0, 0, 0);
    camera.position.set(dist * Math.sin(pol) * Math.sin(az), dist * Math.cos(pol), dist * Math.sin(pol) * Math.cos(az));
    controls.update();
  }
  let fitted = false;
  function resize() {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!fitted) { fit(); fitted = true; }
  }
  new ResizeObserver(resize).observe(el);

  return {
    show() { resize(); renderer.setAnimationLoop(frame); },
    hide() { renderer.setAnimationLoop(null); tip.hidden = true; },
    applyFilter() {
      for (const { cls, objects } of items) objects.forEach((o) => { o.visible = !hidden.has(cls); });
    },
    applyLang() { for (const { s, b } of pins) { b.textContent = `360° · ${t(s.name)}`; } },
  };
}

function rad(d) { return (d * Math.PI) / 180; }
function deg(r) { return (r * 180) / Math.PI; }
