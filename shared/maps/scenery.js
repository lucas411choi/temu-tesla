// 구간별 주변 풍경(도로 밖) 배치. 모두 "보이는 것 = 충돌" 원칙을 지킨다.
//  - 옆벽(ground.wall) 반공간이 막고 있는 높이(wallTop)까지는 별도 충돌체가 필요 없고,
//    그보다 높거나 옆벽이 없는 곳(고가도로/다리)의 구조물은 충돌 상자를 따로 만든다.
//  - 구간이 바뀌는 경계에는 '이음 풍경'(공원, 공사장 정문, 진입로, 시장 정문, 부두, 터널 입구 ...)을 둬서 자연스럽게 넘어간다.
import { makeBox } from '../collision.js';

const solid = (B, s, x, y, hx, hy, hz, tag = 'building') => { const b = makeBox(x, y, -s, hx, hy, hz); b.tag = tag; b.sec = B.cur; B.statics.push(b); return b; };

// ───────── 골목 상가 (저층 상가·주택, 어닝/세로 간판/에어컨 실외기) ─────────
export function alleyScene(B, s0, s1, o = {}) {
  const rng = B.rng;
  B.ground(s0, s1, { wallTop: 11 });
  for (const side of [-1, 1]) {
    let s = s0 - rng.range(0, 6);
    while (s < s1) {
      const w = Math.min(rng.range(8, 15), s1 - s + 4);
      B.building(s + w / 2, side, w, rng.range(10, 16), rng.range(11, 21), { style: 'house', flat: true, tex: rng.chance(0.6) ? 2 : 1, shop: true });
      s += w;
    }
  }
  // 전봇대 + 전선 (인도 끝, 충돌 포함). 전선은 같은 쪽 전봇대 사이를 잇는다.
  for (const side of [-1, 1]) {
    let prev = null;
    for (let s = s0 + 18 + (side > 0 ? 23 : 0); s < s1 - 6; s += 46) {
      solid(B, s, side * 16.1, 4.6, 0.18, 4.6, 0.18, 'pole');
      if (prev !== null) solid(B, (prev + s) / 2, side * 16.1, 8.3, 0.05, 0.05, (s - prev) / 2, 'wire');
      B.add('pole', { s, side, prev });
      prev = s;
    }
  }
}

// ───────── 동네 공원 (골목 → 도심 사이 이음) : 도로가 넓은 광장으로 열리고, 둘레는 건물이 감싼다 ─────────
export function parkScene(B, s0, s1, o = {}) {
  const rng = B.rng, half = o.half || 40;
  B.ground(s0, s1, { half, wall: half, wallTop: Infinity, surf: 'park' });
  for (const side of [-1, 1]) {
    // 공원을 둘러싼 건물 (x0 = half)
    let s = s0 - 4;
    while (s < s1 + 4) { const w = rng.range(14, 22); B.building(s + w / 2, side, w, 24, rng.range(46, 80), { x0: half + 0.5, style: 'office', tex: 1 }); s += w; }
    // 가로수 두 줄
    for (let s2 = s0 + 6; s2 < s1 - 4; s2 += 11) { B.tree(s2 + rng.range(-1.5, 1.5), side, { x: rng.range(21, 26), kind: 'park' }); B.tree(s2 + 5 + rng.range(-1.5, 1.5), side, { x: rng.range(31, 36), kind: 'park' }); }
    // 벤치
    for (let s2 = s0 + 10; s2 < s1 - 6; s2 += 16) { solid(B, s2, side * 18.6, 0.45, 0.4, 0.45, 1.1, 'bench'); B.add('bench', { s: s2, x: side * 18.6 }); }
  }
  // 분수 (한쪽)
  const fs = (s0 + s1) / 2, fx = (o.fountainSide || 1) * 28;
  solid(B, fs, fx, 1.0, 4.2, 1.0, 4.2, 'fountain'); solid(B, fs, fx, 3.2, 0.7, 2.2, 0.7, 'fountain');
  B.add('fountain', { s: fs, x: fx });
  B.add('parkgate', { s: s0 + 1, half });
  B.add('parkgate', { s: s1 - 1, half });
  B.add('lawn', { s0, s1, half });
}

// ───────── 도심 업무지구 (유리 오피스 타워) ─────────
export function downtownScene(B, s0, s1, o = {}) {
  for (const side of [-1, 1]) B.buildingRow(s0, s1, side, { style: 'office', hmin: 52, hmax: 150, neon: 0.25, skip: o.skip || [] });
}

