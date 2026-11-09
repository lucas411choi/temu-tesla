// 검증용 자동조종: 서버와 같은 물리/연료 코드를 그대로 돌려, 비행 구간을 키 입력(8키)만으로 통과할 수 있는지 시험한다.
// - 수직: "예측 바닥 추종" (지금 상태로 가만히 두면 바닥 밴드 아래로 떨어질 때만 점화 → 포물선 비행 + 필요한 만큼만 연료 사용)
// - 자세: 롤/피치 PD → 4개 모서리 추력 배분 → 시그마델타로 켜짐/꺼짐 키 입력으로 변환 (사람이 키를 두드리는 것과 같음)
import { CFG } from '../shared/config.js';
import { createWorld } from '../shared/world.js';
import { CarSim } from '../shared/sim.js';
import { qToMat3, clamp } from '../shared/math.js';

const G = CFG.G, M = CFG.CAR.mass, I = CFG.CAR.inertia, TMAX = CFG.THRUST.perExhaust;
const HZ = Math.abs(CFG.CAR.corners[0][2]), HX = Math.abs(CFG.CAR.corners[0][0]);

// 비행 하나만 따로 떼어낸 월드 (해당 비행의 정적 장애물 + 천장)
export function flightWorld(map, f) {
  const lo = f.sStart - 6, hi = f.sEnd + 6;
  const statics = map.statics.filter((s) => {
    const sMin = -s.c[2] - (s.br || 0), sMax = -s.c[2] + (s.br || 0);
    if (sMax < lo || sMin > hi) return false;
    return s.fid === f.id || s.tag === 'ceiling' || (s.tag === 'spike' && s.c[1] > 2);
  });
  return createWorld({ statics, dynamics: [], ground: map.ground });
}

function makeController(f, world, P) {
  const bands = f.bands;
  const floorAt = (s) => { let v = -Infinity; for (const b of bands) if (s >= b.s0 && s <= b.s1) v = Math.max(v, b.lo); return v; };
  const ceilAt = (s) => { let v = Infinity; for (const b of bands) if (s >= b.s0 && s <= b.s1) v = Math.min(v, b.hi); return v; };
  const acc = [0.5, 0.5, 0.5, 0.5];
  return function control(sim) {
    const car = sim.car, R = qToMat3(car.q);
    const s = -car.p[2], vs = -car.v[2], x = car.p[0], y = car.p[1], vy = car.v[1];
    const gY = world.groundY(x, car.p[2]);
    const up = [R[1], R[4], R[7]];
    const roll = Math.atan2(up[0], up[1]), tilt = Math.atan2(-up[2], up[1]);
    const grounded = car.wheelsDown >= 2 && Number.isFinite(gY) && y - gY < 0.9;
    // 앞쪽 바닥/천장 요구 높이
    const tau = P.horizon;
    let yReq = -Infinity, yMax = Infinity;
    const span = Math.max(4, vs * tau + 4);
    for (let k = 0; k <= span; k += 1) { yReq = Math.max(yReq, floorAt(s + k)); yMax = Math.min(yMax, ceilAt(s + k)); }
    const fade = 1 - Math.min(1, Math.max(0, (y - 30) / 14));
    const tmaxEff = TMAX * Math.max(0.05, fade);
    let aDes = 0;
    // 좁은 창문(위/아래 제한)이 앞에 있으면 미리 올라가서 창문 가운데 높이로 고도 유지(PD)
    let win = null;
    for (const b of bands) if (b.hi < 1e8 && s <= b.s1 + 0.3 && (!win || b.s0 < win.s0)) win = b;
    let modeB = false;
    if (win) {
      const yc = (win.lo + win.hi) / 2;
      const lead = Math.max(vs, 3) * ((yc - 0.5) / 6 + 0.55) + 2;
      if (s >= win.s0 - lead) {
        modeB = true;
        const vyDes = clamp(P.kz * (yc - y), -6, 9);
        aDes = Math.max(0, G + P.kvz * (vyDes - vy));
      }
    }
    if (!modeB) {
      const yTarget = yReq + P.margin;
      const yPred = y + vy * tau - 0.5 * G * tau * tau;
      if (yReq > -1e8 && yPred < yTarget) aDes = G + 2 * (yTarget - y - vy * tau) / (tau * tau);
      if (yReq > -1e8 && y < yReq - 0.1 && !grounded) aDes = Math.max(aDes, G * 1.6);
    }
    // 착지 감속 (연착륙)
    const ground = Number.isFinite(gY) ? gY : 0;
    const rel = y - ground - 0.5;
    if (P.flare && yReq < -1e8 && !grounded && rel < 10) {
      const vt = -(P.land + 0.55 * Math.max(0, rel));
      if (vy < vt - 0.3) aDes = Math.max(aDes, G + 3.5 * (vt - vy) * -1);
    }
    let Ttot = aDes > 0 ? M * aDes / Math.max(up[1], 0.6) : 0;
    Ttot = Math.min(Ttot, 4 * tmaxEff);
    // 자세 목표
    const airborne = !grounded;
    const thDes = airborne ? clamp(P.kv * (f.v0 - vs), -0.12, 0.12) : 0;
    const phDes = clamp(0.05 * (f.x - x) - 0.12 * car.v[0], -0.1, 0.1);
    const wb0 = R[0] * car.w[0] + R[3] * car.w[1] + R[6] * car.w[2];
    const wb2 = R[2] * car.w[0] + R[5] * car.w[1] + R[8] * car.w[2];
    const tauX = -I[0] * (P.kpP * (thDes - tilt) + P.kdP * wb0);
    const tauZ = -I[2] * (P.kpR * (phDes - roll) + P.kdR * wb2);
    const p = Ttot > 0 ? tauX / HZ : 0, r = Ttot > 0 ? tauZ / HX : 0, b = Ttot / 4;
    const T = [b + p / 4 - r / 4, b + p / 4 + r / 4, b - p / 4 - r / 4, b - p / 4 + r / 4];
    let mask = 0;
    for (let i = 0; i < 4; i++) {
      const d = clamp(T[i] / tmaxEff, 0, 1);
      acc[i] += d;
      if (acc[i] >= 1) { mask |= 16 << i; acc[i] -= 1; }
    }
    // 지면에서는 바퀴로 접근 속도 유지
    if (grounded && vs < f.v0 - 0.2 && s < f.sEnd + 6) mask |= 15;
    return mask;
  };
}

