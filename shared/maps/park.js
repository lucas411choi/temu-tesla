// 놀이공원 맵: 7개 테마 구역, 6,300m. 정문 → 먹거리 거리 → 회전목마 광장 → 롤러코스터 랜드 → 대관람차·바이킹 → 유령의 집 → 불꽃놀이 성
// 놀이기구(회전목마/찻잔/코스터/관람차/바이킹/자이로드롭)와 가판대가 그대로 장애물이 된다.
import { assembleMap } from './city.js';
import { makeBox } from '../collision.js';
import { rotZ } from '../math.js';
import fuelTable from './park.fuel.js';

export const PARK_LENGTH = 6300;
const mid = (b) => (b[0] + b[1]) / 2;
const CORR = 16.6;
const solid = (B, s, x, y, hx, hy, hz, tag, R) => { const b = makeBox(x, y, -s, hx, hy, hz, 0, R || null); b.tag = tag; b.sec = B.cur; B.statics.push(b); return b; };

const FOODS = ['떡볶이', '츄러스', '솜사탕', '핫도그', '팝콘', '아이스크림', '닭꼬치', '와플', '탕후루', '레모네이드', '타코야키', '붕어빵'];
const BUNT = [9, 14, 19, 24, 29, 34, 39];
const LIGHTS = [8, 12.5, 17, 21.5, 26, 30.5, 35, 39.5];

// ───────── 풍경 도우미 ─────────
// 동화풍 상점가(저층) — 옆벽 높이 13m + 그보다 높은 부분은 건물 충돌 상자
function mainStreet(B, s0, s1, o = {}) {
  const rng = B.rng;
  B.ground(s0, s1, { wallTop: 13 });
  for (const side of [-1, 1]) {
    let s = s0;
    while (s < s1) {
      const w = Math.min(rng.range(9, 15), s1 - s + 3);
      const d = B.building(s + w / 2, side, w, rng.range(12, 18), rng.range(13.5, 22), { style: o.style || 'toon', flat: true, tex: 1, shop: true });
      if (o.food) d.food = FOODS[Math.floor(rng() * FOODS.length)];
      d.hue = Math.floor(rng() * 360);
      s += w;
    }
  }
}
// 높은 테마 파빌리온/텐트 (46m 이상 → 옆벽이 전부 막는다)
// tex 4 = 서커스/파빌리온 줄무늬(창문 없음), tex 5 = 성벽 돌
function pavilions(B, s0, s1, o = {}) {
  for (const side of [-1, 1]) B.buildingRow(s0, s1, side, { style: o.style || 'toon', tex: o.tex !== undefined ? o.tex : 4, hmin: o.hmin || 46, hmax: o.hmax || 72, wmin: 16, wmax: 30, neon: 0.6 });
}

