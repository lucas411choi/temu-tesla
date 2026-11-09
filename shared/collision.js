// 충돌 판정: 차(OBB 여러 개) vs 상자(OBB) / 구
// 상자 도형: { k:'b', c:[x,y,z], h:[hx,hy,hz], R:[9] }   구 도형: { k:'s', c:[x,y,z], r }
import { rotY } from './math.js';

export const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function makeBox(cx, cy, cz, hx, hy, hz, yaw = 0, R = null) {
  return { k: 'b', c: [cx, cy, cz], h: [hx, hy, hz], R: R || (yaw ? rotY(yaw) : I3), br: Math.hypot(hx, hy, hz) };
}
export function makeSphere(cx, cy, cz, r) { return { k: 's', c: [cx, cy, cz], r, br: r }; }

// 분리축 정리(15축) OBB 겹침
export function obbOverlap(a, b) {
  const Ra = a.R, Rb = b.R, ha = a.h, hb = b.h;
  const dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1], dz = b.c[2] - a.c[2];
  const A = [[Ra[0], Ra[3], Ra[6]], [Ra[1], Ra[4], Ra[7]], [Ra[2], Ra[5], Ra[8]]];
  const B = [[Rb[0], Rb[3], Rb[6]], [Rb[1], Rb[4], Rb[7]], [Rb[2], Rb[5], Rb[8]]];
  const axes = [];
  for (let i = 0; i < 3; i++) axes.push(A[i]);
  for (let i = 0; i < 3; i++) axes.push(B[i]);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const x = A[i][1] * B[j][2] - A[i][2] * B[j][1];
      const y = A[i][2] * B[j][0] - A[i][0] * B[j][2];
      const z = A[i][0] * B[j][1] - A[i][1] * B[j][0];
      const l = Math.hypot(x, y, z);
      if (l > 1e-6) axes.push([x / l, y / l, z / l]);
    }
  }
  for (let n = 0; n < axes.length; n++) {
    const L = axes[n];
    const ra = ha[0] * Math.abs(L[0] * A[0][0] + L[1] * A[0][1] + L[2] * A[0][2])
      + ha[1] * Math.abs(L[0] * A[1][0] + L[1] * A[1][1] + L[2] * A[1][2])
      + ha[2] * Math.abs(L[0] * A[2][0] + L[1] * A[2][1] + L[2] * A[2][2]);
    const rb = hb[0] * Math.abs(L[0] * B[0][0] + L[1] * B[0][1] + L[2] * B[0][2])
      + hb[1] * Math.abs(L[0] * B[1][0] + L[1] * B[1][1] + L[2] * B[1][2])
      + hb[2] * Math.abs(L[0] * B[2][0] + L[1] * B[2][1] + L[2] * B[2][2]);
    if (Math.abs(dx * L[0] + dy * L[1] + dz * L[2]) > ra + rb) return false;
  }
  return true;
}

export function obbSphere(a, c, r) {
  const R = a.R;
  const dx = c[0] - a.c[0], dy = c[1] - a.c[1], dz = c[2] - a.c[2];
  const lx = R[0] * dx + R[3] * dy + R[6] * dz;
  const ly = R[1] * dx + R[4] * dy + R[7] * dz;
  const lz = R[2] * dx + R[5] * dy + R[8] * dz;
  const qx = Math.max(-a.h[0], Math.min(a.h[0], lx)) - lx;
  const qy = Math.max(-a.h[1], Math.min(a.h[1], ly)) - ly;
  const qz = Math.max(-a.h[2], Math.min(a.h[2], lz)) - lz;
  return qx * qx + qy * qy + qz * qz <= r * r;
}

// 차 OBB 목록 vs 도형 목록. 처음 닿은 도형을 반환.
export function firstHit(obbs, center, boundR, shapes) {
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    const br = s.br !== undefined ? s.br : (s.k === 's' ? s.r : Math.hypot(s.h[0], s.h[1], s.h[2]));
    const dx = s.c[0] - center[0], dy = s.c[1] - center[1], dz = s.c[2] - center[2];
    const rr = boundR + br;
    if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
    for (let j = 0; j < obbs.length; j++) {
      if (s.k === 's' ? obbSphere(obbs[j], s.c, s.r) : obbOverlap(obbs[j], s)) return s;
    }
  }
  return null;
}

// OBB가 x축으로 뻗은 최대 거리 (복도 벽 판정용)
export function obbMaxAbsX(o) {
  return Math.abs(o.c[0]) + Math.abs(o.R[0]) * o.h[0] + Math.abs(o.R[1]) * o.h[1] + Math.abs(o.R[2]) * o.h[2];
}
