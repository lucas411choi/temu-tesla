// 월드: 맵 데이터를 충돌/지면 질의가 가능한 런타임으로 만든다. (서버, 검증도구, 클라이언트 디버그 공용)
//  - createWorld(map): 실제 게임용. 구불구불한 경로(track) 위의 월드 좌표.
//  - createStraightWorld(...): 검증 도구/자동조종용. 경로를 직선으로 '펼친' 좌표 (s = -z).
import { CFG } from './config.js';
import { evalEntity, entityZRange } from './obstacles.js';
import { firstHit, obbMaxAbsX } from './collision.js';
import { Track, shapeToWorld } from './track.js';

const CELL = 24;
let GSTAMP = 0;   // 모든 월드가 공유하는 방문 표식 (맵 객체를 여러 방이 공유해도 안전)

export function createWorld(map) {
  if (!map.route) return createStraightWorld(map);
  if (!map._track) map._track = new Track(map.route, map.platforms || []);
  const track = map._track;
  const sIdx = new Map(), dIdx = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  const put = (idx, b, v) => {
    for (let cx = Math.floor(b[0] / CELL); cx <= Math.floor(b[1] / CELL); cx++) for (let cz = Math.floor(b[2] / CELL); cz <= Math.floor(b[3] / CELL); cz++) {
      const k = key(cx, cz); let a = idx.get(k); if (!a) idx.set(k, a = []); a.push(v);
    }
  };
  for (const s of map.statics) {
    if (s.br === undefined) s.br = s.k === 's' ? s.r : Math.hypot(s.h[0], s.h[1], s.h[2]);
    put(sIdx, [s.c[0] - s.br, s.c[0] + s.br, s.c[2] - s.br, s.c[2] + s.br], s);
  }
  for (const e of map.dynamics) if (e.wb) put(dIdx, e.wb, e);
  const killY = map.floorY !== undefined ? map.floorY + 0.6 : CFG.RULES.killY;
  const tmp = [], tmp2 = [];
  let hint = null;
  const world = {
    map, track, killY,
    groundY(x, y, z) { return track.groundY(x, y === undefined ? 1e6 : y, z); },
    // 고도 기준 = 가장 가까운 경로 노면 (공중에 떠 있어도 경로 높이 기준으로 추력이 줄어든다)
    refY(x, y, z) { const L = track.locate(x, y === undefined ? 0 : y, z, hint); if (!L) return 0; hint = L.s; return L.y; },
    locate(x, y, z, h) { return track.locate(x, y, z, h); },
    wallHalf() { return Infinity; },
    wallTop() { return Infinity; },
    ceilAt(s) { const c = map.ceils || []; for (const q of c) if (s >= q.s0 && s < q.s1) return q.yw !== undefined ? q.yw : q.y; return 0; },
    _stamp: 0,
    // 위치 (x,z) 근처의 치명 도형 수집 (정적 + 시각 T의 동적)
    collect(x, z, T, out, pad = 5) {
      out.length = 0;
      for (let cx = Math.floor((x - pad) / CELL); cx <= Math.floor((x + pad) / CELL); cx++) for (let cz = Math.floor((z - pad) / CELL); cz <= Math.floor((z + pad) / CELL); cz++) {
        const k = key(cx, cz);
        const a = sIdx.get(k);
        if (a) for (let i = 0; i < a.length; i++) { const s = a[i]; if (s._q !== world._stamp) { s._q = world._stamp; out.push(s); } }
        const d = dIdx.get(k);
        if (d) for (let i = 0; i < d.length; i++) {
          const e = d[i];
          if (e._q === world._stamp) continue;
          e._q = world._stamp;
          tmp.length = 0;
          evalEntity(e, T, tmp, null);
          for (let j = 0; j < tmp.length; j++) { const w = shapeToWorld(e.fr, tmp[j]); w.src = e; out.push(w); }
        }
      }
      return out;
    },
    collide(obbs, center, T) {
      world._stamp = ++GSTAMP;
      world.collect(center[0], center[2], T, tmp2, CFG.CAR.boundRadius + 8);
      const h = firstHit(obbs, center, CFG.CAR.boundRadius, tmp2);
      return h ? { tag: h.tag || (h.src && h.src.type) || 'obstacle', src: h.src || null, shape: h } : null;
    },
  };
  return world;
}