// ───────── 놀이기구 도우미 (동적 장애물 + 보이는 그대로의 정적 구조물) ─────────
function carouselRide(B, s, o = {}) {
  const R = o.R || 11.5;
  B.carousel(s, { R, n: o.n || 10, w: o.w || 0.45, y: 1.0, bob: 0.9, ph: o.ph || 0, size: [0.32, 0.75, 0.82] });
  if (o.inner) B.carousel(s, { R: 6.5, n: 6, w: -0.6, y: 1.0, bob: 0.7, ph: 0.4, size: [0.32, 0.75, 0.82] });
  B.box(s, 0, 3.5, 1.6, 3.5, 1.6, 'carousel');                       // 가운데 기둥
  B.box(s, 0, 7.4, R + 1.5, 0.6, R + 1.5, 'carousel');              // 지붕(캐노피)
  const bx0 = Math.min(13, R + 1.0), bhx = (CORR - bx0) / 2;
  for (const side of [-1, 1]) B.box(s, side * (bx0 + bhx), 1.5, bhx, 1.5, R, 'booth');   // 옆 매표소 (가장자리 우회 차단)
  B.add('canopy', { s, R, y: 7.4, hue: o.hue !== undefined ? o.hue : Math.floor(B.rng() * 360), inner: !!o.inner });
}
function teacups(B, s, o = {}) {
  for (const [cx, w, ph] of [[-7, 0.75, 0], [7, -0.8, 1.2]]) {
    B.carousel(s, { cx, R: 4.3, n: 4, w, y: 0.75, bob: 0, ph, size: [1.35, 0.75, 1.35], kind: 'cup' });
    B.box(s, cx, 0.35, 0.8, 0.35, 0.8, 'cup');
  }
  for (const side of [-1, 1]) B.box(s, side * 15.4, 0.8, 1.2, 0.8, 7.0, 'planter');
  B.add('cupbase', { s });
}
function wheelRide(B, s, o = {}) {
  const R = o.R || 19, cy = o.cy || 22;
  B.wheel(s, { R, cy, n: o.n || 12, w: o.w || 0.12, ph: o.ph || 0, hue: o.hue || 200 });
  // A자 다리 (바퀴 앞뒤 3.2m): 허브에서 도로 가장자리 바깥(±15.5)까지
  for (const dz of [-3.2, 3.2]) for (const side of [-1, 1]) {
    const x0 = side * 15.5, len = Math.hypot(x0, cy), ang = Math.atan2(cy, x0);
    solid(B, s + dz, x0 / 2, cy / 2, len / 2, 0.35, 0.35, 'wheel', rotZ(ang));
  }
  solid(B, s, 0, cy, 0.6, 0.6, 3.6, 'wheel');                          // 허브 축
  B.add('wheelbase', { s, R, cy, hue: o.hue || 200 });
}
function vikingRide(B, s, o = {}) {
  const py = 13, L = 11;
  B.swing(s, { py, L, amp: o.amp || 1.0, per: o.per || 5.2, ph: o.ph || 0, hw: 5.5 });
  for (const dz of [-3.4, 3.4]) for (const side of [-1, 1]) {
    const x0 = side * 15.2, len = Math.hypot(x0, py), ang = Math.atan2(py, x0);
    solid(B, s + dz, x0 / 2, py / 2, len / 2, 0.3, 0.3, 'swing', rotZ(ang));
  }
  solid(B, s, 0, py, 0.4, 0.4, 3.6, 'swing');
  B.add('swingframe', { s, py });
}
// 고가 코스터 선로(정적) + 그 위를 지나는 열차(동적)
function coasterTrack(B, s, y, o = {}) {
  B.box(s, 0, y - 0.25, CORR + 4, 0.25, 0.8, 'track');
  for (const side of [-1, 1]) B.box(s, side * 15.2, (y - 0.5) / 2, 0.4, (y - 0.5) / 2, 0.4, 'track');
  B.coaster(s, { y, v: o.v || 24, P: o.P || 5.5, ph: o.ph || 0, dir: o.dir || 1, len: 80, cars: o.cars || 5, hue: o.hue });
  B.add('track', { s, y, hue: o.hue !== undefined ? o.hue : 330 });
}
// 지면 건널목 코스터 (건널목 차단기 없이 빠르게 지나감)
function coasterCrossing(B, s, o = {}) {
  B.coaster(s, { y: 0.02, v: o.v || 22, P: o.P || 6, ph: o.ph || 0, dir: o.dir || 1, len: 80, cars: o.cars || 4, hue: o.hue });
  B.add('track', { s, y: 0.02, ground: true, hue: o.hue !== undefined ? o.hue : 50 });
}
function balloons(B, s, o = {}) { return B.drone(s, { cx: 0, cy: o.cy || 1.6, ax: o.ax || 10, ay: 0.6, az: o.az || 4, per: o.per || 9, ph: o.ph || 0, r: 1.15, kind: 'balloon', hue: Math.floor(B.rng() * 360) }); }

