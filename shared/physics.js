// 테무 로드스터 강체 물리 (서버/클라이언트/검증도구 공용)
// - 3D 강체: 위치, 속도, 쿼터니언, 각속도, 관성텐서(대각), 자이로 효과, 각속도 감쇠
// - 배출구: 모서리 위치에서 차체 위쪽 방향으로 힘을 가해 토크가 자동 발생
// - 바퀴: 4개의 스프링-댐퍼 접촉점 + 구동력 + 횡그립 (차동 조향)
// - 차체: 18개 접촉점을 충격량(sequential impulse)으로 풀어 착지/구르기/뒤집힘 처리
import { CFG } from './config.js';
import { qToMat3, qMul, qNormalize, m3MulV, m3TMulV, clamp, smoothstep } from './math.js';

export function createCar(x = 0, y = 0.6, z = 0, yaw = 0) {
  return {
    p: [x, y, z], v: [0, 0, 0], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], w: [0, 0, 0],
    thr: [0, 0, 0, 0], drv: [0, 0, 0, 0],
    air: 0,            // 마지막 접촉 이후 경과 시간
    wheelsDown: 0, hullHit: 0, spin: 0,
  };
}

export function resetCar(c, x, y, z, yaw) {
  c.p = [x, y, z]; c.v = [0, 0, 0]; c.q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]; c.w = [0, 0, 0];
  c.thr = [0, 0, 0, 0]; c.drv = [0, 0, 0, 0]; c.air = 0; c.wheelsDown = 0; c.hullHit = 0;
}

const INV_I = CFG.CAR.inertia.map((v) => 1 / v);

function worldInvInertia(R) {
  const M = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      M[i * 3 + j] = R[i * 3] * INV_I[0] * R[j * 3] + R[i * 3 + 1] * INV_I[1] * R[j * 3 + 1] + R[i * 3 + 2] * INV_I[2] * R[j * 3 + 2];
    }
  }
  return M;
}
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// 차 고도 (도로면 기준)
export function altitude(c, world) { return c.p[1] - world.refY(c.p[0], c.p[1], c.p[2]); }