// ───────── 직선(펼친) 월드: s = -z, 지면은 s 구간별 ─────────
// map = { statics, dynamics, ground:[{s0,s1,y,y1?,ref?,solid,half,wall}], ceils? }
export function createStraightWorld(map) {
  const sIdx = new Map(), dIdx = new Map();
  const put = (idx, k, v) => { let a = idx.get(k); if (!a) idx.set(k, a = []); a.push(v); };
  for (const s of map.statics) {
    if (s.br === undefined) s.br = s.k === 's' ? s.r : Math.hypot(s.h[0], s.h[1], s.h[2]);
    const lo = Math.floor((s.c[2] - s.br) / CELL), hi = Math.floor((s.c[2] + s.br) / CELL);
    for (let k = lo; k <= hi; k++) put(sIdx, k, s);
  }
  for (const e of map.dynamics) {
    if (!e.zr) e.zr = entityZRange(e);
    const lo = Math.floor(e.zr[0] / CELL), hi = Math.floor(e.zr[1] / CELL);
    for (let k = lo; k <= hi; k++) put(dIdx, k, e);
  }
  const segs = map.ground;
  const segAt = (s) => {
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].s0 <= s) lo = mid; else hi = mid - 1; }
    return segs[lo];
  };
  const tmp = [], tmp2 = [];
  const world = {
    map, killY: map.killY !== undefined ? map.killY : CFG.RULES.killY,
    groundY(x, y, z) {
      if (z === undefined) { z = y; }          // (x, z) 두 인자로 불러도 된다
      const g = segAt(-z);
      if (!g.solid || Math.abs(x) > g.half) return -Infinity;
      if (g.y1 !== undefined) return g.y + (g.y1 - g.y) * Math.min(1, Math.max(0, (-z - g.s0) / (g.s1 - g.s0)));
      return g.y;
    },
    refY(x, y, z) { if (z === undefined) z = y === undefined ? x : y; const g = segAt(-z); return g.ref !== undefined ? g.ref : g.y; },
    wallHalf(z) { return segAt(-z).wall; },
    wallTop() { return Infinity; },
    ceilAt(s) { const c = map.ceils || []; for (const q of c) if (s >= q.s0 && s < q.s1) return q.y; return 0; },
    collect(z, T, out, pad = 5) {
      out.length = 0;
      const lo = Math.floor((z - pad) / CELL), hi = Math.floor((z + pad) / CELL);
      for (let k = lo; k <= hi; k++) {
        const a = sIdx.get(k);
        if (a) for (let i = 0; i < a.length; i++) { const s = a[i]; if (s._q !== world._stamp) { s._q = world._stamp; out.push(s); } }
        const d = dIdx.get(k);
        if (d) for (let i = 0; i < d.length; i++) {
          const e = d[i];
          if (e._q === world._stamp) continue;
          e._q = world._stamp;
          if (e.zr[1] < z - pad || e.zr[0] > z + pad) continue;
          tmp.length = 0;
          evalEntity(e, T, tmp, null);
          for (let j = 0; j < tmp.length; j++) { tmp[j].src = e; out.push(tmp[j]); }
        }
      }
      return out;
    },
    _stamp: 0,
    collide(obbs, center, T) {
      world._stamp = ++GSTAMP;
      const wh = world.wallHalf(center[2]);
      if (wh !== Infinity) for (let i = 0; i < obbs.length; i++) if (obbMaxAbsX(obbs[i]) > wh) return { tag: 'building' };
      world.collect(center[2], T, tmp2, CFG.CAR.boundRadius + 8);
      const h = firstHit(obbs, center, CFG.CAR.boundRadius, tmp2);
      return h ? { tag: h.tag || (h.src && h.src.type) || 'obstacle', src: h.src || null, shape: h } : null;
    },
  };
  return world;
}