// ───────── 구역 1: 정문 광장 & 메인 스트리트 ─────────
function p1(B, bk) {
  mainStreet(B, -40, 900);
  B.add('parkentry', { s: bk[0][0] + 2 });
  B.box(bk[0][0] + 2, 0, 19, CORR + 1, 3, 1.2, 'gate');
  B.street(0, 900, { lamps: true, lampEvery: 30, trees: false, intersections: [] });
  B.hint(0, 120, 'start');
  B.hop(bk[0][0] + 22, 1.2, { label: '개찰구 1.2m', style: 'turnstile', v0: 8 });
  B.boxSlalom(bk[0][0] + 40, bk[0][1] - 8, { kinds: [[1.0, 0.9, 1.6, 'cart']], step: 14, gapW: 9 });
  balloons(B, bk[1][0] + 18, { ph: 0 }); balloons(B, bk[1][0] + 36, { ph: 3, ax: 9 });
  B.lines(bk[1][0] + 46, BUNT, { kind: 'bunting' });
  B.crossTraffic(mid(bk[2]) - 8, { vk: 'bus', v: 9, P: 10, ph: 0, color: [0.9, 0.3, 0.5] });
  B.crossTraffic(mid(bk[2]) + 8, { vk: 'bus', v: 10, P: 10, ph: 5, xs: 48, dir: -1, color: [0.3, 0.6, 0.95] });
  B.lines(bk[2][0] + 6, BUNT, { kind: 'bunting' });
  B.hop(mid(bk[3]), 2.4, { label: '꽃 화단 2.4m', style: 'hedge' });
  B.lines(bk[3][1] - 6, LIGHTS, { kind: 'lights' });
  balloons(B, bk[4][0] + 14, { ph: 1 }); balloons(B, bk[4][0] + 32, { ph: 4, ax: 11 }); balloons(B, bk[4][0] + 52, { ph: 2.2 });
  B.lines(bk[4][0] + 62, BUNT, { kind: 'bunting' });
  B.gapFlight(bk[5][0] + 12, 22, { label: '분수 연못 22m', style: 'pool', v0: 9 });
  B.boxSlalom(bk[6][0] + 8, bk[6][1] - 14, { kinds: [[1.4, 0.45, 0.9, 'picnic']], step: 12, gapW: 8.5 });
  B.lines(bk[6][1] - 6, LIGHTS, { kind: 'lights' });
  B.hop(mid(bk[7]), 2.0, { label: '화단 2.0m', style: 'hedge' });
}

// ───────── 구역 2: 먹거리 거리 (가판대) ─────────
function p2(B, bk) {
  mainStreet(B, 900, 1800, { style: 'stall', food: true });
  B.street(900, 1800, { lamps: true, lampEvery: 26, trees: false, intersections: [] });
  B.boxSlalom(bk[0][0] + 8, bk[0][1] - 10, { kinds: [[1.0, 0.95, 1.7, 'cart'], [1.3, 1.1, 2.4, 'truck']], step: 16, gapW: 9 });
  B.lines(bk[0][0] + 36, LIGHTS, { kind: 'lights' });
  [[10, -8], [20, 0], [30, 8], [40, -4]].forEach(([d, x], i) => B.vents(bk[1][0] + d, { kind: 'popcorn', x0: x, H: 6, w: 2.2, P: 4.4, on: 1.2, warn: 1.1, ph: i * 1.1 }));
  B.barrels(bk[2][0] + 14, { xs: -17, dir: 1, v: 7, len: 34, P: 4.6, ph: 0, r: 1.1, kind: 'donut' });
  B.barrels(bk[2][0] + 34, { xs: 17, dir: -1, v: 7.5, len: 34, P: 4.6, ph: 2.1, r: 1.1, kind: 'donut' });
  B.barrels(bk[2][0] + 54, { xs: -17, dir: 1, v: 8, len: 34, P: 4.6, ph: 1.0, r: 1.1, kind: 'donut' });
  B.lines(bk[2][0] + 24, LIGHTS, { kind: 'lights' });
  B.hop(mid(bk[3]), 3.0, { label: '푸드트럭 담장 3.0m', style: 'stallwall' });
  B.lines(bk[3][1] - 5, BUNT, { kind: 'bunting' });
  B.vents(bk[4][0] + 16, { kind: 'water', n: 5, x0: -10, dx: 5, H: 5.5, w: 1.8, P: 4.0, on: 1.3, warn: 0.9, phStep: 0.7 });
  B.vents(bk[4][0] + 44, { kind: 'water', n: 5, x0: -10, dx: 5, H: 5.5, w: 1.8, P: 4.0, on: 1.3, warn: 0.9, phStep: -0.7, ph: 1.5 });
  B.lines(bk[4][0] + 30, LIGHTS, { kind: 'lights' });
  B.stepFlight(bk[5][0] + 6, 36, 3.0, { label: '푸드코트 테라스 3m', style: 'terrace' });
  [[12, -6], [26, 6], [40, 0]].forEach(([d, x], i) => B.vents(bk[6][0] + d, { kind: 'popcorn', x0: x, H: 7, w: 2.6, P: 5, on: 1.3, warn: 1.3, ph: i * 1.6 }));
  balloons(B, bk[6][0] + 50, { ph: 0.6 });
  B.lines(bk[6][0] + 32, BUNT, { kind: 'bunting' });
  B.hop(mid(bk[7]), 1.8, { label: '테이블 담장 1.8m', style: 'stallwall' });
}

