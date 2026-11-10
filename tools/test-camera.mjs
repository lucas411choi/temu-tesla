// 추격 카메라 검증: 실제 물리 시뮬레이션 궤적(주행/조향/이륙/회전/고공)을 따라가며
// 차가 항상 화면 안에 들어오는지, 구도가 기준(그란 투리스모식 후방 추격)과 맞는지 수치로 확인한다.
// 실행: node tools/test-camera.mjs
import { CarSim } from '../shared/sim.js';
import { createStraightWorld } from '../shared/world.js';
import { qToMat3 } from '../shared/math.js';
import { CHASE, chaseFov, newChaseState, stepChase } from '../client/render/chaseCam.js';

// 카메라 구도만 보는 시험이라 끝없이 넓은 평지 위에서 달린다
const world = createStraightWorld({ statics: [], dynamics: [], ground: [{ s0: -1e6, s1: 1e6, y: 0, solid: true, half: 1e6, wall: Infinity }] });
let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const ASPECTS = { '16:9': 16 / 9, '16:10': 1.6, '4:3': 4 / 3, '21:9': 21 / 9, '1:1': 1 };
const HALF = [0.99, 0.55, 2.3];   // 차 몸체 대략 크기 (반폭, 반높이, 반길이)

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// pos/at 으로 만든 카메라(lookAt, 월드 위쪽 고정)로 점을 화면 비율(0~1, 왼쪽 위 기준)로 투영
function projector(pos, at, aspect) {
  const f = norm(sub(at, pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const tv = Math.tan((chaseFov(aspect) * Math.PI) / 360), th = tv * aspect;
  const pr = (p) => { const d = sub(p, pos), z = dot(d, f); if (z < 0.1) return null; return [0.5 + dot(d, r) / (z * th) / 2, 0.5 - dot(d, u) / (z * tv) / 2]; };
  const hz = (() => { const hd = [0, 0, -1]; const z = dot(hd, f), y = dot(hd, u); return z > 0 ? 0.5 - y / (z * tv) / 2 : NaN; })();
  return { pr, hz, pitch: (Math.asin(-f[1]) * 180) / Math.PI };
}
function carBox(c) {
  const R = qToMat3(c.q), out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const l = [sx * HALF[0], sy * HALF[1], sz * HALF[2]];
    out.push([c.p[0] + R[0] * l[0] + R[1] * l[1] + R[2] * l[2], c.p[1] + R[3] * l[0] + R[4] * l[1] + R[5] * l[2], c.p[2] + R[6] * l[0] + R[7] * l[1] + R[8] * l[2]]);
  }
  return out;
}

function run(name, plan, seconds, startS = 14) {
  const sim = new CarSim(world);
  sim.spawn(0, world.groundY(0, -startS) + 0.56, -startS, 0);
  const st = newChaseState(), dt = 1 / 60;
  const agg = {}; for (const k of Object.keys(ASPECTS)) agg[k] = { w: [], top: [], bot: [], cx: [], cy: [], hz: [], behind: 0, out: 0, hidden: 0, n: 0 };
  let maxAlt = 0, minDist = 1e9, maxDist = 0, yawMax = 0, nan = 0, fell = false;
  for (let i = 0, T = 0; i < seconds * 60; i++, T += dt) {
    const hit = sim.step(plan(T, sim), dt, T, false);
    if (hit && hit.tag === 'fall') { fell = true; break; }
    const c = sim.car, gy = world.groundY(c.p[0], c.p[2]);
    const alt = Math.max(0, c.p[1] - world.refY(c.p[2])); maxAlt = Math.max(maxAlt, alt);
    const r = stepChase(st, dt, { p: c.p, v: c.v, q: c.q, alt }, { wall: world.wallHalf(c.p[2]), ceil: 0, ground: Number.isFinite(gy) ? gy : 0 });
    if ([...r.pos, ...r.at].some((x) => !Number.isFinite(x))) { nan++; continue; }
    const d = Math.hypot(r.pos[0] - c.p[0], r.pos[2] - c.p[2]); minDist = Math.min(minDist, d); maxDist = Math.max(maxDist, d);
    yawMax = Math.max(yawMax, Math.abs(st.yaw));
    if (i < 30) continue;       // 시작 직후 안정화 구간 제외
    for (const [k, asp] of Object.entries(ASPECTS)) {
      const a = agg[k], P = projector(r.pos, r.at, asp);
      const cs = carBox(c).map(P.pr);
      if (cs.some((q) => q === null)) { a.behind++; continue; }
      const ctr = P.pr(c.p); if (!ctr) { a.behind++; continue; }
      const xs = cs.map((q) => q[0]), ys = cs.map((q) => q[1]);
      a.n++; a.w.push((Math.max(...xs) - Math.min(...xs)) * 100); a.top.push(Math.min(...ys) * 100); a.bot.push(Math.max(...ys) * 100);
      a.cx.push(ctr[0] * 100); a.cy.push(ctr[1] * 100); a.hz.push(P.hz * 100);
      if (ctr[0] < 0.1 || ctr[0] > 0.9 || ctr[1] < 0.08 || ctr[1] > 0.92) a.out++;
      if (Math.max(...ys) > 0.97) a.hidden++;
    }
  }
  const mm = (v) => (v.length ? `${Math.min(...v).toFixed(0)}~${Math.max(...v).toFixed(0)}` : '-');
  console.log(`\n▶ ${name}   (최고 고도 ${maxAlt.toFixed(1)}m, 카메라-차 수평거리 ${minDist.toFixed(1)}~${maxDist.toFixed(1)}m, 카메라 요 최대 ${(yawMax * 57.3).toFixed(0)}°)`);
  for (const [k, a] of Object.entries(agg)) console.log(`   ${k.padEnd(6)} 차 폭 ${mm(a.w)}%  위 ${mm(a.top)}%  아래 ${mm(a.bot)}%  중심 x ${mm(a.cx)}% y ${mm(a.cy)}%  지평선 ${mm(a.hz)}%   화면 밖 ${a.out}프레임 / 뒤 ${a.behind} / 하단가림 ${a.hidden}`);
  if (nan) fail(`${name}: NaN 프레임 ${nan}`);
  if (fell) fail(`${name}: 시험 중 차가 도로 밖으로 떨어짐 (시나리오 수정 필요)`);
  return { agg, maxAlt, minDist, maxDist };
}

const W4 = 0x03, EX4 = 0xf0, ALL = 0xf3;          // q+w = 양쪽 바퀴 전진 (a/s 는 후진)
// 1) 직선 주행: 구도 기준 확인
const s1 = run('직선 주행 8초', () => W4, 8);
{
  const a = s1.agg['16:9'], last = (v) => v.slice(-120);
  const w = last(a.w), cx = last(a.cx), bot = last(a.bot), top = last(a.top), hz = last(a.hz);
  const rng = (v) => [Math.min(...v), Math.max(...v)];
  const [w0, w1] = rng(w), [b0, b1] = rng(bot), [t0] = rng(top), [h0, h1] = rng(hz), [c0, c1] = rng(cx);
  (w0 >= 17 && w1 <= 27) ? ok(`16:9 차 폭 ${w0.toFixed(0)}~${w1.toFixed(0)}% (기준 스크린샷 약 23%)`) : fail(`차 폭 ${w0.toFixed(1)}~${w1.toFixed(1)}%`);
  (b1 <= 93 && b0 >= 75) ? ok(`차 아래쪽 ${b0.toFixed(0)}~${b1.toFixed(0)}% (HUD 위, 기준 약 89%)`) : fail(`차 아래쪽 ${b0.toFixed(1)}~${b1.toFixed(1)}%`);
  (t0 >= 48) ? ok(`차 위쪽 ${t0.toFixed(0)}% 이하로 내려와 지평선을 가리지 않음`) : fail(`차 위쪽 ${t0.toFixed(1)}%`);
  (h0 >= 40 && h1 <= 54) ? ok(`지평선 높이 ${h0.toFixed(0)}~${h1.toFixed(0)}% (기준 약 47~50%)`) : fail(`지평선 ${h0.toFixed(1)}~${h1.toFixed(1)}%`);
  (c0 >= 47 && c1 <= 53) ? ok(`차가 가로 중앙 ${c0.toFixed(1)}~${c1.toFixed(1)}%`) : fail(`가로 중심 ${c0.toFixed(1)}~${c1.toFixed(1)}%`);
}
// 2) 조향
run('가속 3초 → 왼쪽 바퀴만 1초 → 오른쪽 바퀴만 2초 → 직진', (t) => (t < 3 ? W4 : t < 4 ? 0x01 : t < 6 ? 0x02 : W4), 8);
run('가속 3초 → 오른쪽 바퀴만 1초 → 왼쪽 바퀴만 2초 → 직진', (t) => (t < 3 ? W4 : t < 4 ? 0x02 : t < 6 ? 0x01 : W4), 8);
run('가속 3초 → 브레이크 → 후진', (t) => (t < 3 ? W4 : t < 4.5 ? 0x100 : 0x0c), 8);
// 3) 이륙
const s3 = run('3초 가속 → 4배출구 3초 이륙 → 낙하', (t) => (t < 3 ? W4 : t < 6 ? ALL : 0), 14);
// 4) 회전(대각선 배출구)
const s4 = run('대각선 배출구(e+f)로 회전하며 상승', (t) => (t < 1 ? EX4 : t < 4 ? 0x90 : 0), 12, 200);
// 5) 고공
const s5 = run('제자리 4배출구 3.4초 고공', (t) => (t < 3.4 ? EX4 : 0), 14, 300);

console.log('\n━━ 판정');
for (const [name, s] of [['이륙', s3], ['회전', s4], ['고공', s5]]) {
  for (const [k, a] of Object.entries(s.agg)) {
    if (a.out === 0 && a.behind === 0) ok(`${name} ${k}: 차가 항상 화면 안`); else fail(`${name} ${k}: 화면 밖 ${a.out}프레임, 카메라 뒤 ${a.behind}프레임`);
  }
}
(s5.maxAlt > 25) ? ok(`고공 시험 최고 고도 ${s5.maxAlt.toFixed(1)}m 달성`) : fail(`고공 시험 최고 고도 ${s5.maxAlt.toFixed(1)}m`);

// 6) 제한값: 터널 천장 / 옆 벽 / 부활 시 즉시 이동
{
  const st = newChaseState(); const car = { p: [0, 5.55, -6500], v: [0, 0, -9], q: [0, 0, 0, 1], alt: 5 };
  let r; for (let i = 0; i < 60; i++) r = stepChase(st, 1 / 60, car, { wall: 13.8, ceil: 7.5, ground: 0 });
  (r.pos[1] <= 6.9 + 1e-9) ? ok(`터널 천장 아래로 제한 (카메라 높이 ${r.pos[1].toFixed(2)}m ≤ 6.9m)`) : fail('터널에서 카메라가 천장 위로 올라감');
  const st2 = newChaseState(); const car2 = { p: [12.5, 0.55, -5500], v: [0, 0, -9], q: [0, 0, 0, 1], alt: 0 };
  for (let i = 0; i < 60; i++) r = stepChase(st2, 1 / 60, car2, { wall: 13.0, ceil: 0, ground: 0 });
  (Math.abs(r.pos[0]) <= 12.2 + 1e-9) ? ok(`옆 벽 안쪽으로 제한 (카메라 x ${r.pos[0].toFixed(2)}m ≤ 12.2m)`) : fail('벽 밖으로 카메라가 나감');
  // 구불구불한 경로: 원점에서 멀리(x=900) 가도 카메라가 벽 제한 없이 차를 따라간다 (예전 버그: x=±59m 에 멈춤)
  const st4 = newChaseState(); let r4;
  for (let i = 0; i < 120; i++) r4 = stepChase(st4, 1 / 60, { p: [900 + i * 0.2, 0.55, -300], v: [12, 0, 0], q: [0, Math.sin(-Math.PI / 4), 0, Math.cos(-Math.PI / 4)], alt: 0 }, { wall: Infinity, ground: 0, roadYaw: -Math.PI / 2 });
  const d4 = Math.hypot(r4.pos[0] - 924, r4.pos[2] + 300);
  (d4 < 10) ? ok('멀리 떨어진 경로에서도 카메라가 차 뒤 ' + d4.toFixed(1) + 'm 에 붙어 따라감') : fail('카메라가 차를 놓침 (카메라 x=' + r4.pos[0].toFixed(1) + ')');
  const st3 = newChaseState(); stepChase(st3, 1 / 60, { p: [0, 0.55, -100], v: [0, 0, -9], q: [0, 0, 0, 1], alt: 0 }, {});
  st3.init = false; const r3 = stepChase(st3, 1 / 60, { p: [0, 0.55, -4000], v: [0, 0, 0], q: [0, 0, 0, 1], alt: 0 }, {});
  (Math.abs(r3.pos[2] - (-4000 + CHASE.dist)) < 0.6) ? ok('부활/순간이동 시 카메라가 즉시 따라옴') : fail(`순간이동 후 카메라 z=${r3.pos[2].toFixed(1)}`);
}
// 7) 공중제비(앞구르기)·옆구르기·뒤집힘 중에도 카메라가 뒤로 휙 돌거나 튀지 않는지
{
  const mk = (axis) => (a) => (axis === 'x' ? [Math.sin(a / 2), 0, 0, Math.cos(a / 2)] : [0, 0, Math.sin(a / 2), Math.cos(a / 2)]);
  for (const [name, axis] of [['앞구르기(피치 360°)', 'x'], ['옆구르기(롤 360°)', 'z']]) {
    const st = newChaseState(); let prev = null, maxJump = 0, maxYaw = 0;
    for (let i = 0; i < 360; i++) {
      const q = mk(axis)((i / 360) * Math.PI * 2);
      const r = stepChase(st, 1 / 60, { p: [0, 20, -500], v: [0, 0, -9], q, alt: 20 }, {});
      if (prev) maxJump = Math.max(maxJump, Math.hypot(r.pos[0] - prev[0], r.pos[2] - prev[2])); prev = r.pos;
      maxYaw = Math.max(maxYaw, Math.abs(st.yaw));
    }
    (maxJump < 0.3 && maxYaw < 0.2) ? ok(`${name}: 카메라 최대 점프 ${maxJump.toFixed(3)}m/프레임, 요 변화 ${(maxYaw * 57.3).toFixed(1)}° 이내`) : fail(`${name}: 카메라가 튐 (점프 ${maxJump.toFixed(2)}m, 요 ${(maxYaw * 57.3).toFixed(0)}°)`);
  }
}
// 8) 시야각 보정
{
  const f = Object.fromEntries(Object.entries(ASPECTS).map(([k, a]) => [k, chaseFov(a)]));
  console.log('  세로 시야각:', Object.entries(f).map(([k, v]) => `${k}=${v.toFixed(0)}°`).join('  '));
  (f['16:9'] === 62 && f['4:3'] > f['16:9'] && f['1:1'] <= 76) ? ok('좁은 화면일수록 세로 시야각을 넓혀 좌우 시야 유지') : fail('시야각 보정 이상');
}
console.log(bad ? `\n카메라 검증 실패 ${bad}건` : '\n카메라 검증 통과');
process.exit(bad ? 1 : 0);
