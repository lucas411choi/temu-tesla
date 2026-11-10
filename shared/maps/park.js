// 놀이공원 맵 (구불구불한 루트): 정문 → 먹거리 거리 → 회전목마 광장 → 롤러코스터 랜드(레일 위 주행) → 대관람차·바이킹 → 유령의 집 → 불꽃놀이 성
// 놀이기구와 가판대가 그대로 장애물이 된다. 튜토리얼 안내는 없다(도시 맵 전용).
import { assembleMap } from './city.js';
import { makeBox } from '../collision.js';
import { rotZ } from '../math.js';
import { cityScene, palms } from './scenery.js';
import fuelTable from './park.fuel.js';

const mid = (r) => (r[0] + r[1]) / 2;
const solid = (B, s, x, y, hx, hy, hz, tag, R) => { const b = makeBox(x, y, -s, hx, hy, hz, 0, R || null); b.tag = tag; b.sec = B.cur; B.statics.push(b); return b; };
const BUNT = [9, 14, 19, 24, 29, 34, 39];
const LIGHTS = [8, 12.5, 17, 21.5, 26, 30.5, 35, 39.5];

// ───────── 놀이기구 도우미 (동적 장애물 + 보이는 그대로의 정적 구조물) ─────────
function carouselRide(B, s, o = {}) {
  const W = B.wAt(s), R = o.R || Math.min(11.5, W - 3.5);
  B.carousel(s, { R, n: o.n || 10, w: o.w || 0.45, y: 1.0, bob: 0.9, ph: o.ph || 0, size: [0.32, 0.75, 0.82] });
  if (o.inner) B.carousel(s, { R: R * 0.56, n: 6, w: -0.6, y: 1.0, bob: 0.7, ph: 0.4, size: [0.32, 0.75, 0.82] });
  B.box(s, 0, 3.5, 1.6, 3.5, 1.6, 'carousel');
  B.box(s, 0, 7.4, R + 1.5, 0.6, R + 1.5, 'carousel');
  const bx0 = R + 1.0, bhx = (W - bx0) / 2;
  if (bhx > 0.3) for (const side of [-1, 1]) B.box(s, side * (bx0 + bhx), 1.5, bhx, 1.5, R, 'booth');
  B.add('canopy', { s, R, y: 7.4, w: W, hue: o.hue !== undefined ? o.hue : Math.floor(B.rng() * 360), inner: !!o.inner });
}
function teacups(B, s) {
  const W = B.wAt(s);
  for (const [cx, w, ph] of [[-W * 0.47, 0.75, 0], [W * 0.47, -0.8, 1.2]]) {
    B.carousel(s, { cx, R: 4.3, n: 4, w, y: 0.75, bob: 0, ph, size: [1.35, 0.75, 1.35], kind: 'cup' });
    B.box(s, cx, 0.35, 0.8, 0.35, 0.8, 'cup');
  }
  B.add('cupbase', { s, w: W });
}
function wheelRide(B, s, o = {}) {
  const R = o.R || 19, cy = o.cy || 22, X = B.wAt(s) + 2;
  B.wheel(s, { R, cy, n: o.n || 12, w: o.w || 0.12, ph: o.ph || 0, hue: o.hue || 200 });
  for (const dz of [-3.2, 3.2]) for (const side of [-1, 1]) {
    const x0 = side * X, len = Math.hypot(x0, cy), ang = Math.atan2(cy, x0);
    solid(B, s + dz, x0 / 2, cy / 2, len / 2, 0.35, 0.35, 'wheel', rotZ(ang));
  }
  solid(B, s, 0, cy, 0.6, 0.6, 3.6, 'wheel');
  B.add('wheelbase', { s, R, cy, X, hue: o.hue || 200 });
}
function vikingRide(B, s, o = {}) {
  const py = 13, L = 11, X = B.wAt(s) + 2;
  B.swing(s, { py, L, amp: o.amp || 1.0, per: o.per || 5.2, ph: o.ph || 0, hw: 5.5 });
  for (const dz of [-3.4, 3.4]) for (const side of [-1, 1]) {
    const x0 = side * X, len = Math.hypot(x0, py), ang = Math.atan2(py, x0);
    solid(B, s + dz, x0 / 2, py / 2, len / 2, 0.3, 0.3, 'swing', rotZ(ang));
  }
  solid(B, s, 0, py, 0.4, 0.4, 3.6, 'swing');
  B.add('swingframe', { s, py, X });
}
function swinger(B, s) {
  const W = B.wAt(s);
  B.carousel(s, { R: 9.5, n: 12, w: 0.7, y: 0.6, bob: 3.2, size: [0.5, 0.55, 0.5], kind: 'chair' });
  B.box(s, 0, 7, 1.2, 7, 1.2, 'swinger'); B.box(s, 0, 14.6, 11, 0.6, 11, 'swinger');
  const bx0 = 11.2, bhx = (W - bx0) / 2;
  if (bhx > 0.3) for (const side of [-1, 1]) B.box(s, side * (bx0 + bhx), 1.5, bhx, 1.5, 10.5, 'booth');
  B.add('swinger', { s, R: 9.5, y: 14.6, w: W });
}
// 머리 위를 지나는 고가 코스터 선로 + 열차
function coasterTrack(B, s, y, o = {}) {
  const W = B.wAt(s) + 4;
  B.box(s, 0, y - 0.25, W, 0.25, 0.8, 'track');
  for (const side of [-1, 1]) B.box(s, side * (W - 1.2), (y - 0.5) / 2, 0.4, (y - 0.5) / 2, 0.4, 'track');
  B.coaster(s, { y, v: o.v || 24, P: o.P || 5.5, ph: o.ph || 0, dir: o.dir || 1, len: 2 * W + 20, cars: 5, hue: o.hue !== undefined ? o.hue : 330 });
  B.add('track', { s, y, w: W, hue: o.hue !== undefined ? o.hue : 330 });
}
// 땅 위 건널목 코스터 (선로 바닥판 = 건널목 양옆으로 이어지는 발판)
function coasterCrossing(B, s, o = {}) {
  const W = B.wAt(s) + 22;
  B.platform(s, 0, 3.2, W, 0, { surf: 'rail' });
  B.coaster(s, { y: 0.02, v: o.v || 22, P: o.P || 6, ph: o.ph || 0, dir: o.dir || 1, len: 2 * W, cars: 4, hue: o.hue !== undefined ? o.hue : 50 });
  B.add('track', { s, y: 0.02, w: W, ground: true, hue: o.hue !== undefined ? o.hue : 50 });
}
// 유령의 집 입구/출구 정면(천장 위 벽 + 양옆 기둥) = 충돌
function hauntSolid(B, s, dir) {
  const W = 11, off = dir > 0 ? 0.2 : -0.2;
  solid(B, s - off, 0, (7 + 24) / 2, W, (24 - 7) / 2, 0.6, 'building');
  for (const sd of [-1, 1]) solid(B, s - off, sd * (W - 1.5), 3.5, 1.5, 3.5, 0.6, 'building');
}
const balloons = (B, s, o = {}) => B.drone(s, { cx: 0, cy: o.cy || 1.6, ax: o.ax || Math.max(2, B.wAt(s) - 2), ay: 0.6, az: o.az || 4, per: o.per || 9, ph: o.ph || 0, r: 1.15, kind: 'balloon', hue: Math.floor(B.rng() * 360) });

