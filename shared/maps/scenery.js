// 경로 주변 풍경. 경로가 다 만들어진 뒤(B.scenery 작업으로) 실행되어, 경로(노면 판)와 다른 풍경에 겹치지 않는 자리에만 놓는다.
// 모든 구조물은 보이는 그대로 충돌 상자를 가진다. 바닥은 floorY (경로보다 한참 아래).
import { makeBox } from '../collision.js';
import { rectOverlap } from './lib.js';
import { rotZ } from '../math.js';

const solid = (B, s, x, y, hx, hy, hz, tag = 'building') => { const b = makeBox(x, y, -s, hx, hy, hz); b.tag = tag; b.sec = B.cur; B.statics.push(b); return b; };
// 피스 p 위 로컬 사각형(s 중심, x 중심, 반길이 a(진행 방향), 반폭 w(옆 방향)) → 월드 사각형
const worldRect = (p, s, x, a, w) => { const u = s - p.s0; return { cx: p.x0 + u * p.fx + x * p.rx, cz: p.z0 + u * p.fz + x * p.rz, fx: p.fx, fz: p.fz, rx: p.rx, rz: p.rz, a, w }; };
const slabRect = (sl, m) => { const am = (sl.a0 + sl.a1) / 2; return { cx: sl.x0 + am * sl.fx, cz: sl.z0 + am * sl.fz, fx: sl.fx, fz: sl.fz, rx: sl.rx, rz: sl.rz, a: (sl.a1 - sl.a0) / 2 + m, w: sl.w + m }; };

// 이 자리(월드 사각형 R)가 비었는가: 경로 판(여유 m) / 이미 놓은 풍경과 겹치지 않음
export function free(B, track, R, m = 0.8) {
  const ext = Math.abs(R.a * R.fx) + Math.abs(R.w * R.rx) + 2, ezt = Math.abs(R.a * R.fz) + Math.abs(R.w * R.rz) + 2;
  for (const sl of track.slabs) {
    if (sl.box[1] + m < R.cx - ext || sl.box[0] - m > R.cx + ext || sl.box[3] + m < R.cz - ezt || sl.box[2] - m > R.cz + ezt) continue;
    if (sl.arc) { for (const q of sl.subs) if (rectOverlap({ ...q, a: q.a + m, w: q.w + m }, R)) return false; continue; }
    if (rectOverlap(slabRect(sl, m), R)) return false;
  }
  for (const F of B.foot) {
    if (Math.abs(F.cx - R.cx) > F.rad + ext + 2 || Math.abs(F.cz - R.cz) > F.rad + ezt + 2) continue;
    if (rectOverlap(F, R)) return false;
  }
  return true;
}
const claim = (B, R) => { R.rad = Math.hypot(R.a, R.w); B.foot.push(R); };

// 조각 p 의 [a, b] 구간 양옆에 '빈틈 없는 건물 줄'. o: { gap(길 가장자리~건물), hmin, hmax(노면 위 높이), wmin,wmax, dmin,dmax, style, tex, flat, neon, shop, sides }
export function rowsAlong(B, track, s0, s1, o = {}) {
  const rng = B.rng, floor = B.floorY;
  for (const p of track.pieces) {
    if (!p.solid || p.L < 6 || p.kind === 'arc') continue;
    const a0 = Math.max(s0, p.s0 + (o.trim || 0)), a1 = Math.min(s1, p.s0 + p.L - (o.trim || 0));
    if (a1 - a0 < 6) continue;
    for (const side of o.sides || [-1, 1]) {
      let s = a0;
      while (s < a1 - 3) {
        const w = Math.min(rng.range(o.wmin || 14, o.wmax || 30), a1 - s);
        let d = rng.range(o.dmin || 18, o.dmax || 36);
        const x0 = p.w + (o.gap !== undefined ? o.gap : 0.6) + (o.jitter ? rng() * o.jitter : 0);
        const sc = s + w / 2;
        let R = worldRect(p, sc, side * (x0 + d / 2), w / 2 - 0.3, d / 2);
        if (!free(B, track, R)) { d *= 0.45; R = worldRect(p, sc, side * (x0 + d / 2), w / 2 - 0.3, d / 2); }
        if (d > 5 && free(B, track, R)) {
          const surf = p.y0 + (p.y1 - p.y0) * ((sc - p.s0) / p.L);
          const top = rng.range(o.hmin || 30, o.hmax || 90), base = floor - surf;
          const dd = B.building(sc, side, w, d, top - base, { x0, base, style: o.style, tex: o.tex, flat: o.flat, neon: o.neon, shop: o.shop });
          if (o.hue !== undefined) dd.hue = o.hue + Math.floor(rng() * 60);
          if (o.food) dd.food = rng.pick(o.food);
          claim(B, R);
        }
        s += w;
      }
    }
  }
}

