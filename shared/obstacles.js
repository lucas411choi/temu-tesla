// 동적 장애물: 위치 = f(서버 시간). 서버와 클라이언트가 같은 함수를 써서 항상 같은 모습이 된다.
// evalEntity(e, T, out, st): 시각 T에서의 도형(part)을 out에 추가한다.
//   part.lethal === true 인 것만 충돌에 쓰인다. st(선택)를 넘기면 시각용 상태/비치명 part도 채워준다.
import { makeBox, makeSphere } from './collision.js';
import { rotX, rotY, rotZ, m3MulV, tri, hash2, smoothstep, clamp, mod } from './math.js';
import { VEH } from './vehicles.js';

const TAU = Math.PI * 2;
const GRAV_DEBRIS = 14;

function emit(out, st, p, lethal) { p.lethal = lethal; if (lethal || st) out.push(p); }

// 깜빡임 상태: 0=꺼짐 1=경고 2=켜짐. blink = {P,on,warn,ph}
export function blinkState(b, T) {
  if (!b) return 2;
  const u = mod(T + b.ph, b.P);
  if (u < b.on) return 2;
  if (u >= b.P - b.warn) return 1;
  return 0;
}

// ───────── 새 떼 ─────────
function birds(e, T, out, st) {
  const w = TAU * T / e.per;
  if (st) st.birds = [];
  for (let i = 0; i < e.n; i++) {
    const dz = ((i % 3) - 1) * e.spread, dx = (((i * 7) % 5) - 2) * e.spread * 0.6, dy = (((i * 3) % 4) - 1.5) * 0.45;
    let x, y, z;
    if (e.pat === 'sine') { x = e.x0 + e.amp * Math.sin(w + e.ph + i * 0.07); y = e.y0 + dy + 0.7 * Math.sin(2 * w + i); z = e.z0 + dz; }
    else if (e.pat === 'circle') { const a = w + e.ph + i * TAU / e.n; x = e.x0 + e.amp * Math.cos(a); z = e.z0 + e.amp * Math.sin(a); y = e.y0 + dy; }
    else if (e.pat === 'vcircle') { const a = w + e.ph + i * 0.35; x = e.x0 + e.amp * Math.cos(a) + dx * 0.3; y = e.y0 + e.amp * 0.55 * Math.sin(a); z = e.z0 + dz; }
    else { z = e.z0 + e.amp * (2 * tri(T / e.per + e.ph + i * 0.05) - 1); x = e.x0 + dx; y = e.y0 + dy + 0.5 * Math.sin(w * 3 + i); }
    emit(out, st, makeSphere(x, y, z, e.r || 0.5), true);
    if (st) st.birds.push([x, y, z]);
  }
}

// ───────── 레이저 (trip / scan / grid) ─────────
function laser(e, T, out, st) {
  const state = blinkState(e.blink, T);
  const lethal = state === 2;
  if (st) st.state = state;
  if (e.mode === 'trip') {
    for (const y of e.ys) emit(out, st, makeBox((e.x0 + e.x1) / 2, y, e.z, (e.x1 - e.x0) / 2, 0.07, 0.07), lethal);
  } else if (e.mode === 'scan') {
    const ang = e.a0 + e.w * T;
    if (st) st.ang = ang;
    for (let k = 0; k < e.arms; k++) {
      const a = ang + k * TAU / e.arms;
      emit(out, st, makeBox(e.x + Math.cos(a) * e.L / 2, e.y, e.z + Math.sin(a) * e.L / 2, e.L / 2, 0.07, 0.07, -a), lethal);
    }
  } else {
    const gw = e.gw, gh = e.gh;
    const gx = clamp(e.cx + e.ax * Math.sin(TAU * T / e.per + (e.phx || 0)), e.x0 + gw / 2, e.x1 - gw / 2);
    const gy = clamp(e.cy + e.ay * Math.sin(TAU * T / (e.per2 || e.per) + (e.phy || 0)), gh / 2, e.H - gh / 2);
    const gl = gx - gw / 2, gr = gx + gw / 2, gb = gy - gh / 2, gt = gy + gh / 2, th = 0.08;
    if (gl > e.x0 + 0.05) emit(out, st, makeBox((e.x0 + gl) / 2, e.H / 2, e.z, (gl - e.x0) / 2, e.H / 2, th), lethal);
    if (gr < e.x1 - 0.05) emit(out, st, makeBox((gr + e.x1) / 2, e.H / 2, e.z, (e.x1 - gr) / 2, e.H / 2, th), lethal);
    if (gt < e.H - 0.05) emit(out, st, makeBox(gx, (gt + e.H) / 2, e.z, gw / 2, (e.H - gt) / 2, th), lethal);
    if (gb > 0.05) emit(out, st, makeBox(gx, gb / 2, e.z, gw / 2, gb / 2, th), lethal);
    if (st) st.gap = [gx, gy, gw, gh];
  }
}

