// 테무 로드스터 뷰: 차체 + 4개 휠(구름) + 4개 노즐(눌린 키만 분사) + 바닥 그림자/투영 링/고도선
import { buildRoadster, buildWheel, buildFragments, WHEEL_POS, NOZZLE_POS } from './carGeo.js';
import { MeshBuilder } from './mesh.js';

const FUEL_WARN = 20;

export function geoFrom(THREE, mb) {
  const a = mb.arrays(), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
  g.computeBoundingSphere();
  return g;
}

export class CarView {
  constructor(THREE, scene, mats, tex, fx) {
    this.THREE = THREE; this.scene = scene; this.fx = fx;
    const parts = buildRoadster(), wheel = buildWheel();
    this.geoms = [];
    const G = (mb) => { const g = geoFrom(THREE, mb); this.geoms.push(g); return g; };
    const group = new THREE.Group();
    const mesh = (g, m, cast = true) => { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = false; group.add(x); return x; };
    mesh(G(parts.paint), mats.carPaint); mesh(G(parts.glass), mats.carGlass); mesh(G(parts.trim), mats.carTrim); mesh(G(parts.glow), mats.glow, false);
    this.tireGeo = G(wheel.tire); this.rimGeo = G(wheel.rim);
    this.wheels = WHEEL_POS.map((p) => {
      const w = new THREE.Group(); w.position.set(p[0], p[1], p[2]);
      const spin = new THREE.Group(); if (p[0] < 0) spin.rotation.y = Math.PI;
      const inner = new THREE.Group(); spin.add(inner); w.add(spin);
      const t = new THREE.Mesh(this.tireGeo, mats.tire), r = new THREE.Mesh(this.rimGeo, mats.rim); t.castShadow = true; inner.add(t, r);
      group.add(w); return { w, inner, spin };
    });
    // 노즐
    const nzGeo = G(parts.nozzle);
    const cone = new THREE.ConeGeometry(0.16, 1, 8, 1, true); cone.translate(0, 0.5, 0); this.geoms.push(cone);
    const disc = new THREE.CircleGeometry(0.1, 8); disc.rotateX(-Math.PI / 2); this.geoms.push(disc);
    this.noz = NOZZLE_POS.map((p) => {
      const m = new THREE.Mesh(nzGeo, mats.carTrim); m.position.set(p[0], p[1], p[2]); m.castShadow = true; group.add(m);
      const outer = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      const inner = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 2.4, 6), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      for (const f of [outer, inner]) { f.rotation.x = Math.PI; f.position.set(p[0], p[1] - 0.27, p[2]); f.visible = false; group.add(f); }
      inner.scale.set(0.5, 1, 0.5);
      const ring = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.17, 0.2), toneMapped: false }));
      ring.position.set(p[0], p[1] + 0.025, p[2]); group.add(ring);
      return { outer, inner, ring, lvl: 0 };
    });
    // 헤드라이트
    for (const s of [-1, 1]) {
      const sp = new THREE.SpotLight(0xdbe8ff, 2600, 70, 0.42, 0.55, 2); sp.position.set(s * 0.5, 0.0, -2.1); sp.target.position.set(s * 1.5, -0.6, -22);
      group.add(sp, sp.target);
    }
    scene.add(group);
    this.group = group;
    // 바닥 그림자/링/고도선 (월드 좌표)
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex.glow, color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.renderOrder = 2; scene.add(blob);
    const ringG = new THREE.RingGeometry(2.0, 2.14, 40); ringG.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 2.8), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    scene.add(ring);
    const lineG = new THREE.BoxGeometry(0.05, 1, 0.05); lineG.translate(0, 0.5, 0);
    const line = new THREE.Mesh(lineG, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.0, 2.6), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    scene.add(line);
    this.blob = blob; this.ring = ring; this.line = line; this.extra = [blob, ring, line]; this.geoms.push(ringG, lineG);
    this.spin = 0;
    this.tmp = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.fwd = new THREE.Vector3();
    this.fragData = buildFragments(parts);
    this.wheelData = { tire: this.tireGeo, rim: this.rimGeo };
  }

  // 폭발 파편 지오메트리(효과 모듈에 전달)
  fragments() {
    const THREE = this.THREE;
    return this.fragData.map((f) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(f.arrays.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(f.arrays.normal, 3)); g.setAttribute('color', new THREE.BufferAttribute(f.arrays.color, 3));
      g.computeBoundingSphere(); this.geoms.push(g);
      return { geometry: g, mat: f.mat, center: f.center };
    });
  }

  // s = { p, q, v, ex(점화된 배출구 4비트), f(연료%), inv, alive, groundY, wheelMask }
  update(s, dt, T, localEx = 0) {
    const THREE = this.THREE, g = this.group;
    g.visible = s.alive && !(s.inv && Math.floor(T * 10) % 2 === 0);
    this.blob.visible = this.ring.visible = this.line.visible = s.alive;
    g.position.set(s.p[0], s.p[1], s.p[2]); g.quaternion.set(s.q[0], s.q[1], s.q[2], s.q[3]);
    g.updateMatrixWorld(true);
    // 휠 구름: 앞방향 속도에서 계산
    this.fwd.set(0, 0, -1).applyQuaternion(g.quaternion);
    const vlong = s.v[0] * this.fwd.x + s.v[1] * this.fwd.y + s.v[2] * this.fwd.z;
    const grounded = s.alt < 1.2;
    this.spin += (grounded ? vlong : vlong * 0.15) / 0.34 * dt;
    for (const w of this.wheels) w.inner.rotation.x = -this.spin;
    // 노즐 분사: 서버가 알려준 점화 상태 + 내 키 즉시 반응(국소 예측)
    const ex = s.ex | localEx, lowFuel = s.f < FUEL_WARN;
    this.noz.forEach((n, i) => {
      const on = (ex >> i) & 1;
      n.lvl += ((on ? 1 : 0) - n.lvl) * (1 - Math.exp(-dt / (on ? 0.04 : 0.09)));
      const lv = n.lvl, fl = 0.85 + 0.15 * Math.sin(T * 60 + i * 2.1), k = Math.max(0.3, Math.min(1, s.f / 40));
      n.outer.visible = n.inner.visible = lv > 0.04 && s.alive;
      n.outer.scale.set(1, (0.4 + 1.9 * lv) * fl * k, 1); n.inner.scale.set(0.5, (0.3 + 1.2 * lv) * fl * k, 0.5);
      n.outer.material.color.setRGB(1.6 * k + 0.2, 0.9 * k, 0.3 * k);
      n.ring.material.color.setRGB(0.15 + lv * 3.2 * k, 0.17 + lv * 1.4 * k, 0.2 + lv * 0.4);
      if (lv > 0.3 && s.alive) { this.tmp.set(NOZZLE_POS[i][0], NOZZLE_POS[i][1] - 0.28, NOZZLE_POS[i][2]); g.localToWorld(this.tmp); this.fx.exhaustJet([this.tmp.x, this.tmp.y, this.tmp.z], lv, s.f); }
      if (lowFuel && on && Math.random() < 0.2) this.fx.smoke.emit({ p: [g.position.x, g.position.y + 0.2, g.position.z], v: [0, 1, 0], life: 0.8, s0: 0.3, s1: 1.2, c0: [0.05, 0.05, 0.05, 0.4], c1: [0.02, 0.02, 0.02, 0] });
    });
    if (s.alive && grounded && Math.abs(vlong) > 2) for (let i = 2; i < 4; i++) { this.tmp.set(WHEEL_POS[i][0], -0.5, WHEEL_POS[i][2]); g.localToWorld(this.tmp); this.fx.dust([this.tmp.x, 0, this.tmp.z], Math.abs(vlong)); }
    // 바닥 그림자: 고도가 높을수록 작고 흐려짐 / 투영 링 / 고도선
    const gy = s.groundY + 0.04, alt = Math.max(0, s.alt), yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    const sc = 1 + alt * 0.045;
    this.blob.position.set(s.p[0], gy, s.p[2]); this.blob.rotation.z = yaw; this.blob.scale.set(2.8 * sc, 5.8 * sc, 1);
    this.blob.material.opacity = Math.max(0.1, 0.62 - alt * 0.014);
    this.ring.position.set(s.p[0], gy + 0.02, s.p[2]); this.ring.visible = s.alive && alt > 0.9; this.ring.scale.setScalar(1 + alt * 0.012);
    this.ring.material.opacity = Math.min(0.85, 0.25 + alt * 0.03);
    this.line.position.set(s.p[0], gy, s.p[2]); this.line.scale.set(1, Math.max(0.01, alt), 1); this.line.visible = s.alive && alt > 1.5;
  }
  dispose() { this.scene.remove(this.group); for (const m of this.extra) { this.scene.remove(m); m.material.dispose(); } for (const g of this.geoms) g.dispose(); }
}
