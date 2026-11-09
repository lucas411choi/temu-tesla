// 개발 모드 (URL에 ?debug): 구간 순간이동, 무적, 자유 카메라, 충돌 박스 표시, FPS/지연 표시
import * as THREE from 'three';
import { carOBBs } from '../shared/physics.js';
import { createCar } from '../shared/physics.js';

const $ = (id) => document.getElementById(id);

export class DebugTools {
  constructor({ net, engine, world, map, getState }) {
    this.net = net; this.engine = engine; this.world = world; this.map = map; this.getState = getState;
    this.god = false; this.show = false; this.free = false; this.pool = []; this.keys = new Set(); this.out = [];
    this.group = new THREE.Group(); engine.scene.add(this.group);
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1); this.sphGeo = new THREE.SphereGeometry(1, 8, 6);
    this.mHaz = new THREE.MeshBasicMaterial({ color: 0xff2d6a, wireframe: true, toneMapped: false });
    this.mCar = new THREE.MeshBasicMaterial({ color: 0x3dff7a, wireframe: true, toneMapped: false });
    document.body.classList.add('debug');
    this.build();
    window.addEventListener('keydown', (e) => { if (this.free) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }
  build() {
    const p = $('debugpanel'); p.classList.remove('hidden');
    p.innerHTML = '<h4>개발 모드</h4><div id="dbg-secs"></div><label><input type="checkbox" id="dbg-god"> 무적</label><label><input type="checkbox" id="dbg-box"> 충돌 박스 표시</label><label><input type="checkbox" id="dbg-free"> 자유 카메라 (방향키/PgUp/PgDn)</label><button id="dbg-fuel">연료 100%</button><button id="dbg-next">다음 체크포인트</button><div id="dbg-info" style="margin-top:6px;color:#8fa0bf"></div>';
    const secs = $('dbg-secs');
    for (const s of this.map.sections) { const b = document.createElement('button'); b.textContent = `${s.idx}. ${s.name}`; b.onclick = () => this.net.send('debug', { cmd: 'tp', s: s.s0 + 40 }); secs.appendChild(b); }
    $('dbg-god').onchange = (e) => { e.target.blur(); this.god = e.target.checked; this.net.send('debug', { cmd: 'god', on: this.god }); };
    $('dbg-box').onchange = (e) => { this.show = e.target.checked; if (!this.show) this.hide(); };
    $('dbg-free').onchange = (e) => { this.free = e.target.checked; this.engine.cam.free = this.free; if (this.free) this.engine.camera.position.y += 0; };
    $('dbg-fuel').onclick = () => this.net.send('debug', { cmd: 'fuel' });
    $('dbg-next').onclick = () => { const st = this.getState(); if (!st) return; const n = this.map.checkpoints.find((c) => c.s > -st.p[2] + 1); if (n) this.net.send('debug', { cmd: 'tp', s: n.s }); };
  }
  hide() { for (const m of this.pool) m.visible = false; }
  mesh(i, geo, mat) {
    let m = this.pool[i];
    if (!m || m.geometry !== geo || m.material !== mat) { if (m) this.group.remove(m); m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; this.group.add(m); this.pool[i] = m; }
    m.visible = true; return m;
  }
  update(dt, st, T) {
    const cam = this.engine.camera;
    if (this.free) {
      const sp = 40 * dt, k = this.keys;
      if (k.has('ArrowUp')) cam.position.z -= sp; if (k.has('ArrowDown')) cam.position.z += sp; if (k.has('ArrowLeft')) cam.position.x -= sp; if (k.has('ArrowRight')) cam.position.x += sp;
      if (k.has('PageUp')) cam.position.y += sp; if (k.has('PageDown')) cam.position.y -= sp;
      cam.lookAt(cam.position.x, cam.position.y - 40, cam.position.z - 30);
    }
    if (st) $('dbg-info').textContent = `s=${(-st.p[2]).toFixed(0)}m  y=${st.p[1].toFixed(1)}  T=${st.T.toFixed(1)}s`;
    if (!this.show || !st) return;
    this.world._stamp = (this.world._stamp || 0) + 1000000;
    this.world.collect(st.p[2], T, this.out, 70);
    let n = 0;
    for (const s of this.out.slice(0, 160)) {
      if (s.lethal === false) continue;
      const m = this.mesh(n++, s.k === 's' ? this.sphGeo : this.boxGeo, this.mHaz);
      if (s.k === 's') m.matrix.set(s.r, 0, 0, s.c[0], 0, s.r, 0, s.c[1], 0, 0, s.r, s.c[2], 0, 0, 0, 1);
      else { const R = s.R, h = s.h; m.matrix.set(R[0] * 2 * h[0], R[1] * 2 * h[1], R[2] * 2 * h[2], s.c[0], R[3] * 2 * h[0], R[4] * 2 * h[1], R[5] * 2 * h[2], s.c[1], R[6] * 2 * h[0], R[7] * 2 * h[1], R[8] * 2 * h[2], s.c[2], 0, 0, 0, 1); }
    }
    const car = createCar(); car.p = st.p.slice(); car.q = st.q.slice();
    for (const o of carOBBs(car)) { const m = this.mesh(n++, this.boxGeo, this.mCar), R = o.R, h = o.h; m.matrix.set(R[0] * 2 * h[0], R[1] * 2 * h[1], R[2] * 2 * h[2], o.c[0], R[3] * 2 * h[0], R[4] * 2 * h[1], R[5] * 2 * h[2], o.c[1], R[6] * 2 * h[0], R[7] * 2 * h[1], R[8] * 2 * h[2], o.c[2], 0, 0, 0, 1); }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}