// ───────── 구역 3: 회전목마 광장 ─────────
function p3(B, bk) {
  pavilions(B, 1800, 2700, { hmin: 48, hmax: 70 });
  B.street(1800, 2700, { lamps: true, lampEvery: 34, trees: false, intersections: [] });
  carouselRide(B, bk[0][0] + 35, { inner: true, hue: 330 });
  teacups(B, mid(bk[1]));
  B.hop(bk[2][0] + 18, 2.2, { label: '회전목마 울타리 2.2m', style: 'fence' });
  B.lines(bk[2][0] + 34, BUNT, { kind: 'bunting' });
  balloons(B, bk[2][0] + 52, { ph: 1.4 });
  carouselRide(B, mid(bk[3]), { R: 10, n: 8, w: -0.5, hue: 200 });
  // 회전 그네(웨이브 스윙어): 의자가 땅까지 내려왔다 올라간다 + 꼭대기 원판
  B.carousel(mid(bk[4]), { R: 9.5, n: 12, w: 0.7, y: 0.6, bob: 3.2, size: [0.5, 0.55, 0.5], kind: 'chair' });
  B.box(mid(bk[4]), 0, 7, 1.2, 7, 1.2, 'swinger'); B.box(mid(bk[4]), 0, 14.6, 11, 0.6, 11, 'swinger');
  for (const side of [-1, 1]) B.box(mid(bk[4]), side * 13.9, 1.5, 2.7, 1.5, 10.5, 'booth');
  B.add('swinger', { s: mid(bk[4]), R: 9.5, y: 14.6 });
  B.gapFlight(bk[5][0] + 10, 26, { label: '분수 연못 26m', style: 'pool', v0: 9 });
  teacups(B, bk[6][0] + 22);
  B.lines(bk[6][0] + 44, LIGHTS, { kind: 'lights' });
  B.hop(mid(bk[7]), 2.6, { label: '회전목마 울타리 2.6m', style: 'fence' });
}

// ───────── 구역 4: 롤러코스터 랜드 ─────────
function p4(B, bk) {
  pavilions(B, 2700, 3600, { hmin: 50, hmax: 80, style: 'coaster' });
  B.street(2700, 3600, { lamps: true, lampEvery: 36, trees: false, intersections: [] });
  coasterCrossing(B, bk[0][0] + 20, { v: 22, P: 6, ph: 0 });
  coasterCrossing(B, bk[0][0] + 48, { v: 24, P: 6, ph: 3, dir: -1, hue: 200 });
  coasterTrack(B, mid(bk[1]) - 8, 10, { ph: 0, hue: 330 }); coasterTrack(B, mid(bk[1]) + 8, 21, { ph: 2, dir: -1, hue: 50 }); coasterTrack(B, mid(bk[1]), 32, { ph: 1, hue: 140 });
  for (const [d, x] of [[8, -8], [8, 2], [16, -3], [16, 8]]) B.pillar(bk[1][0] + d, x, 1.4, 9.5, { style: 'track' });
  B.portal(bk[2][0] + 40, 6, 13, { label: '코스터 역사 창문 6~13m', style: 'station', v0: 8 });
  coasterCrossing(B, bk[3][0] + 14, { v: 26, P: 5, ph: 1, hue: 280 });
  coasterCrossing(B, bk[3][0] + 34, { v: 26, P: 5, ph: 3.5, dir: -1, hue: 20 });
  B.stepFlight(bk[4][0] + 6, 38, 4.0, { label: '탑승장 플랫폼 4m', style: 'station' });
  coasterTrack(B, bk[5][0] + 12, 12, { ph: 0.5, hue: 0 }); coasterTrack(B, bk[5][0] + 13, 24, { ph: 3, dir: -1, hue: 180 }); coasterTrack(B, bk[5][0] + 12, 35, { ph: 1.7, hue: 90 });
  B.vents(bk[5][0] + 34, { kind: 'water', n: 4, x0: -9, dx: 6, H: 5, w: 2, P: 4.2, on: 1.4, warn: 1.0, phStep: 1.0 });
  coasterCrossing(B, bk[6][0] + 14, { v: 22, P: 6, ph: 2, hue: 120 });
  for (const [d, x] of [[30, -9], [30, 1], [42, -4], [42, 7]]) B.pillar(bk[6][0] + d, x, 1.4, 12, { style: 'track' });
  B.hop(mid(bk[7]), 2.4, { label: '코스터 펜스 2.4m', style: 'fence' });
}

