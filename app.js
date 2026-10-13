import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { planarRay, OMEGA, LAMBDA, PERIOD } from './geodesic.js';

// ---------- scene ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
camera.up.set(0, 0, 1);
camera.position.set(7, -10, 7);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

scene.add(new THREE.Mesh(new THREE.SphereGeometry(2, 64, 32), new THREE.MeshBasicMaterial({ color: 0x000000 })));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(2.01, 48, 24),
  new THREE.MeshBasicMaterial({ color: 0x3a4250, wireframe: true, transparent: true, opacity: 0.25 })));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(3, 48, 24),
  new THREE.MeshBasicMaterial({ color: 0x8090a0, wireframe: true, transparent: true, opacity: 0.025 })));
{ // light ring and polar axis
  const pts = [];
  for (let i = 0; i <= 256; i++) { const a = 2 * Math.PI * i / 256; pts.push(new THREE.Vector3(3 * Math.cos(a), 3 * Math.sin(a), 0)); }
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineDashedMaterial({ color: 0xd4b44a, dashSize: 0.15, gapSize: 0.12, transparent: true, opacity: 0.6 }));
  ring.computeLineDistances(); scene.add(ring);
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 2), 2.5, 0x6e7681, 0.3, 0.15));
}

// ---------- parameters ----------
const $ = id => document.getElementById(id);
const P = {
  panel: 'bundle', speed: 1, pause: false, physfade: true, T: 0.25, K: 2, trail: 0.35,
  w0: 0.06, inc: 90, eps: 0.04, ng: 48, ell: 10, amp: 0.45, pol: 'plus', showbundle: true,
};
const DT = PERIOD / 600;        // sampling of every ray in coordinate time