// ───────── 불/증기/전기 기둥 (경고 → 분출 → 휴식) ─────────
function column(e, T, out, st) {
  if (st) st.cols = [];
  for (let i = 0; i < e.n; i++) {
    const x = e.x0 + i * e.dx;
    const u = mod(T + e.ph + i * e.phStep, e.P);
    let stage = 0, hh = 0;
    if (u < e.warn) stage = 1;
    else if (u < e.warn + e.on) {
      stage = 2;
      const a = u - e.warn;
      hh = e.H * Math.min(1, a / 0.18) * Math.min(1, (e.on - a) / 0.25);
    }
    if (stage === 2 && hh > 0.3) emit(out, st, makeBox(x, hh / 2, e.z, e.w / 2, hh / 2, e.w / 2), true);
    if (st) st.cols.push({ x, z: e.z, stage, hh, u });
  }
}

// ───────── 불 비 ─────────
function rain(e, T, out, st) {
  if (st) st.items = [];
  for (let j = 0; j < e.cnt; j++) {
    const q = T + e.ph - j * e.P / e.cnt;
    const k = Math.floor(q / e.P), tau = q - k * e.P;
    const x = e.x0 + (e.x1 - e.x0) * hash2(e.seed + j, k);
    const z = e.z0 + (e.z1 - e.z0) * hash2(e.seed + 977 + j, k);
    if (tau < e.fall) {
      const f = tau / e.fall, y = e.Y0 * (1 - f * f) + e.r;
      emit(out, st, makeSphere(x, y, z, e.r), true);
      if (st) st.items.push({ x, y, z, f });
    } else if (st && tau < e.fall + 0.6) st.items.push({ x, y: 0, z, burst: (tau - e.fall) / 0.6 });
  }
}

