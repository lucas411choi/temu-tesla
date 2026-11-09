// 이펙트: 빌보드 파티클(GPU 인스턴싱, 연기/불꽃/불/먼지/비) + 폭발(화염구, 충격파 링, 불꽃, 검은 연기, 각진 파편 물리)
const VERT = `
attribute vec3 iPos; attribute float iSize; attribute vec4 iColor; attribute float iRot;
varying vec2 vUv; varying vec4 vColor;
void main() {
  vUv = uv; vColor = iColor;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(iRot), s = sin(iRot);
  vec2 q = position.xy; vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec3 world = iPos + (right * r.x + up * r.y) * iSize;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const FRAG = `
varying vec2 vUv; varying vec4 vColor;
void main() {
  vec2 d = vUv - 0.5; float r = length(d) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, r); a = a * a * (0.65 + 0.35 * a);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ParticleSystem {
  constructor(THREE, scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.mlife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.rot = new Float32Array(max); this.spin = new Float32Array(max);
    this.iPos = new Float32Array(max * 3); this.iSize = new Float32Array(max); this.iColor = new Float32Array(max * 4); this.iRot = new Float32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.attrs = [
      new THREE.InstancedBufferAttribute(this.iPos, 3), new THREE.InstancedBufferAttribute(this.iSize, 1),
      new THREE.InstancedBufferAttribute(this.iColor, 4), new THREE.InstancedBufferAttribute(this.iRot, 1),
    ];
    this.attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iPos', this.attrs[0]); g.setAttribute('iSize', this.attrs[1]); g.setAttribute('iColor', this.attrs[2]); g.setAttribute('iRot', this.attrs[3]);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 11 : 10;
    scene.add(this.mesh);
  }
  // o: p[3], v[3], life, s0, s1, c0[4], c1[4], grav, drag, rot, spin
  emit(o) {
    if (this.n >= this.max) return;
    const i = this.n++, p = o.p, v = o.v || [0, 0, 0], c0 = o.c0, c1 = o.c1 || [c0[0], c0[1], c0[2], 0];
    this.pos[i * 3] = p[0]; this.pos[i * 3 + 1] = p[1]; this.pos[i * 3 + 2] = p[2];
    this.vel[i * 3] = v[0]; this.vel[i * 3 + 1] = v[1]; this.vel[i * 3 + 2] = v[2];
    this.life[i] = this.mlife[i] = o.life; this.s0[i] = o.s0; this.s1[i] = o.s1 !== undefined ? o.s1 : o.s0;
    for (let k = 0; k < 4; k++) { this.c0[i * 4 + k] = c0[k]; this.c1[i * 4 + k] = c1[k]; }
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0; this.rot[i] = o.rot !== undefined ? o.rot : Math.random() * 6.28; this.spin[i] = o.spin || 0;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {            // 마지막 입자와 교체
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[l * 3 + k]; this.vel[i * 3 + k] = this.vel[l * 3 + k]; }
          for (let k = 0; k < 4; k++) { this.c0[i * 4 + k] = this.c0[l * 4 + k]; this.c1[i * 4 + k] = this.c1[l * 4 + k]; }
          this.life[i] = this.life[l]; this.mlife[i] = this.mlife[l]; this.s0[i] = this.s0[l]; this.s1[i] = this.s1[l];
          this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.rot[i] = this.rot[l]; this.spin[i] = this.spin[l];
        }
        continue;
      }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      const t = 1 - this.life[i] / this.mlife[i];
      this.iPos[i * 3] = this.pos[i * 3]; this.iPos[i * 3 + 1] = this.pos[i * 3 + 1]; this.iPos[i * 3 + 2] = this.pos[i * 3 + 2];
      this.iSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t; this.iRot[i] = this.rot[i];
      for (let k = 0; k < 4; k++) this.iColor[i * 4 + k] = this.c0[i * 4 + k] + (this.c1[i * 4 + k] - this.c0[i * 4 + k]) * t;
      i++;
    }
    this.geo.instanceCount = this.n;
    for (const a of this.attrs) a.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.instanceCount = 0; }
  dispose() { this.geo.dispose(); this.mat.dispose(); this.mesh.parent && this.mesh.parent.remove(this.mesh); }
}