// 흩어 놓기: 조각마다 양옆 거리 [near, far] 에 kind 를 make(s, x, side) 로 만든다 (반크기 hw)
export function scatter(B, track, s0, s1, o, make) {
  const rng = B.rng;
  for (const p of track.pieces) {
    if (p.L < 8 || p.kind === 'arc') continue;
    const a0 = Math.max(s0, p.s0), a1 = Math.min(s1, p.s0 + p.L);
    for (let s = a0 + rng.range(2, o.every || 30); s < a1; s += rng.range((o.every || 30) * 0.6, (o.every || 30) * 1.3)) {
      for (const side of [-1, 1]) {
        if (rng() > (o.chance || 0.7)) continue;
        const hw = o.hw || 4, x = side * (p.w + (o.near || 2) + hw + rng() * ((o.far || 20) - (o.near || 2)));
        const R = worldRect(p, s, x, hw, hw);
        if (!free(B, track, R, o.margin || 1.0)) continue;
        make(s, x, side, p, hw); claim(B, R);
      }
    }
  }
}

const surfAt = (p, s) => p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, (s - p.s0) / p.L));

// ───────── 테마별 ─────────
export function cityScene(B, track, s0, s1, style, o = {}) {
  const P = {
    alley: { style: 'house', tex: 2, flat: true, hmin: 8, hmax: 18, wmin: 8, wmax: 14, dmin: 10, dmax: 16, shop: true },
    city: { style: 'office', hmin: 40, hmax: 120, neon: 0.25 },
    neon: { style: 'neon', tex: 3, hmin: 30, hmax: 60, wmin: 10, wmax: 20, neon: 0.95 },
    canyon: { style: 'glass', tex: 0, hmin: 90, hmax: 200, wmin: 22, wmax: 40, neon: 0.5 },
    dawn: { style: 'hotel', tex: 1, hmin: 30, hmax: 90, neon: 0.2 },
    highway: { style: 'office', hmin: 20, hmax: 80, gap: 14, jitter: 18, neon: 0.2, wmin: 20, wmax: 36 },
    park: { style: 'toon', tex: 4, hmin: 28, hmax: 50, wmin: 16, wmax: 28, neon: 0.6 },
    stall: { style: 'stall', tex: 1, flat: true, hmin: 7, hmax: 12, wmin: 8, wmax: 13, dmin: 8, dmax: 12, shop: true, food: ['떡볶이', '츄러스', '솜사탕', '핫도그', '팝콘', '아이스크림', '닭꼬치', '와플', '탕후루', '레모네이드'] },
    toon: { style: 'toon', tex: 1, flat: true, hmin: 10, hmax: 18, wmin: 9, wmax: 15, dmin: 12, dmax: 18, shop: true },
    castle: { style: 'castle', tex: 5, hmin: 26, hmax: 44, wmin: 14, wmax: 26 },
  }[style];
  rowsAlong(B, track, s0, s1, { ...P, ...o });
}
// 공사장: 짓다 만 골조(충돌 상자) + 타워크레인 마스트
export function siteScene(B, track, s0, s1) {
  const rng = B.rng;
  for (const p of track.pieces) {
    if (!p.solid || p.L < 10 || p.kind === 'arc') continue;
    const a0 = Math.max(s0, p.s0), a1 = Math.min(s1, p.s0 + p.L);
    for (const side of [-1, 1]) for (let s = a0; s < a1 - 6;) {
      const w = Math.min(rng.range(16, 28), a1 - s), d = rng.range(14, 24), x0 = p.w + rng.range(2, 6), sc = s + w / 2;
      const R = worldRect(p, sc, side * (x0 + d / 2), w / 2, d / 2);
      if (w > 8 && free(B, track, R)) {
        const surf = surfAt(p, sc), top = rng.range(18, 50), base = B.floorY - surf, h = top - base;
        solid(B, sc, side * (x0 + d / 2), base + h / 2, d / 2, h / 2, w / 2 - 0.75, 'building');
        B.add('skel', { s: sc, side, w: w - 1.5, d, h, x0, base, floors: Math.round(h / 3.6), done: rng.range(0.3, 0.8), net: rng.chance(0.7), seed: Math.floor(rng() * 1e9) });
        claim(B, R);
      }
      s += w + rng.range(2, 10);
    }
  }
}
export function industrialScene(B, track, s0, s1) {
  const rng = B.rng;
  scatter(B, track, s0, s1, { every: 26, near: 3, far: 24, hw: 8, chance: 0.6 }, (s, x, side, p, hw) => {
    const surf = surfAt(p, s), base = B.floorY - surf;
    if (rng.chance(0.55)) {
      const r = rng.range(5, hw), h = rng.range(14, 30) - base;
      solid(B, s, x, base + h / 2, r * 0.92, h / 2, r * 0.92, 'tank');
      B.add('tank', { s, x, r, h, base, hue: rng.pick([0, 30, 200, 120]) });
    } else {
      const r = rng.range(1.6, 2.6), h = rng.range(45, 80) - base;
      solid(B, s, x, base + h / 2, r, h / 2, r, 'stack');
      B.add('stack', { s, x, r, h, base });
    }
  });
}
export function rocks(B, track, s0, s1, o = {}) {
  const rng = B.rng;
  scatter(B, track, s0, s1, { every: 14, near: 0.8, far: 6, hw: 6, chance: 0.9, margin: 0.6 }, (s, x, side, p, hw) => {
    const surf = surfAt(p, s), base = B.floorY - surf, top = rng.range(o.hmin || 10, o.hmax || 26), h = top - base;
    solid(B, s, x, base + h / 2, hw, h / 2, hw, 'rock');
    B.add('rock', { s, x, hw, h, base, seed: Math.floor(rng() * 1e6) });
  });
}
export function palms(B, track, s0, s1) {
  const rng = B.rng;
  scatter(B, track, s0, s1, { every: 22, near: 1.2, far: 4, hw: 1.6, chance: 0.6 }, (s, x, side, p) => {
    const surf = surfAt(p, s);
    // 야자수는 노면 높이의 작은 화단 위 (화단 = 충돌)
    const base = B.floorY - surf;
    solid(B, s, x, base / 2, 1.4, -base / 2, 1.4, 'planter');
    B.box(s, x, 1.7, 0.3, 1.7, 0.3, 'tree'); B.sph(s, x, 5.0, 2.3, 'tree');
    B.add('planter', { s, x, base }); B.add('tree', { s, side, x, kind: 'palm', seed: Math.floor(rng() * 1e6) });
  });
}
export function cableY(u, H, lo, endA, endB) {
  if (endA) return 1.2 + (H - 1.2) * u * u;
  if (endB) return H - (H - 1.2) * (1 - (1 - u) * (1 - u));
  const k = (2 * u - 1);
  return lo + (H - lo) * k * k;
}