// 한 서브스텝 진행. inp = { whl:[4 구동 명령 -1/0/1 (좌앞,우앞,좌뒤,우뒤)], exh:[4 bool], brake: bool }  (연료 처리는 호출자가 이미 반영)
export function stepCar(c, inp, dt, world) {
  const P = CFG.CAR, W = CFG.WHEEL, m = P.mass, g = CFG.G;
  const R = qToMat3(c.q);
  const up = [R[1], R[4], R[7]];
  const fwdW = [-R[2], -R[5], -R[8]];
  const vel = c.v, w = c.w;
  let Fx = 0, Fy = -m * g, Fz = 0, Tx = 0, Ty = 0, Tz = 0;

  // 1) 공기저항
  const sp = Math.hypot(vel[0], vel[1], vel[2]);
  const kd = CFG.DRAG.lin + CFG.DRAG.quad * sp;
  Fx -= kd * vel[0]; Fy -= kd * vel[1]; Fz -= kd * vel[2];

  // 2) 배출구 추력 (모서리마다 차체 위쪽 방향, 최대 고도에서 부드럽게 감소)
  const alt = c.p[1] - world.refY(c.p[0], c.p[1], c.p[2]);
  const fade = 1 - smoothstep(CFG.THRUST.fadeStart, CFG.THRUST.fadeEnd, alt);
  const hiAir = smoothstep(CFG.THRUST.ceilStart, CFG.THRUST.ceilEnd, alt);
  if (hiAir > 0) Fy -= CFG.THRUST.ceilDrag * hiAir * vel[1];
  for (let i = 0; i < 4; i++) {
    const tgt = inp.exh[i] ? 1 : 0;
    const tau = tgt > c.thr[i] ? CFG.THRUST.rise : CFG.THRUST.fall;
    c.thr[i] += (tgt - c.thr[i]) * (1 - Math.exp(-dt / tau));
    const T = CFG.THRUST.perExhaust * c.thr[i] * fade;
    if (T > 1) {
      const cb = P.corners[i];
      // 차체 좌표계 힘: 위쪽 + 약간의 소용돌이(접선) 성분
      const rl = Math.hypot(cb[0], cb[2]) || 1, sw = CFG.THRUST.swirl * CFG.THRUST.swirlSign[i];
      const fb = [T * sw * cb[2] / rl, T * Math.cos(CFG.THRUST.swirl), -T * sw * cb[0] / rl];
      const r = m3MulV(R, cb), f = m3MulV(R, fb);
      Fx += f[0]; Fy += f[1]; Fz += f[2];
      Tx += r[1] * f[2] - r[2] * f[1]; Ty += r[2] * f[0] - r[0] * f[2]; Tz += r[0] * f[1] - r[1] * f[0];
    }
  }

  // 3) 바퀴 (지면에 닿은 바퀴만 힘을 만든다. 공중/뒤집힘에서는 효과 없음)
  c.wheelsDown = 0;
  const anyDrive = inp.whl[0] || inp.whl[1] || inp.whl[2] || inp.whl[3], brake = !!inp.brake;
  let fl = Math.hypot(fwdW[0], fwdW[2]);
  const hasDir = fl > 0.25;
  const fx0 = hasDir ? fwdW[0] / fl : 0, fz0 = hasDir ? fwdW[2] / fl : -1;
  for (let i = 0; i < 4; i++) {
    const tgt = inp.whl[i] || 0;
    c.drv[i] += (tgt - c.drv[i]) * (1 - Math.exp(-dt / W.spool));
    const r = m3MulV(R, P.wheelPts[i]);
    const gy = world.groundY(c.p[0] + r[0], c.p[1] + r[1], c.p[2] + r[2]);
    const depth = gy - (c.p[1] + r[1]);
    if (!(depth > 0) || up[1] < 0.2) continue;
    c.wheelsDown++;
    const vpx = vel[0] + w[1] * r[2] - w[2] * r[1];
    const vpy = vel[1] + w[2] * r[0] - w[0] * r[2];
    const vpz = vel[2] + w[0] * r[1] - w[1] * r[0];
    let N = W.k * Math.min(depth, W.maxDepth) - W.c * vpy;
    N = clamp(N, 0, W.maxN);
    const lx = -fz0, lz = fx0;
    const vlong = vpx * fx0 + vpz * fz0;
    const vlatRaw = vpx * lx + vpz * lz;
    const yawLat = (w[1] * r[2]) * lx + (-w[1] * r[0]) * lz;
    const vlat = vlatRaw - W.yawSlip * yawLat;
    const flat = -N * clamp(W.latStiff * vlat, -W.muLat, W.muLat);
    // 전진(+)/후진(-) 구동: 각 방향 최고속도에 가까워질수록 구동력이 줄어든다
    const d = c.drv[i];
    let flong = 0;
    if (d > 0) { const vr = Math.max(0, vlong) / W.vmax; flong = W.drive * d * Math.max(0, 1 - vr * vr); }
    else if (d < 0) { const vr = Math.max(0, -vlong) / W.vrev; flong = W.drive * d * Math.max(0, 1 - vr * vr); }
    flong -= W.roll * N * Math.tanh(vlong * 3);
    if (!anyDrive) flong -= (m * W.coast / 4) * Math.tanh(vlong * 2.5);
    if (brake) flong -= W.brake * Math.tanh(vlong * 4);
    flong = clamp(flong, -W.muLong * N, W.muLong * N);
    const fxx = flat * lx + flong * fx0, fzz = flat * lz + flong * fz0, fyy = N;
    Fx += fxx; Fy += fyy; Fz += fzz;
    Tx += r[1] * fzz - r[2] * fyy; Ty += r[2] * fxx - r[0] * fzz; Tz += r[0] * fyy - r[1] * fxx;
    // 시각용 바퀴 회전
    c.spin += (vlong / P.wheelRadius) * dt * 0.25;
  }
  if (c.wheelsDown) Ty -= W.yawDamp * w[1] * (c.wheelsDown / 4);

  // 4) 속도/각속도 적분 (각속도는 차체 좌표계에서 오일러 방정식 + 감쇠)
  vel[0] += Fx / m * dt; vel[1] += Fy / m * dt; vel[2] += Fz / m * dt;
  const wb = m3TMulV(R, w), Tb = m3TMulV(R, [Tx, Ty, Tz]);
  const I = P.inertia, D = CFG.DRAG.ang;
  const gyro = [(I[2] - I[1]) * wb[1] * wb[2], (I[0] - I[2]) * wb[2] * wb[0], (I[1] - I[0]) * wb[0] * wb[1]];
  for (let k = 0; k < 3; k++) wb[k] += ((Tb[k] - gyro[k] - D[k] * wb[k]) / I[k]) * dt;
  const wn = m3MulV(R, wb);
  w[0] = wn[0]; w[1] = wn[1]; w[2] = wn[2];

  // 5) 차체 접촉 (충격량)
  solveHull(c, R, dt, world);

  // 6) 위치/자세 적분
  c.p[0] += vel[0] * dt; c.p[1] += vel[1] * dt; c.p[2] += vel[2] * dt;
  const dq = qMul([w[0], w[1], w[2], 0], c.q);
  c.q[0] += 0.5 * dt * dq[0]; c.q[1] += 0.5 * dt * dq[1]; c.q[2] += 0.5 * dt * dq[2]; c.q[3] += 0.5 * dt * dq[3];
  qNormalize(c.q);

  // 7) 안전 클램프
  const sv = Math.hypot(vel[0], vel[1], vel[2]);
  if (sv > 90) { const s = 90 / sv; vel[0] *= s; vel[1] *= s; vel[2] *= s; }
  const sw = Math.hypot(w[0], w[1], w[2]);
  if (sw > 14) { const s = 14 / sw; w[0] *= s; w[1] *= s; w[2] *= s; }

  if (c.wheelsDown || c.hullHit) c.air = 0; else c.air += dt;
}