// ───────── 1. 정문 광장 & 메인 스트리트 ─────────
function p1(B) {
  const s0 = B.s;
  B.run(70, { w: 9, surf: 'plaza' });
  B.checkpoint(14, { noPad: true }); B.pad(0, 56);
  B.add('parkentry', { s: 30, w: 9 }); B.box(30, 0, 19, 10, 3, 1.2, 'gate');
  for (const sd of [-1, 1]) B.box(30, sd * 10, 11, 1.0, 11, 1.2, 'gate');
  const r1 = B.run(70);
  B.hop(r1[0] + 20, 1.2, { label: '개찰구 1.2m', style: 'turnstile', v0: 8 });
  B.boxSlalom(r1[0] + 38, r1[1] - 8, { kinds: [[1.0, 0.9, 1.6, 'cart']], step: 14, gapW: 8 });
  B.turn(90);
  const r2 = B.run(70);
  balloons(B, r2[0] + 22); balloons(B, r2[0] + 40, { ph: 3 });
  B.lines(r2[0] + 58, BUNT, { kind: 'bunting' });
  B.turn(-90);
  B.plaza(44, 9);
  const r3 = B.run(70);
  B.platform(r3[0] + 36, 0, 14, 40, 0, { surf: 'plaza' });
  B.crossTraffic(r3[0] + 32, { vk: 'bus', v: 9, P: 10, ph: 0, xs: -40, len: 80, color: [0.9, 0.3, 0.5] });
  B.crossTraffic(r3[0] + 40, { vk: 'bus', v: 10, P: 10, ph: 5, xs: 40, dir: -1, len: 80, color: [0.3, 0.6, 0.95] });
  B.lines(r3[0] + 10, BUNT, { kind: 'bunting' });
  B.turn(-45);
  const r4 = B.run(60);
  B.hop(r4[0] + 30, 2.4, { label: '꽃 화단 2.4m', style: 'hedge' });
  B.lines(r4[0] + 50, LIGHTS, { kind: 'lights' });
  B.turn(45);
  B.plaza(44, 9);
  B.run(36);
  B.jump(22, { label: '분수 연못 22m', style: 'pool' });
  B.run(40);
  B.turn(90);
  const r6 = B.run(70);
  B.boxSlalom(r6[0] + 8, r6[0] + 38, { kinds: [[1.4, 0.45, 0.9, 'picnic']], step: 12, gapW: 8 });
  B.hop(r6[0] + 56, 2.0, { label: '화단 2.0m', style: 'hedge' });
  B.plaza(44, 9);
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'toon'));
}

