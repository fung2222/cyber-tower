// NEON BASTION view — Three.js board (glass slab, flowing data path, build pads, mini neon city blocks, portal, core),
// tower + enemy models (neon edges), beams / chain lightning / missiles, range ring, picking. Reads the pure Game state.
import * as THREE from 'three';
import { U } from 'cyber-kit/core/theme.js';
import { GRID, TOWERS, ENEMIES, cellPos } from './config.js';

const HASH = /* glsl */`float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const metal = new THREE.MeshStandardMaterial({ color: 0x1b1836, metalness: 0.85, roughness: 0.32 });
const metalDark = new THREE.MeshStandardMaterial({ color: 0x0c0a1c, metalness: 0.7, roughness: 0.45 });
const glowCache = new Map();
const glow = (c, o = 1) => { const k = c + ':' + o; if (!glowCache.has(k)) glowCache.set(k, new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, toneMapped: false })); return glowCache.get(k); };
const lineCache = new Map();
const edgeMat = (c) => { if (!lineCache.has(c)) lineCache.set(c, new THREE.LineBasicMaterial({ color: c, toneMapped: false })); return lineCache.get(c); };
function withEdges(geo, mat, color) { const m = new THREE.Mesh(geo, mat); m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat(color))); return m; }

// ---------------------------------------------------------------- tower models
const G = {
  base: new THREE.CylinderGeometry(0.34, 0.42, 0.16, 8), baseRing: new THREE.TorusGeometry(0.37, 0.025, 6, 24), pip: new THREE.BoxGeometry(0.07, 0.05, 0.07),
  col: new THREE.CylinderGeometry(0.09, 0.13, 0.32, 8), halo: new THREE.TorusGeometry(0.3, 0.018, 6, 32),
};
export function makeTower(type) {
  const d = TOWERS[type], c = d.color, g = new THREE.Group();
  const base = withEdges(G.base, metal, c); base.position.y = 0.08; g.add(base);
  const ring = new THREE.Mesh(G.baseRing, glow(c)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.17; g.add(ring);
  const pips = []; for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(G.pip, glow(0xffffff)); const a = -0.5 + i * 0.5; p.position.set(Math.sin(a) * 0.33, 0.19, Math.cos(a) * 0.33); g.add(p); pips.push(p); }
  const head = new THREE.Group(); head.position.y = 0.2; g.add(head);
  const spin = [];
  if (type === 'laser') {
    const col = new THREE.Mesh(G.col, metal); col.position.y = 0.16; head.add(col);
    const body = withEdges(new THREE.BoxGeometry(0.24, 0.2, 0.42), metalDark, c); body.position.set(0, 0.38, 0.02); head.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 8), glow(c)); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.38, 0.32); head.add(barrel);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow(0xffffff)); lens.position.set(0, 0.38, 0.5); head.add(lens);
    g.userData.muzzle = new THREE.Vector3(0, 0.58, 0.5);
  } else if (type === 'cryo') {
    const dish = withEdges(new THREE.CylinderGeometry(0.3, 0.14, 0.14, 12, 1, true), metal, c); dish.position.y = 0.2; head.add(dish);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), glow(c)); core.position.y = 0.38; head.add(core); spin.push(core);
    for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.22 + i * 0.08, 0.012, 6, 32), glow(0xd8f6ff, 0.8)); r.position.y = 0.36; r.rotation.x = Math.PI / 2 + i * 0.6; head.add(r); spin.push(r); }
    g.userData.muzzle = new THREE.Vector3(0, 0.58, 0);
  } else if (type === 'missile') {
    const col = new THREE.Mesh(G.col, metal); col.position.y = 0.12; head.add(col);
    const pod = withEdges(new THREE.BoxGeometry(0.44, 0.24, 0.38), metalDark, c); pod.position.y = 0.36; head.add(pod);
    for (let i = 0; i < 4; i++) { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), glow(c)); tube.rotation.x = Math.PI / 2; tube.position.set(-0.11 + (i % 2) * 0.22, 0.31 + Math.floor(i / 2) * 0.1, 0.2); head.add(tube); }
    g.userData.muzzle = new THREE.Vector3(0, 0.6, 0.25);
  } else if (type === 'tesla') {
    const col = withEdges(new THREE.CylinderGeometry(0.07, 0.12, 0.5, 8), metal, c); col.position.y = 0.25; head.add(col);
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.03, 0.022, 6, 20), glow(c)); r.rotation.x = Math.PI / 2; r.position.y = 0.14 + i * 0.13; head.add(r); }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), glow(0xe8d2ff)); orb.position.y = 0.58; head.add(orb); spin.push(orb);
    g.userData.muzzle = new THREE.Vector3(0, 0.78, 0);
  } else {   // overclock node
    const py = withEdges(new THREE.OctahedronGeometry(0.2, 0), metalDark, c); py.position.y = 0.32; py.scale.y = 1.5; head.add(py);
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 32), glow(c)); r1.rotation.x = Math.PI / 2; r1.position.y = 0.3; head.add(r1); spin.push(r1);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 32), glow(0xffffff, 0.8)); r2.position.y = 0.3; head.add(r2); spin.push(r2);
    g.userData.muzzle = new THREE.Vector3(0, 0.6, 0);
  }
  const halo = new THREE.Mesh(G.halo, glow(c, 0.9)); halo.rotation.x = Math.PI / 2; halo.position.y = 0.95; g.add(halo);
  Object.assign(g.userData, { head, spin, pips, halo, type, ring });
  setTowerLevel(g, 1);
  return g;
}
export function setTowerLevel(g, level) {
  g.userData.pips.forEach((p, i) => { p.visible = i < level; });
  g.userData.halo.visible = level >= 3;
  g.scale.setScalar(1 + (level - 1) * 0.09);
}

// ---------------------------------------------------------------- enemy models
const EG = {
  runner: new THREE.ConeGeometry(0.2, 0.5, 5), tank: new THREE.BoxGeometry(0.5, 0.28, 0.56), shield: new THREE.IcosahedronGeometry(0.22, 0),
  splitter: new THREE.DodecahedronGeometry(0.26, 0), mini: new THREE.TetrahedronGeometry(0.17, 0), drone: new THREE.OctahedronGeometry(0.16, 0), boss: new THREE.OctahedronGeometry(0.5, 0),
  bubble: new THREE.SphereGeometry(0.4, 18, 12), rotor: new THREE.TorusGeometry(0.1, 0.015, 4, 16), arm: new THREE.BoxGeometry(0.56, 0.03, 0.05),
  bar: new THREE.PlaneGeometry(1, 1), frost: new THREE.RingGeometry(0.22, 0.32, 20), spike: new THREE.ConeGeometry(0.09, 0.4, 4), shadow: new THREE.CircleGeometry(0.3, 16),
};
const enemyMat = new Map();
function eMat(c) { if (!enemyMat.has(c)) enemyMat.set(c, new THREE.MeshStandardMaterial({ color: 0x120b24, emissive: c, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.35 })); return enemyMat.get(c); }
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x3bb8ff, ...ADD, opacity: 0.22 });
const frostMat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, ...ADD, opacity: 0.7, side: THREE.DoubleSide });
const barBg = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
export function makeEnemy(type) {
  const d = ENEMIES[type], g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const m = eMat(d.color);
  const core = withEdges(EG[type], m, d.color); body.add(core);
  if (type === 'runner') core.rotation.x = Math.PI / 2;
  if (type === 'tank') { for (const s of [-1, 1]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.6), glow(d.color)); tr.position.set(s * 0.3, -0.1, 0); body.add(tr); } const tur = withEdges(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 6), m, d.color); tur.position.y = 0.2; body.add(tur); }
  if (type === 'drone') { for (const a of [Math.PI / 4, -Math.PI / 4]) { const arm = new THREE.Mesh(EG.arm, metal); arm.rotation.y = a; body.add(arm); } for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(EG.rotor, glow(d.color)); const a = Math.PI / 4 + i * Math.PI / 2; r.position.set(Math.cos(a) * 0.26, 0.02, Math.sin(a) * 0.26); r.rotation.x = Math.PI / 2; body.add(r); } }
  if (type === 'boss') { for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(EG.spike, glow(0xff2bd6)); const a = i / 6 * Math.PI * 2; s.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); s.rotation.z = -Math.PI / 2; s.rotation.y = -a; body.add(s); } const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.03, 6, 40), glow(d.color)); ring.rotation.x = Math.PI / 2; body.add(ring); g.userData.ring = ring; }
  let bubble = null; if (type === 'shield') { bubble = new THREE.Mesh(EG.bubble, bubbleMat); body.add(bubble); }
  const frost = new THREE.Mesh(EG.frost, frostMat); frost.rotation.x = -Math.PI / 2; frost.visible = false; g.add(frost);
  const shadow = new THREE.Mesh(EG.shadow, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(d.size * 3); g.add(shadow);
  // billboard health bar
  const bar = new THREE.Group(), w = type === 'boss' ? 1.2 : 0.55;
  const bg = new THREE.Mesh(EG.bar, barBg); bg.scale.set(w + 0.04, 0.09, 1); bar.add(bg);
  const fg = new THREE.Mesh(EG.bar, new THREE.MeshBasicMaterial({ color: 0x3bff8a, toneMapped: false, depthWrite: false })); fg.scale.set(w, 0.06, 1); fg.position.z = 0.001; bar.add(fg);
  const sh = new THREE.Mesh(EG.bar, glow(0x7fd8ff)); sh.scale.set(w, 0.04, 1); sh.position.set(0, 0.07, 0.001); sh.visible = false; bar.add(sh);
  bar.position.y = (d.flying ? 0.9 : 0.25) + d.size + 0.32; g.add(bar);
  const fly = d.flying ? 0.9 : type === 'boss' ? 0.55 : d.size * 0.9;
  body.position.y = fly; core.scale.setScalar(type === 'boss' ? 1 : 1);
  Object.assign(g.userData, { body, core, bubble, frost, bar, fg, sh, w, fly, flash: 0 });
  return g;
}

// ---------------------------------------------------------------- board
export class View {
  constructor(stage) {
    this.stage = stage; this.scene = stage.scene; this.camera = stage.camera;
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.board = new THREE.Group(); this.root.add(this.board);
    this.towerMeshes = new Map(); this.enemyMeshes = new Map(); this.shotMeshes = new Map();
    this.beams = []; this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmpV = new THREE.Vector3(); this.flowT = { value: 0 };
    // shared beam pool (laser + chain lightning)
    this.beamGeo = new THREE.BoxGeometry(1, 1, 1); this.beamGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, ...ADD, opacity: 1, toneMapped: false })); m.visible = false; m.life = 0; this.root.add(m); this.beams.push(m); }
    // range ring + selection marker
    this.range = new THREE.Group();
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 72), new THREE.MeshBasicMaterial({ color: 0x00e5ff, ...ADD, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshBasicMaterial({ color: 0x00e5ff, ...ADD, opacity: 0.08, side: THREE.DoubleSide }));
    ringM.rotation.x = disc.rotation.x = -Math.PI / 2; this.range.add(disc, ringM); this.range.position.y = 0.04; this.range.visible = false; this.range.userData = { ringM, disc }; this.root.add(this.range);
    this.sel = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 4, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, ...ADD, side: THREE.DoubleSide, toneMapped: false }));
    this.sel.rotation.x = -Math.PI / 2; this.sel.rotation.z = Math.PI / 4; this.sel.position.y = 0.05; this.sel.visible = false; this.root.add(this.sel);
    this.coreFlash = 0;
  }
  clearDynamic() {
    for (const m of this.towerMeshes.values()) this.root.remove(m); this.towerMeshes.clear();
    for (const m of this.enemyMeshes.values()) this.root.remove(m); this.enemyMeshes.clear();
    for (const m of this.shotMeshes.values()) this.root.remove(m); this.shotMeshes.clear();
    for (const b of this.beams) { b.visible = false; b.life = 0; }
    this.select(null);
  }
  setMap(game) {
    this.clearDynamic();
    this.root.remove(this.board); this.board.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    this.board = new THREE.Group(); this.root.add(this.board);
    const L = game.L, W = GRID.w, H = GRID.h;
    // glass slab with cell grid
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.5, H + 0.5), new THREE.MeshStandardMaterial({ color: 0x07051a, metalness: 0.9, roughness: 0.25 }));
    slab.position.y = -0.26; this.board.add(slab);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.5, 0.5, H + 0.5)), new THREE.LineBasicMaterial({ color: 0xff2bd6, toneMapped: false })); edge.position.y = -0.26; this.board.add(edge);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({ ...ADD, uniforms: { uC: U.uC1, uT: U.uTime },
      vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uC; uniform float uT; varying vec2 vP; void main(){ vec2 q = vP + vec2(${(W % 2 ? 0.5 : 0).toFixed(1)}, ${(H % 2 ? 0.5 : 0).toFixed(1)}); vec2 f = abs(fract(q) - 0.5); float l = smoothstep(0.47, 0.5, max(f.x, f.y)); float scan = 0.5 + 0.5 * sin(vP.y * 0.9 - uT * 1.2); gl_FragColor = vec4(uC * l * (0.10 + 0.08 * scan), 1.0); }` }));
    grid.rotation.x = -Math.PI / 2; grid.position.y = 0.002; this.board.add(grid);
    // flowing data path (instanced tiles, pulses travel toward the core)
    const n = L.cells.length, tileGeo = new THREE.PlaneGeometry(0.98, 0.98); tileGeo.rotateX(-Math.PI / 2);
    const aS = new Float32Array(n), aDir = new Float32Array(n * 2);
    const path = new THREE.InstancedMesh(tileGeo, new THREE.ShaderMaterial({ uniforms: { uT: this.flowT, uC1: U.uC1, uC2: U.uC2, uN: { value: n } },
      vertexShader: /* glsl */`attribute float aS; attribute vec2 aDir; varying float vS; varying vec2 vDir; varying vec2 vL; void main(){ vS = aS; vDir = aDir; vL = position.xz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform float uT, uN; uniform vec3 uC1, uC2; varying float vS; varying vec2 vDir; varying vec2 vL;
        void main(){
          float along = vS + dot(vL, vDir); vec2 perp = vec2(-vDir.y, vDir.x); float across = abs(dot(vL, perp));
          float rail = smoothstep(0.42, 0.49, across) * 0.9;
          float chev = fract(along * 1.0 - across * 0.9 - uT * 1.6); float pulse = smoothstep(0.75, 0.95, chev) * (1.0 - smoothstep(0.95, 1.0, chev));
          float core = smoothstep(0.07, 0.0, across) * 0.6;
          vec3 c = mix(uC1, uC2, smoothstep(0.55, 1.0, vS / uN));
          vec3 col = vec3(0.01, 0.02, 0.05) + c * (0.10 + rail + pulse * 0.9 * (1.0 - smoothstep(0.35, 0.45, across)) + core);
          gl_FragColor = vec4(col, 1.0);
        }` }), n);
    const m4 = new THREE.Matrix4();
    L.cells.forEach(([c, r], i) => {
      const [x, z] = cellPos(c, r); m4.makeTranslation(x, 0.012, z); path.setMatrixAt(i, m4); aS[i] = i;
      const a = L.cells[Math.min(n - 1, i + 1)], b = L.cells[Math.max(0, i === n - 1 ? i - 1 : i)];
      let dx = a[0] - b[0], dz = a[1] - b[1]; if (i === n - 1) { dx = L.cells[i][0] - L.cells[i - 1][0]; dz = L.cells[i][1] - L.cells[i - 1][1]; } const l = Math.hypot(dx, dz) || 1; aDir[i * 2] = dx / l; aDir[i * 2 + 1] = dz / l;
    });
    tileGeo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 1)); tileGeo.setAttribute('aDir', new THREE.InstancedBufferAttribute(aDir, 2));
    this.board.add(path);
    // build pads
    const padGeo = new THREE.PlaneGeometry(0.86, 0.86); padGeo.rotateX(-Math.PI / 2);
    const pads = new THREE.InstancedMesh(padGeo, new THREE.ShaderMaterial({ ...ADD, uniforms: { uT: U.uTime, uC: U.uC1, uC3: U.uC3 },
      vertexShader: /* glsl */`varying vec2 vL; varying float vI; void main(){ vL = position.xz / 0.43; vI = float(gl_InstanceID); gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform float uT; uniform vec3 uC, uC3; varying vec2 vL; varying float vI; void main(){ vec2 a = abs(vL); float m = max(a.x, a.y); float frame = smoothstep(0.82, 0.9, m) * (1.0 - smoothstep(0.97, 1.0, m));
        float corner = step(0.55, min(a.x, a.y)); float dot0 = smoothstep(0.16, 0.1, length(vL)); float br = 0.55 + 0.45 * sin(uT * 2.0 + vI * 1.7);
        vec3 col = uC * frame * (0.35 + corner * 0.9) * br + uC3 * dot0 * 0.5 * br + uC * 0.035; gl_FragColor = vec4(col, 1.0); }` }), L.pads.length);
    L.pads.forEach(([c, r], i) => { const [x, z] = cellPos(c, r); m4.makeTranslation(x, 0.02, z); pads.setMatrixAt(i, m4); });
    this.board.add(pads); this.padMesh = pads;
    // mini neon city blocks on the remaining cells
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({ uniforms: { uT: U.uTime, uC1: U.uC1, uC2: U.uC2, uC3: U.uC3 },
      vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN; varying float vSeed; void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(instanceMatrix) * normal); vSeed = instanceMatrix[3][0] * 1.31 + instanceMatrix[3][2] * 0.77; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`uniform float uT; uniform vec3 uC1, uC2, uC3; varying vec3 vW; varying vec3 vN; varying float vSeed; ${HASH}
        void main(){ vec3 col = vec3(0.02, 0.016, 0.045) * (0.5 + 0.5 * max(vN.y, 0.0));
          vec2 uv = vec2(abs(vN.x) > 0.5 ? vW.z : vW.x, vW.y) * vec2(9.0, 14.0); vec2 id = floor(uv), f = fract(uv);
          float lit = step(0.62, h21(id + vSeed)) * step(0.25, f.x) * step(0.3, f.y) * (1.0 - step(0.5, abs(vN.y)));
          col += mix(uC1, uC3, step(0.5, h21(id * 0.7 + vSeed))) * lit * (0.5 + 0.3 * sin(uT + vSeed * 9.0));
          float roof = step(0.5, vN.y) * smoothstep(0.38, 0.5, max(abs(fract(vW.x + 0.5) - 0.5), abs(fract(vW.z + 0.5) - 0.5)));
          col += uC2 * roof * 0.9; gl_FragColor = vec4(col, 1.0); }` }), L.decor.length);
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    L.decor.forEach(([c, r], i) => {
      const [x, z] = cellPos(c, r), h = 0.12 + ((c * 31 + r * 17) % 7) / 7 * 0.5, w = 0.55 + ((c * 13 + r * 7) % 3) * 0.1;
      p.set(x, h / 2, z); s.set(w, h, w); m4.compose(p, q, s); blocks.setMatrixAt(i, m4);
    });
    this.board.add(blocks);
    // drone flight line (dashed): drones ignore the path and fly straight at the core
    const [sx, sz] = game.spawnPos, [cx, cz] = game.corePos;
    const fl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sx, 0.9, sz), new THREE.Vector3(cx, 0.9, cz)]), new THREE.LineDashedMaterial({ color: 0xfff35c, dashSize: 0.18, gapSize: 0.22, transparent: true, opacity: 0.35 }));
    fl.computeLineDistances(); this.board.add(fl);
    // spawn portal
    const portal = new THREE.Group(); portal.position.set(sx, 0, sz);
    const pr = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 40), glow(0xff2bd6)); pr.position.y = 0.48; portal.add(pr);
    const pr2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 32), glow(0xffffff, 0.8)); pr2.position.y = 0.48; portal.add(pr2);
    const d0 = L.cells[1] ? [L.cells[1][0] - L.cells[0][0], L.cells[1][1] - L.cells[0][1]] : [0, 1]; portal.rotation.y = Math.atan2(d0[0], d0[1]);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2bd6, ...ADD, opacity: 0.18, side: THREE.DoubleSide })); beam.position.y = 1.5; portal.add(beam);
    this.board.add(portal); this.portal = { g: portal, pr, pr2 };
    // the core
    const core = new THREE.Group(); core.position.set(cx, 0, cz);
    const hex = withEdges(new THREE.CylinderGeometry(0.46, 0.5, 0.14, 6), metal, 0x00e5ff); hex.position.y = 0.07; core.add(hex);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0x0a1a30, emissive: 0x00e5ff, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.2 }));
    crystal.position.y = 0.72; crystal.scale.y = 1.4; core.add(crystal);
    const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.46, 0)), edgeMat(0xbff4ff)); cage.position.y = 0.72; core.add(cage);
    const cring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.02, 6, 40), glow(0x00e5ff)); cring.rotation.x = Math.PI / 2; cring.position.y = 0.3; core.add(cring);
    const light = new THREE.PointLight(0x00e5ff, 6, 4, 1.5); light.position.y = 1; core.add(light);
    this.board.add(core); this.core = { g: core, crystal, cage, cring, light };
  }
  // ------------------------------------------------------------ picking
  cellAt(px, py) {
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera); const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    const c = Math.round(hit.x + (GRID.w - 1) / 2), rr = Math.round(hit.z + (GRID.h - 1) / 2);
    return c >= 0 && rr >= 0 && c < GRID.w && rr < GRID.h ? [c, rr] : null;
  }
  screenOf(c, r, y = 0.3) { const [x, z] = cellPos(c, r); return this.stage.toScreen(this.tmpV.set(x, y, z)); }
  select(sel) {   // sel: null | { c, r, range, color }
    this.selInfo = sel;
    this.sel.visible = !!sel; this.range.visible = !!(sel && sel.range);
    if (!sel) return;
    const [x, z] = cellPos(sel.c, sel.r); this.sel.position.x = x; this.sel.position.z = z;
    if (sel.range) { this.range.position.x = x; this.range.position.z = z; this.range.scale.setScalar(sel.range); this.range.userData.ringM.material.color.setHex(sel.color || 0x00e5ff); this.range.userData.disc.material.color.setHex(sel.color || 0x00e5ff); }
  }
  // ------------------------------------------------------------ effects
  beam(from, to, color, width = 0.05, life = 0.09) {
    const b = this.beams.find((x) => !x.visible); if (!b) return;
    const d = to.clone().sub(from), len = d.length(); if (len < 0.01) return;
    b.position.copy(from); b.lookAt(to); b.scale.set(width, width, len); b.material.color.setHex(color); b.material.opacity = 1; b.visible = true; b.life = life; b.maxLife = life;
  }
  zap(points, color) {   // jagged chain lightning through the points (Vector3s)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]; let prev = a;
      for (let k = 1; k <= 3; k++) {
        const p = a.clone().lerp(b, k / 3); if (k < 3) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
        this.beam(prev, p, color, 0.045, 0.13); this.beam(prev, p, 0xffffff, 0.015, 0.1); prev = p;
      }
    }
  }
  muzzle(t) { const m = this.towerMeshes.get(t.id); if (!m) return new THREE.Vector3(t.x, 0.6, t.z); m.updateMatrixWorld(); return m.userData.head.localToWorld(m.userData.muzzle.clone().sub(m.userData.head.position)); }
  // ------------------------------------------------------------ per-frame sync
  sync(game, dt, time) {
    this.flowT.value += dt;
    // towers
    for (const t of game.towers.values()) {
      let m = this.towerMeshes.get(t.id);
      if (!m) { m = makeTower(t.type); m.position.set(t.x, 0, t.z); m.userData.level = 0; this.root.add(m); this.towerMeshes.set(t.id, m); m.userData.pop = 0.35; }
      if (m.userData.level !== t.level) { setTowerLevel(m, t.level); m.userData.level = t.level; m.userData.pop = 0.3; }
      const h = m.userData.head;
      if (t.type === 'laser' || t.type === 'missile') { const cur = h.rotation.y, tgt = t.aim; let dA = ((tgt - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; h.rotation.y = cur + dA * Math.min(1, dt * 14); }
      for (const s of m.userData.spin) { s.rotation.y += dt * (t.type === 'overclock' ? 2.4 : 1.5); s.rotation.z += dt * 0.8; }
      m.userData.halo.rotation.z += dt; m.userData.halo.position.y = 0.95 + Math.sin(time * 2 + t.id) * 0.04;
      if (m.userData.pop > 0) { m.userData.pop -= dt; const k = 1 + Math.sin(Math.max(0, m.userData.pop) / 0.35 * Math.PI) * 0.18; m.scale.setScalar((1 + (t.level - 1) * 0.09) * k); }
    }
    for (const [id, m] of this.towerMeshes) if (![...game.towers.values()].some((t) => t.id === id)) { this.root.remove(m); this.towerMeshes.delete(id); }
    // enemies
    const camQ = this.camera.quaternion, alive = new Set();
    for (const e of game.enemies) {
      alive.add(e.id);
      let m = this.enemyMeshes.get(e.id);
      if (!m) { m = makeEnemy(e.type); this.root.add(m); this.enemyMeshes.set(e.id, m); m.position.set(e.x, 0, e.z); }
      const u = m.userData, prevX = m.position.x, prevZ = m.position.z;
      m.position.set(e.x, 0, e.z);
      const vx = e.x - prevX, vz = e.z - prevZ; if (Math.abs(vx) + Math.abs(vz) > 1e-4) u.body.rotation.y = Math.atan2(vx, vz);
      u.body.position.y = u.fly + Math.sin(time * 6 + e.id) * (e.flying ? 0.06 : 0.025);
      if (e.type === 'drone' || e.type === 'shield' || e.type === 'splitter' || e.type === 'mini') u.core.rotation.y += dt * 3;
      if (u.ring) u.ring.rotation.z += dt * 2;
      const hp = Math.max(0, e.hp / e.maxHp); u.fg.scale.x = u.w * hp; u.fg.position.x = -u.w * (1 - hp) / 2; u.fg.material.color.setHSL(0.33 * hp, 1, 0.55);
      u.sh.visible = e.maxShield > 0 && e.shield > 0; if (u.sh.visible) { const sp = e.shield / e.maxShield; u.sh.scale.x = u.w * sp; u.sh.position.x = -u.w * (1 - sp) / 2; }
      if (u.bubble) { u.bubble.visible = e.shield > 0; u.bubble.scale.setScalar(0.9 + 0.1 * Math.sin(time * 8)); }
      u.frost.visible = e.slowT > 0; if (u.frost.visible) u.frost.rotation.z += dt * 2;
      u.bar.quaternion.copy(camQ); u.bar.visible = hp < 0.999 || e.type === 'boss' || (e.maxShield > 0 && e.shield < e.maxShield);
      if (u.flash > 0) { u.flash -= dt * 5; }
    }
    for (const [id, m] of this.enemyMeshes) if (!alive.has(id)) { this.root.remove(m); this.enemyMeshes.delete(id); }
    // missiles
    const live = new Set();
    for (const s of game.shots) {
      live.add(s.id); let m = this.shotMeshes.get(s.id);
      if (!m) { m = new THREE.Group(); const body = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 6), glow(0xffc27a)); body.rotation.x = Math.PI / 2; m.add(body); const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0xff5a1f)); fl.position.z = -0.14; m.add(fl); this.root.add(m); this.shotMeshes.set(s.id, m); }
      const k = Math.min(1, Math.hypot(s.x - s.t.x, s.z - s.t.z) / 1.2); m.position.set(s.x, 0.55 + Math.sin(k * Math.PI) * 0.35, s.z); m.rotation.y = s.ang ?? 0;
    }
    for (const [id, m] of this.shotMeshes) if (!live.has(id)) { this.root.remove(m); this.shotMeshes.delete(id); }
    // beams fade
    for (const b of this.beams) if (b.visible) { b.life -= dt; b.material.opacity = Math.max(0, b.life / b.maxLife); if (b.life <= 0) b.visible = false; }
    // portal + core
    if (this.portal) { this.portal.pr.rotation.z += dt * 1.5; this.portal.pr2.rotation.z -= dt * 2.5; }
    if (this.core) {
      const C = this.core; C.crystal.rotation.y += dt * 0.9; C.cage.rotation.y -= dt * 0.5; C.cage.rotation.x += dt * 0.3; C.crystal.position.y = 0.72 + Math.sin(time * 2) * 0.05;
      this.coreFlash = Math.max(0, this.coreFlash - dt * 2.5);
      const hpK = game.hp / game.maxHp; C.crystal.material.emissive.setRGB(0.0 + this.coreFlash + (1 - hpK) * 0.8, 0.9 * hpK, 1.0 * hpK);
      C.light.color.copy(C.crystal.material.emissive); C.cring.scale.setScalar(1 + this.coreFlash * 0.5);
    }
    if (this.selInfo && this.range.visible) this.range.userData.ringM.material.opacity = 0.7 + 0.3 * Math.sin(time * 5);
    this.sel.material.opacity = 0.6 + 0.4 * Math.sin(time * 6);
  }
  enemyMesh(id) { return this.enemyMeshes.get(id); }
}
