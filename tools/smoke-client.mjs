// 클라이언트 렌더 코드 스모크 테스트 (가짜 three.js 사용):  node --import ./tools/fake-three/register.mjs tools/smoke-client.mjs
// 맵 전체의 모든 장식/장애물 시각 코드를 실행해 보고, 예외/NaN 없이 도는지 확인한다. (실제 GPU 렌더링은 검증하지 못함)
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };

const THREE = await import('three');
const { Engine } = await import('../client/render/engine.js');
const { Effects } = await import('../client/render/fx.js');
const { CarView } = await import('../client/render/car.js');
const { CityView } = await import('../client/render/city.js');
const { HazardView } = await import('../client/render/hazards.js');
const { getMap } = await import('../shared/mapData.js');
const { createWorld } = await import('../shared/world.js');

let problems = 0;
const bad = (m) => { problems++; console.log('  ✗', m); };
const t0 = Date.now();
const engine = new Engine({}, { quality: 'high', auto: true });
await engine.init();
console.log('엔진 초기화 OK, 후처리 합성기:', !!engine.composer);
const fx = new Effects(THREE, engine.scene, 'high', engine.mats);
const car = new CarView(THREE, engine.scene, engine.mats, engine.tex, fx);
fx.setFragments(car.fragments(), car.wheelData);
console.log('차량 뷰 OK, 파편 조각 수:', car.fragData.length);
let city = null;
for (const mapId of ['city', 'park']) {
  const map = getMap(mapId);
  createWorld(map);
  if (city) city.dispose();
  city = new CityView(THREE, engine.scene, map, engine.mats, engine.tex);
  const hz = new HazardView(THREE, engine.scene, map, engine.mats, engine.tex, fx);
  engine.setEnvKeys(map.env);
  // 1) 맵 전체 청크 빌드 (청크당 삼각형 수도 확인)
  let tris = 0, worst = 0, worstAt = 0;
  for (let s = 0; s <= map.length; s += 150) {
    try { city.update(s, true); } catch (e) { bad(`[${mapId}] 청크 s=${s}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); break; }
    for (const [ci, ch] of city.chunks) {
      let ct = 0;
      for (const g of ch.geoms) { const p = g.attributes.position; if (p) { ct += p.array.length / 9; for (let i = 0; i < p.array.length; i += 997) if (!Number.isFinite(p.array[i])) { bad(`[${mapId}] NaN 정점 발견`); break; } } }
      tris += ct; if (ct > worst) { worst = ct; worstAt = ci * 300; }
    }
  }
  console.log(`[${mapId}] 맵 청크 전체 빌드 OK (누적 ${(tris / 1000).toFixed(0)}k 삼각형, 가장 무거운 청크 s=${worstAt}: ${(worst / 1000).toFixed(0)}k), 청크 수 ${city.byChunk.size}`);
  // 2) 모든 동적 장애물 시각 생성/갱신
  let created = 0;
  for (let s = 0; s <= map.length; s += 70) {
    for (const T of [0.0, 1.7, 3.3, 6.1, 9.4]) {
      try { hz.update(T, s, 0.016); } catch (e) { bad(`[${mapId}] 장애물 s=${s} T=${T}: ${e.stack.split('\n').slice(0, 4).join(' | ')}`); break; }
    }
    created = Math.max(created, hz.active.size);
  }
  hz.clear();
  console.log(`[${mapId}] 동적 장애물 시각 OK (동시 활성 최대 ${created}개)`);
  const types = new Set(map.dynamics.map((e) => e.type)); console.log('  종류:', [...types].join(', '));
  for (const s of [0, 1000, 3000, 5000, map.length]) { try { engine.applyEnv(s); } catch (e) { bad('applyEnv: ' + e.stack); } }
}
engine.setEnvKeys(getMap('city').env);

// 3) 차량/이펙트/엔진
const state = (o) => ({ p: [0, 0.5, -100], q: [0, 0, 0, 1], v: [0, 0, -9], ex: 0, f: 80, inv: 0, alive: true, groundY: 0, alt: 0, ...o });
for (const o of [state({}), state({ ex: 15, alt: 8, p: [1, 9, -100], v: [0, 3, -8], f: 10 }), state({ inv: 1 }), state({ alive: false })]) { try { car.update(o, 0.016, 1.23, 15); } catch (e) { bad('car.update: ' + e.stack); } }
try { fx.explode([0, 1, -100], [0, 0, -9], [0, 0, 0, 1], 12345); for (let i = 0; i < 400; i++) fx.update(0.016); fx.rain([0, 30, -100], 0.6); fx.flame([0, 0, -50], 2, 6); fx.steam([0, 0, -50], 2, 3); fx.spark([0, 1, -50], 5, 6); fx.update(0.016); fx.clearAll(); } catch (e) { bad('fx: ' + e.stack); }
for (const s of [0, 600, 1500, 2500, 3600, 4300, 5200, 6200, 7100, 8100, 8990]) { try { engine.applyEnv(s); } catch (e) { bad('applyEnv: ' + e.stack); } }
try {
  engine.updateLamps(city.lamps, { x: 0, z: -100 });
  for (const mode of ['chase', 'top', 'chase']) {      // 추격/탑뷰 시점 전환 (C 키)
    engine.setCamMode(mode);
    for (let i = 0; i < 10; i++) { engine.updateCamera(0.016, { p: [0, 0.5, -100 - i], v: [0, 0, -9], q: [0, 0, 0, 1], alt: i * 4 }, fx, { wall: 13, ceil: 0, ground: 0 }); engine.render(0.016); }
    const cp = engine.camera.position; if (![cp.x, cp.y, cp.z].every(Number.isFinite)) bad('카메라 위치 NaN (' + mode + ')');
  }
  if (engine.camera.fov !== 62 && engine.camera.fov < 62) bad('추격 시점 시야각 이상: ' + engine.camera.fov);
  await engine.setQuality('low'); engine.render(0.016); await engine.setQuality('ultra'); engine.render(0.016); await engine.setQuality('medium'); engine.render(0.016);
} catch (e) { bad('engine: ' + e.stack); }
console.log(`렌더 호출 ${engine.renderer.renders}회, 소요 ${(Date.now() - t0) / 1000}s`);
console.log(problems ? `\n문제 ${problems}건` : '\n스모크 테스트 통과');
process.exit(problems ? 1 : 0);