// ───────── 2. 먹거리 거리 (가판대 사이 꼬불꼬불) ─────────
function p2(B) {
  const s0 = B.s;
  B.plaza(44, 7, { surf: 'plaza' });
  const r1 = B.run(60, { w: 6, surf: 'plaza' });
  B.boxSlalom(r1[0] + 10, r1[1] - 12, { kinds: [[1.0, 0.95, 1.7, 'cart'], [1.3, 1.1, 2.4, 'truck']], step: 16, gapW: 7 });
  B.lines(r1[0] + 30, LIGHTS, { kind: 'lights' });
  B.turn(60);
  const r2 = B.run(50);
  [[12, -3], [24, 2], [36, -1]].forEach(([d, x], i) => B.vents(r2[0] + d, { kind: 'popcorn', x0: x, H: 6, w: 2.2, P: 4.4, on: 1.2, warn: 1.1, ph: i * 1.1 }));
  B.turn(-60);
  const r3 = B.run(60);
  B.barrels(r3[0] + 16, { dir: 1, v: 7, P: 4.6, ph: 0, r: 1.1, kind: 'donut' });
  B.barrels(r3[0] + 36, { dir: -1, v: 7.5, P: 4.6, ph: 2.1, r: 1.1, kind: 'donut', xs: B.wAt(r3[0]) + 1 });
  B.lines(r3[0] + 50, LIGHTS, { kind: 'lights' });
  B.turn(-60);
  const r4 = B.run(44);
  B.hop(mid(r4), 3.0, { label: '푸드트럭 담장 3.0m', style: 'stallwall' });
  B.turn(60);
  B.plaza(44, 7);
  B.run(14, { w: 6 });
  B.stepUp(3, { style: 'terrace', label: '푸드코트 테라스 3m' });
  const r5 = B.run(44, { w: 6, surf: 'terrace' });
  B.vents(r5[0] + 28, { kind: 'water', n: 3, x0: -3.5, dx: 3.5, H: 5.5, w: 1.8, P: 4.0, on: 1.3, warn: 0.9, phStep: 0.7 });
  B.ramp(30, -3, { w: 4, surf: 'stairs' });
  B.turn(90);
  const r6 = B.run(70, { w: 6, surf: 'plaza' });
  [[12, -2], [26, 2]].forEach(([d, x], i) => B.vents(r6[0] + d, { kind: 'popcorn', x0: x, H: 7, w: 2.6, P: 5, on: 1.3, warn: 1.3, ph: i * 1.6 }));
  balloons(B, r6[0] + 40, { ph: 0.6 });
  B.hop(r6[0] + 56, 1.8, { label: '테이블 담장 1.8m', style: 'stallwall' });
  B.plaza(44, 7);
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'stall', { gap: 0.4 }));
}

