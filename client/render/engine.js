// 렌더 엔진: three.js WebGL2, ACES 톤매핑, Bloom, AO, 비네팅/색수차, 프로시저럴 환경맵, 그림자맵, 가로등 조명 풀,
// 진행 거리에 따른 황혼→밤→새벽 시간대, 탑뷰 카메라(고도에 따라 멀어짐)
import * as THREE from 'three';
import { CHASE, chaseFov, newChaseState, stepChase } from './chaseCam.js';
import { makeTextures } from './textures.js';
import { ENV_KEYS } from '../../shared/maps/city.js';

export const QUALITY = {
  low: { dpr: 0.75, shadow: 0, post: false, lamps: 2, bloom: 0, ao: false, ca: false, msaa: 0 },
  medium: { dpr: 1, shadow: 1024, post: true, lamps: 4, bloom: 0.7, ao: false, ca: false, msaa: 2 },
  high: { dpr: 1.5, shadow: 2048, post: true, lamps: 8, bloom: 1, ao: true, ca: true, msaa: 4 },
  ultra: { dpr: 2, shadow: 4096, post: true, lamps: 12, bloom: 1.25, ao: true, ca: true, msaa: 4 },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

const SKY_V = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 하늘 셰이더. 마지막 줄 근처의 gl_FragCoord 해시는 어두운 그라디언트의 띠(banding)를 줄이는 미세 디더. (GLSL 안에는 ASCII만 사용)
const SKY_F = `
uniform vec3 uTop; uniform vec3 uHor; uniform float uStars; uniform vec3 uMoon; varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  float h = clamp(vDir.y, -0.2, 1.0);
  float t = pow(max(h, 0.0), 0.55);
  vec3 col = mix(uHor, uTop, t);
  col = mix(col, uHor * 0.6, smoothstep(0.0, 0.2, -vDir.y) * 0.8);
  float st = step(0.9965, hash(floor(vDir * 220.0))) * uStars * smoothstep(0.1, 0.5, h);
  col += vec3(st) * (0.6 + 0.8 * hash(floor(vDir * 120.0)));
  float m = max(dot(normalize(vDir), normalize(uMoon)), 0.0);
  col += vec3(1.0, 0.95, 0.85) * (pow(m, 900.0) * 3.0 + pow(m, 40.0) * 0.18) * (0.3 + uStars);
  col += (hash(vec3(gl_FragCoord.xy, 3.0)) - 0.5) * 0.0016;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const FINAL = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.38 }, uCA: { value: 0.0014 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; uniform float uCA; varying vec2 vUv;
    void main(){ vec2 c = vUv - 0.5; float d = dot(c, c); vec2 off = c * uCA * (1.0 + d * 3.0);
      float r = texture2D(tDiffuse, vUv + off).r; float g = texture2D(tDiffuse, vUv).g; float b = texture2D(tDiffuse, vUv - off).b;
      vec3 col = vec3(r, g, b); col *= 1.0 - uVig * smoothstep(0.12, 0.7, d * 1.7); gl_FragColor = vec4(col, 1.0); }`,
};

const col = (h) => new THREE.Color(h);
const lerpN = (a, b, t) => a + (b - a) * t;

export class Engine {
  constructor(canvas, settings) {
    this.canvas = canvas; this.settings = settings;
    this.quality = settings.quality;
    this.frames = []; this.autoCool = 0; this.onQuality = null;
    this.cam = { pos: new THREE.Vector3(0, 40, 30), target: new THREE.Vector3(0, 0, -10), alt: 0, init: false, free: false, chase: newChaseState() };
    this.camMode = settings.camera === 'top' ? 'top' : 'chase';      // chase = 그란 투리스모식 3인칭 추격 시점(기본), top = 탑뷰
    this.shakeT = 0;
    this.envNow = { lamp: 1, win: 1, rain: 0 };
  }