// ───────── 구역 5: 대관람차 & 바이킹 & 자이로드롭 ─────────
function p5(B, bk) {
  pavilions(B, 3600, 4500, { hmin: 46, hmax: 66 });
  B.street(3600, 4500, { lamps: true, lampEvery: 36, trees: false, intersections: [] });
  wheelRide(B, mid(bk[0]), { R: 19, cy: 22, w: 0.12, hue: 200 });
  vikingRide(B, mid(bk[1]), { per: 5.2 });
  for (const [d, ph] of [[18, 0], [46, 3.5]]) {
    B.ceilPlate(bk[2][0] + d, { x0: -12, x1: 12, d: 6, yTop: 30, yHigh: 24, yLow: 0, h: 2.4, P: 7, hold: 3.2, drop: 0.9, stay: 0.8, rise: 2.1, ph, kind: 'drop' });
    for (const side of [-1, 1]) B.box(bk[2][0] + d, side * 13.6, 16, 1.2, 16, 1.2, 'droptower');
    B.add('droptower', { s: bk[2][0] + d, top: 32 });
  }
  wheelRide(B, mid(bk[3]), { R: 14, cy: 16.5, w: -0.16, n: 10, hue: 330 });
  B.gapFlight(bk[4][0] + 16, 34, { label: '호수 위 점프 34m', style: 'lake', v0: 9 });
  vikingRide(B, mid(bk[5]), { per: 4.6, ph: 1.3, amp: 1.1 });
  wheelRide(B, mid(bk[6]), { R: 16, cy: 19, w: 0.15, n: 10, hue: 60, ph: 0.7 });
  B.hop(mid(bk[7]), 3.0, { label: '대관람차 펜스 3.0m', style: 'fence' });
}