// 차체 접촉점 vs 지면: 순차 충격량 + 쿨롱 마찰 + 반발
function solveHull(c, R, dt, world) {
  const P = CFG.CAR, H = CFG.HULL, m = P.mass, vel = c.v, w = c.w;
  const pts = P.hullPts, act = [];
  for (let i = 0; i < pts.length; i++) {
    const r = m3MulV(R, pts[i]);
    const gy = world.groundY(c.p[0] + r[0], c.p[1] + r[1], c.p[2] + r[2]);
    const depth = gy - (c.p[1] + r[1]);
    if (depth > -0.005) act.push({ r, depth });
  }
  c.hullHit = 0;
  if (!act.length) return;
  const Iinv = worldInvInertia(R);
  const K = (r, d) => { const a = cr(r, d), b = mv(Iinv, a), cc = cr(b, r); return 1 / m + cc[0] * d[0] + cc[1] * d[1] + cc[2] * d[2]; };
  for (const a of act) {
    a.kn = K(a.r, [0, 1, 0]); a.kx = K(a.r, [1, 0, 0]); a.kz = K(a.r, [0, 0, 1]);
    const vp = [vel[0] + w[1] * a.r[2] - w[2] * a.r[1], vel[1] + w[2] * a.r[0] - w[0] * a.r[2], vel[2] + w[0] * a.r[1] - w[1] * a.r[0]];
    a.vn0 = vp[1];
    a.bias = Math.min(3, (H.beta / dt) * Math.max(0, a.depth - H.slop));
    a.rest = a.vn0 < -1.5 && a.depth > -0.005 ? H.restitution * (-a.vn0 - 1.0) : 0;
    a.jn = 0; a.jx = 0; a.jz = 0;
    if (a.depth > 0) c.hullHit = 1;
  }
  const apply = (a, px, py, pz) => {
    vel[0] += px / m; vel[1] += py / m; vel[2] += pz / m;
    const dw = mv(Iinv, cr(a.r, [px, py, pz]));
    w[0] += dw[0]; w[1] += dw[1]; w[2] += dw[2];
  };
  for (let it = 0; it < H.iters; it++) {
    for (const a of act) {
      let vy = vel[1] + w[2] * a.r[0] - w[0] * a.r[2];
      const target = Math.max(a.bias, a.rest);
      let lam = (target - vy) / a.kn;
      const nacc = Math.max(0, a.jn + lam);
      lam = nacc - a.jn; a.jn = nacc;
      if (lam !== 0) apply(a, 0, lam, 0);
      const vx = vel[0] + w[1] * a.r[2] - w[2] * a.r[1];
      const vz = vel[2] + w[0] * a.r[1] - w[1] * a.r[0];
      let dx = -vx / a.kx, dz = -vz / a.kz;
      let nx = a.jx + dx, nz = a.jz + dz;
      const lim = H.mu * a.jn, mag = Math.hypot(nx, nz);
      if (mag > lim) { const s = lim / (mag || 1); nx *= s; nz *= s; }
      dx = nx - a.jx; dz = nz - a.jz; a.jx = nx; a.jz = nz;
      if (dx || dz) apply(a, dx, 0, dz);
    }
  }
}

// 월드 좌표 충돌 OBB 목록 (차체 + 바퀴)
export function carOBBs(c) {
  const R = qToMat3(c.q), out = [];
  for (const o of CFG.CAR.obbs) {
    const r = m3MulV(R, [o[0], o[1], o[2]]);
    out.push({ c: [c.p[0] + r[0], c.p[1] + r[1], c.p[2] + r[2]], R, h: [o[3], o[4], o[5]] });
  }
  return out;
}