  async init() {
    const q = QUALITY[this.quality];
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !q.post, powerPreference: 'high-performance', alpha: false });
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = q.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 1100);
    this.setCamMode(this.camMode);
    this.scene.fog = new THREE.FogExp2(0x101428, 0.005);
    this.tex = makeTextures(THREE, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.makeMaterials();
    this.makeSky();
    this.makeEnv();
    this.makeLights();
    await this.buildPost();
    window.addEventListener('resize', () => this.resize());
  }

  makeMaterials() {
    const T = this.tex, M = {};
    M.prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.12 });
    M.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.8 });
    M.glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.85 });
    M.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
    M.stripe = new THREE.MeshStandardMaterial({ map: T.stripe, vertexColors: true, roughness: 0.6, metalness: 0.2 });
    M.road = new THREE.MeshStandardMaterial({ map: T.road, roughnessMap: T.roadRough, vertexColors: true, roughness: 1, metalness: 0.06, envMapIntensity: 1.0 });
    M.side = new THREE.MeshStandardMaterial({ map: T.pave, vertexColors: true, roughness: 0.85, metalness: 0.05 });
    M.water = new THREE.MeshStandardMaterial({ color: 0x0b2238, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.4 });
    M.bldg = T.facades.map((f) => new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 1, vertexColors: true, roughness: 0.6, metalness: 0.3, envMapIntensity: 0.9 }));
    M.carPaint = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.28, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2, sheen: 0.5, sheenColor: new THREE.Color(0xdde8ff), sheenRoughness: 0.5 });
    M.carGlass = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.05, envMapIntensity: 2.0, clearcoat: 1, clearcoatRoughness: 0.02 });
    M.carTrim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 });
    M.tire = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05 });
    M.rim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.95, envMapIntensity: 1.3 });
    M.paint = M.carPaint; M.glassF = M.carGlass; M.trim = M.carTrim;     // 파편용 별칭
    this.mats = M;
  }

  makeSky() {
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: col(0x101830) }, uHor: { value: col(0x405080) }, uStars: { value: 0.8 }, uMoon: { value: new THREE.Vector3(-0.5, 0.45, -0.7) } } });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), this.skyMat);
    this.sky.renderOrder = -100; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // 프로시저럴 환경맵: 하늘 그라디언트 + 도시 불빛 점들 → PMREM
  makeEnv() {
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: SKY_V, fragmentShader: SKY_F.replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', ''), uniforms: { uTop: { value: col(0x1a2650) }, uHor: { value: col(0x6a5a78) }, uStars: { value: 0.4 }, uMoon: { value: new THREE.Vector3(-0.5, 0.5, -0.7) } } }));
    env.add(sky);
    const bm = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
    const mats = [bm(8, 5, 2.5), bm(2, 6, 8), bm(8, 2, 6), bm(6, 6, 7), bm(8, 1.5, 1.5)];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + (i % 3) * 0.2, y = -2 + ((i * 37) % 17) * 1.1, r = 40;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2 + (i % 4) * 0.8, 1 + (i % 5) * 0.6, 0.4), mats[i % mats.length]);
      m.position.set(Math.cos(a) * r, y, Math.sin(a) * r); m.lookAt(0, y, 0); env.add(m);
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: 0x0b0d14 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -8; env.add(ground);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pm.fromScene(env, 0.03).texture;
    this.scene.environment = this.envTex;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.7;
    pm.dispose();
  }

  makeLights() {
    const q = QUALITY[this.quality];
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = q.shadow > 0;
    const sh = this.sun.shadow; sh.mapSize.set(q.shadow || 512, q.shadow || 512);
    sh.camera.left = -55; sh.camera.right = 55; sh.camera.top = 55; sh.camera.bottom = -55; sh.camera.near = 5; sh.camera.far = 280; sh.bias = -0.0004; sh.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x6070b8, 0x202030, 0.9);
    this.scene.add(this.hemi);
    this.lampLights = [];
    this.buildLampPool(q.lamps);
    this.flashLight = new THREE.PointLight(0xff9a50, 0, 70, 2); this.scene.add(this.flashLight);
  }
  buildLampPool(n) {
    for (const l of this.lampLights) { this.scene.remove(l); l.dispose && l.dispose(); }
    this.lampLights = [];
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffc680, 0, 30, 2); this.scene.add(l); this.lampLights.push(l); }
  }

  async buildPost() {
    const q = QUALITY[this.quality];
    this.composer = null; this.bloom = null; this.finalPass = null;
    if (!q.post) return;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'), import('three/addons/postprocessing/ShaderPass.js'),
      ]);
      const w = window.innerWidth, h = window.innerHeight, pr = this.renderer.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.msaa });
      const composer = new EffectComposer(this.renderer, rt);
      composer.addPass(new RenderPass(this.scene, this.camera));
      if (q.ao) {
        try {
          const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
          const ao = new GTAOPass(this.scene, this.camera, w, h);
          if (ao.output !== undefined && GTAOPass.OUTPUT) ao.output = GTAOPass.OUTPUT.Default;
          if (ao.updateGtaoMaterial) ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.5, thickness: 2, scale: 1.0, samples: this.quality === 'ultra' ? 16 : 8, distanceFallOff: 1.0 });
          composer.addPass(ao); this.ao = ao;
        } catch (e) { console.warn('AO(GTAO) 사용 불가 → 건너뜀:', e.message); }
      }
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6 * q.bloom, 0.55, 0.9);
      composer.addPass(this.bloom);
      composer.addPass(new OutputPass());
      if (q.ca) { this.finalPass = new ShaderPass(FINAL); composer.addPass(this.finalPass); }
      composer.setSize(w, h);
      this.composer = composer;
    } catch (e) { console.warn('후처리 초기화 실패 → 기본 렌더링으로 진행:', e); this.composer = null; }
  }

  async setQuality(name, silent) {
    if (!QUALITY[name]) return;
    this.quality = name;
    const q = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.renderer.shadowMap.enabled = q.shadow > 0;
    this.sun.castShadow = q.shadow > 0;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(q.shadow || 512, q.shadow || 512);
    this.buildLampPool(q.lamps);
    if (this.composer) { this.composer.dispose && this.composer.dispose(); this.composer = null; this.ao = null; }
    await this.buildPost();
    this.resize();
    for (const m of Object.values(this.mats)) if (m.isMaterial) m.needsUpdate = true;
    if (!silent && this.onQuality) this.onQuality(name);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.applyFov();
    if (this.composer) this.composer.setSize(w, h);
  }

  // 진행 거리 s 에 따른 하늘/안개/조명/창문 밝기 보간
  applyEnv(s) {
    let a = ENV_KEYS[0], b = ENV_KEYS[ENV_KEYS.length - 1];
    for (let i = 0; i < ENV_KEYS.length - 1; i++) if (s >= ENV_KEYS[i].s && s <= ENV_KEYS[i + 1].s) { a = ENV_KEYS[i]; b = ENV_KEYS[i + 1]; break; }
    const t0 = b.s === a.s ? 0 : Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))), t = t0 * t0 * (3 - 2 * t0);
    const c = (k) => new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t);
    const n = (k) => lerpN(a[k], b[k], t);
    this.skyMat.uniforms.uTop.value.copy(c('top')); this.skyMat.uniforms.uHor.value.copy(c('hor'));
    this.skyMat.uniforms.uStars.value = Math.max(0.05, 1 - (n('sunI') - 0.5) * 0.9);
    this.scene.fog.color.copy(c('fog')); this.scene.fog.density = n('fogD');
    this.sun.color.copy(c('sun')); this.sun.intensity = n('sunI') * 1.15;
    this.hemi.color.copy(c('hemi')); this.hemi.groundColor.copy(c('hemiG')); this.hemi.intensity = n('hemiI');
    this.renderer.toneMappingExposure = n('exp');
    this.envNow.lamp = n('lamp'); this.envNow.win = n('win'); this.envNow.rain = n('rain');
    if (this.bloom) this.bloom.strength = n('bloom') * QUALITY[this.quality].bloom;
    for (const m of this.mats.bldg) m.emissiveIntensity = 0.25 + 1.5 * this.envNow.win;
  }

  // 가로등 조명 풀: 차에 가까운 램프에 실제 광원 배정
  updateLamps(lamps, carPos) {
    const L = this.lampLights;
    if (!L.length) return;
    const list = lamps.map((p) => ({ p, d: (p[0] - carPos.x) ** 2 + (p[2] - carPos.z) ** 2 })).sort((x, y) => x.d - y.d);
    for (let i = 0; i < L.length; i++) {
      const it = list[i];
      if (it && it.d < 90 * 90) { L[i].position.set(it.p[0], it.p[1], it.p[2]); L[i].intensity = 520 * this.envNow.lamp; } else L[i].intensity = 0;
    }
  }

  setCamMode(mode) {
    this.camMode = mode === 'top' ? 'top' : 'chase';
    this.applyFov();
    this.cam.init = false; this.cam.chase.init = false;
  }
  // 시점에 맞는 시야각/근거리 (추격 시점은 화면 비율에 따라 시야각 보정)
  applyFov() {
    if (!this.camera) return;
    this.camera.fov = this.camMode === 'chase' ? chaseFov(this.camera.aspect) : 46;
    this.camera.near = this.camMode === 'chase' ? CHASE.near : 0.5;
    this.camera.updateProjectionMatrix();
  }

  // 카메라 갱신.
  //  chase(기본): 그란 투리스모식 3인칭 추격 시점 (계산은 chaseCam.js)
  //  top: 위에서 내려다보는 시점(보조)
  // lim = { wall: 도로 옆 벽까지 거리, ceil: 터널 천장 높이, ground: 도로 높이 }
  updateCamera(dt, car, fx, lim = {}) {
    const cam = this.cam, p = car.p, alt = Math.max(0, car.alt);
    if (this.camMode === 'top') {
      const ahead = 9 + Math.min(8, Math.abs(car.v[2]) * 0.4);
      const tx = p[0] * 0.8, ty = Math.min(alt * 0.25, 10), tz = p[2] - ahead;
      const k = cam.init ? 1 - Math.exp(-dt * 4.5) : 1;
      cam.target.x += (tx - cam.target.x) * k; cam.target.y += (ty - cam.target.y) * k; cam.target.z += (tz - cam.target.z) * k;
      cam.alt += (alt - cam.alt) * (cam.init ? 1 - Math.exp(-dt * 2.2) : 1);
      cam.init = true;
      if (cam.free) return;
      const dist = 38 + cam.alt * 0.95, pitch = (62 * Math.PI) / 180;
      let ox = 0, oy = 0;
      if (fx.shake > 0) { const m = fx.shake * fx.shake * 1.4; ox = (Math.random() - 0.5) * m; oy = (Math.random() - 0.5) * m; }
      this.camera.position.set(cam.target.x + ox, cam.target.y + Math.sin(pitch) * dist + oy, cam.target.z + Math.cos(pitch) * dist);
      this.camera.lookAt(cam.target.x + ox * 0.5, cam.target.y, cam.target.z);
      this.sun.position.set(cam.target.x - 38, cam.target.y + 75, cam.target.z + 30);
      this.sun.target.position.set(cam.target.x, cam.target.y, cam.target.z);
      this.sky.position.copy(this.camera.position);
      return;
    }
    // ───── 추격 시점 ─────
    const r = stepChase(cam.chase, dt, { p, v: car.v, q: car.q, alt }, lim);
    cam.init = true; cam.alt += (alt - cam.alt) * (1 - Math.exp(-dt * 2.2));
    if (cam.free) return;
    let ox = 0, oy = 0;
    if (fx.shake > 0) { const m = fx.shake * fx.shake * 0.9; ox = (Math.random() - 0.5) * m; oy = (Math.random() - 0.5) * m; }
    this.camera.position.set(r.pos[0] + ox, r.pos[1] + oy, r.pos[2]);
    this.camera.lookAt(r.at[0], r.at[1], r.at[2]);
    // 그림자 카메라는 차 앞쪽까지 덮도록 차 주변을 따라간다
    this.sun.position.set(p[0] - 30 + r.sx * 14, p[1] + 70, p[2] + 28 + r.sz * 14);
    this.sun.target.position.set(p[0] + r.sx * 14, p[1], p[2] + r.sz * 14);
    this.sky.position.copy(this.camera.position);
  }
  snapCamera() { this.cam.init = false; this.cam.chase.init = false; }

  render(dt) {
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
    // 자동 화질: 프레임이 떨어지면 한 단계 낮춘다
    this.frames.push(dt); if (this.frames.length > 90) this.frames.shift();
    this.autoCool -= dt;
    if (this.settings.auto && this.autoCool <= 0 && this.frames.length >= 90) {
      const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
      if (avg > 1 / 36 && this.quality !== 'low') {
        const next = QUALITY_ORDER[QUALITY_ORDER.indexOf(this.quality) - 1];
        this.autoCool = 8; this.frames = [];
        this.setQuality(next);
      }
    }
  }
  fps() { if (!this.frames.length) return 0; return this.frames.length / this.frames.reduce((a, b) => a + b, 0); }
}