// ───────── 공사장: 아파트 대신 '짓다 만 철골·콘크리트 골조' + 비계 + 안전망 + 타워크레인 ─────────
export function siteScene(B, s0, s1, o = {}) {
  const rng = B.rng;
  for (const side of [-1, 1]) {
    let s = s0;
    while (s < s1) {
      const w = Math.min(rng.range(22, 36), s1 - s + 6), h = rng.range(48, 84), floors = Math.round(h / 3.6);
      B.add('skel', { s: s + w / 2, side, w: w - 1.5, d: rng.range(22, 34), h, floors, done: rng.range(0.25, 0.8), net: rng.chance(0.7), seed: Math.floor(rng() * 1e9) });
      s += w;
    }
  }
  // 현장 펜스 아래 단 (보도 쪽 가림막) — 장식
  B.add('hoard', { s0, s1 });
}

// ───────── 고가도로: 아래로 내려다보이는 도시 (도로 아래 16m) + 멀리 떨어진 타워 ─────────
export function highwayScene(B, s0, s1) {
  const rng = B.rng;
  B.add('lowcity', { s0, s1, y: -16 });
  for (const side of [-1, 1]) {
    let s = s0 - 10;
    while (s < s1 + 10) {
      const w = rng.range(26, 46), x0 = rng.range(46, 70), h = rng.range(40, 120);
      // 아래 지면(-16)부터 솟은 빌딩: 옆벽이 없는 구간이라 building()이 충돌 상자를 함께 만든다
      B.building(s + w / 2, side, w, rng.range(26, 40), h + 16, { x0, base: -16, style: 'office', tex: rng.int(0, 1), neon: 0.2 });
      s += w + rng.range(4, 22);
    }
  }
  // 고가 교각(도로 아래)
  for (let s = s0 + 8; s < s1; s += 36) B.add('pier', { s, y: -16 });
}

// ───────── 네온 골목 시장 (빽빽한 중층 건물 + 돌출 네온 간판) ─────────
export function marketScene(B, s0, s1) {
  for (const side of [-1, 1]) B.buildingRow(s0, s1, side, { style: 'neon', tex: 3, hmin: 46, hmax: 78, wmin: 12, wmax: 22, neon: 0.95 });
  for (let s = s0 + 10; s < s1; s += 23) B.add('neonsign', { s, side: (Math.floor(s / 23) % 2) ? 1 : -1, hue: Math.floor(B.rng() * 360), y: B.rng.range(5, 14) });
}

// ───────── 공업 지구: 14m 높이의 공장 담/배관벽 + 뒤쪽 저장 탱크·굴뚝 (충돌 상자 포함) ─────────
export function industrialScene(B, s0, s1) {
  const rng = B.rng;
  B.ground(s0, s1, { wallTop: 14 });
  B.add('plantwall', { s0, s1, h: 14 });
  for (const side of [-1, 1]) {
    for (let s = s0 + rng.range(10, 30); s < s1 - 10; s += rng.range(55, 85)) {
      const kind = rng.chance(0.55) ? 'tank' : 'stack';
      if (kind === 'tank') {
        const r = rng.range(7, 11), h = rng.range(20, 34), x = side * (17.5 + r + rng.range(0, 6));
        solid(B, s, x, h / 2, r * 0.92, h / 2, r * 0.92, 'tank');
        B.add('tank', { s, x, r, h, hue: rng.pick([0, 30, 200, 120]) });
      } else {
        const r = rng.range(1.6, 2.6), h = rng.range(55, 90), x = side * (19 + rng.range(0, 8));
        solid(B, s, x, h / 2, r, h / 2, r, 'stack');
        B.add('stack', { s, x, r, h });
      }
    }
  }
}

// ───────── 부두 (공업 지구 → 다리 사이 이음): 컨테이너 더미 + 갠트리 크레인 ─────────
export function dockScene(B, s0, s1) {
  const rng = B.rng;
  B.ground(s0, s1, { wallTop: 10.4 });
  // 컨테이너 4단(10.4m)이 빈틈 없이 = 옆벽 높이와 같다
  for (const side of [-1, 1]) for (let s = s0; s < s1; s += 6.4) B.add('containers', { s: s + 3.2, x: side * 17.9, n: 4, seed: Math.floor(rng() * 1e6) });
  // 갠트리 크레인(뒤쪽, 충돌 포함)
  const gs = (s0 + s1) / 2;
  for (const side of [-1, 1]) {
    for (const dz of [-7, 7]) solid(B, gs + dz, side * 27, 21, 0.8, 21, 0.8, 'crane');
    solid(B, gs, side * 27, 41, 1.2, 1.4, 8, 'crane');
  }
  B.add('gantry', { s: gs, x: 27 });
}