// ---------- a family of rays, replayed as repeating copies ----------
// A family = template rays given in a canonical frame (central ray starts at (3,0,0)
// moving along +y, orbit normal +z), and a list of groups. Each group places the template
// with an orientation Q_g. A copy born at time t_b is the template rotated by Omega t_b
// about z (in the template frame): by the rotation symmetry this is the same bundle, born
// later. Copies are born every T and live for K T.
class Family {
  constructor({ rays, groups, loops, colors }) {
    this.rays = rays;        // [{pos: Float32Array(3n), n}]
    this.groups = groups;    // [THREE.Quaternion]
    this.loops = loops;      // [[ray indices]] closed head loops, per group (or across groups if acrossGroups)
    this.colors = colors;    // per-ray colour (hex)
    this.root = new THREE.Group(); scene.add(this.root);
    this.slots = [];
  }
  build(nSlots) {
    this.dispose();
    this.root = new THREE.Group(); scene.add(this.root);
    const attrs = this.rays.map(r => new THREE.BufferAttribute(r.pos, 3));
    for (let s = 0; s < nSlots; s++) {
      const slot = { lines: [], spins: [], loopObjs: [] };
      const mats = {};
      const mat = c => (mats[c] ??= new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.6, depthWrite: false }));
      for (const q of this.groups) {
        const outer = new THREE.Group(); outer.quaternion.copy(q);
        const spin = new THREE.Group(); outer.add(spin); this.root.add(outer);
        slot.spins.push(spin);
        this.rays.forEach((r, i) => {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', attrs[i]);
          const line = new THREE.Line(g, mat(this.colors[i])); line.frustumCulled = false;
          spin.add(line); slot.lines.push(line);
        });
      }
      for (const lp of this.loops) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * lp.idx.length), 3));
        const m = new THREE.LineBasicMaterial({ color: lp.color, transparent: true, opacity: 1, depthWrite: false });
        const o = new THREE.LineLoop(g, m); o.frustumCulled = false; this.root.add(o);
        let fill = null;
        if (lp.fill) {   // translucent disk: triangle fan from the centroid over the loop
          const nv = lp.idx.length, fg = new THREE.BufferGeometry();
          fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * (nv + 1)), 3));
          const ix = []; for (let k = 0; k < nv; k++) ix.push(nv, k, (k + 1) % nv);
          fg.setIndex(ix);
          fill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: lp.color, transparent: true, opacity: 0.3,
            side: THREE.DoubleSide, depthWrite: false }));
          fill.frustumCulled = false; this.root.add(fill);
        }
        slot.loopObjs.push({ obj: o, lp, fill });
      }
      slot.lineMats = Object.values(mats); slot.loopMats = slot.loopObjs.map(l => l.obj.material);
      this.slots.push(slot);
    }
  }
  dispose() {
    scene.remove(this.root);
    this.root.traverse(o => { if (o.material) o.material.dispose(); });
    this.slots = [];
  }
  // head position of ray i of group g in a copy of age a, born at t_b
  head(i, g, a, tb, out) {
    const r = this.rays[i], x = a / DT, k = Math.min(Math.floor(x), r.n - 2), s = Math.min(x - k, 1);
    const p = r.pos, j = 3 * k;
    const px = p[j] + s * (p[j + 3] - p[j]), py = p[j + 1] + s * (p[j + 4] - p[j + 1]), pz = p[j + 2] + s * (p[j + 5] - p[j + 2]);
    const c = Math.cos(OMEGA * tb), sn = Math.sin(OMEGA * tb);
    out.set(c * px - sn * py, sn * px + c * py, pz).applyQuaternion(this.groups[g]);
    return out;
  }
  update(t, visible) {
    const T = P.T * PERIOD, L = P.K * T, nTrail = Math.round(P.trail * PERIOD / DT);
    const j0 = Math.floor(t / T);
    const v = new THREE.Vector3();
    this.slots.forEach((slot, s) => {
      const j = j0 - s, tb = j * T, a = t - tb;
      const alive = visible && a >= 0 && a < L;
      slot.lines.forEach(l => (l.visible = alive));
      slot.loopObjs.forEach(l => { l.obj.visible = alive; if (l.fill) l.fill.visible = alive; });
      if (!alive) return;
      const fin = Math.min(1, a / (0.06 * L)), fout = Math.min(1, (L - a) / (0.25 * L));
      const op = fin * fout * (P.physfade ? Math.exp(-LAMBDA * a / 2) : 1);
      slot.lineMats.forEach(m => (m.opacity = 0.55 * op)); slot.loopMats.forEach(m => (m.opacity = op)); slot.loopObjs.forEach(l => l.fill && (l.fill.material.opacity = 0.3 * op));
      slot.spins.forEach(sp => (sp.rotation.z = OMEGA * tb));
      const ia = Math.floor(a / DT), st = Math.max(0, ia - nTrail);
      slot.lines.forEach(l => l.geometry.setDrawRange(st, ia - st + 1));
      for (const { obj, lp } of slot.loopObjs) {
        const arr = obj.geometry.attributes.position.array;
        lp.idx.forEach(([i, g], m) => { this.head(i, g, a, tb, v); arr[3 * m] = v.x; arr[3 * m + 1] = v.y; arr[3 * m + 2] = v.z; });
        obj.geometry.attributes.position.needsUpdate = true;
        const fill = slot.loopObjs.find(l => l.obj === obj).fill;
        if (fill) {
          const nv = lp.idx.length, fa = fill.geometry.attributes.position.array;
          fa.set(arr.subarray(0, 3 * nv));
          let cx = 0, cy = 0, cz = 0;
          for (let k = 0; k < nv; k++) { cx += arr[3 * k]; cy += arr[3 * k + 1]; cz += arr[3 * k + 2]; }
          fa[3 * nv] = cx / nv; fa[3 * nv + 1] = cy / nv; fa[3 * nv + 2] = cz / nv;
          fill.geometry.attributes.position.needsUpdate = true;
        }
      }
    });
  }
}

// template ray with offsets (dr radial, dz out of plane) from the central ray at (3,0,0) -> +y
function templateRay(dr, dz, n) {
  const r0 = 3 + dr, lat = dz / 3;
  const e1 = new THREE.Vector3(Math.cos(lat), 0, Math.sin(lat)), e2 = new THREE.Vector3(0, 1, 0);
  const { r, phi } = planarRay(r0, DT, n);
  const pos = new Float32Array(3 * n);
  for (let k = 0; k < n; k++) {
    const c = r[k] * Math.cos(phi[k]), s = r[k] * Math.sin(phi[k]);
    pos[3 * k] = c * e1.x + s * e2.x; pos[3 * k + 1] = c * e1.y + s * e2.y; pos[3 * k + 2] = c * e1.z + s * e2.z;
  }
  return { pos, n };
}

const CYAN = 0x39c5e8, ORANGE = 0xf0883e, BLUE = 0x58a6ff, WHITE = 0xe6edf3;

