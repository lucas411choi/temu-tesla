// 그란 투리스모식 3인칭 추격 카메라 계산.
// three 에 의존하지 않는 순수 수학이라 노드에서 그대로 시험할 수 있다 (tools/test-camera.mjs).
// 좌표: x 오른쪽, y 위, 차 앞쪽 = -z.   car = { p:[x,y,z], v:[vx,vy,vz], q:[x,y,z,w], alt }
//
// 구도(기준: 그란 투리스모 후방 추격 시점)
//  - 차 중심에서 6.2m 뒤, 도로 위 약 2.2m 높이에서 앞쪽 지평선을 바라본다 → 차가 화면 하단 중앙(폭 20~23%), 지평선은 화면 약 46%
//  - 차의 방향(요)을 약 0.3초 지연으로 따라가고, 도로 방향(-z)으로 살짝 끌어당겨 앞 장애물이 계속 보이게 한다
//  - 높이 뜰수록 뒤/위로 물러나고 시선을 아래로 내려, 40m 상공에서도 차와 도로가 함께 보인다

export const CHASE = {
  dist: 6.2, speedDist: 0, height: 1.6, look: 11, lookY: 0.8,
  altDist: 0.32, altDistMax: 9, altHeight: 0.2, altHeightMax: 5.5,
  fov: 62, hfovMin: 88, fovMax: 76, near: 0.5,
};

export const wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

// 화면 비율에 따라 세로 시야각을 정한다 (좁은 화면에서도 좌우 시야가 너무 좁아지지 않게)
export function chaseFov(aspect) {
  const a = Math.max(0.5, aspect || 16 / 9);
  const f = (2 * Math.atan(Math.tan((CHASE.hfovMin * Math.PI) / 360) / a) * 180) / Math.PI;
  return Math.min(CHASE.fovMax, Math.max(CHASE.fov, f));
}

export const newChaseState = () => ({ init: false, yaw: 0, yawT: 0, px: 0, py: 3, pz: 10 });

// 차 기수(-z 로컬 축)의 수평 방향 각도.
// 기수가 거의 수직이거나 차가 뒤집혀 있으면 null (→ 이전 방향 유지: 공중제비 중에도 카메라가 뒤로 휙 돌지 않는다)
export function carHeading(q) {
  const upY = 1 - 2 * (q[0] * q[0] + q[2] * q[2]);
  if (upY < 0.25) return null;
  const fwx = -2 * (q[0] * q[2] + q[3] * q[1]), fwz = -(1 - 2 * (q[0] * q[0] + q[1] * q[1]));
  return Math.hypot(fwx, fwz) > 0.45 ? Math.atan2(-fwx, -fwz) : null;
}

// st 를 갱신하고 { pos, at, sx, sz } 를 돌려준다.  lim = { wall: 도로 옆 벽까지 거리, ceil: 천장 높이, ground: 도로 높이 }
export function stepChase(st, dt, car, lim = {}) {
  const C = CHASE, p = car.p, v = car.v || [0, 0, 0];
  const alt = Math.max(0, car.alt || 0), spd = Math.hypot(v[0], v[2]);
  const h = carHeading(car.q || [0, 0, 0, 1]);
  let yawT = h === null ? st.yawT : h;                                                     // 기수가 수직이면 이전 방향 유지
  // 앞으로 미끄러질 때만 진행 방향을 조금 반영한다 (후진 중에는 반영하지 않아 항상 차 뒷면을 비춘다)
  if (spd > 3) { const dv = wrapAngle(Math.atan2(-v[0], -v[2]) - yawT); if (Math.abs(dv) < 1.2) yawT += dv * 0.3 * Math.min(1, (spd - 3) / 5); }
  // 경로 방향으로 아주 살짝 끌어당김 (차가 경로와 크게 어긋나 있으면 끌지 않음)
  { const dr = wrapAngle((lim.roadYaw || 0) - yawT); if (Math.abs(dr) < 0.8) yawT += dr * 0.08; }
  st.yawT = yawT;
  const first = !st.init;
  st.yaw = first ? yawT : st.yaw + wrapAngle(yawT - st.yaw) * (1 - Math.exp(-dt * 3));
  const sx = -Math.sin(st.yaw), sz = -Math.cos(st.yaw);
  const dist = C.dist + Math.min(alt * C.altDist, C.altDistMax) + Math.min(spd * C.speedDist, 0.5);
  const height = C.height + Math.min(alt * C.altHeight, C.altHeightMax);
  const k = first ? 1 : 1 - Math.exp(-dt * 12), ky = first ? 1 : 1 - Math.exp(-dt * 7);
  st.px += (p[0] - sx * dist - st.px) * k; st.pz += (p[2] - sz * dist - st.pz) * k; st.py += (p[1] + height - st.py) * ky;
  st.init = true;
  // 옆 벽 제한은 벽이 있을 때만. (예전엔 벽이 없으면 x=±59m 로 묶여서, 구불구불한 경로에서 카메라가 멈춰 멀리서 바라봤다)
  const x = lim.wall === undefined || !Number.isFinite(lim.wall) ? st.px : Math.max(-(lim.wall - 0.8), Math.min(lim.wall - 0.8, st.px));
  let y = st.py;
  if (lim.ceil) y = Math.min(y, lim.ceil - 0.6);
  y = Math.max(y, (lim.ground || 0) + 0.9);
  const look = C.look + Math.min(spd * 0.5, 5);
  return { pos: [x, y, st.pz], at: [p[0] + sx * look, p[1] - Math.min(alt * 0.35, 7) + C.lookY, p[2] + sz * look], sx, sz };
}