// ───────── 3. 회전목마 광장 ─────────
function p3(B) {
  const s0 = B.s;
  B.plaza(44, 12, { surf: 'plaza' });
  const r1 = B.run(50, { w: 15 });
  carouselRide(B, mid(r1), { inner: true, hue: 330 });
  B.turn(-90);
  const r2 = B.run(40, { w: 15 });
  teacups(B, mid(r2));
  B.turn(90);
  B.plaza(44, 12);
  const r3 = B.run(50, { w: 15 });
  swinger(B, mid(r3));
  B.turn(90);
  const r4 = B.run(44, { w: 8 });
  B.hop(r4[0] + 16, 2.2, { label: '회전목마 울타리 2.2m', style: 'fence' });
  B.lines(r4[0] + 34, BUNT, { kind: 'bunting' });
  B.turn(-90);
  const r5 = B.run(50, { w: 14 });
  carouselRide(B, mid(r5), { R: 10, n: 8, w: -0.5, hue: 200 });
  B.plaza(44, 12);
  B.run(30, { w: 8 });
  B.jump(26, { label: '분수 연못 26m', style: 'pool' });
  B.run(40);
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'park'));
}

// ───────── 4. 롤러코스터 랜드: 코스터 레일 위를 직접 달린다 ─────────
function p4(B) {
  const s0 = B.s;
  B.plaza(44, 9, { surf: 'plaza' });
  const r1 = B.run(70, { w: 9 });
  coasterCrossing(B, r1[0] + 22, { v: 22, P: 6, ph: 0 });
  coasterCrossing(B, r1[0] + 48, { v: 24, P: 6, ph: 3, dir: -1, hue: 200 });
  // 레일 위로: 오르막 → 커브 → 내리막 → 다시 오르막 (폭 4.8m)
  const c0 = B.s;
  B.ramp(40, 12, { w: 2.4, surf: 'coaster' });
  B.turn(45); B.run(30);
  B.turn(45); B.ramp(30, -6);
  B.turn(-90); B.ramp(30, 6);
  B.run(20);
  B.turn(-45); B.ramp(44, -12);
  B.add('coasterrail', { s0: c0, s1: B.s });
  B.plaza(44, 9, { surf: 'plaza' });
  const r2 = B.run(60, { w: 9 });
  coasterTrack(B, r2[0] + 14, 10, { ph: 0, hue: 330 }); coasterTrack(B, r2[0] + 15, 21, { ph: 2, dir: -1, hue: 50 }); coasterTrack(B, r2[0] + 14, 32, { ph: 1, hue: 140 });
  for (const [d, x] of [[34, -5], [34, 2], [44, -1], [44, 5]]) B.pillar(r2[0] + d, x, 1.4, 9.5, { style: 'track' });
  const r3 = B.run(60);
  B.portal(r3[0] + 36, 6, 13, { label: '코스터 역사 창문 6~13m', style: 'station', v0: 8 });
  B.turn(90);
  B.plaza(44, 9);
  B.run(14, { w: 7 });
  B.stepUp(4, { style: 'station', label: '탑승장 플랫폼 4m' });
  B.run(40, { w: 7, surf: 'station' });
  B.jump(14, { dy: -4, label: '플랫폼에서 14m' });
  const r5 = B.run(70, { w: 9, surf: 'plaza' });
  coasterCrossing(B, r5[0] + 16, { v: 22, P: 6, ph: 2, hue: 120 });
  for (const [d, x] of [[32, -5], [32, 2], [42, -1], [42, 5]]) B.pillar(r5[0] + d, x, 1.4, 12, { style: 'track' });
  B.hop(r5[0] + 58, 2.4, { label: '코스터 펜스 2.4m', style: 'fence' });
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'park', { tex: 4, gap: 4, jitter: 8 }));
}