function bundleFamily(w0) {
  const n = Math.ceil(P.K * P.T * PERIOD / DT) + 3, NR = 32;
  const rays = [], colors = [], idx = [], idx2 = [];
  for (let i = 0; i < NR; i++) {
    const a = 2 * Math.PI * i / NR;
    rays.push(templateRay(w0 * Math.cos(a), w0 * Math.sin(a), n)); colors.push(CYAN); idx.push([i, 0]);
  }
  for (let i = 0; i < NR / 2; i++) {
    const a = 4 * Math.PI * i / NR;
    rays.push(templateRay(0.5 * w0 * Math.cos(a), 0.5 * w0 * Math.sin(a), n)); colors.push(CYAN); idx2.push([NR + i, 0]);
  }
  rays.push(templateRay(0, 0, n)); colors.push(WHITE);
  return new Family({ rays, colors, groups: [new THREE.Quaternion()],
    loops: [{ idx, color: 0xffffff, fill: true }, { idx: idx2, color: 0x9ad8f0 }] });
}

function ringFamily() {
  const n = Math.ceil(P.K * P.T * PERIOD / DT) + 3, inc = P.inc * Math.PI / 180;
  const rays = [templateRay(0, 0, n), templateRay(P.eps, 0, n), templateRay(-P.eps, 0, n)];
  const colors = [WHITE, ORANGE, BLUE];
  const groups = [];
  for (let g = 0; g < P.ng; g++) {
    const ph = 2 * Math.PI * g / P.ng;
    const e1 = new THREE.Vector3(Math.cos(ph), Math.sin(ph), 0);
    const e2 = new THREE.Vector3(-Math.sin(ph) * Math.cos(inc), Math.cos(ph) * Math.cos(inc), Math.sin(inc));
    const e3 = new THREE.Vector3().crossVectors(e1, e2);
    groups.push(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3)));
  }
  const loop = i => [...Array(P.ng).keys()].map(g => [i, g]);
  return new Family({ rays, colors, groups,
    loops: [{ idx: loop(0), color: 0xffffff }, { idx: loop(1), color: ORANGE }, { idx: loop(2), color: BLUE }] });
}

// ---------- spin-2: rings of test particles held by static observers ----------
const NPHI = 36, NSEG = 40;
const strain = new THREE.LineSegments(new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
strain.frustumCulled = false; scene.add(strain);
let strainSites = [];
function buildStrain() {
  const sig = 1 / Math.sqrt(P.ell), lats = [-sig, 0, sig];
  strainSites = [];
  for (const lat of lats) for (let i = 0; i < NPHI; i++) {
    const ph = 2 * Math.PI * i / NPHI, th = Math.PI / 2 - lat;
    const rh = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
    const thh = new THREE.Vector3(Math.cos(th) * Math.cos(ph), Math.cos(th) * Math.sin(ph), -Math.sin(th));
    strainSites.push({ c: rh.clone().multiplyScalar(3), rh, thh, ph, env: Math.pow(Math.sin(th), P.ell) });
  }
  strain.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(strainSites.length * NSEG * 6), 3));
  strain.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(strainSites.length * NSEG * 6), 3));
}
function updateStrain(t) {
  const arr = strain.geometry.attributes.position.array, col = strain.geometry.attributes.color.array, rho = 0.24;
  const cA = new THREE.Color(0xff4fd8), cB = new THREE.Color(0x7ee787), cc = new THREE.Color();
  const w = OMEGA * (P.ell + 0.5);
  let m = 0;
  const pt = (S, hp, hx, s) => {
    const x = Math.cos(s), y = Math.sin(s);          // x along r-hat, y along theta-hat
    const dx = 0.5 * (hp * x + hx * y), dy = 0.5 * (hx * x - hp * y);
    const a = rho * (x + dx), b = rho * (y + dy);
    return [S.c.x + a * S.rh.x + b * S.thh.x, S.c.y + a * S.rh.y + b * S.thh.y, S.c.z + a * S.rh.z + b * S.thh.z];
  };
  for (const S of strainSites) {
    const ph = P.ell * S.ph - w * t, A = P.amp * S.env;
    const hp = P.pol === 'cross' ? 0 : A * Math.cos(ph);
    const hx = P.pol === 'plus' ? 0 : A * (P.pol === 'cross' ? Math.cos(ph) : Math.sin(ph));
    // colour: magenta when stretched along r-hat (or the first diagonal), green when along theta-hat
    const sgn = P.pol === 'cross' ? Math.cos(ph) : Math.cos(ph);
    cc.copy(cA).lerp(cB, 0.5 - 0.5 * sgn).multiplyScalar(0.35 + 0.65 * S.env);
    for (let k = 0; k < NSEG; k++) {
      col.set([cc.r, cc.g, cc.b, cc.r, cc.g, cc.b], m);
      const p0 = pt(S, hp, hx, 2 * Math.PI * k / NSEG), p1 = pt(S, hp, hx, 2 * Math.PI * (k + 1) / NSEG);
      arr.set(p0, m); arr.set(p1, m + 3); m += 6;
    }
  }
  strain.geometry.attributes.position.needsUpdate = true;
  strain.geometry.attributes.color.needsUpdate = true;
}