// 비행 하나를 시험한다. 결과: { ok, reason, fuelUsed, time, maxAlt, params }
export function runFlight(map, f, P, opts = {}) {
  const world = flightWorld(map, f);
  const sim = new CarSim(world);
  const gY0 = world.groundY(f.x, -f.sStart);
  sim.spawn(f.x, (Number.isFinite(gY0) ? gY0 : 0) + 0.5, -f.sStart, 0);
  sim.car.v[2] = -f.v0;
  const ctl = makeController(f, world, P);
  const dt = 1 / CFG.TICK_HZ;
  let T = 0, maxAlt = 0, hit = null, ok = false, reason = 'timeout', settle = 0;
  const trace = opts.trace ? [] : null;
  for (let i = 0; i < 60 * 40; i++) {
    const mask = ctl(sim);
    hit = sim.step(mask, dt, T);
    T += dt;
    maxAlt = Math.max(maxAlt, sim.car.p[1]);
    if (trace && i % 6 === 0) trace.push([T, -sim.car.p[2], sim.car.p[1], sim.fuel, mask]);
    if (hit) { reason = `충돌:${hit.tag}`; break; }
    const s = -sim.car.p[2];
    if (s > f.sEnd) {
      const R = qToMat3(sim.car.q);
      if (sim.car.air < 0.1 && R[4] > 0.7) settle += dt; else settle = 0;
      if (settle > 0.6) { ok = true; reason = 'ok'; break; }
      if (T > 0 && s > f.sEnd + 25) { reason = '착지 실패(공중/전복)'; break; }
    }
    if (sim.lock && sim.car.air > 0.3) { reason = '연료 고갈'; break; }
  }
  return { ok, reason, fuelUsed: sim.fuelUsed, time: T, maxAlt, hit: hit ? hit.tag : null, trace };
}

const PARAM_SETS = [];
for (const horizon of [0.8, 1.2]) for (const margin of [0.3, 0.5]) for (const flare of [true, false])
  PARAM_SETS.push({ horizon, margin, flare, land: 1.8, kv: 0.04, kpP: 8, kdP: 0, kpR: 12, kdR: 0, kz: 1.6, kvz: 6 });

// 가장 연료를 적게 쓰고 성공하는 설정을 찾는다 (숙련자 플레이 근사)
export function bestFlight(map, f) {
  let best = null, tried = [];
  for (const P of PARAM_SETS) {
    const r = runFlight(map, f, P);
    tried.push(r);
    if (r.ok && (!best || r.fuelUsed < best.fuelUsed)) best = { ...r, params: P };
  }
  return best ? { ok: true, ...best } : { ok: false, reason: tried.map((t) => t.reason).join(' / '), fuelUsed: Infinity };
}