// ───────── 강 위의 현수교: 주탑(충돌) + 주케이블/행어(행어는 충돌 커튼) ─────────
export function bridgeScene(B, s0, s1, towers) {
  const H = 58;
  for (const ts of towers) for (const side of [-1, 1]) { solid(B, ts, side * 15.6, H / 2, 1.3, H / 2, 1.6, 'tower'); }
  for (const ts of towers) B.add('btower', { s: ts, H });
  // 주케이블: 주탑 사이를 늘어지게. 행어 커튼(x=±15.2)을 10m 단위 충돌 상자로
  const pts = [s0 - 40, ...towers, s1 + 40];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    B.add('bcable', { s0: a, s1: b, H, lo: 7, endA: i === 0, endB: i === pts.length - 2 });
    for (let s = a + 5; s < b - 4; s += 10) {
      const u = (s - a) / (b - a), y = cableY(u, H, 7, i === 0, i === pts.length - 2);
      for (const side of [-1, 1]) solid(B, s, side * 15.2, (y + 1.2) / 2, 0.08, (y - 1.2) / 2, 5, 'cable');
    }
  }
  B.add('skyline', { s0, s1, dist: 260 });
}
export function cableY(u, H, lo, endA, endB) {
  if (endA) return 1.2 + (H - 1.2) * u * u;
  if (endB) return H - (H - 1.2) * (1 - (1 - u) * (1 - u));
  const k = (2 * u - 1);
  return lo + (H - lo) * k * k;
}

// ───────── 터널 입구/출구 (산 + 포털 정면) ─────────
// 산은 계단식 바위 덩어리(각 덩어리 = 충돌 상자)로 만들어 보이는 모양과 충돌이 같다.
export function tunnelPortals(B, sIn, sOut, ceilY) {
  const rocks = [];
  const rock = (s, x, y, hx, hy, hz) => { solid(B, s, x, y, hx, hy, hz, 'rock'); rocks.push([s, x, y, hx, hy, hz]); };
  // 입구 앞 산비탈(도로 양옆, 다리 끝에서부터 점점 높아짐)
  for (let k = 0; k < 4; k++) {
    const s = sIn - 52 + k * 13, hgt = 8 + k * 9;
    for (const side of [-1, 1]) rock(s, side * (17.5 + 14 - k * 2), hgt / 2, 14 - k * 2 + 3, hgt / 2, 6.5);
  }
  // 포털 위 산 덩어리 (터널 천장 위 ~ 60m)
  rock(sIn + 14, 0, (ceilY + 5 + 60) / 2, 70, (60 - ceilY - 5) / 2, 14);
  for (const side of [-1, 1]) rock(sIn + 14, side * 44, (ceilY + 5) / 2, 30, (ceilY + 5) / 2, 14);
  // 포털 정면(입구 위쪽 벽) / 출구 위쪽 벽
  solid(B, sIn - 0.2, 0, (ceilY + 60) / 2, 30, (60 - ceilY) / 2, 0.6, 'rock');
  for (const side of [-1, 1]) solid(B, sIn - 0.2, side * 21.9, ceilY / 2, 8.1, ceilY / 2, 0.6, 'rock');
  solid(B, sOut + 0.2, 0, (ceilY + 60) / 2, 17, (60 - ceilY) / 2, 0.6, 'building');
  B.add('hill', { s: sIn, rocks });
  B.add('tportal', { s: sIn, dir: 1, y: ceilY });
  B.add('tportal', { s: sOut, dir: -1, y: ceilY });
}

// ───────── 마천루 협곡 ─────────
export function canyonScene(B, s0, s1) {
  for (const side of [-1, 1]) B.buildingRow(s0, s1, side, { style: 'glass', tex: 0, hmin: 110, hmax: 250, wmin: 26, wmax: 48, neon: 0.5 });
}

// ───────── 새벽 해안 리조트 거리 (피날레): 밝은 호텔·리조트 + 야자수 ─────────
export function waterfrontScene(B, s0, s1) {
  for (const side of [-1, 1]) B.buildingRow(s0, s1, side, { style: 'hotel', tex: 1, hmin: 50, hmax: 130, neon: 0.2 });
  for (let s = s0 + 24; s < s1 - 10; s += 34) B.tree(s, s % 68 < 34 ? 1 : -1, { x: 15.4, kind: 'palm' });
}