// ───────── 5. 대관람차 & 바이킹 & 자이로드롭 ─────────
function p5(B) {
  const s0 = B.s;
  B.plaza(44, 12, { surf: 'plaza' });
  const r1 = B.run(50, { w: 12 });
  wheelRide(B, mid(r1), { R: 19, cy: 22, w: 0.12, hue: 200 });
  B.turn(45);
  const r2 = B.run(44);
  vikingRide(B, mid(r2), { per: 5.2 });
  B.turn(-45);
  B.plaza(44, 12);
  const r3 = B.run(70, { w: 10 });
  for (const [d, ph] of [[20, 0], [48, 3.5]]) {
    B.ceilPlate(r3[0] + d, { d: 6, yTop: 30, yHigh: 24, yLow: 0, h: 2.4, P: 7, hold: 3.2, drop: 0.9, stay: 0.8, rise: 2.1, ph, kind: 'drop' });
    for (const side of [-1, 1]) B.box(r3[0] + d, side * 11.6, 16, 1.2, 16, 1.2, 'droptower');
    B.add('droptower', { s: r3[0] + d, top: 32, X: 11.6 });
  }
  B.turn(-90);
  B.run(30, { w: 8 });
  B.jump(30, { label: '호수 위 점프 30m', style: 'lake' });
  B.run(40);
  B.turn(90);
  const r4 = B.run(50, { w: 12 });
  wheelRide(B, mid(r4), { R: 14, cy: 16.5, w: -0.16, n: 10, hue: 330 });
  B.plaza(44, 12);
  const r5 = B.run(44);
  vikingRide(B, mid(r5), { per: 4.6, ph: 1.3, amp: 1.1 });
  B.turn(45);
  const r6 = B.run(70);
  wheelRide(B, r6[0] + 22, { R: 16, cy: 19, w: 0.15, n: 10, hue: 60, ph: 0.7 });
  B.hop(r6[0] + 54, 3.0, { label: '대관람차 펜스 3.0m', style: 'fence' });
  B.plaza(44, 10);
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'park', { gap: 6, jitter: 10 }));
}