// ───────── 구역 6: 유령의 집 (실내, 낮은 천장) ─────────
function p6(B, bk) {
  B.ceiling(4500, 5400, 7.0, { overPads: true, style: 'haunt' });
  // 입구/출구 정면 (보이는 그대로 충돌)
  solid(B, 4499.8, 0, (7 + 48) / 2, 22, (48 - 7) / 2, 0.6, 'building');
  for (const side of [-1, 1]) solid(B, 4499.8, side * 18, 3.5, 4, 3.5, 0.6, 'building');
  solid(B, 5400.2, 0, (7 + 48) / 2, 17, (48 - 7) / 2, 0.6, 'building');
  B.add('hauntface', { s: 4500, dir: 1 }); B.add('hauntface', { s: 5400, dir: -1 });
  [[14, -6, 0], [34, 4, 2.5], [54, -2, 5]].forEach(([d, cx, ph]) => B.drone(bk[0][0] + d, { cx, cy: 2.0, ax: 7, ay: 0.9, az: 4, per: 7, ph, r: 1.0, kind: 'ghost' }));
  [-9, -3, 3, 9].forEach((px, i) => B.ball(bk[1][0] + 14, { axis: 'z', px, py: 6.6, L: 5, amp: 0.85, per: 3.2, ph: i * 0.8, r: 1.1, kind: 'coffin' }));
  [-6, 0, 6, 12].forEach((px, i) => B.ball(bk[1][0] + 36, { axis: 'z', px, py: 6.6, L: 5, amp: 0.85, per: 3.6, ph: 1.6 + i * 0.9, r: 1.1, kind: 'coffin' }));
  B.ceilPlate(bk[2][0] + 18, { x0: -13.5, x1: 13.5, d: 4, yTop: 7, yHigh: 5.0, yLow: 0, P: 6, hold: 2.6, drop: 0.3, stay: 0.8, rise: 1.6, ph: 0, kind: 'crusher' });
  B.ceilPlate(bk[2][0] + 46, { x0: -13.5, x1: 13.5, d: 4, yTop: 7, yHigh: 5.0, yLow: 0, P: 6, hold: 2.6, drop: 0.3, stay: 0.8, rise: 1.6, ph: 3, kind: 'crusher' });
  B.gapFlight(bk[3][0] + 10, 12, { label: '함정 바닥 12m', style: 'trap', v0: 9 });
  B.birds(mid(bk[4]), { y0: 1.4, pat: 'sine', amp: 9, per: 5.6, n: 9, spread: 1.4, kind: 'bat' });
  [12, 30].forEach((d, i) => B.laserTrip(bk[4][0] + d, { ys: [0.55, 1.45], blink: { P: 3.4, on: 1.4, warn: 0.8, ph: -i * 1.7 } }));
  B.hop(bk[5][0] + 14, 1.4, { wire: 3.0, label: '묘비 담장 1.4m', style: 'grave' });
  B.drone(bk[5][0] + 38, { cx: 0, cy: 2.2, ax: 9, ay: 1, az: 3, per: 6, ph: 1, r: 1.0, kind: 'ghost' });
  B.saw(bk[6][0] + 18, { x0: -11, x1: 11, per: 5.2, ph: 0.2 });
  B.saw(bk[6][0] + 40, { x0: 11, x1: -11, per: 4.6, ph: 0.6 });
  B.drone(bk[6][0] + 29, { cx: 0, cy: 2.2, ax: 8, ay: 1, az: 3, per: 6.5, ph: 3, r: 1.0, kind: 'ghost' });
  B.hop(bk[7][0] + 14, 1.2, { wire: 3.2, label: '유령의 집 출구 1.2m', style: 'grave' });
}

// ───────── 구역 7: 불꽃놀이 성 (피날레) ─────────
function p7(B, bk) {
  pavilions(B, 5400, 6300, { style: 'castle', tex: 5, hmin: 48, hmax: 64 });
  B.street(5400, 6300, { lamps: true, lampEvery: 32, trees: false, intersections: [] });
  B.gapFlight(bk[0][0] + 12, 30, { label: '해자 도개교 30m', style: 'moat', v0: 9 });
  B.fireRain(bk[1][0] + 6, bk[1][1] - 6, { x0: -11, x1: 11, cnt: 3, P: 3.2, fall: 1.5, kind: 'firework' });
  B.lines(bk[1][1] - 4, BUNT, { kind: 'bunting' });
  B.portal(bk[2][0] + 36, 10, 16, { label: '성벽 창문 10~16m', style: 'castle', v0: 8 });
  B.barrels(bk[3][0] + 12, { xs: -17, dir: 1, v: 9, len: 34, P: 4, ph: 0, r: 0.9, kind: 'cannon' });
  B.barrels(bk[3][0] + 28, { xs: 17, dir: -1, v: 9.5, len: 34, P: 4, ph: 1.8, r: 0.9, kind: 'cannon' });
  B.barrels(bk[3][0] + 42, { xs: -17, dir: 1, v: 10, len: 34, P: 4, ph: 0.9, r: 0.9, kind: 'cannon' });
  B.skybridge(bk[4][0] + 8, 14, 4, { hue: 45 }); B.skybridge(bk[4][0] + 9, 26, 4, { hue: 300 }); B.skybridge(bk[4][0] + 8, 37, 3.5, { hue: 200 });
  B.portal(bk[4][0] + 50, 14, 20, { label: '성탑 창문 14~20m', style: 'castle', v0: 8 });
  B.press(bk[5][0] + 16, { d: 5, hgt: 7, xo: 16.4, gapMax: 24, gapMin: 0.8, P: 8, open: 3.5, close: 0.7, closed: 1.3, openT: 1.4, ph: 0, kind: 'castle' });
  B.fireRain(bk[5][0] + 30, bk[5][1] - 4, { cnt: 2, P: 3.0, fall: 1.4, kind: 'firework' });
  B.gapFlight(bk[6][0] + 18, 24, { label: '해자 24m', style: 'moat', v0: 9 });
  B.hop(bk[7][0] + 18, 4.0, { spikes: 0.8, label: '최종 관문: 성문 4.0m', style: 'castle' });
}

