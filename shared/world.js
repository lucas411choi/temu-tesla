// 월드: 맵 데이터를 충돌/지면 질의가 가능한 런타임으로 만든다. (서버, 검증도구, 클라이언트 디버그 공용)
import { CFG } from './config.js';
import { evalEntity, entityZRange } from './obstacles.js';
import { firstHit, obbMaxAbsX } from './collision.js';

const CELL = 24;
let GSTAMP = 0;   // 모든 월드가 공유하는 방문 표식 (맵 객체를 여러 방이 공유해도 안전)

export function createWorld(map) {
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
  const tmp = [];
  const world = {
    map,
    groundY(x, z) {
      const g = segAt(-z);
      if (!g.solid || Math.abs(x) > g.half) return -Infinity;
      if (g.y1 !== undefined) return g.y + (g.y1 - g.y) * Math.min(1, Math.max(0, (-z - g.s0) / (g.s1 - g.s0)));
      return g.y;
    },
    refY(z) { const g = segAt(-z); return g.ref !== undefined ? g.ref : g.y; },
    wallHalf(z) { return segAt(-z).wall; },
    // 위치 z 근처의 치명 도형 수집 (정적 + 시각 T의 동적)
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
          const n0 = out.length;
          tmp.length = 0;
          evalEntity(e, T, tmp, null);
          for (let j = 0; j < tmp.length; j++) { tmp[j].src = e; out.push(tmp[j]); }
        }
      }
      return out;
    },
    _stamp: 0,
    // 차 OBB가 장애물/건물 벽에 닿았는지. 닿았으면 { tag, src } 반환
    collide(obbs, center, T) {
      world._stamp = ++GSTAMP;
      const wh = world.wallHalf(center[2]);
      if (wh !== Infinity) for (let i = 0; i < obbs.length; i++) if (obbMaxAbsX(obbs[i]) > wh) return { tag: 'building' };
      world.collect(center[2], T, tmp2, CFG.CAR.boundRadius + 8);
      const h = firstHit(obbs, center, CFG.CAR.boundRadius, tmp2);
      return h ? { tag: h.tag || (h.src && h.src.type) || 'obstacle', src: h.src || null, shape: h } : null;
    },
  };
  const tmp2 = [];
  return world;
}