// ───────── 6. 유령의 집 (실내 통로 + 꺾이는 곳마다 어두운 안뜰) ─────────
function p6(B) {
  const s0 = B.s;
  B.plaza(44, 8, { surf: 'plaza' });
  const t1 = B.run(110, { w: 7, surf: 'haunt' });
  B.ceiling(t1[0] + 2, t1[1] - 5, 7.0, { style: 'haunt' });
  B.add('hauntface', { s: t1[0] + 2, dir: 1, w: 7 });
  hauntSolid(B, t1[0] + 2, 1);
  [[24, -3, 0], [48, 3, 2.5], [72, -1, 5]].forEach(([d, cx, ph]) => B.drone(t1[0] + d, { cx, cy: 2.0, ax: 4, ay: 0.9, az: 4, per: 7, ph, r: 1.0, kind: 'ghost' }));
  B.turn(90);
  const t2 = B.run(100);
  B.ceiling(t2[0] + 6, t2[1] - 5, 7.0, { style: 'haunt' });
  [-4.5, 0, 4.5].forEach((px, i) => B.ball(t2[0] + 22, { axis: 'z', px, py: 6.6, L: 5, amp: 0.85, per: 3.2, ph: i * 0.8, r: 1.1, kind: 'coffin' }));
  [-2.2, 2.2].forEach((px, i) => B.ball(t2[0] + 42, { axis: 'z', px, py: 6.6, L: 5, amp: 0.85, per: 3.6, ph: 1.6 + i * 0.9, r: 1.1, kind: 'coffin' }));
  B.ceilPlate(t2[0] + 66, { d: 4, yTop: 7, yHigh: 5.0, yLow: 0, P: 6, hold: 2.6, drop: 0.3, stay: 0.8, rise: 1.6, ph: 0, kind: 'crusher' });
  B.ceilPlate(t2[0] + 84, { d: 4, yTop: 7, yHigh: 5.0, yLow: 0, P: 6, hold: 2.6, drop: 0.3, stay: 0.8, rise: 1.6, ph: 3, kind: 'crusher' });
  B.turn(-90);
  const pz = B.plaza(44, 7, { surf: 'haunt' });
  B.ceiling(pz[0] + 6, pz[1], 7.0, { style: 'haunt', overPads: true });
  B.run(24);
  B.jump(10, { label: '함정 바닥 10m', style: 'trap' });
  const t5 = B.run(90);
  B.ceiling(pz[1], t5[1] - 5, 7.0, { style: 'haunt', overPads: true });
  B.birds(t5[0] + 24, { y0: 1.4, pat: 'sine', per: 5.6, n: 7, spread: 1.4, kind: 'bat' });
  [44, 58].forEach((d, i) => B.laserTrip(t5[0] + d, { ys: [0.55, 1.45], blink: { P: 3.4, on: 1.4, warn: 0.8, ph: -i * 1.7 } }));
  B.hop(t5[0] + 76, 1.4, { wire: 3.0, label: '묘비 담장 1.4m', style: 'grave' });
  B.turn(-90);
  const t6 = B.run(100);
  B.ceiling(t6[0] + 6, t6[1] - 2, 7.0, { style: 'haunt' });
  B.saw(t6[0] + 24, { per: 5.2, ph: 0.2 });
  B.drone(t6[0] + 40, { cx: 0, cy: 2.2, ax: 4.5, ay: 1, az: 3, per: 6.5, ph: 3, r: 1.0, kind: 'ghost' });
  B.saw(t6[0] + 56, { per: 4.6, ph: 0.6 });
  B.hop(t6[0] + 80, 1.2, { wire: 3.2, label: '유령의 집 출구 1.2m', style: 'grave' });
  B.add('hauntface', { s: t6[1] - 2, dir: -1, w: 7 });
  hauntSolid(B, t6[1] - 2, -1);
  B.turn(90);
  B.plaza(44, 8, { surf: 'plaza' });
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'castle', { tex: 2, hmin: 14, hmax: 24, gap: 1.2 }));
}

// ───────── 7. 불꽃놀이 성 (성벽 위 길 → 해자 → 성문) ─────────
function p7(B) {
  const s0 = B.s;
  B.plaza(44, 8, { surf: 'plaza' });
  B.run(30, { w: 8, surf: 'plaza' });
  B.jump(26, { label: '해자 도개교 26m', style: 'moat' });
  const r1 = B.run(60, { w: 8, surf: 'stone' });
  B.fireRain(r1[0] + 8, r1[1] - 16, { cnt: 3, P: 3.2, fall: 1.5, kind: 'firework' });
  B.lines(r1[1] - 6, BUNT, { kind: 'bunting' });
  B.turn(-90);
  B.ramp(40, 8, { w: 3, surf: 'stone' });
  const r2 = B.run(60, { w: 3 });
  B.barrels(r2[0] + 18, { dir: 1, v: 7, P: 3.6, ph: 0, r: 0.9, kind: 'cannon' });
  B.barrels(r2[0] + 38, { dir: -1, v: 7.5, P: 3.6, ph: 1.8, r: 0.9, kind: 'cannon', xs: B.wAt(r2[0]) + 1 });
  B.turn(90);
  B.run(40, { w: 3 });
  B.jump(14, { dy: -2, label: '성탑 사이 14m' });
  B.run(30, { w: 5 });
  B.ramp(40, -6, { w: 5 });
  B.plaza(44, 8, { surf: 'stone' });
  const r4 = B.run(70, { w: 8 });
  B.portal(r4[0] + 40, 10, 16, { label: '성벽 창문 10~16m', style: 'castle', v0: 8 });
  B.turn(90);
  const r5 = B.run(60);
  B.press(r5[0] + 20, { d: 5, hgt: 7, P: 8, open: 3.5, close: 0.7, closed: 1.3, openT: 1.4, ph: 0, kind: 'castle' });
  B.fireRain(r5[0] + 34, r5[1] - 4, { cnt: 2, P: 3.0, fall: 1.4, kind: 'firework' });
  B.plaza(44, 8);
  const r6 = B.run(60);
  B.skybridge(r6[0] + 8, 14, 4, { hue: 45 }); B.skybridge(r6[0] + 9, 26, 4, { hue: 300 }); B.skybridge(r6[0] + 8, 37, 3.5, { hue: 200 });
  B.hop(r6[0] + 44, 4.0, { spikes: 0.8, label: '최종 관문: 성문 4.0m', style: 'castle' });
  B.run(50, { w: 8 });
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'castle'));
}