// ───────── 놀이공원 바닥: 경로 아래/옆 땅 위의 테마파크 구조물 (보이는 그대로 충돌) ─────────
// 서커스 텐트, 회전목마 파빌리온, 코스터 루프, 매점, 풍선 가게, 나무
export function parkGround(B, track, s0, s1, o = {}) {
  const rng = B.rng;
  scatter(B, track, s0, s1, { every: o.every || 16, near: 2, far: o.far || 34, hw: 7, chance: 0.85, margin: 1.2 }, (s, x, side, p, hw) => {
    const surf = surfAt(p, s), base = B.floorY - surf, pick = rng();
    const seed = Math.floor(rng() * 1e6), hue = Math.floor(rng() * 360);
    if (pick < 0.24) {                       // 서커스 텐트: 원기둥 + 원뿔 지붕
      const r = rng.range(5, 6.8), h = rng.range(6, 9), roof = r * 0.9;
      solid(B, s, x, base + h / 2, r * 0.72, h / 2, r * 0.72, 'tent');
      solid(B, s, x, base + h + roof * 0.35, r * 0.42, roof * 0.35, r * 0.42, 'tent');
      B.add('tent', { s, x, r, h, roof, base, hue, seed });
    } else if (pick < 0.42) {                // 회전목마 파빌리온 (바닥에 있는 장식용, 천천히 도는 말은 보이기만)
      const r = rng.range(5, 6.5);
      solid(B, s, x, base + 3.4, r * 0.72, 3.4, r * 0.72, 'carousel');
      B.add('pavilion', { s, x, r, base, hue });
    } else if (pick < 0.55) {                // 코스터 루프(세로 고리): 고리 둘레 = 충돌 상자들
      const R = rng.range(5, 6.5), cy = base + R + 1.5;
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6, am = a + Math.PI / 12, hx = R * Math.sin(Math.PI / 12) + 0.2;
        const b = makeBox(x + Math.cos(am) * R, cy + Math.sin(am) * R, -s, hx, 0.35, 0.5, 0, rotZ(am + Math.PI / 2)); b.tag = 'track'; b.sec = B.cur; B.statics.push(b);
      }
      for (const dx of [-R * 0.7, R * 0.7]) solid(B, s, x + dx, base + (R + 1.5) / 2, 0.3, (R + 1.5) / 2, 0.3, 'track');
      B.add('loop', { s, x, R, cy, base, hue });
    } else if (pick < 0.72) {                // 매점 / 기념품 가게
      const hx = rng.range(2.4, 3.6), hz = rng.range(2, 3), h = rng.range(3.4, 4.4);
      solid(B, s, x, base + h / 2, hx, h / 2, hz, 'booth');
      B.add('kiosk', { s, x, hx, hz, h, base, hue, seed, food: rng.pick(['츄러스', '솜사탕', '팝콘', '핫도그', '아이스크림', '기념품', '풍선']) });
    } else if (pick < 0.84) {                // 풍선 가게: 기둥 + 풍선 다발
      solid(B, s, x, base + 3.5, 0.15, 3.5, 0.15, 'pole');
      B.sph(s, x, base + 8, 1.8, 'balloon');
      B.add('balloonpole', { s, x, base, seed });
    } else {                                  // 나무 두 그루
      for (const dz of [-2.5, 2.5]) { solid(B, s + dz, x, base + 1.7, 0.3, 1.7, 0.3, 'tree'); B.sph(s + dz, x, base + 5, 2.3, 'tree'); B.add('tree', { s: s + dz, side, x, base, kind: 'park', seed: seed + dz }); }
    }
  });
}
