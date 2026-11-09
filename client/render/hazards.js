// 동적 장애물 시각화. 위치/상태는 shared/obstacles.js 의 evalEntity(e, T) 결과 그대로 → 서버와 항상 일치.
// 가까운 것만 만들고(최대 약 400m) 멀어지면 해제한다. 소리 재생용 정보는 this.audio 에 모아 둔다.
import { evalEntity } from '../../shared/obstacles.js';
import { MeshBuilder, hex, mulc } from './mesh.js';
import { emitVehicle, vehicleBuilders } from './vehicles.js';

const TAU = Math.PI * 2;

export class HazardView {
  constructor(THREE, scene, map, mats, tex, fx) {
    this.THREE = THREE; this.scene = scene; this.map = map; this.mats = mats; this.tex = tex; this.fx = fx;
    this.active = new Map(); this.audio = []; this.out = [];
    this.vehCache = new Map(); this.geoCache = new Map();
    const T3 = THREE;
    this.gridTex = this.makeGridTex();
    this.beamTex = this.makeBeamTex();
    const add = (c, o = {}) => new T3.MeshBasicMaterial({ color: new T3.Color(c[0], c[1], c[2]), transparent: true, blending: T3.AdditiveBlending, depthWrite: false, toneMapped: false, ...o });
    this.M = {
      laser: add([9, 0.4, 0.5]), laserHalo: add([3, 0.1, 0.15], { opacity: 0.35 }), cyan: add([0.5, 4.5, 6]), fire: add([4.2, 1.5, 0.25], { opacity: 0.85, side: T3.DoubleSide }),
      steam: new T3.MeshBasicMaterial({ color: 0xe8f0f8, transparent: true, opacity: 0.42, depthWrite: false, side: T3.DoubleSide }), arc: add([1.5, 5, 7]),
      warn: add([5, 1.6, 0.2], { opacity: 0.9, side: T3.DoubleSide }), ball: add([5, 0.3, 0.3]), amber: add([6, 3.2, 0.3]), headBeam: new T3.MeshBasicMaterial({ map: this.beamTex, transparent: true, blending: T3.AdditiveBlending, depthWrite: false, opacity: 0.45, toneMapped: false }),
      dark: new T3.MeshStandardMaterial({ color: 0x20232a, roughness: 0.6, metalness: 0.5 }), steel: new T3.MeshStandardMaterial({ color: 0x8a919b, roughness: 0.4, metalness: 0.8 }),
      rope: new T3.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.7, metalness: 0.3 }), drum: new T3.MeshStandardMaterial({ color: 0xc23b2a, roughness: 0.5, metalness: 0.4, flatShading: true }),
      train: new T3.MeshStandardMaterial({ color: 0x4b5a72, roughness: 0.45, metalness: 0.5, flatShading: true }), trainR: new T3.MeshStandardMaterial({ color: 0x8a2d2a, roughness: 0.45, metalness: 0.5, flatShading: true }),
      ac: new T3.MeshStandardMaterial({ color: 0xaab0b8, roughness: 0.55, metalness: 0.5, flatShading: true }), signp: new T3.MeshBasicMaterial({ color: new T3.Color(0.6, 3.2, 3.6), toneMapped: false }),
      bird: new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1, side: T3.DoubleSide, flatShading: true }),
    };
    this.stripeMat = new T3.MeshStandardMaterial({ map: tex.stripe, roughness: 0.6, metalness: 0.2 });
    this.unitBox = new T3.BoxGeometry(1, 1, 1);
    this.unitCone = new T3.ConeGeometry(1, 1, 10, 1, true); this.unitCone.translate(0, 0.5, 0);
    this.unitCyl = new T3.CylinderGeometry(1, 1, 1, 10, 1, true); this.unitCyl.translate(0, 0.5, 0);
    this.ringGeo = new T3.RingGeometry(0.62, 1, 32); this.ringGeo.rotateX(-Math.PI / 2);
    this.sphere = new T3.IcosahedronGeometry(1, 1);
  }

  makeGridTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.strokeStyle = '#ff4a5a'; g.lineWidth = 5; g.strokeRect(0, 0, 64, 64);
    const t = new this.THREE.CanvasTexture(c); t.wrapS = t.wrapT = this.THREE.RepeatWrapping; t.colorSpace = this.THREE.SRGBColorSpace; return t;
  }
  makeBeamTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,245,210,0.95)'); gr.addColorStop(1, 'rgba(255,245,210,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(24, 128); g.lineTo(40, 128); g.lineTo(64, 0); g.lineTo(0, 0); g.fill();
    return new this.THREE.CanvasTexture(c);
  }
  geoOf(mb) {
    const THREE = this.THREE, a = mb.arrays(), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
    g.computeBoundingSphere(); return g;
  }
  cached(key, fn) { let g = this.geoCache.get(key); if (!g) { g = fn(); this.geoCache.set(key, g); } return g; }
  mesh(geo, mat, parent, cast = false) { const m = new this.THREE.Mesh(geo, mat); m.castShadow = cast; if (parent) parent.add(m); return m; }

  update(T, camS, dt) {
    this.audio.length = 0;
    for (const e of this.map.dynamics) {
      const s0 = -e.zr[1], s1 = -e.zr[0];
      const near = s1 > camS - 170 && s0 < camS + 380;
      let v = this.active.get(e.id);
      if (near) {
        if (!v) { v = this.create(e); if (!v) continue; this.active.set(e.id, v); }
        this.out.length = 0;
        const st = {};
        evalEntity(e, T, this.out, st);
        v.update(T, st, dt, e);
      } else if (v) { v.dispose(); this.active.delete(e.id); }
    }
  }
  clear() { for (const v of this.active.values()) v.dispose(); this.active.clear(); }
  dispose() { this.clear(); for (const g of this.geoCache.values()) g.dispose(); for (const m of Object.values(this.M)) m.dispose(); this.stripeMat.dispose(); this.gridTex.dispose(); this.beamTex.dispose(); this.unitBox.dispose(); this.unitCone.dispose(); this.unitCyl.dispose(); this.ringGeo.dispose(); this.sphere.dispose(); }

  create(e) {
    const f = this['make_' + e.type];
    if (!f) return null;
    const group = new this.THREE.Group();
    this.scene.add(group);
    const own = [];
    const v = f.call(this, e, group, own);
    v.dispose = () => { this.scene.remove(group); for (const o of own) o.dispose(); };
    return v;
  }

  // ───────── 새 떼 ─────────
  make_birds(e, group, own) {
    const THREE = this.THREE, crow = e.kind === 'crow';
    const col = crow ? hex(0x14161c) : hex(0xe4e8ee), col2 = crow ? hex(0x2a2f3a) : hex(0xaeb6c2);
    const bodyG = this.cached('bird-body-' + e.kind, () => { const b = new MeshBuilder(); b.save().rotX(Math.PI / 2); b.cyl(0, -0.3, 0, 0.11, 0.6, 5, col, { r2: 0.03 }); b.restore(); b.box(0, 0.05, -0.34, 0.07, 0.07, 0.08, col2); b.cone(0, 0.0, 0.25, 0.05, 0.25, 4, col2); return this.geoOf(b); });
    const wingG = this.cached('bird-wing-' + e.kind, () => { const b = new MeshBuilder(); const A = [0, 0, -0.12], B2 = [0.9, 0.06, 0.02], C = [0.12, 0, 0.32]; b.tri(A, B2, C, col2); b.tri(A, C, B2, col2); return this.geoOf(b); });
    const birds = [];
    for (let i = 0; i < e.n; i++) {
      const g = new THREE.Group(), body = this.mesh(bodyG, this.M.bird, g), wl = this.mesh(wingG, this.M.bird, g), wr = this.mesh(wingG, this.M.bird, g);
      wr.scale.x = -1; group.add(g); birds.push({ g, wl, wr });
    }
    const st2 = {}, tmp = [];
    return {
      update: (T, st) => {
        tmp.length = 0; evalEntity(e, T + 0.05, tmp, st2);
        let cx = 0, cz = 0;
        for (let i = 0; i < birds.length; i++) {
          const p = st.birds[i], q = st2.birds[i], b = birds[i];
          b.g.position.set(p[0], p[1], p[2]);
          b.g.rotation.y = Math.atan2(-(q[0] - p[0]), -(q[2] - p[2]));
          const fl = Math.sin(T * 17 + i * 1.7) * 0.7;
          b.wl.rotation.z = fl; b.wr.rotation.z = -fl; cx += p[0]; cz += p[2];
        }
        this.audio.push({ k: 'bird', x: cx / birds.length, y: e.y0, z: cz / birds.length, lvl: 1 });
      },
    };
  }

  // ───────── 레이저 ─────────
  beamPair(group, own) {
    const core = new this.THREE.Mesh(this.unitBox, this.M.laser), halo = new this.THREE.Mesh(this.unitBox, this.M.laserHalo);
    core.material = this.M.laser.clone(); halo.material = this.M.laserHalo.clone(); own.push(core.material, halo.material);
    group.add(core, halo); return { core, halo };
  }
  setBeam(b, from, to, th, state, T) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], len = Math.hypot(dx, dy, dz);
    for (const m of [b.core, b.halo]) { m.visible = state !== 0; }
    if (state === 0) return;
    const k = state === 2 ? 1 : 0.18 + 0.4 * (0.5 + 0.5 * Math.sin(T * 38));
    b.core.material.opacity = k; b.halo.material.opacity = state === 2 ? 0.4 : 0.12 * k;
    const cx = (from[0] + to[0]) / 2, cy = (from[1] + to[1]) / 2, cz = (from[2] + to[2]) / 2;
    for (const [m, s] of [[b.core, th], [b.halo, th * 4.5]]) { m.position.set(cx, cy, cz); m.scale.set(len, s, s); m.rotation.set(0, Math.atan2(-dz, dx), 0); }
  }
  make_laser(e, group, own) {
    const THREE = this.THREE;
    if (e.mode === 'trip') {
      const beams = e.ys.map(() => this.beamPair(group, own));
      for (const sd of [-1, 1]) { const m = this.mesh(this.unitBox, this.M.dark, group); m.scale.set(0.5, Math.max(...e.ys) + 0.8, 0.5); m.position.set(sd > 0 ? e.x1 : e.x0, (Math.max(...e.ys) + 0.8) / 2, e.z); }
      const em = e.ys.flatMap((y) => [-1, 1].map((sd) => { const m = this.mesh(this.unitBox, this.M.laser.clone(), group); own.push(m.material); m.scale.set(0.2, 0.2, 0.2); m.position.set(sd > 0 ? e.x1 - 0.1 : e.x0 + 0.1, y, e.z); return m; }));
      return { update: (T, st) => {
        e.ys.forEach((y, i) => this.setBeam(beams[i], [e.x0, y, e.z], [e.x1, y, e.z], 0.09, st.state, T));
        em.forEach((m) => { m.material.opacity = st.state === 0 ? 0.25 : 1; });
        this.audio.push({ k: 'laser', x: (e.x0 + e.x1) / 2, y: e.ys[0], z: e.z, lvl: st.state, warn: st.state === 1 });
      } };
    }
    if (e.mode === 'scan') {
      const arms = []; for (let k = 0; k < e.arms; k++) arms.push(this.beamPair(group, own));
      const base = this.mesh(this.unitCyl, this.M.dark, group); base.scale.set(0.6, e.y + 0.3, 0.6); base.position.set(e.x, 0, e.z);
      const head = this.mesh(this.unitBox, this.M.laser.clone(), group); own.push(head.material); head.scale.set(0.5, 0.3, 0.5); head.position.set(e.x, e.y, e.z);
      return { update: (T, st) => {
        for (let k = 0; k < e.arms; k++) { const a = st.ang + k * TAU / e.arms; this.setBeam(arms[k], [e.x, e.y, e.z], [e.x + Math.cos(a) * e.L, e.y, e.z + Math.sin(a) * e.L], 0.09, st.state, T); }
        head.rotation.y = -st.ang; head.material.opacity = st.state === 0 ? 0.3 : 1;
        this.audio.push({ k: 'laser', x: e.x + 8, y: e.y, z: e.z, lvl: st.state, warn: st.state === 1 });
      } };
    }
    // grid
    const panels = [0, 1, 2, 3].map(() => { const t = this.gridTex.clone(); t.needsUpdate = true; const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, opacity: 0.9, color: new THREE.Color(2.2, 2.2, 2.2) }); own.push(t, m); const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); own.push(p.geometry); group.add(p); return p; });
    const frame = [0, 1, 2, 3].map(() => this.mesh(this.unitBox, this.M.cyan, group));
    for (const sd of [-1, 1]) { const m = this.mesh(this.unitBox, this.M.dark, group); m.scale.set(0.5, e.H, 0.5); m.position.set(sd > 0 ? e.x1 : e.x0, e.H / 2, e.z); }
    return { update: (T, st) => {
      const [gx, gy, gw, gh] = st.gap, gl = gx - gw / 2, gr = gx + gw / 2, gb = gy - gh / 2, gt = gy + gh / 2;
      const rects = [[e.x0, gl, 0, e.H], [gr, e.x1, 0, e.H], [gl, gr, gt, e.H], [gl, gr, 0, gb]];
      rects.forEach((r, i) => {
        const w = r[1] - r[0], h = r[3] - r[2], p = panels[i];
        p.visible = w > 0.06 && h > 0.06;
        if (!p.visible) return;
        p.scale.set(w, h, 1); p.position.set((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, e.z); p.material.map.repeat.set(w, h);
      });
      const fr = [[gx, gb, gw, 0.12], [gx, gt, gw, 0.12], [gl, gy, 0.12, gh], [gr, gy, 0.12, gh]];
      fr.forEach((r, i) => { frame[i].position.set(r[0], Math.max(0.05, r[1]), e.z + 0.05); frame[i].scale.set(r[2], r[3], 0.12); });
      this.audio.push({ k: 'laser', x: gx, y: gy, z: e.z, lvl: 2 });
    } };
  }

  // ───────── 불/증기/전기 기둥 ─────────
  make_column(e, group, own) {
    const THREE = this.THREE, cols = [];
    const kind = e.kind;
    for (let i = 0; i < e.n; i++) {
      const x = e.x0 + i * e.dx, g = new THREE.Group(); g.position.set(x, 0, e.z); group.add(g);
      const base = this.mesh(this.unitCyl, this.M.dark, g); base.scale.set(e.w * 0.7, 0.12, e.w * 0.7);
      const warnRing = new THREE.Mesh(this.ringGeo, this.M.warn.clone()); own.push(warnRing.material); warnRing.position.y = 0.14; warnRing.scale.setScalar(e.w * 0.95); g.add(warnRing);
      let body = null;
      if (kind === 'fire') body = this.mesh(this.unitCone, this.M.fire.clone(), g);
      else if (kind === 'steam') body = this.mesh(this.unitCyl, this.M.steam, g);
      else body = this.mesh(this.unitBox, this.M.arc.clone(), g);
      if (body.material !== this.M.steam) own.push(body.material);
      const arcSeg = kind === 'arc' ? [0, 1, 2, 3, 4].map(() => this.mesh(this.unitBox, this.M.arc, g)) : null;
      cols.push({ g, body, warnRing, arcSeg, x });
    }
    return { update: (T, st) => {
      let anyOn = false, anyWarn = false;
      st.cols.forEach((c, i) => {
        const o = cols[i];
        o.warnRing.visible = c.stage === 1; if (c.stage === 1) { anyWarn = true; const p = 0.5 + 0.5 * Math.sin(T * 24); o.warnRing.material.opacity = 0.35 + 0.6 * p; o.warnRing.scale.setScalar(e.w * (0.85 + 0.25 * p)); if (Math.random() < 0.3) this.fx.spark([c.x, 0.2, c.z], 1, 3); }
        o.body.visible = c.stage === 2 && c.hh > 0.2;
        if (kind === 'arc') { o.body.visible = false; o.arcSeg.forEach((s, k) => { s.visible = c.stage === 2; if (c.stage !== 2) return; const y0 = (k / 5) * c.hh, y1 = ((k + 1) / 5) * c.hh; s.position.set((Math.random() - 0.5) * e.w, (y0 + y1) / 2, (Math.random() - 0.5) * e.w); s.scale.set(0.12, (y1 - y0) * 1.1, 0.12); s.rotation.z = (Math.random() - 0.5) * 0.9; }); }
        else if (c.stage === 2) { const fl = 0.92 + 0.12 * Math.sin(T * 40 + i); o.body.scale.set(e.w * 0.55 * fl, c.hh, e.w * 0.55 * fl); if (kind === 'steam') o.body.scale.set(e.w * 0.5, c.hh, e.w * 0.5); }
        if (c.stage === 2) {
          anyOn = true;
          if (kind === 'fire') this.fx.flame([c.x, 0, c.z], e.w, Math.max(2, c.hh * 0.8)); else if (kind === 'steam') this.fx.steam([c.x, 0, c.z], e.w, Math.max(1.5, c.hh * 0.7)); else if (Math.random() < 0.5) this.fx.spark([c.x, c.hh * Math.random(), c.z], 2, 5);
        }
      });
      const cx = e.x0 + (e.n - 1) * e.dx / 2;
      this.audio.push({ k: kind === 'steam' ? 'steam' : kind === 'arc' ? 'arc' : 'fire', x: cx, y: 1, z: e.z, lvl: anyOn ? 2 : 0, warn: anyWarn });
    } };
  }

  // ───────── 불 비 ─────────
  make_rain(e, group, own) {
    const THREE = this.THREE, pool = [];
    for (let i = 0; i < e.cnt + 2; i++) {
      const ball = this.mesh(this.sphere, this.M.ball, group), ring = new THREE.Mesh(this.ringGeo, this.M.warn.clone()); own.push(ring.material); group.add(ring);
      ball.scale.setScalar(e.r); ring.position.y = 0.08; pool.push({ ball, ring, burst: false });
    }
    return { update: (T, st) => {
      pool.forEach((p) => { p.ball.visible = false; p.ring.visible = false; });
      (st.items || []).forEach((it, i) => {
        const p = pool[i]; if (!p) return;
        if (it.burst === undefined) {
          p.ball.visible = true; p.ball.position.set(it.x, it.y, it.z); p.ball.rotation.x += 0.1; p.burst = false;
          p.ring.visible = true; p.ring.position.set(it.x, 0.08, it.z); const k = 0.55 + 0.45 * it.f; p.ring.scale.setScalar(1.7 * k); p.ring.material.opacity = 0.35 + 0.55 * it.f;
          this.fx.flame([it.x, it.y - 0.4, it.z], 0.9, 1.5);
          this.audio.push({ k: 'fire', x: it.x, y: it.y, z: it.z, lvl: 1, warn: it.f > 0.2 });
        } else if (!p.burst) { p.burst = true; this.fx.spark([it.x, 0.4, it.z], 14, 9); this.fx.flame([it.x, 0, it.z], 2.2, 3); }
      });
    } };
  }

  // ───────── 달리는 차 ─────────
  vehGeos(vk, color) {
    const key = vk + '|' + color;
    let g = this.vehCache.get(key);
    if (!g) { const B = vehicleBuilders(); emitVehicle(B, vk, { color }); g = { paint: this.geoOf(B.paint), glass: this.geoOf(B.glass), trim: this.geoOf(B.trim), glow: this.geoOf(B.glow) }; this.vehCache.set(key, g); }
    return g;
  }
  make_traffic(e, group, own) {
    const THREE = this.THREE, g = this.vehGeos(e.vk, e.color), car = new THREE.Group();
    const M = this.mats;
    this.mesh(g.paint, M.prop, car, true); this.mesh(g.glass, M.glass, car); this.mesh(g.trim, M.metal, car, true);
    const glow = this.mesh(g.glow, M.glow, car); group.add(car); car.visible = false;
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 10), this.M.headBeam); beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.06, -7.6); car.add(beam); own.push(beam.geometry);
    return { update: (T, st) => {
      const v = st.vis; car.visible = !!v;
      if (!v) return;
      car.position.set(v.x, 0, v.z); car.rotation.y = v.yaw;
      if (v.siren) glow.visible = Math.floor(T * 7) % 2 === 0;
      beam.visible = e.vk !== 'bus';
      this.audio.push({ k: v.siren ? 'siren' : 'car', x: v.x, y: 1, z: v.z, lvl: 1, spd: Math.abs(v.spd), vk: e.vk });
    } };
  }

  // ───────── 천장 가시판 / 프레스 ─────────
  make_ceil(e, group, own) {
    const THREE = this.THREE, w = e.x1 - e.x0, g = new THREE.Group(); group.add(g);
    const slab = this.mesh(this.unitBox, this.stripeMat, g, true); slab.scale.set(w, 0.6, e.d); slab.position.set((e.x0 + e.x1) / 2, 0.3, e.z);
    const spikeG = this.cached(`ceilspikes|${w}|${e.d}`, () => { const b = new MeshBuilder(); for (let x = -w / 2 + 0.8; x < w / 2; x += 1.5) for (let z = -e.d / 2 + 0.6; z < e.d / 2; z += 1.2) { b.save().translate(x, 0, z).rotX(Math.PI).cone(0, 0, 0, 0.32, 1.0, 4, hex(0xb9c0ca)); b.restore(); } return this.geoOf(b); });
    const sp = this.mesh(spikeG, this.mats.metal, g, true); sp.position.set((e.x0 + e.x1) / 2, 0, e.z);
    const rods = [-1, 1].map((s) => { const r = this.mesh(this.unitBox, this.M.steel, g); r.position.set((e.x0 + e.x1) / 2 + s * (w / 2 - 0.5), 0, e.z); return r; });
    const lights = [-1, 1].map((s) => { const l = this.mesh(this.unitBox, this.M.warn.clone(), g); own.push(l.material); l.scale.set(0.4, 0.25, 0.4); l.position.set((e.x0 + e.x1) / 2 + s * (w / 2 - 0.3), 0.7, e.z + e.d / 2 + 0.1); return l; });
    return { update: (T, st) => {
      g.position.y = st.yb;
      rods.forEach((r) => { const h = Math.max(0.1, e.yTop - st.yb - 0.6); r.scale.set(0.25, h, 0.25); r.position.y = 0.6 + h / 2; });
      lights.forEach((l) => { l.material.opacity = st.warn ? (Math.sin(T * 30) > 0 ? 1 : 0.1) : 0.25; });
      this.audio.push({ k: 'press', x: (e.x0 + e.x1) / 2, y: st.yb, z: e.z, lvl: 1, warn: st.warn, yb: st.yb });
    } };
  }

  // ───────── 톱날 / 철구 ─────────
  make_saw(e, group, own) {
    const THREE = this.THREE;
    const rail = this.mesh(this.unitBox, this.M.dark, group); rail.scale.set(e.x1 - e.x0 + 3, 0.12, 0.5); rail.position.set((e.x0 + e.x1) / 2, 0.06, e.z);
    const geo = this.cached('saw-' + e.r, () => { const b = new MeshBuilder(); b.save().rotX(Math.PI / 2); b.cyl(0, -0.07, 0, e.r * 0.86, 0.14, 16, hex(0xaab2bd), { bottom: true }); for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; b.save().translate(Math.cos(a) * e.r * 0.9, 0, Math.sin(a) * e.r * 0.9).rotY(-a); b.box(0.12, 0, 0, 0.16, 0.07, 0.09, hex(0xd0d6de)); b.restore(); } b.restore(); return this.geoOf(b); });
    const disc = this.mesh(geo, this.mats.metal, group, true);
    return { update: (T, st) => { disc.position.set(st.pos[0], st.pos[1], st.pos[2]); disc.rotation.z = -T * 14 * (st.pos[0] > 0 ? 1 : 1); if (Math.random() < 0.25) this.fx.spark([st.pos[0], 0.2, st.pos[2]], 2, 4); this.audio.push({ k: 'saw', x: st.pos[0], y: 1, z: st.pos[2], lvl: 1 }); } };
  }
  make_ball(e, group, own) {
    const rope = this.mesh(this.unitBox, this.M.rope, group), ball = this.mesh(this.sphere, this.stripeMat, group, true);
    ball.scale.setScalar(e.r);
    const tower = this.mesh(this.unitBox, this.M.steel, group); tower.scale.set(1.2, e.py + 3, 1.2); tower.position.set(-15.6, (e.py + 3) / 2, e.z);
    const jib = this.mesh(this.unitBox, this.M.steel, group), jl = Math.abs(e.px + 15.6) + 1; jib.scale.set(jl, 0.6, 0.6); jib.position.set(-15.6 + jl / 2, e.py + 0.3, e.z);
    const cab = this.mesh(this.unitBox, this.M.amber, group); cab.scale.set(0.5, 0.5, 0.5); cab.position.set(-15.6, e.py + 3.3, e.z);
    return { update: (T, st) => {
      const th = st.th;
      ball.position.set(st.ball[0], st.ball[1], st.ball[2]); ball.rotation.y += 0.01;
      if (e.axis === 'x') { rope.position.set(e.px + e.L / 2 * Math.sin(th), e.py - e.L / 2 * Math.cos(th), e.z); rope.rotation.set(0, 0, th); }
      else { rope.position.set(e.px, e.py - e.L / 2 * Math.cos(th), e.z + e.L / 2 * Math.sin(th)); rope.rotation.set(-th, 0, 0); }
      rope.scale.set(0.24, e.L, 0.24);
      this.audio.push({ k: 'ball', x: st.ball[0], y: st.ball[1], z: st.ball[2], lvl: 1 });
    } };
  }

  // ───────── 낙하물 ─────────
  make_debris(e, group, own) {
    const THREE = this.THREE, pool = [];
    for (let i = 0; i < e.n + 1; i++) {
      const box = this.mesh(this.unitBox, e.kind === 'sign' ? this.M.signp : this.M.ac, group, true), ring = new THREE.Mesh(this.ringGeo, this.M.warn.clone()); own.push(ring.material); group.add(ring);
      pool.push({ box, ring, burst: false });
    }
    return { update: (T, st) => {
      pool.forEach((p) => { p.box.visible = false; p.ring.visible = false; });
      (st.items || []).forEach((it, i) => {
        const p = pool[i]; if (!p) return;
        if (it.burst === undefined) {
          p.box.visible = true; p.box.position.set(it.x, it.y, it.z); p.box.scale.set(it.size[0] * 2, it.size[1] * 2, it.size[2] * 2); p.box.rotation.set(it.f * 2.2, it.f * 3, it.f * 1.2); p.burst = false;
          p.ring.visible = true; p.ring.position.set(it.x, 0.09, it.z); p.ring.scale.setScalar(Math.max(it.size[0], it.size[2]) * (1.6 + 0.8 * (1 - it.f))); p.ring.material.opacity = 0.3 + 0.6 * it.f;
          this.audio.push({ k: 'debris', x: it.x, y: it.y, z: it.z, lvl: 1, warn: true, f: it.f });
        } else if (!p.burst) { p.burst = true; this.fx.spark([it.x, 0.3, it.z], 12, 8); this.fx.dust([it.x, 0, it.z], 10); this.fx.dust([it.x, 0, it.z], 10); this.audio.push({ k: 'crash', x: it.x, y: 0, z: it.z, lvl: 1 }); }
      });
    } };
  }

  // ───────── 압착 벽 ─────────
  make_press(e, group, own) {
    const walls = [-1, 1].map(() => this.mesh(this.unitBox, this.stripeMat, group, true));
    const lights = [-1, 1].map((s) => { const l = this.mesh(this.unitBox, this.M.warn.clone(), group); own.push(l.material); l.scale.set(0.5, 0.4, 0.5); l.position.set(s * (e.xo - 0.6), e.hgt + 0.3, e.z); return l; });
    return { update: (T, st) => {
      const wL = e.xo - st.gap / 2;
      walls.forEach((w, i) => { const s = i === 0 ? -1 : 1; w.scale.set(wL, e.hgt, e.d); w.position.set(s * (st.gap / 2 + wL / 2), e.hgt / 2, e.z); });
      lights.forEach((l) => { l.material.opacity = st.warn ? (Math.sin(T * 30) > 0 ? 1 : 0.1) : 0.3; });
      this.audio.push({ k: 'press', x: 0, y: 1, z: e.z, lvl: 1, warn: st.warn, gap: st.gap });
    } };
  }

  // ───────── 철도 건널목 ─────────
  make_train(e, group, own) {
    const THREE = this.THREE, M = this.M;
    const rails = [-0.75, 0.75].map((dz) => { const r = this.mesh(this.unitBox, M.steel, group); r.scale.set(60, 0.14, 0.14); r.position.set(0, 0.07, e.z + dz); return r; });
    for (let x = -28; x <= 28; x += 1.4) { const s = this.mesh(this.unitBox, M.dark, group); s.scale.set(0.3, 0.1, 2.2); s.position.set(x, 0.03, e.z); }
    const za = e.z + 4;
    const post = [-1, 1].map((s) => { const p = this.mesh(this.unitBox, M.dark, group); p.scale.set(0.3, 3.4, 0.3); p.position.set(s * 12.9, 1.7, za); const l = this.mesh(this.unitBox, M.warn.clone(), group); own.push(l.material); l.scale.set(0.5, 0.4, 0.4); l.position.set(s * 12.9, 3.5, za); return l; });
    const armG = [0, 1].map((i) => { const g = new THREE.BoxGeometry(12, 0.24, 0.14); g.translate(i === 0 ? 6 : -6, 0, 0); own.push(g); return g; });
    const arms = armG.map((g, i) => { const m = new THREE.Mesh(g, this.stripeMat); m.position.set(i === 0 ? -12.4 : 12.4, 0.95, za); m.castShadow = true; group.add(m); return m; });
    const cars = []; for (let k = 0; k < e.cars; k++) { const c = new THREE.Group(), body = this.mesh(this.unitBox, k === 0 ? M.trainR : M.train, c, true); body.scale.set(e.carLen, 4.2, 3); body.position.y = 2.1; const roof = this.mesh(this.unitBox, M.dark, c); roof.scale.set(e.carLen * 0.9, 0.3, 2.2); roof.position.y = 4.35; group.add(c); cars.push(c); }
    const head = this.mesh(this.unitBox, M.amber.clone(), group); own.push(head.material); head.scale.set(0.3, 0.5, 1.6);
    return { update: (T, st) => {
      arms[0].rotation.z = (1 - st.arm) * 1.35; arms[1].rotation.z = -(1 - st.arm) * 1.35;
      post.forEach((l, i) => { l.material.opacity = st.bell ? (Math.floor(T * 2.5 + i) % 2 ? 1 : 0.15) : 0.2; });
      cars.forEach((c, k) => { if (st.head === null) { c.visible = false; return; } const xk = st.head - k * (e.carLen + 0.7) - e.carLen / 2; c.visible = xk > -40 && xk < 40; c.position.set(xk, 0, e.z); });
      head.visible = st.head !== null; if (st.head !== null) head.position.set(st.head + 0.2, 1.6, e.z);
      this.audio.push({ k: 'train', x: st.head !== null ? st.head : 0, y: 2, z: e.z, lvl: st.head !== null ? 2 : 0, bell: st.bell });
    } };
  }

  // ───────── 드럼통 / 드론 / 바리케이드 ─────────
  make_barrels(e, group, own) {
    const THREE = this.THREE, g = new THREE.Group(), inner = new THREE.Group();
    const drum = this.mesh(new THREE.CylinderGeometry(e.r, e.r, e.r * 1.7, 10), this.M.drum, inner, true); own.push(drum.geometry);
    const band = this.mesh(new THREE.CylinderGeometry(e.r * 1.03, e.r * 1.03, 0.12, 10), this.M.steel, inner); own.push(band.geometry);
    inner.rotation.x = e.ax === 'x' ? Math.PI / 2 : 0; if (e.ax === 'z') inner.rotation.z = Math.PI / 2;
    g.add(inner); group.add(g); g.visible = false;
    return { update: (T, st) => {
      if (!st.pos) { g.visible = false; return; }
      g.visible = true; g.position.set(st.pos[0], st.pos[1], st.pos[2]);
      const ang = st.pos[3] / e.r * e.dir; if (e.ax === 'x') g.rotation.z = -ang; else g.rotation.x = ang;
      this.audio.push({ k: 'barrel', x: st.pos[0], y: 0.6, z: st.pos[2], lvl: 1 });
    } };
  }
  make_drone(e, group, own) {
    const THREE = this.THREE, g = new THREE.Group(); group.add(g);
    const body = this.mesh(this.unitBox, this.M.dark, g, true); body.scale.set(0.9, 0.28, 0.9);
    const rotors = [];
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      const arm = this.mesh(this.unitBox, this.M.dark, g); arm.scale.set(0.12, 0.08, 0.12); arm.position.set(x * 0.6, 0.05, z * 0.6); arm.lookAt(0, 0, 0);
      const r = this.mesh(this.unitCyl, this.M.steel, g); r.scale.set(0.5, 0.04, 0.5); r.position.set(x, 0.18, z); rotors.push(r);
    }
    const led = this.mesh(this.unitBox, this.M.laser.clone(), g); own.push(led.material); led.scale.set(0.2, 0.12, 0.2); led.position.y = -0.2;
    const cone = this.mesh(this.unitCone, this.M.headBeam.clone(), g); own.push(cone.material); cone.scale.set(2.4, 5, 2.4); cone.rotation.x = Math.PI; cone.position.y = -5.2; cone.material.opacity = 0.14; cone.material.map = null; cone.material.color = new THREE.Color(0.6, 1.2, 1.6); cone.material.needsUpdate = true;
    return { update: (T, st) => { g.position.set(st.pos[0], st.pos[1], st.pos[2]); rotors.forEach((r, i) => { r.rotation.y = T * 60 + i; }); led.material.opacity = Math.floor(T * 3) % 2 ? 1 : 0.2; this.audio.push({ k: 'drone', x: st.pos[0], y: st.pos[1], z: st.pos[2], lvl: 1 }); } };
  }
  make_barricade(e, group, own) {
    const THREE = this.THREE, g = new THREE.Group(); group.add(g);
    const m = this.mesh(this.unitBox, this.stripeMat, g, true); m.scale.set(e.w * 2, e.h, 0.7); m.position.y = e.h / 2;
    const l = [-1, 1].map((s) => { const x = this.mesh(this.unitBox, this.M.amber.clone(), g); own.push(x.material); x.scale.set(0.3, 0.3, 0.3); x.position.set(s * (e.w - 0.3), e.h + 0.25, 0); return x; });
    return { update: (T, st) => { g.position.set(st.pos[0], 0, st.pos[2]); l.forEach((x, i) => { x.material.opacity = Math.floor(T * 4 + i) % 2 ? 1 : 0.15; }); this.audio.push({ k: 'barricade', x: st.pos[0], y: 1, z: st.pos[2], lvl: 1 }); } };
  }
}