const SECTIONS = [
  { name: '정문 광장', style: 'parkgate', wall: 'hedge', floor: 'grass', fn: p1 },
  { name: '먹거리 거리', style: 'food', floor: 'grass', fn: p2 },
  { name: '회전목마 광장', style: 'carousel', floor: 'grass', fn: p3 },
  { name: '롤러코스터 랜드', style: 'coaster', floor: 'grass', fn: p4 },
  { name: '대관람차 & 바이킹', style: 'wheel', floor: 'water', fn: p5 },
  { name: '유령의 집', style: 'haunt', floor: 'void', fn: p6 },
  { name: '불꽃놀이 성', style: 'castle', floor: 'water', gap: 'moat', fn: p7 },
];

// 낮 → 노을 → 밤 → 불꽃놀이
export const PARK_ENV = [
  { at: 0,    top: 0x3f7fd8, hor: 0xbfe2ff, fog: 0xa8c8e8, fogD: 0.0030, sun: 0xfff2d8, sunI: 1.9, hemi: 0xcfe4ff, hemiG: 0x6a7a5a, hemiI: 1.25, lamp: 0.15, win: 0.15, exp: 1.0, rain: 0, bloom: 0.4 },
  { at: 0.3,  top: 0x4a74c8, hor: 0xffd0a0, fog: 0xc0b0b8, fogD: 0.0032, sun: 0xffd8a8, sunI: 1.7, hemi: 0xd8d8f0, hemiG: 0x6a5a58, hemiI: 1.15, lamp: 0.3, win: 0.25, exp: 1.0, rain: 0, bloom: 0.45 },
  { at: 0.58, top: 0x2a3a88, hor: 0xff8a5a, fog: 0x7a5a78, fogD: 0.0038, sun: 0xff9a68, sunI: 1.3, hemi: 0x9a90d0, hemiG: 0x4a3a48, hemiI: 1.0, lamp: 0.7, win: 0.6, exp: 1.0, rain: 0, bloom: 0.6 },
  { at: 0.72, top: 0x0c0a22, hor: 0x2a1a4a, fog: 0x140c26, fogD: 0.0110, sun: 0x8a70c0, sunI: 0.45, hemi: 0x5a4a8a, hemiG: 0x140c20, hemiI: 0.8, lamp: 1.0, win: 1.0, exp: 1.05, rain: 0, bloom: 0.85 },
  { at: 0.86, top: 0x0a0c2a, hor: 0x3a2060, fog: 0x1a1236, fogD: 0.0050, sun: 0xb08aff, sunI: 0.75, hemi: 0x6a60b0, hemiG: 0x1a1430, hemiI: 0.85, lamp: 1.0, win: 1.0, exp: 1.0, rain: 0, bloom: 0.9 },
  { at: 1,    top: 0x0a0c2a, hor: 0x4a2a70, fog: 0x1a1236, fogD: 0.0045, sun: 0xc09aff, sunI: 0.8, hemi: 0x7a70c0, hemiG: 0x1a1430, hemiI: 0.9, lamp: 1.0, win: 1.0, exp: 1.0, rain: 0, bloom: 0.95 },
];

export function buildPark() {
  return assembleMap({ id: 'park', name: '놀이공원', seed: 20261111, sections: SECTIONS, env: PARK_ENV, fuel: fuelTable, floorY: -18, extra: { finishStyle: 'castle' } });
}
void palms;
