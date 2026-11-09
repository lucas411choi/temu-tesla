// 물리 튜닝 실험실: node tools/phys-lab.mjs
import { CFG } from '../shared/config.js';
import { createCar, stepCar } from '../shared/physics.js';
import { qToMat3 } from '../shared/math.js';

const world = { groundY: () => 0, refY: () => 0 };
const DT = 1 / (CFG.TICK_HZ * CFG.SUBSTEPS);
function run(car, seconds, keysFn, log) {
  const n = Math.round(seconds / DT);
  let fuel = 100;
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    const k = keysFn(t, car);
    stepCar(car, k, DT, world);
    if (log && i % Math.round(0.25 / DT) === 0) log(t, car);
  }
}
const mk = (wh, ex) => ({ whl: wh, exh: ex });
const F = [false, false, false, false], T = [true, true, true, true];
const euler = (c) => { const R = qToMat3(c.q); const up = [R[1], R[4], R[7]]; return { pitchDeg: Math.atan2(-up[2], up[1]) * 57.3, rollDeg: Math.atan2(up[0], up[1]) * 57.3, upY: up[1] }; };
const fmt = (a) => a.map((x) => x.toFixed(2)).join(',');

console.log('=== 1) 정지 자세 (2초)');
let c = createCar(0, 0.7, 0, 0);
run(c, 2, () => mk(F, F), (t, c) => { if (t > 1.5) console.log(t.toFixed(2), 'y', c.p[1].toFixed(3), 'wheels', c.wheelsDown); });

console.log('=== 2) 네 바퀴 직진 (10초)');
c = createCar(0, 0.6, 0, 0);
run(c, 10, () => mk(T, F), (t, c) => { if (Math.abs(t % 1) < 0.01) console.log(t.toFixed(1), 'speed', Math.hypot(c.v[0], c.v[2]).toFixed(2), 'z', c.p[2].toFixed(1)); });

console.log('=== 3) q만 (좌앞 바퀴) 4초');
c = createCar(0, 0.6, 0, 0);
run(c, 4, () => mk([true, false, false, false], F), (t, c) => { if (Math.abs(t % 1) < 0.01) console.log(t.toFixed(1), 'speed', Math.hypot(c.v[0], c.v[2]).toFixed(2), 'yawrate', c.w[1].toFixed(3), 'pos', fmt(c.p)); });

console.log('=== 4) q+a (왼쪽 두 바퀴) 4초');
c = createCar(0, 0.6, 0, 0);
run(c, 4, () => mk([true, false, true, false], F), (t, c) => { if (Math.abs(t % 1) < 0.01) console.log(t.toFixed(1), 'speed', Math.hypot(c.v[0], c.v[2]).toFixed(2), 'yawrate', c.w[1].toFixed(3), 'pos', fmt(c.p)); });

console.log('=== 5) 배출구 4개 상승 1초 후 해제');
c = createCar(0, 0.6, 0, 0);
run(c, 7, (t) => mk(F, t < 1 ? T : F), (t, c) => console.log(t.toFixed(2), 'y', c.p[1].toFixed(2), 'vy', c.v[1].toFixed(2), 'tilt', JSON.stringify(euler(c))));

console.log('=== 6) 배출구 2개(앞쪽 e+r) 1초');
c = createCar(0, 0.6, 0, 0);
run(c, 6, (t) => mk(F, t < 1 ? [true, true, false, false] : F), (t, c) => console.log(t.toFixed(2), 'y', c.p[1].toFixed(2), 'z', c.p[2].toFixed(1), 'vy', c.v[1].toFixed(2), 'vz', c.v[2].toFixed(2), 'tilt', JSON.stringify(euler(c))));

console.log('=== 7) 공중에서 배출구 1개(e) 1초 (고도 20m에서 시작, 정지)');
c = createCar(0, 20, 0, 0);
run(c, 3, (t) => mk(F, t < 1 ? [true, false, false, false] : F), (t, c) => console.log(t.toFixed(2), 'y', c.p[1].toFixed(2), 'vy', c.v[1].toFixed(2), 'w', fmt(c.w), 'tilt', JSON.stringify(euler(c))));

console.log('=== 8) 40m 낙하 착지');
c = createCar(0, 40, 0, 0);
run(c, 8, () => mk(F, F), (t, c) => console.log(t.toFixed(2), 'y', c.p[1].toFixed(2), 'vy', c.v[1].toFixed(2), 'upY', euler(c).upY.toFixed(2), 'speed', Math.hypot(...c.v).toFixed(1)));