const rnd = (a, b) => a + Math.random() * (b - a);

export class Effects {
  constructor(THREE, scene, quality, carMats) {
    this.THREE = THREE; this.scene = scene;
    const k = { low: 0.35, medium: 0.7, high: 1, ultra: 1.6 }[quality] || 1;
    this.k = k;
    this.fire = new ParticleSystem(THREE, scene, Math.round(2200 * k), true);
    this.smoke = new ParticleSystem(THREE, scene, Math.round(2600 * k), false);
    this.debris = []; this.rings = [];
    this.shake = 0; this.flash = 0; this.flashPos = [0, 0, 0]; this.slowmo = 0;
    this.fragGeo = null; this.carMats = carMats;
    const rg = new THREE.RingGeometry(0.82, 1.0, 40); rg.rotateX(-Math.PI / 2);
    this.ringGeo = rg;
  }
  setFragments(frags, wheelGeo) { this.fragGeo = frags; this.wheelGeo = wheelGeo; }

  // ───── 일상 이펙트 ─────
  exhaustJet(pos, level, fuel) {          // 배출구 분사: 푸른 열기 불꽃 + 연기 (연료가 낮을수록 약하고 어두움)
    const k = Math.max(0.25, Math.min(1, fuel / 45)), n = Math.round((1 + 2 * level) * this.k);
    for (let i = 0; i < n; i++) {
      this.fire.emit({ p: [pos[0] + rnd(-0.05, 0.05), pos[1], pos[2] + rnd(-0.05, 0.05)], v: [rnd(-1, 1), rnd(-9, -5), rnd(-1, 1)], life: rnd(0.12, 0.26), s0: 0.32 * k, s1: 0.1, c0: [0.5 * k, 0.8 * k, 1.8 * k, 0.9], c1: [1.8 * k, 0.8 * k, 0.2, 0], drag: 1 });
      this.smoke.emit({ p: [pos[0], pos[1] - 0.2, pos[2]], v: [rnd(-1.2, 1.2), rnd(-3, -0.5), rnd(-1.2, 1.2)], life: rnd(0.7, 1.4), s0: 0.35, s1: rnd(1.4, 2.4) * (0.5 + k * 0.5), c0: [0.7 * k + 0.1, 0.72 * k + 0.1, 0.78 * k + 0.1, 0.5 * k], c1: [0.2, 0.2, 0.22, 0], drag: 1.6, grav: -0.8 });
    }
  }
  dust(pos, speed) {
    if (Math.random() > Math.min(1, speed / 8)) return;
    this.smoke.emit({ p: [pos[0], 0.1, pos[2]], v: [rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1)], life: rnd(0.5, 0.9), s0: 0.25, s1: rnd(1.0, 1.6), c0: [0.45, 0.43, 0.4, 0.32], c1: [0.4, 0.38, 0.36, 0], drag: 1.5 });
  }
  spark(pos, n = 6, speed = 6) {
    for (let i = 0; i < n * this.k; i++) this.fire.emit({ p: pos, v: [rnd(-speed, speed), rnd(0, speed), rnd(-speed, speed)], life: rnd(0.2, 0.5), s0: 0.12, s1: 0.03, c0: [3, 2.2, 0.8, 1], c1: [1.2, 0.3, 0.05, 0], grav: 14, drag: 0.8 });
  }
  flame(pos, w, hh) {                       // 화염 기둥 입자
    const n = Math.round(3 * this.k);
    for (let i = 0; i < n; i++) {
      this.fire.emit({ p: [pos[0] + rnd(-w / 2, w / 2) * 0.7, pos[1] + rnd(0, 0.5), pos[2] + rnd(-w / 2, w / 2) * 0.7], v: [rnd(-0.6, 0.6), rnd(hh * 0.9, hh * 1.5), rnd(-0.6, 0.6)], life: rnd(0.35, 0.7), s0: w * 0.75, s1: w * 0.25, c0: [3.2, 1.3, 0.25, 0.9], c1: [1.2, 0.18, 0.02, 0], drag: 0.5 });
    }
    if (Math.random() < 0.5) this.smoke.emit({ p: [pos[0], pos[1] + hh * 0.7, pos[2]], v: [rnd(-1, 1), rnd(2, 4), rnd(-1, 1)], life: rnd(1, 1.8), s0: w * 0.7, s1: w * 2.4, c0: [0.12, 0.11, 0.11, 0.35], c1: [0.05, 0.05, 0.05, 0], drag: 0.8 });
  }
  steam(pos, w, hh) {
    for (let i = 0; i < Math.round(2 * this.k); i++) this.smoke.emit({ p: [pos[0] + rnd(-0.4, 0.4), pos[1] + rnd(0, 0.4), pos[2] + rnd(-0.4, 0.4)], v: [rnd(-0.8, 0.8), rnd(hh * 1.2, hh * 2), rnd(-0.8, 0.8)], life: rnd(0.5, 0.9), s0: w * 0.6, s1: w * 1.9, c0: [0.95, 0.97, 1, 0.5], c1: [0.8, 0.85, 0.9, 0], drag: 0.6 });
  }
  rain(camPos, intensity, windX = 3) {
    const n = Math.round(intensity * 14 * this.k);
    for (let i = 0; i < n; i++) this.smoke.emit({ p: [camPos[0] + rnd(-30, 30), camPos[1] + rnd(5, 30), camPos[2] + rnd(-45, 15)], v: [windX, -34, 0], life: 0.5, s0: 0.05, s1: 0.05, c0: [0.7, 0.8, 1, 0.28], c1: [0.7, 0.8, 1, 0.1], rot: 0 });
  }

  // ───── 폭발 ─────
  explode(p, v, q, seed) {
    const THREE = this.THREE;
    this.shake = 1; this.flash = 1; this.flashPos = p.slice(); this.slowmo = 0.4;
    for (let i = 0; i < 46 * this.k; i++) {
      const a = rnd(0, 6.28), e = rnd(-0.2, 1.2), sp = rnd(2, 14);
      this.fire.emit({ p: [p[0] + rnd(-1, 1), p[1] + rnd(0, 0.8), p[2] + rnd(-1.5, 1.5)], v: [Math.cos(a) * sp, Math.sin(e) * sp * 0.7 + 3, Math.sin(a) * sp], life: rnd(0.5, 1.2), s0: rnd(1.5, 3), s1: rnd(4, 8), c0: [3.4, 1.5, 0.35, 1], c1: [1.4, 0.2, 0.03, 0], drag: 1.2 });
    }
    for (let i = 0; i < 6; i++) this.fire.emit({ p: [p[0], p[1] + 0.5, p[2]], v: [0, 0, 0], life: rnd(0.12, 0.25), s0: 5, s1: 11, c0: [6, 5.4, 4.4, 1], c1: [3, 1.5, 0.4, 0] });
    for (let i = 0; i < 70 * this.k; i++) {
      const a = rnd(0, 6.28), sp = rnd(4, 22);
      this.fire.emit({ p: [p[0], p[1] + 0.4, p[2]], v: [Math.cos(a) * sp, rnd(2, 16), Math.sin(a) * sp], life: rnd(0.5, 1.4), s0: 0.16, s1: 0.03, c0: [4, 2.8, 1, 1], c1: [1.4, 0.3, 0.05, 0], grav: 16, drag: 0.4 });
    }
    for (let i = 0; i < 34 * this.k; i++) {
      this.smoke.emit({ p: [p[0] + rnd(-1.5, 1.5), p[1] + rnd(0, 1), p[2] + rnd(-2, 2)], v: [rnd(-3, 3), rnd(2, 8), rnd(-3, 3)], life: rnd(2, 4), s0: 1.5, s1: rnd(6, 12), c0: [0.06, 0.06, 0.07, 0.75], c1: [0.03, 0.03, 0.035, 0], drag: 0.5, grav: -0.5 });
    }
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    ring.position.set(p[0], Math.max(0.15, p[1] * 0.0 + 0.2), p[2]); ring.scale.setScalar(0.5); this.scene.add(ring); this.rings.push({ mesh: ring, t: 0 });
    // 파편
    if (this.fragGeo) {
      const rs = (n) => { let x = (seed + n * 9973) >>> 0; x = (x ^ (x << 13)) >>> 0; x = (x ^ (x >>> 17)) >>> 0; x = (x ^ (x << 5)) >>> 0; return (x % 10000) / 10000; };
      const place = (geo, mat, cen, k) => {
        const m = new THREE.Mesh(geo, mat); m.castShadow = true;
        // 차 자세로 중심 위치를 회전해서 월드 위치로
        const qq = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
        const c = new THREE.Vector3(cen[0], cen[1], cen[2]).applyQuaternion(qq);
        m.position.set(p[0] + c.x, p[1] + c.y, p[2] + c.z); m.quaternion.copy(qq);
        const out = c.clone().normalize();
        if (!isFinite(out.x)) out.set(0, 1, 0);
        const sp = 5 + rs(k) * 10;
        this.scene.add(m);
        this.debris.push({ mesh: m, v: new THREE.Vector3(v[0] * 0.6 + out.x * sp + (rs(k + 7) - 0.5) * 4, 3 + rs(k + 3) * 9, v[2] * 0.6 + out.z * sp + (rs(k + 5) - 0.5) * 4), w: new THREE.Vector3((rs(k + 11) - 0.5) * 14, (rs(k + 13) - 0.5) * 14, (rs(k + 17) - 0.5) * 14), life: 6.5 + rs(k + 19) * 2, age: 0, rad: 0.35, trail: rs(k + 23) < 0.35 });
      };
      this.fragGeo.forEach((f, i) => place(f.geometry, this.carMats[f.mat] || this.carMats.paint, f.center, i + 1));
      [[-0.86, -0.21, -1.375], [0.86, -0.21, -1.375], [-0.86, -0.21, 1.375], [0.86, -0.21, 1.375]].forEach((c, i) => { place(this.wheelGeo.tire, this.carMats.tire, c, 40 + i); place(this.wheelGeo.rim, this.carMats.rim, c, 50 + i); });
    }
  }

  update(dt) {
    const THREE = this.THREE;
    this.shake = Math.max(0, this.shake - dt * 1.6); this.flash = Math.max(0, this.flash - dt * 3.2); this.slowmo = Math.max(0, this.slowmo - dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      const k = r.t / 0.75;
      r.mesh.scale.setScalar(0.5 + k * 22); r.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { this.scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.age += dt;
      d.v.y -= 22 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
      d.mesh.rotation.x += d.w.x * dt; d.mesh.rotation.y += d.w.y * dt; d.mesh.rotation.z += d.w.z * dt;
      if (d.mesh.position.y < d.rad) {            // 바닥에서 튕김
        d.mesh.position.y = d.rad;
        if (d.v.y < 0) d.v.y = -d.v.y * 0.38;
        d.v.x *= 0.82; d.v.z *= 0.82; d.w.multiplyScalar(0.8);
        if (Math.abs(d.v.y) < 0.6) d.v.y = 0;
      }
      if (d.trail && d.age < 2.2 && Math.random() < 0.6) this.smoke.emit({ p: [d.mesh.position.x, d.mesh.position.y, d.mesh.position.z], v: [0, 0.5, 0], life: 0.9, s0: 0.3, s1: 1.1, c0: [0.1, 0.1, 0.1, 0.35], c1: [0.05, 0.05, 0.05, 0], drag: 1 });
      if (d.age > d.life - 1.2) d.mesh.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.4));
      if (d.age > d.life) { this.scene.remove(d.mesh); this.debris.splice(i, 1); }
    }
    this.fire.update(dt); this.smoke.update(dt);
  }
  clearAll() {
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    this.debris = []; this.rings = []; this.fire.clear(); this.smoke.clear();
  }
  dispose() { this.clearAll(); this.fire.dispose(); this.smoke.dispose(); this.ringGeo.dispose(); }
}
