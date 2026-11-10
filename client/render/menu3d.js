// 로비/차고 3D 장면 (게임 엔진과 별도의 가벼운 렌더러)
//  - lobby: 네온 도시 위를 활공하는 로드스터 (화면 오른쪽, 배출구 4개 분사)
//  - garage: 차고 안 턴테이블 위의 로드스터. 마우스로 끌어서 돌려 볼 수 있다.
import * as THREE from 'three';
import { buildRoadster, buildWheel, WHEEL_POS, NOZZLE_POS } from './carGeo.js';
import { geoFrom } from './car.js';

export class MenuScene {
  constructor(canvas) {
    this.canvas = canvas; this.mode = 'lobby'; this.running = false; this.t = 0; this.last = 0;
    this.spin = 0.6; this.drag = null; this.yaw = -0.5;
  }
  init() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r = r;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
    this.envFrom();
    this.buildCar();
    this.buildLobby();
    this.buildGarage();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('pointerdown', (e) => { if (this.mode === 'garage') { this.drag = { x: e.clientX, yaw: this.yaw }; this.canvas.setPointerCapture(e.pointerId); } });
    this.canvas.addEventListener('pointermove', (e) => { if (this.drag) { this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.01; this.spin = 0; } });
    this.canvas.addEventListener('pointerup', () => { this.drag = null; this.spinWait = 2.5; });
  }
  // 반사용 환경맵: 하늘 그라디언트 + 네온 패널
  envFrom() {
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
      vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 v; void main(){ float h = clamp(v.y,-0.2,1.0); vec3 c = mix(vec3(0.85,0.35,0.55), vec3(0.06,0.08,0.22), pow(max(h,0.0),0.5)); gl_FragColor = vec4(c,1.0); }' }));
    env.add(sky);
    const cols = [[6, 2, 5], [1, 5, 7], [7, 5, 2], [5, 5, 6]];
    for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(6, 2 + (i % 3), 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(...cols[i % 4]) })); const a = i / 18 * Math.PI * 2; m.position.set(Math.cos(a) * 40, 2 + (i % 5) * 4, Math.sin(a) * 40); m.lookAt(0, m.position.y, 0); env.add(m); }
    const pm = new THREE.PMREMGenerator(this.r);
    this.scene.environment = pm.fromScene(env, 0.02).texture; pm.dispose();
  }
  buildCar() {
    const parts = buildRoadster(), wheel = buildWheel(), g = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 });
    const glass = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.05, envMapIntensity: 2.0, clearcoat: 1 });
    const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    const tire = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), rim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.95 });
    for (const [mb, m] of [[parts.paint, paint], [parts.glass, glass], [parts.trim, trim], [parts.glow, glow]]) { const x = new THREE.Mesh(geoFrom(THREE, mb), m); x.castShadow = true; g.add(x); }
    const tg = geoFrom(THREE, wheel.tire), rg = geoFrom(THREE, wheel.rim);
    this.wheels = WHEEL_POS.map((p) => { const w = new THREE.Group(); w.position.set(p[0], p[1], p[2]); const sp = new THREE.Group(); if (p[0] < 0) sp.rotation.y = Math.PI; const inner = new THREE.Group(); sp.add(inner); w.add(sp); const a = new THREE.Mesh(tg, tire), b = new THREE.Mesh(rg, rim); a.castShadow = true; inner.add(a, b); g.add(w); return inner; });
    const nz = geoFrom(THREE, parts.nozzle), cone = new THREE.ConeGeometry(0.16, 1, 10, 1, true); cone.translate(0, 0.5, 0);
    this.flames = NOZZLE_POS.map((p) => {
      const n = new THREE.Mesh(nz, trim); n.position.set(p[0], p[1], p[2]); g.add(n);
      const o = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.45, 0.12), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      const i = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.7, 1.0), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      for (const f of [o, i]) { f.rotation.x = Math.PI; f.position.set(p[0], p[1] - 0.27, p[2]); g.add(f); }
      i.scale.set(0.5, 1, 0.5);
      return { o, i };
    });
    const hl = new THREE.SpotLight(0xdbe8ff, 80, 40, 0.5, 0.6, 1.5); hl.position.set(0, 0, -2.2); hl.target.position.set(0, -0.8, -12); g.add(hl, hl.target);
    this.car = g; this.scene.add(g);
  }
  // ───── 로비: 네온 격자 바닥 + 도시 실루엣 + 별/구름 ─────
  buildLobby() {
    const L = new THREE.Group(); this.lobby = L; this.scene.add(L);
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 v; uniform float t;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){ float y = clamp(v.y, -0.1, 1.0); vec3 top = vec3(0.02,0.03,0.10), mid = vec3(0.16,0.05,0.24), hor = vec3(0.95,0.36,0.42);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y)); c = mix(c, top, smoothstep(0.15, 0.7, y));
          vec2 g = floor(v.xz / max(0.2, v.y + 0.3) * 160.0); float s = step(0.9975, h(g)) * smoothstep(0.15, 0.5, y); c += vec3(s) * (0.6 + 0.4 * sin(t * 2.0 + g.x));
          float sun = smoothstep(0.985, 1.0, dot(normalize(v), normalize(vec3(-0.35, 0.08, -1.0)))); c += vec3(1.6, 0.7, 0.4) * sun;
          gl_FragColor = vec4(c, 1.0); }` });
    this.skyMat = skyMat;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat); L.add(sky);
    // 격자 바닥 (흐르는 선)
    const gridMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec2 u; varying float d; void main(){ u = position.xz; vec4 w = modelViewMatrix * vec4(position,1.0); d = -w.z; gl_Position = projectionMatrix * w; }',
      fragmentShader: `varying vec2 u; varying float d; uniform float t;
        void main(){ vec2 g = abs(fract((u + vec2(0.0, t * 18.0)) / 8.0) - 0.5); float l = smoothstep(0.47, 0.5, max(g.x, g.y));
          float f = exp(-d * 0.006); vec3 c = mix(vec3(0.2, 0.9, 1.0), vec3(1.0, 0.25, 0.9), smoothstep(-200.0, 200.0, u.x));
          gl_FragColor = vec4(c * l * 1.6 * f + vec3(0.02,0.02,0.05) * f, 0.9 * f); }` });
    this.gridMat = gridMat;
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), gridMat); grid.rotation.x = -Math.PI / 2; grid.position.y = -14; L.add(grid);
    // 도시 실루엣 (창문 불빛 텍스처)
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#0a0d1c'; x.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 260; i++) { x.fillStyle = Math.random() < 0.5 ? '#ffcf7a' : Math.random() < 0.5 ? '#6ae8ff' : '#ff6ad8'; x.globalAlpha = 0.25 + Math.random() * 0.75; x.fillRect((Math.random() * 16 | 0) * 4 + 1, (Math.random() * 42 | 0) * 3 + 1, 2, 1.4); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.blds = [];
    const bm = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.3, color: 0x1a1e30, roughness: 0.6, metalness: 0.4 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 140; i++) {
      const b = new THREE.Mesh(box, bm), w = 8 + Math.random() * 16, h = 20 + Math.random() * 110;
      const side = i % 2 ? 1 : -1, xx = side * (28 + Math.random() * 120);
      b.scale.set(w, h, w); b.position.set(xx, -14 + h / 2, -Math.random() * 600 + 60); L.add(b); this.blds.push(b);
    }
    // 빛 줄기(속도선)
    this.streaks = [];
    const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3.2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 60; i++) { const s = new THREE.Mesh(box, sm); s.scale.set(0.05, 0.05, 6 + Math.random() * 10); s.position.set((Math.random() - 0.5) * 40, -4 + Math.random() * 18, -Math.random() * 200); L.add(s); this.streaks.push(s); }
    this.lobbyLights = [new THREE.HemisphereLight(0x8a90ff, 0x301030, 0.9), new THREE.DirectionalLight(0xffb0a0, 2.2), new THREE.PointLight(0x35f0ff, 60, 30, 1.6)];
    this.lobbyLights[1].position.set(-8, 10, 6); this.lobbyLights[2].position.set(3, -3, 2);
    for (const l of this.lobbyLights) L.add(l);
    this.scene.fog = new THREE.FogExp2(0x1a0c2a, 0.0045);
  }
  // ───── 차고: 콘크리트 바닥 + 회전판 + 천장 조명 + 공구 벽 ─────
  buildGarage() {
    const G = new THREE.Group(); this.garage = G; this.scene.add(G); G.visible = false;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.35, metalness: 0.5 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.56; floor.receiveShadow = true; G.add(floor);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.18, 64), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.25, metalness: 0.9 })); plate.position.y = -0.62; plate.receiveShadow = true; G.add(plate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.04, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 3.6), toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = -0.52; G.add(ring);
    this.plate = plate;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.8, metalness: 0.2, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 12, 6, 1, true), wallM); room.position.y = 5.4; G.add(room);
    const stripM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 3.0), toneMapped: false });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6, s = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.08), stripM); s.position.set(Math.cos(a) * 18.8, 1.2, Math.sin(a) * 18.8); s.rotation.y = -a + Math.PI / 2; G.add(s); }
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4.2), toneMapped: false })); l.position.set(0, 8, -6 + i * 4); G.add(l); }
    const key = new THREE.SpotLight(0xffffff, 260, 40, 0.55, 0.5, 1.4); key.position.set(4, 9, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.target.position.set(0, 0, 0); G.add(key, key.target);
    const rim = new THREE.SpotLight(0x35f0ff, 160, 40, 0.6, 0.6, 1.4); rim.position.set(-6, 5, -7); rim.target.position.set(0, 0, 0); G.add(rim, rim.target);
    const fill = new THREE.HemisphereLight(0x9ab0ff, 0x101018, 0.6); G.add(fill);
    const pink = new THREE.PointLight(0xff3df0, 40, 20, 1.6); pink.position.set(5, 1, -4); G.add(pink);
  }
  setMode(m) {
    this.mode = m;
    this.lobby.visible = m === 'lobby'; this.garage.visible = m === 'garage';
    this.scene.fog = m === 'lobby' ? new THREE.FogExp2(0x1a0c2a, 0.0045) : null;
    this.yaw = m === 'garage' ? -0.6 : 0; this.spin = 0.6;
  }
  resize() { if (!this.r) return; const w = window.innerWidth, h = window.innerHeight; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  start() { if (this.running) return; if (!this.r) this.init(); this.running = true; this.last = performance.now(); const loop = (now) => { if (!this.running) return; this.raf = requestAnimationFrame(loop); this.frame(Math.min(0.05, (now - this.last) / 1000)); this.last = now; }; this.raf = requestAnimationFrame(loop); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  frame(dt) {
    this.t += dt; const t = this.t, car = this.car;
    const wide = this.cam.aspect > 1.2;
    if (this.mode === 'lobby') {
      this.skyMat.uniforms.t.value = t; this.gridMat.uniforms.t.value = t;
      // 차: 앞으로 활공(살짝 출렁/롤), 배경이 뒤로 흐른다
      car.position.set(0, 2.2 + Math.sin(t * 1.3) * 0.35, 0);
      car.rotation.set(-0.12 + Math.sin(t * 0.9) * 0.04, 0.0, Math.sin(t * 0.7) * 0.08);
      for (const b of this.blds) { b.position.z += dt * 40; if (b.position.z > 80) b.position.z -= 680; }
      for (const s of this.streaks) { s.position.z += dt * 120; if (s.position.z > 20) { s.position.z -= 220; s.position.x = (Math.random() - 0.5) * 40; } }
      this.flames.forEach((f, i) => { const k = 0.85 + 0.25 * Math.sin(t * 50 + i * 2); f.o.scale.set(1.1, 1.15 * k, 1.1); f.i.scale.set(0.55, 0.75 * k, 0.55); f.o.visible = f.i.visible = true; });
      for (const w of this.wheels) w.rotation.x -= dt * 2;
      // 카메라: 차 왼쪽 앞 3/4 시점, 차가 화면 오른쪽에 오도록 시선을 왼쪽으로
      this.cam.position.set(wide ? -6.2 : -4.6, 2.9 + Math.sin(t * 0.4) * 0.2, wide ? -7.6 : -9.5);
      this.cam.lookAt(wide ? 3.1 : 0.4, 1.9, 0.6);
    } else {
      if (this.spinWait > 0) this.spinWait -= dt; else if (!this.drag) this.spin = Math.min(0.6, this.spin + dt * 0.4);
      this.yaw += this.spin * dt * 0.5;
      car.position.set(0, 0, 0); car.rotation.set(0, this.yaw, 0); this.plate.rotation.y = this.yaw;
      this.flames.forEach((f, i) => { const on = Math.sin(t * 1.2) > 0.6; const k = 0.8 + 0.2 * Math.sin(t * 50 + i); f.o.visible = f.i.visible = on; f.o.scale.set(1, 1.4 * k, 1); f.i.scale.set(0.5, 0.9 * k, 0.5); });
      this.cam.position.set(wide ? 6.2 : 4.6, 2.4, wide ? 6.8 : 8.6);
      this.cam.lookAt(wide ? -1.6 : 0, 0.1, 0);
    }
    this.r.render(this.scene, this.cam);
  }
}