// ---------- wiring ----------
let fam = null;
function rebuild() {
  if (fam) fam.dispose();
  fam = P.panel === 'ring' ? ringFamily() : bundleFamily(P.panel === 'spin2' ? P.w0b : P.w0);
  fam.build(P.K + 1);
  strain.visible = P.panel === 'spin2';
  if (strain.visible) buildStrain();
  legend();
}
function legend() {
  const sw = (c, s) => `<span class="sw" style="background:${c}"></span>${s}`;
  $('legend').innerHTML = {
    bundle: sw('#39c5e8', 'null geodesics') + sw('#fff', 'cross-section at constant t') + sw('#d4b44a', 'light ring r = 3M'),
    ring: sw('#fff', 'rays on r = 3M') + sw('#f0883e', 'r = 3M + ε') + sw('#58a6ff', 'r = 3M − ε'),
    spin2: sw('#ff4fd8', 'ring stretched along r̂ (+) / diagonal (×)') + sw('#7ee787', 'stretched along θ̂ / other diagonal') + sw('#39c5e8', 'ray bundle (background optics)'),
  }[P.panel];
}

const fmt = { speed: v => `${(+v).toFixed(2)} orbit / 8 s`, T: v => `${(+v).toFixed(2)}  (growth ×${Math.exp(LAMBDA * v * PERIOD).toFixed(2)})`,
  K: v => v, trail: v => (+v).toFixed(2), w0: v => v, w0b: v => v, inc: v => v, eps: v => v, ng: v => v, ell: v => v, amp: v => v };
for (const id of Object.keys(fmt)) {
  const el = $(id), out = $('v-' + id);
  const set = () => { P[id] = +el.value; if (out) out.textContent = fmt[id](el.value); };
  set();
  el.addEventListener('input', () => { set(); if (!['speed', 'trail', 'amp'].includes(id)) rebuild(); });
}
$('pause').addEventListener('change', e => (P.pause = e.target.checked));
$('physfade').addEventListener('change', e => (P.physfade = e.target.checked));
$('showbundle').addEventListener('change', e => (P.showbundle = e.target.checked));
document.querySelectorAll('input[name=pol]').forEach(r => r.addEventListener('change', e => (P.pol = e.target.value)));
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  P.panel = b.dataset.p;
  for (const k of ['bundle', 'ring', 'spin2']) { $('c-' + k).classList.toggle('on', k === P.panel); $('t-' + k).classList.toggle('on', k === P.panel); }
  rebuild();
}));

// URL hash options for screenshots: #panel=ring&t=40&inc=60
const hp = new URLSearchParams(location.hash.slice(1));
let simT = hp.has('t') ? +hp.get('t') : 0;
for (const [k, v] of hp) if (k in P && k !== 'panel' && $(k)) { $(k).value = v; $(k).dispatchEvent(new Event('input')); }
if (hp.has('tgt')) controls.target.fromArray(hp.get('tgt').split(',').map(Number));
if (hp.has('cam')) camera.position.fromArray(hp.get('cam').split(',').map(Number));
if (hp.has('pause')) { P.pause = true; $('pause').checked = true; }

resize();
rebuild();
if (hp.has('panel')) document.querySelector(`.tabs button[data-p=${hp.get('panel')}]`).click();
let last = performance.now();
function frame(now) {
  const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
  if (!P.pause) simT += dtReal * P.speed * PERIOD / 8;
  fam.update(simT, P.panel !== 'spin2' || P.showbundle);
  if (strain.visible) updateStrain(simT);
  $('hud').textContent =
    `t = ${simT.toFixed(1)} M   (${(simT / PERIOD).toFixed(2)} orbits)\n` +
    `Ω = λ = 1/(3√3 M) = ${OMEGA.toFixed(4)}/M\n` +
    `new bundle every T = ${(P.T * PERIOD).toFixed(1)} M: each is the last one shrunk by e^(-λT) = 1/${Math.exp(LAMBDA * P.T * PERIOD).toFixed(2)}` +
    (P.panel === 'spin2' ? `\nℓ = m = ${P.ell}:  Mω ≈ ${(OMEGA * (P.ell + 0.5)).toFixed(3)} − ${(LAMBDA / 2).toFixed(3)} i` : '');
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;