// ───────── 달리는 차 ─────────
export function trafficPos(e, T) {
  const tau = mod(T + e.ph, e.P);
  let d;
  if (e.acc) {
    const tv = e.v / e.acc;
    d = tau < tv ? 0.5 * e.acc * tau * tau : 0.5 * e.acc * tv * tv + e.v * (tau - tv);
  } else d = e.v * tau;
  if (d > e.len) return null;
  const spd = e.acc ? Math.min(e.v, e.acc * tau) : e.v;
  if (e.ax === 'x') return { d, x: e.xs + e.dir * d, z: e.z0, tau, spd };
  let x = e.x;
  if (e.lc) x += (e.lc.x1 - e.x) * smoothstep(e.lc.t0, e.lc.t0 + e.lc.dur, tau);
  return { d, x, z: e.z0 + e.dir * d, tau, spd };
}
function traffic(e, T, out, st) {
  const p = trafficPos(e, T);
  if (!p) { if (st) st.vis = null; return; }
  const yaw = e.ax === 'x' ? (e.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (e.dir > 0 ? Math.PI : 0);
  const R = rotY(yaw);
  for (const b of VEH[e.vk].boxes) {
    const o = m3MulV(R, [b[0], b[1], b[2]]);
    emit(out, st, makeBox(p.x + o[0], o[1], p.z + o[2], b[3], b[4], b[5], 0, R), true);
  }
  if (st) st.vis = { vk: e.vk, color: e.color, x: p.x, z: p.z, yaw, spd: p.spd * e.dir, siren: !!e.siren };
}

// ───────── 천장에서 내려오는 가시판 / 프레스 ─────────
function ceil(e, T, out, st) {
  const u = mod(T + e.ph, e.P);
  const t1 = e.hold, t2 = t1 + e.drop, t3 = t2 + e.stay, t4 = t3 + e.rise;
  let yb = e.yHigh, warn = false;
  if (u < t1) warn = u > t1 - 0.7;
  else if (u < t2) { const f = (u - t1) / e.drop; yb = e.yHigh + (e.yLow - e.yHigh) * f * f; }
  else if (u < t3) yb = e.yLow;
  else if (u < t4) yb = e.yLow + (e.yHigh - e.yLow) * smoothstep(0, 1, (u - t3) / e.rise);
  const top = e.h ? yb + e.h : e.yTop, hy = (top - yb) / 2;      // h 가 있으면 두께가 일정한 '내려오는 좌석'(자이로드롭)
  emit(out, st, makeBox((e.x0 + e.x1) / 2, yb + hy, e.z, (e.x1 - e.x0) / 2, hy, e.d / 2), true);
  if (st) { st.yb = yb; st.warn = warn; }
}

// ───────── 톱날 / 철거 크레인 철구 ─────────
function saw(e, T, out, st) {
  const x = e.x0 + (e.x1 - e.x0) * tri(T / e.per + e.ph);
  emit(out, st, makeSphere(x, e.y, e.z, e.r), true);
  if (st) st.pos = [x, e.y, e.z];
}
function ball(e, T, out, st) {
  const th = e.amp * Math.sin(TAU * (T + e.ph) / e.per);
  let bx, by, bz, R, rc;
  if (e.axis === 'x') {
    bx = e.px + e.L * Math.sin(th); by = e.py - e.L * Math.cos(th); bz = e.z;
    R = rotZ(th); rc = [e.px + e.L / 2 * Math.sin(th), e.py - e.L / 2 * Math.cos(th), e.z];
  } else {
    bx = e.px; by = e.py - e.L * Math.cos(th); bz = e.z + e.L * Math.sin(th);
    R = rotX(-th); rc = [e.px, e.py - e.L / 2 * Math.cos(th), e.z + e.L / 2 * Math.sin(th)];
  }
  emit(out, st, makeSphere(bx, by, bz, e.r), true);
  emit(out, st, makeBox(rc[0], rc[1], rc[2], 0.12, e.L / 2, 0.12, 0, R), true);
  if (st) { st.th = th; st.ball = [bx, by, bz]; }
}

// ───────── 낙하물 (에어컨 실외기 / 광고판 / 잔해) ─────────
function debris(e, T, out, st) {
  const tf = Math.sqrt(2 * e.y0 / GRAV_DEBRIS);
  if (st) st.items = [];
  for (let j = 0; j < e.n; j++) {
    const q = T + e.ph - j * e.P / e.n;
    const k = Math.floor(q / e.P), tau = q - k * e.P;
    const x = e.x0 + (hash2(e.seed + j, k) - 0.5) * e.xr;
    const z = e.z0 + (hash2(e.seed + 50 + j, k) - 0.5) * e.zs;
    if (tau < tf) {
      const y = e.y0 - 0.5 * GRAV_DEBRIS * tau * tau + e.size[1];
      emit(out, st, makeBox(x, y, z, e.size[0], e.size[1], e.size[2]), true);
      if (st) st.items.push({ x, y, z, f: tau / tf, size: e.size, kind: e.kind });
    } else if (st && tau < tf + 0.9) st.items.push({ x, y: 0, z, burst: (tau - tf) / 0.9, size: e.size, kind: e.kind });
  }
}

// ───────── 좌우 압착 벽 ─────────
function press(e, T, out, st) {
  const u = mod(T + e.ph, e.P);
  const t1 = e.open, t2 = t1 + e.close, t3 = t2 + e.closed, t4 = t3 + e.openT;
  let g = e.gapMax;
  if (u >= t1 && u < t2) g = e.gapMax + (e.gapMin - e.gapMax) * smoothstep(0, 1, (u - t1) / e.close);
  else if (u >= t2 && u < t3) g = e.gapMin;
  else if (u >= t3 && u < t4) g = e.gapMin + (e.gapMax - e.gapMin) * smoothstep(0, 1, (u - t3) / e.openT);
  const wL = e.xo - g / 2;
  emit(out, st, makeBox(-(g / 2 + wL / 2), e.hgt / 2, e.z, wL / 2, e.hgt / 2, e.d / 2), true);
  emit(out, st, makeBox((g / 2 + wL / 2), e.hgt / 2, e.z, wL / 2, e.hgt / 2, e.d / 2), true);
  if (st) { st.gap = g; st.warn = u > t1 - 0.8 && u < t1; }
}

// ───────── 철도 건널목 (차단기 + 열차) ─────────
function train(e, T, out, st) {
  const u = mod(T + e.ph, e.P);
  const X = 26, gap = 0.7, n = e.cars, total = n * (e.carLen + gap);
  const tEnd = e.warn + (2 * X + total) / e.v, down = tEnd + 1.0;
  let arm = 0;
  if (u >= 0.3 && u < 1.1) arm = (u - 0.3) / 0.8; else if (u >= 1.1 && u < down) arm = 1; else if (u >= down && u < down + 0.8) arm = 1 - (u - down) / 0.8;
  const za = e.z + 4.0, lethalArm = arm > 0.7;
  emit(out, st, makeBox(-6.15, 0.95, za, 5.85, 0.12, 0.08), lethalArm);
  emit(out, st, makeBox(6.15, 0.95, za, 5.85, 0.12, 0.08), lethalArm);
  let head = null;
  if (u >= e.warn && u <= tEnd) {
    head = -X + e.v * (u - e.warn);
    for (let k = 0; k < n; k++) {
      const xk = head - k * (e.carLen + gap) - e.carLen / 2;
      if (xk > -X - e.carLen && xk < X + e.carLen) emit(out, st, makeBox(xk, 2.1, e.z, e.carLen / 2, 2.1, 1.5), true);
    }
  }
  if (st) { st.arm = arm; st.bell = u < down; st.head = head; st.za = za; }
}

// ───────── 굴러오는 드럼통 ─────────
function barrels(e, T, out, st) {
  const tau = mod(T + e.ph, e.P), d = e.v * tau;
  if (st) st.pos = null;
  if (d > e.len) return;
  let x, z;
  if (e.ax === 'x') { x = e.xs + e.dir * d; z = e.z; } else { x = e.xs; z = e.z + e.dir * d; }
  emit(out, st, makeSphere(x, e.r, z, e.r), true);
  if (st) st.pos = [x, e.r, z, d];
}

// ───────── 드론 ─────────
function drone(e, T, out, st) {
  const w = TAU * T / e.per;
  const x = e.cx + e.ax * Math.sin(w + e.ph), y = e.cy + e.ay * Math.sin(2 * w + e.ph * 1.7), z = e.cz + e.az * Math.sin(w * 1.0 + e.ph + 1.3);
  emit(out, st, makeSphere(x, y, z, e.r || 0.9), true);
  if (st) st.pos = [x, y, z];
}

// ───────── 이동 바리케이드 ─────────
function barricade(e, T, out, st) {
  const x = e.x0 + (e.x1 - e.x0) * tri(T / e.per + e.ph);
  emit(out, st, makeBox(x, e.h / 2, e.z, e.w, e.h / 2, 0.35), true);
  if (st) st.pos = [x, e.h / 2, e.z];
}

// ───────── 대관람차 (도로를 가로지르는 x-y 평면 바퀴) ─────────
// 바큇살(spoke) + 테두리 현(chord) + 매달린 곤돌라. 곤돌라는 항상 아래로 매달려 있다.
function wheel(e, T, out, st) {
  const a0 = e.ph + e.w * T, n = e.n, R = e.R, gs = e.gs;
  if (st) { st.ang = a0; st.gond = []; }
  for (let i = 0; i < n; i++) {
    const a = a0 + i * TAU / n, ca = Math.cos(a), sa = Math.sin(a);
    const rx = e.cx + R * ca, ry = e.cy + R * sa;
    // 바큇살: 중심~테두리 (z축 회전)
    emit(out, st, makeBox(e.cx + ca * R / 2, e.cy + sa * R / 2, e.z, R / 2, 0.14, 0.14, 0, rotZ(a)), true);
    // 테두리 현
    const a2 = a + TAU / n, mx = e.cx + R * Math.cos(a + Math.PI / n) * Math.cos(Math.PI / n), my = e.cy + R * Math.sin(a + Math.PI / n) * Math.cos(Math.PI / n);
    emit(out, st, makeBox(mx, my, e.z, R * Math.sin(Math.PI / n), 0.16, 0.16, 0, rotZ(a + Math.PI / n + Math.PI / 2)), true);
    // 곤돌라 (테두리 점 아래로 매달림)
    const gy = ry - 1.1 - gs[1];
    emit(out, st, makeBox(rx, gy, e.z, gs[0], gs[1], gs[2]), true);
    if (st) st.gond.push([rx, gy, e.z, ry]);
    void a2;
  }
}

// ───────── 롤러코스터 열차 (도로를 x 방향으로 가로지름, 가운데에서 dip 만큼 낮아짐) ─────────
export function coasterY(e, x) { const span = e.len / 2; return e.y - (e.dip || 0) * Math.max(0, Math.cos(Math.PI * Math.min(1, Math.abs(x) / span) / 2)); }
function coaster(e, T, out, st) {
  const u = mod(T + e.ph, e.P), X = e.len / 2, gap = 0.5, carL = 2.6, n = e.cars, total = n * (carL + gap);
  const head = -X + e.v * u;
  if (st) st.cars = [];
  if (head - total > X) return;
  for (let k = 0; k < n; k++) {
    const xk = head - k * (carL + gap) - carL / 2;
    if (xk < -X - carL || xk > X + carL) continue;
    const x = e.dir > 0 ? xk : -xk, y = coasterY(e, x) + 0.75;
    emit(out, st, makeBox(x, y, e.z, carL / 2, 0.75, 0.95), true);
    if (st) st.cars.push([x, y, e.z, k]);
  }
}

// ───────── 바이킹(해적선) : z축 진자. 배 = 진자 끝의 긴 상자 ─────────
function swing(e, T, out, st) {
  const th = e.amp * Math.sin(TAU * (T + e.ph) / e.per);
  const bx = e.L * Math.sin(th), by = e.py - e.L * Math.cos(th);
  emit(out, st, makeBox(bx, by, e.z, e.hw, 1.3, 2.1, 0, rotZ(th)), true);
  // 팔 2개 (배 앞뒤)
  for (const dz of [-1.6, 1.6]) emit(out, st, makeBox(bx / 2, e.py - e.L / 2 * Math.cos(th), e.z + dz, 0.16, e.L / 2, 0.16, 0, rotZ(th)), true);
  if (st) { st.th = th; st.pos = [bx, by, e.z]; }
}

// ───────── 회전목마: x-z 평면에서 도는 목마들 (위아래로 들썩) ─────────
function carousel(e, T, out, st) {
  if (st) st.horses = [];
  const a0 = e.ph + e.w * T, sz = e.size || [0.42, 0.75, 0.42];
  for (let i = 0; i < e.n; i++) {
    const a = a0 + i * TAU / e.n, x = e.cx + e.R * Math.cos(a), z = e.z + e.R * Math.sin(a);
    const y = e.y + e.bob * 0.5 * (1 + Math.sin(T * 2.2 + i * 1.7));
    emit(out, st, makeBox(x, y, z, sz[0], sz[1], sz[2], 0, rotY(-a)), true);
    if (st) st.horses.push([x, y, z, a]);
  }
}

const EVAL = { birds, laser, column, rain, traffic, ceil, saw, ball, debris, press, train, barrels, drone, barricade, wheel, coaster, swing, carousel };
export const DYN_TYPES = Object.keys(EVAL);

export function evalEntity(e, T, out, st) { EVAL[e.type](e, T, out, st); }

// 움직임 전체 범위(x, z)를 표본으로 계산 → 서버 브로드페이즈 / 클라이언트 컬링용 (로컬 좌표)
export function entityBounds(e) {
  const period = Math.min(240, Math.max(e.P || 0, e.per || 0, e.type === 'laser' && e.blink ? e.blink.P : 0, 24));
  let lo = Infinity, hi = -Infinity, xl = Infinity, xh = -Infinity;
  const out = [], st = {};
  for (let T = 0; T <= period; T += 0.1) {
    out.length = 0;
    evalEntity(e, T, out, st);
    for (const p of out) {
      const rz = p.k === 's' ? p.r : Math.abs(p.R[6]) * p.h[0] + Math.abs(p.R[7]) * p.h[1] + Math.abs(p.R[8]) * p.h[2];
      const rx = p.k === 's' ? p.r : Math.abs(p.R[0]) * p.h[0] + Math.abs(p.R[1]) * p.h[1] + Math.abs(p.R[2]) * p.h[2];
      lo = Math.min(lo, p.c[2] - rz); hi = Math.max(hi, p.c[2] + rz); xl = Math.min(xl, p.c[0] - rx); xh = Math.max(xh, p.c[0] + rx);
    }
    if (st.cols) for (const c of st.cols) { lo = Math.min(lo, c.z - 2); hi = Math.max(hi, c.z + 2); xl = Math.min(xl, c.x - 2); xh = Math.max(xh, c.x + 2); }
    if (st.items) for (const c of st.items) { lo = Math.min(lo, c.z - 2); hi = Math.max(hi, c.z + 2); xl = Math.min(xl, c.x - 2); xh = Math.max(xh, c.x + 2); }
  }
  if (!isFinite(lo)) { lo = (e.z !== undefined ? e.z : e.z0 || 0) - 5; hi = lo + 10; }
  if (!isFinite(xl)) { xl = -20; xh = 20; }
  return { z: [lo - 0.5, hi + 0.5], x: [xl - 0.5, xh + 0.5] };
}
export function entityZRange(e) { return entityBounds(e).z; }