const SECTIONS = [
  { name: '정문 광장', style: 'parkgate', wall: 'hedge', s0: 0, s1: 900, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: p1 },
  { name: '먹거리 거리', style: 'food', s0: 900, s1: 1800, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: p2 },
  { name: '회전목마 광장', style: 'carousel', s0: 1800, s1: 2700, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: p3 },
  { name: '롤러코스터 랜드', style: 'coaster', s0: 2700, s1: 3600, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: p4 },
  { name: '대관람차 & 바이킹', style: 'wheel', water: -6, s0: 3600, s1: 4500, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: p5 },
  { name: '유령의 집', style: 'haunt', s0: 4500, s1: 5400, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], ground: { half: 14, wall: 14 }, fn: p6 },
  { name: '불꽃놀이 성', style: 'castle', s0: 5400, s1: 6300, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: p7 },
];

// 낮 → 노을 → 밤 → 불꽃놀이
export const PARK_ENV = [
  { s: 0,    top: 0x3f7fd8, hor: 0xbfe2ff, fog: 0xa8c8e8, fogD: 0.0030, sun: 0xfff2d8, sunI: 1.9, hemi: 0xcfe4ff, hemiG: 0x6a7a5a, hemiI: 1.25, lamp: 0.15, win: 0.15, exp: 1.0, rain: 0, bloom: 0.4 },
  { s: 1800, top: 0x4a74c8, hor: 0xffd0a0, fog: 0xc0b0b8, fogD: 0.0032, sun: 0xffd8a8, sunI: 1.7, hemi: 0xd8d8f0, hemiG: 0x6a5a58, hemiI: 1.15, lamp: 0.3, win: 0.25, exp: 1.0, rain: 0, bloom: 0.45 },
  { s: 3600, top: 0x2a3a88, hor: 0xff8a5a, fog: 0x7a5a78, fogD: 0.0038, sun: 0xff9a68, sunI: 1.3, hemi: 0x9a90d0, hemiG: 0x4a3a48, hemiI: 1.0, lamp: 0.7, win: 0.6, exp: 1.0, rain: 0, bloom: 0.6 },
  { s: 4500, top: 0x0c0a22, hor: 0x2a1a4a, fog: 0x140c26, fogD: 0.0110, sun: 0x8a70c0, sunI: 0.45, hemi: 0x5a4a8a, hemiG: 0x140c20, hemiI: 0.8, lamp: 1.0, win: 1.0, exp: 1.05, rain: 0, bloom: 0.85 },
  { s: 5400, top: 0x0a0c2a, hor: 0x3a2060, fog: 0x1a1236, fogD: 0.0050, sun: 0xb08aff, sunI: 0.75, hemi: 0x6a60b0, hemiG: 0x1a1430, hemiI: 0.85, lamp: 1.0, win: 1.0, exp: 1.0, rain: 0, bloom: 0.9 },
  { s: 6300, top: 0x0a0c2a, hor: 0x4a2a70, fog: 0x1a1236, fogD: 0.0045, sun: 0xc09aff, sunI: 0.8, hemi: 0x7a70c0, hemiG: 0x1a1430, hemiI: 0.9, lamp: 1.0, win: 1.0, exp: 1.0, rain: 0, bloom: 0.95 },
];

export function buildPark() {
  return assembleMap({ id: 'park', name: '놀이공원', seed: 20261110, length: PARK_LENGTH, sections: SECTIONS, env: PARK_ENV, fuel: fuelTable, extra: { finishStyle: 'castle' } });
}
